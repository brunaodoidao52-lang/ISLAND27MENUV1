/*
 * dados.js — as informações do sistema e as regras de negócio.
 *
 * Estrutura (Dados.estado):
 *   config    -> dados da autoescola
 *   alunos    -> as fichas (dados pessoais + processo)
 *   parcelas  -> cada cobrança do aluno (entrada, mensalidades, taxas avulsas)
 *                com "pagoEm" preenchido = pagamento realizado; sem = pendente
 *   excluidos -> registro do que foi apagado (para o celular e o PC não
 *                "ressuscitarem" uma ficha apagada no outro aparelho)
 *
 * Cada registro guarda "alteradoEm" (data/hora da última mudança). Quando
 * dois aparelhos mexem ao mesmo tempo, vale a mudança mais recente de cada
 * registro — nada é perdido por inteiro.
 *
 * Onde salvar (navegador ou nuvem) e a criptografia ficam em cofre.js.
 */

const SERVICOS = ['Primeira habilitação', 'Adição de categoria', 'Mudança de categoria', 'Reciclagem', 'Renovação', 'Aulas avulsas', 'Outro'];
const CATEGORIAS = ['A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE'];
const FORMAS = ['Dinheiro', 'PIX', 'Cartão de débito', 'Cartão de crédito', 'Boleto', 'Transferência'];
const STATUS = ['Em andamento', 'Concluído', 'Cancelado'];

const VALOR_MAXIMO = 10000000; // R$ 10 milhões por lançamento
const MAX_PARCELAS = 60;

/* ---------- Datas (sempre no formato AAAA-MM-DD) ---------- */
const Hoje = {
  iso(d = new Date()) {
    const z = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  },
  valida(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const [a, m, d] = iso.split('-').map(Number);
    const dt = new Date(a, m - 1, d);
    return a >= 1900 && a <= 2200 && dt.getMonth() === m - 1 && dt.getDate() === d;
  },
  somarDias(iso, dias) {
    const [a, m, d] = iso.split('-').map(Number);
    return this.iso(new Date(a, m - 1, d + dias));
  },
  /* Soma meses mantendo o dia; dia 31 em mês curto vira o último dia do mês. */
  somarMeses(iso, meses) {
    const [a, m, d] = iso.split('-').map(Number);
    const ultimo = new Date(a, m - 1 + meses + 1, 0).getDate();
    return this.iso(new Date(a, m - 1 + meses, Math.min(d, ultimo)));
  },
  inicioMes(iso = this.iso()) { return iso.slice(0, 8) + '01'; },
  fimMes(iso = this.iso()) {
    const [a, m] = iso.split('-').map(Number);
    return this.iso(new Date(a, m, 0));
  },
  br(iso) {
    if (!this.valida(iso)) return '';
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  },
  diasEntre(de, ate) {
    const [a1, m1, d1] = de.split('-').map(Number);
    const [a2, m2, d2] = ate.split('-').map(Number);
    return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
  }
};

/* ---------- Dinheiro (contas sempre em centavos, sem erro de arredondamento) ---------- */
const Dinheiro = {
  fmt: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }),
  br(v) { return this.fmt.format(Number(v) || 0); },
  centavos(v) { return Math.round((Number(v) || 0) * 100); },
  /* Soma uma lista de valores sem acumular erro de vírgula flutuante. */
  somar(lista, campo) { return lista.reduce((s, x) => s + this.centavos(x[campo]), 0) / 100; },
  /* Lê "1.234,56", "1234,56" ou "1234.56" digitado pelo usuário. Inválido -> 0. */
  ler(texto) {
    let s = String(texto ?? '').trim().replace(/[R$\s]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "2.500" = dois mil e quinhentos
    if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return 0;
    const n = Math.round(Number(s) * 100) / 100;
    return isFinite(n) && n <= VALOR_MAXIMO ? n : 0;
  },
  /* Para preencher campos: 1234.5 -> "1234,50" */
  campo(v) { return (Number(v) || 0).toFixed(2).replace('.', ','); }
};

/* ---------- Validação de tudo que entra (formulário, backup, nuvem) ----------
 * Monta objetos NOVOS só com os campos conhecidos, no tipo certo e com
 * tamanho limitado. Assim um backup adulterado não consegue injetar código
 * na tela, quebrar as contas nem poluir objetos internos.
 */
const Saneamento = {
  texto(v, max = 200) {
    return typeof v === 'string' || typeof v === 'number'
      ? String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max)
      : '';
  },
  id(v) { return typeof v === 'string' && /^[a-z0-9]{6,40}$/i.test(v) ? v : null; },
  data(v) { return Hoje.valida(v) ? v : null; },
  valor(v) {
    const n = Number(v);
    return isFinite(n) && n >= 0 && n <= VALOR_MAXIMO ? Math.round(n * 100) / 100 : 0;
  },
  inteiro(v, min, max, padrao) {
    const n = Math.trunc(Number(v));
    return isFinite(n) && n >= min && n <= max ? n : padrao;
  },
  lista(v, opcoes, padrao) { return opcoes.includes(v) ? v : padrao; },
  carimbo(v) { return this.inteiro(v, 0, 4102444800000, 0); },

  config(c) {
    c = c && typeof c === 'object' ? c : {};
    return {
      nomeCfc: this.texto(c.nomeCfc, 80) || 'Autoescola ISLAND27',
      cnpj: this.texto(c.cnpj, 20),
      telefone: this.texto(c.telefone, 30),
      endereco: this.texto(c.endereco, 150),
      cidade: this.texto(c.cidade, 60),
      bloqueioMin: this.inteiro(c.bloqueioMin, 0, 240, 15),
      ultimoBackup: this.data(c.ultimoBackup),
      alteradoEm: this.carimbo(c.alteradoEm)
    };
  },

  aluno(a) {
    if (!a || typeof a !== 'object' || !this.id(a.id)) return null;
    const nome = this.texto(a.nome, 120);
    if (!nome) return null;
    return {
      id: a.id,
      numero: this.inteiro(a.numero, 1, 9999999, 0),
      nome,
      cpf: this.texto(a.cpf, 20),
      rg: this.texto(a.rg, 30),
      nascimento: this.data(a.nascimento),
      telefone: this.texto(a.telefone, 30),
      email: this.texto(a.email, 120),
      endereco: this.texto(a.endereco, 200),
      renach: this.texto(a.renach, 30),
      categoria: this.lista(a.categoria, CATEGORIAS, 'B'),
      servico: this.lista(a.servico, SERVICOS, 'Outro'),
      matricula: this.data(a.matricula) || Hoje.iso(),
      status: this.lista(a.status, STATUS, STATUS[0]),
      obs: this.texto(a.obs, 2000),
      criadoEm: this.data(a.criadoEm) || this.data(a.matricula) || Hoje.iso(),
      alteradoEm: this.carimbo(a.alteradoEm)
    };
  },

  parcela(p) {
    if (!p || typeof p !== 'object' || !this.id(p.id) || !this.id(p.alunoId)) return null;
    const vencimento = this.data(p.vencimento);
    if (!vencimento) return null;
    const pagoEm = this.data(p.pagoEm);
    return {
      id: p.id,
      alunoId: p.alunoId,
      numero: this.inteiro(p.numero, 0, 999, 0),
      descricao: this.texto(p.descricao, 100) || 'Cobrança',
      valor: this.valor(p.valor),
      vencimento,
      pagoEm,
      valorPago: pagoEm ? this.valor(p.valorPago) : null,
      forma: pagoEm ? this.lista(p.forma, FORMAS, 'Dinheiro') : null,
      obs: this.texto(p.obs, 300),
      origemId: this.id(p.origemId),            // restante de pagamento parcial: de qual parcela veio
      origemValor: this.id(p.origemId) ? this.valor(p.origemValor) : null, // valor que a parcela de origem ficou
      alteradoEm: this.carimbo(p.alteradoEm)
    };
  },

  estado(e) {
    e = e && typeof e === 'object' && !Array.isArray(e) ? e : {};
    const unicos = (lista, fn) => {
      const vistos = new Set();
      return (Array.isArray(lista) ? lista : []).map(x => fn.call(this, x)).filter(x => x && !vistos.has(x.id) && vistos.add(x.id));
    };
    const alunos = unicos(e.alunos, this.aluno);
    const idsAlunos = new Set(alunos.map(a => a.id));
    // Parcela de aluno que não existe é descartada.
    const parcelas = limparRestantes(unicos(e.parcelas, this.parcela).filter(p => idsAlunos.has(p.alunoId)));
    const excluidos = Object.create(null);
    if (e.excluidos && typeof e.excluidos === 'object') {
      Object.keys(e.excluidos).slice(0, 100000).forEach(k => {
        if (this.id(k)) excluidos[k] = this.carimbo(e.excluidos[k]);
      });
    }
    const maiorFicha = alunos.reduce((m, a) => Math.max(m, a.numero), 0);
    // Fichas sem número (backup antigo/estragado) ganham um número novo; repetidos são corrigidos.
    let prox = Math.max(this.inteiro(e.proximaFicha, 1, 9999999, 1), maiorFicha + 1);
    alunos.filter(a => !a.numero).forEach(a => { a.numero = prox++; });
    prox = Math.max(prox, corrigirNumeros(alunos) + 1);
    return { config: this.config(e.config), alunos, parcelas, excluidos, proximaFicha: prox };
  }
};

/* Um "restante" só vale enquanto a parcela de origem continuar com o valor
 * parcial que o gerou. Se outro aparelho recebeu a parcela inteira (ou o
 * pagamento parcial foi estornado), o restante pendente é descartado. */
function limparRestantes(parcelas) {
  const porId = new Map(parcelas.map(p => [p.id, p]));
  return parcelas.filter(p => {
    if (!p.origemId || p.pagoEm) return true;
    const origem = porId.get(p.origemId);
    return !origem || Dinheiro.centavos(origem.valor) === Dinheiro.centavos(p.origemValor);
  });
}

/* Duas fichas com o mesmo número (criadas ao mesmo tempo em dois aparelhos):
 * a mais nova ganha o próximo número livre. Todos os aparelhos chegam ao mesmo resultado. */
function corrigirNumeros(alunos) {
  const ordem = [...alunos].sort((a, b) => a.numero - b.numero || a.criadoEm.localeCompare(b.criadoEm) || a.id.localeCompare(b.id));
  let maior = alunos.reduce((m, a) => Math.max(m, a.numero), 0);
  const vistos = new Set();
  ordem.forEach(a => {
    if (vistos.has(a.numero)) a.numero = ++maior;
    vistos.add(a.numero);
  });
  return maior;
}

/* ---------- Junta duas versões (ex.: celular e PC) sem perder lançamentos ---------- */
function mesclarEstados(local, remoto) {
  const excluidos = Object.create(null);
  [local.excluidos, remoto.excluidos].forEach(ex => {
    Object.keys(ex).forEach(id => { excluidos[id] = Math.max(excluidos[id] || 0, ex[id]); });
  });
  const juntar = (a, b) => {
    const mapa = new Map();
    a.forEach(x => mapa.set(x.id, x));
    b.forEach(x => {
      const atual = mapa.get(x.id);
      if (!atual || x.alteradoEm > atual.alteradoEm) mapa.set(x.id, x);
    });
    return [...mapa.values()].filter(x => !(excluidos[x.id] >= x.alteradoEm));
  };
  const alunos = juntar(local.alunos, remoto.alunos).map(a => Object.assign({}, a));
  const ids = new Set(alunos.map(a => a.id));
  const maior = corrigirNumeros(alunos);
  return {
    config: remoto.config.alteradoEm > local.config.alteradoEm ? remoto.config : local.config,
    alunos,
    parcelas: limparRestantes(juntar(local.parcelas, remoto.parcelas).filter(p => ids.has(p.alunoId))),
    excluidos,
    proximaFicha: Math.max(local.proximaFicha, remoto.proximaFicha, maior + 1)
  };
}

/* ---------- Operações do dia a dia ---------- */
const Dados = {
  estado: Saneamento.estado(null),

  /* Avisa o cofre que algo mudou (ele salva em seguida). */
  salvar() { if (typeof Cofre !== 'undefined') Cofre.agendarSalvamento(); },

  novoId() {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return Date.now().toString(36) + Array.from(bytes, b => (b % 36).toString(36)).join('');
  },

  marcar(obj) { obj.alteradoEm = Math.max(Date.now(), (obj.alteradoEm || 0) + 1); return obj; },

  // ----- Fichas -----
  aluno(id) { return this.estado.alunos.find(a => a.id === id); },

  parcelasDoAluno(id) {
    return this.estado.parcelas
      .filter(p => p.alunoId === id)
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.numero - b.numero);
  },

  /* Cria a ficha e gera as parcelas do contrato. */
  criarFicha(campos, plano) {
    const ficha = Saneamento.aluno(Object.assign({}, campos, {
      id: this.novoId(), numero: this.estado.proximaFicha, criadoEm: Hoje.iso(), alteradoEm: Date.now()
    }));
    if (!ficha) throw new Error('Ficha inválida');
    this.estado.proximaFicha++;
    this.estado.alunos.push(ficha);
    this.gerarParcelas(ficha, plano).forEach(p => this.estado.parcelas.push(p));
    this.salvar();
    return ficha;
  },

  atualizarFicha(id, campos) {
    const atual = this.aluno(id);
    const novo = Saneamento.aluno(Object.assign({}, atual, campos, { id: atual.id, numero: atual.numero, criadoEm: atual.criadoEm }));
    if (!novo) throw new Error('Ficha inválida');
    Object.assign(atual, novo);
    this.marcar(atual);
    this.salvar();
  },

  excluirFicha(id) {
    const agora = Date.now();
    this.estado.excluidos[id] = agora;
    this.estado.parcelas.filter(p => p.alunoId === id).forEach(p => { this.estado.excluidos[p.id] = agora; });
    this.estado.alunos = this.estado.alunos.filter(a => a.id !== id);
    this.estado.parcelas = this.estado.parcelas.filter(p => p.alunoId !== id);
    this.salvar();
  },

  /*
   * plano = { total, desconto, entrada, entradaPaga, formaEntrada, parcelas, primeiroVencimento }
   * Divide (total - desconto - entrada) em parcelas mensais. Os centavos que
   * sobram da divisão vão para a última parcela.
   */
  gerarParcelas(ficha, plano) {
    const lista = [];
    const dataEntrada = ficha.matricula || Hoje.iso(); // a entrada é lançada na data da matrícula
    const agora = Date.now();
    const entrada = Dinheiro.centavos(plano.entrada);
    const restante = Dinheiro.centavos(plano.total) - Dinheiro.centavos(plano.desconto) - entrada;
    const forma = FORMAS.includes(plano.formaEntrada) ? plano.formaEntrada : 'Dinheiro';

    if (entrada > 0) {
      lista.push({
        id: this.novoId(), alunoId: ficha.id, numero: 0, descricao: 'Entrada',
        valor: entrada / 100, vencimento: dataEntrada,
        pagoEm: plano.entradaPaga ? dataEntrada : null,
        valorPago: plano.entradaPaga ? entrada / 100 : null,
        forma: plano.entradaPaga ? forma : null, obs: '', alteradoEm: agora
      });
    }

    // Nunca mais parcelas que centavos a dividir (evita parcelas de R$ 0,00).
    const n = Math.max(1, Math.min(Saneamento.inteiro(plano.parcelas, 1, MAX_PARCELAS, 1), restante));
    const primeiro = Hoje.valida(plano.primeiroVencimento) ? plano.primeiroVencimento : Hoje.iso();
    if (restante > 0) {
      const base = Math.floor(restante / n);
      for (let i = 1; i <= n; i++) {
        const valor = i === n ? restante - base * (n - 1) : base;
        lista.push({
          id: this.novoId(), alunoId: ficha.id, numero: i,
          descricao: n === 1 ? 'Parcela única' : `Parcela ${i}/${n}`,
          valor: valor / 100, vencimento: Hoje.somarMeses(primeiro, i - 1),
          pagoEm: null, valorPago: null, forma: null, obs: '', alteradoEm: agora
        });
      }
    }
    return lista;
  },

  // ----- Parcelas / pagamentos -----
  parcela(id) { return this.estado.parcelas.find(p => p.id === id); },

  novaCobranca(alunoId, descricao, valor, vencimento) {
    const p = Saneamento.parcela({
      id: this.novoId(), alunoId, numero: 99, descricao, valor, vencimento, alteradoEm: Date.now()
    });
    if (!p || !this.aluno(alunoId) || p.valor <= 0) throw new Error('Cobrança inválida');
    this.estado.parcelas.push(p);
    this.salvar();
    return p;
  },

  /*
   * Dá baixa numa parcela. Se o valor pago for menor que o valor da parcela,
   * a diferença vira uma nova parcela pendente com o mesmo vencimento.
   */
  receber(id, valorPago, data, forma, obs) {
    const p = this.parcela(id);
    if (!p || p.pagoEm) throw new Error('Parcela já paga ou inexistente');
    const pago = Dinheiro.centavos(Saneamento.valor(valorPago));
    if (pago <= 0 || !Hoje.valida(data)) throw new Error('Pagamento inválido');
    const devido = Dinheiro.centavos(p.valor);
    if (pago > devido) throw new Error('Valor acima do devido');
    if (pago < devido) {
      this.estado.parcelas.push({
        id: this.novoId(), alunoId: p.alunoId, numero: p.numero,
        descricao: Saneamento.texto(p.descricao.replace(/ \(restante\)$/, '') + ' (restante)', 100), valor: (devido - pago) / 100,
        vencimento: p.vencimento, pagoEm: null, valorPago: null, forma: null, obs: '',
        origemId: p.id, origemValor: pago / 100, alteradoEm: Date.now()
      });
      p.valor = pago / 100;
    }
    p.pagoEm = data;
    p.valorPago = pago / 100;
    p.forma = FORMAS.includes(forma) ? forma : 'Dinheiro';
    p.obs = Saneamento.texto(obs, 300);
    this.marcar(p);
    this.salvar();
  },

  /* Restante ainda pendente gerado por um pagamento parcial desta parcela. */
  restanteDe(id) {
    return this.estado.parcelas.find(r => r.origemId === id && !r.pagoEm);
  },

  /* Desfaz um pagamento (a parcela volta a ficar pendente). Se foi parcial,
   * o restante ainda em aberto volta para dentro da parcela original. */
  estornar(id) {
    const p = this.parcela(id);
    if (!p) return;
    const r = this.restanteDe(id);
    if (r) {
      p.valor = (Dinheiro.centavos(p.valor) + Dinheiro.centavos(r.valor)) / 100;
      this.estado.excluidos[r.id] = Date.now();
      this.estado.parcelas = this.estado.parcelas.filter(x => x.id !== r.id);
    }
    p.pagoEm = null; p.valorPago = null; p.forma = null;
    this.marcar(p);
    this.salvar();
  },

  excluirParcela(id) {
    this.estado.excluidos[id] = Date.now();
    this.estado.parcelas = this.estado.parcelas.filter(p => p.id !== id);
    this.salvar();
  },

  salvarConfig(campos) {
    const c = Saneamento.config(Object.assign({}, this.estado.config, campos));
    this.estado.config = this.marcar(c);
    this.salvar();
  },

  apagarTudo() {
    const agora = Date.now();
    this.estado.alunos.forEach(a => { this.estado.excluidos[a.id] = agora; });
    this.estado.parcelas.forEach(p => { this.estado.excluidos[p.id] = agora; });
    this.estado.alunos = [];
    this.estado.parcelas = [];
    this.salvar();
  },

  /* Troca tudo pelo conteúdo de um backup (já validado). */
  substituirPor(novo) {
    const agora = Date.now();
    const manter = new Set([...novo.alunos, ...novo.parcelas].map(x => x.id));
    [...this.estado.alunos, ...this.estado.parcelas].forEach(x => {
      if (!manter.has(x.id)) this.estado.excluidos[x.id] = agora;
    });
    [...novo.alunos, ...novo.parcelas].forEach(x => {
      x.alteradoEm = agora;
      delete this.estado.excluidos[x.id];
    });
    novo.config.alteradoEm = agora;
    this.estado = {
      config: novo.config, alunos: novo.alunos, parcelas: novo.parcelas,
      excluidos: this.estado.excluidos,
      proximaFicha: Math.max(novo.proximaFicha, this.estado.proximaFicha)
    };
    this.salvar();
  },

  /* Situação de uma parcela: pago, atrasado, hoje ou aberto. */
  situacao(p) {
    if (p.pagoEm) return 'pago';
    const hoje = Hoje.iso();
    if (p.vencimento < hoje) return 'atrasado';
    if (p.vencimento === hoje) return 'hoje';
    return 'aberto';
  },

  resumoAluno(id) {
    const ps = this.parcelasDoAluno(id);
    const pagas = ps.filter(p => p.pagoEm);
    // Aluno cancelado não deve mais nada: as parcelas pendentes deixam de ser cobradas.
    const cancelado = (this.aluno(id) || {}).status === 'Cancelado';
    const pendentes = cancelado ? [] : ps.filter(p => !p.pagoEm);
    return {
      cancelado,
      total: Dinheiro.somar(cancelado ? pagas : ps, 'valor'),
      pago: Dinheiro.somar(pagas, 'valorPago'),
      aberto: Dinheiro.somar(pendentes, 'valor'),
      atrasadas: pendentes.filter(p => this.situacao(p) === 'atrasado').length,
      quantidade: ps.length
    };
  }
};
