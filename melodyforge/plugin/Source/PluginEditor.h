#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_extra/juce_gui_extra.h>

#include "PluginProcessor.h"
#include "NeonLookAndFeel.h"

namespace mfplug
{

// Small vector icons (no font glyphs needed).
enum class Icon { None, Play, Stop, Prev, Next, Heart, Skip, Dice, Spark, Evolve, FullScreen, ExitFullScreen, Headphones, Download, Folder };
void drawIcon (juce::Graphics&, Icon, juce::Rectangle<float>, juce::Colour);

// Rounded neon button with an icon and a label.
class IconButton : public juce::TextButton
{
public:
    IconButton (const juce::String& text = {}, Icon i = Icon::None) : juce::TextButton (text), icon (i) {}
    void setIcon (Icon i) { icon = i; repaint(); }
    void paintButton (juce::Graphics&, bool highlighted, bool down) override;
    bool pulse = false;   // glows rhythmically (e.g. while playing)
    float pulsePhase = 0.0f;

private:
    Icon icon;
};

// Piano roll of the three layers with chord names; notes light up under the playhead.
class PatternView : public juce::Component,
                    public juce::SettableTooltipClient
{
public:
    explicit PatternView (MelodyForgeProcessor& p) : proc (p) {}
    void paint (juce::Graphics&) override;
    void mouseUp (const juce::MouseEvent&) override { if (onClick) onClick(); }
    std::function<void()> onClick;
    int selectedTrack = -1;   // -1 = all layers equally bright

private:
    MelodyForgeProcessor& proc;
};

// A tile the user drags into the DAW (FL Studio piano roll / playlist) to drop a .mid file.
class DragTile : public juce::Component,
                 public juce::SettableTooltipClient
{
public:
    DragTile (MelodyForgeProcessor& p, juce::String label, std::vector<int> layers, juce::Colour c)
        : proc (p), text (std::move (label)), layerList (std::move (layers)), colour (c) { setMouseCursor (juce::MouseCursor::DraggingHandCursor); }
    void paint (juce::Graphics&) override;
    void mouseDrag (const juce::MouseEvent&) override;
    void mouseEnter (const juce::MouseEvent&) override { repaint(); }
    void mouseExit (const juce::MouseEvent&) override { repaint(); }
    std::function<void()> onDragged;

private:
    MelodyForgeProcessor& proc;
    juce::String text;
    std::vector<int> layerList;
    juce::Colour colour;
    bool dragging = false;
};

// One card per layer: illustration + what it is (beginner), instrument, volume and actions.
class LayerCard : public juce::Component
{
public:
    LayerCard (MelodyForgeProcessor&, int track, NeonLookAndFeel&);
    void paint (juce::Graphics&) override;
    void resized() override;
    void refresh (bool advanced);
    void rebuildInstruments();
    void setActivity (float a) { if (std::abs (a - activity) > 0.01f) { activity = a; repaint (illustration.toNearestInt().expanded (8)); repaint (getLocalBounds().removeFromTop (4)); } }
    void tick (float phase) { animPhase = phase; if (activity > 0.02f) repaint (illustration.toNearestInt().expanded (8)); }
    std::function<void (const juce::String&)> onNotify;
    std::function<void (int)> onView;

    juce::ToggleButton onOff;
    juce::TextButton soloBtn, rerollBtn, downBtn { "-1" }, upBtn { "+1" }, viewBtn;
    juce::ComboBox instrumentBox;
    juce::Slider volume;

private:
    void drawIllustration (juce::Graphics&, juce::Rectangle<float>);

    MelodyForgeProcessor& proc;
    NeonLookAndFeel& lnf;
    const int track;
    std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> volumeAtt;
    juce::Rectangle<float> illustration;
    const SoundBank* builtFor = nullptr;
    MelodyForgeProcessor::BankState builtState = MelodyForgeProcessor::BankState::Idle;
    bool advanced = false;
    float activity = 0.0f, animPhase = 0.0f;
    bool updating = false;
};

class MelodyForgeEditor : public juce::AudioProcessorEditor,
                          public juce::DragAndDropContainer,
                          private juce::ChangeListener,
                          private juce::Timer
{
public:
    explicit MelodyForgeEditor (MelodyForgeProcessor&);
    ~MelodyForgeEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;
    void toggleFullScreen();
    bool isFullScreenMode() const { return fullScreen; }

    static constexpr int designWidth = 1120, designHeight = 720;

private:
    // Everything lives in this component; it is scaled so text grows with the window.
    struct Content : public juce::Component
    {
        std::function<void()> onResize;
        std::function<void (juce::Graphics&)> onPaint;
        void resized() override { if (onResize) onResize(); }
        void paint (juce::Graphics& g) override { if (onPaint) onPaint (g); }
    };

    void changeListenerCallback (juce::ChangeBroadcaster*) override { refresh(); }
    void timerCallback() override;
    void refresh();
    void layout();
    void paintContent (juce::Graphics&);
    void notify (const juce::String& text);
    void exportMidi();
    void buildChordBoxes();
    void applyModeVisibility();
    void markStep (int step);
    juce::Label& makeLabel (juce::Label&, const juce::String& text);

    MelodyForgeProcessor& proc;
    NeonLookAndFeel lnf;
    Content content;
    juce::Image logo;
    juce::TooltipWindow tooltips { this, 500 };

    // header
    juce::Label title, subtitle, styleLabel, moodLabel;
    juce::TextButton beginnerBtn, advancedBtn;
    IconButton fullBtn { {}, Icon::FullScreen };
    juce::ComboBox styleBox, moodBox;

    // guide / hint
    juce::Label hintLabel;
    std::array<juce::Rectangle<float>, 4> stepAreas;
    std::array<bool, 4> stepDone { false, false, false, false };

    // idea area
    PatternView view;
    juce::OwnedArray<juce::ComboBox> chordBoxes;
    IconButton prevBtn { {}, Icon::Prev }, nextBtn { {}, Icon::Next }, playBtn { {}, Icon::Play };
    IconButton newBtn { {}, Icon::Spark }, evolveBtn { {}, Icon::Evolve }, likeBtn { {}, Icon::Heart }, skipBtn { {}, Icon::Skip };
    juce::Label candidateLabel, statusLabel, fitnessLabel;
    juce::TextButton revertBtn;

    // layers
    std::unique_ptr<LayerCard> cards[mf::NUM_TRACKS];

    // side panel
    juce::ComboBox keyBox, scaleBox, progressionBox, barsBox, popBox;
    juce::ToggleButton lockKey, lockScale, lockProgression;
    juce::Slider complexitySlider, harmonySlider, volumeSlider, reverbSlider;
    juce::TextEditor seedEditor;
    juce::TextButton seedBtn;
    juce::ToggleButton syncToggle, previewToggle, midiOutToggle, hostTempoToggle;
    IconButton loadBankBtn { {}, Icon::Folder };
    juce::TextButton defaultBankBtn;
    juce::Label bankLabel;
    std::unique_ptr<juce::AudioProcessorValueTreeState::ButtonAttachment> syncAtt, previewAtt, midiOutAtt, hostTempoAtt;
    std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> volumeAtt, reverbAtt;
    juce::Label keyLabel, scaleLabel, progressionLabel, barsLabel, popLabel, complexityLabel, harmonyLabel, seedLabel, volumeLabel, reverbLabel;

    // export
    IconButton exportBtn { {}, Icon::Download };
    std::unique_ptr<DragTile> dragAll, dragMelody, dragBass, dragChords;
    juce::Label dragLabel;
    std::unique_ptr<juce::FileChooser> chooser;

    juce::Rectangle<int> headerArea, guideArea, sideArea, exportArea, ideaArea, cardsArea;
    juce::String lastChordKey;
    juce::Rectangle<int> normalBounds;
    bool fullScreen = false;
    int notifyTicks = 0;
    int lastBankState = -1;
    float phase = 0.0f;
    std::array<float, mf::NUM_TRACKS> activity {};
    bool updating = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MelodyForgeEditor)
};

} // namespace mfplug
