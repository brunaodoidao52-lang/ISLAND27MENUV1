// Instagram (API oficial da Meta): publica o Reels enviando o arquivo direto do computador (upload retomável).
// Funciona com conta Profissional (Criador ou Empresa).
// - "Login do Instagram": host graph.instagram.com (token gerado no painel do app da Meta).
// - "Login do Facebook": host graph.facebook.com (conta do Instagram ligada a uma Página).
const fs = require('fs');
const { json, sendFile, sleep } = require('./http');

const HOSTS = { instagram: 'https://graph.instagram.com', facebook: 'https://graph.facebook.com' };
const DEFAULTS = { login: 'instagram', version: 'v23.0', rupload: 'https://rupload.facebook.com' };

function client(cfg) {
  const c = { ...DEFAULTS, ...cfg };
  const base = () => `${c.graphBase || HOSTS[c.login] || HOSTS.instagram}/${c.version}`;
  const need = () => {
    if (!c.token || !c.userId) throw new Error('Instagram não configurado: preencha o ID da conta e o token nas Configurações.');
  };

  async function account() {
    need();
    const { data } = await json(`${base()}/${c.userId}?fields=username&access_token=${encodeURIComponent(c.token)}`);
    return { id: data.id || c.userId, username: data.username };
  }

  /** Publica um Reels. Retorna { id, permalink }. */
  async function publishReel(file, caption, { onProgress, shareToFeed = true, thumbOffsetMs = 1500, pollMs = 5000, timeoutMs = 15 * 60000 } = {}) {
    need();
    const size = fs.statSync(file).size;
    const { data: container } = await json(`${base()}/${c.userId}/media`, {
      method: 'POST',
      form: {
        media_type: 'REELS',
        upload_type: 'resumable',
        caption,
        share_to_feed: shareToFeed ? 'true' : 'false',
        thumb_offset: thumbOffsetMs,
        access_token: c.token,
      },
    });
    if (!container.id) throw new Error('O Instagram não criou o post.');
    const uploadUrl = container.uri || `${c.rupload}/ig-api-upload/${c.version}/${container.id}`;
    const r = await sendFile(uploadUrl, file, {
      method: 'POST',
      headers: { Authorization: `OAuth ${c.token}`, offset: '0', file_size: String(size), 'Content-Type': 'application/octet-stream' },
      onProgress: (p) => onProgress && onProgress(p * 0.8),
    });
    if (r.status >= 300) throw new Error(`O Instagram recusou o arquivo (${r.status}): ${JSON.stringify(r.body).slice(0, 300)}`);

    // O Instagram processa o vídeo antes de deixar publicar.
    const t0 = Date.now();
    for (;;) {
      const { data } = await json(`${base()}/${container.id}?fields=status_code,status&access_token=${encodeURIComponent(c.token)}`);
      if (data.status_code === 'FINISHED') break;
      if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') throw new Error(`O Instagram não conseguiu processar o vídeo: ${data.status || data.status_code}`);
      if (Date.now() - t0 > timeoutMs) throw new Error('O Instagram demorou demais para processar o vídeo.');
      if (onProgress) onProgress(0.8 + Math.min(0.15, ((Date.now() - t0) / timeoutMs) * 0.15));
      await sleep(pollMs);
    }
    const { data: pub } = await json(`${base()}/${c.userId}/media_publish`, { method: 'POST', form: { creation_id: container.id, access_token: c.token } });
    let permalink = null;
    try {
      const { data } = await json(`${base()}/${pub.id}?fields=permalink&access_token=${encodeURIComponent(c.token)}`);
      permalink = data.permalink || null;
    } catch {
      /* o link é só um extra */
    }
    if (onProgress) onProgress(1);
    return { id: pub.id, permalink };
  }

  /** Renova o token de longa duração (60 dias) do Login do Instagram. Retorna o novo token ou null. */
  async function refreshToken() {
    if (c.login !== 'instagram' || !c.token) return null;
    const { data } = await json(`${c.graphBase || HOSTS.instagram}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(c.token)}`);
    return data.access_token ? { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 5184000) * 1000 } : null;
  }

  return { account, publishReel, refreshToken };
}

module.exports = { client, HOSTS, DEFAULTS };
