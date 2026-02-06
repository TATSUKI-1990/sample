import { TPSGame } from "./game.js";
import { AudioSystem } from "./audio.js";
import { GameState, LocalNetAdapter } from "./net.js";

const canvas = document.getElementById("gameCanvas");
const startBtn = document.getElementById("startBtn");
const overlay = document.getElementById("overlay");
const overlayTitle = overlay.querySelector("h1");
const overlayText = overlay.querySelector("p");

const ui = {
  hp: document.getElementById("hp"),
  ammo: document.getElementById("ammo"),
  kills: document.getElementById("kills"),
  damage: document.getElementById("damageVignette"),
  hit: document.getElementById("hitMarker"),
  setHUD(hp, ammo, reserve, kills) {
    this.hp.textContent = Math.ceil(hp);
    this.ammo.textContent = `${ammo} / ${reserve}`;
    this.kills.textContent = String(kills);
  },
  setDamage(amount) {
    this.damage.style.opacity = `${Math.min(0.85, amount)}`;
  },
  setHitMarker(active) {
    this.hit.classList.toggle("active", active);
  },
  showOverlay(title, msg) {
    overlayTitle.textContent = title;
    overlayText.textContent = msg;
    overlay.classList.remove("hidden");
  },
};

const game = new TPSGame({
  canvas,
  ui,
  audio: new AudioSystem(),
  netAdapter: new LocalNetAdapter(),
  gameState: new GameState(),
});

function onMouseMove(e) {
  if (document.pointerLockElement !== canvas || game.player.hp <= 0) return;
  game.player.yaw -= e.movementX * 0.0024;
  game.player.pitch = Math.max(-0.8, Math.min(0.85, game.player.pitch - e.movementY * 0.002));
}

document.addEventListener("keydown", (e) => {
  game.keys.add(e.code);
  if (e.code === "KeyR" && game.player.reserve > 0 && game.player.ammo < 30) {
    const need = 30 - game.player.ammo;
    const use = Math.min(need, game.player.reserve);
    game.player.ammo += use;
    game.player.reserve -= use;
  }
});

document.addEventListener("keyup", (e) => game.keys.delete(e.code));

document.addEventListener("mousemove", onMouseMove);

canvas.addEventListener("mousedown", (e) => {
  if (document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
    return;
  }
  if (e.button === 0 && game.player.hp > 0) game.shoot();
});

startBtn.addEventListener("click", () => {
  game.restart();
  overlay.classList.add("hidden");
  canvas.requestPointerLock();
});

window.addEventListener("resize", () => game.resize());
game.resize();
game.frame();
