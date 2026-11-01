import Head from 'next/head'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/router'

export default function SiteLogin() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const next = typeof router.query.next === 'string' && router.query.next.startsWith('/') ? router.query.next : '/'

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    const response = await fetch('/api/site-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setError(payload.error || '登录失败')
      return
    }
    window.location.assign(next)
  }

  return (
    <>
      <Head>
        <title>网站访问</title>
      </Head>
      <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4 dark:bg-gray-900">
        <form onSubmit={submit} className="w-full max-w-sm rounded-xl bg-white p-6 shadow dark:bg-gray-800">
          <h1 className="mb-2 text-xl font-semibold dark:text-white">请输入访问密码</h1>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-300">密码只用于进入当前网站。</p>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            className="mb-3 w-full rounded border p-2 dark:bg-gray-700 dark:text-white"
            autoComplete="current-password"
          />
          {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
          <button type="submit" className="w-full rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-500">
            进入
          </button>
        </form>
      </main>
    </>
  )
}
