# Migration checklist

This branch removes the old Microsoft app registration from source control. The new deployment needs the following Vercel project variables:

| Variable | Environment | Value |
| --- | --- | --- |
| `NEXT_PUBLIC_MICROSOFT_CLIENT_ID` | Production, Preview, Development | New Entra application (client) ID |
| `NEXT_PUBLIC_MICROSOFT_TENANT_ID` | Production, Preview, Development | New Entra directory (tenant) ID, or `common` for the current multi-account flow |
| `MICROSOFT_CLIENT_SECRET` | Production, Preview, Development | New client secret value |
| `NEXT_PUBLIC_MICROSOFT_REDIRECT_URI` | Production, Preview, Development | `http://localhost` unless the OAuth flow is changed to a hosted callback |
| `NEXT_PUBLIC_USER_PRINCIPLE_NAME` | Production, Preview, Development | Microsoft account UPN that owns the OneDrive |
| `UPSTASH_REDIS_REST_URL` | Production, Preview, Development | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Production, Preview, Development | Upstash Redis REST token; keep it server-side |
| `REDIS_URL` | Optional legacy fallback | Existing direct Redis URL, only if REST variables are unavailable |

The token store prefers a working `REDIS_URL` direct connection and falls back to `UPSTASH_REDIS_REST_URL` plus `UPSTASH_REDIS_REST_TOKEN` when direct Redis is unavailable. Standard Redis and Redis Cloud are supported through either `REDIS_URL` (`redis://` or `rediss://`) or the split `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, and `REDIS_TLS` variables. For Upstash direct URLs, use the TLS form `rediss://...:6379`.

Register `http://localhost` as a **Web** redirect URI in the new Entra app. The current OAuth flow opens Microsoft login, then accepts the complete URL returned to the localhost page.

The OAuth code exchange and OneDrive-owner check now run in `/api/oauth`. The browser submits only the one-time authorization code; access and refresh tokens are written directly to Redis and are never rendered into HTML or sent back to client JavaScript. `MICROSOFT_CLIENT_SECRET` must therefore remain a Vercel server environment variable and must not be committed to GitHub.

Before switching Vercel's Git connection, preserve the existing Redis values and token store. After the first deployment, open `/onedrive-vercel-index-oauth/step-1`, verify the new client ID and redirect URI, complete OAuth, and confirm the root listing and a protected route.
