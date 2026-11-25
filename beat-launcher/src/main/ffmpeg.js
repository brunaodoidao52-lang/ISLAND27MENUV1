// FFmpeg: leitura de mídia, análise do beat (BPM, batida e drop) e montagem dos vídeos.
// Base: o mesmo jeito de chamar o FFmpeg do ISLAND27 Editor (binário embutido via ffmpeg-static).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  // No app empacotado o binário fica fora do arquivo .asar (ver "asarUnpack" no package.json).
  return require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
}

function run(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ['-nostdin', ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 200000) stderr = stderr.slice(-100000);
    });
    proc.stdout.resume();
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, stderr }));
  });
}

function lastLines(text, n = 6) {
  return String(text).split('\n').filter(Boolean).slice(-n).join('\n');
}

async function runOk(args) {
  const r = await run(args);
  if (r.code !== 0) throw new Error(lastLines(r.stderr));
  return r;
}

function parseTime(s) {
  const m = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff', '.heic', '.avif']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.oga', '.opus', '.aiff', '.aif', '.wma']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.gif']);

function kindOf(file) {
  const ext = path.extname(file).toLowerCase();
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  return null;
}

async function probe(file) {
  const { stderr } = await run(['-hide_banner', '-i', file]);
  const dur = /Duration:\s*([\d:.]+)/.exec(stderr);
  const video = /Stream #\S+.*?: Video: ([^\n]*)/.exec(stderr);
  const hasAudio = /Stream #\S+.*?: Audio:/.test(stderr);
  let width = 0;
  let height = 0;
  if (video) {
    const size = /\b(\d{2,5})x(\d{2,5})\b/.exec(video[1]);
    if (size) [width, height] = [Number(size[1]), Number(size[2])];
  }
  if (!video && !hasAudio) throw new Error(`Formato não suportado: ${path.basename(file)}`);
  return { path: file, duration: dur ? parseTime(dur[1]) : 0, width, height, hasAudio, hasVideo: !!video };
}

/** Recorta a capa no centro em um quadrado PNG (funciona com JPG, PNG, WEBP, HEIC...). */
async function squareCover(file, out, size = 1600) {
  await runOk([
    '-y', '-hide_banner', '-i', file, '-frames:v', '1',
    '-vf', `scale=${size}:${size}:force_original_aspect_ratio=increase:flags=lanczos,crop=${size}:${size},format=rgb24`,
    out,
  ]);
  return out;
}

async function toJpeg(png, out, quality = 3) {
  await runOk(['-y', '-hide_banner', '-i', png, '-frames:v', '1', '-q:v', String(quality), out]);
  return out;
}

/** Decodifica o áudio em mono float32 (para a análise). */
function decode(file, rate, filter) {
  return new Promise((resolve, reject) => {
    const args = ['-nostdin', '-hide_banner', '-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(rate)];
    if (filter) args.push('-af', filter);
    args.push('-f', 'f32le', 'pipe:1');
    const proc = spawn(ffmpegPath(), args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let err = '';
    proc.stdout.on('data', (d) => chunks.push(d));
    proc.stderr.on('data', (d) => {
      err += d.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(lastLines(err) || 'Não foi possível ler o áudio.'));
      const buf = Buffer.concat(chunks);
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 4));
      resolve(new Float32Array(ab));
    });
  });
}

const RATE = 11025;
const HOP = 256; // ~23 ms por quadro de análise

function frameEnergy(samples) {
  const n = Math.floor(samples.length / HOP);
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * HOP, end = j + HOP; j < end; j++) s += samples[j] * samples[j];
    e[i] = s / HOP;
  }
  return e;
}

function onsetEnvelope(e) {
  const o = new Float32Array(e.length);
  for (let i = 1; i < e.length; i++) o[i] = Math.max(0, Math.log(e[i] + 1e-7) - Math.log(e[i - 1] + 1e-7));
  // tira a média local para destacar as batidas
  const win = 16;
  const out = new Float32Array(o.length);
  let acc = 0;
  for (let i = 0; i < o.length; i++) {
    acc += o[i];
    if (i >= win) acc -= o[i - win];
    out[i] = Math.max(0, o[i] - acc / Math.min(i + 1, win));
  }
  return out;
}

function sampleAt(arr, pos) {
  const i = Math.floor(pos);
  if (i < 0 || i + 1 >= arr.length) return 0;
  const f = pos - i;
  return arr[i] * (1 - f) + arr[i + 1] * f;
}

/** Estima o BPM por autocorrelação das batidas, preferindo a faixa comum de trap/funk (≈ 85-160). */
function estimateTempo(onset, fr) {
  const n = onset.length;
  if (n < fr * 6) return null;
  const ac = (lag) => {
    let s = 0;
    const L = Math.floor(lag);
    const f = lag - L;
    for (let i = 0; i + L + 1 < n; i++) s += onset[i] * (onset[i + L] * (1 - f) + onset[i + L + 1] * f);
    return s / (n - lag);
  };
  let best = null;
  for (let bpm = 60; bpm <= 190; bpm += 0.25) {
    const lag = (60 * fr) / bpm;
    let s = 0;
    for (let k = 1; k <= 4; k++) s += ac(lag * k) / k;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 125) / 0.45) ** 2);
    const score = s * (0.35 + prior);
    if (!best || score > best.score) best = { bpm, score };
  }
  if (!best || best.score <= 0) return null;
  return Math.round(best.bpm);
}

/** Acha em que momento caem as batidas (fase) para um BPM. */
function beatPhase(onset, fr, bpm) {
  const period = (60 * fr) / bpm;
  let best = { phase: 0, s: -1 };
  for (let p = 0; p < period; p += 0.5) {
    let s = 0;
    for (let x = p; x < onset.length; x += period) s += sampleAt(onset, x);
    if (s > best.s) best = { phase: p, s };
  }
  return best.phase / fr;
}

/**
 * Melhor trecho para o Reels: o momento em que a energia sobe (o drop) seguido de um trecho forte.
 * Retorna o início (s), alinhado na batida quando o BPM é conhecido.
 */
function findDrop(energy, fr, duration, length, bpm, phase) {
  if (duration <= length + 1) return 0;
  const step = Math.round(fr / 4); // 0,25 s
  const n = energy.length;
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + Math.sqrt(energy[i]);
  const mean = (a, b) => {
    a = Math.max(0, Math.min(n, Math.round(a)));
    b = Math.max(0, Math.min(n, Math.round(b)));
    return b > a ? (pre[b] - pre[a]) / (b - a) : 0;
  };
  const top = mean(0, n) || 1;
  const L = length * fr;
  let best = { at: 0, score: -Infinity };
  for (let i = 0; i + L <= n; i += step) {
    const body = mean(i, i + L) / top;
    const rise = Math.max(0, mean(i, i + 2 * fr) - mean(i - 3 * fr, i)) / top;
    const score = body + 0.9 * rise - (i < 2 * fr ? 0.15 : 0);
    if (score > best.score) best = { at: i, score };
  }
  let start = best.at / fr;
  if (bpm) {
    const P = 60 / bpm;
    const k = Math.round((start - phase) / P);
    start = Math.max(0, phase + k * P);
  }
  return Math.min(start, Math.max(0, duration - length));
}

/** Análise do beat: duração, BPM estimado, fase da batida, início do drop e curva de energia. */
async function analyze(file, { reelLength = 30 } = {}) {
  const info = await probe(file);
  if (!info.hasAudio) throw new Error('O arquivo do beat não tem áudio.');
  const [full, low] = await Promise.all([decode(file, RATE), decode(file, RATE, 'lowpass=f=160,lowpass=f=160')]);
  const fr = RATE / HOP;
  const eFull = frameEnergy(full);
  const eLow = frameEnergy(low);
  const oFull = onsetEnvelope(eFull);
  const oLow = onsetEnvelope(eLow);
  const onset = new Float32Array(oFull.length);
  for (let i = 0; i < onset.length; i++) onset[i] = oFull[i] + 1.5 * (oLow[i] || 0);
  const duration = info.duration || full.length / RATE;
  const bpm = estimateTempo(onset, fr);
  const phase = bpm ? beatPhase(onset, fr, bpm) : 0;
  const len = Math.min(reelLength, duration);
  const dropStart = findDrop(eFull, fr, duration, len, bpm, phase);
  return { duration, bpm, phase, dropStart, reelLength: len };
}

const fx = (v) => Number(v).toFixed(3);

/** Expressões de zoom da capa (zoompan): respirar, pulso na batida ou deriva. */
function motionExpr(motion, fps) {
  const t = `(on/${fps})`;
  const T = motion.period || 8;
  const center = { x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' };
  if (motion.type === 'pulse' && motion.bpm) {
    const P = 60 / motion.bpm;
    const ph = `(mod(${t}-${fx(motion.phase || 0)}+${fx(P * 64)},${fx(P)})/${fx(P)})`;
    return { z: `1.02+${fx(motion.amount ?? 0.05)}*exp(-7*${ph})`, ...center };
  }
  if (motion.type === 'drift') {
    return {
      z: `1.12+0.03*sin(2*PI*${t}/${fx(T)})`,
      x: `(iw-iw/zoom)/2*(1+0.85*sin(2*PI*${t}/${fx(T)}))`,
      y: `(ih-ih/zoom)/2*(1+0.85*cos(2*PI*${t}/${fx(T)}))`,
    };
  }
  if (motion.type === 'none') return { z: '1', ...center };
  return { z: `1+${fx(motion.amount ?? 0.07)}*(0.5-0.5*cos(2*PI*${t}/${fx(T)}))`, ...center };
}

/**
 * Monta um vídeo: fundo (cor ou vídeo em loop) + capa animada + camada da arte (PNG com "furo" da capa)
 * + forma de onda + barra de progresso + áudio.
 * spec: { W, H, fps, duration, out, cover: { path, x, y, size, motion }, layer, bgVideo,
 *         audio: { path, start, fadeIn, fadeOut, bitrate }, wave: { x, y, w, h }, bar: { x, y, w, h }, grain, crf, preset }
 */
function buildComposeArgs(spec) {
  const { W, H, fps = 30, duration: D } = spec;
  const frames = Math.max(1, Math.round(D * fps));
  const args = ['-y', '-hide_banner'];
  const g = [];
  let n = 0;

  // 0: fundo
  if (spec.bgVideo) {
    args.push('-stream_loop', '-1', '-t', fx(D + 1), '-i', spec.bgVideo);
    g.push(`[${n}:v]fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p,trim=duration=${fx(D)},setpts=PTS-STARTPTS[base]`);
  } else {
    args.push('-f', 'lavfi', '-i', `color=c=0x08090c:s=${W}x${H}:r=${fps}:d=${fx(D)}`);
    g.push(`[${n}:v]format=yuv420p,setsar=1[base]`);
  }
  n++;

  // capa animada
  let cur = 'base';
  if (spec.cover) {
    const c = spec.cover;
    const S = Math.round(c.size / 2) * 2;
    const big = S * 2;
    const m = motionExpr(c.motion || { type: 'breath' }, fps);
    args.push('-i', c.path);
    g.push(
      `[${n}:v]scale=${big}:${big}:force_original_aspect_ratio=increase,crop=${big}:${big},setsar=1,` +
        `zoompan=z='${m.z}':x='${m.x}':y='${m.y}':d=${frames}:s=${S}x${S}:fps=${fps},format=yuv420p,setsar=1[cov]`,
    );
    g.push(`[${cur}][cov]overlay=${Math.round(c.x)}:${Math.round(c.y)}:eof_action=pass[withcov]`);
    cur = 'withcov';
    n++;
  }

  // barra de progresso: fica por baixo da arte, que tem um "furo" no formato da barra
  if (spec.bar) {
    const b = spec.bar;
    const bw = Math.round(b.w);
    const bh = Math.round(b.h);
    g.push(`[${cur}]drawbox=x=${Math.round(b.x)}:y=${Math.round(b.y)}:w=${bw}:h=${bh}:color=0xFFFFFF@0.16:t=fill[track]`);
    g.push(`color=c=0x${(b.color || '#7FE3FF').replace('#', '')}:s=${bw}x${bh}:r=${fps}:d=${fx(D)},format=yuv420p[barsrc]`);
    g.push(`[track][barsrc]overlay=x='${Math.round(b.x)}-w+w*t/${fx(D)}':y=${Math.round(b.y)}:eof_action=pass[withbar]`);
    cur = 'withbar';
  }

  // arte por cima (fundo desfocado, textos, brilho), com o furo onde a capa aparece
  if (spec.layer) {
    args.push('-i', spec.layer);
    g.push(`[${n}:v]format=rgba[art]`);
    g.push(`[${cur}][art]overlay=0:0:format=auto[withart]`);
    cur = 'withart';
    n++;
  }

  // áudio
  let aout = null;
  if (spec.audio) {
    const a = spec.audio;
    if (a.start > 0) args.push('-ss', fx(a.start));
    args.push('-t', fx(D + 0.2), '-i', a.path);
    const af = ['aformat=sample_rates=48000:channel_layouts=stereo', `atrim=0:${fx(D)}`, 'asetpts=PTS-STARTPTS'];
    if (a.fadeIn > 0) af.push(`afade=t=in:st=0:d=${fx(a.fadeIn)}`);
    if (a.fadeOut > 0) af.push(`afade=t=out:st=${fx(Math.max(0, D - a.fadeOut))}:d=${fx(a.fadeOut)}`);
    if (spec.wave) {
      g.push(`[${n}:a]${af.join(',')},asplit=2[aout][awav]`);
      const w = spec.wave;
      g.push(
        `[awav]showwaves=s=${Math.round(w.w / 2) * 2}x${Math.round(w.h / 2) * 2}:mode=cline:rate=${fps}:scale=sqrt:draw=full:colors=0x${(w.color || '#7FE3FF').replace('#', '')},format=rgba[wav]`,
      );
      g.push(`[${cur}][wav]overlay=${Math.round(w.x)}:${Math.round(w.y)}:format=auto[withwav]`);
      cur = 'withwav';
    } else {
      g.push(`[${n}:a]${af.join(',')}[aout]`);
    }
    aout = 'aout';
    n++;
  }

  if (spec.grain) {
    g.push(`[${cur}]noise=alls=7:allf=t+u[grain]`);
    cur = 'grain';
  }
  g.push(`[${cur}]format=yuv420p,setsar=1[vout]`);

  const scriptPath = path.join(spec.workDir || os.tmpdir(), `filtro-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  fs.writeFileSync(scriptPath, g.join(';\n'));
  args.push('-filter_complex_script', scriptPath, '-map', '[vout]');
  if (aout) args.push('-map', `[${aout}]`);
  args.push(
    '-c:v', 'libx264', '-preset', spec.preset || 'veryfast', '-crf', String(spec.crf ?? 20),
    '-pix_fmt', 'yuv420p', '-r', String(fps), '-g', String(fps * 2),
  );
  if (aout) args.push('-c:a', 'aac', '-b:a', spec.audio.bitrate || '256k', '-ar', '48000');
  args.push('-movflags', '+faststart', '-t', fx(D), '-progress', 'pipe:1', '-nostats', spec.out);
  return { args, scriptPath, filter: g.join(';\n') };
}

/** Executa a montagem com progresso (0..1). Retorna { promise, cancel }. */
function compose(spec, onProgress) {
  const { args, scriptPath } = buildComposeArgs(spec);
  const proc = spawn(ffmpegPath(), ['-nostdin', ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  let buf = '';
  proc.stderr.on('data', (d) => {
    stderr = (stderr + d.toString()).slice(-20000);
  });
  proc.stdout.on('data', (d) => {
    buf += d.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
      if (m && onProgress) onProgress(Math.min(1, Number(m[1]) / 1e6 / spec.duration));
      // Mesmo cuidado do Editor: se o FFmpeg travar ao encerrar depois de gravar tudo, encerramos.
      if (line.trim() === 'progress=end' && !proc.finishTimer) {
        proc.finishTimer = setTimeout(() => {
          proc.endedOk = true;
          proc.kill('SIGKILL');
        }, 3000);
      }
    }
  });
  const promise = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('exit', (code, signal) => {
      clearTimeout(proc.finishTimer);
      fs.rm(scriptPath, { force: true }, () => {});
      const written = proc.endedOk && !proc.cancelled && fs.existsSync(spec.out) && fs.statSync(spec.out).size > 0;
      if (code === 0 || written) resolve(spec.out);
      else if (signal || proc.cancelled) reject(new Error('Cancelado.'));
      else reject(new Error(lastLines(stderr, 8)));
    });
  });
  return {
    promise,
    cancel() {
      proc.cancelled = true;
      proc.kill('SIGKILL');
    },
  };
}

module.exports = {
  ffmpegPath, run, probe, kindOf, squareCover, toJpeg, analyze, estimateTempo, findDrop,
  motionExpr, buildComposeArgs, compose, AUDIO_EXT, IMAGE_EXT, VIDEO_EXT,
};
