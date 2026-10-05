#define NOMINMAX
#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <cwchar>
#include <string>

#include "app.h"

namespace {

bool writeStdout(const std::string& s) {
  static const HANDLE h = GetStdHandle(STD_OUTPUT_HANDLE);
  const std::string buf = s + "\n";
  DWORD written = 0;
  return WriteFile(h, buf.data(), static_cast<DWORD>(buf.size()), &written, nullptr) != 0 && written == buf.size();
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);  // hook coordinates in physical pixels
  lp::Output out(writeStdout);
  const bool simulate = argc > 1 && std::wcscmp(argv[1], L"--simulate") == 0;
  const int code = simulate ? lp::runSimulate(out) : lp::runHooks(out);
  out.stop();
  return code;
}
