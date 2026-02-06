import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.js';
import { CONFIG } from './config.js';

export function createPlayer() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1, 5, 8), new THREE.MeshStandardMaterial({ color: 0x2f7bbf }));
  body.castShadow = true;
  group.add(body);
  group.position.set(0, 1.1, 0);
  return {
    mesh: group,
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0.08,
    onGround: false,
    hp: CONFIG.player.hp,
    ammo: CONFIG.player.magSize,
    reserve: CONFIG.player.reserveAmmo,
    kills: 0,
    dead: false,
    fireCooldown: 0,
    reloadTimer: 0,
    bob: 0,
    lastStep: 0,
  };
}

export function createBot(position) {
  const mesh = new THREE.Group();
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.9), new THREE.MeshStandardMaterial({ color: 0xbf4d4d }));
  core.castShadow = true;
  mesh.add(core);
  mesh.position.copy(position);
  const coverTarget = position.clone();
  return {
    mesh,
    hp: CONFIG.bot.hp,
    state: 'patrol',
    patrolTarget: randomPatrol(),
    coverTarget,
    fireCooldown: Math.random() * 0.5,
    alive: true,
    visionAlert: 0,
  };
}

export function randomPatrol() {
  return new THREE.Vector3((Math.random() - 0.5) * 70, 0.9, (Math.random() - 0.5) * 70);
}
