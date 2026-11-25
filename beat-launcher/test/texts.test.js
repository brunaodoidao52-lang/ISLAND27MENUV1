const test = require('node:test');
const assert = require('node:assert');
const T = require('../src/shared/texts');
const S = require('../src/shared/schedule');

const now = new Date('2026-11-25T10:00:00');

test('título do YouTube usa artista ou gênero e respeita 100 caracteres', () => {
  const a = T.generate({ nome: 'Noite', artista: 'Veigh', genero: 'Trap' }, {}, now);
  assert.strictEqual(a.ytTitle, '[GRÁTIS] Veigh Type Beat 2026 - "Noite" | Prod. ISLAND27');
  const b = T.generate({ nome: 'Noite', genero: 'Funk' }, {}, now);
  assert.match(b.ytTitle, /^\[GRÁTIS\] Funk Type Beat 2026/);
  const c = T.generate({ nome: 'X'.repeat(120), artista: 'Veigh' }, {}, now);
  assert.ok(c.ytTitle.length <= 100);
});

test('linhas com campo vazio somem da descrição', () => {
  const t = T.generate({ nome: 'Noite', genero: 'Trap', bpm: 140 }, { links: { loja: 'https://loja' } }, now);
  assert.match(t.ytDescription, /https:\/\/loja/);
  assert.doesNotMatch(t.ytDescription, /WhatsApp/);
  assert.doesNotMatch(t.ytDescription, /Tom:/);
  assert.match(t.ytDescription, /BPM: 140/);
  assert.doesNotMatch(t.ytDescription, /\n\n\n/);
});

test('tags cabem no limite de 500 caracteres do YouTube', () => {
  const tags = T.ytTags({ nome: 'Um nome bem comprido de beat', artista: 'Artista Com Nome Grande', genero: 'Trap Funk' }, now);
  assert.ok(T.tagsLength(tags) <= 500);
  assert.ok(tags.includes('artista com nome grande type beat'));
});

test('no máximo 5 hashtags no Instagram', () => {
  const t = T.generate({ nome: 'Noite', artista: 'Veigh', genero: 'Trap' }, {}, now);
  const tags = t.igCaption.match(/#\w+/g);
  assert.ok(tags.length <= 5);
  assert.ok(tags.includes('#veightypebeat'));
});

test('nome e dados a partir do arquivo e do .txt', () => {
  assert.strictEqual(T.nameFromFile('C:\\beats\\noite_fria-140bpm.mp3'), 'Noite Fria');
  assert.deepStrictEqual(T.parseSidecar('artista: Veigh\ngênero: trap funk\nBPM = 140\ntom: Cm'), { artista: 'Veigh', genero: 'Trap Funk', bpm: 140, tom: 'Cm' });
});

test('horários: um beat por horário, pulando o que já passou e o que está ocupado', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'x', when: new Date('2026-11-25T18:00:00').toISOString() }];
  const plan = S.distribute(items, { slots: ['12:00', '18:00', '21:00'], leadMinutes: 30 }, now);
  assert.deepStrictEqual(
    plan.map((p) => [p.id, p.when.getHours(), p.when.getDate()]),
    [['a', 12, 25], ['b', 21, 25], ['c', 12, 26]],
  );
  const late = S.distribute([{ id: 'a' }], { slots: '12:00', leadMinutes: 30 }, new Date('2026-11-25T11:45:00'));
  assert.strictEqual(late[0].when.getDate(), 26, 'sem folga suficiente vai para o dia seguinte');
  const weekdays = S.distribute([{ id: 'a' }], { slots: ['12:00'], days: [1] }, now); // só segunda
  assert.strictEqual(weekdays[0].when.getDay(), 1);
  assert.deepStrictEqual(S.formatSlots('9h, 21:30;18:00'), ['09:00', '18:00', '21:30']);
});
