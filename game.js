const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const timeEl = document.getElementById("time");
const comboEl = document.getElementById("combo");
const stageEl = document.getElementById("stage");
const goalEl = document.getElementById("goal");
const storyTextEl = document.getElementById("storyText");
const startBtn = document.getElementById("startBtn");
const musicBtn = document.getElementById("musicBtn");

const W = canvas.width;
const H = canvas.height;

const player = { x: W / 2 - 34, y: H - 95, w: 68, h: 56, speed: 7.5 };
const keys = new Set();
const items = [];
const particles = [];

const storyByStage = [
  "年に一度の星祭り。屋台通りに現れる影だるまから灯りを守るため、あなたはランタン守りとして招かれた。",
  "光を奪う影が増え始めた。観客席から歓声が上がる中、守りの技を磨こう。",
  "祭り中央広場へ進入。夜空の星屑が味方し、連続キャッチで光を増幅できる。",
  "影の親玉が配下を放つ。冷静に危険物を見抜き、コンボで押し返そう。",
  "最終夜。祭壇の灯りを満たせば勝利。すべてのランタンを輝かせろ！",
];

const stages = [
  { goal: 1200, time: 45, spawnEvery: 28, speed: [2.2, 3.2] },
  { goal: 2200, time: 45, spawnEvery: 24, speed: [2.8, 3.9] },
  { goal: 3600, time: 50, spawnEvery: 21, speed: [3.1, 4.3] },
  { goal: 5200, time: 50, spawnEvery: 18, speed: [3.5, 4.8] },
  { goal: 7200, time: 55, spawnEvery: 16, speed: [3.9, 5.5] },
];

const itemTypes = [
  { name: "goldFish", color: "#ff7396", value: 90, radius: 14, good: true },
  { name: "ramune", color: "#6de2ff", value: 120, radius: 13, good: true },
  { name: "fireFlower", color: "#ffc85e", value: 140, radius: 12, good: true },
  { name: "shadowDoll", color: "#3a3f6f", value: -220, radius: 16, good: false },
];

let stageIndex = 0;
let score = 0;
let combo = 0;
let timeLeft = 0;
let running = false;
let gameState = "idle";
let spawnTick = 0;
let floatTick = 0;
let touchTargetX = null;
let secondTicker = null;

class FestivalBGM {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.isOn = false;
    this.timer = null;
    this.step = 0;
    this.tempo = 148;
    this.lead = [659.25, 783.99, 880, 987.77, 880, 783.99, 659.25, 523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25, 493.88, null];
    this.bass = [164.81, null, 164.81, null, 196, null, 146.83, null];
  }

  ensure() {
    if (this.ctx) return;
    this.ctx = new window.AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.08;
    this.master.connect(this.ctx.destination);
  }

  tone(freq, type, gainAmount, when, duration) {
    if (!freq) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0.001, when);
    gain.gain.exponentialRampToValueAtTime(gainAmount, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(when);
    osc.stop(when + duration);
  }

  schedule() {
    const beat = 60 / this.tempo;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 8; i++) {
      const when = now + i * (beat / 2);
      const leadFreq = this.lead[(this.step + i) % this.lead.length];
      const bassFreq = this.bass[(this.step + i) % this.bass.length];
      this.tone(leadFreq, "triangle", 0.12, when, beat * 0.45);
      this.tone(bassFreq, "square", 0.08, when, beat * 0.42);
    }
    this.step += 8;
  }

  start() {
    this.ensure();
    if (this.ctx.state === "suspended") this.ctx.resume();
    if (this.isOn) return;
    this.isOn = true;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), (60 / this.tempo) * 1000 * 4);
  }

  stop() {
    this.isOn = false;
    clearInterval(this.timer);
  }

  toggle() {
    if (this.isOn) this.stop();
    else this.start();
  }
}

const bgm = new FestivalBGM();

function setStage(index) {
  stageIndex = index;
  const stage = stages[stageIndex];
  timeLeft = stage.time;
  spawnTick = 0;
  combo = 0;
  items.length = 0;
  particles.length = 0;
  storyTextEl.textContent = storyByStage[stageIndex];
  stageEl.textContent = String(stageIndex + 1);
  goalEl.textContent = String(stage.goal);
  timeEl.textContent = String(timeLeft);
  comboEl.textContent = String(combo);
}

function resetRun() {
  score = 0;
  player.x = W / 2 - player.w / 2;
  setStage(0);
  scoreEl.textContent = "0";
  running = true;
  gameState = "playing";
  startTimer();
}

function spawnItem() {
  const type = Math.random() < 0.76 ? itemTypes[Math.floor(Math.random() * 3)] : itemTypes[3];
  const stage = stages[stageIndex];
  items.push({
    ...type,
    x: 30 + Math.random() * (W - 60),
    y: -35,
    vy: stage.speed[0] + Math.random() * (stage.speed[1] - stage.speed[0]),
    sway: Math.random() * Math.PI * 2,
  });
}

function burst(x, y, color) {
  for (let i = 0; i < 11; i++) {
    particles.push({ x, y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, life: 24, color });
  }
}

function update() {
  if (!running) return;
  const left = keys.has("ArrowLeft") || keys.has("a");
  const right = keys.has("ArrowRight") || keys.has("d");
  if (left) player.x -= player.speed;
  if (right) player.x += player.speed;
  if (!left && !right && touchTargetX !== null) {
    const diff = touchTargetX - (player.x + player.w / 2);
    player.x += Math.sign(diff) * Math.min(Math.abs(diff), player.speed);
  }
  player.x = Math.max(0, Math.min(W - player.w, player.x));

  const stage = stages[stageIndex];
  spawnTick++;
  if (spawnTick >= stage.spawnEvery) {
    spawnTick = 0;
    spawnItem();
  }

  items.forEach((item) => {
    item.y += item.vy;
    item.x += Math.sin((floatTick + item.sway) * 0.04) * 0.9;

    const hit =
      item.x > player.x - item.radius &&
      item.x < player.x + player.w + item.radius &&
      item.y + item.radius > player.y &&
      item.y - item.radius < player.y + player.h;

    if (hit) {
      if (item.good) {
        combo += 1;
        score += item.value + combo * 12;
      } else {
        combo = 0;
        score = Math.max(0, score + item.value);
      }
      burst(item.x, item.y, item.color);
      item.done = true;
    }

    if (item.y > H + 40) {
      if (item.good) combo = 0;
      item.done = true;
    }
  });

  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].done) items.splice(i, 1);
  }

  particles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.05;
    p.life -= 1;
  });
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].life <= 0) particles.splice(i, 1);
  }

  scoreEl.textContent = String(score);
  comboEl.textContent = String(combo);
  floatTick++;
}

function drawSceneBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#132b66");
  g.addColorStop(0.5, "#1b3d7e");
  g.addColorStop(1, "#2a1f18");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 50; i++) {
    const x = (i * 67 + floatTick * 0.3) % W;
    const y = (i * 43) % (H * 0.45);
    ctx.fillStyle = `rgba(255,255,255,${0.2 + (i % 4) * 0.15})`;
    ctx.fillRect(x, y, 2, 2);
  }

  for (let i = 0; i < 7; i++) {
    const x = 55 + i * 72;
    const y = 74 + Math.sin((floatTick + i * 13) * 0.04) * 6;
    ctx.fillStyle = i % 2 ? "#ff8b7f" : "#ffd770";
    ctx.beginPath();
    ctx.roundRect(x - 17, y - 22, 34, 44, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(x - 8, y - 16, 4, 30);
    ctx.fillRect(x + 4, y - 16, 4, 30);
  }

  ctx.fillStyle = "#654229";
  ctx.fillRect(0, H - 132, W, 132);
  ctx.fillStyle = "#845938";
  for (let i = 0; i < 18; i++) ctx.fillRect(i * 34, H - 132, 16, 132);
}

function drawPlayer() {
  const x = player.x;
  const y = player.y;
  ctx.fillStyle = "#1f2b4f";
  ctx.fillRect(x + 8, y + 10, player.w - 16, player.h - 4);
  ctx.fillStyle = "#ffd8b7";
  ctx.fillRect(x + 21, y, 26, 18);
  ctx.fillStyle = "#e64f54";
  ctx.fillRect(x + 10, y + 24, player.w - 20, 20);
  ctx.fillStyle = "#f5f3e8";
  ctx.fillRect(x + 14, y + 29, player.w - 28, 9);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.arc(x + player.w / 2, y + 47, 6 + Math.sin(floatTick * 0.2), 0, Math.PI * 2);
  ctx.fill();
}

function drawItem(item) {
  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.52)";
  ctx.beginPath();
  ctx.arc(item.x - 4, item.y - 5, item.radius * 0.32, 0, Math.PI * 2);
  ctx.fill();
}

function drawOverlay(text, subText = "") {
  ctx.fillStyle = "rgba(6,9,20,0.72)";
  ctx.fillRect(60, H / 2 - 82, W - 120, 164);
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.strokeRect(60, H / 2 - 82, W - 120, 164);
  ctx.fillStyle = "#fff3cd";
  ctx.font = "bold 32px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, W / 2, H / 2 - 8);
  if (subText) {
    ctx.font = "20px sans-serif";
    ctx.fillStyle = "#bde4ff";
    ctx.fillText(subText, W / 2, H / 2 + 34);
  }
}

function render() {
  drawSceneBackground();
  items.forEach(drawItem);
  drawPlayer();

  particles.forEach((p) => {
    ctx.globalAlpha = p.life / 24;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 4, 4);
    ctx.globalAlpha = 1;
  });

  if (gameState === "idle") drawOverlay("ミッション開始", "祭りの灯りを守ろう");
  if (gameState === "stageClear") drawOverlay("STAGE CLEAR!", `次はステージ ${stageIndex + 2}`);
  if (gameState === "lost") drawOverlay("MISSION FAILED", "スコア不足…もう一度挑戦！");
  if (gameState === "win") drawOverlay("ALL CLEAR", "祭りの伝説が生まれた！");
}

function evaluateStageEnd() {
  running = false;
  clearInterval(secondTicker);
  const stage = stages[stageIndex];
  if (score >= stage.goal) {
    if (stageIndex === stages.length - 1) {
      gameState = "win";
      startBtn.textContent = "最初からプレイ";
    } else {
      gameState = "stageClear";
      setTimeout(() => {
        setStage(stageIndex + 1);
        running = true;
        gameState = "playing";
        startTimer();
      }, 1800);
    }
  } else {
    gameState = "lost";
    startBtn.textContent = "リトライ";
  }
}

function startTimer() {
  clearInterval(secondTicker);
  secondTicker = setInterval(() => {
    if (!running) return;
    timeLeft -= 1;
    timeEl.textContent = String(timeLeft);
    if (timeLeft <= 0) evaluateStageEnd();
  }, 1000);
}

function gameLoop() {
  update();
  render();
  requestAnimationFrame(gameLoop);
}

startBtn.addEventListener("click", () => {
  resetRun();
  startBtn.textContent = "再スタート";
  if (!bgm.isOn) bgm.start();
});

musicBtn.addEventListener("click", () => {
  bgm.toggle();
  musicBtn.textContent = bgm.isOn ? "BGM OFF" : "BGM ON";
});

window.addEventListener("keydown", (e) => keys.add(e.key));
window.addEventListener("keyup", (e) => keys.delete(e.key));
canvas.addEventListener("pointerdown", (e) => {
  const rect = canvas.getBoundingClientRect();
  touchTargetX = ((e.clientX - rect.left) / rect.width) * W;
});
canvas.addEventListener("pointermove", (e) => {
  if (e.buttons !== 1) return;
  const rect = canvas.getBoundingClientRect();
  touchTargetX = ((e.clientX - rect.left) / rect.width) * W;
});
canvas.addEventListener("pointerup", () => (touchTargetX = null));

setStage(0);
render();
gameLoop();
