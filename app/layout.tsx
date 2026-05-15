import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Talus — Race Blueprint Engine',
  description: 'Precision race strategy for serious trail runners. Event blueprints anchored to your physiology.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
