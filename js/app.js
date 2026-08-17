/**
 * DSH Mobile - 主应用逻辑
 * 手机端聊天界面：多轮对话、流式输出、Markdown 渲染、余额显示、设置管理
 */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const els = {
    messages: document.getElementById('messages'),
    input: document.getElementById('input'),
    sendBtn: document.getElementById('send-btn'),
    newChatBtn: document.getElementById('new-chat-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsPanel: document.getElementById('settings-panel'),
    settingsOverlay: document.getElementById('settings-overlay'),
    apiKeyInput: document.getElementById('api-key'),
    apiKeySave: document.getElementById('api-key-save'),
    apiKeyClear: document.getElementById('api-key-clear'),
    modelSelect: document.getElementById('model-select'),
    balanceBadge: document.getElementById('balance-badge'),
    emptyHint: document.getElementById('empty-hint'),
    onlineDot: document.getElementById('online-dot'),
  };

  let history = [];
  let isSending = false;
  let abortController = null;
  let lastFailedIndex = -1;

  // ---------- Markdown 渲染辅助 ----------
  function appendNodes(container, nodes) {
    for (const n of nodes) container.appendChild(n);
  }

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
      // AI 回复：Markdown 渲染容器
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
    if (role === 'assistant' && !isSending) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'msg-action';
      retryBtn.textContent = '重试';
      retryBtn.addEventListener('click', () => retryLast());
      actions.appendChild(retryBtn);
    }
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

    els.input.value = '';
    autoResizeInput();
    addMessage('user', text);
    history.push({ role: 'user', content: text });

    const wrap = addMessage('assistant', '', { asMarkdown: true });
    lastFailedIndex = -1;
    isSending = true;
    setSendButton(true);
    abortController = new AbortController();

    let reply = '';
    try {
      reply = await chatStream(apiKey, history, {
        model: storage.getModel(),
        signal: abortController.signal,
        onDelta: (delta) => {
          reply += delta;
          updateAssistantBubble(wrap, reply);
        },
      });
      if (!reply) updateAssistantBubble(wrap, '（无回复内容）');
      history.push({ role: 'assistant', content: reply });
      // 刷新操作栏（显示重试）
      wrap.querySelector('.msg-actions')?.remove();
      addActionsToBubble(wrap, reply);
    } catch (e) {
      if (e.name === 'AbortError') {
        updateAssistantBubble(wrap, reply ? reply + '\n\n_（已停止生成）_' : '（已停止）');
        if (reply) history.push({ role: 'assistant', content: reply });
      } else {
        updateAssistantBubble(wrap, `⚠️ ${e.message}`);
        lastFailedIndex = history.length - 1;
      }
    } finally {
      isSending = false;
      setSendButton(false);
      storage.saveHistory(history);
      abortController = null;
    }
  }

  /** 重试最后一条消息（助手回复失败时） */
  function retryLast() {
    if (isSending) return;
    // 移除最后一条助手消息
    const msgs = els.messages.querySelectorAll('.message.assistant');
    const last = msgs[msgs.length - 1];
    if (last) last.remove();
    if (history.length && history[history.length - 1].role === 'assistant') {
      history.pop();
    }
    // 找回上一条用户消息重发
    const lastUser = [...history].reverse().find((m) => m.role === 'user');
    if (lastUser) send(lastUser.content);
  }

  /** 在气泡上添加操作按钮 */
  function addActionsToBubble(wrap, content) {
    const bubble = wrap.querySelector('.bubble');
    if (!bubble) return;
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
    const retryBtn = document.createElement('button');
    retryBtn.className = 'msg-action';
    retryBtn.textContent = '重试';
    retryBtn.addEventListener('click', retryLast);
    actions.appendChild(retryBtn);
    bubble.appendChild(actions);
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

  // ---------- 会话管理 ----------
  function newChat() {
    if (isSending) abortController?.abort();
    history = [];
    storage.clearHistory();
    els.messages.innerHTML = '';
    els.emptyHint?.classList.remove('hidden');
  }

  function loadHistory() {
    history = storage.getHistory();
    for (const m of history) {
      const wrap = addMessage(m.role, m.content, {
        asMarkdown: m.role === 'assistant',
      });
      if (m.role === 'assistant') {
        updateAssistantBubble(wrap, m.content);
        addActionsToBubble(wrap, m.content);
      }
    }
    if (history.length === 0) els.emptyHint?.classList.remove('hidden');
  }

  // ---------- 设置面板 ----------
  function openSettings() {
    els.apiKeyInput.value = storage.getApiKey();
    els.modelSelect.value = storage.getModel();
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

  // ---------- 在线状态提示 ----------
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
  els.settingsBtn.addEventListener('click', openSettings);
  els.settingsOverlay.addEventListener('click', closeSettings);
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  els.apiKeySave.addEventListener('click', saveSettings);
  els.apiKeyClear.addEventListener('click', clearSettings);
  els.balanceBadge.addEventListener('click', () => balance.refresh());
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // ---------- 初始化 ----------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  loadHistory();
  updateOnlineStatus();
  if (storage.getApiKey()) {
    balance.start();
  } else {
    balance.render({ ok: false, error: '未配置 API Key' });
  }
});
