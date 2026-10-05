// Unit tests for the hook helper's pure logic (no OS hooks).
// Build and run: npm run test:helper
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <map>
#include <mutex>
#include <string>

#include "../src/decision.h"
#include "../src/json.h"
#include "../src/macinput.h"
#include "../src/output.h"

using namespace lp;

static int g_pass = 0;
static int g_fail = 0;
#define CHECK(cond)                                               \
  do {                                                            \
    if (cond) {                                                   \
      ++g_pass;                                                   \
    } else {                                                      \
      ++g_fail;                                                   \
      std::printf("FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond); \
    }                                                             \
  } while (0)

namespace {
constexpr uint32_t ALT = 0xA4, CTRL = 0xA2, KEY_P = 0x50, ESC = 0x1B, CAPS = 0x14, KEY_V = 0x56;
using S = Decision::State;

InputEvent key(EvKind k, uint32_t vk) {
  InputEvent e;
  e.kind = k;
  e.vk = vk;
  return e;
}
InputEvent kd(uint32_t vk) { return key(EvKind::KeyDown, vk); }
InputEvent ku(uint32_t vk) { return key(EvKind::KeyUp, vk); }
InputEvent mouse(EvKind k, Btn b, int x, int y, uint64_t t) {
  InputEvent e;
  e.kind = k;
  e.btn = b;
  e.x = x;
  e.y = y;
  e.timeMs = t;
  return e;
}
InputEvent md(Btn b, int x, int y, uint64_t t = 0) { return mouse(EvKind::MouseDown, b, x, y, t); }
InputEvent mu(Btn b, int x, int y, uint64_t t = 0) { return mouse(EvKind::MouseUp, b, x, y, t); }
InputEvent mv(int x, int y, uint64_t t = 0) { return mouse(EvKind::MouseMove, Btn::None, x, y, t); }

const Emit* findEmit(const Result& r, Emit::Kind k) {
  for (const auto& e : r.emits) {
    if (e.kind == k) return &e;
  }
  return nullptr;
}
bool injectIs(const Inject& i, InjectKind k, Btn b, uint32_t vk = 0) { return i.kind == k && i.btn == b && i.vk == vk; }
Decision withTrigger(Trigger t, uint32_t vk = 0, bool clickPing = false) {
  Config c;
  c.trigger = t;
  c.triggerVk = vk;
  c.clickPing = clickPing;
  Decision d;
  d.setConfig(c);
  return d;
}
// Alt held, left pressed at (100,100), dragged to (130,100): the wheel is open.
void openWheel(Decision& d) {
  d.onEvent(kd(ALT));
  d.onEvent(md(Btn::Left, 100, 100));
  d.onEvent(mv(130, 100));
}
}  // namespace

static void test_alt_drag_opens_wheel_and_releases() {
  Decision d;
  CHECK(!d.onEvent(kd(ALT)).swallow);
  Result r = d.onEvent(md(Btn::Left, 100, 100));
  CHECK(r.swallow);
  CHECK(d.state() == S::Pending);
  r = d.onEvent(mv(104, 104));  // 5.7 px, below the 8 px threshold
  CHECK(!r.swallow && r.emits.empty());
  r = d.onEvent(mv(120, 100));
  CHECK(!r.swallow);
  CHECK(d.state() == S::Wheel);
  CHECK(r.emits.size() == 2);
  CHECK(r.emits[0].kind == Emit::Kind::WheelOpen && r.emits[0].x == 100 && r.emits[0].y == 100);
  CHECK(r.emits[1].kind == Emit::Kind::WheelMove && r.emits[1].x == 120);
  r = d.onEvent(mv(125, 90));
  CHECK(findEmit(r, Emit::Kind::WheelMove) != nullptr);
  r = d.onEvent(mu(Btn::Left, 130, 90));
  CHECK(r.swallow);
  const Emit* rel = findEmit(r, Emit::Kind::WheelRelease);
  CHECK(rel != nullptr && rel->x == 130 && rel->y == 90);
  CHECK(d.state() == S::Idle);
}

static void test_plain_click_passes_through() {
  Decision d;
  CHECK(!d.onEvent(md(Btn::Left, 1, 1)).swallow);
  CHECK(!d.onEvent(mu(Btn::Left, 1, 1)).swallow);
  CHECK(d.state() == S::Idle);
}

static void test_alt_click_replays_when_click_ping_off() {
  Decision d;
  d.onEvent(kd(ALT));
  CHECK(d.onEvent(md(Btn::Left, 50, 60)).swallow);
  d.onEvent(mv(53, 62));  // tiny jitter, still a click
  Result r = d.onEvent(mu(Btn::Left, 53, 62));
  CHECK(r.swallow);
  CHECK(r.emits.empty());
  CHECK(r.injects.size() == 2);
  CHECK(injectIs(r.injects[0], InjectKind::ButtonDown, Btn::Left));
  CHECK(injectIs(r.injects[1], InjectKind::ButtonUp, Btn::Left));
  CHECK(d.state() == S::Idle);
}

static void test_alt_click_pings_when_click_ping_on() {
  Decision d = withTrigger(Trigger::Alt, 0, true);
  d.onEvent(kd(ALT));
  d.onEvent(md(Btn::Left, 50, 60));
  Result r = d.onEvent(mu(Btn::Left, 51, 60));
  CHECK(r.swallow);
  CHECK(r.injects.empty());
  const Emit* c = findEmit(r, Emit::Kind::Click);
  CHECK(c != nullptr && c->x == 50 && c->y == 60);
}

static void test_self_injected_events_are_ignored() {
  Decision d;
  d.onEvent(kd(ALT));
  InputEvent e = md(Btn::Left, 5, 5);
  e.selfInjected = true;
  CHECK(!d.onEvent(e).swallow);
  CHECK(d.state() == S::Idle);
}

static void test_right_click_cancels_wheel() {
  Decision d;
  openWheel(d);
  Result r = d.onEvent(md(Btn::Right, 130, 100));
  CHECK(r.swallow);
  CHECK(findEmit(r, Emit::Kind::Cancel) != nullptr);
  CHECK(d.onEvent(mu(Btn::Right, 130, 100)).swallow);
  r = d.onEvent(mu(Btn::Left, 130, 100));
  CHECK(r.swallow);
  CHECK(findEmit(r, Emit::Kind::WheelRelease) == nullptr);
  CHECK(d.state() == S::Idle);
}

static void test_right_click_with_alt_but_no_gesture_passes() {
  Decision d;
  d.onEvent(kd(ALT));
  CHECK(!d.onEvent(md(Btn::Right, 1, 1)).swallow);
  CHECK(!d.onEvent(mu(Btn::Right, 1, 1)).swallow);
}

static void test_escape_cancels_wheel() {
  Decision d;
  openWheel(d);
  Result r = d.onEvent(kd(ESC));
  CHECK(r.swallow);
  CHECK(findEmit(r, Emit::Kind::Cancel) != nullptr);
  CHECK(d.onEvent(ku(ESC)).swallow);
  r = d.onEvent(mu(Btn::Left, 130, 100));
  CHECK(r.swallow && r.emits.empty());
}

static void test_trigger_released_during_wheel_cancels() {
  Decision d;
  openWheel(d);
  Result r = d.onEvent(ku(ALT));
  CHECK(findEmit(r, Emit::Kind::Cancel) != nullptr);
  CHECK(d.state() == S::SwallowUp);
  CHECK(d.onEvent(mu(Btn::Left, 130, 100)).swallow);
  CHECK(d.state() == S::Idle);
}

static void test_trigger_released_during_pending_replays_click_after_mask() {
  Decision d;
  d.onEvent(kd(ALT));
  d.onEvent(md(Btn::Left, 100, 100));
  Result r = d.onEvent(ku(ALT));
  CHECK(r.swallow);  // the Alt-up is swallowed and re-injected after the mask key
  CHECK(r.injects.size() == 4);
  CHECK(injectIs(r.injects[0], InjectKind::KeyDown, Btn::None, kMaskVk));
  CHECK(injectIs(r.injects[1], InjectKind::KeyUp, Btn::None, kMaskVk));
  CHECK(injectIs(r.injects[2], InjectKind::KeyUp, Btn::None, ALT));
  CHECK(injectIs(r.injects[3], InjectKind::ButtonDown, Btn::Left));
  CHECK(d.state() == S::Idle);
  CHECK(!d.onEvent(mu(Btn::Left, 100, 100)).swallow);  // the real up completes the replayed click
}

static void test_trigger_released_during_pending_pings_when_click_ping_on() {
  Decision d = withTrigger(Trigger::Alt, 0, true);
  d.onEvent(kd(ALT));
  d.onEvent(md(Btn::Left, 100, 100));
  Result r = d.onEvent(ku(ALT));
  const Emit* c = findEmit(r, Emit::Kind::Click);
  CHECK(c != nullptr && c->x == 100);
  CHECK(d.onEvent(mu(Btn::Left, 100, 100)).swallow);
}

static void test_alt_up_after_gesture_is_masked() {
  Decision d;
  openWheel(d);
  d.onEvent(mu(Btn::Left, 130, 100));
  Result r = d.onEvent(ku(ALT));
  CHECK(r.swallow);
  CHECK(r.injects.size() == 3);
  CHECK(injectIs(r.injects[0], InjectKind::KeyDown, Btn::None, kMaskVk));
  CHECK(injectIs(r.injects[1], InjectKind::KeyUp, Btn::None, kMaskVk));
  CHECK(injectIs(r.injects[2], InjectKind::KeyUp, Btn::None, ALT));
}

static void test_plain_alt_tap_is_not_masked() {
  Decision d;
  d.onEvent(kd(ALT));
  Result r = d.onEvent(ku(ALT));
  CHECK(!r.swallow && r.injects.empty());
}

static void test_toggle_hotkey_disables_and_enables() {
  Decision d;
  d.onEvent(kd(CTRL));
  d.onEvent(kd(ALT));
  Result r = d.onEvent(kd(KEY_P));
  CHECK(r.swallow);
  const Emit* t = findEmit(r, Emit::Kind::Toggled);
  CHECK(t != nullptr && !t->enabled);
  CHECK(!d.enabled());
  CHECK(d.onEvent(ku(KEY_P)).swallow);
  d.onEvent(ku(CTRL));
  CHECK(!d.onEvent(md(Btn::Left, 1, 1)).swallow);  // disabled: Alt+press passes
  d.onEvent(mu(Btn::Left, 1, 1));
  d.onEvent(kd(CTRL));
  r = d.onEvent(kd(KEY_P));
  t = findEmit(r, Emit::Kind::Toggled);
  CHECK(t != nullptr && t->enabled);
  CHECK(d.enabled());
}

static void test_hotkey_autorepeat_toggles_once() {
  Decision d;
  d.onEvent(kd(CTRL));
  d.onEvent(kd(ALT));
  CHECK(findEmit(d.onEvent(kd(KEY_P)), Emit::Kind::Toggled) != nullptr);
  Result repeat = d.onEvent(kd(KEY_P));
  CHECK(repeat.swallow);
  CHECK(findEmit(repeat, Emit::Kind::Toggled) == nullptr);
  CHECK(!d.enabled());
}

static void test_hotkey_ignored_while_suspended() {
  Decision d;
  d.setSuspended(true);
  d.onEvent(kd(CTRL));
  d.onEvent(kd(ALT));
  Result r = d.onEvent(kd(KEY_P));
  CHECK(!r.swallow && r.emits.empty());
  CHECK(d.enabled());
  CHECK(!d.onEvent(md(Btn::Left, 1, 1)).swallow);  // suspended: no gestures either
}

static void test_disabling_mid_drag_cancels_and_swallows_up() {
  Decision d;
  openWheel(d);
  Result r = d.setEnabled(false);
  CHECK(findEmit(r, Emit::Kind::Cancel) != nullptr);
  CHECK(d.state() == S::SwallowUp);
  CHECK(d.onEvent(mu(Btn::Left, 130, 100)).swallow);
  CHECK(d.state() == S::Idle);
}

static void test_config_change_mid_drag_cancels() {
  Decision d;
  openWheel(d);
  Result r = d.setConfig(Config{});
  CHECK(findEmit(r, Emit::Kind::Cancel) != nullptr);
  CHECK(d.state() == S::SwallowUp);
}

static void test_lost_up_recovers_on_next_press() {
  Decision d;
  openWheel(d);
  d.setEnabled(false);  // -> SwallowUp, waiting for an up that never comes
  d.setEnabled(true);
  Result r = d.onEvent(md(Btn::Left, 5, 5));  // Alt still held
  CHECK(r.swallow);
  CHECK(d.state() == S::Pending);
}

static void test_lost_right_up_does_not_swallow_next_click() {
  Decision d;
  openWheel(d);
  CHECK(d.onEvent(md(Btn::Right, 130, 100)).swallow);  // cancels the wheel, arms the right-up swallow
  // The right-up never arrives (secure desktop, Win+L, UAC).
  d.onEvent(mu(Btn::Left, 130, 100));
  CHECK(d.state() == S::Idle);
  CHECK(!d.onEvent(md(Btn::Right, 5, 5)).swallow);  // a new right-down means the old up is gone
  CHECK(!d.onEvent(mu(Btn::Right, 5, 5)).swallow);
}

static void test_lost_key_up_does_not_swallow_next_press() {
  Decision d;
  openWheel(d);
  CHECK(d.onEvent(kd(ESC)).swallow);  // cancels the wheel, arms the Esc-up swallow
  // The Esc-up never arrives.
  d.onEvent(mu(Btn::Left, 130, 100));
  d.onEvent(ku(ALT));
  CHECK(d.state() == S::Idle);
  CHECK(!d.onEvent(kd(ESC)).swallow);  // a later press that passes clears the stale entry
  CHECK(!d.onEvent(ku(ESC)).swallow);
}

static void test_button_held_before_trigger_passes_up() {
  Decision d;
  CHECK(!d.onEvent(md(Btn::Left, 1, 1)).swallow);
  d.onEvent(kd(ALT));
  CHECK(!d.onEvent(mv(50, 50)).swallow);
  CHECK(!d.onEvent(mu(Btn::Left, 50, 50)).swallow);
  CHECK(d.state() == S::Idle);
}

static void test_watchdog_cancels_stale_gesture() {
  Decision d;
  d.onEvent(kd(ALT));
  d.onEvent(md(Btn::Left, 100, 100, 1000));
  d.onEvent(mv(130, 100, 1100));
  CHECK(d.tick(5000).emits.empty());
  Result r = d.tick(1100 + kWatchdogMs + 1);
  CHECK(findEmit(r, Emit::Kind::Cancel) != nullptr);
  CHECK(d.state() == S::SwallowUp);  // the paired up must still be swallowed
  CHECK(d.onEvent(mu(Btn::Left, 130, 100)).swallow);
  CHECK(d.state() == S::Idle);
}

static void test_watchdog_from_pending_swallows_later_up() {
  Decision d;
  d.onEvent(kd(ALT));
  d.onEvent(md(Btn::Left, 100, 100, 1000));  // never moves past the threshold
  CHECK(d.state() == S::Pending);
  CHECK(d.tick(1000 + kWatchdogMs).emits.empty());  // exactly at the limit: not yet stale
  Result r = d.tick(1000 + kWatchdogMs + 1);
  CHECK(findEmit(r, Emit::Kind::Cancel) != nullptr);
  CHECK(d.state() == S::SwallowUp);
  r = d.onEvent(mu(Btn::Left, 100, 100));
  CHECK(r.swallow && r.emits.empty() && r.injects.empty());
  CHECK(d.state() == S::Idle);
}

static void test_sync_clears_stale_trigger() {
  Decision d;
  d.onEvent(kd(ALT));  // the matching Alt-up is never seen (Win+L, UAC, hook reinstall...)
  d.syncKeyStates([](uint32_t) { return false; });
  CHECK(!d.onEvent(md(Btn::Left, 1, 1)).swallow);
  CHECK(d.state() == S::Idle);
}

static void test_sync_keeps_keys_that_are_still_down() {
  Decision d;
  d.onEvent(kd(ALT));
  d.syncKeyStates([](uint32_t vk) { return vk == ALT; });
  CHECK(d.onEvent(md(Btn::Left, 1, 1)).swallow);
  CHECK(d.state() == S::Pending);
}

static void test_sync_never_sets_keys() {
  Decision d;
  d.syncKeyStates([](uint32_t) { return true; });  // OS says everything is down; we never saw a key-down
  CHECK(!d.onEvent(md(Btn::Left, 1, 1)).swallow);
  CHECK(d.state() == S::Idle);
}

static void test_sync_keeps_swallowed_trigger_key() {
  Decision d = withTrigger(Trigger::CapsLock);
  CHECK(d.onEvent(kd(CAPS)).swallow);
  d.syncKeyStates([](uint32_t) { return false; });  // OS never saw Caps go down
  CHECK(d.onEvent(md(Btn::Left, 0, 0)).swallow);
  CHECK(d.state() == S::Pending);
}

static void test_ctrl_trigger_ignores_alt() {
  Decision d = withTrigger(Trigger::Ctrl);
  d.onEvent(kd(ALT));
  CHECK(!d.onEvent(md(Btn::Left, 1, 1)).swallow);
  d.onEvent(mu(Btn::Left, 1, 1));
  d.onEvent(ku(ALT));
  d.onEvent(kd(CTRL));
  CHECK(d.onEvent(md(Btn::Left, 1, 1)).swallow);
}

static void test_capslock_trigger_swallows_key() {
  Decision d = withTrigger(Trigger::CapsLock);
  CHECK(d.onEvent(kd(CAPS)).swallow);
  CHECK(d.onEvent(md(Btn::Left, 0, 0)).swallow);
  CHECK(findEmit(d.onEvent(mv(0, 40)), Emit::Kind::WheelOpen) != nullptr);
  CHECK(findEmit(d.onEvent(mu(Btn::Left, 0, 40)), Emit::Kind::WheelRelease) != nullptr);
  Result r = d.onEvent(ku(CAPS));
  CHECK(r.swallow && r.injects.empty());
}

static void test_custom_key_trigger() {
  Decision d = withTrigger(Trigger::CustomVk, KEY_V);
  CHECK(d.onEvent(kd(KEY_V)).swallow);
  CHECK(d.onEvent(md(Btn::Left, 0, 0)).swallow);
  CHECK(d.onEvent(ku(KEY_V)).swallow);
  d.setEnabled(false);
  CHECK(!d.onEvent(kd(KEY_V)).swallow);  // disabled: typing V works again
}

static void test_mouse4_trigger_drags_with_side_button() {
  Decision d = withTrigger(Trigger::Mouse4);
  CHECK(!d.onEvent(md(Btn::Left, 0, 0)).swallow);
  d.onEvent(mu(Btn::Left, 0, 0));
  CHECK(d.onEvent(md(Btn::X1, 10, 10)).swallow);
  Result r = d.onEvent(mu(Btn::X1, 10, 10));  // click without drag: replay so browser Back still works
  CHECK(r.swallow && r.injects.size() == 2);
  CHECK(injectIs(r.injects[0], InjectKind::ButtonDown, Btn::X1));
  CHECK(injectIs(r.injects[1], InjectKind::ButtonUp, Btn::X1));
  d.onEvent(md(Btn::X1, 10, 10));
  CHECK(findEmit(d.onEvent(mv(40, 10)), Emit::Kind::WheelOpen) != nullptr);
  CHECK(findEmit(d.onEvent(mu(Btn::X1, 40, 10)), Emit::Kind::WheelRelease) != nullptr);
}

static void test_ctrl_drag_opens_emote_wheel() {
  Decision d;  // default config: ping on Alt, emotes on Ctrl
  CHECK(!d.onEvent(kd(CTRL)).swallow);
  Result r = d.onEvent(md(Btn::Left, 100, 100));
  CHECK(r.swallow);
  CHECK(d.state() == S::Pending);
  r = d.onEvent(mv(130, 100));
  CHECK(r.emits.size() == 2);
  CHECK(r.emits[0].kind == Emit::Kind::WheelOpen && r.emits[0].emote);
  CHECK(r.emits[1].kind == Emit::Kind::WheelMove && r.emits[1].emote);
  r = d.onEvent(mu(Btn::Left, 140, 90));
  CHECK(r.swallow);
  const Emit* rel = findEmit(r, Emit::Kind::WheelRelease);
  CHECK(rel != nullptr && rel->emote && rel->x == 140 && rel->y == 90);
  CHECK(d.state() == S::Idle);
}

static void test_emote_click_always_passes_through() {
  Decision d = withTrigger(Trigger::Alt, 0, true);  // even with clickPing on, Ctrl + click is not a click-emote
  d.onEvent(kd(CTRL));
  CHECK(d.onEvent(md(Btn::Left, 5, 5)).swallow);
  Result r = d.onEvent(mu(Btn::Left, 5, 5));
  CHECK(r.swallow && r.emits.empty());
  CHECK(r.injects.size() == 2);
  CHECK(injectIs(r.injects[0], InjectKind::ButtonDown, Btn::Left));
  CHECK(injectIs(r.injects[1], InjectKind::ButtonUp, Btn::Left));
}

static void test_ping_trigger_wins_when_both_held() {
  Decision d;
  d.onEvent(kd(ALT));
  d.onEvent(kd(CTRL));
  CHECK(d.onEvent(md(Btn::Left, 0, 0)).swallow);
  Result r = d.onEvent(mv(40, 0));
  const Emit* open = findEmit(r, Emit::Kind::WheelOpen);
  CHECK(open != nullptr && !open->emote);
  // Releasing the emote trigger mid-gesture must not end the ping wheel.
  r = d.onEvent(ku(CTRL));
  CHECK(findEmit(r, Emit::Kind::Cancel) == nullptr);
  CHECK(d.state() == S::Wheel);
}

static void test_emote_trigger_release_cancels_emote_wheel() {
  Decision d;
  d.onEvent(kd(CTRL));
  d.onEvent(md(Btn::Left, 100, 100));
  d.onEvent(mv(130, 100));
  Result r = d.onEvent(ku(CTRL));
  CHECK(findEmit(r, Emit::Kind::Cancel) != nullptr);
  CHECK(d.state() == S::SwallowUp);
  CHECK(d.onEvent(mu(Btn::Left, 130, 100)).swallow);
  CHECK(d.state() == S::Idle);
}

static void test_emote_trigger_release_replays_pending_click() {
  Decision d;
  d.onEvent(kd(CTRL));
  d.onEvent(md(Btn::Left, 100, 100));
  Result r = d.onEvent(ku(CTRL));
  CHECK(r.injects.size() == 1);
  CHECK(injectIs(r.injects[0], InjectKind::ButtonDown, Btn::Left));
  CHECK(d.state() == S::Idle);
  CHECK(!d.onEvent(mu(Btn::Left, 100, 100)).swallow);  // the real up completes the replayed click
}

static void test_json_parses_flat_objects() {
  std::map<std::string, std::string> m;
  CHECK(parseFlatJson(R"({"type":"config","enabled":true,"dragThresholdPx":8,"trigger":"alt"})", m));
  CHECK(m["type"] == "config" && m["enabled"] == "true" && m["dragThresholdPx"] == "8" && m["trigger"] == "alt");
  CHECK(parseFlatJson(R"( { "msg" : "a\"b\\c" } )", m) && m["msg"] == "a\"b\\c");
  CHECK(parseFlatJson("{}", m) && m.empty());
}

static void test_json_rejects_bad_input() {
  std::map<std::string, std::string> m;
  CHECK(!parseFlatJson("", m));
  CHECK(!parseFlatJson("not json", m));
  CHECK(!parseFlatJson(R"({"a":{"b":1}})", m));
  CHECK(!parseFlatJson(R"({"a":[1]})", m));
  CHECK(!parseFlatJson(R"({"a":1)", m));
  CHECK(!parseFlatJson(R"({"a":1} trailing)", m));
}

static void test_json_escape() { CHECK(jsonEscape("a\"b\\c\n") == "a\\\"b\\\\c\\n"); }

static void test_format_emit() {
  Emit open{Emit::Kind::WheelOpen};
  open.x = 1;
  open.y = -2;
  CHECK(formatEmit(open) == R"({"type":"wheelOpen","x":1,"y":-2})");
  Emit toggled{Emit::Kind::Toggled};
  toggled.enabled = true;
  CHECK(formatEmit(toggled) == R"({"type":"toggled","enabled":true})");
  CHECK(formatEmit(Emit{Emit::Kind::Cancel}) == R"({"type":"cancel"})");
  Emit emote{Emit::Kind::WheelRelease};
  emote.x = 3;
  emote.y = 4;
  emote.emote = true;
  CHECK(formatEmit(emote) == R"({"type":"wheelRelease","x":3,"y":4,"wheel":"emote"})");
}

// Review focus: a frozen Electron must never stall the hook thread.
static void test_output_never_blocks_producer() {
  std::mutex m;
  std::condition_variable cv;
  bool release = false;
  size_t written = 0;
  Output out(
      [&](const std::string&) {
        std::unique_lock<std::mutex> lk(m);
        cv.wait(lk, [&] { return release; });
        ++written;
        return true;
      },
      100);
  const auto start = std::chrono::steady_clock::now();
  for (int i = 0; i < 10000; ++i) out.line("x");
  const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start).count();
  CHECK(ms < 500);
  CHECK(out.dropped() >= 10000 - 101);
  {
    std::lock_guard<std::mutex> lk(m);
    release = true;
  }
  cv.notify_all();
  out.stop();
  CHECK(written + out.dropped() == 10000);
}

static void test_mask_menu_keys_off_leaves_alt_up_alone() {
  Decision d;
  d.setMaskMenuKeys(false);
  openWheel(d);
  d.onEvent(mu(Btn::Left, 130, 100));
  Result r = d.onEvent(ku(ALT));
  CHECK(!r.swallow && r.injects.empty());
}

static void test_mac_keycodes_map_to_vks() {
  CHECK(mac::keyCodeToVk(0x23) == KEY_P);
  CHECK(mac::keyCodeToVk(0x00) == 'A');
  CHECK(mac::keyCodeToVk(0x1D) == '0');
  CHECK(mac::keyCodeToVk(0x35) == ESC);
  CHECK(mac::keyCodeToVk(0x7A) == 0x70);  // F1
  CHECK(mac::keyCodeToVk(0x5A) == 0x83);  // F20
  CHECK(mac::keyCodeToVk(0x7B) == 0x25);  // left arrow
  CHECK(mac::keyCodeToVk(0x3F) == 0);     // fn has no VK
  CHECK(mac::vkToKeyCode(KEY_P) == 0x23);
  CHECK(mac::vkToKeyCode(0x0D) == 0x24);  // Return, not keypad Enter
  CHECK(mac::vkToKeyCode(ALT) == 0x3A);
  CHECK(mac::vkToKeyCode(0x87) == -1);    // F24 doesn't exist on a Mac
  for (uint16_t code = 0; code < 0x80; ++code) {
    const uint32_t vk = mac::keyCodeToVk(code);
    if (vk != 0 && code != 0x4C) CHECK(mac::vkToKeyCode(vk) == code);  // round trip (keypad Enter shares Return's VK)
  }
}

static void test_mac_modifier_held() {
  using namespace mac;
  CHECK(modifierHeld(kFlagOption | kDevLAlt, 0xA4));
  CHECK(!modifierHeld(kFlagOption | kDevLAlt, 0xA5));
  CHECK(modifierHeld(kFlagOption | kDevRAlt, 0xA5));
  CHECK(modifierHeld(kFlagOption, 0xA4));            // synthetic event without side bits: left
  CHECK(!modifierHeld(kFlagOption, 0xA5));
  CHECK(!modifierHeld(kDevLAlt, 0xA4));              // stale side bit with the group up
  CHECK(modifierHeld(kFlagCommand | kDevRCmd, 0x5C));
  CHECK(modifierHeld(kFlagControl | kDevRCtrl, 0xA3));
  CHECK(!modifierHeld(kFlagShift | kDevLShift, 'A'));
}

static void test_mac_modifier_transitions() {
  using namespace mac;
  auto t = modifierTransitions(0, kFlagOption | kDevLAlt);
  CHECK(t.size() == 1 && t[0].vk == 0xA4 && t[0].down);
  t = modifierTransitions(kFlagOption | kDevLAlt, 0);
  CHECK(t.size() == 1 && t[0].vk == 0xA4 && !t[0].down);
  // Option released and Control pressed in one step: ups come first.
  t = modifierTransitions(kFlagOption | kDevLAlt, kFlagControl | kDevLCtrl);
  CHECK(t.size() == 2 && t[0].vk == 0xA4 && !t[0].down && t[1].vk == 0xA2 && t[1].down);
  // Right Command added to left Command.
  t = modifierTransitions(kFlagCommand | kDevLCmd, kFlagCommand | kDevLCmd | kDevRCmd);
  CHECK(t.size() == 1 && t[0].vk == 0x5C && t[0].down);
  CHECK(modifierTransitions(kFlagShift | kDevLShift, kFlagShift | kDevLShift).empty());
}

static void test_mac_option_drag_through_transitions() {
  // The Mac hook feeds flag transitions to Decision as key events: Option + drag must open the wheel.
  Decision d;
  d.setMaskMenuKeys(false);
  for (const auto& k : mac::modifierTransitions(0, mac::kFlagOption | mac::kDevLAlt)) {
    d.onEvent(k.down ? kd(k.vk) : ku(k.vk));
  }
  CHECK(d.onEvent(md(Btn::Left, 10, 10)).swallow);
  Result r = d.onEvent(mv(40, 10));
  CHECK(findEmit(r, Emit::Kind::WheelOpen) != nullptr);
}

int main() {
  test_json_parses_flat_objects();
  test_json_rejects_bad_input();
  test_json_escape();
  test_format_emit();
  test_output_never_blocks_producer();
  test_alt_drag_opens_wheel_and_releases();
  test_plain_click_passes_through();
  test_alt_click_replays_when_click_ping_off();
  test_alt_click_pings_when_click_ping_on();
  test_self_injected_events_are_ignored();
  test_right_click_cancels_wheel();
  test_right_click_with_alt_but_no_gesture_passes();
  test_escape_cancels_wheel();
  test_trigger_released_during_wheel_cancels();
  test_trigger_released_during_pending_replays_click_after_mask();
  test_trigger_released_during_pending_pings_when_click_ping_on();
  test_alt_up_after_gesture_is_masked();
  test_plain_alt_tap_is_not_masked();
  test_toggle_hotkey_disables_and_enables();
  test_hotkey_autorepeat_toggles_once();
  test_hotkey_ignored_while_suspended();
  test_disabling_mid_drag_cancels_and_swallows_up();
  test_config_change_mid_drag_cancels();
  test_lost_up_recovers_on_next_press();
  test_lost_right_up_does_not_swallow_next_click();
  test_lost_key_up_does_not_swallow_next_press();
  test_button_held_before_trigger_passes_up();
  test_watchdog_cancels_stale_gesture();
  test_watchdog_from_pending_swallows_later_up();
  test_sync_clears_stale_trigger();
  test_sync_keeps_keys_that_are_still_down();
  test_sync_never_sets_keys();
  test_sync_keeps_swallowed_trigger_key();
  test_ctrl_trigger_ignores_alt();
  test_capslock_trigger_swallows_key();
  test_custom_key_trigger();
  test_mouse4_trigger_drags_with_side_button();
  test_ctrl_drag_opens_emote_wheel();
  test_emote_click_always_passes_through();
  test_ping_trigger_wins_when_both_held();
  test_emote_trigger_release_cancels_emote_wheel();
  test_emote_trigger_release_replays_pending_click();
  test_mask_menu_keys_off_leaves_alt_up_alone();
  test_mac_keycodes_map_to_vks();
  test_mac_modifier_held();
  test_mac_modifier_transitions();
  test_mac_option_drag_through_transitions();
  std::printf("%d passed, %d failed\n", g_pass, g_fail);
  return g_fail == 0 ? 0 : 1;
}
