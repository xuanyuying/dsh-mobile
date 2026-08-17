/**
 * DSH Mobile - 本地存储模块
 * API Key 与设置仅保存在用户浏览器 localStorage（不上传、不进代码）
 */
'use strict';

const STORAGE_KEYS = {
  apiKey: 'dsh_mobile_api_key',
  model: 'dsh_mobile_model',
  history: 'dsh_mobile_history',
};

const storage = {
  /** 保存 API Key（纯本地） */
  saveApiKey(key) {
    try {
      localStorage.setItem(STORAGE_KEYS.apiKey, (key || '').trim());
    } catch (e) {
      console.warn('无法保存 API Key:', e.message);
    }
  },

  /** 读取 API Key */
  getApiKey() {
    try {
      return localStorage.getItem(STORAGE_KEYS.apiKey) || '';
    } catch {
      return '';
    }
  },

  /** 清除 API Key */
  clearApiKey() {
    try {
      localStorage.removeItem(STORAGE_KEYS.apiKey);
    } catch {
      /* 忽略 */
    }
  },

  /** 保存模型选择 */
  saveModel(model) {
    try {
      localStorage.setItem(STORAGE_KEYS.model, model);
    } catch {
      /* 忽略 */
    }
  },

  /** 读取模型选择 */
  getModel() {
    try {
      return localStorage.getItem(STORAGE_KEYS.model) || 'deepseek-chat';
    } catch {
      return 'deepseek-chat';
    }
  },

  /** 保存会话历史 */
  saveHistory(history) {
    try {
      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history.slice(-50)));
    } catch {
      /* 忽略 */
    }
  },

  /** 读取会话历史 */
  getHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]');
    } catch {
      return [];
    }
  },

  /** 清除会话历史 */
  clearHistory() {
    try {
      localStorage.removeItem(STORAGE_KEYS.history);
    } catch {
      /* 忽略 */
    }
  },
};
