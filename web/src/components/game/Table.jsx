import { AnimatePresence, motion } from 'motion/react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { PlayingCard } from './PlayingCard'

export function Table({ board, pot }) {
  const reduce = useReducedMotion()
  return <>
    <div className="table-felt" aria-hidden />
    <div className="table-pot" aria-label={`Pot ${pot}`}>
      <motion.span key={pot} initial={reduce ? false : { opacity: 0.5 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.16 }}>{pot}</motion.span>
    </div>
    <div className="table-board" aria-label="Community cards">
      {Array.from({ length: 5 }, (_, i) => <div key={i} className="board-slot">
        <AnimatePresence initial={false} mode="wait">
          {board[i] ? <motion.div className="absolute inset-0"
            key={`${board[i].rank}-${board[i].suit}`}
            initial={reduce ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: reduce ? 1 : 0, y: reduce ? 0 : 5, transition: { duration: reduce ? 0 : 0.12 } }}
            transition={{ delay: reduce ? 0 : i < 3 ? i * 0.04 : 0, duration: reduce ? 0 : 0.22, ease: [0.23, 1, 0.32, 1] }}
          ><PlayingCard size="md" {...board[i]} /></motion.div>
            : <motion.div key="empty" className="board-placeholder absolute inset-0" aria-hidden
              initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: reduce ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.1 }} />}
        </AnimatePresence>
      </div>)}
    </div>
  </>
}
