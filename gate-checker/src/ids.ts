// ID の検出、形式の判定、定義と参照の区別。

import { type MarkdownDoc, parseTables, sectionOf } from "./markdown.js";
import type { IdConfig } from "./types.js";

export interface IdToken {
  id: string;
  /** IdConfig.kinds のキー。形式に合わなければ null */
  kind: string | null;
  file: string;
  line: number;
  /** 1 始まりの列 */
  column: number;
}

export interface Definition {
  id: string;
  kind: string;
  file: string;
  line: number;
  /** 定義範囲（行番号、両端を含む）。表の行、見出しの節、Feature 全体、Scenario */
  range: [number, number];
}

export class IdClassifier {
  readonly #kinds: [string, RegExp][];
  readonly tokenPattern: RegExp;

  constructor(config: IdConfig) {
    this.#kinds = Object.entries(config.kinds).map(([k, v]) => [k, new RegExp(v.pattern)]);
    const prefixes = [...config.prefixes].sort((a, b) => b.length - a.length).join("|");
    // 接頭辞の直後が「-数字」のものを ID 候補とする。末尾は ASCII の英数字と「-英数字」の連続
    this.tokenPattern = new RegExp(
      `(?<![A-Za-z0-9_])(?:${prefixes})-[0-9][0-9A-Za-z]*(?:-[0-9A-Za-z]+)*`,
      "g",
    );
  }

  classify(id: string): string | null {
    for (const [kind, re] of this.#kinds) if (re.test(id)) return kind;
    return null;
  }

  tokens(file: string, lines: string[]): IdToken[] {
    const found: IdToken[] = [];
    lines.forEach((text, i) => {
      for (const m of text.matchAll(this.tokenPattern)) {
        found.push({
          id: m[0],
          kind: this.classify(m[0]),
          file,
          line: i + 1,
          column: (m.index ?? 0) + 1,
        });
      }
    });
    return found;
  }
}

/**
 * Markdown の定義位置にある ID。
 * - 見出しの先頭の ID（例: `### PER-1: 佐藤`）。範囲はその節
 * - 第 1 列の見出しが「ID」の表の第 1 列（例: `| CST-1 | 認証方式 | … |`）。範囲はその行
 */
export function markdownDefinitions(
  file: string,
  doc: MarkdownDoc,
  tokens: IdToken[],
  kinds: Set<string>,
): Definition[] {
  const defs: Definition[] = [];
  const firstToken = (line: number) =>
    tokens.filter((t) => t.line === line).sort((a, b) => a.column - b.column)[0];
  for (const h of doc.headings) {
    const t = firstToken(h.line);
    if (!t?.kind || !kinds.has(t.kind)) continue;
    if (!new RegExp(`^${t.id}(?:[:：\\s]|$)`).test(h.text)) continue;
    const s = sectionOf(doc, h);
    defs.push({ id: t.id, kind: t.kind, file, line: h.line, range: [h.line, s.endLine] });
  }
  for (const table of parseTables(doc)) {
    if (table.header[0] !== "ID") continue;
    for (const row of table.rows) {
      const t = firstToken(row.line);
      if (!t?.kind || !kinds.has(t.kind) || row.cells[0] !== t.id) continue;
      defs.push({ id: t.id, kind: t.kind, file, line: row.line, range: [row.line, row.line] });
    }
  }
  return defs;
}

export const isDefinitionToken = (t: IdToken, defs: Definition[]) =>
  defs.some((d) => d.file === t.file && d.line === t.line && d.id === t.id);
