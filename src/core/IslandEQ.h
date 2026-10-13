// Island Parametric EQ - independent 7-band parametric equalizer core.
//
// Header-only, dependency-free C++17. Contains:
//   * parameter mappings (normalized <-> physical units)
//   * per-band biquad cascade design (RBJ cookbook shapes + order/slope logic)
//   * a smoothed, multi-channel realtime equalizer engine
//   * magnitude evaluation and a linear-phase FIR builder
//
// The mappings and design rules reproduce the behaviour observed in the
// original native plugin (see docs/ENGENHARIA_REVERSA.md for the evidence).
#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <complex>
#include <cstdint>
#include <vector>

namespace island::eq
{

constexpr double kPi = 3.14159265358979323846;
constexpr double kLn2 = 0.69314718055994530942;
constexpr int kNumBands = 7;
constexpr int kMaxSections = 4;
constexpr int kMinOrder = -3;
constexpr int kMaxOrder = 3;

constexpr double kMinFreqHz = 20.0;
constexpr double kMaxFreqHz = 20000.0;
constexpr double kMaxGainDb = 18.0;

// UI order of filter types (matches the original band "Type" menu).
enum class FilterType : int
{
    Disabled = 0,
    LowPass,
    BandPass,
    HighPass,
    Notch,
    LowShelf,
    Peaking,
    HighShelf,
    Count
};

inline const char* filterTypeName (FilterType t)
{
    static const char* names[] = { "Disabled", "Low pass", "Band pass", "High pass",
                                   "Band stop", "Low shelf", "Peaking", "High shelf" };
    const int i = static_cast<int> (t);
    return (i >= 0 && i < static_cast<int> (FilterType::Count)) ? names[i] : "?";
}

// Order -3..3: negative = "Steep N", 0 = 2-pole, positive = "Gentle N".
inline const char* orderName (int order)
{
    static const char* names[] = { "Steep 8", "Steep 6", "Steep 4", "2", "Gentle 4", "Gentle 6", "Gentle 8" };
    order = std::clamp (order, kMinOrder, kMaxOrder);
    return names[order - kMinOrder];
}

inline bool typeUsesGain (FilterType t)
{
    return t == FilterType::LowShelf || t == FilterType::Peaking || t == FilterType::HighShelf;
}

//==============================================================================
// Parameter mappings
//==============================================================================
namespace mapping
{
    // Frequency: 20 Hz * 1000^x, x in [0,1] (original stores x * 65536).
    inline double normToHz (double x) { return kMinFreqHz * std::pow (1000.0, std::clamp (x, 0.0, 1.0)); }
    inline double hzToNorm (double hz)
    {
        hz = std::clamp (hz, kMinFreqHz, kMaxFreqHz);
        return std::log (hz / kMinFreqHz) / std::log (1000.0);
    }

    // Level: normalized = (dB * 100 + 1800) / 3600  ->  dB in [-18, +18].
    inline double normToDb (double x) { return std::clamp (x, 0.0, 1.0) * 36.0 - 18.0; }
    inline double dbToNorm (double db) { return (std::clamp (db, -kMaxGainDb, kMaxGainDb) * 100.0 + 1800.0) / 3600.0; }

    // Width (0..1, shown as 0..100 %) maps differently per filter family.
    inline double widthToOctaves (double w) { return 0.1 + 4.9 * std::clamp (w, 0.0, 1.0); }
    inline double widthToPassQ (double w)
    {
        const double k = 1.0 - std::clamp (w, 0.0, 1.0);
        return 0.1 + 9.9 * k * k * k;
    }
    inline double widthToShelfSlope (double w) { return 1.0 / 3.0 + (98.0 / 57.0) * (1.0 - std::clamp (w, 0.0, 1.0)); }

    inline double rawToNorm (int raw) { return static_cast<double> (raw) / 65536.0; }
} // namespace mapping

//==============================================================================
// Factory defaults (from the original editor form resource)
//==============================================================================
struct Defaults
{
    static constexpr std::array<int, kNumBands> freqRaw { 5777, 13024, 19904, 33145, 42327, 49307, 55825 };
    static constexpr std::array<int, kNumBands> widthRaw { 40124, 25412, 25412, 25412, 25412, 25412, 40124 };
    static constexpr std::array<FilterType, kNumBands> type {
        FilterType::LowShelf, FilterType::Peaking, FilterType::Peaking, FilterType::Peaking,
        FilterType::Peaking,  FilterType::Peaking, FilterType::HighShelf };

    static double freqHz (int band) { return mapping::normToHz (mapping::rawToNorm (freqRaw[(size_t) band])); }
    static double width (int band) { return mapping::rawToNorm (widthRaw[(size_t) band]); }
};

//==============================================================================
// Biquad primitives
//==============================================================================
struct BiquadCoeffs
{
    double b0 = 1.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0;

    std::complex<double> response (double w) const
    {
        const std::complex<double> z1 = std::polar (1.0, -w);
        const std::complex<double> z2 = z1 * z1;
        return (b0 + b1 * z1 + b2 * z2) / (1.0 + a1 * z1 + a2 * z2);
    }

    double magnitude (double w) const { return std::abs (response (w)); }
};

struct BiquadState
{
    double z1 = 0.0, z2 = 0.0;

    inline double process (const BiquadCoeffs& c, double x) noexcept
    {
        const double y = c.b0 * x + z1;
        z1 = c.b1 * x - c.a1 * y + z2;
        z2 = c.b2 * x - c.a2 * y;
        return y;
    }

    void reset() noexcept { z1 = z2 = 0.0; }
};

enum class Shape { LowPass, HighPass, BandPass, Notch, Peak, LowShelf, HighShelf };

// RBJ "Audio EQ Cookbook" coefficient formulas, normalized by a0.
inline BiquadCoeffs rbj (Shape shape, double w0, double alpha, double A = 1.0)
{
    const double c = std::cos (w0);
    double b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;

    switch (shape)
    {
        case Shape::LowPass:
            b0 = (1.0 - c) * 0.5; b1 = 1.0 - c; b2 = b0;
            a0 = 1.0 + alpha; a1 = -2.0 * c; a2 = 1.0 - alpha;
            break;
        case Shape::HighPass:
            b0 = (1.0 + c) * 0.5; b1 = -(1.0 + c); b2 = b0;
            a0 = 1.0 + alpha; a1 = -2.0 * c; a2 = 1.0 - alpha;
            break;
        case Shape::BandPass:
            b0 = alpha; b1 = 0.0; b2 = -alpha;
            a0 = 1.0 + alpha; a1 = -2.0 * c; a2 = 1.0 - alpha;
            break;
        case Shape::Notch:
            b0 = 1.0; b1 = -2.0 * c; b2 = 1.0;
            a0 = 1.0 + alpha; a1 = -2.0 * c; a2 = 1.0 - alpha;
            break;
        case Shape::Peak:
            b0 = 1.0 + alpha * A; b1 = -2.0 * c; b2 = 1.0 - alpha * A;
            a0 = 1.0 + alpha / A; a1 = -2.0 * c; a2 = 1.0 - alpha / A;
            break;
        case Shape::LowShelf:
        {
            const double s = 2.0 * std::sqrt (A) * alpha;
            b0 = A * ((A + 1) - (A - 1) * c + s);
            b1 = 2 * A * ((A - 1) - (A + 1) * c);
            b2 = A * ((A + 1) - (A - 1) * c - s);
            a0 = (A + 1) + (A - 1) * c + s;
            a1 = -2 * ((A - 1) + (A + 1) * c);
            a2 = (A + 1) + (A - 1) * c - s;
            break;
        }
        case Shape::HighShelf:
        {
            const double s = 2.0 * std::sqrt (A) * alpha;
            b0 = A * ((A + 1) + (A - 1) * c + s);
            b1 = -2 * A * ((A - 1) + (A + 1) * c);
            b2 = A * ((A + 1) + (A - 1) * c - s);
            a0 = (A + 1) - (A - 1) * c + s;
            a1 = 2 * ((A - 1) - (A + 1) * c);
            a2 = (A + 1) - (A - 1) * c - s;
            break;
        }
    }

    const double inv = 1.0 / a0;
    return { b0 * inv, b1 * inv, b2 * inv, a1 * inv, a2 * inv };
}

//==============================================================================
// Band design
//==============================================================================
struct BandParams
{
    FilterType type = FilterType::Peaking;
    double freqHz = 1000.0;
    double gainDb = 0.0;
    double width = 0.5; // 0..1
    int order = 0;      // -3..3
};

struct BandDesign
{
    std::array<BiquadCoeffs, kMaxSections> sections {};
    int numSections = 0;

    double magnitude (double w) const
    {
        double m = 1.0;
        for (int i = 0; i < numSections; ++i)
            m *= sections[(size_t) i].magnitude (w);
        return m;
    }
};

namespace tables
{
    // Upper w0 limits used by the original design code.
    constexpr double kMaxW = 3.138451099395752;      // ~0.999 pi
    constexpr double kPeakMaxW = 2.1991147994995117; // 0.7 pi
    constexpr double kSteepPeakMaxW = 2.5132741928100586; // 0.8 pi

    // Steep low/high pass: per-section Q multipliers, row = sections - 1.
    constexpr double passSteepQ[4][4] = { { 1.0, 1.0, 1.0, 1.0 },
                                          { 1.98340, 0.74921, 1.0, 1.0 },
                                          { 2.64304, 1.08152, 0.69424, 1.0 },
                                          { 3.57645, 1.14173, 1.04471, 0.65512 } };

    // Steep shelves: per-section slope multipliers.
    constexpr double shelfSteepS[4][4] = { { 1.0, 1.0, 1.0, 1.0 },
                                           { 2.63045, 0.61564, 1.0, 1.0 },
                                           { 5.16123, 1.10927, 0.50987, 1.0 },
                                           { 10.31912, 1.51444, 0.69403, 0.553 } };

    // Steep peaks: sections are spread around the centre frequency
    // (offsets in units of the per-section bandwidth, in octaves) ...
    constexpr double peakSteepOffset[4][4] = { { 0.0, 0.0, 0.0, 0.0 },
                                               { -0.25, 0.25, 0.0, 0.0 },
                                               { -0.475, 0.0, 0.475, 0.0 },
                                               { -0.775, -0.3, 0.3, 0.775 } };
    // ... with the inner sections widened ...
    constexpr double peakSteepWidth[4][4] = { { 1.0, 1.0, 1.0, 1.0 },
                                              { 1.0, 1.0, 1.0, 1.0 },
                                              { 1.0, 1.5708, 1.0, 1.0 },
                                              { 1.0, 1.5708, 1.5708, 1.0 } };
    // ... and each one carrying this share of the band gain.
    constexpr double peakSteepGain[4] = { 0.5, 0.32125, 0.2442, 0.21444 };
} // namespace tables

inline double bwAlpha (double w0, double octaves)
{
    const double s = std::sin (w0);
    return s * std::sinh (kLn2 * 0.5 * octaves * w0 / s);
}

inline BandDesign designBand (const BandParams& p, double sampleRate)
{
    BandDesign d;
    if (p.type == FilterType::Disabled || sampleRate <= 0.0)
        return d;

    const int extra = std::abs (std::clamp (p.order, kMinOrder, kMaxOrder));
    const int n = extra + 1;
    const bool steep = p.order < 0;
    const double freq = std::clamp (p.freqHz, kMinFreqHz, kMaxFreqHz);
    const double wBase = 2.0 * kPi * freq / sampleRate;
    const double width = std::clamp (p.width, 0.0, 1.0);
    const double gainDb = std::clamp (p.gainDb, -kMaxGainDb, kMaxGainDb);

    d.numSections = n;

    switch (p.type)
    {
        case FilterType::LowPass:
        case FilterType::HighPass:
        {
            const double w0 = std::min (wBase, tables::kMaxW);
            double q = mapping::widthToPassQ (width);
            if (n > 1)
                q = std::pow (q, 1.0 / n);
            const Shape shape = p.type == FilterType::LowPass ? Shape::LowPass : Shape::HighPass;
            for (int i = 0; i < n; ++i)
            {
                const double qi = q * (steep ? tables::passSteepQ[extra][i] : 1.0);
                d.sections[(size_t) i] = rbj (shape, w0, std::sin (w0) / (2.0 * qi));
            }
            break;
        }

        case FilterType::BandPass:
        case FilterType::Notch:
        {
            const double w0 = std::min (wBase, tables::kMaxW);
            const double scale = std::sqrt (static_cast<double> (n));
            const bool bp = p.type == FilterType::BandPass;
            const double oct = mapping::widthToOctaves (width) * (bp ? scale : 1.0 / scale);
            const auto c = rbj (bp ? Shape::BandPass : Shape::Notch, w0, bwAlpha (w0, oct));
            for (int i = 0; i < n; ++i)
                d.sections[(size_t) i] = c;
            break;
        }

        case FilterType::Peaking:
        {
            const double oct = mapping::widthToOctaves (width);
            if (steep && n > 1)
            {
                const double secOct = oct / n;
                for (int i = 0; i < n; ++i)
                {
                    const double fi = freq * std::pow (2.0, tables::peakSteepOffset[extra][i] * secOct);
                    const double w0 = std::min (2.0 * kPi * fi / sampleRate, tables::kSteepPeakMaxW);
                    const double octI = secOct * tables::peakSteepWidth[extra][i];
                    // The shares sum to ~half the band gain; a runtime constant (not
                    // statically readable) restores it, inferred here as 2.
                    const double share = 2.0 * ((n == 2) ? tables::peakSteepGain[1] - (octI - 1.0) * 0.01
                                                         : tables::peakSteepGain[extra]);
                    const double A = std::pow (10.0, gainDb * share / 40.0);
                    d.sections[(size_t) i] = rbj (Shape::Peak, w0, bwAlpha (w0, octI), A);
                }
            }
            else
            {
                const double w0 = std::min (wBase, tables::kPeakMaxW);
                const double A = std::pow (10.0, gainDb / n / 40.0);
                const auto c = rbj (Shape::Peak, w0, bwAlpha (w0, oct), A);
                for (int i = 0; i < n; ++i)
                    d.sections[(size_t) i] = c;
            }
            break;
        }

        case FilterType::LowShelf:
        case FilterType::HighShelf:
        {
            const double w0 = std::min (wBase, tables::kMaxW);
            const double s = mapping::widthToShelfSlope (width);
            const double A = std::pow (10.0, gainDb / n / 40.0);
            const Shape shape = p.type == FilterType::LowShelf ? Shape::LowShelf : Shape::HighShelf;
            for (int i = 0; i < n; ++i)
            {
                const double si = s * (steep ? tables::shelfSteepS[extra][i] : 1.0);
                const double k = std::max (1.0e-9, (A + 1.0 / A) * (1.0 / si - 1.0) + 2.0);
                d.sections[(size_t) i] = rbj (shape, w0, std::sin (w0) * 0.5 * std::sqrt (k), A);
            }
            break;
        }

        case FilterType::Disabled:
        case FilterType::Count:
            d.numSections = 0;
            break;
    }

    return d;
}

// Filter used to audition ("solo") a band: a Steep 8 band pass around it.
inline BandDesign designSolo (const BandParams& p, double sampleRate)
{
    BandParams s = p;
    s.type = FilterType::BandPass;
    s.order = kMinOrder;
    if (p.type == FilterType::LowShelf || p.type == FilterType::HighShelf
        || p.type == FilterType::LowPass || p.type == FilterType::HighPass)
        s.width = 0.4;
    return designBand (s, sampleRate);
}

enum class BandState { Normal = 0, Mute, Solo };

//==============================================================================
// Realtime engine
//==============================================================================
class Equalizer
{
public:
    static constexpr int kMaxChannels = 8;
    static constexpr int kControlInterval = 16; // samples between coefficient updates

    void prepare (double sampleRate, int numChannels)
    {
        fs = sampleRate;
        channels = std::clamp (numChannels, 1, kMaxChannels);
        // ~ 30 ms one-pole smoothing for continuous parameters
        smoothCoeff = std::exp (-kControlInterval / (0.030 * fs));
        for (int b = 0; b < kNumBands; ++b)
            current[(size_t) b] = target[(size_t) b];
        currentMain = targetMain;
        rebuildAll();
        reset();
    }

    void reset()
    {
        for (auto& ch : states)
            for (auto& band : ch)
                for (auto& s : band)
                    s.reset();
        counter = 0;
    }

    void setBand (int band, const BandParams& p)
    {
        auto& t = target[(size_t) band];
        if (p.type != t.type || p.order != t.order)
        {
            // discrete changes are applied immediately
            current[(size_t) band].type = p.type;
            current[(size_t) band].order = p.order;
            dirty[(size_t) band] = true;
        }
        t = p;
    }

    const BandParams& getBand (int band) const { return target[(size_t) band]; }

    void setBandState (int band, BandState s)
    {
        if (bandState[(size_t) band] != s)
        {
            bandState[(size_t) band] = s;
            dirty[(size_t) band] = true;
        }
    }

    BandState getBandState (int band) const { return bandState[(size_t) band]; }

    void setMainGainDb (double db) { targetMain = std::clamp (db, -kMaxGainDb, kMaxGainDb); }

    double getSampleRate() const { return fs; }

    bool anySolo() const
    {
        for (auto s : bandState)
            if (s == BandState::Solo)
                return true;
        return false;
    }

    // In-place processing of non-interleaved float buffers.
    void process (float* const* data, int numChannels, int numSamples)
    {
        numChannels = std::min (numChannels, channels);
        int pos = 0;
        while (pos < numSamples)
        {
            if (counter <= 0)
            {
                advanceSmoothing();
                counter = kControlInterval;
            }

            const int len = std::min (counter, numSamples - pos);
            const bool solo = anySolo();
            const double mainGain = std::pow (10.0, currentMain / 20.0);

            for (int ch = 0; ch < numChannels; ++ch)
            {
                float* x = data[ch] + pos;
                auto& chState = states[(size_t) ch];

                if (solo)
                {
                    for (int i = 0; i < len; ++i)
                    {
                        const double in = x[i];
                        double sum = 0.0;
                        for (int b = 0; b < kNumBands; ++b)
                        {
                            if (bandState[(size_t) b] != BandState::Solo)
                                continue;
                            const auto& d = soloDesign[(size_t) b];
                            double v = in;
                            for (int s = 0; s < d.numSections; ++s)
                                v = chState[(size_t) b][(size_t) s].process (d.sections[(size_t) s], v);
                            sum += v;
                        }
                        x[i] = static_cast<float> (sum * mainGain);
                    }
                }
                else
                {
                    for (int i = 0; i < len; ++i)
                    {
                        double v = x[i];
                        for (int b = 0; b < kNumBands; ++b)
                        {
                            if (bandState[(size_t) b] == BandState::Mute)
                                continue;
                            const auto& d = design[(size_t) b];
                            for (int s = 0; s < d.numSections; ++s)
                                v = chState[(size_t) b][(size_t) s].process (d.sections[(size_t) s], v);
                        }
                        x[i] = static_cast<float> (v * mainGain);
                    }
                }
            }

            counter -= len;
            pos += len;
        }

        // flush denormals / runaway states (e.g. NaN input)
        for (int ch = 0; ch < numChannels; ++ch)
            for (auto& band : states[(size_t) ch])
                for (auto& s : band)
                    if (! std::isfinite (s.z1) || ! std::isfinite (s.z2) || std::abs (s.z1) < 1e-30)
                        s.reset();
    }

    // Combined linear magnitude of the target settings at a frequency in Hz,
    // evaluated for an arbitrary design sample rate (default: engine rate).
    double magnitudeAt (double hz, double designRate = 0.0) const
    {
        return magnitudeOf (target, targetMain, bandState, hz, designRate > 0 ? designRate : fs);
    }

    static double magnitudeOf (const std::array<BandParams, kNumBands>& bands, double mainDb,
                               const std::array<BandState, kNumBands>& st, double hz, double rate)
    {
        const double w = 2.0 * kPi * hz / rate;
        bool solo = false;
        for (auto s : st)
            solo = solo || s == BandState::Solo;

        if (solo)
        {
            std::complex<double> sum = 0.0;
            for (int b = 0; b < kNumBands; ++b)
            {
                if (st[(size_t) b] != BandState::Solo)
                    continue;
                const auto d = designSolo (bands[(size_t) b], rate);
                std::complex<double> h = 1.0;
                for (int s = 0; s < d.numSections; ++s)
                    h *= d.sections[(size_t) s].response (w);
                sum += h;
            }
            return std::abs (sum) * std::pow (10.0, mainDb / 20.0);
        }

        double m = std::pow (10.0, mainDb / 20.0);
        for (int b = 0; b < kNumBands; ++b)
            if (st[(size_t) b] != BandState::Mute)
                m *= designBand (bands[(size_t) b], rate).magnitude (w);
        return m;
    }

    const std::array<BandParams, kNumBands>& targets() const { return target; }
    const std::array<BandState, kNumBands>& states_() const { return bandState; }
    double mainGainDb() const { return targetMain; }

private:
    static bool isClose (double a, double b, double eps) { return std::abs (a - b) <= eps; }

    void advanceSmoothing()
    {
        const double k = smoothCoeff;
        for (int b = 0; b < kNumBands; ++b)
        {
            auto& c = current[(size_t) b];
            const auto& t = target[(size_t) b];
            bool changed = dirty[(size_t) b];

            const double lf = std::log (c.freqHz), lt = std::log (t.freqHz);
            if (! isClose (lf, lt, 1e-5)) { c.freqHz = std::exp (lt + (lf - lt) * k); changed = true; }
            else if (c.freqHz != t.freqHz) { c.freqHz = t.freqHz; changed = true; }

            if (! isClose (c.gainDb, t.gainDb, 1e-4)) { c.gainDb = t.gainDb + (c.gainDb - t.gainDb) * k; changed = true; }
            else if (c.gainDb != t.gainDb) { c.gainDb = t.gainDb; changed = true; }

            if (! isClose (c.width, t.width, 1e-5)) { c.width = t.width + (c.width - t.width) * k; changed = true; }
            else if (c.width != t.width) { c.width = t.width; changed = true; }

            if (changed)
            {
                rebuild (b);
                dirty[(size_t) b] = false;
            }
        }

        if (! isClose (currentMain, targetMain, 1e-4)) currentMain = targetMain + (currentMain - targetMain) * k;
        else currentMain = targetMain;
    }

    void rebuild (int b)
    {
        design[(size_t) b] = designBand (current[(size_t) b], fs);
        soloDesign[(size_t) b] = designSolo (current[(size_t) b], fs);
    }

    void rebuildAll()
    {
        for (int b = 0; b < kNumBands; ++b)
        {
            rebuild (b);
            dirty[(size_t) b] = false;
        }
    }

    double fs = 44100.0;
    int channels = 2;
    double smoothCoeff = 0.0;
    int counter = 0;

    std::array<BandParams, kNumBands> target = makeDefaults();
    std::array<BandParams, kNumBands> current = makeDefaults();
    std::array<BandState, kNumBands> bandState {};
    std::array<bool, kNumBands> dirty {};
    std::array<BandDesign, kNumBands> design {};
    std::array<BandDesign, kNumBands> soloDesign {};
    double targetMain = 0.0, currentMain = 0.0;

    std::array<std::array<std::array<BiquadState, kMaxSections>, kNumBands>, kMaxChannels> states {};

public:
    static std::array<BandParams, kNumBands> makeDefaults()
    {
        std::array<BandParams, kNumBands> d {};
        for (int b = 0; b < kNumBands; ++b)
        {
            d[(size_t) b].type = Defaults::type[(size_t) b];
            d[(size_t) b].freqHz = Defaults::freqHz (b);
            d[(size_t) b].width = Defaults::width (b);
            d[(size_t) b].gainDb = 0.0;
            d[(size_t) b].order = 0;
        }
        return d;
    }
};

//==============================================================================
// FFT + linear-phase FIR
//==============================================================================
inline void fft (std::vector<std::complex<double>>& a, bool inverse)
{
    const size_t n = a.size();
    for (size_t i = 1, j = 0; i < n; ++i)
    {
        size_t bit = n >> 1;
        for (; j & bit; bit >>= 1)
            j ^= bit;
        j ^= bit;
        if (i < j)
            std::swap (a[i], a[j]);
    }
    for (size_t len = 2; len <= n; len <<= 1)
    {
        const double ang = 2.0 * kPi / static_cast<double> (len) * (inverse ? 1.0 : -1.0);
        const std::complex<double> wl (std::cos (ang), std::sin (ang));
        for (size_t i = 0; i < n; i += len)
        {
            std::complex<double> w (1.0);
            for (size_t k = 0; k < len / 2; ++k)
            {
                const auto u = a[i + k];
                const auto v = a[i + k + len / 2] * w;
                a[i + k] = u + v;
                a[i + k + len / 2] = u - v;
                w *= wl;
            }
        }
    }
    if (inverse)
        for (auto& x : a)
            x /= static_cast<double> (n);
}

// Builds a symmetric (linear-phase) FIR of `length` taps (power of two) whose
// magnitude follows magnitudeFn(hz). Latency is length / 2 samples.
template <typename MagnitudeFn>
std::vector<float> buildLinearPhaseFir (int length, double sampleRate, MagnitudeFn&& magnitudeFn)
{
    const size_t n = static_cast<size_t> (length);
    std::vector<std::complex<double>> spec (n);
    for (size_t k = 0; k <= n / 2; ++k)
    {
        const double hz = sampleRate * static_cast<double> (k) / static_cast<double> (n);
        const double m = magnitudeFn (std::max (hz, 1.0));
        spec[k] = m;
        if (k > 0 && k < n / 2)
            spec[n - k] = m;
    }
    fft (spec, true);

    std::vector<float> fir (n);
    for (size_t i = 0; i < n; ++i)
    {
        const size_t src = (i + n / 2) % n; // centre the zero-phase impulse
        // Blackman window
        const double t = static_cast<double> (i) / static_cast<double> (n);
        const double win = 0.42 - 0.5 * std::cos (2.0 * kPi * t) + 0.08 * std::cos (4.0 * kPi * t);
        fir[i] = static_cast<float> (spec[src].real() * win);
    }
    return fir;
}

} // namespace island::eq
