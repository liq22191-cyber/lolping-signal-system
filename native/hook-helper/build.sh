#!/bin/sh
# Builds the macOS hook helper and its tests with Apple clang (Xcode Command Line Tools).
set -eu
cd "$(dirname "$0")"
mkdir -p build
FLAGS="-std=c++20 -arch arm64 -mmacosx-version-min=12.0 -Wall -Wextra"
clang++ $FLAGS -O2 src/main_posix.cpp src/hooks_mac.cpp src/macinput.cpp src/simulate.cpp src/commands.cpp \
  src/output.cpp src/json.cpp src/decision.cpp \
  -framework ApplicationServices -framework CoreFoundation -o build/hook-helper
clang++ $FLAGS -O0 tests/helper_tests.cpp src/decision.cpp src/macinput.cpp src/json.cpp src/output.cpp \
  -o build/helper_tests
echo "Built build/hook-helper and build/helper_tests"
