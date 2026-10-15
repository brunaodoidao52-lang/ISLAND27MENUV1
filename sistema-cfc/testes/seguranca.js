const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const URL = 'http://127.0.0.1:8765/index.html';
const OUT = process.argv[2] || require('os').tmpdir();
let ok = 0, falhas = 0;
const check = (cond, nome) => { if (cond) { ok++; console.log('  PASS', nome); } else { falhas++; console.log('  FAIL', nome); } };
const XSS = [
  `<img src=x onerror="window.__xss=1">`,
  `"><svg onload=window.__xss=1>`,
  `'><script>window.__xss=1</script>`,
  `\`=onmouseover=window.__xss=1 x=`,
  `javascript:window.__xss=1`
];

async function novaPagina(ctx, url = URL) {
  const page = await ctx.newPage();
  page.erros = [];
  page.on('pageerror', e => page.erros.push(e.message));
  page.on('dialog', d => { page.erros.push('DIALOGO NATIVO: ' + d.message()); d.dismiss(); });
  await page.goto(url);
  await page.waitForSelector('#status-salvo:has-text("Salvo")');
  return page;
}
async function esperar(page, fn, arg, limite = 20000) {
  const fim = Date.now() + limite;
  while (Date.now() < fim) { if (await page.evaluate(fn, arg)) return true; await page.waitForTimeout(100); }
  throw new Error('esperar: tempo esgotado ' + fn);
}
const ir = (page, rota) => page.evaluate(r => Telas.ir(r), rota);
const semXss = page => page.evaluate(() => window.__xss === undefined && !document.querySelector('#tela img[src="x"], #tela svg[onload], #modal img[src="x"]'));

async function lancarFicha(page, campos, plano = {}) {
  await ir(page, 'nova-ficha');
  for (const [k, v] of Object.entries(campos)) {
    const sel = `[name="${k}"]`;
    const tag = await page.$eval(sel, el => el.tagName);
    if (tag === 'SELECT') await page.selectOption(sel, v); else await page.fill(sel, v);
  }
  await page.fill('#p-total', plano.total || '1000');
  if (plano.entrada) await page.fill('#p-entrada', plano.entrada);
  await page.fill('#p-parcelas', plano.parcelas || '3');
  await page.click('button:has-text("Salvar ficha")');
  await page.waitForSelector('text=Parcelas e pagamentos');
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--headless=new'] });

  console.log('\n[1] XSS armazenado em todos os campos de texto');
  {
    const ctx = await b.newContext();
    const page = await novaPagina(ctx);
    for (const [i, x] of XSS.entries()) {
      await lancarFicha(page, { nome: 'Aluno ' + i + x, rg: x, telefone: x, endereco: x, renach: x, obs: x }, { entrada: '100' });
    }
    await page.click('#nova-cobranca'); await page.fill('#cb-desc', XSS[0]); await page.fill('#cb-valor', '50'); await page.click('button:has-text("Adicionar")');
    await page.click('[data-receber]'); await page.fill('#r-obs', XSS[1]); await page.click('#r-ok');
    await page.waitForSelector('.recibo-previa');
    check(await semXss(page), 'recibo com payload na observação');
    await page.evaluate(x => Dados.salvarConfig({ nomeCfc: x, cidade: x }), XSS[2]);
    for (const r of ['inicio', 'fichas', 'pagos', 'pendentes', 'config']) { await ir(page, r); check(await semXss(page), 'tela ' + r); }
    await page.evaluate(() => Pagamentos.filtroPendentes.situacao = '');
    await ir(page, 'pendentes');
    const hrefs = await page.$$eval('#tela a[href]', as => as.map(a => a.getAttribute('href')));
    check(hrefs.every(h => h.startsWith('#') || h.startsWith('https://wa.me/')), 'nenhum link javascript: (só # e wa.me)');
    const rel = await page.$$eval('a[target=_blank]', as => as.every(a => a.rel.includes('noopener')));
    check(rel, 'links externos com rel=noopener (anti tabnabbing)');
    await ir(page, 'fichas'); await page.hover('#corpo-fichas tr');
    check(await semXss(page), 'hover em linhas com payload de atributo');
    check(page.erros.length === 0, 'sem erros JS / diálogos nativos: ' + page.erros.join(' | '));
    await ctx.close();
  }

  console.log('\n[2] Backup adulterado (injeção, poluição de protótipo, valores absurdos)');
  {
    const ctx = await b.newContext();
    const page = await novaPagina(ctx);
    const evil = JSON.parse(`{
      "app": "island27-cfc", "formato": 2, "cifrado": false,
      "dados": {
        "__proto__": {"poluido": true},
        "constructor": {"prototype": {"poluido2": true}},
        "config": {"nomeCfc": "<img src=x onerror=window.__xss=1>", "bloqueioMin": "abc", "__proto__": {"poluido3": true}},
        "proximaFicha": 1e308,
        "alunos": [
          {"id": "\\"><img src=x onerror=window.__xss=1>", "nome": "ID malicioso"},
          {"id": "abc123def", "nome": "Valido <b>x</b>", "categoria": "<script>", "servico": "Hack", "status": "Root", "matricula": "2024-13-45", "nascimento": "<img>", "numero": -5, "obs": "${'A'.repeat(50000)}"},
          {"id": "abc123def", "nome": "Duplicado"},
          {"id": "semnome01"},
          "lixo", null, 42
        ],
        "parcelas": [
          {"id": "parc00001", "alunoId": "abc123def", "valor": 1e308, "vencimento": "2025-01-10", "pagoEm": "2025-01-11", "valorPago": -50, "forma": "<b>Bitcoin</b>", "descricao": "<svg onload=window.__xss=1>"},
          {"id": "parc00002", "alunoId": "abc123def", "valor": "NaN", "vencimento": "2025-02-10"},
          {"id": "parc00003", "alunoId": "naoexiste1", "valor": 10, "vencimento": "2025-02-10"},
          {"id": "parc00004", "alunoId": "abc123def", "valor": 10, "vencimento": "ontem"}
        ],
        "excluidos": {"__proto__": 1, "abc": "x", "valido0001": 5}
      }
    }`);
    const arq = path.join(OUT, 'evil.json'); fs.writeFileSync(arq, JSON.stringify(evil));
    await ir(page, 'config');
    await page.setInputFiles('#restaurar', arq);
    await page.click('#confirmar-sim');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({
      pol: ({}).poluido || ({}).poluido2 || ({}).poluido3 || Object.prototype.poluido,
      alunos: Dados.estado.alunos.map(a => [a.id, a.nome, a.categoria, a.servico, a.status, a.matricula, a.nascimento, a.numero, a.obs.length]),
      parcelas: Dados.estado.parcelas.map(p => [p.id, p.valor, p.valorPago, p.forma]),
      prox: Dados.estado.proximaFicha, bloq: Dados.estado.config.bloqueioMin
    }));
    console.log('   ', JSON.stringify(r).slice(0, 400));
    check(!r.pol, 'protótipo não poluído');
    check(r.alunos.length === 1 && r.alunos[0][0] === 'abc123def', 'só o aluno válido entrou (id malicioso, duplicado, sem nome e lixo descartados)');
    check(r.alunos[0][2] === 'B' && r.alunos[0][3] === 'Outro' && r.alunos[0][4] === 'Em andamento', 'listas fixas forçadas (categoria/serviço/situação)');
    check(r.alunos[0][6] === null && /^\d{4}-\d{2}-\d{2}$/.test(r.alunos[0][5]), 'datas inválidas descartadas');
    check(r.alunos[0][7] >= 1 && r.alunos[0][8] === 2000, 'número da ficha corrigido e texto limitado a 2000');
    check(r.parcelas.length === 2 && r.parcelas.every(p => p[1] >= 0 && p[1] <= 1e7), 'parcelas órfãs/sem data descartadas, valores limitados');
    check(r.parcelas.every(p => p[3] === null || ['Dinheiro', 'PIX', 'Cartão de débito', 'Cartão de crédito', 'Boleto', 'Transferência'].includes(p[3])), 'forma de pagamento só da lista');
    check(r.prox < 1e7 && r.bloq === 15, 'próxima ficha e tempo de bloqueio saneados');
    for (const rt of ['inicio', 'fichas', 'pagos', 'pendentes', 'config']) { await ir(page, rt); }
    await page.evaluate(() => { Pagamentos.filtroPagos.de = '2000-01-01'; Pagamentos.filtroPagos.ate = '2100-01-01'; });
    await ir(page, 'pagos');
    check(await semXss(page), 'nenhum código executado após restaurar');

    for (const [nome, conteudo] of [['naojson.json', 'isto não é json'], ['array.json', '[1,2,3]'], ['outroapp.json', '{"app":"outro","dados":{}}']]) {
      fs.writeFileSync(path.join(OUT, nome), conteudo);
      const antes = await page.evaluate(() => Dados.estado.alunos.length);
      await ir(page, 'config'); await page.setInputFiles('#restaurar', path.join(OUT, nome)); await page.waitForTimeout(200);
      const msg = await page.innerText('#aviso');
      check(msg.includes('não é uma cópia') && antes === await page.evaluate(() => Dados.estado.alunos.length), 'rejeita arquivo inválido: ' + nome);
    }
    fs.writeFileSync(path.join(OUT, 'grande.json'), Buffer.alloc(21 * 1024 * 1024, 32));
    await page.setInputFiles('#restaurar', path.join(OUT, 'grande.json')); await page.waitForTimeout(200);
    check((await page.innerText('#aviso')).includes('grande demais'), 'rejeita arquivo de 21 MB');
    check(page.erros.length === 0, 'sem erros JS: ' + page.erros.join(' | '));
    await ctx.close();
  }

  console.log('\n[3] Senha e criptografia');
  {
    const ctx = await b.newContext({ acceptDownloads: true });
    const page = await novaPagina(ctx);
    await lancarFicha(page, { nome: 'Maria Segredo', cpf: '123.456.789-09', endereco: 'Rua Secreta 42' });
    await ir(page, 'config');
    await page.click('#cf-criar');
    await page.fill('#sn-nova', '12345678'); await page.fill('#sn-conf', '12345678'); await page.click('#sn-ok');
    check((await page.innerText('#sn-erro')).includes('fácil'), 'recusa senha fraca');
    await page.fill('#sn-nova', 'Ilha#2027forte'); await page.fill('#sn-conf', 'Ilha#2027fortX'); await page.click('#sn-ok');
    check((await page.innerText('#sn-erro')).includes('iguais'), 'recusa confirmação diferente');
    await page.fill('#sn-conf', 'Ilha#2027forte'); await page.click('#sn-ok');
    await page.waitForSelector('text=Protegido com senha', { timeout: 15000 });
    const bruto = await page.evaluate(() => Object.keys(localStorage).map(k => localStorage.getItem(k)).join('\n'));
    check(!/Maria|Segredo|123\.456|Secreta/.test(bruto), 'nada legível no armazenamento do navegador');
    check(/"cifrado":true/.test(bruto) && /"iter":600000/.test(bruto), 'AES-GCM + PBKDF2 600k iterações registrados');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#baixar')]);
    const backup = fs.readFileSync(await dl.path(), 'utf8');
    fs.writeFileSync(path.join(OUT, 'backup-cifrado.json'), backup);
    check(!/Maria|Segredo|123\.456/.test(backup) && JSON.parse(backup).cifrado === true, 'backup baixado também criptografado');

    await page.waitForTimeout(600); await page.waitForSelector('#status-salvo:has-text("Salvo")');
    await page.reload();
    await page.waitForSelector('#senha-entrar');
    const html = await page.content();
    check(!/Maria|Segredo/.test(html), 'tela de senha não mostra nenhum dado');
    check(await page.evaluate(() => Dados.estado.alunos.length === 0), 'dados não carregados na memória antes da senha');
    for (let i = 0; i < 5; i++) { await page.fill('#senha-entrar', 'errada' + i); await page.click('#senha-ok'); await esperar(page, () => document.getElementById('senha-erro').textContent !== '' && !document.getElementById('senha-ok').disabled); await page.waitForTimeout(50); }
    check((await page.innerText('#senha-erro')).includes('Aguarde'), 'após 5 erros impõe espera');
    await page.fill('#senha-entrar', 'Ilha#2027forte'); await page.click('#senha-ok');
    check((await page.innerText('#senha-erro')).includes('Aguarde'), 'durante a espera nem a senha certa entra');
    await page.evaluate(() => localStorage.setItem('island27-tentativas', JSON.stringify({ falhas: 0, ate: 0 })));
    await page.fill('#senha-entrar', 'Ilha#2027forte'); await page.click('#senha-ok');
    await esperar(page, () => !Seguranca.bloqueado && document.getElementById('bloqueio').hidden);
    check(await page.evaluate(() => Dados.estado.alunos[0].nome === 'Maria Segredo'), 'senha correta abre os dados');

    // adulteração do conteúdo cifrado
    const adulterado = await page.evaluate(() => {
      const env = JSON.parse(localStorage.getItem('island27-cfc-v2'));
      const bytes = atob(env.dados).split('');
      bytes[20] = String.fromCharCode(bytes[20].charCodeAt(0) ^ 1);
      env.dados = btoa(bytes.join(''));
      return JSON.stringify(env);
    });
    const ctx2 = await b.newContext();
    const p2 = await ctx2.newPage();
    await p2.addInitScript(v => { if (!sessionStorage.getItem('x')) { localStorage.setItem('island27-cfc-v2', v); sessionStorage.setItem('x', 1); } }, adulterado);
    await p2.goto(URL); await p2.waitForSelector('#senha-entrar');
    await p2.fill('#senha-entrar', 'Ilha#2027forte'); await p2.click('#senha-ok'); await p2.waitForTimeout(1500);
    check((await p2.innerText('#senha-erro')).includes('incorreta'), 'dados adulterados são recusados (integridade AES-GCM)');
    await ctx2.close();

    // bloqueio automático
    await page.evaluate(() => { Seguranca.ultimaAtividade = Date.now() - 16 * 60000; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForSelector('#senha-entrar', { timeout: 5000 });
    check(await page.evaluate(() => Dados.estado.alunos.length === 0 && !Cofre.chave && !document.body.innerText.includes('Maria')), 'bloqueio por inatividade apaga dados e chave da memória');
    await page.fill('#senha-entrar', 'Ilha#2027forte'); await page.click('#senha-ok');
    await esperar(page, () => !Seguranca.bloqueado && document.getElementById('bloqueio').hidden);

    // restaurar backup cifrado
    await page.evaluate(() => Dados.apagarTudo()); await page.waitForTimeout(600);
    await ir(page, 'config');
    await page.setInputFiles('#restaurar', path.join(OUT, 'backup-cifrado.json'));
    await page.fill('#bk-senha', 'errada'); await page.click('#bk-ok'); await page.waitForTimeout(1500);
    check((await page.innerText('#bk-erro')).includes('incorreta'), 'backup cifrado recusa senha errada');
    await page.fill('#bk-senha', 'Ilha#2027forte'); await page.click('#bk-ok');
    await page.click('#confirmar-sim', { timeout: 15000 });
    await page.waitForTimeout(500);
    check(await page.evaluate(() => Dados.estado.alunos.some(a => a.nome === 'Maria Segredo')), 'backup cifrado restaurado com a senha certa');

    // trocar senha em uma aba -> outra aba bloqueia
    const outra = await ctx.newPage(); outra.erros = []; outra.on('pageerror', e => outra.erros.push(e.message)); await outra.goto(URL); await outra.waitForSelector('#senha-entrar');
    await outra.fill('#senha-entrar', 'Ilha#2027forte'); await outra.click('#senha-ok'); await esperar(outra, () => !Seguranca.bloqueado && document.getElementById('bloqueio').hidden);
    await ir(page, 'config'); await page.click('#cf-trocar');
    await page.fill('#sn-atual', 'errada'); await page.fill('#sn-nova', 'NovaSenha!2028'); await page.fill('#sn-conf', 'NovaSenha!2028'); await page.click('#sn-ok');
    await esperar(page, () => document.getElementById('sn-erro').textContent.includes('incorreta'));
    check(true, 'troca de senha exige a senha atual');
    await page.fill('#sn-atual', 'Ilha#2027forte'); await page.click('#sn-ok');
    await page.waitForSelector('text=Senha trocada', { timeout: 20000 });
    await outra.waitForSelector('#senha-entrar', { timeout: 10000 });
    check(true, 'a outra aba bloqueou ao trocar a senha');
    await outra.fill('#senha-entrar', 'NovaSenha!2028'); await outra.click('#senha-ok'); await esperar(outra, () => !Seguranca.bloqueado && document.getElementById('bloqueio').hidden);
    check(await outra.evaluate(() => Dados.estado.alunos.length) === 1, 'a outra aba abre com a nova senha');
    check(page.erros.length === 0 && outra.erros.length === 0, 'sem erros JS: ' + page.erros.concat(outra.erros).join(' | '));
    await ctx.close();
  }

  console.log('\n[4] Confiabilidade: duas abas ao mesmo tempo, dinheiro e duplo clique');
  {
    const ctx = await b.newContext();
    const a = await novaPagina(ctx);
    const c = await novaPagina(ctx);
    await lancarFicha(a, { nome: 'Feito na aba A' });
    await lancarFicha(c, { nome: 'Feito na aba C' });
    await a.waitForTimeout(1500);
    const nomes = async p => p.evaluate(() => Dados.estado.alunos.map(x => x.nome).sort().join(','));
    check(await nomes(a) === 'Feito na aba A,Feito na aba C' && await nomes(c) === await nomes(a), 'fichas lançadas em paralelo não se perdem');
    const idA = await a.evaluate(() => Dados.estado.alunos.find(x => x.nome === 'Feito na aba A').id);
    await a.evaluate(id => Dados.excluirFicha(id), idA);
    await c.evaluate(() => Dados.salvarConfig({ cidade: 'Santos/SP' }));
    await a.waitForTimeout(1500);
    check(await nomes(a) === 'Feito na aba C' && await nomes(c) === 'Feito na aba C', 'ficha apagada não volta pela outra aba');
    check(await a.evaluate(() => Dados.estado.config.cidade) === 'Santos/SP', 'configuração feita na outra aba chega');

    await lancarFicha(a, { nome: 'Centavos' }, { total: '1000', parcelas: '3' });
    const vals = await a.evaluate(() => Dados.parcelasDoAluno(Dados.estado.alunos.find(x => x.nome === 'Centavos').id).map(p => p.valor));
    check(JSON.stringify(vals) === '[333.33,333.33,333.34]', 'divisão de R$1000 em 3 = 333,33 + 333,33 + 333,34');
    check(await a.evaluate(() => Dinheiro.somar([{ v: 0.1 }, { v: 0.2 }], 'v') === 0.3), 'soma sem erro de arredondamento (0,1 + 0,2 = 0,3)');
    check(await a.evaluate(() => [Dinheiro.ler('1.234,56'), Dinheiro.ler('1234.5'), Dinheiro.ler('abc'), Dinheiro.ler('-50'), Dinheiro.ler('1e9'), Dinheiro.ler('99999999999')].join('|')) === '1234.56|1234.5|0|0|0|0', 'leitura de valores rejeita negativo, letras e absurdos');

    await a.click('[data-receber]');
    await a.fill('#r-valor', '100');
    await a.evaluate(() => { const f = document.getElementById('form-receber'); f.requestSubmit(); f.requestSubmit(); });
    await a.waitForTimeout(400);
    const pagos = await a.evaluate(() => Dados.estado.parcelas.filter(p => p.pagoEm).length);
    check(pagos === 1, 'duplo clique em "Confirmar recebimento" registra só 1 pagamento');
    const restante = await a.evaluate(() => Dados.estado.parcelas.filter(p => p.descricao.includes('restante')).map(p => p.valor));
    check(JSON.stringify(restante) === '[233.33]', 'pagamento parcial gera o restante certo (233,33)');
    await a.close(); await c.close(); await ctx.close();
  }

  console.log('\n[5] CSP e superfície de ataque');
  {
    const ctx = await b.newContext();
    const page = await novaPagina(ctx);
    await page.evaluate(() => { const s = document.createElement('script'); s.textContent = 'window.__csp=1'; document.body.appendChild(s); });
    check(await page.evaluate(() => window.__csp === undefined), 'CSP bloqueia script embutido injetado');
    await page.evaluate(() => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js'; document.body.appendChild(s); });
    await page.waitForTimeout(800);
    check(await page.evaluate(() => typeof window._ === 'undefined'), 'CSP bloqueia script de outro site');
    await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = '<img src="data:," onload="window.__inl=1" onerror="window.__inl=1">'; document.body.appendChild(d); setTimeout('window.__str=1', 0); });
    await page.waitForTimeout(500);
    check(await page.evaluate(() => window.__inl === undefined), 'CSP bloqueia atributos on* (mesmo se algum texto escapar)');
    check(await page.evaluate(() => window.__str === undefined), 'CSP bloqueia código em texto (setTimeout/eval)');
    for (const rota of ['constructor', '__proto__', 'toString', 'ficha/<img src=x onerror=window.__xss=1>', 'ficha/..%2F..%2F']) {
      await page.goto(URL + '#' + rota); await page.waitForSelector('#status-salvo:has-text("Salvo")'); await page.waitForTimeout(150);
      check(await semXss(page) && page.erros.length === 0 && (await page.innerText('main')).length > 10, 'endereço malicioso #' + rota + ' cai numa tela normal');
    }
    check(await page.evaluate(() => UI.whatsapp('javascript:alert(1)', 'x') === '' && UI.whatsapp('(11) 91234-5678', 'oi&x=<b>').startsWith('https://wa.me/5511912345678?text=oi%26x%3D%3Cb%3E')), 'link de WhatsApp só com números e texto codificado');
    await ctx.close();
  }

  console.log('\n[6] Celular (390px) e PC (1366px)');
  for (const [w, h, nome] of [[390, 844, 'celular'], [1366, 900, 'pc']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500, isMobile: w < 500 });
    const page = await novaPagina(ctx);
    await page.evaluate(() => Config.exemplos());
    for (const r of ['inicio', 'fichas', 'nova-ficha', 'pagos', 'pendentes', 'config']) {
      await ir(page, r); await page.waitForTimeout(100);
      const larg = await page.evaluate(() => document.documentElement.scrollWidth);
      check(larg <= w, `${nome}: sem rolagem lateral em ${r} (${larg}px)`);
      if (r === 'inicio' || r === 'pendentes') await page.screenshot({ path: path.join(OUT, `${nome}-${r}.png`), fullPage: w > 500 });
    }
    const id = await page.evaluate(() => Dados.estado.alunos[0].id);
    await ir(page, 'ficha/' + id); await page.screenshot({ path: path.join(OUT, `${nome}-ficha.png`), fullPage: w > 500 });
    await page.click('[data-receber]'); await page.screenshot({ path: path.join(OUT, `${nome}-receber.png`) });
    if (w < 500) {
      const alvos = await page.$$eval('.menu nav a', as => as.map(a => a.getBoundingClientRect().height));
      check(alvos.every(hh => hh >= 44), 'celular: botões do menu com 44px+ de altura para o dedo');
      check(await page.$eval('#r-valor', el => getComputedStyle(el).fontSize) === '16px', 'celular: campos com 16px (iPhone não dá zoom)');
    }
    check(page.erros.length === 0, nome + ': sem erros JS ' + page.erros.join(' | '));
    await ctx.close();
  }

  await b.close();
  console.log(`\nRESULTADO: ${ok} passaram, ${falhas} falharam`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
