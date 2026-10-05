#pragma once
#include <cstdint>
#include <string>

#include "decision.h"

namespace lp {

struct Command {
  enum class Kind { Invalid, Config, SetEnabled, Suspend, Shutdown, SimEvent, SimTick } kind = Kind::Invalid;
  Config config;      // Config
  bool flag = false;  // SetEnabled / Suspend
  InputEvent event;   // SimEvent
  uint64_t timeMs = 0;  // SimEvent / SimTick
};

// Parses one stdin line. `current` supplies values for config fields missing from the message.
Command parseCommand(const std::string& line, const Config& current);

}  // namespace lp
