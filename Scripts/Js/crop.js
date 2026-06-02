/* MeioKahoot — PhotoCrop.js
 * Modal estilo WhatsApp para ajustar a foto antes de salvar.
 * Suporta arrastar (mouse + touch) e zoom (slider, pinch e wheel).
 */
const PhotoCrop = (() => {
  const OUT_SIZE = 320;      // resolução final exportada (px)
  let SIZE = 320;            // diâmetro do círculo visível (lido do DOM)
  let _imgEl, _zoomEl, _stageEl, _cb;
  let _natural = { w: 0, h: 0 };
  let _scale = 1, _minScale = 1, _maxScale = 4;
  let _tx = 0, _ty = 0;       // translate atual (px)
  let _dragging = false;
  let _lastX = 0, _lastY = 0;
  let _pinchStartDist = 0, _pinchStartScale = 1;
  let _ready = false;

  function _$(id) { return document.getElementById(id); }

  function open(dataUrl, onConfirm) {
    _cb       = onConfirm || (() => {});
    _imgEl    = _$('crop-img');
    _zoomEl   = _$('crop-zoom');
    _stageEl  = _$('crop-stage');
    if (!_imgEl) return;

    // mostra modal ANTES de carregar para medir o tamanho do stage
    const m = _$('modal-crop');
    if (m) m.style.display = 'flex';

    // Mede o stage real
    requestAnimationFrame(() => {
      SIZE = _stageEl.clientWidth || 320;
    });

    _imgEl.onload = () => {
      SIZE = _stageEl.clientWidth || 320;
      _natural = { w: _imgEl.naturalWidth, h: _imgEl.naturalHeight };
      _initScale();
      _ready = true;
      _apply();
    };
    _ready = false;
    _imgEl.src = dataUrl;

    _bind();
  }

  function cancel() {
    _unbind();
    const m = _$('modal-crop');
    if (m) m.style.display = 'none';
  }

  function confirm() {
    if (!_ready) return cancel();
    const out = _renderCrop();
    _unbind();
    const m = _$('modal-crop');
    if (m) m.style.display = 'none';
    try { _cb(out); } catch {}
  }

  /* ── Math / estado ─────────────────────────────────── */

  function _initScale() {
    // escala mínima: garantir que a imagem cobre o círculo (SIZE)
    const min = Math.max(SIZE / _natural.w, SIZE / _natural.h);
    _minScale = min;
    _maxScale = min * 4;
    _scale = min;
    _tx = 0; _ty = 0;
    if (_zoomEl) {
      _zoomEl.min   = String(min);
      _zoomEl.max   = String(_maxScale);
      _zoomEl.step  = String((_maxScale - min) / 200 || 0.01);
      _zoomEl.value = String(_scale);
    }
  }

  function _clamp() {
    // garante que a imagem cobre todo o círculo
    const w = _natural.w * _scale;
    const h = _natural.h * _scale;
    const maxTx = Math.max(0, (w - SIZE) / 2);
    const maxTy = Math.max(0, (h - SIZE) / 2);
    if (_tx >  maxTx) _tx =  maxTx;
    if (_tx < -maxTx) _tx = -maxTx;
    if (_ty >  maxTy) _ty =  maxTy;
    if (_ty < -maxTy) _ty = -maxTy;
  }

  function _apply() {
    if (!_imgEl) return;
    _clamp();
    _imgEl.style.width  = (_natural.w * _scale) + 'px';
    _imgEl.style.height = (_natural.h * _scale) + 'px';
    _imgEl.style.transform = `translate(-50%, -50%) translate(${_tx}px, ${_ty}px)`;
  }

  function _renderCrop() {
    const cv = document.createElement('canvas');
    cv.width = OUT_SIZE; cv.height = OUT_SIZE;
    const ctx = cv.getContext('2d');

    // centro da imagem (em coordenadas naturais) que aparece no centro do círculo
    // Translate desloca a imagem; quanto mais positivo _tx, mais à direita a imagem
    // anda → o ponto da imagem que cai no centro está MAIS À ESQUERDA.
    const cxNat = _natural.w / 2 - _tx / _scale;
    const cyNat = _natural.h / 2 - _ty / _scale;
    const sideNat = SIZE / _scale;  // lado do recorte em px naturais

    const sx = cxNat - sideNat / 2;
    const sy = cyNat - sideNat / 2;

    ctx.drawImage(_imgEl, sx, sy, sideNat, sideNat, 0, 0, OUT_SIZE, OUT_SIZE);
    return cv.toDataURL('image/jpeg', 0.9);
  }

  /* ── Eventos ────────────────────────────────────────── */

  function _bind() {
    if (!_stageEl) return;
    _stageEl.addEventListener('mousedown',  _onDown);
    window  .addEventListener('mousemove',  _onMove);
    window  .addEventListener('mouseup',    _onUp);
    _stageEl.addEventListener('touchstart', _onTouchStart, { passive: false });
    _stageEl.addEventListener('touchmove',  _onTouchMove,  { passive: false });
    _stageEl.addEventListener('touchend',   _onTouchEnd);
    _stageEl.addEventListener('wheel',      _onWheel, { passive: false });
    if (_zoomEl) _zoomEl.addEventListener('input', _onZoomSlider);
  }

  function _unbind() {
    if (!_stageEl) return;
    _stageEl.removeEventListener('mousedown',  _onDown);
    window  .removeEventListener('mousemove',  _onMove);
    window  .removeEventListener('mouseup',    _onUp);
    _stageEl.removeEventListener('touchstart', _onTouchStart);
    _stageEl.removeEventListener('touchmove',  _onTouchMove);
    _stageEl.removeEventListener('touchend',   _onTouchEnd);
    _stageEl.removeEventListener('wheel',      _onWheel);
    if (_zoomEl) _zoomEl.removeEventListener('input', _onZoomSlider);
  }

  function _onDown(e) {
    _dragging = true;
    _lastX = e.clientX; _lastY = e.clientY;
    e.preventDefault();
  }
  function _onMove(e) {
    if (!_dragging) return;
    _tx += (e.clientX - _lastX);
    _ty += (e.clientY - _lastY);
    _lastX = e.clientX; _lastY = e.clientY;
    _apply();
  }
  function _onUp() { _dragging = false; }

  function _onTouchStart(e) {
    if (e.touches.length === 1) {
      _dragging = true;
      _lastX = e.touches[0].clientX;
      _lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      _dragging = false;
      _pinchStartDist  = _dist(e.touches[0], e.touches[1]);
      _pinchStartScale = _scale;
    }
    e.preventDefault();
  }
  function _onTouchMove(e) {
    if (e.touches.length === 1 && _dragging) {
      const t = e.touches[0];
      _tx += (t.clientX - _lastX);
      _ty += (t.clientY - _lastY);
      _lastX = t.clientX; _lastY = t.clientY;
      _apply();
    } else if (e.touches.length === 2) {
      const d = _dist(e.touches[0], e.touches[1]);
      const ratio = d / (_pinchStartDist || d);
      _setScale(_pinchStartScale * ratio);
    }
    e.preventDefault();
  }
  function _onTouchEnd(e) {
    if (e.touches.length === 0) _dragging = false;
  }

  function _onWheel(e) {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    _setScale(_scale * (1 + delta));
  }

  function _onZoomSlider() {
    _setScale(parseFloat(_zoomEl.value));
  }

  function _setScale(s) {
    s = Math.max(_minScale, Math.min(_maxScale, s));
    _scale = s;
    if (_zoomEl) _zoomEl.value = String(s);
    _apply();
  }

  function _dist(a, b) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  }

  return { open, cancel, confirm };
})();
