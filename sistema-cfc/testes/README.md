# Testes de segurança e confiabilidade

Rodam o sistema num Chromium de verdade e tentam quebrá-lo.

```bash
cd sistema-cfc
npm i --no-save playwright@1.48.2          # uma vez
python3 ferramentas/gerar_publicacao.py    # gera dist/ (usado pelo teste da nuvem)
python3 -m http.server 8765 --bind 127.0.0.1 &
node testes/seguranca.js /tmp/saida        # 93 verificações (XSS, backup adulterado, senha, bloqueio, CSP, regras financeiras, celular/PC…)
node testes/nuvem.js                       # 13 verificações do modo nuvem (sincronização celular/PC)
```

Se o Chromium não estiver no lugar padrão do Playwright, defina `CHROMIUM_PATH`.
