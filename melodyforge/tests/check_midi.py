"""Checks that an exported .mid contains exactly the notes of a pattern JSON.
Usage: python3 check_midi.py file.mid pattern.json   (needs: pip install mido)"""
import json, sys
import mido

mid = mido.MidiFile(sys.argv[1])
pattern = json.load(open(sys.argv[2]))
assert mid.type == 1 and mid.ticks_per_beat == 480, (mid.type, mid.ticks_per_beat)
tempo = next(m.tempo for m in mid.tracks[0] if m.type == 'set_tempo')
assert round(mido.tempo2bpm(tempo)) == pattern['bpm'], (mido.tempo2bpm(tempo), pattern['bpm'])
ok = True
for track in mid.tracks[1:]:
    layer = track.name.lower()
    now, open_notes, notes = 0, {}, []
    for msg in track:
        now += msg.time
        if msg.type == 'note_on' and msg.velocity > 0:
            open_notes[msg.note] = (now, msg.velocity)
        elif msg.type in ('note_off', 'note_on'):
            start, vel = open_notes.pop(msg.note)
            notes.append((start, msg.note, now - start, vel))
    expected = sorted((n['start'], n['pitch'], n['length'], n['velocity']) for n in pattern['tracks'][layer])
    same = sorted(notes) == expected
    ok &= same
    print(f"{layer:7s} {len(notes):3d} notes  {'identical to pattern' if same else 'MISMATCH'}")
print('bpm', pattern['bpm'], '| tempo meta', round(mido.tempo2bpm(tempo), 2), '| key', next(m.key for m in mid.tracks[0] if m.type == 'key_signature'))
sys.exit(0 if ok else 1)
