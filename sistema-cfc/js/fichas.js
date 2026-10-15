/* fichas.js — lançamento e consulta das fichas dos alunos. */

const STATUS = ['Em andamento', 'Concluído', 'Cancelado'];

const Fichas = {
  filtro: { busca: '', status: '' },

  // ---------- Lista de fichas ----------
  lista() {
    UI.tela(`
      <div class="topo">
        <div><h1>Fichas</h1><p>Todos os alunos cadastrados.</p></div>
        <a class="btn btn-primario" href="#nova-ficha">＋ Lançar ficha</a>
      </div>
      <div class="painel">
        <div class="filtros">
          <div class="campo busca"><label>Buscar</label><input id="f-busca" placeholder="Nome, CPF, telefone ou nº da ficha" value="${UI.esc(this.filtro.busca)}"></div>
          <div class="campo"><label>Situação</label>
            <select id="f-status"><option value="">Todas</option>${UI.opcoes(STATUS, this.filtro.status)}</select>
          </div>
        </div>
        <div class="tabela-rolagem"><table>
          <thead><tr><th>Nº</th><th>Aluno</th><th>Serviço</th><th>Situação</th><th class="num">Contrato</th><th class="num">Pago</th><th class="num">Em aberto</th></tr></thead>
          <tbody id="corpo-fichas"></tbody>
        </table></div>
      </div>
    `);
    const busca = document.getElementById('f-busca');
    const status = document.getElementById('f-status');
    busca.oninput = () => { this.filtro.busca = busca.value; this.preencherLista(); };
    status.onchange = () => { this.filtro.status = status.value; this.preencherLista(); };
    this.preencherLista();
    busca.focus();
  },

  preencherLista() {
    const termo = this.filtro.busca.toLowerCase().trim();
    const soNumeros = termo.replace(/\D/g, '');
    const alunos = Dados.estado.alunos
      .filter(a => !this.filtro.status || a.status === this.filtro.status)
      .filter(a => !termo
        || a.nome.toLowerCase().includes(termo)
        || String(a.numero) === termo
        || (soNumeros && ((a.cpf || '').replace(/\D/g, '').includes(soNumeros) || (a.telefone || '').replace(/\D/g, '').includes(soNumeros))))
      .sort((a, b) => b.numero - a.numero);

    const corpo = document.getElementById('corpo-fichas');
    if (!alunos.length) {
      corpo.innerHTML = `<tr><td colspan="7" class="vazio">${Dados.estado.alunos.length ? 'Nenhuma ficha encontrada.' : 'Nenhuma ficha lançada ainda. Clique em “Lançar ficha” para começar.'}</td></tr>`;
      return;
    }
    corpo.innerHTML = alunos.map(a => {
      const r = Dados.resumoAluno(a.id);
      return `<tr class="linha-link" data-id="${a.id}">
        <td>${a.numero}</td>
        <td><strong>${UI.esc(a.nome)}</strong><br><small class="muted">${UI.esc(a.telefone)}</small></td>
        <td>${UI.esc(a.servico)} <span class="tag neutro">${UI.esc(a.categoria)}</span></td>
        <td>${UI.esc(a.status)}${r.atrasadas ? ` <span class="tag atrasado">${r.atrasadas} atrasada(s)</span>` : ''}</td>
        <td class="num">${Dinheiro.br(r.total)}</td>
        <td class="num">${Dinheiro.br(r.pago)}</td>
        <td class="num">${Dinheiro.br(r.aberto)}</td>
      </tr>`;
    }).join('');
    corpo.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.onclick = () => { location.hash = '#ficha/' + tr.dataset.id; };
    });
  },

  // ---------- Lançar / editar ficha ----------
  formulario(id) {
    const a = id ? Dados.aluno(id) : null;
    if (id && !a) { location.hash = '#fichas'; return; }
    const v = a || { categoria: 'B', servico: SERVICOS[0], status: STATUS[0], matricula: Hoje.iso() };
    const campo = (nome, rotulo, extra = '', classe = '') =>
      `<div class="campo ${classe}"><label>${rotulo}</label><input name="${nome}" value="${UI.esc(v[nome])}" ${extra}></div>`;

    UI.tela(`
      <div class="topo">
        <div><h1>${a ? `Editar ficha nº ${a.numero}` : 'Lançar ficha'}</h1>
          <p>${a ? 'Alterar os dados do aluno. Os valores e parcelas são ajustados na própria ficha.' : 'Preencha os dados do aluno e o contrato. As parcelas são criadas automaticamente.'}</p></div>
      </div>
      <form id="form-ficha">
        <div class="painel">
          <h2>Dados do aluno</h2>
          <div class="grade">
            ${campo('nome', 'Nome completo *', 'required', 'c2')}
            ${campo('cpf', 'CPF', 'inputmode="numeric" placeholder="000.000.000-00"')}
            ${campo('rg', 'RG')}
            ${campo('nascimento', 'Data de nascimento', 'type="date"')}
            ${campo('telefone', 'Telefone / WhatsApp', 'inputmode="tel" placeholder="(00) 00000-0000"')}
            ${campo('email', 'E-mail', 'type="email"', 'c2')}
            ${campo('endereco', 'Endereço', '', 'c4')}
          </div>
        </div>

        <div class="painel">
          <h2>Processo</h2>
          <div class="grade">
            <div class="campo c2"><label>Serviço</label><select name="servico">${UI.opcoes(SERVICOS, v.servico)}</select></div>
            <div class="campo"><label>Categoria</label><select name="categoria">${UI.opcoes(CATEGORIAS, v.categoria)}</select></div>
            ${campo('renach', 'Nº RENACH / processo')}
            ${campo('matricula', 'Data da matrícula', 'type="date"')}
            <div class="campo"><label>Situação</label><select name="status">${UI.opcoes(STATUS, v.status)}</select></div>
            <div class="campo c4"><label>Observações</label><textarea name="obs">${UI.esc(v.obs)}</textarea></div>
          </div>
        </div>

        ${a ? '' : `
        <div class="painel">
          <h2>Valores e parcelas</h2>
          <div class="grade">
            <div class="campo"><label>Valor total (R$) *</label><input id="p-total" inputmode="decimal" placeholder="0,00" required></div>
            <div class="campo"><label>Desconto (R$)</label><input id="p-desconto" inputmode="decimal" placeholder="0,00"></div>
            <div class="campo"><label>Entrada (R$)</label><input id="p-entrada" inputmode="decimal" placeholder="0,00"></div>
            <div class="campo"><label>Forma da entrada</label><select id="p-forma">${UI.opcoes(FORMAS, 'PIX')}</select></div>
            <div class="campo"><label>Nº de parcelas</label><input id="p-parcelas" type="number" min="1" max="48" value="1"></div>
            <div class="campo"><label>1º vencimento</label><input id="p-venc" type="date" value="${Hoje.somarMeses(Hoje.iso(), 1)}"></div>
            <div class="campo c2" style="justify-content:flex-end"><label style="display:flex;gap:8px;align-items:center;font-size:15px">
              <input type="checkbox" id="p-entrada-paga" checked style="width:auto"> Entrada já foi paga hoje</label></div>
          </div>
          <div class="resumo-valores" id="previa"></div>
        </div>`}

        <div class="botoes">
          <button class="btn btn-primario">${a ? 'Salvar alterações' : 'Salvar ficha'}</button>
          <a class="btn" href="${a ? '#ficha/' + a.id : '#fichas'}">Cancelar</a>
        </div>
      </form>
    `);

    const form = document.getElementById('form-ficha');
    const plano = () => ({
      total: Dinheiro.ler(document.getElementById('p-total').value),
      desconto: Dinheiro.ler(document.getElementById('p-desconto').value),
      entrada: Dinheiro.ler(document.getElementById('p-entrada').value),
      formaEntrada: document.getElementById('p-forma').value,
      entradaPaga: document.getElementById('p-entrada-paga').checked,
      parcelas: parseInt(document.getElementById('p-parcelas').value, 10) || 1,
      primeiroVencimento: document.getElementById('p-venc').value || Hoje.iso()
    });

    if (!a) {
      const previa = () => {
        const p = plano();
        const restante = p.total - p.desconto - p.entrada;
        document.getElementById('previa').innerHTML = `
          <div><span>Valor final</span><strong>${Dinheiro.br(p.total - p.desconto)}</strong></div>
          <div><span>Entrada</span><strong>${Dinheiro.br(p.entrada)}</strong></div>
          <div><span>Parcelas</span><strong>${restante > 0 ? `${p.parcelas}× ${Dinheiro.br(restante / p.parcelas)}` : '—'}</strong></div>
          <div><span>Vencimentos</span><strong>${restante > 0 ? `todo dia ${Number(p.primeiroVencimento.slice(8))}` : '—'}</strong></div>`;
      };
      form.querySelectorAll('#p-total,#p-desconto,#p-entrada,#p-parcelas,#p-venc').forEach(el => { el.oninput = previa; });
      previa();
    }

    form.onsubmit = e => {
      e.preventDefault();
      const dados = UI.lerForm(form);
      if (!dados.nome) { UI.aviso('Informe o nome do aluno', true); return; }

      if (a) {
        Dados.atualizarFicha(a.id, dados);
        UI.aviso('Ficha atualizada');
        location.hash = '#ficha/' + a.id;
        return;
      }

      const p = plano();
      if (p.total <= 0) { UI.aviso('Informe o valor total', true); return; }
      if (p.desconto + p.entrada > p.total) { UI.aviso('Desconto + entrada maior que o valor total', true); return; }
      const ficha = Dados.criarFicha(dados, p);
      UI.aviso(`Ficha nº ${ficha.numero} lançada`);
      location.hash = '#ficha/' + ficha.id;
    };
  },

  // ---------- Ficha do aluno ----------
  detalhe(id) {
    const a = Dados.aluno(id);
    if (!a) { location.hash = '#fichas'; return; }
    const r = Dados.resumoAluno(id);
    const ps = Dados.parcelasDoAluno(id);
    const pct = r.total ? Math.min(100, Math.round(r.pago / r.total * 100)) : 0;
    const info = (rotulo, valor) => valor ? `<div><span>${rotulo}</span>${UI.esc(valor)}</div>` : '';

    UI.tela(`
      <div class="topo">
        <div><h1>${UI.esc(a.nome)}</h1><p>Ficha nº ${a.numero} · ${UI.esc(a.servico)} · Categoria ${UI.esc(a.categoria)} · ${UI.esc(a.status)}</p></div>
        <div class="botoes">
          <button class="btn" id="imprimir-ficha">Imprimir ficha</button>
          <a class="btn" href="#editar-ficha/${a.id}">Editar</a>
          <button class="btn btn-perigo" id="excluir-ficha">Excluir</button>
        </div>
      </div>

      <div class="cartoes">
        <div class="cartao"><span>Valor do contrato</span><strong>${Dinheiro.br(r.total)}</strong></div>
        <div class="cartao ok"><span>Pago</span><strong>${Dinheiro.br(r.pago)}</strong></div>
        <div class="cartao ${r.atrasadas ? 'atraso' : 'destaque'}"><span>Em aberto</span><strong>${Dinheiro.br(r.aberto)}</strong>
          <small>${r.atrasadas ? `${r.atrasadas} parcela(s) atrasada(s)` : 'Nenhuma atrasada'}</small></div>
      </div>

      <div class="painel">
        <div class="topo" style="margin-bottom:10px"><h2>Parcelas e pagamentos</h2>
          <button class="btn btn-pequeno" id="nova-cobranca">＋ Nova cobrança</button></div>
        <div class="tabela-rolagem"><table>
          <thead><tr><th>Descrição</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th><th>Pago em</th><th></th></tr></thead>
          <tbody>${ps.length ? ps.map(p => `
            <tr>
              <td>${UI.esc(p.descricao)}</td>
              <td>${Hoje.br(p.vencimento)}</td>
              <td class="num">${Dinheiro.br(p.pagoEm ? p.valorPago : p.valor)}</td>
              <td>${UI.tag(p)}</td>
              <td>${p.pagoEm ? `${Hoje.br(p.pagoEm)} <small class="muted">${UI.esc(p.forma)}</small>` : ''}</td>
              <td class="acoes">${p.pagoEm
                ? `<button class="btn btn-pequeno" data-recibo="${p.id}">Recibo</button><button class="btn btn-pequeno" data-estornar="${p.id}">Estornar</button>`
                : `<button class="btn btn-pequeno btn-ok" data-receber="${p.id}">Receber</button><button class="btn btn-pequeno btn-perigo" data-excluir="${p.id}" title="Excluir cobrança">✕</button>`}
              </td>
            </tr>`).join('') : '<tr><td colspan="6" class="vazio">Nenhuma cobrança.</td></tr>'}
          </tbody>
        </table></div>
        <div class="progresso" title="${pct}% pago"><div style="width:${pct}%"></div></div>
        <small class="muted">${pct}% do contrato pago</small>
      </div>

      <div class="painel">
        <h2>Dados do aluno</h2>
        <div class="dados-ficha">
          ${info('CPF', a.cpf)}${info('RG', a.rg)}${info('Nascimento', Hoje.br(a.nascimento))}
          ${info('Telefone', a.telefone)}${info('E-mail', a.email)}${info('RENACH', a.renach)}
          ${info('Matrícula', Hoje.br(a.matricula))}${info('Endereço', a.endereco)}
        </div>
        ${a.obs ? `<p style="margin-top:14px"><span class="muted">Observações:</span><br>${UI.esc(a.obs).replace(/\n/g, '<br>')}</p>` : ''}
      </div>
    `);

    const tela = document.getElementById('tela');
    tela.querySelectorAll('[data-receber]').forEach(b => { b.onclick = () => Pagamentos.modalReceber(b.dataset.receber); });
    tela.querySelectorAll('[data-recibo]').forEach(b => { b.onclick = () => Pagamentos.recibo(b.dataset.recibo); });
    tela.querySelectorAll('[data-estornar]').forEach(b => { b.onclick = () => Pagamentos.estornar(b.dataset.estornar); });
    tela.querySelectorAll('[data-excluir]').forEach(b => {
      b.onclick = () => {
        if (!confirm('Excluir esta cobrança?')) return;
        Dados.excluirParcela(b.dataset.excluir);
        atualizarTela();
      };
    });
    document.getElementById('nova-cobranca').onclick = () => this.modalCobranca(a.id);
    document.getElementById('imprimir-ficha').onclick = () => this.imprimir(a.id);
    document.getElementById('excluir-ficha').onclick = () => {
      if (!confirm(`Excluir a ficha de ${a.nome} e todos os pagamentos dela?`)) return;
      Dados.excluirFicha(a.id);
      UI.aviso('Ficha excluída');
      location.hash = '#fichas';
    };
  },

  /* Cobrança extra: taxa do DETRAN, aula extra, exame, etc. */
  modalCobranca(alunoId) {
    UI.abrirModal(`
      <h2>Nova cobrança</h2>
      <p class="muted">Ex.: aula extra, taxa de reteste, exame médico.</p>
      <form id="form-cobranca">
        <div class="grade">
          <div class="campo c2"><label>Descrição</label><input name="descricao" required placeholder="Aula extra"></div>
          <div class="campo"><label>Valor (R$)</label><input name="valor" inputmode="decimal" required placeholder="0,00"></div>
          <div class="campo"><label>Vencimento</label><input name="vencimento" type="date" value="${Hoje.iso()}" required></div>
        </div>
        <div class="botoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-primario">Adicionar</button></div>
      </form>
    `);
    document.getElementById('form-cobranca').onsubmit = e => {
      e.preventDefault();
      const d = UI.lerForm(e.target);
      const valor = Dinheiro.ler(d.valor);
      if (valor <= 0) { UI.aviso('Informe o valor', true); return; }
      Dados.novaCobranca(alunoId, d.descricao, valor, d.vencimento);
      UI.fecharModal();
      UI.aviso('Cobrança adicionada');
      atualizarTela();
    };
  },

  imprimir(id) {
    const a = Dados.aluno(id);
    const c = Dados.estado.config;
    const r = Dados.resumoAluno(id);
    const linha = (rotulo, valor) => `<tr><th style="width:30%">${rotulo}</th><td>${UI.esc(valor)}</td></tr>`;
    UI.imprimir(`
      <h1>${UI.esc(c.nomeCfc)} — Ficha do aluno nº ${a.numero}</h1>
      <p>${UI.esc([c.cnpj && 'CNPJ ' + c.cnpj, c.endereco, c.cidade, c.telefone].filter(Boolean).join(' · '))}</p>
      <table>
        ${linha('Nome', a.nome)}${linha('CPF', a.cpf)}${linha('RG', a.rg)}${linha('Nascimento', Hoje.br(a.nascimento))}
        ${linha('Telefone', a.telefone)}${linha('E-mail', a.email)}${linha('Endereço', a.endereco)}
        ${linha('Serviço', a.servico)}${linha('Categoria', a.categoria)}${linha('RENACH', a.renach)}
        ${linha('Matrícula', Hoje.br(a.matricula))}${linha('Situação', a.status)}${linha('Observações', a.obs)}
      </table>
      <h2 style="font-size:16px;margin-top:18px">Parcelas</h2>
      <table>
        <tr><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Pago em</th><th>Forma</th></tr>
        ${Dados.parcelasDoAluno(id).map(p => `<tr><td>${UI.esc(p.descricao)}</td><td>${Hoje.br(p.vencimento)}</td>
          <td>${Dinheiro.br(p.pagoEm ? p.valorPago : p.valor)}</td><td>${Hoje.br(p.pagoEm) || 'Pendente'}</td><td>${UI.esc(p.forma || '')}</td></tr>`).join('')}
        <tr><th colspan="2">Total / Pago / Em aberto</th><td colspan="3">${Dinheiro.br(r.total)} / ${Dinheiro.br(r.pago)} / ${Dinheiro.br(r.aberto)}</td></tr>
      </table>
      <div class="assinatura">Assinatura do aluno</div>
    `);
  }
};
