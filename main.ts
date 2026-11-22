// Midnight Vault — Aurum National Bank Heist
// make.fun entry point (bounty: best-heist-game-20261122-0559).
//
// Contract (Node 22+, stdlib only, no network):
//   1. Read MAKEFUN_OUTPUT_DIR (default "/output").
//   2. Verify game/index.html exists in the repo root.
//   3. Copy the game/ and screenshots/ trees into the output dir.
//   4. Build dossier.json via the kit harness (vendor/makefun-game.ts)
//      and write it into the output dir.
//   5. Print a short confirmation.
//
// Written in erasable TypeScript only (no enums / namespaces /
// parameter properties), so `node main.ts` runs with no build step.

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildDossier } from "./vendor/makefun-game.ts";

const repoRoot: string = resolve(import.meta.dirname);
const outputDir: string = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

const gameDir: string = join(repoRoot, "game");
const screenshotsDir: string = join(repoRoot, "screenshots");
const indexHtml: string = join(gameDir, "index.html");

if (!existsSync(indexHtml)) {
  console.error(`Missing game entry point: ${indexHtml}`);
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

// Copy the playable game and its screenshots into the output dir.
cpSync(gameDir, join(outputDir, "game"), { recursive: true });
if (existsSync(screenshotsDir)) {
  cpSync(screenshotsDir, join(outputDir, "screenshots"), { recursive: true });
} else {
  console.error(`Warning: no screenshots/ directory found at ${screenshotsDir}`);
}

const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});

writeFileSync(join(outputDir, "dossier.json"), dossier);

console.log(`Midnight Vault packaged OK -> ${outputDir} (dossier.json written)`);
