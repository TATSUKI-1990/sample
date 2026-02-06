import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.js';
import { CONFIG } from './config.js';
import { GameState, LocalAdapter } from './net.js';
import { InputController } from './input.js';
import { AudioSystem } from './audio.js';
import { FXSystem } from './effects.js';
import { createBot, createPlayer, randomPatrol } from './entities.js';

export class TPSGame {
  constructor(canvas, hud) {
    this.canvas = canvas;
    this.hud = hud;
    this.state = new GameState();
    this.net = new LocalAdapter(this.state);
    this.input = new InputController(canvas);
    this.audio = new AudioSystem();
    this.clock = new THREE.Clock();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7ea8d6);
    this.scene.fog = new THREE.Fog(0x7ea8d6, 20, 150);

    this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 250);
    this.effects = new FXSystem(this.scene);

    this.player = createPlayer();
    this.scene.add(this.player.mesh);
    this.bots = [];
    this.obstacles = [];

    this.raycaster = new THREE.Raycaster();
    this.tmpVec = new THREE.Vector3();
    this.hitMarkerTimer = 0;
    this.damageVignette = 0;

    this.#buildWorld();
    this.#spawnBots(CONFIG.maxBots);
    this.#bindResize();
  }

  #buildWorld() {
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x31411a, 0.8);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3db, 1.3);
    sun.position.set(14, 30, 8);
    sun.castShadow = true;
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0x688a4f, roughness: 0.92 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const coverMat = new THREE.MeshStandardMaterial({ color: 0x6f7883 });
    const houseMat = new THREE.MeshStandardMaterial({ color: 0x8e9cb1 });

    for (let i = 0; i < 18; i++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(2 + Math.random() * 4, 1.6, 2 + Math.random() * 4), coverMat);
      box.position.set((Math.random() - 0.5) * 80, 0.8, (Math.random() - 0.5) * 80);
      box.castShadow = true;
      box.receiveShadow = true;
      this.scene.add(box);
      this.obstacles.push(box);
    }

    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(7, 5, 7), houseMat);
      b.position.set(-34 + i * 16, 2.5, -24 + (i % 2) * 24);
      b.castShadow = true;
      b.receiveShadow = true;
      this.scene.add(b);
      this.obstacles.push(b);
    }
  }

  #spawnBots(n) {
    for (let i = 0; i < n; i++) {
      const bot = createBot(new THREE.Vector3((Math.random() - 0.5) * 60, 0.9, (Math.random() - 0.5) * 60));
      this.bots.push(bot);
      this.scene.add(bot.mesh);
    }
  }

  #bindResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  updatePlayer(dt) {
    const p = this.player;
    if (p.dead) return;

    const look = this.input.consumeLookDelta();
    p.yaw -= look.x * CONFIG.mouseSensitivity;
    p.pitch = THREE.MathUtils.clamp(p.pitch - look.y * CONFIG.mouseSensitivity, -0.85, 0.95);

    const axis = this.input.axis();
    const speed = this.input.crouch ? CONFIG.player.crouchSpeed : this.input.sprint ? CONFIG.player.sprintSpeed : CONFIG.player.walkSpeed;

    const forward = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const move = new THREE.Vector3();
    move.addScaledVector(forward, axis.y);
    move.addScaledVector(right, axis.x);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt);
      p.mesh.position.add(move);
      p.bob += dt * (this.input.sprint ? 15 : 10);
      if (p.onGround && p.bob - p.lastStep > 0.55) {
        p.lastStep = p.bob;
        this.audio.step();
      }
    }

    if (this.input.jump && p.onGround && !this.input.crouch) {
      p.velocity.y = CONFIG.player.jumpVelocity;
      p.onGround = false;
    }

    p.velocity.y -= CONFIG.gravity * dt;
    p.mesh.position.y += p.velocity.y * dt;
    const targetHeight = this.input.crouch ? 0.8 : 1.1;
    if (p.mesh.position.y <= targetHeight) {
      p.mesh.position.y = targetHeight;
      p.velocity.y = 0;
      p.onGround = true;
    }

    p.mesh.position.x = THREE.MathUtils.clamp(p.mesh.position.x, -95, 95);
    p.mesh.position.z = THREE.MathUtils.clamp(p.mesh.position.z, -95, 95);

    p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    if (p.reloadTimer > 0) {
      p.reloadTimer -= dt;
      if (p.reloadTimer <= 0) {
        const needed = CONFIG.player.magSize - p.ammo;
        const take = Math.min(needed, p.reserve);
        p.ammo += take;
        p.reserve -= take;
      }
    }

    const actions = this.input.frameActions();
    if (actions.reload && p.reloadTimer <= 0 && p.ammo < CONFIG.player.magSize && p.reserve > 0) {
      p.reloadTimer = CONFIG.player.reloadTime;
    }
    if (this.input.fire && p.fireCooldown <= 0 && p.reloadTimer <= 0 && p.ammo > 0) {
      this.playerShoot(forward);
    }
  }

  playerShoot(forwardDir) {
    const p = this.player;
    p.fireCooldown = CONFIG.player.fireRate;
    p.ammo -= 1;
    this.audio.shot();

    const spreadX = (Math.random() - 0.5) * CONFIG.player.spread;
    const spreadY = (Math.random() - 0.5) * CONFIG.player.spread;
    this.tmpVec.copy(forwardDir).add(new THREE.Vector3(spreadX, spreadY, 0)).normalize();

    const muzzlePos = p.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0));
    this.effects.muzzle(muzzlePos);

    this.raycaster.set(muzzlePos, this.tmpVec);
    this.raycaster.far = CONFIG.player.range;
    const targets = this.bots.filter((b) => b.alive).map((b) => b.mesh);
    const hits = this.raycaster.intersectObjects(targets, true);

    if (hits.length > 0) {
      const mesh = hits[0].object.parent;
      const bot = this.bots.find((b) => b.mesh === mesh);
      if (bot) {
        bot.hp -= CONFIG.player.damage;
        bot.visionAlert = 4;
        this.effects.spawnSpark(hits[0].point, 0xff5533);
        this.showHitMarker();
        this.audio.hit();
        if (bot.hp <= 0) {
          bot.alive = false;
          bot.mesh.visible = false;
          p.kills += 1;
          setTimeout(() => {
            bot.hp = CONFIG.bot.hp;
            bot.alive = true;
            bot.mesh.visible = true;
            bot.mesh.position.copy(randomPatrol());
          }, 2500);
        }
      }
    } else {
      const sceneryHits = this.raycaster.intersectObjects(this.obstacles, false);
      if (sceneryHits.length > 0) this.effects.spawnSpark(sceneryHits[0].point, 0xffdd88);
    }

    p.pitch += 0.02;
  }

  updateBots(dt) {
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
      bot.visionAlert = Math.max(0, bot.visionAlert - dt);

      const toPlayer = this.player.mesh.position.clone().sub(bot.mesh.position);
      const dist = toPlayer.length();
      const seesPlayer = dist < CONFIG.bot.visionRange || bot.visionAlert > 0;

      if (!seesPlayer) {
        bot.state = 'patrol';
        if (bot.mesh.position.distanceTo(bot.patrolTarget) < 1.5) bot.patrolTarget = randomPatrol();
      } else if (dist < 17 && this.#hasLineOfSight(bot.mesh.position, this.player.mesh.position)) {
        bot.state = 'attack';
      } else {
        bot.state = 'cover';
        if (bot.mesh.position.distanceTo(bot.coverTarget) < 1.5) {
          bot.coverTarget = this.#nearestCoverAwayFromPlayer(bot.mesh.position);
        }
      }

      const target = bot.state === 'patrol' ? bot.patrolTarget : bot.state === 'cover' ? bot.coverTarget : bot.mesh.position;
      if (bot.state !== 'attack') {
        const dir = target.clone().sub(bot.mesh.position);
        if (dir.lengthSq() > 0.1) {
          dir.normalize();
          bot.mesh.position.addScaledVector(dir, CONFIG.bot.moveSpeed * dt);
          bot.mesh.position.y = 0.9;
        }
      }

      if (bot.state === 'attack' && bot.fireCooldown <= 0) {
        bot.fireCooldown = CONFIG.bot.fireRate + Math.random() * 0.4;
        this.botShoot(bot);
      }
    }
  }

  botShoot(bot) {
    const origin = bot.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0));
    const dir = this.player.mesh.position.clone().add(new THREE.Vector3(0, 0.6, 0)).sub(origin).normalize();
    const spread = (Math.random() - 0.5) * 0.06;
    dir.x += spread;
    dir.z -= spread;

    this.raycaster.set(origin, dir.normalize());
    this.raycaster.far = 60;
    const hit = this.raycaster.intersectObject(this.player.mesh, true);
    this.effects.muzzle(origin);

    if (hit.length > 0 && !this.player.dead) {
      this.player.hp = Math.max(0, this.player.hp - CONFIG.bot.damage);
      this.damageVignette = Math.min(1, this.damageVignette + 0.4);
      this.effects.hitShake(0.24);
      this.audio.hurt();
      if (this.player.hp <= 0) {
        this.player.dead = true;
      }
    }
  }

  #nearestCoverAwayFromPlayer(from) {
    let best = from.clone();
    let bestScore = -Infinity;
    for (const ob of this.obstacles) {
      const v = ob.position.clone();
      const score = v.distanceTo(this.player.mesh.position) - v.distanceTo(from) * 0.35;
      if (score > bestScore) {
        best = v;
        bestScore = score;
      }
    }
    return best.clone().setY(0.9);
  }

  #hasLineOfSight(from, to) {
    const dir = to.clone().sub(from).normalize();
    this.raycaster.set(from.clone().setY(1.0), dir);
    this.raycaster.far = from.distanceTo(to);
    const blocks = this.raycaster.intersectObjects(this.obstacles, false);
    return blocks.length === 0;
  }

  updateCamera(dt) {
    const p = this.player;
    const shoulderOffset = new THREE.Vector3(0.62, this.input.crouch ? 1.45 : 1.72, -3.3);
    shoulderOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);

    const bobY = Math.sin(p.bob) * (this.input.crouch ? 0.015 : 0.03);
    const shake = this.effects.shake;
    const shakeOffset = new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake + bobY, (Math.random() - 0.5) * shake);

    const desired = p.mesh.position.clone().add(shoulderOffset).add(shakeOffset);
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 14));

    const lookTarget = p.mesh.position.clone().add(new THREE.Vector3(
      Math.sin(p.yaw) * Math.cos(p.pitch),
      1.35 + Math.sin(p.pitch),
      Math.cos(p.yaw) * Math.cos(p.pitch)
    ));
    this.camera.lookAt(lookTarget);
  }

  showHitMarker() {
    this.hitMarkerTimer = 0.12;
    this.hud.hitMarker.style.opacity = '1';
    this.hud.hitMarker.style.transform = 'translate(-50%, -50%) scale(1)';
  }

  updateHUD(dt) {
    this.hud.hp.textContent = String(Math.round(this.player.hp));
    this.hud.ammo.textContent = `${this.player.ammo} / ${this.player.reserve}`;
    this.hud.kills.textContent = String(this.player.kills);

    this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - dt);
    if (this.hitMarkerTimer <= 0) {
      this.hud.hitMarker.style.opacity = '0';
      this.hud.hitMarker.style.transform = 'translate(-50%, -50%) scale(0.6)';
    }

    this.damageVignette = Math.max(0, this.damageVignette - dt * 1.5);
    this.hud.damageVignette.style.opacity = `${this.damageVignette}`;

    if (this.player.dead) {
      this.hud.deathScreen.classList.remove('hidden');
      this.hud.status.textContent = 'R でリスタート';
    } else {
      this.hud.deathScreen.classList.add('hidden');
      this.hud.status.textContent = this.player.reloadTimer > 0 ? 'Reloading...' : 'Click to lock pointer / Left click fire';
    }
  }

  restart() {
    this.player.hp = CONFIG.player.hp;
    this.player.dead = false;
    this.player.ammo = CONFIG.player.magSize;
    this.player.reserve = CONFIG.player.reserveAmmo;
    this.player.kills = 0;
    this.player.mesh.position.set(0, 1.1, 0);
    for (const bot of this.bots) {
      bot.hp = CONFIG.bot.hp;
      bot.alive = true;
      bot.mesh.visible = true;
      bot.mesh.position.copy(randomPatrol());
      bot.state = 'patrol';
    }
  }

  loop = () => {
    const dt = Math.min(0.033, this.clock.getDelta());
    if (this.player.dead) {
      if (this.input.frameActions().restart) this.restart();
    } else {
      this.updatePlayer(dt);
      this.updateBots(dt);
      this.updateCamera(dt);
      this.effects.update(dt);
    }

    this.updateHUD(dt);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  };

  start() {
    this.clock.start();
    this.loop();
  }
}
