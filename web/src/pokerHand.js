const RANKS = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, T: 10, J: 11, Q: 12, K: 13, A: 14 }
const SUITS = new Set(['s', 'h', 'd', 'c'])

function straightHigh(values) {
  const unique = new Set(values)
  if (unique.has(14)) unique.add(1)
  for (let high = 14; high >= 5; high--) {
    if ([0, 1, 2, 3, 4].every(offset => unique.has(high - offset))) return high
  }
  return 0
}

export function getPokerHandName(cards) {
  if (!Array.isArray(cards) || cards.length < 5 || cards.some(card => !card || !RANKS[card.rank] || !SUITS.has(card.suit))) return null

  const values = cards.map(card => RANKS[card.rank])
  const counts = new Map()
  const suits = new Map()
  for (const card of cards) {
    counts.set(RANKS[card.rank], (counts.get(RANKS[card.rank]) || 0) + 1)
    suits.set(card.suit, (suits.get(card.suit) || 0) + 1)
  }

  const flushSuit = [...suits].find(([, count]) => count >= 5)?.[0]
  const flushStraight = flushSuit ? straightHigh(cards.filter(card => card.suit === flushSuit).map(card => RANKS[card.rank])) : 0
  if (flushStraight === 14) return 'Royal Flush'
  if (flushStraight) return 'Straight Flush'

  const groups = [...counts.values()].sort((a, b) => b - a)
  if (groups[0] === 4) return 'Four-of-a-Kind'
  if (groups[0] === 3 && groups[1] >= 2) return 'Full House'
  if (flushSuit) return 'Flush'
  if (straightHigh(values)) return 'Straight'
  if (groups[0] === 3) return 'Three-of-a-Kind'
  if (groups[0] === 2 && groups[1] === 2) return 'Two Pair'
  if (groups[0] === 2) return 'One Pair'
  return 'High Card'
}
