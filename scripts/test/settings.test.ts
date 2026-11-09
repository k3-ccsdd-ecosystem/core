// claude/settings.json の Bash の allow / deny の意図を確かめる。
// 一致の判定は公式ドキュメント（code.claude.com/docs/en/permissions の Wildcard patterns）の規則を写したもので、
// Claude Code そのものの判定ではない。Claude Code での挙動は、配布先で claude -p を使って確かめる。

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CORE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const settings = JSON.parse(readFileSync(join(CORE_ROOT, "claude", "settings.json"), "utf8")) as {
  permissions: { allow: string[]; deny: string[] };
};

/** Bash(<pattern>) の一致: * は任意の文字列。末尾の「 *」が唯一の * なら、引数なしのコマンドにも一致する */
function bashMatcher(rule: string): ((cmd: string) => boolean) | undefined {
  const m = /^Bash\((.*)\)$/.exec(rule);
  if (!m) return undefined;
  const pattern = (m[1] ?? "").replace(/:\*$/, " *");
  const escapeRe = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const body = pattern.split("*").map(escapeRe).join(".*");
  const stars = pattern.split("*").length - 1;
  const bare = stars === 1 && pattern.endsWith(" *") ? `|${escapeRe(pattern.slice(0, -2))}` : "";
  const re = new RegExp(`^(?:${body}${bare})$`);
  return (cmd) => re.test(cmd);
}

const matchers = (rules: string[]) =>
  rules.map(bashMatcher).filter((f): f is (cmd: string) => boolean => f !== undefined);
const denied = (cmd: string) => matchers(settings.permissions.deny).some((f) => f(cmd));
const allowed = (cmd: string) => matchers(settings.permissions.allow).some((f) => f(cmd));

describe("settings.json の Bash の規則", () => {
  it.each([
    "gh pr merge 1",
    "git push -f origin stage-1",
    "git push origin stage-1 -f",
    "git push --force origin stage-1",
    "git push --force-with-lease origin stage-1",
    "git push origin stage-1 --force-with-lease",
    "git push -uf origin stage-1",
    "git push -fu origin stage-1",
    "git push origin stage-1 -uf",
    "git push -vf origin stage-1",
    "git push -uvf origin stage-1",
    "git push origin +stage-1",
    "git push --delete origin stage-1",
    "git push origin --delete stage-1",
    "git push -d origin stage-1",
    "git push origin -d stage-1",
    "terraform apply",
    "terraform apply -auto-approve",
    "terraform -chdir=infra apply",
    "terraform destroy",
    "gh repo delete k3-ccsdd-ecosystem/todo-spec",
    "gh release delete v1",
    "gh secret delete TOKEN",
    "gh api -X DELETE repos/a/b",
    "gh api repos/a/b -X DELETE",
    "gh api repos/a/b --method=DELETE",
  ])("deny: %s", (cmd) => {
    expect(denied(cmd)).toBe(true);
  });

  it.each([
    "git push",
    "git push -u origin stage-1",
    "git push origin stage-1",
    "git push -u origin feature/x-fix",
    "git push origin HEAD:refs/heads/stage-1",
    "git push origin stage-1 --follow-tags",
    "git commit -m 'docs: 1-3 企画書'",
    "gh pr create --base main --head stage-1 --title 'GATE-1: 追求判定' --body-file .ccsdd/runs/pr-body-gate-1.md",
    "gh issue create --title 'US-2: 受け入れ条件の追加'",
    "node .ccsdd/gate-checker/dist/gate-check.mjs --stage 1 --no-write",
    "terraform init",
    "terraform fmt -check",
    "terraform validate",
    "terraform plan -out=plan.tfplan",
    "npm test",
  ])("allow かつ deny でない: %s", (cmd) => {
    expect(denied(cmd)).toBe(false);
    expect(allowed(cmd)).toBe(true);
  });

  it("末尾が「:*」の Bash の規則を使わない（旧記法の前方一致として読まれ、「:」が文字として扱われない）", () => {
    const all = [...settings.permissions.allow, ...settings.permissions.deny];
    expect(all.filter((r) => r.startsWith("Bash(") && r.endsWith(":*)"))).toEqual([]);
  });

  it("Edit の deny は配布物・CI・core.lock を守り、.ccsdd/runs/ は書ける", () => {
    const deny = settings.permissions.deny;
    // sync-core.ts の MAPPINGS で .ccsdd/ の下に配るディレクトリをすべて守る
    for (const dir of ["gate-checker", "templates", "docs", "scripts"]) {
      expect(deny).toContain(`Edit(.ccsdd/${dir}/**)`);
    }
    expect(deny).toContain("Edit(.github/workflows/**)");
    expect(deny).toContain("Edit(core.lock)");
    // ディレクトリ全体の deny は否定（!）で部分的に戻せないため、.ccsdd/** を deny しない
    expect(deny).not.toContain("Edit(.ccsdd/**)");
  });
});
