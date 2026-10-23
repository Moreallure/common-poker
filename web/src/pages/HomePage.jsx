import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import githubIcon from '../assets/github.svg'
import { Lobby } from '../components/Lobby'
import { PokerDivider } from '../components/PokerDivider'

export function HomePage({ pending = false }) {
  const navigate = useNavigate()
  const { state } = useLocation()
  const [room, setRoom] = useState(state?.room || '')
  const [name, setName] = useState(sessionStorage.getItem('pokerName') || '')
  const nameInput = useRef(null)

  const enter = (target) => {
    sessionStorage.setItem('pokerName', name.trim())
    navigate(`/game/${target}?name=${encodeURIComponent(name.trim())}`, {
      state: { room: target === 'new' ? room : target, private: true },
    })
  }

  const input = 'h-12 w-full rounded-full border border-ink/40 bg-transparent px-6 text-center text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none'

  const joinTable = (target) => {
    setRoom(target)
    if (!name.trim()) nameInput.current?.focus()
    else enter(target)
  }

  return (
    <main
      aria-busy={pending}
      style={{
        paddingLeft: 'max(1.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(1.5rem, env(safe-area-inset-right))',
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
      }}
      className="relative flex min-h-dvh flex-col items-center justify-center gap-6 sm:gap-8"
    >
      <div className="flex w-full flex-col items-center gap-3">
        <h1 className="w-full text-center text-[clamp(2.6rem,9vmin,4.5rem)] leading-none font-mono">Common Poker</h1>
        <PokerDivider className="max-w-[240px] sm:max-w-[280px]" />
      </div>
      <fieldset disabled={pending} className="m-0 flex w-full max-w-xs flex-col items-center gap-3 border-0 p-0 text-center">
        <div className="relative flex w-full items-center justify-center">
          <span className="pointer-events-none absolute -left-5 text-sm select-none text-accent/80 sm:-left-6" aria-hidden="true">♠</span>
          <input ref={nameInput} aria-label="Your name" maxLength={20} placeholder="Your name" value={name} onChange={e => setName(e.target.value)} className={input} />
        </div>
        <div className="relative flex w-full items-center justify-center">
          <span className="pointer-events-none absolute -left-5 text-sm select-none text-accent/80 sm:-left-6" aria-hidden="true">♦</span>
          <input aria-label="Room number" inputMode="numeric" maxLength={6} placeholder="Room number" value={room} onChange={e => setRoom(e.target.value.replace(/\D/g, ''))} className={input} />
        </div>
        <div className="flex w-full gap-3">
          <button disabled={!name.trim()} onClick={() => enter('new')} className="h-12 flex-1 rounded-full border border-ink/70 disabled:opacity-40">Host</button>
          <button disabled={!name.trim() || !room.length} onClick={() => enter(room)} className="h-12 flex-1 rounded-full bg-accent text-accent-ink disabled:opacity-40">Join</button>
        </div>
        {state?.error && <p role="alert" className="text-center text-sm text-red-300">{state.error}</p>}
      </fieldset>
      {pending ? <p role="status" className="text-sm text-ink-dim">Connecting to table…</p> : <Lobby onJoin={joinTable} />}
      <a href="https://github.com/Moreallure/common-poker" target="_blank" rel="noreferrer" aria-label="GitHub" className="absolute bottom-4 right-4 size-6 opacity-60 transition-opacity hover:opacity-100 sm:bottom-6 sm:right-6"><img src={githubIcon} alt="" className="size-full invert" /></a>
    </main>
  )
}
