# core の暫定決定

core v0.1 の構築で、管理リポジトリの決定事項（D1〜D25）に書かれていない部分を埋めた暫定の決定。拒否・変更する場合は、該当する番号を挙げて管理リポジトリの Issue に積む。

この文書の構成:

1. 製品リポジトリの配置と成果物
2. ID と判定
3. gate-checker
4. 配布（sync-core.sh と core.lock）
5. 起動（run-stage.sh）
6. AI 設定（.claude/）
7. 開発環境
8. 先行事例からの取り込み
9. 未決定のこと

「見直し」は、決定を見直す時期。

## 1. 製品リポジトリの配置と成果物

| # | 決定 | 理由 | 見直し |
|---|---|---|---|
| L1 | 成果物は `docs/<段階番号 2 桁>-<英名>/`（`docs/01-planning/`、`docs/02-ux/`）、判定記録は `gates/`、core の配布物は `.ccsdd/`、AI 設定は `.claude/` に置く | D7「成果物は可視ディレクトリに集め、AI 設定は `.claude/`」。段階番号で並び、fe / be / infra でも同じ形（`docs/03-ui/` など）にできる | template-fe の作成時 |
| L2 | 成果物のファイル名: `brainstorm.md`、`concept.md`、`research.md`、`as-is.md`、`constraints.md`、`plan-path.md`、`personas.md`、`stories/US-<n>.feature`、`screens.md`、`mvp.md`。ストーリー一覧は `stories/` ディレクトリそのもので、索引ファイルを置かない | 索引と `.feature` の二重管理を避ける | 段階 3 の入力の固定で不便が出たら |
| L3 | テンプレートの記入欄は `{{...}}`、記入の手引きは HTML コメント。gate-checker は記入欄の残りを不合格にし、HTML コメントを読まない | 埋め忘れを機械的に検出でき、手引きを成果物に残しても判定に影響しない | PoC-1 の振り返り |
| L4 | 判定記録と入力記録のテンプレートは `templates/common/` に置く（依頼では `templates/spec/` の対象） | fe / be / infra の雛形も同じテンプレートを使う | template-fe の作成時 |
| L5 | 計画パスの「深さ」は「適用」列（実施 / 縮小 / 省略）で表し、深さの列を置かない | 段階ごとに深さの尺度が違い、v0.1 では選択の記録で足りる | PoC-1 の振り返り |
| L6 | 価値仮説は ID を持たず「仮説 n」で参照する。MVP スライスと価値仮説の対応は機械チェックしない（空欄だけを検査） | D24 に接頭辞が無い。接頭辞を足すなら D24 の改定になる | D24 の見直し時 |
| L7 | ジャーニーは各ペルソナの見出し `### ジャーニー: PER-<n>` の下に表で書く | ID を見出しの先頭に置くと定義の重複になる（L10） | PoC-1 の振り返り |

## 2. ID と判定

| # | 決定 | 理由 | 見直し |
|---|---|---|---|
| L8 | 連番は 1 から、ゼロ埋めしない。範囲の表記（`US-1〜3`）は使わない。`GATE` は 1〜12 | 形式の検査と参照の検査を単純にする | — |
| L9 | 受け入れ条件の Gherkin はキーワードを英語、本文を日本語で書く。各 Scenario に When と Then を必須にする（Given は Background でもよい） | E2E ツールとの互換。観察できる結果を必ず持たせる | 段階 6 の E2E ツールの選定時 |
| L10 | ID の定義は「見出しの先頭」か「第 1 列の見出しが `ID` の表の第 1 列」（Markdown）、Feature / Scenario のタグ（Gherkin）。定義になるのは、その接頭辞を定義する文書の中だけ。それ以外はすべて参照 | 書き手の負担を増やさずに、定義と参照を機械的に区別できる最小の規則 | PoC-1 の振り返り |
| L11 | 他リポジトリの ID はリポジトリ名を付けずに書き、入力記録の「参照する ID」に並べる | 接頭辞ごとに定義するリポジトリが 1 つに決まり、`GATE-<n>` も段階番号で一意になる | template-fe の作成時 |
| L12 | 判定の値は Go / 条件付き Go / 保留 / No-Go。Go と条件付き Go は機械チェックの合格を前提にする | D25（Go / No-Go / 条件付き）と 1-8 のアウトプット（Go / No-Go / 保留）を合わせた | PoC-1 の振り返り |
| L13 | 判定記録の「機械チェック結果」に小節「AI レビューの所見」を置く | D25 の 4 節を保ったまま、reviewer の所見（判定の参考）の置き場を作る | PoC-1 の振り返り |
| L14 | 判定 1 の完了条件に 1-2 ブレスト記録を含める。1-5 現状調査報告は計画パスの「開発パターン: 既存」のときだけ必須 | ブレスト記録は企画書の参照元が指す。現状調査報告は既存のときだけの小項目 | PoC-1 の振り返り |
| L15 | v0.1 の完了条件は計画パスの省略・縮小を読まない。省略した段階の判定は、判定記録に「省略（計画パスによる）」と書いて人が判定する | 省略の条件を完了条件に入れると規則が段階ごとに分岐する。v0.1 の題材は全段階を実施する | 省略する段階が出たとき |
| L16 | 作業ブランチは `stage-<n>`。小項目ごとにコミットし、メッセージは `docs: <小項目 ID> <成果物名>`。判定の PR のタイトルは `GATE-<n>: <判定名>`、本文の `Refs:` は半角スペース区切り | D24 の Issue / PR の書き方を、段階の作業に当てはめた | PoC-1 の振り返り |

## 3. gate-checker

| # | 決定 | 理由 | 見直し |
|---|---|---|---|
| L17 | 完了条件は JSON（`rules/stage-<n>.json`）で書く。YAML にしない | 依存を増やさない。型は `src/types.ts` | — |
| L18 | 依存込みの 1 ファイル（esbuild で `dist/gate-check.mjs`）をコミットし、製品リポジトリへはコピーで配る。CI で src から作り直したものと一致することを検査する。同梱した依存のライセンスは `dist/THIRD_PARTY_LICENSES.md` | D5 のコピー型。製品リポジトリで npm install を要らなくする | npm パッケージ化（v0.2 以降） |
| L19 | 終了コードは 0 = 合格、1 = 不合格、2 = 引数・完了条件の誤り。`--record` で判定記録も検査し、`--no-write` で結果 JSON を書かない | CI と skill の両方から同じ CLI を使う | template-spec の CI の作成時 |
| L20 | 構文エラーの `.feature` の中の ID は参照の検査から除く（他の文書からの参照は未解決として残す） | 1 つの構文エラーから自身のタグの「未解決」が連鎖する誤検出を避ける | — |
| L21 | 結果 JSON の `commit` と `dirty` は git から取る（`dirty` は結果 JSON 自身を除く。未追跡のファイルも含む） | 判定記録の「対象」のコミットに使う | — |

## 4. 配布（sync-core.sh と core.lock）

| # | 決定 | 理由 | 見直し |
|---|---|---|---|
| L22 | 配布先: `claude/` → `.claude/`、`templates/` → `.ccsdd/templates/`、`gate-checker/{dist,rules}/` → `.ccsdd/gate-checker/`、`docs/{ids,gates}.md` と `docs/stages/` → `.ccsdd/docs/`、`scripts/run-stage.sh` → `.ccsdd/scripts/`。v0.1 は製品リポジトリの種類（spec / fe …）で配布対象を分けない | skill が規約・対応表を製品リポジトリの中で読めるようにする | template-fe の作成時 |
| L23 | 配る内容は core の git の ref（既定 HEAD、`--ref` で指定）の内容。作業ツリーの未コミットの変更は配らない | `core.lock` の commit と中身を一致させる | — |
| L24 | `core.lock` は対象リポジトリのルートに JSON で置く（schemaVersion、source、ref、commit、syncedAt、files[path, source, sha256]）。source は origin の URL から認証情報を除いたもの | `skills-lock.json`（D4）と同じ置き場。URL にトークンが入っていても記録しない | skills-vendored の lockfile と揃える時 |
| L25 | hash は改行を LF に揃えた内容の SHA-256 | Windows の改行の自動変換（core.autocrlf）で CRLF になっても、ローカルの変更と誤判定しない | — |
| L26 | 再実行では、前回のコピーから変更されていないファイルだけを更新する。ローカルで変更されたファイルは上書きせず終了コード 1（`--force` で上書き）。core から消えたファイルは、変更が無ければ削除する | D5「改変は上流へ PR するか fork する」。ローカルの改変を黙って消さない | 差分 PR の自動化（v0.2） |
| L27 | sync-core の本体は TypeScript（`sync-core.ts`）を Node.js 24 が直接実行する。`sync-core.sh` は Node.js の版を確かめて呼ぶだけ | JSON の読み書きと hash を依存なしで扱い、試験を Vitest で書ける | — |

## 5. 起動（run-stage.sh）

| # | 決定 | 理由 | 見直し |
|---|---|---|---|
| L28 | 第 2 引数は小項目 ID か skill 名。小項目 ID から skill を、SKILL.md の `metadata.ccsdd-subitems` で引き、`/<skill> <小項目 ID> <プロンプト>` で起動する | 段階の対応表と起動を同じ ID で扱う | — |
| L29 | 結果 JSON は `.ccsdd/runs/<日時>-<段階>-<小項目 ID または skill 名>.json`（依頼の `<日時>-<段階>.json` に識別子を足した） | 同じ段階の複数の起動を区別する | WBS 0-7 の集計の作成時 |
| L30 | 既定は `--max-turns 50`、`--model opus`。環境変数 `CCSDD_MAX_TURNS`、`CCSDD_MODEL` で上書きでき、`CCSDD_DRY_RUN=1` で起動せずにコマンドを表示する | D23 のモデル分担を既定にし、確認用に軽いモデルでも動かせるようにする | PoC-1 の利用量の測定後 |
| L31 | 終了コードは、claude が失敗したらその値、成功でも `permission_denials` があれば 3 | PoC-1 の成功基準（`permission_denials` が 0）をスクリプトの結果で判別する | — |
| L32 | claude の起動に `MSYS_NO_PATHCONV=1` を付ける | Git Bash（Windows）では「/」で始まるプロンプトが `C:/Program Files/Git/…` に変換され、skill が起動しない（2026-11-09 に実測） | — |

## 6. AI 設定（.claude/）

| # | 決定 | 理由 | 見直し |
|---|---|---|---|
| L33 | skill は中項目単位の 6 つ: `ccsdd-planning`（1-2〜1-4）、`ccsdd-as-is`（1-5）、`ccsdd-constraints`（1-6）、`ccsdd-plan-path`（1-7）、`ccsdd-ux-design`（2-1〜2-4）、`ccsdd-gate`（1-8、2-5）。名前に `ccsdd-` を付ける | 依頼の粒度（中項目単位）。輸入する skill と名前で区別する | PoC-1 の振り返り |
| L34 | skill の引数の最初の語は小項目 ID で、1 回の起動で 1 小項目だけを行う | 依頼された範囲だけを行い、ヘッドレス実行の 1 回の範囲を狭める | — |
| L35 | 1-1（spec リポジトリの作成と雛形適用）は skill を置かず、人が GitHub のテンプレートからリポジトリを作り、必要なら sync-core.sh を実行する | 公開リポジトリの作成は auto mode の分類器が拒否する（WBS 0-4）。core の外の操作 | v0.2（CI 上の実行基盤） |
| L36 | agents は planner（段階 1）、ux-designer（段階 2）、reviewer（品質、読み取り専用）。工程担当は担当の skill を `skills` で読み込み、`model` は `inherit` | D11 の工程担当と品質。reviewer はファイルを変えない | PoC-1 の振り返り |
| L37 | 判定の skill は人の判定を決めない。プロンプトで渡された判定を転記するか、記入欄を残す。PR の本文は `.ccsdd/runs/` に書いて `--body-file` で渡す | D9。複数行の本文をコマンドに埋め込むと権限の判定が不安定になる | — |
| L38 | settings.json の allow: `Edit(./**)`、WebSearch、WebFetch、git の参照・ブランチ・add・commit・push・pull、gh の PR・Issue の作成と参照、npm の lint / format / typecheck / test、gate-check。deny: D18 の項目（`gh pr merge`、force push、`terraform apply` / `destroy`、リポジトリ・リリース・シークレットの削除、`gh api` の DELETE）と、秘密情報の Read（`.env`、鍵、tfstate、`~/.ssh`、`~/.aws`、`~/.config/gh`）。`terraform plan` は入れない | 段階 1・2（spec）に要る範囲。WebFetch は 1-4 の調査に要る。`terraform plan` は infra の雛形で足す | template-infra の作成時 |
| L39 | hooks は置かない | permissions の deny で足りる。フックは ask / deny を覆せず（D18）、`jq` への依存で動かなかった例がある（WBS 0-2） | 拒否されるべき操作が通った例が出たら |
| L40 | rules は 6 つ（language、documents、ids、git-issue-pr、delegation、security）。コードの開発原則は fe / be の雛形で足す | D11 の項目（規約、委譲、セキュリティ、日本語）と、成果物の書き方 | template-fe の作成時 |

## 7. 開発環境

| # | 決定 | 理由 | 見直し |
|---|---|---|---|
| L41 | package.json はリポジトリのルートに 1 つ（gate-checker 専用のパッケージにしない） | gate-checker と sync-core の試験・lint を 1 つの設定で回す | gate-checker を actions に移すとき |
| L42 | TypeScript 5.9.3、esbuild 0.28.2、@cucumber/gherkin 42.0.1、Biome 2.6.6、Vitest 3.2.7、@types/node 24 | D13。TypeScript 7 は Go 実装の新系統で、v0.1 は実績のある 5 系を使う | 依存の定期更新時 |
| L43 | Biome は Markdown を対象にしない | Biome 2.6 で Markdown の整形が入り、表の桁揃えで人と AI が書く文書の差分が大きくなる | — |
| L44 | Vitest は D13 どおり 3 系にした。`npm audit` で開発依存の既知の脆弱性（@vitest/mocker、tinypool。修正版は Vitest 4.1.11 / 5 以降）が出る | D13 に従った。試験の実行時だけの依存で、配布物（dist）には含まれない | D13 の見直し（Vitest 4 以降への更新を提案） |
| L45 | CI の actions は SHA で固定する（actions/checkout v7.0.1、actions/setup-node v7.1.0） | D4「actions はタグ / SHA 固定参照」 | 依存の定期更新時 |

## 8. 先行事例からの取り込み

文章・コードのコピーは無い。構造の参考にしたもの:

| 参考 | 取り込んだ構造 |
|---|---|
| AI-DLC（A-1.3、A-5.1、A-5.2） | 制約の一覧（constraint registry）を段階 1 に置くこと、規模・リスクによる段階の選択、段階ごとの承認ゲート |
| BMad Method（B-1.2、B-2.1） | 弱点を突く問答による企画の検証、計画パスの選択 |
| Spec Kit（S-1.2、S-2.2） | ストーリーと受け入れ条件を先に決めること、要件の完全性のチェック |
| Fandhe-AI（F-7.2、F-7.13） | 判定記録と完了条件の機械チェック、フェーズ文書の品質レビュー（D6 によりコピーせず、構造だけを参考にした） |

## 9. 未決定のこと

- LICENSE: core に LICENSE を置いていない（package.json の license も空）。配布物を雛形と製品リポジトリにコピーするため、ライセンスの決定が要る
- `.ccsdd/runs/` の扱い: run-stage.sh の結果 JSON と判定の PR 本文を置く。コミットするか `.gitignore` に入れるかは template-spec で決める（入れないと gate-checker の `dirty` が真になる）
- 入力記録による他リポジトリの ID の解決: gate-checker は、他リポジトリで定義された ID を「未解決」と判定する。段階 3 以降の完了条件では、入力記録の「参照する ID」を定義済みとみなす仕組みが要る
