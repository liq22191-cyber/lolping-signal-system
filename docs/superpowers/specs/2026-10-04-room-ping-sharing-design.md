# Room ping sharing — Design Spec

**Date:** 2026-10-04
**Status:** Approved in brainstorming; not yet implemented
**Targets:** M1 → v0.3.0 (LAN), M2 → v0.4.0 (internet)
**Roadmap:** idea #2. Share mode (a viewer pings on a Discord/Zoom share window and it lands on the sharer's real screen) is idea #3, a separate spec that builds on this one.

## 1. Purpose

Let several lolPing users join a **room** and see each other's pings. A ping dropped on one machine appears on every other member's screen at the same relative spot, scaled to their resolution, with the sender's name under it.

This spec covers **fun mode**: whole screen to whole screen. The people in a room usually do *not* see each other's screen. They ping each other for fun, or they watch the same full-screen content.

**Success criteria:**
1. Two machines on the same network can create/join a room with a code and see each other's pings with no noticeable delay.
2. Pings land at the same relative position, on the matching display, regardless of resolution, aspect ratio or DPI.
3. It works across the internet (M2) without any server run or paid for by the project.
4. Nobody outside the room can read, inject or replay pings, even on public Wi-Fi or through public relays.
5. A flood of incoming pings can't freeze the app; receivers decide how much spam they accept.
6. Windows ↔ Windows, Windows ↔ macOS and macOS ↔ macOS all work.

## 2. Decisions log

| Topic | Decision |
|---|---|
| Scope | Networking layer + fun mode. Share-window mapping is idea #3; this spec leaves a `resolveTarget` hook for it (§6.3). |
| Group model | **Rooms.** Every ping goes to everyone in the room. Max **8** members. |
| Transport | **Hybrid.** Every room runs LAN discovery and internet signaling at once; per member, LAN wins when it works. M1 = LAN, M2 = internet. |
| Internet without a server | WebRTC data channels via **Trystero** (Nostr strategy) for signaling over free public relays, free public STUN, no TURN. |
| LAN or internet room? | Not a user choice. A room is a code; the path is chosen per member. "Allow internet connections" (default on) lets a user stay LAN-only. |
| Joining | Room code only, plus **Join from clipboard** (tray) and a join box pre-filled from the clipboard when the Room page opens. No invite links, no protocol handler, no hosted page. |
| Room code | `PING-XXXXX-XXXXX`, Crockford base32, 9 random characters + 1 check character (~45 bits). |
| Encryption | End-to-end: scrypt(code) → HKDF → AES-256-GCM. Same envelope on both transports. |
| Remote ping look | Same art, animation and sound as a local ping, plus a **name tag** in the sender's colour. |
| Profile | Display name (default: OS username, ≤16 chars) + tag colour (palette of 8, random on first run). |
| Resolution mapping | Position sent as a 0–1 fraction of the sender's display; stretched per axis on the receiver. Ping art is never distorted and uses the receiver's own size setting. |
| Multi-monitor | **Match by display number.** #1 = primary, the rest numbered left→right, then top→bottom. Missing number → primary. |
| What is shared | Only finished pings (wheel releases and trigger+click). Never the wheel itself, never settings previews. |
| Global toggle off | Neither send nor show; stay in the room; others see a `paused` badge. |
| Mute room | A separate switch (settings + tray): keep sending, drop incoming; others see a `muted` badge. |
| Per-person mute | Yes, session-only. |
| Rate limit | Receiver-side setting per member: 1–20 pings/s or **Unlimited** (default 5/s). A fixed safety ceiling sits underneath: ≤60 pings on screen, ≤8 overlapping sounds. |
| Rejoin | "Rejoin last room on launch", default on. |

## 3. User experience

### 3.1 Settings → Room page (new nav entry)

**Profile**
- **Name:** text field, OS username by default, max 16 characters.
- **Tag colour:** 8 swatches.

**Not in a room**
- `[Create room]`
- A join box (`PING-XXXXX-XXXXX`) + `[Join]`. It accepts a bare code or any text containing one, e.g. a whole pasted chat message.
- When the page opens, if the clipboard holds a room code, the join box is pre-filled with it. The clipboard is read only at that moment.
- A code with a wrong check character is rejected inline: "This code looks mistyped."

**In a room**
- The code in large text, with `[Copy code]` and `[Leave room]`.
- **Member list:** colour dot, name, connection badge (`LAN` · `Internet` · `Connecting…` · `Can't reach`), status badge (`paused` · `muted` · `needs update`), and a per-person mute button. You are listed first, marked "you".
- Alone in the room: "Waiting for others…". Still alone after 20 s, it adds: "Nobody here yet. Check that your friends typed the same code."
- **Network status line**, shown only when something is wrong: "LAN unavailable" / "Internet unavailable — can't reach signaling relays".

**Options**
- Mute room (switch)
- Incoming ping limit: slider 1–20 per second, plus an "Unlimited" end stop
- Allow internet connections (switch; M2)
- Rejoin last room on launch (switch)

**Displays:** read-only list of this machine's display numbers, e.g. `#1 Primary — 2560×1440`, `#2 — 1920×1080`, so people can see how pings map between machines.

**Privacy note** (small text at the bottom):
- Room members can see your IP address.
- With internet connections on, public Nostr relays see your IP address and an anonymous room ID, but never your pings or your name.

### 3.2 Tray

A "Room" submenu.

| State | Items |
|---|---|
| Not in a room | `Join from clipboard`, `Create room`, `Room settings…` |
| In a room | Disabled label `PING-XXXXX-XXXXX · 3 people`, then `Copy code`, `Mute room` (checkbox), `Leave room`, `Room settings…` |

`Join from clipboard` reads the clipboard once. If it holds no valid code, a toast says "No room code on the clipboard".

### 3.3 While playing

- A local ping looks and sounds exactly as today, and is also sent to the room.
- Incoming pings play the normal art and sound at the mapped spot, with a name tag under the ping in the sender's colour. They use the receiver's ping size, duration and volume settings.
- Toasts: "Alex joined", "Alex left" (after a `bye`), "Alex disconnected" (after a timeout), "Room is full", "Joined room PING-…".

## 4. Architecture

```
main process
 ├─ OverlayManager ── local pings (existing) · reports shared pings · spawnRemote(ping, tag)
 ├─ RoomManager ───── room state, members, crypto, validation, replay, rate limit, path choice, dedupe
 │    ├─ LanTransport        Node dgram: UDP broadcast presence + unicast messages      (M1)
 │    └─ InternetTransport   ⇄ IPC (opaque bytes) ⇄ hidden "net" BrowserWindow         (M2)
 │                                                    └─ Trystero (Nostr) + WebRTC
 └─ settings store / IPC / tray (extended)
overlay renderer: + reports wheel pings to main · + name tags · + safety ceiling
```

### 4.1 New and changed modules

| Module | Kind | Responsibility |
|---|---|---|
| `src/shared/roomCode.ts` | pure | generate (given random bytes), format, parse forgiving input, check character |
| `src/shared/roomProtocol.ts` | pure | message types; `validateMessage(unknown) → Message \| null`; name sanitising; `PROTOCOL_VERSION` |
| `src/shared/roomColors.ts` | pure | the 8 tag colours |
| `src/main/roomCrypto.ts` | Node crypto | `deriveRoomKeys(code) → {msgKey, sigRoomId, sigPassword}`; `seal(key, bytes)` / `open(key, bytes)` |
| `src/main/replayGuard.ts` | pure | per-peer sequence window + timestamp check |
| `src/main/rateLimiter.ts` | pure | per-member token bucket, with injectable clock |
| `src/main/displayNumbers.ts` | pure | display numbering; `toShared(displayId, x, y) → {d, x, y}`; `resolveTarget(d) → {displayId, width, height}` |
| `src/main/roomManager.ts` | logic | the room state machine (§6); talks to transports only via the `Transport` interface; emits `state`, `remotePing`, `toast` |
| `src/main/lanTransport.ts` | Node dgram | §5.4 |
| `src/main/internetTransport.ts` | main side of M2 | owns the hidden net window, restart policy, IPC of opaque bytes |
| `src/renderer/net/` | hidden renderer (M2) | Trystero room; forwards bytes and peer join/leave to main |
| `src/preload/net.ts` | preload (M2) | narrow API: `onCommand`, `sendBytes`, `peerJoined`, `peerLeft`, `status` |
| `src/main/overlayManager.ts` | changed | reports shared pings; `spawnRemote` |
| `src/renderer/overlay/*` | changed | report wheel pings; name tags; safety ceiling |
| `src/main/settingsIpc.ts`, `src/preload/settings.ts`, `src/shared/ipc.ts`, `settingsChannels.ts` | changed | room IPC (§7.2) |
| `src/renderer/settings/components/RoomSection.tsx` | new | the Room page |
| `src/main/tray.ts` | changed | Room submenu |
| `src/shared/settings.ts` | changed | new keys (§7.1) |
| `src/shared/i18n.ts` | changed | en + zh-CN strings for everything new |
| `src/main/index.ts` | changed | wiring |

### 4.2 Transport interface

```ts
type PeerKey = string; // transport-local address: "lan:192.168.1.20:47474" or "net:<trystero id>"
interface Transport extends EventEmitter {
  start(keys: RoomKeys): void;
  stop(): void;                                // sends nothing; RoomManager sends `bye` before calling stop
  sendTo(peer: PeerKey, packet: Uint8Array): void;
  broadcast(packet: Uint8Array): void;         // LAN: UDP broadcast; internet: every connected peer
  // events: 'packet' (peer: PeerKey, packet: Uint8Array), 'peerGone' (peer: PeerKey), 'status' (TransportStatus)
}
type TransportStatus = 'off' | 'starting' | 'ok' | 'unavailable';
```

Transports move **sealed packets only**. Keys, validation and every decision stay in `RoomManager`. A transport knows nothing about members; RoomManager maps `PeerKey`s to members using the `peer` field inside decrypted messages.

### 4.3 How a ping is shared

**Sending**
1. **Wheel ping:** the overlay renderer, after `wheel.release()` chooses a slice, sends a new overlay → main message `overlay:pinged {id, x, y}` (CSS px inside that overlay). Main identifies the display from the sending `webContents`.
   **Trigger+click ping:** main already has the id and the point, from `OverlayManager.handle('click')`.
   **Settings preview:** never reported; it goes through a different path (`previewPing`).
2. `OverlayManager` emits `shared {id, displayId, x, y}`. `displayNumbers.toShared` turns it into `{d, x: x/width, y: y/height}`.
3. `RoomManager.sendPing` builds the message, seals it once, and sends it to each member on that member's current path (§6.2). It does nothing when not in a room or globally paused.

**Receiving**
1. Transport `packet` → `RoomManager`.
2. The packet goes through: decrypt → validate → replay guard → member exists → drop if paused, room muted or member muted → rate limiter.
3. `resolveTarget(d)` gives the target display, and the overlay-local point is `x·width, y·height`.
4. `OverlayManager.spawnRemote` sends `ping:spawn {id, x, y, tag: {name, color}}` to that display's overlay.

## 5. Protocol & security

### 5.1 Room code

- Alphabet: Crockford base32 `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (no I, L, O, U).
- 9 random characters from the OS CSPRNG, plus 1 check character: **Luhn mod 32** over the 9. It catches every single-character error and most adjacent swaps.
- Display form: `PING-` + characters 1–5 + `-` + characters 6–10.
- **Parsing:** split the input into tokens on anything but letters, digits and dashes (dashes are removed inside a token), and map `O→0`, `I→1`, `L→1`. Candidates, most trusted first; the first one whose check character passes wins:
  1. A `PING` code anywhere in the text, whose token boundaries fall where the display form's do (after `PING`, and after 5 more): `PING-XXXXX-XXXXX`, `PING XXXXX XXXXX`, `PING XXXXXXXXXX`.
  2. The whole input as one code, however it is spaced. With spaces it must contain a real digit.
  3. A lone 10-character token inside longer text, only if it contains a real digit.
  - Neighbouring words are never glued onto a code. Gluing them made ordinary chat read as codes, so "Team, please join: PING-…" joined the room `TEAMP1EASE`.
  - **Strict mode**, for the clipboard (tray "Join from clipboard", join box pre-fill): only candidate 1, or a clipboard that is nothing but a code containing a real digit.
  - "Mistyped" is reported only when a `PING` code or the whole input is code-shaped but fails the check.
- The canonical form (10 characters, no prefix) is what keys are derived from.

### 5.2 Keys

- `master = scrypt(canonicalCode, salt = "lolping/room/v1", N = 2^15, r = 8, p = 1, dkLen = 32)`. Runs async in main, ~50–100 ms once per join.
- From `master` via HKDF-SHA256 (no salt), each 32 bytes:
  - `msgKey` (`info = "msg"`): AES-256-GCM for every message.
  - `sigRoomId` (`info = "sig-room"`, hex): Trystero room ID (M2).
  - `sigPassword` (`info = "sig-pw"`, hex): Trystero password, which encrypts its SDP signaling (M2).
- `msgKey` never leaves the main process. The net window only ever gets `sigRoomId` / `sigPassword`.
- At ~45 bits behind scrypt, offline guessing of a code seen as a relay topic is impractical. Online guessing on a LAN gets nowhere: wrong keys simply fail to decrypt.

### 5.3 Envelope and messages

**Envelope:** `[1 byte format = 0x01][12-byte random nonce][AES-256-GCM ciphertext ‖ 16-byte tag]`, AAD = the format byte. Packets over 1200 bytes are never sent and are dropped on receipt.

**Plaintext:** UTF-8 JSON. Every message has:

```
{ "t": "presence" | "ping" | "bye", "peer": <16 hex chars, random per join>, "seq": <uint, +1 per message, from 1 per join>, "ts": <ms since epoch> }
```

| `t` | Extra fields | Sent |
|---|---|---|
| `presence` | `proto` (int, `PROTOCOL_VERSION` = 1), `app` (semver string), `name` (string), `color` (0–7), `status` (`on` / `paused` / `muted`) | LAN: broadcast every 2 s, on join, on any change, and unicast to a newly seen peer. Internet: on peer connect, on change, every 10 s. |
| `ping` | `ping` (PingId), `d` (int 1–16), `x`, `y` (numbers in [0, 1], rounded to 4 decimals) | on each local ping |
| `bye` | — | on leave and on quit (best effort) |

**Validation** (`validateMessage`): drop anything that doesn't match exactly.
- `ping` must be a known `PingId`. `d`, `x`, `y` must be finite and in range. `color` must be an integer 0–7. `status` must be one of the listed values.
- `peer` must be 16 lower-case hex characters. `seq` must be a safe integer.
- `name`: strip C0/C1 control characters, bidi controls (U+200E/F, U+202A–E, U+2066–9) and zero-width characters, then trim and cut to 16 code points. If empty, use "Player".
- Unknown extra fields are ignored, for forward compatibility.
- A `presence` with a different `proto` marks the member "needs update", and that member's pings are ignored.

**Replay guard:**
- Reject when `|ts − now| > 10 min`.
- Per `peer`, keep the highest `seq` and a 64-wide bitmap: a duplicate or a seq older than the window is rejected.
- After a `bye`, everything from that `peer` is rejected for the rest of the session.
- This also does the dedupe when a message arrives over both paths.

**Name tags** are rendered with `textContent`, never HTML.

### 5.4 LAN transport

- One UDP socket on **port 47474**, bound to `0.0.0.0` with `setBroadcast(true)`. The port is a constructor parameter, so tests can use others.
- **Broadcast:** sends to `255.255.255.255` *and* to each up, non-internal IPv4 interface's directed broadcast address, computed from `os.networkInterfaces()`. Windows otherwise sends limited broadcast on one interface only. Interfaces are re-read every 5 s and on `powerMonitor` `resume`, and the socket is re-bound after a resume.
- **Unicast:** to the source address/port a peer's presence came from.
- **Flood guard before decryption** (`src/main/floodGuard.ts`):
  - Max 100 packets/s per source IP, **and 800/s from all sources together**, because source addresses are easy to spoof on a LAN.
  - At most 1024 source addresses are tracked; past that the per-address budgets start over.
  - Oversize packets are dropped.
- A member's LAN path counts as alive while a valid packet came from it in the last 6 s.
- **Bind failure** (port in use) → status `unavailable`. Retried on resume and on leave/rejoin.
- **VPNs:** works on virtual LANs that carry broadcast (ZeroTier, Radmin VPN). Tailscale drops broadcast, so Tailscale users connect over the internet path instead.
- **Windows Firewall:** the installer is per-user and not elevated, so it can't add a rule. The first time a room starts, Windows shows its own "allow access" prompt.
  - The Room page shows a one-time hint before that: allow lolPing, and make sure your Wi-Fi is a *Private* network, because the prompt's default doesn't cover Public networks.
  - "Can't see LAN friends?" help text repeats this.
- **macOS:** add `NSLocalNetworkUsageDescription` to `build.mac.extendInfo`. The macOS 15+ Local Network prompt appears at first room start.
  - Known limitation: ad-hoc-signed builds may re-ask for this, and for "accept incoming connections?", after updates.
  - **M1 spike, first task:** confirm UDP broadcast send/receive works for the ad-hoc-signed, non-sandboxed build once Local Network access is allowed. If broadcast is blocked, switch discovery to multicast group `239.255.47.74`. Same socket design, so nothing above the transport changes.

### 5.5 Internet transport (M2)

- **Hidden net window:** a `BrowserWindow` with `show: false`, `backgroundThrottling: false`, `sandbox: true`, `contextIsolation: true`, no Node integration. Its own renderer entry, `src/renderer/net/index.html`, served like the other renderers.
  - **CSP:** `default-src 'self'; connect-src` limited to the pinned relay list (`wss://…`). WebRTC itself isn't governed by CSP.
- **Trystero:**
  - `joinRoom({ appId: 'lolping', password: sigPassword, relayUrls: RELAYS, relayRedundancy: 3 }, sigRoomId)`.
  - One action channel carries packets as `Uint8Array`. Peer join/leave events are forwarded to main as `net:<trysteroPeerId>`.
  - `RELAYS` is a pinned list of public Nostr relays in `src/shared/relays.ts`, so the CSP and the code agree.
  - STUN: Trystero's defaults (public Google/Cloudflare STUN). No TURN.
- **Status:**
  - `ok` once at least one relay socket is open.
  - `unavailable` if none opens within 15 s; it keeps retrying in the background.
  - A peer whose WebRTC connection never completes stays `Connecting…`, and turns `Can't reach` after 20 s.
- **Crash:** `render-process-gone` → restart via a new `RestartPolicy` instance (same backoff as the hook helper). On `giveUp`: internet status `unavailable`, and a "Retry" button on the Room page.
- **"Allow internet connections" off:** the net window is never created, so no relay is ever contacted.

## 6. Room state machine (`RoomManager`)

### 6.1 Lifecycle

| Phase | Entered by | What happens |
|---|---|---|
| `idle` | start, leave | No transports running. |
| `joining` | create / join / rejoin on launch | Derive keys. Start LAN, and internet if allowed. Send presence. Then, after a 3 s settle window: if 8 or more other members are visible → send `bye`, stop, toast "Room is full", back to `idle`. Otherwise → `active`. |
| `active` | — | Normal operation. Saves `lastRoomCode`. |

- **Leave / quit:** send `bye` on all paths, stop the transports, and on leave clear `lastRoomCode`. Quitting keeps `lastRoomCode`, so rejoin on launch works.
- **Joining another room while in one:** leave first, then join.

### 6.2 Members and paths

- A member is created on its first valid `presence`. A `ping` from an unknown `peer` is dropped.
- Member record: `peer`, name, colour, status, proto/app versions, `lanKey?` + `lanSeenAt`, `netKey?` + `netConnected`, muted (local), rate-limit bucket.
- **Path:**
  - `LAN` if `now − lanSeenAt < 6 s`.
  - Otherwise `Internet` if `netConnected`.
  - Otherwise `Connecting…` for the first 20 s after first sight, then `Can't reach`.
- **Removal:** after a `bye` (toast "left"), or when neither path has been heard for 15 s (toast "disconnected").
- Your own `peer` is ignored if it is ever received.

### 6.3 Mapping and the share-mode hook

- `displayNumbers` numbers `screen.getAllDisplays()`: primary first as #1, the others sorted by `bounds.x`, then `bounds.y`, as #2, #3, … It is recomputed whenever `OverlayManager.rebuild()` runs.
- `resolveTarget(d)` returns the display numbered `d`, or #1 when there is none.
- **Hook for idea #3:** `RoomManager` takes `resolveTarget` as an injected function. Share mode will pass one that returns the detected share-window rect for a given sharer. Nothing else changes.

### 6.4 Status, mute and limits

- **Our status:** `paused` when globally disabled, else `muted` when room muted, else `on`. A presence is sent on every change.
- **Incoming drop order:** paused → room muted → member muted → member `needs update` → rate limiter.
- **Rate limiter:** token bucket per member, capacity = limit, refill = limit/s. `0` (Unlimited) skips it. Dropped pings are never queued.
- **Outgoing:** nothing is sent while paused; room muted still sends.
- **Safety ceiling** (overlay renderer, fixed, not a setting): at most **60** pings in the ping layer, where the oldest are removed early; at most **8** sounds playing at once, where extra sounds are skipped and the ping still shows. It applies to local pings too.

## 7. Settings and IPC

### 7.1 Settings keys

Added to `Settings` and `normalizeSettings`; `version` stays 1, and missing keys get defaults.

| Key | Type | Default | Normalising |
|---|---|---|---|
| `displayName` | string | OS username (`os.userInfo().username`), sanitised | same sanitiser as §5.3; empty → OS username → "Player" |
| `tagColor` | int 0–7 | random on first run | out of range → random |
| `incomingPingLimit` | int 0–20 | 5 | clamp; 0 = Unlimited |
| `allowInternet` | bool | true | — (UI from M2) |
| `rejoinRoom` | bool | true | — |
| `lastRoomCode` | string \| null | null | must parse as a valid code, else null |
| `roomMuted` | bool | false | — |

Per-person mute is not persisted: peer IDs change every launch.

### 7.2 IPC

**Settings window**
- `room:getState` → `RoomState`; `room:state` pushes `RoomState` on every change.
- `room:create`, `room:join(text)` → `{ok} | {ok: false, error: 'invalid' | 'mistyped'}`, `room:leave`.
- `room:muteMember(peer, on)`, `room:clipboardCode()` → `string | null` (main reads the clipboard once).
- `room:copyCode`, `room:retryInternet`.

```ts
interface RoomState {
  phase: 'idle' | 'joining' | 'active';
  code: string | null;                       // display form
  members: { peer: string; name: string; color: number; path: 'lan' | 'internet' | 'connecting' | 'unreachable';
             status: 'on' | 'paused' | 'muted'; needsUpdate: boolean; muted: boolean; self: boolean }[];
  lan: TransportStatus; internet: TransportStatus;
  aloneSinceMs: number | null;               // for the "nobody here yet" hint
  displays: { number: number; width: number; height: number; primary: boolean }[];
}
```

**Overlay**
- New main → overlay: `ping:spawn` gains an optional `tag?: { name: string; color: number }`.
- New overlay → main: `overlay:pinged {id, x, y}`, validated in main (known id, finite numbers).
- `site/overlayShim.ts` is updated so `npm run build:site` keeps compiling.

## 8. Failure handling

| Situation | Behaviour |
|---|---|
| UDP port in use / bind fails | LAN `unavailable`, shown on the Room page; internet unaffected |
| No relay reachable (M2) | Internet `unavailable`, retried in background; LAN unaffected |
| Net window crash (M2) | Restart with backoff; give up → `unavailable` + Retry |
| Sleep/resume, Wi-Fi change | Re-bind the LAN socket, re-read interfaces, re-announce presence; Trystero reconnects itself |
| Hook helper failed / no Accessibility | Can't send pings, still receives them |
| Display added/removed/changed | Numbering recomputed; the next ping uses the new layout |
| Mistyped code | Rejected by the check character before joining |
| Correct but unused code | Joins an empty room; "Nobody here yet" hint after 20 s |
| 9th member | Sees "Room is full", leaves on their own |
| Peer on another protocol version | Listed as "needs update"; their pings are ignored |
| Malformed / foreign / replayed packets | Dropped silently; LAN flood guard caps CPU before decryption |
| A device's clock is off by more than 10 min | Its packets fail the replay check and never add, refresh or reach a member: anyone on the network can replay old packets. After 3 such presences the Room page shows a room-level hint for 30 s: "A device trying to join has a clock more than 10 minutes off". It adds no row, doesn't count toward "full" and sends nothing back. |

## 9. Testing

**Unit tests** (vitest, CI on Windows and macOS)
- `tests/shared/roomCode.test.ts`: generate/format/parse round trip; forgiving input; every single-character substitution is caught; the code is extracted from surrounding chat text.
- `tests/main/roomCrypto.test.ts`: a fixed code gives fixed keys (known-answer vectors checked in, so both OSes must agree); seal/open round trip; a flipped byte, wrong key, truncated or oversize packet is rejected.
- `tests/shared/roomProtocol.test.ts`: every message type valid/invalid; junk (wrong types, NaN, ±Infinity, out-of-range values, huge strings, prototype-pollution keys); name sanitising with control/bidi/zero-width characters.
- `tests/main/replayGuard.test.ts`, `tests/main/rateLimiter.test.ts`: table tests with an injected clock, including Unlimited.
- `tests/main/displayNumbers.test.ts`: ordering, missing number → primary, mixed DPI, a sender display smaller or larger than the receiver's.
- `tests/main/roomManager.test.ts` with fake transports:
  - Joining → active; room full; LAN preferred and fallback to internet; dedupe across paths.
  - Timeouts → disconnected; `bye` → left and later packets ignored.
  - Paused / room muted / member muted / needs-update drops; own echo ignored.
  - Rate limiting; outgoing suppressed while paused.
- `tests/shared/settings.test.ts`: the new keys' normalising.

**Integration test:** `tests/main/lanRoom.test.ts`. Two `LanTransport` + `RoomManager` pairs in one process on `127.0.0.1` with distinct ports (test-only unicast seeding, since loopback has no broadcast). They discover each other, exchange a ping, one leaves, and the other sees `bye`.

**Manual checklist** (run before each release; recorded in the PR):
1. Windows ↔ Windows on the same Wi-Fi: create, join from clipboard, pings both ways, name tags, display mapping with different resolutions.
2. Windows ↔ macOS on the same Wi-Fi, including the Windows firewall prompt and the macOS Local Network prompt.
3. (M2) Windows ↔ macOS over the internet, one side on a phone hotspot; badge shows `Internet`.
4. Three or more members; Mute room; per-person mute; global toggle → `paused` badge.
5. Unlimited rate + spam: the app stays responsive, the safety ceiling holds.
6. Sleep/resume and Wi-Fi switch mid-room; rejoin on launch.
7. Mistyped code; empty room hint; 9th member sees "Room is full" (simulated with a test build lowering the cap).

## 10. Delivery

**M1 → v0.3.0 (LAN)**
1. Spike: macOS broadcast + Local Network permission (§5.4).
2. `prototype/room-demo.html`: a static mock of the Room settings page, to agree the layout before building it.
3. Shared pure modules, crypto, replay guard, rate limiter, display numbers.
4. `RoomManager` + `LanTransport` + tests.
5. Overlay changes (reporting, name tags, safety ceiling); OverlayManager wiring.
6. Settings keys, IPC, Room page, tray submenu, toasts; en + zh-CN strings.
7. macOS `NSLocalNetworkUsageDescription`.
8. Docs: a "Rooms" section in `docs/design.md` (and remove "There is no networking" from §1); README + README.zh-CN: rooms, the privacy note, the firewall/Private-network hint, the VPN tip.
9. Manual checklist items 1, 2, 4–7.

This spec is committed together with the finished, tested v0.3.0 work, not before.

**M2 → v0.4.0 (internet)**
1. Trystero dependency, pinned relay list, net renderer + preload + `InternetTransport`.
2. Path selection live, connection badges, "Allow internet connections" UI, relay status, Retry.
3. README: relays and IP exposure.
4. Manual checklist item 3 plus a re-run of the rest.

## 11. Out of scope

- Share mode / share-window detection (idea #3).
- TURN relays, or any server operated by the project.
- Invite links, a `lolping://` protocol handler, a hosted join page, a nearby-room browser.
- Persistent identities, kicking or banning. The remedy for an unwanted member is leaving and creating a new room.
- Sharing the wheel itself, chat, voice.
- IPv6 LAN discovery.
- Rooms larger than 8.
