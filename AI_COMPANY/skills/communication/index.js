'use strict';
/*
 * SKILL communication — escrever mensagens objetivas, com contexto, erros e
 * limitações explícitos, sempre no protocolo padrão (orchestration/protocolo.js).
 */
const { SEM_DADOS, REVISAR } = require('../../orchestration/definicoes');

/* Nome de cada campo como uma pessoa fala. */
const ROTULOS = {
  nome: 'nome', cpf: 'CPF', rg: 'RG', nascimento: 'data de nascimento', telefone: 'telefone', email: 'e-mail',
  endereco: 'endereço', categoria: 'categoria', servico: 'serviço', valor_total: 'valor total', desconto: 'desconto',
  entrada: 'entrada', forma_entrada: 'forma de pagamento da entrada', parcelas: 'número de parcelas', primeiro_vencimento: '1º vencimento'
};
const rotulo = c => ROTULOS[c] || c;

/* Texto curto para pedir dados que faltam — sem supor valores. */
function pedidoDeDados({ faltando = [], invalidos = [], conflitos = [], ambiguos = [] }) {
  const p = [];
  if (faltando.length) p.push(`${SEM_DADOS} Faltam: ${faltando.map(rotulo).join(', ')}.`);
  invalidos.forEach(i => p.push(`${rotulo(i.campo)}: ${i.motivo}`));
  conflitos.forEach(c => p.push(`${REVISAR} ${rotulo(c.campo)} aparece com valores diferentes: ${c.valores.join(' x ')}.`));
  ambiguos.forEach(a => p.push(`${REVISAR} ${rotulo(a.campo)} "${a.valor}" pode ser mais de uma coisa. Opções: ${a.opcoes.join(', ')}.`));
  return p;
}

/* Erro no formato que o CEO espera receber. */
function erro({ nivel, descricao, causa, recuperacao = null }) {
  return { nivel, descricao, causa, recuperacao };
}

module.exports = { pedidoDeDados, erro, rotulo, SEM_DADOS, REVISAR };
