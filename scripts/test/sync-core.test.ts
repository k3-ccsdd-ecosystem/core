import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  hashContent,
  LOCK_FILE,
  type Lock,
  listSources,
  sanitizeUrl,
  syncCore,
} from "../sync-core.ts";

const CORE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const created: string[] = [];

function target(): string {
  const dir = mkdtempSync(join(tmpdir(), "sync-core-"));
  created.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const readLock = (dir: string) => JSON.parse(readFileSync(join(dir, LOCK_FILE), "utf8")) as Lock;
const now = new Date("2026-11-09T00:00:00Z");

describe("syncCore", () => {
  it("配布対象を HEAD の内容でコピーし、core.lock に commit と hash を書く", () => {
    const dir = target();
    const { lock, actions, conflicts } = syncCore({ coreRoot: CORE_ROOT, target: dir, now });
    const sources = listSources(CORE_ROOT, "HEAD");
    expect(sources.length).toBeGreaterThan(0);
    expect(conflicts).toBe(false);
    expect(actions.every((a) => a.action === "added")).toBe(true);
    expect(lock.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(lock.syncedAt).toBe("2026-11-09T00:00:00.000Z");
    expect(readLock(dir)).toEqual(lock);
    for (const f of lock.files) {
      expect(hashContent(readFileSync(join(dir, f.path)))).toBe(f.sha256);
    }
    // core の内部向けのファイルは配布しない
    expect(lock.files.some((f) => f.source.startsWith("gate-checker/src/"))).toBe(false);
    expect(lock.files.some((f) => f.source === "docs/decisions-local.md")).toBe(false);
  });

  it("再実行: 変更されていないファイルは更新し、ローカルの変更は残して報告する", () => {
    const dir = target();
    const first = syncCore({ coreRoot: CORE_ROOT, target: dir, now });
    const [a, b] = first.lock.files;
    if (!a || !b) throw new Error("配布対象が 2 件未満");

    // a: 古い版をコピーした状態（lock の hash と内容が一致したまま古い）
    writeFileSync(join(dir, a.path), "old\n");
    const lock = readLock(dir);
    const entry = lock.files.find((f) => f.path === a.path);
    if (entry) entry.sha256 = hashContent(Buffer.from("old\n"));
    writeFileSync(join(dir, LOCK_FILE), JSON.stringify(lock));
    // b: ローカルで変更した状態
    writeFileSync(join(dir, b.path), "local change\n");

    const second = syncCore({ coreRoot: CORE_ROOT, target: dir, now });
    const actionOf = (p: string) => second.actions.find((x) => x.path === p)?.action;
    expect(actionOf(a.path)).toBe("updated");
    expect(actionOf(b.path)).toBe("skipped");
    expect(second.conflicts).toBe(true);
    expect(readFileSync(join(dir, b.path), "utf8")).toBe("local change\n");

    const third = syncCore({ coreRoot: CORE_ROOT, target: dir, force: true, now });
    expect(third.actions.find((x) => x.path === b.path)?.action).toBe("overwritten");
    expect(hashContent(readFileSync(join(dir, b.path)))).toBe(b.sha256);
  });

  it("core から消えたファイルは、変更が無ければ削除し、変更があれば残す", () => {
    const dir = target();
    syncCore({ coreRoot: CORE_ROOT, target: dir, now });
    const lock = readLock(dir);
    writeFileSync(join(dir, ".claude/old.md"), "old\n");
    writeFileSync(join(dir, ".claude/edited.md"), "edited\n");
    lock.files.push(
      {
        path: ".claude/old.md",
        source: "claude/old.md",
        sha256: hashContent(Buffer.from("old\n")),
      },
      { path: ".claude/edited.md", source: "claude/edited.md", sha256: "0".repeat(64) },
    );
    writeFileSync(join(dir, LOCK_FILE), JSON.stringify(lock));

    const result = syncCore({ coreRoot: CORE_ROOT, target: dir, now });
    expect(result.actions.find((x) => x.path === ".claude/old.md")?.action).toBe("removed");
    expect(result.actions.find((x) => x.path === ".claude/edited.md")?.action).toBe("kept");
    expect(existsSync(join(dir, ".claude/old.md"))).toBe(false);
    expect(existsSync(join(dir, ".claude/edited.md"))).toBe(true);
  });

  it("--dry-run は書き込まない", () => {
    const dir = target();
    const result = syncCore({ coreRoot: CORE_ROOT, target: dir, dryRun: true, now });
    expect(result.actions.length).toBeGreaterThan(0);
    expect(existsSync(join(dir, LOCK_FILE))).toBe(false);
  });

  it("CRLF に変わっても同じ hash になる", () => {
    expect(hashContent(Buffer.from("a\r\nb\r\n"))).toBe(hashContent(Buffer.from("a\nb\n")));
  });

  it("remote の URL から認証情報を除く", () => {
    expect(sanitizeUrl("https://user:token@github.com/k3-ccsdd-ecosystem/core.git")).toBe(
      "https://github.com/k3-ccsdd-ecosystem/core.git",
    );
    expect(sanitizeUrl("git@github.com:k3-ccsdd-ecosystem/core.git")).toBe(
      "git@github.com:k3-ccsdd-ecosystem/core.git",
    );
  });
});
