import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

class NetAdapter {
  send() {}
  onMessage() {}
}

class GameState {
  constructor() {
    this.playerHp = 100;
    this.ammo = 30;
    this.reserveAmmo = 120;
    this.kills = 0;
    this.phase = "ready";
  }
}

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
  }
  ensure() {
    if (this.ctx) return;
    this.ctx = new window.AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.15;
    this.master.connect(this.ctx.destination);
  }
  beep(freq, duration = 0.08, type = "square", gainValue = 0.08) {
    this.ensure();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(gainValue, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration);
  }
  shot() {
    this.beep(140, 0.06, "sawtooth", 0.08);
    this.beep(70, 0.09, "triangle", 0.06);
  }
  hit() {
    this.beep(900, 0.04, "square", 0.05);
  }
  footstep(speedFactor = 1) {
    this.beep(120 + Math.random() * 20, 0.02 * speedFactor, "triangle", 0.02);
  }
  damage() {
    this.beep(220, 0.12, "sine", 0.06);
  }
}

class TPSGame {
  constructor() {
    this.canvas = document.getElementById("game-canvas");
    this.overlay = document.getElementById("overlay");
    this.startBtn = document.getElementById("start-btn");
    this.ui = {
      hp: document.getElementById("hp"),
      ammo: document.getElementById("ammo"),
      kills: document.getElementById("kills"),
      state: document.getElementById("state"),
      hitmarker: document.getElementById("hitmarker"),
      vignette: document.getElementById("damage-vignette"),
    };

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fb5d8);
    this.scene.fog = new THREE.Fog(0x9eb7cf, 40, 180);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 350);
    this.clock = new THREE.Clock();

    this.state = new GameState();
    this.net = new NetAdapter();
    this.audio = new AudioSystem();

    this.mouse = { x: 0, y: 0, locked: false };
    this.keys = new Set();
    this.look = { yaw: 0, pitch: 0.15 };
    this.recoil = { x: 0, y: 0 };
    this.camShake = 0;
    this.footstepTimer = 0;

    this.player = {
      pos: new THREE.Vector3(0, 2, 16),
      vel: new THREE.Vector3(),
      grounded: true,
      crouching: false,
      sprint: false,
      radius: 0.7,
      fireCooldown: 0,
      reloadTimer: 0,
      spread: 0.004,
      dead: false,
    };

    this.enemies = [];
    this.obstacles = [];
    this.coverPoints = [];
    this.projectileFx = [];
    this.muzzleFlashTime = 0;
    this.raycaster = new THREE.Raycaster();

    this.initWorld();
    this.initEvents();
    this.spawnEnemies(6);
    this.updateHud();
    this.loop();
  }

  initWorld() {
    const hemi = new THREE.HemisphereLight(0xd8eeff, 0x2f3327, 1.0);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(40, 65, 20);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -80;
    dir.shadow.camera.right = 80;
    dir.shadow.camera.top = 80;
    dir.shadow.camera.bottom = -80;
    this.scene.add(dir);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220),
      new THREE.MeshStandardMaterial({ color: 0x58704f, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const makeBox = (x, z, w, h, d, color = 0x7f7f84, cover = false) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color, roughness: 0.95 })
      );
      mesh.position.set(x, h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      mesh.userData.solid = true;
      this.obstacles.push(mesh);
      if (cover) {
        this.coverPoints.push(new THREE.Vector3(x + w * 0.7, 0, z));
        this.coverPoints.push(new THREE.Vector3(x - w * 0.7, 0, z));
      }
    };

    makeBox(8, -8, 8, 6, 10, 0x767a8b);
    makeBox(-20, -12, 16, 12, 12, 0x646879);
    makeBox(-2, -26, 6, 4, 14, 0x55625a, true);
    makeBox(18, 8, 7, 4, 8, 0x536057, true);
    makeBox(-24, 14, 8, 4, 8, 0x5f5f5f, true);
    makeBox(0, 6, 5, 3, 5, 0x70785a, true);

    const muzzle = new THREE.PointLight(0xffe2ae, 0, 9, 2);
    muzzle.position.set(0.4, 1.6, -0.5);
    this.camera.add(muzzle);
    this.muzzleLight = muzzle;
    this.scene.add(this.camera);
  }

  spawnEnemies(count) {
    const geo = new THREE.CapsuleGeometry(0.6, 1.1, 4, 8);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.02 + Math.random() * 0.08, 0.4, 0.42) })
      );
      mesh.castShadow = true;
      const pos = new THREE.Vector3((Math.random() - 0.5) * 48, 1.25, -8 - Math.random() * 50);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.enemies.push({
        mesh,
        hp: 100,
        state: "patrol",
        target: pos.clone(),
        shotTimer: 0,
        think: Math.random() * 1.2,
        lastSeen: 0,
      });
    }
  }

  initEvents() {
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const lock = () => this.canvas.requestPointerLock();
    this.startBtn.addEventListener("click", lock);
    this.canvas.addEventListener("click", () => {
      if (!this.player.dead) lock();
    });

    document.addEventListener("pointerlockchange", () => {
      this.mouse.locked = document.pointerLockElement === this.canvas;
      this.overlay.classList.toggle("visible", !this.mouse.locked && !this.player.dead);
      if (this.mouse.locked) {
        this.state.phase = "engaged";
        this.updateHud();
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.mouse.locked) return;
      this.look.yaw -= e.movementX * 0.0022;
      this.look.pitch = THREE.MathUtils.clamp(this.look.pitch - e.movementY * 0.0018, -0.55, 0.85);
    });

    window.addEventListener("keydown", (e) => {
      this.keys.add(e.key.toLowerCase());
      if (e.key === "Enter" && this.player.dead) this.restart();
      if (e.key.toLowerCase() === "r") this.reload();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));

    window.addEventListener("mousedown", (e) => {
      if (e.button === 0 && this.mouse.locked && !this.player.dead) this.tryShoot();
    });
  }

  updatePlayer(dt) {
    const move = new THREE.Vector3();
    const fwd = new THREE.Vector3(Math.sin(this.look.yaw), 0, Math.cos(this.look.yaw)).negate();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize();

    if (this.keys.has("w")) move.add(fwd);
    if (this.keys.has("s")) move.addScaledVector(fwd, -1);
    if (this.keys.has("a")) move.addScaledVector(right, -1);
    if (this.keys.has("d")) move.add(right);

    this.player.crouching = this.keys.has("control");
    this.player.sprint = this.keys.has("shift") && !this.player.crouching;

    const speed = this.player.crouching ? 4.4 : this.player.sprint ? 10 : 6.8;
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed);
      this.player.vel.x = THREE.MathUtils.lerp(this.player.vel.x, move.x, 10 * dt);
      this.player.vel.z = THREE.MathUtils.lerp(this.player.vel.z, move.z, 10 * dt);
      this.footstepTimer -= dt;
      if (this.player.grounded && this.footstepTimer <= 0) {
        this.audio.footstep(this.player.sprint ? 0.7 : 1);
        this.footstepTimer = this.player.sprint ? 0.22 : 0.33;
      }
    } else {
      this.player.vel.x *= 0.82;
      this.player.vel.z *= 0.82;
    }

    if (this.keys.has(" ") && this.player.grounded) {
      this.player.vel.y = 8.2;
      this.player.grounded = false;
    }

    this.player.vel.y -= 20 * dt;
    this.player.pos.addScaledVector(this.player.vel, dt);
    if (this.player.pos.y <= 2) {
      this.player.pos.y = 2;
      this.player.vel.y = 0;
      this.player.grounded = true;
    }

    for (const obstacle of this.obstacles) {
      const box = new THREE.Box3().setFromObject(obstacle);
      box.min.y = -10;
      box.max.y = 10;
      const nearest = new THREE.Vector3(
        THREE.MathUtils.clamp(this.player.pos.x, box.min.x, box.max.x),
        this.player.pos.y,
        THREE.MathUtils.clamp(this.player.pos.z, box.min.z, box.max.z)
      );
      const delta = this.player.pos.clone().sub(nearest);
      const dist = delta.length();
      if (dist < this.player.radius) {
        const push = delta.normalize().multiplyScalar(this.player.radius - dist + 0.01);
        if (Number.isFinite(push.x)) this.player.pos.add(push);
      }
    }

    this.player.pos.x = THREE.MathUtils.clamp(this.player.pos.x, -95, 95);
    this.player.pos.z = THREE.MathUtils.clamp(this.player.pos.z, -95, 95);

    this.player.fireCooldown = Math.max(0, this.player.fireCooldown - dt);
    this.player.reloadTimer = Math.max(0, this.player.reloadTimer - dt);

    this.recoil.x = THREE.MathUtils.lerp(this.recoil.x, 0, 12 * dt);
    this.recoil.y = THREE.MathUtils.lerp(this.recoil.y, 0, 12 * dt);

    const camHeight = this.player.crouching ? 1.45 : 1.72;
    const shoulder = new THREE.Vector3(0.62, camHeight, 2.8);
    shoulder.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.look.yaw + this.recoil.y);
    const targetCam = this.player.pos.clone().add(shoulder);

    this.camera.position.lerp(targetCam, 1 - Math.exp(-dt * 14));
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.look.yaw + this.recoil.y;
    this.camera.rotation.x = this.look.pitch + this.recoil.x + (Math.random() - 0.5) * this.camShake;

    this.camShake = Math.max(0, this.camShake - dt * 4);
    if (this.muzzleFlashTime > 0) {
      this.muzzleFlashTime -= dt;
      this.muzzleLight.intensity = 2.4;
    } else this.muzzleLight.intensity = 0;
  }

  lineOfSight(from, to) {
    const dir = to.clone().sub(from).normalize();
    this.raycaster.set(from, dir);
    const hit = this.raycaster.intersectObjects(this.obstacles, false)[0];
    if (!hit) return true;
    return hit.distance >= from.distanceTo(to) - 0.6;
  }

  updateEnemies(dt) {
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      const pos = enemy.mesh.position;
      const toPlayer = this.player.pos.clone().sub(pos);
      const dist = toPlayer.length();
      enemy.think -= dt;

      const canSee = dist < 45 && this.lineOfSight(pos.clone().setY(1.6), this.player.pos.clone().setY(1.6));
      if (canSee) enemy.lastSeen = 2.4;
      else enemy.lastSeen -= dt;

      if (enemy.think <= 0) {
        enemy.think = 0.25 + Math.random() * 0.3;
        if (enemy.lastSeen > 0 && dist < 28) enemy.state = "attack";
        else if (enemy.lastSeen > 0) enemy.state = "chase";
        else enemy.state = Math.random() > 0.5 ? "patrol" : "cover";

        if (enemy.state === "patrol") enemy.target = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12));
        if (enemy.state === "cover" && this.coverPoints.length) {
          enemy.target = this.coverPoints[Math.floor(Math.random() * this.coverPoints.length)].clone();
        }
      }

      if (enemy.state === "chase") enemy.target = this.player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
      if (enemy.state === "attack") {
        enemy.shotTimer -= dt;
        if (enemy.shotTimer <= 0 && dist < 35) {
          enemy.shotTimer = 0.45 + Math.random() * 0.5;
          const acc = THREE.MathUtils.clamp(1 - dist / 40, 0.15, 0.75);
          if (Math.random() < acc && !this.player.dead) {
            this.damagePlayer(8 + Math.random() * 8);
          }
          this.spawnImpact(this.player.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 0xff8866, 5);
        }
      }

      const desired = enemy.target.clone().sub(pos);
      desired.y = 0;
      if (desired.lengthSq() > 0.2) {
        desired.normalize().multiplyScalar(enemy.state === "chase" ? 5.3 : 3.1);
        pos.addScaledVector(desired, dt);
      }

      enemy.mesh.lookAt(this.player.pos.x, pos.y, this.player.pos.z);
    }
  }

  tryShoot() {
    if (this.player.fireCooldown > 0 || this.player.reloadTimer > 0) return;
    if (this.state.ammo <= 0) {
      this.reload();
      return;
    }

    this.player.fireCooldown = 0.11;
    this.state.ammo -= 1;
    this.audio.shot();
    this.recoil.x += 0.042;
    this.recoil.y += (Math.random() - 0.5) * 0.016;
    this.camShake = 0.02;
    this.muzzleFlashTime = 0.03;

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    dir.x += (Math.random() - 0.5) * this.player.spread;
    dir.y += (Math.random() - 0.5) * this.player.spread;
    dir.z += (Math.random() - 0.5) * this.player.spread;
    dir.normalize();

    this.raycaster.set(this.camera.position, dir);
    this.raycaster.far = 120;

    const solids = this.obstacles.concat(this.enemies.filter((e) => e.hp > 0).map((e) => e.mesh));
    const hits = this.raycaster.intersectObjects(solids, false);
    if (hits[0]) {
      const point = hits[0].point;
      const obj = hits[0].object;
      const enemy = this.enemies.find((e) => e.mesh === obj && e.hp > 0);
      if (enemy) {
        enemy.hp -= 34;
        this.audio.hit();
        this.flashHitmarker();
        this.spawnImpact(point, 0xfff0a8, 10);
        if (enemy.hp <= 0) {
          enemy.mesh.visible = false;
          this.state.kills += 1;
        }
      } else {
        this.spawnImpact(point, 0xbac7d3, 7);
      }
    }

    this.updateHud();
  }

  reload() {
    if (this.player.reloadTimer > 0 || this.state.ammo >= 30 || this.state.reserveAmmo <= 0) return;
    this.player.reloadTimer = 1.2;
    setTimeout(() => {
      const need = 30 - this.state.ammo;
      const fill = Math.min(need, this.state.reserveAmmo);
      this.state.ammo += fill;
      this.state.reserveAmmo -= fill;
      this.updateHud();
    }, 1200);
  }

  flashHitmarker() {
    this.ui.hitmarker.style.opacity = "1";
    setTimeout(() => (this.ui.hitmarker.style.opacity = "0"), 80);
  }

  spawnImpact(position, color, count) {
    for (let i = 0; i < count; i++) {
      this.projectileFx.push({
        pos: position.clone(),
        vel: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6),
        life: 0.25 + Math.random() * 0.2,
        color,
      });
    }
  }

  updateEffects(dt) {
    for (let i = this.projectileFx.length - 1; i >= 0; i--) {
      const p = this.projectileFx[i];
      p.life -= dt;
      p.pos.addScaledVector(p.vel, dt);
      p.vel.y -= 11 * dt;
      if (p.life <= 0) this.projectileFx.splice(i, 1);
    }

    if (!this.fxMesh) {
      const geo = new THREE.SphereGeometry(0.06, 6, 6);
      this.fxMesh = new THREE.InstancedMesh(
        geo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
        140
      );
      this.scene.add(this.fxMesh);
    }

    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 140; i++) {
      const p = this.projectileFx[i];
      if (p) matrix.makeTranslation(p.pos.x, p.pos.y, p.pos.z);
      else matrix.makeTranslation(9999, 9999, 9999);
      this.fxMesh.setMatrixAt(i, matrix);
    }
    this.fxMesh.instanceMatrix.needsUpdate = true;
  }

  damagePlayer(amount) {
    if (this.player.dead) return;
    this.state.playerHp = Math.max(0, this.state.playerHp - amount);
    this.camShake = 0.06;
    this.audio.damage();
    this.ui.vignette.style.opacity = String(0.25 + (100 - this.state.playerHp) / 120);
    setTimeout(() => {
      this.ui.vignette.style.opacity = String((100 - this.state.playerHp) / 220);
    }, 120);

    if (this.state.playerHp <= 0) {
      this.player.dead = true;
      this.state.phase = "dead";
      this.overlay.classList.add("visible");
      this.overlay.querySelector("h1").textContent = "YOU DIED";
      this.overlay.querySelector("p").textContent = "Enterで再開。STARTでも再開可能。";
      document.exitPointerLock?.();
    }
    this.updateHud();
  }

  updateHud() {
    this.ui.hp.textContent = Math.ceil(this.state.playerHp);
    this.ui.ammo.textContent = `${this.state.ammo} / ${this.state.reserveAmmo}`;
    this.ui.kills.textContent = String(this.state.kills);
    this.ui.state.textContent = this.state.phase.toUpperCase();
  }

  restart() {
    this.state = new GameState();
    this.player.dead = false;
    this.player.pos.set(0, 2, 16);
    this.player.vel.set(0, 0, 0);
    this.look.yaw = 0;
    this.look.pitch = 0.15;
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
    this.spawnEnemies(6);
    this.overlay.classList.remove("visible");
    this.overlay.querySelector("h1").textContent = "3D TPS Vertical Slice";
    this.overlay.querySelector("p").textContent = "WASD:移動 / Shift:スプリント / Space:ジャンプ / Ctrl:しゃがみ / 左クリック:射撃 / R:リロード";
    this.updateHud();
  }

  loop = () => {
    const dt = Math.min(this.clock.getDelta(), 0.033);
    if (!this.player.dead) {
      this.updatePlayer(dt);
      this.updateEnemies(dt);
      this.updateEffects(dt);
      this.updateHud();
    }
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  };
}

new TPSGame();
