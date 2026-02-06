import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.js';

export class FXSystem {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.flashLight = new THREE.PointLight(0xffcc88, 0, 8);
    scene.add(this.flashLight);
    this.shake = 0;
  }

  spawnSpark(position, color = 0xffeeaa) {
    const mesh = this.pool.pop() || new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 4, 4),
      new THREE.MeshBasicMaterial({ color })
    );
    mesh.position.copy(position);
    mesh.userData.life = 0.22;
    mesh.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6);
    mesh.visible = true;
    this.scene.add(mesh);
  }

  muzzle(position) {
    this.flashLight.position.copy(position);
    this.flashLight.intensity = 2.6;
    this.shake = Math.min(this.shake + 0.08, 0.3);
  }

  hitShake(power = 0.2) {
    this.shake = Math.min(this.shake + power, 0.55);
  }

  update(dt) {
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 18);
    this.shake = Math.max(0, this.shake - dt * 2.4);

    for (const obj of [...this.scene.children]) {
      if (!obj.userData || obj.userData.life === undefined) continue;
      obj.userData.life -= dt;
      obj.position.addScaledVector(obj.userData.velocity, dt);
      obj.userData.velocity.y -= 10 * dt;
      if (obj.userData.life <= 0) {
        obj.visible = false;
        this.scene.remove(obj);
        this.pool.push(obj);
      }
    }
  }
}
