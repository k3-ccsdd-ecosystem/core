// run-stage.sh の引数の解釈と skill の引き当て（CCSDD_DRY_RUN=1 で claude を起動せずに確かめる）。

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CORE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const hasBash = spawnSync("bash", ["-c", "true"]).status === 0;
let repo = "";

beforeAll(() => {
  if (!hasBash) return;
  repo = mkdtempSync(join(tmpdir(), "run-stage-"));
  execFileSync("git", ["init", "-q", repo]);
  // 作業ツリーの claude/ と run-stage.sh を、配布後と同じ位置に置く
  cpSync(join(CORE_ROOT, "claude"), join(repo, ".claude"), { recursive: true });
  cpSync(
    join(CORE_ROOT, "scripts", "run-stage.sh"),
    join(repo, ".ccsdd", "scripts", "run-stage.sh"),
  );
});

afterAll(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
});

function runStage(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync("bash", [".ccsdd/scripts/run-stage.sh", ...args], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, CCSDD_DRY_RUN: "1", ...env },
  });
  return { status: r.status, out: r.stdout.trim(), err: r.stderr };
}

describe.skipIf(!hasBash)("run-stage.sh", () => {
  it.each([
    ["1-2", "ccsdd-planning"],
    ["1-4", "ccsdd-planning"],
    ["1-5", "ccsdd-as-is"],
    ["1-6", "ccsdd-constraints"],
    ["1-7", "ccsdd-plan-path"],
    ["1-8", "ccsdd-gate"],
  ])("小項目 %s は %s で起動する", (subitem, skill) => {
    const r = runStage(["1", subitem]);
    expect(r.status).toBe(0);
    expect(r.out).toBe(
      `claude -p "/${skill} ${subitem}" --model opus --setting-sources project --settings .claude/settings.json --output-format json --max-turns 50`,
    );
  });

  it("段階 2 の小項目と、プロンプト・環境変数の受け渡し", () => {
    const r = runStage(["2", "2-3", "画面を", "見直す"], {
      CCSDD_MODEL: "haiku",
      CCSDD_MAX_TURNS: "5",
    });
    expect(r.status).toBe(0);
    expect(r.out).toContain('claude -p "/ccsdd-ux-design 2-3 画面を 見直す" --model haiku');
    expect(r.out).toContain("--max-turns 5");
    expect(runStage(["2", "2-5"]).out).toContain('"/ccsdd-gate 2-5"');
  });

  it("skill 名を直接渡せる", () => {
    const r = runStage(["1", "ccsdd-gate", "1-8 判定: Go"]);
    expect(r.out).toContain('claude -p "/ccsdd-gate 1-8 判定: Go"');
  });

  it.each([
    [["1"], "引数が足りない"],
    [["13", "1-1"], "段階番号の範囲外"],
    [["1", "2-1"], "別の段階の小項目"],
    [["1", "1-1"], "skill の無い小項目"],
    [["1", "no-such-skill"], "存在しない skill"],
  ])("誤りは終了コード 2: %j（%s）", (args) => {
    expect(runStage(args).status).toBe(2);
  });

  it("CCSDD_MAX_TURNS が正の整数でなければ 2", () => {
    expect(runStage(["1", "1-3"], { CCSDD_MAX_TURNS: "0" }).status).toBe(2);
  });
});
