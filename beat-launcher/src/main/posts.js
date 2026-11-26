// Modelos de post do Instagram com a identidade da ISLAND27: feed (4:5), stories (9:16) e carrossel em vídeo.
// Cada slide é descrito por dados ({ layout: 'capa' | 'texto' | 'lista' | 'citacao' | 'cta' | 'beat' | 'precos' | 'story', ... }).
// Nos títulos, *palavra* fica em azul.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ff = require('./ffmpeg');
const D = require('./design');

const { C, HEAD, BODY, esc, measure, render, imageHref } = D;
const FORMATS = { feed: { W: 1080, H: 1350 }, story: { W: 1080, H: 1920 } };
const M = 84; // margem lateral

// ---------- texto ----------

/**
 * Separa "*destaque*" em palavras com cor. Cada palavra é uma lista de pedaços ({ w, accent }),
 * para a pontuação colada ao destaque ("*Frade*,") ficar junto, sem espaço.
 */
function tokens(text) {
  const out = [];
  let accent = false;
  let prevEndsSpace = true;
  for (const part of String(text).split(/(\*)/)) {
    if (part === '*') {
      accent = !accent;
      continue;
    }
    if (!part) continue;
    const words = part.split(/\s+/);
    words.forEach((w, i) => {
      if (!w) return;
      const glued = i === 0 && !prevEndsSpace && out.length;
      if (glued) out[out.length - 1].push({ w, accent });
      else out.push([{ w, accent }]);
    });
    prevEndsSpace = /\s$/.test(part);
  }
  return out;
}

const word = (t) => t.map((s) => s.w).join('');
const plain = (toks) => toks.map(word).join(' ');

/** Quebra em linhas que cabem em maxWidth (respeita \n). */
function wrap(text, size, maxWidth, font) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    const toks = tokens(para);
    if (!toks.length) {
      lines.push([]);
      continue;
    }
    let line = [];
    for (const t of toks) {
      const tryLine = [...line, t];
      if (line.length && measure(plain(tryLine), size, font) > maxWidth) {
        lines.push(line);
        line = [t];
      } else line = tryLine;
    }
    lines.push(line);
  }
  return lines;
}

/** Maior tamanho (de max até min) em que o texto cabe em até maxLines linhas. */
function fit(text, maxWidth, { max, min, maxLines, ...font }) {
  for (let size = max; size >= min; size -= 2) {
    const lines = wrap(text, size, maxWidth, font);
    if (lines.length <= maxLines && lines.every((l) => measure(plain(l), size, font) <= maxWidth)) return { size, lines };
  }
  return { size: min, lines: wrap(text, min, maxWidth, font).slice(0, maxLines) };
}

function rich(lines, { x, y, size, lh = 1.08, anchor = 'start', family = HEAD, weight = 700, fill = C.text, accent = C.accent, spacing = 0 }) {
  return lines
    .map((line, i) => {
      const spans = line
        .map((t, j) => t.map((s, k) => `<tspan fill="${s.accent ? accent : fill}">${esc(s.w)}${k === t.length - 1 && j < line.length - 1 ? ' ' : ''}</tspan>`).join(''))
        .join('');
      return `<text x="${x}" y="${(y + i * size * lh).toFixed(1)}" text-anchor="${anchor}" font-family="${family}" font-weight="${weight}" font-size="${size}" letter-spacing="${spacing}" xml:space="preserve">${spans}</text>`;
    })
    .join('');
}

const blockHeight = (lines, size, lh = 1.08) => (lines.length ? size + (lines.length - 1) * size * lh : 0);

// ---------- peças comuns ----------

function svgOpen(W, H) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="${Math.round(W / 9)}"/></filter>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="24"/></filter>
    <linearGradient id="fadeB" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.bg}" stop-opacity="0.15"/>
      <stop offset="0.45" stop-color="${C.bg}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${C.bg}" stop-opacity="0.96"/>
    </linearGradient>
    <linearGradient id="fadeT" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.bg}" stop-opacity="0.85"/>
      <stop offset="0.3" stop-color="${C.bg}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="fadeTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.bg}" stop-opacity="0.97"/>
      <stop offset="0.5" stop-color="${C.bg}" stop-opacity="0.8"/>
      <stop offset="0.85" stop-color="${C.bg}" stop-opacity="0.25"/>
      <stop offset="1" stop-color="${C.bg}" stop-opacity="0.55"/>
    </linearGradient>
    <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C.primary}"/><stop offset="1" stop-color="${C.accent}"/>
    </linearGradient>
  </defs>`;
}

/** Fundo: foto (preparada no tamanho certo) escurecida, ou preto com brilhos azuis. */
function bg(W, H, photo, { dim = 'bottom' } = {}) {
  if (photo) {
    return `<rect width="${W}" height="${H}" fill="${C.bg}"/>
    <image href="${imageHref(photo)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
    ${dim === 'full' ? `<rect width="${W}" height="${H}" fill="${C.bg}" opacity="0.6"/>` : ''}
    ${dim === 'top' ? `<rect width="${W}" height="${H}" fill="url(#fadeTop)"/>` : `<rect width="${W}" height="${H}" fill="url(#fadeB)"/><rect width="${W}" height="${H}" fill="url(#fadeT)"/>`}`;
  }
  return `<rect width="${W}" height="${H}" fill="${C.bg}"/>
    <circle cx="${W * 0.85}" cy="${H * 0.08}" r="${W * 0.42}" fill="${C.primary}" opacity="0.32" filter="url(#glow)"/>
    <circle cx="${W * 0.05}" cy="${H * 0.95}" r="${W * 0.35}" fill="${C.accent}" opacity="0.14" filter="url(#glow)"/>
    ${grid(W, H)}`;
}

/** Grade sutil de fundo (textura “de estúdio”). */
function grid(W, H) {
  let s = '';
  for (let x = 90; x < W; x += 90) s += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#fff" stroke-opacity="0.025"/>`;
  for (let y = 90; y < H; y += 90) s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#fff" stroke-opacity="0.025"/>`;
  return s;
}

function logo(x, y, size = 34, anchor = 'start') {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${HEAD}" font-weight="700" font-size="${size}" letter-spacing="${size * 0.08}"><tspan fill="${C.text}">ISLAND</tspan><tspan fill="${C.accent}">27</tspan></text>`;
}

function topBar(W, brand, { index, total } = {}) {
  const right = total > 1 ? `${index + 1}/${total}` : brand.handle || '';
  return `${logo(M, 104)}
  <text x="${W - M}" y="102" text-anchor="end" font-family="${BODY}" font-weight="600" font-size="24" letter-spacing="3" fill="${C.muted}">${esc(right)}</text>`;
}

function eyebrow(text, x, y, anchor = 'start') {
  if (!text) return '';
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${BODY}" font-weight="600" font-size="26" letter-spacing="7" fill="${C.accent}">${esc(String(text).toUpperCase())}</text>`;
}

/** Ícones simples em linha (cor da marca), centralizados em (cx, cy) com tamanho s. */
function icon(name, cx, cy, s) {
  const k = s / 100;
  const st = `fill="none" stroke="${C.accent}" stroke-width="${Math.max(3, 7 * k)}" stroke-linecap="round" stroke-linejoin="round"`;
  const P = (x, y) => `${(cx + (x - 50) * k).toFixed(1)} ${(cy + (y - 50) * k).toFixed(1)}`;
  switch (name) {
    case 'beats': // forma de onda
      return [12, 26, 40, 54, 68, 82, 96].map((x, i) => { const h = [18, 40, 70, 90, 60, 34, 16][i]; return `<line x1="${cx + (x - 54) * k}" y1="${cy - (h / 2) * k}" x2="${cx + (x - 54) * k}" y2="${cy + (h / 2) * k}" ${st}/>`; }).join('');
    case 'mix': // faders
      return [22, 50, 78].map((x, i) => { const ky = [30, 62, 44][i]; return `<line x1="${cx + (x - 50) * k}" y1="${cy - 42 * k}" x2="${cx + (x - 50) * k}" y2="${cy + 42 * k}" ${st}/><rect x="${cx + (x - 62) * k}" y="${cy + (ky - 58) * k}" width="${24 * k}" height="${16 * k}" rx="${4 * k}" fill="${C.accent}"/>`; }).join('');
    case 'master': // medidor
      return `<path d="M ${P(10, 70)} A ${40 * k} ${40 * k} 0 0 1 ${P(90, 70)}" ${st}/><line x1="${cx}" y1="${cy + 20 * k}" x2="${cx + 26 * k}" y2="${cy - 16 * k}" ${st}/><circle cx="${cx}" cy="${cy + 20 * k}" r="${7 * k}" fill="${C.accent}"/>`;
    case 'producao': // nota musical
      return `<path d="M ${P(38, 78)} L ${P(38, 20)} L ${P(82, 10)} L ${P(82, 66)}" ${st}/><ellipse cx="${cx + (28 - 50) * k}" cy="${cy + 30 * k}" rx="${13 * k}" ry="${10 * k}" fill="${C.accent}"/><ellipse cx="${cx + (72 - 50) * k}" cy="${cy + 18 * k}" rx="${13 * k}" ry="${10 * k}" fill="${C.accent}"/>`;
    case 'encomenda': // fone
      return `<path d="M ${P(16, 64)} L ${P(16, 50)} A ${34 * k} ${34 * k} 0 0 1 ${P(84, 50)} L ${P(84, 64)}" ${st}/><rect x="${cx - 40 * k}" y="${cy + 6 * k}" width="${18 * k}" height="${32 * k}" rx="${6 * k}" fill="${C.accent}"/><rect x="${cx + 22 * k}" y="${cy + 6 * k}" width="${18 * k}" height="${32 * k}" rx="${6 * k}" fill="${C.accent}"/>`;
    case 'cursos': // play
      return `<rect x="${cx - 44 * k}" y="${cy - 32 * k}" width="${88 * k}" height="${64 * k}" rx="${12 * k}" ${st}/><path d="M ${P(42, 36)} L ${P(64, 50)} L ${P(42, 64)} Z" fill="${C.accent}"/>`;
    case 'sobre': // ilha
      return `<path d="M ${P(6, 72)} L ${P(40, 30)} L ${P(56, 48)} L ${P(66, 38)} L ${P(94, 72)} Z" ${st}/><circle cx="${cx + 24 * k}" cy="${cy - 30 * k}" r="${9 * k}" fill="${C.accent}"/><line x1="${cx - 46 * k}" y1="${cy + 34 * k}" x2="${cx + 46 * k}" y2="${cy + 34 * k}" ${st}/>`;
    case 'contato': // balão
      return `<path d="M ${P(14, 22)} L ${P(86, 22)} L ${P(86, 66)} L ${P(46, 66)} L ${P(28, 82)} L ${P(28, 66)} L ${P(14, 66)} Z" ${st}/><circle cx="${cx - 18 * k}" cy="${cy - 6 * k}" r="${5 * k}" fill="${C.accent}"/><circle cx="${cx}" cy="${cy - 6 * k}" r="${5 * k}" fill="${C.accent}"/><circle cx="${cx + 18 * k}" cy="${cy - 6 * k}" r="${5 * k}" fill="${C.accent}"/>`;
    default:
      return '';
  }
}

/** Imagem inteira (ex.: banner 16:9) num cartão com brilho azul. */
function cardImage(card, x, y, w, h, r = 28) {
  if (!card) return '';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${C.primary}" opacity="0.5" filter="url(#soft)"/>
  <clipPath id="cardclip"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath>
  <image href="${imageHref(card)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cardclip)"/>
  <rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="${r}" fill="none" stroke="${C.accent}" stroke-opacity="0.4" stroke-width="2"/>`;
}

function accentLine(x, y, w = 120) {
  return `<rect x="${x}" y="${y}" width="${w}" height="6" rx="3" fill="url(#line)"/>`;
}

function dots(W, H, index, total) {
  if (!total || total < 2) return '';
  const gap = 22;
  const x0 = W / 2 - ((total - 1) * gap) / 2;
  return Array.from({ length: total }, (_, i) => `<circle cx="${x0 + i * gap}" cy="${H - 62}" r="${i === index ? 6 : 4.5}" fill="${i === index ? C.accent : '#fff'}" fill-opacity="${i === index ? 1 : 0.25}"/>`).join('');
}

function swipe(W, H) {
  return `<g><text x="${W - M}" y="${H - 54}" text-anchor="end" font-family="${BODY}" font-weight="600" font-size="26" letter-spacing="5" fill="${C.accent}">ARRASTA  →</text></g>`;
}

function pill(cx, y, label, { size = 30, solid = true, padX = 46, h = 82 } = {}) {
  const w = measure(label, size, { family: BODY, weight: 600, spacing: 2 }) + padX * 2;
  return `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${solid ? C.primary : 'none'}" stroke="${C.accent}" stroke-opacity="${solid ? 0 : 0.5}" stroke-width="2"/>
  <text x="${cx}" y="${y + h / 2 + size * 0.36}" text-anchor="middle" font-family="${BODY}" font-weight="600" font-size="${size}" letter-spacing="2" fill="${solid ? C.primaryText : C.accent}">${esc(label)}</text>`;
}

function chipsWrap(x, y, labels, maxW, { size = 26, h = 60, gap = 14 } = {}) {
  let cx = x;
  let cy = y;
  let out = '';
  for (const l of labels) {
    const w = measure(l, size, { family: BODY, weight: 600, spacing: 1 }) + h * 0.9;
    if (cx + w > x + maxW && cx > x) {
      cx = x;
      cy += h + gap;
    }
    out += `<rect x="${cx}" y="${cy}" width="${w}" height="${h}" rx="${h / 2}" fill="${C.accent}" fill-opacity="0.09" stroke="${C.accent}" stroke-opacity="0.4"/>
    <text x="${cx + w / 2}" y="${cy + h / 2 + size * 0.36}" text-anchor="middle" font-family="${BODY}" font-weight="600" font-size="${size}" letter-spacing="1" fill="${C.accent}">${esc(l)}</text>`;
    cx += w + gap;
  }
  return { svg: out, bottom: cy + h };
}

// ---------- layouts ----------

const LAYOUTS = {
  /** Capa de carrossel / post único: título grande sobre foto. */
  capa(s, { W, H, brand, index, total, photo, card }) {
    const maxW = W - 2 * M;
    const cardH = card ? Math.round(maxW / (s.cardRatio || 16 / 9)) : 0;
    const t = fit(s.title, maxW, { max: s.titleMax || 118, min: 64, maxLines: 5 });
    const sub = s.subtitle ? wrap(s.subtitle, 36, maxW, { family: BODY, weight: 400 }) : [];
    const bottom = H - (total > 1 ? 130 : 110);
    const subH = sub.length ? blockHeight(sub, 36, 1.3) + 34 : 0;
    const titleTop = bottom - subH - blockHeight(t.lines, t.size, 1.02);
    return `${bg(W, H, photo)}
    ${card ? cardImage(card, M, 170, maxW, cardH) : ''}
    ${topBar(W, brand, { index, total })}
    ${eyebrow(s.eyebrow, M, titleTop - 58)}
    ${accentLine(M, titleTop - 34, 120)}
    ${rich(t.lines, { x: M, y: titleTop + t.size * 0.82, size: t.size, lh: 1.02 })}
    ${sub.length ? rich(sub, { x: M, y: bottom - subH + 34 + 36 * 0.8, size: 36, lh: 1.3, family: BODY, weight: 400, fill: C.soft }) : ''}
    ${total > 1 ? swipe(W, H) + dots(W, H, index, total) : ''}`;
  },

  /** Dica numerada: número grande, título e texto. */
  texto(s, { W, H, brand, index, total, photo }) {
    const maxW = W - 2 * M;
    const t = fit(s.title, maxW, { max: 76, min: 48, maxLines: 3 });
    const body = fit(s.body || '', maxW, { max: 40, min: 30, maxLines: 11, family: BODY, weight: 400 });
    const contentH = 40 + blockHeight(t.lines, t.size, 1.04) + 54 + blockHeight(body.lines, body.size, 1.42);
    const y0 = photo ? 300 : Math.max(300, Math.round((H - contentH) / 2) - 20);
    const tY = y0 + 40 + t.size * 0.82;
    const bY = y0 + 40 + blockHeight(t.lines, t.size, 1.04) + 54 + body.size * 0.8;
    return `${bg(W, H, photo || null, { dim: 'top' })}
    ${topBar(W, brand, { index, total })}
    ${s.num ? `<text x="${W - M + 20}" y="${H * 0.62}" text-anchor="end" font-family="${HEAD}" font-weight="700" font-size="520" fill="${C.accent}" fill-opacity="0.07">${esc(s.num)}</text>` : ''}
    ${s.num ? `<text x="${M}" y="${y0 - 26}" font-family="${HEAD}" font-weight="700" font-size="40" fill="${C.accent}">${esc(s.num)}</text>` : eyebrow(s.eyebrow, M, y0 - 26)}
    ${accentLine(M, y0, 120)}
    ${rich(t.lines, { x: M, y: tY, size: t.size, lh: 1.04 })}
    ${rich(body.lines, { x: M, y: bY, size: body.size, lh: 1.42, family: BODY, weight: 400, fill: C.soft, accent: C.accent })}
    ${dots(W, H, index, total)}`;
  },

  /** Lista com marcadores. */
  lista(s, { W, H, brand, index, total, photo }) {
    const maxW = W - 2 * M;
    const t = fit(s.title, maxW, { max: 78, min: 48, maxLines: 3 });
    const IS = (s.items || []).length > 4 ? 38 : 44;
    const wrapped = (s.items || []).map((it) => wrap(it, IS, maxW - 80, { family: BODY, weight: 400 }));
    const itemsH = wrapped.reduce((a, l) => a + blockHeight(l, IS, 1.3) + 56, -56);
    const contentH = 40 + blockHeight(t.lines, t.size, 1.04) + 80 + itemsH;
    const top = Math.max(300, Math.round((H - contentH) / 2) - 10);
    let y = top + 40 + blockHeight(t.lines, t.size, 1.04) + 80 + IS * 0.8;
    let items = '';
    wrapped.forEach((lines, i) => {
      items += `<rect x="${M}" y="${y - IS * 0.8 - 6}" width="52" height="52" rx="14" fill="${C.primary}" fill-opacity="0.16" stroke="${C.accent}" stroke-opacity="0.45"/>`;
      items += `<text x="${M + 26}" y="${y - IS * 0.8 + 30}" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="28" fill="${C.accent}">${i + 1}</text>`;
      items += rich(lines, { x: M + 80, y, size: IS, lh: 1.3, family: BODY, weight: 400, fill: C.text });
      y += blockHeight(lines, IS, 1.3) + 56;
    });
    return `${bg(W, H, photo, { dim: 'full' })}
    ${topBar(W, brand, { index, total })}
    ${eyebrow(s.eyebrow, M, top - 26)}
    ${accentLine(M, top, 120)}
    ${rich(t.lines, { x: M, y: top + 40 + t.size * 0.82, size: t.size, lh: 1.04 })}
    ${items}
    ${dots(W, H, index, total)}`;
  },

  /** Frase de impacto / manifesto. */
  citacao(s, { W, H, brand, index, total, photo }) {
    const maxW = W - 2 * M;
    const q = fit(s.quote, maxW, { max: 84, min: 46, maxLines: 7 });
    const qh = blockHeight(q.lines, q.size, 1.12);
    const top = (H - qh) / 2 + (photo ? 120 : 20);
    return `${bg(W, H, photo, { dim: 'full' })}
    ${topBar(W, brand, { index, total })}
    <text x="${M - 8}" y="${top - 30}" font-family="${HEAD}" font-weight="700" font-size="220" fill="${C.accent}" fill-opacity="0.85">“</text>
    ${rich(q.lines, { x: M, y: top + q.size * 0.82 + 40, size: q.size, lh: 1.12 })}
    ${s.author ? `${accentLine(M, top + qh + 100, 70)}<text x="${M + 92}" y="${top + qh + 110}" font-family="${BODY}" font-weight="600" font-size="30" letter-spacing="4" fill="${C.soft}">${esc(s.author.toUpperCase())}</text>` : ''}
    ${dots(W, H, index, total)}`;
  },

  /** Chamada final: serviços, @ e botão. */
  cta(s, { W, H, brand, index, total, photo }) {
    const maxW = W - 2 * M;
    const t = fit(s.title, maxW, { max: 92, min: 54, maxLines: 4, });
    const tH = blockHeight(t.lines, t.size, 1.04);
    const body = s.body ? wrap(s.body, 36, maxW, { family: BODY, weight: 400 }) : [];
    const top = H * 0.30;
    const bodyY = top + tH + 60;
    const chipsY = bodyY + blockHeight(body, 36, 1.35) + 56;
    const chips = s.chips ? chipsWrap(M, chipsY, s.chips, maxW) : { svg: '', bottom: chipsY - 40 };
    return `${bg(W, H, photo, { dim: 'full' })}
    ${topBar(W, brand, { index, total })}
    ${eyebrow(s.eyebrow, M, top - 50)}
    ${rich(t.lines, { x: M, y: top + t.size * 0.82, size: t.size, lh: 1.04 })}
    ${body.length ? rich(body, { x: M, y: bodyY + 36 * 0.8, size: 36, lh: 1.35, family: BODY, weight: 400, fill: C.soft }) : ''}
    ${chips.svg}
    ${s.button ? pill(W / 2, Math.min(H - 250, chips.bottom + 90), s.button) : ''}
    ${logo(W / 2, H - 170, 30, 'middle')}
    <text x="${W / 2}" y="${H - 128}" text-anchor="middle" font-family="${BODY}" font-weight="600" font-size="24" letter-spacing="3" fill="${C.muted}">${esc(brand.handle || '')}</text>
    ${dots(W, H, index, total)}`;
  },

  /** Beat em destaque: capa grande + dados. */
  beat(s, { W, H, brand, index, total, photo, cover }) {
    const size = Math.min(W - 2 * M - 80, H * 0.5);
    const x = (W - size) / 2;
    const y = H === 1920 ? 430 : 200;
    const name = fit(String(s.nome || '').toUpperCase(), W - 2 * M, { max: 92, min: 50, maxLines: 2 });
    const nY = y + size + 70 + name.size * 0.82;
    const after = nY + (name.lines.length - 1) * name.size * 1.02;
    const chips = (s.chips || []).filter(Boolean);
    const chipsW = chips.reduce((a, l) => a + measure(l, 26, { family: BODY, weight: 600, spacing: 1 }) + 54 + 14, -14);
    const ch = chipsWrap(Math.max(M, (W - chipsW) / 2), after + 40, chips, W - 2 * M);
    const href = cover ? imageHref(cover) : null;
    return `${bg(W, H, null)}
    ${href ? `<image href="${href}" x="-60" y="-60" width="${W + 120}" height="${H + 120}" preserveAspectRatio="xMidYMid slice" opacity="0.35" filter="url(#soft)"/><rect width="${W}" height="${H}" fill="${C.bg}" opacity="0.55"/>` : ''}
    ${topBar(W, brand, { index, total })}
    ${eyebrow(s.eyebrow || 'BEAT NOVO', W / 2, y - 50, 'middle')}
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="34" fill="${C.primary}" opacity="0.55" filter="url(#soft)"/>
    ${href ? `<clipPath id="cv"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="34"/></clipPath><image href="${href}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cv)"/>` : ''}
    <rect x="${x + 1}" y="${y + 1}" width="${size - 2}" height="${size - 2}" rx="34" fill="none" stroke="${C.accent}" stroke-opacity="0.45" stroke-width="2"/>
    ${rich(name.lines, { x: W / 2, y: nY, size: name.size, lh: 1.02, anchor: 'middle' })}
    ${ch.svg}
    ${s.button ? pill(W / 2, Math.min(H - 220, ch.bottom + 50), s.button, { size: 28, h: 76 }) : ''}
    ${dots(W, H, index, total)}`;
  },

  /** Tabela de licenças/preços. */
  precos(s, { W, H, brand, index, total }) {
    const maxW = W - 2 * M;
    const t = fit(s.title, maxW, { max: 76, min: 48, maxLines: 2 });
    let y = 300 + 40 + blockHeight(t.lines, t.size, 1.04) + 60;
    const rowH = 150;
    let rows = '';
    for (const r of s.rows || []) {
      const hl = !!r.destaque;
      rows += `<rect x="${M}" y="${y}" width="${maxW}" height="${rowH - 20}" rx="24" fill="${hl ? C.primary : '#fff'}" fill-opacity="${hl ? 0.16 : 0.04}" stroke="${hl ? C.accent : '#fff'}" stroke-opacity="${hl ? 0.6 : 0.1}" stroke-width="2"/>
      <text x="${M + 36}" y="${y + 58}" font-family="${HEAD}" font-weight="700" font-size="40" fill="${C.text}">${esc(r.nome)}</text>
      <text x="${M + 36}" y="${y + 100}" font-family="${BODY}" font-weight="400" font-size="26" fill="${C.muted}">${esc(r.desc || '')}</text>
      <text x="${W - M - 36}" y="${y + 80}" text-anchor="end" font-family="${HEAD}" font-weight="700" font-size="${String(r.preco).length > 9 ? 34 : 46}" fill="${hl ? C.accent : C.text}">${esc(r.preco)}</text>
      ${hl ? `<text x="${W - M - 36}" y="${y + 32}" text-anchor="end" font-family="${BODY}" font-weight="600" font-size="18" letter-spacing="3" fill="${C.accent}">MAIS ESCOLHIDA</text>` : ''}`;
      y += rowH;
    }
    const note = s.note ? wrap(s.note, 28, maxW, { family: BODY, weight: 400 }) : [];
    return `${bg(W, H, null)}
    ${topBar(W, brand, { index, total })}
    ${eyebrow(s.eyebrow, M, 274)}
    ${accentLine(M, 300, 120)}
    ${rich(t.lines, { x: M, y: 340 + t.size * 0.82, size: t.size, lh: 1.04 })}
    ${rows}
    ${note.length ? rich(note, { x: M, y: y + 30, size: 28, lh: 1.35, family: BODY, weight: 400, fill: C.muted }) : ''}
    ${dots(W, H, index, total)}`;
  },

  /**
   * Capa de Destaque (a bolinha embaixo da bio). O Instagram recorta um círculo no centro:
   * ícone e nome ficam dentro dele.
   */
  'destaque-capa'(s, { W, H }) {
    const cx = W / 2;
    const cy = H / 2;
    return `<rect width="${W}" height="${H}" fill="${C.bg}"/>
    <circle cx="${cx}" cy="${cy}" r="${W * 0.52}" fill="${C.primary}" opacity="0.4" filter="url(#glow)"/>
    <circle cx="${cx}" cy="${cy}" r="430" fill="${C.deep}"/>
    <circle cx="${cx}" cy="${cy}" r="430" fill="none" stroke="${C.accent}" stroke-opacity="0.55" stroke-width="6"/>
    ${icon(s.icon, cx, cy - 70, 300)}
    <text x="${cx}" y="${cy + 210}" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="64" letter-spacing="6" fill="${C.text}">${esc(String(s.label || '').toUpperCase())}</text>`;
  },

  /** Story de serviço/produto para os Destaques: ícone, nome, descrição, o que inclui e chamada. */
  servico(s, { W, H, photo }) {
    const maxW = W - 2 * M;
    const t = fit(s.title, maxW, { max: 104, min: 60, maxLines: 3 });
    const body = s.body ? fit(s.body, maxW, { max: 40, min: 32, maxLines: 7, family: BODY, weight: 400 }) : { lines: [], size: 38 };
    let y = 520;
    let out = `${bg(W, H, photo, { dim: 'full' })}
    ${logo(W / 2, 200, 36, 'middle')}
    ${s.icon ? `<circle cx="${M + 62}" cy="${y - 110}" r="62" fill="${C.primary}" fill-opacity="0.16" stroke="${C.accent}" stroke-opacity="0.5" stroke-width="3"/>${icon(s.icon, M + 62, y - 110, 70)}` : ''}
    ${eyebrow(s.eyebrow, s.icon ? M + 150 : M, y - 100)}`;
    out += rich(t.lines, { x: M, y: y + 40 + t.size * 0.82, size: t.size, lh: 1.04 });
    y += 40 + blockHeight(t.lines, t.size, 1.04) + 50;
    if (body.lines.length) {
      out += rich(body.lines, { x: M, y: y + body.size * 0.8, size: body.size, lh: 1.4, family: BODY, weight: 400, fill: C.soft });
      y += blockHeight(body.lines, body.size, 1.4) + 60;
    }
    for (const it of s.items || []) {
      const lines = wrap(it, 38, maxW - 70, { family: BODY, weight: 400 });
      out += `<path d="M ${M + 4} ${y - 14} l 12 12 l 22 -26" fill="none" stroke="${C.accent}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
      out += rich(lines, { x: M + 64, y, size: 38, lh: 1.3, family: BODY, weight: 400, fill: C.text });
      y += blockHeight(lines, 38, 1.3) + 34;
    }
    if (s.price) out += `<text x="${M}" y="${y + 70}" font-family="${HEAD}" font-weight="700" font-size="56" fill="${C.accent}">${esc(s.price)}</text>`;
    if (s.button) out += pill(W / 2, H - 470, s.button);
    if (s.footer) out += `<text x="${W / 2}" y="${H - 340}" text-anchor="middle" font-family="${BODY}" font-weight="600" font-size="28" letter-spacing="4" fill="${C.muted}">${esc(s.footer)}</text>`;
    return out;
  },

  /** Story: título no alto, espaço livre para enquete/link (adicionados no app do Instagram). */
  story(s, { W, H, brand, photo, cover, card }) {
    const maxW = W - 2 * M;
    const t = fit(s.title, maxW, { max: 112, min: 56, maxLines: 5 });
    const top = 360;
    const body = s.body ? wrap(s.body, 38, maxW, { family: BODY, weight: 400 }) : [];
    const bodyY = top + blockHeight(t.lines, t.size, 1.04) + 60;
    let mid = '';
    if (cover) {
      const size = 620;
      const x = (W - size) / 2;
      const y = Math.max(bodyY + blockHeight(body, 38, 1.35) + 60, 860);
      mid = `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="30" fill="${C.primary}" opacity="0.55" filter="url(#soft)"/>
      <clipPath id="sc"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="30"/></clipPath>
      <image href="${imageHref(cover)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#sc)"/>`;
    } else if (card) {
      const ch = Math.round(maxW / (s.cardRatio || 16 / 9));
      mid = cardImage(card, M, Math.max(bodyY + blockHeight(body, 38, 1.35) + 80, 900), maxW, ch);
    }
    return `${bg(W, H, photo, { dim: s.dim || 'full' })}
    ${logo(W / 2, 200, 36, 'middle')}
    ${eyebrow(s.eyebrow, W / 2, top - 60, 'middle')}
    ${rich(t.lines, { x: W / 2, y: top + t.size * 0.82, size: t.size, lh: 1.04, anchor: 'middle' })}
    ${body.length ? rich(body, { x: W / 2, y: bodyY + 38 * 0.8, size: 38, lh: 1.35, anchor: 'middle', family: BODY, weight: 400, fill: C.soft }) : ''}
    ${mid}
    ${s.button ? pill(W / 2, H - 420, s.button) : ''}
    ${s.footer ? `<text x="${W / 2}" y="${H - 300}" text-anchor="middle" font-family="${BODY}" font-weight="600" font-size="28" letter-spacing="4" fill="${C.muted}">${esc(s.footer)}</text>` : ''}`;
  },
};

// ---------- imagens e renderização ----------

/** Recorta a foto no tamanho exato (cache por arquivo + tamanho + foco). */
async function preparePhoto(file, W, H, workDir, focus = 'center') {
  if (!file) return null;
  const key = crypto.createHash('md5').update(`${file}|${fs.statSync(file).mtimeMs}|${W}x${H}|${focus}`).digest('hex').slice(0, 12);
  const out = path.join(workDir, `foto-${key}.jpg`);
  if (fs.existsSync(out)) return out;
  const y = focus === 'top' ? '0' : focus === 'bottom' ? 'ih-oh' : '(ih-oh)/2';
  await ff.runOk(['-y', '-hide_banner', '-i', file, '-frames:v', '1', '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H}:(iw-ow)/2:${y}`, '-q:v', '3', out]);
  return out;
}

/** Gera o PNG de um slide. */
async function renderSlide(slide, { format = 'feed', brand = {}, index = 0, total = 1, workDir }) {
  const { W, H } = FORMATS[format] || FORMATS.feed;
  const layout = LAYOUTS[slide.layout] || LAYOUTS.texto;
  const photo = slide.photo ? await preparePhoto(slide.photo, W, H, workDir, slide.focus) : null;
  const cw = W - 2 * M;
  const card = slide.card ? await preparePhoto(slide.card, cw * 2, Math.round((cw * 2) / (slide.cardRatio || 16 / 9)), workDir) : null;
  const cover = slide.cover ? await ff.squareCover(slide.cover, path.join(workDir, `capa-${crypto.createHash('md5').update(slide.cover).digest('hex').slice(0, 10)}.png`), 1000) : null;
  const svg = `${svgOpen(W, H)}${layout(slide, { W, H, brand, index, total, photo, cover, card })}</svg>`;
  return render(svg);
}

/**
 * Gera os arquivos de um post.
 * post: { id, kind: 'carrossel'|'imagem'|'story'|'reels-carrossel', format, slides: [...], audio?, caption }
 * Retorna { images: [png...], video?: mp4 }.
 */
async function renderPost(post, { outDir, workDir, brand }) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });
  const format = post.format || (post.kind === 'story' ? 'story' : 'feed');
  const images = [];
  const total = post.slides.length;
  for (let i = 0; i < total; i++) {
    const png = await renderSlide(post.slides[i], { format, brand, index: i, total, workDir });
    const f = path.join(outDir, `${String(i + 1).padStart(2, '0')}.png`);
    fs.writeFileSync(f, png);
    images.push(f);
  }
  const result = { images };
  if (post.kind === 'reels-carrossel' || post.video) {
    result.video = path.join(outDir, 'reels.mp4');
    await slidesVideo(images, result.video, { format, audio: post.audio, audioStart: post.audioStart, seconds: post.secondsPerSlide || 3, workDir });
  }
  if (post.caption) fs.writeFileSync(path.join(outDir, 'legenda.txt'), post.caption);
  return result;
}

/**
 * Transforma slides em vídeo 9:16 (Reels): cada slide com zoom leve e transição de “arrastar”.
 * Slides 4:5 ficam centralizados sobre o fundo da marca.
 */
async function slidesVideo(images, out, { format = 'feed', audio, audioStart = 0, seconds = 3, workDir, fps = 30 }) {
  const W = 1080;
  const H = 1920;
  const T = 0.45; // transição
  const args = ['-y', '-hide_banner'];
  const g = [];
  images.forEach((img, i) => {
    args.push('-loop', '1', '-framerate', String(fps), '-t', (seconds + T).toFixed(2), '-i', img);
    const frames = Math.round((seconds + T) * fps);
    const sh = format === 'story' ? H : 1350;
    const pad = format === 'story' ? '' : `,pad=${W}:${H}:0:${(H - sh) / 2}:color=0x08090c`;
    g.push(`[${i}:v]scale=${W * 2}:${sh * 2},zoompan=z='1+0.035*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${sh}:fps=${fps}${pad},setsar=1,format=yuv420p,trim=duration=${(seconds + T).toFixed(2)},setpts=PTS-STARTPTS,fps=${fps},settb=AVTB[s${i}]`);
  });
  let cur = 's0';
  let len = seconds + T;
  for (let i = 1; i < images.length; i++) {
    g.push(`[${cur}][s${i}]xfade=transition=slideleft:duration=${T}:offset=${(len - T).toFixed(3)}[x${i}]`);
    cur = `x${i}`;
    len += seconds;
  }
  const total = len;
  let aMap = null;
  if (audio) {
    args.push('-ss', String(audioStart || 0), '-t', (total + 0.2).toFixed(2), '-i', audio);
    g.push(`[${images.length}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.3,afade=t=out:st=${Math.max(0, total - 1.5).toFixed(3)}:d=1.5[a]`);
    aMap = '[a]';
  }
  g.push(`[${cur}]format=yuv420p[v]`);
  const script = path.join(workDir || path.dirname(out), `slides-${Date.now()}.txt`);
  fs.writeFileSync(script, g.join(';\n'));
  args.push('-filter_complex_script', script, '-map', '[v]');
  if (aMap) args.push('-map', aMap, '-c:a', 'aac', '-b:a', '192k');
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(fps), '-t', total.toFixed(3), '-movflags', '+faststart', out);
  try {
    await ff.runOk(args);
  } finally {
    fs.rm(script, { force: true }, () => {});
  }
  return out;
}

module.exports = { LAYOUTS, FORMATS, renderSlide, renderPost, slidesVideo, preparePhoto, wrap, fit, tokens };
