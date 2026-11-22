/* Midnight Vault — The Aurum Job · Aurum National Bank
   Original top-down 2D heist game. Plain JS, no libraries, no network.
   Canvas 960x600. WASD/arrows move, Shift sneak, E grab/hack, R restart, P/Esc pause, M mute.
   Round 6: three zones in one frame (Gallery / Vault / Security corridor),
   3 guards, 3 cameras, and a timed laser grid across the vault approach.
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
      winRatingEl = $('win-rating');

  /* ---------------- level layout (fixed, deterministic) ---------------- */
  // Three zones in one hall, split by gold floor lines at x=330 and x=630:
  //   Gallery (left) — display cases + gold bars; Vault (centre) — diamond + lasers;
  //   Security corridor (right) — the guarded route to the green EXIT.
  var ZONE_L = 330, ZONE_R = 630;
  var VAULT = { x: 400, y: 200, w: 160, h: 120 };
  var DIAMOND = { x: 480, y: 260 };
  var EXIT = { x: 872, y: 512, w: 56, h: 56 };
  var TERMINAL = { x: 36, y: 262, w: 22, h: 48, cx: 60, cy: 286 };
  var GOLD_SPOTS = [{ x: 300, y: 88 }, { x: 660, y: 88 }, { x: 890, y: 300 }];
  // Timed laser grid across the red-carpet vault approach (x 430..530).
  // Each beam cycles: on for LASER_ON, off for the rest of LASER_PERIOD.
  var LASER_X1 = 430, LASER_X2 = 530, LASER_PERIOD = 2.6, LASER_ON = 1.5;
  var LASERS = [
    { y: 350, phase: 0.0 },
    { y: 395, phase: 0.9 },
    { y: 440, phase: 1.8 }
  ];
  var OBSTACLES = [
    VAULT,
    { x: 180, y: 120, w: 140, h: 46 },   // desk top-left
    { x: 640, y: 120, w: 140, h: 46 },   // desk top-right
    { x: 180, y: 434, w: 140, h: 46 },   // desk bottom-left
    { x: 640, y: 434, w: 140, h: 46 },   // desk bottom-right
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
  var peakAlarm = 0;             // highest alarm reached this run (drives the end rating)
  var systemsOffUntil = -1;      // hack timer: cameras AND lasers off while time < this
  var seenNow = false, seenBy = '', chaseFlash = 0;
  var toastTimer = 0, tickTimer = 0, time = 0;   // time = deterministic clock (seconds)
  var player, guards, cameras;

  function resetGame() {
    state = 'playing'; alarm = 0; loot = false; elapsed = 0; time = 0;
    systemsOffUntil = -1; seenNow = false; seenBy = ''; toastTimer = 0;
    gold = 0; peakAlarm = 0;
    goldBars = GOLD_SPOTS.map(function (s) { return { x: s.x, y: s.y, taken: false }; });
    player = { x: 84, y: 516, r: 19, speed: 175, sneaking: false, face: -Math.PI / 2 };
    guards = [
      // Guard 1: slow rectangular loop down the left hall (Gallery), counter-clockwise
      // so its cone never covers the vault approach; left leg at x=180, clear of the
      // display case and far enough from the left wall that a climbing thief is only briefly seen.
      // Right leg at x=340 (not 380): the old leg's down-right cone just clipped the
      // red carpet at (480,448) and the guard would chase the thief down the hall.
      { x: 180, y: 415, r: 14, wp: [{ x: 180, y: 415 }, { x: 180, y: 250 }, { x: 340, y: 250 }, { x: 340, y: 415 }], wi: 1,
        angle: -Math.PI / 2, speed: 68, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0, pauseDur: 0.7 },
      // Guard 2: faster diamond loop on the right side, longer look-around pauses.
      // Its lower waypoint sits up the right wall, clear of the gold bar below it.
      { x: 820, y: 140, r: 14, wp: [{ x: 820, y: 140 }, { x: 770, y: 280 }, { x: 820, y: 460 }, { x: 860, y: 200 }], wi: 1,
        angle: Math.PI / 2, speed: 84, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0, pauseDur: 1.2 },
      // Guard 3: NEW — patrols a tight rectangle in the Security corridor, up in the
      // middle-right (y 300..400) so its cone never covers the bottom corridor to the
      // EXIT: the old bottom leg at y=495 faced left straight down the y=510 exit
      // route and chased the thief all the way to the door. Left leg x=790 clears
      // the display case (ends x=760); bottom leg y=400 clears the bottom-right desk.
      { x: 790, y: 300, r: 14, wp: [{ x: 790, y: 300 }, { x: 860, y: 300 }, { x: 860, y: 400 }, { x: 790, y: 400 }], wi: 1,
        angle: 0, speed: 76, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0, pauseDur: 0.9 }
    ];
    cameras = [
      { x: 42, y: 42, base: 0.88, sweep: 0.62, speed: 0.7, phase: 0, angle: 0.88, range: 245, seen: false },
      { x: 918, y: 42, base: Math.PI - 0.88, sweep: 0.9, speed: 0.45, phase: 2.4, angle: Math.PI - 0.88, range: 265, seen: false },
      // Camera 3: NEW — bottom-centre wall mount, sweeping up the red carpet over
      // the laser grid and the vault approach. Far from the spawn point (dist ~400 > range).
      { x: 480, y: 545, base: -Math.PI / 2, sweep: 0.75, speed: 0.55, phase: 1.2, angle: -Math.PI / 2, range: 280, seen: false }
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
    if (!collides(e.x + dx, e.y, e.r)) e.x += dx;
    if (!collides(e.x, e.y + dy, e.r)) e.y += dy;
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
  function laserCycle(b) { return (time + b.phase) % LASER_PERIOD; }
  function laserActive(b) { return systemsOffUntil <= time && laserCycle(b) < LASER_ON; }
  function laserWarming(b) {
    // Last 0.4s of the OFF window: the beam flickers as a warning that it is about to fire.
    return systemsOffUntil <= time && !laserActive(b) && laserCycle(b) > LASER_PERIOD - 0.4;
  }
  function laserHitsPlayer(b) {
    return player.x > LASER_X1 - 6 && player.x < LASER_X2 + 6 &&
      Math.abs(player.y - b.y) < player.r + 3;
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

    // cameras sweep (deterministic, driven by `time`; each camera has its own speed)
    var sysOff = systemsOffUntil > time;
    for (var i = 0; i < cameras.length; i++) {
      var c = cameras[i];
      c.angle = c.base + Math.sin(time * c.speed + c.phase) * c.sweep;
      c.seen = false;
    }

    // guards: patrol / chase
    for (var g = 0; g < guards.length; g++) {
      var gd = guards[g]; gd.seen = false;
      if (gd.chase > 0) {
        gd.chase -= dt;
        var ta = Math.atan2(gd.chaseY - gd.y, gd.chaseX - gd.x);
        gd.angle += angDiff(ta, gd.angle) * Math.min(1, dt * 8);
        moveCircle(gd, Math.cos(gd.angle) * 118 * dt, Math.sin(gd.angle) * 118 * dt);
        if (gd.chase <= 0) { /* resume patrol from nearest waypoint */ }
      } else {
        var tgt = gd.wp[gd.wi];
        var d = dist(gd.x, gd.y, tgt.x, tgt.y);
        if (d < 6) { gd.wi = (gd.wi + 1) % gd.wp.length; gd.pause = gd.pauseDur || 0.7; }
        else if (gd.pause > 0) { gd.pause -= dt; }
        else {
          var a = Math.atan2(tgt.y - gd.y, tgt.x - gd.x);
          gd.angle += angDiff(a, gd.angle) * Math.min(1, dt * 8);
          moveCircle(gd, Math.cos(gd.angle) * gd.speed * dt, Math.sin(gd.angle) * gd.speed * dt);
        }
      }
    }

    // vision + alarm
    seenNow = false; seenBy = '';
    var speedFactor = player.sneaking ? 0.5 : (mx || my ? 1.35 : 1.0);
    for (var gi = 0; gi < guards.length; gi++) {
      var gg = guards[gi];
      if (canSee(gg.x, gg.y, gg.angle, 195, 0.56)) {
        gg.seen = true; seenNow = true; seenBy = 'GUARD';
        var gd2 = dist(gg.x, gg.y, player.x, player.y);
        var prox = gd2 < 90 ? 1.25 : (gd2 > 150 ? 0.7 : 1.0);
        alarm += 26 * speedFactor * prox * dt;
        // A guard that loses sight gives up sooner now (1.8s, was 2.5s), and it
        // chases the LAST SEEN SPOT, not the thief: the old code re-aimed the chase
        // at the thief every frame, so a guard that spotted the thief in a straight
        // corridor tracked them down the whole hall and never let go.
        if (gg.chase <= 0) { gg.chase = 1.8; gg.chaseX = player.x; gg.chaseY = player.y; sfx('seen'); }
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
      for (var li = 0; li < LASERS.length; li++) {
        var lb = LASERS[li];
        if (laserActive(lb) && laserHitsPlayer(lb)) {
          seenNow = true; if (!seenBy) seenBy = 'LASER';
          alarm += 42 * speedFactor * dt;
          if (tickTimer <= 0) { sfx('laser'); }
        }
      }
    }
    if (!seenNow) alarm -= 9 * dt;
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
      var score = (loot ? 1000 : 0) + gold * 150;
      winRatingEl.textContent = '★ RATING: ' + rating.name + ' — ' + rating.blurb + ' ★';
      winRatingEl.style.color = rating.color;
      $('win-stats').textContent = 'Time ' + fmtTime(elapsed) + '  ·  Peak alarm ' + Math.round(peakAlarm) + '%  ·  Diamond secured 💎  ·  Gold bars ' + gold + '/3  ·  Score ' + score;
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
    alarmFill.style.background = alarm < 35 ? 'linear-gradient(90deg,#37d67a,#7be495)'
      : alarm < 70 ? 'linear-gradient(90deg,#ffd94d,#ff9d2e)' : 'linear-gradient(90deg,#ff3b30,#ff7a5c)';
    if (alarmStateEl) {
      var st = alarm < 35 ? ['QUIET', '#4dff9d'] : alarm < 70 ? ['RISKY', '#ffd94d'] : ['LOUD!', '#ff5a4d'];
      alarmStateEl.textContent = st[0]; alarmStateEl.style.color = st[1];
    }
    if (goldEl) goldEl.textContent = gold + '/3';
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
    ctx.setLineDash([]);

    // vision cones (under obstacles, so walls block them visually)
    var sysOff = systemsOffUntil > time;
    for (var i = 0; i < guards.length; i++) {
      var g = guards[i];
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

    // guards
    for (var g2 = 0; g2 < guards.length; g2++) {
      var gd = guards[g2];
      ctx.save(); ctx.translate(gd.x, gd.y);
      ctx.fillStyle = gd.seen ? '#7a1414' : '#1d2f66';
      ctx.beginPath(); ctx.arc(0, 0, gd.r + 2, 0, 7); ctx.fill();
      ctx.strokeStyle = gd.seen ? '#ff3b30' : '#ffd94d'; ctx.lineWidth = 2.5; ctx.stroke();
      // facing tick + cap
      ctx.rotate(gd.angle);
      ctx.fillStyle = '#ffd94d'; ctx.beginPath(); ctx.moveTo(gd.r + 2, 0); ctx.lineTo(gd.r - 4, -6); ctx.lineTo(gd.r - 4, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = '900 11px "Segoe UI", Arial'; ctx.textAlign = 'center';
      ctx.fillText('GUARD', gd.x, gd.y - gd.r - 8);
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
    zoneLabel(173, 34, 'GALLERY');
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
    // interact prompt above player
    if (state === 'playing' && nearVault() && !loot) {
      ctx.fillStyle = '#ffd94d'; ctx.font = '900 14px "Segoe UI", Arial'; ctx.textAlign = 'center';
      ctx.fillText('E — GRAB THE DIAMOND 💎', player.x, player.y - 30);
    }
    // red edge pulse when alarm high
    if (alarm > 60 && state === 'playing') {
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
    gold: 0, goldTotal: 3, peakAlarm: 0, rating: '',
    lasers: [], lasersOff: false, time: 0
  };
  function syncDebug() {
    window.__heist.state = state; window.__heist.alarm = alarm; window.__heist.loot = loot;
    window.__heist.elapsed = elapsed; window.__heist.camerasOff = systemsOffUntil > time;
    window.__heist.lasersOff = systemsOffUntil > time; window.__heist.time = time;
    window.__heist.gold = gold; window.__heist.peakAlarm = peakAlarm;
    window.__heist.rating = state === 'win' ? endRating().name : '';
    if (player) { window.__heist.player.x = player.x; window.__heist.player.y = player.y; }
    window.__heist.guards = guards ? guards.map(function (g) {
      return { x: Math.round(g.x), y: Math.round(g.y), seen: g.seen, chase: g.chase > 0 };
    }) : [];
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
    { x: 180, y: 415, r: 14, wp: [{ x: 180, y: 415 }, { x: 180, y: 250 }, { x: 340, y: 250 }, { x: 340, y: 415 }], wi: 1, angle: -Math.PI / 2, speed: 68, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0, pauseDur: 0.7 },
    { x: 820, y: 140, r: 14, wp: [{ x: 820, y: 140 }, { x: 770, y: 280 }, { x: 820, y: 460 }, { x: 860, y: 200 }], wi: 1, angle: Math.PI / 2, speed: 84, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0, pauseDur: 1.2 },
    { x: 790, y: 300, r: 14, wp: [{ x: 790, y: 300 }, { x: 860, y: 300 }, { x: 860, y: 400 }, { x: 790, y: 400 }], wi: 1, angle: 0, speed: 76, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0, pauseDur: 0.9 }
  ];
  cameras = [
    { x: 42, y: 42, base: 0.88, sweep: 0.62, speed: 0.7, phase: 0, angle: 0.88, range: 245, seen: false },
    { x: 918, y: 42, base: Math.PI - 0.88, sweep: 0.9, speed: 0.45, phase: 2.4, angle: Math.PI - 0.88, range: 265, seen: false },
    { x: 480, y: 545, base: -Math.PI / 2, sweep: 0.75, speed: 0.55, phase: 1.2, angle: -Math.PI / 2, range: 280, seen: false }
  ];
  goldBars = GOLD_SPOTS.map(function (s) { return { x: s.x, y: s.y, taken: false }; });
  // autostart for screenshots / headless testing: ?autostart=1
  if (/[?&]autostart=1/.test(window.location.search)) { resetGame(); }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (state === 'playing') update(dt);
    else {
      // idle animation behind start/pause/win/lose screens: sweep cameras only
      time += dt;
      for (var i = 0; i < cameras.length; i++) cameras[i].angle = cameras[i].base + Math.sin(time * cameras[i].speed + cameras[i].phase) * cameras[i].sweep;
      if (state === 'start') { /* guards hold still on the start frame for a clean screenshot */ }
    }
    render(); syncDebug();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
