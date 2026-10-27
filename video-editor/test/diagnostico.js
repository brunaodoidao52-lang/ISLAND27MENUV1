// Diagnóstico temporário (Mac Apple Silicon): exporta o projeto do teste completo tirando um recurso por vez.
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('../src/shared/project');
const ff = require('../src/main/ffmpeg');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i27-diag-'));
const mk = async (name, args) => {
  const out = path.join(dir, name);
  await ff.run(['-y', '-hide_banner', ...args, out]);
  return out;
};

(async () => {
  await ff.run(['-version'], { onStdout: (s) => process.stdout.write(`${s.split('\n')[0]}\n`) });
  const media = {
    wide: await mk('wide.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=5', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-shortest']),
    tall: await mk('tall.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=25:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p']),
    photo: await mk('photo.png', ['-f', 'lavfi', '-i', 'testsrc=size=800x600', '-frames:v', '1']),
    music: await mk('music.m4a', ['-f', 'lavfi', '-i', 'sine=frequency=220:duration=3']),
    overlay: await mk('overlay.png', ['-f', 'lavfi', '-i', 'color=c=red@0.5:size=360x640,format=rgba', '-frames:v', '1']),
  };
  const clip = async (f) => P.newClip({ ...(await ff.probe(f)), url: f });
  const build = async (skip) => {
    const p = P.newProject();
    p.ratio = '9:16';
    const a = await clip(media.wide);
    a.in = 1; a.out = 5; a.speed = 2;
    if (skip !== 'filtro') { a.filter = 'vintage'; a.adjust.warmth = 0.3; }
    a.transition = { type: skip === 'transicoes' ? 'none' : 'slideleft', duration: 0.5 };
    const b = await clip(media.tall);
    if (skip !== 'reverso') b.reverse = true;
    if (skip !== 'girar') { b.rotate = 90; b.flipH = true; b.fit = 'fill'; b.zoom = 1.5; b.panX = -0.5; }
    b.transition = { type: skip === 'transicoes' ? 'none' : 'circleopen', duration: 0.5 };
    const c = await clip(media.photo);
    c.out = 2;
    const d = await clip(media.wide);
    d.out = 1.5; d.volume = 1.8;
    p.clips.push(a);
    if (skip !== 'semAudio') p.clips.push(b);
    if (skip !== 'foto') p.clips.push(c);
    p.clips.push(d);
    p.background = { type: 'color', color: '#ff00aa' };
    if (skip !== 'musica') {
      const m = P.newAudio({ ...(await ff.probe(media.music)), url: '' }, 0.5);
      m.loop = true; m.len = 6; m.fadeIn = 1; m.fadeOut = 1;
      p.audio.push(m);
    }
    const overlays = skip === 'texto' ? [] : [{ path: media.overlay, start: 1, end: 3, fade: true }];
    return { p, overlays };
  };
  for (const skip of ['nada', 'texto', 'musica', 'transicoes', 'reverso', 'girar', 'filtro', 'foto', 'semAudio']) {
    const { p, overlays } = await build(skip);
    const job = ff.runExport(p, { output: path.join(dir, `${skip}.mp4`), width: 360, height: 640, fps: 30, crf: 30, preset: 'ultrafast', workDir: dir, overlays });
    const t0 = Date.now();
    const timer = setTimeout(() => job.cancel(), 30000);
    try {
      await job.done;
      console.log(`OK     sem ${skip} (${Date.now() - t0} ms)`);
    } catch (e) {
      const tail = job.log().split(/[\r\n]+/).filter(Boolean).slice(-4).join(' | ');
      console.log(`TRAVOU sem ${skip}: ${e.message.split('\n')[0]} :: ${tail}`);
    }
    clearTimeout(timer);
  }
})();
