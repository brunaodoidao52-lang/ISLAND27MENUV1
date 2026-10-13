// Replays tests/golden/golden.txt (written by the JS core) against the C++ port.
// Every note, chord, fitness value, MIDI byte and evolved genome must match exactly.
// Usage: mf_golden_test <path-to-golden.txt>
#include "../Source/MelodyCore.h"

#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

using namespace mf;

static int failures = 0;
static int checks = 0;

static void check (bool ok, const std::string& what)
{
    ++checks;
    if (! ok) { ++failures; if (failures < 30) std::cout << "FAIL " << what << "\n"; }
}

static std::istringstream lineStream (std::ifstream& in, const std::string& expectTag)
{
    std::string line;
    std::getline (in, line);
    std::istringstream ss (line);
    std::string tag;
    ss >> tag;
    if (tag != expectTag) { std::cerr << "parse error: expected " << expectTag << " got " << tag << "\n"; std::exit (2); }
    return ss;
}

static Settings readSettings (std::ifstream& in)
{
    auto ss = lineStream (in, "SETTINGS");
    Settings s;
    int lk, ls, lp, lb;
    ss >> s.bars >> s.populationSize >> s.eliteRatio >> s.mutationRate >> s.maxNotesPerBar >> s.melodyLow >> s.melodyHigh
       >> s.chordRhythm >> s.focus >> s.key >> s.scale >> s.progression >> s.bpm >> s.bpmLo >> s.bpmHi
       >> lk >> ls >> lp >> lb >> s.targets.density >> s.targets.stepwise >> s.targets.span >> s.targets.syncopation >> s.targets.repetition;
    s.lockKey = lk; s.lockScale = ls; s.lockProgression = lp; s.lockBpm = lb;
    auto rs = lineStream (in, "RANGES");
    int n;
    rs >> n;
    for (int i = 0; i < n; ++i)
    {
        int gene; double lo, hi;
        rs >> gene >> lo >> hi;
        s.geneRanges[(size_t) gene] = { true, lo, hi };
    }
    return s;
}

static Genome parseGenome (std::istringstream& ss)
{
    Genome g;
    ss >> g.key >> g.scale >> g.progression >> g.bpm >> g.seedMelody >> g.seedBass >> g.seedChords >> g.userScore;
    for (auto& v : g.genes) ss >> v;
    int n;
    ss >> n;
    for (int i = 0; i < n; ++i) { int o; ss >> o; g.chordOverrides.push_back (o); }
    return g;
}

static bool sameGenome (const Genome& a, const Genome& b)
{
    return a.key == b.key && a.scale == b.scale && a.progression == b.progression && a.bpm == b.bpm
        && a.seedMelody == b.seedMelody && a.seedBass == b.seedBass && a.seedChords == b.seedChords
        && a.genes == b.genes && a.userScore == b.userScore;
}

static std::string hex (const Bytes& b)
{
    static const char* d = "0123456789abcdef";
    std::string s;
    for (auto x : b) { s.push_back (d[x >> 4]); s.push_back (d[x & 15]); }
    return s;
}

int main (int argc, char** argv)
{
    if (argc < 2) { std::cerr << "usage: mf_golden_test golden.txt\n"; return 2; }
    std::ifstream in (argv[1]);
    if (! in) { std::cerr << "cannot open " << argv[1] << "\n"; return 2; }
    std::string line;
    int renderCases = 0, evolveRuns = 0;
    while (std::getline (in, line))
    {
        if (line.rfind ("CASE", 0) == 0)
        {
            std::string id = line.substr (5);
            Settings s = readSettings (in);
            auto gs = lineStream (in, "GENOME");
            Genome g = parseGenome (gs);
            Pattern p = render (g, s);
            for (int t = 0; t < NUM_TRACKS; ++t)
            {
                auto ts = lineStream (in, "TRACK");
                std::string name; int n;
                ts >> name >> n;
                std::vector<Note> expected;
                for (int i = 0; i < n; ++i) { Note x; ts >> x.pitch >> x.start >> x.length >> x.velocity; expected.push_back (x); }
                check (p.tracks[(size_t) t] == expected, "case " + id + " track " + name);
            }
            auto cs = lineStream (in, "CHORDS");
            int nc;
            cs >> nc;
            bool chordsOk = (int) p.chords.size() == nc;
            for (int i = 0; i < nc; ++i)
            {
                int degree, root, npcs, np;
                cs >> degree >> root >> npcs;
                std::vector<int> pcs ((size_t) npcs);
                for (auto& v : pcs) cs >> v;
                cs >> np;
                std::vector<int> pitches ((size_t) np);
                for (auto& v : pitches) cs >> v;
                if (chordsOk) chordsOk = p.chords[(size_t) i].degree == degree && p.chords[(size_t) i].root == root
                                         && p.chords[(size_t) i].pcs == pcs && p.chords[(size_t) i].pitches == pitches;
            }
            check (chordsOk, "case " + id + " chords");
            auto fs = lineStream (in, "FIT");
            double total, melodic, harmonic, rhythmic;
            fs >> total >> melodic >> harmonic >> rhythmic;
            Fitness f = evaluate (p, &g, s);
            check (f.total == total && f.melodic == melodic && f.harmonic == harmonic && f.rhythmic == rhythmic,
                   "case " + id + " fitness");
            auto ms = lineStream (in, "MIDI");
            std::string midiHex;
            ms >> midiHex;
            check (hex (toMidi (p)) == midiHex, "case " + id + " midi bytes");
            std::getline (in, line);   // END
            ++renderCases;
        }
        else if (line.rfind ("EVOLVE", 0) == 0)
        {
            std::string id = line.substr (7);
            Settings s = readSettings (in);
            auto rs = lineStream (in, "RUN");
            uint32_t seed; int gens, n;
            rs >> seed >> gens >> n;
            auto pop = createPopulation (s, seed);
            for (int i = 0; i < gens; ++i) pop = evolve (pop, s, seed * 31u + (uint32_t) i);
            check ((int) pop.size() == n, "evolve " + id + " population size");
            for (int i = 0; i < n; ++i)
            {
                auto gs = lineStream (in, "GENOME");
                Genome g = parseGenome (gs);
                auto ss = lineStream (in, "SCORE");
                double score;
                ss >> score;
                if (i < (int) pop.size())
                {
                    check (sameGenome (pop[(size_t) i].genome, g), "evolve " + id + " genome " + std::to_string (i));
                    check (pop[(size_t) i].fitness == score, "evolve " + id + " score " + std::to_string (i));
                }
            }
            auto ds = lineStream (in, "DIVERSITY");
            double div;
            ds >> div;
            check (diversity (pop) == div, "evolve " + id + " diversity");
            std::getline (in, line);   // END
            ++evolveRuns;
        }
    }
    std::cout << renderCases << " render cases, " << evolveRuns << " evolution runs, "
              << checks << " checks, " << failures << " failures\n";
    return failures == 0 && renderCases > 0 ? 0 : 1;
}
