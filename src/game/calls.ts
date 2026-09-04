import type { Mission, MissionCall, Rng } from './types.ts'

/**
 * The hails an away team sends when something happens that is not covered by
 * the contract. Every one of them is a trade: odds against haul, money against
 * risk, or somebody's opinion of the station against all three.
 *
 * They are written per kind of work, because "there is someone alive in here"
 * means something different on a rescue than on a salvage run.
 */
const CALLS: Record<Mission['kind'], MissionCall[]> = {
  salvage: [
    {
      text: 'There is a sealed hold nobody logged. It is not on the manifest we were given, and the manifest was signed by somebody.',
      options: [
        {
          label: 'Open it',
          detail: 'Whatever is in there is worth more than the job.',
          haul: 1.5,
          odds: -0.12,
          strain: 0.4,
          note: 'They cut the seal. What came out of it was worth the trouble, mostly.',
        },
        {
          label: 'Leave it sealed',
          detail: 'Finish the job you were paid for.',
          odds: 0.06,
          note: 'They left the hold alone and finished the manifest.',
        },
        {
          label: 'Log it and report it',
          detail: 'Somebody official will want to know. They will remember who told them.',
          haul: 0.8,
          standing: ['terran', 0.03],
          note: 'They logged the hold and filed it. The Confederation noted who filed it.',
        },
      ],
    },
    {
      text: 'The hull is coming apart faster than the survey said. We can keep cutting or we can stand off.',
      options: [
        {
          label: 'Keep cutting',
          detail: 'More metal, and a worse place to be standing.',
          haul: 1.35,
          odds: -0.18,
          strain: 0.6,
          note: 'They stayed alongside a hull that was folding up. It held. It nearly did not.',
        },
        {
          label: 'Stand off and take what you have',
          detail: 'Half a hold and everybody breathing.',
          haul: 0.7,
          odds: 0.15,
          note: 'They backed out with half a hold and nothing broken.',
        },
      ],
    },
  ],
  survey: [
    {
      text: 'There is a return out here that is not rock. It is holding station, and it has not answered a hail.',
      options: [
        {
          label: 'Close and look',
          detail: 'Nobody has charted this. Somebody should.',
          haul: 1.6,
          odds: -0.2,
          strain: 0.5,
          note: 'They closed on the contact. The data is remarkable and nobody will say what it was.',
        },
        {
          label: 'Log the bearing and go around',
          detail: 'Note where it was and finish the sweep.',
          odds: 0.05,
          note: 'They logged a bearing they did not investigate, which is its own kind of finding.',
        },
      ],
    },
  ],
  rescue: [
    {
      text: 'We have them. We also have a second signal, deeper in, and fuel for one of the two.',
      options: [
        {
          label: 'Go for the second signal',
          detail: 'Both, or neither. There is no third answer out here.',
          odds: -0.25,
          haul: 1.4,
          strain: 0.7,
          standing: ['unlisted', 0.04],
          note: 'They went back in for the second signal. The Drift talks about that sort of thing.',
        },
        {
          label: 'Bring back the one you have',
          detail: 'One is what the fuel allows.',
          odds: 0.12,
          note: 'They came home with one and did not discuss the other.',
        },
        {
          label: 'Buy the fuel margin',
          detail: 'Burn credits on a tender to give them the reach for both.',
          cost: 420,
          odds: -0.05,
          haul: 1.4,
          note: 'The station paid for a tender. Both signals came home.',
        },
      ],
    },
  ],
  patrol: [
    {
      text: 'We have stopped a hull with no serial and a hold full of somebody else’s cargo. They are not armed and they are not arguing.',
      options: [
        {
          label: 'Impound the cargo',
          detail: 'By the book. The Drift will hear about it.',
          haul: 1.5,
          standing: ['unlisted', -0.05],
          note: 'They impounded the hold. The name of this station went round the Drift by evening.',
        },
        {
          label: 'Let them go',
          detail: 'Nothing was stolen from anyone who will miss it.',
          standing: ['unlisted', 0.05],
          haul: 0.75,
          note: 'They let an unlisted hull go, and the Drift remembers that too.',
        },
        {
          label: 'Take a cut and say nothing',
          detail: 'Everybody walks away better off, and one of them is you.',
          haul: 1.3,
          standing: ['terran', -0.05],
          odds: -0.08,
          note: 'A quiet arrangement was reached. The Confederation has not heard about it yet.',
        },
      ],
    },
  ],
  tow: [
    {
      text: 'The hull we are towing has someone aboard. They did not mention that when they filed the wreck.',
      options: [
        {
          label: 'Take them aboard',
          detail: 'Whoever they are, they come home with the hull.',
          odds: -0.08,
          strain: 0.3,
          standing: ['unlisted', 0.04],
          note: 'They brought the stowaway in with the tow rather than leaving the question open.',
        },
        {
          label: 'Cut the tow and report it',
          detail: 'Not your wreck, not your problem, and now not your hull either.',
          haul: 0.4,
          odds: 0.1,
          standing: ['terran', 0.02],
          note: 'They cut the tow and filed it properly. The wreck is somebody else’s now.',
        },
      ],
    },
  ],
}

/**
 * Hails only a far team ever sends.
 *
 * Out past the comms envelope a decision is not a question, it is a report that
 * arrives late enough that the answer no longer matters — so these read as
 * things already half in motion. They are the only content in the game the
 * Deep Space Operations room unlocks, and they exist because far work was
 * otherwise the same job with a bigger number on it.
 */
const FAR_CALLS: MissionCall[] = [
  {
    text: 'Relayed eleven hours late, and badly: there is a beacon out here transmitting a hull number that was struck off the register before any of us were born. It has not stopped since we arrived.',
    options: [
      {
        label: 'Take the bearing and go',
        detail: 'Whatever that is, it is somebody else’s to explain.',
        odds: 0.08,
        note: 'They logged the bearing, did not investigate, and left. The transmission was still going when they lost it.',
      },
      {
        label: 'Go and look',
        detail: 'Nobody has been out that far to check. That is rather the point.',
        haul: 1.4,
        odds: -0.15,
        strain: 0.5,
        note: 'They went and looked. The report is four words long and one of them is crossed out.',
      },
    ],
  },
  {
    text: 'We are outside the envelope, so this is not a question, it is a notification. We have found somebody else’s survey markers on our claim. They are recent.',
    options: [
      {
        label: 'Work around them',
        detail: 'Whoever put them there is still out here somewhere.',
        odds: 0.05,
        note: 'They worked around the markers and did not meet whoever left them.',
      },
      {
        label: 'Pull them up',
        detail: 'A claim nobody defends is not a claim.',
        haul: 1.3,
        odds: -0.1,
        standing: ['unlisted', -0.03],
        note: 'They pulled the markers and brought two home. Somebody will notice.',
      },
    ],
  },
  {
    text: 'Nobody has spoken to a station in nine days and it is starting to tell. Two of the team want to turn for home now while the sums still work.',
    options: [
      {
        label: 'Let them turn for home',
        detail: 'A team that has had enough is a team that makes mistakes.',
        haul: 0.7,
        odds: 0.16,
        note: 'They cut it short and came home with less. Everybody came home.',
      },
      {
        label: 'Hold them out there',
        detail: 'They signed for the far rate. This is what the far rate is.',
        haul: 1.45,
        odds: -0.14,
        strain: 0.6,
        note: 'They stayed. The report is professional and there is nothing personal in it at all.',
      },
    ],
  },
]

/** A hail for this job, or null if its kind has nothing to say. */
export const rollCall = (rng: Rng, m: Mission): MissionCall | null => {
  // Far work has its own troubles, and mostly they are the only ones it has.
  const pool = m.far && rng() < 0.75 ? FAR_CALLS : CALLS[m.kind]
  if (!pool || pool.length === 0) return null
  return pool[Math.floor(rng() * pool.length)]
}

/**
 * What an away team decides when nobody at the station is holding their
 * channel. They pick the cautious answer, because they are the ones out there.
 */
export const unattended = (call: MissionCall): number => {
  let best = 0
  for (let i = 1; i < call.options.length; i += 1) {
    if ((call.options[i].odds ?? 0) > (call.options[best].odds ?? 0)) best = i
  }
  return best
}
