import { ARMED_ENOUGH, defence, derive, shift } from '../engine.ts'
import { factionDef } from '../factions.ts'
import { shipDef } from '../fleet.ts'
import { scanReading, visitorDef } from '../visitors.ts'
import { registerScript, type TalkCtx, type TalkScript } from '../talk.ts'

/**
 * Talking to the master of a hull at your clamps.
 *
 * A ship is not a vending machine. Some of them want to talk, some want to
 * complain, and some are only alongside to find out what you have. What you
 * say here moves their power's opinion of the station, which is the only thing
 * that follows you from one hull to the next.
 */

const teeth = (c: TalkCtx): string => {
  const d = defence(c.s)
  const total = d.guns + d.shield * 0.5
  if (total <= 0) return 'nothing pointed at anyone'
  if (total < 8) return 'a battery that is mostly for show'
  if (total < 20) return 'enough to make a raider pick a different station'
  return 'more guns than a station this size has any business with'
}

const honest = (c: TalkCtx): boolean => c.ship?.kind === c.ship?.claim

const script: TalkScript = {
  start: {
    text: (c) => {
      const v = c.ship
      if (!v) return ''
      const claim = visitorDef(v.claim)
      if (v.status !== 'docked')
        return `"${v.name}, ${claim.label.toLowerCase()}, asking for a berth. Scan reads ${scanReading(v.suspicion).toLowerCase()}, if you were wondering — I know you have one."`
      return `"Commander. ${claim.hail}"`
    },
    beat: (c) => {
      const v = c.ship
      if (!v) return null
      return `${shipDef(v.cls).name} · ${factionDef(v.faction).short} · ${scanReading(v.suspicion)}`
    },
    replies: [
      { label: 'What is the news out there?', goto: 'news' },
      { label: 'What do you make of this place?', goto: 'opinion' },
      {
        label: 'Ask what they are really carrying.',
        note: () => 'Direct. They will either respect it or resent it.',
        when: (c) => !c.has('pressed') && c.ship?.status === 'docked',
        sets: ['pressed'],
        goto: 'pressed',
      },
      {
        label: 'Make it clear whose station this is.',
        note: () => 'Lean on them. Cheap if you have the guns, expensive if you do not.',
        when: (c) => !c.has('leaned'),
        sets: ['leaned'],
        effect: (c) => {
          const v = c.ship
          if (!v) return
          const d = defence(c.s)
          const backed = d.guns + d.shield * 0.5 >= ARMED_ENOUGH
          // Talking hard with nothing behind it is how a station gets a name.
          shift(c.s, v.faction, backed ? -0.01 : -0.05)
        },
        goto: 'leaned',
      },
      { label: 'Let them get on with it.', goto: null },
    ],
  },

  news: {
    text: (c) => {
      const v = c.ship
      if (!v) return ''
      const theirs = factionDef(v.faction)
      const patron = c.s.patron ? factionDef(c.s.patron) : null
      if (patron && patron.id === v.faction)
        return `"Same as your news, presumably. ${theirs.short} traffic is up, ${theirs.short} patience is not." They shrug. "Nothing that reaches a post like this."`
      if (v.kind === 'raider' || v.kind === 'smuggler')
        return `"Out where I work, news is a thing you sell." A pause. "But everyone is talking about hulls going quiet on clean bearings, and nobody is saying it loudly."`
      return `"Lanes are busy. ${theirs.short} are throwing their weight around a little more than last year, and everybody is pretending not to notice."`
    },
    replies: [
      { label: 'What do you make of this place?', goto: 'opinion' },
      { label: 'Let them get on with it.', goto: null },
    ],
  },

  opinion: {
    text: (c) => {
      const d = derive(c.s)
      const rooms = c.s.modules.length
      if (d.crewAlive.length === 0) return `"Honestly? I thought it was a wreck until you answered."`
      if (rooms < 8)
        return `"It is small and it is lit, which puts it ahead of most." They look down the spine. "Ask me again in a year."`
      if (d.foodRate < 0 || d.airRate < 0)
        return `"Your people look tired and your air smells like it is being asked to do too much. I would not say that to a stranger, so take it as a favour."`
      return `"You have got ${teeth(c)}, a full roster and the lights on. That is three more than most of the places I put in at."`
    },
    replies: [
      {
        label: 'Ask them to say so, out there.',
        note: () => 'Word of mouth is the only advertising a station like this gets.',
        when: (c) => !c.has('asked-word') && derive(c.s).crewAlive.length > 0,
        sets: ['asked-word'],
        effect: (c) => {
          const v = c.ship
          if (!v) return
          // Only worth anything if the place is actually worth talking about.
          const d = derive(c.s)
          const good = c.s.modules.length >= 8 && d.foodRate >= 0 && d.airRate >= 0
          shift(c.s, v.faction, good ? 0.03 : -0.01)
        },
        goto: 'word',
      },
      { label: 'Let them get on with it.', goto: null },
    ],
  },

  word: {
    text: (c) => {
      const d = derive(c.s)
      const good = c.s.modules.length >= 8 && d.foodRate >= 0 && d.airRate >= 0
      return good
        ? `"I will mention it. That is not nothing — I put in at forty stations a year and I mention about four."`
        : `"I could." They look around again. "I would rather not have to explain why, though."`
    },
    replies: [{ label: 'Close', goto: null }],
  },

  pressed: {
    text: (c) => {
      const v = c.ship
      if (!v) return ''
      if (honest(c))
        return `"Exactly what the manifest says." They are not offended. "You should ask. Most do not, and then they wonder."`
      return `"That is a question with a wrong answer in it." A long pause. "Cargo. Bound onward. Let us both leave it there."`
    },
    beat: (c) => (honest(c) ? 'They are telling the truth.' : 'They are not, and they know you know.'),
    replies: [
      {
        label: 'Let it go.',
        effect: (c) => {
          const v = c.ship
          if (!v || honest(c)) return
          // Letting a dirty hull alone is worth something to the people who fly them.
          shift(c.s, 'unlisted', 0.03)
        },
        goto: null,
      },
      {
        label: 'Tell them to undock.',
        note: () => 'Send them away over it.',
        when: (c) => !honest(c),
        effect: (c) => {
          const v = c.ship
          if (!v) return
          v.status = 'requesting'
          v.timer = 0
          shift(c.s, 'unlisted', -0.04)
          shift(c.s, 'terran', 0.02)
        },
        goto: 'sent-off',
      },
    ],
  },

  'sent-off': {
    final: true,
    text: () => `"Your station." They are already walking. "For now."`,
    replies: [{ label: 'Close', goto: null }],
  },

  leaned: {
    text: (c) => {
      const d = defence(c.s)
      if (d.guns + d.shield * 0.5 >= ARMED_ENOUGH)
        return `They look at the hardpoints, then back at you. "Understood, commander. No argument."`
      return `They let the silence run a moment too long. "Of course." It is not agreement. It is filing.`
    },
    replies: [{ label: 'Close', goto: null }],
  },
}

registerScript('captain', script)

export default script
