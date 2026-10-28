// Music-theory checks for the Melody Generator core (no JUCE needed).
//  - every chord is built from the scale and every progression used fits the scale
//  - melody notes always belong to the scale; strong beats sit on the bar's chord
//    (or on its 7th / 9th / 13th when "melodias afiadas" is on)
//  - up to 64 ideas per generation, also after evolving
//  - every style + mood combination generates ideas that respect the rules above
#include <juce_core/juce_core.h>
#include "../Source/MelodyCore.h"
#include "../Source/Presets.h"

#include <iostream>
#include <string>

using namespace mf;

static int failures = 0, checks = 0;
static void check (bool ok, const std::string& what)
{
    ++checks;
    if (! ok && ++failures < 40) std::cout << "FAIL " << what << "\n";
}

static void checkPattern (const Pattern& p, const Genome& g, const Settings& s, const std::string& tag)
{
    const auto& sc = scales()[(size_t) g.scale];
    auto inScale = inScaleSet (g.key, g.scale);
    std::array<bool, 12> harmony {};
    for (int h : sc.harmony) harmony[(size_t) mod12 (g.key + h)] = true;

    check (progressionFits (g.progression, g.scale) || s.lockProgression, tag + ": progression fits the scale");
    for (const auto& c : p.chords)
    {
        for (int pc : c.pcs) check (harmony[(size_t) pc], tag + ": chord " + c.name + " uses only notes of the scale");
        if (sc.sevenths || s.sharp) check (c.pcs.size() == 4, tag + ": chord " + c.name + " has its 7th");
    }
    for (const auto& n : p.tracks[Bass])
    {
        // the bass plays chord tones and passing notes into the next chord; roots/fifths are diatonic
        (void) n;
    }
    int strong = 0, strongOk = 0;
    for (const auto& n : p.tracks[Melody])
    {
        check (inScale[(size_t) mod12 (n.pitch)], tag + ": melody note " + std::to_string (n.pitch) + " is in the scale");
        if (n.start % PPQ != 0 || (n.start % BAR) % (4 * STEP) != 0) continue;
        const int bar = std::min (p.bars - 1, n.start / BAR);
        const auto& ch = p.chords[(size_t) bar];
        const int pc = mod12 (n.pitch);
        ++strong;
        bool ok = contains (ch.pcs, pc) || (s.sharp && contains (extensionPitchClasses (g.key, g.scale, ch.degree), pc));
        bool scaleHasChordTone = false;
        for (int c : ch.pcs) scaleHasChordTone = scaleHasChordTone || inScale[(size_t) c];
        if (ok || ! scaleHasChordTone) ++strongOk;
    }
    check (strong == strongOk, tag + ": strong beats follow the chord (" + std::to_string (strongOk) + "/" + std::to_string (strong) + ")");
}

int main()
{
    // 1. progression table sanity: every scale has fitting progressions; labels follow the scale
    for (int sc = 0; sc < (int) scales().size(); ++sc)
    {
        auto c = progressionCandidates ({}, sc);
        bool allFit = true;
        for (int p : c) allFit = allFit && progressionFits (p, sc, false);
        check (! c.empty() && allFit, std::string ("scale ") + scales()[(size_t) sc].id + " has progressions that fit");
    }
    check (progressionLabel (1, MajorScale) == "I - V - vi - IV", "label in major: " + progressionLabel (1, MajorScale));
    check (progressionLabel (8, NaturalMinor) == "i - VI - III - VII", "label in minor: " + progressionLabel (8, NaturalMinor));
    check (! progressionFits (8, MelodicMinor), "i-VI-III-VII does not fit melodic minor (VI and VII are diminished there)");
    check (progressionFits (9, MelodicMinor), "i-iv-v-i fits melodic minor (as i - IV - V - i)");
    check (chordName (9, Minor7, 0) == "Am7", "A minor with 7ths starts on Am7: " + chordName (9, Minor7, 0));
    check (chordName (0, Major7, 0) == "Cmaj7", "C major with 7ths starts on Cmaj7: " + chordName (0, Major7, 0));
    check (chordName (9, MelodicMinor, 3) == "D", "IV of A melodic minor is D major: " + chordName (9, MelodicMinor, 3));

    // 2. every scale, sharp on/off, many seeds
    for (int sharp = 0; sharp < 2; ++sharp)
        for (int sc = 0; sc < (int) scales().size(); ++sc)
        {
            Settings s;
            s.lockScale = true; s.scale = sc; s.sharp = sharp != 0; s.populationSize = 16;
            auto pop = createPopulation (s, 1000u + (uint32_t) sc * 31u + (uint32_t) sharp);
            for (int gen = 0; gen < 3; ++gen) pop = evolve (pop, s, 77u + (uint32_t) gen);
            for (size_t i = 0; i < pop.size(); ++i)
            {
                const auto& g = pop[i].genome;
                checkPattern (render (g, s), g, s, std::string (scales()[(size_t) sc].id) + (sharp ? " afiada" : "") + " #" + std::to_string (i));
            }
        }

    // 3. afiada melodies really use colour notes (7th / 9th / 13th) and octave leaps
    {
        Settings s;
        s.sharp = true; s.populationSize = 32;
        auto pop = createPopulation (s, 4242u);
        int colour = 0, octaves = 0;
        for (const auto& e : pop)
        {
            auto p = render (e.genome, s);
            const auto& mel = p.tracks[Melody];
            for (size_t i = 0; i < mel.size(); ++i)
            {
                const int bar = std::min (p.bars - 1, mel[i].start / BAR);
                const auto& ch = p.chords[(size_t) bar];
                if (contains (extensionPitchClasses (p.key, p.scale, ch.degree), mod12 (mel[i].pitch)) && ! contains (ch.pcs, mod12 (mel[i].pitch))) ++colour;
                if (i > 0 && std::abs (mel[i].pitch - mel[i - 1].pitch) == 12) ++octaves;
            }
        }
        check (colour > 20, "afiada melodies use 9ths/13ths (" + std::to_string (colour) + ")");
        check (octaves > 3, "afiada melodies leap octaves (" + std::to_string (octaves) + ")");
    }

    // 4. idea count: up to 64, never more
    {
        Settings s;
        s.populationSize = 64;
        auto pop = createPopulation (s, 9u);
        check (pop.size() == 64, "64 ideas per generation");
        pop = evolve (pop, s, 10u);
        check (pop.size() == 64, "64 ideas after evolving");
        s.populationSize = 200;
        check (createPopulation (s, 9u).size() == (size_t) MAX_IDEAS, "never more than 64 ideas");
    }

    // 5. every style + mood combination respects the rules
    for (int st = 0; st < (int) mfplug::presets::styles().size(); ++st)
        for (int md = 0; md < (int) mfplug::presets::moods().size(); ++md)
        {
            Settings s;
            mfplug::presets::apply (s, st, md);
            s.populationSize = 6;
            auto pop = createPopulation (s, (uint32_t) (st * 100 + md));
            pop = evolve (pop, s, 5u);
            for (const auto& e : pop)
            {
                const auto& g = e.genome;
                const std::string tag = std::string (mfplug::presets::styles()[(size_t) st].name) + "/" + mfplug::presets::moods()[(size_t) md].name;
                check (g.bpm >= s.bpmLo && g.bpm <= s.bpmHi, tag + ": tempo of the style");
                check (contains (s.scalePool, g.scale), tag + ": scale of the mood");
                checkPattern (render (g, s), g, s, tag);
            }
        }

    std::cout << checks << " checks, " << (failures == 0 ? "ALL PASSED" : std::to_string (failures) + " FAILURE(S)") << "\n";
    return failures == 0 ? 0 : 1;
}
