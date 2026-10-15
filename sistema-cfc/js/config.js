/* config.js — dados da autoescola e cópia de segurança. */

const Config = {
  mostrar() {
    const c = Dados.estado.config;
    UI.tela(`
      <div class="topo"><div><h1>Configurações</h1><p>Dados que aparecem nos recibos e na ficha impressa.</p></div></div>

      <form class="painel" id="form-config">
        <h2>Dados da autoescola</h2>
        <div class="grade">
          <div class="campo c2"><label>Nome do CFC</label><input name="nomeCfc" value="${UI.esc(c.nomeCfc)}"></div>
          <div class="campo"><label>CNPJ</label><input name="cnpj" value="${UI.esc(c.cnpj)}"></div>
          <div class="campo"><label>Telefone</label><input name="telefone" value="${UI.esc(c.telefone)}"></div>
          <div class="campo c2"><label>Endereço</label><input name="endereco" value="${UI.esc(c.endereco)}"></div>
          <div class="campo c2"><label>Cidade / UF</label><input name="cidade" value="${UI.esc(c.cidade)}"></div>
        </div>
        <div class="botoes" style="margin-top:16px"><button class="btn btn-primario">Salvar</button></div>
      </form>

      <div class="painel">
        <h2>Cópia de segurança</h2>
        <p class="muted">Os dados ficam guardados neste navegador. Baixe uma cópia de vez em quando
          e use "Restaurar" para levar tudo para outro computador.</p>
        <div class="botoes">
          <button class="btn btn-primario" id="baixar">Baixar cópia de segurança</button>
          <label class="btn">Restaurar cópia<input type="file" id="restaurar" accept=".json" hidden></label>
          <button class="btn" id="exemplo">Carregar dados de exemplo</button>
          <button class="btn btn-perigo" id="apagar">Apagar tudo</button>
        </div>
      </div>
    `);

    document.getElementById('form-config').onsubmit = e => {
      e.preventDefault();
      Object.assign(Dados.estado.config, UI.lerForm(e.target));
      Dados.salvar();
      document.getElementById('nome-cfc').textContent = Dados.estado.config.nomeCfc || 'Gestão do CFC';
      UI.aviso('Configurações salvas');
    };

    document.getElementById('baixar').onclick = () => {
      const blob = new Blob([JSON.stringify(Dados.estado, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `island27-cfc-backup-${Hoje.iso()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    };

    document.getElementById('restaurar').onchange = e => {
      const arquivo = e.target.files[0];
      if (!arquivo) return;
      arquivo.text().then(texto => {
        const dados = JSON.parse(texto);
        if (!Array.isArray(dados.alunos) || !Array.isArray(dados.parcelas)) throw new Error();
        if (!confirm('Substituir os dados atuais pelos da cópia?')) return;
        localStorage.setItem(CHAVE, JSON.stringify(dados));
        Dados.carregar();
        UI.aviso('Cópia restaurada');
        location.hash = '#inicio';
        atualizarTela();
      }).catch(() => UI.aviso('Arquivo inválido', true));
    };

    document.getElementById('exemplo').onclick = () => {
      if (Dados.estado.alunos.length && !confirm('Já existem fichas. Adicionar os exemplos mesmo assim?')) return;
      Config.exemplos();
      UI.aviso('Exemplos adicionados');
      location.hash = '#inicio';
    };

    document.getElementById('apagar').onclick = () => {
      if (!confirm('Apagar TODAS as fichas e pagamentos? Isso não pode ser desfeito.')) return;
      const config = Dados.estado.config;
      Dados.estado = { config, alunos: [], parcelas: [], proximaFicha: 1 };
      Dados.salvar();
      UI.aviso('Dados apagados');
    };
  },

  /* Algumas fichas para testar o sistema. */
  exemplos() {
    const hoje = Hoje.iso();
    const ex = [
      ['Ana Souza', '(11) 98888-1111', 'B', 'Primeira habilitação', 2400, 400, 5, -95],
      ['Bruno Lima', '(11) 97777-2222', 'AB', 'Primeira habilitação', 3200, 600, 6, -40],
      ['Carla Mendes', '(11) 96666-3333', 'A', 'Adição de categoria', 1300, 300, 3, -10],
      ['Diego Rocha', '(11) 95555-4444', 'B', 'Reciclagem', 650, 0, 2, 0],
      ['Eduarda Alves', '(11) 94444-5555', 'D', 'Mudança de categoria', 2900, 500, 4, -65]
    ];
    ex.forEach(([nome, telefone, categoria, servico, total, entrada, parcelas, dias]) => {
      const inicio = Hoje.somarDias(hoje, dias);
      const ficha = Dados.criarFicha(
        { nome, cpf: '', rg: '', nascimento: '', telefone, email: '', endereco: '', renach: '', categoria, servico, matricula: inicio, status: 'Em andamento', obs: '' },
        { total, desconto: 0, entrada, entradaPaga: true, formaEntrada: 'PIX', parcelas, primeiroVencimento: Hoje.somarMeses(inicio, 1) }
      );
      // Paga automaticamente as parcelas que venceram há mais de 10 dias,
      // deixando algumas atrasadas para o exemplo ficar realista.
      Dados.parcelasDoAluno(ficha.id).forEach((p, i) => {
        if (!p.pagoEm && Hoje.diasEntre(p.vencimento, hoje) > 10 && i % 3 !== 2) {
          Dados.receber(p.id, p.valor, p.vencimento, FORMAS[i % FORMAS.length], '');
        }
      });
    });
  }
};
