#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

#include "IslandAssets.h"

namespace island
{

// Palette of the ISLAND27 website (style.css).
namespace Brand
{
    const juce::Colour background (0xff08090c);
    const juce::Colour panel (0xff14161c);
    const juce::Colour panelRaised (0xff1a1d24);
    const juce::Colour border (0x14ffffff);   // rgba(255,255,255,.08)
    const juce::Colour borderStrong (0x29ffffff); // rgba(255,255,255,.16)
    const juce::Colour text (0xfff2f4f8);
    const juce::Colour textSoft (0xffc7ccd6);
    const juce::Colour muted (0xff9aa1ae);
    const juce::Colour accent (0xff7fe3ff);  // cyan
    const juce::Colour primary (0xff2aa9e0); // primary button
    const juce::Colour primaryText (0xff04141c);
    const juce::Colour navy (0xff12213f);
} // namespace Brand

class IslandLookAndFeel : public juce::LookAndFeel_V4
{
public:
    IslandLookAndFeel()
    {
        heading = juce::Typeface::createSystemTypefaceFor (IslandAssets::SpaceGroteskBold_ttf, IslandAssets::SpaceGroteskBold_ttfSize);
        body = juce::Typeface::createSystemTypefaceFor (IslandAssets::IBMPlexSansRegular_ttf, IslandAssets::IBMPlexSansRegular_ttfSize);
        bodyBold = juce::Typeface::createSystemTypefaceFor (IslandAssets::IBMPlexSansSemiBold_ttf, IslandAssets::IBMPlexSansSemiBold_ttfSize);

        setColour (juce::ResizableWindow::backgroundColourId, Brand::background);
        setColour (juce::DocumentWindow::backgroundColourId, Brand::background);
        setColour (juce::Label::textColourId, Brand::text);
        setColour (juce::ComboBox::backgroundColourId, Brand::panelRaised);
        setColour (juce::ComboBox::outlineColourId, Brand::borderStrong);
        setColour (juce::ComboBox::textColourId, Brand::textSoft);
        setColour (juce::ComboBox::arrowColourId, Brand::accent);
        setColour (juce::ComboBox::focusedOutlineColourId, Brand::accent);
        setColour (juce::PopupMenu::backgroundColourId, juce::Colour (0xff0c0d11));
        setColour (juce::PopupMenu::textColourId, Brand::text);
        setColour (juce::PopupMenu::highlightedBackgroundColourId, Brand::primary.withAlpha (0.25f));
        setColour (juce::PopupMenu::highlightedTextColourId, Brand::accent);
        setColour (juce::PopupMenu::headerTextColourId, Brand::accent);
        setColour (juce::TextButton::buttonColourId, juce::Colours::transparentBlack);
        setColour (juce::TextButton::buttonOnColourId, Brand::primary);
        setColour (juce::TextButton::textColourOffId, Brand::text);
        setColour (juce::TextButton::textColourOnId, Brand::primaryText);
        setColour (juce::Slider::textBoxTextColourId, Brand::textSoft);
        setColour (juce::Slider::textBoxOutlineColourId, juce::Colours::transparentBlack);
        setColour (juce::Slider::textBoxBackgroundColourId, juce::Colours::transparentBlack);
        setColour (juce::Slider::textBoxHighlightColourId, Brand::primary.withAlpha (0.4f));
        setColour (juce::Slider::backgroundColourId, juce::Colour (0xff22262e));
        setColour (juce::Slider::trackColourId, Brand::primary);
        setColour (juce::Slider::thumbColourId, Brand::accent);
        setColour (juce::Slider::rotarySliderFillColourId, Brand::accent);
        setColour (juce::Slider::rotarySliderOutlineColourId, juce::Colour (0xff22262e));
        setColour (juce::TooltipWindow::backgroundColourId, Brand::panel);
        setColour (juce::TooltipWindow::textColourId, Brand::text);
        setColour (juce::TooltipWindow::outlineColourId, Brand::borderStrong);
        setColour (juce::TextEditor::backgroundColourId, Brand::panelRaised);
        setColour (juce::TextEditor::textColourId, Brand::text);
        setColour (juce::TextEditor::highlightColourId, Brand::primary.withAlpha (0.4f));
        setColour (juce::CaretComponent::caretColourId, Brand::accent);
    }

    juce::Font headingFont (float height) const { return juce::Font (heading).withHeight (height); }
    juce::Font bodyFont (float height, bool bold = false) const { return juce::Font (bold ? bodyBold : body).withHeight (height); }

    juce::Typeface::Ptr getTypefaceForFont (const juce::Font& f) override
    {
        if (f.getTypefaceName() == juce::Font::getDefaultSansSerifFontName())
            return f.isBold() ? bodyBold : body;
        return LookAndFeel_V4::getTypefaceForFont (f);
    }

    // Pill buttons, like the site's .btn / .btn-ghost / .btn-primary
    void drawButtonBackground (juce::Graphics& g, juce::Button& b, const juce::Colour&,
                               bool highlighted, bool down) override
    {
        auto r = b.getLocalBounds().toFloat().reduced (0.5f);
        const float radius = r.getHeight() * 0.5f;
        const bool on = b.getToggleState();

        if (on)
        {
            g.setColour (down ? Brand::primary.darker (0.1f) : (highlighted ? juce::Colour (0xff4dc0f0) : Brand::primary));
            g.fillRoundedRectangle (r, radius);
        }
        else
        {
            g.setColour (down ? Brand::accent.withAlpha (0.12f) : juce::Colours::transparentBlack);
            g.fillRoundedRectangle (r, radius);
            g.setColour (highlighted ? Brand::accent : Brand::borderStrong);
            g.drawRoundedRectangle (r, radius, 1.0f);
        }
    }

    void drawButtonText (juce::Graphics& g, juce::TextButton& b, bool highlighted, bool) override
    {
        const bool on = b.getToggleState();
        g.setFont (bodyFont (13.0f, true));
        g.setColour (on ? Brand::primaryText : (highlighted ? Brand::accent : Brand::text));
        g.drawText (b.getButtonText(), b.getLocalBounds(), juce::Justification::centred);
    }

    juce::Font getTextButtonFont (juce::TextButton&, int) override { return bodyFont (13.0f, true); }
    juce::Font getComboBoxFont (juce::ComboBox&) override { return bodyFont (12.5f); }
    juce::Font getPopupMenuFont() override { return bodyFont (14.0f); }
    juce::Font getLabelFont (juce::Label& l) override { return bodyFont (l.getFont().getHeight()); }

    void drawComboBox (juce::Graphics& g, int width, int height, bool, int, int, int, int, juce::ComboBox& box) override
    {
        auto r = juce::Rectangle<float> (0, 0, (float) width, (float) height).reduced (0.5f);
        g.setColour (Brand::panelRaised);
        g.fillRoundedRectangle (r, 6.0f);
        g.setColour (box.hasKeyboardFocus (true) || box.isMouseOver (true) ? Brand::accent.withAlpha (0.7f) : Brand::borderStrong);
        g.drawRoundedRectangle (r, 6.0f, 1.0f);

        juce::Path arrow;
        const float cx = (float) width - 11.0f, cy = (float) height * 0.5f;
        arrow.startNewSubPath (cx - 3.5f, cy - 1.5f);
        arrow.lineTo (cx, cy + 2.0f);
        arrow.lineTo (cx + 3.5f, cy - 1.5f);
        g.setColour (Brand::accent);
        g.strokePath (arrow, juce::PathStrokeType (1.4f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
    }

    void positionComboBoxText (juce::ComboBox& box, juce::Label& label) override
    {
        label.setBounds (6, 1, box.getWidth() - 22, box.getHeight() - 2);
        label.setFont (getComboBoxFont (box));
    }

    void drawRotarySlider (juce::Graphics& g, int x, int y, int width, int height, float pos,
                           float startAngle, float endAngle, juce::Slider& s) override
    {
        const auto bounds = juce::Rectangle<int> (x, y, width, height).toFloat().reduced (4.0f);
        const float radius = juce::jmin (bounds.getWidth(), bounds.getHeight()) * 0.5f;
        const auto centre = bounds.getCentre();
        const float angle = startAngle + pos * (endAngle - startAngle);
        const float lineW = juce::jmax (2.5f, radius * 0.16f);
        const float arcR = radius - lineW * 0.5f;
        const auto fill = s.findColour (juce::Slider::rotarySliderFillColourId);

        // knob body
        const float bodyR = arcR - lineW - 2.0f;
        g.setGradientFill (juce::ColourGradient (Brand::navy.brighter (0.15f), centre.x, centre.y - bodyR,
                                                 Brand::background, centre.x, centre.y + bodyR, false));
        g.fillEllipse (centre.x - bodyR, centre.y - bodyR, bodyR * 2, bodyR * 2);
        g.setColour (Brand::border.withAlpha (0.25f));
        g.drawEllipse (centre.x - bodyR, centre.y - bodyR, bodyR * 2, bodyR * 2, 1.0f);

        juce::Path track;
        track.addCentredArc (centre.x, centre.y, arcR, arcR, 0.0f, startAngle, endAngle, true);
        g.setColour (s.findColour (juce::Slider::rotarySliderOutlineColourId));
        g.strokePath (track, juce::PathStrokeType (lineW, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));

        juce::Path value;
        value.addCentredArc (centre.x, centre.y, arcR, arcR, 0.0f, startAngle, angle, true);
        g.setColour (fill);
        g.strokePath (value, juce::PathStrokeType (lineW, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));

        const juce::Point<float> tip (centre.x + (bodyR - 3.0f) * std::sin (angle), centre.y - (bodyR - 3.0f) * std::cos (angle));
        g.setColour (Brand::text);
        g.drawLine ({ centre, tip }, 1.8f);
    }

    void drawLinearSlider (juce::Graphics& g, int x, int y, int width, int height, float pos, float, float,
                           juce::Slider::SliderStyle style, juce::Slider& s) override
    {
        const bool vertical = style == juce::Slider::LinearVertical;
        const auto r = juce::Rectangle<int> (x, y, width, height).toFloat();
        const float thickness = 4.0f;
        const auto fill = s.findColour (juce::Slider::trackColourId);

        juce::Point<float> start, end, thumb, zero;
        if (vertical)
        {
            start = { r.getCentreX(), r.getBottom() };
            end = { r.getCentreX(), r.getY() };
            thumb = { r.getCentreX(), pos };
        }
        else
        {
            start = { r.getX(), r.getCentreY() };
            end = { r.getRight(), r.getCentreY() };
            thumb = { pos, r.getCentreY() };
        }
        // level sliders are bipolar: fill from the centre (0 dB)
        zero = (start + end) * 0.5f;

        g.setColour (s.findColour (juce::Slider::backgroundColourId));
        g.drawLine ({ start, end }, thickness);
        g.setColour (fill);
        g.drawLine ({ zero, thumb }, thickness);
        g.setColour (Brand::border.withAlpha (0.4f));
        if (vertical)
            g.drawHorizontalLine ((int) zero.y, r.getCentreX() - 7.0f, r.getCentreX() + 7.0f);
        else
            g.drawVerticalLine ((int) zero.x, r.getCentreY() - 7.0f, r.getCentreY() + 7.0f);

        g.setColour (Brand::text);
        g.fillEllipse (juce::Rectangle<float> (12.0f, 12.0f).withCentre (thumb));
        g.setColour (fill);
        g.drawEllipse (juce::Rectangle<float> (12.0f, 12.0f).withCentre (thumb), 2.0f);
    }

    juce::Label* createSliderTextBox (juce::Slider& s) override
    {
        auto* l = LookAndFeel_V4::createSliderTextBox (s);
        l->setFont (bodyFont (11.5f));
        l->setColour (juce::Label::textColourId, Brand::textSoft);
        l->setColour (juce::Label::outlineColourId, juce::Colours::transparentBlack);
        l->setColour (juce::Label::backgroundColourId, juce::Colours::transparentBlack);
        return l;
    }

    void drawPopupMenuBackground (juce::Graphics& g, int width, int height) override
    {
        g.fillAll (findColour (juce::PopupMenu::backgroundColourId));
        g.setColour (Brand::borderStrong);
        g.drawRect (0, 0, width, height);
    }

private:
    juce::Typeface::Ptr heading, body, bodyBold;
};

} // namespace island
