# Tasks

What is wrong with Spaceport-99, what to do about it, and who should do it.

Every task below came out of one honest read of the project after the five-room
build. They are sorted by how much judgement they need, hardest first. The
tier is a guide to which model to hand a task to, and it is about the *shape*
of the work, not its size:

- **Opus** — an open design decision, or a change that cuts across several
  systems, or anything where "done" is a matter of taste rather than a test.
- **Sonnet** — a well-specified feature or refactor across a few files with a
  clear finish line. Needs care, not invention.
- **Haiku** — one file, one idea, and the description is the whole spec.

Each task says what, why, where, and what done looks like. The "why" points at
the issue it addresses, so nothing here is a feature for its own sake.

Conventions that hold for all of them: the reducer is the only mutation path;
behaviour changes get a test in `src/game/__tests__/`; `npm test`,
`npx tsc -b`, `npx oxlint src` and `npm run build` stay green; and a change
that alters what an old save means bumps `SAVE_VERSION` in `src/game/core.ts`.

---

## Done

- **Split `engine.ts`.** It was 2,681 lines and the place everything landed.
  It is now twelve layered modules behind a barrel — `core → staffing → rooms
  → state → hazards → station → standing → recruit → missions → traffic →
  tick → reducer` — and a module only imports from the layers below it. All 37
  import sites still say `from './engine.ts'` and nothing outside `src/game/`
  changed. Verbatim move; 172 tests unchanged. The imports the split generated
  are wrapped at 100 columns like the rest of the codebase.

---

## Opus

### 1. Decide what is taking the ships, then build the questline

**Why.** The game is a very good sandbox with nothing pulling you through it.
Factions, dialogue, conquest, specs, the Brig, far work — each is a system
without a story. The anonymous letter (seven hull names and the dates they
stopped transmitting; *"None of these were lost where the record says. Check
the bearings."*) is the spine, and it is unbuilt because one thing was never
decided: **what is actually out there.** That decision sets the ending, and
the ending is what every other beat points at.

**Constraints already agreed.** No verge, nothing special about Spaceport-99;
the adventure is out there. The letter arrives from three sources — the Comms
Array, a ship or visitor, or a crew member — and the previous commander got the
same letter and flew out to check the second name. A commander who never came
back.

**Where.** New `src/game/talks/letter.ts` for the beats; a `quest` field on
`GameState` in `src/game/types.ts` (which name you are on, what you know); far
contracts in `src/game/missions.ts` become the way you check a bearing; the
Sensor Array should be able to read one wrong; the Brig should be able to hold
a witness. Reuse every existing system rather than adding one.

**Done when.** A player can receive the letter three different ways, check at
least three of the seven bearings through existing contract machinery, and
reach an ending that answers the question. Nothing in the questline is a new
mechanic; all of it is content on mechanics that exist.

### 2. Encounters — ships that are not here to trade

**Why.** Asked for and not built: *"not every ship docks, not every ship
trades, some just stay there and intimidate, others attack."* Today every hull
either hails for a berth or is the one conquest event. There is no hull that
parks two kilometres out and leans on you, no attack from outside the clamps,
no hidden intent that plays out over several beats.

**Where.** `Visitor.intent` in `src/game/types.ts` already exists for
`'conquest'`; widen it (`'loiter' | 'demand' | 'raid'`). Spawn in
`src/game/traffic.ts` next to `sendConqueror`. Each intent is a script in
`src/game/talks/` with state carried across beats via `Talk.flags`. Defence
resolves an attack the way `conquest.ts` does. The station view needs to show
a hull that is *near* but not *at* the clamps.

**Done when.** At least three intents exist, each plays out over more than one
conversation, standing and defence both matter to the outcome, and a loitering
hull that is ignored does something rather than nothing.

### 3. Give three systems a second act

**Why.** Breadth over depth. The Brig ends every story in one conversation:
nobody ever comes looking for the person you are holding, and no faction ever
asks for one back. Conquest happens once and is over. Far work is a multiplier
on pay and time, not a different kind of job. Each of these needs the thing
that happens *afterwards*.

**Where.** `src/game/talks/prisoner.ts` and `src/game/traffic.ts` (somebody
comes for a prisoner; a faction files a claim); `src/game/talks/conquest.ts`
(the flag you struck has a follow-up — the new owner's first demand, the old
owner's first visit); `src/game/missions.ts` and `src/game/calls.ts` (far work
gets its own hails, and a far team that goes silent is a beat, not a timer).

**Done when.** Holding a prisoner past a threshold triggers an arrival; ceding
the station triggers a conversation within the hour; and there is at least one
hail that only a far team ever sends.

### 4. Play it, then fix what drags

**Why.** Nobody has. Every balance claim — "4½ hours to 60 crew", "one spec
every five runs", "9 wipes in 40 idle runs" — is from a headless harness in
the scratchpad, not from a hand on the controls. The harness is good at wipes
and rates and blind to boredom.

**Where.** Everything. Keep a log while playing: where you waited with nothing
to do, where a number was wrong, where the interface made you guess.

**Done when.** One full session from a fresh station to the Trading Hub, and a
list of at least five things that dragged, each with a proposed fix. The fixes
are separate tasks; this one is the list.

### 5. A seeded random number source

**Why.** `Math.random()` is called from inside the reducer in dozens of places.
That is why tests had to be rewritten to average over sixty draws, why the
"they moved" assertion flaked, and — more seriously — why React StrictMode's
double-invocation of the reducer can produce a rendered line from one roll and
a persisted state from another. A pure reducer with an RNG in its state is
reproducible, testable with fixed seeds, and safe under StrictMode.

**Where.** `rng: number` (or a small PRNG state) on `GameState`; a `roll(s)`
helper in `src/game/core.ts` that advances it; replace every `Math.random()`
under `src/game/` (about 80 sites). The tests in `src/game/__tests__/` that
average over many draws can then assert on a seed.

**Done when.** `grep -r "Math.random" src/game` finds nothing outside the seed
initialiser, two `newGame()` calls with the same seed produce identical
stations after the same actions, and the averaging tests are replaced with
seeded ones.

---

## Sonnet

### 6. Save migrations instead of save wipes

**Why.** `SAVE_VERSION` is 7 and has been bumped every session. Each bump makes
every existing save unloadable. Fine while nobody is playing; the day someone
is, it is the worst thing the game does.

**Where.** `src/game/save.ts` loads and refuses on a version mismatch. Add a
`migrate(raw): GameState | null` that walks a list of `{ from, up }` steps,
one per version bump, and only refuses when there is no path. The steps for 5→6
(add `talk`, `nextTakeoverIn`) and 6→7 (drop removed items from `stores` and
crew `gear`) are small and worth writing as the first two.

**Done when.** A version-5 save loads on the current build; a test in
`src/game/__tests__/save.test.ts` round-trips one fixture per version; and
the README's Saving section stops saying old saves are lost.

### 7. Split the tick

**Why.** `src/game/tick.ts` is 516 lines and `step()` is most of it: the power
grid, production, life support, the med bay, the engineering bay, the lab, the
fab shop, the cells, conquest, the clamps, visitors, missions, incidents,
deaths, recruiting, and the random-event roll, in one function. Each block is
already commented as a section. They should be functions.

**Where.** `src/game/tick.ts`. One exported function per section, each taking
`(s, dt, ctx)` where `ctx` carries `crewById`, `derived`, `grid` and `alive`.
`step()` becomes twelve calls in order. No behaviour change.

**Done when.** `step()` is under 40 lines, every section is a named function
with its doc comment, and the tests are untouched and green.

### 8. New drawings after the five are found

**Why.** The Research Lab costs 600c, unlocks at 30 crew, and runs out of work
after five specs. Nothing generates another. It is the only room in the game
that goes permanently idle.

**Where.** `src/game/specs.ts` gains a `repeatable` kind — improvements rather
than unlocks (a better shield coil, a lighter plate, a faster fab pattern) —
each with a level and an effort curve. `src/game/rooms.ts` reads the level
where it computes `moduleShield`, `crewGuard`, `fabRate`. The find roll in
`src/game/missions.ts` offers one whenever no unlock spec is outstanding.

**Done when.** A station with all five specs known still has something on the
lab's board, and at least three improvements have a visible effect on a number
the player already sees.

### 9. Something other than bunks moves the roster

**Why.** Reaching 60 crew is a matter of building Crew Quarters and waiting.
The Comms Array, the Docking Port, standing with your patron and the station's
appeal all exist and none of them change how fast people arrive.

**Where.** `src/game/recruit.ts` (`makeCandidate` count), `src/game/reducer.ts`
(`requestCrew`), `src/game/core.ts` (`REQUEST_COOLDOWN`). A wider Comms Array
should call more people at once; a warm patron should send them faster; a
Trading Hub should bring walk-ins who never needed asking.

**Done when.** Three different things measurably change the hires-per-hour
figure in a harness run, and quarters remain the ceiling rather than the only
lever.

### 10. Break up the two long modals

**Why.** `src/components/VisitorModal.tsx` is resource trade, the bonded cage,
kit, the boarding party, the auto-accept toggle and a talk button. 
`src/components/ModuleModal.tsx` has three room-specific panels bolted onto a
generic one. Both still work; both are one feature from not.

**Where.** VisitorModal: extract `TradePanel`, `CagePanel`, `KitPanel` into
`src/components/visitor/`. ModuleModal already has `Workbench.tsx`; move the
per-room branches into a `RoomPanel` lookup keyed by `ModuleKind` so a new room
adds a file, not a branch.

**Done when.** Neither modal file is over 200 lines, and adding a room-specific
panel touches one new file plus one line in the lookup.

### 11. Art for the rooms and the ships

**Why.** Four pieces of kit have renders; 25 rooms and 4 ship classes have
glyphs. The dossier already shows how much a render changes a screen.

**Where.** Rooms: `public/rooms/<kind>.webp`, wired in
`src/components/StationView.tsx` the way `GearSlot.tsx` wires kit — optional,
glyph fallback, `onError`. Ships: `public/ships/<cls>.webp` in
`src/components/FleetPanel.tsx`. The two ship renders already sent (a grey
wedge-hulled freighter, a white multi-engine cutter) go on `hauler` and
`cutter`.

**Done when.** The loaders exist with fallbacks for every kind and class, and
whatever art is present shows; nothing waits on the rest arriving.

### 12. Luck does something

**Why.** Three rooms run on Luck — the Comms Array, the Trading Hub and the
Reclamation Bay — and two of those are at the far end of the curve. Every other
stat has a job by 15 crew.

**Where.** `src/game/missions.ts` (`rollOutcome` in `src/game/fleet.ts`
already takes the team; give Luck a hand on the find roll), `src/game/hazards.ts`
(`rollIncident` picks a target; the luckiest person in the room should shade
it). Small numbers.

**Done when.** A crew with high Luck finds specs and caches measurably more
often and suffers incidents measurably less, and a test says so with a fixed
seed (after task 5) or over enough draws (before it).

---

## Haiku

### 13. A `CLAUDE.md`

**Why.** There is none. Every session re-learns the reducer discipline, the
`.ts` import extension rule, the `beforeunload` save-flush gotcha in browser
tests, and where the headless sims live.

**Where.** `/CLAUDE.md`. Ten lines on architecture (the barrel and the layer
order), five on conventions, five on how to verify (`npm test`, `tsc -b`,
`oxlint`, the Playwright pattern with `addInitScript`), and the two rules that
bit hardest: only the reducer mutates, and every internal import names its
extension.

**Done when.** The file exists and a new session can find the layer order and
the test commands without reading `engine.ts`.

### 14. Re-deal portraits on load

**Why.** Offered earlier and never taken up. A save from before portraits were
dealt has crew with no `portrait` field, so they draw from the seed and can
share a face.

**Where.** `src/game/save.ts`, after load: for every crew member without a
`portrait`, assign one with `allocatePortrait` from `src/game/staffing.ts`.

**Done when.** Loading such a save gives every crew member a distinct portrait
where the pool allows, and a test loads a fixture without portraits and checks.

### 15. Tests for the parts of the split that changed visibility

**Why.** The refactor exported about two dozen previously private helpers
(`unassign`, `startIncident`, `closeHire`, `resolveMission`, …) so sibling
modules could reach them. They are now public API of the barrel with no direct
tests.

**Where.** `src/game/__tests__/`. One small test each for `startIncident`
(refuses a room that already has one; refuses past `incidentCap`), `unassign`
(remembers `returnTo` when asked), and `scrapValue` already has one — use it
as the pattern.

**Done when.** Each newly exported helper with a branch in it has at least one
test that exercises the branch.

### 16. PWA manifest and service worker

**Why.** Offered earlier. The web build at
`https://cyberhirsch.github.io/Spaceport-99/` is not installable and does not
run offline, though nothing in it needs a network.

**Where.** `public/manifest.webmanifest`, a small `src/sw.ts` that caches the
built assets, registration in `src/main.tsx`, and the Vite config so the
service worker is emitted. Keep it under fifty lines; do not add a plugin.

**Done when.** The deployed page passes the browser's install check and loads
with the network off after one visit.

### 17. Rename the branch

**Why.** `claude/space-station-fallout-clone-ekzune` is the working branch name
and the deployment is tied to it. It is not what the project is called.

**Where.** GitHub — the repository's default branch, the Pages source, and the
`package.yml` workflow's branch filter in `.github/workflows/`.

**Done when.** `main` (or whatever you pick) is the default, Pages deploys from
it, and the old name is gone.
