# core

CCSDD エコシステム（Claude Code を前提にしたスペック駆動開発）の中核リポジトリ。開発フローの各段階で使う成果物テンプレート、ID 規約、判定の完了条件と機械チェック（gate-checker）、AI 設定（rules / agents / skills / settings.json）を持ち、雛形（template-spec / fe / be / infra）と製品リポジトリへ配布する。

この README の構成:

1. 役割
2. 構成（ディレクトリと目的）
3. 雛形・製品リポジトリへの配布
4. 段階の実行
5. 開発方法（lint / test / build）

## 役割

- 工程の定義を、AI と機械チェックが使える形にする（段階ごとのインプット、アウトプット、skill、完了条件）
- 成果物の形式を揃える（テンプレート、ID 規約、記法）
- 判定の前に完了条件を機械チェックし、人の判定を記録する形式を決める
- 製品リポジトリで Claude Code が使う設定と手順（rules / agents / skills / settings.json）を配る

v0.1 の対象は段階 1（企画）と段階 2（UX 設計）。

## 構成

| パス | 目的 | 配布先（製品リポジトリ） |
|---|---|---|
| `docs/ids.md` | ID 規約（形式、採番、参照の書き方、Issue / PR での書き方） | `.ccsdd/docs/ids.md` |
| `docs/gates.md` | 判定記録の形式と、段階ごとの完了条件 | `.ccsdd/docs/gates.md` |
| `docs/stages/` | 段階ごとの中項目・小項目の対応表（インプット、アウトプット、skill、機械チェック） | `.ccsdd/docs/stages/` |
| `docs/decisions-local.md` | core で置いた暫定決定の一覧 | 配布しない |
| `templates/spec/` | spec リポジトリの成果物テンプレート（段階 1・2） | `.ccsdd/templates/spec/` |
| `templates/common/` | 全リポジトリ共通のテンプレート（判定記録、入力記録） | `.ccsdd/templates/common/` |
| `gate-checker/` | 完了条件の機械チェック CLI（TypeScript）。`rules/` に完了条件を宣言的に置く | `.ccsdd/gate-checker/`（`dist/` と `rules/`） |
| `claude/` | 製品リポジトリの AI 設定（rules / agents / skills / settings.json） | `.claude/` |
| `scripts/run-stage.sh` | 製品リポジトリで段階の skill をヘッドレス起動する | `.ccsdd/scripts/run-stage.sh` |
| `scripts/sync-core.sh`（本体は `sync-core.ts`） | core の配布物を対象リポジトリへコピーし `core.lock` を書く | 配布しない（core から実行） |
| `.github/workflows/ci.yml` | lint / typecheck / test / build の確認 | 配布しない |

製品リポジトリ（spec）の配置:

```text
<product>-spec/
├── .claude/              AI 設定（core の claude/ のコピー）
├── .ccsdd/               core の配布物（テンプレート、gate-checker、文書、起動スクリプト）と実行記録（runs/）
├── core.lock             コピー元の core のコミット、コピーしたファイルと hash
├── docs/
│   ├── 01-planning/      段階 1 の成果物
│   └── 02-ux/            段階 2 の成果物（stories/ に .feature）
└── gates/                判定記録（gate-<段階番号>.md と gate-<段階番号>.result.json）
```

## 配布

雛形（template-spec など）を作るとき、または製品リポジトリを core の新しい版に更新するときに、core のクローンで実行する。前提は Node.js 24 以上と git。

```bash
scripts/sync-core.sh --target ../template-spec                 # HEAD の内容を配布
scripts/sync-core.sh --target ../todo-spec --ref <コミット|タグ>  # 版を指定
scripts/sync-core.sh --target ../todo-spec --dry-run           # 変わるファイルの確認だけ
```

- 配るのは core の git の ref の内容（作業ツリーの未コミットの変更は配らない）
- 対象リポジトリのルートに `core.lock`（core のコミット、コピーしたファイルと hash）を書く。コピーした結果は対象リポジトリでコミットする
- 再実行の挙動:

| 対象リポジトリのファイル | 動作 |
|---|---|
| 無い | 追加する |
| 前回のコピーから変更されていない | core の内容に更新する |
| ローカルで変更されている、または `core.lock` に無いファイルが既にある | 更新せずに報告し、終了コード 1（`--force` で上書き） |
| core から消えた | 変更が無ければ削除する。変更があれば残して報告する |

- hash は改行を LF に揃えて計算する。対象リポジトリには `.gitattributes`（`* text=auto eol=lf`）を置く
- ローカルの改変は core へ PR して取り込み、再配布する（D5）

## 段階の実行

製品リポジトリのルートで、段階の小項目を skill としてヘッドレス起動する（D23）。

```bash
bash .ccsdd/scripts/run-stage.sh <段階番号> <小項目 ID | skill 名> [プロンプト]
bash .ccsdd/scripts/run-stage.sh 1 1-3
CCSDD_DRY_RUN=1 bash .ccsdd/scripts/run-stage.sh 1 1-3   # 起動せずにコマンドを表示
```

- 実行するコマンド: `claude -p "/<skill> <小項目 ID> <プロンプト>" --model opus --setting-sources project --settings .claude/settings.json --output-format json --max-turns 50`（`CCSDD_MODEL`、`CCSDD_MAX_TURNS` で変更できる）
- 結果 JSON を `.ccsdd/runs/<日時>-<段階>-<小項目 ID>.json` に保存し、`permission_denials` と `total_cost_usd`（参考値）を要約して表示する
- 終了コード: claude が失敗したらその値、成功でも `permission_denials` があれば 3
- 段階ごとの小項目と skill は [docs/stages/](./docs/stages/)、判定の流れと完了条件は [docs/gates.md](./docs/gates.md)、ID は [docs/ids.md](./docs/ids.md)

## 開発方法

```bash
npm ci
npm run lint        # Biome（lint と整形の検査。Markdown は対象外）
npm run format      # Biome で整形する
npm run typecheck   # tsc
npm test            # Vitest（gate-checker と sync-core）
npm run build       # gate-checker/dist/gate-check.mjs を作り直す
npm run gate-check -- --stage 2 --root gate-checker/test/fixtures/todo-pass --no-write
```

- `gate-checker/src/` を変えたら `npm run build` を実行し、`dist/` も一緒にコミットする（CI が src から作り直したものとの一致を検査する）
- 完了条件（`gate-checker/rules/`）を変えたら、テンプレート（`templates/`）、[docs/gates.md](./docs/gates.md)、フィクスチャ（`gate-checker/test/fixtures/`）を合わせて直す。テンプレートと完了条件のずれは `gate-checker/test/templates.test.ts` が検出する
- 段階を足すときは、`gate-checker/rules/stage-<n>.json`、`templates/<リポジトリ>/`、`docs/stages/stage-<n を 2 桁>.md`、`claude/skills/` をそろえる
- コミットメッセージは「`<type>: <要約>`」（type は docs / feat / fix / chore / test / ci）
- core で置いた暫定の決定は [docs/decisions-local.md](./docs/decisions-local.md)
