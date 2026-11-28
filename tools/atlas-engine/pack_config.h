// The pack configuration of the offline engine: the Marian options for one language pack (its model, vocabulary and
// shortlist files, found by name in the pack folder). Shared by the program (atlas-engine.cpp) and the library
// (atlas_engine_lib.cpp), so both load a pack the same way.
#pragma once

#include <algorithm>
#include <filesystem>
#include <stdexcept>
#include <string>
#include <vector>

namespace fs = std::filesystem;

// The first file in the folder whose name starts with prefix and ends with suffix.
inline std::string findModelFile(const fs::path &dir, const std::string &prefix, const std::string &suffix) {
  std::vector<std::string> matches;
  for (const auto &entry : fs::directory_iterator(dir)) {
    const std::string name = entry.path().filename().string();
    if (name.size() >= prefix.size() + suffix.size() && name.compare(0, prefix.size(), prefix) == 0 &&
        name.compare(name.size() - suffix.size(), suffix.size(), suffix) == 0) {
      matches.push_back(entry.path().string());
    }
  }
  if (matches.empty()) throw std::runtime_error("the language pack has no " + prefix + "*" + suffix + " file");
  std::sort(matches.begin(), matches.end());
  return matches.front();
}

inline std::string yamlQuote(const std::string &s) {
  std::string out = "\"";
  for (char c : s) {
    if (c == '\\' || c == '"') out += '\\';
    out += c;
  }
  return out + "\"";
}

// Marian's configuration for the pack. The options are the ones Firefox's translation worker passes for these models
// (toolkit/components/translations/content/translations-engine.worker.js): no quality model, and the same beam,
// precision and alignment settings. The vocabulary is listed twice, once for the source and once for the target: this
// config loader aborts with fewer than two entries, and it loads a file listed twice only once (so the two are shared).
// True when the folder has a file with this prefix and suffix.
inline bool hasModelFile(const fs::path &dir, const std::string &prefix, const std::string &suffix) {
  try {
    findModelFile(dir, prefix, suffix);
    return true;
  } catch (const std::runtime_error &) {
    return false;
  }
}

inline std::string modelConfig(const fs::path &dir) {
  // A pack with a float32 model (model.<pair>.npz, the weights of Mozilla's training run) is read in float32. ARM builds
  // have no intgemm, so they use these packs; the int8 packs (model.<pair>.intgemm.alphas.bin) are read as before.
  const bool fp32 = hasModelFile(dir, "model.", ".npz");
  const std::string model = fp32 ? findModelFile(dir, "model.", ".npz") : findModelFile(dir, "model.", ".intgemm.alphas.bin");
  const std::string vocab = findModelFile(dir, "vocab.", ".spm");
  const std::string lex = findModelFile(dir, "lex.50.50.", ".s2t.bin");
  std::string yaml;
  yaml += "models:\n  - " + yamlQuote(model) + "\n";
  yaml += "vocabs:\n  - " + yamlQuote(vocab) + "\n  - " + yamlQuote(vocab) + "\n";
  // The second value is the shortlist's check flag (0 = off, as Firefox's check-bytearray default). It is read with
  // std::stoi, so it must be a number, not "false".
  yaml += "shortlist:\n  - " + yamlQuote(lex) + "\n  - 0\n";
  yaml += "beam-size: 1\nnormalize: 1.0\nword-penalty: 0\nmax-length-break: 128\nmax-length-factor: 2.0\n";
  // quiet is off: with it on, Marian's error messages are not printed, and a failed check only shows as an abort.
  yaml += "mini-batch-words: 1024\nworkspace: 128\ncpu-threads: 0\nskip-cost: true\nquiet: false\n";
  yaml += "quiet-translation: true\nalignment: soft\ngemm-precision: ";
  yaml += fp32 ? "float32\n" : "int8shiftAlphaAll\n";
  return yaml;
}
