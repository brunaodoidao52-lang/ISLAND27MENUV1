'use strict';
/*
 * memoria.js — os três níveis de memória dos agentes.
 *
 *  TAREFA       memory/dados/tarefa/<TASK_ID>.json
 *               Só o que a tarefa atual precisa. É descartada quando a tarefa
 *               termina (COMPLETED/CANCELLED); o log continua registrando o que houve.
 *  OPERACIONAL  memory/dados/operacional.json
 *               Coisas úteis no dia a dia de cada agente. Cada agente só
 *               escreve na própria gaveta. Vence em 90 dias se ninguém renovar.
 *  ESTRATÉGICA  memory/dados/estrategica.json
 *               Decisões e aprendizados para o futuro. Só o CEO ou o
 *               proprietário gravam, sempre com justificativa.
 *
 * "Não armazenar informações desnecessárias": valores curtos, sem dados
 * pessoais (CPF, telefone, e-mail) nas memórias operacional e estratégica.
 */
const armazem = require('../orchestration/armazem');
const auditoria = require('../logs/auditoria');
const politica = require('../permissions/politica');
const { AGENTE_HUMANO } = require('../orchestration/definicoes');

const LIMITE_VALOR = 1000;          // operacional e estratégica: só o essencial
const LIMITE_VALOR_TAREFA = 20000; // tarefa: cabe o pacote que vai para aprovação
const VALIDADE_OPERACIONAL_DIAS = 90;
const DADO_PESSOAL = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b|[\w.+-]+@[\w-]+\.[\w.]+/;

class MemoriaRecusada extends Error {}

const idDe = f => (f === AGENTE_HUMANO ? AGENTE_HUMANO : f.AGENT_ID);

function conferirValor(valor, permitirPessoal, limite = LIMITE_VALOR) {
  const texto = typeof valor === 'string' ? valor : JSON.stringify(valor);
  if (texto === undefined || texto === '') throw new MemoriaRecusada('Valor vazio não é guardado.');
  if (texto.length > limite) throw new MemoriaRecusada(`Valor grande demais para memória (${texto.length} > ${limite} caracteres). Guarde só o essencial.`);
  if (!permitirPessoal && DADO_PESSOAL.test(texto)) throw new MemoriaRecusada('Dados pessoais (CPF, telefone, e-mail) não podem ir para esta memória.');
}

const chaveValida = c => typeof c === 'string' && /^[a-z0-9_-]{1,60}$/i.test(c);

/* A memória de tarefa só existe para tarefa real, em andamento, de quem está trabalhando nela. */
function conferirTarefa(ficha, taskId, escrita) {
  if (typeof taskId !== 'string' || !/^TASK-\d{8}-\d{4}$/.test(taskId)) throw new MemoriaRecusada(`TASK_ID inválido: ${taskId}`);
  const t = armazem.lerJSON('tasks/dados/tarefas.json', {})[taskId];
  if (!t) throw new MemoriaRecusada(`Tarefa inexistente: ${taskId}`);
  if (escrita && ['COMPLETED', 'CANCELLED'].includes(t.status)) throw new MemoriaRecusada('Tarefa finalizada: a memória dela já foi descartada.');
  const quem = idDe(ficha);
  if (ficha !== AGENTE_HUMANO && t.responsavel !== quem && !politica.tem(ficha, 'DELEGATE')) {
    throw new politica.SemPermissao(`${quem} não trabalha em ${taskId}.`);
  }
}

// ---------- TAREFA ----------
function lerTarefa(ficha, taskId) {
  politica.exigir(ficha, 'READ', 'ler memória de tarefa');
  conferirTarefa(ficha, taskId, false);
  return armazem.lerJSON(`memory/dados/tarefa/${taskId}.json`, {});
}

function gravarTarefa(ficha, taskId, chave, valor) {
  politica.exigir(ficha, 'WRITE', 'gravar memória de tarefa');
  if (!chaveValida(chave)) throw new MemoriaRecusada('Chave inválida.');
  conferirTarefa(ficha, taskId, true);
  conferirValor(valor, true, LIMITE_VALOR_TAREFA); // memória de tarefa pode conter os dados do aluno enquanto a tarefa dura
  return armazem.comTrava(() => {
    const m = armazem.lerJSON(`memory/dados/tarefa/${taskId}.json`, {});
    m[chave] = { valor, por: idDe(ficha), em: new Date().toISOString() };
    armazem.gravarJSON(`memory/dados/tarefa/${taskId}.json`, m);
    auditoria.registrar({ task_id: taskId, agente: idDe(ficha), acao: 'MEMORIA_TAREFA_GRAVAR', entrada: { chave } });
    return m[chave];
  });
}

function descartarTarefa(taskId, por) {
  armazem.comTrava(() => {
    const m = armazem.lerJSON(`memory/dados/tarefa/${taskId}.json`, null);
    if (!m) return;
    armazem.apagar(`memory/dados/tarefa/${taskId}.json`);
    auditoria.registrar({ task_id: taskId, agente: por, acao: 'MEMORIA_TAREFA_DESCARTADA', entrada: { chaves: Object.keys(m) } });
  });
}

// ---------- OPERACIONAL ----------
function lerOperacional(ficha, dono = idDe(ficha)) {
  politica.exigir(ficha, 'READ', 'ler memória operacional');
  if (dono !== idDe(ficha) && idDe(ficha) !== 'ceo' && ficha !== AGENTE_HUMANO && !politica.tem(ficha, 'AUDIT')) {
    throw new politica.SemPermissao(`${idDe(ficha)} não pode ler a memória operacional de ${dono}.`);
  }
  const tudo = armazem.lerJSON('memory/dados/operacional.json', {});
  const agora = Date.now();
  return Object.fromEntries(Object.entries(tudo[dono] || {}).filter(([, v]) => Date.parse(v.expira_em) > agora));
}

function gravarOperacional(ficha, chave, valor, origemTask = null) {
  politica.exigir(ficha, 'WRITE', 'gravar memória operacional');
  if (!chaveValida(chave)) throw new MemoriaRecusada('Chave inválida.');
  conferirValor(valor, false);
  const dono = idDe(ficha);
  return armazem.comTrava(() => {
    const tudo = armazem.lerJSON('memory/dados/operacional.json', {});
    const gaveta = tudo[dono] || (tudo[dono] = {});
    const agora = new Date();
    // limpa o que já venceu
    Object.keys(gaveta).forEach(k => { if (Date.parse(gaveta[k].expira_em) <= agora) delete gaveta[k]; });
    gaveta[chave] = {
      valor, origem_task: origemTask, atualizado_em: agora.toISOString(),
      expira_em: new Date(agora.getTime() + VALIDADE_OPERACIONAL_DIAS * 86400000).toISOString()
    };
    armazem.gravarJSON('memory/dados/operacional.json', tudo);
    auditoria.registrar({ task_id: origemTask, agente: dono, acao: 'MEMORIA_OPERACIONAL_GRAVAR', entrada: { chave } });
    return gaveta[chave];
  });
}

// ---------- ESTRATÉGICA ----------
function lerEstrategica(ficha) {
  politica.exigir(ficha, 'READ', 'ler memória estratégica');
  return armazem.lerJSON('memory/dados/estrategica.json', {});
}

function gravarEstrategica(ficha, chave, valor, justificativa, origemTask = null) {
  const quem = idDe(ficha);
  if (quem !== 'ceo' && quem !== AGENTE_HUMANO) throw new politica.SemPermissao('Só o CEO ou o proprietário gravam memória estratégica.');
  if (!chaveValida(chave)) throw new MemoriaRecusada('Chave inválida.');
  if (!justificativa || String(justificativa).trim().length < 10) throw new MemoriaRecusada('Memória estratégica exige justificativa (por que isso importa para decisões futuras).');
  conferirValor(valor, false);
  return armazem.comTrava(() => {
    const tudo = armazem.lerJSON('memory/dados/estrategica.json', {});
    const anterior = tudo[chave] || null;
    tudo[chave] = { valor, justificativa, por: quem, origem_task: origemTask, em: new Date().toISOString(), versoes_anteriores: anterior ? [...(anterior.versoes_anteriores || []), { valor: anterior.valor, em: anterior.em, por: anterior.por }] : [] };
    armazem.gravarJSON('memory/dados/estrategica.json', tudo);
    auditoria.registrar({ task_id: origemTask, agente: quem, acao: 'MEMORIA_ESTRATEGICA_GRAVAR', entrada: { chave, justificativa } });
    return tudo[chave];
  });
}

module.exports = {
  MemoriaRecusada, LIMITE_VALOR, lerTarefa, gravarTarefa, descartarTarefa,
  lerOperacional, gravarOperacional, lerEstrategica, gravarEstrategica
};
