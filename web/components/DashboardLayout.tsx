'use client'
import { useState, useEffect, useRef } from 'react'
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

// First section rendered inline in the top nav; remaining sections live under an overflow dropdown.
const PRIMARY_SECTIONS = NAV.slice(0, 2)
const OVERFLOW_SECTIONS = NAV.slice(2)

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
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    setMobileOpen(false)
    setMoreOpen(false)
  }, [pathname])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const signOut = async () => {
    await authClient.signOut()
    router.push('/')
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100">
        <div className="flex items-center gap-2 text-stone-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-cyan-500" />
          Loading...
        </div>
      </div>
    )
  }

  const overflowActive = OVERFLOW_SECTIONS.some((section) =>
    section.items.some((item) => isActive(pathname, item.href))
  )

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/95 backdrop-blur">
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg font-bold tracking-tight text-stone-900">
              Coi<span className="text-cyan-500">AI</span>Prover
            </Link>

            <nav className="hidden items-center gap-1 lg:flex">
              {PRIMARY_SECTIONS.flatMap((section) => section.items).map((item) => {
                const active = isActive(pathname, item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? 'bg-cyan-500/10 font-medium text-cyan-600'
                        : 'text-stone-600 hover:bg-stone-200/60 hover:text-stone-900'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}

              <div className="relative" ref={moreRef}>
                <button
                  onClick={() => setMoreOpen((v) => !v)}
                  className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition-colors ${
                    overflowActive
                      ? 'bg-cyan-500/10 font-medium text-cyan-600'
                      : 'text-stone-600 hover:bg-stone-200/60 hover:text-stone-900'
                  }`}
                  aria-haspopup="true"
                  aria-expanded={moreOpen}
                >
                  More
                  <span className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`}>▾</span>
                </button>

                {moreOpen && (
                  <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded-xl border border-stone-200 bg-white p-3 shadow-lg">
                    <div className="grid gap-4">
                      {OVERFLOW_SECTIONS.map((section) => (
                        <div key={section.title}>
                          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
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
                                      ? 'bg-cyan-500/10 font-medium text-cyan-600'
                                      : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
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
                  </div>
                )}
              </div>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-medium text-stone-600 sm:inline">{workspaceName}</span>
            <button
              onClick={signOut}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-600 transition-colors hover:bg-stone-200 hover:text-stone-900"
            >
              Sign out
            </button>
            <button
              className="rounded-lg border border-stone-300 px-2 py-1 text-stone-600 lg:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Open menu"
            >
              ☰
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <nav className="border-t border-stone-200 bg-stone-50 px-4 py-4 lg:hidden">
            <div className="flex flex-col gap-5">
              {NAV.map((section) => (
                <div key={section.title}>
                  <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
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
                              ? 'bg-cyan-500/10 font-medium text-cyan-600'
                              : 'text-stone-600 hover:bg-stone-200/60 hover:text-stone-900'
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
        )}
      </header>

      <main className="w-full px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  )
}
