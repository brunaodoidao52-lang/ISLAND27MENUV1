/* ui.js — pequenos ajudantes de tela usados por todas as páginas. */

const UI = {
  /* Protege textos digitados antes de colocar no HTML. */
  esc(t) {
    return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  tela(html) {
    document.getElementById('tela').innerHTML = html;
    window.scrollTo(0, 0);
  },

  aviso(texto, erro = false) {
    const el = document.getElementById('aviso');
    el.textContent = texto;
    el.className = 'aviso' + (erro ? ' erro' : '');
    el.hidden = false;
    clearTimeout(this._t);
    this._t = setTimeout(() => { el.hidden = true; }, 3000);
  },

  abrirModal(html) {
    document.getElementById('modal-conteudo').innerHTML = html;
    document.getElementById('modal').hidden = false;
    const primeiro = document.querySelector('#modal input, #modal select');
    if (primeiro) primeiro.focus();
  },

  fecharModal() {
    document.getElementById('modal').hidden = true;
    document.getElementById('modal-conteudo').innerHTML = '';
  },

  /* Lê todos os campos com "name" de um formulário para um objeto. */
  lerForm(form) {
    const obj = {};
    form.querySelectorAll('[name]').forEach(el => {
      obj[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
    });
    return obj;
  },

  opcoes(lista, selecionado) {
    return lista.map(o => `<option${o === selecionado ? ' selected' : ''}>${this.esc(o)}</option>`).join('');
  },

  tag(p) {
    const s = Dados.situacao(p);
    const hoje = Hoje.iso();
    const textos = {
      pago: 'Pago',
      hoje: 'Vence hoje',
      aberto: 'A vencer',
      atrasado: `Atrasado ${Hoje.diasEntre(p.vencimento, hoje)}d`
    };
    return `<span class="tag ${s}">${textos[s]}</span>`;
  },

  /* Coloca o HTML na área de impressão e abre a janela de imprimir. */
  imprimir(html) {
    document.getElementById('impressao').innerHTML = html;
    window.print();
  },

  /* Link do WhatsApp com mensagem de cobrança pronta. */
  whatsapp(telefone, mensagem) {
    let n = String(telefone || '').replace(/\D/g, '');
    if (!n) return '';
    if (n.length <= 11) n = '55' + n;
    return `https://wa.me/${n}?text=${encodeURIComponent(mensagem)}`;
  }
};

/* Fecha a janela ao clicar fora dela ou apertar Esc. */
document.addEventListener('click', e => {
  if (e.target.id === 'modal' || e.target.closest('[data-fechar]')) UI.fecharModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') UI.fecharModal();
});
