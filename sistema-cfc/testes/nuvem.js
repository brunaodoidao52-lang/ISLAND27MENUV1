const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
let ok = 0, falhas = 0;
const check = (c, n) => { if (c) { ok++; console.log('  PASS', n); } else { falhas++; console.log('  FAIL', n); } };
const conteudo = fs.readFileSync(require('path').join(__dirname, '..', 'dist', 'island27-cfc.html'), 'utf8');
const pagina = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${conteudo}</body></html>`;
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(pagina); }).listen(8766);

// Simulador do armazenamento "db" do Claude (compartilhado entre abas pelo localStorage).
const mock = () => {
  const K = p => 'mockdb:' + p;
  const snap = p => { const t = localStorage.getItem(K(p)); return { id: p.split('/').pop(), exists: !!t, data: () => t ? JSON.parse(t) : undefined, metadata: { fromCache: false, hasPendingWrites: false } }; };
  const doc = p => ({
    path: p,
    async get() { await new Promise(r => setTimeout(r, 5)); return snap(p); },
    async set(d) { const t = JSON.stringify(d); if (t.length > 256 * 1024) throw { code: 'invalid_argument', message: 'grande' }; window.__escritas = (window.__escritas || 0) + 1; localStorage.setItem(K(p), t); },
    async delete() { localStorage.removeItem(K(p)); },
    onSnapshot(next) { const f = e => { if (e.key === K(p)) next(snap(p)); }; addEventListener('storage', f); setTimeout(() => next(snap(p)), 0); return () => removeEventListener('storage', f); },
    async acquire({ holder, ttlMs }) { const l = JSON.parse(localStorage.getItem(K(p) + ':lease') || 'null'); if (l && l.ate > Date.now() && l.h !== holder) return { acquired: false }; localStorage.setItem(K(p) + ':lease', JSON.stringify({ h: holder, ate: Date.now() + ttlMs })); return { acquired: true }; }
  });
  const db = { doc, collection: p => ({ doc: id => doc(p + '/' + id), async get() { const docs = Object.keys(localStorage).filter(k => k.startsWith(K(p) + '/') && !k.endsWith(':lease') && k.slice(K(p).length + 1).indexOf('/') < 0).map(k => snap(k.slice(7))); return { docs, size: docs.length, empty: !docs.length }; } }) };
  const user = { id: async () => 'usuario1', isOwner: () => true };
  window.claude = { use: async n => (await new Promise(r => setTimeout(r, 20)), n === 'db' ? db : n === 'user' ? user : n === 'downloads' ? { save: async () => ({ status: 'saved' }) } : null) };
};

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--headless=new'] });
  const ctx = await b.newContext();
  await ctx.addInitScript(mock);
  const abrir = async () => { const p = await ctx.newPage(); p.erros = []; p.on('pageerror', e => p.erros.push(e.message)); p.on('console', m => m.type() === 'error' && p.erros.push(m.text())); await p.goto('http://127.0.0.1:8766/'); await p.waitForSelector('#status-salvo:has-text("Salvo na nuvem")'); return p; };
  const esperar = async (p, fn, arg) => { for (let i = 0; i < 150; i++) { if (await p.evaluate(fn, arg)) return true; await p.waitForTimeout(100); } return false; };
  const pc = await abrir();
  const cel = await abrir();
  check(await pc.evaluate(() => Cofre.modo) === 'nuvem' && await pc.evaluate(() => UI.publicado), 'modo nuvem ativado pelo link publicado');
  await pc.evaluate(() => Dados.criarFicha({ nome: 'Lançado no PC' }, { total: 900, parcelas: 3 }));
  check(await esperar(cel, () => Dados.estado.alunos.some(a => a.nome === 'Lançado no PC')), 'ficha lançada no PC aparece sozinha no celular');
  await Promise.all([
    pc.evaluate(() => Dados.criarFicha({ nome: 'PC ao mesmo tempo' }, { total: 100, parcelas: 1 })),
    cel.evaluate(() => Dados.criarFicha({ nome: 'Celular ao mesmo tempo' }, { total: 100, parcelas: 1 }))
  ]);
  const ambos = () => ['Lançado no PC', 'PC ao mesmo tempo', 'Celular ao mesmo tempo'].every(n => Dados.estado.alunos.some(a => a.nome === n));
  check(await esperar(pc, ambos) && await esperar(cel, ambos), 'lançamentos simultâneos no PC e no celular: nenhum se perde');
  const id = await cel.evaluate(() => Dados.estado.parcelas.find(p => !p.pagoEm).id);
  await cel.evaluate(id => Dados.receber(id, 300, Hoje.iso(), 'PIX', ''), id);
  check(await esperar(pc, id => !!Dados.parcela(id).pagoEm, id), 'pagamento recebido no celular aparece no PC');

  // Volume: 600 fichas -> várias partes de até 256 KiB
  await pc.evaluate(() => { for (let i = 0; i < 600; i++) Dados.criarFicha({ nome: 'Aluno volume ' + i, endereco: 'Rua das Palmeiras, ' + i + ' — São Paulo', obs: 'Observação longa '.repeat(5) }, { total: 2500, entrada: 500, parcelas: 6 }); });
  await pc.waitForSelector('#status-salvo:has-text("Salvo na nuvem")'); await pc.waitForTimeout(1500);
  const partes = await pc.evaluate(() => JSON.parse(localStorage.getItem('mockdb:data/users/usuario1/meta')).partes);
  check(partes > 1, `dados grandes divididos em ${partes} partes (limite de 256 KiB por documento respeitado)`);
  check(await esperar(cel, () => Dados.estado.alunos.length === 603), 'celular recebe as 603 fichas inteiras');
  const sobras = await pc.evaluate(() => { const gen = JSON.parse(localStorage.getItem('mockdb:data/users/usuario1/meta')).gen; return Object.keys(localStorage).filter(k => k.includes('/p-') && !k.includes(gen)).length; });
  check(sobras === 0, 'versões antigas apagadas da nuvem (sem lixo acumulado)');

  // Senha no modo nuvem
  // simula partes órfãs sem cifra deixadas por uma gravação interrompida
  await pc.evaluate(() => localStorage.setItem('mockdb:data/users/usuario1/p-orfao123-0', JSON.stringify({ t: 'Lançado no PC Palmeiras' })));
  await pc.evaluate(() => Cofre.definirSenha('Ilha#2027forte'));
  const bruto = await pc.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('mockdb:')).map(k => localStorage.getItem(k)).join(''));
  check(!/Lançado no PC|Palmeiras/.test(bruto) && /cifrado\\?":true/.test(bruto), 'na nuvem só fica conteúdo criptografado');
  check(await esperar(cel, () => Seguranca.bloqueado), 'celular pede a senha depois que o PC ativou a proteção');
  await cel.fill('#senha-entrar', 'Ilha#2027forte'); await cel.click('#senha-ok');
  check(await esperar(cel, () => !Seguranca.bloqueado && Dados.estado.alunos.length === 603), 'celular abre com a senha e vê tudo');
  await cel.evaluate(() => Dados.criarFicha({ nome: 'Depois da senha' }, { total: 50, parcelas: 1 }));
  check(await esperar(pc, () => Dados.estado.alunos.some(a => a.nome === 'Depois da senha')), 'sincronização continua funcionando com criptografia');
  check(pc.erros.length + cel.erros.length === 0, 'sem erros JS: ' + pc.erros.concat(cel.erros).join(' | '));

  // Backup via capacidade de downloads
  await pc.evaluate(() => Telas.ir('config')); await pc.click('#baixar');
  check(await esperar(pc, () => document.getElementById('aviso').textContent.includes('baixada')), 'backup salvo pela função de downloads do Claude');
  await b.close(); srv.close();
  console.log(`\nRESULTADO NUVEM: ${ok} passaram, ${falhas} falharam`);
})().catch(e => { console.error(e); process.exit(2); });
