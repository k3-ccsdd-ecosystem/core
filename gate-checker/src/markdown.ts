// 成果物の Markdown を、完了条件の検査に必要な範囲だけ解釈する（見出し、節、表、フィールド、記入欄）。

export interface Heading {
  level: number;
  text: string;
  /** 1 始まりの行番号 */
  line: number;
}

export interface Section {
  heading: Heading;
  /** 本文の最初の行（1 始まり） */
  startLine: number;
  /** 本文の最後の行（1 始まり。本文が無ければ startLine - 1） */
  endLine: number;
}

export interface TableRow {
  cells: string[];
  line: number;
}

export interface Table {
  header: string[];
  rows: TableRow[];
  line: number;
}

export interface Field {
  key: string;
  value: string;
  line: number;
}

export interface MarkdownDoc {
  /** HTML コメントを空白に置き換えた行。行番号は元の文書と一致する */
  lines: string[];
  /** 行がコードブロックの内側（区切り行を含む）か */
  inFence: boolean[];
  headings: Heading[];
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const PLACEHOLDER = /\{\{[^{}]*\}\}/g;

/** 改行を LF に揃え、HTML コメントを除く（コメント内の改行は残す） */
export function stripHtmlComments(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
}

export function parseMarkdown(text: string): MarkdownDoc {
  const lines = stripHtmlComments(text).split("\n");
  const inFence: boolean[] = [];
  const headings: Heading[] = [];
  let fence: string | null = null;
  lines.forEach((line, i) => {
    const m = FENCE.exec(line);
    if (fence !== null) {
      inFence.push(true);
      if (m?.[1] && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      return;
    }
    if (m?.[1]) {
      fence = m[1];
      inFence.push(true);
      return;
    }
    inFence.push(false);
    const h = HEADING.exec(line);
    if (h?.[1] && h[2] !== undefined) {
      headings.push({ level: h[1].length, text: h[2].trim(), line: i + 1 });
    }
  });
  return { lines, inFence, headings };
}

export function sectionOf(doc: MarkdownDoc, heading: Heading): Section {
  const idx = doc.headings.indexOf(heading);
  const next = doc.headings.slice(idx + 1).find((h) => h.level <= heading.level);
  return {
    heading,
    startLine: heading.line + 1,
    endLine: next ? next.line - 1 : doc.lines.length,
  };
}

/** 見出しの文字列が name と一致する最初の節 */
export function findSection(doc: MarkdownDoc, name: string): Section | undefined {
  const heading = doc.headings.find((h) => h.text === name);
  return heading ? sectionOf(doc, heading) : undefined;
}

/** 節の本文に、見出し以外の文字があるか */
export function sectionHasContent(doc: MarkdownDoc, section: Section): boolean {
  const headingLines = new Set(doc.headings.map((h) => h.line));
  for (let line = section.startLine; line <= section.endLine; line++) {
    if (headingLines.has(line)) continue;
    if ((doc.lines[line - 1] ?? "").trim() !== "") return true;
  }
  return false;
}

export function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

const isTableLine = (line: string) => /^\s*\|/.test(line);
const isSeparator = (line: string) =>
  isTableLine(line) && splitRow(line).every((c) => /^:?-{3,}:?$/.test(c));

/** 範囲内の表（見出し行 + 区切り行 + 本文行）。範囲を省略すると文書全体 */
export function parseTables(doc: MarkdownDoc, section?: Section): Table[] {
  const start = section ? section.startLine : 1;
  const end = section ? section.endLine : doc.lines.length;
  const tables: Table[] = [];
  let line = start;
  while (line <= end) {
    const text = doc.lines[line - 1] ?? "";
    const next = doc.lines[line] ?? "";
    if (!doc.inFence[line - 1] && isTableLine(text) && line + 1 <= end && isSeparator(next)) {
      const table: Table = { header: splitRow(text), rows: [], line };
      line += 2;
      while (line <= end && !doc.inFence[line - 1] && isTableLine(doc.lines[line - 1] ?? "")) {
        table.rows.push({ cells: splitRow(doc.lines[line - 1] ?? ""), line });
        line++;
      }
      tables.push(table);
      continue;
    }
    line++;
  }
  return tables;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 「- キー: 値」の行（キーは太字でもよい）。範囲を省略すると文書全体 */
export function findFields(doc: MarkdownDoc, key: string, section?: Section): Field[] {
  const re = new RegExp(
    `^\\s*[-*]\\s+(?:\\*\\*)?${escapeRegExp(key)}(?:\\*\\*)?\\s*[:：]\\s*(.*)$`,
  );
  const start = section ? section.startLine : 1;
  const end = section ? section.endLine : doc.lines.length;
  const fields: Field[] = [];
  for (let line = start; line <= end; line++) {
    if (doc.inFence[line - 1]) continue;
    const m = re.exec(doc.lines[line - 1] ?? "");
    if (m) fields.push({ key, value: (m[1] ?? "").trim(), line });
  }
  return fields;
}

/** 埋め忘れの記入欄（{{...}}） */
export function findPlaceholders(lines: string[]): { text: string; line: number }[] {
  const found: { text: string; line: number }[] = [];
  lines.forEach((l, i) => {
    for (const m of l.matchAll(PLACEHOLDER)) found.push({ text: m[0], line: i + 1 });
  });
  return found;
}
