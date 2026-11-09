import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { globToRegExp } from "../src/files.ts";
import { IdClassifier, markdownDefinitions } from "../src/ids.ts";
import { parseMarkdown } from "../src/markdown.ts";
import type { IdConfig } from "../src/types.ts";
import { RULES_DIR } from "./helpers.ts";

const config = JSON.parse(readFileSync(join(RULES_DIR, "ids.json"), "utf8")) as IdConfig;
const ids = new IdClassifier(config);
const found = (text: string) => ids.tokens("x.md", [text]).map((t) => [t.id, t.kind]);

describe("ID の検出と形式", () => {
  it("D24 の全接頭辞を正しい形式として分類する", () => {
    for (const p of [
      "CST",
      "PER",
      "US",
      "SCR",
      "API",
      "SEQ",
      "NFR",
      "RES",
      "SLI",
      "ALT",
      "THR",
      "TST",
      "E2E",
    ]) {
      expect(ids.classify(`${p}-1`)).toBe(p);
      expect(ids.classify(`${p}-12`)).toBe(p);
    }
    expect(ids.classify("US-3-AC2")).toBe("US-AC");
    expect(ids.classify("GATE-1")).toBe("GATE");
    expect(ids.classify("GATE-12")).toBe("GATE");
  });

  it("ゼロ埋め、0 番、範囲外の判定番号、AC の欠けは形式違反", () => {
    for (const bad of [
      "CST-01",
      "CST-0",
      "US-1-AC",
      "US-1-AC01",
      "US-1-2",
      "GATE-13",
      "SCR-1a",
      "E2E-01",
    ]) {
      expect(found(`参照 ${bad} です`)).toEqual([[bad, null]]);
    }
  });

  it("日本語や記号に隣接していても拾い、接頭辞でないものは拾わない", () => {
    expect(found("（US-1、US-2-AC1）と@PER-3の画面SCR-4")).toEqual([
      ["US-1", "US"],
      ["US-2-AC1", "US-AC"],
      ["PER-3", "PER"],
      ["SCR-4", "SCR"],
    ]);
    expect(found("SHA-256 と UTF-8、us-east-1、XUS-1、API-first")).toEqual([]);
    // 数字を含む接頭辞 E2E
    expect(found("E2E-3 を参照。E2E テストと E2E-test は ID ではない")).toEqual([["E2E-3", "E2E"]]);
  });
});

describe("Markdown の定義位置", () => {
  const doc = parseMarkdown(
    [
      "## ペルソナ",
      "### PER-1: 佐藤",
      "- 制約: CST-1",
      "### ジャーニー: PER-1",
      "| ID | 観点 |",
      "|---|---|",
      "| CST-1 | 認証 |",
      "",
      "| 遷移元 | 遷移先 |",
      "|---|---|",
      "| SCR-1 | SCR-2 |",
    ].join("\n"),
  );
  const tokens = ids.tokens("p.md", doc.lines);

  it("見出しの先頭と、第 1 列が ID の表の第 1 列だけを定義にする", () => {
    const defs = markdownDefinitions("p.md", doc, tokens, new Set(["PER", "CST", "SCR"]));
    expect(defs.map((d) => [d.id, d.line, d.range])).toEqual([
      ["PER-1", 2, [2, 3]],
      ["CST-1", 7, [7, 7]],
    ]);
  });

  it("定義の種類に含まれない ID は定義にしない", () => {
    expect(markdownDefinitions("p.md", doc, tokens, new Set(["CST"])).map((d) => d.id)).toEqual([
      "CST-1",
    ]);
  });
});

describe("globToRegExp", () => {
  it("** は 0 個以上のディレクトリ、* は 1 階層", () => {
    expect(globToRegExp("docs/**/*.md").test("docs/a.md")).toBe(true);
    expect(globToRegExp("docs/**/*.md").test("docs/x/y/a.md")).toBe(true);
    expect(globToRegExp("docs/*.feature").test("docs/x/a.feature")).toBe(false);
    expect(
      globToRegExp("docs/02-ux/stories/*.feature").test("docs/02-ux/stories/US-1.feature"),
    ).toBe(true);
  });
});
