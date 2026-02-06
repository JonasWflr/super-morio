const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });

const ui = {
  overlay: document.getElementById("overlay"),
  btnStart: document.getElementById("btnStart"),
  btnMute: document.getElementById("btnMute"),
  score: document.getElementById("score"),
  best: document.getElementById("best"),
  speed: document.getElementById("speed"),
};

const DPR = Math.max(1, Math.floor(window.devicePixelRatio || 1));
const BASE_W = canvas.width;
const BASE_H = canvas.height;

canvas.width = BASE_W * DPR;
canvas.height = BASE_H * DPR;
canvas.style.width = `${BASE_W}px`;
canvas.style.height = `${BASE_H}px`;
ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const STORAGE_KEY = "super-morio.bestScore.v1";
const getBestScore = () => Number(localStorage.getItem(STORAGE_KEY) || "0");
const setBestScore = (v) => localStorage.setItem(STORAGE_KEY, String(v | 0));

let audioEnabled = false;
let audioCtx = null;

function beep(freq = 440, durationMs = 70, type = "square", gain = 0.06) {
  if (!audioEnabled) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000);
}

function beepChord() {
  beep(880, 80, "square", 0.05);
  setTimeout(() => beep(1174, 80, "square", 0.04), 40);
}

function beepCrash() {
  beep(180, 140, "sawtooth", 0.07);
  setTimeout(() => beep(120, 160, "sawtooth", 0.06), 70);
}

const keys = new Set();
window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (["Space", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));

canvas.addEventListener("pointerdown", () => {
  if (state.mode === "title") startGame();
  state.input.jumpQueued = true;
});

ui.btnStart.addEventListener("click", () => startGame());
ui.btnMute.addEventListener("click", async () => {
  audioEnabled = !audioEnabled;
  ui.btnMute.setAttribute("aria-pressed", audioEnabled ? "true" : "false");
  ui.btnMute.textContent = `Sound: ${audioEnabled ? "On" : "Off"}`;
  if (audioEnabled && audioCtx && audioCtx.state === "suspended") await audioCtx.resume();
  if (audioEnabled) beepChord();
});

const palette = {
  sky0: "#06102a",
  sky1: "#0c275f",
  moon: "#d8f0ff",
  snow0: "#cfe8ff",
  snow1: "#eaf6ff",
  snow2: "#9dd7ff",
  pine0: "#1c6b43",
  pine1: "#0f3f29",
  rock0: "#68819a",
  rock1: "#3b4f64",
  flag: "#ff4d7d",
  accent2: "#9bffcb",
};

const state = {
  mode: "title", // title | running | crashed
  t: 0,
  score: 0,
  best: getBestScore(),
  scrollX: 0,
  speed: 120, // px/s
  speedMult: 1,
  input: {
    jumpQueued: false,
  },
  player: {
    x: 90,
    y: 0,
    vy: 0,
    jumpPower: 340,
    onGround: true,
    crashFlash: 0,
  },
  world: {
    obstacles: [],
    pickups: [],
    particles: [],
    nextSpawnX: 0,
  },
};

ui.best.textContent = String(state.best | 0);

function groundY(x, t) {
  return (
    150 +
    10 * Math.sin((x + t * 18) * 0.012) +
    6 * Math.sin((x - t * 9) * 0.02) +
    3 * Math.sin((x + 300) * 0.045)
  );
}

function groundNormal(x, t) {
  const y0 = groundY(x, t);
  const y1 = groundY(x + 1, t);
  const dx = 1;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  return { nx: -dy / len, ny: dx / len };
}

function resetRun() {
  state.t = 0;
  state.score = 0;
  state.scrollX = 0;
  state.speed = 120;
  state.speedMult = 1;
  state.player.y = groundY(state.player.x, 0);
  state.player.vy = 0;
  state.player.onGround = true;
  state.player.crashFlash = 0;
  state.world.obstacles = [];
  state.world.pickups = [];
  state.world.particles = [];
  state.input.jumpQueued = false;

  state.world.nextSpawnX = state.scrollX + BASE_W + 260;

  for (let i = 0; i < 5; i++) {
    spawnAt(state.world.nextSpawnX);
    state.world.nextSpawnX += 180;
  }
}

function startGame() {
  resetRun();
  state.mode = "running";
  ui.overlay.style.display = "none";
  ui.overlay.querySelector("h1").textContent = "Super Morio";
  ui.overlay.querySelector(".muted").textContent = "A tiny snowy jump-and-run on skis.";
  ui.btnStart.textContent = "Start";
  beepChord();
}

function crash() {
  state.mode = "crashed";
  state.player.crashFlash = 1;
  ui.overlay.style.display = "grid";
  ui.overlay.querySelector("h1").textContent = "Crash!";
  ui.overlay.querySelector(".muted").textContent = "Press R to try again.";
  ui.btnStart.textContent = "Restart";
  beepCrash();
}

function spawnAt(x) {
  const r = Math.random();

  if (r < 0.45) {
    state.world.pickups.push({
      kind: "flag",
      x,
      y: groundY(x, state.t) - rand(22, 34),
      taken: false,
      bob: rand(0, Math.PI * 2),
    });
    return;
  }

  if (r < 0.75) {
    state.world.obstacles.push({
      kind: "tree",
      x,
      y: groundY(x, state.t),
      w: rand(18, 26),
      h: rand(34, 46),
    });
    return;
  }

  state.world.obstacles.push({
    kind: "rock",
    x,
    y: groundY(x, state.t),
    w: rand(16, 26),
    h: rand(10, 18),
  });
}

function emitPowder(x, y, n = 10) {
  for (let i = 0; i < n; i++) {
    state.world.particles.push({
      x: x + rand(-4, 4),
      y: y + rand(-3, 3),
      vx: rand(-25, -120),
      vy: rand(-30, 40),
      life: rand(0.25, 0.6),
    });
  }
}

function update(dt) {
  state.t += dt;

  if (state.mode === "title") {
    state.scrollX += dt * state.speed * 0.25;
    if (keys.has("Space") || keys.has("Enter")) startGame();
    return;
  }

  if (state.mode === "crashed") {
    if (keys.has("KeyR")) startGame();
    return;
  }

  if (keys.has("ArrowRight")) state.speedMult = clamp(state.speedMult + dt * 0.6, 0.8, 1.65);
  if (keys.has("ArrowLeft")) state.speedMult = clamp(state.speedMult - dt * 0.7, 0.7, 1.65);
  ui.speed.textContent = `${state.speedMult.toFixed(1)}×`;

  state.speed = 120 + Math.min(220, state.t * 3.4);
  const scrollSpeed = state.speed * state.speedMult;
  state.scrollX += dt * scrollSpeed;
  state.score += dt * (10 + state.speed * 0.03);

  const jumpPressed = keys.has("Space") || keys.has("ArrowUp");
  if (jumpPressed) state.input.jumpQueued = true;

  const px = state.scrollX + state.player.x;
  const gY = groundY(px, state.t);

  if (state.player.onGround) {
    state.player.y = gY;
    state.player.vy = 0;
    if (state.input.jumpQueued) {
      const n = groundNormal(px, state.t);
      state.player.vy = -state.player.jumpPower * (0.92 + 0.08 * n.ny);
      state.player.onGround = false;
      state.input.jumpQueued = false;
      emitPowder(state.player.x, state.player.y - 4, 12);
      beep(660, 55, "square", 0.045);
    } else {
      state.input.jumpQueued = false;
    }
  } else {
    state.player.vy += 920 * dt;
    state.player.y += state.player.vy * dt;
    if (state.player.y >= gY) {
      state.player.y = gY;
      state.player.onGround = true;
      emitPowder(state.player.x, state.player.y - 2, 9);
      beep(260, 40, "triangle", 0.03);
    }
  }

  if (!state.world.nextSpawnX) state.world.nextSpawnX = state.scrollX + BASE_W + 260;
  while (state.world.nextSpawnX < state.scrollX + BASE_W + 850) {
    spawnAt(state.world.nextSpawnX);
    state.world.nextSpawnX += rand(140, 260);
  }

  const left = state.scrollX - 80;
  state.world.obstacles = state.world.obstacles.filter((o) => o.x > left);
  state.world.pickups = state.world.pickups.filter((p) => p.x > left && !p.taken);

  for (const p of state.world.pickups) {
    const x = p.x - state.scrollX;
    const y = p.y;
    const dx = Math.abs(x - state.player.x);
    const dy = Math.abs(y - (state.player.y - 18));
    if (dx < 16 && dy < 18) {
      p.taken = true;
      state.score += 35;
      emitPowder(x, y, 16);
      beep(1046, 45, "square", 0.05);
    }
  }

  const playerHitY = state.player.y - 16;
  for (const o of state.world.obstacles) {
    const x = o.x - state.scrollX;
    if (x < state.player.x - 10 || x > state.player.x + 24) continue;
    const top = o.y - o.h;
    const clearance = state.player.onGround ? 0 : 12;
    if (playerHitY + clearance > top) {
      crash();
      return;
    }
  }

  for (const s of state.world.particles) {
    s.life -= dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= 0.98;
    s.vy += 400 * dt;
  }
  state.world.particles = state.world.particles.filter((s) => s.life > 0);

  const scoreInt = state.score | 0;
  ui.score.textContent = String(scoreInt);
  if (scoreInt > state.best) {
    state.best = scoreInt;
    setBestScore(scoreInt);
    ui.best.textContent = String(scoreInt);
  }
}

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, BASE_H);
  g.addColorStop(0, palette.sky1);
  g.addColorStop(1, palette.sky0);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, BASE_W, BASE_H);

  ctx.fillStyle = "#d8f0ff";
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(320, 48, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(255,255,255,0.8)";
  const starSeed = Math.floor(state.scrollX * 0.03);
  for (let i = 0; i < 42; i++) {
    const x = (i * 71 + starSeed * 13) % 420;
    const y = (i * 29 + starSeed * 7) % 110;
    const a = 0.25 + (0.55 * ((i * 17 + starSeed) % 10)) / 10;
    ctx.globalAlpha = a;
    ctx.fillRect(x - 18, y + 6, 1, 1);
  }
  ctx.globalAlpha = 1;
}

function drawMountains() {
  const base = 120;
  const par = state.scrollX * 0.18;
  ctx.fillStyle = "rgba(170, 205, 240, 0.22)";
  ctx.beginPath();
  ctx.moveTo(0, base);
  for (let x = 0; x <= BASE_W; x += 16) {
    const h = 20 + 18 * Math.sin((x + par) * 0.015) + 10 * Math.sin((x + par) * 0.03);
    ctx.lineTo(x, base - h);
  }
  ctx.lineTo(BASE_W, BASE_H);
  ctx.lineTo(0, BASE_H);
  ctx.closePath();
  ctx.fill();
}

function drawSnow() {
  const t = state.t;
  const g = ctx.createLinearGradient(0, 130, 0, BASE_H);
  g.addColorStop(0, palette.snow2);
  g.addColorStop(0.4, palette.snow0);
  g.addColorStop(1, palette.snow1);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, BASE_H);

  for (let x = 0; x <= BASE_W; x += 4) {
    const wx = state.scrollX + x;
    const y = groundY(wx, t);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(BASE_W, BASE_H);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  for (let lane = 0; lane < 2; lane++) {
    ctx.beginPath();
    for (let x = 0; x <= BASE_W; x += 6) {
      const wx = state.scrollX + x;
      const y = groundY(wx, t) + 6 + lane * 4 + 1.5 * Math.sin((wx + lane * 60) * 0.03);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawTree(x, baseY, w, h) {
  ctx.fillStyle = palette.pine1;
  ctx.fillRect(x + w * 0.44, baseY - h * 0.2, w * 0.12, h * 0.2);

  ctx.fillStyle = palette.pine0;
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const ty = baseY - h * (0.25 + t * 0.24);
    const tw = w * (0.95 - t * 0.22);
    const th = h * 0.28;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, ty - th);
    ctx.lineTo(x + w * 0.5 - tw * 0.5, ty);
    ctx.lineTo(x + w * 0.5 + tw * 0.5, ty);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillRect(x + w * 0.15, baseY - h * 0.62, w * 0.25, 3);
  ctx.fillRect(x + w * 0.52, baseY - h * 0.46, w * 0.28, 3);
}

function drawRock(x, baseY, w, h) {
  ctx.fillStyle = palette.rock1;
  ctx.beginPath();
  ctx.roundRect(x, baseY - h, w, h, 4);
  ctx.fill();
  ctx.fillStyle = palette.rock0;
  ctx.fillRect(x + 2, baseY - h + 2, w * 0.55, h * 0.45);
}

function drawFlag(x, y, bobPhase) {
  const bob = 2.2 * Math.sin(state.t * 5 + bobPhase);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + 18 + bob);
  ctx.lineTo(x, y - 2 + bob);
  ctx.stroke();

  ctx.fillStyle = palette.flag;
  ctx.beginPath();
  ctx.moveTo(x, y - 2 + bob);
  ctx.lineTo(x + 12, y + 2 + bob);
  ctx.lineTo(x, y + 6 + bob);
  ctx.closePath();
  ctx.fill();
}

function drawPlayer() {
  const x = state.player.x;
  const y = state.player.y;
  const lean = clamp(state.player.vy * 0.002, -0.45, 0.35);
  const arm = 5 * Math.sin(state.t * 10);

  ctx.save();
  ctx.translate(x, y - 16);
  ctx.rotate(lean);

  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-16, 18);
  ctx.lineTo(16, 22);
  ctx.stroke();
  ctx.strokeStyle = palette.accent2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-16, 17);
  ctx.lineTo(16, 21);
  ctx.stroke();

  ctx.fillStyle = "#ffe6cc";
  ctx.beginPath();
  ctx.arc(0, -6, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ff3b5c";
  ctx.fillRect(-5, 0, 10, 14);
  ctx.fillStyle = "#0b1930";
  ctx.fillRect(-5, 12, 10, 8);

  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, 8);
  ctx.lineTo(-18, 18 + arm);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(8, 8);
  ctx.lineTo(20, 20 - arm);
  ctx.stroke();

  ctx.restore();
}

function drawParticles() {
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  for (const s of state.world.particles) {
    const a = clamp(s.life * 2.2, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillRect(s.x, s.y, 2, 2);
  }
  ctx.globalAlpha = 1;
}

function render() {
  drawSky();
  drawMountains();
  drawSnow();

  const t = state.t;
  for (const o of state.world.obstacles) {
    const x = o.x - state.scrollX;
    const y = groundY(o.x, t);
    if (o.kind === "tree") drawTree(x - o.w / 2, y, o.w, o.h);
    else drawRock(x - o.w / 2, y, o.w, o.h);
  }

  for (const p of state.world.pickups) {
    if (p.taken) continue;
    const x = p.x - state.scrollX;
    drawFlag(x, p.y, p.bob);
  }

  drawPlayer();
  drawParticles();

  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(0, 0, BASE_W, BASE_H);

  if (state.player.crashFlash > 0) {
    ctx.globalAlpha = state.player.crashFlash;
    ctx.fillStyle = "rgba(255,70,120,0.25)";
    ctx.fillRect(0, 0, BASE_W, BASE_H);
    ctx.globalAlpha = 1;
    state.player.crashFlash = Math.max(0, state.player.crashFlash - 0.9 * (1 / 60));
  }

  if (state.mode === "title") {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(10, 164, 200, 42);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctx.fillText("Tap / Press Space to start", 18, 186);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("Jump obstacles • Grab flags", 18, 202);
  }
}

let last = performance.now();
function loop(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;

  update(dt);
  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
