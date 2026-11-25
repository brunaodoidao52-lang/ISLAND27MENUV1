// Fluxo completo com FFmpeg de verdade: pasta de entrada -> vídeos -> horário -> YouTube agendado -> Reels na hora.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Engine, pairFiles } = require('../src/main/engine');
const { createStore } = require('../src/main/store');
const ff = require('../src/main/ffmpeg');
const { renderLoop } = require('../src/main/pipeline');
const { makeBeat, makeCover } = require('./fixtures');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'i27eng-'));
const waitFor = async (cond, ms = 240000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('tempo esgotado');
    await new Promise((r) => setTimeout(r, 100));
  }
};

test('junta beat e capa pelo nome', () => {
  const r = pairFiles(['/a/Noite.mp3', '/a/Noite.jpg', '/a/Noite.txt', '/a/Sol.wav', '/a/Sol-capa.png', '/a/Lua.mp3']);
  assert.strictEqual(r.pairs.length, 2);
  assert.deepStrictEqual(r.pairs[0], { audio: '/a/Noite.mp3', image: '/a/Noite.jpg', txt: '/a/Noite.txt' });
  assert.match(r.errors[0], /Falta a capa de "Lua.mp3"/);
});

test('análise acha o BPM e o drop', async () => {
  const beat = await makeBeat(path.join(tmp, 'b140.mp3'), { bpm: 140, intro: 16, total: 60 });
  const a = await ff.analyze(beat);
  assert.strictEqual(a.bpm, 140);
  assert.ok(a.dropStart >= 15.5 && a.dropStart <= 17, `drop em ${a.dropStart}`);
});

test('piloto automático: pasta de entrada até a publicação', { timeout: 600000 }, async () => {
  const inbox = path.join(tmp, 'entrada');
  fs.mkdirSync(inbox);
  await makeBeat(path.join(inbox, 'Noite Fria.mp3'), { bpm: 140, intro: 6, total: 20 });
  await makeCover(path.join(inbox, 'Noite Fria.jpg'));
  fs.writeFileSync(path.join(inbox, 'Noite Fria.txt'), 'artista: Veigh\ngenero: Trap\ntom: Cm');
  const old = new Date(Date.now() - 10000);
  for (const f of fs.readdirSync(inbox)) fs.utimesSync(path.join(inbox, f), old, old);

  let clock = new Date('2026-11-25T10:00:00');
  const store = createStore(path.join(tmp, 'dados.json'));
  store.setSettings({ inbox, autopilot: true, simulation: true, slots: ['12:00', '18:00'], reelLength: 8 });
  const engine = new Engine({ store, dirs: { workDir: path.join(tmp, 'work'), outDir: () => path.join(tmp, 'saida') }, now: () => clock });

  const added = await engine.scanInbox();
  assert.strictEqual(added.length, 1);
  const id = added[0].id;
  assert.ok(fs.existsSync(path.join(inbox, 'importados')), 'arquivos movidos para "importados"');
  assert.strictEqual(store.item(id).artista, 'Veigh');

  await waitFor(() => store.item(id).render.status !== 'aguardando' && store.item(id).render.status !== 'gerando');
  const it = store.item(id);
  assert.strictEqual(it.render.status, 'pronto', it.render.error);
  assert.strictEqual(it.bpm, 140);
  assert.match(it.texts.ytTitle, /Veigh Type Beat/);
  for (const f of Object.values(it.outputs)) assert.ok(fs.statSync(f).size > 1000, f);
  const yt = await ff.probe(it.outputs.youtube);
  const reels = await ff.probe(it.outputs.reels);
  assert.deepStrictEqual([yt.width, yt.height], [1920, 1080]);
  assert.deepStrictEqual([reels.width, reels.height], [1080, 1920]);
  assert.ok(Math.abs(yt.duration - 20) < 0.3, `YouTube com o beat inteiro (${yt.duration})`);
  assert.ok(Math.abs(reels.duration - 8) < 0.3, `Reels com o trecho (${reels.duration})`);

  // piloto automático marcou o próximo horário (12:00) e o YouTube já sobe agendado
  assert.strictEqual(new Date(it.when).getHours(), 12);
  await waitFor(() => store.item(id).yt.status === 'agendado');
  engine.tick();
  assert.strictEqual(store.item(id).ig.status, 'pendente', 'Instagram espera a hora');

  clock = new Date('2026-11-25T12:00:30');
  engine.tick();
  await waitFor(() => store.item(id).ig.status === 'publicado');
  assert.strictEqual(store.item(id).yt.status, 'publicado');
  engine.stop();
});

test('loop da capa emenda sem pulo', { timeout: 120000 }, async () => {
  const img = await makeCover(path.join(tmp, 'capa.png'));
  const out = path.join(tmp, 'loop.mp4');
  await renderLoop({ image: img, out, workDir: tmp, format: '9:16', seconds: 3, style: 'drift' });
  const info = await ff.probe(out);
  assert.deepStrictEqual([info.width, info.height], [1080, 1920]);
  assert.ok(Math.abs(info.duration - 3) < 0.1);
});
