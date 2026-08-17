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

console.log('=== 多会话测试 ===');
storage.saveTheme('light');
assert(storage.getTheme() === 'light', '主题保存/读取');
storage.saveTheme('auto');
assert(storage.getTheme() === 'auto', '主题切换保存');

const s1 = storage.createSession([{ role: 'user', content: '今天天气怎么样？' }]);
assert(!!s1.id && s1.id.length > 0, '会话 id 生成');
assert(storage.getActiveSessionId() === s1.id, '新建会话自动设为活跃');
assert(s1.title.includes('今天天气'), `会话标题来自首条消息: ${s1.title}`);

const s2 = storage.createSession([]);
assert(s2.title === '新会话', '空会话默认标题');
assert(storage.getSessions().length === 2, '两个会话已保存');

storage.saveSession(s2.id, [{ role: 'user', content: '你好' }, { role: 'assistant', content: '你好！有什么可以帮你？' }]);
const loaded = storage.getSession(s2.id);
assert(loaded.messages.length === 2, '会话消息更新');
assert(loaded.title.includes('你好'), '会话标题随消息更新');

storage.deleteSession(s1.id);
assert(storage.getSessions().length === 1, '会话删除');
assert(storage.getSession(s1.id) === null, '已删除会话不可读');
assert(storage.getActiveSessionId() !== s1.id, '删除活跃会话后清除活跃标记');

storage.setActiveSession(s2.id);
assert(storage.getActiveSessionId() === s2.id, '手动设置活跃会话');

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
  let reasoningDeltas = '';
  const result = await api.chatStream('sk-test-key-123', [{ role: 'user', content: '你好' }], {
    onDelta: (d) => (deltas += d),
    onReasoning: (d) => (reasoningDeltas += d),
  });
  assert(deltas === '你好！', `流式增量拼接: ${JSON.stringify(deltas)}`);
  assert(result.content === '你好！', '完整回复文本');
  assert(result.reasoning === '', '无推理过程时为空');

  // 推理过程测试（Reasoner）
  const reasonChunks = [
    'data: {"choices":[{"delta":{"reasoning_content":"思考中"}}]}\n\n',
    'data: {"choices":[{"delta":{"reasoning_content":"…完成"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"答案"}}]}\n\n',
    'data: [DONE]\n\n',
  ];
  global.__fetchImpl = async () => {
    const encoder = new TextEncoder();
    let i = 0;
    return {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            if (i < reasonChunks.length) return { done: false, value: encoder.encode(reasonChunks[i++]) };
            return { done: true, value: undefined };
          },
        }),
      },
    };
  };
  const reasonResult = await api.chatStream('sk-test-key-123', [], {
    onReasoning: (d) => (reasoningDeltas += d),
  });
  assert(reasoningDeltas === '思考中…完成', `推理增量拼接: ${JSON.stringify(reasoningDeltas)}`);
  assert(reasonResult.reasoning === '思考中…完成', '推理过程返回');
  assert(reasonResult.content === '答案', '推理+内容混合返回');

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
