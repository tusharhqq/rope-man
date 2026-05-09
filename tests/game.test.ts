import { describe, expect, test } from "bun:test";
import { RopeManGame } from "../src/game/engine.js";
import { World } from "../src/game/world.js";

describe("world generation", () => {
  test("is deterministic for the same seed", () => {
    const a = new World(42);
    const b = new World(42);
    a.generateUntil(5000);
    b.generateUntil(5000);
    expect(a.anchors.slice(0, 10)).toEqual(b.anchors.slice(0, 10));
    expect(a.obstacles.slice(0, 8)).toEqual(b.obstacles.slice(0, 8));
  });
});

describe("game engine", () => {
  test("starts a run and exposes a playable snapshot", () => {
    const game = new RopeManGame(42);
    game.start();
    const snap = game.snapshot();
    expect(snap.screen).toBe("playing");
    expect(snap.anchors.length).toBeGreaterThan(0);
    expect(snap.terrain.length).toBeGreaterThan(0);
    expect(snap.player.attached).toBe(true);
  });

  test("release action changes player to free flight", () => {
    const game = new RopeManGame(42);
    game.start();
    game.action();
    expect(game.snapshot().player.attached).toBe(false);
  });

  test("reset keeps the same seed", () => {
    const game = new RopeManGame(42);
    game.start();
    const seed = game.seedText;
    game.update(1 / 60);
    game.start();
    expect(game.seedText).toBe(seed);
    expect(game.snapshot().scoreMeters).toBe(0);
  });
});
