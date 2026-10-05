# lolPing — Design Spec

**Date:** 2026-10-01
**Status:** Implemented in v0.1.0; wheel customization (Bait, Vision Cleared, drag-and-drop slots) added in v0.2.1; rooms over LAN added in v0.3.0 (§12)

## 1. Purpose

A personal desktop toy for Windows that recreates League of Legends' ping wheel anywhere on the desktop. Hold the trigger key (Alt by default), drag, and a League-style ping wheel opens. Release on a slice to drop that ping, with its animation and its original sound, at the point where the wheel opened.

- **Audience:** a single user on their own machine. Since v0.3.0, users on the same network can also join a room and see each other's pings (§12).
- **Capture:** pings must appear in whole-screen capture (Discord "Screen", OBS Display Capture, screenshots). Single-window capture is not supported.
- **Success criteria:**
  1. Alt+drag opens the wheel over any normal app without that app receiving the drag.
  2. Releasing on a slice shows the ping with animation and sound with no noticeable delay.
  3. With the option off, Alt+click behaves as it did without lolPing.
  4. A hotkey turns everything on and off.
  5. The settings UI follows Fluent design.

## 2. Decisions log

| Topic | Decision |
|---|---|
| Platform | Windows 11 only, multi-monitor, mixed DPI (user has two displays) |
| Stack | Electron (TypeScript) + React + Fluent UI React v9 for the UI. A small native C++ helper handles global input. |
| Default trigger | Hold **Alt** and drag with the left mouse button to open the wheel. |
| Trigger + click (no drag) | Configurable, **off** by default. Off: the click passes through untouched. On: it places a **generic** ping and the click is swallowed. |
| Toggle | A global hotkey (default **Ctrl+Alt+P**) turns pinging on/off, mirrored in the tray. |
| Wheel slots | 8 slices, top then clockwise. Default: Danger, Push, On My Way, All In, Assist Me, Need Vision, Enemy Missing, Enemy Vision. The user can drag any of the 11 pings onto any slot, and pick the trigger+click ping (default Generic), in settings. |
| Excluded pings | Defend/Hold, Target, the yellow "caution" circle: they need a target, so they wait until lolPing can pick one |
| Textures | Only standard textures. **Never colourblind (`_cb`) variants.** |
| Sound | Original League sounds, extracted from the user's local install |

## 3. Assets

The assets are already extracted into the repo and ship with the app. They come from the user's local League install and are © Riot Games. The project will be published on GitHub with the assets bundled; the owner accepts the risk and will take it down if Riot asks.

### 3.1 Ping table (single source of truth: `src/shared/pings.ts`)

Slot is the default layout (`DEFAULT_WHEEL`); the user can rearrange it.

| id | Slot | Wheel icon (`assets/textures/`) | On-screen art | Sound (`assets/sounds/`) | Ring colour |
|---|---|---|---|---|---|
| `danger` | N | `pingwheel_retreatrender.png` | `pingwheel_retreatrender.png` | `SRP_12.wav` | `#ff3b55` |
| `push` | NE | `push.png` | `pingwheel_pushrender.png` | `SRP_9.wav` | `#35d27a` |
| `omw` | E | `omw.png` | `omw.png` (upright icon; the flat `omw` ground render looks wrong) | `OnMyWay.wav` | `#2e8bff` |
| `allin` | SE | `all_in.png` | `pingwheel_allin_render_01.png` + `_02.png` (two halves that clash together) | `SRP_4.wav` | `#f2b320` |
| `assist` | S | `assist_me.png` | `assist_me.png` | `ComeHere.wav` | `#56d43c` |
| `needvision` | SW | `need_vision.png` | `need_vision.png` | `SRP_7.wav` | `#56d43c` |
| `missing` | W | `enemy_missing.png` | `enemy_missing.png` | `MIA.wav` | `#f2c518` |
| `enemyvision` | NW | `enemy_vision.png` | `pingwheel_enemyvisionrender.png` | `AreaIsWarded.wav` | `#ff3b55` |
| `generic` | (trigger+click) | `generic_ping.png` | `pingwheel_basicpingrender.png` | `Base.wav` | `#2e8bff` |
| `bait` | — | `pingwheel_baitrender.png` | `pingwheel_baitrender.png` (the hook; also used as the icon) | `SRP_11.wav` | `#efbc12` |
| `visioncleared` | — | `vision_cleared.png` | `pingwheel_visionclearedrender.png` | `SRP_6.wav` | `#2b80ff` |
| wheel tick | — | — | — | `button.wav` | — |

Unused extracted files stay in `assets/` but are never referenced: the `_cb` textures, `caution`, `hold`, `target`, the `pingwheel_*` renders not listed above, and the other sounds (`SRP_13.wav` is the structure-defend ping).

### 3.2 Asset pipeline (already run; kept reproducible)

The extraction scripts live in `tools/extract-assets/`, together with a README. Each step:

1. **Textures:** DDS (DXT5) → PNG with Pillow. Bait and Vision Cleared come straight from League's `.tex` files in `Global.wad.client` (`--wad-textures`).
   No game file maps those two pings to their sounds; `SRP_11` (Bait) and `SRP_6` (Vision Cleared) were identified by ear.
2. **Sound banks:** read the WAD v3 table of contents with a small Python reader (Python 3.14 has built-in zstd). Names come from CommunityDragon's `hashes.game.txt` list, filtered to sound banks. The ping banks are in `DATA/FINAL/Maps/Shipping/Common.wad.client`:
   - `assets/sounds/wwise2016/sfx/shared/hud_global_events.bnk`
   - `assets/sounds/wwise2016/sfx/shared/hud_global_audio.bnk`
3. **Event → clip mapping:**
   - Event names (`Play_sfx_hud_base_Pings_*`) come from string search in the game's `.bin` files.
   - The bank's HIRC section is walked from event → action → layer container → sound → embedded WEM id.
   - The event id is the FNV-1 32-bit hash of the lower-cased event name.
4. **Decoding:** the clips are Wwise Vorbis (`0xFFFF`), decoded with `vgmstream-cli` (r2117).
5. **Mixing:** layer containers play their children at the same time. They are mixed with ffmpeg `amix` plus `alimiter` (limit −1 dB) to avoid clipping. Each file has at most 35 ms of silence at the start.

## 4. Architecture

```
┌──────────────────────────── Electron app ────────────────────────────┐
│ main process                                                         │
│  ├─ InputBridge     spawns/supervises hook-helper.exe, JSON lines    │
│  ├─ OverlayManager  one transparent overlay window per display       │
│  ├─ SettingsStore   %APPDATA%\lolPing\settings.json, pushes changes  │
│  ├─ Tray            enable/disable, settings, quit, status icon      │
│  └─ SettingsWindow  React + Fluent UI v9, Mica backdrop              │
│ overlay renderer (per display): wheel + ping animations + Web Audio  │
└───────────────▲──────────────────────────────────────────────────────┘
                │ stdin: config/commands   stdout: input events (JSON lines)
┌───────────────┴───────────────┐
│ hook-helper.exe (C++ / Win32) │  WH_MOUSE_LL + WH_KEYBOARD_LL on a
│ no runtime deps, per-monitor  │  dedicated thread with its own message
│ DPI aware v2                  │  loop; decides pass-through vs swallow
└───────────────────────────────┘
```

**Why a separate helper process:**
- Only a low-level hook can swallow the Alt+drag so the app underneath doesn't drag or select text. Node global-hook libraries can only listen.
- Windows silently removes a low-level hook that responds slowly, so it can't live on Electron's busy main thread.
- A tiny dedicated process responds in microseconds and is isolated from renderer and GC pauses.

### 4.1 Repository layout

```
lolPing/
  package.json                 electron-vite + electron-builder
  electron.vite.config.ts
  src/
    main/                      index.ts, inputBridge.ts, restartPolicy.ts, overlayManager.ts,
                               settingsStore.ts, settingsIpc.ts, settingsWindow.ts, tray.ts,
                               coords.ts, paths.ts, appProtocol.ts, safePath.ts
    preload/                   overlay.ts, settings.ts  (contextBridge APIs)
    renderer/
      overlay/                 index.html, main.ts, wheel.ts, pingFx.ts, soundBank.ts, toast.ts, overlay.css
      settings/                index.html, App.tsx, useAppState.ts, components/ (Fluent UI)
    shared/                    pings.ts, settings.ts (schema + defaults), keys.ts,
                               protocol.ts (helper messages), ipc.ts, geometry.ts
  native/hook-helper/          build.cmd (MSVC via vswhere), build.sh (macOS), run.mjs, src/ main_win.cpp,
                               hooks_win.cpp, simulate.cpp, decision.{h,cpp} (pure logic), commands, json, output,
                               macOS: main_posix.cpp, hooks_mac.cpp, macinput.{h,cpp}; tests/
  assets/textures, assets/sounds
  tools/extract-assets/
  prototype/                   throwaway demos (wheel-demo.html, settings-demo.html)
  docs/design.md               this document
```

## 5. Hook helper

### 5.1 Input decision logic (pure, unit-tested state machine in `decision.cpp`)

States: `Idle`, `Pending` (trigger held + button down, not yet moved past the threshold), `Wheel` (wheel open).

| Situation | Action |
|---|---|
| Disabled | Pass everything through; only the toggle hotkey is checked |
| Left button down while trigger held | **Swallow**, record the point, go to `Pending` |
| `Pending`, movement > `dragThresholdPx` | Send `wheelOpen{x,y}` with the *press* point, go to `Wheel` |
| `Wheel`, mouse move | Send `wheelMove{x,y}`. Movement is not swallowed, so the cursor still moves. |
| `Wheel`, left button up | **Swallow**, send `wheelRelease{x,y}`, go to `Idle` |
| `Pending`, left button up (trigger+click) | Option on: **swallow**, send `click{x,y}`. Option off: **replay** the down+up with `SendInput` (flagged as injected so the helper ignores its own events). Back to `Idle`. |
| `Wheel`, right button down or Esc | **Swallow**, send `cancel`, go to `Idle` |
| Trigger released during `Pending` | Treat as a plain click: replay it (or ping, if the option is on) |
| Trigger released during `Wheel` | Send `cancel`, go to `Idle` (the matching button up will still be swallowed) |
| Toggle hotkey | **Swallow**, flip enabled, send `toggled{enabled}`. If disabled mid-drag, also send `cancel`. |
| Watchdog: no mouse event for 10 s while in `Wheel` or `Pending` | Send `cancel`, go to `Idle` |

**Invariant:** for every swallowed button down, the paired up is also swallowed, or both are replayed. An app never sees an unmatched press.

### 5.2 Modifier side effects

- **Alt / Win menu activation.** Windows opens the menu bar (Alt) or Start menu (Win) when the key goes up without any other key in between. When a wheel or ping happened while the modifier was held, the helper injects a no-op "mask" key (`VK_NONAME`, 0xFC) before the modifier's key-up. AutoHotkey uses the same trick.
- **Caps Lock or a custom key as trigger:** that key's down/up is swallowed, so Caps state doesn't change and no character is typed.
- **Mouse 4 / Mouse 5 as trigger:** the side button itself is the drag button (press side button, move, release). A side-button click without movement is replayed so browser Back/Forward still works, or it pings if the trigger+click option is on.

### 5.3 Protocol (JSON lines, defined once in `src/shared/protocol.ts`, mirrored in C++)

All coordinates are **physical screen pixels**.

- **Electron → helper (stdin):** one *flat* JSON object per line (the helper's tiny parser accepts no nesting).
  - `{"type":"config","trigger":"alt"|"ctrl"|"shift"|"win"|"capslock"|"mouse4"|"mouse5"|"vk","triggerVk":N,"clickPing":bool,"dragThresholdPx":N,"toggleMods":N,"toggleVk":N,"enabled":bool}`
    - `toggleMods` is a bitmask: Ctrl = 1, Alt = 2, Shift = 4, Win = 8. `triggerVk` is used only when `trigger` is `"vk"` (custom key).
  - `{"type":"setEnabled","enabled":bool}`
  - `{"type":"suspend","on":bool}`: while the settings window is capturing a new shortcut, pass all input through and ignore the toggle hotkey.
  - `{"type":"shutdown"}`
  - Test mode only (`hook-helper.exe --simulate`, no OS hooks): `{"type":"sim","ev":"mdown"|"mup"|"move"|"kdown"|"kup"|"tick","btn":"left"|"right"|"middle"|"x1"|"x2","x":N,"y":N,"vk":N,"t":ms,"self":bool}`. After each one the helper also prints `{"type":"sim","swallow":bool,"inject":"down:left,up:left,…"}`.
- **Helper → Electron (stdout):**
  - `{"type":"ready","version":1}`
  - `{"type":"wheelOpen","x":N,"y":N}`, `{"type":"wheelMove","x":N,"y":N}`, `{"type":"wheelRelease","x":N,"y":N}`
  - `{"type":"click","x":N,"y":N}`, `{"type":"cancel"}`, `{"type":"toggled","enabled":bool}`
  - `{"type":"error","message":"..."}`, e.g. a hotkey conflict, so the UI can report it
- **Lifetime:** if stdin closes (EOF), meaning Electron died, the helper removes its hooks and exits. The helper never outlives the app.

## 6. Electron main process

- **Single instance:** a second launch opens the settings window instead.
- **InputBridge:**
  - Spawns `hook-helper.exe` (bundled via electron-builder `extraResources`), parses its JSON lines, and sends `config` on start and on every settings change.
  - Restarts the helper with backoff (0.5 s, 1 s, 2 s). After 3 crashes within 60 s, it stops, sets the tray to a warning state and shows a toast.
- **OverlayManager:**
  - One `BrowserWindow` per display: `transparent`, `frame:false`, `focusable:false`, `skipTaskbar`, `alwaysOnTop` at level `screen-saver`, `setIgnoreMouseEvents(true)`, created with `showInactive()`.
  - Windows exactly cover each display's `bounds`. They are rebuilt on `display-added`, `display-removed` and `display-metrics-changed`.
  - Each event is routed to the overlay whose display contains the press point. A wheel near a screen edge may be clipped; it is not clamped, the same as in League.
- **Coordinates:** `screen.screenToDipPoint({x,y})` converts physical pixels to DIP, then the display's DIP origin is subtracted to get overlay-local CSS pixels. Wheel moves are converted relative to the *wheel's* display, even when the cursor crosses onto another monitor.
- **Toggle feedback:** tray icon state (normal or dimmed), the tray menu checkbox, and a small Fluent toast saying "Pings on" or "Pings off".
- **Startup:** "Launch at Windows startup" uses `app.setLoginItemSettings` with the argument `--hidden`. A manual launch opens the settings window; a `--hidden` launch stays in the tray.

## 7. Overlay renderer

### 7.1 Wheel (matches the in-game reference screenshot and `prototype/wheel-demo.html`)

**Geometry:** SVG centered on the press point.

| Part | Size / style |
|---|---|
| Center disc | radius 86 px, teal radial gradient, 3 px gold ring `#c8aa6e` |
| Ring | 8 wedges from radius 86 to 188 |
| Cardinal wedges (N/E/S/W) | extend to radius 288 with a fading gradient |
| Wedge dividers | thin gold-tinted lines |

- **Slots:** each slice shows the ping from the `wheel` setting; the overlay redraws the icons when it changes.
- **Center content:** the generic-ping icon, a "PING" label in `#1fa9e0`, and a dim "BACK" hint with a right-click mouse glyph.
- **Icons:** 48 px at radius 137. Idle icons are desaturated gold (`grayscale(1) sepia(.75) saturate(1.3) brightness(1.15)`). The hovered slice shows the full-colour icon at 1.18× scale and a brightened wedge.
- **Selection:**
  - The slice is picked from the angle between the press point and the cursor, in 45° sectors centered on N, NE, …
  - A distance under 86 px means nothing is selected; releasing there cancels.
  - Moving onto a new slice plays `button.wav` at low volume, if the tick sound is enabled.
- **Animation:** opens with fade + scale 0.85 → 1 over 120 ms, closes with a fade.

### 7.2 Ping animation (as in the prototype)

The default duration is 3.2 s and scales with the "ping duration" setting. The art is drawn at "ping size" (default 110 px) and anchored so the ground ellipse sits on the press point.

1. **Pop:** scale 0.4 → 1.15 → 1.0 and fade in over 280 ms with an overshoot ease.
2. **Rings:** coloured rings expand 0.25× → 1.35× and fade over 650 ms, at 0, 220 ms and 1.4 s.
3. **Hold:** a gentle 5 px bob on a 1.6 s cycle, a coloured glow drop-shadow, and a soft coloured ground ellipse.
4. **Fade out** over the last ~13% of the duration, then the element is removed.
5. **All In:** the two halves slide in from opposite diagonals over 220 ms, then a white-to-colour flash and a 250 ms shake, then the bob.

Several pings can be on screen at once, and each is independent.

### 7.3 Audio

- **Decoding:** all ping and tick sounds are decoded once into `AudioBuffer`s at overlay load, with `AudioContext({latencyHint:'interactive'})`.
- **Playback:** each play is a fresh `AudioBufferSource` → `GainNode` (volume from settings). This removed the noticeable delay heard with `HTMLAudioElement` in the prototype.
- **Autoplay:** Electron's `autoplayPolicy: 'no-user-gesture-required'` keeps the context running without a user gesture.
- **No double sounds:** only the overlay that renders a ping plays its sound.

## 8. Settings

### 8.1 Schema (`src/shared/settings.ts`, versioned)

| Key | Type | Default |
|---|---|---|
| `version` | number | 1 |
| `enabledOnStart` | bool | true |
| `trigger` | `alt`/`ctrl`/`shift`/`win`/`capslock`/`mouse4`/`mouse5`/`{vk}` | `alt` |
| `dragThresholdPx` | 2–40 | 8 |
| `clickPing` | bool | false |
| `clickPingId` | ping id | `generic` |
| `wheel` | 8 distinct ping ids, top then clockwise | `DEFAULT_WHEEL` (an invalid list resets to it) |
| `toggleHotkey` | `{mods, vk}` | Ctrl+Alt+P |
| `pingSizePx` | 60–220 | 110 |
| `pingDurationS` | 1.0–8.0 | 3.2 |
| `volume` | 0–100 | 70 |
| `muted` | bool | false |
| `tickSound` | bool | true |
| `launchAtStartup` | bool | false |

Changes apply live, with no Save button. Writes are debounced (300 ms) and atomic (write a temp file, then rename).

### 8.2 Settings window (matches `prototype/settings-demo.html`)

- **Window:** Fluent UI React v9 components, `backgroundMaterial: 'mica'`, theme follows Windows light/dark, Windows 11 caption buttons, left navigation (Trigger, Toggle, Pings & sound, Wheel, App), Windows 11 Settings–style cards.
- **Status card:** at the top, a master on/off switch with a live hint ("Hold Alt and drag… · Ctrl + Alt + P to turn off"). Turning it off dims the dependent cards.
- **Trigger key:** a Fluent `Dropdown`, *not* a native select, with Keyboard and Mouse option groups plus "Custom key…", which captures the next key press.
- **Toggle shortcut:** a key-capture field showing keycaps. Click it, press a combination, and it rebinds; Esc cancels. A conflict reported by the helper shows inline and keeps the old binding.
- **Sliders:** drag distance, ping size, ping duration, volume. **Switches:** trigger+click ping, start enabled, tick sound, launch at startup.
- **Wheel** (matches `prototype/wheel-editor-demo.html`): a small wheel with the 8 slots and the trigger+click ping in the centre, beside a tile per ping (no `_cb` textures).
  - Clicking a tile previews it: plays its sound and spawns it at the center of the primary display.
  - Drag a tile onto a slot to put it there; a ping already on the wheel swaps places instead, so no ping appears twice. Drag a slot onto another to swap them. Drop on the centre to set the click ping.
  - Without dragging: click a tile or slot, then click where it goes. Esc cancels. "Reset to default" restores `DEFAULT_WHEEL` and Generic.
  - The rules live in `src/shared/wheelLayout.ts` as pure functions.
- **About:** version, asset notice, known limitations, asset problems, and "Open settings folder".

### 8.3 Tray

- **Left-click:** opens the settings.
- **Right-click menu:** Enabled ✓ / Settings… / Quit.
- **Icon states:** normal, dimmed (disabled), warning (helper failed).

## 9. Error handling

| Failure | Behaviour |
|---|---|
| Helper crashes or exits | Restart with backoff. After 3 in 60 s: stop, warning tray icon, toast, pinging paused until re-enabled. |
| Electron hangs or dies | The helper sees stdin EOF, unhooks and exits, so input is never left captured. |
| Stuck drag | 10 s watchdog in the helper sends `cancel`. Swallowed downs and ups are always paired. |
| Missing or undecodable sound | That ping is silent; logged and listed in About. |
| Missing texture | Fall back to `generic_ping.png`; logged and listed in About. |
| Corrupt `settings.json` | Back it up as `settings.bak.json` and use defaults. |
| Toggle hotkey conflict | Inline error in the settings; previous binding kept. |
| Display change | Overlays rebuilt; an active wheel is cancelled. |

**Known limitations** (listed in About):
- Elevated (admin) windows such as Task Manager don't receive the hook, because Windows blocks it, so the wheel can't be triggered over them.
- Exclusive-fullscreen games draw above the overlay.
- Single-window screen capture doesn't include the overlay.

## 10. Testing

- **Vitest (TypeScript):**
  - slice picking (sector boundaries at ±22.5°, dead-zone at 86 px, angle wrap)
  - coordinate conversion across two displays with different scale factors
  - settings defaults, clamping, migration, and corrupt-file fallback
  - ping table integrity: every referenced asset file exists, no `_cb` file is referenced
  - protocol message parsing
- **C++ unit tests** for `decision.cpp` (no OS hooks), as table-driven event sequences:
  - drag opens the wheel
  - click with the option on and off
  - trigger released early
  - right-click / Esc cancel
  - toggle mid-drag
  - watchdog
  - mask key emitted for Alt/Win
  - injected events ignored
- **Protocol integration test:** spawn the real `hook-helper.exe` in a test mode that reads simulated input events from stdin instead of installing hooks, and assert the JSON output.
- **Manual checklist** before calling v1 done:
  - Alt+drag over Chrome, Explorer, VS Code and Discord, with no text selection or menu bar activation
  - Alt+click with the option on and off
  - toggle hotkey while idle and mid-drag
  - both monitors at their real scale factors
  - pings visible in Discord "Screen" share and OBS Display Capture
  - kill the helper → it auto-restarts
  - kill Electron → mouse and keyboard are normal

## 11. Out of scope for v1

Multiplayer/sync (rooms arrived in v0.3.0, §12), rebinding wheel slots, colourblind texture sets, per-ping volume, macOS/Linux, ping spam throttling, and a minimap.

macOS support was added in v0.2.0; see [design-macos.md](design-macos.md).

## 12. Rooms (v0.3.0)

Full design: [superpowers/specs/2026-10-04-room-ping-sharing-design.md](superpowers/specs/2026-10-04-room-ping-sharing-design.md). In short:

- **Model:** a room is a code, `PING-XXXXX-XXXXX` (Crockford base32, 9 random characters + a Luhn mod 32 check character, `src/shared/roomCode.ts`). Parsing ranks candidates and never glues neighbouring words onto a code; clipboard reads are strict. Every finished ping (wheel or trigger+click, never a settings preview) goes to every member; up to 8 members.
- **Crypto (`src/main/roomCrypto.ts`):** scrypt(code) → HKDF → AES-256-GCM. Each packet is `[0x01][nonce][ciphertext+tag]`, at most 1200 bytes. Keys never leave the main process.
- **Messages (`src/shared/roomProtocol.ts`):** `presence` (name, tag colour, `on`/`paused`/`muted`, protocol and app version), `ping` (ping id, display number, x/y as 0–1 fractions), `bye`. Everything is validated field by field; names are stripped of control and bidi characters and shown with `textContent`. A per-peer sequence window plus a ±10 min timestamp check rejects replays. Packets outside that window never touch the member list; they only raise a "clock more than 10 minutes off" hint. The peer ID is random per join, because a peer that said bye stays rejected for the receiver's session.
- **RoomManager (`src/main/roomManager.ts`):** members, path choice, the incoming rate limit (per member, user setting 1–20/s or unlimited), mute (room and per person), timeouts (LAN path alive 6 s, member dropped after 15 s), "room is full" after a 3 s settle. It only talks to the network through the `Transport` interface (`src/main/transport.ts`).
- **LAN transport (`src/main/lanTransport.ts`):** one UDP socket on port 47474. Presence is broadcast every 2 s to 255.255.255.255 and each interface's directed broadcast; pings go unicast to the address a member's packets come from. Before decryption, a flood guard allows 100 packets/s per source IP and 800/s in total, and tracks at most 1024 addresses. The socket is re-bound after sleep.
- **Mapping:** displays are numbered #1 = primary, then left→right, top→bottom (`src/main/displayNumbers.ts`). A ping lands on the receiver's display with the same number, or #1, at the same fraction of its size. `resolveTarget` is the hook a later share-window mode replaces.
- **Overlay:** wheel pings are reported back to main (`overlay:pinged`); remote pings carry a name tag. Safety ceiling: 60 pings on screen, 8 overlapping sounds.
- **Internet rooms** (WebRTC with signaling over public Nostr relays, no server of our own) are milestone 2 and share everything above the transport.

