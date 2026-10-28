// Functional test of the Melody Generator plugin processor with a simulated host.
// Usage: mf_processor_test [editor-snapshot.png]
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>

#include "../Source/PluginProcessor.h"
#include "../Source/PluginEditor.h"
#include "../Source/Presets.h"

#include <iostream>
#include <cstdlib>
#include <map>
#include <set>

using namespace mfplug;

static int failures = 0;
static void check (bool ok, const std::string& what, const std::string& extra = {})
{
    std::cout << (ok ? "ok   " : "FAIL ") << what << (extra.empty() ? "" : " - " + extra) << "\n";
    if (! ok) ++failures;
}

struct FakeHost : public juce::AudioPlayHead
{
    double bpm = 120, ppq = 0;
    bool playing = true;
    juce::Optional<PositionInfo> getPosition() const override
    {
        PositionInfo p;
        p.setBpm (bpm);
        p.setIsPlaying (playing);
        p.setPpqPosition (ppq);
        p.setTimeSignature (juce::AudioPlayHead::TimeSignature { 4, 4 });
        return p;
    }
};

struct Event { int channel, pitch, velocity; double tick; bool on; };

// Runs the processor for `ticks` worth of host time and returns the MIDI it produced.
static std::vector<Event> run (MelodyForgeProcessor& proc, FakeHost& host, double ticks, double sr, int block, float* peak = nullptr)
{
    std::vector<Event> events;
    const double windowStart = host.ppq * mf::PPQ;
    juce::AudioBuffer<float> buffer (2, block);
    juce::MidiBuffer midi;
    double tps = host.bpm * mf::PPQ / 60.0 / sr;
    double startTick = host.ppq * mf::PPQ;
    while (host.ppq * mf::PPQ < startTick + ticks)
    {
        midi.clear();
        proc.processBlock (buffer, midi);
        if (peak != nullptr) *peak = std::max (*peak, buffer.getMagnitude (0, block));
        for (const auto meta : midi)
        {
            auto m = meta.getMessage();
            double tick = host.ppq * mf::PPQ + meta.samplePosition * tps;
            if (m.isNoteOnOrOff() && host.playing && tick >= windowStart + ticks - 0.5) continue;   // belongs to the next window
            if (m.isNoteOnOrOff())
                events.push_back ({ m.getChannel(), m.getNoteNumber(), m.getVelocity(),
                                    host.ppq * mf::PPQ + meta.samplePosition * tps, m.isNoteOn() });
        }
        if (host.playing) host.ppq += block * tps / mf::PPQ;
        else break;
    }
    return events;
}

int main (int argc, char** argv)
{
    juce::ScopedJuceInitialiser_GUI gui;
    const double sr = 48000.0;
    const int block = 480;

    MelodyForgeProcessor proc;
    FakeHost host;
    proc.setPlayHead (&host);
    proc.prepareToPlay (sr, block);
    proc.newPopulation (2024);
    check (proc.population.size() == 12 && proc.pattern.bars == 4, "processor starts with 12 candidates and a 4-bar idea");

    // ---- by default the DAW transport does NOT start MelodyForge
    {
        check (! proc.syncsWithHost(), "'Tocar junto com o projeto' is off by default");
        auto silent = run (proc, host, mf::BAR, sr, block);
        check (silent.empty(), "host playing + sync off = no notes (MelodyForge stays separate)");
        host.ppq = 0;
        *proc.apvts.getRawParameterValue ("syncHost") = 1.0f;
    }

    // ---- MIDI out matches the pattern, note for note, within one sample
    *proc.apvts.getRawParameterValue ("preview") = 0.0f;
    const double loop = proc.pattern.bars * mf::BAR;
    auto events = run (proc, host, loop, sr, block);
    std::map<int, std::vector<Event>> onsByChannel;
    for (auto& e : events) if (e.on) onsByChannel[e.channel].push_back (e);
    bool exact = true;
    std::string detail;
    for (int t = 0; t < mf::NUM_TRACKS; ++t)
    {
        auto expected = proc.pattern.tracks[(size_t) t];
        auto& got = onsByChannel[t + 1];
        if (got.size() != expected.size() && std::getenv ("MF_DEBUG"))
        {
            for (auto& e : got) std::cout << "  got " << mf::trackId (t) << " " << e.pitch << " @" << e.tick << "\n";
            for (auto& e : expected) std::cout << "  exp " << mf::trackId (t) << " " << e.pitch << " @" << e.start << "\n";
        }
        if (got.size() != expected.size()) { exact = false; detail += std::string (mf::trackId (t)) + " count " + std::to_string (got.size()) + "/" + std::to_string (expected.size()) + " "; continue; }
        std::sort (expected.begin(), expected.end(), [] (const mf::Note& a, const mf::Note& b) { return a.start < b.start || (a.start == b.start && a.pitch < b.pitch); });
        std::sort (got.begin(), got.end(), [] (const Event& a, const Event& b) { return a.tick < b.tick - 0.5 || (std::abs (a.tick - b.tick) <= 0.5 && a.pitch < b.pitch); });
        for (size_t i = 0; i < got.size(); ++i)
            if (got[i].pitch != expected[i].pitch || std::abs (got[i].tick - expected[i].start) > 1.0 || got[i].velocity != expected[i].velocity)
                { exact = false; detail += std::string (mf::trackId (t)) + " note " + std::to_string (i) + " "; break; }
    }
    check (exact, "MIDI out = pattern notes (pitch, position within 1 tick, velocity) on channels 1-3", detail);
    int ons = 0, offs = 0;
    for (auto& e : events) (e.on ? ons : offs)++;
    auto tail = run (proc, host, 10, sr, block);   // the last notes end at the loop point
    for (auto& e : tail) if (! e.on) ++offs;
    check (offs >= ons, "every note-on is followed by a note-off", std::to_string (ons) + " on / " + std::to_string (offs) + " off");

    // ---- loops seamlessly
    auto second = run (proc, host, loop, sr, block);
    int secondOns = 0;
    for (auto& e : second) if (e.on) ++secondOns;
    check (secondOns == ons, "pattern loops (same notes in the second pass)");

    // ---- tempo follows the host
    host.bpm = 90;
    host.ppq = 0;
    auto slow = run (proc, host, mf::BAR, sr, block);
    bool onGrid = true;
    for (auto& e : slow) if (e.on && e.channel == 3 && std::fmod (e.tick, (double) mf::BAR) > 1.0 && std::fmod (e.tick, (double) mf::BAR) < mf::BAR - 1.0
                             && proc.settings.chordRhythm == mf::Sustain) onGrid = false;
    check (onGrid && ! slow.empty(), "playback stays on the host's beat grid at 90 BPM");
    host.bpm = 120;

    // ---- layer toggle
    proc.setLayerEnabled (mf::Melody, false);
    host.ppq = 0;
    auto noMelody = run (proc, host, loop, sr, block);
    bool none = std::none_of (noMelody.begin(), noMelody.end(), [] (const Event& e) { return e.on && e.channel == 1; });
    check (none, "disabled layer sends no notes");
    proc.setLayerEnabled (mf::Melody, true);

    // ---- stop sends note-offs
    host.playing = false;
    auto stopped = run (proc, host, 1, sr, block);
    check (std::all_of (stopped.begin(), stopped.end(), [] (const Event& e) { return ! e.on; }), "stopping the host releases all notes");
    host.playing = true;

    // ---- preview sound
    *proc.apvts.getRawParameterValue ("preview") = 1.0f;
    float peak = 0;
    host.ppq = 0;
    run (proc, host, mf::BAR, sr, block, &peak);
    check (peak > 0.01f && peak < 1.0f, "preview sound is audible and not clipping", std::to_string (peak));
    *proc.apvts.getRawParameterValue ("preview") = 0.0f;
    peak = 0;
    host.ppq = 0;
    run (proc, host, mf::BAR, sr, block, &peak);
    check (peak == 0.0f, "preview off = silent output");

    // ---- internal play (DAW stopped)
    host.playing = false;
    proc.internalPlay = true;
    juce::AudioBuffer<float> buf (2, block);
    juce::MidiBuffer midi;
    int internalOns = 0;
    for (int i = 0; i < 400; ++i) { midi.clear(); proc.processBlock (buf, midi); for (const auto m : midi) if (m.getMessage().isNoteOn()) ++internalOns; }
    proc.internalPlay = false;
    check (internalOns > 0, "Play button previews the idea while the DAW is stopped");
    host.playing = true;

    // ---- actions
    auto before = proc.genome;
    proc.evolveOnce();
    check (proc.generation == 1 && proc.population.size() == 12, "Evolve creates a new generation");
    double f0 = proc.population[(size_t) proc.current].fitness;
    proc.like();
    check (proc.population[(size_t) proc.current].fitness > f0, "Like raises the fitness");
    int idx = proc.current;
    proc.skip();
    check (proc.current != idx, "Skip moves to another candidate");
    proc.setChord (1, 5);
    check (proc.pattern.chords[1].degree == 5, "chord of bar 2 can be changed");
    auto bass = proc.pattern.tracks[mf::Bass];
    auto chords = proc.pattern.tracks[mf::Chords];
    proc.rerollLayer (mf::Melody);
    check (proc.pattern.tracks[mf::Bass] == bass && proc.pattern.tracks[mf::Chords] == chords, "New variation changes only the melody");
    proc.transposeLayer (mf::Bass, 12);
    check (proc.isEdited() && proc.pattern.tracks[mf::Bass][0].pitch == bass[0].pitch + 12, "transpose edits a layer");
    proc.settings.key = 2; proc.settings.lockKey = true;
    proc.applySettings (false);
    proc.evolveOnce(); proc.evolveOnce();
    check (std::all_of (proc.population.begin(), proc.population.end(), [] (const mf::Entry& e) { return e.genome.key == 2; }), "locked key holds across generations");
    proc.revertEdits();
    proc.setTempo (97);
    check (proc.pattern.bpm == 97 && proc.genome.bpm == 97, "tempo follows the host / setTempo");

    // ---- MIDI export bytes = core writer
    {
        static const char* names[] = { "Melodia", "Baixo", "Acordes" };
        auto bytes = proc.midiFor ({ 0, 1, 2 });
        check (bytes == mf::toMidi (proc.pattern, { 0, 1, 2 }, "Melody Generator", names), "exported .mid bytes come from the shared core");
        std::string str (bytes.begin(), bytes.end());
        check (str.find ("Melodia") != std::string::npos && str.find ("Acordes") != std::string::npos, "MIDI track names are in Portuguese");
        check (proc.fileBaseName().contains ("-menor-") || proc.fileBaseName().contains ("-maior-") || proc.fileBaseName().contains ("-"),
               "file name", proc.fileBaseName().toStdString());
    }

    // ---- state round trip
    juce::MemoryBlock state;
    proc.transposeLayer (mf::Melody, -2);
    proc.getStateInformation (state);
    MelodyForgeProcessor restored;
    restored.setStateInformation (state.getData(), (int) state.getSize());
    bool sameTracks = restored.pattern.tracks == proc.pattern.tracks && restored.pattern.bpm == proc.pattern.bpm;
    bool samePop = restored.population.size() == proc.population.size();
    for (size_t i = 0; samePop && i < proc.population.size(); ++i)
        samePop = restored.population[i].genome.seedMelody == proc.population[i].genome.seedMelody
               && restored.population[i].genome.genes == proc.population[i].genome.genes;
    check (sameTracks && restored.isEdited(), "saved project restores the edited idea");
    check (samePop && restored.sessionSeed == proc.sessionSeed && restored.generation == proc.generation, "saved project restores population, seed and generation",
           "pop " + std::to_string (samePop) + " seed " + std::to_string (restored.sessionSeed) + "/" + std::to_string (proc.sessionSeed)
           + " gen " + std::to_string (restored.generation) + "/" + std::to_string (proc.generation)
           + " size " + std::to_string (restored.population.size()) + "/" + std::to_string (proc.population.size()));

    // ---- presets
    proc.settings.lockKey = false;
    proc.style = 1; proc.mood = 2;            // Trap + Sad
    mfplug::presets::apply (proc.settings, proc.style, proc.mood);
    proc.applySettings (true);
    const auto sadScales = mfplug::presets::moods()[2].scales;   // menor natural, menor melódica, menor com 7ª
    auto isSad = [&] (int sc) { return std::find (sadScales.begin(), sadScales.end(), sc) != sadScales.end() && mf::scales()[(size_t) sc].minor; };
    bool presetOk = std::all_of (proc.population.begin(), proc.population.end(), [&] (const mf::Entry& e)
        { return e.genome.bpm >= 130 && e.genome.bpm <= 160 && isSad (e.genome.scale); });
    for (int i = 0; i < 6; ++i) proc.evolveOnce();
    presetOk = presetOk && std::all_of (proc.population.begin(), proc.population.end(), [&] (const mf::Entry& e) { return isSad (e.genome.scale); });
    check (presetOk, "Trap + Sad presets: 130-160 BPM and minor-family scales, also after evolving");

    // ---- up to 64 ideas, afiada option saved with the project
    proc.setIdeaCount (64);
    check (proc.population.size() == 64, "64 ideas per generation");
    proc.evolveOnce();
    check (proc.population.size() == 64, "64 ideas after evolving");
    proc.setIdeaCount (500);
    check (proc.population.size() == 64, "never more than 64 ideas");
    proc.setSharp (true);
    {
        juce::MemoryBlock st;
        proc.getStateInformation (st);
        MelodyForgeProcessor r;
        r.setStateInformation (st.getData(), (int) st.getSize());
        check (r.settings.sharp && r.settings.populationSize == 64, "afiada and idea count are saved with the project");
    }
    proc.setIdeaCount (12);
    juce::MemoryBlock presetState;
    proc.advancedMode = true;
    proc.getStateInformation (presetState);
    MelodyForgeProcessor restored2;
    restored2.setStateInformation (presetState.getData(), (int) presetState.getSize());
    check (restored2.style == 1 && restored2.mood == 2 && restored2.advancedMode && restored2.settings.bpmLo == 130,
           "style, mood and mode are saved with the project");

    // ---- real instruments (SoundFont)
    {
        for (int i = 0; i < 400 && proc.getBankState() == MelodyForgeProcessor::BankState::Loading; ++i) juce::Thread::sleep (25);
        auto bank = proc.currentBank();
        check (proc.getBankState() == MelodyForgeProcessor::BankState::Ready && bank != nullptr && bank->getPresets().size() >= 50,
               "default bank of real instruments loads", proc.getBankMessage().toStdString());
        if (bank != nullptr)
        {
            // every instrument sounds, without NaNs or clipping
            Sampler s;
            s.prepare (sr);
            s.setBank (bank);
            int silentPresets = 0, badPresets = 0;
            std::string names;
            for (const auto& pr : bank->getPresets())
            {
                s.instrument[0] = instruments::code (pr.bank, pr.program);
                juce::AudioBuffer<float> b (2, 24000);
                b.clear();
                juce::MidiBuffer m;
                m.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
                m.addEvent (juce::MidiMessage::noteOff (1, 60), 12000);
                s.renderMidi (b, m);
                float mag = b.getMagnitude (0, 24000);
                bool finite = true;
                for (int i = 0; i < 24000; ++i) finite = finite && std::isfinite (b.getSample (0, i));
                if (mag < 0.005f) { ++silentPresets; names += pr.name.toStdString() + " "; }
                if (! finite || mag > 2.5f) { ++badPresets; names += "!" + pr.name.toStdString() + " "; }
                s.allNotesOff (true);
            }
            check (silentPresets == 0 && badPresets == 0, "all " + std::to_string (bank->getPresets().size()) + " instruments are audible and sane", names);

            // tuning: piano A4 is 440 Hz (period from autocorrelation)
            auto measure = [&] (int code, int note)
            {
                s.instrument[0] = code;
                juce::AudioBuffer<float> b (2, 48000);
                b.clear();
                juce::MidiBuffer m;
                m.addEvent (juce::MidiMessage::noteOn (1, note, (juce::uint8) 110), 0);
                s.renderMidi (b, m);
                s.allNotesOff (true);
                const float* x = b.getReadPointer (0) + 4800;
                const int n = 8192;
                const double expected = juce::MidiMessage::getMidiNoteInHertz (note);
                auto corr = [&] (int lag) { double acc = 0; for (int i = 0; i < n; ++i) acc += x[i] * x[i + lag]; return acc; };
                int bestLag = 0; double best = -1e9;
                for (int lag = (int) (sr / (expected * 1.2)); lag <= (int) (sr / (expected / 1.2)); ++lag)
                    if (double acc = corr (lag); acc > best) { best = acc; bestLag = lag; }
                if (bestLag <= 1) return 0.0;
                const double l = corr (bestLag - 1), c = best, r = corr (bestLag + 1);   // parabolic peak
                const double shift = 0.5 * (l - r) / (l - 2.0 * c + r);
                return sr / (bestLag + shift);
            };
            double a4 = measure (instruments::code (0, 0), 69);
            check (std::abs (a4 - 440.0) < 440.0 * 0.01, "piano A4 sounds at 440 Hz", std::to_string (a4));
            double flute = measure (instruments::code (0, 73), 76);
            check (std::abs (flute - 659.26) < 659.26 * 0.01, "flute E5 in tune", std::to_string (flute));
            double b808 = measure (instruments::builtin808, 36);
            check (std::abs (b808 - 65.4) < 65.4 * 0.03, "built-in 808 in tune", std::to_string (b808));
        }

        // instrument choice per layer is saved; style picks matching instruments
        proc.setStyle (1, true);   // Trap
        check (proc.instrumentOf (mf::Bass) == instruments::builtin808, "Trap style picks the 808 bass");
        proc.setInstrument (mf::Melody, instruments::code (0, 11), false);
        juce::MemoryBlock st;
        proc.getStateInformation (st);
        MelodyForgeProcessor r3;
        r3.setStateInformation (st.getData(), (int) st.getSize());
        check (r3.instrumentOf (mf::Melody) == instruments::code (0, 11) && r3.instrumentOf (mf::Bass) == instruments::builtin808,
               "instruments per layer are saved with the project");

        // internal playback with real instruments is audible while the host is stopped
        host.playing = false;
        *proc.apvts.getRawParameterValue ("preview") = 1.0f;
        proc.internalPlay = true;
        juce::AudioBuffer<float> b (2, block);
        juce::MidiBuffer m;
        float pk = 0;
        for (int i = 0; i < 300; ++i) { m.clear(); proc.processBlock (b, m); pk = std::max (pk, b.getMagnitude (0, block)); }
        proc.internalPlay = false;
        for (int i = 0; i < 50; ++i) { m.clear(); proc.processBlock (b, m); }
        check (pk > 0.02f && pk <= 1.0f, "Play button sounds with real instruments (DAW stopped)", std::to_string (pk));

        // solo: only that layer sends notes
        proc.setSolo (mf::Bass);
        proc.internalPlay = true;
        std::set<int> channels;
        for (int i = 0; i < 400; ++i) { m.clear(); proc.processBlock (b, m); for (const auto e : m) if (e.getMessage().isNoteOn()) channels.insert (e.getMessage().getChannel()); }
        proc.internalPlay = false;
        proc.setSolo (-1);
        for (int i = 0; i < 5; ++i) { m.clear(); proc.processBlock (b, m); }
        check (channels == std::set<int> { 2 }, "'Ouvir só' plays only that layer");

        // picking an instrument plays a short preview
        proc.setInstrument (mf::Chords, instruments::code (0, 48));
        pk = 0;
        for (int i = 0; i < 40; ++i) { m.clear(); proc.processBlock (b, m); pk = std::max (pk, b.getMagnitude (0, block)); }
        check (pk > 0.01f, "choosing an instrument plays a preview", std::to_string (pk));
        host.playing = true;
    }

    // ---- editor renders (beginner, advanced, full screen)
    {
        proc.advancedMode = false;
        std::unique_ptr<juce::AudioProcessorEditor> ed (proc.createEditor());
        auto* mfEd = dynamic_cast<MelodyForgeEditor*> (ed.get());
        for (int i = 0; i < 400 && proc.getBankState() == MelodyForgeProcessor::BankState::Loading; ++i) juce::Thread::sleep (25);
        auto shot = [&] (const char* tag, int w, int h)
        {
            ed->setSize (w, h);
            auto img = ed->createComponentSnapshot (ed->getLocalBounds());
            check (img.isValid() && img.getWidth() == w, std::string ("editor renders: ") + tag);
            if (argc > 1)
            {
                juce::File f (juce::String (argv[1]).replace (".png", juce::String ("-") + tag + ".png"));
                f.deleteFile();
                juce::FileOutputStream out (f);
                juce::PNGImageFormat().writeImageToStream (img, out);
            }
        };
        proc.internalPlay = true;   // show the playing state (playhead, glowing notes)
        juce::AudioBuffer<float> b (2, block);
        juce::MidiBuffer m;
        for (int i = 0; i < 60; ++i) { m.clear(); proc.processBlock (b, m); }
        shot ("beginner", 900, 560);
        proc.advancedMode = true;
        ed.reset (proc.createEditor());
        mfEd = dynamic_cast<MelodyForgeEditor*> (ed.get());
        shot ("advanced", 900, 560);
        proc.internalPlay = false;
        ed->setSize (900, 560);
        mfEd->toggleFullScreen();
        check (mfEd->isFullScreenMode() && ed->getWidth() > 900, "full screen grows the window", std::to_string (ed->getWidth()) + "x" + std::to_string (ed->getHeight()));
        mfEd->toggleFullScreen();
        check (! mfEd->isFullScreenMode() && ed->getWidth() == 900 && ed->getHeight() == 560, "normal size restores the window");
        proc.advancedMode = false;
        ed.reset (proc.createEditor());
        shot ("fullscreen", 1920, 1050);
    }

    std::cout << (failures == 0 ? "ALL PASSED" : std::to_string (failures) + " FAILURE(S)") << "\n";
    return failures == 0 ? 0 : 1;
}
