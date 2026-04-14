'use server'

import { z } from 'zod'
import { signIn } from '@/auth'
import { AuthError } from 'next-auth'

const Schema = z.object({
  email: z.string().email().toLowerCase().min(1),
  password: z.string().min(1)
})

export type LoginState = {
  message?: string | null
  success?: boolean
}

export async function loginAction(
  _prevState: LoginState | undefined,
  formData: FormData
): Promise<LoginState> {
  const validated = Schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password')
  })

  if (!validated.success) {
    return { message: 'Invalid email or password.' }
  }

  try {
    await signIn('credentials', {
      email: validated.data.email,
      password: validated.data.password,
      redirect: false
    })
    return { success: true }
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: 'Invalid email or password.' }
    }
    throw error
  }
}
