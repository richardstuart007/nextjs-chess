import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(process.cwd(), '.env') })

const secret = process.env.CRON_SECRET
const port = process.env.PORT ?? '3020'

if (!secret) {
  console.error('CRON_SECRET not set in .env')
  process.exit(1)
}

console.log(`Calling http://localhost:${port}/api/cron/sync ...`)

const res = await fetch(`http://localhost:${port}/api/cron/sync`, {
  headers: { Authorization: `Bearer ${secret}` }
})

const data = await res.json()
console.log(JSON.stringify(data, null, 2))
