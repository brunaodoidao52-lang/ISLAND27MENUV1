# SKILL_COMMUNICATION v1.0

> Gerado de `skill.json`. Edite o JSON, não este arquivo.

**PURPOSE:** Escrever mensagens objetivas no protocolo padrão, com contexto, erros e limitações explícitos.

**INPUT:** Resultado de análise, erro ou pedido de dados.

## PROCESS
- Montar a mensagem no formato { task_id, from_agent, to_agent, action, priority, status, input, result, warnings, errors, timestamp }.
- Usar 'Não tenho dados suficientes.' quando faltar informação e 'Necessário revisar.' quando houver dúvida.
- Listar cada erro com nível, descrição, causa e recuperação.

**OUTPUT:** Mensagem pronta para o protocolo ou lista de frases para o proprietário.

## REQUIREMENTS
- TASK_ID da tarefa em andamento.

## LIMITATIONS
- Não envia nada para fora da organização (sem WhatsApp, e-mail ou redes nesta etapa).

## ERROR_HANDLING
- Mensagem fora do formato é recusada pelo protocolo e registrada no log.

## EXAMPLES
- entrada: `"faltando: cpf"` → saída: Não tenho dados suficientes. Faltam: cpf.

## USED_BY
ceo, captador, lancador, financeiro, auditor, comercial, atendimento, marketing, relatorios

## CHANGELOG
- v1.0 (2026-10-15): Versão inicial.
