import { NextResponse } from 'next/server'
import { getStravaAuthUrl } from '@/lib/strava'

export async function GET() {
  const url = getStravaAuthUrl()
  return NextResponse.redirect(url)
}
