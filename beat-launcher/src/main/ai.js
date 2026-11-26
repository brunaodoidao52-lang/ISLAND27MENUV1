// IA (modo teste): DeepSeek ou qualquer API compatível com o formato OpenAI (/chat/completions).
// Usos: sugerir título/descrição/legenda dos beats, reescrever legendas de posts e dar ideias de conteúdo.
// Nada é aplicado sem você: as sugestões ficam guardadas e você escolhe usar (a não ser que ligue "aplicar sozinho").
const { json } = require('./http');
const texts = require('../shared/texts');

const PROVIDERS = {
  // Modelos sugeridos (confira no painel da DeepSeek): deepseek-v4-flash, deepseek-v4-pro. "deepseek-chat" é o nome antigo.
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat'] },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  custom: { label: 'Outra (compatível com OpenAI)', baseUrl: '', model: '' },
};

const BRAND = `Você escreve para a ISLAND27, label e marca musical independente da Ilha do Frade, Vitória (ES).
Slogan: "Da Ilha pro mundo." Artista/produtor: Bruninn. Vende beats (catálogo na SoundX), produção musical,
mixagem, masterização, beat por encomenda e cursos (produção, mixagem, beat e FL Studio).
Tom de voz: direto, confiante, brasileiro, de produtor pra artista; sem exagero, sem prometer o que não existe.
Escreva em português do Brasil.`;

function cfgOf(settings = {}) {
  const a = settings.ai || {};
  const p = PROVIDERS[a.provider] || PROVIDERS.deepseek;
  return {
    enabled: !!a.enabled,
    autoApply: !!a.autoApply,
    baseUrl: String(a.baseUrl || p.baseUrl).replace(/\/+$/, ''),
    model: a.model || p.model,
    apiKey: a.apiKey || '',
    temperature: a.temperature ?? 0.8,
  };
}

/** Extrai o primeiro objeto JSON de um texto (para APIs sem "modo JSON"). */
function parseJson(text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('A IA respondeu vazio. Tente de novo.');
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error('A IA não devolveu um JSON válido.');
  }
}

function client(settingsOrCfg) {
  const c = settingsOrCfg && settingsOrCfg.apiKey !== undefined && settingsOrCfg.baseUrl ? settingsOrCfg : cfgOf(settingsOrCfg);

  async function chat(messages, { asJson = false, maxTokens = 1400 } = {}) {
    if (!c.apiKey) throw new Error('Coloque a chave da API da IA em Configurações → IA.');
    if (!c.baseUrl || !c.model) throw new Error('Preencha o endereço (base URL) e o modelo da IA.');
    const body = { model: c.model, messages, temperature: c.temperature, max_tokens: maxTokens, stream: false };
    if (asJson) body.response_format = { type: 'json_object' };
    let data;
    try {
      ({ data } = await json(`${c.baseUrl}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${c.apiKey}` }, body }));
    } catch (e) {
      if (e.status === 401) throw new Error('Chave da IA recusada (401). Confira a chave.');
      if (e.status === 402) throw new Error('Sem saldo na conta da IA (402).');
      if (e.status === 429) throw new Error('Limite de uso da IA atingido (429). Tente mais tarde.');
      if (e.status === 404 || e.status === 400) throw new Error(`A IA recusou o pedido (${e.status}): confira o nome do modelo (“${c.model}”) e o endereço. ${e.message}`);
      if (!e.status) throw new Error(`Não consegui falar com a IA em ${c.baseUrl}. Confira a internet e o endereço da API.`);
      throw e;
    }
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    const content = msg ? msg.content : '';
    return asJson ? parseJson(content) : String(content || '').trim();
  }

  /** Teste rápido: devolve o nome do modelo que respondeu. */
  async function test() {
    const r = await chat([{ role: 'user', content: 'Responda exatamente com a palavra: ok' }], { maxTokens: 10 });
    return { reply: r, model: c.model };
  }

  /**
   * Sugere textos melhores para um beat a partir dos textos automáticos (mantém links e limites).
   * Retorna { ytTitle, ytDescription, igCaption, hook }.
   */
  async function suggestBeatTexts(beat, current) {
    const sys = `${BRAND}
Responda SOMENTE com um JSON: {"ytTitle": "...", "ytDescription": "...", "igCaption": "...", "hook": "..."}.
Regras:
- ytTitle: até 100 caracteres, padrão de busca do YouTube "[GRÁTIS] <Artista ou Gênero> Type Beat <ano> - "<Nome>" | Prod. ISLAND27". Pode melhorar, mas mantenha "Type Beat" e o nome do beat.
- ytDescription: mantenha TODOS os links exatamente como estão no texto atual; pode melhorar a escrita.
- igCaption: gancho forte na 1ª linha, chamada "Comenta BEAT", no máximo 5 hashtags no final.
- hook: frase curta EM MAIÚSCULAS, sem emoji, até 32 caracteres, para aparecer no topo do Reels.`;
    const user = JSON.stringify({ beat: { nome: beat.nome, artista: beat.artista, genero: beat.genero, bpm: beat.bpm, tom: beat.tom }, textos_atuais: current });
    const out = await chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { asJson: true });
    return sanitizeBeatTexts(out, current);
  }

  /** Reescreve a legenda de um post mantendo a ideia, CTA e no máximo 5 hashtags. */
  async function rewriteCaption(post) {
    const sys = `${BRAND}
Responda SOMENTE com um JSON: {"caption": "..."}.
Reescreva a legenda do post do Instagram para ficar mais envolvente, mantendo a mesma ideia, as chamadas (direct, link na bio, comenta) e no máximo 5 hashtags no final. Até 1200 caracteres.`;
    const out = await chat([{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify({ titulo: post.titulo, formato: post.kind, legenda_atual: post.caption }) }], { asJson: true });
    return limitHashtags(String(out.caption || post.caption || '').slice(0, 2200));
  }

  /** Ideias de conteúdo para a semana. Retorna [{ titulo, formato, gancho, roteiro }]. */
  async function ideas(count = 5, foco = 'vender beats e serviços de produção') {
    const sys = `${BRAND}
Responda SOMENTE com um JSON: {"ideias": [{"titulo": "...", "formato": "Reels|Carrossel|Story", "gancho": "...", "roteiro": "..."}]}.
Ideias práticas, baratas de produzir, que um produtor consegue gravar sozinho. Roteiro em até 4 linhas.`;
    const out = await chat([{ role: 'system', content: sys }, { role: 'user', content: `Me dê ${count} ideias de conteúdo para o Instagram com foco em: ${foco}.` }], { asJson: true, maxTokens: 1800 });
    return (out.ideias || out.ideas || []).slice(0, count);
  }

  return { chat, test, suggestBeatTexts, rewriteCaption, ideas, config: c };
}

function limitHashtags(text, max = 5) {
  let n = 0;
  return String(text).replace(/#[\p{L}\p{N}_]+/gu, (h) => (++n <= max ? h : '')).replace(/[ \t]+\n/g, '\n').trim();
}

/** Garante limites e links mesmo se a IA errar. */
function sanitizeBeatTexts(out, current) {
  const r = { ...current };
  if (out.ytTitle) r.ytTitle = texts.fitTitle(String(out.ytTitle).replace(/\s+/g, ' '));
  if (out.ytDescription) {
    const links = (current.ytDescription.match(/https?:\/\/\S+/g) || []);
    const desc = String(out.ytDescription);
    r.ytDescription = links.every((l) => desc.includes(l)) ? desc.slice(0, 5000) : current.ytDescription;
  }
  if (out.igCaption) r.igCaption = limitHashtags(String(out.igCaption)).slice(0, 2200);
  if (out.hook) r.hook = String(out.hook).replace(/[^\p{L}\p{N}\s!?,.'"-]/gu, '').toUpperCase().trim().slice(0, 40) || current.hook;
  return r;
}

module.exports = { client, cfgOf, PROVIDERS, parseJson, limitHashtags, sanitizeBeatTexts };
