/*
 * seguranca.js — tela de senha, bloqueio automático e limite de tentativas.
 */

const Seguranca = {
  bloqueado: false,
  ultimaAtividade: Date.now(),

  iniciarVigia() {
    const marcar = () => { this.ultimaAtividade = Date.now(); };
    ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(ev => document.addEventListener(ev, marcar, { passive: true }));
    const conferir = () => {
      const min = Dados.estado.config.bloqueioMin;
      if (Cofre.cifrado && !this.bloqueado && min > 0 && Date.now() - this.ultimaAtividade > min * 60000) {
        this.bloquear('Bloqueado por inatividade.');
      }
    };
    setInterval(conferir, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) conferir(); });
  },

  // ----- Limite de tentativas (atraso crescente após 5 erros) -----
  lerTentativas() {
    try { return JSON.parse(localStorage.getItem('island27-tentativas')) || { falhas: 0, ate: 0 }; } catch (e) { return this._t || { falhas: 0, ate: 0 }; }
  },
  gravarTentativas(t) {
    this._t = t;
    try { localStorage.setItem('island27-tentativas', JSON.stringify(t)); } catch (e) { /* fica só na memória */ }
  },

  /* Mostra a tela de senha e resolve com o estado aberto. */
  pedirSenha(env, mensagem = '') {
    this.bloqueado = true;
    UI.fecharModal();
    document.getElementById('tela').replaceChildren();
    document.body.classList.add('travado');
    const caixa = document.getElementById('bloqueio');
    caixa.hidden = false;
    caixa.innerHTML = `
      <form class="bloqueio-caixa" id="form-senha" autocomplete="off">
        <img src="assets/logo.png" alt="" width="56" height="56">
        <h1>Sistema protegido</h1>
        <p class="muted" id="senha-msg">${UI.esc(mensagem || 'Digite a senha para abrir as fichas e os pagamentos.')}</p>
        <div class="campo"><label for="senha-entrar">Senha</label>
          <input type="password" id="senha-entrar" autocomplete="current-password" required maxlength="200"></div>
        <button class="btn btn-primario" id="senha-ok">Entrar</button>
        <p class="erro-texto" id="senha-erro" role="alert"></p>
      </form>`;
    const campo = document.getElementById('senha-entrar');
    campo.focus();

    return new Promise(resolve => {
      document.getElementById('form-senha').onsubmit = async e => {
        e.preventDefault();
        const erro = document.getElementById('senha-erro');
        const botao = document.getElementById('senha-ok');
        const t = this.lerTentativas();
        if (t.ate > Date.now()) {
          erro.textContent = `Muitas tentativas erradas. Aguarde ${Math.ceil((t.ate - Date.now()) / 1000)} segundos.`;
          return;
        }
        botao.disabled = true; botao.textContent = 'Verificando…'; erro.textContent = '';
        try {
          const estado = await Cofre.desbloquear(env, campo.value);
          this.gravarTentativas({ falhas: 0, ate: 0 });
          campo.value = '';
          caixa.hidden = true; caixa.replaceChildren();
          document.body.classList.remove('travado');
          this.bloqueado = false;
          this.ultimaAtividade = Date.now();
          resolve(estado);
        } catch (err) {
          const falhas = t.falhas + 1;
          const espera = falhas >= 5 ? Math.min(15 * 60, 30 * 2 ** (falhas - 5)) : 0;
          this.gravarTentativas({ falhas, ate: Date.now() + espera * 1000 });
          erro.textContent = espera ? `Senha incorreta. Aguarde ${espera} segundos para tentar de novo.` : 'Senha incorreta.';
          campo.select();
        } finally {
          botao.disabled = false; botao.textContent = 'Entrar';
        }
      };
    });
  },

  /* Tira os dados da tela e da memória e pede a senha de novo. */
  async bloquear(mensagem) {
    if (this.bloqueado) return;
    this.bloqueado = true;
    if (Cofre.pendente && Cofre.cifrado) await Cofre.salvarAgora();
    Cofre.esquecer();
    const env = await Cofre.armazem.ler();
    if (!env || !env.cifrado) { // a senha foi removida em outro aparelho
      this.bloqueado = false;
      Dados.estado = await Cofre.abrir(env);
      Cofre.genBase = env && env.gen;
      Telas.recarregar();
      return;
    }
    const estado = await this.pedirSenha(env, mensagem);
    Dados.estado = estado;
    Cofre.genBase = env.gen;
    Telas.recarregar();
  },

  /* Regras mínimas para uma senha nova. Devolve o problema ou ''. */
  problemaSenha(senha, confirmacao) {
    if (senha.length < 8) return 'Use pelo menos 8 caracteres.';
    if (/^(.)\1+$/.test(senha) || /^(12345678|123456789|87654321|senha123|password|island27)/i.test(senha)) return 'Essa senha é fácil de adivinhar. Escolha outra.';
    if (senha !== confirmacao) return 'As duas senhas não são iguais.';
    return '';
  }
};
