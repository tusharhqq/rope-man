# Rope Man

https://github.com/user-attachments/assets/ad95acf3-99e2-4893-ab81-d6000c5bdd94

Terminal Rope Man game powered by OpenTUI.

## Run

```bash
bunx ropeman
npx ropeman
pnpm dlx ropeman
```

After cloning the repo:

```bash
bun install
bun run dev
```

## Controls

| Action              | Key                           |
| ------------------- | ----------------------------- |
| Start random seed   | `Enter` on the menu           |
| Start specific seed | Type seed, then `Enter`       |
| Hook / release rope | `Space`                       |
| Swing / air-control | `A` / `D` or `Left` / `Right` |
| Reel rope           | `W` / `S` or `Up` / `Down`    |
| Retry current seed  | `R`                           |
| Pause / resume      | `Esc`                         |
| Main menu           | `H`                           |
| Quit                | `Q`                           |

## Verify

```bash
bun run test
bunx tsc -p tsconfig.json --noEmit
bun pm pack --dry-run
```
