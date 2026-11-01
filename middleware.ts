import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'site_access'
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0))
}

async function verifyCookie(value: string, secret: string) {
  const [issuedAt, signature] = value.split('.')
  const timestamp = Number(issuedAt)
  if (!Number.isFinite(timestamp) || !signature) return false
  if (Date.now() - timestamp > COOKIE_MAX_AGE * 1000 || timestamp > Date.now() + 60_000) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  return crypto.subtle.verify(
    'HMAC',
    key,
    decodeBase64Url(signature),
    new TextEncoder().encode(`site-access:${issuedAt}`)
  )
}

export async function middleware(request: NextRequest) {
  const passwordHash = process.env.SITE_ACCESS_PASSWORD_HASH
  const cookieSecret = process.env.SITE_ACCESS_COOKIE_SECRET

  // The gate is opt-in so local development remains usable before deployment variables are set.
  if (!passwordHash || !cookieSecret) return NextResponse.next()
  if (request.nextUrl.pathname === '/site-login' || request.nextUrl.pathname === '/api/site-auth') {
    return NextResponse.next()
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value
  if (cookie && (await verifyCookie(cookie, cookieSecret))) return NextResponse.next()

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Site password required.' }, { status: 401 })
  }

  const loginUrl = new URL('/site-login', request.url)
  loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|site-login|api/site-auth|images/|icons/|locales/).*)'],
}
