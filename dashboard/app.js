// Token Radar's page: renders window.RADAR with no fetch and no network.
// State lives in the URL hash (q, category, chain, watch, tab, sort, p),
// so a filtered view, a sorted board and an open detail are all linkable.

(function () {
  'use strict';

  var DATA = window.RADAR || null;
  var el = function (id) { return document.getElementById(id); };

  if (!DATA) {
    el('meta').textContent = 'No data loaded: data.js is missing or empty.';
    return;
  }

  var WATCH = new Set(DATA.watchlist || []);
  var state = { q: '', category: '', chain: '', watch: false, tab: 'pre', sort: 'rank', dir: 1, p: '' };

  // ---------- formatting ----------

  function money(v) {
    if (v === null || v === undefined) return '—';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(v);
  }

  function pct(v) {
    if (v === null || v === undefined) return '—';
    return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  }

  function ageText(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30.4) + 'mo';
    var y = days / 365;
    return y.toFixed(1) + 'y';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function changeClass(v) {
    if (v === null || v === undefined) return 'flat';
    return v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  }

  // ---------- hash state ----------

  function readHash() {
    var h = new URLSearchParams(window.location.hash.slice(1));
    state.q = h.get('q') || '';
    state.category = h.get('category') || '';
    state.chain = h.get('chain') || '';
    state.watch = h.get('watch') === '1';
    state.tab = h.get('tab') || 'pre';
    if (['pre', 'live', 'comps'].indexOf(state.tab) === -1) state.tab = 'pre';
    state.sort = h.get('sort') || 'rank';
    state.dir = h.get('dir') === '-1' ? -1 : 1;
    state.p = h.get('p') || '';
  }

  function writeHash() {
    var h = new URLSearchParams();
    if (state.q) h.set('q', state.q);
    if (state.category) h.set('category', state.category);
    if (state.chain) h.set('chain', state.chain);
    if (state.watch) h.set('watch', '1');
    if (state.tab !== 'pre') h.set('tab', state.tab);
    if (state.sort !== 'rank') h.set('sort', state.sort);
    if (state.dir === -1) h.set('dir', '-1');
    if (state.p) h.set('p', state.p);
    var s = h.toString();
    history.replaceState(null, '', s ? '#' + s : window.location.pathname);
  }

  // ---------- header, lede, facts ----------

  function initHeader() {
    el('meta').textContent = 'Snapshot ' + DATA.as_of + ' · ' + DATA.source + ' · floor ' + money(DATA.floor_usd);
    var top = DATA.rows[0];
    el('lede-text').innerHTML =
      'This board ranks <strong>' + DATA.board_size + ' protocols that record no token</strong> — ' +
      'the whole ' + DATA.watchlist_size + '-protocol watchlist, plus ' + DATA.early_size +
      ' smaller pre-token protocols below the ' + money(DATA.floor_usd) +
      ' floor — by the implied value of their launch, priced from the market\'s own comps. ' +
      'Top of the board: <strong>' + esc(top.name) + '</strong> at ' + money(top.implied_value_usd) + '.';
    var total = DATA.rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
    var median = DATA.rows[Math.floor(DATA.rows.length / 2)].implied_value_usd;
    var cats = new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorised'; })).size;
    el('facts').innerHTML = [
      ['Board size', DATA.board_size + ' rows'],
      ['Total implied value', money(total)],
      ['Median implied value', money(median)],
      ['Categories', String(cats)],
      ['Global comp', DATA.global_multiple.toFixed(2) + '×'],
      ['Model', DATA.model_version],
    ].map(function (f) { return '<div><dt>' + f[0] + '</dt><dd>' + esc(f[1]) + '</dd></div>'; }).join('');
  }

  // ---------- controls ----------

  /** Put the controls' values back in line with the hash state: a link to a
   *  filtered view must show the filter it applies. */
  function syncControls() {
    el('q').value = state.q;
    el('category').value = state.category;
    el('chain').value = state.chain;
    el('watch').checked = state.watch;
  }

  function fillSelect(selectEl, values) {
    values.sort();
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      selectEl.appendChild(o);
    });
  }

  function initControls() {
    var cats = new Set(), chains = new Set();
    DATA.rows.forEach(function (r) {
      if (r.category) cats.add(r.category);
      r.chains.forEach(function (c) { chains.add(c); });
    });
    fillSelect(el('category'), Array.from(cats));
    fillSelect(el('chain'), Array.from(chains));
    syncControls();

    el('q').addEventListener('input', function () { state.q = el('q').value.trim(); writeHash(); render(); });
    el('category').addEventListener('change', function () { state.category = el('category').value; writeHash(); render(); });
    el('chain').addEventListener('change', function () { state.chain = el('chain').value; writeHash(); render(); });
    el('watch').addEventListener('change', function () { state.watch = el('watch').checked; writeHash(); render(); });
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.tab = b.getAttribute('data-tab');
        state.sort = state.tab === 'live' ? 'mcap' : 'rank';
        state.dir = 1;
        writeHash(); render();
      });
    });
    document.querySelectorAll('#board thead th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
        if (key === 'rank' || key === 'implied') state.dir = key === 'rank' ? 1 : -1;
        writeHash(); render();
      });
    });
  }

  // ---------- filtering and sorting ----------

  function filteredRows() {
    var q = state.q.toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (state.watch && !WATCH.has(r.slug)) return false;
      return true;
    });
    var key = state.sort, dir = state.dir;
    rows.sort(function (a, b) {
      var d = 0;
      if (key === 'name') d = a.name.localeCompare(b.name);
      else if (key === 'tvl') d = a.tvl_usd - b.tvl_usd;
      else if (key === 'change') d = (a.change_7d === null ? -Infinity : a.change_7d) - (b.change_7d === null ? -Infinity : b.change_7d);
      else if (key === 'age') d = (a.age_days === null ? -1 : a.age_days) - (b.age_days === null ? -1 : b.age_days);
      else if (key === 'comp') d = a.comp_multiple - b.comp_multiple;
      else if (key === 'implied') d = a.implied_value_usd - b.implied_value_usd;
      else d = a.rank - b.rank;
      if (d === 0) d = a.slug < b.slug ? -1 : 1;
      return key === 'rank' ? d : d * dir;
    });
    return rows;
  }

  function filteredLive() {
    var q = state.q.toLowerCase();
    return DATA.live.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      return true;
    });
  }

  // ---------- table rendering ----------

  var PRE_HEAD = '<tr>' +
    '<th data-sort="rank" class="num" scope="col">Rank</th>' +
    '<th data-sort="name" scope="col">Protocol</th>' +
    '<th data-sort="tvl" class="num" scope="col">TVL</th>' +
    '<th data-sort="change" class="num" scope="col">7d</th>' +
    '<th data-sort="age" class="num" scope="col">Age</th>' +
    '<th data-sort="comp" class="num" scope="col">Comp ×</th>' +
    '<th data-sort="implied" class="num" scope="col">Implied value</th></tr>';

  var LIVE_HEAD = '<tr>' +
    '<th class="num" scope="col">#</th>' +
    '<th scope="col">Protocol</th>' +
    '<th class="num" scope="col">TVL</th>' +
    '<th class="num" scope="col">7d</th>' +
    '<th class="num" scope="col">Market cap</th>' +
    '<th class="num" scope="col">Mcap / TVL</th></tr>';

  function renderBoard() {
    var thead = document.querySelector('#board thead');
    var tbody = el('rows');
    if (state.tab === 'live') {
      thead.innerHTML = LIVE_HEAD;
      var live = filteredLive();
      el('count').textContent = live.length + ' of ' + DATA.live_size + ' live-token protocols, by market cap. These already trade — they are the market the comps come from, not the ranking.';
      tbody.innerHTML = live.map(function (r, i) {
        return '<tr data-slug="' + esc(r.slug) + '" data-live="1">' +
          '<td class="num rank">' + (i + 1) + '</td>' +
          '<td><span class="name">' + esc(r.name) + '</span><span class="slug">' + esc(r.slug) + '</span></td>' +
          '<td class="num">' + money(r.tvl_usd) + '</td>' +
          '<td class="num ' + changeClass(r.change_7d) + '">' + pct(r.change_7d) + '</td>' +
          '<td class="num">' + money(r.mcap_usd) + '</td>' +
          '<td class="num">' + (r.mcap_tvl === null ? '—' : r.mcap_tvl.toFixed(2) + '×') + '</td></tr>';
      }).join('');
    } else {
      thead.innerHTML = PRE_HEAD;
      var rows = filteredRows();
      // The bar scale is the board's own top value, not the filtered top.
      var max = DATA.rows[0].implied_value_usd;
      el('count').textContent = rows.length + ' of ' + DATA.board_size + ' pre-token protocols. Click a row for its value breakdown and farm plan.';
      tbody.innerHTML = rows.map(function (r) {
        var w = Math.max(2, Math.round((r.implied_value_usd / max) * 100));
        var tag = WATCH.has(r.slug) ? '<span class="watch-tag">Watchlist</span>' : '';
        return '<tr data-slug="' + esc(r.slug) + '">' +
          '<td class="num rank">' + r.rank + '</td>' +
          '<td><span class="name">' + esc(r.name) + tag + '</span><span class="slug">' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorised') + '</span></td>' +
          '<td class="num">' + money(r.tvl_usd) + '</td>' +
          '<td class="num ' + changeClass(r.change_7d) + '">' + pct(r.change_7d) + '</td>' +
          '<td class="num">' + ageText(r.age_days) + '</td>' +
          '<td class="num">' + r.comp_multiple.toFixed(2) + '×</td>' +
          '<td class="num implied-cell">' + money(r.implied_value_usd) +
          '<span class="implied-bar"><i style="width:' + w + '%"></i></span></td></tr>';
      }).join('');
      // Rebind the sort headers the head rebuild just replaced.
      document.querySelectorAll('#board thead th[data-sort]').forEach(function (th) {
        var key = th.getAttribute('data-sort');
        if (key === state.sort) { th.classList.add('sorted'); if (state.dir === 1) th.classList.add('asc'); }
        th.addEventListener('click', function () {
          if (state.sort === key) state.dir = -state.dir;
          else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
          if (key === 'rank') state.dir = 1;
          writeHash(); render();
        });
      });
    }
    tbody.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    });
  }

  function renderComps() {
    var rows = DATA.comps.slice().sort(function (a, b) { return b.multiple - a.multiple; });
    el('comps-count').textContent = rows.length + ' categories have at least three live-token protocols; their medians price the board. Global median: ' +
      DATA.global_multiple.toFixed(2) + '× across ' + DATA.global_n + ' live-token protocols.';
    var html = rows.map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.n + '</td><td class="num">' + c.multiple.toFixed(2) + '×</td></tr>';
    }).join('');
    html += '<tr><td><strong>Global (fallback)</strong></td><td class="num">' + DATA.global_n + '</td><td class="num">' + DATA.global_multiple.toFixed(2) + '×</td></tr>';
    el('comps-rows').innerHTML = html;
  }

  // ---------- detail dialog ----------

  function findRow(slug) {
    return DATA.rows.find(function (r) { return r.slug === slug; }) || null;
  }

  function openDetail(slug) {
    var r = findRow(slug);
    if (!r) return;
    state.p = slug;
    writeHash();
    var base = r.tvl_usd * r.comp_multiple;
    var compNote = r.comp_source === 'category'
      ? 'the median of ' + r.comp_n + ' live ' + (r.category || '') + ' protocols'
      : 'the global median across ' + r.comp_n + ' live protocols (fewer than three live comps in this category)';
    var dlg = el('detail');
    var wasOpen = dlg.open;
    dlg.innerHTML =
      '<div class="detail-head"><div><h2>#' + r.rank + ' ' + esc(r.name) + '</h2>' +
      '<p class="slug">' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ') || 'no chain listed') + '</p></div>' +
      '<button type="button" class="detail-close" id="detail-close">Close</button></div>' +
      '<div class="detail-body">' +
      '<h3>Snapshot</h3><dl class="kv">' +
      '<div><dt>TVL</dt><dd>' + money(r.tvl_usd) + '</dd></div>' +
      '<div><dt>7d change</dt><dd class="' + changeClass(r.change_7d) + '">' + pct(r.change_7d) + '</dd></div>' +
      '<div><dt>Age</dt><dd>' + ageText(r.age_days) + '</dd></div>' +
      '<div><dt>Chains</dt><dd>' + r.chains.length + '</dd></div>' +
      '</dl>' +
      '<h3>Value breakdown — how #' + r.rank + ' is priced</h3><ul class="waterfall">' +
      '<li><span class="wf-label">TVL × comp <b>' + r.comp_multiple.toFixed(2) + '×</b> — ' + esc(compNote) + '</span><span class="wf-value">' + money(base) + '</span></li>' +
      '<li><span class="wf-label">× growth <b>' + r.growth_multiplier.toFixed(2) + '×</b> — 7d change ' + pct(r.change_7d) + ', clamped and halved</span><span class="wf-value">' + money(base * r.growth_multiplier) + '</span></li>' +
      '<li><span class="wf-label">× maturity <b>' + r.maturity_multiplier.toFixed(2) + '×</b> — ' + ageText(r.age_days) + ' listed</span><span class="wf-value">' + money(base * r.growth_multiplier * r.maturity_multiplier) + '</span></li>' +
      '<li><span class="wf-label">× breadth <b>' + r.breadth_multiplier.toFixed(2) + '×</b> — ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '</span><span class="wf-value">' + money(r.implied_value_usd) + '</span></li>' +
      '<li><span class="wf-label">Implied value</span><span class="wf-value">' + money(r.implied_value_usd) + '</span></li>' +
      '</ul>' +
      '<h3>Farm plan</h3><ol class="steps">' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
      '</ol>' +
      '<p class="note">Implied value is a model estimate, not a price. The farm plan is a starting point, not advice — check the protocol\'s own pages before you move funds.</p>' +
      '</div>';
    el('detail-close').addEventListener('click', function () { dlg.close(); });
    if (!wasOpen) {
      dlg.addEventListener('close', function onClose() {
        dlg.removeEventListener('close', onClose);
        state.p = '';
        writeHash();
      }, { once: true });
      dlg.showModal();
    }
  }

  // ---------- render ----------

  function render() {
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === state.tab);
    });
    el('board-wrap').hidden = state.tab === 'comps';
    el('comps-wrap').hidden = state.tab !== 'comps';
    if (state.tab === 'comps') renderComps();
    else renderBoard();
  }

  readHash();
  initHeader();
  initControls();
  render();
  if (state.p) openDetail(state.p);
  window.addEventListener('hashchange', function () {
    readHash();
    syncControls();
    render();
    // The hash is the source of truth for the detail view too: a link to a
    // protocol opens it, and clearing it closes it.
    var dlg = el('detail');
    if (state.p) openDetail(state.p);
    else if (dlg.open) dlg.close();
  });
})();
