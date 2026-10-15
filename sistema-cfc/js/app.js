/*
 * app.js — liga o menu às páginas.
 * O endereço depois do "#" diz qual página mostrar, ex.: #fichas, #ficha/ID.
 */

const Rotas = {
  'inicio': () => Inicio.mostrar(),
  'fichas': () => Fichas.lista(),
  'nova-ficha': () => Fichas.formulario(),
  'ficha': id => Fichas.detalhe(id),
  'editar-ficha': id => Fichas.formulario(id),
  'pagos': () => Pagamentos.realizados(),
  'pendentes': () => Pagamentos.pendentes(),
  'config': () => Config.mostrar()
};

function navegar() {
  const [rota, param] = (location.hash.slice(1) || 'inicio').split('/');
  const abrir = Rotas[rota] || Rotas.inicio;
  document.querySelectorAll('.menu nav a').forEach(a => {
    a.classList.toggle('ativo', a.dataset.rota === rota || (rota === 'ficha' && a.dataset.rota === 'fichas'));
  });
  UI.fecharModal();
  abrir(param && decodeURIComponent(param));
}

/* Recarrega a página atual (usado depois de salvar algo). */
function atualizarTela() { navegar(); }

Dados.carregar();
document.getElementById('nome-cfc').textContent = Dados.estado.config.nomeCfc || 'Gestão do CFC';
window.addEventListener('hashchange', navegar);
navegar();
