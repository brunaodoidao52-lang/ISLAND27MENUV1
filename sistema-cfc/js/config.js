/* config.js — dados da autoescola, senha e cópia de segurança. */

const TAMANHO_MAX_BACKUP = 20 * 1024 * 1024; // 20 MB

const Config = {
  mostrar() {
    const c = Dados.estado.config;
    const onde = { nuvem: 'na nuvem, numa área privada da sua conta (celular e PC sincronizados)', local: 'neste navegador, neste aparelho', memoria: 'em lugar nenhum (o navegador bloqueou o armazenamento)' }[Cofre.modo];
    const tempos = [[0, 'Nunca'], [5, '5 minutos'], [15, '15 minutos'], [30, '30 minutos'], [60, '1 hora']];
    UI.tela(`
      <div class="topo"><div><h1>Configurações</h1><p>Dados da autoescola, segurança e cópias de segurança.</p></div></div>

      <form class="painel" id="form-config" novalidate>
        <h2>Dados da autoescola</h2>
        <p class="muted">Aparecem nos recibos e na ficha impressa.</p>
        <div class="grade">
          <div class="campo c2"><label for="cf-nome">Nome do CFC</label><input id="cf-nome" name="nomeCfc" maxlength="80" value="${UI.esc(c.nomeCfc)}"></div>
          <div class="campo"><label for="cf-cnpj">CNPJ</label><input id="cf-cnpj" name="cnpj" maxlength="20" value="${UI.esc(c.cnpj)}"></div>
          <div class="campo"><label for="cf-tel">Telefone</label><input id="cf-tel" name="telefone" type="tel" maxlength="30" value="${UI.esc(c.telefone)}"></div>
          <div class="campo c2"><label for="cf-end">Endereço</label><input id="cf-end" name="endereco" maxlength="150" value="${UI.esc(c.endereco)}"></div>
          <div class="campo c2"><label for="cf-cid">Cidade / UF</label><input id="cf-cid" name="cidade" maxlength="60" value="${UI.esc(c.cidade)}"></div>
        </div>
        <div class="botoes" style="margin-top:16px"><button class="btn btn-primario">Salvar dados</button></div>
      </form>

      <div class="painel">
        <h2>Segurança</h2>
        <p><span class="selo ${Cofre.cifrado ? 'ok' : ''}">${Cofre.cifrado ? 'Protegido com senha' : 'Sem senha'}</span></p>
        <p class="muted">Os dados estão guardados ${onde}.
          ${Cofre.cifrado
            ? 'Eles ficam criptografados com a sua senha: sem ela ninguém consegue ler as fichas, nem quem tiver acesso ao aparelho ou ao arquivo de backup.'
            : 'Recomendado: crie uma senha. Assim as fichas (com CPF, RG e endereço dos alunos) ficam criptografadas e o sistema pede a senha para abrir.'}</p>
        ${Cofre.cifrado ? `
          <div class="grade">
            <div class="campo c2"><label for="cf-bloq">Bloquear sozinho depois de</label>
              <select id="cf-bloq">${tempos.map(([v, t]) => `<option value="${v}"${c.bloqueioMin === v ? ' selected' : ''}>${t} sem uso</option>`).join('')}</select></div>
          </div>
          <div class="botoes" style="margin-top:14px">
            <button class="btn" id="cf-bloquear">Bloquear agora</button>
            <button class="btn" id="cf-trocar">Trocar senha</button>
            <button class="btn btn-perigo" id="cf-remover">Remover senha</button>
          </div>`
          : `<div class="botoes"><button class="btn btn-primario" id="cf-criar">Criar senha</button></div>`}
      </div>

      <div class="painel">
        <h2>Cópia de segurança</h2>
        <p class="muted">Baixe uma cópia de vez em quando e guarde em outro lugar (pen drive, Google Drive, e-mail).
          ${Cofre.cifrado ? 'A cópia sai criptografada com a mesma senha.' : 'Sem senha, a cópia sai legível: guarde-a em local seguro.'}
          ${c.ultimoBackup ? `Última cópia: ${Hoje.br(c.ultimoBackup)}.` : 'Nenhuma cópia feita ainda.'}</p>
        <div class="botoes">
          <button class="btn btn-primario" id="baixar">Baixar cópia de segurança</button>
          <label class="btn" for="restaurar">Restaurar cópia</label>
          <input type="file" id="restaurar" accept=".json,application/json" hidden>
        </div>
      </div>

      <div class="painel">
        <h2>Outros</h2>
        <div class="botoes">
          <button class="btn" id="exemplo">Carregar dados de exemplo</button>
          <button class="btn btn-perigo" id="apagar">Apagar tudo</button>
        </div>
      </div>
    `);

    document.getElementById('form-config').onsubmit = e => {
      e.preventDefault();
      Dados.salvarConfig(UI.lerForm(e.target));
      document.getElementById('nome-cfc').textContent = Dados.estado.config.nomeCfc;
      UI.aviso('Dados salvos');
    };

    if (Cofre.cifrado) {
      document.getElementById('cf-bloq').onchange = e => {
        Dados.salvarConfig({ bloqueioMin: Number(e.target.value) });
        UI.aviso('Tempo de bloqueio salvo');
      };
      document.getElementById('cf-bloquear').onclick = () => Seguranca.bloquear('Sistema bloqueado.');
      document.getElementById('cf-trocar').onclick = () => this.modalSenha(true);
      document.getElementById('cf-remover').onclick = () => this.modalRemoverSenha();
    } else {
      document.getElementById('cf-criar').onclick = () => this.modalSenha(false);
    }

    document.getElementById('baixar').onclick = () => this.baixarBackup();
    document.getElementById('restaurar').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) this.restaurar(f); };

    document.getElementById('exemplo').onclick = async () => {
      if (Dados.estado.alunos.length && !await UI.confirmar('Adicionar exemplos?', 'Já existem fichas. Os 5 alunos de exemplo serão adicionados junto com elas.', { botao: 'Adicionar' })) return;
      this.exemplos();
      UI.aviso('Exemplos adicionados');
      Telas.ir('inicio');
    };

    document.getElementById('apagar').onclick = () => this.modalApagarTudo();
  },

  // ----- Senha -----
  modalSenha(trocar) {
    UI.abrirModal(`
      <h2>${trocar ? 'Trocar senha' : 'Criar senha'}</h2>
      <p class="muted">Guarde a senha em lugar seguro. <strong>Se esquecer, os dados não podem ser recuperados</strong> — nem por nós.
        Por isso, baixe uma cópia de segurança e anote a senha.</p>
      <form id="form-senha-nova" autocomplete="off" novalidate>
        <div class="grade">
          ${trocar ? '<div class="campo c2"><label for="sn-atual">Senha atual</label><input type="password" id="sn-atual" autocomplete="current-password" maxlength="200"></div>' : ''}
          <div class="campo c2"><label for="sn-nova">Nova senha (mínimo 8 caracteres)</label><input type="password" id="sn-nova" autocomplete="new-password" maxlength="200"></div>
          <div class="campo c2"><label for="sn-conf">Repita a nova senha</label><input type="password" id="sn-conf" autocomplete="new-password" maxlength="200"></div>
        </div>
        <p class="erro-texto" id="sn-erro" role="alert"></p>
        <div class="botoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="sn-ok">${trocar ? 'Trocar senha' : 'Criar senha'}</button></div>
      </form>`);
    document.getElementById('form-senha-nova').onsubmit = async e => {
      e.preventDefault();
      const erro = document.getElementById('sn-erro');
      const nova = document.getElementById('sn-nova').value;
      const problema = Seguranca.problemaSenha(nova, document.getElementById('sn-conf').value);
      if (problema) { erro.textContent = problema; return; }
      const botao = document.getElementById('sn-ok');
      botao.disabled = true; botao.textContent = 'Criptografando…';
      try {
        if (trocar && !await Cofre.conferirSenha(document.getElementById('sn-atual').value)) {
          erro.textContent = 'A senha atual está incorreta.';
          return;
        }
        await Cofre.definirSenha(nova);
        UI.fecharModal();
        UI.aviso(trocar ? 'Senha trocada' : 'Senha criada. Os dados agora estão criptografados.');
        Telas.recarregar();
      } catch (err) {
        erro.textContent = 'Não foi possível criptografar neste navegador.';
      } finally {
        if (document.getElementById('sn-ok')) { botao.disabled = false; botao.textContent = trocar ? 'Trocar senha' : 'Criar senha'; }
      }
    };
  },

  modalRemoverSenha() {
    UI.abrirModal(`
      <h2>Remover senha</h2>
      <p class="muted">Os dados deixam de ser criptografados e o sistema abre sem pedir senha.</p>
      <form id="form-remover" autocomplete="off" novalidate>
        <div class="campo"><label for="rm-senha">Digite a senha atual para confirmar</label><input type="password" id="rm-senha" maxlength="200"></div>
        <p class="erro-texto" id="rm-erro" role="alert"></p>
        <div class="botoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-perigo-cheio">Remover senha</button></div>
      </form>`);
    document.getElementById('form-remover').onsubmit = async e => {
      e.preventDefault();
      if (!await Cofre.conferirSenha(document.getElementById('rm-senha').value)) {
        document.getElementById('rm-erro').textContent = 'Senha incorreta.';
        return;
      }
      await Cofre.removerSenha();
      UI.fecharModal();
      UI.aviso('Senha removida');
      Telas.recarregar();
    };
  },

  // ----- Backup -----
  async baixarBackup() {
    await Cofre.salvarAgora();
    const env = await Cofre.fechar(Dados.estado);
    env.exportadoEm = new Date().toISOString();
    const ok = await UI.baixar(`island27-cfc-backup-${Hoje.iso()}.json`, JSON.stringify(env));
    if (ok) {
      Dados.salvarConfig({ ultimoBackup: Hoje.iso() });
      UI.aviso('Cópia de segurança baixada');
      Telas.recarregar();
    }
  },

  async restaurar(arquivo) {
    if (arquivo.size > TAMANHO_MAX_BACKUP) { UI.aviso('Arquivo grande demais para ser uma cópia deste sistema.', true); return; }
    let env;
    try {
      env = JSON.parse(await arquivo.text());
      if (!env || typeof env !== 'object' || Array.isArray(env)) throw new Error();
      if (env.app && env.app !== APP_ID) throw new Error();
    } catch (e) {
      UI.aviso('Este arquivo não é uma cópia de segurança válida.', true);
      return;
    }
    let novo;
    if (env.cifrado) {
      novo = await this.pedirSenhaBackup(env);
      if (!novo) return;
    } else {
      novo = Saneamento.estado(env.dados || env);
    }
    const ok = await UI.confirmar('Restaurar cópia?',
      `A cópia tem ${novo.alunos.length} ficha(s) e ${novo.parcelas.length} parcela(s). Ela vai SUBSTITUIR todos os dados atuais (${Dados.estado.alunos.length} ficha(s)).`,
      { botao: 'Substituir dados', perigo: true });
    if (!ok) return;
    Dados.substituirPor(novo);
    await Cofre.salvarAgora();
    UI.aviso('Cópia restaurada');
    Telas.ir('inicio');
  },

  /* Abre um backup criptografado sem trocar a senha atual do sistema. */
  pedirSenhaBackup(env) {
    return new Promise(resolve => {
      UI.abrirModal(`
        <h2>Cópia protegida</h2>
        <p class="muted">Digite a senha que estava em uso quando esta cópia foi feita.</p>
        <form id="form-bk" autocomplete="off" novalidate>
          <div class="campo"><label for="bk-senha">Senha da cópia</label><input type="password" id="bk-senha" maxlength="200"></div>
          <p class="erro-texto" id="bk-erro" role="alert"></p>
          <div class="botoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-primario" id="bk-ok">Abrir cópia</button></div>
        </form>`);
      let feito = false;
      UI._aoFechar = () => { if (!feito) resolve(null); };
      document.getElementById('form-bk').onsubmit = async e => {
        e.preventDefault();
        const botao = document.getElementById('bk-ok');
        botao.disabled = true;
        try {
          const iter = Saneamento.inteiro(env.kdf && env.kdf.iter, 100000, 5000000, ITERACOES);
          const chave = await Cripto.derivar(document.getElementById('bk-senha').value, Cripto.deB64(env.kdf.sal), iter);
          const estado = Saneamento.estado(JSON.parse(await Cripto.decifrar(chave, env.iv, env.dados)));
          feito = true;
          UI.fecharModal();
          resolve(estado);
        } catch (err) {
          document.getElementById('bk-erro').textContent = 'Senha incorreta ou arquivo danificado.';
          botao.disabled = false;
        }
      };
    });
  },

  modalApagarTudo() {
    UI.abrirModal(`
      <h2>Apagar tudo</h2>
      <p class="muted">Todas as ${Dados.estado.alunos.length} ficha(s) e pagamentos serão apagados${Cofre.modo === 'nuvem' ? ', também no celular/PC sincronizado' : ''}. Isso não pode ser desfeito.</p>
      <form id="form-apagar" autocomplete="off" novalidate>
        <div class="campo"><label for="ap-texto">Para confirmar, digite APAGAR</label><input id="ap-texto" maxlength="20"></div>
        <div class="botoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-perigo-cheio">Apagar tudo</button></div>
      </form>`);
    document.getElementById('form-apagar').onsubmit = e => {
      e.preventDefault();
      if (document.getElementById('ap-texto').value.trim().toUpperCase() !== 'APAGAR') { UI.aviso('Digite APAGAR para confirmar.', true); return; }
      Dados.apagarTudo();
      UI.fecharModal();
      UI.aviso('Dados apagados');
      Telas.ir('inicio');
    };
  },

  /* Alguns alunos fictícios para testar o sistema. */
  exemplos() {
    const hoje = Hoje.iso();
    const ex = [
      ['Ana Souza (exemplo)', '(11) 98888-1111', 'B', 'Primeira habilitação', 2400, 400, 5, -95],
      ['Bruno Lima (exemplo)', '(11) 97777-2222', 'AB', 'Primeira habilitação', 3200, 600, 6, -40],
      ['Carla Mendes (exemplo)', '(11) 96666-3333', 'A', 'Adição de categoria', 1300, 300, 3, -10],
      ['Diego Rocha (exemplo)', '(11) 95555-4444', 'B', 'Reciclagem', 650, 0, 2, 0],
      ['Eduarda Alves (exemplo)', '(11) 94444-5555', 'D', 'Mudança de categoria', 2900, 500, 4, -65]
    ];
    ex.forEach(([nome, telefone, categoria, servico, total, entrada, parcelas, dias]) => {
      const inicio = Hoje.somarDias(hoje, dias);
      const ficha = Dados.criarFicha(
        { nome, telefone, categoria, servico, matricula: inicio, status: 'Em andamento', obs: 'Aluno fictício para teste. Pode apagar.' },
        { total, desconto: 0, entrada, entradaPaga: true, formaEntrada: 'PIX', parcelas, primeiroVencimento: Hoje.somarMeses(inicio, 1) }
      );
      // Paga as parcelas que venceram há mais de 10 dias, deixando algumas atrasadas.
      Dados.parcelasDoAluno(ficha.id).forEach((p, i) => {
        if (!p.pagoEm && Hoje.diasEntre(p.vencimento, hoje) > 10 && i % 3 !== 2) {
          Dados.receber(p.id, p.valor, p.vencimento, FORMAS[i % FORMAS.length], '');
        }
      });
    });
  }
};
