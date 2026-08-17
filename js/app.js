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
    sessionSearch: document.getElementById('session-search'),
    exportAllBtn: document.getElementById('export-all-btn'),
    clearDataBtn: document.getElementById('clear-data-btn'),
    shareBtn: document.getElementById('share-btn'),
    voiceBtn: document.getElementById('voice-btn'),
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
  function addMessage(role, content, { asMarkdown = false, withReasoning = false } = {}) {
    els.emptyHint?.classList.add('hidden');
    const wrap = document.createElement('div');
    wrap.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? '我' : 'D';

    const body = document.createElement('div');
    body.className = 'message-body';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    // 推理过程块（仅 assistant）
    let reasoningBlock = null;
    if (withReasoning) {
      reasoningBlock = document.createElement('div');
      reasoningBlock.className = 'reasoning-block';
      const header = document.createElement('div');
      header.className = 'reasoning-header';
      const toggle = document.createElement('span');
      toggle.className = 'toggle';
      toggle.textContent = '▶';
      const label = document.createElement('span');
      label.textContent = '推理过程';
      const spinner = document.createElement('span');
      spinner.className = 'spinner';
      header.appendChild(toggle);
      header.appendChild(label);
      header.appendChild(spinner);
      const content = document.createElement('div');
      content.className = 'reasoning-content';
      reasoningBlock.appendChild(header);
      reasoningBlock.appendChild(content);
      header.addEventListener('click', () => {
        reasoningBlock.classList.toggle('open');
        toggle.textContent = reasoningBlock.classList.contains('open') ? '▼' : '▶';
      });
      wrap.reasoningContent = content;
      wrap.reasoningSpinner = spinner;
      wrap.reasoningToggle = toggle;
      wrap.reasoningBlock = reasoningBlock;
      body.appendChild(reasoningBlock);
    }

    if (asMarkdown) {
      const mdContainer = document.createElement('div');
      mdContainer.className = 'md-container';
      bubble.appendChild(mdContainer);
      wrap.mdContainer = mdContainer;
    } else {
      bubble.textContent = content;
    }

    // 消息操作栏（复制）
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

    body.appendChild(bubble);
    wrap.appendChild(avatar);
    wrap.appendChild(body);
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
        const wrap = addMessage(m.role, m.content, {
          asMarkdown: m.role === 'assistant',
          withReasoning: m.role === 'assistant' && !!m.reasoning,
        });
        if (m.role === 'assistant') {
          updateAssistantBubble(wrap, m.content);
          if (wrap.reasoningContent && m.reasoning) {
            wrap.reasoningContent.textContent = m.reasoning;
            if (wrap.reasoningSpinner) wrap.reasoningSpinner.style.display = 'none';
          }
        }
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

      // 重命名按钮
      const rename = document.createElement('button');
      rename.className = 'session-rename';
      rename.textContent = '✎';
      rename.title = '重命名';
      rename.addEventListener('click', (e) => {
        e.stopPropagation();
        renameSession(s.id, title.textContent);
      });

      const del = document.createElement('button');
      del.className = 'session-del';
      del.textContent = '✕';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSession(s.id);
      });

      item.appendChild(title);
      item.appendChild(time);
      item.appendChild(rename);
      item.appendChild(del);
      item.addEventListener('click', () => switchSession(s.id));
      els.sessionList.appendChild(item);
    }
  }

  /** 重命名会话（prompt 输入新标题） */
  function renameSession(id, currentTitle) {
    const newTitle = prompt('重命名会话', currentTitle || '');
    if (newTitle === null) return; // 用户取消
    storage.renameSession(id, newTitle);
    renderSessionList();
  }

  // ---------- 搜索 ----------
  let searchTimer = null;
  function initSearch() {
    els.sessionSearch.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => renderSearchResults(els.sessionSearch.value.trim()), 200);
    });
  }

  function renderSearchResults(query) {
    if (!query) {
      renderSessionList();
      return;
    }
    const sessions = storage.getSessions();
    const results = [];
    const q = query.toLowerCase();
    for (const s of sessions) {
      for (const m of s.messages || []) {
        if ((m.content || '').toLowerCase().includes(q)) {
          results.push({ sessionId: s.id, sessionTitle: s.title, role: m.role, content: m.content });
        }
      }
    }
    if (!results.length) {
      els.sessionList.innerHTML = `<div class="session-empty">未找到包含 "${query}" 的消息</div>`;
      return;
    }
    els.sessionList.innerHTML = `<div class="search-result-count">找到 ${results.length} 条匹配消息</div>`;
    for (const r of results.slice(0, 50)) {
      const item = document.createElement('div');
      item.className = 'session-item';
      const title = document.createElement('div');
      title.className = 'session-title';
      // 高亮匹配片段
      const idx = r.content.toLowerCase().indexOf(q);
      const before = r.content.slice(Math.max(0, idx - 10), idx);
      const match = r.content.slice(idx, idx + q.length + 20);
      const after = r.content.slice(idx + q.length + 20, idx + q.length + 35);
      title.innerHTML = `${(r.role === 'user' ? '👤 ' : '🤖 ')}${escapeHtml(before)}<span class="search-hit">${escapeHtml(match)}</span>${escapeHtml(after)}`;
      title.title = r.content;
      item.appendChild(title);
      item.addEventListener('click', () => {
        els.sessionSearch.value = '';
        switchSession(r.sessionId);
      });
      els.sessionList.appendChild(item);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------- 回复完成通知 ----------
  function notifyDone(title) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        new Notification(title || 'DeepSeek 回复完成', {
          body: '你的消息已收到回复',
          icon: './icons/icon-192.png',
        });
      } catch {
        /* 忽略 */
      }
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }

  // ---------- 导出对话 ----------
  function exportChat(sessionId) {
    const session = storage.getSession(sessionId);
    const messages = session ? session.messages : currentMessages;
    if (!messages.length) {
      flashInput('没有可导出的内容');
      return;
    }
    let text = `# DeepSeek 对话导出\n\n`;
    text += `- 时间：${new Date().toLocaleString('zh-CN')}\n`;
    text += `- 模型：${storage.getModel()}\n\n---\n\n`;
    for (const m of messages) {
      text += `### ${m.role === 'user' ? '👤 我' : '🤖 DeepSeek'}\n\n${m.content}\n\n---\n\n`;
    }
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name = (session?.title || '对话').replace(/[\\/:*?"<>|]/g, '_');
    a.href = url;
    a.download = `${name}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    flashInput('已导出为 .md 文件 ✓');
  }

  function exportAll() {
    const sessions = storage.getSessions();
    if (!sessions.length) {
      flashInput('暂无会话可导出');
      return;
    }
    let text = `# DeepSeek 全部对话导出\n\n`;
    text += `- 时间：${new Date().toLocaleString('zh-CN')}\n`;
    text += `- 会话数：${sessions.length}\n\n`;
    for (const s of sessions) {
      text += `---\n\n## ${s.title || '新会话'}\n\n`;
      for (const m of s.messages || []) {
        text += `### ${m.role === 'user' ? '👤 我' : '🤖 DeepSeek'}\n\n${m.content}\n\n`;
      }
    }
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deepseek-all-chats-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    flashInput('已导出全部对话 ✓');
  }

  // ---------- 数据管理 ----------
  function clearAllData() {
    if (!confirm('确定清空全部会话历史吗？此操作不可恢复（API Key 设置保留）。')) return;
    storage.clearAllSessions();
    const session = storage.createSession([]);
    currentSessionId = session.id;
    currentMessages = [];
    els.messages.innerHTML = '';
    els.emptyHint?.classList.remove('hidden');
    renderSessionList();
    flashInput('已清空全部会话');
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

    const isReasoner = storage.getModel() === 'deepseek-reasoner';
    const wrap = addMessage('assistant', '', { asMarkdown: true, withReasoning: isReasoner });
    isSending = true;
    setSendButton(true);
    abortController = new AbortController();

    let reply = '';
    let reasoningText = '';
    try {
      const result = await chatStream(apiKey, currentMessages, {
        model: storage.getModel(),
        signal: abortController.signal,
        onDelta: (delta) => {
          reply += delta;
          updateAssistantBubble(wrap, reply);
        },
        onReasoning: (delta) => {
          reasoningText += delta;
          if (wrap.reasoningContent) {
            wrap.reasoningContent.textContent = reasoningText;
          }
        },
      });
      reply = result.content;
      reasoningText = result.reasoning || reasoningText;
      if (wrap.reasoningSpinner) wrap.reasoningSpinner.style.display = 'none';
      if (!reply) updateAssistantBubble(wrap, '（无回复内容）');
      const assistantMsg = { role: 'assistant', content: reply };
      if (reasoningText) assistantMsg.reasoning = reasoningText;
      currentMessages.push(assistantMsg);
      storage.saveSession(currentSessionId, currentMessages);
      renderSessionList();
      // 页面不可见时通知
      if (typeof document !== 'undefined' && document.hidden) {
        notifyDone();
      }
    } catch (e) {
      if (wrap.reasoningSpinner) wrap.reasoningSpinner.style.display = 'none';
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

  // ---------- 语音输入（Web Speech API） ----------
  let recognition = null;
  let isRecording = false;

  function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      els.voiceBtn.style.display = 'none';
      return;
    }
    recognition = new SR();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      els.input.value = (els.input.value ? els.input.value + ' ' : '') + transcript;
      autoResizeInput();
      setVoiceBtn(false);
    };
    recognition.onerror = () => setVoiceBtn(false);
    recognition.onend = () => setVoiceBtn(false);

    els.voiceBtn.addEventListener('click', () => {
      if (isRecording) {
        recognition.stop();
        setVoiceBtn(false);
      } else {
        try {
          recognition.start();
          setVoiceBtn(true);
        } catch {
          /* 忽略 */
        }
      }
    });
  }

  function setVoiceBtn(recording) {
    isRecording = recording;
    els.voiceBtn.classList.toggle('recording', recording);
    els.voiceBtn.textContent = recording ? '⏹' : '🎤';
    els.voiceBtn.title = recording ? '点击停止' : '语音输入';
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
  els.exportAllBtn.addEventListener('click', exportAll);
  els.clearDataBtn.addEventListener('click', clearAllData);
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
  initVoice();
  initSearch();

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
