/**
 * DSH Mobile - 主应用逻辑
 * 手机端聊天界面：多轮对话、流式输出、余额显示、设置管理
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
  };

  let history = [];
  let isSending = false;
  let abortController = null;

  // ---------- 消息渲染 ----------
  function addMessage(role, content) {
    els.emptyHint?.classList.add('hidden');
    const wrap = document.createElement('div');
    wrap.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? '我' : 'D';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = content;

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    els.messages.appendChild(wrap);
    els.messages.scrollTop = els.messages.scrollHeight;
    return bubble;
  }

  function updateMessage(bubble, text) {
    bubble.textContent = text;
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  // ---------- 发送 ----------
  async function send() {
    const text = els.input.value.trim();
    if (!text || isSending) return;
    const apiKey = storage.getApiKey();
    if (!apiKey) {
      openSettings();
      flashInput('请先设置 API Key');
      return;
    }

    els.input.value = '';
    addMessage('user', text);
    history.push({ role: 'user', content: text });

    const assistantBubble = addMessage('assistant', '');
    isSending = true;
    els.sendBtn.disabled = true;
    els.sendBtn.textContent = '…';
    abortController = new AbortController();

    let reply = '';
    try {
      reply = await chatStream(apiKey, history, {
        model: storage.getModel(),
        signal: abortController.signal,
        onDelta: (delta) => updateMessage(assistantBubble, reply + delta),
      });
      if (!reply) updateMessage(assistantBubble, '（无回复内容）');
      history.push({ role: 'assistant', content: reply });
    } catch (e) {
      if (e.name === 'AbortError') {
        updateMessage(assistantBubble, '（已停止）');
      } else {
        updateMessage(assistantBubble, `⚠️ ${e.message}`);
      }
    } finally {
      isSending = false;
      els.sendBtn.disabled = false;
      els.sendBtn.textContent = '发送';
      storage.saveHistory(history);
      abortController = null;
    }
  }

  function flashInput(msg) {
    els.input.placeholder = msg;
    els.input.focus();
    setTimeout(() => {
      els.input.placeholder = '输入消息…';
    }, 3000);
  }

  // ---------- 会话管理 ----------
  function newChat() {
    history = [];
    storage.clearHistory();
    els.messages.innerHTML = '';
    els.emptyHint?.classList.remove('hidden');
  }

  function loadHistory() {
    history = storage.getHistory();
    for (const m of history) {
      addMessage(m.role, m.content);
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

  // ---------- 事件绑定 ----------
  els.sendBtn.addEventListener('click', send);
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  els.newChatBtn.addEventListener('click', newChat);
  els.settingsBtn.addEventListener('click', openSettings);
  els.settingsOverlay.addEventListener('click', closeSettings);
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  els.apiKeySave.addEventListener('click', saveSettings);
  els.apiKeyClear.addEventListener('click', clearSettings);
  els.balanceBadge.addEventListener('click', () => balance.refresh());

  // 停止生成（长按发送键时）
  els.sendBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (isSending && abortController) abortController.abort();
  });

  // ---------- 初始化 ----------
  // 注册 Service Worker（PWA）
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  loadHistory();
  if (storage.getApiKey()) {
    balance.start();
  } else {
    balance.render({ ok: false, error: '未配置 API Key' });
  }
});
