#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace island
{

using APVTS = juce::AudioProcessorValueTreeState;

namespace
{
    juce::String freqToString (float hz, int)
    {
        if (hz >= 1000.0f)
            return juce::String (hz / 1000.0f, hz >= 10000.0f ? 1 : 2) + " kHz";
        if (hz >= 100.0f)
            return juce::String (juce::roundToInt (hz)) + " Hz";
        return juce::String (hz, 1) + " Hz";
    }

    float stringToFreq (const juce::String& text)
    {
        auto t = text.trim().toLowerCase();
        const float v = t.getFloatValue();
        return t.contains ("k") ? v * 1000.0f : v;
    }

    juce::String dbToString (float db, int) { return (db > 0 ? "+" : "") + juce::String (db, 1) + " dB"; }
    juce::String percentToString (float v, int) { return juce::String (juce::roundToInt (v * 100.0f)) + "%"; }

    juce::StringArray typeNames()
    {
        juce::StringArray s;
        for (int i = 0; i < static_cast<int> (eq::FilterType::Count); ++i)
            s.add (eq::filterTypeName (static_cast<eq::FilterType> (i)));
        return s;
    }
} // namespace

APVTS::ParameterLayout IslandEQProcessor::createLayout()
{
    using namespace juce;
    std::vector<std::unique_ptr<RangedAudioParameter>> params;

    const NormalisableRange<float> freqRange (
        (float) eq::kMinFreqHz, (float) eq::kMaxFreqHz,
        [] (float, float, float x) { return (float) eq::mapping::normToHz (x); },
        [] (float, float, float hz) { return (float) eq::mapping::hzToNorm (hz); },
        [] (float s, float e, float v) { return jlimit (s, e, v); });

    const auto dbAttr = AudioParameterFloatAttributes().withStringFromValueFunction (dbToString).withLabel ("dB");
    const auto freqAttr = AudioParameterFloatAttributes()
                              .withStringFromValueFunction (freqToString)
                              .withValueFromStringFunction (stringToFreq)
                              .withLabel ("Hz");
    const auto widthAttr = AudioParameterFloatAttributes()
                               .withStringFromValueFunction (percentToString)
                               .withValueFromStringFunction ([] (const String& t) { return t.getFloatValue() / 100.0f; })
                               .withLabel ("%");

    // Same ordering as the original plugin's automation parameters:
    // 7 levels, 7 frequencies, 7 widths, 7 types, 7 orders, main level.
    for (int b = 0; b < eq::kNumBands; ++b)
        params.push_back (std::make_unique<AudioParameterFloat> (ParameterID { ParamIDs::level (b), 1 },
                                                                 "Band " + String (b + 1) + " level",
                                                                 NormalisableRange<float> (-18.0f, 18.0f, 0.01f), 0.0f, dbAttr));
    for (int b = 0; b < eq::kNumBands; ++b)
        params.push_back (std::make_unique<AudioParameterFloat> (ParameterID { ParamIDs::freq (b), 1 },
                                                                 "Band " + String (b + 1) + " freq",
                                                                 freqRange, (float) eq::Defaults::freqHz (b), freqAttr));
    for (int b = 0; b < eq::kNumBands; ++b)
        params.push_back (std::make_unique<AudioParameterFloat> (ParameterID { ParamIDs::width (b), 1 },
                                                                 "Band " + String (b + 1) + " width",
                                                                 NormalisableRange<float> (0.0f, 1.0f), (float) eq::Defaults::width (b), widthAttr));
    for (int b = 0; b < eq::kNumBands; ++b)
        params.push_back (std::make_unique<AudioParameterChoice> (ParameterID { ParamIDs::type (b), 1 },
                                                                  "Band " + String (b + 1) + " type",
                                                                  typeNames(), static_cast<int> (eq::Defaults::type[(size_t) b])));
    for (int b = 0; b < eq::kNumBands; ++b)
        params.push_back (std::make_unique<AudioParameterInt> (ParameterID { ParamIDs::order (b), 1 },
                                                               "Band " + String (b + 1) + " order",
                                                               eq::kMinOrder, eq::kMaxOrder, 0,
                                                               AudioParameterIntAttributes().withStringFromValueFunction (
                                                                   [] (int v, int) { return String (eq::orderName (v)); })));
    params.push_back (std::make_unique<AudioParameterFloat> (ParameterID { ParamIDs::main, 1 }, "Main level",
                                                             NormalisableRange<float> (-18.0f, 18.0f, 0.01f), 0.0f, dbAttr));

    // Extras (not automatable in the original, exposed here for convenience)
    for (int b = 0; b < eq::kNumBands; ++b)
        params.push_back (std::make_unique<AudioParameterChoice> (ParameterID { ParamIDs::state (b), 1 },
                                                                  "Band " + String (b + 1) + " mute/solo",
                                                                  StringArray { "Normal", "Mute", "Solo" }, 0));
    params.push_back (std::make_unique<AudioParameterBool> (ParameterID { ParamIDs::hq, 1 }, "High quality (oversampling)", false));
    params.push_back (std::make_unique<AudioParameterBool> (ParameterID { ParamIDs::linear, 1 }, "Linear phase", false));
    params.push_back (std::make_unique<AudioParameterChoice> (ParameterID { ParamIDs::monitor, 1 }, "Monitor",
                                                              StringArray { "Off", "Input", "Output" }, 2));

    return { params.begin(), params.end() };
}

IslandEQProcessor::IslandEQProcessor()
    : AudioProcessor (BusesProperties()
                          .withInput ("Input", juce::AudioChannelSet::stereo(), true)
                          .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      apvts (*this, nullptr, "IslandEQ", createLayout())
{
    for (int b = 0; b < eq::kNumBands; ++b)
    {
        auto& r = raw[(size_t) b];
        r.level = apvts.getRawParameterValue (ParamIDs::level (b));
        r.freq = apvts.getRawParameterValue (ParamIDs::freq (b));
        r.width = apvts.getRawParameterValue (ParamIDs::width (b));
        r.type = apvts.getRawParameterValue (ParamIDs::type (b));
        r.order = apvts.getRawParameterValue (ParamIDs::order (b));
        r.state = apvts.getRawParameterValue (ParamIDs::state (b));
    }
    mainRaw = apvts.getRawParameterValue (ParamIDs::main);
    hqRaw = apvts.getRawParameterValue (ParamIDs::hq);
    linearRaw = apvts.getRawParameterValue (ParamIDs::linear);
    monitorRaw = apvts.getRawParameterValue (ParamIDs::monitor);
}

IslandEQProcessor::~IslandEQProcessor()
{
    stopTimer();
}

//==============================================================================
void IslandEQProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    currentSampleRate = sampleRate;
    currentBlockSize = juce::jmax (1, samplesPerBlock);
    const int numChannels = juce::jlimit (1, eq::Equalizer::kMaxChannels,
                                          juce::jmax (getTotalNumInputChannels(), getTotalNumOutputChannels()));

    oversampler = std::make_unique<juce::dsp::Oversampling<float>> (
        (size_t) numChannels, 1, juce::dsp::Oversampling<float>::filterHalfBandFIREquiripple, true, true);
    oversampler->initProcessing ((size_t) currentBlockSize);

    syncEngine (engine);
    syncEngine (engineHQ);
    engine.prepare (sampleRate, numChannels);
    engineHQ.prepare (sampleRate * 2.0, numChannels);

    rebuildLinearPhaseFir();
    convolution.prepare ({ sampleRate, (juce::uint32) currentBlockSize, (juce::uint32) numChannels });

    lastHQ = hqRaw->load() > 0.5f;
    lastLinear = linearRaw->load() > 0.5f;
    updateLatency();

    startTimerHz (20);
}

void IslandEQProcessor::releaseResources()
{
    stopTimer();
    convolution.reset();
    if (oversampler != nullptr)
        oversampler->reset();
}

bool IslandEQProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto out = layouts.getMainOutputChannelSet();
    if (out != juce::AudioChannelSet::mono() && out != juce::AudioChannelSet::stereo())
        return false;
    return out == layouts.getMainInputChannelSet();
}

void IslandEQProcessor::syncEngine (eq::Equalizer& e)
{
    for (int b = 0; b < eq::kNumBands; ++b)
    {
        const auto& r = raw[(size_t) b];
        eq::BandParams p;
        p.type = static_cast<eq::FilterType> (juce::jlimit (0, 7, (int) r.type->load()));
        p.freqHz = r.freq->load();
        p.gainDb = r.level->load();
        p.width = r.width->load();
        p.order = juce::jlimit (eq::kMinOrder, eq::kMaxOrder, juce::roundToInt (r.order->load()));
        e.setBand (b, p);
        e.setBandState (b, static_cast<eq::BandState> (juce::jlimit (0, 2, (int) r.state->load())));
    }
    e.setMainGainDb (mainRaw->load());
}

void IslandEQProcessor::updateLatency()
{
    int latency = 0;
    if (lastLinear)
        latency = firLatency.load();
    else if (lastHQ && oversampler != nullptr)
        latency = juce::roundToInt (oversampler->getLatencyInSamples());
    if (latency != getLatencySamples())
        setLatencySamples (latency);
}

void IslandEQProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    juce::ScopedNoDenormals noDenormals;

    const int numIn = getTotalNumInputChannels();
    for (int ch = numIn; ch < getTotalNumOutputChannels(); ++ch)
        buffer.clear (ch, 0, buffer.getNumSamples());

    const int numChannels = juce::jmin (buffer.getNumChannels(), eq::Equalizer::kMaxChannels);
    const int numSamples = buffer.getNumSamples();
    if (numSamples == 0)
        return;

    const auto monitor = static_cast<MonitorMode> ((int) monitorRaw->load());
    if (monitor == MonitorMode::Input)
        pushAnalyzer (buffer);

    const bool hq = hqRaw->load() > 0.5f;
    const bool linear = linearRaw->load() > 0.5f;
    if (hq != lastHQ || linear != lastLinear)
    {
        lastHQ = hq;
        lastLinear = linear;
        engine.reset();
        engineHQ.reset();
        if (oversampler != nullptr)
            oversampler->reset();
        convolution.reset();
        updateLatency();
    }

    if (linear)
    {
        juce::dsp::AudioBlock<float> block (buffer.getArrayOfWritePointers(), (size_t) numChannels, (size_t) numSamples);
        convolution.process (juce::dsp::ProcessContextReplacing<float> (block));
    }
    else if (hq && oversampler != nullptr && numSamples <= currentBlockSize)
    {
        syncEngine (engineHQ);
        juce::dsp::AudioBlock<float> block (buffer.getArrayOfWritePointers(), (size_t) numChannels, (size_t) numSamples);
        auto up = oversampler->processSamplesUp (block);
        float* ptrs[eq::Equalizer::kMaxChannels] {};
        for (size_t ch = 0; ch < up.getNumChannels(); ++ch)
            ptrs[ch] = up.getChannelPointer (ch);
        engineHQ.process (ptrs, (int) up.getNumChannels(), (int) up.getNumSamples());
        oversampler->processSamplesDown (block);
    }
    else
    {
        syncEngine (engine);
        engine.process (buffer.getArrayOfWritePointers(), numChannels, numSamples);
    }

    if (monitor == MonitorMode::Output)
        pushAnalyzer (buffer);
}

//==============================================================================
int IslandEQProcessor::firLengthFor (double sampleRate) const
{
    if (sampleRate <= 50000.0) return 8192;
    if (sampleRate <= 100000.0) return 16384;
    return 32768;
}

uint64_t IslandEQProcessor::paramsHash() const
{
    uint64_t h = 1469598103934665603ull;
    auto mix = [&h] (float v)
    {
        uint32_t bits;
        std::memcpy (&bits, &v, sizeof bits);
        h = (h ^ bits) * 1099511628211ull;
    };
    for (const auto& r : raw)
    {
        mix (r.level->load()); mix (r.freq->load()); mix (r.width->load());
        mix (r.type->load()); mix (r.order->load()); mix (r.state->load());
    }
    mix (mainRaw->load());
    mix ((float) currentSampleRate);
    return h;
}

void IslandEQProcessor::rebuildLinearPhaseFir()
{
    if (currentSampleRate <= 0.0)
        return;

    const auto bands = getBandParams();
    const auto states = getBandStates();
    const double mainDb = getMainGainDb();
    // Designing at 4x the rate removes the bilinear "cramping" near Nyquist.
    const double designRate = currentSampleRate * 4.0;

    std::array<eq::BandDesign, eq::kNumBands> designs {}, solos {};
    bool anySolo = false;
    for (int b = 0; b < eq::kNumBands; ++b)
    {
        designs[(size_t) b] = eq::designBand (bands[(size_t) b], designRate);
        solos[(size_t) b] = eq::designSolo (bands[(size_t) b], designRate);
        anySolo = anySolo || states[(size_t) b] == eq::BandState::Solo;
    }
    const double mainGain = std::pow (10.0, mainDb / 20.0);

    auto magnitude = [&] (double hz)
    {
        const double w = 2.0 * eq::kPi * hz / designRate;
        if (anySolo)
        {
            std::complex<double> sum = 0.0;
            for (int b = 0; b < eq::kNumBands; ++b)
            {
                if (states[(size_t) b] != eq::BandState::Solo)
                    continue;
                std::complex<double> h = 1.0;
                const auto& d = solos[(size_t) b];
                for (int s = 0; s < d.numSections; ++s)
                    h *= d.sections[(size_t) s].response (w);
                sum += h;
            }
            return std::abs (sum) * mainGain;
        }
        double m = mainGain;
        for (int b = 0; b < eq::kNumBands; ++b)
            if (states[(size_t) b] != eq::BandState::Mute)
                m *= designs[(size_t) b].magnitude (w);
        return m;
    };

    const int length = firLengthFor (currentSampleRate);
    const auto fir = eq::buildLinearPhaseFir (length, currentSampleRate, magnitude);

    juce::AudioBuffer<float> ir (1, length);
    ir.copyFrom (0, 0, fir.data(), length);
    convolution.loadImpulseResponse (std::move (ir), currentSampleRate,
                                     juce::dsp::Convolution::Stereo::no,
                                     juce::dsp::Convolution::Trim::no,
                                     juce::dsp::Convolution::Normalise::no);
    firLatency = length / 2;
    lastFirHash = paramsHash();
}

void IslandEQProcessor::timerCallback()
{
    if (linearRaw->load() > 0.5f && paramsHash() != lastFirHash)
        rebuildLinearPhaseFir();
}

//==============================================================================
void IslandEQProcessor::pushAnalyzer (const juce::AudioBuffer<float>& buffer)
{
    const int n = buffer.getNumSamples();
    const int chans = juce::jmax (1, buffer.getNumChannels());
    int start1, size1, start2, size2;
    analyzerFifo.prepareToWrite (n, start1, size1, start2, size2);

    auto write = [&] (int dest, int src, int count)
    {
        for (int i = 0; i < count; ++i)
        {
            float v = 0.0f;
            for (int ch = 0; ch < chans; ++ch)
                v += buffer.getReadPointer (ch)[src + i];
            analyzerBuffer[(size_t) (dest + i)] = v / (float) chans;
        }
    };
    write (start1, 0, size1);
    write (start2, size1, size2);
    analyzerFifo.finishedWrite (size1 + size2);
}

int IslandEQProcessor::pullAnalyzerSamples (float* dest, int maxSamples)
{
    int start1, size1, start2, size2;
    analyzerFifo.prepareToRead (maxSamples, start1, size1, start2, size2);
    std::copy_n (analyzerBuffer.data() + start1, size1, dest);
    std::copy_n (analyzerBuffer.data() + start2, size2, dest + size1);
    analyzerFifo.finishedRead (size1 + size2);
    return size1 + size2;
}

//==============================================================================
std::array<eq::BandParams, eq::kNumBands> IslandEQProcessor::getBandParams() const
{
    std::array<eq::BandParams, eq::kNumBands> out {};
    for (int b = 0; b < eq::kNumBands; ++b)
    {
        const auto& r = raw[(size_t) b];
        out[(size_t) b].type = static_cast<eq::FilterType> (juce::jlimit (0, 7, (int) r.type->load()));
        out[(size_t) b].freqHz = r.freq->load();
        out[(size_t) b].gainDb = r.level->load();
        out[(size_t) b].width = r.width->load();
        out[(size_t) b].order = juce::jlimit (eq::kMinOrder, eq::kMaxOrder, juce::roundToInt (r.order->load()));
    }
    return out;
}

std::array<eq::BandState, eq::kNumBands> IslandEQProcessor::getBandStates() const
{
    std::array<eq::BandState, eq::kNumBands> out {};
    for (int b = 0; b < eq::kNumBands; ++b)
        out[(size_t) b] = static_cast<eq::BandState> (juce::jlimit (0, 2, (int) raw[(size_t) b].state->load()));
    return out;
}

double IslandEQProcessor::getMainGainDb() const { return mainRaw->load(); }

void IslandEQProcessor::setParam (const juce::String& id, float plainValue)
{
    if (auto* p = apvts.getParameter (id))
    {
        p->beginChangeGesture();
        p->setValueNotifyingHost (p->convertTo0to1 (plainValue));
        p->endChangeGesture();
    }
}

void IslandEQProcessor::resetBand (int band)
{
    for (const auto& id : { ParamIDs::level (band), ParamIDs::freq (band), ParamIDs::width (band),
                            ParamIDs::type (band), ParamIDs::order (band), ParamIDs::state (band) })
        if (auto* p = apvts.getParameter (id))
        {
            p->beginChangeGesture();
            p->setValueNotifyingHost (p->getDefaultValue());
            p->endChangeGesture();
        }
}

void IslandEQProcessor::resetAll()
{
    for (int b = 0; b < eq::kNumBands; ++b)
        resetBand (b);
    if (auto* p = apvts.getParameter (ParamIDs::main))
        p->setValueNotifyingHost (p->getDefaultValue());
}

void IslandEQProcessor::storeSpare()
{
    spareState = apvts.copyState();
}

void IslandEQProcessor::flipSpare()
{
    if (! spareState.isValid())
    {
        storeSpare();
        return;
    }
    auto current = apvts.copyState();
    apvts.replaceState (spareState.createCopy());
    spareState = current;
}

//==============================================================================
void IslandEQProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    state.removeChild (state.getChildWithName ("Spare"), nullptr);
    if (spareState.isValid())
    {
        juce::ValueTree spare ("Spare");
        auto copy = spareState.createCopy();
        copy.removeChild (copy.getChildWithName ("Spare"), nullptr);
        spare.appendChild (copy, nullptr);
        state.appendChild (spare, nullptr);
    }
    if (auto xml = state.createXml())
        copyXmlToBinary (*xml, destData);
}

void IslandEQProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    auto xml = getXmlFromBinary (data, sizeInBytes);
    if (xml == nullptr || ! xml->hasTagName (apvts.state.getType()))
        return;

    auto tree = juce::ValueTree::fromXml (*xml);
    auto spare = tree.getChildWithName ("Spare");
    if (spare.isValid())
    {
        spareState = spare.getNumChildren() > 0 ? spare.getChild (0).createCopy() : juce::ValueTree();
        tree.removeChild (spare, nullptr);
    }
    apvts.replaceState (tree);
}

juce::AudioProcessorEditor* IslandEQProcessor::createEditor()
{
    return new IslandEQEditor (*this);
}

} // namespace island

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new island::IslandEQProcessor();
}
