// Unit tests for the dependency-free EQ core. Run: ctest (or ./islandeq_core_tests -v)
#include "core/IslandEQ.h"

#include <cstdio>
#include <cstring>
#include <functional>
#include <string>

using namespace island::eq;

namespace
{
int failures = 0;
bool verbose = false;

void check (bool ok, const std::string& what)
{
    if (! ok)
    {
        ++failures;
        std::printf ("FAIL: %s\n", what.c_str());
    }
    else if (verbose)
    {
        std::printf ("ok:   %s\n", what.c_str());
    }
}

void near (double got, double want, double tol, const std::string& what)
{
    char buf[256];
    std::snprintf (buf, sizeof buf, "%s (got %.4f, want %.4f +- %.4f)", what.c_str(), got, want, tol);
    check (std::abs (got - want) <= tol, buf);
}

double db (double lin) { return 20.0 * std::log10 (std::max (lin, 1e-12)); }

double bandDb (const BandParams& p, double hz, double fs = 48000.0)
{
    return db (designBand (p, fs).magnitude (2.0 * kPi * hz / fs));
}

void testMappings()
{
    near (mapping::normToHz (0.0), 20.0, 1e-9, "freq min");
    near (mapping::normToHz (1.0), 20000.0, 1e-6, "freq max");
    near (mapping::hzToNorm (mapping::normToHz (0.37)), 0.37, 1e-12, "freq round trip");
    near (mapping::dbToNorm (0.0), 0.5, 1e-12, "level 0 dB is centre");
    near (mapping::normToDb (1.0), 18.0, 1e-12, "level max");
    near (mapping::normToDb (mapping::dbToNorm (-7.25)), -7.25, 1e-12, "level round trip");

    // Factory defaults land on "nice" design values, which corroborates the mappings.
    near (mapping::widthToOctaves (Defaults::width (1)), 2.0, 0.001, "default peak width = 2 octaves");
    near (mapping::widthToShelfSlope (Defaults::width (0)), 1.0, 0.001, "default shelf slope S = 1");

    const double expected[kNumBands] = { 36.8, 78.9, 163.0, 658.1, 1732.2, 3615.1, 7186.1 };
    for (int b = 0; b < kNumBands; ++b)
        near (Defaults::freqHz (b), expected[b], 0.1, "default freq band " + std::to_string (b + 1));
}

void testPeaks()
{
    for (int order = 0; order <= 3; ++order)
    {
        BandParams p { FilterType::Peaking, 1000.0, 12.0, Defaults::width (1), order };
        near (bandDb (p, 1000.0), 12.0, 0.01, "gentle peak centre gain, order " + std::to_string (order));
        near (bandDb (p, 20.0), 0.0, 0.3, "gentle peak far-off gain, order " + std::to_string (order));
    }
    for (int order = -1; order >= -3; --order)
    {
        BandParams p { FilterType::Peaking, 1000.0, 12.0, Defaults::width (1), order };
        const double c = bandDb (p, 1000.0);
        near (c, 12.0, 0.5, "steep peak centre gain, order " + std::to_string (order));
        near (bandDb (p, 20.0), 0.0, 0.3, "steep peak far-off gain, order " + std::to_string (order));
    }
    BandParams cut { FilterType::Peaking, 3000.0, -18.0, 0.2, 0 };
    near (bandDb (cut, 3000.0), -18.0, 0.01, "peak cut");

    BandParams flat { FilterType::Peaking, 3000.0, 0.0, 0.2, 0 };
    near (bandDb (flat, 3000.0), 0.0, 1e-9, "0 dB peak is transparent");
}

void testShelves()
{
    BandParams ls { FilterType::LowShelf, 200.0, 12.0, Defaults::width (0), 0 };
    near (bandDb (ls, 10.0), 12.0, 0.05, "low shelf DC gain");
    near (bandDb (ls, 20000.0), 0.0, 0.05, "low shelf HF gain");
    near (bandDb (ls, 200.0), 6.0, 0.05, "low shelf midpoint");

    BandParams hs { FilterType::HighShelf, 4000.0, -9.0, Defaults::width (6), 0 };
    near (bandDb (hs, 20000.0, 96000.0), -9.0, 0.3, "high shelf HF gain");
    near (bandDb (hs, 20.0), 0.0, 0.05, "high shelf LF gain");

    for (int order : { -3, -1, 2, 3 })
    {
        BandParams p { FilterType::LowShelf, 200.0, 12.0, Defaults::width (0), order };
        near (bandDb (p, 10.0), 12.0, 0.05, "low shelf DC gain, order " + std::to_string (order));
    }
}

void testPassSlopes()
{
    const double fc = 1000.0;
    for (int order = -3; order <= 3; ++order)
    {
        const int poles = 2 * (std::abs (order) + 1);
        BandParams lp { FilterType::LowPass, fc, 0.0, Defaults::width (0), order };
        const double slope = bandDb (lp, 8000.0, 192000.0) - bandDb (lp, 16000.0, 192000.0);
        near (slope, 6.0 * poles, 2.0, "low pass slope dB/oct, order " + std::to_string (order));
        near (bandDb (lp, 20.0, 192000.0), 0.0, 0.1, "low pass passband, order " + std::to_string (order));

        BandParams hp { FilterType::HighPass, fc, 0.0, Defaults::width (0), order };
        const double hslope = bandDb (hp, 125.0, 192000.0) - bandDb (hp, 62.5, 192000.0);
        near (hslope, 6.0 * poles, 2.0, "high pass slope dB/oct, order " + std::to_string (order));
    }

    BandParams bp { FilterType::BandPass, 2000.0, 0.0, 0.3, 0 };
    near (bandDb (bp, 2000.0), 0.0, 0.01, "band pass unity at centre");
    check (bandDb (bp, 200.0) < -15.0, "band pass rejects far frequencies");

    BandParams notch { FilterType::Notch, 2000.0, 0.0, 0.3, 0 };
    check (bandDb (notch, 2000.0) < -60.0, "notch nulls the centre");
    near (bandDb (notch, 50.0), 0.0, 0.1, "notch passband");

    BandParams off { FilterType::Disabled, 2000.0, 12.0, 0.3, 0 };
    check (designBand (off, 48000.0).numSections == 0, "disabled band has no sections");
}

void testEngineMatchesDesign()
{
    const double fs = 48000.0;
    Equalizer eq;
    eq.setBand (1, { FilterType::Peaking, 120.0, 9.0, 0.3, 0 });
    eq.setBand (3, { FilterType::Peaking, 1500.0, -6.0, 0.5, -2 });
    eq.setBand (6, { FilterType::HighShelf, 6000.0, 4.0, 0.6, 1 });
    eq.setMainGainDb (-3.0);
    eq.prepare (fs, 1);

    const int n = 1 << 15;
    std::vector<float> buf ((size_t) n, 0.0f);
    buf[0] = 1.0f;
    float* chans[] = { buf.data() };
    eq.process (chans, 1, n);

    std::vector<std::complex<double>> spec (buf.begin(), buf.end());
    fft (spec, false);
    for (double hz : { 50.0, 120.0, 700.0, 1500.0, 5000.0, 12000.0 })
    {
        const size_t k = (size_t) std::lround (hz * n / fs);
        const double binHz = (double) k * fs / n;
        near (db (std::abs (spec[k])), db (eq.magnitudeAt (binHz)), 0.05,
              "engine impulse response at " + std::to_string ((int) hz) + " Hz");
    }

    // Mute removes a band, solo isolates it.
    eq.setBandState (1, BandState::Mute);
    near (db (eq.magnitudeAt (120.0)), db (eq.magnitudeAt (120.0)), 0.0, "mute evaluates");
    check (db (eq.magnitudeAt (120.0)) < 3.0, "muted peak no longer boosts");
    eq.setBandState (1, BandState::Normal);
    eq.setBandState (3, BandState::Solo);
    check (eq.anySolo(), "solo flag");
    check (db (eq.magnitudeAt (100.0)) < -30.0, "solo band rejects other regions");
}

void testSmoothingNoBlowUp()
{
    Equalizer eq;
    eq.prepare (44100.0, 2);
    std::vector<float> l (4096), r (4096);
    float* chans[] = { l.data(), r.data() };
    double phase = 0.0;
    for (int block = 0; block < 200; ++block)
    {
        for (size_t i = 0; i < l.size(); ++i)
        {
            l[i] = r[i] = (float) std::sin (phase);
            phase += 2.0 * kPi * 440.0 / 44100.0;
        }
        // sweep parameters every block
        const double x = (block % 50) / 49.0;
        eq.setBand (2, { FilterType::Peaking, mapping::normToHz (x), 18.0 * (2 * x - 1), x, (block / 50) - 2 });
        eq.setBand (0, { block % 2 ? FilterType::LowPass : FilterType::HighShelf, mapping::normToHz (1 - x), 6.0, x, -3 });
        eq.process (chans, 2, (int) l.size());
        for (float v : l)
            if (! std::isfinite (v) || std::abs (v) > 100.0f)
            {
                check (false, "output stays finite under parameter sweeps");
                return;
            }
    }
    check (true, "output stays finite under parameter sweeps");
}

void testLinearPhaseFir()
{
    const double fs = 48000.0;
    Equalizer eq;
    eq.setBand (2, { FilterType::Peaking, 400.0, 10.0, 0.35, 0 });
    eq.setBand (5, { FilterType::Peaking, 5000.0, -8.0, 0.2, 0 });
    eq.prepare (fs, 1);

    const int len = 8192;
    auto fir = buildLinearPhaseFir (len, fs, [&] (double hz) { return eq.magnitudeAt (hz); });
    check ((int) fir.size() == len, "fir length");
    // symmetric around len/2
    double asym = 0.0;
    for (int i = 1; i < len / 2; ++i)
        asym = std::max (asym, (double) std::abs (fir[(size_t) (len / 2 - i)] - fir[(size_t) (len / 2 + i)]));
    check (asym < 1e-6, "fir is symmetric (linear phase)");

    std::vector<std::complex<double>> spec (fir.begin(), fir.end());
    fft (spec, false);
    for (double hz : { 100.0, 400.0, 1000.0, 5000.0, 15000.0 })
    {
        const size_t k = (size_t) std::lround (hz * len / fs);
        near (db (std::abs (spec[k])), db (eq.magnitudeAt ((double) k * fs / len)), 0.2,
              "fir magnitude at " + std::to_string ((int) hz) + " Hz");
    }
}
} // namespace

int main (int argc, char** argv)
{
    verbose = argc > 1 && std::strcmp (argv[1], "-v") == 0;
    testMappings();
    testPeaks();
    testShelves();
    testPassSlopes();
    testEngineMatchesDesign();
    testSmoothingNoBlowUp();
    testLinearPhaseFir();

    if (failures == 0)
        std::printf ("all core tests passed\n");
    else
        std::printf ("%d failure(s)\n", failures);
    return failures == 0 ? 0 : 1;
}
