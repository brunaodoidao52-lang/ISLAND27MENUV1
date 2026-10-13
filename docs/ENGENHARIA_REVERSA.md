# Engenharia reversa: Fruity Parametric EQ 2 → Island Parametric EQ

Este documento registra **o que foi extraído do plugin original** e **como cada
item virou código** no Island Parametric EQ. Cada afirmação está marcada como:

- **Observado:** lido diretamente do binário (recurso, constante ou instrução).
- **Inferido:** dedução forte a partir de evidência observada.
- **Escolha de projeto:** decisão própria, sem equivalente verificado no original.

Nenhum código, arte ou recurso do original foi copiado. A reimplementação é
independente: só os **comportamentos e números de afinação** foram reproduzidos.

## Alvo analisado

| Item | Valor |
|---|---|
| Arquivo | `Fruity Parametric EQ 2_x64.dll` (dentro de `EQ2.rar`) |
| SHA-256 | `1ccaeed0a65672a247602920cf52f5b5e181b3dea5f1cf6ce84ed4a757492422` |
| Formato | PE32+ x86-64, Delphi (recursos `DVCLAL`/`PACKAGEINFO`) |
| Exportações | `CreatePlugInstance` (interface nativa do FL Studio), `__dbk_fcall_wrapper`, `dbkFCallWrapperAddr` |
| Classe do plugin | `TTestPlug` (strings `Fruity parametric EQ 2`, `Param. EQ 2`) |
| Info | "A full 7 band parametric equalizer." |

**Ferramentas:** REA (`rea-agents@6.4.0`) para inventário de artefato e árvore de
recursos PE (`inspect-artifact` e `inspect-pe-resources`, evidências
`ev_9ccc3a6d…` e `ev_0725b564…`). O Ghidra não estava acessível no ambiente
(GitHub bloqueado pela política de rede), então a análise de código usou
`pefile`, `capstone` e `radare2`, com limites de função tirados da tabela
`.pdata`. Também foi escrito um decodificador próprio de DFM binário (`TPF0`).
Nada do binário foi executado.

## 1. Interface (formulários DFM): observado

O recurso `TSYNTHEDITORFORM` (formulário do editor, 600×285) define, por banda (1–7):

| Controle | Faixa bruta | Padrão |
|---|---|---|
| `LevelNSlider` | −1800…1800 | 0 |
| `FreqNWheel` | 0…65536 | 5777, 13024, 19904, 33145, 42327, 49307, 55825 |
| `BWNWheel` (largura) | 0…65536 | 40124 (bandas 1 e 7), 25412 (demais) |
| `TypeSelN` | 0…7 | 5, 6, 6, 6, 6, 6, 7 |
| `OrderSelN` | −3…3 | 0 |
| `LevelNSolo` | "Mute / solo" | — |

Controles globais: `MainLevelSlider` (−1800…1800), `OversampleBox` "HQ",
`LinearPhaseBox` "LIN", `MonitorSel` (off/input/output), `CompStoreBtn`
("Store in spare state"), `CompFlipBtn` ("Flip with spare state (A/B compare)"),
`BandSoloOnShiftBtn`.

O recurso `TSYNTHRESMODULE` (menus) define:

- **Tipos:** 0 Disabled, 1 Low pass, 2 Band pass, 3 High pass, 4 Band stop,
  5 Low shelf, 6 Peaking, 7 High shelf.
- **Ordens:** −3 Steep 8, −2 Steep 6, −1 Steep 4, 0 "2" (−12 dB/oct),
  1 Gentle 4, 2 Gentle 6, 3 Gentle 8 (−24/−36/−48 dB/oct).
- **Opções:** solo adaptativo ou por band pass ("Steep 8"), suavização de modulação,
  precisão da fase linear, HQ+ ("decramped"), HQ Legacy (polifásico) e HQ Enhanced
  (FIR), além de opções do analisador (faixa, pivot slope, precisão, heatmap).

## 2. Mapeamento dos parâmetros: observado no código

| Função | Endereço | Evidência | Fórmula |
|---|---|---|---|
| dB → valor | `0x6f94a0` | `(x*100 + 1800) / 3600` | nível ∈ [−18, +18] dB |
| Hz → valor | `0x6f94d0` | `round(ln(f/20)·K/G)/65536`, faixa 20…20000 | `f = 20 · 1000^x` |
| largura | `0x6f9530` | texto 0…100 → `/100` | largura ∈ [0, 1] |
| parse "khz" | `0x6f9758` | `×1000` | — |

`G` é escrito em `0x703db0` como `ln(1000) / (ln 2 · 65536)`. **Inferido:** `K = 1/ln 2`,
a única constante que fecha a ida e volta. Com isso, as frequências padrão são
36,8 / 78,9 / 163 / 658 / 1732 / 3615 / 7186 Hz.

A ordem dos parâmetros de automação (`0x6f9530`, índice/7) é: 7 níveis,
7 frequências, 7 larguras, 7 tipos, 7 ordens e o nível principal (36 no total).
O Island Parametric EQ mantém essa ordem.

## 3. Projeto dos filtros (`0x6f6530`, `0x6f6f70`): observado

O tipo da UI passa por uma tabela (`0x7573b8`) para um tipo interno:
`(0,1,2,4,3,6,7,8)`. Cada banda é uma cascata de **N = |ordem| + 1 biquads**;
ordem negativa ativa o modo "Steep" (`[banda+0x1f4] = ordem < 0`). Os coeficientes
seguem as fórmulas do *RBJ Audio EQ Cookbook* (`0x5f49f0`).

| Família | Largura → parâmetro | Ordem | Limite de w0 |
|---|---|---|---|
| Low/High pass | `Q = 0,1 + 9,9·(1−w)³`; com N>1, `Q^(1/N)` | Steep: Q por seção × tabela `0x7572d8` | 0,999π |
| Band pass / Band stop | `BW = 0,1 + 4,9·w` oitavas | seções idênticas | 0,999π |
| Peaking | `BW = 0,1 + 4,9·w` oitavas; ganho/N por seção | Steep: seções espalhadas em frequência (`0x757318`), alargadas (`0x757368`), com parcela de ganho (`0x757358`) | 0,7π (Steep: 0,8π) |
| Shelves | `S = 1/3 + (98/57)·(1−w)`; ganho/N | Steep: S × tabela `0x757298` | 0,999π |

**Validação cruzada:** os padrões do formulário caem em valores "redondos" com
essas fórmulas. A largura 25412/65536 dá exatamente **2,0 oitavas** (peaking) e
40124/65536 dá **S = 1,0** (shelf de inclinação máxima sem overshoot). Os testes
`core_tests.cpp` verificam isso.

O Island Parametric EQ usa as tabelas Steep com os mesmos valores numéricos
(constantes de afinação, não código).

## 4. Inferências e escolhas de projeto

| Item | Status | Detalhe |
|---|---|---|
| Fator 2 no ganho Steep do Peak | **Inferido** | As parcelas da tabela somam ~metade do ganho; há uma constante global preenchida em runtime que não dá para ler estaticamente. Com fator 2, o centro dá 12,22 / 12,02 / 12,00 dB para um alvo de 12 dB (N = 2/3/4). |
| Escala de largura Band pass/Band stop por ordem | **Inferido** | O original escala por `√N · e^{3g}/e^{6g}`, com `g` global de runtime. Aqui: BP × √N, notch ÷ √N. |
| HQ | **Escolha de projeto** | Oversampling 2× com half-band FIR equiripple (JUCE). O "HQ+ decramped" do original não foi reproduzido. |
| Fase linear | **Escolha de projeto** | FIR simétrico por amostragem de frequência da curva projetada a 4× fs (sem cramping), janela Blackman, 8192/16384/32768 taps (latência N/2). |
| Solo | **Escolha de projeto**, baseada no menu "Bandpass (Steep 8)" | Solo = band pass Steep 8 na frequência da banda; várias bandas em solo são somadas. |
| Suavização | **Escolha de projeto** | Suavização de ~30 ms (frequência no domínio log), coeficientes recalculados a cada 16 amostras. |
| Analisador | **Escolha de projeto** | FFT de 4096 pontos, janela Hann, queda de 1,5 dB por quadro. Heatmap, pivot slope e precisões não foram reproduzidos. |

## 5. O que ficou em aberto

- O caminho "decramped" (`0x6f9ad0`, ativo quando `0x6f9ab0` é verdadeiro) não foi decompilado.
- As constantes globais preenchidas em runtime (`0x7684c8`, `0x76a650` e as de ganho)
  foram deduzidas, não lidas.
- A interface nativa `CreatePlugInstance` do FL Studio não foi reimplementada.
  O plugin novo é VST3/AU/Standalone e funciona no FL Studio como qualquer VST3.
- Nenhuma medição comparativa de áudio com o original foi feita, porque ele não foi executado.
