// O "piloto": fila de beats, geração dos vídeos, horários, envio ao YouTube/Instagram e pasta de entrada.
// Não depende do Electron (dá para testar e rodar pela linha de comando).
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const ff = require('./ffmpeg');
const { renderBeat, safeName } = require('./pipeline');
const texts = require('../shared/texts');
const schedule = require('../shared/schedule');
const plan = require('../shared/plan');
const marketing = require('./marketing');

const META_FIELDS = ['nome', 'artista', 'genero', 'bpm', 'tom'];
const VISUAL_FIELDS = ['nome', 'artista', 'genero', 'bpm', 'tom', 'coverPath', 'bgPath', 'motion', 'audioPath'];

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Publicadores de mentira para o modo teste: nada sai do computador. */
function simulated(kind) {
  const fake = async (onProgress) => {
    for (let i = 1; i <= 10; i++) {
      await new Promise((r) => setTimeout(r, 120));
      if (onProgress) onProgress(i / 10);
    }
  };
  if (kind === 'youtube') {
    return {
      async upload(_file, meta, { onProgress } = {}) {
        await fake(onProgress);
        const id = `TESTE-${newId()}`;
        return { id, url: `(modo teste) ${meta.title}`, simulated: true };
      },
    };
  }
  const publishVideo = async (_file, _caption, { onProgress } = {}) => {
    await fake(onProgress);
    return { id: `TESTE-${newId()}`, permalink: '(modo teste)', simulated: true };
  };
  return { publishReel: publishVideo, publishVideo };
}

/** Junta beats e capas pelo nome do arquivo ("Noite.mp3" + "Noite.jpg"). Um .txt com o mesmo nome traz artista/gênero/bpm/tom. */
function pairFiles(files) {
  const groups = new Map();
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    const kind = ext === '.txt' ? 'txt' : ff.kindOf(f);
    if (!kind) continue;
    const key = path.basename(f, path.extname(f)).toLowerCase().replace(/[\s_-]*(capa|cover|art|fundo|bg)$/i, '').trim();
    if (!groups.has(key)) groups.set(key, {});
    const g = groups.get(key);
    if (kind === 'audio') g.audio = f;
    else if (kind === 'image') g.image = f;
    else if (kind === 'video') g.video = f;
    else g.txt = f;
  }
  let pairs = [...groups.values()].filter((g) => g.audio && g.image);
  const leftovers = [...groups.values()].filter((g) => !(g.audio && g.image));
  // Um beat e uma capa soltos (nomes diferentes): junta os dois.
  const audios = leftovers.filter((g) => g.audio).map((g) => g.audio);
  const images = leftovers.filter((g) => g.image).map((g) => g.image);
  const errors = [];
  if (audios.length === 1 && images.length === 1) pairs = [...pairs, { audio: audios[0], image: images[0], txt: leftovers.find((g) => g.txt)?.txt }];
  else {
    audios.forEach((a) => errors.push(`Falta a capa de "${path.basename(a)}" (use o mesmo nome: ${path.basename(a, path.extname(a))}.jpg).`));
    images.forEach((i) => errors.push(`Falta o beat da capa "${path.basename(i)}".`));
  }
  return { pairs, errors };
}

class Engine extends EventEmitter {
  /**
   * store: ver store.js. dirs: { workDir, outDir: () => pasta }.
   * clients: { youtube: () => cliente|null, instagram: () => cliente|null } (contas reais).
   */
  constructor({ store, dirs, clients = {}, now = () => new Date(), log = () => {} }) {
    super();
    this.store = store;
    this.dirs = dirs;
    this.clients = clients;
    this.now = now;
    this.log = log;
    this.rendering = null;
    this.busy = { youtube: false, instagram: false, marketing: false };
    this.timers = [];
  }

  get settings() {
    return this.store.settings;
  }

  changed() {
    this.emit('change');
  }

  start({ tickMs = 20000, inboxMs = 15000 } = {}) {
    // Se o app fechou no meio de algo, volta para a fila.
    for (const it of this.store.items) {
      if (it.render && it.render.status === 'gerando') this.store.update(it.id, { render: { status: 'aguardando', progress: 0 } });
      if (it.yt && it.yt.status === 'enviando') this.store.update(it.id, { yt: { status: 'pendente', progress: 0 } });
      if (it.ig && it.ig.status === 'enviando') this.store.update(it.id, { ig: { status: 'pendente', progress: 0 } });
    }
    for (const p of this.store.posts) {
      if (p.status === 'gerando') this.store.updatePost(p.id, { status: 'planejado' });
      if (p.status === 'enviando') this.store.updatePost(p.id, { status: 'pronto' });
    }
    this.kickPosts();
    this.timers.push(setInterval(() => this.tick(), tickMs));
    this.timers.push(setInterval(() => this.scanInbox().catch((e) => this.log(`Pasta de entrada: ${e.message}`)), inboxMs));
    this.kick();
    this.tick();
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    if (this.rendering) this.rendering.cancel?.();
  }

  // ---------- fila ----------

  addBeat(input) {
    if (!input.audioPath || !fs.existsSync(input.audioPath)) throw new Error('Escolha o arquivo do beat.');
    if (!input.coverPath || !fs.existsSync(input.coverPath)) throw new Error('Escolha a capa.');
    const s = this.settings;
    const platforms = { ...s.platforms, ...(input.platforms || {}) };
    const beat = {
      id: newId(),
      createdAt: this.now().toISOString(),
      nome: (input.nome || texts.nameFromFile(input.audioPath)).trim(),
      artista: input.artista || '',
      genero: input.genero || '',
      bpm: input.bpm ? Number(input.bpm) : null,
      tom: input.tom || '',
      audioPath: input.audioPath,
      coverPath: input.coverPath,
      bgPath: input.bgPath || '',
      motion: input.motion || 'auto',
      platforms,
      when: input.when ? new Date(input.when).toISOString() : null,
      textsEdited: false,
      render: { status: 'aguardando', progress: 0 },
      yt: { status: platforms.youtube ? 'pendente' : 'desligado' },
      ig: { status: platforms.instagram ? 'pendente' : 'desligado' },
    };
    beat.texts = texts.generate(beat, s, this.now());
    this.store.add(beat);
    this.log(`Beat adicionado: ${beat.nome}`);
    this.changed();
    this.kick();
    return beat;
  }

  /** Adiciona vários arquivos de uma vez (arrastar e soltar ou pasta de entrada). */
  addFiles(files, defaults = {}) {
    const { pairs, errors } = pairFiles(files);
    const added = [];
    for (const p of pairs) {
      try {
        const extra = p.txt ? texts.parseSidecar(fs.readFileSync(p.txt, 'utf8')) : {};
        added.push(this.addBeat({ ...defaults, ...extra, audioPath: p.audio, coverPath: p.image, bgPath: p.video || defaults.bgPath }));
      } catch (e) {
        errors.push(`${path.basename(p.audio)}: ${e.message}`);
      }
    }
    return { added, errors };
  }

  update(id, patch) {
    const it = this.store.item(id);
    if (!it) throw new Error('Beat não encontrado.');
    const p = { ...patch };
    if ('when' in p) p.when = p.when ? new Date(p.when).toISOString() : null;
    if (p.bpm !== undefined) p.bpm = p.bpm ? Number(p.bpm) : null;
    if (p.texts) p.textsEdited = true;
    if (p.platforms) {
      p.platforms = { ...it.platforms, ...p.platforms };
      if (p.platforms.youtube && it.yt.status === 'desligado') p.yt = { status: 'pendente' };
      if (!p.platforms.youtube && it.yt.status === 'pendente') p.yt = { status: 'desligado' };
      if (p.platforms.instagram && it.ig.status === 'desligado') p.ig = { status: 'pendente' };
      if (!p.platforms.instagram && it.ig.status === 'pendente') p.ig = { status: 'desligado' };
    }
    const visual = VISUAL_FIELDS.some((k) => k in p && p[k] !== it[k]);
    this.store.update(id, p);
    if (!it.textsEdited && META_FIELDS.some((k) => k in p)) this.store.update(id, { texts: texts.generate(it, this.settings, this.now()) });
    if (visual && it.render.status === 'pronto') this.store.update(id, { needsRerender: true });
    if ('audioPath' in p) this.store.update(id, { analysis: null });
    this.changed();
    this.tick();
    return this.store.item(id);
  }

  regenTexts(id) {
    const it = this.store.item(id);
    if (!it) return;
    this.store.update(id, { texts: texts.generate(it, this.settings, this.now()), textsEdited: false });
    this.changed();
  }

  rerender(id) {
    const it = this.store.item(id);
    if (!it) return;
    if (['enviando'].includes(it.yt.status) || ['enviando'].includes(it.ig.status)) throw new Error('Espere terminar o envio.');
    this.store.update(id, { render: { status: 'aguardando', progress: 0, error: null }, needsRerender: false });
    this.changed();
    this.kick();
  }

  remove(id) {
    if (this.rendering && this.rendering.id === id) this.rendering.cancel?.();
    this.store.remove(id);
    this.changed();
  }

  retry(id, platform) {
    const it = this.store.item(id);
    if (!it) return;
    if (platform === 'render') return this.rerender(id);
    const key = platform === 'youtube' ? 'yt' : 'ig';
    this.store.update(id, { [key]: { status: 'pendente', error: null, progress: 0 } });
    this.changed();
    this.tick();
  }

  publishNow(id) {
    this.store.update(id, { when: this.now().toISOString() });
    this.changed();
    this.tick();
  }

  /** Dá horário para os beats sem horário (na ordem da fila). */
  distribute() {
    const candidates = this.store.items.filter((i) => i.render.status !== 'erro' && (i.yt.status === 'pendente' || i.ig.status === 'pendente' || i.when));
    const plan = schedule.distribute(candidates, this.settings, this.now());
    for (const p of plan) this.store.update(p.id, { when: p.when.toISOString() });
    if (plan.length) this.log(`${plan.length} beat(s) com horário marcado.`);
    this.changed();
    this.tick();
    return plan;
  }

  // ---------- geração dos vídeos ----------

  outDirFor(it) {
    const day = (it.createdAt || '').slice(0, 10);
    return path.join(this.dirs.outDir(), `${day}-${safeName(it.nome)}`);
  }

  kick() {
    if (this.rendering) return;
    const it = this.store.items.find((i) => i.render.status === 'aguardando');
    if (!it) return;
    this.renderItem(it).finally(() => {
      this.rendering = null;
      setImmediate(() => this.kick());
    });
  }

  async renderItem(it) {
    const job = { id: it.id, cancel: null };
    this.rendering = job;
    this.store.update(it.id, { render: { status: 'gerando', progress: 0, fase: 'Começando', error: null } });
    this.changed();
    let lastEmit = 0;
    try {
      const fresh = this.store.item(it.id);
      const r = await renderBeat(
        { ...fresh, texts: fresh.textsEdited ? fresh.texts : null, analysis: fresh.analysis || null, reelLength: this.settings.reelLength },
        {
          outDir: this.outDirFor(fresh),
          workDir: this.dirs.workDir,
          settings: this.settings,
          onCancelable: (c) => {
            job.cancel = c;
          },
          onProgress: (fase, p) => {
            this.store.update(it.id, { render: { status: 'gerando', progress: p, fase } });
            const t = Date.now();
            if (t - lastEmit > 250) {
              lastEmit = t;
              this.changed();
            }
          },
        },
      );
      if (!this.store.item(it.id)) return; // removido enquanto gerava
      const cur = this.store.item(it.id);
      const patch = { analysis: r.analysis, outputs: r.outputs, render: { status: 'pronto', progress: 1, fase: 'Pronto', error: null }, needsRerender: false };
      if (!cur.bpm && r.analysis.bpm) {
        patch.bpm = r.analysis.bpm;
        patch.bpmAuto = true;
      }
      this.store.update(it.id, patch);
      if (!cur.textsEdited) this.store.update(it.id, { texts: r.texts });
      this.log(`Vídeos prontos: ${cur.nome}`);
      if (this.settings.autopilot && !cur.when) this.distribute();
    } catch (e) {
      if (this.store.item(it.id)) this.store.update(it.id, { render: { status: 'erro', error: e.message } });
      this.log(`Erro ao gerar ${it.nome}: ${e.message}`);
    }
    this.changed();
    this.tick();
  }

  // ---------- publicação ----------

  publisher(kind) {
    if (this.settings.simulation) return simulated(kind);
    const make = this.clients[kind];
    return make ? make() : null;
  }

  tick() {
    const now = this.now().getTime();
    for (const it of this.store.items) {
      if (it.render.status !== 'pronto' || !it.when) continue;
      const when = new Date(it.when).getTime();
      // YouTube: envia logo (agendado no próprio YouTube); depois do horário, marca como publicado.
      if (it.yt.status === 'agendado' && when <= now) this.store.update(it.id, { yt: { status: 'publicado' } });
      if (it.yt.status === 'pendente' && !this.busy.youtube) this.sendYouTube(it);
      // Instagram: a API não agenda; publica quando chega a hora (o app precisa estar aberto).
      if (it.ig.status === 'pendente' && when <= now && !this.busy.instagram) this.sendInstagram(it);
    }
    this.tickPosts();
    this.changed();
  }

  async sendYouTube(it) {
    const pub = this.publisher('youtube');
    if (!pub) {
      this.store.update(it.id, { yt: { status: 'erro', error: 'YouTube não conectado. Conecte nas Configurações (ou ligue o Modo teste).' } });
      return;
    }
    this.busy.youtube = true;
    this.store.update(it.id, { yt: { status: 'enviando', progress: 0, error: null } });
    this.changed();
    try {
      const when = new Date(it.when);
      const r = await pub.upload(
        it.outputs.youtube,
        { title: it.texts.ytTitle, description: it.texts.ytDescription, tags: it.texts.ytTags, publishAt: when },
        {
          thumbnail: it.outputs.thumb,
          onProgress: (p) => {
            this.store.update(it.id, { yt: { progress: p } });
            this.changed();
          },
        },
      );
      const scheduled = when.getTime() > this.now().getTime() + 60000;
      this.store.update(it.id, {
        yt: { status: scheduled ? 'agendado' : 'publicado', videoId: r.id, url: r.url, progress: 1, warning: r.thumbError ? `Miniatura não enviada: ${r.thumbError}` : null, simulated: !!r.simulated },
      });
      this.log(`YouTube ${scheduled ? 'agendado' : 'publicado'}: ${it.nome}`);
    } catch (e) {
      this.store.update(it.id, { yt: { status: 'erro', error: e.message } });
      this.log(`Erro no YouTube (${it.nome}): ${e.message}`);
    } finally {
      this.busy.youtube = false;
      this.changed();
      setImmediate(() => this.tick());
    }
  }

  async sendInstagram(it) {
    const pub = this.publisher('instagram');
    if (!pub) {
      this.store.update(it.id, { ig: { status: 'erro', error: 'Instagram não conectado. Configure nas Configurações (ou ligue o Modo teste).' } });
      return;
    }
    this.busy.instagram = true;
    this.store.update(it.id, { ig: { status: 'enviando', progress: 0, error: null } });
    this.changed();
    try {
      const r = await pub.publishReel(it.outputs.reels, it.texts.igCaption, {
        onProgress: (p) => {
          this.store.update(it.id, { ig: { progress: p } });
          this.changed();
        },
      });
      this.store.update(it.id, { ig: { status: 'publicado', mediaId: r.id, url: r.permalink, progress: 1, simulated: !!r.simulated } });
      this.log(`Instagram publicado: ${it.nome}`);
    } catch (e) {
      this.store.update(it.id, { ig: { status: 'erro', error: e.message } });
      this.log(`Erro no Instagram (${it.nome}): ${e.message}`);
    } finally {
      this.busy.instagram = false;
      this.changed();
      setImmediate(() => this.tick());
    }
  }

  // ---------- marketing (posts do Instagram) ----------

  /** Beats ainda não lançados, na ordem dos horários (usados no plano da semana). */
  upcomingBeats() {
    return this.store.items
      .filter((i) => i.ig.status !== 'publicado' || i.yt.status !== 'publicado')
      .sort((a, b) => (a.when ? new Date(a.when) : Infinity) - (b.when ? new Date(b.when) : Infinity));
  }

  marketingDir(post) {
    return path.join(this.dirs.outDir(), 'Marketing', post.id.slice(0, 10));
  }

  /** Monta a semana (weekIndex 0 = semana de lançamento do perfil) e gera as artes. */
  planWeek(start, weekIndex = 0) {
    const posts = plan.buildWeek(start, this.settings, this.upcomingBeats(), weekIndex);
    for (const p of posts) {
      p.status = 'planejado';
      if (p.kind === 'reels-beat' || p.kind === 'reels-gravar') p.status = p.kind === 'reels-beat' ? 'automatico' : 'pronto';
    }
    this.store.addPosts(posts);
    this.log(`Semana planejada: ${posts.length} posts a partir de ${new Date(start).toLocaleDateString('pt-BR')}.`);
    this.changed();
    this.kickPosts();
    return posts;
  }

  updatePost(id, patch) {
    const p = this.store.post(id);
    if (!p) throw new Error('Post não encontrado.');
    const next = { ...patch };
    if (next.date) next.date = new Date(next.date).toISOString();
    if (next.caption !== undefined && p.files && p.files.dir) fs.writeFileSync(path.join(p.files.dir, 'legenda.txt'), next.caption);
    if (next.slides) next.status = 'planejado';
    if (next.date && ['hora-de-postar', 'erro'].includes(p.status) && new Date(next.date) > this.now()) next.status = p.files ? 'pronto' : 'planejado';
    this.store.updatePost(id, next);
    this.changed();
    this.kickPosts();
    return this.store.post(id);
  }

  removePost(id) {
    this.store.removePost(id);
    this.changed();
  }

  markPosted(id) {
    this.store.updatePost(id, { status: 'postado', postedAt: this.now().toISOString() });
    this.changed();
  }

  rerenderPost(id) {
    this.store.updatePost(id, { status: 'planejado', error: null });
    this.changed();
    this.kickPosts();
  }

  /** Gera as artes dos posts planejados, um de cada vez. */
  kickPosts() {
    if (this.busy.marketing) return;
    const all = this.store.posts;
    const p = all.find((x) => x.status === 'planejado');
    if (!p) return;
    this.busy.marketing = true;
    this.store.updatePost(p.id, { status: 'gerando' });
    this.changed();
    const sameWeek = all.filter((x) => x.id.slice(0, 10) === p.id.slice(0, 10));
    const index = sameWeek.indexOf(p);
    // o Reels de carrossel usa o primeiro beat da fila como trilha, se houver
    if (p.kind === 'reels-carrossel' && !p.audio) {
      const b = this.upcomingBeats().find((i) => i.audioPath && fs.existsSync(i.audioPath));
      if (b) Object.assign(p, { audio: b.audioPath, audioStart: b.analysis ? b.analysis.dropStart : 0 });
    }
    marketing
      .renderOne(p, index, { outDir: this.marketingDir(p), workDir: this.dirs.workDir, brand: { handle: this.settings.marketing.handle } })
      .then((files) => {
        if (this.store.post(p.id)) this.store.updatePost(p.id, { status: 'pronto', files, error: null });
      })
      .catch((e) => {
        if (this.store.post(p.id)) this.store.updatePost(p.id, { status: 'erro', error: e.message });
        this.log(`Erro ao gerar o post “${p.titulo}”: ${e.message}`);
      })
      .finally(() => {
        this.busy.marketing = false;
        this.changed();
        setImmediate(() => {
          this.kickPosts();
          this.tickPosts();
        });
      });
  }

  /**
   * Na hora de cada post: Reels de carrossel sai sozinho pela API; carrossel, story (precisa de sticker)
   * e Reels gravado viram "hora de postar" (o app avisa e deixa tudo pronto para copiar).
   */
  tickPosts() {
    const now = this.now().getTime();
    for (const p of this.store.posts) {
      if (p.status !== 'pronto' || new Date(p.date).getTime() > now) continue;
      const auto = p.kind === 'reels-carrossel' && p.files && p.files.video && this.settings.marketing.autoPublish !== false;
      const pub = auto ? this.publisher('instagram') : null;
      if (auto && pub && !this.busy.instagram) this.sendPost(p, pub);
      else if (!auto || !pub) {
        this.store.updatePost(p.id, { status: 'hora-de-postar' });
        this.emit('due', p);
        this.log(`Hora de postar: ${p.titulo}`);
      }
    }
  }

  async sendPost(p, pub) {
    this.busy.instagram = true;
    this.store.updatePost(p.id, { status: 'enviando', progress: 0 });
    this.changed();
    try {
      const r = await pub.publishVideo(p.files.video, p.caption, {
        mediaType: 'REELS',
        onProgress: (x) => {
          this.store.updatePost(p.id, { progress: x });
          this.changed();
        },
      });
      this.store.updatePost(p.id, { status: 'postado', url: r.permalink, postedAt: this.now().toISOString(), simulated: !!r.simulated });
      this.log(`Instagram: publicado “${p.titulo}”${r.simulated ? ' (modo teste)' : ''}.`);
    } catch (e) {
      this.store.updatePost(p.id, { status: 'erro', error: e.message });
      this.log(`Erro ao publicar “${p.titulo}”: ${e.message}`);
    } finally {
      this.busy.instagram = false;
      this.changed();
    }
  }

  // ---------- pasta de entrada ----------

  /** Importa pares beat + capa que aparecerem na pasta de entrada (e move para "importados"). */
  async scanInbox() {
    const dir = this.settings.inbox;
    if (!dir || !fs.existsSync(dir)) return [];
    const now = Date.now();
    const files = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && !d.name.startsWith('.'))
      .map((d) => path.join(dir, d.name))
      // espera o arquivo terminar de copiar (sem mudanças há 4 s)
      .filter((f) => now - fs.statSync(f).mtimeMs > 4000);
    const { pairs } = pairFiles(files);
    if (!pairs.length) return [];
    const dest = path.join(dir, 'importados', new Date(now).toISOString().slice(0, 19).replace(/[:T]/g, '-'));
    fs.mkdirSync(dest, { recursive: true });
    const moved = [];
    for (const p of pairs) {
      const m = {};
      for (const k of ['audio', 'image', 'video', 'txt']) {
        if (!p[k]) continue;
        m[k] = path.join(dest, path.basename(p[k]));
        fs.renameSync(p[k], m[k]);
      }
      moved.push(...Object.values(m));
    }
    const { added, errors } = this.addFiles(moved);
    errors.forEach((e) => this.log(`Pasta de entrada: ${e}`));
    if (added.length) this.log(`Pasta de entrada: ${added.length} beat(s) importado(s).`);
    return added;
  }
}

module.exports = { Engine, pairFiles, simulated };
