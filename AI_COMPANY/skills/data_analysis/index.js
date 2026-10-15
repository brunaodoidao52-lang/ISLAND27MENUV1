'use strict';
/* SKILL data_analysis — contagens, agrupamentos e taxas a partir de dados reais (nunca estimados). */

function contarPor(lista, campo) {
  return lista.reduce((acc, x) => { const k = typeof campo === 'function' ? campo(x) : x[campo]; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
}

/* Taxa em %, com o tamanho da amostra. Sem dados → null (não 0%). */
function taxa(parte, total) {
  return total ? { percentual: Math.round((parte / total) * 1000) / 10, amostra: total } : { percentual: null, amostra: 0, observacao: 'Não tenho dados suficientes.' };
}

function horasEntre(a, b) { return Math.round(((Date.parse(b) - Date.parse(a)) / 3600000) * 10) / 10; }

module.exports = { contarPor, taxa, horasEntre };
