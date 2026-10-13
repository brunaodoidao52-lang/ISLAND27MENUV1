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
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(page_url);
await page.waitForTimeout(500);
check(await page.evaluate(() => typeof melodyForge === 'object' && melodyForge.population.length === 20),
      'app initialises (global defined, 20 candidates)');
check(errors.length === 0, 'no console errors on load', errors.join(' | '));

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

// environment
await page.selectOption('#environmentSelect', 'dance');
check(await page.evaluate(() => melodyForge.settings().chordRhythm === 'stabs'), 'environment changes the generator settings');

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
check(await page.evaluate(() => Object.keys({ ambient: 1, dance: 1, jazz: 1, classical: 1, lofi: 1, electronic: 1, experimental: 1 })
      .includes(document.getElementById('environmentSelect').value)), 'Randomize picks a valid environment');

check(errors.length === 0, 'no console errors during the whole session', errors.join(' | '));
console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'} — files in ${outDir}`);
await browser.close();
process.exit(failures ? 1 : 0);
