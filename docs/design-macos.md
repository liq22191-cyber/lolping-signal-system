# lolPing for macOS — Design Spec

**Date:** 2026-10-02
**Status:** Implemented in v0.2.0 (experimental). v0.2.1 fixes a frozen cursor during gestures, found in the first test on a real Mac

## 1. Purpose and constraints

Bring lolPing to macOS with the same behaviour as on Windows: hold a key, drag, release on a slice, and the ping appears on any display and in whole-screen capture.

| Topic | Decision |
|---|---|
| Hardware | Apple Silicon (arm64) only |
| Testing | No Mac available to the developer. CI on an Apple Silicon runner builds, unit-tests and packages it. A friend tries the published release. |
| Signing | Ad-hoc (`codesign -s -`), no Apple Developer account, no notarization |
| Codebase | One codebase. Developed on the `mac` branch, merged into `main`, released together with Windows as v0.2.0 |
| Default trigger | ⌥ Option + drag. Toggle ⌃⌥P. |
| Trigger choices | Option, Control, Shift, Command, Mouse 4, Mouse 5, custom key. Caps Lock is not offered (macOS can't reliably suppress its toggle). |
| Settings look | Mac-native restyle of the same React/Fluent components (see `prototype/settings-demo-mac.html`) |

## 2. Hook helper

The helper stays one C++ program. `decision.cpp`, `commands`, `json`, `output`, `simulate` are shared. Only the OS layer differs:

| File | Platform |
|---|---|
| `hooks_win.cpp`, `main_win.cpp` | Windows (unchanged logic, renamed) |
| `hooks_mac.cpp`, `main_posix.cpp` | macOS |
| `macinput.{h,cpp}` | Pure logic used by `hooks_mac.cpp`, no Apple headers, so it is unit-tested on both platforms |

`build.sh` compiles with `clang++ -std=c++20 -arch arm64` and links CoreGraphics, CoreFoundation and ApplicationServices.

### 2.1 Event tap

- A `CGEventTap` (session level, head insert, active) on its own thread with a `CFRunLoop`. The main thread reads stdin and forwards commands to the tap thread's run loop.
- **Swallow:** the callback returns `NULL`. **Replay:** a new down + up posted with `CGEventPost`. Our own events carry `kSelfMarker` in `kCGEventSourceUserData` and are ignored.
- **Watchdog:** a 1 s `CFRunLoopTimer`, same as the Windows `WM_TIMER`.
- **Tap disabled** (`kCGEventTapDisabledByTimeout` / `ByUserInput`): re-enable it and resync key state.
- **stdin EOF or `shutdown`:** stop the run loop, remove the tap, exit.

### 2.2 Keys

- `macinput` maps macOS key codes to the Windows virtual-key codes used everywhere else (letters, digits, F1–F20, arrows, navigation keys, punctuation, keypad). Settings, protocol and the UI keep using VKs.
- Modifiers arrive as `kCGEventFlagsChanged`. The device-dependent flag bits tell left from right, and `macinput::modifierTransitions(oldFlags, newFlags)` turns a flag change into VK key-downs and key-ups: Option → `VK_LMENU`/`VK_RMENU`, Control → `VK_LCONTROL`/`VK_RCONTROL`, Shift → `VK_LSHIFT`/`VK_RSHIFT`, Command → `VK_LWIN`/`VK_RWIN`. So the Win bit in `toggleMods` means Command on Mac.
- **Secure Event Input** (password fields) hides keyboard events from taps. Every mouse event also carries the modifier flags, so the helper runs `modifierTransitions` on them too before handing the mouse event to `Decision`. Option + drag keeps working.
- The Alt/Win "mask key" injection is Windows-only; the Mac layer drops `kMaskVk` injections.

### 2.3 Mouse

- Coordinates are `CGEventGetLocation`: global points with the origin at the top-left of the main display. That is Electron's DIP space, so the helper sends points, not pixels.
- `LeftMouseDragged`/`RightMouseDragged`/`OtherMouseDragged` are fed to `Decision` as moves and always pass through, like moves on Windows. Swallowing them during a gesture froze the cursor on a real Mac. The app underneath does receive drags whose press it never saw, which apps ignore.
- Mouse 4/5 are `OtherMouseDown` with button numbers 3 and 4.

### 2.4 Permission

Creating an active tap needs Accessibility. If `CGEventTapCreate` returns `NULL`, the helper prints `{"type":"error","code":"noAccess","message":…}` and exits with code **3**.

## 3. Electron main process

- **Platform:** `src/shared/platform.ts` (`'win' | 'mac'`), detected in main and passed to the settings page by its preload.
- **Helper path:** `hook-helper.exe` on Windows, `hook-helper` on Mac.
- **Coordinates:** on Mac each display map uses `phys = dip` and `scale = 1`, so `physicalToLocal` needs no change and `screen.dipToScreenRect` (Windows-only) is never called.
- **Overlays:** `type: 'panel'`, `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`, level `screen-saver`, click-through.
- **App shell:** Dock icon hidden except while the settings window is open; a minimal application menu (app, Edit, Window) so ⌘Q, ⌘W and clipboard shortcuts work.
- **Menu bar icon:** a template image (`build/trayTemplate.png`, `@2x`). Off = half alpha. Failed or no access = a non-template orange icon. A click opens the menu, which includes Settings….
- **Startup:** start in the menu bar with a toast pointing at the menu bar icon. The settings window opens on first run (no settings file yet), when Accessibility is missing, and on `activate`/`second-instance`. Open at login uses `setLoginItemSettings({ openAtLogin })`.
- **Accessibility flow:**
  - `HelperStatus` gains `'noAccess'`.
  - Before starting the helper, main calls `systemPreferences.isTrustedAccessibilityClient(false)`. If false: status `noAccess`, helper not started, poll every 1.5 s, start the helper once trusted.
  - The settings card's button calls `isTrustedAccessibilityClient(true)` (adds lolPing to the list and shows the system prompt) and opens `x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility`.
  - `InputBridge` treats exit code 3 as `noAccess`: no restart, no crash count. If macOS says lolPing is trusted but the tap still fails (a stale entry after an ad-hoc update), the card tells the user to remove lolPing from the list with "–" and turn it on again, with a Try again button.

## 4. Settings UI

- `<html data-platform="mac">`. A Fluent theme made with `createLightTheme`/`createDarkTheme` from macOS-blue brand ramps, the system font and Mac radii.
- `mac.css`, scoped to `[data-platform="mac"]`: translucent sidebar on `vibrancy: 'sidebar'`, 52 px drag bar leaving room for the traffic lights (`titleBarStyle: 'hiddenInset'`), grouped inset rows with separators and no per-row icons, iOS-style green switches without On/Off text, Mac keycaps.
- `PermissionCard` appears at the top while the status is `noAccess`.
- `triggerLabel`, `hotkeyParts`, `hotkeyLabel` take the platform: Mac shows ⌥ Option / ⌃ Control / ⇧ Shift / ⌘ Command and hotkeys as `⌃⌥P`.
- `strings(lang, platform)` overlays Mac wording in English and Chinese (Open at login, Follow macOS, menu bar instead of tray, Mac limitations, "Add ⌃, ⌥ or ⌘").
- The trigger picker hides Caps Lock on Mac, and `normalizeSettings(raw, platform)` maps a stored Caps Lock trigger to Option.

## 5. Packaging, CI, release

- `npm run build:helper` / `test:helper` call `native/hook-helper/run.mjs`, which runs `build.cmd` or `build.sh`.
- `npm run dist` builds the Windows installer, `npm run dist:mac` the Mac `.dmg` (`lolPing-<version>-arm64.dmg`), ad-hoc signed with `identity: "-"` and `hardenedRuntime: false`, `LSUIElement` not set (the Dock is managed at runtime).
- `tools/make_icon.py` also writes `build/icon.png` (1024 px) and the tray templates.
- CI: a `macos-latest` job runs typecheck, helper tests, TypeScript tests and `dist:mac`, then `codesign --verify --deep --strict` on the app.
- Release: one job creates the GitHub release, then the Windows and Mac jobs upload their installers.

## 6. Known Mac limitations

- Unsigned: first launch needs System Settings → Privacy & Security → Open Anyway.
- Accessibility must be granted again after every update (ad-hoc signatures change with each build).
- Windows of apps running with elevated privileges and the login window can't be pinged over; some full-screen games draw above the overlay.
- Single-window screen sharing doesn't include the pings.
