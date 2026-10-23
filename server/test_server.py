import contextlib
import time
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from . import main
from .test_engine import cards
from .engine import Game, Player

ORIGIN = {"origin": "http://localhost:5173"}


def state(ws):
    while True:
        data = ws.receive_json()
        if data["type"] == "ping": ws.send_json({"type": "pong"})
        else: return data


class WebSocketTestCase(unittest.TestCase):
    def setUp(self):
        main.rooms.clear()
        main.connections.clear()
        main.attempts.clear()
        main.open_sockets.clear()
        self.client = TestClient(main.app)
        self.client.__enter__()

    def tearDown(self): self.client.__exit__(None, None, None)

    def connect(self, stack, **hello):
        ws = stack.enter_context(self.client.websocket_connect("/ws", headers=ORIGIN))
        ws.send_json({"name": "Tester", **hello})
        return ws, state(ws)


class ServerTests(WebSocketTestCase):
    def test_lobby_tracks_room_availability_and_host_transfer(self):
        with contextlib.ExitStack() as stack:
            a, hosted = self.connect(stack, type="create", room="42", name="Host", private=False)
            response = self.client.get("/rooms", headers=ORIGIN)
            self.assertEqual(response.headers["cache-control"], "no-store")
            self.assertEqual(response.json(), {"rooms": [
                {"room": "42", "host": "Host", "players": 1, "capacity": 4}]})
            b, _ = self.connect(stack, type="join", room="42", name="Guest")
            state(a)
            self.assertEqual(self.client.get("/rooms").json()["rooms"][0]["players"], 2)
            a.send_json({"type": "start"})
            current = state(a)
            state(b)
            self.assertEqual(self.client.get("/rooms").json(), {"rooms": []})
            a.send_json({"type": "action", "action": "fold", "turn": current["deadline"]})
            state(a); state(b)
            self.assertEqual(len(self.client.get("/rooms").json()["rooms"]), 1)
            a.close()
            state(b)
            self.assertEqual(self.client.get("/rooms").json(), {"rooms": [
                {"room": "42", "host": "Guest", "players": 1, "capacity": 4}]})

    def test_lobby_omits_full_empty_expired_and_running_tables(self):
        for code, count in [("1", 4), ("2", 0), ("3", 1), ("4", 2), ("5", 4)]:
            game = main.rooms[code] = Game(code)
            game.players = [Player(str(i), "Player") for i in range(count)]
        main.rooms["5"].private = False
        main.rooms["3"].updated -= 3601
        main.rooms["4"].street = "preflop"
        main.rooms["5"].players[0].connected = False
        self.assertEqual(self.client.get("/rooms").json(), {"rooms": [
            {"room": "5", "host": "Player", "players": 3, "capacity": 4}]})

    def test_host_settings_control_lobby(self):
        with contextlib.ExitStack() as stack:
            host, first = self.connect(stack, type="create", room="81")
            guest, _ = self.connect(stack, type="join", room="81")
            state(host)
            # Any seated player can configure room settings
            guest.send_json({"type": "settings", "private": True})
            guest_state = state(guest)
            self.assertTrue(guest_state["private"])
            self.assertEqual(state(guest)["type"], "settings_saved")
            state(host)
            self.assertTrue(main.rooms["81"].private)
            host.send_json({"type": "settings", "private": False})
            updated = state(host)
            self.assertFalse(updated["private"])
            self.assertEqual(state(host)["type"], "settings_saved")
            state(guest)
            listed = self.client.get("/rooms").json()["rooms"][0]
            self.assertEqual(listed["room"], "81")

    def test_invalid_settings_do_not_mutate_room(self):
        with contextlib.ExitStack() as stack:
            host, _ = self.connect(stack, type="create", room="83")
            for settings in [{"private": 1}, {"private": "invalid"}]:
                host.send_json({"type": "settings", **settings})
                self.assertEqual(state(host)["scope"], "settings")
                self.assertTrue(main.rooms["83"].private)

    def test_private_rooms_are_hidden_but_joinable_by_room_number(self):
        with contextlib.ExitStack() as stack:
            host, hosted = self.connect(stack, type="create", room="314159")
            self.assertTrue(hosted["private"])
            self.assertEqual(self.client.get("/rooms").json(), {"rooms": []})
            guest, joined = self.connect(stack, type="join", room="314159")
            self.assertTrue(joined["private"])
            self.assertEqual(len(joined["players"]), 2)
            state(host)

    def test_create_rejects_non_boolean_private_option(self):
        with contextlib.ExitStack() as stack:
            _, rejected = self.connect(stack, type="create", room="51", private=1)
            self.assertEqual(rejected["message"], "Private must be true or false")
            self.assertNotIn("51", main.rooms)

    def test_origin_and_cors(self):
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect("/ws", headers={"origin": "https://evil.example"}): pass
        self.assertEqual(self.client.get("/health", headers=ORIGIN).headers["access-control-allow-origin"], ORIGIN["origin"])
        self.assertNotIn("access-control-allow-origin", self.client.get("/health", headers={"origin": "https://evil.example"}).headers)

    def test_custom_room_numbers_can_be_hosted_and_joined(self):
        for code in ["0", "7", "01", "123", "123456"]:
            with self.subTest(code=code), contextlib.ExitStack() as stack:
                a, hosted = self.connect(stack, type="create", room=code)
                b, joined = self.connect(stack, type="join", room=code)
                self.assertEqual(hosted["room"], code)
                self.assertEqual(joined["room"], code)
                self.assertEqual(len(joined["players"]), 2)

    def test_duplicate_room_number_does_not_replace_existing_game(self):
        with contextlib.ExitStack() as stack:
            a, hosted = self.connect(stack, type="create", room="42")
            game = main.rooms["42"]
            _, rejected = self.connect(stack, type="create", room="42")
            self.assertEqual(rejected["message"], "Room number is already in use")
            self.assertIs(main.rooms["42"], game)
            self.assertEqual(game.players[0].id, hosted["you"])
            self.assertTrue(game.players[0].connected)

    def test_invalid_room_numbers_are_rejected_for_create_and_join(self):
        for operation in ["create", "join"]:
            # Reset only the connection rate budget between validation cases.
            for code in ["", "1234567", "a1", "1.2", "-1", " 1", "１２", 1, None]:
                main.attempts.clear()
                with self.subTest(operation=operation, code=code), contextlib.ExitStack() as stack:
                    _, rejected = self.connect(stack, type=operation, room=code)
                    self.assertEqual(rejected["message"], "Room number must be 1–6 digits")
                    self.assertFalse(main.rooms)

    def test_gameplay_privacy_timeout_and_host_transfer(self):
        with contextlib.ExitStack() as stack:
            a, first = self.connect(stack, type="create")
            b, second = self.connect(stack, type="join", room=first["room"])
            state(a)
            b.send_json({"type": "start"})
            self.assertEqual(state(b)["type"], "error")
            a.send_json({"type": "start"})
            sa, sb = state(a), state(b)
            self.assertTrue(sa["players"][0]["cards"][0].get("rank"))
            self.assertEqual(sa["players"][1]["cards"], [{}, {}])
            self.assertEqual(sb["players"][0]["cards"], [{}, {}])
            a.send_json({"type": "action", "action": "call", "turn": -1})
            self.assertEqual(state(a)["type"], "error")
            main.rooms[first["room"]].deadline = time.time() - 1
            self.assertEqual(state(a)["street"], "showdown")
            state(b)
            a.close()
            transferred = state(b)
            self.assertEqual(transferred["host"], second["you"])

    def test_room_and_seat_caps(self):
        with patch.object(main, "MAX_ROOMS_PER_IP", 10), patch.object(main, "MAX_SOCKETS_PER_IP", 40), contextlib.ExitStack() as stack:
            a, first = self.connect(stack, type="create")
            for _ in range(3): self.connect(stack, type="join", room=first["room"])
            _, rejected = self.connect(stack, type="join", room=first["room"])
            self.assertEqual(rejected["message"], "Table is full")
            for _ in range(9): self.connect(stack, type="create")
            _, rejected = self.connect(stack, type="create")
            self.assertIn("10 tables", rejected["message"])
            self.assertEqual(len(main.rooms), 10)

    def test_bad_messages_and_rate_limit(self):
        with contextlib.ExitStack() as stack:
            ws, _ = self.connect(stack, type="create")
            ws.send_text("[]")
            self.assertEqual(state(ws)["message"], "Invalid message")
        with contextlib.ExitStack() as stack:
            ws, _ = self.connect(stack, type="create")
            for _ in range(16): ws.send_json({"type": "pong"})
            self.assertEqual(state(ws)["message"], "Too many messages")

    def test_bankrupt_host_leaves_and_next_host_can_deal(self):
        with contextlib.ExitStack() as stack:
            a, first = self.connect(stack, type="create")
            b, second = self.connect(stack, type="join", room=first["room"])
            c, third = self.connect(stack, type="join", room=first["room"])
            state(a); state(a); state(b)
            a.send_json({"type": "start"})
            sa = state(a)
            state(b); state(c)
            game = main.rooms[first["room"]]
            game.street = "river"
            game.board = cards("4s 6h 8d Tc Qs")
            for p, hand in zip(game.players, ["2h 3h", "As Ah", "Ks Kh"]):
                p.cards = cards(hand)
            a.send_json({"type": "action", "action": "raise", "amount": 1000, "turn": sa["deadline"]})
            state(a); sb = state(b); state(c)
            b.send_json({"type": "action", "action": "call", "turn": sb["deadline"]})
            state(a); state(b); sc = state(c)
            c.send_json({"type": "action", "action": "call", "turn": sc["deadline"]})
            settled = state(a)
            state(b); state(c)
            self.assertEqual(settled["street"], "showdown")
            self.assertEqual([p["stack"] for p in settled["players"]], [1000, 3000, 1000])
            a.close()
            transferred = state(b)
            state(c)
            self.assertEqual(transferred["host"], second["you"])
            self.assertEqual([p["id"] for p in transferred["players"] if p["connected"]], [second["you"], third["you"]])
            b.send_json({"type": "start"})
            next_hand = state(b)
            state(c)
            self.assertEqual(next_hand["street"], "preflop")
            self.assertEqual(len(next_hand["players"]), 2)
            self.assertTrue(all(p["connected"] for p in next_hand["players"]))

    def test_last_player_waits_for_join_then_can_deal(self):
        with contextlib.ExitStack() as stack:
            a, first = self.connect(stack, type="create")
            b, second = self.connect(stack, type="join", room=first["room"])
            state(a)
            a.close()
            self.assertEqual(state(b)["host"], second["you"])
            b.send_json({"type": "start"})
            self.assertIn("two connected", state(b)["message"])
            c, joined = self.connect(stack, type="join", room=first["room"])
            self.assertEqual(len(joined["players"]), 2)
            state(b)
            b.send_json({"type": "start"})
            self.assertEqual(state(b)["street"], "preflop")
            state(c)

    def test_midhand_join_rejected_and_acting_host_leave_finishes_hand(self):
        with contextlib.ExitStack() as stack:
            a, first = self.connect(stack, type="create")
            b, second = self.connect(stack, type="join", room=first["room"])
            state(a)
            a.send_json({"type": "start"})
            state(a); state(b)
            _, rejected = self.connect(stack, type="join", room=first["room"])
            self.assertIn("current hand", rejected["message"])
            self.assertEqual(len(main.rooms[first["room"]].players), 2)
            a.close()
            settled = state(b)
            self.assertEqual(settled["host"], second["you"])
            self.assertEqual(settled["street"], "showdown")
            self.assertIsNone(settled["deadline"])
            self.assertIsNone(settled["legal"])
            self.assertEqual(settled["players"][1]["stack"], 1010)

    def test_empty_room_freed_after_last_player_leaves(self):
        with contextlib.ExitStack() as stack:
            ws, first = self.connect(stack, type="create")
            ws.close()
            for _ in range(50):
                if first["room"] not in main.rooms: break
                time.sleep(.01)
            self.assertNotIn(first["room"], main.rooms)
            self.assertFalse(main.connections)

    def test_departed_seat_is_available_to_join(self):
        with contextlib.ExitStack() as stack:
            a, first = self.connect(stack, type="create")
            b, second = self.connect(stack, type="join", room=first["room"])
            c, _ = self.connect(stack, type="join", room=first["room"])
            d, _ = self.connect(stack, type="join", room=first["room"])
            state(a); state(a); state(a)
            b.close()
            # Drain join broadcasts before the departure snapshot.
            state(a)
            _, replacement = self.connect(stack, type="join", room=first["room"])
            self.assertEqual(len(replacement["players"]), 4)
            self.assertNotIn(second["you"], [p["id"] for p in replacement["players"]])
            self.assertTrue(all(p["connected"] for p in replacement["players"]))

    def test_dead_connection_removed(self):
        old = main.ALIVE_SECONDS
        main.ALIVE_SECONDS = .01
        try:
            with contextlib.ExitStack() as stack:
                ws, first = self.connect(stack, type="create")
                with self.assertRaises(WebSocketDisconnect): state(ws)
                time.sleep(.3)
                self.assertNotIn(first["room"], main.rooms)
                self.assertFalse(main.connections)
        finally: main.ALIVE_SECONDS = old


if __name__ == "__main__": unittest.main()
