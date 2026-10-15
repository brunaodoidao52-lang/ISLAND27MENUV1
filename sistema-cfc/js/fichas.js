/* fichas.js — lançamento e consulta das fichas dos alunos. */

const Fichas = {
  filtro: { busca: '', status: '' },

  // ---------- Lista de fichas ----------
  lista() {
    UI.tela(`
      <div class="topo">
        <div><h1>Fichas</h1><p>Todos os alunos cadastrados.</p></div>
        <div class="botoes"><a class="btn btn-primario" href="#nova-ficha">＋ Lançar ficha</a></div>
      </div>
      <div class="painel">
        <div class="filtros">
          <div class="campo busca"><label for="f-busca">Buscar</label><input id="f-busca" type="search" maxlength="100" placeholder="Nome, CPF, telefone ou nº da ficha" value="${UI.esc(this.filtro.busca)}"></div>
          <div class="campo"><label for="f-status">Situação</label>
            <select id="f-status"><option value="">Todas</option>${UI.opcoes(STATUS, this.filtro.status)}</select>
          </div>
        </div>
        <div class="tabela-rolagem"><table class="tabela-cartoes">
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
  },

  preencherLista() {
    const termo = this.filtro.busca.toLowerCase().trim();
    const soNumeros = termo.replace(/\D/g, '');
    const alunos = Dados.estado.alunos
      .filter(a => !this.filtro.status || a.status === this.filtro.status)
      .filter(a => !termo
        || a.nome.toLowerCase().includes(termo)
        || String(a.numero) === termo
        || (soNumeros.length >= 3 && (a.cpf.replace(/\D/g, '').includes(soNumeros) || a.telefone.replace(/\D/g, '').includes(soNumeros))))
      .sort((a, b) => b.numero - a.numero);

    const corpo = document.getElementById('corpo-fichas');
    if (!alunos.length) {
      corpo.innerHTML = `<tr><td colspan="7" class="vazio">${Dados.estado.alunos.length ? 'Nenhuma ficha encontrada.' : 'Nenhuma ficha lançada ainda. Toque em “Lançar ficha” para começar.'}</td></tr>`;
      return;
    }
    corpo.innerHTML = alunos.map(a => {
      const r = Dados.resumoAluno(a.id);
      return `<tr class="linha-link" data-id="${UI.esc(a.id)}" tabindex="0">
        <td data-rotulo="Ficha">${a.numero}</td>
        <td class="principal" data-rotulo="Aluno"><strong>${UI.esc(a.nome)}</strong><br><small class="muted">${UI.esc(a.telefone)}</small></td>
        <td data-rotulo="Serviço">${UI.esc(a.servico)} <span class="tag neutro">${UI.esc(a.categoria)}</span></td>
        <td data-rotulo="Situação">${UI.esc(a.status)}${r.atrasadas ? ` <span class="tag atrasado">${r.atrasadas} atrasada(s)</span>` : ''}</td>
        <td class="num" data-rotulo="Contrato">${Dinheiro.br(r.total)}</td>
        <td class="num" data-rotulo="Pago">${Dinheiro.br(r.pago)}</td>
        <td class="num" data-rotulo="Em aberto">${Dinheiro.br(r.aberto)}</td>
      </tr>`;
    }).join('');
    corpo.querySelectorAll('tr[data-id]').forEach(tr => {
      const abrir = () => Telas.ir('ficha/' + tr.dataset.id);
      tr.onclick = abrir;
      tr.onkeydown = e => { if (e.key === 'Enter') abrir(); };
    });
  },

  // ---------- Lançar / editar ficha ----------
  formulario(id) {
    const a = id ? Dados.aluno(id) : null;
    if (id && !a) { Telas.ir('fichas'); return; }
    const v = a || { categoria: 'B', servico: SERVICOS[0], status: STATUS[0], matricula: Hoje.iso() };
    const campo = (nome, rotulo, extra = '', classe = '', max = 120) =>
      `<div class="campo ${classe}"><label for="c-${nome}">${rotulo}</label><input id="c-${nome}" name="${nome}" maxlength="${max}" value="${UI.esc(v[nome])}" ${extra}></div>`;

    UI.tela(`
      <div class="topo">
        <div><h1>${a ? `Editar ficha nº ${a.numero}` : 'Lançar ficha'}</h1>
          <p>${a ? 'Alterar os dados do aluno. Os valores e parcelas são ajustados na própria ficha.' : 'Preencha os dados do aluno e o contrato. As parcelas são criadas automaticamente.'}</p></div>
      </div>
      <form id="form-ficha" novalidate>
        <div class="painel">
          <h2>Dados do aluno</h2>
          <div class="grade">
            ${campo('nome', 'Nome completo *', 'required autocomplete="off"', 'c2')}
            ${campo('cpf', 'CPF', 'inputmode="numeric" placeholder="000.000.000-00"', '', 14)}
            ${campo('rg', 'RG', '', '', 30)}
            ${campo('nascimento', 'Data de nascimento', 'type="date" min="1900-01-01" max="' + Hoje.iso() + '"')}
            ${campo('telefone', 'Telefone / WhatsApp', 'type="tel" inputmode="tel" placeholder="(00) 00000-0000"', '', 20)}
            ${campo('email', 'E-mail', 'type="email"', 'c2')}
            ${campo('endereco', 'Endereço', '', 'c4', 200)}
          </div>
        </div>

        <div class="painel">
          <h2>Processo</h2>
          <div class="grade">
            <div class="campo c2"><label for="c-servico">Serviço</label><select id="c-servico" name="servico">${UI.opcoes(SERVICOS, v.servico)}</select></div>
            <div class="campo"><label for="c-categoria">Categoria</label><select id="c-categoria" name="categoria">${UI.opcoes(CATEGORIAS, v.categoria)}</select></div>
            ${campo('renach', 'Nº RENACH / processo', '', '', 30)}
            ${campo('matricula', 'Data da matrícula', 'type="date" min="1900-01-01"')}
            <div class="campo"><label for="c-status">Situação</label><select id="c-status" name="status">${UI.opcoes(STATUS, v.status)}</select></div>
            <div class="campo c4"><label for="c-obs">Observações</label><textarea id="c-obs" name="obs" maxlength="2000">${UI.esc(v.obs)}</textarea></div>
          </div>
        </div>

        ${a ? '' : `
        <div class="painel">
          <h2>Valores e parcelas</h2>
          <div class="grade">
            <div class="campo"><label for="p-total">Valor total (R$) *</label><input id="p-total" inputmode="decimal" maxlength="15" placeholder="0,00" required></div>
            <div class="campo"><label for="p-desconto">Desconto (R$)</label><input id="p-desconto" inputmode="decimal" maxlength="15" placeholder="0,00"></div>
            <div class="campo"><label for="p-entrada">Entrada (R$)</label><input id="p-entrada" inputmode="decimal" maxlength="15" placeholder="0,00"></div>
            <div class="campo"><label for="p-forma">Forma da entrada</label><select id="p-forma">${UI.opcoes(FORMAS, 'PIX')}</select></div>
            <div class="campo"><label for="p-parcelas">Nº de parcelas</label><input id="p-parcelas" type="number" inputmode="numeric" min="1" max="${MAX_PARCELAS}" value="1"></div>
            <div class="campo"><label for="p-venc">1º vencimento</label><input id="p-venc" type="date" value="${Hoje.somarMeses(Hoje.iso(), 1)}"></div>
            <div class="campo c2" style="justify-content:flex-end"><label class="marcar"><input type="checkbox" id="p-entrada-paga" checked> Entrada já foi paga (na data da matrícula)</label></div>
          </div>
          <div class="resumo-valores" id="previa"></div>
        </div>`}

        <p class="erro-texto" id="erro-ficha" role="alert"></p>
        <div class="botoes">
          <button class="btn btn-primario">${a ? 'Salvar alterações' : 'Salvar ficha'}</button>
          <a class="btn" href="${a ? '#ficha/' + UI.esc(a.id) : '#fichas'}">Cancelar</a>
        </div>
      </form>
    `);

    const form = document.getElementById('form-ficha');
    const valor = id2 => Dinheiro.ler(document.getElementById(id2).value);
    const plano = () => ({
      total: valor('p-total'),
      desconto: valor('p-desconto'),
      entrada: valor('p-entrada'),
      formaEntrada: document.getElementById('p-forma').value,
      entradaPaga: document.getElementById('p-entrada-paga').checked,
      parcelas: Saneamento.inteiro(document.getElementById('p-parcelas').value, 1, MAX_PARCELAS, 0),
      primeiroVencimento: document.getElementById('p-venc').value
    });

    if (!a) {
      const previa = () => {
        const p = plano();
        const restante = p.total - p.desconto - p.entrada;
        document.getElementById('previa').innerHTML = `
          <div><span>Valor final</span><strong>${Dinheiro.br(p.total - p.desconto)}</strong></div>
          <div><span>Entrada</span><strong>${Dinheiro.br(p.entrada)}</strong></div>
          <div><span>Parcelas</span><strong>${restante > 0 && p.parcelas ? `${p.parcelas}× ${Dinheiro.br(restante / p.parcelas)}` : '—'}</strong></div>
          <div><span>Vencimentos</span><strong>${restante > 0 && Hoje.valida(p.primeiroVencimento) ? `todo dia ${Number(p.primeiroVencimento.slice(8))}` : '—'}</strong></div>`;
      };
      form.querySelectorAll('#p-total,#p-desconto,#p-entrada,#p-parcelas,#p-venc').forEach(el => { el.oninput = previa; });
      previa();
    }

    form.onsubmit = e => {
      e.preventDefault();
      const erro = msg => { document.getElementById('erro-ficha').textContent = msg; UI.aviso(msg, true); };
      const dados = UI.lerForm(form);
      if (!dados.nome) return erro('Informe o nome do aluno.');
      if (dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) return erro('O e-mail parece incorreto.');
      if (dados.cpf && dados.cpf.replace(/\D/g, '').length !== 11) return erro('O CPF deve ter 11 números.');
      if (dados.matricula && !Hoje.valida(dados.matricula)) return erro('Data da matrícula inválida.');

      try {
        if (a) {
          Dados.atualizarFicha(a.id, dados);
          UI.aviso('Ficha atualizada');
          Telas.ir('ficha/' + a.id);
          return;
        }
        const p = plano();
        if (p.total <= 0) return erro('Informe o valor total (ex.: 2.500,00).');
        if (!p.parcelas) return erro(`O número de parcelas deve ser de 1 a ${MAX_PARCELAS}.`);
        if (p.desconto + p.entrada > p.total) return erro('Desconto + entrada é maior que o valor total.');
        if (!Hoje.valida(p.primeiroVencimento)) return erro('Informe a data do 1º vencimento.');
        const ficha = Dados.criarFicha(dados, p);
        UI.aviso(`Ficha nº ${ficha.numero} lançada`);
        Telas.ir('ficha/' + ficha.id);
      } catch (err) {
        erro('Não foi possível salvar a ficha. Confira os campos.');
      }
    };
  },

  // ---------- Ficha do aluno ----------
  detalhe(id) {
    const a = Dados.aluno(id);
    if (!a) { Telas.ir('fichas'); return; }
    const r = Dados.resumoAluno(id);
    const ps = Dados.parcelasDoAluno(id);
    const pct = r.total ? Math.min(100, Math.round(r.pago / r.total * 100)) : 0;
    const info = (rotulo, valor) => valor ? `<div><span>${rotulo}</span>${UI.esc(valor)}</div>` : '';

    UI.tela(`
      <div class="topo">
        <div><h1>${UI.esc(a.nome)}</h1><p>Ficha nº ${a.numero} · ${UI.esc(a.servico)} · Categoria ${UI.esc(a.categoria)} · ${UI.esc(a.status)}</p></div>
        <div class="botoes">
          <button class="btn" id="imprimir-ficha">${UI.publicado ? 'Baixar ficha' : 'Imprimir ficha'}</button>
          <a class="btn" href="#editar-ficha/${UI.esc(a.id)}">Editar</a>
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
        <div class="tabela-rolagem"><table class="tabela-cartoes">
          <thead><tr><th>Descrição</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th><th>Pago em</th><th></th></tr></thead>
          <tbody>${ps.length ? ps.map(p => `
            <tr>
              <td class="principal" data-rotulo="Descrição">${UI.esc(p.descricao)}</td>
              <td data-rotulo="Vencimento">${Hoje.br(p.vencimento)}</td>
              <td class="num" data-rotulo="Valor">${Dinheiro.br(p.pagoEm ? p.valorPago : p.valor)}</td>
              <td data-rotulo="Situação">${UI.tag(p)}</td>
              <td data-rotulo="Pago em">${p.pagoEm ? `${Hoje.br(p.pagoEm)} <small class="muted">${UI.esc(p.forma)}</small>` : '—'}</td>
              <td class="acoes">${p.pagoEm
                ? `<button class="btn btn-pequeno" data-recibo="${UI.esc(p.id)}">Recibo</button><button class="btn btn-pequeno" data-estornar="${UI.esc(p.id)}">Estornar</button>`
                : `<button class="btn btn-pequeno btn-ok" data-receber="${UI.esc(p.id)}">Receber</button><button class="btn btn-pequeno btn-perigo" data-excluir="${UI.esc(p.id)}" aria-label="Excluir cobrança">Excluir</button>`}
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
        ${a.obs ? `<p style="margin-top:14px"><span class="muted">Observações:</span><br><span class="texto-livre">${UI.esc(a.obs)}</span></p>` : ''}
      </div>
    `);

    const tela = document.getElementById('tela');
    tela.querySelectorAll('[data-receber]').forEach(b => { b.onclick = () => Pagamentos.modalReceber(b.dataset.receber); });
    tela.querySelectorAll('[data-recibo]').forEach(b => { b.onclick = () => Pagamentos.recibo(b.dataset.recibo); });
    tela.querySelectorAll('[data-estornar]').forEach(b => { b.onclick = () => Pagamentos.estornar(b.dataset.estornar); });
    tela.querySelectorAll('[data-excluir]').forEach(b => {
      b.onclick = async () => {
        const p = Dados.parcela(b.dataset.excluir);
        if (!p || !await UI.confirmar('Excluir cobrança?', `${p.descricao} de ${Dinheiro.br(p.valor)} será removida.`, { botao: 'Excluir', perigo: true })) return;
        Dados.excluirParcela(p.id);
        UI.aviso('Cobrança excluída');
        Telas.recarregar();
      };
    });
    document.getElementById('nova-cobranca').onclick = () => this.modalCobranca(a.id);
    document.getElementById('imprimir-ficha').onclick = () => this.imprimir(a.id);
    document.getElementById('excluir-ficha').onclick = async () => {
      if (!await UI.confirmar('Excluir ficha?', `A ficha de ${a.nome} e todos os pagamentos dela serão apagados. Isso não pode ser desfeito.`, { botao: 'Excluir ficha', perigo: true })) return;
      Dados.excluirFicha(a.id);
      UI.aviso('Ficha excluída');
      Telas.ir('fichas');
    };
  },

  /* Cobrança extra: taxa do DETRAN, aula extra, exame, etc. */
  modalCobranca(alunoId) {
    UI.abrirModal(`
      <h2>Nova cobrança</h2>
      <p class="muted">Ex.: aula extra, taxa de reteste, exame médico.</p>
      <form id="form-cobranca" novalidate>
        <div class="grade">
          <div class="campo c2"><label for="cb-desc">Descrição</label><input id="cb-desc" name="descricao" maxlength="100" required placeholder="Aula extra"></div>
          <div class="campo"><label for="cb-valor">Valor (R$)</label><input id="cb-valor" name="valor" inputmode="decimal" maxlength="15" required placeholder="0,00"></div>
          <div class="campo"><label for="cb-venc">Vencimento</label><input id="cb-venc" name="vencimento" type="date" value="${Hoje.iso()}" required></div>
        </div>
        <p class="erro-texto" id="cb-erro" role="alert"></p>
        <div class="botoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-primario">Adicionar</button></div>
      </form>
    `);
    document.getElementById('form-cobranca').onsubmit = e => {
      e.preventDefault();
      const d = UI.lerForm(e.target);
      const valor = Dinheiro.ler(d.valor);
      const erro = document.getElementById('cb-erro');
      if (!d.descricao) { erro.textContent = 'Informe a descrição.'; return; }
      if (valor <= 0) { erro.textContent = 'Informe um valor válido (ex.: 80,00).'; return; }
      if (!Hoje.valida(d.vencimento)) { erro.textContent = 'Informe o vencimento.'; return; }
      Dados.novaCobranca(alunoId, d.descricao, valor, d.vencimento);
      UI.fecharModal();
      UI.aviso('Cobrança adicionada');
      Telas.recarregar();
    };
  },

  htmlImpressao(id) {
    const a = Dados.aluno(id);
    const c = Dados.estado.config;
    const r = Dados.resumoAluno(id);
    const linha = (rotulo, valor) => `<tr><th style="width:30%">${rotulo}</th><td>${UI.esc(valor)}</td></tr>`;
    return `
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
      <div class="assinatura">Assinatura do aluno</div>`;
  },

  imprimir(id) {
    const a = Dados.aluno(id);
    const html = this.htmlImpressao(id);
    if (UI.publicado) UI.baixar(`ficha-${a.numero}.html`, UI.documento(`Ficha ${a.numero}`, html));
    else UI.imprimir(html);
  }
};
