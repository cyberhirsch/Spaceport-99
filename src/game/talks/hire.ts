import {
  SIGN_THRESHOLD,
  appeal,
  bonusOffer,
  def,
  derive,
  holdOut,
  recruiterSkill,
  staffSlots,
} from '../engine.ts'
import { STAT_KEYS, type Prospect, type StatKey } from '../types.ts'
import { registerScript, type TalkCtx, type TalkScript } from '../talk.ts'

/**
 * Talking somebody into signing on.
 *
 * The old version was three buttons and a number. This one makes you find out
 * what the person in front of you actually wants before you spend anything on
 * them, because everybody wants a different thing and the wrong offer is worse
 * than no offer at all.
 *
 * Interest is still the hidden number underneath. What has changed is that you
 * can no longer see it, and the moves that move it are things you say.
 */

/** What it would take. Everyone has exactly one of these. */
export type Want = 'money' | 'post' | 'belief' | 'escape'

const WANT_TELL: Record<Want, string> = {
  money: 'They keep bringing the conversation back to numbers.',
  post: 'They keep looking past you, at the rooms.',
  belief: 'They are not asking what you pay. They are asking what this is.',
  escape: 'They keep glancing at the gangway they came down.',
}

/**
 * What this person wants, fixed for as long as they exist. Derived rather than
 * stored so it survives an old save, and weighted by their situation: somebody
 * still signed to a hull is usually looking for a reason to leave it, and
 * somebody expensive usually wants to be told they are needed.
 */
export const wantOf = (p: Prospect & { seed: number; captain?: boolean }): Want => {
  const grip = p.grip ?? 0
  if (grip > 0 && grip < 0.35 && p.seed % 3 !== 0) return 'escape'
  if (p.captain) return 'belief'
  const roll = (p.seed >> 3) % 100
  // Somebody who put in for the berth came for a reason and wants it
  // confirmed. Nobody posted here reaches this script at all: they are crew
  // before the conversation starts, and get welcomed rather than sold to.
  if (p.origin === 'applied') return roll < 30 ? 'post' : 'belief'
  if (p.tier > 0.6) return roll < 55 ? 'belief' : 'post'
  if (roll < 38) return 'money'
  if (roll < 72) return 'post'
  return 'belief'
}

/** Their strongest stat, which is the posting they would take. */
export const bestStat = (p: Prospect): StatKey =>
  STAT_KEYS.reduce((best, k) => (p.stats[k] > p.stats[best] ? k : best), STAT_KEYS[0])

const worstStat = (p: Prospect): StatKey =>
  STAT_KEYS.reduce((worst, k) => (p.stats[k] < p.stats[worst] ? k : worst), STAT_KEYS[0])

/** Rooms with a free slot that run on a given stat. */
const postsFor = (c: TalkCtx, stat: StatKey) =>
  c.s.modules.filter((m) => def(m.kind).stat === stat && m.staff.length < staffSlots(m))

/** Nudge interest, and remember that this move has been spent. */
const move = (c: TalkCtx, delta: number): void => {
  const p = c.prospect
  if (!p) return
  p.interest = Math.round(Math.max(0, Math.min(SIGN_THRESHOLD, p.interest + delta)))
}

/** A move lands hard when it is the thing they came for, and badly when it is not. */
const weigh = (c: TalkCtx, kind: Want, base: number): number => {
  const p = c.prospect
  if (!p) return 0
  const want = wantOf(p as Prospect & { seed: number })
  if (want === kind) return Math.round(base * 1.6)
  // Offering money to somebody who wanted to be believed in is an insult, and
  // the more senior they are the more of one. It does not scale with how
  // movable they are — being insulted is not a negotiation.
  if (kind === 'money' && (want === 'belief' || want === 'escape')) {
    return -Math.round(8 + p.tier * 22)
  }
  return Math.round(base * 0.55)
}

/** Each thing you can say lands once. */
const spent = (c: TalkCtx, flag: string) => c.has(flag)

const theyAre = (c: TalkCtx): string => {
  if (c.guest?.captain) return `master of the ${c.ship?.name ?? 'ship'}`
  if (c.guest) return `${c.guest.role} off the ${c.ship?.name ?? 'ship'}`
  if (c.candidate?.origin === 'applied') return 'put in for this posting'
  if (c.candidate?.origin === 'walkIn') return 'off a hull at the Trading Hub'
  return 'posted here by HQ'
}

const script: TalkScript = {
  start: {
    text: (c) => {
      if (!c.prospect) return 'They have gone.'
      if (c.guest?.captain) {
        return `"You wanted a word with me, not my crew. That is either flattering or a problem." They do not sit down.`
      }
      if (c.candidate?.origin === 'applied') {
        return `"${c.name}. I put in for this posting twice before anybody answered." They sit down without being asked. "So I would like to hear it is worth the wait."`
      }
      if (c.candidate?.origin === 'walkIn') {
        return `"I came in on somebody else's hull this morning and I have not gone back aboard." They are looking past you at the rooms already.`
      }
      if (c.candidate) {
        return `"${c.name}. HQ put me on a courier eleven days ago and did not say much else about the posting." They wait, and do not sit down.`
      }
      return `"I have got about ten minutes before they want me back at the ship."`
    },
    beat: (c) => (c.prospect ? `${c.name} — ${theyAre(c)}.` : null),
    replies: [
      {
        label: 'What brought you out this far?',
        when: (c) => !spent(c, 'asked-why'),
        sets: ['asked-why'],
        goto: 'why',
      },
      {
        label: 'What would it take to keep you here?',
        when: (c) => spent(c, 'asked-why') && !spent(c, 'asked-what'),
        sets: ['asked-what'],
        goto: 'what',
      },
      {
        label: 'Ask them straight what they want.',
        note: () => 'Blunt. Cheap if they respect it, costly if they do not.',
        when: (c) => !spent(c, 'asked-what') && !spent(c, 'asked-blunt'),
        sets: ['asked-blunt', 'asked-what'],
        effect: (c) => {
          const p = c.prospect
          if (!p) return
          // Bluntness plays with a spacer and badly with somebody senior.
          move(c, p.tier > 0.55 ? -8 : 6)
        },
        goto: 'what',
      },
      { label: 'Make them an offer.', goto: 'offers' },
      { label: "I'll let you get on.", goto: null },
    ],
  },

  why: {
    text: (c) => {
      const p = c.prospect
      if (!p) return ''
      if (p.origin === 'applied') {
        return `"I read the filings on this place before I put in for it." They are watching you carefully. "Most stations out here are somebody's write-off. I did not think this one read like that."`
      }
      switch (wantOf(p as Prospect & { seed: number })) {
        case 'money':
          return `"Same reason as everyone. The rates out here are better and there is nothing to spend it on, so it stacks up."`
        case 'post':
          return `"I trained for a job I have not been allowed to do in four years. That is what brought me out this far."`
        case 'escape':
          return `"Honestly? The ship." They stop, and decide to leave it there.`
        default:
          return `"I wanted to see whether anybody was building anything. Mostly they are not."`
      }
    },
    beat: (c) => (c.prospect ? WANT_TELL[wantOf(c.prospect as Prospect & { seed: number })] : null),
    replies: [
      {
        label: 'And what would it take to keep you here?',
        when: (c) => !spent(c, 'asked-what'),
        sets: ['asked-what'],
        goto: 'what',
      },
      { label: 'Make them an offer.', goto: 'offers' },
      { label: "I'll let you get on.", goto: null },
    ],
  },

  what: {
    text: (c) => {
      const p = c.prospect
      if (!p) return ''
      const want = wantOf(p as Prospect & { seed: number })
      if (spent(c, 'asked-why')) {
        // Having listened first, they say it plainly.
        switch (want) {
          case 'money':
            return `"${p.askingBonus} up front. I am not going to pretend it is about anything else."`
          case 'post':
            return `"Put me somewhere I am actually the best person for. I will know if you have."`
          case 'escape':
            return `"Get me off that hull before it undocks and I will not ask you for anything else."`
          default:
            return `"Tell me what this station is for. If the answer is 'it turns a profit', I will finish my drink and go."`
        }
      }
      // Asked cold, they answer cold.
      return `"You are asking me that before you have asked me anything else." They shrug. "Money, a job, or a reason. Pick one."`
    },
    beat: (c) =>
      c.prospect && spent(c, 'asked-why')
        ? 'They have told you. Now it is a question of whether you can deliver it.'
        : 'You have not given them a reason to be straight with you.',
    replies: [
      { label: 'Make them an offer.', goto: 'offers' },
      { label: "I'll let you get on.", goto: null },
    ],
  },

  offers: {
    text: (c) =>
      spent(c, 'said-money') || spent(c, 'said-post') || spent(c, 'said-place')
        ? `"Go on, then."`
        : `"So make it worth the walk."`,
    beat: (c) => {
      if (!c.prospect) return null
      const said = ['said-money', 'said-post', 'said-place', 'said-need'].filter((f) => c.has(f))
      return said.length ? `You have said your piece ${said.length} of 4 ways.` : null
    },
    replies: [
      {
        label: (c) => `Offer ${bonusOffer(c.s, c.prospect!)}c up front.`,
        note: (c) => {
          const p = c.prospect!
          const can = bonusOffer(c.s, p)
          if (can <= 0) return 'Nothing in the account.'
          return can < p.askingBonus
            ? `They asked for ${p.askingBonus}c. This is short.`
            : 'The full figure.'
        },
        when: (c) => !spent(c, 'said-money'),
        barred: (c) => (bonusOffer(c.s, c.prospect!) <= 0 ? 'Nothing in the account' : null),
        sets: ['said-money'],
        effect: (c) => {
          const p = c.prospect!
          const paid = bonusOffer(c.s, p)
          c.s.credits -= paid
          const base = 35 * (paid / Math.max(1, p.askingBonus)) * holdOut(p)
          move(c, weigh(c, 'money', base))
        },
        goto: 'reaction',
      },
      {
        label: (c) => {
          const stat = bestStat(c.prospect!)
          const post = postsFor(c, stat)[0]
          return post ? `Offer them the ${def(post.kind).name}.` : 'Offer them a posting.'
        },
        note: (c) => {
          const stat = bestStat(c.prospect!)
          const post = postsFor(c, stat)[0]
          return post
            ? `Their best is ${stat}. That room runs on it.`
            : 'Nothing free that suits them — it would have to be somewhere else.'
        },
        when: (c) => !spent(c, 'said-post'),
        barred: (c) =>
          c.s.modules.some((m) => m.staff.length < staffSlots(m) && staffSlots(m) > 0)
            ? null
            : 'Every room is full',
        sets: ['said-post'],
        effect: (c) => {
          const p = c.prospect!
          const stat = bestStat(c.prospect!)
          const fits = postsFor(c, stat)[0]
          const any = c.s.modules.find((m) => m.staff.length < staffSlots(m) && staffSlots(m) > 0)
          const room = fits ?? any
          if (!room) return
          p.promised = room.id
          const roomStat = def(room.kind).stat
          const base =
            roomStat === stat ? 40 * holdOut(p) : roomStat === worstStat(p) ? -15 : 12 * holdOut(p)
          move(c, weigh(c, 'post', base))
        },
        goto: 'reaction',
      },
      {
        label: 'Tell them what the station is.',
        note: () => 'Worth what the place is actually worth — and it is being looked at.',
        when: (c) => !spent(c, 'said-place'),
        sets: ['said-place'],
        effect: (c) => {
          const p = c.prospect!
          const standards = 30 + p.tier * 45
          const base = Math.max(
            5,
            Math.min(45, 18 + (appeal(c.s) * 100 - standards) * 0.5 + recruiterSkill(c.s) * 4),
          )
          move(c, weigh(c, 'belief', base))
        },
        goto: 'reaction',
      },
      {
        label: 'Tell them you need them.',
        note: () => 'No money, no promises. Only true if it is true.',
        when: (c) => !spent(c, 'said-need'),
        sets: ['said-need'],
        effect: (c) => {
          const p = c.prospect!
          // This works on somebody looking for a way off a ship, and on nobody
          // else, because everyone else has heard it before.
          const want = wantOf(p as Prospect & { seed: number })
          move(c, want === 'escape' ? Math.round(38 * holdOut(p)) : want === 'belief' ? 10 : -4)
        },
        goto: 'reaction',
      },
      {
        label: 'Put it to them.',
        note: (c) =>
          c.has('said-money') || c.has('said-post') || c.has('said-place') || c.has('said-need')
            ? 'Ask for an answer. There is no taking it back.'
            : 'You have offered them nothing. They will notice.',
        goto: 'ask',
      },
      { label: 'Leave it there.', goto: null },
    ],
  },

  reaction: {
    text: (c) => {
      const p = c.prospect
      if (!p) return ''
      // They react to where they have got to, not to what you just said, so
      // reading them is a matter of watching the whole conversation.
      if (p.interest >= 75) return `"All right." They are already thinking about where to put their bag.`
      if (p.interest >= 45) return `"That is not nothing." They turn it over.`
      if (p.interest >= 20) return `"Hm." Whatever that was, it did not land the way you wanted.`
      return `"I do not think you have understood me at all."`
    },
    replies: [
      { label: 'Keep going.', goto: 'offers' },
      {
        label: 'Put it to them.',
        goto: 'ask',
      },
      { label: 'Leave it there.', goto: null },
    ],
  },

  ask: {
    text: () => `"So. Am I signing, or am I walking back up that gangway?"`,
    beat: () => 'Whatever they say, the asking is over.',
    sticky: true,
    replies: [
      {
        label: 'Ask for their answer.',
        barred: (c) => {
          const d = derive(c.s)
          return d.crewAlive.length >= d.crewCap ? 'No bunk free — build Crew Quarters' : null
        },
        goto: 'done',
      },
      {
        label: 'Actually — one more thing.',
        when: (c) =>
          !c.has('said-money') || !c.has('said-post') || !c.has('said-place') || !c.has('said-need'),
        goto: 'offers',
      },
    ],
  },

  // The engine resolves the sign the moment this node is reached; the result
  // is written into the flags so the line can read it back.
  done: {
    final: true,
    text: (c) =>
      c.has('signed')
        ? `"Then I had better find out where I am sleeping."`
        : `"No. Thank you for asking properly, though. Most do not."`,
    replies: [{ label: 'Close', goto: null }],
  },
}

registerScript('hire', script)

export default script
