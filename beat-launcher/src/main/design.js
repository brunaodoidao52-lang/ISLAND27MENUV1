// Artes da ISLAND27 em SVG (cores e fontes do site), transformadas em PNG pelo resvg.
// Cada camada de vídeo tem um "furo" onde a capa animada aparece por baixo.
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const C = {
  bg: '#08090c',
  panel: '#0c0d11',
  accent: '#7FE3FF',
  primary: '#2AA9E0',
  primaryText: '#04141c',
  text: '#F2F4F8',
  soft: '#C7CCD6',
  muted: '#9AA1AE',
  deep: '#12213f',
};

// No app instalado as fontes ficam fora do .asar (o resvg lê os arquivos direto do disco).
const FONT_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts').replace('app.asar', 'app.asar.unpacked');
const FONTS = fs.existsSync(FONT_DIR) ? fs.readdirSync(FONT_DIR).filter((f) => f.endsWith('.ttf')).map((f) => path.join(FONT_DIR, f)) : [];
const HEAD = 'Space Grotesk';
const BODY = 'IBM Plex Sans';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function render(svg, width) {
  const r = new Resvg(svg, {
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: BODY },
    fitTo: width ? { mode: 'width', value: width } : { mode: 'original' },
  });
  return r.render().asPng();
}

const measureCache = new Map();
/** Largura real do texto (mede com o próprio resvg). */
function measure(text, size, { family = HEAD, weight = 700, spacing = 0 } = {}) {
  const key = `${family}|${weight}|${size}|${spacing}|${text}`;
  if (measureCache.has(key)) return measureCache.get(key);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8000" height="${size * 3}"><text x="10" y="${size * 2}" font-family="${family}" font-weight="${weight}" font-size="${size}" letter-spacing="${spacing}">${esc(text)}</text></svg>`;
  let w = text.length * size * 0.6;
  try {
    const box = new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: BODY } }).getBBox();
    if (box) w = box.width;
  } catch {
    /* mantém a estimativa */
  }
  measureCache.set(key, w);
  return w;
}

/** Quebra em até "maxLines" linhas e acha o maior tamanho que cabe em "maxWidth". */
function fitText(text, maxWidth, { max, min, maxLines = 2, ...font }) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  for (let size = max; size >= min; size -= 2) {
    const lines = [];
    let line = '';
    for (const w of words) {
      const tryLine = line ? `${line} ${w}` : w;
      if (measure(tryLine, size, font) <= maxWidth || !line) line = tryLine;
      else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.every((l) => measure(l, size, font) <= maxWidth)) return { size, lines };
  }
  // não coube: usa o mínimo e corta com reticências
  const size = min;
  let t = words.join(' ');
  while (t.length > 1 && measure(`${t}…`, size, font) > maxWidth * maxLines) t = t.slice(0, -1);
  return { size, lines: [t.length < words.join(' ').length ? `${t.trim()}…` : t] };
}

function textBlock(lines, { x, y, size, lineHeight = 1.05, anchor = 'start', family = HEAD, weight = 700, fill = C.text, spacing = 0, extra = '' }) {
  return lines
    .map(
      (l, i) =>
        `<text x="${x}" y="${(y + i * size * lineHeight).toFixed(1)}" text-anchor="${anchor}" font-family="${family}" font-weight="${weight}" font-size="${size}" letter-spacing="${spacing}" fill="${fill}" ${extra}>${esc(l)}</text>`,
    )
    .join('');
}

function imageHref(file) {
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

/** Fundo: capa desfocada e escurecida + brilhos azuis (ou só um véu escuro sobre um vídeo de fundo). */
function background(W, H, coverHref, { videoBg = false, dim = 0.7, glows = [] } = {}) {
  const parts = [];
  if (!videoBg && coverHref) {
    const pad = Math.round(Math.max(W, H) * 0.08);
    parts.push(
      `<image href="${coverHref}" x="${-pad}" y="${-pad}" width="${W + 2 * pad}" height="${H + 2 * pad}" preserveAspectRatio="xMidYMid slice" filter="url(#blur)"/>`,
    );
    parts.push(`<rect width="${W}" height="${H}" fill="${C.bg}" opacity="${dim}"/>`);
  } else {
    parts.push(`<rect width="${W}" height="${H}" fill="${C.bg}" opacity="${videoBg ? 0.55 : 1}"/>`);
  }
  for (const gl of glows) {
    parts.push(`<circle cx="${gl.x}" cy="${gl.y}" r="${gl.r}" fill="${gl.color}" opacity="${gl.opacity}" filter="url(#glow)"/>`);
  }
  parts.push(`<rect width="${W}" height="${H}" fill="url(#shade)"/>`);
  return parts.join('');
}

function defs(W, H, blur, hole, shade, extraHoles = []) {
  const holes = [hole && { x: hole.x, y: hole.y, w: hole.size, h: hole.size, r: hole.r }, ...extraHoles.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h, r: 0 }))].filter(Boolean);
  return `<defs>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${blur}"/></filter>
    <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="${Math.round(Math.max(W, H) / 14)}"/></filter>
    <filter id="halo" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${Math.round(Math.max(W, H) / 60)}"/></filter>
    <linearGradient id="shade" x1="0" y1="0" x2="${shade === 'h' ? 1 : 0}" y2="${shade === 'h' ? 0 : 1}">
      <stop offset="0" stop-color="${C.bg}" stop-opacity="${shade === 'h' ? 0 : 0.35}"/>
      <stop offset="0.55" stop-color="${C.bg}" stop-opacity="0.1"/>
      <stop offset="1" stop-color="${C.bg}" stop-opacity="${shade === 'h' ? 0.55 : 0.75}"/>
    </linearGradient>
    ${holes.length ? `<mask id="hole" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${holes.map((o) => `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="${o.r}" fill="#000"/>`).join('')}</mask>` : ''}
  </defs>`;
}

/** Brilho azul em volta da capa + borda fina. */
function coverHalo(h) {
  return `<rect x="${h.x}" y="${h.y}" width="${h.size}" height="${h.size}" rx="${h.r}" fill="${C.primary}" opacity="0.55" filter="url(#halo)"/>`;
}
function coverBorder(h) {
  return `<rect x="${h.x + 1}" y="${h.y + 1}" width="${h.size - 2}" height="${h.size - 2}" rx="${h.r}" fill="none" stroke="${C.accent}" stroke-opacity="0.45" stroke-width="2"/>`;
}

function chip(x, y, label, { size = 26, h = 54, solid = false } = {}) {
  const w = measure(label, size, { family: BODY, weight: 600, spacing: 1 }) + h * 0.9;
  return {
    w,
    svg: `<rect x="${x}" y="${y}" width="${w.toFixed(1)}" height="${h}" rx="${h / 2}" fill="${solid ? C.primary : C.accent}" fill-opacity="${solid ? 1 : 0.1}" stroke="${C.accent}" stroke-opacity="${solid ? 0 : 0.4}"/>` +
      `<text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2 + size * 0.36).toFixed(1)}" text-anchor="middle" font-family="${BODY}" font-weight="600" font-size="${size}" letter-spacing="1" fill="${solid ? C.primaryText : C.accent}">${esc(label)}</text>`,
  };
}

function chipsRow(x, y, labels, opts) {
  let cx = x;
  let out = '';
  for (const l of labels.filter(Boolean)) {
    const c = chip(cx, y, l, opts);
    out += c.svg;
    cx += c.w + 14;
  }
  return out;
}

function subtitleOf(beat) {
  if (beat.artista) return `${beat.artista} Type Beat`;
  if (beat.genero && beat.genero !== 'Outro') return `${beat.genero} Type Beat`;
  return 'Type Beat';
}

function infoChips(beat) {
  return [beat.bpm ? `${Math.round(beat.bpm)} BPM` : '', beat.tom ? beat.tom.toUpperCase().replace('M', 'm') : '', beat.genero && beat.genero !== 'Outro' ? beat.genero.toUpperCase() : ''];
}

// ---------- YouTube 1920x1080 ----------
const YT = { W: 1920, H: 1080, cover: { x: 170, y: 160, size: 620, r: 30 }, wave: { x: 170, y: 838, w: 1580, h: 130 }, bar: { x: 170, y: 1000, w: 1580, h: 6 } };

function youtubeLayer(beat, coverPng, { videoBg = false } = {}) {
  const { W, H, cover: h } = YT;
  const href = imageHref(coverPng);
  const X = 880;
  const maxW = W - X - 170;
  const title = fitText(String(beat.nome || 'Sem nome').toUpperCase(), maxW, { max: 132, min: 64, maxLines: 2 });
  const titleY = 330 + title.size * 0.8;
  const afterTitle = titleY + (title.lines.length - 1) * title.size * 1.02;
  const sub = fitText(subtitleOf(beat), maxW, { max: 46, min: 30, maxLines: 1, family: BODY, weight: 600 });
  const chipsY = afterTitle + 70 + sub.size;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  ${defs(W, H, 48, h, 'h', [YT.bar])}
  <g mask="url(#hole)">
    ${background(W, H, href, { videoBg, glows: [{ x: 420, y: 300, r: 380, color: C.primary, opacity: 0.4 }, { x: 1700, y: 980, r: 300, color: C.accent, opacity: 0.18 }] })}
    ${coverHalo(h)}
  </g>
  ${coverBorder(h)}
  ${textBlock(['ISLAND27  •  TYPE BEAT'], { x: X, y: 300, size: 26, family: BODY, weight: 600, fill: C.accent, spacing: 6 })}
  ${textBlock(title.lines, { x: X, y: titleY, size: title.size, lineHeight: 1.02, fill: C.text })}
  ${textBlock(sub.lines, { x: X, y: afterTitle + 30 + sub.size, size: sub.size, family: BODY, weight: 600, fill: C.soft })}
  ${chipsRow(X, chipsY, infoChips(beat), { size: 24, h: 52 })}
  ${textBlock(['Compre / licencie: link na descrição'], { x: X, y: Math.min(790, chipsY + (infoChips(beat).some(Boolean) ? 52 + 50 : 20)), size: 26, family: BODY, weight: 400, fill: C.muted })}
  ${textBlock(['PROD. ISLAND27'], { x: W - 170, y: 1050, size: 22, anchor: 'end', family: BODY, weight: 600, fill: C.muted, spacing: 5 })}
</svg>`;
  return render(svg);
}

// ---------- Reels 1080x1920 (área segura: longe do topo e dos botões do Instagram embaixo) ----------
const REELS = { W: 1080, H: 1920, cover: { x: 190, y: 470, size: 700, r: 34 }, wave: { x: 140, y: 1310, w: 800, h: 96 }, bar: { x: 190, y: 1424, w: 700, h: 6 } };

function reelsLayer(beat, coverPng, texts, { videoBg = false } = {}) {
  const { W, H, cover: h } = REELS;
  const href = imageHref(coverPng);
  const hook = fitText(texts.hook || 'BEAT NOVO', 940, { max: 78, min: 48, maxLines: 2 });
  const hookY = 330 + (hook.lines.length === 1 ? hook.size * 0.5 : 0);
  const name = fitText(String(beat.nome || '').toUpperCase(), 900, { max: 76, min: 44, maxLines: 1 });
  const sub = [subtitleOf(beat), beat.bpm ? `${Math.round(beat.bpm)} BPM` : ''].filter(Boolean).join('  •  ');
  const cta = fitText(texts.cta || 'COMENTA "BEAT"', 820, { max: 34, min: 24, maxLines: 1, family: BODY, weight: 600 });
  const ctaW = measure(cta.lines[0], cta.size, { family: BODY, weight: 600 }) + 90;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  ${defs(W, H, 40, h, 'v', [REELS.bar])}
  <g mask="url(#hole)">
    ${background(W, H, href, { videoBg, glows: [{ x: 540, y: 820, r: 420, color: C.primary, opacity: 0.42 }, { x: 980, y: 1700, r: 300, color: C.accent, opacity: 0.15 }] })}
    ${coverHalo(h)}
  </g>
  ${coverBorder(h)}
  ${textBlock(['ISLAND27 BEATS'], { x: W / 2, y: 268, size: 26, anchor: 'middle', family: BODY, weight: 600, fill: C.accent, spacing: 7 })}
  ${textBlock(hook.lines, { x: W / 2, y: hookY, size: hook.size, anchor: 'middle', lineHeight: 1.05 })}
  ${textBlock(name.lines, { x: W / 2, y: 1240, size: name.size, anchor: 'middle' })}
  ${textBlock([sub], { x: W / 2, y: 1292, size: 30, anchor: 'middle', family: BODY, weight: 600, fill: C.soft })}
  <rect x="${(W - ctaW) / 2}" y="1462" width="${ctaW}" height="84" rx="42" fill="${C.primary}"/>
  ${textBlock(cta.lines, { x: W / 2, y: 1462 + 42 + cta.size * 0.36, size: cta.size, anchor: 'middle', family: BODY, weight: 600, fill: C.primaryText })}
</svg>`;
  return render(svg);
}

// ---------- Miniatura do YouTube 1280x720 ----------
function thumbnail(beat, coverPng) {
  const W = 1280;
  const H = 720;
  const href = imageHref(coverPng);
  const h = { x: 690, y: 70, size: 580, r: 26 };
  const name = fitText(String(beat.nome || '').toUpperCase(), 600, { max: 120, min: 60, maxLines: 2 });
  const nameY = 250 + name.size * 0.78;
  const after = nameY + (name.lines.length - 1) * name.size * 1.0;
  const sub = fitText(subtitleOf(beat).toUpperCase(), 600, { max: 44, min: 28, maxLines: 1 });
  const badge = chip(60, 120, 'GRÁTIS', { size: 30, h: 62, solid: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  ${defs(W, H, 36, null, 'h')}
  ${background(W, H, href, { glows: [{ x: 980, y: 360, r: 340, color: C.primary, opacity: 0.5 }] })}
  ${coverHalo(h)}
  <clipPath id="cc"><rect x="${h.x}" y="${h.y}" width="${h.size}" height="${h.size}" rx="${h.r}"/></clipPath>
  <image href="${href}" x="${h.x}" y="${h.y}" width="${h.size}" height="${h.size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cc)"/>
  ${coverBorder(h)}
  ${badge.svg}
  ${textBlock(name.lines, { x: 60, y: nameY, size: name.size, lineHeight: 1.0, fill: C.text, extra: 'stroke="#08090c" stroke-width="2"' })}
  ${textBlock(sub.lines, { x: 60, y: after + 30 + sub.size, size: sub.size, fill: C.accent })}
  ${textBlock(['PROD. ISLAND27'], { x: 60, y: 660, size: 26, family: BODY, weight: 600, fill: C.soft, spacing: 5 })}
</svg>`;
  return render(svg);
}

// ---------- Loop animado da capa ----------
const LOOP_FORMATS = {
  '1:1': { W: 1080, H: 1080 },
  '9:16': { W: 1080, H: 1920 },
  '16:9': { W: 1920, H: 1080 },
  '4:5': { W: 1080, H: 1350 },
};

function loopGeometry(format) {
  const f = LOOP_FORMATS[format] || LOOP_FORMATS['1:1'];
  if (format === '1:1' || !LOOP_FORMATS[format]) return { ...f, cover: { x: 0, y: 0, size: f.W, r: 0 }, layer: false };
  const size = Math.round((Math.min(f.W, f.H) * 0.78) / 2) * 2;
  return { ...f, cover: { x: Math.round((f.W - size) / 2), y: Math.round((f.H - size) / 2), size, r: Math.round(size * 0.045) }, layer: true };
}

function loopLayer(format, coverPng, { brand = true } = {}) {
  const g = loopGeometry(format);
  if (!g.layer) {
    if (!brand) return null;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${g.W}" height="${g.H}">${textBlock(['ISLAND27'], { x: g.W - 40, y: g.H - 40, size: 30, anchor: 'end', family: HEAD, weight: 700, fill: '#ffffff', spacing: 4, extra: 'fill-opacity="0.75"' })}</svg>`;
    return render(svg);
  }
  const h = g.cover;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${g.W}" height="${g.H}">
  ${defs(g.W, g.H, 44, h, 'v')}
  <g mask="url(#hole)">
    ${background(g.W, g.H, imageHref(coverPng), { dim: 0.55, glows: [{ x: g.W / 2, y: g.H / 2, r: Math.min(g.W, g.H) * 0.45, color: C.primary, opacity: 0.4 }] })}
    ${coverHalo(h)}
  </g>
  ${coverBorder(h)}
  ${brand ? textBlock(['ISLAND27'], { x: g.W / 2, y: g.H - Math.round(g.H * 0.06), size: 30, anchor: 'middle', family: HEAD, weight: 700, fill: C.accent, spacing: 8 }) : ''}
</svg>`;
  return render(svg);
}

module.exports = { C, YT, REELS, LOOP_FORMATS, youtubeLayer, reelsLayer, thumbnail, loopLayer, loopGeometry, fitText, measure, render };
