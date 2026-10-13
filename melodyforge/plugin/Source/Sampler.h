// Real instrument playback for MelodyForge: a small SoundFont 2 (.sf2) reader and a
// polyphonic sampler with one instrument per layer (melody, bass, chords).
//
// The default bank (Resources/MelodyForge-Timbres.sf2) is a subset of the Fluid (R3)
// General MIDI SoundFont built by tools/make_soundbank.py; any other .sf2 also works.
#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_core/juce_core.h>

#include <array>
#include <atomic>
#include <memory>
#include <vector>

namespace mfplug
{

// UI strings are Brazilian Portuguese, written as UTF-8 literals.
inline juce::String pt (const char* utf8) { return juce::String::fromUTF8 (utf8); }

// One playable zone: instrument + preset generators already combined.
struct SampleRegion
{
    int keyLo = 0, keyHi = 127, velLo = 0, velHi = 127;
    juce::uint32 start = 0, end = 0, loopStart = 0, loopEnd = 0;
    double sampleRate = 44100.0;
    int rootKey = 60;
    double tuneCents = 0.0;       // coarse + fine + sample correction
    double scaleTuning = 100.0;   // cents per key
    int loopMode = 0;             // 0 none, 1 continuous, 3 until release
    float attenuationDb = 0.0f;
    float pan = 0.0f;             // -1 .. 1
    float delay = 0, attack = 0, release = 0.01f;   // seconds
    float holdTc = -12000, decayTc = -12000;      // timecents (scaled per key at note-on)
    float holdKeyTc = 0, decayKeyTc = 0;          // keynumToVolEnvHold / Decay (timecents per key)
    float sustainDb = 0.0f;       // attenuation of the sustain level
    float filterCents = 13500.0f, filterQDb = 0.0f;
    int exclusiveClass = 0;
};

struct BankPreset
{
    int bank = 0, program = 0;
    juce::String name;
    std::vector<SampleRegion> regions;
};

class SoundBank
{
public:
    // Parses a .sf2 file. Returns nullptr (and sets error) when the file cannot be used.
    static std::shared_ptr<const SoundBank> load (const juce::File& file, juce::String& error,
                                                  const std::function<bool()>& shouldCancel = {});
    // Shares one copy per file between plugin instances.
    static std::shared_ptr<const SoundBank> loadShared (const juce::File& file, juce::String& error,
                                                        const std::function<bool()>& shouldCancel = {});

    const BankPreset* find (int bank, int program) const;
    const std::vector<BankPreset>& getPresets() const { return presets; }
    const juce::int16* data() const { return samples.data(); }
    size_t numSamples() const { return samples.size(); }
    juce::String getName() const { return name; }
    juce::File getFile() const { return file; }
    bool isDefaultBank() const { return name.startsWith ("MelodyForge ISLAND27"); }

private:
    std::vector<juce::int16> samples;
    std::vector<BankPreset> presets;
    juce::String name;
    juce::File file;
};

// Instrument codes stored per layer: >= 0 is bank * 128 + program, negatives are built-in synths.
namespace instruments
{
    constexpr int builtinSine = -1;
    constexpr int builtin808 = -2;
    constexpr int builtinPluck = -3;

    inline int code (int bank, int program) { return bank * 128 + program; }
    inline int bankOf (int c) { return c / 128; }
    inline int programOf (int c) { return c % 128; }

    // Portuguese names for the General MIDI programs (used for bank 0).
    juce::String gmName (int program);
    // Portuguese name of the General MIDI family (programs in groups of 8).
    juce::String familyName (int program);
    juce::String builtinName (int c);
    std::vector<int> builtins();
    // Display name of an instrument code for the given bank (nullptr = no bank).
    juce::String displayName (int c, const SoundBank* bank);

    // Default instrument per style (melody, bass, chords).
    std::array<int, 3> defaultsForStyle (int style);
} // namespace instruments

class Sampler
{
public:
    static constexpr int numLayers = 3;
    static constexpr int maxVoices = 64;

    Sampler();

    void prepare (double sampleRate);
    void setBank (std::shared_ptr<const SoundBank> b) { std::atomic_store (&pendingBank, std::move (b)); }
    std::shared_ptr<const SoundBank> getBank() const { return std::atomic_load (&pendingBank); }

    // message thread: instrument and level per layer
    std::array<std::atomic<int>, numLayers> instrument;
    std::array<std::atomic<float>, numLayers> layerGain;    // linear
    std::array<std::atomic<float>, numLayers> activity;     // peak of the last block, for the UI

    // audio thread
    void noteOn (int layer, int note, int velocity);
    void noteOff (int layer, int note);
    void allNotesOff (bool immediately);
    void render (juce::AudioBuffer<float>& buffer, int start, int num);
    void renderMidi (juce::AudioBuffer<float>& buffer, const juce::MidiBuffer& midi);   // channels 1..3 = layers
    int activeVoices() const;

private:
    struct Voice
    {
        bool active = false, releasing = false;
        int layer = 0, note = 0;
        juce::uint64 age = 0;
        // sample playback
        const SampleRegion* region = nullptr;
        double pos = 0, step = 0;
        float gainL = 0, gainR = 0;
        // envelope (dB domain after the attack)
        int stage = 0;          // 0 delay, 1 attack, 2 hold, 3 decay, 4 sustain, 5 release
        double stageTime = 0;   // seconds in the current stage
        float env = 0;          // linear amplitude
        float envDb = 0;
        float holdTime = 0, decayTime = 0;
        float velGain = 1.0f;
        // filter (TPT state variable, low-pass) on the mono sample
        bool filterOn = false;
        float a1 = 0, a2 = 0, a3 = 0, ic1 = 0, ic2 = 0;
        // built-in synths
        int builtin = 0;
        double phase = 0, freq = 0, time = 0;
        juce::ADSR adsr;
        std::vector<float> pluck;   // sized in prepare(), never on the audio thread
        int pluckLen = 0, pluckPos = 0;
        float pluckDamp = 0.996f;
    };

    void startSampleVoice (int layer, int note, int velocity, const SampleRegion& r);
    void startBuiltinVoice (int layer, int note, int velocity, int code);
    Voice& allocate();
    void renderVoice (Voice& v, float* left, float* right, int num, float layerLevel);
    float envelopeAfter (Voice& v, double dt);
    static float sampleAt (const juce::int16* data, size_t total, const Voice& v, juce::int64 i);

    std::shared_ptr<const SoundBank> pendingBank;     // set by the loader thread
    std::shared_ptr<const SoundBank> bank;            // used by the audio thread
    std::array<Voice, maxVoices> voices;
    juce::uint64 counter = 0;
    double sr = 44100.0;
    juce::AudioBuffer<float> scratch;
};

} // namespace mfplug
