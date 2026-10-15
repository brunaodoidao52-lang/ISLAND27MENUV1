# SKILL_REPORTING v1.0

> Gerado de `skill.json`. Edite o JSON, não este arquivo.

**PURPOSE:** Transformar resultados verificados em relatórios e resumos claros para o proprietário.

**INPUT:** Tarefas, lançamentos e painel já registrados.

## PROCESS
- Usar somente o que está registrado (status, etapas, execuções, erros).
- Mostrar o que foi executado de fato e o que ficou pendente.
- Apontar aprovação humana pendente e erros sem resolução.

**OUTPUT:** Texto de relatório.

## REQUIREMENTS
- Dados da tarefa ou do painel.

## LIMITATIONS
- Não estima números que não existem nos registros.

## ERROR_HANDLING
- Sem dados → 'Não tenho dados suficientes.'

## EXAMPLES
- entrada: `"tarefa COMPLETED de lançamento"` → saída: TASK-…, etapas, aprovação, executado em …

## USED_BY
ceo, financeiro, auditor, comercial, marketing, relatorios

## CHANGELOG
- v1.0 (2026-10-15): Versão inicial.
