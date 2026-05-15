'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import styles from '../auth.module.css'

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
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

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, locale }),
    })
    const data = await res.json()

    if (!res.ok) {
      setLoading(false)
      setError(data.error === 'Email already registered' ? t.errorExists : t.errorGeneric)
      return
    }

    // Auto sign-in after registration
    await signIn('credentials', { email, password, redirect: false })
    router.push('/onboarding')
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

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>{t.nameLabel}</label>
            <input
              type="text" value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t.namePlaceholder}
              autoComplete="name"
            />
          </div>
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
              type="password" value={password} required minLength={8}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <span className={styles.fieldHint}>{t.passwordHint}</span>
          </div>
          <button type="submit" className={styles.primaryBtn} disabled={loading}>
            {loading ? '…' : t.registerBtn}
          </button>
        </form>

        <div className={styles.divider}><span>{t.orContinueWith}</span></div>

        <button className={styles.googleBtn} onClick={handleGoogle}>
          <GoogleIcon />
          {t.google}
        </button>

        <p className={styles.switchText}>
          {t.hasAccount}{' '}
          <Link href="/login">{t.login}</Link>
        </p>
      </div>
    </div>
  )
}

const STRINGS = {
  en: {
    title: 'Create your account',
    nameLabel: 'Name', namePlaceholder: 'Your name',
    emailLabel: 'Email', passwordLabel: 'Password',
    passwordHint: 'At least 8 characters',
    registerBtn: 'Create account',
    orContinueWith: 'Or continue with',
    google: 'Continue with Google',
    hasAccount: 'Already have an account?', login: 'Log in →',
    errorExists: 'Email already registered.',
    errorGeneric: 'Registration failed. Please try again.',
  },
  zh: {
    title: '创建账号',
    nameLabel: '姓名', namePlaceholder: '你的名字',
    emailLabel: '邮箱', passwordLabel: '密码',
    passwordHint: '至少 8 位字符',
    registerBtn: '创建账号',
    orContinueWith: '或通过以下方式继续',
    google: '使用 Google 登录',
    hasAccount: '已有账号？', login: '去登录 →',
    errorExists: '该邮箱已注册。',
    errorGeneric: '注册失败，请重试。',
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
