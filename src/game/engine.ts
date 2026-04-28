import { Mulberry32, normalizeSeedValue, seedTextFromValue } from "./seed.js"
import type { Anchor, InputState, Obstacle, Player, RopeShot, Vec2 } from "./types.js"
import { clamp, WORLD_HEIGHT, World } from "./world.js"

const GRAVITY = 1500
const HOOK_RANGE = 720
const ROPE_ATTACH_GRACE = 70
const MIN_ROPE = 55
const MAX_ROPE = 780
const ROPE_REEL_SPEED = 230
const SWING_ACCEL = 1050
const AIR_ACCEL = 620
const LOST_BELOW_Y = 1500
const ROPE_SHOT_SPEED = 1200
const ROPE_SHOT_MIN_DURATION = 0.14
const ROPE_SHOT_MAX_DURATION = 0.42
const FOCUS_MIN_MOMENTUM_SPEED = 80
const FOCUS_FULL_BIAS_SPEED = 950
const FOCUS_DIRECTION_BIAS = 120
const FOCUS_OUT_OF_RANGE_WEIGHT = 0.7
const WORLD_PX_PER_METER = 124 / 1.7

export interface GameSnapshot {
  seedText: string
  scoreMeters: number
  bestMeters: number
  screen: "menu" | "playing" | "paused" | "crashed"
  player: Player
  anchors: Anchor[]
  obstacles: Obstacle[]
  terrain: Vec2[]
  cameraX: number
  cameraY: number
  time: number
  focusedAnchor: Anchor | null
  ropeShot: RopeShot | null
  message: string
}

export class RopeManGame {
  readonly input: InputState = { left: false, right: false, up: false, down: false }
  world: World
  player: Player
  screen: GameSnapshot["screen"] = "menu"
  seedValue: number
  seedText: string
  bestMeters: number
  scoreMeters = 0
  time = 0
  focusedAnchor: Anchor | null = null
  ropeShot: RopeShot | null = null
  cameraX = 0
  cameraY = 0
  message = "press enter for random seed, or type a seed"

  private startX = 150
  private furthestX = 150
  private cameraVX = 0
  private cameraVY = 0

  constructor(seed = 0x6d2b79f5, bestMeters = 0) {
    this.seedValue = normalizeSeedValue(seed)
    this.seedText = seedTextFromValue(this.seedValue)
    this.bestMeters = bestMeters
    this.world = new World(this.seedValue)
    this.player = this.makePlayer()
  }

  setBest(bestMeters: number): void {
    this.bestMeters = Math.max(0, Math.floor(bestMeters))
  }

  start(seed?: number): void {
    if (seed != null) {
      this.seedValue = normalizeSeedValue(seed)
      this.seedText = seedTextFromValue(this.seedValue)
    }
    this.resetRun()
    this.screen = "playing"
  }

  randomStart(): void {
    const rng = new Mulberry32(Date.now() >>> 0)
    this.start(rng.int(1, 0xffffffff))
  }

  resetRun(): void {
    this.world = new World(this.seedValue)
    this.player = this.makePlayer()
    this.world.generateUntil(2000)
    const firstAnchor = this.world.anchors[0] ?? null
    this.player.anchor = firstAnchor
    this.player.attached = Boolean(firstAnchor)
    if (firstAnchor) {
      this.player.ropeLength = 150
      this.player.angle = 0.1
      this.syncAttachedKinematics()
    }
    this.time = 0
    this.scoreMeters = 0
    this.furthestX = this.player.x
    this.startX = this.player.x
    this.cameraX = 0
    this.cameraY = 0
    this.cameraVX = 0
    this.cameraVY = 0
    this.ropeShot = null
    this.message = "space hook/release · wasd/arrows move · r retry · esc pause · q quit"
  }

  togglePause(): void {
    if (this.screen === "playing") {
      this.screen = "paused"
      this.message = "paused · esc resume · r retry · h menu · q quit"
    } else if (this.screen === "paused") {
      this.screen = "playing"
      this.message = "space hook/release · wasd/arrows move · r retry · esc pause · q quit"
    }
  }

  returnToMenu(): void {
    this.screen = "menu"
    this.message = "press enter for random seed, type seed then enter, q quit"
  }

  action(): void {
    if (this.screen === "menu") {
      this.randomStart()
      return
    }
    if (this.screen === "crashed") {
      this.start()
      return
    }
    if (this.screen !== "playing") return

    if (this.player.attached) {
      this.release()
    } else {
      if (this.ropeShot) return
      const anchor = this.focusedAnchor ?? this.findFocusedAnchor()
      if (!anchor) return
      const d = Math.hypot(anchor.x - this.player.x, anchor.y - this.player.y)
      if (d <= HOOK_RANGE) {
        this.ropeShot = {
          anchor,
          t: 0,
          duration: clamp(d / ROPE_SHOT_SPEED, ROPE_SHOT_MIN_DURATION, ROPE_SHOT_MAX_DURATION),
        }
        this.message = "hook fired"
      }
    }
  }

  update(dt: number): void {
    if (this.screen !== "playing") return
    dt = Math.min(dt, 1 / 30)
    this.time += dt
    this.world.generateUntil(this.player.x + 1800)
    this.focusedAnchor = this.findFocusedAnchor()

    if (this.ropeShot) this.ropeShot.t += dt

    if (this.player.attached) this.updateAttached(dt)
    else this.updateFree(dt)

    if (this.ropeShot && this.ropeShot.t >= this.ropeShot.duration) {
      const shot = this.ropeShot
      this.ropeShot = null
      if (
        !this.player.attached &&
        shot.anchor &&
        Math.hypot(shot.anchor.x - this.player.x, shot.anchor.y - this.player.y) <= HOOK_RANGE + ROPE_ATTACH_GRACE
      ) {
        this.attach(shot.anchor)
      } else {
        this.message = "missed hook"
      }
    }

    this.furthestX = Math.max(this.furthestX, this.player.x)
    this.scoreMeters = Math.max(0, Math.floor((this.furthestX - this.startX) / WORLD_PX_PER_METER))
    this.player.runPhase += dt * clamp(Math.hypot(this.player.vx, this.player.vy) / 80, 3, 18)
    const targetCameraX = this.player.x + clamp(this.player.vx * 0.18, -300, 420) - 1280 * 0.44
    const targetCameraY = this.player.y + clamp(this.player.vy * 0.1, -220, 220) - 720 * 0.52
    const stiffness = 44
    const damping = 13
    this.cameraVX += (targetCameraX - this.cameraX) * stiffness * dt
    this.cameraVY += (targetCameraY - this.cameraY) * stiffness * dt
    this.cameraVX *= Math.exp(-damping * dt)
    this.cameraVY *= Math.exp(-damping * dt)
    this.cameraX += this.cameraVX * dt
    this.cameraY += this.cameraVY * dt

    if (this.hitsWorld()) this.crash()
  }

  snapshot(): GameSnapshot {
    const left = this.cameraX - 120
    const right = this.cameraX + 1750
    return {
      seedText: this.seedText,
      scoreMeters: this.scoreMeters,
      bestMeters: this.bestMeters,
      screen: this.screen,
      player: { ...this.player },
      anchors: this.world.anchors.filter((a) => a.x >= left && a.x <= right),
      obstacles: this.world.obstacles.filter((o) => o.x >= left && o.x <= right),
      terrain: sampleTerrain(this.world, left, right, 36),
      cameraX: this.cameraX,
      cameraY: this.cameraY,
      time: this.time,
      focusedAnchor: this.focusedAnchor ? { ...this.focusedAnchor } : null,
      ropeShot: this.ropeShot ? { anchor: { ...this.ropeShot.anchor }, t: this.ropeShot.t, duration: this.ropeShot.duration } : null,
      message: this.message,
    }
  }

  private makePlayer(): Player {
    return {
      x: 150,
      y: 275,
      vx: 0,
      vy: 0,
      attached: true,
      alive: true,
      anchor: null,
      ropeLength: 175,
      angle: 0.9,
      angularVelocity: 0,
      runPhase: 0,
    }
  }

  private updateAttached(dt: number): void {
    const anchor = this.player.anchor
    if (!anchor) {
      this.player.attached = false
      return
    }
    const control = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0)
    const reel = (this.input.down ? 1 : 0) - (this.input.up ? 1 : 0)

    const speed = Math.hypot(this.player.vx, this.player.vy)
    const nonlinearDrag = 0.018 + Math.pow(speed / 2100, 2.2) * 1.9
    const drag = Math.exp(-nonlinearDrag * dt)
    this.player.vx *= drag
    this.player.vy *= drag

    this.player.vy += GRAVITY * dt
    this.player.x += this.player.vx * dt
    this.player.y += this.player.vy * dt

    const dx = this.player.x - anchor.x
    const dy = this.player.y - anchor.y
    const d = Math.max(0.0001, Math.hypot(dx, dy))
    const nx = dx / d
    const ny = dy / d

    if (control) {
      const ax = control * SWING_ACCEL
      const radialAccel = ax * nx
      this.player.vx += (ax - radialAccel * nx) * dt
      this.player.vy += -radialAccel * ny * dt
    }

    if (Math.abs(reel) > 0.0001) {
      const oldLength = this.player.ropeLength
      this.player.ropeLength = adjustedRopeLength(oldLength, reel * ROPE_REEL_SPEED * dt)
      if (this.player.ropeLength !== oldLength) {
        const tx = -ny
        const ty = nx
        const tangentSpeed = this.player.vx * tx + this.player.vy * ty
        const radialSpeed = this.player.vx * nx + this.player.vy * ny
        const energyScale = clamp(oldLength / this.player.ropeLength, 0.985, 1.018)
        this.player.vx = tx * tangentSpeed * energyScale + nx * radialSpeed
        this.player.vy = ty * tangentSpeed * energyScale + ny * radialSpeed
      }
    }

    this.player.x = anchor.x + nx * this.player.ropeLength
    this.player.y = anchor.y + ny * this.player.ropeLength
    const radial = this.player.vx * nx + this.player.vy * ny
    this.player.vx -= radial * nx
    this.player.vy -= radial * ny

    this.player.angle = Math.atan2(this.player.x - anchor.x, this.player.y - anchor.y)
    this.player.angularVelocity = (this.player.vx * ny - this.player.vy * nx) / Math.max(1, this.player.ropeLength)
  }

  private updateFree(dt: number): void {
    const ax = ((this.input.right ? 1 : 0) - (this.input.left ? 1 : 0)) * AIR_ACCEL
    this.player.vx += ax * dt
    const speed = Math.hypot(this.player.vx, this.player.vy)
    const nonlinearDrag = 0.018 + Math.pow(speed / 2100, 2.2) * 1.9
    const drag = Math.exp(-nonlinearDrag * dt)
    this.player.vx *= drag
    this.player.vy *= drag
    this.player.vy += GRAVITY * dt
    this.player.x += this.player.vx * dt
    this.player.y += this.player.vy * dt
  }

  private syncAttachedKinematics(): void {
    const anchor = this.player.anchor
    if (!anchor) return
    const sin = Math.sin(this.player.angle)
    const cos = Math.cos(this.player.angle)
    this.player.x = anchor.x + sin * this.player.ropeLength
    this.player.y = anchor.y + cos * this.player.ropeLength
    this.player.vx = cos * this.player.angularVelocity * this.player.ropeLength
    this.player.vy = -sin * this.player.angularVelocity * this.player.ropeLength
  }

  private release(): void {
    this.player.attached = false
    this.player.anchor = null
    this.ropeShot = null
    this.message = "released · space hooks nearest anchor in range"
  }

  private attach(anchor: Anchor): void {
    this.player.anchor = anchor
    this.player.attached = true
    const dx = this.player.x - anchor.x
    const dy = this.player.y - anchor.y
    this.player.ropeLength = clamp(Math.hypot(dx, dy), MIN_ROPE, MAX_ROPE)
    this.player.angle = Math.atan2(this.player.x - anchor.x, this.player.y - anchor.y)
    const d = Math.max(0.0001, Math.hypot(dx, dy))
    const nx = dx / d
    const ny = dy / d
    const radial = this.player.vx * nx + this.player.vy * ny
    if (radial > 0) {
      this.player.vx -= radial * nx * 0.35
      this.player.vy -= radial * ny * 0.35
    }
    this.player.angularVelocity = (this.player.vx * ny - this.player.vy * nx) / Math.max(1, this.player.ropeLength)
    this.message = "hooked"
  }

  private findFocusedAnchor(): Anchor | null {
    let best: Anchor | null = null
    let bestScore = Infinity
    const speed = Math.hypot(this.player.vx, this.player.vy)
    const speedT = clamp((speed - FOCUS_MIN_MOMENTUM_SPEED) / (FOCUS_FULL_BIAS_SPEED - FOCUS_MIN_MOMENTUM_SPEED), 0, 1)
    const directionBias = FOCUS_DIRECTION_BIAS * smoothstep01(speedT)
    const aimX = speed > 0.0001 ? this.player.vx / speed : 0
    const aimY = speed > 0.0001 ? this.player.vy / speed : 0
    for (const anchor of this.world.anchors) {
      if (anchor === this.player.anchor) continue
      if (anchor.x < this.player.x - 200) continue
      const d = Math.hypot(anchor.x - this.player.x, anchor.y - this.player.y)
      const dx = anchor.x - this.player.x
      const dy = anchor.y - this.player.y
      const alignment = directionBias ? (dx / Math.max(1, d)) * aimX + (dy / Math.max(1, d)) * aimY : 0
      let score = d - alignment * directionBias
      if (d > HOOK_RANGE) score += (d - HOOK_RANGE) * FOCUS_OUT_OF_RANGE_WEIGHT
      if (score < bestScore) {
        best = anchor
        bestScore = score
      }
    }
    return best
  }

  private findAttachAnchor(): Anchor | null {
    let best: Anchor | null = null
    let bestD = Infinity
    for (const anchor of this.world.anchors) {
      if (anchor.x < this.player.x - 260) continue
      const d = Math.hypot(anchor.x - this.player.x, anchor.y - this.player.y)
      if (d <= HOOK_RANGE + ROPE_ATTACH_GRACE && d < bestD) {
        best = anchor
        bestD = d
      }
    }
    return best
  }

  private hitsWorld(): boolean {
    if (this.player.y > LOST_BELOW_Y) return true
    if (this.player.y + 22 >= this.world.terrainYAt(this.player.x)) return true
    for (const obstacle of this.world.obstacles) {
      if (Math.abs(obstacle.x - this.player.x) > 140) continue
      if (hitsObstacle(this.player, obstacle, this.time, this.world)) return true
    }
    return false
  }

  private crash(): void {
    this.player.alive = false
    this.screen = "crashed"
    if (this.scoreMeters > this.bestMeters) this.bestMeters = this.scoreMeters
    this.message = `crash · score ${this.scoreMeters}m · best ${this.bestMeters}m · space/r retry · h menu`
    this.player.attached = false
    this.player.anchor = null
    this.ropeShot = null
  }
}

function adjustedRopeLength(oldLength: number, delta: number): number {
  const next = oldLength + delta
  if (oldLength < MIN_ROPE) return delta > 0 ? Math.min(next, MIN_ROPE) : oldLength
  if (oldLength > MAX_ROPE) return delta < 0 ? Math.max(next, MAX_ROPE) : oldLength
  return clamp(next, MIN_ROPE, MAX_ROPE)
}

function smoothstep01(t: number): number {
  t = clamp(t, 0, 1)
  return t * t * (3 - 2 * t)
}

export function sampleTerrain(world: World, left: number, right: number, step: number): Vec2[] {
  const points: Vec2[] = []
  for (let x = left; x <= right; x += step) points.push({ x, y: world.terrainYAt(x) })
  return points
}

export function hitsObstacle(player: Player, obstacle: Obstacle, time: number, world: World): boolean {
  if (obstacle.type === "saw") {
    const y = obstacle.y + Math.sin(time * 1.5 + obstacle.phase) * obstacle.bob * 0.25
    return Math.hypot(player.x - obstacle.x, player.y - y) < obstacle.r + 18
  }
  if (obstacle.type === "gate") {
    const gapY = obstacle.gapY + Math.sin(time * obstacle.speed + obstacle.phase) * 58
    const topBottom = gapY - obstacle.gap / 2
    const bottomTop = gapY + obstacle.gap / 2
    const inX = player.x + 14 >= obstacle.x && player.x - 14 <= obstacle.x + obstacle.w
    return inX && (player.y - 18 < topBottom || player.y + 18 > bottomTop)
  }
  const spikeY = obstacle.ground ? world.terrainYAt(obstacle.x) : obstacle.y
  const width = obstacle.count * obstacle.size * 0.86
  const inX = player.x > obstacle.x - 12 && player.x < obstacle.x + width + 12
  if (!inX) return false
  return obstacle.ground ? player.y + 18 > spikeY - obstacle.size * 1.35 : player.y - 18 < spikeY + obstacle.size * 1.35
}
