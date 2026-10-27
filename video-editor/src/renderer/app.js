// Interface do editor: estado, histórico, reprodutor, linha do tempo, ferramentas e exportação.
(function () {
  const P = window.Project;
  const R = window.Render;
  const api = window.api;
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const canvas = $('#preview');
  const ctx = canvas.getContext('2d');

  const state = {
    project: P.newProject(),
    projectPath: null,
    sel: null,
    tool: 'canvas',
    time: 0,
    playing: false,
    pps: 80,
    dirty: false,
    rec: null,
    exportOpts: { resolution: 1080, fps: 30, quality: 'high' },
  };
  state.project.ratio = 'original';
  const proj = () => state.project;

  // ---------------------------------------------------------------- Histórico (desfazer/refazer)
  const history = { undo: [], redo: [], stable: JSON.stringify(state.project), from: null, timer: null };

  function commitHistory() {
    clearTimeout(history.timer);
    history.timer = null;
    const now = JSON.stringify(proj());
    if (history.from && history.from !== now) {
      history.undo.push(history.from);
      if (history.undo.length > 150) history.undo.shift();
      history.redo = [];
    }
    history.stable = now;
    history.from = null;
  }

  // Chamar depois de qualquer alteração no projeto.
  function changed(opts = {}) {
    if (!history.timer) history.from = history.stable;
    clearTimeout(history.timer);
    history.timer = setTimeout(commitHistory, 400);
    setDirty(true);
    refresh(opts);
  }

  function restore(json) {
    state.project = JSON.parse(json);
    history.stable = json;
    if (state.sel && !findSel()) state.sel = null;
    syncElements();
    fitCanvas();
    setDirty(true);
    refresh();
  }

  function undo() {
    commitHistory();
    if (!history.undo.length) return toast('Nada para desfazer');
    history.redo.push(JSON.stringify(proj()));
    restore(history.undo.pop());
  }

  function redo() {
    commitHistory();
    if (!history.redo.length) return toast('Nada para refazer');
    history.undo.push(JSON.stringify(proj()));
    restore(history.redo.pop());
  }

  function setDirty(v) {
    if (state.dirty === v) return;
    state.dirty = v;
    api.setDirty(v);
    updateTitle();
  }

  function updateTitle() {
    const name = state.projectPath ? state.projectPath.split(/[\\/]/).pop().replace(/\.i27proj$/, '') : 'Projeto sem título';
    $('#projectName').textContent = `${name}${state.dirty ? ' •' : ''}`;
    document.title = `${name} — ISLAND27 Editor`;
  }

  // ---------------------------------------------------------------- Seleção
  function findSel() {
    const s = state.sel;
    if (!s) return null;
    const list = s.kind === 'clip' ? proj().clips : s.kind === 'text' ? proj().texts : proj().audio;
    return list.find((x) => x.id === s.id) || null;
  }
  const selOf = (kind) => (state.sel && state.sel.kind === kind ? findSel() : null);

  function select(kind, id, tool) {
    state.sel = kind ? { kind, id } : null;
    if (tool) state.tool = tool;
    else if (kind === 'clip' && !TOOLS.find((t) => t.id === state.tool && t.clip)) state.tool = 'clip';
    else if (kind === 'text') state.tool = findSel()?.sticker ? 'sticker' : 'text';
    else if (kind === 'audio') state.tool = 'music';
    refresh();
  }

  function itemAt(t) {
    const { items } = P.layout(proj());
    for (let i = items.length - 1; i >= 0; i--) if (items[i].start <= t + 1e-6) return items[i];
    return null;
  }

  function ensureClipSelected() {
    if (selOf('clip')) return selOf('clip');
    const it = itemAt(state.time);
    if (!it) {
      toast('Adicione um vídeo ou foto primeiro');
      return null;
    }
    state.sel = { kind: 'clip', id: it.clip.id };
    return it.clip;
  }

  // ---------------------------------------------------------------- Elementos de mídia da prévia
  const elements = new Map();

  function createElement(item, isAudio) {
    const url = item.proxyUrl || item.url;
    let el;
    if (!isAudio && item.type === 'image') {
      el = new Image();
      el.onload = requestDraw;
    } else {
      el = document.createElement(isAudio ? 'audio' : 'video');
      el.preload = 'auto';
      el.playsInline = true;
      el.addEventListener('loadeddata', requestDraw);
      el.addEventListener('seeked', requestDraw);
      el.addEventListener('error', () => useProxy(item));
    }
    el.src = url;
    return { el, url };
  }

  const proxying = new Set();
  async function useProxy(item) {
    if (item.proxyUrl || proxying.has(item.path)) return;
    proxying.add(item.path);
    toast(`Preparando prévia de ${item.name}…`, 6000);
    try {
      const url = await api.makeProxy(item.path);
      for (const x of [...proj().clips, ...proj().audio]) if (x.path === item.path) x.proxyUrl = url;
      syncElements();
      requestDraw();
      toast('Prévia pronta');
    } catch (e) {
      toast(`Não foi possível reproduzir ${item.name} na prévia (a exportação ainda funciona).`, 6000);
    } finally {
      proxying.delete(item.path);
    }
  }

  function syncElements() {
    const alive = new Set();
    const ensure = (item, isAudio) => {
      alive.add(item.id);
      const cur = elements.get(item.id);
      const url = item.proxyUrl || item.url;
      if (cur && cur.url === url) return;
      if (cur) disposeElement(cur);
      elements.set(item.id, createElement(item, isAudio));
    };
    proj().clips.forEach((c) => ensure(c, false));
    proj().audio.forEach((a) => ensure(a, true));
    for (const [id, m] of elements) {
      if (!alive.has(id)) {
        disposeElement(m);
        elements.delete(id);
      }
    }
  }

  function disposeElement(m) {
    if (m.el.pause) m.el.pause();
    m.el.removeAttribute('src');
    if (m.el.load) m.el.load();
  }

  // ---------------------------------------------------------------- Reprodutor
  let clock = { start: 0, from: 0 };

  function play() {
    const total = P.totalDuration(proj());
    if (!total) return;
    if (state.time >= total - 0.02) state.time = 0;
    state.playing = true;
    clock = { start: performance.now(), from: state.time };
    $('#playBtn').textContent = '❚❚';
    loop();
  }

  function pause() {
    state.playing = false;
    $('#playBtn').textContent = '▶';
    for (const { el } of elements.values()) if (el.pause) el.pause();
    requestDraw();
  }

  function togglePlay() {
    if (state.playing) pause();
    else play();
  }

  function seek(t) {
    state.time = clamp(t, 0, P.totalDuration(proj()));
    if (state.playing) clock = { start: performance.now(), from: state.time };
    updatePlayhead();
    requestDraw();
  }

  function loop() {
    if (!state.playing) return;
    const total = P.totalDuration(proj());
    state.time = clock.from + (performance.now() - clock.start) / 1000;
    if (state.time >= total) {
      state.time = total;
      pause();
    }
    syncMedia();
    draw();
    updatePlayhead(true);
    requestAnimationFrame(loop);
  }

  let drawQueued = false;
  function requestDraw() {
    if (drawQueued || state.playing) return;
    drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false;
      syncMedia();
      draw();
    });
  }

  function syncVideo(el, target, rate, playing, volume) {
    el.volume = clamp(volume, 0, 1);
    el.muted = volume <= 0;
    if (playing) {
      if (Math.abs(el.playbackRate - rate) > 1e-3) el.playbackRate = clamp(rate, 0.0625, 16);
      if (el.paused) {
        el.currentTime = target;
        el.play().catch(() => {});
      } else if (Math.abs(el.currentTime - target) > 0.3) el.currentTime = target;
    } else {
      if (!el.paused) el.pause();
      if (!el.seeking && Math.abs(el.currentTime - target) > 0.03) el.currentTime = target;
    }
  }

  function syncMedia() {
    const t = state.time;
    const { items } = P.layout(proj());
    const active = new Set();
    items.forEach((it, i) => {
      const c = it.clip;
      const m = elements.get(c.id);
      if (!m || c.type === 'image') return;
      const isActive = (t >= it.start && t < it.end) || (i === items.length - 1 && t >= it.end && t - it.end < 0.05);
      const upcoming = !isActive && it.start > t && it.start - t < 1.2;
      if (isActive) {
        active.add(c.id);
        const vol = c.muted || !c.hasAudio ? 0 : c.volume;
        syncVideo(m.el, P.sourceTime(it, t), c.speed, state.playing && !c.reverse, vol);
      } else if (upcoming) {
        if (!m.el.paused) m.el.pause();
        const target = P.sourceTime(it, it.start);
        if (!m.el.seeking && Math.abs(m.el.currentTime - target) > 0.05) m.el.currentTime = target;
      } else if (!m.el.paused) m.el.pause();
    });
    for (const a of proj().audio) {
      const m = elements.get(a.id);
      if (!m) continue;
      const local = t - a.start;
      if (local >= 0 && local < a.len) {
        const span = Math.max(0.1, (a.sourceDuration || a.len) - a.in);
        const target = a.in + (a.loop ? local % span : local);
        syncVideo(m.el, target, 1, state.playing, P.audioGain(a, t));
      } else if (!m.el.paused) m.el.pause();
    }
  }

  function draw() {
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const { items, total } = P.layout(proj());
    $('#emptyHint').classList.toggle('hidden', items.length > 0);
    if (items.length) {
      const t = Math.min(state.time, total - 0.001);
      let idx = 0;
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].start <= t) {
          idx = i;
          break;
        }
      }
      const cur = items[idx];
      const bg = proj().background;
      const drawItem = (it) => R.drawClip(ctx, it.clip, elements.get(it.clip.id)?.el, W, H, bg);
      if (idx > 0 && cur.transIn > 0 && t < cur.start + cur.transIn) {
        const prev = items[idx - 1];
        const p = clamp((t - cur.start) / cur.transIn, 0, 1);
        R.drawTransition(ctx, prev.clip.transition.type, p, W, H, () => drawItem(prev), () => drawItem(cur));
      } else drawItem(cur);
    }
    const sel = selOf('text');
    for (const it of proj().texts) {
      const a = R.textAlpha(it, state.time);
      if (a > 0) R.drawText(ctx, it, W, H, a);
    }
    if (sel && state.time >= sel.start && state.time <= sel.end) {
      const L = R.textLayout(ctx, sel, W, H);
      ctx.save();
      ctx.translate(L.cx, L.cy);
      ctx.rotate(((sel.rotation || 0) * Math.PI) / 180);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#19d3a2';
      ctx.lineWidth = 2;
      ctx.strokeRect(-L.boxW / 2 - 4, -L.boxH / 2 - 4, L.boxW + 8, L.boxH + 8);
      ctx.restore();
    }
    updateTimeLabel();
  }

  function fitCanvas() {
    const wrap = $('#canvasWrap');
    const { width, height } = P.canvasSize(proj(), 1080);
    const maxW = wrap.clientWidth - 24;
    const maxH = wrap.clientHeight - 24;
    if (maxW <= 0 || maxH <= 0) return;
    const k = Math.min(maxW / width, maxH / height);
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${Math.floor(width * k)}px`;
    canvas.style.height = `${Math.floor(height * k)}px`;
    canvas.width = Math.round(width * k * dpr);
    canvas.height = Math.round(height * k * dpr);
    $('#ratioChip').textContent = `${proj().ratio === 'original' ? 'Original' : proj().ratio} • ${width}×${height}`;
    requestDraw();
  }
  new ResizeObserver(fitCanvas).observe($('#canvasWrap'));

  const fmtTime = (t) => {
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
  };

  function updateTimeLabel() {
    $('#timeLabel').textContent = `${fmtTime(state.time)} / ${fmtTime(P.totalDuration(proj()))}`;
  }

  // ---------------------------------------------------------------- Arrastar textos / enquadrar na prévia
  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height];
  }

  canvas.addEventListener('pointerdown', (e) => {
    const [px, py] = canvasPoint(e);
    const W = canvas.width;
    const H = canvas.height;
    const visible = proj().texts.filter((t) => state.time >= t.start && state.time <= t.end);
    const hit = visible.reverse().find((t) => R.hitText(ctx, t, W, H, px, py));
    if (hit) {
      if (!state.sel || state.sel.id !== hit.id) select('text', hit.id);
      const ox = hit.x;
      const oy = hit.y;
      dragHelper(e, (dx, dy) => {
        const r = canvas.getBoundingClientRect();
        hit.x = clamp(ox + dx / r.width, 0, 1);
        hit.y = clamp(oy + dy / r.height, 0, 1);
        changed({ panel: false, timeline: false });
      });
      return;
    }
    const it = itemAt(state.time);
    if (!it) return;
    if (state.tool === 'crop' && selOf('clip') === it.clip) {
      const c = it.clip;
      const pl = P.placement(c, W, H);
      const r = canvas.getBoundingClientRect();
      const sx = canvas.width / r.width;
      const ox = c.panX;
      const oy = c.panY;
      dragHelper(e, (dx, dy) => {
        if (pl.dw > pl.cw) c.panX = clamp(ox - (dx * sx) / ((pl.dw - pl.cw) / 2), -1, 1);
        if (pl.dh > pl.ch) c.panY = clamp(oy - (dy * sx) / ((pl.dh - pl.ch) / 2), -1, 1);
        changed({ panel: false, timeline: false });
      }, () => renderPanel());
      return;
    }
    select('clip', it.clip.id);
  });

  canvas.addEventListener('pointermove', (e) => {
    const [px, py] = canvasPoint(e);
    const over = proj().texts.some((t) => state.time >= t.start && state.time <= t.end && R.hitText(ctx, t, canvas.width, canvas.height, px, py));
    canvas.classList.toggle('can-drag', over || state.tool === 'crop');
  });

  function dragHelper(e, onMove, onUp) {
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const move = (ev) => onMove(ev.clientX - x0, ev.clientY - y0, ev);
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (onUp) onUp(ev.clientX - x0, ev.clientY - y0, ev);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ---------------------------------------------------------------- Linha do tempo
  const tlScroll = $('#tlScroll');

  function lanes(list, startOf, endOf) {
    const sorted = [...list].sort((a, b) => startOf(a) - startOf(b));
    const ends = [];
    const lane = new Map();
    for (const x of sorted) {
      let l = ends.findIndex((e) => e <= startOf(x) + 1e-6);
      if (l < 0) {
        l = ends.length;
        ends.push(0);
      }
      ends[l] = endOf(x);
      lane.set(x.id, l);
    }
    return { lane, count: Math.max(1, ends.length) };
  }

  function renderTimeline() {
    const pps = state.pps;
    const { items, total } = P.layout(proj());
    const width = Math.max(tlScroll.clientWidth, (total + 6) * pps);
    $('#tlInner').style.width = `${width}px`;

    const step = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => s * pps >= 64) || 600;
    let ruler = '';
    for (let t = 0; t * pps < width; t += step) {
      ruler += `<div class="tick" style="left:${t * pps}px">${fmtTime(t).replace(/\.0$/, '')}</div>`;
      for (let k = 1; k < 4; k++) ruler += `<div class="tick minor" style="left:${(t + (step * k) / 4) * pps}px"></div>`;
    }
    $('#ruler').innerHTML = ruler;

    const selId = state.sel?.id;
    let html = '';
    items.forEach((it, i) => {
      const c = it.clip;
      const badges = [
        c.type === 'image' ? '🖼' : '',
        c.speed !== 1 && c.type === 'video' ? `${+c.speed.toFixed(2)}x` : '',
        c.reverse ? '⏪' : '',
        c.muted || (c.type === 'video' && !c.hasAudio) ? '🔇' : '',
        c.filter !== 'none' ? '🎨' : '',
      ].filter(Boolean).join(' ');
      html += `<div class="clip ${c.id === selId ? 'sel' : ''}" data-id="${c.id}" style="left:${it.start * pps}px;width:${Math.max(4, it.duration * pps)}px;${c.thumb ? `background-image:url('${c.thumb}')` : ''}">
        <div class="handle l" data-h="l"></div><div class="badges">${badges}</div>
        <div class="name">${esc(c.name)} • ${it.duration.toFixed(1)}s</div><div class="handle r" data-h="r"></div></div>`;
      if (i < items.length - 1) {
        const x = (it.end - it.transOut / 2) * pps;
        const has = c.transition.type !== 'none';
        html += `<button class="trans ${has ? 'on' : ''}" data-trans="${c.id}" style="left:${x}px" title="Transição">${has ? '⇄' : '+'}</button>`;
      }
    });
    $('#videoTrack').innerHTML = html;

    const tl = lanes(proj().texts, (x) => x.start, (x) => x.end);
    const th = 36 / tl.count;
    $('#textTrack').innerHTML = proj().texts.map((t) => `<div class="tclip ${t.sticker ? 'sticker' : ''} ${t.id === selId ? 'sel' : ''}" data-id="${t.id}"
      style="left:${t.start * pps}px;width:${Math.max(6, (t.end - t.start) * pps)}px;top:${4 + tl.lane.get(t.id) * th}px;height:${th - 2}px;bottom:auto;padding-top:${Math.max(0, th / 2 - 9)}px">
      <div class="handle l" data-h="l"></div>${esc(t.text.split('\n')[0])}<div class="handle r" data-h="r"></div></div>`).join('');

    const al = lanes(proj().audio, (x) => x.start, (x) => x.start + x.len);
    const ah = 36 / al.count;
    $('#audioTrack').innerHTML = proj().audio.map((a) => `<div class="aclip ${a.kind === 'voice' ? 'voice' : ''} ${a.id === selId ? 'sel' : ''}" data-id="${a.id}"
      style="left:${a.start * pps}px;width:${Math.max(6, a.len * pps)}px;top:${4 + al.lane.get(a.id) * ah}px;height:${ah - 2}px;bottom:auto;padding-top:${Math.max(0, ah / 2 - 9)}px">
      <div class="handle l" data-h="l"></div>${a.kind === 'voice' ? '🎙' : '♪'} ${esc(a.name)}${a.loop ? ' 🔁' : ''}<div class="handle r" data-h="r"></div></div>`).join('');
    updatePlayhead();
  }

  function updatePlayhead(follow) {
    const x = state.time * state.pps;
    $('#playhead').style.left = `${x}px`;
    if (follow) {
      const { scrollLeft, clientWidth } = tlScroll;
      if (x > scrollLeft + clientWidth - 40 || x < scrollLeft) tlScroll.scrollLeft = x - 40;
    }
    updateTimeLabel();
  }

  function timeFromEvent(e) {
    const r = $('#tlInner').getBoundingClientRect();
    return Math.max(0, (e.clientX - r.left) / state.pps);
  }

  $('#tlInner').addEventListener('pointerdown', (e) => {
    const target = e.target;
    const trans = target.closest('.trans');
    if (trans) {
      select('clip', trans.dataset.trans, 'transition');
      return;
    }
    const block = target.closest('.clip, .tclip, .aclip');
    const handle = target.dataset.h;
    if (!block) {
      if (target.closest('.ph-knob, .ruler, .track') || target === $('#tlInner')) {
        if (!target.closest('.ph-knob')) seek(timeFromEvent(e));
        if (target.closest('.track')) select(null);
        dragHelper(e, (_dx, _dy, ev) => seek(timeFromEvent(ev)));
      }
      return;
    }
    const id = block.dataset.id;
    const pps = state.pps;
    if (block.classList.contains('clip')) dragClip(e, id, handle, pps);
    else if (block.classList.contains('tclip')) dragText(e, id, handle, pps);
    else dragAudio(e, id, handle, pps);
  });

  function dragClip(e, id, handle, pps) {
    const c = proj().clips.find((x) => x.id === id);
    select('clip', id);
    const it = P.layout(proj()).items.find((x) => x.clip.id === id);
    if (!handle && (state.time < it.start || state.time >= it.end)) seek(it.start + 0.001);
    if (handle) {
      const o = { in: c.in, out: c.out };
      const rate = c.type === 'image' ? 1 : c.speed;
      const maxOut = c.type === 'image' ? 3600 : c.sourceDuration;
      dragHelper(e, (dx) => {
        const d = (dx / pps) * rate;
        if (handle === 'l' && c.type === 'video') c.in = clamp(o.in + d, 0, c.out - 0.1);
        else if (handle === 'l') c.out = clamp(o.out - d, 0.1, maxOut);
        else c.out = clamp(o.out + d, c.in + 0.1, maxOut);
        const lay = P.layout(proj()).items.find((x) => x.clip.id === id);
        seek(handle === 'l' ? lay.start + 0.001 : lay.end - 0.001);
        changed({ panel: state.tool === 'trim' });
      });
      return;
    }
    // Arrastar para reordenar.
    let marker = null;
    let target = null;
    dragHelper(e, (dx, _dy, ev) => {
      if (Math.abs(dx) < 6 && !marker) return;
      const t = timeFromEvent(ev);
      const { items } = P.layout(proj());
      let idx = items.findIndex((x) => t < x.start + x.duration / 2);
      if (idx < 0) idx = items.length;
      target = idx;
      if (!marker) {
        marker = document.createElement('div');
        marker.className = 'drop-marker';
        $('#videoTrack').appendChild(marker);
      }
      const x = idx < items.length ? items[idx].start : items[items.length - 1].end;
      marker.style.left = `${x * pps - 1}px`;
    }, () => {
      if (marker) marker.remove();
      if (target == null) return;
      const from = proj().clips.indexOf(c);
      let to = target > from ? target - 1 : target;
      if (to === from) return;
      proj().clips.splice(from, 1);
      proj().clips.splice(clamp(to, 0, proj().clips.length), 0, c);
      changed();
    });
  }

  function dragText(e, id, handle, pps) {
    const t = proj().texts.find((x) => x.id === id);
    select('text', id);
    if (state.time < t.start || state.time > t.end) seek(t.start + 0.01);
    const o = { start: t.start, end: t.end };
    dragHelper(e, (dx) => {
      const d = dx / pps;
      if (handle === 'l') t.start = clamp(o.start + d, 0, t.end - 0.2);
      else if (handle === 'r') t.end = Math.max(t.start + 0.2, o.end + d);
      else {
        const len = o.end - o.start;
        t.start = Math.max(0, o.start + d);
        t.end = t.start + len;
      }
      changed({ panel: false });
    }, () => renderPanel());
  }

  function dragAudio(e, id, handle, pps) {
    const a = proj().audio.find((x) => x.id === id);
    select('audio', id);
    const o = { start: a.start, in: a.in, len: a.len };
    const span = a.sourceDuration || o.len;
    dragHelper(e, (dx) => {
      const d = dx / pps;
      if (handle === 'l') {
        const dd = clamp(d, Math.max(-o.in, -o.start), o.len - 0.2);
        a.in = o.in + dd;
        a.start = o.start + dd;
        a.len = o.len - dd;
      } else if (handle === 'r') {
        a.len = clamp(o.len + d, 0.2, a.loop ? 36000 : span - a.in);
      } else a.start = Math.max(0, o.start + d);
      changed({ panel: false });
    }, () => renderPanel());
  }

  $('#tlZoom').addEventListener('input', (e) => {
    state.pps = Number(e.target.value);
    renderTimeline();
  });
  tlScroll.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      state.pps = clamp(state.pps * (e.deltaY < 0 ? 1.15 : 0.87), 10, 300);
      $('#tlZoom').value = state.pps;
      renderTimeline();
    } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      tlScroll.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  // ---------------------------------------------------------------- Ferramentas
  const TOOLS = [
    { id: 'add', icon: '➕', label: 'Adicionar', run: () => addMedia() },
    { id: 'canvas', icon: '▭', label: 'Tela' },
    { id: 'background', icon: '🌫️', label: 'Fundo' },
    { id: 'text', icon: '🔤', label: 'Texto' },
    { id: 'sticker', icon: '😀', label: 'Figurinhas' },
    { id: 'music', icon: '🎵', label: 'Música' },
    { sep: true },
    { id: 'trim', icon: '✂️', label: 'Cortar', clip: true },
    { id: 'split', icon: '🔪', label: 'Dividir', clip: true, run: () => splitAtPlayhead() },
    { id: 'speed', icon: '⏩', label: 'Velocidade', clip: true },
    { id: 'volume', icon: '🔊', label: 'Volume', clip: true },
    { id: 'filter', icon: '🎨', label: 'Filtros', clip: true },
    { id: 'adjust', icon: '🎚️', label: 'Ajustes', clip: true },
    { id: 'crop', icon: '🔍', label: 'Zoom', clip: true },
    { id: 'rotate', icon: '🔄', label: 'Girar', clip: true },
    { id: 'transition', icon: '⇄', label: 'Transição', clip: true },
    { id: 'reverse', icon: '⏪', label: 'Reverso', clip: true, run: () => toggleReverse() },
    { id: 'freeze', icon: '❄️', label: 'Congelar', clip: true, run: () => freezeFrame() },
    { id: 'duplicate', icon: '⧉', label: 'Duplicar', clip: true, run: () => duplicateSelected() },
    { id: 'delete', icon: '🗑️', label: 'Excluir', run: () => deleteSelected() },
    { id: 'clip', hidden: true, clip: true },
  ];

  function renderToolbar() {
    $('#toolbar').innerHTML = TOOLS.filter((t) => !t.hidden).map((t) => (t.sep
      ? '<div class="sep"></div>'
      : `<button data-tool="${t.id}" class="${state.tool === t.id ? 'on' : ''}" title="${t.label}"><span class="ic">${t.icon}</span>${t.label}</button>`)).join('');
  }

  $('#toolbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (!b) return;
    const tool = TOOLS.find((t) => t.id === b.dataset.tool);
    if (tool.clip && !ensureClipSelected()) return;
    if (tool.run) return tool.run();
    state.tool = tool.id;
    if (tool.id === 'text' && selOf('text')?.sticker) state.sel = null;
    if (tool.id === 'sticker' && selOf('text') && !selOf('text').sticker) state.sel = null;
    refresh();
  });

  // ---------------------------------------------------------------- Painel lateral
  const FORMATS = {
    x: (v) => `${(+v).toFixed(2)}x`,
    pct: (v) => `${Math.round(v * 100)}%`,
    s: (v) => `${(+v).toFixed(1)}s`,
    pm: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`,
    deg: (v) => `${Math.round(v)}°`,
    n: (v) => `${(+v).toFixed(2)}`,
  };

  function bindTarget(kind) {
    if (kind === 'project') return proj();
    if (kind === 'bg') return proj().background;
    return selOf(kind);
  }
  const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
  function setPath(o, p, v) {
    const ks = p.split('.');
    const last = ks.pop();
    ks.reduce((x, k) => x[k], o)[last] = v;
  }

  function slider(bind, label, min, max, step, fmt) {
    const [kind, p] = bind.split(':');
    const v = getPath(bindTarget(kind), p);
    return `<label class="row"><span>${label}</span><input type="range" data-bind="${bind}" min="${min}" max="${max}" step="${step}" value="${v}" data-fmt="${fmt}"><span class="val">${FORMATS[fmt](v)}</span></label>`;
  }
  function check(bind, label) {
    const [kind, p] = bind.split(':');
    return `<label class="line"><input type="checkbox" data-bind="${bind}" ${getPath(bindTarget(kind), p) ? 'checked' : ''}> ${label}</label>`;
  }
  const btn = (cmd, label, arg = '', cls = '') => `<button data-cmd="${cmd}" data-arg="${esc(arg)}" class="${cls}">${label}</button>`;

  const COLORS = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#19d3a2', '#007aff', '#5856d6', '#af52de', '#ff2d55', '#a2845e', '#8e8e93', '#ffd6e7', '#c7f9ff', '#1c1c1e'];
  function swatches(bind) {
    const [kind, p] = bind.split(':');
    const cur = (getPath(bindTarget(kind), p) || '').toLowerCase();
    return `<div class="grid c8" style="grid-template-columns:repeat(8,1fr)">${COLORS.map((c) => `<button class="swatch ${c === cur ? 'on' : ''}" style="background:${c}" data-cmd="setColor" data-arg="${bind}|${c}"></button>`).join('')}</div>
      <label class="line">Outra cor <input type="color" data-bind="${bind}" value="${cur || '#ffffff'}"></label>`;
  }

  const FONTS = ['Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Segoe UI', 'Roboto', 'Georgia', 'Times New Roman', 'Garamond', 'Courier New', 'Lucida Console', 'Impact', 'Comic Sans MS', 'Brush Script MT', 'Papyrus'];
  const TEXT_STYLES = {
    Clássico: { color: '#ffffff', strokeColor: '#000000', strokeWidth: 0.15, bgOpacity: 0, shadow: true, font: 'Arial', bold: true },
    Legenda: { color: '#ffffff', strokeWidth: 0, bgColor: '#000000', bgOpacity: 0.6, shadow: false, font: 'Arial', bold: false, size: 0.045 },
    Destaque: { color: '#ffe600', strokeColor: '#000000', strokeWidth: 0.2, bgOpacity: 0, shadow: true, font: 'Impact', bold: false },
    Neon: { color: '#39ff14', strokeColor: '#0a3d00', strokeWidth: 0.06, bgOpacity: 0, shadow: true, font: 'Trebuchet MS', bold: true },
    Etiqueta: { color: '#111111', strokeWidth: 0, bgColor: '#ffffff', bgOpacity: 1, shadow: false, font: 'Verdana', bold: true },
    Rosa: { color: '#ffffff', strokeWidth: 0, bgColor: '#ff2d55', bgOpacity: 1, shadow: false, font: 'Arial', bold: true },
    Elegante: { color: '#ffffff', strokeWidth: 0, bgOpacity: 0, shadow: true, font: 'Georgia', bold: false, italic: true },
    Máquina: { color: '#ffffff', strokeWidth: 0, bgColor: '#000000', bgOpacity: 0.8, shadow: false, font: 'Courier New', bold: true },
  };

  const STICKERS = {
    Rostos: '😀 😂 🤣 😍 🥰 😘 😎 🤩 😜 🤔 😴 😭 😡 🥳 🤯 😱 🙄 😇 🤡 👻',
    Gestos: '👍 👎 👏 🙌 🙏 💪 ✌️ 🤞 👌 👉 👈 ☝️ 👀 💯 🔥 ✨ 🫶 🤙 👋 🤝',
    Amor: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💖 💘 💕 💞 💋 🌹 💐 🎁 💍 😻 💌 🥂',
    Festa: '🎉 🎊 🎂 🎈 🍾 🎶 🎵 🎤 🎧 🏆 🥇 ⭐ 🌟 💫 ⚡ 🎮 📸 🎬 🍿 🪩',
    Natureza: '☀️ 🌙 🌈 ☁️ ❄️ 🌊 🌴 🌸 🌻 🍀 🐶 🐱 🦋 🐠 🌎 🍕 🍔 🍦 ☕ 🍓',
    Sinais: '➡️ ⬅️ ⬆️ ⬇️ ↗️ ✅ ❌ ❗ ❓ ⚠️ 🔴 🟢 🔵 💬 💭 📍 🔔 💲 🆕 🔞',
  };

  function panelHtml() {
    const tool = state.tool;
    const c = selOf('clip');
    const noClip = '<p class="notice">Selecione um clipe na linha do tempo.</p>';
    switch (tool) {
      case 'canvas': {
        const tiles = Object.keys(P.RATIOS).map((r) => {
          const [w, h] = P.RATIOS[r] || [1, 1];
          const s = 26 / Math.max(w, h);
          const box = P.RATIOS[r] ? `<div class="ratio-box" style="width:${w * s}px;height:${h * s}px"></div>` : '<div style="font-size:20px">⤢</div>';
          return `<button class="tile ${proj().ratio === r ? 'on' : ''}" data-cmd="ratio" data-arg="${r}">${box}${r === 'original' ? 'Original' : r}</button>`;
        }).join('');
        return `<h3>Tela</h3><p class="sub">Proporção do vídeo: Reels/TikTok/Shorts (9:16), YouTube (16:9), Instagram (1:1, 4:5)…</p>
          <div class="grid c3">${tiles}</div>
          <section style="margin-top:16px"><p class="sub">Encaixe de todos os clipes</p><div class="line">${btn('fitAll', 'Ajustar (com bordas)', 'fit')}${btn('fitAll', 'Preencher a tela', 'fill')}</div></section>`;
      }
      case 'background': {
        const bg = proj().background;
        return `<h3>Fundo</h3><p class="sub">Aparece nas bordas quando o vídeo não preenche a tela.</p>
          <div class="line">${btn('bgType', 'Desfoque', 'blur', bg.type === 'blur' ? 'on' : '')}${btn('bgType', 'Cor sólida', 'color', bg.type === 'color' ? 'on' : '')}</div>
          ${bg.type === 'blur' ? slider('bg:blur', 'Desfoque', 0, 1, 0.05, 'pct') : swatches('bg:color')}`;
      }
      case 'text': {
        const t = selOf('text');
        let html = `<h3>Texto</h3><div class="line">${btn('addText', '+ Adicionar texto', '', 'primary')}</div>`;
        if (!t || t.sticker) {
          const list = proj().texts.filter((x) => !x.sticker);
          return `${html}<p class="sub">${list.length ? 'Clique em um texto na prévia ou na linha do tempo para editar.' : 'Adicione títulos, legendas e chamadas. Arraste o texto na prévia para posicionar.'}</p>`;
        }
        html += `<section><textarea data-bind="text:text" placeholder="Digite seu texto">${esc(t.text)}</textarea></section>
          <section><p class="sub">Estilos prontos</p><div class="grid c4">${Object.keys(TEXT_STYLES).map((s) => btn('textStyle', s, s)).join('')}</div></section>
          <section><label class="line">Fonte <select data-bind="text:font" style="flex:1">${FONTS.map((f) => `<option ${f === t.font ? 'selected' : ''} style="font-family:'${f}'">${f}</option>`).join('')}</select></label>
          <div class="line">${btn('toggleText', '<b>N</b>', 'bold', t.bold ? 'on' : '')}${btn('toggleText', '<i>I</i>', 'italic', t.italic ? 'on' : '')}
            ${btn('textAlign', '⯇', 'left', t.align === 'left' ? 'on' : '')}${btn('textAlign', '≡', 'center', t.align === 'center' ? 'on' : '')}${btn('textAlign', '⯈', 'right', t.align === 'right' ? 'on' : '')}</div>
          ${slider('text:size', 'Tamanho', 0.015, 0.2, 0.001, 'pct')}${slider('text:rotation', 'Rotação', -180, 180, 1, 'deg')}${slider('text:opacity', 'Opacidade', 0.1, 1, 0.01, 'pct')}</section>
          <section><p class="sub">Cor do texto</p>${swatches('text:color')}</section>
          <section><p class="sub">Contorno</p>${slider('text:strokeWidth', 'Espessura', 0, 0.4, 0.01, 'pct')}<label class="line">Cor do contorno <input type="color" data-bind="text:strokeColor" value="${t.strokeColor}"></label>${check('text:shadow', 'Sombra')}</section>
          <section><p class="sub">Caixa de fundo</p>${slider('text:bgOpacity', 'Opacidade', 0, 1, 0.01, 'pct')}<label class="line">Cor da caixa <input type="color" data-bind="text:bgColor" value="${t.bgColor}"></label></section>
          ${timingHtml('text')}`;
        return html;
      }
      case 'sticker': {
        const s = selOf('text');
        let html = '<h3>Figurinhas</h3>';
        if (s && s.sticker) {
          html += `<section>${slider('text:size', 'Tamanho', 0.03, 0.5, 0.005, 'pct')}${slider('text:rotation', 'Rotação', -180, 180, 1, 'deg')}${slider('text:opacity', 'Opacidade', 0.1, 1, 0.01, 'pct')}</section>${timingHtml('text')}<hr style="border-color:var(--line)">`;
        } else html += '<p class="sub">Clique para adicionar no tempo atual. Arraste na prévia para mover.</p>';
        for (const [cat, list] of Object.entries(STICKERS)) {
          html += `<section><p class="sub">${cat}</p><div class="grid c6">${list.split(' ').map((em) => `<button class="emoji" data-cmd="addSticker" data-arg="${em}">${em}</button>`).join('')}</div></section>`;
        }
        return html;
      }
      case 'music': {
        const a = selOf('audio');
        let html = `<h3>Música e áudio</h3>
          <div class="grid c2">${btn('addAudio', '🎵 Adicionar música', 'audio', 'primary')}${btn('addAudio', '🎞 Extrair de vídeo', 'video')}</div>
          <div class="line">${state.rec ? `<div class="rec"><span class="rec-dot"></span> Gravando… <span id="recTime">0.0s</span></div>${btn('stopRec', '■ Parar', '', 'danger')}` : btn('startRec', '🎙 Gravar narração')}</div>`;
        html += proj().audio.length ? '<section><p class="sub">Faixas</p>' + proj().audio.map((x) => `<div class="list-item ${a && a.id === x.id ? 'on' : ''}" data-cmd="selAudio" data-arg="${x.id}"><span>${x.kind === 'voice' ? '🎙' : '♪'}</span><span class="grow">${esc(x.name)}</span><span class="muted">${x.len.toFixed(1)}s</span></div>`).join('') + '</section>' : '<p class="sub">Músicas, efeitos sonoros e narrações tocam junto com o áudio dos clipes.</p>';
        if (a) {
          html += `<section><h3>${esc(a.name)}</h3>${slider('audio:volume', 'Volume', 0, 2, 0.01, 'pct')}${slider('audio:fadeIn', 'Fade in', 0, 10, 0.1, 's')}${slider('audio:fadeOut', 'Fade out', 0, 10, 0.1, 's')}
            ${check('audio:loop', 'Repetir (loop)')}
            <label class="line">Início no vídeo <input type="number" step="0.1" min="0" data-bind="audio:start" value="${a.start.toFixed(2)}"> s</label>
            <div class="line">${btn('audioToCursor', 'Mover para o cursor')}${btn('audioFit', 'Ajustar ao fim do vídeo')}</div>
            <div class="line">${btn('splitAudio', 'Dividir no cursor')}${btn('deleteSel', 'Excluir', '', 'danger')}</div></section>`;
        }
        return html;
      }
      case 'clip': {
        if (!c) return noClip;
        const it = P.layout(proj()).items.find((x) => x.clip.id === c.id);
        return `<h3>${esc(c.name)}</h3><p class="sub">${c.type === 'image' ? 'Foto' : 'Vídeo'} • ${it.duration.toFixed(2)}s na linha do tempo • ${c.width}×${c.height}</p>
          <div class="grid c3">${TOOLS.filter((t) => t.clip && !t.hidden).map((t) => `<button class="tile" data-tool-go="${t.id}"><span style="font-size:20px">${t.icon}</span>${t.label}</button>`).join('')}</div>`;
      }
      case 'trim': {
        if (!c) return noClip;
        if (c.type === 'image') return `<h3>Duração da foto</h3>${slider('clip:out', 'Duração', 0.5, 30, 0.1, 's')}<div class="line">${btn('applyAll', 'Aplicar a todas as fotos', 'out')}</div>`;
        return `<h3>Cortar</h3><p class="sub">Arquivo de ${c.sourceDuration.toFixed(2)}s. Também dá para puxar as bordas do clipe na linha do tempo.</p>
          <label class="row"><span>Início</span><input type="range" data-bind="clip:in" min="0" max="${c.sourceDuration}" step="0.01" value="${c.in}" data-fmt="s" data-trim="in"><span class="val">${FORMATS.s(c.in)}</span></label>
          <label class="row"><span>Fim</span><input type="range" data-bind="clip:out" min="0" max="${c.sourceDuration}" step="0.01" value="${c.out}" data-fmt="s" data-trim="out"><span class="val">${FORMATS.s(c.out)}</span></label>
          <div class="line">${btn('trimCursor', 'Cortar antes do cursor', 'start')}${btn('trimCursor', 'Cortar depois do cursor', 'end')}</div>
          <div class="line">${btn('splitHere', '🔪 Dividir no cursor')}${btn('trimReset', 'Restaurar')}</div>`;
      }
      case 'speed': {
        if (!c) return noClip;
        if (c.type === 'image') return '<h3>Velocidade</h3><p class="notice">Fotos não têm velocidade. Use Cortar para mudar a duração.</p>';
        return `<h3>Velocidade</h3>${slider('clip:speed', 'Velocidade', 0.1, 10, 0.05, 'x')}
          <div class="grid c4">${[0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8].map((s) => btn('speed', `${s}x`, s, Math.abs(c.speed - s) < 1e-3 ? 'on' : '')).join('')}</div>
          <p class="sub" style="margin-top:12px">O áudio acompanha a velocidade mantendo o tom.</p><div class="line">${btn('applyAll', 'Aplicar a todos', 'speed')}</div>`;
      }
      case 'volume': {
        if (!c) return noClip;
        if (c.type === 'image' || !c.hasAudio) return '<h3>Volume</h3><p class="notice">Este clipe não tem som.</p>';
        return `<h3>Volume</h3>${slider('clip:volume', 'Volume', 0, 2, 0.01, 'pct')}${check('clip:muted', 'Sem som (mudo)')}
          <p class="sub">Acima de 100% o volume é aumentado na exportação.</p><div class="line">${btn('applyAll', 'Aplicar a todos', 'volume,muted')}</div>`;
      }
      case 'filter': {
        if (!c) return noClip;
        const tiles = P.FILTERS.map((f) => {
          const fake = { ...c, filter: f.id, filterStrength: 1, adjust: { ...P.DEFAULT_ADJUST } };
          const css = P.cssFilter(P.colorParams(fake));
          return `<button class="tile ${c.filter === f.id ? 'on' : ''}" data-cmd="filter" data-arg="${f.id}"><div class="thumb" style="background-image:url('${c.thumb || ''}');filter:${css}"></div>${f.name}</button>`;
        }).join('');
        return `<h3>Filtros</h3><div class="grid c3">${tiles}</div>
          <section style="margin-top:12px">${c.filter !== 'none' ? slider('clip:filterStrength', 'Intensidade', 0, 1, 0.01, 'pct') : ''}
          <div class="line">${btn('applyAll', 'Aplicar a todos os clipes', 'filter,filterStrength')}</div></section>`;
      }
      case 'adjust': {
        if (!c) return noClip;
        return `<h3>Ajustes</h3>
          ${slider('clip:adjust.brightness', 'Brilho', -1, 1, 0.01, 'pm')}${slider('clip:adjust.contrast', 'Contraste', -1, 1, 0.01, 'pm')}
          ${slider('clip:adjust.saturation', 'Saturação', -1, 1, 0.01, 'pm')}${slider('clip:adjust.hue', 'Matiz', -1, 1, 0.01, 'pm')}
          ${slider('clip:adjust.warmth', 'Temperatura', -1, 1, 0.01, 'pm')}${slider('clip:adjust.vignette', 'Vinheta', 0, 1, 0.01, 'pct')}
          <div class="line">${btn('adjustReset', 'Redefinir')}${btn('applyAll', 'Aplicar a todos', 'adjust')}</div>`;
      }
      case 'crop': {
        if (!c) return noClip;
        return `<h3>Zoom e enquadramento</h3>
          <div class="line">${btn('fit', 'Ajustar', 'fit', c.fit === 'fit' ? 'on' : '')}${btn('fit', 'Preencher', 'fill', c.fit === 'fill' ? 'on' : '')}</div>
          ${slider('clip:zoom', 'Zoom', 1, 4, 0.01, 'x')}${slider('clip:panX', 'Horizontal', -1, 1, 0.01, 'pm')}${slider('clip:panY', 'Vertical', -1, 1, 0.01, 'pm')}
          <p class="sub">Dica: com esta ferramenta aberta, arraste a imagem na prévia para reposicionar.</p>
          <div class="line">${btn('cropReset', 'Redefinir')}</div>`;
      }
      case 'rotate': {
        if (!c) return noClip;
        return `<h3>Girar e espelhar</h3><div class="grid c2">${btn('rotate', '↻ Girar 90°', 90)}${btn('rotate', '↺ Girar -90°', -90)}
          ${btn('flip', '⇋ Espelhar horizontal', 'flipH', c.flipH ? 'on' : '')}${btn('flip', '⇵ Espelhar vertical', 'flipV', c.flipV ? 'on' : '')}</div>
          <p class="sub" style="margin-top:12px">Rotação atual: ${c.rotate}°</p>`;
      }
      case 'transition': {
        if (!c) return noClip;
        const i = proj().clips.indexOf(c);
        if (i === proj().clips.length - 1) return '<h3>Transição</h3><p class="notice">A transição fica entre este clipe e o próximo. Selecione um clipe que não seja o último.</p>';
        return `<h3>Transição</h3><p class="sub">Entre “${esc(c.name)}” e o próximo clipe.</p>
          <div class="grid c3">${P.TRANSITIONS.map((t) => btn('transition', t.name, t.id, c.transition.type === t.id ? 'on' : '')).join('')}</div>
          <section style="margin-top:12px">${slider('clip:transition.duration', 'Duração', 0.2, 2.5, 0.05, 's')}<div class="line">${btn('applyAll', 'Aplicar a todas', 'transition')}</div></section>`;
      }
      default:
        return '';
    }
  }

  function timingHtml(kind) {
    const t = selOf(kind);
    return `<section><p class="sub">Tempo na tela</p>
      <label class="line">De <input type="number" step="0.1" min="0" data-bind="${kind}:start" value="${t.start.toFixed(2)}"> até <input type="number" step="0.1" min="0" data-bind="${kind}:end" value="${t.end.toFixed(2)}"> s</label>
      ${check(`${kind}:fade`, 'Animação de entrada e saída (esmaecer)')}
      <div class="line">${btn('textToCursor', 'Começar no cursor')}${btn('textFull', 'Vídeo inteiro')}</div>
      <div class="line">${btn('duplicateSel', 'Duplicar')}${btn('deleteSel', 'Excluir', '', 'danger')}</div></section>`;
  }

  function renderPanel() {
    $('#panel').innerHTML = panelHtml();
  }

  $('#panel').addEventListener('input', (e) => {
    const el = e.target;
    const bind = el.dataset.bind;
    if (!bind) return;
    const [kind, p] = bind.split(':');
    const obj = bindTarget(kind);
    if (!obj) return;
    let v = el.type === 'checkbox' ? el.checked : el.type === 'range' || el.type === 'number' ? Number(el.value) : el.value;
    if (typeof v === 'number' && Number.isNaN(v)) return;
    if (el.dataset.trim === 'in') v = Math.min(v, obj.out - 0.1);
    if (el.dataset.trim === 'out') v = Math.max(v, obj.in + 0.1);
    if (kind === 'text' && p === 'end') v = Math.max(v, obj.start + 0.1);
    setPath(obj, p, v);
    if (el.dataset.trim) {
      el.value = v;
      const it = P.layout(proj()).items.find((x) => x.clip === obj);
      seek(el.dataset.trim === 'in' ? it.start + 0.001 : it.end - 0.001);
    }
    if (kind === 'audio' && p === 'loop' && !v) obj.len = Math.min(obj.len, (obj.sourceDuration || obj.len) - obj.in);
    const val = el.parentElement.querySelector('.val');
    if (val && el.dataset.fmt) val.textContent = FORMATS[el.dataset.fmt](v);
    changed({ panel: el.type === 'checkbox' });
  });

  $('#panel').addEventListener('click', (e) => {
    const go = e.target.closest('[data-tool-go]');
    if (go) {
      const tool = TOOLS.find((t) => t.id === go.dataset.toolGo);
      if (tool.run) tool.run();
      else {
        state.tool = tool.id;
        refresh();
      }
      return;
    }
    const b = e.target.closest('[data-cmd]');
    if (!b) return;
    const fn = COMMANDS[b.dataset.cmd];
    if (fn) fn(b.dataset.arg);
  });

  const COMMANDS = {
    ratio(r) {
      proj().ratio = r;
      fitCanvas();
      changed();
    },
    fitAll(mode) {
      proj().clips.forEach((c) => {
        c.fit = mode;
      });
      changed();
    },
    bgType(t) {
      proj().background.type = t;
      changed();
    },
    setColor(arg) {
      const [bind, color] = arg.split('|');
      const [kind, p] = bind.split(':');
      setPath(bindTarget(kind), p, color);
      changed();
    },
    addText() {
      const total = P.totalDuration(proj());
      const start = state.time >= total - 0.2 ? 0 : state.time;
      const t = P.newText({ start, end: Math.min(start + 3, Math.max(total, start + 3)) });
      proj().texts.push(t);
      select('text', t.id, 'text');
      changed();
    },
    textStyle(name) {
      Object.assign(selOf('text'), TEXT_STYLES[name]);
      changed();
    },
    toggleText(k) {
      const t = selOf('text');
      t[k] = !t[k];
      changed();
    },
    textAlign(a) {
      selOf('text').align = a;
      changed();
    },
    addSticker(em) {
      const s = P.newText({ text: em, sticker: true, size: 0.12, strokeWidth: 0, shadow: false, bold: false, start: state.time, end: state.time + 3, x: 0.5, y: 0.4 });
      proj().texts.push(s);
      select('text', s.id, 'sticker');
      changed();
    },
    textToCursor() {
      const t = selOf('text');
      const len = t.end - t.start;
      t.start = state.time;
      t.end = state.time + len;
      changed();
    },
    textFull() {
      const t = selOf('text');
      t.start = 0;
      t.end = Math.max(0.5, P.totalDuration(proj()));
      changed();
    },
    duplicateSel: () => duplicateSelected(),
    deleteSel: () => deleteSelected(),
    addAudio: (kind) => addAudio(kind),
    selAudio(id) {
      select('audio', id);
    },
    audioToCursor() {
      selOf('audio').start = state.time;
      changed();
    },
    audioFit() {
      const a = selOf('audio');
      const rest = P.totalDuration(proj()) - a.start;
      if (rest <= 0.2) return toast('O áudio começa depois do fim do vídeo');
      if (rest > (a.sourceDuration || 0) - a.in) a.loop = true;
      a.len = rest;
      changed();
    },
    splitAudio() {
      const a = selOf('audio');
      const local = state.time - a.start;
      if (local <= 0.1 || local >= a.len - 0.1) return toast('Posicione o cursor dentro da faixa');
      const b = { ...a, id: P.uid('a'), start: state.time, in: a.in + local, len: a.len - local };
      a.len = local;
      proj().audio.splice(proj().audio.indexOf(a) + 1, 0, b);
      changed();
    },
    startRec: () => startRecording(),
    stopRec: () => stopRecording(),
    speed(s) {
      selOf('clip').speed = Number(s);
      changed();
    },
    applyAll(keys) {
      const c = selOf('clip');
      const ks = keys.split(',');
      proj().clips.forEach((o) => {
        if (o === c) return;
        if (ks.includes('out') && o.type !== 'image') return;
        if (ks.includes('speed') && o.type === 'image') return;
        for (const k of ks) o[k] = typeof c[k] === 'object' ? JSON.parse(JSON.stringify(c[k])) : c[k];
      });
      if (ks.includes('transition')) proj().clips[proj().clips.length - 1].transition.type = 'none';
      toast('Aplicado a todos os clipes');
      changed();
    },
    filter(id) {
      selOf('clip').filter = id;
      changed();
    },
    adjustReset() {
      selOf('clip').adjust = { ...P.DEFAULT_ADJUST };
      changed();
    },
    fit(mode) {
      selOf('clip').fit = mode;
      changed();
    },
    cropReset() {
      Object.assign(selOf('clip'), { zoom: 1, panX: 0, panY: 0, fit: 'fit' });
      changed();
    },
    rotate(deg) {
      const c = selOf('clip');
      c.rotate = (((c.rotate + Number(deg)) % 360) + 360) % 360;
      changed();
    },
    flip(k) {
      const c = selOf('clip');
      c[k] = !c[k];
      changed();
    },
    transition(type) {
      const c = selOf('clip');
      c.transition.type = type;
      changed();
      const it = P.layout(proj()).items.find((x) => x.clip === c);
      if (type !== 'none') {
        seek(Math.max(0, it.end - it.transOut - 0.6));
        play();
        setTimeout(() => {
          if (state.playing && state.time > it.end + 0.6) pause();
        }, (it.transOut + 1.4) * 1000);
      }
    },
    trimCursor(which) {
      const c = selOf('clip');
      const it = P.layout(proj()).items.find((x) => x.clip === c);
      if (state.time <= it.start + 0.05 || state.time >= it.end - 0.05) return toast('Posicione o cursor dentro do clipe');
      const s = P.sourceTime(it, state.time);
      if ((which === 'start') !== c.reverse) c.in = s;
      else c.out = s;
      changed();
      if (which === 'start') seek(it.start);
    },
    trimReset() {
      const c = selOf('clip');
      c.in = 0;
      c.out = c.sourceDuration;
      changed();
    },
    splitHere: () => splitAtPlayhead(),
  };

  // ---------------------------------------------------------------- Ações de clipe
  function splitAtPlayhead() {
    const it = itemAt(state.time);
    if (!it) return toast('Adicione um clipe primeiro');
    const c = it.clip;
    const local = state.time - it.start;
    if (local < 0.1 || local > it.duration - 0.1) return toast('Mova o cursor para dentro do clipe para dividir');
    const b = JSON.parse(JSON.stringify(c));
    b.id = P.uid('c');
    if (c.type === 'image') {
      c.out = local;
      b.out = it.duration - local;
    } else {
      const s = P.sourceTime(it, state.time);
      if (c.reverse) {
        c.in = s;
        b.out = s;
      } else {
        c.out = s;
        b.in = s;
      }
    }
    c.transition = { type: 'none', duration: c.transition.duration };
    proj().clips.splice(proj().clips.indexOf(c) + 1, 0, b);
    select('clip', b.id);
    changed();
    toast('Clipe dividido');
  }

  function toggleReverse() {
    const c = ensureClipSelected();
    if (!c) return;
    if (c.type === 'image') return toast('Fotos não podem ser invertidas');
    c.reverse = !c.reverse;
    changed();
    toast(c.reverse ? 'Reverso ativado (a prévia é aproximada; a exportação fica perfeita)' : 'Reverso desativado');
  }

  async function freezeFrame() {
    const c = ensureClipSelected();
    if (!c) return;
    let it = P.layout(proj()).items.find((x) => x.clip === c);
    if (state.time < it.start || state.time > it.end) seek(it.start);
    const el = elements.get(c.id)?.el;
    if (el && el.tagName === 'VIDEO') {
      syncMedia();
      // Espera o quadro do cursor ficar disponível (o vídeo pode estar no meio de uma busca).
      for (let i = 0; i < 60 && (el.seeking || el.readyState < 2); i++) await new Promise((r) => setTimeout(r, 50));
    }
    const size = R.mediaSize(el);
    if (!size) return toast('Aguarde o clipe carregar');
    const cv = document.createElement('canvas');
    [cv.width, cv.height] = size;
    cv.getContext('2d').drawImage(el, 0, 0, cv.width, cv.height);
    const file = await api.writeTemp('congelado.png', cv.toDataURL('image/png'));
    const frame = {
      ...JSON.parse(JSON.stringify(c)),
      id: P.uid('c'), type: 'image', path: file.path, url: file.url, proxyUrl: null, thumb: c.thumb,
      name: 'Quadro congelado', width: size[0], height: size[1], hasAudio: false, in: 0, out: 2, speed: 1, reverse: false, sourceDuration: null,
      transition: { type: 'none', duration: 0.5 },
    };
    it = P.layout(proj()).items.find((x) => x.clip === c);
    const local = state.time - it.start;
    if (local > 0.1 && local < it.duration - 0.1) splitAtPlayhead();
    const idx = proj().clips.indexOf(c) + (local <= 0.1 ? 0 : 1);
    proj().clips.splice(idx, 0, frame);
    select('clip', frame.id);
    syncElements();
    changed();
    toast('Quadro congelado por 2s (ajuste em Cortar)');
  }

  function duplicateSelected() {
    const s = findSel();
    if (!s) return toast('Selecione algo para duplicar');
    const copy = JSON.parse(JSON.stringify(s));
    const list = state.sel.kind === 'clip' ? proj().clips : state.sel.kind === 'text' ? proj().texts : proj().audio;
    copy.id = P.uid(state.sel.kind[0]);
    if (state.sel.kind === 'text') {
      copy.y = clamp(copy.y + 0.05, 0, 1);
    }
    list.splice(list.indexOf(s) + 1, 0, copy);
    select(state.sel.kind, copy.id);
    syncElements();
    changed();
  }

  function deleteSelected() {
    const s = findSel();
    if (!s) return toast('Selecione um clipe, texto ou áudio');
    const list = state.sel.kind === 'clip' ? proj().clips : state.sel.kind === 'text' ? proj().texts : proj().audio;
    list.splice(list.indexOf(s), 1);
    state.sel = null;
    if (!TOOLS.find((t) => t.id === state.tool && !t.clip)) state.tool = 'canvas';
    syncElements();
    seek(state.time);
    changed();
  }

  // ---------------------------------------------------------------- Importação
  function addImported({ results, errors }) {
    if (errors.length) toast(`Não foi possível importar:\n${errors.join('\n')}`, 7000);
    if (!results.length) return;
    let insertAt = proj().clips.length;
    const sc = selOf('clip');
    if (sc) insertAt = proj().clips.indexOf(sc) + 1;
    let last = null;
    for (const m of results) {
      if (m.type === 'audio') {
        const a = P.newAudio(m, state.time);
        proj().audio.push(a);
        last = ['audio', a.id];
      } else {
        const c = P.newClip(m);
        proj().clips.splice(insertAt++, 0, c);
        last = ['clip', c.id];
      }
    }
    syncElements();
    fitCanvas();
    if (last) select(last[0], last[1]);
    changed();
  }

  async function addMedia() {
    addImported(await api.pickMedia('visual'));
  }

  async function addAudio(kind) {
    const r = await api.pickMedia(kind === 'video' ? 'video' : 'audio');
    r.results = r.results.filter((m) => {
      if (!m.hasAudio) r.errors.push(`${m.name}: não tem áudio`);
      return m.hasAudio;
    });
    if (r.errors.length) toast(r.errors.join('\n'), 6000);
    let last = null;
    for (const m of r.results) {
      const a = P.newAudio({ ...m, kind: kind === 'video' ? 'extract' : 'music' }, state.time >= P.totalDuration(proj()) - 0.1 ? 0 : state.time);
      proj().audio.push(a);
      last = a;
    }
    if (!last) return;
    syncElements();
    select('audio', last.id, 'music');
    changed();
  }

  // ---------------------------------------------------------------- Narração
  async function startRecording() {
    try {
      await api.askMic();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const rec = new MediaRecorder(stream);
      const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      state.rec = { rec, chunks, stream, start: state.time, t0: performance.now() };
      rec.start(250);
      state.rec.timer = setInterval(() => {
        const el = $('#recTime');
        if (el) el.textContent = `${((performance.now() - state.rec.t0) / 1000).toFixed(1)}s`;
      }, 100);
      renderPanel();
      if (P.totalDuration(proj()) > state.time + 0.1) {
        for (const { el } of elements.values()) el.muted = true;
        play();
      }
    } catch (e) {
      state.rec = null;
      toast(`Microfone indisponível: ${e.message}`, 6000);
    }
  }

  function stopRecording() {
    const r = state.rec;
    if (!r) return;
    clearInterval(r.timer);
    pause();
    r.rec.onstop = async () => {
      r.stream.getTracks().forEach((t) => t.stop());
      const buf = await new Blob(r.chunks, { type: r.rec.mimeType }).arrayBuffer();
      try {
        const m = await api.saveRecording(buf);
        const a = P.newAudio({ ...m, kind: 'voice', name: `Narração ${proj().audio.filter((x) => x.kind === 'voice').length + 1}` }, r.start);
        proj().audio.push(a);
        syncElements();
        select('audio', a.id, 'music');
        changed();
        toast('Narração adicionada');
      } catch (e) {
        toast(`Erro ao salvar a gravação: ${e.message}`, 6000);
      }
    };
    r.rec.stop();
    state.rec = null;
    renderPanel();
  }

  // ---------------------------------------------------------------- Projeto
  async function newProject() {
    if (state.dirty && !confirm('Descartar as alterações do projeto atual?')) return;
    pause();
    state.project = P.newProject();
    state.project.ratio = 'original';
    state.projectPath = null;
    state.sel = null;
    state.time = 0;
    history.undo = [];
    history.redo = [];
    history.stable = JSON.stringify(state.project);
    syncElements();
    fitCanvas();
    refresh();
    setDirty(false);
    updateTitle();
  }

  async function saveProject(saveAs) {
    commitHistory();
    const file = await api.saveProject(proj(), state.projectPath, saveAs);
    if (!file) return;
    state.projectPath = file;
    setDirty(false);
    updateTitle();
    toast('Projeto salvo');
  }

  async function loadProject(data) {
    if (!data) return;
    pause();
    const p = data.project;
    if (!p || !Array.isArray(p.clips)) return toast('Arquivo de projeto inválido');
    const missing = await api.missingFiles([...p.clips, ...p.audio].map((x) => x.path));
    if (missing.length) toast(`Arquivos não encontrados:\n${missing.slice(0, 5).join('\n')}`, 8000);
    [...p.clips, ...p.audio].forEach((x) => {
      x.proxyUrl = null;
    });
    state.project = p;
    state.projectPath = data.path;
    state.sel = null;
    state.time = 0;
    history.undo = [];
    history.redo = [];
    history.stable = JSON.stringify(p);
    syncElements();
    fitCanvas();
    refresh();
    setDirty(false);
    updateTitle();
  }

  async function openProject() {
    if (state.dirty && !confirm('Descartar as alterações do projeto atual?')) return;
    loadProject(await api.openProject());
  }
  api.onProjectLoaded((data) => loadProject(data));

  // ---------------------------------------------------------------- Exportação
  const QUALITY = { low: { crf: 28, preset: 'veryfast' }, medium: { crf: 23, preset: 'medium' }, high: { crf: 19, preset: 'medium' }, max: { crf: 16, preset: 'slow' } };

  function exportSize() {
    return P.canvasSize(proj(), state.exportOpts.resolution);
  }

  function updateExportInfo() {
    const { width, height } = exportSize();
    const total = P.totalDuration(proj());
    const o = state.exportOpts;
    const mbps = { low: 0.05, medium: 0.09, high: 0.14, max: 0.22 }[o.quality] * (width * height * o.fps) / 1e6;
    $('#exportInfo').textContent = `${width}×${height} • ${o.fps} fps • ${fmtTime(total)} • ~${Math.max(1, Math.round((mbps * total) / 8))} MB • sem marca d'água`;
    document.querySelectorAll('#exportForm .seg').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(o[seg.dataset.name]) === b.dataset.v));
    });
  }

  function openExport() {
    if (!proj().clips.length) return toast('Adicione vídeos ou fotos antes de exportar');
    pause();
    $('#exportForm').classList.remove('hidden');
    $('#exportProgress').classList.add('hidden');
    $('#exportModal').classList.remove('hidden');
    updateExportInfo();
  }

  document.querySelectorAll('#exportForm .seg').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      e.preventDefault();
      const v = b.dataset.v;
      state.exportOpts[seg.dataset.name] = /^\d+$/.test(v) ? Number(v) : v;
      updateExportInfo();
    });
  });

  async function doExport() {
    const date = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const base = state.projectPath ? state.projectPath.split(/[\\/]/).pop().replace(/\.i27proj$/, '') : `ISLAND27-${date}`;
    const output = await api.chooseExport(`${base}.mp4`);
    if (!output) return;
    const { width, height } = exportSize();
    const o = state.exportOpts;
    const overlays = proj().texts.map((t) => ({ data: R.textToPng(t, width, height), start: t.start, end: t.end, fade: t.fade }));
    $('#exportForm').classList.add('hidden');
    $('#exportProgress').classList.remove('hidden');
    $('#exportBar').style.width = '0%';
    $('#exportStatus').textContent = 'Exportando… 0%';
    $('#exportActions').innerHTML = btn('cancelExport', 'Cancelar exportação');
    const t0 = performance.now();
    try {
      const r = await api.startExport(proj(), { output, width, height, fps: o.fps, ...QUALITY[o.quality], overlays });
      $('#exportBar').style.width = '100%';
      $('#exportStatus').textContent = `✅ Vídeo exportado em ${((performance.now() - t0) / 1000).toFixed(0)}s:\n${r.output}`;
      $('#exportActions').innerHTML = `${btn('showExport', 'Mostrar na pasta', r.output)}${btn('openExport', 'Abrir vídeo', r.output)}${btn('closeExport', 'Fechar', '', 'primary')}`;
    } catch (e) {
      $('#exportStatus').textContent = `❌ ${e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`;
      $('#exportActions').innerHTML = `${btn('closeExport', 'Fechar')}${btn('retryExport', 'Tentar de novo', '', 'primary')}`;
    }
  }

  api.onExportProgress((p) => {
    if (/✅|❌/.test($('#exportStatus').textContent)) return;
    $('#exportBar').style.width = `${(p * 100).toFixed(1)}%`;
    $('#exportStatus').textContent = `Exportando… ${Math.floor(p * 100)}%`;
  });

  $('#exportModal').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmd], [data-action]');
    if (!b) return;
    const cmd = b.dataset.cmd || b.dataset.action;
    if (cmd === 'closeExport') $('#exportModal').classList.add('hidden');
    else if (cmd === 'doExport') doExport();
    else if (cmd === 'cancelExport') api.cancelExport();
    else if (cmd === 'showExport') api.showFile(b.dataset.arg);
    else if (cmd === 'openExport') api.openFile(b.dataset.arg);
    else if (cmd === 'retryExport') openExport();
  });

  // ---------------------------------------------------------------- Barra superior, atalhos, arrastar arquivos
  const ACTIONS = {
    new: newProject,
    open: openProject,
    save: () => saveProject(false),
    saveAs: () => saveProject(true),
    undo,
    redo,
    export: openExport,
    add: addMedia,
    play: togglePlay,
    start: () => seek(0),
    end: () => seek(P.totalDuration(proj())),
    stepBack: () => seek(state.time - 1 / 30),
    stepFwd: () => seek(state.time + 1 / 30),
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (b && !b.closest('#exportModal') && ACTIONS[b.dataset.action]) ACTIONS[b.dataset.action]();
  });

  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    const typing = tag === 'TEXTAREA' || (tag === 'INPUT' && !['range', 'checkbox'].includes(document.activeElement.type)) || tag === 'SELECT';
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 's') {
      e.preventDefault();
      saveProject(e.shiftKey);
    } else if (mod && k === 'o') {
      e.preventDefault();
      openProject();
    } else if (mod && k === 'n') {
      e.preventDefault();
      newProject();
    } else if (mod && k === 'e') {
      e.preventDefault();
      openExport();
    } else if (typing) {
      return;
    } else if (mod && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && k === 'y') {
      e.preventDefault();
      redo();
    } else if (mod && k === 'd') {
      e.preventDefault();
      duplicateSelected();
    } else if (k === ' ') {
      e.preventDefault();
      togglePlay();
    } else if (k === 'delete' || k === 'backspace') {
      deleteSelected();
    } else if (k === 's') {
      splitAtPlayhead();
    } else if (k === 'arrowleft') {
      seek(state.time - (e.shiftKey ? 1 : 1 / 30));
    } else if (k === 'arrowright') {
      seek(state.time + (e.shiftKey ? 1 : 1 / 30));
    } else if (k === 'home') {
      seek(0);
    } else if (k === 'end') {
      seek(P.totalDuration(proj()));
    } else if (k === 'escape') {
      if (!$('#exportModal').classList.contains('hidden')) $('#exportModal').classList.add('hidden');
      else select(null);
    }
  });

  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    dragDepth++;
    $('#dropOverlay').classList.remove('hidden');
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) $('#dropOverlay').classList.add('hidden');
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragDepth = 0;
    $('#dropOverlay').classList.add('hidden');
    const files = [...e.dataTransfer.files];
    const proj27 = files.find((f) => f.name.endsWith('.i27proj'));
    if (proj27) return toast('Use “Abrir” para abrir projetos');
    if (files.length) addImported(await api.importFiles(files));
  });

  let toastTimer = null;
  function toast(msg, ms = 2500) {
    const el = $('#toast');
    el.textContent = msg;
    el.style.whiteSpace = 'pre-line';
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  // ---------------------------------------------------------------- Atualização geral
  function refresh(opts = {}) {
    if (opts.timeline !== false) renderTimeline();
    if (opts.panel !== false) renderPanel();
    renderToolbar();
    requestDraw();
  }

  window.addEventListener('resize', () => renderTimeline());
  window.__editor = { state, P, refresh, changed, addImported, seek, play, pause, select, COMMANDS };
  fitCanvas();
  refresh();
  updateTitle();
})();
