import { NextRequest, NextResponse } from 'next/server'
import { exchangeToken, getAthleteStats } from '@/lib/strava'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const base = process.env.NEXT_PUBLIC_BASE_URL!

  if (error || !code) {
    return NextResponse.redirect(`${base}?error=strava_denied`)
  }

  try {
    const tokenData = await exchangeToken(code)
    const stats = await getAthleteStats(tokenData.athlete.id, tokenData.access_token)

    const session = await getSession()
    session.accessToken = tokenData.access_token
    session.athleteId = tokenData.athlete.id
    session.athleteName = `${tokenData.athlete.firstname} ${tokenData.athlete.lastname}`
    session.athleteStats = {
      recentRunDistance: Math.round(stats.recent_run_totals?.distance / 1000) || 0,
      ytdRunDistance: Math.round(stats.ytd_run_totals?.distance / 1000) || 0,
      allRunDistance: Math.round(stats.all_run_totals?.distance / 1000) || 0,
    }
    await session.save()

    return NextResponse.redirect(`${base}/blueprint`)
  } catch (err) {
    console.error('OAuth callback error:', err)
    return NextResponse.redirect(`${base}?error=auth_failed`)
  }
}
