#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "Presets.h"

#include <cstdio>
#include <cstdlib>

namespace mfplug
{

// ============================================================================ serialisation helpers
static juce::String exact (double v)
{
    char buf[40];
    std::snprintf (buf, sizeof (buf), "%.17g", v);   // round-trips exactly
    return buf;
}

static juce::String genomeToString (const mf::Genome& g)
{
    juce::StringArray s;
    s.add (juce::String (g.key)); s.add (juce::String (g.scale)); s.add (juce::String (g.progression)); s.add (juce::String (g.bpm));
    s.add (juce::String ((juce::int64) g.seedMelody)); s.add (juce::String ((juce::int64) g.seedBass)); s.add (juce::String ((juce::int64) g.seedChords));
    s.add (exact (g.userScore));
    for (double v : g.genes) s.add (exact (v));
    s.add (juce::String ((int) g.chordOverrides.size()));
    for (int o : g.chordOverrides) s.add (juce::String (o));
    return s.joinIntoString (" ");
}

static bool genomeFromString (const juce::String& text, mf::Genome& g)
{
    auto t = juce::StringArray::fromTokens (text, " ", "");
    if (t.size() < 19) return false;
    int i = 0;
    g.key = mf::mod12 (t[i++].getIntValue());
    g.scale = juce::jlimit (0, (int) mf::scales().size() - 1, t[i++].getIntValue());
    g.progression = juce::jlimit (0, (int) mf::progressions().size() - 1, t[i++].getIntValue());
    g.bpm = juce::jlimit (60, 180, t[i++].getIntValue());
    g.seedMelody = (uint32_t) t[i++].getLargeIntValue();
    g.seedBass = (uint32_t) t[i++].getLargeIntValue();
    g.seedChords = (uint32_t) t[i++].getLargeIntValue();
    // std::strtod is correctly rounded, so %.17g values come back bit-identical
    g.userScore = std::strtod (t[i++].toRawUTF8(), nullptr);
    for (auto& v : g.genes) v = juce::jlimit (0.0, 1.0, std::strtod (t[i++].toRawUTF8(), nullptr));
    int n = t[i++].getIntValue();
    g.chordOverrides.clear();
    for (int k = 0; k < n && i < t.size(); ++k) g.chordOverrides.push_back (t[i++].getIntValue());
    return true;
}

static juce::String patternToString (const mf::Pattern& p)
{
    juce::StringArray s;
    s.add (juce::String (p.bpm)); s.add (juce::String (p.bars)); s.add (juce::String (p.key)); s.add (juce::String (p.scale));
    s.add (p.edited ? "1" : "0");
    s.add (juce::String ((int) p.chords.size()));
    for (const auto& c : p.chords)
    {
        s.add (juce::String (c.degree)); s.add (juce::String (c.root));
        s.add (juce::String ((int) c.pcs.size()));
        for (int v : c.pcs) s.add (juce::String (v));
        s.add (juce::String ((int) c.pitches.size()));
        for (int v : c.pitches) s.add (juce::String (v));
    }
    for (const auto& tr : p.tracks)
    {
        s.add (juce::String ((int) tr.size()));
        for (const auto& n : tr) { s.add (juce::String (n.pitch)); s.add (juce::String (n.start)); s.add (juce::String (n.length)); s.add (juce::String (n.velocity)); }
    }
    return s.joinIntoString (" ");
}

static bool patternFromString (const juce::String& text, mf::Pattern& p)
{
    auto t = juce::StringArray::fromTokens (text, " ", "");
    int i = 0;
    auto next = [&] { return i < t.size() ? t[i++].getIntValue() : 0; };
    if (t.size() < 9) return false;
    p.bpm = juce::jlimit (60, 180, next()); p.bars = juce::jlimit (1, 8, next());
    p.key = mf::mod12 (next()); p.scale = juce::jlimit (0, (int) mf::scales().size() - 1, next());
    p.edited = next() != 0;
    int nc = next();
    if (nc != p.bars) return false;
    p.chords.clear();
    for (int c = 0; c < nc; ++c)
    {
        mf::Chord ch;
        ch.degree = next(); ch.root = next();
        int npcs = next();
        for (int k = 0; k < npcs; ++k) ch.pcs.push_back (next());
        int np = next();
        for (int k = 0; k < np; ++k) ch.pitches.push_back (next());
        if (ch.pcs.size() < 3) return false;
        ch.name = std::string (mf::noteNameOf (mf::mod12 (ch.pcs[0]))) + mf::chordQualityName (ch.pcs);
        p.chords.push_back (ch);
    }
    for (auto& tr : p.tracks)
    {
        tr.clear();
        int n = next();
        for (int k = 0; k < n; ++k)
        {
            mf::Note note;
            note.pitch = juce::jlimit (0, 127, next()); note.start = juce::jmax (0, next());
            note.length = juce::jmax (1, next()); note.velocity = juce::jlimit (1, 127, next());
            tr.push_back (note);
        }
    }
    return true;
}

// ============================================================================ processor
juce::AudioProcessorValueTreeState::ParameterLayout MelodyForgeProcessor::createLayout()
{
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> p;
    auto db = [] (float lo, float hi) { return juce::NormalisableRange<float> (lo, hi, 0.1f); };
    p.push_back (std::make_unique<juce::AudioParameterBool> (juce::ParameterID { "preview", 1 }, pt ("Som interno"), true));
    p.push_back (std::make_unique<juce::AudioParameterBool> (juce::ParameterID { "midiOut", 1 }, pt ("Enviar MIDI"), true));
    p.push_back (std::make_unique<juce::AudioParameterBool> (juce::ParameterID { "hostTempo", 1 }, pt ("Seguir o andamento do projeto"), true));
    p.push_back (std::make_unique<juce::AudioParameterFloat> (juce::ParameterID { "volume", 1 }, pt ("Volume geral"), db (-36.0f, 6.0f), -6.0f));
    // off by default: pressing play in the DAW must not start Melody Generator
    p.push_back (std::make_unique<juce::AudioParameterBool> (juce::ParameterID { "syncHost", 2 }, pt ("Tocar junto com o projeto"), false));
    p.push_back (std::make_unique<juce::AudioParameterFloat> (juce::ParameterID { "reverb", 2 }, pt ("Reverberação"),
                                                              juce::NormalisableRange<float> (0.0f, 1.0f, 0.01f), 0.25f));
    p.push_back (std::make_unique<juce::AudioParameterFloat> (juce::ParameterID { "volMelody", 2 }, pt ("Volume da melodia"), db (-30.0f, 6.0f), 0.0f));
    p.push_back (std::make_unique<juce::AudioParameterFloat> (juce::ParameterID { "volBass", 2 }, pt ("Volume do baixo"), db (-30.0f, 6.0f), -2.0f));
    p.push_back (std::make_unique<juce::AudioParameterFloat> (juce::ParameterID { "volChords", 2 }, pt ("Volume dos acordes"), db (-30.0f, 6.0f), -5.0f));
    return { p.begin(), p.end() };
}

// Loads a SoundFont off the message and audio threads.
struct MelodyForgeProcessor::Loader : public juce::Thread
{
    Loader (MelodyForgeProcessor& p, juce::File f) : juce::Thread ("Melody Generator bank loader"), owner (p), file (std::move (f)) {}
    void run() override
    {
        juce::String error;
        auto bank = file.existsAsFile() ? SoundBank::loadShared (file, error, [this] { return threadShouldExit(); }) : nullptr;
        if (threadShouldExit()) return;
        {
            std::lock_guard<std::mutex> g (owner.bankLock);
            if (bank != nullptr)
            {
                owner.keptBanks.push_back (bank);
                owner.bankMessage = bank->getName() + " - " + juce::String ((int) bank->getPresets().size()) + " instrumentos";
            }
            else if (! file.existsAsFile())
                owner.bankMessage = pt ("Banco de timbres não encontrado - usando sons sintetizados");
            else
                owner.bankMessage = pt ("Não foi possível carregar ") + file.getFileName() + ": " + error;
        }
        if (bank != nullptr) owner.sampler.setBank (bank);
        owner.bankState = bank != nullptr ? BankState::Ready : (file.existsAsFile() ? BankState::Failed : BankState::Missing);
        owner.sendChangeMessage();
    }
    MelodyForgeProcessor& owner;
    juce::File file;
};

juce::File MelodyForgeProcessor::findDefaultBank()
{
    const juce::String name ("MelodyForge-Timbres.sf2");
    juce::Array<juce::File> candidates;
    if (auto env = juce::SystemStats::getEnvironmentVariable ("MELODYFORGE_SF2", {}); env.isNotEmpty())
        candidates.add (juce::File (env));
    auto exe = juce::File::getSpecialLocation (juce::File::currentExecutableFile);
    candidates.add (exe.getSiblingFile (name));                                                   // next to the .exe
    candidates.add (exe.getParentDirectory().getSiblingFile ("Resources").getChildFile (name));   // inside the .vst3 bundle
    candidates.add (exe.getParentDirectory().getParentDirectory().getSiblingFile (name));         // next to the .vst3 bundle
    // "Melody Generator" is the current name; "MelodyForge ISLAND27" keeps older installs working
    for (const char* product : { "Melody Generator", "MelodyForge ISLAND27" })
    {
        const juce::String inBundle (juce::String (product) + ".vst3/Contents/Resources/" + name);
        candidates.add (exe.getSiblingFile (inBundle));                                           // .exe next to the .vst3 (zip layout)
       #if JUCE_WINDOWS
        candidates.add (juce::File::getSpecialLocation (juce::File::globalApplicationsDirectory).getChildFile ("Common Files/VST3/" + inBundle));
       #endif
        for (auto where : { juce::File::userDocumentsDirectory, juce::File::commonApplicationDataDirectory, juce::File::userApplicationDataDirectory })
            candidates.add (juce::File::getSpecialLocation (where).getChildFile (product).getChildFile (name));
    }
   #ifdef MELODYFORGE_DEV_BANK
    candidates.add (juce::File (MELODYFORGE_DEV_BANK));
   #endif
    for (auto& f : candidates)
        if (f.existsAsFile()) return f;
    return {};
}

void MelodyForgeProcessor::loadBank (const juce::File& file)
{
    if (loader != nullptr) loader->stopThread (10000);
    userBank = file;
    auto target = file.existsAsFile() ? file : findDefaultBank();
    bankState = BankState::Loading;
    {
        std::lock_guard<std::mutex> g (bankLock);
        bankMessage = pt ("Carregando timbres...");
    }
    loader = std::make_unique<Loader> (*this, target);
    loader->startThread();
}

MelodyForgeProcessor::MelodyForgeProcessor()
    : AudioProcessor (BusesProperties().withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      apvts (*this, nullptr, "MelodyForge", createLayout())
{
    previewParam = apvts.getRawParameterValue ("preview");
    midiOutParam = apvts.getRawParameterValue ("midiOut");
    volumeParam = apvts.getRawParameterValue ("volume");
    syncParam = apvts.getRawParameterValue ("syncHost");
    reverbParam = apvts.getRawParameterValue ("reverb");
    layerVolParam = { apvts.getRawParameterValue ("volMelody"), apvts.getRawParameterValue ("volBass"), apvts.getRawParameterValue ("volChords") };
    auditionNotes.reserve (32);

    settings.populationSize = 12;
    presets::apply (settings, style, mood);
    newPopulation ((uint32_t) juce::Time::currentTimeMillis());
    applyStyleInstruments();
    loadBank ({});
}

MelodyForgeProcessor::~MelodyForgeProcessor()
{
    if (loader != nullptr) loader->stopThread (10000);
}

bool MelodyForgeProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    auto out = layouts.getMainOutputChannelSet();
    return out == juce::AudioChannelSet::mono() || out == juce::AudioChannelSet::stereo();
}

void MelodyForgeProcessor::prepareToPlay (double sr, int samplesPerBlock)
{
    sampleRate = sr;
    sampler.prepare (sr);
    reverb.setSampleRate (sr);
    reverb.reset();
    wet.setSize (2, juce::jmax (512, samplesPerBlock * 2));
    gain.reset (sr, 0.05);
    gain.setCurrentAndTargetValue (juce::Decibels::decibelsToGain (volumeParam->load()));
    lastTicks = -1.0;
    wasPlaying = false;
}

void MelodyForgeProcessor::allNotesOff (juce::MidiBuffer& out, int sample)
{
    for (int t = 0; t < mf::NUM_TRACKS; ++t)
        for (int n = 0; n < 128; ++n)
            if (sounding[(size_t) t][(size_t) n])
            {
                out.addEvent (juce::MidiMessage::noteOff (t + 1, n), sample);
                sounding[(size_t) t][(size_t) n] = false;
            }
}

void MelodyForgeProcessor::emitRange (double a, double b, double tps, int blockSamples,
                                      const PlaybackData& data, juce::MidiBuffer& out)
{
    const double L = (double) data.loopTicks;
    auto toSample = [&] (double tick) { return juce::jlimit (0, blockSamples - 1, (int) ((tick - a) / tps)); };
    long long k0 = (long long) std::floor (a / L) - 1, k1 = (long long) std::floor (b / L);
    for (long long k = k0; k <= k1; ++k)
    {
        double base = (double) k * L;
        for (int t = 0; t < mf::NUM_TRACKS; ++t)
        {
            for (const auto& n : data.tracks[(size_t) t])
            {
                if (n.start >= data.loopTicks) continue;
                double on = base + n.start;
                double off = base + juce::jmin (n.start + n.length, data.loopTicks) - 1;   // release just before the loop point
                if (off >= a && off < b && sounding[(size_t) t][(size_t) n.pitch])
                {
                    out.addEvent (juce::MidiMessage::noteOff (t + 1, n.pitch), toSample (off));
                    sounding[(size_t) t][(size_t) n.pitch] = false;
                }
                if (on >= a && on < b && data.enabled[(size_t) t])
                {
                    int s = toSample (on);
                    if (sounding[(size_t) t][(size_t) n.pitch]) out.addEvent (juce::MidiMessage::noteOff (t + 1, n.pitch), s);
                    out.addEvent (juce::MidiMessage::noteOn (t + 1, n.pitch, (juce::uint8) n.velocity), s);
                    sounding[(size_t) t][(size_t) n.pitch] = true;
                }
            }
        }
    }
}

void MelodyForgeProcessor::layerGainsFromParams()
{
    for (int t = 0; t < mf::NUM_TRACKS; ++t)
        sampler.layerGain[(size_t) t] = juce::Decibels::decibelsToGain (layerVolParam[(size_t) t]->load(), -30.0f);
}

// Plays the first notes of a layer once (instrument preview), only while nothing else plays.
void MelodyForgeProcessor::startAudition (const PlaybackData& data, juce::MidiBuffer& out)
{
    const int t = auditionLayer.exchange (-1);
    if (t < 0 || t >= mf::NUM_TRACKS) return;
    for (int n : auditionNotes) out.addEvent (juce::MidiMessage::noteOff (auditionTrack + 1, n), 0);
    auditionNotes.clear();
    const auto& notes = data.tracks[(size_t) t];
    int first = std::numeric_limits<int>::max();
    for (const auto& n : notes) first = std::min (first, n.start);
    for (const auto& n : notes)
        if (n.start == first && auditionNotes.size() < auditionNotes.capacity())
        {
            out.addEvent (juce::MidiMessage::noteOn (t + 1, n.pitch, (juce::uint8) juce::jmax (90, n.velocity)), 0);
            auditionNotes.push_back (n.pitch);
        }
    if (auditionNotes.empty())
    {
        const int fallback = t == mf::Bass ? 40 : (t == mf::Chords ? 60 : 72);
        out.addEvent (juce::MidiMessage::noteOn (t + 1, fallback, (juce::uint8) 100), 0);
        auditionNotes.push_back (fallback);
    }
    auditionTrack = t;
    auditionSamplesLeft = (int) (sampleRate * 0.9);
}

void MelodyForgeProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    const int n = buffer.getNumSamples();
    buffer.clear();
    midi.clear();   // generator: incoming MIDI is ignored

    auto data = std::atomic_load (&playback);
    if (data == nullptr || n == 0) return;

    // The DAW transport only drives Melody Generator when "Tocar junto com o projeto" is on;
    // otherwise only the plugin's own Play button does.
    const bool followHost = syncParam->load() > 0.5f;
    bool playing = false;
    double bpm = data->bpm, startTicks = 0;
    bool hostIsPlaying = false;
    if (auto* ph = getPlayHead())
    {
        if (auto pos = ph->getPosition())
        {
            if (auto b = pos->getBpm()) hostBpm = *b;
            hostIsPlaying = pos->getIsPlaying();
            if (hostIsPlaying && followHost)
            {
                if (auto ppq = pos->getPpqPosition())
                {
                    playing = true;
                    startTicks = *ppq * mf::PPQ;
                    if (hostBpm.load() > 0) bpm = hostBpm.load();
                }
            }
        }
    }
    hostPlaying = hostIsPlaying;
    const double tps = bpm * mf::PPQ / 60.0 / sampleRate;
    if (! playing && internalPlay.load())
    {
        playing = true;
        startTicks = internalTicks;
        internalTicks += tps * n;
    }
    if (! internalPlay.load()) internalTicks = 0;

    juce::MidiBuffer generated;
    if (playing)
    {
        // continue exactly where the previous block ended (host positions are floating point,
        // so consecutive blocks can overlap by a hair and fire a boundary note twice)
        const bool continuous = wasPlaying && std::abs (startTicks - lastTicks) <= 2.0;
        if (! continuous) allNotesOff (generated, 0);
        const double from = continuous ? lastTicks : startTicks;
        const double to = std::max (from, startTicks + tps * n);
        emitRange (from, to, (to - from) / n, n, *data, generated);
        lastTicks = to;
        playheadTicks = std::fmod (startTicks, (double) data->loopTicks);
        auditionLayer = -1;
    }
    else
    {
        if (wasPlaying) allNotesOff (generated, 0);
        playheadTicks = -1.0;
    }
    wasPlaying = playing;

    // instrument preview (when a timbre is picked while stopped)
    juce::MidiBuffer audition;
    if (! playing) startAudition (*data, audition);
    if (auditionSamplesLeft > 0)
    {
        auditionSamplesLeft -= n;
        if (auditionSamplesLeft <= 0 || playing)
        {
            for (int note : auditionNotes) audition.addEvent (juce::MidiMessage::noteOff (auditionTrack + 1, note), 0);
            auditionNotes.clear();
            auditionSamplesLeft = 0;
        }
    }

    if (previewParam->load() > 0.5f)
    {
        layerGainsFromParams();
        juce::MidiBuffer forSampler (generated);
        forSampler.addEvents (audition, 0, n, 0);
        sampler.renderMidi (buffer, forSampler);

        if (const float amount = reverbParam->load(); amount > 0.001f && buffer.getNumChannels() >= 1)
        {
            juce::Reverb::Parameters rp;
            rp.roomSize = 0.55f; rp.damping = 0.45f; rp.width = 1.0f;
            rp.wetLevel = 0.42f * amount; rp.dryLevel = 1.0f; rp.freezeMode = 0.0f;
            reverb.setParameters (rp);
            if (buffer.getNumChannels() >= 2) reverb.processStereo (buffer.getWritePointer (0), buffer.getWritePointer (1), n);
            else reverb.processMono (buffer.getWritePointer (0), n);
        }
        gain.setTargetValue (juce::Decibels::decibelsToGain (volumeParam->load()));
        gain.applyGain (buffer, n);
        for (int ch = 0; ch < buffer.getNumChannels(); ++ch)   // gentle safety saturation
        {
            auto* d = buffer.getWritePointer (ch);
            for (int i = 0; i < n; ++i) d[i] = std::tanh (d[i]);
        }
    }
    else
    {
        sampler.allNotesOff (true);
    }
    if (midiOutParam->load() > 0.5f) midi.swapWith (generated);
}

// ============================================================================ engine actions
void MelodyForgeProcessor::publish()
{
    auto d = std::make_shared<PlaybackData>();
    d->tracks = pattern.tracks;
    for (int t = 0; t < mf::NUM_TRACKS; ++t)
        d->enabled[(size_t) t] = layerOn[(size_t) t] && (soloLayer < 0 || soloLayer == t);
    d->loopTicks = pattern.bars * mf::BAR;
    d->bpm = pattern.bpm;
    std::atomic_store (&playback, std::shared_ptr<const PlaybackData> (d));
    sendChangeMessage();
}

void MelodyForgeProcessor::showGenome (const mf::Genome& g)
{
    genome = g;
    pattern = mf::render (genome, settings);
    if (current >= 0 && current < (int) population.size()) population[(size_t) current] = mf::scoreGenome (genome, settings);
    publish();
}

void MelodyForgeProcessor::newPopulation (uint32_t seed)
{
    sessionSeed = seed;
    generation = 0;
    population = mf::createPopulation (settings, seed);
    selectCandidate (0);
}

void MelodyForgeProcessor::selectCandidate (int index)
{
    if (population.empty()) return;
    current = juce::jlimit (0, (int) population.size() - 1, index);
    showGenome (population[(size_t) current].genome);
}

void MelodyForgeProcessor::evolveOnce()
{
    ++generation;
    population = mf::evolve (population, settings, sessionSeed + (uint32_t) generation * 7919u);
    if (pattern.edited) { current = -1; publish(); }
    else selectCandidate (0);
}

void MelodyForgeProcessor::like()
{
    mf::Genome g = genome;
    g.userScore = juce::jlimit (-1.0, 1.0, g.userScore + 0.5);
    auto entry = mf::scoreGenome (g, settings);
    if (current < 0) { population.back() = entry; mf::sortPopulation (population); current = 0;
                       for (size_t i = 0; i < population.size(); ++i) if (population[i].genome.seedMelody == g.seedMelody) current = (int) i; }
    else population[(size_t) current] = entry;
    genome = g;
    publish();
}

void MelodyForgeProcessor::skip()
{
    if (current >= 0) { population[(size_t) current].genome.userScore = juce::jlimit (-1.0, 1.0, genome.userScore - 0.5);
                        population[(size_t) current] = mf::scoreGenome (population[(size_t) current].genome, settings); }
    selectCandidate (current < 0 ? 0 : (current + 1) % (int) population.size());
}

void MelodyForgeProcessor::setChord (int bar, int degree) { showGenome (mf::setChordOverride (genome, bar, degree)); }

void MelodyForgeProcessor::rerollLayer (int track)
{
    showGenome (mf::rerollLayer (genome, track, (uint32_t) juce::Random::getSystemRandom().nextInt()));
}

void MelodyForgeProcessor::transposeLayer (int track, int semitones)
{
    pattern = mf::transposeTrack (pattern, track, semitones);
    publish();
}

void MelodyForgeProcessor::revertEdits() { showGenome (genome); }

void MelodyForgeProcessor::setLayerEnabled (int track, bool on)
{
    layerOn[(size_t) track] = on;
    publish();
}

void MelodyForgeProcessor::setTempo (int bpm)
{
    bpm = juce::jlimit (60, 180, bpm);
    genome.bpm = bpm;
    pattern.bpm = bpm;
    settings.bpm = bpm;
    if (current >= 0 && current < (int) population.size()) population[(size_t) current].genome.bpm = bpm;
    publish();
}

void MelodyForgeProcessor::applySettings (bool regeneratePopulation)
{
    settings = mf::normalize (settings);
    if (regeneratePopulation) { newPopulation (sessionSeed); return; }
    for (auto& e : population) e = mf::scoreGenome (mf::applyLocks (e.genome, settings), settings);
    mf::sortPopulation (population);
    showGenome (mf::applyLocks (genome, settings));
}

void MelodyForgeProcessor::applySliders()
{
    mf::Genome g = genome;
    g.genes[mf::Density] = (complexity - 1) / 9.0;
    g.genes[mf::Stepwise] = 1.0 - (complexity - 1) / 9.0 * 0.6;
    g.genes[mf::ChordComplexity] = (harmony - 1) / 9.0;
    showGenome (g);
}

void MelodyForgeProcessor::setSharp (bool on)
{
    settings.sharp = on;
    applySettings (false);   // same ideas, re-rendered with (or without) colour notes
}

void MelodyForgeProcessor::setIdeaCount (int count)
{
    settings.populationSize = juce::jlimit (4, mf::MAX_IDEAS, count);
    applySettings (true);
}

void MelodyForgeProcessor::setSolo (int track)
{
    soloLayer = juce::jlimit (-1, mf::NUM_TRACKS - 1, track);
    publish();
}

void MelodyForgeProcessor::setStyle (int newStyle, bool withInstruments)
{
    style = juce::jlimit (0, (int) presets::styles().size() - 1, newStyle);
    presets::apply (settings, style, mood);
    applySettings (true);
    if (withInstruments) applyStyleInstruments();
}

void MelodyForgeProcessor::setMood (int newMood)
{
    mood = juce::jlimit (0, (int) presets::moods().size() - 1, newMood);
    presets::apply (settings, style, mood);
    applySettings (true);
}

void MelodyForgeProcessor::setInstrument (int track, int code, bool withAudition)
{
    if (track < 0 || track >= mf::NUM_TRACKS) return;
    sampler.instrument[(size_t) track] = code;
    if (withAudition) audition (track);
    sendChangeMessage();
}

void MelodyForgeProcessor::applyStyleInstruments()
{
    auto d = instruments::defaultsForStyle (style);
    for (int t = 0; t < mf::NUM_TRACKS; ++t) setInstrument (t, d[(size_t) t], false);
}

juce::String MelodyForgeProcessor::layerName (int track)
{
    static const char* n[] = { "Melodia", "Baixo", "Acordes" };
    return n[juce::jlimit (0, 2, track)];
}

mf::Bytes MelodyForgeProcessor::midiFor (const std::vector<int>& layers) const
{
    static const char* names[] = { "Melodia", "Baixo", "Acordes" };
    return mf::toMidi (pattern, layers, "Melody Generator", names);
}

juce::String MelodyForgeProcessor::fileBaseName() const
{
    juce::String key = juce::String (mf::noteNameOf (pattern.key)).replace ("#", "s");
    const auto& sc = mf::scales()[(size_t) juce::jlimit (0, (int) mf::scales().size() - 1, pattern.scale)];
    return "MelodyGenerator-" + key + "-" + sc.id + (settings.sharp ? "-afiada" : "") + "-" + juce::String (pattern.bpm) + "bpm";
}

// ============================================================================ state
void MelodyForgeProcessor::getStateInformation (juce::MemoryBlock& dest)
{
    juce::XmlElement root ("MelodyForge");
    root.setAttribute ("version", 3);
    root.setAttribute ("seed", juce::String ((juce::int64) sessionSeed));
    root.setAttribute ("generation", generation);
    root.setAttribute ("current", current);
    root.setAttribute ("complexity", complexity);
    root.setAttribute ("harmony", harmony);
    root.setAttribute ("style", style);
    root.setAttribute ("mood", mood);
    root.setAttribute ("advanced", advancedMode ? 1 : 0);
    root.setAttribute ("sharp", settings.sharp ? 1 : 0);
    root.setAttribute ("layers", juce::String (layerOn[0] ? "1" : "0") + (layerOn[1] ? "1" : "0") + (layerOn[2] ? "1" : "0"));
    root.setAttribute ("instruments", juce::String (instrumentOf (0)) + "," + juce::String (instrumentOf (1)) + "," + juce::String (instrumentOf (2)));
    if (userBank != juce::File()) root.setAttribute ("bank", userBank.getFullPathName());
    auto* s = root.createNewChildElement ("Settings");
    s->setAttribute ("bars", settings.bars); s->setAttribute ("pop", settings.populationSize);
    s->setAttribute ("maxNotes", settings.maxNotesPerBar); s->setAttribute ("low", settings.melodyLow); s->setAttribute ("high", settings.melodyHigh);
    s->setAttribute ("key", settings.key); s->setAttribute ("scale", settings.scale); s->setAttribute ("progression", settings.progression);
    s->setAttribute ("bpm", settings.bpm);
    s->setAttribute ("locks", juce::String (settings.lockKey ? "1" : "0") + (settings.lockScale ? "1" : "0")
                              + (settings.lockProgression ? "1" : "0") + (settings.lockBpm ? "1" : "0"));
    root.createNewChildElement ("Genome")->addTextElement (genomeToString (genome));
    root.createNewChildElement ("Pattern")->addTextElement (patternToString (pattern));
    auto* pop = root.createNewChildElement ("Population");
    for (const auto& e : population) pop->createNewChildElement ("G")->addTextElement (genomeToString (e.genome));
    if (auto params = apvts.copyState().createXml()) root.addChildElement (params.release());
    copyXmlToBinary (root, dest);
}

void MelodyForgeProcessor::setStateInformation (const void* data, int size)
{
    auto xml = getXmlFromBinary (data, size);
    if (xml == nullptr || ! xml->hasTagName ("MelodyForge")) return;
    if (auto* params = xml->getChildByName (apvts.state.getType()))
        apvts.replaceState (juce::ValueTree::fromXml (*params));
    style = xml->getIntAttribute ("style", 0);
    mood = xml->getIntAttribute ("mood", 0);
    advancedMode = xml->getIntAttribute ("advanced", 0) != 0;
    presets::apply (settings, style, mood);
    if (auto* s = xml->getChildByName ("Settings"))
    {
        settings.bars = s->getIntAttribute ("bars", 4); settings.populationSize = s->getIntAttribute ("pop", 12);
        settings.maxNotesPerBar = s->getIntAttribute ("maxNotes", 8);
        settings.melodyLow = s->getIntAttribute ("low", 60); settings.melodyHigh = s->getIntAttribute ("high", 84);
        settings.key = s->getIntAttribute ("key"); settings.scale = s->getIntAttribute ("scale"); settings.progression = s->getIntAttribute ("progression");
        settings.bpm = s->getIntAttribute ("bpm", 120);
        auto locks = s->getStringAttribute ("locks", "0000");
        settings.lockKey = locks[0] == '1'; settings.lockScale = locks[1] == '1';
        settings.lockProgression = locks[2] == '1'; settings.lockBpm = locks[3] == '1';
        settings = mf::normalize (settings);
    }
    settings.sharp = xml->getIntAttribute ("sharp", 0) != 0;
    sessionSeed = (uint32_t) xml->getStringAttribute ("seed", "1").getLargeIntValue();
    generation = xml->getIntAttribute ("generation");
    complexity = xml->getIntAttribute ("complexity", 5);
    harmony = xml->getIntAttribute ("harmony", 5);
    auto layers = xml->getStringAttribute ("layers", "111");
    for (int t = 0; t < 3; ++t) layerOn[(size_t) t] = layers[t] != '0';
    if (xml->hasAttribute ("instruments"))
    {
        auto codes = juce::StringArray::fromTokens (xml->getStringAttribute ("instruments"), ",", "");
        for (int t = 0; t < 3 && t < codes.size(); ++t) setInstrument (t, codes[t].getIntValue(), false);
    }
    else
        applyStyleInstruments();
    if (juce::File bankFile (xml->getStringAttribute ("bank")); xml->hasAttribute ("bank") && bankFile != userBank)
        loadBank (bankFile);
    population.clear();
    if (auto* pop = xml->getChildByName ("Population"))
        for (auto* g : pop->getChildIterator())
        {
            mf::Genome genomeIn;
            if (genomeFromString (g->getAllSubText(), genomeIn)) population.push_back (mf::scoreGenome (genomeIn, settings));
        }
    if (population.empty()) population = mf::createPopulation (settings, sessionSeed);
    current = juce::jlimit (-1, (int) population.size() - 1, xml->getIntAttribute ("current", 0));
    mf::Genome g;
    if (auto* ge = xml->getChildByName ("Genome"); ge != nullptr && genomeFromString (ge->getAllSubText(), g)) genome = g;
    else genome = population[0].genome;
    mf::Pattern p;
    if (auto* pe = xml->getChildByName ("Pattern"); pe != nullptr && patternFromString (pe->getAllSubText(), p) && p.bars == settings.bars)
        pattern = p;
    else
        pattern = mf::render (genome, settings);
    publish();
}

juce::AudioProcessorEditor* MelodyForgeProcessor::createEditor() { return new MelodyForgeEditor (*this); }

} // namespace mfplug

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new mfplug::MelodyForgeProcessor(); }
