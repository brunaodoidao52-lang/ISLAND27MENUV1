'use strict';
/*
 * CEO v1.0 — COORDENAR + SUPERVISIONAR + VALIDAR + REPORTAR.
 * O CEO não faz o trabalho dos especialistas: cria a tarefa, escolhe quem
 * faz, acompanha, confere e avisa o proprietário.
 */
const roteador = require('../../orchestration/roteador');
const { SEM_DADOS, REVISAR, AGENTE_HUMANO } = require('../../orchestration/definicoes');

const MAX_NOVAS_TENTATIVAS = 1;
const MAX_CORRECOES = 2; // depois disso o CEO para e chama o proprietário (evita laço entre agentes)

function reportar(ctx, taskId, resumo, extra = {}) {
  ctx.enviar({ task_id: taskId, to_agent: AGENTE_HUMANO, action: 'REPORT', result: Object.assign({ resumo }, extra.result || {}), warnings: extra.warnings || [], errors: extra.errors || [] });
}

/* Delega a próxima etapa pendente do plano. */
function delegarProxima(ctx, t) {
  const etapa = t.etapas.find(e => e.status !== 'CONCLUIDA');
  if (!etapa) return false;
  ctx.tarefas.atribuir(t.task_id, etapa.agente, `etapa ${etapa.ordem} do plano`);
  // "rodada" diferencia uma nova delegação legítima de um reenvio por falha de comunicação.
  const rodada = t.historico.filter(h => h.para === 'ASSIGNED').length + 1;
  ctx.enviar({ task_id: t.task_id, to_agent: etapa.agente, action: 'DELEGATE', input: { objetivo: t.titulo, tipo: t.tipo, etapa: etapa.ordem, plano: t.etapas.map(e => e.agente), rodada } });
  return true;
}

module.exports = {
  /* Passos 1 a 6 do PRINCÍPIO DE DELEGAÇÃO. */
  receberPedido(pedido, ctx) {
    const texto = String(pedido.texto || '').trim();
    if (!texto && !pedido.tipo) throw Object.assign(new Error(`${SEM_DADOS} O pedido está vazio.`), { codigo: 'ENTRADA_INCOMPLETA', nivel: 'MEDIUM' });
    const plano = roteador.planejar({ texto, tipo: pedido.tipo });
    const { tarefa, duplicada } = ctx.tarefas.criar({
      titulo: texto || pedido.tipo, descricao: plano.motivo, tipo: plano.tipo || 'GERAL',
      entrada: { dados: pedido.dados === undefined ? null : pedido.dados }, prioridade: pedido.prioridade || 'MEDIUM',
      prazo: pedido.prazo, solicitante: AGENTE_HUMANO, etapas: plano.semDados ? [] : plano.etapas,
      categorias_aprovacao: plano.categorias_aprovacao || []
    });
    if (duplicada) {
      reportar(ctx, tarefa.task_id, `Este pedido já existe: ${tarefa.task_id} (${tarefa.status}). Não criei outra tarefa.`, { warnings: ['Tarefa duplicada'] });
      return { task_id: tarefa.task_id, duplicada: true, status: tarefa.status };
    }
    if (plano.semDados) {
      ctx.tarefas.mover(tarefa.task_id, 'BLOCKED', plano.motivo);
      reportar(ctx, tarefa.task_id, plano.motivo, { warnings: [SEM_DADOS], result: { candidatos: (plano.candidatos || []).map(c => c.explicacao) } });
      return { task_id: tarefa.task_id, bloqueada: true, motivo: plano.motivo };
    }
    delegarProxima(ctx, ctx.tarefa(tarefa.task_id));
    return { task_id: tarefa.task_id, plano: plano.etapas, motivo: plano.motivo };
  },

  /* Passos 7 a 11: acompanhar, receber, validar, consolidar e entregar. */
  processar(msg, ctx) {
    const t = ctx.tarefa(msg.task_id);
    const de = msg.from_agent;

    // Proprietário decidiu uma aprovação ou complementou dados.
    if (de === AGENTE_HUMANO) {
      if (msg.input.aprovacao === 'APROVADA') {
        // Só repassa se a tarefa está de fato esperando o agente retomar (evita repetir por aviso duplicado).
        if (t.status !== 'ASSIGNED' || t.aprovacao.status !== 'APROVADA' || !t.responsavel || t.responsavel === 'ceo') return;
        ctx.enviar({ task_id: t.task_id, to_agent: t.responsavel, action: 'STATUS_UPDATE', input: { aprovacao: 'APROVADA', operacao: t.aprovacao.operacao } });
      } else if (msg.input.aprovacao === 'NEGADA') {
        reportar(ctx, t.task_id, `Aprovação negada. Nada foi executado. A tarefa ficou BLOCKED aguardando sua decisão (corrigir os dados ou cancelar). Motivo: ${t.aprovacao.motivo || '—'}`);
      } else if (msg.input.complemento || msg.input.retomar) {
        delegarProxima(ctx, t);
      }
      return;
    }

    if (msg.action === 'REQUEST_APPROVAL') {
      reportar(ctx, t.task_id, `HUMAN APPROVAL REQUIRED — ${t.aprovacao.resumo}`, {
        result: { operacao: t.aprovacao.operacao, categorias: t.aprovacao.categorias, detalhes: msg.input },
        warnings: [`Para aprovar: node AI_COMPANY/empresa.js aprovar ${t.task_id} "motivo"`, `Para negar: node AI_COMPANY/empresa.js negar ${t.task_id} "motivo"`]
      });
      return;
    }

    if (msg.action === 'STATUS_UPDATE' && t.status === 'WAITING') {
      reportar(ctx, t.task_id, `${de.toUpperCase()} parou a tarefa: faltam dados ou há dúvida. Complete as informações para continuar.`, {
        warnings: msg.warnings, result: msg.result
      });
      return;
    }

    if (msg.action === 'ERROR_REPORT') {
      const erro = msg.errors[0] || {};
      // Recuperação segura: uma nova tentativa automática só para falha leve de ferramenta.
      const falhasFerramenta = t.erros.filter(e => e.origem === 'ferramenta');
      const recuperavel = ['MEDIUM', 'LOW'].includes(erro.nivel) && erro.origem === 'ferramenta' && falhasFerramenta.length <= MAX_NOVAS_TENTATIVAS;
      if (recuperavel && registroAtivo(ctx, de)) {
        t.erros.forEach((e, i) => { if (!e.resolvido) ctx.tarefas.resolverErro(t.task_id, i, 'nova tentativa automática do CEO'); });
        delegarProxima(ctx, ctx.tarefa(t.task_id));
        return;
      }
      const humano = ['CRITICAL', 'HIGH'].includes(erro.nivel);
      reportar(ctx, t.task_id, `${de.toUpperCase()} reportou erro ${erro.nivel || ''}: ${erro.descricao || REVISAR}${humano ? ' — intervenção humana necessária.' : ''}`, {
        errors: msg.errors, result: msg.result
      });
      return;
    }

    if ((msg.action === 'RESULT' || msg.action === 'AUDIT_RESULT') && t.status === 'REVIEW') {
      // Não acredita só na mensagem: confere o que o sistema registrou.
      const correcoes = [];
      if (t.tipo === 'LANCAR_FICHA') {
        if (!t.execucoes.some(e => e.operacao === 'LANCAR_FICHA' && e.status === 'OK')) {
          correcoes.push('O resultado diz que lançou, mas não há execução LANCAR_FICHA registrada.');
        } else {
          // Confere no próprio livro: existe, é desta tarefa, é um só e as parcelas fecham.
          const doLivro = ctx.ferramenta('LIVRO_LANCAMENTOS').consultar({ task_id: t.task_id });
          const soma = l => l.parcelas.reduce((s, p) => s + Math.round(p.valor * 100), 0);
          if (doLivro.length !== 1) correcoes.push(`O livro tem ${doLivro.length} lançamento(s) para esta tarefa (esperado: 1).`);
          else if (doLivro[0].numero !== msg.result.lancamento) correcoes.push('O número informado não confere com o livro.');
          else if (soma(doLivro[0]) !== Math.round(doLivro[0].valor_final * 100)) correcoes.push('As parcelas gravadas não somam o valor final.');
        }
      }
      const todas = correcoes.concat(require('../../orchestration/tarefas').pendencias(t));
      const r = todas.length ? { concluida: false, pendencias: todas } : ctx.tarefas.validar(t.task_id, { consolidado: msg.result });
      if (r.concluida) {
        const rel = ctx.skill('reporting');
        const texto = rel.relatorioTarefa(ctx.tarefa(t.task_id));
        reportar(ctx, t.task_id, `Tarefa concluída e validada.\n${texto}`, { result: msg.result });
      } else if (t.avisos.filter(a => a.tipo === 'CORRECAO').length >= MAX_CORRECOES) {
        ctx.tarefas.mover(t.task_id, 'BLOCKED', `correção pedida ${MAX_CORRECOES} vezes sem sucesso`);
        reportar(ctx, t.task_id, `${de.toUpperCase()} não conseguiu corrigir depois de ${MAX_CORRECOES} pedidos. Tarefa BLOCKED: necessário revisar.`, { warnings: r.pendencias });
      } else {
        ctx.tarefas.pedirCorrecao(t.task_id, de, r.pendencias);
        ctx.enviar({ task_id: t.task_id, to_agent: de, action: 'REQUEST_CORRECTION', input: { correcoes: r.pendencias }, warnings: [REVISAR] });
      }
    }
  }
};

function registroAtivo(ctx, agente) {
  try { return require('../../orchestration/registro').statusAgente(agente) === 'ACTIVE'; } catch (e) { return false; }
}
