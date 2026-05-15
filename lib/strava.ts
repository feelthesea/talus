const STRAVA_BASE = 'https://www.strava.com/api/v3'

export function getStravaAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/callback`,
    response_type: 'code',
    scope: 'read,activity:read_all,profile:read_all',
  })
  return `https://www.strava.com/oauth/authorize?${params}`
}

export async function exchangeToken(code: string): Promise<{
  access_token: string
  athlete: { id: number; firstname: string; lastname: string }
}> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error('Token exchange failed')
  return res.json()
}

export async function getAthleteStats(athleteId: number, accessToken: string) {
  const res = await fetch(`${STRAVA_BASE}/athletes/${athleteId}/stats`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch athlete stats')
  return res.json()
}

export async function getRecentActivities(accessToken: string, perPage = 50) {
  const res = await fetch(
    `${STRAVA_BASE}/athlete/activities?per_page=${perPage}&type=Run`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error('Failed to fetch activities')
  return res.json()
}

export async function getRaceActivities(accessToken: string): Promise<StravaActivity[]> {
  // workout_type 2 = race in Strava
  const res = await fetch(
    `${STRAVA_BASE}/athlete/activities?per_page=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error('Failed to fetch activities')
  const all = await res.json()
  return all.filter((a: StravaActivity) =>
    a.workout_type === 2 ||
    a.name?.toLowerCase().includes('race') ||
    a.name?.toLowerCase().includes('utmb') ||
    a.name?.toLowerCase().includes('cdh') ||
    a.name?.toLowerCase().includes('ccc') ||
    a.name?.toLowerCase().includes('tor') ||
    a.name?.toLowerCase().includes('marathon') ||
    a.name?.toLowerCase().includes('trail') ||
    a.name?.toLowerCase().includes('course')
  )
}

export async function getActivityStreams(activityId: number, accessToken: string): Promise<StravaStreams> {
  const keys = 'time,distance,heartrate,velocity_smooth,altitude,grade_smooth'
  const res = await fetch(
    `${STRAVA_BASE}/activities/${activityId}/streams?keys=${keys}&key_by_type=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error('Failed to fetch streams')
  return res.json()
}

export async function getActivityDetail(activityId: number, accessToken: string): Promise<StravaActivity> {
  const res = await fetch(
    `${STRAVA_BASE}/activities/${activityId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error('Failed to fetch activity')
  return res.json()
}

export interface StravaActivity {
  id: number
  name: string
  distance: number
  moving_time: number
  elapsed_time: number
  total_elevation_gain: number
  start_date: string
  workout_type: number
  average_heartrate?: number
  max_heartrate?: number
  average_speed: number
  has_heartrate: boolean
  map?: { summary_polyline: string }
}

export interface StravaStreams {
  time?: { data: number[] }
  distance?: { data: number[] }
  heartrate?: { data: number[] }
  velocity_smooth?: { data: number[] }
  altitude?: { data: number[] }
  grade_smooth?: { data: number[] }
}
