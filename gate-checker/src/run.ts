// 完了条件の読み込みから判定結果（gate-<n>.result.json）の書き出しまで。

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkArtifact, finalize } from "./artifacts.js";
import { globFiles, matchesAny, readText } from "./files.js";
import { checkFeature, stripGherkinComments } from "./gherkin.js";
import {
  type Definition,
  IdClassifier,
  type IdToken,
  isDefinitionToken,
  markdownDefinitions,
} from "./ids.js";
import { findFields, findSection, type MarkdownDoc, parseMarkdown } from "./markdown.js";
import {
  type CheckResult,
  ConfigError,
  type Finding,
  type GateResult,
  type IdConfig,
  type StageRules,
} from "./types.js";
import { TOOL_NAME, TOOL_VERSION } from "./version.js";

export interface RunOptions {
  stage: number;
  /** 対象リポジトリのルート */
  root: string;
  /** ids.json と stage-<n>.json を置いたディレクトリ */
  rulesDir: string;
  /** 判定記録（gates/gate-<n>.md）も検査する */
  record?: boolean;
  /** gates/gate-<n>.result.json を書く（既定 true） */
  write?: boolean;
  now?: Date;
}

export interface RunOutput {
  result: GateResult;
  /** 書き出したファイル（ルートからの相対パス） */
  written?: string;
}

function readJson<T>(path: string): T {
  if (!existsSync(path)) throw new ConfigError(`完了条件のファイルがありません: ${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (e) {
    throw new ConfigError(`完了条件のファイルを JSON として読めません: ${path}: ${String(e)}`);
  }
}

export function loadRules(
  rulesDir: string,
  stage: number,
): { rules: StageRules; ids: IdConfig; rulesFile: string } {
  const ids = readJson<IdConfig>(join(rulesDir, "ids.json"));
  const rulesFile = `stage-${stage}.json`;
  const rules = readJson<StageRules>(join(rulesDir, rulesFile));
  const problems: string[] = [];
  if (!Array.isArray(ids.prefixes) || typeof ids.kinds !== "object") {
    problems.push("ids.json に prefixes と kinds が必要です");
  }
  if (rules.stage !== stage) problems.push(`${rulesFile} の stage が ${stage} ではありません`);
  for (const key of ["gate", "title"] as const) {
    if (typeof rules[key] !== "string") problems.push(`${rulesFile} に ${key} が必要です`);
  }
  for (const key of ["scan", "artifacts", "definitions"] as const) {
    if (!Array.isArray(rules[key])) problems.push(`${rulesFile} に配列 ${key} が必要です`);
  }
  if (typeof rules.record?.path !== "string")
    problems.push(`${rulesFile} に record.path が必要です`);
  const kinds = new Set(Object.keys(ids.kinds ?? {}));
  const usedKinds = [
    ...(rules.definitions ?? []).map((d) => d.kind),
    ...(rules.coverage ?? []).flatMap((c) => [c.each, ...(c.contextReferences ?? [])]),
    ...(rules.gherkin ?? []).flatMap((g) => [g.featureIdKind, g.scenarioIdKind]),
  ];
  for (const k of usedKinds)
    if (!kinds.has(k)) problems.push(`ID の種類 ${k} が ids.json にありません`);
  if (problems.length > 0) throw new ConfigError(problems.join("\n"));
  return { rules, ids, rulesFile };
}

/** US-2 < US-10 の順に並べる */
export function compareIds(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true });
}

function check(id: string, title: string, findings: Finding[], target?: string): CheckResult {
  return finalize({ id, title, target, status: "pass", findings });
}

interface IdScan {
  /** 構文エラーのファイルを除いた ID（形式の検査には allTokens を使う） */
  tokens: IdToken[];
  allTokens: IdToken[];
  definitions: Definition[];
  docs: Map<string, MarkdownDoc>;
}

function scanIds(
  root: string,
  rules: StageRules,
  classifier: IdClassifier,
  featureLines: Map<string, string[]>,
  featureDefs: Definition[],
  broken: Set<string>,
): IdScan {
  const tokens: IdToken[] = [];
  const definitions: Definition[] = [...featureDefs];
  const docs = new Map<string, MarkdownDoc>();
  for (const file of globFiles(root, rules.scan)) {
    const text = readText(root, file);
    if (file.endsWith(".feature")) {
      tokens.push(...classifier.tokens(file, featureLines.get(file) ?? stripGherkinComments(text)));
      continue;
    }
    const doc = parseMarkdown(text);
    docs.set(file, doc);
    const fileTokens = classifier.tokens(file, doc.lines);
    tokens.push(...fileTokens);
    const kinds = new Set(
      rules.definitions.filter((d) => matchesAny(file, d.files)).map((d) => d.kind),
    );
    if (kinds.size > 0) definitions.push(...markdownDefinitions(file, doc, fileTokens, kinds));
  }
  return {
    tokens: tokens.filter((t) => !broken.has(t.file)),
    allTokens: tokens,
    definitions,
    docs,
  };
}

function idChecks(rules: StageRules, scan: IdScan): CheckResult[] {
  const { tokens, definitions } = scan;
  const results: CheckResult[] = [];

  const format: Finding[] = scan.allTokens
    .filter((t) => t.kind === null)
    .map((t) => ({
      code: "id.format",
      severity: "error",
      message: `ID の形式が不正です: ${t.id}（形式は .ccsdd/docs/ids.md）`,
      file: t.file,
      line: t.line,
    }));
  results.push(check("ids:format", "ID の形式", format));

  const first = new Map<string, Definition>();
  const duplicate: Finding[] = [];
  for (const d of definitions) {
    const prev = first.get(d.id);
    if (prev) {
      duplicate.push({
        code: "id.duplicate",
        severity: "error",
        message: `ID ${d.id} が重複して定義されています（最初の定義: ${prev.file}:${prev.line}）`,
        file: d.file,
        line: d.line,
      });
    } else first.set(d.id, d);
  }
  results.push(check("ids:duplicate", "ID の重複", duplicate));

  const references = tokens.filter((t) => t.kind !== null && !isDefinitionToken(t, definitions));
  const unresolved: Finding[] = references
    .filter((t) => !first.has(t.id))
    .map((t) => ({
      code: "id.unresolved",
      severity: "error",
      message: `参照先の ID ${t.id} が定義されていません`,
      file: t.file,
      line: t.line,
    }));
  results.push(check("ids:unresolved", "ID 参照の解決", unresolved));

  for (const c of rules.coverage ?? []) {
    const severity = c.severity ?? "error";
    const findings: Finding[] = [];
    const inSection = (t: IdToken) => {
      if (!c.inSection) return true;
      const doc = scan.docs.get(t.file);
      const s = doc ? findSection(doc, c.inSection) : undefined;
      return s !== undefined && t.line >= s.startLine && t.line <= s.endLine;
    };
    const where = (files: string[]) =>
      `${files.join(", ")}${c.inSection ? ` の節「${c.inSection}」` : ""}`;
    for (const d of first.values()) {
      if (d.kind !== c.each) continue;
      if (c.referencedIn) {
        const referenced = references.some(
          (t) => t.id === d.id && matchesAny(t.file, c.referencedIn ?? []) && inSection(t),
        );
        if (!referenced) {
          findings.push({
            code: "id.coverage",
            severity,
            message: `${d.id} が ${where(c.referencedIn)} で参照されていません`,
            file: d.file,
            line: d.line,
          });
        }
      }
      for (const kind of c.contextReferences ?? []) {
        const inRange = tokens.some(
          (t) =>
            t.file === d.file &&
            t.line >= d.range[0] &&
            t.line <= d.range[1] &&
            !(t.line === d.line && t.id === d.id) &&
            t.kind === kind,
        );
        if (!inRange) {
          findings.push({
            code: "id.context",
            severity,
            message: `${d.id} の定義（${d.file}:${d.range[0]}-${d.range[1]}）に ${kind} の参照がありません`,
            file: d.file,
            line: d.line,
          });
        }
      }
    }
    results.push(check(`coverage:${c.id}`, c.title, findings));
  }
  return results;
}

function checkRecord(root: string, rules: StageRules, artifactsPassed: boolean): CheckResult {
  const rule = rules.record;
  const result = checkArtifact(root, { ...rule, required: true }, "record");
  if (!existsSync(join(root, rule.path))) return result;
  const doc = parseMarkdown(readText(root, rule.path));
  const title = doc.headings.find((h) => h.level === 1);
  if (!title || !new RegExp(`^${rules.gate}(?:[:：\\s]|$)`).test(title.text)) {
    result.findings.push({
      code: "record.gate.id",
      severity: "error",
      message: `判定記録の題（# 見出し）が ${rules.gate} で始まっていません`,
      file: rule.path,
      line: title?.line,
    });
  }
  const decision = findFields(doc, rule.decisionKey)[0];
  if (decision && rule.decisionsRequiringPass.includes(decision.value) && !artifactsPassed) {
    result.findings.push({
      code: "record.decision.inconsistent",
      severity: "error",
      message: `判定が「${decision.value}」ですが、成果物の機械チェックが不合格です`,
      file: rule.path,
      line: decision.line,
    });
  }
  return finalize(result);
}

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export const resultPath = (stage: number) => `gates/gate-${stage}.result.json`;

export function runGate(options: RunOptions): RunOutput {
  const { stage, root } = options;
  const { rules, ids, rulesFile } = loadRules(options.rulesDir, stage);
  const classifier = new IdClassifier(ids);
  // 成果物の検査は小項目の順に並べる
  const bySubitem: { subitem: string; check: CheckResult }[] = [];

  for (const a of rules.artifacts)
    bySubitem.push({ subitem: a.subitem, check: checkArtifact(root, a) });

  const featureLines = new Map<string, string[]>();
  const featureDefs: Definition[] = [];
  const broken = new Set<string>();
  for (const g of rules.gherkin ?? []) {
    const files = globFiles(root, [g.files]);
    const findings: Finding[] = [];
    if (files.length < (g.minFiles ?? 1)) {
      findings.push({
        code: "gherkin.files.min",
        severity: "error",
        message: `${g.files} に一致するファイルが ${g.minFiles ?? 1} 件以上必要です（${files.length} 件）`,
      });
    }
    for (const file of files) {
      const r = checkFeature(g, file, readText(root, file), classifier);
      findings.push(...r.findings);
      featureDefs.push(...r.definitions);
      featureLines.set(file, r.lines);
      if (r.broken) broken.add(file);
    }
    bySubitem.push({
      subitem: g.subitem,
      check: check(`gherkin:${g.id}`, `${g.subitem} ${g.title}`, findings, g.files),
    });
  }
  const checks = bySubitem.sort((a, b) => compareIds(a.subitem, b.subitem)).map((x) => x.check);

  const scan = scanIds(root, rules, classifier, featureLines, featureDefs, broken);
  checks.push(...idChecks(rules, scan));

  const artifactsPassed = checks.every((c) => c.status !== "fail");
  if (options.record) checks.push(checkRecord(root, rules, artifactsPassed));

  const out = resultPath(stage);
  const commit = git(root, ["rev-parse", "HEAD"]);
  const status = git(root, ["status", "--porcelain", "--", ".", `:(exclude)${out}`]);
  const findings = checks.flatMap((c) => c.findings);
  const defined: Record<string, string[]> = {};
  for (const id of new Set(scan.definitions.map((d) => d.id))) {
    const kind = classifier.classify(id) ?? "unknown";
    defined[kind] = [...(defined[kind] ?? []), id];
  }
  for (const k of Object.keys(defined)) defined[k]?.sort(compareIds);

  const result: GateResult = {
    schemaVersion: 1,
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    stage,
    gate: rules.gate,
    title: rules.title,
    mode: options.record ? "record" : "artifacts",
    checkedAt: (options.now ?? new Date()).toISOString(),
    commit,
    dirty: status === null ? null : status !== "",
    rules: rulesFile,
    passed: checks.every((c) => c.status !== "fail"),
    summary: {
      checks: checks.length,
      failed: checks.filter((c) => c.status === "fail").length,
      skipped: checks.filter((c) => c.status === "skip").length,
      errors: findings.filter((f) => f.severity === "error").length,
      warnings: findings.filter((f) => f.severity === "warning").length,
    },
    checks,
    ids: defined,
  };

  if (options.write === false) return { result };
  mkdirSync(join(root, "gates"), { recursive: true });
  writeFileSync(join(root, out), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return { result, written: out };
}
