// Pequenos ajudantes de HTTP: JSON e envio de arquivo grande com progresso.
const fs = require('fs');
const http = require('http');
const https = require('https');

class HttpError extends Error {
  constructor(status, body, message) {
    super(message || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

function apiMessage(body) {
  if (!body) return '';
  if (typeof body === 'string') return body.slice(0, 300);
  const e = body.error;
  if (e && typeof e === 'object') return e.message || e.error_user_msg || JSON.stringify(e).slice(0, 300);
  if (typeof e === 'string') return body.error_description ? `${e}: ${body.error_description}` : e;
  return JSON.stringify(body).slice(0, 300);
}

async function json(url, { method = 'GET', headers = {}, body, form } = {}) {
  const h = { ...headers };
  let payload = body;
  if (form) {
    payload = new URLSearchParams(Object.entries(form).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)])).toString();
    h['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
    payload = JSON.stringify(body);
    h['Content-Type'] = h['Content-Type'] || 'application/json; charset=UTF-8';
  }
  const res = await fetch(url, { method, headers: h, body: payload });
  const text = await res.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* resposta em texto */
  }
  if (!res.ok) throw new HttpError(res.status, data, `${res.status}: ${apiMessage(data) || res.statusText}`);
  return { data, headers: res.headers, status: res.status };
}

/**
 * Envia um arquivo (ou parte dele, a partir de "start") com progresso.
 * Resolve com { status, headers, body } para qualquer resposta HTTP; rejeita só em erro de rede.
 */
function sendFile(url, file, { method = 'PUT', headers = {}, start = 0, onProgress } = {}) {
  const size = fs.statSync(file).size;
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(u, { method, headers: { ...headers, 'Content-Length': size - start } }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let body = text;
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          /* texto */
        }
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    let sent = start;
    const stream = fs.createReadStream(file, { start });
    stream.on('data', (d) => {
      sent += d.length;
      if (onProgress) onProgress(sent / size);
    });
    stream.on('error', (e) => req.destroy(e));
    stream.pipe(req);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { json, sendFile, HttpError, apiMessage, sleep };
