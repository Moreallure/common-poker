import random
import unittest
from unittest.mock import patch
from .engine import Game, Player, rank, hand_name
from .main import disconnect


def cards(text):
    return [("23456789TJQKA".index(c[0]) * 4 + "shdc".index(c[1])) for c in text.split()]


class EngineTests(unittest.TestCase):
    def game(self, stacks=(1000, 1000)):
        g = Game("123456")
        g.players = [Player(str(i), f"P{i}", stack=s) for i, s in enumerate(stacks)]
        g.start()
        return g

    def test_rank_categories_and_wheel(self):
        hands = ["As Jh 9d 6c 3s", "As Ah 9d 6c 3s", "As Ah 9d 9c 3s",
                 "As Ah Ad 6c 3s", "As 2h 3d 4c 5s", "As Js 9s 6s 3s",
                 "As Ah Ad 6c 6s", "As Ah Ad Ac 3s", "9s Ts Js Qs Ks"]
        for category, hand in enumerate(hands): self.assertEqual(rank(cards(hand))[0], category)
        self.assertEqual(rank(cards(hands[4])), (4, 5))
        self.assertEqual(rank(cards("As Ah Ad Ac Ks Kh Kd")), (7, 14, 13))

    def test_winning_hand_names(self):
        expected = ["King high", "One pair", "Two pair", "Three of a kind", "Straight",
                    "Flush", "Full house", "Four of a kind", "Straight flush"]
        for category, name in enumerate(expected):
            self.assertEqual(hand_name((category, 13)), name)
        self.assertEqual(hand_name((0, 14)), "Ace high")
        self.assertEqual(hand_name((0, 2)), "2 high")
        self.assertEqual(hand_name(rank(cards("Ts Js Qs Ks As"))), "Royal flush")

    def test_heads_up_blinds_and_street_reset(self):
        g = self.game()
        self.assertEqual(g.turn, g.dealer)
        g.action(g.turn, "call")
        g.action(g.turn, "check")
        self.assertEqual(g.street, "flop")
        self.assertEqual(g.turn, 1)
        self.assertEqual([p.bet for p in g.players], [0, 0])
        self.assertFalse(any(p.acted for p in g.players))
        self.assertEqual(g.snapshot("0")["players"][1]["cards"], [{}, {}])

    def test_illegal_actions_do_not_mutate(self):
        g = self.game()
        before = [(p.stack, p.total) for p in g.players]
        for action, amount in [("check", None), ("raise", 25), ("raise", True), ("raise", 1001)]:
            with self.assertRaises(ValueError): g.action(g.turn, action, amount)
        self.assertEqual(before, [(p.stack, p.total) for p in g.players])
        with self.assertRaises(ValueError): g.action(1, "fold")

    def test_short_allin_does_not_reopen_betting(self):
        g = self.game((1000, 50, 1000))
        g.action(0, "raise", 40)
        g.action(1, "raise", 50)
        g.action(2, "call")
        self.assertEqual(g.turn, 0)
        self.assertFalse(g.legal(0)["canRaise"])
        g.action(0, "call")
        self.assertEqual(g.street, "flop")

    def test_sidepots_and_refund(self):
        g = Game("123456")
        g.players = [Player(str(i), str(i), stack=0, total=t, folded=False, cards=cards(h))
                     for i, (t, h) in enumerate([(50, "As Ah"), (100, "Ks Kh"), (200, "Qs Qh")])]
        g.board = cards("2s 3h 7d 8c 9s")
        g.showdown()
        self.assertEqual([p.stack for p in g.players], [150, 100, 100])
        self.assertEqual(g.message, "0 wins $150 (One pair) · 1 wins $100 (One pair)")
        self.assertEqual(g.snapshot("0")["awards"], [
            {"player": "0", "amount": 150}, {"player": "1", "amount": 100},
        ])

    def test_split_and_odd_chip_order(self):
        g = Game("123456")
        g.dealer = 0
        g.players = [Player(str(i), str(i), stack=0, total=5, folded=i == 2, cards=cards(h))
                     for i, h in enumerate(["2h 3h", "4h 5h", "6h 7h"])]
        g.board = cards("Ts Js Qs Ks As")
        g.showdown()
        self.assertEqual([p.stack for p in g.players], [7, 8, 1000])
        self.assertEqual(g.message, "1 wins $8 (Royal flush) · 0 wins $7 (Royal flush)")

    def test_fold_win_has_no_invented_hand_name(self):
        g = self.game()
        g.action(g.turn, "fold")
        self.assertEqual(g.message, "P1 wins $30 · All others folded")
        self.assertEqual(g.snapshot("0")["awards"], [{"player": "1", "amount": 30}])
        self.assertEqual(g.snapshot("0")["players"][1]["cards"], [{}, {}])

    def test_bankrupt_players_refill_after_payout_only(self):
        g = self.game()
        g.action(0, "raise", 1000)
        self.assertEqual(g.players[0].stack, 0)
        g.players[0].cards = cards("2h 3h")
        g.players[1].cards = cards("As Ah")
        g.board = cards("4s 6h 8d Tc Qs")
        g.street = "river"
        g.action(1, "call")
        self.assertEqual([p.stack for p in g.players], [1000, 2000])
        g.start()
        self.assertEqual(sum(p.stack + p.total for p in g.players), 3000)
        self.assertEqual(g.street, "preflop")

    def test_disconnected_bankrupt_player_does_not_refill(self):
        g = self.game()
        g.action(0, "raise", 1000)
        disconnect(g, "0")
        self.assertFalse(g.players[0].folded)
        g.players[0].cards = cards("2h 3h")
        g.players[1].cards = cards("As Ah")
        g.board = cards("4s 6h 8d Tc Qs")
        g.street = "river"
        g.action(1, "call")
        self.assertEqual([p.stack for p in g.players], [0, 2000])

    def test_leave_runs_out_allin_without_unnecessary_turn(self):
        g = self.game((1000, 20, 1000))
        g.action(0, "call")
        g.action(1, "call")
        g.action(2, "check")
        self.assertEqual(g.turn, 2)
        deadline = g.deadline
        disconnect(g, "0")
        self.assertEqual(g.street, "showdown")
        self.assertIsNone(g.turn)
        self.assertIsNone(g.deadline)
        self.assertTrue(deadline)

    def test_leave_keeps_current_turn_deadline(self):
        g = self.game((1000, 1000, 1000, 1000))
        deadline, turn = g.deadline, g.turn
        disconnect(g, "0")
        self.assertEqual((g.turn, g.deadline), (turn, deadline))
        self.assertTrue(g.players[0].folded)
        self.assertNotIn(0, g.pending)

    def test_departed_dealer_rotation_and_live_seat_indexes(self):
        for dealer in range(4):
            for departed in range(4):
                g = self.game((1000, 1000, 1000, 1000))
                g.dealer = dealer
                ids = [p.id for p in g.players]
                expected = next(ids[i % 4] for i in range(dealer + 1, dealer + 5) if i % 4 != departed)
                g.players[departed].connected = False
                g.remove_disconnected()
                self.assertEqual([p.id for p in g.players], ids)
                # Complete the hand before compacting its contribution ledger.
                g.street = "showdown"
                g.start()
                self.assertEqual(g.players[g.dealer].id, expected)
                self.assertEqual(len(g.players), 3)

    def test_random_hands_conserve_chips_and_terminate(self):
        rng = random.Random(42)
        finish = Game.finish
        for _ in range(300):
            stacks = [rng.randrange(1, 1001) for _ in range(rng.randrange(2, 5))]
            funded = 0
            def finish_and_refill(game, message, awards=None):
                nonlocal funded
                self.assertEqual(sum(p.stack for p in game.players), sum(stacks))
                funded = 1000 * sum(p.connected and p.stack == 0 for p in game.players)
                finish(game, message, awards)
            with patch.object(Game, "finish", finish_and_refill):
                g = self.game(stacks)
                for turn in range(200):
                    if g.turn is None: break
                    legal = g.legal(g.turn)
                    choice = rng.choice(["fold", "call", "raise", "leave"])
                    if choice == "leave":
                        departing = rng.choice([p for p in g.players if p.connected])
                        disconnect(g, departing.id)
                    elif choice == "raise" and legal["canRaise"]:
                        g.action(g.turn, choice, rng.randint(legal["minRaise"], legal["maxRaise"]))
                    else: g.action(g.turn, "fold" if choice == "fold" else "call")
                    self.assertTrue(all(p.stack >= 0 for p in g.players))
                    if g.turn is not None:
                        self.assertTrue(g.players[g.turn].connected)
                        self.assertFalse(g.players[g.turn].folded)
                        self.assertGreater(g.players[g.turn].stack, 0)
            self.assertEqual(g.street, "showdown")
            self.assertEqual(sum(p.stack for p in g.players), sum(stacks) + funded)


if __name__ == "__main__": unittest.main()
