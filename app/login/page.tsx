'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import styles from '../auth.module.css'

export default function LoginPage() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [locale, setLocale] = useState<'en'|'zh'>('en')

  const t = STRINGS[locale]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('credentials', {
      email, password, redirect: false,
    })
    setLoading(false)
    if (res?.error) {
      setError(t.errorInvalid)
    } else {
      router.push('/onboarding')
    }
  }

  async function handleGoogle() {
    await signIn('google', { callbackUrl: '/onboarding' })
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <a href="/" className={styles.logo}>
            <span className={styles.logoMark}>T</span>
            <span className={styles.logoName}>Talus</span>
          </a>
          <button
            className={styles.localeSwitcher}
            onClick={() => setLocale(l => l === 'en' ? 'zh' : 'en')}
          >
            {locale === 'en' ? '中文' : 'EN'}
          </button>
        </div>

        <h1 className={styles.title}>{t.title}</h1>

        {error && <div className={styles.errorBox}>{error}</div>}
        {params.get('error') && !error && (
          <div className={styles.errorBox}>{t.errorGeneric}</div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>{t.emailLabel}</label>
            <input
              type="email" value={email} required
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>{t.passwordLabel}</label>
            <input
              type="password" value={password} required
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className={styles.primaryBtn} disabled={loading}>
            {loading ? '…' : t.loginBtn}
          </button>
        </form>

        <div className={styles.divider}><span>{t.orContinueWith}</span></div>

        <button className={styles.googleBtn} onClick={handleGoogle}>
          <GoogleIcon />
          {t.google}
        </button>

        <div className={styles.stravaRow}>
          <a href="/api/auth/strava" className={styles.stravaBtn}>
            <StravaIcon />
            {t.stravaConnect}
          </a>
        </div>

        <p className={styles.switchText}>
          {t.noAccount}{' '}
          <Link href="/register">{t.register}</Link>
        </p>
      </div>
    </div>
  )
}

const STRINGS = {
  en: {
    title: 'Log in to Talus',
    emailLabel: 'Email',
    passwordLabel: 'Password',
    loginBtn: 'Log in',
    orContinueWith: 'Or continue with',
    google: 'Continue with Google',
    stravaConnect: 'Connect with Strava',
    noAccount: "Don't have an account?",
    register: 'Create one →',
    errorInvalid: 'Invalid email or password.',
    errorGeneric: 'Login failed. Please try again.',
  },
  zh: {
    title: '登录 Talus',
    emailLabel: '邮箱',
    passwordLabel: '密码',
    loginBtn: '登录',
    orContinueWith: '或通过以下方式继续',
    google: '使用 Google 登录',
    stravaConnect: '连接 Strava',
    noAccount: '还没有账号？',
    register: '立即注册 →',
    errorInvalid: '邮箱或密码错误。',
    errorGeneric: '登录失败，请重试。',
  },
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"/>
    </svg>
  )
}

function StravaIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
    </svg>
  )
}
