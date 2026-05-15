import type { StravaActivity, StravaStreams } from './strava'

export interface DiagnosticResult {
  aerobicDecoupling: AerobicDecouplingResult
  vam: VAMResult
  raceStructure: RaceStructureResult
}

export interface AerobicDecouplingResult {
  available: boolean
  mode: 'heartrate' | 'pace' | 'none'
  decouplePercent: number | null   // % pace loss in second half vs first half at same HR
  collapseKm: number | null        // approximate km where pace drop accelerates
  verdict: string
  detail: string
}

export interface VAMResult {
  available: boolean
  measuredVAM: number | null       // m/h, best sustained 20-min climb segment
  climbSegments: number
  vsUserInput: number | null       // difference vs user-declared VAM
  verdict: string
  detail: string
}

export interface RaceStructureResult {
  available: boolean
  firstHalfPace: number | null     // min/km equivalent flat
  secondHalfPace: number | null
  splitRatio: number | null        // second/first — >1.08 = positive split problem
  collapseType: 'too_fast_start' | 'fueling' | 'balanced' | 'unknown'
  verdict: string
  detail: string
}

export function runDiagnostics(
  activity: StravaActivity,
  streams: StravaStreams,
  userVAM?: number
): DiagnosticResult {
  return {
    aerobicDecoupling: computeAerobicDecoupling(activity, streams),
    vam: computeVAM(streams, userVAM),
    raceStructure: computeRaceStructure(activity, streams),
  }
}

function computeAerobicDecoupling(
  activity: StravaActivity,
  streams: StravaStreams
): AerobicDecouplingResult {
  const vel = streams.velocity_smooth?.data
  const hr = streams.heartrate?.data
  const dist = streams.distance?.data

  if (!vel || !dist || vel.length < 20) {
    return {
      available: false, mode: 'none', decouplePercent: null,
      collapseKm: null,
      verdict: 'Insufficient data',
      detail: 'No pace stream available for this activity.',
    }
  }

  const n = Math.min(vel.length, dist.length, hr ? hr.length : Infinity)
  const third = Math.floor(n / 3)

  if (hr && hr.length >= n) {
    // HR-based: compare pace efficiency (pace/HR) first third vs last third
    const firstEff = avgRatio(vel.slice(0, third), hr.slice(0, third))
    const lastEff = avgRatio(vel.slice(n - third, n), hr.slice(n - third, n))
    const decouplePercent = firstEff > 0
      ? Math.round(((firstEff - lastEff) / firstEff) * 100)
      : null

    // Find approximate collapse km
    const collapseKm = findCollapseKm(vel, dist, hr)

    return {
      available: true,
      mode: 'heartrate',
      decouplePercent,
      collapseKm,
      verdict: decouplePercent !== null
        ? decouplePercent > 12
          ? `Severe decoupling — ${decouplePercent}% efficiency loss`
          : decouplePercent > 6
          ? `Moderate decoupling — ${decouplePercent}% efficiency loss`
          : `Good aerobic base — only ${decouplePercent}% drift`
        : 'Could not compute',
      detail: decouplePercent !== null
        ? `At the same cardiac effort, your pace dropped ${decouplePercent}% from first third to last third of the race.${collapseKm ? ` Onset detectable around KM ${collapseKm}.` : ''}`
        : 'Efficiency ratio could not be computed from available data.',
    }
  }

  // Pace-only fallback
  const firstAvgPace = avg(vel.slice(0, third))
  const lastAvgPace = avg(vel.slice(n - third, n))
  const decouplePercent = firstAvgPace > 0
    ? Math.round(((firstAvgPace - lastAvgPace) / firstAvgPace) * 100)
    : null
  const collapseKm = dist[Math.floor(n * 0.55)] / 1000

  return {
    available: true,
    mode: 'pace',
    decouplePercent,
    collapseKm: Math.round(collapseKm),
    verdict: decouplePercent !== null
      ? decouplePercent > 15
        ? `Pace collapsed ${decouplePercent}% in the second half`
        : decouplePercent > 7
        ? `Pace faded ${decouplePercent}% — manageable but notable`
        : `Solid pacing — only ${decouplePercent}% pace fade`
      : 'Could not compute',
    detail: `No heart rate data. Pace-only analysis: average speed dropped ${decouplePercent ?? '?'}% from first third to last third.`,
  }
}

function computeVAM(streams: StravaStreams, userVAM?: number): VAMResult {
  const alt = streams.altitude?.data
  const time = streams.time?.data
  const grade = streams.grade_smooth?.data

  if (!alt || !time || alt.length < 30) {
    return {
      available: false,
      measuredVAM: null, climbSegments: 0, vsUserInput: null,
      verdict: 'No elevation data',
      detail: 'Altitude stream not available for this activity.',
    }
  }

  // Find climb segments: sustained positive grade for at least 5 min
  const windowSize = 30 // ~30 data points ≈ varies, look for best rolling segment
  const vamValues: number[] = []
  let climbSegments = 0

  for (let i = 0; i < alt.length - windowSize; i++) {
    const elevGain = alt[i + windowSize] - alt[i]
    const timeDelta = time[i + windowSize] - time[i]
    if (elevGain > 20 && timeDelta > 0) {
      const vam = (elevGain / timeDelta) * 3600
      if (vam > 200 && vam < 2500) {
        vamValues.push(vam)
        if (i % windowSize === 0) climbSegments++
      }
    }
  }

  if (vamValues.length === 0) {
    return {
      available: false,
      measuredVAM: null, climbSegments: 0, vsUserInput: null,
      verdict: 'No significant climbs detected',
      detail: 'Could not find sustained climbing segments in this activity.',
    }
  }

  // Best 90th percentile (not max, to avoid GPS noise)
  vamValues.sort((a, b) => a - b)
  const p90idx = Math.floor(vamValues.length * 0.9)
  const measuredVAM = Math.round(vamValues[p90idx])
  const vsUserInput = userVAM ? measuredVAM - userVAM : null

  return {
    available: true,
    measuredVAM,
    climbSegments: Math.max(1, climbSegments),
    vsUserInput,
    verdict: vsUserInput !== null
      ? Math.abs(vsUserInput) < 50
        ? `VAM well-calibrated — measured ${measuredVAM} m/h`
        : vsUserInput > 0
        ? `You're underestimating yourself — measured ${measuredVAM} m/h`
        : `You're overestimating — actual ${measuredVAM} m/h in race conditions`
      : `Measured VAM: ${measuredVAM} m/h`,
    detail: vsUserInput !== null
      ? `Race-condition VAM measured at ${measuredVAM} m/h across ${climbSegments} climb segments. ${vsUserInput > 50 ? `Your declared ceiling of ${userVAM} m/h is conservative — raise it.` : vsUserInput < -50 ? `Your declared ${userVAM} m/h is optimistic for race conditions under fatigue.` : `Matches your declared ceiling closely.`}`
      : `Measured ${measuredVAM} m/h across ${climbSegments} climb segments.`,
  }
}

function computeRaceStructure(
  activity: StravaActivity,
  streams: StravaStreams
): RaceStructureResult {
  const vel = streams.velocity_smooth?.data
  const dist = streams.distance?.data

  if (!vel || !dist || vel.length < 20) {
    return {
      available: false,
      firstHalfPace: null, secondHalfPace: null, splitRatio: null,
      collapseType: 'unknown',
      verdict: 'Insufficient data',
      detail: 'No pace stream available.',
    }
  }

  const totalDist = dist[dist.length - 1]
  const midIdx = dist.findIndex(d => d >= totalDist / 2)
  if (midIdx < 0) {
    return {
      available: false, firstHalfPace: null, secondHalfPace: null,
      splitRatio: null, collapseType: 'unknown',
      verdict: 'Could not split activity', detail: '',
    }
  }

  const firstHalfVel = avg(vel.slice(0, midIdx))
  const secondHalfVel = avg(vel.slice(midIdx))

  // Convert m/s to min/km
  const firstHalfPace = firstHalfVel > 0 ? Math.round(1000 / firstHalfVel / 60 * 10) / 10 : null
  const secondHalfPace = secondHalfVel > 0 ? Math.round(1000 / secondHalfVel / 60 * 10) / 10 : null
  const splitRatio = firstHalfVel > 0 ? Math.round((firstHalfVel / secondHalfVel) * 100) / 100 : null

  let collapseType: RaceStructureResult['collapseType'] = 'unknown'
  if (splitRatio !== null) {
    if (splitRatio > 1.15) collapseType = 'too_fast_start'
    else if (splitRatio > 1.06) collapseType = 'fueling'
    else collapseType = 'balanced'
  }

  const distKm = Math.round(activity.distance / 1000)
  const collapseLabel = {
    too_fast_start: 'Classic positive split — started too fast',
    fueling: 'Second-half fade — likely fueling or pacing',
    balanced: 'Well-structured race',
    unknown: 'Unknown pattern',
  }[collapseType]

  return {
    available: true,
    firstHalfPace,
    secondHalfPace,
    splitRatio,
    collapseType,
    verdict: collapseLabel,
    detail: firstHalfPace && secondHalfPace
      ? `First ${Math.round(distKm / 2)} km: ${firstHalfPace} min/km avg. Second ${Math.round(distKm / 2)} km: ${secondHalfPace} min/km avg. Split ratio: ${splitRatio?.toFixed(2)}× ${splitRatio && splitRatio > 1.06 ? '— pace deteriorated significantly.' : '— solid even effort.'}`
      : 'Could not compute split paces.',
  }
}

// --- Helpers ---

function avg(arr: number[]): number {
  if (!arr.length) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function avgRatio(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return 0
  let sum = 0, count = 0
  for (let i = 0; i < n; i++) {
    if (b[i] > 80) { // only count points with valid HR
      sum += a[i] / b[i]
      count++
    }
  }
  return count > 0 ? sum / count : 0
}

function findCollapseKm(vel: number[], dist: number[], hr: number[]): number | null {
  // Find the km where pace/HR ratio drops most sharply
  const n = Math.min(vel.length, dist.length, hr.length)
  const window = Math.floor(n / 10)
  if (window < 5) return null

  let maxDrop = 0
  let collapseIdx = -1

  for (let i = window; i < n - window; i++) {
    const beforeRatio = avgRatio(vel.slice(i - window, i), hr.slice(i - window, i))
    const afterRatio = avgRatio(vel.slice(i, i + window), hr.slice(i, i + window))
    const drop = beforeRatio - afterRatio
    if (drop > maxDrop) {
      maxDrop = drop
      collapseIdx = i
    }
  }

  if (collapseIdx < 0) return null
  return Math.round(dist[collapseIdx] / 1000)
}
