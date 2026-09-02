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

**Hiring is a negotiation.** Nobody wanders in. A staffed Comms Array puts a
request to HQ, who dispatch someone; they fly out, dock at your Docking Port, and
wait — not indefinitely. Then you interview them, with three tactics you can each
use once: pay their signing bonus, pitch the station, or promise them a specific
post. Offer them a contract and their interest is the odds they take it, so a
half-convinced applicant is a coin toss and a wasted request.

Who turns up depends on **station standing** — size, whether you run a real
surplus, how the crew are holding up, and what is in the account. HQ does not
send its best people to a dark, hungry outpost, which is why the strongest
applicants only appear once the place is worth joining. The ones who do come
early know they are settling, and their standards are lower to match.

Crew Quarters raise your bunk cap. Training rooms raise a single stat, one point
per cycle, each point slower than the last.

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
    engine.ts      the simulation: derive(), the per-second step, and the reducer
    save.ts        localStorage round-trip
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

`engine.ts` is the whole game. `reducer(state, action)` is the only way state
changes, `advance(state, seconds)` splits any elapsed span into one-second steps,
and `derive(state)` computes everything the UI displays but never stores.
