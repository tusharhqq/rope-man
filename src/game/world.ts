import { Mulberry32 } from "./seed.js";
import type { Anchor, Obstacle, TerrainKnot } from "./types.js";

export const WORLD_HEIGHT = 720;
export const TERRAIN_DROP = 100;
export const TERRAIN_MIN_Y = WORLD_HEIGHT * 0.55 + TERRAIN_DROP;
export const TERRAIN_MAX_Y = WORLD_HEIGHT - 48 + TERRAIN_DROP;
export const TERRAIN_STEP_MIN = 280;
export const TERRAIN_STEP_MAX = 540;
export const WORLD_CHUNK = 320;
const WORLD_PX_PER_METER = 124 / 1.7;
const ANCHOR_TERRAIN_CLEARANCE = 3.6 * WORLD_PX_PER_METER;

export class World {
  readonly anchors: Anchor[] = [];
  readonly obstacles: Obstacle[] = [];
  readonly terrain: TerrainKnot[] = [];

  private rng: Mulberry32;
  private generatedWorldX = 0;
  private terrainCursorX = -600;
  private terrainLastY = WORLD_HEIGHT - 128 + TERRAIN_DROP;
  private nextAnchorX = 130;
  private nextObstacleX = 850;
  private obstacleIndex = 0;

  constructor(seed: number) {
    this.rng = new Mulberry32(seed);
    this.resetTerrain();
    this.generateUntil(1800);
  }

  generateUntil(worldX: number): void {
    while (this.generatedWorldX < worldX) {
      const nextWorldX = this.generatedWorldX + WORLD_CHUNK;
      this.generateTerrainUntil(nextWorldX + 900);
      while (this.nextObstacleX < nextWorldX + 700) {
        this.spawnObstacle(this.nextObstacleX, this.obstacleIndex++);
        this.nextObstacleX += this.rng.range(620, 980);
      }
      while (this.nextAnchorX < nextWorldX + 700) {
        const difficulty = Math.min(this.nextAnchorX / 6500, 1);
        const gap = this.rng.range(260, 430 + difficulty * 100);
        const wave = Math.sin(this.nextAnchorX / 680) * 86;
        const ground = this.terrainYAt(this.nextAnchorX);
        const maxY = Math.min(ground - ANCHOR_TERRAIN_CLEARANCE, 315 + wave + difficulty * 80);
        const minY = -30 + wave;
        this.anchors.push({
          id: this.anchors.length + 1,
          x: this.nextAnchorX,
          y: clamp(this.rng.range(minY, maxY), -240, ground - ANCHOR_TERRAIN_CLEARANCE),
        });
        this.nextAnchorX += gap;
      }
      this.generatedWorldX = nextWorldX;
    }
  }

  terrainYAt(x: number): number {
    this.generateTerrainUntil(x + 500);
    const knots = this.terrain;
    for (let i = 1; i < knots.length; i++) {
      const a = knots[i - 1]!;
      const b = knots[i]!;
      if (x <= b.x) {
        const t = clamp((x - a.x) / (b.x - a.x), 0, 1);
        const s = t * t * (3 - 2 * t);
        return a.y + (b.y - a.y) * s;
      }
    }
    return this.terrainLastY;
  }

  private resetTerrain(): void {
    this.terrain.length = 0;
    this.terrainCursorX = -600;
    this.terrainLastY = WORLD_HEIGHT - 128 + TERRAIN_DROP;
    this.addTerrainKnot(-600, WORLD_HEIGHT - 145 + TERRAIN_DROP);
    this.addTerrainKnot(-260, WORLD_HEIGHT - 190 + TERRAIN_DROP);
    this.addTerrainKnot(100, WORLD_HEIGHT - 135 + TERRAIN_DROP);
  }

  private generateTerrainUntil(worldX: number): void {
    while (this.terrainCursorX < worldX) {
      const x = this.terrainCursorX + this.rng.range(TERRAIN_STEP_MIN, TERRAIN_STEP_MAX);
      const mid = (TERRAIN_MIN_Y + TERRAIN_MAX_Y) / 2;
      const lastWasHill = this.terrainLastY < mid;
      const makeValley = lastWasHill ? this.rng.next() < 0.76 : this.rng.next() < 0.36;
      let y = makeValley
        ? this.rng.range(mid + 35, TERRAIN_MAX_Y)
        : this.rng.range(TERRAIN_MIN_Y, mid - 25);
      y += Math.sin(x / 1160) * 30 + Math.sin(x / 520 + 1.8) * 20;
      if (Math.abs(y - this.terrainLastY) < 55)
        y += (y >= this.terrainLastY ? 1 : -1) * this.rng.range(55, 100);
      this.addTerrainKnot(x, y);
    }
  }

  private addTerrainKnot(x: number, y: number): void {
    const clampedY = clamp(y, TERRAIN_MIN_Y, TERRAIN_MAX_Y);
    this.terrain.push({ x, y: clampedY });
    this.terrainCursorX = x;
    this.terrainLastY = clampedY;
  }

  private spawnObstacle(x: number, index: number): void {
    const difficulty = Math.min(x / 5500, 1);
    const roll = this.rng.next();
    if (index < 1 || roll < 0.25) {
      this.obstacles.push({
        type: "gate",
        x,
        w: 28,
        gapY: this.rng.range(285, 430),
        gap: this.rng.range(255 - difficulty * 35, 350),
        phase: this.rng.range(0, Math.PI * 2),
        speed: this.rng.range(0.45, 1.15),
      });
    } else if (roll < 0.58) {
      this.obstacles.push({
        type: "saw",
        x,
        y: this.rng.range(220, 455),
        r: this.rng.range(28, 42),
        bob: this.rng.range(75, 160),
        phase: this.rng.range(0, Math.PI * 2),
      });
    } else {
      const ceiling = this.rng.next() < 0.28;
      this.obstacles.push({
        type: "spikes",
        x: x + this.rng.range(-40, 95),
        y: ceiling ? 45 : 0,
        count: this.rng.int(4, 8),
        dir: ceiling ? 1 : -1,
        size: this.rng.range(24, 34),
        ground: !ceiling,
      });
    }
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
