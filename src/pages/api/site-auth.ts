import type { NextApiRequest, NextApiResponse } from 'next'
import { createHmac, scryptSync, timingSafeEqual } from 'crypto'

const COOKIE_NAME = 'site_access'
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60
const attempts = new Map<string, { count: number; resetAt: number }>()

function getClientKey(req: NextApiRequest) {
  const forwarded = req.headers['x-forwarded-for']
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0])?.trim() || req.socket.remoteAddress || 'unknown'
}

function issueCookie(secret: string) {
  const issuedAt = String(Date.now())
  const signature = createHmac('sha256', secret).update(`site-access:${issuedAt}`).digest('base64url')
  return `${COOKIE_NAME}=${issuedAt}.${signature}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`
}

function verifyPassword(password: string, encoded: string) {
  const [algorithm, nText, rText, pText, saltText, hashText] = encoded.trim().split('$')
  if (algorithm !== 'scrypt' || !nText || !rText || !pText || !saltText || !hashText) return false

  const n = Number(nText)
  const r = Number(rText)
  const p = Number(pText)
  const salt = Buffer.from(saltText, 'base64url')
  const expected = Buffer.from(hashText, 'base64url')
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) || !salt.length || !expected.length) return false

  const actual = scryptSync(password, salt, expected.length, { N: n, r, p, maxmem: 32 * 1024 * 1024 })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }

  const expectedHash = process.env.SITE_ACCESS_PASSWORD_HASH
  const cookieSecret = process.env.SITE_ACCESS_COOKIE_SECRET
  if (!expectedHash || !cookieSecret) {
    res.status(503).json({ error: 'Site password is not configured.' })
    return
  }

  const key = getClientKey(req)
  const now = Date.now()
  const current = attempts.get(key)
  if (current && current.resetAt > now && current.count >= 5) {
    res.setHeader('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)))
    res.status(429).json({ error: 'Too many attempts. Try again later.' })
    return
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const valid = verifyPassword(password, expectedHash)
  if (!valid) {
    const next = current && current.resetAt > now ? current : { count: 0, resetAt: now + 10 * 60 * 1000 }
    next.count += 1
    attempts.set(key, next)
    res.status(401).json({ error: 'Invalid password.' })
    return
  }

  attempts.delete(key)
  res.setHeader('Set-Cookie', issueCookie(cookieSecret))
  res.status(200).json({ ok: true })
}
