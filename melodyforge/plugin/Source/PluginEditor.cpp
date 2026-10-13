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
    static const char* n[] = { "maior", "menor", "dórico", "mixolídio", "menor harmônica", "pentatônica maior", "pentatônica menor", "blues" };
    return pt (n[juce::jlimit (0, 7, i)]);
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
    auto chordStrip = area.removeFromTop (28.0f);
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
        g.setFont (juce::Font (15.5f, juce::Font::bold));
        g.drawText (p.chords[(size_t) bar].name, cell.reduced (10, 0), juce::Justification::centredLeft);
        g.setColour (N::muted);
        g.setFont (12.5f);
        g.drawText (pt ("compasso ") + juce::String (bar + 1), cell.reduced (10, 0), juce::Justification::centredRight);
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
    else
    {
        g.setFont (13.5f);
        const auto hint = pt ("Clique aqui ou em Tocar para ouvir");
        auto box = area.reduced (6, 4).removeFromBottom (20.0f).removeFromRight ((float) g.getCurrentFont().getStringWidth (hint) + 16.0f);
        g.setColour (N::bg.withAlpha (0.8f));
        g.fillRoundedRectangle (box, 6.0f);
        g.setColour (N::muted);
        g.drawText (hint, box, juce::Justification::centred);
    }

    // legend
    auto legend = area.removeFromTop (20.0f).removeFromRight (290.0f);
    g.setColour (N::bg.withAlpha (0.8f));
    g.fillRoundedRectangle (legend.expanded (4.0f, 1.0f), 6.0f);
    for (int t = mf::NUM_TRACKS - 1; t >= 0; --t)
    {
        auto item = legend.removeFromRight (95.0f);
        g.setColour (N::layer[t]);
        g.fillEllipse (item.getX(), item.getCentreY() - 4.0f, 8.0f, 8.0f);
        g.setColour (N::textSoft);
        g.setFont (13.0f);
        g.drawText (MelodyForgeProcessor::layerName (t), item.withTrimmedLeft (13), juce::Justification::centredLeft);
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
    g.setFont (juce::Font (15.0f, juce::Font::bold));
    const float textW = (float) g.getCurrentFont().getStringWidth (text);
    const float iconS = 16.0f;
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
    auto dir = juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile ("MelodyForge-ISLAND27");
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
static const char* layerExplain[] = {
    "A parte principal, que você cantaria ou assobiaria. Notas mais agudas, uma de cada vez.",
    "A base grave que dá peso e segura o ritmo. Notas graves que acompanham os acordes.",
    "Várias notas tocadas juntas que criam o clima (alegre, triste, tenso...). É o fundo da música.",
};

static std::vector<int> recommendedFor (int track)
{
    switch (track)
    {
        case mf::Melody: return { 0, 10, 11, 8, 24, 73, 65, 81, 98 };
        case mf::Bass:   return { instruments::builtin808, 33, 32, 34, 36, 38, 39 };
        default:         return { 0, 4, 48, 89, 90, 95, 52, 61, 19 };
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
    soloBtn.setButtonText (pt ("Ouvir só"));
    soloBtn.setTooltip (pt ("Toca só esta camada, para você ouvir o que ela faz"));
    soloBtn.onClick = [this]
    {
        const bool solo = proc.soloLayer != track;
        proc.setSolo (solo ? track : -1);
        if (solo && ! proc.internalPlay.load() && ! (proc.syncsWithHost() && proc.hostPlaying.load())) proc.internalPlay = true;
        if (onNotify) onNotify (solo ? pt ("Ouvindo só: ") + MelodyForgeProcessor::layerName (track) : pt ("Ouvindo todas as camadas"));
    };
    rerollBtn.setButtonText (pt ("Nova variação"));
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
    volume.setTextBoxStyle (juce::Slider::TextBoxRight, false, 64, 20);
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
    auto r = getLocalBounds().reduced (12, 10);
    auto head = r.removeFromTop (advanced ? 46 : 58);
    illustration = head.removeFromLeft (advanced ? 56 : 70).toFloat().reduced (2.0f);
    onOff.setBounds (head.removeFromRight (44).withSizeKeepingCentre (44, 28));
    r.removeFromTop (advanced ? 4 : 62);   // beginner: room for the explanation text
    instrumentBox.setBounds (r.removeFromTop (32));
    r.removeFromTop (6);
    auto volRow = r.removeFromTop (28);
    if (advanced)
    {
        upBtn.setBounds (volRow.removeFromRight (44));
        downBtn.setBounds (volRow.removeFromRight (44));
        volRow.removeFromRight (2);
    }
    volume.setBounds (volRow);
    r.removeFromTop (6);
    auto row = r.removeFromTop (36);
    if (advanced)
    {
        const int w = row.getWidth();
        soloBtn.setBounds (row.removeFromLeft (w * 30 / 100));
        rerollBtn.setBounds (row.removeFromLeft (w * 40 / 100));
        viewBtn.setBounds (row);
    }
    else
    {
        soloBtn.setBounds (row.removeFromLeft (row.getWidth() * 42 / 100));
        rerollBtn.setBounds (row);
    }
}

void LayerCard::drawIllustration (juce::Graphics& g, juce::Rectangle<float> r)
{
    const auto c = N::layer[track];
    const float pulse = activity > 0.02f ? 0.5f + 0.5f * std::sin (animPhase * 2.0f) : 0.0f;
    const float glowAmt = 0.4f + 1.6f * activity + 0.4f * pulse * activity;
    g.setColour (c.withAlpha (0.08f + 0.12f * activity));
    g.fillRoundedRectangle (r, 10.0f);
    g.setColour (c.withAlpha (0.35f + 0.5f * activity));
    g.drawRoundedRectangle (r, 10.0f, 1.2f);
    auto a = r.reduced (r.getWidth() * 0.1f, r.getHeight() * 0.14f);
    auto P = [&] (float fx, float fy) { return juce::Point<float> (a.getX() + fx * a.getWidth(), a.getY() + fy * a.getHeight()); };
    const float head = a.getHeight() * 0.2f;
    auto noteHead = [&] (juce::Point<float> at, float scale = 1.0f)
    {
        g.fillEllipse (juce::Rectangle<float> (head * 1.3f * scale, head * scale).withCentre (at));
    };

    if (track == mf::Melody)
    {
        // a singing line with notes going up and down
        g.setColour (juce::Colours::white.withAlpha (0.08f));
        for (int i = 0; i < 3; ++i) g.drawHorizontalLine ((int) P (0, 0.3f + 0.25f * (float) i).y, a.getX(), a.getRight());
        juce::Path line;
        const float pts[][2] = { { 0.05f, 0.75f }, { 0.3f, 0.35f }, { 0.55f, 0.55f }, { 0.8f, 0.15f }, { 0.95f, 0.3f } };
        line.startNewSubPath (P (pts[0][0], pts[0][1]));
        for (int i = 1; i < 5; ++i)
        {
            auto prev = P (pts[i - 1][0], pts[i - 1][1]), cur = P (pts[i][0], pts[i][1]);
            line.cubicTo ({ (prev.x + cur.x) * 0.5f, prev.y }, { (prev.x + cur.x) * 0.5f, cur.y }, cur);
        }
        N::glowPath (g, line, c, 1.6f, glowAmt);
        g.setColour (c);
        for (int i = 0; i < 4; ++i) noteHead (P (pts[i][0], pts[i][1]), i == (int) (animPhase * 1.5f) % 4 && activity > 0.02f ? 1.4f : 1.0f);
    }
    else if (track == mf::Bass)
    {
        // a deep, thick wave with big low notes
        juce::Path wave;
        for (int i = 0; i <= 40; ++i)
        {
            float t = (float) i / 40.0f;
            auto pnt = P (t, 0.62f + 0.22f * std::sin (t * 6.283f + animPhase * (activity > 0.02f ? 1.0f : 0.0f)));
            if (i == 0) wave.startNewSubPath (pnt); else wave.lineTo (pnt);
        }
        N::glowPath (g, wave, c, 3.2f, glowAmt);
        g.setColour (c);
        noteHead (P (0.22f, 0.2f), 1.35f);
        g.fillRect (juce::Rectangle<float> (2.0f, a.getHeight() * 0.32f).withPosition (P (0.22f, 0.2f).x + head * 0.8f, P (0.22f, 0.2f).y - a.getHeight() * 0.32f + 2.0f));
        noteHead (P (0.7f, 0.25f), 1.35f);
        g.fillRect (juce::Rectangle<float> (2.0f, a.getHeight() * 0.32f).withPosition (P (0.7f, 0.25f).x + head * 0.8f, P (0.7f, 0.25f).y - a.getHeight() * 0.32f + 2.0f));
    }
    else
    {
        // stacked notes (chords) above a small keyboard with three keys lit
        auto keys = juce::Rectangle<float> (a.getX(), P (0, 0.62f).y, a.getWidth(), a.getHeight() * 0.38f);
        const int nk = 7;
        const float kw = keys.getWidth() / nk;
        for (int k = 0; k < nk; ++k)
        {
            auto key = juce::Rectangle<float> (keys.getX() + (float) k * kw, keys.getY(), kw - 1.5f, keys.getHeight());
            const bool lit = k == 0 || k == 2 || k == 4;
            g.setColour (lit ? c.withAlpha (0.55f + 0.45f * activity) : juce::Colours::white.withAlpha (0.18f));
            g.fillRoundedRectangle (key, 1.5f);
        }
        g.setColour (c);
        for (int col = 0; col < 3; ++col)
            for (int k = 0; k < 3; ++k)
                noteHead (P (0.15f + 0.35f * (float) col, 0.45f - 0.17f * (float) k - (col == 1 ? 0.06f : 0.0f)), 0.85f);
        if (activity > 0.02f) N::glow (g, keys, 2.0f, c, glowAmt, 2);
    }
}

void LayerCard::paint (juce::Graphics& g)
{
    auto r = getLocalBounds().toFloat().reduced (3.0f);
    const auto c = N::layer[track];
    const bool on = proc.layerOn[(size_t) track];
    if (activity > 0.02f) N::glow (g, r, 14.0f, c, 0.4f + activity);
    g.setGradientFill (juce::ColourGradient (N::panelHi, r.getX(), r.getY(), N::panel, r.getX(), r.getBottom(), false));
    g.fillRoundedRectangle (r, 14.0f);
    g.setColour (on ? c.withAlpha (0.45f + 0.5f * activity) : N::line);
    g.drawRoundedRectangle (r, 14.0f, 1.4f);
    // coloured top edge
    g.setColour (on ? c : c.withAlpha (0.3f));
    g.fillRoundedRectangle (r.withHeight (4.0f).reduced (14.0f, 0.0f), 2.0f);

    drawIllustration (g, illustration);

    auto head = getLocalBounds().reduced (12, 10).removeFromTop (advanced ? 46 : 58).toFloat();
    head.removeFromLeft (illustration.getWidth() + 12.0f);
    head.removeFromRight (48.0f);
    g.setColour (on ? c : N::muted);
    g.setFont (lnf.headingFont (advanced ? 18.0f : 20.0f));
    g.drawText (MelodyForgeProcessor::layerName (track).toUpperCase(), head.removeFromTop (head.getHeight() * 0.58f), juce::Justification::bottomLeft);
    g.setColour (N::muted);
    g.setFont (lnf.bodyFont (13.0f));
    static const char* sub[] = { "canal MIDI 1", "canal MIDI 2", "canal MIDI 3" };
    g.drawText (pt (sub[track]) + (on ? juce::String() : pt ("  ·  desligada")), head, juce::Justification::topLeft);

    if (! advanced)
    {
        auto text = getLocalBounds().reduced (14, 10).withTrimmedTop (62).removeFromTop (58);
        g.setColour (N::textSoft);
        g.setFont (lnf.bodyFont (14.5f));
        g.drawFittedText (pt (layerExplain[track]), text, juce::Justification::topLeft, 3, 0.9f);
    }
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

    title.setText ("MELODYFORGE", juce::dontSendNotification);
    title.setFont (lnf.headingFont (28.0f));
    title.setColour (juce::Label::textColourId, N::text);
    subtitle.setText (pt ("Gerador de ideias musicais  ·  ISLAND27"), juce::dontSendNotification);
    subtitle.setFont (lnf.bodyFont (14.5f));
    subtitle.setColour (juce::Label::textColourId, N::cyan);
    for (auto* c : { &title, &subtitle }) content.addAndMakeVisible (c);

    // style / mood / mode / full screen
    makeLabel (styleLabel, pt ("Estilo")).setFont (lnf.bodyFont (13.0f));
    makeLabel (moodLabel, pt ("Clima")).setFont (lnf.bodyFont (13.0f));
    for (size_t i = 0; i < presets::styles().size(); ++i) styleBox.addItem (pt (presets::styles()[i].name), (int) i + 1);
    for (size_t i = 0; i < presets::moods().size(); ++i) moodBox.addItem (pt (presets::moods()[i].name), (int) i + 1);
    styleBox.setTooltip (pt ("Estilo musical: andamento, ritmo, harmonia e timbres sugeridos"));
    moodBox.setTooltip (pt ("Clima: escalas, desenho da melodia e energia"));
    styleBox.onChange = [this]
    {
        if (updating) return;
        proc.setStyle (styleBox.getSelectedItemIndex(), true);
        markStep (0);
        notify (pt ("Estilo: ") + styleBox.getText() + pt (" - timbres do estilo aplicados"));
    };
    moodBox.onChange = [this]
    {
        if (updating) return;
        proc.setMood (moodBox.getSelectedItemIndex());
        markStep (0);
        notify (pt ("Clima: ") + moodBox.getText());
    };
    beginnerBtn.setButtonText (pt ("Iniciante"));
    advancedBtn.setButtonText (pt ("Avançado"));
    beginnerBtn.setTooltip (pt ("Só o essencial, com explicações"));
    advancedBtn.setTooltip (pt ("Todos os controles: escala, progressão, travas, semente, evolução..."));
    beginnerBtn.onClick = [this] { proc.advancedMode = false; applyModeVisibility(); };
    advancedBtn.onClick = [this] { proc.advancedMode = true; applyModeVisibility(); };
    fullBtn.setButtonText (pt ("Tela cheia"));
    fullBtn.setTooltip (pt ("Tela cheia / tamanho normal"));
    fullBtn.onClick = [this] { toggleFullScreen(); };
    for (auto* c : std::initializer_list<juce::Component*> { &styleBox, &moodBox, &beginnerBtn, &advancedBtn, &fullBtn })
        content.addAndMakeVisible (c);

    hintLabel.setFont (lnf.bodyFont (14.5f));
    hintLabel.setColour (juce::Label::textColourId, N::textSoft);
    content.addAndMakeVisible (hintLabel);

    // idea area
    view.setTooltip (pt ("Piano roll da ideia: cada cor é uma camada. Clique para tocar ou parar."));
    view.onClick = [this] { playBtn.triggerClick(); };
    content.addAndMakeVisible (view);
    candidateLabel.setJustificationType (juce::Justification::centred);
    candidateLabel.setFont (lnf.bodyFont (15.5f, true));
    candidateLabel.setColour (juce::Label::textColourId, N::text);
    statusLabel.setFont (lnf.bodyFont (14.5f, true));
    statusLabel.setColour (juce::Label::textColourId, N::cyan);
    fitnessLabel.setFont (lnf.bodyFont (14.0f));
    fitnessLabel.setColour (juce::Label::textColourId, N::muted);
    fitnessLabel.setJustificationType (juce::Justification::centredRight);
    for (auto* c : { &candidateLabel, &statusLabel, &fitnessLabel }) content.addAndMakeVisible (c);

    prevBtn.setTooltip (pt ("Ideia anterior"));
    nextBtn.setTooltip (pt ("Próxima ideia"));
    playBtn.setTooltip (pt ("Toca a ideia aqui no MelodyForge (independente do play do FL Studio)"));
    newBtn.setButtonText (pt ("Gerar ideias"));
    newBtn.setTooltip (pt ("Cria um novo grupo de ideias com o estilo e o clima escolhidos"));
    evolveBtn.setButtonText (pt ("Evoluir"));
    evolveBtn.setTooltip (pt ("Cruza as melhores ideias (e as que você curtiu) para criar a próxima geração"));
    likeBtn.setButtonText (pt ("Curti"));
    likeBtn.setTooltip (pt ("Marca esta ideia como boa: ela será favorecida ao evoluir"));
    skipBtn.setButtonText (pt ("Pular"));
    skipBtn.setTooltip (pt ("Não gostou? Penaliza esta ideia e mostra a próxima"));
    revertBtn.setButtonText (pt ("Desfazer edições"));
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
        notify (pt ("Novas ideias criadas - semente ") + juce::String ((juce::int64) proc.sessionSeed));
    };
    evolveBtn.onClick = [this] { proc.evolveOnce(); notify (pt ("Geração ") + juce::String (proc.generation)); };
    likeBtn.onClick = [this] { proc.like(); markStep (2); notify (pt ("Curtida! Ideias parecidas serão favorecidas")); };
    skipBtn.onClick = [this] { proc.skip(); markStep (2); notify (pt ("Pulada - mostrando a próxima")); };
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
    for (size_t i = 0; i < mf::scales().size(); ++i) scaleBox.addItem (scaleNamePt ((int) i).substring (0, 1).toUpperCase() + scaleNamePt ((int) i).substring (1), (int) i + 1);
    for (size_t i = 0; i < mf::progressions().size(); ++i) progressionBox.addItem (mf::progressions()[i].name, (int) i + 1);
    for (int b : { 1, 2, 4, 8 }) barsBox.addItem (juce::String (b) + (b == 1 ? pt (" compasso") : pt (" compassos")), b);
    for (int n : { 4, 8, 12, 16, 24, 32 }) popBox.addItem (juce::String (n) + pt (" ideias"), n);
    keyBox.setTooltip (pt ("Tom da música. \"Qualquer tom\" deixa o MelodyForge escolher."));
    scaleBox.setTooltip (pt ("Escala: quais notas soam \"dentro\" da música"));
    progressionBox.setTooltip (pt ("Sequência de acordes (graus da escala)"));
    barsBox.setTooltip (pt ("Tamanho da ideia em compassos"));
    popBox.setTooltip (pt ("Quantas ideias por geração"));
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
        lockKey.setToggleState (keyBox.getSelectedId() != 100, juce::dontSendNotification);   // "Qualquer tom" unlocks
        lockChange();
        notify (pt ("Tom: ") + keyBox.getText());
    };
    scaleBox.onChange = [this, lockChange] { if (! updating) { lockScale.setToggleState (true, juce::dontSendNotification); lockChange(); } };
    progressionBox.onChange = [this, lockChange] { if (! updating) { lockProgression.setToggleState (true, juce::dontSendNotification); lockChange(); } };
    for (auto* l : { &lockKey, &lockScale, &lockProgression })
    {
        l->setButtonText (pt ("fixo"));
        l->onClick = lockChange;
        l->setTooltip (pt ("Mantém fixo ao gerar e evoluir"));
    }
    barsBox.onChange = [this] { if (! updating) { proc.settings.bars = barsBox.getSelectedId(); proc.applySettings (false); } };
    popBox.onChange = [this] { if (! updating) { proc.settings.populationSize = popBox.getSelectedId(); proc.applySettings (true); } };
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
    syncToggle.setButtonText (pt ("Tocar junto com o FL Studio"));
    syncToggle.setTooltip (pt ("Desligado (padrão): o MelodyForge só toca quando você aperta Tocar aqui; o espaço do FL não o dispara.\n"
                               "Ligado: toca junto com o play do FL Studio, no andamento e na posição do projeto."));
    syncToggle.onClick = [this] { notify (syncToggle.getToggleState() ? pt ("Agora toca junto com o FL Studio") : pt ("Separado do FL Studio: use o botão Tocar")); };
    previewToggle.setButtonText (pt ("Som interno"));
    previewToggle.setTooltip (pt ("Toca os timbres dentro do plugin"));
    midiOutToggle.setButtonText (pt ("Enviar MIDI para o FL"));
    midiOutToggle.setTooltip (pt ("Envia as notas como MIDI (canais 1-3) enquanto toca"));
    hostTempoToggle.setButtonText (pt ("Seguir o andamento do projeto"));
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
    defaultBankBtn.setTooltip (pt ("Volta para o banco de timbres que vem com o MelodyForge"));
    defaultBankBtn.onClick = [this] { proc.loadBank ({}); };
    bankLabel.setFont (lnf.bodyFont (13.0f));
    bankLabel.setColour (juce::Label::textColourId, N::muted);
    bankLabel.setMinimumHorizontalScale (0.7f);
    for (auto* c : std::initializer_list<juce::Component*> { &keyBox, &scaleBox, &progressionBox, &barsBox, &popBox, &lockKey, &lockScale,
                                                              &lockProgression, &complexitySlider, &harmonySlider, &volumeSlider, &reverbSlider,
                                                              &seedEditor, &seedBtn, &syncToggle, &previewToggle, &midiOutToggle,
                                                              &hostTempoToggle, &loadBankBtn, &defaultBankBtn, &bankLabel })
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
    exportBtn.setButtonText (pt ("Exportar MIDI..."));
    exportBtn.setTooltip (pt ("Salva a ideia como arquivo .mid"));
    exportBtn.onClick = [this] { exportMidi(); };
    dragLabel.setText (pt ("Arraste para o FL Studio:"), juce::dontSendNotification);
    dragLabel.setFont (lnf.bodyFont (15.0f, true));
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
    setResizeLimits (1000, 650, 3840, 2400);
    setSize (1180, 760);
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
    content.repaint (guideArea);
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
        setSize (juce::jlimit (1000, 3840, area.getWidth()), juce::jlimit (650, 2400, area.getHeight() - 40));
        fullScreen = true;
    }
    else
    {
        setSize (normalBounds.getWidth() > 0 ? normalBounds.getWidth() : 1180, normalBounds.getHeight() > 0 ? normalBounds.getHeight() : 760);
        fullScreen = false;
    }
    fullBtn.setIcon (fullScreen ? Icon::ExitFullScreen : Icon::FullScreen);
    fullBtn.setButtonText (fullScreen ? pt ("Tamanho normal") : pt ("Tela cheia"));
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

void MelodyForgeEditor::refresh()
{
    juce::ScopedValueSetter<bool> guard (updating, true);
    const auto& p = proc.pattern;
    candidateLabel.setText (proc.current >= 0 ? pt ("Ideia ") + juce::String (proc.current + 1) + pt (" de ") + juce::String ((int) proc.population.size())
                                              : (proc.isEdited() ? pt ("Ideia editada") : pt ("Ideia")),
                            juce::dontSendNotification);
    auto f = proc.currentFitness();
    juce::String info;
    info << keyNamePt (p.key) << " " << scaleNamePt (p.scale) << pt ("  ·  ") << p.bpm << pt (" BPM  ·  pontuação ")
         << juce::roundToInt (f.total * 100.0);
    if (proc.advancedMode)
        info << pt (" (melodia ") << juce::roundToInt (f.melodic * 100.0) << pt (" · harmonia ") << juce::roundToInt (f.harmonic * 100.0)
             << pt (" · ritmo ") << juce::roundToInt (f.rhythmic * 100.0) << pt (")  ·  geração ") << proc.generation;
    fitnessLabel.setText (info, juce::dontSendNotification);
    const bool playing = proc.internalPlay.load();
    playBtn.setButtonText (playing ? pt ("Parar") : pt ("Tocar"));
    playBtn.setIcon (playing ? Icon::Stop : Icon::Play);
    playBtn.setToggleState (playing, juce::dontSendNotification);
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
    moodBox.setSelectedItemIndex (proc.mood, juce::dontSendNotification);
    hintLabel.setText (pt (presets::styles()[(size_t) proc.style].name) + ": " + pt (presets::styles()[(size_t) proc.style].hint) + pt ("   ·   ")
                           + pt (presets::moods()[(size_t) proc.mood].name) + ": " + pt (presets::moods()[(size_t) proc.mood].hint),
                       juce::dontSendNotification);
    bankLabel.setText (proc.getBankMessage(), juce::dontSendNotification);
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
    if (! proc.advancedMode)
    {
        // the next step of the guide glows
        content.repaint (guideArea);
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
    beginnerBtn.setToggleState (! adv, juce::dontSendNotification);
    advancedBtn.setToggleState (adv, juce::dontSendNotification);
    std::initializer_list<juce::Component*> advancedOnly { &scaleBox, &progressionBox, &barsBox, &popBox, &lockKey, &lockScale, &lockProgression,
                                                           &harmonySlider, &seedEditor, &seedBtn, &evolveBtn, &revertBtn, &scaleLabel,
                                                           &progressionLabel, &barsLabel, &popLabel, &harmonyLabel, &seedLabel,
                                                           &previewToggle, &midiOutToggle, &hostTempoToggle, &loadBankBtn, &defaultBankBtn };
    for (auto* c : advancedOnly) c->setVisible (adv);
    hintLabel.setVisible (adv);
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
    // faint neon grid in the background
    g.setColour (N::cyan.withAlpha (0.025f));
    for (float x = 0; x < bounds.getWidth(); x += 32.0f) g.drawVerticalLine ((int) x, 0, bounds.getHeight());
    for (float y = 0; y < bounds.getHeight(); y += 32.0f) g.drawHorizontalLine ((int) y, 0, bounds.getWidth());

    auto h = headerArea.toFloat();
    g.setGradientFill (juce::ColourGradient (N::deep.withAlpha (0.7f), h.getX(), h.getY(), N::bg.withAlpha (0.0f), h.getRight() * 0.7f, h.getBottom(), false));
    g.fillRect (h);
    {
        juce::Path line;
        line.startNewSubPath (0, h.getBottom());
        line.lineTo (bounds.getWidth(), h.getBottom());
        N::glowPath (g, line, N::cyan.withAlpha (0.7f), 1.0f, 0.8f);
    }
    if (logo.isValid())
    {
        float lh = h.getHeight() - 14.0f, lw = lh * (float) logo.getWidth() / (float) logo.getHeight();
        g.setOpacity (1.0f);
        g.drawImage (logo, juce::Rectangle<float> (h.getX() + 16.0f, h.getY() + 7.0f, lw, lh), juce::RectanglePlacement::centred);
    }

    for (auto area : { sideArea, exportArea })
    {
        auto a = area.toFloat();
        g.setColour (N::panel.withAlpha (0.92f));
        g.fillRoundedRectangle (a, 14.0f);
        g.setColour (N::line);
        g.drawRoundedRectangle (a.reduced (0.5f), 14.0f, 1.2f);
    }
    g.setColour (N::cyan);
    g.setFont (lnf.headingFont (17.0f));
    g.drawText (proc.advancedMode ? pt ("GERADOR") : pt ("AJUSTES RÁPIDOS"), sideArea.reduced (16, 12).removeFromTop (22), juce::Justification::left);

    // beginner guide: four steps, done ones checked, the next one glowing
    if (! proc.advancedMode)
    {
        static const char* steps[] = { "Escolha estilo e clima", "Gere ideias", "Toque, curta ou pule", "Arraste para o FL Studio" };
        int next = 0;
        while (next < 4 && stepDone[(size_t) next]) ++next;
        for (int i = 0; i < 4; ++i)
        {
            auto r = stepAreas[(size_t) i];
            const bool done = stepDone[(size_t) i], isNext = i == next;
            if (isNext) N::glow (g, r, r.getHeight() * 0.5f, N::cyan, 0.7f + 0.5f * std::sin (phase));
            g.setColour (done ? N::cyan.withAlpha (0.16f) : (isNext ? N::panelHi : N::panel));
            g.fillRoundedRectangle (r, r.getHeight() * 0.5f);
            g.setColour (done || isNext ? N::cyan : N::line);
            g.drawRoundedRectangle (r, r.getHeight() * 0.5f, 1.2f);
            auto circle = r.withWidth (r.getHeight()).reduced (5.0f);
            g.setColour (done || isNext ? N::cyan : N::muted);
            g.fillEllipse (circle);
            if (done)
            {
                juce::Path tick;
                tick.startNewSubPath (circle.getX() + circle.getWidth() * 0.25f, circle.getCentreY());
                tick.lineTo (circle.getX() + circle.getWidth() * 0.45f, circle.getBottom() - circle.getHeight() * 0.28f);
                tick.lineTo (circle.getRight() - circle.getWidth() * 0.22f, circle.getY() + circle.getHeight() * 0.3f);
                g.setColour (N::onPrimary);
                g.strokePath (tick, juce::PathStrokeType (2.2f));
            }
            else
            {
                g.setColour (N::onPrimary);
                g.setFont (lnf.bodyFont (14.0f, true));
                g.drawText (juce::String (i + 1), circle, juce::Justification::centred);
            }
            g.setColour (done || isNext ? N::text : N::muted);
            g.setFont (lnf.bodyFont (14.5f, isNext));
            g.drawFittedText (pt (steps[i]), r.withTrimmedLeft (r.getHeight() + 2.0f).withTrimmedRight (10.0f).toNearestInt(), juce::Justification::centredLeft, 1, 0.85f);
            if (i < 3)
            {
                juce::Path arrow;
                const float ax = r.getRight() + 7.0f, ay = r.getCentreY();
                arrow.startNewSubPath (ax - 3, ay - 5); arrow.lineTo (ax + 2, ay); arrow.lineTo (ax - 3, ay + 5);
                g.setColour (N::muted);
                g.strokePath (arrow, juce::PathStrokeType (1.6f));
            }
        }
    }

    // explanation for the sync switch
    if (! proc.advancedMode && syncToggle.isVisible())
    {
        auto r = syncToggle.getBounds().translated (0, syncToggle.getHeight()).withHeight (40).withTrimmedLeft (48);
        g.setColour (N::muted);
        g.setFont (lnf.bodyFont (13.0f));
        g.drawFittedText (syncToggle.getToggleState() ? pt ("Ligado: toca quando você dá play (espaço) no FL.")
                                                      : pt ("Desligado: o espaço do FL não toca o MelodyForge. Use o botão Tocar."),
                          r, juce::Justification::topLeft, 2, 0.9f);
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
    headerArea = r.removeFromTop (76);
    {
        auto h = headerArea.reduced (16, 12);
        int logoW = logo.isValid() ? (int) ((76 - 14) * logo.getWidth() / (float) logo.getHeight()) : 0;
        h.removeFromLeft (logoW + 14);
        auto titleCol = h.removeFromLeft (290);
        title.setBounds (titleCol.removeFromTop (30));
        subtitle.setBounds (titleCol);
        fullBtn.setBounds (h.removeFromRight (fullScreen ? 168 : 136).withSizeKeepingCentre (fullScreen ? 168 : 136, 42));
        h.removeFromRight (10);
        auto modeRow = h.removeFromRight (230).withSizeKeepingCentre (230, 42);
        beginnerBtn.setBounds (modeRow.removeFromLeft (112));
        modeRow.removeFromLeft (6);
        advancedBtn.setBounds (modeRow);
        h.removeFromRight (18);
        auto moodCol = h.removeFromRight (160);
        moodLabel.setBounds (moodCol.removeFromTop (18));
        moodBox.setBounds (moodCol.withSizeKeepingCentre (160, 32));
        h.removeFromRight (10);
        auto styleCol = h.removeFromRight (160);
        styleLabel.setBounds (styleCol.removeFromTop (18));
        styleBox.setBounds (styleCol.withSizeKeepingCentre (160, 32));
    }
    r.reduce (14, 10);
    guideArea = r.removeFromTop (38);
    hintLabel.setBounds (guideArea);
    {
        auto g = guideArea.toFloat().reduced (0, 2);
        const float w = (g.getWidth() - 3 * 16.0f) / 4.0f;
        for (int i = 0; i < 4; ++i)
        {
            stepAreas[(size_t) i] = g.removeFromLeft (w);
            g.removeFromLeft (16.0f);
        }
    }
    r.removeFromTop (8);
    exportArea = r.removeFromBottom (64);
    r.removeFromBottom (10);
    sideArea = r.removeFromRight (310);
    r.removeFromRight (14);
    ideaArea = r;

    // idea column: transport
    auto idea = ideaArea;
    auto top = idea.removeFromTop (48);
    prevBtn.setBounds (top.removeFromLeft (44));
    candidateLabel.setBounds (top.removeFromLeft (112));
    nextBtn.setBounds (top.removeFromLeft (44));
    top.removeFromLeft (8);
    const int bw = (top.getWidth() - 4 * 4) / (adv ? 18 : 15);   // shares of the remaining width
    playBtn.setBounds (top.removeFromLeft (bw * 4));
    top.removeFromLeft (4);
    newBtn.setBounds (top.removeFromLeft (bw * 4 + bw / 2));
    top.removeFromLeft (4);
    if (evolveBtn.isVisible()) { evolveBtn.setBounds (top.removeFromLeft (bw * 3)); top.removeFromLeft (4); }
    likeBtn.setBounds (top.removeFromLeft (bw * 3 + bw / 4));
    top.removeFromLeft (4);
    skipBtn.setBounds (top);
    idea.removeFromTop (6);
    if (adv && ! chordBoxes.isEmpty())
    {
        auto row = idea.removeFromTop (32);
        revertBtn.setBounds (row.removeFromRight (150).expanded (0, 3));
        row.removeFromRight (4);
        int w = row.getWidth() / chordBoxes.size();
        for (auto* b : chordBoxes) b->setBounds (row.removeFromLeft (w).reduced (3, 0));
        idea.removeFromTop (6);
    }
    cardsArea = idea.removeFromBottom (adv ? 184 : 262);
    idea.removeFromBottom (6);
    auto infoRow = idea.removeFromBottom (26);
    fitnessLabel.setBounds (infoRow);
    statusLabel.setBounds (infoRow.removeFromLeft (infoRow.getWidth() / 2));
    idea.removeFromBottom (4);
    view.setBounds (idea);
    {
        auto c = cardsArea;
        const int w = (c.getWidth() - 2 * 10) / 3;
        for (int t = 0; t < mf::NUM_TRACKS; ++t)
        {
            cards[t]->setBounds (c.removeFromLeft (w));
            c.removeFromLeft (10);
        }
    }

    // side panel
    auto c = sideArea.reduced (16, 12);
    c.removeFromTop (30);
    const int rowH = adv ? 30 : 36, gap = adv ? 3 : 8;
    auto addRow = [&] (juce::Label& label, juce::Component& comp, juce::Component* lock)
    {
        if (! comp.isVisible()) return;
        auto row = c.removeFromTop (rowH);
        label.setBounds (row.removeFromLeft (100));
        if (lock != nullptr && lock->isVisible()) { lock->setBounds (row.removeFromRight (78)); row.removeFromRight (4); }
        comp.setBounds (row.reduced (0, 1));
        c.removeFromTop (gap);
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
        seedLabel.setBounds (row.removeFromLeft (100));
        seedBtn.setBounds (row.removeFromRight (84));
        row.removeFromRight (4);
        seedEditor.setBounds (row.reduced (0, 2));
        c.removeFromTop (gap);
    }
    addRow (volumeLabel, volumeSlider, nullptr);
    addRow (reverbLabel, reverbSlider, nullptr);
    c.removeFromTop (adv ? 2 : 6);
    syncToggle.setBounds (c.removeFromTop (30));
    if (! adv) c.removeFromTop (42);   // explanation text under the switch
    for (auto* t : { (juce::Component*) &previewToggle, (juce::Component*) &midiOutToggle, (juce::Component*) &hostTempoToggle })
        if (t->isVisible()) t->setBounds (c.removeFromTop (adv ? 26 : 28));
    bankLabel.setBounds (c.removeFromBottom (20));

    // export row
    auto e = exportArea.reduced (12, 8);
    exportBtn.setBounds (e.removeFromLeft (190));
    if (adv)
    {
        defaultBankBtn.setBounds (e.removeFromRight (150));
        loadBankBtn.setBounds (e.removeFromRight (150));
        e.removeFromRight (6);
    }
    dragLabel.setBounds (e.removeFromLeft (210));
    e.removeFromLeft (6);
    int w = e.getWidth() / 4;
    for (auto* t : { dragAll.get(), dragMelody.get(), dragBass.get(), dragChords.get() }) t->setBounds (e.removeFromLeft (w));
}

} // namespace mfplug
