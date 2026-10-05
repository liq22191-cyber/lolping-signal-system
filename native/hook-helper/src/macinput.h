#pragma once
#include <cstdint>
#include <vector>

// Pure translation logic for the macOS hook layer. No Apple headers, so it is unit-tested on every platform.
namespace lp::mac {

// macOS virtual key code (kVK_*) → Windows virtual-key code. 0 when the key has no VK equivalent.
uint32_t keyCodeToVk(uint16_t keyCode);
// Windows virtual-key code → macOS key code. -1 when there is none. Modifier VKs map to their left/right key codes.
int vkToKeyCode(uint32_t vk);

// CGEventFlags bits (device-independent masks and the NX_DEVICE* left/right bits).
constexpr uint64_t kFlagShift = 0x00020000, kFlagControl = 0x00040000, kFlagOption = 0x00080000, kFlagCommand = 0x00100000;
constexpr uint64_t kDevLCtrl = 0x0001, kDevLShift = 0x0002, kDevRShift = 0x0004, kDevLCmd = 0x0008,
                   kDevRCmd = 0x0010, kDevLAlt = 0x0020, kDevRAlt = 0x0040, kDevRCtrl = 0x2000;

struct KeyTransition {
  uint32_t vk;
  bool down;
};

// Whether the modifier key `vk` (VK_LSHIFT … VK_RWIN) is held according to `flags`. Events posted by other software
// often carry only the device-independent mask: that counts as the left key.
bool modifierHeld(uint64_t flags, uint32_t vk);

// The modifier key-ups, then key-downs, that turn the state in `oldFlags` into the state in `newFlags`.
// Option → VK_LMENU/VK_RMENU, Control → VK_LCONTROL/VK_RCONTROL, Shift → VK_LSHIFT/VK_RSHIFT, Command → VK_LWIN/VK_RWIN.
std::vector<KeyTransition> modifierTransitions(uint64_t oldFlags, uint64_t newFlags);

}  // namespace lp::mac
