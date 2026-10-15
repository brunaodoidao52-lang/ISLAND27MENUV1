'use strict';
/*
 * SKILL document_analysis — transformar o texto de uma ficha/documento em
 * campos estruturados e apontar o que falta, o que é inválido, o que se
 * contradiz e o que é ambíguo. Nunca preenche nada por conta própria.
 *
 * Entrada aceita: texto com linhas "campo: valor" ou um objeto { campo: valor }.
 */

const CAMPOS = {
  nome: ['nome', 'nome completo', 'aluno', 'nome do aluno'],
  cpf: ['cpf'],
  rg: ['rg', 'identidade'],
  nascimento: ['nascimento', 'data de nascimento', 'data nascimento', 'nasc'],
  telefone: ['telefone', 'celular', 'whatsapp', 'fone', 'tel'],
  email: ['email', 'e-mail'],
  endereco: ['endereco', 'endereço'],
  categoria: ['categoria', 'cat'],
  servico: ['servico', 'serviço', 'processo', 'tipo de processo'],
  valor_total: ['valor total', 'total', 'valor', 'preco', 'preço'],
  desconto: ['desconto'],
  entrada: ['entrada', 'sinal'],
  forma_entrada: ['forma da entrada', 'forma de pagamento da entrada', 'forma entrada', 'forma de pagamento'],
  parcelas: ['parcelas', 'numero de parcelas', 'nº de parcelas', 'n de parcelas', 'qtd parcelas'],
  primeiro_vencimento: ['primeiro vencimento', '1º vencimento', '1o vencimento', 'vencimento']
};
const OBRIGATORIOS = ['nome', 'cpf', 'categoria', 'servico', 'valor_total'];
const CATEGORIAS = ['A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE'];
const SERVICOS = ['Primeira habilitação', 'Adição de categoria', 'Mudança de categoria', 'Reciclagem', 'Renovação', 'Aulas avulsas'];
const FORMAS = ['Dinheiro', 'PIX', 'Cartão de débito', 'Cartão de crédito', 'Boleto', 'Transferência'];

const normal = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const ALIAS = new Map();
Object.entries(CAMPOS).forEach(([campo, nomes]) => nomes.forEach(n => ALIAS.set(normal(n), campo)));

function cpfValido(cpf) {
  const d = String(cpf).replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dig = n => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dig(9) === Number(d[9]) && dig(10) === Number(d[10]);
}

/* dd/mm/aaaa ou aaaa-mm-dd → aaaa-mm-dd (ou null se a data não existe). */
function data(v) {
  const s = String(v).trim();
  let a, m, d;
  let r = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (r) [, d, m, a] = r.map(Number); else if ((r = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) [, a, m, d] = r.map(Number); else return null;
  const dt = new Date(a, m - 1, d);
  if (dt.getFullYear() !== a || dt.getMonth() !== m - 1 || dt.getDate() !== d || a < 1900 || a > 2200) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/* "2.500,00", "2.500", "2500.5", "R$ 1.234,56" → número; inválido → null. */
function dinheiro(v) {
  let s = String(v).trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100) / 100;
}

function escolha(valor, lista) {
  const n = normal(valor);
  const exatos = lista.filter(x => normal(x) === n);
  if (exatos.length === 1) return { valor: exatos[0] };
  const parciais = lista.filter(x => normal(x).includes(n) || n.includes(normal(x)));
  if (parciais.length === 1 && n.length >= 4) return { valor: parciais[0] };
  return { ambiguo: true, opcoes: parciais.length ? parciais : lista };
}

/* Lê as linhas "campo: valor". Campo repetido com valor diferente vira conflito. */
function lerPares(entrada) {
  const pares = [];
  if (entrada && typeof entrada === 'object' && !Array.isArray(entrada)) {
    Object.entries(entrada).forEach(([k, v], i) => pares.push({ chave: k, valor: v, linha: i + 1 }));
  } else {
    String(entrada || '').split(/\r?\n/).forEach((l, i) => {
      const m = l.match(/^\s*([^:=]{1,40})\s*[:=]\s*(.*)$/);
      if (m) pares.push({ chave: m[1], valor: m[2].trim(), linha: i + 1 });
    });
  }
  return pares;
}

function analisarFicha(entrada) {
  const campos = {}; const fontes = []; const desconhecidos = [];
  const conflitos = []; const invalidos = []; const ambiguos = []; const avisos = [];
  lerPares(entrada).forEach(({ chave, valor, linha }) => {
    const campo = ALIAS.get(normal(chave));
    if (!campo) { desconhecidos.push(chave); return; }
    if (valor === '' || valor === null || valor === undefined) return;
    if (campo in campos && normal(campos[campo]) !== normal(valor)) {
      conflitos.push({ campo, valores: [campos[campo], valor] });
      return;
    }
    campos[campo] = typeof valor === 'string' ? valor.trim() : valor;
    fontes.push(`linha ${linha}: ${chave}`);
  });

  const ficha = {};
  if (campos.nome) {
    const nome = String(campos.nome).replace(/\s+/g, ' ').trim();
    if (nome.length < 5 || !/\s/.test(nome) || /\d/.test(nome)) invalidos.push({ campo: 'nome', motivo: 'Informe nome e sobrenome, sem números.' });
    else ficha.nome = nome;
  }
  if (campos.cpf) {
    if (cpfValido(campos.cpf)) ficha.cpf = String(campos.cpf).replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    else invalidos.push({ campo: 'cpf', motivo: 'CPF inválido (dígitos verificadores não conferem).' });
  }
  if (campos.rg) ficha.rg = String(campos.rg).trim();
  if (campos.nascimento) {
    const d = data(campos.nascimento);
    if (!d) invalidos.push({ campo: 'nascimento', motivo: 'Data inexistente ou fora do formato dd/mm/aaaa.' });
    else if (d > new Date().toISOString().slice(0, 10)) invalidos.push({ campo: 'nascimento', motivo: 'Data de nascimento no futuro.' });
    else {
      ficha.nascimento = d;
      const idade = (Date.now() - Date.parse(d)) / (365.25 * 86400000);
      if (idade < 18) avisos.push('Aluno com menos de 18 anos pela data informada. Necessário revisar.');
    }
  }
  if (campos.telefone) {
    const dig = String(campos.telefone).replace(/\D/g, '');
    if (dig.length < 10 || dig.length > 11) invalidos.push({ campo: 'telefone', motivo: 'Telefone deve ter DDD + número (10 ou 11 dígitos).' });
    else ficha.telefone = dig;
  }
  if (campos.email) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(campos.email)) ficha.email = String(campos.email).trim();
    else invalidos.push({ campo: 'email', motivo: 'E-mail em formato inválido.' });
  }
  if (campos.endereco) ficha.endereco = String(campos.endereco).trim();
  [['categoria', CATEGORIAS], ['servico', SERVICOS], ['forma_entrada', FORMAS]].forEach(([c, lista]) => {
    if (!campos[c]) return;
    const r = escolha(campos[c], lista);
    if (r.ambiguo) ambiguos.push({ campo: c, valor: campos[c], opcoes: r.opcoes });
    else ficha[c] = r.valor;
  });
  ['valor_total', 'desconto', 'entrada'].forEach(c => {
    if (campos[c] === undefined) return;
    const v = dinheiro(campos[c]);
    if (v === null) invalidos.push({ campo: c, motivo: 'Valor em formato inválido (use 2.500,00).' });
    else ficha[c] = v;
  });
  if (campos.parcelas !== undefined) {
    const n = Number(String(campos.parcelas).replace(/x$/i, ''));
    if (!Number.isInteger(n) || n < 1 || n > 60) invalidos.push({ campo: 'parcelas', motivo: 'Número de parcelas deve ser de 1 a 60.' });
    else ficha.parcelas = n;
  }
  if (campos.primeiro_vencimento) {
    const d = data(campos.primeiro_vencimento);
    if (!d) invalidos.push({ campo: 'primeiro_vencimento', motivo: 'Data inexistente ou fora do formato.' });
    else ficha.primeiro_vencimento = d;
  }
  const faltando = OBRIGATORIOS.filter(c => !(c in campos));
  return { ficha, faltando, invalidos, conflitos, ambiguos, avisos, desconhecidos, fontes };
}

module.exports = { analisarFicha, cpfValido, data, dinheiro, OBRIGATORIOS, CATEGORIAS, SERVICOS, FORMAS };
