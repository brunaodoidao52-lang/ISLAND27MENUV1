// Unit tests for the MelodyForge core (no dependencies). Run: node tests/core.test.js
'use strict';
const C = require('../core/melodyforge-core.js');

let failures = 0, passed = 0;
function check(ok, what, extra) {
    if (ok) { passed++; return; }
    failures++;
    console.log('FAIL ' + what + (extra !== undefined ? ' — ' + extra : ''));
}
const mod12 = x => ((x % 12) + 12) % 12;
const allNotes = p => C.TRACKS.flatMap(t => p.tracks[t]);

// ------------------------------------------------------------ RNG / seeds
{
    const a = C.createRng(123), b = C.createRng(123);
    const sa = Array.from({ length: 100 }, () => a.next()), sb = Array.from({ length: 100 }, () => b.next());
    check(JSON.stringify(sa) === JSON.stringify(sb), 'same seed → same random stream');
    check(sa.every(x => Number.isInteger(x) && x >= 0 && x < 2 ** 32), 'rng yields uint32');
    const r = C.createRng(9);
    check(Array.from({ length: 1000 }, () => r.int(7)).every(x => x >= 0 && x < 7), 'rng.int stays in range');
}

// ------------------------------------------------------------ determinism
{
    const s = C.defaultSettings();
    const pop1 = C.createPopulation(s, 777), pop2 = C.createPopulation(s, 777), pop3 = C.createPopulation(s, 778);
    check(JSON.stringify(pop1) === JSON.stringify(pop2), 'same session seed → same population');
    check(JSON.stringify(pop1) !== JSON.stringify(pop3), 'different session seed → different population');
    const g = pop1[0].genome;
    check(JSON.stringify(C.render(g, s)) === JSON.stringify(C.render(C.cloneGenome(g), s)), 'same genome → same pattern');
    let e1 = pop1, e2 = pop2;
    for (let i = 0; i < 5; i++) { e1 = C.evolve(e1, s, 50 + i); e2 = C.evolve(e2, s, 50 + i); }
    check(JSON.stringify(e1) === JSON.stringify(e2), 'evolution is reproducible with the same seeds');
}

// ------------------------------------------------------------ harmony
{
    const names = (key, scale, prog, complexity = 0) => {
        const g = C.randomGenome(C.createRng(1), { key, scale, progression: prog, locks: { key: true, scale: true, progression: true } });
        g.chordComplexity = complexity;
        return C.render(g, {}).chords.map(c => c.name).join(' ');
    };
    check(names(0, 0, 0) === 'C F G C', 'C major I-IV-V-I', names(0, 0, 0));
    check(names(9, 1, 3) === 'Am F Dm Em', 'A minor i-VI-iv-v', names(9, 1, 3));
    check(names(7, 0, 1) === 'G D Em C', 'G major I-V-vi-IV', names(7, 0, 1));
    check(names(2, 4, 6) === 'Dm Gm A Dm', 'D harmonic minor i-iv-V-i (major dominant)', names(2, 4, 6));
    // every chord tone belongs to the harmony scale, for every key/scale/progression
    let diatonic = true;
    for (let key = 0; key < 12; key++) for (let sc = 0; sc < C.SCALES.length; sc++) for (let pr = 0; pr < C.PROGRESSIONS.length; pr++) {
        const g = C.randomGenome(C.createRng(key * 100 + sc * 10 + pr), { key, scale: sc, progression: pr, locks: { key: true, scale: true, progression: true } });
        g.chordComplexity = 1;
        const harm = C.SCALES[sc].harmony.map(x => mod12(key + x));
        for (const ch of C.render(g, {}).chords) if (!ch.pcs.every(pc => harm.includes(pc))) diatonic = false;
    }
    check(diatonic, 'all chords (triads and sevenths) are diatonic for 12 keys × 8 scales × 8 progressions');
    const g7 = C.randomGenome(C.createRng(4), { key: 0, scale: 0, progression: 4, locks: { key: true, scale: true, progression: true } });
    g7.chordComplexity = 1;
    const sev = C.render(g7, {}).chords.map(c => c.name);
    check(sev.some(n => /7/.test(n)), 'high chord complexity produces seventh chords', sev.join(' '));
}

// ------------------------------------------------------------ melody / bass / limits
{
    let inKey = true, inRange = true, bassRange = true, perBar = true, lengthsOk = true, bounded = true;
    const s = C.normalizeSettings({ maxNotesPerBar: 5, melodyLow: 62, melodyHigh: 79, bars: 8 });
    const pop = C.createPopulation(s, 31337);
    for (let seed = 0; seed < 300; seed++) {
        const g = C.randomGenome(C.createRng(seed), s);
        const p = C.render(g, s);
        const scale = C.SCALES[g.scale].steps.map(x => mod12(g.key + x));
        for (const n of p.tracks.melody) {
            if (!scale.includes(mod12(n.pitch))) inKey = false;
            if (n.pitch < 62 || n.pitch > 79) inRange = false;
        }
        for (const n of p.tracks.bass) if (n.pitch < 28 || n.pitch > 55) bassRange = false;
        const counts = new Array(8).fill(0);
        for (const n of p.tracks.melody) counts[Math.floor(n.start / C.BAR)]++;
        if (counts.some(c => c > 5)) perBar = false;
        for (const n of allNotes(p)) {
            if (!(n.length > 0) || !Number.isInteger(n.start) || !Number.isInteger(n.length)) lengthsOk = false;
            if (n.start + n.length > 8 * C.BAR || n.velocity < 1 || n.velocity > 127) bounded = false;
        }
    }
    check(inKey, 'melody notes always belong to the scale');
    check(inRange, 'melody respects the configured pitch range');
    check(bassRange, 'bass stays in the bass register');
    check(perBar, 'melody respects the max-notes-per-bar limit');
    check(lengthsOk, 'notes have integer ticks and positive lengths');
    check(bounded, 'notes end inside the pattern and velocities are 1..127');
    check(pop.length === s.populationSize, 'population has the configured size');
    check(C.normalizeSettings({ populationSize: 999 }).populationSize === 32 && C.normalizeSettings({ populationSize: 1 }).populationSize === 4,
          'population size is limited to 4..32');
    check(C.normalizeSettings({ bars: 20 }).bars === 8 && C.normalizeSettings({ maxNotesPerBar: 99 }).maxNotesPerBar === 16,
          'bars and notes-per-bar are limited');
}

// ------------------------------------------------------------ genetic algorithm
{
    const s = C.defaultSettings();
    let gain = 0, runs = 20;
    for (let r = 0; r < runs; r++) {
        let pop = C.createPopulation(s, 1000 + r);
        const avg0 = pop.reduce((a, x) => a + x.fitness, 0) / pop.length;
        for (let i = 0; i < 20; i++) pop = C.evolve(pop, s, r * 100 + i);
        gain += pop.reduce((a, x) => a + x.fitness, 0) / pop.length - avg0;
        if (pop.some(x => !Number.isInteger(x.genome.bpm) || x.genome.bpm < 60 || x.genome.bpm > 180 ||
                          !Number.isInteger(x.genome.key) || x.genome.key < 0 || x.genome.key > 11)) check(false, 'genes stay valid');
        check(C.diversity(pop) > 0, 'immigrants keep diversity above zero');
    }
    check(gain / runs > 0.02, 'average fitness rises over 20 generations', (gain / runs).toFixed(3));

    const locked = C.normalizeSettings({ key: 5, scale: 1, progression: 2, bpm: 90, locks: { key: true, scale: true, progression: true, bpm: true } });
    let pop = C.createPopulation(locked, 5);
    for (let i = 0; i < 10; i++) pop = C.evolve(pop, locked, i);
    check(pop.every(x => x.genome.key === 5 && x.genome.scale === 1 && x.genome.progression === 2 && x.genome.bpm === 90),
          'locked key/scale/progression/bpm never change');

    // the fitness actually listens: a melody full of leaps scores lower than a smooth one
    const g = C.randomGenome(C.createRng(8), s);
    const smooth = C.render(g, s);
    const jumpy = C.clonePattern(smooth);
    jumpy.tracks.melody.forEach((n, i) => { n.pitch += (i % 2) * 12; });
    check(C.evaluate(jumpy, g, s).melodic < C.evaluate(smooth, g, s).melodic, 'fitness penalises octave leaps');
    const out = C.clonePattern(smooth);
    out.tracks.melody.forEach(n => { n.pitch += 1; });
    check(C.evaluate(out, g, s).harmonic < C.evaluate(smooth, g, s).harmonic, 'fitness penalises out-of-key notes');
    const liked = C.cloneGenome(g); liked.userScore = 1;
    check(C.scoreGenome(liked, s).fitness > C.scoreGenome(g, s).fitness, 'user likes raise fitness');
}

// ------------------------------------------------------------ editing
{
    const s = C.defaultSettings();
    const g = C.randomGenome(C.createRng(77), s);
    const p = C.render(g, s);
    const added = C.addNote(p, 'melody', { pitch: 72, start: 240, length: 120, velocity: 100 });
    check(added.tracks.melody.length === p.tracks.melody.length + 1 && added.edited, 'addNote adds one note');
    check(p.tracks.melody.length === C.render(g, s).tracks.melody.length, 'edits never mutate the original pattern');
    const removed = C.removeNoteAt(added, 'melody', 300, 72);
    check(removed.tracks.melody.length === p.tracks.melody.length, 'removeNoteAt removes the note under the cursor');
    const up = C.transposeTrack(p, 'bass', 12);
    check(up.tracks.bass.every((n, i) => n.pitch === p.tracks.bass[i].pitch + 12), 'transposeTrack shifts a whole layer');

    const rerolled = C.rerollLayer(g, 'melody', 99);
    const pr = C.render(rerolled, s);
    check(JSON.stringify(pr.tracks.bass) === JSON.stringify(p.tracks.bass) &&
          JSON.stringify(pr.tracks.chords) === JSON.stringify(p.tracks.chords) &&
          JSON.stringify(pr.tracks.melody) !== JSON.stringify(p.tracks.melody), 're-rolling the melody keeps bass and chords');

    const g2 = C.setChordOverride(g, 1, 5);
    const p2 = C.render(g2, s);
    check(p2.chords[1].degree === 5 && p2.chords[0].degree === p.chords[0].degree, 'chord override changes only that bar');
    const scale = C.SCALES[g.scale].harmony.map(x => mod12(g.key + x));
    check(p2.chords[1].root === scale[5], 'overridden chord is built on the chosen degree');
}

// ------------------------------------------------------------ MIDI writer
function parseMidi(bytes) {
    let pos = 0;
    const u32 = () => (bytes[pos++] << 24 | bytes[pos++] << 16 | bytes[pos++] << 8 | bytes[pos++]) >>> 0;
    const u16 = () => bytes[pos++] << 8 | bytes[pos++];
    const str = n => String.fromCharCode(...bytes.slice(pos, pos += n));
    const vlq = () => { let v = 0, b; do { b = bytes[pos++]; v = v * 128 + (b & 127); } while (b & 128); return v; };
    if (str(4) !== 'MThd') throw new Error('no header');
    u32();
    const format = u16(), ntracks = u16(), division = u16();
    const tracks = [];
    for (let t = 0; t < ntracks; t++) {
        if (str(4) !== 'MTrk') throw new Error('no track');
        const end = u32() + pos;
        let tick = 0, name = '', tempo = 0;
        const open = {}, notes = [];
        while (pos < end) {
            tick += vlq();
            const st = bytes[pos++];
            if (st === 0xFF) {
                const type = bytes[pos++], len = vlq(), data = bytes.slice(pos, pos + len);
                pos += len;
                if (type === 3) name = String.fromCharCode(...data);
                if (type === 0x51) tempo = data[0] << 16 | data[1] << 8 | data[2];
            } else if ((st & 0xF0) === 0x90) {
                const p = bytes[pos++], v = bytes[pos++];
                open[p] = { start: tick, velocity: v };
            } else if ((st & 0xF0) === 0x80) {
                const p = bytes[pos++]; pos++;
                notes.push({ pitch: p, start: open[p].start, length: tick - open[p].start, velocity: open[p].velocity });
                delete open[p];
            } else throw new Error('unexpected status ' + st);
        }
        tracks.push({ name, tempo, notes });
    }
    return { format, division, tracks };
}
{
    const s = C.defaultSettings();
    let identical = true;
    for (let seed = 0; seed < 50; seed++) {
        const g = C.randomGenome(C.createRng(seed), s);
        const p = C.render(g, s);
        const m = parseMidi(C.toMidi(p));
        if (m.format !== 1 || m.division !== 480 || m.tracks.length !== 4) identical = false;
        if (Math.round(60000000 / m.tracks[0].tempo) !== p.bpm) identical = false;
        ['melody', 'bass', 'chords'].forEach((t, i) => {
            const key = n => [n.start, n.pitch, n.length, n.velocity].join(',');
            const a = m.tracks[i + 1].notes.map(key).sort(), b = p.tracks[t].map(key).sort();
            if (JSON.stringify(a) !== JSON.stringify(b)) identical = false;
        });
    }
    check(identical, 'MIDI files contain exactly the pattern notes (50 random ideas)');
    const single = parseMidi(C.toMidi(C.render(C.randomGenome(C.createRng(1), s), s), { tracks: ['bass'] }));
    check(single.tracks.length === 2 && single.tracks[1].name === 'Bass', 'single-layer export');
}

console.log(`${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
