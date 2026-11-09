// 受け入れ条件（.feature）の構文と、Feature / Scenario のタグによる ID の定義を検査する。

import { basename } from "node:path";
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin";
import { type GherkinDocument, IdGenerator, type Scenario, type Step } from "@cucumber/messages";
import type { Definition, IdClassifier } from "./ids.js";
import { findPlaceholders } from "./markdown.js";
import type { Finding, GherkinRule } from "./types.js";

export interface FeatureCheck {
  /** 構文エラーで解釈できなかった */
  broken: boolean;
  findings: Finding[];
  definitions: Definition[];
  /** コメント行を空白にした行（ID の検出に使う） */
  lines: string[];
}

interface LocatedError {
  message: string;
  location?: { line: number };
}

/** Gherkin のコメント行（# で始まる行）を空白に置き換える。# language: も含む */
export function stripGherkinComments(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => (/^\s*#/.test(l) ? "" : l));
}

function parse(text: string): { doc?: GherkinDocument; errors: LocatedError[] } {
  const parser = new Parser(
    new AstBuilder(IdGenerator.incrementing()),
    new GherkinClassicTokenMatcher(),
  );
  try {
    return { doc: parser.parse(text), errors: [] };
  } catch (e) {
    const err = e as { errors?: LocatedError[]; message?: string; location?: { line: number } };
    const errors = err.errors?.length
      ? err.errors
      : [{ message: err.message ?? String(e), location: err.location }];
    return { errors };
  }
}

function scenariosOf(doc: GherkinDocument): { scenario: Scenario; background: Step[] }[] {
  const out: { scenario: Scenario; background: Step[] }[] = [];
  const featureBg: Step[] = [];
  for (const child of doc.feature?.children ?? []) {
    if (child.background) featureBg.push(...child.background.steps);
    if (child.scenario) out.push({ scenario: child.scenario, background: featureBg });
    if (child.rule) {
      const ruleBg: Step[] = [...featureBg];
      for (const rc of child.rule.children) {
        if (rc.background) ruleBg.push(...rc.background.steps);
        if (rc.scenario) out.push({ scenario: rc.scenario, background: ruleBg });
      }
    }
  }
  return out;
}

/** And / But を直前のステップの種類に読み替える */
function stepTypes(steps: readonly Step[]): string[] {
  const types: string[] = [];
  let last = "Unknown";
  for (const s of steps) {
    const t = s.keywordType ?? "Unknown";
    if (t === "Conjunction") types.push(last);
    else {
      types.push(t);
      last = t;
    }
  }
  return types;
}

export function checkFeature(
  rule: GherkinRule,
  file: string,
  text: string,
  ids: IdClassifier,
): FeatureCheck {
  const findings: Finding[] = [];
  const definitions: Definition[] = [];
  const lines = stripGherkinComments(text);
  const totalLines = lines.length;
  const err = (code: string, message: string, line?: number) =>
    findings.push({ code, severity: "error", message, file, line });

  for (const p of findPlaceholders(lines)) {
    err("placeholder.remaining", `記入欄 ${p.text} が残っています`, p.line);
  }
  const { doc, errors } = parse(text);
  if (!doc) {
    for (const e of errors)
      err("gherkin.syntax", `Gherkin の構文エラー: ${e.message}`, e.location?.line);
    return { broken: true, findings, definitions, lines };
  }
  const feature = doc.feature;
  if (!feature) {
    err("gherkin.feature.missing", "Feature がありません");
    return { broken: false, findings, definitions, lines };
  }

  const tagIds = (tags: readonly { name: string; location: { line: number } }[], kind: string) =>
    tags
      .map((t) => ({ id: t.name.replace(/^@/, ""), line: t.location.line }))
      .filter((t) => ids.classify(t.id) === kind);

  const storyTags = tagIds(feature.tags, rule.featureIdKind);
  let storyId: string | undefined;
  if (storyTags.length !== 1) {
    err(
      "gherkin.feature.tag",
      `Feature に ${rule.featureIdKind} の ID タグがちょうど 1 つ必要です（${storyTags.length} 個）`,
      feature.location.line,
    );
  } else {
    const tag = storyTags[0] as { id: string; line: number };
    storyId = tag.id;
    definitions.push({
      id: tag.id,
      kind: rule.featureIdKind,
      file,
      line: tag.line,
      range: [1, totalLines],
    });
    const name = basename(file).replace(/\.feature$/, "");
    if (rule.fileNameMatchesId && name !== storyId) {
      err(
        "gherkin.filename",
        `ファイル名 ${name}.feature が Feature の ID ${storyId} と一致しません`,
      );
    }
  }

  const scenarios = scenariosOf(doc);
  if (scenarios.length < (rule.minScenarios ?? 1)) {
    err(
      "gherkin.scenarios.min",
      `受け入れ条件（Scenario）が ${rule.minScenarios ?? 1} 件以上必要です（${scenarios.length} 件）`,
      feature.location.line,
    );
  }

  const starts = scenarios.map(({ scenario }) =>
    Math.min(scenario.location.line, ...scenario.tags.map((t) => t.location.line)),
  );
  scenarios.forEach(({ scenario, background }, i) => {
    const label = `Scenario「${scenario.name}」`;
    const acTags = tagIds(scenario.tags, rule.scenarioIdKind);
    if (acTags.length !== 1) {
      err(
        "gherkin.scenario.tag",
        `${label} に ${rule.scenarioIdKind} の ID タグがちょうど 1 つ必要です（${acTags.length} 個）`,
        scenario.location.line,
      );
    } else {
      const tag = acTags[0] as { id: string; line: number };
      if (storyId && !tag.id.startsWith(`${storyId}-`)) {
        err(
          "gherkin.scenario.tag",
          `${label} の ID ${tag.id} が Feature の ID ${storyId} に対応しません`,
          tag.line,
        );
      }
      const end = (starts[i + 1] ?? totalLines + 1) - 1;
      definitions.push({
        id: tag.id,
        kind: rule.scenarioIdKind,
        file,
        line: tag.line,
        range: [starts[i] ?? scenario.location.line, end],
      });
    }
    const types = new Set([...stepTypes(background), ...stepTypes(scenario.steps)]);
    const missing = (rule.requireStepTypes ?? []).filter((t) => !types.has(t));
    if (missing.length > 0) {
      const names: Record<string, string> = {
        Context: "Given",
        Action: "When",
        Outcome: "Then",
      };
      err(
        "gherkin.scenario.steps",
        `${label} に ${missing.map((m) => names[m] ?? m).join(" / ")} のステップがありません`,
        scenario.location.line,
      );
    }
  });

  return { broken: false, findings, definitions, lines };
}
