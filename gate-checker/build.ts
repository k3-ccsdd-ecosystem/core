// gate-checker を依存込みの 1 ファイル（dist/gate-check.mjs）にまとめる。
// 製品リポジトリへはこのファイルと rules/ をコピーするので、npm install なしで動く。
// 実行: npm run build（node が型を外して直接実行する）

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

await build({
  entryPoints: [join(here, "src", "cli.ts")],
  outfile: join(here, "dist", "gate-check.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  legalComments: "none",
  charset: "utf8",
  logLevel: "warning",
});

// 同梱した依存のライセンス表示
const bundled = ["@cucumber/gherkin", "@cucumber/messages"];
const notices = bundled.map((name) => {
  const dir = join(root, "node_modules", ...name.split("/"));
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
    version: string;
    license: string;
  };
  const license = readFileSync(join(dir, "LICENSE"), "utf8").replace(/\r\n?/g, "\n").trim();
  return `## ${name}@${pkg.version}（${pkg.license}）\n\n${license}\n`;
});
writeFileSync(
  join(here, "dist", "THIRD_PARTY_LICENSES.md"),
  `# 同梱した依存のライセンス\n\ngate-check.mjs に同梱した依存パッケージのライセンス。\n\n${notices.join("\n")}`,
  "utf8",
);
