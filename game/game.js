/* Midnight Vault — The Aurum Job · Aurum National Bank
   Original top-down 2D heist game. Plain JS, no libraries, no network.
   Canvas 960x600. WASD/arrows move, Shift sneak, E grab/hack, R restart, P/Esc pause, M mute.
*/
(function () {
  'use strict';

  var W = 960, H = 600, WALL = 16;
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');

  var $ = function (id) { return document.getElementById(id); };
  var alarmFill = $('alarm-fill'), alarmNum = $('alarm-num'), lootEl = $('loot'),
      camEl = $('cam-status'), timerEl = $('timer'), objectiveEl = $('objective'),
      toastEl = $('toast'), btnHack = $('btn-hack'), btnGrab = $('btn-grab');

  /* ---------------- level layout (fixed, deterministic) ---------------- */
  var VAULT = { x: 400, y: 200, w: 160, h: 120 };
  var DIAMOND = { x: 480, y: 260 };
  var EXIT = { x: 872, y: 512, w: 56, h: 56 };
  var TERMINAL = { x: 20, y: 262, w: 22, h: 48, cx: 44, cy: 286 };
  var OBSTACLES = [
    VAULT,
    { x: 180, y: 120, w: 140, h: 46 },   // desk top-left
    { x: 640, y: 120, w: 140, h: 46 },   // desk top-right
    { x: 180, y: 434, w: 140, h: 46 },   // desk bottom-left
    { x: 640, y: 434, w: 140, h: 46 },   // desk bottom-right
    { x: 350, y: 120, w: 36, h: 36 },    // pillar top-left
    { x: 574, y: 120, w: 36, h: 36 },    // pillar top-right
    { x: 350, y: 444, w: 36, h: 36 },    // pillar bottom-left
    { x: 574, y: 444, w: 36, h: 36 }     // pillar bottom-right
  ];

  /* ---------------- state ---------------- */
  var state = 'start';           // start | playing | paused | win | lose
  var alarm = 0, loot = false, elapsed = 0, muted = false;
  var camerasOffUntil = -1, seenNow = false, seenBy = '', chaseFlash = 0;
  var toastTimer = 0, tickTimer = 0, time = 0;   // time = deterministic clock (seconds)
  var player, guards, cameras;

  function resetGame() {
    state = 'playing'; alarm = 0; loot = false; elapsed = 0; time = 0;
    camerasOffUntil = -1; seenNow = false; seenBy = ''; toastTimer = 0;
    player = { x: 84, y: 516, r: 14, speed: 175, sneaking: false, face: -Math.PI / 2 };
    guards = [
      { x: 250, y: 370, r: 14, wp: [{ x: 250, y: 370 }, { x: 710, y: 370 }], wi: 1,
        angle: 0, speed: 68, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0 },
      { x: 820, y: 140, r: 14, wp: [{ x: 820, y: 140 }, { x: 820, y: 460 }], wi: 1,
        angle: Math.PI / 2, speed: 62, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0 }
    ];
    cameras = [
      { x: 42, y: 42, base: 0.88, sweep: 0.62, phase: 0, angle: 0.88, range: 245, seen: false },
      { x: 918, y: 42, base: Math.PI - 0.88, sweep: 0.62, phase: 1.7, angle: Math.PI - 0.88, range: 245, seen: false }
    ];
    updateHUD();
    showScreen(null);
    toast('Cross the hall — grab the DIAMOND from the vault!');
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

  /* ---------------- interact ---------------- */
  function nearVault() { return dist(player.x, player.y, DIAMOND.x, DIAMOND.y) < 100; }
  function nearTerminal() { return dist(player.x, player.y, TERMINAL.cx, TERMINAL.cy) < 85; }
  function interact() {
    if (nearVault() && !loot) {
      loot = true; sfx('pickup');
      toast('💎 DIAMOND SECURED! Now reach the green EXIT →');
      objectiveEl.innerHTML = 'Objective: <b>DIAMOND SECURED</b> — escape through the <b style="color:#4dff9d">EXIT</b> (bottom-right)!';
      updateHUD();
    } else if (nearTerminal()) {
      if (camerasOffUntil > time) { toast('Cameras already OFF — ' + Math.ceil(camerasOffUntil - time) + 's left'); return; }
      camerasOffUntil = time + 8; sfx('hack');
      toast('📷 CAMERAS OFF for 8 seconds — MOVE!');
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

    // cameras sweep (deterministic, driven by `time`)
    var camsOff = camerasOffUntil > time;
    for (var i = 0; i < cameras.length; i++) {
      var c = cameras[i];
      c.angle = c.base + Math.sin(time * 0.7 + c.phase) * c.sweep;
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
        if (d < 6) { gd.wi = (gd.wi + 1) % gd.wp.length; gd.pause = 0.7; }
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
        if (gg.chase <= 0) { gg.chase = 2.5; sfx('seen'); }
        gg.chaseX = player.x; gg.chaseY = player.y;
      }
    }
    if (!camsOff) {
      for (var ci = 0; ci < cameras.length; ci++) {
        var cm = cameras[ci];
        if (canSee(cm.x, cm.y, cm.angle, cm.range, 0.48)) {
          cm.seen = true; seenNow = true; if (!seenBy) seenBy = 'CAMERA';
          var cd = dist(cm.x, cm.y, player.x, player.y);
          var cprox = cd < 100 ? 1.2 : (cd > 180 ? 0.7 : 1.0);
          alarm += 17 * speedFactor * cprox * dt;
        }
      }
    }
    if (!seenNow) alarm -= 9 * dt;
    alarm = Math.max(0, Math.min(100, alarm));
    if (seenNow) {
      tickTimer -= dt;
      if (tickTimer <= 0) { sfx('tick'); tickTimer = 0.45; }
      chaseFlash = 0.25;
    } else if (chaseFlash > 0) chaseFlash -= dt;

    // win / lose
    if (loot && player.x + player.r > EXIT.x && player.x - player.r < EXIT.x + EXIT.w &&
        player.y + player.r > EXIT.y && player.y - player.r < EXIT.y + EXIT.h) {
      state = 'win'; sfx('win');
      $('win-stats').textContent = 'Time ' + fmtTime(elapsed) + '  ·  Final alarm ' + Math.round(alarm) + '%  ·  Diamond secured 💎';
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

  function updateHUD() {
    alarmFill.style.width = alarm + '%';
    alarmNum.textContent = Math.round(alarm);
    alarmFill.style.background = alarm < 35 ? 'linear-gradient(90deg,#37d67a,#7be495)'
      : alarm < 70 ? 'linear-gradient(90deg,#ffd94d,#ff9d2e)' : 'linear-gradient(90deg,#ff3b30,#ff7a5c)';
    lootEl.textContent = loot ? '✦ SECURED' : '—';
    lootEl.style.color = loot ? '#4dff9d' : '';
    var camsOff = camerasOffUntil > time;
    if (camsOff) {
      camEl.textContent = 'OFF ' + Math.ceil(camerasOffUntil - time) + 's';
      camEl.style.color = '#8d97ad';
    } else {
      camEl.textContent = 'ONLINE'; camEl.style.color = '#ff5a4d';
    }
    timerEl.textContent = fmtTime(elapsed);
    btnHack.classList.toggle('hidden', !(state === 'playing' && nearTerminal() && !camsOff));
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

  function render() {
    // floor
    ctx.fillStyle = '#0d1734'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(120,150,220,0.10)'; ctx.lineWidth = 1;
    for (var gx = WALL; gx < W; gx += 60) { ctx.beginPath(); ctx.moveTo(gx, WALL); ctx.lineTo(gx, H - WALL); ctx.stroke(); }
    for (var gy = WALL; gy < H; gy += 60) { ctx.beginPath(); ctx.moveTo(WALL, gy); ctx.lineTo(W - WALL, gy); ctx.stroke(); }
    // gold carpet runner down the middle
    ctx.fillStyle = 'rgba(212,175,55,0.10)'; ctx.fillRect(430, WALL, 100, H - 2 * WALL);
    ctx.fillStyle = 'rgba(212,175,55,0.25)'; ctx.fillRect(428, WALL, 2, H - 2 * WALL); ctx.fillRect(530, WALL, 2, H - 2 * WALL);

    // patrol paths (faint dotted)
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.setLineDash([4, 8]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(250, 370); ctx.lineTo(710, 370); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(820, 140); ctx.lineTo(820, 460); ctx.stroke();
    ctx.setLineDash([]);

    // vision cones (under obstacles, so walls block them visually)
    var camsOff = camerasOffUntil > time;
    for (var i = 0; i < guards.length; i++) {
      var g = guards[i];
      drawCone(g.x, g.y, g.angle, 195, 0.56,
        g.seen ? 'rgba(255,60,40,0.34)' : 'rgba(255,214,64,0.26)', g.seen ? '#ff3b30' : 'rgba(255,214,64,0.55)');
    }
    for (var ci = 0; ci < cameras.length; ci++) {
      var cm = cameras[ci];
      if (camsOff) drawCone(cm.x, cm.y, cm.angle, cm.range, 0.48, 'rgba(140,150,170,0.10)', 'rgba(140,150,170,0.35)');
      else drawCone(cm.x, cm.y, cm.angle, cm.range, 0.48,
        cm.seen ? 'rgba(255,60,40,0.30)' : 'rgba(255,80,80,0.20)', cm.seen ? '#ff3b30' : 'rgba(255,120,120,0.6)');
    }

    // exit door
    var exitGlow = loot ? 0.9 : 0.25;
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

    // terminal (wall-mounted, left wall)
    ctx.fillStyle = '#0e2a3a'; rr(TERMINAL.x, TERMINAL.y, TERMINAL.w, TERMINAL.h, 4); ctx.fill();
    ctx.strokeStyle = camsOff ? '#8d97ad' : '#35e0ff'; ctx.lineWidth = 2; rr(TERMINAL.x, TERMINAL.y, TERMINAL.w, TERMINAL.h, 4); ctx.stroke();
    ctx.fillStyle = camsOff ? '#8d97ad' : '#35e0ff'; ctx.font = '900 9px "Segoe UI", Arial'; ctx.textAlign = 'left';
    ctx.fillText('HACK', TERMINAL.x + 26, TERMINAL.cy + 3);
    if (nearTerminal() && state === 'playing') {
      ctx.fillStyle = '#35e0ff'; ctx.font = '900 12px "Segoe UI", Arial';
      ctx.fillText(camsOff ? 'CAMERAS OFF ' + Math.ceil(camerasOffUntil - time) + 's' : 'E — HACK CAMERAS', TERMINAL.x + 52, TERMINAL.cy + 4);
    }

    // desks + pillars
    OBSTACLES.forEach(function (o) {
      if (o === VAULT) return;
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

    // cameras (wall mounts)
    for (var c2 = 0; c2 < cameras.length; c2++) {
      var cam = cameras[c2];
      ctx.fillStyle = '#3a4358'; ctx.beginPath(); ctx.arc(cam.x, cam.y, 11, 0, 7); ctx.fill();
      ctx.strokeStyle = camsOff ? '#8d97ad' : '#ff5a4d'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cam.x, cam.y, 11, 0, 7); ctx.stroke();
      var ex = cam.x + Math.cos(cam.angle) * 16, ey = cam.y + Math.sin(cam.angle) * 16;
      ctx.strokeStyle = '#cdd7ef'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cam.x, cam.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = camsOff ? '#8d97ad' : '#ff3b30';
      ctx.beginPath(); ctx.arc(ex, ey, 4.5, 0, 7); ctx.fill();
      if (!camsOff && cam.seen) { ctx.fillStyle = '#ff3b30'; ctx.font = '900 13px "Segoe UI", Arial'; ctx.fillText('!', ex, ey - 12); }
      ctx.fillStyle = camsOff ? '#8d97ad' : '#ff8a80'; ctx.font = '900 11px "Segoe UI", Arial'; ctx.textAlign = 'center';
      ctx.fillText(camsOff ? 'CAM OFF' : 'CAM', cam.x, cam.y + 26);
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

    // player — thief in black hoodie with gold trim
    ctx.save(); ctx.translate(player.x, player.y);
    if (player.sneaking) { ctx.globalAlpha = 0.85; }
    ctx.shadowColor = '#ffd94d'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#14141c'; ctx.beginPath(); ctx.arc(0, 0, player.r, 0, 7); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#ffd94d'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, 7); ctx.stroke();
    // hood + eyes facing direction
    var fx = Math.cos(player.face), fy = Math.sin(player.face);
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath(); ctx.arc(player.x + fx * 6 - fy * 5, player.y + fy * 6 + fx * 5, 2.2, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(player.x + fx * 6 + fy * 5, player.y + fy * 6 - fx * 5, 2.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '900 11px "Segoe UI", Arial'; ctx.textAlign = 'center';
    ctx.fillText(player.sneaking ? 'THIEF · SNEAKING' : 'THIEF', player.x, player.y - player.r - 8);

    // entrance marker (inside the playfield, just above the bottom wall)
    ctx.fillStyle = '#4dff9d'; ctx.font = '900 11px "Segoe UI", Arial'; ctx.textAlign = 'left';
    ctx.fillText('◀ ENTRANCE', 24, 578);

    // spotted banner
    if (seenNow && state === 'playing') {
      ctx.fillStyle = 'rgba(255,59,48,0.92)'; rr(W / 2 - 90, 22, 180, 30, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '900 16px "Segoe UI", Arial'; ctx.textAlign = 'center';
      ctx.fillText('⚠ SPOTTED — ' + seenBy + '!', W / 2, 43);
    }
    // cameras-off banner
    if (camsOff && state === 'playing') {
      ctx.fillStyle = 'rgba(20,40,80,0.92)'; rr(W / 2 - 110, 56, 220, 26, 8); ctx.fill();
      ctx.fillStyle = '#8fd0ff'; ctx.font = '900 14px "Segoe UI", Arial'; ctx.textAlign = 'center';
      ctx.fillText('📷 CAMERAS OFF — ' + Math.ceil(camerasOffUntil - time) + 's', W / 2, 74);
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
    player: { x: 84, y: 516 }, guards: [], cameras: [], camerasOff: false, elapsed: 0
  };
  function syncDebug() {
    window.__heist.state = state; window.__heist.alarm = alarm; window.__heist.loot = loot;
    window.__heist.elapsed = elapsed; window.__heist.camerasOff = camerasOffUntil > time;
    if (player) { window.__heist.player.x = player.x; window.__heist.player.y = player.y; }
    window.__heist.guards = guards ? guards.map(function (g) {
      return { x: Math.round(g.x), y: Math.round(g.y), seen: g.seen, chase: g.chase > 0 };
    }) : [];
    window.__heist.cameras = cameras ? cameras.map(function (c) {
      return { x: c.x, y: c.y, angle: +c.angle.toFixed(2), seen: c.seen };
    }) : [];
  }

  /* ---------------- main loop ---------------- */
  // idle attract state so the start screen still shows a live room behind it
  player = { x: 84, y: 516, r: 14, speed: 175, sneaking: false, face: -Math.PI / 2 };
  guards = [
    { x: 250, y: 370, r: 14, wp: [{ x: 250, y: 370 }, { x: 710, y: 370 }], wi: 1, angle: 0, speed: 68, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0 },
    { x: 820, y: 140, r: 14, wp: [{ x: 820, y: 140 }, { x: 820, y: 460 }], wi: 1, angle: Math.PI / 2, speed: 62, chase: 0, chaseX: 0, chaseY: 0, seen: false, pause: 0 }
  ];
  cameras = [
    { x: 42, y: 42, base: 0.88, sweep: 0.62, phase: 0, angle: 0.88, range: 245, seen: false },
    { x: 918, y: 42, base: Math.PI - 0.88, sweep: 0.62, phase: 1.7, angle: Math.PI - 0.88, range: 245, seen: false }
  ];
  // autostart for screenshots / headless testing: ?autostart=1
  if (/[?&]autostart=1/.test(window.location.search)) { resetGame(); }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (state === 'playing') update(dt);
    else {
      // idle animation behind start/pause/win/lose screens: sweep cameras only
      time += dt;
      for (var i = 0; i < cameras.length; i++) cameras[i].angle = cameras[i].base + Math.sin(time * 0.7 + cameras[i].phase) * cameras[i].sweep;
      if (state === 'start') { /* guards hold still on the start frame for a clean screenshot */ }
    }
    render(); syncDebug();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
