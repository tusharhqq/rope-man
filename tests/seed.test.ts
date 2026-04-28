import { describe, expect, test } from "bun:test"
import { Mulberry32, parseSeedText, seedTextFromValue } from "../src/game/seed.js"

describe("seed parsing", () => {
  test("round-trips base62 seed text", () => {
    const parsed = parseSeedText("abc12")
    expect(parsed.error).toBe("")
    expect(parsed.value).toBeTruthy()
    expect(seedTextFromValue(parsed.value!)).toBe(parsed.text)
  })

  test("rejects invalid seed text", () => {
    expect(parseSeedText("").error).toBe("enter a seed first")
    expect(parseSeedText("abc!").error).toBe("use only letters and numbers")
    expect(parseSeedText("000").error).toBe("seed cannot be all zeroes")
  })
})

describe("rng", () => {
  test("is deterministic", () => {
    const a = new Mulberry32(123)
    const b = new Mulberry32(123)
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()])
  })
})
