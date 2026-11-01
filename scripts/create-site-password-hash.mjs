import { randomBytes, scryptSync } from 'node:crypto'
const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const password = Buffer.concat(chunks).toString('utf8').trim()
if (!password) throw new Error('Pass the password on stdin.')

const n = 16_384
const r = 8
const p = 1
const salt = randomBytes(16)
const hash = scryptSync(password, salt, 32, { N: n, r, p, maxmem: 32 * 1024 * 1024 })
process.stdout.write(`scrypt$${n}$${r}$${p}$${salt.toString('base64url')}$${hash.toString('base64url')}\n`)
