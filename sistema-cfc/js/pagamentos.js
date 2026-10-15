/* pagamentos.js — pagamentos realizados, pendentes, baixa e recibo. */

const Pagamentos = {
  filtroPagos: { de: null, ate: null, forma: '', busca: '' },
  filtroPendentes: { situacao: '', busca: '' },

  // ---------- Pagamentos realizados ----------
  realizados() {
    const f = this.filtroPagos;
    // Período automático acompanha a virada do mês se o sistema ficar aberto.
    if (!f.de || (f.auto && f.auto !== Hoje.inicioMes())) { f.de = Hoje.inicioMes(); f.ate = Hoje.fimMes(); f.auto = f.de; }
    UI.tela(`
      <div class="topo"><div><h1>Pagamentos realizados</h1><p>Tudo o que já entrou no caixa.</p></div></div>
      <div class="painel">
        <div class="botoes" style="margin-bottom:12px">
          <button class="btn btn-pequeno" data-periodo="hoje">Hoje</button>
          <button class="btn btn-pequeno" data-periodo="mes">Este mês</button>
          <button class="btn btn-pequeno" data-periodo="anterior">Mês passado</button>
          <button class="btn btn-pequeno" data-periodo="ano">Este ano</button>
        </div>
        <details class="mais-filtros"${matchMedia('(min-width: 861px)').matches || f.forma || f.busca || !f.auto ? ' open' : ''}>
          <summary>Período: ${Hoje.br(f.de)} a ${Hoje.br(f.ate)}${f.forma ? ' · ' + UI.esc(f.forma) : ''} — mudar filtros</summary>
          <div class="filtros">
            <div class="campo"><label for="f-de">De</label><input type="date" id="f-de" value="${UI.esc(f.de)}"></div>
            <div class="campo"><label for="f-ate">Até</label><input type="date" id="f-ate" value="${UI.esc(f.ate)}"></div>
            <div class="campo"><label for="f-forma">Forma</label><select id="f-forma"><option value="">Todas</option>${UI.opcoes(FORMAS, f.forma)}</select></div>
            <div class="campo busca"><label for="f-busca">Aluno</label><input id="f-busca" type="search" maxlength="100" placeholder="Nome do aluno" value="${UI.esc(f.busca)}"></div>
          </div>
        </details>
        <div class="tabela-rolagem"><table class="tabela-cartoes">
          <thead><tr><th>Pago em</th><th>Aluno</th><th>Descrição</th><th>Forma</th><th class="num">Valor</th><th></th></tr></thead>
          <tbody id="corpo"></tbody>
        </table></div>
        <div class="resumo-valores" id="totais"></div>
      </div>
    `);

    const ligar = (id, chave, evento = 'onchange') => {
      const el = document.getElementById(id);
      el[evento] = () => { f[chave] = el.value; if (chave === 'de' || chave === 'ate') f.auto = null; this.preencherRealizados(); };
    };
    ligar('f-de', 'de'); ligar('f-ate', 'ate'); ligar('f-forma', 'forma'); ligar('f-busca', 'busca', 'oninput');

    document.querySelectorAll('[data-periodo]').forEach(b => {
      b.onclick = () => {
        const hoje = Hoje.iso();
        const p = b.dataset.periodo;
        if (p === 'hoje') { f.de = f.ate = hoje; }
        f.auto = null;
        if (p === 'mes') { f.de = Hoje.inicioMes(); f.ate = Hoje.fimMes(); f.auto = f.de; }
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
        <td data-rotulo="Pago em">${Hoje.br(p.pagoEm)}</td>
        <td class="principal" data-rotulo="Aluno"><a href="#ficha/${UI.esc(a.id)}">${UI.esc(a.nome)}</a></td>
        <td data-rotulo="Descrição">${UI.esc(p.descricao)}${p.obs ? `<br><small class="muted">${UI.esc(p.obs)}</small>` : ''}</td>
        <td data-rotulo="Forma">${UI.esc(p.forma)}</td>
        <td class="num" data-rotulo="Valor">${Dinheiro.br(p.valorPago)}</td>
        <td class="acoes"><button class="btn btn-pequeno" data-recibo="${UI.esc(p.id)}">Recibo</button><button class="btn btn-pequeno" data-estornar="${UI.esc(p.id)}">Desfazer</button></td>
      </tr>`).join('') : '<tr><td colspan="6" class="vazio">Nenhum pagamento neste período.</td></tr>';

    corpo.querySelectorAll('[data-recibo]').forEach(b => { b.onclick = () => this.recibo(b.dataset.recibo); });
    corpo.querySelectorAll('[data-estornar]').forEach(b => { b.onclick = () => this.estornar(b.dataset.estornar); });

    // Total geral e por forma de pagamento
    const porForma = new Map();
    lista.forEach(({ p }) => porForma.set(p.forma, (porForma.get(p.forma) || 0) + Dinheiro.centavos(p.valorPago)));
    document.getElementById('totais').innerHTML =
      `<div><span>Total recebido (${lista.length})</span><strong>${Dinheiro.br(Dinheiro.somar(lista.map(x => x.p), 'valorPago'))}</strong></div>` +
      [...porForma].map(([forma, c]) => `<div><span>${UI.esc(forma)}</span><strong>${Dinheiro.br(c / 100)}</strong></div>`).join('');
  },

  // ---------- Pagamentos pendentes ----------
  pendentes() {
    const f = this.filtroPendentes;
    const opcao = (v, t) => `<option value="${v}"${f.situacao === v ? ' selected' : ''}>${t}</option>`;
    UI.tela(`
      <div class="topo"><div><h1>Pagamentos pendentes</h1><p>Parcelas que ainda não foram pagas.</p></div></div>
      <div class="painel">
        <div class="filtros">
          <div class="campo"><label for="f-situacao">Mostrar</label>
            <select id="f-situacao">
              ${opcao('', 'Todas pendentes')}${opcao('atrasado', 'Atrasadas')}${opcao('hoje', 'Vencem hoje')}
              ${opcao('semana', 'Próximos 7 dias')}${opcao('mes', 'Vencem até o fim do mês')}
            </select>
          </div>
          <div class="campo busca"><label for="f-busca">Aluno</label><input id="f-busca" type="search" maxlength="100" placeholder="Nome do aluno" value="${UI.esc(f.busca)}"></div>
        </div>
        <div class="tabela-rolagem"><table class="tabela-cartoes">
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
        (p.vencimento < hoje ? `Consta em aberto: ${p.descricao} de ${Dinheiro.br(p.valor)}, vencida em ${Hoje.br(p.vencimento)}.` :
          `Lembrete: ${p.descricao} de ${Dinheiro.br(p.valor)} vence em ${Hoje.br(p.vencimento)}.`);
      const zap = UI.whatsapp(a.telefone, msg);
      return `<tr>
        <td data-rotulo="Vencimento">${Hoje.br(p.vencimento)}</td>
        <td class="principal" data-rotulo="Aluno"><a href="#ficha/${UI.esc(a.id)}">${UI.esc(a.nome)}</a><br><small class="muted">${UI.esc(a.telefone)}</small></td>
        <td data-rotulo="Descrição">${UI.esc(p.descricao)}</td>
        <td data-rotulo="Situação">${UI.tag(p)}</td>
        <td class="num" data-rotulo="Valor">${Dinheiro.br(p.valor)}</td>
        <td class="acoes">
          ${zap ? `<a class="btn btn-pequeno" href="${UI.esc(zap)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ''}
          <button class="btn btn-pequeno btn-ok" data-receber="${UI.esc(p.id)}">Receber</button>
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" class="vazio">Nenhum pagamento pendente aqui.</td></tr>';

    corpo.querySelectorAll('[data-receber]').forEach(b => { b.onclick = () => this.modalReceber(b.dataset.receber); });

    const ps = lista.map(x => x.p);
    const total = Dinheiro.somar(ps, 'valor');
    const atrasado = Dinheiro.somar(ps.filter(p => p.vencimento < hoje), 'valor');
    document.getElementById('totais').innerHTML = `
      <div><span>Total pendente (${lista.length})</span><strong>${Dinheiro.br(total)}</strong></div>
      <div><span>Atrasado</span><strong class="vermelho">${Dinheiro.br(atrasado)}</strong></div>
      <div><span>A vencer</span><strong>${Dinheiro.br((Dinheiro.centavos(total) - Dinheiro.centavos(atrasado)) / 100)}</strong></div>`;
  },

  // ---------- Dar baixa (receber) ----------
  modalReceber(id) {
    const p = Dados.parcela(id);
    if (!p || p.pagoEm) { UI.aviso('Esta parcela já foi paga.', true); Telas.recarregar(); return; }
    const a = Dados.aluno(p.alunoId);
    UI.abrirModal(`
      <h2>Receber pagamento</h2>
      <p class="muted">${UI.esc(a.nome)} · ${UI.esc(p.descricao)} · vence ${Hoje.br(p.vencimento)}</p>
      <form id="form-receber" novalidate>
        <div class="grade">
          <div class="campo"><label for="r-valor">Valor recebido (R$)</label><input id="r-valor" name="valor" inputmode="decimal" maxlength="15" value="${Dinheiro.campo(p.valor)}" required></div>
          <div class="campo"><label for="r-data">Data do pagamento</label><input id="r-data" name="data" type="date" value="${Hoje.iso()}" max="${Hoje.iso()}" required></div>
          <div class="campo c2"><label for="r-forma">Forma de pagamento</label><select id="r-forma" name="forma">${UI.opcoes(FORMAS, 'PIX')}</select></div>
          <div class="campo c2"><label for="r-obs">Observação</label><input id="r-obs" name="obs" maxlength="300" placeholder="Opcional"></div>
        </div>
        <p class="dica">Valor desta parcela: ${Dinheiro.br(p.valor)}. Se receber menos, o restante continua pendente.</p>
        <p class="erro-texto" id="r-erro" role="alert"></p>
        <div class="botoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-ok" id="r-ok">Confirmar recebimento</button></div>
      </form>
    `);
    document.getElementById('form-receber').onsubmit = e => {
      e.preventDefault();
      const d = UI.lerForm(e.target);
      const valor = Dinheiro.ler(d.valor);
      const erro = document.getElementById('r-erro');
      if (valor <= 0) { erro.textContent = 'Informe o valor recebido (ex.: 350,00).'; return; }
      if (Dinheiro.centavos(valor) > Dinheiro.centavos(p.valor)) { erro.textContent = `O valor é maior que o desta parcela (${Dinheiro.br(p.valor)}). Receba o excedente na próxima parcela.`; return; }
      if (!Hoje.valida(d.data) || d.data > Hoje.iso()) { erro.textContent = 'A data do pagamento não pode ser futura.'; return; }
      document.getElementById('r-ok').disabled = true; // evita receber duas vezes com toque duplo
      try {
        Dados.receber(id, valor, d.data, d.forma, d.obs);
      } catch (err) {
        UI.fecharModal(); UI.aviso('Esta parcela já tinha sido recebida.', true); Telas.recarregar(); return;
      }
      UI.fecharModal();
      Telas.recarregar();
      this.recibo(id, `Recebido ${Dinheiro.br(valor)} de ${a.nome}.`); // o próprio recibo confirma
    };
  },

  async estornar(id) {
    const p = Dados.parcela(id);
    if (!p) return;
    if (!await UI.confirmar('Desfazer pagamento?', `O pagamento de ${Dinheiro.br(p.valorPago)} (${p.descricao}) será cancelado e a parcela volta a ficar pendente.`, { botao: 'Desfazer pagamento', perigo: true })) return;
    Dados.estornar(id);
    UI.aviso('Pagamento desfeito');
    Telas.recarregar();
  },

  // ---------- Recibo ----------
  textoRecibo(p, a, c) {
    return [
      `RECIBO — ${c.nomeCfc}`,
      c.cnpj ? `CNPJ ${c.cnpj}` : '',
      '',
      `Recebemos de ${a.nome}${a.cpf ? `, CPF ${a.cpf}` : ''}, a importância de ${Dinheiro.br(p.valorPago)} referente a ${p.descricao} (${a.servico} — categoria ${a.categoria}, ficha nº ${a.numero}), paga em ${Hoje.br(p.pagoEm)} via ${p.forma}.`,
      this.notaParcial(p),
      p.obs ? `Obs.: ${p.obs}` : '',
      '',
      `${c.cidade ? c.cidade + ', ' : ''}${Hoje.br(p.pagoEm)}`
    ].filter((l, i, arr) => l !== '' || arr[i - 1] !== '').join('\n');
  },

  htmlRecibo(p, a, c) {
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
        ${this.notaParcial(p) ? `<p>${UI.esc(this.notaParcial(p))}</p>` : ''}
        <p>${UI.esc(c.cidade || '')}${c.cidade ? ', ' : ''}${Hoje.br(p.pagoEm)}</p>
        <div class="assinatura">${UI.esc(c.nomeCfc)}</div>
      </div>`;
    return via('via do aluno') + via('via do CFC');
  },

  /* "Pagamento parcial: restam R$ X" quando ainda há saldo desta parcela. */
  notaParcial(p) {
    const r = Dados.restanteDe(p.id);
    return r ? `Pagamento parcial: resta ${Dinheiro.br(r.valor)} com vencimento em ${Hoje.br(r.vencimento)}.` : '';
  },

  recibo(id, confirmacao = '') {
    const p = Dados.parcela(id);
    if (!p || !p.pagoEm) return;
    const a = Dados.aluno(p.alunoId);
    const c = Dados.estado.config;
    const texto = this.textoRecibo(p, a, c);
    const zap = UI.whatsapp(a.telefone, texto);
    UI.abrirModal(`
      <h2>Recibo</h2>
      ${confirmacao ? `<p class="confirmado">${UI.esc(confirmacao)}</p>` : ''}
      <div class="recibo-previa">${UI.esc(texto)}</div>
      <div class="botoes">
        <button type="button" class="btn" data-fechar>Fechar</button>
        <button type="button" class="btn" id="rc-copiar">Copiar</button>
        ${zap ? `<a class="btn" href="${UI.esc(zap)}" target="_blank" rel="noopener noreferrer">Enviar no WhatsApp</a>` : ''}
        <button type="button" class="btn btn-primario" id="rc-imprimir">${UI.publicado ? 'Baixar para imprimir' : 'Imprimir'}</button>
      </div>`);
    document.getElementById('rc-copiar').onclick = () => UI.copiar(texto);
    document.getElementById('rc-imprimir').onclick = () => {
      const html = this.htmlRecibo(p, a, c);
      if (UI.publicado) UI.baixar(`recibo-${a.numero}-${p.pagoEm}.html`, UI.documento('Recibo', html));
      else UI.imprimir(html);
    };
  }
};
