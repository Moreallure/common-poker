"""In-memory, server-authoritative four-seat no-limit Hold'em."""
import itertools
import secrets
import time
from collections import Counter
from dataclasses import dataclass, field

INITIAL_STACK = 1000
HAND_NAMES = ("High card", "One pair", "Two pair", "Three of a kind", "Straight",
              "Flush", "Full house", "Four of a kind", "Straight flush")


def hand_name(score):
    return "Royal flush" if score[:2] == (8, 14) else HAND_NAMES[score[0]]

def rank(cards):
    def five(cs):
        values = sorted((c // 4 + 2 for c in cs), reverse=True)
        counts = Counter(values)
        groups = sorted(((n, v) for v, n in counts.items()), reverse=True)
        unique = sorted(counts, reverse=True)
        if 14 in unique:
            unique.append(1)
        straight = next((unique[i] for i in range(len(unique) - 4)
                         if unique[i] - unique[i + 4] == 4), 0)
        flush = len({c % 4 for c in cs}) == 1
        if flush and straight: return (8, straight)
        if groups[0][0] == 4: return (7, groups[0][1], groups[1][1])
        if [g[0] for g in groups] == [3, 2]: return (6, groups[0][1], groups[1][1])
        if flush: return (5, *values)
        if straight: return (4, straight)
        if groups[0][0] == 3: return (3, groups[0][1], *sorted((v for v in values if v != groups[0][1]), reverse=True))
        pairs = sorted((v for v, n in counts.items() if n == 2), reverse=True)
        if len(pairs) == 2: return (2, *pairs, next(v for v in values if v not in pairs))
        if pairs: return (1, pairs[0], *[v for v in values if v != pairs[0]])
        return (0, *values)
    return max(five(cs) for cs in itertools.combinations(cards, 5))


def card(c):
    return {"rank": str(c // 4 + 2) if c // 4 < 9 else "JQKA"[c // 4 - 9], "suit": "shdc"[c % 4]}


@dataclass
class Player:
    id: str
    name: str
    stack: int = INITIAL_STACK
    cards: list = field(default_factory=list)
    bet: int = 0
    total: int = 0
    folded: bool = True
    acted: bool = False
    connected: bool = True
    last_action_bet: int = -1


class Game:
    def __init__(self, code, owner_ip=None, private=True):
        self.code = code
        self.owner_ip = owner_ip
        self.private = private
        self.players = []
        self.dealer = -1
        self.turn = None
        self.deadline = None
        self.street = "waiting"
        self.board = []
        self.current = 0
        self.minimum = 20
        self.pending = set()
        self.message = "Waiting for players"
        self.updated = time.monotonic()

    def next(self, seat, candidates):
        return next((i % len(self.players) for i in range(seat + 1, seat + len(self.players) + 1) if i % len(self.players) in candidates), None)

    def pay(self, i, amount):
        p = self.players[i]
        amount = min(p.stack, amount)
        p.stack -= amount
        p.bet += amount
        p.total += amount

    def remove_disconnected(self):
        if self.street not in ("waiting", "showdown"):
            return
        # Keep the next button clockwise even when the previous dealer left.
        self.dealer -= sum(not p.connected for p in self.players[:self.dealer + 1])
        self.players = [p for p in self.players if p.connected]

    def start(self):
        if self.street not in ("waiting", "showdown"):
            raise ValueError("A hand is already running")
        self.remove_disconnected()
        seats = {i for i, p in enumerate(self.players) if p.connected and p.stack > 0}
        if len(seats) < 2: raise ValueError("Need two connected players with chips")
        self.dealer = self.next(self.dealer, seats)
        self.deck = list(range(52))
        secrets.SystemRandom().shuffle(self.deck)
        self.board = []
        self.street = "preflop"
        self.current, self.minimum = 20, 20
        for i, p in enumerate(self.players):
            p.cards = [self.deck.pop(), self.deck.pop()] if i in seats else []
            p.bet = p.total = 0
            p.folded = i not in seats
            p.acted = False
            p.last_action_bet = -1
        sb = self.dealer if len(seats) == 2 else self.next(self.dealer, seats)
        bb = self.next(sb, seats)
        self.pay(sb, 10)
        self.pay(bb, 20)
        self.pending = {i for i in seats if self.players[i].stack}
        self.message = "Blinds 10 / 20"
        self.advance(bb)

    def legal(self, i):
        p = self.players[i]
        maximum = p.bet + p.stack
        can_raise = p.last_action_bet < 0 or self.current - p.last_action_bet >= self.minimum
        opponents = any(j != i and not q.folded and q.stack for j, q in enumerate(self.players))
        return {"call": min(p.stack, max(0, self.current - p.bet)),
                "minRaise": min(maximum, self.current + self.minimum), "maxRaise": maximum,
                "canRaise": bool(can_raise and opponents and maximum > self.current)}

    def action(self, i, kind, amount=None):
        if i != self.turn: raise ValueError("It is not your turn")
        p = self.players[i]
        legal = self.legal(i)
        if kind == "fold": p.folded = True
        elif kind == "check":
            if legal["call"]: raise ValueError("You must call or fold")
        elif kind == "call": self.pay(i, legal["call"])
        elif kind == "raise":
            if not legal["canRaise"] or type(amount) is not int or not legal["minRaise"] <= amount <= legal["maxRaise"]:
                raise ValueError("Invalid raise total")
            increase = amount - self.current
            self.pay(i, amount - p.bet)
            if increase >= self.minimum: self.minimum = increase
            self.current = amount
            self.pending |= {j for j, q in enumerate(self.players) if j != i and not q.folded and q.stack and q.bet < amount}
        else: raise ValueError("Unknown action")
        p.acted = True
        p.last_action_bet = self.current
        self.pending.discard(i)
        self.message = f"{p.name}: {kind}"
        self.advance(i)

    def advance(self, after):
        alive = {i for i, p in enumerate(self.players) if not p.folded}
        if len(alive) == 1:
            winner = self.players[next(iter(alive))]
            pot = sum(p.total for p in self.players)
            winner.stack += pot
            self.finish(f"{winner.name} wins ${pot:,} · All others folded")
            return
        self.pending &= {i for i in alive if self.players[i].stack}
        # A lone player with chips only acts if still facing a bet.
        active = {i for i in alive if self.players[i].stack}
        if len(active) == 1:
            self.pending &= {i for i in active if self.players[i].bet < self.current}
        if self.pending:
            self.turn = self.next(after, self.pending)
            if not self.players[self.turn].connected:
                self.action(self.turn, "fold")
                return
            self.deadline = time.time() + 20
            return
        if self.street == "river":
            self.showdown()
            return
        self.street = {"preflop": "flop", "flop": "turn", "turn": "river"}[self.street]
        self.deck.pop()  # burn
        self.board.extend(self.deck.pop() for _ in range(3 if self.street == "flop" else 1))
        self.current, self.minimum = 0, 20
        for p in self.players:
            p.bet, p.acted, p.last_action_bet = 0, False, -1
        self.pending = active if len(active) > 1 else set()
        self.advance(self.dealer)

    def finish(self, message):
        self.street, self.turn, self.deadline = "showdown", None, None
        self.message = message
        self.pending.clear()
        for p in self.players:
            if p.connected and p.stack == 0:
                p.stack = INITIAL_STACK

    def showdown(self):
        # Return a unique unmatched contribution before constructing side pots.
        ordered = sorted(self.players, key=lambda p: p.total, reverse=True)
        refund = ordered[0].total - ordered[1].total
        if refund:
            ordered[0].stack += refund
            ordered[0].total -= refund
            ordered[0].bet = max(0, ordered[0].bet - refund)
        results = {i: rank(p.cards + self.board) for i, p in enumerate(self.players) if not p.folded}
        previous = 0
        awards = Counter()
        for level in sorted({p.total for p in self.players if p.total}):
            pot = (level - previous) * sum(p.total >= level for p in self.players)
            eligible = [i for i in results if self.players[i].total >= level]
            # Disconnections can fold every contributor to a dead side pot.
            # Remaining live hands contest that dead money.
            if not eligible: eligible = list(results)
            best = max(results[i] for i in eligible)
            winners = {i for i in eligible if results[i] == best}
            order = sorted(winners, key=lambda i: (i - self.dealer - 1) % len(self.players))
            for n, i in enumerate(order): awards[i] += pot // len(order) + (n < pot % len(order))
            previous = level
        for i, amount in awards.items(): self.players[i].stack += amount
        self.finish(" · ".join(f"{self.players[i].name} wins ${amount:,} ({hand_name(results[i])})"
                               for i, amount in awards.items()))

    def snapshot(self, viewer):
        reveal = self.street == "showdown" and len(self.board) == 5
        return {"type": "state", "room": self.code, "you": viewer, "street": self.street,
                "private": self.private,
                "dealer": self.dealer, "turn": self.turn, "deadline": self.deadline,
                "serverTime": time.time(), "board": [card(c) for c in self.board],
                "pot": sum(p.total for p in self.players), "message": self.message,
                "host": next((p.id for p in self.players if p.connected), None),
                "players": [{"id": p.id, "name": p.name, "stack": p.stack, "bet": p.bet,
                             "folded": p.folded, "acted": p.acted, "connected": p.connected,
                             "cards": [card(c) if p.id == viewer or (reveal and not p.folded) else {} for c in p.cards]}
                            for p in self.players],
                "legal": self.legal(self.turn) if self.turn is not None and self.players[self.turn].id == viewer else None}
