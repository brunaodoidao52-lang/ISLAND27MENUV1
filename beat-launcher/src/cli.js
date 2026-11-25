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
