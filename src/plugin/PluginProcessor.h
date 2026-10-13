#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>

#include "core/IslandEQ.h"

namespace island
{

namespace ParamIDs
{
    inline juce::String level (int band) { return "level" + juce::String (band + 1); }
    inline juce::String freq (int band) { return "freq" + juce::String (band + 1); }
    inline juce::String width (int band) { return "width" + juce::String (band + 1); }
    inline juce::String type (int band) { return "type" + juce::String (band + 1); }
    inline juce::String order (int band) { return "order" + juce::String (band + 1); }
    inline juce::String state (int band) { return "state" + juce::String (band + 1); }
    inline const juce::String main { "main" };
    inline const juce::String hq { "hq" };
    inline const juce::String linear { "linear" };
    inline const juce::String monitor { "monitor" };
} // namespace ParamIDs

enum class MonitorMode { Off = 0, Input, Output };

class IslandEQProcessor : public juce::AudioProcessor,
                          private juce::Timer
{
public:
    IslandEQProcessor();
    ~IslandEQProcessor() override;

    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout();

    //==========================================================================
    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    using AudioProcessor::processBlock;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return JucePlugin_Name; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return "Default"; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    //==========================================================================
    // UI helpers (message thread)
    std::array<eq::BandParams, eq::kNumBands> getBandParams() const;
    std::array<eq::BandState, eq::kNumBands> getBandStates() const;
    double getMainGainDb() const;
    double getDisplaySampleRate() const { return currentSampleRate > 0 ? currentSampleRate : 48000.0; }

    void resetBand (int band);
    void resetAll();
    void storeSpare();   // "Store in spare state"
    void flipSpare();    // "Flip with spare state (A/B compare)"
    bool hasSpare() const { return spareState.isValid(); }

    void setParam (const juce::String& id, float plainValue);

    // Spectrum analyzer feed (audio thread pushes, UI pulls)
    int pullAnalyzerSamples (float* dest, int maxSamples);

    juce::AudioProcessorValueTreeState apvts;

private:
    void timerCallback() override;
    void syncEngine (eq::Equalizer& e);
    void updateLatency();
    void rebuildLinearPhaseFir();
    int firLengthFor (double sampleRate) const;
    uint64_t paramsHash() const;
    void pushAnalyzer (const juce::AudioBuffer<float>& buffer);

    struct BandRaw
    {
        std::atomic<float>* level = nullptr;
        std::atomic<float>* freq = nullptr;
        std::atomic<float>* width = nullptr;
        std::atomic<float>* type = nullptr;
        std::atomic<float>* order = nullptr;
        std::atomic<float>* state = nullptr;
    };
    std::array<BandRaw, eq::kNumBands> raw {};
    std::atomic<float>* mainRaw = nullptr;
    std::atomic<float>* hqRaw = nullptr;
    std::atomic<float>* linearRaw = nullptr;
    std::atomic<float>* monitorRaw = nullptr;

    eq::Equalizer engine;   // base rate
    eq::Equalizer engineHQ; // 2x oversampled
    std::unique_ptr<juce::dsp::Oversampling<float>> oversampler;
    juce::dsp::Convolution convolution { juce::dsp::Convolution::NonUniform { 512 } };

    double currentSampleRate = 0.0;
    int currentBlockSize = 512;
    bool lastHQ = false, lastLinear = false;
    std::atomic<int> firLatency { 0 };
    uint64_t lastFirHash = 0;

    juce::ValueTree spareState;

    juce::AbstractFifo analyzerFifo { 1 << 15 };
    std::vector<float> analyzerBuffer = std::vector<float> (1 << 15);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (IslandEQProcessor)
};

} // namespace island
