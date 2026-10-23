# Backend security audit — 2026-10-22

Scope: FastAPI application, game authority/privacy, WebSocket admission and lifecycle, transport settings, production dependency resolution, and a proposed Debian 12 deployment. No connection to your VPS was made. Frontend UI and animations were not changed by this audit.

## Findings and disposition

| Severity | Finding | Disposition |
| --- | --- | --- |
| High | Broadcasts and socket closes awaited network I/O while holding the one shared game lock. A slow reader could delay unrelated rooms and timer maintenance. | Fixed: one writer per admitted socket, four queued outbound messages maximum, one-second send/close deadlines. State changes enqueue snapshots synchronously under the lock; network I/O happens outside it. A full queue disconnects that peer. |
| Medium | One source could create all ten rooms or occupy all forty sockets, including sockets still awaiting their first message. | Fixed: maximum two live rooms created per source IP and eight simultaneous sockets per IP, including handshakes/closing writers. Global limits remain ten rooms and forty sockets. |
| Medium, deployment-dependent | Proxy headers were disabled. Nginx would make all users share the proxy's IP budget. Trusting arbitrary forwarding headers instead would permit IP spoofing. | Fixed configuration support: `FORWARDED_ALLOW_IPS` defaults empty; explicitly set it to `127.0.0.1` for the supplied local Nginx example. Wildcard trust is rejected. Nginx overwrites incoming forwarding headers. Tests cover trusted and untrusted source addresses. |
| Low | Binary frames reached `receive_text()` and could produce an unhandled exception/log entry rather than a controlled protocol rejection. | Fixed: validate frame type, size, JSON and object shape before processing. Binary/oversized frames receive a bounded error and close. |
| Operational | An application socket cap alone does not bound incomplete HTTP headers, TLS handshakes, host CPU, memory, file descriptors or logs. | Supplied Nginx and systemd examples add edge limits, header timeouts, TLS, an unprivileged read-only service, CPU/memory/process/file limits, and bounded service logging. These examples are not installed or tested on Debian. |

## Existing protections reviewed

- State, cards, legal actions, turn deadlines and payouts are server-controlled. Requests cannot choose their acting player ID; identity is bound to the admitted socket. Hidden opponent cards are omitted from snapshots. The shuffle uses the operating system random source.
- Raise amounts must be integers within server-calculated bounds; booleans and out-of-range amounts are rejected. Stale and out-of-turn actions cannot place bets. No client-provided chip balances, board or hand scores are trusted.
- HTTP CORS and explicit WebSocket Origin checks allow the named frontend and local development origins. There are no account cookies, database queries, file upload endpoints, command execution endpoints or client-selected filesystem paths.
- Handshake: five seconds; message size: 512 characters at the application boundary and 1,024 bytes at the configured transport; incoming transport queue: four; compression: disabled. The launcher selects Uvicorn's explicit `websockets` backend so `ws_max_queue=4` is applied instead of relying on `auto` backend selection. At most fifteen messages in a rolling two-second window per socket; the sixteenth closes it.
- Twenty connection attempts per IP per minute. IP bookkeeping is capped at 2,048 addresses and expires after one minute. No pong for thirty seconds disconnects a client. Rooms idle for an hour expire. Empty rooms are removed. Admission and state mutation share one lock; all network writes and closes run outside it.
- Exactly one worker/replica is required: process-local caps are not distributed quotas.

## Verification

`python -m unittest server.test_engine server.test_server server.test_security -v` passed 43 tests. New regressions exercise slow writers, queue overflow, write/close deadlines, message order, binary/oversized frames, sender impersonation, handshake expiry, IP bookkeeping, per-IP/global socket caps, hosted-room quotas, launcher transport settings and forwarded-header spoofing. Existing game/privacy/lifecycle tests still pass, including 300 randomized hands with disconnect/refill accounting.

A separate loopback-only Uvicorn process also passed live WebSocket checks for two-player gameplay/card privacy, the per-IP room quota, rejection of 1,025-byte frames with close code 1009, controlled binary-frame rejection, and empty-room cleanup. `pip check`, Python compilation and `git diff --check` passed. The temporary audit server was stopped; the active LAN backend was not restarted and needs a restart to load these changes.

`pip-audit -r server/requirements.txt --format json --output server/dependency-audit.json` reported **no known vulnerabilities** in 19 resolved production packages on the Windows/Python 3.12 audit host. The JSON records versions checked. This is not proof that the code is vulnerability-free. Linux-only dependencies (including uvloop), the VPS Python/OpenSSL/kernel/Nginx packages, and future resolutions of unpinned transitive dependencies were not covered. Repeat the scan in the actual Debian virtual environment after installation and after dependency updates. pip-audit was installed only as a local auditing tool; it was not added as a server runtime dependency.

## Debian 12 deployment

Use `deploy/commonpoker.service` and `deploy/nginx.conf.example` as reviewable templates. Do not expose the development frontend or backend port 8000 publicly on the VPS.

1. Keep Debian security/LTS updates enabled. Debian 12 is now in LTS through June 30, 2028 on supported architectures; confirm your architecture and package coverage. Install the distribution's `python3-venv`, Nginx and your certificate tooling. Keep SSH access allowed before changing any firewall rules.
2. Place the checkout and virtual environment in `/opt/commonpoker`, owned by the administrator and readable by a dedicated `commonpoker` system user/group with no login shell. Create the venv with Debian's Python, update pip within that venv, and install `server/requirements.txt`. Do not run the application as root or make its source writable by the service account.
3. Install the service template under `/etc/systemd/system/commonpoker.service`. It binds only `127.0.0.1:8000`, trusts forwarding headers only from local Nginx, and runs one process. Do not set `LOCAL_ORIGIN` in production. The public frontend `https://commonpoker.vercel.app` is already allowed.
4. Point your backend domain's DNS at the VPS, provision a valid TLS certificate, and substitute the domain/certificate paths in the Nginx example before enabling it. It belongs in Nginx's `http` context. Preserve your existing default-host rejection and certificate-renewal/ACME configuration; this template is not an ACME setup. Validate with `sudo nginx -t` before reload.
5. Allow public 80/443 and the intended SSH port; keep 8000 closed externally on both IPv4 and IPv6. Do not publish a second replica, development Vite server or reload-mode Uvicorn process. If adding a CDN or another proxy, reassess real-IP handling using only that provider's verified proxy ranges.
6. Set the Vercel frontend's `VITE_API_URL` to `https://YOUR-BACKEND-DOMAIN` and rebuild it. This selects `wss://` for gameplay. Use HTTPS/WSS publicly, not the LAN HTTP addresses used during development.
7. Validate the service file with `systemd-analyze verify`, start it, check `/health` locally and over HTTPS, then play from two external clients. Confirm the IP quotas are per client, forwarded-header spoofing is ineffective, dead sockets disappear, and the backend cannot be reached directly on 8000.
8. Audit the installed Linux venv with pip-audit and keep the resulting package list. Configure rotation of Nginx error logs. The sample suppresses access logs and rate-limit rejection logs; the application service log has a rate ceiling.

The example service limits memory to 256 MiB and CPU to half of one core. These are initial ceilings, not measured capacity guarantees; run a ten-room test on your VPS before launch. Crossing the memory limit may restart the process and lose its in-memory rooms. The examples were reviewed against Nginx and systemd 252 documentation, but were not syntax-checked by those programs or exercised on Debian here.

## Deliberate residual limits

- **Anonymous service availability is finite.** Distributed clients can still fill ten rooms or forty sockets. Per-IP quotas reduce single-source abuse; they cannot distinguish a botnet from players. People sharing a NAT share the two-room/eight-socket budget. A room remains attributed to its creator's IP for its lifetime, even after host transfer.
- **No DDoS guarantee.** Nginx and application limits constrain normal request/frame abuse, not upstream bandwidth exhaustion or arbitrary TLS/TCP floods. Your hosting provider must supply volumetric protection if required.
- **No persistent identity/state.** Restart loses rooms; reconnect creates a new seat. There are no funds of value and automatic refills remain intentional.

Sources: [Uvicorn transport/proxy settings](https://uvicorn.dev/settings/), [Nginx WebSocket forwarding](https://nginx.org/en/docs/http/websocket.html), [Nginx request limits](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html), [Nginx connection limits](https://nginx.org/en/docs/http/ngx_http_limit_conn_module.html), [systemd 252 resource controls](https://www.freedesktop.org/software/systemd/man/252/systemd.resource-control.html), [Debian 12 support](https://www.debian.org/releases/bookworm/), [PyPA pip-audit](https://github.com/pypa/pip-audit).
