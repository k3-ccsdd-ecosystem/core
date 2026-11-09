#!/usr/bin/env node
// gate-check --stage <n> --root <repo-path> [--rules-dir <dir>] [--record] [--no-write] [--json]

import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { formatText } from "./report.js";
import { runGate } from "./run.js";
import { ConfigError } from "./types.js";
import { TOOL_VERSION } from "./version.js";

export const USAGE = `使い方: gate-check --stage <n> [--root <repo-path>] [オプション]

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

/** この CLI のファイルの位置から rules/ を求める（core では src/ または dist/ の隣） */
export function defaultRulesDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "rules");
}

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
}

export function main(argv: string[], io: Io = { out: console.log, err: console.error }): number {
  let values: ReturnType<typeof parse>["values"];
  try {
    values = parse(argv).values;
  } catch (e) {
    io.err(`${(e as Error).message}\n\n${USAGE}`);
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
    io.err(`--stage に 1〜12 の整数を指定してください\n\n${USAGE}`);
    return 2;
  }
  try {
    const { result, written } = runGate({
      stage,
      root: resolve(values.root ?? "."),
      rulesDir: resolve(values["rules-dir"] ?? defaultRulesDir()),
      record: values.record ?? false,
      write: !(values["no-write"] ?? false),
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

function parse(argv: string[]) {
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
      version: { type: "boolean", short: "v" },
    },
  });
}

function isEntryPoint(): boolean {
  try {
    const invoked = process.argv[1];
    return (
      invoked !== undefined &&
      realpathSync(invoked) === realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isEntryPoint()) process.exitCode = main(process.argv.slice(2));
