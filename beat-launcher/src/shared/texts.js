// Textos automáticos: título, descrição e tags do YouTube, legenda do Instagram e frase do vídeo.
// Modelos usam {campo}; "{artista|genero}" usa o primeiro que estiver preenchido.
// Linhas cujo campo ficou vazio são removidas sozinhas (ex.: sem WhatsApp, some a linha do WhatsApp).

const GENEROS = ['Trap', 'Funk', 'Trap Funk', 'Drill', 'Phonk BR', 'Plugg', 'R&B', 'Boom Bap', 'Afrobeat', 'Pop', 'Outro'];

const HASHTAGS = {
  trap: ['trap', 'trapbrasil', 'trapbeat'],
  funk: ['funk', 'funkbrasileiro', 'beatdefunk'],
  'trap funk': ['trapfunk', 'funk', 'trap'],
  drill: ['drill', 'drillbrasil', 'drillbeat'],
  'phonk br': ['brazilianphonk', 'phonk', 'funk'],
  plugg: ['plugg', 'pluggnb', 'trap'],
  'r&b': ['rnb', 'rnbbeat', 'rnbbrasil'],
  'boom bap': ['boombap', 'rapnacional', 'hiphop'],
  afrobeat: ['afrobeat', 'afrobeats', 'afro'],
  pop: ['pop', 'popbeat', 'musica'],
};
const HASHTAGS_BASE = ['typebeat', 'beatmaker', 'produtormusical', 'beats', 'island27'];

// Frases curtas que aparecem no topo do Reels (sem emoji: a fonte do vídeo não tem emoji).
const GANCHOS_VIDEO = [
  'ESSE AQUI TÁ PESADO',
  'SE VOCÊ RIMA, ESSE É SEU',
  'IMAGINA SUA VOZ AQUI',
  'BEAT NOVO SAINDO DO FORNO',
  'GRAVA EM CIMA DESSE?',
  'ESSE É PRA QUEM QUER ESTOURAR',
  'SOLTA O VOLUME',
];

const GANCHOS_LEGENDA = [
  'Esse aqui tá pesado demais 🔥',
  'Se você rima, esse beat é seu 🎤',
  'Imagina a sua voz nesse beat 👀',
  'Beat novo saindo do forno 🔥',
  'Quem grava em cima desse? 🎙️',
  'Esse é pra quem quer estourar 🚀',
  'Solta o volume e me fala o que achou 🔊',
];

const DEFAULT_TEMPLATES = {
  ytTitle: '[GRÁTIS] {artista|genero} Type Beat {ano} - "{nome}" | Prod. ISLAND27',
  ytDescription: [
    '💰 Comprar / licenciar este beat: {loja}',
    '📲 Compra rápida no Pix (WhatsApp): {whatsapp}',
    '🎁 Download grátis (uso não comercial): {download}',
    '',
    '🎹 "{nome}" | {artista|genero} Type Beat',
    'BPM: {bpm}',
    'Tom: {tom}',
    'Prod. ISLAND27',
    '',
    '⚠️ Uso livre só para fins não comerciais, com o crédito "Prod. ISLAND27" no título.',
    'Para lançar no Spotify, YouTube e outras plataformas, compre uma licença no link acima.',
    '',
    '📸 Instagram: {instagram}',
    '',
    '{hashtags_yt}',
  ].join('\n'),
  igCaption: [
    '{gancho}',
    '',
    '🎧 "{nome}" | {artista|genero} Type Beat',
    '⚡ {bpm} BPM',
    'Prod. ISLAND27',
    '',
    '💬 Comenta "BEAT" que eu te mando o link no direct.',
    '🛒 Licenças e beat completo: link na bio.',
    '',
    '{hashtags_ig}',
  ].join('\n'),
  cta: 'COMENTA "BEAT" E RECEBE NO DIRECT',
};

function slug(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

/** Escolhe sempre a mesma frase para o mesmo beat (e frases diferentes entre beats). */
function pick(list, key) {
  return list[hash(key) % list.length];
}

function hashtags(beat, max) {
  const g = HASHTAGS[String(beat.genero || '').toLowerCase()] || [];
  const a = slug(beat.artista);
  const list = [];
  if (a) list.push(`${a}typebeat`);
  for (const t of [...g, ...HASHTAGS_BASE]) if (!list.includes(t)) list.push(t);
  return list.slice(0, max).map((t) => `#${t}`);
}

function fields(beat, links = {}, now = new Date()) {
  const bpm = beat.bpm ? String(Math.round(beat.bpm)) : '';
  return {
    nome: (beat.nome || '').trim(),
    artista: (beat.artista || '').trim(),
    genero: beat.genero && beat.genero !== 'Outro' ? beat.genero : '',
    bpm,
    tom: (beat.tom || '').trim(),
    ano: String(now.getFullYear()),
    loja: links.loja || '',
    whatsapp: links.whatsapp || '',
    download: links.download || '',
    instagram: links.instagram || '',
    gancho: pick(GANCHOS_LEGENDA, beat.nome || ''),
    // YouTube mostra até 3 hashtags acima do título; o Instagram passou a limitar a 5 por post.
    hashtags_yt: hashtags(beat, 3).join(' '),
    hashtags_ig: hashtags(beat, 5).join(' '),
  };
}

function fillLine(line, f) {
  let empty = false;
  const out = line.replace(/\{([a-z_|]+)\}/gi, (_m, keys) => {
    const v = keys.split('|').map((k) => f[k.trim()]).find((x) => x);
    if (!v) empty = true;
    return v || '';
  });
  return { out, empty };
}

/** Preenche um modelo. Linhas com campo vazio somem; linhas em branco repetidas viram uma só. */
function fill(template, f) {
  const lines = [];
  for (const line of String(template).split('\n')) {
    const { out, empty } = fillLine(line, f);
    if (empty) continue;
    if (out.trim() === '' && (lines.length === 0 || lines[lines.length - 1].trim() === '')) continue;
    lines.push(out);
  }
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.join('\n');
}

/** Título de até 100 caracteres (limite do YouTube): corta os trechos depois de "|" e, se ainda passar, o fim. */
function fitTitle(title, max = 100) {
  let t = title.replace(/\s+/g, ' ').trim();
  while (t.length > max && t.includes(' | ')) t = t.slice(0, t.lastIndexOf(' | ')).trim();
  if (t.length > max) t = `${t.slice(0, max - 1).trim()}…`;
  return t;
}

/** O YouTube conta 500 caracteres no total; tags com espaço contam as aspas, e cada vírgula conta. */
function tagsLength(tags) {
  return tags.reduce((n, t) => n + t.length + (t.includes(' ') ? 2 : 0), 0) + Math.max(0, tags.length - 1);
}

function ytTags(beat, now = new Date()) {
  const f = fields(beat, {}, now);
  const raw = [];
  const ano = f.ano;
  if (f.artista) raw.push(`${f.artista} type beat`, `${f.artista} type beat ${ano}`, `beat ${f.artista}`);
  if (f.genero) raw.push(`${f.genero} type beat`, `${f.genero} beat`, `beat de ${f.genero}`, `${f.genero} instrumental`);
  raw.push('type beat', `type beat ${ano}`, 'free beat', 'beat grátis', 'beat para rima', 'instrumental');
  if (f.nome) raw.push(f.nome);
  raw.push('island27', 'prod island27');
  const tags = [];
  const seen = new Set();
  for (const t of raw) {
    const clean = t.replace(/[<>,]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!clean || seen.has(clean) || clean.length > 100) continue;
    if (tagsLength([...tags, clean]) > 500) break;
    seen.add(clean);
    tags.push(clean);
  }
  return tags;
}

/** Gera todos os textos de um beat. */
function generate(beat, settings = {}, now = new Date()) {
  const tpl = { ...DEFAULT_TEMPLATES, ...(settings.templates || {}) };
  const f = fields(beat, settings.links || {}, now);
  return {
    ytTitle: fitTitle(fill(tpl.ytTitle, f).replace(/\n/g, ' ')),
    ytDescription: fill(tpl.ytDescription, f).slice(0, 5000),
    ytTags: ytTags(beat, now),
    igCaption: fill(tpl.igCaption, f).slice(0, 2200),
    hook: pick(GANCHOS_VIDEO, beat.nome || ''),
    cta: tpl.cta || DEFAULT_TEMPLATES.cta,
  };
}

/** Nome do beat a partir do arquivo: "noite_fria-140bpm.mp3" -> "Noite Fria". */
function nameFromFile(file) {
  const base = String(file).split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  const clean = base
    .replace(/[_-]+/g, ' ')
    .replace(/\b\d{2,3}\s*bpm\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.replace(/(^|\s)(\p{L})/gu, (_m, s, c) => s + c.toUpperCase());
}

/** Lê "artista: X / genero: Y / bpm: 140 / tom: Cm" de um .txt opcional ao lado do beat. */
function parseSidecar(text) {
  const out = {};
  const map = { nome: 'nome', name: 'nome', artista: 'artista', artist: 'artista', genero: 'genero', 'gênero': 'genero', bpm: 'bpm', tom: 'tom', key: 'tom' };
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*([^:=]+?)\s*[:=]\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const k = map[m[1].toLowerCase()];
    if (!k) continue;
    out[k] = k === 'bpm' ? Number(m[2].replace(',', '.')) || undefined : m[2];
  }
  if (out.genero) {
    const g = GENEROS.find((x) => slug(x) === slug(out.genero));
    if (g) out.genero = g;
  }
  return out;
}

module.exports = {
  GENEROS,
  DEFAULT_TEMPLATES,
  GANCHOS_VIDEO,
  generate,
  fill,
  fields,
  fitTitle,
  ytTags,
  tagsLength,
  hashtags,
  nameFromFile,
  parseSidecar,
};
