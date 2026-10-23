import assert from 'node:assert/strict'
import test from 'node:test'
import { getPokerHandName } from './pokerHand.js'

const c = (rank, suit) => ({ rank, suit })

test('recognizes all ten poker hand categories from the visible seven cards', () => {
  const hands = [
    [[c('A', 's'), c('K', 's'), c('Q', 's'), c('J', 's'), c('10', 's'), c('2', 's'), c('3', 'd')], 'Royal Flush'],
    [[c('9', 'h'), c('8', 'h'), c('7', 'h'), c('6', 'h'), c('5', 'h'), c('A', 's'), c('2', 'd')], 'Straight Flush'],
    [[c('9', 's'), c('9', 'h'), c('9', 'd'), c('9', 'c'), c('A', 's'), c('K', 'h'), c('2', 'd')], 'Four-of-a-Kind'],
    [[c('K', 's'), c('K', 'h'), c('K', 'd'), c('4', 's'), c('4', 'c'), c('A', 'h'), c('2', 'd')], 'Full House'],
    [[c('A', 'h'), c('J', 'h'), c('9', 'h'), c('6', 'h'), c('3', 'h'), c('K', 's'), c('2', 'd')], 'Flush'],
    [[c('A', 's'), c('K', 'h'), c('Q', 'd'), c('J', 'c'), c('10', 's'), c('2', 'd'), c('3', 'h')], 'Straight'],
    [[c('7', 's'), c('7', 'h'), c('7', 'd'), c('A', 'c'), c('K', 's'), c('2', 'd'), c('3', 'h')], 'Three-of-a-Kind'],
    [[c('A', 's'), c('A', 'h'), c('K', 'd'), c('K', 'c'), c('Q', 's'), c('2', 'd'), c('3', 'h')], 'Two Pair'],
    [[c('A', 's'), c('A', 'h'), c('K', 'd'), c('Q', 'c'), c('9', 's'), c('2', 'd'), c('3', 'h')], 'One Pair'],
    [[c('A', 's'), c('K', 'h'), c('9', 'd'), c('6', 'c'), c('3', 's'), c('2', 'd'), c('4', 'h')], 'High Card'],
  ]

  for (const [cards, expected] of hands) {
    assert.equal(getPokerHandName(cards), expected)
  }
})

test('recognizes an ace-low wheel straight and wheel straight flush', () => {
  assert.equal(getPokerHandName([c('A', 's'), c('2', 'h'), c('3', 'd'), c('4', 'c'), c('5', 's')]), 'Straight')
  assert.equal(getPokerHandName([c('A', 's'), c('2', 's'), c('3', 's'), c('4', 's'), c('5', 's'), c('K', 'h'), c('Q', 'd')]), 'Straight Flush')
})

test('recognizes hands on flop (5 cards) and turn (6 cards)', () => {
  assert.equal(getPokerHandName([c('A', 's'), c('A', 'h'), c('K', 'd'), c('2', 'c'), c('3', 'h')]), 'One Pair')
  assert.equal(getPokerHandName([c('A', 's'), c('A', 'h'), c('A', 'd'), c('K', 'c'), c('K', 'h'), c('2', 'd')]), 'Full House')
  assert.equal(getPokerHandName([c('A', 's'), c('A', 'h'), c('K', 'd'), c('K', 'c'), c('Q', 's'), c('Q', 'h')]), 'Two Pair')
})

test('prefers flush over separate non-flush straight', () => {
  assert.equal(getPokerHandName([c('2', 's'), c('4', 's'), c('6', 's'), c('8', 's'), c('10', 's'), c('3', 'h'), c('5', 'd')]), 'Flush')
})

test('waits until five visible cards can make a ranked hand and handles null/invalid cards safely', () => {
  assert.equal(getPokerHandName(null), null)
  assert.equal(getPokerHandName([]), null)
  assert.equal(getPokerHandName([c('A', 's'), c('A', 'h'), c('2', 'd'), c('3', 'c')]), null)
  assert.equal(getPokerHandName([{}, {}, c('2', 'd'), c('3', 'c'), c('4', 's')]), null)
  assert.equal(getPokerHandName([null, undefined, c('2', 'd'), c('3', 'c'), c('4', 's')]), null)
})
