// Porta de controle para o Claude (conector MCP): um servidor HTTP só em 127.0.0.1, com senha aleatória.
// O conector (src/mcp/server.js) lê porta e senha do arquivo "controle-claude.json" na pasta de dados do app.
// Só as ações da lista abaixo podem ser chamadas; nada de abrir janelas, ler arquivos quaisquer ou ver chaves.
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ALLOWED = new Set([
  'state:get', 'file:analyze', 'texts:preview',
  'beat:add', 'beat:addFiles', 'beat:update', 'beat:remove', 'beat:rerender', 'beat:regenTexts', 'beat:retry', 'beat:publishNow',
  'queue:distribute', 'queue:clearTimes', 'settings:save',
  'marketing:week', 'marketing:vitrine', 'marketing:update', 'marketing:remove', 'marketing:done', 'marketing:rerender', 'marketing:settings',
  'ai:test', 'ai:suggestBeat', 'ai:applyBeat', 'ai:rewritePost', 'ai:ideas',
  'loop:render',
]);

const FILE = 'controle-claude.json';

/**
 * Liga a porta de controle. actions: { nome: fn(...args) }. Retorna { close, info }.
 * onCall(nome) é avisado a cada chamada (para registrar no log do app).
 */
function startControl({ dir, actions, version, onCall = () => {} }) {
  const token = crypto.randomBytes(24).toString('hex');
  const file = path.join(dir, FILE);
  const server = http.createServer((req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(obj));
    };
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { ok: false, error: 'Senha da porta de controle inválida.' });
    if (req.method !== 'POST' || req.url !== '/call') return send(404, { ok: false, error: 'Rota desconhecida.' });
    let body = '';
    req.on('data', (d) => {
      body += d;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', async () => {
      let msg;
      try {
        msg = JSON.parse(body || '{}');
      } catch {
        return send(400, { ok: false, error: 'JSON inválido.' });
      }
      const name = String(msg.name || '');
      if (!ALLOWED.has(name) || typeof actions[name] !== 'function') return send(403, { ok: false, error: `Ação não permitida: ${name}` });
      try {
        onCall(name);
        const value = await actions[name](...(Array.isArray(msg.args) ? msg.args : []));
        send(200, { ok: true, value: value === undefined ? null : value });
      } catch (e) {
        send(200, { ok: false, error: e.message });
      }
    });
  });
  server.listen(0, '127.0.0.1', () => {
    const info = { port: server.address().port, token, pid: process.pid, version, startedAt: new Date().toISOString() };
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(info), { mode: 0o600 });
  });
  return {
    close() {
      server.close();
      try {
        const cur = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (cur.token === token) fs.rmSync(file, { force: true });
      } catch {
        /* já removido */
      }
    },
  };
}

module.exports = { startControl, ALLOWED, FILE };
