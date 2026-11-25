// Distribui os beats da fila nos horários do dia (ex.: 12:00, 18:00, 21:00), um beat por horário.
// Usa o relógio do computador (horário local).

const DEFAULT_SLOTS = ['12:00', '18:00', '21:00'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function parseSlots(slots) {
  const list = (Array.isArray(slots) ? slots : String(slots || '').split(/[,;\s]+/))
    .map((s) => /^(\d{1,2})[:h](\d{2})?$/.exec(String(s).trim()))
    .filter(Boolean)
    .map((m) => ({ h: Number(m[1]), m: Number(m[2] || 0) }))
    .filter((t) => t.h < 24 && t.m < 60);
  const uniq = [...new Map(list.map((t) => [t.h * 60 + t.m, t])).values()];
  return uniq.sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));
}

function formatSlots(slots) {
  return parseSlots(slots).map((t) => `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`);
}

/**
 * Próximos horários livres a partir de "from".
 * taken: horários já ocupados (timestamps em ms) - não são repetidos.
 */
function nextFreeSlots(from, slotsIn, count, { taken = [], days = ALL_DAYS, maxDays = 400 } = {}) {
  const slots = parseSlots(slotsIn);
  if (!slots.length || count <= 0) return [];
  const busy = new Set(taken.map((t) => Math.floor(new Date(t).getTime() / 60000)));
  const out = [];
  const day = new Date(from);
  day.setHours(0, 0, 0, 0);
  for (let d = 0; d < maxDays && out.length < count; d++) {
    if (days.includes(day.getDay())) {
      for (const s of slots) {
        const at = new Date(day);
        at.setHours(s.h, s.m, 0, 0);
        if (at.getTime() < from.getTime()) continue;
        const key = Math.floor(at.getTime() / 60000);
        if (busy.has(key)) continue;
        busy.add(key);
        out.push(at);
        if (out.length >= count) break;
      }
    }
    day.setDate(day.getDate() + 1);
  }
  return out;
}

/**
 * Dá um horário para cada beat sem horário, na ordem da fila.
 * leadMinutes: folga mínima entre agora e o primeiro horário (tempo de enviar o vídeo).
 * Retorna [{ id, when: Date }].
 */
function distribute(items, settings = {}, now = new Date()) {
  const lead = (settings.leadMinutes ?? 30) * 60000;
  const days = settings.days && settings.days.length ? settings.days : ALL_DAYS;
  const taken = items.filter((i) => i.when).map((i) => i.when);
  const pending = items.filter((i) => !i.when);
  const times = nextFreeSlots(new Date(now.getTime() + lead), settings.slots || DEFAULT_SLOTS, pending.length, { taken, days });
  return pending.slice(0, times.length).map((it, k) => ({ id: it.id, when: times[k] }));
}

module.exports = { DEFAULT_SLOTS, parseSlots, formatSlots, nextFreeSlots, distribute };
