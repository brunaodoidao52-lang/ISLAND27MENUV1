/*
 * MelodyForge core — ISLAND27 edition.
 *
 * Pure, deterministic music engine: no DOM, no audio. The same genome + seeds
 * always renders the same pattern, so what you hear is exactly what you export.
 * All arithmetic is integer or IEEE double +,-,*,/ only, so the C++ port
 * (plugin/Source/MelodyCore.h) reproduces it bit for bit (see tests/golden).
 *
 * Times are in MIDI ticks (PPQ 480); a bar is 4/4 = 1920 ticks = 16 steps.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MFCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var PPQ = 480;
    var STEP = 120;            // one 16th note
    var STEPS_PER_BAR = 16;
    var BAR = STEP * STEPS_PER_BAR;

    var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    var SCALES = [
        { id: 'major',            name: 'Major',            steps: [0, 2, 4, 5, 7, 9, 11],  harmony: [0, 2, 4, 5, 7, 9, 11], minor: false, parentMajor: 0 },
        { id: 'minor',            name: 'Minor',            steps: [0, 2, 3, 5, 7, 8, 10],  harmony: [0, 2, 3, 5, 7, 8, 10], minor: true, parentMajor: 3 },
        { id: 'dorian',           name: 'Dorian',           steps: [0, 2, 3, 5, 7, 9, 10],  harmony: [0, 2, 3, 5, 7, 9, 10], minor: true, parentMajor: 10 },
        { id: 'mixolydian',       name: 'Mixolydian',       steps: [0, 2, 4, 5, 7, 9, 10],  harmony: [0, 2, 4, 5, 7, 9, 10], minor: false, parentMajor: 5 },
        { id: 'harmonic_minor',   name: 'Harmonic minor',   steps: [0, 2, 3, 5, 7, 8, 11],  harmony: [0, 2, 3, 5, 7, 8, 11], minor: true, parentMajor: 3 },
        { id: 'pentatonic_major', name: 'Pentatonic major', steps: [0, 2, 4, 7, 9],         harmony: [0, 2, 4, 5, 7, 9, 11], minor: false, parentMajor: 0 },
        { id: 'pentatonic_minor', name: 'Pentatonic minor', steps: [0, 3, 5, 7, 10],        harmony: [0, 2, 3, 5, 7, 8, 10], minor: true, parentMajor: 3 },
        { id: 'blues',            name: 'Blues',            steps: [0, 3, 5, 6, 7, 10],     harmony: [0, 2, 3, 5, 7, 8, 10], minor: true, parentMajor: 3 }
    ];

    // Progressions are scale degrees (0 = I/i ... 6 = VII/vii), not semitones.
    var PROGRESSIONS = [
        { name: 'I - IV - V - I',    degrees: [0, 3, 4, 0] },
        { name: 'I - V - vi - IV',   degrees: [0, 4, 5, 3] },
        { name: 'vi - IV - I - V',   degrees: [5, 3, 0, 4] },
        { name: 'I - vi - IV - V',   degrees: [0, 5, 3, 4] },
        { name: 'ii - V - I - I',    degrees: [1, 4, 0, 0] },
        { name: 'i - VI - III - VII', degrees: [0, 5, 2, 6] },
        { name: 'i - iv - v - i',    degrees: [0, 3, 4, 0] },
        { name: 'I - iii - IV - V',  degrees: [0, 2, 3, 4] }
    ];

    var CHORD_RHYTHMS = ['sustain', 'half', 'stabs'];
    var CONTINUOUS_GENES = ['density', 'syncopation', 'stepwise', 'range', 'contour', 'repetition',
                            'chordComplexity', 'bassMovement', 'swing', 'dynamics'];
    var TRACKS = ['melody', 'bass', 'chords'];

    // ------------------------------------------------------------------ RNG
    // mulberry32 — tiny, fast, and identical in JS (Math.imul) and C++ (uint32).
    function createRng(seed) {
        var state = seed >>> 0;
        function next() {
            state = (state + 0x6D2B79F5) >>> 0;
            var t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return (t ^ (t >>> 14)) >>> 0;
        }
        return {
            next: next,
            float: function () { return next() / 4294967296; },
            int: function (n) { return Math.floor(next() / 4294967296 * n); }
        };
    }

    // Derives an independent seed for a sub-stream (e.g. one per layer).
    function mixSeed(seed, salt) {
        var r = createRng(((seed >>> 0) ^ Math.imul(salt + 1, 0x9E3779B1)) >>> 0);
        r.next();
        return r.next();
    }

    function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
    function mod12(x) { return ((x % 12) + 12) % 12; }

    // ------------------------------------------------------------- settings
    function defaultSettings() {
        return {
            bars: 4,                 // 1..8
            populationSize: 12,      // candidates per generation (4..32)
            eliteRatio: 0.25,
            mutationRate: 0.15,
            maxNotesPerBar: 8,       // melody note limit per bar (2..16)
            melodyLow: 60,           // C4
            melodyHigh: 84,          // C6
            chordRhythm: 'sustain',
            focus: 'balanced',       // balanced | harmony | rhythm | catchy
            // fixed values used when locked, and the defaults for new genomes
            key: 0, scale: 0, progression: 0, bpm: 120,
            bpmRange: [70, 150],     // range new genomes draw their tempo from
            scalePool: null,         // scale indices new genomes may use (null = all)
            progressionPool: null,   // progression indices new genomes may use (null = all)
            locks: { key: false, scale: false, progression: false, bpm: false },
            // style targets used by the fitness function
            targets: { density: 4, stepwise: 0.7, span: 12, syncopation: 0.2, repetition: 0.6 },
            // gene bias: preset ranges new genomes are drawn from
            geneRanges: {}
        };
    }

    function validPool(pool, n) {
        var out = [];
        if (pool) for (var i = 0; i < pool.length; i++) {
            var v = Math.floor(pool[i]);
            if (v >= 0 && v < n && out.indexOf(v) < 0) out.push(v);
        }
        if (!out.length) for (var j = 0; j < n; j++) out.push(j);
        return out;
    }

    function normalizeSettings(s) {
        var d = defaultSettings();
        var out = {};
        var k;
        for (k in d) out[k] = (s && s[k] !== undefined) ? s[k] : d[k];
        out.locks = {};
        for (k in d.locks) out.locks[k] = !!(s && s.locks && s.locks[k]);
        out.targets = {};
        for (k in d.targets) out.targets[k] = (s && s.targets && s.targets[k] !== undefined) ? s.targets[k] : d.targets[k];
        out.geneRanges = (s && s.geneRanges) || {};
        out.scalePool = validPool(s && s.scalePool, SCALES.length);
        out.progressionPool = validPool(s && s.progressionPool, PROGRESSIONS.length);
        var br = (s && s.bpmRange) || d.bpmRange;
        var bLo = clamp(Math.floor(br[0]), 60, 180);
        out.bpmRange = [bLo, clamp(Math.floor(br[1]), bLo, 180)];
        out.bars = clamp(Math.floor(out.bars), 1, 8);
        out.populationSize = clamp(Math.floor(out.populationSize), 4, 32);
        out.maxNotesPerBar = clamp(Math.floor(out.maxNotesPerBar), 2, 16);
        out.melodyLow = clamp(Math.floor(out.melodyLow), 36, 96);
        out.melodyHigh = clamp(Math.floor(out.melodyHigh), out.melodyLow + 7, 108);
        out.mutationRate = clamp(out.mutationRate, 0, 1);
        out.eliteRatio = clamp(out.eliteRatio, 0, 0.9);
        out.key = mod12(Math.floor(out.key));
        out.scale = clamp(Math.floor(out.scale), 0, SCALES.length - 1);
        out.progression = clamp(Math.floor(out.progression), 0, PROGRESSIONS.length - 1);
        out.bpm = clamp(Math.floor(out.bpm), 60, 180);
        if (CHORD_RHYTHMS.indexOf(out.chordRhythm) < 0) out.chordRhythm = 'sustain';
        return out;
    }

    // ---------------------------------------------------------------- genome
    function geneFromRange(rng, settings, gene) {
        var r = settings.geneRanges[gene];
        var lo = r ? r[0] : 0, hi = r ? r[1] : 1;
        return lo + rng.float() * (hi - lo);
    }

    function randomGenome(rng, settings) {
        var s = normalizeSettings(settings);
        var g = {
            key: s.locks.key ? s.key : rng.int(12),
            scale: s.locks.scale ? s.scale : s.scalePool[rng.int(s.scalePool.length)],
            progression: s.locks.progression ? s.progression : s.progressionPool[rng.int(s.progressionPool.length)],
            bpm: s.locks.bpm ? s.bpm : s.bpmRange[0] + rng.int(s.bpmRange[1] - s.bpmRange[0] + 1),
            seeds: { melody: rng.next(), bass: rng.next(), chords: rng.next() },
            chordOverrides: [],
            userScore: 0
        };
        for (var i = 0; i < CONTINUOUS_GENES.length; i++) g[CONTINUOUS_GENES[i]] = geneFromRange(rng, s, CONTINUOUS_GENES[i]);
        return g;
    }

    function cloneGenome(g) {
        var c = {};
        for (var k in g) c[k] = g[k];
        c.seeds = { melody: g.seeds.melody, bass: g.seeds.bass, chords: g.seeds.chords };
        c.chordOverrides = (g.chordOverrides || []).slice();
        return c;
    }

    // Applies the locked values of the settings to a genome (used when locks change).
    function applyLocks(g, settings) {
        var s = normalizeSettings(settings);
        var c = cloneGenome(g);
        if (s.locks.key) c.key = s.key;
        if (s.locks.scale) c.scale = s.scale;
        if (s.locks.progression) c.progression = s.progression;
        if (s.locks.bpm) c.bpm = s.bpm;
        return c;
    }

    // ----------------------------------------------------------------- theory
    function chordDegreeForBar(g, bar) {
        var o = g.chordOverrides && g.chordOverrides[bar];
        if (o !== undefined && o !== null && o >= 0) return o % 7;
        var p = PROGRESSIONS[g.progression].degrees;
        return p[bar % p.length];
    }

    function chordQualityName(pcs) {
        var root = pcs[0];
        var third = mod12(pcs[1] - root), fifth = mod12(pcs[2] - root);
        var q = third === 4 ? (fifth === 8 ? 'aug' : '') : (fifth === 6 ? 'dim' : 'm');
        if (pcs.length > 3) {
            var sev = mod12(pcs[3] - root);
            if (q === '' && sev === 11) return 'maj7';
            if (q === '' && sev === 10) return '7';
            if (q === 'm' && sev === 10) return 'm7';
            if (q === 'dim' && sev === 10) return 'm7b5';
            if (q === 'dim' && sev === 9) return 'dim7';
            if (q === 'm' && sev === 11) return 'm(maj7)';
            return q + '7';
        }
        return q;
    }

    // Pitch classes of the diatonic chord on a scale degree (stacked thirds).
    function chordPitchClasses(key, scaleIdx, degree, seventh) {
        var h = SCALES[scaleIdx].harmony;
        var pcs = [mod12(key + h[degree % 7]), mod12(key + h[(degree + 2) % 7]), mod12(key + h[(degree + 4) % 7])];
        if (seventh) pcs.push(mod12(key + h[(degree + 6) % 7]));
        return pcs;
    }

    // Closest voicing to the previous chord (smooth voice leading), lowest note in [50, 61].
    function voiceChord(pcs, prev) {
        var best = null, bestCost = 0;
        for (var rot = 0; rot < pcs.length; rot++) {
            var notes = [];
            var base = 50 + mod12(pcs[rot] - 50);       // first pc placed in [50, 61]
            notes.push(base);
            for (var j = 1; j < pcs.length; j++) {
                var pc = pcs[(rot + j) % pcs.length];
                var n = notes[j - 1] + 1 + mod12(pc - (notes[j - 1] + 1));
                notes.push(n);
            }
            var cost = 0;
            if (prev) {
                for (var a = 0; a < notes.length; a++) {
                    var nearest = 1000;
                    for (var b = 0; b < prev.length; b++) {
                        var dd = Math.abs(notes[a] - prev[b]);
                        if (dd < nearest) nearest = dd;
                    }
                    cost += nearest;
                }
            } else {
                cost = Math.abs(notes[0] - 55);
            }
            if (best === null || cost < bestCost) { best = notes; bestCost = cost; }
        }
        return best;
    }

    function noteName(pitch) {
        return NOTE_NAMES[mod12(pitch)] + (Math.floor(pitch / 12) - 1);
    }

    // ----------------------------------------------------------------- render
    function inScaleSet(key, scaleIdx) {
        var set = [];
        for (var i = 0; i < 12; i++) set.push(false);
        var st = SCALES[scaleIdx].steps;
        for (var j = 0; j < st.length; j++) set[mod12(key + st[j])] = true;
        return set;
    }

    function renderChords(g, s, rng) {
        var chords = [], notes = [], prev = null;
        for (var bar = 0; bar < s.bars; bar++) {
            var degree = chordDegreeForBar(g, bar);
            var seventh = g.chordComplexity > 0.3 && rng.float() < g.chordComplexity * 0.8;
            var pcs = chordPitchClasses(g.key, g.scale, degree, seventh);
            var voicing = voiceChord(pcs, prev);
            prev = voicing;
            chords.push({ bar: bar, degree: degree, root: pcs[0], pcs: pcs, pitches: voicing,
                          name: NOTE_NAMES[pcs[0]] + chordQualityName(pcs) });
            var vel = 64 + Math.floor(g.dynamics * 20);
            var hits;
            if (s.chordRhythm === 'half') hits = [[0, 960], [960, 960]];
            else if (s.chordRhythm === 'stabs') hits = [[0, 360], [720, 240], [1200, 360], [1680, 240]];
            else hits = [[0, BAR]];
            for (var h = 0; h < hits.length; h++) {
                for (var i = 0; i < voicing.length; i++) {
                    notes.push({ pitch: voicing[i], start: bar * BAR + hits[h][0], length: hits[h][1],
                                 velocity: clamp(vel - (h % 2) * 8, 1, 127) });
                }
            }
        }
        return { chords: chords, notes: notes };
    }

    function bassPitch(pc) { return 36 + mod12(pc); }   // C2..B2

    function renderBass(g, s, chords, rng) {
        var notes = [];
        var m = g.bassMovement;
        var vel = 88 + Math.floor(g.dynamics * 16);
        for (var bar = 0; bar < s.bars; bar++) {
            var root = bassPitch(chords[bar].root);
            var fifth = chords[bar].pcs.length > 2 ? bassPitch(chords[bar].pcs[2]) : root;
            if (fifth < root) fifth += 12;
            if (fifth > 50) fifth -= 12;
            var t0 = bar * BAR;
            if (m < 0.33) {
                notes.push({ pitch: root, start: t0, length: BAR - 60, velocity: vel });
            } else if (m < 0.66) {
                notes.push({ pitch: root, start: t0, length: 900, velocity: vel });
                notes.push({ pitch: rng.float() < 0.5 ? fifth : root, start: t0 + 960, length: 900, velocity: vel - 8 });
            } else {
                var nextRoot = bassPitch(chords[(bar + 1) % s.bars].root);
                var approach = nextRoot + (rng.float() < 0.5 ? -1 : 2);
                var line = [root, rng.float() < 0.4 ? root + 12 : root, fifth, approach];
                for (var q = 0; q < 4; q++) {
                    var p = clamp(line[q], 28, 55);
                    notes.push({ pitch: p, start: t0 + q * PPQ, length: 400, velocity: vel - (q % 2) * 10 });
                }
            }
        }
        return notes;
    }

    function rhythmForBar(g, s, rng) {
        var weights = [], onsets = [];
        var base = 0.15 + g.density * 0.6;
        for (var st = 0; st < STEPS_PER_BAR; st++) {
            var w = st % 4 === 0 ? 1.6 : (st % 2 === 0 ? 1.0 : 0.3 + g.syncopation * 0.9);
            weights.push(w);
            if (rng.float() < base * w) onsets.push(st);
        }
        if (onsets.length === 0 || onsets[0] !== 0) {
            if (rng.float() < 0.8 || onsets.length === 0) onsets.unshift(0);
        }
        // limit of candidates: drop the weakest onsets beyond the maximum
        while (onsets.length > s.maxNotesPerBar) {
            var weakest = 1, wi = weights[onsets[1]];
            for (var i = 2; i < onsets.length; i++) {
                if (weights[onsets[i]] <= wi) { wi = weights[onsets[i]]; weakest = i; }
            }
            onsets.splice(weakest, 1);
        }
        if (onsets.length < 2) {
            var extra = onsets[0] === 8 ? 0 : 8;
            onsets.push(extra);
            onsets.sort(function (a, b) { return a - b; });
        }
        return onsets;
    }

    function melodyPool(g, s) {
        var span = 7 + Math.floor(g.range * 12);
        var center = Math.floor((s.melodyLow + s.melodyHigh) / 2);
        var lo = Math.max(s.melodyLow, center - Math.floor(span / 2));
        var hi = Math.min(s.melodyHigh, lo + span);
        var scale = inScaleSet(g.key, g.scale);
        var pool = [];
        for (var p = lo; p <= hi; p++) if (scale[mod12(p)]) pool.push(p);
        if (pool.length < 5) {
            pool = [];
            for (var q = s.melodyLow; q <= s.melodyHigh; q++) if (scale[mod12(q)]) pool.push(q);
        }
        return pool;
    }

    function nearestChordToneIndex(pool, idx, pcs) {
        for (var d = 0; d <= 3; d++) {
            var cands = d === 0 ? [idx] : [idx - d, idx + d];
            for (var c = 0; c < cands.length; c++) {
                var i = cands[c];
                if (i >= 0 && i < pool.length && pcs.indexOf(mod12(pool[i])) >= 0) return i;
            }
        }
        return idx;
    }

    function renderMelody(g, s, chords, rng) {
        var pool = melodyPool(g, s);
        var rhythms = [], pitchesByBar = [], notes = [];
        var idx = nearestChordToneIndex(pool, Math.floor(pool.length / 2), chords[0].pcs);
        var totalSteps = s.bars * STEPS_PER_BAR;
        for (var bar = 0; bar < s.bars; bar++) {
            var reuse = bar >= 2 && rng.float() < g.repetition;
            var onsets = reuse ? rhythms[bar - 2].slice() : rhythmForBar(g, s, rng);
            rhythms.push(onsets);
            var copyPitches = reuse && rng.float() < g.repetition * 0.5;
            var barPitches = [];
            for (var n = 0; n < onsets.length; n++) {
                var stepAbs = bar * STEPS_PER_BAR + onsets[n];
                if (copyPitches && n < pitchesByBar[bar - 2].length) {
                    idx = pitchesByBar[bar - 2][n];
                } else if (!(bar === 0 && n === 0)) {
                    var phase = stepAbs / totalSteps;
                    var upBias = 0.5 + (g.contour - 0.5) * (phase < 0.5 ? 0.8 : -0.8);
                    var dir = rng.float() < upBias ? 1 : -1;
                    var move = rng.float() < 0.1 + g.stepwise * 0.85 ? 1 : 2 + rng.int(3);
                    idx += dir * move;
                    if (idx < 0) idx = -idx;
                    if (idx > pool.length - 1) idx = 2 * (pool.length - 1) - idx;
                    idx = clamp(idx, 0, pool.length - 1);
                    if (onsets[n] % 4 === 0 && rng.float() < 0.85) idx = nearestChordToneIndex(pool, idx, chords[bar].pcs);
                }
                barPitches.push(idx);
            }
            pitchesByBar.push(barPitches);
        }
        // resolve the phrase: last note on a tonic chord tone
        var tonicPcs = chordPitchClasses(g.key, g.scale, 0, false);
        var lastBar = s.bars - 1;
        var lp = pitchesByBar[lastBar];
        lp[lp.length - 1] = nearestChordToneIndex(pool, lp[lp.length - 1], tonicPcs);

        for (var b = 0; b < s.bars; b++) {
            var ons = rhythms[b];
            for (var k = 0; k < ons.length; k++) {
                var startStep = b * STEPS_PER_BAR + ons[k];
                var endStep = k + 1 < ons.length ? b * STEPS_PER_BAR + ons[k + 1]
                                                 : (b + 1 < s.bars ? (b + 1) * STEPS_PER_BAR + rhythms[b + 1][0] : totalSteps);
                var gapSteps = Math.min(endStep - startStep, 8);
                var isLast = b === lastBar && k === ons.length - 1;
                var start = startStep * STEP;
                var length = isLast ? (totalSteps - startStep) * STEP : Math.max(60, Math.floor(gapSteps * STEP * 0.9));
                if (ons[k] % 4 === 2) {        // swing the off-beat 8ths
                    var delay = Math.floor(g.swing * 80);
                    start += delay;
                    length = Math.max(30, length - delay);
                }
                var accent = ons[k] % 4 === 0 ? (ons[k] % 8 === 0 ? 100 : 90) : 76;
                var vel = accent + Math.floor((rng.float() - 0.5) * g.dynamics * 24);
                notes.push({ pitch: pool[pitchesByBar[b][k]], start: start, length: length, velocity: clamp(vel, 1, 127) });
            }
        }
        return notes;
    }

    function render(genome, settings) {
        var s = normalizeSettings(settings);
        var g = genome;
        var ch = renderChords(g, s, createRng(g.seeds.chords));
        var bass = renderBass(g, s, ch.chords, createRng(g.seeds.bass));
        var melody = renderMelody(g, s, ch.chords, createRng(g.seeds.melody));
        return {
            bpm: g.bpm, bars: s.bars, ppq: PPQ, key: g.key, scale: g.scale,
            chords: ch.chords,
            tracks: { melody: melody, bass: bass, chords: ch.notes },
            edited: false
        };
    }

    // --------------------------------------------------------------- fitness
    var FOCUS_WEIGHTS = {
        balanced: [1, 1, 1],
        harmony: [0.3, 0.55, 0.15],
        rhythm: [0.2, 0.2, 0.6],
        catchy: [0.55, 0.2, 0.25]
    };

    function closeness(value, target, tolerance) {
        return 1 - Math.min(1, Math.abs(value - target) / tolerance);
    }

    function evaluate(pattern, genome, settings) {
        var s = normalizeSettings(settings);
        var t = s.targets;
        var mel = pattern.tracks.melody.slice().sort(function (a, b) { return a.start - b.start; });
        var chords = pattern.chords;
        var inScale = inScaleSet(pattern.key, pattern.scale);

        // melodic
        var steps = 0, leaps = 0, intervals = 0, lo = 1000, hi = -1000;
        for (var i = 0; i < mel.length; i++) {
            if (mel[i].pitch < lo) lo = mel[i].pitch;
            if (mel[i].pitch > hi) hi = mel[i].pitch;
            if (i > 0) {
                var d = Math.abs(mel[i].pitch - mel[i - 1].pitch);
                intervals++;
                if (d <= 2) steps++;
                if (d > 7) leaps++;
            }
        }
        var stepRatio = intervals ? steps / intervals : 0;
        var leapRatio = intervals ? leaps / intervals : 0;
        var span = mel.length ? hi - lo : 0;
        var lastPc = mel.length ? mod12(mel[mel.length - 1].pitch) : -1;
        var tonic = chordPitchClasses(pattern.key, pattern.scale, 0, false);
        var resolution = tonic.indexOf(lastPc) >= 0 ? 1 : 0.4;

        // motif repetition: onset overlap between bar n and bar n+2
        var onsetsByBar = [];
        for (var b = 0; b < pattern.bars; b++) onsetsByBar.push([]);
        for (var m = 0; m < mel.length; m++) {
            var bb = Math.floor(mel[m].start / BAR);
            if (bb < pattern.bars) onsetsByBar[bb].push(Math.floor((mel[m].start % BAR) / STEP));
        }
        var simSum = 0, simCount = 0;
        for (var x = 0; x + 2 < pattern.bars; x++) {
            var A = onsetsByBar[x], B = onsetsByBar[x + 2], inter = 0;
            for (var a = 0; a < A.length; a++) if (B.indexOf(A[a]) >= 0) inter++;
            var uni = A.length + B.length - inter;
            simSum += uni ? inter / uni : 1;
            simCount++;
        }
        var repetition = simCount ? simSum / simCount : t.repetition;

        var melodic = (closeness(stepRatio, t.stepwise, 0.5) * 0.3 + (1 - Math.min(1, leapRatio * 3)) * 0.2 +
                       closeness(span, t.span, 12) * 0.2 + resolution * 0.15 + closeness(repetition, t.repetition, 0.6) * 0.15);

        // harmonic
        var strong = 0, strongChord = 0, inKey = 0;
        for (var n = 0; n < mel.length; n++) {
            if (inScale[mod12(mel[n].pitch)]) inKey++;
            if (mel[n].start % PPQ === 0) {
                var cb = Math.min(pattern.bars - 1, Math.floor(mel[n].start / BAR));
                strong++;
                if (chords[cb].pcs.indexOf(mod12(mel[n].pitch)) >= 0) strongChord++;
            }
        }
        var chordToneRatio = strong ? strongChord / strong : 0;
        var inKeyRatio = mel.length ? inKey / mel.length : 0;
        var move = 0, moves = 0;
        for (var c = 1; c < chords.length; c++) {
            var pa = chords[c - 1].pitches, pb = chords[c].pitches;
            for (var v = 0; v < Math.min(pa.length, pb.length); v++) { move += Math.abs(pb[v] - pa[v]); moves++; }
        }
        var voiceLeading = moves ? 1 - Math.min(1, (move / moves) / 6) : 1;
        var lastDegree = chords[chords.length - 1].degree;
        var cadence = (lastDegree === 0 || lastDegree === 4) ? 1 : 0.6;
        var harmonic = chordToneRatio * 0.4 + inKeyRatio * 0.25 + voiceLeading * 0.2 + cadence * 0.15;

        // rhythmic
        var perBar = mel.length / pattern.bars;
        var offGrid = 0, emptyBars = 0, durations = [];
        for (var r = 0; r < mel.length; r++) {
            var stp = Math.floor((mel[r].start % BAR) / STEP);
            if (stp % 2 === 1) offGrid++;
            var dq = Math.floor(mel[r].length / STEP);
            if (durations.indexOf(dq) < 0) durations.push(dq);
        }
        for (var e = 0; e < pattern.bars; e++) if (onsetsByBar[e].length === 0) emptyBars++;
        var syncRatio = mel.length ? offGrid / mel.length : 0;
        var rhythmic = (closeness(perBar, t.density, t.density) * 0.4 + closeness(syncRatio, t.syncopation, 0.5) * 0.25 +
                        Math.min(1, durations.length / 3) * 0.2 + (1 - emptyBars / pattern.bars) * 0.15);

        var w = FOCUS_WEIGHTS[s.focus] || FOCUS_WEIGHTS.balanced;
        var base = (melodic * w[0] + harmonic * w[1] + rhythmic * w[2]) / (w[0] + w[1] + w[2]);
        var user = genome ? clamp(genome.userScore || 0, -1, 1) : 0;
        var total = base * 0.8 + (user + 1) * 0.1;
        return {
            total: total, melodic: melodic, harmonic: harmonic, rhythmic: rhythmic,
            details: { stepRatio: stepRatio, leapRatio: leapRatio, span: span, chordToneRatio: chordToneRatio,
                       inKeyRatio: inKeyRatio, voiceLeading: voiceLeading, notesPerBar: perBar,
                       syncopation: syncRatio, repetition: repetition }
        };
    }

    // ---------------------------------------------------------------- evolve
    function scoreGenome(g, s) {
        var p = render(g, s);
        var f = evaluate(p, g, s);
        return { genome: g, fitness: f.total, breakdown: f };
    }

    function createPopulation(settings, seed) {
        var s = normalizeSettings(settings);
        var rng = createRng(seed);
        var pop = [];
        for (var i = 0; i < s.populationSize; i++) pop.push(scoreGenome(randomGenome(rng, s), s));
        sortPopulation(pop);
        return pop;
    }

    function sortPopulation(pop) {
        // stable order: fitness desc, then original index
        var indexed = pop.map(function (x, i) { return [x, i]; });
        indexed.sort(function (a, b) { return (b[0].fitness - a[0].fitness) || (a[1] - b[1]); });
        for (var i = 0; i < pop.length; i++) pop[i] = indexed[i][0];
        return pop;
    }

    function tournament(pop, rng) {
        var best = null;
        for (var i = 0; i < 3; i++) {
            var c = pop[rng.int(pop.length)];
            if (best === null || c.fitness > best.fitness) best = c;
        }
        return best.genome;
    }

    function mutate(g, s, rng) {
        var rate = s.mutationRate;
        for (var i = 0; i < CONTINUOUS_GENES.length; i++) {
            var k = CONTINUOUS_GENES[i];
            if (rng.float() < rate) {
                var delta = (rng.float() + rng.float() + rng.float() - 1.5) * 0.2;
                g[k] = clamp(g[k] + delta, 0, 1);
            }
        }
        if (!s.locks.bpm && rng.float() < rate) g.bpm = clamp(g.bpm + rng.int(17) - 8, 60, 180);
        if (!s.locks.key && rng.float() < rate * 0.5) g.key = mod12(g.key + (rng.float() < 0.5 ? 7 : 5));
        if (!s.locks.scale && rng.float() < rate * 0.5) g.scale = s.scalePool[rng.int(s.scalePool.length)];
        if (!s.locks.progression && rng.float() < rate * 0.5) g.progression = s.progressionPool[rng.int(s.progressionPool.length)];
        if (rng.float() < rate) g.seeds.melody = rng.next();
        if (rng.float() < rate * 0.5) g.seeds.bass = rng.next();
        if (rng.float() < rate * 0.5) g.seeds.chords = rng.next();
        return g;
    }

    function crossover(a, b, rng) {
        var c = cloneGenome(a);
        for (var i = 0; i < CONTINUOUS_GENES.length; i++) {
            var k = CONTINUOUS_GENES[i];
            if (rng.float() < 0.5) c[k] = b[k];
        }
        if (rng.float() < 0.5) c.key = b.key;
        if (rng.float() < 0.5) c.scale = b.scale;
        if (rng.float() < 0.5) c.progression = b.progression;
        if (rng.float() < 0.5) c.bpm = b.bpm;
        if (rng.float() < 0.5) c.seeds.melody = b.seeds.melody;
        if (rng.float() < 0.5) c.seeds.bass = b.seeds.bass;
        if (rng.float() < 0.5) c.seeds.chords = b.seeds.chords;
        c.chordOverrides = [];
        c.userScore = ((a.userScore || 0) + (b.userScore || 0)) * 0.25;
        return c;
    }

    function evolve(population, settings, seed) {
        var s = normalizeSettings(settings);
        var rng = createRng(seed);
        var pop = population.map(function (x) { return scoreGenome(applyLocks(x.genome, s), s); });
        sortPopulation(pop);
        var eliteCount = Math.max(1, Math.floor(s.populationSize * s.eliteRatio));
        var next = [];
        for (var i = 0; i < Math.min(eliteCount, pop.length); i++) next.push(pop[i]);
        // a few fresh random candidates per generation keep the population diverse
        var immigrants = Math.max(1, Math.floor(s.populationSize * 0.1));
        for (var m = 0; m < immigrants && next.length < s.populationSize; m++) next.push(scoreGenome(randomGenome(rng, s), s));
        while (next.length < s.populationSize) {
            var child = crossover(tournament(pop, rng), tournament(pop, rng), rng);
            next.push(scoreGenome(applyLocks(mutate(child, s, rng), s), s));
        }
        return sortPopulation(next);
    }

    // Average normalized gene distance between all pairs (0 = clones, 1 = maximally different).
    function diversity(population) {
        var n = population.length, sum = 0, pairs = 0;
        for (var i = 0; i < n; i++) {
            for (var j = i + 1; j < n; j++) {
                var a = population[i].genome, b = population[j].genome, d = 0;
                for (var k = 0; k < CONTINUOUS_GENES.length; k++) d += Math.abs(a[CONTINUOUS_GENES[k]] - b[CONTINUOUS_GENES[k]]);
                d += a.key === b.key ? 0 : 1;
                d += a.scale === b.scale ? 0 : 1;
                d += a.progression === b.progression ? 0 : 1;
                d += Math.abs(a.bpm - b.bpm) / 120;
                sum += d / (CONTINUOUS_GENES.length + 4);
                pairs++;
            }
        }
        return pairs ? sum / pairs : 0;
    }

    // ------------------------------------------------------------- editing
    function clonePattern(p) {
        var c = { bpm: p.bpm, bars: p.bars, ppq: p.ppq, key: p.key, scale: p.scale, edited: true,
                  chords: p.chords.map(function (x) { return { bar: x.bar, degree: x.degree, root: x.root,
                      pcs: x.pcs.slice(), pitches: x.pitches.slice(), name: x.name }; }),
                  tracks: {} };
        for (var i = 0; i < TRACKS.length; i++) {
            c.tracks[TRACKS[i]] = p.tracks[TRACKS[i]].map(function (n) {
                return { pitch: n.pitch, start: n.start, length: n.length, velocity: n.velocity };
            });
        }
        return c;
    }

    function addNote(p, track, note) {
        var c = clonePattern(p);
        c.tracks[track].push({ pitch: clamp(note.pitch, 0, 127), start: Math.max(0, note.start),
                               length: Math.max(1, note.length), velocity: clamp(note.velocity || 90, 1, 127) });
        c.tracks[track].sort(function (a, b) { return a.start - b.start || a.pitch - b.pitch; });
        return c;
    }

    // Removes the note of a track that sounds at (tick, pitch); returns the pattern unchanged if none.
    function removeNoteAt(p, track, tick, pitch) {
        var list = p.tracks[track];
        for (var i = 0; i < list.length; i++) {
            if (list[i].pitch === pitch && tick >= list[i].start && tick < list[i].start + list[i].length) {
                var c = clonePattern(p);
                c.tracks[track].splice(i, 1);
                return c;
            }
        }
        return p;
    }

    function transposeTrack(p, track, semitones) {
        var c = clonePattern(p);
        c.tracks[track].forEach(function (n) { n.pitch = clamp(n.pitch + semitones, 0, 127); });
        return c;
    }

    // Keeps the genome but re-rolls one layer (new seed); other layers are untouched.
    function rerollLayer(genome, layer, seed) {
        var g = cloneGenome(genome);
        g.seeds[layer] = createRng(seed).next();
        return g;
    }

    function setChordOverride(genome, bar, degree) {
        var g = cloneGenome(genome);
        while (g.chordOverrides.length <= bar) g.chordOverrides.push(-1);
        g.chordOverrides[bar] = degree;
        return g;
    }


    // ---------------------------------------------------------------- presets
    // Styles set tempo, rhythm and harmony targets; moods choose scales,
    // progressions, melodic shape and energy. Mirrored in plugin/Source/Presets.h.
    var STYLES = [
        { id: 'free', name: 'Free', hint: 'No style bias', bpmRange: [70, 150], chordRhythm: 'sustain',
          targets: { density: 4, stepwise: 0.7, span: 12, syncopation: 0.2, repetition: 0.6 }, geneRanges: {} },
        { id: 'trap', name: 'Trap', hint: '130-160 BPM, syncopated melodies, long bass notes', bpmRange: [130, 160], chordRhythm: 'sustain',
          targets: { density: 5, stepwise: 0.6, span: 12, syncopation: 0.45, repetition: 0.75 },
          geneRanges: { syncopation: [0.5, 1], density: [0.4, 0.9], bassMovement: [0, 0.4], swing: [0, 0.15], chordComplexity: [0.2, 0.6] } },
        { id: 'lofi', name: 'Lo-fi', hint: '70-90 BPM, jazzy seventh chords, lazy swing', bpmRange: [70, 90], chordRhythm: 'sustain',
          targets: { density: 3, stepwise: 0.75, span: 10, syncopation: 0.3, repetition: 0.7 },
          geneRanges: { chordComplexity: [0.7, 1], swing: [0.4, 0.8], density: [0.2, 0.55], bassMovement: [0.33, 0.66] } },
        { id: 'pop', name: 'Pop', hint: '95-128 BPM, catchy repeated hooks, simple triads', bpmRange: [95, 128], chordRhythm: 'half',
          targets: { density: 4, stepwise: 0.75, span: 12, syncopation: 0.25, repetition: 0.8 },
          geneRanges: { repetition: [0.6, 1], chordComplexity: [0, 0.35], syncopation: [0.2, 0.5], swing: [0, 0.1] } },
        { id: 'rnb', name: 'R&B', hint: '65-95 BPM, rich chords, soulful syncopation', bpmRange: [65, 95], chordRhythm: 'sustain',
          targets: { density: 4, stepwise: 0.65, span: 14, syncopation: 0.4, repetition: 0.6 },
          geneRanges: { chordComplexity: [0.7, 1], swing: [0.2, 0.6], syncopation: [0.4, 0.8] } },
        { id: 'funk', name: 'Funk BR', hint: '128-150 BPM, short stabs, very repetitive riffs', bpmRange: [128, 150], chordRhythm: 'stabs',
          targets: { density: 6, stepwise: 0.55, span: 10, syncopation: 0.5, repetition: 0.85 },
          geneRanges: { syncopation: [0.5, 1], repetition: [0.7, 1], bassMovement: [0.66, 1], chordComplexity: [0, 0.3] } },
        { id: 'reggaeton', name: 'Reggaeton', hint: '88-100 BPM, dembow-friendly stabs and hooks', bpmRange: [88, 100], chordRhythm: 'stabs',
          targets: { density: 5, stepwise: 0.65, span: 10, syncopation: 0.45, repetition: 0.8 },
          geneRanges: { syncopation: [0.4, 0.8], repetition: [0.6, 1], chordComplexity: [0.1, 0.5] } },
        { id: 'house', name: 'House', hint: '120-128 BPM, chord stabs, moving bass', bpmRange: [120, 128], chordRhythm: 'stabs',
          targets: { density: 5, stepwise: 0.6, span: 12, syncopation: 0.4, repetition: 0.8 },
          geneRanges: { bassMovement: [0.66, 1], chordComplexity: [0.4, 0.8], syncopation: [0.3, 0.7] } },
        { id: 'ambient', name: 'Ambient', hint: '60-90 BPM, few long notes, spacious pads', bpmRange: [60, 90], chordRhythm: 'sustain',
          targets: { density: 2, stepwise: 0.85, span: 10, syncopation: 0.05, repetition: 0.7 },
          geneRanges: { density: [0, 0.3], swing: [0, 0.05], bassMovement: [0, 0.33], chordComplexity: [0.5, 1] } },
        { id: 'jazz', name: 'Jazz', hint: '90-160 BPM, swing, sevenths, walking bass', bpmRange: [90, 160], chordRhythm: 'half',
          targets: { density: 5, stepwise: 0.55, span: 14, syncopation: 0.4, repetition: 0.4 },
          geneRanges: { chordComplexity: [0.75, 1], swing: [0.5, 1], bassMovement: [0.66, 1] } }
    ];

    var MOODS = [
        { id: 'neutral', name: 'Neutral', hint: 'Any scale or progression', scales: null, progressions: null, geneRanges: {} },
        { id: 'happy', name: 'Happy', hint: 'Major scales, rising melodies', scales: [0, 3, 5], progressions: [0, 1, 3, 7],
          geneRanges: { contour: [0.5, 1], dynamics: [0.4, 0.8], range: [0.4, 0.9] } },
        { id: 'sad', name: 'Sad', hint: 'Minor scales, falling melodies, soft', scales: [1, 2, 4], progressions: [2, 5, 6],
          geneRanges: { contour: [0, 0.5], dynamics: [0.1, 0.5], range: [0.2, 0.6] } },
        { id: 'dark', name: 'Dark', hint: 'Minor / harmonic minor, low and narrow', scales: [1, 4, 6], progressions: [5, 6],
          geneRanges: { contour: [0, 0.4], dynamics: [0.3, 0.7], range: [0.1, 0.5] } },
        { id: 'dreamy', name: 'Dreamy', hint: 'Open scales, wide and gentle melodies', scales: [0, 2, 5], progressions: [1, 2, 7],
          geneRanges: { contour: [0.3, 0.7], dynamics: [0, 0.4], range: [0.5, 1] } },
        { id: 'energetic', name: 'Energetic', hint: 'Driving progressions, strong accents', scales: [1, 3, 6], progressions: [0, 1, 2, 5],
          geneRanges: { contour: [0.4, 0.9], dynamics: [0.6, 1], range: [0.5, 1] } },
        { id: 'chill', name: 'Chill', hint: 'Dorian / major, relaxed and soft', scales: [2, 0, 6], progressions: [1, 3, 4],
          geneRanges: { contour: [0.3, 0.6], dynamics: [0.1, 0.4], range: [0.2, 0.6] } }
    ];

    // Returns the preset part of the settings (merge it into your own settings).
    function presetSettings(styleIdx, moodIdx) {
        var st = STYLES[clamp(Math.floor(styleIdx) || 0, 0, STYLES.length - 1)];
        var md = MOODS[clamp(Math.floor(moodIdx) || 0, 0, MOODS.length - 1)];
        var ranges = {}, k;
        for (k in st.geneRanges) ranges[k] = st.geneRanges[k].slice();
        for (k in md.geneRanges) ranges[k] = md.geneRanges[k].slice();
        var targets = {};
        for (k in st.targets) targets[k] = st.targets[k];
        return { bpmRange: st.bpmRange.slice(), chordRhythm: st.chordRhythm, targets: targets, geneRanges: ranges,
                 scalePool: md.scales ? md.scales.slice() : null, progressionPool: md.progressions ? md.progressions.slice() : null };
    }

    // ---------------------------------------------------------------- MIDI
    function vlq(value) {
        var bytes = [value & 0x7F];
        value = Math.floor(value / 128);
        while (value > 0) { bytes.unshift((value & 0x7F) | 0x80); value = Math.floor(value / 128); }
        return bytes;
    }

    function textBytes(str) {
        var out = [];
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            out.push(c < 128 ? c : 63);
        }
        return out;
    }

    function chunk(type, data) {
        var len = data.length;
        return textBytes(type).concat([(len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255], data);
    }

    function keySignature(key, scaleIdx) {
        // accidentals of the parent major scale (modes share it), e.g. G# mixolydian -> C# major
        var sc = SCALES[scaleIdx];
        var sf = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5][mod12(key + sc.parentMajor)];
        return [sf & 255, sc.minor && sc.parentMajor === 3 ? 1 : 0];
    }

    function trackChunk(name, channel, notes) {
        var events = [];
        for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            events.push({ t: n.start, order: 1, bytes: [0x90 | channel, n.pitch, n.velocity] });
            events.push({ t: n.start + n.length, order: 0, bytes: [0x80 | channel, n.pitch, 0] });
        }
        events.sort(function (a, b) { return a.t - b.t || a.order - b.order || a.bytes[1] - b.bytes[1]; });
        var data = [0, 0xFF, 0x03].concat(vlq(name.length), textBytes(name));
        var last = 0;
        for (var e = 0; e < events.length; e++) {
            data = data.concat(vlq(events[e].t - last), events[e].bytes);
            last = events[e].t;
        }
        data = data.concat([0, 0xFF, 0x2F, 0]);
        return chunk('MTrk', data);
    }

    // Standard MIDI File, format 1: a tempo/meta track plus one track per layer.
    function toMidi(pattern, options) {
        options = options || {};
        var layers = options.tracks || TRACKS;
        var title = options.name || 'MelodyForge ISLAND27';
        var usPerQuarter = Math.floor(60000000 / pattern.bpm);
        var ks = keySignature(pattern.key, pattern.scale);
        var meta = [0, 0xFF, 0x03].concat(vlq(title.length), textBytes(title),
            [0, 0xFF, 0x51, 0x03, (usPerQuarter >>> 16) & 255, (usPerQuarter >>> 8) & 255, usPerQuarter & 255],
            [0, 0xFF, 0x58, 0x04, 4, 2, 24, 8],
            [0, 0xFF, 0x59, 0x02, ks[0], ks[1]],
            [0, 0xFF, 0x2F, 0]);
        var bytes = chunk('MThd', [0, 1, 0, layers.length + 1, (PPQ >>> 8) & 255, PPQ & 255]).concat(chunk('MTrk', meta));
        var names = { melody: 'Melody', bass: 'Bass', chords: 'Chords' };
        for (var i = 0; i < layers.length; i++) {
            bytes = bytes.concat(trackChunk(names[layers[i]] || layers[i], TRACKS.indexOf(layers[i]), pattern.tracks[layers[i]]));
        }
        return new Uint8Array(bytes);
    }

    return {
        PPQ: PPQ, STEP: STEP, BAR: BAR, STEPS_PER_BAR: STEPS_PER_BAR,
        NOTE_NAMES: NOTE_NAMES, SCALES: SCALES, PROGRESSIONS: PROGRESSIONS, CHORD_RHYTHMS: CHORD_RHYTHMS,
        CONTINUOUS_GENES: CONTINUOUS_GENES, TRACKS: TRACKS, STYLES: STYLES, MOODS: MOODS, presetSettings: presetSettings,
        createRng: createRng, mixSeed: mixSeed,
        defaultSettings: defaultSettings, normalizeSettings: normalizeSettings,
        randomGenome: randomGenome, cloneGenome: cloneGenome, applyLocks: applyLocks,
        chordPitchClasses: chordPitchClasses, chordQualityName: chordQualityName, noteName: noteName,
        render: render, evaluate: evaluate, scoreGenome: scoreGenome,
        createPopulation: createPopulation, evolve: evolve, diversity: diversity, sortPopulation: sortPopulation,
        clonePattern: clonePattern, addNote: addNote, removeNoteAt: removeNoteAt, transposeTrack: transposeTrack,
        rerollLayer: rerollLayer, setChordOverride: setChordOverride,
        toMidi: toMidi
    };
}));
