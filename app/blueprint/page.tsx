'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RACES, computeBlueprint, formatTime, type AthleteParams, type BlueprintPlan } from '@/lib/blueprint-engine'
import styles from './blueprint.module.css'

const DEMO_ATHLETE: AthleteParams = {
  lthr: 168, maxhr: 191, rhr: 41, weight: 66, vam: 900, decoupleOnset: 5,
}

const GELS = [
  { id: 'sis-iso', name: 'SiS Isotonic', carb: '22g', note: 'isotonic · easy on gut', color: '#FC4C02' },
  { id: 'maurten-100', name: 'Maurten 100', carb: '25g', note: 'hydrogel · neutral taste', color: '#1a1a1a' },
  { id: 'maurten-160', name: 'Maurten 160', carb: '40g', note: 'hydrogel · caffeine option', color: '#1a1a1a' },
  { id: 'sis-beta', name: 'SiS Beta Fuel', carb: '46g', note: '1:0.8 ratio · high load', color: '#0a5c96' },
  { id: 'real-food', name: 'Real food', carb: '~30g', note: 'aid station · mental reset', color: '#639922' },
]

type Phase = 'params' | 'race' | 'generating' | 'blueprint'

export default function BlueprintPage() {
  const router = useRouter()
  const [athlete, setAthlete] = useState<AthleteParams>(DEMO_ATHLETE)
  const [selectedRace, setSelectedRace] = useState('cdh')
  const [selectedGels, setSelectedGels] = useState<string[]>(['sis-iso', 'maurten-100'])
  const [targetH, setTargetH] = useState(22)
  const [targetM, setTargetM] = useState(0)
  const [phase, setPhase] = useState<Phase>('params')
  const [blueprint, setBlueprint] = useState<BlueprintPlan | null>(null)
  const [analysis, setAnalysis] = useState('')
  const [athleteName, setAthleteName] = useState('')
  const [genStatus, setGenStatus] = useState('')
  const analysisRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/session')
      .then(r => r.json())
      .then(data => {
        if (data.authenticated && data.athleteName) {
          setAthleteName(data.athleteName)
        } else if (!localStorage.getItem('talus_demo')) {
          router.replace('/')
        }
      })
      .catch(() => {})
  }, [router])

  function updateAthlete(key: keyof AthleteParams, val: string) {
    setAthlete(prev => ({ ...prev, [key]: parseFloat(val) || 0 }))
  }

  function toggleGel(id: string) {
    setSelectedGels(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    )
  }

  async function generate() {
    setPhase('generating')
    const race = RACES[selectedRace]
    const targetMinutes = targetH * 60 + targetM
    const plan = computeBlueprint(race, athlete, targetMinutes, selectedGels)
    setBlueprint(plan)

    const statuses = [
      `Mapping terrain across ${race.dist} km · ${race.gain} m D+`,
      'Modelling aerobic decoupling curve...',
      'Computing VAM-constrained CP intervals...',
      'Sequencing dual-channel carbohydrate absorption...',
      'Finalising HR-locked pacing bands...',
    ]
    let si = 0
    setGenStatus(statuses[0])
    const iv = setInterval(() => {
      if (si < statuses.length - 1) setGenStatus(statuses[++si])
    }, 700)

    try {
      const res = await fetch('/api/blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ athleteParams: athlete, race, targetMinutes, blueprint: plan }),
      })
      clearInterval(iv)
      setPhase('blueprint')
      setAnalysis('')

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let text = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()!
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') break
            try {
              const parsed = JSON.parse(data)
              if (parsed.delta?.text) {
                text += parsed.delta.text
                setAnalysis(text)
                if (analysisRef.current) {
                  analysisRef.current.scrollTop = analysisRef.current.scrollHeight
                }
              }
            } catch {}
          }
        }
      }
    } catch {
      clearInterval(iv)
      setPhase('blueprint')
      setAnalysis(`Blueprint computed locally. Connect your Anthropic API key to enable Oracle analysis.\n\nKey insight: With LTHR ${athlete.lthr} bpm and VAM ${athlete.vam} m/h, your aerobic decoupling onset at hour ${athlete.decoupleOnset} places your primary risk window around KM ${Math.round(athlete.decoupleOnset * (RACES[selectedRace].dist / (targetH + targetM/60)))}. Back off before you feel you need to.`)
    }
  }

  const race = RACES[selectedRace]
  const targetMinutes = targetH * 60 + targetM

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <a href="/" className={styles.navLogo}>
            <span className={styles.navMark}>T</span>
            <span className={styles.navName}>Talus</span>
          </a>
          {athleteName && (
            <span className={styles.navAthlete}>
              <span className={styles.navDot} />
              {athleteName}
            </span>
          )}
          {!athleteName && (
            <span className={styles.navAthlete} style={{ opacity: 0.5 }}>Demo mode</span>
          )}
        </div>
      </nav>

      <main className={styles.main}>
        <div className={styles.container}>

          {/* PHASE: PARAMS */}
          {phase === 'params' && (
            <section className={styles.section}>
              <div className={styles.stepHeader}>
                <div className={styles.stepBadge}>1 / 3</div>
                <h2 className={styles.stepTitle}>Physiological parameters</h2>
                <p className={styles.stepSub}>Derived from your training history. Adjust if needed.</p>
              </div>

              <div className={styles.paramGrid}>
                {[
                  { key: 'lthr', label: 'Lactate threshold HR', unit: 'bpm', min: 130, max: 200 },
                  { key: 'maxhr', label: 'Max HR', unit: 'bpm', min: 160, max: 220 },
                  { key: 'rhr', label: 'Resting HR', unit: 'bpm', min: 28, max: 80 },
                  { key: 'weight', label: 'Body weight', unit: 'kg', min: 40, max: 120 },
                  { key: 'vam', label: 'VAM ceiling', unit: 'm/h', min: 300, max: 2000 },
                  { key: 'decoupleOnset', label: 'Decoupling onset', unit: 'h', min: 1, max: 14, step: 0.5 },
                ].map(({ key, label, unit, min, max, step }) => (
                  <div key={key} className={styles.paramBlock}>
                    <label className={styles.paramLabel}>{label}</label>
                    <div className={styles.paramInput}>
                      <input
                        type="number"
                        value={athlete[key as keyof AthleteParams]}
                        min={min} max={max} step={step || 1}
                        onChange={e => updateAthlete(key as keyof AthleteParams, e.target.value)}
                      />
                      <span className={styles.paramUnit}>{unit}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.diagGrid}>
                <div className={styles.diagCard}>
                  <div className={styles.diagVal}>{Math.round(athlete.lthr * 0.88)}</div>
                  <div className={styles.diagKey}>Z2 ceiling (bpm)</div>
                </div>
                <div className={styles.diagCard}>
                  <div className={styles.diagVal}>{Math.round((athlete.lthr - athlete.rhr) * 0.75 + athlete.rhr)}</div>
                  <div className={styles.diagKey}>Climb HR target</div>
                </div>
                <div className={styles.diagCard}>
                  <div className={styles.diagVal}>{athlete.vam}</div>
                  <div className={styles.diagKey}>VAM ceiling</div>
                </div>
              </div>

              <button className={styles.primaryBtn} onClick={() => setPhase('race')}>
                Continue →
              </button>
            </section>
          )}

          {/* PHASE: RACE */}
          {phase === 'race' && (
            <section className={styles.section}>
              <div className={styles.stepHeader}>
                <div className={styles.stepBadge}>2 / 3</div>
                <h2 className={styles.stepTitle}>Race &amp; nutrition</h2>
                <p className={styles.stepSub}>Select your target event and preferred fuel.</p>
              </div>

              <div className={styles.sectionLabel}>Race</div>
              <div className={styles.raceGrid}>
                {Object.values(RACES).map(r => (
                  <button
                    key={r.id}
                    className={`${styles.raceCard} ${selectedRace === r.id ? styles.raceCardSelected : ''}`}
                    onClick={() => setSelectedRace(r.id)}
                  >
                    <div className={styles.raceCardName}>{r.name}</div>
                    <div className={styles.raceCardMeta}>{r.dist} km · {r.gain.toLocaleString()} m D+</div>
                    <div className={styles.raceCardCps}>{r.cps.length - 1} segments · {r.cps.length - 2} CPs</div>
                  </button>
                ))}
              </div>

              <div className={styles.sectionLabel}>Nutrition</div>
              <div className={styles.gelPicker}>
                {GELS.map(g => (
                  <button
                    key={g.id}
                    className={`${styles.gelPill} ${selectedGels.includes(g.id) ? styles.gelPillSelected : ''}`}
                    onClick={() => toggleGel(g.id)}
                  >
                    <span className={styles.gelDot} style={{ background: g.color }} />
                    <span className={styles.gelName}>{g.name}</span>
                    <span className={styles.gelCarb}>{g.carb}</span>
                  </button>
                ))}
              </div>

              <div className={styles.sectionLabel}>Target finish time</div>
              <div className={styles.timeRow}>
                <div className={styles.timeBlock}>
                  <label className={styles.paramLabel}>Hours</label>
                  <input
                    type="number" value={targetH} min={8} max={50}
                    onChange={e => setTargetH(parseInt(e.target.value) || 0)}
                    className={styles.timeInput}
                  />
                </div>
                <div className={styles.timeSep}>:</div>
                <div className={styles.timeBlock}>
                  <label className={styles.paramLabel}>Minutes</label>
                  <input
                    type="number" value={targetM} min={0} max={59}
                    onChange={e => setTargetM(parseInt(e.target.value) || 0)}
                    className={styles.timeInput}
                  />
                </div>
                <div className={styles.timeNote}>
                  Based on your profile, realistic range for {race.shortName}:{' '}
                  <strong>{Math.floor(targetH * 0.92)}h – {Math.ceil(targetH * 1.12)}h</strong>
                </div>
              </div>

              <div className={styles.actionRow}>
                <button className={styles.outlineBtn} onClick={() => setPhase('params')}>← Back</button>
                <button className={styles.primaryBtn} onClick={generate} disabled={selectedGels.length === 0}>
                  Generate Blueprint
                </button>
              </div>
            </section>
          )}

          {/* PHASE: GENERATING */}
          {phase === 'generating' && (
            <section className={styles.generatingState}>
              <div className={styles.genSpinner} />
              <h2 className={styles.genTitle}>Forging your blueprint</h2>
              <p className={styles.genStatus}>{genStatus}</p>
            </section>
          )}

          {/* PHASE: BLUEPRINT */}
          {phase === 'blueprint' && blueprint && (
            <section className={styles.section}>
              <div className={styles.bpHeader}>
                <div className={styles.bpRaceLabel}>{blueprint.race.name}</div>
                <div className={styles.bpStats}>
                  <div className={styles.bpStat}>
                    <div className={styles.bpStatVal}>{formatTime(blueprint.targetMinutes)}</div>
                    <div className={styles.bpStatKey}>Target</div>
                  </div>
                  <div className={styles.bpStat}>
                    <div className={styles.bpStatVal}>{blueprint.race.dist} km</div>
                    <div className={styles.bpStatKey}>Distance</div>
                  </div>
                  <div className={styles.bpStat}>
                    <div className={styles.bpStatVal}>{blueprint.race.gain.toLocaleString()} m</div>
                    <div className={styles.bpStatKey}>Elevation</div>
                  </div>
                  <div className={styles.bpStat}>
                    <div className={styles.bpStatVal}>~{blueprint.avgCarbPerHour}g/h</div>
                    <div className={styles.bpStatKey}>Avg carb</div>
                  </div>
                </div>
              </div>

              <div className={styles.sectionLabel}>Physiological snapshot</div>
              <div className={styles.diagGrid3}>
                <div className={styles.diagCard}>
                  <div className={styles.diagVal}>~{blueprint.decoupleKm} km</div>
                  <div className={styles.diagKey}>Decoupling onset</div>
                </div>
                <div className={styles.diagCard}>
                  <div className={styles.diagVal}>{blueprint.athlete.vam} m/h</div>
                  <div className={styles.diagKey}>VAM ceiling</div>
                </div>
                <div className={styles.diagCard}>
                  <div className={styles.diagVal}>{blueprint.totalCarb}g</div>
                  <div className={styles.diagKey}>Total carb planned</div>
                </div>
              </div>

              <div className={styles.alertBox}>
                <strong>Risk window:</strong> KM {blueprint.riskWindowKm[0]}–{blueprint.riskWindowKm[1]} — aerobic decoupling zone.
                HR must stay ≤{Math.round(blueprint.athlete.lthr * 0.85)} bpm. Prioritise liquid carbs.
              </div>

              <div className={styles.sectionLabel}>CP timeline</div>
              <div className={styles.cpTimeline}>
                {blueprint.segments.map((seg, i) => {
                  const h = Math.floor(seg.cumMinutes / 60)
                  const m = seg.cumMinutes % 60
                  const isLast = i === blueprint.segments.length - 1
                  return (
                    <div key={i} className={styles.cpRow}>
                      <div className={styles.cpLine}>
                        <div className={`${styles.cpDot} ${isLast ? styles.cpDotFinish : ''}`} />
                        {!isLast && <div className={styles.cpConnector} />}
                      </div>
                      <div className={styles.cpContent}>
                        <div className={styles.cpName}>{seg.to.name}</div>
                        <div className={styles.cpMeta}>
                          KM {seg.to.km} · +{seg.gainM} m this segment
                        </div>
                        <div className={styles.cpBadges}>
                          <span className={styles.badgeHr}>{seg.hrZone}</span>
                          {seg.riskNote && <span className={styles.badgeRisk}>⚠ {seg.riskNote}</span>}
                        </div>
                        <div className={styles.cpFuel}>{seg.fuelCmd} · {seg.carbTarget}g carb</div>
                      </div>
                      <div className={styles.cpTime}>
                        <div className={styles.cpTimeVal}>{String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}</div>
                        <div className={styles.cpTimeSub}>ETA</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className={styles.sectionLabel}>Oracle analysis</div>
              <div className={styles.analysisBox} ref={analysisRef}>
                {analysis || <span className={styles.analysisPlaceholder}>Generating analysis…</span>}
              </div>

              <div className={styles.actionRow}>
                <button className={styles.outlineBtn} onClick={() => { setPhase('params'); setBlueprint(null); setAnalysis('') }}>
                  Reconfigure
                </button>
                <button className={styles.primaryBtn} onClick={() => window.print()}>
                  Export PDF
                </button>
              </div>

              <button
                className={styles.raceModeBtn}
                onClick={() => {
                  sessionStorage.setItem('talus_blueprint', JSON.stringify(blueprint))
                  router.push('/race?seg=0')
                }}
              >
                <span className={styles.raceModeIcon}>▶</span>
                Enter Race Mode
              </button>
            </section>
          )}

        </div>
      </main>
    </div>
  )
}
