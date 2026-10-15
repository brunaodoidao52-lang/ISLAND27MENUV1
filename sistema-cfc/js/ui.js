/* ui.js — pequenos ajudantes de tela usados por todas as páginas. */

const UI = {
  /* Aberto pelo link publicado (dentro do Claude) ou como arquivo local? */
  publicado: !!(window.claude && typeof window.claude.use === 'function'),

  /* Protege qualquer texto antes de colocar no HTML (contra injeção de código). */
  esc(t) {
    return String(t ?? '').replace(/[&<>"'`=]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;', '=': '&#61;' }[c]));
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
    this._t = setTimeout(() => { el.hidden = true; }, erro ? 6000 : 3000);
  },

  abrirModal(html) {
    document.getElementById('modal-conteudo').innerHTML = html;
    document.getElementById('modal').hidden = false;
    document.body.classList.add('com-modal');
    const primeiro = document.querySelector('#modal input:not([type=checkbox]), #modal select, #modal button.btn-primario');
    if (primeiro) primeiro.focus();
  },

  fecharModal() {
    const modal = document.getElementById('modal');
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('com-modal');
    document.getElementById('modal-conteudo').replaceChildren();
    if (this._aoFechar) { const f = this._aoFechar; this._aoFechar = null; f(); }
    if (typeof Telas !== 'undefined') Telas.aposFecharModal();
  },

  modalAberto() { return !document.getElementById('modal').hidden; },

  /* Pergunta "tem certeza?" dentro da própria página. Resolve true/false. */
  confirmar(titulo, texto, { botao = 'Confirmar', perigo = false } = {}) {
    return new Promise(resolve => {
      this.abrirModal(`
        <h2>${this.esc(titulo)}</h2>
        <p class="muted">${this.esc(texto)}</p>
        <div class="botoes">
          <button type="button" class="btn" data-fechar>Cancelar</button>
          <button type="button" class="btn ${perigo ? 'btn-perigo-cheio' : 'btn-primario'}" id="confirmar-sim">${this.esc(botao)}</button>
        </div>`);
      let respondeu = false;
      this._aoFechar = () => { if (!respondeu) resolve(false); };
      document.getElementById('confirmar-sim').onclick = () => { respondeu = true; this.fecharModal(); resolve(true); };
      document.getElementById('confirmar-sim').focus();
    });
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
    const textos = {
      pago: 'Pago',
      hoje: 'Vence hoje',
      aberto: 'A vencer',
      atrasado: `Atrasado ${Hoje.diasEntre(p.vencimento, Hoje.iso())}d`
    };
    return `<span class="tag ${s}">${textos[s]}</span>`;
  },

  /* Link do WhatsApp com mensagem pronta (só números no telefone). */
  whatsapp(telefone, mensagem) {
    let n = String(telefone || '').replace(/\D/g, '');
    if (n.length < 10 || n.length > 13) return '';
    if (n.length <= 11) n = '55' + n;
    return `https://wa.me/${n}?text=${encodeURIComponent(mensagem)}`;
  },

  async copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      this.aviso('Copiado');
    } catch (e) {
      const area = document.createElement('textarea');
      area.value = texto;
      document.getElementById('modal-conteudo').appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      area.remove();
      this.aviso(ok ? 'Copiado' : 'Não foi possível copiar. Selecione o texto e copie.', !ok);
    }
  },

  /* Entrega um arquivo para o usuário salvar. */
  async baixar(nome, conteudo) {
    if (this.publicado) {
      const downloads = await window.claude.use('downloads');
      if (!downloads) { this.aviso('Este aparelho não permite salvar arquivos por aqui.', true); return false; }
      try { await downloads.save({ filename: nome, data: conteudo }); return true; } catch (e) {
        if (e && e.code !== 'declined') this.aviso('Não foi possível salvar o arquivo.', true);
        return false;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([conteudo], { type: nome.endsWith('.json') ? 'application/json' : 'text/html' }));
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return true;
  },

  /* Imprime (só funciona com o sistema aberto como arquivo no computador). */
  imprimir(html) {
    document.getElementById('impressao').innerHTML = html;
    window.print();
  },

  /* Documento completo para recibo/ficha baixados (abrir e imprimir no PC). */
  documento(titulo, corpo) {
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${this.esc(titulo)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>body{font:14px/1.5 Arial,sans-serif;color:#000;max-width:760px;margin:24px auto;padding:0 16px}
h1{font-size:20px}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #999;padding:5px 8px;text-align:left}
.via{border:1px dashed #666;padding:16px;margin-bottom:18px;page-break-inside:avoid}.assinatura{margin-top:40px;border-top:1px solid #000;width:60%;text-align:center;padding-top:4px}</style>
</head><body>${corpo}</body></html>`;
  }
};

/* Fecha a janela ao clicar fora dela ou apertar Esc. */
document.addEventListener('click', e => {
  if (e.target.id === 'modal' || e.target.closest('[data-fechar]')) UI.fecharModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') UI.fecharModal();
});
