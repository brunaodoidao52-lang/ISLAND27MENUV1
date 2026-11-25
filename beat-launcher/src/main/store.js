// Guarda a fila e as configurações num arquivo JSON. Senhas e tokens podem ser criptografados (safeStorage).
const fs = require('fs');
const path = require('path');

const SECRET_PATHS = [
  ['youtube', 'clientSecret'],
  ['youtube', 'tokens'],
  ['instagram', 'token'],
];

function defaultSettings() {
  return {
    links: { loja: '', whatsapp: '', download: '', instagram: '' },
    templates: {},
    slots: ['12:00', '18:00', '21:00'],
    days: [0, 1, 2, 3, 4, 5, 6],
    leadMinutes: 30,
    reelLength: 30,
    autopilot: false,
    simulation: true,
    background: true,
    inbox: '',
    outDir: '',
    platforms: { youtube: true, instagram: true },
    youtube: { clientId: '', clientSecret: '', tokens: null, channel: null },
    instagram: { login: 'instagram', userId: '', token: '', username: '', version: 'v23.0', tokenSavedAt: 0 },
  };
}

function merge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

function createStore(file, { encrypt, decrypt } = {}) {
  let data = { items: [], settings: defaultSettings() };
  if (fs.existsSync(file)) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [a, b] of SECRET_PATHS) {
        const v = raw.settings && raw.settings[a] && raw.settings[a][b];
        if (v && typeof v === 'object' && v.$enc && decrypt) {
          try {
            raw.settings[a][b] = JSON.parse(decrypt(v.$enc));
          } catch {
            raw.settings[a][b] = null;
          }
        }
      }
      data = { items: raw.items || [], settings: merge(defaultSettings(), raw.settings) };
    } catch {
      // arquivo corrompido: guarda uma cópia e começa do zero
      fs.copyFileSync(file, `${file}.corrompido-${Date.now()}`);
    }
  }

  let timer = null;
  function writeNow() {
    clearTimeout(timer);
    timer = null;
    const copy = JSON.parse(JSON.stringify(data));
    if (encrypt) {
      for (const [a, b] of SECRET_PATHS) {
        const v = copy.settings[a] && copy.settings[a][b];
        if (v) copy.settings[a][b] = { $enc: encrypt(JSON.stringify(v)) };
      }
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(copy, null, 1));
    fs.renameSync(tmp, file);
  }
  function save() {
    if (!timer) timer = setTimeout(writeNow, 200);
  }

  return {
    get items() {
      return data.items;
    },
    get settings() {
      return data.settings;
    },
    setSettings(patch) {
      data.settings = merge(data.settings, patch);
      save();
      return data.settings;
    },
    item: (id) => data.items.find((i) => i.id === id),
    add(item) {
      data.items.push(item);
      save();
      return item;
    },
    update(id, patch) {
      const it = data.items.find((i) => i.id === id);
      if (!it) return null;
      for (const [k, v] of Object.entries(patch)) {
        it[k] = v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && it[k] && typeof it[k] === 'object' ? { ...it[k], ...v } : v;
      }
      save();
      return it;
    },
    remove(id) {
      data.items = data.items.filter((i) => i.id !== id);
      save();
    },
    move(id, to) {
      const from = data.items.findIndex((i) => i.id === id);
      if (from < 0) return;
      const [it] = data.items.splice(from, 1);
      data.items.splice(Math.max(0, Math.min(to, data.items.length)), 0, it);
      save();
    },
    flush: writeNow,
  };
}

module.exports = { createStore, defaultSettings, merge };
