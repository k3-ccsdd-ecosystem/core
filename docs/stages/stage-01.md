# 段階 1: 企画

リポジトリ: spec。判定: GATE-1 追求判定。引き渡し物: 企画書、制約一覧。

この文書の構成:

1. 小項目の対応表（インプット、アウトプット、skill、機械チェック）
2. 作業の進め方
3. 判定と引き渡し物

パスの書き方は [gates.md](../gates.md) の冒頭と同じ（テンプレートは core の `templates/`、製品リポジトリでは `.ccsdd/templates/`）。

## 1. 小項目の対応表

「機械チェック」は判定 1-8 で gate-checker が行う検査（詳細は [gates.md](../gates.md) の 5 節）。「新規 / 既存」は、その開発パターンで小項目が必要なら ○。

| ID | 中項目 | 小項目 | インプット | アウトプット（置き場） | テンプレート | skill | agent | 機械チェック | 新規 | 既存 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1-1 | 準備 | spec リポジトリの作成と雛形適用 | （外部）プロジェクトの開始 | spec リポジトリ（`.claude/`、`.ccsdd/`、`core.lock`） | — | —（人が実施。2 節） | — | — | ○ | ○ |
| 1-2 | 企画 | アイデアの発散と背景整理 | 1-1 spec リポジトリ、（外部）着想・課題メモ | ブレスト記録（`docs/01-planning/brainstorm.md`） | `spec/01-planning/brainstorm.md` | `ccsdd-planning` | planner | 必須節、発散したアイデア 3 件以上 | ○ | ○ |
| 1-3 | 企画 | コンセプト・対象ユーザー・価値仮説の定義 | 1-2 ブレスト記録 | 企画書（`docs/01-planning/concept.md`） | `spec/01-planning/concept.md` | `ccsdd-planning` | planner | 必須節、表、検証の問答 3 件以上、参照元のパス | ○ | ○ |
| 1-4 | 企画 | 類似事例・技術の調査 | 1-2 ブレスト記録 | 調査メモ（`docs/01-planning/research.md`） | `spec/01-planning/research.md` | `ccsdd-planning` | planner | 必須節、各行の出典、参照元のパス | ○ | ○ |
| 1-5 | 現状把握 | 既存システムの調査 | （既存）リポジトリ、稼働環境、既存文書 | 現状調査報告（`docs/01-planning/as-is.md`） | `spec/01-planning/as-is.md` | `ccsdd-as-is` | planner | 必須節、表（開発パターンが「既存」のときだけ） |  | ○ |
| 1-6 | 制約 | 制約一覧の作成 | 1-3 企画書、1-4 調査メモ、（外部）法規・予算・契約条件、（既存）1-5 現状調査報告 | 制約一覧（`docs/01-planning/constraints.md`。ID: `CST`） | `spec/01-planning/constraints.md` | `ccsdd-constraints` | planner | 必須節、7 観点の網羅、全列、`CST` の形式・重複・参照 | ○ | ○ |
| 1-7 | 計画 | 適用する段階と深さの選択（計画パス） | 1-3 企画書、1-6 制約一覧、（既存）1-5 現状調査報告 | 計画パス（`docs/01-planning/plan-path.md`） | `spec/01-planning/plan-path.md` | `ccsdd-plan-path` | planner | 必須節、開発パターン、12 段階の適用と理由 | ○ | ○ |
| 1-8 | 判定 | 追求判定 | 1-3 企画書、1-4 調査メモ、1-6 制約一覧、1-7 計画パス | 判定記録（`gates/gate-1.md`、`gates/gate-1.result.json`） | `common/gate.md` | `ccsdd-gate` | reviewer | 上記すべて。CI では判定記録も（`--record`） | ○ | ○ |

## 2. 作業の進め方

1-1 は人が行う:

1. GitHub で template-spec から製品の spec リポジトリを作る（例: `gh repo create <org>/<product>-spec --template k3-ccsdd-ecosystem/template-spec --public --clone`）
2. 既存のリポジトリに後付けする場合や、雛形より新しい core を入れる場合は、core のクローンで `scripts/sync-core.sh --target <spec リポジトリ>` を実行し、`core.lock` とコピーしたファイルをコミットする

1-2〜1-8 は、spec リポジトリのルートで `bash .ccsdd/scripts/run-stage.sh` で skill を起動する（対話セッションで `/ccsdd-planning 1-3` のように起動してもよい）:

```bash
bash .ccsdd/scripts/run-stage.sh 1 1-2 "着想メモ: <メモの本文、またはファイルのパス>"
bash .ccsdd/scripts/run-stage.sh 1 1-3
bash .ccsdd/scripts/run-stage.sh 1 1-4
bash .ccsdd/scripts/run-stage.sh 1 1-5   # 既存システムの更改のときだけ
bash .ccsdd/scripts/run-stage.sh 1 1-6 "予算: 月額 3,000 円以内"
bash .ccsdd/scripts/run-stage.sh 1 1-7
bash .ccsdd/scripts/run-stage.sh 1 1-8
```

- skill は作業ブランチ `stage-1` に成果物を書き、セルフレビューしてから小項目ごとにコミットする
- 1-8 は PR（`GATE-1: 追求判定`）まで作る。判定者が判定記録の「人の判定」を書き、PR をマージして確定する

## 3. 判定と引き渡し物

| 引き渡し物 | パス | 受け取る段階 |
|---|---|---|
| 企画書 | `docs/01-planning/concept.md` | 2-1 |
| 制約一覧 | `docs/01-planning/constraints.md` | 2-1、2-4、3-2 以降の入力の固定 |
| 計画パス | `docs/01-planning/plan-path.md` | 各段階の準備（省略・縮小の確認） |
