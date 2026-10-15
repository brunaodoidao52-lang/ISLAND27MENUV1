'use strict';
/*
 * auditoria.js — registro de tudo o que acontece (logs/dados/auditoria.jsonl).
 *
 * - Só acrescenta linhas; nunca apaga nem reescreve (correções viram novas linhas).
 * - Cada linha guarda o hash da anterior: qualquer alteração ou remoção no
 *   meio do histórico é detectada por `verificar()`.
 * - Dados pessoais (CPF, telefone, e-mail) são mascarados antes de gravar.
 */
const crypto = require('crypto');
const { anexarLinha, lerLinhas, comTrava, lerJSON, gravarJSON, caminho } = require('../orchestration/armazem');
const fs = require('fs');

const ARQUIVO = 'logs/dados/auditoria.jsonl';
// Âncora do fim da corrente: sem ela, apagar as últimas linhas passaria despercebido.
const TOPO = 'logs/dados/auditoria.topo.json';
const GENESE = '0'.repeat(64);

function mascarar(valor) {
  if (typeof valor === 'string') {
    return valor
      .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '***.***.***-**')
      .replace(/\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, '(**) *****-****')
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '***@***');
  }
  if (Array.isArray(valor)) return valor.map(mascarar);
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, mascarar(v)]));
  return valor;
}

function hashDe(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

/* Último registro válido. Uma linha cortada no fim (queda durante a gravação) é pulada aqui e apontada por verificar(). */
function ultimo() {
  const linhas = lerLinhas(ARQUIVO);
  for (let i = linhas.length - 1; i >= 0; i--) {
    try { const u = JSON.parse(linhas[i]); return { seq: u.seq, hash: u.hash }; } catch (e) { /* linha cortada */ }
  }
  return { seq: 0, hash: GENESE };
}

/* Garante que a próxima linha comece numa linha nova, mesmo se a anterior ficou cortada. */
function terminaComQuebra() {
  const arq = caminho(ARQUIVO);
  if (!fs.existsSync(arq) || fs.statSync(arq).size === 0) return true;
  const fd = fs.openSync(arq, 'r');
  const b = Buffer.alloc(1);
  fs.readSync(fd, b, 0, 1, fs.statSync(arq).size - 1);
  fs.closeSync(fd);
  return b[0] === 10;
}

/* Registra uma ação. Campos: task_id, agente, acao, entrada, saida, status, erro, decisao, responsavel. */
function registrar(evento) {
  return comTrava(() => registrarSemTrava(evento));
}

function registrarSemTrava(evento) {
  const ant = ultimo();
  const conteudo = mascarar({
    entrada: evento.entrada === undefined ? null : evento.entrada,
    saida: evento.saida === undefined ? null : evento.saida,
    erro: evento.erro || null,
    decisao: evento.decisao || null
  });
  const corpo = {
    seq: ant.seq + 1,
    horario: new Date().toISOString(),
    task_id: evento.task_id || null,
    agente: evento.agente,
    acao: evento.acao,
    entrada: conteudo.entrada,
    saida: conteudo.saida,
    status: evento.status || null,
    erro: conteudo.erro,
    decisao: conteudo.decisao,
    responsavel: evento.responsavel || evento.agente,
    hash_anterior: ant.hash
  };
  corpo.hash = hashDe(corpo);
  anexarLinha(ARQUIVO, (terminaComQuebra() ? '' : '\n') + JSON.stringify(corpo));
  gravarJSON(TOPO, { seq: corpo.seq, hash: corpo.hash });
  return corpo;
}

/* Confere a corrente inteira. Devolve { ok, total, problemas[] }. */
function verificar() {
  const linhas = lerLinhas(ARQUIVO);
  const problemas = [];
  let anterior = GENESE;
  let esperado = 1;
  let ultimoValido = { seq: 0, hash: GENESE };
  linhas.forEach((linha, i) => {
    let r;
    try { r = JSON.parse(linha); } catch (e) { problemas.push(`Linha ${i + 1}: cortada ou ilegível (possível queda durante a gravação)`); return; }
    const { hash, ...corpo } = r;
    if (r.seq !== esperado) problemas.push(`Linha ${i + 1}: sequência ${r.seq} fora de ordem (registro removido ou inserido?)`);
    if (r.hash_anterior !== anterior) problemas.push(`Linha ${i + 1}: não encaixa na anterior (histórico alterado)`);
    if (hashDe(corpo) !== hash) problemas.push(`Linha ${i + 1}: conteúdo alterado depois de registrado`);
    anterior = hash; esperado = r.seq + 1; ultimoValido = { seq: r.seq, hash };
  });
  const topo = lerJSON(TOPO, null);
  if (topo && (topo.seq !== ultimoValido.seq || topo.hash !== ultimoValido.hash)) {
    problemas.push(`O log termina no registro ${ultimoValido.seq}, mas o último gravado foi o ${topo.seq}: registros apagados do final.`);
  }
  if (!topo && linhas.length) problemas.push('Âncora do fim do log ausente.');
  return { ok: problemas.length === 0, total: linhas.length, problemas };
}

function listar(filtro = {}) {
  return lerLinhas(ARQUIVO).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(r => r &&
    (!filtro.task_id || r.task_id === filtro.task_id) && (!filtro.agente || r.agente === filtro.agente));
}

module.exports = { registrar, verificar, listar, mascarar };
