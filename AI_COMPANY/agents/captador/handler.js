'use strict';
/*
 * CAPTADOR v1.0 — estrutura e confere os dados da matrícula.
 * Nunca completa nem corrige nada por conta própria: o que falta ou não
 * confere volta para o CEO, campo a campo.
 */
module.exports = {
  processar(msg, ctx) {
    if (msg.action !== 'DELEGATE' && msg.action !== 'REQUEST_CORRECTION') return;
    const id = msg.task_id;
    const t = ctx.tarefa(id);
    if (t.status === 'ASSIGNED') ctx.tarefas.iniciar(id);

    const entrada = ctx.ferramenta('LER_ENTRADA').ler(id);
    const doc = ctx.skill('document_analysis').analisarFicha(entrada.dados);
    const fin = ctx.skill('financial_analysis');
    const com = ctx.skill('communication');
    ctx.memoria.gravarTarefa(id, 'analise_captador', { faltando: doc.faltando, invalidos: doc.invalidos.map(i => i.campo), conflitos: doc.conflitos.map(c => c.campo), ambiguos: doc.ambiguos.map(a => a.campo) });

    // Plano de pagamento: só pede o que realmente falta para gerar as parcelas.
    const f = doc.ficha;
    if (f.valor_total !== undefined) {
      const restante = Math.round(f.valor_total * 100) - Math.round((f.desconto || 0) * 100) - Math.round((f.entrada || 0) * 100);
      if (restante > 0 && f.parcelas === undefined && !doc.invalidos.some(i => i.campo === 'parcelas')) doc.faltando.push('parcelas');
      if (restante > 0 && !f.primeiro_vencimento && !doc.invalidos.some(i => i.campo === 'primeiro_vencimento')) doc.faltando.push('primeiro_vencimento');
      if (f.entrada > 0 && !f.forma_entrada && !doc.ambiguos.some(a => a.campo === 'forma_entrada')) doc.faltando.push('forma_entrada');
    }

    // Dado inválido: erro MEDIUM, com o motivo de cada campo.
    if (doc.invalidos.length) {
      const descricao = `Dados inválidos na ficha: ${doc.invalidos.map(i => i.campo).join(', ')}.`;
      ctx.tarefas.registrarErro(id, { nivel: 'MEDIUM', descricao, causa: 'Entrada com formato inválido', recuperacao: 'Proprietário corrige os campos e complementa a tarefa.' });
      ctx.enviar({ task_id: id, to_agent: 'ceo', action: 'ERROR_REPORT', result: { invalidos: doc.invalidos, faltando: doc.faltando }, warnings: com.pedidoDeDados(doc), errors: [com.erro({ nivel: 'MEDIUM', descricao, causa: 'Entrada com formato inválido' })] });
      return;
    }
    // Falta dado, conflito ou ambiguidade: para e pergunta (WAITING).
    if (doc.faltando.length || doc.conflitos.length || doc.ambiguos.length) {
      ctx.tarefas.mover(id, 'WAITING', 'Aguardando dados do proprietário');
      ctx.enviar({ task_id: id, to_agent: 'ceo', action: 'STATUS_UPDATE', result: { faltando: doc.faltando, conflitos: doc.conflitos, ambiguos: doc.ambiguos }, warnings: com.pedidoDeDados(doc) });
      return;
    }
    const problemasPlano = fin.verificarPlano(f);
    if (problemasPlano.length) {
      const descricao = `Plano de pagamento incoerente: ${problemasPlano.join(' ')}`;
      ctx.tarefas.registrarErro(id, { nivel: 'MEDIUM', descricao, causa: 'Valores informados não fecham', recuperacao: 'Proprietário confere os valores.' });
      ctx.enviar({ task_id: id, to_agent: 'ceo', action: 'ERROR_REPORT', result: { problemas: problemasPlano }, errors: [com.erro({ nivel: 'MEDIUM', descricao, causa: 'Valores informados não fecham' })] });
      return;
    }
    const resultado = { ficha: f, fontes: doc.fontes, avisos: doc.avisos, campos_ignorados: doc.desconhecidos };
    ctx.tarefas.passar(id, 'lancador', resultado);
    ctx.enviar({ task_id: id, to_agent: 'lancador', action: 'HANDOFF', input: { ficha: f, fontes: doc.fontes }, warnings: doc.avisos });
  }
};
