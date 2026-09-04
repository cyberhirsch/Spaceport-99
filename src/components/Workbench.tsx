import {
  cellsAboard,
  derive,
  discretion,
  exposureRisk,
  fabRate,
  fabricable,
  heldItems,
  knows,
  openSpecs,
  researchRate,
} from '../game/engine.ts'
import { itemDef } from '../game/gear.ts'
import { ITEM_SPEC, SPEC_IDS, specDef } from '../game/specs.ts'
import { def } from '../game/modules.ts'
import { FACTION_IDS, factionDef, standingWord } from '../game/factions.ts'
import { LOST, knowsEnough, questSummary } from '../game/quest.ts'
import type { GameState, ItemId, SpecId } from '../game/types.ts'

/** Seconds, rounded to something a person would say out loud. */
const eta = (remaining: number, rate: number): string => {
  if (rate <= 0) return 'stalled — nobody is working'
  const s = Math.ceil(remaining / rate)
  if (s < 90) return `${s}s`
  return `${Math.ceil(s / 60)} min`
}

/** What a spec gives you, in one line. */
const gift = (id: SpecId): string => {
  const u = specDef(id).unlocks
  return u.kind === 'module' ? `builds ${def(u.module).name}` : `runs off ${itemDef(u.item).name}`
}

interface LabProps {
  state: GameState
  onResearch: (spec: SpecId | null) => void
}

/**
 * The Research Lab's own panel. Everything the station has ever recovered is
 * listed here, whether it has been worked out or not, because a drawing you
 * cannot read yet is still the only copy anyone has.
 */
export const LabPanel = ({ state, onResearch }: LabProps) => {
  const crewById = new Map(state.crew.map((c) => [c.id, c]))
  const rate = researchRate(state, crewById)
  const open = openSpecs(state)
  const held = SPEC_IDS.filter((id) => state.specs[id] !== undefined)
  const active = state.researching

  return (
    <>
      <h3 className="modal__sub">On the board</h3>
      {held.length === 0 ? (
        <p className="panel-note">
          Nothing to work on. Specs are not sold — they turn up out there, in wrecks and holds and
          the pockets of people who no longer need them. Send crew on jobs and they will find one.
        </p>
      ) : (
        <ul className="specs">
          {held.map((id) => {
            const sd = specDef(id)
            const done = knows(state, id)
            const at = state.specs[id] ?? 0
            const working = active === id
            return (
              <li key={id} className={`spec${done ? ' spec--done' : ''}${working ? ' spec--live' : ''}`}>
                <span className="spec__head">
                  <b>{sd.name}</b>
                  <em>{gift(id)}</em>
                </span>
                <span className="spec__blurb">{sd.blurb}</span>
                <span className="spec__bar">
                  <i style={{ width: `${at * 100}%` }} />
                </span>
                <span className="spec__foot">
                  <em>
                    {done
                      ? 'Worked out. It is yours.'
                      : working
                        ? `${Math.round(at * 100)}% · ${eta((1 - at) * sd.effort, rate)}`
                        : `${Math.round(at * 100)}% · set aside`}
                  </em>
                  {!done &&
                    (working ? (
                      <button className="btn btn--tiny" onClick={() => onResearch(null)}>
                        Set aside
                      </button>
                    ) : (
                      <button className="btn btn--tiny" onClick={() => onResearch(id)}>
                        Take it up
                      </button>
                    ))}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="panel-note">
        The lab works one drawing at a time, at <b>{rate.toFixed(1)}</b> a second — its crew's
        Intellect, its size and its level. Setting one aside loses nothing; paper keeps.
        {open.length > 1 ? ` ${open.length} still to work out.` : ''}
      </p>
    </>
  )
}

interface FabProps {
  state: GameState
  onFabricate: (item: ItemId | null) => void
}

/**
 * The Fab Shop. It can only run patterns the lab has finished, one at a time,
 * and each run costs materials up front.
 */
export const FabPanel = ({ state, onFabricate }: FabProps) => {
  const crewById = new Map(state.crew.map((c) => [c.id, c]))
  const rate = fabRate(state, crewById)
  const ready = fabricable(state)
  const run = state.fabricating

  const running = run ? itemDef(run.item) : null
  const runSpec = run ? ITEM_SPEC[run.item] : undefined
  const runBuild = runSpec ? specDef(runSpec).build : undefined

  return (
    <>
      <h3 className="modal__sub">Fabrication</h3>
      {run && running && runBuild ? (
        <div className="fab-run">
          <span className="spec__head">
            <b>{running.name}</b>
            <em>{eta((1 - run.progress) * runBuild.seconds, rate)}</em>
          </span>
          <span className="spec__bar">
            <i style={{ width: `${run.progress * 100}%` }} />
          </span>
          <span className="spec__foot">
            <em>{Math.round(run.progress * 100)}% · goes to the hold when it is done</em>
            <button className="btn btn--tiny btn--danger" onClick={() => onFabricate(null)}>
              Cancel — {runBuild.credits}c back
            </button>
          </span>
        </div>
      ) : ready.length === 0 ? (
        <p className="panel-note">
          Nothing to run. The shop can only make things somebody has worked out first — find a
          spec out there, then put the lab on it.
        </p>
      ) : (
        <ul className="specs">
          {ready.map((item) => {
            const it = itemDef(item)
            const spec = ITEM_SPEC[item]
            const build = spec ? specDef(spec).build : undefined
            if (!build) return null
            const poor = state.credits < build.credits
            const noRoom = heldItems(state) >= derive(state).holdCap
            return (
              <li key={item} className="spec">
                <span className="spec__head">
                  <b>{it.name}</b>
                  <em>
                    {it.slot} · guard {it.guard}
                  </em>
                </span>
                <span className="spec__blurb">{it.blurb}</span>
                <span className="spec__foot">
                  <em>
                    {build.credits}c · {build.seconds}s of shop time · {state.stores[item] ?? 0} in
                    the hold
                  </em>
                  <button
                    className="btn btn--tiny"
                    disabled={poor || noRoom}
                    onClick={() => onFabricate(item)}
                    title={
                      noRoom
                        ? 'Nowhere to put it — the hold is full'
                        : poor
                          ? 'Not enough credits for the materials'
                          : undefined
                    }
                  >
                    {noRoom ? 'Hold full' : 'Lay one on'}
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="panel-note">
        The shop runs at <b>{rate.toFixed(1)}</b> a second and does one thing at a time. Nothing
        made here can be bought from a visiting hull at any price.
      </p>
    </>
  )
}

interface BrigProps {
  state: GameState
  onTalk: (prisonerId: string) => void
}

/**
 * The Brig's own panel: who is in the cells, what for, and how long they have
 * been there. Everything you can do about it is a conversation.
 */
export const BrigPanel = ({ state, onTalk }: BrigProps) => {
  const cells = cellsAboard(state)
  const held = state.prisoners

  return (
    <>
      <h3 className="modal__sub">
        Cells ({held.length}/{cells})
      </h3>
      {held.length === 0 ? (
        <p className="panel-note">
          Empty. People end up in here off a hull that would not account for its hold, and what
          happens to them after that is a conversation rather than a timer.
        </p>
      ) : (
        <ul className="specs">
          {held.map((p) => (
            <li key={p.id} className="spec">
              <span className="spec__head">
                <b>{p.name}</b>
                <em>{factionDef(p.faction).short}</em>
              </span>
              <span className="spec__blurb">
                Off the {p.hull} — {p.charge}.
              </span>
              <span className="spec__foot">
                <em>{Math.floor(p.held / 60)} min in the cells</em>
                <button className="btn btn--tiny" onClick={() => onTalk(p.id)}>
                  Talk to them
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="panel-note">
        Cells only hold while somebody is standing in the room and the power is on. Take the watch
        off and whoever is in here is gone by the next shift.
      </p>
    </>
  )
}

interface CovertProps {
  state: GameState
}

/**
 * The channels ledger.
 *
 * Two numbers per power: what they say about the station, and what they would
 * say if nobody were listening. Building the room is what lets you read the
 * second column at all — without it you are dealing blind and hoping.
 */
export const CovertPanel = ({ state }: CovertProps) => {
  const risk = Math.round(exposureRisk(state) * 100)
  const hidden = Math.round(discretion(state) * 100)

  return (
    <>
      <h3 className="modal__sub">Channels</h3>
      <ul className="specs">
        {FACTION_IDS.map((id) => {
          const d = factionDef(id)
          const open = state.covert[id]
          return (
            <li key={id} className="spec">
              <span className="spec__head">
                <b>
                  {d.glyph} {d.short}
                </b>
                <em>{state.patron === id ? 'your flag' : standingWord(state.standing[id])}</em>
              </span>
              <span className="spec__blurb">
                {open > 0.02
                  ? `Off the record, they would take your call — and they would expect you to take theirs.`
                  : open < -0.02
                    ? `Off the record, they have stopped asking.`
                    : `Nothing off the record either way. Yet.`}
              </span>
              <span className="spec__foot">
                <em>on paper {Math.round(state.standing[id] * 100)}</em>
                <em>off it {Math.round(open * 100)}</em>
              </span>
            </li>
          )
        })}
      </ul>
      <p className="panel-note">
        This room keeps <b>{hidden}%</b> of an arrangement off the record, so the next one you take
        has roughly a <b>{risk}%</b> chance of coming out — more for the bigger asks. Take the watch
        off it and that figure is what it was before you built the place.
        {state.burned > 0 && (
          <>
            {' '}
            <b>
              {state.burned} {state.burned === 1 ? 'arrangement has' : 'arrangements have'} already
              come out.
            </b>{' '}
            Nobody forgets the second one.
          </>
        )}
      </p>
    </>
  )
}

interface FileProps {
  state: GameState
  onRead: () => void
  onDecide: () => void
}

/**
 * The file.
 *
 * Seven names, seven dates, and whatever the teams have brought back. It lives
 * in the Comms Array because that is where the letter was logged as traffic
 * before anybody read it properly, and it is the only place in the game that
 * shows the questline as a whole.
 */
export const FilePanel = ({ state, onRead, onDecide }: FileProps) => {
  const q = state.quest
  if (q.stage === 'none') {
    return (
      <p className="panel-note">
        The array logs everything that comes in on the open channel, most of which is weather and
        beacon traffic. Somebody reads it once a shift. Nothing has needed reading twice.
      </p>
    )
  }

  return (
    <>
      <h3 className="modal__sub">The file ({q.checked.length}/7 checked)</h3>
      <ul className="specs">
        {LOST.map((h) => {
          const done = q.checked.includes(h.name)
          return (
            <li key={h.name} className={`spec${done ? ' spec--known' : ''}`}>
              <span className="spec__head">
                <b>{h.name}</b>
                <em>{h.silent}</em>
              </span>
              <span className="spec__blurb">{done ? h.found : `Filed: ${h.filed}`}</span>
              {!done && (
                <span className="spec__foot">
                  <em>not checked — it takes a far contract to go and look</em>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <p className="panel-note">{questSummary(state)}</p>
      <div className="modal__actions">
        <button className="btn" onClick={onRead}>
          Read the letter again
        </button>
        {knowsEnough(q) && q.stage !== 'over' && (
          <button className="btn btn--primary" onClick={onDecide}>
            Decide what to do with it
          </button>
        )}
      </div>
      {q.ending && (
        <p className="panel-note">
          <b>The file is closed.</b> Nothing further will come of it, which is either a relief or
          the worst thing in the log, depending on which way you closed it.
        </p>
      )}
    </>
  )
}
