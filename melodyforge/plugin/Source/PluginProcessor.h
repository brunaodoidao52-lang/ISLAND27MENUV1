#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_basics/juce_audio_basics.h>

#include "MelodyCore.h"
#include "Sampler.h"

#include <mutex>

namespace mfplug
{

// What the audio thread plays: an immutable snapshot of the shown idea.
struct PlaybackData
{
    std::array<std::vector<mf::Note>, mf::NUM_TRACKS> tracks;
    std::array<bool, mf::NUM_TRACKS> enabled { true, true, true };
    int loopTicks = 4 * mf::BAR;
    int bpm = 120;
};

class MelodyForgeProcessor : public juce::AudioProcessor,
                             public juce::ChangeBroadcaster
{
public:
    MelodyForgeProcessor();
    ~MelodyForgeProcessor() override;

    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout();

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout&) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    using AudioProcessor::processBlock;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }
    const juce::String getName() const override { return JucePlugin_Name; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return true; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return "Default"; }
    void changeProgramName (int, const juce::String&) override {}
    void getStateInformation (juce::MemoryBlock&) override;
    void setStateInformation (const void*, int) override;

    // ------------------------------------------------------------------ engine (message thread)
    mf::Settings settings;
    std::vector<mf::Entry> population;
    int current = 0;               // -1 when the shown idea is detached (edited)
    uint32_t sessionSeed = 1;
    int generation = 0;
    mf::Genome genome;
    mf::Pattern pattern;
    std::array<bool, mf::NUM_TRACKS> layerOn { true, true, true };
    int complexity = 5, harmony = 5;   // 1..10 user sliders
    int style = 0, mood = 0;           // presets (see Presets.h)
    bool advancedMode = false;         // beginner (false) or advanced editor layout
    int soloLayer = -1;                // "listen to this layer only" (not saved)

    void newPopulation (uint32_t seed);
    void evolveOnce();
    void like();
    void skip();
    void selectCandidate (int index);
    void setChord (int bar, int degree);
    void rerollLayer (int track);
    void transposeLayer (int track, int semitones);
    void revertEdits();
    void setLayerEnabled (int track, bool on);
    void setTempo (int bpm);                          // keeps edits; used to follow the host tempo
    void applySettings (bool regeneratePopulation);   // after a settings/lock change
    void applySliders();                              // complexity / harmony on the shown idea
    mf::Fitness currentFitness() const { return mf::evaluate (pattern, &genome, settings); }
    bool isEdited() const { return pattern.edited; }

    void setSolo (int track);                         // -1 = all layers
    void setSharp (bool on);                          // "melodias afiadas"
    void setIdeaCount (int count);                    // 4..64 ideas per generation
    void setStyle (int newStyle, bool withInstruments);
    void setMood (int newMood);

    mf::Bytes midiFor (const std::vector<int>& layers) const;
    juce::String fileBaseName() const;
    static juce::String layerName (int track);        // "Melodia", "Baixo", "Acordes"

    // ------------------------------------------------------------------ instruments
    Sampler sampler;
    int instrumentOf (int track) const { return sampler.instrument[(size_t) track].load(); }
    void setInstrument (int track, int code, bool audition = true);
    void applyStyleInstruments();
    void loadBank (const juce::File& file);           // async; empty file = default bank
    std::shared_ptr<const SoundBank> currentBank() const { return sampler.getBank(); }
    enum class BankState { Idle, Loading, Ready, Missing, Failed };
    BankState getBankState() const { return bankState.load(); }
    juce::String getBankMessage() const { std::lock_guard<std::mutex> g (bankLock); return bankMessage; }
    juce::File getUserBankFile() const { return userBank; }
    static juce::File findDefaultBank();
    void audition (int track) { auditionLayer = track; }

    // transport / preview
    std::atomic<bool> internalPlay { false };
    std::atomic<double> hostBpm { 0.0 };
    std::atomic<bool> hostPlaying { false };
    std::atomic<double> playheadTicks { -1.0 };
    bool syncsWithHost() const { return syncParam->load() > 0.5f; }

    juce::AudioProcessorValueTreeState apvts;

private:
    void showGenome (const mf::Genome& g);
    void publish();
    void emitRange (double fromTick, double toTick, double ticksPerSample, int blockSamples,
                    const PlaybackData& data, juce::MidiBuffer& out);
    void allNotesOff (juce::MidiBuffer& out, int sample);

    void startAudition (const PlaybackData& data, juce::MidiBuffer& out);
    void layerGainsFromParams();

    std::shared_ptr<const PlaybackData> playback;   // read with std::atomic_load
    double sampleRate = 44100.0;
    double internalTicks = 0.0;
    double lastTicks = -1.0;
    bool wasPlaying = false;
    std::array<std::array<bool, 128>, mf::NUM_TRACKS> sounding {};
    std::atomic<float>* previewParam = nullptr;
    std::atomic<float>* midiOutParam = nullptr;
    std::atomic<float>* volumeParam = nullptr;
    std::atomic<float>* syncParam = nullptr;
    std::atomic<float>* reverbParam = nullptr;
    std::array<std::atomic<float>*, mf::NUM_TRACKS> layerVolParam {};
    juce::SmoothedValue<float> gain;
    juce::Reverb reverb;
    juce::AudioBuffer<float> wet;
    std::atomic<int> auditionLayer { -1 };
    int auditionSamplesLeft = 0, auditionTrack = -1;
    std::vector<int> auditionNotes;

    // bank loading (background thread); every loaded bank stays alive until destruction so
    // the audio thread never frees one
    struct Loader;
    std::unique_ptr<Loader> loader;
    mutable std::mutex bankLock;
    std::vector<std::shared_ptr<const SoundBank>> keptBanks;
    juce::String bankMessage;
    std::atomic<BankState> bankState { BankState::Idle };
    juce::File userBank;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MelodyForgeProcessor)
};

} // namespace mfplug
