import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type RunOutput, runGate } from "../src/run.ts";
import type { GateResult } from "../src/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
export const CORE_ROOT = resolve(here, "..", "..");
export const RULES_DIR = join(CORE_ROOT, "gate-checker", "rules");
export const TEMPLATES_DIR = join(CORE_ROOT, "templates");
export const FIXTURES_DIR = join(here, "fixtures");

const created: string[] = [];

/** git 管理外の一時ディレクトリを作る */
export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "gate-check-"));
  created.push(dir);
  return dir;
}

export function cleanup(): void {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
}

/** フィクスチャを一時ディレクトリへコピーしてルートを返す */
export function copyFixture(name: string): string {
  const dir = tempDir();
  cpSync(join(FIXTURES_DIR, name), dir, { recursive: true });
  return dir;
}

export function read(root: string, rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

export function write(root: string, rel: string, text: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text, "utf8");
}

/** ファイルの文字列を置き換える。置き換え対象が無ければ失敗させる */
export function edit(root: string, rel: string, from: string | RegExp, to: string): void {
  const text = read(root, rel);
  const next = text.replace(from, to);
  if (next === text) throw new Error(`置き換え対象がありません: ${rel}: ${String(from)}`);
  write(root, rel, next);
}

export function gate(root: string, stage: number, record = false): RunOutput {
  return runGate({ stage, root, rulesDir: RULES_DIR, record, write: false });
}

/** 判定結果の指摘コード（エラーのみ） */
export function errorCodes(result: GateResult): string[] {
  return result.checks.flatMap((c) =>
    c.findings.filter((f) => f.severity === "error").map((f) => f.code),
  );
}
