'use client'
import { Suspense } from 'react'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className='-mx-4 -my-6'>
      <Suspense>
        {children}
      </Suspense>
    </div>
  )
}
