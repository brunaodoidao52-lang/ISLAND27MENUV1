'use strict';
/* SKILL reporting — transformar resultados verificados em relatórios claros para o proprietário. */
const { SEM_DADOS } = require('../../orchestration/definicoes');

const linha = (rotulo, valor) => `${rotulo}: ${valor === undefined || valor === null || valor === '' ? '—' : valor}`;
const { brl } = require('../financial_analysis');

/* Relatório final de uma tarefa. Só usa o que está registrado na tarefa. */
function relatorioTarefa(t) {
  const partes = [`${t.task_id} — ${t.titulo}`, linha('Status', t.status), linha('Prioridade', t.prioridade)];
  t.etapas.forEach(e => partes.push(linha(`Etapa ${e.ordem} (${e.agente})`, e.status)));
  if (t.aprovacao.necessaria) partes.push(linha('Aprovação humana', `${t.aprovacao.status}${t.aprovacao.decidida_por ? ' por ' + t.aprovacao.decidida_por : ''}`));
  const ok = t.execucoes.filter(e => e.status === 'OK');
  ok.forEach(e => partes.push(linha(`Executado`, `${e.operacao} em ${e.concluida_em}`)));
  if (t.erros.length) t.erros.forEach(e => partes.push(linha(`Erro ${e.nivel}`, `${e.descricao} (causa: ${e.causa})${e.resolvido ? ' — resolvido' : ''}`)));
  if (!ok.length && t.status === 'COMPLETED') partes.push('Observação: nenhuma operação executada nesta tarefa.');
  return partes.join('\n');
}

function resumoLancamento(l) {
  if (!l) return SEM_DADOS;
  return [
    `Lançamento nº ${l.numero} — ${l.ficha.nome}`,
    linha('Serviço', `${l.ficha.servico} (categoria ${l.ficha.categoria})`),
    linha('Valor final', brl(l.valor_final)),
    linha('Parcelas', l.parcelas.map(p => `${p.descricao} ${brl(p.valor)} em ${p.vencimento}`).join('; '))
  ].join('\n');
}

module.exports = { relatorioTarefa, resumoLancamento, brl };
