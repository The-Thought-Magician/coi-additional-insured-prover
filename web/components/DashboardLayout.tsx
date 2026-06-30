'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth/client'

type NavItem = { label: string; href: string }
type NavSection = { title: string; items: NavItem[] }

const NAV: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Reports', href: '/dashboard/reports' },
    ],
  },
  {
    title: 'Compliance',
    items: [
      { label: 'Certificates', href: '/dashboard/certificates' },
      { label: 'Deficiencies', href: '/dashboard/deficiencies' },
      { label: 'Coverage Gaps', href: '/dashboard/coverage-gaps' },
      { label: 'Evidence Packs', href: '/dashboard/evidence-packs' },
    ],
  },
  {
    title: 'Registry',
    items: [
      { label: 'Vendors', href: '/dashboard/vendors' },
      { label: 'Projects', href: '/dashboard/projects' },
      { label: 'Carriers', href: '/dashboard/carriers' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { label: 'Requirement Templates', href: '/dashboard/templates' },
      { label: 'Waivers', href: '/dashboard/waivers' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Renewals', href: '/dashboard/renewals' },
      { label: 'Tasks', href: '/dashboard/tasks' },
      { label: 'Notifications', href: '/dashboard/notifications' },
      { label: 'Activity Log', href: '/dashboard/activity' },
    ],
  },
  {
    title: 'Account',
    items: [{ label: 'Settings', href: '/dashboard/settings' }],
  },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(href + '/')
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [workspaceName, setWorkspaceName] = useState('Workspace')
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await authClient.getSession()
      if (cancelled) return
      if (!s?.data?.user) {
        router.push('/auth/sign-in')
        return
      }
      const user: any = s.data.user
      if (user?.name) setWorkspaceName(user.name)
      else if (user?.email) setWorkspaceName(String(user.email).split('@')[0])
      setChecking(false)
    })()
    return () => { cancelled = true }
  }, [router])

  useEffect(() => { setMobileOpen(false) }, [pathname])

  const signOut = async () => {
    await authClient.signOut()
    router.push('/')
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex items-center gap-2 text-slate-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-amber-400" />
          Loading...
        </div>
      </div>
    )
  }

  const sidebar = (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5">
      <Link href="/dashboard" className="px-2 text-lg font-bold tracking-tight text-amber-400">
        Coi<span className="text-white">AI</span>Prover
      </Link>
      <div className="flex flex-col gap-5">
        {NAV.map((section) => (
          <div key={section.title}>
            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              {section.title}
            </div>
            <div className="flex flex-col">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-lg px-2 py-1.5 text-sm transition-colors ${
                      active
                        ? 'bg-amber-500/15 font-medium text-amber-300'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-slate-800 bg-slate-900/60 lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/70" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-slate-800 bg-slate-900">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg border border-slate-700 px-2 py-1 text-slate-300 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              ☰
            </button>
            <span className="text-sm font-medium text-slate-300">{workspaceName}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 sm:inline">CoiAdditionalInsuredProver</span>
            <button
              onClick={signOut}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
