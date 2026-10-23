import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { PokerDivider } from './PokerDivider'

export function Lobby({ onJoin }) {
  const [tables, setTables] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const reduce = useReducedMotion()

  useEffect(() => {
    let active = true
    let request
    let timeout
    const load = async () => {
      request = new AbortController()
      timeout = setTimeout(() => request.abort(), 5000)
      setLoading(true)
      try {
        const base = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`
        const response = await fetch(new URL('/rooms', base), {
          signal: request.signal, cache: 'no-store',
        })
        if (!response.ok) throw new Error('Unable to load tables')
        const data = await response.json()
        if (!Array.isArray(data.rooms)) throw new Error('Invalid table list')
        if (active) {
          setTables(data.rooms)
          setError('')
        }
      } catch {
        if (active) {
          setTables([])
          setError('Cannot reach the lobby. Try refreshing or join by room number.')
        }
      } finally {
        clearTimeout(timeout)
        if (active) {
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      active = false
      clearTimeout(timeout)
      request?.abort()
    }
  }, [refresh])

  return <section aria-labelledby="lobby-heading" className="w-full max-w-xs">
    <PokerDivider className="mb-4" />
    <div className="flex items-center justify-between gap-4 mb-2">
      <h2 id="lobby-heading" className="text-xs font-medium uppercase tracking-[0.18em] text-ink-dim">Open tables</h2>
      <button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)} className="flex min-h-11 items-center gap-1.5 px-2 text-xs text-ink-dim transition-colors hover:text-ink focus-visible:outline focus-visible:outline-accent disabled:opacity-40">
        <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
        <svg className={`size-3.5 transition-transform ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          <path d="M16 16h5v5" />
        </svg>
      </button>
    </div>
    {(tables === null || error || (tables.length === 0 && !loading)) &&
      <p role="status" className="mb-2 text-xs leading-relaxed text-ink-dim">
        {tables === null ? 'Finding open tables…' : error || 'No public tables'}
      </p>}
    {tables !== null && <ul aria-label="Joinable tables" className="flex max-h-64 flex-col gap-2.5 overflow-y-auto">
      <AnimatePresence initial={false}>
      {tables.map(table => <motion.li key={table.room} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: reduce ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.15 }} className="flex items-center gap-3 rounded-2xl border border-ink/20 bg-ink/[0.03] px-4 py-3">
        <span className="size-2.5 shrink-0 rounded-full bg-accent/70" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium tabular-nums text-ink">Table {table.room}</p>
          <p className="truncate text-xs text-ink-dim" title={table.host}>Hosted by {table.host}</p>
        </div>
        <span className="text-xs tabular-nums text-ink-dim" aria-label={`${table.players} of ${table.capacity} seats occupied`}>{table.players} / {table.capacity}</span>
        <button type="button" onClick={() => onJoin(table.room)} aria-label={`Join table ${table.room}`} className="rounded-full border border-ink/40 px-3.5 py-1.5 text-xs text-ink transition-colors hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-accent">Join</button>
      </motion.li>)}
      </AnimatePresence>
    </ul>}
  </section>
}
