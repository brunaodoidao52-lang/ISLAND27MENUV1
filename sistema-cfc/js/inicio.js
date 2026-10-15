/* inicio.js — painel com o resumo do dia e do mês. */

const PERIODOS = [['hoje', 'Hoje'], ['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano'], ['personalizado', 'Personalizado']];

const Inicio = {
  // Período escolhido no painel "Entradas" (fica lembrado enquanto o sistema está aberto).
  periodo: 'hoje',
  de: null,
  ate: null,

  /* Datas de início e fim do período escolhido. Semana = segunda a domingo. */
  intervalo() {
    const hoje = Hoje.iso();
    const [a, m, d] = hoje.split('-').map(Number);
    switch (this.periodo) {
      case 'semana': {
        const dia = new Date(a, m - 1, d).getDay(); // 0 = domingo
        const segunda = Hoje.somarDias(hoje, dia === 0 ? -6 : 1 - dia);
        return { de: segunda, ate: Hoje.somarDias(segunda, 6), nome: 'nesta semana' };
      }
      case 'mes': return { de: Hoje.inicioMes(), ate: Hoje.fimMes(), nome: 'neste mês' };
      case 'ano': return { de: `${a}-01-01`, ate: `${a}-12-31`, nome: `em ${a}` };
      case 'personalizado': {
        const de = Hoje.valida(this.de) ? this.de : Hoje.inicioMes();
        const ate = Hoje.valida(this.ate) ? this.ate : hoje;
        return { de, ate, nome: 'no período', invertido: de > ate };
      }
      default: return { de: hoje, ate: hoje, nome: 'hoje' };
    }
  },

  /* Conteúdo do painel "Entradas" (redesenhado sozinho ao trocar o período). */
  htmlEntradas() {
    const iv = this.intervalo();
    const pagos = iv.invertido ? [] : Dados.estado.parcelas.filter(p => p.pagoEm && p.pagoEm >= iv.de && p.pagoEm <= iv.ate && Dados.aluno(p.alunoId));
    const total = Dinheiro.somar(pagos, 'valorPago');
    const porForma = new Map();
    pagos.forEach(p => porForma.set(p.forma, (porForma.get(p.forma) || 0) + Dinheiro.centavos(p.valorPago)));
    const faixa = iv.de === iv.ate ? Hoje.br(iv.de) : `${Hoje.br(iv.de)} a ${Hoje.br(iv.ate)}`;
    return `
      <div class="entradas-cabeca">
        <h2>Entradas</h2>
        <div class="periodos" role="group" aria-label="Período">
          ${PERIODOS.map(([v, t]) => `<button type="button" class="periodo${this.periodo === v ? ' ativo' : ''}" data-periodo-inicio="${v}" aria-pressed="${this.periodo === v}">${t}</button>`).join('')}
        </div>
      </div>
      ${this.periodo === 'personalizado' ? `
      <div class="filtros entradas-datas">
        <div class="campo"><label for="ent-de">De</label><input type="date" id="ent-de" value="${UI.esc(iv.de)}"></div>
        <div class="campo"><label for="ent-ate">Até</label><input type="date" id="ent-ate" value="${UI.esc(iv.ate)}"></div>
      </div>` : ''}
      ${iv.invertido ? '<p class="erro-texto">A data inicial está depois da final.</p>' : `
      <div class="entradas-total">
        <div>
          <span class="muted">Entrou ${iv.nome} <small>(${faixa})</small></span>
          <strong>${Dinheiro.br(total)}</strong>
          <small class="muted">${pagos.length ? `${pagos.length} pagamento(s)` : 'Nenhum pagamento recebido neste período.'}</small>
        </div>
        ${pagos.length ? `<a class="btn btn-pequeno" href="#pagos" data-ver-entradas>Ver lista</a>` : ''}
      </div>
      ${porForma.size ? `<div class="entradas-formas">${[...porForma].sort((x, y) => y[1] - x[1]).map(([f, c]) => `<span class="forma-chip"><span>${UI.esc(f)}</span><strong>${Dinheiro.br(c / 100)}</strong></span>`).join('')}</div>` : ''}`}`;
  },

  ligarEntradas() {
    const caixa = document.getElementById('painel-entradas');
    if (!caixa) return;
    caixa.querySelectorAll('[data-periodo-inicio]').forEach(b => {
      b.onclick = () => {
        this.periodo = b.dataset.periodoInicio;
        if (this.periodo === 'personalizado' && !this.de) { this.de = Hoje.inicioMes(); this.ate = Hoje.iso(); }
        this.atualizarEntradas();
      };
    });
    const de = document.getElementById('ent-de');
    const ate = document.getElementById('ent-ate');
    if (de) de.onchange = () => { this.de = de.value; this.atualizarEntradas('ent-de'); };
    if (ate) ate.onchange = () => { this.ate = ate.value; this.atualizarEntradas('ent-ate'); };
    const ver = caixa.querySelector('[data-ver-entradas]');
    if (ver) ver.addEventListener('click', () => {
      // A lista de pagamentos abre com o mesmo período.
      const iv = this.intervalo();
      Object.assign(Pagamentos.filtroPagos, { de: iv.de, ate: iv.ate, auto: null, forma: '', busca: '' });
    });
  },

  atualizarEntradas(foco) {
    const caixa = document.getElementById('painel-entradas');
    caixa.innerHTML = this.htmlEntradas();
    this.ligarEntradas();
    if (foco && document.getElementById(foco)) document.getElementById(foco).focus();
  },

  mostrar() {
    const hoje = Hoje.iso();
    const ini = Hoje.inicioMes();
    const fim = Hoje.fimMes();
    // Dinheiro que entrou conta sempre; de aluno cancelado não se cobra mais nada.
    const parcelas = Dados.estado.parcelas.filter(p => {
      const a = Dados.aluno(p.alunoId);
      return a && (p.pagoEm || a.status !== 'Cancelado');
    });
    const soma = (lista, campo = 'valor') => Dinheiro.somar(lista, campo);

    const pagosMes = parcelas.filter(p => p.pagoEm && p.pagoEm >= ini && p.pagoEm <= fim);
    const pagosHoje = parcelas.filter(p => p.pagoEm === hoje);
    const pendentes = parcelas.filter(p => !p.pagoEm);
    const atrasadas = pendentes.filter(p => p.vencimento < hoje);
    const aReceberMes = pendentes.filter(p => p.vencimento >= hoje && p.vencimento <= fim);
    const proximos = pendentes.filter(p => p.vencimento >= hoje && p.vencimento <= Hoje.somarDias(hoje, 7));
    const ativos = Dados.estado.alunos.filter(a => a.status === 'Em andamento').length;
    const novasMes = Dados.estado.alunos.filter(a => (a.criadoEm || '') >= ini).length;

    const item = p => {
      const a = Dados.aluno(p.alunoId);
      return `<li><span><a href="#ficha/${UI.esc(a.id)}">${UI.esc(a.nome)}</a><br><small class="muted">${UI.esc(p.descricao)} · ${Hoje.br(p.pagoEm || p.vencimento)}</small></span>
        <span class="item-valor">${Dinheiro.br(p.pagoEm ? p.valorPago : p.valor)}<br>${UI.tag(p)}
          ${p.pagoEm ? '' : `<button class="btn btn-pequeno btn-ok" data-receber="${UI.esc(p.id)}">Receber</button>`}</span></li>`;
    };
    const ultimosPagos = parcelas.filter(p => p.pagoEm).sort((a, b) => b.pagoEm.localeCompare(a.pagoEm)).slice(0, 6);
    const nomeMes = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    UI.tela(`
      <section class="painel painel-entradas" id="painel-entradas" aria-live="polite">${this.htmlEntradas()}</section>

      <div class="topo">
        <div><h1>Olá!</h1><p>${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} · resumo de ${nomeMes}</p></div>
        <div class="botoes">
          <a class="btn btn-primario" href="#nova-ficha">＋ Lançar ficha</a>
          <a class="btn" href="#pendentes">Receber pagamento</a>
        </div>
      </div>

      <div class="cartoes">
        <a class="cartao ok" href="#pagos"><span>Recebido no mês</span><strong>${Dinheiro.br(soma(pagosMes, 'valorPago'))}</strong><small>Hoje: ${Dinheiro.br(soma(pagosHoje, 'valorPago'))}</small></a>
        <a class="cartao destaque" href="#pendentes"><span>A receber no mês</span><strong>${Dinheiro.br(soma(aReceberMes))}</strong><small>${aReceberMes.length} parcela(s)</small></a>
        <a class="cartao atraso" href="#pendentes" data-atrasadas><span>Em atraso</span><strong>${Dinheiro.br(soma(atrasadas))}</strong><small>${atrasadas.length} parcela(s)</small></a>
        <a class="cartao" href="#fichas"><span>Alunos em andamento</span><strong>${ativos}</strong><small>${novasMes} ficha(s) nova(s) no mês</small></a>
      </div>

      ${Dados.estado.alunos.length ? '' : `
      <div class="painel">
        <h2>Comece por aqui</h2>
        <p class="muted">1. Ajuste o nome da autoescola em <a href="#config">Configurações</a>.<br>
          2. Clique em <a href="#nova-ficha">Lançar ficha</a> para cadastrar o primeiro aluno.<br>
          3. Quando o aluno pagar, vá em <a href="#pendentes">Pagamentos pendentes</a> e clique em “Receber”.</p>
        <p class="muted">Quer só testar? Use “Carregar dados de exemplo” em Configurações.</p>
      </div>`}

      <div class="duas-colunas">
        <div class="painel">
          <h2>Atrasados</h2>
          <ul class="lista-simples">${atrasadas.length ? atrasadas.sort((a, b) => a.vencimento.localeCompare(b.vencimento)).slice(0, 6).map(item).join('') : '<li class="muted">Nenhum atraso.</li>'}</ul>
          ${atrasadas.length > 6 ? '<p><a href="#pendentes" data-atrasadas>Ver todos</a></p>' : ''}
        </div>
        <div class="painel">
          <h2>Vencem nos próximos 7 dias</h2>
          <ul class="lista-simples">${proximos.length ? proximos.sort((a, b) => a.vencimento.localeCompare(b.vencimento)).slice(0, 6).map(item).join('') : '<li class="muted">Nada vencendo esta semana.</li>'}</ul>
        </div>
      </div>

      <div class="painel">
        <h2>Últimos pagamentos</h2>
        <ul class="lista-simples">${ultimosPagos.length ? ultimosPagos.map(item).join('') : '<li class="muted">Nenhum pagamento registrado ainda.</li>'}</ul>
      </div>
    `);

    this.ligarEntradas();
    document.querySelectorAll('#tela [data-receber]').forEach(b => { b.onclick = () => Pagamentos.modalReceber(b.dataset.receber); });
    // Os atalhos de "atraso" já abrem a lista de pendentes filtrada.
    document.querySelectorAll('[data-atrasadas]').forEach(el => {
      el.addEventListener('click', () => { Pagamentos.filtroPendentes.situacao = 'atrasado'; });
    });
  }
};
