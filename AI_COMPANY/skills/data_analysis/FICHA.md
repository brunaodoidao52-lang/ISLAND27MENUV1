# SKILL_DATA_ANALYSIS v1.0

> Gerado de `skill.json`. Edite o JSON, não este arquivo.

**PURPOSE:** Calcular contagens, agrupamentos e taxas a partir de dados reais.

**INPUT:** Listas de tarefas, lançamentos ou registros.

## PROCESS
- Agrupar e contar por campo.
- Calcular taxas sempre com o tamanho da amostra.
- Sem amostra, devolver null e 'Não tenho dados suficientes.' (nunca 0%).

**OUTPUT:** Objetos de contagem e taxas.

## REQUIREMENTS
- Dados já registrados.

## LIMITATIONS
- Não faz projeções nem estimativas.

## ERROR_HANDLING
- Lista vazia → resultado vazio com observação.

## EXAMPLES
- entrada: `"5 concluídas de 8"` → saída: 62,5% (amostra 8)

## USED_BY
ceo, financeiro, auditor, comercial, marketing, relatorios

## CHANGELOG
- v1.0 (2026-10-15): Versão inicial.
