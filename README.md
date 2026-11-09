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
| `scripts/sync-core.sh` | core の配布物を対象リポジトリへコピーし `core.lock` を書く | 配布しない（core から実行） |
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

（実装後に記述）

## 段階の実行

（実装後に記述）

## 開発方法

（実装後に記述）
