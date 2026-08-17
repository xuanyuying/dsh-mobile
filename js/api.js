/**
 * DSH Mobile - DeepSeek API 调用模块
 * 浏览器直连官方 API（CORS 已验证支持），无需代理
 */
'use strict';

const DEEPSEEK_API = 'https://api.deepseek.com';

/**
 * 发起对话请求（流式）
 * @param {string} apiKey - API Key
 * @param {Array} messages - 消息数组 [{role, content}]
 * @param {object} options - { model, onDelta, onReasoning, signal }
 * @returns {Promise<{content: string, reasoning: string}>} 完整回复
 */
async function chatStream(apiKey, messages, { model = 'deepseek-chat', onDelta, onReasoning, signal } = {}) {
  const res = await fetch(`${DEEPSEEK_API}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    let detail = '';
    try {
      const err = await res.json();
      detail = err.error?.message || JSON.stringify(err);
    } catch {
      /* 忽略解析错误 */
    }
    throw new Error(`请求失败 (${res.status}): ${detail || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let full = '';
  let reasoning = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // 按行解析 SSE 数据
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || '';
        const reasonDelta = json.choices?.[0]?.delta?.reasoning_content || '';
        if (reasonDelta) {
          reasoning += reasonDelta;
          if (onReasoning) onReasoning(reasonDelta);
        }
        if (delta) {
          full += delta;
          if (onDelta) onDelta(delta);
        }
      } catch {
        /* 忽略不完整 JSON */
      }
    }
  }

  return { content: full, reasoning };
}

/**
 * 获取账户余额
 * @param {string} apiKey
 * @returns {Promise<object>} { isAvailable, balances: [{currency, total_balance, granted_balance, topped_up_balance}] }
 */
async function fetchBalance(apiKey) {
  const res = await fetch(`${DEEPSEEK_API}/user/balance`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!res.ok) throw new Error(`余额接口错误 (${res.status})`);
  return res.json();
}

/** 可用模型列表 */
const MODELS = ['deepseek-chat', 'deepseek-reasoner'];
