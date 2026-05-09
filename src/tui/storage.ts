import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Context, Data, Effect, Layer } from "effect";

export interface StoredState {
  bestMeters: number;
}

export class StorageError extends Data.TaggedError("StorageError")<{
  operation: "load" | "save";
  cause: unknown;
}> {}

export interface Storage {
  readonly load: Effect.Effect<StoredState, StorageError>;
  readonly save: (state: StoredState) => Effect.Effect<void, StorageError>;
}

export class StorageService extends Context.Tag("StorageService")<StorageService, Storage>() {}

export const DEFAULT_STATE: StoredState = { bestMeters: 0 };

export function statePath(): string {
  const base = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(base, "ropeman", "state.json");
}

export const loadStateFromDisk = Effect.try({
  try: (): StoredState => {
    const path = statePath();
    if (!existsSync(path)) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<StoredState>;
    return { bestMeters: Math.max(0, Math.floor(Number(parsed.bestMeters) || 0)) };
  },
  catch: (cause) => new StorageError({ operation: "load", cause }),
});

export function saveStateToDisk(state: StoredState): Effect.Effect<void, StorageError> {
  return Effect.try({
    try: () => {
      const path = statePath();
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        `${JSON.stringify({ bestMeters: Math.max(0, Math.floor(state.bestMeters)) }, null, 2)}\n`,
      );
    },
    catch: (cause) => new StorageError({ operation: "save", cause }),
  });
}

export const StorageLive = Layer.succeed(StorageService, {
  load: loadStateFromDisk,
  save: saveStateToDisk,
});
