import type { Rng } from './types.ts'

/**
 * Ship names.
 *
 * One pool for everything with a transponder — the station's own hulls and
 * every visitor that ever hails — because a name should feel like it belongs to
 * a ship, not to a category. Spacers name hulls after birds, weather, bad
 * arithmetic and private jokes, and almost never after anything heroic.
 *
 * A hundred of them, and the picker will not hand out one that is already in
 * play, so two Cormorants never sit at the same clamps.
 */
export const HULL_NAMES: string[] = [
  // Birds, which is what half the fleet is called and always has been.
  'Cormorant',
  'Kestrel',
  'Nightjar',
  'Iron Sparrow',
  'Wandering Albatross',
  'Grey Heron',
  'Storm Petrel',
  'Corvid',
  'Shrike',
  'Bittern',
  'Peregrine Fault',
  'Little Egret',

  // Weather and the sky, usually as a complaint.
  'Bad Weather',
  'Cold Start',
  'Sundog',
  'Slow Front',
  'Dry Lightning',
  'Windward',
  'Squall Line',
  'Red Sky Morning',
  'Fogbound',
  'Anticyclone',

  // Odds, money and arithmetic that did not work out.
  'Long Odds',
  'Loose Change',
  'Half Measure',
  'Quiet Margin',
  'Dead Reckoning',
  'Rounding Error',
  'Break Even',
  'Bad Arithmetic',
  'Second Mortgage',
  'Compound Interest',
  'Net Loss',
  'Short Count',
  'Marginal Call',
  'Petty Cash',
  'Overdraft',

  // Time, and how much of it has been wasted.
  'Slow Tuesday',
  'Last Tuesday',
  'Second Wind',
  'Ninth Life',
  'Borrowed Hour',
  'Late Shift',
  'Long Weekend',
  'Eleventh Hour',
  'Old Habit',
  'Meanwhile',
  'Any Day Now',
  'Sooner or Later',

  // Instruments, and the readings nobody liked.
  'Bright Anomaly',
  'Backscatter',
  'Grey Vector',
  'Null Return',
  'Doppler',
  'Signal Floor',
  'Clean Bearing',
  'Off Axis',
  'Dead Band',
  'Parallax',
  'Standing Wave',
  'False Positive',

  // Objects, mostly domestic, mostly ironic.
  'Copper Kettle',
  'Tin Halo',
  'Sunken Bell',
  'Penny Dreadful',
  'Ten of Cups',
  'Salt and Iron',
  'Marigold',
  'Ashgrove',
  'Blue Marlin',
  'Paper Lantern',
  'Brass Monkey',
  'Glass Hammer',
  'Wooden Nickel',
  'Bent Spoon',
  'Empty Bottle',
  'Second-Best Bed',

  // Warnings, promises and things said on the way out of a bar.
  'Fair Warning',
  'Patient Wolf',
  'No Fixed Abode',
  'Nothing Personal',
  'Ask Me Later',
  'Mind the Gap',
  'Not My Problem',
  'Terms and Conditions',
  'Under Protest',
  'Without Prejudice',
  'On Reflection',
  'Pending Review',
  'Subject to Change',
  'As Discussed',
  'Per My Last',

  // Places nobody can point to on a chart.
  'Far Meridian',
  'Low Country',
  'Outer Reach',
  'Threadneedle',
  'Saltmarsh',
  'Coldharbour',
  'Northgate',
  'Fenwick',
  'Blackwater',
  'Greyling',
]

/**
 * A name nothing else is currently using. Falls back to a numbered hull if the
 * pool is somehow exhausted, which needs a hundred ships in play at once.
 */
export const pickHullName = (rng: Rng, taken: Iterable<string>): string => {
  const used = new Set(taken)
  const free = HULL_NAMES.filter((n) => !used.has(n))
  if (free.length === 0) return `Hull ${Math.floor(1000 + rng() * 9000)}`
  return free[Math.floor(rng() * free.length)]
}
