import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runGate } from "../src/run.ts";
import { cleanup, copyFixture, edit, errorCodes, gate, RULES_DIR, read, write } from "./helpers.ts";

afterEach(cleanup);

describe("合格例（todo-pass）", () => {
  it.each([1, 2])("段階 %i の完了条件を満たす", (stage) => {
    const root = copyFixture("todo-pass");
    const { result } = gate(root, stage);
    expect(errorCodes(result)).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it("結果 JSON を gates/gate-<n>.result.json に書く", () => {
    const root = copyFixture("todo-pass");
    const { written } = runGate({ stage: 2, root, rulesDir: RULES_DIR });
    expect(written).toBe("gates/gate-2.result.json");
    const json = JSON.parse(read(root, "gates/gate-2.result.json"));
    expect(json).toMatchObject({
      schemaVersion: 1,
      stage: 2,
      gate: "GATE-2",
      mode: "artifacts",
      passed: true,
      commit: null,
      rules: "stage-2.json",
    });
    expect(json.ids).toMatchObject({
      CST: ["CST-1", "CST-2", "CST-3", "CST-4", "CST-5", "CST-6", "CST-7"],
      PER: ["PER-1"],
      US: ["US-1", "US-2", "US-3"],
      "US-AC": ["US-1-AC1", "US-1-AC2", "US-2-AC1", "US-2-AC2", "US-3-AC1"],
      SCR: ["SCR-1", "SCR-2"],
    });
  });

  it("既存システムの更改では現状調査報告が必須、新規では対象外", () => {
    const root = copyFixture("todo-pass");
    const asIs = gate(root, 1).result.checks.find((c) => c.id === "artifact:as-is");
    expect(asIs?.status).toBe("skip");
    edit(root, "docs/01-planning/plan-path.md", "開発パターン: 新規", "開発パターン: 既存");
    const { result } = gate(root, 1);
    expect(result.checks.find((c) => c.id === "artifact:as-is")?.status).toBe("fail");
    expect(errorCodes(result)).toEqual(["file.missing"]);
  });
});

describe("段階 1 の不合格例", () => {
  const cases: [string, (root: string) => void, string[]][] = [
    [
      "成果物が無い",
      // 制約一覧の参照元も research.md を指している
      (r) => rmSync(join(r, "docs/01-planning/research.md")),
      ["file.missing", "path.unresolved"],
    ],
    [
      "成果物が空",
      (r) => write(r, "docs/01-planning/research.md", ""),
      Array(6).fill("section.missing"),
    ],
    [
      "必須節が無い",
      (r) => edit(r, "docs/01-planning/concept.md", "## スコープ外", "## 範囲外"),
      ["section.missing"],
    ],
    [
      "必須節が空（コメントだけ）",
      (r) =>
        edit(r, "docs/01-planning/concept.md", "共有リスト、期限、通知。", "<!-- 後で書く -->"),
      ["section.empty"],
    ],
    [
      "記入欄が残っている",
      (r) => edit(r, "docs/01-planning/brainstorm.md", "案 1 を", "{{持ち込む案}}を"),
      ["placeholder.remaining"],
    ],
    [
      "制約一覧の観点が欠けている",
      (r) => edit(r, "docs/01-planning/constraints.md", /\| CST-6 \| 法規 .*\n/, ""),
      ["table.rows.min", "table.coverage.missing"],
    ],
    [
      "表の必須列が空欄",
      (r) => edit(r, "docs/01-planning/constraints.md", "| 月額 3,000 円以内 |", "|  |"),
      ["table.cell.empty"],
    ],
    [
      "計画パスの適用に許されない値",
      (r) =>
        edit(
          r,
          "docs/01-planning/plan-path.md",
          "| 9 | 可観測性導入 | 縮小 |",
          "| 9 | 可観測性導入 | 少し |",
        ),
      ["table.cell.invalid"],
    ],
    [
      "開発パターンが不正",
      (r) => edit(r, "docs/01-planning/plan-path.md", "開発パターン: 新規", "開発パターン: 未定"),
      ["field.invalid"],
    ],
    [
      "参照元のパスが存在しない",
      (r) => edit(r, "docs/01-planning/concept.md", "brainstorm.md", "idea.md"),
      ["path.unresolved"],
    ],
    [
      "ID の形式が不正",
      (r) => edit(r, "docs/01-planning/constraints.md", "| CST-7 |", "| CST-07 |"),
      ["id.format"],
    ],
    [
      "ID の重複",
      (r) => edit(r, "docs/01-planning/constraints.md", "| CST-7 |", "| CST-6 |"),
      ["id.duplicate"],
    ],
    [
      "未定義の ID を参照",
      (r) => edit(r, "docs/01-planning/concept.md", "共有リスト、期限、通知。", "CST-9 を参照。"),
      ["id.unresolved"],
    ],
  ];

  it.each(cases)("%s", (_name, mutate, expected) => {
    const root = copyFixture("todo-pass");
    mutate(root);
    const { result } = gate(root, 1);
    expect(result.passed).toBe(false);
    expect(errorCodes(result)).toEqual(expected);
  });
});

describe("段階 2 の不合格例", () => {
  const story = "docs/02-ux/stories/US-3.feature";
  const cases: [string, (root: string) => void, string[]][] = [
    [
      "Gherkin の構文エラー",
      (r) => edit(r, story, "  @US-3-AC1\n  Scenario:", "  @US-3-AC1\n  Scenari:"),
      // 構文エラーのファイルは ID を定義できないため、他の文書からの参照（screens.md と mvp.md）が未解決になる
      [...Array(5).fill("gherkin.syntax"), "id.unresolved", "id.unresolved"],
    ],
    ["Then が無い", (r) => edit(r, story, /\n\s+Then 一覧から.*/, ""), ["gherkin.scenario.steps"]],
    [
      "Scenario に受け入れ条件の ID が無い",
      (r) => edit(r, story, "  @US-3-AC1\n", ""),
      ["gherkin.scenario.tag"],
    ],
    [
      "受け入れ条件の ID がストーリーと対応しない",
      (r) => edit(r, story, "@US-3-AC1", "@US-2-AC3"),
      ["gherkin.scenario.tag"],
    ],
    [
      "ファイル名と ID が一致しない",
      (r) => edit(r, story, "@US-3 @PER-1", "@US-4 @PER-1"),
      // US-3 が消え（screens.md と mvp.md の参照が未解決）、US-4 は画面と MVP に無い
      [
        "gherkin.filename",
        "gherkin.scenario.tag",
        "id.unresolved",
        "id.unresolved",
        "id.coverage",
        "id.coverage",
      ],
    ],
    [
      "受け入れ条件の ID の重複",
      (r) => edit(r, "docs/02-ux/stories/US-2.feature", "@US-2-AC2", "@US-2-AC1"),
      ["id.duplicate"],
    ],
    [
      "ストーリーがペルソナを参照しない",
      (r) => edit(r, story, "@US-3 @PER-1", "@US-3"),
      ["id.context"],
    ],
    [
      "画面の無いストーリー",
      (r) => edit(r, "docs/02-ux/screens.md", "| US-2, US-3 |", "| US-2 |"),
      ["id.coverage"],
    ],
    [
      "MVP で分類していないストーリー",
      (r) => edit(r, "docs/02-ux/mvp.md", /\| US-3 \| Should .*\n/, ""),
      ["id.coverage"],
    ],
    [
      "ストーリーを参照しない画面",
      // SCR-1 がストーリーを参照せず、US-1 は画面一覧に無くなる
      (r) => edit(r, "docs/02-ux/screens.md", "| 本人確認 | US-1 |", "| 本人確認 | なし |"),
      ["id.coverage", "id.context"],
    ],
    [
      "MVP の値が不正",
      (r) => edit(r, "docs/02-ux/mvp.md", "| US-3 | Should | 含む |", "| US-3 | 中 | 含む |"),
      ["table.cell.invalid"],
    ],
    [
      "未定義の画面を参照",
      (r) =>
        edit(
          r,
          "docs/02-ux/screens.md",
          "| SCR-1 | SCR-2 | ログイン成功 |",
          "| SCR-1 | SCR-3 | ログイン成功 |",
        ),
      ["id.unresolved"],
    ],
    [
      "ストーリーが 1 件も無い",
      (r) => {
        for (const n of [1, 2, 3]) write(r, `docs/02-ux/stories/US-${n}.feature`, "");
      },
      // screens.md の 5 か所と mvp.md の 3 か所の US 参照が未解決になる
      [...Array(3).fill("gherkin.feature.missing"), ...Array(8).fill("id.unresolved")],
    ],
  ];

  it.each(cases)("%s", (_name, mutate, expected) => {
    const root = copyFixture("todo-pass");
    mutate(root);
    const { result } = gate(root, 2);
    expect(result.passed).toBe(false);
    expect(errorCodes(result)).toEqual(expected);
  });

  it("使われていないペルソナは警告に留める", () => {
    const root = copyFixture("todo-pass");
    edit(
      root,
      "docs/02-ux/personas.md",
      "## ジャーニー\n",
      "### PER-2: 鈴木さん\n\n- 対象ユーザー: 個人の利用者\n\n## ジャーニー\n\n### ジャーニー: PER-2\n\n| 段階 | 行動 | 考え・感情 | 接点 | 課題・機会 |\n|---|---|---|---|---|\n| 利用開始 | 見る | なし | 一覧 | なし |\n",
    );
    const { result } = gate(root, 2);
    expect(result.passed).toBe(true);
    expect(result.summary.warnings).toBe(1);
  });
});

describe("不合格例（todo-fail）", () => {
  it("段階 1・2 とも不合格で、主な指摘を返す", () => {
    const root = copyFixture("todo-fail");
    const s1 = errorCodes(gate(root, 1).result);
    const s2 = errorCodes(gate(root, 2).result);
    for (const code of [
      "file.missing",
      "placeholder.remaining",
      "table.coverage.missing",
      "id.format",
    ]) {
      expect(s1).toContain(code);
    }
    for (const code of [
      "gherkin.syntax",
      "gherkin.scenario.steps",
      "id.duplicate",
      "id.coverage",
    ]) {
      expect(s2).toContain(code);
    }
  });
});

describe("判定記録（--record）", () => {
  const record = (stage: number) =>
    [
      `# GATE-${stage}: 判定`,
      "",
      "## 対象",
      "",
      "| 成果物 | パス | コミット |",
      "|---|---|---|",
      "| 企画書 | `docs/01-planning/concept.md` | 0123456789abcdef0123456789abcdef01234567 |",
      "",
      "## 機械チェック結果",
      "",
      "- 結果: 合格",
      "",
      "## 人の判定",
      "",
      "- 判定: Go",
      "- 判定者: kokko333",
      "- 日付: 2026-11-09",
      "- 条件: なし",
      "- 理由: 完了条件を満たす",
      "",
      "## 引き渡し物",
      "",
      "| 引き渡し物 | パス | 受け取る段階 |",
      "|---|---|---|",
      "| 企画書 | `docs/01-planning/concept.md` | 2-1 |",
      "",
    ].join("\n");

  it("記入済みの判定記録は合格", () => {
    const root = copyFixture("todo-pass");
    write(root, "gates/gate-1.md", record(1));
    const { result } = gate(root, 1, true);
    expect(errorCodes(result)).toEqual([]);
    expect(result.mode).toBe("record");
  });

  it("判定記録が無い・記入欄が残る・題の ID が違う・判定の値が不正", () => {
    const root = copyFixture("todo-pass");
    expect(errorCodes(gate(root, 1, true).result)).toEqual(["file.missing"]);
    write(root, "gates/gate-1.md", record(2).replace("- 判定: Go", "- 判定: {{Go / No-Go}}"));
    expect(errorCodes(gate(root, 1, true).result)).toEqual([
      "placeholder.remaining",
      "field.invalid",
      "record.gate.id",
    ]);
  });

  it("成果物が不合格なのに Go は矛盾、No-Go は記録できる", () => {
    const root = copyFixture("todo-pass");
    edit(root, "docs/01-planning/concept.md", "## スコープ外", "## 範囲外");
    write(root, "gates/gate-1.md", record(1));
    expect(errorCodes(gate(root, 1, true).result)).toEqual([
      "section.missing",
      "record.decision.inconsistent",
    ]);
    write(root, "gates/gate-1.md", record(1).replace("- 判定: Go", "- 判定: No-Go"));
    expect(errorCodes(gate(root, 1, true).result)).toEqual(["section.missing"]);
  });
});

describe("dist の同梱物", () => {
  it("dist/gate-check.mjs と依存のライセンス表示がある", () => {
    const dist = join(RULES_DIR, "..", "dist");
    expect(existsSync(join(dist, "gate-check.mjs"))).toBe(true);
    expect(readFileSync(join(dist, "THIRD_PARTY_LICENSES.md"), "utf8")).toContain(
      "@cucumber/gherkin",
    );
  });
});
