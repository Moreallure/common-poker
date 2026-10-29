import { useEffect } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react'
import { motionTokens } from '../../motion'
import { useMotionPreference } from '../../hooks/useMotionPreference'
import { CardBack, PlayingCard } from './PlayingCard'

// Felt inset area. Portrait phones run the felt edge-to-edge (5px padding via
// the near-full-width stage); landscape/desktop untouched.
const TABLE_AREA = 'absolute left-[11%] right-[11%] top-[14%] bottom-[22%] portrait:max-sm:left-[5%] portrait:max-sm:right-[5%] portrait:min-sm:left-[10%] portrait:min-sm:right-[10%] portrait:top-[42%] portrait:max-sm:top-[44%] portrait:bottom-auto portrait:h-[max(13em,13%)]'
export function Table({ board, pot }) {
  const reduce = useMotionPreference()
  const potValue = useMotionValue(pot)
  const formattedPot = useTransform(potValue, value => `$${Math.round(value).toLocaleString()}`)
  useEffect(() => {
    if (reduce) {
      potValue.set(pot)
      return
    }
    const animation = animate(potValue, pot, motionTokens.spring.smooth)
    return () => animation.stop()
  }, [pot, potValue, reduce])

  return <>
    <div className={`${TABLE_AREA} rounded-[999px] border-[0.14em] border-ink/70 bg-felt`} />
    <div className="table-pot absolute inset-x-0 top-[18%] flex items-center justify-center gap-[0.8em] text-[2em] portrait:top-[38%] portrait:max-sm:top-[37%]" role="img" aria-label={`Pot $${pot.toLocaleString()}`}>
      <motion.span aria-hidden="true" className="whitespace-nowrap font-mono text-ink tabular-nums">{formattedPot}</motion.span>
    </div>
    <div className={`${TABLE_AREA} grid place-items-center`}>
      <div className="flex gap-[0.4em] portrait:max-sm:gap-[0.25em] portrait:max-sm:text-[0.95em]">
        {Array.from({ length: 5 }, (_, i) => {
          const revealDelay = board.length === 3 && i !== 1 ? motionTokens.stagger.deal * 3 : 0
          return <div key={i} className="relative h-[8em] w-[5.4em] shrink-0">
            <AnimatePresence initial={false} mode="wait">
              {board[i] ? (
                <motion.div
                  key={`${board[i].rank}-${board[i].suit}`}
                  data-board-card
                  className="absolute inset-0"
                  style={{ perspective: '40em' }}
                  initial={reduce ? false : { opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduce ? { opacity: 1, y: 0, transition: { duration: 0 } } : {
                    opacity: 0,
                    y: 4,
                    transition: { duration: motionTokens.duration.exit, ease: motionTokens.ease.exit },
                  }}
                  transition={reduce ? { duration: 0 } : {
                    duration: motionTokens.duration.fast,
                    delay: revealDelay,
                    ease: motionTokens.ease.enter,
                  }}
                >
                  <motion.div
                    className="relative h-full w-full"
                    style={{ transformStyle: 'preserve-3d' }}
                    initial={reduce ? false : { rotateY: 0 }}
                    animate={{ rotateY: 180 }}
                    transition={reduce ? { duration: 0 } : {
                      duration: motionTokens.duration.considered,
                      delay: revealDelay + motionTokens.duration.fast,
                      ease: motionTokens.ease.enter,
                    }}
                  >
                    <div className="absolute inset-0 [backface-visibility:hidden]">
                      <CardBack size="md" />
                    </div>
                    <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                      <PlayingCard size="md" {...board[i]} />
                    </div>
                  </motion.div>
                </motion.div>
              ) : (
                <div key="empty" className="absolute inset-0 rounded-[0.3em] border border-dashed border-ink/15" />
              )}
            </AnimatePresence>
          </div>
        })}
      </div>
    </div>
  </>
}
