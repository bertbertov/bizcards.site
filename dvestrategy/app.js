/* DVE Strategy — showpiece interactions v3.
   Motion budget: transform + opacity only, entrances < 800ms. */

lucide.createIcons();

/* ---------- Mobile drawer ---------- */
document.querySelectorAll('[data-menu-toggle]').forEach(function (el) {
  el.addEventListener('click', function () {
    var drawer = document.querySelector('[data-mobile-menu]');
    var open = drawer.classList.toggle('open');
    document.querySelector('.nav-burger').setAttribute('aria-expanded', open);
  });
});

var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var finePointer = window.matchMedia('(pointer: fine)').matches;

/* ---------- Line-in cleanup (frees transform for tilt/magnetic) ---------- */
document.querySelectorAll('.line-in').forEach(function (el) {
  el.addEventListener('animationend', function () {
    el.classList.remove('line-in');
    el.style.opacity = '1';
  });
});

/* ---------- Scroll reveals ---------- */
var items = document.querySelectorAll('.reveal');
if (reduceMotion || !('IntersectionObserver' in window)) {
  items.forEach(function (el) { el.classList.add('in'); });
} else {
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  items.forEach(function (el) { io.observe(el); });
}

/* ---------- Nav: hide on scroll down, show on scroll up ---------- */
(function () {
  var nav = document.querySelector('.nav');
  var lastY = 0;
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    nav.classList.toggle('nav--hidden', y > 160 && y > lastY);
    lastY = y;
  }, { passive: true });
})();

/* ---------- Parallax auras (transform only) ---------- */
var layers = document.querySelectorAll('[data-speed]');
if (!reduceMotion && layers.length) {
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY;
      layers.forEach(function (el) {
        el.style.transform = 'translateY(' + (y * parseFloat(el.dataset.speed)) + 'px)';
      });
      ticking = false;
    });
  }, { passive: true });
}

/* ---------- Mouse-follow glow (desktop only) ---------- */
var glow = document.querySelector('.glow-cursor');
if (!reduceMotion && finePointer && glow) {
  var gx = -999, gy = -999, cx = -999, cy = -999, glowOn = false;
  window.addEventListener('pointermove', function (e) {
    gx = e.clientX; gy = e.clientY;
    if (!glowOn) { glow.style.opacity = '1'; glowOn = true; }
  }, { passive: true });
  (function glide() {
    cx += (gx - cx) * 0.08;
    cy += (gy - cy) * 0.08;
    glow.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
    requestAnimationFrame(glide);
  })();
}

/* ---------- Dot + ring cursor (desktop only) ---------- */
if (!reduceMotion && finePointer) {
  var dot = document.querySelector('.cursor-dot');
  var ring = document.querySelector('.cursor-ring');
  if (dot && ring) {
    var mx = -100, my = -100, rx = -100, ry = -100;
    var scale = 1, targetScale = 1, cursorOn = false;
    window.addEventListener('pointermove', function (e) {
      mx = e.clientX; my = e.clientY;
      if (!cursorOn) { dot.style.opacity = '1'; ring.style.opacity = '1'; cursorOn = true; }
    }, { passive: true });
    document.addEventListener('pointerover', function (e) {
      targetScale = e.target.closest('a, button, summary, [data-spotlight]') ? 1.8 : 1;
    });
    (function follow() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      scale += (targetScale - scale) * 0.18;
      dot.style.transform = 'translate(' + mx + 'px,' + my + 'px)';
      ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px) scale(' + scale.toFixed(3) + ')';
      requestAnimationFrame(follow);
    })();
  }
}

/* ---------- Cursor-tracked spotlight on cards ---------- */
if (finePointer) {
  document.querySelectorAll('[data-spotlight]').forEach(function (el) {
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  });
}

/* ---------- Magnetic buttons ---------- */
if (!reduceMotion && finePointer) {
  document.querySelectorAll('[data-magnetic]').forEach(function (btn) {
    btn.addEventListener('pointermove', function (e) {
      var r = btn.getBoundingClientRect();
      var x = e.clientX - r.left - r.width / 2;
      var y = e.clientY - r.top - r.height / 2;
      btn.style.transform = 'translate(' + (x * 0.16).toFixed(1) + 'px,' + (y * 0.3).toFixed(1) + 'px)';
    });
    btn.addEventListener('pointerleave', function () { btn.style.transform = ''; });
  });
}

/* ---------- Desk 3D tilt ---------- */
if (!reduceMotion && finePointer) {
  var desk = document.querySelector('[data-tilt]');
  if (desk) {
    var qx = 0, qy = 0, tx = 0, ty = 0;
    desk.addEventListener('pointermove', function (e) {
      var r = desk.getBoundingClientRect();
      qx = ((e.clientY - r.top) / r.height - 0.5) * -3.2;
      qy = ((e.clientX - r.left) / r.width - 0.5) * 3.6;
    });
    desk.addEventListener('pointerleave', function () { qx = 0; qy = 0; });
    (function tilt() {
      tx += (qx - tx) * 0.08;
      ty += (qy - ty) * 0.08;
      desk.style.transform = 'rotateX(' + tx.toFixed(3) + 'deg) rotateY(' + ty.toFixed(3) + 'deg)';
      requestAnimationFrame(tilt);
    })();
  }
}

/* ---------- Signature element: living volume chart ----------
   A slow random-walk candlestick series with volume bars, drawn
   in gold/ivory inside the desk panel. New candles form on the right,
   the series drifts left, the latest candle breathes. The panel HUD
   (price readout, volume) updates on every committed candle. */
(function () {
  var canvas = document.getElementById('chart');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  var GOLD = '#E3B34C', IVORY = '#F5EEDC';
  var candles = [];
  var price = 100;

  function nextCandle() {
    var open = price;
    var drift = (Math.random() - 0.44) * 3.2; // slight upward bias
    var close = open + drift;
    var high = Math.max(open, close) + Math.random() * 1.6;
    var low = Math.min(open, close) - Math.random() * 1.6;
    var vol = 0.25 + Math.random() * 0.75;
    price = close;
    return { open: open, close: close, high: high, low: low, vol: vol };
  }

  var W = 0, H = 0, candleW = 0, gap = 0, perView = 0;

  function resize() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    perView = Math.max(24, Math.floor(W / 30));
    candleW = Math.min(13, (W / perView) * 0.5);
    gap = W / perView;
    while (candles.length < perView + 4) candles.push(nextCandle());
    if (reduceMotion) draw();
  }

  function bounds() {
    var min = Infinity, max = -Infinity;
    for (var i = 0; i < candles.length; i++) {
      min = Math.min(min, candles[i].low);
      max = Math.max(max, candles[i].high);
    }
    return { min: min, max: max, span: Math.max(max - min, 1) };
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var b = bounds();
    var chartH = H * 0.6, topPad = H * 0.08;
    var y = function (p) { return topPad + (1 - (p - b.min) / b.span) * chartH; };
    var volBase = H * 0.96, volMaxH = H * 0.16;

    // horizontal hairlines
    ctx.strokeStyle = 'rgba(227,179,76,0.07)';
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) {
      var gy = topPad + (chartH / 4) * g;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    for (var i = 0; i < candles.length; i++) {
      var c = candles[i];
      var x = W - (candles.length - i) * gap + gap * 0.5;
      if (x < -gap || x > W + gap) continue;
      var up = c.close >= c.open;
      var col = up ? GOLD : IVORY;
      var alpha = up ? 0.9 : 0.55;

      // volume bar
      ctx.fillStyle = up ? 'rgba(227,179,76,0.30)' : 'rgba(245,238,220,0.15)';
      var vh = c.vol * volMaxH;
      ctx.fillRect(x - candleW / 2, volBase - vh, candleW, vh);

      // wick
      ctx.strokeStyle = col;
      ctx.globalAlpha = alpha * 0.75;
      ctx.beginPath(); ctx.moveTo(x, y(c.high)); ctx.lineTo(x, y(c.low)); ctx.stroke();

      // body with soft glow on up candles
      ctx.globalAlpha = alpha;
      if (up) { ctx.shadowColor = 'rgba(227,179,76,0.5)'; ctx.shadowBlur = 12; }
      var bodyTop = y(Math.max(c.open, c.close));
      var bodyH = Math.max(2, Math.abs(y(c.open) - y(c.close)));
      ctx.fillStyle = col;
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  // candle lifecycle: breathe current candle, then commit and shift
  var life = 0, LIFE_MS = 1500, last = 0;

  function tick(now) {
    if (!last) last = now;
    var dt = now - last; last = now;
    life += dt;

    // mutate the live candle so it feels alive
    var live = candles[candles.length - 1];
    var wobble = Math.sin(now / 380) * 0.35;
    live.close = live.open + (live.close - live.open) * 0.985 + wobble * 0.05;
    live.high = Math.max(live.high, live.close);
    live.low = Math.min(live.low, live.close);

    if (life >= LIFE_MS) {
      life = 0;
      candles.push(nextCandle());
      if (candles.length > perView + 6) candles.shift();
    }
    draw();
    requestAnimationFrame(tick);
  }

  resize();
  window.addEventListener('resize', resize);
  if (!reduceMotion) requestAnimationFrame(tick);
})();
