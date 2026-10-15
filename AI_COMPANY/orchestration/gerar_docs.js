#!/usr/bin/env node
'use strict';
/* Gera agents/<id>/FICHA.md e skills/<id>/FICHA.md a partir dos arquivos JSON (a fonte de verdade). */
const fs = require('fs');
const path = require('path');
const registro = require('./registro');
const { RAIZ } = require('./definicoes');
const { PERMISSOES, FERRAMENTAS, CATEGORIAS_APROVACAO } = require('../permissions/politica');

const lista = v => (Array.isArray(v) ? v : [v]).map(x => `- ${typeof x === 'object' ? JSON.stringify(x) : x}`).join('\n');
const objeto = o => Object.entries(o).map(([k, v]) => `- **${k}:** ${Array.isArray(v) ? v.join(', ') : v}`).join('\n');

function agente(f) {
  const status = f.INITIAL_STATUS === 'ACTIVE' ? 'ativo' : 'preparado (inativo até o proprietário ativar)';
  return `# ${f.NAME} v${f.VERSION}

> Gerado de \`agente.json\` por \`node AI_COMPANY/orchestration/gerar_docs.js\`. Edite o JSON, não este arquivo.

| | |
|---|---|
| **AGENT_ID** | \`${f.AGENT_ID}\` |
| **NAME** | ${f.NAME} |
| **ROLE** | ${f.ROLE} |
| **Situação inicial** | ${status} |
| **Implementação** | ${f.IMPLEMENTED ? '`handler.js`' : 'ainda não implementado'} |

**DESCRIPTION:** ${f.DESCRIPTION}

**MISSION:** ${f.MISSION}

**OBJECTIVE:** ${f.OBJECTIVE}

## RESPONSIBILITIES
${lista(f.RESPONSIBILITIES)}

## NON_RESPONSIBILITIES
${lista(f.NON_RESPONSIBILITIES)}

## SKILLS
Skills compartilhadas: ${f.SKILLS.shared.map(s => `\`${s}\``).join(', ') || 'nenhuma'}

${objeto(f.SKILLS.abilities)}

## TOOLS
${(Array.isArray(f.TOOLS) ? f.TOOLS : [f.TOOLS]).map(t => `- \`${t}\` — ${FERRAMENTAS[t].descricao}`).join('\n')}

## PERMISSIONS
${f.PERMISSIONS.map(p => `- \`${p}\` — ${PERMISSOES[p]}`).join('\n')}

## INPUTS
${lista(f.INPUTS)}

## PROCESS
${lista(f.PROCESS)}

## OUTPUTS
${lista(f.OUTPUTS)}

## MEMORY
${objeto(f.MEMORY)}

## DEPENDENCIES
${f.DEPENDENCIES.length ? lista(f.DEPENDENCIES) : '- nenhuma'}

## COMMUNICATION_PROTOCOL
- **envia para:** ${f.COMMUNICATION_PROTOCOL.envia_para.join(', ')}
- **recebe de:** ${f.COMMUNICATION_PROTOCOL.recebe_de.join(', ')}
- **ações:** ${f.COMMUNICATION_PROTOCOL.acoes.join(', ')}

## ERROR_HANDLING
${lista(f.ERROR_HANDLING)}

## APPROVAL_REQUIREMENTS
${f.APPROVAL_REQUIREMENTS.categorias.length ? f.APPROVAL_REQUIREMENTS.categorias.map(c => `- \`${c}\` — ${CATEGORIAS_APROVACAO[c]}`).join('\n') : '- nenhuma categoria própria'}

${f.APPROVAL_REQUIREMENTS.regra}

## SUCCESS_CRITERIA
${lista(f.SUCCESS_CRITERIA)}

## LIMITATIONS
${lista(f.LIMITATIONS)}

## TASKS
${lista(f.TASKS)}

## PRIORITIES
${objeto(f.PRIORITIES)}

## LOGS
${lista(f.LOGS)}

## CHANGELOG
${f.CHANGELOG.map(c => `- v${c.versao} (${c.data}): ${c.mudanca}`).join('\n')}
`;
}

function skill(s) {
  return `# ${s.NAME} v${s.VERSION}

> Gerado de \`skill.json\`. Edite o JSON, não este arquivo.

**PURPOSE:** ${s.PURPOSE}

**INPUT:** ${s.INPUT}

## PROCESS
${lista(s.PROCESS)}

**OUTPUT:** ${s.OUTPUT}

## REQUIREMENTS
${lista(s.REQUIREMENTS)}

## LIMITATIONS
${lista(s.LIMITATIONS)}

## ERROR_HANDLING
${lista(s.ERROR_HANDLING)}

## EXAMPLES
${s.EXAMPLES.map(e => `- entrada: \`${JSON.stringify(e.entrada)}\` → saída: ${e.saida}`).join('\n')}

## USED_BY
${s.USED_BY.join(', ')}

## CHANGELOG
${s.CHANGELOG.map(c => `- v${c.versao} (${c.data}): ${c.mudanca}`).join('\n')}
`;
}

const { agentes, skills } = registro.carregar();
Object.values(agentes).forEach(f => fs.writeFileSync(path.join(RAIZ, 'agents', f.AGENT_ID, 'FICHA.md'), agente(f)));
Object.values(skills).forEach(s => fs.writeFileSync(path.join(RAIZ, 'skills', s.SKILL_ID, 'FICHA.md'), skill(s)));
console.log(`${Object.keys(agentes).length} fichas de agentes e ${Object.keys(skills).length} de skills geradas.`);
