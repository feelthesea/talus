'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './page.module.css'

export default function Home() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error')) setError('Connection failed. Please try again.')

    fetch('/api/session')
      .then(r => r.json())
      .then(data => {
        if (data.authenticated) router.replace('/blueprint')
        else setChecking(false)
      })
      .catch(() => setChecking(false))
  }, [router])

  function useDemoMode() {
    localStorage.setItem('talus_demo', '1')
    router.push('/blueprint')
  }

  if (checking) return (
    <div className={styles.loadingScreen}>
      <div className={styles.spinner} />
    </div>
  )

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.logoMark}>T</div>
          <div>
            <div className={styles.logoName}>Talus</div>
            <div className={styles.logoSub}>Race Blueprint Engine</div>
          </div>
        </header>

        <section className={styles.hero}>
          <h1 className={styles.heroTitle}>
            Your race,<br />computed.
          </h1>
          <p className={styles.heroBody}>
            Talus translates your physiological data and race terrain into a
            precise execution blueprint — HR-anchored pacing, segment-by-segment
            fueling, and offline recalculation when the plan breaks.
          </p>
        </section>

        <div className={styles.pillars}>
          <div className={styles.pillar}>
            <span className={styles.pillarIcon}>◎</span>
            <div className={styles.pillarText}>
              <strong>Physiological anchoring</strong>
              LTHR, VAM, aerobic decoupling — your real limits, not generic zones.
            </div>
          </div>
          <div className={styles.pillar}>
            <span className={styles.pillarIcon}>◈</span>
            <div className={styles.pillarText}>
              <strong>Terrain-aware nutrition</strong>
              Carb sequencing matched to gradient, gut absorption, and fatigue curve.
            </div>
          </div>
          <div className={styles.pillar}>
            <span className={styles.pillarIcon}>◐</span>
            <div className={styles.pillarText}>
              <strong>Race Mode UI</strong>
              Three elements on screen. Zero taps required. Readable under headlamp.
            </div>
          </div>
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        <div className={styles.authSection}>
          <a href="/api/auth/strava" className={styles.stravaBtn}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
            </svg>
            Connect with Strava
          </a>
          <button onClick={useDemoMode} className={styles.demoBtn}>
            Try with demo data →
          </button>
          <p className={styles.authNote}>
            Strava access is read-only. We never write to your account.
          </p>
        </div>
      </div>
    </main>
  )
}
