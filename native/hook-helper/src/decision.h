#pragma once
#include <array>
#include <cstdint>
#include <functional>
#include <set>
#include <vector>

namespace lp {

enum class Btn { None, Left, Right, Middle, X1, X2 };
enum class EvKind { MouseDown, MouseUp, MouseMove, KeyDown, KeyUp };

struct InputEvent {
  EvKind kind = EvKind::MouseMove;
  Btn btn = Btn::None;
  uint32_t vk = 0;
  int x = 0;
  int y = 0;
  bool selfInjected = false;  // injected by this helper (marker in dwExtraInfo)
  uint64_t timeMs = 0;
};

enum class Trigger { Alt, Ctrl, Shift, Win, CapsLock, Mouse4, Mouse5, CustomVk };

constexpr uint32_t ModCtrl = 1;
constexpr uint32_t ModAlt = 2;
constexpr uint32_t ModShift = 4;
constexpr uint32_t ModWin = 8;

struct Config {
  Trigger trigger = Trigger::Alt;
  uint32_t triggerVk = 0;  // only for Trigger::CustomVk
  // The emote wheel's trigger (keyboard-only). Never the same as `trigger`; if it is, the ping wheel wins.
  Trigger emoteTrigger = Trigger::Ctrl;
  uint32_t emoteTriggerVk = 0;  // only when emoteTrigger is Trigger::CustomVk
  bool clickPing = false;
  int dragThresholdPx = 8;
  uint32_t toggleMods = ModCtrl | ModAlt;
  uint32_t toggleVk = 0x50;  // 'P'
  bool enabled = true;
};

struct Emit {
  enum class Kind { WheelOpen, WheelMove, WheelRelease, Click, Cancel, Toggled } kind;
  int x = 0;
  int y = 0;
  bool enabled = false;  // Toggled only
  bool emote = false;    // WheelOpen/Move/Release: true for the emote wheel, false for the ping wheel
};

enum class InjectKind { ButtonDown, ButtonUp, KeyDown, KeyUp };

struct Inject {
  InjectKind kind;
  Btn btn = Btn::None;
  uint32_t vk = 0;
};

struct Result {
  bool swallow = false;
  std::vector<Emit> emits;
  std::vector<Inject> injects;
};

constexpr uint32_t kMaskVk = 0xFC;  // VK_NONAME: harmless key that stops Alt/Win menu activation
constexpr uint64_t kWatchdogMs = 10000;

// Decides what happens to every input event. Pure logic: no Windows calls.
class Decision {
 public:
  enum class State { Idle, Pending, Wheel, SwallowUp };

  Result setConfig(const Config& c);
  Result setEnabled(bool on);
  Result setSuspended(bool on);
  Result onEvent(const InputEvent& e);
  Result tick(uint64_t nowMs);
  // Windows opens the menu bar / Start menu on a lone Alt / Win key-up, so a swallowed press while one is held
  // gets a mask key before that key-up. macOS has no such behaviour: its hook layer turns this off.
  void setMaskMenuKeys(bool on) { maskMenuKeys_ = on; }

  // Resync with the OS: forget keys we believe are down but isDown(vk) says are up
  // (key-ups the hook never saw: Win+L, Ctrl+Alt+Del, UAC, hook reinstall). Never marks a key as down.
  // Keys whose down we swallowed (a pending key-up swallow) are kept: the OS never saw them go down.
  void syncKeyStates(const std::function<bool(uint32_t vk)>& isDown);

  State state() const { return state_; }
  bool enabled() const { return enabled_; }
  const Config& config() const { return cfg_; }

 private:
  bool active() const { return enabled_ && !suspended_; }
  uint32_t mods() const;
  bool triggerHeld(Trigger t, uint32_t vk) const;
  bool pingTriggerHeld() const { return triggerHeld(cfg_.trigger, keyTriggerVk()); }
  bool emoteTriggerHeld() const { return triggerHeld(cfg_.emoteTrigger, emoteKeyTriggerVk()); }
  bool isTriggerVk(Trigger t, uint32_t cfgVk, uint32_t vk) const;
  bool isPingTriggerVk(uint32_t vk) const { return isTriggerVk(cfg_.trigger, keyTriggerVk(), vk); }
  bool isEmoteTriggerVk(uint32_t vk) const { return isTriggerVk(cfg_.emoteTrigger, emoteKeyTriggerVk(), vk); }
  bool isMouseTrigger() const { return cfg_.trigger == Trigger::Mouse4 || cfg_.trigger == Trigger::Mouse5; }
  bool isKeyTrigger() const { return cfg_.trigger == Trigger::CapsLock || cfg_.trigger == Trigger::CustomVk; }
  bool isEmoteKeyTrigger() const { return cfg_.emoteTrigger == Trigger::CapsLock || cfg_.emoteTrigger == Trigger::CustomVk; }
  uint32_t keyTriggerVk() const { return cfg_.trigger == Trigger::CapsLock ? 0x14u : cfg_.triggerVk; }
  uint32_t emoteKeyTriggerVk() const { return cfg_.emoteTrigger == Trigger::CapsLock ? 0x14u : cfg_.emoteTriggerVk; }
  Btn dragButton() const;
  void markSwallow();
  void cancelGesture(Result& r);
  void onKeyDown(const InputEvent& e, Result& r);
  void onKeyUp(const InputEvent& e, Result& r);
  void onMouseDown(const InputEvent& e, Result& r);
  void onMouseUp(const InputEvent& e, Result& r);
  void onMouseMove(const InputEvent& e, Result& r);

  Config cfg_;
  bool enabled_ = true;
  bool suspended_ = false;
  State state_ = State::Idle;
  bool emoteGesture_ = false;  // the current gesture opened (or will open) the emote wheel
  std::array<bool, 256> keyDown_{};
  std::set<uint32_t> swallowKeyUps_;
  bool swallowRightUp_ = false;
  bool needMask_ = false;
  bool maskMenuKeys_ = true;
  Btn dragBtn_ = Btn::None;
  int px_ = 0;
  int py_ = 0;
  uint64_t lastMouseMs_ = 0;
};

}  // namespace lp
