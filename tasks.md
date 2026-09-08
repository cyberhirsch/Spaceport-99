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

**Pirates come on a hull, and a boarding is a fight.** They are not an
incident. A raider stands off and demands, or lies its way to a berth, and
then a party comes through the lock: the battery and shield decide how many,
and whoever is standing in the room they land in — kit counting for as much
as Reflex — decides the rest. A defender who keeps the door at low hp can die
on it; nobody is pulled out for them. What a beaten party leaves is yours:
kit and credits off the dead, survivors in the cells if there is a Brig, and
the hull on the clamps with nobody left to fly her. A boarding is still a
setback and not the end of a run — the last living crew member is dragged
clear rather than killed — and the thing at the bearings is not bound by any
of this: the siege can kill.

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

**The letter is not a sixty-crew feature.** The first two of the seven hulls
are filed in near space and can be checked by any station with a hull and a
staffed Command Module. The rest are past the comms envelope and wait for Deep
Space Operations. A bearing is a mission, not a contract — every contract is a
mission, and not every mission is a contract.

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


- **Something other than bunks moves the roster.** Four levers, each
  measurably different from before:
  - **How many** — a wider, better-run Comms Array calls in more than one
    candidate per request (`commsReach`/`requestCandidates` in
    `src/game/rooms.ts`, capped by however many berths the dock actually has
    free) and shortens the cooldown before HQ will take another call
    (`requestCooldown`, floored at 20s). A bare one-segment array is
    unchanged: exactly one candidate, the old 70s cooldown.
  - **Who answers** — `candidateFaction` in `src/game/recruit.ts` weights
    towards the patron you fly for, warmer standing sending more of their own;
    a cold patron or none leaves the mix close to even. The candidate carries
    a `faction` field now, same as a guest or a prisoner.
  - **How good they are** — `stationRecord` reads deaths, live incidents,
    tank levels, and a staffed Lounge or Gym, centred on 0.5 so an ordinary
    station is untouched. It nudges the same `reach` roll `appeal` already
    drove, so a station with a bad week gets worse applicants without
    appeal's broader meaning (contract danger, morale) changing at all.
  - **Who turns up unasked** — a busy, staffed Trading Hub occasionally lands
    a walk-in (`makeWalkIn`) straight onto the roster with no transit delay,
    rolled alongside the existing traffic clock in `stepTraffic`. No hub, no
    walk-ins, ever.

  Quarters is still the only way past the crew cap itself — none of the four
  levers touch it, and a full roster refuses every one of them the same way.
  Fixed a real bug found while testing this: a crew member who fell back from
  an incident and got reassigned elsewhere while it burned had no way back to
  an essential post once nobody was left idle to trigger another
  auto-assign pass. `stepIncidents` now runs one more assignment pass
  whenever an incident clears. 15 new tests; verified live in the browser —
  built a wide array, watched HQ send two candidates in one request, capped
  correctly at the dock's two berths.

---


- **Broke up the two long modals.** `VisitorModal.tsx` was 364 lines;
  `ModuleModal.tsx` was 349. VisitorModal is now 190: `TradePanel`, `CagePanel`
  and `KitPanel` came out as named in the task, plus two more the 200-line
  ceiling needed — `HailPanel` (the docking request: scan, claim, auto-accept)
  and `HoldingPanel` (a hull standing off) — all five under
  `src/components/visitor/`. ModuleModal is now 177: the five room-specific
  panels (`LabPanel`, `FabPanel`, `BrigPanel`, `CovertPanel`, and `FilePanel`
  for the questline file the Comms Array carries) moved off `Workbench.tsx`
  into `src/components/room/`, keyed by `ModuleKind` through a `ROOM_PANELS`
  lookup so a new room adds a file and a line rather than a branch; the
  generic sections every room shares came out too, as `ModuleStats`,
  `ModuleCrewGrid`, `ModuleFootnotes` and `ModuleActions` alongside the modal
  itself. `Workbench.tsx` is gone — nothing else imported it. Zero game-logic
  changes: 273 tests unchanged, `tsc -b`/`oxlint`/`build` all clean. Checked
  live in the browser — every visitor status (holding, requesting, docked with
  trade/cage/kit all present) and all five room kinds open to the right panel,
  a plain room shows the generic sections with no room-specific content
  leaking in, and the scrap confirm dialog opens, cancels and closes cleanly.

---


- **Luck does something.** It ran three rooms already — the Comms Array, the
  Trading Hub and the Reclamation Bay — same as any other stat runs the rooms
  it is staffed in. What it never had was a job in the systemic rolls the
  other six each get somewhere. Now it does, in three places, always the
  luckiest one on hand rather than an average:
  - **A mission's outcome.** `rollOutcome` in `src/game/fleet.ts` nudges the
    margin by the luckiest team member's Luck. Better odds at every tier, on
    every kind of job, not just the ones Luck already drove.
  - **A mission's find.** The rare-find gate in `resolveMission`
    (`src/game/missions.ts`) widens past its 15% floor by the same measure,
    on top of the better odds above of reaching a tier that is eligible at
    all. A triumph already finds something; an ordinary success now does more
    often the luckier the team.
  - **An incident's target.** `rollIncident` (`src/game/hazards.ts`) shaves
    its risk by the luckiest person actually on watch in the room it rolled
    against — an empty room gets nothing to shave.
  - **A quiet arrangement.** `exposureOdds` in `src/game/talks/covert.ts`
    (exported from what was a private `risk`, so it could be tested directly)
    shaves the same way off the luckiest one staffing Covert Ops. The
    percentage shown before you take the offer is the same number the roll
    uses, so what you are told is what you are risking.

  `luckiest(crew)` lives in `src/game/crew.ts` — the best `effectiveness(c,
  'L')` at the table, or 0 with nobody there to have any — and every site
  above calls the same one. Small numbers throughout, checked against a
  simulation before writing the tests: a Luck-10 crew's mean outcome tier
  moves noticeably up the disaster/setback/success/triumph scale over a
  Luck-1 one's, finds anything 1.5× as often and a cache specifically 2.4×
  as often, a Luck-10 watch is caught by an emergency roughly half as often
  as a Luck-1 one, and a Luck-10 Covert Ops hand cuts a 17%-odds arrangement
  from what a Luck-1 hand would show. 4 new tests in
  `src/game/__tests__/luckshading.test.ts` hold each of the four measurably
  apart; 277 tests total. Checked live too — a maxed-Luck Covert Ops hand
  reads "About 17% chance it comes out" on an ask that would run higher off a
  greener crew.

- **A `CLAUDE.md`.** Architecture, conventions and verification on one page:
  the layer order as a barrel diagram, the five conventions that bite (reducer-
  only mutation, `.ts` on every internal import, pure generators taking an
  `Rng`, seeded tests, `SAVE_VERSION` on shape changes), the four commands that
  have to stay green, and the Playwright `addInitScript` pattern for loading a
  save into a page. A session can find the layer order and the test commands
  without reading `engine.ts`.

- **Portraits re-dealt on load.** A save from before portraits were dealt had
  crew with no `portrait` field, drawing from the seed and sharing faces.
  `SAVE_VERSION` 13 gives every one of them a distinct face through
  `allocatePortrait`, and a test loads a version-12 fixture and checks they all
  come back different.

- **Tests for what the split made public.** The refactor exported about two
  dozen previously private helpers. `startIncident` (refuses a room that has
  one, refuses past `incidentCap`) and `unassign` (remembers `returnTo` when
  asked) now have tests on their branches, in the pattern `scrapValue` set.

- **PWA manifest and service worker.** `public/manifest.webmanifest`, a
  37-line `src/sw.ts` caching the built assets cache-first with a network
  fallback, registration in `main.tsx`, and `rollupOptions` emitting the worker
  to `dist/sw.js` unhashed. No plugin. The web build installs to a home screen
  and loads with the network off after one visit.

- **A conversation holds the station still.** A hull undocking mid-sentence
  left the player reading a line about somebody who had already gone. The talk
  modal is a blocking scrim, so nothing on the station can be acted on while it
  is up — letting the clock run there only ever took things away from the
  player. `advance` now breaks its loop while `s.talk` is set. Offline
  catch-up is exempt, or a conversation left open overnight would be an
  unlimited pause button, and frozen ticks still stamp `lastTick` so time spent
  talking is discarded rather than banked and applied later.

- **Recruits arrive for a reason, and posted ones are welcomed rather than
  sold to.** Every HQ applicant used to open with the same line about a
  courier. `Candidate.origin` is now `applied`, `posted` or `walkIn`, and which
  one HQ sends depends on what its patron thinks of the station. Somebody who
  put in for the berth keeps the hiring negotiation and arrives warmer, wanting
  to be told what the station is for. Somebody posted here picked nothing and
  is not being talked into anything: they are crew before the conversation
  starts, and get their own `welcome` script — how they report in, the last
  posting they came off, what they say about having been sent, and how they
  take being welcomed, all varying by person, plus what they noticed on the way
  in, which is the station's answer rather than theirs. Nothing rides on it.
  The routing lives in the reducer, so the UI asks for one conversation with
  somebody at the dock and gets whichever their arrival calls for. Walk-ins off
  the Trading Hub stopped being described as sent over by HQ. `SAVE_VERSION`
  14.

- **Alerts say which room, how short, and what you have not got.** Four things
  wrong at once on a station in a brownout. "1 emergency in progress" counted
  disasters without saying where, leaving the player to search the station for
  the room that was on fire; it now names the incident and the room, lists a
  second, and only counts past that. "Power deficit — add a Fusion Reactor"
  read as though the game had not noticed the reactor already running;
  shortfalls now say how big the gap is and ask for *another* one when one is
  built, with the right article either way. A brownout and a power deficit are
  the same problem one step apart, so the brownout line carries the remedy and
  the deficit line stands down. And the station stopped offering to pressurise
  the next deck while the last one is still empty. The rules moved out of the
  component into `src/components/alerts.ts`, which is what lets them be tested:
  they are a pure read of state and derived, so the tests state a shortfall
  rather than engineering a station into one.

- **The Engineering Bay unlocks at 18 crew, not 42.** It is the only
  dependable way to undo structural damage — upgrading a room resets its
  condition and a passing engineer occasionally puts the worst one right, but
  neither is something to plan around. Incidents start chewing rooms up in the
  first hour, so a 42-crew gate left small stations watching condition fall
  with nothing to do about it. Its 640c paces it now. One consequence left
  standing for a hand-played session to judge: the trainers are one per stat at
  26/30/33/45/48/56, and Tech is now first by eight crew.

- **A missions board, and the first two bearings within reach of any hull.**
  The questline used to be a sixty-crew feature: the letter arrives at nine
  minutes and nothing could be done about it until Deep Space Operations, the
  last room on the curve. `LostHull.far` now splits the list — the two filed in
  Ridley Reach are near missions any station with a hull and a staffed Command
  Module can fly, so Corbel Nine, the one that finds the previous commander's
  shuttle, lands mid-game; the rest stay past the envelope. A bearing is a
  mission and not a contract, and the new Missions tab keeps that straight: the
  seven hulls with their stage, checked and attention meters, and a checklist
  under the next name of exactly what is missing; the contracts off the wire;
  and side quests, which are everything already running on its own clock — a
  hull standing off, a demand waiting on an answer, somebody's people coming
  for a prisoner, the new flag's first assessment, an applicant on the dock, a
  team hailing. Nothing is invented for it; `src/game/board.ts` reads the state
  the tick already drives, soonest first.

- **Pirates come on a hull, and a boarding is a fight.** They used to be one of
  four incidents, starting at random like a fire and fought like one: a
  hit-point bar, nobody able to die, nothing taken and nothing left behind. A
  raid, separately, was one dice roll that only ever subtracted. Now they
  arrive only by ship — standing off and demanding, or lying their way to a
  berth — and a party comes through the lock, with the battery and shield
  deciding how many make it and a station that plainly outguns them not boarded
  at all. After that it is people in a room: defenders concentrate on whoever
  is closest to going down, a sidearm worth as much as a good Reflex score,
  boarders spreading over whoever is in front of them. Left unopposed they
  loot, wreck the room, push on, and leave with what they have after three
  minutes. What a beaten party leaves is yours — kit and credits off the dead,
  survivors in the cells if there is a Brig, which feeds the existing claim
  mechanic, and the hull on the clamps with nobody left to fly her. Building it
  surfaced a latent bug: the wellbeing pass healed before it checked for death,
  so anything leaving a crew member at exactly zero got them a trickle and
  immortality. Crew death is now one helper in `staffing.ts`. `SAVE_VERSION`
  15.

- **A Security Office.** Boarders are fought by whoever is standing in the room
  they land in, which made the Docking Port the only room worth arming.
  Anyone posted to the office who is fit to fight turns out to the party's
  room, follows it, and stands down when it is over. They never leave their
  post on paper — the office is where they are from, not where they are — so
  they take no slot in the room they defend, nothing has to put them back, and
  a one-berth Docking Port can still have four people on its door. 20 crew,
  480c, Reflex. `SAVE_VERSION` 16.

---

## Opus

The five that were here are in **Done** above. What follows came out of a
hand-played session and is open in the way that only playing it settles.

### 1. Credits stop being a decision

**Why.** A screenshot mid-session: 38,033c banked at +1.2/s. The dearest room
is 1,040c and a deck 2,080c, so everything on the board is affordable thirty
times over and no build is a trade-off. The economy has an income curve and no
sink to match it.

**Where.** Not a code change until the shape is decided. The candidates are
upkeep that scales with the station, consumables the good rooms actually burn,
kit and refits worth saving for, or prices that climb with what you already
have. Each makes a different game.

**Done when.** There is a point in a run where the player wants two things and
can have one.

### 2. Boarding balance

**Why.** Boarders now fight, kill and get killed, and every number in it —
their hit points, what they deal, how many come through the lock, the three
minutes of patience before they leave with the till — is a first guess written
alongside the mechanic. The rule here is that pacing comes from a session
played by hand, not from the harness.

**Where.** `src/game/boarding.ts`, all of it near the top.

**Done when.** A station that built a Security Office and armed it comes
through a boarding scarred and ahead; one that ignored every warning does not.

### 3. Tech is now the first stat anybody can train

**Why.** The trainers were one room per stat on a ladder — 26 Brawn, 30
Intellect, 33 Reflex, 42 Tech, 45 Operations, 48 Adaptability, 56 Luck. Moving
the Engineering Bay to 18 crew for its repairs took Tech training with it, and
it now lands eight crew ahead of anything else.

**Where.** Either leave it, or split the room: repairs early, Tech training
back at 42 in something else.

**Done when.** The ladder is deliberate, whichever way it ends up.

---

## Sonnet

### 1. A browser test, and the first thing it should catch

**Why.** `CLAUDE.md` documents a Playwright pattern and there is no Playwright:
no config, no spec, nothing under `e2e/`. `App.tsx` is 663 lines and has never
been rendered by a test. Five changes that touch the interface shipped in one
session on reasoning alone — the alert bar, the deck prompt, the Missions tab,
the boarding markers on a room, the Security Office responder count.

**Where.** A config and one spec. `CLAUDE.md` already has the shape: stub
`localStorage`, `addInitScript` a save with `lastTick` stamped to now, load the
page. Then assert the things a unit test cannot: the alert bar renders its
lines, the Missions tab opens and lists a bearing with its prerequisites, a
room with boarders in it shows the marker.

**Also worth one look while there.** The mobile tab bar is now six buttons —
Build, Crew, Fleet, Missions, Log, More — and has never been seen on a narrow
screen.

**Done when.** `npm run e2e` starts the app, drives it, and fails if the panel
does not render.

---

## Haiku

### 1. Finish the move to `main` on GitHub

**Why.** `claude/space-station-fallout-clone-ekzune` was a working branch name
and the deployment was tied to it.

**Done already.** `main` is the branch all work happens on and everything is
pushed to it, and `build.yml` now deploys from `main` by name.

**Why that had to be hardcoded.** The deploy job used to key on
`github.event.repository.default_branch`, which reads well and was false on
every push: the repository's default is still
`claude/space-station-fallout-clone-ekzune`, so the comparison never matched
`main` and the job skipped without failing anything. Eight commits built green
and published nothing.

**What is left, and why it is stuck.** Making `main` the default branch, then
deleting the old one — in that order, because GitHub will not delete a
repository's default branch. Neither is reachable from here: no MCP tool
exposes repository settings or branch deletion, and `git push --delete` comes
back 403. It wants a hand on Settings → Branches. Once the default is `main`,
the `if:` above can go back to reading it rather than naming it.

**Done when.** `main` is the default, Pages deploys from it, and the old name
is gone.

---

## Waiting on artwork

Both of these are specified and neither ships with placeholder art. They move
into the tiers the day the renders arrive. Numbered separately from the tiers
above, because nothing about them is waiting on a decision.

### 1. New kit for the Research Lab

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

### 2. Art for the rooms and the ships

**Why.** Four pieces of kit have renders; 27 rooms and 4 ship classes have
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
