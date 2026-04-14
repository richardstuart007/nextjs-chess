import { Metadata } from 'next'
import LoginForm from '@/src/ui/login/LoginForm'

export const metadata: Metadata = {
  title: 'Login | Chess Analyzer'
}

export default function LoginPage() {
  return (
    <main className='flex min-h-screen items-center justify-center'>
      <div className='w-full max-w-[400px] px-4'>
        <LoginForm />
      </div>
    </main>
  )
}
