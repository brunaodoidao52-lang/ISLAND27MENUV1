/*
 * MelodyForge — ISLAND27 edition: web interface + audio.
 * All music logic lives in core/melodyforge-core.js (MFCore); this file only
 * wires the page, plays patterns with Tone.js and handles files/storage.
 */
(function () {
    'use strict';

    var C = window.MFCore;
    var $ = function (id) { return document.getElementById(id); };

    function on(id, event, handler) {
        var el = $(id);
        if (!el) { console.warn('MelodyForge: missing element #' + id); return; }
        el.addEventListener(event, handler);
    }

    // Environments: fitness targets + the gene ranges new candidates are drawn from.
    var ENVIRONMENTS = {
        ambient:      { targets: { density: 2, stepwise: 0.85, span: 10, syncopation: 0.05, repetition: 0.7 }, chordRhythm: 'sustain',
                        bpmRange: [70, 100], geneRanges: { density: [0, 0.35], swing: [0, 0.1], chordComplexity: [0.4, 1], bassMovement: [0, 0.33] } },
        dance:        { targets: { density: 6, stepwise: 0.6, span: 12, syncopation: 0.35, repetition: 0.7 }, chordRhythm: 'stabs',
                        bpmRange: [118, 130], geneRanges: { density: [0.5, 1], syncopation: [0.3, 0.8], bassMovement: [0.66, 1], swing: [0, 0.15] } },
        jazz:         { targets: { density: 5, stepwise: 0.55, span: 14, syncopation: 0.4, repetition: 0.4 }, chordRhythm: 'half',
                        bpmRange: [90, 160], geneRanges: { chordComplexity: [0.7, 1], swing: [0.5, 1], bassMovement: [0.66, 1] } },
        classical:    { targets: { density: 4, stepwise: 0.8, span: 14, syncopation: 0.1, repetition: 0.6 }, chordRhythm: 'half',
                        bpmRange: [70, 130], geneRanges: { swing: [0, 0], chordComplexity: [0, 0.4], syncopation: [0, 0.3] } },
        lofi:         { targets: { density: 3, stepwise: 0.75, span: 10, syncopation: 0.3, repetition: 0.7 }, chordRhythm: 'sustain',
                        bpmRange: [70, 92], geneRanges: { chordComplexity: [0.6, 1], swing: [0.4, 0.8], density: [0.2, 0.6] } },
        electronic:   { targets: { density: 6, stepwise: 0.5, span: 12, syncopation: 0.45, repetition: 0.75 }, chordRhythm: 'stabs',
                        bpmRange: [120, 150], geneRanges: { syncopation: [0.4, 1], bassMovement: [0.5, 1], swing: [0, 0.1] } },
        experimental: { targets: { density: 5, stepwise: 0.4, span: 18, syncopation: 0.5, repetition: 0.3 }, chordRhythm: 'half',
                        bpmRange: [60, 180], geneRanges: {} }
    };

    var STORAGE_KEY = 'melodyForgeIsland27Genomes';

    function MelodyForgeApp() {
        this.environment = 'ambient';
        this.focus = 'harmony';
        this.mutationRate = 0.1;
        this.complexity = 5;
        this.harmonic = 5;
        this.generation = 0;
        this.seed = (Date.now() >>> 0);
        this.population = [];
        this.current = 0;          // index of the shown idea in the population, -1 when detached (edited/loaded)
        this.genome = null;        // genome of the shown idea
        this.pattern = null;       // rendered (or edited) pattern of the shown idea
        this.track = 'melody';     // layer shown in the editor
        this.bars = 4;
        this.populationSize = 20;
        this.maxNotesPerBar = 8;
        this.melodyLow = 60;
        this.melodyHigh = 84;
        this.fixed = { key: 0, scale: 0, progression: 0, bpm: 120 };
        this.locks = { key: false, scale: false, progression: false, bpm: false };
        this.layers = { melody: true, bass: true, chords: true };
        this.isRunning = false;
        this.evolveTimer = null;
        this.audioReady = false;
        this.isPlaying = false;
        this.savedGenomes = this.loadSavedGenomes();

        this.setupVisualizer();
        this.setupGeneratorPanel();
        this.bindEvents();
        this.bindEditor();
        this.setupAudioUnlock();
        this.resetPopulation();
        this.loadSharedGenome();
        this.renderSavedGenomes();
        this.animate();
        this.notify('Welcome to MelodyForge! Click anywhere to enable audio.');
    }

    var P = MelodyForgeApp.prototype;

    // ------------------------------------------------------------ settings
    P.settings = function () {
        var env = ENVIRONMENTS[this.environment] || ENVIRONMENTS.ambient;
        var c = (this.complexity - 1) / 9, h = (this.harmonic - 1) / 9;
        var ranges = {};
        for (var k in env.geneRanges) ranges[k] = env.geneRanges[k];
        ranges.density = ranges.density || [Math.max(0, c - 0.2), Math.min(1, c + 0.2)];
        ranges.chordComplexity = ranges.chordComplexity || [Math.max(0, h - 0.2), Math.min(1, h + 0.2)];
        return C.normalizeSettings({
            bars: this.bars, populationSize: this.populationSize, eliteRatio: 0.3, mutationRate: this.mutationRate,
            maxNotesPerBar: this.maxNotesPerBar, melodyLow: this.melodyLow, melodyHigh: this.melodyHigh,
            focus: this.focus, chordRhythm: env.chordRhythm, targets: env.targets,
            bpmRange: env.bpmRange, geneRanges: ranges,
            key: this.fixed.key, scale: this.fixed.scale, progression: this.fixed.progression, bpm: this.fixed.bpm,
            locks: this.locks
        });
    };

    P.currentEntry = function () { return this.current >= 0 ? this.population[this.current] || null : null; };
    P.currentGenome = function () { return this.genome; };
    P.isEdited = function () { return !!(this.pattern && this.pattern.edited); };

    // Asks before throwing away manual edits.
    P.confirmDiscard = function () {
        return !this.isEdited() || window.confirm('Discard your edits to this idea?');
    };

    // ------------------------------------------------------------ evolution
    // New population from a session seed (same seed + same settings = same candidates).
    P.resetPopulation = function (seed) {
        this.generation = 0;
        this.seed = seed === undefined ? ((this.seed + 0x9E3779B9) >>> 0) : (seed >>> 0);
        $('sessionSeed').value = this.seed;
        this.population = C.createPopulation(this.settings(), this.seed);
        this.selectCandidate(0, true);
    };

    P.rescore = function () {
        var s = this.settings();
        var keep = this.genome;
        this.population = C.sortPopulation(this.population.map(function (x) { return C.scoreGenome(C.applyLocks(x.genome, s), s); }));
        if (this.isEdited()) { this.current = -1; this.refresh(); return; }
        var idx = this.population.findIndex(function (x) { return x.genome.seeds.melody === (keep && keep.seeds.melody); });
        this.selectCandidate(idx < 0 ? 0 : idx, true);
    };

    P.evolveOnce = function () {
        this.generation++;
        this.population = C.evolve(this.population, this.settings(), (this.seed + this.generation * 7919) >>> 0);
        if (this.isEdited()) {
            // never replace an idea the user is editing; it stays on screen, detached from the population
            this.current = -1;
            this.refresh();
        } else {
            this.selectCandidate(0, true);
        }
        this.notify('Generation ' + this.generation + ' evolved');
    };

    P.selectCandidate = function (index, force) {
        if (!force && !this.confirmDiscard()) return false;
        this.current = Math.max(0, Math.min(index, this.population.length - 1));
        var e = this.population[this.current];
        this.genome = e ? e.genome : null;
        this.pattern = e ? C.render(e.genome, this.settings()) : null;
        this.refresh();
        if (this.isPlaying) this.schedulePattern();
        return true;
    };

    // Shows a genome that changed (slider, chord, re-roll...) — re-renders and re-scores it.
    P.showGenome = function (genome) {
        this.genome = genome;
        this.pattern = C.render(genome, this.settings());
        if (this.current >= 0) this.population[this.current] = C.scoreGenome(genome, this.settings());
        this.refresh();
        if (this.isPlaying) this.schedulePattern();
    };
    P.replaceCurrent = P.showGenome;

    // Applies an edit to the shown pattern.
    P.editPattern = function (pattern) {
        this.pattern = pattern;
        this.refresh();
        if (this.isPlaying) this.schedulePattern();
    };

    P.refresh = function () {
        if (this.genome) {
            $('tempoControl').value = this.pattern.bpm;
            $('tempoValue').textContent = this.pattern.bpm + ' BPM';
            $('lockBpmValue').textContent = this.pattern.bpm + ' BPM';
        }
        $('editorSection').classList.toggle('edited', this.isEdited());
        this.updateStats();
        this.updateGenomeDisplay();
        this.renderChordRow();
    };

    P.startEvolution = function () {
        if (this.isRunning) return;
        this.isRunning = true;
        $('startBtn').textContent = 'Running...';
        $('startBtn').disabled = true;
        var self = this;
        this.evolveTimer = setInterval(function () { self.evolveOnce(); }, 3000);
        this.notify('Evolution started (one generation every 3 s)');
    };

    P.pauseEvolution = function () {
        this.isRunning = false;
        clearInterval(this.evolveTimer);
        this.evolveTimer = null;
        $('startBtn').textContent = 'Start';
        $('startBtn').disabled = false;
        this.notify('Evolution paused');
    };

    P.rate = function (liked) {
        var g = this.genome;
        if (!g) return;
        var copy = C.cloneGenome(g);
        copy.userScore = Math.max(-1, Math.min(1, (copy.userScore || 0) + (liked ? 0.5 : -0.5)));
        var entry = C.scoreGenome(copy, this.settings());
        if (this.current < 0) {
            // a detached idea joins the gene pool, replacing the weakest candidate
            this.population[this.population.length - 1] = entry;
            C.sortPopulation(this.population);
            this.current = this.population.indexOf(entry);
        } else {
            this.population[this.current] = entry;
        }
        this.genome = copy;
        if (liked) {
            this.refresh();
            this.notify('Liked! This idea will be favoured by evolution');
        } else if (this.selectCandidate((this.current + 1) % this.population.length)) {
            this.notify('Skipped — candidate ' + (this.current + 1) + ' of ' + this.population.length);
        }
    };

    // ------------------------------------------------------------ audio
    P.setupAudioUnlock = function () {
        var self = this;
        var unlock = function () {
            if (self.audioReady) return;
            Tone.start().then(function () {
                self.initAudio();
                $('audioWarning').style.display = 'none';
                self.notify('Audio enabled! Ready to forge melodies');
            }).catch(function (e) {
                console.error(e);
                self.notify('Audio failed to start. Click to try again.', 'error');
                document.addEventListener('click', unlock, { once: true });
            });
        };
        document.addEventListener('click', unlock, { once: true });
        document.addEventListener('keydown', unlock, { once: true });
    };

    P.initAudio = function () {
        if (this.audioReady) return;
        Tone.Transport.PPQ = C.PPQ;
        this.master = new Tone.Gain(0.9).toDestination();
        this.analyser = new Tone.Analyser('waveform', 256);
        this.fft = new Tone.FFT(32);
        this.master.connect(this.analyser);
        this.master.connect(this.fft);
        this.reverb = new Tone.Reverb({ decay: 2.5, wet: 0.3 }).connect(this.master);
        this.delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.25, wet: 0.15 }).connect(this.reverb);

        this.synths = {
            melody: new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'triangle' }, volume: -8,
                envelope: { attack: 0.02, decay: 0.2, sustain: 0.4, release: 0.6 }
            }).connect(this.delay),
            bass: new Tone.MonoSynth({
                oscillator: { type: 'sawtooth' }, volume: -10,
                filter: { Q: 2, type: 'lowpass' },
                filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.3, baseFrequency: 120, octaves: 2.5 },
                envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.4 }
            }).connect(this.reverb),
            chords: new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'sine' }, volume: -14,
                envelope: { attack: 0.08, decay: 0.3, sustain: 0.6, release: 1.0 }
            }).connect(new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.6, wet: 0.3 }).start().connect(this.reverb))
        };
        this.reverb.wet.value = Number($('reverbAmount').value) / 100;
        this.audioReady = true;
    };

    P.schedulePattern = function () {
        if (this.part) { this.part.dispose(); this.part = null; }
        var p = this.pattern;
        if (!p) return;
        var events = [];
        var self = this;
        C.TRACKS.forEach(function (track) {
            p.tracks[track].forEach(function (n) {
                events.push({ time: n.start + 'i', track: track, pitch: n.pitch, length: n.length, velocity: n.velocity });
            });
        });
        this.part = new Tone.Part(function (time, ev) {
            if (!self.layers[ev.track]) return;
            var freq = Tone.Frequency(ev.pitch, 'midi').toFrequency();
            self.synths[ev.track].triggerAttackRelease(freq, ev.length + 'i', time, ev.velocity / 127);
        }, events).start(0);
        Tone.Transport.bpm.value = p.bpm;
        Tone.Transport.loop = true;
        Tone.Transport.loopStart = 0;
        Tone.Transport.loopEnd = (p.bars * C.BAR) + 'i';
    };

    P.play = function () {
        if (!this.audioReady) { this.notify('Click anywhere to enable audio first', 'warning'); return; }
        if (!this.pattern) return;
        this.schedulePattern();
        Tone.Transport.position = 0;
        Tone.Transport.start('+0.05');
        this.isPlaying = true;
        $('playButton').textContent = '⏸️';
    };

    P.stop = function () {
        if (!this.audioReady) return;
        Tone.Transport.stop();
        if (this.part) { this.part.dispose(); this.part = null; }
        C.TRACKS.forEach(function (t) { this.releaseLayer(t); }, this);
        this.isPlaying = false;
        $('playButton').textContent = '▶️';
    };

    P.releaseLayer = function (track) {
        var s = this.synths && this.synths[track];
        if (!s) return;
        if (s.releaseAll) s.releaseAll(); else s.triggerRelease();
    };

    P.toggleLayer = function (track) {
        this.layers[track] = !this.layers[track];
        $(track + 'Toggle').classList.toggle('active', this.layers[track]);
        if (!this.layers[track]) this.releaseLayer(track);
        var active = C.TRACKS.filter(function (t) { return this.layers[t]; }, this)
            .map(function (t) { return { melody: 'Melody', bass: 'Bass', chords: 'Chords' }[t]; });
        $('layerIndicator').textContent = active.join(' • ') || 'No layers active';
    };

    // ------------------------------------------------------------ display
    P.updateStats = function () {
        var pop = this.population;
        var avg = pop.length ? pop.reduce(function (a, x) { return a + x.fitness; }, 0) / pop.length : 0;
        $('generationCount').textContent = this.generation;
        $('populationCount').textContent = pop.length;
        $('fitnessScore').textContent = avg.toFixed(2);
        $('diversityScore').textContent = C.diversity(pop).toFixed(2);
        var progress = $('evolutionProgress');
        if (progress) progress.style.width = Math.min(100, this.generation) + '%';
    };

    P.updateGenomeDisplay = function () {
        if (!this.genome || !this.pattern) return;
        var g = this.genome;
        var b = C.evaluate(this.pattern, g, this.settings());
        var e = { fitness: b.total };
        $('scaleInfo').textContent = C.NOTE_NAMES[g.key] + ' ' + C.SCALES[g.scale].name;
        $('tempoInfo').textContent = g.bpm + ' BPM';
        $('patternInfo').textContent = this.pattern.chords.map(function (c) { return c.name; }).join(' – ');
        $('candidateLabel').textContent = this.current >= 0
            ? 'Candidate ' + (this.current + 1) + ' / ' + this.population.length
            : (this.isEdited() ? 'Your edited idea' : 'Loaded idea');
        $('seedInfo').textContent = 'seeds  M ' + g.seeds.melody + '  B ' + g.seeds.bass + '  C ' + g.seeds.chords;
        $('melodicBar').style.width = (b.melodic * 100) + '%';
        $('harmonicBar').style.width = (b.harmonic * 100) + '%';
        $('rhythmicBar').style.width = (b.rhythmic * 100) + '%';
        $('overallBar').style.width = (e.fitness * 100) + '%';
    };

    P.setupVisualizer = function () {
        var box = $('visualizer');
        this.vizBars = [];
        for (var i = 0; i < 20; i++) {
            var bar = document.createElement('div');
            bar.className = 'visualizer-bar';
            bar.style.height = '10px';
            box.appendChild(bar);
            this.vizBars.push(bar);
        }
        this.canvas = $('waveformCanvas');
        this.ctx = this.canvas.getContext('2d');
    };

    P.animate = function () {
        var self = this;
        var frame = function () {
            self.drawFrame();
            requestAnimationFrame(frame);
        };
        frame();
    };

    P.drawFrame = function () {
        this.drawRoll();
        var ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
        ctx.fillStyle = '#0c0e13';
        ctx.fillRect(0, 0, w, h);
        if (this.isPlaying && this.audioReady) {
            var spec = this.fft.getValue();
            for (var i = 0; i < this.vizBars.length; i++) {
                var db = spec[i + 1];
                var height = Math.max(6, Math.min(110, (db + 100) * 1.2));
                this.vizBars[i].style.height = height + 'px';
            }
            var wave = this.analyser.getValue();
            ctx.beginPath();
            for (var j = 0; j < wave.length; j++) {
                var x = j / (wave.length - 1) * w, y = (wave[j] + 1) / 2 * h;
                if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = '#7FE3FF';
            ctx.lineWidth = 2;
            ctx.stroke();
            var loopTicks = this.pattern.bars * C.BAR;
            var ticks = Tone.Transport.ticks % loopTicks;
            var secPerTick = 60 / (this.pattern.bpm * C.PPQ);
            $('timelineProgress').style.width = (ticks / loopTicks * 100) + '%';
            $('timeDisplay').textContent = fmt(ticks * secPerTick) + ' / ' + fmt(loopTicks * secPerTick);
        } else {
            this.vizBars.forEach(function (b) { b.style.height = '10px'; });
            ctx.fillStyle = 'rgba(127, 227, 255, 0.3)';
            ctx.font = '20px Segoe UI';
            ctx.textAlign = 'center';
            ctx.fillText('MelodyForge', w / 2, h / 2);
            $('timelineProgress').style.width = '0%';
            if (this.pattern) {
                var total = this.pattern.bars * C.BAR * 60 / (this.pattern.bpm * C.PPQ);
                $('timeDisplay').textContent = '0:00 / ' + fmt(total);
            }
        }
    };

    function fmt(seconds) {
        var s = Math.floor(seconds);
        return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }

    P.notify = function (message, type) {
        var n = $('notification');
        n.textContent = message;
        n.style.background = type === 'error' ? 'rgba(18, 33, 63, 0.97)'
                           : type === 'warning' ? 'rgba(29, 143, 194, 0.96)' : 'rgba(42, 169, 224, 0.95)';
        n.classList.add('show');
        clearTimeout(this.notifyTimer);
        this.notifyTimer = setTimeout(function () { n.classList.remove('show'); }, 3000);
    };

    // ------------------------------------------------------------ files
    function download(name, data, mime) {
        var blob = new Blob([data], { type: mime });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    P.fileBase = function () {
        var g = this.currentGenome();
        return 'melodyforge-' + C.NOTE_NAMES[g.key].replace('#', 's') + '-' + C.SCALES[g.scale].id + '-' + g.bpm + 'bpm';
    };

    P.exportMidi = function () {
        if (!this.pattern) return;
        download(this.fileBase() + '.mid', C.toMidi(this.pattern), 'audio/midi');
        this.notify('MIDI file exported (melody, bass and chords tracks)');
    };

    P.exportMidiLayers = function () {
        if (!this.pattern) return;
        var base = this.fileBase(), p = this.pattern;
        C.TRACKS.forEach(function (t) { download(base + '-' + t + '.mid', C.toMidi(p, { tracks: [t] }), 'audio/midi'); });
        this.notify('Exported one MIDI file per layer');
    };

    P.exportGenomeJson = function () {
        var g = this.currentGenome();
        if (!g) return;
        var data = { format: 'MelodyForge ISLAND27 genome', version: 2, genome: g, settings: this.settings(),
                     seed: this.seed, pattern: this.pattern, fitness: C.evaluate(this.pattern, g, this.settings()) };
        download(this.fileBase() + '.json', JSON.stringify(data, null, 2), 'application/json');
    };

    P.copyText = function (text, okMessage) {
        var self = this;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { self.notify(okMessage); },
                function () { window.prompt('Copy this:', text); });
        } else {
            window.prompt('Copy this:', text);
        }
    };

    P.share = function () {
        var g = this.currentGenome();
        if (!g) return;
        var code = btoa(JSON.stringify({ v: 2, g: g, env: this.environment }));
        var url = location.origin + location.pathname + '?g=' + encodeURIComponent(code);
        this.copyText(url, 'Share link copied to clipboard');
    };

    P.loadSharedGenome = function () {
        var params = new URLSearchParams(location.search);
        var code = params.get('g');
        if (!code) return;
        try {
            var data = JSON.parse(atob(code));
            if (!data.g || !data.g.seeds) throw new Error('invalid genome');
            if (ENVIRONMENTS[data.env]) { this.environment = data.env; $('environmentSelect').value = data.env; }
            this.population.unshift(C.scoreGenome(data.g, this.settings()));
            this.population.length = Math.min(this.population.length, this.populationSize);
            this.selectCandidate(0, true);
            this.notify('Shared idea loaded');
        } catch (e) {
            console.warn(e);
            this.notify('Invalid shared link', 'error');
        }
    };

    P.randomize = function () {
        var rand = function (min, max) { return min + Math.floor(Math.random() * (max - min + 1)); };
        var set = function (id, value) { var el = $(id); el.value = value; el.dispatchEvent(new Event('input')); };
        set('melodicComplexity', rand(1, 10));
        set('harmonicDensity', rand(1, 10));
        set('mutationRate', (rand(5, 30) / 100).toFixed(2));
        set('reverbAmount', rand(10, 60));
        var envs = Object.keys(ENVIRONMENTS);
        var sel = $('environmentSelect');
        sel.value = envs[rand(0, envs.length - 1)];
        sel.dispatchEvent(new Event('change'));
        this.notify('Parameters randomized');
    };

    // ------------------------------------------------------------ library
    P.loadSavedGenomes = function () {
        try {
            var list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return Array.isArray(list) ? list.filter(function (x) { return x && x.genome && x.genome.seeds; }) : [];
        } catch (e) { return []; }
    };

    P.persist = function () {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.savedGenomes)); }
        catch (e) { this.notify('Could not save to browser storage', 'error'); }
    };

    P.saveCurrent = function () {
        var name = $('genomeName').value.trim();
        if (!name) { this.notify('Please enter a name for the idea', 'warning'); return; }
        var g = this.currentGenome();
        if (!g) return;
        this.savedGenomes.push({ name: name, genome: C.cloneGenome(g), environment: this.environment,
                                 pattern: this.isEdited() ? C.clonePattern(this.pattern) : null,
                                 generation: this.generation, timestamp: Date.now() });
        this.persist();
        this.renderSavedGenomes();
        $('genomeName').value = '';
        this.notify('Saved "' + name + '"');
    };

    P.loadSaved = function (index) {
        var item = this.savedGenomes[index];
        if (!item) return;
        if (!this.confirmDiscard()) return;
        if (ENVIRONMENTS[item.environment]) { this.environment = item.environment; $('environmentSelect').value = item.environment; }
        this.current = -1;
        this.genome = C.cloneGenome(item.genome);
        this.pattern = item.pattern ? C.clonePattern(item.pattern) : C.render(this.genome, this.settings());
        if (!item.pattern) this.pattern.edited = false;
        this.refresh();
        if (this.isPlaying) this.schedulePattern();
        this.notify('Loaded "' + item.name + '"');
    };

    P.deleteSaved = function (index) {
        var item = this.savedGenomes.splice(index, 1)[0];
        this.persist();
        this.renderSavedGenomes();
        if (item) this.notify('Deleted "' + item.name + '"');
    };

    P.renderSavedGenomes = function () {
        var box = $('savedGenomesList');
        box.textContent = '';
        if (!this.savedGenomes.length) {
            var empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'No saved ideas yet';
            box.appendChild(empty);
            return;
        }
        var self = this;
        this.savedGenomes.forEach(function (item, index) {
            var row = document.createElement('div');
            row.className = 'saved-genome-item';
            var info = document.createElement('div');
            var title = document.createElement('strong');
            title.textContent = item.name;
            var meta = document.createElement('small');
            meta.style.opacity = '0.7';
            meta.textContent = C.NOTE_NAMES[item.genome.key] + ' ' + C.SCALES[item.genome.scale].name + ' • ' +
                item.genome.bpm + ' BPM • ' + new Date(item.timestamp).toLocaleDateString();
            info.appendChild(title);
            info.appendChild(document.createElement('br'));
            info.appendChild(meta);
            var del = document.createElement('button');
            del.className = 'delete-btn';
            del.textContent = '🗑️';
            del.title = 'Delete';
            del.addEventListener('click', function (e) { e.stopPropagation(); self.deleteSaved(index); });
            row.addEventListener('click', function () { self.loadSaved(index); });
            row.appendChild(info);
            row.appendChild(del);
            box.appendChild(row);
        });
    };

    // ------------------------------------------------------------ events
    P.bindEvents = function () {
        var self = this;
        on('playButton', 'click', function () { if (self.isPlaying) self.stop(); else self.play(); });
        on('startBtn', 'click', function () { self.startEvolution(); });
        on('pauseBtn', 'click', function () { self.pauseEvolution(); });
        on('resetBtn', 'click', function () {
            if (!self.confirmDiscard()) return;
            self.pauseEvolution();
            self.resetPopulation();
            self.notify('New population created (seed ' + self.seed + ')');
        });
        on('environmentSelect', 'change', function (e) {
            self.environment = e.target.value;
            self.rescore();
            self.notify('Environment: ' + e.target.options[e.target.selectedIndex].text);
        });
        on('melodicComplexity', 'input', function (e) {
            self.complexity = Number(e.target.value);
            $('melodicValue').textContent = self.complexity;
            self.applySliders();
        });
        on('harmonicDensity', 'input', function (e) {
            self.harmonic = Number(e.target.value);
            $('harmonicValue').textContent = self.harmonic;
            self.applySliders();
        });
        on('mutationRate', 'input', function (e) {
            self.mutationRate = Number(e.target.value);
            $('mutationValue').textContent = Math.round(self.mutationRate * 100) + '%';
        });
        on('reverbAmount', 'input', function (e) {
            $('reverbValue').textContent = e.target.value + '%';
            if (self.reverb) self.reverb.wet.value = Number(e.target.value) / 100;
        });
        on('tempoControl', 'input', function (e) {
            var bpm = Number(e.target.value);
            $('tempoValue').textContent = bpm + ' BPM';
            var g = self.genome;
            if (!g) return;
            var copy = C.cloneGenome(g);
            copy.bpm = bpm;
            self.genome = copy;
            if (self.current >= 0) self.population[self.current] = C.scoreGenome(copy, self.settings());
            self.pattern.bpm = bpm;          // tempo never discards edits
            if (self.locks.bpm) self.fixed.bpm = bpm;
            if (self.audioReady) Tone.Transport.bpm.value = bpm;
            self.refresh();
        });
        on('likeButton', 'click', function () { self.rate(true); });
        on('skipButton', 'click', function () { self.rate(false); });
        on('evolveButton', 'click', function () { self.evolveOnce(); });
        on('exportMidiBtn', 'click', function () { self.exportMidi(); });
        on('enhancedMidiBtn', 'click', function () { self.exportMidiLayers(); });
        on('shareButton', 'click', function () { self.share(); });
        on('copyGenomeBtn', 'click', function () {
            var g = self.currentGenome();
            if (g) self.copyText(JSON.stringify(g, null, 2), 'Genome copied to clipboard');
        });
        on('randomizeBtn', 'click', function () { self.randomize(); });
        on('saveBtn', 'click', function () { self.saveCurrent(); });
        on('exportBtn', 'click', function () { self.exportGenomeJson(); });
        ['melody', 'bass', 'chords'].forEach(function (t) { on(t + 'Toggle', 'click', function () { self.toggleLayer(t); }); });
        ['harmony', 'rhythm', 'catchiness'].forEach(function (f) {
            on(f + 'Btn', 'click', function () {
                ['harmony', 'rhythm', 'catchiness'].forEach(function (x) { $(x + 'Btn').classList.toggle('active', x === f); });
                self.focus = f === 'catchiness' ? 'catchy' : f;
                self.rescore();
                self.notify('Fitness focus: ' + f);
            });
        });
    };

    // Sliders set the current candidate's genes to absolute values (never cumulative).
    P.applySliders = function () {
        var g = this.genome;
        if (!g || !this.confirmDiscard()) return;
        var copy = C.cloneGenome(g);
        copy.density = (this.complexity - 1) / 9;
        copy.stepwise = 1 - (this.complexity - 1) / 9 * 0.6;
        copy.chordComplexity = (this.harmonic - 1) / 9;
        this.replaceCurrent(copy);
    };


    // ------------------------------------------------------------ generator panel
    P.setupGeneratorPanel = function () {
        var fill = function (id, items, selected) {
            var sel = $(id);
            items.forEach(function (label, value) {
                var o = document.createElement('option');
                o.value = value;
                o.textContent = label;
                sel.appendChild(o);
            });
            sel.value = selected;
        };
        var pitchNames = [], pitchValues = [];
        for (var p = 36; p <= 96; p++) { pitchNames.push(C.noteName(p)); pitchValues.push(p); }
        ['melodyLow', 'melodyHigh'].forEach(function (id) {
            var sel = $(id);
            pitchValues.forEach(function (v, i) {
                var o = document.createElement('option');
                o.value = v;
                o.textContent = pitchNames[i];
                sel.appendChild(o);
            });
        });
        $('melodyLow').value = this.melodyLow;
        $('melodyHigh').value = this.melodyHigh;
        fill('keySelect', C.NOTE_NAMES, 0);
        fill('scaleSelect', C.SCALES.map(function (x) { return x.name; }), 0);
        fill('progressionSelect', C.PROGRESSIONS.map(function (x) { return x.name; }), 0);
    };

    P.bindGenerator = function () {
        var self = this;
        on('applySeed', 'click', function () {
            var v = parseInt($('sessionSeed').value, 10);
            if (!isFinite(v) || v < 0) { self.notify('Seed must be a positive whole number', 'warning'); return; }
            if (!self.confirmDiscard()) return;
            self.pauseEvolution();
            self.resetPopulation(v);
            self.notify('Population created from seed ' + self.seed);
        });
        var regenerate = function (message) {
            if (!self.confirmDiscard()) return false;
            self.resetPopulation(self.seed);
            self.notify(message);
            return true;
        };
        on('barsSelect', 'change', function (e) {
            var old = self.bars;
            self.bars = Number(e.target.value);
            if (!self.confirmDiscard()) { self.bars = old; e.target.value = old; return; }
            self.population = self.population.map(function (x) { return C.scoreGenome(x.genome, self.settings()); });
            self.selectCandidate(Math.max(0, self.current), true);
            self.notify(self.bars + ' bar(s)');
        });
        on('populationSize', 'change', function (e) {
            self.populationSize = Math.max(4, Math.min(32, Math.round(Number(e.target.value) || 20)));
            e.target.value = self.populationSize;
            regenerate(self.populationSize + ' candidates per generation');
        });
        on('maxNotesPerBar', 'change', function (e) {
            self.maxNotesPerBar = Math.max(2, Math.min(16, Math.round(Number(e.target.value) || 8)));
            e.target.value = self.maxNotesPerBar;
            self.rerenderShown('At most ' + self.maxNotesPerBar + ' melody notes per bar');
        });
        ['melodyLow', 'melodyHigh'].forEach(function (id) {
            on(id, 'change', function () {
                var lo = Number($('melodyLow').value), hi = Number($('melodyHigh').value);
                if (hi - lo < 7) { hi = lo + 7; $('melodyHigh').value = hi; }
                self.melodyLow = lo;
                self.melodyHigh = hi;
                self.rerenderShown('Melody range ' + C.noteName(lo) + ' – ' + C.noteName(hi));
            });
        });
        var lockField = function (field, selectId, checkId) {
            var apply = function () {
                self.fixed[field] = Number($(selectId).value);
                self.locks[field] = $(checkId).checked;
                if (self.locks[field] && self.genome) {
                    if (!self.confirmDiscard()) { $(checkId).checked = false; self.locks[field] = false; return; }
                    var g = C.applyLocks(self.genome, self.settings());
                    self.rescore();
                    self.showGenome(g);
                }
            };
            on(selectId, 'change', function () { if (!$(checkId).checked) $(checkId).checked = true; apply(); });
            on(checkId, 'change', apply);
        };
        lockField('key', 'keySelect', 'lockKey');
        lockField('scale', 'scaleSelect', 'lockScale');
        lockField('progression', 'progressionSelect', 'lockProgression');
        on('lockBpm', 'change', function (e) {
            self.locks.bpm = e.target.checked;
            self.fixed.bpm = self.pattern ? self.pattern.bpm : 120;
            self.rescore();
        });
    };

    // Re-renders the shown idea and the population after a limit changed.
    P.rerenderShown = function (message) {
        if (!this.confirmDiscard()) return;
        var s = this.settings();
        this.population = C.sortPopulation(this.population.map(function (x) { return C.scoreGenome(x.genome, s); }));
        if (this.genome) this.showGenome(this.genome);
        this.notify(message);
    };

    // ------------------------------------------------------------ editor
    P.bindEditor = function () {
        var self = this;
        this.roll = $('pianoRoll');
        this.rollCtx = this.roll.getContext('2d');
        Array.prototype.forEach.call(document.querySelectorAll('#trackTabs button'), function (b) {
            b.addEventListener('click', function () {
                self.track = b.dataset.track;
                Array.prototype.forEach.call(document.querySelectorAll('#trackTabs button'), function (x) {
                    x.classList.toggle('active', x === b);
                });
            });
        });
        var transpose = function (n) {
            if (self.pattern) self.editPattern(C.transposeTrack(self.pattern, self.track, n));
        };
        on('transposeDown', 'click', function () { transpose(-1); });
        on('transposeUp', 'click', function () { transpose(1); });
        on('octaveDown', 'click', function () { transpose(-12); });
        on('octaveUp', 'click', function () { transpose(12); });
        on('rerollLayer', 'click', function () {
            if (!self.genome || !self.confirmDiscard()) return;
            self.showGenome(C.rerollLayer(self.genome, self.track, (Date.now() ^ (Math.random() * 4294967296)) >>> 0));
            self.notify('New ' + self.track + ' variation — the other layers are unchanged');
        });
        on('revertEdits', 'click', function () {
            if (!self.genome || !self.isEdited()) return;
            if (!window.confirm('Discard your edits to this idea?')) return;
            self.showGenome(self.genome);
            self.notify('Edits discarded');
        });
        on('prevCandidate', 'click', function () {
            self.selectCandidate(self.current <= 0 ? self.population.length - 1 : self.current - 1);
        });
        on('nextCandidate', 'click', function () {
            self.selectCandidate((self.current + 1) % self.population.length);
        });
        this.roll.addEventListener('click', function (e) { self.rollClick(e); });
        this.bindGenerator();
    };

    P.rollRange = function () {
        if (this.track === 'melody') return [this.melodyLow - 2, this.melodyHigh + 2];
        if (this.track === 'bass') return [28, 55];
        return [48, 79];
    };

    P.rollGeometry = function () {
        var range = this.rollRange();
        var gutter = 34, w = this.roll.width, h = this.roll.height;
        var rows = range[1] - range[0] + 1;
        var totalSteps = this.pattern.bars * C.STEPS_PER_BAR;
        return { lo: range[0], hi: range[1], gutter: gutter, rowH: h / rows, stepW: (w - gutter) / totalSteps,
                 totalSteps: totalSteps, w: w, h: h };
    };

    P.rollClick = function (e) {
        if (!this.pattern) return;
        var rect = this.roll.getBoundingClientRect();
        var x = (e.clientX - rect.left) * this.roll.width / rect.width;
        var y = (e.clientY - rect.top) * this.roll.height / rect.height;
        var geo = this.rollGeometry();
        if (x < geo.gutter) return;
        var step = Math.floor((x - geo.gutter) / geo.stepW);
        var pitch = geo.hi - Math.floor(y / geo.rowH);
        if (step < 0 || step >= geo.totalSteps || pitch < geo.lo || pitch > geo.hi) return;
        var tick = step * C.STEP + Math.floor(C.STEP / 2);
        var removed = C.removeNoteAt(this.pattern, this.track, tick, pitch);
        if (removed !== this.pattern) {
            this.editPattern(removed);
        } else {
            var length = e.shiftKey ? 2 * C.STEP : C.STEP;
            this.editPattern(C.addNote(this.pattern, this.track, { pitch: pitch, start: step * C.STEP, length: length, velocity: 96 }));
            if (this.audioReady && this.synths) {
                this.synths[this.track].triggerAttackRelease(Tone.Frequency(pitch, 'midi').toFrequency(), '16n');
            }
        }
    };

    P.drawRoll = function () {
        if (!this.pattern || !this.rollCtx) return;
        var ctx = this.rollCtx, geo = this.rollGeometry();
        ctx.fillStyle = '#0c0e13';
        ctx.fillRect(0, 0, geo.w, geo.h);
        var scale = C.SCALES[this.pattern.scale].steps.map(function (x) { return (this.pattern.key + x) % 12; }, this);
        for (var p = geo.lo; p <= geo.hi; p++) {
            var y = (geo.hi - p) * geo.rowH;
            if (scale.indexOf(((p % 12) + 12) % 12) >= 0) {
                ctx.fillStyle = 'rgba(42, 169, 224, 0.06)';
                ctx.fillRect(geo.gutter, y, geo.w - geo.gutter, geo.rowH);
            }
            if (p % 12 === 0) {
                ctx.fillStyle = '#9AA1AE';
                ctx.font = '10px Segoe UI, sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(C.noteName(p), 3, y + geo.rowH - 1);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
                ctx.fillRect(geo.gutter, y + geo.rowH - 1, geo.w - geo.gutter, 1);
            }
        }
        for (var st = 0; st <= geo.totalSteps; st++) {
            var x = geo.gutter + st * geo.stepW;
            ctx.fillStyle = st % 16 === 0 ? 'rgba(127, 227, 255, 0.35)' : (st % 4 === 0 ? 'rgba(255, 255, 255, 0.10)' : 'rgba(255, 255, 255, 0.03)');
            ctx.fillRect(x, 0, 1, geo.h);
        }
        var colors = { melody: '#7FE3FF', bass: '#2AA9E0', chords: '#4dc0f0' };
        var self = this;
        var drawTrack = function (track, ghost) {
            self.pattern.tracks[track].forEach(function (n) {
                if (n.pitch < geo.lo || n.pitch > geo.hi) return;
                var nx = geo.gutter + n.start / C.STEP * geo.stepW;
                var nw = Math.max(3, n.length / C.STEP * geo.stepW - 1);
                var ny = (geo.hi - n.pitch) * geo.rowH;
                ctx.globalAlpha = ghost ? 0.18 : 0.55 + n.velocity / 127 * 0.45;
                ctx.fillStyle = colors[track];
                ctx.fillRect(nx, ny + 1, nw, Math.max(2, geo.rowH - 2));
                ctx.globalAlpha = 1;
            });
        };
        C.TRACKS.forEach(function (t) { if (t !== self.track) drawTrack(t, true); });
        drawTrack(this.track, false);
        if (this.isPlaying && this.audioReady) {
            var loop = this.pattern.bars * C.BAR;
            var px = geo.gutter + (Tone.Transport.ticks % loop) / C.STEP * geo.stepW;
            ctx.fillStyle = '#F2F4F8';
            ctx.fillRect(px, 0, 2, geo.h);
        }
    };

    P.renderChordRow = function () {
        var row = $('chordRow');
        if (!this.pattern || !this.genome) return;
        var g = this.genome, bars = this.pattern.bars;
        row.style.gridTemplateColumns = 'repeat(' + bars + ', 1fr)';
        row.style.marginLeft = 'calc(34 / 1100 * 100%)';
        var key = [g.key, g.scale, bars, this.pattern.chords.map(function (c) { return c.degree + ':' + c.pcs.length; }).join(',')].join('|');
        if (row.dataset.key === key) return;
        row.dataset.key = key;
        row.textContent = '';
        var self = this;
        this.pattern.chords.forEach(function (ch, bar) {
            var sel = document.createElement('select');
            sel.title = 'Chord of bar ' + (bar + 1);
            for (var d = 0; d < 7; d++) {
                var pcs = C.chordPitchClasses(g.key, g.scale, d, false);
                var o = document.createElement('option');
                o.value = d;
                o.textContent = (bar + 1) + ': ' + C.NOTE_NAMES[pcs[0]] + C.chordQualityName(pcs);
                sel.appendChild(o);
            }
            sel.value = ch.degree;
            sel.addEventListener('change', function () {
                if (!self.confirmDiscard()) { sel.value = ch.degree; return; }
                self.showGenome(C.setChordOverride(self.genome, bar, Number(sel.value)));
                self.notify('Bar ' + (bar + 1) + ' chord changed');
            });
            row.appendChild(sel);
        });
    };

    window.addEventListener('DOMContentLoaded', function () {
        window.melodyForge = new MelodyForgeApp();
    });
}());
