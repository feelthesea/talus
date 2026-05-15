import { Suspense } from 'react'
import RaceModePage from './page'

export default function RaceModeLayout() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100dvh', background: '#0a0c08',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{
          width: 32, height: 32, border: '2px solid #333',
          borderTopColor: '#97C459', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
      </div>
    }>
      <RaceModePage />
    </Suspense>
  )
}
