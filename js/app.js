/**
 * DSH Mobile - 主应用逻辑
 * 手机端聊天界面：多轮对话、流式输出、Markdown 渲染、余额显示、
 * 多会话管理、主题切换、分享对话
 */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const els = {
    messages: document.getElementById('messages'),
    input: document.getElementById('input'),
    sendBtn: document.getElementById('send-btn'),
    newChatBtn: document.getElementById('new-chat-btn'),
    sessionsBtn: document.getElementById('sessions-btn'),
    sessionsPanel: document.getElementById('sessions-panel'),
    sessionsOverlay: document.getElementById('sessions-overlay'),
    sessionsClose: document.getElementById('sessions-close'),
    sessionList: document.getElementById('session-list'),
    shareBtn: document.getElementById('share-btn'),
    themeBtn: document.getElementById('theme-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsPanel: document.getElementById('settings-panel'),
    settingsOverlay: document.getElementById('settings-overlay'),
    settingsClose: document.getElementById('settings-close'),
    apiKeyInput: document.getElementById('api-key'),
    apiKeySave: document.getElementById('api-key-save'),
    apiKeyClear: document.getElementById('api-key-clear'),
    modelSelect: document.getElementById('model-select'),
    themeSelect: document.getElementById('theme-select'),
    balanceBadge: document.getElementById('balance-badge'),
    emptyHint: document.getElementById('empty-hint'),
    onlineDot: document.getElementById('online-dot'),
  };

  let currentSessionId = null; // 当前活跃会话
  let currentMessages = []; // 当前会话消息
  let isSending = false;
  let abortController = null;

  // ---------- 主题 ----------
  const THEMES = { dark: '🌙', light: '☀️', auto: '🖥️' };

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    els.themeBtn.textContent = THEMES[theme] || '🌙';
    els.themeSelect.value = theme;
    // 更新浏览器主题色
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#0d1117');
  }

  function cycleTheme() {
    const order = ['dark', 'light', 'auto'];
    const cur = storage.getTheme();
    const next = order[(order.indexOf(cur) + 1) % order.length];
    storage.saveTheme(next);
    applyTheme(next);
  }

  // ---------- Markdown 渲染辅助 ----------
  function renderMd(container, text) {
    container.innerHTML = '';
    const mdEl = md.render(text);
    container.appendChild(mdEl);
  }

  // ---------- 消息渲染 ----------
  function addMessage(role, content, { asMarkdown = false } = {}) {
    els.emptyHint?.classList.add('hidden');
    const wrap = document.createElement('div');
    wrap.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? '我' : 'D';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (asMarkdown) {
      const mdContainer = document.createElement('div');
      mdContainer.className = 'md-container';
      bubble.appendChild(mdContainer);
      wrap.mdContainer = mdContainer;
    } else {
      bubble.textContent = content;
    }

    // 消息操作栏（复制 / 重试）
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action';
    copyBtn.textContent = '复制';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard?.writeText(content).then(() => {
        copyBtn.textContent = '已复制 ✓';
        setTimeout(() => (copyBtn.textContent = '复制'), 1500);
      });
    });
    actions.appendChild(copyBtn);
    bubble.appendChild(actions);

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    els.messages.appendChild(wrap);
    els.messages.scrollTop = els.messages.scrollHeight;
    return wrap;
  }

  function updateAssistantBubble(wrap, text) {
    if (!wrap) return;
    if (wrap.mdContainer) {
      renderMd(wrap.mdContainer, text);
    } else {
      const bubble = wrap.querySelector('.bubble');
      if (bubble) bubble.textContent = text;
    }
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  // ---------- 会话管理 ----------
  /** 加载指定会话到界面 */
  function loadSession(sessionId) {
    if (isSending) abortController?.abort();
    const session = storage.getSession(sessionId);
    if (!session) {
      newChat();
      return;
    }
    currentSessionId = session.id;
    currentMessages = [...session.messages];
    els.messages.innerHTML = '';
    if (currentMessages.length === 0) {
      els.emptyHint?.classList.remove('hidden');
    } else {
      for (const m of currentMessages) {
        const wrap = addMessage(m.role, m.content, { asMarkdown: m.role === 'assistant' });
        if (m.role === 'assistant') updateAssistantBubble(wrap, m.content);
      }
    }
    renderSessionList();
  }

  /** 新建会话 */
  function newChat() {
    if (isSending) abortController?.abort();
    // 若当前会话有内容，先保存
    if (currentSessionId && currentMessages.length) {
      storage.saveSession(currentSessionId, currentMessages);
    }
    const session = storage.createSession([]);
    currentSessionId = session.id;
    currentMessages = [];
    els.messages.innerHTML = '';
    els.emptyHint?.classList.remove('hidden');
    renderSessionList();
    closeSessionsPanel();
  }

  /** 切换会话 */
  function switchSession(id) {
    if (isSending) abortController?.abort();
    if (currentSessionId && currentMessages.length) {
      storage.saveSession(currentSessionId, currentMessages);
    }
    loadSession(id);
    closeSessionsPanel();
  }

  /** 删除会话 */
  function deleteSession(id) {
    storage.deleteSession(id);
    if (currentSessionId === id) {
      const rest = storage.getSessions();
      if (rest.length) {
        loadSession(rest[0].id);
      } else {
        const session = storage.createSession([]);
        currentSessionId = session.id;
        currentMessages = [];
        els.messages.innerHTML = '';
        els.emptyHint?.classList.remove('hidden');
      }
    }
    renderSessionList();
  }

  /** 渲染会话列表 */
  function renderSessionList() {
    const sessions = storage.getSessions();
    if (!sessions.length) {
      els.sessionList.innerHTML = '<div class="session-empty">暂无历史会话<br>点击 ＋ 开始新对话</div>';
      return;
    }
    els.sessionList.innerHTML = '';
    for (const s of sessions) {
      const item = document.createElement('div');
      item.className = 'session-item' + (s.id === currentSessionId ? ' active' : '');

      const title = document.createElement('div');
      title.className = 'session-title';
      title.textContent = s.title || '新会话';

      const time = document.createElement('div');
      time.className = 'session-time';
      const d = new Date(s.updatedAt || Date.now());
      const pad = (x) => String(x).padStart(2, '0');
      time.textContent = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

      const del = document.createElement('button');
      del.className = 'session-del';
      del.textContent = '✕';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSession(s.id);
      });

      item.appendChild(title);
      item.appendChild(time);
      item.appendChild(del);
      item.addEventListener('click', () => switchSession(s.id));
      els.sessionList.appendChild(item);
    }
  }

  // ---------- 分享对话 ----------
  function shareChat() {
    const sessions = storage.getSessions();
    const session = sessions.find((s) => s.id === currentSessionId);
    const messages = session ? session.messages : currentMessages;
    if (!messages.length) {
      flashInput('没有可分享的内容');
      return;
    }
    let text = `💬 DeepSeek 对话分享\n${new Date().toLocaleString('zh-CN')}\n\n`;
    for (const m of messages) {
      text += (m.role === 'user' ? '👤 我：' : '🤖 DeepSeek：') + m.content + '\n\n';
    }
    if (navigator.share) {
      navigator
        .share({ title: 'DeepSeek 对话', text })
        .catch(() => copyText(text));
    } else {
      copyText(text);
    }
  }

  function copyText(text) {
    navigator.clipboard
      ?.writeText(text)
      .then(() => flashInput('对话已复制 ✓'))
      .catch(() => flashInput('复制失败'));
  }

  // ---------- 发送 ----------
  async function send(textOverride) {
    const text = (textOverride ?? els.input.value).trim();
    if (!text || isSending) return;
    const apiKey = storage.getApiKey();
    if (!apiKey) {
      openSettings();
      flashInput('请先设置 API Key');
      return;
    }

    // 确保有活跃会话
    if (!currentSessionId) {
      const session = storage.createSession([]);
      currentSessionId = session.id;
    }

    els.input.value = '';
    autoResizeInput();
    addMessage('user', text);
    currentMessages.push({ role: 'user', content: text });

    const wrap = addMessage('assistant', '', { asMarkdown: true });
    isSending = true;
    setSendButton(true);
    abortController = new AbortController();

    let reply = '';
    try {
      reply = await chatStream(apiKey, currentMessages, {
        model: storage.getModel(),
        signal: abortController.signal,
        onDelta: (delta) => {
          reply += delta;
          updateAssistantBubble(wrap, reply);
        },
      });
      if (!reply) updateAssistantBubble(wrap, '（无回复内容）');
      currentMessages.push({ role: 'assistant', content: reply });
      storage.saveSession(currentSessionId, currentMessages);
      renderSessionList();
    } catch (e) {
      if (e.name === 'AbortError') {
        updateAssistantBubble(wrap, reply ? reply + '\n\n_（已停止生成）_' : '（已停止）');
        if (reply) {
          currentMessages.push({ role: 'assistant', content: reply });
          storage.saveSession(currentSessionId, currentMessages);
        }
      } else {
        updateAssistantBubble(wrap, `⚠️ ${e.message}`);
      }
    } finally {
      isSending = false;
      setSendButton(false);
      abortController = null;
    }
  }

  /** 切换发送/停止按钮 */
  function setSendButton(sending) {
    els.sendBtn.textContent = sending ? '■' : '发送';
    els.sendBtn.classList.toggle('stop', sending);
    if (sending) {
      els.sendBtn.onclick = () => abortController?.abort();
    } else {
      els.sendBtn.onclick = () => send();
    }
  }

  function flashInput(msg) {
    els.input.placeholder = msg;
    els.input.focus();
    setTimeout(() => {
      els.input.placeholder = '输入消息…';
    }, 3000);
  }

  // ---------- 输入框自动增高 ----------
  function autoResizeInput() {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 120) + 'px';
  }

  // ---------- 设置面板 ----------
  function openSettings() {
    els.apiKeyInput.value = storage.getApiKey();
    els.modelSelect.value = storage.getModel();
    els.themeSelect.value = storage.getTheme();
    els.settingsPanel.classList.add('open');
    els.settingsOverlay.classList.add('show');
  }

  function closeSettings() {
    els.settingsPanel.classList.remove('open');
    els.settingsOverlay.classList.remove('show');
  }

  function saveSettings() {
    const key = els.apiKeyInput.value.trim();
    storage.saveApiKey(key);
    storage.saveModel(els.modelSelect.value);
    storage.saveTheme(els.themeSelect.value);
    applyTheme(els.themeSelect.value);
    closeSettings();
    if (key) {
      balance.start();
      balance.refresh();
    } else {
      balance.render({ ok: false, error: '未配置 API Key' });
    }
  }

  function clearSettings() {
    storage.clearApiKey();
    els.apiKeyInput.value = '';
    balance.render({ ok: false, error: '未配置 API Key' });
    flashInput('已清除 API Key，请重新设置');
    closeSettings();
  }

  // ---------- 会话面板 ----------
  function openSessionsPanel() {
    renderSessionList();
    els.sessionsPanel.classList.add('open');
    els.sessionsOverlay.classList.add('show');
  }

  function closeSessionsPanel() {
    els.sessionsPanel.classList.remove('open');
    els.sessionsOverlay.classList.remove('show');
  }

  // ---------- 在线状态 ----------
  function updateOnlineStatus() {
    const online = navigator.onLine;
    if (els.onlineDot) {
      els.onlineDot.className = 'online-dot ' + (online ? 'on' : 'off');
      els.onlineDot.title = online ? '在线' : '离线';
    }
  }

  // ---------- 事件绑定 ----------
  els.sendBtn.addEventListener('click', () => send());
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  els.input.addEventListener('input', autoResizeInput);
  els.newChatBtn.addEventListener('click', newChat);
  els.sessionsBtn.addEventListener('click', openSessionsPanel);
  els.sessionsOverlay.addEventListener('click', closeSessionsPanel);
  els.sessionsClose.addEventListener('click', closeSessionsPanel);
  els.shareBtn.addEventListener('click', shareChat);
  els.themeBtn.addEventListener('click', cycleTheme);
  els.settingsBtn.addEventListener('click', openSettings);
  els.settingsOverlay.addEventListener('click', closeSettings);
  els.settingsClose.addEventListener('click', closeSettings);
  els.apiKeySave.addEventListener('click', saveSettings);
  els.apiKeyClear.addEventListener('click', clearSettings);
  els.balanceBadge.addEventListener('click', () => balance.refresh());
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // ---------- 初始化 ----------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  applyTheme(storage.getTheme());
  updateOnlineStatus();

  // 恢复最近会话
  const sessions = storage.getSessions();
  const activeId = storage.getActiveSessionId();
  const target = sessions.find((s) => s.id === activeId) || sessions[0];
  if (target) {
    loadSession(target.id);
  } else {
    const session = storage.createSession([]);
    currentSessionId = session.id;
    currentMessages = [];
  }

  if (storage.getApiKey()) {
    balance.start();
  } else {
    balance.render({ ok: false, error: '未配置 API Key' });
  }
});
