// Testes de ponta a ponta da exportação: gera mídias de exemplo com o FFmpeg, exporta e confere o resultado.
const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('../src/shared/project');
const ff = require('../src/main/ffmpeg');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i27-test-'));
const media = {};

async function make(name, args) {
  const out = path.join(dir, name);
  const { code, stderr } = await ff.run(['-y', '-hide_banner', ...args, out]);
  assert.strictEqual(code, 0, stderr);
  return out;
}

before(async () => {
  media.wide = await make('wide.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=5', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-shortest']);
  media.tall = await make('tall.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=25:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p']);
  media.photo = await make('photo.png', ['-f', 'lavfi', '-i', 'testsrc=size=800x600', '-frames:v', '1']);
  media.music = await make('music.m4a', ['-f', 'lavfi', '-i', 'sine=frequency=220:duration=3']);
  media.overlay = await make('overlay.png', ['-f', 'lavfi', '-i', 'color=c=red@0.5:size=360x640,format=rgba', '-frames:v', '1']);
});

async function clipFor(file) {
  const info = await ff.probe(file);
  return P.newClip({ ...info, url: file });
}

test('probe identifica vídeo, foto e áudio', async () => {
  const v = await ff.probe(media.wide);
  assert.strictEqual(v.type, 'video');
  assert.strictEqual(v.width, 640);
  assert.ok(v.hasAudio);
  assert.ok(Math.abs(v.duration - 5) < 0.1);
  assert.strictEqual((await ff.probe(media.photo)).type, 'image');
  assert.strictEqual((await ff.probe(media.music)).type, 'audio');
});

test('layout desconta a sobreposição das transições', async () => {
  const p = P.newProject();
  p.clips.push(await clipFor(media.wide), await clipFor(media.tall));
  p.clips[0].transition = { type: 'fade', duration: 1 };
  const { items, total } = P.layout(p);
  assert.ok(Math.abs(total - 8) < 0.05);
  assert.ok(Math.abs(items[1].start - 4) < 0.05);
});

test('exporta projeto completo com todos os recursos', async () => {
  const p = P.newProject();
  p.ratio = '9:16';
  const a = await clipFor(media.wide);
  a.in = 1;
  a.out = 5;
  a.speed = 2; // 2 s
  a.filter = 'vintage';
  a.adjust.warmth = 0.3;
  a.transition = { type: 'slideleft', duration: 0.5 };
  const b = await clipFor(media.tall);
  b.reverse = true;
  b.rotate = 90;
  b.flipH = true;
  b.fit = 'fill';
  b.zoom = 1.5;
  b.panX = -0.5;
  b.transition = { type: 'circleopen', duration: 0.5 };
  const c = await clipFor(media.photo);
  c.out = 2;
  const d = await clipFor(media.wide);
  d.out = 1.5;
  d.volume = 1.8;
  p.clips.push(a, b, c, d);
  p.background = { type: 'color', color: '#ff00aa' };
  const m = P.newAudio({ ...(await ff.probe(media.music)), url: '' }, 0.5);
  m.loop = true;
  m.len = 6;
  m.fadeIn = 1;
  m.fadeOut = 1;
  p.audio.push(m);

  const expected = P.totalDuration(p); // 2 + 4 + 2 + 1.5 - 0.5 - 0.5 = 8.5
  assert.ok(Math.abs(expected - 8.5) < 0.01);
  const output = path.join(dir, 'out.mp4');
  const job = ff.runExport(p, {
    output, width: 360, height: 640, fps: 30, crf: 30, preset: 'ultrafast', workDir: dir,
    overlays: [{ path: media.overlay, start: 1, end: 3, fade: true }],
  }, () => {});
  await job.done;
  const info = await ff.probe(output);
  assert.strictEqual(info.width, 360);
  assert.strictEqual(info.height, 640);
  assert.ok(info.hasAudio);
  assert.ok(Math.abs(info.duration - expected) < 0.15, `duração ${info.duration} ≠ ${expected}`);
});

test('fundo desfocado e proporção original', async () => {
  const p = P.newProject();
  p.ratio = 'original';
  p.background = { type: 'blur', blur: 1, color: '#000' };
  const t = await clipFor(media.tall);
  const w = await clipFor(media.wide);
  p.clips.push(w, t);
  const size = P.canvasSize(p, 360);
  assert.deepStrictEqual(size, { width: 640, height: 360 });
  const output = path.join(dir, 'blur.mp4');
  await ff.runExport(p, { output, ...size, fps: 24, crf: 30, preset: 'ultrafast', workDir: dir }).done;
  const info = await ff.probe(output);
  assert.ok(Math.abs(info.duration - 9) < 0.15);
});

test('resoluções com arredondamento (480p, 9:16) não quebram a junção', async () => {
  const p = P.newProject();
  p.ratio = '9:16';
  p.clips.push(await clipFor(media.tall), await clipFor(media.photo), await clipFor(media.wide));
  p.clips[1].out = 1;
  p.clips[2].fit = 'fill';
  const size = P.canvasSize(p, 480);
  assert.deepStrictEqual(size, { width: 480, height: 854 });
  const output = path.join(dir, 'p480.mp4');
  await ff.runExport(p, { output, ...size, fps: 30, crf: 30, preset: 'ultrafast', workDir: dir }).done;
  const info = await ff.probe(output);
  assert.strictEqual(info.height, 854);
});
