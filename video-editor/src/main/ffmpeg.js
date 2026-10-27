// Integração com o FFmpeg: leitura de mídia, miniaturas, proxies de prévia e exportação final.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('../shared/project');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tif', '.tiff', '.heic']);

function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  // No app empacotado o binário fica fora do arquivo .asar (ver "asarUnpack" no package.json).
  return require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
}

function run(args, { onStdout } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ['-nostdin', ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 200000) stderr = stderr.slice(-100000);
    });
    if (onStdout) proc.stdout.on('data', (d) => onStdout(d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, stderr, proc }));
  });
}

function parseTime(s) {
  const m = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

async function probe(file) {
  const { stderr } = await run(['-hide_banner', '-i', file]);
  const ext = path.extname(file).toLowerCase();
  const dur = /Duration:\s*([\d:.]+)/.exec(stderr);
  const video = /Stream #\S+.*?: Video: ([^\n]*)/.exec(stderr);
  const hasAudio = /Stream #\S+.*?: Audio:/.test(stderr);
  let width = 0;
  let height = 0;
  if (video) {
    const size = /\b(\d{2,5})x(\d{2,5})\b/.exec(video[1]);
    if (size) {
      width = Number(size[1]);
      height = Number(size[2]);
    }
    // Vídeos de celular gravados "em pé" guardam a rotação como metadado; o FFmpeg e o navegador já giram.
    const rot = /rotation of (-?[\d.]+) degrees/.exec(stderr) || /rotate\s*:\s*(-?\d+)/.exec(stderr);
    if (rot && Math.abs(Math.round(Number(rot[1]))) % 180 === 90) [width, height] = [height, width];
  }
  const duration = dur ? parseTime(dur[1]) : 0;
  const isImage = IMAGE_EXT.has(ext) && ext !== '.gif' ? true : !!video && duration <= 0.05 && !hasAudio;
  if (!video && !hasAudio) throw new Error(`Formato não suportado: ${path.basename(file)}`);
  return {
    path: file,
    name: path.basename(file),
    type: isImage ? 'image' : video ? 'video' : 'audio',
    duration,
    width,
    height,
    hasAudio,
  };
}

async function thumbnail(file, out, at) {
  const args = ['-y', '-hide_banner'];
  if (at > 0) args.push('-ss', at.toFixed(2));
  args.push('-i', file, '-frames:v', '1', '-vf', 'scale=240:-2', '-q:v', '4', out);
  const { code } = await run(args);
  return code === 0 && fs.existsSync(out) ? out : null;
}

// Cópia leve em H.264 para formatos que o navegador não reproduz (AVI, MKV, HEVC...). Só para a prévia.
async function makeProxy(file, out) {
  const { code, stderr } = await run([
    '-y', '-hide_banner', '-i', file,
    '-vf', 'scale=-2:min(720\\,ih)',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out,
  ]);
  if (code !== 0) throw new Error(stderr.split('\n').slice(-4).join('\n'));
  return out;
}

const fx = (v) => Number(v).toFixed(3);
const even = (v) => Math.max(2, Math.round(v / 2) * 2);

function atempoChain(speed) {
  const parts = [];
  let s = speed;
  while (s > 2) {
    parts.push('atempo=2');
    s /= 2;
  }
  while (s < 0.5) {
    parts.push('atempo=0.5');
    s /= 0.5;
  }
  if (Math.abs(s - 1) > 1e-3) parts.push(`atempo=${s.toFixed(4)}`);
  return parts;
}

// Matriz sépia × brilho × calor em um único colorchannelmixer (mesmas contas da prévia).
function colorFilters(p) {
  const out = [];
  const a = p.sepia;
  const b = 1 - a;
  let m = [
    [0.393 + 0.607 * b, 0.769 - 0.769 * b, 0.189 - 0.189 * b],
    [0.349 - 0.349 * b, 0.686 + 0.314 * b, 0.168 - 0.168 * b],
    [0.272 - 0.272 * b, 0.534 - 0.534 * b, 0.131 + 0.869 * b],
  ];
  const w = P.warmthMultipliers(p.warmth);
  m = m.map((row, i) => row.map((v) => v * p.brightness * w[i]));
  const identity = m.every((row, i) => row.every((v, j) => Math.abs(v - (i === j ? 1 : 0)) < 1e-4));
  if (!identity) {
    const k = ['r', 'g', 'b'];
    out.push(`colorchannelmixer=${m.map((row, i) => row.map((v, j) => `${k[i]}${k[j]}=${v.toFixed(4)}`).join(':')).join(':')}`);
  }
  if (p.contrast !== 1 || p.saturation !== 1) out.push(`eq=contrast=${p.contrast.toFixed(3)}:saturation=${p.saturation.toFixed(3)}`);
  if (p.hue) out.push(`hue=h=${p.hue.toFixed(2)}`);
  if (p.vignette > 0) out.push(`vignette=angle=${(0.25 + p.vignette * 0.6).toFixed(3)}`);
  return out;
}

/**
 * Monta os argumentos do FFmpeg para exportar o projeto.
 * opts: { output, width, height, fps, crf, preset, overlays: [{ path, start, end, fade }], workDir }
 */
function buildExportArgs(project, opts) {
  const W = opts.width;
  const H = opts.height;
  const fps = opts.fps || 30;
  const { items, total } = P.layout(project);
  if (!items.length) throw new Error('Adicione pelo menos um vídeo ou foto.');
  const args = ['-y', '-hide_banner', '-nostdin'];
  const graph = [];
  let input = 0;

  items.forEach((it, i) => {
    const c = it.clip;
    const D = it.duration;
    const srcLen = c.out - c.in;
    if (c.type === 'image') args.push('-loop', '1', '-framerate', String(fps), '-t', fx(D + 0.5), '-i', c.path);
    else args.push('-ss', fx(c.in), '-t', fx(srcLen), '-i', c.path);
    const idx = input++;

    const vf = [];
    if (c.type === 'video' && c.reverse) vf.push('reverse');
    vf.push(c.type === 'video' && c.speed !== 1 ? `setpts=(PTS-STARTPTS)/${c.speed}` : 'setpts=PTS-STARTPTS');
    if (c.rotate === 90) vf.push('transpose=1');
    else if (c.rotate === 180) vf.push('hflip', 'vflip');
    else if (c.rotate === 270) vf.push('transpose=2');
    if (c.flipH) vf.push('hflip');
    if (c.flipV) vf.push('vflip');
    vf.push(...colorFilters(P.colorParams(c)));
    vf.push('setsar=1');

    const pl = P.placement(c, W, H);
    const dw = even(pl.dw);
    const dh = even(pl.dh);
    const cw = Math.min(even(pl.cw), dw);
    const ch = Math.min(even(pl.ch), dh);
    let fg = `scale=${dw}:${dh}`;
    if (cw < dw || ch < dh) fg += `,crop=${cw}:${ch}:${Math.round(pl.cropX)}:${Math.round(pl.cropY)}`;
    const ox = Math.round((W - cw) / 2);
    const oy = Math.round((H - ch) / 2);
    const tail = `fps=${fps},format=yuv420p,tpad=stop_mode=clone:stop_duration=1,trim=duration=${fx(D)},setpts=PTS-STARTPTS,settb=AVTB,fps=${fps},setsar=1`;
    const covers = cw >= W && ch >= H;
    const bg = project.background || { type: 'color', color: '#000000' };

    if (covers) {
      graph.push(`[${idx}:v]${vf.join(',')},${fg},${tail}[v${i}]`);
    } else if (bg.type === 'blur') {
      const bw = even(W / 8);
      const bh = even(H / 8);
      const r = Math.min(Math.round((bg.blur ?? 0.6) * 12), Math.floor(Math.min(bw, bh) / 4) - 1);
      const blur = r >= 1 ? `,boxblur=${r}:2` : '';
      graph.push(`[${idx}:v]${vf.join(',')},split[bgs${i}][fgs${i}]`);
      graph.push(`[bgs${i}]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh}${blur},scale=${W}:${H},setsar=1[bg${i}]`);
      graph.push(`[fgs${i}]${fg}[fg${i}]`);
      graph.push(`[bg${i}][fg${i}]overlay=${ox}:${oy},${tail}[v${i}]`);
    } else {
      const color = `0x${(bg.color || '#000000').replace('#', '')}`;
      graph.push(`[${idx}:v]${vf.join(',')},${fg},pad=${W}:${H}:${ox}:${oy}:color=${color},${tail}[v${i}]`);
    }

    const af = ['aformat=sample_rates=44100:channel_layouts=stereo', 'apad', `atrim=duration=${fx(D)}`, 'asetpts=PTS-STARTPTS'];
    if (c.type === 'video' && c.hasAudio && !c.muted && c.volume > 0) {
      const pre = ['asetpts=PTS-STARTPTS'];
      if (c.reverse) pre.push('areverse');
      pre.push(...atempoChain(c.speed));
      if (c.volume !== 1) pre.push(`volume=${c.volume.toFixed(3)}`);
      graph.push(`[${idx}:a]${pre.concat(af).join(',')}[a${i}]`);
    } else {
      graph.push(`anullsrc=r=44100:cl=stereo,${af.slice(2).join(',')}[a${i}]`);
    }
  });

  // Junta os clipes: corte seco (concat) ou transição (xfade + acrossfade).
  let curV = 'v0';
  let curA = 'a0';
  let length = items[0].duration;
  for (let i = 1; i < items.length; i++) {
    const d = items[i].transIn;
    const nv = `vx${i}`;
    const na = `ax${i}`;
    if (d > 0) {
      const type = items[i - 1].clip.transition.type;
      graph.push(`[${curV}][v${i}]xfade=transition=${type}:duration=${fx(d)}:offset=${fx(length - d)}[${nv}]`);
      graph.push(`[${curA}][a${i}]acrossfade=d=${fx(d)}[${na}]`);
      length += items[i].duration - d;
    } else {
      graph.push(`[${curV}][${curA}][v${i}][a${i}]concat=n=2:v=1:a=1[${nv}][${na}]`);
      length += items[i].duration;
    }
    curV = nv;
    curA = na;
  }

  // Textos e figurinhas: imagens PNG transparentes (desenhadas pela interface) sobrepostas no tempo certo.
  (opts.overlays || []).forEach((o, j) => {
    const start = Math.max(0, o.start);
    const end = Math.min(total, o.end);
    if (end <= start) return;
    args.push('-loop', '1', '-framerate', String(fps), '-t', fx(total), '-i', o.path);
    const idx = input++;
    let chain = `[${idx}:v]format=rgba`;
    if (o.fade) {
      const fd = Math.min(0.4, (end - start) / 3);
      chain += `,fade=t=in:st=${fx(start)}:d=${fx(fd)}:alpha=1,fade=t=out:st=${fx(end - fd)}:d=${fx(fd)}:alpha=1`;
    }
    graph.push(`${chain}[ov${j}]`);
    graph.push(`[${curV}][ov${j}]overlay=0:0:enable='between(t,${fx(start)},${fx(end)})':eof_action=pass[vo${j}]`);
    curV = `vo${j}`;
  });

  // Música, efeitos e narração.
  const mixes = [];
  (project.audio || []).forEach((tr, j) => {
    const start = Math.max(0, tr.start);
    const len = Math.min(tr.len, total - start);
    if (len <= 0.05 || tr.volume <= 0) return;
    // Repetição finita + duração limitada: com -stream_loop -1 algumas versões do FFmpeg leem o arquivo para sempre.
    const span = (tr.sourceDuration || len) - (tr.in || 0);
    if (tr.loop && span > 0.05 && len > span) args.push('-stream_loop', String(Math.ceil(len / span)));
    if (tr.in > 0) args.push('-ss', fx(tr.in));
    args.push('-t', fx(len + 0.1), '-i', tr.path);
    const idx = input++;
    const f = [`atrim=0:${fx(len)}`, 'asetpts=PTS-STARTPTS', 'aformat=sample_rates=44100:channel_layouts=stereo'];
    if (tr.volume !== 1) f.push(`volume=${tr.volume.toFixed(3)}`);
    if (tr.fadeIn > 0) f.push(`afade=t=in:st=0:d=${fx(Math.min(tr.fadeIn, len))}`);
    if (tr.fadeOut > 0) f.push(`afade=t=out:st=${fx(Math.max(0, len - tr.fadeOut))}:d=${fx(Math.min(tr.fadeOut, len))}`);
    const ms = Math.round(start * 1000);
    if (ms > 0) f.push(`adelay=${ms}|${ms}`);
    graph.push(`[${idx}:a]${f.join(',')}[m${j}]`);
    mixes.push(`[m${j}]`);
  });
  if (mixes.length) {
    graph.push(`[${curA}]${mixes.join('')}amix=inputs=${mixes.length + 1}:duration=first:dropout_transition=0:normalize=0[amix]`);
    curA = 'amix';
  }
  graph.push(`[${curV}]format=yuv420p[vout]`);

  const filter = graph.join(';\n');
  const scriptPath = path.join(opts.workDir || os.tmpdir(), `filtro-${Date.now()}.txt`);
  fs.writeFileSync(scriptPath, filter);

  args.push(
    '-filter_complex_script', scriptPath,
    '-map', '[vout]', '-map', `[${curA}]`,
    '-c:v', 'libx264', '-preset', opts.preset || 'medium', '-crf', String(opts.crf ?? 20),
    '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100',
    '-movflags', '+faststart', '-t', fx(total),
    '-progress', 'pipe:1', '-nostats',
    opts.output,
  );
  return { args, total, filter, scriptPath };
}

function runExport(project, opts, onProgress) {
  const { args, total, scriptPath } = buildExportArgs(project, opts);
  const proc = spawn(ffmpegPath(), args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
      if (m && onProgress) onProgress(Math.min(1, Number(m[1]) / 1e6 / total));
    }
  });
  const done = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', (code, signal) => {
      fs.rm(scriptPath, { force: true }, () => {});
      if (code === 0) resolve({ output: opts.output, duration: total });
      else if (signal || proc.cancelled) reject(new Error('Exportação cancelada.'));
      else reject(new Error(stderr.split('\n').filter(Boolean).slice(-8).join('\n')));
    });
  });
  return {
    done,
    cancel() {
      proc.cancelled = true;
      proc.kill('SIGKILL');
    },
  };
}

module.exports = { ffmpegPath, probe, thumbnail, makeProxy, buildExportArgs, runExport, run };
