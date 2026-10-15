'use strict';
/*
 * ferramentas.js — as únicas ferramentas que existem nesta etapa.
 * Nenhuma acessa site, rede, WhatsApp, redes sociais ou sistema de terceiros.
 *
 * Um agente só consegue uma ferramenta que esteja na própria ficha (TOOLS).
 * Para testes, `simularFalha(nome)` deixa uma ferramenta indisponível.
 */
const armazem = require('./armazem');
const auditoria = require('../logs/auditoria');
const politica = require('../permissions/politica');

const ARQ_LIVRO = 'tasks/dados/lancamentos.json';
const indisponiveis = new Set((process.env.RACA_FERRAMENTAS_INDISPONIVEIS || '').split(',').filter(Boolean));

class FerramentaIndisponivel extends Error {
  constructor(nome) { super(`Ferramenta indisponível: ${nome}`); this.codigo = 'FERRAMENTA_INDISPONIVEL'; this.nivel = 'HIGH'; this.origem = 'ferramenta'; this.semEfeito = true; }
}

function simularFalha(nome, ligada = true) { if (ligada) indisponiveis.add(nome); else indisponiveis.delete(nome); }

const implementacoes = {
  LER_ENTRADA: (ficha, ctx) => ({
    /* Só a entrada da tarefa em que o agente está trabalhando. */
    ler: taskId => {
      const t = ctx.tarefa(taskId);
      if (t.responsavel !== ficha.AGENT_ID) throw new politica.SemPermissao(`${ficha.AGENT_ID} não é responsável por ${taskId}.`);
      return JSON.parse(JSON.stringify(t.entrada));
    }
  }),
  LIVRO_LANCAMENTOS: ficha => ({
    consultar: (filtro = {}) => {
      politica.exigir(ficha, 'READ', 'consultar o livro de lançamentos');
      const livro = armazem.lerJSON(ARQ_LIVRO, { lancamentos: [] });
      return livro.lancamentos.filter(l => Object.entries(filtro).every(([k, v]) => l[k] === v));
    },
    gravar: lancamento => {
      politica.exigir(ficha, 'EXECUTE', 'gravar no livro de lançamentos');
      return armazem.comTrava(() => {
        const livro = armazem.lerJSON(ARQ_LIVRO, { lancamentos: [], proximo_numero: 1 });
        // Segunda barreira contra lançamento duplo: a mesma chave nunca entra duas vezes no livro.
        const igual = lancamento.chave && livro.lancamentos.find(l => l.chave === lancamento.chave);
        if (igual) return Object.assign({ ja_existia: true }, igual);
        const registro = Object.assign({ numero: livro.proximo_numero || livro.lancamentos.length + 1, registrado_em: new Date().toISOString(), registrado_por: ficha.AGENT_ID, situacao: 'ATIVO' }, lancamento);
        livro.lancamentos.push(registro);
        livro.proximo_numero = registro.numero + 1;
        armazem.gravarJSON(ARQ_LIVRO, livro);
        return registro;
      });
    }
  }),
  LER_HISTORICO: ficha => ({
    log: filtro => { politica.exigir(ficha, 'READ', 'ler histórico'); return auditoria.listar(filtro); },
    verificarLog: () => { politica.exigir(ficha, 'READ', 'verificar log'); return auditoria.verificar(); }
  }),
  REGISTRO_TAREFAS: () => ({}),
  DELEGAR_AGENTES: () => ({})
};

/* Entrega a ferramenta ao agente — ou recusa (sem permissão / indisponível). */
function obter(ficha, nome, ctx) {
  politica.exigirFerramenta(ficha, nome);
  if (indisponiveis.has(nome)) {
    auditoria.registrar({ agente: ficha.AGENT_ID, acao: 'FERRAMENTA_INDISPONIVEL', entrada: { ferramenta: nome }, erro: 'indisponível' });
    throw new FerramentaIndisponivel(nome);
  }
  const impl = implementacoes[nome];
  if (!impl) throw new FerramentaIndisponivel(nome);
  return impl(ficha, ctx);
}

module.exports = { FerramentaIndisponivel, simularFalha, obter, ARQ_LIVRO };
