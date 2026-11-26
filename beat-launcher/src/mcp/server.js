#!/usr/bin/env node
// Conector do Claude (MCP) para o ISLAND27 Beat Launcher.
// Fala com o app aberto pela porta de controle local (src/main/control.js) e dá ao Claude ferramentas para
// ver a fila, lançar beats, escrever textos, usar a IA configurada pelo usuário (DeepSeek ou outra) e fazer o marketing.
//
// Como rodar (o app instalado já mostra isto pronto em Configurações → Conectar ao Claude):
//   ELECTRON_RUN_AS_NODE=1 "<ISLAND27 Beat Launcher.exe>" "<...>/src/mcp/server.js"   (ou: node src/mcp/server.js)
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const APP = 'ISLAND27 Beat Launcher';

function dataDir() {
  if (process.env.ISLAND27_DATA_DIR) return process.env.ISLAND27_DATA_DIR;
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), APP);
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', APP);
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), APP);
}

const NOT_OPEN = `O ${APP} não está aberto (ou a conexão com o Claude está desligada nas Configurações dele). Peça ao usuário para abrir o app e tente de novo.`;

/** Chama uma ação do app. */
function call(name, ...args) {
  let info;
  try {
    info = JSON.parse(fs.readFileSync(path.join(dataDir(), 'controle-claude.json'), 'utf8'));
  } catch {
    return Promise.reject(new Error(NOT_OPEN));
  }
  const body = JSON.stringify({ name, args });
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: info.port, path: '/call', method: 'POST', headers: { Authorization: `Bearer ${info.token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 120000 },
      (res) => {
        let data = '';
        res.on('data', (d) => (data += d));
        res.on('end', () => {
          try {
            const r = JSON.parse(data);
            if (r.ok) resolve(r.value);
            else reject(new Error(r.error || `Erro ${res.statusCode}`));
          } catch {
            reject(new Error(`Resposta inválida do app (${res.statusCode}).`));
          }
        });
      },
    );
    req.on('error', () => reject(new Error(NOT_OPEN)));
    req.on('timeout', () => req.destroy(new Error('O app demorou demais para responder.')));
    req.end(body);
  });
}

// ---------- resumos legíveis ----------
const when = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'sem horário');
const ST = { aguardando: 'na fila p/ gerar', gerando: 'gerando', pronto: 'vídeos prontos', erro: 'ERRO', pendente: 'aguardando', enviando: 'enviando', agendado: 'agendado', publicado: 'publicado', desligado: 'desligado' };

function beatLine(it) {
  const meta = [it.artista && `${it.artista} type beat`, it.genero, it.bpm && `${it.bpm} BPM`, it.tom].filter(Boolean).join(' · ');
  const err = [it.render.error, it.yt.error, it.ig.error].filter(Boolean).join(' | ');
  return `• [${it.id}] ${it.nome}${meta ? ` (${meta})` : ''}\n  vídeo: ${ST[it.render.status] || it.render.status}${it.render.status === 'gerando' ? ` ${Math.round((it.render.progress || 0) * 100)}%` : ''} · YouTube: ${ST[it.yt.status] || it.yt.status} · Instagram: ${ST[it.ig.status] || it.ig.status} · ${when(it.when)}${it.ai && it.ai.suggestion ? ' · tem sugestão da IA' : ''}${err ? `\n  erro: ${err}` : ''}`;
}

function beatDetail(it) {
  const t = it.texts || {};
  return [
    beatLine(it),
    `\nTÍTULO DO YOUTUBE:\n${t.ytTitle}`,
    `\nDESCRIÇÃO:\n${t.ytDescription}`,
    `\nTAGS: ${(t.ytTags || []).join(', ')}`,
    `\nLEGENDA DO INSTAGRAM:\n${t.igCaption}`,
    `\nFRASE NO TOPO DO REELS: ${t.hook}`,
    it.textsEdited ? '\n(textos editados à mão: o app não os troca sozinho)' : '',
    it.ai && it.ai.suggestion ? `\nSUGESTÃO DA IA DO USUÁRIO (${it.ai.status}):\nTítulo: ${it.ai.suggestion.ytTitle}\nFrase: ${it.ai.suggestion.hook}\nLegenda:\n${it.ai.suggestion.igCaption}` : '',
    it.outputs ? `\nARQUIVOS: ${Object.values(it.outputs).join(' | ')}` : '',
  ].join('\n');
}

function postLine(p) {
  return `• [${p.id}] ${p.vitrine ? 'VITRINE' : when(p.date)} · ${p.kind} · ${p.status} — ${p.titulo}${p.notes ? `\n  como postar: ${p.notes}` : ''}${p.files && p.files.dir ? `\n  pasta: ${p.files.dir}` : ''}`;
}

const text = (t) => ({ content: [{ type: 'text', text: t }] });
const fail = (e) => ({ content: [{ type: 'text', text: `Erro: ${e.message}` }], isError: true });
const safe = (fn) => async (args) => {
  try {
    return await fn(args || {});
  } catch (e) {
    return fail(e);
  }
};
async function state() {
  return call('state:get');
}
async function findBeat(id) {
  const s = await state();
  const it = s.items.find((i) => i.id === id || i.nome.toLowerCase() === String(id).toLowerCase());
  if (!it) throw new Error(`Beat "${id}" não encontrado. Use listar_fila para ver os ids.`);
  return it;
}

// ---------- servidor ----------
const server = new McpServer(
  { name: 'island27-beat-launcher', version: '1.0.0' },
  {
    instructions: `Controla o ISLAND27 Beat Launcher, o app que lança os beats da ISLAND27 (marca musical da Ilha do Frade, Vitória/ES; produtor Bruninn; loja de beats na SoundX).
Fluxo típico: ver_status → adicionar_beat (caminhos de arquivos no computador do usuário) → o app gera os vídeos sozinho → revisar e melhorar os textos → distribuir_horarios → o app publica (YouTube agendado, Reels na hora).
Textos: você pode escrever os seus (escrever_textos) e também pedir à IA que o usuário configurou no app, com a API e a chave dele (ia_sugerir_textos). Compare as duas versões e use a melhor, ou combine. Mantenha os links da descrição, título com até 100 caracteres e no máximo 5 hashtags.
"Modo teste" ligado = nada é publicado de verdade. Nunca desligue o modo teste nem publique sem o usuário pedir claramente.`,
  },
);

const RO = { readOnlyHint: true, openWorldHint: false };

server.registerTool('ver_status', { title: 'Ver status do app', description: 'Resumo do app: modo teste, piloto automático, contas conectadas, IA configurada, próximos horários e quantos beats e posts existem.', annotations: RO }, safe(async () => {
  const s = await state();
  const st = s.settings;
  const ai = st.ai || {};
  return text([
    `Modo teste: ${st.simulation ? 'LIGADO (nada é publicado de verdade)' : 'desligado (publica de verdade)'}`,
    `Piloto automático: ${st.autopilot ? 'ligado' : 'desligado'}`,
    `YouTube: ${st.youtube.connected ? `conectado${st.youtube.channel ? ` (${st.youtube.channel.title})` : ''}` : 'não conectado'} · Instagram: ${st.instagram.hasToken ? `conectado${st.instagram.username ? ` (@${st.instagram.username})` : ''}` : 'não conectado'}`,
    `IA do usuário: ${ai.enabled ? `ligada · ${ai.provider} · modelo ${ai.model || '(padrão)'} · ${ai.hasKey ? 'com chave' : 'SEM chave'}` : 'desligada'}`,
    `Horários: ${(st.slots || []).join(', ')} · próximos livres: ${(s.nextSlots || []).map(when).join(', ')}`,
    `Links: loja ${st.links.loja || '—'} · WhatsApp ${st.links.whatsapp || '—'}`,
    `Beats na fila: ${s.items.length} · Posts de marketing: ${s.posts.length} (${s.posts.filter((p) => p.status === 'hora-de-postar').length} na hora de postar)`,
    `Pasta dos vídeos: ${s.outDir}`,
  ].join('\n'));
}));

server.registerTool('listar_fila', { title: 'Listar beats da fila', description: 'Lista os beats com status do vídeo, YouTube, Instagram e horário.', annotations: RO }, safe(async () => {
  const s = await state();
  return text(s.items.length ? s.items.map(beatLine).join('\n') : 'A fila está vazia.');
}));

server.registerTool('detalhe_beat', { title: 'Detalhe de um beat', description: 'Mostra os textos atuais (título, descrição, tags, legenda, frase do Reels), a sugestão da IA se houver e os arquivos gerados.', inputSchema: { id: z.string().describe('id do beat (ou o nome exato)') }, annotations: RO }, safe(async ({ id }) => text(beatDetail(await findBeat(id)))));

server.registerTool('adicionar_beat', {
  title: 'Adicionar beat',
  description: 'Coloca um beat na fila. O app analisa BPM e drop e gera vídeo do YouTube, Reels, miniaturas e textos. Use caminhos de arquivos do computador do usuário.',
  inputSchema: {
    beat: z.string().describe('caminho do arquivo de áudio (mp3, wav...)'),
    capa: z.string().describe('caminho da imagem de capa'),
    nome: z.string().optional(), artista: z.string().optional().describe('artista de referência para o "type beat"'),
    genero: z.string().optional(), bpm: z.number().optional(), tom: z.string().optional(),
    fundo: z.string().optional().describe('vídeo de fundo opcional'),
    horario: z.string().optional().describe('data/hora ISO para lançar; sem isto, use distribuir_horarios depois'),
  },
}, safe(async (a) => {
  const id = await call('beat:add', { audioPath: a.beat, coverPath: a.capa, nome: a.nome, artista: a.artista, genero: a.genero, bpm: a.bpm, tom: a.tom, bgPath: a.fundo, when: a.horario });
  return text(`Beat adicionado com id ${id}. O app está gerando os vídeos (leva de 1 a 3 minutos). Acompanhe com listar_fila.`);
}));

server.registerTool('importar_arquivos', { title: 'Importar vários arquivos', description: 'Adiciona vários beats de uma vez: beat e capa com o mesmo nome viram um lançamento (Noite.mp3 + Noite.jpg). Um .txt com o mesmo nome pode trazer artista/genero/bpm/tom.', inputSchema: { arquivos: z.array(z.string()).describe('caminhos dos arquivos') } }, safe(async ({ arquivos }) => {
  const r = await call('beat:addFiles', arquivos);
  return text(`${r.added} lançamento(s) adicionado(s).${r.errors.length ? `\nAvisos:\n${r.errors.join('\n')}` : ''}`);
}));

server.registerTool('editar_beat', { title: 'Editar dados do beat', description: 'Muda nome, artista, gênero, BPM, tom, horário ou plataformas. Se os vídeos já estiverem prontos, use refazer_videos depois para atualizá-los.', inputSchema: { id: z.string(), nome: z.string().optional(), artista: z.string().optional(), genero: z.string().optional(), bpm: z.number().optional(), tom: z.string().optional(), horario: z.string().optional().describe('ISO; vazio para tirar o horário'), youtube: z.boolean().optional(), instagram: z.boolean().optional() } }, safe(async (a) => {
  const it = await findBeat(a.id);
  const patch = {};
  for (const k of ['nome', 'artista', 'genero', 'bpm', 'tom']) if (a[k] !== undefined) patch[k] = a[k];
  if (a.horario !== undefined) patch.when = a.horario || null;
  if (a.youtube !== undefined || a.instagram !== undefined) patch.platforms = { ...(a.youtube !== undefined ? { youtube: a.youtube } : {}), ...(a.instagram !== undefined ? { instagram: a.instagram } : {}) };
  await call('beat:update', it.id, patch);
  return text(beatLine(await findBeat(it.id)));
}));

server.registerTool('escrever_textos', {
  title: 'Escrever os textos do beat',
  description: 'Grava textos escritos por você (Claude) para o beat: título do YouTube (até 100 caracteres), descrição (mantenha os links), tags, legenda do Instagram (até 5 hashtags) e frase do topo do Reels. Só os campos enviados mudam.',
  inputSchema: { id: z.string(), ytTitle: z.string().max(100).optional(), ytDescription: z.string().optional(), ytTags: z.array(z.string()).optional(), igCaption: z.string().optional(), hook: z.string().max(40).optional() },
}, safe(async (a) => {
  const it = await findBeat(a.id);
  const texts = { ...it.texts };
  for (const k of ['ytTitle', 'ytDescription', 'ytTags', 'igCaption', 'hook']) if (a[k] !== undefined) texts[k] = a[k];
  const tags = (texts.igCaption.match(/#[\p{L}\p{N}_]+/gu) || []).length;
  if (tags > 5) throw new Error(`A legenda tem ${tags} hashtags; o Instagram aceita no máximo 5.`);
  await call('beat:update', it.id, { texts });
  return text(`Textos gravados.${a.hook ? ' A frase do Reels mudou: use refazer_videos para ela aparecer no vídeo.' : ''}\n\n${beatDetail(await findBeat(it.id))}`);
}));

server.registerTool('ia_sugerir_textos', { title: 'Pedir textos à IA do usuário', description: 'Usa a IA que o usuário configurou no app (DeepSeek ou outra API compatível, com a chave dele) para sugerir título, descrição, legenda e frase. A sugestão fica guardada; nada muda até ia_aplicar_sugestao ou escrever_textos.', inputSchema: { id: z.string() } }, safe(async ({ id }) => {
  const it = await findBeat(id);
  const sug = await call('ai:suggestBeat', it.id);
  return text(`Sugestão da IA do usuário para "${it.nome}":\n\nTítulo: ${sug.ytTitle}\nFrase do Reels: ${sug.hook}\n\nLegenda:\n${sug.igCaption}\n\nDescrição:\n${sug.ytDescription}\n\nCompare com os textos atuais (detalhe_beat). Para usar: ia_aplicar_sugestao. Para combinar: escrever_textos.`);
}));

server.registerTool('ia_aplicar_sugestao', { title: 'Usar a sugestão da IA', description: 'Troca os textos do beat pela última sugestão da IA do usuário.', inputSchema: { id: z.string() } }, safe(async ({ id }) => {
  const it = await findBeat(id);
  await call('ai:applyBeat', it.id);
  return text(`Sugestão aplicada.\n\n${beatDetail(await findBeat(it.id))}`);
}));

server.registerTool('ia_testar', { title: 'Testar a IA do usuário', description: 'Confere se a API de IA configurada no app responde (chave, endereço e modelo).', annotations: { openWorldHint: true } }, safe(async () => {
  const r = await call('ai:test');
  return text(`A IA respondeu: modelo ${r.model}, resposta “${r.reply}”.`);
}));

server.registerTool('ia_ideias', { title: 'Ideias de conteúdo pela IA do usuário', description: 'Pede ideias de posts/Reels à IA configurada no app.', inputSchema: { quantidade: z.number().int().min(1).max(10).default(5), foco: z.string().default('vender beats e serviços de produção') } }, safe(async ({ quantidade, foco }) => {
  const list = await call('ai:ideas', quantidade, foco);
  return text(list.map((i, k) => `${k + 1}. ${i.titulo} (${i.formato})\n   gancho: ${i.gancho}\n   ${i.roteiro}`).join('\n\n') || 'Sem ideias.');
}));

server.registerTool('distribuir_horarios', { title: 'Distribuir nos horários', description: 'Dá o próximo horário livre para cada beat sem horário (um beat por horário).' }, safe(async () => {
  const n = await call('queue:distribute');
  const s = await state();
  return text(`${n} beat(s) com horário novo.\n${s.items.map(beatLine).join('\n')}`);
}));

server.registerTool('publicar_agora', { title: 'Publicar agora', description: 'Marca o beat para sair agora (YouTube e Reels). Com o modo teste ligado, é só simulação. Só use se o usuário pedir.', inputSchema: { id: z.string() }, annotations: { openWorldHint: true } }, safe(async ({ id }) => {
  const it = await findBeat(id);
  await call('beat:publishNow', it.id);
  const s = await state();
  return text(`${it.nome} vai sair agora${s.settings.simulation ? ' (MODO TESTE: nada é publicado de verdade)' : ''}.`);
}));

server.registerTool('refazer_videos', { title: 'Gerar os vídeos de novo', description: 'Gera de novo os vídeos e miniaturas do beat (depois de mudar nome, frase, BPM...).', inputSchema: { id: z.string() } }, safe(async ({ id }) => {
  const it = await findBeat(id);
  await call('beat:rerender', it.id);
  return text(`Gerando de novo os vídeos de ${it.nome}.`);
}));

server.registerTool('tentar_de_novo', { title: 'Tentar de novo', description: 'Tenta de novo uma etapa que deu erro.', inputSchema: { id: z.string(), etapa: z.enum(['render', 'youtube', 'instagram']) } }, safe(async ({ id, etapa }) => {
  const it = await findBeat(id);
  await call('beat:retry', it.id, etapa);
  return text(`Tentando de novo: ${etapa} de ${it.nome}.`);
}));

server.registerTool('remover_beat', { title: 'Tirar beat da fila', description: 'Tira o beat da fila (os arquivos gerados continuam na pasta). Confirme com o usuário antes.', inputSchema: { id: z.string() }, annotations: { destructiveHint: true } }, safe(async ({ id }) => {
  const it = await findBeat(id);
  await call('beat:remove', it.id);
  return text(`${it.nome} saiu da fila.`);
}));

server.registerTool('analisar_bpm', { title: 'Analisar um beat', description: 'Descobre BPM, duração e onde está o drop de um arquivo de áudio.', inputSchema: { arquivo: z.string() }, annotations: RO }, safe(async ({ arquivo }) => {
  const a = await call('file:analyze', arquivo);
  return text(`BPM estimado: ${a.bpm || '?'} · duração: ${a.duration.toFixed(1)} s · drop em ${a.dropStart.toFixed(1)} s`);
}));

// ---------- marketing ----------
server.registerTool('listar_posts', { title: 'Listar posts de marketing', description: 'Lista a vitrine e os posts da semana com status (planejado, pronto, hora-de-postar, postado), pasta dos arquivos e instruções.', annotations: RO }, safe(async () => {
  const s = await state();
  return text(s.posts.length ? s.posts.map(postLine).join('\n') : 'Nenhum post planejado. Use planejar_semana ou gerar_vitrine.');
}));

server.registerTool('ver_post', { title: 'Ver um post', description: 'Mostra a legenda, o roteiro e os arquivos de um post.', inputSchema: { id: z.string() }, annotations: RO }, safe(async ({ id }) => {
  const p = (await state()).posts.find((x) => x.id === id);
  if (!p) throw new Error('Post não encontrado. Use listar_posts.');
  return text([postLine(p), p.caption ? `\nLEGENDA:\n${p.caption}` : '', p.roteiro ? `\nROTEIRO:\n${p.roteiro.join('\n')}` : '', p.files && p.files.images ? `\nIMAGENS:\n${p.files.images.join('\n')}` : '', p.files && p.files.video ? `\nVÍDEO: ${p.files.video}` : ''].join('\n'));
}));

server.registerTool('planejar_semana', { title: 'Planejar a semana de posts', description: 'Monta a semana de conteúdo do Instagram e gera as artes. tipo 0 = semana de lançamento do perfil; 1 a 3 = semanas normais com dicas em rodízio.', inputSchema: { inicio: z.string().describe('data de início AAAA-MM-DD'), tipo: z.number().int().min(0).max(3).default(1) } }, safe(async ({ inicio, tipo }) => {
  const n = await call('marketing:week', `${inicio}T00:00:00`, tipo);
  return text(`${n} posts planejados a partir de ${inicio}. O app está gerando as artes; veja com listar_posts.`);
}));

server.registerTool('gerar_vitrine', { title: 'Gerar a vitrine do perfil', description: 'Gera os 5 Destaques (Beats, Serviços, Cursos, Sobre, Contato) e o carrossel fixado de serviços.' }, safe(async () => text(`${await call('marketing:vitrine')} peças da vitrine em produção.`)));

server.registerTool('editar_legenda_post', { title: 'Editar legenda de post', description: 'Grava uma legenda nova para um post (até 5 hashtags).', inputSchema: { id: z.string(), legenda: z.string().max(2200) } }, safe(async ({ id, legenda }) => {
  const tags = (legenda.match(/#[\p{L}\p{N}_]+/gu) || []).length;
  if (tags > 5) throw new Error(`A legenda tem ${tags} hashtags; o Instagram aceita no máximo 5.`);
  await call('marketing:update', id, { caption: legenda });
  return text('Legenda gravada.');
}));

server.registerTool('ia_reescrever_legenda', { title: 'Reescrever legenda com a IA do usuário', description: 'Pede à IA configurada no app uma versão nova da legenda de um post. Não grava: use editar_legenda_post para gravar a versão escolhida.', inputSchema: { id: z.string() } }, safe(async ({ id }) => text(await call('ai:rewritePost', id))));

server.registerTool('marcar_postado', { title: 'Marcar post como postado', description: 'Marca que o usuário já postou.', inputSchema: { id: z.string() } }, safe(async ({ id }) => {
  await call('marketing:done', id);
  return text('Marcado como postado.');
}));

server.registerTool('gerar_loop', { title: 'Gerar loop animado da capa', description: 'Cria um clipe curto que emenda sem pulo a partir de uma foto.', inputSchema: { imagem: z.string(), formato: z.enum(['9:16', '1:1', '4:5', '16:9']).default('9:16'), segundos: z.number().min(3).max(15).default(8), estilo: z.enum(['breath', 'pulse', 'drift']).default('breath'), bpm: z.number().optional() } }, safe(async (a) => {
  const r = await call('loop:render', { image: a.imagem, format: a.formato, seconds: a.segundos, style: a.estilo, bpm: a.bpm || 120, grain: false, brand: true });
  return text(`Loop pronto: ${r.path}`);
}));

server.registerTool('ajustar_configuracoes', {
  title: 'Ajustar configurações',
  description: 'Muda links, horários, piloto automático e visualizador. Desligar o modo teste faz o app publicar de verdade: só com pedido claro do usuário e confirmar_publicacao_real=true.',
  inputSchema: {
    loja: z.string().optional(), whatsapp: z.string().optional(), download: z.string().optional(), instagram: z.string().optional(),
    horarios: z.array(z.string()).optional().describe('ex.: ["12:00","18:00","21:00"]'),
    piloto_automatico: z.boolean().optional(), visualizador: z.enum(['onda', 'barras']).optional(),
    modo_teste: z.boolean().optional(), confirmar_publicacao_real: z.boolean().optional(),
  },
}, safe(async (a) => {
  const patch = {};
  const links = {};
  for (const k of ['loja', 'whatsapp', 'download', 'instagram']) if (a[k] !== undefined) links[k] = a[k];
  if (Object.keys(links).length) patch.links = links;
  if (a.horarios) patch.slots = a.horarios;
  if (a.piloto_automatico !== undefined) patch.autopilot = a.piloto_automatico;
  if (a.visualizador) patch.visual = a.visualizador;
  if (a.modo_teste !== undefined) {
    if (a.modo_teste === false && !a.confirmar_publicacao_real) throw new Error('Para desligar o modo teste (publicar de verdade), o usuário precisa pedir isso claramente; envie confirmar_publicacao_real=true.');
    patch.simulation = a.modo_teste;
  }
  await call('settings:save', patch);
  return text('Configurações salvas.');
}));

server.connect(new StdioServerTransport()).catch((e) => {
  process.stderr.write(`Falha ao iniciar o conector: ${e.message}\n`);
  process.exit(1);
});
