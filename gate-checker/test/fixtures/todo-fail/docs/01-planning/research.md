# 調査メモ: シンプル ToDo

## 参照元

- `docs/01-planning/brainstorm.md`

## 調査の問い

同種のアプリは入力の速さをどう実現しているか。

## 類似事例

| 事例 | 概要 | 参考にする点 | 出典 |
|---|---|---|---|
| TodoMVC | 各種フレームワークで同じ ToDo を実装した比較集 | 入力欄を一覧の先頭に置く画面構成 | [1] |

## 技術

| 技術 | 用途 | 採否の見込み | 出典 |
|---|---|---|---|
| OpenAPI | FE と BE の契約 | 採用（段階 4 で使う） | [2] |

## 示唆

入力欄を一覧の先頭に置き、Enter で追加する構成にする。

## 出典

1. TodoMVC https://todomvc.com/（参照日 2026-11-09）
2. OpenAPI Specification https://spec.openapis.org/oas/latest.html（参照日 2026-11-09）
