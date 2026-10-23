import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { Table } from '../components/game/Table'
import { Seat, StatusBadge, BetBadge } from '../components/game/Seat'
import { ActionBar } from '../components/game/ActionBar'
import { HomePage } from './HomePage'
import { AnimatePresence, motion } from 'motion/react'
import { RoomSettings } from '../components/game/RoomSettings'
import { useReducedMotion } from '../hooks/useReducedMotion'

export function GamePage() {
  const { roomId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { state } = useLocation()
  const socket = useRef(null)
  const [game, setGame] = useState(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('Connecting…')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsFeedback, setSettingsFeedback] = useState(null)
  const [notice, setNotice] = useState('')
  const [clock, setClock] = useState(() => ({ now: Date.now(), offset: 0 }))
  const reduce = useReducedMotion()
  const creating = roomId === 'new'
  const requestedRoom = creating ? state?.room || undefined : roomId
  const requestedPrivate = creating ? state?.private !== false : undefined
  const name = params.get('name') || sessionStorage.getItem('pokerName') || 'Player'

  useEffect(() => {
    if (!notice) return
    const timeout = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    let active = true
    let joined = false
    let ws
    const reject = (message) => {
      active = false
      ws?.close()
      navigate('/', { replace: true, state: { error: message, room: requestedRoom || '', private: requestedPrivate } })
    }
    // Defer opening so React StrictMode's setup/cleanup probe creates no ghost seat.
    const open = setTimeout(() => {
      const base = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`
      const url = new URL('/ws', base)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(url)
      socket.current = ws
      let alive = Date.now()
      ws.onopen = () => ws.send(JSON.stringify({
        type: creating ? 'create' : 'join', room: requestedRoom, name,
        private: requestedPrivate,
      }))
      ws.onmessage = (event) => {
        if (!active) return
        alive = Date.now()
        const data = JSON.parse(event.data)
        if (data.type === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return }
        if (data.type === 'error') {
          if (data.scope === 'settings') setSettingsFeedback({ pending: false, error: data.message })
          else if (!joined) reject(data.message)
          else setError(data.message)
          return
        }
        if (data.type === 'settings_saved') {
          setSettingsFeedback(null)
          setSettingsOpen(false)
          setNotice('Room settings saved')
          return
        }
        if (data.type === 'state') {
          joined = true
          setGame(data)
          setStatus('Connected')
          setClock({ now: Date.now(), offset: data.serverTime * 1000 - Date.now() })
          setError('')
          // Keep this connection alive while making the address shareable.
          if (creating) window.history.replaceState(window.history.state, '', `/game/${data.room}`)
        }
      }
      ws.onerror = () => {
        if (!active) return
        if (!joined) reject('Cannot reach the game server.')
        else setError('Cannot reach the game server.')
      }
      ws.onclose = () => {
        if (!active) return
        if (!joined) reject('Cannot join the room.')
        else {
          setStatus('Disconnected — return home to join again')
          setSettingsFeedback({ pending: false, error: 'Connection lost. Rejoin to change settings.' })
        }
      }
      ws.watchdog = setInterval(() => {
        if (Date.now() - alive > 35000) ws.close()
      }, 1000)
    }, 0)
    return () => { active = false; clearTimeout(open); if (ws) { clearInterval(ws.watchdog); ws.close() } }
  }, [requestedRoom, requestedPrivate, creating, name, navigate])

  const send = (data) => {
    if (socket.current?.readyState !== WebSocket.OPEN) return false
    socket.current.send(JSON.stringify(data))
    return true
  }
  const connected = status === 'Connected'
  const hero = Math.max(0, game?.players.findIndex(p => p.id === game.you) ?? 0)
  const seats = game?.players.map((p, i) => ({ ...p, index: i, side: ['hero', 'left', 'top', 'right'][(i - hero + 4) % 4] })).filter(p => p.connected) || []
  const canStart = connected && game?.host === game?.you && ['waiting', 'showdown'].includes(game?.street)
  const ready = game?.players.filter(p => p.connected && p.stack > 0).length >= 2

  if (!game) return <HomePage pending />

  return (
    <div className="game-page">
      <header className="game-header landscape:absolute landscape:left-0 landscape:right-0 landscape:top-0 landscape:w-full">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-ink-dim">{game?.room || (creating ? '' : roomId)}</span>
          <span className="rounded-full border border-ink/25 px-2 py-1 text-[10px] uppercase tracking-wider text-ink-dim">{game.private ? 'Private' : 'Public'}</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={!connected || settingsFeedback?.pending} onClick={() => { setSettingsFeedback(null); setNotice(''); setSettingsOpen(true) }} aria-label="Settings" title="Settings" className="grid min-h-11 min-w-11 cursor-pointer place-content-center text-ink transition-opacity hover:opacity-70 disabled:opacity-40">
            <svg className="fa-light fa-gear size-[19px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.7 2.8h2.6l.45 2.13a7.48 7.48 0 0 1 1.72.71l1.92-1.07 1.84 1.84-1.07 1.92c.31.54.55 1.12.71 1.72l2.13.45v2.6l-2.13.45c-.16.6-.4 1.18-.71 1.72l1.07 1.92-1.84 1.84-1.92-1.07c-.54.31-1.12.55-1.72.71l-.45 2.13h-2.6l-.45-2.13a7.48 7.48 0 0 1-1.72-.71l-1.92 1.07-1.84-1.84 1.07-1.92a7.48 7.48 0 0 1-.71-1.72L2.8 13.3v-2.6l2.13-.45c.16-.6.4-1.18.71-1.72L4.57 6.61l1.84-1.84 1.92 1.07c.54-.31 1.12-.55 1.72-.71L10.7 2.8Z" />
              <circle cx="12" cy="12" r="3.15" />
            </svg>
          </button>
          <details className="relative">
            <summary aria-label="Menu" className="grid min-h-11 min-w-11 cursor-pointer list-none place-content-center gap-[7px] [&::-webkit-details-marker]:hidden">
              <span className="h-px w-[22px] bg-ink" /><span className="h-px w-[22px] bg-ink" /><span className="h-px w-[22px] bg-ink" />
            </summary>
            <div className="absolute right-0 top-10 w-44 rounded-2xl border border-ink/70 bg-card-face p-2">
              <button onClick={() => navigate('/')} className="w-full rounded-full px-4 py-2 text-left text-sm text-suit-dark hover:bg-suit-dark/10">Leave</button>
            </div>
          </details>
        </div>
      </header>
      <AnimatePresence>
        {settingsOpen && <RoomSettings key="settings" game={game} connected={connected} feedback={settingsFeedback}
          onClose={() => setSettingsOpen(false)} onSave={settings => {
            if (send({ type: 'settings', ...settings })) setSettingsFeedback({ pending: true, error: '' })
            else setSettingsFeedback({ pending: false, error: 'Connection lost. Rejoin to change settings.' })
          }} />}
      </AnimatePresence>
      <p className="sr-only" role="status">{game?.street}{game?.turn != null && ` · ${game.players[game.turn].name}'s turn`}</p>
      <main className="game-main">
        <div className="game-stage">
          <Table board={game?.board || []} pot={`$${(game?.pot ?? 0).toLocaleString()}`} />
          <AnimatePresence>
          {seats.map(p => <motion.div key={p.id} className={`table-seat table-seat-${p.side}`}
            initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: reduce ? 1 : 0, transition: { duration: reduce ? 0 : 0.12 } }} transition={{ duration: reduce ? 0 : 0.2 }}>
            <Seat {...p} board={game?.board || []} stack={p.stack} state={p.folded && game.street !== 'waiting' ? 'folded' : 'active'} active={p.index === game.turn} deadline={game.deadline} clockOffset={clock.offset} dealer={p.index === game.dealer} isHost={p.id === game.host}
              badges={<>{p.folded && game.street !== 'waiting' ? <StatusBadge status="x" /> : p.acted ? <StatusBadge status="d" /> : null}<BetBadge amount={p.bet || null} /></>} />
          </motion.div>)}
          </AnimatePresence>
        </div>
      </main>
      <footer className="game-footer landscape:absolute landscape:left-0 landscape:right-0 landscape:bottom-0 landscape:w-full landscape:pointer-events-none">
        <AnimatePresence>
          {notice && <motion.p key={notice} role="status" className="room-notice" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: reduce ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.15 }}>{notice}</motion.p>}
        </AnimatePresence>
        {error ? <p role="alert" className="game-status text-red-300">{error}</p>
          : !connected && <p role="status" className="game-status text-ink-dim">{status}</p>}
        {!error && connected && game.street === 'showdown' && <p role="status" className="game-result landscape:absolute landscape:bottom-3 landscape:left-4 sm:landscape:left-6 landscape:max-w-[40%] landscape:text-left">{game.message}</p>}
        {canStart ? <div className="game-start-row landscape:flex landscape:justify-end landscape:w-full"><button disabled={!ready} title={!ready ? 'Waiting for another player with chips' : undefined} onClick={() => send({ type: 'start' })} className="action-button action-primary game-start-button">{game.street === 'waiting' ? 'Deal' : 'Next hand'}</button></div>
          : game?.legal && connected ? <ActionBar key={`${game.street}-${game.deadline}`} legal={game.legal} pot={game.pot} onAction={(action, amount) => send({ type: 'action', action, amount, turn: game.deadline })} />
            : null}
      </footer>
    </div>
  )
}
