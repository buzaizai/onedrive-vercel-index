import type { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'

import apiConfig from '../../../config/api.config'
import siteConfig from '../../../config/site.config'
import { requestTokenWithAuthCode } from '../../utils/serverOAuth'
import { storeOdAuthTokens } from '../../utils/odAuthTokenStore'

type ResponseBody = { ok: true; expiresIn: number } | { error: string }

/**
 * Complete the one-time OAuth code exchange on the server.
 *
 * Access and refresh tokens never leave this function: they are checked against
 * the configured OneDrive owner and written directly to Redis.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<ResponseBody>) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }

  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : ''
  if (!code || code.length > 4096) {
    res.status(400).json({ error: 'Invalid authorization code.' })
    return
  }

  if (!siteConfig.userPrincipalName) {
    res.status(500).json({ error: 'The OneDrive owner is not configured.' })
    return
  }

  const tokenResponse = await requestTokenWithAuthCode(code)
  if ('error' in tokenResponse) {
    res.status(400).json({ error: tokenResponse.errorDescription || tokenResponse.error })
    return
  }

  try {
    const profileApi = apiConfig.driveApi.replace('/drive', '')
    const profile = await axios.get(profileApi, {
      headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
    })
    if (profile.data?.userPrincipalName !== siteConfig.userPrincipalName) {
      res.status(403).json({ error: 'The Microsoft account does not own this OneDrive.' })
      return
    }

    const expiresIn = Number.parseInt(tokenResponse.expiryTime, 10)
    if (!Number.isFinite(expiresIn) || expiresIn <= 0 || !tokenResponse.refreshToken) {
      res.status(502).json({ error: 'Microsoft returned an incomplete token response.' })
      return
    }

    await storeOdAuthTokens({
      accessToken: tokenResponse.accessToken,
      accessTokenExpiry: expiresIn,
      refreshToken: tokenResponse.refreshToken,
    })
    res.status(200).json({ ok: true, expiresIn })
  } catch (error: any) {
    const status = error?.response?.status === 401 ? 401 : 502
    res.status(status).json({ error: 'Microsoft account verification failed.' })
  }
}
