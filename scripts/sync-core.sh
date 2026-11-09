#!/usr/bin/env bash
# core の配布物を対象リポジトリへコピーし、core.lock を書く。
# 使い方: scripts/sync-core.sh --target <リポジトリ> [--ref <コミット|タグ>] [--force] [--dry-run]
# 本体は sync-core.ts（Node.js 24 が直接実行する）。
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "node がありません（Node.js 24 以上が必要）" >&2
  exit 2
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  echo "Node.js 24 以上が必要です（現在: $(node --version)）" >&2
  exit 2
fi

exec node "$here/sync-core.ts" "$@"
