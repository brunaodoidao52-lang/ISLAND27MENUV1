// End-to-end test of the web app in Chromium (Playwright).
// Usage: node melodyforge/tests/e2e.mjs [outputDir]   (exported files are written there)
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const page_url = pathToFileURL(path.join(here, '..', 'melodyforge-ultimate.html')).href;
const outDir = process.argv[2] || fs.mkdtempSync('/tmp/mf-e2e-');
const executablePath = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

let failures = 0;
const check = (ok, what, extra = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? ' — ' + extra : ''}`);
    if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath, args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
page.on('dialog', d => d.accept());   // "discard your edits?" confirmations
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(page_url);
await page.waitForTimeout(500);
check(await page.evaluate(() => typeof melodyForge === 'object' && melodyForge.population.length === 20),
      'app initialises (global defined, 20 candidates)');
check(errors.length === 0, 'no console errors on load', errors.join(' | '));

// ---------------------------------------------------------------- phase 4: modes
check(await page.evaluate(() => document.body.classList.contains('beginner')), 'first visit opens in Beginner mode');
const hiddenInBeginner = await page.evaluate(() => ['startBtn', 'generatorPanel', 'diversityScore', 'transposeUp', 'chordRow', 'mutationRate']
    .every(id => document.getElementById(id).offsetParent === null));
const visibleInBeginner = await page.evaluate(() => ['generateBtn', 'styleSelect', 'moodSelect', 'quickKey', 'playButton', 'likeButton',
    'skipButton', 'exportMidiBtn', 'pianoRoll', 'melodicComplexity'].every(id => document.getElementById(id).offsetParent !== null));
check(hiddenInBeginner, 'Beginner mode hides the advanced controls');
check(visibleInBeginner, 'Beginner mode keeps style, mood, generate, play, like/skip, editor and export');
await page.click('#modeAdvanced');
check(await page.evaluate(() => document.getElementById('startBtn').offsetParent !== null), 'Advanced mode shows every control');
await page.reload();
await page.waitForTimeout(400);
check(await page.evaluate(() => document.body.classList.contains('advanced')), 'chosen mode is remembered after reload');
await page.mouse.click(5, 5);
await page.waitForTimeout(400);

// audio unlock + playback
await page.mouse.click(5, 5);
await page.waitForTimeout(600);
check(await page.evaluate(() => melodyForge.audioReady), 'audio unlocks on first click');
const playback = await page.evaluate(async () => {
    const counts = { melody: 0, bass: 0, chords: 0 };
    for (const t of Object.keys(counts)) {
        const orig = melodyForge.synths[t].triggerAttackRelease.bind(melodyForge.synths[t]);
        melodyForge.synths[t].triggerAttackRelease = (...a) => { counts[t]++; return orig(...a); };
    }
    melodyForge.play();
    await new Promise(r => setTimeout(r, 2500));
    const expected = { melody: 0, bass: 0, chords: 0 };
    const secPerTick = 60 / (melodyForge.pattern.bpm * 480);
    for (const t of Object.keys(expected)) {
        expected[t] = melodyForge.pattern.tracks[t].filter(n => n.start * secPerTick < 2.4).length;
    }
    return { counts, expected, playing: Tone.Transport.state };
});
check(playback.playing === 'started', 'transport starts');
check(['melody', 'bass', 'chords'].every(t => playback.counts[t] > 0), 'all three layers trigger notes', JSON.stringify(playback.counts));
check(['melody', 'bass', 'chords'].every(t => Math.abs(playback.counts[t] - playback.expected[t]) <= 4),
      'played notes match the pattern', JSON.stringify(playback.expected));

// tempo changes the musical grid (beats), not just note lengths
const grid = await page.evaluate(() => {
    const at = bpm => { Tone.Transport.bpm.value = bpm; return Tone.Ticks(1920).toSeconds(); };
    return { bar120: at(120), bar60: at(60) };
});
check(Math.abs(grid.bar120 - 2) < 1e-6 && Math.abs(grid.bar60 - 4) < 1e-6, 'one bar lasts 2 s at 120 BPM and 4 s at 60 BPM', JSON.stringify(grid));

// layer mute
const muted = await page.evaluate(async () => {
    melodyForge.toggleLayer('melody');
    let n = 0;
    const orig = melodyForge.synths.melody.triggerAttackRelease;
    melodyForge.synths.melody.triggerAttackRelease = (...a) => { n++; return orig(...a); };
    await new Promise(r => setTimeout(r, 1500));
    melodyForge.toggleLayer('melody');
    return n;
});
check(muted === 0, 'muted melody layer plays nothing');
await page.evaluate(() => melodyForge.stop());

// evolution
const evo = await page.evaluate(() => {
    const before = { gen: melodyForge.generation, div: melodyForge.population.length };
    for (let i = 0; i < 15; i++) melodyForge.evolveOnce();
    const p = melodyForge.population;
    return { gen: melodyForge.generation, best: p[0].fitness, avg: p.reduce((a, x) => a + x.fitness, 0) / p.length,
             div: Number(document.getElementById('diversityScore').textContent),
             bpms: p.map(x => x.genome.bpm), keys: p.map(x => x.genome.key) };
});
check(evo.gen === 15, 'Evolve runs one generation per click');
check(evo.bpms.every(b => b >= 60 && b <= 180 && Number.isInteger(b)), 'tempos stay valid after evolution', evo.bpms.join(','));
check(evo.keys.every(k => k >= 0 && k <= 11 && Number.isInteger(k)), 'keys stay valid after evolution');
check(evo.div > 0, 'diversity is computed', String(evo.div));

await page.click('#startBtn');
await page.waitForTimeout(3400);
const auto = await page.evaluate(() => melodyForge.generation);
await page.click('#pauseBtn');
await page.waitForTimeout(3200);
check(auto === 16 && await page.evaluate(() => melodyForge.generation) === 16, 'Start evolves every 3 s and Pause stops it');

// like / skip
const rating = await page.evaluate(() => {
    const i0 = melodyForge.current, f0 = melodyForge.currentEntry().fitness;
    melodyForge.rate(true);
    const f1 = melodyForge.currentEntry().fitness;
    melodyForge.rate(false);
    return { liked: f1 > f0, skippedTo: melodyForge.current, from: i0 };
});
check(rating.liked, 'Like raises the candidate fitness');
check(rating.skippedTo !== rating.from, 'Skip moves to another candidate');

// sliders are absolute
const slider = await page.evaluate(() => {
    const el = document.getElementById('melodicComplexity');
    el.value = 2; el.dispatchEvent(new Event('input'));
    el.value = 2; el.dispatchEvent(new Event('input'));
    el.value = 2; el.dispatchEvent(new Event('input'));
    return melodyForge.currentGenome().density;
});
check(Math.abs(slider - 1 / 9) < 1e-9, 'complexity slider is not cumulative', String(slider));

// style preset changes the generator
await page.selectOption('#styleSelect', '5');   // Funk BR
check(await page.evaluate(() => melodyForge.settings().chordRhythm === 'stabs'), 'style preset changes the generator settings');

// harmony shown is diatonic
const chords = await page.evaluate(() => {
    const C = MFCore;
    const g = C.cloneGenome(melodyForge.currentGenome());
    g.key = 0; g.scale = 0; g.progression = 0; g.chordComplexity = 0;
    return C.render(g, melodyForge.settings()).chords.map(c => c.name).join(' ');
});
check(chords === 'C F G C', 'C major I-IV-V-I renders C F G C', chords);

// exports
const grab = async (selector, count) => {
    const files = [];
    const handler = d => files.push(d);
    page.on('download', handler);
    await page.click(selector);
    for (let i = 0; i < 40 && files.length < count; i++) await page.waitForTimeout(100);
    page.off('download', handler);
    const out = [];
    for (const d of files) { const target = path.join(outDir, d.suggestedFilename()); await d.saveAs(target); out.push(target); }
    return out;
};
const mid = await grab('#exportMidiBtn', 1);
check(mid.length === 1 && mid[0].endsWith('.mid') && fs.readFileSync(mid[0]).subarray(0, 4).toString() === 'MThd',
      'Export MIDI downloads a Standard MIDI File', mid.map(f => path.basename(f)).join(','));
const layers = await grab('#enhancedMidiBtn', 3);
check(layers.length === 3, 'Enhanced MIDI downloads one file per layer', layers.map(f => path.basename(f)).join(','));
const json = await grab('#exportBtn', 1);
check(json.length === 1 && JSON.parse(fs.readFileSync(json[0], 'utf8')).genome.seeds !== undefined, 'Export saves the idea as JSON');
fs.writeFileSync(path.join(outDir, 'pattern.json'), JSON.stringify(await page.evaluate(() => melodyForge.pattern)));

// share link round trip
await page.click('#shareButton');
await page.waitForTimeout(300);
const link = await page.evaluate(() => navigator.clipboard.readText());
const sharedGenome = await page.evaluate(() => JSON.stringify(melodyForge.currentGenome()));
check(link.includes('?g='), 'Share copies a link', link.slice(0, 60) + '…');
const page2 = await context.newPage();
await page2.goto(link);
await page2.waitForTimeout(500);
check(await page2.evaluate(() => JSON.stringify(melodyForge.currentGenome())) === sharedGenome, 'shared link restores the same idea');
await page2.close();

// copy genome
await page.click('#copyGenomeBtn');
await page.waitForTimeout(300);
check(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).seeds !== undefined, 'Copy Genome copies JSON');

// library survives a reload, load and delete work
await page.fill('#genomeName', 'Ideia <b>teste</b>');
await page.click('#saveBtn');
await page.reload();
await page.waitForTimeout(500);
check(await page.locator('.saved-genome-item strong').first().textContent() === 'Ideia <b>teste</b>',
      'saved ideas are listed after reload (name shown as text, no HTML injection)');
await page.locator('.saved-genome-item').first().click();
check(await page.evaluate(() => melodyForge.currentGenome() !== null), 'clicking a saved idea loads it');
await page.locator('.delete-btn').first().click();
check(await page.locator('.saved-genome-item').count() === 0, 'delete removes the saved idea');

await page.click('#randomizeBtn');
check(await page.evaluate(() => melodyForge.style >= 1 && melodyForge.style < MFCore.STYLES.length && melodyForge.mood < MFCore.MOODS.length),
      'Randomize picks a valid style and mood');


// ---------------------------------------------------------------- phase 2: seeds, limits, editor
const seedRun = async seed => {
    await page.fill('#sessionSeed', String(seed));
    await page.click('#applySeed');
    return page.evaluate(() => JSON.stringify(melodyForge.population.map(x => x.genome)));
};
const s1 = await seedRun(12345), s2 = await seedRun(999), s3 = await seedRun(12345);
check(s1 === s3 && s1 !== s2, 'same session seed recreates the same candidates');

await page.fill('#maxNotesPerBar', '3');
await page.dispatchEvent('#maxNotesPerBar', 'change');
await page.selectOption('#melodyLow', '72');
await page.selectOption('#melodyHigh', '84');
const limits = await page.evaluate(() => {
    const p = melodyForge.pattern, counts = new Array(p.bars).fill(0);
    p.tracks.melody.forEach(n => counts[Math.floor(n.start / 1920)]++);
    const all = melodyForge.population.map(x => MFCore.render(x.genome, melodyForge.settings()));
    return { maxPerBar: Math.max(...counts), lo: Math.min(...all.flatMap(q => q.tracks.melody.map(n => n.pitch))),
             hi: Math.max(...all.flatMap(q => q.tracks.melody.map(n => n.pitch))) };
});
check(limits.maxPerBar <= 3, 'max melody notes per bar is respected', String(limits.maxPerBar));
check(limits.lo >= 72 && limits.hi <= 84, 'melody range limit is respected', limits.lo + '..' + limits.hi);
await page.fill('#maxNotesPerBar', '8');
await page.dispatchEvent('#maxNotesPerBar', 'change');

// click on the piano roll: add then remove a note
await page.locator('#pianoRoll').scrollIntoViewIfNeeded();
const cell = await page.evaluate(() => {
    const app = melodyForge, geo = app.rollGeometry(), rect = app.roll.getBoundingClientRect();
    const taken = new Set(app.pattern.tracks.melody.flatMap(n => {
        const out = [];
        for (let t = n.start; t < n.start + n.length; t += 120) out.push(Math.floor(t / 120) + ':' + n.pitch);
        return out;
    }));
    for (let step = 0; step < geo.totalSteps; step++) for (let pitch = geo.lo + 3; pitch < geo.hi - 3; pitch++) {
        if (!taken.has(step + ':' + pitch)) {
            const x = (geo.gutter + (step + 0.5) * geo.stepW) * rect.width / app.roll.width + rect.left;
            const y = ((geo.hi - pitch + 0.5) * geo.rowH) * rect.height / app.roll.height + rect.top;
            return { x, y, step, pitch, before: app.pattern.tracks.melody.length };
        }
    }
});
await page.mouse.click(cell.x, cell.y);
const afterAdd = await page.evaluate(c => {
    const n = melodyForge.pattern.tracks.melody.find(n => n.pitch === c.pitch && n.start === c.step * 120);
    return { count: melodyForge.pattern.tracks.melody.length, found: !!n, edited: melodyForge.isEdited(),
             badge: document.getElementById('editorSection').classList.contains('edited') };
}, cell);
check(afterAdd.count === cell.before + 1 && afterAdd.found && afterAdd.edited && afterAdd.badge, 'clicking the piano roll adds a note and marks the idea edited');
const evolvedKeepsEdit = await page.evaluate(() => {
    const before = JSON.stringify(melodyForge.pattern);
    melodyForge.evolveOnce();
    return JSON.stringify(melodyForge.pattern) === before && melodyForge.current === -1;
});
check(evolvedKeepsEdit, 'evolution never overwrites an idea being edited');
const midAfterEdit = await page.evaluate(() => {
    const bytes = MFCore.toMidi(melodyForge.pattern);
    let ons = 0;
    for (let i = 0; i < bytes.length - 2; i++) if ((bytes[i] & 0xF0) === 0x90 && bytes[i - 1] !== 0xFF) ons++;
    return { ons, notes: MFCore.TRACKS.reduce((a, t) => a + melodyForge.pattern.tracks[t].length, 0) };
});
check(midAfterEdit.ons >= midAfterEdit.notes, 'MIDI export includes the edited notes');
await page.mouse.click(cell.x, cell.y);
check(await page.evaluate(c => melodyForge.pattern.tracks.melody.length === c.before, cell), 'clicking a note removes it');

// save an edited idea and load it back
await page.mouse.click(cell.x, cell.y);
const editedJson = await page.evaluate(() => JSON.stringify(melodyForge.pattern.tracks));
await page.fill('#genomeName', 'edited idea');
await page.click('#saveBtn');
await page.click('#nextCandidate');
await page.locator('.saved-genome-item').last().click();
check(await page.evaluate(() => JSON.stringify(melodyForge.pattern.tracks)) === editedJson, 'saved edited idea loads with its edits');
await page.locator('.delete-btn').last().click();

// revert, transpose, re-roll a layer, change a chord
await page.click('#revertEdits');
check(await page.evaluate(() => !melodyForge.isEdited()), 'Revert discards the edits');
await page.click('#trackTabs button[data-track="bass"]');
const bassBefore = await page.evaluate(() => melodyForge.pattern.tracks.bass.map(n => n.pitch));
await page.click('#transposeUp');
check(await page.evaluate(b => melodyForge.pattern.tracks.bass.every((n, i) => n.pitch === b[i] + 1), bassBefore), 'transpose moves only the selected layer');
await page.click('#revertEdits');
await page.click('#trackTabs button[data-track="melody"]');
const reroll = await page.evaluate(() => {
    const p = melodyForge.pattern;
    document.getElementById('rerollLayer').click();
    const q = melodyForge.pattern;
    return { bass: JSON.stringify(p.tracks.bass) === JSON.stringify(q.tracks.bass),
             chords: JSON.stringify(p.tracks.chords) === JSON.stringify(q.tracks.chords),
             melody: JSON.stringify(p.tracks.melody) !== JSON.stringify(q.tracks.melody) };
});
check(reroll.bass && reroll.chords && reroll.melody, 'New variation re-rolls only the selected layer');
const chordChange = await page.evaluate(() => {
    const sel = document.querySelectorAll('#chordRow select')[1];
    const target = (Number(sel.value) + 2) % 7;
    sel.value = target;
    sel.dispatchEvent(new Event('change'));
    return { degree: melodyForge.pattern.chords[1].degree, target, first: melodyForge.pattern.chords[0].degree };
});
check(chordChange.degree === chordChange.target, 'chord selector changes the chord of that bar');

// locks
await page.selectOption('#keySelect', '7');
await page.selectOption('#scaleSelect', '1');
const locked = await page.evaluate(() => { for (let i = 0; i < 5; i++) melodyForge.evolveOnce();
    return melodyForge.population.every(x => x.genome.key === 7 && x.genome.scale === 1) && melodyForge.genome.key === 7; });
check(locked, 'locked key and scale hold across generations');


// ---------------------------------------------------------------- phase 4: presets
const presetRun = async (style, mood) => {
    await page.selectOption('#styleSelect', String(style));
    await page.selectOption('#moodSelect', String(mood));
    return page.evaluate(() => melodyForge.population.map(x => ({ bpm: x.genome.bpm, scale: x.genome.scale, prog: x.genome.progression })));
};
await page.selectOption('#quickKey', '0');
await page.evaluate(() => { const l = document.getElementById('lockScale'); if (l.checked) { l.checked = false; l.dispatchEvent(new Event('change')); } });   // locks win over moods
const trapSad = await presetRun(1, 2);
check(trapSad.every(x => [1, 2, 4].includes(x.scale)), 'Sad mood: every candidate uses a minor-family scale', trapSad.map(x => x.scale).join(','));
check(trapSad.every(x => [2, 5, 6].includes(x.prog)), 'Sad mood: progressions come from the mood list');
check(trapSad.every(x => x.bpm >= 130 && x.bpm <= 160), 'Trap style: tempos between 130 and 160 BPM', trapSad.map(x => x.bpm).join(','));
const evolvedPreset = await page.evaluate(() => { for (let i = 0; i < 8; i++) melodyForge.evolveOnce();
    return melodyForge.population.every(x => [1, 2, 4].includes(x.genome.scale) && [2, 5, 6].includes(x.genome.progression)); });
check(evolvedPreset, 'evolution stays inside the mood scales and progressions');
const lofiHappy = await presetRun(2, 1);
check(lofiHappy.every(x => [0, 3, 5].includes(x.scale) && x.bpm >= 70 && x.bpm <= 90), 'Lo-fi + Happy: major scales at 70-90 BPM');
check(await page.evaluate(() => document.getElementById('presetHint').textContent.includes('70-90 BPM')), 'preset hint explains the style');
await page.selectOption('#quickKey', '10');   // A
check(await page.evaluate(() => melodyForge.population.every(x => x.genome.key === 9) && melodyForge.genome.key === 9),
      'Quick start key locks every candidate to A');
await page.selectOption('#quickKey', '0');
const seedBefore = await page.evaluate(() => melodyForge.seed);
await page.click('#generateBtn');
check(await page.evaluate(s => melodyForge.seed !== s && melodyForge.generation === 0, seedBefore), 'Generate ideas creates a fresh population');
const sharedPreset = await page.evaluate(() => { melodyForge.setPreset(4, 3); return melodyForge.style * 10 + melodyForge.mood; });
await page.click('#shareButton');
await page.waitForTimeout(300);
const presetLink = await page.evaluate(() => navigator.clipboard.readText());
const page3 = await context.newPage();
await page3.goto(presetLink);
await page3.waitForTimeout(500);
check(await page3.evaluate(() => melodyForge.style * 10 + melodyForge.mood) === sharedPreset, 'shared link keeps the style and mood');
await page3.close();

check(errors.length === 0, 'no console errors during the whole session', errors.join(' | '));
console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'} — files in ${outDir}`);
await browser.close();
process.exit(failures ? 1 : 0);
