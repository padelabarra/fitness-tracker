import Link from 'next/link'
import { Activity, BarChart2, Heart, Map } from 'lucide-react'
import { auth } from '@/auth'
import { SignOutButton } from '@/components/SignOutButton'

const navItems = [
  { href: '/',             label: 'Overview',     icon: Activity },
  { href: '/running',      label: 'Running',      icon: Map },
  { href: '/nutrition',    label: 'Nutrition',    icon: Heart },
  { href: '/consistency',  label: 'Consistency',  icon: BarChart2 },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex flex-col w-56 border-r border-zinc-800 p-4 gap-1">
        <div className="px-2 py-4 mb-2">
          <h1 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Fitness</h1>
        </div>
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors"
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}

        {/* User info + logout pinned to bottom */}
        <div className="mt-auto pt-4 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 px-3 mb-2 truncate">{session?.user?.name}</p>
          <SignOutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 pb-24 md:pb-0">
        {children}
      </main>

      {/* Bottom tabs — mobile */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden border-t border-zinc-800 bg-zinc-900 flex pb-[env(safe-area-inset-bottom)]">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center gap-1 py-3 text-xs text-zinc-400 hover:text-zinc-50"
          >
            <Icon size={20} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
