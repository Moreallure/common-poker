export function PokerDivider({ className = '', suit = '♠' }) {
  return (
    <div className={`flex w-full items-center justify-center gap-2.5 text-accent/70 select-none ${className}`} aria-hidden="true">
      <span className="h-px flex-1 bg-ink/20" />
      <span className="text-[8px] leading-none opacity-60">◆</span>
      <span className="text-xs sm:text-sm leading-none opacity-85">{suit}</span>
      <span className="text-[8px] leading-none opacity-60">◆</span>
      <span className="h-px flex-1 bg-ink/20" />
    </div>
  )
}
