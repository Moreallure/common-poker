import { useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useReducedMotion } from '../../hooks/useReducedMotion'

export function ActionBar({ legal, onAction, pot }) {
  const [raiseOpen, setRaiseOpen] = useState(false)
  const [raiseTo, setRaiseTo] = useState(legal.minRaise)
  const [selectedPreset, setSelectedPreset] = useState(null)
  const reduce = useReducedMotion()
  const panelId = useId()
  const raiseButton = useRef(null)
  const clamp = value => Math.min(legal.maxRaise, Math.max(legal.minRaise, value))
  const close = () => { setRaiseOpen(false); raiseButton.current?.focus() }
  const presets = [
    { label: 'All In', value: legal.maxRaise },
    { label: '½ Pot', value: clamp(Math.round(pot / 2)) },
    { label: 'Pot', value: clamp(pot) },
  ]

  return <div className="action-bar landscape:ml-auto landscape:items-end">
    <AnimatePresence initial={false}>
      {raiseOpen && <motion.section
        key="raise-editor" id={panelId} aria-label="Choose a raise amount" className="raise-editor-container"
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: reduce ? 1 : 0, y: reduce ? 0 : 8 }}
        transition={{ duration: reduce ? 0 : 0.18, ease: [0.23, 1, 0.32, 1] }}
        onKeyDown={event => { if (event.key === 'Escape') close() }}
      >
        {/* Landscape: classic upstream compact panel on the right */}
        <div className="raise-panel-landscape">
          <div className="raise-landscape-presets">
            {presets.map(preset => (
              <button
                type="button"
                key={preset.label}
                aria-pressed={selectedPreset === preset.label || raiseTo === preset.value}
                onClick={() => { setRaiseTo(preset.value); setSelectedPreset(preset.label) }}
                className={`raise-landscape-preset ${selectedPreset === preset.label || raiseTo === preset.value ? 'raise-preset-active' : ''}`}
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={selectedPreset === '+20'}
              onClick={() => { setRaiseTo(clamp(raiseTo + 20)); setSelectedPreset('+20') }}
              className={`raise-landscape-preset ${selectedPreset === '+20' ? 'raise-preset-active' : ''}`}
            >
              +20
            </button>
          </div>
          <div className="raise-landscape-slider-col">
            <div className="raise-landscape-header">
              <span className="raise-value font-mono">${raiseTo.toLocaleString()}</span>
              <button type="button" onClick={close} aria-label="Close raise editor" className="raise-close-mini">×</button>
            </div>
            <input
              type="range"
              min={legal.minRaise}
              max={legal.maxRaise}
              step={1}
              value={raiseTo}
              disabled={legal.minRaise === legal.maxRaise}
              onChange={event => { setRaiseTo(Number(event.target.value)); setSelectedPreset(null) }}
              aria-label="Raise to total for this street"
              aria-valuetext={`${raiseTo} chips`}
              className="raise-landscape-slider"
            />
          </div>
        </div>

        {/* Portrait: horizontal panel across the width */}
        <div className="raise-panel-portrait">
          <div className="raise-heading">
            <label htmlFor={`${panelId}-range`}>Raise to <output className="raise-value font-mono">${raiseTo.toLocaleString()}</output></label>
            <input
              id={`${panelId}-range`}
              type="range"
              min={legal.minRaise}
              max={legal.maxRaise}
              step={1}
              value={raiseTo}
              disabled={legal.minRaise === legal.maxRaise}
              onChange={event => { setRaiseTo(Number(event.target.value)); setSelectedPreset(null) }}
              aria-label="Raise to total for this street"
              aria-valuetext={`${raiseTo} chips`}
              className="raise-slider"
            />
            <button type="button" onClick={close} aria-label="Close raise editor" className="raise-close">×</button>
          </div>
          <div className="raise-presets">
            {presets.map(preset => (
              <button
                type="button"
                key={preset.label}
                aria-pressed={selectedPreset === preset.label}
                onClick={() => { setRaiseTo(preset.value); setSelectedPreset(preset.label) }}
                className="raise-preset"
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={selectedPreset === '+20'}
              onClick={() => { setRaiseTo(clamp(raiseTo + 20)); setSelectedPreset('+20') }}
              className="raise-preset"
            >
              +20
            </button>
          </div>
        </div>
      </motion.section>}
    </AnimatePresence>
    <div className="action-buttons landscape:flex landscape:items-center landscape:justify-end">
      <button type="button" onClick={() => onAction('fold')} className="action-button">Fold</button>
      <button type="button" onClick={() => onAction(legal.call ? 'call' : 'check')} className="action-button action-primary">
        <span>{legal.call ? 'Call' : 'Check'}</span>
        {legal.call > 0 && <span className="action-amount font-mono">${legal.call.toLocaleString()}</span>}
      </button>
      <button ref={raiseButton} type="button" disabled={!legal.canRaise} aria-expanded={raiseOpen} aria-controls={raiseOpen ? panelId : undefined}
        aria-label={raiseOpen ? `Confirm raise to ${raiseTo}` : 'Raise'}
        onClick={() => raiseOpen ? onAction('raise', raiseTo) : setRaiseOpen(true)}
        className={`action-button ${raiseOpen ? 'action-primary' : ''}`}>
        <span>Raise</span>
        {raiseOpen && <span className="action-amount font-mono">${raiseTo.toLocaleString()}</span>}
      </button>
    </div>
  </div>
}
