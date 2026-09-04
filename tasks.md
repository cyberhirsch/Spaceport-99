# Tasks

What is wrong with Spaceport-99, what to do about it, and who should do it.

They are sorted by how much judgement they need, hardest first. The tier is a
guide to which model to hand a task to, and it is about the *shape* of the
work, not its size:

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

## Decisions taken

These are settled. Tasks below refer to them rather than reopening them.

**What is taking the ships.** Something out there is alive. Not a faction
operation, not a fraud, not a bad chart — a thing that hunts hulls in the dark,
and the seven bearings converge on it. It cannot be negotiated with. The record
was never falsified; the record is simply wrong about where those hulls were
when they stopped transmitting, and it is wrong because the thing does not stay
where anyone plots it.

**It follows you home.** Checking bearings draws its attention. Late in the
questline it arrives at Spaceport-99 — sensor contacts that do not answer, then
a siege. The Sensor Array, the Shield Projector and the Defence Battery are
what stand between it and the station, which is what they were built for.

**Several endings, by what you do with it.** Publish it, sell it to a power,
bury it, or fly out and meet it. Each ends differently and leaves the station
in a different position.

**Raids are costly and survivable.** Scarred rooms, stolen cargo, crew in the
Med Bay. Deaths only when a station has no defence at all and has ignored every
warning. A raid is a setback, not the end of a run. The thing at the bearings
is not bound by this: the siege can kill.

**Losing the station does not end the run.** New flag, same commander. The new
owner's first demand arrives within the hour and the old owner's first visit
follows. You may work against whoever holds you — that is a double agent, it is
risky, and being caught carries strong penalties.

**Covert ops is a room.** Every faction tries to deal with you quietly,
whatever flag you fly, and your allegiance is defined by how you answer them.
So each faction has two standings, the official one and the covert one. The
approaches arrive whether or not you have the room; answering them without it
is what gets you caught.

**Rolls come from the state, not from the clock.** Reloading a save gives the
same result. A dead crew member stays dead and a failed contract stays failed.
The seed is not shown to the player.

**Saves migrate from version 7 forward.** The machinery gets written now and
every future bump gets a step. Nothing back-ports to 5 or 6.

**The boss plays it.** Pacing and balance changes come from a session played by
hand, not from the headless harness.

**Two tasks wait on artwork** — researched kit, and room and ship art. Neither
ships with placeholders. They are at the bottom of this file, out of the tiers.

**The branch becomes `main`.**

---

## Done

- **Split `engine.ts`.** It was 2,681 lines and the place everything landed.
  It is now twelve layered modules behind a barrel — `core → staffing → rooms
  → state → hazards → station → standing → recruit → missions → traffic →
  tick → reducer` — and a module only imports from the layers below it. All 37
  import sites still say `from './engine.ts'` and nothing outside `src/game/`
  changed. Verbatim move; 172 tests unchanged. The imports the split generated
  are wrapped at 100 columns like the rest of the codebase.

- **Seeded the luck.** Every roll in the game came from `Math.random()` — 72
  calls, most of them inside the reducer. They now come from `roll(state)`,
  which advances a seed the state carries and saves. Three things follow: the
  reducer answers the same way twice for the same input, so React's development
  double-invocation can no longer render one roll and persist another;
  reloading a save replays what was about to happen instead of rerolling it, so
  a death stands; and the tests pin a seed instead of averaging over sixty
  draws, so the suite gives the same answer every run. Pure generators
  (`makeCrew`, `makeVisitor`, `makeMission`, …) take an `Rng`; anything holding
  a `GameState` rolls from it. `SAVE_VERSION` went to 8, brought forward by
  the save migration below rather than a wipe.

- **Built the Covert Ops room, and the second standing behind it.** Every power
  now keeps two opinions of the station: `standing` on the record and `covert`
  off it. Approaches ride in on ordinary traffic, never on a hull flying the
  sender's own paper, and ask for one of four things — cargo that skips the
  manifest, the docking log, an hour with nobody on the clamps, or that you keep
  talking to the flag you no longer fly. Refusing is free; reporting it swings
  your patron; taking it pays, opens a channel, and rolls against
  `exposureRisk`. The room does not create any of it, it only makes it
  survivable. Payoffs: an arrangement makes a power far less likely to come and
  take the station, and it buys one door out of a takeover that closes behind
  you.

- **Built the encounter sequence.** `Visitor.intent` now covers `loiter`,
  `demand` and `raid` alongside `conquest`, and they are one escalation rather
  than three separate events: a hull stands off two kilometres out, and if
  nothing is done it demands, and if that is refused it comes in. Every step is
  on the board first, so a raid is always something you watched arrive. Two
  conversations lead to it — the loiterer and the demand — and both offer guns,
  money, your patron, and an arrangement as ways out, each priced differently.
  A raid scars rooms, takes credits and hurts people; it kills only a station
  with nothing to fight with that ignored every step, and never everybody.
  Meeting it ready cuts what they bring by a fifth to two fifths.

- **Gave three systems a second act.** The Brig: hold somebody past a threshold
  and a hull turns up flying their paper asking for them back — sell them,
  release them for nothing and open a channel, refuse and keep a prisoner whose
  people now have opinions, or take the single better offer they will make. A
  takeover: the new owner's first assessment arrives within the hour and wants
  credits, crew, or a refusal that every power you used to fly for hears about
  and acts on. Far work: out of contact, a hail arrives as a report of a
  decision already taken rather than a question, and far contracts draw on
  troubles no near job has. The double agent arrives through the covert channel
  that already exists — the `turn` ask is only offered by a power that used to
  hold the station.

- **Built the questline.** Seven hull names and seven dates, delivered three
  ways — a staffed Comms Array, a hull at the clamps, or somebody aboard who
  has been carrying it. Checking a bearing is an ordinary far contract with a
  hull name on it, so the whole thing runs on Deep Space Operations, the
  contract board, the Sensor Array reading wrong, and the station's guns. What
  is out there is alive, cannot be plotted, and pays attention to whoever is
  asking: every bearing checked raises `quest.attention`, which only ever goes
  up. Three checked is enough to make the argument, and the file closes four
  ways — publish, sell, burn, or take a hull out to the seventh name, which is
  not a hull. Keep asking and decide nothing and it arrives instead, in a
  conversation with no option to pay, report or reason with it. The file lives
  in the Comms Array panel.

- **Ran a scripted playthrough, and fixed the dead end it found.** Five hours of
  game time, three seeds, a policy that builds, staffs, hires, berths hulls,
  takes contracts and answers every conversation. It found one genuine blocker
  and it was a bad one: **a founding station could never grow.** It has exactly
  enough people to man the four rooms it comes with, so the Comms Array — the
  first thing anybody builds — was a post nobody would ever take; asking HQ for
  crew needs somebody sitting at it; and auto-assign only ever filled empty
  slots from the idle pool, of which there was none. Five hours in, the harness
  had sixteen rooms, thirty thousand credits and the same six people it
  started with, and then they starved.

  Fixed in `src/game/staffing.ts`: `jobPriority` now ranks the comms desk just
  after life support while the station is below its own crew cap, and
  `autoAssignInto` has a second pass that will move the *second* person out of
  a room that has two in order to man an empty essential post. Nothing is ever
  stripped to nobody, and only the posts that decide whether the station has a
  future can pull somebody off another job. Same harness now reaches sixteen
  crew by eighty minutes. Six tests in `src/game/__tests__/staffing.test.ts`
  hold it shut.

  **Still yours to play.** The harness is good at wipes, rates and dead ends and
  blind to boredom. What it cannot tell you, and what a hand-played session
  would: whether the first twenty minutes are interesting or just admin;
  whether the letter arriving at nine minutes is too early to care about;
  whether the gap between the Research Lab at 30 crew and the Trading Hub at 52
  has anything in it; and whether losing the station reads as a twist or as a
  punishment. One other thing it did surface for a human to judge: power and
  food can sit negative for forty minutes before anybody dies, which is either
  a generous warning or an invisible death sentence, depending on how legible
  the readout is when you are actually looking at it.

---


- **Save migrations have full test coverage.** `migrate()` already walked a
  chain of `{ from, up }` steps; what was missing was coverage through the
  functions that actually touch `localStorage`. `src/game/__tests__/save.test.ts`
  stubs `globalThis.localStorage` and round-trips `loadGame`/`saveGame`/
  `readSlot`/`writeSlot`/`slotInfo`/`clearSave`/`clearSlot`, including an old
  save migrating on the way in, a save with no path forward being refused, a
  hand-edited/truncated save being rejected rather than half-loaded, and a
  quota error not crashing the game. 11 new tests.

---


- **Split the tick.** `step()` was 516 lines of `tick.ts`'s 649 and did
  everything: the power grid, production, life support, the med bay, the
  engineering bay, research, the fab shop, incidents, crew wellbeing, docking
  fees, the cells, the takeover sequence, the questline, loiterers, quiet
  approaches, the clamps, the fleet, applicants and the random-incident roll.
  It is now 21 named functions called in order, each with the doc comment the
  section already had. A small `TickCtx` carries the handful of values several
  sections genuinely share — `crewById`, `derived`, `alive`, `grid`,
  `brownout`, `starving`, `suffocating`, `healRate` — filled in as the section
  that owns each one runs; everything else takes only `s` and `dt`. `step()`
  itself is 36 lines: a context literal and 21 calls. Verbatim move — verified
  by diffing full-state JSON (ids stripped, since `uid()` embeds the wall
  clock) between the old and new implementations across four seeds and up to
  three hours of simulated time each, byte-identical. 259 tests unchanged.

---

## Opus

Nothing outstanding. The five that were here are in **Done** above; what is
left of the playtest is a session played by hand, which is not a task anybody
can be handed.

---

## Sonnet

### 1. Something other than bunks moves the roster

**Why.** Reaching 60 crew is a matter of building Crew Quarters and waiting.
The Comms Array, the Docking Port, standing with your patron and the station's
own record all exist and none of them change who arrives, how many, or how
good they are. Four levers, four different effects:

- **How many** — the Comms Array. A wider array calls more people at once and
  shortens the cooldown between requests.
- **Who answers** — patron standing. A warm flag sends its own people; a cold
  one leaves you with whoever is passing. This decides the faction mix of
  candidates, which starts to matter a great deal once covert ops exists.
- **How good they are** — the station's record. Deaths, unattended incidents
  and a thin larder make the station a hard sell and bring desperate, low-stat
  people. A Lounge, a Gym, a clean log and full stores bring better ones.
- **Who turns up unasked** — the Trading Hub. Traffic occasionally lands a
  candidate nobody called for, and shifts the mix of hulls that dock.

**Where.** `src/game/recruit.ts` (`makeCandidate`, candidate count and stat
roll), `src/game/reducer.ts` (`requestCrew`), `src/game/core.ts`
(`REQUEST_COOLDOWN`), `src/game/traffic.ts` for the walk-ins.

**Done when.** All four levers measurably change the harness figures they are
supposed to — count, faction mix, mean stat, unasked arrivals — and quarters
remain the ceiling rather than the only lever.

### 2. Break up the two long modals

**Why.** `src/components/VisitorModal.tsx` is resource trade, the bonded cage,
kit, the boarding party, the auto-accept toggle and a talk button.
`src/components/ModuleModal.tsx` has three room-specific panels bolted onto a
generic one, and the Covert Ops room will want a fourth.

**Where.** VisitorModal: extract `TradePanel`, `CagePanel`, `KitPanel` into
`src/components/visitor/`. ModuleModal already has `Workbench.tsx`; move the
per-room branches into a `RoomPanel` lookup keyed by `ModuleKind` so a new room
adds a file, not a branch.

**Done when.** Neither modal file is over 200 lines, and adding a room-specific
panel touches one new file plus one line in the lookup.

### 3. Luck does something

**Why.** Three rooms run on Luck — the Comms Array, the Trading Hub and the
Reclamation Bay — and two are at the far end of the curve. Every other stat has
a job by 15 crew.

**Where.** `src/game/missions.ts` and `rollOutcome` in `src/game/fleet.ts`
(Luck shades the find roll), `src/game/hazards.ts` (`rollIncident` picks a
target; the luckiest person in the room should shade it), and the exposure roll
in the Covert Ops room. Small numbers.

**Done when.** A crew with high Luck finds caches measurably more often and
suffers incidents measurably less, and a seeded test says so.

---

## Haiku

### 4. A `CLAUDE.md`

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

### 5. Re-deal portraits on load

**Why.** A save from before portraits were dealt has crew with no `portrait`
field, so they draw from the seed and can share a face.

**Where.** `src/game/save.ts`, after load: for every crew member without a
`portrait`, assign one with `allocatePortrait` from `src/game/staffing.ts`.

**Done when.** Loading such a save gives every crew member a distinct portrait
where the pool allows, and a test loads a fixture without portraits and checks.

### 6. Tests for the parts of the split that changed visibility

**Why.** The refactor exported about two dozen previously private helpers
(`unassign`, `startIncident`, `closeHire`, `resolveMission`, …) so sibling
modules could reach them. They are now public API of the barrel with no direct
tests.

**Where.** `src/game/__tests__/`. One small test each for `startIncident`
(refuses a room that already has one; refuses past `incidentCap`) and
`unassign` (remembers `returnTo` when asked); `scrapValue` already has one —
use it as the pattern.

**Done when.** Each newly exported helper with a branch in it has at least one
test that exercises the branch.

### 7. PWA manifest and service worker

**Why.** The web build is not installable and does not run offline, though
nothing in it needs a network. An idle station you check on through the day
belongs on a home screen.

**Where.** `public/manifest.webmanifest`, a small `src/sw.ts` that caches the
built assets, registration in `src/main.tsx`, and the Vite config so the
service worker is emitted. Keep it under fifty lines; do not add a plugin. The
app icon can come from an existing asset until there is a proper one.

**Done when.** The deployed page passes the browser's install check and loads
with the network off after one visit.

### 8. Rename the branch to `main`

**Why.** `claude/space-station-fallout-clone-ekzune` is a working branch name
and the deployment is tied to it.

**Where.** GitHub — the repository's default branch, the Pages source, and the
workflow's branch filter in `.github/workflows/`.

**Done when.** `main` is the default, Pages deploys from it, and the old name
is gone.

---

## Waiting on artwork

Both of these are specified and neither ships with placeholder art. They move
into the tiers the day the renders arrive.

### 9. New kit for the Research Lab

**Why.** The lab costs 600c, unlocks at 30 crew, and runs out of work after
five specs. It is the only room in the game that goes permanently idle. What it
should research is new weapons and armour to fabricate — the highest-value
find, because kit is the one reward the player wears.

**Blocked on.** Renders for each new item, at 256×256 webp in `public/gear/`,
matching the four that exist. Design the items and the research entries in
advance if you like; do not ship them showing a letter in a box.

**Where.** `src/game/specs.ts` for the entries, `src/game/gear.ts` for the
items, `src/game/rooms.ts` where `fabricable` decides what the Fabricator will
take.

**Done when.** A station with all five specs known still has something on the
lab's board, and every researched item has real art the day it ships.

### 10. Art for the rooms and the ships

**Why.** Four pieces of kit have renders; 25 rooms and 4 ship classes have
glyphs. The dossier shows how much a render changes a screen.

**Blocked on.** Room and ship renders. The two ship images already sent (a grey
wedge-hulled freighter, a white multi-engine cutter) belong on `hauler` and
`cutter` and can go in as soon as this task starts.

**Where.** `public/rooms/<kind>.webp` wired in `src/components/StationView.tsx`
the way `GearSlot.tsx` wires kit — optional, glyph fallback, `onError`. Ships:
`public/ships/<cls>.webp` in `src/components/FleetPanel.tsx`.

**Done when.** Every room kind and ship class either shows its render or falls
back cleanly, and dropping a new file into the folder is the whole of adding
art.
