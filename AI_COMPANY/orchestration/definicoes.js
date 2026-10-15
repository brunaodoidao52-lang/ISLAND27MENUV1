'use strict';
/*
 * definicoes.js — vocabulário fixo da organização de agentes.
 * Tudo que é "lista oficial" (status, prioridades, permissões, ferramentas,
 * categorias de aprovação humana) mora aqui, num lugar só.
 */
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');

/* Status de tarefa */
const STATUS = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'REVIEW', 'COMPLETED', 'ERROR', 'CANCELLED', 'BLOCKED'];
const FINAIS = ['COMPLETED', 'CANCELLED'];

/* Caminhos permitidos entre status. COMPLETED só a partir de REVIEW (validação do CEO). */
const TRANSICOES = {
  PENDING: ['ASSIGNED', 'BLOCKED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'PENDING', 'WAITING', 'ERROR', 'BLOCKED', 'CANCELLED'],
  IN_PROGRESS: ['ASSIGNED', 'WAITING', 'REVIEW', 'ERROR', 'BLOCKED', 'CANCELLED'],
  WAITING: ['IN_PROGRESS', 'ASSIGNED', 'ERROR', 'BLOCKED', 'CANCELLED'],
  BLOCKED: ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
  ERROR: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
  REVIEW: ['COMPLETED', 'IN_PROGRESS', 'ASSIGNED', 'ERROR', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: []
};

/* Status de agente no registro */
const STATUS_AGENTE = ['ACTIVE', 'INACTIVE', 'PAUSED', 'ERROR'];

const PRIORIDADES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const NIVEIS_ERRO = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const AGENTE_HUMANO = 'proprietario';

/* As 7 perguntas obrigatórias antes de finalizar uma tarefa (SISTEMA DE QUALIDADE). */
const CHECKLIST_QUALIDADE = {
  objetivo_cumprido: 'O objetivo foi cumprido?',
  dados_completos: 'Os dados estão completos?',
  sem_inconsistencias: 'Não existem inconsistências?',
  sem_erros: 'Não existem erros?',
  fundamentada: 'A resposta está fundamentada?',
  nada_faltando: 'Não falta nenhuma informação?',
  pode_concluir: 'A tarefa pode ser considerada concluída?'
};

/* Frases padrão do PRINCÍPIO DE NÃO INVENÇÃO */
const SEM_DADOS = 'Não tenho dados suficientes.';
const REVISAR = 'Necessário revisar.';

module.exports = {
  RAIZ, STATUS, FINAIS, TRANSICOES, STATUS_AGENTE, PRIORIDADES, NIVEIS_ERRO,
  AGENTE_HUMANO, CHECKLIST_QUALIDADE, SEM_DADOS, REVISAR
};
