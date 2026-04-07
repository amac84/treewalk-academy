import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const candidates = [
  join(root, 'app', '.env'),
  join(process.cwd(), '.env'),
  join(process.cwd(), 'app', '.env'),
]
const envPath = candidates.find((p) => existsSync(p))
if (!envPath) {
  console.error('No .env found. Tried:\n', candidates.map((p) => `  ${p}`).join('\n'))
  process.exit(1)
}
const lines = readFileSync(envPath, 'utf8').split(/\r?\n/)

/** @type {Record<string, string>} */
const env = {}
for (const line of lines) {
  const i = line.indexOf('=')
  if (i === -1) continue
  const key = line.slice(0, i).trim()
  env[key] = line.slice(i + 1).trim()
}

const pass = env.SUPABASE_DATABASE_PASSWORD
const supabaseUrl = env.VITE_SUPABASE_URL
if (!pass || !supabaseUrl) {
  console.error('Need SUPABASE_DATABASE_PASSWORD and VITE_SUPABASE_URL in .env')
  console.error(`Using file: ${envPath}`)
  console.error(`Keys found: ${Object.keys(env).join(', ') || '(none)'}`)
  process.exit(1)
}

const refMatch = supabaseUrl.match(/^https:\/\/([^.]+)\.supabase\.co/)
if (!refMatch) {
  console.error('VITE_SUPABASE_URL must be like https://<project-ref>.supabase.co')
  process.exit(1)
}
const projectRef = refMatch[1]
const encoded = encodeURIComponent(pass)
const dbUrl = `postgresql://postgres:${encoded}@db.${projectRef}.supabase.co:5432/postgres`

const result = spawnSync('npx', ['supabase', 'db', 'push', '--db-url', dbUrl], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  windowsHide: true,
})
process.exit(result.status ?? 1)
