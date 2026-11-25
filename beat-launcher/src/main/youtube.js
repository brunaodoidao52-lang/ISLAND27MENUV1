// YouTube Data API v3: login (OAuth no navegador), envio do vídeo com agendamento (publishAt) e miniatura.
// O agendamento fica no próprio YouTube: depois de enviado, o vídeo sai no horário mesmo com o PC desligado.
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const { json, sendFile, HttpError, sleep } = require('./http');

const DEFAULT_ENDPOINTS = {
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  api: 'https://www.googleapis.com/youtube/v3',
  upload: 'https://www.googleapis.com/upload/youtube/v3',
};
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const PAGE = (msg) => `<!doctype html><meta charset="utf-8"><title>ISLAND27</title>
<body style="background:#08090c;color:#F2F4F8;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h1 style="color:#7FE3FF">ISLAND27</h1><p>${msg}</p></div></body>`;

/**
 * Abre o login do Google no navegador e espera a autorização (até 5 minutos).
 * Retorna { tokens, channel }.
 */
async function connect({ clientId, clientSecret, openExternal, endpoints = {} }) {
  if (!clientId || !clientSecret) throw new Error('Preencha o Client ID e o Client Secret do Google Cloud.');
  const ep = { ...DEFAULT_ENDPOINTS, ...endpoints };
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(12));

  const server = http.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const redirect = `http://127.0.0.1:${server.address().port}`;
  try {
    const codePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Tempo esgotado esperando a autorização do Google.')), 5 * 60000);
      server.on('request', (req, res) => {
        const u = new URL(req.url, redirect);
        if (!u.searchParams.has('code') && !u.searchParams.has('error')) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        if (u.searchParams.get('error') || u.searchParams.get('state') !== state) {
          res.end(PAGE('Autorização cancelada. Pode fechar esta aba.'));
          clearTimeout(timer);
          reject(new Error(`O Google não autorizou: ${u.searchParams.get('error') || 'resposta inválida'}`));
          return;
        }
        res.end(PAGE('Pronto! YouTube conectado. Pode fechar esta aba e voltar para o Beat Launcher.'));
        clearTimeout(timer);
        resolve(u.searchParams.get('code'));
      });
    });
    const url = new URL(ep.auth);
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    }).toString();
    await openExternal(url.toString());
    const code = await codePromise;
    const { data } = await json(ep.token, {
      method: 'POST',
      form: { code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier },
    });
    if (!data.refresh_token) throw new Error('O Google não devolveu o token de acesso contínuo. Tente conectar de novo.');
    const tokens = { access: data.access_token, refresh: data.refresh_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
    const channel = await channelInfo(tokens.access, ep).catch(() => null);
    return { tokens, channel };
  } finally {
    server.close();
  }
}

async function channelInfo(access, ep = DEFAULT_ENDPOINTS) {
  const { data } = await json(`${ep.api}/channels?part=snippet&mine=true`, { headers: { Authorization: `Bearer ${access}` } });
  const ch = data.items && data.items[0];
  return ch ? { id: ch.id, title: ch.snippet.title } : null;
}

/** Cliente com renovação automática do token. saveTokens é chamado quando o token muda. */
function client({ clientId, clientSecret, tokens, saveTokens = () => {}, endpoints = {} }) {
  const ep = { ...DEFAULT_ENDPOINTS, ...endpoints };
  let tk = { ...tokens };

  async function access() {
    if (tk.access && tk.expiresAt - Date.now() > 60000) return tk.access;
    if (!tk.refresh) throw new Error('YouTube desconectado. Conecte de novo nas Configurações.');
    try {
      const { data } = await json(ep.token, {
        method: 'POST',
        form: { client_id: clientId, client_secret: clientSecret, refresh_token: tk.refresh, grant_type: 'refresh_token' },
      });
      tk = { ...tk, access: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
      saveTokens(tk);
      return tk.access;
    } catch (e) {
      if (e instanceof HttpError && (e.status === 400 || e.status === 401)) {
        throw new Error('A autorização do YouTube expirou. Conecte de novo nas Configurações (veja no guia como evitar que expire a cada 7 dias).');
      }
      throw e;
    }
  }

  /**
   * Envia o vídeo. meta: { title, description, tags, publishAt?: Date, privacy?: 'public'|'unlisted'|'private' }.
   * Com publishAt no futuro, o vídeo fica privado e o YouTube publica sozinho no horário.
   */
  async function upload(file, meta, { onProgress, thumbnail } = {}) {
    const size = fs.statSync(file).size;
    const status = { selfDeclaredMadeForKids: false, embeddable: true };
    if (meta.publishAt && new Date(meta.publishAt).getTime() > Date.now() + 60000) {
      status.privacyStatus = 'private';
      status.publishAt = new Date(meta.publishAt).toISOString();
    } else {
      status.privacyStatus = meta.privacy || 'public';
    }
    const body = {
      snippet: {
        title: meta.title,
        description: meta.description || '',
        tags: meta.tags || [],
        categoryId: '10', // Música
        defaultLanguage: 'pt-BR',
        defaultAudioLanguage: 'pt-BR',
      },
      status,
    };
    const init = await json(`${ep.upload}/videos?uploadType=resumable&part=snippet,status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await access()}`, 'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': 'video/mp4' },
      body,
    });
    const location = init.headers.get('location');
    if (!location) throw new Error('O YouTube não abriu a sessão de envio.');

    // Envio retomável: se a conexão cair, pergunta ao YouTube quanto já chegou e continua dali.
    let start = 0;
    let video = null;
    for (let attempt = 0; attempt < 6 && !video; attempt++) {
      try {
        const headers = { Authorization: `Bearer ${await access()}`, 'Content-Type': 'video/mp4' };
        if (start > 0) headers['Content-Range'] = `bytes ${start}-${size - 1}/${size}`;
        const r = await sendFile(location, file, { method: 'PUT', headers, start, onProgress });
        if (r.status === 200 || r.status === 201) video = r.body;
        else if (r.status >= 400 && r.status < 500 && r.status !== 408) throw new HttpError(r.status, r.body, `YouTube recusou o envio (${r.status}): ${JSON.stringify(r.body).slice(0, 300)}`);
        else throw new Error(`Resposta ${r.status}`);
      } catch (e) {
        if (e instanceof HttpError) throw e;
        await sleep(2000 * (attempt + 1));
        start = await uploadedBytes(location, size, await access());
      }
    }
    if (!video || !video.id) throw new Error('O envio para o YouTube não terminou. Tente de novo.');

    let thumbError = null;
    if (thumbnail && fs.existsSync(thumbnail)) {
      try {
        await json(`${ep.upload}/thumbnails/set?videoId=${encodeURIComponent(video.id)}&uploadType=media`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${await access()}`, 'Content-Type': 'image/jpeg' },
          body: fs.readFileSync(thumbnail),
        });
      } catch (e) {
        // Canais sem verificação por telefone não podem usar miniatura personalizada.
        thumbError = e.message;
      }
    }
    return { id: video.id, url: `https://youtu.be/${video.id}`, status: video.status, thumbError };
  }

  async function uploadedBytes(location, size, token) {
    const res = await fetch(location, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Range': `bytes */${size}`, 'Content-Length': '0' } });
    if (res.status === 308) {
      const range = res.headers.get('range');
      const m = range && /bytes=0-(\d+)/.exec(range);
      return m ? Number(m[1]) + 1 : 0;
    }
    return 0;
  }

  return { access, upload, channel: async () => channelInfo(await access(), ep), tokens: () => tk };
}

module.exports = { connect, client, channelInfo, DEFAULT_ENDPOINTS, SCOPES };
