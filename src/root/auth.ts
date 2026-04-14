import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { authConfig } from './auth.config'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { table_fetch } from 'nextjs-shared/table_fetch'

const functionName = 'auth'

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut
} = NextAuth({
  trustHost: true,
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = z
          .object({ email: z.string().email(), password: z.string().min(1) })
          .safeParse(credentials)

        if (!parsed.success) return null

        const { email, password } = parsed.data

        try {
          const pwdRows = await table_fetch({
            caller: functionName,
            table: 'tup_userspwd',
            whereColumnValuePairs: [{ column: 'up_email', value: email }]
          })
          const pwdRecord = pwdRows[0]
          if (!pwdRecord) return null

          const passwordsMatch = await bcrypt.compare(password, pwdRecord.up_hash)
          if (!passwordsMatch) return null

          const userRows = await table_fetch({
            caller: functionName,
            table: 'tus_users',
            whereColumnValuePairs: [{ column: 'us_email', value: email }]
          })
          const userRecord = userRows[0]
          if (!userRecord) return null

          return {
            id: userRecord.us_usid.toString(),
            name: userRecord.us_name,
            email: userRecord.us_email
          }
        } catch (error) {
          console.error('Authorization error:', error)
          return null
        }
      }
    })
  ]
})
