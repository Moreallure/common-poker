import asyncio
import contextlib
import os
import runpy
import time
import unittest
from collections import deque
from unittest.mock import patch

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from . import main
from .test_server import ORIGIN, WebSocketTestCase, state


class AdmissionTests(WebSocketTestCase):
    def test_one_ip_cannot_host_all_rooms(self):
        with contextlib.ExitStack() as stack:
            self.connect(stack, type="create")
            self.connect(stack, type="create")
            _, error = self.connect(stack, type="create")
            self.assertEqual(error["message"], "At most two hosted rooms per IP")
            self.assertEqual(len(main.rooms), 2)

    def test_pending_handshakes_count_towards_ip_socket_limit(self):
        with contextlib.ExitStack() as stack:
            for _ in range(8):
                stack.enter_context(self.client.websocket_connect("/ws", headers=ORIGIN))
            with self.assertRaises(WebSocketDisconnect):
                with self.client.websocket_connect("/ws", headers=ORIGIN): pass
            self.assertEqual(len(main.open_sockets), 8)
            self.assertFalse(main.rooms)

    def test_pending_handshakes_count_towards_global_socket_limit(self):
        with patch.object(main, "MAX_SOCKETS_PER_IP", 40), contextlib.ExitStack() as stack:
            for _ in range(40):
                # Exercise the global cap independently of the per-IP attempt budget.
                main.attempts.clear()
                stack.enter_context(self.client.websocket_connect("/ws", headers=ORIGIN))
            with self.assertRaises(WebSocketDisconnect):
                with self.client.websocket_connect("/ws", headers=ORIGIN): pass
            self.assertEqual(len(main.open_sockets), 40)

    def test_handshake_timeout_releases_socket(self):
        with patch.object(main, "HANDSHAKE_SECONDS", .02):
            with self.client.websocket_connect("/ws", headers=ORIGIN) as ws:
                with self.assertRaises(WebSocketDisconnect): ws.receive_json()
        self.assertFalse(main.open_sockets)
        self.assertFalse(main.connections)

    def test_ip_bookkeeping_is_bounded(self):
        for i in range(2048): main.attempts[str(i)] = deque([time.monotonic()], maxlen=20)
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect("/ws", headers=ORIGIN): pass
        self.assertEqual(len(main.attempts), 2048)

    def test_binary_and_oversized_frames_are_rejected(self):
        for joined in [False, True]:
            for payload in [b"binary", "x" * 513]:
                with self.subTest(joined=joined, payload_type=type(payload).__name__), contextlib.ExitStack() as stack:
                    if joined: ws, _ = self.connect(stack, type="create")
                    else: ws = stack.enter_context(self.client.websocket_connect("/ws", headers=ORIGIN))
                    if isinstance(payload, bytes): ws.send_bytes(payload)
                    else: ws.send_text(payload)
                    error = state(ws)
                    self.assertEqual(error["type"], "error")
                    self.assertEqual(error["message"], "Text messages only" if isinstance(payload, bytes) else "Message too large")
                    with self.assertRaises(WebSocketDisconnect): ws.receive_json()

    def test_payload_cannot_impersonate_another_seat(self):
        with contextlib.ExitStack() as stack:
            a, hosted = self.connect(stack, type="create")
            b, _ = self.connect(stack, type="join", room=hosted["room"])
            state(a)
            a.send_json({"type": "start"})
            current = state(a)
            state(b)
            before = [(p.stack, p.total) for p in main.rooms[hosted["room"]].players]
            b.send_json({"type": "action", "action": "fold", "turn": current["deadline"], "player": hosted["you"]})
            self.assertEqual(state(b)["message"], "It is not your turn")
            self.assertEqual(before, [(p.stack, p.total) for p in main.rooms[hosted["room"]].players])


class ProxyTests(unittest.TestCase):
    def test_forwarded_ip_only_honored_from_trusted_proxy(self):
        for source, expected in [("127.0.0.1", "198.51.100.7"), ("203.0.113.9", "203.0.113.9")]:
            main.rooms.clear(); main.connections.clear(); main.attempts.clear(); main.open_sockets.clear()
            app = ProxyHeadersMiddleware(main.app, trusted_hosts="127.0.0.1")
            with TestClient(app, client=(source, 50000)) as client:
                with client.websocket_connect("/ws", headers={**ORIGIN, "x-forwarded-for": "198.51.100.7"}) as ws:
                    ws.send_json({"type": "create", "name": "Proxy test"})
                    hosted = state(ws)
                    self.assertEqual(main.rooms[hosted["room"]].owner_ip, expected)


class LauncherTests(unittest.TestCase):
    def test_default_disables_proxy_trust_and_preserves_transport_limits(self):
        with patch.dict(os.environ, {"FORWARDED_ALLOW_IPS": ""}), patch("uvicorn.run") as run:
            runpy.run_module("server", run_name="__main__")
        config = run.call_args.kwargs
        self.assertFalse(config["proxy_headers"])
        self.assertEqual(config["workers"], 1)
        self.assertEqual(config["ws_max_size"], 1024)
        self.assertEqual(config["ws_max_queue"], 4)
        self.assertEqual(config["ws"], "websockets")
        self.assertFalse(config["ws_per_message_deflate"])

    def test_proxy_trust_requires_explicit_addresses(self):
        with patch.dict(os.environ, {"FORWARDED_ALLOW_IPS": "127.0.0.1"}), patch("uvicorn.run") as run:
            runpy.run_module("server", run_name="__main__")
        self.assertTrue(run.call_args.kwargs["proxy_headers"])
        self.assertEqual(run.call_args.kwargs["forwarded_allow_ips"], "127.0.0.1")

    def test_wildcard_proxy_trust_is_rejected(self):
        with patch.dict(os.environ, {"FORWARDED_ALLOW_IPS": "*"}), patch("uvicorn.run") as run:
            with self.assertRaises(ValueError): runpy.run_module("server", run_name="__main__")
        run.assert_not_called()


class FakeSocket:
    def __init__(self, slow=False):
        self.slow = slow
        self.started = asyncio.Event()
        self.closed = asyncio.Event()
        self.sent = []

    async def send_json(self, data):
        self.started.set()
        if self.slow: await asyncio.Event().wait()
        self.sent.append(data)

    async def close(self, **kwargs): self.closed.set()


class WriterTests(unittest.IsolatedAsyncioTestCase):
    async def test_unresponsive_close_is_bounded(self):
        class StuckCloseSocket(FakeSocket):
            async def close(self, **kwargs):
                self.closed.set()
                await asyncio.Event().wait()
        ws = StuckCloseSocket()
        peer = main.Peer(ws)
        peer.send({"n": 0})
        await peer.queue.join()
        peer.abort()
        await asyncio.wait_for(peer.task, 1.5)
        self.assertTrue(ws.closed.is_set())

    async def test_slow_reader_does_not_block_other_table(self):
        slow, fast = FakeSocket(slow=True), FakeSocket()
        a, b = main.Peer(slow), main.Peer(fast)
        try:
            self.assertTrue(a.send({"table": 1}))
            await slow.started.wait()
            self.assertTrue(b.send({"table": 2}))
            await asyncio.wait_for(b.queue.join(), .2)
            self.assertEqual(fast.sent, [{"table": 2}])
            self.assertFalse(slow.closed.is_set())
        finally:
            a.abort(); b.abort()
            await asyncio.gather(a.task, b.task)

    async def test_overflow_closes_slow_reader_without_growing_queue(self):
        ws = FakeSocket(slow=True)
        peer = main.Peer(ws)
        peer.send({"n": 0})
        await ws.started.wait()
        for n in range(4): self.assertTrue(peer.send({"n": n + 1}))
        self.assertFalse(peer.send({"n": 5}))
        self.assertEqual(peer.queue.qsize(), 4)
        await asyncio.wait_for(peer.task, .2)
        self.assertTrue(ws.closed.is_set())

    async def test_send_timeout_closes_slow_reader(self):
        ws = FakeSocket(slow=True)
        peer = main.Peer(ws)
        peer.send({"n": 0})
        await asyncio.wait_for(peer.task, 1.5)
        self.assertTrue(ws.closed.is_set())

    async def test_state_messages_keep_their_order(self):
        ws = FakeSocket()
        peer = main.Peer(ws)
        try:
            for n in range(4): peer.send({"n": n})
            await asyncio.wait_for(peer.queue.join(), .2)
            self.assertEqual(ws.sent, [{"n": n} for n in range(4)])
        finally:
            peer.abort()
            await peer.task
