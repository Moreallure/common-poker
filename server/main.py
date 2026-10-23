import asyncio
import json
import os
import re
import secrets
import time
from collections import deque
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .engine import Game, Player

ORIGINS = {"https://commonpoker.vercel.app", "http://localhost:5173", "http://127.0.0.1:5173",
           "http://localhost:5174", "http://127.0.0.1:5174",
           "http://localhost:5175", "http://127.0.0.1:5175",
           "http://localhost:4173", "http://127.0.0.1:4173"}
if os.getenv("LOCAL_ORIGIN"):
    ORIGINS.add(os.environ["LOCAL_ORIGIN"])
ALIVE_SECONDS = 30
HANDSHAKE_SECONDS = 5
MAX_SOCKETS_PER_IP = 8
MAX_ROOMS_PER_IP = 2
rooms = {}
connections = {}
attempts = {}
open_sockets = {}
gate = asyncio.Lock()


async def close(ws, code=1013, reason=""):
    with suppress(Exception):
        await asyncio.wait_for(ws.close(code=code, reason=reason), 1)


class Peer:
    def __init__(self, ws):
        self.ws = ws
        self.queue = asyncio.Queue(maxsize=4)
        self.task = asyncio.create_task(self.write())

    def send(self, data):
        if self.task.done() or self.task.cancelling(): return False
        try:
            self.queue.put_nowait(data)
            return True
        except asyncio.QueueFull:
            self.abort()
            return False

    def abort(self):
        if not self.task.done() and not self.task.cancelling(): self.task.cancel()

    async def write(self):
        try:
            while True:
                data = await self.queue.get()
                try:
                    await asyncio.wait_for(self.ws.send_json(data), 1)
                finally:
                    self.queue.task_done()
        except (Exception, asyncio.CancelledError):
            pass
        finally:
            await close(self.ws)


async def receive_message(ws):
    packet = await ws.receive()
    if packet["type"] == "websocket.disconnect":
        raise WebSocketDisconnect(packet.get("code", 1000))
    raw = packet.get("text")
    if not isinstance(raw, str): raise ValueError("Text messages only")
    if len(raw) > 512: raise ValueError("Message too large")
    data = json.loads(raw)
    if not isinstance(data, dict): raise ValueError("Invalid message")
    return data


def broadcast(game):
    # Network writes run in bounded per-peer queues, never under the game lock.
    for p in game.players:
        peer = connections.get(p.id)
        if peer: peer.send(game.snapshot(p.id))


def disconnect(game, pid):
    p = next((p for p in game.players if p.id == pid), None)
    if not p or not p.connected: return
    p.connected = False
    i = game.players.index(p)
    if game.street not in ("waiting", "showdown") and not p.folded and p.stack:
        if game.turn == i: game.action(i, "fold")
        else:
            p.folded = True
            game.pending.discard(i)
            live = [q for q in game.players if not q.folded]
            if len(live) == 1 or (sum(q.stack > 0 for q in live) <= 1
                                  and all(not q.stack or q.bet >= game.current for q in live)):
                game.advance(game.turn if game.turn is not None else i)
    game.updated = time.monotonic()


async def ticker():
    while True:
        await asyncio.sleep(.25)
        async with gate:
            for code, game in list(rooms.items()):
                if game.deadline and time.time() >= game.deadline:
                    if game.turn is not None and 0 <= game.turn < len(game.players):
                        game.action(game.turn, "fold")
                        broadcast(game)
                if not any(p.connected for p in game.players) or time.monotonic() - game.updated > 3600:
                    for p in game.players:
                        peer = connections.get(p.id)
                        if peer: peer.abort()
                    rooms.pop(code, None)
            for ip, times in list(attempts.items()):
                if not times or times[-1] < time.monotonic() - 60: attempts.pop(ip, None)


@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(ticker())
    yield
    task.cancel()
    with suppress(asyncio.CancelledError): await task


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(CORSMiddleware, allow_origins=sorted(ORIGINS), allow_methods=["GET"], allow_headers=[])


@app.get("/health")
async def health():
    return {"status": "ok", "games": len(rooms)}


@app.get("/rooms")
async def lobby(response: Response):
    response.headers["Cache-Control"] = "no-store"
    now = time.monotonic()
    async with gate:
        available = []
        for game in rooms.values():
            players = [p for p in game.players if p.connected]
            if (not game.private and game.street in ("waiting", "showdown") and 0 < len(players) < 4
                    and now - game.updated <= 3600):
                available.append({"room": game.code, "host": players[0].name,
                                  "players": len(players), "capacity": 4})
    return {"rooms": available}


@app.websocket("/ws")
async def gameplay(ws: WebSocket):
    if ws.headers.get("origin") not in ORIGINS:
        await close(ws, code=1008)
        return
    ip = ws.client.host if ws.client else "unknown"
    now = time.monotonic()
    if ip not in attempts and len(attempts) >= 2048:
        await close(ws)
        return
    times = attempts.setdefault(ip, deque(maxlen=20))
    if len(attempts) > 2048 or sum(t > now - 60 for t in times) >= 20 or len(open_sockets) >= 40 or sum(source == ip for source in open_sockets.values()) >= MAX_SOCKETS_PER_IP:
        await close(ws)
        return
    times.append(now)
    open_sockets[ws] = ip
    game, pid, peer = None, None, None
    try:
        await ws.accept()
        peer = Peer(ws)
        hello = await asyncio.wait_for(receive_message(ws), HANDSHAKE_SECONDS)
        name = hello.get("name", "")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 20: raise ValueError("Name must be 1–20 characters")
        code = hello.get("room")
        if hello.get("type") == "join" or "room" in hello:
            if not isinstance(code, str) or not re.fullmatch(r"[0-9]{1,6}", code):
                raise ValueError("Room number must be 1–6 digits")
        private = hello.get("private", True)
        if hello.get("type") == "create" and not isinstance(private, bool):
            raise ValueError("Private must be true or false")
        async with gate:
            if hello.get("type") == "create":
                if len(rooms) >= 10: raise ValueError("All 10 tables are occupied. Try later.")
                if sum(g.owner_ip == ip for g in rooms.values()) >= MAX_ROOMS_PER_IP:
                    raise ValueError("At most two hosted rooms per IP")
                if code is None:
                    code = str(secrets.randbelow(900000) + 100000)
                    while code in rooms: code = str(secrets.randbelow(900000) + 100000)
                elif code in rooms:
                    raise ValueError("Room number is already in use")
                game = Game(code, owner_ip=ip, private=private)
                rooms[code] = game
            elif hello.get("type") == "join":
                game = rooms.get(code)
                if not game: raise ValueError("Room not found")
                if game.street not in ("waiting", "showdown"): raise ValueError("Wait until the current hand ends to join")
                game.remove_disconnected()
                if len(game.players) >= 4: raise ValueError("Table is full")
            else: raise ValueError("Invalid handshake")
            pid = secrets.token_urlsafe(24)
            game.players.append(Player(pid, name.strip()))
            connections[pid] = peer
            game.updated = time.monotonic()
            broadcast(game)
        rate = deque(maxlen=16)
        last_pong = time.monotonic()
        next_ping = last_pong + 10
        while True:
            try:
                data = await asyncio.wait_for(receive_message(ws), 1)
            except asyncio.TimeoutError:
                data = None
            now = time.monotonic()
            if now - last_pong > ALIVE_SECONDS:
                await close(ws, code=1001, reason="Heartbeat timed out")
                break
            if now >= next_ping:
                if not peer.send({"type": "ping"}): break
                next_ping = now + 10
            if data is None: continue
            rate.append(now)
            if len(rate) == 16 and now - rate[0] < 2: raise ValueError("Too many messages")
            if data.get("type") == "pong":
                last_pong = now
                continue
            if data.get("type") == "settings":
                try:
                    async with gate:
                        if rooms.get(game.code) is not game: break
                        if not any(p.id == pid for p in game.players if p.connected):
                            raise ValueError("Must be in room to change room settings")
                        if not isinstance(data.get("private"), bool):
                            raise ValueError("Private must be true or false")
                        game.private = data["private"]
                        game.updated = time.monotonic()
                        broadcast(game)
                        peer.send({"type": "settings_saved"})
                except ValueError as exc:
                    peer.send({"type": "error", "scope": "settings", "message": str(exc)})
                continue
            async with gate:
                try:
                    if rooms.get(game.code) is not game: break
                    if data.get("type") == "start":
                        host = next(p.id for p in game.players if p.connected)
                        if pid != host: raise ValueError("Only the host can deal")
                        game.start()
                    elif data.get("type") == "action":
                        # Reject stale actions even if the timer task has not ticked yet.
                        if game.deadline and time.time() >= game.deadline:
                            game.action(game.turn, "fold")
                            broadcast(game)
                            raise ValueError("Action timed out")
                        if data.get("turn") != game.deadline: raise ValueError("Stale action; wait for table state")
                        i = next(i for i, p in enumerate(game.players) if p.id == pid)
                        game.action(i, data.get("action"), data.get("amount"))
                    else: raise ValueError("Unknown message")
                    game.updated = time.monotonic()
                    broadcast(game)
                except ValueError as exc:
                    peer.send({"type": "error", "message": str(exc)})
    except (ValueError, json.JSONDecodeError) as exc:
        peer.send({"type": "error", "message": str(exc)})
        # Let the validation error reach the client before closing its handshake.
        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(peer.queue.join(), 1)
        await close(ws, code=1008)
    except (WebSocketDisconnect, asyncio.TimeoutError, RuntimeError):
        pass
    finally:
        async with gate:
            connections.pop(pid, None)
            if game and pid:
                disconnect(game, pid)
                broadcast(game)
                if not any(p.connected for p in game.players) and rooms.get(game.code) is game:
                    rooms.pop(game.code)
        try:
            if peer:
                peer.abort()
                await peer.task
            await close(ws)
        finally:
            open_sockets.pop(ws, None)
