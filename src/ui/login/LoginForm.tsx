'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import { loginAction } from './action'
import { ExclamationCircleIcon } from '@heroicons/react/24/outline'

export default function LoginForm() {
  const router = useRouter()
  const [state, formAction] = useActionState(loginAction, undefined)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (state?.success) {
      router.push('/')
      router.refresh()
    }
    if (state?.message) {
      setPending(false)
    }
  }, [state, router])

  return (
    <form
      action={formAction}
      onSubmit={() => setPending(true)}
      className='space-y-4'
    >
      <div className='flex-1 rounded-lg bg-gray-50 px-6 pb-6 pt-8'>
        <h1 className='mb-6 text-2xl font-bold text-gray-900'>Chess Analyzer Login</h1>

        <div className='space-y-4'>
          <div>
            <label className='mb-1 block text-xs font-medium text-gray-900' htmlFor='email'>
              Email
            </label>
            <MyInput
              id='email'
              type='email'
              name='email'
              placeholder='Enter your email address'
              autoComplete='email'
              disabled={pending}
              overrideClass='block w-full rounded-md border border-gray-200 py-2 text-sm outline-2 placeholder:text-gray-500'
            />
          </div>

          <div>
            <label className='mb-1 block text-xs font-medium text-gray-900' htmlFor='password'>
              Password
            </label>
            <MyInput
              id='password'
              type='password'
              name='password'
              placeholder='Enter password'
              autoComplete='current-password'
              disabled={pending}
              overrideClass='block w-full rounded-md border border-gray-200 py-2 text-sm outline-2 placeholder:text-gray-500'
            />
          </div>

          <div className='flex h-6 items-center' aria-live='polite' aria-atomic='true'>
            {state?.message && !pending && (
              <>
                <ExclamationCircleIcon className='mr-1 h-5 w-5 text-red-500' />
                <p className='text-sm text-red-500'>{state.message}</p>
              </>
            )}
          </div>

          <MyButton
            type='submit'
            disabled={pending}
            overrideClass='w-full flex justify-center'
          >
            {pending ? 'Signing in...' : 'Login'}
          </MyButton>
        </div>
      </div>
    </form>
  )
}
