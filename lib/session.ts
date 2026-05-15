import { getIronSession, IronSession } from 'iron-session'
import { cookies } from 'next/headers'

export interface SessionData {
  accessToken?: string
  athleteId?: number
  athleteName?: string
  athleteStats?: {
    recentRunDistance: number
    ytdRunDistance: number
    allRunDistance: number
  }
}

const sessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: 'talus_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
  },
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  return session
}
