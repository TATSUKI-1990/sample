import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";

const UP = new THREE.Vector3(0, 1, 0);

export class TPSGame {
  constructor({ canvas, ui, audio, netAdapter, gameState }) {
    this.canvas = canvas;
    this.ui = ui;
    this.audio = audio;
    this.netAdapter = netAdapter;
    this.gameState = gameState;

    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x86a8c2);
    this.scene.fog = new THREE.Fog(0x86a8c2, 30, 180);

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 300);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.player = {
      pos: new THREE.Vector3(0, 1.4, 0), velY: 0, yaw: 0, pitch: 0.1,
      hp: 100, ammo: 30, reserve: 120, kills: 0, grounded: true,
      sprint: false, crouch: false, recoil: 0,
    };

    this.keys = new Set();
    this.bots = [];
    this.effects = [];
    this.coverPoints = [];
    this.damageFlash = 0;
    this.hitMarkerTimer = 0;
    this.stepAccumulator = 0;

    this.tempV = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();

    this.bootstrapWorld();
  }

  bootstrapWorld() {
    this.scene.add(new THREE.HemisphereLight(0xd7ecff, 0x26314c, 0.7));

    const sun = new THREE.DirectionalLight(0xfff1d0, 1.15);
    sun.position.set(25, 50, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 260, 40, 40),
      new THREE.MeshStandardMaterial({ color: 0x6d8f55, roughness: 0.92 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x5e6775, roughness: 0.75 });

    for (let i = 0; i < 30; i++) {
      const x = (Math.random() - 0.5) * 170;
      const z = (Math.random() - 0.5) * 170;
      const w = 3 + Math.random() * 8;
      const h = 2 + Math.random() * 6;
      const d = 3 + Math.random() * 8;
      const m = new THREE.Mesh(boxGeo, crateMat);
      m.scale.set(w, h, d);
      m.position.set(x, h / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
      this.coverPoints.push(m.position.clone().add(new THREE.Vector3(w * 0.7, 0, d * 0.7)));
    }

    const towerMat = new THREE.MeshStandardMaterial({ color: 0x6b7a86, metalness: 0.1, roughness: 0.7 });
    for (const p of [[-28, 0, -35], [38, 0, 32], [0, 0, 48]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(14, 12, 14), towerMat);
      b.position.set(p[0], 6, p[2]);
      b.castShadow = true;
      b.receiveShadow = true;
      this.scene.add(b);
    }

    for (let i = 0; i < 6; i++) this.spawnBot();
  }

  spawnBot() {
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.6, 1.2, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0xc95757, roughness: 0.5 }),
    );
    mesh.castShadow = true;
    mesh.position.set((Math.random() - 0.5) * 90, 1.2, (Math.random() - 0.5) * 90);
    this.scene.add(mesh);

    this.bots.push({
      mesh,
      hp: 100,
      state: "patrol",
      patrolTarget: mesh.position.clone().add(new THREE.Vector3(5, 0, -5)),
      shootCooldown: 0.4 + Math.random() * 0.4,
      think: 0,
      respawn: 0,
    });
  }

  setInput(handlers) {
    this.input = handlers;
  }

  restart() {
    this.player.hp = 100;
    this.player.ammo = 30;
    this.player.reserve = 120;
    this.player.kills = 0;
    this.player.pos.set(0, 1.4, 0);
    for (const bot of this.bots) {
      bot.hp = 100;
      bot.mesh.visible = true;
      bot.mesh.position.set((Math.random() - 0.5) * 90, 1.2, (Math.random() - 0.5) * 90);
      bot.state = "patrol";
      bot.respawn = 0;
    }
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  applyDamage(amount) {
    this.player.hp = Math.max(0, this.player.hp - amount);
    this.damageFlash = 1;
    if (this.player.hp <= 0) this.ui.showOverlay("MISSION FAILED", "Press START to restart");
  }

  shoot() {
    if (this.player.ammo <= 0) return;
    this.player.ammo -= 1;
    this.player.recoil += 0.07;
    this.audio.shoot();

    const spread = this.player.crouch ? 0.005 : 0.012;
    this.tempV.set(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
      -1,
    ).normalize();
    this.tempV.applyAxisAngle(UP, this.player.yaw);

    const origin = this.player.pos.clone().add(new THREE.Vector3(0, 0.55, 0));
    this.raycaster.set(origin, this.tempV);
    const targets = this.bots.filter((b) => b.mesh.visible).map((b) => b.mesh);
    const hit = this.raycaster.intersectObjects(targets, false)[0];

    this.effects.push({ type: "muzzle", t: 0.06, pos: origin.clone().add(this.tempV.clone().multiplyScalar(0.8)) });
    this.effects.push({ type: "tracer", t: 0.08, from: origin.clone(), to: origin.clone().add(this.tempV.clone().multiplyScalar(70)) });

    if (hit) {
      const bot = this.bots.find((b) => b.mesh === hit.object);
      bot.hp -= 35;
      this.audio.hit();
      this.hitMarkerTimer = 0.12;
      this.effects.push({ type: "impact", t: 0.2, pos: hit.point.clone() });
      if (bot.hp <= 0) {
        bot.mesh.visible = false;
        bot.respawn = 4;
        this.player.kills += 1;
      }
    }
  }

  updatePlayer(dt) {
    if (this.player.hp <= 0) return;
    const move = new THREE.Vector3();
    if (this.keys.has("KeyW")) move.z -= 1;
    if (this.keys.has("KeyS")) move.z += 1;
    if (this.keys.has("KeyA")) move.x -= 1;
    if (this.keys.has("KeyD")) move.x += 1;

    this.player.sprint = this.keys.has("ShiftLeft") && !this.player.crouch;
    this.player.crouch = this.keys.has("ControlLeft");
    const speed = this.player.sprint ? 10 : this.player.crouch ? 4 : 6.6;

    if (move.lengthSq() > 0) {
      move.normalize().applyAxisAngle(UP, this.player.yaw);
      this.player.pos.addScaledVector(move, speed * dt);
      this.stepAccumulator += dt * speed;
      if (this.stepAccumulator > 0.55) {
        this.audio.step(speed);
        this.stepAccumulator = 0;
      }
    }

    if (this.keys.has("Space") && this.player.grounded) {
      this.player.velY = 7.2;
      this.player.grounded = false;
    }

    this.player.velY -= 17 * dt;
    this.player.pos.y += this.player.velY * dt;
    const standingY = this.player.crouch ? 1.0 : 1.4;
    if (this.player.pos.y <= standingY) {
      this.player.pos.y = standingY;
      this.player.velY = 0;
      this.player.grounded = true;
    }

    this.player.pos.x = THREE.MathUtils.clamp(this.player.pos.x, -120, 120);
    this.player.pos.z = THREE.MathUtils.clamp(this.player.pos.z, -120, 120);

    this.player.recoil = Math.max(0, this.player.recoil - dt * 5.5);
  }

  updateBots(dt) {
    for (const bot of this.bots) {
      if (!bot.mesh.visible) {
        bot.respawn -= dt;
        if (bot.respawn <= 0) {
          bot.hp = 100;
          bot.mesh.visible = true;
          bot.mesh.position.set((Math.random() - 0.5) * 90, 1.2, (Math.random() - 0.5) * 90);
        }
        continue;
      }

      const toPlayer = this.player.pos.clone().sub(bot.mesh.position);
      const dist = toPlayer.length();
      bot.think -= dt;
      if (bot.think <= 0) {
        bot.think = 0.35 + Math.random() * 0.4;
        if (dist < 35) bot.state = "engage";
        else if (Math.random() < 0.3) bot.state = "patrol";
      }

      if (bot.state === "patrol") {
        if (bot.mesh.position.distanceToSquared(bot.patrolTarget) < 4) {
          bot.patrolTarget.set((Math.random() - 0.5) * 100, 1.2, (Math.random() - 0.5) * 100);
        }
        const dir = bot.patrolTarget.clone().sub(bot.mesh.position).normalize();
        bot.mesh.position.addScaledVector(dir, dt * 3.3);
      } else {
        if (dist > 16) {
          const dir = toPlayer.normalize();
          bot.mesh.position.addScaledVector(dir, dt * 4.6);
        } else if (Math.random() < 0.01) {
          const cover = this.coverPoints[Math.floor(Math.random() * this.coverPoints.length)];
          if (cover) {
            const dir = cover.clone().sub(bot.mesh.position).normalize();
            bot.mesh.position.addScaledVector(dir, dt * 5.2);
          }
        }

        bot.shootCooldown -= dt;
        if (dist < 38 && bot.shootCooldown <= 0 && this.player.hp > 0) {
          bot.shootCooldown = 0.45 + Math.random() * 0.55;
          if (Math.random() < 0.65) this.applyDamage(7 + Math.random() * 7);
          this.effects.push({
            type: "tracer",
            t: 0.06,
            from: bot.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)),
            to: this.player.pos.clone().add(new THREE.Vector3(0, 0.6, 0)),
          });
        }
      }
      bot.mesh.lookAt(this.player.pos.x, bot.mesh.position.y + 0.2, this.player.pos.z);
    }
  }

  updateEffects(dt) {
    for (const fx of this.effects) fx.t -= dt;
    this.effects = this.effects.filter((fx) => fx.t > 0);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.5);
    this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - dt);
  }

  renderEffects() {
    this.scene.children = this.scene.children.filter((obj) => !obj.userData.fx);
    for (const fx of this.effects) {
      if (fx.type === "muzzle") {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshBasicMaterial({ color: 0xfff2a1 }));
        m.position.copy(fx.pos);
        m.userData.fx = true;
        this.scene.add(m);
      } else if (fx.type === "impact") {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.12), new THREE.MeshBasicMaterial({ color: 0x8fd5ff }));
        m.position.copy(fx.pos);
        m.userData.fx = true;
        this.scene.add(m);
      } else if (fx.type === "tracer") {
        const g = new THREE.BufferGeometry().setFromPoints([fx.from, fx.to]);
        const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffd18f, transparent: true, opacity: 0.8 }));
        l.userData.fx = true;
        this.scene.add(l);
      }
    }
  }

  updateCamera(dt) {
    const kickPitch = -this.player.recoil * 0.9;
    const shoulder = new THREE.Vector3(0.65, this.player.crouch ? 1.25 : 1.6, 0);
    shoulder.applyAxisAngle(UP, this.player.yaw);
    const back = new THREE.Vector3(0, 0, 4.3).applyAxisAngle(UP, this.player.yaw);
    const targetCam = this.player.pos.clone().add(shoulder).add(back);

    this.camera.position.lerp(targetCam, Math.min(1, dt * 11));
    this.camera.lookAt(this.player.pos.x, this.player.pos.y + 0.95 + kickPitch, this.player.pos.z);

    const sway = Math.sin(performance.now() * 0.01) * 0.002 * (this.player.sprint ? 2.5 : 1);
    this.camera.rotation.z = sway - this.damageFlash * 0.03;
  }

  frame = () => {
    const dt = Math.min(0.033, this.clock.getDelta());
    this.updatePlayer(dt);
    this.updateBots(dt);
    this.updateEffects(dt);
    this.updateCamera(dt);
    this.renderEffects();

    this.ui.setHUD(this.player.hp, this.player.ammo, this.player.reserve, this.player.kills);
    this.ui.setDamage(this.damageFlash);
    this.ui.setHitMarker(this.hitMarkerTimer > 0);

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.frame);
  };
}
