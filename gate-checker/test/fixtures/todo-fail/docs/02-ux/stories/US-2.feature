@US-2 @PER-1
Feature: ToDo を追加する
  佐藤さん として、やることを 1 行で追加したい。なぜなら 忘れる前に書き留めたいから。

  関係する制約: なし

  Background:
    Given ログインして一覧画面を開いている

  @US-2-AC1
  Scenario: 1 行入力して Enter で追加できる
    When 入力欄に「牛乳を買う」と入力して Enter を押す
    Then 一覧の先頭に「牛乳を買う」が追加される
    And 入力欄が空になる

  @US-2-AC2
  Scenari: 空の入力は追加されない
    When 入力欄が空のまま Enter を押す
    Then 一覧は変わらない
