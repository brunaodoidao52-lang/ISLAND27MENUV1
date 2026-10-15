'use strict';
/*
 * armazem.js — arquivos de dados da organização.
 *
 * Os dados ficam dentro de cada área: tasks/dados, logs/dados, memory/dados,
 * agents/dados. Para testes, RACA_DADOS aponta outra pasta raiz.
 *
 * - Gravação atômica: escreve num arquivo temporário e renomeia, então um
 *   arquivo nunca fica pela metade se o computador desligar no meio.
 * - Trava: só um comando mexe nos dados por vez (evita duas gravações ao mesmo tempo).
 */
const fs = require('fs');
const path = require('path');
const { RAIZ } = require('./definicoes');

function pastaDados() {
  return process.env.RACA_DADOS ? path.resolve(process.env.RACA_DADOS) : RAIZ;
}

function caminho(...partes) {
  const base = pastaDados();
  const alvo = path.resolve(base, ...partes);
  if (alvo !== base && !alvo.startsWith(base + path.sep)) throw new Error('Caminho fora da pasta de dados');
  return alvo;
}

function garantirPasta(p) { fs.mkdirSync(p, { recursive: true }); }

function lerJSON(nome, padrao) {
  const arq = caminho(nome);
  if (!fs.existsSync(arq)) return padrao;
  const texto = fs.readFileSync(arq, 'utf8');
  try { return JSON.parse(texto); } catch (e) {
    throw new Error(`Arquivo de dados danificado: ${nome}. Nada foi alterado. Restaure uma cópia antes de continuar.`);
  }
}

function gravarJSON(nome, dados) {
  const arq = caminho(nome);
  garantirPasta(path.dirname(arq));
  const tmp = `${arq}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2));
  fs.renameSync(tmp, arq);
}

function apagar(nome) {
  const arq = caminho(nome);
  if (fs.existsSync(arq)) fs.unlinkSync(arq);
}

function anexarLinha(nome, linha) {
  const arq = caminho(nome);
  garantirPasta(path.dirname(arq));
  fs.appendFileSync(arq, linha + '\n');
}

function lerLinhas(nome) {
  const arq = caminho(nome);
  if (!fs.existsSync(arq)) return [];
  return fs.readFileSync(arq, 'utf8').split('\n').filter(Boolean);
}

/* Executa fn com a trava exclusiva dos dados. Trava esquecida (processo morto) expira em 30 s. */
function comTrava(fn) {
  garantirPasta(pastaDados());
  const trava = caminho('.trava');
  // Reentrante: uma operação que já está com a trava pode chamar outra.
  if (comTrava.dono) return fn();
  const limite = Date.now() + 10000;
  for (;;) {
    try {
      const fd = fs.openSync(trava, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - fs.statSync(trava).mtimeMs > 30000) { fs.unlinkSync(trava); continue; }
      } catch (e2) { continue; }
      if (Date.now() > limite) throw new Error('Os dados estão em uso por outro comando. Tente de novo em instantes.');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  comTrava.dono = true;
  try { return fn(); } finally {
    comTrava.dono = false;
    try { fs.unlinkSync(trava); } catch (e) { /* já removida */ }
  }
}

module.exports = { pastaDados, caminho, lerJSON, gravarJSON, apagar, anexarLinha, lerLinhas, comTrava, garantirPasta };
