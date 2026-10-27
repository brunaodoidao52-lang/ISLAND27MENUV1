// Desenho da prévia no <canvas>. Usa as mesmas contas de src/shared/project.js que a exportação.
(function () {
  const P = window.Project;
  // Fontes comuns antes das de emoji, senão números caem na fonte de emoji quando a escolhida não existe.
  const EMOJI_FONTS = 'Arial, Helvetica, "Liberation Sans", "DejaVu Sans", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

  function mediaSize(el) {
    if (!el) return null;
    if (el.tagName === 'VIDEO') return el.readyState >= 2 && el.videoWidth ? [el.videoWidth, el.videoHeight] : null;
    return el.complete && el.naturalWidth ? [el.naturalWidth, el.naturalHeight] : null;
  }

  // Desenha a mídia girada/espelhada centrada em (cx, cy) com tamanho final (dw, dh) já girado.
  function drawMedia(ctx, clip, el, cx, cy, dw, dh) {
    const quarter = clip.rotate % 180 !== 0;
    const w = quarter ? dh : dw;
    const h = quarter ? dw : dh;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(clip.flipH ? -1 : 1, clip.flipV ? -1 : 1);
    ctx.rotate((clip.rotate * Math.PI) / 180);
    ctx.drawImage(el, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawClip(ctx, clip, el, W, H, background) {
    if (!mediaSize(el)) return false;
    const pl = P.placement(clip, W, H);
    const params = P.colorParams(clip);
    const css = P.cssFilter(params);
    const bg = background || { type: 'color', color: '#000000' };

    if (pl.cw < W - 0.5 || pl.ch < H - 0.5) {
      if (bg.type === 'blur') {
        const k = Math.max(W / pl.rw, H / pl.rh) * 1.08;
        const radius = (bg.blur ?? 0.6) * Math.max(W, H) * 0.035;
        ctx.save();
        ctx.filter = `${radius > 0 ? `blur(${radius.toFixed(1)}px)` : ''} ${css === 'none' ? '' : css}`.trim() || 'none';
        drawMedia(ctx, clip, el, W / 2, H / 2, pl.rw * k, pl.rh * k);
        ctx.restore();
      } else {
        ctx.fillStyle = bg.color || '#000';
        ctx.fillRect(0, 0, W, H);
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(pl.x, pl.y, pl.cw, pl.ch);
    ctx.clip();
    ctx.filter = css;
    drawMedia(ctx, clip, el, pl.x - pl.cropX + pl.dw / 2, pl.y - pl.cropY + pl.dh / 2, pl.dw, pl.dh);
    ctx.filter = 'none';
    if (params.warmth) {
      const m = P.warmthMultipliers(params.warmth).map((v) => Math.round(v * 255));
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${m[0]},${m[1]},${m[2]})`;
      ctx.fillRect(pl.x, pl.y, pl.cw, pl.ch);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (params.vignette > 0) {
      const cx = pl.x + pl.cw / 2;
      const cy = pl.y + pl.ch / 2;
      const r = Math.hypot(pl.cw, pl.ch) / 2;
      const g = ctx.createRadialGradient(cx, cy, r * (0.75 - params.vignette * 0.4), cx, cy, r);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${0.35 + params.vignette * 0.55})`);
      ctx.fillStyle = g;
      ctx.fillRect(pl.x, pl.y, pl.cw, pl.ch);
    }
    ctx.restore();
    return true;
  }

  // Aproximação das transições do FFmpeg para a prévia.
  function drawTransition(ctx, type, p, W, H, drawPrev, drawNext) {
    const slide = /^slide(left|right|up|down)$/.exec(type);
    const wipe = /^(?:wipe|cover|reveal|smooth)(left|right|up|down)$/.exec(type);
    if (slide) {
      const [dx, dy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[slide[1]];
      ctx.save();
      ctx.translate(dx * W * p, dy * H * p);
      drawPrev();
      ctx.translate(-dx * W, -dy * H);
      drawNext();
      ctx.restore();
    } else if (wipe) {
      drawPrev();
      ctx.save();
      ctx.beginPath();
      const dir = wipe[1];
      if (dir === 'left') ctx.rect(W * (1 - p), 0, W * p, H);
      else if (dir === 'right') ctx.rect(0, 0, W * p, H);
      else if (dir === 'up') ctx.rect(0, H * (1 - p), W, H * p);
      else ctx.rect(0, 0, W, H * p);
      ctx.clip();
      drawNext();
      ctx.restore();
    } else if (type === 'circleopen' || type === 'circleclose' || type === 'radial') {
      const r = Math.hypot(W, H) / 2;
      if (type === 'circleclose') {
        drawNext();
        ctx.save();
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, r * (1 - p), 0, Math.PI * 2);
        ctx.clip();
        drawPrev();
      } else {
        drawPrev();
        ctx.save();
        ctx.beginPath();
        if (type === 'radial') {
          ctx.moveTo(W / 2, H / 2);
          ctx.arc(W / 2, H / 2, r * 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
        } else ctx.arc(W / 2, H / 2, r * p, 0, Math.PI * 2);
        ctx.clip();
        drawNext();
      }
      ctx.restore();
    } else if (type === 'fadeblack' || type === 'fadewhite') {
      const color = type === 'fadeblack' ? '0,0,0' : '255,255,255';
      if (p < 0.5) drawPrev();
      else drawNext();
      ctx.fillStyle = `rgba(${color},${1 - Math.abs(p - 0.5) * 2})`;
      ctx.fillRect(0, 0, W, H);
    } else {
      drawPrev();
      ctx.save();
      ctx.globalAlpha = p;
      drawNext();
      ctx.restore();
    }
  }

  function textFont(it, H) {
    const size = Math.max(4, it.size * H);
    return { size, font: `${it.italic ? 'italic ' : ''}${it.bold ? 'bold ' : ''}${size}px "${it.font}", ${EMOJI_FONTS}` };
  }

  function textLayout(ctx, it, W, H) {
    const { size, font } = textFont(it, H);
    ctx.save();
    ctx.font = font;
    const lines = String(it.text || ' ').split('\n');
    const widths = lines.map((l) => ctx.measureText(l || ' ').width);
    ctx.restore();
    const pad = it.bgOpacity > 0 ? size * 0.35 : size * 0.15;
    const lineH = size * 1.22;
    return {
      font, size, lines, widths, lineH, pad,
      boxW: Math.max(...widths) + pad * 2,
      boxH: lines.length * lineH + pad * 2,
      cx: it.x * W,
      cy: it.y * H,
    };
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function hexToRgba(hex, a) {
    const h = (hex || '#000000').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function drawText(ctx, it, W, H, alpha = 1) {
    const L = textLayout(ctx, it, W, H);
    ctx.save();
    ctx.translate(L.cx, L.cy);
    ctx.rotate(((it.rotation || 0) * Math.PI) / 180);
    ctx.globalAlpha = alpha * (it.opacity ?? 1);
    if (it.bgOpacity > 0) {
      ctx.fillStyle = hexToRgba(it.bgColor, it.bgOpacity);
      roundRect(ctx, -L.boxW / 2, -L.boxH / 2, L.boxW, L.boxH, L.size * 0.25);
      ctx.fill();
    }
    ctx.font = L.font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = it.align || 'center';
    const x = it.align === 'left' ? -L.boxW / 2 + L.pad : it.align === 'right' ? L.boxW / 2 - L.pad : 0;
    L.lines.forEach((line, i) => {
      const y = -L.boxH / 2 + L.pad + L.lineH * (i + 0.5);
      if (it.shadow) {
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = L.size * 0.18;
        ctx.shadowOffsetY = L.size * 0.05;
      }
      if (it.strokeWidth > 0 && !it.sticker) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = L.size * it.strokeWidth;
        ctx.strokeStyle = it.strokeColor;
        ctx.strokeText(line, x, y);
        ctx.shadowColor = 'transparent';
      }
      ctx.fillStyle = it.color;
      ctx.fillText(line, x, y);
      ctx.shadowColor = 'transparent';
    });
    ctx.restore();
  }

  // Ponto (px, py) dentro do texto? Considera a rotação.
  function hitText(ctx, it, W, H, px, py) {
    const L = textLayout(ctx, it, W, H);
    const a = (-(it.rotation || 0) * Math.PI) / 180;
    const dx = px - L.cx;
    const dy = py - L.cy;
    const rx = dx * Math.cos(a) - dy * Math.sin(a);
    const ry = dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(rx) <= L.boxW / 2 + 6 && Math.abs(ry) <= L.boxH / 2 + 6 ? L : null;
  }

  function textAlpha(it, t) {
    if (t < it.start || t > it.end) return 0;
    if (!it.fade) return 1;
    const fd = Math.min(0.4, (it.end - it.start) / 3);
    return Math.max(0, Math.min(1, (t - it.start) / fd, (it.end - t) / fd));
  }

  // Imagem PNG transparente do texto no tamanho de exportação.
  function textToPng(it, W, H) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    drawText(c.getContext('2d'), it, W, H, 1);
    return c.toDataURL('image/png');
  }

  window.Render = { drawClip, drawTransition, drawText, hitText, textAlpha, textToPng, textLayout, mediaSize };
})();
