/* Midnight Vault — The Aurum Job · Aurum National Bank
   Original top-down 2D heist game. Plain JS, no libraries, no network.
   Canvas 960x600. WASD/arrows move, Shift sneak, E grab/hack, R restart, P/Esc pause, M mute.
   Round 6: three zones in one frame (Gallery / Vault / Security corridor),
   3 guards, 3 cameras, and a timed laser grid across the vault approach.
   Round 7: 4 guards, 4 cameras, a sweeping laser turret on the vault,
   alarm escalation (ALERT / LOCKDOWN + response guard), and 2 stealable
   gallery paintings. Same hall, same gold/red-carpet identity.
   Round 8: cooler win route — cam 1 narrowed off the left-edge climb,
   guard 1 loop pulled off the transit lines, cam 3 moved east off the
   south line, guard 2/3 loops lifted off the exit leg, shorter/slower
   chases, faster alarm decay. Thresholds and loot unchanged.
*/
(function () {
  'use strict';

  var W = 960, H = 600, WALL = 16;
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');

  var $ = function (id) { return document.getElementById(id); };
  var alarmFill = $('alarm-fill'), alarmNum = $('alarm-num'), lootEl = $('loot'),
      camEl = $('cam-status'), laserEl = $('laser-status'), timerEl = $('timer'),
      objectiveEl = $('objective'), toastEl = $('toast'), btnHack = $('btn-hack'),
      btnGrab = $('btn-grab'), goldEl = $('gold'), alarmStateEl = $('alarm-state'),
      winRatingEl = $('win-rating'), artEl = $('art');

  /* ---------------- level layout (fixed, deterministic) ---------------- */
  // Three zones in one hall, split by gold floor lines at x=330 and x=630:
  //   Gallery (left) — display cases + gold bars + paintings; Vault (centre) — diamond + lasers;
  //   Security corridor (right) — the guarded route to the green EXIT.
  var ZONE_L = 330, ZONE_R = 630;
  var VAULT = { x: 400, y: 200, w: 160, h: 120 };
  var DIAMOND = { x: 480, y: 260 };
  var EXIT = { x: 872, y: 512, w: 56, h: 56 };
  var TERMINAL = { x: 36, y: 262, w: 22, h: 48, cx: 60, cy: 286 };
  var GOLD_SPOTS = [{ x: 300, y: 88 }, { x: 660, y: 88 }, { x: 890, y: 300 }];
  // Two gallery paintings, stealable by walking over them (+100 score each).
  // On the left wall strip, clear of the desks, the terminal and the guard loops.
  var ART_SPOTS = [{ x: 70, y: 140 }, { x: 70, y: 440 }];
  // Timed laser grid across the red-carpet vault approach (x 430..530).
  // Each beam cycles: on for LASER_ON, off for the rest of the period.
  // At LOCKDOWN the grid fires faster (period 2.6s -> 1.9s).
  // Round-8 retune: LASER_ON 1.5s->1.2s — the OFF gaps (1.4s) are now long
  // enough to cross both beams in one gap; a live beam is still +30 alarm/s
  // and the warming flicker still warns 0.4s ahead, so timing still matters.
  // Retest-7 retune: LASER_ON 1.2s->0.9s (duty 46%->35%, all-clear window
  // 0.8s->1.1s). A blind 4-crossing run still meets a live beam about a
  // third of the time, but the worst case (all beams live, +35/run) is now
  // rare; a timed crossing is clean and a hack is clean, as intended.
  // Retest-9 retune: LASER_ON 0.9s->0.8s (duty 35%->31%, all-clear window
  // 1.1s->1.2s per beam; the shared all-clear window is ~1.2s). The carpet
  // was the hottest clean-win segment (verify run 0: grab +35, return +32);
  // a slightly longer gap makes a timed crossing cheaper without removing
  // the punishment for a blind one.
  // Retest-4 retune: phases tightened (0/0.9/1.8 -> 0/0.3/0.6) so the three
  // beams fire almost together and leave a real all-clear window (~0.8s per
  // cycle) for a player who watches the warming flicker — a blind crossing
  // still meets a live beam about half the time, but a timed one is clean.
  var LASER_X1 = 430, LASER_X2 = 530, LASER_PERIOD = 2.6, LASER_PERIOD_LOCK = 1.9, LASER_ON = 0.8;
  var LASERS = [
    // Retest-5 retune: top beam y=350 -> y=335. The grab spot (480,360-369)
    // sat INSIDE the y=350 beam's hit zone (|y-350| < 22), so every grab
    // attempt ate +40/s while standing at the vault if the beam was live
    // (+14.6/run just for grabbing). At y=335 the beam still guards the
    // vault's face (a thief hugging the vault gets zapped) but the grab spot
    // is 25px clear of it — the grid taxes the crossing, not the grab itself.
    { y: 335, phase: 0.0 },
    { y: 395, phase: 0.3 },
    { y: 440, phase: 0.6 }
  ];
  // Sweeping laser: a rotating emitter turret on the vault's bottom edge.
  // Its beam sweeps +/-SWEEP across the carpet approach below the vault.
  // Length 150 keeps the beam inside the vault approach (max y = 472): it must
  // not reach the y=510 bottom route or the (480,500) laser-test wait spot.
  var SWEEPER = { x: 480, y: 322, base: Math.PI / 2, sweep: 0.9, speed: 0.45, len: 150 };
  var OBSTACLES = [
    VAULT,
    { x: 160, y: 120, w: 140, h: 46 },   // desk top-left (gap to the pillar is 50px: a 38px thief must fit through)
    { x: 660, y: 120, w: 140, h: 46 },   // desk top-right
    { x: 160, y: 434, w: 140, h: 46 },   // desk bottom-left
    { x: 660, y: 434, w: 140, h: 46 },   // desk bottom-right
    { x: 350, y: 120, w: 36, h: 36 },    // pillar top-left
    { x: 574, y: 120, w: 36, h: 36 },    // pillar top-right
    { x: 350, y: 444, w: 36, h: 36 },    // pillar bottom-left
    { x: 574, y: 444, w: 36, h: 36 },    // pillar bottom-right
    { x: 200, y: 300, w: 120, h: 60, kind: 'case' },  // glass display case (gold pile)
    { x: 640, y: 300, w: 120, h: 60, kind: 'case' }   // glass display case (gold pile)
  ];

  /* ---------------- state ---------------- */
  var state = 'start';           // start | playing | paused | win | lose
  var alarm = 0, loot = false, elapsed = 0, muted = false;
  var gold = 0, goldBars = [];   // optional secondary loot: 3 gold bars, +150 each
  var art = 0, artPieces = [];   // optional secondary loot: 2 paintings, +100 each
  var peakAlarm = 0;             // highest alarm reached this run (drives the end rating)
  var systemsOffUntil = -1;      // hack timer: cameras AND lasers off while time < this
  var seenNow = false, seenBy = '', chaseFlash = 0;
  var toastTimer = 0, tickTimer = 0, time = 0;   // time = deterministic clock (seconds)
  var sweeperAngle = Math.PI / 2, sweeperHits = 0; // rotating beam angle + times it touched the thief
  var player, guards, cameras, response;  // response = LOCKDOWN response guard (dormant until alarm >= 75)

  // Alarm escalation: 0 CALM (<30%), 1 ALERT (>=30%), 2 LOCKDOWN (>=75%).
  // ALERT speeds cameras x1.25 and guards x1.1; LOCKDOWN adds red alert lighting,
  // a faster laser grid, cameras x1.5 / guards x1.2, and the response guard.
  // Thresholds sit above a single brief sighting on purpose: one camera flash
  // must not start a death spiral (round-7 tuning: ALERT was 25% and the faster
  // cameras fed sightings back into the alarm until every top route busted).
  // Round-8 retune: LOCKDOWN was 65% — but a clean win route peaks at 55-70
  // (climb ~35 + carpet ~25), so half of all clean runs tripped LOCKDOWN on
  // the return leg and the response guard (+20-28) camped the exit, turning
  // LOUD wins into busts. At 75% LOCKDOWN is the "you really messed up"
  // state: clean runs stay in ALERT (still tense), sloppy runs blow past 75
  // in ~2s of sustained sighting and still face the response guard.
  function alertLevel() { return alarm >= 75 ? 2 : (alarm >= 30 ? 1 : 0); }

  function resetGame() {
    state = 'playing'; alarm = 0; loot = false; elapsed = 0; time = 0;
    systemsOffUntil = -1; seenNow = false; seenBy = ''; toastTimer = 0;
    gold = 0; art = 0; peakAlarm = 0; sweeperAngle = Math.PI / 2; sweeperHits = 0;
    goldBars = GOLD_SPOTS.map(function (s) { return { x: s.x, y: s.y, taken: false }; });
    artPieces = ART_SPOTS.map(function (s) { return { x: s.x, y: s.y, taken: false }; });
    player = { x: 84, y: 516, r: 19, speed: 175, sneaking: false, face: -Math.PI / 2 };
    guards = [
      // Guard 1: slow rectangular loop down the left hall (Gallery), counter-clockwise
      // so its cone never covers the vault approach; left leg at x=180, clear of the
      // display case and far enough from the left wall that a climbing thief is only briefly seen.
      // Right leg at x=320 (not 340) and top leg at y=225 (not 250): round-8 retune —
      // the old legs ran 10px above the y=260 gallery transit line and 40px west of
      // the x=380 south line, so every corner turn swept the main routes and a chase
      // shadowed the thief down them at ~44 alarm/s. The new legs give the transit
      // lines 35px / 60px clearance: a corner glimpse is brief and position-dependent
      // instead of a standing trap, and the guard still patrols the gallery properly.
      { x: 180, y: 415, r: 14, wp: [{ x: 180, y: 415 }, { x: 180, y: 225 }, { x: 320, y: 225 }, { x: 320, y: 415 }], wi: 1,
        angle: -Math.PI / 2, speed: 68, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0, pauseDur: 0.7 },
      // Guard 2: faster diamond loop on the right side, longer look-around pauses.
      // Its lower waypoint sits up the right wall, clear of the gold bar below it.
      // Round-8 retune: (820,460)->(820,430) — the old waypoint sat 40px above the
      // y=500 exit leg, so the descending leg's down-right cone covered the exit
      // leg's east end and a glimpse chased the thief down the corridor.
      { x: 820, y: 140, r: 14, wp: [{ x: 820, y: 140 }, { x: 770, y: 280 }, { x: 820, y: 430 }, { x: 860, y: 200 }], wi: 1,
        angle: Math.PI / 2, speed: 84, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0, pauseDur: 1.2 },
      // Guard 3: patrols a tight rectangle in the Security corridor.
      // Round-8 retune: loop shifted up to y 280..370 (was 300..400) — the old
      // bottom corners sat 100px above the y=500 exit leg and their turns swept
      // it, so one glimpse chased the thief all the way to the door. Left leg
      // x=790 still clears the display case (ends x=760).
      // Round-8 retest-3 retune: the loop now runs COUNTER-clockwise (was
      // clockwise). Clockwise, its top leg faced east straight at the thief's
      // (890,270) entry and its right leg ran parallel 30px west of the east
      // descent, so the whole east transit sat in-cone (+52-57 alarm/run).
      // Counter-clockwise the top leg faces west (the thief is behind it), the
      // right leg faces north, and only the bottom-left corner turn briefly
      // sweeps the exit leg — the corridor is still patrolled, the approach isn't.
      // Retest-6 retune: pause 0.9s->0.5s. The counter-clockwise loop pauses at
      // its bottom-left corner (790,370) facing SOUTH, and the y=500 bottom
      // route passes straight through that cone for ~163px (~+30 when the
      // timing aligns). A shorter pause caps the trap at ~+20 and keeps the
      // guard moving instead of sitting on the route.
      { x: 790, y: 280, r: 14, wp: [{ x: 790, y: 280 }, { x: 790, y: 370 }, { x: 860, y: 370 }, { x: 860, y: 280 }], wi: 1,
        angle: Math.PI / 2, speed: 76, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0, pauseDur: 0.5 },
      // Guard 4: NEW (round 7) — back-and-forth along the Gallery north-west
      // corner, (70,60) <-> (140,60), slow with look-around pauses. It
      // only ever faces east/west, guarding the north-west corner and the
      // gold bars' approach. The beat sits in the clear corridor between the
      // top wall and the desks, so the guard never walks through furniture.
      // Round-8 retune: pause 1.4s->0.8s — the old pause put its turn (cone
      // sweeping south across the top corridor) at exactly the moment the win
      // route's climb reached (130,95) every run (+22 alarm). Shorter pauses
      // shift the turn off the usual climb and make the guard more active.
      { x: 70, y: 60, r: 14, wp: [{ x: 70, y: 60 }, { x: 140, y: 60 }], wi: 1,
        angle: 0, speed: 60, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0, pauseDur: 0.8 }
    ];
    // Response guard: dormant until LOCKDOWN (alarm >= 75), then it deploys at
    // the exit corridor and patrols there until the alarm falls below 45%.
    response = { x: 880, y: 470, r: 14, wp: [{ x: 820, y: 440 }, { x: 900, y: 440 }, { x: 900, y: 500 }, { x: 820, y: 500 }], wi: 1,
      angle: 0, speed: 96, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0, pauseDur: 0.5, dormant: true };
    cameras = [
      // Camera 1: top-left wall mount. Round-8 retune — base 0.88->0.60, sweep
      // 0.62->0.42, range 245->210, phase 0->3.1: the old cone sat across the whole
      // left-edge climb at ~48% sweep duty and alone added +50 alarm on the win
      // route's first 2 seconds. The narrower cone still watches the top-left
      // corner and the gold-bar-1 approach (lingering there still gets spotted),
      // but the phase shift means the sweep points down the left edge while the
      // thief is still crossing the hall — a thief transiting the climb at the
      // usual pace is only briefly in-cone, while a slow one still gets caught.
      { x: 42, y: 42, base: 0.60, sweep: 0.42, speed: 0.7, phase: 3.1, angle: 0.60, range: 210, seen: false },
      { x: 918, y: 42, base: Math.PI - 0.88, sweep: 0.9, speed: 0.45, phase: 2.4, angle: Math.PI - 0.88, range: 240, seen: false },
      // Camera 3: bottom-centre wall mount, sweeping up the red carpet over
      // the laser grid and the vault approach. Far from the spawn point (dist ~400 > range).
      // Round-8 retune: moved east to (560,545), range 280->240, sweep 0.75->0.65 —
      // the old mount at (480,545) covered the whole southern hall, so the x=380
      // south line and the west bottom route sat in-cone for most of the sweep
      // (+28-42 alarm/run). It still guards the carpet and vault approach (~27%
      // sweep duty on the carpet), just not the far west.
      // Round-8 carpet retune: base -PI/2 -> -1.35 (cone tilted east) — the
      // carpet sat at the cone's centre (~52% duty) and stacked with the laser
      // grid into a kill zone (+32-59/run). At ~35% duty the carpet is still
      // watched (lingering gets spotted) but transiting it is survivable.
      // Retest-10 retune: base -1.35 -> -1.25 (cone tilted a touch further
      // east). The GHOST run's carpet waits at (480,415) still sat in-cone
      // ~20% of the sweep and cam3 alone added +24/run to a careful sneak —
      // the camera was doing the laser grid's job. At ~11% duty the carpet
      // is still watched (a 3s linger still costs ~+3) but a timed sneak
      // crossing is no longer dominated by the camera.
      // Retest-3 retune: sweep 0.65->0.5, speed 0.55->0.8 — the slow sweep made
      // the carpet all-or-nothing by phase (+12 one run, +42 the next): a 2s
      // transit could sit in the cone the whole time. The faster, narrower
      // sweep crosses the thief 2-3 times per transit instead, so the cost
      // converges to its ~26% average (~+12) instead of swinging with the phase.
      // Retest-6 retune: range 240->180 — the carpet's north half (the grab
      // point, 202px away) is now out of range, so the camera can no longer sit
      // on the thief for the whole 1.5s return (+38 worst case). It still
      // watches the carpet's south half and the bottom-route approach.
      { x: 560, y: 545, base: -1.25, sweep: 0.5, speed: 0.8, phase: 1.2, angle: -1.25, range: 180, seen: false },
      // Camera 4: NEW (round 7) — bottom-centre-left wall mount, sweeping the
      // bottom corridor. Range 200 keeps it off the spawn point (dist ~220).
      { x: 300, y: 558, base: -Math.PI / 2, sweep: 0.5, speed: 0.6, phase: 3.1, angle: -Math.PI / 2, range: 200, seen: false }
    ];
    updateHUD();
    showScreen(null);
    // restore the opening objective (a win/lose in a previous run leaves the
    // "DIAMOND SECURED" text behind otherwise — stale HUD on the next heist)
    objectiveEl.innerHTML = 'Objective: reach the vault, grab the <b>DIAMOND</b>, then escape through the EXIT.';
    toast('Cross the hall — grab the DIAMOND from the vault! Mind the laser grid…');
  }

  /* ---------------- audio (offline WebAudio synth, no files) ---------------- */
  var AC = null;
  function audio() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
    if (AC && AC.state === 'suspended') { AC.resume(); }
    return AC;
  }
  function beep(freq, dur, type, vol, when) {
    if (muted) return; var ac = audio(); if (!ac) return;
    var t = ac.currentTime + (when || 0);
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol || 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function sfx(name) {
    if (muted) return;
    if (name === 'pickup') { beep(880, .12, 'sine', .12); beep(1174, .12, 'sine', .12, .1); beep(1568, .22, 'sine', .12, .2); }
    else if (name === 'hack') { beep(520, .09, 'square', .07); beep(660, .09, 'square', .07, .09); beep(880, .16, 'square', .07, .18); }
    else if (name === 'tick') { beep(1100, .06, 'square', .05); }
    else if (name === 'seen') { beep(220, .18, 'sawtooth', .09); beep(180, .22, 'sawtooth', .09, .12); }
    else if (name === 'laser') { beep(1400, .1, 'sawtooth', .08); beep(1200, .12, 'sawtooth', .08, .08); }
    else if (name === 'win') { [523, 659, 784, 1046].forEach(function (f, i) { beep(f, .22, 'sine', .12, i * .16); }); }
    else if (name === 'lose') { [392, 330, 262, 196].forEach(function (f, i) { beep(f, .28, 'sawtooth', .09, i * .2); }); }
    else if (name === 'click') { beep(700, .05, 'sine', .06); }
  }

  /* ---------------- input ---------------- */
  var keys = {};
  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) >= 0) e.preventDefault();
    if (k === 'shift') keys.shift = true; else keys[k] = true;
    if (k === 'e' && state === 'playing') interact();
    if (k === 'r') { resetGame(); }
    if (k === 'p' || k === 'escape') togglePause();
    if (k === 'm') toggleMute();
    if (k === 'enter' && (state === 'start' || state === 'win' || state === 'lose')) resetGame();
  });
  window.addEventListener('keyup', function (e) {
    var k = e.key.toLowerCase();
    if (k === 'shift') keys.shift = false; else keys[k] = false;
  });
  $('btn-start').addEventListener('click', function () { sfx('click'); resetGame(); });
  $('btn-again-win').addEventListener('click', function () { sfx('click'); resetGame(); });
  $('btn-again-lose').addEventListener('click', function () { sfx('click'); resetGame(); });
  $('btn-resume').addEventListener('click', function () { sfx('click'); togglePause(); });
  $('btn-restart').addEventListener('click', function () { sfx('click'); resetGame(); });
  $('btn-pause').addEventListener('click', function () { togglePause(); });
  $('btn-mute').addEventListener('click', function () { toggleMute(); });
  btnHack.addEventListener('click', function () { if (state === 'playing') interact(); });
  btnGrab.addEventListener('click', function () { if (state === 'playing') interact(); });

  function toggleMute() {
    muted = !muted;
    $('btn-mute').textContent = muted ? '🔇 Muted' : '🔊 Sound';
    if (!muted) sfx('click');
  }
  function togglePause() {
    if (state === 'playing') { state = 'paused'; showScreen('screen-pause'); }
    else if (state === 'paused') { state = 'playing'; showScreen(null); }
  }
  function showScreen(id) {
    ['screen-start', 'screen-win', 'screen-lose', 'screen-pause'].forEach(function (s) {
      $(s).classList.toggle('hidden', s !== id);
    });
  }

  /* ---------------- geometry helpers ---------------- */
  function dist(x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
  function segSeg(x1, y1, x2, y2, x3, y3, x4, y4) {
    var d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
    if (d === 0) return false;
    var t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
    var u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }
  function segHitsRect(x1, y1, x2, y2, r) {
    if (x1 >= r.x && x1 <= r.x + r.w && y1 >= r.y && y1 <= r.y + r.h) return true;
    if (x2 >= r.x && x2 <= r.x + r.w && y2 >= r.y && y2 <= r.y + r.h) return true;
    return segSeg(x1, y1, x2, y2, r.x, r.y, r.x + r.w, r.y) ||
      segSeg(x1, y1, x2, y2, r.x + r.w, r.y, r.x + r.w, r.y + r.h) ||
      segSeg(x1, y1, x2, y2, r.x + r.w, r.y + r.h, r.x, r.y + r.h) ||
      segSeg(x1, y1, x2, y2, r.x, r.y + r.h, r.x, r.y);
  }
  function losClear(x1, y1, x2, y2) {
    for (var i = 0; i < OBSTACLES.length; i++) if (segHitsRect(x1, y1, x2, y2, OBSTACLES[i])) return false;
    return true;
  }
  function circleHitsRect(x, y, r, rc) {
    var cx = Math.max(rc.x, Math.min(x, rc.x + rc.w)), cy = Math.max(rc.y, Math.min(y, rc.y + rc.h));
    var dx = x - cx, dy = y - cy; return dx * dx + dy * dy < r * r;
  }
  function collides(x, y, r) {
    if (x - r < WALL || x + r > W - WALL || y - r < WALL || y + r > H - WALL) return true;
    for (var i = 0; i < OBSTACLES.length; i++) if (circleHitsRect(x, y, r, OBSTACLES[i])) return true;
    if (circleHitsRect(x, y, r, TERMINAL)) return true;
    return false;
  }
  function moveCircle(e, dx, dy) {
    // Axis-separated steps, so the circle slides along a wall instead of
    // stopping dead on a diagonal approach.
    var movedX = false, movedY = false;
    if (!collides(e.x + dx, e.y, e.r)) { e.x += dx; movedX = true; }
    if (!collides(e.x, e.y + dy, e.r)) { e.y += dy; movedY = true; }
    // Wedged: a diagonal step with both axes blocked (squeezed into a corner
    // pocket between two obstacles). Back off along the opposite of the
    // blocked move so the next frame can slide around the obstacle instead
    // of sitting stuck until the player (or the test driver) gives up.
    // A single-axis move never wedges: its free axis already moved (movedX
    // is true for a zero dx step, since the current spot is free).
    if (!movedX && !movedY && (dx || dy)) {
      if (!collides(e.x - dx, e.y, e.r)) e.x -= dx;
      else if (!collides(e.x, e.y - dy, e.r)) e.y -= dy;
    }
  }
  function canSee(ox, oy, angle, range, halfAngle) {
    var d = dist(ox, oy, player.x, player.y);
    if (d > range) return false;
    // Point-blank: a guard/camera right on top of the thief always spots them
    // (also avoids atan2(0,0) when the two positions coincide).
    if (d < 30) return losClear(ox, oy, player.x, player.y);
    if (Math.abs(angDiff(Math.atan2(player.y - oy, player.x - ox), angle)) > halfAngle) return false;
    return losClear(ox, oy, player.x, player.y);
  }

  /* ---------------- lasers ---------------- */
  // A beam is live while its cycle position is inside the ON window, unless hacked.
  // At LOCKDOWN the grid fires faster: the period shortens, so the gaps shrink.
  function laserPeriod() { return alertLevel() === 2 ? LASER_PERIOD_LOCK : LASER_PERIOD; }
  function laserCycle(b) { return (time + b.phase) % laserPeriod(); }
  function laserActive(b) { return systemsOffUntil <= time && laserCycle(b) < LASER_ON; }
  function laserWarming(b) {
    // Last 0.4s of the OFF window: the beam flickers as a warning that it is about to fire.
    return systemsOffUntil <= time && !laserActive(b) && laserCycle(b) > laserPeriod() - 0.4;
  }
  function laserHitsPlayer(b) {
    return player.x > LASER_X1 - 6 && player.x < LASER_X2 + 6 &&
      Math.abs(player.y - b.y) < player.r + 3;
  }

  /* ---------------- sweeping laser ---------------- */
  // The turret on the vault's bottom edge rotates its beam across the carpet
  // approach. The beam is a line segment; it touches the thief when the thief's
  // centre comes within (r + 2) of the segment.
  function sweeperActive() { return systemsOffUntil <= time; }
  function sweeperHitsPlayer() {
    if (!sweeperActive()) return false;
    var ex = SWEEPER.x + Math.cos(sweeperAngle) * SWEEPER.len;
    var ey = SWEEPER.y + Math.sin(sweeperAngle) * SWEEPER.len;
    var dx = ex - SWEEPER.x, dy = ey - SWEEPER.y;
    var len2 = dx * dx + dy * dy;
    var t = ((player.x - SWEEPER.x) * dx + (player.y - SWEEPER.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    var px = SWEEPER.x + t * dx, py = SWEEPER.y + t * dy;
    return dist(player.x, player.y, px, py) < player.r + 2;
  }

  /* ---------------- interact ---------------- */
  function nearVault() { return dist(player.x, player.y, DIAMOND.x, DIAMOND.y) < 110; }
  function nearTerminal() { return dist(player.x, player.y, TERMINAL.cx, TERMINAL.cy) < 85; }
  function interact() {
    if (nearVault() && !loot) {
      loot = true; sfx('pickup');
      toast('💎 DIAMOND SECURED! Now reach the green EXIT →');
      objectiveEl.innerHTML = 'Objective: <b>DIAMOND SECURED</b> — escape through the <b style="color:#4dff9d">EXIT</b> (bottom-right)!';
      updateHUD();
    } else if (nearTerminal()) {
      if (systemsOffUntil > time) { toast('Systems already OFF — ' + Math.ceil(systemsOffUntil - time) + 's left'); return; }
      systemsOffUntil = time + 8; sfx('hack');
      toast('📷⚡ CAMERAS + LASERS OFF for 8 seconds — MOVE!');
      updateHUD();
    }
  }
  var toastTO = null;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show'); toastTimer = 2.6;
    if (toastTO) clearTimeout(toastTO);
    toastTO = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }

  /* ---------------- update ---------------- */
  // One guard's patrol / chase step, shared by the four patrol guards and the
  // LOCKDOWN response guard. speedMul comes from the alarm escalation level.
  function stepGuard(gd, dt, speedMul) {
    gd.seen = false;
    if (gd.cooldown > 0) gd.cooldown -= dt;
    if (gd.chase > 0) {
      gd.chase -= dt;
      var ta = Math.atan2(gd.chaseY - gd.y, gd.chaseX - gd.x);
      gd.angle += angDiff(ta, gd.angle) * Math.min(1, dt * 8);
      // Chase speed 100 (was 118): a running thief (175) now opens 75px/s on a
      // chasing guard, so one glimpse costs a brief chase instead of a guard
      // shadowing the thief down a whole corridor at ~44 alarm/s (round-8 retune).
      moveCircle(gd, Math.cos(gd.angle) * 100 * dt, Math.sin(gd.angle) * 100 * dt);
      // Reached the last-seen spot: give up and resume the patrol. Without this
      // a guard that chased a thief standing still (e.g. grabbing the diamond)
      // would stand point-blank on them for the full chase at ~44 alarm/s.
      var cd = dist(gd.x, gd.y, gd.chaseX, gd.chaseY);
      if (cd < 14) { gd.chase = 0; gd.chaseStuck = 0; gd.cooldown = 2.0; }
      else {
        // Stuck: the chase target is behind an obstacle (e.g. the vault) and the
        // guard is sliding along it without getting closer. Give up instead of
        // standing there staring at the thief while the alarm climbs to 100.
        if (gd.chaseLastD === undefined || cd < gd.chaseLastD - 8) { gd.chaseLastD = cd; gd.chaseStuck = 0; }
        else {
          gd.chaseStuck = (gd.chaseStuck || 0) + dt;
          if (gd.chaseStuck > 0.6) { gd.chase = 0; gd.chaseStuck = 0; gd.cooldown = 2.0; }
        }
      }
      // Chase timer ran out: the guard gives up and cannot start a new chase
      // for 2.0s (was 1.5s). Without the cooldown a guard standing ON the thief (it just
      // chased them down) re-triggers the chase every single frame and the
      // alarm climbs at ~44/s forever while the guard never walks away.
      if (gd.chase <= 0) { gd.cooldown = Math.max(gd.cooldown || 0, 2.0); }
    } else {
      var tgt = gd.wp[gd.wi];
      var d = dist(gd.x, gd.y, tgt.x, tgt.y);
      if (d < 6) { gd.wi = (gd.wi + 1) % gd.wp.length; gd.pause = gd.pauseDur || 0.7; }
      else if (gd.pause > 0) { gd.pause -= dt; }
      else {
        var a = Math.atan2(tgt.y - gd.y, tgt.x - gd.x);
        gd.angle += angDiff(a, gd.angle) * Math.min(1, dt * 8);
        moveCircle(gd, Math.cos(gd.angle) * gd.speed * speedMul * dt, Math.sin(gd.angle) * gd.speed * speedMul * dt);
      }
    }
  }

  function update(dt) {
    time += dt; elapsed += dt;
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toastEl.classList.remove('show'); }

    // player movement
    var mx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
    var my = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
    player.sneaking = !!keys.shift;
    var sp = player.sneaking ? player.speed * 0.48 : player.speed;
    if (mx || my) {
      var len = Math.sqrt(mx * mx + my * my);
      player.face = Math.atan2(my / len, mx / len);
      moveCircle(player, mx / len * sp * dt, my / len * sp * dt);
    }

    // escalation level drives camera sweep, guard speed and the laser grid
    var level = alertLevel();
    var camMul = level === 2 ? 1.5 : (level === 1 ? 1.25 : 1);
    var guardMul = level === 2 ? 1.2 : (level === 1 ? 1.1 : 1);

    // cameras sweep (deterministic, driven by `time`; each camera has its own speed)
    var sysOff = systemsOffUntil > time;
    for (var i = 0; i < cameras.length; i++) {
      var c = cameras[i];
      c.angle = c.base + Math.sin(time * c.speed * camMul + c.phase) * c.sweep;
      c.seen = false;
    }

    // sweeping laser turret rotates (deterministic, driven by `time`)
    sweeperAngle = SWEEPER.base + Math.sin(time * SWEEPER.speed) * SWEEPER.sweep;

    // LOCKDOWN: deploy the response guard at the exit corridor; stand it down
    // once the alarm has fallen well below the trigger, so the exit opens again.
    if (level === 2 && response.dormant) {
      response.dormant = false; response.x = 880; response.y = 470; response.wi = 1; response.chase = 0;
      toast('🚨 LOCKDOWN — RESPONSE UNIT DEPLOYED AT THE EXIT!');
      sfx('seen');
    } else if (level < 2 && !response.dormant && alarm < 45) {
      response.dormant = true;
      toast('Response unit stood down — the alarm is falling.');
    }

    // guards: patrol / chase (the response guard joins in while deployed)
    for (var g = 0; g < guards.length; g++) stepGuard(guards[g], dt, guardMul);
    if (!response.dormant) stepGuard(response, dt, guardMul);

    // vision + alarm
    seenNow = false; seenBy = '';
    var speedFactor = player.sneaking ? 0.5 : (mx || my ? 1.35 : 1.0);
    var seers = guards.concat(response.dormant ? [] : [response]);
    for (var gi = 0; gi < seers.length; gi++) {
      var gg = seers[gi];
      // A chasing guard runs head-down to the last-seen spot, so it only
      // re-acquires the thief within 120px (round-8 retune): the old 195px
      // chase vision let one 0.2s corner glimpse turn into a 1.4s shadowing
      // at ~44 alarm/s down a whole corridor. A thief standing still is still
      // re-spotted after the chase (patrol vision is still 195px), so the
      // guard-lane bust still works — a running thief just outruns the chase.
      if (canSee(gg.x, gg.y, gg.angle, gg.chase > 0 ? 120 : 195, 0.56)) {
        gg.seen = true; seenNow = true; seenBy = 'GUARD';
        var gd2 = dist(gg.x, gg.y, player.x, player.y);
        var prox = gd2 < 90 ? 1.25 : (gd2 > 150 ? 0.7 : 1.0);
        alarm += 26 * speedFactor * prox * dt;
        // A guard that loses sight gives up sooner now (1.4s, was 1.8s), and it
        // chases the LAST SEEN SPOT, not the thief: the old code re-aimed the chase
        // at the thief every frame, so a guard that spotted the thief in a straight
        // corridor tracked them down the whole hall and never let go. A guard on
        // its post-chase cooldown cannot start a new chase yet (see stepGuard).
        // Round-8 retune: 1.8s->1.4s, so a single glimpse buys a short chase the
        // thief outruns instead of a 1.8s shadowing at ~44 alarm/s.
        if (gg.chase <= 0 && (gg.cooldown || 0) <= 0) { gg.chase = 1.4; gg.chaseX = player.x; gg.chaseY = player.y; gg.chaseLastD = undefined; gg.chaseStuck = 0; sfx('seen'); }
      }
    }
    if (!sysOff) {
      for (var ci = 0; ci < cameras.length; ci++) {
        var cm = cameras[ci];
        if (canSee(cm.x, cm.y, cm.angle, cm.range, 0.48)) {
          cm.seen = true; seenNow = true; if (!seenBy) seenBy = 'CAMERA';
          var cd = dist(cm.x, cm.y, player.x, player.y);
          var cprox = cd < 100 ? 1.2 : (cd > 180 ? 0.7 : 1.0);
          alarm += 17 * speedFactor * cprox * dt;
        }
      }
      // laser grid: crossing a live beam trips the alarm hard — time the gaps or hack it off.
      // Retest-4 retune: 42/s -> 30/s. A blind crossing of all four beams (up +
      // down) could still add ~+40, but the typical blind crossing is ~+18 and a
      // timed crossing (all-clear window) or a hack is ~0 — the grid still punishes
      // carelessness (standing in a live beam is +40/s at run speed) without
      // single-handedly busting a clean run the way +42/s did (+52/run in retest 3).
      // Retest-9 retune (round 8): 30/s -> 26/s and LASER_ON 0.9s -> 0.8s (OFF
      // window 1.7s -> 1.8s). The vault carpet was the hottest segment of the
      // clean win (+35 grab leg, +32 return leg in verify run 0, peak 74): the
      // two live-beam crossings plus the sweeper at the grab point stacked to
      // ~+67. The grid still punishes a beam-stand hard (sloppy test still busts
      // in ~6s) — a timed crossing is just a little cheaper.
      // Retest-12 retune: 26/s -> 30/s. The 26/s beam-stand was net-negative
      // against the 13/s decay (26*0.31 - 13*0.69 = -0.9/s), so a player
      // standing on a live beam peaked 84 in 45s and never busted — the grid
      // stopped punishing carelessness. At 30/s the stand is net-positive and
      // busts in ~30-40s; the clean win keeps its headroom (peaks 36-46).
      for (var li = 0; li < LASERS.length; li++) {
        var lb = LASERS[li];
        if (laserActive(lb) && laserHitsPlayer(lb)) {
          seenNow = true; if (!seenBy) seenBy = 'LASER';
          alarm += 30 * speedFactor * dt;
          if (tickTimer <= 0) { sfx('laser'); }
        }
      }
      // sweeping laser: standing in the rotating beam trips the alarm too.
      // Retest-9 retune: 30/s -> 24/s. The grab point (480,365) sits 43px below
      // the turret, where the beam touches ~35% of its cycle — at 30/s the
      // grab+return stacked ~+20 from the sweeper alone. 24/s keeps it a real
      // threat (a careless grab still costs double digits) without dominating
      // the carpet.
      // Retest-11 retune: 24/s -> 18/s. The probe log showed the sweeper is
      // the GHOST run's dominant cost (+22 in one run): the beam sits on the
      // thief for the whole 1.6s grab-point wait, because the rotating beam
      // passes over the grab point for ~41% of its 14s cycle. A careful sneak
      // still pays for lingering at the vault (~+9/s while touching), but the
      // sweeper no longer single-handedly prices a GHOST out of reach.
      // Retest-12 retune: 18/s -> 15/s. The GHOST's worst run still peaked 25
      // (the boundary) with the sweeper as its largest single source on a bad
      // pass. 15/s keeps a careless grab costly (~+15/s standing, ~+8/s
      // sneaking) while giving the GHOST a few points of margin.
      if (sweeperHitsPlayer()) {
        seenNow = true; if (!seenBy) seenBy = 'SWEEPER';
        alarm += 15 * speedFactor * dt;
        sweeperHits++;
        if (tickTimer <= 0) { sfx('laser'); }
      }
    }
    // Unseen, the alarm falls: 13/s (was 11/s, round-8 retune) so a brief glimpse
    // clears quickly once line of sight breaks — breaking contact is the core
    // stealth skill, and the old decay let one glimpse bleed into the next
    // exposure on the win route. A sustained sighting (+16-44/s) still busts.
    if (!seenNow) alarm -= 13 * dt;
    alarm = Math.max(0, Math.min(100, alarm));
    if (alarm > peakAlarm) peakAlarm = alarm;

    // optional secondary loot: walk over a gold bar to pocket it (+150 score each)
    for (var bi = 0; bi < goldBars.length; bi++) {
      var bar = goldBars[bi];
      if (!bar.taken && dist(player.x, player.y, bar.x, bar.y) < 34) {
        bar.taken = true; gold += 1; sfx('pickup');
        toast('🟨 GOLD BAR secured! +' + 150 + ' — ' + gold + '/3 bars (optional loot)');
        updateHUD();
      }
    }
    // optional secondary loot: walk over a gallery painting to lift it (+100 each)
    for (var ai = 0; ai < artPieces.length; ai++) {
      var piece = artPieces[ai];
      if (!piece.taken && dist(player.x, player.y, piece.x, piece.y) < 32) {
        piece.taken = true; art += 1; sfx('pickup');
        toast('🖼 PAINTING lifted! +100 — ' + art + '/2 paintings (optional loot)');
        updateHUD();
      }
    }
    if (seenNow) {
      tickTimer -= dt;
      if (tickTimer <= 0) { sfx('tick'); tickTimer = 0.45; }
      chaseFlash = 0.25;
    } else if (chaseFlash > 0) chaseFlash -= dt;

    // win / lose
    if (loot && player.x + player.r > EXIT.x && player.x - player.r < EXIT.x + EXIT.w &&
        player.y + player.r > EXIT.y && player.y - player.r < EXIT.y + EXIT.h) {
      state = 'win'; sfx('win');
      var rating = endRating();
      var score = (loot ? 1000 : 0) + gold * 150 + art * 100;
      winRatingEl.textContent = '★ RATING: ' + rating.name + ' — ' + rating.blurb + ' ★';
      winRatingEl.style.color = rating.color;
      $('win-stats').textContent = 'Time ' + fmtTime(elapsed) + '  ·  Peak alarm ' + Math.round(peakAlarm) + '%  ·  Diamond secured 💎  ·  Gold bars ' + gold + '/3  ·  Paintings ' + art + '/2  ·  Score ' + score;
      showScreen('screen-win'); updateHUD(); return;
    }
    if (alarm >= 100) {
      state = 'lose'; sfx('lose');
      $('lose-stats').textContent = 'Survived ' + fmtTime(elapsed) + '  ·  ' + (loot ? 'You had the diamond — so close!' : 'The diamond is still in the vault…');
      showScreen('screen-lose'); updateHUD(); return;
    }
    updateHUD();
  }

  function fmtTime(s) { var m = Math.floor(s / 60), ss = Math.floor(s % 60); return m + ':' + (ss < 10 ? '0' : '') + ss; }

  // End rating from the peak alarm of the run: GHOST = barely noticed, SHADOW = seen but quiet, LOUD = alarms everywhere.
  function endRating() {
    if (peakAlarm < 25) return { name: 'GHOST', blurb: 'nobody ever knew you were there', color: '#4dff9d' };
    if (peakAlarm < 60) return { name: 'SHADOW', blurb: 'spotted once or twice, but you slipped away', color: '#ffd94d' };
    return { name: 'LOUD', blurb: 'the whole bank heard you — but you still got out', color: '#ff8a80' };
  }

  function updateHUD() {
    alarmFill.style.width = alarm + '%';
    alarmNum.textContent = Math.round(alarm);
    alarmFill.style.background = alarm < 30 ? 'linear-gradient(90deg,#37d67a,#7be495)'
      : alarm < 75 ? 'linear-gradient(90deg,#ffd94d,#ff9d2e)' : 'linear-gradient(90deg,#ff3b30,#ff7a5c)';
    if (alarmStateEl) {
      // Escalation stages: QUIET <30%, ALERT 30-74% (cameras + guards speed up),
      // LOCKDOWN >=75% (red alert, faster lasers, response guard at the exit).
      var st = alarm < 30 ? ['QUIET', '#4dff9d'] : alarm < 75 ? ['ALERT', '#ffd94d'] : ['LOCKDOWN!', '#ff5a4d'];
      alarmStateEl.textContent = st[0]; alarmStateEl.style.color = st[1];
    }
    if (goldEl) goldEl.textContent = gold + '/3';
    if (artEl) artEl.textContent = art + '/2';
    lootEl.textContent = loot ? '✦ SECURED' : '—';
    lootEl.style.color = loot ? '#4dff9d' : '';
    var sysOff = systemsOffUntil > time;
    if (sysOff) {
      camEl.textContent = 'OFF ' + Math.ceil(systemsOffUntil - time) + 's';
      camEl.style.color = '#8d97ad';
    } else {
      camEl.textContent = 'ONLINE'; camEl.style.color = '#ff5a4d';
    }
    if (laserEl) {
      if (sysOff) { laserEl.textContent = 'OFF ' + Math.ceil(systemsOffUntil - time) + 's'; laserEl.style.color = '#8d97ad'; laserEl.classList.remove('armed'); }
      else { laserEl.textContent = 'ARMED'; laserEl.style.color = '#ff5a4d'; laserEl.classList.add('armed'); }
    }
    timerEl.textContent = fmtTime(elapsed);
    btnHack.classList.toggle('hidden', !(state === 'playing' && nearTerminal() && !sysOff));
    btnGrab.classList.toggle('hidden', !(state === 'playing' && nearVault() && !loot));
  }

  /* ---------------- render ---------------- */
  function drawCone(x, y, angle, range, half, color, edge) {
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.arc(x, y, range, angle - half, angle + half); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.stroke();
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function lightPool(x, y, rad, color) {
    var g = ctx.createRadialGradient(x, y, 8, x, y, rad);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  function velvetRope(x1, y1, x2, y2, sag) {
    // gold posts at both ends + a sagging red rope between them
    ctx.fillStyle = '#d4af37';
    ctx.beginPath(); ctx.arc(x1, y1, 5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x2, y2, 5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#a11c2c'; ctx.lineWidth = 5; ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + sag, x2, y2); ctx.stroke();
    ctx.strokeStyle = '#ff5a6e'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + sag, x2, y2); ctx.stroke();
  }
  function zoneLabel(cx, cy, text) {
    ctx.font = '900 12px "Segoe UI", Arial';
    var w = ctx.measureText(text).width + 22;
    ctx.fillStyle = 'rgba(5,9,20,0.78)'; rr(cx - w / 2, cy - 11, w, 22, 6); ctx.fill();
    ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 1.5; rr(cx - w / 2, cy - 11, w, 22, 6); ctx.stroke();
    ctx.fillStyle = '#ffd94d'; ctx.textAlign = 'center';
    ctx.fillText(text, cx, cy + 4);
  }

  function render() {
    // marble floor: dark navy tiles with a faint grid, so the hall reads as a bank floor
    ctx.fillStyle = '#0d1734'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(120,150,220,0.10)'; ctx.lineWidth = 1;
    for (var gx = WALL; gx < W; gx += 60) { ctx.beginPath(); ctx.moveTo(gx, WALL); ctx.lineTo(gx, H - WALL); ctx.stroke(); }
    for (var gy = WALL; gy < H; gy += 60) { ctx.beginPath(); ctx.moveTo(WALL, gy); ctx.lineTo(W - WALL, gy); ctx.stroke(); }
    // --- three zones: distinct floor tints + gold divider lines + labels ---
    ctx.fillStyle = 'rgba(150,32,44,0.13)'; ctx.fillRect(WALL, WALL, ZONE_L - WALL, H - 2 * WALL);          // Gallery: warm red
    ctx.fillStyle = 'rgba(60,110,190,0.11)'; ctx.fillRect(ZONE_R, WALL, W - WALL - ZONE_R, H - 2 * WALL);   // Corridor: cool blue
    ctx.strokeStyle = 'rgba(212,175,55,0.45)'; ctx.lineWidth = 2;
    ctx.setLineDash([14, 8]);
    ctx.beginPath(); ctx.moveTo(ZONE_L, WALL); ctx.lineTo(ZONE_L, H - WALL); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ZONE_R, WALL); ctx.lineTo(ZONE_R, H - WALL); ctx.stroke();
    ctx.setLineDash([]);
    // warm light pools: the vault glows gold, gallery glows warm, corridor cool, entrance/exit green
    lightPool(480, 260, 310, 'rgba(255,200,80,0.15)');
    lightPool(170, 330, 170, 'rgba(255,180,90,0.08)');
    lightPool(800, 300, 180, 'rgba(120,180,255,0.07)');
    lightPool(84, 516, 190, 'rgba(120,255,170,0.07)');
    lightPool(900, 540, 170, 'rgba(120,255,170,0.08)');
    lightPool(260, 330, 150, 'rgba(255,200,80,0.06)');
    lightPool(700, 330, 150, 'rgba(255,200,80,0.06)');
    // escalation lighting: ALERT warms the hall, LOCKDOWN floods it red —
    // the whole room visibly changes when the alarm climbs.
    if (alertLevel() === 1) {
      ctx.fillStyle = 'rgba(255,140,40,0.05)'; ctx.fillRect(WALL, WALL, W - 2 * WALL, H - 2 * WALL);
    } else if (alertLevel() === 2) {
      ctx.fillStyle = 'rgba(255,30,20,0.10)'; ctx.fillRect(WALL, WALL, W - 2 * WALL, H - 2 * WALL);
      lightPool(480, 300, 420, 'rgba(255,40,30,0.10)');
    }
    // red carpet runner down the middle, gold-edged, leading straight to the vault
    ctx.fillStyle = 'rgba(158,28,44,0.42)'; ctx.fillRect(440, WALL, 80, H - 2 * WALL);
    ctx.fillStyle = '#d4af37'; ctx.fillRect(438, WALL, 3, H - 2 * WALL); ctx.fillRect(519, WALL, 3, H - 2 * WALL);
    ctx.strokeStyle = 'rgba(255,217,77,0.55)'; ctx.setLineDash([10, 14]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(480, WALL + 8); ctx.lineTo(480, H - WALL - 8); ctx.stroke(); ctx.setLineDash([]);
    // velvet ropes strung between the pillars, top and bottom of the hall
    velvetRope(386, 138, 574, 138, 26);
    velvetRope(386, 462, 574, 462, -26);

    // patrol paths (faint dotted loops through each guard's waypoints)
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.setLineDash([4, 8]); ctx.lineWidth = 2;
    guards.forEach(function (gd) {
      ctx.beginPath();
      gd.wp.forEach(function (p, i) { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.closePath(); ctx.stroke();
    });
    if (response && !response.dormant) {
      ctx.beginPath();
      response.wp.forEach(function (p, i) { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.closePath(); ctx.stroke();
    }
    ctx.setLineDash([]);

    // vision cones (under obstacles, so walls block them visually)
    var sysOff = systemsOffUntil > time;
    var coneGuards = guards.concat(response && !response.dormant ? [response] : []);
    for (var i = 0; i < coneGuards.length; i++) {
      var g = coneGuards[i];
      drawCone(g.x, g.y, g.angle, 195, 0.56,
        g.seen ? 'rgba(255,60,40,0.34)' : 'rgba(255,214,64,0.26)', g.seen ? '#ff3b30' : 'rgba(255,214,64,0.55)');
    }
    for (var ci = 0; ci < cameras.length; ci++) {
      var cm = cameras[ci];
      if (sysOff) drawCone(cm.x, cm.y, cm.angle, cm.range, 0.48, 'rgba(140,150,170,0.10)', 'rgba(140,150,170,0.35)');
      else drawCone(cm.x, cm.y, cm.angle, cm.range, 0.48,
        cm.seen ? 'rgba(255,60,40,0.30)' : 'rgba(255,80,80,0.20)', cm.seen ? '#ff3b30' : 'rgba(255,120,120,0.6)');
    }

    // --- laser grid: emitters + beams across the carpet, drawn above the cones ---
    var sysOffNow = systemsOffUntil > time;
    for (var li = 0; li < LASERS.length; li++) {
      var lb = LASERS[li];
      var active = laserActive(lb), warming = laserWarming(lb);
      // emitter boxes on both sides of the carpet
      [LASER_X1 - 8, LASER_X2].forEach(function (ex) {
        ctx.save();
        if (active) { ctx.shadowColor = '#ff3b30'; ctx.shadowBlur = 12; }
        ctx.fillStyle = active ? '#c81e1e' : (sysOffNow ? '#3a4358' : '#5a1a1a');
        ctx.fillRect(ex, lb.y - 7, 8, 14);
        ctx.restore();
        ctx.strokeStyle = active ? '#ff6b5e' : '#8d97ad'; ctx.lineWidth = 1.5;
        ctx.strokeRect(ex, lb.y - 7, 8, 14);
        ctx.fillStyle = active ? '#ff3b30' : (warming ? '#ff9d8a' : '#5a6b7a');
        ctx.beginPath(); ctx.arc(ex + 4, lb.y, 2.5, 0, 7); ctx.fill();
      });
      // beam itself
      if (active) {
        ctx.save();
        ctx.shadowColor = '#ff3b30'; ctx.shadowBlur = 14;
        ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(LASER_X1, lb.y); ctx.lineTo(LASER_X2, lb.y); ctx.stroke();
        ctx.strokeStyle = '#ffd0c8'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(LASER_X1, lb.y); ctx.lineTo(LASER_X2, lb.y); ctx.stroke();
        ctx.restore();
      } else if (warming) {
        // blink fast while the beam is about to fire
        if (Math.floor(time * 10) % 2 === 0) {
          ctx.strokeStyle = 'rgba(255,120,100,0.75)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(LASER_X1, lb.y); ctx.lineTo(LASER_X2, lb.y); ctx.stroke(); ctx.setLineDash([]);
        }
      } else {
        ctx.strokeStyle = sysOffNow ? 'rgba(140,150,170,0.25)' : 'rgba(255,90,80,0.28)';
        ctx.setLineDash([4, 8]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(LASER_X1, lb.y); ctx.lineTo(LASER_X2, lb.y); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // laser-grid label on the carpet, below the lowest beam
    ctx.fillStyle = 'rgba(5,9,20,0.78)'; rr(480 - 62, 462, 124, 20, 6); ctx.fill();
    ctx.strokeStyle = sysOffNow ? '#8d97ad' : '#ff5a4d'; ctx.lineWidth = 1.5; rr(480 - 62, 462, 124, 20, 6); ctx.stroke();
    ctx.fillStyle = sysOffNow ? '#8d97ad' : '#ff8a80'; ctx.font = '900 11px "Segoe UI", Arial'; ctx.textAlign = 'center';
    ctx.fillText(sysOffNow ? '⚡ LASERS OFF' : '⚡ LASER GRID', 480, 476);

    // --- sweeping laser: turret on the vault's bottom edge + rotating beam ---
    var swX = SWEEPER.x + Math.cos(sweeperAngle) * SWEEPER.len;
    var swY = SWEEPER.y + Math.sin(sweeperAngle) * SWEEPER.len;
    if (sweeperActive()) {
      ctx.save();
      ctx.shadowColor = '#ff3b30'; ctx.shadowBlur = 14;
      ctx.strokeStyle = 'rgba(255,59,48,0.85)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(SWEEPER.x, SWEEPER.y); ctx.lineTo(swX, swY); ctx.stroke();
      ctx.strokeStyle = '#ffd0c8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(SWEEPER.x, SWEEPER.y); ctx.lineTo(swX, swY); ctx.stroke();
      ctx.restore();
      // bright tip dot where the beam ends
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath(); ctx.arc(swX, swY, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd0c8';
      ctx.beginPath(); ctx.arc(swX, swY, 2.5, 0, 7); ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(140,150,170,0.3)'; ctx.setLineDash([4, 8]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(SWEEPER.x, SWEEPER.y); ctx.lineTo(swX, swY); ctx.stroke(); ctx.setLineDash([]);
    }
    // turret base on the vault edge
    ctx.fillStyle = sweeperActive() ? '#c81e1e' : '#3a4358';
    ctx.beginPath(); ctx.arc(SWEEPER.x, SWEEPER.y, 10, 0, 7); ctx.fill();
    ctx.strokeStyle = sweeperActive() ? '#ff6b5e' : '#8d97ad'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = sweeperActive() ? '#ff3b30' : '#5a6b7a';
    ctx.beginPath(); ctx.arc(SWEEPER.x, SWEEPER.y, 4, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(5,9,20,0.78)'; rr(SWEEPER.x - 58, 496, 116, 18, 5); ctx.fill();
    ctx.strokeStyle = sweeperActive() ? '#ff5a4d' : '#8d97ad'; ctx.lineWidth = 1.5; rr(SWEEPER.x - 58, 496, 116, 18, 5); ctx.stroke();
    ctx.fillStyle = sweeperActive() ? '#ff8a80' : '#8d97ad'; ctx.font = '900 10px "Segoe UI", Arial'; ctx.textAlign = 'center';
    ctx.fillText(sweeperActive() ? '⚡ SWEEPING LASER' : '⚡ SWEEPER OFF', SWEEPER.x, 509);

    // exit door
    ctx.save();
    if (loot) { ctx.shadowColor = '#4dff9d'; ctx.shadowBlur = 22; }
    ctx.fillStyle = loot ? '#0f7a3d' : '#233026';
    rr(EXIT.x, EXIT.y, EXIT.w, EXIT.h, 6); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = loot ? '#4dff9d' : '#5a6b5e'; ctx.lineWidth = 3; rr(EXIT.x, EXIT.y, EXIT.w, EXIT.h, 6); ctx.stroke();
    ctx.fillStyle = loot ? '#c8ffe0' : '#8a9a8e'; ctx.font = '900 15px "Segoe UI", Arial';
    ctx.textAlign = 'center'; ctx.fillText('EXIT', EXIT.x + 28, EXIT.y + 26);
    ctx.font = '700 10px "Segoe UI", Arial';
    ctx.fillText(loot ? 'OPEN →' : 'LOCKED', EXIT.x + 28, EXIT.y + 42);

    // terminal (wall-mounted, left wall — moved in from the edge, label on a solid pill)
    ctx.fillStyle = '#0e2a3a'; rr(TERMINAL.x, TERMINAL.y, TERMINAL.w, TERMINAL.h, 4); ctx.fill();
    ctx.strokeStyle = sysOff ? '#8d97ad' : '#35e0ff'; ctx.lineWidth = 2; rr(TERMINAL.x, TERMINAL.y, TERMINAL.w, TERMINAL.h, 4); ctx.stroke();
    ctx.fillStyle = 'rgba(5,9,20,0.88)'; rr(TERMINAL.x + 26, TERMINAL.cy - 11, 62, 22, 6); ctx.fill();
    ctx.strokeStyle = sysOff ? '#8d97ad' : '#35e0ff'; ctx.lineWidth = 1.5; rr(TERMINAL.x + 26, TERMINAL.cy - 11, 62, 22, 6); ctx.stroke();
    ctx.fillStyle = sysOff ? '#8d97ad' : '#35e0ff'; ctx.font = '900 11px "Segoe UI", Arial'; ctx.textAlign = 'left';
    ctx.fillText('⌨ HACK', TERMINAL.x + 32, TERMINAL.cy + 4);
    if (nearTerminal() && state === 'playing') {
      ctx.fillStyle = '#35e0ff'; ctx.font = '900 12px "Segoe UI", Arial';
      ctx.fillText(sysOff ? 'SYSTEMS OFF ' + Math.ceil(systemsOffUntil - time) + 's' : 'E — HACK CAMERAS + LASERS', TERMINAL.x + 96, TERMINAL.cy + 4);
    }

    // desks + pillars + glass display cases (gold piles inside, worth a look on the way past)
    OBSTACLES.forEach(function (o) {
      if (o === VAULT) return;
      if (o.kind === 'case') {
        ctx.save();
        ctx.shadowColor = '#ffd94d'; ctx.shadowBlur = 10;
        ctx.fillStyle = '#20294a'; rr(o.x, o.y, o.w, o.h, 8); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 2.5; rr(o.x, o.y, o.w, o.h, 8); ctx.stroke();
        ctx.fillStyle = 'rgba(160,210,255,0.16)'; rr(o.x + 6, o.y + 6, o.w - 12, o.h - 12, 5); ctx.fill();
        // gold pile inside the case: stacked coins + a small bar
        ctx.fillStyle = '#ffd94d';
        [0, 1, 2].forEach(function (k) { ctx.beginPath(); ctx.arc(o.x + 30 + k * 12, o.y + 40, 8, 0, 7); ctx.fill(); });
        ctx.beginPath(); ctx.arc(o.x + 36, o.y + 28, 8, 0, 7); ctx.fill();
        ctx.fillStyle = '#f5c542'; ctx.fillRect(o.x + 78, o.y + 30, 30, 12);
        ctx.strokeStyle = '#fff2b0'; ctx.lineWidth = 1; ctx.strokeRect(o.x + 78, o.y + 30, 30, 12);
        ctx.fillStyle = '#9fb2dd'; ctx.font = '900 10px "Segoe UI", Arial'; ctx.textAlign = 'center';
        ctx.fillText('GOLD DISPLAY', o.x + o.w / 2, o.y + 14);
        return;
      }
      var isPillar = o.w === 36;
      ctx.fillStyle = isPillar ? '#1b2a55' : '#3a2a18';
      rr(o.x, o.y, o.w, o.h, isPillar ? 6 : 5); ctx.fill();
      ctx.strokeStyle = isPillar ? '#d4af37' : '#8a6a35'; ctx.lineWidth = 2; rr(o.x, o.y, o.w, o.h, isPillar ? 6 : 5); ctx.stroke();
      if (!isPillar) { ctx.fillStyle = '#5d4426'; ctx.fillRect(o.x + 8, o.y + 8, o.w - 16, o.h - 16); ctx.fillStyle = '#d4af37'; ctx.fillRect(o.x + 8, o.y + 8, o.w - 16, 3); }
      else { ctx.fillStyle = '#d4af37'; ctx.beginPath(); ctx.arc(o.x + 18, o.y + 18, 6, 0, 7); ctx.fill(); }
    });

    // central vault
    ctx.save();
    ctx.shadowColor = '#ffd94d'; ctx.shadowBlur = loot ? 8 : 18;
    ctx.fillStyle = '#6b5312'; rr(VAULT.x, VAULT.y, VAULT.w, VAULT.h, 10); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#ffd94d'; ctx.lineWidth = 4; rr(VAULT.x, VAULT.y, VAULT.w, VAULT.h, 10); ctx.stroke();
    ctx.fillStyle = '#2a2110'; rr(VAULT.x + 10, VAULT.y + 10, VAULT.w - 20, VAULT.h - 20, 6); ctx.fill();
    ctx.strokeStyle = '#8a6a35'; ctx.lineWidth = 2; rr(VAULT.x + 10, VAULT.y + 10, VAULT.w - 20, VAULT.h - 20, 6); ctx.stroke();
    ctx.fillStyle = '#ffd94d'; ctx.font = '900 13px "Segoe UI", Arial'; ctx.textAlign = 'center';
    ctx.fillText('★ AURUM VAULT ★', VAULT.x + 80, VAULT.y - 8);
    // vault door wheel
    ctx.beginPath(); ctx.arc(VAULT.x + 80, VAULT.y + 88, 16, 0, 7); ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.arc(VAULT.x + 80, VAULT.y + 88, 5, 0, 7); ctx.fillStyle = '#ffd94d'; ctx.fill();

    // diamond — bold, glowing, always visible on the vault door
    if (!loot) {
      var pulse = 1 + Math.sin(time * 3) * 0.12;
      ctx.save();
      ctx.translate(DIAMOND.x, DIAMOND.y); ctx.scale(pulse, pulse);
      ctx.shadowColor = '#7df9ff'; ctx.shadowBlur = 26;
      ctx.beginPath();
      ctx.moveTo(0, -20); ctx.lineTo(17, -4); ctx.lineTo(0, 20); ctx.lineTo(-17, -4); ctx.closePath();
      ctx.fillStyle = '#bff6ff'; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-17, -4); ctx.lineTo(17, -4); ctx.moveTo(0, -20); ctx.lineTo(0, 20);
      ctx.moveTo(-8, -12); ctx.lineTo(8, -12); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#bff6ff'; ctx.font = '900 12px "Segoe UI", Arial'; ctx.textAlign = 'center';
      ctx.fillText('◆ DIAMOND ◆', DIAMOND.x, DIAMOND.y - 30);
    }

    // optional gold bars — glowing, labelled, free to grab on the way past
    goldBars.forEach(function (bar) {
      if (bar.taken) return;
      var bp = 1 + Math.sin(time * 3 + bar.x) * 0.1;
      ctx.save();
      ctx.translate(bar.x, bar.y); ctx.scale(bp, bp);
      ctx.shadowColor = '#ffd94d'; ctx.shadowBlur = 16;
      ctx.fillStyle = '#f5c542';
      ctx.beginPath();
      ctx.moveTo(-14, 6); ctx.lineTo(-10, -6); ctx.lineTo(10, -6); ctx.lineTo(14, 6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff2b0'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#ffd94d'; ctx.font = '900 11px "Segoe UI", Arial'; ctx.textAlign = 'center';
      ctx.fillText('GOLD +150', bar.x, bar.y - 16);
    });

    // gallery paintings — framed, glowing, labelled, liftable on the way past
    artPieces.forEach(function (piece) {
      if (piece.taken) return;
      var ap = 1 + Math.sin(time * 3 + piece.y) * 0.08;
      ctx.save();
      ctx.translate(piece.x, piece.y); ctx.scale(ap, ap);
      ctx.shadowColor = '#ff9d5c'; ctx.shadowBlur = 14;
      ctx.fillStyle = '#2a1a3a'; rr(-24, -18, 48, 36, 3); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 3; rr(piece.x - 24, piece.y - 18, 48, 36, 3); ctx.stroke();
      // tiny landscape inside the frame: gold sun over a dark hill
      ctx.fillStyle = '#3a2a5a'; ctx.fillRect(piece.x - 19, piece.y - 13, 38, 26);
      ctx.fillStyle = '#ffd94d'; ctx.beginPath(); ctx.arc(piece.x - 8, piece.y - 4, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#1a2a1a'; ctx.beginPath(); ctx.moveTo(piece.x - 19, piece.y + 13); ctx.lineTo(piece.x - 2, piece.y - 2); ctx.lineTo(piece.x + 19, piece.y + 13); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffb37a'; ctx.font = '900 11px "Segoe UI", Arial'; ctx.textAlign = 'center';
      ctx.fillText('ART +100', piece.x, piece.y - 26);
    });

    // cameras (wall mounts)
    for (var c2 = 0; c2 < cameras.length; c2++) {
      var cam = cameras[c2];
      ctx.fillStyle = '#3a4358'; ctx.beginPath(); ctx.arc(cam.x, cam.y, 11, 0, 7); ctx.fill();
      ctx.strokeStyle = sysOff ? '#8d97ad' : '#ff5a4d'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cam.x, cam.y, 11, 0, 7); ctx.stroke();
      var ex = cam.x + Math.cos(cam.angle) * 16, ey = cam.y + Math.sin(cam.angle) * 16;
      ctx.strokeStyle = '#cdd7ef'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cam.x, cam.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = sysOff ? '#8d97ad' : '#ff3b30';
      ctx.beginPath(); ctx.arc(ex, ey, 4.5, 0, 7); ctx.fill();
      if (!sysOff && cam.seen) { ctx.fillStyle = '#ff3b30'; ctx.font = '900 13px "Segoe UI", Arial'; ctx.fillText('!', ex, ey - 12); }
      ctx.fillStyle = sysOff ? '#8d97ad' : '#ff8a80'; ctx.font = '900 11px "Segoe UI", Arial'; ctx.textAlign = 'center';
      // bottom camera's label goes above it so it never lands under the wall band
      ctx.fillText(sysOff ? 'CAM OFF' : 'CAM', cam.x, cam.y > H - 100 ? cam.y - 20 : cam.y + 26);
    }

    // guards (the response guard joins the draw list while deployed)
    var drawGuards = guards.concat(response && !response.dormant ? [response] : []);
    for (var g2 = 0; g2 < drawGuards.length; g2++) {
      var gd = drawGuards[g2];
      var isResponse = gd === response;
      ctx.save(); ctx.translate(gd.x, gd.y);
      ctx.fillStyle = gd.seen ? '#7a1414' : (isResponse ? '#4a0d0d' : '#1d2f66');
      ctx.beginPath(); ctx.arc(0, 0, gd.r + 2, 0, 7); ctx.fill();
      ctx.strokeStyle = gd.seen ? '#ff3b30' : (isResponse ? '#ff5a4d' : '#ffd94d'); ctx.lineWidth = 2.5; ctx.stroke();
      // facing tick + cap
      ctx.rotate(gd.angle);
      ctx.fillStyle = isResponse ? '#ff5a4d' : '#ffd94d'; ctx.beginPath(); ctx.moveTo(gd.r + 2, 0); ctx.lineTo(gd.r - 4, -6); ctx.lineTo(gd.r - 4, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = isResponse ? '#ff8a80' : '#fff'; ctx.font = '900 11px "Segoe UI", Arial'; ctx.textAlign = 'center';
      ctx.fillText(isResponse ? 'RESPONSE' : 'GUARD', gd.x, gd.y - gd.r - 8);
      if (gd.seen) { ctx.fillStyle = '#ff3b30'; ctx.font = '900 20px "Segoe UI", Arial'; ctx.fillText('!', gd.x, gd.y - gd.r - 20); }
    }

    // laser warning: a pulsing red ring + ⚡ over the thief while they stand in
    // a live beam, so it is obvious WHY the alarm is climbing
    if (state === 'playing' && !sysOff) {
      for (var lw = 0; lw < LASERS.length; lw++) {
        if (laserActive(LASERS[lw]) && laserHitsPlayer(LASERS[lw])) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,59,48,' + (0.55 + 0.4 * Math.sin(time * 10)) + ')';
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 12, 0, 7); ctx.stroke();
          ctx.fillStyle = '#ff3b30'; ctx.font = '900 18px "Segoe UI", Arial'; ctx.textAlign = 'center';
          ctx.fillText('⚡', player.x, player.y - player.r - 30);
          ctx.restore();
          break;
        }
      }
    }

    // player — big thief in a black hoodie with a gold glow, readable at thumbnail size
    ctx.save(); ctx.translate(player.x, player.y);
    if (player.sneaking) { ctx.globalAlpha = 0.85; }
    // pulsing gold halo so the thief pops against the dark floor
    var halo = 1 + Math.sin(time * 4) * 0.08;
    ctx.save(); ctx.scale(halo, halo);
    ctx.strokeStyle = 'rgba(255,217,77,0.55)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, player.r + 6, 0, 7); ctx.stroke();
    ctx.restore();
    ctx.shadowColor = '#ffd94d'; ctx.shadowBlur = 22;
    ctx.fillStyle = '#14141c'; ctx.beginPath(); ctx.arc(0, 0, player.r, 0, 7); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#ffd94d'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#fff2b0'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r - 4, 0, 7); ctx.stroke();
    // hood + eyes facing direction
    var fx = Math.cos(player.face), fy = Math.sin(player.face);
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath(); ctx.arc(player.x + fx * 6 - fy * 5, player.y + fy * 6 + fx * 5, 2.2, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(player.x + fx * 6 + fy * 5, player.y + fy * 6 - fx * 5, 2.2, 0, 7); ctx.fill();
    var thiefLabel = player.sneaking ? 'THIEF · SNEAKING' : '★ THIEF ★';
    ctx.fillStyle = 'rgba(5,9,20,0.85)';
    rr(player.x - 52, player.y - player.r - 26, 104, 18, 5); ctx.fill();
    ctx.fillStyle = '#ffd94d'; ctx.font = '900 12px "Segoe UI", Arial'; ctx.textAlign = 'center';
    ctx.fillText(thiefLabel, player.x, player.y - player.r - 13);

    // zone labels (drawn late so they sit above the floor, below the actors' labels)
    zoneLabel(220, 34, 'GALLERY');  // centred east of guard 4's beat (70-140,60)
    // so its "GUARD" label never collides with the zone label
    zoneLabel(480, 34, '★ VAULT ★');
    zoneLabel(787, 34, 'SECURITY CORRIDOR');

    // entrance marker (inside the playfield, just above the bottom wall)
    ctx.fillStyle = '#4dff9d'; ctx.font = '900 11px "Segoe UI", Arial'; ctx.textAlign = 'left';
    ctx.fillText('◀ ENTRANCE', 24, 578);

    // spotted banner
    if (seenNow && state === 'playing') {
      var banner = '⚠ SPOTTED — ' + seenBy + '!';
      ctx.font = '900 16px "Segoe UI", Arial';
      var bw = ctx.measureText(banner).width + 36;
      ctx.fillStyle = 'rgba(255,59,48,0.92)'; rr(W / 2 - bw / 2, 22, bw, 30, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(banner, W / 2, 43);
    }
    // systems-off banner
    if (sysOff && state === 'playing') {
      ctx.fillStyle = 'rgba(20,40,80,0.92)'; rr(W / 2 - 130, 56, 260, 26, 8); ctx.fill();
      ctx.fillStyle = '#8fd0ff'; ctx.font = '900 14px "Segoe UI", Arial'; ctx.textAlign = 'center';
      ctx.fillText('📷⚡ SYSTEMS OFF — ' + Math.ceil(systemsOffUntil - time) + 's', W / 2, 74);
    }
    // LOCKDOWN banner: the room is in full alert and a response unit guards the exit
    if (alertLevel() === 2 && state === 'playing') {
      ctx.font = '900 16px "Segoe UI", Arial';
      var lbw = ctx.measureText('🚨 LOCKDOWN — RESPONSE UNIT AT THE EXIT 🚨').width + 36;
      ctx.fillStyle = 'rgba(160,10,10,0.92)'; rr(W / 2 - lbw / 2, 90, lbw, 30, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText('🚨 LOCKDOWN — RESPONSE UNIT AT THE EXIT 🚨', W / 2, 111);
    }
    // interact prompt above player
    if (state === 'playing' && nearVault() && !loot) {
      ctx.fillStyle = '#ffd94d'; ctx.font = '900 14px "Segoe UI", Arial'; ctx.textAlign = 'center';
      ctx.fillText('E — GRAB THE DIAMOND 💎', player.x, player.y - 30);
    }
    // red edge pulse when alarm high
    if (alarm >= 75 && state === 'playing') {
      ctx.strokeStyle = 'rgba(255,59,48,' + (0.25 + 0.35 * Math.sin(time * 6)) + ')';
      ctx.lineWidth = 8; ctx.strokeRect(4, 4, W - 8, H - 8);
    }

    // walls (gold-trimmed navy)
    ctx.fillStyle = '#0a1230'; ctx.fillRect(0, 0, W, WALL); ctx.fillRect(0, H - WALL, W, WALL);
    ctx.fillRect(0, 0, WALL, H); ctx.fillRect(W - WALL, 0, WALL, H);
    ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 2;
    ctx.strokeRect(WALL - 1, WALL - 1, W - 2 * WALL + 2, H - 2 * WALL + 2);
    ctx.fillStyle = '#ffd94d'; ctx.font = '900 13px "Segoe UI", Arial'; ctx.textAlign = 'center';
    ctx.fillText('★ AURUM NATIONAL BANK — VAULT HALL ★', W / 2, 13);
  }

  /* ---------------- debug hook (read-only snapshot, updated every frame) ---------------- */
  window.__heist = {
    state: 'start', alarm: 0, loot: false,
    player: { x: 84, y: 516 }, guards: [], cameras: [], camerasOff: false, elapsed: 0,
    gold: 0, goldTotal: 3, art: 0, artTotal: 2, peakAlarm: 0, rating: '',
    lasers: [], lasersOff: false, time: 0,
    sweeper: { angle: Math.PI / 2, active: true, hits: 0, touching: false },
    alertLevel: 0, responseActive: false
  };
  function syncDebug() {
    window.__heist.state = state; window.__heist.alarm = alarm; window.__heist.loot = loot;
    window.__heist.elapsed = elapsed; window.__heist.camerasOff = systemsOffUntil > time;
    window.__heist.lasersOff = systemsOffUntil > time; window.__heist.time = time;
    window.__heist.gold = gold; window.__heist.art = art; window.__heist.peakAlarm = peakAlarm;
    window.__heist.rating = state === 'win' ? endRating().name : '';
    window.__heist.alertLevel = alertLevel();
    window.__heist.responseActive = !!(response && !response.dormant);
    window.__heist.sweeper = { angle: +sweeperAngle.toFixed(2), active: sweeperActive(), hits: sweeperHits, touching: sweeperActive() && sweeperHitsPlayer() };
    if (player) { window.__heist.player.x = player.x; window.__heist.player.y = player.y; }
    window.__heist.guards = guards ? guards.map(function (g) {
      return { x: Math.round(g.x), y: Math.round(g.y), seen: g.seen, chase: g.chase > 0 };
    }) : [];
    if (response && !response.dormant) {
      window.__heist.guards.push({ x: Math.round(response.x), y: Math.round(response.y), seen: response.seen, chase: response.chase > 0, response: true });
    }
    window.__heist.cameras = cameras ? cameras.map(function (c) {
      return { x: c.x, y: c.y, angle: +c.angle.toFixed(2), seen: c.seen };
    }) : [];
    window.__heist.lasers = LASERS.map(function (b) {
      return { y: b.y, active: laserActive(b), warming: laserWarming(b), cycle: +laserCycle(b).toFixed(2) };
    });
  }

  /* ---------------- main loop ---------------- */
  // idle attract state so the start screen still shows a live room behind it
  player = { x: 84, y: 516, r: 19, speed: 175, sneaking: false, face: -Math.PI / 2 };
  guards = [
    { x: 180, y: 415, r: 14, wp: [{ x: 180, y: 415 }, { x: 180, y: 225 }, { x: 320, y: 225 }, { x: 320, y: 415 }], wi: 1, angle: -Math.PI / 2, speed: 68, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0, pauseDur: 0.7 },
    { x: 820, y: 140, r: 14, wp: [{ x: 820, y: 140 }, { x: 770, y: 280 }, { x: 820, y: 430 }, { x: 860, y: 200 }], wi: 1, angle: Math.PI / 2, speed: 84, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0, pauseDur: 1.2 },
    { x: 790, y: 280, r: 14, wp: [{ x: 790, y: 280 }, { x: 790, y: 370 }, { x: 860, y: 370 }, { x: 860, y: 280 }], wi: 1, angle: Math.PI / 2, speed: 76, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0, pauseDur: 0.5 },
    { x: 70, y: 60, r: 14, wp: [{ x: 70, y: 60 }, { x: 140, y: 60 }], wi: 1, angle: 0, speed: 60, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0, pauseDur: 0.8 }
  ];
  response = { x: 880, y: 470, r: 14, wp: [{ x: 820, y: 440 }, { x: 900, y: 440 }, { x: 900, y: 500 }, { x: 820, y: 500 }], wi: 1, angle: 0, speed: 96, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0, pauseDur: 0.5, dormant: true };
  cameras = [
    { x: 42, y: 42, base: 0.60, sweep: 0.42, speed: 0.7, phase: 3.1, angle: 0.60, range: 210, seen: false },
    { x: 918, y: 42, base: Math.PI - 0.88, sweep: 0.9, speed: 0.45, phase: 2.4, angle: Math.PI - 0.88, range: 240, seen: false },
    { x: 560, y: 545, base: -1.25, sweep: 0.5, speed: 0.8, phase: 1.2, angle: -1.25, range: 180, seen: false },
    { x: 300, y: 558, base: -Math.PI / 2, sweep: 0.5, speed: 0.6, phase: 3.1, angle: -Math.PI / 2, range: 200, seen: false }
  ];
  goldBars = GOLD_SPOTS.map(function (s) { return { x: s.x, y: s.y, taken: false }; });
  artPieces = ART_SPOTS.map(function (s) { return { x: s.x, y: s.y, taken: false }; });
  // autostart for screenshots / headless testing: ?autostart=1
  if (/[?&]autostart=1/.test(window.location.search)) { resetGame(); }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (state === 'playing') update(dt);
    else {
      // idle animation behind start/pause/win/lose screens: sweep cameras + sweeper only
      time += dt;
      for (var i = 0; i < cameras.length; i++) cameras[i].angle = cameras[i].base + Math.sin(time * cameras[i].speed + cameras[i].phase) * cameras[i].sweep;
      sweeperAngle = SWEEPER.base + Math.sin(time * SWEEPER.speed) * SWEEPER.sweep;
      if (state === 'start') { /* guards hold still on the start frame for a clean screenshot */ }
    }
    render(); syncDebug();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
