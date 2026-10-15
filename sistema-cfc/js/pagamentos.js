/* pagamentos.js — pagamentos realizados, pendentes, baixa e recibo. */

const Pagamentos = {
  filtroPagos: { de: null, ate: null, forma: '', busca: '' },
  filtroPendentes: { situacao: '', busca: '' },

  // ---------- Pagamentos realizados ----------
  realizados() {
    const f = this.filtroPagos;
    if (!f.de) { f.de = Hoje.inicioMes(); f.ate = Hoje.fimMes(); }
    UI.tela(`
      <div class="topo"><div><h1>Pagamentos realizados</h1><p>Tudo o que já entrou no caixa.</p></div></div>
      <div class="painel">
        <div class="filtros">
          <div class="campo"><label>De</label><input type="date" id="f-de" value="${f.de}"></div>
          <div class="campo"><label>Até</label><input type="date" id="f-ate" value="${f.ate}"></div>
          <div class="campo"><label>Forma</label><select id="f-forma"><option value="">Todas</option>${UI.opcoes(FORMAS, f.forma)}</select></div>
          <div class="campo busca"><label>Aluno</label><input id="f-busca" placeholder="Nome do aluno" value="${UI.esc(f.busca)}"></div>
        </div>
        <div class="botoes" style="margin-bottom:14px">
          <button class="btn btn-pequeno" data-periodo="hoje">Hoje</button>
          <button class="btn btn-pequeno" data-periodo="mes">Este mês</button>
          <button class="btn btn-pequeno" data-periodo="anterior">Mês passado</button>
          <button class="btn btn-pequeno" data-periodo="ano">Este ano</button>
        </div>
        <div class="tabela-rolagem"><table>
          <thead><tr><th>Pago em</th><th>Aluno</th><th>Descrição</th><th>Forma</th><th class="num">Valor</th><th></th></tr></thead>
          <tbody id="corpo"></tbody>
        </table></div>
        <div class="resumo-valores" id="totais"></div>
      </div>
    `);

    const ligar = (id, chave, evento = 'onchange') => {
      const el = document.getElementById(id);
      el[evento] = () => { f[chave] = el.value; this.preencherRealizados(); };
    };
    ligar('f-de', 'de'); ligar('f-ate', 'ate'); ligar('f-forma', 'forma'); ligar('f-busca', 'busca', 'oninput');

    document.querySelectorAll('[data-periodo]').forEach(b => {
      b.onclick = () => {
        const hoje = Hoje.iso();
        const p = b.dataset.periodo;
        if (p === 'hoje') { f.de = f.ate = hoje; }
        if (p === 'mes') { f.de = Hoje.inicioMes(); f.ate = Hoje.fimMes(); }
        if (p === 'anterior') { const m = Hoje.somarMeses(Hoje.inicioMes(), -1); f.de = m; f.ate = Hoje.fimMes(m); }
        if (p === 'ano') { f.de = hoje.slice(0, 4) + '-01-01'; f.ate = hoje.slice(0, 4) + '-12-31'; }
        this.realizados();
      };
    });
    this.preencherRealizados();
  },

  preencherRealizados() {
    const f = this.filtroPagos;
    const termo = f.busca.toLowerCase().trim();
    const lista = Dados.estado.parcelas
      .filter(p => p.pagoEm && (!f.de || p.pagoEm >= f.de) && (!f.ate || p.pagoEm <= f.ate))
      .filter(p => !f.forma || p.forma === f.forma)
      .map(p => ({ p, a: Dados.aluno(p.alunoId) }))
      .filter(({ a }) => a && (!termo || a.nome.toLowerCase().includes(termo)))
      .sort((x, y) => y.p.pagoEm.localeCompare(x.p.pagoEm));

    const corpo = document.getElementById('corpo');
    corpo.innerHTML = lista.length ? lista.map(({ p, a }) => `
      <tr>
        <td>${Hoje.br(p.pagoEm)}</td>
        <td><a href="#ficha/${a.id}">${UI.esc(a.nome)}</a></td>
        <td>${UI.esc(p.descricao)}${p.obs ? `<br><small class="muted">${UI.esc(p.obs)}</small>` : ''}</td>
        <td>${UI.esc(p.forma)}</td>
        <td class="num">${Dinheiro.br(p.valorPago)}</td>
        <td class="acoes"><button class="btn btn-pequeno" data-recibo="${p.id}">Recibo</button><button class="btn btn-pequeno" data-estornar="${p.id}">Estornar</button></td>
      </tr>`).join('') : '<tr><td colspan="6" class="vazio">Nenhum pagamento neste período.</td></tr>';

    corpo.querySelectorAll('[data-recibo]').forEach(b => { b.onclick = () => this.recibo(b.dataset.recibo); });
    corpo.querySelectorAll('[data-estornar]').forEach(b => { b.onclick = () => this.estornar(b.dataset.estornar); });

    // Total geral e por forma de pagamento
    const total = lista.reduce((s, { p }) => s + p.valorPago, 0);
    const porForma = {};
    lista.forEach(({ p }) => { porForma[p.forma] = (porForma[p.forma] || 0) + p.valorPago; });
    document.getElementById('totais').innerHTML =
      `<div><span>Total recebido (${lista.length})</span><strong>${Dinheiro.br(total)}</strong></div>` +
      Object.entries(porForma).map(([forma, v]) => `<div><span>${UI.esc(forma)}</span><strong>${Dinheiro.br(v)}</strong></div>`).join('');
  },

  // ---------- Pagamentos pendentes ----------
  pendentes() {
    const f = this.filtroPendentes;
    UI.tela(`
      <div class="topo"><div><h1>Pagamentos pendentes</h1><p>Parcelas que ainda não foram pagas.</p></div></div>
      <div class="painel">
        <div class="filtros">
          <div class="campo"><label>Mostrar</label>
            <select id="f-situacao">
              <option value="">Todas pendentes</option>
              <option value="atrasado"${f.situacao === 'atrasado' ? ' selected' : ''}>Atrasadas</option>
              <option value="hoje"${f.situacao === 'hoje' ? ' selected' : ''}>Vencem hoje</option>
              <option value="semana"${f.situacao === 'semana' ? ' selected' : ''}>Próximos 7 dias</option>
              <option value="mes"${f.situacao === 'mes' ? ' selected' : ''}>Vencem este mês</option>
            </select>
          </div>
          <div class="campo busca"><label>Aluno</label><input id="f-busca" placeholder="Nome do aluno" value="${UI.esc(f.busca)}"></div>
        </div>
        <div class="tabela-rolagem"><table>
          <thead><tr><th>Vencimento</th><th>Aluno</th><th>Descrição</th><th>Situação</th><th class="num">Valor</th><th></th></tr></thead>
          <tbody id="corpo"></tbody>
        </table></div>
        <div class="resumo-valores" id="totais"></div>
      </div>
    `);
    const sit = document.getElementById('f-situacao');
    const busca = document.getElementById('f-busca');
    sit.onchange = () => { f.situacao = sit.value; this.preencherPendentes(); };
    busca.oninput = () => { f.busca = busca.value; this.preencherPendentes(); };
    this.preencherPendentes();
  },

  preencherPendentes() {
    const f = this.filtroPendentes;
    const hoje = Hoje.iso();
    const termo = f.busca.toLowerCase().trim();
    const passa = p => {
      if (f.situacao === 'atrasado') return p.vencimento < hoje;
      if (f.situacao === 'hoje') return p.vencimento === hoje;
      if (f.situacao === 'semana') return p.vencimento >= hoje && p.vencimento <= Hoje.somarDias(hoje, 7);
      if (f.situacao === 'mes') return p.vencimento <= Hoje.fimMes();
      return true;
    };
    const lista = Dados.estado.parcelas
      .filter(p => !p.pagoEm && passa(p))
      .map(p => ({ p, a: Dados.aluno(p.alunoId) }))
      .filter(({ a }) => a && a.status !== 'Cancelado' && (!termo || a.nome.toLowerCase().includes(termo)))
      .sort((x, y) => x.p.vencimento.localeCompare(y.p.vencimento));

    const cfc = Dados.estado.config.nomeCfc;
    const corpo = document.getElementById('corpo');
    corpo.innerHTML = lista.length ? lista.map(({ p, a }) => {
      const msg = `Olá ${a.nome.split(' ')[0]}! Aqui é da ${cfc}. ` +
        (p.vencimento < hoje ? `Consta em aberto a ${p.descricao.toLowerCase()} de ${Dinheiro.br(p.valor)}, vencida em ${Hoje.br(p.vencimento)}.` :
          `Lembrete: a ${p.descricao.toLowerCase()} de ${Dinheiro.br(p.valor)} vence em ${Hoje.br(p.vencimento)}.`);
      const zap = UI.whatsapp(a.telefone, msg);
      return `<tr>
        <td>${Hoje.br(p.vencimento)}</td>
        <td><a href="#ficha/${a.id}">${UI.esc(a.nome)}</a><br><small class="muted">${UI.esc(a.telefone)}</small></td>
        <td>${UI.esc(p.descricao)}</td>
        <td>${UI.tag(p)}</td>
        <td class="num">${Dinheiro.br(p.valor)}</td>
        <td class="acoes">
          ${zap ? `<a class="btn btn-pequeno" href="${zap}" target="_blank" rel="noopener" title="Cobrar pelo WhatsApp">WhatsApp</a>` : ''}
          <button class="btn btn-pequeno btn-ok" data-receber="${p.id}">Receber</button>
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" class="vazio">Nenhum pagamento pendente aqui. 🎉</td></tr>';

    corpo.querySelectorAll('[data-receber]').forEach(b => { b.onclick = () => this.modalReceber(b.dataset.receber); });

    const total = lista.reduce((s, { p }) => s + p.valor, 0);
    const atrasado = lista.filter(({ p }) => p.vencimento < hoje).reduce((s, { p }) => s + p.valor, 0);
    document.getElementById('totais').innerHTML = `
      <div><span>Total pendente (${lista.length})</span><strong>${Dinheiro.br(total)}</strong></div>
      <div><span>Atrasado</span><strong style="color:var(--atraso)">${Dinheiro.br(atrasado)}</strong></div>
      <div><span>A vencer</span><strong>${Dinheiro.br(total - atrasado)}</strong></div>`;
  },

  // ---------- Dar baixa (receber) ----------
  modalReceber(id) {
    const p = Dados.parcela(id);
    const a = Dados.aluno(p.alunoId);
    UI.abrirModal(`
      <h2>Receber pagamento</h2>
      <p class="muted">${UI.esc(a.nome)} · ${UI.esc(p.descricao)} · vence ${Hoje.br(p.vencimento)}</p>
      <form id="form-receber">
        <div class="grade">
          <div class="campo"><label>Valor recebido (R$)</label><input name="valor" inputmode="decimal" value="${p.valor.toFixed(2).replace('.', ',')}" required></div>
          <div class="campo"><label>Data do pagamento</label><input name="data" type="date" value="${Hoje.iso()}" required></div>
          <div class="campo c2"><label>Forma de pagamento</label><select name="forma">${UI.opcoes(FORMAS, 'PIX')}</select></div>
          <div class="campo c2"><label>Observação</label><input name="obs" placeholder="Opcional"></div>
        </div>
        <p class="muted" style="font-size:13px">Se receber menos que ${Dinheiro.br(p.valor)}, o restante continua como pendente.</p>
        <label style="display:flex;gap:8px;align-items:center;margin-bottom:14px"><input type="checkbox" name="imprimir" style="width:auto"> Imprimir recibo depois de salvar</label>
        <div class="botoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-ok">Confirmar recebimento</button></div>
      </form>
    `);
    document.getElementById('form-receber').onsubmit = e => {
      e.preventDefault();
      const d = UI.lerForm(e.target);
      const valor = Dinheiro.ler(d.valor);
      if (valor <= 0) { UI.aviso('Informe o valor recebido', true); return; }
      Dados.receber(id, valor, d.data, d.forma, d.obs);
      UI.fecharModal();
      UI.aviso(`Recebido ${Dinheiro.br(valor)} de ${a.nome}`);
      atualizarTela();
      if (d.imprimir) this.recibo(id);
    };
  },

  estornar(id) {
    if (!confirm('Estornar este pagamento? A parcela volta a ficar pendente.')) return;
    Dados.estornar(id);
    UI.aviso('Pagamento estornado');
    atualizarTela();
  },

  // ---------- Recibo (duas vias) ----------
  recibo(id) {
    const p = Dados.parcela(id);
    const a = Dados.aluno(p.alunoId);
    const c = Dados.estado.config;
    const via = nome => `
      <div class="via">
        <h1>${UI.esc(c.nomeCfc)}</h1>
        <p>${UI.esc([c.cnpj && 'CNPJ ' + c.cnpj, c.endereco, c.cidade, c.telefone].filter(Boolean).join(' · '))}</p>
        <h2 style="font-size:16px">RECIBO — ${Dinheiro.br(p.valorPago)} <small>(${nome})</small></h2>
        <p>Recebemos de <strong>${UI.esc(a.nome)}</strong>${a.cpf ? `, CPF ${UI.esc(a.cpf)}` : ''}, a importância de
          <strong>${Dinheiro.br(p.valorPago)}</strong> referente a <strong>${UI.esc(p.descricao)}</strong>
          (${UI.esc(a.servico)} — categoria ${UI.esc(a.categoria)}, ficha nº ${a.numero}),
          paga em ${Hoje.br(p.pagoEm)} via ${UI.esc(p.forma)}.</p>
        ${p.obs ? `<p>Obs.: ${UI.esc(p.obs)}</p>` : ''}
        <p>${UI.esc(c.cidade || '')}${c.cidade ? ', ' : ''}${Hoje.br(p.pagoEm)}</p>
        <div class="assinatura">${UI.esc(c.nomeCfc)}</div>
      </div>`;
    UI.imprimir(via('via do aluno') + via('via do CFC'));
  }
};
