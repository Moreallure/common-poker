export const motionTokens = {
  duration: {
    instant: 0.12,
    fast: 0.16,
    exit: 0.18,
    standard: 0.24,
    considered: 0.48,
  },
  ease: {
    enter: [0.16, 1, 0.3, 1],
    exit: [0.4, 0, 1, 1],
    standard: [0.23, 1, 0.32, 1],
  },
  spring: {
    smooth: { type: 'spring', duration: 0.4, bounce: 0 },
    snappy: { type: 'spring', duration: 0.26, bounce: 0.12 },
    morph: { type: 'spring', duration: 0.42, bounce: 0.16 },
  },
  stagger: {
    card: 0.06,
    deal: 0.09,
  },
}
