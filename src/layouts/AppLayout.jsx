import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Menu, X } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from '../context/AuthContext'
import Logo from '../components/ui/Logo'

/** One responsive shell for all roles: sidebar on desktop, drawer on tablets/phones, bottom tab bar on phones. */
export default function AppLayout({ nav, area }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const leave = async () => { await signOut(); navigate('/login') }

  const links = (onClick) => nav.map((item) => (
    <NavLink key={item.to} to={item.to} end={item.end} onClick={onClick}
      className={({ isActive }) => clsx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors', isActive ? 'bg-primary text-white' : 'text-text-secondary hover:bg-mint hover:text-primary')}>
      <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />{item.label}
    </NavLink>
  ))

  const sidebar = (onClick) => (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4"><Logo withText /><p className="mt-1 text-xs text-text-secondary">{area}</p></div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main">{links(onClick)}</nav>
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint font-semibold text-primary">{(profile?.full_name || profile?.email || '?').charAt(0).toUpperCase()}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{profile?.full_name || profile?.email}</p><p className="text-xs text-text-secondary">{profile?.role}</p></div>
          <button onClick={leave} className="rounded-lg p-2 text-text-secondary hover:bg-mint hover:text-error" aria-label="Sign out"><LogOut className="h-5 w-5" /></button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      <aside className="no-print fixed inset-y-0 hidden w-64 border-r border-border bg-white lg:block">{sidebar()}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-lg p-2 hover:bg-mint" aria-label="Close menu"><X className="h-5 w-5" /></button>
            {sidebar(() => setOpen(false))}
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-border bg-white px-4 py-3 lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-mint" aria-label="Open menu"><Menu className="h-6 w-6" /></button>
          <Logo size={32} withText />
          <span className="w-10" />
        </header>
        <main className="mx-auto max-w-7xl p-4 pb-24 sm:p-6 lg:pb-6"><Outlet /></main>
        <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-white lg:hidden" style={{ gridTemplateColumns: `repeat(${Math.min(nav.length, 5)}, minmax(0, 1fr))` }} aria-label="Quick navigation">
          {nav.slice(0, 5).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 py-2 text-[11px]', isActive ? 'font-semibold text-primary' : 'text-text-secondary')}>
              <item.icon className="h-5 w-5" aria-hidden="true" />{item.short || item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
