#include "PluginEditor.h"

namespace island
{

namespace
{
    const juce::Colour kBackground = Brand::background;
    const juce::Colour kPlotBackground (0xff0c0e13);
    const juce::Colour kGrid (0xff1c2028);
    const juce::Colour kGridText = Brand::muted;
    const juce::Colour kCurve = Brand::accent;
    const juce::Colour kAnalyzer = Brand::primary;

    constexpr double kDisplayDbRange = 18.0;
    constexpr double kAnalyzerTopDb = 0.0;
    constexpr double kAnalyzerBottomDb = -90.0;

    juce::String formatHz (double hz)
    {
        return hz >= 1000.0 ? juce::String (hz / 1000.0, 2) + " kHz" : juce::String (hz, 1) + " Hz";
    }
} // namespace

juce::Colour bandColour (int band)
{
    // cyan/blue family of the ISLAND27 palette, spread enough to tell bands apart
    static const juce::Colour colours[eq::kNumBands] = {
        juce::Colour (0xffff8fb1), juce::Colour (0xffffc46b), juce::Colour (0xff5ee6b0), juce::Colour (0xff7fe3ff),
        juce::Colour (0xff2aa9e0), juce::Colour (0xff6f8dff), juce::Colour (0xffb79cff)
    };
    return colours[juce::jlimit (0, eq::kNumBands - 1, band)];
}

//==============================================================================
EqCurveView::EqCurveView (IslandEQProcessor& p) : processor (p)
{
    setOpaque (true);
    startTimerHz (30);
}

EqCurveView::~EqCurveView() { stopTimer(); }

void EqCurveView::resized()
{
    plot = getLocalBounds().toFloat().reduced (28.0f, 10.0f).withTrimmedLeft (4.0f);
}

float EqCurveView::xForFreq (double hz) const
{
    return plot.getX() + (float) eq::mapping::hzToNorm (hz) * plot.getWidth();
}

double EqCurveView::freqForX (float x) const
{
    return eq::mapping::normToHz ((x - plot.getX()) / plot.getWidth());
}

float EqCurveView::yForDb (double db) const
{
    const double n = (db + kDisplayDbRange) / (2.0 * kDisplayDbRange);
    return plot.getBottom() - (float) n * plot.getHeight();
}

double EqCurveView::dbForY (float y) const
{
    const double n = (plot.getBottom() - y) / plot.getHeight();
    return n * 2.0 * kDisplayDbRange - kDisplayDbRange;
}

juce::Point<float> EqCurveView::tokenPosition (int band) const
{
    const auto bands = processor.getBandParams();
    const auto& p = bands[(size_t) band];
    double db = p.gainDb;
    if (! eq::typeUsesGain (p.type))
    {
        const double fs = processor.getDisplaySampleRate();
        const auto d = eq::designBand (p, fs);
        db = d.numSections > 0 ? 20.0 * std::log10 (std::max (1e-9, d.magnitude (2.0 * eq::kPi * p.freqHz / fs))) : 0.0;
    }
    db = juce::jlimit (-kDisplayDbRange, kDisplayDbRange, db);
    return { xForFreq (p.freqHz), yForDb (db) };
}

int EqCurveView::bandAt (juce::Point<float> pos) const
{
    const auto bands = processor.getBandParams();
    int best = -1;
    float bestDist = 12.0f;
    for (int b = 0; b < eq::kNumBands; ++b)
    {
        if (bands[(size_t) b].type == eq::FilterType::Disabled)
            continue;
        const float d = tokenPosition (b).getDistanceFrom (pos);
        if (d < bestDist)
        {
            bestDist = d;
            best = b;
        }
    }
    return best;
}

void EqCurveView::timerCallback()
{
    updateAnalyzer();
    repaint();
}

void EqCurveView::updateAnalyzer()
{
    const int got = processor.pullAnalyzerSamples (scratch.data(), (int) scratch.size());
    const bool monitorOn = processor.apvts.getRawParameterValue (ParamIDs::monitor)->load() > 0.5f;

    for (int i = 0; i < got; ++i)
    {
        ring[(size_t) ringPos] = scratch[(size_t) i];
        ringPos = (ringPos + 1) % fftSize;
    }

    if (! monitorOn)
    {
        std::fill (spectrumDb.begin(), spectrumDb.end(), -120.0f);
        return;
    }

    for (int i = 0; i < fftSize; ++i)
        fftData[(size_t) i] = ring[(size_t) ((ringPos + i) % fftSize)];
    std::fill (fftData.begin() + fftSize, fftData.end(), 0.0f);
    window.multiplyWithWindowingTable (fftData.data(), (size_t) fftSize);
    fft.performFrequencyOnlyForwardTransform (fftData.data());

    const float norm = 4.0f / (float) fftSize; // hann coherent gain 0.5, one-sided x2
    for (int k = 0; k < fftSize / 2; ++k)
    {
        const float db = juce::Decibels::gainToDecibels (fftData[(size_t) k] * norm, -120.0f);
        auto& s = spectrumDb[(size_t) k];
        s = db > s ? db : juce::jmax (db, s - 1.5f);
    }
}

void EqCurveView::paint (juce::Graphics& g)
{
    g.fillAll (kBackground);
    g.setGradientFill (juce::ColourGradient (Brand::navy.withAlpha (0.55f), plot.getX(), plot.getY(),
                                             kPlotBackground, plot.getX(), plot.getBottom(), false));
    g.fillRoundedRectangle (plot.expanded (4.0f), 12.0f);
    g.setColour (Brand::border);
    g.drawRoundedRectangle (plot.expanded (4.0f), 12.0f, 1.0f);

    // grid
    g.setFont (10.0f);
    for (double hz : { 20.0, 50.0, 100.0, 200.0, 500.0, 1000.0, 2000.0, 5000.0, 10000.0, 20000.0 })
    {
        const float x = xForFreq (hz);
        g.setColour (kGrid);
        g.drawVerticalLine ((int) x, plot.getY(), plot.getBottom());
        g.setColour (kGridText);
        const auto label = hz >= 1000.0 ? juce::String ((int) (hz / 1000.0)) + "k" : juce::String ((int) hz);
        g.drawText (label, juce::Rectangle<float> (x - 16.0f, plot.getBottom() - 12.0f, 32.0f, 12.0f),
                    juce::Justification::centred);
    }
    for (double db : { -18.0, -12.0, -6.0, 0.0, 6.0, 12.0, 18.0 })
    {
        const float y = yForDb (db);
        g.setColour (db == 0.0 ? kGrid.brighter (0.3f) : kGrid);
        g.drawHorizontalLine ((int) y, plot.getX(), plot.getRight());
        g.setColour (kGridText);
        g.drawText (juce::String ((int) db), juce::Rectangle<float> (plot.getX() - 30.0f, y - 6.0f, 24.0f, 12.0f),
                    juce::Justification::centredRight);
    }

    const double fs = processor.getDisplaySampleRate();

    // analyzer
    {
        juce::Path spec;
        bool started = false;
        const int bins = fftSize / 2;
        for (float x = plot.getX(); x <= plot.getRight(); x += 2.0f)
        {
            const double hz = freqForX (x);
            const double binF = hz * fftSize / fs;
            const int k = juce::jlimit (1, bins - 1, (int) binF);
            const float db = spectrumDb[(size_t) k];
            const float n = (float) ((db - kAnalyzerBottomDb) / (kAnalyzerTopDb - kAnalyzerBottomDb));
            const float y = plot.getBottom() - juce::jlimit (0.0f, 1.0f, n) * plot.getHeight();
            if (! started) { spec.startNewSubPath (x, plot.getBottom()); started = true; }
            spec.lineTo (x, y);
        }
        spec.lineTo (plot.getRight(), plot.getBottom());
        spec.closeSubPath();
        g.setColour (kAnalyzer.withAlpha (0.45f));
        g.fillPath (spec);
    }

    // responses
    const auto bands = processor.getBandParams();
    const auto states = processor.getBandStates();
    const double mainDb = processor.getMainGainDb();

    std::array<eq::BandDesign, eq::kNumBands> designs {}, solos {};
    bool anySolo = false;
    for (int b = 0; b < eq::kNumBands; ++b)
    {
        designs[(size_t) b] = eq::designBand (bands[(size_t) b], fs);
        solos[(size_t) b] = eq::designSolo (bands[(size_t) b], fs);
        anySolo = anySolo || states[(size_t) b] == eq::BandState::Solo;
    }

    juce::Graphics::ScopedSaveState clip (g);
    g.reduceClipRegion (plot.toNearestInt());

    const int focus = dragBand >= 0 ? dragBand : (hoverBand >= 0 ? hoverBand : selectedBand);
    for (int b = 0; b < eq::kNumBands; ++b)
    {
        if (designs[(size_t) b].numSections == 0)
            continue;
        juce::Path p;
        for (float x = plot.getX(); x <= plot.getRight(); x += 2.0f)
        {
            const double w = 2.0 * eq::kPi * freqForX (x) / fs;
            const double db = 20.0 * std::log10 (std::max (1e-9, designs[(size_t) b].magnitude (w)));
            const float y = yForDb (juce::jlimit (-60.0, 60.0, db));
            if (x == plot.getX()) p.startNewSubPath (x, y); else p.lineTo (x, y);
        }
        const bool isFocus = b == focus;
        g.setColour (bandColour (b).withAlpha (isFocus ? 0.9f : 0.28f));
        g.strokePath (p, juce::PathStrokeType (isFocus ? 1.6f : 1.0f));
    }

    juce::Path total;
    for (float x = plot.getX(); x <= plot.getRight(); x += 1.0f)
    {
        const double w = 2.0 * eq::kPi * freqForX (x) / fs;
        double m;
        if (anySolo)
        {
            std::complex<double> sum = 0.0;
            for (int b = 0; b < eq::kNumBands; ++b)
            {
                if (states[(size_t) b] != eq::BandState::Solo)
                    continue;
                std::complex<double> h = 1.0;
                for (int s = 0; s < solos[(size_t) b].numSections; ++s)
                    h *= solos[(size_t) b].sections[(size_t) s].response (w);
                sum += h;
            }
            m = std::abs (sum);
        }
        else
        {
            m = 1.0;
            for (int b = 0; b < eq::kNumBands; ++b)
                if (states[(size_t) b] != eq::BandState::Mute)
                    m *= designs[(size_t) b].magnitude (w);
        }
        const double db = 20.0 * std::log10 (std::max (1e-9, m)) + mainDb;
        const float y = yForDb (juce::jlimit (-60.0, 60.0, db));
        if (x == plot.getX()) total.startNewSubPath (x, y); else total.lineTo (x, y);
    }
    g.setColour (kCurve.withAlpha (0.25f));
    g.strokePath (total, juce::PathStrokeType (6.0f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
    g.setColour (kCurve);
    g.strokePath (total, juce::PathStrokeType (2.0f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));

    // tokens
    g.setFont (11.0f);
    for (int b = 0; b < eq::kNumBands; ++b)
    {
        if (bands[(size_t) b].type == eq::FilterType::Disabled)
            continue;
        const auto pos = tokenPosition (b);
        const bool active = b == focus;
        const float r = active ? 10.0f : 8.5f;
        auto c = bandColour (b);
        if (states[(size_t) b] == eq::BandState::Mute)
            c = c.withSaturation (0.1f).darker (0.4f);
        g.setColour (c.withAlpha (active ? 1.0f : 0.85f));
        g.fillEllipse (pos.x - r, pos.y - r, 2 * r, 2 * r);
        g.setColour (states[(size_t) b] == eq::BandState::Solo ? juce::Colours::white : juce::Colours::black.withAlpha (0.6f));
        g.drawEllipse (pos.x - r, pos.y - r, 2 * r, 2 * r, states[(size_t) b] == eq::BandState::Solo ? 2.0f : 1.0f);
        g.setColour (juce::Colours::black);
        g.drawText (juce::String (b + 1), juce::Rectangle<float> (pos.x - r, pos.y - r, 2 * r, 2 * r), juce::Justification::centred);
    }

    if (focus >= 0 && bands[(size_t) focus].type != eq::FilterType::Disabled)
    {
        const auto& p = bands[(size_t) focus];
        juce::String info = "Band " + juce::String (focus + 1) + "  " + eq::filterTypeName (p.type) + "  " + formatHz (p.freqHz);
        if (eq::typeUsesGain (p.type))
            info << "  " << (p.gainDb > 0 ? "+" : "") << juce::String (p.gainDb, 1) << " dB";
        info << "  w " << juce::roundToInt (p.width * 100.0) << "%  " << eq::orderName (p.order);
        g.setColour (Brand::text.withAlpha (0.9f));
        g.setFont (12.5f);
        g.drawText (info, plot.reduced (10.0f).removeFromTop (16.0f), juce::Justification::topLeft);
    }
}

void EqCurveView::mouseMove (const juce::MouseEvent& e)
{
    const int b = bandAt (e.position);
    if (b != hoverBand)
    {
        hoverBand = b;
        setMouseCursor (b >= 0 ? juce::MouseCursor::DraggingHandCursor : juce::MouseCursor::NormalCursor);
        repaint();
    }
}

void EqCurveView::mouseExit (const juce::MouseEvent&)
{
    hoverBand = -1;
    repaint();
}

void EqCurveView::mouseDown (const juce::MouseEvent& e)
{
    const int b = bandAt (e.position);
    if (b < 0)
        return;

    selectedBand = b;
    if (onBandSelected)
        onBandSelected (b);

    if (e.mods.isPopupMenu())
    {
        showBandMenu (b);
        return;
    }

    dragBand = b;
    for (const auto& id : { ParamIDs::freq (b), ParamIDs::level (b) })
        if (auto* p = processor.apvts.getParameter (id))
            p->beginChangeGesture();
}

void EqCurveView::mouseDrag (const juce::MouseEvent& e)
{
    if (dragBand < 0)
        return;

    const auto pos = plot.getConstrainedPoint (e.position);
    const auto bands = processor.getBandParams();

    if (auto* p = processor.apvts.getParameter (ParamIDs::freq (dragBand)))
        p->setValueNotifyingHost (p->convertTo0to1 ((float) freqForX (pos.x)));

    if (eq::typeUsesGain (bands[(size_t) dragBand].type) && ! e.mods.isAltDown())
        if (auto* p = processor.apvts.getParameter (ParamIDs::level (dragBand)))
            p->setValueNotifyingHost (p->convertTo0to1 ((float) juce::jlimit (-18.0, 18.0, dbForY (pos.y))));
}

void EqCurveView::mouseUp (const juce::MouseEvent&)
{
    if (dragBand < 0)
        return;
    for (const auto& id : { ParamIDs::freq (dragBand), ParamIDs::level (dragBand) })
        if (auto* p = processor.apvts.getParameter (id))
            p->endChangeGesture();
    dragBand = -1;
}

void EqCurveView::mouseDoubleClick (const juce::MouseEvent& e)
{
    const int b = bandAt (e.position);
    if (b >= 0)
        processor.resetBand (b);
}

void EqCurveView::mouseWheelMove (const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel)
{
    const int b = bandAt (e.position);
    if (b < 0)
        return;
    if (auto* p = processor.apvts.getParameter (ParamIDs::width (b)))
    {
        const float delta = (wheel.deltaY + wheel.deltaX) * (e.mods.isShiftDown() ? 0.02f : 0.08f);
        p->beginChangeGesture();
        p->setValueNotifyingHost (juce::jlimit (0.0f, 1.0f, p->getValue() + delta));
        p->endChangeGesture();
    }
}

void EqCurveView::showBandMenu (int band)
{
    const auto bands = processor.getBandParams();
    const auto states = processor.getBandStates();
    const auto& p = bands[(size_t) band];

    juce::PopupMenu typeMenu, orderMenu, menu;
    for (int t = 0; t < static_cast<int> (eq::FilterType::Count); ++t)
        typeMenu.addItem (100 + t, eq::filterTypeName (static_cast<eq::FilterType> (t)), true, static_cast<int> (p.type) == t);
    for (int o = eq::kMinOrder; o <= eq::kMaxOrder; ++o)
    {
        const int dbPerOct = 12 * (std::abs (o) + 1);
        orderMenu.addItem (200 + o - eq::kMinOrder,
                           juce::String (eq::orderName (o)) + "  (-" + juce::String (dbPerOct) + " dB/oct)", true, p.order == o);
    }

    menu.addSectionHeader ("Band " + juce::String (band + 1));
    menu.addItem (1, "Reset");
    menu.addSeparator();
    menu.addSubMenu ("Type", typeMenu);
    menu.addSubMenu ("Order", orderMenu);
    menu.addSeparator();
    menu.addItem (2, "Mute", true, states[(size_t) band] == eq::BandState::Mute);
    menu.addItem (3, "Solo", true, states[(size_t) band] == eq::BandState::Solo);

    juce::Component::SafePointer<EqCurveView> safe (this);
    menu.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (this).withMousePosition(),
                        [safe, band] (int result)
                        {
                            if (safe == nullptr || result == 0)
                                return;
                            auto& proc = safe->processor;
                            const auto st = proc.getBandStates()[(size_t) band];
                            if (result == 1)
                                proc.resetBand (band);
                            else if (result == 2)
                                proc.setParam (ParamIDs::state (band), st == eq::BandState::Mute ? 0.0f : 1.0f);
                            else if (result == 3)
                                proc.setParam (ParamIDs::state (band), st == eq::BandState::Solo ? 0.0f : 2.0f);
                            else if (result >= 100 && result < 100 + static_cast<int> (eq::FilterType::Count))
                                proc.setParam (ParamIDs::type (band), (float) (result - 100));
                            else if (result >= 200 && result < 207)
                                proc.setParam (ParamIDs::order (band), (float) (result - 200 + eq::kMinOrder));
                        });
}

//==============================================================================
BandStrip::BandStrip (IslandEQProcessor& p, int b) : band (b)
{
    auto& apvts = p.apvts;

    title.setText ("Band " + juce::String (b + 1), juce::dontSendNotification);
    title.setJustificationType (juce::Justification::centred);
    title.setColour (juce::Label::textColourId, bandColour (b));
    title.setFont (juce::Font (12.5f, juce::Font::bold));
    addAndMakeVisible (title);

    for (int t = 0; t < static_cast<int> (eq::FilterType::Count); ++t)
        type.addItem (eq::filterTypeName (static_cast<eq::FilterType> (t)), t + 1);
    for (int o = eq::kMinOrder; o <= eq::kMaxOrder; ++o)
        order.addItem (eq::orderName (o), o - eq::kMinOrder + 1);
    state.addItemList ({ "Normal", "Mute", "Solo" }, 1);

    for (auto* c : { &type, &order, &state })
        addAndMakeVisible (*c);

    for (auto* s : { &freq, &width })
    {
        s->setSliderStyle (juce::Slider::RotaryHorizontalVerticalDrag);
        s->setTextBoxStyle (juce::Slider::TextBoxBelow, false, 52, 16);
        s->setColour (juce::Slider::rotarySliderFillColourId, bandColour (b));
        addAndMakeVisible (*s);
    }
    level.setSliderStyle (juce::Slider::LinearHorizontal);
    level.setTextBoxStyle (juce::Slider::TextBoxBelow, false, 70, 16);
    level.setColour (juce::Slider::trackColourId, bandColour (b).withAlpha (0.7f));
    addAndMakeVisible (level);

    freq.setTooltip ("Band " + juce::String (b + 1) + " freq");
    width.setTooltip ("Band " + juce::String (b + 1) + " width");
    level.setTooltip ("Band " + juce::String (b + 1) + " level");

    typeAtt = std::make_unique<ComboAttachment> (apvts, ParamIDs::type (b), type);
    orderAtt = std::make_unique<ComboAttachment> (apvts, ParamIDs::order (b), order);
    stateAtt = std::make_unique<ComboAttachment> (apvts, ParamIDs::state (b), state);
    freqAtt = std::make_unique<SliderAttachment> (apvts, ParamIDs::freq (b), freq);
    widthAtt = std::make_unique<SliderAttachment> (apvts, ParamIDs::width (b), width);
    levelAtt = std::make_unique<SliderAttachment> (apvts, ParamIDs::level (b), level);
}

void BandStrip::paint (juce::Graphics& g)
{
    const auto r = getLocalBounds().toFloat().reduced (3.0f);
    g.setColour (Brand::panel);
    g.fillRoundedRectangle (r, 12.0f);
    if (selected)
    {
        g.setColour (bandColour (band).withAlpha (0.08f));
        g.fillRoundedRectangle (r, 12.0f);
    }
    g.setColour (selected ? bandColour (band).withAlpha (0.7f) : Brand::border);
    g.drawRoundedRectangle (r, 12.0f, 1.0f);
}

void BandStrip::resized()
{
    auto r = getLocalBounds().reduced (9, 7);
    title.setBounds (r.removeFromTop (16));
    type.setBounds (r.removeFromTop (22));
    r.removeFromTop (4);
    auto knobs = r.removeFromTop (66);
    freq.setBounds (knobs.removeFromLeft (knobs.getWidth() / 2));
    width.setBounds (knobs);
    level.setBounds (r.removeFromTop (38));
    r.removeFromTop (2);
    order.setBounds (r.removeFromTop (20));
    r.removeFromTop (3);
    state.setBounds (r.removeFromTop (20));
}

//==============================================================================
IslandEQEditor::IslandEQEditor (IslandEQProcessor& p)
    : AudioProcessorEditor (&p), proc (p), curve (p)
{
    setLookAndFeel (&lnf);
    juce::LookAndFeel::setDefaultLookAndFeel (&lnf);

    logo = juce::ImageCache::getFromMemory (IslandAssets::logo_png, IslandAssets::logo_pngSize);
    banner = juce::ImageCache::getFromMemory (IslandAssets::banner_bg_jpg, IslandAssets::banner_bg_jpgSize);

    titleLabel.setText ("PARAMETRIC EQ", juce::dontSendNotification);
    titleLabel.setFont (lnf.headingFont (19.0f));
    titleLabel.setColour (juce::Label::textColourId, Brand::text);
    addAndMakeVisible (titleLabel);

    hqButton.setClickingTogglesState (true);
    hqButton.setTooltip ("High quality (2x oversampling)");
    linearButton.setClickingTogglesState (true);
    linearButton.setTooltip ("Linear phase");
    storeButton.setTooltip ("Store in spare state");
    flipButton.setTooltip ("Flip with spare state (A/B compare)");
    resetButton.setTooltip ("Reset all bands");
    for (auto* b : { &hqButton, &linearButton, &storeButton, &flipButton, &resetButton })
        addAndMakeVisible (*b);

    storeButton.onClick = [this] { proc.storeSpare(); };
    flipButton.onClick = [this] { proc.flipSpare(); };
    resetButton.onClick = [this] { proc.resetAll(); };

    monitorBox.addItemList ({ "Monitor: off", "Monitor: input", "Monitor: output" }, 1);
    addAndMakeVisible (monitorBox);

    mainLevel.setSliderStyle (juce::Slider::LinearVertical);
    mainLevel.setTextBoxStyle (juce::Slider::TextBoxBelow, false, 70, 16);
    mainLabel.setText ("Main", juce::dontSendNotification);
    mainLabel.setJustificationType (juce::Justification::centred);
    addAndMakeVisible (mainLevel);
    addAndMakeVisible (mainLabel);

    hqAtt = std::make_unique<juce::AudioProcessorValueTreeState::ButtonAttachment> (p.apvts, ParamIDs::hq, hqButton);
    linearAtt = std::make_unique<juce::AudioProcessorValueTreeState::ButtonAttachment> (p.apvts, ParamIDs::linear, linearButton);
    monitorAtt = std::make_unique<juce::AudioProcessorValueTreeState::ComboBoxAttachment> (p.apvts, ParamIDs::monitor, monitorBox);
    mainAtt = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment> (p.apvts, ParamIDs::main, mainLevel);

    addAndMakeVisible (curve);
    for (int b = 0; b < eq::kNumBands; ++b)
    {
        strips[(size_t) b] = std::make_unique<BandStrip> (p, b);
        addAndMakeVisible (*strips[(size_t) b]);
    }
    curve.onBandSelected = [this] (int band)
    {
        for (int b = 0; b < eq::kNumBands; ++b)
            strips[(size_t) b]->setSelected (b == band);
    };

    setResizable (true, true);
    setResizeLimits (840, 540, 1700, 1100);
    setSize (980, 600);
}

IslandEQEditor::~IslandEQEditor()
{
    juce::LookAndFeel::setDefaultLookAndFeel (nullptr);
    setLookAndFeel (nullptr);
}

void IslandEQEditor::paint (juce::Graphics& g)
{
    g.fillAll (kBackground);

    // Header: the site's banner as a faint wash (like .bg-wash, opacity .16) + logo
    const auto h = headerArea.toFloat();
    if (banner.isValid())
    {
        // lower part of the banner (bay, bridge and city lights) - no logo there
        const auto src = juce::Rectangle<int> (0, (int) (banner.getHeight() * 0.74f), banner.getWidth(),
                                               (int) (banner.getHeight() * 0.18f));
        g.setOpacity (0.55f);
        g.drawImage (banner, headerArea.getX(), headerArea.getY(), headerArea.getWidth(), headerArea.getHeight(),
                     src.getX(), src.getY(), src.getWidth(), src.getHeight());
        g.setOpacity (1.0f);
    }
    g.setGradientFill (juce::ColourGradient (Brand::background.withAlpha (0.92f), h.getX(), h.getY(),
                                             Brand::background.withAlpha (0.35f), h.getRight(), h.getY(), false));
    g.fillRect (h);
    g.setColour (Brand::border);
    g.drawHorizontalLine (headerArea.getBottom(), 0.0f, (float) getWidth());

    if (logo.isValid())
    {
        g.setOpacity (1.0f); // drawImage uses the current colour's alpha
        const float lh = h.getHeight() - 10.0f;
        const float lw = lh * (float) logo.getWidth() / (float) logo.getHeight();
        g.drawImage (logo, juce::Rectangle<float> (h.getX() + 16.0f, h.getY() + 5.0f, lw, lh),
                     juce::RectanglePlacement::centred);
    }

    // footer note, like the site's small caps eyebrow
    g.setColour (Brand::muted);
    g.setFont (lnf.bodyFont (11.0f));
    g.drawText (juce::String (juce::CharPointer_UTF8 ("ISLAND27  \xe2\x80\xa2  PRODU\xc3\x87\xc3\x83O  \xe2\x80\xa2  MIX  \xe2\x80\xa2  MASTER")), getLocalBounds().removeFromBottom (16).reduced (12, 0),
                juce::Justification::centredRight);
}

void IslandEQEditor::resized()
{
    auto r = getLocalBounds();
    headerArea = r.removeFromTop (84);
    r = r.reduced (8, 0).withTrimmedBottom (16);

    auto top = headerArea.reduced (14, 27);
    const int logoW = logo.isValid() ? juce::roundToInt (74.0f * (float) logo.getWidth() / (float) logo.getHeight()) : 0;
    top.removeFromLeft (logoW + 22);
    titleLabel.setBounds (top.removeFromLeft (180));
    resetButton.setBounds (top.removeFromRight (56));
    top.removeFromRight (4);
    flipButton.setBounds (top.removeFromRight (44));
    top.removeFromRight (4);
    storeButton.setBounds (top.removeFromRight (52));
    top.removeFromRight (12);
    monitorBox.setBounds (top.removeFromRight (140));
    top.removeFromRight (12);
    linearButton.setBounds (top.removeFromRight (44));
    top.removeFromRight (4);
    hqButton.setBounds (top.removeFromRight (40));

    r.removeFromTop (8);
    auto bottom = r.removeFromBottom (212);
    curve.setBounds (r);

    auto mainCol = bottom.removeFromRight (80);
    mainLabel.setBounds (mainCol.removeFromTop (18));
    mainLevel.setBounds (mainCol.reduced (8, 2));

    const int w = bottom.getWidth() / eq::kNumBands;
    for (int b = 0; b < eq::kNumBands; ++b)
        strips[(size_t) b]->setBounds (bottom.removeFromLeft (w));
}

} // namespace island
