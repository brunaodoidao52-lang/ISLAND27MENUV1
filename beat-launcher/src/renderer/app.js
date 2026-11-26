// Interface do Beat Launcher.
const $ = (id) => document.getElementById(id);
// "api" é a ponte segura criada no preload.js (window.api).
let state = null;
const form = { audio: null, cover: null, bg: null };
let loopImage = null;
let openId = null;

// ---------- utilidades ----------
function toast(msg, err = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast${err ? ' err' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), err ? 7000 : 3200);
}
async function safe(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
    return r;
  } catch (e) {
    toast(e.message, true);
    return undefined;
  }
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const baseName = (p) => String(p || '').split(/[\\/]/).pop();
const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `hoje ${hm}`;
  if (d.toDateString() === tomorrow.toDateString()) return `amanhã ${hm}`;
  return `${WEEK[d.getDay()]} ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hm}`;
}
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

// ---------- navegação ----------
document.querySelectorAll('nav button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.page').forEach((p) => p.classList.toggle('hidden', p.id !== `page-${b.dataset.page}`));
  }),
);
const goTo = (page) => document.querySelector(`nav button[data-page="${page}"]`).click();
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-ext]');
  if (a) {
    e.preventDefault();
    api.openUrl(a.href);
  }
});

// ---------- estado ----------
function render() {
  if (!state) return;
  const s = state.settings;
  $('autopilot').checked = !!s.autopilot;
  $('simulation').checked = !!s.simulation;
  $('banner-test').classList.toggle('hidden', !s.simulation);
  setConn('conn-yt', s.youtube.connected, s.simulation);
  setConn('conn-ig', !!(s.instagram.hasToken && s.instagram.userId), s.simulation);
  const pending = state.items.filter((i) => !['publicado', 'desligado'].includes(i.ig.status) || !['publicado', 'desligado'].includes(i.yt.status)).length;
  $('count-fila').textContent = pending;
  $('count-fila').classList.toggle('hidden', !pending);
  renderQueue();
  renderNextSlots();
  renderMarketing();
  if (openId) fillModalStatus();
}
function setConn(id, on, test) {
  const el = $(id);
  el.querySelector('.dot').className = `dot${on ? ' on' : test ? ' test' : ''}`;
  el.title = on ? 'Conectado' : test ? 'Modo teste (não conectado)' : 'Não conectado';
}

api.onState((s) => {
  state = s;
  render();
});
api.onLog((l) => {
  const el = $('log');
  el.textContent += `${l}\n`;
  el.scrollTop = el.scrollHeight;
});

$('autopilot').addEventListener('change', (e) => safe(() => api.saveSettings({ autopilot: e.target.checked }), e.target.checked ? 'Piloto automático ligado: cada beat pronto ganha o próximo horário livre.' : 'Piloto automático desligado.'));
$('simulation').addEventListener('change', (e) => safe(() => api.saveSettings({ simulation: e.target.checked }), e.target.checked ? 'Modo teste ligado.' : 'Modo teste desligado: agora publica de verdade.'));

// ---------- novo lançamento ----------
function fillGeneros(select, value) {
  select.innerHTML = ['<option value="">—</option>', ...state.generos.map((g) => `<option${g === value ? ' selected' : ''}>${esc(g)}</option>`)].join('');
}
async function setFile(kind, p) {
  form[kind] = p;
  if (kind === 'audio') {
    $('audio-name').textContent = baseName(p);
    $('pick-audio').classList.add('set');
    if (!$('f-nome').value) {
      $('f-nome').value = baseName(p).replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\b\d{2,3}\s*bpm\b/i, '').trim().replace(/(^|\s)(\p{L})/gu, (_m, s, c) => s + c.toUpperCase());
    }
    previewTexts();
  } else if (kind === 'cover') {
    $('cover-name').textContent = baseName(p);
    $('cover-prev').src = await api.fileUrl(p);
    $('cover-prev').classList.remove('hidden');
    $('cover-icon').classList.add('hidden');
    $('pick-cover').classList.add('set');
  } else {
    $('bg-name').textContent = baseName(p);
    $('pick-bg').classList.add('set');
  }
}
$('pick-audio').onclick = async () => {
  const [p] = (await safe(() => api.pickFiles('audio'))) || [];
  if (p) setFile('audio', p);
};
$('pick-cover').onclick = async () => {
  const [p] = (await safe(() => api.pickFiles('image'))) || [];
  if (p) setFile('cover', p);
};
$('pick-bg').onclick = async () => {
  const [p] = (await safe(() => api.pickFiles('video'))) || [];
  if (p) setFile('bg', p);
};
$('f-when-mode').onchange = () => $('f-when').classList.toggle('hidden', $('f-when-mode').value !== 'custom');
$('btn-detect').onclick = async () => {
  if (!form.audio) return toast('Escolha o beat primeiro.', true);
  $('btn-detect').disabled = true;
  $('btn-detect').textContent = 'Ouvindo…';
  const a = await safe(() => api.analyze(form.audio));
  $('btn-detect').disabled = false;
  $('btn-detect').textContent = 'Detectar';
  if (a && a.bpm) {
    $('f-bpm').value = a.bpm;
    toast(`BPM estimado: ${a.bpm}. Confira, às vezes o certo é o dobro ou a metade.`);
    previewTexts();
  } else if (a) toast('Não consegui achar o BPM. Digite manualmente.', true);
};

function formBeat() {
  return {
    nome: $('f-nome').value.trim(),
    artista: $('f-artista').value.trim(),
    genero: $('f-genero').value,
    bpm: Number($('f-bpm').value) || null,
    tom: $('f-tom').value.trim(),
  };
}
let pvTimer = null;
function previewTexts() {
  clearTimeout(pvTimer);
  pvTimer = setTimeout(async () => {
    const b = formBeat();
    if (!b.nome) {
      $('pv-title').textContent = '';
      $('pv-caption').textContent = '';
      return;
    }
    const t = await safe(() => api.previewTexts(b));
    if (!t) return;
    $('pv-title').textContent = t.ytTitle;
    $('pv-caption').textContent = t.igCaption;
  }, 200);
}
['f-nome', 'f-artista', 'f-genero', 'f-bpm', 'f-tom'].forEach((id) => $(id).addEventListener('input', previewTexts));

function renderNextSlots() {
  const list = state.nextSlots || [];
  $('next-slots').innerHTML = list.length ? `Próximos horários livres: ${list.map((d) => `<span class="chip">${esc(fmtWhen(d))}</span>`).join('')}` : 'Defina os horários em Configurações.';
}

function whenFromMode() {
  const mode = $('f-when-mode').value;
  if (mode === 'now') return { when: new Date().toISOString() };
  if (mode === 'custom') return { when: fromLocalInput($('f-when').value) };
  return { when: null, distribute: mode === 'next' };
}

$('btn-add').onclick = async () => {
  if (!form.audio) return toast('Escolha o beat.', true);
  if (!form.cover) return toast('Escolha a capa.', true);
  const w = whenFromMode();
  if ($('f-when-mode').value === 'custom' && !w.when) return toast('Escolha a data e a hora.', true);
  const id = await safe(() =>
    api.addBeat({
      ...formBeat(),
      audioPath: form.audio,
      coverPath: form.cover,
      bgPath: form.bg || '',
      motion: $('f-motion').value,
      platforms: { youtube: $('f-yt').checked, instagram: $('f-ig').checked },
      when: w.when,
    }),
  );
  if (!id) return;
  if (w.distribute) await safe(() => api.distribute());
  toast('Beat na fila! Gerando os vídeos…');
  resetForm();
  goTo('fila');
};
function resetForm() {
  Object.keys(form).forEach((k) => (form[k] = null));
  ['f-nome', 'f-artista', 'f-bpm', 'f-tom'].forEach((id) => ($(id).value = ''));
  $('audio-name').textContent = 'MP3, WAV, FLAC…';
  $('cover-name').textContent = 'JPG, PNG, WEBP…';
  $('bg-name').textContent = 'Opcional (loop, clipe)';
  $('cover-prev').classList.add('hidden');
  $('cover-icon').classList.remove('hidden');
  document.querySelectorAll('.file-btn').forEach((b) => b.classList.remove('set'));
  $('pv-title').textContent = '';
  $('pv-caption').textContent = '';
}

async function addMany(paths) {
  if (!paths.length) return;
  if (paths.length === 1) {
    const p = paths[0];
    if (/\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|aiff?|wma)$/i.test(p)) return setFile('audio', p);
    if (/\.(jpe?g|png|webp|bmp|tiff?|heic|avif)$/i.test(p)) return setFile('cover', p);
    if (/\.(mp4|mov|m4v|webm|mkv|avi|gif)$/i.test(p)) return setFile('bg', p);
  }
  const r = await safe(() => api.addFiles(paths));
  if (!r) return;
  if (r.added && $('f-when-mode').value === 'next') await safe(() => api.distribute());
  if (r.errors.length) toast(`${r.added} lançamento(s) adicionado(s).\n${r.errors.join('\n')}`, !r.added);
  else toast(`${r.added} lançamento(s) adicionado(s)!`);
  if (r.added) goTo('fila');
}
$('btn-pick-many').onclick = async () => addMany((await safe(() => api.pickFiles('any', true))) || []);
const drop = $('drop');
['dragenter', 'dragover'].forEach((ev) =>
  document.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add('over');
  }),
);
['dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, () => drop.classList.remove('over')));
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const paths = [...e.dataTransfer.files].map((f) => api.pathOf(f)).filter(Boolean);
  if (!document.getElementById('page-novo').classList.contains('hidden') || paths.length > 1) addMany(paths);
});

// ---------- fila ----------
const LABEL = {
  render: { aguardando: 'Na fila para gerar', gerando: 'Gerando', pronto: 'Vídeos prontos', erro: 'Erro ao gerar' },
  pub: { pendente: 'Aguardando', enviando: 'Enviando', agendado: 'Agendado', publicado: 'Publicado', erro: 'Erro', desligado: 'Desligado' },
};
const CLS = { aguardando: 'wait', gerando: 'run', pronto: 'ok', erro: 'err', pendente: 'wait', enviando: 'run', agendado: 'ok', publicado: 'ok', desligado: 'off' };

function statusChip(prefix, st, progress, platform, id) {
  const bar = st === 'gerando' || st === 'enviando' ? `<span class="bar"><i style="width:${Math.round((progress || 0) * 100)}%"></i></span>` : '';
  const retry = st === 'erro' ? ` data-retry="${platform}" data-id="${id}" title="Clique para tentar de novo"` : '';
  const label = prefix ? `${prefix}: ${(platform === 'render' ? LABEL.render : LABEL.pub)[st] || st}` : (LABEL.render[st] || st);
  return `<span class="st ${CLS[st] || ''}"${retry}>${esc(label)}${bar}${st === 'erro' ? ' ↻' : ''}</span>`;
}

function itemHtml(it) {
  const meta = [it.artista ? `${it.artista} type beat` : '', it.genero, it.bpm ? `${it.bpm} BPM${it.bpmAuto ? ' (auto)' : ''}` : '', it.tom].filter(Boolean).join(' • ');
  const fase = it.render.status === 'gerando' ? ` · ${esc(it.render.fase || '')}` : '';
  const errs = [it.render.status === 'erro' && `Vídeo: ${it.render.error}`, it.yt.status === 'erro' && `YouTube: ${it.yt.error}`, it.ig.status === 'erro' && `Instagram: ${it.ig.error}`].filter(Boolean);
  const warns = [it.yt.warning, it.needsRerender && 'Você mudou dados do beat: clique em “Gerar vídeos de novo” no detalhe para atualizar os vídeos.'].filter(Boolean);
  const canPublish = it.yt.status === 'pendente' || it.ig.status === 'pendente';
  return `<div class="qitem" data-id="${it.id}">
    <img src="${esc(it.coverUrl || '')}" data-open="${it.id}" alt="" />
    <div>
      <h4 data-open="${it.id}">${esc(it.nome)}</h4>
      <div class="qmeta">${esc(meta) || '&nbsp;'}${fase}</div>
      <div class="qstatus">
        ${statusChip('', it.render.status, it.render.progress, 'render', it.id)}
        ${statusChip('YouTube', it.yt.status, it.yt.progress, 'youtube', it.id)}
        ${statusChip('Instagram', it.ig.status, it.ig.progress, 'instagram', it.id)}
        ${it.when ? `<span class="st when">🕒 ${esc(fmtWhen(it.when))}</span>` : '<span class="st off">sem horário</span>'}
        ${it.yt.url && /^https?:/.test(it.yt.url) ? `<span class="st ok" data-url="${esc(it.yt.url)}">▶ ver no YouTube</span>` : ''}
        ${it.ig.url && /^https?:/.test(it.ig.url) ? `<span class="st ok" data-url="${esc(it.ig.url)}">▶ ver no Instagram</span>` : ''}
      </div>
      ${errs.map((e) => `<div class="qerr">${esc(e)}</div>`).join('')}
      ${warns.map((e) => `<div class="qwarn">${esc(e)}</div>`).join('')}
    </div>
    <div class="qactions">
      <button class="ghost small" data-open="${it.id}">Detalhes</button>
      ${canPublish ? `<button class="ghost small" data-now="${it.id}" title="Publica assim que os vídeos estiverem prontos">Publicar agora</button>` : ''}
      <button class="ghost small danger" data-del="${it.id}" title="Tirar da fila">✕</button>
    </div>
  </div>`;
}

function renderQueue() {
  const q = $('queue');
  const items = [...state.items].sort((a, b) => {
    const done = (i) => (i.yt.status === 'publicado' || i.yt.status === 'desligado') && (i.ig.status === 'publicado' || i.ig.status === 'desligado');
    if (done(a) !== done(b)) return done(a) ? 1 : -1;
    if (a.when && b.when) return new Date(a.when) - new Date(b.when);
    if (a.when !== b.when) return a.when ? -1 : 1;
    return 0;
  });
  q.innerHTML = items.map(itemHtml).join('');
  $('queue-empty').classList.toggle('hidden', items.length > 0);
}

$('queue').addEventListener('click', async (e) => {
  const t = e.target.closest('[data-open],[data-now],[data-del],[data-retry],[data-url]');
  if (!t) return;
  if (t.dataset.url) return api.openUrl(t.dataset.url);
  if (t.dataset.open) return openModal(t.dataset.open);
  if (t.dataset.now) return safe(() => api.publishNow(t.dataset.now), 'Vai sair assim que estiver pronto.');
  if (t.dataset.retry) return safe(() => api.retry(t.dataset.id, t.dataset.retry), 'Tentando de novo…');
  if (t.dataset.del) {
    const it = state.items.find((i) => i.id === t.dataset.del);
    if (it && confirm(`Tirar “${it.nome}” da fila? (os vídeos já gerados continuam na pasta)`)) safe(() => api.removeBeat(it.id));
  }
});
$('btn-distribute').onclick = () => safe(() => api.distribute(), (n) => (n ? `${n} beat(s) com horário marcado.` : 'Nenhum beat sem horário.'));
$('btn-clear-times').onclick = () => confirm('Tirar os horários dos beats que ainda não foram enviados?') && safe(() => api.clearTimes(), 'Horários limpos.');

// ---------- detalhe ----------
function current() {
  return state.items.find((i) => i.id === openId);
}
function openModal(id) {
  openId = id;
  const it = current();
  if (!it) return;
  $('m-cover').src = it.coverUrl || '';
  $('m-title').textContent = it.nome;
  $('m-nome').value = it.nome;
  $('m-artista').value = it.artista || '';
  fillGeneros($('m-genero'), it.genero);
  $('m-bpm').value = it.bpm || '';
  $('m-tom').value = it.tom || '';
  $('m-when').value = toLocalInput(it.when);
  $('m-pyt').checked = !!it.platforms.youtube;
  $('m-pig').checked = !!it.platforms.instagram;
  fillTexts(it);
  setVideos(it);
  fillModalStatus();
  $('modal').classList.remove('hidden');
}
function fillTexts(it) {
  $('m-ytTitle').value = it.texts.ytTitle;
  $('m-ytDescription').value = it.texts.ytDescription;
  $('m-ytTags').value = (it.texts.ytTags || []).join(', ');
  $('m-igCaption').value = it.texts.igCaption;
}
let shownUrls = '';
function setVideos(it) {
  const u = it.urls;
  const key = u ? `${u.youtube}|${u.reels}|${u.thumb}` : '';
  if (key === shownUrls) return;
  shownUrls = key;
  $('m-norender').classList.toggle('hidden', !!u);
  ['m-yt', 'm-reels', 'm-thumb', 'm-thumbB'].forEach((id) => $(id).parentElement.classList.toggle('hidden', !u || (id === 'm-thumbB' && !u.thumbB)));
  if (u) {
    $('m-yt').src = u.youtube || '';
    $('m-reels').src = u.reels || '';
    $('m-thumb').src = u.thumb || '';
    if (u.thumbB) $('m-thumbB').src = u.thumbB;
  }
}
function fillModalStatus() {
  const it = current();
  if (!it) return closeModal();
  $('m-sub').textContent = [it.artista ? `${it.artista} type beat` : it.genero, it.bpm && `${it.bpm} BPM`].filter(Boolean).join(' • ');
  $('m-badges').innerHTML = [statusChip('', it.render.status, it.render.progress, 'render', it.id), statusChip('YouTube', it.yt.status, it.yt.progress, 'youtube', it.id), statusChip('Instagram', it.ig.status, it.ig.progress, 'instagram', it.id)].join('');
  setVideos(it);
  $('m-folder').disabled = !it.folder;
  fillModalAI(it);
}
function fillModalAI(it) {
  const on = state.settings.ai && state.settings.ai.enabled;
  $('m-ai').classList.toggle('hidden', !on);
  if (!on) return;
  const a = it.ai || {};
  const st = { pensando: 'pensando…', sugestao: 'sugestão pronta', aplicada: 'aplicada', erro: `erro: ${a.error || ''}` }[a.status] || '';
  $('m-ai-status').textContent = st;
  const sug = a.suggestion;
  $('m-ai-body').innerHTML = sug ? `<b>Título</b>\n${esc(sug.ytTitle)}\n\n<b>Frase do Reels</b>\n${esc(sug.hook)}\n\n<b>Legenda</b>\n${esc(sug.igCaption)}\n\n<b>Descrição</b>\n${esc(sug.ytDescription)}` : '<span class="muted">Peça uma sugestão para comparar com os textos atuais.</span>';
  $('m-ai-use').disabled = !sug || a.status === 'aplicada';
  $('m-ai-ask').disabled = a.status === 'pensando';
}
$('m-ai-ask').onclick = () => safe(() => api.aiSuggestBeat(openId), 'Sugestão da IA pronta.');
$('m-ai-use').onclick = async () => {
  await safe(() => api.aiApplyBeat(openId), 'Textos da IA aplicados (você ainda pode editar).');
  setTimeout(() => current() && fillTexts(current()), 250);
};
function closeModal() {
  openId = null;
  shownUrls = '';
  ['m-yt', 'm-reels'].forEach((id) => {
    $(id).pause();
    $(id).removeAttribute('src');
    $(id).load();
  });
  $('modal').classList.add('hidden');
}
$('m-close').onclick = closeModal;
$('modal').addEventListener('click', (e) => e.target.id === 'modal' && closeModal());
document.addEventListener('keydown', (e) => e.key === 'Escape' && openId && closeModal());
$('m-badges').addEventListener('click', (e) => {
  const t = e.target.closest('[data-retry]');
  if (t) safe(() => api.retry(t.dataset.id, t.dataset.retry), 'Tentando de novo…');
});

$('m-save').onclick = async () => {
  const it = current();
  if (!it) return;
  const patch = {
    nome: $('m-nome').value.trim() || it.nome,
    artista: $('m-artista').value.trim(),
    genero: $('m-genero').value,
    bpm: Number($('m-bpm').value) || null,
    tom: $('m-tom').value.trim(),
    when: fromLocalInput($('m-when').value),
    platforms: { youtube: $('m-pyt').checked, instagram: $('m-pig').checked },
  };
  const t = {
    ytTitle: $('m-ytTitle').value.trim().slice(0, 100),
    ytDescription: $('m-ytDescription').value,
    ytTags: $('m-ytTags').value.split(',').map((x) => x.trim()).filter(Boolean),
    igCaption: $('m-igCaption').value,
  };
  const changedText = t.ytTitle !== it.texts.ytTitle || t.ytDescription !== it.texts.ytDescription || t.ytTags.join(',') !== (it.texts.ytTags || []).join(',') || t.igCaption !== it.texts.igCaption;
  if (changedText) patch.texts = { ...it.texts, ...t };
  await safe(() => api.updateBeat(it.id, patch), 'Salvo.');
  // o estado novo chega logo depois; mostra os textos atualizados (se o beat mudou e os textos eram automáticos)
  setTimeout(() => current() && fillTexts(current()), 250);
};
$('m-regen').onclick = async () => {
  await safe(() => api.regenTexts(openId), 'Textos refeitos a partir dos modelos.');
  setTimeout(() => current() && fillTexts(current()), 200);
};
$('m-rerender').onclick = () => safe(() => api.rerender(openId), 'Gerando os vídeos de novo…');
$('m-folder').onclick = () => current() && current().folder && api.openPath(current().folder);
document.querySelectorAll('[data-copy]').forEach((b) =>
  b.addEventListener('click', (e) => {
    e.preventDefault();
    safe(() => api.copy($(b.dataset.copy).value), 'Copiado!');
  }),
);

// ---------- loop ----------
$('loop-pick').onclick = async () => {
  const [p] = (await safe(() => api.pickFiles('image'))) || [];
  if (!p) return;
  loopImage = p;
  $('loop-name').textContent = baseName(p);
  $('loop-prev').src = await api.fileUrl(p);
  $('loop-prev').classList.remove('hidden');
  $('loop-icon').classList.add('hidden');
  $('loop-pick').classList.add('set');
};
$('loop-style').onchange = () => $('loop-bpm-wrap').classList.toggle('hidden', $('loop-style').value !== 'pulse');
api.onLoopProgress(({ p }) => {
  $('loop-progress').firstElementChild.style.width = `${Math.round(p * 100)}%`;
});
let lastLoop = null;
$('loop-go').onclick = async () => {
  if (!loopImage) return toast('Escolha a foto ou capa.', true);
  $('loop-go').disabled = true;
  $('loop-go').textContent = 'Gerando…';
  $('loop-progress').classList.remove('hidden');
  $('loop-progress').firstElementChild.style.width = '0%';
  const r = await safe(() =>
    api.renderLoop({
      image: loopImage,
      format: $('loop-format').value,
      style: $('loop-style').value,
      seconds: Number($('loop-seconds').value),
      bpm: Number($('loop-bpm').value) || 120,
      grain: $('loop-grain').checked,
      brand: $('loop-brand').checked,
    }),
  );
  $('loop-go').disabled = false;
  $('loop-go').textContent = 'Gerar loop';
  $('loop-progress').classList.add('hidden');
  if (!r) return;
  lastLoop = r.path;
  $('loop-video').src = r.url;
  $('loop-video').classList.remove('hidden');
  $('loop-empty').classList.add('hidden');
  $('loop-actions').classList.remove('hidden');
  toast('Loop pronto!');
};
$('loop-show').onclick = () => lastLoop && api.showFile(lastLoop);

// ---------- configurações ----------
function fillSettings() {
  const s = state.settings;
  $('s-loja').value = s.links.loja || '';
  $('s-whatsapp').value = s.links.whatsapp || '';
  $('s-download').value = s.links.download || '';
  $('s-instagram').value = s.links.instagram || '';
  $('s-slots').value = (s.slots || []).join(', ');
  $('s-days').innerHTML = WEEK.map((d, i) => `<label><input type="checkbox" value="${i}"${(s.days || []).includes(i) ? ' checked' : ''} />${d}</label>`).join('');
  $('s-lead').value = s.leadMinutes ?? 30;
  $('s-reel').value = s.reelLength ?? 30;
  $('s-visual').value = s.visual || 'onda';
  $('s-inbox').value = s.inbox || '';
  $('s-out').value = state.outDir;
  $('s-background').checked = !!s.background;
  const tpl = { ...state.defaultTemplates, ...(s.templates || {}) };
  ['ytTitle', 'ytDescription', 'igCaption', 'cta'].forEach((k) => ($(`t-${k}`).value = tpl[k] || ''));
  $('yt-id').value = s.youtube.clientId || '';
  $('yt-secret').placeholder = s.youtube.hasSecret ? '(guardado)' : 'GOCSPX-…';
  $('yt-status').textContent = s.youtube.connected ? `Conectado${s.youtube.channel ? ` ao canal “${s.youtube.channel.title}”` : ''}.` : 'Não conectado.';
  $('yt-dot').className = `dot${s.youtube.connected ? ' on' : ''}`;
  $('ig-login').value = s.instagram.login || 'instagram';
  $('ig-user').value = s.instagram.userId || '';
  $('ig-token').placeholder = s.instagram.hasToken ? '(guardado)' : 'Cole o token aqui';
  const igOn = s.instagram.hasToken && s.instagram.userId;
  $('ig-status').textContent = igOn ? `Conectado${s.instagram.username ? ` como @${s.instagram.username}` : ''}.` : 'Não conectado.';
  $('ig-dot').className = `dot${igOn ? ' on' : ''}`;
  fillGeneros($('f-genero'), $('f-genero').value);
  fillAI();
  fillClaude();
}
let claudeInfo = null;
async function fillClaude() {
  claudeInfo = await safe(() => api.claudeInfo());
  if (!claudeInfo) return;
  $('cl-on').checked = claudeInfo.enabled;
  $('cl-dot').className = `dot${claudeInfo.running && claudeInfo.installed ? ' on' : claudeInfo.running ? ' test' : ''}`;
  $('cl-status').textContent = !claudeInfo.enabled ? 'Desligado.' : `${claudeInfo.running ? 'Porta de controle ligada.' : 'Porta de controle desligada.'} ${claudeInfo.installed ? 'Conector instalado no app Claude.' : 'Conector ainda não instalado no app Claude.'}`;
}
$('cl-on').addEventListener('change', async (e) => {
  await safe(() => api.claudeToggle(e.target.checked), e.target.checked ? 'Claude pode controlar o app.' : 'Controle pelo Claude desligado.');
  fillClaude();
});
$('cl-install').onclick = async () => {
  const f = await safe(() => api.claudeInstall(), (file) => `Instalado em ${file}. Feche e abra o app Claude.`);
  if (f) fillClaude();
};
$('cl-copy').onclick = async () => { if (!claudeInfo) await fillClaude(); if (claudeInfo) safe(() => api.copy(claudeInfo.json), 'Configuração copiada.'); };
$('cl-copy-code').onclick = async () => { if (!claudeInfo) await fillClaude(); if (claudeInfo) safe(() => api.copy(claudeInfo.claudeCode), 'Comando copiado.'); };

function fillAI() {
  const a = state.settings.ai || {};
  const provs = state.aiProviders || {};
  $('ai-provider').innerHTML = Object.entries(provs).map(([k, v]) => `<option value="${k}"${(a.provider || 'deepseek') === k ? ' selected' : ''}>${esc(v.label)}</option>`).join('');
  const p = provs[a.provider || 'deepseek'] || {};
  $('ai-enabled').checked = !!a.enabled;
  $('ai-auto').checked = !!a.autoApply;
  $('ai-base').value = a.baseUrl || '';
  $('ai-base').placeholder = p.baseUrl || 'https://…';
  $('ai-model').value = a.model || '';
  $('ai-model').placeholder = p.model || 'nome-do-modelo';
  $('ai-models').innerHTML = (p.models || []).map((m) => `<option value="${esc(m)}">`).join('');
  $('ai-key').placeholder = a.hasKey ? '(guardada)' : 'sk-…';
  $('ai-dot').className = `dot${a.enabled && a.hasKey ? ' on' : a.enabled ? ' test' : ''}`;
  $('ai-status').textContent = !a.enabled ? 'Desligada.' : a.hasKey ? 'Ligada (modo teste).' : 'Ligada, mas falta a chave.';
}
$('ai-provider').onchange = () => {
  const p = (state.aiProviders || {})[$('ai-provider').value] || {};
  $('ai-base').placeholder = p.baseUrl || 'https://…';
  $('ai-model').placeholder = p.model || 'nome-do-modelo';
  $('ai-models').innerHTML = (p.models || []).map((m) => `<option value="${esc(m)}">`).join('');
};
function aiForm() {
  return { enabled: $('ai-enabled').checked, autoApply: $('ai-auto').checked, provider: $('ai-provider').value, baseUrl: $('ai-base').value, model: $('ai-model').value, apiKey: $('ai-key').value };
}
$('ai-save').onclick = async () => {
  await safe(() => api.saveAI(aiForm()), 'Configuração da IA salva.');
  $('ai-key').value = '';
  setTimeout(fillAI, 200);
};
$('ai-test').onclick = async () => {
  await safe(() => api.saveAI(aiForm()));
  $('ai-key').value = '';
  $('ai-test').disabled = true;
  $('ai-status').textContent = 'Testando…';
  const r = await safe(() => api.testAI(), (x) => `IA respondeu (${x.model}).`);
  $('ai-test').disabled = false;
  $('ai-status').textContent = r ? `Conectada: o modelo ${r.model} respondeu “${r.reply}”.` : 'Falhou. Veja a mensagem de erro.';
};
$('ai-clear').onclick = () => confirm('Apagar a chave da IA deste computador?') && safe(() => api.clearAIKey(), 'Chave apagada e IA desligada.').then(() => setTimeout(fillAI, 200));
document.querySelector('nav button[data-page="config"]').addEventListener('click', fillSettings);

$('s-save').onclick = () => {
  const days = [...$('s-days').querySelectorAll('input:checked')].map((i) => Number(i.value));
  safe(
    () =>
      api.saveSettings({
        links: { loja: $('s-loja').value.trim(), whatsapp: $('s-whatsapp').value.trim(), download: $('s-download').value.trim(), instagram: $('s-instagram').value.trim() },
        slots: $('s-slots').value,
        days: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
        leadMinutes: Number($('s-lead').value) || 0,
        reelLength: Math.max(10, Math.min(90, Number($('s-reel').value) || 30)),
        background: $('s-background').checked,
        visual: $('s-visual').value,
      }),
    'Configurações salvas.',
  ).then(() => setTimeout(fillSettings, 200));
};
$('s-inbox-pick').onclick = async () => {
  const d = await safe(() => api.pickFolder());
  if (d) {
    await safe(() => api.saveSettings({ inbox: d }), 'Pasta de entrada definida. Jogue beat + capa (mesmo nome) lá dentro.');
    $('s-inbox').value = d;
  }
};
$('s-out-pick').onclick = async () => {
  const d = await safe(() => api.pickFolder());
  if (d) {
    await safe(() => api.saveSettings({ outDir: d }), 'Pasta dos vídeos definida.');
    $('s-out').value = d;
  }
};
$('s-out-open').onclick = async () => {
  await safe(() => api.ensureFolder(state.outDir));
  api.openPath(state.outDir);
};
$('t-save').onclick = () =>
  safe(() => api.saveSettings({ templates: { ytTitle: $('t-ytTitle').value, ytDescription: $('t-ytDescription').value, igCaption: $('t-igCaption').value, cta: $('t-cta').value } }), 'Modelos salvos. Os beats ainda não enviados foram atualizados.');
$('t-reset').onclick = () => {
  if (!confirm('Voltar os textos para o padrão?')) return;
  safe(() => api.saveSettings({ templates: { ...state.defaultTemplates } }), 'Textos no padrão.').then(() => setTimeout(fillSettings, 200));
};
$('yt-connect').onclick = async () => {
  $('yt-connect').disabled = true;
  $('yt-connect').textContent = 'Esperando o navegador…';
  await safe(() => api.connectYouTube($('yt-id').value.trim(), $('yt-secret').value.trim()), (ch) => `YouTube conectado${ch ? `: ${ch.title}` : ''}!`);
  $('yt-connect').disabled = false;
  $('yt-connect').textContent = 'Conectar YouTube';
  $('yt-secret').value = '';
  setTimeout(fillSettings, 200);
};
$('yt-disconnect').onclick = () => safe(() => api.disconnectYouTube(), 'YouTube desconectado.').then(() => setTimeout(fillSettings, 200));
$('ig-save').onclick = async () => {
  await safe(() => api.saveInstagram({ login: $('ig-login').value, userId: $('ig-user').value, token: $('ig-token').value }), (a) => `Instagram conectado: @${a.username}`);
  $('ig-token').value = '';
  setTimeout(fillSettings, 200);
};
$('ig-disconnect').onclick = () => safe(() => api.disconnectInstagram(), 'Instagram desconectado.').then(() => setTimeout(fillSettings, 200));

// ---------- marketing ----------
const PHOTO_SLOTS = [
  ['artista', 'Bruninn (1)'],
  ['artista2', 'Bruninn (2)'],
  ['ilha', 'Ilha / lugar'],
  ['banner', 'Banner da marca'],
];
const MK_STATUS = {
  planejado: ['Na fila para gerar', 'wait'],
  gerando: ['Gerando artes', 'run'],
  pronto: ['Pronto (aguardando a hora)', 'ok'],
  'hora-de-postar': ['Hora de postar!', 'err'],
  enviando: ['Publicando', 'run'],
  postado: ['Postado', 'ok'],
  automatico: ['Sai pela fila de beats', 'wait'],
  erro: ['Erro', 'err'],
};

function fillMarketingSettings() {
  const m = { ...state.defaultMarketing, ...(state.settings.marketing || {}) };
  const photos = m.photos || {};
  $('mk-photos').innerHTML = PHOTO_SLOTS.map(([k, label]) => {
    const url = (state.marketingPhotoUrls || {})[k];
    return `<button class="photo-btn" data-photo="${k}">${url ? `<img src="${esc(url)}" alt="" />` : '<span class="ph">＋</span>'}${esc(label)}</button>`;
  }).join('');
  $('mk-handle').value = m.handle || '';
  const lic = m.licencas || state.defaultMarketing.licencas;
  $('mk-lic').innerHTML = lic
    .map((r, i) => `<div class="row" data-lic="${i}"><label>Nome<input data-k="nome" value="${esc(r.nome)}" /></label><label>Descrição<input data-k="desc" value="${esc(r.desc)}" /></label><label>Preço<input data-k="preco" value="${esc(r.preco)}" /></label></div>`)
    .join('');
  const t = m.times || {};
  $('mk-t-feed').value = t.feed || '';
  $('mk-t-reels').value = t.reels || '';
  $('mk-t-story').value = t.story || '';
  $('mk-auto').checked = m.autoPublish !== false;
  if (!$('mk-start').value) {
    const d = new Date(Date.now() + 86400000);
    $('mk-start').value = toLocalInput(d.toISOString()).slice(0, 10);
  }
}
document.querySelector('nav button[data-page="marketing"]').addEventListener('click', () => {
  fillMarketingSettings();
  renderMarketing(true);
});
$('mk-photos').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-photo]');
  if (!b) return;
  const f = await safe(() => api.pickMarketingPhoto(b.dataset.photo));
  if (f) setTimeout(fillMarketingSettings, 200);
});
$('mk-save').onclick = () => {
  const licencas = [...$('mk-lic').querySelectorAll('[data-lic]')].map((row) => {
    const o = {};
    row.querySelectorAll('input').forEach((i) => (o[i.dataset.k] = i.value.trim()));
    if (row.dataset.lic === '1') o.destaque = true;
    return o;
  });
  safe(
    () => api.saveMarketing({ handle: $('mk-handle').value.trim() || '@__island27', licencas, times: { feed: $('mk-t-feed').value.trim() || '12:00', reels: $('mk-t-reels').value.trim() || '18:30', story: $('mk-t-story').value.trim() || '20:00' } }),
    'Salvo. Os próximos posts gerados já usam esses dados (use “Gerar de novo” nos que já existem).',
  );
};
$('mk-auto').addEventListener('change', (e) => safe(() => api.saveMarketing({ autoPublish: e.target.checked })));
$('mk-week').onclick = () => {
  const v = $('mk-start').value;
  if (!v) return toast('Escolha o dia de início.', true);
  safe(() => api.planWeek(`${v}T00:00:00`, Number($('mk-type').value)), (n) => `${n} posts planejados. Gerando as artes…`);
};
$('mk-vitrine').onclick = () => safe(() => api.planVitrine(), (n) => `${n} peças da vitrine. Gerando as artes…`);
$('mk-ai-go').onclick = async () => {
  $('mk-ai-go').disabled = true;
  $('mk-ai-out').innerHTML = '<span class="muted">Pensando…</span>';
  const list = await safe(() => api.aiIdeas(5, $('mk-ai-foco').value.trim()));
  $('mk-ai-go').disabled = false;
  $('mk-ai-out').innerHTML = (list || []).map((i) => `<div class="idea"><b>${esc(i.titulo)}</b>${esc(i.formato || '')}${i.gancho ? ` · gancho: ${esc(i.gancho)}` : ''}\n\n${esc(i.roteiro || '')}</div>`).join('') || '<span class="muted">Sem ideias. Veja o erro acima.</span>';
};
$('mk-clear').onclick = () => safe(() => api.clearPosted(), 'Lista limpa.');

function mkItemHtml(p) {
  const [label, cls] = MK_STATUS[p.status] || [p.status, ''];
  const kind = (state.kindLabels || {})[p.kind] || p.kind;
  const when = p.vitrine ? 'Vitrine (sem data)' : fmtWhen(p.date);
  const thumbs = (p.imageUrls || []).map((u, i) => `<img src="${esc(u)}" data-view="${esc(u)}" alt="${i + 1}" />`).join('');
  const video = p.videoUrl ? `<video src="${esc(p.videoUrl)}" controls muted preload="metadata"></video>` : '';
  const roteiro = p.roteiro ? `<div class="mk-roteiro"><b>Roteiro para gravar</b>\n${esc(p.roteiro.join('\n'))}</div>` : '';
  const canPost = !['postado', 'automatico'].includes(p.status);
  return `<div class="mk-item${p.status === 'hora-de-postar' ? ' due' : ''}" data-id="${esc(p.id)}">
    <div>
      <h4>${esc(p.titulo)}</h4>
      <div class="mk-meta">
        <span class="st ${cls}">${esc(label)}${p.status === 'enviando' ? `<span class="bar"><i style="width:${Math.round((p.progress || 0) * 100)}%"></i></span>` : ''}</span>
        <span class="st when">🕒 ${esc(when)}</span>
        <span class="st">${esc(kind)}</span>
        ${p.pilar ? `<span class="st">${esc(p.pilar)}</span>` : ''}
        ${p.url && /^https?:/.test(p.url) ? `<span class="st ok" data-url="${esc(p.url)}">▶ ver no Instagram</span>` : ''}
      </div>
      ${p.error ? `<div class="qerr">${esc(p.error)}</div>` : ''}
      ${p.notes ? `<div class="mk-notes">📱 ${esc(p.notes)}</div>` : ''}
      ${thumbs || video ? `<div class="mk-thumbs">${video}${thumbs}</div>` : ''}
      ${roteiro}
    </div>
    <div class="mk-side">
      ${p.kind === 'destaque' ? '<p class="muted small">Destaque: poste os stories na ordem (a 1ª imagem é a capa da bolinha).</p>' : p.kind === 'story' ? '<p class="muted small">Story: sem legenda. Veja o sticker indicado ao lado.</p>' : `<textarea data-caption>${esc(p.caption || '')}</textarea>`}
      <div class="row wrap">
        ${!['destaque', 'story'].includes(p.kind) ? `<button class="ghost small" data-act="copy">Copiar legenda</button><button class="ghost small" data-act="save">Salvar legenda</button>${state.settings.ai && state.settings.ai.enabled ? '<button class="ghost small" data-act="ai">✦ Reescrever com IA</button>' : ''}` : ''}
        ${p.files && p.files.dir ? '<button class="ghost small" data-act="folder">Abrir pasta</button>' : ''}
        ${canPost ? '<button class="primary small" data-act="done">Marcar como postado</button>' : ''}
        ${p.slides ? '<button class="ghost small" data-act="rerender">Gerar de novo</button>' : ''}
        <button class="ghost small danger" data-act="remove">✕</button>
      </div>
    </div>
  </div>`;
}

let mkPending = false;
function renderMarketing(force) {
  if (!state || !state.posts) return;
  $('mk-ai').classList.toggle('hidden', !(state.settings.ai && state.settings.ai.enabled));
  const due = state.posts.filter((p) => p.status === 'hora-de-postar').length;
  $('count-mkt').textContent = due;
  $('count-mkt').classList.toggle('hidden', !due);
  if (document.getElementById('page-marketing').classList.contains('hidden') && !force) return;
  // não redesenha enquanto você edita uma legenda
  if (!force && document.activeElement && document.activeElement.closest && document.activeElement.closest('#mk-list')) {
    mkPending = true;
    return;
  }
  mkPending = false;
  const posts = [...state.posts].sort((a, b) => (a.vitrine === b.vitrine ? new Date(a.date) - new Date(b.date) : a.vitrine ? -1 : 1));
  let html = '';
  let lastDay = '';
  for (const p of posts) {
    const day = p.vitrine ? 'Vitrine do perfil' : new Date(p.date).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
    if (day !== lastDay) {
      html += `<div class="mk-day">${esc(day)}</div>`;
      lastDay = day;
    }
    html += mkItemHtml(p);
  }
  $('mk-list').innerHTML = html;
  $('mk-empty').classList.toggle('hidden', posts.length > 0);
}
document.addEventListener('focusout', () => mkPending && setTimeout(() => renderMarketing(), 50));
$('mk-list').addEventListener('click', (e) => {
  const v = e.target.closest('[data-view]');
  if (v) {
    const w = document.createElement('div');
    w.className = 'viewer';
    w.innerHTML = `<img src="${esc(v.dataset.view)}" alt="" />`;
    w.onclick = () => w.remove();
    document.body.appendChild(w);
    return;
  }
  const u = e.target.closest('[data-url]');
  if (u) return api.openUrl(u.dataset.url);
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const item = b.closest('[data-id]');
  const id = item.dataset.id;
  const p = state.posts.find((x) => x.id === id);
  const caption = item.querySelector('[data-caption]');
  const act = b.dataset.act;
  if (act === 'copy') safe(() => api.copy(caption.value), 'Legenda copiada!');
  else if (act === 'save') safe(() => api.updatePost(id, { caption: caption.value }), 'Legenda salva.');
  else if (act === 'folder') api.openPath(p.files.dir);
  else if (act === 'done') safe(() => api.markPosted(id), 'Marcado como postado.');
  else if (act === 'rerender') safe(() => api.rerenderPost(id), 'Gerando de novo…');
  else if (act === 'ai') {
    b.disabled = true;
    b.textContent = 'Pensando…';
    safe(() => api.aiRewritePost(id)).then((txt) => {
      b.disabled = false;
      b.textContent = '✦ Reescrever com IA';
      if (txt) {
        caption.value = txt;
        caption.focus();
        toast('Legenda nova da IA no campo. Clique em “Salvar legenda” se gostar.');
      }
    });
  }
  else if (act === 'remove' && confirm('Tirar este post da lista? (os arquivos continuam na pasta)')) safe(() => api.removePost(id));
});

// ---------- início ----------
(async () => {
  state = await api.getState();
  fillGeneros($('f-genero'), '');
  $('log').textContent = (state.log || []).join('\n') + (state.log && state.log.length ? '\n' : '');
  render();
  fillSettings();
  if (!state.items.length) goTo('novo');
})();
