// Client-side search over the site's search-index.json.
(function () {
  'use strict';

  var input = document.getElementById('search-input');
  var results = document.getElementById('search-results');
  if (!input || !results) return;

  var rootPrefix = input.getAttribute('data-root-prefix') || '';
  var indexUrl = input.getAttribute('data-search-index');
  var index = null;
  var activeIdx = -1;

  function loadIndex() {
    if (index !== null) return Promise.resolve(index);
    return fetch(indexUrl)
      .then(function (r) { return r.json(); })
      .then(function (data) { index = data; return index; })
      .catch(function () { index = []; return index; });
  }

  function score(entry, terms) {
    var title = entry.title.toLowerCase();
    var text = (entry.text || '').toLowerCase();
    var total = 0;
    for (var i = 0; i < terms.length; i++) {
      var term = terms[i];
      if (!term) continue;
      var inTitle = title.indexOf(term) !== -1;
      var inText = text.indexOf(term) !== -1;
      if (!inTitle && !inText) return 0;
      total += inTitle ? 10 : 1;
      if (title === term) total += 20;
    }
    return total;
  }

  function snippet(entry, terms) {
    var text = entry.text || '';
    var lower = text.toLowerCase();
    var pos = -1;
    for (var i = 0; i < terms.length; i++) {
      pos = lower.indexOf(terms[i]);
      if (pos !== -1) break;
    }
    if (pos === -1) pos = 0;
    var start = Math.max(0, pos - 40);
    return (start > 0 ? '…' : '') + text.slice(start, start + 140);
  }

  function hide() {
    results.hidden = true;
    results.innerHTML = '';
    activeIdx = -1;
  }

  function render(matches, terms) {
    if (!matches.length) {
      results.innerHTML = '<span class="no-results">No results</span>';
      results.hidden = false;
      return;
    }
    results.innerHTML = '';
    matches.forEach(function (entry) {
      var a = document.createElement('a');
      a.href = rootPrefix + entry.path;
      var title = document.createElement('div');
      title.className = 'result-title';
      title.textContent = entry.title;
      var text = document.createElement('div');
      text.className = 'result-text';
      text.textContent = snippet(entry, terms);
      a.appendChild(title);
      a.appendChild(text);
      results.appendChild(a);
    });
    results.hidden = false;
    activeIdx = -1;
  }

  function search() {
    var query = input.value.trim().toLowerCase();
    if (query.length < 2) { hide(); return; }
    var terms = query.split(/\s+/);
    loadIndex().then(function (entries) {
      var matches = entries
        .map(function (entry) { return { entry: entry, s: score(entry, terms) }; })
        .filter(function (m) { return m.s > 0; })
        .sort(function (a, b) { return b.s - a.s; })
        .slice(0, 8)
        .map(function (m) { return m.entry; });
      render(matches, terms);
    });
  }

  input.addEventListener('input', search);
  input.addEventListener('focus', function () {
    if (input.value.trim().length >= 2) search();
  });

  input.addEventListener('keydown', function (e) {
    var links = results.querySelectorAll('a');
    if (e.key === 'Escape') { hide(); input.blur(); return; }
    if (!links.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx += e.key === 'ArrowDown' ? 1 : -1;
      activeIdx = (activeIdx + links.length) % links.length;
      links.forEach(function (l, i) { l.classList.toggle('active', i === activeIdx); });
      links[activeIdx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      links[activeIdx].click();
    }
  });

  document.addEventListener('click', function (e) {
    if (!results.contains(e.target) && e.target !== input) hide();
  });

  // "/" focuses search from anywhere.
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== input &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      input.focus();
    }
  });
})();
