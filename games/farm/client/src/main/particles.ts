import { ParticleSystem, EDG } from "@engine/core";
import { TILE } from "./config";
import {
  focusedFarmerId,
  playerFarmerId,
  panOffset,
  _camera,
  setFocusedFarmerId,
  setPanOffset,
  setPlayerFarmerId,
  applyFocusAndPan,
} from "./camera";
import type { SimClient } from "../worker/sim-client";

export class ParticleDirector {
  private readonly particles: ParticleSystem;
  private readonly client: SimClient;
  private prevGold = new Map<number, number>(); 

  constructor(particles: ParticleSystem, client: SimClient) {
    this.particles = particles;
    this.client = client;

    client.onSnapshot((snap) => {

      if (playerFarmerId === null) {
        for (const s of snap.sprites) {
          if (s.id !== null && s.interpolate && s.label === "Pip") {
            setPlayerFarmerId(s.id);
            if (focusedFarmerId === null) {
              setFocusedFarmerId(s.id);
              setPanOffset({ x: 0, y: 0 });
              if (_camera !== null) applyFocusAndPan(_camera);
            }
            break;
          }
        }
      }
      if (!snap.shock) return;
      for (const row of snap.leaderboard) {
        const pos = client.getFarmerInterpolatedPos(row.id);
        if (!pos) continue;
        this.particles.emit({
          x: pos.x, y: pos.y,
          count: 20,
          shape: "rect",
          color: EDG.wood, color2: EDG.woodDark,
          speedMin: 15, speedMax: 60,
          angleMin: -Math.PI, angleMax: 0,
          lifetimeMin: 0.4, lifetimeMax: 0.9,
          sizeMin: 1, sizeMax: 2.5,
          gravity: 80,
        });
      }
    });
  }

  emitFromDiff(farmerPositions: Map<number, { x: number; y: number }>): void {
    const lb = this.client.leaderboard;
    for (const row of lb) {
      const pos = farmerPositions.get(row.id);
      if (!pos) continue;
      const prevG = this.prevGold.get(row.id) ?? row.gold;
      if (row.gold > prevG) {
        this.particles.emit({
          x: pos.x, y: pos.y - TILE,
          count: 8,
          shape: "star",
          color: EDG.gold, color2: EDG.yellow,
          speedMin: 10, speedMax: 35,
          angleMin: -Math.PI, angleMax: 0,
          lifetimeMin: 0.5, lifetimeMax: 1.0,
          sizeMin: 1.5, sizeMax: 3,
          gravity: 40,
        });
      }
      this.prevGold.set(row.id, row.gold);
    }
  }
}
