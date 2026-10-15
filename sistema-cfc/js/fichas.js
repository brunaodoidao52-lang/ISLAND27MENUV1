/* fichas.js — cadastro dos alunos. (preenchido na etapa 2) */
const Fichas = {
  lista() { UI.tela('<div class="topo"><h1>Fichas</h1></div>'); },
  formulario() { UI.tela('<div class="topo"><h1>Lançar ficha</h1></div>'); },
  detalhe() { this.lista(); }
};
