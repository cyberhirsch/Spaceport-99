import { buildCost, deckCost, def, maxLevel, moveCost, upgradeCost } from './modules.ts'
import { makeCrew, uid } from './crew.ts'
import { itemDef, stock } from './gear.ts'
import { ITEM_SPEC, specDef } from './specs.ts'
import { beginTalk, labelOf, nodeOf, offered, speaker } from './talk.ts'
import { factionDef } from './factions.ts'
import { RESOURCE_INFO } from './types.ts'
import {
  makeMission,
  makeShip,
  refitCost,
  shipDef,
  shipHull,
  shipSpeed,
  teamSize,
  tradeInValue,
} from './fleet.ts'
import { TRADE_LOT } from './visitors.ts'
import type { ScriptId, SpeakerRef, Talk } from './talk.ts'
import type {
  Crew,
  ItemId,
  ItemSlot,
  SpecId,
  ShipClass,
  GameState,
  ModuleKind,
  ResourceKey,
} from './types.ts'
import {
  log,
  MAX_CATCHUP_SECONDS,
  namesInPlay,
  REQUEST_COOLDOWN,
  REQUEST_COST,
  resupplyAmount,
  resupplyCost,
  REVIVE_COST_PER_LEVEL,
  roll,
  roller,
} from './core.ts'
import { unassign, assign, autoAssignInto, allocatePortrait } from './staffing.ts'
import {
  lotsAboard,
  sellMargin,
  openSpecs,
  moduleLocked,
  fabricable,
  dockOfficers,
  fleetCapacity,
  dockBerths,
} from './rooms.ts'
import { derive, makeModule, newGame, holdRoom } from './state.ts'
import { startIncident } from './hazards.ts'
import {
  canBuildAt,
  canDemolish,
  relocateAnchor,
  countOfKind,
  mergeNeighbours,
  scrapValue,
} from './station.ts'
import { shift, appeal } from './standing.ts'
import { makeCandidate, closeHire } from './recruit.ts'
import { rollFar, answerCall, missionCapacity, inContact } from './missions.ts'
import { admitVisitor } from './traffic.ts'
import { completeCycle, advance } from './tick.ts'
import { resolveFight } from './talks/conquest.ts'

// Every action a player can take, applied to a copy of the state.

export type Action =
  | { type: 'tick'; seconds: number }
  | { type: 'catchUp'; seconds: number }
  | { type: 'build'; kind: ModuleKind; deck: number; col: number }
  | { type: 'demolish'; moduleId: string }
  | { type: 'relocate'; moduleId: string; deck: number; col: number }
  | { type: 'upgrade'; moduleId: string }
  | { type: 'assign'; crewId: string; moduleId: string | null }
  | { type: 'autoAssign' }
  | { type: 'rush'; moduleId: string }
  | { type: 'buyDeck' }
  | { type: 'resupply'; resource: ResourceKey }
  | { type: 'requestCrew' }
  | { type: 'turnAway'; candidateId: string }
  | { type: 'launch'; missionId: string; shipId: string; crewIds: string[] }
  | { type: 'declineMission'; missionId: string }
  | { type: 'fileReport'; missionId: string }
  | { type: 'buyShip'; cls: ShipClass }
  | { type: 'refitShip'; shipId: string }
  | { type: 'repairShip'; shipId: string }
  | { type: 'tradeInShip'; shipId: string }
  | { type: 'renameShip'; shipId: string; name: string }
  | { type: 'renameCrew'; crewId: string; name: string }
  | { type: 'setStandby'; moduleId: string; standby: boolean }
  | { type: 'acceptVisitor'; visitorId: string }
  | { type: 'refuseVisitor'; visitorId: string }
  | { type: 'setAutoAccept'; moduleId: string; autoAccept: boolean }
  | { type: 'tradeVisitor'; visitorId: string; resource: ResourceKey; buy: boolean }
  | { type: 'bondLot'; visitorId: string; resource: ResourceKey }
  | { type: 'sellLot'; visitorId: string; lotId: string }
  | { type: 'answerGuest'; guestId: string; yes: boolean }
  | { type: 'recall'; missionId: string }
  | { type: 'answerCall'; missionId: string; choice: number }
  | { type: 'buyGear'; visitorId: string; item: ItemId }
  | { type: 'issueGear'; crewId: string; item: ItemId }
  | { type: 'stowGear'; crewId: string; slot: ItemSlot }
  | { type: 'research'; spec: SpecId | null }
  | { type: 'talk'; script: ScriptId; with: SpeakerRef }
  | { type: 'say'; reply: number }
  | { type: 'endTalk' }
  | { type: 'fabricate'; item: ItemId | null }
  | { type: 'revive'; crewId: string }
  | { type: 'dismiss'; crewId: string }
  | { type: 'rename'; name: string }
  | { type: 'dismissIntro' }
  | { type: 'load'; state: GameState }
  | { type: 'reset' }

/**
 * Whatever a node needs doing the moment it is reached, rather than when it is
 * read. Two nodes in the game resolve something: the end of a hiring
 * conversation, and the moment a station decides to shoot back.
 */
const onEnter = (s: GameState, talk: Talk): void => {
  const c = speaker(s, talk.with)
  if (!c) return
  if (talk.script === 'hire' && talk.node === 'done') closeHire(s, talk, c)
  if (talk.script === 'conquest' && talk.node === 'fight') resolveFight(c)
}

export const reducer = (state: GameState, action: Action): GameState => {
  switch (action.type) {
    case 'tick':
      return advance(state, action.seconds)
    case 'catchUp': {
      const caught = advance(state, action.seconds, true)
      const minutes = Math.floor(Math.min(action.seconds, MAX_CATCHUP_SECONDS) / 60)
      if (minutes >= 1) {
        log(caught, `You were away ${minutes} minute${minutes === 1 ? '' : 's'}. The crew held on.`, 'info')
      }
      return caught
    }
    case 'load':
      return action.state
    case 'reset':
      return newGame(state.name)
    default:
      break
  }

  const s: GameState = structuredClone(state)

  switch (action.type) {
    case 'build': {
      if (!canBuildAt(s, action.deck, action.col)) return state
      // Some rooms cannot be built until somebody has worked out how.
      if (moduleLocked(s, action.kind)) return state
      const cost = buildCost(action.kind, countOfKind(s, action.kind))
      if (s.credits < cost) return state
      s.credits -= cost
      const placed = makeModule(action.kind, action.deck, action.col)
      const firstHangar = action.kind === 'hangar' && s.ships.length === 0
      s.modules.push(placed)
      const final = mergeNeighbours(s, placed)
      log(s, `${def(final.kind).name} online — deck ${action.deck + 1}.`, 'good')
      if (firstHangar) {
        const shuttle = makeShip(roller(s), 'shuttle', undefined, namesInPlay(s))
        s.ships.push(shuttle)
        log(s, `HQ issued a shuttle with the bay — the ${shuttle.name}.`, 'good')
      }
      break
    }
    case 'relocate': {
      const m = s.modules.find((x) => x.id === action.moduleId)
      if (!m) return state
      const anchor = relocateAnchor(s, m, action.deck, action.col)
      if (anchor === null) return state
      const cost = moveCost(m)
      if (s.credits < cost) return state
      s.credits -= cost
      const wasWidth = m.width
      m.deck = action.deck
      m.col = anchor
      const final = mergeNeighbours(s, m)
      log(
        s,
        final.width > wasWidth
          ? `${def(final.kind).name} moved to deck ${action.deck + 1} and welded into a ${final.width}-wide run. −${cost}c.`
          : `${def(final.kind).name} moved to deck ${action.deck + 1}. −${cost}c.`,
        'info',
      )
      break
    }
    case 'demolish': {
      const m = s.modules.find((x) => x.id === action.moduleId)
      if (!m || !canDemolish(s, m)) return state
      const refund = scrapValue(s, m)
      for (const id of [...m.staff]) unassign(s, id)
      s.modules = s.modules.filter((x) => x.id !== m.id)
      s.credits += refund
      log(s, `${def(m.kind).name} scrapped. +${refund}c reclaimed.`, 'info')
      break
    }
    case 'upgrade': {
      const m = s.modules.find((x) => x.id === action.moduleId)
      if (!m || m.level >= maxLevel(m)) return state
      const cost = upgradeCost(m)
      if (s.credits < cost) return state
      s.credits -= cost
      m.level += 1
      m.condition = 1
      log(s, `${def(m.kind).name} upgraded to level ${m.level}.`, 'good')
      // Rooms weld when they match, and an upgrade is one of the ways they come
      // to match — a neighbour brought up to the same level is now the same
      // room, so the bulkhead between them comes out.
      const run = mergeNeighbours(s, m)
      if (run.width > m.width) {
        log(s, `It welded into the ${def(run.kind).name} beside it — ${run.width} wide now.`, 'good')
      }
      break
    }
    case 'assign': {
      if (action.moduleId === null) unassign(s, action.crewId)
      else if (!assign(s, action.crewId, action.moduleId)) return state
      break
    }
    case 'autoAssign': {
      const moved = autoAssignInto(s)
      if (moved === 0) return state
      log(s, `Duty roster updated — ${moved} reassignment${moved === 1 ? '' : 's'}.`, 'info')
      break
    }
    case 'rush': {
      const m = s.modules.find((x) => x.id === action.moduleId)
      if (!m) return state
      const md = def(m.kind)
      if (!md.cycleSeconds || m.staff.length === 0) return state
      if (s.incidents.some((i) => i.moduleId === m.id)) return state
      if (roll(s) < m.rushRisk) {
        m.rushRisk = 0.15
        m.progress = 0
        const r = roll(s)
        startIncident(s, r < 0.55 ? 'fire' : r < 0.85 ? 'breach' : 'vermin', m)
      } else {
        m.rushRisk = Math.min(0.75, m.rushRisk + 0.13)
        m.progress = 0
        completeCycle(s, m, derive(s).caps)
        log(s, `${md.name} rushed successfully.`, 'good')
      }
      break
    }
    case 'buyDeck': {
      const cost = deckCost(s.decks)
      if (s.credits < cost) return state
      s.credits -= cost
      s.decks += 1
      log(s, `Deck ${s.decks} pressurised.`, 'good')
      break
    }
    case 'resupply': {
      const cap = derive(s).caps[action.resource]
      const cost = resupplyCost(cap)
      if (s.credits < cost) return state
      if (s.resources[action.resource] >= cap) return state
      s.credits -= cost
      s.resources[action.resource] = Math.min(cap, s.resources[action.resource] + resupplyAmount(cap))
      log(s, `Emergency ${RESOURCE_INFO[action.resource].name} barge docked. -${cost}c.`, 'warn')
      break
    }
    case 'requestCrew': {
      if (s.broadcastCooldown > 0) return state
      if (s.credits < REQUEST_COST) return state
      const commsOnline = s.modules.some((m) => m.kind === 'comms' && m.staff.length > 0)
      if (!commsOnline) return state
      const waiting = s.candidates.length
      if (waiting >= dockBerths(s)) return state
      const d = derive(s)
      if (d.crewAlive.length >= d.crewCap) return state
      s.credits -= REQUEST_COST
      s.broadcastCooldown = REQUEST_COOLDOWN
      // A sharp operator on the comms desk gets HQ to look a little harder.
      let luck = 0
      for (const m of s.modules.filter((x) => x.kind === 'comms')) {
        for (const id of m.staff) {
          const c = s.crew.find((x) => x.id === id)
          if (c) luck = Math.max(luck, c.stats.L)
        }
      }
      const cand = makeCandidate(s, luck)
      s.candidates.push(cand)
      log(s, `HQ is sending ${cand.name} over for an interview.`, 'info')
      break
    }
    case 'turnAway': {
      const cand = s.candidates.find((x) => x.id === action.candidateId)
      if (!cand) return state
      s.candidates = s.candidates.filter((x) => x.id !== cand.id)
      log(s, `${cand.name} was sent back to HQ.`, 'info')
      break
    }
    case 'launch': {
      const m = s.missions.find((x) => x.id === action.missionId)
      const ship = s.ships.find((x) => x.id === action.shipId)
      if (!m || m.status !== 'offered' || !ship || ship.missionId) return state
      if (s.missions.filter((x) => x.status === 'flying').length >= missionCapacity(s)) return state
      const team = action.crewIds
        .map((id) => s.crew.find((c) => c.id === id))
        .filter((c): c is Crew => c !== undefined && !c.dead)
      if (team.length === 0 || team.length > teamSize(m)) return state
      // A hull with nothing left in it does not leave the bay.
      if (ship.hull <= 0) return state
      m.status = 'flying'
      m.shipId = ship.id
      m.crewIds = team.map((c) => c.id)
      m.remaining = Math.round(m.seconds / shipSpeed(ship))
      ship.missionId = m.id
      // The away team comes off the duty roster while they are gone.
      for (const c of team) unassign(s, c.id)
      log(s, `${ship.name} launched — ${m.name}.`, 'info')
      break
    }
    case 'declineMission': {
      const m = s.missions.find((x) => x.id === action.missionId)
      if (!m || m.status !== 'offered') return state
      s.missions = s.missions.filter((x) => x.id !== m.id)
      // Refusing work you were handed because of the flag you fly is the whole
      // cost of that work. There was never a reward to forgo.
      if (m.obligation && m.standing) {
        shift(s, m.standing[0], -Math.abs(m.standing[1]))
        log(s, `${m.name} declined. ${factionDef(m.standing[0]).name} was told.`, 'warn')
      }
      break
    }
    case 'fileReport': {
      const m = s.missions.find((x) => x.id === action.missionId)
      if (!m || m.status !== 'report') return state
      s.missions = s.missions.filter((x) => x.id !== m.id)
      break
    }
    case 'buyShip': {
      const price = shipDef(action.cls).price
      if (s.credits < price) return state
      if (s.ships.length >= fleetCapacity(s)) return state
      s.credits -= price
      const bought = makeShip(roller(s), action.cls, undefined, namesInPlay(s))
      s.ships.push(bought)
      log(s, `HQ delivered the ${bought.name}, a ${shipDef(action.cls).name.toLowerCase()}.`, 'good')
      break
    }
    case 'refitShip': {
      const ship = s.ships.find((x) => x.id === action.shipId)
      if (!ship || ship.missionId || ship.level >= 3) return state
      const cost = refitCost(ship)
      if (s.credits < cost) return state
      s.credits -= cost
      ship.level += 1
      ship.maxHull = shipHull(ship)
      ship.hull = ship.maxHull
      log(s, `${ship.name} refitted to mark ${ship.level}.`, 'good')
      break
    }
    case 'repairShip': {
      const ship = s.ships.find((x) => x.id === action.shipId)
      if (!ship || ship.missionId) return state
      const missing = shipHull(ship) - ship.hull
      if (missing <= 0) return state
      const cost = Math.round(missing * 2.4)
      if (s.credits < cost) return state
      s.credits -= cost
      ship.hull = shipHull(ship)
      ship.maxHull = ship.hull
      break
    }
    case 'tradeInShip': {
      const ship = s.ships.find((x) => x.id === action.shipId)
      if (!ship || ship.missionId) return state
      s.credits += tradeInValue(ship)
      s.ships = s.ships.filter((x) => x.id !== ship.id)
      log(s, `${ship.name} was signed over to HQ.`, 'info')
      break
    }
    case 'renameShip': {
      const ship = s.ships.find((x) => x.id === action.shipId)
      if (!ship) return state
      ship.name = action.name.slice(0, 24) || ship.name
      break
    }
    case 'setStandby': {
      const m = s.modules.find((x) => x.id === action.moduleId)
      if (!m) return state
      m.standby = action.standby
      // Nothing useful happens in a dark room, so the shift is stood down.
      if (action.standby) for (const id of [...m.staff]) unassign(s, id)
      log(
        s,
        `${def(m.kind).name} ${action.standby ? 'powered down to standby' : 'brought back online'}.`,
        'info',
      )
      break
    }
    case 'acceptVisitor': {
      const v = s.visitors.find((x) => x.id === action.visitorId)
      if (!v || v.status !== 'requesting') return state
      // Nobody on the desk, nothing comes alongside.
      if (dockOfficers(s) === 0) return state
      admitVisitor(s, v)
      break
    }
    case 'refuseVisitor': {
      const v = s.visitors.find((x) => x.id === action.visitorId)
      if (!v || v.status !== 'requesting') return state
      s.visitors = s.visitors.filter((x) => x.id !== v.id)
      // Waving off a trader costs nothing. Turning away someone who is actually
      // in trouble is remembered, whatever their manifest looked like.
      if (v.kind === 'drifter') {
        shift(s, v.faction, -0.03)
        log(s, `${v.name} was refused a berth. They were not lying.`, 'warn')
      } else {
        // Turning away your own flag is noticed by the people who issued it.
        if (v.faction === s.patron) shift(s, v.faction, -0.01)
        log(s, `${v.name} was waved off.`, 'info')
      }
      break
    }
    case 'setAutoAccept': {
      const m = s.modules.find((x) => x.id === action.moduleId)
      if (!m || m.kind !== 'dock') return state
      m.autoAccept = action.autoAccept
      log(
        s,
        `Docking clamps set to ${action.autoAccept ? 'accept all traffic' : 'ask the commander'}.`,
        'info',
      )
      break
    }
    case 'tradeVisitor': {
      const v = s.visitors.find((x) => x.id === action.visitorId)
      if (!v || v.status !== 'docked') return state
      const cap = derive(s).caps[action.resource]
      const unit = v.prices[action.resource]
      if (action.buy) {
        const room = cap - s.resources[action.resource]
        const lot = Math.min(TRADE_LOT, Math.floor(room))
        const cost = Math.round(lot * unit)
        if (lot <= 0 || s.credits < cost) return state
        s.credits -= cost
        s.resources[action.resource] += lot
      } else {
        const lot = Math.min(TRADE_LOT, Math.floor(s.resources[action.resource]))
        if (lot <= 0) return state
        s.resources[action.resource] -= lot
        s.credits += Math.round(lot * unit * sellMargin(s))
      }
      // Commerce is how a station ends up with friends it did not plan on.
      shift(s, v.faction, 0.002)
      break
    }
    case 'bondLot': {
      const v = s.visitors.find((x) => x.id === action.visitorId)
      if (!v || v.status !== 'docked') return state
      if (s.bonded.length >= lotsAboard(s)) {
        log(s, 'The bonded cage is full. Sell something on first.', 'warn')
        break
      }
      // Bonded cargo never touches the station's own tanks — it is not yours.
      const unit = v.prices[action.resource]
      const paid = Math.round(TRADE_LOT * unit)
      if (s.credits < paid) return state
      s.credits -= paid
      s.bonded.push({
        id: uid('lot'),
        resource: action.resource,
        units: TRADE_LOT,
        paid,
        from: v.faction,
      })
      shift(s, v.faction, 0.004)
      log(
        s,
        `Bonded ${TRADE_LOT} ${RESOURCE_INFO[action.resource].name.toLowerCase()} off ${v.name}. −${paid}c.`,
        'info',
      )
      break
    }
    case 'sellLot': {
      const v = s.visitors.find((x) => x.id === action.visitorId)
      const lot = s.bonded.find((x) => x.id === action.lotId)
      if (!v || v.status !== 'docked' || !lot) return state
      // They pay their own price, not the one you bought at — which is the
      // entire point of holding it until the right hull turns up.
      const take = Math.round(lot.units * v.prices[lot.resource] * sellMargin(s))
      s.credits += take
      s.bonded = s.bonded.filter((x) => x.id !== lot.id)
      const swing = take - lot.paid
      log(
        s,
        `Sold a bonded lot to ${v.name} for ${take}c — ${swing >= 0 ? 'up' : 'down'} ${Math.abs(swing)}c on what it cost.`,
        swing >= 0 ? 'good' : 'warn',
      )
      shift(s, v.faction, 0.004)
      break
    }
    case 'answerGuest': {
      const v = s.visitors.find((x) => x.aboard.some((g) => g.id === action.guestId))
      const g = v?.aboard.find((x) => x.id === action.guestId)
      if (!v || !g || v.status !== 'docked' || !g.offer) return state
      const offer = g.offer
      g.offer = null
      if (!action.yes) break

      if (offer.kind === 'mission') {
        s.missions.push(makeMission(roller(s), appeal(s), { far: rollFar(s) }))
        log(s, `${g.name} handed over a contract off ${v.name}.`, 'good')
        break
      }
      const effect = offer.effect
      if (!effect) break
      switch (effect.type) {
        case 'credits':
          s.credits += effect.amount
          if (effect.standing) shift(s, v.faction, effect.standing)
          log(s, `${g.name} settled up quietly. +${effect.amount}c.`, 'warn')
          break
        case 'passenger': {
          if (s.crew.filter((c) => !c.dead).length >= derive(s).crewCap) {
            log(s, `${g.name}'s passenger had nowhere to sleep and stayed aboard.`, 'warn')
            break
          }
          const joiner = makeCrew(roller(s), { portrait: allocatePortrait(s) })
          s.crew.push(joiner)
          log(s, `${joiner.name} came off ${v.name} and stayed.`, 'good')
          break
        }
        case 'cheapShip': {
          if (s.credits < effect.price || s.ships.length >= fleetCapacity(s)) {
            log(s, `No berth or no money — the hull went back aboard ${v.name}.`, 'warn')
            break
          }
          s.credits -= effect.price
          const hull = makeShip(roller(s), effect.cls, undefined, namesInPlay(s))
          hull.hull = Math.round(hull.maxHull * 0.7)
          s.ships.push(hull)
          log(s, `Bought the ${hull.name} off ${v.name}, no questions asked.`, 'good')
          break
        }
        case 'repair': {
          const worst = [...s.modules].sort((a, b) => a.condition - b.condition)[0]
          if (worst) worst.condition = 1
          log(s, `${g.name} put the ${worst ? def(worst.kind).name : 'station'} right.`, 'good')
          break
        }
        case 'leadMission': {
          const price = 150
          if (s.credits < price) {
            log(s, 'No money for coordinates.', 'warn')
            break
          }
          s.credits -= price
          const lead = makeMission(roller(s), Math.min(1, appeal(s) + 0.3))
          lead.payout.credits = Math.round(lead.payout.credits * 1.6)
          s.missions.push(lead)
          log(s, `Bought a lead off ${v.name}. It had better be good.`, 'info')
          break
        }
      }
      break
    }
    case 'recall': {
      const m = s.missions.find((x) => x.id === action.missionId)
      if (!m || m.status !== 'flying' || m.shape !== 'open' || m.recalled) return state
      // You cannot tell them anything without a controller on their channel.
      if (!inContact(s).has(m.id)) return state
      m.recalled = true
      m.remaining = m.seconds
      log(s, `${m.name} recalled. ${Math.ceil(m.remaining)}s out.`, 'info')
      break
    }
    case 'answerCall': {
      const m = s.missions.find((x) => x.id === action.missionId)
      if (!m || m.status !== 'calling') return state
      if (!inContact(s).has(m.id)) return state
      const before = m.call
      answerCall(s, m, action.choice)
      if (m.call === before) return state
      break
    }
    case 'buyGear': {
      const v = s.visitors.find((x) => x.id === action.visitorId)
      if (!v || v.status !== 'docked') return state
      const line = stock(v.faction).find((x) => x.id === action.item)
      if (!line || s.credits < line.price) return state
      if (holdRoom(s) <= 0) {
        log(s, `Nowhere to rack it. The hold is full.`, 'warn')
        break
      }
      s.credits -= line.price
      s.stores[action.item] = (s.stores[action.item] ?? 0) + 1
      shift(s, v.faction, 0.004)
      log(s, `Bought a ${itemDef(action.item).name.toLowerCase()} off ${v.name}. −${line.price}c.`, 'info')
      break
    }
    case 'issueGear': {
      const c = s.crew.find((x) => x.id === action.crewId)
      const held = s.stores[action.item] ?? 0
      if (!c || c.dead || held <= 0) return state
      const slot = itemDef(action.item).slot
      // Whatever they were carrying in that slot goes back in the hold.
      const worn = c.gear?.[slot]
      if (worn) s.stores[worn] = (s.stores[worn] ?? 0) + 1
      s.stores[action.item] = held - 1
      c.gear = { ...c.gear, [slot]: action.item }
      break
    }
    case 'stowGear': {
      const c = s.crew.find((x) => x.id === action.crewId)
      const worn = c?.gear?.[action.slot]
      if (!c || !worn) return state
      s.stores[worn] = (s.stores[worn] ?? 0) + 1
      const next = { ...c.gear }
      delete next[action.slot]
      c.gear = next
      break
    }
    case 'research': {
      // The lab works one drawing at a time. Switching does not lose the work
      // already done on the other — paper keeps.
      if (action.spec === null) {
        s.researching = null
        break
      }
      if (!openSpecs(s).includes(action.spec)) return state
      if (s.researching === action.spec) return state
      s.researching = action.spec
      log(s, `The lab took up ${specDef(action.spec).name}.`, 'info')
      break
    }
    case 'fabricate': {
      if (action.item === null) {
        // Cancelling refunds the materials. The shift is gone either way.
        if (!s.fabricating) return state
        const spec = ITEM_SPEC[s.fabricating.item]
        const build = spec ? specDef(spec).build : undefined
        if (build) s.credits += build.credits
        s.fabricating = null
        break
      }
      if (s.fabricating) return state
      if (!fabricable(s).includes(action.item)) return state
      const spec = ITEM_SPEC[action.item]
      const build = spec ? specDef(spec).build : undefined
      if (!build || s.credits < build.credits) return state
      if (holdRoom(s) <= 0) {
        log(s, `The shop has nowhere to put it. The hold is full.`, 'warn')
        break
      }
      s.credits -= build.credits
      s.fabricating = { item: action.item, progress: 0 }
      log(s, `The Fab Shop laid on a ${itemDef(action.item).name}. −${build.credits}c.`, 'info')
      break
    }
    case 'talk': {
      // One conversation at a time. Opening a new one abandons the old.
      const ref = action.with
      // Look them up before committing, so a stale id opens nothing.
      const probe: GameState = { ...s, talk: beginTalk(action.script, ref, '') }
      const found = speaker(probe, ref)
      if (!found) return state
      s.talk = beginTalk(action.script, ref, found.name)
      break
    }
    case 'endTalk': {
      // A conversation that cannot be walked away from stays open.
      const node = s.talk ? nodeOf(s.talk) : null
      if (node?.sticky) return state
      s.talk = null
      break
    }
    case 'say': {
      const talk = s.talk
      if (!talk) return state
      const node = nodeOf(talk)
      const c = speaker(s, talk.with)
      if (!node || !c) {
        s.talk = null
        break
      }
      const picked = offered(c, node).find((o) => o.index === action.reply)
      if (!picked || picked.barred) return state
      const { reply } = picked

      // What the commander said goes into the record before anything moves,
      // so the transcript reads in the order it happened.
      talk.said.push({ who: 'them', text: node.text(c) })
      talk.said.push({ who: 'you', text: labelOf(reply, c) })

      for (const flag of reply.sets ?? []) {
        if (!talk.flags.includes(flag)) talk.flags.push(flag)
      }
      reply.effect?.(c)

      const next = typeof reply.goto === 'function' ? reply.goto(c) : reply.goto
      if (next === null) {
        s.talk = null
        break
      }
      talk.node = next
      onEnter(s, talk)
      break
    }
    case 'renameCrew': {
      const c = s.crew.find((x) => x.id === action.crewId)
      if (!c) return state
      c.name = action.name.slice(0, 24) || c.name
      break
    }
    case 'revive': {
      const c = s.crew.find((x) => x.id === action.crewId)
      if (!c || !c.dead) return state
      const cost = REVIVE_COST_PER_LEVEL * c.level
      if (s.credits < cost) return state
      s.credits -= cost
      c.dead = false
      c.hp = Math.max(1, Math.round(c.maxHp * 0.4))
      c.morale = 0.5
      log(s, `${c.name} was pulled back from the brink. -${cost}c.`, 'good')
      break
    }
    case 'dismiss': {
      const c = s.crew.find((x) => x.id === action.crewId)
      if (!c) return state
      unassign(s, c.id)
      s.crew = s.crew.filter((x) => x.id !== c.id)
      log(s, `${c.name} left on the supply barge.`, 'info')
      break
    }
    case 'rename': {
      s.name = action.name.slice(0, 28) || 'Spaceport-99'
      break
    }
    case 'dismissIntro': {
      s.seenIntro = true
      break
    }
    default:
      return state
  }
  return s
}
