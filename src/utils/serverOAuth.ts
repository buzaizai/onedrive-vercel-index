import axios from 'axios'

import apiConfig from '../../config/api.config'
import serverApiConfig from '../../config/server-api.config'

// Exchange the authorization code on the server, where the client secret is available.
export async function requestTokenWithAuthCode(
  code: string
): Promise<
  | { expiryTime: string; accessToken: string; refreshToken: string }
  | { error: string; errorDescription: string; errorUri: string }
> {
  const { clientId, redirectUri, authApi } = apiConfig
  const { clientSecret } = serverApiConfig

  if (!clientId || !clientSecret) {
    return {
      error: 'missing_oauth_configuration',
      errorDescription: 'Set NEXT_PUBLIC_MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in Vercel.',
      errorUri: '',
    }
  }

  const params = new URLSearchParams()
  params.append('client_id', clientId)
  params.append('redirect_uri', redirectUri)
  params.append('client_secret', clientSecret)
  params.append('code', code)
  params.append('grant_type', 'authorization_code')

  return axios
    .post(authApi, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    .then(resp => {
      const { expires_in, access_token, refresh_token } = resp.data
      return { expiryTime: expires_in, accessToken: access_token, refreshToken: refresh_token }
    })
    .catch(err => {
      const { error, error_description, error_uri } = err.response?.data ?? {}
      return { error, errorDescription: error_description, errorUri: error_uri }
    })
}
