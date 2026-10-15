/* inicio.js — painel com o resumo do dia e do mês. */

const Inicio = {
  mostrar() {
    const hoje = Hoje.iso();
    const ini = Hoje.inicioMes();
    const fim = Hoje.fimMes();
    const parcelas = Dados.estado.parcelas.filter(p => {
      const a = Dados.aluno(p.alunoId);
      return a && a.status !== 'Cancelado';
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
        <span style="text-align:right">${Dinheiro.br(p.pagoEm ? p.valorPago : p.valor)}<br>${UI.tag(p)}</span></li>`;
    };
    const ultimosPagos = parcelas.filter(p => p.pagoEm).sort((a, b) => b.pagoEm.localeCompare(a.pagoEm)).slice(0, 6);
    const nomeMes = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    UI.tela(`
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

    // Os atalhos de "atraso" já abrem a lista de pendentes filtrada.
    document.querySelectorAll('[data-atrasadas]').forEach(el => {
      el.addEventListener('click', () => { Pagamentos.filtroPendentes.situacao = 'atrasado'; });
    });
  }
};
