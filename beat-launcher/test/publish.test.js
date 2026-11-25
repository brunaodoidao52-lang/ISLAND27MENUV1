// Testa o envio para YouTube e Instagram contra servidores falsos locais (mesmas rotas das APIs reais).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const youtube = require('../src/main/youtube');
const instagram = require('../src/main/instagram');

function server(handler) {
  return new Promise((resolve) => {
    const calls = [];
    const s = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (d) => chunks.push(d));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        calls.push({ method: req.method, url: req.url, headers: req.headers, body });
        handler(req, res, body, calls);
      });
    });
    s.listen(0, '127.0.0.1', () => resolve({ s, calls, base: `http://127.0.0.1:${s.address().port}` }));
  });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'i27pub-'));
const video = path.join(tmp, 'v.mp4');
fs.writeFileSync(video, Buffer.alloc(300000, 7));
const thumb = path.join(tmp, 't.jpg');
fs.writeFileSync(thumb, Buffer.from('jpg'));

test('YouTube: renova o token, envia retomável com publishAt e manda a miniatura', async () => {
  let base;
  let dropped = false;
  const { s, calls, base: b } = await server((req, res, body) => {
    const send = (code, obj, headers = {}) => {
      res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
      res.end(JSON.stringify(obj));
    };
    if (req.url === '/token') return send(200, { access_token: 'NOVO', expires_in: 3600 });
    if (req.url.startsWith('/upload/videos?uploadType=resumable')) return send(200, {}, { Location: `${base}/sessao/1` });
    if (req.url === '/sessao/1' && req.headers['content-range'] === 'bytes */300000') {
      res.writeHead(308, { Range: 'bytes=0-99999' });
      return res.end();
    }
    if (req.url === '/sessao/1') {
      // a primeira tentativa "cai" no meio; a segunda continua do byte 100000
      if (!dropped) {
        dropped = true;
        req.socket.destroy();
        return undefined;
      }
      return send(200, { id: 'VID123', status: { privacyStatus: 'private' } });
    }
    if (req.url.startsWith('/upload/thumbnails/set')) return send(200, {});
    return send(404, { error: { message: 'rota desconhecida' } });
  });
  base = b;
  let saved = null;
  const c = youtube.client({
    clientId: 'id',
    clientSecret: 'sec',
    tokens: { access: 'VELHO', refresh: 'R', expiresAt: Date.now() - 1000 },
    saveTokens: (t) => (saved = t),
    endpoints: { token: `${b}/token`, api: `${b}/api`, upload: `${b}/upload` },
  });
  const publishAt = new Date(Date.now() + 3 * 3600000);
  const r = await c.upload(video, { title: 'T', description: 'D', tags: ['a'], publishAt }, { thumbnail: thumb });
  s.close();
  assert.strictEqual(r.id, 'VID123');
  assert.strictEqual(saved.access, 'NOVO');
  const init = calls.find((x) => x.url.startsWith('/upload/videos'));
  const meta = JSON.parse(init.body.toString());
  assert.strictEqual(meta.status.privacyStatus, 'private');
  assert.strictEqual(meta.status.publishAt, publishAt.toISOString());
  assert.strictEqual(meta.snippet.categoryId, '10');
  assert.strictEqual(init.headers['x-upload-content-length'], '300000');
  const resumed = calls.filter((x) => x.url === '/sessao/1' && x.headers['content-range'] === 'bytes 100000-299999/300000');
  assert.strictEqual(resumed.length, 1, 'retomou do ponto em que parou');
  assert.strictEqual(resumed[0].body.length, 200000);
  assert.ok(calls.some((x) => x.url.startsWith('/upload/thumbnails/set?videoId=VID123')));
});

test('YouTube: sem horário futuro publica direto como público', async () => {
  const { s, calls, base } = await server((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', Location: `http://127.0.0.1:${s.address().port}/s` });
    res.end(JSON.stringify(req.url === '/s' ? { id: 'V2' } : {}));
  });
  const c = youtube.client({ clientId: 'i', clientSecret: 's', tokens: { access: 'A', refresh: 'R', expiresAt: Date.now() + 3600000 }, endpoints: { upload: base } });
  await c.upload(video, { title: 'T', publishAt: new Date() });
  s.close();
  assert.strictEqual(JSON.parse(calls[0].body.toString()).status.privacyStatus, 'public');
});

test('Instagram: cria o Reels, envia o arquivo, espera processar e publica', async () => {
  let polls = 0;
  const { s, calls, base } = await server((req, res) => {
    const send = (obj) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/v23.0/999/media') return send({ id: 'C1' });
    if (u.pathname === '/rup/ig-api-upload/v23.0/C1') return send({ success: true });
    if (u.pathname === '/v23.0/C1') return send({ status_code: ++polls < 2 ? 'IN_PROGRESS' : 'FINISHED' });
    if (u.pathname === '/v23.0/999/media_publish') return send({ id: 'M1' });
    if (u.pathname === '/v23.0/M1') return send({ permalink: 'https://instagram.com/reel/abc' });
    res.writeHead(404).end();
  });
  const c = instagram.client({ userId: '999', token: 'TK', graphBase: base, rupload: `${base}/rup` });
  const r = await c.publishReel(video, 'Legenda 🔥 #beat', { pollMs: 10 });
  s.close();
  assert.deepStrictEqual(r, { id: 'M1', permalink: 'https://instagram.com/reel/abc' });
  const create = new URLSearchParams(calls[0].body.toString());
  assert.strictEqual(create.get('media_type'), 'REELS');
  assert.strictEqual(create.get('upload_type'), 'resumable');
  assert.strictEqual(create.get('caption'), 'Legenda 🔥 #beat');
  const up = calls[1];
  assert.strictEqual(up.headers.authorization, 'OAuth TK');
  assert.strictEqual(up.headers.file_size, '300000');
  assert.strictEqual(up.body.length, 300000);
  assert.strictEqual(new URLSearchParams(calls.find((x) => x.url.includes('media_publish')).body.toString()).get('creation_id'), 'C1');
});
