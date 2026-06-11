/* MeioKahoot — PhotoCrop v3.0
 * - Foto visível o tempo todo (sem overlay escuro)
 * - Borda circular de guia por cima da foto
 * - Arraste LIVRE sem limites
 * - Zoom via slider, scroll e pinch
 * - Exporta quadrado 320x320
 */
const PhotoCrop = (() => {
  const OUT = 320;
  let STAGE = 300;
  let _img, _zoom, _stage, _guide, _cb;
  let _nat = { w: 0, h: 0 };
  let _scale = 1, _minS = 0.1, _maxS = 10;
  let _tx = 0, _ty = 0;
  let _drag = false, _lx = 0, _ly = 0;
  let _pd = 0, _ps = 1;
  let _ok = false;

  const $ = id => document.getElementById(id);

  /* ═══ PUBLIC ═══ */

  function open(dataUrl, onConfirm) {
    _cb    = onConfirm || (() => {});
    _stage = $('crop-stage');
    _img   = $('crop-img');
    _zoom  = $('crop-zoom');
    _guide = $('crop-guide');
    if (!_img || !_stage) return;

    const m = $('modal-crop');
    if (m) m.style.display = 'flex';

    _img.onload = () => {
      _nat = { w: _img.naturalWidth, h: _img.naturalHeight };
      STAGE = _stage.clientWidth || 300;
      _fit();
      _ok = true;
      _draw();
    };
    _ok = false;
    _img.src = dataUrl;
    _listen(true);
  }

  function cancel() {
    _listen(false);
    const m = $('modal-crop');
    if (m) m.style.display = 'none';
    if (_img) _img.onload = null;
  }

  function confirm() {
    if (!_ok) return cancel();
    const out = _export();
    _listen(false);
    const m = $('modal-crop');
    if (m) m.style.display = 'none';
    try { _cb(out); } catch {}
  }

  /* ═══ FIT — foto inteira visível ═══ */

  function _fit() {
    const fit = Math.min((STAGE - 10) / _nat.w, (STAGE - 10) / _nat.h);
    _scale = fit;
    _minS  = fit * 0.15;
    _maxS  = fit * 8;
    _tx = 0; _ty = 0;
    if (_zoom) {
      _zoom.min   = _minS.toFixed(4);
      _zoom.max   = _maxS.toFixed(4);
      _zoom.step  = ((_maxS - _minS) / 400).toFixed(5);
      _zoom.value = _scale.toFixed(4);
    }
  }

  /* ═══ DRAW — renderiza foto + guia ═══ */

  function _draw() {
    if (!_img) return;
    const w = _nat.w * _scale;
    const h = _nat.h * _scale;

    // Foto centralizada + offset do drag
    Object.assign(_img.style, {
      width:     w + 'px',
      height:    h + 'px',
      left:      ((STAGE - w) / 2 + _tx) + 'px',
      top:       ((STAGE - h) / 2 + _ty) + 'px',
      position:  'absolute',
      display:   'block',
      zIndex:    '1',
      pointerEvents: 'none',
      userSelect: 'none',
    });

    // Círculo guia — SÓ borda, sem overlay escuro
    if (_guide) {
      const sz = STAGE - 4;
      Object.assign(_guide.style, {
        width:    sz + 'px',
        height:   sz + 'px',
        left:     '2px',
        top:      '2px',
        position: 'absolute',
        borderRadius: '50%',
        border:   '3px solid rgba(255,255,255,0.85)',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(0,0,0,0.1)',
        display:  'block',
        zIndex:   '10',
        pointerEvents: 'none',
      });
    }
  }

  /* ═══ EXPORT ═══ */

  function _export() {
    const cv = document.createElement('canvas');
    cv.width = OUT; cv.height = OUT;
    const ctx = cv.getContext('2d');

    const iw = _nat.w * _scale;
    const ih = _nat.h * _scale;
    const imgLeft = (STAGE - iw) / 2 + _tx;
    const imgTop  = (STAGE - ih) / 2 + _ty;

    // Centro do stage em coords naturais
    const cxNat = (STAGE / 2 - imgLeft) / _scale;
    const cyNat = (STAGE / 2 - imgTop) / _scale;

    // Diâmetro do guia em coords naturais
    const guidePx = STAGE - 4;
    const sideNat = guidePx / _scale;

    const sx = cxNat - sideNat / 2;
    const sy = cyNat - sideNat / 2;

    ctx.drawImage(_img, sx, sy, sideNat, sideNat, 0, 0, OUT, OUT);
    return cv.toDataURL('image/jpeg', 0.9);
  }

  /* ═══ EVENTS — arraste LIVRE, sem clamp ═══ */

  function _listen(on) {
    if (!_stage) return;
    const fn = on ? 'addEventListener' : 'removeEventListener';
    _stage[fn]('mousedown',  _dn);
    window [fn]('mousemove', _mv);
    window [fn]('mouseup',   _up);
    _stage[fn]('touchstart', _ts, { passive: false });
    _stage[fn]('touchmove',  _tm, { passive: false });
    _stage[fn]('touchend',   _te);
    _stage[fn]('wheel',      _wh, { passive: false });
    if (_zoom) _zoom[fn]('input', _sl);
  }

  function _dn(e) { _drag = true; _lx = e.clientX; _ly = e.clientY; e.preventDefault(); }
  function _mv(e) {
    if (!_drag) return;
    _tx += e.clientX - _lx;
    _ty += e.clientY - _ly;
    _lx = e.clientX; _ly = e.clientY;
    _draw();
  }
  function _up() { _drag = false; }

  function _ts(e) {
    if (e.touches.length === 1) {
      _drag = true; _lx = e.touches[0].clientX; _ly = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      _drag = false;
      _pd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      _ps = _scale;
    }
    e.preventDefault();
  }
  function _tm(e) {
    if (e.touches.length === 1 && _drag) {
      const t = e.touches[0];
      _tx += t.clientX - _lx; _ty += t.clientY - _ly;
      _lx = t.clientX; _ly = t.clientY;
      _draw();
    } else if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      _setS(_ps * (d / (_pd || d)));
    }
    e.preventDefault();
  }
  function _te(e) { if (!e.touches.length) _drag = false; }

  function _wh(e) { e.preventDefault(); _setS(_scale * (1 + -e.deltaY * 0.002)); }
  function _sl()  { _setS(parseFloat(_zoom.value)); }

  function _setS(s) {
    s = Math.max(_minS, Math.min(_maxS, s));
    _scale = s;
    if (_zoom) _zoom.value = s.toFixed(4);
    _draw();
  }

  return { open, cancel, confirm };
})();
