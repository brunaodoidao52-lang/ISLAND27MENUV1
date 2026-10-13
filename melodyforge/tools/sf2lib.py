"""Minimal SoundFont 2 reader/writer used by make_soundbank.py."""
import struct

GEN_INSTRUMENT = 41
GEN_SAMPLE_ID = 53
GEN_KEY_RANGE = 43
GEN_VEL_RANGE = 44


def _chunks(data, off, end):
    while off + 8 <= end:
        cid, size = struct.unpack_from('<4sI', data, off)
        yield cid.decode('latin1'), off + 8, size
        off += 8 + size + (size & 1)


class SF2:
    def __init__(self, path):
        data = open(path, 'rb').read()
        assert data[:4] == b'RIFF' and data[8:12] == b'sfbk'
        self.info = []
        for cid, off, size in _chunks(data, 12, len(data)):
            assert cid == 'LIST'
            kind = data[off:off + 4].decode()
            for sid, soff, ssize in _chunks(data, off + 4, off + size):
                body = data[soff:soff + ssize]
                if kind == 'INFO':
                    self.info.append((sid, body))
                elif kind == 'sdta' and sid == 'smpl':
                    self.smpl = body
                elif kind == 'pdta':
                    setattr(self, sid, body)
        self.presets = self._recs(self.phdr, '<20sHHHIII', 38)
        self.pbags = self._recs(self.pbag, '<HH', 4)
        self.pgens = self._recs(self.pgen, '<HH', 4)
        self.insts = self._recs(self.inst, '<20sH', 22)
        self.ibags = self._recs(self.ibag, '<HH', 4)
        self.igens = self._recs(self.igen, '<HH', 4)
        self.samples = self._recs(self.shdr, '<20sIIIIIBbHH', 46)
        self.pmods = self.pmod
        self.imods = self.imod

    @staticmethod
    def _recs(body, fmt, size):
        return [struct.unpack_from(fmt, body, i) for i in range(0, len(body), size)]

    @staticmethod
    def name(raw):
        return raw.split(b'\0')[0].decode('latin1')

    def preset_index(self, bank, program):
        for i, p in enumerate(self.presets[:-1]):
            if p[1] == program and p[2] == bank:
                return i
        return None

    def zones(self, bags, gens, first, last):
        out = []
        for b in range(first, last):
            g0, g1 = bags[b][0], bags[b + 1][0]
            out.append([(gens[g][0], gens[g][1]) for g in range(g0, g1)])
        return out

    def preset_zones(self, pi):
        return self.zones(self.pbags, self.pgens, self.presets[pi][3], self.presets[pi + 1][3])

    def inst_zones(self, ii):
        return self.zones(self.ibags, self.igens, self.insts[ii][1], self.insts[ii + 1][1])

    def instruments_of(self, pi):
        return sorted({v for z in self.preset_zones(pi) for (o, v) in z if o == GEN_INSTRUMENT})

    def samples_of_inst(self, ii):
        out = set()
        for z in self.inst_zones(ii):
            for o, v in z:
                if o == GEN_SAMPLE_ID:
                    out.add(v)
                    link = self.samples[v][8]
                    stype = self.samples[v][9]
                    if stype in (2, 4) and link < len(self.samples) - 1:
                        out.add(link)
        return out


def write_subset(src, picks, path, info_name):
    """picks: list of (bank, program, new_bank, new_program, new_name)."""
    inst_map, sample_map = {}, {}
    presets_out = []
    for bank, prog, nb, np_, nname in picks:
        pi = src.preset_index(bank, prog)
        assert pi is not None, (bank, prog)
        presets_out.append((pi, nb, np_, nname))
        for ii in src.instruments_of(pi):
            if ii not in inst_map:
                inst_map[ii] = len(inst_map)
                for s in sorted(src.samples_of_inst(ii)):
                    if s not in sample_map:
                        sample_map[s] = len(sample_map)

    # samples: copy data with 46 zero points after each, as the spec asks
    smpl = bytearray()
    shdr = bytearray()
    for old, new in sorted(sample_map.items(), key=lambda kv: kv[1]):
        name, start, end, ls, le, rate, key, corr, link, stype = src.samples[old]
        base = len(smpl) // 2
        smpl += src.smpl[start * 2:end * 2] + b'\0' * 92
        nl = sample_map.get(link, 0) if stype in (2, 4) else 0
        if stype in (2, 4) and link not in sample_map:
            stype = 1
        shdr += struct.pack('<20sIIIIIBbHH', name, base, base + (end - start), base + (ls - start),
                            base + (le - start), rate, key, corr, nl, stype)
    shdr += struct.pack('<20sIIIIIBbHH', b'EOS', 0, 0, 0, 0, 0, 0, 0, 0, 0)

    def remap_gens(zone, kind):
        out = []
        for o, v in zone:
            if kind == 'i' and o == GEN_SAMPLE_ID:
                v = sample_map[v]
            if kind == 'p' and o == GEN_INSTRUMENT:
                v = inst_map[v]
            out.append((o, v))
        return out

    inst, ibag, igen = bytearray(), bytearray(), bytearray()
    for old, new in sorted(inst_map.items(), key=lambda kv: kv[1]):
        inst += struct.pack('<20sH', src.insts[old][0], len(ibag) // 4)
        for z in src.inst_zones(old):
            ibag += struct.pack('<HH', len(igen) // 4, 0)
            for o, v in remap_gens(z, 'i'):
                igen += struct.pack('<HH', o, v)
    inst += struct.pack('<20sH', b'EOI', len(ibag) // 4)
    ibag += struct.pack('<HH', len(igen) // 4, 0)
    igen += struct.pack('<HH', 0, 0)

    phdr, pbag, pgen = bytearray(), bytearray(), bytearray()
    for pi, nb, np_, nname in presets_out:
        phdr += struct.pack('<20sHHHIII', nname.encode('latin1')[:19], np_, nb, len(pbag) // 4, 0, 0, 0)
        for z in src.preset_zones(pi):
            pbag += struct.pack('<HH', len(pgen) // 4, 0)
            for o, v in remap_gens(z, 'p'):
                pgen += struct.pack('<HH', o, v)
    phdr += struct.pack('<20sHHHIII', b'EOP', 0, 0, len(pbag) // 4, 0, 0, 0)
    pbag += struct.pack('<HH', len(pgen) // 4, 0)
    pgen += struct.pack('<HH', 0, 0)
    empty_mod = b'\0' * 10   # modulators are dropped (default modulators still apply)

    def chunk(cid, body):
        body = bytes(body)
        return cid.encode() + struct.pack('<I', len(body)) + body + (b'\0' if len(body) & 1 else b'')

    def lst(kind, parts):
        body = kind.encode() + b''.join(parts)
        return chunk('LIST', body)

    def zstr(s):
        b = s.encode('latin1') + b'\0'
        return b + (b'\0' if len(b) & 1 else b'')

    info = lst('INFO', [chunk('ifil', struct.pack('<HH', 2, 1)), chunk('isng', zstr('EMU8000')),
                        chunk('INAM', zstr(info_name)),
                        chunk('ICOP', zstr('Fluid (R3) GM SoundFont by Frank Wen, MIT licence (subset)'))])
    sdta = lst('sdta', [chunk('smpl', smpl)])
    pdta = lst('pdta', [chunk('phdr', phdr), chunk('pbag', pbag), chunk('pmod', empty_mod), chunk('pgen', pgen),
                        chunk('inst', inst), chunk('ibag', ibag), chunk('imod', empty_mod), chunk('igen', igen),
                        chunk('shdr', shdr)])
    body = b'sfbk' + info + sdta + pdta
    open(path, 'wb').write(b'RIFF' + struct.pack('<I', len(body)) + body)
    return len(smpl)
