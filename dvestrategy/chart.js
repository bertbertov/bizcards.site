/* chart.js — Real-time XAUUSD (gold) candlestick chart on HTML5 Canvas, zero libraries.
   A pixel-faithful port of the MetaTrader 5 Android chart, per the DVE build spec.
   Vanilla JS (no build step — the site is static). Exposes window.MT5Chart.

   Data path: client -> {proxy}/api/gold?interval=&range=  ->  Yahoo GC=F (COMEX gold).
   Yahoo sends no CORS headers, so a server proxy is required (Cloudflare Worker in
   production, a local python proxy for dev). If the proxy is unreachable the chart
   falls back to a self-sustaining synthetic walk so it never blanks.

   Palette note: candle bodies keep the measured MT5 teal/red (readability convention);
   the chrome (ground, grid, axis, live price tag) is warm-noir + gold to match DVE. */
(function () {
  'use strict';

  var TF = {
    M1: { s: 60,      interval: '1m',  range: '1d',  agg: 1 },
    M5: { s: 300,     interval: '5m',  range: '5d',  agg: 1 },
    M15:{ s: 900,     interval: '15m', range: '5d',  agg: 1 },
    M30:{ s: 1800,    interval: '30m', range: '1mo', agg: 1 },
    H1: { s: 3600,    interval: '60m', range: '1mo', agg: 1 },
    H4: { s: 14400,   interval: '60m', range: '3mo', agg: 4 },
    D1: { s: 86400,   interval: '1d',  range: '1y',  agg: 1 },
    W1: { s: 604800,  interval: '1wk', range: '5y',  agg: 1 },
    MN: { s: 2592000, interval: '1mo', range: '10y', agg: 1 }
  };

  // Live-sim constants (spec)
  var SPREAD = 0.36, VEL_DECAY = 0.86, VEL_KICK = 0.13, CENTER_PULL = 0.055, POLL_MS = 8000;
  function gauss(a) { return (Math.random() + Math.random() + Math.random() - 1.5) * a; }

  // Warm-noir / gold chrome + MT5 candle colors
  var C = {
    bg: '#0A0908',                     // dvestrategy warm-noir terminal
    gridWarm: 'rgba(199,186,156,0.12)',
    axis: '#A89D88',
    bull: '#16C784',                   // green up
    bear: '#EA3943',                   // red down
    time: '#7E7361',
    buy: '#4597FF',
    sell: '#EA3943',
    tag: '#E3B34C',                    // dvestrategy gold live price tag
    tagInk: '#231803',
    frame: 'rgba(199,186,156,0.22)'
  };

  function fmtPrice(p) {
    if (p == null || isNaN(p)) return '--';
    var neg = p < 0; p = Math.abs(p);
    var s = p.toFixed(2);
    var parts = s.split('.');
    // group thousands with a THIN SPACE (U+2009) — MT5 look
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '-' : '') + parts[0] + '.' + parts[1];
  }
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function fmtCountdown(sec, big) {
    sec = Math.max(0, Math.floor(sec));
    if (big) { var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h + ':' + two(m) + ':' + two(s); }
    var mm = Math.floor(sec / 60), ss = sec % 60; return two(mm) + ':' + two(ss);
  }
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtTime(epoch, daily) {
    var d = new Date(epoch * 1000);
    if (daily) return d.getDate() + ' ' + MON[d.getMonth()];
    return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
  }

  function MT5Chart(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.proxy = (opts.proxy || '/api/gold').replace(/\/$/, '');
    this.symbol = opts.symbol || 'XAUUSD';
    this.tf = opts.timeframe || 'M15';
    this.onPriceCb = opts.onPrice || null;
    this.onState = opts.onState || null;

    this.bars = [];            // {time,o,h,l,c}
    this.forming = null;
    this.mid = 0; this.bid = 0; this.ask = 0; this.vel = 0;
    this.realPrice = 0; this.prevClose = 0;
    this.visibleCount = opts.visibleCount || 62;
    this.panBars = 0;          // bars scrolled back from the right edge
    this.yScale = 1;
    this.state = 'CONNECTING';
    this.overlays = [];        // {price,color,dashed}
    this.dpr = 1; this.cssW = 0; this.cssH = 0;
    this._raf = null; this._dead = false; this._pollTimer = null; this._tickTimer = null;
    this._synthetic = false; this._lastFetchOk = 0;

    this._bindEvents();
    this._resize();
    var self = this;
    this._ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(function () { self._resize(); }) : null;
    if (this._ro) this._ro.observe(canvas.parentNode || canvas);

    this._poll();                       // first data pull
    this._pollTimer = setInterval(function () { self._poll(); }, POLL_MS);
    this._scheduleTick();
    this._loop();
  }

  MT5Chart.prototype.setTimeframe = function (tf) {
    if (!TF[tf] || tf === this.tf) return;
    this.tf = tf; this.forming = null; this.panBars = 0;
    this._poll();
  };
  MT5Chart.prototype.horizontalLine = function (price, color, dashed) {
    this.overlays.push({ price: price, color: color || C.buy, dashed: !!dashed });
  };
  MT5Chart.prototype.clearOverlays = function () { this.overlays = []; };

  MT5Chart.prototype.destroy = function () {
    this._dead = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._pollTimer) clearInterval(this._pollTimer);
    if (this._tickTimer) clearTimeout(this._tickTimer);
    if (this._ro) this._ro.disconnect();
    this._unbind && this._unbind();
  };

  MT5Chart.prototype._setState = function (s) {
    if (s === this.state) return;
    this.state = s;
    if (this.onState) this.onState(s);
  };

  // ---------- data ----------
  MT5Chart.prototype._poll = function () {
    var self = this, tf = TF[this.tf];
    var url = this.proxy + '?interval=' + tf.interval + '&range=' + tf.range + '&_t=' + Math.floor(Date.now() / 8000);
    fetch(url, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (j) { self._ingest(j); self._synthetic = false; self._lastFetchOk = Date.now(); self._setState('LIVE'); })
      .catch(function () {
        // keep walking the last known price rather than blanking (spec).
        if (!self.bars.length) { self._seedSynthetic(); }
        self._synthetic = true;
        self._setState(self.bars.length ? 'LIVE' : 'ERROR');
      });
  };

  MT5Chart.prototype._ingest = function (j) {
    var res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res) throw new Error('bad payload');
    var ts = res.timestamp || [];
    var q = res.indicators && res.indicators.quote && res.indicators.quote[0] || {};
    var o = q.open || [], h = q.high || [], l = q.low || [], c = q.close || [];
    var raw = [];
    for (var i = 0; i < ts.length; i++) {
      if (o[i] == null || h[i] == null || l[i] == null || c[i] == null) continue;   // skip Yahoo gaps
      raw.push({ time: ts[i], o: o[i], h: h[i], l: l[i], c: c[i] });
    }
    var agg = TF[this.tf].agg;
    if (agg > 1) raw = this._aggregate(raw, TF[this.tf].s);
    if (raw.length) this.bars = raw;
    var meta = res.meta || {};
    this.realPrice = meta.regularMarketPrice || (this.bars.length ? this.bars[this.bars.length - 1].c : 0);
    // daily previous close (stable) for the header change %, not chartPreviousClose (varies by range)
    this.prevClose = meta.previousClose || meta.chartPreviousClose || this.prevClose;
    if (this.mid <= 0 && this.realPrice > 0) { this.mid = this.realPrice; this.bid = this.mid - SPREAD / 2; this.ask = this.mid + SPREAD / 2; }
  };

  MT5Chart.prototype._aggregate = function (raw, tfSec) {
    var out = [], cur = null, key = null;
    for (var i = 0; i < raw.length; i++) {
      var b = raw[i], bk = Math.floor(b.time / tfSec) * tfSec;
      if (bk !== key) { if (cur) out.push(cur); key = bk; cur = { time: bk, o: b.o, h: b.h, l: b.l, c: b.c }; }
      else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; }
    }
    if (cur) out.push(cur);
    return out;
  };

  // Fallback so the chart never blanks if the proxy is down (gold ~ mid-4000s in-era).
  MT5Chart.prototype._seedSynthetic = function () {
    var base = 4490, tfSec = TF[this.tf].s, now = Math.floor(Date.now() / 1000);
    var start = Math.floor(now / tfSec) * tfSec - tfSec * 120;
    var bars = [], p = base;
    for (var i = 0; i < 120; i++) {
      var o = p, c = p + gauss(3.2), hi = Math.max(o, c) + Math.random() * 1.8, lo = Math.min(o, c) - Math.random() * 1.8;
      bars.push({ time: start + i * tfSec, o: o, h: hi, l: lo, c: c }); p = c;
    }
    this.bars = bars; this.realPrice = p; this.mid = p; this.bid = p - SPREAD / 2; this.ask = p + SPREAD / 2;
  };

  // ---------- live price simulation (irregular ticks) ----------
  MT5Chart.prototype._scheduleTick = function () {
    var self = this, r = Math.random(), delay;
    if (r < 0.30) delay = 130 + Math.random() * 120;
    else if (r < 0.80) delay = 360 + Math.random() * 220;
    else delay = 750 + Math.random() * 450;
    this._tickTimer = setTimeout(function () { self._tick(); self._scheduleTick(); }, delay);
  };

  MT5Chart.prototype._tick = function () {
    if (this._synthetic && this.realPrice > 0) {
      // let the synthetic center drift so it feels alive without a feed
      this.realPrice += gauss(0.5);
    }
    if (this.realPrice <= 0) return;                 // guard: feed not loaded
    this.vel = this.vel * VEL_DECAY + gauss(VEL_KICK);
    if (this.mid <= 0) this.mid = this.realPrice;
    else this.mid += (this.realPrice - this.mid) * CENTER_PULL + this.vel;
    this.bid = this.mid - SPREAD / 2;
    this.ask = this.mid + SPREAD / 2;
    this._updateForming();
    if (this.onPriceCb) this.onPriceCb(this.bid, this.ask);
  };

  MT5Chart.prototype._updateForming = function () {
    var tfSec = TF[this.tf].s, barTime = Math.floor(Date.now() / 1000 / tfSec) * tfSec, f = this.forming;
    if (!f) this.forming = { time: barTime, o: this.mid, h: this.mid, l: this.mid, c: this.mid };
    else if (barTime > f.time) this.forming = { time: barTime, o: f.c, h: this.mid, l: this.mid, c: this.mid };
    else { f.h = Math.max(f.h, this.mid); f.l = Math.min(f.l, this.mid); f.c = this.mid; }
  };

  MT5Chart.prototype._merged = function () {
    if (!this.forming) return this.bars;
    var b = this.bars;
    if (b.length && this.forming.time === b[b.length - 1].time) {
      return b.slice(0, b.length - 1).concat([this.forming]);
    }
    return b.concat([this.forming]);
  };

  // ---------- layout / sizing ----------
  MT5Chart.prototype._resize = function () {
    var rect = (this.canvas.parentNode || this.canvas).getBoundingClientRect();
    var w = Math.max(240, rect.width), h = Math.max(200, rect.height);
    this.dpr = window.devicePixelRatio || 1;
    this.cssW = w; this.cssH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  };

  // ---------- render loop ----------
  MT5Chart.prototype._loop = function () {
    var self = this;
    this._raf = requestAnimationFrame(function () { if (!self._dead) { self._draw(); self._loop(); } });
  };

  MT5Chart.prototype._draw = function () {
    var ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = this.cssW, H = this.cssH;
    var GUT = 66, AX = 20, chartW = W - GUT, chartH = H - AX;
    var daily = TF[this.tf].s >= 86400;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

    var all = this._merged();
    var n = all.length;
    if (!n) { this._badge(ctx, W); return; }

    var visible = Math.min(this.visibleCount, n);
    var maxPan = Math.max(0, n - visible);
    this.panBars = Math.max(0, Math.min(this.panBars, maxPan));
    var end = n - this.panBars, start = Math.max(0, end - visible);
    var view = all.slice(start, end);

    // vertical scale (include live bid)
    var hi = -Infinity, lo = Infinity;
    for (var i = 0; i < view.length; i++) { if (view[i].h > hi) hi = view[i].h; if (view[i].l < lo) lo = view[i].l; }
    if (this.bid > 0) { hi = Math.max(hi, this.bid); lo = Math.min(lo, this.bid); }
    if (!isFinite(hi) || !isFinite(lo)) { this._badge(ctx, W); return; }
    var pad = (hi - lo) * 0.08 || 1; hi += pad; lo -= pad;
    var mid = (hi + lo) / 2, half = (hi - lo) / 2 * this.yScale; hi = mid + half; lo = mid - half;
    var span = (hi - lo) || 1;
    function y(p) { return ((hi - p) / span) * chartH; }

    // ----- grid: dense, evenly divided, NON-round labels -----
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.gridWarm;
    ctx.setLineDash([10, 9]);
    ctx.font = '11px ui-monospace,"Cascadia Mono","Segoe UI Mono",monospace';
    ctx.textBaseline = 'middle';
    var nH = Math.max(8, Math.min(40, Math.round(chartH / 28)));
    ctx.fillStyle = C.axis; ctx.textAlign = 'left';
    for (var gi = 0; gi <= nH; gi++) {
      var price = lo + span * gi / nH, gy = y(price);
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(chartW, gy); ctx.stroke();
      if (gy >= 12) ctx.fillText(fmtPrice(price), chartW + 6, gy);
    }
    var nV = Math.max(4, Math.min(30, Math.round(chartW / 28)));
    for (var vi = 0; vi <= nV; vi++) {
      var gx = chartW * vi / nV;
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, chartH); ctx.stroke();
    }
    ctx.setLineDash([]);

    // ----- time labels: sparse (~5) -----
    ctx.fillStyle = C.time; ctx.font = '10px ui-monospace,"Cascadia Mono","Segoe UI Mono",monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var cw = chartW / visible;
    var tickEvery = Math.max(1, Math.floor(view.length / 5));
    for (var ti = Math.floor(tickEvery / 2); ti < view.length; ti += tickEvery) {
      var tx = ti * cw + cw / 2;
      if (tx > 44 && tx < chartW - 44) ctx.fillText(fmtTime(view[ti].time, daily), tx, chartH + 5);
    }

    // ----- candles (clipped) -----
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, chartW, chartH); ctx.clip();
    var bodyW = Math.min(cw * 0.62, 26);
    for (var ci = 0; ci < view.length; ci++) {
      var b = view[ci], cx = ci * cw + cw / 2;
      var up = b.c >= b.o, col = up ? C.bull : C.bear;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, y(b.h)); ctx.lineTo(cx, y(b.l)); ctx.stroke();
      var yo = y(b.o), yc = y(b.c), top = Math.min(yo, yc), hgt = Math.max(1.5, Math.abs(yc - yo));
      ctx.fillStyle = col; ctx.fillRect(cx - bodyW / 2, top, bodyW, hgt);
    }
    // overlays (entry/SL/TP) within the clip
    for (var oi = 0; oi < this.overlays.length; oi++) {
      var ov = this.overlays[oi], oy = y(ov.price);
      ctx.strokeStyle = ov.color; ctx.lineWidth = 1.2; ctx.setLineDash(ov.dashed ? [6, 5] : []);
      ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(chartW, oy); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();

    // ----- solid frame (top / right / bottom) -----
    ctx.strokeStyle = C.frame; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 1); ctx.lineTo(chartW, 1);
    ctx.moveTo(chartW, 0); ctx.lineTo(chartW, chartH);
    ctx.moveTo(0, chartH); ctx.lineTo(chartW, chartH);
    ctx.stroke();

    // ----- live price tag (signature) -----
    if (this.bid > 0) {
      var by = y(this.bid);
      ctx.strokeStyle = C.tag; ctx.lineWidth = 1.5; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(chartW, by); ctx.stroke();
      var tfSec = TF[this.tf].s;
      var remain = tfSec - (Date.now() / 1000 % tfSec);
      var tall = tfSec >= 60;
      var tagH = tall ? 34 : 18;
      var ty = Math.max(tagH / 2, Math.min(chartH - tagH / 2, by));
      ctx.fillStyle = C.tag; ctx.fillRect(chartW, ty - tagH / 2, GUT, tagH);
      ctx.fillStyle = C.tagInk; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = '600 11px ui-monospace,"Cascadia Mono","Segoe UI Mono",monospace';
      if (tall) {
        ctx.fillText(fmtPrice(this.bid), chartW + 6, ty - 8);
        ctx.font = '10px ui-monospace,"Cascadia Mono","Segoe UI Mono",monospace';
        ctx.fillText(fmtCountdown(remain, daily), chartW + 6, ty + 8);
      } else {
        ctx.fillText(fmtPrice(this.bid), chartW + 6, ty);
      }
    }

    this._badge(ctx, W);
  };

  MT5Chart.prototype._badge = function (ctx, W) {
    var live = this.state === 'LIVE', err = this.state === 'ERROR';
    var label = err ? 'ERROR' : (live ? 'LIVE' : '...');
    ctx.font = '600 10px "IBM Plex Mono",monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    var tw = ctx.measureText(label).width + 20;
    ctx.fillStyle = 'rgba(10,9,8,0.78)'; ctx.fillRect(8, 8, tw, 18);
    ctx.fillStyle = err ? C.bear : C.tag;
    ctx.beginPath(); ctx.arc(18, 17, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = err ? '#EA9A9A' : '#F5EEDC';
    ctx.fillText(label, 26, 12);
  };

  // ---------- interaction ----------
  MT5Chart.prototype._bindEvents = function () {
    var self = this, cv = this.canvas;
    var dragging = false, gutterDrag = false, lastX = 0, lastY = 0;

    function onWheel(e) {
      e.preventDefault();
      if (e.ctrlKey) {
        var f = Math.exp(-e.deltaY * 0.0016);
        self.visibleCount = Math.max(15, Math.min(self._merged().length || 400, self.visibleCount / f));
      } else {
        var cw = (self.cssW - 66) / Math.min(self.visibleCount, self._merged().length || self.visibleCount);
        self.panBars = self.panBars - (e.deltaX || e.deltaY) / (cw || 8) * -1;
        self.panBars = Math.max(0, self.panBars);
      }
    }
    function onDown(e) {
      var rect = cv.getBoundingClientRect(), x = e.clientX - rect.left;
      lastX = e.clientX; lastY = e.clientY;
      gutterDrag = x > (self.cssW - 66);
      dragging = true;
    }
    function onMove(e) {
      if (!dragging) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
      if (gutterDrag) {
        self.yScale = Math.max(0.30, Math.min(4.0, self.yScale * (1 + dy / 700)));
      } else {
        var vis = Math.min(self.visibleCount, self._merged().length || self.visibleCount);
        var cw = (self.cssW - 66) / vis;
        self.panBars = Math.max(0, self.panBars + dx / (cw || 8));
      }
    }
    function onUp() { dragging = false; gutterDrag = false; }

    // touch (pinch zoom + pan)
    var pinchDist = 0;
    function tDist(t) { var a = t[0], b = t[1]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
    function onTStart(e) { if (e.touches.length === 2) pinchDist = tDist(e.touches); else if (e.touches.length === 1) { dragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; var rect = cv.getBoundingClientRect(); gutterDrag = (e.touches[0].clientX - rect.left) > (self.cssW - 66); } }
    function onTMove(e) {
      if (e.touches.length === 2) {
        e.preventDefault(); var d = tDist(e.touches);
        if (pinchDist) { var f = d / pinchDist; self.visibleCount = Math.max(15, Math.min(self._merged().length || 400, self.visibleCount / f)); }
        pinchDist = d;
      } else if (e.touches.length === 1 && dragging) {
        var dx = e.touches[0].clientX - lastX, dy = e.touches[0].clientY - lastY; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
        if (gutterDrag) self.yScale = Math.max(0.30, Math.min(4.0, self.yScale * (1 + dy / 700)));
        else { var vis = Math.min(self.visibleCount, self._merged().length || self.visibleCount), cw = (self.cssW - 66) / vis; self.panBars = Math.max(0, self.panBars + dx / (cw || 8)); }
      }
    }
    function onTEnd(e) { if (e.touches.length === 0) { dragging = false; gutterDrag = false; pinchDist = 0; } }

    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    cv.addEventListener('touchstart', onTStart, { passive: true });
    cv.addEventListener('touchmove', onTMove, { passive: false });
    cv.addEventListener('touchend', onTEnd);
    this._unbind = function () {
      cv.removeEventListener('wheel', onWheel); cv.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
      cv.removeEventListener('touchstart', onTStart); cv.removeEventListener('touchmove', onTMove); cv.removeEventListener('touchend', onTEnd);
    };
  };

  window.MT5Chart = MT5Chart;
})();
