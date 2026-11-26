// Transforma o plano da semana em arquivos prontos: uma pasta por post com artes, vídeo, legenda e roteiro,
// mais um CALENDARIO.md com tudo em ordem.
const fs = require('fs');
const path = require('path');
const { renderPost } = require('./posts');
const { KIND_LABEL } = require('../shared/plan');

const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const pad = (n) => String(n).padStart(2, '0');

function whenLabel(iso) {
  const d = new Date(iso);
  return `${WEEK[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}h${pad(d.getMinutes())}`;
}

function folderName(post, i) {
  const d = new Date(post.date);
  const slug = String(post.kind).replace(/[^a-z-]/g, '');
  return `${pad(i + 1)}-${WEEK[d.getDay()]}-${pad(d.getDate())}-${pad(d.getHours())}h${pad(d.getMinutes())}-${slug}`;
}

/** Gera os arquivos de um post e devolve { dir, images, video }. */
async function renderOne(post, i, { outDir, workDir, brand }) {
  const dir = path.join(outDir, folderName(post, i));
  fs.mkdirSync(dir, { recursive: true });
  let files = { images: [] };
  if (post.slides && post.slides.length) files = await renderPost(post, { outDir: dir, workDir, brand });
  if (post.caption) fs.writeFileSync(path.join(dir, 'legenda.txt'), post.caption);
  if (post.roteiro) fs.writeFileSync(path.join(dir, 'roteiro.txt'), `${post.titulo}\n\n${post.roteiro.join('\n')}\n`);
  if (post.notes) fs.writeFileSync(path.join(dir, 'como-postar.txt'), post.notes);
  return { dir, ...files };
}

function calendarMarkdown(posts, results, title) {
  const lines = [`# ${title}`, '', '| Quando | O quê | Pilar | Pasta |', '|---|---|---|---|'];
  posts.forEach((p, i) => {
    lines.push(`| ${whenLabel(p.date)} | ${KIND_LABEL[p.kind] || p.kind}: ${p.titulo.replace(/^[^:]+:\s*/, '')} | ${p.pilar || ''} | \`${path.basename(results[i].dir)}\` |`);
  });
  lines.push('', '## Detalhes', '');
  posts.forEach((p, i) => {
    lines.push(`### ${whenLabel(p.date)} · ${p.titulo}`, '');
    if (p.kind === 'reels-gravar') lines.push('**Para gravar:**', '', ...p.roteiro.map((r) => `- ${r}`), '');
    if (p.kind === 'reels-beat') lines.push('Sai automático pela fila de beats do Beat Launcher (o Reels do beat é gerado lá).', '');
    if (p.notes) lines.push(`**Como postar:** ${p.notes}`, '');
    if (p.caption) lines.push('**Legenda:**', '', '```', p.caption, '```', '');
  });
  return lines.join('\n');
}

/** Gera a semana inteira. Retorna [{ post, dir, images, video }]. */
async function renderWeek(posts, { outDir, workDir, brand, title = 'Calendário da semana', onProgress = () => {} }) {
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (let i = 0; i < posts.length; i++) {
    onProgress(posts[i], i, posts.length);
    results.push(await renderOne(posts[i], i, { outDir, workDir, brand }));
  }
  fs.writeFileSync(path.join(outDir, 'CALENDARIO.md'), calendarMarkdown(posts, results, title));
  return posts.map((post, i) => ({ post, ...results[i] }));
}

module.exports = { renderWeek, renderOne, whenLabel, folderName, calendarMarkdown };
