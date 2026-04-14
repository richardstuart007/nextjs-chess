/**
 * Create a user for login.
 * Usage: npm run create-user -- <name> <email> <password>
 * Example: npm run create-user -- Richard richard@example.com mypassword
 */

import { Client } from 'pg'
import bcrypt from 'bcryptjs'
import { config } from 'dotenv'

config()

async function createUser() {
  const [, , name, email, password] = process.argv

  if (!name || !email || !password) {
    console.error('Usage: npm run create-user -- <name> <email> <password>')
    process.exit(1)
  }

  const connectionString = process.env.POSTGRES_URL
  if (!connectionString) {
    console.error('POSTGRES_URL is not set.')
    process.exit(1)
  }

  const client = new Client({ connectionString })

  try {
    await client.connect()

    const hash = await bcrypt.hash(password, 10)

    await client.query(
      `INSERT INTO tus_users (us_name, us_email) VALUES ($1, $2) ON CONFLICT (us_email) DO UPDATE SET us_name = $1`,
      [name, email.toLowerCase()]
    )

    await client.query(
      `INSERT INTO tup_userspwd (up_email, up_hash) VALUES ($1, $2) ON CONFLICT (up_email) DO UPDATE SET up_hash = $2`,
      [email.toLowerCase(), hash]
    )

    console.log(`User '${name}' (${email}) created/updated successfully.`)
  } catch (error) {
    console.error('Failed to create user:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

createUser()
