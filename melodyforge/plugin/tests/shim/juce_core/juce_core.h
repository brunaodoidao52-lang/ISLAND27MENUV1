// Minimal stand-in for <juce_core/juce_core.h> so the golden test builds without JUCE.
#pragma once
#include <algorithm>
namespace juce { template <typename T> T jlimit (T lo, T hi, T v) { return v < lo ? lo : (hi < v ? hi : v); } }
