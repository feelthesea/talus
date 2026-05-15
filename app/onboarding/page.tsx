'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DiagnosticResult } from '@/lib/diagnostics'
import styles from './onboarding.module.css'

interface RaceSummary {
  id: number
  name: string
  date: string
  distanceKm: number
  movingTime: number
  elevationGain: number
  hasHeartrate: boolean
  avgHR?: number
}

type Phase = 'loading_races' | 'confirm_race' | 'pick_race' | 'analyzing' | 'diagnosis' | 'error'

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h${String(m).padStart(2, '0')}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function OnboardingPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('loading_races')
  const [races, setRaces] = useState<RaceSummary[]>([])
  const [suggestedRace, setSuggestedRace] = useState<RaceSummary | null>(null)
  const [selectedRace, setSelectedRace] = useState<RaceSummary | null>(null)
  const [userVAM, setUserVAM] = useState(900)
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null)
  const [analyzedActivity, setAnalyzedActivity] = useState<{name: string, distanceKm: number, date: string} | null>(null)
  const [error, setError] = useState('')
  const [isDemo, setIsDemo] = useState(false)

  useEffect(() => {
    const demo = localStorage.getItem('talus_demo') === '1'
    setIsDemo(demo)
    if (demo) {
      setPhase('diagnosis')
      setDiagnostics(DEMO_DIAGNOSTICS)
      setAnalyzedActivity({ name: 'Val d\'Aran CDH 2024', distanceKm: 110, date: '2024-07-05' })
      return
    }

    fetch('/api/races')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setPhase('error'); return }
        const list: RaceSummary[] = data.races || []
        setRaces(list)
        if (list.length > 0) {
          setSuggestedRace(list[0])
          setPhase('confirm_race')
        } else {
          setPhase('pick_race')
        }
      })
      .catch(() => { setError('Could not load your Strava activities.'); setPhase('error') })
  }, [])

  async function analyzeRace(race: RaceSummary) {
    setSelectedRace(race)
    setPhase('analyzing')
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId: race.id, userVAM }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setDiagnostics(data.diagnostics)
      setAnalyzedActivity(data.activity)
      setPhase('diagnosis')
    } catch (e) {
      setError('Analysis failed. Please try another activity.')
      setPhase('pick_race')
    }
  }

  function proceed() {
    router.push('/blueprint')
  }

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <div className={styles.navLogo}>
            <span className={styles.navMark}>T</span>
            <span className={styles.navName}>Talus</span>
          </div>
          <span className={styles.navStep}>
            {phase === 'confirm_race' || phase === 'pick_race' ? 'Step 1 — Select race' :
             phase === 'analyzing' ? 'Analysing…' :
             phase === 'diagnosis' ? 'Step 2 — Your diagnosis' : ''}
          </span>
        </div>
      </nav>

      <main className={styles.main}>
        <div className={styles.container}>

          {/* LOADING */}
          {phase === 'loading_races' && (
            <div className={styles.centered}>
              <div className={styles.spinner} />
              <p className={styles.hint}>Fetching your Strava races…</p>
            </div>
          )}

          {/* ERROR */}
          {phase === 'error' && (
            <div className={styles.centered}>
              <div className={styles.errorBox}>{error}</div>
              <button className={styles.primaryBtn} onClick={() => router.push('/')}>Back to start</button>
            </div>
          )}

          {/* CONFIRM RACE */}
          {phase === 'confirm_race' && suggestedRace && (
            <div className={styles.section}>
              <div className={styles.stepHeader}>
                <h2 className={styles.stepTitle}>Is this your most recent race?</h2>
                <p className={styles.stepSub}>Talus will use this activity as the basis for your physiological diagnosis.</p>
              </div>

              <div className={styles.raceConfirmCard}>
                <div className={styles.raceConfirmBadge}>Most recent race on Strava</div>
                <div className={styles.raceConfirmName}>{suggestedRace.name}</div>
                <div className={styles.raceConfirmMeta}>
                  <span>{formatDate(suggestedRace.date)}</span>
                  <span className={styles.metaDot}>·</span>
                  <span>{suggestedRace.distanceKm} km</span>
                  <span className={styles.metaDot}>·</span>
                  <span>{formatTime(suggestedRace.movingTime)}</span>
                  {suggestedRace.elevationGain > 0 && <>
                    <span className={styles.metaDot}>·</span>
                    <span>+{suggestedRace.elevationGain} m</span>
                  </>}
                </div>
                {suggestedRace.hasHeartrate
                  ? <div className={styles.hrBadge}>Heart rate data available</div>
                  : <div className={styles.hrBadgeMissing}>No heart rate data — pace analysis only</div>
                }
              </div>

              <div className={styles.actionRow}>
                <button className={styles.outlineBtn} onClick={() => setPhase('pick_race')}>
                  Not this one
                </button>
                <button className={styles.primaryBtn} onClick={() => analyzeRace(suggestedRace)}>
                  Yes, analyse this race →
                </button>
              </div>
            </div>
          )}

          {/* PICK RACE */}
          {phase === 'pick_race' && (
            <div className={styles.section}>
              <div className={styles.stepHeader}>
                <h2 className={styles.stepTitle}>Which race should we analyse?</h2>
                <p className={styles.stepSub}>Select the race that best represents your current fitness level.</p>
              </div>

              {error && <div className={styles.errorBox} style={{marginBottom: '1rem'}}>{error}</div>}

              {races.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No races found on Strava. Make sure your race activities are tagged as "Race" in Strava, or proceed with manual parameters.</p>
                  <button className={styles.primaryBtn} style={{marginTop: '1rem'}} onClick={() => router.push('/blueprint')}>
                    Continue with manual parameters →
                  </button>
                </div>
              ) : (
                <div className={styles.raceList}>
                  {races.map(race => (
                    <button
                      key={race.id}
                      className={styles.raceListItem}
                      onClick={() => analyzeRace(race)}
                    >
                      <div className={styles.raceListLeft}>
                        <div className={styles.raceListName}>{race.name}</div>
                        <div className={styles.raceListMeta}>
                          {formatDate(race.date)} · {race.distanceKm} km · {formatTime(race.movingTime)}
                          {race.elevationGain > 0 && ` · +${race.elevationGain} m`}
                        </div>
                      </div>
                      <div className={styles.raceListRight}>
                        {race.hasHeartrate
                          ? <span className={styles.hrDot} title="Heart rate available" />
                          : <span className={styles.hrDotMissing} title="No heart rate" />
                        }
                        <span className={styles.raceListArrow}>→</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className={styles.skipRow}>
                <button className={styles.skipBtn} onClick={() => router.push('/blueprint')}>
                  Skip diagnosis — go straight to blueprint →
                </button>
              </div>
            </div>
          )}

          {/* ANALYZING */}
          {phase === 'analyzing' && selectedRace && (
            <div className={styles.centered}>
              <div className={styles.spinner} />
              <h3 className={styles.analyzingTitle}>Analysing {selectedRace.name}</h3>
              <p className={styles.hint}>Reading pace, elevation and heart rate streams…</p>
            </div>
          )}

          {/* DIAGNOSIS */}
          {phase === 'diagnosis' && diagnostics && (
            <div className={styles.section}>
              <div className={styles.stepHeader}>
                <div className={styles.stepBadge}>Physiological diagnosis</div>
                <h2 className={styles.stepTitle}>Here's what your data says</h2>
                {analyzedActivity && (
                  <p className={styles.stepSub}>
                    Based on <strong>{analyzedActivity.name}</strong> — {analyzedActivity.distanceKm} km · {formatDate(analyzedActivity.date)}
                  </p>
                )}
              </div>

              <div className={styles.diagCards}>

                {/* Card 1: Aerobic Decoupling */}
                <div className={`${styles.diagCard} ${!diagnostics.aerobicDecoupling.available ? styles.diagCardDim : ''}`}>
                  <div className={styles.diagCardHeader}>
                    <span className={styles.diagCardNum}>01</span>
                    <span className={styles.diagCardTitle}>Aerobic decoupling</span>
                    {diagnostics.aerobicDecoupling.mode === 'heartrate' && (
                      <span className={styles.diagCardMode}>HR-based</span>
                    )}
                    {diagnostics.aerobicDecoupling.mode === 'pace' && (
                      <span className={styles.diagCardModeFallback}>Pace-based</span>
                    )}
                  </div>

                  {diagnostics.aerobicDecoupling.available ? (
                    <>
                      <div className={styles.diagBigStat}>
                        <span className={styles.diagBigVal}>
                          {diagnostics.aerobicDecoupling.decouplePercent !== null
                            ? `${diagnostics.aerobicDecoupling.decouplePercent}%`
                            : '—'}
                        </span>
                        <span className={styles.diagBigUnit}>efficiency loss</span>
                      </div>
                      <div className={styles.diagVerdict}>{diagnostics.aerobicDecoupling.verdict}</div>
                      <div className={styles.diagDetail}>{diagnostics.aerobicDecoupling.detail}</div>
                      {diagnostics.aerobicDecoupling.collapseKm && (
                        <div className={styles.diagHighlight}>
                          Onset ~KM {diagnostics.aerobicDecoupling.collapseKm}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className={styles.diagUnavailable}>{diagnostics.aerobicDecoupling.detail}</div>
                  )}
                </div>

                {/* Card 2: VAM */}
                <div className={`${styles.diagCard} ${!diagnostics.vam.available ? styles.diagCardDim : ''}`}>
                  <div className={styles.diagCardHeader}>
                    <span className={styles.diagCardNum}>02</span>
                    <span className={styles.diagCardTitle}>Vertical ascent rate</span>
                  </div>

                  {diagnostics.vam.available ? (
                    <>
                      <div className={styles.diagBigStat}>
                        <span className={styles.diagBigVal}>{diagnostics.vam.measuredVAM}</span>
                        <span className={styles.diagBigUnit}>m/h measured</span>
                      </div>
                      <div className={styles.diagVerdict}>{diagnostics.vam.verdict}</div>
                      <div className={styles.diagDetail}>{diagnostics.vam.detail}</div>
                      {diagnostics.vam.vsUserInput !== null && (
                        <div className={`${styles.diagHighlight} ${diagnostics.vam.vsUserInput < -50 ? styles.diagHighlightWarn : ''}`}>
                          {diagnostics.vam.vsUserInput > 0
                            ? `+${diagnostics.vam.vsUserInput} m/h vs your declared ceiling`
                            : `${diagnostics.vam.vsUserInput} m/h vs your declared ceiling`}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className={styles.diagUnavailable}>{diagnostics.vam.detail}</div>
                  )}
                </div>

                {/* Card 3: Race Structure */}
                <div className={`${styles.diagCard} ${!diagnostics.raceStructure.available ? styles.diagCardDim : ''}`}>
                  <div className={styles.diagCardHeader}>
                    <span className={styles.diagCardNum}>03</span>
                    <span className={styles.diagCardTitle}>Race structure</span>
                  </div>

                  {diagnostics.raceStructure.available ? (
                    <>
                      <div className={styles.diagSplitRow}>
                        <div className={styles.diagSplit}>
                          <div className={styles.diagSplitVal}>{diagnostics.raceStructure.firstHalfPace}</div>
                          <div className={styles.diagSplitKey}>min/km · first half</div>
                        </div>
                        <div className={styles.diagSplitArrow}>→</div>
                        <div className={styles.diagSplit}>
                          <div className={`${styles.diagSplitVal} ${diagnostics.raceStructure.splitRatio && diagnostics.raceStructure.splitRatio > 1.08 ? styles.diagSplitValWarn : ''}`}>
                            {diagnostics.raceStructure.secondHalfPace}
                          </div>
                          <div className={styles.diagSplitKey}>min/km · second half</div>
                        </div>
                      </div>
                      <div className={styles.diagVerdict}>{diagnostics.raceStructure.verdict}</div>
                      <div className={styles.diagDetail}>{diagnostics.raceStructure.detail}</div>
                      {diagnostics.raceStructure.splitRatio && (
                        <div className={`${styles.diagHighlight} ${diagnostics.raceStructure.splitRatio > 1.08 ? styles.diagHighlightWarn : styles.diagHighlightGood}`}>
                          Split ratio {diagnostics.raceStructure.splitRatio.toFixed(2)}×
                          {diagnostics.raceStructure.splitRatio <= 1.05 ? ' — excellent' : diagnostics.raceStructure.splitRatio <= 1.08 ? ' — acceptable' : ' — too positive'}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className={styles.diagUnavailable}>{diagnostics.raceStructure.detail}</div>
                  )}
                </div>

              </div>

              <div className={styles.proceedSection}>
                <p className={styles.proceedNote}>
                  These findings are baked into your blueprint. The engine will automatically compensate for your decoupling profile and VAM ceiling.
                </p>
                <button className={styles.primaryBtn} onClick={proceed}>
                  Build my race blueprint →
                </button>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}

// Demo data for non-authenticated users
const DEMO_DIAGNOSTICS: DiagnosticResult = {
  aerobicDecoupling: {
    available: true,
    mode: 'heartrate',
    decouplePercent: 11,
    collapseKm: 68,
    verdict: 'Moderate decoupling — 11% efficiency loss',
    detail: 'At the same cardiac effort, your pace dropped 11% from first third to last third of the race. Onset detectable around KM 68.',
  },
  vam: {
    available: true,
    measuredVAM: 874,
    climbSegments: 4,
    vsUserInput: -26,
    verdict: 'VAM well-calibrated — measured 874 m/h',
    detail: 'Race-condition VAM measured at 874 m/h across 4 climb segments. Matches your declared ceiling closely.',
  },
  raceStructure: {
    available: true,
    firstHalfPace: 8.1,
    secondHalfPace: 9.4,
    splitRatio: 1.16,
    collapseType: 'too_fast_start',
    verdict: 'Classic positive split — started too fast',
    detail: 'First 55 km: 8.1 min/km avg. Second 55 km: 9.4 min/km avg. Split ratio: 1.16× — pace deteriorated significantly.',
  },
}
