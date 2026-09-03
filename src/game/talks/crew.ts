import { def, derive, staffSlots } from '../engine.ts'
import { STAT_KEYS, type Crew, type GameState, type StatKey } from '../types.ts'
import { registerScript, type TalkCtx, type TalkScript } from '../talk.ts'

/**
 * Talking to your own people.
 *
 * There is nothing to win here. It is where the crew tell you what is actually
 * wrong with the station, which is information you cannot get from a readout,
 * and where a commander who listens is worth something to the people who have
 * to live with the decisions.
 */

/** What is wrong right now, worst first. Empty when the place is running well. */
const gripes = (s: GameState): string[] => {
  const d = derive(s)
  const out: string[] = []
  if (s.resources.food <= 0) out.push('nobody has eaten since the last shift and everyone knows it')
  else if (d.foodRate < 0) out.push('the food is going down and nothing is putting it back')
  if (s.resources.air <= 0) out.push('the air is gone and people are being careful about talking')
  else if (d.airRate < 0) out.push('the scrubbers are losing ground')
  if (d.powerRate < 0) out.push('half the lights are on a rota')
  if (s.incidents.length > 0) out.push('there is a fire nobody has put out yet')
  if (!s.modules.some((m) => def(m.kind).heals)) out.push('there is nowhere to take somebody who is hurt')
  const crowded = d.crewAlive.length > d.crewCap - 1
  if (crowded) out.push('people are sleeping in the corridor because there are no bunks left')
  return out
}

const bestStat = (c: Crew): StatKey =>
  STAT_KEYS.reduce((best, k) => (c.stats[k] > c.stats[best] ? k : best), STAT_KEYS[0])

const post = (c: TalkCtx) =>
  c.crew?.assignment ? c.s.modules.find((m) => m.id === c.crew!.assignment) : undefined

const script: TalkScript = {
  start: {
    text: (c) => {
      const crew = c.crew
      if (!crew) return ''
      const where = post(c)
      if (crew.hp < crew.maxHp * 0.5) return `"I am fine. I have had worse." They are not fine.`
      if (!where) return `"Nothing to do and nowhere to be. I do not love it, if I am honest."`
      if (crew.morale < 0.35) return `"Commander." That is the whole greeting.`
      return `"Commander. Everything is holding in the ${def(where.kind).name}, more or less."`
    },
    beat: (c) => {
      const crew = c.crew
      if (!crew) return null
      const where = post(c)
      return `Level ${crew.level} · best at ${bestStat(crew)} · ${
        where ? def(where.kind).name : 'off duty'
      }`
    },
    replies: [
      { label: 'How are you holding up?', goto: 'holding' },
      { label: 'What is actually wrong with this place?', goto: 'wrong' },
      {
        label: 'Where would you rather be posted?',
        when: (c) => Boolean(c.crew),
        goto: 'posting',
      },
      {
        label: 'Tell them they are doing good work.',
        note: () => 'Costs nothing. Not worth much if you say it every day.',
        when: (c) => !c.has('praised'),
        sets: ['praised'],
        effect: (c) => {
          const crew = c.crew
          if (!crew) return
          // Worth more to somebody who is struggling, and worth nothing to
          // somebody who has heard it recently.
          crew.morale = Math.min(1, crew.morale + (crew.morale < 0.5 ? 0.12 : 0.04))
        },
        goto: 'praised',
      },
      { label: 'Carry on.', goto: null },
    ],
  },

  holding: {
    text: (c) => {
      const crew = c.crew
      if (!crew) return ''
      if (crew.hp < crew.maxHp * 0.5)
        return `"Ribs, mostly. The med bay says a week. I say three days." They are wrong about that.`
      if (crew.morale < 0.3)
        return `"You want the answer, or the answer that keeps the shift running?"`
      if (crew.morale < 0.6) return `"Tired. It is not a complaint, it is just the answer."`
      if (crew.level >= 4)
        return `"Better than I expected, honestly. I know this station now. That counts for something."`
      return `"Fine. I have been on worse posts with better paint."`
    },
    replies: [
      {
        label: 'The answer, please.',
        when: (c) => (c.crew?.morale ?? 1) < 0.3,
        goto: 'wrong',
      },
      { label: 'What is actually wrong with this place?', goto: 'wrong' },
      { label: 'Carry on.', goto: null },
    ],
  },

  wrong: {
    text: (c) => {
      const list = gripes(c.s)
      if (list.length === 0)
        return `They think about it properly, which is its own answer. "Nothing I would raise. That is not a thing I have said on a posting before."`
      if (list.length === 1) return `"One thing. ${cap(list[0])}. Otherwise it is a good berth."`
      return `"You asked, so: ${cap(list[0])}. And ${list[1]}." They stop there, deliberately.`
    },
    beat: (c) => {
      const n = gripes(c.s).length
      return n > 2 ? `They are being polite. There are ${n} of these.` : null
    },
    replies: [
      {
        label: 'Anything else?',
        when: (c) => gripes(c.s).length > 2,
        goto: 'wrong-more',
      },
      {
        label: 'Thank you for saying it.',
        note: () => 'People who get heard say more next time.',
        when: (c) => !c.has('thanked') && gripes(c.s).length > 0,
        sets: ['thanked'],
        effect: (c) => {
          if (c.crew) c.crew.morale = Math.min(1, c.crew.morale + 0.08)
        },
        goto: null,
      },
      { label: 'Carry on.', goto: null },
    ],
  },

  'wrong-more': {
    text: (c) => {
      const list = gripes(c.s).slice(2)
      return `"Since you are asking: ${list.join(', and ')}." A pause. "That is the lot."`
    },
    replies: [
      {
        label: 'Thank you for saying it.',
        when: (c) => !c.has('thanked'),
        sets: ['thanked'],
        effect: (c) => {
          if (c.crew) c.crew.morale = Math.min(1, c.crew.morale + 0.08)
        },
        goto: null,
      },
      { label: 'Carry on.', goto: null },
    ],
  },

  posting: {
    text: (c) => {
      const crew = c.crew
      if (!crew) return ''
      const stat = bestStat(crew)
      const fits = c.s.modules.filter(
        (m) => def(m.kind).stat === stat && m.staff.length < staffSlots(m),
      )
      const where = post(c)
      if (where && def(where.kind).stat === stat)
        return `"Here. I am good at this and you have not moved me, which I appreciate more than you would think."`
      if (fits.length > 0)
        return `"The ${def(fits[0].kind).name}, if you ever have a slot. ${stat} is the only thing I have ever been genuinely good at."`
      return `"Somewhere that runs on ${stat}. You have not got one with a space in it, so it is a hypothetical."`
    },
    replies: [
      {
        label: 'Move them there now.',
        note: (c) => {
          const crew = c.crew!
          const fits = c.s.modules.filter(
            (m) => def(m.kind).stat === bestStat(crew) && m.staff.length < staffSlots(m),
          )
          return fits.length ? `Reassign to the ${def(fits[0].kind).name}.` : null
        },
        when: (c) => {
          const crew = c.crew
          if (!crew) return false
          return c.s.modules.some(
            (m) => def(m.kind).stat === bestStat(crew) && m.staff.length < staffSlots(m),
          )
        },
        sets: ['moved'],
        effect: (c) => {
          const crew = c.crew!
          const room = c.s.modules.find(
            (m) => def(m.kind).stat === bestStat(crew) && m.staff.length < staffSlots(m),
          )
          if (!room) return
          for (const m of c.s.modules) m.staff = m.staff.filter((id) => id !== crew.id)
          room.staff.push(crew.id)
          crew.assignment = room.id
          crew.returnTo = null
          crew.morale = Math.min(1, crew.morale + 0.1)
        },
        goto: 'moved',
      },
      { label: 'Noted. Carry on.', goto: null },
    ],
  },

  moved: {
    text: (c) => {
      const where = post(c)
      return where
        ? `"Right now?" They are already picking up their bag. "Right. The ${def(where.kind).name}."`
        : `"Right."`
    },
    replies: [{ label: 'Close', goto: null }],
  },

  praised: {
    text: (c) => {
      const crew = c.crew
      if (!crew) return ''
      if (crew.morale > 0.8) return `"I know." They almost smile.`
      return `"Well. Somebody had to." They take it better than they let on.`
    },
    replies: [
      { label: 'What is actually wrong with this place?', goto: 'wrong' },
      { label: 'Carry on.', goto: null },
    ],
  },
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

registerScript('crew', script)

export default script
