'use strict';
/*
 * SKILL financial_analysis — conferir e montar planos de pagamento.
 * Contas sempre em centavos (sem erro de arredondamento). Não inventa valores:
 * se faltar um número, devolve o problema em vez de supor.
 */

const c = v => Math.round(Number(v || 0) * 100);
const brl = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const r = v => v / 100;

/* Confere a coerência dos valores. Devolve a lista de inconsistências (vazia = ok). */
function verificarPlano({ valor_total, desconto = 0, entrada = 0, parcelas = 1 }) {
  const p = [];
  if (!(valor_total > 0)) p.push('Valor total ausente ou zero.');
  if (desconto < 0 || entrada < 0) p.push('Desconto e entrada não podem ser negativos.');
  if (c(desconto) + c(entrada) > c(valor_total)) p.push('Desconto + entrada é maior que o valor total.');
  if (c(desconto) >= c(valor_total) && valor_total > 0) p.push('Desconto igual ou maior que o valor total.');
  const restante = c(valor_total) - c(desconto) - c(entrada);
  if (restante > 0 && parcelas > restante) p.push(`Não é possível dividir ${r(restante)} em ${parcelas} parcelas (menos de 1 centavo cada).`);
  return p;
}

function somarMeses(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  const ultimo = new Date(a, m - 1 + n + 1, 0).getDate();
  const dt = new Date(a, m - 1 + n, Math.min(d, ultimo));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/* Gera entrada + parcelas mensais; os centavos que sobram vão para a última. */
function gerarParcelas({ valor_total, desconto = 0, entrada = 0, parcelas = 1, primeiro_vencimento, data_entrada }) {
  const problemas = verificarPlano({ valor_total, desconto, entrada, parcelas });
  if (problemas.length) throw Object.assign(new Error(problemas.join(' ')), { codigo: 'PLANO_INCONSISTENTE', nivel: 'MEDIUM' });
  if (!primeiro_vencimento) throw Object.assign(new Error('Primeiro vencimento não informado.'), { codigo: 'ENTRADA_INCOMPLETA', nivel: 'MEDIUM' });
  const lista = [];
  if (c(entrada) > 0) lista.push({ numero: 0, descricao: 'Entrada', valor: r(c(entrada)), vencimento: data_entrada || primeiro_vencimento });
  const restante = c(valor_total) - c(desconto) - c(entrada);
  if (restante > 0) {
    const base = Math.floor(restante / parcelas);
    for (let i = 1; i <= parcelas; i++) {
      lista.push({ numero: i, descricao: parcelas === 1 ? 'Parcela única' : `Parcela ${i}/${parcelas}`, valor: r(i === parcelas ? restante - base * (parcelas - 1) : base), vencimento: somarMeses(primeiro_vencimento, i - 1) });
    }
  }
  const soma = lista.reduce((s, x) => s + c(x.valor), 0);
  if (soma !== c(valor_total) - c(desconto)) throw Object.assign(new Error('Soma das parcelas não confere com o valor final.'), { codigo: 'ERRO_CALCULO', nivel: 'CRITICAL' });
  return lista;
}

/* Totais de uma lista de lançamentos (para o agente FINANCEIRO, quando ativado). */
function resumo(lancamentos) {
  const t = lancamentos.reduce((s, l) => s + c(l.valor_final), 0);
  return { quantidade: lancamentos.length, valor_contratado: r(t) };
}

module.exports = { verificarPlano, gerarParcelas, somarMeses, resumo, brl };
