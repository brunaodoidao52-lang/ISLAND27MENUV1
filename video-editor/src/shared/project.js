// Modelo do projeto compartilhado entre a interface (prévia) e o processo principal (exportação).
// Tudo que define a aparência do vídeo final é calculado aqui, para a prévia e o FFmpeg ficarem iguais.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Project = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const RATIOS = {
    original: null,
    '9:16': [9, 16],
    '16:9': [16, 9],
    '1:1': [1, 1],
    '4:5': [4, 5],
    '4:3': [4, 3],
    '3:4': [3, 4],
    '21:9': [21, 9],
    '2:3': [2, 3],
  };

  // Parâmetros base de cada filtro. Valores neutros: brightness 1, contrast 1, saturation 1, hue 0, sepia 0, warmth 0, vignette 0.
  const FILTERS = [
    { id: 'none', name: 'Original' },
    { id: 'vivid', name: 'Vívido', saturation: 1.45, contrast: 1.12 },
    { id: 'warm', name: 'Quente', warmth: 0.7, saturation: 1.1 },
    { id: 'cool', name: 'Frio', warmth: -0.7, saturation: 1.05 },
    { id: 'bw', name: 'P&B', saturation: 0, contrast: 1.15 },
    { id: 'noir', name: 'Noir', saturation: 0, contrast: 1.5, brightness: 0.9, vignette: 0.6 },
    { id: 'sepia', name: 'Sépia', sepia: 0.85 },
    { id: 'vintage', name: 'Vintage', sepia: 0.4, contrast: 0.9, saturation: 0.85, vignette: 0.5, warmth: 0.3 },
    { id: 'fade', name: 'Desbotado', contrast: 0.78, brightness: 1.08, saturation: 0.75 },
    { id: 'drama', name: 'Drama', contrast: 1.35, saturation: 0.8, vignette: 0.55 },
    { id: 'sunset', name: 'Pôr do sol', warmth: 1, saturation: 1.25, hue: -8 },
    { id: 'teal', name: 'Cinema', warmth: -0.35, contrast: 1.2, saturation: 1.15, hue: 8 },
    { id: 'bright', name: 'Claro', brightness: 1.18, contrast: 0.95 },
    { id: 'moody', name: 'Sombrio', brightness: 0.85, saturation: 0.7, contrast: 1.1, warmth: -0.2 },
    { id: 'pop', name: 'Pop', saturation: 1.8, contrast: 1.2, hue: 10 },
    { id: 'retro', name: 'Retrô', sepia: 0.25, hue: -15, saturation: 1.2, vignette: 0.35 },
    { id: 'pastel', name: 'Pastel', brightness: 1.1, saturation: 0.6, contrast: 0.85, hue: 12 },
    { id: 'gold', name: 'Dourado', warmth: 0.8, sepia: 0.2, contrast: 1.1 },
  ];

  const TRANSITIONS = [
    { id: 'none', name: 'Nenhuma' },
    { id: 'fade', name: 'Esmaecer' },
    { id: 'dissolve', name: 'Dissolver' },
    { id: 'fadeblack', name: 'Preto' },
    { id: 'fadewhite', name: 'Branco' },
    { id: 'wipeleft', name: 'Varrer ←' },
    { id: 'wiperight', name: 'Varrer →' },
    { id: 'wipeup', name: 'Varrer ↑' },
    { id: 'wipedown', name: 'Varrer ↓' },
    { id: 'slideleft', name: 'Deslizar ←' },
    { id: 'slideright', name: 'Deslizar →' },
    { id: 'slideup', name: 'Deslizar ↑' },
    { id: 'slidedown', name: 'Deslizar ↓' },
    { id: 'smoothleft', name: 'Suave ←' },
    { id: 'smoothright', name: 'Suave →' },
    { id: 'circleopen', name: 'Círculo abrir' },
    { id: 'circleclose', name: 'Círculo fechar' },
    { id: 'radial', name: 'Radial' },
    { id: 'zoomin', name: 'Zoom' },
    { id: 'pixelize', name: 'Pixelar' },
    { id: 'hblur', name: 'Desfoque' },
    { id: 'distance', name: 'Distância' },
    { id: 'squeezeh', name: 'Espremer' },
    { id: 'diagtl', name: 'Diagonal' },
    { id: 'coverleft', name: 'Cobrir ←' },
    { id: 'revealright', name: 'Revelar →' },
  ];

  const DEFAULT_ADJUST = { brightness: 0, contrast: 0, saturation: 0, hue: 0, warmth: 0, vignette: 0 };

  let idCounter = 0;
  function uid(prefix) {
    idCounter += 1;
    return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  function newProject() {
    return {
      version: 1,
      ratio: '9:16',
      background: { type: 'blur', blur: 0.6, color: '#000000' },
      clips: [],
      texts: [],
      audio: [],
    };
  }

  function newClip(media) {
    const isImage = media.type === 'image';
    const duration = isImage ? 3 : media.duration;
    return {
      id: uid('c'),
      type: isImage ? 'image' : 'video',
      path: media.path,
      url: media.url,
      thumb: media.thumb || null,
      name: media.name,
      width: media.width,
      height: media.height,
      hasAudio: !!media.hasAudio,
      sourceDuration: isImage ? null : media.duration,
      in: 0,
      out: duration,
      speed: 1,
      volume: 1,
      muted: false,
      reverse: false,
      rotate: 0,
      flipH: false,
      flipV: false,
      fit: 'fit',
      zoom: 1,
      panX: 0,
      panY: 0,
      filter: 'none',
      filterStrength: 1,
      adjust: { ...DEFAULT_ADJUST },
      transition: { type: 'none', duration: 0.5 },
    };
  }

  function newText(props) {
    return {
      id: uid('t'),
      text: 'Seu texto',
      start: 0,
      end: 3,
      x: 0.5,
      y: 0.5,
      font: 'Arial',
      size: 0.06,
      color: '#ffffff',
      bold: true,
      italic: false,
      align: 'center',
      strokeColor: '#000000',
      strokeWidth: 0.15,
      shadow: true,
      bgColor: '#000000',
      bgOpacity: 0,
      opacity: 1,
      rotation: 0,
      fade: true,
      sticker: false,
      ...props,
    };
  }

  function newAudio(media, start) {
    return {
      id: uid('a'),
      path: media.path,
      url: media.url,
      name: media.name,
      kind: media.kind || 'music',
      sourceDuration: media.duration,
      start: start || 0,
      in: 0,
      len: media.duration,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      loop: false,
    };
  }

  function clipDuration(clip) {
    return Math.max(0.05, (clip.out - clip.in) / (clip.type === 'image' ? 1 : clip.speed));
  }

  // Duração efetiva da transição entre o clipe i e o i+1 (limitada para não "engolir" os clipes).
  function transitionDuration(clips, i) {
    const c = clips[i];
    const next = clips[i + 1];
    if (!next || !c.transition || c.transition.type === 'none') return 0;
    const max = Math.min(clipDuration(c), clipDuration(next)) / 2;
    return Math.max(0, Math.min(c.transition.duration, max - 0.02));
  }

  // Posição de cada clipe na linha do tempo. Transições sobrepõem o final de um clipe ao início do próximo.
  function layout(project) {
    const items = [];
    let t = 0;
    project.clips.forEach((clip, i) => {
      const duration = clipDuration(clip);
      const transIn = i > 0 ? transitionDuration(project.clips, i - 1) : 0;
      const start = t - transIn;
      const transOut = transitionDuration(project.clips, i);
      items.push({ clip, index: i, start, duration, end: start + duration, transIn, transOut });
      t = start + duration;
    });
    return { items, total: t };
  }

  function totalDuration(project) {
    return layout(project).total;
  }

  // Tempo no arquivo de origem para um tempo da linha do tempo dentro do clipe.
  function sourceTime(item, t) {
    const c = item.clip;
    if (c.type === 'image') return 0;
    const local = Math.min(Math.max(0, t - item.start), item.duration) * c.speed;
    return c.reverse ? Math.max(c.in, c.out - local) : Math.min(c.out, c.in + local);
  }

  function canvasSize(project, shortSide) {
    let r = RATIOS[project.ratio];
    if (!r) {
      const first = project.clips.find((c) => c.width && c.height);
      r = first ? [first.width, first.height] : [9, 16];
    }
    const [rw, rh] = r;
    let w;
    let h;
    if (rw <= rh) {
      w = shortSide;
      h = (shortSide * rh) / rw;
    } else {
      h = shortSide;
      w = (shortSide * rw) / rh;
    }
    const even = (v) => Math.max(2, Math.round(v / 2) * 2);
    return { width: even(w), height: even(h) };
  }

  // Dimensões do conteúdo após girar.
  function rotatedSize(clip) {
    const w = clip.width || 1280;
    const h = clip.height || 720;
    return clip.rotate % 180 === 0 ? [w, h] : [h, w];
  }

  // Onde o clipe aparece na tela: tamanho escalado (dw, dh), área visível (cw, ch) e deslocamento do recorte.
  function placement(clip, W, H) {
    const [rw, rh] = rotatedSize(clip);
    const k = (clip.fit === 'fill' ? Math.max(W / rw, H / rh) : Math.min(W / rw, H / rh)) * (clip.zoom || 1);
    const dw = rw * k;
    const dh = rh * k;
    const cw = Math.min(dw, W);
    const ch = Math.min(dh, H);
    const cropX = ((dw - cw) * ((clip.panX || 0) + 1)) / 2;
    const cropY = ((dh - ch) * ((clip.panY || 0) + 1)) / 2;
    return { rw, rh, dw, dh, cw, ch, cropX, cropY, x: (W - cw) / 2, y: (H - ch) / 2 };
  }

  // Parâmetros de cor finais = filtro (com intensidade) + ajustes manuais.
  function colorParams(clip) {
    const f = FILTERS.find((x) => x.id === clip.filter) || FILTERS[0];
    const s = clip.filterStrength == null ? 1 : clip.filterStrength;
    const a = { ...DEFAULT_ADJUST, ...(clip.adjust || {}) };
    const mix = (key, neutral) => neutral + ((f[key] == null ? neutral : f[key]) - neutral) * s;
    return {
      brightness: Math.max(0, mix('brightness', 1) * (1 + a.brightness * 0.5)),
      contrast: Math.max(0, mix('contrast', 1) * (1 + a.contrast * 0.5)),
      saturation: Math.max(0, mix('saturation', 1) * (1 + a.saturation)),
      hue: mix('hue', 0) + a.hue * 180,
      sepia: Math.min(1, mix('sepia', 0)),
      warmth: Math.max(-1, Math.min(1, mix('warmth', 0) + a.warmth)),
      vignette: Math.max(0, Math.min(1, mix('vignette', 0) + a.vignette)),
    };
  }

  // Multiplicadores RGB do "calor" — os mesmos na prévia (multiply) e no FFmpeg (colorchannelmixer).
  function warmthMultipliers(w) {
    if (w >= 0) return [1, 1 - 0.06 * w, 1 - 0.25 * w];
    return [1 + 0.25 * w, 1 + 0.06 * w, 1];
  }

  function cssFilter(p) {
    const parts = [];
    if (p.sepia > 0) parts.push(`sepia(${p.sepia})`);
    if (p.brightness !== 1) parts.push(`brightness(${p.brightness})`);
    if (p.contrast !== 1) parts.push(`contrast(${p.contrast})`);
    if (p.saturation !== 1) parts.push(`saturate(${p.saturation})`);
    if (p.hue) parts.push(`hue-rotate(${p.hue}deg)`);
    return parts.length ? parts.join(' ') : 'none';
  }

  // Volume de uma faixa de áudio em um instante (com fade in/out).
  function audioGain(track, t) {
    const local = t - track.start;
    let g = track.volume;
    if (track.fadeIn > 0 && local < track.fadeIn) g *= Math.max(0, local / track.fadeIn);
    if (track.fadeOut > 0 && local > track.len - track.fadeOut) g *= Math.max(0, (track.len - local) / track.fadeOut);
    return g;
  }

  return {
    RATIOS,
    FILTERS,
    TRANSITIONS,
    DEFAULT_ADJUST,
    uid,
    newProject,
    newClip,
    newText,
    newAudio,
    clipDuration,
    transitionDuration,
    layout,
    totalDuration,
    sourceTime,
    canvasSize,
    rotatedSize,
    placement,
    colorParams,
    warmthMultipliers,
    cssFilter,
    audioGain,
  };
});
