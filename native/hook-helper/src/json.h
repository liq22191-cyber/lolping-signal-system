#pragma once
#include <map>
#include <string>

namespace lp {

// Parses one flat JSON object such as {"type":"config","enabled":true,"x":3}.
// String values are unescaped; numbers and booleans keep their literal text.
// Nested objects/arrays and trailing garbage are rejected.
bool parseFlatJson(const std::string& text, std::map<std::string, std::string>& out);

std::string jsonEscape(const std::string& s);

}  // namespace lp
