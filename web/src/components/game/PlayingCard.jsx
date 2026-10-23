const SUITS = {
  s: { red: false, path: "M12 2C9 7 4 9.5 4 13.5A4.5 4.5 0 0 0 11 17c-.2 1.6-1 2.8-2.2 3.6h6.4C14 19.8 13.2 18.6 13 17a4.5 4.5 0 0 0 7-3.5C20 9.5 15 7 12 2Z" },
  h: { red: true, path: "M12 21C5 15 2.5 11.5 2.5 8A4.8 4.8 0 0 1 12 5.2 4.8 4.8 0 0 1 21.5 8c0 3.5-2.5 7-9.5 13Z" },
  d: { red: true, path: "M12 2 20 12 12 22 4 12Z" },
  c: { red: false, path: "M12 2a4 4 0 0 0-3.2 6.4A4 4 0 1 0 10.5 15c-.2 2.3-1 4-2.3 5h7.6c-1.3-1-2.1-2.7-2.3-5a4 4 0 1 0 1.7-6.6A4 4 0 0 0 12 2Z" },
}

// 4-point sparkle used on card backs
const SPARKLE = "M12 3 13.7 10.3 21 12 13.7 13.7 12 21 10.3 13.7 3 12 10.3 10.3Z"

function Pip({ suit, className }) {
  const s = SUITS[suit]
  return (
    <svg viewBox="0 0 24 24" className={className} fill={s.red ? "var(--color-suit-red)" : "var(--color-suit-dark)"} aria-hidden>
      <path d={s.path} />
    </svg>
  )
}

/**
 * size: "lg" (hero hole cards) | "sm" (opponent hole cards) | "md" (community)
 * All dimensions inherit the game stage font size.
 */
export function PlayingCard({ rank, suit, size = "md", tilt = 0 }) {
  const dims = { sm: "h-[4.9em] w-[3.2em]", md: "w-[5.4em] h-[8em]", lg: "w-[4em] h-[5.5em]" }[size]
  const red = SUITS[suit].red
  return (
    <div
      style={{ rotate: `${tilt}deg` }}
      role="img" aria-label={`${rank} of ${{ s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }[suit]}`}
      className={`playing-card ${dims} relative shrink-0 rounded-[0.3em] bg-card-face shadow-[0_0.15em_0.5em_rgb(0_0_0_/_0.45)]`}
    >
      <div className="absolute left-[0.45em] top-[0.3em] flex flex-col items-center leading-none">
        <span className={`card-rank font-card font-medium ${red ? "text-suit-red" : "text-suit-dark"}`}>{rank}</span>
        <Pip suit={suit} className="mt-[0.1em] size-[1.1em]" />
      </div>
      <Pip suit={suit} className="absolute right-[0.45em] bottom-[0.3em] size-[1.1em] rotate-180" />
      {size === "md" && <Pip suit={suit} className="absolute inset-0 m-auto size-[2.2em] translate-y-[0.3em] opacity-90" />}
    </div>
  )
}

export function CardBack({ tilt = 0, folded = false, size = "sm" }) {
  const dims = { sm: "h-[4.9em] w-[3.2em]", md: "w-[5.4em] h-[8em]", lg: "h-[5.5em] w-[4em]" }[size] || "h-[4.9em] w-[3.2em]"
  return (
    <div
      style={{ rotate: `${tilt}deg` }}
      className={`relative ${dims} shrink-0 rounded-[0.25em] border-[0.09em] shadow-[0_0.15em_0.5em_rgb(0_0_0_/_0.45)] ${
        folded ? "border-card-back-line/70 bg-transparent" : "border-card-back-line/90 bg-card-back"
      }`}
    >
      {!folded && (
        <>
          <div className="absolute inset-[0.3em] rounded-[0.15em] border border-card-back-line/30" />
          <svg viewBox="0 0 24 24" className="absolute inset-0 m-auto size-[1.4em]" fill="var(--color-card-back-line)" aria-hidden>
            <path d={SPARKLE} />
          </svg>
        </>
      )}
    </div>
  )
}
