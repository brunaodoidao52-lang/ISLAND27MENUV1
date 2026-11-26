// Conector do Claude: porta de controle (senha, lista de ações permitidas) + servidor MCP falando com ela.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { startControl } = require('../src/main/control');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const post = (port, token, body) =>
  new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: '/call', method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b) }));
    });
    req.on('error', reject);
    req.end(data);
  });

test('conector do Claude: senha, ações permitidas e ferramentas do MCP', { timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i27mcp-'));
  const calls = [];
  const item = { id: 'b1', nome: 'Noite', artista: 'Veigh', genero: 'Trap', bpm: 140, render: { status: 'pronto' }, yt: { status: 'agendado' }, ig: { status: 'pendente' }, when: '2026-12-01T15:00:00.000Z', texts: { ytTitle: 'T', ytDescription: 'D https://loja', ytTags: ['a'], igCaption: 'L #a', hook: 'H' } };
  const actions = {
    'state:get': () => ({ items: [item], posts: [], settings: { simulation: true, autopilot: false, youtube: {}, instagram: {}, ai: { enabled: true, provider: 'deepseek', model: 'deepseek-v4-flash', hasKey: true }, slots: ['12:00'], links: { loja: 'https://loja' } }, nextSlots: [], outDir: '/videos' }),
    'beat:update': (id, patch) => { calls.push(['update', id, patch]); },
    'ai:suggestBeat': (id) => { calls.push(['ia', id]); return { ytTitle: 'Título IA', ytDescription: 'D https://loja', igCaption: 'IA #x', hook: 'IA' }; },
    'pick:files': () => 'nunca deveria rodar',
  };
  const ctl = startControl({ dir, actions, version: 'teste' });
  let info;
  for (let i = 0; i < 50 && !info; i++) {
    try { info = JSON.parse(fs.readFileSync(path.join(dir, 'controle-claude.json'), 'utf8')); } catch { await new Promise((r) => setTimeout(r, 50)); }
  }
  assert.ok(info && info.port, 'arquivo da porta de controle criado');

  assert.strictEqual((await post(info.port, 'senha-errada', { name: 'state:get' })).status, 401);
  assert.strictEqual((await post(info.port, info.token, { name: 'pick:files' })).status, 403, 'ação fora da lista é recusada');

  const client = new Client({ name: 'teste', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, '..', 'src', 'mcp', 'server.js')], env: { ...process.env, ISLAND27_DATA_DIR: dir } }));
  const names = (await client.listTools()).tools.map((t) => t.name);
  for (const n of ['ver_status', 'listar_fila', 'adicionar_beat', 'escrever_textos', 'ia_sugerir_textos', 'planejar_semana']) assert.ok(names.includes(n), n);
  const t = async (name, args = {}) => (await client.callTool({ name, arguments: args }));

  assert.match((await t('ver_status')).content[0].text, /Modo teste: LIGADO/);
  assert.match((await t('listar_fila')).content[0].text, /\[b1\] Noite/);
  assert.match((await t('ia_sugerir_textos', { id: 'Noite' })).content[0].text, /Título IA/);
  const bad = await t('escrever_textos', { id: 'b1', igCaption: '#a #b #c #d #e #f' });
  assert.ok(bad.isError, 'mais de 5 hashtags é recusado');
  await t('escrever_textos', { id: 'b1', ytTitle: 'Novo título' });
  assert.deepStrictEqual(calls.find((c) => c[0] === 'update')[2].texts.ytTitle, 'Novo título');
  const real = await t('ajustar_configuracoes', { modo_teste: false });
  assert.ok(real.isError, 'desligar o modo teste exige confirmação');

  await client.close();
  ctl.close();
  assert.ok(!fs.existsSync(path.join(dir, 'controle-claude.json')), 'arquivo removido ao fechar');
});
