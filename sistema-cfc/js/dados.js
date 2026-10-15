/*
 * dados.js — onde as informações ficam guardadas.
 *
 * Tudo é salvo no próprio navegador (localStorage). Use "Configurações > Baixar
 * cópia de segurança" para guardar um arquivo e não perder nada.
 *
 * Estrutura:
 *   alunos   -> as fichas (dados pessoais + contrato)
 *   parcelas -> cada cobrança do aluno (entrada, mensalidades, taxas avulsas)
 *               uma parcela com "pagoEm" preenchido é um pagamento realizado;
 *               sem "pagoEm" é um pagamento pendente.
 */

const CHAVE = 'island27-cfc-v1';

const SERVICOS = ['Primeira habilitação', 'Adição de categoria', 'Mudança de categoria', 'Reciclagem', 'Renovação', 'Aulas avulsas', 'Outro'];
const CATEGORIAS = ['A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE'];
const FORMAS = ['Dinheiro', 'PIX', 'Cartão de débito', 'Cartão de crédito', 'Boleto', 'Transferência'];

const Dados = {
  estado: null,

  carregar() {
    let salvo = null;
    try { salvo = JSON.parse(localStorage.getItem(CHAVE)); } catch (e) { salvo = null; }
    this.estado = Object.assign({
      config: { nomeCfc: 'Autoescola ISLAND27', cnpj: '', telefone: '', endereco: '', cidade: '' },
      alunos: [],
      parcelas: [],
      proximaFicha: 1
    }, salvo || {});
  },

  salvar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(this.estado));
    } catch (e) {
      UI.aviso('Não foi possível salvar no navegador. Baixe uma cópia de segurança.', true);
    }
  },

  novoId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

  // ----- Alunos / fichas -----
  aluno(id) { return this.estado.alunos.find(a => a.id === id); },

  parcelasDoAluno(id) {
    return this.estado.parcelas
      .filter(p => p.alunoId === id)
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.numero - b.numero);
  },

  /* Cria a ficha e gera as parcelas do contrato. */
  criarFicha(ficha, plano) {
    ficha.id = this.novoId();
    ficha.numero = this.estado.proximaFicha++;
    ficha.criadoEm = Hoje.iso();
    this.estado.alunos.push(ficha);
    this.gerarParcelas(ficha, plano).forEach(p => this.estado.parcelas.push(p));
    this.salvar();
    return ficha;
  },

  atualizarFicha(id, campos) {
    Object.assign(this.aluno(id), campos);
    this.salvar();
  },

  excluirFicha(id) {
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
    const hoje = ficha.matricula || Hoje.iso(); // a entrada é lançada na data da matrícula
    const entrada = Dinheiro.centavos(plano.entrada);
    const restante = Dinheiro.centavos(plano.total) - Dinheiro.centavos(plano.desconto) - entrada;

    if (entrada > 0) {
      lista.push({
        id: this.novoId(), alunoId: ficha.id, numero: 0, descricao: 'Entrada',
        valor: entrada / 100, vencimento: hoje,
        pagoEm: plano.entradaPaga ? hoje : null,
        valorPago: plano.entradaPaga ? entrada / 100 : null,
        forma: plano.entradaPaga ? plano.formaEntrada : null, obs: ''
      });
    }

    const n = Math.max(1, parseInt(plano.parcelas, 10) || 1);
    if (restante > 0) {
      const base = Math.floor(restante / n);
      for (let i = 1; i <= n; i++) {
        const valor = i === n ? restante - base * (n - 1) : base;
        lista.push({
          id: this.novoId(), alunoId: ficha.id, numero: i,
          descricao: n === 1 ? 'Parcela única' : `Parcela ${i}/${n}`,
          valor: valor / 100, vencimento: Hoje.somarMeses(plano.primeiroVencimento || hoje, i - 1),
          pagoEm: null, valorPago: null, forma: null, obs: ''
        });
      }
    }
    return lista;
  },

  // ----- Parcelas / pagamentos -----
  parcela(id) { return this.estado.parcelas.find(p => p.id === id); },

  novaCobranca(alunoId, descricao, valor, vencimento) {
    const p = {
      id: this.novoId(), alunoId, numero: 99, descricao,
      valor: Number(valor), vencimento, pagoEm: null, valorPago: null, forma: null, obs: ''
    };
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
    const pago = Dinheiro.centavos(valorPago);
    const devido = Dinheiro.centavos(p.valor);
    if (pago > 0 && pago < devido) {
      this.estado.parcelas.push({
        id: this.novoId(), alunoId: p.alunoId, numero: p.numero,
        descricao: p.descricao + ' (restante)', valor: (devido - pago) / 100,
        vencimento: p.vencimento, pagoEm: null, valorPago: null, forma: null, obs: ''
      });
      p.valor = pago / 100;
    }
    p.pagoEm = data;
    p.valorPago = pago / 100;
    p.forma = forma;
    p.obs = obs || '';
    this.salvar();
  },

  /* Desfaz um pagamento (a parcela volta a ficar pendente). */
  estornar(id) {
    const p = this.parcela(id);
    p.pagoEm = null; p.valorPago = null; p.forma = null;
    this.salvar();
  },

  excluirParcela(id) {
    this.estado.parcelas = this.estado.parcelas.filter(p => p.id !== id);
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
    const total = ps.reduce((s, p) => s + p.valor, 0);
    const pago = ps.filter(p => p.pagoEm).reduce((s, p) => s + (p.valorPago || 0), 0);
    const pendentes = ps.filter(p => !p.pagoEm);
    return {
      total, pago,
      aberto: pendentes.reduce((s, p) => s + p.valor, 0),
      atrasadas: pendentes.filter(p => this.situacao(p) === 'atrasado').length,
      quantidade: ps.length
    };
  }
};

/* Ajudantes de data (sempre no formato AAAA-MM-DD). */
const Hoje = {
  iso(d = new Date()) {
    const z = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
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
    if (!iso) return '';
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  },
  diasEntre(de, ate) {
    const [a1, m1, d1] = de.split('-').map(Number);
    const [a2, m2, d2] = ate.split('-').map(Number);
    return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
  }
};

/* Ajudantes de dinheiro. */
const Dinheiro = {
  fmt: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }),
  br(v) { return this.fmt.format(Number(v) || 0); },
  centavos(v) { return Math.round((Number(String(v).replace(',', '.')) || 0) * 100); },
  /* Lê "1.234,56", "1234,56" ou "1234.56" digitado pelo usuário. */
  ler(texto) {
    let s = String(texto || '').trim().replace(/[R$\s]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }
};
