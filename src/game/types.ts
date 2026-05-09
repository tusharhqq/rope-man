export type GameScreen = "menu" | "playing" | "paused" | "crashed";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Anchor extends Vec2 {
  id: number;
}

export type Obstacle =
  | { type: "gate"; x: number; w: number; gapY: number; gap: number; phase: number; speed: number }
  | { type: "saw"; x: number; y: number; r: number; bob: number; phase: number }
  | {
      type: "spikes";
      x: number;
      y: number;
      count: number;
      dir: 1 | -1;
      size: number;
      ground: boolean;
    };

export interface TerrainKnot extends Vec2 {}

export interface Player extends Vec2 {
  vx: number;
  vy: number;
  attached: boolean;
  alive: boolean;
  anchor: Anchor | null;
  ropeLength: number;
  angle: number;
  angularVelocity: number;
  runPhase: number;
}

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface RopeShot {
  anchor: Anchor;
  t: number;
  duration: number;
}
