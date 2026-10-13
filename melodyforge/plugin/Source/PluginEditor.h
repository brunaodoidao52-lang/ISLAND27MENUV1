#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_extra/juce_gui_extra.h>

#include "PluginProcessor.h"
#include "IslandLookAndFeel.h"

namespace mfplug
{

// Read-only view of the idea: chord names per bar and a piano roll of the three layers.
class PatternView : public juce::Component
{
public:
    explicit PatternView (MelodyForgeProcessor& p) : proc (p) {}
    void paint (juce::Graphics&) override;
    int selectedTrack = mf::Melody;

private:
    MelodyForgeProcessor& proc;
};

// A tile the user drags into the DAW (FL Studio piano roll / playlist) to drop a .mid file.
class DragTile : public juce::Component,
                 public juce::SettableTooltipClient
{
public:
    DragTile (MelodyForgeProcessor& p, juce::String label, std::vector<int> layers)
        : proc (p), text (std::move (label)), layerList (std::move (layers)) { setMouseCursor (juce::MouseCursor::DraggingHandCursor); }
    void paint (juce::Graphics&) override;
    void mouseDrag (const juce::MouseEvent&) override;
    void mouseEnter (const juce::MouseEvent&) override { repaint(); }
    void mouseExit (const juce::MouseEvent&) override { repaint(); }

private:
    MelodyForgeProcessor& proc;
    juce::String text;
    std::vector<int> layerList;
    bool dragging = false;
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

private:
    void changeListenerCallback (juce::ChangeBroadcaster*) override { refresh(); }
    void timerCallback() override;
    void refresh();
    void notify (const juce::String& text);
    void exportMidi();
    void buildChordBoxes();
    void applyModeVisibility();
    juce::Label* makeLabel (const juce::String& text);

    MelodyForgeProcessor& proc;
    island::IslandLookAndFeel lnf;
    juce::Image logo;
    juce::TooltipWindow tooltips { this, 600 };

    // header
    juce::Label title, subtitle;
    juce::TextButton beginnerBtn { "Beginner" }, advancedBtn { "Advanced" };
    juce::ComboBox styleBox, moodBox;

    // idea area
    PatternView view;
    juce::OwnedArray<juce::ComboBox> chordBoxes;
    juce::TextButton prevBtn { "<" }, nextBtn { ">" }, playBtn { "Play" };
    juce::Label candidateLabel, statusLabel, fitnessLabel, hintLabel;
    juce::TextButton newBtn { "Generate ideas" }, evolveBtn { "Evolve" }, likeBtn { "Like" }, skipBtn { "Skip" };

    // layers
    std::array<juce::TextButton, mf::NUM_TRACKS> layerToggle;
    std::array<juce::TextButton, mf::NUM_TRACKS> rerollBtn, downBtn, upBtn, viewBtn;
    juce::TextButton revertBtn { "Revert edits" };

    // generator controls
    juce::ComboBox keyBox, scaleBox, progressionBox, barsBox, popBox;
    juce::ToggleButton lockKey { "lock" }, lockScale { "lock" }, lockProgression { "lock" };
    juce::Slider complexitySlider, harmonySlider, volumeSlider;
    juce::TextEditor seedEditor;
    juce::TextButton seedBtn { "Apply seed" };
    juce::ToggleButton previewToggle { "Preview sound" }, midiOutToggle { "Send MIDI out" }, hostTempoToggle { "Follow host tempo" };
    std::unique_ptr<juce::AudioProcessorValueTreeState::ButtonAttachment> previewAtt, midiOutAtt, hostTempoAtt;
    std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> volumeAtt;
    juce::OwnedArray<juce::Label> labels;
    juce::Label keyLabel, scaleLabel, progressionLabel, barsLabel, popLabel, complexityLabel, harmonyLabel, seedLabel, volumeLabel;

    // export
    juce::TextButton exportBtn { "Export MIDI..." };
    DragTile dragAll, dragMelody, dragBass, dragChords;
    juce::Label dragLabel;
    std::unique_ptr<juce::FileChooser> chooser;

    juce::Rectangle<int> headerArea, controlsArea, exportArea, ideaArea;
    juce::String lastChordKey;
    int notifyTicks = 0;
    bool updating = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MelodyForgeEditor)
};

} // namespace mfplug
