import { describe, expect, test } from "bun:test"
import { OptimizedBuffer } from "@opentui/core"
import { RopeManGame } from "../src/game/engine.js"
import { renderGame } from "../src/tui/render.js"

function plainText(buffer: OptimizedBuffer): string {
  return buffer
    .getSpanLines()
    .map((line) => line.spans.map((span) => span.text).join(""))
    .join("\n")
}

describe("terminal renderer", () => {
  test("renders the menu screen", () => {
    const buffer = OptimizedBuffer.create(80, 24, "unicode")
    const game = new RopeManGame(42, 12)
    renderGame(buffer, game, { seedDraft: "abc", seedError: "" })
    const text = plainText(buffer)
    expect(text).toContain("ROPE MAN")
    expect(text).toContain("seed: abc")
    expect(text).toContain("best: 12m")
    buffer.destroy()
  })

  test("renders a playing world", () => {
    const buffer = OptimizedBuffer.create(100, 30, "unicode")
    const game = new RopeManGame(42, 0)
    game.start()
    renderGame(buffer, game, { seedDraft: "", seedError: "" })
    const text = plainText(buffer)
    expect(text).toContain("score 0m")
    expect(text).toContain("space hook")
    expect(text).toMatch(/[ox◎▲✹▄]/)
    buffer.destroy()
  })
})
