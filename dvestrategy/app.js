/* app.js — DVE Strategy (Tradestone-faithful build). Nav, provider cards, live chart, signup. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  document.addEventListener('DOMContentLoaded', function () {

    /* header shadow on scroll (matches Tradestone: is-scrolled) */
    var header = $('[data-tm-header]');
    var onScroll = function () { if (header) header.classList.toggle('is-scrolled', window.scrollY > 8); };
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

    /* mobile nav — Tradestone opens the nav via body.tm-nav-open */
    var toggle = $('[data-tm-nav-toggle]'), navEl = $('[data-tm-nav]');
    function setNav(open) {
      document.body.classList.toggle('tm-nav-open', open);
      if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (toggle) toggle.addEventListener('click', function () { setNav(!document.body.classList.contains('tm-nav-open')); });
    if (navEl) $$('a', navEl).forEach(function (a) { a.addEventListener('click', function () { setNav(false); }); });
    /* close open dropdowns when clicking elsewhere; single-open accordion feel */
    document.addEventListener('click', function (e) {
      $$('.tm-nav-menu[open]').forEach(function (d) { if (!d.contains(e.target)) d.removeAttribute('open'); });
    });

    /* copy-trading provider cards (illustrative) */
    var providers = [
      { name: 'Kwame A.', tag: 'Gold · FX', risk: 'Medium', ret: '+38.2%' },
      { name: 'Daniel O.', tag: 'Indices', risk: 'Low', ret: '+21.6%' },
      { name: 'Marcus L.', tag: 'Gold · Crypto', risk: 'Medium', ret: '+44.9%' }
    ];
    var pl = $('#providersList');
    if (pl) {
      pl.innerHTML = providers.map(function (p) {
        var initials = p.name.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2);
        return '<article class="dve-provider">' +
          '<div class="dve-avatar">' + initials + '</div>' +
          '<div><h3>' + p.name + '</h3><div class="tag"><span>' + p.tag + '</span><span>Risk ' + p.risk + '</span></div></div>' +
          '<div class="dve-provider-stat"><b>' + p.ret + '</b><span>12-mo illustrative</span></div>' +
          '</article>';
      }).join('');
    }

    /* instrument tabs (XAU/USD live; others demo) */
    var mkTabs = $$('.tm-mkt-tab');
    mkTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        mkTabs.forEach(function (t) { t.classList.remove('is-active'); });
        tab.classList.add('is-active');
        if (tab.textContent.indexOf('XAU') === -1) flashNote('The live chart shows XAU/USD (gold). The full terminal covers 100+ markets.');
      });
    });

    /* live gold chart */
    var canvas = $('#goldChart'), chart = null;
    if (canvas && window.MT5Chart) {
      var bidEl = $('#chartBid'), chgEl = $('#chartChg');
      chart = new MT5Chart(canvas, {
        proxy: window.DVE_GOLD_PROXY || '/api/gold',
        timeframe: 'M15',
        onPrice: function (bid) {
          if (bidEl) bidEl.textContent = fmt(bid);
          var pc = chart.prevClose || 0;
          if (pc > 0 && chgEl) {
            var pct = (bid - pc) / pc * 100;
            chgEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
            chgEl.className = 'tm-chart-chg ' + (pct >= 0 ? 'tm-up' : 'tm-down');
          }
        }
      });
      window.addEventListener('beforeunload', function () { chart.destroy(); });
      $$('#tfRow .tm-tf').forEach(function (b) {
        b.addEventListener('click', function () {
          $$('#tfRow .tm-tf').forEach(function (x) { x.classList.remove('is-active'); });
          b.classList.add('is-active');
          chart.setTimeframe(b.getAttribute('data-tf'));
        });
      });
    }
    function fmt(p) {
      if (p == null || isNaN(p)) return '';
      var s = Math.abs(p).toFixed(2).split('.');
      s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
      return (p < 0 ? '-' : '') + s[0] + '.' + s[1];
    }

    /* signup -> hand off to secure enrollment */
    var form = $('#signupForm'), msg = $('#signupMsg');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = $('#su-name').value.trim(), email = $('#su-email').value.trim(),
            pass = $('#su-pass').value, country = $('#su-country').value.trim(), agree = $('#su-agree').checked;
        if (!name || !email || !pass || !country) { setMsg('Please complete all required fields.', true); return; }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setMsg('Please enter a valid email address.', true); return; }
        if (!agree) { setMsg('Please accept the terms to continue.', true); return; }
        setMsg('Continuing to secure enrollment', false);
        try { sessionStorage.setItem('dve.signup', JSON.stringify({ name: name, email: email, country: country })); } catch (er) {}
        setTimeout(function () { window.location.href = 'https://dvestrategy.com/register'; }, 650);
      });
    }
    function setMsg(t, isErr) { if (!msg) return; msg.textContent = t; msg.style.color = isErr ? '#EA3943' : 'var(--tm-primary)'; }

    /* transient note */
    var noteEl = null, noteTimer = null;
    function flashNote(text) {
      if (!noteEl) {
        noteEl = document.createElement('div');
        noteEl.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:220;background:#05090C;border:1px solid rgba(148,163,184,.28);color:#F8FAFC;font-family:Inter,sans-serif;font-size:13px;padding:11px 16px;border-radius:8px;box-shadow:0 16px 40px rgba(0,0,0,.5);max-width:88vw;text-align:center;opacity:0;transition:opacity .25s';
        document.body.appendChild(noteEl);
      }
      noteEl.textContent = text; noteEl.style.opacity = '1';
      clearTimeout(noteTimer); noteTimer = setTimeout(function () { noteEl.style.opacity = '0'; }, 2600);
    }
  });
})();
