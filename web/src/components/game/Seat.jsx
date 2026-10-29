import { useEffect, useState } from "react"
import { animate, motion, useMotionValue } from "motion/react"
import { motionTokens } from "../../motion"
import { useMotionPreference } from "../../hooks/useMotionPreference"
import { CardBack, PlayingCard } from "./PlayingCard"

function PersonGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-[58%] text-avatar-glyph" fill="currentColor" aria-hidden>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7H4Z" />
    </svg>
  )
}

function Avatar({ active, deadline, clockOffset, name, winner }) {
  const progress = useMotionValue(1)
  const reduce = useMotionPreference()
  useEffect(() => {
    if (!active || !deadline) {
      progress.set(1)
      return
    }
    const seconds = Math.max(0, Math.min(20, (deadline * 1000 - Date.now() - clockOffset) / 1000))
    if (reduce) {
      progress.set(1)
      return
    }
    progress.set(seconds / 20)
    const animation = animate(progress, 0, { duration: seconds, ease: "linear" })
    return () => animation.stop()
  }, [active, deadline, clockOffset, progress, reduce])
  return (
    <div role="img" aria-label={active ? `${name}'s turn` : name} className="relative">
      {winner && <motion.div
        aria-hidden="true"
        className="absolute -inset-[0.3em] rounded-full border-[0.12em] border-accent shadow-[0_0_1.2em_rgb(195_161_134_/_0.45)]"
        initial={reduce ? false : { opacity: 0, scale: 0.72 }}
        animate={reduce ? { opacity: 1, scale: 1 } : { opacity: [0.55, 1, 0.72], scale: [1, 1.08, 1] }}
        transition={reduce ? { duration: 0 } : { duration: 1.1, ease: motionTokens.ease.standard, repeat: 1 }}
      />}
      <div className="relative grid size-[5.6em] shrink-0 place-items-center rounded-full bg-avatar ring-[0.14em] ring-ink/80 ring-offset-[0.28em] ring-offset-bg shadow-[0_0.2em_0.8em_rgb(0_0_0_/_0.4)]">
        <PersonGlyph />
      </div>
      {active && <svg viewBox="0 0 64 64" className="turn-ring" aria-hidden="true">
        <motion.circle cx="32" cy="32" r="30" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" style={{ pathLength: progress }} />
      </svg>}
    </div>
  )
}

function Label({ name, stack, dealer, connected, hand }) {
  return (
    <div className="leading-tight whitespace-nowrap">
      <div className="text-[0.95em] text-ink-dim" title={dealer ? "Dealer" : undefined}>{name}<span className="sr-only">{dealer ? " · dealer" : ""}{!connected ? " · offline" : ""}</span></div>
      <div className="font-mono text-[1.5em] font-light text-ink">${stack.toLocaleString()}</div>
      {hand && <div className="mt-[0.2em] text-[0.8em] text-ink-dim">{hand}</div>}
    </div>
  )
}

// Fanned pair: second card overlaps the first, both slightly tilted.
function Fan({ children }) {
  return <div className="flex [&>*:not(:first-child)]:-ml-[1.5em]">{children}</div>
}

function FlipCard({ card, tilt, revealed, onToggle, size = "lg", delay = 0, disabled = false }) {
  const reduce = useMotionPreference()
  const dims = { sm: "h-[4.9em] w-[3.2em]", lg: "h-[5.5em] w-[4em]" }[size]
  if (reduce) {
    return (
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-label={revealed ? "Hide hand" : "Reveal hand"}
        className={`${dims} shrink-0 cursor-pointer disabled:cursor-default`}
        style={{ rotate: `${tilt}deg` }}
      >
        {revealed ? <PlayingCard size={size} {...card} /> : <CardBack size={size} />}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={revealed ? "Hide hand" : "Reveal hand"}
      className={`${dims} shrink-0 cursor-pointer disabled:cursor-default`}
      style={{ perspective: "40em", rotate: `${tilt}deg` }}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
        initial={{ rotateY: 0 }}
        animate={{ rotateY: revealed ? 180 : 0 }}
        transition={{ ...motionTokens.spring.smooth, delay }}
      >
        <div className="absolute inset-0 [backface-visibility:hidden]">
          <CardBack size={size} />
        </div>
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <PlayingCard size={size} {...card} />
        </div>
      </motion.div>
    </button>
  )
}

// D means acted; X means folded. Positioned by GamePage.
export function StatusBadge({ status }) {
  const reduce = useMotionPreference()
  const shadow = "shadow-[0_0.15em_0.4em_rgb(0_0_0_/_0.5)]"
  if (status === "x") {
    return (
      <motion.div aria-label="Folded" className={`grid size-[2em] place-items-center rounded-full border-[0.12em] border-ink/70 bg-avatar ${shadow}`}
        initial={reduce ? false : { opacity: 0, scale: 0.7, rotate: -35, y: 5 }} animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
        exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.8, y: -4, transition: { duration: motionTokens.duration.exit } }}
        transition={reduce ? { duration: 0 } : motionTokens.spring.snappy}>
        <svg viewBox="0 0 24 24" className="size-[45%]" stroke="var(--color-ink)" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M6 6 18 18M18 6 6 18" />
        </svg>
      </motion.div>
    )
  }
  return (
    <motion.div aria-label="Has acted" className={`grid size-[2em] place-items-center rounded-full bg-[#cfc3b4] font-card text-[1.05em] font-medium text-[#1d2021] ${shadow}`}
      initial={reduce ? false : { opacity: 0, scale: 0.7, y: 5 }} animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.8, y: -4, transition: { duration: motionTokens.duration.exit } }}
      transition={reduce ? { duration: 0 } : motionTokens.spring.snappy}>
      D
    </motion.div>
  )
}

// Bet badge: current call/raise amount sitting beside the status badge.
// Hidden when the player hasn't bet this street.
export function BetBadge({ amount }) {
  const reduce = useMotionPreference()
  if (amount == null) return null
  return (
    <motion.div aria-label={`Street bet ${amount}`} className="grid h-[2em] place-items-center rounded-full border-[0.12em] border-ink/70 bg-avatar px-[0.55em] font-mono text-[1em] text-ink shadow-[0_0.15em_0.4em_rgb(0_0_0_/_0.5)]"
      initial={reduce ? false : { opacity: 0, y: 9, scale: 0.85 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6, scale: 0.9, transition: { duration: motionTokens.duration.exit } }}
      transition={reduce ? { duration: 0 } : motionTokens.spring.snappy}>
      {amount}
    </motion.div>
  )
}

/**
 * side: "left" | "right" | "top" | "hero" — composition per table position.
 * All sizes em-based; inherits --stage-scale from the stage element.
 */
export function Seat({ side, name, stack, cards = [], state = "active", active, deadline, clockOffset, connected, dealer, winner, dealKey = 0, handName }) {
  const reduce = useMotionPreference()
  const faded = state === "folded"
  const [revealed, setRevealed] = useState(true)
  const avatar = <Avatar active={active} deadline={deadline} clockOffset={clockOffset} name={name} winner={winner} />
  const label = <Label name={name} stack={stack} dealer={dealer} connected={connected} hand={side === "hero" ? handName : undefined} />
  const foldOffset = {
    left: { x: 18, y: 0 },
    right: { x: -18, y: 0 },
    top: { x: 0, y: 16 },
    hero: { x: 0, y: -16 },
  }[side] || { x: 0, y: 0 }

  const cardEls = cards.length ? (
    <motion.div className="flex"
      animate={faded ? { opacity: 0.38, x: foldOffset.x, y: foldOffset.y, scale: 0.92 } : { opacity: 1, x: 0, y: 0, scale: 1 }}
      transition={reduce ? { duration: 0 } : motionTokens.spring.smooth}>
      <Fan>
        {cards.map((c, i) => {
          const size = side === "hero" ? "lg" : "sm"
          const tilt = i === 0 ? -9 : 6
          return <motion.div key={`${dealKey}-${i}-${c.rank || "back"}-${c.suit || "back"}`} className="shrink-0"
            initial={reduce ? false : {
              opacity: 0,
              y: -12,
              scale: 0.92,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduce ? { duration: 0 } : {
              ...motionTokens.spring.smooth,
              delay: i * motionTokens.stagger.deal,
            }}>
            {c.rank ? (
              <FlipCard
                card={c}
                tilt={tilt}
                size={size}
                delay={i * motionTokens.stagger.card}
                revealed={revealed && !faded}
                disabled={faded}
                onToggle={() => setRevealed((r) => !r)}
              />
            ) : (
              <CardBack tilt={tilt} size={size} folded={faded} />
            )}
          </motion.div>
        })}
      </Fan>
    </motion.div>
  ) : null

  if (state === "empty") {
    return (
      <div className="flex flex-col items-center gap-[0.6em] opacity-40">
        {avatar}
        <div className="text-[0.9em] text-ink-dim">Sit here</div>
      </div>
    )
  }

  if (side === "left" || side === "right") {
    return (
      <div className="flex flex-col">
        <div className={`flex items-center ${side === "right" ? "flex-row-reverse" : ""}`}>
          {avatar}
          {cardEls}
        </div>
        <div className={`mt-[0.7em] ${side === "right" ? "self-end" : ""} w-[5.6em]`}>{label}</div>
      </div>
    )
  }

  // "top" and "hero": single row [avatar, cards, label]
  return (
    <div className="flex items-center gap-[0.9em]">
      {avatar}
      {cardEls}
      {label}
    </div>
  )
}
