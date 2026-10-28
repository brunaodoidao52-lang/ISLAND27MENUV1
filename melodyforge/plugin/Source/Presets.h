// Style and mood presets of Melody Generator (names and hints in Brazilian Portuguese, UTF-8).
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
        { "Drill", 140, 145, Sustain, { 5, 0.55, 12, 0.5, 0.7 },
          { { Syncopation, 0.55, 1 }, { Density, 0.4, 0.85 }, { BassMovement, 0.33, 0.66 }, { Swing, 0, 0.1 }, { ChordComplexity, 0.2, 0.6 } },
          "140-145 BPM, melodias sombrias e 808 que desliza" },
        { "Boom Bap", 85, 95, Half, { 4, 0.7, 12, 0.35, 0.7 },
          { { Swing, 0.4, 0.8 }, { ChordComplexity, 0.5, 0.9 }, { BassMovement, 0.33, 0.66 }, { Density, 0.3, 0.7 } },
          "85-95 BPM, swing de sampler e acordes de jazz" },
        { "Phonk", 130, 145, Stabs, { 5, 0.6, 10, 0.5, 0.85 },
          { { Repetition, 0.7, 1 }, { Syncopation, 0.4, 0.9 }, { BassMovement, 0, 0.33 }, { ChordComplexity, 0, 0.4 } },
          "130-145 BPM, riff curto repetido e 808 pesado" },
        { "Afrobeats", 100, 115, Stabs, { 5, 0.65, 10, 0.45, 0.8 },
          { { Syncopation, 0.45, 0.85 }, { Repetition, 0.6, 1 }, { BassMovement, 0.33, 0.8 }, { Swing, 0.1, 0.35 } },
          "100-115 BPM, groove solto e melodias de gancho" },
        { "Piseiro", 150, 165, Half, { 6, 0.7, 10, 0.35, 0.85 },
          { { Repetition, 0.7, 1 }, { ChordComplexity, 0, 0.3 }, { BassMovement, 0.33, 0.66 }, { Density, 0.5, 0.9 } },
          "150-165 BPM, teclado marcante e refrão repetido" },
        { "Sertanejo", 90, 130, Half, { 4, 0.75, 12, 0.25, 0.75 },
          { { Repetition, 0.55, 0.95 }, { ChordComplexity, 0, 0.35 }, { Contour, 0.4, 0.8 } },
          "90-130 BPM, violão e melodia para cantar junto" },
        { "Pagode", 90, 110, Stabs, { 5, 0.65, 12, 0.4, 0.7 },
          { { ChordComplexity, 0.6, 1 }, { Swing, 0.2, 0.5 }, { Syncopation, 0.4, 0.8 } },
          "90-110 BPM, cavaco sincopado e acordes com sétima" },
        { "Bossa Nova", 110, 140, Half, { 4, 0.7, 12, 0.4, 0.6 },
          { { ChordComplexity, 0.8, 1 }, { Swing, 0.1, 0.3 }, { Syncopation, 0.4, 0.8 }, { BassMovement, 0.33, 0.66 } },
          "110-140 BPM, acordes ricos e balanço suave" },
        { "Gospel", 65, 90, Sustain, { 4, 0.7, 12, 0.25, 0.65 },
          { { ChordComplexity, 0.75, 1 }, { Dynamics, 0.5, 1 }, { BassMovement, 0.33, 0.66 } },
          "65-90 BPM, piano e órgão com acordes cheios" },
        { "Synthwave", 95, 118, Half, { 4, 0.7, 12, 0.25, 0.75 },
          { { ChordComplexity, 0.3, 0.7 }, { Repetition, 0.6, 1 }, { BassMovement, 0.66, 1 } },
          "95-118 BPM, sintetizadores dos anos 80 e baixo pulsante" },
        { "Rock", 110, 150, Half, { 5, 0.6, 12, 0.3, 0.75 },
          { { ChordComplexity, 0, 0.3 }, { Repetition, 0.5, 0.9 }, { BassMovement, 0.33, 0.8 }, { Dynamics, 0.6, 1 } },
          "110-150 BPM, guitarra, acordes fortes e refrão direto" },
        { "Dancehall", 90, 105, Stabs, { 5, 0.6, 10, 0.5, 0.8 },
          { { Syncopation, 0.5, 0.9 }, { Repetition, 0.6, 1 }, { ChordComplexity, 0.1, 0.5 } },
          "90-105 BPM, ganchos sincopados e clima de praia" },
        { "Brega Funk", 155, 170, Stabs, { 6, 0.6, 10, 0.5, 0.85 },
          { { Syncopation, 0.5, 1 }, { Repetition, 0.7, 1 }, { BassMovement, 0, 0.4 } },
          "155-170 BPM, melodia chiclete e 808 batendo" },
        { "Drum & Bass", 165, 178, Sustain, { 4, 0.65, 12, 0.45, 0.7 },
          { { BassMovement, 0.66, 1 }, { ChordComplexity, 0.4, 0.8 }, { Density, 0.3, 0.7 } },
          "165-178 BPM, pads atmosféricos e baixo rápido" },
        { "Cinemático", 60, 100, Sustain, { 3, 0.75, 14, 0.15, 0.6 },
          { { Density, 0.15, 0.5 }, { Range, 0.6, 1 }, { ChordComplexity, 0.4, 0.8 }, { Dynamics, 0.5, 1 } },
          "60-100 BPM, cordas, melodias amplas e acordes grandes" },
    };
    return s;
}

// Scale indices (MelodyCore.h): 0 maior, 1 menor natural, 2 menor melódica, 3 maior com 7ª, 4 menor com 7ª,
// 5 menor harmônica, 6 dórico, 7 mixolídio, 8 frígio, 9 lídio, 10 pent. maior, 11 pent. menor, 12 blues.
// Progressions: 0-7 for major scales, 8-15 for minor scales (only the ones that fit the scale are used).
inline const std::vector<Mood>& moods()
{
    using namespace mf;
    static const std::vector<Mood> m = {
        { "Neutro", {}, {}, {}, "Qualquer escala ou progressão" },
        { "Alegre", { 0, 3, 7, 10 }, { 0, 1, 3, 6, 7 }, { { Contour, 0.5, 1 }, { Dynamics, 0.4, 0.8 }, { Range, 0.4, 0.9 } },
          "Escalas maiores e melodias que sobem" },
        { "Triste", { 1, 2, 4 }, { 8, 9, 10, 12 }, { { Contour, 0, 0.5 }, { Dynamics, 0.1, 0.5 }, { Range, 0.2, 0.6 } },
          "Menor natural, melódica e com 7ª; melodias que descem" },
        { "Sombrio", { 1, 5, 8 }, { 8, 9, 11, 13 }, { { Contour, 0, 0.4 }, { Dynamics, 0.3, 0.7 }, { Range, 0.1, 0.5 } },
          "Menor, menor harmônica e frígio, grave e contido" },
        { "Sonhador", { 0, 3, 9 }, { 1, 5, 7 }, { { Contour, 0.3, 0.7 }, { Dynamics, 0, 0.4 }, { Range, 0.5, 1 } },
          "Maior com 7ª e lídio, melodias amplas e suaves" },
        { "Enérgico", { 1, 0, 5, 11 }, { 0, 1, 8, 10 }, { { Contour, 0.4, 0.9 }, { Dynamics, 0.6, 1 }, { Range, 0.5, 1 } },
          "Progressões fortes e acentos marcados" },
        { "Relaxado", { 6, 3, 0 }, { 4, 6, 14, 15 }, { { Contour, 0.3, 0.6 }, { Dynamics, 0.1, 0.4 }, { Range, 0.2, 0.6 } },
          "Dórico ou maior com 7ª, tranquilo e suave" },
        { "Romântico", { 3, 0, 4 }, { 1, 3, 6, 7 }, { { Contour, 0.4, 0.8 }, { Dynamics, 0.2, 0.6 }, { Range, 0.4, 0.8 } },
          "Acordes com sétima e melodias que abraçam" },
        { "Melancólico", { 4, 1, 2 }, { 8, 12, 15 }, { { Contour, 0, 0.45 }, { Dynamics, 0.1, 0.5 }, { Range, 0.3, 0.7 } },
          "Menor com 7ª e menor melódica, saudoso" },
        { "Épico", { 1, 5, 0 }, { 8, 10, 12, 0 }, { { Contour, 0.5, 1 }, { Dynamics, 0.7, 1 }, { Range, 0.7, 1 } },
          "Saltos grandes e menor harmônica, crescendo" },
        { "Misterioso", { 8, 2, 5 }, { 9, 13, 14 }, { { Contour, 0.2, 0.6 }, { Dynamics, 0.2, 0.6 }, { Range, 0.2, 0.6 } },
          "Frígio e menor melódica, curioso e tenso" },
        { "Nostálgico", { 3, 7, 4 }, { 2, 6, 7 }, { { Contour, 0.3, 0.7 }, { Dynamics, 0.2, 0.6 }, { Range, 0.3, 0.7 } },
          "Maior com 7ª e mixolídio, lembrança boa" },
        { "Tenso", { 5, 8, 2 }, { 13, 9, 15 }, { { Contour, 0.3, 0.7 }, { Dynamics, 0.5, 0.9 }, { Range, 0.3, 0.7 } },
          "Menor harmônica e frígio, suspense" },
        { "Esperançoso", { 9, 0, 3 }, { 6, 3, 1 }, { { Contour, 0.55, 1 }, { Dynamics, 0.4, 0.8 }, { Range, 0.4, 0.9 } },
          "Lídio e maior, melodias que sobem" },
        { "Festa", { 7, 0, 10 }, { 0, 1, 6 }, { { Contour, 0.4, 0.9 }, { Dynamics, 0.7, 1 }, { Range, 0.4, 0.8 } },
          "Mixolídio e maior, para dançar" },
        { "Sensual", { 6, 4, 2 }, { 14, 15, 9 }, { { Contour, 0.3, 0.6 }, { Dynamics, 0.2, 0.6 }, { Range, 0.2, 0.6 } },
          "Dórico e menor com 7ª, groove lento" },
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
