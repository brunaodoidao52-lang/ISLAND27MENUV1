# ISLAND27 Beat Launcher

Você manda o **beat**, a **capa** e o **nome**. O Launcher faz o resto:

| O que ele gera | Como fica |
|---|---|
| **Vídeo do YouTube** | 1920x1080, beat completo, capa animada no ritmo, nome, “type beat”, BPM/tom, forma de onda e barra de progresso |
| **Reels do Instagram** | 1080x1920, só o **drop** (ele acha sozinho a parte mais forte), frase de gancho no topo, capa pulsando na batida e “COMENTA "BEAT"” |
| **Miniatura** | 1280x720 com “GRÁTIS”, nome grande e capa |
| **Textos** | Título no padrão “type beat” (até 100 caracteres), descrição com links de compra, tags (até 500 caracteres) e legenda com até 5 hashtags |
| **Loop da capa** | Clipe de 5 a 15 s que emenda sem pulo (respirar, pulso na batida ou deriva) em 9:16, 1:1, 4:5 ou 16:9 |

Tudo nas cores e fontes do site da ISLAND27 (azul `#7FE3FF` / `#2AA9E0` sobre preto, Space Grotesk + IBM Plex Sans).

## Marketing do Instagram (aba Marketing)

| O que ele gera | Como fica |
|---|---|
| **Vitrine do perfil** | Carrossel de serviços para fixar no topo + 5 **Destaques** (Beats, Serviços, Cursos, Sobre, Contato) com capa (bolinha) e stories |
| **Semana de posts** | Carrosséis (apresentação, dicas, licenças, produção), Reels de carrossel em vídeo, Stories (enquete, contagem, lançamento), roteiros de Reels para gravar e o Reels do beat da fila |
| **Legendas** | Prontas, com no máximo 5 hashtags |

Na aba **Marketing** você escolhe as fotos (Bruninn, lugar, banner), confere os **preços das licenças** e clica em **Planejar a semana** ou **Gerar vitrine**. Cada post ganha uma pasta com as imagens, a legenda e as instruções.

- O **Reels de carrossel** pode sair sozinho pela API do Instagram (opção na aba).
- **Stories com sticker** (enquete, contagem, link) e **posts de imagem** precisam ser postados pelo app do Instagram: a API não aceita stickers nem foto enviada direto do computador. Na hora marcada o app avisa ("Hora de postar!") com a legenda pronta para copiar.

Pela linha de comando:

```bash
node src/cli.js vitrine --artista foto.jpg --artista2 foto2.jpg --ilha lugar.jpg --banner banner.png --saida ./vitrine
node src/cli.js semana --inicio 2026-11-27 --numero 0 --artista foto.jpg --ilha lugar.jpg --banner banner.png --saida ./semana
```

`--numero 0` é a semana de lançamento do perfil; 1, 2, 3… são semanas normais (dicas em rodízio).

## IA (modo teste)

Em **Configurações → IA**, conecte a sua API: **DeepSeek** (padrão: `https://api.deepseek.com`, modelo `deepseek-v4-flash`) ou qualquer API compatível com o formato OpenAI (`/chat/completions`). Ela começa **desligada**.

Ligada, a IA:
- sugere **título, descrição, legenda e frase do Reels** de cada beat (no detalhe do beat: "Pedir sugestão à IA" → "Usar a sugestão");
- **reescreve legendas** dos posts (aba Marketing → "✦ Reescrever com IA");
- dá **ideias de conteúdo** (aba Marketing → "Pedir 5 ideias").

As sugestões só entram quando você aprova, a não ser que ligue "aplicar sozinho". O app confere os limites de qualquer jeito: título com até 100 caracteres, links da descrição preservados e no máximo 5 hashtags. A chave fica criptografada no computador.

## Visual dos vídeos e miniaturas

- **Visualizador:** "Onda" (forma de onda) ou "Barras" (espectro de frequências), em Configurações → Vídeos.
- **Miniatura B:** versão minimalista (capa grande e até 3 palavras), gerada junto da principal, para usar no **"Testar e comparar"** do YouTube Studio.

## Como funciona o lançamento automático

1. **Entrada:** arraste os arquivos na tela ou jogue na **pasta de entrada**. Beat e capa com o mesmo nome viram um lançamento (`Noite.mp3` + `Noite.jpg`). Um `Noite.txt` opcional com `artista: Veigh`, `genero: Trap`, `bpm: 140` e `tom: Cm` preenche o resto. Um vídeo com o mesmo nome (`Noite.mp4`) vira o fundo.
2. **Geração:** o app analisa o beat (BPM e drop) e gera os vídeos, a miniatura e os textos.
3. **Horários:** cada beat ganha o próximo horário livre (padrão 12:00, 18:00 e 21:00, um beat por horário). Com o **Piloto automático** ligado, isso acontece sozinho.
4. **YouTube:** o vídeo sobe na hora, já **agendado** no próprio YouTube (sai no horário mesmo com o PC desligado).
5. **Instagram:** o Reels é publicado quando chega o horário. A API do Instagram não aceita agendamento, então o app precisa estar aberto ou na bandeja (ele fica lá quando você fecha a janela).

O **Modo teste** vem ligado: faz tudo, menos publicar de verdade. Desligue quando conectar as contas.

## Conectar as contas (uma vez só)

**YouTube:** crie um projeto em console.cloud.google.com, ative a *YouTube Data API v3*, configure a tela de consentimento (tipo Externo) e crie um *ID do cliente OAuth* do tipo **App para computador**. Cole o Client ID e o Secret no app e clique em *Conectar*. O passo a passo também está dentro do app, em Configurações.

- Enquanto o projeto do Google estiver em “Teste”, a conexão vence a cada 7 dias. Clique em *Publicar app* na tela de consentimento para não vencer.
- Projetos novos sobem vídeos como **privados** até passar pela auditoria gratuita do YouTube. Até lá, o vídeo sobe com tudo pronto e você só muda para público no YouTube Studio.

**Instagram:** conta **Profissional** (Criador ou Empresa) + um app em developers.facebook.com com *Instagram → API com login do Instagram*. Gere o token, cole com o ID da conta e clique em *Salvar e testar*. O app renova o token sozinho antes de vencer.

## Rodar sem janela (linha de comando)

```bash
cd beat-launcher
npm install

# um beat
node src/cli.js gerar --beat noite.mp3 --capa noite.jpg --nome "Noite" --artista Veigh --genero Trap --tom Cm

# uma pasta inteira (pares com o mesmo nome)
node src/cli.js pasta ./meus-beats --saida ./prontos

# loop da capa
node src/cli.js loop --imagem capa.jpg --formato 9:16 --segundos 8 --estilo pulso --bpm 140
```

Os vídeos e um `textos.txt` (título, descrição, tags e legenda) vão para a pasta de saída.

## Desenvolvimento

Requer Node.js 20 ou mais recente.

```bash
npm install
npm start      # abre o app
npm test       # testes (FFmpeg de verdade + servidores falsos do YouTube e do Instagram)
npm run dist   # gera o instalador do sistema atual em dist/
```

Para gerar os executáveis de Windows, macOS e Linux de uma vez, rode o workflow **ISLAND27 Beat Launcher - instaladores** na aba *Actions* do GitHub (ou crie uma tag `launcher-v1.0.0`).

### Estrutura

```
src/shared/texts.js      títulos, descrições, tags, legendas e hashtags
src/shared/schedule.js   distribuição nos horários do dia
src/main/ffmpeg.js       análise do beat (BPM, batida, drop) e montagem dos vídeos (mesma base do ISLAND27 Editor)
src/main/design.js       artes em SVG -> PNG (resvg) com as fontes e cores da ISLAND27
src/main/pipeline.js     do beat aos arquivos prontos; loop da capa
src/main/engine.js       fila, pasta de entrada, piloto automático e publicação
src/main/youtube.js      login OAuth, envio retomável com agendamento e miniatura
src/main/instagram.js    publicação de Reels e Stories em vídeo com upload direto do computador
src/main/posts.js        modelos de post (feed 4:5, stories 9:16, Destaques) e carrossel em vídeo
src/main/marketing.js    gera a semana/vitrine em pastas + CALENDARIO.md
src/main/ai.js           IA em modo teste (DeepSeek/OpenAI): sugestões, legendas e ideias
src/shared/plan.js       plano de conteúdo: semana de lançamento, semanas normais, Destaques e textos da marca
src/main/main.js         app Electron: janela, bandeja, notificações
src/renderer/            interface
src/cli.js               linha de comando
```

Fontes: Space Grotesk e IBM Plex Sans, licença SIL Open Font License (arquivos em `assets/fonts`).
