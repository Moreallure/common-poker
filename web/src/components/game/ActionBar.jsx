import { useEffect, useId, useRef, useState } from "react"
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react"
import { motionTokens } from "../../motion"
import { useMotionPreference } from "../../hooks/useMotionPreference"

export function ActionBar({ legal, onAction, pot }) {
  const base =
    "h-[clamp(2.5rem,7vmin,3.3rem)] rounded-full px-[clamp(1.3rem,3.5vmin,1.9rem)] portrait:min-h-11 portrait:h-[clamp(2.75rem,7vmin,3.3rem)] portrait:px-2 text-[clamp(0.9rem,2.3vmin,1.05rem)] font-medium transition-colors disabled:opacity-40"
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [raiseTo, setRaiseTo] = useState(legal.minRaise)
  const [selectedPreset, setSelectedPreset] = useState(null)
  const reduce = useMotionPreference()
  const animatedRaiseTo = useMotionValue(raiseTo)
  const formattedRaiseTo = useTransform(animatedRaiseTo, value => `$${Math.round(value).toLocaleString()}`)
  const raisePanelId = useId()
  const raiseButton = useRef(null)
  const clamp = (value) => Math.min(legal.maxRaise, Math.max(legal.minRaise, value))
  useEffect(() => {
    if (reduce) {
      animatedRaiseTo.set(raiseTo)
      return
    }
    const controls = animate(animatedRaiseTo, raiseTo, motionTokens.spring.snappy)
    return () => controls.stop()
  }, [animatedRaiseTo, raiseTo, reduce])

  const closeRaise = () => {
    setRaiseOpen(false)
    raiseButton.current?.focus({ preventScroll: true })
  }
  const presets = [
    { label: "All In", value: legal.maxRaise },
    { label: "½ Pot", value: clamp(Math.round(pot / 2)) },
    { label: "Pot", value: clamp(pot) },
    { label: "+20", add: true },
  ]

  return (
    <div
      className="flex flex-col items-end portrait:items-stretch"
      onKeyDown={event => {
        if (event.key === 'Escape' && raiseOpen) {
          event.preventDefault()
          closeRaise()
        }
      }}
    >
      {/* click-away layer closes the raise panel */}
      {raiseOpen && <div className="fixed inset-0 z-20" onClick={closeRaise} aria-hidden />}
      {/* raise panel hovers above the action row — no layout space */}
      <AnimatePresence initial={false}>
        {raiseOpen && (
        <motion.div
          id={raisePanelId}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 1, y: 0, transition: { duration: 0 } } : {
            opacity: 0,
            y: 4,
            transition: { duration: motionTokens.duration.exit, ease: motionTokens.ease.exit },
          }}
          transition={reduce ? { duration: 0 } : motionTokens.spring.smooth}
          className="absolute bottom-full right-0 z-30 mb-2 flex items-stretch gap-2 rounded-2xl border-[1.3px] border-ink/70 bg-card-face p-3 text-suit-dark shadow-[0_0.5em_2em_rgb(0_0_0_/_0.3)]"
        >
          <div className="flex flex-col justify-center gap-2">
            {presets.map((preset) =>
              preset.add ? (
                <button
                  type="button"
                  key={preset.label}
                  onClick={() => { setRaiseTo((value) => Math.min(value + 20, legal.maxRaise)); setSelectedPreset("+20") }}
                  className="rounded-full border-[1.3px] border-suit-dark/50 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-suit-dark/10"
                >
                  {preset.label}
                </button>
              ) : (
                <button
                  type="button"
                  key={preset.label}
                  aria-pressed={selectedPreset === preset.label}
                  onClick={() => { setRaiseTo(preset.value); setSelectedPreset(preset.label) }}
                  className={`rounded-full border-[1.3px] px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    raiseTo === preset.value ? "border-suit-dark bg-suit-dark text-card-face" : "border-suit-dark/50 text-suit-dark hover:bg-suit-dark/10"
                  }`}
                >
                  {preset.label}
                </button>
              ),
            )}
          </div>
          <div className="flex flex-col items-center gap-2">
            <motion.span aria-hidden="true" className="w-16 text-center font-mono text-lg tabular-nums">{formattedRaiseTo}</motion.span>
            <input
              type="range"
              min={legal.minRaise}
              max={legal.maxRaise}
              step={1}
              value={raiseTo}
              disabled={legal.minRaise === legal.maxRaise}
              onChange={(e) => { setRaiseTo(Number(e.target.value)); setSelectedPreset(null) }}
              className="raise-slider w-1.5 min-h-24 flex-1 accent-[#292522] [direction:rtl] [writing-mode:vertical-lr]"
              aria-label="Raise to total for this street"
            />
          </div>
        </motion.div>
        )}
      </AnimatePresence>
      <div className="relative flex items-center justify-end gap-2 portrait:[&>button]:flex-1">
        <button type="button" onClick={() => onAction('fold')} className={`${base} flex items-center justify-center border-[1.3px] border-ink/70 text-ink hover:bg-ink/10`}>
          Fold
        </button>
        <button type="button" onClick={() => onAction(legal.call ? 'call' : 'check')} className={`${base} flex items-center gap-2 portrait:justify-center border-[1.3px] border-ink/70 bg-accent text-accent-ink hover:brightness-105`}>
          <span>{legal.call ? 'Call' : 'Check'}</span>
          {legal.call > 0 && <span className="font-mono">${legal.call.toLocaleString()}</span>}
        </button>
        <button
          type="button"
          disabled={!legal.canRaise}
          ref={raiseButton}
          aria-expanded={raiseOpen}
          aria-controls={raiseOpen ? raisePanelId : undefined}
          aria-label={raiseOpen ? `Confirm raise to ${raiseTo}` : 'Raise'}
          onClick={() => raiseOpen ? onAction('raise', raiseTo) : setRaiseOpen(true)}
          className={`${base} relative z-30 flex items-center gap-2 portrait:justify-center border-[1.3px] ${
            raiseOpen ? "border-accent bg-accent text-accent-ink" : "border-ink/70 text-ink hover:bg-ink/10"
          }`}
        >
          <span>Raise</span>
          {raiseOpen && <motion.span aria-hidden="true" className="w-8 text-right font-mono tabular-nums">{formattedRaiseTo}</motion.span>}
        </button>
      </div>
    </div>
  )
}
