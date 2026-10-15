'use strict';
/*
 * tarefas.js — motor de tarefas da organização.
 *
 * Regras garantidas aqui (não só escritas nos prompts):
 *  - Toda tarefa tem TASK_ID único TASK-AAAAMMDD-XXXX e ele nunca muda.
 *  - Status só muda pelos caminhos permitidos (definicoes.TRANSICOES).
 *  - Duplicidade: o mesmo pedido não vira duas tarefas.
 *  - Operação crítica nunca roda duas vezes (mesmo após falha de comunicação).
 *  - HUMAN APPROVAL REQUIRED: o agente para e espera o proprietário.
 *  - COMPLETED só com a checagem de qualidade das 7 perguntas, feita pelo CEO.
 *  - Toda mudança vai para o log de auditoria.
 */
const crypto = require('crypto');
const armazem = require('./armazem');
const registro = require('./registro');
const auditoria = require('../logs/auditoria');
const memoria = require('../memory/memoria');
const politica = require('../permissions/politica');
const { STATUS, FINAIS, TRANSICOES, PRIORIDADES, NIVEIS_ERRO, AGENTE_HUMANO, CHECKLIST_QUALIDADE } = require('./definicoes');

const ARQ = 'tasks/dados/tarefas.json';
const ARQ_CONTADOR = 'tasks/dados/contador.json';

class ErroTarefa extends Error {
  constructor(msg, codigo = 'TAREFA_INVALIDA', nivel = 'MEDIUM') { super(msg); this.codigo = codigo; this.nivel = nivel; }
}

const agora = () => new Date().toISOString();
const quem = f => (f === AGENTE_HUMANO ? AGENTE_HUMANO : f.AGENT_ID);
const fichaDe = id => {
  const f = registro.ficha(id);
  if (!f) throw new ErroTarefa(`Agente inexistente: ${id}`, 'AGENTE_INEXISTENTE', 'HIGH');
  return f;
};

/* JSON com chaves em ordem — dois objetos iguais geram o mesmo texto. */
function canonico(v) {
  if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonico(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
const hash = v => crypto.createHash('sha256').update(canonico(v)).digest('hex');

function lerTodas() { return armazem.lerJSON(ARQ, {}); }
function salvarTodas(t) { armazem.gravarJSON(ARQ, t); }

function obter(taskId) {
  const t = lerTodas()[taskId];
  if (!t) throw new ErroTarefa(`Tarefa não encontrada: ${taskId}`, 'TAREFA_INEXISTENTE');
  return t;
}

/* Abre a tarefa com trava, aplica fn e salva. */
function alterar(taskId, fn) {
  return armazem.comTrava(() => {
    const todas = lerTodas();
    const t = todas[taskId];
    if (!t) throw new ErroTarefa(`Tarefa não encontrada: ${taskId}`, 'TAREFA_INEXISTENTE');
    const r = fn(t, todas);
    t.atualizada_em = agora();
    salvarTodas(todas);
    return r === undefined ? t : r;
  });
}

/* TASK-AAAAMMDD-XXXX: contador por dia, guardado em disco. */
function novoId(data = new Date()) {
  const z = n => String(n).padStart(2, '0');
  const dia = `${data.getFullYear()}${z(data.getMonth() + 1)}${z(data.getDate())}`;
  return armazem.comTrava(() => {
    const c = armazem.lerJSON(ARQ_CONTADOR, {});
    const n = (c[dia] || 0) + 1;
    if (n > 9999) throw new ErroTarefa('Limite de 9999 tarefas por dia atingido.', 'LIMITE', 'HIGH');
    c[dia] = n;
    armazem.gravarJSON(ARQ_CONTADOR, c);
    return `TASK-${dia}-${String(n).padStart(4, '0')}`;
  });
}

const ID_VALIDO = /^TASK-\d{8}-\d{4}$/;

function mudarStatus(t, para, por, motivo = '') {
  if (!STATUS.includes(para)) throw new ErroTarefa(`Status inválido: ${para}`);
  if (t.status === para) return;
  if (!TRANSICOES[t.status].includes(para)) {
    throw new ErroTarefa(`Mudança de status não permitida: ${t.status} → ${para} (${t.task_id})`, 'TRANSICAO_INVALIDA');
  }
  t.historico.push({ em: agora(), de: t.status, para, por, motivo });
  auditoria.registrar({ task_id: t.task_id, agente: por, acao: 'STATUS', entrada: { de: t.status, motivo }, saida: { para }, status: para });
  t.status = para;
  if (FINAIS.includes(para)) {
    memoria.descartarTarefa(t.task_id, por);
    if (para === 'COMPLETED') new Set(t.etapas.filter(e => e.status === 'CONCLUIDA').map(e => e.agente)).forEach(a => registro.anotarAtividade(a, { concluida: true }));
  }
}

// ---------------------------------------------------------------- criar
/*
 * dados = { titulo, descricao, tipo, entrada, prioridade, solicitante, pai, prazo,
 *           categorias_aprovacao, aprovacao_no_inicio, chave_duplicidade, etapas: [agente,...] }
 * Devolve { tarefa, duplicada }.
 */
function criar(fichaPor, dados) {
  politica.exigir(fichaPor, 'CREATE_TASK', 'criar tarefa');
  if (!dados || !dados.titulo || String(dados.titulo).trim().length < 3) throw new ErroTarefa('Tarefa sem título (objetivo) claro.', 'ENTRADA_INCOMPLETA');
  const prioridade = dados.prioridade || 'MEDIUM';
  if (!PRIORIDADES.includes(prioridade)) throw new ErroTarefa(`Prioridade inválida: ${prioridade}`, 'ENTRADA_INVALIDA');
  if (dados.prazo && isNaN(Date.parse(dados.prazo))) throw new ErroTarefa('Prazo inválido (use AAAA-MM-DD ou data/hora ISO).', 'ENTRADA_INVALIDA');
  (dados.etapas || []).forEach(a => fichaDe(a));
  const entrada = dados.entrada || {};
  const tipo = dados.tipo || 'GERAL';
  const chave = dados.chave_duplicidade || hash({ tipo, entrada, titulo: String(dados.titulo).trim().toLowerCase(), pai: dados.pai || null });
  const categorias = [...new Set([...(dados.categorias_aprovacao || []), ...politica.categoriasPorTexto(`${dados.titulo} ${dados.descricao || ''}`)])];
  categorias.forEach(c => { if (!politica.CATEGORIAS_APROVACAO[c]) throw new ErroTarefa(`Categoria de aprovação desconhecida: ${c}`, 'ENTRADA_INVALIDA'); });

  return armazem.comTrava(() => {
    const todas = lerTodas();
    // CONTROLE DE DUPLICIDADE: mesmo pedido ainda válido → devolve a tarefa existente.
    const existente = Object.values(todas).find(t => t.chave_duplicidade === chave && !['CANCELLED', 'ERROR'].includes(t.status));
    if (existente) {
      auditoria.registrar({ task_id: existente.task_id, agente: quem(fichaPor), acao: 'TAREFA_DUPLICADA', entrada: { titulo: dados.titulo }, decisao: 'Não criada: já existe tarefa com o mesmo pedido.' });
      return { tarefa: existente, duplicada: true };
    }
    if (dados.pai && !todas[dados.pai]) throw new ErroTarefa(`Tarefa-mãe inexistente: ${dados.pai}`, 'TAREFA_INEXISTENTE');
    const id = novoId();
    const t = {
      task_id: id, titulo: String(dados.titulo).trim(), descricao: dados.descricao || '', tipo,
      solicitante: dados.solicitante || quem(fichaPor), criada_por: quem(fichaPor),
      responsavel: null, prioridade, status: 'PENDING', pai: dados.pai || null, filhas: [],
      etapas: (dados.etapas || []).map((a, i) => ({ ordem: i + 1, agente: a, status: 'PENDENTE', resultado: null })),
      entrada, resultado: {}, avisos: [], erros: [], execucoes: [],
      chave_duplicidade: chave, prazo: dados.prazo || null,
      aprovacao: {
        necessaria: categorias.length > 0, categorias, no_inicio: !!dados.aprovacao_no_inicio,
        status: categorias.length ? 'NAO_SOLICITADA' : 'NAO_NECESSARIA'
      },
      qualidade: null, criada_em: agora(), atualizada_em: agora(),
      historico: [{ em: agora(), de: null, para: 'PENDING', por: quem(fichaPor), motivo: 'criada' }]
    };
    todas[id] = t;
    if (t.pai) todas[t.pai].filhas.push(id);
    salvarTodas(todas);
    auditoria.registrar({ task_id: id, agente: quem(fichaPor), acao: 'CRIAR_TAREFA', entrada: { titulo: t.titulo, tipo, prioridade, pai: t.pai, etapas: dados.etapas || [] }, status: 'PENDING', decisao: categorias.length ? `Exige aprovação humana: ${categorias.join(', ')}` : null });
    return { tarefa: t, duplicada: false };
  });
}

// ---------------------------------------------------------------- delegar
function atribuir(fichaPor, taskId, agente, motivo = '') {
  politica.exigir(fichaPor, 'DELEGATE', 'delegar tarefa');
  const destino = fichaDe(agente);
  if (destino === AGENTE_HUMANO) throw new ErroTarefa('Tarefas são delegadas a agentes, não ao proprietário.', 'ENTRADA_INVALIDA');
  const st = registro.statusAgente(agente);
  if (st !== 'ACTIVE') throw new ErroTarefa(`O agente ${agente} está ${st}. Ative-o ou escolha outro.`, 'AGENTE_INDISPONIVEL', 'HIGH');
  return alterar(taskId, t => {
    if (FINAIS.includes(t.status)) throw new ErroTarefa(`Tarefa ${taskId} já está ${t.status}.`, 'TAREFA_FINALIZADA');
    t.responsavel = agente;
    if (t.status !== 'ASSIGNED') mudarStatus(t, 'ASSIGNED', quem(fichaPor), motivo || `delegada para ${agente}`);
    const etapa = t.etapas.find(e => e.agente === agente && e.status !== 'CONCLUIDA');
    if (etapa) etapa.status = 'EM_ANDAMENTO';
    auditoria.registrar({ task_id: taskId, agente: quem(fichaPor), acao: 'DELEGAR', entrada: { para: agente, motivo }, status: 'ASSIGNED', responsavel: agente });
    registro.anotarAtividade(agente);
  });
}

/* Quem pode mexer no status: o responsável (no próprio trabalho), quem tem DELEGATE, ou o proprietário. */
function podeMexer(fichaPor, t) {
  return fichaPor === AGENTE_HUMANO || politica.tem(fichaPor, 'DELEGATE') || t.responsavel === quem(fichaPor);
}

function iniciar(fichaPor, taskId) {
  return alterar(taskId, t => {
    if (!podeMexer(fichaPor, t)) throw new politica.SemPermissao(`${quem(fichaPor)} não é responsável por ${taskId}.`);
    // Aprovação exigida antes de começar (exclusões, riscos): para e espera.
    if (t.aprovacao.necessaria && t.aprovacao.no_inicio && t.aprovacao.status !== 'APROVADA') {
      pedirAprovacaoInterno(t, quem(fichaPor), { operacao: 'INICIAR', resumo: t.titulo });
      return { aguardando_aprovacao: true, tarefa: t };
    }
    mudarStatus(t, 'IN_PROGRESS', quem(fichaPor), 'trabalho iniciado');
    registro.anotarAtividade(quem(fichaPor));
    return { aguardando_aprovacao: false, tarefa: t };
  });
}

/* Passa a tarefa para o próximo agente do plano (ex.: CAPTADOR → LANÇADOR). O TASK_ID não muda. */
function passar(fichaPor, taskId, para, resultadoEtapa) {
  politica.exigir(fichaPor, 'WRITE', 'passar tarefa adiante');
  const destino = fichaDe(para);
  const st = registro.statusAgente(para);
  if (st !== 'ACTIVE') throw new ErroTarefa(`O agente ${para} está ${st}.`, 'AGENTE_INDISPONIVEL', 'HIGH');
  return alterar(taskId, t => {
    const de = quem(fichaPor);
    if (t.responsavel !== de) throw new politica.SemPermissao(`${de} não é o responsável atual por ${taskId}.`);
    if (t.status !== 'IN_PROGRESS') throw new ErroTarefa(`Só se passa uma tarefa em andamento (está ${t.status}).`, 'TRANSICAO_INVALIDA');
    const atual = t.etapas.find(e => e.agente === de && e.status !== 'CONCLUIDA');
    const proxima = t.etapas.find(e => e.status === 'PENDENTE');
    if (!atual || !proxima || proxima.agente !== para) {
      throw new ErroTarefa(`O plano da tarefa não prevê passar de ${de} para ${para}. Só o CEO muda o plano.`, 'FORA_DO_PLANO', 'HIGH');
    }
    if (!fichaPor.COMMUNICATION_PROTOCOL.envia_para.includes(para) || !destino.COMMUNICATION_PROTOCOL.recebe_de.includes(de)) {
      throw new ErroTarefa(`${de} não tem canal de comunicação com ${para}.`, 'SEM_CANAL', 'HIGH');
    }
    atual.status = 'CONCLUIDA'; atual.resultado = resultadoEtapa || {};
    t.resultado[de] = resultadoEtapa || {};
    proxima.status = 'EM_ANDAMENTO';
    t.responsavel = para;
    mudarStatus(t, 'ASSIGNED', de, `passada para ${para}`);
    auditoria.registrar({ task_id: taskId, agente: de, acao: 'HANDOFF', entrada: { para }, saida: resultadoEtapa, status: 'ASSIGNED', responsavel: para });
    registro.anotarAtividade(de);
  });
}

/* O agente terminou sua parte: manda para revisão do CEO com a checagem de qualidade. */
function enviarRevisao(fichaPor, taskId, resultado, qualidade) {
  politica.exigir(fichaPor, 'REPORT', 'entregar resultado');
  const falta = Object.keys(CHECKLIST_QUALIDADE).filter(k => !qualidade || typeof qualidade[k] !== 'boolean');
  if (falta.length) throw new ErroTarefa(`Checagem de qualidade incompleta: ${falta.join(', ')}`, 'QUALIDADE_INCOMPLETA');
  if (!resultado || (!Array.isArray(resultado.fontes) && !Array.isArray(resultado.limitacoes))) {
    throw new ErroTarefa('O resultado precisa dizer em que se baseou (fontes) ou o que não pôde ser verificado (limitacoes).', 'RESULTADO_SEM_FUNDAMENTO');
  }
  return alterar(taskId, t => {
    const de = quem(fichaPor);
    if (t.responsavel !== de && fichaPor !== AGENTE_HUMANO) throw new politica.SemPermissao(`${de} não é o responsável atual por ${taskId}.`);
    const etapa = t.etapas.find(e => e.agente === de && e.status !== 'CONCLUIDA');
    if (etapa) { etapa.status = 'CONCLUIDA'; etapa.resultado = resultado; }
    t.resultado[de] = resultado;
    t.qualidade = { por: de, em: agora(), respostas: qualidade };
    mudarStatus(t, 'REVIEW', de, 'resultado entregue para validação');
    t.responsavel = 'ceo';
    registro.anotarAtividade(de);
  });
}

/* O que impede concluir a tarefa (vazio = pode concluir). Não altera nada. */
function pendenciasDe(t, todas = lerTodas()) {
  const p = [];
  const q = (t.qualidade && t.qualidade.respostas) || {};
  Object.entries(CHECKLIST_QUALIDADE).forEach(([k, pergunta]) => { if (q[k] !== true) p.push(pergunta); });
  if (t.etapas.some(e => e.status !== 'CONCLUIDA')) p.push('Há etapas do plano não concluídas.');
  const filhasAbertas = t.filhas.filter(f => todas[f] && !FINAIS.includes(todas[f].status));
  if (filhasAbertas.length) p.push(`Subtarefas abertas: ${filhasAbertas.join(', ')}`);
  // Aprovação humana vale para EXECUTAR decisões; ler ou relatar não precisa dela.
  if (t.aprovacao.status === 'PENDENTE') p.push('Aprovação humana pendente.');
  if (t.execucoes.some(e => e.status === 'OK') && t.aprovacao.necessaria && t.aprovacao.status !== 'APROVADA') p.push('Operação executada sem a aprovação humana exigida.');
  if (t.erros.some(e => !e.resolvido)) p.push('Há erros registrados sem resolução.');
  return p;
}

/* CEO valida: tudo "sim" na checagem → COMPLETED. Senão continua em REVIEW e devolve o que falta. */
function validar(fichaPor, taskId, { consolidado = null } = {}) {
  politica.exigir(fichaPor, 'APPROVE', 'validar resultado');
  return alterar(taskId, (t, todas) => {
    if (t.status !== 'REVIEW') throw new ErroTarefa(`Só se valida tarefa em REVIEW (está ${t.status}).`, 'TRANSICAO_INVALIDA');
    const pendencias = pendenciasDe(t, todas);
    if (pendencias.length) {
      auditoria.registrar({ task_id: taskId, agente: quem(fichaPor), acao: 'VALIDAR', saida: { pendencias }, status: 'REVIEW', decisao: 'Necessário revisar.' });
      return { concluida: false, pendencias, tarefa: t };
    }
    if (consolidado) t.resultado.consolidado = consolidado;
    mudarStatus(t, 'COMPLETED', quem(fichaPor), 'validada pelo CEO');
    auditoria.registrar({ task_id: taskId, agente: quem(fichaPor), acao: 'VALIDAR', saida: { consolidado }, status: 'COMPLETED', decisao: 'Aprovada na checagem de qualidade.' });
    return { concluida: true, pendencias: [], tarefa: t };
  });
}

/* CEO pede correção: volta para um agente com a lista do que corrigir. */
function pedirCorrecao(fichaPor, taskId, agente, correcoes) {
  politica.exigir(fichaPor, 'APPROVE', 'pedir correção');
  if (!Array.isArray(correcoes) || !correcoes.length) throw new ErroTarefa('Diga o que precisa ser corrigido.', 'ENTRADA_INCOMPLETA');
  if (registro.statusAgente(agente) !== 'ACTIVE') throw new ErroTarefa(`O agente ${agente} não está ativo.`, 'AGENTE_INDISPONIVEL', 'HIGH');
  return alterar(taskId, t => {
    const etapa = t.etapas.find(e => e.agente === agente);
    if (etapa) etapa.status = 'EM_ANDAMENTO';
    t.responsavel = agente;
    t.avisos.push({ em: agora(), por: quem(fichaPor), tipo: 'CORRECAO', texto: correcoes });
    mudarStatus(t, 'ASSIGNED', quem(fichaPor), `correção pedida a ${agente}`);
    auditoria.registrar({ task_id: taskId, agente: quem(fichaPor), acao: 'REQUEST_CORRECTION', entrada: { para: agente, correcoes }, status: 'ASSIGNED', responsavel: agente });
  });
}

function mover(fichaPor, taskId, para, motivo = '') {
  if (para === 'COMPLETED') throw new ErroTarefa('COMPLETED só pela validação do CEO (validar).', 'TRANSICAO_INVALIDA');
  if (para === 'IN_PROGRESS') return iniciar(fichaPor, taskId).tarefa;
  return alterar(taskId, t => {
    if (!podeMexer(fichaPor, t)) throw new politica.SemPermissao(`${quem(fichaPor)} não pode mudar o status de ${taskId}.`);
    if (para === 'CANCELLED' && fichaPor !== AGENTE_HUMANO && !politica.tem(fichaPor, 'DELEGATE')) {
      throw new politica.SemPermissao('Só o CEO ou o proprietário cancelam tarefas.');
    }
    mudarStatus(t, para, quem(fichaPor), motivo);
  });
}

function reprioritizar(fichaPor, taskId, prioridade, motivo) {
  politica.exigir(fichaPor, 'DELEGATE', 'mudar prioridade');
  if (!PRIORIDADES.includes(prioridade)) throw new ErroTarefa(`Prioridade inválida: ${prioridade}`, 'ENTRADA_INVALIDA');
  if (!motivo) throw new ErroTarefa('Informe o motivo da mudança de prioridade.', 'ENTRADA_INCOMPLETA');
  return alterar(taskId, t => {
    const antes = t.prioridade;
    t.prioridade = prioridade;
    auditoria.registrar({ task_id: taskId, agente: quem(fichaPor), acao: 'PRIORIDADE', entrada: { de: antes, motivo }, saida: { para: prioridade } });
  });
}

// ---------------------------------------------------------------- aprovação humana
/* A aprovação fica presa aos dados EXATOS que serão executados (entrada + operação + resumo + dados). */
const impressaoAprovacao = (t, operacao, resumo, dados) => hash({ entrada: t.entrada, operacao, resumo, dados: dados === undefined ? null : dados });

function pedirAprovacaoInterno(t, por, { operacao, resumo, categorias, dados }) {
  const cats = [...new Set([...(t.aprovacao.categorias || []), ...(categorias || [])])];
  t.aprovacao = Object.assign(t.aprovacao, {
    necessaria: true, categorias: cats, status: 'PENDENTE', operacao, resumo, dados: dados === undefined ? null : dados,
    pedida_por: por, pedida_em: agora(), impressao: impressaoAprovacao(t, operacao, resumo, dados), consumida: null
  });
  if (t.status !== 'WAITING') mudarStatus(t, 'WAITING', por, 'HUMAN APPROVAL REQUIRED');
  auditoria.registrar({ task_id: t.task_id, agente: por, acao: 'HUMAN_APPROVAL_REQUIRED', entrada: { operacao, resumo, categorias: cats }, status: 'WAITING' });
}

function pedirAprovacao(fichaPor, taskId, { operacao, resumo, categorias = [] }) {
  if (!operacao || !resumo) throw new ErroTarefa('Pedido de aprovação precisa da operação e de um resumo claro.', 'ENTRADA_INCOMPLETA');
  return alterar(taskId, t => {
    if (!podeMexer(fichaPor, t)) throw new politica.SemPermissao(`${quem(fichaPor)} não é responsável por ${taskId}.`);
    if (t.aprovacao.status === 'APROVADA' && t.aprovacao.operacao === operacao && t.aprovacao.impressao === impressaoAprovacao(t, operacao, resumo)) return t;
    pedirAprovacaoInterno(t, quem(fichaPor), { operacao, resumo, categorias });
  });
}

/* Só o proprietário decide. Aprovar devolve a tarefa ao agente; negar bloqueia e avisa o CEO. */
function decidirAprovacao(fichaPor, taskId, aprovar, motivo = '') {
  politica.exigir(fichaPor, 'HUMAN_APPROVE', 'decidir aprovação');
  return alterar(taskId, t => {
    if (t.aprovacao.status !== 'PENDENTE') throw new ErroTarefa(`Não há aprovação pendente em ${taskId}.`, 'SEM_APROVACAO_PENDENTE');
    t.aprovacao.status = aprovar ? 'APROVADA' : 'NEGADA';
    t.aprovacao.decidida_por = quem(fichaPor);
    t.aprovacao.decidida_em = agora();
    t.aprovacao.motivo = motivo;
    auditoria.registrar({ task_id: taskId, agente: quem(fichaPor), acao: aprovar ? 'APROVACAO_CONCEDIDA' : 'APROVACAO_NEGADA', entrada: { operacao: t.aprovacao.operacao, motivo }, decisao: aprovar ? 'APROVADA' : 'NEGADA', responsavel: AGENTE_HUMANO });
    // Aprovado: volta ao agente responsável, que retoma a operação exatamente como foi aprovada.
    if (aprovar) mudarStatus(t, 'ASSIGNED', quem(fichaPor), 'aprovado pelo proprietário');
    else { mudarStatus(t, 'BLOCKED', quem(fichaPor), `aprovação negada: ${motivo}`); t.responsavel = 'ceo'; }
  });
}

// ---------------------------------------------------------------- execução protegida
/*
 * Executa uma operação no máximo uma vez por chave.
 * - Já executada com sucesso → não executa de novo; devolve o resultado anterior.
 * - Ficou pela metade (queda no meio) → BLOQUEIA e pede revisão humana (não arrisca repetir).
 * - Operação com categorias de aprovação → exige aprovação humana válida para ESTA entrada.
 */
function executar(fichaPor, taskId, { operacao, chave, categorias = [], resumo, dados }, fn) {
  politica.exigir(fichaPor, 'EXECUTE', `executar ${operacao}`);
  const chaveExec = chave || hash({ taskId, operacao });
  const preparo = alterar(taskId, t => {
    const de = quem(fichaPor);
    if (t.responsavel !== de) throw new politica.SemPermissao(`${de} não é o responsável atual por ${taskId}.`);
    const anterior = t.execucoes.find(e => e.chave === chaveExec);
    if (anterior && anterior.status === 'OK') {
      auditoria.registrar({ task_id: taskId, agente: de, acao: 'EXECUCAO_REPETIDA_BLOQUEADA', entrada: { operacao }, decisao: 'Já executada; não repetida.' });
      return { jaExecutada: true, resultado: anterior.resultado };
    }
    if (anterior && (anterior.status === 'INICIADA' || anterior.status === 'INCERTA')) {
      // Salva o bloqueio primeiro; o erro é lançado depois de gravar (fora da trava).
      mudarStatus(t, 'BLOCKED', de, 'execução interrompida no meio: necessário revisar antes de repetir');
      return { interrompida: true };
    }
    const precisa = categorias.length > 0 || t.aprovacao.necessaria;
    if (precisa) {
      const r = resumo || t.titulo;
      // Válida só se aprovada para estes dados exatos e ainda não usada em outra execução.
      const valida = t.aprovacao.status === 'APROVADA' && t.aprovacao.operacao === operacao &&
        t.aprovacao.impressao === impressaoAprovacao(t, operacao, r, dados) &&
        (!t.aprovacao.consumida || t.aprovacao.consumida === chaveExec);
      if (!valida) {
        pedirAprovacaoInterno(t, de, { operacao, resumo: r, categorias, dados });
        return { aguardandoAprovacao: true };
      }
    }
    if (t.status !== 'IN_PROGRESS') throw new ErroTarefa(`Só se executa com a tarefa em andamento (está ${t.status}).`, 'TRANSICAO_INVALIDA');
    t.execucoes.push({ chave: chaveExec, operacao, status: 'INICIADA', em: agora(), por: de });
    auditoria.registrar({ task_id: taskId, agente: de, acao: 'EXECUCAO_INICIADA', entrada: { operacao } });
    return { pronto: true };
  });
  if (preparo.interrompida) throw new ErroTarefa(`A operação ${operacao} foi interrompida no meio. Necessário revisar antes de repetir.`, 'EXECUCAO_INTERROMPIDA', 'CRITICAL');
  if (!preparo.pronto) return preparo;

  let resultado;
  try {
    resultado = fn();
  } catch (e) {
    const semEfeito = !!(e && e.semEfeito);
    alterar(taskId, t => {
      const ex = t.execucoes.find(x => x.chave === chaveExec);
      ex.erro = e.message;
      if (semEfeito) {
        // Falhou antes de fazer qualquer coisa: pode tentar de novo.
        ex.status = 'FALHOU';
        t.execucoes = t.execucoes.filter(x => x !== ex).concat([Object.assign({}, ex, { chave: `${chaveExec}#falha-${Date.now()}` })]);
      } else {
        // Não dá para saber se o efeito aconteceu: bloqueia até o proprietário confirmar.
        ex.status = 'INCERTA';
        mudarStatus(t, 'BLOCKED', quem(fichaPor), `execução de ${operacao} incerta: necessário revisar`);
      }
    });
    auditoria.registrar({ task_id: taskId, agente: quem(fichaPor), acao: semEfeito ? 'EXECUCAO_FALHOU' : 'EXECUCAO_INCERTA', entrada: { operacao }, erro: e.message });
    if (semEfeito) throw e;
    throw Object.assign(new ErroTarefa(`Não é possível saber se ${operacao} foi feita (${e.message}). Necessário revisar antes de repetir: confirme com "confirmar-execucao".`, 'EXECUCAO_INCERTA', 'CRITICAL'), { origem: 'execucao' });
  }
  alterar(taskId, t => {
    const ex = t.execucoes.find(x => x.chave === chaveExec);
    ex.status = 'OK'; ex.resultado = resultado; ex.concluida_em = agora();
    if (t.aprovacao.status === 'APROVADA') t.aprovacao.consumida = chaveExec; // uma aprovação, uma execução
  });
  auditoria.registrar({ task_id: taskId, agente: quem(fichaPor), acao: 'EXECUCAO_OK', entrada: { operacao }, saida: resultado });
  return { executada: true, resultado };
}

// ---------------------------------------------------------------- erros
/*
 * REGRA DE ERRO: registrar (nunca esconder), causa provável, recuperação segura,
 * informar o CEO e pedir intervenção humana quando necessário.
 */
function registrarErro(fichaPor, taskId, { nivel, descricao, causa, recuperacao = null, origem = 'agente' }) {
  if (!NIVEIS_ERRO.includes(nivel)) throw new ErroTarefa(`Nível de erro inválido: ${nivel}`, 'ENTRADA_INVALIDA');
  if (!descricao || !causa) throw new ErroTarefa('Erro precisa de descrição e causa provável.', 'ENTRADA_INCOMPLETA');
  const de = quem(fichaPor);
  const intervencao = nivel === 'CRITICAL' || nivel === 'HIGH';
  const atual = obter(taskId);
  if (FINAIS.includes(atual.status)) {
    auditoria.registrar({ task_id: taskId, agente: de, acao: 'ERRO_APOS_FIM', entrada: { nivel, causa, origem }, erro: descricao, decisao: 'Tarefa já finalizada: só registrado no log.' });
    return null;
  }
  if (!podeMexer(fichaPor, atual) && de !== 'sistema') throw new politica.SemPermissao(`${de} não pode registrar erro em ${taskId}, que não está com ele.`);
  const r = alterar(taskId, t => {
    const erro = { em: agora(), por: de, nivel, descricao, causa, recuperacao, origem, intervencao_humana: intervencao, resolvido: false };
    t.erros.push(erro);
    if (TRANSICOES[t.status].includes('ERROR')) mudarStatus(t, 'ERROR', de, `${nivel}: ${descricao}`);
    else if (TRANSICOES[t.status].includes('BLOCKED')) mudarStatus(t, 'BLOCKED', de, `${nivel}: ${descricao}`);
    t.responsavel = 'ceo';
    auditoria.registrar({ task_id: taskId, agente: de, acao: 'ERRO', entrada: { nivel, causa, recuperacao, origem }, erro: descricao, status: t.status, decisao: intervencao ? 'Intervenção humana necessária' : 'CEO avalia a correção' });
    return erro;
  });
  registro.anotarAtividade(de, { falhou: true });
  if (nivel === 'CRITICAL' && origem === 'agente' && de !== AGENTE_HUMANO && de !== 'sistema') registro.mudarStatusAgente(de, 'ERROR', 'sistema', `erro crítico em ${taskId}: ${descricao}`);
  return r;
}

function resolverErro(fichaPor, taskId, indice, solucao) {
  politica.exigir(fichaPor, 'DELEGATE', 'marcar erro como resolvido');
  if (!solucao) throw new ErroTarefa('Descreva como o erro foi resolvido.', 'ENTRADA_INCOMPLETA');
  return alterar(taskId, t => {
    const e = t.erros[indice];
    if (!e) throw new ErroTarefa('Erro não encontrado.', 'ENTRADA_INVALIDA');
    e.resolvido = true; e.solucao = solucao; e.resolvido_por = quem(fichaPor); e.resolvido_em = agora();
    auditoria.registrar({ task_id: taskId, agente: quem(fichaPor), acao: 'ERRO_RESOLVIDO', entrada: { indice, solucao } });
  });
}

/* O proprietário confirma se uma execução incerta/interrompida aconteceu ou não. */
function confirmarExecucao(fichaPor, taskId, aconteceu, motivo) {
  politica.exigir(fichaPor, 'HUMAN_APPROVE', 'confirmar execução incerta');
  if (!motivo) throw new ErroTarefa('Diga como você conferiu.', 'ENTRADA_INCOMPLETA');
  return alterar(taskId, t => {
    const ex = [...t.execucoes].reverse().find(e => e.status === 'INCERTA' || e.status === 'INICIADA');
    if (!ex) throw new ErroTarefa('Não há execução incerta nesta tarefa.', 'ENTRADA_INVALIDA');
    if (aconteceu) { ex.status = 'OK'; ex.resultado = ex.resultado || null; ex.confirmada_por = quem(fichaPor); ex.concluida_em = agora(); }
    else { ex.status = 'FALHOU'; ex.chave = `${ex.chave}#nao-aconteceu-${Date.now()}`; ex.confirmada_por = quem(fichaPor); }
    auditoria.registrar({ task_id: taskId, agente: quem(fichaPor), acao: 'EXECUCAO_CONFIRMADA', entrada: { operacao: ex.operacao, aconteceu, motivo }, decisao: aconteceu ? 'Considerada feita: não será repetida.' : 'Considerada não feita: pode ser repetida.' });
  });
}

/* Execução que ficou pela metade (processo caiu): bloqueia e registra, para ninguém repetir às cegas. */
function marcarInterrompidas(limiteMs = 60000) {
  const marcadas = [];
  listar({ status: 'IN_PROGRESS' }).forEach(t0 => {
    const ex = t0.execucoes.find(e => e.status === 'INICIADA' && Date.now() - Date.parse(e.em) > limiteMs);
    if (!ex) return;
    alterar(t0.task_id, t => {
      mudarStatus(t, 'BLOCKED', 'sistema', `execução ${ex.operacao} interrompida (queda no meio)`);
      t.erros.push({ em: agora(), por: 'sistema', nivel: 'CRITICAL', descricao: `A execução ${ex.operacao} começou e não terminou.`, causa: 'Processo interrompido no meio da execução', recuperacao: 'Proprietário confere e usa confirmar-execucao', origem: 'execucao', intervencao_humana: true, resolvido: false });
      t.responsavel = 'ceo';
      auditoria.registrar({ task_id: t.task_id, agente: 'sistema', acao: 'EXECUCAO_INTERROMPIDA', entrada: { operacao: ex.operacao }, status: 'BLOCKED' });
    });
    marcadas.push(t0.task_id);
  });
  return marcadas;
}

/* Retomar depois de resolver a causa de um erro (ex.: ferramenta voltou). Não muda os dados nem a aprovação. */
function retomar(fichaPor, taskId, motivo) {
  politica.exigir(fichaPor, 'DELEGATE', 'retomar tarefa');
  if (!motivo) throw new ErroTarefa('Diga o que foi resolvido para retomar.', 'ENTRADA_INCOMPLETA');
  return alterar(taskId, t => {
    if (!['ERROR', 'BLOCKED'].includes(t.status)) throw new ErroTarefa(`Só se retoma tarefa em ERROR ou BLOCKED (está ${t.status}).`, 'TRANSICAO_INVALIDA');
    if (t.execucoes.some(e => e.status === 'INCERTA' || e.status === 'INICIADA')) throw new ErroTarefa('Há execução incerta: confirme primeiro com "confirmar-execucao" se ela aconteceu ou não.', 'EXECUCAO_INCERTA', 'CRITICAL');
    t.erros.forEach(e => { if (!e.resolvido) { e.resolvido = true; e.solucao = motivo; e.resolvido_por = quem(fichaPor); e.resolvido_em = agora(); } });
    t.responsavel = 'ceo';
    t.retomadas = (t.retomadas || 0) + 1;
    auditoria.registrar({ task_id: taskId, agente: quem(fichaPor), acao: 'RETOMAR', entrada: { motivo }, decisao: 'Erros marcados como resolvidos; CEO delega a etapa pendente.' });
    return t.retomadas;
  });
}

/* O proprietário completa ou corrige a entrada de uma tarefa parada. Invalida aprovações anteriores. */
/* Troca, no texto "campo: valor", as linhas dos campos informados de novo (a versão nova vale). */
function substituirCampos(antigo, novo) {
  const chave = l => (l.split(':')[0] || '').trim().toLowerCase();
  const novas = novo.split('\n').filter(l => l.trim());
  const trocadas = new Set(novas.map(chave).filter(Boolean));
  return [...String(antigo || '').split('\n').filter(l => l.trim() && !trocadas.has(chave(l))), ...novas].join('\n');
}

function complementar(fichaPor, taskId, novos, { substituir = false } = {}) {
  politica.exigir(fichaPor, 'CREATE_TASK', 'complementar entrada');
  if (!novos || (typeof novos === 'string' && !novos.trim())) throw new ErroTarefa('Nada para complementar.', 'ENTRADA_INCOMPLETA');
  return alterar(taskId, t => {
    if (!['WAITING', 'ERROR', 'BLOCKED'].includes(t.status)) throw new ErroTarefa(`Só se complementa tarefa em WAITING, ERROR ou BLOCKED (está ${t.status}).`, 'TRANSICAO_INVALIDA');
    const antes = t.entrada.dados;
    if (typeof antes === 'string' && typeof novos === 'string') t.entrada.dados = substituir ? substituirCampos(antes, novos) : `${antes}\n${novos}`;
    else if (antes && typeof antes === 'object' && typeof novos === 'object') t.entrada.dados = Object.assign({}, antes, novos);
    else t.entrada.dados = novos;
    t.entrada.complementos = (t.entrada.complementos || 0) + 1;
    if (t.aprovacao.status === 'APROVADA' || t.aprovacao.status === 'PENDENTE') t.aprovacao.status = 'NAO_SOLICITADA';
    t.etapas.forEach(e => { e.status = 'PENDENTE'; e.resultado = null; });
    t.erros.forEach(e => { if (!e.resolvido) { e.resolvido = true; e.solucao = 'Entrada complementada pelo proprietário.'; } });
    t.responsavel = 'ceo';
    auditoria.registrar({ task_id: taskId, agente: quem(fichaPor), acao: 'ENTRADA_COMPLEMENTADA', entrada: { complemento: novos, substituir }, decisao: 'Etapas reiniciadas; aprovação anterior invalidada.' });
  });
}

// ---------------------------------------------------------------- consultas
function listar(filtro = {}) {
  return Object.values(lerTodas()).filter(t =>
    (!filtro.status || [].concat(filtro.status).includes(t.status)) &&
    (!filtro.responsavel || t.responsavel === filtro.responsavel));
}

/* Fila de um agente: CRITICAL > HIGH > MEDIUM > LOW; empate pela ordem de chegada. */
function fila(agente) {
  return listar({ responsavel: agente })
    .filter(t => !FINAIS.includes(t.status))
    .sort((a, b) => PRIORIDADES.indexOf(a.prioridade) - PRIORIDADES.indexOf(b.prioridade) || a.criada_em.localeCompare(b.criada_em) || a.task_id.localeCompare(b.task_id));
}

function dividir(fichaPor, paiId, partes) {
  politica.exigir(fichaPor, 'CREATE_TASK', 'dividir tarefa');
  const pai = obter(paiId);
  return partes.map(p => criar(fichaPor, Object.assign({ prioridade: pai.prioridade, solicitante: pai.solicitante }, p, { pai: paiId })).tarefa);
}

module.exports = {
  ErroTarefa, ID_VALIDO, hash, canonico, novoId, obter, pendencias: t => pendenciasDe(t), criar, atribuir, iniciar, passar, enviarRevisao,
  validar, pedirCorrecao, mover, reprioritizar, pedirAprovacao, decidirAprovacao, executar,
  registrarErro, resolverErro, retomar, confirmarExecucao, marcarInterrompidas, complementar, listar, fila, dividir, podeMexer
};
