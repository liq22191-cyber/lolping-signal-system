#include <iostream>
#include <string>

#include "app.h"
#include "commands.h"

namespace lp {
namespace {

const char* btnName(Btn b) {
  switch (b) {
    case Btn::Left: return "left";
    case Btn::Right: return "right";
    case Btn::Middle: return "middle";
    case Btn::X1: return "x1";
    case Btn::X2: return "x2";
    default: return "none";
  }
}

std::string describeInjects(const std::vector<Inject>& injects) {
  std::string s;
  for (const auto& i : injects) {
    if (!s.empty()) s += ',';
    switch (i.kind) {
      case InjectKind::ButtonDown: s += std::string("down:") + btnName(i.btn); break;
      case InjectKind::ButtonUp: s += std::string("up:") + btnName(i.btn); break;
      case InjectKind::KeyDown: s += "kdown:" + std::to_string(i.vk); break;
      case InjectKind::KeyUp: s += "kup:" + std::to_string(i.vk); break;
    }
  }
  return s;
}

void report(Output& out, const Result& r, bool withSimLine) {
  for (const auto& e : r.emits) out.emit(e);
  if (withSimLine) {
    out.line(std::string("{\"type\":\"sim\",\"swallow\":") + (r.swallow ? "true" : "false") + ",\"inject\":\"" +
             describeInjects(r.injects) + "\"}");
  }
}

}  // namespace

int runSimulate(Output& out) {
  Decision d;
  out.ready();
  std::string line;
  while (std::getline(std::cin, line)) {
    if (!line.empty() && line.back() == '\r') line.pop_back();
    const Command c = parseCommand(line, d.config());
    switch (c.kind) {
      case Command::Kind::Config: report(out, d.setConfig(c.config), false); break;
      case Command::Kind::SetEnabled: report(out, d.setEnabled(c.flag), false); break;
      case Command::Kind::Suspend: report(out, d.setSuspended(c.flag), false); break;
      case Command::Kind::Shutdown: return 0;
      case Command::Kind::SimEvent: report(out, d.onEvent(c.event), true); break;
      case Command::Kind::SimTick: report(out, d.tick(c.timeMs), true); break;
      case Command::Kind::Invalid: out.error("invalid command: " + line); break;
    }
  }
  return 0;
}

}  // namespace lp
