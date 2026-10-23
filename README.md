# Common Poker

Lightweight, multiplayer Texas Hold’em with a React frontend and an authoritative FastAPI WebSocket backend. Play chips only.

## Run locally

From the repository root (Python 3.11+):

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r server/requirements.txt
.\.venv\Scripts\python.exe -m server
```

In another terminal:

```powershell
cd web
npm ci
npm run dev
```

Open `http://localhost:5173`, enter a name and host a room. Enter 1–6 digits to choose a custom room number, or leave it blank for a random number. Occupied numbers are rejected. Share the room number with another player. The host deals when at least two players have chips. Use separate browser tabs to try multiplayer locally.

The home-page lobby lists public tables with an open seat between hands. New tables are private by default and stay out of the lobby; turn off **Private table** when hosting to make one discoverable. Use **Refresh** to check for new public tables. Full tables and hands in progress are omitted; the server rechecks availability when you join. `GET /rooms` returns public room numbers, host display names, seat counts, . Existing reverse proxies must forward `/rooms` to the backend, as shown in `server/deploy/nginx.conf.example`.

Inside a room, the current host can open **Settings** to change public visibility and adjust privacy settings. Private tables can be joined directly by room number. Use HTTPS/WSS outside local development.

For LAN testing, run Vite with `npm run dev -- --host 0.0.0.0`, set backend `HOST=0.0.0.0` and `LOCAL_ORIGIN` to the exact LAN frontend origin (e.g. `http://10.10.23.88:5173`). Without `VITE_API_URL`, the frontend connects to port 8000 on its own hostname. Stop any old localhost-only servers first: separate backend processes have separate rooms.

## Rules and behavior

- Two to four players; 1,000 chips on entry; fixed 10/20 blinds; no rake. Connected players with zero chips receive another 1,000 after the hand pays out.
- No-limit betting, including short all-ins, minimum raise/reopening rules, side pots, split pots and clockwise odd-chip allocation. Raise amounts are the **total for the current street**.
- Each action has a server-enforced 20-second deadline. Expiry folds, even when checking would be free. The client countdown is synchronized to server time.
- D means the player has acted on this street; X means folded. The number beside the badge is chips committed on this street. These reset on the next street. The dealer is labeled separately.
- Clients see their own cards; live opponents’ cards are revealed at showdown. Folded cards stay private. Cards are shuffled with Python’s system random source.
- Host explicitly deals each hand. The first connected player becomes host when the host leaves. New players can enter between hands only. At least two connected players are required to deal.
- Connections receive an application ping every 10 seconds and must pong; no pong for 30 seconds disconnects them. The browser closes an unresponsive server connection after 35 seconds. A departing player with chips folds; an all-in hand remains eligible for payout.
- Refresh/leave ends a seat’s connection. There is no session resumption. Departed seats disappear from the UI immediately; their hand contributions remain in the server ledger through payout. Disconnected seats are removed before the next deal or join between hands. Rejoining starts a new play-chip seat. Game state is ephemeral and disappears on server restart.

## Deploy

Set `VITE_API_URL` in Vercel to your HTTPS backend origin and redeploy. Local production environment files and the server-specific Nginx configuration are ignored by Git. Local development keeps its local backend URL.

Deploy `web/` to Vercel (build `npm run build`, output `dist`). `web/vercel.json` provides the game-route SPA fallback. Set `VITE_API_URL` to the **HTTPS origin of your backend** before building, e.g. `https://poker-api.example.com`. It defaults to `http://localhost:8000` for local development.

Run the backend on a host supporting persistent WebSockets, using `python -m server` with environment variable `HOST=0.0.0.0` and optionally `PORT` (default 8000). The launcher selects Uvicorn's `websockets` backend so the configured four-message incoming queue bound is applied, configures bounded frame sizes, disables WebSocket compression, and limits HTTP concurrency. Terminate TLS at the hosting proxy. Run **exactly one worker and one replica**: rooms, limits, and sockets are intentionally in memory. Do not deploy the backend as a Vercel function. `/health` returns process status and occupied room count.

Allowed HTTP and WebSocket origins are `https://commonpoker.vercel.app`, localhost and 127.0.0.1 on ports 5173 and 4173. WebSocket origins are checked explicitly in addition to HTTP CORS; preview deployments are not implicitly trusted. See FastAPI’s [CORS documentation](https://fastapi.tiangolo.com/tutorial/cors/).

Resource limits: 10 occupied rooms, four seats each, 40 simultaneous sockets including pending handshakes, eight sockets and two hosted rooms per source IP, five-second handshake timeout, 20 connection attempts per source IP per minute, at most 15 messages per rolling two seconds, 512-character application messages, and one-second send/close deadlines. Each socket has a four-message outbound queue; a slow consumer is closed without blocking other tables. IP rate-limit bookkeeping is capped at 2,048 addresses and expires after a minute. Empty rooms are removed; rooms idle for an hour expire. There are no per-room background tasks, database, chat, uploads or spectator sockets.

The launcher disables proxy headers by default. Behind local Nginx, set `FORWARDED_ALLOW_IPS=127.0.0.1` and overwrite forwarding headers at Nginx; wildcard trust is rejected. Preserve the launcher's transport backend and limits if substituting your own Uvicorn command. Private tables are hidden from the lobby, but room numbers are guessable invitations, not authentication. See the [security audit and Debian deployment notes](server/SECURITY.md) before public deployment.

## Checks

```powershell
.\.venv\Scripts\python.exe -m pip install -r server/requirements-dev.txt
.\.venv\Scripts\python.exe -m unittest server.test_engine server.test_server server.test_security -v
cd web
npm run build
npm run lint
```

Tests cover hand evaluation, heads-up ordering, street resets, hidden cards, illegal and stale actions, short raises, side pots/refunds, ties and odd chips, 300 randomized hands with disconnects and refill accounting, bankrupt-host departure and the next deal, dealer rotation after departures, join rejection during play, replacement seats, empty-room cleanup, deadlines, origin/CORS checks, room/seat caps, malformed messages, rate limits and heartbeat cleanup.

Browser regression check: host from the LAN frontend URL and join the code from localhost; both seats must appear and Deal must remain reachable. Make the table public in Settings and refresh the lobby in another tab. Join a nonexistent six-digit code; the home form must show the error and retain the entered room number without showing the table.
