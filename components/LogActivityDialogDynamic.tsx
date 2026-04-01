'use client'

import dynamic from 'next/dynamic'

export const LogActivityDialog = dynamic(
  () => import('./LogActivityDialog').then(m => m.LogActivityDialog),
  { ssr: false }
)
