'use strict';
/* Apoio comum dos testes: cada teste roda numa pasta de dados nova e vazia. */
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.RACA_TESTE = '1';

const registro = require('../orchestration/registro');
const tarefas = require('../orchestration/tarefas');
const protocolo = require('../orchestration/protocolo');
const executor = require('../orchestration/executor');
const ferramentas = require('../orchestration/ferramentas');
const monitor = require('../orchestration/monitor');
const auditoria = require('../logs/auditoria');
const memoria = require('../memory/memoria');
const armazem = require('../orchestration/armazem');
const politica = require('../permissions/politica');

const P = 'proprietario';

function novoAmbiente() {
  process.env.RACA_DADOS = fs.mkdtempSync(path.join(process.env.RACA_TMP || os.tmpdir(), 'raca-'));
  registro.limparCache();
  ['LER_ENTRADA', 'LIVRO_LANCAMENTOS', 'LER_HISTORICO', 'REGISTRO_TAREFAS', 'DELEGAR_AGENTES'].forEach(f => ferramentas.simularFalha(f, false));
  ['auditor', 'financeiro', 'comercial', 'captador', 'lancador', 'ceo'].forEach(a => executor.registrarHandlerDeTeste(a, null));
  return process.env.RACA_DADOS;
}

const FICHA_OK = [
  'Nome: Maria Souza', 'CPF: 529.982.247-25', 'Categoria: B', 'Serviço: Primeira habilitação',
  'Valor total: 2.500,00', 'Entrada: 500', 'Forma da entrada: PIX', 'Parcelas: 4', 'Primeiro vencimento: 15/11/2026'
].join('\n');

const ficha = id => registro.ficha(id);
const pedirFicha = (dados, extra = {}) => executor.pedido(Object.assign({ texto: 'Lançar ficha do aluno', tipo: 'LANCAR_FICHA', dados }, extra));
const aprovar = id => { tarefas.decidirAprovacao(P, id, true, 'conferido'); executor.avisarCeo(id, { aprovacao: 'APROVADA' }); };
const negar = id => { tarefas.decidirAprovacao(P, id, false, 'valor errado'); executor.avisarCeo(id, { aprovacao: 'NEGADA' }); };
const caixaDono = () => protocolo.caixaDe(P, { naoLidas: false }).map(x => x.mensagem);
const mensagens = id => protocolo.daTarefa(id);
const livro = () => armazem.lerJSON('tasks/dados/lancamentos.json', { lancamentos: [] }).lancamentos;
const acoesLog = id => auditoria.listar({ task_id: id }).map(r => r.acao);

/* Agente "preparado" com implementação simulada, só para testes de comunicação. */
function ativarComStub(id, comportamento = 'ok') {
  executor.registrarHandlerDeTeste(id, {
    processar(msg, ctx) {
      if (msg.action !== 'DELEGATE') return;
      ctx.tarefas.iniciar(msg.task_id);
      if (comportamento === 'erro') {
        ctx.tarefas.registrarErro(msg.task_id, { nivel: 'HIGH', descricao: `${id} não conseguiu concluir`, causa: 'falha simulada' });
        ctx.enviar({ task_id: msg.task_id, to_agent: 'ceo', action: 'ERROR_REPORT', errors: [{ nivel: 'HIGH', descricao: `${id} não conseguiu concluir`, causa: 'falha simulada' }] });
        return;
      }
      const resultado = { achados: [`resultado de ${id}`], recebido: msg.input, fontes: ['registros internos'] };
      ctx.tarefas.enviarRevisao(msg.task_id, resultado, { objetivo_cumprido: true, dados_completos: true, sem_inconsistencias: true, sem_erros: true, fundamentada: true, nada_faltando: true, pode_concluir: true });
      ctx.enviar({ task_id: msg.task_id, to_agent: 'ceo', action: id === 'auditor' ? 'AUDIT_RESULT' : 'RESULT', result: resultado });
    }
  });
  registro.mudarStatusAgente(id, 'ACTIVE', P, 'teste');
}

module.exports = {
  registro, tarefas, protocolo, executor, ferramentas, monitor, auditoria, memoria, armazem, politica,
  P, novoAmbiente, FICHA_OK, ficha, pedirFicha, aprovar, negar, caixaDono, mensagens, livro, acoesLog, ativarComStub
};
