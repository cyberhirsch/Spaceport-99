# Spaceport-99 Architecture

## Layer order

Game logic lives in `src/game/`, organized as a barrel of layered modules. Each layer only imports from the layers below it:

```
core → staffing → rooms → state → hazards → station → standing → recruit → 
missions → traffic → board → tick → reducer
```

Only the reducer is exported to the UI; everything else stays inside the barrel. New game logic goes into the layer that needs it, or a new layer between two existing ones if behaviour spans two without fitting either.

## Conventions

- **Only the reducer mutates.** All changes flow through `reducer(state, action)`. Within it, mutate on `structuredClone` drafts; never mutate input state.
- **Every internal import names its extension.** `from './engine.ts'` even within `src/game/`. Bare imports are barrel re-exports only (the UI imports `from './engine.ts'`).
- **Pure generators take an `Rng`.** Functions like `makeCrew`, `makeVisitor`, `makeMission` take an RNG parameter and roll from it; anything holding a `GameState` rolls from `s.rng`.
- **Tests pin a seed.** Use `seeded(n)` to get a fixed RNG, then `newGame(name, n)` to start a game with that seed. Same seed, same results, every time.
- **Save version bumps on state shape changes.** If loading an old save would break, increment `SAVE_VERSION` in `src/game/core.ts`.

## Verification

Run these before pushing:
- `npm test` — the whole suite, all seeded. Takes ~5s.
- `npx tsc -b` — typecheck, ~2s.
- `npx oxlint src` — lint, ~1s.
- `npm run build` — bundle and check for tree-shake gaps, ~10s.

For browser tests with Playwright, stub localStorage and use `addInitScript` to load a save into the page:
```ts
await ctx.addInitScript((v) => {
  const s = JSON.parse(v)
  s.lastTick = Date.now()
  localStorage.setItem('spaceport99.save', JSON.stringify(s))
}, JSON.stringify(saveState))
```

Two hard rules: **only the reducer mutates**, and **every internal import names its extension.**
