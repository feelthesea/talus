import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Detect preferred locale from Accept-Language header (for unauthenticated users)
  if (pathname === '/' && !req.cookies.get('talus_locale')) {
    const acceptLang = req.headers.get('accept-language') || ''
    const prefersChinese = acceptLang.toLowerCase().includes('zh')
    if (prefersChinese) {
      const res = NextResponse.next()
      res.cookies.set('talus_locale', 'zh', { maxAge: 60 * 60 * 24 * 365 })
      return res
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
