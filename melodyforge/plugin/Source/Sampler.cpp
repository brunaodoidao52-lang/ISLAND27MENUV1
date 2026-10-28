#include "Sampler.h"

#include <cmath>
#include <cstddef>
#include <map>
#include <mutex>

namespace mfplug
{

// ============================================================================ SoundFont reader
namespace
{
    enum Gen
    {
        StartOffset = 0, EndOffset = 1, StartLoopOffset = 2, EndLoopOffset = 3, StartCoarse = 4,
        FilterFc = 8, FilterQ = 9, EndCoarse = 12, Pan = 17,
        DelayVol = 33, AttackVol = 34, HoldVol = 35, DecayVol = 36, SustainVol = 37, ReleaseVol = 38,
        KeyToHold = 39, KeyToDecay = 40, Instrument = 41, KeyRange = 43, VelRange = 44, StartLoopCoarse = 45,
        Attenuation = 48, EndLoopCoarse = 50, CoarseTune = 51, FineTune = 52, SampleId = 53, SampleModes = 54,
        ScaleTuning = 56, ExclusiveClass = 57, RootKey = 58, NumGens = 61
    };

    struct GenSet
    {
        std::array<int, NumGens> v {};
        std::array<bool, NumGens> set {};
        void apply (int op, int value) { if (op >= 0 && op < NumGens) { v[(size_t) op] = value; set[(size_t) op] = true; } }
    };

    struct RawSample { juce::uint32 start, end, loopStart, loopEnd, rate; int pitch, correction, type; };
    struct Zone { std::vector<std::pair<int, int>> gens; };   // (operator, raw 16-bit amount)

    int s16 (int raw) { return (juce::int16) (juce::uint16) raw; }
    int lo8 (int raw) { return raw & 0xff; }
    int hi8 (int raw) { return (raw >> 8) & 0xff; }

    bool isRange (int op) { return op == KeyRange || op == VelRange; }
    bool isUnsigned (int op) { return op == Instrument || op == SampleId || op == SampleModes; }

    GenSet instrumentDefaults()
    {
        GenSet g;
        g.v[FilterFc] = 13500;
        for (int op : { DelayVol, AttackVol, HoldVol, DecayVol, ReleaseVol }) g.v[(size_t) op] = -12000;
        g.v[KeyRange] = 127 << 8;
        g.v[VelRange] = 127 << 8;
        g.v[ScaleTuning] = 100;
        g.v[RootKey] = -1;
        return g;
    }

    float seconds (double tc) { return (float) std::pow (2.0, juce::jlimit (-12000.0, 8000.0, tc) / 1200.0); }

    struct Reader
    {
        juce::FileInputStream& in;
        explicit Reader (juce::FileInputStream& s) : in (s) {}
        bool id (const char* expect) { char b[4]; return in.read (b, 4) == 4 && std::memcmp (b, expect, 4) == 0; }
        juce::String fourcc() { char b[5] = {}; in.read (b, 4); return b; }
        juce::uint32 u32() { return (juce::uint32) in.readInt(); }
    };
} // namespace

std::shared_ptr<const SoundBank> SoundBank::load (const juce::File& f, juce::String& error,
                                                  const std::function<bool()>& shouldCancel)
{
    juce::FileInputStream in (f);
    if (! in.openedOk()) { error = pt ("não foi possível abrir ") + f.getFileName(); return nullptr; }
    Reader r (in);
    if (! r.id ("RIFF")) { error = pt ("não é um arquivo SoundFont (.sf2)"); return nullptr; }
    r.u32();
    if (! r.id ("sfbk")) { error = pt ("não é um arquivo SoundFont (.sf2)"); return nullptr; }

    auto bank = std::make_shared<SoundBank>();
    bank->file = f;
    juce::MemoryBlock phdr, pbag, pgen, inst, ibag, igen, shdr;
    bool haveSamples = false;

    while (! in.isExhausted())
    {
        auto cid = r.fourcc();
        auto size = r.u32();
        auto listEnd = in.getPosition() + size + (size & 1);
        if (cid != "LIST") { in.setPosition (listEnd); continue; }
        auto kind = r.fourcc();
        while (in.getPosition() + 8 <= listEnd)
        {
            auto sid = r.fourcc();
            auto ssize = r.u32();
            auto next = in.getPosition() + ssize + (ssize & 1);
            if (kind == "INFO" && sid == "INAM")
            {
                juce::MemoryBlock b;
                in.readIntoMemoryBlock (b, (std::ptrdiff_t) ssize);
                bank->name = juce::String::fromUTF8 ((const char*) b.getData(), (int) strnlen ((const char*) b.getData(), ssize));
            }
            else if (kind == "sdta" && sid == "smpl")
            {
                bank->samples.resize (ssize / 2);
                auto* dest = reinterpret_cast<char*> (bank->samples.data());
                size_t done = 0, total = (size_t) (ssize / 2) * 2;
                while (done < total)
                {
                    if (shouldCancel && shouldCancel()) { error = "cancelado"; return nullptr; }
                    auto chunk = (int) std::min<size_t> (total - done, 1u << 22);
                    if (in.read (dest + done, chunk) != chunk) { error = "arquivo incompleto"; return nullptr; }
                    done += (size_t) chunk;
                }
               #if JUCE_BIG_ENDIAN
                for (auto& s : bank->samples) s = (juce::int16) juce::ByteOrder::swap ((juce::uint16) s);
               #endif
                haveSamples = true;
            }
            else if (kind == "pdta")
            {
                juce::MemoryBlock* target = sid == "phdr" ? &phdr : sid == "pbag" ? &pbag : sid == "pgen" ? &pgen
                                          : sid == "inst" ? &inst : sid == "ibag" ? &ibag : sid == "igen" ? &igen
                                          : sid == "shdr" ? &shdr : nullptr;
                if (target != nullptr) in.readIntoMemoryBlock (*target, (std::ptrdiff_t) ssize);
            }
            in.setPosition (next);
        }
        in.setPosition (listEnd);
    }
    if (! haveSamples || phdr.getSize() < 76 || shdr.getSize() < 92 || inst.getSize() < 44)
    {
        error = pt ("SoundFont sem amostras ou sem instrumentos");
        return nullptr;
    }

    auto rd16 = [] (const juce::MemoryBlock& b, size_t off) { return (int) juce::ByteOrder::littleEndianShort ((const char*) b.getData() + off); };
    auto rd32 = [] (const juce::MemoryBlock& b, size_t off) { return (juce::uint32) juce::ByteOrder::littleEndianInt ((const char*) b.getData() + off); };
    auto name20 = [] (const juce::MemoryBlock& b, size_t off)
    {
        auto* p = (const char*) b.getData() + off;
        return juce::String (p, strnlen (p, 20)).trim();
    };

    std::vector<RawSample> samples;
    for (size_t off = 0; off + 46 <= shdr.getSize(); off += 46)
    {
        auto* p = (const juce::uint8*) shdr.getData() + off;
        samples.push_back ({ rd32 (shdr, off + 20), rd32 (shdr, off + 24), rd32 (shdr, off + 28), rd32 (shdr, off + 32),
                             rd32 (shdr, off + 36), (int) p[40], (int) (juce::int8) p[41], rd16 (shdr, off + 44) });
    }
    auto bagZones = [&] (const juce::MemoryBlock& bags, const juce::MemoryBlock& gens, int first, int last)
    {
        std::vector<Zone> zones;
        const int nbags = (int) (bags.getSize() / 4), ngens = (int) (gens.getSize() / 4);
        for (int b = first; b < last && b + 1 < nbags; ++b)
        {
            Zone z;
            int g0 = rd16 (bags, (size_t) b * 4) & 0xffff, g1 = rd16 (bags, (size_t) (b + 1) * 4) & 0xffff;
            for (int gi = g0; gi < g1 && gi < ngens; ++gi)
                z.gens.push_back ({ rd16 (gens, (size_t) gi * 4) & 0xffff, rd16 (gens, (size_t) gi * 4 + 2) & 0xffff });
            zones.push_back (std::move (z));
        }
        return zones;
    };
    auto valueOf = [] (int op, int raw) { return isRange (op) || isUnsigned (op) ? raw : s16 (raw); };
    auto has = [] (const Zone& z, int op) { for (auto& g : z.gens) if (g.first == op) return true; return false; };

    const int ninst = (int) (inst.getSize() / 22);
    const int npresets = (int) (phdr.getSize() / 38);
    for (int pi = 0; pi + 1 < npresets; ++pi)
    {
        BankPreset preset;
        preset.name = name20 (phdr, (size_t) pi * 38);
        preset.program = rd16 (phdr, (size_t) pi * 38 + 20) & 0xffff;
        preset.bank = rd16 (phdr, (size_t) pi * 38 + 22) & 0xffff;
        auto pzones = bagZones (pbag, pgen, rd16 (phdr, (size_t) pi * 38 + 24) & 0xffff, rd16 (phdr, (size_t) (pi + 1) * 38 + 24) & 0xffff);
        GenSet pglobal;
        pglobal.v[KeyRange] = 127 << 8; pglobal.v[VelRange] = 127 << 8;
        for (size_t zi = 0; zi < pzones.size(); ++zi)
        {
            const auto& pz = pzones[zi];
            if (! has (pz, Instrument))
            {
                if (zi == 0) for (auto& g : pz.gens) pglobal.apply (g.first, valueOf (g.first, g.second));
                continue;
            }
            GenSet pg = pglobal;
            for (auto& g : pz.gens) pg.apply (g.first, valueOf (g.first, g.second));
            int ii = pg.v[Instrument];
            if (ii < 0 || ii + 1 >= ninst) continue;
            auto izones = bagZones (ibag, igen, rd16 (inst, (size_t) ii * 22 + 20) & 0xffff, rd16 (inst, (size_t) (ii + 1) * 22 + 20) & 0xffff);
            GenSet iglobal = instrumentDefaults();
            for (size_t zj = 0; zj < izones.size(); ++zj)
            {
                const auto& iz = izones[zj];
                if (! has (iz, SampleId))
                {
                    if (zj == 0) for (auto& g : iz.gens) iglobal.apply (g.first, valueOf (g.first, g.second));
                    continue;
                }
                GenSet ig = iglobal;
                for (auto& g : iz.gens) ig.apply (g.first, valueOf (g.first, g.second));
                int si = ig.v[SampleId];
                if (si < 0 || si + 1 >= (int) samples.size()) continue;
                const auto& sm = samples[(size_t) si];
                if ((sm.type & 0x8000) != 0) continue;   // ROM samples

                // preset values are offsets on top of the instrument values
                auto total = [&] (int op) { return ig.v[(size_t) op] + (pg.set[(size_t) op] ? pg.v[(size_t) op] : 0); };
                SampleRegion rg;
                rg.keyLo = std::max (lo8 (ig.v[KeyRange]), lo8 (pg.v[KeyRange]));
                rg.keyHi = std::min (hi8 (ig.v[KeyRange]), hi8 (pg.v[KeyRange]));
                rg.velLo = std::max (lo8 (ig.v[VelRange]), lo8 (pg.v[VelRange]));
                rg.velHi = std::min (hi8 (ig.v[VelRange]), hi8 (pg.v[VelRange]));
                if (rg.keyLo > rg.keyHi || rg.velLo > rg.velHi) continue;
                auto addr = [] (juce::uint32 base, int fine, int coarse) { return (juce::int64) base + fine + 32768LL * coarse; };
                const auto nsamp = (juce::int64) bank->samples.size();
                auto clampAddr = [&] (juce::int64 a) { return (juce::uint32) juce::jlimit<juce::int64> (0, nsamp, a); };
                rg.start = clampAddr (addr (sm.start, ig.v[StartOffset], ig.v[StartCoarse]));
                rg.end = clampAddr (addr (sm.end, ig.v[EndOffset], ig.v[EndCoarse]));
                rg.loopStart = clampAddr (addr (sm.loopStart, ig.v[StartLoopOffset], ig.v[StartLoopCoarse]));
                rg.loopEnd = clampAddr (addr (sm.loopEnd, ig.v[EndLoopOffset], ig.v[EndLoopCoarse]));
                if (rg.end <= rg.start + 4) continue;
                rg.sampleRate = sm.rate > 0 ? (double) sm.rate : 44100.0;
                rg.rootKey = ig.v[RootKey] >= 0 ? ig.v[RootKey] : (sm.pitch <= 127 ? sm.pitch : 60);
                rg.tuneCents = total (CoarseTune) * 100.0 + total (FineTune) + sm.correction;
                rg.scaleTuning = total (ScaleTuning);
                rg.loopMode = ig.v[SampleModes] & 3;
                if (rg.loopMode == 2) rg.loopMode = 0;
                if (rg.loopEnd <= rg.loopStart + 2 || rg.loopStart < rg.start || rg.loopEnd > rg.end) rg.loopMode = 0;
                rg.attenuationDb = (float) juce::jlimit (0, 1440, total (Attenuation)) * 0.1f * 0.4f;   // EMU factor, as FluidSynth
                rg.pan = juce::jlimit (-500, 500, total (Pan)) / 500.0f;
                rg.delay = total (DelayVol) <= -12000 ? 0.0f : seconds (total (DelayVol));
                rg.attack = total (AttackVol) <= -12000 ? 0.001f : std::max (0.001f, seconds (total (AttackVol)));
                rg.holdTc = (float) total (HoldVol);
                rg.decayTc = (float) total (DecayVol);
                rg.holdKeyTc = (float) total (KeyToHold);
                rg.decayKeyTc = (float) total (KeyToDecay);
                rg.sustainDb = juce::jlimit (0, 1440, total (SustainVol)) * 0.1f;
                rg.release = std::max (0.012f, seconds (total (ReleaseVol)));
                rg.filterCents = (float) juce::jlimit (1500, 13500, total (FilterFc));
                rg.filterQDb = juce::jlimit (0, 960, total (FilterQ)) * 0.1f;
                rg.exclusiveClass = ig.v[ExclusiveClass];
                preset.regions.push_back (rg);
            }
        }
        if (! preset.regions.empty()) bank->presets.push_back (std::move (preset));
    }
    if (bank->presets.empty()) { error = pt ("nenhum instrumento utilizável no SoundFont"); return nullptr; }
    std::sort (bank->presets.begin(), bank->presets.end(),
               [] (const BankPreset& a, const BankPreset& b) { return a.bank != b.bank ? a.bank < b.bank : a.program < b.program; });
    if (bank->name.isEmpty()) bank->name = f.getFileNameWithoutExtension();
    return bank;
}

std::shared_ptr<const SoundBank> SoundBank::loadShared (const juce::File& f, juce::String& error,
                                                        const std::function<bool()>& shouldCancel)
{
    static std::mutex lock;
    static std::map<juce::String, std::weak_ptr<const SoundBank>> cache;
    const auto key = f.getFullPathName() + "|" + juce::String (f.getLastModificationTime().toMilliseconds());
    {
        std::lock_guard<std::mutex> g (lock);
        if (auto existing = cache[key].lock()) return existing;
    }
    auto loaded = load (f, error, shouldCancel);
    if (loaded != nullptr)
    {
        std::lock_guard<std::mutex> g (lock);
        cache[key] = loaded;
    }
    return loaded;
}

const BankPreset* SoundBank::find (int bankNumber, int program) const
{
    for (const auto& p : presets)
        if (p.bank == bankNumber && p.program == program) return &p;
    return nullptr;
}

// ============================================================================ catalogue
namespace instruments
{
juce::String gmName (int program)
{
    static const char* n[128] = {
        "Piano de cauda", "Piano brilhante", "Piano elétrico de cauda", "Piano de bar (honky-tonk)", "Piano elétrico (Rhodes)",
        "Piano elétrico 2", "Cravo", "Clavinete", "Celesta", "Glockenspiel", "Caixinha de música", "Vibrafone", "Marimba",
        "Xilofone", "Sinos tubulares", "Saltério", "Órgão drawbar", "Órgão percussivo", "Órgão de rock", "Órgão de igreja",
        "Órgão de palheta", "Acordeão", "Gaita de boca", "Bandoneon", "Violão de nylon", "Violão de aço", "Guitarra jazz",
        "Guitarra limpa", "Guitarra abafada", "Guitarra overdrive", "Guitarra distorcida", "Harmônicos de guitarra",
        "Baixo acústico", "Baixo elétrico (dedo)", "Baixo elétrico (palheta)", "Baixo fretless", "Baixo slap 1", "Baixo slap 2",
        "Baixo sintético 1", "Baixo sintético 2", "Violino", "Viola", "Violoncelo", "Contrabaixo acústico", "Cordas em trêmolo",
        "Cordas em pizzicato", "Harpa", "Tímpanos", "Orquestra de cordas", "Cordas suaves", "Cordas sintéticas 1",
        "Cordas sintéticas 2", "Coral \"Aah\"", "Vozes \"Ooh\"", "Voz sintética", "Ataque de orquestra", "Trompete", "Trombone",
        "Tuba", "Trompete com surdina", "Trompa", "Naipe de metais", "Metais sintéticos 1", "Metais sintéticos 2", "Sax soprano",
        "Sax alto", "Sax tenor", "Sax barítono", "Oboé", "Corne inglês", "Fagote", "Clarinete", "Flautim", "Flauta",
        "Flauta doce", "Flauta de pã", "Garrafa soprada", "Shakuhachi", "Assobio", "Ocarina", "Lead onda quadrada",
        "Lead dente de serra", "Lead calliope", "Lead chiff", "Lead charang", "Lead voz", "Lead quintas", "Baixo + lead",
        "Pad fantasia", "Pad quente", "Pad polysynth", "Pad vozes do espaço", "Pad vidro friccionado", "Pad metálico", "Pad halo",
        "Pad varredura", "Efeito chuva de gelo", "Efeito trilha sonora", "Efeito cristal", "Efeito atmosfera", "Efeito brilho",
        "Efeito goblin", "Efeito ecos", "Efeito estrelas", "Cítara", "Banjo", "Shamisen", "Koto", "Kalimba", "Gaita de foles",
        "Rabeca", "Shehnai", "Sininho", "Agogô", "Steel drum", "Bloco de madeira", "Taiko", "Tom melódico", "Tambor sintético",
        "Prato reverso", "Ruído de traste", "Respiração", "Mar", "Pássaros", "Telefone", "Helicóptero", "Aplausos", "Tiro" };
    return program >= 0 && program < 128 ? pt (n[program]) : juce::String ("Programa ") + juce::String (program);
}

juce::String familyName (int program)
{
    static const char* f[16] = { "Pianos", "Percussão melódica", "Órgãos e gaitas", "Violões e guitarras", "Baixos",
                                 "Cordas", "Conjuntos e vozes", "Metais", "Saxofones e palhetas", "Flautas",
                                 "Sintetizadores (lead)", "Sintetizadores (pad)", "Efeitos sintéticos", "Instrumentos do mundo",
                                 "Percussão", "Efeitos sonoros" };
    return pt (f[juce::jlimit (0, 15, program / 8)]);
}

juce::String builtinName (int c)
{
    switch (c)
    {
        case builtinSine:  return pt ("Seno suave (sintetizado)");
        case builtin808:   return pt ("Baixo 808 (sintetizado)");
        case builtinPluck: return pt ("Pluck (sintetizado)");
        default:           return {};
    }
}

std::vector<int> builtins() { return { builtin808, builtinPluck, builtinSine }; }

juce::String displayName (int c, const SoundBank* bank)
{
    if (c < 0) return builtinName (c);
    if (bank != nullptr)
        if (auto* p = bank->find (bankOf (c), programOf (c)))
            return bankOf (c) == 0 && bank->isDefaultBank() ? gmName (p->program) : p->name;
    return bankOf (c) == 0 ? gmName (programOf (c)) : juce::String ("Banco ") + juce::String (bankOf (c)) + " / " + juce::String (programOf (c));
}

std::array<int, 3> defaultsForStyle (int style)
{
    // melody, bass, chords (General MIDI programs, bank 0)
    static const std::array<int, 3> d[] = {
        { 0, 33, 48 },            // Livre: piano, baixo elétrico, cordas
        { 10, builtin808, 89 },   // Trap: caixinha de música, 808, pad quente
        { 11, 32, 4 },            // Lo-fi: vibrafone, baixo acústico, Rhodes
        { 0, 34, 90 },            // Pop: piano, baixo palheta, polysynth
        { 73, 33, 4 },            // R&B: flauta, baixo elétrico, Rhodes
        { 81, builtin808, 62 },   // Funk BR: lead serra, 808, metais sintéticos
        { 24, builtin808, 90 },   // Reggaeton: violão, 808, polysynth
        { 80, 39, 0 },            // House: lead quadrado, baixo sintético, piano
        { 98, 39, 95 },           // Ambiente: cristal, baixo sintético, pad varredura
        { 65, 32, 0 },            // Jazz: sax alto, baixo acústico, piano
        { 0, builtin808, 49 },    // Drill: piano, 808, cordas lentas
        { 26, 32, 4 },            // Boom Bap: guitarra jazz, baixo acústico, Rhodes
        { 14, builtin808, 62 },   // Phonk: sinos, 808, metais sintéticos
        { 114, 33, 27 },          // Afrobeats: steel drum, baixo elétrico, guitarra limpa
        { 21, 38, 90 },           // Piseiro: acordeão, baixo sintético, polysynth
        { 25, 33, 24 },           // Sertanejo: violão de aço, baixo elétrico, violão de nylon
        { 24, 32, 4 },            // Pagode: violão de nylon, baixo acústico, Rhodes
        { 73, 32, 24 },           // Bossa Nova: flauta, baixo acústico, violão de nylon
        { 0, 33, 16 },            // Gospel: piano, baixo elétrico, órgão
        { 81, 38, 90 },           // Synthwave: lead serra, baixo sintético, polysynth
        { 29, 34, 30 },           // Rock: guitarra overdrive, baixo palheta, guitarra distorcida
        { 114, builtin808, 90 },  // Dancehall: steel drum, 808, polysynth
        { 81, builtin808, 62 },   // Brega Funk: lead serra, 808, metais sintéticos
        { 98, 38, 95 },           // Drum & Bass: cristal, baixo sintético, pad varredura
        { 40, 32, 49 },           // Cinemático: violino, baixo acústico, cordas lentas
    };
    return d[juce::jlimit (0, (int) std::size (d) - 1, style)];
}
} // namespace instruments

// ============================================================================ sampler
Sampler::Sampler()
{
    auto d = instruments::defaultsForStyle (0);
    for (int l = 0; l < numLayers; ++l)
    {
        instrument[(size_t) l] = d[(size_t) l];
        layerGain[(size_t) l] = 1.0f;
        activity[(size_t) l] = 0.0f;
    }
}

void Sampler::prepare (double sampleRate)
{
    sr = sampleRate > 0 ? sampleRate : 44100.0;
    const int pluckCap = (int) (sr / 20.0) + 4;
    for (auto& v : voices)
    {
        v.active = false;
        v.pluck.assign ((size_t) pluckCap, 0.0f);
        v.adsr.setSampleRate (sr);
    }
    scratch.setSize (2, 4096);
}

int Sampler::activeVoices() const
{
    int n = 0;
    for (const auto& v : voices) n += v.active ? 1 : 0;
    return n;
}

Sampler::Voice& Sampler::allocate()
{
    Voice* best = nullptr;
    for (auto& v : voices)
        if (! v.active) return v;
    for (auto& v : voices)   // steal: oldest releasing voice, else the oldest one
        if (best == nullptr || (v.releasing && ! best->releasing) || (v.releasing == best->releasing && v.age < best->age)) best = &v;
    return *best;
}

void Sampler::noteOn (int layer, int note, int velocity)
{
    if (layer < 0 || layer >= numLayers) return;
    noteOff (layer, note);
    const int code = instrument[(size_t) layer].load();
    if (code < 0 || bank == nullptr)
    {
        startBuiltinVoice (layer, note, velocity, code < 0 ? code : instruments::builtinSine);
        return;
    }
    const auto* preset = bank->find (instruments::bankOf (code), instruments::programOf (code));
    if (preset == nullptr) { startBuiltinVoice (layer, note, velocity, instruments::builtinSine); return; }
    for (const auto& r : preset->regions)
        if (note >= r.keyLo && note <= r.keyHi && velocity >= r.velLo && velocity <= r.velHi)
        {
            if (r.exclusiveClass != 0)
                for (auto& v : voices)
                    if (v.active && v.layer == layer && v.region != nullptr && v.region->exclusiveClass == r.exclusiveClass)
                        v.active = false;
            startSampleVoice (layer, note, velocity, r);
        }
}

void Sampler::startSampleVoice (int layer, int note, int velocity, const SampleRegion& r)
{
    auto& v = allocate();
    v.active = true; v.releasing = false;
    v.layer = layer; v.note = note; v.age = ++counter;
    v.builtin = 0;
    v.region = &r;
    v.pos = r.start;
    const double cents = (note - r.rootKey) * r.scaleTuning + r.tuneCents;
    v.step = std::pow (2.0, cents / 1200.0) * r.sampleRate / sr;
    const float vel = juce::jlimit (1, 127, velocity) / 127.0f;
    v.velGain = vel * vel * juce::Decibels::decibelsToGain (-r.attenuationDb);
    const float angle = (r.pan + 1.0f) * juce::MathConstants<float>::pi * 0.25f;
    v.gainL = std::cos (angle) * juce::MathConstants<float>::sqrt2;
    v.gainR = std::sin (angle) * juce::MathConstants<float>::sqrt2;
    v.stage = r.delay > 0 ? 0 : 1;
    v.stageTime = 0; v.env = 0; v.envDb = 0;
    v.holdTime = r.holdTc <= -12000 ? 0.0f : seconds (r.holdTc + r.holdKeyTc * (60 - note));
    v.decayTime = r.decayTc <= -12000 ? 0.001f : std::max (0.001f, seconds (r.decayTc + r.decayKeyTc * (60 - note)));
    // default SoundFont modulator: softer notes are darker (up to -2400 cents)
    const double fcCents = r.filterCents - 2400.0 * (1.0 - vel);
    const double fc = 8.176 * std::pow (2.0, fcCents / 1200.0);
    v.filterOn = fc < std::min (18000.0, sr * 0.45);
    v.ic1 = v.ic2 = 0;
    if (v.filterOn)
    {
        const double g = std::tan (juce::MathConstants<double>::pi * juce::jlimit (20.0, sr * 0.45, fc) / sr);
        const double q = std::max (0.5, 0.7071 * std::pow (10.0, r.filterQDb / 20.0));
        const double k = 1.0 / q;
        v.a1 = (float) (1.0 / (1.0 + g * (g + k)));
        v.a2 = (float) (g * v.a1);
        v.a3 = (float) (g * v.a2);
    }
}

void Sampler::startBuiltinVoice (int layer, int note, int velocity, int code)
{
    auto& v = allocate();
    v.active = true; v.releasing = false;
    v.layer = layer; v.note = note; v.age = ++counter;
    v.region = nullptr;
    v.builtin = code;
    v.freq = juce::MidiMessage::getMidiNoteInHertz (note);
    v.phase = 0; v.time = 0;
    v.filterOn = false;
    const float vel = juce::jlimit (1, 127, velocity) / 127.0f;
    v.velGain = vel;
    v.gainL = v.gainR = 1.0f;
    v.adsr.setSampleRate (sr);
    v.adsr.reset();
    if (code == instruments::builtin808)
    {
        v.adsr.setParameters ({ 0.002f, 1.6f, 0.25f, 0.14f });
        v.velGain = 0.55f * vel;
    }
    else if (code == instruments::builtinPluck)
    {
        v.adsr.setParameters ({ 0.001f, 0.1f, 1.0f, 0.08f });
        v.pluckLen = juce::jlimit (2, (int) v.pluck.size() - 1, (int) std::lround (sr / v.freq));
        v.pluckPos = 0;
        v.pluckDamp = 0.9965f;
        juce::Random rnd ((juce::int64) note * 7919 + (juce::int64) counter);
        float prev = 0;
        for (int i = 0; i < v.pluckLen; ++i)   // low-passed noise burst
        {
            float x = rnd.nextFloat() * 2.0f - 1.0f;
            prev = prev + 0.55f * (x - prev);
            v.pluck[(size_t) i] = prev;
        }
        v.velGain = 0.5f * vel;
    }
    else
    {
        v.builtin = instruments::builtinSine;
        v.adsr.setParameters ({ 0.005f, 0.25f, 0.55f, 0.18f });
        v.velGain = 0.32f * vel;
    }
    v.adsr.noteOn();
}

void Sampler::noteOff (int layer, int note)
{
    for (auto& v : voices)
        if (v.active && ! v.releasing && v.layer == layer && v.note == note)
        {
            v.releasing = true;
            if (v.builtin != 0) v.adsr.noteOff();
            else { v.stage = 5; v.stageTime = 0; }
        }
}

void Sampler::allNotesOff (bool immediately)
{
    for (auto& v : voices)
    {
        if (! v.active) continue;
        if (immediately) { v.active = false; continue; }
        v.releasing = true;
        if (v.builtin != 0) v.adsr.noteOff();
        else { v.stage = 5; v.stageTime = 0; }
    }
}

// Envelope value after dt seconds (advances the state). Attack is linear in amplitude,
// decay and release are linear in dB (as in the SoundFont specification).
float Sampler::envelopeAfter (Voice& v, double dt)
{
    const auto& r = *v.region;
    v.stageTime += dt;
    switch (v.stage)
    {
        case 0:
            if (v.stageTime >= r.delay) { v.stage = 1; v.stageTime = 0; }
            v.env = 0;
            break;
        case 1:
            v.env = (float) std::min (1.0, v.stageTime / r.attack);
            v.envDb = 0;
            if (v.stageTime >= r.attack) { v.stage = 2; v.stageTime = 0; v.env = 1; }
            break;
        case 2:
            v.env = 1; v.envDb = 0;
            if (v.stageTime >= v.holdTime) { v.stage = 3; v.stageTime = 0; }
            break;
        case 3:
            v.envDb = (float) (-100.0 * v.stageTime / v.decayTime);
            if (v.envDb <= -r.sustainDb) { v.envDb = -r.sustainDb; v.stage = 4; }
            v.env = juce::Decibels::decibelsToGain (v.envDb, -100.0f);
            break;
        case 4:
            v.env = juce::Decibels::decibelsToGain (v.envDb, -100.0f);
            break;
        default:
        {
            // release from wherever the envelope was (also from inside the attack)
            const float startDb = v.env > 0 ? juce::Decibels::gainToDecibels (v.env, -100.0f) : -100.0f;
            const float db = startDb - (float) (100.0 * dt / r.release);
            v.env = juce::Decibels::decibelsToGain (db, -100.0f);
            if (db <= -90.0f) v.active = false;
            break;
        }
    }
    if (v.stage >= 3 && v.stage <= 4 && r.sustainDb >= 96.0f && v.envDb <= -90.0f) v.active = false;
    return v.env;
}

float Sampler::sampleAt (const juce::int16* data, size_t total, const Voice& v, juce::int64 i)
{
    const auto& r = *v.region;
    const bool looping = r.loopMode == 1 || (r.loopMode == 3 && ! v.releasing);
    if (looping && i >= (juce::int64) r.loopEnd) i -= (juce::int64) (r.loopEnd - r.loopStart);
    if (i < (juce::int64) r.start || i >= (juce::int64) r.end || i >= (juce::int64) total) return 0.0f;
    return data[i] * (1.0f / 32768.0f);
}

void Sampler::renderVoice (Voice& v, float* left, float* right, int num, float layerLevel)
{
    if (v.builtin != 0)
    {
        const double twoPi = juce::MathConstants<double>::twoPi;
        for (int i = 0; i < num && v.active; ++i)
        {
            float x = 0;
            if (v.builtin == instruments::builtin808)
            {
                // pitch drops from an octave above to the note in ~40 ms, soft saturation
                double f = v.freq * (1.0 + 1.0 * std::exp (-v.time / 0.035));
                v.phase += twoPi * f / sr;
                x = (float) std::tanh (2.2 * std::sin (v.phase)) * 0.8f;
            }
            else if (v.builtin == instruments::builtinPluck)
            {
                int p0 = v.pluckPos, p1 = (v.pluckPos + 1) % v.pluckLen;
                x = v.pluck[(size_t) p0];
                v.pluck[(size_t) p0] = (v.pluck[(size_t) p0] + v.pluck[(size_t) p1]) * 0.5f * v.pluckDamp;
                v.pluckPos = p1;
                x *= 1.6f;
            }
            else
            {
                x = (float) (std::sin (v.phase) + 0.18 * std::sin (2.0 * v.phase));
                v.phase += twoPi * v.freq / sr;
            }
            if (v.phase > twoPi * 1000.0) v.phase = std::fmod (v.phase, twoPi);
            v.time += 1.0 / sr;
            x *= v.adsr.getNextSample() * v.velGain * layerLevel;
            left[i] += x; right[i] += x;
            if (! v.adsr.isActive()) v.active = false;
        }
        return;
    }

    if (bank == nullptr) { v.active = false; return; }
    const auto* data = bank->data();
    const size_t total = bank->numSamples();
    const auto& r = *v.region;
    constexpr int chunk = 16;
    for (int c0 = 0; c0 < num && v.active; c0 += chunk)
    {
        const int n = std::min (chunk, num - c0);
        const float e0 = v.env;
        const float e1 = envelopeAfter (v, n / sr);
        const float g = v.velGain * layerLevel;
        for (int i = 0; i < n; ++i)
        {
            const auto idx = (juce::int64) v.pos;
            const float t = (float) (v.pos - (double) idx);
            const float xm1 = sampleAt (data, total, v, idx - 1), x0 = sampleAt (data, total, v, idx);
            const float x1 = sampleAt (data, total, v, idx + 1), x2 = sampleAt (data, total, v, idx + 2);
            // 4-point Hermite interpolation
            const float c1 = 0.5f * (x1 - xm1);
            const float c2 = xm1 - 2.5f * x0 + 2.0f * x1 - 0.5f * x2;
            const float c3 = 0.5f * (x2 - xm1) + 1.5f * (x0 - x1);
            float x = ((c3 * t + c2) * t + c1) * t + x0;
            if (v.filterOn)
            {
                const float v3 = x - v.ic2;
                const float v1 = v.a1 * v.ic1 + v.a2 * v3;
                const float v2 = v.ic2 + v.a2 * v.ic1 + v.a3 * v3;
                v.ic1 = 2.0f * v1 - v.ic1;
                v.ic2 = 2.0f * v2 - v.ic2;
                x = v2;
            }
            const float env = e0 + (e1 - e0) * (float) (i + 1) / (float) n;
            x *= env * g;
            left[c0 + i] += x * v.gainL;
            right[c0 + i] += x * v.gainR;

            v.pos += v.step;
            const bool looping = r.loopMode == 1 || (r.loopMode == 3 && ! v.releasing);
            if (looping)
            {
                if (v.pos >= (double) r.loopEnd) v.pos -= (double) (r.loopEnd - r.loopStart);
            }
            else if (v.pos >= (double) r.end)
            {
                v.active = false;
                break;
            }
        }
    }
}

void Sampler::render (juce::AudioBuffer<float>& buffer, int start, int num)
{
    if (num <= 0) return;
    auto* left = buffer.getWritePointer (0, start);
    auto* right = buffer.getNumChannels() > 1 ? buffer.getWritePointer (1, start) : nullptr;
    // render into scratch per layer so the UI can show activity per layer
    for (int l = 0; l < numLayers; ++l)
    {
        bool any = false;
        for (auto& v : voices) any = any || (v.active && v.layer == l);
        if (! any) continue;
        const float level = layerGain[(size_t) l].load();
        for (int done = 0; done < num;)
        {
            const int n = std::min (num - done, scratch.getNumSamples());
            scratch.clear (0, n);
            auto* sl = scratch.getWritePointer (0);
            auto* sr_ = scratch.getWritePointer (1);
            for (auto& v : voices)
                if (v.active && v.layer == l) renderVoice (v, sl, sr_, n, level);
            float peak = 0;
            for (int i = 0; i < n; ++i)
            {
                peak = std::max (peak, std::abs (sl[i]) + std::abs (sr_[i]));
                if (right != nullptr) { left[done + i] += sl[i]; right[done + i] += sr_[i]; }
                else left[done + i] += 0.5f * (sl[i] + sr_[i]);
            }
            activity[(size_t) l] = std::max (activity[(size_t) l].load(), peak * 0.5f);
            done += n;
        }
    }
}

void Sampler::renderMidi (juce::AudioBuffer<float>& buffer, const juce::MidiBuffer& midi)
{
    if (auto pb = std::atomic_load (&pendingBank); pb != bank)
    {
        for (auto& v : voices) if (v.region != nullptr) v.active = false;   // regions belong to the old bank
        bank = pb;   // the processor keeps every bank alive, so nothing is freed here
    }
    int pos = 0;
    const int num = buffer.getNumSamples();
    for (const auto meta : midi)
    {
        const int at = juce::jlimit (0, num, meta.samplePosition);
        render (buffer, pos, at - pos);
        pos = at;
        const auto m = meta.getMessage();
        const int layer = m.getChannel() - 1;
        if (m.isNoteOn()) noteOn (layer, m.getNoteNumber(), m.getVelocity());
        else if (m.isNoteOff()) noteOff (layer, m.getNoteNumber());
        else if (m.isAllNotesOff() || m.isAllSoundOff()) allNotesOff (m.isAllSoundOff());
    }
    render (buffer, pos, num - pos);
}

} // namespace mfplug
