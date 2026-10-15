'use strict';
/*
 * executor.js — faz os agentes trabalharem.
 *
 * - Entrega as mensagens da caixa de cada agente ATIVO, por prioridade.
 * - Cada agente recebe um "contexto" com SÓ o que a ficha permite:
 *   ferramentas da ficha, skills da ficha, e as ações de tarefa com a
 *   identidade dele (não dá para agir em nome de outro agente).
 * - Erro dentro de um agente nunca some: vira registro de erro + ERROR_REPORT ao CEO.
 * - Agente PAUSED/INACTIVE: as mensagens esperam na caixa.
 */
const path = require('path');
const fs = require('fs');
const registro = require('./registro');
const tarefas = require('./tarefas');
const protocolo = require('./protocolo');
const ferramentas = require('./ferramentas');
const memoria = require('../memory/memoria');
const auditoria = require('../logs/auditoria');
const politica = require('../permissions/politica');
const { RAIZ, AGENTE_HUMANO, PRIORIDADES } = require('./definicoes');

const handlersDeTeste = {};

/* Só para testes automatizados (RACA_TESTE=1): simula a implementação de um agente preparado. */
function registrarHandlerDeTeste(id, handler) {
  if (process.env.RACA_TESTE !== '1') throw new Error('Handlers de teste só podem ser usados com RACA_TESTE=1.');
  const f = registro.carregar().agentes[id];
  if (handler === null) { delete handlersDeTeste[id]; if (f) f.IMPLEMENTED = fs.existsSync(path.join(RAIZ, 'agents', id, 'handler.js')); return; }
  handlersDeTeste[id] = handler;
  if (f) f.IMPLEMENTED = true;
}

function handlerDe(id) {
  if (handlersDeTeste[id]) return handlersDeTeste[id];
  const arq = path.join(RAIZ, 'agents', id, 'handler.js');
  return fs.existsSync(arq) ? require(arq) : null;
}

function contexto(ficha) {
  const id = ficha.AGENT_ID;
  const ctx = {
    ficha, id,
    tarefa: taskId => tarefas.obter(taskId),
    ferramenta: nome => ferramentas.obter(ficha, nome, ctx),
    skill: nome => {
      if (!ficha.SKILLS.shared.includes(nome)) throw new politica.SemPermissao(`${id} não tem a skill ${nome}.`);
      return require(path.join(RAIZ, 'skills', nome));
    },
    /* Envia no protocolo padrão; remetente é sempre o próprio agente. */
    enviar: campos => {
      const t = tarefas.obter(campos.task_id);
      return protocolo.enviar(protocolo.montar(Object.assign({ priority: t.prioridade, status: t.status }, campos, { from_agent: id })));
    },
    tarefas: {
      criar: d => tarefas.criar(ficha, d),
      atribuir: (t, a, m) => tarefas.atribuir(ficha, t, a, m),
      iniciar: t => tarefas.iniciar(ficha, t),
      passar: (t, para, r) => tarefas.passar(ficha, t, para, r),
      enviarRevisao: (t, r, q) => tarefas.enviarRevisao(ficha, t, r, q),
      validar: (t, o) => tarefas.validar(ficha, t, o),
      pedirCorrecao: (t, a, c) => tarefas.pedirCorrecao(ficha, t, a, c),
      mover: (t, s, m) => tarefas.mover(ficha, t, s, m),
      reprioritizar: (t, p, m) => tarefas.reprioritizar(ficha, t, p, m),
      pedirAprovacao: (t, o) => tarefas.pedirAprovacao(ficha, t, o),
      executar: (t, o, fn) => tarefas.executar(ficha, t, o, fn),
      registrarErro: (t, e) => tarefas.registrarErro(ficha, t, e),
      dividir: (t, p) => tarefas.dividir(ficha, t, p),
      listar: f => { politica.exigir(ficha, 'READ'); return tarefas.listar(f); }
    },
    memoria: {
      lerTarefa: t => memoria.lerTarefa(ficha, t),
      gravarTarefa: (t, k, v) => memoria.gravarTarefa(ficha, t, k, v),
      lerOperacional: () => memoria.lerOperacional(ficha),
      gravarOperacional: (k, v, t) => memoria.gravarOperacional(ficha, k, v, t),
      lerEstrategica: () => memoria.lerEstrategica(ficha),
      gravarEstrategica: (k, v, j, t) => memoria.gravarEstrategica(ficha, k, v, j, t)
    }
  };
  return ctx;
}

/* Registra o erro de um agente e avisa o CEO (REGRA DE ERRO). */
function tratarFalha(ficha, msg, e) {
  const nivel = e.nivel || 'HIGH';
  const origem = e.origem || (e instanceof politica.SemPermissao ? 'permissao' : 'agente');
  const erro = { nivel, descricao: e.message, causa: e.codigo || e.name || 'falha inesperada', origem, recuperacao: null };
  try { tarefas.registrarErro(ficha, msg.task_id, erro); } catch (e2) {
    auditoria.registrar({ task_id: msg.task_id, agente: 'sistema', acao: 'ERRO_NAO_REGISTRADO_NA_TAREFA', erro: `${e.message} / ${e2.message}` });
  }
  const destino = ficha.AGENT_ID === 'ceo' ? AGENTE_HUMANO : 'ceo';
  try {
    if (ficha.COMMUNICATION_PROTOCOL.acoes.includes('ERROR_REPORT')) {
      contexto(ficha).enviar({ task_id: msg.task_id, to_agent: destino, action: 'ERROR_REPORT', input: { mensagem_original: msg.action }, errors: [erro] });
    } else if (ficha.AGENT_ID === 'ceo') {
      contexto(ficha).enviar({ task_id: msg.task_id, to_agent: AGENTE_HUMANO, action: 'REPORT', result: { resumo: `O CEO encontrou um erro e precisa de intervenção: ${e.message}` }, errors: [erro] });
    }
  } catch (e3) {
    auditoria.registrar({ task_id: msg.task_id, agente: 'sistema', acao: 'FALHA_AO_AVISAR', erro: e3.message });
  }
}

/* Processa uma mensagem da caixa. */
function processar(item) {
  const msg = item.mensagem;
  const ficha = registro.ficha(msg.to_agent);
  const handler = handlerDe(msg.to_agent);
  protocolo.marcarLida(item.id);
  // Mensagem obsoleta: a tarefa já terminou ou já não está com este agente.
  if (msg.to_agent !== 'ceo') {
    let t = null;
    try { t = tarefas.obter(msg.task_id); } catch (e) { t = null; }
    if (!t || ['COMPLETED', 'CANCELLED'].includes(t.status) || t.responsavel !== msg.to_agent) {
      auditoria.registrar({ task_id: msg.task_id, agente: 'sistema', acao: 'MENSAGEM_OBSOLETA', entrada: { para: msg.to_agent, action: msg.action }, decisao: 'Descartada: a tarefa não está mais com este agente.' });
      return;
    }
  }
  if (!handler) {
    auditoria.registrar({ task_id: msg.task_id, agente: 'sistema', acao: 'SEM_IMPLEMENTACAO', entrada: { agente: msg.to_agent }, erro: 'Agente sem implementação' });
    return;
  }
  try { handler.processar(msg, contexto(ficha)); } catch (e) { tratarFalha(ficha, msg, e); }
}

/* Roda as caixas até esvaziar (ou até o limite, para nunca entrar em laço). */
function ciclo(limite = 100) {
  let feitas = 0;
  for (; feitas < limite; feitas++) {
    const pendentes = Object.keys(registro.carregar().agentes)
      .filter(a => registro.statusAgente(a) === 'ACTIVE')
      .flatMap(a => protocolo.caixaDe(a))
      .sort((x, y) => PRIORIDADES.indexOf(x.mensagem.priority) - PRIORIDADES.indexOf(y.mensagem.priority) || x.id - y.id);
    if (!pendentes.length) break;
    processar(pendentes[0]);
  }
  if (feitas >= limite) auditoria.registrar({ agente: 'sistema', acao: 'LIMITE_DE_CICLO', erro: `Mais de ${limite} mensagens em sequência: possível laço entre agentes.` });
  return feitas;
}

/* Pedido do proprietário → CEO. */
function pedido(dados) {
  const ceo = registro.ficha('ceo');
  if (registro.statusAgente('ceo') !== 'ACTIVE') throw new Error('O CEO não está ativo.');
  auditoria.registrar({ agente: AGENTE_HUMANO, acao: 'PEDIDO_PROPRIETARIO', entrada: { texto: dados.texto, tipo: dados.tipo, prioridade: dados.prioridade }, responsavel: 'ceo' });
  const r = handlerDe('ceo').receberPedido(dados, contexto(ceo));
  ciclo();
  return r;
}

/* Mensagem do proprietário ao CEO (decisões, complementos). */
function avisarCeo(taskId, input) {
  const t = tarefas.obter(taskId);
  protocolo.enviar(protocolo.montar({ task_id: taskId, from_agent: AGENTE_HUMANO, to_agent: 'ceo', action: 'STATUS_UPDATE', priority: t.prioridade, status: t.status, input }));
  ciclo();
}

module.exports = { contexto, processar, ciclo, pedido, avisarCeo, registrarHandlerDeTeste, handlerDe };
