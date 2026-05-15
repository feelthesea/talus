/**
 * Talus Prediction Engine — Three-Layer Race Time Estimator
 *
 * Layer 1: Aerobic baseline (Z2 efficiency + ITRA calibration)
 * Layer 2: Course cost (Minetti + Tc + Altitude decay + Eccentric load penalty)
 * Layer 3: Temporal decay (exponential neuromuscular fatigue + nocturnal penalty)
 */

import type { ITRAProfile, ITRARace } from './itra'

// ─────────────────────────────────────────────
// Input types
// ─────────────────────────────────────────────

export interface AthleteBaseline {
  lthr: number
  maxhr: number
  rhr: number
  weight: number
  vam: number                  // declared VAM ceiling (m/h)
  measuredVAM?: number         // from Onboarding diagnostics
  decoupleOnset: number        // hours
  decouplePercent: number      // % efficiency loss in second half
  z2HoursStable: number        // hours athlete can hold Z2 without drift
  itraProfile?: ITRAProfile
  stravaMonthlyKm: number
}

export interface CourseSegment {
  name: string
  distKm: number
  gainM: number
  lossM: number
  avgAltitudeM: number         // average altitude of segment
  maxAltitudeM: number
  tc: number                   // terrain technicality coefficient (1.0–2.0)
  gradientBuckets: GradientBucket[]
}

export interface GradientBucket {
  gradientPct: number          // representative gradient for this bucket
  distKm: number               // distance in this gradient bucket
}

export interface PredictionInput {
  athlete: AthleteBaseline
  segments: CourseSegment[]
  raceStartHour: number        // 0–23, for nocturnal penalty calculation
}

// ─────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────

export interface SegmentPrediction {
  segment: CourseSegment
  baseMinetti: number          // raw Minetti cost (minutes)
  altitudeDecay: number        // multiplier ≤1.0
  tcAdjusted: number           // after Tc
  eccentricPenalty: number     // multiplier ≤1.0
  layer3Multiplier: number     // fatigue decay at this point in race
  nocturnalPenalty: number     // 1.0 or 1.05–1.08
  finalMinutes: number         // predicted segment time
  cumMinutes: number           // cumulative race time at end of segment
}

export interface PredictionResult {
  segments: SegmentPrediction[]
  totalMinutes: number
  rangeMinutes: [number, number]  // [optimistic, conservative] ±confidence
  confidence: 'high' | 'medium' | 'low'
  itraCalibrated: boolean
  itraSimilarRaces: ITRARace[]
  calibrationFactor: number    // 1.0 = no adjustment, >1 = slower than raw model
  debugLayers: {
    layer1BaseEfficiency: number
    layer2TotalCost: number
    layer3AvgDecay: number
  }
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

// Minetti (2002) metabolic cost table (J/kg/m) by gradient
// We model energy cost as a function of gradient and convert to pace
const MINETTI_COEFFICIENTS = {
  // gradient → metabolic cost multiplier vs flat running
  // derived from Minetti et al. 2002 J Appl Physiol
  '-0.30': 2.0,  // extreme downhill — high eccentric load
  '-0.20': 1.5,
  '-0.10': 1.1,
  '-0.05': 0.95,
   '0.00': 1.0,  // flat
   '0.05': 1.25,
   '0.10': 1.6,
   '0.15': 2.1,
   '0.20': 2.8,
   '0.25': 3.7,
   '0.30': 4.8,
} as const

// Altitude decay: ~0.3% power loss per 100m above 1500m
const ALTITUDE_DECAY_RATE = 0.003   // per 100m above threshold
const ALTITUDE_THRESHOLD_M = 1500

// Eccentric load: cumulative descent thresholds
const ECCENTRIC_ONSET_M = 1500      // descent before penalty starts
const ECCENTRIC_RATE = 0.0001       // % penalty per meter of descent beyond onset

// Nocturnal window: 23:00–05:00
const NOCTURNAL_PENALTY = 1.06      // 6% pace penalty during night hours
const NOCTURNAL_START = 23
const NOCTURNAL_END = 5

// ─────────────────────────────────────────────
// Layer 1: Aerobic baseline efficiency
// ─────────────────────────────────────────────

function computeLayer1Efficiency(athlete: AthleteBaseline): number {
  // Base: equivalent flat pace (min/km) from Z2 efficiency
  // Athletes who can hold Z2 for longer without drift are more efficient
  const z2StabilityBonus = Math.min(athlete.z2HoursStable / 6, 1.0)  // capped at 6h

  // Rough equiv flat pace from VAM and LTHR
  // A runner with VAM 900 m/h and LTHR 168 at ~60kg has roughly 7-8 min/km equiv flat
  const vatFactor = 900 / Math.max(athlete.vam, 400)  // relative to reference VAM
  const basePaceMinKm = 7.5 * vatFactor * (1 - z2StabilityBonus * 0.1)

  return basePaceMinKm
}

function calibrateWithITRA(
  basePace: number,
  athlete: AthleteBaseline,
  targetDistKm: number,
  targetGainM: number
): { calibratedPace: number; factor: number; similarRaces: ITRARace[] } {
  const profile = athlete.itraProfile
  if (!profile || profile.races.length === 0) {
    return { calibratedPace: basePace, factor: 1.0, similarRaces: [] }
  }

  const similar = profile.similarRaces.length > 0
    ? profile.similarRaces
    : profile.bestPerformances.slice(0, 3)

  if (similar.length === 0 || profile.avgPacePerKmEquiv === 0) {
    return { calibratedPace: basePace, factor: 1.0, similarRaces: [] }
  }

  // ITRA-derived equivalent flat pace (weighted toward recent races)
  const itraPace = profile.avgPacePerKmEquiv

  // Blend: 60% ITRA historical, 40% model (more weight to real data)
  const blendedPace = itraPace * 0.6 + basePace * 0.4
  const factor = blendedPace / basePace

  return { calibratedPace: blendedPace, factor, similarRaces: similar }
}

// ─────────────────────────────────────────────
// Layer 2: Course cost
// ─────────────────────────────────────────────

function minettiMultiplier(gradientPct: number): number {
  // Interpolate between Minetti table values
  const keys = Object.keys(MINETTI_COEFFICIENTS)
    .map(Number)
    .sort((a, b) => a - b)
  const g = gradientPct / 100  // convert % to fraction

  if (g <= keys[0]) return MINETTI_COEFFICIENTS['-0.30']
  if (g >= keys[keys.length - 1]) return MINETTI_COEFFICIENTS['0.30']

  for (let i = 0; i < keys.length - 1; i++) {
    if (g >= keys[i] && g <= keys[i + 1]) {
      const t = (g - keys[i]) / (keys[i + 1] - keys[i])
      const v0 = MINETTI_COEFFICIENTS[String(keys[i]) as keyof typeof MINETTI_COEFFICIENTS] ?? 1.0
      const v1 = MINETTI_COEFFICIENTS[String(keys[i + 1]) as keyof typeof MINETTI_COEFFICIENTS] ?? 1.0
      return v0 + t * (v1 - v0)
    }
  }
  return 1.0
}

function computeSegmentMinettiCost(segment: CourseSegment, basePaceMinKm: number): number {
  if (segment.gradientBuckets.length === 0) {
    // Fallback: use average gradient
    const avgGradient = segment.distKm > 0
      ? (segment.gainM - segment.lossM) / (segment.distKm * 1000) * 100
      : 0
    const mult = minettiMultiplier(avgGradient)
    return segment.distKm * basePaceMinKm * mult
  }

  // Sum cost across gradient buckets
  return segment.gradientBuckets.reduce((total, bucket) => {
    const mult = minettiMultiplier(bucket.gradientPct)
    return total + bucket.distKm * basePaceMinKm * mult
  }, 0)
}

function altitudeDecayMultiplier(altitudeM: number): number {
  if (altitudeM <= ALTITUDE_THRESHOLD_M) return 1.0
  const decay = ALTITUDE_DECAY_RATE * (altitudeM - ALTITUDE_THRESHOLD_M) / 100
  return Math.max(1.0 - decay, 0.85)  // floor at 15% decay (extreme altitude)
}

function eccentricPenaltyMultiplier(cumulativeDescentM: number): number {
  if (cumulativeDescentM <= ECCENTRIC_ONSET_M) return 1.0
  const excessDescent = cumulativeDescentM - ECCENTRIC_ONSET_M
  const penalty = excessDescent * ECCENTRIC_RATE
  return Math.min(1.0 + penalty, 1.35)  // cap at 35% penalty
}

// ─────────────────────────────────────────────
// Layer 3: Temporal decay
// ─────────────────────────────────────────────

function exponentialFatigueMultiplier(
  cumHours: number,
  decoupleOnset: number,
  decouplePercent: number
): number {
  if (cumHours <= decoupleOnset) return 1.0

  // λ derived from athlete's measured decouple rate
  // More drift → steeper exponential
  const lambda = Math.log(1 + decouplePercent / 100) / 2  // half-life of 2h post onset
  const hoursPostOnset = cumHours - decoupleOnset
  const penalty = Math.exp(lambda * hoursPostOnset) - 1

  return Math.min(1.0 + penalty, 1.5)  // cap at 50% slowdown
}

function nocturnalPenaltyMultiplier(
  raceStartHour: number,
  cumMinutes: number
): number {
  const currentHour = (raceStartHour + Math.floor(cumMinutes / 60)) % 24
  const isNocturnal = currentHour >= NOCTURNAL_START || currentHour < NOCTURNAL_END
  return isNocturnal ? NOCTURNAL_PENALTY : 1.0
}

// ─────────────────────────────────────────────
// Main prediction function
// ─────────────────────────────────────────────

export function predictRaceTime(input: PredictionInput): PredictionResult {
  const { athlete, segments, raceStartHour } = input
  const totalDistKm = segments.reduce((s, seg) => s + seg.distKm, 0)
  const totalGainM = segments.reduce((s, seg) => s + seg.gainM, 0)

  // Layer 1
  const baseEfficiency = computeLayer1Efficiency(athlete)
  const { calibratedPace, factor, similarRaces } = calibrateWithITRA(
    baseEfficiency, athlete, totalDistKm, totalGainM
  )
  const itraCalibrated = factor !== 1.0

  // Run through segments
  const segmentPredictions: SegmentPrediction[] = []
  let cumMinutes = 0
  let cumDescentM = 0
  let totalLayer2Cost = 0
  let totalLayer3Effect = 0

  for (const seg of segments) {
    // Layer 2
    const baseMinetti = computeSegmentMinettiCost(seg, calibratedPace)
    const altDecay = altitudeDecayMultiplier(seg.avgAltitudeM)
    const tcAdjusted = baseMinetti * seg.tc * altDecay

    cumDescentM += seg.lossM
    const eccPenalty = eccentricPenaltyMultiplier(cumDescentM)

    // Layer 3 (at midpoint of segment)
    const midCumMinutes = cumMinutes + tcAdjusted * eccPenalty / 2
    const midCumHours = midCumMinutes / 60
    const fatigueMult = exponentialFatigueMultiplier(
      midCumHours,
      athlete.decoupleOnset,
      athlete.decouplePercent
    )
    const nocturnalMult = nocturnalPenaltyMultiplier(raceStartHour, midCumMinutes)

    const finalMinutes = tcAdjusted * eccPenalty * fatigueMult * nocturnalMult
    cumMinutes += finalMinutes

    totalLayer2Cost += tcAdjusted
    totalLayer3Effect += fatigueMult * nocturnalMult

    segmentPredictions.push({
      segment: seg,
      baseMinetti,
      altitudeDecay: altDecay,
      tcAdjusted,
      eccentricPenalty: eccPenalty,
      layer3Multiplier: fatigueMult,
      nocturnalPenalty: nocturnalMult,
      finalMinutes,
      cumMinutes,
    })
  }

  const totalMinutes = Math.round(cumMinutes)
  const avgLayer3 = totalLayer3Effect / segments.length

  // Confidence: high if ITRA calibrated + measured VAM, low if estimates only
  const confidence: 'high' | 'medium' | 'low' =
    itraCalibrated && athlete.measuredVAM ? 'high' :
    itraCalibrated || athlete.measuredVAM ? 'medium' : 'low'

  // Range: ±5% high, ±12% low, ±8% medium
  const spread = confidence === 'high' ? 0.05 : confidence === 'medium' ? 0.08 : 0.12
  const rangeMinutes: [number, number] = [
    Math.round(totalMinutes * (1 - spread)),
    Math.round(totalMinutes * (1 + spread)),
  ]

  return {
    segments: segmentPredictions,
    totalMinutes,
    rangeMinutes,
    confidence,
    itraCalibrated,
    itraSimilarRaces: similarRaces,
    calibrationFactor: factor,
    debugLayers: {
      layer1BaseEfficiency: calibratedPace,
      layer2TotalCost: totalLayer2Cost,
      layer3AvgDecay: avgLayer3,
    },
  }
}

// ─────────────────────────────────────────────
// Utility: format minutes → "22h14"
// ─────────────────────────────────────────────

export function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}h${String(m).padStart(2, '0')}`
}
