import {
  createCliRenderer,
  FrameBufferRenderable,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core";
import { Deferred, Effect } from "effect";
import { RopeManGame } from "../game/engine.js";
import { parseSeedText } from "../game/seed.js";
import { renderGame } from "./render.js";
import { DEFAULT_STATE, StorageLive, StorageService, type StoredState } from "./storage.js";

const FIXED_STEP = 1 / 60;

export function runTerminalGame(): Promise<void> {
  return Effect.runPromise(Effect.provide(runTerminalGameEffect, StorageLive));
}

export const runTerminalGameEffect = Effect.scoped(
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const stored = yield* storage.load.pipe(
      Effect.catchAll((error) =>
        Effect.logWarning(
          `Could not load saved state; starting fresh (${String(error.cause)})`,
        ).pipe(Effect.as({ ...DEFAULT_STATE })),
      ),
    );
    const game = new RopeManGame(undefined, stored.bestMeters);
    const destroyed = yield* Deferred.make<void>();
    const renderer = yield* acquireRenderer(destroyed);
    renderer.start();

    const frame = new FrameBufferRenderable(renderer, {
      id: "ropeman-main",
      width: renderer.terminalWidth,
      height: renderer.terminalHeight,
      position: "absolute",
      zIndex: 1,
    });
    renderer.root.add(frame);

    let accumulator = 0;
    let seedDraft = "";
    let seedError = "";
    let persistedBest = stored.bestMeters;
    let pendingBest: StoredState | null = null;
    const heldUntil = {
      left: 0,
      right: 0,
      up: 0,
      down: 0,
    };

    const markBestForPersistence = (): void => {
      if (game.bestMeters > persistedBest) pendingBest = { bestMeters: game.bestMeters };
    };

    const flushBest = Effect.gen(function* () {
      const next = pendingBest;
      if (!next) return;
      yield* storage.save(next);
      persistedBest = next.bestMeters;
      if (pendingBest?.bestMeters === next.bestMeters) pendingBest = null;
    }).pipe(
      Effect.catchAll((error) =>
        Effect.logWarning(`Could not save best score (${String(error.cause)})`),
      ),
    );

    yield* Effect.forkScoped(
      Effect.forever(Effect.sleep("500 millis").pipe(Effect.zipRight(flushBest))),
    );
    yield* Effect.addFinalizer(() => flushBest);

    const resizeHandler = (width: number, height: number): void => {
      frame.frameBuffer.resize(width, height);
      frame.width = width;
      frame.height = height;
    };

    const keyPressEffect = (key: KeyEvent) =>
      Effect.sync(() => {
        const name = key.name;
        if (key.ctrl && name === "c") {
          markBestForPersistence();
          renderer.destroy();
          return;
        }
        if (name === "q") {
          markBestForPersistence();
          renderer.destroy();
          return;
        }

        if (game.screen === "menu") {
          if (name === "return" || name === "enter") {
            if (!seedDraft) {
              game.randomStart();
              return;
            }
            const parsed = parseSeedText(seedDraft);
            if (parsed.value == null) {
              seedError = parsed.error;
            } else {
              seedDraft = "";
              seedError = "";
              game.start(parsed.value);
            }
            return;
          }
          if (name === "backspace" || name === "delete") {
            seedDraft = seedDraft.slice(0, -1);
            seedError = "";
            return;
          }
          if (key.sequence && /^[0-9a-zA-Z]$/.test(key.sequence) && seedDraft.length < 6) {
            seedDraft += key.sequence;
            seedError = "";
          }
          return;
        }

        if (name === "escape") {
          game.togglePause();
          return;
        }
        if (name === "h") {
          markBestForPersistence();
          game.returnToMenu();
          return;
        }
        if (name === "r") {
          game.start();
          return;
        }
        if (name === "space") {
          game.action();
          return;
        }

        setInput(game, name, true, heldUntil);
      });

    const keyReleaseEffect = (key: KeyEvent) =>
      Effect.sync(() => setInput(game, key.name, false, heldUntil));

    const keyHandler = (key: KeyEvent): void => {
      Effect.runSync(keyPressEffect(key));
    };

    const keyReleaseHandler = (key: KeyEvent): void => {
      Effect.runSync(keyReleaseEffect(key));
    };

    const frameCallback = (deltaMs: number): Promise<void> => {
      expireInputs(game, heldUntil);
      accumulator += Math.min(deltaMs / 1000, 0.1);
      while (accumulator >= FIXED_STEP) {
        const beforeBest = game.bestMeters;
        game.update(FIXED_STEP);
        if (game.bestMeters > beforeBest) markBestForPersistence();
        accumulator -= FIXED_STEP;
      }
      renderGame(frame.frameBuffer, game, { seedDraft, seedError });
      return Promise.resolve();
    };

    renderer.on("resize", resizeHandler);
    renderer.keyInput.on("keypress", keyHandler);
    renderer.keyInput.on("keyrelease", keyReleaseHandler);
    renderer.setFrameCallback(frameCallback);

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        renderer.off("resize", resizeHandler);
        renderer.keyInput.off("keypress", keyHandler);
        renderer.keyInput.off("keyrelease", keyReleaseHandler);
        renderer.removeFrameCallback(frameCallback);
      }),
    );

    yield* Deferred.await(destroyed);
  }),
);

function acquireRenderer(destroyed: Deferred.Deferred<void>) {
  return Effect.acquireRelease(
    Effect.promise(() =>
      createCliRenderer({
        exitOnCtrlC: true,
        targetFps: 60,
        onDestroy: () => {
          Effect.runFork(Deferred.succeed(destroyed, undefined));
        },
      }),
    ),
    (renderer) =>
      Effect.sync(() => {
        if (!renderer.isDestroyed) renderer.destroy();
      }),
  );
}

type HeldUntil = Record<"left" | "right" | "up" | "down", number>;

function setInput(game: RopeManGame, name: string, value: boolean, heldUntil: HeldUntil): void {
  const until = value ? Date.now() + 135 : 0;
  switch (name) {
    case "a":
    case "left":
      game.input.left = value;
      heldUntil.left = until;
      break;
    case "d":
    case "right":
      game.input.right = value;
      heldUntil.right = until;
      break;
    case "w":
    case "up":
      game.input.up = value;
      heldUntil.up = until;
      break;
    case "s":
    case "down":
      game.input.down = value;
      heldUntil.down = until;
      break;
  }
}

function expireInputs(game: RopeManGame, heldUntil: HeldUntil): void {
  const now = Date.now();
  if (heldUntil.left && heldUntil.left < now) game.input.left = false;
  if (heldUntil.right && heldUntil.right < now) game.input.right = false;
  if (heldUntil.up && heldUntil.up < now) game.input.up = false;
  if (heldUntil.down && heldUntil.down < now) game.input.down = false;
}
