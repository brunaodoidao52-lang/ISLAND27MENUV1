# SKILL_TASK_MANAGEMENT v1.0

> Gerado de `skill.json`. Edite o JSON, não este arquivo.

**PURPOSE:** Ordenar tarefas por prioridade e escolher o agente mais adequado para cada uma.

**INPUT:** Tarefas abertas e candidatos { agente, especialização, disponibilidade, carga, histórico }.

## PROCESS
- Ordenar: CRITICAL, HIGH, MEDIUM, LOW; empate pela ordem de chegada.
- Pontuar cada candidato por especialização, disponibilidade, carga (pesada pela prioridade) e taxa de sucesso.
- Descartar agentes indisponíveis e penalizar sobrecarregados (5+ tarefas abertas).
- Explicar a escolha em texto.

**OUTPUT:** Lista ordenada de tarefas ou de candidatos, com a explicação da pontuação.

## REQUIREMENTS
- Registro de agentes e de tarefas atualizado.

## LIMITATIONS
- Não cria nem delega tarefas sozinha: só recomenda para o CEO.

## ERROR_HANDLING
- Nenhum candidato disponível → 'Não tenho dados suficientes.' com o motivo.

## EXAMPLES
- entrada: `"2 agentes capazes, um com 6 tarefas abertas"` → saída: escolhe o outro; o primeiro aparece como SOBRECARREGADO

## USED_BY
ceo

## CHANGELOG
- v1.0 (2026-10-15): Versão inicial.
