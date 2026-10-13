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
        this.current = 0;
        this.pattern = null;
        this.layers = { melody: true, bass: true, chords: true };
        this.isRunning = false;
        this.evolveTimer = null;
        this.audioReady = false;
        this.isPlaying = false;
        this.savedGenomes = this.loadSavedGenomes();

        this.setupVisualizer();
        this.bindEvents();
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
            bars: 4, populationSize: 20, eliteRatio: 0.3, mutationRate: this.mutationRate,
            focus: this.focus, chordRhythm: env.chordRhythm, targets: env.targets,
            bpmRange: env.bpmRange, geneRanges: ranges
        });
    };

    P.currentEntry = function () { return this.population[this.current] || null; };
    P.currentGenome = function () { var e = this.currentEntry(); return e ? e.genome : null; };

    // ------------------------------------------------------------ evolution
    P.resetPopulation = function () {
        this.generation = 0;
        this.seed = (this.seed + 0x9E3779B9) >>> 0;
        this.population = C.createPopulation(this.settings(), this.seed);
        this.selectCandidate(0);
    };

    P.rescore = function () {
        var s = this.settings();
        var keep = this.currentGenome();
        this.population = C.sortPopulation(this.population.map(function (x) { return C.scoreGenome(x.genome, s); }));
        var idx = this.population.findIndex(function (x) { return x.genome === keep; });
        this.selectCandidate(idx < 0 ? 0 : idx);
    };

    P.evolveOnce = function () {
        this.generation++;
        this.population = C.evolve(this.population, this.settings(), (this.seed + this.generation * 7919) >>> 0);
        this.selectCandidate(0);
        this.notify('Generation ' + this.generation + ' evolved');
    };

    P.selectCandidate = function (index) {
        this.current = Math.max(0, Math.min(index, this.population.length - 1));
        var g = this.currentGenome();
        this.pattern = g ? C.render(g, this.settings()) : null;
        if (g) {
            $('tempoControl').value = g.bpm;
            $('tempoValue').textContent = g.bpm + ' BPM';
        }
        this.updateStats();
        this.updateGenomeDisplay();
        if (this.isPlaying) this.schedulePattern();
    };

    // Replaces the current candidate's genome (after a slider/tempo edit) and re-scores it.
    P.replaceCurrent = function (genome) {
        this.population[this.current] = C.scoreGenome(genome, this.settings());
        this.selectCandidate(this.current);
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
        var g = this.currentGenome();
        if (!g) return;
        var copy = C.cloneGenome(g);
        copy.userScore = Math.max(-1, Math.min(1, (copy.userScore || 0) + (liked ? 0.5 : -0.5)));
        this.population[this.current] = C.scoreGenome(copy, this.settings());
        if (liked) {
            this.selectCandidate(this.current);
            this.notify('Liked! This idea will be favoured by evolution');
        } else {
            this.selectCandidate((this.current + 1) % this.population.length);
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
        var e = this.currentEntry();
        if (!e || !this.pattern) return;
        var g = e.genome, b = e.breakdown;
        $('scaleInfo').textContent = C.NOTE_NAMES[g.key] + ' ' + C.SCALES[g.scale].name;
        $('tempoInfo').textContent = g.bpm + ' BPM';
        $('patternInfo').textContent = this.pattern.chords.map(function (c) { return c.name; }).join(' – ') +
            '  (candidate ' + (this.current + 1) + '/' + this.population.length + ')';
        $('melodicBar').style.width = (b.melodic * 100) + '%';
        $('harmonicBar').style.width = (b.harmonic * 100) + '%';
        $('rhythmicBar').style.width = (b.rhythmic * 100) + '%';
        $('overallBar').style.width = (e.fitness * 100) + '%';
    };

    P.setupVisualizer = function () {
        var box = $('visualizer');
        this.bars = [];
        for (var i = 0; i < 20; i++) {
            var bar = document.createElement('div');
            bar.className = 'visualizer-bar';
            bar.style.height = '10px';
            box.appendChild(bar);
            this.bars.push(bar);
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
        var ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
        ctx.fillStyle = '#0c0e13';
        ctx.fillRect(0, 0, w, h);
        if (this.isPlaying && this.audioReady) {
            var spec = this.fft.getValue();
            for (var i = 0; i < this.bars.length; i++) {
                var db = spec[i + 1];
                var height = Math.max(6, Math.min(110, (db + 100) * 1.2));
                this.bars[i].style.height = height + 'px';
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
            this.bars.forEach(function (b) { b.style.height = '10px'; });
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
                     pattern: this.pattern, fitness: this.currentEntry().breakdown };
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
            this.population.length = Math.min(this.population.length, 20);
            this.selectCandidate(0);
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
                                 generation: this.generation, timestamp: Date.now() });
        this.persist();
        this.renderSavedGenomes();
        $('genomeName').value = '';
        this.notify('Saved "' + name + '"');
    };

    P.loadSaved = function (index) {
        var item = this.savedGenomes[index];
        if (!item) return;
        if (ENVIRONMENTS[item.environment]) { this.environment = item.environment; $('environmentSelect').value = item.environment; }
        this.population[this.current] = C.scoreGenome(C.cloneGenome(item.genome), this.settings());
        this.selectCandidate(this.current);
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
            self.pauseEvolution();
            self.resetPopulation();
            self.notify('New population created');
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
            var g = self.currentGenome();
            if (!g) return;
            var copy = C.cloneGenome(g);
            copy.bpm = bpm;
            self.population[self.current] = C.scoreGenome(copy, self.settings());
            self.pattern = C.render(copy, self.settings());
            if (self.audioReady) Tone.Transport.bpm.value = bpm;
            self.updateGenomeDisplay();
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
        var g = this.currentGenome();
        if (!g) return;
        var copy = C.cloneGenome(g);
        copy.density = (this.complexity - 1) / 9;
        copy.stepwise = 1 - (this.complexity - 1) / 9 * 0.6;
        copy.chordComplexity = (this.harmonic - 1) / 9;
        this.replaceCurrent(copy);
    };

    window.addEventListener('DOMContentLoaded', function () {
        window.melodyForge = new MelodyForgeApp();
    });
}());
