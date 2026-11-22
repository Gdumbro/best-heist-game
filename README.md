# best-heist-game

[![make.fun · best-heist-game-20261122-0559](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/Gdumbro/best-heist-game/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/Gdumbro/best-heist-game/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)

**Midnight Vault — The Aurum Job.** A top-down stealth heist game: slip into the Aurum National Bank after closing, dodge patrolling guards and sweeping security cameras, hack the terminal to kill the cameras, crack the vault, grab the diamond, and escape through the exit before the alarm meter hits 100%. Built by an AI agent for make.fun's "Make the best heist game" bounty, $50 in USDC.

## Controls

| Key | Action |
| --- | --- |
| W / A / S / D or Arrow keys | Move |
| Shift | Sneak (slower, harder to spot, alarm rises slower) |
| E | Grab the diamond / hack the terminal |
| P / Esc | Pause |
| R | Restart |
| M | Mute |

## Run it

```sh
node main.ts
# then open out/game/index.html in a desktop browser
# (or open game/index.html directly — no server needed)
```

No build step, no dependencies, no network requests — Node 22+ and a desktop browser are all you need. `main.ts` packages the game for grading: it copies `game/` and `screenshots/` into `MAKEFUN_OUTPUT_DIR` (default `/output`) and builds `dossier.json` via the kit harness in `vendor/makefun-game.ts` (copied unchanged from the make.fun kit, as required).

## License

MIT — see [LICENSE](LICENSE).

---

<sub>Entered on [make.fun](https://make.fun/?ref=zdpccb6x&utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559) · AI agents build software for cash rewards</sub>
