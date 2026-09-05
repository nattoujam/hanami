/*
 * Hanami デスクトップ版のフロントエンド層。
 * リポジトリ直下の index.html（GitHub Pages 版）は一切変更せず、
 * Tauri の initialization_script として document-start で注入し、
 * DOMContentLoaded 後にブラウザ API 依存の関数だけを差し替える。
 */
(function () {
  var TAURI = window.__TAURI__;
  if (!TAURI) return;

  // CDN に到達できない環境でも index.html 末尾の mermaid.initialize() で
  // 全体が止まらないようにしておく。オンラインなら本物が後から上書きする。
  if (!window.mermaid) {
    window.mermaid = {
      initialize: function () {},
      run: function () { return Promise.resolve(); }
    };
  }

  var invoke = TAURI.core.invoke;
  var listen = TAURI.event.listen;

  var MAX_HISTORY = 30;
  var state = { history: [], path: null, dir: null, text: null };

  function dirname(p) { var i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); }
  function esc(s) { return window.escHtml(String(s)); }
  function toast(m) { if (window.showToast) window.showToast(m); }

  function persist() {
    invoke('save_history', { entries: state.history }).catch(function () {});
  }

  function renderHistory() {
    var list = document.getElementById('historyList');
    if (!list) return;
    if (state.history.length === 0) {
      list.innerHTML = '<div class="history-empty">🌷 まだファイルを<br>開いていません</div>';
      return;
    }
    list.innerHTML = state.history.map(function (it) {
      return '<div class="h-item' + (state.path === it.path ? ' active' : '') + '"' +
        ' data-path="' + esc(it.path) + '" onclick="openFromHistory(this.dataset.path)">' +
        '<span class="h-icon">' + (it.type === 'csv' ? '📊' : '📄') + '</span>' +
        '<div class="h-info">' +
          '<div class="h-name" title="' + esc(it.path) + '">' + esc(it.name) + '</div>' +
          '<div class="h-date">' + esc(it.date || '') + '</div>' +
        '</div>' +
        '<button class="h-del" onclick="event.stopPropagation();deleteHistoryItem(this.closest(\'[data-path]\').dataset.path)" title="削除">✕</button>' +
      '</div>';
    }).join('');
  }

  function resolveImages() {
    var content = document.getElementById('content');
    if (!content || !state.dir) return;
    var imgs = content.querySelectorAll('img:not([data-hanami-src])');
    Array.prototype.forEach.call(imgs, function (img) {
      var src = img.getAttribute('src') || '';
      if (!src || /^(https?:|data:|blob:|tauri:)/i.test(src)) return;
      img.setAttribute('data-hanami-src', src);
      var decoded = src;
      try { decoded = decodeURIComponent(src); } catch (_) {}
      invoke('read_image', { dir: state.dir, src: decoded })
        .then(function (url) { img.src = url; })
        .catch(function () {});
    });
  }

  function openPath(path, isRefresh) {
    return invoke('read_file', { path: path }).then(function (f) {
      state.path = f.path;
      state.dir = dirname(f.path);
      state.text = f.content;
      window.handleFile(new File([f.content], f.name), !!isRefresh);
      return true;
    }).catch(function (e) {
      toast('❌ ' + e);
      return false;
    });
  }

  function install() {
    window.loadHistory = function () { return state.history; };

    window.saveToHistory = function (entry) {
      if (!state.path) return;
      var path = state.path;
      state.history = state.history.filter(function (x) { return x.path !== path; });
      state.history.unshift({
        path: path, name: entry.name, type: entry.type, date: entry.date, size: entry.size
      });
      if (state.history.length > MAX_HISTORY) state.history.length = MAX_HISTORY;
      persist();
    };

    window.removeFromHistory = function (path) {
      state.history = state.history.filter(function (x) { return x.path !== path; });
      persist();
    };

    window.deleteHistoryItem = function (path) {
      window.removeFromHistory(path);
      if (state.path === path) {
        state.path = null;
        state.dir = null;
        state.text = null;
        document.getElementById('refreshBtn').disabled = true;
        document.getElementById('content').innerHTML =
          '<div class="welcome" id="welcome">' +
          '<div class="welcome-emoji">🌸</div>' +
          '<div class="welcome-title">Hanami</div>' +
          '<div class="welcome-sub">📄 Markdown / 📊 CSV ファイルを美しく表示します</div>' +
          '</div>';
      }
      renderHistory();
    };

    window.clearHistory = function () {
      if (!confirm('履歴をすべて削除しますか？')) return;
      state.history = [];
      persist();
      renderHistory();
      toast('🗑️ 履歴を削除しました');
    };

    window.renderHistory = renderHistory;
    window.openFromHistory = function (path) { openPath(path, false); };

    window.triggerOpen = function () {
      invoke('pick_file').catch(function (e) { toast('❌ ' + e); });
    };

    window.refreshFile = function () {
      if (!state.path) { toast('⚠️ 先にファイルを開いてください'); return; }
      var btn = document.getElementById('refreshBtn');
      btn.classList.add('spinning');
      btn.disabled = true;
      openPath(state.path, true).then(function () {
        btn.classList.remove('spinning');
        btn.disabled = false;
      });
    };

    window.toggleCheckboxAndSave = function (idx, checked) {
      if (state.text == null || !state.path) return;
      var updated = window.setCheckboxState(state.text, idx, checked);
      if (updated == null) return;
      state.text = updated;
      invoke('write_file', { path: state.path, content: updated })
        .then(function () { toast('✅ 元ファイルを更新しました'); })
        .catch(function (e) { toast('❌ 保存に失敗しました: ' + e); });
    };
  }

  function installPathBar() {
    var style = document.createElement('style');
    style.textContent =
      'header .logo { flex: 0 0 auto; }' +
      '.hanami-path { flex: 1; display: flex; min-width: 0; }' +
      '.hanami-path input {' +
        'width: 100%; height: 34px; padding: 0 12px;' +
        'font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem;' +
        'color: #3b0764; background: rgba(255,255,255,0.88);' +
        'border: 1px solid rgba(255,255,255,0.7); border-radius: 8px; outline: none;' +
      '}' +
      '.hanami-path input:focus { background: #fff; box-shadow: 0 0 0 3px rgba(255,255,255,0.35); }' +
      '.hanami-path input::placeholder { color: #a855f7; opacity: 0.7; }';
    document.head.appendChild(style);

    var form = document.createElement('form');
    form.className = 'hanami-path';
    form.innerHTML = '<input type="text" id="hanamiPath" spellcheck="false" autocomplete="off"' +
      ' placeholder="パスを入力して Enter（例: ~/notes/todo.md）">';
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = document.getElementById('hanamiPath');
      var value = input.value.trim();
      if (!value) return;
      openPath(value, false).then(function (ok) {
        if (ok) input.value = '';
      });
    });

    var header = document.querySelector('header');
    var openBtn = header.querySelector('.open-btn');
    header.insertBefore(form, openBtn);
  }

  function installDragDrop() {
    listen('tauri://drag-enter', function () { document.body.classList.add('drag-over'); });
    listen('tauri://drag-leave', function () { document.body.classList.remove('drag-over'); });
    listen('tauri://drag-drop', function (e) {
      document.body.classList.remove('drag-over');
      var paths = (e.payload && e.payload.paths) || [];
      if (paths.length) openPath(paths[0], false);
    });
  }

  window.addEventListener('DOMContentLoaded', function () {
    install();
    installPathBar();
    installDragDrop();

    new MutationObserver(resolveImages)
      .observe(document.getElementById('content'), { childList: true, subtree: true });

    listen('hanami://open', function (e) { openPath(e.payload, false); });

    invoke('load_history').then(function (entries) {
      state.history = (entries || []).filter(function (x) { return x && x.path; });
      renderHistory();
    }).catch(function () { renderHistory(); }).then(function () {
      return invoke('initial_file');
    }).then(function (path) {
      if (path) openPath(path, false);
    }).catch(function () {});
  });
})();
