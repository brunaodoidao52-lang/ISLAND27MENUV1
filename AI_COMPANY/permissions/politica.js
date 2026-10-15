'use strict';
/*
 * politica.js — quem pode fazer o quê.
 *
 * PRINCÍPIO DE SEGURANÇA: nenhum agente tem acesso irrestrito por ser IA.
 * Cada agente recebe só as permissões e ferramentas listadas na própria ficha,
 * e toda ação passa por `exigir()` antes de acontecer.
 */
const { AGENTE_HUMANO } = require('../orchestration/definicoes');

const PERMISSOES = {
  READ: 'Ler tarefas, mensagens e dados de entrada da própria tarefa.',
  WRITE: 'Registrar resultados e a memória do próprio agente.',
  ANALYZE: 'Analisar dados recebidos e produzir conclusões fundamentadas.',
  CREATE_TASK: 'Criar tarefas novas.',
  DELEGATE: 'Atribuir e redistribuir tarefas entre agentes.',
  APPROVE: 'Validar o resultado de um agente (REVIEW → COMPLETED). Não substitui a aprovação humana.',
  EXECUTE: 'Executar uma operação registrada (operações críticas exigem aprovação humana).',
  REPORT: 'Produzir relatórios e mensagens de status.',
  AUDIT: 'Ler o histórico completo e verificar conformidade.',
  HUMAN_APPROVE: 'Aprovar ou negar ações que exigem decisão humana. Exclusiva do proprietário.'
};

/* Ferramentas desta etapa. Nenhuma acessa site, rede ou sistema externo. */
const FERRAMENTAS = {
  NONE: { descricao: 'Nenhuma ferramenta.', claude: [] },
  LER_ENTRADA: { descricao: 'Ler os dados de entrada entregues na própria tarefa.', claude: ['Read', 'Glob', 'Grep'] },
  LIVRO_LANCAMENTOS: { descricao: 'Consultar e gravar no livro interno de lançamentos (tasks/dados/lancamentos.json).', claude: [] },
  REGISTRO_TAREFAS: { descricao: 'Usar o programa da organização (node AI_COMPANY/empresa.js).', claude: ['Bash'] },
  DELEGAR_AGENTES: { descricao: 'Acionar subagentes especialistas.', claude: ['Agent'] },
  LER_HISTORICO: { descricao: 'Ler logs de auditoria e o registro de tarefas (somente leitura).', claude: [] }
};

/* HUMAN APPROVAL REQUIRED — categorias que obrigam o agente a parar e pedir aprovação. */
const CATEGORIAS_APROVACAO = {
  risco_elevado: 'Risco elevado',
  irreversivel: 'Decisão irreversível',
  informacao_critica: 'Informação crítica',
  alteracao_importante: 'Alteração importante',
  financeira: 'Decisão financeira',
  exclusao: 'Exclusão',
  prejudicial: 'Ação potencialmente prejudicial'
};

/* Palavras que fazem o CEO marcar uma tarefa para aprovação humana automaticamente. */
const GATILHOS_APROVACAO = {
  financeira: /\b(pagamento|pagar|desconto|estorn|reembols|multa|pre[cç]o|valor|parcela|cobran[cç]a|financeir|lan[cç]amento)/i,
  exclusao: /\b(exclu|apag|delet|remov)/i,
  irreversivel: /\b(irrevers|definitiv|permanente)/i,
  alteracao_importante: /\b(alterar contrato|mudar regra|alterar regra|cancelar matr[ií]cula)/i,
  informacao_critica: /\b(cpf|rg\b|senha|dados pessoais|documento)/i
};

/* Que permissão cada ação do protocolo exige de quem a envia. */
const ACOES = {
  DELEGATE: 'DELEGATE',
  HANDOFF: 'WRITE',
  REPORT: 'REPORT',
  RESULT: 'REPORT',
  STATUS_UPDATE: 'READ',
  ERROR_REPORT: 'READ',
  REQUEST_APPROVAL: 'READ',
  REQUEST_CORRECTION: 'APPROVE',
  VALIDATE: 'APPROVE',
  AUDIT_REQUEST: 'DELEGATE',
  AUDIT_RESULT: 'AUDIT'
};

class SemPermissao extends Error {
  constructor(msg) { super(msg); this.codigo = 'SEM_PERMISSAO'; this.nivel = 'HIGH'; }
}

function permissoesDe(ficha) {
  if (ficha === AGENTE_HUMANO) return Object.keys(PERMISSOES);
  return (ficha && ficha.PERMISSIONS) || [];
}

function tem(ficha, permissao) { return permissoesDe(ficha).includes(permissao); }

/* Lança SemPermissao (e o chamador registra no log) se o agente não tiver a permissão. */
function exigir(ficha, permissao, contexto = '') {
  if (!tem(ficha, permissao)) {
    const quem = ficha === AGENTE_HUMANO ? AGENTE_HUMANO : (ficha && ficha.AGENT_ID) || 'desconhecido';
    throw new SemPermissao(`Agente "${quem}" não tem a permissão ${permissao}${contexto ? ' para ' + contexto : ''}.`);
  }
}

function ferramentasDe(ficha) {
  const t = ficha.TOOLS;
  return Array.isArray(t) ? t : [t];
}

function exigirFerramenta(ficha, ferramenta) {
  if (!ferramentasDe(ficha).includes(ferramenta)) {
    throw new SemPermissao(`Agente "${ficha.AGENT_ID}" não tem acesso à ferramenta ${ferramenta}.`);
  }
}

/* Detecta categorias de aprovação pelo texto do pedido. */
function categoriasPorTexto(texto) {
  return Object.entries(GATILHOS_APROVACAO).filter(([, re]) => re.test(texto || '')).map(([c]) => c);
}

module.exports = {
  PERMISSOES, FERRAMENTAS, CATEGORIAS_APROVACAO, GATILHOS_APROVACAO, ACOES,
  SemPermissao, permissoesDe, tem, exigir, ferramentasDe, exigirFerramenta, categoriasPorTexto
};
