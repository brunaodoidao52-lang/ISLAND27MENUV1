/*
 * app.js — liga o menu às páginas e inicia o sistema.
 * Os links internos usam "#pagina" ou "#pagina/ID" (ex.: #ficha/abc123).
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
// Telas com formulário: não são redesenhadas sozinhas para não apagar o que está sendo digitado.
const TELAS_FORMULARIO = ['nova-ficha', 'editar-ficha', 'config'];

const Telas = {
  rota: 'inicio',
  param: null,
  atrasada: false,

  ir(destino, { historico = true } = {}) {
    const [rota, param] = String(destino || 'inicio').replace(/^#/, '').split('/');
    this.rota = Object.prototype.hasOwnProperty.call(Rotas, rota) ? rota : 'inicio';
    this.param = param ? decodeURIComponent(param) : null;
    if (historico) {
      try { history.pushState({ destino }, '', '#' + destino.replace(/^#/, '')); } catch (e) { /* sem histórico */ }
    }
    this.recarregar();
  },

  recarregar() {
    if (Seguranca.bloqueado) return;
    this.atrasada = false;
    UI.fecharModal();
    document.querySelectorAll('.menu nav a').forEach(a => {
      const r = a.getAttribute('href').slice(1);
      a.classList.toggle('ativo', r === this.rota || (this.rota === 'ficha' && r === 'fichas'));
    });
    Rotas[this.rota](this.param);
    document.getElementById('nome-cfc').textContent = Dados.estado.config.nomeCfc;
    Lembrete.mostrar();
  },

  /* Chamado quando chegam mudanças de outro aparelho. */
  recarregarSeSeguro() {
    if (UI.modalAberto() || TELAS_FORMULARIO.includes(this.rota)) {
      this.atrasada = true;
      UI.aviso('Dados atualizados em outro aparelho.');
    } else {
      const y = window.scrollY;
      this.recarregar();
      window.scrollTo(0, y);
    }
  },

  aposFecharModal() {
    if (this.atrasada && !TELAS_FORMULARIO.includes(this.rota)) setTimeout(() => this.recarregar(), 0);
  }
};

/* Lembrete de cópia de segurança (a cada 7 dias, se houver fichas). */
const Lembrete = {
  mostrar() {
    const el = document.getElementById('lembrete');
    const c = Dados.estado.config;
    const dias = c.ultimoBackup ? Hoje.diasEntre(c.ultimoBackup, Hoje.iso()) : Infinity;
    el.hidden = !(Dados.estado.alunos.length && dias >= 7 && Telas.rota !== 'config');
  }
};

/* Indicador "Salvo / Salvando…" */
function mostrarStatus(status, pendente) {
  const el = document.getElementById('status-salvo');
  const modo = { nuvem: 'na nuvem', local: 'neste navegador', memoria: 'SEM SALVAR' }[Cofre.modo];
  el.className = 'status-salvo ' + (status === 'erro' ? 'erro' : (status === 'salvando' || pendente) ? 'salvando' : 'ok');
  el.textContent = status === 'erro' ? 'Erro ao salvar' : (status === 'salvando' || pendente) ? 'Salvando…' : `Salvo ${modo}`;
  el.title = Cofre.cifrado ? 'Dados criptografados com senha' : 'Dados sem senha';
}

/* Links internos (#...) navegam sem recarregar a página. */
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  Telas.ir(a.getAttribute('href').slice(1));
});
window.addEventListener('popstate', () => Telas.ir(location.hash.slice(1) || 'inicio', { historico: false }));

async function iniciar() {
  Cofre.ouvintes.push(mostrarStatus);
  let env;
  try {
    env = await Cofre.iniciar();
  } catch (e) {
    document.getElementById('tela').innerHTML = '<div class="painel"><h2>Não foi possível abrir os dados</h2><p class="muted">Verifique a conexão e recarregue a página. Nada foi apagado.</p></div>';
    return;
  }
  try {
    Dados.estado = env && env.cifrado ? await Seguranca.pedirSenha(env) : await Cofre.abrir(env);
  } catch (e) {
    document.getElementById('tela').innerHTML = '<div class="painel"><h2>Os dados salvos estão danificados</h2><p class="muted">Restaure uma cópia de segurança em Configurações.</p></div>';
    Dados.estado = Saneamento.estado(null);
    env = null;
  }
  Cofre.genBase = env ? env.gen : null;
  if (env && env.gen === 'v1') Cofre.salvarAgora(); // migra a versão antiga
  if (Cofre.modo === 'memoria') UI.aviso('Este navegador não deixa salvar dados. Baixe cópias de segurança antes de fechar.', true);
  Seguranca.iniciarVigia();
  mostrarStatus('ok', false);
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* opcional */ }
  Telas.ir(location.hash.slice(1) || 'inicio', { historico: false });
}

iniciar();
