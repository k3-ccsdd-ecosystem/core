// テンプレート（templates/）と完了条件（rules/）のずれを検出する。

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stripGherkinComments } from "../src/gherkin.ts";
import { findSection, parseMarkdown, parseTables } from "../src/markdown.ts";
import { loadRules } from "../src/run.ts";
import type { ArtifactRule } from "../src/types.ts";
import { cleanup, errorCodes, gate, RULES_DIR, TEMPLATES_DIR, tempDir, write } from "./helpers.ts";

afterEach(cleanup);

const stages = [1, 2];
const rulesOf = (stage: number) => loadRules(RULES_DIR, stage).rules;
const artifactRules = (stage: number): ArtifactRule[] => {
  const r = rulesOf(stage);
  return [...r.artifacts, r.record];
};

describe.each(stages)("段階 %i のテンプレート", (stage) => {
  it.each(artifactRules(stage).map((a) => [a.id, a] as const))(
    "%s: 必須節と表の列がテンプレートにある",
    (_id, a) => {
      expect(a.template, `${a.id} に template がありません`).toBeDefined();
      const path = join(TEMPLATES_DIR, a.template ?? "");
      expect(existsSync(path), path).toBe(true);
      const doc = parseMarkdown(readFileSync(path, "utf8"));
      for (const name of a.sections ?? []) {
        expect(findSection(doc, name), `${a.template} に節「${name}」がありません`).toBeDefined();
      }
      for (const t of a.tables ?? []) {
        const section = findSection(doc, t.section);
        const table =
          section &&
          parseTables(doc, section).find((tb) => t.columns.every((c) => tb.header.includes(c)));
        expect(table, `${a.template} の節「${t.section}」に表がありません`).toBeDefined();
      }
      for (const f of a.fields ?? []) {
        expect(readFileSync(path, "utf8")).toContain(`- ${f.key}:`);
      }
    },
  );

  it("Gherkin のテンプレートがある", () => {
    for (const g of rulesOf(stage).gherkin ?? []) {
      const path = join(TEMPLATES_DIR, g.template ?? "");
      expect(existsSync(path), path).toBe(true);
      const body = stripGherkinComments(readFileSync(path, "utf8")).join("\n");
      expect(body).toContain("Feature:");
      expect(body).toContain("Scenario:");
    }
  });
});

describe("記入前のテンプレート", () => {
  it("そのまま置くと記入欄の残りで不合格になる（例外を出さない）", () => {
    const root = tempDir();
    for (const stage of stages) {
      for (const a of rulesOf(stage).artifacts) {
        if (a.template) write(root, a.path, readFileSync(join(TEMPLATES_DIR, a.template), "utf8"));
      }
      for (const g of rulesOf(stage).gherkin ?? []) {
        const text = readFileSync(join(TEMPLATES_DIR, g.template ?? ""), "utf8");
        write(root, "docs/02-ux/stories/US-1.feature", text);
      }
    }
    for (const stage of stages) {
      const { result } = gate(root, stage);
      expect(result.passed).toBe(false);
      const codes = errorCodes(result);
      expect(codes).toContain("placeholder.remaining");
      expect(codes).not.toContain("section.missing");
    }
  });
});
