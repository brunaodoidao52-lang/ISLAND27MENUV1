#include "PluginEditor.h"
#include "Presets.h"

namespace mfplug
{

using island::Brand::background;
namespace B = island::Brand;

static const juce::Colour trackColours[mf::NUM_TRACKS] = { juce::Colour (0xff7fe3ff), juce::Colour (0xff2aa9e0), juce::Colour (0xff4dc0f0) };

// ============================================================================ pattern view
void PatternView::paint (juce::Graphics& g)
{
    auto r = getLocalBounds().toFloat();
    g.setColour (juce::Colour (0xff0c0e13));
    g.fillRoundedRectangle (r, 10.0f);
    g.setColour (B::border);
    g.drawRoundedRectangle (r.reduced (0.5f), 10.0f, 1.0f);

    const auto& p = proc.pattern;
    if (p.bars <= 0) return;
    auto area = r.reduced (8.0f);
    auto chordStrip = area.removeFromTop (20.0f);
    const float totalTicks = (float) (p.bars * mf::BAR);

    int lo = 127, hi = 0;
    for (const auto& tr : p.tracks)
        for (const auto& n : tr) { lo = std::min (lo, n.pitch); hi = std::max (hi, n.pitch); }
    if (lo > hi) { lo = 48; hi = 84; }
    lo -= 2; hi += 2;
    const float rowH = area.getHeight() / (float) (hi - lo + 1);
    auto xOf = [&] (int tick) { return area.getX() + area.getWidth() * (float) tick / totalTicks; };

    // grid
    for (int bar = 0; bar <= p.bars; ++bar)
    {
        for (int beat = 0; beat < (bar < p.bars ? 4 : 1); ++beat)
        {
            float x = xOf (bar * mf::BAR + beat * mf::PPQ);
            g.setColour (beat == 0 ? B::accent.withAlpha (0.35f) : juce::Colours::white.withAlpha (0.06f));
            g.drawVerticalLine ((int) x, area.getY(), area.getBottom());
        }
    }
    for (int pitch = lo; pitch <= hi; ++pitch)
        if (mf::mod12 (pitch) == 0)
        {
            float y = area.getBottom() - (pitch - lo + 1) * rowH;
            g.setColour (juce::Colours::white.withAlpha (0.08f));
            g.drawHorizontalLine ((int) (y + rowH), area.getX(), area.getRight());
            g.setColour (B::muted);
            g.setFont (10.0f);
            g.drawText ("C" + juce::String (pitch / 12 - 1), juce::Rectangle<float> (area.getX() + 2, y, 30, rowH + 2), juce::Justification::left);
        }

    // chord names
    g.setFont (juce::Font (13.0f, juce::Font::bold));
    for (int bar = 0; bar < (int) p.chords.size(); ++bar)
    {
        juce::Rectangle<float> cell (xOf (bar * mf::BAR) + 4, chordStrip.getY(), area.getWidth() / p.bars - 8, chordStrip.getHeight());
        g.setColour (B::accent);
        g.drawText (p.chords[(size_t) bar].name, cell, juce::Justification::centredLeft);
    }

    // notes: other layers dimmed, selected layer on top
    auto drawTrack = [&] (int t, bool focus)
    {
        if (! proc.layerOn[(size_t) t]) return;
        for (const auto& n : p.tracks[(size_t) t])
        {
            float x = xOf (n.start), w = std::max (3.0f, xOf (n.start + n.length) - x - 1.0f);
            float y = area.getBottom() - (n.pitch - lo + 1) * rowH;
            g.setColour (trackColours[t].withAlpha (focus ? 0.45f + 0.55f * n.velocity / 127.0f : 0.22f));
            g.fillRoundedRectangle (x, y + 1, w, std::max (2.0f, rowH - 2), 2.0f);
        }
    };
    for (int t = 0; t < mf::NUM_TRACKS; ++t) if (t != selectedTrack) drawTrack (t, false);
    drawTrack (selectedTrack, true);

    double ph = proc.playheadTicks.load();
    if (ph >= 0)
    {
        g.setColour (B::text);
        g.fillRect (xOf ((int) ph), area.getY(), 2.0f, area.getHeight());
    }
}

// ============================================================================ drag tile
void DragTile::paint (juce::Graphics& g)
{
    auto r = getLocalBounds().toFloat().reduced (1.0f);
    bool over = isMouseOver();
    g.setColour (over ? B::primary.withAlpha (0.18f) : B::panelRaised);
    g.fillRoundedRectangle (r, 10.0f);
    g.setColour (over ? B::accent : B::borderStrong);
    g.drawRoundedRectangle (r, 10.0f, 1.0f);
    g.setColour (over ? B::accent : B::text);
    g.setFont (juce::Font (13.0f, juce::Font::bold));
    auto textW = (float) g.getCurrentFont().getStringWidth (text);
    auto cx = r.getCentreX() - textW / 2.0f - 10.0f, cy = r.getCentreY();
    juce::Path arrow;   // small "drag out" arrow drawn as a path (no font glyph needed)
    arrow.startNewSubPath (cx - 5.0f, cy - 5.0f);
    arrow.lineTo (cx + 4.0f, cy + 4.0f);
    arrow.startNewSubPath (cx + 4.0f, cy - 1.0f);
    arrow.lineTo (cx + 4.0f, cy + 4.0f);
    arrow.lineTo (cx - 1.0f, cy + 4.0f);
    g.strokePath (arrow, juce::PathStrokeType (1.6f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
    g.drawText (text, getLocalBounds().withTrimmedLeft (12), juce::Justification::centred);
}

void DragTile::mouseDrag (const juce::MouseEvent& e)
{
    if (dragging || e.getDistanceFromDragStart() < 6) return;
    auto* container = juce::DragAndDropContainer::findParentDragContainerFor (this);
    if (container == nullptr) return;
    auto dir = juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile ("MelodyForge-ISLAND27");
    dir.createDirectory();
    juce::String suffix = layerList.size() == 1 ? juce::String ("-") + mf::trackId (layerList[0]) : juce::String();
    auto file = dir.getChildFile (proc.fileBaseName() + suffix + ".mid");
    auto bytes = proc.midiFor (layerList);
    file.replaceWithData (bytes.data(), bytes.size());
    dragging = true;
    juce::DragAndDropContainer::performExternalDragDropOfFiles ({ file.getFullPathName() }, false, this,
                                                                [this] { dragging = false; });
}

// ============================================================================ editor
juce::Label* MelodyForgeEditor::makeLabel (const juce::String& text)
{
    auto* l = labels.add (new juce::Label ({}, text));
    l->setColour (juce::Label::textColourId, B::muted);
    l->setFont (lnf.bodyFont (12.5f));
    addAndMakeVisible (l);
    return l;
}

MelodyForgeEditor::MelodyForgeEditor (MelodyForgeProcessor& p)
    : AudioProcessorEditor (&p), proc (p), view (p),
      dragAll (p, "All layers", { mf::Melody, mf::Bass, mf::Chords }),
      dragMelody (p, "Melody", { mf::Melody }), dragBass (p, "Bass", { mf::Bass }), dragChords (p, "Chords", { mf::Chords })
{
    setLookAndFeel (&lnf);
    logo = juce::ImageCache::getFromMemory (IslandAssets::logo_png, IslandAssets::logo_pngSize);

    title.setText ("MELODYFORGE", juce::dontSendNotification);
    title.setFont (lnf.headingFont (24.0f));
    title.setColour (juce::Label::textColourId, B::text);
    subtitle.setText ("Idea generator  -  MIDI export", juce::dontSendNotification);
    subtitle.setFont (lnf.bodyFont (13.0f));
    subtitle.setColour (juce::Label::textColourId, B::accent);
    for (auto* c : { &title, &subtitle }) addAndMakeVisible (c);

    // style / mood / mode
    for (size_t i = 0; i < presets::styles().size(); ++i) styleBox.addItem (presets::styles()[i].name, (int) i + 1);
    for (size_t i = 0; i < presets::moods().size(); ++i) moodBox.addItem (presets::moods()[i].name, (int) i + 1);
    styleBox.setTooltip ("Style preset: tempo range, rhythm and harmony targets");
    moodBox.setTooltip ("Mood preset: scale, melody shape and energy");
    styleBox.onChange = [this]
    {
        if (updating) return;
        proc.style = styleBox.getSelectedItemIndex();
        presets::apply (proc.settings, proc.style, proc.mood);
        proc.applySettings (true);
        notify ("Style: " + styleBox.getText());
    };
    moodBox.onChange = [this]
    {
        if (updating) return;
        proc.mood = moodBox.getSelectedItemIndex();
        presets::apply (proc.settings, proc.style, proc.mood);
        proc.applySettings (true);
        notify ("Mood: " + moodBox.getText());
    };
    for (auto* b : { &beginnerBtn, &advancedBtn })
    {
        b->setClickingTogglesState (false);
        addAndMakeVisible (b);
    }
    beginnerBtn.onClick = [this] { proc.advancedMode = false; applyModeVisibility(); };
    advancedBtn.onClick = [this] { proc.advancedMode = true; applyModeVisibility(); };
    for (auto* c : { &styleBox, &moodBox }) addAndMakeVisible (c);

    // idea area
    addAndMakeVisible (view);
    candidateLabel.setJustificationType (juce::Justification::centred);
    candidateLabel.setFont (lnf.bodyFont (13.0f, true));
    statusLabel.setFont (lnf.bodyFont (12.5f));
    statusLabel.setColour (juce::Label::textColourId, B::accent);
    fitnessLabel.setFont (lnf.bodyFont (12.5f));
    fitnessLabel.setColour (juce::Label::textColourId, B::muted);
    fitnessLabel.setJustificationType (juce::Justification::centredRight);
    hintLabel.setFont (lnf.bodyFont (12.5f));
    hintLabel.setColour (juce::Label::textColourId, B::muted);
    hintLabel.setJustificationType (juce::Justification::centredLeft);
    for (auto* c : { &candidateLabel, &statusLabel, &fitnessLabel, &hintLabel }) addAndMakeVisible (c);

    prevBtn.setTooltip ("Previous candidate");
    nextBtn.setTooltip ("Next candidate");
    playBtn.setTooltip ("Preview the idea (when the DAW is stopped)");
    newBtn.setTooltip ("Generate a new set of candidate ideas");
    evolveBtn.setTooltip ("Breed the next generation from the best candidates");
    likeBtn.setTooltip ("Favour this idea in the next generations");
    skipBtn.setTooltip ("Penalise this idea and show the next candidate");
    for (auto* b : { &prevBtn, &nextBtn, &playBtn, &newBtn, &evolveBtn, &likeBtn, &skipBtn }) addAndMakeVisible (b);
    newBtn.setToggleState (true, juce::dontSendNotification);   // primary action look
    prevBtn.onClick = [this] { proc.selectCandidate (proc.current <= 0 ? (int) proc.population.size() - 1 : proc.current - 1); };
    nextBtn.onClick = [this] { proc.selectCandidate ((proc.current + 1) % (int) proc.population.size()); };
    playBtn.onClick = [this] { proc.internalPlay = ! proc.internalPlay.load(); refresh(); };
    newBtn.onClick = [this]
    {
        proc.newPopulation ((uint32_t) juce::Random::getSystemRandom().nextInt());
        notify ("New ideas - seed " + juce::String ((juce::int64) proc.sessionSeed));
    };
    evolveBtn.onClick = [this] { proc.evolveOnce(); notify ("Generation " + juce::String (proc.generation)); };
    likeBtn.onClick = [this] { proc.like(); notify ("Liked - this idea will be favoured"); };
    skipBtn.onClick = [this] { proc.skip(); notify ("Skipped"); };

    // layers
    for (int t = 0; t < mf::NUM_TRACKS; ++t)
    {
        auto& tog = layerToggle[(size_t) t];
        tog.setButtonText (mf::trackName (t));
        tog.setClickingTogglesState (true);
        tog.setTooltip ("Play / export this layer");
        tog.onClick = [this, t] { proc.setLayerEnabled (t, layerToggle[(size_t) t].getToggleState()); };
        auto& view_ = viewBtn[(size_t) t];
        view_.setButtonText ("view");
        view_.setTooltip ("Highlight this layer in the piano roll");
        view_.onClick = [this, t] { view.selectedTrack = t; refresh(); };
        rerollBtn[(size_t) t].setButtonText ("New variation");
        rerollBtn[(size_t) t].setTooltip ("Re-roll only this layer");
        rerollBtn[(size_t) t].onClick = [this, t] { proc.rerollLayer (t); notify (juce::String ("New ") + mf::trackId (t) + " variation"); };
        downBtn[(size_t) t].setButtonText ("-1");
        upBtn[(size_t) t].setButtonText ("+1");
        downBtn[(size_t) t].setTooltip ("Transpose this layer down a semitone");
        upBtn[(size_t) t].setTooltip ("Transpose this layer up a semitone");
        downBtn[(size_t) t].onClick = [this, t] { proc.transposeLayer (t, -1); };
        upBtn[(size_t) t].onClick = [this, t] { proc.transposeLayer (t, 1); };
        for (auto* b : { &tog, &view_, &rerollBtn[(size_t) t], &downBtn[(size_t) t], &upBtn[(size_t) t] }) addAndMakeVisible (b);
    }
    revertBtn.onClick = [this] { proc.revertEdits(); notify ("Edits discarded"); };
    addAndMakeVisible (revertBtn);

    // generator controls
    keyBox.addItem ("Any key", 100);
    for (int k = 0; k < 12; ++k) keyBox.addItem (mf::noteNameOf (k), k + 1);
    for (size_t i = 0; i < mf::scales().size(); ++i) scaleBox.addItem (mf::scales()[i].name, (int) i + 1);
    for (size_t i = 0; i < mf::progressions().size(); ++i) progressionBox.addItem (mf::progressions()[i].name, (int) i + 1);
    for (int b : { 1, 2, 4, 8 }) barsBox.addItem (juce::String (b) + (b == 1 ? " bar" : " bars"), b);
    for (int n : { 4, 8, 12, 16, 24, 32 }) popBox.addItem (juce::String (n) + " candidates", n);
    auto lockChange = [this]
    {
        if (updating) return;
        proc.settings.key = juce::jmax (0, keyBox.getSelectedId() - 1);
        proc.settings.scale = scaleBox.getSelectedItemIndex();
        proc.settings.progression = progressionBox.getSelectedItemIndex();
        proc.settings.lockKey = lockKey.getToggleState();
        proc.settings.lockScale = lockScale.getToggleState();
        proc.settings.lockProgression = lockProgression.getToggleState();
        proc.applySettings (false);
    };
    keyBox.onChange = [this, lockChange]
    {
        if (updating) return;
        lockKey.setToggleState (keyBox.getSelectedId() != 100, juce::dontSendNotification);   // "Any key" unlocks
        lockChange();
    };
    scaleBox.onChange = [this, lockChange] { if (! updating) { lockScale.setToggleState (true, juce::dontSendNotification); lockChange(); } };
    progressionBox.onChange = [this, lockChange] { if (! updating) { lockProgression.setToggleState (true, juce::dontSendNotification); lockChange(); } };
    for (auto* l : { &lockKey, &lockScale, &lockProgression }) { l->onClick = lockChange; l->setTooltip ("Keep this fixed while evolving"); }
    barsBox.onChange = [this]
    {
        if (updating) return;
        proc.settings.bars = barsBox.getSelectedId();
        proc.applySettings (false);
    };
    popBox.onChange = [this]
    {
        if (updating) return;
        proc.settings.populationSize = popBox.getSelectedId();
        proc.applySettings (true);
    };
    for (auto* s : { &complexitySlider, &harmonySlider })
    {
        s->setSliderStyle (juce::Slider::LinearHorizontal);
        s->setRange (1, 10, 1);
        s->setTextBoxStyle (juce::Slider::TextBoxRight, false, 30, 18);
        addAndMakeVisible (s);
    }
    complexitySlider.setTooltip ("Melodic complexity: more notes and more leaps");
    harmonySlider.setTooltip ("Harmonic density: richer chords (sevenths)");
    complexitySlider.onValueChange = [this] { if (! updating) { proc.complexity = (int) complexitySlider.getValue(); proc.applySliders(); } };
    harmonySlider.onValueChange = [this] { if (! updating) { proc.harmony = (int) harmonySlider.getValue(); proc.applySliders(); } };
    volumeSlider.setSliderStyle (juce::Slider::LinearHorizontal);
    volumeSlider.setTextBoxStyle (juce::Slider::TextBoxRight, false, 52, 18);
    volumeSlider.setTextValueSuffix (" dB");
    seedEditor.setInputRestrictions (10, "0123456789");
    seedEditor.setTooltip ("Same seed + same settings = same ideas");
    seedBtn.onClick = [this]
    {
        auto v = seedEditor.getText().getLargeIntValue();
        proc.newPopulation ((uint32_t) v);
        notify ("Ideas from seed " + juce::String ((juce::int64) proc.sessionSeed));
    };
    for (auto* c : std::initializer_list<juce::Component*> { &keyBox, &scaleBox, &progressionBox, &barsBox, &popBox, &lockKey, &lockScale,
                                                              &lockProgression, &volumeSlider, &seedEditor, &seedBtn, &previewToggle,
                                                              &midiOutToggle, &hostTempoToggle })
        addAndMakeVisible (c);
    previewAtt = std::make_unique<juce::AudioProcessorValueTreeState::ButtonAttachment> (proc.apvts, "preview", previewToggle);
    midiOutAtt = std::make_unique<juce::AudioProcessorValueTreeState::ButtonAttachment> (proc.apvts, "midiOut", midiOutToggle);
    hostTempoAtt = std::make_unique<juce::AudioProcessorValueTreeState::ButtonAttachment> (proc.apvts, "hostTempo", hostTempoToggle);
    volumeAtt = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment> (proc.apvts, "volume", volumeSlider);
    previewToggle.setTooltip ("Built-in preview sound (simple sine)");
    midiOutToggle.setTooltip ("Send the notes as MIDI to the DAW while it plays");
    hostTempoToggle.setTooltip ("Use the project tempo for playback and exported files");

    struct L { juce::Label* l; const char* t; };
    for (auto x : { L { &keyLabel, "Key" }, L { &scaleLabel, "Scale" }, L { &progressionLabel, "Progression" }, L { &barsLabel, "Length" },
                    L { &popLabel, "Candidates" }, L { &complexityLabel, "Complexity" }, L { &harmonyLabel, "Harmony" },
                    L { &seedLabel, "Seed" }, L { &volumeLabel, "Volume" } })
    {
        x.l->setText (x.t, juce::dontSendNotification);
        x.l->setColour (juce::Label::textColourId, B::muted);
        x.l->setFont (lnf.bodyFont (12.5f));
        addAndMakeVisible (x.l);
    }

    // export
    exportBtn.setTooltip ("Save the idea as a .mid file");
    exportBtn.onClick = [this] { exportMidi(); };
    dragLabel.setText ("Drag into FL Studio:", juce::dontSendNotification);
    dragLabel.setFont (lnf.bodyFont (12.5f, true));
    dragLabel.setColour (juce::Label::textColourId, B::textSoft);
    for (auto* c : std::initializer_list<juce::Component*> { &exportBtn, &dragLabel, &dragAll, &dragMelody, &dragBass, &dragChords })
        addAndMakeVisible (c);
    for (auto* t : { &dragAll, &dragMelody, &dragBass, &dragChords }) t->setTooltip ("Drag this onto the piano roll or playlist");

    proc.addChangeListener (this);
    setResizable (true, true);
    setResizeLimits (900, 620, 1600, 1100);
    setSize (1040, 700);
    refresh();
    applyModeVisibility();
    startTimerHz (30);
}

MelodyForgeEditor::~MelodyForgeEditor()
{
    proc.removeChangeListener (this);
    setLookAndFeel (nullptr);
}

void MelodyForgeEditor::notify (const juce::String& text)
{
    statusLabel.setText (text, juce::dontSendNotification);
    notifyTicks = 90;
}

void MelodyForgeEditor::buildChordBoxes()
{
    const auto& p = proc.pattern;
    juce::String key;
    key << proc.genome.key << "/" << proc.genome.scale << "/" << p.bars;
    if (key != lastChordKey)
    {
        lastChordKey = key;
        chordBoxes.clear();
        for (int bar = 0; bar < p.bars; ++bar)
        {
            auto* box = chordBoxes.add (new juce::ComboBox());
            for (int d = 0; d < 7; ++d)
                box->addItem (juce::String (bar + 1) + ": " + mf::chordName (proc.genome.key, proc.genome.scale, d), d + 1);
            box->setTooltip ("Chord of bar " + juce::String (bar + 1));
            box->onChange = [this, bar, box]
            {
                if (updating) return;
                proc.setChord (bar, box->getSelectedItemIndex());
                notify ("Bar " + juce::String (bar + 1) + " chord changed");
            };
            addChildComponent (box);
        }
        resized();
    }
    for (int bar = 0; bar < (int) chordBoxes.size() && bar < (int) p.chords.size(); ++bar)
        chordBoxes[bar]->setSelectedItemIndex (p.chords[(size_t) bar].degree, juce::dontSendNotification);
    applyModeVisibility();
}

void MelodyForgeEditor::refresh()
{
    juce::ScopedValueSetter<bool> guard (updating, true);
    const auto& p = proc.pattern;
    candidateLabel.setText (proc.current >= 0 ? "Idea " + juce::String (proc.current + 1) + " / " + juce::String ((int) proc.population.size())
                                              : juce::String (proc.isEdited() ? "Edited idea" : "Idea"),
                            juce::dontSendNotification);
    auto f = proc.currentFitness();
    juce::String info;
    info << mf::noteNameOf (p.key) << " " << mf::scales()[(size_t) p.scale].name << "  -  " << p.bpm << " BPM  -  score "
         << juce::roundToInt (f.total * 100.0) << "  (melody " << juce::roundToInt (f.melodic * 100.0) << " / harmony "
         << juce::roundToInt (f.harmonic * 100.0) << " / rhythm " << juce::roundToInt (f.rhythmic * 100.0) << ")  -  gen " << proc.generation;
    fitnessLabel.setText (info, juce::dontSendNotification);
    playBtn.setButtonText (proc.internalPlay.load() ? "Stop" : "Play");
    playBtn.setToggleState (proc.internalPlay.load(), juce::dontSendNotification);
    for (int t = 0; t < mf::NUM_TRACKS; ++t)
    {
        layerToggle[(size_t) t].setToggleState (proc.layerOn[(size_t) t], juce::dontSendNotification);
        viewBtn[(size_t) t].setToggleState (view.selectedTrack == t, juce::dontSendNotification);
    }
    revertBtn.setEnabled (proc.isEdited());
    keyBox.setSelectedId (proc.settings.lockKey ? proc.settings.key + 1 : 100, juce::dontSendNotification);
    scaleBox.setSelectedItemIndex (proc.settings.lockScale ? proc.settings.scale : proc.genome.scale, juce::dontSendNotification);
    progressionBox.setSelectedItemIndex (proc.settings.lockProgression ? proc.settings.progression : proc.genome.progression, juce::dontSendNotification);
    lockKey.setToggleState (proc.settings.lockKey, juce::dontSendNotification);
    lockScale.setToggleState (proc.settings.lockScale, juce::dontSendNotification);
    lockProgression.setToggleState (proc.settings.lockProgression, juce::dontSendNotification);
    barsBox.setSelectedId (proc.settings.bars, juce::dontSendNotification);
    popBox.setSelectedId (proc.settings.populationSize, juce::dontSendNotification);
    complexitySlider.setValue (proc.complexity, juce::dontSendNotification);
    harmonySlider.setValue (proc.harmony, juce::dontSendNotification);
    if (! seedEditor.hasKeyboardFocus (true)) seedEditor.setText (juce::String ((juce::int64) proc.sessionSeed), false);
    styleBox.setSelectedItemIndex (proc.style, juce::dontSendNotification);
    {
        juce::String hint = juce::String (presets::styles()[(size_t) proc.style].hint) + "  -  " + presets::moods()[(size_t) proc.mood].hint;
        if (! proc.advancedMode)
            hint = "1. Pick a style and mood   2. Generate ideas + Play   3. Like / Skip   4. Drag the MIDI into FL Studio      (" + hint + ")";
        hintLabel.setText (hint, juce::dontSendNotification);
    }
    moodBox.setSelectedItemIndex (proc.mood, juce::dontSendNotification);
    buildChordBoxes();
    view.repaint();
}

void MelodyForgeEditor::timerCallback()
{
    // follow the project tempo so exported files match the song
    if (auto* p = proc.apvts.getRawParameterValue ("hostTempo"); p != nullptr && p->load() > 0.5f)
    {
        int bpm = juce::jlimit (60, 180, (int) std::lround (proc.hostBpm.load()));
        if (proc.hostBpm.load() > 0 && bpm != proc.pattern.bpm)
            proc.setTempo (bpm);
    }
    if (notifyTicks > 0 && --notifyTicks == 0) statusLabel.setText ({}, juce::dontSendNotification);
    view.repaint();
}

void MelodyForgeEditor::exportMidi()
{
    auto dir = juce::File::getSpecialLocation (juce::File::userDocumentsDirectory);
    chooser = std::make_unique<juce::FileChooser> ("Export MIDI", dir.getChildFile (proc.fileBaseName() + ".mid"), "*.mid");
    chooser->launchAsync (juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::canSelectFiles
                              | juce::FileBrowserComponent::warnAboutOverwriting,
                          [this] (const juce::FileChooser& fc)
                          {
                              auto file = fc.getResult();
                              if (file == juce::File()) return;
                              if (! file.hasFileExtension ("mid")) file = file.withFileExtension ("mid");
                              std::vector<int> layers;
                              for (int t = 0; t < mf::NUM_TRACKS; ++t) if (proc.layerOn[(size_t) t]) layers.push_back (t);
                              if (layers.empty()) layers = { mf::Melody, mf::Bass, mf::Chords };
                              auto bytes = proc.midiFor (layers);
                              if (file.replaceWithData (bytes.data(), bytes.size())) notify ("Saved " + file.getFileName());
                              else notify ("Could not write " + file.getFullPathName());
                          });
}

void MelodyForgeEditor::applyModeVisibility()
{
    bool adv = proc.advancedMode;
    beginnerBtn.setToggleState (! adv, juce::dontSendNotification);
    advancedBtn.setToggleState (adv, juce::dontSendNotification);
    std::initializer_list<juce::Component*> advancedOnly { &scaleBox, &progressionBox, &barsBox, &popBox, &lockKey, &lockScale, &lockProgression,
                                                           &harmonySlider, &seedEditor, &seedBtn, &evolveBtn, &revertBtn, &scaleLabel,
                                                           &progressionLabel, &barsLabel, &popLabel, &harmonyLabel, &seedLabel,
                                                           &midiOutToggle, &hostTempoToggle };
    for (auto* c : advancedOnly) c->setVisible (adv);
    if (! updating) refresh();
    for (int t = 0; t < mf::NUM_TRACKS; ++t)
        for (auto* b : { &downBtn[(size_t) t], &upBtn[(size_t) t], &viewBtn[(size_t) t] }) b->setVisible (adv);
    for (auto* b : chordBoxes) b->setVisible (adv);
    resized();
    repaint();
}

void MelodyForgeEditor::paint (juce::Graphics& g)
{
    g.fillAll (B::background);
    auto h = headerArea.toFloat();
    g.setGradientFill (juce::ColourGradient (B::navy.withAlpha (0.55f), h.getX(), h.getY(), B::background, h.getRight(), h.getBottom(), false));
    g.fillRect (h);
    g.setColour (B::border);
    g.drawHorizontalLine (headerArea.getBottom(), 0.0f, (float) getWidth());
    if (logo.isValid())
    {
        float lh = h.getHeight() - 12.0f, lw = lh * logo.getWidth() / (float) logo.getHeight();
        g.setOpacity (1.0f);
        g.drawImage (logo, juce::Rectangle<float> (h.getX() + 14.0f, h.getY() + 6.0f, lw, lh), juce::RectanglePlacement::centred);
    }
    for (auto area : { controlsArea, exportArea })
    {
        g.setColour (B::panel);
        g.fillRoundedRectangle (area.toFloat(), 12.0f);
        g.setColour (B::border);
        g.drawRoundedRectangle (area.toFloat().reduced (0.5f), 12.0f, 1.0f);
    }
    g.setColour (B::accent);
    g.setFont (lnf.headingFont (15.0f));
    g.drawText (proc.advancedMode ? "GENERATOR" : "QUICK CONTROLS", controlsArea.reduced (14, 10).removeFromTop (20), juce::Justification::left);
}

void MelodyForgeEditor::resized()
{
    auto r = getLocalBounds();
    headerArea = r.removeFromTop (76);
    {
        auto h = headerArea.reduced (14, 18);
        int logoW = logo.isValid() ? (int) ((76 - 12) * logo.getWidth() / (float) logo.getHeight()) : 0;
        h.removeFromLeft (logoW + 16);
        auto titleCol = h.removeFromLeft (260);
        title.setBounds (titleCol.removeFromTop (24));
        subtitle.setBounds (titleCol);
        auto modeRow = h.removeFromRight (230).withSizeKeepingCentre (230, 32);
        beginnerBtn.setBounds (modeRow.removeFromLeft (112));
        modeRow.removeFromLeft (6);
        advancedBtn.setBounds (modeRow);
        h.removeFromRight (16);
        moodBox.setBounds (h.removeFromRight (150).withSizeKeepingCentre (150, 30));
        h.removeFromRight (8);
        styleBox.setBounds (h.removeFromRight (150).withSizeKeepingCentre (150, 30));
    }
    r.reduce (14, 10);
    hintLabel.setBounds (r.removeFromTop (20));
    r.removeFromTop (6);
    exportArea = r.removeFromBottom (64);
    r.removeFromBottom (10);
    controlsArea = r.removeFromRight (330);
    r.removeFromRight (12);
    ideaArea = r;

    // idea column
    auto top = ideaArea.removeFromTop (34);
    prevBtn.setBounds (top.removeFromLeft (34));
    candidateLabel.setBounds (top.removeFromLeft (110));
    nextBtn.setBounds (top.removeFromLeft (34));
    top.removeFromLeft (10);
    playBtn.setBounds (top.removeFromLeft (70));
    top.removeFromLeft (10);
    newBtn.setBounds (top.removeFromLeft (100));
    top.removeFromLeft (6);
    if (evolveBtn.isVisible()) { evolveBtn.setBounds (top.removeFromLeft (80)); top.removeFromLeft (6); }
    likeBtn.setBounds (top.removeFromLeft (70));
    top.removeFromLeft (6);
    skipBtn.setBounds (top.removeFromLeft (70));
    ideaArea.removeFromTop (8);
    if (! chordBoxes.isEmpty() && chordBoxes[0]->isVisible())
    {
        auto row = ideaArea.removeFromTop (26);
        int w = row.getWidth() / chordBoxes.size();
        for (auto* b : chordBoxes) b->setBounds (row.removeFromLeft (w).reduced (2, 0));
        ideaArea.removeFromTop (6);
    }
    auto layersArea = ideaArea.removeFromBottom (3 * 32 + 4);
    auto infoRow = ideaArea.removeFromBottom (24);
    fitnessLabel.setBounds (infoRow);
    statusLabel.setBounds (infoRow.removeFromLeft (260));
    ideaArea.removeFromBottom (4);
    view.setBounds (ideaArea);
    for (int t = 0; t < mf::NUM_TRACKS; ++t)
    {
        auto row = layersArea.removeFromTop (32).reduced (0, 2);
        layerToggle[(size_t) t].setBounds (row.removeFromLeft (90));
        row.removeFromLeft (6);
        rerollBtn[(size_t) t].setBounds (row.removeFromLeft (120));
        row.removeFromLeft (6);
        if (downBtn[(size_t) t].isVisible())
        {
            downBtn[(size_t) t].setBounds (row.removeFromLeft (40));
            row.removeFromLeft (4);
            upBtn[(size_t) t].setBounds (row.removeFromLeft (40));
            row.removeFromLeft (6);
            viewBtn[(size_t) t].setBounds (row.removeFromLeft (56));
        }
        if (t == 0) revertBtn.setBounds (row.removeFromRight (120));
    }

    // controls column
    auto c = controlsArea.reduced (14, 10);
    c.removeFromTop (28);
    auto rowH = 30;
    auto addRow = [&] (juce::Label& label, juce::Component& comp, juce::Component* lock)
    {
        if (! comp.isVisible()) return;
        auto row = c.removeFromTop (rowH);
        label.setBounds (row.removeFromLeft (88));
        if (lock != nullptr) { lock->setBounds (row.removeFromRight (64)); row.removeFromRight (4); }
        comp.setBounds (row.reduced (0, 2));
        c.removeFromTop (5);
    };
    addRow (keyLabel, keyBox, &lockKey);
    addRow (scaleLabel, scaleBox, &lockScale);
    addRow (progressionLabel, progressionBox, &lockProgression);
    addRow (barsLabel, barsBox, nullptr);
    addRow (popLabel, popBox, nullptr);
    addRow (complexityLabel, complexitySlider, nullptr);
    addRow (harmonyLabel, harmonySlider, nullptr);
    if (seedEditor.isVisible())
    {
        auto row = c.removeFromTop (rowH);
        seedLabel.setBounds (row.removeFromLeft (88));
        seedBtn.setBounds (row.removeFromRight (100));
        row.removeFromRight (6);
        seedEditor.setBounds (row.reduced (0, 2));
        c.removeFromTop (5);
    }
    c.removeFromTop (4);
    for (auto* t : { (juce::Component*) &previewToggle, (juce::Component*) &midiOutToggle, (juce::Component*) &hostTempoToggle })
        if (t->isVisible()) { t->setBounds (c.removeFromTop (26)); }
    c.removeFromTop (4);
    addRow (volumeLabel, volumeSlider, nullptr);

    // export row
    auto e = exportArea.reduced (14, 12);
    exportBtn.setBounds (e.removeFromLeft (140));
    e.removeFromLeft (20);
    dragLabel.setBounds (e.removeFromLeft (150));
    int w = e.getWidth() / 4;
    for (auto* t : { &dragAll, &dragMelody, &dragBass, &dragChords }) t->setBounds (e.removeFromLeft (w).reduced (4, 0));
}

} // namespace mfplug
