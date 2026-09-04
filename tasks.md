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

---

## Opus

### 1. The questline

**Why.** The game is a very good sandbox with nothing pulling you through it.
Factions, dialogue, conquest, specs, the Brig, far work — each is a system
without a story. The anonymous letter (seven hull names and the dates they
stopped transmitting; *"None of these were lost where the record says. Check
the bearings."*) is the spine, and it is unbuilt.

**What is out there** is decided: something alive, that cannot be reasoned
with, that the charts cannot hold, and that eventually comes here. The
previous commander got the same letter, flew out to check the second name, and
did not come back. The letter arrives from three sources — the Comms Array, a
ship or a visitor, or a crew member — and the station itself is not special;
the adventure is out there until the last act, when it is here.

**Where.** New `src/game/talks/letter.ts` for the beats; a `quest` field on
`GameState` in `src/game/types.ts` (which name you are on, what you know, what
knows about you); far contracts in `src/game/missions.ts` are how you check a
bearing; the Sensor Array reads one of them wrong, and that wrongness is the
first evidence; the Brig can hold somebody who came back from one. Reuse every
existing system rather than adding one — the last act is a siege resolved
through defence, and the endings are conversations.

**Done when.** A player can receive the letter three different ways, check at
least three of the seven bearings through existing contract machinery, and
reach one of four endings. Nothing in the questline is a new mechanic.

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
resolves an attack the way `conquest.ts` does. The station view needs to show a
hull that is *near* but not *at* the clamps.

**Severity is decided:** a raid scars rooms, takes cargo and puts crew in the
Med Bay. It kills only a station with no defence at all that ignored the
warning. Every raid announces itself first — a loitering hull that is left
alone long enough *is* the warning.

**Done when.** At least three intents exist, each plays out over more than one
conversation, standing and defence both matter to the outcome, and a loitering
hull that is ignored does something rather than nothing.

### 3. Second acts, and the double agent

**Why.** Breadth over depth. The Brig ends every story in one conversation:
nobody comes looking for the person you are holding. Conquest happens once and
is over — the flag changes and nothing follows. Far work is a multiplier on pay
and time, not a different kind of job.

**Where.** `src/game/talks/prisoner.ts` and `src/game/traffic.ts` — somebody
comes for a prisoner held past a threshold, and a faction can file a claim for
one. `src/game/talks/conquest.ts` — the new owner's first demand inside the
hour, the old owner's first visit after that, and the option to keep working
for the flag you lost. That last one is the double agent: it pays, it raises
your covert standing with the old owner (task 4), and exposure costs you far
more than refusing ever would. `src/game/missions.ts` and `src/game/calls.ts` —
far work gets its own hails, and a far team that goes silent is a beat rather
than a timer.

**Done when.** Holding a prisoner past a threshold triggers an arrival; ceding
the station triggers a conversation within the hour and leaves a standing
choice open rather than closed; and there is at least one hail only a far team
ever sends.

### 4. The Covert Ops room

**Why.** Standing is one number per faction and it only ever moves in public.
Every power in the Drift would sooner deal with a station quietly than take it,
and there is currently no way for them to try. This is also what makes losing
the station interesting rather than final: whoever holds your clamps does not
hold who you talk to at night.

**Where.** A new `covertops` room in `src/game/modules.ts`, late on the curve
(around 50 crew), staffed on Wits. A second standing map on `GameState` —
`covert: Record<FactionId, number>` in `src/game/types.ts`, moved by a `shift`
sibling in `src/game/standing.ts`. Approaches are scripts in `src/game/talks/`
attached to visitors and crew: carry this and do not log it, tell us who docked
last week, look the other way for an hour, keep talking to us now that you fly
their flag. Answering raises covert standing with them and rolls for exposure;
a staffed, powered Covert Ops room makes that roll a formality, and no room at
all makes it likely. Exposure crashes the official standing with whoever holds
you and, past a threshold, brings a conquest or a reprisal.

**Where it pays off.** Covert standing is what decides who backs you when the
flag changes, who warns you before a raid, and who is willing to hear the
letter's contents in task 1.

**Done when.** Every faction can approach you covertly regardless of the flag
you fly, both standings are visible in the flag panel, the room measurably
changes exposure risk, and getting caught has consequences a player can see
coming and choose to accept.

### 5. Play it, then fix what drags

**Why.** Nobody has. Every balance claim — "4½ hours to 60 crew", "one spec
every five runs", "9 wipes in 40 idle runs" — is from a headless harness, not
from a hand on the controls. The harness is good at wipes and rates and blind
to boredom. The boss plays this one.

**Where.** Everything. Keep a log: where you waited with nothing to do, where a
number was wrong, where the interface made you guess.

**Done when.** One full session from a fresh station to the Trading Hub, and a
list of at least five things that dragged, each with a proposed fix. The fixes
are separate tasks; this one is the list.

### 6. A seeded random number source

**Why.** `Math.random()` is called from inside the reducer in dozens of places.
That is why tests had to be rewritten to average over sixty draws, why the
"they moved" assertion flaked, and why React StrictMode's double-invocation can
render a line from one roll and persist a different one. It is also why a
player could reload to reroll a death, which is now decided against: rolls come
from the state, so a reload gives the same answer.

**Where.** A PRNG state on `GameState` and a `roll(s)` helper in
`src/game/core.ts` that advances it; replace every `Math.random()` under
`src/game/` (about 80 sites). The seed is generated in `newGame()` and never
shown. Saves carry it, so loading resumes the same sequence. The averaging
tests in `src/game/__tests__/` can then assert against a fixed seed.

**Done when.** `grep -r "Math.random" src/game` finds nothing outside the seed
initialiser, two `newGame()` calls with the same seed produce identical
stations after identical actions, saving and reloading before a contract
resolves gives the same outcome both times, and the averaging tests are
replaced with seeded ones.

---

## Sonnet

### 7. Save migrations instead of save wipes

**Why.** `SAVE_VERSION` is 7 and has been bumped every session. Each bump makes
every existing save unloadable. Fine while nobody is playing; the day someone
is, it is the worst thing the game does.

**Where.** `src/game/save.ts` loads and refuses on a version mismatch. Add a
`migrate(raw): GameState | null` that walks a list of `{ from, up }` steps and
refuses only when there is no path. The chain starts at 7 — versions 5 and 6
are not back-ported — so the first real step is the one the next feature adds.
Write the machinery and one step's worth of test scaffolding now so the next
bump is a five-line change rather than another wipe.

**Done when.** A version-7 save loads on a build with a higher `SAVE_VERSION`,
a test in `src/game/__tests__/save.test.ts` round-trips a fixture through a
synthetic migration step, and the README's Saving section stops saying old
saves are lost.

### 8. Split the tick

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

### 9. Something other than bunks moves the roster

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

### 10. Break up the two long modals

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

### 11. Luck does something

**Why.** Three rooms run on Luck — the Comms Array, the Trading Hub and the
Reclamation Bay — and two are at the far end of the curve. Every other stat has
a job by 15 crew.

**Where.** `src/game/missions.ts` and `rollOutcome` in `src/game/fleet.ts`
(Luck shades the find roll), `src/game/hazards.ts` (`rollIncident` picks a
target; the luckiest person in the room should shade it), and the exposure roll
in task 4 once it exists. Small numbers.

**Done when.** A crew with high Luck finds caches measurably more often and
suffers incidents measurably less, and a seeded test says so.

---

## Haiku

### 12. A `CLAUDE.md`

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

### 13. Re-deal portraits on load

**Why.** A save from before portraits were dealt has crew with no `portrait`
field, so they draw from the seed and can share a face.

**Where.** `src/game/save.ts`, after load: for every crew member without a
`portrait`, assign one with `allocatePortrait` from `src/game/staffing.ts`.

**Done when.** Loading such a save gives every crew member a distinct portrait
where the pool allows, and a test loads a fixture without portraits and checks.

### 14. Tests for the parts of the split that changed visibility

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

### 15. PWA manifest and service worker

**Why.** The web build is not installable and does not run offline, though
nothing in it needs a network. An idle station you check on through the day
belongs on a home screen.

**Where.** `public/manifest.webmanifest`, a small `src/sw.ts` that caches the
built assets, registration in `src/main.tsx`, and the Vite config so the
service worker is emitted. Keep it under fifty lines; do not add a plugin. The
app icon can come from an existing asset until there is a proper one.

**Done when.** The deployed page passes the browser's install check and loads
with the network off after one visit.

### 16. Rename the branch to `main`

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

### 17. New kit for the Research Lab

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

### 18. Art for the rooms and the ships

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
