/**
 * DSH Mobile - 余额显示模块
 */
'use strict';

const balance = (() => {
  let timer = null;
  let lastState = null;
  const REFRESH_MS = 30000; // 30 秒刷新

  /** 格式化金额 */
  function fmtMoney(v) {
    const n = Number(v);
    if (Number.isNaN(n)) return '--';
    return n.toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /** 更新余额 UI */
  function render(state) {
    lastState = state;
    const badge = document.getElementById('balance-badge');
    if (!badge) return;

    if (!state.ok) {
      badge.textContent = '⚠️ 余额不可用';
      badge.title = state.error || '余额获取失败';
      badge.classList.add('error');
      return;
    }

    const cny = state.balances.find((b) => (b.currency || '').toUpperCase() === 'CNY') || state.balances[0];
    if (!cny) {
      badge.textContent = '💰 --';
      return;
    }
    badge.textContent = `💰 ¥${fmtMoney(cny.total_balance)}`;
    badge.classList.remove('error');

    // 组装悬停详情
    const rows = state.balances
      .map((b) => `${b.currency} 总 ¥${fmtMoney(b.total_balance)}（赠 ${fmtMoney(b.granted_balance)} / 充 ${fmtMoney(b.topped_up_balance)}）`)
      .join(' | ');
    badge.title = rows || state.error || '';
  }

  /** 刷新余额 */
  async function refresh() {
    const key = storage.getApiKey();
    if (!key) {
      render({ ok: false, error: '未配置 API Key' });
      return;
    }
    try {
      const json = await fetchBalance(key);
      if (json && json.is_available !== undefined) {
        render({
          ok: true,
          isAvailable: json.is_available,
          balances: Array.isArray(json.balance_infos) ? json.balance_infos : [],
          fetchedAt: Date.now(),
        });
      } else {
        render({ ok: false, error: '余额接口返回异常' });
      }
    } catch (e) {
      render({ ok: false, error: e.message });
    }
  }

  /** 启动定时刷新 */
  function start() {
    stop();
    refresh();
    timer = setInterval(refresh, REFRESH_MS);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { refresh, start, stop, render, lastState };
})();
