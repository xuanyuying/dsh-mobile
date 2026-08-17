/**
 * DSH Mobile - app.js 集成测试（mock DOM + fetch）
 * 验证：DOMContentLoaded 初始化、发送流程、Markdown 渲染集成
 * 用法: node test-app.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
function assert(cond, name) {
  if (cond) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}`);
  }
}

// ---- Mock localStorage ----
const store = {};
Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => (store[k] = String(v)),
    removeItem: (k) => delete store[k],
  },
  configurable: true,
});

// ---- Mock navigator ----
Object.defineProperty(global, 'navigator', {
  value: {
    onLine: true,
    clipboard: { writeText: async () => {} },
    // 模拟不支持 Service Worker（app.js 的 'in' 检查会跳过）
  },
  configurable: true,
});

// ---- 简化 DOM mock（app.js 用到的 API）----
const registry = {};
function makeEl(id) {
  const el = {
    id,
    className: '',
    textContent: '',
    value: '',
    placeholder: '',
    innerHTML: '',
    style: {},
    children: [],
    listeners: {},
    attrs: {},
    title: '',
    scrollHeight: 0,
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(c) { this.children.push(c); c.parent = this; },
    addEventListener(evt, fn) { this.listeners[evt] = fn; },
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains: () => false,
    },
  };
  return el;
}

function getEl(id) {
  if (!registry[id]) registry[id] = makeEl(id);
  return registry[id];
}

// messagesEl 注册进 registry，使 app.js 的 getElementById 返回同一对象
const messagesEl = makeEl('messages');
registry['messages'] = messagesEl;
messagesEl.scrollTop = 0;
messagesEl.scrollHeight = 100;
Object.defineProperty(messagesEl, 'scrollTop', { writable: true, value: 0 });

// documentElement mock（applyTheme 使用 setAttribute）
const docEl = makeEl('html');
global.document = {
  readyState: 'complete',
  documentElement: docEl,
  addEventListener(evt, fn) {
    if (evt === 'DOMContentLoaded') this._readyFn = fn;
  },
  getElementById: getEl,
  createElement: (tag) => makeEl('auto-' + Math.random().toString(36).slice(2)),
  createTextNode: (t) => ({ tagName: '#text', textContent: String(t), children: [] }),
  querySelector: () => null,
  querySelectorAll: () => [],
};

// window mock（app.js 注册 online/offline 事件）
global.window = {
  addEventListener() {},
  navigator: global.navigator,
};

// 注册需要的元素
['messages','input','send-btn','new-chat-btn','sessions-btn','sessions-panel',
 'sessions-overlay','sessions-close','session-list','session-search',
 'share-btn','voice-btn','theme-btn','export-all-btn','clear-data-btn',
 'settings-btn','settings-panel','settings-overlay','settings-close',
 'api-key','api-key-save','api-key-clear','model-select','theme-select',
 'balance-badge','empty-hint','online-dot'].forEach(getEl);

// ---- Mock fetch ----
let fetchCalls = 0;
global.fetch = async (url, opts) => {
  fetchCalls++;
  console.log('fetch 调用:', url);
  assert(url.includes('chat/completions'), '调用 chat/completions');
  if (opts.body) {
    const body = JSON.parse(opts.body);
    assert(body.stream === true, '流式请求');
    assert(Array.isArray(body.messages) && body.messages.length > 0, '消息数组');
  }
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
    'data: [DONE]\n\n',
  ];
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (i < chunks.length) return { done: false, value: encoder.encode(chunks[i++]) };
          return { done: true, value: undefined };
        },
      }),
    },
  };
};

// ---- 加载模块（挂到全局，模拟浏览器多 script 共享作用域）----
const storageSource = fs.readFileSync(path.join(__dirname, 'js', 'storage.js'), 'utf8');
global.storage = new Function('localStorage', storageSource + '\nreturn storage;')(global.localStorage);

const mdSource = fs.readFileSync(path.join(__dirname, 'js', 'md.js'), 'utf8');
global.md = new Function('document', 'navigator', mdSource + '\nreturn md;')(global.document, global.navigator);

const apiSource = fs.readFileSync(path.join(__dirname, 'js', 'api.js'), 'utf8');
global.fetch = global.fetch; // 保持现有 mock fetch
const apiMod = new Function('fetch', 'TextDecoder', apiSource + '\nreturn { chatStream, fetchBalance };')(
  global.fetch,
  TextDecoder
);
global.chatStream = apiMod.chatStream;
global.fetchBalance = apiMod.fetchBalance;

const balanceSource = fs.readFileSync(path.join(__dirname, 'js', 'balance.js'), 'utf8');
global.balance = new Function('storage', 'fetchBalance', 'document', balanceSource + '\nreturn balance;')(
  global.storage,
  global.fetchBalance,
  global.document
);

// ---- 加载 app.js（直接执行，模拟浏览器 script 标签共享全局）----
let appSource = fs.readFileSync(path.join(__dirname, 'js', 'app.js'), 'utf8');
const app = new Function('document', 'window', appSource)(global.document, global.window);
// 拦截 unhandled rejection 以捕获 send 内部错误
process.on('unhandledRejection', (err) => {
  console.log('⚠️ unhandledRejection:', err && err.message);
});

console.log('=== app.js 集成测试 ===');
assert(typeof app === 'undefined' || app === undefined, 'app.js 无导出（IIFE 风格）');

// 触发 DOMContentLoaded
document._readyFn();

// 验证初始化状态
assert(getEl('send-btn').listeners['click'] !== undefined, '发送按钮绑定事件');

// 模拟输入并发送（捕获 async 错误）
getEl('input').value = '你好 DeepSeek';
global.storage.saveApiKey('sk-test-123');
const clickResult = getEl('send-btn').listeners['click']();
if (clickResult && typeof clickResult.catch === 'function') {
  clickResult.catch((e) => console.log('async 错误:', e.message));
}

// 等待异步发送完成（确保流式读完）
setTimeout(() => {
  assert(fetchCalls > 0, `fetch 被调用 (${fetchCalls} 次)`);
  // 验证消息渲染
  const msgs = messagesEl.children;
  assert(msgs.length >= 2, `消息已渲染 (${msgs.length} 条)`);
  assert(msgs[0].className === 'message user', '用户消息');
  assert(msgs[1].className === 'message assistant', '助手消息');

  // 验证多会话保存
  const sessions = global.storage.getSessions();
  assert(sessions.length >= 1, `会话已保存 (${sessions.length} 个)`);
  const active = sessions.find((s) => s.id === global.storage.getActiveSessionId());
  assert(!!active, '活跃会话存在');
  assert(active.messages.length >= 2, `会话消息已保存 (${active.messages.length} 条)`);
  assert(active.messages[0].role === 'user' && active.messages[0].content === '你好 DeepSeek', '用户消息保存');
  assert(active.messages[1].role === 'assistant' && active.messages[1].content === '你好', '助手消息保存（流式拼接）');

  // 验证主题应用（初始化时 applyTheme）
  assert(global.document.documentElement.attrs['data-theme'] !== undefined, '主题属性已应用: ' + (global.document.documentElement.attrs['data-theme'] || 'dark'));
  assert(getEl('theme-btn').listeners['click'] !== undefined, '主题切换按钮绑定');

  console.log(`\n结果: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}, 1500);
