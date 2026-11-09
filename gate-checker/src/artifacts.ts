// 成果物ファイル（Markdown）の検査: 存在、記入欄の残り、必須節、表、フィールド、参照元のパス。

import { posix } from "node:path";
import { exists, pathResolves, readText } from "./files.js";
import {
  findFields,
  findPlaceholders,
  findSection,
  type MarkdownDoc,
  parseMarkdown,
  parseTables,
  sectionHasContent,
} from "./markdown.js";
import type { ArtifactRule, CheckResult, FieldRule, Finding, TableRule } from "./types.js";

/** requiredWhen を評価して、成果物が必須かを返す */
export function isRequired(
  root: string,
  rule: ArtifactRule,
): { required: boolean; reason?: string } {
  const w = rule.requiredWhen;
  if (w) {
    if (!exists(root, w.file)) {
      return {
        required: false,
        reason: `${w.file} が無いため条件「${w.key}: ${w.equals}」を判定できない`,
      };
    }
    const value = findFields(parseMarkdown(readText(root, w.file)), w.key)[0]?.value;
    return value === w.equals
      ? { required: true }
      : { required: false, reason: `${w.file} の「${w.key}」が「${w.equals}」ではない` };
  }
  return { required: rule.required ?? true };
}

export function checkTable(doc: MarkdownDoc, file: string, t: TableRule): Finding[] {
  const findings: Finding[] = [];
  const err = (code: string, message: string, line?: number) =>
    findings.push({ code, severity: "error", message, file, line });
  const section = findSection(doc, t.section);
  if (!section) return findings; // 節の欠落は sections の検査で報告する
  const table = parseTables(doc, section).find((tb) =>
    t.columns.every((c) => tb.header.includes(c)),
  );
  if (!table) {
    err(
      "table.missing",
      `節「${t.section}」に列 ${t.columns.join(" / ")} を持つ表がありません`,
      section.heading.line,
    );
    return findings;
  }
  const minRows = t.minRows ?? 1;
  if (table.rows.length < minRows) {
    err("table.rows.min", `節「${t.section}」の表に ${minRows} 行以上必要です`, table.line);
  }
  const col = (name: string) => table.header.indexOf(name);
  for (const name of t.nonEmpty ?? []) {
    const i = col(name);
    if (i < 0) {
      err("table.column.missing", `節「${t.section}」の表に列「${name}」がありません`, table.line);
      continue;
    }
    for (const row of table.rows) {
      if ((row.cells[i] ?? "") === "") {
        err("table.cell.empty", `節「${t.section}」の表の列「${name}」が空欄です`, row.line);
      }
    }
  }
  for (const [name, allowed] of Object.entries(t.allowedValues ?? {})) {
    const i = col(name);
    if (i < 0) {
      err("table.column.missing", `節「${t.section}」の表に列「${name}」がありません`, table.line);
      continue;
    }
    for (const row of table.rows) {
      const v = row.cells[i] ?? "";
      if (v !== "" && !allowed.includes(v)) {
        err(
          "table.cell.invalid",
          `節「${t.section}」の表の列「${name}」の値「${v}」は ${allowed.join(" / ")} のいずれでもありません`,
          row.line,
        );
      }
    }
  }
  if (t.coverage) {
    const i = col(t.coverage.column);
    if (i < 0) {
      err(
        "table.column.missing",
        `節「${t.section}」の表に列「${t.coverage.column}」がありません`,
        table.line,
      );
      return findings;
    }
    const values = new Set(table.rows.map((r) => r.cells[i] ?? ""));
    for (const v of t.coverage.values) {
      if (!values.has(v)) {
        err(
          "table.coverage.missing",
          `節「${t.section}」の表の列「${t.coverage.column}」に「${v}」の行がありません`,
          table.line,
        );
      }
    }
  }
  return findings;
}

export function checkField(doc: MarkdownDoc, file: string, f: FieldRule): Finding[] {
  const found = findFields(doc, f.key)[0];
  const finding = (code: string, message: string): Finding[] => [
    { code, severity: "error", message, file, line: found?.line },
  ];
  if (!found || found.value === "")
    return finding("field.missing", `「- ${f.key}: 値」がありません`);
  if (f.oneOf && !f.oneOf.includes(found.value)) {
    return finding(
      "field.invalid",
      `「${f.key}」の値「${found.value}」は ${f.oneOf.join(" / ")} のいずれでもありません`,
    );
  }
  if (f.pattern && !new RegExp(f.pattern).test(found.value)) {
    return finding(
      "field.invalid",
      `「${f.key}」の値「${found.value}」が形式 ${f.pattern} に合いません`,
    );
  }
  return [];
}

const looksLikePath = (p: string) =>
  p !== "" &&
  !/\s/.test(p) &&
  !/^[a-z][a-z0-9+.-]*:/i.test(p) &&
  (p.includes("/") || /\.(md|feature|json|ya?ml)$/.test(p));

/** 参照元の節に書いたパス。`…` はルートからの相対、[…](…) は文書の位置からの相対 */
export function sourcePaths(
  doc: MarkdownDoc,
  file: string,
  sectionName: string,
): { path: string; line: number }[] {
  const section = findSection(doc, sectionName);
  if (!section) return [];
  const out: { path: string; line: number }[] = [];
  for (let line = section.startLine; line <= section.endLine; line++) {
    const text = doc.lines[line - 1] ?? "";
    for (const m of text.matchAll(/`([^`]+)`/g)) {
      const p = (m[1] ?? "").replace(/[#@].*$/, "");
      if (looksLikePath(p)) out.push({ path: posix.normalize(p), line });
    }
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const p = (m[1] ?? "").replace(/#.*$/, "");
      if (looksLikePath(p)) {
        out.push({ path: posix.normalize(posix.join(posix.dirname(file), p)), line });
      }
    }
  }
  return out;
}

export function finalize(result: CheckResult): CheckResult {
  if (result.status !== "skip") {
    result.status = result.findings.some((f) => f.severity === "error") ? "fail" : "pass";
  }
  return result;
}

/** 成果物 1 件の検査。ファイルが無く必須でなければ skip */
export function checkArtifact(
  root: string,
  rule: ArtifactRule,
  idPrefix = "artifact",
): CheckResult {
  const result: CheckResult = {
    id: `${idPrefix}:${rule.id}`,
    title: `${rule.subitem} ${rule.title}`,
    target: rule.path,
    status: "pass",
    findings: [],
  };
  const { required, reason } = isRequired(root, rule);
  const file = rule.path;
  if (!exists(root, file)) {
    if (required) {
      result.findings.push({
        code: "file.missing",
        severity: "error",
        message: `${rule.title}（${file}）がありません`,
        file,
      });
    } else {
      result.status = "skip";
      result.reason = reason ?? "任意の成果物で、ファイルが無い";
    }
    return finalize(result);
  }
  const doc = parseMarkdown(readText(root, file));
  const err = (code: string, message: string, line?: number) =>
    result.findings.push({ code, severity: "error", message, file, line });

  for (const p of findPlaceholders(doc.lines)) {
    err("placeholder.remaining", `記入欄 ${p.text} が残っています`, p.line);
  }
  for (const name of rule.sections ?? []) {
    const s = findSection(doc, name);
    if (!s) err("section.missing", `必須の節「${name}」がありません`);
    else if (!sectionHasContent(doc, s))
      err("section.empty", `節「${name}」が空です`, s.heading.line);
  }
  for (const t of rule.tables ?? []) result.findings.push(...checkTable(doc, file, t));
  for (const f of rule.fields ?? []) result.findings.push(...checkField(doc, file, f));
  if (rule.sourceSection) {
    for (const p of sourcePaths(doc, file, rule.sourceSection)) {
      if (!pathResolves(root, p.path)) {
        err("path.unresolved", `参照元のパス ${p.path} が存在しません`, p.line);
      }
    }
  }
  return finalize(result);
}
