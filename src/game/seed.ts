export const BASE62_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
export const DEFAULT_RNG_SEED = 0x6d2b79f5
export const MAX_SEED_TEXT_LENGTH = 6
export const MAX_SEED_VALUE = 0xffffffff

export interface SeedParseResult {
  value: number | null
  text: string
  error: string
}

export function normalizeSeedValue(value: number): number {
  value >>>= 0
  return value || DEFAULT_RNG_SEED
}

export function seedTextFromValue(value: number): string {
  value = normalizeSeedValue(value)
  let text = ""
  do {
    text = BASE62_ALPHABET[value % 62] + text
    value = Math.floor(value / 62)
  } while (value > 0)
  return text
}

export function parseSeedText(text: string): SeedParseResult {
  const trimmed = (text || "").trim()
  if (!trimmed) return { value: null, text: "", error: "enter a seed first" }
  if (trimmed.length > MAX_SEED_TEXT_LENGTH) {
    return { value: null, text: trimmed, error: `use ${MAX_SEED_TEXT_LENGTH} letters/numbers or fewer` }
  }

  let value = 0
  for (const ch of trimmed) {
    const digit = BASE62_ALPHABET.indexOf(ch)
    if (digit < 0) return { value: null, text: trimmed, error: "use only letters and numbers" }
    value = value * 62 + digit
    if (value > MAX_SEED_VALUE) return { value: null, text: trimmed, error: "that seed is too large" }
  }
  if (value === 0) return { value: null, text: trimmed, error: "seed cannot be all zeroes" }

  value = normalizeSeedValue(value)
  return { value, text: seedTextFromValue(value), error: "" }
}

export class Mulberry32 {
  private state: number

  constructor(seed: number) {
    this.state = normalizeSeedValue(seed)
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1))
  }
}
