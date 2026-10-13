#!/usr/bin/env python3
"""Builds MelodyForge-Timbres.sf2: a subset of the Fluid (R3) General MIDI SoundFont
(MIT licence, Frank Wen) with the instruments the plugin offers.

    python3 tools/make_soundbank.py [/usr/share/sounds/sf2/FluidR3_GM.sf2] [out.sf2]

On Debian/Ubuntu the source comes from `apt install fluid-soundfont-gm`.
Programs keep their General MIDI numbers, so the plugin's catalogue (Sampler.h)
also works with any other GM SoundFont the user loads.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sf2lib import SF2, write_subset  # noqa: E402

PROGRAMS = [
    0, 4, 6, 7, 8, 16, 19, 22,                 # teclas
    9, 10, 11, 12, 14, 108, 114,               # percussão melódica
    24, 25, 26, 27, 46, 104, 105,              # cordas dedilhadas
    32, 33, 34, 36, 38, 39, 87,                # baixos
    40, 48, 49, 50,                            # cordas
    52, 53,                                    # vozes
    56, 57, 61, 62, 65, 68, 71, 73, 75, 79,    # metais e sopros
    80, 81, 82, 84, 88, 89, 90, 91, 92, 94, 95, 98, 99,   # sintetizadores
]


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else '/usr/share/sounds/sf2/FluidR3_GM.sf2'
    here = os.path.dirname(os.path.abspath(__file__))
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, '..', 'plugin', 'Resources', 'MelodyForge-Timbres.sf2')
    sf = SF2(src)
    picks = []
    for prog in PROGRAMS:
        pi = sf.preset_index(0, prog)
        picks.append((0, prog, 0, prog, sf.name(sf.presets[pi][0])))
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    nbytes = write_subset(sf, picks, out, 'MelodyForge ISLAND27 Timbres')
    print(f'{out}: {len(picks)} instruments, {nbytes / 1e6:.1f} MB of samples')


if __name__ == '__main__':
    main()
