'use strict';
/*
 * registro.js — AGENT REGISTRY e registro de skills.
 *
 * - Lê as fichas em agents/<id>/agente.json e skills/<id>/skill.json.
 * - Recusa ficha incompleta, permissão/ferramenta inexistente, sobreposição
 *   de responsabilidades e skill duplicada.
 * - Controle de versão: mudou a ficha, tem que mudar a versão e escrever no
 *   CHANGELOG. O histórico de versões fica guardado no registro.
 * - Guarda o estado de cada agente: status, última atividade, tarefas
 *   concluídas e com falha (agents/dados/registro.json).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { RAIZ, STATUS_AGENTE, PRIORIDADES, AGENTE_HUMANO } = require('./definicoes');
const { PERMISSOES, FERRAMENTAS, CATEGORIAS_APROVACAO, ACOES } = require('../permissions/politica');
const armazem = require('./armazem');
const auditoria = require('../logs/auditoria');

const ARQ_REGISTRO = 'agents/dados/registro.json';

const CAMPOS_AGENTE = ['AGENT_ID', 'NAME', 'ROLE', 'DESCRIPTION', 'MISSION', 'OBJECTIVE', 'RESPONSIBILITIES',
  'NON_RESPONSIBILITIES', 'SKILLS', 'TOOLS', 'PERMISSIONS', 'INPUTS', 'PROCESS', 'OUTPUTS', 'MEMORY',
  'DEPENDENCIES', 'COMMUNICATION_PROTOCOL', 'ERROR_HANDLING', 'APPROVAL_REQUIREMENTS', 'SUCCESS_CRITERIA',
  'LIMITATIONS', 'VERSION', 'INITIAL_STATUS', 'TASKS', 'PRIORITIES', 'LOGS', 'KEYWORDS', 'CHANGELOG'];
const PODEM_SER_VAZIOS = ['DEPENDENCIES'];
const HABILIDADES = ['raciocinio', 'analise', 'organizacao', 'comunicacao', 'pesquisa', 'processamento', 'tomada_de_decisao', 'especialidades'];
const CAMPOS_SKILL = ['SKILL_ID', 'NAME', 'VERSION', 'PURPOSE', 'INPUT', 'PROCESS', 'OUTPUT', 'REQUIREMENTS',
  'LIMITATIONS', 'ERROR_HANDLING', 'EXAMPLES', 'USED_BY', 'CHANGELOG'];

class FichaInvalida extends Error {}

const vazio = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) ||
  (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);

function impressao(obj) {
  const texto = JSON.stringify(obj, (k, v) => (k === 'IMPLEMENTED' ? undefined : v));
  return crypto.createHash('sha256').update(texto).digest('hex').slice(0, 16);
}

function versaoValida(v) { return typeof v === 'string' && /^\d+\.\d+$/.test(v); }
function compararVersao(a, b) {
  const [a1, a2] = a.split('.').map(Number); const [b1, b2] = b.split('.').map(Number);
  return a1 - b1 || a2 - b2;
}

function validarAgente(f, ids, skills) {
  const p = [];
  CAMPOS_AGENTE.forEach(c => { if (!(c in f) || (vazio(f[c]) && !PODEM_SER_VAZIOS.includes(c))) p.push(`campo ${c} ausente ou vazio`); });
  if (p.length) return p;
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(f.AGENT_ID)) p.push('AGENT_ID: só letras minúsculas, números e _');
  if (f.AGENT_ID === AGENTE_HUMANO) p.push('"proprietario" é reservado ao humano');
  if (!versaoValida(f.VERSION)) p.push('VERSION deve ser no formato 1.0');
  if (!STATUS_AGENTE.includes(f.INITIAL_STATUS) || f.INITIAL_STATUS === 'ERROR') p.push('INITIAL_STATUS deve ser ACTIVE, INACTIVE ou PAUSED');
  if (!Array.isArray(f.CHANGELOG) || !f.CHANGELOG.some(c => c.versao === f.VERSION)) p.push(`CHANGELOG sem entrada para a versão ${f.VERSION}`);
  HABILIDADES.forEach(h => { if (!f.SKILLS.abilities || vazio(f.SKILLS.abilities[h])) p.push(`SKILLS.abilities.${h} ausente`); });
  if (!Array.isArray(f.SKILLS.shared)) p.push('SKILLS.shared deve ser uma lista (pode ser vazia)');
  else f.SKILLS.shared.forEach(s => { if (!skills[s]) p.push(`skill inexistente: ${s}`); });
  ['tarefa', 'operacional', 'estrategica'].forEach(m => { if (!f.MEMORY[m]) p.push(`MEMORY.${m} ausente`); });
  f.PERMISSIONS.forEach(x => { if (!PERMISSOES[x]) p.push(`permissão desconhecida: ${x}`); });
  if (f.PERMISSIONS.includes('HUMAN_APPROVE')) p.push('nenhum agente pode ter HUMAN_APPROVE (exclusiva do proprietário)');
  if (f.PERMISSIONS.length >= Object.keys(PERMISSOES).length - 1) p.push('um agente não pode receber todas as permissões');
  const ferr = Array.isArray(f.TOOLS) ? f.TOOLS : [f.TOOLS];
  ferr.forEach(x => { if (!FERRAMENTAS[x]) p.push(`ferramenta não permitida nesta etapa: ${x}`); });
  if (ferr.includes('NONE') && ferr.length > 1) p.push('TOOLS = NONE não pode vir junto com outras ferramentas');
  if (ferr.includes('DELEGAR_AGENTES') !== f.PERMISSIONS.includes('DELEGATE')) p.push('DELEGAR_AGENTES e DELEGATE andam juntas');
  const cp = f.COMMUNICATION_PROTOCOL;
  ['envia_para', 'recebe_de', 'acoes'].forEach(k => { if (!Array.isArray(cp[k])) p.push(`COMMUNICATION_PROTOCOL.${k} deve ser lista`); });
  [...(cp.envia_para || []), ...(cp.recebe_de || [])].forEach(d => { if (d !== AGENTE_HUMANO && !ids.includes(d)) p.push(`comunicação cita agente inexistente: ${d}`); });
  (cp.acoes || []).forEach(a => {
    if (!ACOES[a]) p.push(`ação de protocolo desconhecida: ${a}`);
    else if (!f.PERMISSIONS.includes(ACOES[a])) p.push(`ação ${a} exige a permissão ${ACOES[a]}`);
  });
  Object.keys(f.PRIORITIES).forEach(k => { if (!PRIORIDADES.includes(k)) p.push(`PRIORITIES: nível desconhecido ${k}`); });
  (f.APPROVAL_REQUIREMENTS.categorias || []).forEach(c => { if (!CATEGORIAS_APROVACAO[c]) p.push(`APPROVAL_REQUIREMENTS: categoria desconhecida ${c}`); });
  if (/https?:\/\/|api[_ -]?key|webhook|token de acesso/i.test(JSON.stringify(f))) p.push('a ficha cita endereço ou credencial externa (proibido nesta etapa)');
  return p;
}

function validarSkill(s, agentes) {
  const p = [];
  CAMPOS_SKILL.forEach(c => { if (vazio(s[c])) p.push(`campo ${c} ausente ou vazio`); });
  if (p.length) return p;
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(s.SKILL_ID)) p.push('SKILL_ID: só letras minúsculas, números e _');
  if (!versaoValida(s.VERSION)) p.push('VERSION deve ser no formato 1.0');
  if (!s.CHANGELOG.some(c => c.versao === s.VERSION)) p.push(`CHANGELOG sem entrada para a versão ${s.VERSION}`);
  s.USED_BY.forEach(a => {
    if (!agentes[a]) p.push(`USED_BY cita agente inexistente: ${a}`);
    else if (!agentes[a].SKILLS.shared.includes(s.SKILL_ID)) p.push(`USED_BY cita ${a}, mas a ficha de ${a} não lista esta skill`);
  });
  return p;
}

function lerPasta(pasta, arquivo) {
  if (!fs.existsSync(pasta)) return {};
  const out = {};
  fs.readdirSync(pasta, { withFileTypes: true }).filter(d => d.isDirectory() && d.name !== 'dados').forEach(d => {
    const arq = path.join(pasta, d.name, arquivo);
    if (!fs.existsSync(arq)) return;
    let f;
    try { f = JSON.parse(fs.readFileSync(arq, 'utf8')); } catch (e) { throw new FichaInvalida(`${d.name}/${arquivo}: JSON inválido (${e.message})`); }
    out[d.name] = f;
  });
  return out;
}

let cache = null;

/* Carrega e valida tudo. Lança FichaInvalida com a lista completa de problemas. */
function carregar() {
  if (cache) return cache;
  const agentes = lerPasta(path.join(RAIZ, 'agents'), 'agente.json');
  const skills = lerPasta(path.join(RAIZ, 'skills'), 'skill.json');
  const ids = Object.keys(agentes);
  const problemas = [];
  Object.entries(agentes).forEach(([pasta, f]) => {
    if (f.AGENT_ID !== pasta) problemas.push(`agents/${pasta}: AGENT_ID deve ser "${pasta}"`);
    validarAgente(f, ids, skills).forEach(x => problemas.push(`agents/${pasta}: ${x}`));
  });
  Object.entries(skills).forEach(([pasta, s]) => {
    if (s.SKILL_ID !== pasta) problemas.push(`skills/${pasta}: SKILL_ID deve ser "${pasta}"`);
    validarSkill(s, agentes).forEach(x => problemas.push(`skills/${pasta}: ${x}`));
  });
  if (!agentes.ceo) problemas.push('o agente CEO (agents/ceo) é obrigatório');
  // Sem sobreposição: a mesma responsabilidade não pode estar em dois agentes.
  const resp = new Map();
  Object.values(agentes).forEach(f => (f.RESPONSIBILITIES || []).forEach(r => {
    const k = String(r).toLowerCase().trim();
    if (resp.has(k)) problemas.push(`responsabilidade repetida em ${resp.get(k)} e ${f.AGENT_ID}: "${r}"`);
    else resp.set(k, f.AGENT_ID);
  }));
  // Sem skills duplicadas: duas skills não podem ter a mesma finalidade.
  const fins = new Map();
  Object.values(skills).forEach(s => {
    const k = String(s.PURPOSE || '').toLowerCase().trim();
    if (fins.has(k)) problemas.push(`skills ${fins.get(k)} e ${s.SKILL_ID} têm a mesma finalidade (crie uma skill compartilhada)`);
    else fins.set(k, s.SKILL_ID);
  });
  if (problemas.length) throw new FichaInvalida('Fichas inválidas:\n- ' + problemas.join('\n- '));
  Object.values(agentes).forEach(f => { f.IMPLEMENTED = fs.existsSync(path.join(RAIZ, 'agents', f.AGENT_ID, 'handler.js')); });
  cache = { agentes, skills };
  return cache;
}

function limparCache() { cache = null; }

/* Estado do registro, sincronizado com as fichas (cria entradas novas e confere versões). */
function registro() {
  const { agentes, skills } = carregar();
  return armazem.comTrava(() => {
    const reg = armazem.lerJSON(ARQ_REGISTRO, { agentes: {}, skills: {} });
    let mudou = false;
    const sincronizar = (tipo, id, ficha, extra) => {
      const atual = reg[tipo][id];
      const imp = impressao(ficha);
      if (!atual) {
        reg[tipo][id] = Object.assign({ version: ficha.VERSION, impressao: imp, historico_versoes: [{ versao: ficha.VERSION, registrada_em: new Date().toISOString() }] }, extra);
        mudou = true;
        auditoria.registrar({ agente: 'sistema', acao: `REGISTRAR_${tipo === 'agentes' ? 'AGENTE' : 'SKILL'}`, entrada: { id, versao: ficha.VERSION }, status: extra.status || 'OK' });
      } else if (atual.impressao !== imp) {
        if (atual.version === ficha.VERSION) {
          throw new FichaInvalida(`${tipo === 'agentes' ? 'agents' : 'skills'}/${id}: a ficha foi alterada sem mudar a versão (${ficha.VERSION}). Aumente VERSION (ex.: 1.1 ou 2.0) e registre no CHANGELOG.`);
        }
        if (compararVersao(ficha.VERSION, atual.version) < 0) {
          throw new FichaInvalida(`${id}: a versão ${ficha.VERSION} é menor que a registrada (${atual.version}).`);
        }
        atual.historico_versoes.push({ versao: ficha.VERSION, anterior: atual.version, registrada_em: new Date().toISOString() });
        auditoria.registrar({ agente: 'sistema', acao: 'NOVA_VERSAO', entrada: { id, de: atual.version, para: ficha.VERSION } });
        atual.version = ficha.VERSION; atual.impressao = imp; mudou = true;
      }
    };
    Object.values(agentes).forEach(f => sincronizar('agentes', f.AGENT_ID, f, {
      status: f.INITIAL_STATUS, last_activity: null, tasks_completed: 0, tasks_failed: 0
    }));
    Object.values(skills).forEach(s => sincronizar('skills', s.SKILL_ID, s, {}));
    if (mudou) armazem.gravarJSON(ARQ_REGISTRO, reg);
    return reg;
  });
}

/* Uma linha do AGENT REGISTRY, no formato pedido. */
function linhaRegistro(id) {
  const { agentes } = carregar();
  const f = agentes[id];
  const r = registro().agentes[id];
  if (!f || !r) return null;
  return {
    agent_id: id, name: f.NAME, role: f.ROLE, version: r.version, status: r.status,
    permissions: f.PERMISSIONS, skills: f.SKILLS.shared, last_activity: r.last_activity,
    tasks_completed: r.tasks_completed, tasks_failed: r.tasks_failed, implementado: f.IMPLEMENTED
  };
}

function listarRegistro() { return Object.keys(carregar().agentes).map(linhaRegistro); }

function ficha(id) {
  if (id === AGENTE_HUMANO) return AGENTE_HUMANO;
  return carregar().agentes[id] || null;
}

function statusAgente(id) {
  if (id === AGENTE_HUMANO) return 'ACTIVE';
  const r = registro().agentes[id];
  return r ? r.status : null;
}

/* Ativar, desativar, pausar: só o proprietário. ERROR é posto pelo sistema. */
function mudarStatusAgente(id, novo, por, motivo = '') {
  if (!STATUS_AGENTE.includes(novo)) throw new Error(`Status de agente inválido: ${novo}`);
  if (por !== AGENTE_HUMANO && por !== 'sistema') throw new Error('Só o proprietário ativa, desativa ou pausa agentes.');
  registro();
  return armazem.comTrava(() => {
    const reg = armazem.lerJSON(ARQ_REGISTRO);
    const r = reg.agentes[id];
    if (!r) throw new Error(`Agente inexistente: ${id}`);
    if (novo === 'ACTIVE' && !carregar().agentes[id].IMPLEMENTED) {
      throw new Error(`O agente ${id} está só preparado (ficha pronta, sem implementação). Implemente agents/${id}/handler.js antes de ativar.`);
    }
    const antes = r.status;
    r.status = novo;
    armazem.gravarJSON(ARQ_REGISTRO, reg);
    auditoria.registrar({ agente: por, acao: 'STATUS_AGENTE', entrada: { agente: id, de: antes, para: novo, motivo }, status: novo, responsavel: por });
    return r;
  });
}

/* Atualiza atividade e contadores (chamado pelo motor de tarefas). */
function anotarAtividade(id, { concluida = false, falhou = false } = {}) {
  if (id === AGENTE_HUMANO || id === 'sistema') return;
  armazem.comTrava(() => {
    const reg = armazem.lerJSON(ARQ_REGISTRO, null);
    if (!reg || !reg.agentes[id]) return;
    const r = reg.agentes[id];
    r.last_activity = new Date().toISOString();
    if (concluida) r.tasks_completed++;
    if (falhou) r.tasks_failed++;
    armazem.gravarJSON(ARQ_REGISTRO, reg);
  });
}

module.exports = {
  FichaInvalida, CAMPOS_AGENTE, CAMPOS_SKILL, HABILIDADES, carregar, limparCache, registro,
  linhaRegistro, listarRegistro, ficha, statusAgente, mudarStatusAgente, anotarAtividade,
  validarAgente, validarSkill, compararVersao
};
