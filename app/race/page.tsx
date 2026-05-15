'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { BlueprintPlan, SegmentPlan } from '@/lib/blueprint-engine'
import { useGeofence, type CPArrival, type RecalcResult } from '@/lib/geofence'
import styles from './race-mode.module.css'

// ─── Swipe handling ───────────────────────────────────────────────────────────
function useSwipe(onLeft: () => void, onRight: () => void) {
  const startX = useRef<number | null>(null)
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
  }, [])
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (startX.current === null) return
    const dx = e.changedTouches[0].clientX - startX.current
    if (Math.abs(dx) > 60) { dx < 0 ? onLeft() : onRight() }
    startX.current = null
  }, [onLeft, onRight])
  return { onTouchStart, onTouchEnd }
}

// ─── Elevation profile SVG ────────────────────────────────────────────────────
function ProfileChart({ blueprint, activeIdx }: { blueprint: BlueprintPlan; activeIdx: number }) {
  const { race, segments } = blueprint
  const W = 800; const H = 160
  const PAD = { t: 10, r: 16, b: 24, l: 28 }
  const iW = W - PAD.l - PAD.r
  const iH = H - PAD.t - PAD.b
  const minE = Math.min(...race.elevProfile)
  const maxE = Math.max(...race.elevProfile)
  const elevRange = maxE - minE || 1
  const toX = (km: number) => PAD.l + (km / race.dist) * iW
  const toY = (e: number) => PAD.t + iH - ((e - minE) / elevRange) * iH

  const activeSeg = segments[activeIdx]
  const fromKm = activeSeg.from.km
  const toKm = activeSeg.to.km

  function interpElev(km: number): number {
    for (let i = 0; i < race.profileKm.length - 1; i++) {
      if (race.profileKm[i] <= km && race.profileKm[i + 1] >= km) {
        const t = (km - race.profileKm[i]) / (race.profileKm[i + 1] - race.profileKm[i])
        return race.elevProfile[i] + t * (race.elevProfile[i + 1] - race.elevProfile[i])
      }
    }
    return race.elevProfile[0]
  }

  const activeArea = [
    { km: fromKm, e: interpElev(fromKm) },
    ...race.elevProfile.map((e, i) => ({ km: race.profileKm[i], e }))
      .filter(p => p.km > fromKm && p.km < toKm),
    { km: toKm, e: interpElev(toKm) },
  ]

  const areaPath = [
    `M ${toX(fromKm)},${H - PAD.b}`,
    ...activeArea.map(p => `L ${toX(p.km)},${toY(p.e)}`),
    `L ${toX(toKm)},${H - PAD.b} Z`,
  ].join(' ')

  const fullPoints = race.elevProfile.map((e, i) =>
    `${toX(race.profileKm[i])},${toY(e)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
      aria-label={`Elevation profile, segment ${activeIdx + 1} highlighted`}>
      <defs>
        <linearGradient id="fl" x1="0" x2="1">
          <stop offset="0%" stopColor="var(--bg)" stopOpacity="0.85"/>
          <stop offset="100%" stopColor="var(--bg)" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="fr" x1="0" x2="1">
          <stop offset="0%" stopColor="var(--bg)" stopOpacity="0"/>
          <stop offset="100%" stopColor="var(--bg)" stopOpacity="0.85"/>
        </linearGradient>
      </defs>

      {/* Full profile gray */}
      <polygon points={`${PAD.l},${H-PAD.b} ${fullPoints} ${toX(race.dist)},${H-PAD.b}`}
        fill="var(--profile-gray)" opacity="0.07"/>
      <polyline points={fullPoints} fill="none"
        stroke="var(--profile-gray)" strokeWidth="1.5" opacity="0.35"/>

      {/* Active segment */}
      <path d={areaPath} fill="var(--profile-active)" opacity="0.22"/>
      <polyline points={activeArea.map(p => `${toX(p.km)},${toY(p.e)}`).join(' ')}
        fill="none" stroke="var(--profile-active)" strokeWidth="2.5"/>

      {/* Fade masks */}
      {toX(fromKm) > PAD.l + 10 &&
        <rect x={PAD.l} y={PAD.t} width={toX(fromKm)-PAD.l} height={iH} fill="url(#fl)"/>}
      {toX(toKm) < W - PAD.r - 10 &&
        <rect x={toX(toKm)} y={PAD.t} width={W-PAD.r-toX(toKm)} height={iH} fill="url(#fr)"/>}

      {/* CP ticks */}
      {race.cps.slice(1,-1).map(cp => (
        <g key={cp.km}>
          <line x1={toX(cp.km)} y1={H-PAD.b} x2={toX(cp.km)} y2={H-PAD.b+5}
            stroke="var(--muted)" strokeWidth="1" opacity="0.4"/>
          <text x={toX(cp.km)} y={H-PAD.b+14} textAnchor="middle"
            fontSize="8" fill="var(--muted)" opacity="0.5">{cp.km}k</text>
        </g>
      ))}

      {/* Active endpoints */}
      <circle cx={toX(fromKm)} cy={toY(interpElev(fromKm))} r="4" fill="var(--profile-active)"/>
      <circle cx={toX(toKm)} cy={toY(interpElev(toKm))} r="4" fill="var(--profile-active)"/>

      {/* Elev labels */}
      <text x={PAD.l-3} y={PAD.t+5} textAnchor="end" fontSize="8"
        fill="var(--muted)" opacity="0.45">{Math.round(maxE)}m</text>
      <text x={PAD.l-3} y={H-PAD.b} textAnchor="end" fontSize="8"
        fill="var(--muted)" opacity="0.45">{Math.round(minE)}m</text>
    </svg>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}

function FuelPills({ cmd }: { cmd: string }) {
  return (
    <div className={styles.fuelPills}>
      {cmd.split('+').map((p, i) => (
        <span key={i} className={styles.fuelPill}>{p.trim()}</span>
      ))}
    </div>
  )
}

// ─── GPS status indicator ─────────────────────────────────────────────────────
function GPSIndicator({
  watching, accuracy, mode, error,
}: {
  watching: boolean; accuracy: number | null; mode: 'far' | 'near'; error: string | null
}) {
  if (error) return <span className={styles.gpsError} title={error}>⊗ GPS</span>
  if (!watching) return null
  return (
    <span className={`${styles.gpsIndicator} ${mode === 'near' ? styles.gpsNear : ''}`}
      title={accuracy ? `Accuracy: ${accuracy}m · ${mode === 'near' ? '1min' : '10min'} polling` : 'GPS active'}>
      ◉ {accuracy ? `±${accuracy}m` : 'GPS'}
    </span>
  )
}

// ─── Recalc toast (silent, auto-dismiss) ─────────────────────────────────────
function RecalcToast({ recalc, onDismiss }: { recalc: RecalcResult | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!recalc?.triggered) return
    const t = setTimeout(onDismiss, 3500)
    return () => clearTimeout(t)
  }, [recalc, onDismiss])

  if (!recalc?.triggered) return null
  const sign = recalc.deviationPct > 0 ? '+' : ''
  return (
    <div className={styles.recalcToast}>
      ⟳ ETAs updated · {sign}{Math.round(recalc.deviationPct)}% pace shift
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function RaceModePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [blueprint, setBlueprint] = useState<BlueprintPlan | null>(null)
  const [segments, setSegments] = useState<SegmentPlan[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [sliding, setSliding] = useState<'left' | 'right' | null>(null)
  const [keepAwake, setKeepAwake] = useState(false)
  const [raceStartTime, setRaceStartTime] = useState<number | null>(null)
  const [lastRecalc, setLastRecalc] = useState<RecalcResult | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('talus_blueprint')
    if (!raw) { router.replace('/blueprint'); return }
    const plan: BlueprintPlan = JSON.parse(raw)
    setBlueprint(plan)
    setSegments(plan.segments)
    const seg = parseInt(searchParams.get('seg') ?? '0', 10)
    setActiveIdx(Math.max(0, Math.min(seg, plan.segments.length - 1)))
  }, [router, searchParams])

  useEffect(() => {
    if (!keepAwake || !('wakeLock' in navigator)) return
    navigator.wakeLock.request('screen')
      .then(lock => { wakeLockRef.current = lock })
      .catch(() => {})
    return () => { wakeLockRef.current?.release() }
  }, [keepAwake])

  // Geofence — CP arrival handler
  const handleCPArrival = useCallback((arrival: CPArrival, recalc: RecalcResult) => {
    if (recalc.triggered) {
      setSegments(recalc.updatedSegments)
      setLastRecalc(recalc)
      // Persist updated blueprint so sessionStorage stays in sync
      if (blueprint) {
        const updated = { ...blueprint, segments: recalc.updatedSegments }
        sessionStorage.setItem('talus_blueprint', JSON.stringify(updated))
      }
    }
  }, [blueprint])

  const handleSegmentAdvance = useCallback((nextIdx: number) => {
    if (!blueprint || nextIdx >= blueprint.segments.length) return
    setSliding('left')
    setTimeout(() => { setActiveIdx(nextIdx); setSliding(null) }, 280)
  }, [blueprint])

  const { state: geoState, gpsError, gpsAccuracy, startWatching, stopWatching } = useGeofence({
    blueprint: blueprint ?? { segments } as BlueprintPlan,
    currentSegmentIdx: activeIdx,
    raceStartTime,
    onCPArrival: handleCPArrival,
    onSegmentAdvance: handleSegmentAdvance,
  })

  function startRace() {
    const now = Date.now()
    setRaceStartTime(now)
    startWatching()
  }

  const goNext = useCallback(() => {
    if (!blueprint || activeIdx >= segments.length - 1) return
    setSliding('left')
    setTimeout(() => { setActiveIdx(i => i + 1); setSliding(null) }, 280)
  }, [blueprint, activeIdx, segments.length])

  const goPrev = useCallback(() => {
    if (activeIdx <= 0) return
    setSliding('right')
    setTimeout(() => { setActiveIdx(i => i - 1); setSliding(null) }, 280)
  }, [activeIdx])

  const swipe = useSwipe(goNext, goPrev)

  if (!blueprint) return (
    <div className={styles.loading}><div className={styles.spinner}/></div>
  )

  const seg = segments[activeIdx]
  const isLast = activeIdx === segments.length - 1
  const remainingKm = blueprint.race.dist - seg.from.km
  const cpsLeft = blueprint.race.cps.length - 2 - activeIdx

  return (
    <div className={styles.page} {...swipe}>

      {/* Top bar */}
      <header className={styles.topBar}>
        <button className={styles.exitBtn} onClick={() => router.push('/blueprint')}
          aria-label="Exit race mode">✕</button>

        <div className={styles.topCenter}>
          <div className={styles.raceLabel}>{blueprint.race.shortName}</div>
          <GPSIndicator
            watching={geoState.watching}
            accuracy={gpsAccuracy}
            mode={geoState.samplingMode}
            error={gpsError}
          />
        </div>

        <button
          className={`${styles.wakeLockBtn} ${keepAwake ? styles.wakeLockOn : ''}`}
          onClick={() => setKeepAwake(v => !v)}
          aria-label="Keep screen on">☀
        </button>
      </header>

      {/* Elevation profile */}
      <div className={styles.profileWrap}>
        <ProfileChart blueprint={blueprint} activeIdx={activeIdx}/>
      </div>

      {/* Segment dots */}
      <div className={styles.segDots} role="tablist">
        {segments.map((_, i) => (
          <button key={i} role="tab" aria-selected={i === activeIdx}
            className={`${styles.segDot} ${i === activeIdx ? styles.segDotActive : ''} ${i < activeIdx ? styles.segDotDone : ''}`}
            onClick={() => setActiveIdx(i)}
            aria-label={`Segment ${i + 1}`}/>
        ))}
      </div>

      {/* Main segment content */}
      <div className={`${styles.segContent}
        ${sliding === 'left' ? styles.slideOutLeft : ''}
        ${sliding === 'right' ? styles.slideOutRight : ''}`}>

        {/* Header */}
        <div className={styles.segHeader}>
          <div className={styles.segFrom}>
            {seg.from.name.replace(/^(CP\d+\s·\s|Start\s·\s|Finish\s·\s)/, '')}
          </div>
          <div className={styles.segArrow}>→</div>
          <div className={styles.segTo}>
            {seg.to.name.replace(/^(CP\d+\s·\s|Start\s·\s|Finish\s·\s)/, '')}
          </div>
          <div className={styles.segBadge}>{activeIdx + 1}/{segments.length}</div>
        </div>

        {/* Three primary data elements */}
        <div className={styles.triData}>
          <div className={styles.triBlock}>
            <div className={styles.triVal}>{fmt(seg.cumMinutes)}</div>
            <div className={styles.triKey}>ETA checkpoint</div>
          </div>
          <div className={styles.triDivider}/>
          <div className={styles.triBlock}>
            <div className={`${styles.triVal} ${styles.triValHr}`}>≤{seg.hrCeiling}</div>
            <div className={styles.triKey}>HR ceiling bpm</div>
          </div>
          <div className={styles.triDivider}/>
          <div className={styles.triBlock}>
            <div className={styles.triVal}>{seg.distKm}km</div>
            <div className={styles.triKey}>+{seg.gainM}m</div>
          </div>
        </div>

        {/* Fuel */}
        <div className={styles.fuelSection}>
          <div className={styles.fuelLabel}>FUEL THIS SEGMENT</div>
          <FuelPills cmd={seg.fuelCmd}/>
          <div className={styles.fuelCarb}>{seg.carbTarget}g carb target</div>
        </div>

        {/* Risk note */}
        {seg.riskNote && (
          <div className={styles.riskNote}>
            <span className={styles.riskIcon}>⚠</span>
            {seg.riskNote}
          </div>
        )}

        {/* Footer stats */}
        <div className={styles.raceFooter}>
          <div className={styles.footerStat}>
            <span className={styles.footerVal}>{remainingKm}km</span>
            <span className={styles.footerKey}>remaining</span>
          </div>
          <div className={styles.footerStat}>
            <span className={styles.footerVal}>{fmt(blueprint.targetMinutes)}</span>
            <span className={styles.footerKey}>target finish</span>
          </div>
          <div className={styles.footerStat}>
            <span className={styles.footerVal}>{Math.max(0, cpsLeft)}</span>
            <span className={styles.footerKey}>CPs left</span>
          </div>
        </div>
      </div>

      {/* Start Race button (shown before GPS started) */}
      {!geoState.watching && (
        <div className={styles.startOverlay}>
          <button className={styles.startBtn} onClick={startRace}>
            <span className={styles.startIcon}>◉</span>
            Start Race — Enable GPS
          </button>
          <p className={styles.startNote}>
            GPS will auto-detect CP arrivals and silently recalculate ETAs.
          </p>
        </div>
      )}

      {/* Silent recalc toast */}
      <RecalcToast recalc={lastRecalc} onDismiss={() => setLastRecalc(null)}/>

      {/* Swipe hint */}
      <div className={styles.swipeHint} aria-hidden="true">
        {activeIdx > 0 && <span>‹ prev</span>}
        {!isLast && <span style={{marginLeft:'auto'}}>next ›</span>}
      </div>
    </div>
  )
}
