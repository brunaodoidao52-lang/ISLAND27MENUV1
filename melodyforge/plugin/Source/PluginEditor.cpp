#include "PluginEditor.h"
#include "Presets.h"

namespace mfplug
{

namespace N = Neon;

static juce::String keyNamePt (int pc)
{
    static const char* n[] = { "Dó", "Dó#", "Ré", "Ré#", "Mi", "Fá", "Fá#", "Sol", "Sol#", "Lá", "Lá#", "Si" };
    return pt (n[mf::mod12 (pc)]);
}

static juce::String scaleNamePt (int i)
{
    return pt (mf::scales()[(size_t) juce::jlimit (0, (int) mf::scales().size() - 1, i)].name);
}

static void setAccent (juce::Button& b, juce::Colour c) { b.getProperties().set ("accent", (juce::int64) c.getARGB()); }

// ============================================================================ icons
void drawIcon (juce::Graphics& g, Icon icon, juce::Rectangle<float> r, juce::Colour c)
{
    const float s = juce::jmin (r.getWidth(), r.getHeight());
    auto b = r.withSizeKeepingCentre (s, s);
    const float x = b.getX(), y = b.getY();
    auto P = [&] (float fx, float fy) { return juce::Point<float> (x + fx * s, y + fy * s); };
    juce::Path p;
    const juce::PathStrokeType stroke (juce::jmax (1.6f, s * 0.11f), juce::PathStrokeType::curved, juce::PathStrokeType::rounded);
    g.setColour (c);
    switch (icon)
    {
        case Icon::Play:
            p.addTriangle (P (0.22f, 0.12f), P (0.22f, 0.88f), P (0.88f, 0.5f));
            g.fillPath (p);
            break;
        case Icon::Stop:
            g.fillRoundedRectangle (b.reduced (s * 0.18f), s * 0.08f);
            break;
        case Icon::Prev:
            p.startNewSubPath (P (0.65f, 0.15f)); p.lineTo (P (0.3f, 0.5f)); p.lineTo (P (0.65f, 0.85f));
            g.strokePath (p, stroke);
            break;
        case Icon::Next:
            p.startNewSubPath (P (0.35f, 0.15f)); p.lineTo (P (0.7f, 0.5f)); p.lineTo (P (0.35f, 0.85f));
            g.strokePath (p, stroke);
            break;
        case Icon::Heart:
            p.startNewSubPath (P (0.5f, 0.88f));
            p.cubicTo (P (0.05f, 0.55f), P (0.05f, 0.12f), P (0.5f, 0.3f));
            p.cubicTo (P (0.95f, 0.12f), P (0.95f, 0.55f), P (0.5f, 0.88f));
            p.closeSubPath();
            g.fillPath (p);
            break;
        case Icon::Skip:
            p.startNewSubPath (P (0.18f, 0.18f)); p.lineTo (P (0.5f, 0.5f)); p.lineTo (P (0.18f, 0.82f));
            p.startNewSubPath (P (0.5f, 0.18f)); p.lineTo (P (0.82f, 0.5f)); p.lineTo (P (0.5f, 0.82f));
            g.strokePath (p, stroke);
            break;
        case Icon::Dice:
        {
            auto d = b.reduced (s * 0.12f);
            g.drawRoundedRectangle (d, s * 0.14f, stroke.getStrokeThickness());
            const float dot = s * 0.13f;
            for (auto pt_ : { P (0.34f, 0.34f), P (0.66f, 0.66f), P (0.5f, 0.5f) })
                g.fillEllipse (juce::Rectangle<float> (dot, dot).withCentre (pt_));
            break;
        }
        case Icon::Spark:
            p.startNewSubPath (P (0.5f, 0.05f));
            p.quadraticTo (P (0.56f, 0.44f), P (0.95f, 0.5f));
            p.quadraticTo (P (0.56f, 0.56f), P (0.5f, 0.95f));
            p.quadraticTo (P (0.44f, 0.56f), P (0.05f, 0.5f));
            p.quadraticTo (P (0.44f, 0.44f), P (0.5f, 0.05f));
            p.closeSubPath();
            g.fillPath (p);
            break;
        case Icon::Evolve:   // DNA-like double helix
            for (int k = 0; k < 2; ++k)
            {
                juce::Path h;
                for (int i = 0; i <= 16; ++i)
                {
                    float t = i / 16.0f;
                    auto pnt = P (0.5f + 0.32f * std::sin (t * 6.28f + (float) k * 3.14f), 0.08f + 0.84f * t);
                    if (i == 0) h.startNewSubPath (pnt); else h.lineTo (pnt);
                }
                g.strokePath (h, juce::PathStrokeType (stroke.getStrokeThickness() * 0.8f));
            }
            break;
        case Icon::FullScreen:
        case Icon::ExitFullScreen:
        {
            const bool out = icon == Icon::FullScreen;
            const float a = out ? 0.1f : 0.38f, bb = out ? 0.38f : 0.1f;
            for (int cx = 0; cx < 2; ++cx)
                for (int cy = 0; cy < 2; ++cy)
                {
                    auto fx = [&] (float v) { return cx == 0 ? v : 1.0f - v; };
                    auto fy = [&] (float v) { return cy == 0 ? v : 1.0f - v; };
                    p.startNewSubPath (P (fx (a), fy (bb))); p.lineTo (P (fx (a), fy (a))); p.lineTo (P (fx (bb), fy (a)));
                }
            g.strokePath (p, stroke);
            break;
        }
        case Icon::Headphones:
            p.addCentredArc (x + s * 0.5f, y + s * 0.55f, s * 0.36f, s * 0.36f, 0.0f, -1.75f, 1.75f, true);
            g.strokePath (p, stroke);
            g.fillRoundedRectangle (P (0.1f, 0.55f).x, P (0.1f, 0.55f).y, s * 0.2f, s * 0.32f, s * 0.06f);
            g.fillRoundedRectangle (P (0.7f, 0.55f).x, P (0.7f, 0.55f).y, s * 0.2f, s * 0.32f, s * 0.06f);
            break;
        case Icon::Download:
            p.startNewSubPath (P (0.5f, 0.1f)); p.lineTo (P (0.5f, 0.62f));
            p.startNewSubPath (P (0.28f, 0.42f)); p.lineTo (P (0.5f, 0.64f)); p.lineTo (P (0.72f, 0.42f));
            p.startNewSubPath (P (0.15f, 0.72f)); p.lineTo (P (0.15f, 0.88f)); p.lineTo (P (0.85f, 0.88f)); p.lineTo (P (0.85f, 0.72f));
            g.strokePath (p, stroke);
            break;
        case Icon::Folder:
            p.startNewSubPath (P (0.1f, 0.25f)); p.lineTo (P (0.4f, 0.25f)); p.lineTo (P (0.48f, 0.35f)); p.lineTo (P (0.9f, 0.35f));
            p.lineTo (P (0.9f, 0.82f)); p.lineTo (P (0.1f, 0.82f)); p.closeSubPath();
            g.strokePath (p, stroke);
            break;
        case Icon::None:
            break;
    }
}

void IconButton::paintButton (juce::Graphics& g, bool highlighted, bool down)
{
    auto& lf = getLookAndFeel();
    lf.drawButtonBackground (g, *this, findColour (juce::TextButton::buttonColourId), highlighted, down);
    auto r = getLocalBounds().toFloat().reduced (4.0f);
    const bool on = getToggleState();
    const auto accent = getProperties().contains ("accent") ? juce::Colour ((juce::uint32) (juce::int64) getProperties()["accent"]) : N::cyan;
    if (pulse)
    {
        const float a = 0.5f + 0.5f * std::sin (pulsePhase);
        N::glow (g, r, juce::jmin (r.getHeight() * 0.5f, 12.0f), accent, 0.6f + a);
    }
    auto colour = ! isEnabled() ? N::muted.withAlpha (0.5f) : on ? N::onPrimary : (highlighted ? accent.brighter (0.3f) : N::text);
    const auto text = getButtonText();
    const float iconSize = juce::jmin (r.getHeight() * 0.5f, 18.0f);
    if (text.isEmpty())
    {
        drawIcon (g, icon, r.withSizeKeepingCentre (iconSize, iconSize), colour);
        return;
    }
    auto font = dynamic_cast<NeonLookAndFeel*> (&lf) != nullptr ? static_cast<NeonLookAndFeel&> (lf).bodyFont (getHeight() >= 40 ? 16.0f : 14.5f, true)
                                                                 : juce::Font (14.5f, juce::Font::bold);
    g.setFont (font);
    const float textW = juce::jmin (r.getWidth() - iconSize - 14.0f, (float) font.getStringWidth (text));
    const float total = (icon != Icon::None ? iconSize + 8.0f : 0.0f) + textW;
    float x0 = r.getCentreX() - total * 0.5f;
    if (icon != Icon::None)
    {
        drawIcon (g, icon, { x0, r.getCentreY() - iconSize * 0.5f, iconSize, iconSize }, colour);
        x0 += iconSize + 8.0f;
    }
    g.setColour (colour);
    g.drawFittedText (text, juce::Rectangle<float> (x0, r.getY(), textW + 2.0f, r.getHeight()).toNearestInt(), juce::Justification::centredLeft, 1, 0.8f);
}

// ============================================================================ pattern view
void PatternView::paint (juce::Graphics& g)
{
    auto r = getLocalBounds().toFloat().reduced (2.0f);
    g.setGradientFill (juce::ColourGradient (N::panel, 0, r.getY(), N::bg, 0, r.getBottom(), false));
    g.fillRoundedRectangle (r, 12.0f);
    g.setColour (N::lineStrong);
    g.drawRoundedRectangle (r.reduced (0.5f), 12.0f, 1.2f);

    const auto& p = proc.pattern;
    if (p.bars <= 0) return;
    auto area = r.reduced (10.0f, 8.0f);
    auto chordStrip = area.removeFromTop (24.0f);
    area.removeFromTop (4.0f);
    const float totalTicks = (float) (p.bars * mf::BAR);
    const double ph = proc.playheadTicks.load();

    int lo = 127, hi = 0;
    for (const auto& tr : p.tracks)
        for (const auto& n : tr) { lo = std::min (lo, n.pitch); hi = std::max (hi, n.pitch); }
    if (lo > hi) { lo = 48; hi = 84; }
    lo -= 2; hi += 2;
    const float rowH = area.getHeight() / (float) (hi - lo + 1);
    auto xOf = [&] (double tick) { return area.getX() + area.getWidth() * (float) (tick / totalTicks); };

    // grid
    for (int bar = 0; bar <= p.bars; ++bar)
        for (int beat = 0; beat < (bar < p.bars ? 4 : 1); ++beat)
        {
            float x = xOf (bar * mf::BAR + beat * mf::PPQ);
            g.setColour (beat == 0 ? N::cyan.withAlpha (0.28f) : juce::Colours::white.withAlpha (0.05f));
            g.drawVerticalLine ((int) x, area.getY(), area.getBottom());
        }
    for (int pitch = lo; pitch <= hi; ++pitch)
        if (mf::mod12 (pitch) == 0)
        {
            float y = area.getBottom() - (float) (pitch - lo + 1) * rowH;
            g.setColour (juce::Colours::white.withAlpha (0.07f));
            g.drawHorizontalLine ((int) (y + rowH), area.getX(), area.getRight());
            g.setColour (N::muted);
            g.setFont (12.0f);
            g.drawText ("C" + juce::String (pitch / 12 - 1), juce::Rectangle<float> (area.getX() + 3, y - 2, 34, rowH + 4), juce::Justification::left);
        }

    // chord names as pills; the one being played glows
    for (int bar = 0; bar < (int) p.chords.size(); ++bar)
    {
        auto cell = juce::Rectangle<float> (xOf (bar * mf::BAR) + 3, chordStrip.getY() + 2, area.getWidth() / (float) p.bars - 6, chordStrip.getHeight() - 4);
        const bool now = ph >= 0 && (int) (ph / mf::BAR) == bar;
        if (now) N::glow (g, cell, 8.0f, N::cyan, 1.2f, 3);
        g.setColour (now ? N::cyan.withAlpha (0.22f) : N::panelHi);
        g.fillRoundedRectangle (cell, 8.0f);
        g.setColour (now ? N::cyan : N::line);
        g.drawRoundedRectangle (cell, 8.0f, 1.0f);
        g.setColour (now ? juce::Colours::white : N::cyan);
        g.setFont (juce::Font (14.0f, juce::Font::bold));
        g.drawFittedText (p.chords[(size_t) bar].name, cell.reduced (6, 0).toNearestInt(), juce::Justification::centred, 1, 0.7f);
    }

    // notes; the ones under the playhead light up
    auto drawTrack = [&] (int t, float alpha)
    {
        if (! proc.layerOn[(size_t) t]) return;
        const bool soloedOut = proc.soloLayer >= 0 && proc.soloLayer != t;
        const auto c = N::layer[t];
        for (const auto& n : p.tracks[(size_t) t])
        {
            float x = xOf (n.start), w = std::max (4.0f, xOf (n.start + n.length) - x - 1.5f);
            float y = area.getBottom() - (float) (n.pitch - lo + 1) * rowH;
            juce::Rectangle<float> nr (x, y + 1, w, std::max (3.0f, rowH - 2));
            const bool active = ph >= n.start && ph < n.start + n.length && ! soloedOut;
            const float a = soloedOut ? 0.12f : alpha * (0.55f + 0.45f * n.velocity / 127.0f);
            if (active)
            {
                N::glow (g, nr, 3.0f, c, 1.6f, 3);
                g.setColour (c.brighter (0.6f));
            }
            else
                g.setColour (c.withAlpha (a));
            g.fillRoundedRectangle (nr, 3.0f);
        }
    };
    for (int t = 0; t < mf::NUM_TRACKS; ++t)
        if (t != selectedTrack) drawTrack (t, selectedTrack < 0 ? 0.9f : 0.3f);
    if (selectedTrack >= 0) drawTrack (selectedTrack, 1.0f);

    if (ph >= 0)
    {
        juce::Path line;
        float x = xOf (ph);
        line.startNewSubPath (x, area.getY());
        line.lineTo (x, area.getBottom());
        N::glowPath (g, line, juce::Colours::white, 1.8f, 1.0f);
    }
}

// ============================================================================ drag tile
void DragTile::paint (juce::Graphics& g)
{
    auto r = getLocalBounds().toFloat().reduced (4.0f);
    bool over = isMouseOver();
    if (over) N::glow (g, r, 10.0f, colour, 1.3f);
    g.setColour (over ? colour.withAlpha (0.2f) : N::panelHi);
    g.fillRoundedRectangle (r, 10.0f);
    g.setColour (over ? colour : colour.withAlpha (0.55f));
    g.drawRoundedRectangle (r, 10.0f, 1.4f);
    g.setFont (juce::Font (13.5f, juce::Font::bold));
    const float textW = (float) g.getCurrentFont().getStringWidth (text);
    const float iconS = 14.0f;
    float x0 = r.getCentreX() - (textW + iconS + 8.0f) * 0.5f;
    drawIcon (g, Icon::Download, { x0, r.getCentreY() - iconS * 0.5f, iconS, iconS }, colour);
    g.setColour (over ? juce::Colours::white : N::text);
    g.drawText (text, juce::Rectangle<float> (x0 + iconS + 8.0f, r.getY(), textW + 4.0f, r.getHeight()), juce::Justification::centredLeft);
}

void DragTile::mouseDrag (const juce::MouseEvent& e)
{
    if (dragging || e.getDistanceFromDragStart() < 6) return;
    auto* container = juce::DragAndDropContainer::findParentDragContainerFor (this);
    if (container == nullptr) return;
    auto dir = juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile ("Melody Generator");
    dir.createDirectory();
    static const char* ids[] = { "melodia", "baixo", "acordes" };
    juce::String suffix = layerList.size() == 1 ? juce::String ("-") + ids[layerList[0]] : juce::String();
    auto file = dir.getChildFile (proc.fileBaseName() + suffix + ".mid");
    auto bytes = proc.midiFor (layerList);
    file.replaceWithData (bytes.data(), bytes.size());
    dragging = true;
    if (onDragged) onDragged();
    juce::DragAndDropContainer::performExternalDragDropOfFiles ({ file.getFullPathName() }, false, this,
                                                                [this] { dragging = false; });
}

// ============================================================================ layer card
static std::vector<int> recommendedFor (int track)
{
    switch (track)
    {
        case mf::Melody: return { 0, 10, 11, 8, 13, 24, 21, 29, 73, 74, 78, 65, 81, 80, 98 };
        case mf::Bass:   return { instruments::builtin808, 33, 32, 34, 35, 36, 37, 38, 39 };
        default:         return { 0, 2, 4, 48, 51, 89, 90, 95, 97, 52, 61, 19, 21 };
    }
}

static int idForCode (int code) { return code >= 0 ? code + 1 : 30000 - code; }
static int codeForId (int id) { return id >= 30000 ? -(id - 30000) : id - 1; }

LayerCard::LayerCard (MelodyForgeProcessor& p, int t, NeonLookAndFeel& l) : proc (p), lnf (l), track (t)
{
    const auto c = N::layer[t];
    for (auto* b : std::initializer_list<juce::Button*> { &onOff, &soloBtn, &rerollBtn, &downBtn, &upBtn, &viewBtn })
    {
        setAccent (*b, c);
        addAndMakeVisible (b);
    }
    onOff.setTooltip (pt ("Liga ou desliga esta camada (no som e no MIDI exportado)"));
    onOff.onClick = [this]
    {
        proc.setLayerEnabled (track, onOff.getToggleState());
        if (onNotify) onNotify (MelodyForgeProcessor::layerName (track) + (onOff.getToggleState() ? pt (" ligada") : pt (" desligada")));
    };
    soloBtn.setButtonText (pt ("Solo"));
    soloBtn.setTooltip (pt ("Toca só esta camada, para você ouvir o que ela faz"));
    soloBtn.onClick = [this]
    {
        const bool solo = proc.soloLayer != track;
        proc.setSolo (solo ? track : -1);
        if (solo && ! proc.internalPlay.load() && ! (proc.syncsWithHost() && proc.hostPlaying.load())) proc.internalPlay = true;
        if (onNotify) onNotify (solo ? pt ("Ouvindo só: ") + MelodyForgeProcessor::layerName (track) : pt ("Ouvindo todas as camadas"));
    };
    rerollBtn.setButtonText (pt ("Variar"));
    rerollBtn.setTooltip (pt ("Cria outra versão só desta camada; as outras continuam iguais"));
    rerollBtn.onClick = [this]
    {
        proc.rerollLayer (track);
        if (onNotify) onNotify (pt ("Nova variação: ") + MelodyForgeProcessor::layerName (track));
    };
    downBtn.setTooltip (pt ("Transpor meio tom abaixo"));
    upBtn.setTooltip (pt ("Transpor meio tom acima"));
    downBtn.onClick = [this] { proc.transposeLayer (track, -1); };
    upBtn.onClick = [this] { proc.transposeLayer (track, 1); };
    viewBtn.setButtonText (pt ("Destacar"));
    viewBtn.setTooltip (pt ("Destaca esta camada no piano roll"));
    viewBtn.onClick = [this] { if (onView) onView (track); };

    instrumentBox.setTooltip (pt ("Timbre (instrumento) desta camada. Ao escolher, você ouve uma amostra."));
    instrumentBox.onChange = [this]
    {
        if (updating || instrumentBox.getSelectedId() == 0) return;
        const int code = codeForId (instrumentBox.getSelectedId());
        proc.setInstrument (track, code);
        if (onNotify) onNotify (MelodyForgeProcessor::layerName (track) + ": " + instruments::displayName (code, proc.currentBank().get()));
    };
    addAndMakeVisible (instrumentBox);

    volume.setSliderStyle (juce::Slider::LinearHorizontal);
    volume.setTextBoxStyle (juce::Slider::TextBoxRight, false, 52, 18);
    volume.setTextValueSuffix (" dB");
    volume.setColour (juce::Slider::trackColourId, c);
    volume.setTooltip (pt ("Volume desta camada no som interno"));
    static const char* params[] = { "volMelody", "volBass", "volChords" };
    volumeAtt = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment> (proc.apvts, params[t], volume);
    addAndMakeVisible (volume);
    rebuildInstruments();
}

void LayerCard::rebuildInstruments()
{
    auto bankPtr = proc.currentBank();
    auto* bank = bankPtr.get();
    const auto state = proc.getBankState();
    juce::ScopedValueSetter<bool> guard (updating, true);
    if (bank != builtFor || state != builtState || instrumentBox.getNumItems() == 0)
    {
        builtFor = bank;
        builtState = state;
        instrumentBox.clear (juce::dontSendNotification);
        auto* root = instrumentBox.getRootMenu();
        root->addSectionHeader (pt ("Recomendados para ") + MelodyForgeProcessor::layerName (track).toLowerCase());
        for (int code : recommendedFor (track))
            if (code < 0 || (bank != nullptr && bank->find (instruments::bankOf (code), instruments::programOf (code)) != nullptr))
                root->addItem (idForCode (code), instruments::displayName (code, bank));
        if (bank != nullptr)
        {
            root->addSectionHeader (pt ("Todos os timbres"));
            for (int fam = 0; fam < 16; ++fam)
            {
                juce::PopupMenu sub;
                for (const auto& pr : bank->getPresets())
                    if (pr.bank == 0 && pr.program / 8 == fam)
                        sub.addItem (idForCode (instruments::code (0, pr.program)), instruments::displayName (instruments::code (0, pr.program), bank));
                if (sub.getNumItems() > 0) root->addSubMenu (instruments::familyName (fam * 8), sub);
            }
            int lastBank = -1;
            juce::PopupMenu other;
            auto flush = [&]
            {
                if (other.getNumItems() > 0)
                    root->addSubMenu (lastBank == 128 ? pt ("Baterias") : pt ("Banco ") + juce::String (lastBank), other);
                other = {};
            };
            for (const auto& pr : bank->getPresets())
            {
                if (pr.bank == 0 || pr.bank * 128 + pr.program >= 30000) continue;
                if (pr.bank != lastBank) { flush(); lastBank = pr.bank; }
                other.addItem (idForCode (instruments::code (pr.bank, pr.program)), pr.name);
            }
            flush();
        }
        root->addSectionHeader (pt ("Sons sintetizados"));
        for (int code : instruments::builtins())
            root->addItem (idForCode (code), instruments::builtinName (code));
        if (state == MelodyForgeProcessor::BankState::Loading)
            root->addItem (39999, pt ("Carregando timbres reais..."), false);
        else if (bank == nullptr)
            root->addItem (39998, pt ("Timbres reais indisponíveis (veja o LEIA-ME)"), false);
    }
    const int code = proc.instrumentOf (track);
    if (instrumentBox.indexOfItemId (idForCode (code)) < 0 && instrumentBox.getRootMenu() != nullptr)
    {
        // e.g. a saved project that used an instrument of another bank
        instrumentBox.getRootMenu()->addItem (idForCode (code), instruments::displayName (code, bank) + pt (" (indisponível)"), false);
    }
    instrumentBox.setSelectedId (idForCode (code), juce::dontSendNotification);
}

void LayerCard::refresh (bool adv)
{
    advanced = adv;
    const bool on = proc.layerOn[(size_t) track];
    onOff.setToggleState (on, juce::dontSendNotification);
    soloBtn.setToggleState (proc.soloLayer == track, juce::dontSendNotification);
    for (auto* b : { &downBtn, &upBtn, &viewBtn }) b->setVisible (adv);
    rebuildInstruments();
    resized();
    repaint();
}

void LayerCard::resized()
{
    auto r = getLocalBounds().reduced (10, 7);
    auto head = r.removeFromTop (22);
    onOff.setBounds (head.removeFromRight (44).withSizeKeepingCentre (44, 22));
    r.removeFromTop (4);
    instrumentBox.setBounds (r.removeFromTop (26));
    r.removeFromTop (4);
    auto volRow = r.removeFromTop (22);
    if (advanced)
    {
        upBtn.setBounds (volRow.removeFromRight (36));
        downBtn.setBounds (volRow.removeFromRight (36));
    }
    volume.setBounds (volRow);
    r.removeFromTop (4);
    auto row = r.removeFromTop (26);
    if (advanced)
    {
        const int w = row.getWidth() / 3;
        soloBtn.setBounds (row.removeFromLeft (w));
        rerollBtn.setBounds (row.removeFromLeft (w));
        viewBtn.setBounds (row);
    }
    else
    {
        soloBtn.setBounds (row.removeFromLeft (row.getWidth() / 2));
        rerollBtn.setBounds (row);
    }
}

void LayerCard::paint (juce::Graphics& g)
{
    auto r = getLocalBounds().toFloat().reduced (3.0f);
    const auto c = N::layer[track];
    const bool on = proc.layerOn[(size_t) track];
    if (activity > 0.02f) N::glow (g, r, 12.0f, c, 0.5f + activity);
    g.setGradientFill (juce::ColourGradient (c.withAlpha (on ? 0.22f : 0.06f).overlaidWith (N::panelHi.withAlpha (0.8f)), r.getX(), r.getY(),
                                             N::panel, r.getX(), r.getBottom(), false));
    g.fillRoundedRectangle (r, 12.0f);
    g.setColour (on ? c.withAlpha (0.7f + 0.3f * activity) : N::line);
    g.drawRoundedRectangle (r, 12.0f, on ? 1.8f : 1.2f);
    // solid colour bar on the left
    g.setColour (on ? c : c.withAlpha (0.3f));
    g.fillRoundedRectangle (r.withWidth (5.0f).reduced (0.0f, 12.0f), 2.5f);

    auto head = getLocalBounds().reduced (10, 7).removeFromTop (22).toFloat();
    head.removeFromRight (48.0f);
    g.setColour (on ? c.brighter (0.25f) : N::muted);
    g.setFont (lnf.headingFont (16.0f));
    g.drawText (MelodyForgeProcessor::layerName (track).toUpperCase(), head.withTrimmedLeft (4.0f), juce::Justification::centredLeft);
}

// ============================================================================ editor
juce::Label& MelodyForgeEditor::makeLabel (juce::Label& l, const juce::String& text)
{
    l.setText (text, juce::dontSendNotification);
    l.setColour (juce::Label::textColourId, N::textSoft);
    l.setFont (lnf.bodyFont (14.5f));
    content.addAndMakeVisible (l);
    return l;
}

MelodyForgeEditor::MelodyForgeEditor (MelodyForgeProcessor& p)
    : AudioProcessorEditor (&p), proc (p), view (p)
{
    setLookAndFeel (&lnf);
    addAndMakeVisible (content);
    content.onResize = [this] { layout(); };
    content.onPaint = [this] (juce::Graphics& g) { paintContent (g); };
    logo = juce::ImageCache::getFromMemory (IslandAssets::logo_png, IslandAssets::logo_pngSize);

    title.setText ("MELODY GENERATOR", juce::dontSendNotification);
    title.setFont (lnf.headingFont (22.0f));
    title.setColour (juce::Label::textColourId, N::text);
    title.setMinimumHorizontalScale (0.8f);
    content.addAndMakeVisible (title);

    // style / mood / mode / full screen
    makeLabel (styleLabel, pt ("Estilo")).setFont (lnf.bodyFont (11.5f));
    makeLabel (moodLabel, pt ("Clima")).setFont (lnf.bodyFont (11.5f));
    for (size_t i = 0; i < presets::styles().size(); ++i) styleBox.addItem (pt (presets::styles()[i].name), (int) i + 1);
    for (size_t i = 0; i < presets::moods().size(); ++i) moodBox.addItem (pt (presets::moods()[i].name), (int) i + 1);
    styleBox.setTooltip (pt ("Estilo musical: andamento, ritmo, harmonia e timbres sugeridos"));
    moodBox.setTooltip (pt ("Clima: escalas, desenho da melodia e energia"));
    styleBox.onChange = [this]
    {
        if (updating) return;
        proc.setStyle (styleBox.getSelectedItemIndex(), true);
        markStep (0);
        notify (pt ("Estilo: ") + styleBox.getText());
    };
    moodBox.onChange = [this]
    {
        if (updating) return;
        proc.setMood (moodBox.getSelectedItemIndex());
        markStep (0);
        notify (pt ("Clima: ") + moodBox.getText());
    };
    advancedBtn.setButtonText (pt ("Avançado"));
    advancedBtn.setTooltip (pt ("Mostra todos os controles: progressão, tamanho, travas, semente, evolução..."));
    advancedBtn.onClick = [this] { proc.advancedMode = ! proc.advancedMode; applyModeVisibility(); };
    fullBtn.setTooltip (pt ("Tela cheia / tamanho normal"));
    fullBtn.onClick = [this] { toggleFullScreen(); };
    for (auto* c : std::initializer_list<juce::Component*> { &styleBox, &moodBox, &advancedBtn, &fullBtn })
        content.addAndMakeVisible (c);

    // idea area
    view.setTooltip (pt ("Piano roll da ideia: cada cor é uma camada. Clique para tocar ou parar."));
    view.onClick = [this] { playBtn.triggerClick(); };
    content.addAndMakeVisible (view);
    candidateLabel.setJustificationType (juce::Justification::centred);
    candidateLabel.setFont (lnf.bodyFont (14.0f, true));
    candidateLabel.setColour (juce::Label::textColourId, N::text);
    statusLabel.setFont (lnf.bodyFont (13.0f, true));
    statusLabel.setColour (juce::Label::textColourId, N::cyan);
    fitnessLabel.setFont (lnf.bodyFont (13.0f));
    fitnessLabel.setColour (juce::Label::textColourId, N::textSoft);
    fitnessLabel.setJustificationType (juce::Justification::centredRight);
    for (auto* c : { &candidateLabel, &statusLabel, &fitnessLabel }) content.addAndMakeVisible (c);

    prevBtn.setTooltip (pt ("Ideia anterior"));
    nextBtn.setTooltip (pt ("Próxima ideia"));
    playBtn.setTooltip (pt ("Toca a ideia aqui no Melody Generator (independente do play do FL Studio)"));
    newBtn.setButtonText (pt ("Gerar"));
    newBtn.setTooltip (pt ("Cria um novo grupo de ideias com o estilo e o clima escolhidos"));
    evolveBtn.setButtonText (pt ("Evoluir"));
    evolveBtn.setTooltip (pt ("Cruza as melhores ideias (e as que você curtiu) para criar a próxima geração"));
    likeBtn.setButtonText (pt ("Curti"));
    likeBtn.setTooltip (pt ("Marca esta ideia como boa: ela será favorecida ao evoluir"));
    skipBtn.setButtonText (pt ("Pular"));
    skipBtn.setTooltip (pt ("Não gostou? Penaliza esta ideia e mostra a próxima"));
    revertBtn.setButtonText (pt ("Desfazer"));
    revertBtn.setTooltip (pt ("Volta a ideia ao original (desfaz transposições)"));
    for (auto* b : std::initializer_list<juce::Component*> { &prevBtn, &nextBtn, &playBtn, &newBtn, &evolveBtn, &likeBtn, &skipBtn, &revertBtn })
        content.addAndMakeVisible (b);
    newBtn.setToggleState (true, juce::dontSendNotification);   // primary action look
    setAccent (likeBtn, juce::Colour (0xff4fd8ff));
    prevBtn.onClick = [this] { proc.selectCandidate (proc.current <= 0 ? (int) proc.population.size() - 1 : proc.current - 1); };
    nextBtn.onClick = [this] { proc.selectCandidate ((proc.current + 1) % (int) proc.population.size()); };
    playBtn.onClick = [this]
    {
        proc.internalPlay = ! proc.internalPlay.load();
        if (! proc.internalPlay.load() && proc.soloLayer >= 0) proc.setSolo (-1);
        if (proc.internalPlay.load()) markStep (2);
        refresh();
    };
    newBtn.onClick = [this]
    {
        proc.newPopulation ((uint32_t) juce::Random::getSystemRandom().nextInt());
        markStep (1);
        notify (juce::String ((int) proc.population.size()) + pt (" ideias novas"));
    };
    evolveBtn.onClick = [this] { proc.evolveOnce(); notify (pt ("Geração ") + juce::String (proc.generation)); };
    likeBtn.onClick = [this] { proc.like(); markStep (2); notify (pt ("Curtida!")); };
    skipBtn.onClick = [this] { proc.skip(); markStep (2); notify (pt ("Pulada")); };
    revertBtn.onClick = [this] { proc.revertEdits(); notify (pt ("Edições desfeitas")); };

    // layer cards
    for (int t = 0; t < mf::NUM_TRACKS; ++t)
    {
        cards[t] = std::make_unique<LayerCard> (proc, t, lnf);
        cards[t]->onNotify = [this] (const juce::String& s) { notify (s); refresh(); };
        cards[t]->onView = [this] (int tr) { view.selectedTrack = view.selectedTrack == tr ? -1 : tr; refresh(); };
        content.addAndMakeVisible (*cards[t]);
    }

    // side panel
    keyBox.addItem (pt ("Qualquer tom"), 100);
    for (int k = 0; k < 12; ++k) keyBox.addItem (keyNamePt (k) + " (" + mf::noteNameOf (k) + ")", k + 1);
    scaleBox.addItem (pt ("Automática"), 100);
    scaleBox.addSeparator();
    for (size_t i = 0; i < mf::scales().size(); ++i)
    {
        if (i == 5) scaleBox.addSeparator();   // the five main scales first
        scaleBox.addItem (scaleNamePt ((int) i), (int) i + 1);
    }
    for (int b : { 1, 2, 4, 8 }) barsBox.addItem (juce::String (b) + (b == 1 ? pt (" compasso") : pt (" compassos")), b);
    keyBox.setTooltip (pt ("Tom da música. \"Qualquer tom\" deixa o Melody Generator escolher."));
    scaleBox.setTooltip (pt ("Escala: as notas da melodia e os acordes saem sempre dela. \"Automática\" usa as escalas do clima."));
    progressionBox.setTooltip (pt ("Sequência de acordes. Só aparecem as que funcionam na escala escolhida."));
    barsBox.setTooltip (pt ("Tamanho da ideia em compassos"));
    auto lockChange = [this]
    {
        if (updating) return;
        proc.settings.key = juce::jmax (0, keyBox.getSelectedId() - 1);
        if (scaleBox.getSelectedId() > 0 && scaleBox.getSelectedId() != 100) proc.settings.scale = scaleBox.getSelectedId() - 1;
        if (progressionBox.getSelectedId() > 0 && progressionBox.getSelectedId() != 100) proc.settings.progression = progressionBox.getSelectedId() - 1;
        proc.settings.lockKey = lockKey.getToggleState();
        proc.settings.lockScale = lockScale.getToggleState();
        proc.settings.lockProgression = lockProgression.getToggleState();
        proc.applySettings (false);
    };
    keyBox.onChange = [this, lockChange]
    {
        if (updating) return;
        lockKey.setToggleState (keyBox.getSelectedId() != 100, juce::dontSendNotification);   // "Qualquer tom" unlocks
        lockChange();
        notify (pt ("Tom: ") + keyBox.getText());
    };
    scaleBox.onChange = [this, lockChange]
    {
        if (updating) return;
        const bool automatic = scaleBox.getSelectedId() == 100;
        lockScale.setToggleState (! automatic, juce::dontSendNotification);
        // a fixed progression may not fit the new scale: let the generator pick one that does
        if (! automatic && proc.settings.lockProgression && ! mf::progressionFits (proc.settings.progression, scaleBox.getSelectedId() - 1))
            lockProgression.setToggleState (false, juce::dontSendNotification);
        lockChange();
        notify (pt ("Escala: ") + scaleBox.getText());
    };
    progressionBox.onChange = [this, lockChange]
    {
        if (updating) return;
        lockProgression.setToggleState (progressionBox.getSelectedId() != 100, juce::dontSendNotification);
        lockChange();
    };
    for (auto* l : { &lockKey, &lockScale, &lockProgression })
    {
        l->setButtonText ({});
        l->onClick = lockChange;
        l->setTooltip (pt ("Mantém fixo ao gerar e evoluir"));
    }
    barsBox.onChange = [this] { if (! updating) { proc.settings.bars = barsBox.getSelectedId(); proc.applySettings (false); } };
    ideasSlider.setSliderStyle (juce::Slider::LinearHorizontal);
    ideasSlider.setRange (4, mf::MAX_IDEAS, 1);
    ideasSlider.setTextBoxStyle (juce::Slider::TextBoxRight, false, 34, 20);
    ideasSlider.setTooltip (pt ("Quantas ideias gerar de uma vez (até 64)"));
    auto applyIdeas = [this]
    {
        if (updating || (int) ideasSlider.getValue() == proc.settings.populationSize) return;
        proc.setIdeaCount ((int) ideasSlider.getValue());
        notify (juce::String ((int) proc.population.size()) + pt (" ideias"));
    };
    ideasSlider.onDragEnd = applyIdeas;
    ideasSlider.onValueChange = [this, applyIdeas] { if (! ideasSlider.isMouseButtonDown()) applyIdeas(); };
    sharpToggle.setButtonText (pt ("Melodia afiada"));
    sharpToggle.setTooltip (pt ("Melodias diferentes: miram na 7ª, 9ª e 13ª dos acordes e saltam oitavas,\n"
                                "sempre dentro da escala e da progressão. Os acordes ganham a 7ª."));
    sharpToggle.onClick = [this]
    {
        proc.setSharp (sharpToggle.getToggleState());
        notify (sharpToggle.getToggleState() ? pt ("Melodia afiada ligada") : pt ("Melodia afiada desligada"));
    };
    for (auto* s : { &complexitySlider, &harmonySlider })
    {
        s->setSliderStyle (juce::Slider::LinearHorizontal);
        s->setRange (1, 10, 1);
        s->setTextBoxStyle (juce::Slider::TextBoxRight, false, 34, 20);
    }
    complexitySlider.setTooltip (pt ("Complexidade da melodia: mais notas e saltos maiores"));
    harmonySlider.setTooltip (pt ("Riqueza dos acordes (sétimas e tensões)"));
    complexitySlider.onValueChange = [this] { if (! updating) { proc.complexity = (int) complexitySlider.getValue(); proc.applySliders(); } };
    harmonySlider.onValueChange = [this] { if (! updating) { proc.harmony = (int) harmonySlider.getValue(); proc.applySliders(); } };
    volumeSlider.setSliderStyle (juce::Slider::LinearHorizontal);
    volumeSlider.setTextBoxStyle (juce::Slider::TextBoxRight, false, 64, 20);
    volumeSlider.setTextValueSuffix (" dB");
    volumeSlider.setTooltip (pt ("Volume geral do som interno"));
    reverbSlider.setSliderStyle (juce::Slider::LinearHorizontal);
    reverbSlider.setTextBoxStyle (juce::Slider::TextBoxRight, false, 64, 20);
    reverbSlider.setTooltip (pt ("Ambiência (reverberação) do som interno"));
    seedEditor.setInputRestrictions (10, "0123456789");
    seedEditor.setFont (lnf.bodyFont (14.5f));
    seedEditor.setTooltip (pt ("Mesma semente + mesmos ajustes = mesmas ideias"));
    seedBtn.setButtonText (pt ("Aplicar"));
    seedBtn.onClick = [this]
    {
        proc.newPopulation ((uint32_t) seedEditor.getText().getLargeIntValue());
        notify (pt ("Ideias da semente ") + juce::String ((juce::int64) proc.sessionSeed));
    };
    syncToggle.setButtonText (pt ("Tocar junto com o FL"));
    syncToggle.setTooltip (pt ("Desligado (padrão): o Melody Generator só toca quando você aperta Tocar aqui; o espaço do FL não o dispara.\n"
                               "Ligado: toca junto com o play do FL Studio, no andamento e na posição do projeto."));
    syncToggle.onClick = [this] { notify (syncToggle.getToggleState() ? pt ("Agora toca junto com o FL Studio") : pt ("Separado do FL Studio: use o botão Tocar")); };
    previewToggle.setButtonText (pt ("Som interno"));
    previewToggle.setTooltip (pt ("Toca os timbres dentro do plugin"));
    midiOutToggle.setButtonText (pt ("Enviar MIDI"));
    midiOutToggle.setTooltip (pt ("Envia as notas como MIDI (canais 1-3) enquanto toca"));
    hostTempoToggle.setButtonText (pt ("Seguir o BPM do projeto"));
    hostTempoToggle.setTooltip (pt ("Usa o BPM do projeto na reprodução e nos arquivos exportados"));
    loadBankBtn.setButtonText (pt ("SoundFont..."));
    loadBankBtn.setTooltip (pt ("Carregar outro banco de timbres (.sf2)"));
    loadBankBtn.onClick = [this]
    {
        chooser = std::make_unique<juce::FileChooser> (pt ("Escolha um SoundFont (.sf2)"),
                                                       juce::File::getSpecialLocation (juce::File::userDocumentsDirectory), "*.sf2");
        chooser->launchAsync (juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                              [this] (const juce::FileChooser& fc)
                              {
                                  auto f = fc.getResult();
                                  if (f.existsAsFile()) { proc.loadBank (f); notify (pt ("Carregando ") + f.getFileName()); }
                              });
    };
    defaultBankBtn.setButtonText (pt ("Timbres padrão"));
    defaultBankBtn.setTooltip (pt ("Volta para o banco de timbres que vem com o Melody Generator"));
    defaultBankBtn.onClick = [this] { proc.loadBank ({}); };
    for (auto* c : std::initializer_list<juce::Component*> { &keyBox, &scaleBox, &progressionBox, &barsBox, &ideasSlider, &sharpToggle, &lockKey, &lockScale,
                                                              &lockProgression, &complexitySlider, &harmonySlider, &volumeSlider, &reverbSlider,
                                                              &seedEditor, &seedBtn, &syncToggle, &previewToggle, &midiOutToggle,
                                                              &hostTempoToggle, &loadBankBtn, &defaultBankBtn })
        content.addAndMakeVisible (c);
    syncAtt = std::make_unique<juce::AudioProcessorValueTreeState::ButtonAttachment> (proc.apvts, "syncHost", syncToggle);
    previewAtt = std::make_unique<juce::AudioProcessorValueTreeState::ButtonAttachment> (proc.apvts, "preview", previewToggle);
    midiOutAtt = std::make_unique<juce::AudioProcessorValueTreeState::ButtonAttachment> (proc.apvts, "midiOut", midiOutToggle);
    hostTempoAtt = std::make_unique<juce::AudioProcessorValueTreeState::ButtonAttachment> (proc.apvts, "hostTempo", hostTempoToggle);
    volumeAtt = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment> (proc.apvts, "volume", volumeSlider);
    reverbAtt = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment> (proc.apvts, "reverb", reverbSlider);
    reverbSlider.textFromValueFunction = [] (double v) { return juce::String (juce::roundToInt (v * 100)) + "%"; };
    reverbSlider.valueFromTextFunction = [] (const juce::String& s) { return s.getDoubleValue() / 100.0; };
    reverbSlider.updateText();

    makeLabel (keyLabel, pt ("Tom"));
    makeLabel (scaleLabel, pt ("Escala"));
    makeLabel (progressionLabel, pt ("Acordes"));
    makeLabel (barsLabel, pt ("Tamanho"));
    makeLabel (popLabel, pt ("Ideias"));
    makeLabel (complexityLabel, pt ("Complexidade"));
    makeLabel (harmonyLabel, pt ("Harmonia"));
    makeLabel (seedLabel, pt ("Semente"));
    makeLabel (volumeLabel, pt ("Volume"));
    makeLabel (reverbLabel, pt ("Ambiência"));

    // export
    exportBtn.setButtonText (pt ("Exportar"));
    exportBtn.setTooltip (pt ("Salva a ideia como arquivo .mid"));
    exportBtn.onClick = [this] { exportMidi(); };
    dragLabel.setText (pt ("Arraste para o FL:"), juce::dontSendNotification);
    dragLabel.setFont (lnf.bodyFont (13.0f, true));
    dragLabel.setColour (juce::Label::textColourId, N::text);
    dragLabel.setJustificationType (juce::Justification::centredRight);
    dragAll = std::make_unique<DragTile> (proc, pt ("Tudo"), std::vector<int> { mf::Melody, mf::Bass, mf::Chords }, N::cyan);
    dragMelody = std::make_unique<DragTile> (proc, pt ("Melodia"), std::vector<int> { mf::Melody }, N::layer[0]);
    dragBass = std::make_unique<DragTile> (proc, pt ("Baixo"), std::vector<int> { mf::Bass }, N::layer[1]);
    dragChords = std::make_unique<DragTile> (proc, pt ("Acordes"), std::vector<int> { mf::Chords }, N::layer[2]);
    for (auto* t : { dragAll.get(), dragMelody.get(), dragBass.get(), dragChords.get() })
    {
        t->setTooltip (pt ("Clique e arraste para o piano roll ou a playlist do FL Studio"));
        t->onDragged = [this] { markStep (3); notify (pt ("Solte no FL Studio para colar o MIDI")); };
        content.addAndMakeVisible (t);
    }
    content.addAndMakeVisible (exportBtn);
    content.addAndMakeVisible (dragLabel);

    proc.addChangeListener (this);
    setResizable (true, true);
    setResizeLimits (780, 485, 3840, 2400);
    setSize (designWidth, designHeight);
    refresh();
    applyModeVisibility();
    startTimerHz (30);
}

MelodyForgeEditor::~MelodyForgeEditor()
{
    proc.removeChangeListener (this);
    stopTimer();
    setLookAndFeel (nullptr);
}

void MelodyForgeEditor::notify (const juce::String& text)
{
    statusLabel.setText (text, juce::dontSendNotification);
    notifyTicks = 120;
}

void MelodyForgeEditor::markStep (int step)
{
    if (step < 0 || step >= 4 || stepDone[(size_t) step]) return;
    stepDone[(size_t) step] = true;
}

void MelodyForgeEditor::toggleFullScreen()
{
    if (auto* window = dynamic_cast<juce::ResizableWindow*> (getTopLevelComponent()))
    {
        // standalone app: the window itself goes full screen
        window->setFullScreen (! window->isFullScreen());
        fullScreen = window->isFullScreen();
    }
    else if (! fullScreen)
    {
        // inside a DAW: grow the plugin window to the whole screen (the host follows)
        normalBounds = getBounds();
        auto& displays = juce::Desktop::getInstance().getDisplays();
        const auto* d = isShowing() ? displays.getDisplayForRect (getScreenBounds()) : displays.getPrimaryDisplay();
        auto area = d != nullptr ? d->userArea : juce::Rectangle<int> (1920, 1040);
        setSize (juce::jlimit (780, 3840, area.getWidth()), juce::jlimit (485, 2400, area.getHeight() - 40));
        fullScreen = true;
    }
    else
    {
        setSize (normalBounds.getWidth() > 0 ? normalBounds.getWidth() : designWidth, normalBounds.getHeight() > 0 ? normalBounds.getHeight() : designHeight);
        fullScreen = false;
    }
    fullBtn.setIcon (fullScreen ? Icon::ExitFullScreen : Icon::FullScreen);
}

void MelodyForgeEditor::buildChordBoxes()
{
    const auto& p = proc.pattern;
    juce::String key;
    key << proc.genome.key << "/" << proc.genome.scale << "/" << p.bars << "/" << (proc.settings.sharp ? 1 : 0);
    if (key != lastChordKey)
    {
        lastChordKey = key;
        chordBoxes.clear();
        for (int bar = 0; bar < p.bars; ++bar)
        {
            auto* box = chordBoxes.add (new juce::ComboBox());
            for (int d = 0; d < 7; ++d)
                box->addItem (juce::String (bar + 1) + ": " + mf::chordName (proc.genome.key, proc.genome.scale, d, proc.settings.sharp), d + 1);
            box->setTooltip (pt ("Acorde do compasso ") + juce::String (bar + 1));
            box->onChange = [this, bar, box]
            {
                if (updating) return;
                proc.setChord (bar, box->getSelectedItemIndex());
                notify (pt ("Acorde do compasso ") + juce::String (bar + 1) + pt (" alterado"));
            };
            content.addChildComponent (box);
        }
        layout();
    }
    for (int bar = 0; bar < (int) chordBoxes.size() && bar < (int) p.chords.size(); ++bar)
        chordBoxes[bar]->setSelectedItemIndex (p.chords[(size_t) bar].degree, juce::dontSendNotification);
    for (auto* b : chordBoxes) b->setVisible (proc.advancedMode);
}

void MelodyForgeEditor::buildProgressionBox()
{
    const int scale = proc.settings.lockScale ? proc.settings.scale : proc.genome.scale;
    juce::String key;
    key << scale << "/" << (proc.settings.lockProgression ? proc.settings.progression : -1);
    if (key == lastProgressionKey) return;
    lastProgressionKey = key;
    progressionBox.clear (juce::dontSendNotification);
    progressionBox.addItem (pt ("Automática"), 100);
    progressionBox.addSeparator();
    for (int i = 0; i < (int) mf::progressions().size(); ++i)
        if (mf::progressionFits (i, scale) || (proc.settings.lockProgression && proc.settings.progression == i))
            progressionBox.addItem (juce::String::fromUTF8 (mf::progressionLabel (i, scale).c_str()), i + 1);
}

void MelodyForgeEditor::refresh()
{
    juce::ScopedValueSetter<bool> guard (updating, true);
    const auto& p = proc.pattern;
    candidateLabel.setText (proc.current >= 0 ? juce::String (proc.current + 1) + " / " + juce::String ((int) proc.population.size())
                                              : (proc.isEdited() ? pt ("editada") : pt ("ideia")),
                            juce::dontSendNotification);
    juce::String info;
    info << keyNamePt (p.key) << " " << scaleNamePt (p.scale).toLowerCase() << pt ("  ·  ") << p.bpm << " BPM";
    if (proc.settings.sharp) info << pt ("  ·  afiada");
    if (proc.advancedMode)
    {
        auto f = proc.currentFitness();
        info << pt ("  ·  nota ") << juce::roundToInt (f.total * 100.0) << pt ("  ·  geração ") << proc.generation;
    }
    fitnessLabel.setText (info, juce::dontSendNotification);
    const bool playing = proc.internalPlay.load();
    playBtn.setButtonText (playing ? pt ("Parar") : pt ("Tocar"));
    playBtn.setIcon (playing ? Icon::Stop : Icon::Play);
    playBtn.setToggleState (playing, juce::dontSendNotification);
    revertBtn.setEnabled (proc.isEdited());
    keyBox.setSelectedId (proc.settings.lockKey ? proc.settings.key + 1 : 100, juce::dontSendNotification);
    scaleBox.setSelectedId (proc.settings.lockScale ? proc.settings.scale + 1 : 100, juce::dontSendNotification);
    buildProgressionBox();
    progressionBox.setSelectedId (proc.settings.lockProgression ? proc.settings.progression + 1 : 100, juce::dontSendNotification);
    lockKey.setToggleState (proc.settings.lockKey, juce::dontSendNotification);
    lockScale.setToggleState (proc.settings.lockScale, juce::dontSendNotification);
    lockProgression.setToggleState (proc.settings.lockProgression, juce::dontSendNotification);
    barsBox.setSelectedId (proc.settings.bars, juce::dontSendNotification);
    if (! ideasSlider.isMouseButtonDown()) ideasSlider.setValue (proc.settings.populationSize, juce::dontSendNotification);
    sharpToggle.setToggleState (proc.settings.sharp, juce::dontSendNotification);
    advancedBtn.setToggleState (proc.advancedMode, juce::dontSendNotification);
    complexitySlider.setValue (proc.complexity, juce::dontSendNotification);
    harmonySlider.setValue (proc.harmony, juce::dontSendNotification);
    if (! seedEditor.hasKeyboardFocus (true)) seedEditor.setText (juce::String ((juce::int64) proc.sessionSeed), false);
    styleBox.setSelectedItemIndex (proc.style, juce::dontSendNotification);
    moodBox.setSelectedItemIndex (proc.mood, juce::dontSendNotification);
    styleBox.setTooltip (pt (presets::styles()[(size_t) proc.style].hint));
    moodBox.setTooltip (pt (presets::moods()[(size_t) proc.mood].hint));
    loadBankBtn.setTooltip (pt ("Carregar outro banco de timbres (.sf2). Atual: ") + proc.getBankMessage());
    for (auto& c : cards) c->refresh (proc.advancedMode);
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
    phase += 0.18f;
    const bool playing = proc.playheadTicks.load() >= 0;
    playBtn.pulse = proc.internalPlay.load();
    playBtn.pulsePhase = phase;
    if (playBtn.pulse) playBtn.repaint();
    if (proc.internalPlay.load() != playBtn.getToggleState()) refresh();
    for (int t = 0; t < mf::NUM_TRACKS; ++t)
    {
        const float a = juce::jlimit (0.0f, 1.0f, proc.sampler.activity[(size_t) t].exchange (0.0f) * 2.5f);
        activity[(size_t) t] = std::max (a, activity[(size_t) t] * 0.82f);
        cards[t]->setActivity (activity[(size_t) t] < 0.02f ? 0.0f : activity[(size_t) t]);
        cards[t]->tick (phase);
    }
    if (playing || proc.soloLayer >= 0) view.repaint();
    const int bankState = (int) proc.getBankState();
    if (bankState != lastBankState) { lastBankState = bankState; refresh(); }
}

void MelodyForgeEditor::exportMidi()
{
    auto dir = juce::File::getSpecialLocation (juce::File::userDocumentsDirectory);
    chooser = std::make_unique<juce::FileChooser> (pt ("Exportar MIDI"), dir.getChildFile (proc.fileBaseName() + ".mid"), "*.mid");
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
                              markStep (3);
                              if (file.replaceWithData (bytes.data(), bytes.size())) notify (pt ("Salvo: ") + file.getFileName());
                              else notify (pt ("Não foi possível salvar ") + file.getFullPathName());
                          });
}

void MelodyForgeEditor::applyModeVisibility()
{
    bool adv = proc.advancedMode;
    advancedBtn.setToggleState (adv, juce::dontSendNotification);
    std::initializer_list<juce::Component*> advancedOnly { &progressionBox, &barsBox, &lockKey, &lockScale, &lockProgression,
                                                           &harmonySlider, &seedEditor, &seedBtn, &evolveBtn, &revertBtn,
                                                           &progressionLabel, &barsLabel, &harmonyLabel, &seedLabel,
                                                           &syncToggle, &previewToggle, &midiOutToggle, &hostTempoToggle,
                                                           &loadBankBtn, &defaultBankBtn };
    for (auto* c : advancedOnly) c->setVisible (adv);
    if (! updating) refresh();
    layout();
    content.repaint();
}

// ---------------------------------------------------------------------------- painting
void MelodyForgeEditor::paint (juce::Graphics& g) { g.fillAll (N::bg); }

void MelodyForgeEditor::paintContent (juce::Graphics& g)
{
    const auto bounds = content.getLocalBounds().toFloat();
    g.setGradientFill (juce::ColourGradient (N::bg2, 0, 0, N::bg, 0, bounds.getHeight(), false));
    g.fillAll();

    auto h = headerArea.toFloat();
    g.setGradientFill (juce::ColourGradient (N::deep, h.getX(), h.getY(), N::bg.withAlpha (0.0f), h.getRight() * 0.75f, h.getBottom(), false));
    g.fillRect (h);
    {
        juce::Path line;
        line.startNewSubPath (0, h.getBottom());
        line.lineTo (bounds.getWidth(), h.getBottom());
        N::glowPath (g, line, N::cyan, 1.4f, 1.0f);
    }
    if (logo.isValid())
    {
        float lh = h.getHeight() - 12.0f, lw = lh * (float) logo.getWidth() / (float) logo.getHeight();
        g.setOpacity (1.0f);
        g.drawImage (logo, juce::Rectangle<float> (h.getX() + 12.0f, h.getY() + 6.0f, lw, lh), juce::RectanglePlacement::centred);
    }

    for (auto area : { sideArea, exportArea })
    {
        auto a = area.toFloat();
        g.setColour (N::panel);
        g.fillRoundedRectangle (a, 12.0f);
        g.setColour (N::line);
        g.drawRoundedRectangle (a.reduced (0.5f), 12.0f, 1.2f);
    }
}

// ---------------------------------------------------------------------------- layout
void MelodyForgeEditor::resized()
{
    const float k = juce::jlimit (0.9f, 2.4f, juce::jmin (getWidth() / (float) designWidth, getHeight() / (float) designHeight));
    content.setTransform (juce::AffineTransform::scale (k));
    content.setBounds (0, 0, juce::roundToInt (getWidth() / k), juce::roundToInt (getHeight() / k));
}

void MelodyForgeEditor::layout()
{
    const bool adv = proc.advancedMode;
    auto r = content.getLocalBounds();

    // header: logo, title, style, mood, advanced, full screen
    headerArea = r.removeFromTop (54);
    {
        auto h = headerArea.reduced (12, 6);
        int logoW = logo.isValid() ? (int) ((54 - 12) * logo.getWidth() / (float) logo.getHeight()) : 0;
        h.removeFromLeft (logoW + 10);
        fullBtn.setBounds (h.removeFromRight (38).withSizeKeepingCentre (38, 34));
        h.removeFromRight (6);
        advancedBtn.setBounds (h.removeFromRight (100).withSizeKeepingCentre (100, 34));
        h.removeFromRight (12);
        auto moodCol = h.removeFromRight (150);
        moodLabel.setBounds (moodCol.removeFromTop (14));
        moodBox.setBounds (moodCol.reduced (0, 1));
        h.removeFromRight (8);
        auto styleCol = h.removeFromRight (150);
        styleLabel.setBounds (styleCol.removeFromTop (14));
        styleBox.setBounds (styleCol.reduced (0, 1));
        h.removeFromRight (10);
        title.setBounds (h);
    }
    r.reduce (12, 10);
    exportArea = r.removeFromBottom (46);
    r.removeFromBottom (8);
    sideArea = r.removeFromRight (250);
    r.removeFromRight (12);
    ideaArea = r;

    // idea column: transport
    auto idea = ideaArea;
    auto top = idea.removeFromTop (38);
    prevBtn.setBounds (top.removeFromLeft (34));
    candidateLabel.setBounds (top.removeFromLeft (64));
    nextBtn.setBounds (top.removeFromLeft (34));
    top.removeFromLeft (6);
    const int shares = adv ? 5 : 4;
    const int bw = (top.getWidth() - (shares - 1) * 4) / shares;
    playBtn.setBounds (top.removeFromLeft (bw)); top.removeFromLeft (4);
    newBtn.setBounds (top.removeFromLeft (bw)); top.removeFromLeft (4);
    if (adv) { evolveBtn.setBounds (top.removeFromLeft (bw)); top.removeFromLeft (4); }
    likeBtn.setBounds (top.removeFromLeft (bw)); top.removeFromLeft (4);
    skipBtn.setBounds (top);
    idea.removeFromTop (6);
    if (adv && ! chordBoxes.isEmpty())
    {
        auto row = idea.removeFromTop (28);
        revertBtn.setBounds (row.removeFromRight (96).expanded (0, 2));
        row.removeFromRight (4);
        int w = row.getWidth() / chordBoxes.size();
        for (auto* b : chordBoxes) b->setBounds (row.removeFromLeft (w).reduced (2, 0));
        idea.removeFromTop (6);
    }
    cardsArea = idea.removeFromBottom (130);
    idea.removeFromBottom (6);
    auto infoRow = idea.removeFromBottom (20);
    fitnessLabel.setBounds (infoRow);
    statusLabel.setBounds (infoRow.removeFromLeft (infoRow.getWidth() / 2));
    idea.removeFromBottom (4);
    view.setBounds (idea);
    {
        auto c = cardsArea;
        const int w = (c.getWidth() - 2 * 8) / 3;
        for (int t = 0; t < mf::NUM_TRACKS; ++t)
        {
            cards[t]->setBounds (c.removeFromLeft (w));
            c.removeFromLeft (8);
        }
    }

    // side panel
    auto c = sideArea.reduced (12, 10);
    const int rowH = adv ? 26 : 30, gap = adv ? 2 : 6;
    auto addRow = [&] (juce::Label& label, juce::Component& comp, juce::Component* lock)
    {
        if (! comp.isVisible()) return;
        auto row = c.removeFromTop (rowH);
        label.setBounds (row.removeFromLeft (84));
        if (lock != nullptr && lock->isVisible()) { lock->setBounds (row.removeFromRight (40)); row.removeFromRight (2); }
        comp.setBounds (row.reduced (0, 1));
        c.removeFromTop (gap);
    };
    addRow (keyLabel, keyBox, &lockKey);
    addRow (scaleLabel, scaleBox, &lockScale);
    addRow (progressionLabel, progressionBox, &lockProgression);
    addRow (barsLabel, barsBox, nullptr);
    addRow (popLabel, ideasSlider, nullptr);
    sharpToggle.setBounds (c.removeFromTop (rowH));
    c.removeFromTop (gap);
    addRow (complexityLabel, complexitySlider, nullptr);
    addRow (harmonyLabel, harmonySlider, nullptr);
    if (seedEditor.isVisible())
    {
        auto row = c.removeFromTop (rowH);
        seedLabel.setBounds (row.removeFromLeft (84));
        seedBtn.setBounds (row.removeFromRight (64));
        row.removeFromRight (4);
        seedEditor.setBounds (row.reduced (0, 2));
        c.removeFromTop (gap);
    }
    addRow (volumeLabel, volumeSlider, nullptr);
    addRow (reverbLabel, reverbSlider, nullptr);
    if (adv)
    {
        c.removeFromTop (2);
        for (auto* t : std::initializer_list<juce::Component*> { &syncToggle, &hostTempoToggle, &previewToggle, &midiOutToggle })
            t->setBounds (c.removeFromTop (23));
    }

    // export row
    auto e = exportArea.reduced (8, 6);
    exportBtn.setBounds (e.removeFromLeft (112));
    if (adv)
    {
        defaultBankBtn.setBounds (e.removeFromRight (84));
        loadBankBtn.setBounds (e.removeFromRight (112));
        e.removeFromRight (4);
        defaultBankBtn.setButtonText (pt ("Padrão"));
    }
    dragLabel.setBounds (e.removeFromLeft (128));
    e.removeFromLeft (4);
    int w = e.getWidth() / 4;
    for (auto* t : { dragAll.get(), dragMelody.get(), dragBass.get(), dragChords.get() }) t->setBounds (e.removeFromLeft (w));
}

} // namespace mfplug
