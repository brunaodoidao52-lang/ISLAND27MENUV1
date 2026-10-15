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
const { anexarLinha, lerLinhas, comTrava } = require('../orchestration/armazem');

const ARQUIVO = 'logs/dados/auditoria.jsonl';
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

function ultimo() {
  const linhas = lerLinhas(ARQUIVO);
  if (!linhas.length) return { seq: 0, hash: GENESE };
  const u = JSON.parse(linhas[linhas.length - 1]);
  return { seq: u.seq, hash: u.hash };
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
  anexarLinha(ARQUIVO, JSON.stringify(corpo));
  return corpo;
}

/* Confere a corrente inteira. Devolve { ok, total, problemas[] }. */
function verificar() {
  const linhas = lerLinhas(ARQUIVO);
  const problemas = [];
  let anterior = GENESE;
  linhas.forEach((linha, i) => {
    let r;
    try { r = JSON.parse(linha); } catch (e) { problemas.push(`Linha ${i + 1}: não é JSON válido`); return; }
    const { hash, ...corpo } = r;
    if (r.seq !== i + 1) problemas.push(`Linha ${i + 1}: sequência ${r.seq} fora de ordem (registro removido ou inserido?)`);
    if (r.hash_anterior !== anterior) problemas.push(`Linha ${i + 1}: não encaixa na anterior (histórico alterado)`);
    if (hashDe(corpo) !== hash) problemas.push(`Linha ${i + 1}: conteúdo alterado depois de registrado`);
    anterior = hash;
  });
  return { ok: problemas.length === 0, total: linhas.length, problemas };
}

function listar(filtro = {}) {
  return lerLinhas(ARQUIVO).map(l => JSON.parse(l)).filter(r =>
    (!filtro.task_id || r.task_id === filtro.task_id) && (!filtro.agente || r.agente === filtro.agente));
}

module.exports = { registrar, verificar, listar, mascarar };
