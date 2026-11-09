#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// gate-checker/src/cli.ts
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// gate-checker/src/report.ts
var LABEL = { pass: "合格", fail: "不合格", skip: "対象外" };
function formatText(result, written) {
  const lines = [];
  lines.push(`gate-check: 段階 ${result.stage}（${result.gate} ${result.title}）`);
  lines.push(
    `commit: ${result.commit ?? "（git 管理外）"}${result.dirty ? "（未コミットの変更あり）" : ""}`
  );
  for (const c of result.checks) {
    const target = c.target ? ` ${c.target}` : "";
    lines.push(`[${LABEL[c.status]}] ${c.title}${target}${c.reason ? `（${c.reason}）` : ""}`);
    for (const f of c.findings) {
      const where = f.file ? ` ${f.file}${f.line ? `:${f.line}` : ""}` : "";
      lines.push(`  - ${f.severity} ${f.code}${where} ${f.message}`);
    }
  }
  const s = result.summary;
  lines.push(
    `結果: ${result.passed ? "合格" : "不合格"}（検査 ${s.checks}、不合格 ${s.failed}、対象外 ${s.skipped}、エラー ${s.errors}、警告 ${s.warnings}）`
  );
  if (written) lines.push(`書き出し: ${written}`);
  return lines.join("\n");
}

// gate-checker/src/run.ts
import { execFileSync } from "node:child_process";
import { existsSync as existsSync2, mkdirSync, readFileSync as readFileSync2, writeFileSync } from "node:fs";
import { join as join2 } from "node:path";

// gate-checker/src/artifacts.ts
import { posix } from "node:path";

// gate-checker/src/files.ts
import { existsSync, globSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
var toPosix = (p) => p.replace(/\\/g, "/");
function globFiles(root, patterns) {
  const out = /* @__PURE__ */ new Set();
  for (const pattern of patterns) {
    for (const p of globSync(pattern, { cwd: root })) {
      const rel = toPosix(p);
      if (statSync(join(root, rel)).isFile()) out.add(rel);
    }
  }
  return [...out].sort();
}
var exists = (root, rel) => existsSync(join(root, rel));
var readText = (root, rel) => readFileSync(join(root, rel), "utf8");
var isGlob = (p) => /[*?[\]{}]/.test(p);
function pathResolves(root, rel) {
  if (isGlob(rel)) return globSync(rel, { cwd: root }).length > 0;
  return exists(root, rel);
}
function matchesAny(rel, patterns) {
  return patterns.some((p) => globToRegExp(p).test(rel));
}
var REGEXP_SPECIAL = /* @__PURE__ */ new Set([".", "+", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"]);
function globToRegExp(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern.charAt(i);
    if (c === "*") {
      if (pattern.charAt(i + 1) === "*") {
        if (pattern.charAt(i + 2) === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += REGEXP_SPECIAL.has(c) ? `\\${c}` : c;
  }
  return new RegExp(`^${re}$`);
}

// gate-checker/src/markdown.ts
var FENCE = /^\s{0,3}(`{3,}|~{3,})/;
var HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
var PLACEHOLDER = /\{\{[^{}]*\}\}/g;
function stripHtmlComments(text) {
  return text.replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
}
function parseMarkdown(text) {
  const lines = stripHtmlComments(text).split("\n");
  const inFence = [];
  const headings = [];
  let fence = null;
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
    if (h?.[1] && h[2] !== void 0) {
      headings.push({ level: h[1].length, text: h[2].trim(), line: i + 1 });
    }
  });
  return { lines, inFence, headings };
}
function sectionOf(doc, heading) {
  const idx = doc.headings.indexOf(heading);
  const next = doc.headings.slice(idx + 1).find((h) => h.level <= heading.level);
  return {
    heading,
    startLine: heading.line + 1,
    endLine: next ? next.line - 1 : doc.lines.length
  };
}
function findSection(doc, name) {
  const heading = doc.headings.find((h) => h.text === name);
  return heading ? sectionOf(doc, heading) : void 0;
}
function sectionHasContent(doc, section) {
  const headingLines = new Set(doc.headings.map((h) => h.line));
  for (let line = section.startLine; line <= section.endLine; line++) {
    if (headingLines.has(line)) continue;
    if ((doc.lines[line - 1] ?? "").trim() !== "") return true;
  }
  return false;
}
function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}
var isTableLine = (line) => /^\s*\|/.test(line);
var isSeparator = (line) => isTableLine(line) && splitRow(line).every((c) => /^:?-{3,}:?$/.test(c));
function parseTables(doc, section) {
  const start = section ? section.startLine : 1;
  const end = section ? section.endLine : doc.lines.length;
  const tables = [];
  let line = start;
  while (line <= end) {
    const text = doc.lines[line - 1] ?? "";
    const next = doc.lines[line] ?? "";
    if (!doc.inFence[line - 1] && isTableLine(text) && line + 1 <= end && isSeparator(next)) {
      const table = { header: splitRow(text), rows: [], line };
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
var escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function findFields(doc, key, section) {
  const re = new RegExp(
    `^\\s*[-*]\\s+(?:\\*\\*)?${escapeRegExp(key)}(?:\\*\\*)?\\s*[:：]\\s*(.*)$`
  );
  const start = section ? section.startLine : 1;
  const end = section ? section.endLine : doc.lines.length;
  const fields = [];
  for (let line = start; line <= end; line++) {
    if (doc.inFence[line - 1]) continue;
    const m = re.exec(doc.lines[line - 1] ?? "");
    if (m) fields.push({ key, value: (m[1] ?? "").trim(), line });
  }
  return fields;
}
function findPlaceholders(lines) {
  const found = [];
  lines.forEach((l, i) => {
    for (const m of l.matchAll(PLACEHOLDER)) found.push({ text: m[0], line: i + 1 });
  });
  return found;
}

// gate-checker/src/artifacts.ts
function isRequired(root, rule) {
  const w = rule.requiredWhen;
  if (w) {
    if (!exists(root, w.file)) {
      return {
        required: false,
        reason: `${w.file} が無いため条件「${w.key}: ${w.equals}」を判定できない`
      };
    }
    const value = findFields(parseMarkdown(readText(root, w.file)), w.key)[0]?.value;
    return value === w.equals ? { required: true } : { required: false, reason: `${w.file} の「${w.key}」が「${w.equals}」ではない` };
  }
  return { required: rule.required ?? true };
}
function checkTable(doc, file, t) {
  const findings = [];
  const err = (code, message, line) => findings.push({ code, severity: "error", message, file, line });
  const section = findSection(doc, t.section);
  if (!section) return findings;
  const table = parseTables(doc, section).find(
    (tb) => t.columns.every((c) => tb.header.includes(c))
  );
  if (!table) {
    err(
      "table.missing",
      `節「${t.section}」に列 ${t.columns.join(" / ")} を持つ表がありません`,
      section.heading.line
    );
    return findings;
  }
  const minRows = t.minRows ?? 1;
  if (table.rows.length < minRows) {
    err("table.rows.min", `節「${t.section}」の表に ${minRows} 行以上必要です`, table.line);
  }
  const col = (name) => table.header.indexOf(name);
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
          row.line
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
        table.line
      );
      return findings;
    }
    const values = new Set(table.rows.map((r) => r.cells[i] ?? ""));
    for (const v of t.coverage.values) {
      if (!values.has(v)) {
        err(
          "table.coverage.missing",
          `節「${t.section}」の表の列「${t.coverage.column}」に「${v}」の行がありません`,
          table.line
        );
      }
    }
  }
  return findings;
}
function checkField(doc, file, f) {
  const found = findFields(doc, f.key)[0];
  const finding = (code, message) => [
    { code, severity: "error", message, file, line: found?.line }
  ];
  if (!found || found.value === "")
    return finding("field.missing", `「- ${f.key}: 値」がありません`);
  if (f.oneOf && !f.oneOf.includes(found.value)) {
    return finding(
      "field.invalid",
      `「${f.key}」の値「${found.value}」は ${f.oneOf.join(" / ")} のいずれでもありません`
    );
  }
  if (f.pattern && !new RegExp(f.pattern).test(found.value)) {
    return finding(
      "field.invalid",
      `「${f.key}」の値「${found.value}」が形式 ${f.pattern} に合いません`
    );
  }
  return [];
}
var looksLikePath = (p) => p !== "" && !/\s/.test(p) && !/^[a-z][a-z0-9+.-]*:/i.test(p) && (p.includes("/") || /\.(md|feature|json|ya?ml)$/.test(p));
function sourcePaths(doc, file, sectionName) {
  const section = findSection(doc, sectionName);
  if (!section) return [];
  const out = [];
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
function finalize(result) {
  if (result.status !== "skip") {
    result.status = result.findings.some((f) => f.severity === "error") ? "fail" : "pass";
  }
  return result;
}
function checkArtifact(root, rule, idPrefix = "artifact") {
  const result = {
    id: `${idPrefix}:${rule.id}`,
    title: `${rule.subitem} ${rule.title}`,
    target: rule.path,
    status: "pass",
    findings: []
  };
  const { required, reason } = isRequired(root, rule);
  const file = rule.path;
  if (!exists(root, file)) {
    if (required) {
      result.findings.push({
        code: "file.missing",
        severity: "error",
        message: `${rule.title}（${file}）がありません`,
        file
      });
    } else {
      result.status = "skip";
      result.reason = reason ?? "任意の成果物で、ファイルが無い";
    }
    return finalize(result);
  }
  const doc = parseMarkdown(readText(root, file));
  const err = (code, message, line) => result.findings.push({ code, severity: "error", message, file, line });
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

// gate-checker/src/gherkin.ts
import { basename } from "node:path";

// node_modules/@cucumber/gherkin/dist/AstNode.js
var AstNode = class {
  ruleType;
  // biome-ignore lint/suspicious/noExplicitAny: keys and values are heterogeneous AST entries
  subItems = /* @__PURE__ */ new Map();
  constructor(ruleType) {
    this.ruleType = ruleType;
  }
  // biome-ignore lint/suspicious/noExplicitAny: keys and values are heterogeneous AST entries
  add(type, obj) {
    let items = this.subItems.get(type);
    if (items === void 0) {
      items = [];
      this.subItems.set(type, items);
    }
    items.push(obj);
  }
  getSingle(ruleType) {
    return (this.subItems.get(ruleType) || [])[0];
  }
  getItems(ruleType) {
    return this.subItems.get(ruleType) || [];
  }
  getToken(tokenType) {
    return (this.subItems.get(tokenType) || [])[0];
  }
  getTokens(tokenType) {
    return this.subItems.get(tokenType) || [];
  }
};

// node_modules/@cucumber/gherkin/dist/Errors.js
var GherkinException = class extends Error {
  errors;
  location;
  constructor(message) {
    super(message);
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
  }
  static _create(message, location) {
    const column = location != null ? location.column || 0 : -1;
    const line = location != null ? location.line || 0 : -1;
    const m = `(${line}:${column}): ${message}`;
    const err = new this(m);
    err.location = location;
    return err;
  }
};
var ParserException = class _ParserException extends GherkinException {
  static create(message, line, column) {
    const err = new _ParserException(`(${line}:${column}): ${message}`);
    err.location = { line, column };
    return err;
  }
};
var CompositeParserException = class _CompositeParserException extends GherkinException {
  static create(errors) {
    const message = `Parser errors:
${errors.map((e) => e.message).join("\n")}`;
    const err = new _CompositeParserException(message);
    err.errors = errors;
    return err;
  }
};
var AstBuilderException = class _AstBuilderException extends GherkinException {
  static create(message, location) {
    return _AstBuilderException._create(message, location);
  }
};
var NoSuchLanguageException = class _NoSuchLanguageException extends GherkinException {
  static create(language, location) {
    const message = `Language not supported: ${language}`;
    return _NoSuchLanguageException._create(message, location);
  }
};

// node_modules/@cucumber/gherkin/dist/TokenExceptions.js
var UnexpectedTokenException = class _UnexpectedTokenException extends GherkinException {
  static create(token, expectedTokenTypes) {
    const message = `expected: ${expectedTokenTypes.join(", ")}, got '${token.getTokenValue().trim()}'`;
    const location = tokenLocation(token);
    return _UnexpectedTokenException._create(message, location);
  }
};
var UnexpectedEOFException = class _UnexpectedEOFException extends GherkinException {
  static create(token, expectedTokenTypes) {
    const message = `unexpected end of file, expected: ${expectedTokenTypes.join(", ")}`;
    const location = tokenLocation(token);
    return _UnexpectedEOFException._create(message, location);
  }
};
function tokenLocation(token) {
  return token.location?.line && token.line && token.line.indent !== void 0 ? {
    line: token.location.line,
    column: token.line.indent + 1
  } : token.location;
}

// node_modules/@cucumber/gherkin/dist/TokenScanner.js
var TokenScanner = class {
  makeToken;
  lineNumber = 0;
  lines;
  constructor(source, makeToken) {
    this.makeToken = makeToken;
    this.lines = source.split(/\r?\n/);
    if (this.lines.length > 0 && this.lines[this.lines.length - 1].trim() === "") {
      this.lines.pop();
    }
  }
  read() {
    const line = this.lines[this.lineNumber++];
    const location = {
      line: this.lineNumber
    };
    return this.makeToken(line, location);
  }
};

// node_modules/@cucumber/gherkin/dist/countSymbols.js
var regexAstralSymbols = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
function countSymbols(s) {
  return s.replace(regexAstralSymbols, "_").length;
}

// node_modules/@cucumber/gherkin/dist/GherkinLine.js
var GherkinLine = class {
  lineText;
  lineNumber;
  trimmedLineText;
  isEmpty;
  indent;
  column;
  text;
  constructor(lineText, lineNumber) {
    this.lineText = lineText;
    this.lineNumber = lineNumber;
    this.trimmedLineText = lineText.replace(/^\s+/g, "");
    this.isEmpty = this.trimmedLineText.length === 0;
    this.indent = countSymbols(lineText) - countSymbols(this.trimmedLineText);
  }
  startsWith(prefix) {
    return this.trimmedLineText.indexOf(prefix) === 0;
  }
  startsWithTitleKeyword(keyword) {
    return this.startsWith(`${keyword}:`);
  }
  match(regexp) {
    return this.trimmedLineText.match(regexp);
  }
  getLineText(indentToRemove) {
    if (indentToRemove < 0 || indentToRemove > this.indent) {
      return this.trimmedLineText;
    } else {
      return this.lineText.substring(indentToRemove);
    }
  }
  getRestTrimmed(length) {
    return this.trimmedLineText.substring(length).trim();
  }
  getTableCells() {
    const cells = [];
    let col = 0;
    let startCol = col + 1;
    let cell = "";
    let firstCell = true;
    while (col < this.trimmedLineText.length) {
      let chr = this.trimmedLineText[col];
      col++;
      if (chr === "|") {
        if (firstCell) {
          firstCell = false;
        } else {
          const trimmedLeft = cell.replace(/^[ \t\v\f\r\u0085\u00A0]*/g, "");
          const trimmed = trimmedLeft.replace(/[ \t\v\f\r\u0085\u00A0]*$/g, "");
          const cellIndent = cell.length - trimmedLeft.length;
          const span = {
            column: this.indent + startCol + cellIndent,
            text: trimmed
          };
          cells.push(span);
        }
        cell = "";
        startCol = col + 1;
      } else if (chr === "\\") {
        chr = this.trimmedLineText[col];
        col += 1;
        if (chr === "n") {
          cell += "\n";
        } else {
          if (chr !== "|" && chr !== "\\") {
            cell += "\\";
          }
          cell += chr;
        }
      } else {
        cell += chr;
      }
    }
    return cells;
  }
};

// node_modules/@cucumber/gherkin/dist/Parser.js
var Token = class {
  line;
  location;
  isEof;
  matchedText;
  matchedType;
  matchedItems;
  matchedKeyword;
  matchedIndent;
  matchedGherkinDialect;
  matchedKeywordType;
  constructor(line, location) {
    this.line = line;
    this.location = location;
    this.isEof = !line;
  }
  getTokenValue() {
    return this.isEof ? "EOF" : this.line.getLineText(-1);
  }
};
var TokenType;
(function(TokenType2) {
  TokenType2[TokenType2["None"] = 0] = "None";
  TokenType2[TokenType2["EOF"] = 1] = "EOF";
  TokenType2[TokenType2["Empty"] = 2] = "Empty";
  TokenType2[TokenType2["Comment"] = 3] = "Comment";
  TokenType2[TokenType2["TagLine"] = 4] = "TagLine";
  TokenType2[TokenType2["FeatureLine"] = 5] = "FeatureLine";
  TokenType2[TokenType2["RuleLine"] = 6] = "RuleLine";
  TokenType2[TokenType2["BackgroundLine"] = 7] = "BackgroundLine";
  TokenType2[TokenType2["ScenarioLine"] = 8] = "ScenarioLine";
  TokenType2[TokenType2["ExamplesLine"] = 9] = "ExamplesLine";
  TokenType2[TokenType2["StepLine"] = 10] = "StepLine";
  TokenType2[TokenType2["DocStringSeparator"] = 11] = "DocStringSeparator";
  TokenType2[TokenType2["TableRow"] = 12] = "TableRow";
  TokenType2[TokenType2["Language"] = 13] = "Language";
  TokenType2[TokenType2["Other"] = 14] = "Other";
})(TokenType || (TokenType = {}));
var RuleType;
(function(RuleType2) {
  RuleType2[RuleType2["None"] = 0] = "None";
  RuleType2[RuleType2["_EOF"] = 1] = "_EOF";
  RuleType2[RuleType2["_Empty"] = 2] = "_Empty";
  RuleType2[RuleType2["_Comment"] = 3] = "_Comment";
  RuleType2[RuleType2["_TagLine"] = 4] = "_TagLine";
  RuleType2[RuleType2["_FeatureLine"] = 5] = "_FeatureLine";
  RuleType2[RuleType2["_RuleLine"] = 6] = "_RuleLine";
  RuleType2[RuleType2["_BackgroundLine"] = 7] = "_BackgroundLine";
  RuleType2[RuleType2["_ScenarioLine"] = 8] = "_ScenarioLine";
  RuleType2[RuleType2["_ExamplesLine"] = 9] = "_ExamplesLine";
  RuleType2[RuleType2["_StepLine"] = 10] = "_StepLine";
  RuleType2[RuleType2["_DocStringSeparator"] = 11] = "_DocStringSeparator";
  RuleType2[RuleType2["_TableRow"] = 12] = "_TableRow";
  RuleType2[RuleType2["_Language"] = 13] = "_Language";
  RuleType2[RuleType2["_Other"] = 14] = "_Other";
  RuleType2[RuleType2["GherkinDocument"] = 15] = "GherkinDocument";
  RuleType2[RuleType2["Feature"] = 16] = "Feature";
  RuleType2[RuleType2["FeatureHeader"] = 17] = "FeatureHeader";
  RuleType2[RuleType2["Rule"] = 18] = "Rule";
  RuleType2[RuleType2["RuleHeader"] = 19] = "RuleHeader";
  RuleType2[RuleType2["Background"] = 20] = "Background";
  RuleType2[RuleType2["ScenarioDefinition"] = 21] = "ScenarioDefinition";
  RuleType2[RuleType2["Scenario"] = 22] = "Scenario";
  RuleType2[RuleType2["ExamplesDefinition"] = 23] = "ExamplesDefinition";
  RuleType2[RuleType2["Examples"] = 24] = "Examples";
  RuleType2[RuleType2["ExamplesTable"] = 25] = "ExamplesTable";
  RuleType2[RuleType2["Step"] = 26] = "Step";
  RuleType2[RuleType2["StepArg"] = 27] = "StepArg";
  RuleType2[RuleType2["DataTableAndMaybeDocString"] = 28] = "DataTableAndMaybeDocString";
  RuleType2[RuleType2["DocStringAndMaybeDataTable"] = 29] = "DocStringAndMaybeDataTable";
  RuleType2[RuleType2["DataTable"] = 30] = "DataTable";
  RuleType2[RuleType2["DocString"] = 31] = "DocString";
  RuleType2[RuleType2["Tags"] = 32] = "Tags";
  RuleType2[RuleType2["DescriptionHelper"] = 33] = "DescriptionHelper";
  RuleType2[RuleType2["Description"] = 34] = "Description";
})(RuleType || (RuleType = {}));
var Parser = class {
  builder;
  tokenMatcher;
  stopAtFirstError = false;
  context;
  constructor(builder, tokenMatcher) {
    this.builder = builder;
    this.tokenMatcher = tokenMatcher;
  }
  parse(gherkinSource) {
    const tokenScanner = new TokenScanner(gherkinSource, (line, location) => {
      const gherkinLine = line === null || line === void 0 ? null : new GherkinLine(line, location.line);
      return new Token(gherkinLine, location);
    });
    this.builder.reset();
    this.tokenMatcher.reset();
    this.context = {
      tokenScanner,
      tokenQueue: [],
      errors: []
    };
    this.startRule(this.context, RuleType.GherkinDocument);
    let state = 0;
    let token = null;
    while (true) {
      token = this.readToken(this.context);
      state = this.matchToken(state, token, this.context);
      if (token.isEof)
        break;
    }
    this.endRule(this.context);
    if (this.context.errors.length > 0) {
      throw CompositeParserException.create(this.context.errors);
    }
    return this.getResult();
  }
  addError(context, error) {
    if (!context.errors.map((e) => {
      return e.message;
    }).includes(error.message)) {
      context.errors.push(error);
      if (context.errors.length > 10)
        throw CompositeParserException.create(context.errors);
    }
  }
  startRule(context, ruleType) {
    this.handleAstError(context, () => this.builder.startRule(ruleType));
  }
  endRule(context) {
    this.handleAstError(context, () => this.builder.endRule());
  }
  build(context, token) {
    this.handleAstError(context, () => this.builder.build(token));
  }
  getResult() {
    return this.builder.getResult();
  }
  handleAstError(context, action) {
    this.handleExternalError(context, true, action);
  }
  handleExternalError(context, defaultValue, action) {
    if (this.stopAtFirstError)
      return action();
    try {
      return action();
    } catch (e) {
      if (e instanceof CompositeParserException) {
        e.errors.forEach((error) => this.addError(context, error));
      } else if (e instanceof ParserException || e instanceof AstBuilderException || e instanceof UnexpectedTokenException || e instanceof NoSuchLanguageException) {
        this.addError(context, e);
      } else {
        throw e;
      }
    }
    return defaultValue;
  }
  readToken(context) {
    return context.tokenQueue.length > 0 ? context.tokenQueue.shift() : context.tokenScanner.read();
  }
  matchToken(state, token, context) {
    switch (state) {
      case 0:
        return this.matchTokenAt_0(token, context);
      case 1:
        return this.matchTokenAt_1(token, context);
      case 2:
        return this.matchTokenAt_2(token, context);
      case 3:
        return this.matchTokenAt_3(token, context);
      case 4:
        return this.matchTokenAt_4(token, context);
      case 5:
        return this.matchTokenAt_5(token, context);
      case 6:
        return this.matchTokenAt_6(token, context);
      case 7:
        return this.matchTokenAt_7(token, context);
      case 8:
        return this.matchTokenAt_8(token, context);
      case 9:
        return this.matchTokenAt_9(token, context);
      case 10:
        return this.matchTokenAt_10(token, context);
      case 11:
        return this.matchTokenAt_11(token, context);
      case 12:
        return this.matchTokenAt_12(token, context);
      case 13:
        return this.matchTokenAt_13(token, context);
      case 14:
        return this.matchTokenAt_14(token, context);
      case 15:
        return this.matchTokenAt_15(token, context);
      case 16:
        return this.matchTokenAt_16(token, context);
      case 17:
        return this.matchTokenAt_17(token, context);
      case 18:
        return this.matchTokenAt_18(token, context);
      case 19:
        return this.matchTokenAt_19(token, context);
      case 20:
        return this.matchTokenAt_20(token, context);
      case 21:
        return this.matchTokenAt_21(token, context);
      case 22:
        return this.matchTokenAt_22(token, context);
      case 23:
        return this.matchTokenAt_23(token, context);
      case 24:
        return this.matchTokenAt_24(token, context);
      case 25:
        return this.matchTokenAt_25(token, context);
      case 26:
        return this.matchTokenAt_26(token, context);
      case 27:
        return this.matchTokenAt_27(token, context);
      case 28:
        return this.matchTokenAt_28(token, context);
      case 29:
        return this.matchTokenAt_29(token, context);
      case 30:
        return this.matchTokenAt_30(token, context);
      case 31:
        return this.matchTokenAt_31(token, context);
      case 32:
        return this.matchTokenAt_32(token, context);
      case 33:
        return this.matchTokenAt_33(token, context);
      case 34:
        return this.matchTokenAt_34(token, context);
      case 35:
        return this.matchTokenAt_35(token, context);
      case 36:
        return this.matchTokenAt_36(token, context);
      case 37:
        return this.matchTokenAt_37(token, context);
      case 38:
        return this.matchTokenAt_38(token, context);
      case 39:
        return this.matchTokenAt_39(token, context);
      case 40:
        return this.matchTokenAt_40(token, context);
      case 41:
        return this.matchTokenAt_41(token, context);
      case 43:
        return this.matchTokenAt_43(token, context);
      case 44:
        return this.matchTokenAt_44(token, context);
      case 45:
        return this.matchTokenAt_45(token, context);
      case 46:
        return this.matchTokenAt_46(token, context);
      case 47:
        return this.matchTokenAt_47(token, context);
      case 48:
        return this.matchTokenAt_48(token, context);
      case 49:
        return this.matchTokenAt_49(token, context);
      case 50:
        return this.matchTokenAt_50(token, context);
      case 51:
        return this.matchTokenAt_51(token, context);
      case 52:
        return this.matchTokenAt_52(token, context);
      case 53:
        return this.matchTokenAt_53(token, context);
      case 54:
        return this.matchTokenAt_54(token, context);
      default:
        throw new Error("Unknown state: " + state);
    }
  }
  // Start
  matchTokenAt_0(token, context) {
    if (this.match_EOF(context, token)) {
      this.build(context, token);
      return 42;
    }
    if (this.match_Language(context, token)) {
      this.startRule(context, RuleType.Feature);
      this.startRule(context, RuleType.FeatureHeader);
      this.build(context, token);
      return 1;
    }
    if (this.match_TagLine(context, token)) {
      this.startRule(context, RuleType.Feature);
      this.startRule(context, RuleType.FeatureHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 2;
    }
    if (this.match_FeatureLine(context, token)) {
      this.startRule(context, RuleType.Feature);
      this.startRule(context, RuleType.FeatureHeader);
      this.build(context, token);
      return 3;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 0;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 0;
    }
    const expectedTokens = ["#EOF", "#Language", "#TagLine", "#FeatureLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 0;
  }
  // GherkinDocument:0>Feature:0>FeatureHeader:0>#Language:0
  matchTokenAt_1(token, context) {
    if (this.match_TagLine(context, token)) {
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 2;
    }
    if (this.match_FeatureLine(context, token)) {
      this.build(context, token);
      return 3;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 1;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 1;
    }
    const expectedTokens = ["#TagLine", "#FeatureLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 1;
  }
  // GherkinDocument:0>Feature:0>FeatureHeader:1>Tags:0>#TagLine:0
  matchTokenAt_2(token, context) {
    if (this.match_TagLine(context, token)) {
      this.build(context, token);
      return 2;
    }
    if (this.match_FeatureLine(context, token)) {
      this.endRule(context);
      this.build(context, token);
      return 3;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 2;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 2;
    }
    const expectedTokens = ["#TagLine", "#FeatureLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 2;
  }
  // GherkinDocument:0>Feature:0>FeatureHeader:2>#FeatureLine:0
  matchTokenAt_3(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 3;
    }
    if (this.match_Comment(context, token)) {
      this.startRule(context, RuleType.Description);
      this.build(context, token);
      return 4;
    }
    if (this.match_BackgroundLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.Background);
      this.build(context, token);
      return 5;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 11;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Other(context, token)) {
      this.startRule(context, RuleType.Description);
      this.build(context, token);
      return 4;
    }
    const expectedTokens = ["#EOF", "#Empty", "#Comment", "#BackgroundLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 3;
  }
  // GherkinDocument:0>Feature:0>FeatureHeader:3>DescriptionHelper:1>Description:0>__alt1:0>#Other:0
  matchTokenAt_4(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 4;
    }
    if (this.match_BackgroundLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Background);
      this.build(context, token);
      return 5;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 11;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Other(context, token)) {
      this.build(context, token);
      return 4;
    }
    const expectedTokens = ["#EOF", "#Comment", "#BackgroundLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 4;
  }
  // GherkinDocument:0>Feature:1>Background:0>#BackgroundLine:0
  matchTokenAt_5(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 5;
    }
    if (this.match_Comment(context, token)) {
      this.startRule(context, RuleType.Description);
      this.build(context, token);
      return 6;
    }
    if (this.match_StepLine(context, token)) {
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 7;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 11;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Other(context, token)) {
      this.startRule(context, RuleType.Description);
      this.build(context, token);
      return 6;
    }
    const expectedTokens = ["#EOF", "#Empty", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 5;
  }
  // GherkinDocument:0>Feature:1>Background:1>DescriptionHelper:1>Description:0>__alt1:0>#Other:0
  matchTokenAt_6(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 6;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 7;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 11;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Other(context, token)) {
      this.build(context, token);
      return 6;
    }
    const expectedTokens = ["#EOF", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 6;
  }
  // GherkinDocument:0>Feature:1>Background:2>Step:0>#StepLine:0
  matchTokenAt_7(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_TableRow(context, token)) {
      this.startRule(context, RuleType.DataTable);
      this.build(context, token);
      return 8;
    }
    if (this.match_DocStringSeparator(context, token)) {
      this.startRule(context, RuleType.DocString);
      this.build(context, token);
      return 52;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 7;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 11;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 7;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 7;
    }
    const expectedTokens = ["#EOF", "#TableRow", "#DocStringSeparator", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 7;
  }
  // GherkinDocument:0>Feature:1>Background:2>Step:1>StepArg:0>__alt0:0>DataTableAndMaybeDocString:0>DataTable:0>#TableRow:0
  matchTokenAt_8(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_TableRow(context, token)) {
      this.build(context, token);
      return 8;
    }
    if (this.match_DocStringSeparator(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.DocString);
      this.build(context, token);
      return 9;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 7;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 11;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 8;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 8;
    }
    const expectedTokens = ["#EOF", "#TableRow", "#DocStringSeparator", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 8;
  }
  // GherkinDocument:0>Feature:1>Background:2>Step:1>StepArg:0>__alt0:0>DataTableAndMaybeDocString:1>DocString:0>#DocStringSeparator:0
  matchTokenAt_9(token, context) {
    if (this.match_DocStringSeparator(context, token)) {
      this.build(context, token);
      return 10;
    }
    if (this.match_Other(context, token)) {
      this.build(context, token);
      return 9;
    }
    const expectedTokens = ["#DocStringSeparator", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 9;
  }
  // GherkinDocument:0>Feature:1>Background:2>Step:1>StepArg:0>__alt0:0>DataTableAndMaybeDocString:1>DocString:2>#DocStringSeparator:0
  matchTokenAt_10(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 7;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 11;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 10;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 10;
    }
    const expectedTokens = ["#EOF", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 10;
  }
  // GherkinDocument:0>Feature:2>ScenarioDefinition:0>Tags:0>#TagLine:0
  matchTokenAt_11(token, context) {
    if (this.match_TagLine(context, token)) {
      this.build(context, token);
      return 11;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 11;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 11;
    }
    const expectedTokens = ["#TagLine", "#ScenarioLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 11;
  }
  // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:0>#ScenarioLine:0
  matchTokenAt_12(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 12;
    }
    if (this.match_Comment(context, token)) {
      this.startRule(context, RuleType.Description);
      this.build(context, token);
      return 13;
    }
    if (this.match_StepLine(context, token)) {
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 14;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 18;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 11;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 19;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Other(context, token)) {
      this.startRule(context, RuleType.Description);
      this.build(context, token);
      return 13;
    }
    const expectedTokens = ["#EOF", "#Empty", "#Comment", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 12;
  }
  // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:1>DescriptionHelper:1>Description:0>__alt1:0>#Other:0
  matchTokenAt_13(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 13;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 14;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.endRule(context);
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 18;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 11;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 19;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Other(context, token)) {
      this.build(context, token);
      return 13;
    }
    const expectedTokens = ["#EOF", "#Comment", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 13;
  }
  // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:2>Step:0>#StepLine:0
  matchTokenAt_14(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_TableRow(context, token)) {
      this.startRule(context, RuleType.DataTable);
      this.build(context, token);
      return 15;
    }
    if (this.match_DocStringSeparator(context, token)) {
      this.startRule(context, RuleType.DocString);
      this.build(context, token);
      return 49;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 14;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.endRule(context);
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 18;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 11;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 19;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 14;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 14;
    }
    const expectedTokens = ["#EOF", "#TableRow", "#DocStringSeparator", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 14;
  }
  // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:2>Step:1>StepArg:0>__alt0:0>DataTableAndMaybeDocString:0>DataTable:0>#TableRow:0
  matchTokenAt_15(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_TableRow(context, token)) {
      this.build(context, token);
      return 15;
    }
    if (this.match_DocStringSeparator(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.DocString);
      this.build(context, token);
      return 16;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 14;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 18;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 11;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 19;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 15;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 15;
    }
    const expectedTokens = ["#EOF", "#TableRow", "#DocStringSeparator", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 15;
  }
  // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:2>Step:1>StepArg:0>__alt0:0>DataTableAndMaybeDocString:1>DocString:0>#DocStringSeparator:0
  matchTokenAt_16(token, context) {
    if (this.match_DocStringSeparator(context, token)) {
      this.build(context, token);
      return 17;
    }
    if (this.match_Other(context, token)) {
      this.build(context, token);
      return 16;
    }
    const expectedTokens = ["#DocStringSeparator", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 16;
  }
  // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:2>Step:1>StepArg:0>__alt0:0>DataTableAndMaybeDocString:1>DocString:2>#DocStringSeparator:0
  matchTokenAt_17(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 14;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 18;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 11;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 19;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 17;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 17;
    }
    const expectedTokens = ["#EOF", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 17;
  }
  // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:3>ExamplesDefinition:0>Tags:0>#TagLine:0
  matchTokenAt_18(token, context) {
    if (this.match_TagLine(context, token)) {
      this.build(context, token);
      return 18;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 19;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 18;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 18;
    }
    const expectedTokens = ["#TagLine", "#ExamplesLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 18;
  }
  // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:3>ExamplesDefinition:1>Examples:0>#ExamplesLine:0
  matchTokenAt_19(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 19;
    }
    if (this.match_Comment(context, token)) {
      this.startRule(context, RuleType.Description);
      this.build(context, token);
      return 20;
    }
    if (this.match_TableRow(context, token)) {
      this.startRule(context, RuleType.ExamplesTable);
      this.build(context, token);
      return 21;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 18;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 11;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 19;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Other(context, token)) {
      this.startRule(context, RuleType.Description);
      this.build(context, token);
      return 20;
    }
    const expectedTokens = ["#EOF", "#Empty", "#Comment", "#TableRow", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 19;
  }
  // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:3>ExamplesDefinition:1>Examples:1>DescriptionHelper:1>Description:0>__alt1:0>#Other:0
  matchTokenAt_20(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 20;
    }
    if (this.match_TableRow(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesTable);
      this.build(context, token);
      return 21;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 18;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 11;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 19;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Other(context, token)) {
      this.build(context, token);
      return 20;
    }
    const expectedTokens = ["#EOF", "#Comment", "#TableRow", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 20;
  }
  // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:3>ExamplesDefinition:1>Examples:2>ExamplesTable:0>#TableRow:0
  matchTokenAt_21(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_TableRow(context, token)) {
      this.build(context, token);
      return 21;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 18;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 11;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 19;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 21;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 21;
    }
    const expectedTokens = ["#EOF", "#TableRow", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 21;
  }
  // GherkinDocument:0>Feature:3>Rule:0>RuleHeader:0>Tags:0>#TagLine:0
  matchTokenAt_22(token, context) {
    if (this.match_TagLine(context, token)) {
      this.build(context, token);
      return 22;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 22;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 22;
    }
    const expectedTokens = ["#TagLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 22;
  }
  // GherkinDocument:0>Feature:3>Rule:0>RuleHeader:1>#RuleLine:0
  matchTokenAt_23(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.startRule(context, RuleType.Description);
      this.build(context, token);
      return 24;
    }
    if (this.match_BackgroundLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.Background);
      this.build(context, token);
      return 25;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 31;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Other(context, token)) {
      this.startRule(context, RuleType.Description);
      this.build(context, token);
      return 24;
    }
    const expectedTokens = ["#EOF", "#Empty", "#Comment", "#BackgroundLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 23;
  }
  // GherkinDocument:0>Feature:3>Rule:0>RuleHeader:2>DescriptionHelper:1>Description:0>__alt1:0>#Other:0
  matchTokenAt_24(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 24;
    }
    if (this.match_BackgroundLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Background);
      this.build(context, token);
      return 25;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 31;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Other(context, token)) {
      this.build(context, token);
      return 24;
    }
    const expectedTokens = ["#EOF", "#Comment", "#BackgroundLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 24;
  }
  // GherkinDocument:0>Feature:3>Rule:1>Background:0>#BackgroundLine:0
  matchTokenAt_25(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 25;
    }
    if (this.match_Comment(context, token)) {
      this.startRule(context, RuleType.Description);
      this.build(context, token);
      return 26;
    }
    if (this.match_StepLine(context, token)) {
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 27;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 31;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Other(context, token)) {
      this.startRule(context, RuleType.Description);
      this.build(context, token);
      return 26;
    }
    const expectedTokens = ["#EOF", "#Empty", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 25;
  }
  // GherkinDocument:0>Feature:3>Rule:1>Background:1>DescriptionHelper:1>Description:0>__alt1:0>#Other:0
  matchTokenAt_26(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 26;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 27;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 31;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Other(context, token)) {
      this.build(context, token);
      return 26;
    }
    const expectedTokens = ["#EOF", "#Comment", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 26;
  }
  // GherkinDocument:0>Feature:3>Rule:1>Background:2>Step:0>#StepLine:0
  matchTokenAt_27(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_TableRow(context, token)) {
      this.startRule(context, RuleType.DataTable);
      this.build(context, token);
      return 28;
    }
    if (this.match_DocStringSeparator(context, token)) {
      this.startRule(context, RuleType.DocString);
      this.build(context, token);
      return 46;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 27;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 31;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 27;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 27;
    }
    const expectedTokens = ["#EOF", "#TableRow", "#DocStringSeparator", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 27;
  }
  // GherkinDocument:0>Feature:3>Rule:1>Background:2>Step:1>StepArg:0>__alt0:0>DataTableAndMaybeDocString:0>DataTable:0>#TableRow:0
  matchTokenAt_28(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_TableRow(context, token)) {
      this.build(context, token);
      return 28;
    }
    if (this.match_DocStringSeparator(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.DocString);
      this.build(context, token);
      return 29;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 27;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 31;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 28;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 28;
    }
    const expectedTokens = ["#EOF", "#TableRow", "#DocStringSeparator", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 28;
  }
  // GherkinDocument:0>Feature:3>Rule:1>Background:2>Step:1>StepArg:0>__alt0:0>DataTableAndMaybeDocString:1>DocString:0>#DocStringSeparator:0
  matchTokenAt_29(token, context) {
    if (this.match_DocStringSeparator(context, token)) {
      this.build(context, token);
      return 30;
    }
    if (this.match_Other(context, token)) {
      this.build(context, token);
      return 29;
    }
    const expectedTokens = ["#DocStringSeparator", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 29;
  }
  // GherkinDocument:0>Feature:3>Rule:1>Background:2>Step:1>StepArg:0>__alt0:0>DataTableAndMaybeDocString:1>DocString:2>#DocStringSeparator:0
  matchTokenAt_30(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 27;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 31;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 30;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 30;
    }
    const expectedTokens = ["#EOF", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 30;
  }
  // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:0>Tags:0>#TagLine:0
  matchTokenAt_31(token, context) {
    if (this.match_TagLine(context, token)) {
      this.build(context, token);
      return 31;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 31;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 31;
    }
    const expectedTokens = ["#TagLine", "#ScenarioLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 31;
  }
  // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:0>#ScenarioLine:0
  matchTokenAt_32(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 32;
    }
    if (this.match_Comment(context, token)) {
      this.startRule(context, RuleType.Description);
      this.build(context, token);
      return 33;
    }
    if (this.match_StepLine(context, token)) {
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 34;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 38;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 31;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 39;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Other(context, token)) {
      this.startRule(context, RuleType.Description);
      this.build(context, token);
      return 33;
    }
    const expectedTokens = ["#EOF", "#Empty", "#Comment", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 32;
  }
  // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:1>DescriptionHelper:1>Description:0>__alt1:0>#Other:0
  matchTokenAt_33(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 33;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 34;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.endRule(context);
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 38;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 31;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 39;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Other(context, token)) {
      this.build(context, token);
      return 33;
    }
    const expectedTokens = ["#EOF", "#Comment", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 33;
  }
  // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:2>Step:0>#StepLine:0
  matchTokenAt_34(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_TableRow(context, token)) {
      this.startRule(context, RuleType.DataTable);
      this.build(context, token);
      return 35;
    }
    if (this.match_DocStringSeparator(context, token)) {
      this.startRule(context, RuleType.DocString);
      this.build(context, token);
      return 43;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 34;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.endRule(context);
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 38;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 31;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 39;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 34;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 34;
    }
    const expectedTokens = ["#EOF", "#TableRow", "#DocStringSeparator", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 34;
  }
  // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:2>Step:1>StepArg:0>__alt0:0>DataTableAndMaybeDocString:0>DataTable:0>#TableRow:0
  matchTokenAt_35(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_TableRow(context, token)) {
      this.build(context, token);
      return 35;
    }
    if (this.match_DocStringSeparator(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.DocString);
      this.build(context, token);
      return 36;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 34;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 38;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 31;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 39;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 35;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 35;
    }
    const expectedTokens = ["#EOF", "#TableRow", "#DocStringSeparator", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 35;
  }
  // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:2>Step:1>StepArg:0>__alt0:0>DataTableAndMaybeDocString:1>DocString:0>#DocStringSeparator:0
  matchTokenAt_36(token, context) {
    if (this.match_DocStringSeparator(context, token)) {
      this.build(context, token);
      return 37;
    }
    if (this.match_Other(context, token)) {
      this.build(context, token);
      return 36;
    }
    const expectedTokens = ["#DocStringSeparator", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 36;
  }
  // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:2>Step:1>StepArg:0>__alt0:0>DataTableAndMaybeDocString:1>DocString:2>#DocStringSeparator:0
  matchTokenAt_37(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 34;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 38;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 31;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 39;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 37;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 37;
    }
    const expectedTokens = ["#EOF", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 37;
  }
  // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:3>ExamplesDefinition:0>Tags:0>#TagLine:0
  matchTokenAt_38(token, context) {
    if (this.match_TagLine(context, token)) {
      this.build(context, token);
      return 38;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 39;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 38;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 38;
    }
    const expectedTokens = ["#TagLine", "#ExamplesLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 38;
  }
  // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:3>ExamplesDefinition:1>Examples:0>#ExamplesLine:0
  matchTokenAt_39(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 39;
    }
    if (this.match_Comment(context, token)) {
      this.startRule(context, RuleType.Description);
      this.build(context, token);
      return 40;
    }
    if (this.match_TableRow(context, token)) {
      this.startRule(context, RuleType.ExamplesTable);
      this.build(context, token);
      return 41;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 38;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 31;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 39;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Other(context, token)) {
      this.startRule(context, RuleType.Description);
      this.build(context, token);
      return 40;
    }
    const expectedTokens = ["#EOF", "#Empty", "#Comment", "#TableRow", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 39;
  }
  // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:3>ExamplesDefinition:1>Examples:1>DescriptionHelper:1>Description:0>__alt1:0>#Other:0
  matchTokenAt_40(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 40;
    }
    if (this.match_TableRow(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesTable);
      this.build(context, token);
      return 41;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 38;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 31;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 39;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Other(context, token)) {
      this.build(context, token);
      return 40;
    }
    const expectedTokens = ["#EOF", "#Comment", "#TableRow", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 40;
  }
  // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:3>ExamplesDefinition:1>Examples:2>ExamplesTable:0>#TableRow:0
  matchTokenAt_41(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_TableRow(context, token)) {
      this.build(context, token);
      return 41;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 38;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 31;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 39;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 41;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 41;
    }
    const expectedTokens = ["#EOF", "#TableRow", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 41;
  }
  // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:2>Step:1>StepArg:0>__alt0:1>DocStringAndMaybeDataTable:0>DocString:0>#DocStringSeparator:0
  matchTokenAt_43(token, context) {
    if (this.match_DocStringSeparator(context, token)) {
      this.build(context, token);
      return 44;
    }
    if (this.match_Other(context, token)) {
      this.build(context, token);
      return 43;
    }
    const expectedTokens = ["#DocStringSeparator", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 43;
  }
  // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:2>Step:1>StepArg:0>__alt0:1>DocStringAndMaybeDataTable:0>DocString:2>#DocStringSeparator:0
  matchTokenAt_44(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_TableRow(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.DataTable);
      this.build(context, token);
      return 45;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 34;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 38;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 31;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 39;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 44;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 44;
    }
    const expectedTokens = ["#EOF", "#TableRow", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 44;
  }
  // GherkinDocument:0>Feature:3>Rule:2>ScenarioDefinition:1>Scenario:2>Step:1>StepArg:0>__alt0:1>DocStringAndMaybeDataTable:1>DataTable:0>#TableRow:0
  matchTokenAt_45(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_TableRow(context, token)) {
      this.build(context, token);
      return 45;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 34;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 38;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 31;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 39;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 45;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 45;
    }
    const expectedTokens = ["#EOF", "#TableRow", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 45;
  }
  // GherkinDocument:0>Feature:3>Rule:1>Background:2>Step:1>StepArg:0>__alt0:1>DocStringAndMaybeDataTable:0>DocString:0>#DocStringSeparator:0
  matchTokenAt_46(token, context) {
    if (this.match_DocStringSeparator(context, token)) {
      this.build(context, token);
      return 47;
    }
    if (this.match_Other(context, token)) {
      this.build(context, token);
      return 46;
    }
    const expectedTokens = ["#DocStringSeparator", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 46;
  }
  // GherkinDocument:0>Feature:3>Rule:1>Background:2>Step:1>StepArg:0>__alt0:1>DocStringAndMaybeDataTable:0>DocString:2>#DocStringSeparator:0
  matchTokenAt_47(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_TableRow(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.DataTable);
      this.build(context, token);
      return 48;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 27;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 31;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 47;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 47;
    }
    const expectedTokens = ["#EOF", "#TableRow", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 47;
  }
  // GherkinDocument:0>Feature:3>Rule:1>Background:2>Step:1>StepArg:0>__alt0:1>DocStringAndMaybeDataTable:1>DataTable:0>#TableRow:0
  matchTokenAt_48(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_TableRow(context, token)) {
      this.build(context, token);
      return 48;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 27;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 31;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 32;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 48;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 48;
    }
    const expectedTokens = ["#EOF", "#TableRow", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 48;
  }
  // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:2>Step:1>StepArg:0>__alt0:1>DocStringAndMaybeDataTable:0>DocString:0>#DocStringSeparator:0
  matchTokenAt_49(token, context) {
    if (this.match_DocStringSeparator(context, token)) {
      this.build(context, token);
      return 50;
    }
    if (this.match_Other(context, token)) {
      this.build(context, token);
      return 49;
    }
    const expectedTokens = ["#DocStringSeparator", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 49;
  }
  // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:2>Step:1>StepArg:0>__alt0:1>DocStringAndMaybeDataTable:0>DocString:2>#DocStringSeparator:0
  matchTokenAt_50(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_TableRow(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.DataTable);
      this.build(context, token);
      return 51;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 14;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 18;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 11;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 19;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 50;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 50;
    }
    const expectedTokens = ["#EOF", "#TableRow", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 50;
  }
  // GherkinDocument:0>Feature:2>ScenarioDefinition:1>Scenario:2>Step:1>StepArg:0>__alt0:1>DocStringAndMaybeDataTable:1>DataTable:0>#TableRow:0
  matchTokenAt_51(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_TableRow(context, token)) {
      this.build(context, token);
      return 51;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 14;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_1(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ExamplesDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 18;
      }
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 11;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ExamplesLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ExamplesDefinition);
      this.startRule(context, RuleType.Examples);
      this.build(context, token);
      return 19;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 51;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 51;
    }
    const expectedTokens = ["#EOF", "#TableRow", "#StepLine", "#TagLine", "#ExamplesLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 51;
  }
  // GherkinDocument:0>Feature:1>Background:2>Step:1>StepArg:0>__alt0:1>DocStringAndMaybeDataTable:0>DocString:0>#DocStringSeparator:0
  matchTokenAt_52(token, context) {
    if (this.match_DocStringSeparator(context, token)) {
      this.build(context, token);
      return 53;
    }
    if (this.match_Other(context, token)) {
      this.build(context, token);
      return 52;
    }
    const expectedTokens = ["#DocStringSeparator", "#Other"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 52;
  }
  // GherkinDocument:0>Feature:1>Background:2>Step:1>StepArg:0>__alt0:1>DocStringAndMaybeDataTable:0>DocString:2>#DocStringSeparator:0
  matchTokenAt_53(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_TableRow(context, token)) {
      this.endRule(context);
      this.startRule(context, RuleType.DataTable);
      this.build(context, token);
      return 54;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 7;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 11;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 53;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 53;
    }
    const expectedTokens = ["#EOF", "#TableRow", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 53;
  }
  // GherkinDocument:0>Feature:1>Background:2>Step:1>StepArg:0>__alt0:1>DocStringAndMaybeDataTable:1>DataTable:0>#TableRow:0
  matchTokenAt_54(token, context) {
    if (this.match_EOF(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.build(context, token);
      return 42;
    }
    if (this.match_TableRow(context, token)) {
      this.build(context, token);
      return 54;
    }
    if (this.match_StepLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Step);
      this.build(context, token);
      return 7;
    }
    if (this.match_TagLine(context, token)) {
      if (this.lookahead_0(context, token)) {
        this.endRule(context);
        this.endRule(context);
        this.endRule(context);
        this.startRule(context, RuleType.ScenarioDefinition);
        this.startRule(context, RuleType.Tags);
        this.build(context, token);
        return 11;
      }
    }
    if (this.match_TagLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.startRule(context, RuleType.Tags);
      this.build(context, token);
      return 22;
    }
    if (this.match_ScenarioLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.ScenarioDefinition);
      this.startRule(context, RuleType.Scenario);
      this.build(context, token);
      return 12;
    }
    if (this.match_RuleLine(context, token)) {
      this.endRule(context);
      this.endRule(context);
      this.endRule(context);
      this.startRule(context, RuleType.Rule);
      this.startRule(context, RuleType.RuleHeader);
      this.build(context, token);
      return 23;
    }
    if (this.match_Comment(context, token)) {
      this.build(context, token);
      return 54;
    }
    if (this.match_Empty(context, token)) {
      this.build(context, token);
      return 54;
    }
    const expectedTokens = ["#EOF", "#TableRow", "#StepLine", "#TagLine", "#ScenarioLine", "#RuleLine", "#Comment", "#Empty"];
    const error = token.isEof ? UnexpectedEOFException.create(token, expectedTokens) : UnexpectedTokenException.create(token, expectedTokens);
    if (this.stopAtFirstError)
      throw error;
    this.addError(context, error);
    return 54;
  }
  match_EOF(context, token) {
    return this.handleExternalError(context, false, () => this.tokenMatcher.match_EOF(token));
  }
  match_Empty(context, token) {
    if (token.isEof)
      return false;
    return this.handleExternalError(context, false, () => this.tokenMatcher.match_Empty(token));
  }
  match_Comment(context, token) {
    if (token.isEof)
      return false;
    return this.handleExternalError(context, false, () => this.tokenMatcher.match_Comment(token));
  }
  match_TagLine(context, token) {
    if (token.isEof)
      return false;
    return this.handleExternalError(context, false, () => this.tokenMatcher.match_TagLine(token));
  }
  match_FeatureLine(context, token) {
    if (token.isEof)
      return false;
    return this.handleExternalError(context, false, () => this.tokenMatcher.match_FeatureLine(token));
  }
  match_RuleLine(context, token) {
    if (token.isEof)
      return false;
    return this.handleExternalError(context, false, () => this.tokenMatcher.match_RuleLine(token));
  }
  match_BackgroundLine(context, token) {
    if (token.isEof)
      return false;
    return this.handleExternalError(context, false, () => this.tokenMatcher.match_BackgroundLine(token));
  }
  match_ScenarioLine(context, token) {
    if (token.isEof)
      return false;
    return this.handleExternalError(context, false, () => this.tokenMatcher.match_ScenarioLine(token));
  }
  match_ExamplesLine(context, token) {
    if (token.isEof)
      return false;
    return this.handleExternalError(context, false, () => this.tokenMatcher.match_ExamplesLine(token));
  }
  match_StepLine(context, token) {
    if (token.isEof)
      return false;
    return this.handleExternalError(context, false, () => this.tokenMatcher.match_StepLine(token));
  }
  match_DocStringSeparator(context, token) {
    if (token.isEof)
      return false;
    return this.handleExternalError(context, false, () => this.tokenMatcher.match_DocStringSeparator(token));
  }
  match_TableRow(context, token) {
    if (token.isEof)
      return false;
    return this.handleExternalError(context, false, () => this.tokenMatcher.match_TableRow(token));
  }
  match_Language(context, token) {
    if (token.isEof)
      return false;
    return this.handleExternalError(context, false, () => this.tokenMatcher.match_Language(token));
  }
  match_Other(context, token) {
    if (token.isEof)
      return false;
    return this.handleExternalError(context, false, () => this.tokenMatcher.match_Other(token));
  }
  lookahead_0(context, currentToken) {
    let token;
    const queue = [];
    let match = false;
    do {
      token = this.readToken(this.context);
      queue.push(token);
      if (this.match_ScenarioLine(context, token)) {
        match = true;
        break;
      }
    } while (this.match_Empty(context, token) || this.match_Comment(context, token) || this.match_TagLine(context, token));
    context.tokenQueue = context.tokenQueue.concat(queue);
    return match;
  }
  lookahead_1(context, currentToken) {
    let token;
    const queue = [];
    let match = false;
    do {
      token = this.readToken(this.context);
      queue.push(token);
      if (this.match_ExamplesLine(context, token)) {
        match = true;
        break;
      }
    } while (this.match_Empty(context, token) || this.match_Comment(context, token) || this.match_TagLine(context, token));
    context.tokenQueue = context.tokenQueue.concat(queue);
    return match;
  }
};

// node_modules/@cucumber/gherkin/dist/AstBuilder.js
var AstBuilder = class {
  stack;
  comments;
  newId;
  constructor(newId) {
    this.newId = newId;
    if (!newId) {
      throw new Error("No newId");
    }
    this.reset();
  }
  reset() {
    this.stack = [new AstNode(RuleType.None)];
    this.comments = [];
  }
  startRule(ruleType) {
    this.stack.push(new AstNode(ruleType));
  }
  endRule() {
    const node = this.stack.pop();
    const transformedNode = this.transformNode(node);
    this.currentNode().add(node.ruleType, transformedNode);
  }
  build(token) {
    if (token.matchedType === TokenType.Comment) {
      this.comments.push({
        location: this.getLocation(token),
        text: token.matchedText
      });
    } else {
      this.currentNode().add(token.matchedType, token);
    }
  }
  getResult() {
    return this.currentNode().getSingle(RuleType.GherkinDocument);
  }
  currentNode() {
    return this.stack[this.stack.length - 1];
  }
  getLocation(token, column) {
    return !column ? token.location : { line: token.location.line, column };
  }
  getTags(node) {
    const tags = [];
    const tagsNode = node.getSingle(RuleType.Tags);
    if (!tagsNode) {
      return tags;
    }
    const tokens = tagsNode.getTokens(TokenType.TagLine);
    for (const token of tokens) {
      for (const tagItem of token.matchedItems) {
        tags.push({
          location: this.getLocation(token, tagItem.column),
          name: tagItem.text,
          id: this.newId()
        });
      }
    }
    return tags;
  }
  getCells(tableRowToken) {
    return tableRowToken.matchedItems.map((cellItem) => ({
      location: this.getLocation(tableRowToken, cellItem.column),
      value: cellItem.text
    }));
  }
  getDescription(node) {
    return node.getSingle(RuleType.Description) || "";
  }
  getSteps(node) {
    return node.getItems(RuleType.Step);
  }
  getTableRows(node) {
    const rows = node.getTokens(TokenType.TableRow).map((token) => ({
      id: this.newId(),
      location: this.getLocation(token),
      cells: this.getCells(token)
    }));
    this.ensureCellCount(rows);
    return rows.length === 0 ? [] : rows;
  }
  ensureCellCount(rows) {
    if (rows.length === 0) {
      return;
    }
    const cellCount = rows[0].cells.length;
    rows.forEach((row) => {
      if (row.cells.length !== cellCount) {
        throw AstBuilderException.create("inconsistent cell count within the table", row.location);
      }
    });
  }
  transformNode(node) {
    switch (node.ruleType) {
      case RuleType.Step: {
        const stepLine = node.getToken(TokenType.StepLine);
        const dataTable = node.getSingle(RuleType.DataTable);
        const docString = node.getSingle(RuleType.DocString);
        const location = this.getLocation(stepLine);
        const step = {
          id: this.newId(),
          location,
          keyword: stepLine.matchedKeyword,
          keywordType: stepLine.matchedKeywordType,
          text: stepLine.matchedText,
          dataTable,
          docString
        };
        return step;
      }
      case RuleType.DocString: {
        const separatorToken = node.getTokens(TokenType.DocStringSeparator)[0];
        const mediaType = separatorToken.matchedText.length > 0 ? separatorToken.matchedText : void 0;
        const lineTokens = node.getTokens(TokenType.Other);
        const content = lineTokens.map((t) => t.matchedText).join("\n");
        const result = {
          location: this.getLocation(separatorToken),
          content,
          delimiter: separatorToken.matchedKeyword
        };
        if (mediaType) {
          result.mediaType = mediaType;
        }
        return result;
      }
      case RuleType.DataTable: {
        const rows = this.getTableRows(node);
        const dataTable = {
          location: rows[0].location,
          rows
        };
        return dataTable;
      }
      case RuleType.Background: {
        const backgroundLine = node.getToken(TokenType.BackgroundLine);
        const description = this.getDescription(node);
        const steps = this.getSteps(node);
        const background = {
          id: this.newId(),
          location: this.getLocation(backgroundLine),
          keyword: backgroundLine.matchedKeyword,
          name: backgroundLine.matchedText,
          description,
          steps
        };
        return background;
      }
      case RuleType.ScenarioDefinition: {
        const tags = this.getTags(node);
        const scenarioNode = node.getSingle(RuleType.Scenario);
        const scenarioLine = scenarioNode.getToken(TokenType.ScenarioLine);
        const description = this.getDescription(scenarioNode);
        const steps = this.getSteps(scenarioNode);
        const examples = scenarioNode.getItems(RuleType.ExamplesDefinition);
        const scenario = {
          id: this.newId(),
          tags,
          location: this.getLocation(scenarioLine),
          keyword: scenarioLine.matchedKeyword,
          name: scenarioLine.matchedText,
          description,
          steps,
          examples
        };
        return scenario;
      }
      case RuleType.ExamplesDefinition: {
        const tags = this.getTags(node);
        const examplesNode = node.getSingle(RuleType.Examples);
        const examplesLine = examplesNode.getToken(TokenType.ExamplesLine);
        const description = this.getDescription(examplesNode);
        const examplesTable = examplesNode.getSingle(RuleType.ExamplesTable);
        const examples = {
          id: this.newId(),
          tags,
          location: this.getLocation(examplesLine),
          keyword: examplesLine.matchedKeyword,
          name: examplesLine.matchedText,
          description,
          tableHeader: examplesTable ? examplesTable[0] : void 0,
          tableBody: examplesTable ? examplesTable.slice(1) : []
        };
        return examples;
      }
      case RuleType.ExamplesTable: {
        return this.getTableRows(node);
      }
      case RuleType.Description: {
        let lineTokens = node.getTokens(TokenType.Other);
        let end = lineTokens.length;
        while (end > 0 && lineTokens[end - 1].line.trimmedLineText === "") {
          end--;
        }
        lineTokens = lineTokens.slice(0, end);
        return lineTokens.map((token) => token.matchedText).join("\n");
      }
      case RuleType.Feature: {
        const header = node.getSingle(RuleType.FeatureHeader);
        if (!header) {
          return null;
        }
        const tags = this.getTags(header);
        const featureLine = header.getToken(TokenType.FeatureLine);
        if (!featureLine) {
          return null;
        }
        const children = [];
        const background = node.getSingle(RuleType.Background);
        if (background) {
          children.push({
            background
          });
        }
        for (const scenario of node.getItems(RuleType.ScenarioDefinition)) {
          children.push({
            scenario
          });
        }
        for (const rule of node.getItems(RuleType.Rule)) {
          children.push({
            rule
          });
        }
        const description = this.getDescription(header);
        const language = featureLine.matchedGherkinDialect;
        const feature = {
          tags,
          location: this.getLocation(featureLine),
          language,
          keyword: featureLine.matchedKeyword,
          name: featureLine.matchedText,
          description,
          children
        };
        return feature;
      }
      case RuleType.Rule: {
        const header = node.getSingle(RuleType.RuleHeader);
        if (!header) {
          return null;
        }
        const ruleLine = header.getToken(TokenType.RuleLine);
        if (!ruleLine) {
          return null;
        }
        const tags = this.getTags(header);
        const children = [];
        const background = node.getSingle(RuleType.Background);
        if (background) {
          children.push({
            background
          });
        }
        for (const scenario of node.getItems(RuleType.ScenarioDefinition)) {
          children.push({
            scenario
          });
        }
        const description = this.getDescription(header);
        const rule = {
          id: this.newId(),
          location: this.getLocation(ruleLine),
          keyword: ruleLine.matchedKeyword,
          name: ruleLine.matchedText,
          description,
          children,
          tags
        };
        return rule;
      }
      case RuleType.GherkinDocument: {
        const feature = node.getSingle(RuleType.Feature);
        const gherkinDocument = {
          feature,
          comments: this.comments
        };
        return gherkinDocument;
      }
      default:
        return node;
    }
  }
};

// node_modules/@cucumber/messages/dist/messages.js
var AttachmentContentEncoding;
(function(AttachmentContentEncoding2) {
  AttachmentContentEncoding2["IDENTITY"] = "IDENTITY";
  AttachmentContentEncoding2["BASE64"] = "BASE64";
})(AttachmentContentEncoding || (AttachmentContentEncoding = {}));
var HookType;
(function(HookType2) {
  HookType2["BEFORE_TEST_RUN"] = "BEFORE_TEST_RUN";
  HookType2["AFTER_TEST_RUN"] = "AFTER_TEST_RUN";
  HookType2["BEFORE_TEST_CASE"] = "BEFORE_TEST_CASE";
  HookType2["AFTER_TEST_CASE"] = "AFTER_TEST_CASE";
  HookType2["BEFORE_TEST_STEP"] = "BEFORE_TEST_STEP";
  HookType2["AFTER_TEST_STEP"] = "AFTER_TEST_STEP";
})(HookType || (HookType = {}));
var PickleStepType;
(function(PickleStepType2) {
  PickleStepType2["UNKNOWN"] = "Unknown";
  PickleStepType2["CONTEXT"] = "Context";
  PickleStepType2["ACTION"] = "Action";
  PickleStepType2["OUTCOME"] = "Outcome";
})(PickleStepType || (PickleStepType = {}));
var SourceMediaType;
(function(SourceMediaType2) {
  SourceMediaType2["TEXT_X_CUCUMBER_GHERKIN_PLAIN"] = "text/x.cucumber.gherkin+plain";
  SourceMediaType2["TEXT_X_CUCUMBER_GHERKIN_MARKDOWN"] = "text/x.cucumber.gherkin+markdown";
})(SourceMediaType || (SourceMediaType = {}));
var StepDefinitionPatternType;
(function(StepDefinitionPatternType2) {
  StepDefinitionPatternType2["CUCUMBER_EXPRESSION"] = "CUCUMBER_EXPRESSION";
  StepDefinitionPatternType2["REGULAR_EXPRESSION"] = "REGULAR_EXPRESSION";
})(StepDefinitionPatternType || (StepDefinitionPatternType = {}));
var StepKeywordType;
(function(StepKeywordType2) {
  StepKeywordType2["UNKNOWN"] = "Unknown";
  StepKeywordType2["CONTEXT"] = "Context";
  StepKeywordType2["ACTION"] = "Action";
  StepKeywordType2["OUTCOME"] = "Outcome";
  StepKeywordType2["CONJUNCTION"] = "Conjunction";
})(StepKeywordType || (StepKeywordType = {}));
var TestStepResultStatus;
(function(TestStepResultStatus2) {
  TestStepResultStatus2["UNKNOWN"] = "UNKNOWN";
  TestStepResultStatus2["PASSED"] = "PASSED";
  TestStepResultStatus2["SKIPPED"] = "SKIPPED";
  TestStepResultStatus2["PENDING"] = "PENDING";
  TestStepResultStatus2["UNDEFINED"] = "UNDEFINED";
  TestStepResultStatus2["AMBIGUOUS"] = "AMBIGUOUS";
  TestStepResultStatus2["FAILED"] = "FAILED";
})(TestStepResultStatus || (TestStepResultStatus = {}));

// node_modules/@cucumber/messages/dist/IdGenerator.js
var IdGenerator_exports = {};
__export(IdGenerator_exports, {
  incrementing: () => incrementing,
  uuid: () => uuid
});
function uuid() {
  return () => crypto.randomUUID();
}
function incrementing() {
  let next = 0;
  return () => (next++).toString();
}

// node_modules/@cucumber/gherkin/dist/compareStepKeywords.js
function compareStepKeywords(a, b) {
  return b.length - a.length;
}

// node_modules/@cucumber/gherkin/dist/gherkin-languages.json
var gherkin_languages_default = {
  af: {
    and: [
      "* ",
      "En "
    ],
    background: [
      "Agtergrond"
    ],
    but: [
      "* ",
      "Maar "
    ],
    examples: [
      "Voorbeelde"
    ],
    feature: [
      "Funksie",
      "Besigheid Behoefte",
      "Vermoë"
    ],
    given: [
      "* ",
      "Gegewe "
    ],
    name: "Afrikaans",
    native: "Afrikaans",
    rule: [
      "Reël",
      "Reel"
    ],
    scenario: [
      "Voorbeeld",
      "Situasie"
    ],
    scenarioOutline: [
      "Situasie Uiteensetting"
    ],
    then: [
      "* ",
      "Dan "
    ],
    when: [
      "* ",
      "Wanneer "
    ]
  },
  am: {
    and: [
      "* ",
      "Եվ "
    ],
    background: [
      "Կոնտեքստ"
    ],
    but: [
      "* ",
      "Բայց "
    ],
    examples: [
      "Օրինակներ"
    ],
    feature: [
      "Ֆունկցիոնալություն",
      "Հատկություն"
    ],
    given: [
      "* ",
      "Դիցուք "
    ],
    name: "Armenian",
    native: "հայերեն",
    rule: [
      "Rule"
    ],
    scenario: [
      "Օրինակ",
      "Սցենար"
    ],
    scenarioOutline: [
      "Սցենարի կառուցվացքը"
    ],
    then: [
      "* ",
      "Ապա "
    ],
    when: [
      "* ",
      "Եթե ",
      "Երբ "
    ]
  },
  an: {
    and: [
      "* ",
      "Y ",
      "E "
    ],
    background: [
      "Antecedents"
    ],
    but: [
      "* ",
      "Pero "
    ],
    examples: [
      "Eixemplos"
    ],
    feature: [
      "Caracteristica"
    ],
    given: [
      "* ",
      "Dau ",
      "Dada ",
      "Daus ",
      "Dadas "
    ],
    name: "Aragonese",
    native: "Aragonés",
    rule: [
      "Rule"
    ],
    scenario: [
      "Eixemplo",
      "Caso"
    ],
    scenarioOutline: [
      "Esquema del caso"
    ],
    then: [
      "* ",
      "Alavez ",
      "Allora ",
      "Antonces "
    ],
    when: [
      "* ",
      "Cuan "
    ]
  },
  ar: {
    and: [
      "* ",
      "و "
    ],
    background: [
      "الخلفية"
    ],
    but: [
      "* ",
      "لكن "
    ],
    examples: [
      "امثلة"
    ],
    feature: [
      "خاصية"
    ],
    given: [
      "* ",
      "بفرض "
    ],
    name: "Arabic",
    native: "العربية",
    rule: [
      "Rule"
    ],
    scenario: [
      "مثال",
      "سيناريو"
    ],
    scenarioOutline: [
      "سيناريو مخطط"
    ],
    then: [
      "* ",
      "اذاً ",
      "ثم "
    ],
    when: [
      "* ",
      "متى ",
      "عندما "
    ]
  },
  ast: {
    and: [
      "* ",
      "Y ",
      "Ya "
    ],
    background: [
      "Antecedentes"
    ],
    but: [
      "* ",
      "Peru "
    ],
    examples: [
      "Exemplos"
    ],
    feature: [
      "Carauterística"
    ],
    given: [
      "* ",
      "Dáu ",
      "Dada ",
      "Daos ",
      "Daes "
    ],
    name: "Asturian",
    native: "asturianu",
    rule: [
      "Rule"
    ],
    scenario: [
      "Exemplo",
      "Casu"
    ],
    scenarioOutline: [
      "Esbozu del casu"
    ],
    then: [
      "* ",
      "Entós "
    ],
    when: [
      "* ",
      "Cuando "
    ]
  },
  az: {
    and: [
      "* ",
      "Və ",
      "Həm "
    ],
    background: [
      "Keçmiş",
      "Kontekst"
    ],
    but: [
      "* ",
      "Amma ",
      "Ancaq "
    ],
    examples: [
      "Nümunələr"
    ],
    feature: [
      "Özəllik"
    ],
    given: [
      "* ",
      "Tutaq ki ",
      "Verilir "
    ],
    name: "Azerbaijani",
    native: "Azərbaycanca",
    rule: [
      "Rule"
    ],
    scenario: [
      "Nümunə",
      "Ssenari"
    ],
    scenarioOutline: [
      "Ssenarinin strukturu"
    ],
    then: [
      "* ",
      "O halda "
    ],
    when: [
      "* ",
      "Əgər ",
      "Nə vaxt ki "
    ]
  },
  be: {
    and: [
      "* ",
      "I ",
      "Ды ",
      "Таксама "
    ],
    background: [
      "Кантэкст"
    ],
    but: [
      "* ",
      "Але ",
      "Інакш "
    ],
    examples: [
      "Прыклады"
    ],
    feature: [
      "Функцыянальнасць",
      "Фіча"
    ],
    given: [
      "* ",
      "Няхай ",
      "Дадзена "
    ],
    name: "Belarusian",
    native: "Беларуская",
    rule: [
      "Правілы"
    ],
    scenario: [
      "Сцэнарый",
      "Cцэнар"
    ],
    scenarioOutline: [
      "Шаблон сцэнарыя",
      "Узор сцэнара"
    ],
    then: [
      "* ",
      "Тады "
    ],
    when: [
      "* ",
      "Калі "
    ]
  },
  bg: {
    and: [
      "* ",
      "И "
    ],
    background: [
      "Предистория"
    ],
    but: [
      "* ",
      "Но "
    ],
    examples: [
      "Примери"
    ],
    feature: [
      "Функционалност"
    ],
    given: [
      "* ",
      "Дадено "
    ],
    name: "Bulgarian",
    native: "български",
    rule: [
      "Правило"
    ],
    scenario: [
      "Пример",
      "Сценарий"
    ],
    scenarioOutline: [
      "Рамка на сценарий"
    ],
    then: [
      "* ",
      "То "
    ],
    when: [
      "* ",
      "Когато "
    ]
  },
  bm: {
    and: [
      "* ",
      "Dan "
    ],
    background: [
      "Latar Belakang"
    ],
    but: [
      "* ",
      "Tetapi ",
      "Tapi "
    ],
    examples: [
      "Contoh"
    ],
    feature: [
      "Fungsi"
    ],
    given: [
      "* ",
      "Diberi ",
      "Bagi "
    ],
    name: "Malay",
    native: "Bahasa Melayu",
    rule: [
      "Rule"
    ],
    scenario: [
      "Senario",
      "Situasi",
      "Keadaan"
    ],
    scenarioOutline: [
      "Kerangka Senario",
      "Kerangka Situasi",
      "Kerangka Keadaan",
      "Garis Panduan Senario"
    ],
    then: [
      "* ",
      "Maka ",
      "Kemudian "
    ],
    when: [
      "* ",
      "Apabila "
    ]
  },
  bs: {
    and: [
      "* ",
      "I ",
      "A "
    ],
    background: [
      "Pozadina"
    ],
    but: [
      "* ",
      "Ali "
    ],
    examples: [
      "Primjeri"
    ],
    feature: [
      "Karakteristika"
    ],
    given: [
      "* ",
      "Dato "
    ],
    name: "Bosnian",
    native: "Bosanski",
    rule: [
      "Rule"
    ],
    scenario: [
      "Primjer",
      "Scenariju",
      "Scenario"
    ],
    scenarioOutline: [
      "Scenariju-obris",
      "Scenario-outline"
    ],
    then: [
      "* ",
      "Zatim "
    ],
    when: [
      "* ",
      "Kada "
    ]
  },
  ca: {
    and: [
      "* ",
      "I "
    ],
    background: [
      "Rerefons",
      "Antecedents"
    ],
    but: [
      "* ",
      "Però "
    ],
    examples: [
      "Exemples"
    ],
    feature: [
      "Característica",
      "Funcionalitat"
    ],
    given: [
      "* ",
      "Donat ",
      "Donada ",
      "Atès ",
      "Atesa "
    ],
    name: "Catalan",
    native: "català",
    rule: [
      "Rule"
    ],
    scenario: [
      "Exemple",
      "Escenari"
    ],
    scenarioOutline: [
      "Esquema de l'escenari"
    ],
    then: [
      "* ",
      "Aleshores ",
      "Cal "
    ],
    when: [
      "* ",
      "Quan "
    ]
  },
  cs: {
    and: [
      "* ",
      "A také ",
      "A "
    ],
    background: [
      "Pozadí",
      "Kontext"
    ],
    but: [
      "* ",
      "Ale "
    ],
    examples: [
      "Příklady"
    ],
    feature: [
      "Požadavek"
    ],
    given: [
      "* ",
      "Pokud ",
      "Za předpokladu "
    ],
    name: "Czech",
    native: "Česky",
    rule: [
      "Pravidlo"
    ],
    scenario: [
      "Příklad",
      "Scénář"
    ],
    scenarioOutline: [
      "Náčrt Scénáře",
      "Osnova scénáře"
    ],
    then: [
      "* ",
      "Pak "
    ],
    when: [
      "* ",
      "Když "
    ]
  },
  "cy-GB": {
    and: [
      "* ",
      "A "
    ],
    background: [
      "Cefndir"
    ],
    but: [
      "* ",
      "Ond "
    ],
    examples: [
      "Enghreifftiau"
    ],
    feature: [
      "Arwedd"
    ],
    given: [
      "* ",
      "Anrhegedig a "
    ],
    name: "Welsh",
    native: "Cymraeg",
    rule: [
      "Rule"
    ],
    scenario: [
      "Enghraifft",
      "Scenario"
    ],
    scenarioOutline: [
      "Scenario Amlinellol"
    ],
    then: [
      "* ",
      "Yna "
    ],
    when: [
      "* ",
      "Pryd "
    ]
  },
  da: {
    and: [
      "* ",
      "Og "
    ],
    background: [
      "Baggrund"
    ],
    but: [
      "* ",
      "Men "
    ],
    examples: [
      "Eksempler"
    ],
    feature: [
      "Egenskab"
    ],
    given: [
      "* ",
      "Givet "
    ],
    name: "Danish",
    native: "dansk",
    rule: [
      "Regel"
    ],
    scenario: [
      "Eksempel",
      "Scenarie"
    ],
    scenarioOutline: [
      "Abstrakt Scenario"
    ],
    then: [
      "* ",
      "Så "
    ],
    when: [
      "* ",
      "Når "
    ]
  },
  de: {
    and: [
      "* ",
      "Und "
    ],
    background: [
      "Grundlage",
      "Hintergrund",
      "Voraussetzungen",
      "Vorbedingungen"
    ],
    but: [
      "* ",
      "Aber "
    ],
    examples: [
      "Beispiele"
    ],
    feature: [
      "Funktionalität",
      "Funktion"
    ],
    given: [
      "* ",
      "Angenommen ",
      "Gegeben sei ",
      "Gegeben seien "
    ],
    name: "German",
    native: "Deutsch",
    rule: [
      "Rule",
      "Regel"
    ],
    scenario: [
      "Beispiel",
      "Szenario"
    ],
    scenarioOutline: [
      "Szenariogrundriss",
      "Szenarien"
    ],
    then: [
      "* ",
      "Dann "
    ],
    when: [
      "* ",
      "Wenn "
    ]
  },
  el: {
    and: [
      "* ",
      "Και "
    ],
    background: [
      "Υπόβαθρο"
    ],
    but: [
      "* ",
      "Αλλά "
    ],
    examples: [
      "Παραδείγματα",
      "Σενάρια"
    ],
    feature: [
      "Δυνατότητα",
      "Λειτουργία"
    ],
    given: [
      "* ",
      "Δεδομένου "
    ],
    name: "Greek",
    native: "Ελληνικά",
    rule: [
      "Rule"
    ],
    scenario: [
      "Παράδειγμα",
      "Σενάριο"
    ],
    scenarioOutline: [
      "Περιγραφή Σεναρίου",
      "Περίγραμμα Σεναρίου"
    ],
    then: [
      "* ",
      "Τότε "
    ],
    when: [
      "* ",
      "Όταν "
    ]
  },
  em: {
    and: [
      "* ",
      "😂"
    ],
    background: [
      "💤"
    ],
    but: [
      "* ",
      "😔"
    ],
    examples: [
      "📓"
    ],
    feature: [
      "📚"
    ],
    given: [
      "* ",
      "😐"
    ],
    name: "Emoji",
    native: "😀",
    rule: [
      "Rule"
    ],
    scenario: [
      "🥒",
      "📕"
    ],
    scenarioOutline: [
      "📖"
    ],
    then: [
      "* ",
      "🙏"
    ],
    when: [
      "* ",
      "🎬"
    ]
  },
  en: {
    and: [
      "* ",
      "And "
    ],
    background: [
      "Background"
    ],
    but: [
      "* ",
      "But "
    ],
    examples: [
      "Examples",
      "Scenarios"
    ],
    feature: [
      "Feature",
      "Business Need",
      "Ability"
    ],
    given: [
      "* ",
      "Given "
    ],
    name: "English",
    native: "English",
    rule: [
      "Rule"
    ],
    scenario: [
      "Example",
      "Scenario"
    ],
    scenarioOutline: [
      "Scenario Outline",
      "Scenario Template"
    ],
    then: [
      "* ",
      "Then "
    ],
    when: [
      "* ",
      "When "
    ]
  },
  "en-Scouse": {
    and: [
      "* ",
      "An "
    ],
    background: [
      "Dis is what went down"
    ],
    but: [
      "* ",
      "Buh "
    ],
    examples: [
      "Examples"
    ],
    feature: [
      "Feature"
    ],
    given: [
      "* ",
      "Givun ",
      "Youse know when youse got "
    ],
    name: "Scouse",
    native: "Scouse",
    rule: [
      "Rule"
    ],
    scenario: [
      "The thing of it is"
    ],
    scenarioOutline: [
      "Wharrimean is"
    ],
    then: [
      "* ",
      "Dun ",
      "Den youse gotta "
    ],
    when: [
      "* ",
      "Wun ",
      "Youse know like when "
    ]
  },
  "en-au": {
    and: [
      "* ",
      "Too right "
    ],
    background: [
      "First off"
    ],
    but: [
      "* ",
      "Yeah nah "
    ],
    examples: [
      "You'll wanna"
    ],
    feature: [
      "Pretty much"
    ],
    given: [
      "* ",
      "Y'know "
    ],
    name: "Australian",
    native: "Australian",
    rule: [
      "Rule"
    ],
    scenario: [
      "Awww, look mate"
    ],
    scenarioOutline: [
      "Reckon it's like"
    ],
    then: [
      "* ",
      "But at the end of the day I reckon "
    ],
    when: [
      "* ",
      "It's just unbelievable "
    ]
  },
  "en-lol": {
    and: [
      "* ",
      "AN "
    ],
    background: [
      "B4"
    ],
    but: [
      "* ",
      "BUT "
    ],
    examples: [
      "EXAMPLZ"
    ],
    feature: [
      "OH HAI"
    ],
    given: [
      "* ",
      "I CAN HAZ "
    ],
    name: "LOLCAT",
    native: "LOLCAT",
    rule: [
      "Rule"
    ],
    scenario: [
      "MISHUN"
    ],
    scenarioOutline: [
      "MISHUN SRSLY"
    ],
    then: [
      "* ",
      "DEN "
    ],
    when: [
      "* ",
      "WEN "
    ]
  },
  "en-old": {
    and: [
      "* ",
      "Ond ",
      "7 "
    ],
    background: [
      "Aer",
      "Ær"
    ],
    but: [
      "* ",
      "Ac "
    ],
    examples: [
      "Se the",
      "Se þe",
      "Se ðe"
    ],
    feature: [
      "Hwaet",
      "Hwæt"
    ],
    given: [
      "* ",
      "Thurh ",
      "Þurh ",
      "Ðurh "
    ],
    name: "Old English",
    native: "Englisc",
    rule: [
      "Rule"
    ],
    scenario: [
      "Swa"
    ],
    scenarioOutline: [
      "Swa hwaer swa",
      "Swa hwær swa"
    ],
    then: [
      "* ",
      "Tha ",
      "Þa ",
      "Ða ",
      "Tha the ",
      "Þa þe ",
      "Ða ðe "
    ],
    when: [
      "* ",
      "Bæþsealf ",
      "Bæþsealfa ",
      "Bæþsealfe ",
      "Ciricæw ",
      "Ciricæwe ",
      "Ciricæwa "
    ]
  },
  "en-pirate": {
    and: [
      "* ",
      "Aye "
    ],
    background: [
      "Yo-ho-ho"
    ],
    but: [
      "* ",
      "Avast! "
    ],
    examples: [
      "Dead men tell no tales"
    ],
    feature: [
      "Ahoy matey!"
    ],
    given: [
      "* ",
      "Gangway! "
    ],
    name: "Pirate",
    native: "Pirate",
    rule: [
      "Rule"
    ],
    scenario: [
      "Heave to"
    ],
    scenarioOutline: [
      "Shiver me timbers"
    ],
    then: [
      "* ",
      "Let go and haul "
    ],
    when: [
      "* ",
      "Blimey! "
    ]
  },
  "en-tx": {
    and: [
      "Come hell or high water "
    ],
    background: [
      "Lemme tell y'all a story"
    ],
    but: [
      "Well now hold on, I'll you what "
    ],
    examples: [
      "Now that's a story longer than a cattle drive in July"
    ],
    feature: [
      "This ain’t my first rodeo",
      "All gussied up"
    ],
    given: [
      "Fixin' to ",
      "All git out "
    ],
    name: "Texas",
    native: "Texas",
    rule: [
      "Rule "
    ],
    scenario: [
      "All hat and no cattle"
    ],
    scenarioOutline: [
      "Serious as a snake bite",
      "Busy as a hound in flea season"
    ],
    then: [
      "There’s no tree but bears some fruit "
    ],
    when: [
      "Quick out of the chute "
    ]
  },
  eo: {
    and: [
      "* ",
      "Kaj "
    ],
    background: [
      "Fono"
    ],
    but: [
      "* ",
      "Sed "
    ],
    examples: [
      "Ekzemploj"
    ],
    feature: [
      "Trajto"
    ],
    given: [
      "* ",
      "Donitaĵo ",
      "Komence "
    ],
    name: "Esperanto",
    native: "Esperanto",
    rule: [
      "Regulo"
    ],
    scenario: [
      "Ekzemplo",
      "Scenaro",
      "Kazo"
    ],
    scenarioOutline: [
      "Konturo de la scenaro",
      "Skizo",
      "Kazo-skizo"
    ],
    then: [
      "* ",
      "Do "
    ],
    when: [
      "* ",
      "Se "
    ]
  },
  es: {
    and: [
      "* ",
      "Y ",
      "E "
    ],
    background: [
      "Antecedentes"
    ],
    but: [
      "* ",
      "Pero "
    ],
    examples: [
      "Ejemplos"
    ],
    feature: [
      "Característica",
      "Necesidad del negocio",
      "Requisito"
    ],
    given: [
      "* ",
      "Dado ",
      "Dada ",
      "Dados ",
      "Dadas "
    ],
    name: "Spanish",
    native: "español",
    rule: [
      "Regla",
      "Regla de negocio"
    ],
    scenario: [
      "Ejemplo",
      "Escenario"
    ],
    scenarioOutline: [
      "Esquema del escenario"
    ],
    then: [
      "* ",
      "Entonces "
    ],
    when: [
      "* ",
      "Cuando "
    ]
  },
  et: {
    and: [
      "* ",
      "Ja "
    ],
    background: [
      "Taust"
    ],
    but: [
      "* ",
      "Kuid "
    ],
    examples: [
      "Juhtumid"
    ],
    feature: [
      "Omadus"
    ],
    given: [
      "* ",
      "Eeldades "
    ],
    name: "Estonian",
    native: "eesti keel",
    rule: [
      "Reegel"
    ],
    scenario: [
      "Juhtum",
      "Stsenaarium"
    ],
    scenarioOutline: [
      "Raamjuhtum",
      "Raamstsenaarium"
    ],
    then: [
      "* ",
      "Siis "
    ],
    when: [
      "* ",
      "Kui "
    ]
  },
  fa: {
    and: [
      "* ",
      "و "
    ],
    background: [
      "زمینه",
      "پیش زمینه",
      "مقدمات"
    ],
    but: [
      "* ",
      "اما "
    ],
    examples: [
      "نمونه ها"
    ],
    feature: [
      "ویژگی",
      "قابلیت"
    ],
    given: [
      "* ",
      "با فرض ",
      "فرض کنید ",
      "با در نظر گرفتن "
    ],
    name: "Persian",
    native: "فارسی",
    rule: [
      "قانون"
    ],
    scenario: [
      "مثال",
      "سناریو"
    ],
    scenarioOutline: [
      "الگوی سناریو"
    ],
    then: [
      "* ",
      "آنگاه ",
      "سپس ",
      "انتظار می رود "
    ],
    when: [
      "* ",
      "هنگامی ",
      "وقتی "
    ]
  },
  fi: {
    and: [
      "* ",
      "Ja "
    ],
    background: [
      "Tausta"
    ],
    but: [
      "* ",
      "Mutta "
    ],
    examples: [
      "Tapaukset"
    ],
    feature: [
      "Ominaisuus"
    ],
    given: [
      "* ",
      "Oletetaan "
    ],
    name: "Finnish",
    native: "suomi",
    rule: [
      "Rule"
    ],
    scenario: [
      "Tapaus"
    ],
    scenarioOutline: [
      "Tapausaihio"
    ],
    then: [
      "* ",
      "Niin "
    ],
    when: [
      "* ",
      "Kun "
    ]
  },
  fr: {
    and: [
      "* ",
      "Et que ",
      "Et qu'",
      "Et "
    ],
    background: [
      "Contexte"
    ],
    but: [
      "* ",
      "Mais que ",
      "Mais qu'",
      "Mais "
    ],
    examples: [
      "Exemples"
    ],
    feature: [
      "Fonctionnalité"
    ],
    given: [
      "* ",
      "Soit ",
      "Sachant que ",
      "Sachant qu'",
      "Sachant ",
      "Etant donné que ",
      "Etant donné qu'",
      "Etant donné ",
      "Etant donnée ",
      "Etant donnés ",
      "Etant données ",
      "Étant donné que ",
      "Étant donné qu'",
      "Étant donné ",
      "Étant donnée ",
      "Étant donnés ",
      "Étant données "
    ],
    name: "French",
    native: "français",
    rule: [
      "Règle"
    ],
    scenario: [
      "Exemple",
      "Scénario"
    ],
    scenarioOutline: [
      "Plan du scénario",
      "Plan du Scénario"
    ],
    then: [
      "* ",
      "Alors ",
      "Donc "
    ],
    when: [
      "* ",
      "Quand ",
      "Lorsque ",
      "Lorsqu'"
    ]
  },
  ga: {
    and: [
      "* ",
      "Agus "
    ],
    background: [
      "Cúlra"
    ],
    but: [
      "* ",
      "Ach "
    ],
    examples: [
      "Samplaí"
    ],
    feature: [
      "Gné"
    ],
    given: [
      "* ",
      "Cuir i gcás go ",
      "Cuir i gcás nach ",
      "Cuir i gcás gur ",
      "Cuir i gcás nár "
    ],
    name: "Irish",
    native: "Gaeilge",
    rule: [
      "Riail"
    ],
    scenario: [
      "Sampla",
      "Cás"
    ],
    scenarioOutline: [
      "Cás Achomair"
    ],
    then: [
      "* ",
      "Ansin "
    ],
    when: [
      "* ",
      "Nuair a ",
      "Nuair nach ",
      "Nuair ba ",
      "Nuair nár "
    ]
  },
  gj: {
    and: [
      "* ",
      "અને "
    ],
    background: [
      "બેકગ્રાઉન્ડ"
    ],
    but: [
      "* ",
      "પણ "
    ],
    examples: [
      "ઉદાહરણો"
    ],
    feature: [
      "લક્ષણ",
      "વ્યાપાર જરૂર",
      "ક્ષમતા"
    ],
    given: [
      "* ",
      "આપેલ છે "
    ],
    name: "Gujarati",
    native: "ગુજરાતી",
    rule: [
      "નિયમ"
    ],
    scenario: [
      "ઉદાહરણ",
      "સ્થિતિ"
    ],
    scenarioOutline: [
      "પરિદ્દશ્ય રૂપરેખા",
      "પરિદ્દશ્ય ઢાંચો"
    ],
    then: [
      "* ",
      "પછી "
    ],
    when: [
      "* ",
      "ક્યારે "
    ]
  },
  gl: {
    and: [
      "* ",
      "E "
    ],
    background: [
      "Contexto"
    ],
    but: [
      "* ",
      "Mais ",
      "Pero "
    ],
    examples: [
      "Exemplos"
    ],
    feature: [
      "Característica"
    ],
    given: [
      "* ",
      "Dado ",
      "Dada ",
      "Dados ",
      "Dadas "
    ],
    name: "Galician",
    native: "galego",
    rule: [
      "Rule"
    ],
    scenario: [
      "Exemplo",
      "Escenario"
    ],
    scenarioOutline: [
      "Esbozo do escenario"
    ],
    then: [
      "* ",
      "Entón ",
      "Logo "
    ],
    when: [
      "* ",
      "Cando "
    ]
  },
  he: {
    and: [
      "* ",
      "וגם "
    ],
    background: [
      "רקע"
    ],
    but: [
      "* ",
      "אבל "
    ],
    examples: [
      "דוגמאות"
    ],
    feature: [
      "תכונה"
    ],
    given: [
      "* ",
      "בהינתן "
    ],
    name: "Hebrew",
    native: "עברית",
    rule: [
      "כלל"
    ],
    scenario: [
      "דוגמא",
      "תרחיש"
    ],
    scenarioOutline: [
      "תבנית תרחיש"
    ],
    then: [
      "* ",
      "אז ",
      "אזי "
    ],
    when: [
      "* ",
      "כאשר "
    ]
  },
  hi: {
    and: [
      "* ",
      "और ",
      "तथा "
    ],
    background: [
      "पृष्ठभूमि"
    ],
    but: [
      "* ",
      "पर ",
      "परन्तु ",
      "किन्तु "
    ],
    examples: [
      "उदाहरण"
    ],
    feature: [
      "रूप लेख"
    ],
    given: [
      "* ",
      "अगर ",
      "यदि ",
      "चूंकि "
    ],
    name: "Hindi",
    native: "हिंदी",
    rule: [
      "नियम"
    ],
    scenario: [
      "परिदृश्य"
    ],
    scenarioOutline: [
      "परिदृश्य रूपरेखा"
    ],
    then: [
      "* ",
      "तब ",
      "तदा "
    ],
    when: [
      "* ",
      "जब ",
      "कदा "
    ]
  },
  hr: {
    and: [
      "* ",
      "I "
    ],
    background: [
      "Pozadina"
    ],
    but: [
      "* ",
      "Ali "
    ],
    examples: [
      "Primjeri",
      "Scenariji"
    ],
    feature: [
      "Osobina",
      "Mogućnost",
      "Mogucnost"
    ],
    given: [
      "* ",
      "Zadan ",
      "Zadani ",
      "Zadano ",
      "Ukoliko "
    ],
    name: "Croatian",
    native: "hrvatski",
    rule: [
      "Rule"
    ],
    scenario: [
      "Primjer",
      "Scenarij"
    ],
    scenarioOutline: [
      "Skica",
      "Koncept"
    ],
    then: [
      "* ",
      "Onda "
    ],
    when: [
      "* ",
      "Kada ",
      "Kad "
    ]
  },
  ht: {
    and: [
      "* ",
      "Ak ",
      "Epi ",
      "E "
    ],
    background: [
      "Kontèks",
      "Istorik"
    ],
    but: [
      "* ",
      "Men "
    ],
    examples: [
      "Egzanp"
    ],
    feature: [
      "Karakteristik",
      "Mak",
      "Fonksyonalite"
    ],
    given: [
      "* ",
      "Sipoze ",
      "Sipoze ke ",
      "Sipoze Ke "
    ],
    name: "Creole",
    native: "kreyòl",
    rule: [
      "Rule"
    ],
    scenario: [
      "Senaryo"
    ],
    scenarioOutline: [
      "Plan senaryo",
      "Plan Senaryo",
      "Senaryo deskripsyon",
      "Senaryo Deskripsyon",
      "Dyagram senaryo",
      "Dyagram Senaryo"
    ],
    then: [
      "* ",
      "Lè sa a ",
      "Le sa a "
    ],
    when: [
      "* ",
      "Lè ",
      "Le "
    ]
  },
  hu: {
    and: [
      "* ",
      "És "
    ],
    background: [
      "Háttér"
    ],
    but: [
      "* ",
      "De "
    ],
    examples: [
      "Példák"
    ],
    feature: [
      "Jellemző"
    ],
    given: [
      "* ",
      "Amennyiben ",
      "Adott "
    ],
    name: "Hungarian",
    native: "magyar",
    rule: [
      "Szabály"
    ],
    scenario: [
      "Példa",
      "Forgatókönyv"
    ],
    scenarioOutline: [
      "Forgatókönyv vázlat"
    ],
    then: [
      "* ",
      "Akkor "
    ],
    when: [
      "* ",
      "Majd ",
      "Ha ",
      "Amikor "
    ]
  },
  id: {
    and: [
      "* ",
      "Dan "
    ],
    background: [
      "Dasar",
      "Latar Belakang"
    ],
    but: [
      "* ",
      "Tapi ",
      "Tetapi "
    ],
    examples: [
      "Contoh",
      "Misal"
    ],
    feature: [
      "Fitur"
    ],
    given: [
      "* ",
      "Dengan ",
      "Diketahui ",
      "Diasumsikan ",
      "Bila ",
      "Jika "
    ],
    name: "Indonesian",
    native: "Bahasa Indonesia",
    rule: [
      "Rule",
      "Aturan"
    ],
    scenario: [
      "Skenario"
    ],
    scenarioOutline: [
      "Skenario konsep",
      "Garis-Besar Skenario"
    ],
    then: [
      "* ",
      "Maka ",
      "Kemudian "
    ],
    when: [
      "* ",
      "Ketika "
    ]
  },
  is: {
    and: [
      "* ",
      "Og "
    ],
    background: [
      "Bakgrunnur"
    ],
    but: [
      "* ",
      "En "
    ],
    examples: [
      "Dæmi",
      "Atburðarásir"
    ],
    feature: [
      "Eiginleiki"
    ],
    given: [
      "* ",
      "Ef "
    ],
    name: "Icelandic",
    native: "Íslenska",
    rule: [
      "Rule"
    ],
    scenario: [
      "Atburðarás"
    ],
    scenarioOutline: [
      "Lýsing Atburðarásar",
      "Lýsing Dæma"
    ],
    then: [
      "* ",
      "Þá "
    ],
    when: [
      "* ",
      "Þegar "
    ]
  },
  it: {
    and: [
      "* ",
      "E ",
      "Ed "
    ],
    background: [
      "Contesto"
    ],
    but: [
      "* ",
      "Ma "
    ],
    examples: [
      "Esempi"
    ],
    feature: [
      "Funzionalità",
      "Esigenza di Business",
      "Abilità"
    ],
    given: [
      "* ",
      "Dato ",
      "Data ",
      "Dati ",
      "Date "
    ],
    name: "Italian",
    native: "italiano",
    rule: [
      "Regola"
    ],
    scenario: [
      "Esempio",
      "Scenario"
    ],
    scenarioOutline: [
      "Schema dello scenario"
    ],
    then: [
      "* ",
      "Allora "
    ],
    when: [
      "* ",
      "Quando "
    ]
  },
  ja: {
    and: [
      "* ",
      "且つ",
      "かつ"
    ],
    background: [
      "背景"
    ],
    but: [
      "* ",
      "然し",
      "しかし",
      "但し",
      "ただし"
    ],
    examples: [
      "例",
      "サンプル"
    ],
    feature: [
      "フィーチャ",
      "機能"
    ],
    given: [
      "* ",
      "前提"
    ],
    name: "Japanese",
    native: "日本語",
    rule: [
      "ルール"
    ],
    scenario: [
      "シナリオ"
    ],
    scenarioOutline: [
      "シナリオアウトライン",
      "シナリオテンプレート",
      "テンプレ",
      "シナリオテンプレ"
    ],
    then: [
      "* ",
      "ならば"
    ],
    when: [
      "* ",
      "もし"
    ]
  },
  jv: {
    and: [
      "* ",
      "Lan "
    ],
    background: [
      "Dasar"
    ],
    but: [
      "* ",
      "Tapi ",
      "Nanging ",
      "Ananging "
    ],
    examples: [
      "Conto",
      "Contone"
    ],
    feature: [
      "Fitur"
    ],
    given: [
      "* ",
      "Nalika ",
      "Nalikaning "
    ],
    name: "Javanese",
    native: "Basa Jawa",
    rule: [
      "Rule"
    ],
    scenario: [
      "Skenario"
    ],
    scenarioOutline: [
      "Konsep skenario"
    ],
    then: [
      "* ",
      "Njuk ",
      "Banjur "
    ],
    when: [
      "* ",
      "Manawa ",
      "Menawa "
    ]
  },
  ka: {
    and: [
      "* ",
      "და ",
      "ასევე "
    ],
    background: [
      "კონტექსტი"
    ],
    but: [
      "* ",
      "მაგრამ ",
      "თუმცა "
    ],
    examples: [
      "მაგალითები"
    ],
    feature: [
      "თვისება",
      "მოთხოვნა"
    ],
    given: [
      "* ",
      "მოცემული ",
      "მოცემულია ",
      "ვთქვათ "
    ],
    name: "Georgian",
    native: "ქართული",
    rule: [
      "წესი"
    ],
    scenario: [
      "მაგალითად",
      "მაგალითი",
      "მაგ",
      "სცენარი"
    ],
    scenarioOutline: [
      "სცენარის ნიმუში",
      "სცენარის შაბლონი",
      "ნიმუში",
      "შაბლონი"
    ],
    then: [
      "* ",
      "მაშინ "
    ],
    when: [
      "* ",
      "როდესაც ",
      "როცა ",
      "როგორც კი ",
      "თუ "
    ]
  },
  kn: {
    and: [
      "* ",
      "ಮತ್ತು "
    ],
    background: [
      "ಹಿನ್ನೆಲೆ"
    ],
    but: [
      "* ",
      "ಆದರೆ "
    ],
    examples: [
      "ಉದಾಹರಣೆಗಳು"
    ],
    feature: [
      "ಹೆಚ್ಚಳ"
    ],
    given: [
      "* ",
      "ನೀಡಿದ "
    ],
    name: "Kannada",
    native: "ಕನ್ನಡ",
    rule: [
      "Rule"
    ],
    scenario: [
      "ಉದಾಹರಣೆ",
      "ಕಥಾಸಾರಾಂಶ"
    ],
    scenarioOutline: [
      "ವಿವರಣೆ"
    ],
    then: [
      "* ",
      "ನಂತರ "
    ],
    when: [
      "* ",
      "ಸ್ಥಿತಿಯನ್ನು "
    ]
  },
  ko: {
    and: [
      "* ",
      "그리고 "
    ],
    background: [
      "배경"
    ],
    but: [
      "* ",
      "하지만 ",
      "단 "
    ],
    examples: [
      "예"
    ],
    feature: [
      "기능"
    ],
    given: [
      "* ",
      "조건 ",
      "먼저 "
    ],
    name: "Korean",
    native: "한국어",
    rule: [
      "규칙"
    ],
    scenario: [
      "시나리오"
    ],
    scenarioOutline: [
      "시나리오 개요"
    ],
    then: [
      "* ",
      "그러면 "
    ],
    when: [
      "* ",
      "만일 ",
      "만약 "
    ]
  },
  lt: {
    and: [
      "* ",
      "Ir "
    ],
    background: [
      "Kontekstas"
    ],
    but: [
      "* ",
      "Bet "
    ],
    examples: [
      "Pavyzdžiai",
      "Scenarijai",
      "Variantai"
    ],
    feature: [
      "Savybė"
    ],
    given: [
      "* ",
      "Duota "
    ],
    name: "Lithuanian",
    native: "lietuvių kalba",
    rule: [
      "Rule"
    ],
    scenario: [
      "Pavyzdys",
      "Scenarijus"
    ],
    scenarioOutline: [
      "Scenarijaus šablonas"
    ],
    then: [
      "* ",
      "Tada "
    ],
    when: [
      "* ",
      "Kai "
    ]
  },
  lu: {
    and: [
      "* ",
      "an ",
      "a "
    ],
    background: [
      "Hannergrond"
    ],
    but: [
      "* ",
      "awer ",
      "mä "
    ],
    examples: [
      "Beispiller"
    ],
    feature: [
      "Funktionalitéit"
    ],
    given: [
      "* ",
      "ugeholl "
    ],
    name: "Luxemburgish",
    native: "Lëtzebuergesch",
    rule: [
      "Rule"
    ],
    scenario: [
      "Beispill",
      "Szenario"
    ],
    scenarioOutline: [
      "Plang vum Szenario"
    ],
    then: [
      "* ",
      "dann "
    ],
    when: [
      "* ",
      "wann "
    ]
  },
  lv: {
    and: [
      "* ",
      "Un "
    ],
    background: [
      "Konteksts",
      "Situācija"
    ],
    but: [
      "* ",
      "Bet "
    ],
    examples: [
      "Piemēri",
      "Paraugs"
    ],
    feature: [
      "Funkcionalitāte",
      "Fīča"
    ],
    given: [
      "* ",
      "Kad "
    ],
    name: "Latvian",
    native: "latviešu",
    rule: [
      "Rule"
    ],
    scenario: [
      "Piemērs",
      "Scenārijs"
    ],
    scenarioOutline: [
      "Scenārijs pēc parauga"
    ],
    then: [
      "* ",
      "Tad "
    ],
    when: [
      "* ",
      "Ja "
    ]
  },
  "mk-Cyrl": {
    and: [
      "* ",
      "И "
    ],
    background: [
      "Контекст",
      "Содржина"
    ],
    but: [
      "* ",
      "Но "
    ],
    examples: [
      "Примери",
      "Сценарија"
    ],
    feature: [
      "Функционалност",
      "Бизнис потреба",
      "Можност"
    ],
    given: [
      "* ",
      "Дадено ",
      "Дадена "
    ],
    name: "Macedonian",
    native: "Македонски",
    rule: [
      "Rule"
    ],
    scenario: [
      "Пример",
      "Сценарио",
      "На пример"
    ],
    scenarioOutline: [
      "Преглед на сценарија",
      "Скица",
      "Концепт"
    ],
    then: [
      "* ",
      "Тогаш "
    ],
    when: [
      "* ",
      "Кога "
    ]
  },
  "mk-Latn": {
    and: [
      "* ",
      "I "
    ],
    background: [
      "Kontekst",
      "Sodrzhina"
    ],
    but: [
      "* ",
      "No "
    ],
    examples: [
      "Primeri",
      "Scenaria"
    ],
    feature: [
      "Funkcionalnost",
      "Biznis potreba",
      "Mozhnost"
    ],
    given: [
      "* ",
      "Dadeno ",
      "Dadena "
    ],
    name: "Macedonian (Latin)",
    native: "Makedonski (Latinica)",
    rule: [
      "Rule"
    ],
    scenario: [
      "Scenario",
      "Na primer"
    ],
    scenarioOutline: [
      "Pregled na scenarija",
      "Skica",
      "Koncept"
    ],
    then: [
      "* ",
      "Togash "
    ],
    when: [
      "* ",
      "Koga "
    ]
  },
  mn: {
    and: [
      "* ",
      "Мөн ",
      "Тэгээд "
    ],
    background: [
      "Агуулга"
    ],
    but: [
      "* ",
      "Гэхдээ ",
      "Харин "
    ],
    examples: [
      "Тухайлбал"
    ],
    feature: [
      "Функц",
      "Функционал"
    ],
    given: [
      "* ",
      "Өгөгдсөн нь ",
      "Анх "
    ],
    name: "Mongolian",
    native: "монгол",
    rule: [
      "Rule"
    ],
    scenario: [
      "Сценар"
    ],
    scenarioOutline: [
      "Сценарын төлөвлөгөө"
    ],
    then: [
      "* ",
      "Тэгэхэд ",
      "Үүний дараа "
    ],
    when: [
      "* ",
      "Хэрэв "
    ]
  },
  ne: {
    and: [
      "* ",
      "र ",
      "अनि "
    ],
    background: [
      "पृष्ठभूमी"
    ],
    but: [
      "* ",
      "तर "
    ],
    examples: [
      "उदाहरण",
      "उदाहरणहरु"
    ],
    feature: [
      "सुविधा",
      "विशेषता"
    ],
    given: [
      "* ",
      "दिइएको ",
      "दिएको ",
      "यदि "
    ],
    name: "Nepali",
    native: "नेपाली",
    rule: [
      "नियम"
    ],
    scenario: [
      "परिदृश्य"
    ],
    scenarioOutline: [
      "परिदृश्य रूपरेखा"
    ],
    then: [
      "* ",
      "त्यसपछि ",
      "अनी "
    ],
    when: [
      "* ",
      "जब "
    ]
  },
  nl: {
    and: [
      "* ",
      "En "
    ],
    background: [
      "Achtergrond"
    ],
    but: [
      "* ",
      "Maar "
    ],
    examples: [
      "Voorbeelden"
    ],
    feature: [
      "Functionaliteit"
    ],
    given: [
      "* ",
      "Gegeven ",
      "Stel "
    ],
    name: "Dutch",
    native: "Nederlands",
    rule: [
      "Regel"
    ],
    scenario: [
      "Voorbeeld",
      "Scenario"
    ],
    scenarioOutline: [
      "Abstract Scenario"
    ],
    then: [
      "* ",
      "Dan "
    ],
    when: [
      "* ",
      "Als ",
      "Wanneer "
    ]
  },
  no: {
    and: [
      "* ",
      "Og "
    ],
    background: [
      "Bakgrunn"
    ],
    but: [
      "* ",
      "Men "
    ],
    examples: [
      "Eksempler"
    ],
    feature: [
      "Egenskap"
    ],
    given: [
      "* ",
      "Gitt "
    ],
    name: "Norwegian",
    native: "norsk",
    rule: [
      "Regel"
    ],
    scenario: [
      "Eksempel",
      "Scenario"
    ],
    scenarioOutline: [
      "Scenariomal",
      "Abstrakt Scenario"
    ],
    then: [
      "* ",
      "Så "
    ],
    when: [
      "* ",
      "Når "
    ]
  },
  pa: {
    and: [
      "* ",
      "ਅਤੇ "
    ],
    background: [
      "ਪਿਛੋਕੜ"
    ],
    but: [
      "* ",
      "ਪਰ "
    ],
    examples: [
      "ਉਦਾਹਰਨਾਂ"
    ],
    feature: [
      "ਖਾਸੀਅਤ",
      "ਮੁਹਾਂਦਰਾ",
      "ਨਕਸ਼ ਨੁਹਾਰ"
    ],
    given: [
      "* ",
      "ਜੇਕਰ ",
      "ਜਿਵੇਂ ਕਿ "
    ],
    name: "Panjabi",
    native: "ਪੰਜਾਬੀ",
    rule: [
      "Rule"
    ],
    scenario: [
      "ਉਦਾਹਰਨ",
      "ਪਟਕਥਾ"
    ],
    scenarioOutline: [
      "ਪਟਕਥਾ ਢਾਂਚਾ",
      "ਪਟਕਥਾ ਰੂਪ ਰੇਖਾ"
    ],
    then: [
      "* ",
      "ਤਦ "
    ],
    when: [
      "* ",
      "ਜਦੋਂ "
    ]
  },
  pl: {
    and: [
      "* ",
      "Oraz ",
      "I "
    ],
    background: [
      "Założenia"
    ],
    but: [
      "* ",
      "Ale "
    ],
    examples: [
      "Przykłady"
    ],
    feature: [
      "Właściwość",
      "Funkcja",
      "Aspekt",
      "Potrzeba biznesowa"
    ],
    given: [
      "* ",
      "Zakładając ",
      "Mając ",
      "Zakładając, że "
    ],
    name: "Polish",
    native: "polski",
    rule: [
      "Zasada",
      "Reguła"
    ],
    scenario: [
      "Przykład",
      "Scenariusz"
    ],
    scenarioOutline: [
      "Szablon scenariusza"
    ],
    then: [
      "* ",
      "Wtedy "
    ],
    when: [
      "* ",
      "Jeżeli ",
      "Jeśli ",
      "Gdy ",
      "Kiedy "
    ]
  },
  pt: {
    and: [
      "* ",
      "E "
    ],
    background: [
      "Contexto",
      "Cenário de Fundo",
      "Cenario de Fundo",
      "Fundo"
    ],
    but: [
      "* ",
      "Mas "
    ],
    examples: [
      "Exemplos",
      "Cenários",
      "Cenarios"
    ],
    feature: [
      "Funcionalidade",
      "Característica",
      "Caracteristica"
    ],
    given: [
      "* ",
      "Dado ",
      "Dada ",
      "Dados ",
      "Dadas "
    ],
    name: "Portuguese",
    native: "português",
    rule: [
      "Regra"
    ],
    scenario: [
      "Exemplo",
      "Cenário",
      "Cenario"
    ],
    scenarioOutline: [
      "Esquema do Cenário",
      "Esquema do Cenario",
      "Delineação do Cenário",
      "Delineacao do Cenario"
    ],
    then: [
      "* ",
      "Então ",
      "Entao "
    ],
    when: [
      "* ",
      "Quando "
    ]
  },
  ro: {
    and: [
      "* ",
      "Si ",
      "Și ",
      "Şi "
    ],
    background: [
      "Context"
    ],
    but: [
      "* ",
      "Dar "
    ],
    examples: [
      "Exemple"
    ],
    feature: [
      "Functionalitate",
      "Funcționalitate",
      "Funcţionalitate"
    ],
    given: [
      "* ",
      "Date fiind ",
      "Dat fiind ",
      "Dată fiind",
      "Dati fiind ",
      "Dați fiind ",
      "Daţi fiind "
    ],
    name: "Romanian",
    native: "română",
    rule: [
      "Rule"
    ],
    scenario: [
      "Exemplu",
      "Scenariu"
    ],
    scenarioOutline: [
      "Structura scenariu",
      "Structură scenariu"
    ],
    then: [
      "* ",
      "Atunci "
    ],
    when: [
      "* ",
      "Cand ",
      "Când "
    ]
  },
  ru: {
    and: [
      "* ",
      "И ",
      "К тому же ",
      "Также "
    ],
    background: [
      "Предыстория",
      "Контекст"
    ],
    but: [
      "* ",
      "Но ",
      "А ",
      "Иначе "
    ],
    examples: [
      "Примеры",
      "Значения"
    ],
    feature: [
      "Функция",
      "Функциональность",
      "Функционал",
      "Свойство",
      "Фича"
    ],
    given: [
      "* ",
      "Допустим ",
      "Дано ",
      "Пусть "
    ],
    name: "Russian",
    native: "русский",
    rule: [
      "Правило"
    ],
    scenario: [
      "Пример",
      "Сценарий"
    ],
    scenarioOutline: [
      "Структура сценария",
      "Шаблон сценария"
    ],
    then: [
      "* ",
      "То ",
      "Затем ",
      "Тогда "
    ],
    when: [
      "* ",
      "Когда ",
      "Если "
    ]
  },
  sk: {
    and: [
      "* ",
      "A ",
      "A tiež ",
      "A taktiež ",
      "A zároveň "
    ],
    background: [
      "Pozadie"
    ],
    but: [
      "* ",
      "Ale "
    ],
    examples: [
      "Príklady"
    ],
    feature: [
      "Požiadavka",
      "Funkcia",
      "Vlastnosť"
    ],
    given: [
      "* ",
      "Pokiaľ ",
      "Za predpokladu "
    ],
    name: "Slovak",
    native: "Slovensky",
    rule: [
      "Rule"
    ],
    scenario: [
      "Príklad",
      "Scenár"
    ],
    scenarioOutline: [
      "Náčrt Scenáru",
      "Náčrt Scenára",
      "Osnova Scenára"
    ],
    then: [
      "* ",
      "Tak ",
      "Potom "
    ],
    when: [
      "* ",
      "Keď ",
      "Ak "
    ]
  },
  sl: {
    and: [
      "In ",
      "Ter "
    ],
    background: [
      "Kontekst",
      "Osnova",
      "Ozadje"
    ],
    but: [
      "Toda ",
      "Ampak ",
      "Vendar "
    ],
    examples: [
      "Primeri",
      "Scenariji"
    ],
    feature: [
      "Funkcionalnost",
      "Funkcija",
      "Možnosti",
      "Moznosti",
      "Lastnost",
      "Značilnost"
    ],
    given: [
      "Dano ",
      "Podano ",
      "Zaradi ",
      "Privzeto "
    ],
    name: "Slovenian",
    native: "Slovenski",
    rule: [
      "Rule"
    ],
    scenario: [
      "Primer",
      "Scenarij"
    ],
    scenarioOutline: [
      "Struktura scenarija",
      "Skica",
      "Koncept",
      "Oris scenarija",
      "Osnutek"
    ],
    then: [
      "Nato ",
      "Potem ",
      "Takrat "
    ],
    when: [
      "Ko ",
      "Ce ",
      "Če ",
      "Kadar "
    ]
  },
  "sr-Cyrl": {
    and: [
      "* ",
      "И "
    ],
    background: [
      "Контекст",
      "Основа",
      "Позадина"
    ],
    but: [
      "* ",
      "Али "
    ],
    examples: [
      "Примери",
      "Сценарији"
    ],
    feature: [
      "Функционалност",
      "Могућност",
      "Особина"
    ],
    given: [
      "* ",
      "За дато ",
      "За дате ",
      "За дати "
    ],
    name: "Serbian",
    native: "Српски",
    rule: [
      "Правило"
    ],
    scenario: [
      "Сценарио",
      "Пример"
    ],
    scenarioOutline: [
      "Структура сценарија",
      "Скица",
      "Концепт"
    ],
    then: [
      "* ",
      "Онда "
    ],
    when: [
      "* ",
      "Када ",
      "Кад "
    ]
  },
  "sr-Latn": {
    and: [
      "* ",
      "I "
    ],
    background: [
      "Kontekst",
      "Osnova",
      "Pozadina"
    ],
    but: [
      "* ",
      "Ali "
    ],
    examples: [
      "Primeri",
      "Scenariji"
    ],
    feature: [
      "Funkcionalnost",
      "Mogućnost",
      "Mogucnost",
      "Osobina"
    ],
    given: [
      "* ",
      "Za dato ",
      "Za date ",
      "Za dati "
    ],
    name: "Serbian (Latin)",
    native: "Srpski (Latinica)",
    rule: [
      "Pravilo"
    ],
    scenario: [
      "Scenario",
      "Primer"
    ],
    scenarioOutline: [
      "Struktura scenarija",
      "Skica",
      "Koncept"
    ],
    then: [
      "* ",
      "Onda "
    ],
    when: [
      "* ",
      "Kada ",
      "Kad "
    ]
  },
  sv: {
    and: [
      "* ",
      "Och "
    ],
    background: [
      "Bakgrund"
    ],
    but: [
      "* ",
      "Men "
    ],
    examples: [
      "Exempel"
    ],
    feature: [
      "Egenskap"
    ],
    given: [
      "* ",
      "Givet "
    ],
    name: "Swedish",
    native: "Svenska",
    rule: [
      "Regel"
    ],
    scenario: [
      "Scenario"
    ],
    scenarioOutline: [
      "Abstrakt Scenario",
      "Scenariomall"
    ],
    then: [
      "* ",
      "Så "
    ],
    when: [
      "* ",
      "När "
    ]
  },
  ta: {
    and: [
      "* ",
      "மேலும் ",
      "மற்றும் "
    ],
    background: [
      "பின்னணி"
    ],
    but: [
      "* ",
      "ஆனால் "
    ],
    examples: [
      "எடுத்துக்காட்டுகள்",
      "காட்சிகள்",
      "நிலைமைகளில்"
    ],
    feature: [
      "அம்சம்",
      "வணிக தேவை",
      "திறன்"
    ],
    given: [
      "* ",
      "கொடுக்கப்பட்ட "
    ],
    name: "Tamil",
    native: "தமிழ்",
    rule: [
      "Rule"
    ],
    scenario: [
      "உதாரணமாக",
      "காட்சி"
    ],
    scenarioOutline: [
      "காட்சி சுருக்கம்",
      "காட்சி வார்ப்புரு"
    ],
    then: [
      "* ",
      "அப்பொழுது "
    ],
    when: [
      "* ",
      "எப்போது "
    ]
  },
  th: {
    and: [
      "* ",
      "และ "
    ],
    background: [
      "แนวคิด"
    ],
    but: [
      "* ",
      "แต่ "
    ],
    examples: [
      "ชุดของตัวอย่าง",
      "ชุดของเหตุการณ์"
    ],
    feature: [
      "โครงหลัก",
      "ความต้องการทางธุรกิจ",
      "ความสามารถ"
    ],
    given: [
      "* ",
      "กำหนดให้ "
    ],
    name: "Thai",
    native: "ไทย",
    rule: [
      "Rule"
    ],
    scenario: [
      "เหตุการณ์"
    ],
    scenarioOutline: [
      "สรุปเหตุการณ์",
      "โครงสร้างของเหตุการณ์"
    ],
    then: [
      "* ",
      "ดังนั้น "
    ],
    when: [
      "* ",
      "เมื่อ "
    ]
  },
  te: {
    and: [
      "* ",
      "మరియు "
    ],
    background: [
      "నేపథ్యం"
    ],
    but: [
      "* ",
      "కాని "
    ],
    examples: [
      "ఉదాహరణలు"
    ],
    feature: [
      "గుణము"
    ],
    given: [
      "* ",
      "చెప్పబడినది "
    ],
    name: "Telugu",
    native: "తెలుగు",
    rule: [
      "Rule"
    ],
    scenario: [
      "ఉదాహరణ",
      "సన్నివేశం"
    ],
    scenarioOutline: [
      "కథనం"
    ],
    then: [
      "* ",
      "అప్పుడు "
    ],
    when: [
      "* ",
      "ఈ పరిస్థితిలో "
    ]
  },
  tlh: {
    and: [
      "* ",
      "'ej ",
      "latlh "
    ],
    background: [
      "mo'"
    ],
    but: [
      "* ",
      "'ach ",
      "'a "
    ],
    examples: [
      "ghantoH",
      "lutmey"
    ],
    feature: [
      "Qap",
      "Qu'meH 'ut",
      "perbogh",
      "poQbogh malja'",
      "laH"
    ],
    given: [
      "* ",
      "ghu' noblu' ",
      "DaH ghu' bejlu' "
    ],
    name: "Klingon",
    native: "tlhIngan",
    rule: [
      "Rule"
    ],
    scenario: [
      "lut"
    ],
    scenarioOutline: [
      "lut chovnatlh"
    ],
    then: [
      "* ",
      "vaj "
    ],
    when: [
      "* ",
      "qaSDI' "
    ]
  },
  tr: {
    and: [
      "* ",
      "Ve ",
      "Hem de ",
      "Bir de ",
      "Ayrıca ",
      "İlaveten ",
      "Buna ek olarak "
    ],
    background: [
      "Geçmiş",
      "Arka Plan",
      "Ön Koşul",
      "Önkoşul",
      "Önceki Durum",
      "Giriş",
      "Mukaddime",
      "Mevcut Durum"
    ],
    but: [
      "* ",
      "Fakat ",
      "Ama ",
      "Ancak ",
      "Yalnız ",
      "Lakin ",
      "Meğer ki ",
      "Buna mukabil ",
      "Aksi halde "
    ],
    examples: [
      "Örnekler",
      "Değerler"
    ],
    feature: [
      "Özellik",
      "İş Gereksinimi",
      "Gereksinim",
      "İşlev",
      "Kullanıcı Hikayesi",
      "Yetenek",
      "Teknik Gereksinim"
    ],
    given: [
      "* ",
      "Mevcut ",
      "Önceden ",
      "Geçmişte ",
      "Daha önce ",
      "Halihazırda ",
      "Zaten ",
      "Sistemde ",
      "Diyelim ki ",
      "Varsayalım ki ",
      "Farz edelim ki ",
      "Kabul edelim ki ",
      "Başlangıçta ",
      "Varsayılan olarak ",
      "Biliniyor ki "
    ],
    name: "Turkish",
    native: "Türkçe",
    rule: [
      "Kural",
      "İş Kuralı",
      "Kaide",
      "Hüküm",
      "Madde"
    ],
    scenario: [
      "Örnek",
      "Senaryo",
      "Durum",
      "Vaka"
    ],
    scenarioOutline: [
      "Senaryo taslağı",
      "Senaryo şablonu"
    ],
    then: [
      "* ",
      "Beklenen ",
      "O zaman ",
      "Sonuç olarak ",
      "Böylece ",
      "Bunun üzerine ",
      "Bu durumda ",
      "O takdirde ",
      "Şu halde ",
      "Netice itibariyle ",
      "Buna binaen "
    ],
    when: [
      "* ",
      "Eğer ",
      "Eğer ki ",
      "Ne zaman ",
      "Ne zaman ki ",
      "Şayet "
    ]
  },
  tt: {
    and: [
      "* ",
      "Һәм ",
      "Вә "
    ],
    background: [
      "Кереш"
    ],
    but: [
      "* ",
      "Ләкин ",
      "Әмма "
    ],
    examples: [
      "Үрнәкләр",
      "Мисаллар"
    ],
    feature: [
      "Мөмкинлек",
      "Үзенчәлеклелек"
    ],
    given: [
      "* ",
      "Әйтик "
    ],
    name: "Tatar",
    native: "Татарча",
    rule: [
      "Rule"
    ],
    scenario: [
      "Сценарий"
    ],
    scenarioOutline: [
      "Сценарийның төзелеше"
    ],
    then: [
      "* ",
      "Нәтиҗәдә "
    ],
    when: [
      "* ",
      "Әгәр "
    ]
  },
  uk: {
    and: [
      "* ",
      "І ",
      "А також ",
      "Та "
    ],
    background: [
      "Передумова"
    ],
    but: [
      "* ",
      "Але "
    ],
    examples: [
      "Приклади"
    ],
    feature: [
      "Функціонал"
    ],
    given: [
      "* ",
      "Припустимо ",
      "Припустимо, що ",
      "Нехай ",
      "Дано "
    ],
    name: "Ukrainian",
    native: "Українська",
    rule: [
      "Rule"
    ],
    scenario: [
      "Приклад",
      "Сценарій"
    ],
    scenarioOutline: [
      "Структура сценарію"
    ],
    then: [
      "* ",
      "То ",
      "Тоді "
    ],
    when: [
      "* ",
      "Якщо ",
      "Коли "
    ]
  },
  ur: {
    and: [
      "* ",
      "اور "
    ],
    background: [
      "پس منظر"
    ],
    but: [
      "* ",
      "لیکن "
    ],
    examples: [
      "مثالیں"
    ],
    feature: [
      "صلاحیت",
      "کاروبار کی ضرورت",
      "خصوصیت"
    ],
    given: [
      "* ",
      "اگر ",
      "بالفرض ",
      "فرض کیا "
    ],
    name: "Urdu",
    native: "اردو",
    rule: [
      "Rule"
    ],
    scenario: [
      "منظرنامہ"
    ],
    scenarioOutline: [
      "منظر نامے کا خاکہ"
    ],
    then: [
      "* ",
      "پھر ",
      "تب "
    ],
    when: [
      "* ",
      "جب "
    ]
  },
  uz: {
    and: [
      "* ",
      "Ва "
    ],
    background: [
      "Тарих"
    ],
    but: [
      "* ",
      "Лекин ",
      "Бирок ",
      "Аммо "
    ],
    examples: [
      "Мисоллар"
    ],
    feature: [
      "Функционал"
    ],
    given: [
      "* ",
      "Belgilangan "
    ],
    name: "Uzbek",
    native: "Узбекча",
    rule: [
      "Rule"
    ],
    scenario: [
      "Сценарий"
    ],
    scenarioOutline: [
      "Сценарий структураси"
    ],
    then: [
      "* ",
      "Унда "
    ],
    when: [
      "* ",
      "Агар "
    ]
  },
  vi: {
    and: [
      "* ",
      "Và "
    ],
    background: [
      "Bối cảnh"
    ],
    but: [
      "* ",
      "Nhưng "
    ],
    examples: [
      "Dữ liệu"
    ],
    feature: [
      "Tính năng"
    ],
    given: [
      "* ",
      "Biết ",
      "Cho "
    ],
    name: "Vietnamese",
    native: "Tiếng Việt",
    rule: [
      "Quy tắc"
    ],
    scenario: [
      "Tình huống",
      "Kịch bản"
    ],
    scenarioOutline: [
      "Khung tình huống",
      "Khung kịch bản"
    ],
    then: [
      "* ",
      "Thì "
    ],
    when: [
      "* ",
      "Khi "
    ]
  },
  "zh-CN": {
    and: [
      "* ",
      "而且",
      "并且",
      "同时"
    ],
    background: [
      "背景"
    ],
    but: [
      "* ",
      "但是"
    ],
    examples: [
      "例子"
    ],
    feature: [
      "功能"
    ],
    given: [
      "* ",
      "假如",
      "假设",
      "假定"
    ],
    name: "Chinese simplified",
    native: "简体中文",
    rule: [
      "Rule",
      "规则"
    ],
    scenario: [
      "场景",
      "剧本"
    ],
    scenarioOutline: [
      "场景大纲",
      "剧本大纲"
    ],
    then: [
      "* ",
      "那么"
    ],
    when: [
      "* ",
      "当"
    ]
  },
  ml: {
    and: [
      "* ",
      "ഒപ്പം"
    ],
    background: [
      "പശ്ചാത്തലം"
    ],
    but: [
      "* ",
      "പക്ഷേ"
    ],
    examples: [
      "ഉദാഹരണങ്ങൾ"
    ],
    feature: [
      "സവിശേഷത"
    ],
    given: [
      "* ",
      "നൽകിയത്"
    ],
    name: "Malayalam",
    native: "മലയാളം",
    rule: [
      "നിയമം"
    ],
    scenario: [
      "രംഗം"
    ],
    scenarioOutline: [
      "സാഹചര്യത്തിന്റെ രൂപരേഖ"
    ],
    then: [
      "* ",
      "പിന്നെ"
    ],
    when: [
      "എപ്പോൾ"
    ]
  },
  "zh-TW": {
    and: [
      "* ",
      "而且",
      "並且",
      "同時"
    ],
    background: [
      "背景"
    ],
    but: [
      "* ",
      "但是"
    ],
    examples: [
      "例子"
    ],
    feature: [
      "功能"
    ],
    given: [
      "* ",
      "假如",
      "假設",
      "假定"
    ],
    name: "Chinese traditional",
    native: "繁體中文",
    rule: [
      "Rule"
    ],
    scenario: [
      "場景",
      "劇本"
    ],
    scenarioOutline: [
      "場景大綱",
      "劇本大綱"
    ],
    then: [
      "* ",
      "那麼"
    ],
    when: [
      "* ",
      "當"
    ]
  },
  mr: {
    and: [
      "* ",
      "आणि ",
      "तसेच "
    ],
    background: [
      "पार्श्वभूमी"
    ],
    but: [
      "* ",
      "पण ",
      "परंतु "
    ],
    examples: [
      "उदाहरण"
    ],
    feature: [
      "वैशिष्ट्य",
      "सुविधा"
    ],
    given: [
      "* ",
      "जर",
      "दिलेल्या प्रमाणे "
    ],
    name: "Marathi",
    native: "मराठी",
    rule: [
      "नियम"
    ],
    scenario: [
      "परिदृश्य"
    ],
    scenarioOutline: [
      "परिदृश्य रूपरेखा"
    ],
    then: [
      "* ",
      "मग ",
      "तेव्हा "
    ],
    when: [
      "* ",
      "जेव्हा "
    ]
  },
  amh: {
    and: [
      "* ",
      "እና "
    ],
    background: [
      "ቅድመ ሁኔታ",
      "መነሻ",
      "መነሻ ሀሳብ"
    ],
    but: [
      "* ",
      "ግን "
    ],
    examples: [
      "ምሳሌዎች",
      "ሁናቴዎች"
    ],
    feature: [
      "ስራ",
      "የተፈለገው ስራ",
      "የሚፈለገው ድርጊት"
    ],
    given: [
      "* ",
      "የተሰጠ "
    ],
    name: "Amharic",
    native: "አማርኛ",
    rule: [
      "ህግ"
    ],
    scenario: [
      "ምሳሌ",
      "ሁናቴ"
    ],
    scenarioOutline: [
      "ሁናቴ ዝርዝር",
      "ሁናቴ አብነት"
    ],
    then: [
      "* ",
      "ከዚያ "
    ],
    when: [
      "* ",
      "መቼ "
    ]
  }
};

// node_modules/@cucumber/gherkin/dist/GherkinClassicTokenMatcher.js
var DIALECT_DICT = gherkin_languages_default;
var LANGUAGE_PATTERN = /^\s*#\s*language\s*:\s*([a-zA-Z\-_]+)\s*$/;
function addKeywordTypeMappings(h, keywords, keywordType) {
  for (const k of keywords) {
    if (!(k in h)) {
      h[k] = [];
    }
    h[k].push(keywordType);
  }
}
var GherkinClassicTokenMatcher = class {
  defaultDialectName;
  dialect;
  dialectName;
  activeDocStringSeparator;
  indentToRemove;
  keywordTypesMap;
  sortedStepKeywords;
  constructor(defaultDialectName = "en") {
    this.defaultDialectName = defaultDialectName;
    this.reset();
  }
  changeDialect(newDialectName, location) {
    const newDialect = DIALECT_DICT[newDialectName];
    if (!newDialect) {
      throw NoSuchLanguageException.create(newDialectName, location);
    }
    this.dialectName = newDialectName;
    this.dialect = newDialect;
    this.initializeKeywordTypes();
    this.initializeSortedStepKeywords();
  }
  reset() {
    if (this.dialectName !== this.defaultDialectName) {
      this.changeDialect(this.defaultDialectName);
    }
    this.activeDocStringSeparator = null;
    this.indentToRemove = 0;
  }
  initializeKeywordTypes() {
    this.keywordTypesMap = {};
    addKeywordTypeMappings(this.keywordTypesMap, this.dialect.given, StepKeywordType.CONTEXT);
    addKeywordTypeMappings(this.keywordTypesMap, this.dialect.when, StepKeywordType.ACTION);
    addKeywordTypeMappings(this.keywordTypesMap, this.dialect.then, StepKeywordType.OUTCOME);
    addKeywordTypeMappings(this.keywordTypesMap, [].concat(this.dialect.and).concat(this.dialect.but), StepKeywordType.CONJUNCTION);
  }
  initializeSortedStepKeywords() {
    this.sortedStepKeywords = [].concat(this.dialect.given).concat(this.dialect.when).concat(this.dialect.then).concat(this.dialect.and).concat(this.dialect.but).sort(compareStepKeywords);
  }
  match_TagLine(token) {
    if (token.line.startsWith("@")) {
      this.setTokenMatched(token, TokenType.TagLine, null, null, null, null, this.getTags(token.line));
      return true;
    }
    return false;
  }
  match_FeatureLine(token) {
    return this.matchTitleLine(token, TokenType.FeatureLine, this.dialect.feature);
  }
  match_ScenarioLine(token) {
    return this.matchTitleLine(token, TokenType.ScenarioLine, this.dialect.scenario) || this.matchTitleLine(token, TokenType.ScenarioLine, this.dialect.scenarioOutline);
  }
  match_BackgroundLine(token) {
    return this.matchTitleLine(token, TokenType.BackgroundLine, this.dialect.background);
  }
  match_ExamplesLine(token) {
    return this.matchTitleLine(token, TokenType.ExamplesLine, this.dialect.examples);
  }
  match_RuleLine(token) {
    return this.matchTitleLine(token, TokenType.RuleLine, this.dialect.rule);
  }
  match_TableRow(token) {
    if (token.line.startsWith("|")) {
      this.setTokenMatched(token, TokenType.TableRow, null, null, null, null, token.line.getTableCells());
      return true;
    }
    return false;
  }
  match_Empty(token) {
    if (token.line.isEmpty) {
      this.setTokenMatched(token, TokenType.Empty, null, null, 0);
      return true;
    }
    return false;
  }
  match_Comment(token) {
    if (token.line.startsWith("#")) {
      const text = token.line.getLineText(0);
      this.setTokenMatched(token, TokenType.Comment, text, null, 0);
      return true;
    }
    return false;
  }
  match_Language(token) {
    const match = token.line.trimmedLineText.match(LANGUAGE_PATTERN);
    if (match) {
      const newDialectName = match[1];
      this.setTokenMatched(token, TokenType.Language, newDialectName);
      this.changeDialect(newDialectName, token.location);
      return true;
    }
    return false;
  }
  match_DocStringSeparator(token) {
    return this.activeDocStringSeparator == null ? (
      // open
      this._match_DocStringSeparator(token, '"""', true) || this._match_DocStringSeparator(token, "```", true)
    ) : (
      // close
      this._match_DocStringSeparator(token, this.activeDocStringSeparator, false)
    );
  }
  _match_DocStringSeparator(token, separator, isOpen) {
    if (token.line.startsWith(separator)) {
      let mediaType = null;
      if (isOpen) {
        mediaType = token.line.getRestTrimmed(separator.length);
        this.activeDocStringSeparator = separator;
        this.indentToRemove = token.line.indent;
      } else {
        this.activeDocStringSeparator = null;
        this.indentToRemove = 0;
      }
      this.setTokenMatched(token, TokenType.DocStringSeparator, mediaType, separator);
      return true;
    }
    return false;
  }
  match_EOF(token) {
    if (token.isEof) {
      this.setTokenMatched(token, TokenType.EOF);
      return true;
    }
    return false;
  }
  match_StepLine(token) {
    for (const keyword of this.sortedStepKeywords) {
      if (token.line.startsWith(keyword)) {
        const title = token.line.getRestTrimmed(keyword.length);
        const keywordTypes = this.keywordTypesMap[keyword];
        let keywordType = keywordTypes[0];
        if (keywordTypes.length > 1) {
          keywordType = StepKeywordType.UNKNOWN;
        }
        this.setTokenMatched(token, TokenType.StepLine, title, keyword, null, keywordType);
        return true;
      }
    }
    return false;
  }
  match_Other(token) {
    const text = token.line.getLineText(this.indentToRemove);
    this.setTokenMatched(token, TokenType.Other, this.unescapeDocString(text), null, 0);
    return true;
  }
  getTags(line) {
    const uncommentedLine = line.trimmedLineText.split(/\s#/g, 2)[0];
    let column = line.indent + 1;
    const items = uncommentedLine.split("@");
    const tags = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i].trimRight();
      if (item.length === 0) {
        continue;
      }
      if (!item.match(/^\S+$/)) {
        throw ParserException.create("A tag may not contain whitespace", line.lineNumber, column);
      }
      const span = { column, text: `@${item}` };
      tags.push(span);
      column += countSymbols(items[i]) + 1;
    }
    return tags;
  }
  matchTitleLine(token, tokenType, keywords) {
    for (const keyword of keywords) {
      if (token.line.startsWithTitleKeyword(keyword)) {
        const title = token.line.getRestTrimmed(keyword.length + ":".length);
        this.setTokenMatched(token, tokenType, title, keyword);
        return true;
      }
    }
    return false;
  }
  setTokenMatched(token, matchedType, text, keyword, indent, keywordType, items) {
    token.matchedType = matchedType;
    token.matchedText = text;
    token.matchedKeyword = keyword;
    token.matchedKeywordType = keywordType;
    token.matchedIndent = typeof indent === "number" ? indent : token.line == null ? 0 : token.line.indent;
    token.matchedItems = items || [];
    token.location.column = token.matchedIndent + 1;
    token.matchedGherkinDialect = this.dialectName;
  }
  unescapeDocString(text) {
    if (this.activeDocStringSeparator === '"""') {
      return text.replace('\\"\\"\\"', '"""');
    }
    if (this.activeDocStringSeparator === "```") {
      return text.replace("\\`\\`\\`", "```");
    }
    return text;
  }
};

// node_modules/@cucumber/gherkin/dist/GherkinInMarkdownTokenMatcher.js
var KeywordPrefix;
(function(KeywordPrefix2) {
  KeywordPrefix2["BULLET"] = "^(\\s*[*+-]\\s*)";
  KeywordPrefix2["HEADER"] = "^(#{1,6}\\s)";
})(KeywordPrefix || (KeywordPrefix = {}));

// node_modules/@cucumber/gherkin/dist/pickles/compile.js
var pickleStepTypeFromKeyword = {
  [StepKeywordType.UNKNOWN]: PickleStepType.UNKNOWN,
  [StepKeywordType.CONTEXT]: PickleStepType.CONTEXT,
  [StepKeywordType.ACTION]: PickleStepType.ACTION,
  [StepKeywordType.OUTCOME]: PickleStepType.OUTCOME,
  [StepKeywordType.CONJUNCTION]: null
};

// gate-checker/src/gherkin.ts
function stripGherkinComments(text) {
  return text.replace(/\r\n?/g, "\n").split("\n").map((l) => /^\s*#/.test(l) ? "" : l);
}
function parse(text) {
  const parser = new Parser(
    new AstBuilder(IdGenerator_exports.incrementing()),
    new GherkinClassicTokenMatcher()
  );
  try {
    return { doc: parser.parse(text), errors: [] };
  } catch (e) {
    const err = e;
    const errors = err.errors?.length ? err.errors : [{ message: err.message ?? String(e), location: err.location }];
    return { errors };
  }
}
function scenariosOf(doc) {
  const out = [];
  const featureBg = [];
  for (const child of doc.feature?.children ?? []) {
    if (child.background) featureBg.push(...child.background.steps);
    if (child.scenario) out.push({ scenario: child.scenario, background: featureBg });
    if (child.rule) {
      const ruleBg = [...featureBg];
      for (const rc of child.rule.children) {
        if (rc.background) ruleBg.push(...rc.background.steps);
        if (rc.scenario) out.push({ scenario: rc.scenario, background: ruleBg });
      }
    }
  }
  return out;
}
function stepTypes(steps) {
  const types = [];
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
function checkFeature(rule, file, text, ids) {
  const findings = [];
  const definitions = [];
  const lines = stripGherkinComments(text);
  const totalLines = lines.length;
  const err = (code, message, line) => findings.push({ code, severity: "error", message, file, line });
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
  const tagIds = (tags, kind) => tags.map((t) => ({ id: t.name.replace(/^@/, ""), line: t.location.line })).filter((t) => ids.classify(t.id) === kind);
  const storyTags = tagIds(feature.tags, rule.featureIdKind);
  let storyId;
  if (storyTags.length !== 1) {
    err(
      "gherkin.feature.tag",
      `Feature に ${rule.featureIdKind} の ID タグがちょうど 1 つ必要です（${storyTags.length} 個）`,
      feature.location.line
    );
  } else {
    const tag = storyTags[0];
    storyId = tag.id;
    definitions.push({
      id: tag.id,
      kind: rule.featureIdKind,
      file,
      line: tag.line,
      range: [1, totalLines]
    });
    const name = basename(file).replace(/\.feature$/, "");
    if (rule.fileNameMatchesId && name !== storyId) {
      err(
        "gherkin.filename",
        `ファイル名 ${name}.feature が Feature の ID ${storyId} と一致しません`
      );
    }
  }
  const scenarios = scenariosOf(doc);
  if (scenarios.length < (rule.minScenarios ?? 1)) {
    err(
      "gherkin.scenarios.min",
      `受け入れ条件（Scenario）が ${rule.minScenarios ?? 1} 件以上必要です（${scenarios.length} 件）`,
      feature.location.line
    );
  }
  const starts = scenarios.map(
    ({ scenario }) => Math.min(scenario.location.line, ...scenario.tags.map((t) => t.location.line))
  );
  scenarios.forEach(({ scenario, background }, i) => {
    const label = `Scenario「${scenario.name}」`;
    const acTags = tagIds(scenario.tags, rule.scenarioIdKind);
    if (acTags.length !== 1) {
      err(
        "gherkin.scenario.tag",
        `${label} に ${rule.scenarioIdKind} の ID タグがちょうど 1 つ必要です（${acTags.length} 個）`,
        scenario.location.line
      );
    } else {
      const tag = acTags[0];
      if (storyId && !tag.id.startsWith(`${storyId}-`)) {
        err(
          "gherkin.scenario.tag",
          `${label} の ID ${tag.id} が Feature の ID ${storyId} に対応しません`,
          tag.line
        );
      }
      const end = (starts[i + 1] ?? totalLines + 1) - 1;
      definitions.push({
        id: tag.id,
        kind: rule.scenarioIdKind,
        file,
        line: tag.line,
        range: [starts[i] ?? scenario.location.line, end]
      });
    }
    const types = /* @__PURE__ */ new Set([...stepTypes(background), ...stepTypes(scenario.steps)]);
    const missing = (rule.requireStepTypes ?? []).filter((t) => !types.has(t));
    if (missing.length > 0) {
      const names = {
        Context: "Given",
        Action: "When",
        Outcome: "Then"
      };
      err(
        "gherkin.scenario.steps",
        `${label} に ${missing.map((m) => names[m] ?? m).join(" / ")} のステップがありません`,
        scenario.location.line
      );
    }
  });
  return { broken: false, findings, definitions, lines };
}

// gate-checker/src/ids.ts
var IdClassifier = class {
  #kinds;
  tokenPattern;
  constructor(config) {
    this.#kinds = Object.entries(config.kinds).map(([k, v]) => [k, new RegExp(v.pattern)]);
    const prefixes = [...config.prefixes].sort((a, b) => b.length - a.length).join("|");
    this.tokenPattern = new RegExp(
      `(?<![A-Za-z0-9_])(?:${prefixes})-[0-9][0-9A-Za-z]*(?:-[0-9A-Za-z]+)*`,
      "g"
    );
  }
  classify(id) {
    for (const [kind, re] of this.#kinds) if (re.test(id)) return kind;
    return null;
  }
  tokens(file, lines) {
    const found = [];
    lines.forEach((text, i) => {
      for (const m of text.matchAll(this.tokenPattern)) {
        found.push({
          id: m[0],
          kind: this.classify(m[0]),
          file,
          line: i + 1,
          column: (m.index ?? 0) + 1
        });
      }
    });
    return found;
  }
};
function markdownDefinitions(file, doc, tokens, kinds) {
  const defs = [];
  const firstToken = (line) => tokens.filter((t) => t.line === line).sort((a, b) => a.column - b.column)[0];
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
var isDefinitionToken = (t, defs) => defs.some((d) => d.file === t.file && d.line === t.line && d.id === t.id);

// gate-checker/src/types.ts
var ConfigError = class extends Error {
  name = "ConfigError";
};

// gate-checker/src/version.ts
var TOOL_NAME = "gate-checker";
var TOOL_VERSION = "0.1.0";

// gate-checker/src/run.ts
function readJson(path) {
  if (!existsSync2(path)) throw new ConfigError(`完了条件のファイルがありません: ${path}`);
  try {
    return JSON.parse(readFileSync2(path, "utf8"));
  } catch (e) {
    throw new ConfigError(`完了条件のファイルを JSON として読めません: ${path}: ${String(e)}`);
  }
}
function loadRules(rulesDir, stage) {
  const ids = readJson(join2(rulesDir, "ids.json"));
  const rulesFile = `stage-${stage}.json`;
  const rules = readJson(join2(rulesDir, rulesFile));
  const problems = [];
  if (!Array.isArray(ids.prefixes) || typeof ids.kinds !== "object") {
    problems.push("ids.json に prefixes と kinds が必要です");
  }
  if (rules.stage !== stage) problems.push(`${rulesFile} の stage が ${stage} ではありません`);
  for (const key of ["gate", "title"]) {
    if (typeof rules[key] !== "string") problems.push(`${rulesFile} に ${key} が必要です`);
  }
  for (const key of ["scan", "artifacts", "definitions"]) {
    if (!Array.isArray(rules[key])) problems.push(`${rulesFile} に配列 ${key} が必要です`);
  }
  if (typeof rules.record?.path !== "string")
    problems.push(`${rulesFile} に record.path が必要です`);
  const kinds = new Set(Object.keys(ids.kinds ?? {}));
  const usedKinds = [
    ...(rules.definitions ?? []).map((d) => d.kind),
    ...(rules.coverage ?? []).flatMap((c) => [c.each, ...c.contextReferences ?? []]),
    ...(rules.gherkin ?? []).flatMap((g) => [g.featureIdKind, g.scenarioIdKind])
  ];
  for (const k of usedKinds)
    if (!kinds.has(k)) problems.push(`ID の種類 ${k} が ids.json にありません`);
  if (problems.length > 0) throw new ConfigError(problems.join("\n"));
  return { rules, ids, rulesFile };
}
function compareIds(a, b) {
  return a.localeCompare(b, "en", { numeric: true });
}
function check(id, title, findings, target) {
  return finalize({ id, title, target, status: "pass", findings });
}
function scanIds(root, rules, classifier, featureLines, featureDefs, broken) {
  const tokens = [];
  const definitions = [...featureDefs];
  const docs = /* @__PURE__ */ new Map();
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
      rules.definitions.filter((d) => matchesAny(file, d.files)).map((d) => d.kind)
    );
    if (kinds.size > 0) definitions.push(...markdownDefinitions(file, doc, fileTokens, kinds));
  }
  return {
    tokens: tokens.filter((t) => !broken.has(t.file)),
    allTokens: tokens,
    definitions,
    docs
  };
}
function idChecks(rules, scan) {
  const { tokens, definitions } = scan;
  const results = [];
  const format = scan.allTokens.filter((t) => t.kind === null).map((t) => ({
    code: "id.format",
    severity: "error",
    message: `ID の形式が不正です: ${t.id}（形式は .ccsdd/docs/ids.md）`,
    file: t.file,
    line: t.line
  }));
  results.push(check("ids:format", "ID の形式", format));
  const first = /* @__PURE__ */ new Map();
  const duplicate = [];
  for (const d of definitions) {
    const prev = first.get(d.id);
    if (prev) {
      duplicate.push({
        code: "id.duplicate",
        severity: "error",
        message: `ID ${d.id} が重複して定義されています（最初の定義: ${prev.file}:${prev.line}）`,
        file: d.file,
        line: d.line
      });
    } else first.set(d.id, d);
  }
  results.push(check("ids:duplicate", "ID の重複", duplicate));
  const references = tokens.filter((t) => t.kind !== null && !isDefinitionToken(t, definitions));
  const unresolved = references.filter((t) => !first.has(t.id)).map((t) => ({
    code: "id.unresolved",
    severity: "error",
    message: `参照先の ID ${t.id} が定義されていません`,
    file: t.file,
    line: t.line
  }));
  results.push(check("ids:unresolved", "ID 参照の解決", unresolved));
  for (const c of rules.coverage ?? []) {
    const severity = c.severity ?? "error";
    const findings = [];
    const inSection = (t) => {
      if (!c.inSection) return true;
      const doc = scan.docs.get(t.file);
      const s = doc ? findSection(doc, c.inSection) : void 0;
      return s !== void 0 && t.line >= s.startLine && t.line <= s.endLine;
    };
    const where = (files) => `${files.join(", ")}${c.inSection ? ` の節「${c.inSection}」` : ""}`;
    for (const d of first.values()) {
      if (d.kind !== c.each) continue;
      if (c.referencedIn) {
        const referenced = references.some(
          (t) => t.id === d.id && matchesAny(t.file, c.referencedIn ?? []) && inSection(t)
        );
        if (!referenced) {
          findings.push({
            code: "id.coverage",
            severity,
            message: `${d.id} が ${where(c.referencedIn)} で参照されていません`,
            file: d.file,
            line: d.line
          });
        }
      }
      for (const kind of c.contextReferences ?? []) {
        const inRange = tokens.some(
          (t) => t.file === d.file && t.line >= d.range[0] && t.line <= d.range[1] && !(t.line === d.line && t.id === d.id) && t.kind === kind
        );
        if (!inRange) {
          findings.push({
            code: "id.context",
            severity,
            message: `${d.id} の定義（${d.file}:${d.range[0]}-${d.range[1]}）に ${kind} の参照がありません`,
            file: d.file,
            line: d.line
          });
        }
      }
    }
    results.push(check(`coverage:${c.id}`, c.title, findings));
  }
  return results;
}
function checkRecord(root, rules, artifactsPassed) {
  const rule = rules.record;
  const result = checkArtifact(root, { ...rule, required: true }, "record");
  if (!existsSync2(join2(root, rule.path))) return result;
  const doc = parseMarkdown(readText(root, rule.path));
  const title = doc.headings.find((h) => h.level === 1);
  if (!title || !new RegExp(`^${rules.gate}(?:[:：\\s]|$)`).test(title.text)) {
    result.findings.push({
      code: "record.gate.id",
      severity: "error",
      message: `判定記録の題（# 見出し）が ${rules.gate} で始まっていません`,
      file: rule.path,
      line: title?.line
    });
  }
  const decision = findFields(doc, rule.decisionKey)[0];
  if (decision && rule.decisionsRequiringPass.includes(decision.value) && !artifactsPassed) {
    result.findings.push({
      code: "record.decision.inconsistent",
      severity: "error",
      message: `判定が「${decision.value}」ですが、成果物の機械チェックが不合格です`,
      file: rule.path,
      line: decision.line
    });
  }
  return finalize(result);
}
function git(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}
var resultPath = (stage) => `gates/gate-${stage}.result.json`;
function runGate(options) {
  const { stage, root } = options;
  const { rules, ids, rulesFile } = loadRules(options.rulesDir, stage);
  const classifier = new IdClassifier(ids);
  const bySubitem = [];
  for (const a of rules.artifacts)
    bySubitem.push({ subitem: a.subitem, check: checkArtifact(root, a) });
  const featureLines = /* @__PURE__ */ new Map();
  const featureDefs = [];
  const broken = /* @__PURE__ */ new Set();
  for (const g of rules.gherkin ?? []) {
    const files = globFiles(root, [g.files]);
    const findings2 = [];
    if (files.length < (g.minFiles ?? 1)) {
      findings2.push({
        code: "gherkin.files.min",
        severity: "error",
        message: `${g.files} に一致するファイルが ${g.minFiles ?? 1} 件以上必要です（${files.length} 件）`
      });
    }
    for (const file of files) {
      const r = checkFeature(g, file, readText(root, file), classifier);
      findings2.push(...r.findings);
      featureDefs.push(...r.definitions);
      featureLines.set(file, r.lines);
      if (r.broken) broken.add(file);
    }
    bySubitem.push({
      subitem: g.subitem,
      check: check(`gherkin:${g.id}`, `${g.subitem} ${g.title}`, findings2, g.files)
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
  const defined = {};
  for (const id of new Set(scan.definitions.map((d) => d.id))) {
    const kind = classifier.classify(id) ?? "unknown";
    defined[kind] = [...defined[kind] ?? [], id];
  }
  for (const k of Object.keys(defined)) defined[k]?.sort(compareIds);
  const result = {
    schemaVersion: 1,
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    stage,
    gate: rules.gate,
    title: rules.title,
    mode: options.record ? "record" : "artifacts",
    checkedAt: (options.now ?? /* @__PURE__ */ new Date()).toISOString(),
    commit,
    dirty: status === null ? null : status !== "",
    rules: rulesFile,
    passed: checks.every((c) => c.status !== "fail"),
    summary: {
      checks: checks.length,
      failed: checks.filter((c) => c.status === "fail").length,
      skipped: checks.filter((c) => c.status === "skip").length,
      errors: findings.filter((f) => f.severity === "error").length,
      warnings: findings.filter((f) => f.severity === "warning").length
    },
    checks,
    ids: defined
  };
  if (options.write === false) return { result };
  mkdirSync(join2(root, "gates"), { recursive: true });
  writeFileSync(join2(root, out), `${JSON.stringify(result, null, 2)}
`, "utf8");
  return { result, written: out };
}

// gate-checker/src/cli.ts
var USAGE = `使い方: gate-check --stage <n> [--root <repo-path>] [オプション]

段階 <n> の完了条件を対象リポジトリで検査し、gates/gate-<n>.result.json を書く。
不合格なら終了コード 1、引数・完了条件の誤りは 2。

オプション:
  --stage <n>        段階番号（必須）
  --root <path>      対象リポジトリのルート（既定: カレントディレクトリ）
  --rules-dir <dir>  完了条件のディレクトリ（既定: この CLI の ../rules）
  --record           判定記録 gates/gate-<n>.md も検査する（人の判定の記入後、CI で使う）
  --no-write         結果 JSON を書かない
  --json             標準出力に結果 JSON を出す
  -h, --help         この説明
  -v, --version      バージョン`;
function defaultRulesDir() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "rules");
}
function main(argv, io = { out: console.log, err: console.error }) {
  let values;
  try {
    values = parse2(argv).values;
  } catch (e) {
    io.err(`${e.message}

${USAGE}`);
    return 2;
  }
  if (values.help) {
    io.out(USAGE);
    return 0;
  }
  if (values.version) {
    io.out(TOOL_VERSION);
    return 0;
  }
  const stage = Number(values.stage);
  if (!values.stage || !Number.isInteger(stage) || stage < 1 || stage > 12) {
    io.err(`--stage に 1〜12 の整数を指定してください

${USAGE}`);
    return 2;
  }
  try {
    const { result, written } = runGate({
      stage,
      root: resolve(values.root ?? "."),
      rulesDir: resolve(values["rules-dir"] ?? defaultRulesDir()),
      record: values.record ?? false,
      write: !(values["no-write"] ?? false)
    });
    io.out(values.json ? JSON.stringify(result, null, 2) : formatText(result, written));
    return result.passed ? 0 : 1;
  } catch (e) {
    if (e instanceof ConfigError) {
      io.err(e.message);
      return 2;
    }
    throw e;
  }
}
function parse2(argv) {
  return parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      stage: { type: "string" },
      root: { type: "string" },
      "rules-dir": { type: "string" },
      record: { type: "boolean" },
      "no-write": { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" }
    }
  });
}
function isEntryPoint() {
  try {
    const invoked = process.argv[1];
    return invoked !== void 0 && realpathSync(invoked) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isEntryPoint()) process.exitCode = main(process.argv.slice(2));
export {
  USAGE,
  defaultRulesDir,
  main
};
