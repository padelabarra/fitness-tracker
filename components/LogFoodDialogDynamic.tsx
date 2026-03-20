'use client'

import dynamic from 'next/dynamic'

export const LogFoodDialog = dynamic(
  () => import('./LogFoodDialog').then(m => m.LogFoodDialog),
  { ssr: false }
)
