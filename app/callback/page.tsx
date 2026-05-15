'use client'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function CallbackPage() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const code = params.get('code')
    const error = params.get('error')

    if (error || !code) {
      router.replace('/?error=strava_denied')
      return
    }

    // Relay to the API route which handles token exchange
    fetch(`/api/auth/callback?code=${code}&scope=${params.get('scope') || ''}`)
      .then(res => {
        if (res.redirected) window.location.href = res.url
        else router.replace('/blueprint')
      })
      .catch(() => router.replace('/?error=auth_failed'))
  }, [params, router])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '1rem',
      fontFamily: '-apple-system, sans-serif',
    }}>
      <div style={{
        width: 32, height: 32, border: '2px solid #eee',
        borderTopColor: '#3B6D11', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ fontSize: 14, color: '#888' }}>Connecting your Strava account…</p>
    </div>
  )
}
