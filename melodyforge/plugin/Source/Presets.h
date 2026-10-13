// Style and mood presets (names and hints in Brazilian Portuguese, UTF-8) — mirror of STYLES / MOODS / presetSettings in
// core/melodyforge-core.js (checked by tests/golden_test.cpp, PRESET records).
#pragma once

#include <juce_core/juce_core.h>
#include "MelodyCore.h"

namespace mfplug::presets
{

struct GeneSpan { int gene; double lo, hi; };

struct Style
{
    const char* name;
    int bpmLo, bpmHi, chordRhythm;
    mf::Targets targets;
    std::vector<GeneSpan> ranges;
    const char* hint;
};

struct Mood
{
    const char* name;
    std::vector<int> scales, progressions;   // empty = all
    std::vector<GeneSpan> ranges;
    const char* hint;
};

inline const std::vector<Style>& styles()
{
    using namespace mf;
    static const std::vector<Style> s = {
        { "Livre", 70, 150, Sustain, { 4, 0.7, 12, 0.2, 0.6 }, {}, "Sem preferência de estilo" },
        { "Trap", 130, 160, Sustain, { 5, 0.6, 12, 0.45, 0.75 },
          { { Syncopation, 0.5, 1 }, { Density, 0.4, 0.9 }, { BassMovement, 0, 0.4 }, { Swing, 0, 0.15 }, { ChordComplexity, 0.2, 0.6 } },
          "130-160 BPM, melodias sincopadas e baixo com notas longas" },
        { "Lo-fi", 70, 90, Sustain, { 3, 0.75, 10, 0.3, 0.7 },
          { { ChordComplexity, 0.7, 1 }, { Swing, 0.4, 0.8 }, { Density, 0.2, 0.55 }, { BassMovement, 0.33, 0.66 } },
          "70-90 BPM, acordes com sétima e swing preguiçoso" },
        { "Pop", 95, 128, Half, { 4, 0.75, 12, 0.25, 0.8 },
          { { Repetition, 0.6, 1 }, { ChordComplexity, 0, 0.35 }, { Syncopation, 0.2, 0.5 }, { Swing, 0, 0.1 } },
          "95-128 BPM, refrões que grudam e acordes simples" },
        { "R&B", 65, 95, Sustain, { 4, 0.65, 14, 0.4, 0.6 },
          { { ChordComplexity, 0.7, 1 }, { Swing, 0.2, 0.6 }, { Syncopation, 0.4, 0.8 } },
          "65-95 BPM, acordes ricos e síncope com alma" },
        { "Funk BR", 128, 150, Stabs, { 6, 0.55, 10, 0.5, 0.85 },
          { { Syncopation, 0.5, 1 }, { Repetition, 0.7, 1 }, { BassMovement, 0.66, 1 }, { ChordComplexity, 0, 0.3 } },
          "128-150 BPM, ataques curtos e riffs bem repetitivos" },
        { "Reggaeton", 88, 100, Stabs, { 5, 0.65, 10, 0.45, 0.8 },
          { { Syncopation, 0.4, 0.8 }, { Repetition, 0.6, 1 }, { ChordComplexity, 0.1, 0.5 } },
          "88-100 BPM, ataques e ganchos no ritmo do dembow" },
        { "House", 120, 128, Stabs, { 5, 0.6, 12, 0.4, 0.8 },
          { { BassMovement, 0.66, 1 }, { ChordComplexity, 0.4, 0.8 }, { Syncopation, 0.3, 0.7 } },
          "120-128 BPM, ataques de acorde e baixo em movimento" },
        { "Ambiente", 60, 90, Sustain, { 2, 0.85, 10, 0.05, 0.7 },
          { { Density, 0, 0.3 }, { Swing, 0, 0.05 }, { BassMovement, 0, 0.33 }, { ChordComplexity, 0.5, 1 } },
          "60-90 BPM, poucas notas longas e pads espaçosos" },
        { "Jazz", 90, 160, Half, { 5, 0.55, 14, 0.4, 0.4 },
          { { ChordComplexity, 0.75, 1 }, { Swing, 0.5, 1 }, { BassMovement, 0.66, 1 } },
          "90-160 BPM, swing, sétimas e baixo caminhante" },
    };
    return s;
}

inline const std::vector<Mood>& moods()
{
    using namespace mf;
    static const std::vector<Mood> m = {
        { "Neutro", {}, {}, {}, "Qualquer escala ou progressão" },
        { "Alegre", { 0, 3, 5 }, { 0, 1, 3, 7 }, { { Contour, 0.5, 1 }, { Dynamics, 0.4, 0.8 }, { Range, 0.4, 0.9 } },
          "Escalas maiores e melodias que sobem" },
        { "Triste", { 1, 2, 4 }, { 2, 5, 6 }, { { Contour, 0, 0.5 }, { Dynamics, 0.1, 0.5 }, { Range, 0.2, 0.6 } },
          "Escalas menores, melodias que descem, suaves" },
        { "Sombrio", { 1, 4, 6 }, { 5, 6 }, { { Contour, 0, 0.4 }, { Dynamics, 0.3, 0.7 }, { Range, 0.1, 0.5 } },
          "Menor e menor harmônica, grave e contido" },
        { "Sonhador", { 0, 2, 5 }, { 1, 2, 7 }, { { Contour, 0.3, 0.7 }, { Dynamics, 0, 0.4 }, { Range, 0.5, 1 } },
          "Escalas abertas, melodias amplas e suaves" },
        { "Enérgico", { 1, 3, 6 }, { 0, 1, 2, 5 }, { { Contour, 0.4, 0.9 }, { Dynamics, 0.6, 1 }, { Range, 0.5, 1 } },
          "Progressões fortes e acentos marcados" },
        { "Relaxado", { 2, 0, 6 }, { 1, 3, 4 }, { { Contour, 0.3, 0.6 }, { Dynamics, 0.1, 0.4 }, { Range, 0.2, 0.6 } },
          "Dórico ou maior, tranquilo e suave" },
    };
    return m;
}

// Applies the preset part of the settings (tempo range, rhythm, targets, gene ranges, pools).
inline void apply (mf::Settings& s, int styleIdx, int moodIdx)
{
    const auto& st = styles()[(size_t) juce::jlimit (0, (int) styles().size() - 1, styleIdx)];
    const auto& md = moods()[(size_t) juce::jlimit (0, (int) moods().size() - 1, moodIdx)];
    s.bpmLo = st.bpmLo;
    s.bpmHi = st.bpmHi;
    s.chordRhythm = st.chordRhythm;
    s.targets = st.targets;
    s.geneRanges = {};
    for (const auto& r : st.ranges) s.geneRanges[(size_t) r.gene] = { true, r.lo, r.hi };
    for (const auto& r : md.ranges) s.geneRanges[(size_t) r.gene] = { true, r.lo, r.hi };
    s.scalePool = md.scales;
    s.progressionPool = md.progressions;
    s = mf::normalize (s);
}

} // namespace mfplug::presets
