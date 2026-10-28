#!/usr/bin/env python3
"""Builds MelodyForge-Timbres.sf2 (Melody Generator's default bank): the melodic part of the Fluid (R3) General MIDI SoundFont
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

# 100 melodic General MIDI programs (pianos, organs, accordions, guitars, basses, strings,
# choirs, brass, reeds, pipes, synth leads/pads/FX and ethnic instruments). Left out: the
# sound effects and drum-like programs (115-127), the contrabass (silent above its low range)
# and the instruments whose samples would push the bank past ~90 MB (so the Windows zip
# stays under GitHub's 100 MB file limit).
LEFT_OUT = {5, 17, 18, 23, 41, 42, 43, 45, 60, 64, 66, 67, 69, 102, 109}
PROGRAMS = [p for p in range(115) if p not in LEFT_OUT]


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
