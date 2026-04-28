import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export interface StoredState {
  bestMeters: number
}

const DEFAULT_STATE: StoredState = { bestMeters: 0 }

export function statePath(): string {
  const base = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
  return join(base, "ropeman", "state.json")
}

export function loadState(): StoredState {
  const path = statePath()
  try {
    if (!existsSync(path)) return { ...DEFAULT_STATE }
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<StoredState>
    return { bestMeters: Math.max(0, Math.floor(Number(parsed.bestMeters) || 0)) }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export function saveState(state: StoredState): void {
  const path = statePath()
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify({ bestMeters: Math.max(0, Math.floor(state.bestMeters)) }, null, 2)}\n`)
  } catch {
    // Ignore storage failures. The game remains fully playable without persistence.
  }
}
