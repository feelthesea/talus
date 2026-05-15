import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getActivityDetail, getActivityStreams } from '@/lib/strava'
import { runDiagnostics } from '@/lib/diagnostics'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { activityId, userVAM } = await req.json()
  if (!activityId) {
    return NextResponse.json({ error: 'activityId required' }, { status: 400 })
  }

  try {
    const [activity, streams] = await Promise.all([
      getActivityDetail(activityId, session.accessToken),
      getActivityStreams(activityId, session.accessToken),
    ])

    const diagnostics = runDiagnostics(activity, streams, userVAM)

    return NextResponse.json({
      activity: {
        id: activity.id,
        name: activity.name,
        date: activity.start_date,
        distanceKm: Math.round(activity.distance / 100) / 10,
        movingTime: activity.moving_time,
        elevationGain: Math.round(activity.total_elevation_gain),
        hasHeartrate: activity.has_heartrate,
        avgHR: activity.average_heartrate,
        maxHR: activity.max_heartrate,
      },
      diagnostics,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
