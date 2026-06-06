import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { supabase } from '@/lib/supabase'
import type { Workout } from '@/lib/supabase'
import { ActivityFeed } from '@/components/ActivityFeed'

export default async function ActivitiesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { data } = await supabase
    .from('workouts')
    .select('*')
    .eq('user_id', session.user.id)
    .order('date', { ascending: false })
    .limit(20)

  const activities: Workout[] = data ?? []

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold">Activities</h1>
      <ActivityFeed activities={activities} />
    </div>
  )
}
