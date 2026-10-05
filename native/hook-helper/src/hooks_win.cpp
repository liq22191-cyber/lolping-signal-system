#define NOMINMAX
#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <iostream>
#include <memory>
#include <string>
#include <thread>
#include <vector>

#include "app.h"
#include "commands.h"

namespace lp {
namespace {

constexpr ULONG_PTR kSelfMarker = 0x4C50494E;  // "LPIN" in dwExtraInfo marks our own SendInput events
constexpr UINT kWmCommand = WM_APP + 1;

Decision* g_decision = nullptr;
Output* g_out = nullptr;

bool isExtendedVk(uint32_t vk) {
  switch (vk) {
    case VK_RMENU: case VK_RCONTROL: case VK_LWIN: case VK_RWIN: case VK_INSERT: case VK_DELETE:
    case VK_HOME: case VK_END: case VK_PRIOR: case VK_NEXT: case VK_LEFT: case VK_RIGHT: case VK_UP: case VK_DOWN:
      return true;
    default:
      return false;
  }
}

bool isKeyDown(uint32_t vk) { return (GetAsyncKeyState(static_cast<int>(vk)) & 0x8000) != 0; }

void sendInjects(const std::vector<Inject>& injects) {
  std::vector<INPUT> inputs;
  for (const auto& i : injects) {
    INPUT in{};
    if (i.kind == InjectKind::ButtonDown || i.kind == InjectKind::ButtonUp) {
      const bool down = i.kind == InjectKind::ButtonDown;
      in.type = INPUT_MOUSE;
      in.mi.dwExtraInfo = kSelfMarker;
      switch (i.btn) {
        case Btn::Left: in.mi.dwFlags = down ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP; break;
        case Btn::Right: in.mi.dwFlags = down ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP; break;
        case Btn::Middle: in.mi.dwFlags = down ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP; break;
        case Btn::X1:
          in.mi.dwFlags = down ? MOUSEEVENTF_XDOWN : MOUSEEVENTF_XUP;
          in.mi.mouseData = XBUTTON1;
          break;
        case Btn::X2:
          in.mi.dwFlags = down ? MOUSEEVENTF_XDOWN : MOUSEEVENTF_XUP;
          in.mi.mouseData = XBUTTON2;
          break;
        default:
          continue;
      }
    } else {
      in.type = INPUT_KEYBOARD;
      in.ki.wVk = static_cast<WORD>(i.vk);
      in.ki.dwFlags = (i.kind == InjectKind::KeyUp ? KEYEVENTF_KEYUP : 0u) | (isExtendedVk(i.vk) ? KEYEVENTF_EXTENDEDKEY : 0u);
      in.ki.dwExtraInfo = kSelfMarker;
    }
    inputs.push_back(in);
  }
  if (!inputs.empty()) SendInput(static_cast<UINT>(inputs.size()), inputs.data(), sizeof(INPUT));
}

// Reports emits, performs injections, and returns whether to swallow the event.
bool apply(const Result& r) {
  for (const auto& e : r.emits) g_out->emit(e);
  sendInjects(r.injects);
  return r.swallow;
}

LRESULT CALLBACK mouseProc(int code, WPARAM wParam, LPARAM lParam) {
  if (code == HC_ACTION) {
    const auto* m = reinterpret_cast<const MSLLHOOKSTRUCT*>(lParam);
    InputEvent e;
    e.x = m->pt.x;
    e.y = m->pt.y;
    e.timeMs = GetTickCount64();
    e.selfInjected = (m->flags & LLMHF_INJECTED) != 0 && m->dwExtraInfo == kSelfMarker;
    bool known = true;
    switch (wParam) {
      case WM_MOUSEMOVE: e.kind = EvKind::MouseMove; break;
      case WM_LBUTTONDOWN: e.kind = EvKind::MouseDown; e.btn = Btn::Left; break;
      case WM_LBUTTONUP: e.kind = EvKind::MouseUp; e.btn = Btn::Left; break;
      case WM_RBUTTONDOWN: e.kind = EvKind::MouseDown; e.btn = Btn::Right; break;
      case WM_RBUTTONUP: e.kind = EvKind::MouseUp; e.btn = Btn::Right; break;
      case WM_MBUTTONDOWN: e.kind = EvKind::MouseDown; e.btn = Btn::Middle; break;
      case WM_MBUTTONUP: e.kind = EvKind::MouseUp; e.btn = Btn::Middle; break;
      case WM_XBUTTONDOWN:
      case WM_XBUTTONUP:
        e.kind = wParam == WM_XBUTTONDOWN ? EvKind::MouseDown : EvKind::MouseUp;
        e.btn = HIWORD(m->mouseData) == XBUTTON1 ? Btn::X1 : Btn::X2;
        break;
      default:
        known = false;
    }
    if (known && e.kind == EvKind::MouseDown) g_decision->syncKeyStates(isKeyDown);
    if (known && apply(g_decision->onEvent(e))) return 1;
  }
  return CallNextHookEx(nullptr, code, wParam, lParam);
}

LRESULT CALLBACK keyProc(int code, WPARAM wParam, LPARAM lParam) {
  if (code == HC_ACTION) {
    const auto* k = reinterpret_cast<const KBDLLHOOKSTRUCT*>(lParam);
    InputEvent e;
    e.kind = (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN) ? EvKind::KeyDown : EvKind::KeyUp;
    e.vk = k->vkCode;
    e.timeMs = GetTickCount64();
    e.selfInjected = (k->flags & LLKHF_INJECTED) != 0 && k->dwExtraInfo == kSelfMarker;
    if (apply(g_decision->onEvent(e))) return 1;
  }
  return CallNextHookEx(nullptr, code, wParam, lParam);
}

}  // namespace

int runHooks(Output& out) {
  Decision decision;
  g_decision = &decision;
  g_out = &out;
  const DWORD threadId = GetCurrentThreadId();
  MSG msg;
  PeekMessageW(&msg, nullptr, WM_USER, WM_USER, PM_NOREMOVE);  // make sure this thread has a queue

  HHOOK mouseHook = SetWindowsHookExW(WH_MOUSE_LL, mouseProc, GetModuleHandleW(nullptr), 0);
  HHOOK keyHook = SetWindowsHookExW(WH_KEYBOARD_LL, keyProc, GetModuleHandleW(nullptr), 0);
  if (mouseHook == nullptr || keyHook == nullptr) {
    out.error("SetWindowsHookEx failed with error " + std::to_string(GetLastError()));
    return 2;
  }
  SetTimer(nullptr, 0, 1000, nullptr);  // watchdog tick

  std::thread reader([threadId] {
    std::string line;
    while (std::getline(std::cin, line)) {
      if (!line.empty() && line.back() == '\r') line.pop_back();
      auto* text = new std::string(std::move(line));
      if (!PostThreadMessageW(threadId, kWmCommand, 0, reinterpret_cast<LPARAM>(text))) delete text;
    }
    PostThreadMessageW(threadId, WM_QUIT, 0, 0);  // stdin closed: Electron is gone
  });
  reader.detach();
  out.ready();

  while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
    if (msg.message == WM_TIMER) {
      decision.syncKeyStates(isKeyDown);
      apply(decision.tick(GetTickCount64()));
    } else if (msg.message == kWmCommand) {
      std::unique_ptr<std::string> text(reinterpret_cast<std::string*>(msg.lParam));
      const Command c = parseCommand(*text, decision.config());
      switch (c.kind) {
        case Command::Kind::Config: apply(decision.setConfig(c.config)); break;
        case Command::Kind::SetEnabled: apply(decision.setEnabled(c.flag)); break;
        case Command::Kind::Suspend: apply(decision.setSuspended(c.flag)); break;
        case Command::Kind::Shutdown: PostQuitMessage(0); break;
        default: out.error("invalid command: " + *text); break;
      }
    }
  }
  UnhookWindowsHookEx(mouseHook);
  UnhookWindowsHookEx(keyHook);
  return 0;
}

}  // namespace lp
