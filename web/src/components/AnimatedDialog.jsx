import { useEffect, useId, useRef } from 'react'
import { motion } from 'motion/react'
import { useReducedMotion } from '../hooks/useReducedMotion'

export function AnimatedDialog({ title, onClose, children }) {
  const dialog = useRef(null)
  const titleId = useId()
  const reduce = useReducedMotion()
  useEffect(() => {
    const element = dialog.current
    const previous = document.activeElement
    element.showModal()
    return () => {
      element.close()
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])

  return <motion.dialog ref={dialog} className="room-dialog" aria-labelledby={titleId}
    initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: reduce ? 1 : 0, y: reduce ? 0 : 4 }} transition={{ duration: reduce ? 0 : 0.18 }}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => {
      if (event.target !== event.currentTarget) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
    }}>
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 id={titleId} className="text-xl font-medium">{title}</h2>
      <button type="button" autoFocus onClick={onClose} aria-label="Close settings" className="raise-close">×</button>
    </div>
    {children}
  </motion.dialog>
}
