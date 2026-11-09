import { describe, expect, it } from "vitest";
import {
  findFields,
  findPlaceholders,
  findSection,
  parseMarkdown,
  parseTables,
  sectionHasContent,
  splitRow,
} from "../src/markdown.ts";

const doc = parseMarkdown(
  [
    "# 題",
    "<!-- コメント",
    "## 消える見出し -->",
    "## 節 A",
    "",
    "```text",
    "## コード内の見出し",
    "```",
    "### 小節",
    "本文",
    "## 節 B",
    "<!-- 説明だけ -->",
    "## 表",
    "| ID | 名前 |",
    "|---|---|",
    "| CST-1 | a \\| b |",
    "| CST-2 |  |",
    "",
    "- 判定: Go",
    "- **日付**：2026-11-09",
  ].join("\r\n"),
);

describe("parseMarkdown", () => {
  it("コメントとコードブロック内の見出しを無視し、行番号を保つ", () => {
    expect(doc.headings.map((h) => [h.text, h.line])).toEqual([
      ["題", 1],
      ["節 A", 4],
      ["小節", 9],
      ["節 B", 11],
      ["表", 13],
    ]);
  });

  it("節の範囲は同じか上位の見出しの前まで（下位の節を含む）", () => {
    const a = findSection(doc, "節 A");
    expect(a && [a.startLine, a.endLine]).toEqual([5, 10]);
    expect(a && sectionHasContent(doc, a)).toBe(true);
  });

  it("コメントだけの節は空", () => {
    const b = findSection(doc, "節 B");
    expect(b && sectionHasContent(doc, b)).toBe(false);
  });
});

describe("表とフィールド", () => {
  it("表の見出しと行を読む（\\| はセル内の |）", () => {
    const [table] = parseTables(doc);
    expect(table?.header).toEqual(["ID", "名前"]);
    expect(table?.rows.map((r) => r.cells)).toEqual([
      ["CST-1", "a | b"],
      ["CST-2", ""],
    ]);
  });

  it("splitRow は前後の | を除く", () => {
    expect(splitRow("| a | b |")).toEqual(["a", "b"]);
    expect(splitRow("a | b")).toEqual(["a", "b"]);
  });

  it("「- キー: 値」を読む（太字、全角コロンも可）", () => {
    expect(findFields(doc, "判定")[0]?.value).toBe("Go");
    expect(findFields(doc, "日付")[0]?.value).toBe("2026-11-09");
    expect(findFields(doc, "無い")).toEqual([]);
  });

  it("記入欄 {{...}} を見つける", () => {
    expect(findPlaceholders(["a {{x}} b {{y}}", "c"])).toEqual([
      { text: "{{x}}", line: 1 },
      { text: "{{y}}", line: 1 },
    ]);
  });
});
