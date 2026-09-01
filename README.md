# Spaceport-99

A Fallout Shelter–style station management game, in orbit. Dig rooms into a hull
instead of a hillside, keep a crew of drifters breathing, and try not to let the
reactor catch fire.

Mobile first: portrait phone is the primary target, with a thumb-height tab bar,
bottom-sheet panels, a pannable station and drag-and-drop crew assignment. The
same DOM unfolds into a two-column desktop layout at 900px.

Built with React + TypeScript + Vite. No backend — the whole simulation runs in
the browser and saves to `localStorage`.

**Play it:** https://cyberhirsch.github.io/Spaceport-99/

```bash
npm install
npm run dev      # http://localhost:5173
npm run test     # geometry rules, via node:test — no test framework needed
npm run build    # typecheck + production bundle into dist/
npm run lint
```

## How it plays

You start with a reactor, an air plant, a hydroponics bay and five founders.
Everything after that is yours to build.

**Three resources, produced in cycles and consumed continuously.** Staffed rooms
fill their progress bar and dump a batch into storage; your crew burn oxygen and
rations every second, and every powered room draws off the grid. The header shows
the live net rate for each — that number going red is the only warning you get.

**Crew go where you drag them.** Pick a portrait up out of the tray at the bottom
of the screen and drop it on a room to post someone there; drop it back on the
tray to stand them down; drag straight from one room to another to reassign.
Valid rooms light up while a portrait is in the air, full ones dim, and dragging
towards an edge pans the station. Tap a portrait instead of dragging it to open
that crew member's file. It is one pointer-event implementation, so a mouse
behaves exactly like a finger.

**O.R.B.I.T.A.L.** — Operations, Reflex, Brawn, Intellect, Tech, Adaptability,
Luck. Every room is driven by one stat, and a room runs at the speed of the
people standing in it. A full crew of rookies runs a room at roughly 100%; a
well-trained veteran crew pushes past 170%. *Auto-assign roster* does a
greedy best-fit pass if you would rather not micromanage.

**Every deck is symmetrical.** A lift shaft runs down the centre of the station
with a five-slot wing either side of it. Rooms hang off the shaft and grow
outward along their wing, and only the room at the outer end of a run can be
scrapped, so nothing is ever stranded with no corridor back to the lift.

**Rooms merge.** Build two identical rooms of the same level side by side in the
same wing and they fuse into one wider room — more staff slots, more output per
cycle, up to three segments. Merges never cross the shaft, and neither do
emergencies: the lift is a fire break.

**Rushing** finishes a production cycle instantly. It also might start a fire.
The risk climbs with every successful rush and decays slowly while you leave the
room alone.

**Emergencies** — electrical fires, hull breaches, boarding parties and void
mites — are fought by whoever is standing in that room, using the stat named in
the room panel. They chew through the room's condition, drain whichever supply
suits them, and spread to neighbouring rooms if nobody is beating them back.
Crew who drop below a quarter health fall back to the spine and return to their
post once they have healed up. Automated suppression handles an unattended
emergency eventually, but far too slowly to rely on.

**Growth.** Crew Quarters raise your bunk cap; drifters dock on their own if you
have a spare bunk and a well-run station. A staffed Comms Array lets you spend
credits to broadcast a recruitment beacon, and high-Luck operators pull in better
people. Training rooms raise a single stat, one point per cycle, each point
slower than the last.

**Money** comes from docking fees (scaled with crew and station size), the
Fabricator, the Comms Array, and salvage from emergencies you put down. Spend it
on rooms, upgrades, new decks, reviving the dead, and emergency resupply barges
when a supply run dry — that last one is your way out of a death spiral.

The station keeps running while the tab is closed, catching up on as much as four
hours when you return. Nobody dies during that catch-up: you come back to a
station in crisis rather than to a tomb.

## Layout

```
src/
  game/
    types.ts       data model — crew, modules, incidents, save shape
    modules.ts     the room catalogue and its cost/yield/capacity maths
    crew.ts        name and stat generation, xp curve, effectiveness, portraits
    incidents.ts   the four emergency types and their numbers
    engine.ts      the simulation: derive(), the per-second step, and the reducer
    save.ts        localStorage round-trip
    __tests__/     station geometry: wings, merging, scrapping
  hooks/
    useGame.ts       tick loop, autosave, offline catch-up
    useDragAssign.ts pointer-event drag and drop for crew assignment
    useMediaQuery.ts the one place layout behaviour branches on screen size
  components/        station grid, bottom sheets, modals, crew portraits
  index.css          mobile-first, with a single 900px desktop breakpoint
```

## Continuous integration

`.github/workflows/build.yml` typechecks, lints, tests and builds on every push
and pull request. Pushes to the default branch also publish the bundle to GitHub
Pages; other branches are checked but never deployed.

Pages serves a project site from `/<repo>/`, so the build sets Vite's `base` to
match — read from `GITHUB_REPOSITORY` rather than hardcoded, so renaming the
repository cannot silently break every asset URL. Local builds stay at `/`.

**One-time setup:** Pages has to be switched on by hand under
*Settings → Pages → Source → "GitHub Actions"*. A workflow cannot do it for
itself — creating a Pages site needs `administration: write`, which is not a
permission `permissions:` can grant. Until it is on, the deploy job fails with
`Get Pages site failed … Not Found` while the build job stays green.

`engine.ts` is the whole game. `reducer(state, action)` is the only way state
changes, `advance(state, seconds)` splits any elapsed span into one-second steps,
and `derive(state)` computes everything the UI displays but never stores.
