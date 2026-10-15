'use strict';
/*
 * SKILL communication — escrever mensagens objetivas, com contexto, erros e
 * limitações explícitos, sempre no protocolo padrão (orchestration/protocolo.js).
 */
const { SEM_DADOS, REVISAR } = require('../../orchestration/definicoes');

/* Texto curto para pedir dados que faltam — sem supor valores. */
function pedidoDeDados({ faltando = [], invalidos = [], conflitos = [], ambiguos = [] }) {
  const p = [];
  if (faltando.length) p.push(`${SEM_DADOS} Faltam: ${faltando.join(', ')}.`);
  invalidos.forEach(i => p.push(`${i.campo}: ${i.motivo}`));
  conflitos.forEach(c => p.push(`${REVISAR} "${c.campo}" aparece com valores diferentes: ${c.valores.join(' x ')}.`));
  ambiguos.forEach(a => p.push(`${REVISAR} "${a.campo}" = "${a.valor}" é ambíguo. Opções: ${a.opcoes.join(', ')}.`));
  return p;
}

/* Erro no formato que o CEO espera receber. */
function erro({ nivel, descricao, causa, recuperacao = null }) {
  return { nivel, descricao, causa, recuperacao };
}

module.exports = { pedidoDeDados, erro, SEM_DADOS, REVISAR };
