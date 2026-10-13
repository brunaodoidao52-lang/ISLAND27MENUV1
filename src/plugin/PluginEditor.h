#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>

#include "PluginProcessor.h"
#include "IslandLookAndFeel.h"

namespace island
{

juce::Colour bandColour (int band);

//==============================================================================
// Frequency-response display with draggable band tokens and spectrum analyzer.
class EqCurveView : public juce::Component,
                    private juce::Timer
{
public:
    explicit EqCurveView (IslandEQProcessor&);
    ~EqCurveView() override;

    void paint (juce::Graphics&) override;
    void resized() override;

    void mouseMove (const juce::MouseEvent&) override;
    void mouseExit (const juce::MouseEvent&) override;
    void mouseDown (const juce::MouseEvent&) override;
    void mouseDrag (const juce::MouseEvent&) override;
    void mouseUp (const juce::MouseEvent&) override;
    void mouseDoubleClick (const juce::MouseEvent&) override;
    void mouseWheelMove (const juce::MouseEvent&, const juce::MouseWheelDetails&) override;

    std::function<void (int)> onBandSelected;

private:
    void timerCallback() override;
    void updateAnalyzer();

    float xForFreq (double hz) const;
    double freqForX (float x) const;
    float yForDb (double db) const;
    double dbForY (float y) const;
    juce::Point<float> tokenPosition (int band) const;
    int bandAt (juce::Point<float> p) const;
    void showBandMenu (int band);

    IslandEQProcessor& processor;
    juce::Rectangle<float> plot;

    int hoverBand = -1, dragBand = -1, selectedBand = -1;
    juce::String dragTooltip;

    // analyzer
    static constexpr int fftOrder = 12;
    static constexpr int fftSize = 1 << fftOrder;
    juce::dsp::FFT fft { fftOrder };
    juce::dsp::WindowingFunction<float> window { (size_t) fftSize, juce::dsp::WindowingFunction<float>::hann };
    std::vector<float> ring = std::vector<float> ((size_t) fftSize, 0.0f);
    int ringPos = 0;
    std::vector<float> fftData = std::vector<float> ((size_t) fftSize * 2, 0.0f);
    std::vector<float> spectrumDb = std::vector<float> ((size_t) fftSize / 2, -120.0f);
    std::vector<float> scratch = std::vector<float> (1 << 15);
};

//==============================================================================
// One column of controls for a band.
class BandStrip : public juce::Component
{
public:
    BandStrip (IslandEQProcessor&, int band);
    void resized() override;
    void paint (juce::Graphics&) override;
    void setSelected (bool s) { selected = s; repaint(); }

private:
    using SliderAttachment = juce::AudioProcessorValueTreeState::SliderAttachment;
    using ComboAttachment = juce::AudioProcessorValueTreeState::ComboBoxAttachment;

    int band;
    bool selected = false;
    juce::Label title;
    juce::ComboBox type, order, state;
    juce::Slider freq, width, level;
    std::unique_ptr<ComboAttachment> typeAtt, orderAtt, stateAtt;
    std::unique_ptr<SliderAttachment> freqAtt, widthAtt, levelAtt;
};

//==============================================================================
class IslandEQEditor : public juce::AudioProcessorEditor
{
public:
    explicit IslandEQEditor (IslandEQProcessor&);
    ~IslandEQEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    IslandEQProcessor& proc;
    IslandLookAndFeel lnf;
    juce::Image logo, banner;
    juce::Rectangle<int> headerArea;
    juce::TooltipWindow tooltips { this, 600 };

    juce::Label titleLabel;
    juce::TextButton hqButton { "HQ" }, linearButton { "LIN" };
    juce::TextButton storeButton { "Store" }, flipButton { "A/B" }, resetButton { "Reset" };
    juce::ComboBox monitorBox;
    juce::Slider mainLevel;
    juce::Label mainLabel;

    std::unique_ptr<juce::AudioProcessorValueTreeState::ButtonAttachment> hqAtt, linearAtt;
    std::unique_ptr<juce::AudioProcessorValueTreeState::ComboBoxAttachment> monitorAtt;
    std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> mainAtt;

    EqCurveView curve;
    std::array<std::unique_ptr<BandStrip>, eq::kNumBands> strips;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (IslandEQEditor)
};

} // namespace island
