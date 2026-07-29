(function () {
  const articleSelector = '.post-content.keep-markdown-body';
  const storagePrefix = 'jotaro-selection-comments:';
  const markClass = 'selection-comment-mark';
  const githubConfig = {
    owner: 'yuecaiheng-jotaro',
    repo: 'yuecaiheng-jotaro.github.io',
    siteUrl: 'https://yuecaiheng-jotaro.github.io',
    marker: '<!-- jotaro-selection-comment -->',
    label: 'selection-comment'
  };

  let article;
  let annotations = [];
  let localAnnotations = [];
  let githubAnnotations = [];
  let selectedText = '';
  let selectedRange = null;
  let popover;
  let editor;
  let panel;
  let toggle;
  let githubLoadError = '';

  function storageKey() {
    return storagePrefix + location.pathname;
  }

  function loadAnnotations() {
    try {
      localAnnotations = JSON.parse(localStorage.getItem(storageKey()) || '[]').map(function (item) {
        item.source = item.source || 'local';
        return item;
      });
    } catch (error) {
      localAnnotations = [];
    }
    mergeAnnotations();
  }

  function saveLocalAnnotations() {
    localStorage.setItem(storageKey(), JSON.stringify(localAnnotations));
  }

  function mergeAnnotations() {
    const seen = new Set();
    annotations = githubAnnotations.concat(localAnnotations).filter(function (item) {
      const key = item.source + ':' + item.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function textNodesUnder(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (node.parentElement && node.parentElement.closest('.selection-comment-panel, .selection-comment-editor, .selection-comment-popover, script, style')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    return nodes;
  }

  function clearMarks() {
    article.querySelectorAll('.' + markClass).forEach(function (mark) {
      mark.replaceWith(document.createTextNode(mark.textContent));
    });
    article.normalize();
  }

  function wrapTextMatch(text, id) {
    const needle = text.trim();
    if (!needle) return false;
    const nodes = textNodesUnder(article);

    for (const node of nodes) {
      const index = node.nodeValue.indexOf(needle);
      if (index === -1) continue;

      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + needle.length);
      const mark = document.createElement('span');
      mark.className = markClass;
      mark.dataset.commentId = id;
      try {
        range.surroundContents(mark);
        return true;
      } catch (error) {
        return false;
      }
    }

    return false;
  }

  function renderMarks() {
    clearMarks();
    annotations.forEach(function (item) {
      item.found = wrapTextMatch(item.text, item.id);
    });
  }

  function renderPanel() {
    if (!panel || !toggle) return;
    toggle.style.display = annotations.length || githubLoadError ? 'block' : 'none';
    const list = annotations.map(function (item) {
      const time = new Date(item.createdAt).toLocaleString();
      const metaAction = item.source === 'github'
        ? '<a href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener">GitHub #' + escapeHtml(item.number) + '</a>'
        : '<button class="delete" type="button">删除</button>';
      return [
        '<div class="selection-comment-item" data-comment-id="' + item.id + '">',
        '<div class="source ' + escapeHtml(item.source) + '">' + (item.source === 'github' ? 'GitHub Issues' : '本地批注') + '</div>',
        '<div class="selected">「' + escapeHtml(item.text) + '」</div>',
        '<div class="comment">' + escapeHtml(item.comment) + '</div>',
        '<div class="meta"><span>' + escapeHtml(time) + '</span>' + metaAction + '</div>',
        '</div>'
      ].join('');
    }).join('');

    const status = githubLoadError
      ? '<div class="selection-comment-status error">' + escapeHtml(githubLoadError) + '</div>'
      : '';

    panel.innerHTML = [
      '<header><span>划词评论</span><button class="cancel" type="button" data-close>关闭</button></header>',
      status,
      annotations.length ? list : '<div class="empty">暂无划词评论</div>'
    ].join('');
  }

  function hideFloating() {
    if (popover) popover.style.display = 'none';
    if (editor) editor.style.display = 'none';
  }

  function clampPosition(rect, width, height) {
    const margin = 12;
    return {
      left: Math.min(Math.max(rect.left, margin), window.innerWidth - width - margin),
      top: Math.min(Math.max(rect.bottom + 8, margin), window.innerHeight - height - margin)
    };
  }

  function showPopover(rect) {
    popover.style.display = 'block';
    const pos = clampPosition(rect, 120, 46);
    popover.style.left = pos.left + 'px';
    popover.style.top = pos.top + 'px';
  }

  function showEditor(rect) {
    popover.style.display = 'none';
    editor.querySelector('.quote').textContent = selectedText;
    editor.querySelector('textarea').value = '';
    editor.style.display = 'block';
    const pos = clampPosition(rect, 360, 240);
    editor.style.left = pos.left + 'px';
    editor.style.top = pos.top + 'px';
    editor.querySelector('textarea').focus();
  }

  function pagePath() {
    return location.pathname;
  }

  function canonicalPageUrl() {
    return githubConfig.siteUrl.replace(/\/$/, '') + pagePath();
  }

  function issueTitle(text) {
    return '划词评论：' + document.title.replace(/\s*\|.*$/, '') + ' - ' + text.slice(0, 28);
  }

  function issueBody(text, comment) {
    const payload = {
      version: 1,
      path: pagePath(),
      url: canonicalPageUrl(),
      title: document.title,
      text: text,
      comment: comment
    };

    return [
      githubConfig.marker,
      '',
      '> ' + text.replace(/\n/g, '\n> '),
      '',
      comment,
      '',
      '```json',
      JSON.stringify(payload, null, 2),
      '```'
    ].join('\n');
  }

  function openGitHubIssue(text, comment) {
    const params = new URLSearchParams({
      title: issueTitle(text),
      body: issueBody(text, comment),
      labels: githubConfig.label
    });
    const url = 'https://github.com/' + githubConfig.owner + '/' + githubConfig.repo + '/issues/new?' + params.toString();
    window.open(url, '_blank', 'noopener');
  }

  function parseGitHubAnnotation(issue) {
    if (!issue.body || issue.pull_request || issue.body.indexOf(githubConfig.marker) === -1) return null;
    const match = issue.body.match(/```json\s*([\s\S]*?)\s*```/);
    if (!match) return null;

    try {
      const payload = JSON.parse(match[1]);
      if (payload.path !== pagePath()) return null;
      if (!payload.text || !payload.comment) return null;
      return {
        id: 'gh-' + issue.number,
        number: issue.number,
        source: 'github',
        text: String(payload.text).slice(0, 240),
        comment: String(payload.comment),
        createdAt: issue.created_at,
        url: issue.html_url
      };
    } catch (error) {
      return null;
    }
  }

  function fetchGitHubAnnotations() {
    const url = 'https://api.github.com/repos/' + githubConfig.owner + '/' + githubConfig.repo + '/issues?state=open&per_page=100';
    return fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (response) {
        if (!response.ok) {
          if (response.status === 403) {
            throw new Error('GitHub Issues 匿名接口被限流，稍后刷新或登录 GitHub 后再试。');
          }
          throw new Error('GitHub Issues 读取失败，状态码：' + response.status);
        }
        return response.json();
      })
      .then(function (issues) {
        githubLoadError = '';
        githubAnnotations = issues.map(parseGitHubAnnotation).filter(Boolean);
        mergeAnnotations();
        renderMarks();
        renderPanel();
      })
      .catch(function (error) {
        githubLoadError = error && error.message ? error.message : 'GitHub Issues 读取失败。';
        githubAnnotations = [];
        mergeAnnotations();
        renderMarks();
        renderPanel();
      });
  }

  function selectionInsideArticle(selection) {
    if (!selection || selection.rangeCount === 0) return false;
    const range = selection.getRangeAt(0);
    return article.contains(range.commonAncestorContainer);
  }

  function createUi() {
    popover = document.createElement('div');
    popover.className = 'selection-comment-popover';
    popover.innerHTML = '<button type="button">评论</button>';

    editor = document.createElement('div');
    editor.className = 'selection-comment-editor';
    editor.innerHTML = [
      '<div class="quote"></div>',
      '<textarea placeholder="写下你的批注..."></textarea>',
      '<div class="actions">',
      '<button type="button" class="cancel">取消</button>',
      '<button type="button" class="save-local">本地保存</button>',
      '<button type="button" class="save-github">发布到 GitHub</button>',
      '</div>'
    ].join('');

    toggle = document.createElement('button');
    toggle.className = 'selection-comment-panel-toggle';
    toggle.type = 'button';
    toggle.title = '查看划词评论';
    toggle.textContent = '批注';

    panel = document.createElement('aside');
    panel.className = 'selection-comment-panel';

    document.body.append(popover, editor, toggle, panel);
  }

  function bindEvents() {
    document.addEventListener('mouseup', function () {
      window.setTimeout(function () {
        const selection = window.getSelection();
        if (!selectionInsideArticle(selection)) {
          if (!editor.matches(':hover')) hideFloating();
          return;
        }

        const text = selection.toString().replace(/\s+/g, ' ').trim();
        if (!text || text.length < 2) {
          if (!editor.matches(':hover')) hideFloating();
          return;
        }

        selectedText = text.slice(0, 240);
        selectedRange = selection.getRangeAt(0).cloneRange();
        showPopover(selectedRange.getBoundingClientRect());
      }, 0);
    });

    popover.querySelector('button').addEventListener('click', function () {
      if (!selectedRange || !selectedText) return;
      showEditor(selectedRange.getBoundingClientRect());
    });

    editor.querySelector('.cancel').addEventListener('click', function () {
      hideFloating();
      window.getSelection().removeAllRanges();
    });

    editor.querySelector('.save-local').addEventListener('click', function () {
      const comment = editor.querySelector('textarea').value.trim();
      if (!comment) return;

      localAnnotations.push({
        id: String(Date.now()),
        source: 'local',
        text: selectedText,
        comment,
        createdAt: new Date().toISOString()
      });
      saveLocalAnnotations();
      mergeAnnotations();
      renderMarks();
      renderPanel();
      hideFloating();
      window.getSelection().removeAllRanges();
    });

    editor.querySelector('.save-github').addEventListener('click', function () {
      const comment = editor.querySelector('textarea').value.trim();
      if (!comment) return;
      openGitHubIssue(selectedText, comment);
      hideFloating();
      window.getSelection().removeAllRanges();
    });

    article.addEventListener('click', function (event) {
      const mark = event.target.closest('.' + markClass);
      if (!mark) return;
      const item = annotations.find(function (entry) { return entry.id === mark.dataset.commentId; });
      if (!item) return;
      panel.classList.add('open');
      const panelItem = panel.querySelector('[data-comment-id="' + item.id + '"]');
      if (panelItem) panelItem.scrollIntoView({ block: 'nearest' });
    });

    toggle.addEventListener('click', function () {
      panel.classList.toggle('open');
    });

    panel.addEventListener('click', function (event) {
      if (event.target.matches('[data-close]')) {
        panel.classList.remove('open');
        return;
      }
      if (!event.target.matches('.delete')) return;
      const item = event.target.closest('.selection-comment-item');
      localAnnotations = localAnnotations.filter(function (entry) { return entry.id !== item.dataset.commentId; });
      saveLocalAnnotations();
      mergeAnnotations();
      renderMarks();
      renderPanel();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') hideFloating();
    });
  }

  function init() {
    if (document.querySelector('.selection-comment-popover')) return;
    article = document.querySelector(articleSelector);
    if (!article) return;
    createUi();
    loadAnnotations();
    renderMarks();
    renderPanel();
    bindEvents();
    fetchGitHubAnnotations();
  }

  if (document.querySelector(articleSelector)) {
    init();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
