import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getRaceActivities } from '@/lib/strava'

export async function GET() {
  const session = await getSession()
  if (!session.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const races = await getRaceActivities(session.accessToken)
    const simplified = races.slice(0, 20).map(r => ({
      id: r.id,
      name: r.name,
      date: r.start_date,
      distanceKm: Math.round(r.distance / 100) / 10,
      movingTime: r.moving_time,
      elevationGain: Math.round(r.total_elevation_gain),
      hasHeartrate: r.has_heartrate,
      avgHR: r.average_heartrate,
    }))
    return NextResponse.json({ races: simplified })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch races' }, { status: 500 })
  }
}
