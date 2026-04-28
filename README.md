# Rope Man Terminal

Terminal-first Rope Man powered by OpenTUI.

## Run

```bash
bun install
bun run dev
```

When published to npm as `ropeman`, the game can be launched with:

```bash
bunx ropeman
```

## Controls

| Action | Key |
| --- | --- |
| Start random seed | `Enter` on the menu |
| Start specific seed | Type seed, then `Enter` |
| Hook / release rope | `Space` |
| Swing / air-control | `A` / `D` or `Left` / `Right` |
| Reel rope | `W` / `S` or `Up` / `Down` |
| Retry current seed | `R` |
| Pause / resume | `Esc` |
| Main menu | `H` |
| Quit | `Q` |

## Verify

```bash
bun run test
bunx tsc -p tsconfig.json --noEmit
bun pm pack --dry-run
```

The browser game in `rope-man-game/` is intentionally untouched. This package ports the game feel to terminal cells rather than trying to reproduce the Canvas renderer pixel-for-pixel.
