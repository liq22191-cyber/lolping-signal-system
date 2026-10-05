#include "commands.h"

#include <map>

#include "json.h"

namespace lp {
namespace {

using Fields = std::map<std::string, std::string>;

std::string getStr(const Fields& m, const char* k) {
  const auto it = m.find(k);
  return it == m.end() ? std::string() : it->second;
}

bool getBool(const Fields& m, const char* k, bool def) {
  const std::string v = getStr(m, k);
  if (v == "true") return true;
  if (v == "false") return false;
  return def;
}

long long getInt(const Fields& m, const char* k, long long def) {
  const auto it = m.find(k);
  if (it == m.end()) return def;
  try {
    size_t used = 0;
    const long long v = std::stoll(it->second, &used);
    return used == it->second.size() ? v : def;
  } catch (...) {
    return def;
  }
}

bool parseTrigger(const std::string& s, Trigger& t) {
  static const std::map<std::string, Trigger> names{
      {"alt", Trigger::Alt},           {"ctrl", Trigger::Ctrl},     {"shift", Trigger::Shift},
      {"win", Trigger::Win},           {"capslock", Trigger::CapsLock}, {"mouse4", Trigger::Mouse4},
      {"mouse5", Trigger::Mouse5},     {"vk", Trigger::CustomVk},
  };
  const auto it = names.find(s);
  if (it == names.end()) return false;
  t = it->second;
  return true;
}

Btn parseBtn(const std::string& s) {
  if (s == "left") return Btn::Left;
  if (s == "right") return Btn::Right;
  if (s == "middle") return Btn::Middle;
  if (s == "x1") return Btn::X1;
  if (s == "x2") return Btn::X2;
  return Btn::None;
}

}  // namespace

Command parseCommand(const std::string& line, const Config& current) {
  Command c;
  Fields m;
  if (!parseFlatJson(line, m)) return c;
  const std::string type = getStr(m, "type");

  if (type == "config") {
    Config cfg = current;
    if (m.count("trigger") != 0 && !parseTrigger(m["trigger"], cfg.trigger)) return c;
    cfg.triggerVk = static_cast<uint32_t>(getInt(m, "triggerVk", cfg.triggerVk));
    if (m.count("emoteTrigger") != 0 && !parseTrigger(m["emoteTrigger"], cfg.emoteTrigger)) return c;
    cfg.emoteTriggerVk = static_cast<uint32_t>(getInt(m, "emoteTriggerVk", cfg.emoteTriggerVk));
    cfg.clickPing = getBool(m, "clickPing", cfg.clickPing);
    const long long drag = getInt(m, "dragThresholdPx", cfg.dragThresholdPx);
    cfg.dragThresholdPx = drag < 1 ? 1 : static_cast<int>(drag);
    cfg.toggleMods = static_cast<uint32_t>(getInt(m, "toggleMods", cfg.toggleMods));
    cfg.toggleVk = static_cast<uint32_t>(getInt(m, "toggleVk", cfg.toggleVk));
    cfg.enabled = getBool(m, "enabled", cfg.enabled);
    c.kind = Command::Kind::Config;
    c.config = cfg;
  } else if (type == "setEnabled") {
    c.kind = Command::Kind::SetEnabled;
    c.flag = getBool(m, "enabled", true);
  } else if (type == "suspend") {
    c.kind = Command::Kind::Suspend;
    c.flag = getBool(m, "on", false);
  } else if (type == "shutdown") {
    c.kind = Command::Kind::Shutdown;
  } else if (type == "sim") {
    const std::string ev = getStr(m, "ev");
    c.timeMs = static_cast<uint64_t>(getInt(m, "t", 0));
    if (ev == "tick") {
      c.kind = Command::Kind::SimTick;
      return c;
    }
    InputEvent e;
    e.timeMs = c.timeMs;
    e.x = static_cast<int>(getInt(m, "x", 0));
    e.y = static_cast<int>(getInt(m, "y", 0));
    e.vk = static_cast<uint32_t>(getInt(m, "vk", 0));
    e.btn = parseBtn(getStr(m, "btn"));
    e.selfInjected = getBool(m, "self", false);
    if (ev == "mdown") e.kind = EvKind::MouseDown;
    else if (ev == "mup") e.kind = EvKind::MouseUp;
    else if (ev == "move") e.kind = EvKind::MouseMove;
    else if (ev == "kdown") e.kind = EvKind::KeyDown;
    else if (ev == "kup") e.kind = EvKind::KeyUp;
    else return c;
    c.kind = Command::Kind::SimEvent;
    c.event = e;
  }
  return c;
}

}  // namespace lp
