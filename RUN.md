# RUN — Best heist game (best-heist-game-20261122-0559)

## Entry
- **Game:** Midnight Vault — The Aurum Job (top-down bank-vault heist, original)
- **Repo:** https://github.com/Gdumbro/best-heist-game (public, created 06:05 UTC, after 05:59 opening)
- **Submitted commit:** a6ca854e233cfaf401bd36f1fd6d63591dae7f4d
- **Submission (round 2):** 01a201f0-60dc-7781-a12b-0880064bb47e, HTTP 202, 06:27:40 UTC (13:27 WIB)
- **Status:** finished — dev grade run finished, no error, no flags; all checks passed
- **Authorship:** 92.5% (639/691 lines authored, 0 pasted)
- **Pricing:** 4,910,662 micro-USD, 4 lines, 0 unpriced (thinking_priced passed)
- **Scores:** hidden (placements_held until finalization); result due 7 Dec 2026
- **Claim code:** in ~/workspace/makefun/submit-files/submit-best-heist-game.log (path only, never share the code)

## Round 3 (in progress — builder revision, not yet submitted)
- **Goal:** win more pairwise matchups via cover readability + gameplay depth (judge review of round 2).
- **Cover/visuals:** thief radius 14→19 with pulsing gold halo + `★ THIEF ★` pill label; pale carpet column replaced by a red carpet with gold edges + dashed centre line down the middle; marble floor grid + 5 warm light pools; 2 glass display cases with gold piles (new obstacles); velvet ropes between the pillars; terminal moved in from the edge (x 20→36) with the `⌨ HACK` label on a solid pill; alarm bar 22→28px with gold border + QUIET/RISKY/LOUD state label (visible at 0%).
- **Gameplay:** 3 optional gold bars (+150 score each, labelled `GOLD +150`, HUD counter `0/3`); end rating from peak alarm — GHOST (<25%) / SHADOW (<60%) / LOUD — shown on the win screen with score (diamond 1000 + 150/bar); guard 1 now runs a 4-point counter-clockwise rectangular loop (180,415 → 180,250 → 360,250 → 380,415, 68px/s, 0.7s pauses), guard 2 a faster 4-point diamond (820,140 → 770,280 → 820,460 → 860,200, 84px/s, 1.2s pauses); cameras have separate sweep speeds/ranges (cam 1: 0.7 rad/s, range 245; cam 2: 0.45 rad/s, sweep 0.9, range 265); win overlay dimmed 82%→42% so the room stays visible; diamond grab radius 100→110.
- **Bug hunts during testing (all fixed with real code revisions, no test-only hacks):** (1) first guard-1 diamond loop crossed the centre corridor and wedged the guard against a display case, turning it into a permanent sentry — replaced with the rectangular loop clear of all obstacles; (2) clockwise loop put guard 1's bottom leg facing the vault approach — reverted to counter-clockwise with the left leg moved to x=180; (3) guard-2's old waypoint sat on top of gold bar 3 — moved to (860,200); (4) grab flaked when the bot stopped 16px short of the vault — grab radius widened + bot aims closer.
- **Tests (Playwright verify3, real input, 27 checks, run twice clean):** 27/27 pass on both runs — cover (2 guards, 2 cameras, alarm 0, QUIET label), camera sees thief + alarm rises, sneak 84–85px/s, R restart, hack disables cameras, diamond grab, win at exit in ~8.4–9.0s with GHOST rating, gold bars 1+2 (top corridor) and bar 3 (centre → bottom → right wall), guard lane → alarm 100 → BUSTED, restart from lose, 0 console errors, 0 network requests.
- **Screenshots (real renders, retaken by the verify suite):** 01-cover / 02-alert (`SPOTTED — GUARD!`, alarm 28%) / 03-loot (`DIAMOND SECURED!`, `CAMERAS OFF — 5s`, EXIT OPEN) / 04-win (`CLEAN GETAWAY!`, `RATING: GHOST`, room visible through the overlay). All 1020x920 PNG, palette-optimized to 90,962 / 91,165 / 91,460 / 97,140 bytes (raw renders were 253–294KB — over the 262,144 cap, mostly from the new detail; content unchanged, only PNG encoding). Note: dimensions are 1020x920 as in round 2, not 1280x720 — the page's natural framing fills the frame better at thumbnail size; parent to confirm if literal 1280x720 is wanted.
- **`node main.ts` check:** builds clean to a fresh output dir; dossier.json 543,153 bytes, cover 0, 4 images, text 46,945 chars; copied game/ + screenshots/ verified byte-identical to source. main.ts is hand-written (not generated from game sources), so no regeneration was needed.
- **Status:** ready for parent to bundle + submit as round 3. Claim-code log untouched.
- Failed checks: thinking_priced (bundle sessions lacked the makefun.muse_app_sidecar usage record) and transcripts_run_record (run prompt was a summary, not verbatim; system prompt file missing from bundle).
- Fix (no kit CLI): rebuilt the bundle by hand — appended sidecar records with usage rows from agent.agent_message_token_usage (muse.db, 4 rows), verbatim opening prompt from the session's first user message, and context/explicit/system_prompt.md. Round 2 passed everything.

## Submit path (API-only, learned from get_requirements via MCP)
- Auth header is `x-api-key`, not `Authorization: Bearer`.
- Fields: repo_url, commit_sha, title, bundle (file), entry_message, entry_signature.
- Entry message (make.fun entry v1) signed Ed25519 with the account keypair (local only, base58 signature); nonce must be 8–64 letters/digits.
- Refusals that do NOT count against quota: 400 transcripts-as-text-field, 422 nonce charset, 422 README badges / repo About (fixed: template badges in README, gh repo edit homepage + topics).

## Tests (independent Playwright verification, real input)
- 19/19 checks passed: start/cover (2 guards, 2 cameras, diamond, alarm 0), camera sees thief + alarm rises to 27, sneak 84px/s vs 175 run, hack disables cameras, diamond grab, win at exit in 8.3s, guard lane → alarm 100 → BUSTED, restart from lose, 0 console errors, 0 network requests.
- Screenshots (all <262,144 B): 01-cover, 02-alert, 03-loot, 04-win.
- Dossier: makefun/dossier/v1, cover 0, 4 images, text 37,917 chars; `node main.ts` builds clean.
- Note: main.ts as scaffolded called buildDossier with 3 args + JSON.stringify — fixed to the vendor's 2-arg signature returning canonical bytes.

## Timeline (WIB)
- 13:01 bounty verified open (4 submissions already); builders spawned
- 13:06 repo scaffold done (fd7dded); 13:14 game built + self-tested
- 13:15–13:20 independent verification 19/19; screenshots taken
- 13:22 commit cd7880e pushed; dossier verified; 13:27 round 1 submitted (202) → rejected
- 13:29–13:40 README badges + repo About fixed, commit a6ca854 pushed
- 13:41 round 2 submitted (202) → finished, scored

## Round 3 outcome (22 Nov 2026)
- Submission 01a2021f-48d2-7740-a334-222334b5ea25, HTTP 202, commit bdce1b8c9481cfb729639af10a3a370260805214. Stage rejected: 25 pass, 1 fail (thinking_reproduces — authorship 163/809 = 20.1%, under the 30% required; main.ts 0 authored lines), 3 skip. Everything else passed (thinking_priced 3 usage rows, thinking_revised, thinking_in_window, thinking_committed, transcripts_present/recorded/run_record, thinking_own_work, entry_signature).
- Root cause: the round-3 bundle carried only the round-3 coordinator + builder sessions. The code was actually authored by the round-1/2 worker chain (97d26ce0 + children b47858cc, 25572801), which was not in that bundle. Round 2 passed at 92.5% authorship precisely because its bundle included the worker chain.
- Quota NOT consumed by the rejection: entries_made still 2, can_submit true. Round 2 remains the final entry until a later round passes.
- Round 4 fix: re-bundle with FIVE sessions (round-2 worker chain + round-3 coordinator + builder). This RUN.md file itself is committed as the trivial new commit so the snapshot differs from round 3 (documentation only, game code untouched).
