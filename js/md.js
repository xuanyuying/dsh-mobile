/**
 * DSH Mobile - 轻量 Markdown 渲染器（零依赖，XSS 安全）
 *
 * 支持：代码块（含复制按钮）、行内代码、粗体、斜体、
 *       无序/有序列表、链接、标题、引用块、分割线。
 * 安全：全部用 DOM API 构建（textContent），不执行任何 HTML/脚本。
 */
'use strict';

const md = (() => {
  /** 转义 HTML 特殊字符 */
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 构建代码块 DOM（含复制按钮 + 轻量语法高亮） */
  function buildCodeBlock(code, lang) {
    const container = document.createElement('div');
    container.className = 'code-block';

    const header = document.createElement('div');
    header.className = 'code-header';
    const langLabel = document.createElement('span');
    langLabel.className = 'code-lang';
    langLabel.textContent = lang || 'code';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'code-copy';
    copyBtn.textContent = '复制';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard
        ?.writeText(code)
        .then(() => {
          copyBtn.textContent = '已复制 ✓';
          setTimeout(() => (copyBtn.textContent = '复制'), 1500);
        })
        .catch(() => {
          copyBtn.textContent = '复制失败';
        });
    });
    header.appendChild(langLabel);
    header.appendChild(copyBtn);

    const pre = document.createElement('pre');
    const codeEl = document.createElement('code');
    // 轻量语法高亮：按行渲染，用 span 着色关键词/字符串/注释
    const lines = code.replace(/\n$/, '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) codeEl.appendChild(document.createTextNode('\n'));
      codeEl.appendChild(highlightLine(lines[i], lang));
    }
    pre.appendChild(codeEl);

    container.appendChild(header);
    container.appendChild(pre);
    return container;
  }

  /** 单行轻量高亮（返回 span 片段数组） */
  function highlightLine(line, lang) {
    const KEYWORDS =
      /\b(const|let|var|function|return|if|else|for|while|import|export|from|class|new|this|async|await|try|catch|throw|switch|case|break|continue|def|lambda|int|float|str|bool|None|True|False|print|public|private|static|void|int|String|boolean|null|undefined|typeof|instanceof|extends|super|do|default|in|of|yield|delete|void|interface|type|enum|namespace|using|package|require|module|exports|select|from|where|order|by|group|having|insert|update|delete|create|table|join|on|values|set|primary|key|foreign|references)\b/g;
    const COMMENT = /(\/\/.*|\/\*.*\*\/|#.*|--.*)/g;
    const STRING = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g;

    const frag = document.createDocumentFragment();
    let pos = 0;
    // 合并所有匹配，按位置着色
    const tokens = [];
    let m;
    STRING.lastIndex = 0;
    const strRe = new RegExp(STRING.source, 'g');
    while ((m = strRe.exec(line))) tokens.push({ start: m.index, end: m.index + m[0].length, type: 'str', text: m[0] });
    COMMENT.lastIndex = 0;
    const comRe = new RegExp(COMMENT.source, 'g');
    while ((m = comRe.exec(line))) tokens.push({ start: m.index, end: m.index + m[0].length, type: 'com', text: m[0] });
    KEYWORDS.lastIndex = 0;
    const kwRe = new RegExp(KEYWORDS.source, 'g');
    while ((m = kwRe.exec(line))) tokens.push({ start: m.index, end: m.index + m[0].length, type: 'kw', text: m[0] });

    // 按位置排序，先处理字符串/注释（更长的优先），关键字避开已占位区域
    tokens.sort((a, b) => a.start - b.start || b.end - a.end);
    const occupied = [];
    const placed = [];
    for (const t of tokens) {
      if (t.type === 'com' || t.type === 'str') {
        // 注释/字符串优先且允许嵌套
        const overlap = occupied.some((o) => t.start < o.end && t.end > o.start);
        if (!overlap) {
          occupied.push(t);
          placed.push(t);
        }
      }
    }
    for (const t of tokens) {
      if (t.type !== 'kw') continue;
      const overlap = occupied.some((o) => t.start < o.end && t.end > o.start);
      if (!overlap) {
        occupied.push(t);
        placed.push(t);
      }
    }
    placed.sort((a, b) => a.start - b.start);

    for (const t of placed) {
      if (t.start > pos) frag.appendChild(document.createTextNode(line.slice(pos, t.start)));
      const span = document.createElement('span');
      span.className = t.type === 'kw' ? 'tk-kw' : t.type === 'str' ? 'tk-str' : 'tk-com';
      span.textContent = t.text;
      frag.appendChild(span);
      pos = t.end;
    }
    if (pos < line.length) frag.appendChild(document.createTextNode(line.slice(pos)));
    return frag;
  }

  /**
   * 解析行内格式（粗体/斜体/行内代码/链接），返回包含元素数组
   */
  function parseInline(text) {
    const parts = [];
    // 先按行内代码切分
    const segments = text.split(/(`[^`]+`)/g);
    for (const seg of segments) {
      if (!seg) continue;
      if (seg.startsWith('`') && seg.endsWith('`') && seg.length >= 2) {
        const codeEl = document.createElement('code');
        codeEl.className = 'inline-code';
        codeEl.textContent = seg.slice(1, -1);
        parts.push(codeEl);
        continue;
      }
      // 处理粗体 **text** 与斜体 *text*
      const inlineSegs = seg.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
      for (const iseg of inlineSegs) {
        if (!iseg) continue;
        if (iseg.startsWith('**') && iseg.endsWith('**') && iseg.length > 4) {
          const b = document.createElement('strong');
          b.textContent = iseg.slice(2, -2);
          parts.push(b);
        } else if (iseg.startsWith('*') && iseg.endsWith('*') && iseg.length > 2) {
          const em = document.createElement('em');
          em.textContent = iseg.slice(1, -1);
          parts.push(em);
        } else {
          // 链接 [text](url)
          const linkSegs = iseg.split(/(\[[^\]]+\]\([^)]+\))/g);
          for (const lseg of linkSegs) {
            if (!lseg) continue;
            const m = lseg.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
            if (m) {
              const a = document.createElement('a');
              a.textContent = m[1];
              a.href = m[2];
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
              parts.push(a);
            } else {
              parts.push(document.createTextNode(lseg));
            }
          }
        }
      }
    }
    return parts;
  }

  /** 构建一行（含内联格式） */
  function buildLine(text) {
    const p = document.createElement('p');
    const nodes = parseInline(text);
    for (const n of nodes) p.appendChild(n);
    return p;
  }

  /** 构建列表 */
  function buildList(items, ordered) {
    const listEl = document.createElement(ordered ? 'ol' : 'ul');
    for (const item of items) {
      const li = document.createElement('li');
      // 支持嵌套：item 内容再递归
      const subLines = item.split('\n');
      const first = subLines[0];
      const nodes = parseInline(first);
      for (const n of nodes) li.appendChild(n);
      if (subLines.length > 1) {
        const sub = document.createElement('div');
        sub.appendChild(renderMarkdown(subLines.slice(1).join('\n')));
        li.appendChild(sub);
      }
      listEl.appendChild(li);
    }
    return listEl;
  }

  /** 渲染 Markdown 文本为 DOM 元素 */
  function renderMarkdown(text) {
    const container = document.createElement('div');
    container.className = 'md-body';
    if (!text) return container;

    const lines = String(text).split('\n');
    let i = 0;
    let listBuffer = null; // { ordered, items }
    let codeBuffer = null; // { code, lang }

    function flushList() {
      if (listBuffer) {
        container.appendChild(buildList(listBuffer.items, listBuffer.ordered));
        listBuffer = null;
      }
    }

    function flushCode() {
      if (codeBuffer) {
        container.appendChild(buildCodeBlock(codeBuffer.code, codeBuffer.lang));
        codeBuffer = null;
      }
    }

    while (i < lines.length) {
      const line = lines[i];

      // 代码块开始或继续
      const fenceMatch = line.match(/^```(\w*)\s*$/);
      if (fenceMatch) {
        flushList();
        if (codeBuffer) {
          // 结束代码块
          flushCode();
        } else {
          codeBuffer = { code: '', lang: fenceMatch[1] };
        }
        i++;
        continue;
      }
      if (codeBuffer) {
        codeBuffer.code += line + '\n';
        i++;
        continue;
      }

      // 空行：刷新列表
      if (!line.trim()) {
        flushList();
        i++;
        continue;
      }

      // 分割线
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        flushList();
        const hr = document.createElement('hr');
        container.appendChild(hr);
        i++;
        continue;
      }

      // 标题
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushList();
        const h = document.createElement(`h${heading[1].length}`);
        const nodes = parseInline(heading[2]);
        for (const n of nodes) h.appendChild(n);
        container.appendChild(h);
        i++;
        continue;
      }

      // 引用块
      if (line.startsWith('> ')) {
        flushList();
        const blockquote = document.createElement('blockquote');
        blockquote.appendChild(buildLine(line.slice(2)));
        // 合并连续引用
        while (i + 1 < lines.length && lines[i + 1].startsWith('> ')) {
          i++;
          blockquote.appendChild(buildLine(lines[i].slice(2)));
        }
        container.appendChild(blockquote);
        i++;
        continue;
      }

      // 无序列表
      const ulMatch = line.match(/^\s*[-*+]\s+(.+)$/);
      if (ulMatch) {
        if (!listBuffer || listBuffer.ordered) {
          flushList();
          listBuffer = { ordered: false, items: [] };
        }
        listBuffer.items.push(ulMatch[1]);
        i++;
        continue;
      }

      // 有序列表
      const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);
      if (olMatch) {
        if (!listBuffer || !listBuffer.ordered) {
          flushList();
          listBuffer = { ordered: true, items: [] };
        }
        listBuffer.items.push(olMatch[1]);
        i++;
        continue;
      }

      // 普通行（合并相邻行成一个段落）
      flushList();
      const paraLines = [line];
      while (
        i + 1 < lines.length &&
        lines[i + 1].trim() &&
        !/^```/.test(lines[i + 1]) &&
        !/^\s*[-*+]\s+/.test(lines[i + 1]) &&
        !/^\s*\d+\.\s+/.test(lines[i + 1]) &&
        !/^#{1,6}\s+/.test(lines[i + 1]) &&
        !/^> /.test(lines[i + 1]) &&
        !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i + 1])
      ) {
        i++;
        paraLines.push(lines[i]);
      }
      const p = document.createElement('p');
      const nodes = parseInline(paraLines.join(' '));
      for (const n of nodes) p.appendChild(n);
      container.appendChild(p);
      i++;
    }

    flushList();
    flushCode();
    return container;
  }

  return { render: renderMarkdown, highlight: highlightLine };
})();
