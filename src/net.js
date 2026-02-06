export class LocalNetAdapter {
  connect() {}
  sendInput() {}
  onState() {}
  disconnect() {}
}

export class GameState {
  constructor() {
    this.players = new Map();
    this.bots = new Map();
    this.projectiles = [];
  }
}
