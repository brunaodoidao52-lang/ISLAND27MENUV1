// Diagnóstico temporário: exporta cada recurso isolado com limite de tempo para achar o filtro que trava.
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
  await ff.run(['-version'], { onStdout: (s) => process.stdout.write(s.split('\n')[0] + '\n') });
  const wide = await mk('w.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=3', '-f', 'lavfi', '-i', 'sine=duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-shortest']);
  const photo = await mk('p.png', ['-f', 'lavfi', '-i', 'testsrc=size=400x300', '-frames:v', '1']);
  const music = await mk('m.m4a', ['-f', 'lavfi', '-i', 'sine=frequency=220:duration=2']);
  const overlay = await mk('o.png', ['-f', 'lavfi', '-i', 'color=c=red@0.5:size=360x640,format=rgba', '-frames:v', '1']);
  const clip = async (f) => P.newClip({ ...(await ff.probe(f)), url: f });
  const cases = {
    simples: async (p) => p.clips.push(await clip(wide)),
    foto: async (p) => p.clips.push(await clip(photo)),
    fundoCor: async (p) => { p.background.type = 'color'; p.clips.push(await clip(wide)); },
    fundoBlur: async (p) => { p.background.type = 'blur'; p.clips.push(await clip(wide)); },
    velocidade: async (p) => { const c = await clip(wide); c.speed = 2; p.clips.push(c); },
    reverso: async (p) => { const c = await clip(wide); c.reverse = true; p.clips.push(c); },
    filtro: async (p) => { const c = await clip(wide); c.filter = 'vintage'; c.adjust.warmth = 0.3; p.clips.push(c); },
    girar: async (p) => { const c = await clip(wide); c.rotate = 90; c.flipH = true; c.fit = 'fill'; c.zoom = 1.5; p.clips.push(c); },
    concat: async (p) => { p.clips.push(await clip(wide), await clip(photo)); p.clips[1].out = 1; },
    xfade: async (p) => { p.clips.push(await clip(wide), await clip(wide)); p.clips[0].transition = { type: 'fade', duration: 0.5 }; },
    texto: async (p, o) => { p.clips.push(await clip(wide)); o.overlays = [{ path: overlay, start: 0.5, end: 2, fade: true }]; },
    musica: async (p) => { p.clips.push(await clip(wide)); const m = P.newAudio({ ...(await ff.probe(music)), url: '' }, 0.5); m.loop = true; m.len = 2; m.fadeIn = 0.5; p.audio.push(m); },
  };
  for (const [name, setup] of Object.entries(cases)) {
    const p = P.newProject();
    p.ratio = '9:16';
    const o = { output: path.join(dir, `${name}.mp4`), width: 360, height: 640, fps: 30, crf: 30, preset: 'ultrafast', workDir: dir };
    await setup(p, o);
    const job = ff.runExport(p, o);
    const t0 = Date.now();
    const timer = setTimeout(() => job.cancel(), 60000);
    try {
      await job.done;
      console.log(`OK     ${name} (${Date.now() - t0} ms)`);
    } catch (e) {
      console.log(`FALHOU ${name} (${Date.now() - t0} ms): ${e.message.split('\n').slice(-3).join(' | ')}`);
    }
    clearTimeout(timer);
  }
})();
