'use strict';
/*
 * SKILL auditing — procurar erros, inconsistências, duplicidades e tarefas
 * incompletas. Só aponta; não corrige nada sozinha.
 */
const { FINAIS, CHECKLIST_QUALIDADE } = require('../../orchestration/definicoes');

const normal = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/* Lançamentos repetidos: mesmo CPF + mesmo serviço + mesma categoria ainda ativos. */
function duplicidadeLancamento(lancamentos, ficha) {
  const cpf = String(ficha.cpf || '').replace(/\D/g, '');
  return lancamentos.filter(l => l.situacao === 'ATIVO' && String(l.ficha.cpf || '').replace(/\D/g, '') === cpf &&
    normal(l.ficha.servico) === normal(ficha.servico) && normal(l.ficha.categoria) === normal(ficha.categoria));
}

/* Inconsistências estruturais no conjunto de tarefas. */
function inconsistenciasTarefas(todas, agentesExistentes, statusAgentes) {
  const p = [];
  const porId = Object.fromEntries(todas.map(t => [t.task_id, t]));
  todas.forEach(t => {
    const aberta = !FINAIS.includes(t.status);
    if (aberta && t.status !== 'PENDING' && !t.responsavel) p.push({ task_id: t.task_id, problema: `Tarefa ${t.status} sem responsável.` });
    if (t.responsavel && !agentesExistentes.includes(t.responsavel)) p.push({ task_id: t.task_id, problema: `Responsável inexistente: ${t.responsavel}.` });
    if (aberta && t.responsavel && statusAgentes[t.responsavel] && statusAgentes[t.responsavel] !== 'ACTIVE' && ['ASSIGNED', 'IN_PROGRESS'].includes(t.status)) {
      p.push({ task_id: t.task_id, problema: `Atribuída a ${t.responsavel}, que está ${statusAgentes[t.responsavel]}.` });
    }
    if (t.pai && !porId[t.pai]) p.push({ task_id: t.task_id, problema: `Tarefa-mãe ${t.pai} não existe.` });
    if (t.status === 'COMPLETED') {
      if (t.filhas.some(f => porId[f] && !FINAIS.includes(porId[f].status))) p.push({ task_id: t.task_id, problema: 'Concluída com subtarefas abertas.' });
      const q = (t.qualidade && t.qualidade.respostas) || {};
      if (Object.keys(CHECKLIST_QUALIDADE).some(k => q[k] !== true)) p.push({ task_id: t.task_id, problema: 'Concluída sem a checagem de qualidade completa.' });
      if (t.execucoes.some(e => e.status === 'OK') && t.aprovacao.necessaria && t.aprovacao.status !== 'APROVADA') p.push({ task_id: t.task_id, problema: 'Executada sem a aprovação humana exigida.' });
    }
    if (t.execucoes.filter(e => e.status === 'OK').length !== new Set(t.execucoes.filter(e => e.status === 'OK').map(e => e.operacao)).size) {
      p.push({ task_id: t.task_id, problema: 'A mesma operação aparece executada mais de uma vez.' });
    }
  });
  return p;
}

/* Tarefa abandonada pela metade: aberta e sem movimento há mais de `horas`. */
function paradas(todas, horas = 24, agora = Date.now()) {
  return todas.filter(t => ['WAITING', 'BLOCKED', 'ASSIGNED', 'IN_PROGRESS'].includes(t.status) && agora - Date.parse(t.atualizada_em) > horas * 3600000);
}

module.exports = { duplicidadeLancamento, inconsistenciasTarefas, paradas };
