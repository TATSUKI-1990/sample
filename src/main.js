import { TPSGame } from './game.js';

const canvas = document.getElementById('gameCanvas');
const hud = {
  hp: document.getElementById('hp'),
  ammo: document.getElementById('ammo'),
  kills: document.getElementById('kills'),
  hitMarker: document.getElementById('hitMarker'),
  damageVignette: document.getElementById('damageVignette'),
  status: document.getElementById('status'),
  deathScreen: document.getElementById('deathScreen'),
};

const game = new TPSGame(canvas, hud);
game.start();
