---
name: ccsdd-gate
description: 段階の中項目「判定」を行う。小項目 1-8 追求判定、2-5 UX 承認。gate-checker で完了条件を機械チェックし、reviewer のレビューを添えて判定記録 gates/gate-<n>.md を作り、PR を作る。人の判定は判定者が書くか、判定者がプロンプトで伝えた内容を転記する。判定の準備、判定記録の作成・更新を頼まれたときに使う。
argument-hint: "<小項目 ID: 1-8 | 2-5> [判定: <Go|条件付き Go|保留|No-Go> 判定者: <GitHub アカウント> 日付: <YYYY-MM-DD> 条件: <…> 理由: <…>]"
metadata:
  ccsdd-stage: "1 2"
  ccsdd-subitems: "1-8 2-5"
---

# 判定（小項目 1-8、2-5）

## 入力

- 引数: `$ARGUMENTS`。最初の語が判定の小項目 ID（`1-8` または `2-5`）。段階番号 n はその前半（`1-8` → 1）。残りは任意で、判定者が伝えた人の判定（判定、判定者、日付、条件、理由）
- 判定名: 1-8 は「追求判定」、2-5 は「UX 承認」
- 正: 判定の流れと判定記録の形式は `.ccsdd/docs/gates.md`、成果物と引き渡し物は `.ccsdd/docs/stages/stage-<n を 2 桁>.md`
- テンプレート: `.ccsdd/templates/common/gate.md` → 出力: `gates/gate-<n>.md`（と gate-checker が書く `gates/gate-<n>.result.json`）

`gates/gate-<n>.md` の有無と引数で、A・B・C のどれか 1 つを行う。

## A. 判定記録を作る（`gates/gate-<n>.md` が無いとき）

1. `git branch --show-current` が `stage-<n>` であることを確かめる。違えば `git switch stage-<n>`。ブランチが無ければ作業せず、成果物が無いことを報告する
2. `git status --porcelain` で未コミットの変更が無いことを確かめる。あれば作業せず報告する（成果物のコミットは各小項目の skill が行う）
3. 機械チェック: `node .ccsdd/gate-checker/dist/gate-check.mjs --stage <n>` を実行する。`gates/gate-<n>.result.json` が書かれる。不合格でも成果物を直さずに続ける（直すのは各小項目の skill の仕事）
4. AI レビュー: reviewer エージェントに、段階 n の成果物のパス（段階の対応表の「アウトプット」）と「段階 n の成果物を reviewer の観点でレビューする」ことだけを伝える。gate-checker の結果、作成者の意図、期待する結論は渡さない
5. 判定記録を書く（テンプレートの構成で `gates/gate-<n>.md` を新しく作る）:
   - 題: `# GATE-<n>: <判定名>`
   - 対象: 段階の成果物ごとに 1 行（成果物名、パス、結果 JSON の `commit`）
   - 機械チェック結果: 結果 JSON の `checkedAt`、`tool.version`、`passed`（合格 / 不合格）、生データのパス。検査ごとに 1 行（`title`、`status` を合格 / 不合格 / 対象外で、`findings` の要約。無ければ「なし」）
   - AI レビューの所見: reviewer の所見を重大度の高い順に要約する。無ければ「なし」
   - 人の判定: 引数に判定があれば、判定者が伝えたとおりに転記する（日付が無ければ今日の日付）。引数に判定が無ければテンプレートの記入欄をそのまま残す。判定を自分で決めて書かない
   - 引き渡し物: 段階の対応表の 3 節の表をそのまま書く
6. `gates/gate-<n>.md` と `gates/gate-<n>.result.json` だけを `git add` し、`docs: GATE-<n> 判定記録` でコミットする
7. `git push -u origin stage-<n>`
8. PR を作る。`gh pr view stage-<n>` で既存の PR があれば作らずに 9 へ進む。無ければ本文を `.ccsdd/runs/pr-body-gate-<n>.md` に書き（コミットしない）、`gh pr create --base main --head stage-<n> --title "GATE-<n>: <判定名>" --body-file .ccsdd/runs/pr-body-gate-<n>.md` を実行する。本文に書くこと:
   - 概要: 段階 n の判定記録であること
   - 機械チェック: 合否と、不合格の検査の要約
   - AI レビュー: 主な所見
   - 判定者への依頼: `gates/gate-<n>.md` の「人の判定」を記入し、CI の通過を確かめてマージすること
   - `Refs: GATE-<n> <結果 JSON の ids に並ぶ ID>`（半角スペース区切り）
9. 報告する: PR の URL、機械チェックの合否、AI レビューの主な所見、判定者に頼むこと

## B. 人の判定を転記する（`gates/gate-<n>.md` があり、引数に判定があるとき）

1. ブランチ `stage-<n>` で、`gates/gate-<n>.md` の「人の判定」を引数のとおりに書き換える。判定者が無ければ転記せずに報告する
2. 条件付き Go なら、条件ごとに Issue を作り（`gh issue create`、タイトル「`GATE-<n>: <条件の要約>`」）、「条件」に Issue の URL を書く。保留なら、不足している判断材料ごとに Issue を作り、「理由」に URL を書く
3. `node .ccsdd/gate-checker/dist/gate-check.mjs --stage <n> --record --no-write` で判定記録を検査する。判定が Go / 条件付き Go なのに成果物が不合格（`record.decision.inconsistent`）なら、その旨を報告に書く（判定を書き換えない）
4. `gates/gate-<n>.md` だけを `git add` し、`docs: GATE-<n> 人の判定を記録` でコミットし、push する
5. 報告する: 判定記録の検査結果、作った Issue、マージは判定者が行うこと

## C. 機械チェックとレビューをやり直す（`gates/gate-<n>.md` があり、引数に判定が無いとき）

成果物を直した後の再チェック。A の 2〜4 を行い、判定記録の「対象」「機械チェック結果」（AI レビューの所見を含む）を更新する。「人の判定」は触らない。`gates/gate-<n>.md` と `gates/gate-<n>.result.json` をコミットして push する。

## セルフレビューの観点

- 判定記録の 4 節（対象、機械チェック結果、人の判定、引き渡し物）がそろい、題が `GATE-<n>` で始まる
- 機械チェック結果が結果 JSON と一致している（合否、検査の数、指摘）
- 人の判定を AI が決めていない。転記した内容が判定者の伝えた内容と一致している
- PR の `Refs:` に、段階で定義した ID が漏れなく並んでいる
