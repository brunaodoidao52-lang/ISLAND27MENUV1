#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_basics/juce_audio_basics.h>

#include "MelodyCore.h"

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

// Very small preview sound (sine + soft envelope) so ideas can be heard without routing MIDI.
class PreviewVoice : public juce::SynthesiserVoice
{
public:
    bool canPlaySound (juce::SynthesiserSound*) override { return true; }
    void startNote (int note, float velocity, juce::SynthesiserSound*, int) override;
    void stopNote (float, bool allowTailOff) override;
    void pitchWheelMoved (int) override {}
    void controllerMoved (int, int) override {}
    void renderNextBlock (juce::AudioBuffer<float>&, int startSample, int numSamples) override;

private:
    double phase = 0, delta = 0;
    float level = 0;
    juce::ADSR adsr;
};

struct PreviewSound : public juce::SynthesiserSound
{
    bool appliesToNote (int) override { return true; }
    bool appliesToChannel (int) override { return true; }
};

class MelodyForgeProcessor : public juce::AudioProcessor,
                             public juce::ChangeBroadcaster
{
public:
    MelodyForgeProcessor();
    ~MelodyForgeProcessor() override = default;

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

    mf::Bytes midiFor (const std::vector<int>& layers) const;
    juce::String fileBaseName() const;

    // transport / preview
    std::atomic<bool> internalPlay { false };
    std::atomic<double> hostBpm { 0.0 };
    std::atomic<bool> hostPlaying { false };
    std::atomic<double> playheadTicks { -1.0 };

    juce::AudioProcessorValueTreeState apvts;

private:
    void showGenome (const mf::Genome& g);
    void publish();
    void emitRange (double fromTick, double toTick, double ticksPerSample, int blockSamples,
                    const PlaybackData& data, juce::MidiBuffer& out);
    void allNotesOff (juce::MidiBuffer& out, int sample);

    std::shared_ptr<const PlaybackData> playback;   // read with std::atomic_load
    juce::Synthesiser synth;
    double sampleRate = 44100.0;
    double internalTicks = 0.0;
    double lastTicks = -1.0;
    bool wasPlaying = false;
    std::array<std::array<bool, 128>, mf::NUM_TRACKS> sounding {};
    std::atomic<float>* previewParam = nullptr;
    std::atomic<float>* midiOutParam = nullptr;
    std::atomic<float>* volumeParam = nullptr;
    juce::SmoothedValue<float> gain;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MelodyForgeProcessor)
};

} // namespace mfplug
