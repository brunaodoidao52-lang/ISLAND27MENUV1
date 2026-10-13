// Style and mood presets — mirror of STYLES / MOODS in core/melodyforge-core.js.
#pragma once

#include "MelodyCore.h"

namespace mfplug::presets
{

struct Style { const char* name; };
inline const std::vector<Style>& styles() { static const std::vector<Style> s = { { "Default" } }; return s; }
inline const std::vector<Style>& moods() { static const std::vector<Style> m = { { "Neutral" } }; return m; }

inline void apply (mf::Settings& s, int /*style*/, int /*mood*/)
{
    s.targets = mf::Targets();
    s.geneRanges = {};
}

} // namespace mfplug::presets
