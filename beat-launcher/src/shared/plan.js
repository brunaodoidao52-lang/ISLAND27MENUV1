// Plano de conteúdo do Instagram: monta a semana com posts de feed, carrosséis, Reels e Stories.
// Pilares: apresentar a marca, ensinar (dicas), mostrar beats, prova/serviços e bastidores com o Bruninn.

const DEFAULT_MARKETING = {
  handle: '@__island27',
  artistHandle: '@bruuninn__',
  times: { feed: '12:00', reels: '18:30', story: '20:00' },
  // Preços de exemplo: ajuste para os valores reais da SoundX em Configurações → Marketing.
  licencas: [
    { nome: 'Básica', desc: 'MP3 • uso em streaming e clipe', preco: 'R$ 79' },
    { nome: 'Premium', desc: 'WAV • mais qualidade pra lançar', preco: 'R$ 149', destaque: true },
    { nome: 'Trackout', desc: 'Stems separados • pra mixar do seu jeito', preco: 'R$ 249' },
    { nome: 'Exclusiva', desc: 'O beat sai da loja e é só seu', preco: 'Sob consulta' },
  ],
  photos: { artista: '', ilha: '', banner: '', flyer: '', artista2: '' },
};

const SERVICOS = ['BEATS', 'PRODUÇÃO', 'MIXAGEM', 'MASTERIZAÇÃO', 'BEAT POR ENCOMENDA', 'CURSOS'];

// Banco de carrosséis de dicas (um por semana, em rodízio). Conteúdo técnico simples e verdadeiro.
const DICAS = [
  {
    tema: '808',
    capa: '3 erros que deixam seu *808 fraco*',
    sub: 'E como resolver ainda hoje, no seu próprio beat.',
    itens: [
      ['808 fora do tom', 'O 808 é nota, não só grave. Se ele não está no tom do beat, a música soa “suja” mesmo com tudo alto. *Afine o 808 na tônica* e siga a harmonia.'],
      ['Brigando com o kick', 'Kick e 808 batendo juntos disputam o mesmo espaço e somem. Use *sidechain* leve ou encurte o 808 onde o kick entra.'],
      ['Só subgrave', 'Celular e caixinha quase não tocam subgrave. Uma *saturação leve* cria harmônicos e faz o 808 aparecer em qualquer fone.'],
    ],
    legenda: 'Qual desses você já cometeu? 👀 Salva pra lembrar no próximo beat e manda pro parceiro que produz.',
  },
  {
    tema: 'voz',
    capa: 'Sua voz some no beat? *Faz isso*',
    sub: '3 ajustes antes de mandar pra mix.',
    itens: [
      ['Grava sem estourar', 'Deixa o pico da voz bem abaixo do vermelho (por volta de -10 dB). Voz clipada *não tem conserto* na mixagem.'],
      ['Corta o grave da voz', 'Um filtro passa-alta tira o embolado e abre espaço pro 808. Ajuste até a voz ficar *limpa sem afinar*.'],
      ['Beat em -6 dB pra gravar', 'Abaixa o instrumental enquanto grava. Você ouve melhor a própria voz e *canta mais afinado*.'],
    ],
    legenda: 'Grava hoje com essas 3 e me conta a diferença 🎙️ Se quiser a mix pronta, chama no direct.',
  },
  {
    tema: 'type beat',
    capa: 'Como escolher o *beat certo* pra sua música',
    sub: 'Antes de comprar, confere isso.',
    itens: [
      ['O BPM combina com seu flow?', 'Rima rápida pede BPM mais baixo (trap em 140 soa como 70). Testa cantando por cima *antes de fechar*.'],
      ['O tom cabe na sua voz?', 'Se você força pra alcançar a melodia, o beat está no tom errado. Dá pra *pedir o tom ajustado*.'],
      ['Licença certa pro seu plano', 'Vai lançar no Spotify? Precisa de licença. Quer o beat só seu? *Exclusiva*. Na dúvida, pergunta.'],
    ],
    legenda: 'Salva esse checklist pra próxima vez que for escolher um beat ✅',
  },
  {
    tema: 'lançamento',
    capa: 'Antes de *lançar sua música*, confere isso',
    sub: 'O checklist que evita dor de cabeça.',
    itens: [
      ['Master no volume certo', 'Música muito baixa perde força na playlist. Muito alta distorce. Peça uma *master pro streaming*.'],
      ['Licença do beat em mãos', 'Distribuidora pode pedir. Guarde o comprovante da *licença* com o nome do produtor.'],
      ['Capa e prévia prontas', 'Lança com capa, um *Reels de 15 s* do refrão e o link pronto. Primeira semana é a que mais conta.'],
    ],
    legenda: 'Vai lançar algo esse mês? Comenta “LANÇA” que eu te ajudo a fechar o checklist 🚀',
  },
];

const ROTEIROS = {
  cookup: {
    titulo: 'Beat do zero em 30 segundos',
    roteiro: [
      '0-2s  GANCHO: tela do FL Studio vazia + texto na tela: “fiz um beat do zero em 30s”.',
      '2-20s  Grave a tela acelerada: bateria → 808 → melodia (corte a cada 2 ou 3 segundos, no ritmo).',
      '20-28s  Toca o beat pronto, com você reagindo (cabeça balançando, sem falar).',
      '28-30s  Texto: “comenta BEAT que eu te mando”.',
      'Áudio: o próprio beat. Legenda automática do CapCut se você falar algo.',
    ],
  },
  historia: {
    titulo: 'Por que eu criei a ISLAND27',
    roteiro: [
      'Grave em pé, de frente pra câmera, luz de janela no rosto. 25 a 35 segundos.',
      '0-3s  “Tudo começou numa ilha.” (corte pra imagem da Ilha do Frade).',
      '3-15s  “Eu sou o Bruninn, da Ilha do Frade, em Vitória. Comecei a produzir sem saber tudo, criando com o que eu tinha.”',
      '15-25s  “A ISLAND27 é onde eu faço beat, produção, mix e master pra quem quer levar o som a sério.”',
      '25-30s  “Segue aqui que toda semana tem beat novo. Da Ilha pro mundo.”',
      'Legendas na tela (CapCut → Legendas automáticas).',
    ],
  },
  reacao: {
    titulo: 'Mostrando um beat pra alguém pela primeira vez',
    roteiro: [
      'Chame um amigo/artista. Câmera no rosto dele, fone no ouvido.',
      '0-2s  Texto: “mostrei esse beat pra ele sem avisar…”.',
      'Mostre a reação no drop. Corte pro nome do beat + “comenta BEAT”.',
    ],
  },
};

function at(day, hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m || 0, 0, 0);
  return d.toISOString();
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  x.setHours(0, 0, 0, 0);
  return x;
}

function tags(...t) {
  return t.slice(0, 5).map((x) => `#${x}`).join(' ');
}

function licencaRows(m) {
  return (m.licencas || DEFAULT_MARKETING.licencas).map((r) => ({ ...r }));
}

/** Carrossel de dicas (capa + 3 dicas + chamada). */
function dicaPost(dica, m, photo) {
  return {
    kind: 'carrossel',
    pilar: 'Ensinar',
    titulo: `Carrossel: ${dica.capa.replace(/\*/g, '')}`,
    slides: [
      { layout: 'capa', eyebrow: 'DICA DE PRODUÇÃO', title: dica.capa, subtitle: dica.sub, photo },
      ...dica.itens.map(([t, b], i) => ({ layout: 'texto', num: String(i + 1).padStart(2, '0'), title: t, body: b })),
      { layout: 'cta', eyebrow: 'GOSTOU?', title: 'Salva e *manda pro parceiro* que produz', body: 'Toda semana tem dica, beat novo e bastidor aqui.', chips: ['BEATS', 'MIX', 'MASTER', 'PRODUÇÃO'], button: `SEGUE ${m.handle}` },
    ],
    caption: [
      dica.legenda,
      '',
      '💾 Salva pra consultar depois.',
      `🎧 Beats e serviços: link na bio.`,
      '',
      tags('produçãomusical', 'beatmaker', 'dicasdeprodução', 'trapbrasil', 'island27'),
    ].join('\n'),
  };
}

/**
 * Semana de lançamento do perfil (a primeira semana).
 * beats: lançamentos da fila (o primeiro é usado no Reels e no anúncio).
 */
function launchWeek(start, m, beats = []) {
  const p = m.photos || {};
  const T = m.times;
  const beat = beats[0];
  const d = (n) => addDays(start, n);
  const posts = [];

  // Dia 1: apresentação
  posts.push({
    date: at(d(0), T.feed),
    kind: 'carrossel',
    pilar: 'Apresentar',
    titulo: 'Carrossel: Da Ilha pro mundo (quem é a ISLAND27)',
    slides: [
      { layout: 'capa', eyebrow: 'PRAZER, ISLAND27', title: 'Da *Ilha* pro mundo.', subtitle: 'Label e marca musical independente do Espírito Santo. Arrasta pra conhecer.', card: p.banner, photo: p.banner ? null : p.ilha },
      { layout: 'texto', eyebrow: 'A ORIGEM', title: 'Tudo começou *numa ilha*', body: 'A ISLAND27 nasceu na *Ilha do Frade*, em Vitória (ES). Foi ali, ouvindo música e olhando a paisagem, que a criação virou extensão do lugar de onde a gente vem.', photo: p.ilha },
      { layout: 'texto', eyebrow: 'O ARTISTA', title: 'Quem tá por trás: *Bruninn*', body: 'Artista, produtor e criador independente. Compõe, produz, faz os próprios beats, grava e constrói a identidade de cada faixa *do início ao fim*.', photo: p.artista },
      { layout: 'lista', eyebrow: 'O QUE A GENTE FAZ', title: 'Da ideia solta à *faixa pronta*', items: ['Beats prontos (na SoundX) e beat por encomenda, sem preset genérico', 'Produção musical: arranjo, gravação e edição', 'Mixagem e masterização testadas em fone, caixa e carro', '4 cursos: produção, mixagem, beat e FL Studio'] },
      { layout: 'citacao', quote: 'Você pode ir pra qualquer lugar, mas *nunca deixa de carregar suas origens*.', author: 'Bruninn', photo: p.artista2 || p.artista },
      { layout: 'cta', eyebrow: 'ILHA 27 SEMPRE', title: 'Essa história está *só começando*', body: 'Beat novo toda semana aqui. Ativa as notificações pra não perder.', chips: SERVICOS, button: `SEGUE ${m.handle}` },
    ],
    caption: [
      'Prazer, ISLAND27. Da Ilha pro mundo. 🏝️',
      '',
      'Nascemos na Ilha do Frade, em Vitória (ES), e a partir de hoje este perfil vira a casa dos nossos beats, produções e bastidores.',
      '',
      'Por trás de tudo: Bruninn, artista e produtor que compõe, produz, grava e mixa do início ao fim.',
      '',
      '🎧 Beats, produção, mix, master e cursos.',
      '🔔 Ativa as notificações: beat novo toda semana.',
      '',
      tags('island27', 'produtormusical', 'beatmaker', 'espiritosanto', 'trapbrasil'),
    ].join('\n'),
  });
  posts.push({
    date: at(d(0), T.story),
    kind: 'story',
    pilar: 'Apresentar',
    titulo: 'Story: começou a nova fase',
    slides: [{ layout: 'story', eyebrow: 'NOVA FASE', title: 'Tudo começou *numa ilha*.', body: 'E essa história está só começando. Post novo no perfil.', card: p.banner, photo: p.ilha, footer: 'TOQUE NO POST ↓' }],
    caption: '',
    notes: 'No app: adicione o sticker do post de hoje (compartilhar post nos Stories) por cima do espaço em branco.',
  });

  // Dia 2: Reels gravado (cook-up) + enquete
  posts.push({
    date: at(d(1), T.reels),
    kind: 'reels-gravar',
    pilar: 'Bastidores',
    titulo: `Reels gravado: ${ROTEIROS.cookup.titulo}`,
    roteiro: ROTEIROS.cookup.roteiro,
    caption: ['Do zero ao beat pronto 🔥', '', 'Comenta “BEAT” que eu te mando o link no direct.', '', tags('cookup', 'beatmaker', 'flstudio', 'typebeat', 'island27')].join('\n'),
  });
  posts.push({
    date: at(d(1), T.story),
    kind: 'story',
    pilar: 'Conversar',
    titulo: 'Story: enquete do próximo beat',
    slides: [{ layout: 'story', eyebrow: 'VOCÊS DECIDEM', title: 'Qual o *próximo beat*?', body: 'Vota aqui embaixo. O mais votado sai essa semana.', photo: p.artista, footer: 'VOTA ↓' }],
    caption: '',
    notes: 'No app: adicione o sticker de ENQUETE com as opções “TRAP” e “FUNK” no espaço livre.',
  });

  // Dia 3: carrossel de dica (vira Reels também)
  const dica = dicaPost(DICAS[0], m, p.artista);
  posts.push({ ...dica, date: at(d(2), T.feed) });
  posts.push({ ...dica, date: at(d(2), T.reels), kind: 'reels-carrossel', titulo: `Reels (carrossel em vídeo): ${DICAS[0].capa.replace(/\*/g, '')}`, audio: beat && beat.audioPath, audioStart: beat && beat.analysis ? beat.analysis.dropStart : 0 });

  // Dia 4: história (gravado) + contagem para o beat
  posts.push({
    date: at(d(3), T.reels),
    kind: 'reels-gravar',
    pilar: 'Bastidores',
    titulo: `Reels gravado: ${ROTEIROS.historia.titulo}`,
    roteiro: ROTEIROS.historia.roteiro,
    caption: ['Tudo começou numa ilha. 🏝️', '', 'Da Ilha do Frade pro mundo. Segue pra acompanhar.', '', tags('island27', 'produtormusical', 'vitoriaes', 'espiritosanto', 'musicaindependente')].join('\n'),
  });
  posts.push({
    date: at(d(3), T.story),
    kind: 'story',
    pilar: 'Beats',
    titulo: 'Story: beat novo amanhã',
    slides: [{ layout: 'story', eyebrow: 'AMANHÃ ÀS 18H30', title: beat ? `*${beat.nome}* sai amanhã` : 'Beat novo *amanhã*', body: 'Ativa o lembrete pra ouvir primeiro.', cover: beat && beat.coverPath, card: beat ? null : p.banner, footer: 'ATIVA O LEMBRETE ↓' }],
    caption: '',
    notes: 'No app: adicione o sticker de CONTAGEM REGRESSIVA (para amanhã 18h30).',
  });

  // Dia 5: beat novo (Reels do Beat Launcher) + post do beat
  posts.push({
    date: at(d(4), T.reels),
    kind: 'reels-beat',
    pilar: 'Beats',
    titulo: beat ? `Reels do beat: ${beat.nome}` : 'Reels do beat (o primeiro beat da fila)',
    beatId: beat && beat.id,
    caption: beat && beat.texts ? beat.texts.igCaption : 'Gerado pelo Beat Launcher quando o beat entrar na fila.',
    notes: 'Publicado automaticamente pela fila de beats (aba Fila).',
  });
  posts.push({
    date: at(d(4), T.story),
    kind: 'story',
    pilar: 'Beats',
    titulo: 'Story: saiu o beat',
    slides: [{ layout: 'story', eyebrow: 'SAIU', title: beat ? `*${beat.nome}*` : 'Beat *novo* no ar', body: 'Ouve e garante a sua licença na SoundX. Link aqui embaixo.', cover: beat && beat.coverPath, card: beat ? null : p.banner, button: 'OUVIR E COMPRAR' }],
    caption: '',
    notes: 'No app: adicione o sticker de LINK (loja de beats) em cima do botão.',
  });

  // Dia 6: licenças
  posts.push({
    date: at(d(5), T.feed),
    kind: 'carrossel',
    pilar: 'Vender',
    titulo: 'Carrossel: licenças e como comprar',
    slides: [
      { layout: 'capa', eyebrow: 'BEATS ISLAND27', title: 'Como *comprar seu beat* (sem complicação)', subtitle: 'Licenças, preços e o passo a passo.', photo: p.artista },
      { layout: 'precos', eyebrow: 'LICENÇAS', title: 'Escolha a *sua licença*', rows: licencaRows(m), note: 'Todas com o crédito “Prod. ISLAND27”. Compra na SoundX (link na bio) ou pelo direct.' },
      { layout: 'lista', eyebrow: 'PASSO A PASSO', title: 'Em *3 passos*', items: ['Escolhe o beat na SoundX (link na bio) ou manda “BEAT” no direct', 'Escolhe a licença que combina com o seu lançamento', 'Recebe os arquivos e a licença com o crédito “Prod. ISLAND27”'] },
      { layout: 'cta', eyebrow: 'DÚVIDA?', title: 'Chama no *direct*', body: 'Te ajudo a escolher o beat e a licença certa pro seu lançamento.', chips: ['SOUNDX', 'DIRECT', 'BEAT POR ENCOMENDA'], button: 'MANDA “BEAT” NO DIRECT' },
    ],
    caption: ['Quer um beat da ISLAND27? É assim que funciona 👇', '', '🎧 Básica, Premium, Trackout ou Exclusiva.', '🛒 Catálogo completo na SoundX: link na bio.', '💬 Ou manda “BEAT” no direct que eu te ajudo a escolher.', '', tags('beatsforsale', 'typebeat', 'beatmaker', 'trapbrasil', 'island27')].join('\n'),
  });

  // Dia 7: produção para quem leva a sério + enquete que qualifica
  posts.push({
    date: at(d(6), T.feed),
    kind: 'carrossel',
    pilar: 'Serviços',
    titulo: 'Carrossel: produção musical para quem leva a sério',
    slides: [
      { layout: 'capa', eyebrow: 'PRODUÇÃO MUSICAL', title: 'Pra quem já sabe *o que quer*.', subtitle: 'Do seu som à sua evolução. Arrasta.', photo: p.artista2 || p.artista },
      { layout: 'lista', eyebrow: 'É PRA VOCÊ SE', title: 'Esse trabalho é *pra você* se…', items: ['Você já lançou música e quer subir o nível', 'Tem referência do som que quer', 'Quer uma faixa pronta pra lançar, não só um rascunho'] },
      { layout: 'lista', eyebrow: 'O QUE ENTRA', title: 'Do jeito que você *ouviu na cabeça*', items: ['Beat exclusivo a partir da sua referência', 'Arranjo, estrutura e direção na gravação', 'Mix e master com volume de lançamento', 'Tudo feito por quem também é artista'] },
      { layout: 'cta', eyebrow: 'VAGAS LIMITADAS', title: 'Me manda *2 músicas* suas', body: 'Manda no direct seus links, a referência e o objetivo. Eu respondo com a proposta.', chips: ['PRODUÇÃO', 'MIX', 'MASTER'], button: 'CHAMA NO DIRECT' },
    ],
    caption: ['Produção musical completa, pra quem já leva a música a sério. 🎚️', '', 'Beat exclusivo, direção de gravação, mix e master.', '📩 Manda no direct: 2 músicas suas + referência + objetivo.', '', tags('produçãomusical', 'mixagem', 'masterização', 'artistaindependente', 'island27')].join('\n'),
  });
  posts.push({
    date: at(d(6), T.story),
    kind: 'story',
    pilar: 'Conversar',
    titulo: 'Story: você já lançou música?',
    slides: [{ layout: 'story', eyebrow: 'PERGUNTA RÁPIDA', title: 'Você já *lançou música*?', body: 'Responde aqui embaixo. Tô preparando conteúdo pra cada caso.', photo: p.ilha, footer: 'RESPONDE ↓' }],
    caption: '',
    notes: 'No app: sticker de ENQUETE “JÁ LANCEI” / “AINDA NÃO”. Quem respondeu “JÁ LANCEI” vira contato pra produção.',
  });
  return posts;
}

/** Semanas seguintes: dica + beat + bastidor + prova, com rodízio do banco de dicas. */
function regularWeek(start, m, beats = [], weekIndex = 1) {
  const p = m.photos || {};
  const T = m.times;
  const d = (n) => addDays(start, n);
  const dica = dicaPost(DICAS[weekIndex % DICAS.length], m, weekIndex % 2 ? p.ilha : p.artista);
  const rot = [ROTEIROS.cookup, ROTEIROS.reacao, ROTEIROS.historia][weekIndex % 3];
  const posts = [
    { ...dica, date: at(d(0), T.feed) },
    { date: at(d(1), T.reels), kind: 'reels-gravar', pilar: 'Bastidores', titulo: `Reels gravado: ${rot.titulo}`, roteiro: rot.roteiro, caption: ['Bastidor da ISLAND27 🎛️', '', 'Comenta “BEAT” que eu te mando.', '', tags('beatmaker', 'cookup', 'produtormusical', 'island27')].join('\n') },
    { ...dica, date: at(d(2), T.reels), kind: 'reels-carrossel', titulo: `Reels (carrossel em vídeo): ${dica.slides[0].title.replace(/\*/g, '')}`, audio: beats[0] && beats[0].audioPath },
    { date: at(d(3), T.story), kind: 'story', pilar: 'Conversar', titulo: 'Story: enquete', slides: [{ layout: 'story', eyebrow: 'VOCÊS DECIDEM', title: 'Qual *vibe* no próximo?', body: 'Vota aqui embaixo.', photo: p.artista, footer: 'VOTA ↓' }], caption: '', notes: 'Sticker de ENQUETE: “PESADO” / “MELÓDICO”.' },
    { date: at(d(5), T.feed), kind: 'carrossel', pilar: 'Vender', titulo: 'Post: licenças', slides: [{ layout: 'precos', eyebrow: 'BEATS ISLAND27', title: 'Escolha a *sua licença*', rows: licencaRows(m), note: 'Catálogo na SoundX (link na bio) ou manda “BEAT” no direct.' }], caption: ['Licenças da ISLAND27 👇', '', '💬 Manda “BEAT” no direct.', '', tags('beatsforsale', 'typebeat', 'beatmaker', 'island27')].join('\n') },
  ];
  beats.slice(0, 3).forEach((b, i) => {
    posts.push({ date: at(d([1, 3, 5][i]), T.reels), kind: 'reels-beat', pilar: 'Beats', titulo: `Reels do beat: ${b.nome}`, beatId: b.id, caption: b.texts ? b.texts.igCaption : '' });
  });
  return posts;
}

/** Gera a semana. weekIndex 0 = semana de lançamento do perfil. */
function buildWeek(start, settings = {}, beats = [], weekIndex = 0) {
  const m = { ...DEFAULT_MARKETING, ...(settings.marketing || {}), times: { ...DEFAULT_MARKETING.times, ...((settings.marketing || {}).times || {}) } };
  const s = new Date(start);
  s.setHours(0, 0, 0, 0);
  const posts = weekIndex === 0 ? launchWeek(s, m, beats) : regularWeek(s, m, beats, weekIndex);
  return posts
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((p, i) => ({ id: `${s.toISOString().slice(0, 10)}-${String(i + 1).padStart(2, '0')}`, status: 'planejado', ...p }));
}


// ---------- Destaques do perfil e vitrine (o que a ISLAND27 vende) ----------

const SERVICOS_INFO = [
  {
    icon: 'producao', nome: 'Produção musical', title: 'Produção *musical*',
    body: 'Da ideia solta ao arranjo final, pra música sair exatamente como você ouviu na cabeça, com estrutura, groove e identidade própria.',
    items: ['Criação de beats e instrumentais', 'Arranjos e estrutura musical', 'Gravação e edição', 'Do zero ao resultado final'],
  },
  {
    icon: 'mix', nome: 'Mixagem', title: '*Mixagem*',
    body: 'Sua faixa ganha equilíbrio, profundidade e definição sem perder a emoção da gravação. Testada em fone, caixa e carro.',
    items: ['Equilíbrio entre os instrumentos', 'Clareza e definição', 'Mais presença e punch', 'Pronta pro master'],
  },
  {
    icon: 'master', nome: 'Masterização', title: '*Masterização*',
    body: 'O acabamento que coloca sua música lado a lado com qualquer lançamento das plataformas.',
    items: ['Mais volume e presença', 'Equalização fina', 'Compatível com todas as plataformas', 'Som pronto pro mundo'],
  },
  {
    icon: 'encomenda', nome: 'Beat por encomenda', title: 'Beat por *encomenda*',
    body: 'Um instrumental construído só pro seu projeto, a partir da sua referência e do seu estilo. Sem preset genérico, sem repetição.',
    items: ['Beat exclusivo pro seu projeto', 'Entrega no prazo combinado', 'Diversos estilos e referências', '100% original'],
  },
];

const CURSOS = ['Curso Básico de Produção', 'Curso Básico de Mixagem', 'Curso Básico de Produção de Beat', 'Curso Básico no FL Studio'];

/** Destaques fixos do perfil: cada um com capa (bolinha) + stories. Formato 9:16. */
function highlights(settings = {}) {
  const m = { ...DEFAULT_MARKETING, ...(settings.marketing || {}) };
  const p = m.photos || {};
  const H = (label, iconName, slides, notes) => ({
    kind: 'destaque', format: 'story', pilar: 'Vitrine', titulo: `Destaque: ${label}`,
    slides: [{ layout: 'destaque-capa', icon: iconName, label }, ...slides],
    caption: '', notes,
  });
  return [
    H('Beats', 'beats', [
      { layout: 'servico', icon: 'beats', eyebrow: 'BEATS ISLAND27', title: 'Beats *prontos* pro seu lançamento', body: 'Trap, funk, drill e mais. Ouve, escolhe a licença e leva o beat pro seu projeto.', items: ['Catálogo completo na SoundX', 'Licença pra cada fase do seu projeto', 'Crédito “Prod. ISLAND27”'], photo: p.artista, button: 'OUVIR NA SOUNDX', footer: 'LINK NA BIO' },
      { layout: 'precos', eyebrow: 'LICENÇAS', title: 'Escolha a *sua licença*', rows: licencaRows(m), note: 'Compra na SoundX (link na bio) ou manda “BEAT” no direct.' },
      { layout: 'lista', eyebrow: 'COMO COMPRAR', title: 'Em *3 passos*', items: ['Escolhe o beat na SoundX (link na bio)', 'Escolhe a licença', 'Recebe os arquivos com a licença'] },
    ], 'Capa: 1ª imagem. Depois os stories na ordem. No story 1, coloque o sticker de LINK da SoundX sobre o botão.'),
    H('Serviços', 'mix', [
      ...SERVICOS_INFO.map((sv) => ({ layout: 'servico', icon: sv.icon, eyebrow: 'SERVIÇOS ISLAND27', title: sv.title, body: sv.body, items: sv.items, button: 'PEDIR ORÇAMENTO', footer: 'MANDA NO DIRECT' })),
      { layout: 'story', eyebrow: 'DE PONTA A PONTA', title: 'Feito por *quem também é artista*.', body: 'Com o mesmo cuidado que o Bruninn coloca nas próprias faixas, do primeiro ajuste à entrega.', photo: p.artista2 || p.artista, button: 'CHAMA NO DIRECT' },
    ], 'Capa: 1ª imagem. Nos stories, adicione o sticker de LINK do WhatsApp/direct sobre “PEDIR ORÇAMENTO”, se quiser.'),
    H('Cursos', 'cursos', [
      { layout: 'servico', icon: 'cursos', eyebrow: 'CURSOS ISLAND27', title: 'Aprenda a *produzir*', body: '4 cursos pra você dominar a produção musical, do zero ao avançado.', items: CURSOS, button: 'QUERO SABER MAIS', footer: 'MANDA “CURSO” NO DIRECT' },
    ], 'Capa: 1ª imagem.'),
    H('Sobre', 'sobre', [
      { layout: 'story', eyebrow: 'PRAZER, ISLAND27', title: 'Da *Ilha* pro mundo.', body: 'Label e marca musical independente do Espírito Santo.', card: p.banner, photo: p.ilha },
      { layout: 'story', eyebrow: 'A ORIGEM', title: 'Tudo começou *numa ilha*.', body: 'Ilha do Frade, Vitória (ES). A criação como extensão do lugar de onde a gente vem.', photo: p.ilha, dim: 'top' },
      { layout: 'story', eyebrow: 'O ARTISTA', title: '*Bruninn*', body: 'Compõe, produz, faz os próprios beats, grava e constrói cada faixa do início ao fim.', photo: p.artista, dim: 'top' },
    ], 'Capa: 1ª imagem.'),
    H('Contato', 'contato', [
      { layout: 'servico', icon: 'contato', eyebrow: 'FALA COM A GENTE', title: 'Bora *trabalhar junto*?', body: 'Serviços, cursos, parcerias ou só uma ideia solta. Conta o que você precisa.', items: [`Direct: ${m.handle}`, 'YouTube: @Bruninn027', 'Beats: SoundX (link na bio)'], button: 'MANDA MENSAGEM' },
    ], 'Capa: 1ª imagem.'),
  ];
}

/** Vitrine no feed: carrossel com os serviços (para fixar no perfil). */
function servicesCarousel(settings = {}) {
  const m = { ...DEFAULT_MARKETING, ...(settings.marketing || {}) };
  const p = m.photos || {};
  return {
    kind: 'carrossel', pilar: 'Vitrine', titulo: 'Carrossel fixado: o que a ISLAND27 faz por você',
    slides: [
      { layout: 'capa', eyebrow: 'SERVIÇOS ISLAND27', title: 'Do seu som à *sua evolução*.', subtitle: 'Beats, produção, mix, master e cursos. Arrasta.', card: p.banner, photo: p.banner ? null : p.artista },
      ...SERVICOS_INFO.map((sv, i) => ({ layout: 'lista', eyebrow: `${String(i + 1).padStart(2, '0')} · ${sv.nome.toUpperCase()}`, title: sv.title, items: sv.items })),
      { layout: 'lista', eyebrow: '05 · BEATS PRONTOS', title: 'Beats *na SoundX*', items: ['Trap, funk, drill e mais', 'Licenças a partir da Básica até a Exclusiva', 'Crédito “Prod. ISLAND27”'] },
      { layout: 'cta', eyebrow: 'ORÇAMENTO', title: 'Feito por *quem também é artista*', body: 'Manda no direct o que você precisa: serviço, referência e prazo.', chips: SERVICOS, button: 'CHAMA NO DIRECT' },
    ],
    caption: [
      'Do seu som à sua evolução. 🎚️',
      '',
      'Tudo o que a ISLAND27 faz por você:',
      '🎹 Produção musical',
      '🎛️ Mixagem',
      '🔊 Masterização',
      '🎧 Beat por encomenda',
      '🛒 Beats prontos na SoundX (link na bio)',
      '🎓 Cursos de produção, mix e FL Studio',
      '',
      '📩 Orçamento no direct: conta o serviço, a referência e o prazo.',
      '',
      tags('produçãomusical', 'mixagem', 'masterização', 'beatmaker', 'island27'),
    ].join('\n'),
    notes: 'Depois de publicar, fixe este post no topo do perfil (… → Fixar no perfil).',
  };
}

const KIND_LABEL = {
  carrossel: 'Carrossel (feed)',
  imagem: 'Post (feed)',
  story: 'Story',
  'reels-carrossel': 'Reels (carrossel em vídeo)',
  'reels-beat': 'Reels do beat',
  'reels-gravar': 'Reels pra gravar',
  destaque: 'Destaque do perfil',
};

module.exports = { buildWeek, highlights, servicesCarousel, SERVICOS_INFO, DEFAULT_MARKETING, DICAS, ROTEIROS, KIND_LABEL, addDays };
