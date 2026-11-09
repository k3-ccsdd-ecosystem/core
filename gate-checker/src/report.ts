// 判定結果の人向けの要約（標準出力）。

import type { CheckStatus, GateResult } from "./types.js";

const LABEL: Record<CheckStatus, string> = { pass: "合格", fail: "不合格", skip: "対象外" };

export function formatText(result: GateResult, written?: string): string {
  const lines: string[] = [];
  lines.push(`gate-check: 段階 ${result.stage}（${result.gate} ${result.title}）`);
  lines.push(
    `commit: ${result.commit ?? "（git 管理外）"}${result.dirty ? "（未コミットの変更あり）" : ""}`,
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
    `結果: ${result.passed ? "合格" : "不合格"}（検査 ${s.checks}、不合格 ${s.failed}、対象外 ${s.skipped}、エラー ${s.errors}、警告 ${s.warnings}）`,
  );
  if (written) lines.push(`書き出し: ${written}`);
  return lines.join("\n");
}
