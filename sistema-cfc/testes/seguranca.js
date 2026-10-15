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
    const convergiu = async () => { for (let i = 0; i < 80; i++) { if (await nomes(a) === 'Feito na aba C' && await nomes(c) === 'Feito na aba C') return true; await a.waitForTimeout(100); } return false; };
    check(await convergiu(), 'ficha apagada não volta pela outra aba');
    let cidade = null;
    for (let i = 0; i < 80 && cidade !== 'Santos/SP'; i++) { cidade = await a.evaluate(() => Dados.estado.config.cidade); if (cidade !== 'Santos/SP') await a.waitForTimeout(100); }
    check(cidade === 'Santos/SP', 'configuração feita na outra aba chega');
    await a.waitForTimeout(1500);
    const g1 = await a.evaluate(() => JSON.parse(localStorage.getItem('island27-cfc-v2')).gen);
    await a.waitForTimeout(2000);
    const g2 = await a.evaluate(() => JSON.parse(localStorage.getItem('island27-cfc-v2')).gen);
    check(g1 === g2, 'depois de entrarem em acordo, as abas param de regravar');

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

  console.log('\n[7] Regras financeiras (achados da revisão)');
  {
    const ctx = await b.newContext();
    const page = await novaPagina(ctx);
    const r = await page.evaluate(() => {
      const out = {};
      out.milhar = [Dinheiro.ler('2.500'), Dinheiro.ler('1.234.567'), Dinheiro.ler('2.500,50'), Dinheiro.ler('2.5')].join('|');
      const f = Dados.criarFicha({ nome: 'Fin' }, { total: 1000, parcelas: 2 });
      const [p1, p2] = Dados.parcelasDoAluno(f.id);
      try { Dados.receber(p1.id, 800, Hoje.iso(), 'PIX', ''); out.acima = 'aceitou'; } catch (e) { out.acima = 'recusou'; }
      Dados.receber(p1.id, 200, Hoje.iso(), 'PIX', '');
      out.parcial = Dados.resumoAluno(f.id);
      Dados.estornar(p1.id);
      out.aposEstorno = Dados.parcelasDoAluno(f.id).map(p => [p.valor, !!p.pagoEm]);
      // dívida fantasma: A recebe parcial, B (outra versão) recebe inteiro
      const base = JSON.parse(JSON.stringify(Dados.estado));
      Dados.receber(p2.id, 100, Hoje.iso(), 'PIX', '');
      const versaoA = Saneamento.estado(JSON.parse(JSON.stringify(Dados.estado)));
      const versaoB = Saneamento.estado(base);
      const pB = versaoB.parcelas.find(p => p.id === p2.id);
      pB.pagoEm = Hoje.iso(); pB.valorPago = 500; pB.forma = 'PIX'; pB.alteradoEm = Date.now() + 5000;
      const m = mesclarEstados(versaoA, versaoB);
      out.fantasma = m.parcelas.filter(p => p.alunoId === f.id && !p.pagoEm && p.descricao.includes('restante')).map(p => p.descricao);
      // números de ficha duplicados
      const x = Saneamento.estado(JSON.parse(JSON.stringify(Dados.estado)));
      const y = Saneamento.estado(JSON.parse(JSON.stringify(Dados.estado)));
      x.alunos.push(Saneamento.aluno({ id: 'aaaaaa1111', nome: 'X', numero: 50, criadoEm: '2026-01-01', alteradoEm: 1 }));
      y.alunos.push(Saneamento.aluno({ id: 'bbbbbb2222', nome: 'Y', numero: 50, criadoEm: '2026-01-02', alteradoEm: 2 }));
      const mm = mesclarEstados(x, y), mm2 = mesclarEstados(y, x);
      out.numeros = [new Set(mm.alunos.map(a => a.numero)).size === mm.alunos.length, mm.alunos.find(a => a.nome === 'Y').numero === mm2.alunos.find(a => a.nome === 'Y').numero];
      // parcelas de zero centavos
      const z = Dados.criarFicha({ nome: 'Zero' }, { total: 100, entrada: 99.5, entradaPaga: true, parcelas: 60 });
      out.zero = Dados.parcelasDoAluno(z.id).filter(p => p.valor <= 0).length + '/' + Dados.parcelasDoAluno(z.id).length;
      // cancelado
      Dados.atualizarFicha(f.id, { status: 'Cancelado' });
      out.cancelado = Dados.resumoAluno(f.id);
      return out;
    });
    console.log('   ', JSON.stringify(r).slice(0, 500));
    check(r.milhar === '2500|1234567|2500.5|2.5', '"2.500" é lido como dois mil e quinhentos');
    check(r.acima === 'recusou', 'pagamento acima do valor da parcela é recusado');
    check(r.parcial.pago + r.parcial.aberto === r.parcial.total, 'parcial: pago + em aberto = contrato');
    check(JSON.stringify(r.aposEstorno) === '[[500,false],[500,false]]', 'desfazer pagamento parcial devolve o restante para a parcela original');
    check(r.fantasma.length === 0, 'parcial num aparelho + pagamento inteiro no outro não gera dívida fantasma');
    check(r.numeros[0] && r.numeros[1], 'fichas com mesmo número em dois aparelhos são renumeradas igual nos dois');
    check(r.zero === '0/51', 'não cria parcelas de R$ 0,00 (60 pedidas, 50 centavos → entrada + 50 parcelas)');
    check(r.cancelado.aberto === 0 && r.cancelado.atrasadas === 0 && r.cancelado.total === r.cancelado.pago, 'aluno cancelado não fica devendo');
    await ir(page, 'nova-ficha'); await page.fill('[name=nome]', 'Teclado'); await page.fill('#p-total', '2.500'); await page.fill('#p-parcelas', '3');
    console.log('    previa:', JSON.stringify(await page.innerText('#previa')));
    check((await page.innerText('#previa')).replace(/\s/g, ' ').includes('2× R$ 833,33 + 1× R$ 833,34'), 'prévia mostra o valor real da última parcela');
    await ir(page, 'nova-ficha'); await page.fill('#c-nome', 'X'); await page.press('#c-nome', 'Enter'); await page.waitForTimeout(200);
    check(await page.evaluate(() => document.activeElement.id) === 'p-total', 'erro no formulário leva o cursor ao campo que falta');
    check(page.erros.length === 0, 'sem erros JS: ' + page.erros.join(' | '));
    await ctx.close();
  }

  console.log('\n[8] Bloqueio sem perda nem vazamento (achados da auditoria)');
  {
    const ctx = await b.newContext();
    const page = await novaPagina(ctx);
    await page.evaluate(async () => { Dados.criarFicha({ nome: 'Maria Segredo', cpf: '12345678909' }, { total: 100, parcelas: 1 }); await Cofre.salvarAgora(); await Cofre.definirSenha('Ilha#2027forte'); });
    // armazenamento falhando + edição pendente + bloqueio
    await page.evaluate(() => {
      window.__orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === 'island27-cfc-v2') { const e = new Error('cheio'); e.name = 'QuotaExceededError'; throw e; } return window.__orig.call(this, k, v); };
      Dados.criarFicha({ nome: 'Edicao pendente' }, { total: 50, parcelas: 1 });
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => Fichas.imprimir && document.getElementById('impressao').insertAdjacentHTML('beforeend', '<p>CPF 12345678909</p>'));
    await page.evaluate(() => { Seguranca.bloquear('teste'); });
    await page.waitForSelector('#senha-entrar');
    await page.evaluate(() => { Storage.prototype.setItem = window.__orig; });
    await page.waitForTimeout(6500);
    const env = await page.evaluate(() => JSON.parse(localStorage.getItem('island27-cfc-v2')));
    check(env.cifrado === true, 'bloqueio com salvamento falhando: nada é regravado sem cifra depois');
    check(await page.evaluate(() => document.getElementById('impressao').innerHTML === '' && !document.body.innerText.includes('Maria')), 'bloqueio limpa a área de impressão e a tela');
    await page.fill('#senha-entrar', 'Ilha#2027forte'); await page.click('#senha-ok');
    await esperar(page, () => !Seguranca.bloqueado);
    check(await page.evaluate(() => Dados.estado.alunos.some(a => a.nome === 'Edicao pendente') && Dados.estado.alunos.some(a => a.nome === 'Maria Segredo')), 'edição que não tinha sido salva volta após desbloquear');
    await esperar(page, () => !Cofre.pendente && Cofre.status === 'ok');

    // senha trocada em outra aba com edição pendente
    const outra = await ctx.newPage(); outra.erros = []; outra.on('pageerror', e => outra.erros.push(e.message));
    await outra.goto(URL); await outra.waitForSelector('#senha-entrar');
    await outra.fill('#senha-entrar', 'Ilha#2027forte'); await outra.click('#senha-ok'); await esperar(outra, () => !Seguranca.bloqueado);
    await outra.evaluate(() => { Dados.criarFicha({ nome: 'Lancado em B' }, { total: 10, parcelas: 1 }); });
    await page.evaluate(() => Cofre.definirSenha('NovaSenha!2028'));
    await outra.waitForSelector('#senha-entrar', { timeout: 15000 });
    await outra.fill('#senha-entrar', 'NovaSenha!2028'); await outra.click('#senha-ok'); await esperar(outra, () => !Seguranca.bloqueado);
    check(await esperar(outra, () => Dados.estado.alunos.some(a => a.nome === 'Lancado em B')), 'ficha lançada durante a troca de senha em outra aba não se perde');

    // leitura falhando durante o bloqueio
    await outra.evaluate(() => { Cofre.armazem.ler = async () => { throw new Error('offline'); }; Seguranca.bloquear('x'); });
    await outra.waitForSelector('#tentar-de-novo');
    check(await outra.evaluate(() => !document.getElementById('tela').innerText.includes('Maria') && Dados.estado.alunos.length === 0), 'sem conexão no bloqueio: tela limpa e botão "Tentar de novo"');
    check(page.erros.length + outra.erros.length === 0, 'sem erros JS: ' + page.erros.concat(outra.erros).join(' | '));
    await ctx.close();
  }

  console.log('\n[9] Painel "Entradas" no topo do Início');
  {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await novaPagina(ctx);
    // Pagamentos em datas conhecidas: hoje, há 3 dias (mesma semana ou não), mês passado, ano passado
    const datas = await page.evaluate(() => {
      const hoje = Hoje.iso();
      const f = Dados.criarFicha({ nome: 'Teste Entradas' }, { total: 1000, parcelas: 4, primeiroVencimento: hoje });
      const ps = Dados.parcelasDoAluno(f.id);
      const ontemAno = Hoje.somarMeses(hoje, -12);
      const mesPassado = Hoje.somarMeses(Hoje.inicioMes(), -1);
      Dados.receber(ps[0].id, 250, hoje, 'PIX', '');
      Dados.receber(ps[1].id, 100, hoje, 'Dinheiro', ''); // parcial: gera restante
      Dados.receber(ps[2].id, 250, mesPassado, 'PIX', '');
      Dados.receber(ps[3].id, 250, ontemAno, 'Boleto', '');
      Telas.ir('inicio');
      return { hoje, mesPassado, ontemAno };
    });
    const total = () => page.$eval('.entradas-total strong', el => el.textContent.replace(/\s/g, ' '));
    const primeiro = await page.$eval('#tela > *:first-child', el => el.id);
    check(primeiro === 'painel-entradas', 'painel "Entradas" é a primeira coisa da página');
    check((await total()) === 'R$ 350,00', 'Hoje: R$ 350,00 (250 + 100)');
    const formas = (await page.innerText('.entradas-formas')).replace(/\s+/g, ' ');
    check(/PIX R\$ 250,00/.test(formas) && /Dinheiro R\$ 100,00/.test(formas), 'Hoje: separado por forma de pagamento (' + formas + ')');
    await page.click('[data-periodo-inicio="mes"]');
    check((await total()) === 'R$ 350,00', 'Mês: só o que entrou neste mês');
    await page.click('[data-periodo-inicio="ano"]');
    const esperadoAno = datas.mesPassado.slice(0, 4) === datas.hoje.slice(0, 4) ? 'R$ 600,00' : 'R$ 350,00';
    check((await total()) === esperadoAno, `Ano: ${esperadoAno}`);
    await page.click('[data-periodo-inicio="semana"]');
    check((await total()) === 'R$ 350,00', 'Semana: inclui hoje');
    await page.click('[data-periodo-inicio="personalizado"]');
    await page.fill('#ent-de', datas.ontemAno); await page.dispatchEvent('#ent-de', 'change');
    await page.fill('#ent-ate', datas.hoje); await page.dispatchEvent('#ent-ate', 'change');
    check((await total()) === 'R$ 850,00', 'Personalizado: de um ano atrás até hoje = R$ 850,00');
    await page.fill('#ent-de', datas.hoje); await page.dispatchEvent('#ent-de', 'change');
    await page.fill('#ent-ate', datas.ontemAno); await page.dispatchEvent('#ent-ate', 'change');
    check((await page.innerText('#painel-entradas')).includes('A data inicial está depois da final'), 'Personalizado: avisa datas invertidas');
    await page.fill('#ent-de', datas.mesPassado); await page.dispatchEvent('#ent-de', 'change');
    await page.fill('#ent-ate', datas.hoje); await page.dispatchEvent('#ent-ate', 'change');
    await page.click('[data-ver-entradas]');
    await page.waitForSelector('#totais');
    const totais = (await page.innerText('#totais')).replace(/\s+/g, ' ');
    check(await page.$eval('#f-de', el => el.value) === datas.mesPassado && /R\$ 600,00/.test(totais), '"Ver lista" abre os pagamentos do mesmo período (' + totais + ')');
    await page.evaluate(() => Telas.ir('inicio'));
    check(await page.$eval('.periodo.ativo', el => el.dataset.periodoInicio) === 'personalizado', 'período escolhido fica lembrado ao voltar');
    await page.setViewportSize({ width: 360, height: 740 });
    await page.screenshot({ path: path.join(OUT, 'entradas-celular.png') });
    check(await page.evaluate(() => document.documentElement.scrollWidth) <= 360, 'celular 360px: sem rolagem lateral');
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.screenshot({ path: path.join(OUT, 'entradas-pc.png') });
    check(page.erros.length === 0, 'sem erros JS: ' + page.erros.join(' | '));
    await ctx.close();
  }

  await b.close();
  console.log(`\nRESULTADO: ${ok} passaram, ${falhas} falharam`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
