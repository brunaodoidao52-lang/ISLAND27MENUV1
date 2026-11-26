// IA (modo teste) contra um servidor falso no formato da DeepSeek/OpenAI (/chat/completions).
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ai = require('../src/main/ai');
const { Engine } = require('../src/main/engine');
const { createStore } = require('../src/main/store');
const texts = require('../src/shared/texts');

function fakeAPI(reply, status = 200) {
  return new Promise((resolve) => {
    const calls = [];
    const s = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        calls.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body || '{}') });
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status === 200 ? { choices: [{ message: { content: typeof reply === 'function' ? reply(calls.at(-1).body) : reply } }] } : { error: { message: 'Authentication Fails' } }));
      });
    });
    s.listen(0, '127.0.0.1', () => resolve({ s, calls, base: `http://127.0.0.1:${s.address().port}` }));
  });
}

const beat = { nome: 'Noite', artista: 'Veigh', genero: 'Trap', bpm: 140 };
const current = texts.generate(beat, { links: { loja: 'https://www.soundx.com.br/u/island27_beats' } }, new Date('2026-11-26'));

test('IA: envia no formato OpenAI/DeepSeek e respeita limites (links, 100 caracteres, 5 hashtags)', async () => {
  const { s, calls, base } = await fakeAPI(JSON.stringify({
    ytTitle: `[GRÁTIS] Veigh Type Beat 2026 - "Noite" | Prod. ISLAND27 ${'x'.repeat(120)}`,
    ytDescription: 'Descrição nova sem o link da loja',
    igCaption: 'Pesado demais 🔥\nComenta BEAT\n#a #b #c #d #e #f #g',
    hook: 'esse é pesado 🔥',
  }));
  const c = ai.client({ baseUrl: base, apiKey: 'sk-teste', model: 'deepseek-v4-flash', temperature: 0.5 });
  const r = await c.suggestBeatTexts(beat, current);
  s.close();
  assert.strictEqual(calls[0].url, '/chat/completions');
  assert.strictEqual(calls[0].auth, 'Bearer sk-teste');
  assert.strictEqual(calls[0].body.model, 'deepseek-v4-flash');
  assert.deepStrictEqual(calls[0].body.response_format, { type: 'json_object' });
  assert.ok(r.ytTitle.length <= 100);
  assert.strictEqual(r.ytDescription, current.ytDescription, 'sem o link da loja, mantém a descrição original');
  assert.strictEqual((r.igCaption.match(/#/g) || []).length, 5);
  assert.strictEqual(r.hook, 'ESSE É PESADO');
});

test('IA: mensagens claras de erro (chave recusada) e configuração padrão da DeepSeek', async () => {
  const { s, base } = await fakeAPI('', 401);
  const c = ai.client({ baseUrl: base, apiKey: 'errada', model: 'm', temperature: 0.5 });
  await assert.rejects(c.test(), /Chave da IA recusada/);
  s.close();
  const cfg = ai.cfgOf({ ai: { enabled: true, apiKey: 'k' } });
  assert.strictEqual(cfg.baseUrl, 'https://api.deepseek.com');
  assert.strictEqual(cfg.model, 'deepseek-v4-flash');
  await assert.rejects(ai.client({ ai: { enabled: true } }).test(), /chave da API/);
});

test('IA no app: desligada por padrão; ligada guarda a sugestão e só aplica quando você pede', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'i27ai-'));
  const store = createStore(path.join(tmp, 'd.json'));
  assert.strictEqual(store.settings.ai.enabled, false, 'a IA começa desligada');
  const fake = { suggestBeatTexts: async (b, cur) => ({ ...cur, ytTitle: 'Título da IA' }) };
  const engine = new Engine({ store, dirs: { workDir: tmp, outDir: () => tmp }, clients: { ai: () => fake } });
  store.add({ id: 'b1', nome: 'Noite', texts: current, yt: { status: 'pendente' }, ig: { status: 'pendente' }, render: { status: 'pronto' }, platforms: {} });
  await assert.rejects(engine.aiSuggestBeat('b1'), /desligada/);
  store.setSettings({ ai: { enabled: true, apiKey: 'k' } });
  await engine.aiSuggestBeat('b1');
  assert.strictEqual(store.item('b1').ai.status, 'sugestao');
  assert.notStrictEqual(store.item('b1').texts.ytTitle, 'Título da IA', 'não aplica sozinho');
  engine.aiApplyBeat('b1');
  assert.strictEqual(store.item('b1').texts.ytTitle, 'Título da IA');
});
