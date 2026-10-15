/*
 * cofre.js — onde e como os dados ficam guardados.
 *
 * - Aberto pelo link publicado: os dados ficam na nuvem, numa área privada
 *   da sua conta (ninguém mais lê, nem quem tiver o link). Celular e PC
 *   veem os mesmos dados e se atualizam sozinhos.
 * - Aberto como arquivo no computador: os dados ficam no navegador.
 *
 * Com senha ativada, tudo é criptografado (AES-256-GCM, chave derivada da
 * senha com PBKDF2-SHA256, 600 mil iterações) ANTES de sair da tela. A senha
 * nunca é salva. Sem a senha os dados não podem ser lidos — nem por nós.
 *
 * Formato salvo ("envelope"):
 *   { app, formato: 2, gen, cifrado: false, dados: {...} }
 *   { app, formato: 2, gen, cifrado: true, kdf: {iter, sal}, iv, dados: "<base64>" }
 */

const APP_ID = 'island27-cfc';
const CHAVE_LOCAL = 'island27-cfc-v2';
const CHAVE_LOCAL_ANTIGA = 'island27-cfc-v1';
const ITERACOES = 600000;
const TAMANHO_PARTE = 60000; // caracteres por documento na nuvem (limite de 256 KiB)

/* ---------- Criptografia ---------- */
const Cripto = {
  b64(bytes) {
    let s = '';
    bytes.forEach(b => { s += String.fromCharCode(b); });
    return btoa(s);
  },
  deB64(texto) {
    const s = atob(texto);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  },
  disponivel() { return !!(window.crypto && crypto.subtle); },

  async derivar(senha, sal, iter = ITERACOES) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iter },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  },

  async cifrar(chave, texto) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const dados = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, new TextEncoder().encode(texto));
    return { iv: this.b64(iv), dados: this.b64(new Uint8Array(dados)) };
  },

  /* Lança erro se a senha estiver errada ou se alguém mexeu nos dados. */
  async decifrar(chave, iv, dados) {
    const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.deB64(iv) }, chave, this.deB64(dados));
    return new TextDecoder().decode(claro);
  }
};

class PrecisaSenha extends Error {}

/* ---------- Armazenamento no navegador ---------- */
const ArmazemLocal = {
  tipo: 'local',
  async iniciar() {
    localStorage.setItem('island27-teste', '1');
    localStorage.removeItem('island27-teste');
  },
  async ler() {
    const texto = localStorage.getItem(CHAVE_LOCAL);
    if (texto) return JSON.parse(texto);
    // Dados da primeira versão do sistema (sem envelope).
    const antigo = localStorage.getItem(CHAVE_LOCAL_ANTIGA);
    return antigo ? { app: APP_ID, formato: 2, gen: 'v1', cifrado: false, dados: JSON.parse(antigo) } : null;
  },
  async gravar(env) {
    localStorage.setItem(CHAVE_LOCAL, JSON.stringify(env));
    localStorage.removeItem(CHAVE_LOCAL_ANTIGA);
  },
  observar(aoMudar) {
    window.addEventListener('storage', e => { if (e.key === CHAVE_LOCAL) aoMudar(); });
  },
  /* Duas abas abertas não gravam ao mesmo tempo (uma espera a outra). */
  async travar() {
    if (!navigator.locks) return () => {};
    return new Promise(pegou => {
      navigator.locks.request(CHAVE_LOCAL, () => new Promise(liberar => pegou(liberar))).catch(() => pegou(() => {}));
    });
  }
};

/* ---------- Armazenamento sem salvar (último recurso) ---------- */
const ArmazemMemoria = {
  tipo: 'memoria', env: null,
  async iniciar() {},
  async ler() { return this.env; },
  async gravar(env) { this.env = env; },
  observar() {},
  async travar() { return () => {}; }
};

/* ---------- Armazenamento na nuvem (área privada do usuário) ---------- */
const ArmazemNuvem = {
  tipo: 'nuvem', db: null, base: '', idAba: Dados.novoId(),

  async iniciar(db, uid) {
    this.db = db;
    this.base = 'data/users/' + uid;
    this.meta = db.doc(this.base + '/meta');
  },

  async tentar(fn) {
    try { return await fn(); } catch (e) {
      if (e && e.code === 'unavailable') {
        await new Promise(r => setTimeout(r, 400 + Math.random() * 800));
        return fn();
      }
      throw e;
    }
  },

  async ler() {
    const m = await this.tentar(() => this.meta.get());
    if (!m.exists) return null;
    const meta = m.data();
    const n = Saneamento.inteiro(meta.partes, 1, 500, 0);
    if (!n || !/^[a-z0-9]{6,40}$/i.test(meta.gen)) return null;
    const partes = await Promise.all(Array.from({ length: n }, (_, i) =>
      this.tentar(() => this.db.doc(`${this.base}/p-${meta.gen}-${i}`).get())));
    if (partes.some(p => !p.exists)) throw new Error('Dados na nuvem incompletos');
    return JSON.parse(partes.map(p => p.data().t).join(''));
  },

  /* Grava as partes novas primeiro e só depois aponta o "meta" para elas:
   * se a conexão cair no meio, a versão anterior continua inteira. */
  async gravar(env) {
    const texto = JSON.stringify(env);
    const partes = [];
    for (let i = 0; i < texto.length; i += TAMANHO_PARTE) partes.push(texto.slice(i, i + TAMANHO_PARTE));
    const anterior = await this.tentar(() => this.meta.get());
    for (let i = 0; i < partes.length; i++) {
      await this.tentar(() => this.db.doc(`${this.base}/p-${env.gen}-${i}`).set({ t: partes[i] }));
    }
    await this.tentar(() => this.meta.set({ gen: env.gen, partes: partes.length, em: Date.now(), aba: this.idAba }));
    if (anterior.exists) {
      const velho = anterior.data();
      const n = Saneamento.inteiro(velho.partes, 1, 500, 0);
      if (velho.gen !== env.gen && /^[a-z0-9]{6,40}$/i.test(velho.gen)) {
        for (let i = 0; i < n; i++) this.db.doc(`${this.base}/p-${velho.gen}-${i}`).delete().catch(() => {});
      }
    }
  },

  /* Apaga partes de versões antigas (inclusive as que ficaram sem cifra antes da senha). */
  async limparSobras(genAtual) {
    const lista = await this.db.collection(this.base).get();
    for (const d of lista.docs) {
      if (d.id.startsWith('p-') && !d.id.startsWith(`p-${genAtual}-`)) await this.tentar(() => this.db.doc(`${this.base}/${d.id}`).delete());
    }
  },

  observar(aoMudar) {
    this.meta.onSnapshot(s => {
      if (s.exists && s.data().aba !== this.idAba && !s.metadata.hasPendingWrites) aoMudar();
    }, () => {});
  },

  /* Só um aparelho grava por vez (os outros esperam alguns instantes). */
  async travar() {
    const trava = this.db.doc(this.base + '/trava');
    for (let i = 0; i < 12; i++) {
      try {
        const r = await trava.acquire({ holder: this.idAba, ttlMs: 5000 });
        if (r.acquired) return () => {};
      } catch (e) { return () => {}; }
      await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
    }
    return () => {};
  }
};

/* Retrato do estado que não depende da ordem dos registros (para comparar duas versões). */
function assinaturaEstado(bruto) {
  // Passa pela mesma validação dos dados salvos: mesmos campos, na mesma ordem.
  const e = Saneamento.estado(JSON.parse(JSON.stringify(bruto)));
  const porId = lista => lista.map(x => JSON.stringify(x)).sort();
  return JSON.stringify([e.config, e.proximaFicha, porId(e.alunos), porId(e.parcelas), Object.keys(e.excluidos).sort().map(k => [k, e.excluidos[k]])]);
}

/* ---------- O cofre ---------- */
const Cofre = {
  armazem: null,
  chave: null,       // CryptoKey (só em memória, nunca salva)
  sal: null,         // sal da senha atual (base64)
  iter: ITERACOES,
  genBase: null,     // versão que esta tela carregou por último
  pendente: false,
  timer: null,
  fila: Promise.resolve(),
  status: 'ok',      // ok | salvando | erro
  ouvintes: [],
  aberto: false,     // true só quando Dados.estado tem os dados reais carregados (nunca durante o bloqueio)
  epoca: 0,          // muda a cada bloqueio: gravações iniciadas antes dele são descartadas
  liberarSemSenha: false,

  get cifrado() { return !!this.chave; },
  get modo() { return this.armazem ? this.armazem.tipo : 'memoria'; },

  async iniciar() {
    // 1) Nuvem, quando aberto pelo link publicado.
    if (window.claude && typeof window.claude.use === 'function') {
      try {
        const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
        const uid = user ? await user.id() : null;
        if (db && uid) {
          await ArmazemNuvem.iniciar(db, uid);
          this.armazem = ArmazemNuvem;
        }
      } catch (e) { /* segue para o navegador */ }
    }
    // 2) Navegador.
    if (!this.armazem) {
      try { await ArmazemLocal.iniciar(); this.armazem = ArmazemLocal; } catch (e) { this.armazem = ArmazemMemoria; }
    }
    this.armazem.observar(() => this.sincronizar());
    window.addEventListener('beforeunload', e => {
      if (this.pendente || this.status === 'salvando') { e.preventDefault(); e.returnValue = ''; }
    });
    return this.armazem.ler();
  },

  /* Abre um envelope: devolve o estado validado ou lança PrecisaSenha. */
  async abrir(env, chave = this.chave) {
    if (!env || typeof env !== 'object') return Saneamento.estado(null);
    if (env.app && env.app !== APP_ID) throw new Error('Arquivo de outro sistema');
    if (!env.cifrado) {
      if (!env.dados && Array.isArray(env.alunos)) return Saneamento.estado(env); // backup antigo
      return Saneamento.estado(env.dados);
    }
    const sal = env.kdf && env.kdf.sal;
    if (!chave || sal !== this.sal) throw new PrecisaSenha();
    const texto = await Cripto.decifrar(chave, env.iv, env.dados);
    return Saneamento.estado(JSON.parse(texto));
  },

  /* Tenta abrir um envelope cifrado com a senha digitada. */
  async desbloquear(env, senha) {
    const iter = Saneamento.inteiro(env.kdf && env.kdf.iter, 100000, 5000000, ITERACOES);
    const chave = await Cripto.derivar(senha, Cripto.deB64(env.kdf.sal), iter);
    const texto = await Cripto.decifrar(chave, env.iv, env.dados); // senha errada lança erro aqui
    this.chave = chave; this.sal = env.kdf.sal; this.iter = iter;
    return Saneamento.estado(JSON.parse(texto));
  },

  async fechar(estado) {
    const env = { app: APP_ID, formato: 2, gen: Dados.novoId(), cifrado: this.cifrado };
    if (this.cifrado) {
      const c = await Cripto.cifrar(this.chave, JSON.stringify(estado));
      env.kdf = { alg: 'PBKDF2-SHA256', iter: this.iter, sal: this.sal };
      env.iv = c.iv; env.dados = c.dados;
    } else {
      env.dados = estado;
    }
    return env;
  },

  async definirSenha(senha) {
    const sal = crypto.getRandomValues(new Uint8Array(16));
    this.chave = await Cripto.derivar(senha, sal);
    this.sal = Cripto.b64(sal); this.iter = ITERACOES;
    await this.salvarAgora();
    await this.limparSobras(); // nenhuma cópia antiga legível fica para trás
  },

  async limparSobras() {
    if (this.armazem.limparSobras && this.genBase) {
      try { await this.armazem.limparSobras(this.genBase); } catch (e) { /* tenta de novo na próxima vez */ }
    }
  },

  async conferirSenha(senha) {
    const chave = await Cripto.derivar(senha, Cripto.deB64(this.sal), this.iter);
    const teste = await Cripto.cifrar(this.chave, 'x');
    try { await Cripto.decifrar(chave, teste.iv, teste.dados); return true; } catch (e) { return false; }
  },

  async removerSenha() {
    this.chave = null; this.sal = null;
    this.liberarSemSenha = true; // única situação em que se grava sem cifra por cima de dados cifrados
    try { await this.salvarAgora(); } finally { this.liberarSemSenha = false; }
  },

  /* Esquece a chave e os dados da memória (bloqueio). Cancela qualquer
   * gravação agendada para que nada vazio ou sem cifra seja salvo depois. */
  esquecer() {
    clearTimeout(this.timer);
    this.epoca++;
    this.aberto = false;
    this.pendente = false;
    this.chave = null;
    Dados.estado = Saneamento.estado(null);
    const imp = document.getElementById('impressao');
    if (imp) imp.replaceChildren();
  },

  agendarSalvamento() {
    this.pendente = true;
    this.avisar();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.salvarAgora(), 400);
  },

  /* Salva já (em fila: nunca duas gravações ao mesmo tempo). */
  salvarAgora() {
    clearTimeout(this.timer);
    this.fila = this.fila.then(() => this.gravar()).catch(() => {});
    return this.fila;
  },

  async gravar() {
    if (!this.aberto) return; // bloqueado: não há dados reais para salvar
    const epoca = this.epoca;
    this.pendente = false;
    this.status = 'salvando'; this.avisar();
    const liberar = await this.armazem.travar();
    try {
      // Se outro aparelho salvou desde a última leitura, junta antes de gravar.
      const atual = await this.armazem.ler();
      // Nunca troca dados cifrados por dados sem cifra, a não ser ao remover a senha.
      if (atual && atual.cifrado && !this.cifrado && !this.liberarSemSenha) throw new PrecisaSenha();
      if (atual && atual.gen !== this.genBase) {
        const remoto = await this.abrir(atual);
        if (epoca !== this.epoca) return;
        Dados.estado = mesclarEstados(Dados.estado, remoto);
      }
      const env = await this.fechar(Dados.estado);
      if (epoca !== this.epoca || !this.aberto) return; // bloqueou no meio: descarta
      await this.armazem.gravar(env);
      this.genBase = env.gen;
      this.status = 'ok';
    } catch (e) {
      if (epoca !== this.epoca) return;
      this.status = 'erro';
      this.pendente = true;
      if (e instanceof PrecisaSenha) { Seguranca.bloquear('A senha foi alterada em outro aparelho. Digite a nova senha.', true); return; }
      const cheio = e && (e.name === 'QuotaExceededError' || e.code === 'quota_exceeded');
      UI.aviso(cheio ? 'Sem espaço para salvar. Baixe uma cópia de segurança e apague registros antigos.' : 'Não foi possível salvar agora. Tentando de novo…', true);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.salvarAgora(), 5000);
    } finally {
      liberar();
      if (this.status === 'salvando') this.status = 'ok';
      this.avisar();
    }
  },

  /* Outro aparelho/aba salvou: traz as mudanças para esta tela. */
  async sincronizar() {
    if (Seguranca.bloqueado || !this.aberto) return;
    this.fila = this.fila.then(async () => {
      if (!this.aberto) return;
      const env = await this.armazem.ler();
      if (!env || env.gen === this.genBase) return;
      try {
        const remoto = await this.abrir(env);
        Dados.estado = mesclarEstados(Dados.estado, remoto);
        this.genBase = env.gen;
        if (!env.cifrado) { this.chave = null; this.sal = null; } // senha removida no outro aparelho
        // Se esta tela sabe algo que a versão recebida não tem (ex.: uma exclusão que a outra
        // aba sobrescreveu), grava de novo. Assim as duas telas sempre terminam iguais.
        if (assinaturaEstado(Dados.estado) !== assinaturaEstado(remoto)) this.agendarSalvamento();
        Telas.recarregarSeSeguro();
      } catch (e) {
        if (e instanceof PrecisaSenha) Seguranca.bloquear('A proteção por senha foi alterada em outro aparelho.', true);
      }
    }).catch(() => {});
  },

  avisar() { this.ouvintes.forEach(fn => fn(this.status, this.pendente)); }
};
