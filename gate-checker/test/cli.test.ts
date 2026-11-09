import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultRulesDir, main } from "../src/cli.ts";
import { TOOL_VERSION } from "../src/version.ts";
import { CORE_ROOT, cleanup, copyFixture, RULES_DIR, tempDir } from "./helpers.ts";

afterEach(cleanup);

function run(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = main(args, { out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("main", () => {
  it("合格なら 0、結果 JSON を書く", () => {
    const root = copyFixture("todo-pass");
    const r = run(["--stage", "1", "--root", root, "--rules-dir", RULES_DIR]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("結果: 合格");
    expect(existsSync(join(root, "gates", "gate-1.result.json"))).toBe(true);
  });

  it("不合格なら 1、--no-write なら書かない", () => {
    const root = copyFixture("todo-fail");
    const r = run(["--stage", "1", "--root", root, "--no-write"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("結果: 不合格");
    expect(existsSync(join(root, "gates"))).toBe(false);
  });

  it("--json は結果 JSON を標準出力に出す", () => {
    const root = copyFixture("todo-pass");
    const r = run(["--stage", "2", "--root", root, "--no-write", "--json"]);
    expect(JSON.parse(r.out)).toMatchObject({ gate: "GATE-2", passed: true });
  });

  it.each([[["--root", "."]], [["--stage", "13"]], [["--stage", "1", "--unknown"]]])(
    "引数の誤りは 2: %j",
    (args) => {
      expect(run(args).code).toBe(2);
    },
  );

  it("完了条件が無い段階は 2", () => {
    const r = run(["--stage", "3", "--root", tempDir(), "--no-write"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("stage-3.json");
  });

  it("--help と --version", () => {
    expect(run(["--help"]).out).toContain("使い方");
    expect(run(["--version"]).out).toBe(TOOL_VERSION);
  });

  it("既定の rules/ は gate-checker/rules", () => {
    expect(defaultRulesDir()).toBe(RULES_DIR);
  });
});

describe("dist/gate-check.mjs", () => {
  const dist = join(CORE_ROOT, "gate-checker", "dist", "gate-check.mjs");

  it("バージョンが package.json と一致する", () => {
    const pkg = JSON.parse(readFileSync(join(CORE_ROOT, "package.json"), "utf8"));
    expect(TOOL_VERSION).toBe(pkg.version);
    expect(execFileSync(process.execPath, [dist, "--version"], { encoding: "utf8" }).trim()).toBe(
      TOOL_VERSION,
    );
  });

  it("依存なしで動き、終了コードで合否を返す", () => {
    const pass = spawnSync(process.execPath, [
      dist,
      "--stage",
      "2",
      "--root",
      copyFixture("todo-pass"),
      "--no-write",
    ]);
    expect(pass.status).toBe(0);
    const fail = spawnSync(process.execPath, [
      dist,
      "--stage",
      "2",
      "--root",
      copyFixture("todo-fail"),
      "--no-write",
    ]);
    expect(fail.status).toBe(1);
  });
});
