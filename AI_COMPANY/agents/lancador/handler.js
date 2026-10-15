'use strict';
/*
 * LANÇADOR v1.0 — registra a ficha no livro interno, uma única vez, só com aprovação humana.
 * O que vai para a aprovação é exatamente o que é gravado: o pacote preparado
 * (ficha + parcelas + valor) fica na memória da tarefa e é reaproveitado na execução.
 */
const { hash } = require('../../orchestration/tarefas');

const TODAS_SIM = { objetivo_cumprido: true, dados_completos: true, sem_inconsistencias: true, sem_erros: true, fundamentada: true, nada_faltando: true, pode_concluir: true };
const hoje = () => new Date().toISOString().slice(0, 10);

function erroParaCeo(ctx, id, nivel, descricao, causa, result = {}, origem = 'dados') {
  // origem "dados": o problema veio da informação recebida, não de defeito do LANÇADOR.
  ctx.tarefas.registrarErro(id, { nivel, descricao, causa, origem });
  ctx.enviar({ task_id: id, to_agent: 'ceo', action: 'ERROR_REPORT', result, errors: [{ nivel, descricao, causa }] });
}

/* Confere a ficha registrada na etapa do CAPTADOR (e se a mensagem bate com ela). */
function fichaRegistrada(ctx, id, msg) {
  const t = ctx.tarefa(id);
  const registrado = t.resultado.captador && t.resultado.captador.ficha;
  if (!registrado) return { erro: ['HIGH', 'A etapa do CAPTADOR não tem ficha registrada.', 'Passagem sem dados'] };
  if (msg && msg.input.ficha && hash(msg.input.ficha) !== hash(registrado)) {
    return { erro: ['CRITICAL', 'A ficha da mensagem é diferente da ficha registrada na etapa do CAPTADOR.', 'Dados contraditórios entre mensagem e registro'] };
  }
  return { ficha: registrado, marca: hash(t.entrada) };
}

/* Duplicidade é conferida em toda tentativa (outro lançamento pode ter entrado no meio tempo). */
function duplicado(ctx, id, ficha, livro) {
  const repetidos = ctx.skill('auditing').duplicidadeLancamento(livro.consultar(), ficha).filter(l => l.task_id !== id);
  return repetidos[0] || null;
}

function lancar(ctx, id, msg) {
  const f = fichaRegistrada(ctx, id, msg);
  if (f.erro) { erroParaCeo(ctx, id, ...f.erro); return; }
  const livro = ctx.ferramenta('LIVRO_LANCAMENTOS');
  const rep = duplicado(ctx, id, f.ficha, livro);
  if (rep) { erroParaCeo(ctx, id, 'MEDIUM', `Já existe o lançamento nº ${rep.numero} para este CPF, serviço e categoria.`, 'Lançamento duplicado', { lancamento_existente: rep.numero }); return; }

  // Reaproveita o pacote já mostrado na aprovação (mesmos dados, mesmas datas).
  const mem = ctx.memoria.lerTarefa(id);
  let pacote = mem.pacote && mem.pacote.valor && mem.pacote.valor.marca === f.marca ? mem.pacote.valor : null;
  if (!pacote) {
    const fin = ctx.skill('financial_analysis');
    const parcelas = fin.gerarParcelas(Object.assign({ data_entrada: hoje() }, f.ficha));
    const valor_final = (Math.round(f.ficha.valor_total * 100) - Math.round((f.ficha.desconto || 0) * 100)) / 100;
    const resumo = `Lançar ficha de ${f.ficha.nome} — ${f.ficha.servico} (cat. ${f.ficha.categoria}) — valor final ${fin.brl(valor_final)} em ${parcelas.length} lançamento(s).`;
    pacote = { marca: f.marca, ficha: f.ficha, parcelas, valor_final, resumo };
    ctx.memoria.gravarTarefa(id, 'pacote', pacote);
  }
  const dados = { ficha: pacote.ficha, parcelas: pacote.parcelas, valor_final: pacote.valor_final };
  const chave = hash({ cpf: pacote.ficha.cpf, servico: pacote.ficha.servico, categoria: pacote.ficha.categoria, task: id });
  const r = ctx.tarefas.executar(id, { operacao: 'LANCAR_FICHA', chave, categorias: ['financeira'], resumo: pacote.resumo, dados }, () => {
    const t = ctx.tarefa(id);
    return livro.gravar(Object.assign({ task_id: id, chave, aprovado_por: t.aprovacao.decidida_por, aprovado_em: t.aprovacao.decidida_em }, dados)).numero;
  });
  if (r.aguardandoAprovacao) {
    ctx.enviar({ task_id: id, to_agent: 'ceo', action: 'REQUEST_APPROVAL', input: { resumo: pacote.resumo, parcelas: pacote.parcelas, valor_final: pacote.valor_final } });
    return;
  }
  // Execução confirmada pelo proprietário pode não ter o número: busca no próprio livro, não supõe.
  let numero = r.resultado;
  if (numero === null || numero === undefined) {
    const achados = livro.consultar({ task_id: id });
    if (achados.length !== 1) { erroParaCeo(ctx, id, 'HIGH', `Não tenho dados suficientes. A execução consta como feita, mas o livro tem ${achados.length} lançamento(s) desta tarefa.`, 'Execução confirmada sem lançamento correspondente', {}, 'execucao'); return; }
    numero = achados[0].numero;
  }
  const resultado = { lancamento: numero, valor_final: pacote.valor_final, parcelas: pacote.parcelas, fontes: [`Etapa do CAPTADOR em ${id}`, `Livro interno, lançamento nº ${numero}`], limitacoes: ['Registrado só no livro interno; sem integração externa nesta etapa.'] };
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
