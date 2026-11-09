#!/usr/bin/env bash
# 製品リポジトリで段階の skill をヘッドレス起動し、結果 JSON を記録する（D23）。
#
# 使い方: run-stage.sh <段階番号> <小項目 ID | skill 名> [プロンプト...]
#   例: run-stage.sh 1 1-3
#       run-stage.sh 1 1-2 "着想メモ: 1 行で追加できる ToDo アプリ"
#       run-stage.sh 1 ccsdd-gate "1-8 判定: Go 判定者: kokko333 理由: 完了条件を満たす"
#
# 小項目 ID を渡すと、.claude/skills/*/SKILL.md の metadata.ccsdd-subitems からその小項目の skill を探し、
# 「/<skill> <小項目 ID> <プロンプト>」で起動する。skill 名を渡すと「/<skill> <プロンプト>」で起動する。
#
# 実行するコマンド（製品リポジトリのルートで）:
#   claude -p <プロンプト> --model opus --setting-sources project --settings .claude/settings.json \
#     --output-format json --max-turns <n>
# 結果 JSON は .ccsdd/runs/<日時>-<段階>-<小項目 ID または skill 名>.json に保存し、
# permission_denials と total_cost_usd（参考値）を標準出力に要約する。
#
# 環境変数: CCSDD_MAX_TURNS（既定 50）、CCSDD_MODEL（既定 opus）、CCSDD_DRY_RUN=1（起動せずにコマンドを表示）
# 終了コード: claude が失敗したらその終了コード。成功しても権限で拒否された操作があれば 3。
set -euo pipefail

die() {
  echo "run-stage: $*" >&2
  exit 2
}

usage() {
  sed -n '2,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

[ $# -ge 2 ] || usage
stage="$1"
target="$2"
shift 2
extra="$*"

[[ "$stage" =~ ^([1-9]|1[0-2])$ ]] || die "段階番号は 1〜12 の整数で指定してください: $stage"
max_turns="${CCSDD_MAX_TURNS:-50}"
[[ "$max_turns" =~ ^[1-9][0-9]*$ ]] || die "CCSDD_MAX_TURNS は正の整数で指定してください: $max_turns"
model="${CCSDD_MODEL:-opus}"

root="$(git rev-parse --show-toplevel 2>/dev/null)" || die "git リポジトリの中で実行してください"
cd "$root"
settings=".claude/settings.json"
[ -f "$settings" ] || die "$settings がありません（core の scripts/sync-core.sh で配布してください）"

if [[ "$target" =~ ^[0-9]+-[0-9]+$ ]]; then
  subitem="$target"
  [ "${subitem%%-*}" = "$stage" ] || die "小項目 $subitem は段階 $stage のものではありません"
  skill=""
  for f in .claude/skills/*/SKILL.md; do
    [ -f "$f" ] || continue
    if grep -Eq "^[[:space:]]*ccsdd-subitems:.*[\" ]${subitem}([\" ]|$)" "$f"; then
      skill="$(basename "$(dirname "$f")")"
      break
    fi
  done
  [ -n "$skill" ] || die "小項目 $subitem を扱う skill が .claude/skills にありません"
  args="$subitem${extra:+ $extra}"
  label="$subitem"
else
  skill="$target"
  [ -f ".claude/skills/$skill/SKILL.md" ] || die "skill $skill が .claude/skills にありません"
  args="$extra"
  label="$skill"
fi
prompt="/$skill${args:+ $args}"

if [ "${CCSDD_DRY_RUN:-}" = "1" ]; then
  printf 'claude -p "%s" --model %s --setting-sources project --settings %s --output-format json --max-turns %s\n' \
    "$prompt" "$model" "$settings" "$max_turns"
  exit 0
fi

command -v claude >/dev/null 2>&1 || die "claude コマンドがありません"
command -v node >/dev/null 2>&1 || die "node がありません"

mkdir -p .ccsdd/runs
out=".ccsdd/runs/$(date +%Y%m%d-%H%M%S)-${stage}-${label}.json"

echo "run-stage: $prompt（model: $model、max-turns: $max_turns）" >&2
set +e
# Git Bash（Windows）で「/」始まりの引数がパスに変換されないようにする
MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' claude -p "$prompt" \
  --model "$model" \
  --setting-sources project \
  --settings "$settings" \
  --output-format json \
  --max-turns "$max_turns" >"$out"
code=$?
set -e

node - "$out" "$code" <<'JS'
const fs = require("node:fs");
const [file, code] = process.argv.slice(2);
const text = fs.readFileSync(file, "utf8");
let r;
try {
  r = JSON.parse(text);
} catch {
  console.log(`結果: JSON ではない出力（claude の終了コード ${code}）`);
  console.log(text.slice(0, 2000));
  process.exit(Number(code) || 1);
}
const denials = Array.isArray(r.permission_denials) ? r.permission_denials : [];
console.log(`結果: ${r.subtype ?? "?"}${r.is_error ? "（エラー）" : ""}`);
console.log(`ターン数: ${r.num_turns ?? "?"}、所要: ${r.duration_ms != null ? Math.round(r.duration_ms / 1000) : "?"} 秒`);
console.log(`total_cost_usd（参考値）: ${r.total_cost_usd ?? "?"}`);
console.log(`permission_denials: ${denials.length}`);
for (const d of denials) {
  const input = d.tool_input ?? {};
  const what = input.command ?? input.file_path ?? input.url ?? JSON.stringify(input);
  console.log(`  - ${d.tool_name}: ${String(what).slice(0, 200)}`);
}
console.log(`記録: ${file}`);
if (Number(code) !== 0) process.exit(Number(code));
process.exit(denials.length > 0 ? 3 : 0);
JS
