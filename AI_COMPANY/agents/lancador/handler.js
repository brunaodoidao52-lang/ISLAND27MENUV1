'use strict';
/*
 * LANÇADOR v1.0 — registra a ficha no livro interno, uma única vez, só com aprovação humana.
 */
const { hash } = require('../../orchestration/tarefas');

const TODAS_SIM = { objetivo_cumprido: true, dados_completos: true, sem_inconsistencias: true, sem_erros: true, fundamentada: true, nada_faltando: true, pode_concluir: true };
const hoje = () => new Date().toISOString().slice(0, 10);

function erroParaCeo(ctx, id, nivel, descricao, causa, result = {}, origem = 'dados') {
  // origem "dados": o problema veio da informação recebida, não de defeito do LANÇADOR.
  ctx.tarefas.registrarErro(id, { nivel, descricao, causa, origem });
  ctx.enviar({ task_id: id, to_agent: 'ceo', action: 'ERROR_REPORT', result, errors: [{ nivel, descricao, causa }] });
}

/* Monta (sem gravar) o lançamento a partir do que o sistema registrou da etapa do CAPTADOR. */
function preparar(ctx, id, msg) {
  const t = ctx.tarefa(id);
  const registrado = t.resultado.captador && t.resultado.captador.ficha;
  if (!registrado) return { erro: ['HIGH', 'A etapa do CAPTADOR não tem ficha registrada.', 'Passagem sem dados'] };
  // Dados contraditórios: a mensagem não pode dizer uma coisa e o registro outra.
  if (msg && msg.input.ficha && hash(msg.input.ficha) !== hash(registrado)) {
    return { erro: ['CRITICAL', 'A ficha da mensagem é diferente da ficha registrada na etapa do CAPTADOR.', 'Dados contraditórios entre mensagem e registro'] };
  }
  const ficha = registrado;
  const livro = ctx.ferramenta('LIVRO_LANCAMENTOS');
  const repetidos = ctx.skill('auditing').duplicidadeLancamento(livro.consultar(), ficha).filter(l => l.task_id !== id);
  if (repetidos.length) return { erro: ['MEDIUM', `Já existe o lançamento nº ${repetidos[0].numero} para este CPF, serviço e categoria.`, 'Lançamento duplicado'], result: { lancamento_existente: repetidos[0].numero } };
  const fin = ctx.skill('financial_analysis');
  const parcelas = fin.gerarParcelas(Object.assign({ data_entrada: hoje() }, ficha));
  const valor_final = (Math.round(ficha.valor_total * 100) - Math.round((ficha.desconto || 0) * 100)) / 100;
  const resumo = `Lançar ficha de ${ficha.nome} — ${ficha.servico} (cat. ${ficha.categoria}) — valor final ${fin.brl(valor_final)} em ${parcelas.length} lançamento(s).`;
  return { ficha, parcelas, valor_final, resumo, livro };
}

function lancar(ctx, id, msg) {
  const p = preparar(ctx, id, msg);
  if (p.erro) { erroParaCeo(ctx, id, ...p.erro, p.result || {}); return; }
  const chave = hash({ cpf: p.ficha.cpf, servico: p.ficha.servico, categoria: p.ficha.categoria, task: id });
  const r = ctx.tarefas.executar(id, { operacao: 'LANCAR_FICHA', chave, categorias: ['financeira'], resumo: p.resumo }, () => {
    const t = ctx.tarefa(id);
    return p.livro.gravar({ task_id: id, ficha: p.ficha, parcelas: p.parcelas, valor_final: p.valor_final, aprovado_por: t.aprovacao.decidida_por, aprovado_em: t.aprovacao.decidida_em }).numero;
  });
  if (r.aguardandoAprovacao) {
    ctx.memoria.gravarTarefa(id, 'resumo_lancamento', p.resumo);
    ctx.enviar({ task_id: id, to_agent: 'ceo', action: 'REQUEST_APPROVAL', input: { resumo: p.resumo, parcelas: p.parcelas, valor_final: p.valor_final } });
    return;
  }
  const numero = r.resultado;
  const resultado = { lancamento: numero, valor_final: p.valor_final, parcelas: p.parcelas, fontes: [`Etapa do CAPTADOR em ${id}`, `Livro interno, lançamento nº ${numero}`], limitacoes: ['Registrado só no livro interno; sem integração externa nesta etapa.'] };
  ctx.tarefas.enviarRevisao(id, resultado, TODAS_SIM);
  ctx.enviar({ task_id: id, to_agent: 'ceo', action: 'RESULT', result: resultado, warnings: r.jaExecutada ? ['Operação já tinha sido executada; não foi repetida.'] : [] });
}

module.exports = {
  processar(msg, ctx) {
    const id = msg.task_id;
    const t = ctx.tarefa(id);
    const retomando = msg.action === 'STATUS_UPDATE' && msg.input.aprovacao === 'APROVADA';
    if (!['HANDOFF', 'DELEGATE', 'REQUEST_CORRECTION'].includes(msg.action) && !retomando) return;
    if (t.status === 'ASSIGNED') ctx.tarefas.iniciar(id);
    lancar(ctx, id, msg.action === 'HANDOFF' ? msg : null);
  }
};
