/**
 * ITRA semi-public JSON interface.
 * No auth required as of now. Structure may change without notice.
 */

const ITRA_BASE = 'https://itra.run/api'

export interface ITRARunner {
  runnerId: number
  firstName: string
  lastName: string
  nationality: string
  performanceIndex: number    // 0–1000, higher = better
  gender: string
}

export interface ITRARace {
  raceId: number
  raceName: string
  eventName: string
  date: string
  distanceKm: number
  elevationGain: number
  finishTime: number          // seconds
  rank: number
  totalFinishers: number
  itraPoints: number
  dnf: boolean
}

export interface ITRAProfile {
  runner: ITRARunner
  races: ITRARace[]
  // Derived
  avgPacePerKmEquiv: number   // min/km on equivalent flat distance
  bestPerformances: ITRARace[]
  similarRaces: ITRARace[]    // races with distance within ±30% of target
}

export async function fetchITRAProfile(
  runnerId: string,
  targetDistKm?: number
): Promise<ITRAProfile | null> {
  try {
    const res = await fetch(
      `${ITRA_BASE}/Runner/GetRunner?runnerId=${runnerId}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Talus/1.0 (race blueprint engine)',
        },
        next: { revalidate: 3600 }, // cache 1h
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    return parseITRAResponse(data, targetDistKm)
  } catch (err) {
    console.error('ITRA fetch error:', err)
    return null
  }
}

function parseITRAResponse(data: ITRARawResponse, targetDistKm?: number): ITRAProfile {
  const runner: ITRARunner = {
    runnerId: data.runnerId ?? 0,
    firstName: data.firstName ?? '',
    lastName: data.lastName ?? '',
    nationality: data.nationality ?? '',
    performanceIndex: data.performanceIndex ?? 0,
    gender: data.gender ?? 'M',
  }

  const races: ITRARace[] = (data.runnerRaces ?? [])
    .filter((r: ITRARawRace) => !r.dnf && (r.finishTime ?? 0) > 0)
    .map((r: ITRARawRace) => ({
      raceId: r.raceId ?? 0,
      raceName: r.raceName ?? '',
      eventName: r.eventName ?? '',
      date: r.date ?? '',
      distanceKm: r.distance ?? 0,
      elevationGain: r.elevationGain ?? 0,
      finishTime: r.finishTime ?? 0,
      rank: r.rank ?? 0,
      totalFinishers: r.totalFinishers ?? 0,
      itraPoints: r.itraPoints ?? 0,
      dnf: false,
    }))
    .sort((a: ITRARace, b: ITRARace) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Best performances = top 5 by ITRA points
  const bestPerformances = [...races]
    .sort((a, b) => b.itraPoints - a.itraPoints)
    .slice(0, 5)

  // Similar races = within ±30% of target distance
  const similarRaces = targetDistKm
    ? races.filter(r =>
        r.distanceKm >= targetDistKm * 0.7 &&
        r.distanceKm <= targetDistKm * 1.3 &&
        r.elevationGain > 1000  // must be a mountain race
      )
    : []

  // Compute avg pace on equivalent flat distance across all finishes
  const avgPacePerKmEquiv = computeAvgEquivPace(races)

  return { runner, races, avgPacePerKmEquiv, bestPerformances, similarRaces }
}

function computeAvgEquivPace(races: ITRARace[]): number {
  // Convert each race to equivalent flat km using simplified Minetti
  // EFD = distance + elevation_gain / 100 * 7.5 (empirical factor)
  const validRaces = races.filter(r =>
    r.distanceKm > 20 &&
    r.finishTime > 0 &&
    r.finishTime < 86400 * 2  // < 48h
  )
  if (validRaces.length === 0) return 0

  const paces = validRaces.map(r => {
    const efd = r.distanceKm + (r.elevationGain / 100) * 7.5
    return (r.finishTime / 60) / efd  // min per equiv-km
  })

  // Weighted average — more recent races count more
  const weights = paces.map((_, i) => Math.pow(0.8, i))
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  return paces.reduce((s, p, i) => s + p * weights[i], 0) / totalWeight
}

// Raw API response types (defensive)
interface ITRARawResponse {
  runnerId?: number
  firstName?: string
  lastName?: string
  nationality?: string
  performanceIndex?: number
  gender?: string
  runnerRaces?: ITRARawRace[]
}

interface ITRARawRace {
  raceId?: number
  raceName?: string
  eventName?: string
  date?: string
  distance?: number
  elevationGain?: number
  finishTime?: number
  rank?: number
  totalFinishers?: number
  itraPoints?: number
  dnf?: boolean
}
