/* DVE Strategy — showpiece interactions.
   Motion budget: transform + opacity only, entrances < 700ms. */

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

/* ---------- Signature element: living volume chart ----------
   A slow random-walk candlestick series with volume bars, drawn
   in gold/ivory on the warm ground. New candles form on the right,
   the series drifts left, the latest candle breathes. */
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
    perView = Math.max(28, Math.floor(W / 34));
    candleW = Math.min(14, (W / perView) * 0.5);
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

  function draw(progress) {
    ctx.clearRect(0, 0, W, H);
    var b = bounds();
    var chartH = H * 0.62, topPad = H * 0.1;
    var y = function (p) { return topPad + (1 - (p - b.min) / b.span) * chartH; };
    var volBase = H * 0.94, volMaxH = H * 0.13;

    // horizontal hairlines
    ctx.strokeStyle = 'rgba(227,179,76,0.06)';
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) {
      var gy = topPad + (chartH / 4) * g;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    var offset = (1 - (progress == null ? 1 : progress)) * gap;

    for (var i = 0; i < candles.length; i++) {
      var c = candles[i];
      var x = W - (candles.length - i) * gap + gap * 0.5 - offset;
      if (x < -gap || x > W + gap) continue;
      var up = c.close >= c.open;
      var col = up ? GOLD : IVORY;
      var alpha = up ? 0.9 : 0.55;

      // volume bar
      ctx.fillStyle = up ? 'rgba(227,179,76,0.28)' : 'rgba(245,238,220,0.14)';
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
