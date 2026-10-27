# ISLAND27 Editor

Editor de vídeo completo para computador (Windows, macOS e Linux), feito do zero com código próprio. Tudo liberado: sem marca d'água, sem anúncios, sem assinatura, exportação em até 4K 60 fps.

## Recursos

| Categoria | O que dá para fazer |
|---|---|
| **Montagem** | Importar vídeos e fotos (botão ou arrastar e soltar), reordenar arrastando, cortar puxando as bordas, dividir (`S`), duplicar, excluir, congelar quadro |
| **Tela** | Proporções Original, 9:16 (Reels/TikTok/Shorts), 16:9 (YouTube), 1:1, 4:5, 4:3, 3:4, 21:9, 2:3 |
| **Fundo** | Desfoque do próprio vídeo (intensidade ajustável) ou cor sólida |
| **Velocidade** | 0,1x a 10x, com o áudio acompanhando sem mudar o tom |
| **Reverso** | Vídeo e áudio de trás para frente |
| **Volume** | 0% a 200% por clipe, mudo, aplicar a todos |
| **Filtros** | 18 filtros (Vívido, Quente, Frio, P&B, Noir, Sépia, Vintage, Cinema, Pôr do sol…) com intensidade |
| **Ajustes** | Brilho, contraste, saturação, matiz, temperatura e vinheta |
| **Zoom / enquadrar** | Ajustar ou preencher, zoom até 4x e reposicionar arrastando na prévia |
| **Girar / espelhar** | 90°, 180°, 270°, espelho horizontal e vertical |
| **Transições** | 25 transições (esmaecer, dissolver, deslizar, varrer, círculo, zoom, pixelar, desfoque…) com duração ajustável |
| **Texto** | Várias fontes, 8 estilos prontos, cor, contorno, sombra, caixa de fundo, rotação, opacidade, animação de entrada/saída e posição arrastando na prévia |
| **Figurinhas** | Mais de 100 emojis em 6 categorias, com tamanho, rotação e tempo na tela |
| **Música e áudio** | Várias faixas de música, extrair o áudio de um vídeo, gravar narração pelo microfone, volume, fade in/out, loop, dividir faixa |
| **Projeto** | Desfazer/refazer ilimitado, salvar e abrir projetos (`.i27proj`) |
| **Exportação** | MP4 (H.264 + AAC) em 480p, 720p, 1080p, 2K ou 4K, com 24, 25, 30, 50 ou 60 fps e 4 níveis de qualidade |

Formatos aceitos: MP4, MOV, M4V, WEBM, MKV, AVI, WMV, FLV, 3GP, MTS, MPG, GIF, JPG, PNG, WEBP, BMP, TIFF, HEIC, MP3, M4A, AAC, WAV, OGG, OPUS e FLAC. Formatos que o reprodutor interno não abre (como AVI ou HEVC) são convertidos automaticamente para uma cópia de prévia; a exportação sempre usa o arquivo original.

## Instalar (usuários)

Baixe o instalador na página **Releases** do repositório ou em **Actions > ISLAND27 Editor - instaladores > Artifacts**:

- **Windows:** `ISLAND27-Editor-Setup-x.y.z.exe`. Execute e siga o assistente. Ele cria atalhos na área de trabalho e no menu Iniciar. Se o SmartScreen avisar, clique em *Mais informações > Executar assim mesmo* (o app não tem assinatura digital paga).
- **macOS:** `ISLAND27-Editor-x.y.z-arm64.dmg` (Apple M1/M2/M3/M4) ou `-x64.dmg` (Intel). Arraste o app para *Aplicativos*. Na primeira vez, clique com o botão direito no app e escolha *Abrir*.
- **Linux:** `ISLAND27-Editor-x.y.z-x86_64.AppImage` (dê permissão de execução e abra) ou `ISLAND27-Editor-x.y.z-amd64.deb` (`sudo apt install ./ISLAND27-Editor-*.deb`).

O FFmpeg já vem embutido; não é preciso instalar mais nada.

## Atalhos

| Tecla | Ação |
|---|---|
| Espaço | Reproduzir / pausar |
| ← / → | Quadro anterior / próximo (Shift: 1 segundo) |
| Home / End | Início / fim |
| S | Dividir no cursor |
| Delete | Excluir item selecionado |
| Ctrl+Z / Ctrl+Y | Desfazer / refazer |
| Ctrl+D | Duplicar |
| Ctrl+S / Ctrl+O / Ctrl+N | Salvar / abrir / novo projeto |
| Ctrl+E | Exportar |
| Ctrl + roda do mouse | Zoom da linha do tempo |

## Desenvolvimento

Requer Node.js 20 ou mais recente.

```bash
cd video-editor
npm install
npm start          # abre o editor
npm test           # testes de exportação com FFmpeg real
npm run dist       # gera o instalador do sistema atual em dist/
```

Cada sistema gera o próprio instalador: o FFmpeg embutido é baixado para a plataforma em que o `npm install` roda. Para gerar os três de uma vez, use o workflow do GitHub Actions `.github/workflows/editor-instaladores.yml`: rode-o manualmente ou crie uma tag `editor-v1.0.0` para publicar uma Release.

### Estrutura

```
src/shared/project.js   modelo do projeto: linha do tempo, filtros, transições, enquadramento
src/main/main.js        processo principal do Electron: janelas, diálogos, arquivos
src/main/ffmpeg.js      leitura de mídia, miniaturas, prévias e montagem do comando de exportação
src/main/preload.js     ponte segura entre a interface e o processo principal
src/renderer/           interface: prévia em canvas, linha do tempo, painéis e ferramentas
test/                   testes de ponta a ponta da exportação
```

A prévia (canvas) e a exportação (FFmpeg) usam as mesmas contas de `project.js` para posição, cor e tempo, então o vídeo exportado fica igual ao que aparece na tela.
