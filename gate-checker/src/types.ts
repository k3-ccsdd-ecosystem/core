// 完了条件（rules/*.json）と判定結果（gates/gate-<n>.result.json）の型。

export type Severity = "error" | "warning";

/** ID の種類。kinds のキー（例: "US", "US-AC"）で参照する。 */
export interface IdKind {
  title: string;
  /** ID 全体に一致する正規表現 */
  pattern: string;
}

/** rules/ids.json */
export interface IdConfig {
  /** 検出対象の接頭辞。本文中の「<接頭辞>-<数字>…」を ID 候補として拾う */
  prefixes: string[];
  kinds: Record<string, IdKind>;
}

/** 別ファイルの「- キー: 値」が equals のときだけ必須にする */
export interface WhenField {
  file: string;
  key: string;
  equals: string;
}

export interface TableRule {
  /** 表を探す節（見出しの文字列） */
  section: string;
  /** 必須の列（見出し行のセル） */
  columns: string[];
  /** 空欄を許さない列 */
  nonEmpty?: string[];
  minRows?: number;
  /** column の値として values のすべてが現れること */
  coverage?: { column: string; values: string[] };
  /** 列ごとに許す値 */
  allowedValues?: Record<string, string[]>;
}

export interface FieldRule {
  /** 「- キー: 値」のキー */
  key: string;
  oneOf?: string[];
  /** 値に一致する正規表現 */
  pattern?: string;
}

export interface ArtifactRule {
  id: string;
  title: string;
  /** 対応する小項目（例: "1-3"） */
  subitem: string;
  /** 対象リポジトリのルートからの相対パス */
  path: string;
  /** core の templates/ からの相対パス */
  template?: string;
  /** 既定は true */
  required?: boolean;
  requiredWhen?: WhenField;
  sections?: string[];
  tables?: TableRule[];
  fields?: FieldRule[];
  /** この節に書いたパスが存在すること（参照元の節） */
  sourceSection?: string;
}

/** ID の定義場所。files に一致するファイルの定義位置にある ID を定義とみなす */
export interface DefinitionRule {
  kind: string;
  files: string[];
}

export interface CoverageRule {
  id: string;
  title: string;
  /** 対象の ID の種類 */
  each: string;
  /** 定義された各 ID が、これらのファイルのどこかで参照されていること */
  referencedIn?: string[];
  /** referencedIn の参照を、この節（Markdown の見出し）の中に限る */
  inSection?: string;
  /** 定義された各 ID の定義範囲（表の行、見出しの節、Feature）に、これらの種類の ID があること */
  contextReferences?: string[];
  severity?: Severity;
}

export interface GherkinRule {
  id: string;
  title: string;
  subitem: string;
  /** glob */
  files: string;
  template?: string;
  minFiles?: number;
  /** Feature のタグで定義する ID の種類 */
  featureIdKind: string;
  /** Scenario のタグで定義する ID の種類 */
  scenarioIdKind: string;
  /** ファイル名（拡張子を除く）が Feature の ID と一致すること */
  fileNameMatchesId?: boolean;
  minScenarios?: number;
  /** 各 Scenario に必要なステップの種類（Context / Action / Outcome） */
  requireStepTypes?: string[];
}

export interface RecordRule extends ArtifactRule {
  /** 判定の値を持つフィールドのキー */
  decisionKey: string;
  /** 機械チェックの合格を前提とする判定の値 */
  decisionsRequiringPass: string[];
}

/** rules/stage-<n>.json */
export interface StageRules {
  stage: number;
  gate: string;
  title: string;
  /** ID を検出するファイルの glob */
  scan: string[];
  artifacts: ArtifactRule[];
  definitions: DefinitionRule[];
  coverage?: CoverageRule[];
  gherkin?: GherkinRule[];
  record: RecordRule;
}

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  file?: string;
  line?: number;
}

export type CheckStatus = "pass" | "fail" | "skip";

export interface CheckResult {
  id: string;
  title: string;
  target?: string;
  status: CheckStatus;
  reason?: string;
  findings: Finding[];
}

export interface GateResult {
  schemaVersion: 1;
  tool: { name: string; version: string };
  stage: number;
  gate: string;
  title: string;
  mode: "artifacts" | "record";
  checkedAt: string;
  commit: string | null;
  dirty: boolean | null;
  rules: string;
  passed: boolean;
  summary: { checks: number; failed: number; skipped: number; errors: number; warnings: number };
  checks: CheckResult[];
  ids: Record<string, string[]>;
}

/** 完了条件の読み込み・引数の誤り。終了コード 2 で返す */
export class ConfigError extends Error {
  override name = "ConfigError";
}
