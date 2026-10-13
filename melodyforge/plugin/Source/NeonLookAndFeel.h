// MelodyForge look: the ISLAND27 palette pushed to neon blue, bigger text and glowing
// controls. Builds on the shared IslandLookAndFeel (fonts) without changing the EQ.
#pragma once

#include "IslandLookAndFeel.h"

namespace mfplug
{

namespace Neon
{
    const juce::Colour bg (0xff03050b);
    const juce::Colour bg2 (0xff060b18);
    const juce::Colour panel (0xff0a1222);
    const juce::Colour panelHi (0xff0f1b33);
    const juce::Colour line (0x3300e5ff);
    const juce::Colour lineStrong (0x6600e5ff);
    const juce::Colour cyan (0xff00e5ff);
    const juce::Colour sky (0xff3fb8ff);
    const juce::Colour blue (0xff1f6bff);
    const juce::Colour deep (0xff0b2a6b);
    const juce::Colour text (0xfff2f8ff);
    const juce::Colour textSoft (0xffc3d6ee);
    const juce::Colour muted (0xff8ea3c4);
    const juce::Colour onPrimary (0xff021019);

    // Melodia, Baixo, Acordes
    const juce::Colour layer[3] = { juce::Colour (0xff00e5ff), juce::Colour (0xff2f8bff), juce::Colour (0xff7a8cff) };

    // Soft outer glow around a rounded rectangle.
    inline void glow (juce::Graphics& g, juce::Rectangle<float> r, float radius, juce::Colour c, float strength = 1.0f, int layers = 4)
    {
        for (int i = layers; i >= 1; --i)
        {
            const float grow = (float) i * 2.2f;
            g.setColour (c.withMultipliedAlpha (0.10f * strength * (float) (layers - i + 1) / (float) layers));
            g.drawRoundedRectangle (r.expanded (grow), radius + grow, 2.4f);
        }
    }

    inline void glowPath (juce::Graphics& g, const juce::Path& p, juce::Colour c, float width, float strength = 1.0f)
    {
        for (int i = 3; i >= 1; --i)
        {
            g.setColour (c.withMultipliedAlpha (0.16f * strength / (float) i));
            g.strokePath (p, juce::PathStrokeType (width + (float) i * 3.0f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
        }
        g.setColour (c);
        g.strokePath (p, juce::PathStrokeType (width, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
    }
} // namespace Neon

class NeonLookAndFeel : public island::IslandLookAndFeel
{
public:
    NeonLookAndFeel()
    {
        using namespace Neon;
        setColour (juce::ResizableWindow::backgroundColourId, bg);
        setColour (juce::Label::textColourId, text);
        setColour (juce::ComboBox::backgroundColourId, panelHi);
        setColour (juce::ComboBox::textColourId, text);
        setColour (juce::ComboBox::arrowColourId, cyan);
        setColour (juce::PopupMenu::backgroundColourId, juce::Colour (0xff07101f));
        setColour (juce::PopupMenu::textColourId, text);
        setColour (juce::PopupMenu::highlightedBackgroundColourId, blue.withAlpha (0.45f));
        setColour (juce::PopupMenu::highlightedTextColourId, juce::Colours::white);
        setColour (juce::PopupMenu::headerTextColourId, cyan);
        setColour (juce::TextButton::buttonOnColourId, cyan);
        setColour (juce::TextButton::textColourOffId, text);
        setColour (juce::TextButton::textColourOnId, onPrimary);
        setColour (juce::Slider::trackColourId, cyan);
        setColour (juce::Slider::thumbColourId, cyan);
        setColour (juce::Slider::backgroundColourId, juce::Colour (0xff15233d));
        setColour (juce::Slider::textBoxTextColourId, textSoft);
        setColour (juce::TooltipWindow::backgroundColourId, juce::Colour (0xff0a1426));
        setColour (juce::TooltipWindow::textColourId, text);
        setColour (juce::TooltipWindow::outlineColourId, lineStrong);
        setColour (juce::TextEditor::backgroundColourId, panelHi);
        setColour (juce::TextEditor::outlineColourId, line);
        setColour (juce::TextEditor::focusedOutlineColourId, cyan);
        setColour (juce::ToggleButton::textColourId, textSoft);
        setColour (juce::ToggleButton::tickColourId, cyan);
    }

    static constexpr float textSize = 15.0f;

    void drawButtonBackground (juce::Graphics& g, juce::Button& b, const juce::Colour&, bool highlighted, bool down) override
    {
        using namespace Neon;
        auto r = b.getLocalBounds().toFloat().reduced (3.5f);
        const float radius = juce::jmin (r.getHeight() * 0.5f, 12.0f);
        const bool on = b.getToggleState();
        const auto accent = b.getProperties().contains ("accent") ? juce::Colour ((juce::uint32) (juce::int64) b.getProperties()["accent"]) : cyan;
        if (! b.isEnabled())
        {
            g.setColour (line.withMultipliedAlpha (0.6f));
            g.drawRoundedRectangle (r, radius, 1.0f);
            return;
        }
        if (on)
        {
            glow (g, r, radius, accent, highlighted ? 1.6f : 1.1f);
            g.setGradientFill (juce::ColourGradient (accent.brighter (0.25f), r.getX(), r.getY(), accent.darker (0.25f), r.getX(), r.getBottom(), false));
            g.fillRoundedRectangle (r, radius);
            if (down) { g.setColour (juce::Colours::black.withAlpha (0.15f)); g.fillRoundedRectangle (r, radius); }
        }
        else
        {
            if (highlighted) glow (g, r, radius, accent, 0.8f);
            g.setColour (down ? accent.withAlpha (0.22f) : (highlighted ? accent.withAlpha (0.10f) : panelHi.withAlpha (0.65f)));
            g.fillRoundedRectangle (r, radius);
            g.setColour (highlighted ? accent : lineStrong);
            g.drawRoundedRectangle (r, radius, highlighted ? 1.6f : 1.2f);
        }
    }

    void drawButtonText (juce::Graphics& g, juce::TextButton& b, bool highlighted, bool) override
    {
        using namespace Neon;
        const bool on = b.getToggleState();
        g.setFont (bodyFont (b.getHeight() >= 40 ? 16.0f : 14.5f, true));
        const auto accent = b.getProperties().contains ("accent") ? juce::Colour ((juce::uint32) (juce::int64) b.getProperties()["accent"]) : cyan;
        g.setColour (! b.isEnabled() ? muted.withAlpha (0.5f) : on ? onPrimary : (highlighted ? accent.brighter (0.3f) : text));
        g.drawFittedText (b.getButtonText(), b.getLocalBounds().reduced (b.getWidth() > 70 ? 8 : 3, 2), juce::Justification::centred, 1, 0.8f);
    }

    juce::Font getTextButtonFont (juce::TextButton&, int) override { return bodyFont (14.5f, true); }
    juce::Font getComboBoxFont (juce::ComboBox&) override { return bodyFont (14.5f); }
    juce::Font getPopupMenuFont() override { return bodyFont (15.5f); }
    juce::Font getLabelFont (juce::Label& l) override { return bodyFont (l.getFont().getHeight(), l.getFont().isBold()); }

    void drawComboBox (juce::Graphics& g, int width, int height, bool, int, int, int, int, juce::ComboBox& box) override
    {
        using namespace Neon;
        auto r = juce::Rectangle<float> (0, 0, (float) width, (float) height).reduced (1.5f);
        const bool hot = box.isMouseOver (true) || box.hasKeyboardFocus (true) || box.isPopupActive();
        if (hot) glow (g, r, 8.0f, cyan, 0.7f, 3);
        g.setGradientFill (juce::ColourGradient (panelHi.brighter (0.08f), 0, 0, panel, 0, (float) height, false));
        g.fillRoundedRectangle (r, 8.0f);
        g.setColour (hot ? cyan : lineStrong);
        g.drawRoundedRectangle (r, 8.0f, hot ? 1.5f : 1.1f);
        juce::Path arrow;
        const float cx = (float) width - 13.0f, cy = (float) height * 0.5f;
        arrow.startNewSubPath (cx - 4.5f, cy - 2.0f);
        arrow.lineTo (cx, cy + 2.5f);
        arrow.lineTo (cx + 4.5f, cy - 2.0f);
        g.setColour (cyan);
        g.strokePath (arrow, juce::PathStrokeType (1.8f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
    }

    void positionComboBoxText (juce::ComboBox& box, juce::Label& label) override
    {
        label.setBounds (8, 1, box.getWidth() - 28, box.getHeight() - 2);
        label.setFont (getComboBoxFont (box));
    }

    void drawLinearSlider (juce::Graphics& g, int x, int y, int width, int height, float pos, float, float,
                           juce::Slider::SliderStyle, juce::Slider& s) override
    {
        using namespace Neon;
        const auto r = juce::Rectangle<int> (x, y, width, height).toFloat();
        const float cy = r.getCentreY();
        const auto accent = s.findColour (juce::Slider::trackColourId);
        juce::Rectangle<float> track (r.getX(), cy - 3.0f, r.getWidth(), 6.0f);
        g.setColour (s.findColour (juce::Slider::backgroundColourId));
        g.fillRoundedRectangle (track, 3.0f);
        auto filled = track.withRight (pos);
        g.setGradientFill (juce::ColourGradient (blue, track.getX(), cy, accent, pos, cy, false));
        g.fillRoundedRectangle (filled, 3.0f);
        const auto thumb = juce::Rectangle<float> (16.0f, 16.0f).withCentre ({ pos, cy });
        const bool hot = s.isMouseOverOrDragging();
        for (int i = 3; i >= 1; --i)
        {
            g.setColour (accent.withAlpha ((hot ? 0.16f : 0.09f) * (float) (4 - i)));
            g.fillEllipse (thumb.expanded ((float) i * 2.5f));
        }
        g.setColour (text);
        g.fillEllipse (thumb);
        g.setColour (accent);
        g.drawEllipse (thumb, 2.4f);
    }

    juce::Label* createSliderTextBox (juce::Slider& s) override
    {
        auto* l = LookAndFeel_V4::createSliderTextBox (s);
        l->setFont (bodyFont (13.5f));
        l->setColour (juce::Label::textColourId, Neon::textSoft);
        l->setColour (juce::Label::outlineColourId, juce::Colours::transparentBlack);
        l->setColour (juce::Label::backgroundColourId, juce::Colours::transparentBlack);
        l->setJustificationType (juce::Justification::centredRight);
        return l;
    }

    // Toggle buttons are drawn as neon switches.
    void drawToggleButton (juce::Graphics& g, juce::ToggleButton& b, bool highlighted, bool) override
    {
        using namespace Neon;
        auto r = b.getLocalBounds().toFloat();
        auto sw = r.removeFromLeft (40.0f).withSizeKeepingCentre (38.0f, 20.0f);
        const bool on = b.getToggleState();
        if (on) glow (g, sw, 10.0f, cyan, highlighted ? 1.4f : 0.9f, 3);
        g.setColour (on ? cyan.withAlpha (0.85f) : panelHi);
        g.fillRoundedRectangle (sw, 10.0f);
        g.setColour (on ? cyan : (highlighted ? cyan.withAlpha (0.7f) : lineStrong));
        g.drawRoundedRectangle (sw, 10.0f, 1.3f);
        auto knob = juce::Rectangle<float> (14.0f, 14.0f).withCentre ({ on ? sw.getRight() - 10.0f : sw.getX() + 10.0f, sw.getCentreY() });
        g.setColour (on ? onPrimary : textSoft);
        g.fillEllipse (knob);
        g.setColour (b.isEnabled() ? (on ? text : textSoft) : muted);
        g.setFont (bodyFont (14.5f, on));
        g.drawFittedText (b.getButtonText(), r.toNearestInt().withTrimmedLeft (8), juce::Justification::centredLeft, 2, 0.9f);
    }

    void drawPopupMenuBackground (juce::Graphics& g, int width, int height) override
    {
        g.fillAll (findColour (juce::PopupMenu::backgroundColourId));
        g.setColour (Neon::lineStrong);
        g.drawRect (0, 0, width, height);
    }

    void drawTooltip (juce::Graphics& g, const juce::String& text, int width, int height) override
    {
        auto r = juce::Rectangle<float> ((float) width, (float) height);
        g.setColour (findColour (juce::TooltipWindow::backgroundColourId));
        g.fillRoundedRectangle (r, 6.0f);
        g.setColour (Neon::lineStrong);
        g.drawRoundedRectangle (r.reduced (0.5f), 6.0f, 1.0f);
        g.setColour (Neon::text);
        g.setFont (bodyFont (14.0f));
        g.drawFittedText (text, r.toNearestInt().reduced (10, 6), juce::Justification::centredLeft, 6);
    }

    juce::Rectangle<int> getTooltipBounds (const juce::String& text, juce::Point<int> pos, juce::Rectangle<int> parent) override
    {
        juce::AttributedString s;
        s.append (text, bodyFont (14.0f));
        juce::TextLayout tl;
        tl.createLayoutWithBalancedLineLengths (s, 360.0f);
        const int w = (int) tl.getWidth() + 24, h = (int) tl.getHeight() + 16;
        return juce::Rectangle<int> (pos.x > parent.getCentreX() ? pos.x - (w + 12) : pos.x + 18,
                                     pos.y > parent.getCentreY() ? pos.y - (h + 8) : pos.y + 18, w, h).constrainedWithin (parent);
    }
};

} // namespace mfplug
