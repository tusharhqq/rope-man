import { RGBA, TextAttributes, type OptimizedBuffer } from "@opentui/core";
import type { GameSnapshot, RopeManGame } from "../game/engine.js";
import type { Anchor, Obstacle, Player, RopeShot, Vec2 } from "../game/types.js";
import { WORLD_HEIGHT } from "../game/world.js";

const COLORS = {
  paper: RGBA.fromInts(14, 15, 18),
  panel: RGBA.fromInts(28, 30, 36),
  ink: RGBA.fromInts(245, 239, 220),
  muted: RGBA.fromInts(160, 154, 140),
  rope: RGBA.fromInts(218, 157, 80),
  player: RGBA.fromInts(251, 249, 240),
  anchor: RGBA.fromInts(255, 215, 100),
  focus: RGBA.fromInts(92, 220, 147),
  terrain: RGBA.fromInts(134, 197, 115),
  terrainDark: RGBA.fromInts(46, 78, 47),
  spike: RGBA.fromInts(220, 90, 90),
  saw: RGBA.fromInts(210, 215, 222),
  gate: RGBA.fromInts(180, 184, 192),
  water: RGBA.fromInts(70, 165, 255),
  lava: RGBA.fromInts(255, 112, 45),
};

export interface RenderOptions {
  seedDraft: string;
  seedError: string;
}

export function renderGame(
  buffer: OptimizedBuffer,
  game: RopeManGame,
  options: RenderOptions,
): void {
  const width = buffer.width;
  const height = buffer.height;
  buffer.clear(COLORS.paper);

  if (width < 80 || height < 24) {
    drawCentered(
      buffer,
      "Rope Man needs at least 80x24 terminal cells",
      Math.floor(height / 2),
      COLORS.spike,
    );
    drawCentered(buffer, `current: ${width}x${height}`, Math.floor(height / 2) + 1, COLORS.muted);
    return;
  }

  const snapshot = game.snapshot();
  drawHud(buffer, snapshot, width);

  if (snapshot.screen === "menu") {
    drawMenu(buffer, snapshot, options);
    return;
  }

  drawWorld(buffer, snapshot);

  if (snapshot.screen === "paused")
    drawOverlay(buffer, "PAUSED", snapshot.message, "Esc resume · R retry · H menu · Q quit");
  if (snapshot.screen === "crashed") {
    drawOverlay(buffer, "CRASH", snapshot.message, "Space/R retry · H menu · Q quit");
  }
}

function drawHud(buffer: OptimizedBuffer, snapshot: GameSnapshot, width: number): void {
  fillRow(buffer, 0, COLORS.panel);
  const left = ` rope man  seed ${snapshot.seedText}  score ${snapshot.scoreMeters}m  best ${snapshot.bestMeters}m `;
  const right = " space hook  wasd/arrows move  r retry  esc pause  q quit ";
  buffer.drawText(left.slice(0, width), 1, 0, COLORS.ink, COLORS.panel, TextAttributes.BOLD);
  if (width > right.length + 4)
    buffer.drawText(right, width - right.length - 1, 0, COLORS.muted, COLORS.panel);
}

function drawMenu(buffer: OptimizedBuffer, snapshot: GameSnapshot, options: RenderOptions): void {
  drawCentered(buffer, "ROPE MAN", 5, COLORS.anchor, TextAttributes.BOLD);
  drawCentered(buffer, "terminal edition", 7, COLORS.muted);
  drawCentered(buffer, "Enter: random seed", 10, COLORS.ink);
  drawCentered(buffer, "Type seed then Enter: play that seed", 11, COLORS.ink);
  drawCentered(buffer, "Q: quit", 12, COLORS.ink);

  const draft = options.seedDraft ? options.seedDraft : "_";
  drawCentered(
    buffer,
    `seed: ${draft}`,
    15,
    options.seedError ? COLORS.spike : COLORS.focus,
    TextAttributes.BOLD,
  );
  if (options.seedError) drawCentered(buffer, options.seedError, 17, COLORS.spike);
  drawCentered(buffer, `best: ${snapshot.bestMeters}m`, 20, COLORS.muted);
}

function drawWorld(buffer: OptimizedBuffer, snapshot: GameSnapshot): void {
  const width = buffer.width;
  const height = buffer.height;
  const top = 2;
  const worldRows = height - top - 2;
  const scaleX = Math.max(8, 980 / Math.max(80, width));
  const scaleY = WORLD_HEIGHT / Math.max(22, worldRows);
  const originX = snapshot.cameraX;
  const originY = snapshot.cameraY;

  const toCell = (p: Vec2) => ({
    x: Math.round((p.x - originX) / scaleX),
    y: top + Math.round((p.y - originY) / scaleY),
  });

  drawTerrain(buffer, snapshot.terrain.map(toCell), top);

  for (const obstacle of snapshot.obstacles)
    drawObstacle(buffer, obstacle, snapshot.time, toCell, scaleX, scaleY);
  for (const anchor of snapshot.anchors) drawAnchor(buffer, anchor, snapshot.focusedAnchor, toCell);
  drawRope(buffer, snapshot.player, toCell);
  drawRopeShot(buffer, snapshot.ropeShot, snapshot.player, toCell);
  drawPlayer(buffer, snapshot.player, toCell);
  buffer.drawText(snapshot.message.slice(0, width - 2), 1, height - 1, COLORS.muted, COLORS.paper);
}

function drawObstacle(
  buffer: OptimizedBuffer,
  obstacle: Obstacle,
  time: number,
  toCell: (p: Vec2) => { x: number; y: number },
  scaleX: number,
  scaleY: number,
): void {
  if (obstacle.type === "saw") {
    const c = toCell({
      x: obstacle.x,
      y: obstacle.y + Math.sin(time * 1.5 + obstacle.phase) * obstacle.bob * 0.25,
    });
    drawSafe(buffer, c.x, c.y, "✹", COLORS.saw);
    return;
  }
  if (obstacle.type === "gate") {
    const gapY = obstacle.gapY + Math.sin(time * obstacle.speed + obstacle.phase) * 58;
    const topBottom = toCell({ x: obstacle.x, y: gapY - obstacle.gap / 2 }).y;
    const bottomTop = toCell({ x: obstacle.x, y: gapY + obstacle.gap / 2 }).y;
    const x0 = toCell({ x: obstacle.x, y: 0 }).x;
    const x1 = toCell({ x: obstacle.x + obstacle.w, y: 0 }).x;
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1) + 1; x++) {
      for (let y = 2; y < buffer.height - 1; y++) {
        if (y < topBottom || y > bottomTop) drawSafe(buffer, x, y, "█", COLORS.gate);
      }
    }
    return;
  }

  const y = obstacle.ground
    ? toCell({ x: obstacle.x, y: 610 }).y
    : toCell({ x: obstacle.x, y: obstacle.y }).y;
  const count = Math.max(2, Math.round((obstacle.count * obstacle.size) / scaleX));
  const x0 = toCell({ x: obstacle.x, y: 0 }).x;
  const glyph = obstacle.ground ? "▲" : "▼";
  for (let i = 0; i < count; i++) {
    drawSafe(buffer, x0 + i, y + (obstacle.ground ? -1 : 0), glyph, COLORS.spike);
  }
  void scaleY;
}

function drawAnchor(
  buffer: OptimizedBuffer,
  anchor: Anchor,
  focused: Anchor | null,
  toCell: (p: Vec2) => { x: number; y: number },
): void {
  const c = toCell(anchor);
  const color = focused && focused.id === anchor.id ? COLORS.focus : COLORS.anchor;
  drawSafe(buffer, c.x, c.y, focused && focused.id === anchor.id ? "◎" : "x", color);
}

function drawRope(
  buffer: OptimizedBuffer,
  player: Player,
  toCell: (p: Vec2) => { x: number; y: number },
): void {
  if (!player.attached || !player.anchor) return;
  const a = toCell(player.anchor);
  const b = toCell(player);
  drawLine(buffer, a.x, a.y, b.x, b.y, COLORS.rope);
}

function drawRopeShot(
  buffer: OptimizedBuffer,
  ropeShot: RopeShot | null,
  player: Player,
  toCell: (p: Vec2) => { x: number; y: number },
): void {
  if (!ropeShot) return;
  const p = Math.max(0, Math.min(1, ropeShot.t / ropeShot.duration));
  const tip = {
    x: player.x + (ropeShot.anchor.x - player.x) * p,
    y: player.y + (ropeShot.anchor.y - player.y) * p,
  };
  const a = toCell(player);
  const b = toCell(tip);
  drawLine(buffer, a.x, a.y, b.x, b.y, COLORS.rope);
  drawSafe(buffer, b.x, b.y, "◆", COLORS.anchor);
}

function drawPlayer(
  buffer: OptimizedBuffer,
  player: Player,
  toCell: (p: Vec2) => { x: number; y: number },
): void {
  const c = toCell(player);
  const phase = player.runPhase;
  const lean = Math.max(-1, Math.min(1, player.vx / 850));
  const arm = Math.sin(phase) > 0 ? "/" : "\\";
  const legA = Math.sin(phase * 1.15) > 0 ? "/" : "\\";
  const legB = legA === "/" ? "\\" : "/";
  const body = player.attached ? "╂" : lean > 0.25 ? "┤" : lean < -0.25 ? "├" : "┼";
  drawSafe(buffer, c.x, c.y - 2, "●", COLORS.player);
  drawSafe(buffer, c.x, c.y - 1, "│", COLORS.player);
  drawSafe(buffer, c.x - 1, c.y, arm, COLORS.player);
  drawSafe(buffer, c.x, c.y, body, COLORS.player);
  drawSafe(buffer, c.x + 1, c.y, arm === "/" ? "\\" : "/", COLORS.player);
  drawSafe(buffer, c.x - 1, c.y + 1, legA, COLORS.player);
  drawSafe(buffer, c.x + 1, c.y + 1, legB, COLORS.player);
}

function drawOverlay(buffer: OptimizedBuffer, title: string, line1: string, line2: string): void {
  const boxW = Math.min(buffer.width - 8, Math.max(48, line1.length + 4, line2.length + 4));
  const x = Math.floor((buffer.width - boxW) / 2);
  const y = Math.floor(buffer.height / 2) - 3;
  for (let yy = 0; yy < 7; yy++) {
    for (let xx = 0; xx < boxW; xx++)
      buffer.drawText(" ", x + xx, y + yy, COLORS.ink, COLORS.panel);
  }
  drawTextAt(buffer, title, x + 2, y + 1, COLORS.anchor, COLORS.panel, TextAttributes.BOLD);
  drawTextAt(buffer, line1, x + 2, y + 3, COLORS.ink, COLORS.panel);
  drawTextAt(buffer, line2, x + 2, y + 5, COLORS.muted, COLORS.panel);
}

function drawTerrain(
  buffer: OptimizedBuffer,
  points: { x: number; y: number }[],
  top: number,
): void {
  if (points.length < 2) return;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    drawLine(buffer, a.x, a.y, b.x, b.y, COLORS.terrain);
  }

  const surfaceByX = new Map<number, number>();
  for (const p of points) {
    if (p.x < 0 || p.x >= buffer.width || p.y < top || p.y >= buffer.height) continue;
    const current = surfaceByX.get(p.x);
    if (current == null || p.y < current) surfaceByX.set(p.x, p.y);
  }

  for (const [x, y0] of surfaceByX) {
    for (let y = y0 + 1; y < buffer.height - 1; y++) {
      const band = y - y0;
      const glyph = band < 2 ? "▓" : band < 5 ? "▒" : "░";
      const checker = band > 4 && (x + y) % 3 !== 0;
      if (!checker) drawSafe(buffer, x, y, glyph, COLORS.terrainDark);
    }
  }
}

function drawLine(
  buffer: OptimizedBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: RGBA,
): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    drawSafe(buffer, x, y, lineGlyph(x0, y0, x1, y1), color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function lineGlyph(x0: number, y0: number, x1: number, y1: number): string {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (Math.abs(dx) > Math.abs(dy) * 2.2) return "─";
  if (Math.abs(dy) > Math.abs(dx) * 2.2) return "│";
  return dx * dy > 0 ? "\\" : "/";
}

function drawCentered(
  buffer: OptimizedBuffer,
  text: string,
  y: number,
  fg: RGBA,
  attributes = 0,
): void {
  const x = Math.max(0, Math.floor((buffer.width - text.length) / 2));
  drawTextAt(buffer, text, x, y, fg, undefined, attributes);
}

function drawTextAt(
  buffer: OptimizedBuffer,
  text: string,
  x: number,
  y: number,
  fg: RGBA,
  bg?: RGBA,
  attributes = 0,
): void {
  if (y < 0 || y >= buffer.height || x >= buffer.width) return;
  buffer.drawText(
    text.slice(0, Math.max(0, buffer.width - x)),
    Math.max(0, x),
    y,
    fg,
    bg,
    attributes,
  );
}

function drawSafe(buffer: OptimizedBuffer, x: number, y: number, glyph: string, fg: RGBA): void {
  if (x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) return;
  buffer.drawText(glyph, x, y, fg);
}

function fillRow(buffer: OptimizedBuffer, y: number, bg: RGBA): void {
  for (let x = 0; x < buffer.width; x++) buffer.drawText(" ", x, y, COLORS.ink, bg);
}
