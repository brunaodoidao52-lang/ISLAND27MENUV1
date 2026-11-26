#!/usr/bin/env node
// Linha de comando do Beat Launcher (para rodar sem a janela, por exemplo na nuvem).
//
//   node src/cli.js gerar --beat beat.mp3 --capa capa.jpg --nome "Noite" [--artista Veigh --genero Trap --bpm 140 --tom Cm --fundo fundo.mp4] [--saida pasta]
//   node src/cli.js pasta ./entrada [--saida pasta]        gera tudo o que tiver beat + capa com o mesmo nome
//   node src/cli.js loop --imagem capa.jpg [--formato 9:16 --segundos 8 --estilo respirar|pulso|deriva --bpm 140 --grao] [--saida loop.mp4]
//   node src/cli.js textos --nome "Noite" [--artista ... --genero ... --bpm ...]   só mostra os textos
const fs = require('fs');
const os = require('os');
const path = require('path');
const { renderBeat, renderLoop, safeName } = require('./main/pipeline');
const { pairFiles } = require('./main/engine');
const texts = require('./shared/texts');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[k] = true;
      else {
        out[k] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

function loadSettings(file) {
  if (!file) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function bar(label) {
  let last = '';
  return (fase, p) => {
    const line = `${fase} ${Math.round(p * 100)}%`;
    if (line === last) return;
    last = line;
    if (process.stdout.isTTY) process.stdout.write(`\r${label}${line.padEnd(48)}`);
    else if (p === 0 || p === 1) console.log(`${label}${line}`);
  };
}

function writeTexts(dir, t) {
  const f = path.join(dir, 'textos.txt');
  fs.writeFileSync(
    f,
    [
      '=== YOUTUBE: TÍTULO ===', t.ytTitle, '',
      '=== YOUTUBE: DESCRIÇÃO ===', t.ytDescription, '',
      '=== YOUTUBE: TAGS ===', t.ytTags.join(', '), '',
      '=== INSTAGRAM: LEGENDA ===', t.igCaption, '',
    ].join('\n'),
  );
  return f;
}

async function gerar(beat, args, settings) {
  const outDir = path.resolve(args.saida || path.join(process.cwd(), 'saida', safeName(beat.nome)));
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'island27-'));
  try {
    const r = await renderBeat(beat, { outDir, workDir, settings, onProgress: bar(`${beat.nome}: `) });
    if (process.stdout.isTTY) process.stdout.write('\n');
    const tf = writeTexts(outDir, r.texts);
    console.log(`\n✔ ${beat.nome}`);
    console.log(`  BPM: ${beat.bpm || r.analysis.bpm || '?'}${beat.bpm ? '' : ' (estimado)'}  |  drop em ${r.analysis.dropStart.toFixed(1)} s  |  duração ${r.analysis.duration.toFixed(1)} s`);
    for (const [k, v] of Object.entries(r.outputs)) console.log(`  ${k.padEnd(8)} ${v}`);
    console.log(`  textos   ${tf}`);
    return r;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const settings = loadSettings(args.config);
  const meta = { nome: args.nome, artista: args.artista, genero: args.genero, bpm: args.bpm ? Number(args.bpm) : null, tom: args.tom, motion: args.animacao };

  if (cmd === 'gerar') {
    if (!args.beat || !args.capa) throw new Error('Use: gerar --beat arquivo.mp3 --capa capa.jpg --nome "Nome"');
    await gerar({ ...meta, nome: meta.nome || texts.nameFromFile(args.beat), audioPath: path.resolve(args.beat), coverPath: path.resolve(args.capa), bgPath: args.fundo ? path.resolve(args.fundo) : '' }, args, settings);
  } else if (cmd === 'pasta') {
    const dir = path.resolve(args._[0] || '.');
    const files = fs.readdirSync(dir).map((f) => path.join(dir, f));
    const { pairs, errors } = pairFiles(files);
    errors.forEach((e) => console.warn(`! ${e}`));
    if (!pairs.length) throw new Error('Nenhum par beat + capa encontrado (use o mesmo nome: Noite.mp3 + Noite.jpg).');
    const base = path.resolve(args.saida || path.join(process.cwd(), 'saida'));
    for (const p of pairs) {
      const extra = p.txt ? texts.parseSidecar(fs.readFileSync(p.txt, 'utf8')) : {};
      const beat = { ...meta, nome: texts.nameFromFile(p.audio), ...extra, audioPath: p.audio, coverPath: p.image, bgPath: p.video || '' };
      await gerar(beat, { saida: path.join(base, safeName(beat.nome)) }, settings);
    }
  } else if (cmd === 'loop') {
    if (!args.imagem) throw new Error('Use: loop --imagem capa.jpg --formato 9:16 --segundos 8 --estilo respirar');
    const estilo = { respirar: 'breath', pulso: 'pulse', deriva: 'drift' }[args.estilo] || args.estilo || 'breath';
    const out = path.resolve(args.saida || `${path.basename(args.imagem, path.extname(args.imagem))}-loop-${(args.formato || '1:1').replace(':', 'x')}.mp4`);
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'island27-'));
    try {
      await renderLoop(
        { image: path.resolve(args.imagem), out, workDir, format: args.formato || '1:1', seconds: Number(args.segundos) || 5, style: estilo, bpm: Number(args.bpm) || 120, grain: !!args.grao, brand: !args['sem-marca'] },
        (p) => bar('Loop: ')('gerando', p),
      );
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
    console.log(`\n✔ ${out}`);
  } else if (cmd === 'semana') {
    // node src/cli.js semana --inicio 2026-11-27 [--numero 0] --artista foto.jpg --ilha foto.jpg --banner banner.png [--saida pasta]
    const { buildWeek } = require('./shared/plan');
    const { renderWeek } = require('./main/marketing');
    const inicio = args.inicio ? new Date(`${args.inicio}T00:00:00`) : new Date(Date.now() + 86400000);
    const photos = {};
    for (const k of ['artista', 'artista2', 'ilha', 'banner', 'flyer']) if (args[k]) photos[k] = path.resolve(args[k]);
    const marketing = { ...(settings.marketing || {}), photos: { ...((settings.marketing || {}).photos || {}), ...photos } };
    if (args.handle) marketing.handle = args.handle;
    const posts = buildWeek(inicio, { ...settings, marketing }, [], Number(args.numero) || 0);
    const outDir = path.resolve(args.saida || path.join(process.cwd(), `marketing-${inicio.toISOString().slice(0, 10)}`));
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'island27-'));
    try {
      const r = await renderWeek(posts, {
        outDir, workDir, brand: { handle: marketing.handle || '@__island27' },
        title: `ISLAND27 · Semana de ${inicio.toLocaleDateString('pt-BR')}`,
        onProgress: (p, i, n) => console.log(`[${i + 1}/${n}] ${p.titulo}`),
      });
      console.log(`\n✔ ${r.length} posts em ${outDir} (veja o CALENDARIO.md)`);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  } else if (cmd === 'vitrine') {
    // Destaques do perfil (Beats, Serviços, Cursos, Sobre, Contato) + carrossel fixado de serviços.
    // node src/cli.js vitrine --artista foto.jpg --artista2 foto.jpg --ilha foto.jpg --banner banner.png [--saida pasta]
    const { highlights, servicesCarousel } = require('./shared/plan');
    const { renderOne } = require('./main/marketing');
    const photos = {};
    for (const k of ['artista', 'artista2', 'ilha', 'banner', 'flyer']) if (args[k]) photos[k] = path.resolve(args[k]);
    const st = { ...settings, marketing: { ...(settings.marketing || {}), photos: { ...((settings.marketing || {}).photos || {}), ...photos } } };
    const brand = { handle: (st.marketing && st.marketing.handle) || '@__island27' };
    const outDir = path.resolve(args.saida || path.join(process.cwd(), 'vitrine'));
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'island27-'));
    const list = [servicesCarousel(st), ...highlights(st)];
    try {
      for (let i = 0; i < list.length; i++) {
        const post = { ...list[i], date: new Date().toISOString() };
        const dir = path.join(outDir, `${String(i + 1).padStart(2, '0')}-${post.titulo.replace(/^[^:]+:\s*/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').toLowerCase().slice(0, 40)}`);
        const { renderPost } = require('./main/posts');
        fs.mkdirSync(dir, { recursive: true });
        await renderPost(post, { outDir: dir, workDir, brand });
        if (post.notes) fs.writeFileSync(path.join(dir, 'como-postar.txt'), post.notes);
        console.log(`[${i + 1}/${list.length}] ${post.titulo}`);
      }
      console.log(`\n✔ Vitrine em ${outDir}`);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  } else if (cmd === 'textos') {
    const t = texts.generate(meta, settings);
    console.log(`${t.ytTitle}\n\n${t.ytDescription}\n\nTags: ${t.ytTags.join(', ')}\n\n---\n${t.igCaption}`);
  } else {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 8).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    if (cmd) process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`\n✖ ${e.message}`);
  process.exit(1);
});
