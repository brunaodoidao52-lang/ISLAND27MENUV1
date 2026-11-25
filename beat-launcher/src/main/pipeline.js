// Do beat aos arquivos prontos: análise, textos, vídeo do YouTube, Reels, miniatura e loop da capa.
const fs = require('fs');
const path = require('path');
const ff = require('./ffmpeg');
const design = require('./design');
const texts = require('../shared/texts');

const safeName = (s) => String(s || 'beat').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'beat';

/**
 * Gera tudo de um beat.
 * beat: { nome, artista, genero, bpm, tom, audioPath, coverPath, bgPath?, motion?, texts?, reelLength? }
 * opts: { outDir, workDir, settings, onProgress(fase, 0..1), onCancelable(cancel) }
 * Retorna { analysis, texts, outputs: { youtube, reels, thumb } }.
 */
async function renderBeat(beat, opts) {
  const { outDir, workDir, settings = {}, onProgress = () => {}, onCancelable = () => {} } = opts;
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  onProgress('Analisando o beat', 0);
  const analysis = beat.analysis || (await ff.analyze(beat.audioPath, { reelLength: beat.reelLength || settings.reelLength || 30 }));
  const info = { ...beat, bpm: beat.bpm || analysis.bpm };
  const t = beat.texts || texts.generate(info, settings);

  onProgress('Preparando a capa', 0.03);
  const cover = await ff.squareCover(beat.coverPath, path.join(workDir, `capa-${stamp}.png`));
  const bgVideo = beat.bgPath && ff.kindOf(beat.bgPath) === 'video' ? beat.bgPath : null;

  const files = {
    youtube: path.join(outDir, `${safeName(beat.nome)}-YouTube.mp4`),
    reels: path.join(outDir, `${safeName(beat.nome)}-Reels.mp4`),
    thumb: path.join(outDir, `${safeName(beat.nome)}-miniatura.jpg`),
  };
  const tmp = [cover];
  const layerFile = (name, png) => {
    const f = path.join(workDir, `${name}-${stamp}.png`);
    fs.writeFileSync(f, png);
    tmp.push(f);
    return f;
  };

  try {
    // miniatura
    const thumbPng = layerFile('mini', design.thumbnail(info, cover));
    await ff.toJpeg(thumbPng, files.thumb);

    const pulse = info.bpm ? { type: 'pulse', bpm: info.bpm, phase: analysis.phase, amount: 0.045 } : { type: 'breath', period: 4 };
    const motion = beat.motion && beat.motion !== 'auto' ? { type: beat.motion, period: 8, bpm: info.bpm, phase: analysis.phase } : null;

    // Reels: trecho do drop, vertical, com frase, forma de onda e chamada para comentar
    const reelLen = analysis.reelLength;
    const reelsSpec = {
      W: design.REELS.W, H: design.REELS.H, fps: 30, duration: reelLen, out: files.reels, workDir,
      cover: { path: cover, ...design.REELS.cover, motion: motion ? { ...motion, period: reelLen / Math.max(1, Math.round(reelLen / 8)) } : pulse },
      layer: layerFile('reels', design.reelsLayer(info, cover, t, { videoBg: !!bgVideo })),
      bgVideo,
      audio: { path: beat.audioPath, start: analysis.dropStart, fadeIn: 0.05, fadeOut: 1.5, bitrate: '256k' },
      wave: design.REELS.wave, bar: design.REELS.bar, crf: 19, preset: 'veryfast',
    };
    let job = ff.compose(reelsSpec, (p) => onProgress('Gerando o Reels', 0.05 + p * 0.3));
    onCancelable(job.cancel);
    await job.promise;

    // YouTube: beat completo, horizontal
    const ytSpec = {
      W: design.YT.W, H: design.YT.H, fps: 30, duration: analysis.duration, out: files.youtube, workDir,
      cover: { path: cover, ...design.YT.cover, motion: motion || { type: 'breath', period: 8, amount: 0.06 } },
      layer: layerFile('yt', design.youtubeLayer(info, cover, { videoBg: !!bgVideo })),
      bgVideo,
      audio: { path: beat.audioPath, start: 0, fadeIn: 0, fadeOut: 0, bitrate: '320k' },
      wave: design.YT.wave, bar: design.YT.bar, crf: 21, preset: 'veryfast',
    };
    job = ff.compose(ytSpec, (p) => onProgress('Gerando o vídeo do YouTube', 0.35 + p * 0.65));
    onCancelable(job.cancel);
    await job.promise;
  } finally {
    onCancelable(null);
    tmp.forEach((f) => fs.rm(f, { force: true }, () => {}));
  }
  onProgress('Pronto', 1);
  return { analysis, texts: t, outputs: files };
}

/**
 * Loop animado a partir de uma foto/capa (5 a 15 s), sem emendas: o movimento volta ao ponto inicial.
 * opts: { image, out, workDir, format: '1:1'|'9:16'|'16:9'|'4:5', seconds, style: 'breath'|'pulse'|'drift', bpm, grain, brand, audio? }
 */
async function renderLoop(opts, onProgress = () => {}) {
  fs.mkdirSync(opts.workDir, { recursive: true });
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const cover = await ff.squareCover(opts.image, path.join(opts.workDir, `loop-capa-${stamp}.png`));
  const g = design.loopGeometry(opts.format);
  const seconds = Math.max(2, Math.min(30, Number(opts.seconds) || 5));
  const tmp = [cover];
  let layer = null;
  const png = design.loopLayer(opts.format, cover, { brand: opts.brand !== false });
  if (png) {
    layer = path.join(opts.workDir, `loop-arte-${stamp}.png`);
    fs.writeFileSync(layer, png);
    tmp.push(layer);
  }
  let motion;
  if (opts.style === 'pulse') {
    // ajusta o BPM para caber um número inteiro de batidas no loop (assim ele emenda sem pulo)
    const beats = Math.max(1, Math.round((seconds * (opts.bpm || 120)) / 60));
    motion = { type: 'pulse', bpm: (beats * 60) / seconds, phase: 0, amount: 0.05 };
  } else if (opts.style === 'drift') motion = { type: 'drift', period: seconds };
  else motion = { type: 'breath', period: seconds, amount: 0.08 };
  try {
    const job = ff.compose(
      {
        W: g.W, H: g.H, fps: 30, duration: seconds, out: opts.out, workDir: opts.workDir,
        cover: { path: cover, ...g.cover, motion },
        layer,
        audio: opts.audio ? { path: opts.audio, start: opts.audioStart || 0, fadeIn: 0.05, fadeOut: 0.3 } : null,
        grain: !!opts.grain, crf: 18, preset: 'medium',
      },
      onProgress,
    );
    await job.promise;
  } finally {
    tmp.forEach((f) => fs.rm(f, { force: true }, () => {}));
  }
  return opts.out;
}

module.exports = { renderBeat, renderLoop, safeName };
