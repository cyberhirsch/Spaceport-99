# Spaceport-99

Build an orbital station one room at a time, staff it with a crew of drifters,
and keep them breathing. Power, oxygen and rations are made in cycles by the
people you post to each room and burned continuously by everyone aboard. Get the
balance wrong and you find out how quickly a station stops being habitable.

Mobile first: portrait phone is the primary target, with a thumb-height tab bar,
bottom-sheet panels, a pannable station and drag-and-drop crew assignment. The
same DOM unfolds into a two-column desktop layout at 900px.

Built with React + TypeScript + Vite. No backend — the whole simulation runs in
the browser and saves to `localStorage`.

**Play it in a browser:** https://cyberhirsch.github.io/Spaceport-99/

**Or download it:** the [latest release](https://github.com/cyberhirsch/Spaceport-99/releases/latest)
carries a Windows installer, disk images for both Mac architectures, and an
Android APK. Each one is standalone — no runtime to install, and the game never
touches the network.

```bash
npm install
npm run dev           # http://localhost:5173
npm run test          # geometry rules, via node:test — no test framework needed
npm run build         # typecheck + production bundle into dist/
npm run lint

npm run electron      # run the desktop shell against a fresh bundle
npm run pack:desktop  # installers for this machine's platform, into release/
```

## Saving

The autosave is continuous: it writes to the device every few seconds and credits up to four
hours of catch-up when you come back. The **manual save** in Station options is something else —
a bookmark you place deliberately, kept in its own slot, and the only thing **Load** ever
restores. Scuttling the station does not touch it, because starting over is one of the likeliest
reasons to want it back; **Discard save** is there for a genuinely clean slate.

Luck is part of the save. Every roll the game makes — who arrives, what a
contract pays, whether a rushed cycle catches fire — comes from a number the
station carries and advances, not from the clock. So a reload replays what was
about to happen rather than rerolling it: a death stands, and so does a
contract that went badly. Saves are brought forward across versions from
version 8 on, one migration step per bump, rather than being thrown away.

## Two standings

Every power keeps two opinions of the station: the one on the record, and the
one it would admit to if nobody were listening. Sooner or later each of them
sends somebody to find out which kind of commander you are — the word never
arrives on a hull flying their own paper, because neither of you has to admit
the conversation happened.

There are three answers and all of them mean something. Refusing is free, which
is what makes taking it a choice rather than a trap. Reporting it to your flag
is picking a side out loud. Taking it pays, opens a channel, and leaves you one
bad roll from your own flag finding out — and a power that already has an
arrangement with you has far less reason to come and take the place.

The **Covert Ops** room does not create any of this; it only makes it
survivable. Without one you are conducting private business on the open channel
and hoping. With one, the odds of an arrangement coming out drop a long way and
never reach zero. Two that come out and somebody starts making the case that
this post needs new management.

## Standalone builds

The same bundle, wrapped twice. **Electron** serves it to a desktop window;
**Capacitor** serves it to an Android WebView. Neither adds game code — the
simulation, the save format and the interface are byte-identical to the web
build, because they are literally the same `dist/`.

Two details make that work. The bundle is built with `--base ./` so its asset
URLs are relative rather than rooted at a web server's `/`. And the desktop
shell serves it over a custom `app://` scheme rather than `file://`, because a
`file://` page is an opaque origin — `localStorage` there is either refused or
thrown away between runs, and `localStorage` is where the whole station lives.

`android/` is not in the repository. It is a Capacitor template regenerated from
`capacitor.config.ts` on every build, so it is an artifact rather than source;
`npx cap add android` recreates it.

Tag a version to cut a release:

```bash
npm version 1.0.1 && git push --follow-tags
```

The Package workflow then builds all three on their own runners and attaches
them to the tag. Running it from the Actions tab builds the same three as
downloadable artifacts without publishing anything.

**Nothing is code-signed.** That needs a paid Apple Developer ID and a Windows
code-signing certificate, so each system asks for convincing once: Windows
SmartScreen wants *More info → Run anyway*, macOS wants a right-click → *Open*
on the first launch, and the APK is debug-signed, which is enough to sideload
but not to publish.

## The powers

Three powers run the space the station's traffic comes from and goes back to. Spaceport-99 is
not a prize any of them is circling: it is a small independent post, far enough out that all
three find it convenient to leave alone.

**You start on the Confederation roll.** Nobody asked, and for most of the game nobody comes.
There is no diplomacy tab, no declaring for a flag and no striking one — the only thing that
ever changes whose paper you fly is a hull that turns up and takes the station.

- **The Terran Confederation** claims by writ: Confederation charter still covers most of
  settled space and no member world has ever voted to give any of it back. It dispatches
  applicants on Confederation pay, and its patrols answer eventually.
- **The Meridian Concern** claims the lanes. Best prices at your clamps, credit when a reactor
  goes, and everything itemised.
- **The Vantric Compact** claims by enrolment. It does not take stations; it invites them, once
  a year, indefinitely.
- **The Unlisted** are not a power but a filing status — every hull whose registration lapsed.
  You can stand well or badly with them; you cannot fly their flag.

Standing is kept separately for each and moves on what you do at the clamps: who you berth, who
you wave off, who you trade with, who you lean on, and who you poach off somebody else's bridge.
Whose paper you fly decides which of those four opinions feeds `appeal()`, and so who HQ sends
and how nasty the contracts get. The flag you currently fly, and what they make of you, is in
the top bar.

## Somebody comes for the station

There is no warning. Once the place is big enough to be worth the fuel — ten rooms and eight
hands — a hull eventually arrives that is not requesting a berth. It is alongside by the time
you read the hail, and the conversation cannot be closed. Four ways out:

| | What it costs |
| --- | --- |
| Strike the flag | Their paper from now on. Nobody dies. The power you left strikes you off its roll. |
| Refuse | A fight decided by your batteries, shields and armed crew against what they brought. Win and every *other* power notices; lose and they take the flag, half the account and a note of who fired. Either way the station is marked. |
| Pay them off | Steep, and steeper the less you could have fought. They go. They keep the address. |
| Call your patron | Only works if you have been genuinely worth something to them. Otherwise you get a file number and are still standing there. |

Whoever brought a force scaled it to what they could see you had, so arming the place makes the
threat bigger and the odds better at the same time.

## Talking to people

Every person on the station or at its clamps can be talked to, and the conversation is the
mechanism rather than a wrapper around one. Five scripts, in `src/game/talks/`:

- **Your crew** tell you what is actually wrong with the place, worst thing first, in the order
  a person would say it. They will ask for the posting they are built for, and being thanked for
  saying something is worth something to them. There is nothing to win here.
- **Hiring** replaced the three tactic buttons entirely. Everyone wants exactly one thing —
  money, a job that suits them, a reason to believe in the station, or a way off the hull they
  came in on — and you have to find out which before you spend anything. Ask them why they came
  and they answer plainly; ask cold and they tell you to pick one. The right offer is worth 1.6×
  its face value; the wrong one is worth half; **offering money to somebody who wanted to be
  believed in is an insult**, and the more senior they are the worse it lands. Interest is still
  the number underneath — you just cannot see it any more, only how they react.
- **Ships' masters** will give you the news, tell you what they make of the place, and mention
  it out there if it is worth mentioning. You can press one on what they are really carrying,
  and let a dirty hull go or send it away. Leaning on a hull is cheap from behind a staffed
  battery and expensive from behind nothing.
- **Somebody in the cells** — four doors: what were you carrying, hand them over,
  let them go, or offer them a berth. What they say depends on how long they have
  been in there and whether their own people would have come back for them.
- **A takeover**, above.

Under the hood: `src/game/talk.ts` is the engine and holds no content. Only the pointer is saved
— which script, which line, and what has been established — so a reply can carry a closure and
still survive a reload. A node marked `sticky` cannot be walked away from; one marked `final`
still renders after the person has left, which is how a signed contract gets its closing line.

## Twenty-five rooms, from nothing to sixty

Every room names a headcount, and the curve runs from the four you start with to a
Deep Space Operations suite that wants **sixty people aboard**. That is the whole
progression: bunks are the bottleneck, so the roster is what you are really
building. HQ sends roughly a dozen people an hour once there is somewhere to put
them, which puts the far end of the curve about four and a half hours out.

Five of those rooms do something no other room does:

| Room | Crew | Gate | What only it can do |
| --- | --- | --- | --- |
| **Water Reclamation** | 24 | — | Cuts what the crew burn instead of producing more. The first room whose worth depends on how many people you have rather than how much you make — and the moment it goes dark the burn snaps back. |
| **Brig** | 28 | — | Somewhere to put a person. Cells only hold while somebody is standing in the room. |
| **Sensor Array** | 39 | spec | Pulls the docking scan towards what a hull actually is. Never all the way. |
| **Trading Hub** | 52 | — | Traffic stops here more often and pays nearer what it asks — and the bonded cage holds cargo that is not yours yet. |
| **Deep Space Operations** | 60 | spec | Contracts past the comms envelope. |

### The Brig

A dishonest hull can now be *arrested* rather than only waved off. Whoever comes
down the gangway goes in the cells, their power minds and yours does not, and the
hull leaves without them.

After that a prisoner is a decision, not a timer. Hand them to the flag you fly
for standing and 240c. Let them go, and the Drift keeps its own books about
stations that do. Or leave them a few minutes and offer them a berth — asked
through the bars they will tell you to try again with the door open, and asked
with the door open they mostly sign, because the people who end up in a cell out
here rarely have somewhere better.

Take the watch off the Brig and whoever is inside is gone by the next shift.

### The Trading Hub

Two things at once. As a **market** it shortens the gap between hulls and lifts
what they will pay for your surplus from 55% of their asking price towards 92%,
which is the only thing in the game that improves a trade you were always going
to lose on.

As a **bonded cage** it holds cargo you bought to sell on. A lot never touches
the station's own tanks — it is not yours until somebody pays for it. Buy cheap
off a Drift hull, hold it, and sell it to the Concern when one docks; sell it
back to the hull you bought from and you will be down on the deal, which is the
whole point of waiting.

### Far work

Deep Space Operations unlocks a class of contract that pays about three and a
half times as much and takes about three times as long — and that **nobody at the
station can reach**. The mission-hail system already handles a team deciding for
itself when no controller is holding the channel; on far work that is not a
mistake you made by understaffing Command, it is the deal. You find out what they
chose when they get back.

## Three shapes of work

Not every job is a contract with a fee on the end of it.

A **contract** runs a fixed clock and settles when the team gets home. An **open** job has no
clock at all: it accrues a hold and a strain for as long as the team stays out, and nothing
brings them back but the commander saying so — the longer they stay the more they bring and the
worse the odds get. An **unfolding** job runs a clock but interrupts it: the away team hails
with something the contract did not cover, and somebody has to answer. Open the sealed hold or
finish the manifest. Go back for the second signal or come home with the one you have.

Some work pays in a power's opinion rather than in credits, and some is handed to you because of
the flag you fly — an **obligation** has no fee, and refusing it is the whole cost.

All of it runs through the command module, and a controller holds one channel. Pull people out
and the missions beyond your capacity go **out of contact**: still flying, still gathering, and
no longer reachable. You cannot recall them, and when they hail they stop waiting and decide for
themselves — which they do cautiously, because they are the ones out there.

## The docking desk

Clamps do not close themselves. A Docking Port with nobody posted to it takes no traffic at all:
hulls still arrive and hail, but they cannot be cleared, the port's share of the berthing fees
stops, and auto-accept does nothing — it is a standing order to whoever is on the desk, not an
unmanned system. The station is founded with six, not five, because it has seven posts and life
support cannot be robbed to man the desk.

## Defending the place

Four things decide whether a station can say no. A **Defence Battery** is two hardpoints and a
firing solution, worth nothing unstaffed or switched off. A **Shield Projector** holds a field
that soaks damage before the hull feels it, and holds it badly with nobody tuning it. A hull in
its berth is a gun platform; one out on a contract is not. And the crew carry what you issue
them — one sidearm, one layer of armour, bought off berthed hulls and kept in the hold until
somebody needs it.

Four pieces of kit exist, and the list is deliberately short — anything without art was cut
rather than shipped as a placeholder:

| | Slot | Guard | Where from |
| --- | --- | --- | --- |
| Deck Sidearm | sidearm | 3 | Earth, the Concern, the Drift — cheapest off a Drift hull |
| Vantric Lance | sidearm | 7 | The Compact, and nobody else |
| Breaching Torch | sidearm | 5 | Fabricated. Sold by no one at any price. |
| Boarding Plate | armour | 4 | Earth, the Concern, the Drift |

Kit counts twice — as stat points on the person wearing it, and as small arms when a boarding
party comes down a corridor.

### Kit art

`public/gear/<itemId>.webp`, 256×256, alongside the portraits in `public/crew/`.
Every file is optional: a slot with no art falls back to the item's glyph, and an
empty slot draws a dashed frame instead. So a new piece of kit works the day it
is added and gets its picture whenever one exists.

Every piece of kit in the game has art. Anything without a render was cut rather
than shipped as a glyph, so the four that remain are the four you can see.

## Things nobody will sell you

Five things on this station cannot be bought, bribed for, or unlocked by getting big enough.
They have to be **found**, then **worked out**, and for two of them **made**.

A working drawing turns up on a job — a survey hull that never filed its own design, a Drift
salvor who wrote down what everything is worth, a boarding party that no longer needs its kit.
The chance rises with how dangerous the contract was, and there are only five in the game.

A drawing on its own is a stack of somebody else's paper. The **Research Lab** works one out at
a time, at a rate set by its crew's Intellect, its size and its level — and because the lab
trains the very stat it runs on, it gets quicker while it works. You can shelve a drawing for
another; paper keeps, and the shelved one holds the progress it already had.

| Spec | Gives you | Then what |
| --- | --- | --- |
| Field Projector Geometry | Shield Projector | build it |
| Reclamation Sorting Tables | Reclamation Bay | build it |
| Breaching Torch Pattern | Breaching Torch | run it off, 380c a unit |
| Phased Return Filtering | Sensor Array | build it |
| Long-Baseline Astrogation | Deep Space Operations | build it |

Rooms stop there: building one *is* the manufacture. Kit does not — a worked-out pattern goes to
the **Fab Shop**, which charges the materials up front and runs one item at a time into the hold.
Cancel a run and the materials come back; the shift does not. The torch is carried by no hull
that will ever dock here, at any price and by any faction.

Until the drawing exists, the build menu says so: `spec needed` for one nobody has found,
`in the lab` for one being worked out.

## How it plays

You start with a reactor, an air plant, a hydroponics bay and five founders.
Everything after that is yours to build.

**Three resources, produced in cycles and consumed continuously.** Staffed rooms
fill their progress bar and dump a batch into the tanks; your crew burn oxygen and
rations every second, and every powered room draws off the grid. The header shows
the live net rate for each — that number going red is the only warning you get.

**A room that makes something also banks it.** Each resource has its own ceiling,
and the only thing that raises it is building more of what fills it: a second
Fusion Reactor buys capacitor space as well as output, an Atmospherics Plant buys
tankage, a Hydroponics Bay buys silo. A welded run banks more than the same rooms
standing apart. The bare spine holds very little on its own, so early capacity is
something you build rather than something you start with.

The **Cargo Hold** is not part of that: it racks *kit* — sidearms and armour off a
berthed hull, or whatever the Fab Shop runs off. A station starts with room for six
pieces and a hold adds fourteen per segment. Fill it and there is nowhere to put
what you buy; what a crew member is wearing takes no racking, so a full hold can
always be emptied onto people.

**Crew go where you drag them.** Pick a portrait up out of the tray at the bottom
of the screen and drop it on a room to post someone there; drop it back on the
tray to stand them down; drag straight from one room to another to reassign.
Valid rooms light up while a portrait is in the air, full ones dim, and dragging
towards an edge pans the station. Tap a portrait instead of dragging it to open
that crew member's file. It is one pointer-event implementation, so a mouse
behaves exactly like a finger.

**Every crew member has a face.** 24 portraits live in `public/crew`, each in two
sizes: a 512px dossier and a 128px thumbnail cropped in to the head, because a
whole head-and-shoulders frame becomes an unreadable smudge in a 24px room
avatar. Portraits are dealt from the pool rather than derived from a random
seed, so a station of six has six distinct faces instead of whatever the dice
gave it. Only once all 24 are spoken for does anyone wear a face twice, and then
the least-worn goes next. An applicant is dealt theirs when HQ dispatches them
and keeps it if they sign.
Tap anyone to open their dossier: portrait, serial, rank, posting, condition and
full stat readout — and their name, which you can rewrite. Ships rename the same
way, from the hangar list.

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

**Rooms can be powered down.** A room on standby draws a tenth of its usual
load, makes nothing, and stands its shift down to the off-duty tray. It is the
lever for a grid that has got ahead of your reactors: switch off the training
rooms and the hangar until you have built another one.

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

**Hiring is a conversation.** Nobody wanders in. A staffed Comms Array puts a
request to HQ, who dispatch someone; they fly out, dock at your Docking Port, and
wait — not indefinitely. Then you talk to them, and what you can say is above,
under *Talking to people*. Ask for their answer and their interest is the odds
they take it, so a half-convinced applicant is a coin toss and a wasted request.

Who turns up depends on **station standing** — size, whether you run a real
surplus, how the crew are holding up, and what is in the account. HQ does not
send its best people to a dark, hungry outpost, which is why the strongest
applicants only appear once the place is worth joining. The ones who do come
early know they are settling, and their standards are lower to match.

Crew Quarters raise your bunk cap. Training rooms raise a single stat, one point
per cycle, each point slower than the last. The Engineering Bay trains Tech and,
while staffed, runs a damage-control party that works the station's worst-damaged
rooms back towards sound — the only thing besides an upgrade that repairs
structural condition, so a station that keeps catching fire wants one.

**The clamps are busy.** Ships hail for permission to dock. A scan reads their
manifest — clean, thin, mismatched, or silent — and you decide. Most are worth
taking: traders sell a hold cheap, couriers drop contracts, patrols pay for a
berth. A few are lying, and open clamps mean an infestation or a boarding party.
Waving off a trader costs nothing; turning away a ship that really was in
trouble is remembered, and station standing is the same score that decides who
HQ sends you and how good the contracts are. Set the docking port to clear
traffic automatically and you stop being asked — and stop reading the scan.

A berthed ship pays by the second, will trade resources in lots at its own
prices, and sometimes has business to raise: a passenger who would rather stay,
a hull going cheap and no questions about which yard, an inspection that need
not happen. Those carry an exclamation mark in the bottom row.

**Ships and missions.** A Hangar Bay berths one hull, and HQ issues a shuttle
with your first one. A Command Module pulls contracts off the wire — salvage
runs, surveys, rescues, escort patrols, recovery tows — each judged on one stat,
with a danger rating, a payout and an expiry. Brief a ship and an away team and
send them out.

Outcomes run from exceptional to disaster on the team's stats against the job,
plus what the hull brings: a cutter's guns, a hauler's holds, a scout's legs. A
setback costs you cargo, hull and skin. Only a disaster can lose the ship, and
only a disaster can kill anyone. Good runs sometimes turn up a survivor who
stays, a derelict you tow home, or a sealed cache.

Hulls come from HQ for credits, from a mission you got lucky on, or from trading
in something you have outgrown, and every one of them can be refitted twice.

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
    fleet.ts       ship classes, contract generation, mission resolution
    engine.ts      the simulation, as one import — a barrel over twelve layered modules:
                   core → staffing → rooms → state → hazards → station → standing
                   → recruit → missions → traffic → tick → reducer
    save.ts        localStorage round-trip, and the version-to-version migrations
    __tests__/     station geometry, recruiting, and the mission lifecycle
  hooks/
    useGame.ts       tick loop, autosave, offline catch-up
    useDragAssign.ts pointer-event drag and drop for crew assignment
    useMediaQuery.ts the one place layout behaviour branches on screen size
  components/        station grid, bottom sheets, modals, crew dossiers
  index.css          mobile-first, with a single 900px desktop breakpoint
public/crew/         24 portraits, each as crew-NN.webp + crew-NN-sm.webp
```

Portraits were converted from 1080px PNG sources with `sharp` — dossiers are a
plain `resize(512).webp({quality: 90})`, thumbnails are
`extract({top: 0, height: 670}).resize(128, 128, {fit: 'cover', position: attention})`
so the crop lands on the head. `sharp` is not a project dependency; it was
installed for the one-off conversion and removed again, since the originals are
not in the working tree.

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

`engine.ts` is the whole game as far as anything outside `src/game/` knows: it
re-exports twelve modules, layered so that each one only imports from the layers
below it (constants and helpers at the bottom, the reducer at the top). Within
them, `reducer(state, action)` in `reducer.ts` is the only way state changes,
`advance(state, seconds)` in `tick.ts` splits any elapsed span into one-second
steps, and `derive(state)` in `state.ts` computes everything the UI displays but
never stores. Nothing under `src/game/` calls `Math.random()`: rolls come from
`roll(state)` in `core.ts`, which advances the seed the state carries. That is
what makes the reducer safe to call twice on the same input — React does, in
development — and what makes a test able to pin a seed rather than average over
sixty draws.
