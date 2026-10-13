// MelodyForge core — C++ port of core/melodyforge-core.js (ISLAND27 edition).
//
// Header-only, dependency-free C++17. It must stay bit-for-bit identical to the
// JavaScript core: tests/golden_test.cpp replays tests/golden/golden.txt.
// Rules for keeping parity: same RNG call order (beware of short-circuits),
// evaluate rng calls into variables before combining them, and only use
// +, -, *, /, floor and abs on doubles.
#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <string>
#include <vector>

namespace mf
{

constexpr int PPQ = 480;
constexpr int STEP = 120;
constexpr int STEPS_PER_BAR = 16;
constexpr int BAR = STEP * STEPS_PER_BAR;
constexpr int NUM_TRACKS = 3;   // melody, bass, chords
constexpr int NUM_GENES = 10;

enum Track { Melody = 0, Bass = 1, Chords = 2 };
inline const char* trackName (int t) { static const char* n[] = { "Melody", "Bass", "Chords" }; return n[t]; }
inline const char* trackId (int t) { static const char* n[] = { "melody", "bass", "chords" }; return n[t]; }

inline const char* noteNameOf (int pc) { static const char* n[] = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" }; return n[pc]; }

struct ScaleDef { const char* id; const char* name; std::vector<int> steps; std::array<int, 7> harmony; bool minor; int parentMajor; };
inline const std::vector<ScaleDef>& scales()
{
    static const std::vector<ScaleDef> s = {
        { "major",            "Major",            { 0, 2, 4, 5, 7, 9, 11 }, { 0, 2, 4, 5, 7, 9, 11 }, false, 0 },
        { "minor",            "Minor",            { 0, 2, 3, 5, 7, 8, 10 }, { 0, 2, 3, 5, 7, 8, 10 }, true, 3 },
        { "dorian",           "Dorian",           { 0, 2, 3, 5, 7, 9, 10 }, { 0, 2, 3, 5, 7, 9, 10 }, true, 10 },
        { "mixolydian",       "Mixolydian",       { 0, 2, 4, 5, 7, 9, 10 }, { 0, 2, 4, 5, 7, 9, 10 }, false, 5 },
        { "harmonic_minor",   "Harmonic minor",   { 0, 2, 3, 5, 7, 8, 11 }, { 0, 2, 3, 5, 7, 8, 11 }, true, 3 },
        { "pentatonic_major", "Pentatonic major", { 0, 2, 4, 7, 9 },        { 0, 2, 4, 5, 7, 9, 11 }, false, 0 },
        { "pentatonic_minor", "Pentatonic minor", { 0, 3, 5, 7, 10 },       { 0, 2, 3, 5, 7, 8, 10 }, true, 3 },
        { "blues",            "Blues",            { 0, 3, 5, 6, 7, 10 },    { 0, 2, 3, 5, 7, 8, 10 }, true, 3 },
    };
    return s;
}

struct ProgressionDef { const char* name; std::vector<int> degrees; };
inline const std::vector<ProgressionDef>& progressions()
{
    static const std::vector<ProgressionDef> p = {
        { "I - IV - V - I", { 0, 3, 4, 0 } },  { "I - V - vi - IV", { 0, 4, 5, 3 } },
        { "vi - IV - I - V", { 5, 3, 0, 4 } }, { "I - vi - IV - V", { 0, 5, 3, 4 } },
        { "ii - V - I - I", { 1, 4, 0, 0 } },  { "i - VI - III - VII", { 0, 5, 2, 6 } },
        { "i - iv - v - i", { 0, 3, 4, 0 } },  { "I - iii - IV - V", { 0, 2, 3, 4 } },
    };
    return p;
}

enum ChordRhythm { Sustain = 0, Half = 1, Stabs = 2 };
enum Focus { Balanced = 0, HarmonyFocus = 1, RhythmFocus = 2, Catchy = 3 };
inline const char* geneName (int i)
{
    static const char* n[] = { "density", "syncopation", "stepwise", "range", "contour", "repetition",
                               "chordComplexity", "bassMovement", "swing", "dynamics" };
    return n[i];
}
enum Gene { Density, Syncopation, Stepwise, Range, Contour, Repetition, ChordComplexity, BassMovement, Swing, Dynamics };

inline int mod12 (int x) { return ((x % 12) + 12) % 12; }
template <typename T> inline T clampv (T x, T lo, T hi) { return x < lo ? lo : (x > hi ? hi : x); }

// ---------------------------------------------------------------- RNG (mulberry32)
struct Rng
{
    uint32_t state;
    explicit Rng (uint32_t seed) : state (seed) {}
    uint32_t next()
    {
        state += 0x6D2B79F5u;
        uint32_t t = state;
        t = (t ^ (t >> 15)) * (t | 1u);
        t ^= t + (t ^ (t >> 7)) * (t | 61u);
        return t ^ (t >> 14);
    }
    double real() { return (double) next() / 4294967296.0; }
    int integer (int n) { return (int) std::floor ((double) next() / 4294967296.0 * (double) n); }
};

// ---------------------------------------------------------------- data
struct Targets { double density = 4, stepwise = 0.7, span = 12, syncopation = 0.2, repetition = 0.6; };
struct GeneRange { bool set = false; double lo = 0, hi = 1; };

struct Settings
{
    int bars = 4, populationSize = 12;
    double eliteRatio = 0.25, mutationRate = 0.15;
    int maxNotesPerBar = 8, melodyLow = 60, melodyHigh = 84;
    int chordRhythm = Sustain, focus = Balanced;
    int key = 0, scale = 0, progression = 0, bpm = 120;
    int bpmLo = 70, bpmHi = 150;
    bool lockKey = false, lockScale = false, lockProgression = false, lockBpm = false;
    Targets targets;
    std::array<GeneRange, NUM_GENES> geneRanges {};
};

inline Settings normalize (Settings s)
{
    s.bars = clampv (s.bars, 1, 8);
    s.populationSize = clampv (s.populationSize, 4, 32);
    s.maxNotesPerBar = clampv (s.maxNotesPerBar, 2, 16);
    s.melodyLow = clampv (s.melodyLow, 36, 96);
    s.melodyHigh = clampv (s.melodyHigh, s.melodyLow + 7, 108);
    s.mutationRate = clampv (s.mutationRate, 0.0, 1.0);
    s.eliteRatio = clampv (s.eliteRatio, 0.0, 0.9);
    s.key = mod12 (s.key);
    s.scale = clampv (s.scale, 0, (int) scales().size() - 1);
    s.progression = clampv (s.progression, 0, (int) progressions().size() - 1);
    s.bpm = clampv (s.bpm, 60, 180);
    s.bpmLo = clampv (s.bpmLo, 60, 180);
    s.bpmHi = clampv (s.bpmHi, s.bpmLo, 180);
    s.chordRhythm = clampv (s.chordRhythm, 0, 2);
    s.focus = clampv (s.focus, 0, 3);
    return s;
}

struct Genome
{
    int key = 0, scale = 0, progression = 0, bpm = 120;
    uint32_t seedMelody = 0, seedBass = 0, seedChords = 0;
    std::array<double, NUM_GENES> genes {};
    std::vector<int> chordOverrides;
    double userScore = 0;
};

struct Note { int pitch = 60, start = 0, length = STEP, velocity = 90; };
inline bool operator== (const Note& a, const Note& b)
{
    return a.pitch == b.pitch && a.start == b.start && a.length == b.length && a.velocity == b.velocity;
}

struct Chord { int degree = 0, root = 0; std::vector<int> pcs, pitches; std::string name; };

struct Pattern
{
    int bpm = 120, bars = 4, ppq = PPQ, key = 0, scale = 0;
    std::vector<Chord> chords;
    std::array<std::vector<Note>, NUM_TRACKS> tracks;
    bool edited = false;
};

struct Fitness { double total = 0, melodic = 0, harmonic = 0, rhythmic = 0; };
struct Entry { Genome genome; double fitness = 0; Fitness breakdown; };

// ---------------------------------------------------------------- genome
inline double geneFromRange (Rng& rng, const Settings& s, int gene)
{
    const auto& r = s.geneRanges[(size_t) gene];
    double lo = r.set ? r.lo : 0.0, hi = r.set ? r.hi : 1.0;
    return lo + rng.real() * (hi - lo);
}

inline Genome randomGenome (Rng& rng, const Settings& settings)
{
    Settings s = normalize (settings);
    Genome g;
    g.key = s.lockKey ? s.key : rng.integer (12);
    g.scale = s.lockScale ? s.scale : rng.integer ((int) scales().size());
    g.progression = s.lockProgression ? s.progression : rng.integer ((int) progressions().size());
    g.bpm = s.lockBpm ? s.bpm : s.bpmLo + rng.integer (s.bpmHi - s.bpmLo + 1);
    g.seedMelody = rng.next();
    g.seedBass = rng.next();
    g.seedChords = rng.next();
    for (int i = 0; i < NUM_GENES; ++i)
        g.genes[(size_t) i] = geneFromRange (rng, s, i);
    return g;
}

inline Genome applyLocks (Genome g, const Settings& settings)
{
    Settings s = normalize (settings);
    if (s.lockKey) g.key = s.key;
    if (s.lockScale) g.scale = s.scale;
    if (s.lockProgression) g.progression = s.progression;
    if (s.lockBpm) g.bpm = s.bpm;
    return g;
}

// ---------------------------------------------------------------- theory
inline int chordDegreeForBar (const Genome& g, int bar)
{
    if (bar < (int) g.chordOverrides.size() && g.chordOverrides[(size_t) bar] >= 0)
        return g.chordOverrides[(size_t) bar] % 7;
    const auto& p = progressions()[(size_t) g.progression].degrees;
    return p[(size_t) (bar % (int) p.size())];
}

inline std::string chordQualityName (const std::vector<int>& pcs)
{
    int root = pcs[0];
    int third = mod12 (pcs[1] - root), fifth = mod12 (pcs[2] - root);
    std::string q = third == 4 ? (fifth == 8 ? "aug" : "") : (fifth == 6 ? "dim" : "m");
    if (pcs.size() > 3)
    {
        int sev = mod12 (pcs[3] - root);
        if (q.empty() && sev == 11) return "maj7";
        if (q.empty() && sev == 10) return "7";
        if (q == "m" && sev == 10) return "m7";
        if (q == "dim" && sev == 10) return "m7b5";
        if (q == "dim" && sev == 9) return "dim7";
        if (q == "m" && sev == 11) return "m(maj7)";
        return q + "7";
    }
    return q;
}

inline std::vector<int> chordPitchClasses (int key, int scaleIdx, int degree, bool seventh)
{
    const auto& h = scales()[(size_t) scaleIdx].harmony;
    std::vector<int> pcs { mod12 (key + h[(size_t) (degree % 7)]), mod12 (key + h[(size_t) ((degree + 2) % 7)]),
                           mod12 (key + h[(size_t) ((degree + 4) % 7)]) };
    if (seventh) pcs.push_back (mod12 (key + h[(size_t) ((degree + 6) % 7)]));
    return pcs;
}

inline std::string chordName (int key, int scaleIdx, int degree)
{
    auto pcs = chordPitchClasses (key, scaleIdx, degree, false);
    return std::string (noteNameOf (pcs[0])) + chordQualityName (pcs);
}

inline std::vector<int> voiceChord (const std::vector<int>& pcs, const std::vector<int>* prev)
{
    std::vector<int> best;
    int bestCost = 0;
    for (size_t rot = 0; rot < pcs.size(); ++rot)
    {
        std::vector<int> notes;
        int base = 50 + mod12 (pcs[rot] - 50);
        notes.push_back (base);
        for (size_t j = 1; j < pcs.size(); ++j)
        {
            int pc = pcs[(rot + j) % pcs.size()];
            notes.push_back (notes[j - 1] + 1 + mod12 (pc - (notes[j - 1] + 1)));
        }
        int cost = 0;
        if (prev != nullptr)
        {
            for (int a : notes)
            {
                int nearest = 1000;
                for (int b : *prev) nearest = std::min (nearest, std::abs (a - b));
                cost += nearest;
            }
        }
        else
        {
            cost = std::abs (notes[0] - 55);
        }
        if (best.empty() || cost < bestCost) { best = notes; bestCost = cost; }
    }
    return best;
}

inline std::array<bool, 12> inScaleSet (int key, int scaleIdx)
{
    std::array<bool, 12> set {};
    for (int st : scales()[(size_t) scaleIdx].steps) set[(size_t) mod12 (key + st)] = true;
    return set;
}

inline bool contains (const std::vector<int>& v, int x) { return std::find (v.begin(), v.end(), x) != v.end(); }

// ---------------------------------------------------------------- render
struct ChordRender { std::vector<Chord> chords; std::vector<Note> notes; };

inline ChordRender renderChords (const Genome& g, const Settings& s, Rng& rng)
{
    ChordRender out;
    std::vector<int> prev;
    bool hasPrev = false;
    for (int bar = 0; bar < s.bars; ++bar)
    {
        int degree = chordDegreeForBar (g, bar);
        bool seventh = false;
        if (g.genes[ChordComplexity] > 0.3)
        {
            double r = rng.real();
            seventh = r < g.genes[ChordComplexity] * 0.8;
        }
        auto pcs = chordPitchClasses (g.key, g.scale, degree, seventh);
        auto voicing = voiceChord (pcs, hasPrev ? &prev : nullptr);
        prev = voicing;
        hasPrev = true;
        Chord c;
        c.degree = degree; c.root = pcs[0]; c.pcs = pcs; c.pitches = voicing;
        c.name = std::string (noteNameOf (pcs[0])) + chordQualityName (pcs);
        out.chords.push_back (c);

        int vel = 64 + (int) std::floor (g.genes[Dynamics] * 20.0);
        std::vector<std::pair<int, int>> hits;
        if (s.chordRhythm == Half) hits = { { 0, 960 }, { 960, 960 } };
        else if (s.chordRhythm == Stabs) hits = { { 0, 360 }, { 720, 240 }, { 1200, 360 }, { 1680, 240 } };
        else hits = { { 0, BAR } };
        for (size_t h = 0; h < hits.size(); ++h)
            for (int p : voicing)
                out.notes.push_back ({ p, bar * BAR + hits[h].first, hits[h].second, clampv (vel - (int) (h % 2) * 8, 1, 127) });
    }
    return out;
}

inline int bassPitch (int pc) { return 36 + mod12 (pc); }

inline std::vector<Note> renderBass (const Genome& g, const Settings& s, const std::vector<Chord>& chords, Rng& rng)
{
    std::vector<Note> notes;
    double m = g.genes[BassMovement];
    int vel = 88 + (int) std::floor (g.genes[Dynamics] * 16.0);
    for (int bar = 0; bar < s.bars; ++bar)
    {
        const auto& ch = chords[(size_t) bar];
        int root = bassPitch (ch.root);
        int fifth = ch.pcs.size() > 2 ? bassPitch (ch.pcs[2]) : root;
        if (fifth < root) fifth += 12;
        if (fifth > 50) fifth -= 12;
        int t0 = bar * BAR;
        if (m < 0.33)
        {
            notes.push_back ({ root, t0, BAR - 60, vel });
        }
        else if (m < 0.66)
        {
            notes.push_back ({ root, t0, 900, vel });
            double r = rng.real();
            notes.push_back ({ r < 0.5 ? fifth : root, t0 + 960, 900, vel - 8 });
        }
        else
        {
            int nextRoot = bassPitch (chords[(size_t) ((bar + 1) % s.bars)].root);
            double r1 = rng.real();
            int approach = nextRoot + (r1 < 0.5 ? -1 : 2);
            double r2 = rng.real();
            int line[4] = { root, r2 < 0.4 ? root + 12 : root, fifth, approach };
            for (int q = 0; q < 4; ++q)
                notes.push_back ({ clampv (line[q], 28, 55), t0 + q * PPQ, 400, vel - (q % 2) * 10 });
        }
    }
    return notes;
}

inline std::vector<int> rhythmForBar (const Genome& g, const Settings& s, Rng& rng)
{
    std::vector<double> weights;
    std::vector<int> onsets;
    double base = 0.15 + g.genes[Density] * 0.6;
    for (int st = 0; st < STEPS_PER_BAR; ++st)
    {
        double w = st % 4 == 0 ? 1.6 : (st % 2 == 0 ? 1.0 : 0.3 + g.genes[Syncopation] * 0.9);
        weights.push_back (w);
        double r = rng.real();
        if (r < base * w) onsets.push_back (st);
    }
    if (onsets.empty() || onsets[0] != 0)
    {
        double r = rng.real();
        if (r < 0.8 || onsets.empty()) onsets.insert (onsets.begin(), 0);
    }
    while ((int) onsets.size() > s.maxNotesPerBar)
    {
        size_t weakest = 1;
        double wi = weights[(size_t) onsets[1]];
        for (size_t i = 2; i < onsets.size(); ++i)
            if (weights[(size_t) onsets[i]] <= wi) { wi = weights[(size_t) onsets[i]]; weakest = i; }
        onsets.erase (onsets.begin() + (long) weakest);
    }
    if (onsets.size() < 2)
    {
        onsets.push_back (onsets[0] == 8 ? 0 : 8);
        std::stable_sort (onsets.begin(), onsets.end());
    }
    return onsets;
}

inline std::vector<int> melodyPool (const Genome& g, const Settings& s)
{
    int span = 7 + (int) std::floor (g.genes[Range] * 12.0);
    int center = (s.melodyLow + s.melodyHigh) / 2;
    int lo = std::max (s.melodyLow, center - span / 2);
    int hi = std::min (s.melodyHigh, lo + span);
    auto scale = inScaleSet (g.key, g.scale);
    std::vector<int> pool;
    for (int p = lo; p <= hi; ++p) if (scale[(size_t) mod12 (p)]) pool.push_back (p);
    if (pool.size() < 5)
    {
        pool.clear();
        for (int q = s.melodyLow; q <= s.melodyHigh; ++q) if (scale[(size_t) mod12 (q)]) pool.push_back (q);
    }
    return pool;
}

inline int nearestChordToneIndex (const std::vector<int>& pool, int idx, const std::vector<int>& pcs)
{
    for (int d = 0; d <= 3; ++d)
    {
        int cands[2] = { idx - d, idx + d };
        int count = d == 0 ? 1 : 2;
        if (d == 0) cands[0] = idx;
        for (int c = 0; c < count; ++c)
        {
            int i = cands[c];
            if (i >= 0 && i < (int) pool.size() && contains (pcs, mod12 (pool[(size_t) i]))) return i;
        }
    }
    return idx;
}

inline std::vector<Note> renderMelody (const Genome& g, const Settings& s, const std::vector<Chord>& chords, Rng& rng)
{
    auto pool = melodyPool (g, s);
    std::vector<std::vector<int>> rhythms, pitchesByBar;
    std::vector<Note> notes;
    int poolLast = (int) pool.size() - 1;
    int idx = nearestChordToneIndex (pool, (int) pool.size() / 2, chords[0].pcs);
    int totalSteps = s.bars * STEPS_PER_BAR;
    for (int bar = 0; bar < s.bars; ++bar)
    {
        bool reuse = false;
        if (bar >= 2) { double r = rng.real(); reuse = r < g.genes[Repetition]; }
        std::vector<int> onsets = reuse ? rhythms[(size_t) bar - 2] : rhythmForBar (g, s, rng);
        rhythms.push_back (onsets);
        bool copyPitches = false;
        if (reuse) { double r = rng.real(); copyPitches = r < g.genes[Repetition] * 0.5; }
        std::vector<int> barPitches;
        for (size_t n = 0; n < onsets.size(); ++n)
        {
            int stepAbs = bar * STEPS_PER_BAR + onsets[n];
            if (copyPitches && n < pitchesByBar[(size_t) bar - 2].size())
            {
                idx = pitchesByBar[(size_t) bar - 2][n];
            }
            else if (! (bar == 0 && n == 0))
            {
                double phase = (double) stepAbs / (double) totalSteps;
                double upBias = 0.5 + (g.genes[Contour] - 0.5) * (phase < 0.5 ? 0.8 : -0.8);
                double r1 = rng.real();
                int dir = r1 < upBias ? 1 : -1;
                double r2 = rng.real();
                int move = 1;
                if (! (r2 < 0.1 + g.genes[Stepwise] * 0.85)) move = 2 + rng.integer (3);
                idx += dir * move;
                if (idx < 0) idx = -idx;
                if (idx > poolLast) idx = 2 * poolLast - idx;
                idx = clampv (idx, 0, poolLast);
                if (onsets[n] % 4 == 0)
                {
                    double r3 = rng.real();
                    if (r3 < 0.85) idx = nearestChordToneIndex (pool, idx, chords[(size_t) bar].pcs);
                }
            }
            barPitches.push_back (idx);
        }
        pitchesByBar.push_back (barPitches);
    }
    auto tonicPcs = chordPitchClasses (g.key, g.scale, 0, false);
    int lastBar = s.bars - 1;
    auto& lp = pitchesByBar[(size_t) lastBar];
    lp.back() = nearestChordToneIndex (pool, lp.back(), tonicPcs);

    for (int b = 0; b < s.bars; ++b)
    {
        const auto& ons = rhythms[(size_t) b];
        for (size_t k = 0; k < ons.size(); ++k)
        {
            int startStep = b * STEPS_PER_BAR + ons[k];
            int endStep = k + 1 < ons.size() ? b * STEPS_PER_BAR + ons[k + 1]
                                             : (b + 1 < s.bars ? (b + 1) * STEPS_PER_BAR + rhythms[(size_t) b + 1][0] : totalSteps);
            int gapSteps = std::min (endStep - startStep, 8);
            bool isLast = b == lastBar && k == ons.size() - 1;
            int start = startStep * STEP;
            int length = isLast ? (totalSteps - startStep) * STEP
                                : std::max (60, (int) std::floor ((double) (gapSteps * STEP) * 0.9));
            if (ons[k] % 4 == 2)
            {
                int delay = (int) std::floor (g.genes[Swing] * 80.0);
                start += delay;
                length = std::max (30, length - delay);
            }
            int accent = ons[k] % 4 == 0 ? (ons[k] % 8 == 0 ? 100 : 90) : 76;
            double r = rng.real();
            int vel = accent + (int) std::floor ((r - 0.5) * g.genes[Dynamics] * 24.0);
            notes.push_back ({ pool[(size_t) pitchesByBar[(size_t) b][k]], start, length, clampv (vel, 1, 127) });
        }
    }
    return notes;
}

inline Pattern render (const Genome& g, const Settings& settings)
{
    Settings s = normalize (settings);
    Rng chordRng (g.seedChords), bassRng (g.seedBass), melodyRng (g.seedMelody);
    auto ch = renderChords (g, s, chordRng);
    auto bass = renderBass (g, s, ch.chords, bassRng);
    auto melody = renderMelody (g, s, ch.chords, melodyRng);
    Pattern p;
    p.bpm = g.bpm; p.bars = s.bars; p.key = g.key; p.scale = g.scale;
    p.chords = ch.chords;
    p.tracks[Melody] = melody;
    p.tracks[Bass] = bass;
    p.tracks[Chords] = ch.notes;
    return p;
}

// ---------------------------------------------------------------- fitness
inline double closeness (double value, double target, double tolerance)
{
    return 1.0 - std::min (1.0, std::fabs (value - target) / tolerance);
}

inline Fitness evaluate (const Pattern& pattern, const Genome* genome, const Settings& settings)
{
    Settings s = normalize (settings);
    const Targets& t = s.targets;
    std::vector<Note> mel = pattern.tracks[Melody];
    std::stable_sort (mel.begin(), mel.end(), [] (const Note& a, const Note& b) { return a.start < b.start; });
    const auto& chords = pattern.chords;
    auto inScale = inScaleSet (pattern.key, pattern.scale);

    int steps = 0, leaps = 0, intervals = 0, lo = 1000, hi = -1000;
    for (size_t i = 0; i < mel.size(); ++i)
    {
        lo = std::min (lo, mel[i].pitch);
        hi = std::max (hi, mel[i].pitch);
        if (i > 0)
        {
            int d = std::abs (mel[i].pitch - mel[i - 1].pitch);
            ++intervals;
            if (d <= 2) ++steps;
            if (d > 7) ++leaps;
        }
    }
    double stepRatio = intervals ? (double) steps / intervals : 0.0;
    double leapRatio = intervals ? (double) leaps / intervals : 0.0;
    int span = mel.empty() ? 0 : hi - lo;
    int lastPc = mel.empty() ? -1 : mod12 (mel.back().pitch);
    auto tonic = chordPitchClasses (pattern.key, pattern.scale, 0, false);
    double resolution = contains (tonic, lastPc) ? 1.0 : 0.4;

    std::vector<std::vector<int>> onsetsByBar ((size_t) pattern.bars);
    for (const auto& n : mel)
    {
        int bb = n.start / BAR;
        if (bb < pattern.bars) onsetsByBar[(size_t) bb].push_back ((n.start % BAR) / STEP);
    }
    double simSum = 0;
    int simCount = 0;
    for (int x = 0; x + 2 < pattern.bars; ++x)
    {
        const auto& A = onsetsByBar[(size_t) x];
        const auto& B = onsetsByBar[(size_t) x + 2];
        int inter = 0;
        for (int a : A) if (contains (B, a)) ++inter;
        int uni = (int) A.size() + (int) B.size() - inter;
        simSum += uni ? (double) inter / uni : 1.0;
        ++simCount;
    }
    double repetition = simCount ? simSum / simCount : t.repetition;

    double melodic = closeness (stepRatio, t.stepwise, 0.5) * 0.3 + (1.0 - std::min (1.0, leapRatio * 3.0)) * 0.2
                   + closeness ((double) span, t.span, 12.0) * 0.2 + resolution * 0.15 + closeness (repetition, t.repetition, 0.6) * 0.15;

    int strong = 0, strongChord = 0, inKey = 0;
    for (const auto& n : mel)
    {
        if (inScale[(size_t) mod12 (n.pitch)]) ++inKey;
        if (n.start % PPQ == 0)
        {
            int cb = std::min (pattern.bars - 1, n.start / BAR);
            ++strong;
            if (contains (chords[(size_t) cb].pcs, mod12 (n.pitch))) ++strongChord;
        }
    }
    double chordToneRatio = strong ? (double) strongChord / strong : 0.0;
    double inKeyRatio = mel.empty() ? 0.0 : (double) inKey / (double) mel.size();
    int move = 0, moves = 0;
    for (size_t c = 1; c < chords.size(); ++c)
    {
        const auto& pa = chords[c - 1].pitches;
        const auto& pb = chords[c].pitches;
        for (size_t v = 0; v < std::min (pa.size(), pb.size()); ++v) { move += std::abs (pb[v] - pa[v]); ++moves; }
    }
    double voiceLeading = moves ? 1.0 - std::min (1.0, ((double) move / moves) / 6.0) : 1.0;
    int lastDegree = chords.back().degree;
    double cadence = (lastDegree == 0 || lastDegree == 4) ? 1.0 : 0.6;
    double harmonic = chordToneRatio * 0.4 + inKeyRatio * 0.25 + voiceLeading * 0.2 + cadence * 0.15;

    double perBar = (double) mel.size() / pattern.bars;
    int offGrid = 0, emptyBars = 0;
    std::vector<int> durations;
    for (const auto& n : mel)
    {
        int stp = (n.start % BAR) / STEP;
        if (stp % 2 == 1) ++offGrid;
        int dq = n.length / STEP;
        if (! contains (durations, dq)) durations.push_back (dq);
    }
    for (int e = 0; e < pattern.bars; ++e) if (onsetsByBar[(size_t) e].empty()) ++emptyBars;
    double syncRatio = mel.empty() ? 0.0 : (double) offGrid / (double) mel.size();
    double rhythmic = closeness (perBar, t.density, t.density) * 0.4 + closeness (syncRatio, t.syncopation, 0.5) * 0.25
                    + std::min (1.0, (double) durations.size() / 3.0) * 0.2 + (1.0 - (double) emptyBars / pattern.bars) * 0.15;

    static const double W[4][3] = { { 1, 1, 1 }, { 0.3, 0.55, 0.15 }, { 0.2, 0.2, 0.6 }, { 0.55, 0.2, 0.25 } };
    const double* w = W[s.focus];
    double base = (melodic * w[0] + harmonic * w[1] + rhythmic * w[2]) / (w[0] + w[1] + w[2]);
    double user = genome != nullptr ? clampv (genome->userScore, -1.0, 1.0) : 0.0;
    Fitness f;
    f.total = base * 0.8 + (user + 1.0) * 0.1;
    f.melodic = melodic; f.harmonic = harmonic; f.rhythmic = rhythmic;
    return f;
}

// ---------------------------------------------------------------- evolution
inline Entry scoreGenome (const Genome& g, const Settings& s)
{
    Pattern p = render (g, s);
    Fitness f = evaluate (p, &g, s);
    return { g, f.total, f };
}

inline void sortPopulation (std::vector<Entry>& pop)
{
    std::stable_sort (pop.begin(), pop.end(), [] (const Entry& a, const Entry& b) { return a.fitness > b.fitness; });
}

inline std::vector<Entry> createPopulation (const Settings& settings, uint32_t seed)
{
    Settings s = normalize (settings);
    Rng rng (seed);
    std::vector<Entry> pop;
    for (int i = 0; i < s.populationSize; ++i)
    {
        Genome g = randomGenome (rng, s);
        pop.push_back (scoreGenome (g, s));
    }
    sortPopulation (pop);
    return pop;
}

inline const Genome& tournament (const std::vector<Entry>& pop, Rng& rng)
{
    const Entry* best = nullptr;
    for (int i = 0; i < 3; ++i)
    {
        const Entry& c = pop[(size_t) rng.integer ((int) pop.size())];
        if (best == nullptr || c.fitness > best->fitness) best = &c;
    }
    return best->genome;
}

inline Genome& mutate (Genome& g, const Settings& s, Rng& rng)
{
    double rate = s.mutationRate;
    for (int i = 0; i < NUM_GENES; ++i)
    {
        double r = rng.real();
        if (r < rate)
        {
            double a = rng.real();
            double b = rng.real();
            double c = rng.real();
            double delta = (a + b + c - 1.5) * 0.2;
            g.genes[(size_t) i] = clampv (g.genes[(size_t) i] + delta, 0.0, 1.0);
        }
    }
    if (! s.lockBpm)
    {
        double r = rng.real();
        if (r < rate) g.bpm = clampv (g.bpm + rng.integer (17) - 8, 60, 180);
    }
    if (! s.lockKey)
    {
        double r = rng.real();
        if (r < rate * 0.5) { double r2 = rng.real(); g.key = mod12 (g.key + (r2 < 0.5 ? 7 : 5)); }
    }
    if (! s.lockScale)
    {
        double r = rng.real();
        if (r < rate * 0.5) g.scale = rng.integer ((int) scales().size());
    }
    if (! s.lockProgression)
    {
        double r = rng.real();
        if (r < rate * 0.5) g.progression = rng.integer ((int) progressions().size());
    }
    { double r = rng.real(); if (r < rate) g.seedMelody = rng.next(); }
    { double r = rng.real(); if (r < rate * 0.5) g.seedBass = rng.next(); }
    { double r = rng.real(); if (r < rate * 0.5) g.seedChords = rng.next(); }
    return g;
}

inline Genome crossover (const Genome& a, const Genome& b, Rng& rng)
{
    Genome c = a;
    for (int i = 0; i < NUM_GENES; ++i) { double r = rng.real(); if (r < 0.5) c.genes[(size_t) i] = b.genes[(size_t) i]; }
    { double r = rng.real(); if (r < 0.5) c.key = b.key; }
    { double r = rng.real(); if (r < 0.5) c.scale = b.scale; }
    { double r = rng.real(); if (r < 0.5) c.progression = b.progression; }
    { double r = rng.real(); if (r < 0.5) c.bpm = b.bpm; }
    { double r = rng.real(); if (r < 0.5) c.seedMelody = b.seedMelody; }
    { double r = rng.real(); if (r < 0.5) c.seedBass = b.seedBass; }
    { double r = rng.real(); if (r < 0.5) c.seedChords = b.seedChords; }
    c.chordOverrides.clear();
    c.userScore = (a.userScore + b.userScore) * 0.25;
    return c;
}

inline std::vector<Entry> evolve (const std::vector<Entry>& population, const Settings& settings, uint32_t seed)
{
    Settings s = normalize (settings);
    Rng rng (seed);
    std::vector<Entry> pop;
    for (const auto& x : population) pop.push_back (scoreGenome (applyLocks (x.genome, s), s));
    sortPopulation (pop);
    int eliteCount = std::max (1, (int) std::floor ((double) s.populationSize * s.eliteRatio));
    std::vector<Entry> next;
    for (int i = 0; i < std::min (eliteCount, (int) pop.size()); ++i) next.push_back (pop[(size_t) i]);
    int immigrants = std::max (1, (int) std::floor ((double) s.populationSize * 0.1));
    for (int m = 0; m < immigrants && (int) next.size() < s.populationSize; ++m)
    {
        Genome g = randomGenome (rng, s);
        next.push_back (scoreGenome (g, s));
    }
    while ((int) next.size() < s.populationSize)
    {
        const Genome& pa = tournament (pop, rng);
        const Genome& pb = tournament (pop, rng);
        Genome child = crossover (pa, pb, rng);
        mutate (child, s, rng);
        next.push_back (scoreGenome (applyLocks (child, s), s));
    }
    sortPopulation (next);
    return next;
}

inline double diversity (const std::vector<Entry>& population)
{
    size_t n = population.size();
    double sum = 0;
    int pairs = 0;
    for (size_t i = 0; i < n; ++i)
        for (size_t j = i + 1; j < n; ++j)
        {
            const auto& a = population[i].genome;
            const auto& b = population[j].genome;
            double d = 0;
            for (int k = 0; k < NUM_GENES; ++k) d += std::fabs (a.genes[(size_t) k] - b.genes[(size_t) k]);
            d += a.key == b.key ? 0 : 1;
            d += a.scale == b.scale ? 0 : 1;
            d += a.progression == b.progression ? 0 : 1;
            d += std::fabs ((double) (a.bpm - b.bpm)) / 120.0;
            sum += d / (NUM_GENES + 4);
            ++pairs;
        }
    return pairs ? sum / pairs : 0.0;
}

// ---------------------------------------------------------------- editing
inline Genome rerollLayer (const Genome& genome, int track, uint32_t seed)
{
    Genome g = genome;
    Rng r (seed);
    uint32_t v = r.next();
    if (track == Melody) g.seedMelody = v;
    else if (track == Bass) g.seedBass = v;
    else g.seedChords = v;
    return g;
}

inline Genome setChordOverride (const Genome& genome, int bar, int degree)
{
    Genome g = genome;
    while ((int) g.chordOverrides.size() <= bar) g.chordOverrides.push_back (-1);
    g.chordOverrides[(size_t) bar] = degree;
    return g;
}

inline Pattern transposeTrack (Pattern p, int track, int semitones)
{
    for (auto& n : p.tracks[(size_t) track]) n.pitch = clampv (n.pitch + semitones, 0, 127);
    p.edited = true;
    return p;
}

// ---------------------------------------------------------------- MIDI
using Bytes = std::vector<uint8_t>;

inline void appendVlq (Bytes& out, uint32_t value)
{
    uint8_t buf[5];
    int n = 0;
    buf[n++] = (uint8_t) (value & 0x7F);
    value >>= 7;
    while (value > 0) { buf[n++] = (uint8_t) ((value & 0x7F) | 0x80); value >>= 7; }
    while (n > 0) out.push_back (buf[--n]);
}

inline void appendText (Bytes& out, const std::string& s)
{
    for (unsigned char c : s) out.push_back (c < 128 ? c : (uint8_t) '?');
}

inline void appendChunk (Bytes& out, const char* type, const Bytes& data)
{
    appendText (out, type);
    uint32_t len = (uint32_t) data.size();
    out.push_back ((uint8_t) (len >> 24)); out.push_back ((uint8_t) (len >> 16));
    out.push_back ((uint8_t) (len >> 8));  out.push_back ((uint8_t) len);
    out.insert (out.end(), data.begin(), data.end());
}

inline Bytes trackChunk (const std::string& name, int channel, const std::vector<Note>& notes)
{
    struct Ev { int t, order; uint8_t b0, b1, b2; };
    std::vector<Ev> events;
    for (const auto& n : notes)
    {
        events.push_back ({ n.start, 1, (uint8_t) (0x90 | channel), (uint8_t) n.pitch, (uint8_t) n.velocity });
        events.push_back ({ n.start + n.length, 0, (uint8_t) (0x80 | channel), (uint8_t) n.pitch, 0 });
    }
    std::stable_sort (events.begin(), events.end(), [] (const Ev& a, const Ev& b)
    {
        if (a.t != b.t) return a.t < b.t;
        if (a.order != b.order) return a.order < b.order;
        return a.b1 < b.b1;
    });
    Bytes data { 0, 0xFF, 0x03 };
    appendVlq (data, (uint32_t) name.size());
    appendText (data, name);
    int last = 0;
    for (const auto& e : events)
    {
        appendVlq (data, (uint32_t) (e.t - last));
        data.push_back (e.b0); data.push_back (e.b1); data.push_back (e.b2);
        last = e.t;
    }
    data.insert (data.end(), { 0, 0xFF, 0x2F, 0 });
    Bytes out;
    appendChunk (out, "MTrk", data);
    return out;
}

// Standard MIDI File, format 1: a tempo/meta track plus one track per selected layer.
inline Bytes toMidi (const Pattern& p, const std::vector<int>& layers = { Melody, Bass, Chords },
                     const std::string& title = "MelodyForge ISLAND27")
{
    uint32_t usPerQuarter = (uint32_t) (60000000 / p.bpm);
    const auto& sc = scales()[(size_t) p.scale];
    static const int SF[12] = { 0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5 };
    int sf = SF[mod12 (p.key + sc.parentMajor)];
    Bytes meta { 0, 0xFF, 0x03 };
    appendVlq (meta, (uint32_t) title.size());
    appendText (meta, title);
    meta.insert (meta.end(), { 0, 0xFF, 0x51, 0x03, (uint8_t) (usPerQuarter >> 16), (uint8_t) (usPerQuarter >> 8), (uint8_t) usPerQuarter });
    meta.insert (meta.end(), { 0, 0xFF, 0x58, 0x04, 4, 2, 24, 8 });
    meta.insert (meta.end(), { 0, 0xFF, 0x59, 0x02, (uint8_t) (sf & 255), (uint8_t) (sc.minor && sc.parentMajor == 3 ? 1 : 0) });
    meta.insert (meta.end(), { 0, 0xFF, 0x2F, 0 });
    Bytes out;
    uint16_t ntracks = (uint16_t) (layers.size() + 1);
    appendChunk (out, "MThd", { 0, 1, (uint8_t) (ntracks >> 8), (uint8_t) ntracks, (uint8_t) (PPQ >> 8), (uint8_t) PPQ });
    appendChunk (out, "MTrk", meta);
    for (int l : layers)
    {
        Bytes t = trackChunk (trackName (l), l, p.tracks[(size_t) l]);
        out.insert (out.end(), t.begin(), t.end());
    }
    return out;
}

} // namespace mf
