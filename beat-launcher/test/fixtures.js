// Gera um beat de teste (140 BPM): 16 s de introdução só com acordes e depois o drop com kick, chimbal e 808.
const path = require('path');
const fs = require('fs');
const ff = require('../src/main/ffmpeg');

async function makeBeat(out, { bpm = 140, intro = 16, total = 56 } = {}) {
  if (fs.existsSync(out)) return out;
  const P = (60 / bpm).toFixed(5);
  const x = `mod(t\\,${P})`;
  const kick = `sin(2*PI*(48+140*exp(-30*${x}))*${x})*exp(-5*${x})`;
  const hat = `(random(0)*2-1)*exp(-45*mod(t+${P}/2\\,${P}))*0.25`;
  const bass = `sin(2*PI*46*t)*0.28*exp(-1.2*mod(t\\,${P}*4))`;
  const pad = `0.12*(sin(2*PI*220*t)+sin(2*PI*261.6*t)+sin(2*PI*329.6*t))/3`;
  const expr = `${pad}+if(gte(t\\,${intro})\\,0.85*${kick}+${hat}+${bass}\\,0)`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const r = await ff.run(['-y', '-hide_banner', '-f', 'lavfi', '-i', `aevalsrc=${expr}:s=44100:d=${total}`, '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k', out]);
  if (r.code !== 0) throw new Error(r.stderr.slice(-800));
  return out;
}

async function makeCover(out) {
  if (fs.existsSync(out)) return out;
  const r = await ff.run(['-y', '-hide_banner', '-f', 'lavfi', '-i', 'gradients=s=900x1100:c0=0x2AA9E0:c1=0x08090c:c2=0x7FE3FF:n=3:speed=0:d=1', '-frames:v', '1', out]);
  if (r.code !== 0) throw new Error(r.stderr.slice(-800));
  return out;
}

module.exports = { makeBeat, makeCover };
