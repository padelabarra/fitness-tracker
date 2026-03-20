'use client'

import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export function SignOutButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2 px-3 text-zinc-400 hover:text-zinc-50"
      onClick={() => signOut({ callbackUrl: '/login' })}
    >
      <LogOut size={14} />
      Sign out
    </Button>
  )
}
