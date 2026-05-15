import { Suspense } from 'react'
import CallbackPage from './page'

export default function CallbackLayout() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 14, color: '#888', fontFamily: '-apple-system, sans-serif' }}>Connecting…</p>
      </div>
    }>
      <CallbackPage />
    </Suspense>
  )
}
