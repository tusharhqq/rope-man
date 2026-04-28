import { createCliRenderer, FrameBufferRenderable, type CliRenderer, type KeyEvent } from "@opentui/core"
import { RopeManGame } from "../game/engine.js"
import { parseSeedText } from "../game/seed.js"
import { renderGame } from "./render.js"
import { loadState, saveState } from "./storage.js"

const FIXED_STEP = 1 / 60

export async function runTerminalGame(): Promise<void> {
  const stored = loadState()
  const game = new RopeManGame(undefined, stored.bestMeters)
  const renderer = await createCliRenderer({ exitOnCtrlC: true, targetFps: 60 })
  renderer.start()

  const frame = new FrameBufferRenderable(renderer, {
    id: "ropeman-main",
    width: renderer.terminalWidth,
    height: renderer.terminalHeight,
    position: "absolute",
    zIndex: 1,
  })
  renderer.root.add(frame)

  let accumulator = 0
  let seedDraft = ""
  let seedError = ""
  const heldUntil = {
    left: 0,
    right: 0,
    up: 0,
    down: 0,
  }

  const persistBest = (): void => {
    if (game.bestMeters > stored.bestMeters) {
      stored.bestMeters = game.bestMeters
      saveState(stored)
    }
  }

  const resizeHandler = (width: number, height: number): void => {
    frame.frameBuffer.resize(width, height)
    frame.width = width
    frame.height = height
  }

  const keyHandler = (key: KeyEvent): void => {
    const name = key.name
    if (key.ctrl && name === "c") {
      persistBest()
      renderer.destroy()
      return
    }
    if (name === "q") {
      persistBest()
      renderer.destroy()
      return
    }

    if (game.screen === "menu") {
      if (name === "return" || name === "enter") {
        if (!seedDraft) {
          game.randomStart()
          return
        }
        const parsed = parseSeedText(seedDraft)
        if (parsed.value == null) {
          seedError = parsed.error
        } else {
          seedDraft = ""
          seedError = ""
          game.start(parsed.value)
        }
        return
      }
      if (name === "backspace" || name === "delete") {
        seedDraft = seedDraft.slice(0, -1)
        seedError = ""
        return
      }
      if (key.sequence && /^[0-9a-zA-Z]$/.test(key.sequence) && seedDraft.length < 6) {
        seedDraft += key.sequence
        seedError = ""
      }
      return
    }

    if (name === "escape") {
      game.togglePause()
      return
    }
    if (name === "h") {
      persistBest()
      game.returnToMenu()
      return
    }
    if (name === "r") {
      game.start()
      return
    }
    if (name === "space") {
      game.action()
      return
    }

    setInput(game, name, true, heldUntil)
  }

  const keyReleaseHandler = (key: KeyEvent): void => {
    setInput(game, key.name, false, heldUntil)
  }

  renderer.on("resize", resizeHandler)
  renderer.keyInput.on("keypress", keyHandler)
  renderer.keyInput.on("keyrelease", keyReleaseHandler)

  renderer.setFrameCallback(async (deltaMs: number) => {
    expireInputs(game, heldUntil)
    accumulator += Math.min(deltaMs / 1000, 0.1)
    while (accumulator >= FIXED_STEP) {
      const beforeBest = game.bestMeters
      game.update(FIXED_STEP)
      if (game.bestMeters > beforeBest) persistBest()
      accumulator -= FIXED_STEP
    }
    renderGame(frame.frameBuffer, game, { seedDraft, seedError })
  })
}

type HeldUntil = Record<"left" | "right" | "up" | "down", number>

function setInput(game: RopeManGame, name: string, value: boolean, heldUntil: HeldUntil): void {
  const until = value ? Date.now() + 135 : 0
  switch (name) {
    case "a":
    case "left":
      game.input.left = value
      heldUntil.left = until
      break
    case "d":
    case "right":
      game.input.right = value
      heldUntil.right = until
      break
    case "w":
    case "up":
      game.input.up = value
      heldUntil.up = until
      break
    case "s":
    case "down":
      game.input.down = value
      heldUntil.down = until
      break
  }
}

function expireInputs(game: RopeManGame, heldUntil: HeldUntil): void {
  const now = Date.now()
  if (heldUntil.left && heldUntil.left < now) game.input.left = false
  if (heldUntil.right && heldUntil.right < now) game.input.right = false
  if (heldUntil.up && heldUntil.up < now) game.input.up = false
  if (heldUntil.down && heldUntil.down < now) game.input.down = false
}
