/**
 * DSH Mobile - 核心逻辑测试（纯 Node，mock DOM/fetch）
 * 用法: node test-mobile.js
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
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => (store[k] = String(v)),
  removeItem: (k) => delete store[k],
};

// ---- 加载 storage.js（new Function 捕获顶层 const）----
const storageSource = fs.readFileSync(path.join(__dirname, 'js', 'storage.js'), 'utf8');
const storage = new Function('localStorage', storageSource + '\nreturn storage;')(global.localStorage);
console.log('=== storage.js 测试 ===');
storage.saveApiKey('sk-test-key-123');
assert(storage.getApiKey() === 'sk-test-key-123', 'API Key 保存/读取');
storage.saveModel('deepseek-reasoner');
assert(storage.getModel() === 'deepseek-reasoner', '模型保存/读取');
assert(storage.getModel() === 'deepseek-reasoner', '模型默认值正确');
storage.saveHistory([{ role: 'user', content: 'hi' }]);
assert(storage.getHistory().length === 1, '历史保存/读取');
storage.clearHistory();
assert(storage.getHistory().length === 0, '历史清除');
storage.clearApiKey();
assert(storage.getApiKey() === '', 'API Key 清除');

// ---- Mock fetch：测试 api.js 的 SSE 解析 ----
console.log('\n=== api.js 流式解析测试 ===');
const chunks = [
  'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"！"}}]}\n\n',
  'data: [DONE]\n\n',
];
// fetch 动态读取 global.fetch，便于测试中切换 mock
global.fetch = async (url, opts) => global.__fetchImpl(url, opts);

const apiSource = fs.readFileSync(path.join(__dirname, 'js', 'api.js'), 'utf8');
const api = new Function('fetch', 'TextDecoder', apiSource + '\nreturn { chatStream, fetchBalance, MODELS };')(
  (url, opts) => global.__fetchImpl(url, opts),
  TextDecoder
);
(async () => {
  // ---- 对话流式测试 ----
  global.__fetchImpl = async (url, opts) => {
    assert(url.startsWith('https://api.deepseek.com'), '请求地址正确');
    assert(opts.headers.Authorization === 'Bearer sk-test-key-123', 'Authorization 头正确');
    const encoder = new TextEncoder();
    let i = 0;
    const reader = {
      read: async () => {
        if (i < chunks.length) return { done: false, value: encoder.encode(chunks[i++]) };
        return { done: true, value: undefined };
      },
    };
    return {
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    };
  };

  let deltas = '';
  const full = await api.chatStream('sk-test-key-123', [{ role: 'user', content: '你好' }], {
    onDelta: (d) => (deltas += d),
  });
  assert(deltas === '你好！', `流式增量拼接: ${JSON.stringify(deltas)}`);
  assert(full === '你好！', '完整回复文本');

  // 余额测试
  global.__fetchImpl = async (url) => {
    assert(url.includes('/user/balance'), '余额接口地址');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        is_available: true,
        balance_infos: [
          { currency: 'CNY', total_balance: '8.52', granted_balance: '0', topped_up_balance: '8.52' },
        ],
      }),
    };
  };
  const bal = await api.fetchBalance('sk-test-key-123');
  assert(bal.is_available === true, '余额获取');
  assert(bal.balance_infos[0].currency === 'CNY', '币种解析');

  // 错误分支
  global.__fetchImpl = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: { message: 'Invalid API key' } }),
  });
  try {
    await api.chatStream('bad', []);
    assert(false, '应抛出错误');
  } catch (e) {
    assert(e.message.includes('401'), `错误信息含状态码: ${e.message}`);
  }

  console.log(`\n结果: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
