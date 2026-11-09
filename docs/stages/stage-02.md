# 段階 2: UX 設計

リポジトリ: spec。判定: GATE-2 UX 承認。引き渡し物: ストーリー一覧、画面遷移図、MVP スライス。

この文書の構成:

1. 小項目の対応表（インプット、アウトプット、skill、機械チェック）
2. 作業の進め方
3. 判定と引き渡し物

パスの書き方は [gates.md](../gates.md) の冒頭と同じ（テンプレートは core の `templates/`、製品リポジトリでは `.ccsdd/templates/`）。

## 1. 小項目の対応表

「機械チェック」は判定 2-5 で gate-checker が行う検査（詳細は [gates.md](../gates.md) の 6 節）。段階 2 は新規・既存とも全小項目を行う。

| ID | 中項目 | 小項目 | インプット | アウトプット（置き場） | テンプレート | skill | agent | 機械チェック |
|---|---|---|---|---|---|---|---|---|
| 2-1 | 設計 | ペルソナとジャーニーの作成 | 1-3 企画書、1-6 制約一覧 | ペルソナとジャーニー（`docs/02-ux/personas.md`。ID: `PER`） | `spec/02-ux/personas.md` | `ccsdd-ux-design` | ux-designer | 必須節、表、全ペルソナにジャーニー、`PER` の形式・重複・参照 |
| 2-2 | 設計 | ユーザーストーリーと受け入れ条件の作成 | 2-1 ペルソナ、ジャーニー | ストーリー一覧（`docs/02-ux/stories/US-<n>.feature`。ID: `US`、`US-<n>-AC<m>`） | `spec/02-ux/stories/US-n.feature` | `ccsdd-ux-design` | ux-designer | Gherkin の構文、ID タグ、ファイル名、When / Then、全ストーリーがペルソナを参照 |
| 2-3 | 設計 | 画面遷移の定義 | 2-2 ストーリー一覧 | 画面遷移図（`docs/02-ux/screens.md`。ID: `SCR`） | `spec/02-ux/screens.md` | `ccsdd-ux-design` | ux-designer | 必須節、表、全ストーリーに画面、全画面がストーリーを参照 |
| 2-4 | 設計 | MVP の切り方（ストーリーの優先順位） | 2-2 ストーリー一覧、1-6 制約一覧 | MVP スライス（`docs/02-ux/mvp.md`） | `spec/02-ux/mvp.md` | `ccsdd-ux-design` | ux-designer | 必須節、優先度と MVP の値、全ストーリーが分類済み |
| 2-5 | 判定 | UX 承認 | 2-2 ストーリー一覧、2-3 画面遷移図、2-4 MVP スライス | 判定記録（`gates/gate-2.md`、`gates/gate-2.result.json`） | `common/gate.md` | `ccsdd-gate` | reviewer | 上記すべてと ID の重複。CI では判定記録も（`--record`） |

## 2. 作業の進め方

段階 2 は GATE-1 の PR をマージしてから始める。spec リポジトリのルートで:

```bash
bash .ccsdd/scripts/run-stage.sh 2 2-1
bash .ccsdd/scripts/run-stage.sh 2 2-2
bash .ccsdd/scripts/run-stage.sh 2 2-3
bash .ccsdd/scripts/run-stage.sh 2 2-4
bash .ccsdd/scripts/run-stage.sh 2 2-5
```

- skill は作業ブランチ `stage-2`（main から作る）に成果物を書き、セルフレビューしてから小項目ごとにコミットする
- 2-2 は 1 ストーリー 1 ファイル。受け入れ条件は Gherkin で書き、Scenario に `@US-<n>-AC<m>` を付ける（[ids.md](../ids.md) の 3 節）
- 2-3 以降で既存のストーリーを直す必要が出たら、同じブランチで `.feature` を直し、直した理由をコミットメッセージに書く

## 3. 判定と引き渡し物

| 引き渡し物 | パス | 受け取る段階 |
|---|---|---|
| ストーリー一覧 | `docs/02-ux/stories/` | 3-2 入力の固定 |
| 画面遷移図 | `docs/02-ux/screens.md` | 3-2 入力の固定 |
| MVP スライス | `docs/02-ux/mvp.md` | 3-2 入力の固定 |
| 制約一覧（段階 1） | `docs/01-planning/constraints.md` | 3-2 入力の固定 |

段階 3 の fe リポジトリは、これらをコピーせず入力記録（`templates/common/inputs.md`）にパスと GATE-2 のマージ後のコミットを固定して参照する。
