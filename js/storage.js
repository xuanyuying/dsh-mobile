/**
 * DSH Mobile - 本地存储模块
 * API Key、设置、多会话历史仅保存在用户浏览器 localStorage（不上传、不进代码）
 */
'use strict';

const STORAGE_KEYS = {
  apiKey: 'dsh_mobile_api_key',
  model: 'dsh_mobile_model',
  theme: 'dsh_mobile_theme',
  sessions: 'dsh_mobile_sessions', // [{id, title, messages: [], updatedAt}]
  activeSessionId: 'dsh_mobile_active_session',
};

const storage = {
  // ---------- API Key ----------
  saveApiKey(key) {
    try {
      localStorage.setItem(STORAGE_KEYS.apiKey, (key || '').trim());
    } catch (e) {
      console.warn('无法保存 API Key:', e.message);
    }
  },

  getApiKey() {
    try {
      return localStorage.getItem(STORAGE_KEYS.apiKey) || '';
    } catch {
      return '';
    }
  },

  clearApiKey() {
    try {
      localStorage.removeItem(STORAGE_KEYS.apiKey);
    } catch {
      /* 忽略 */
    }
  },

  // ---------- 模型 ----------
  saveModel(model) {
    try {
      localStorage.setItem(STORAGE_KEYS.model, model);
    } catch {
      /* 忽略 */
    }
  },

  getModel() {
    try {
      return localStorage.getItem(STORAGE_KEYS.model) || 'deepseek-chat';
    } catch {
      return 'deepseek-chat';
    }
  },

  // ---------- 主题 ----------
  saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch {
      /* 忽略 */
    }
  },

  getTheme() {
    try {
      return localStorage.getItem(STORAGE_KEYS.theme) || 'dark';
    } catch {
      return 'dark';
    }
  },

  // ---------- 多会话 ----------
  /** 生成会话 id */
  genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  /** 获取所有会话（按更新时间倒序） */
  getSessions() {
    try {
      const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.sessions) || '[]');
      return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } catch {
      return [];
    }
  },

  /** 创建新会话 */
  createSession(messages = []) {
    const id = this.genId();
    const session = {
      id,
      title: this.titleFromMessages(messages),
      messages,
      updatedAt: Date.now(),
    };
    const list = this.getSessions();
    list.push(session);
    try {
      localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(list));
    } catch {
      /* 忽略 */
    }
    this.setActiveSession(id);
    return session;
  },

  /** 保存会话 */
  saveSession(id, messages) {
    const list = this.getSessions();
    const idx = list.findIndex((s) => s.id === id);
    const updated = { id, title: this.titleFromMessages(messages), messages, updatedAt: Date.now() };
    if (idx >= 0) list[idx] = updated;
    else list.push(updated);
    try {
      localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(list));
    } catch {
      /* 忽略 */
    }
  },

  /** 删除会话 */
  deleteSession(id) {
    const list = this.getSessions().filter((s) => s.id !== id);
    try {
      localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(list));
    } catch {
      /* 忽略 */
    }
    if (this.getActiveSessionId() === id) {
      this.setActiveSession(null);
    }
  },

  /** 获取单个会话 */
  getSession(id) {
    return this.getSessions().find((s) => s.id === id) || null;
  },

  /** 活跃会话 id */
  setActiveSession(id) {
    try {
      if (id === null || id === undefined) localStorage.removeItem(STORAGE_KEYS.activeSessionId);
      else localStorage.setItem(STORAGE_KEYS.activeSessionId, id);
    } catch {
      /* 忽略 */
    }
  },

  getActiveSessionId() {
    try {
      return localStorage.getItem(STORAGE_KEYS.activeSessionId) || null;
    } catch {
      return null;
    }
  },

  /** 从消息生成会话标题 */
  titleFromMessages(messages) {
    const first = messages.find((m) => m.role === 'user');
    if (!first) return '新会话';
    const t = first.content.replace(/\s+/g, ' ').trim();
    return t.length > 18 ? t.slice(0, 18) + '…' : t || '新会话';
  },

  // ---------- 兼容旧版单会话历史 ----------
  saveHistory(history) {
    try {
      localStorage.setItem('dsh_mobile_history', JSON.stringify(history.slice(-50)));
    } catch {
      /* 忽略 */
    }
  },

  getHistory() {
    try {
      return JSON.parse(localStorage.getItem('dsh_mobile_history') || '[]');
    } catch {
      return [];
    }
  },

  clearHistory() {
    try {
      localStorage.removeItem('dsh_mobile_history');
    } catch {
      /* 忽略 */
    }
  },
};
