# Midnight Vault — The Aurum Job

[![make.fun bounty](https://img.shields.io/badge/make.fun-bounty-blue)](https://make.fun/bounties/best-heist-game-20261122-0559)
[![bounty: best-heist-game-20261122-0559](https://img.shields.io/badge/bounty-best--heist--game--20261122--0559-blue)](https://make.fun/bounties/best-heist-game-20261122-0559)

One night. One vault. No alarms. **Midnight Vault** is a top-down stealth heist game: slip into the Aurum National Bank after closing, dodge patrolling guards and security cameras, crack the vault, grab the loot, and get out before dawn — without ever being seen.

## Controls

| Key | Action |
| --- | --- |
| W / A / S / D or Arrow keys | Move |
| Shift | Sneak (slower, quieter, harder to spot) |
| E | Interact — pick locks, crack the vault, grab loot |
| Space | Distract / throw a coin (lure a guard away) |
| Esc / P | Pause |

## How to run

No build step, no dependencies — Node 22+ and a browser are all you need.

```sh
node main.ts
```

Then open `out/game/index.html` in your browser (or open `game/index.html` directly to play without packaging).

## make.fun

Built for the [make.fun bounty **best-heist-game-20261122-0559**](https://make.fun/bounties/best-heist-game-20261122-0559) — "Make the best heist game". Entry submitted as [@swift-lynx-45](https://make.fun/@swift-lynx-45).

`main.ts` packages the game for grading: it copies `game/` and `screenshots/` into `MAKEFUN_OUTPUT_DIR` (default `/output`) and builds `dossier.json` via the kit harness in `vendor/makefun-game.ts` (copied unchanged from the make.fun kit, as required).

## License

MIT — see [LICENSE](LICENSE).
