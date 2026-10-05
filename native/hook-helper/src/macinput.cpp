#include "macinput.h"

#include <iterator>

namespace lp::mac {
namespace {

struct KeyPair {
  uint16_t keyCode;
  uint32_t vk;
};

// kVK_* from Carbon's Events.h. Modifiers are listed so vkToKeyCode can answer for them.
constexpr KeyPair kKeys[] = {
    {0x00, 'A'}, {0x0B, 'B'}, {0x08, 'C'}, {0x02, 'D'}, {0x0E, 'E'}, {0x03, 'F'}, {0x05, 'G'}, {0x04, 'H'},
    {0x22, 'I'}, {0x26, 'J'}, {0x28, 'K'}, {0x25, 'L'}, {0x2E, 'M'}, {0x2D, 'N'}, {0x1F, 'O'}, {0x23, 'P'},
    {0x0C, 'Q'}, {0x0F, 'R'}, {0x01, 'S'}, {0x11, 'T'}, {0x20, 'U'}, {0x09, 'V'}, {0x0D, 'W'}, {0x07, 'X'},
    {0x10, 'Y'}, {0x06, 'Z'},
    {0x1D, '0'}, {0x12, '1'}, {0x13, '2'}, {0x14, '3'}, {0x15, '4'}, {0x17, '5'}, {0x16, '6'}, {0x1A, '7'},
    {0x1C, '8'}, {0x19, '9'},
    {0x7A, 0x70}, {0x78, 0x71}, {0x63, 0x72}, {0x76, 0x73}, {0x60, 0x74}, {0x61, 0x75}, {0x62, 0x76},
    {0x64, 0x77}, {0x65, 0x78}, {0x6D, 0x79}, {0x67, 0x7A}, {0x6F, 0x7B}, {0x69, 0x7C}, {0x6B, 0x7D},
    {0x71, 0x7E}, {0x6A, 0x7F}, {0x40, 0x80}, {0x4F, 0x81}, {0x50, 0x82}, {0x5A, 0x83},  // F1-F20
    {0x24, 0x0D}, {0x4C, 0x0D},                                                          // Return, keypad Enter
    {0x30, 0x09}, {0x31, 0x20}, {0x33, 0x08}, {0x35, 0x1B}, {0x75, 0x2E}, {0x72, 0x2D},  // Tab Space ⌫ Esc ⌦ Help
    {0x73, 0x24}, {0x77, 0x23}, {0x74, 0x21}, {0x79, 0x22},                              // Home End PgUp PgDn
    {0x7B, 0x25}, {0x7E, 0x26}, {0x7C, 0x27}, {0x7D, 0x28},                              // arrows
    {0x32, 0xC0}, {0x1B, 0xBD}, {0x18, 0xBB}, {0x21, 0xDB}, {0x1E, 0xDD}, {0x2A, 0xDC},  // ` - = [ ] backslash
    {0x29, 0xBA}, {0x27, 0xDE}, {0x2B, 0xBC}, {0x2F, 0xBE}, {0x2C, 0xBF},                // ; ' , . /
    {0x52, 0x60}, {0x53, 0x61}, {0x54, 0x62}, {0x55, 0x63}, {0x56, 0x64}, {0x57, 0x65}, {0x58, 0x66},
    {0x59, 0x67}, {0x5B, 0x68}, {0x5C, 0x69},                                            // keypad 0-9
    {0x43, 0x6A}, {0x45, 0x6B}, {0x4E, 0x6D}, {0x41, 0x6E}, {0x4B, 0x6F},                // keypad * + - . /
    {0x39, 0x14},                                                                        // Caps Lock
    {0x38, 0xA0}, {0x3C, 0xA1}, {0x3B, 0xA2}, {0x3E, 0xA3}, {0x3A, 0xA4}, {0x3D, 0xA5},  // modifiers
    {0x37, 0x5B}, {0x36, 0x5C},
};

struct Modifier {
  uint32_t vk;
  uint64_t group;  // device-independent mask
  uint64_t self;   // this side's device bit
  uint64_t other;  // the other side's device bit
};

constexpr Modifier kMods[] = {
    {0xA0, kFlagShift, kDevLShift, kDevRShift},  {0xA1, kFlagShift, kDevRShift, kDevLShift},
    {0xA2, kFlagControl, kDevLCtrl, kDevRCtrl},  {0xA3, kFlagControl, kDevRCtrl, kDevLCtrl},
    {0xA4, kFlagOption, kDevLAlt, kDevRAlt},     {0xA5, kFlagOption, kDevRAlt, kDevLAlt},
    {0x5B, kFlagCommand, kDevLCmd, kDevRCmd},    {0x5C, kFlagCommand, kDevRCmd, kDevLCmd},
};

bool isLeft(uint32_t vk) { return vk == 0xA0 || vk == 0xA2 || vk == 0xA4 || vk == 0x5B; }

}  // namespace

uint32_t keyCodeToVk(uint16_t keyCode) {
  for (const auto& k : kKeys) {
    if (k.keyCode == keyCode) return k.vk;
  }
  return 0;
}

int vkToKeyCode(uint32_t vk) {
  for (const auto& k : kKeys) {
    if (k.vk == vk) return k.keyCode;
  }
  return -1;
}

bool modifierHeld(uint64_t flags, uint32_t vk) {
  for (const auto& m : kMods) {
    if (m.vk != vk) continue;
    if ((flags & m.group) == 0) return false;  // the group is up, whatever the device bits say
    if ((flags & m.self) != 0) return true;
    // Group down with no side bit at all (synthetic events): treat it as the left key.
    return isLeft(vk) && (flags & m.other) == 0;
  }
  return false;
}

std::vector<KeyTransition> modifierTransitions(uint64_t oldFlags, uint64_t newFlags) {
  std::vector<KeyTransition> ups;
  std::vector<KeyTransition> downs;
  for (const auto& m : kMods) {
    const bool was = modifierHeld(oldFlags, m.vk);
    const bool is = modifierHeld(newFlags, m.vk);
    if (was && !is) ups.push_back({m.vk, false});
    if (!was && is) downs.push_back({m.vk, true});
  }
  ups.insert(ups.end(), std::make_move_iterator(downs.begin()), std::make_move_iterator(downs.end()));
  return ups;
}

}  // namespace lp::mac
