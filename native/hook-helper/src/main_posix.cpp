#include <unistd.h>

#include <csignal>
#include <cstring>
#include <string>

#include "app.h"

namespace {

bool writeStdout(const std::string& s) {
  const std::string buf = s + "\n";
  size_t done = 0;
  while (done < buf.size()) {
    const ssize_t n = ::write(STDOUT_FILENO, buf.data() + done, buf.size() - done);
    if (n <= 0) return false;
    done += static_cast<size_t>(n);
  }
  return true;
}

}  // namespace

int main(int argc, char** argv) {
  std::signal(SIGPIPE, SIG_IGN);  // a closed pipe makes write() fail instead of killing the process
  lp::Output out(writeStdout);
  const bool simulate = argc > 1 && std::strcmp(argv[1], "--simulate") == 0;
  const int code = simulate ? lp::runSimulate(out) : lp::runHooks(out);
  out.stop();
  return code;
}
