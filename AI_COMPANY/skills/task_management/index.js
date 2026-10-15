'use strict';
/* SKILL task_management — organizar tarefas e escolher o agente mais adequado. */

const PESO_PRIORIDADE = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
const LIMITE_CARGA = 5; // tarefas abertas a partir das quais o agente é considerado sobrecarregado

/*
 * Pontua um candidato. Critérios (na ordem do pedido):
 *  especialização (palavras-chave que batem), disponibilidade (ACTIVE),
 *  prioridade e carga (tarefas abertas pesadas pela prioridade), histórico (taxa de sucesso).
 */
function avaliarCandidato({ agente, especializacao, palavras = [], disponivel, status, carga = [], concluidas = 0, falhas = 0 }) {
  const pesoCarga = carga.reduce((s, t) => s + (PESO_PRIORIDADE[t.prioridade] || 1), 0);
  const total = concluidas + falhas;
  const desempenho = total ? concluidas / total : 1; // sem histórico: não penaliza
  const sobrecarregado = carga.length >= LIMITE_CARGA;
  const pontuacao = disponivel ? especializacao * 10 - pesoCarga * 1.5 + desempenho * 5 - (sobrecarregado ? 20 : 0) : -Infinity;
  return {
    agente, especializacao, disponivel, status, carga: carga.length, desempenho: Math.round(desempenho * 100) / 100,
    sobrecarregado, pontuacao,
    explicacao: `${agente}: especialização ${especializacao} (${palavras.join(', ') || '—'}), ${disponivel ? 'disponível' : 'indisponível: ' + status}, ` +
      `${carga.length} tarefa(s) aberta(s), desempenho ${Math.round(desempenho * 100)}%${sobrecarregado ? ', SOBRECARREGADO' : ''}`
  };
}

/* CRITICAL > HIGH > MEDIUM > LOW; empate: quem chegou primeiro. */
function ordenarPorPrioridade(lista) {
  return [...lista].sort((a, b) => (PESO_PRIORIDADE[b.prioridade] || 0) - (PESO_PRIORIDADE[a.prioridade] || 0) ||
    String(a.criada_em).localeCompare(String(b.criada_em)) || String(a.task_id).localeCompare(String(b.task_id)));
}

module.exports = { avaliarCandidato, ordenarPorPrioridade, LIMITE_CARGA, PESO_PRIORIDADE };
