// 対象リポジトリのファイル操作。パスはルートからの相対パス（区切りは /）で扱う。

import { existsSync, globSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const toPosix = (p: string) => p.replace(/\\/g, "/");

/** glob に一致するファイル（ディレクトリを除く）を、重複なく昇順で返す */
export function globFiles(root: string, patterns: string[]): string[] {
  const out = new Set<string>();
  for (const pattern of patterns) {
    for (const p of globSync(pattern, { cwd: root })) {
      const rel = toPosix(p);
      if (statSync(join(root, rel)).isFile()) out.add(rel);
    }
  }
  return [...out].sort();
}

export const exists = (root: string, rel: string) => existsSync(join(root, rel));

export const readText = (root: string, rel: string) => readFileSync(join(root, rel), "utf8");

/** パスが glob 記法を含むか */
export const isGlob = (p: string) => /[*?[\]{}]/.test(p);

/** パスまたは glob が 1 つ以上のファイル・ディレクトリに一致するか */
export function pathResolves(root: string, rel: string): boolean {
  if (isGlob(rel)) return globSync(rel, { cwd: root }).length > 0;
  return exists(root, rel);
}

/** ファイル一覧に対する glob の一致判定 */
export function matchesAny(rel: string, patterns: string[]): boolean {
  return patterns.some((p) => globToRegExp(p).test(rel));
}

const REGEXP_SPECIAL = new Set([".", "+", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"]);

export function globToRegExp(pattern: string): RegExp {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern.charAt(i);
    if (c === "*") {
      if (pattern.charAt(i + 1) === "*") {
        // 「**/」は 0 個以上のディレクトリ、末尾の「**」は残り全部
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
