# MelodyForge — edição ISLAND27 (v2.0)

Gerador de ideias musicais (melodia, baixo e acordes) por algoritmo genético,
com exportação MIDI, em duas versões que compartilham o mesmo motor:

- **App web** — `melodyforge-ultimate.html` (ou o arquivo único `dist/MelodyForge-ISLAND27.html`, funciona offline).
- **Plugin VST3 / app Windows** — `plugin/` (JUCE). Pacote pronto: `dist/MelodyForge-ISLAND27-windows-x64.zip`.

Baseado no [MelodyForge](README.md) original (MIT, © 2025 James The Giblet), reescrito a partir da
auditoria: o motor antigo não avaliava a música, destruía o andamento ao evoluir, montava acordes
fora do tom e exportava JSON em vez de MIDI.

## Como funciona

1. Cada ideia é um **genoma**: tom, escala, progressão, BPM, 10 genes contínuos (densidade, síncope,
   graus conjuntos, extensão, contorno, repetição, complexidade dos acordes, movimento do baixo, swing,
   dinâmica) e três **sementes** (melodia, baixo, acordes).
2. O **compositor** transforma o genoma em notas de forma determinística: mesma ideia = mesmas notas,
   então o que você ouve é exatamente o que exporta.
3. A **avaliação** ouve o resultado: notas na escala, nota do acorde no tempo forte, graus conjuntos e
   saltos, extensão, resolução na tônica, repetição de motivo, condução de vozes, densidade e síncope —
   mais as suas curtidas.
4. A **evolução** usa torneio, cruzamento, mutação por tipo de gene, elitismo e alguns candidatos novos
   por geração (para não convergir cedo).

## Estilos e climas

| Estilos | Climas |
|---|---|
| Free, Trap, Lo-fi, Pop, R&B, Funk BR, Reggaeton, House, Ambient, Jazz | Neutral, Happy, Sad, Dark, Dreamy, Energetic, Chill |

O **estilo** define a faixa de BPM, o ritmo dos acordes e as metas de densidade/síncope/repetição; o
**clima** escolhe as escalas, as progressões, o contorno da melodia e a energia. Travas (tom, escala,
progressão, BPM) têm prioridade sobre os presets.

## Modos

- **Beginner** — estilo, clima, tom, *Generate ideas*, play, like/skip, nova variação por camada e exportação.
- **Advanced** — tudo: evolução automática, foco da avaliação, semente da sessão, limites de candidatos
  (compassos, candidatos por geração, notas por compasso, extensão da melodia), travas, acorde por
  compasso, transposição e, no app web, edição nota a nota no piano roll.

## Plugin no FL Studio

Veja `dist/windows/LEIA-ME.txt`. Resumo: copie a pasta `MelodyForge ISLAND27.vst3` para
`C:\Program Files\Common Files\VST3\`, adicione como gerador e **arraste os blocos
All layers / Melody / Bass / Chords** para o piano roll ou a playlist. O plugin também envia as notas
como MIDI (canais 1–3) sincronizadas ao play do FL e tem um som de prévia simples.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `core/melodyforge-core.js` | Motor musical puro (sem DOM, sem áudio) |
| `app/melodyforge-app.js` | Interface web + áudio (Tone.js 14.8.49 empacotado em `vendor/`) |
| `plugin/Source/MelodyCore.h` | Port C++ do motor (idêntico bit a bit ao JS) |
| `plugin/Source/Presets.h` | Estilos e climas em C++ |
| `plugin/Source/PluginProcessor.*`, `PluginEditor.*` | Plugin JUCE |
| `tests/` | Testes do núcleo, ponta a ponta, vetores de referência e verificação de MIDI |
| `tools/build_single_file.py` | Gera o HTML de arquivo único |

## Testes

```bash
cd melodyforge
npm install                         # Playwright (teste ponta a ponta)
npm test                            # 56 testes do núcleo + 56 verificações no Chromium
node tests/make_golden.js           # regenera os vetores de referência

cd plugin
cmake -S . -B build -G Ninja && cmake --build build
ctest --test-dir build              # golden C++ (662 verificações) + processador (25 verificações)
```

Windows a partir do Linux: `scripts/build-windows-mingw.sh melodyforge`.

## Limitações conhecidas

- O plugin foi testado com um host simulado, como app independente e no Wine; ainda não num FL Studio real.
- A prévia sonora é propositalmente simples (seno); timbres de verdade ficam para a próxima etapa.
- No plugin, a edição é por acorde, camada e transposição; edição nota a nota só no app web.
- Nomes de notas usam sustenidos (A# em vez de Bb).
- O README/FEATURES originais descrevem a versão 1.0 e não refletem esta edição.
