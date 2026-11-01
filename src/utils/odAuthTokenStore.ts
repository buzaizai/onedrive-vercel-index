import Redis from 'ioredis'

import siteConfig from '../../config/site.config'

type RedisCommand = Array<string | number>

const restUrl = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '')
const restToken = process.env.UPSTASH_REDIS_REST_TOKEN
const rawRedisUrl = process.env.REDIS_URL?.trim()
const redisUrl = rawRedisUrl?.startsWith('redis://') && rawRedisUrl.includes('.upstash.io')
  ? `rediss://${rawRedisUrl.slice('redis://'.length)}`
  : rawRedisUrl
const redisHost = process.env.REDIS_HOST?.trim()
const redisPort = Number.parseInt(process.env.REDIS_PORT || '6379', 10)
const redisTls = process.env.REDIS_TLS?.toLowerCase() !== 'false'
const hasDirectRedis = Boolean(redisUrl || redisHost)
let legacyRedis: Redis | undefined
let legacyConnectPromise: Promise<void> | undefined

function tokenKey(name: string) {
  return `${siteConfig.kvPrefix}${name}`
}

async function runRestCommand(command: RedisCommand): Promise<unknown> {
  if (!restUrl || !restToken) throw new Error('Upstash REST configuration is incomplete.')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(restUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${restToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Upstash REST returned HTTP ${response.status}.`)
    const payload = (await response.json()) as { result?: unknown; error?: string }
    if (payload.error) throw new Error(`Upstash REST command failed: ${payload.error}`)
    return payload.result
  } finally {
    clearTimeout(timeout)
  }
}

function getLegacyRedis() {
  if (!hasDirectRedis) throw new Error('No Redis storage configuration is present.')
  if (!legacyRedis) {
    const options = {
      lazyConnect: true,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    }
    if (redisUrl) {
      legacyRedis = new Redis(redisUrl, options)
    } else {
      legacyRedis = new Redis({
        host: redisHost as string,
        port: Number.isFinite(redisPort) ? redisPort : 6379,
        username: process.env.REDIS_USERNAME?.trim() || undefined,
        password: process.env.REDIS_PASSWORD || undefined,
        tls: redisTls ? { servername: redisHost as string } : undefined,
        ...options,
      })
    }
    legacyRedis.on('error', error => {
      console.error('Legacy Redis connection failed:', error instanceof Error ? error.message : 'unknown error')
    })
  }
  return legacyRedis
}

async function runLegacyCommand(command: RedisCommand): Promise<unknown> {
  const redis = getLegacyRedis()
  if (!legacyConnectPromise) {
    legacyConnectPromise = redis.connect().catch(error => {
      legacyConnectPromise = undefined
      throw error
    })
  }
  await legacyConnectPromise
  return redis.call(...(command as [string, ...Array<string | number>]))
}

async function runCommand(command: RedisCommand): Promise<unknown> {
  if (hasDirectRedis) {
    try {
      return await runLegacyCommand(command)
    } catch (legacyError) {
      if (!restUrl || !restToken) throw legacyError
      console.error('Direct Redis failed; trying Upstash REST fallback.')
    }
  }
  if (restUrl && restToken) return runRestCommand(command)
  throw new Error('No usable Redis storage configuration is present.')
}

export async function getOdAuthTokens(): Promise<{ accessToken: unknown; refreshToken: unknown }> {
  const [accessToken, refreshToken] = await Promise.all([
    runCommand(['GET', tokenKey('access_token')]),
    runCommand(['GET', tokenKey('refresh_token')]),
  ])
  return { accessToken, refreshToken }
}

export async function storeOdAuthTokens({
  accessToken,
  accessTokenExpiry,
  refreshToken,
}: {
  accessToken: string
  accessTokenExpiry: number
  refreshToken: string
}): Promise<void> {
  await Promise.all([
    runCommand(['SET', tokenKey('access_token'), accessToken, 'EX', accessTokenExpiry]),
    runCommand(['SET', tokenKey('refresh_token'), refreshToken]),
  ])
}

export async function clearOdAuthTokens(): Promise<void> {
  await runCommand(['DEL', tokenKey('access_token'), tokenKey('refresh_token')])
}
