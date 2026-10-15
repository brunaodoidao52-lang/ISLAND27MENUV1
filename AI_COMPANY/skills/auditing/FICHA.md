# SKILL_AUDITING v1.0

> Gerado de `skill.json`. Edite o JSON, não este arquivo.

**PURPOSE:** Encontrar erros, inconsistências, duplicidades, informações incompatíveis e tarefas incompletas.

**INPUT:** Tarefas, lançamentos do livro interno e o log de auditoria.

## PROCESS
- Procurar lançamento ativo com o mesmo CPF, serviço e categoria (duplicidade).
- Conferir tarefas: sem responsável, responsável inativo, mãe inexistente, concluída sem qualidade ou sem aprovação, operação executada duas vezes.
- Encontrar tarefas paradas há mais de 24 horas.
- Verificar a corrente de hashes do log (adulteração).

**OUTPUT:** Lista de problemas encontrados, cada um com o TASK_ID e a descrição.

## REQUIREMENTS
- Acesso de leitura ao histórico.

## LIMITATIONS
- Aponta problemas; não corrige nem apaga nada.

## ERROR_HANDLING
- Dados ilegíveis → reporta como problema CRITICAL em vez de ignorar.

## EXAMPLES
- entrada: `"novo lançamento com CPF já lançado no mesmo serviço"` → saída: duplicidade com o lançamento nº N

## USED_BY
ceo, lancador, auditor

## CHANGELOG
- v1.0 (2026-10-15): Versão inicial.
