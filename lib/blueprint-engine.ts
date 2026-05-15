export interface AthleteParams {
  lthr: number
  maxhr: number
  rhr: number
  weight: number
  vam: number
  decoupleOnset: number
}

export interface RaceCP {
  name: string
  km: number
  elev: number
  gainFromStart: number
  lat?: number   // WGS84 — from UTMB DB (placeholder coords for now)
  lng?: number
}

export interface Race {
  id: string
  name: string
  shortName: string
  dist: number
  gain: number
  cps: RaceCP[]
  elevProfile: number[]
  profileKm: number[]
}

export interface SegmentPlan {
  from: RaceCP
  to: RaceCP
  distKm: number
  gainM: number
  estMinutes: number
  cumMinutes: number
  hrCeiling: number
  hrZone: string
  carbTarget: number
  fuelCmd: string
  riskNote: string | null
}

export interface BlueprintPlan {
  race: Race
  athlete: AthleteParams
  targetMinutes: number
  segments: SegmentPlan[]
  totalCarb: number
  avgCarbPerHour: number
  decoupleKm: number
  riskWindowKm: [number, number]
}

export const RACES: Record<string, Race> = {
  cdh: {
    id: 'cdh',
    name: "Val d'Aran by UTMB — CDH",
    shortName: 'CDH · 110 km',
    dist: 110,
    gain: 6800,
    cps: [
      { name: 'Start · Vielha',    km: 0,   elev: 980,  gainFromStart: 0,    lat: 42.6989, lng: 0.7956 },
      { name: 'CP1 · Conangles',    km: 18,  elev: 1570, gainFromStart: 1100, lat: 42.5711, lng: 0.7498 },
      { name: 'CP2 · Taüll',        km: 36,  elev: 1490, gainFromStart: 1950, lat: 42.5295, lng: 0.8021 },
      { name: 'CP3 · Colomèrs',     km: 55,  elev: 1870, gainFromStart: 3200, lat: 42.5742, lng: 0.9134 },
      { name: 'CP4 · Boí Taüll',    km: 73,  elev: 2100, gainFromStart: 4500, lat: 42.5128, lng: 0.8634 },
      { name: 'CP5 · Espot',        km: 89,  elev: 1320, gainFromStart: 5400, lat: 42.5851, lng: 1.0876 },
      { name: 'Finish · Vielha',    km: 110, elev: 980,  gainFromStart: 6800, lat: 42.6989, lng: 0.7956 },
    ],
    elevProfile: [980,1080,1200,1400,1570,1420,1350,1490,1580,1700,1870,2050,2100,1800,1550,1320,1150,1050,980],
    profileKm:   [0,   6,   11,  15,  18,  22,  26,  32,  36,  44,  55,  64,  73,  80,  85,  89,  96, 103, 110],
  },
  ccc: {
    id: 'ccc',
    name: 'CCC by UTMB',
    shortName: 'CCC · 101 km',
    dist: 101,
    gain: 6100,
    cps: [
      { name: 'Start · Courmayeur', km: 0, elev: 1224, gainFromStart: 0 },
      { name: 'CP1 · Refuge Bertone', km: 9, elev: 1989, gainFromStart: 765 },
      { name: 'CP2 · Arnuva', km: 26, elev: 1769, gainFromStart: 1700 },
      { name: 'CP3 · Grand Col Ferret', km: 31, elev: 2537, gainFromStart: 2468 },
      { name: 'CP4 · La Fouly', km: 40, elev: 1593, gainFromStart: 2600 },
      { name: 'CP5 · Champex-Lac', km: 55, elev: 1466, gainFromStart: 3500 },
      { name: 'CP6 · Vallorcine', km: 76, elev: 1260, gainFromStart: 4800 },
      { name: 'Finish · Chamonix', km: 101, elev: 1035, gainFromStart: 6100 },
    ],
    elevProfile: [1224,1800,1989,1750,1769,2200,2537,1900,1593,1450,1466,1700,1900,1800,1260,1400,1600,1400,1035],
    profileKm:   [0,   5,   9,   16,  26,  29,  31,  36,  40,  48,  55,  62,  68,  72,  76,  82,  90,  96, 101],
  },
  tor: {
    id: 'tor',
    name: 'TOR130 — Valle d\'Aosta',
    shortName: 'TOR130 · 130 km',
    dist: 130,
    gain: 9600,
    cps: [
      { name: 'Start · Courmayeur', km: 0, elev: 1224, gainFromStart: 0 },
      { name: 'CP1 · Rifugio Deffeyes', km: 22, elev: 2494, gainFromStart: 1800 },
      { name: 'CP2 · Valgrisenche', km: 40, elev: 1664, gainFromStart: 2800 },
      { name: 'CP3 · Rifugio Bezzi', km: 58, elev: 2284, gainFromStart: 4500 },
      { name: 'CP4 · Rhêmes-Notre-Dame', km: 74, elev: 1696, gainFromStart: 5800 },
      { name: 'CP5 · Rifugio Benevolo', km: 92, elev: 2285, gainFromStart: 7500 },
      { name: 'CP6 · Cogne', km: 108, elev: 1534, gainFromStart: 8500 },
      { name: 'Finish · Courmayeur', km: 130, elev: 1224, gainFromStart: 9600 },
    ],
    elevProfile: [1224,1800,2200,2494,2000,1664,1900,2100,2284,2000,1696,1900,2100,2285,1900,1534,1700,1900,1224],
    profileKm:   [0,   8,   16,  22,  30,  40,  48,  54,  58,  66,  74,  82,  88,  92,  100, 108, 116, 124, 130],
  },
}

export function computeBlueprint(
  race: Race,
  athlete: AthleteParams,
  targetMinutes: number,
  selectedGelIds: string[]
): BlueprintPlan {
  const z2Ceiling = Math.round(athlete.lthr * 0.88)
  const z3Ceiling = athlete.lthr
  const z2Low = Math.round(athlete.lthr * 0.82)

  const segments: SegmentPlan[] = []

  // Weight each segment by distance + elevation cost
  const rawWeights = race.cps.slice(1).map((cp, i) => {
    const from = race.cps[i]
    const distSeg = cp.km - from.km
    const gainSeg = cp.gainFromStart - from.gainFromStart
    return distSeg * 0.4 + (gainSeg / 100) * 0.6
  })
  const totalWeight = rawWeights.reduce((s, w) => s + w, 0)

  let cumMinutes = 0
  const decoupleOnsetMin = athlete.decoupleOnset * 60

  race.cps.slice(1).forEach((cp, i) => {
    const from = race.cps[i]
    const distSeg = cp.km - from.km
    const gainSeg = cp.gainFromStart - from.gainFromStart
    const segMin = Math.round((rawWeights[i] / totalWeight) * targetMinutes)
    cumMinutes += segMin

    const midCumMin = cumMinutes - segMin / 2
    const inDecoupleZone = midCumMin > decoupleOnsetMin
    const deepDecoupleZone = midCumMin > decoupleOnsetMin * 1.6

    let hrCeiling: number
    let hrZone: string
    if (i === 0) {
      hrCeiling = z2Ceiling
      hrZone = `Z2 ≤${z2Ceiling} bpm — controlled start`
    } else if (inDecoupleZone && !deepDecoupleZone) {
      hrCeiling = z2Low
      hrZone = `Z2 ≤${z2Low} bpm — decoupling onset`
    } else if (deepDecoupleZone) {
      hrCeiling = Math.round(athlete.lthr * 0.80)
      hrZone = `Z1/Z2 ≤${Math.round(athlete.lthr * 0.80)} bpm — survival economy`
    } else if (gainSeg > 600) {
      hrCeiling = z3Ceiling
      hrZone = `Z3 ≤${z3Ceiling} bpm — major climb`
    } else {
      hrCeiling = z2Ceiling
      hrZone = `Z2 ≤${z2Ceiling} bpm`
    }

    // Carb target: 80→95→90→85 g/h across race phases
    const phaseFraction = cumMinutes / targetMinutes
    let carbPerHour: number
    if (phaseFraction < 0.3) carbPerHour = 80
    else if (phaseFraction < 0.6) carbPerHour = 95
    else if (phaseFraction < 0.8) carbPerHour = 90
    else carbPerHour = 85

    const segHours = segMin / 60
    const carbTarget = Math.round(carbPerHour * segHours)

    // Fuel command: simplified shorthand
    let fuelCmd: string
    if (phaseFraction < 0.3) fuelCmd = '1×SiS·iso + 500ml'
    else if (phaseFraction < 0.55) fuelCmd = '1×SiS + 1×Maurten100'
    else if (phaseFraction < 0.75) fuelCmd = '2×Maurten100 + liquid'
    else fuelCmd = '1×Maurten100 + real food'

    // Risk note
    let riskNote: string | null = null
    if (inDecoupleZone && !deepDecoupleZone) {
      riskNote = `Decoupling zone — reduce pace ${Math.round(athlete.decoupleOnset * 1.5)}% vs first half`
    }
    if (deepDecoupleZone) {
      riskNote = 'Deep fatigue phase — walk steep sections, no ego'
    }

    segments.push({
      from,
      to: cp,
      distKm: distSeg,
      gainM: gainSeg,
      estMinutes: segMin,
      cumMinutes,
      hrCeiling,
      hrZone,
      carbTarget,
      fuelCmd,
      riskNote,
    })
  })

  const totalCarb = segments.reduce((s, seg) => s + seg.carbTarget, 0)
  const avgCarbPerHour = Math.round(totalCarb / (targetMinutes / 60))

  // Find approximate km where decoupling hits
  let decoupleKm = 0
  let cumMin2 = 0
  for (const seg of segments) {
    cumMin2 += seg.estMinutes
    if (cumMin2 >= decoupleOnsetMin) {
      decoupleKm = seg.from.km + Math.round(seg.distKm * 0.5)
      break
    }
  }

  const riskStart = Math.max(0, decoupleKm - 5)
  const riskEnd = Math.min(race.dist, decoupleKm + 20)

  return {
    race,
    athlete,
    targetMinutes,
    segments,
    totalCarb,
    avgCarbPerHour,
    decoupleKm,
    riskWindowKm: [riskStart, riskEnd],
  }
}

export function formatTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}h${String(m).padStart(2, '0')}`
}
