export class GameState {
  constructor() {
    this.tick = 0;
    this.player = { hp: 100, ammo: 30, reserve: 90, kills: 0, dead: false };
    this.entities = [];
  }
}

export class NetAdapter {
  connect() {}
  sendInput() {}
  receiveSnapshot() { return null; }
}

export class LocalAdapter extends NetAdapter {
  constructor(state) {
    super();
    this.state = state;
  }
}
