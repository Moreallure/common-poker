import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { motionTokens } from '../motion'
import { useMotionPreferenceSettings } from '../hooks/useMotionPreference'
import { Table } from '../components/game/Table'
import { Seat, StatusBadge, BetBadge } from '../components/game/Seat'
import { ActionBar } from '../components/game/ActionBar'
import { HomePage } from './HomePage'

const POSITIONS = {
  left: 'left-0 top-[48%] -translate-y-1/2 portrait:left-[2%] portrait:top-[14%] portrait:max-sm:top-[16%] portrait:translate-y-0',
  top: 'left-1/2 top-[-6%] -translate-x-1/2 portrait:top-[1%]',
  right: 'right-0 top-[48%] -translate-y-1/2 portrait:right-[2%] portrait:top-[14%] portrait:max-sm:top-[16%] portrait:translate-y-0',
  hero: 'bottom-[1%] left-1/2 -translate-x-1/2 portrait:bottom-[7%]',
}
const BADGES = {
  // portrait-phone overrides follow the edge-to-edge felt (insets 1.5%)
  left: 'left-[14%] top-[57%] portrait:left-[10%] portrait:top-[35%]',
  top: 'left-[36%] top-[20%] portrait:top-[15%] portrait:left-[43%]',
  right: 'left-[84%] top-[25%] portrait:left-[93%] portrait:top-[35%]',
  hero: 'left-[45%] top-[72%] portrait:top-[calc(86%-4em)]',
}

export function GamePage() {
  const { roomId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { state } = useLocation()
  const socket = useRef(null)
  const [game, setGame] = useState(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('Connecting…')
  const [clock, setClock] = useState(() => ({ now: Date.now(), offset: 0 }))
  const { reduce, override: motionOverride, setPreference } = useMotionPreferenceSettings()
  const [menuOpen, setMenuOpen] = useState(false)
  const [dealKey, setDealKey] = useState(0)
  const menuButtonRef = useRef(null)
  const previousDealStreet = useRef(null)
  const menuId = useId()
  const creating = roomId === 'new'
  const requestedRoom = creating ? state?.room || undefined : roomId
  const name = params.get('name') || localStorage.getItem('pokerName') || 'Player'

  const dealStreet = game?.street
  useLayoutEffect(() => {
    const previousStreet = previousDealStreet.current
    previousDealStreet.current = dealStreet ?? null
    if (dealStreet === 'preflop' && previousStreet !== 'preflop') setDealKey(key => key + 1)
  }, [dealStreet])

  useEffect(() => {
    let active = true
    let joined = false
    let ws
    const reject = (message) => {
      active = false
      ws?.close()
      navigate('/', { replace: true, state: { error: message, room: requestedRoom || '' } })
    }
    // Defer opening so React StrictMode's setup/cleanup probe creates no ghost seat.
    const open = setTimeout(() => {
      const base = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`
      const url = new URL('/ws', base)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(url)
      socket.current = ws
      let alive = Date.now()
      ws.onopen = () => ws.send(JSON.stringify({ type: creating ? 'create' : 'join', room: requestedRoom, name, rankings: creating ? !!state?.rankings : undefined }))
      ws.onmessage = (event) => {
        if (!active) return
        alive = Date.now()
        const data = JSON.parse(event.data)
        if (data.type === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return }
        if (data.type === 'error') {
          if (!joined) reject(data.message)
          else setError(data.message)
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
        else setStatus('Disconnected — return home to join again')
      }
      ws.watchdog = setInterval(() => {
        if (Date.now() - alive > 35000) ws.close()
      }, 1000)
    }, 0)
    return () => { active = false; clearTimeout(open); if (ws) { clearInterval(ws.watchdog); ws.close() } }
  }, [requestedRoom, creating, name, navigate, state?.rankings])

  const send = (data) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(data))
  }
  const closeMenu = () => {
    setMenuOpen(false)
    menuButtonRef.current?.focus({ preventScroll: true })
  }
  const connected = status === 'Connected'
  const hero = Math.max(0, game?.players.findIndex(p => p.id === game.you) ?? 0)
  const seats = game?.players.map((p, i) => ({ ...p, index: i, side: ['hero', 'left', 'top', 'right'][(i - hero + 4) % 4] })).filter(p => p.connected) || []
  const canStart = connected && game?.host === game?.you && ['waiting', 'showdown'].includes(game?.street)
  const ready = game?.players.filter(p => p.connected && p.stack > 0).length >= 2
  const displayPot = game?.street === 'showdown' ? 0 : game?.pot ?? 0
  const winnerIds = game?.street === 'showdown' ? (game.awards || []).map(award => award.player) : []

  if (!game) return <HomePage pending />

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))]">
        <span className="font-mono text-sm text-ink-dim">{game?.room || (creating ? '' : roomId)}</span>
        <div className="relative" onKeyDown={event => { if (event.key === 'Escape' && menuOpen) closeMenu() }}>
          <button ref={menuButtonRef} type="button" aria-label={menuOpen ? 'Close menu' : 'Menu'} aria-expanded={menuOpen} aria-controls={menuId}
            onClick={() => setMenuOpen(open => !open)}
            className="relative z-20 min-h-10 min-w-10 rounded-full portrait:min-h-11 portrait:min-w-11">
            <motion.span className="absolute left-1/2 top-1/2 -ml-[11px] h-px w-[22px] bg-ink" animate={menuOpen ? { y: 0, rotate: 45 } : { y: -6, rotate: 0 }} transition={reduce ? { duration: 0 } : motionTokens.spring.snappy} />
            <motion.span className="absolute left-1/2 top-1/2 -ml-[11px] h-px w-[22px] bg-ink" animate={{ opacity: menuOpen ? 0 : 1, scaleX: menuOpen ? 0.6 : 1, y: 0 }} transition={reduce ? { duration: 0 } : { duration: motionTokens.duration.fast }} />
            <motion.span className="absolute left-1/2 top-1/2 -ml-[11px] h-px w-[22px] bg-ink" animate={menuOpen ? { y: 0, rotate: -45 } : { y: 6, rotate: 0 }} transition={reduce ? { duration: 0 } : motionTokens.spring.snappy} />
          </button>
          <AnimatePresence initial={false}>
            {menuOpen && <>
              <motion.button type="button" aria-label="Dismiss menu backdrop" className="fixed inset-0 z-10 cursor-default bg-black/10"
                initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
                exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transition: { duration: motionTokens.duration.exit } }}
                transition={reduce ? { duration: 0 } : { duration: motionTokens.duration.fast }} onClick={closeMenu} />
              <motion.div id={menuId} className="absolute right-0 top-12 z-30 w-52 origin-top-right rounded-2xl border border-ink/70 bg-card-face p-2 text-suit-dark shadow-[0_0.5em_2em_rgb(0_0_0_/_0.35)]"
                initial={reduce ? false : { opacity: 0, y: -6, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -3, scale: 0.97, transition: { duration: motionTokens.duration.exit, ease: motionTokens.ease.exit } }}
                transition={reduce ? { duration: 0 } : motionTokens.spring.smooth}>
                <button type="button" onClick={() => navigate('/')} className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-suit-dark/10">Leave table</button>
                <div className="my-1 border-t border-suit-dark/15" />
                <button type="button" role="switch" aria-checked={reduce} onClick={() => setPreference(!reduce)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-suit-dark/10">
                  <span>Reduce motion</span><span className={`rounded-full px-2 py-0.5 text-xs ${reduce ? 'bg-suit-dark text-card-face' : 'bg-suit-dark/10'}`}>{reduce ? 'On' : 'Off'}</span>
                </button>
                <button type="button" disabled={motionOverride === null} onClick={() => setPreference(null)}
                  className="w-full rounded-xl px-3 py-2 text-left text-xs text-suit-dark/65 hover:bg-suit-dark/10 disabled:opacity-40">Use system setting</button>
              </motion.div>
            </>}
          </AnimatePresence>
        </div>
      </header>
      <p className="sr-only" role="status">{game?.street}{game?.turn != null && ` · ${game.players[game.turn].name}'s turn`}</p>
      <main className="grid min-h-0 flex-1 place-items-center overflow-x-clip pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] py-1 pt-[calc(env(safe-area-inset-top)+0.25rem)] pb-[calc(var(--stage-bottom-pad)+env(safe-area-inset-bottom))] portrait:max-sm:px-0 portrait:pt-[calc(env(safe-area-inset-top)+3.75rem)]">
        <div style={{ fontSize: 'var(--stage-scale)' }} className="relative aspect-[13/5] max-h-full w-[min(calc(90vw_-_env(safe-area-inset-left)_-_env(safe-area-inset-right)),1200px)] portrait:aspect-auto portrait:h-full portrait:min-sm:w-[90vw] portrait:max-sm:w-[calc(100vw_-_10px)]">
          <Table board={game?.board || []} pot={displayPot} />
          <AnimatePresence initial={false}>
          {seats.map(p => <motion.div key={p.id} className={`absolute ${POSITIONS[p.side]}`}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 1, y: 0, transition: { duration: 0 } } : {
              opacity: 0,
              y: -4,
              transition: { duration: motionTokens.duration.exit, ease: motionTokens.ease.exit },
            }}
            transition={reduce ? { duration: 0 } : motionTokens.spring.smooth}>
            <Seat {...p} stack={p.stack} dealKey={dealKey} winner={winnerIds.includes(p.id)} state={p.folded && game.street !== 'waiting' ? 'folded' : 'active'} active={p.index === game.turn} deadline={game.deadline} clockOffset={clock.offset} dealer={p.index === game.dealer} handName={p.id === game.you ? game.myHand : undefined} />
          </motion.div>)}
          </AnimatePresence>
          {seats.map(p => <div key={p.id} className={`absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-[0.4em] ${p.side === 'top' || p.side === 'right' ? 'flex-row-reverse' : ''} ${BADGES[p.side]}`}>
            <AnimatePresence initial={false}>
              {p.folded && game.street !== 'waiting' ? <StatusBadge key={`fold-${p.id}`} status="x" /> : p.acted ? <StatusBadge key={`acted-${p.id}`} status="d" /> : null}
            </AnimatePresence>
            <AnimatePresence initial={false}>
              {p.bet > 0 && <BetBadge key={p.id} amount={p.bet} />}
            </AnimatePresence>
          </div>)}
        </div>
      </main>
      <footer className="absolute inset-x-0 bottom-0 z-20 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(env(safe-area-inset-bottom)+0.75rem)] portrait:relative portrait:inset-auto portrait:flex portrait:min-h-[4.25rem] portrait:shrink-0 portrait:flex-col portrait:justify-end sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))]">
        {error ? <p role="alert" className="mb-3 text-center text-sm text-red-300">{error}</p>
          : !connected && <p role="status" className="mb-3 text-center text-sm text-ink-dim">{status}</p>}
        <AnimatePresence initial={false}>
          {!error && connected && game.street === 'showdown' && <motion.p key={game.message} role="status" className="absolute bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-[max(1rem,env(safe-area-inset-left))] right-[calc(10rem_+_env(safe-area-inset-right))] break-words text-left text-sm text-ink sm:left-[max(1.5rem,env(safe-area-inset-left))]"
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 1, y: 0, transition: { duration: 0 } } : {
              opacity: 0,
              y: 2,
              transition: { duration: motionTokens.duration.exit, ease: motionTokens.ease.exit },
            }}
            transition={reduce ? { duration: 0 } : motionTokens.spring.smooth}>{game.message}</motion.p>}
        </AnimatePresence>
        {canStart ? <motion.div className="flex justify-end" initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={reduce ? { duration: 0 } : motionTokens.spring.smooth}>
          <button disabled={!ready} title={!ready ? 'Waiting for another player with chips' : undefined} onClick={() => send({ type: 'start' })} className="rounded-full bg-accent px-7 py-3 portrait:min-h-11 text-accent-ink disabled:opacity-40">{game.street === 'waiting' ? 'Deal' : 'Next hand'}</button>
        </motion.div> : <AnimatePresence initial={false} mode="wait">
          {!error && game?.legal && connected && <motion.div key={`${game.street}-${game.turn}-${game.deadline}`} className="w-full origin-bottom"
            initial={reduce ? false : { opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: 6, scale: 0.99, transition: { duration: motionTokens.duration.exit } }}
            transition={reduce ? { duration: 0 } : motionTokens.spring.smooth}>
            <ActionBar legal={game.legal} pot={game.pot} onAction={(action, amount) => send({ type: 'action', action, amount, turn: game.deadline })} />
          </motion.div>}
        </AnimatePresence>}
      </footer>
    </div>
  )
}
