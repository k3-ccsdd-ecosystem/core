// core の配布物を対象リポジトリへコピーし、core.lock を書く（D5: コピー型 + lockfile）。
// 実行: scripts/sync-core.sh --target <リポジトリ> [--ref <コミット|タグ>] [--force] [--dry-run]
// Node.js 24 が型を外して直接実行する（依存なし）。

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/** core のパス → 対象リポジトリのパス。末尾が / のものはディレクトリ */
export const MAPPINGS: { from: string; to: string }[] = [
  { from: "claude/", to: ".claude/" },
  { from: "templates/", to: ".ccsdd/templates/" },
  { from: "gate-checker/dist/", to: ".ccsdd/gate-checker/dist/" },
  { from: "gate-checker/rules/", to: ".ccsdd/gate-checker/rules/" },
  { from: "docs/ids.md", to: ".ccsdd/docs/ids.md" },
  { from: "docs/gates.md", to: ".ccsdd/docs/gates.md" },
  { from: "docs/stages/", to: ".ccsdd/docs/stages/" },
  { from: "scripts/run-stage.sh", to: ".ccsdd/scripts/run-stage.sh" },
];

export const LOCK_FILE = "core.lock";

export interface LockEntry {
  path: string;
  source: string;
  sha256: string;
}

export interface Lock {
  schemaVersion: 1;
  source: string;
  ref: string;
  commit: string;
  syncedAt: string;
  files: LockEntry[];
}

export type Action =
  | "added"
  | "updated"
  | "unchanged"
  | "overwritten"
  | "skipped"
  | "removed"
  | "kept";

export interface SyncResult {
  lock: Lock;
  actions: { path: string; action: Action; reason?: string }[];
  /** ローカルで変更されていたため更新しなかったファイルがある */
  conflicts: boolean;
}

export interface SyncOptions {
  coreRoot: string;
  target: string;
  ref?: string;
  force?: boolean;
  dryRun?: boolean;
  now?: Date;
}

/** 改行を LF に揃えた内容の SHA-256（Windows の自動変換で CRLF になっても同じ値になる） */
export function hashContent(content: Buffer): string {
  const normalized = content.toString("latin1").replace(/\r\n/g, "\n");
  return createHash("sha256").update(Buffer.from(normalized, "latin1")).digest("hex");
}

/** URL から認証情報（user:token@）を除く */
export function sanitizeUrl(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^@/]+@/i, "$1");
}

function git(cwd: string, args: string[]): Buffer {
  return execFileSync("git", ["-C", cwd, ...args], {
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** ref の時点で配布対象のファイル一覧（core のパスと対象のパス） */
export function listSources(coreRoot: string, ref: string): { source: string; path: string }[] {
  const out = git(coreRoot, [
    "ls-tree",
    "-r",
    "--name-only",
    "-z",
    ref,
    "--",
    ...MAPPINGS.map((m) => m.from),
  ]);
  const files = out.toString("utf8").split("\0").filter(Boolean);
  return files
    .map((source) => {
      const m = MAPPINGS.find((x) =>
        x.from.endsWith("/") ? source.startsWith(x.from) : source === x.from,
      );
      return m ? { source, path: m.to + source.slice(m.from.length) } : undefined;
    })
    .filter((x): x is { source: string; path: string } => x !== undefined)
    .sort((a, b) => a.path.localeCompare(b.path));
}

function readLock(target: string): Lock | undefined {
  const p = join(target, LOCK_FILE);
  if (!existsSync(p)) return undefined;
  return JSON.parse(readFileSync(p, "utf8")) as Lock;
}

export function syncCore(options: SyncOptions): SyncResult {
  const coreRoot = resolve(options.coreRoot);
  const target = resolve(options.target);
  const ref = options.ref ?? "HEAD";
  if (!existsSync(target)) throw new Error(`対象リポジトリがありません: ${target}`);
  const commit = git(coreRoot, ["rev-parse", "--verify", `${ref}^{commit}`])
    .toString()
    .trim();
  let source = coreRoot;
  try {
    source = sanitizeUrl(git(coreRoot, ["remote", "get-url", "origin"]).toString().trim());
  } catch {
    // origin が無ければローカルのパスを記録する
  }

  const old = readLock(target);
  const oldHash = new Map((old?.files ?? []).map((f) => [f.path, f.sha256]));
  const actions: SyncResult["actions"] = [];
  const entries: LockEntry[] = [];
  const write = (rel: string, content: Buffer) => {
    if (options.dryRun) return;
    mkdirSync(dirname(join(target, rel)), { recursive: true });
    writeFileSync(join(target, rel), content);
  };

  const sources = listSources(coreRoot, commit);
  for (const { source: src, path } of sources) {
    const content = git(coreRoot, ["show", `${commit}:${src}`]);
    const hash = hashContent(content);
    entries.push({ path, source: src, sha256: hash });
    const dest = join(target, path);
    if (!existsSync(dest)) {
      write(path, content);
      actions.push({ path, action: "added" });
      continue;
    }
    const current = hashContent(readFileSync(dest));
    if (current === hash) actions.push({ path, action: "unchanged" });
    else if (oldHash.get(path) === current) {
      write(path, content);
      actions.push({ path, action: "updated" });
    } else if (options.force) {
      write(path, content);
      actions.push({ path, action: "overwritten" });
    } else {
      actions.push({
        path,
        action: "skipped",
        reason: oldHash.has(path)
          ? "前回のコピーから変更されている"
          : "core.lock に無いファイルが既にある",
      });
    }
  }

  const newPaths = new Set(sources.map((s) => s.path));
  for (const [path, hash] of oldHash) {
    if (newPaths.has(path)) continue;
    const dest = join(target, path);
    if (!existsSync(dest)) continue;
    if (options.force || hashContent(readFileSync(dest)) === hash) {
      if (!options.dryRun) rmSync(dest);
      actions.push({ path, action: "removed" });
    } else {
      actions.push({
        path,
        action: "kept",
        reason: "core から削除されたが、ローカルで変更されている",
      });
    }
  }

  const lock: Lock = {
    schemaVersion: 1,
    source,
    ref,
    commit,
    syncedAt: (options.now ?? new Date()).toISOString(),
    files: entries,
  };
  if (!options.dryRun) {
    writeFileSync(join(target, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  }
  return {
    lock,
    actions,
    conflicts: actions.some((a) => a.action === "skipped" || a.action === "kept"),
  };
}

const USAGE = `使い方: sync-core.sh --target <リポジトリ> [--ref <コミット|タグ>] [--force] [--dry-run]

core の配布物（claude/、templates/、gate-checker の dist/ と rules/、docs の規約・対応表、run-stage.sh）を
対象リポジトリへコピーし、core.lock（core のコミット、コピーしたファイルと hash）を書く。
再実行すると、前回のコピーから変更されていないファイルだけを更新する。
ローカルで変更されたファイルは更新せずに報告し、終了コード 1 を返す（--force で上書き）。`;

export function main(argv: string[]): number {
  let values: {
    target?: string;
    ref?: string;
    force?: boolean;
    "dry-run"?: boolean;
    help?: boolean;
  };
  try {
    values = parseArgs({
      args: argv,
      strict: true,
      options: {
        target: { type: "string" },
        ref: { type: "string" },
        force: { type: "boolean" },
        "dry-run": { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    }).values;
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (!values.target) {
    console.error(`--target を指定してください\n\n${USAGE}`);
    return 2;
  }
  const coreRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  let result: SyncResult;
  try {
    result = syncCore({
      coreRoot,
      target: values.target,
      ref: values.ref,
      force: values.force,
      dryRun: values["dry-run"],
    });
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  const count = (a: Action) => result.actions.filter((x) => x.action === a).length;
  for (const a of result.actions) {
    if (a.action !== "unchanged")
      console.log(`${a.action}\t${a.path}${a.reason ? `\t${a.reason}` : ""}`);
  }
  console.log(
    `core ${result.lock.commit.slice(0, 12)}（${result.lock.ref}）: 追加 ${count("added")}、更新 ${count("updated")}、上書き ${count("overwritten")}、変更なし ${count("unchanged")}、削除 ${count("removed")}、未更新 ${count("skipped") + count("kept")}${values["dry-run"] ? "（--dry-run のため書き込みなし）" : ""}`,
  );
  if (result.conflicts) {
    console.error(
      "ローカルで変更されたファイルを更新していません。差分を確かめ、上流へ反映するか --force で上書きしてください",
    );
    return 1;
  }
  return 0;
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
