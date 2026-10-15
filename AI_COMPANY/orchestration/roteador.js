'use strict';
/*
 * roteador.js — como o CEO interpreta um pedido e escolhe quem faz.
 *
 * 1. Se o pedido é de um fluxo conhecido (fluxos.json), usa o plano do fluxo.
 * 2. Senão, procura os agentes cujas palavras-chave aparecem no pedido.
 * 3. Entre os capazes, escolhe pelo BALANCEAMENTO: especialização,
 *    disponibilidade, prioridade, carga de trabalho e histórico de desempenho.
 * Se ninguém serve: "Não tenho dados suficientes." — o CEO não chuta.
 */
const fs = require('fs');
const path = require('path');
const registro = require('./registro');
const tarefas = require('./tarefas');
const { SEM_DADOS, FINAIS } = require('./definicoes');
const gestao = require('../skills/task_management');

const FLUXOS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fluxos.json'), 'utf8'));
delete FLUXOS._sobre;

const normal = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function fluxoPorTexto(texto) {
  const n = normal(texto);
  return Object.entries(FLUXOS).find(([, f]) => f.palavras_chave.some(p => n.includes(normal(p)))) || null;
}

/* Candidatos para um pedido, com o motivo de cada pontuação. */
function candidatos(texto, { excluir = ['ceo'] } = {}) {
  const { agentes } = registro.carregar();
  const reg = registro.registro().agentes;
  const abertas = tarefas.listar().filter(t => !FINAIS.includes(t.status));
  const n = normal(texto);
  return Object.values(agentes)
    .filter(f => !excluir.includes(f.AGENT_ID))
    .map(f => {
      const acertos = f.KEYWORDS.filter(k => n.includes(normal(k)));
      const r = reg[f.AGENT_ID];
      return gestao.avaliarCandidato({
        agente: f.AGENT_ID,
        especializacao: acertos.length,
        palavras: acertos,
        disponivel: r.status === 'ACTIVE',
        status: r.status,
        carga: abertas.filter(t => t.responsavel === f.AGENT_ID),
        concluidas: r.tasks_completed,
        falhas: r.tasks_failed
      });
    })
    .filter(c => c.especializacao > 0)
    .sort((a, b) => b.pontuacao - a.pontuacao);
}

/* Plano para um pedido: { tipo, etapas, categorias_aprovacao, motivo } ou { semDados: true, motivo }. */
function planejar({ texto, tipo }) {
  if (tipo) {
    const f = FLUXOS[tipo];
    if (!f) return { semDados: true, motivo: `${SEM_DADOS} Fluxo desconhecido: ${tipo}.` };
    return { tipo, etapas: f.etapas, categorias_aprovacao: f.categorias_aprovacao, motivo: `Fluxo ${tipo} v${f.versao}` };
  }
  const achado = fluxoPorTexto(texto);
  if (achado) {
    const [nome, f] = achado;
    return { tipo: nome, etapas: f.etapas, categorias_aprovacao: f.categorias_aprovacao, motivo: `Pedido reconhecido como ${nome}` };
  }
  const lista = candidatos(texto);
  const disponiveis = lista.filter(c => c.disponivel);
  if (!disponiveis.length) {
    const motivo = lista.length
      ? `${SEM_DADOS} Os agentes capazes (${lista.map(c => `${c.agente}: ${c.status}`).join(', ')}) não estão ativos.`
      : `${SEM_DADOS} Nenhum agente tem as habilidades para este pedido.`;
    return { semDados: true, motivo, candidatos: lista };
  }
  return { tipo: 'GERAL', etapas: [disponiveis[0].agente], categorias_aprovacao: [], motivo: disponiveis[0].explicacao, candidatos: lista };
}

module.exports = { FLUXOS, planejar, candidatos, fluxoPorTexto };
