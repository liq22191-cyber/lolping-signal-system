#include "json.h"

#include <cstdio>

namespace lp {
namespace {

bool isWs(char c) { return c == ' ' || c == '\t' || c == '\r' || c == '\n'; }

void skipWs(const std::string& s, size_t& i) {
  while (i < s.size() && isWs(s[i])) ++i;
}

bool readString(const std::string& s, size_t& i, std::string& out) {
  if (i >= s.size() || s[i] != '"') return false;
  ++i;
  out.clear();
  while (i < s.size()) {
    const char c = s[i++];
    if (c == '"') return true;
    if (c != '\\') {
      out += c;
      continue;
    }
    if (i >= s.size()) return false;
    switch (s[i++]) {
      case '"': out += '"'; break;
      case '\\': out += '\\'; break;
      case '/': out += '/'; break;
      case 'n': out += '\n'; break;
      case 'r': out += '\r'; break;
      case 't': out += '\t'; break;
      default: return false;
    }
  }
  return false;
}

}  // namespace

bool parseFlatJson(const std::string& s, std::map<std::string, std::string>& out) {
  out.clear();
  size_t i = 0;
  skipWs(s, i);
  if (i >= s.size() || s[i] != '{') return false;
  ++i;
  skipWs(s, i);
  if (i < s.size() && s[i] == '}') {
    ++i;
    skipWs(s, i);
    return i == s.size();
  }
  while (true) {
    std::string key;
    std::string val;
    skipWs(s, i);
    if (!readString(s, i, key)) return false;
    skipWs(s, i);
    if (i >= s.size() || s[i] != ':') return false;
    ++i;
    skipWs(s, i);
    if (i < s.size() && s[i] == '"') {
      if (!readString(s, i, val)) return false;
    } else {
      const size_t start = i;
      while (i < s.size() && s[i] != ',' && s[i] != '}' && !isWs(s[i])) ++i;
      val = s.substr(start, i - start);
      if (val.empty() || val[0] == '{' || val[0] == '[') return false;
    }
    out[key] = val;
    skipWs(s, i);
    if (i < s.size() && s[i] == ',') {
      ++i;
      continue;
    }
    if (i < s.size() && s[i] == '}') {
      ++i;
      skipWs(s, i);
      return i == s.size();
    }
    return false;
  }
}

std::string jsonEscape(const std::string& s) {
  std::string out;
  for (const char c : s) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (static_cast<unsigned char>(c) < 0x20) {
          char buf[8];
          std::snprintf(buf, sizeof(buf), "\\u%04x", static_cast<unsigned>(static_cast<unsigned char>(c)));
          out += buf;
        } else {
          out += c;
        }
    }
  }
  return out;
}

}  // namespace lp
