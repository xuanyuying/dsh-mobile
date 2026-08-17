/**
 * DSH Mobile - Markdown 渲染器测试（mock 最小 DOM）
 * 用法: node test-md.js
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

// ---- 最小 DOM mock ----
function makeEl(tag) {
  const el = {
    tagName: tag,
    children: [],
    textContent: '',
    className: '',
    href: '',
    target: '',
    rel: '',
    style: {},
    listeners: {},
    appendChild(child) {
      this.children.push(child);
      child.parent = this;
    },
    addEventListener(evt, fn) {
      this.listeners[evt] = fn;
    },
    querySelector() { return null; },
    remove() {},
  };
  return el;
}
global.document = {
  createElement: (tag) => makeEl(tag.toLowerCase()),
  createTextNode: (text) => ({ nodeType: 3, textContent: String(text), tagName: '#text' }),
};
Object.defineProperty(global, 'navigator', {
  value: { clipboard: { writeText: async () => {} } },
  configurable: true,
});

// ---- 收集 DOM 文本 ----
function collectText(el, out = []) {
  if (el.tagName === '#text') {
    out.push(el.textContent);
  } else if (el.children.length === 0 && el.textContent) {
    out.push(el.textContent);
  } else {
    for (const c of el.children) collectText(c, out);
  }
  return out.join('');
}

// ---- 加载 md.js ----
const mdSource = fs.readFileSync(path.join(__dirname, 'js', 'md.js'), 'utf8');
const md = new Function('document', 'navigator', mdSource + '\nreturn md;')(global.document, global.navigator);

console.log('=== Markdown 渲染测试 ===');

// 1. 标题
let el = md.render('# 标题一\n## 标题二');
assert(el.children[0].tagName === 'h1' && collectText(el.children[0]) === '标题一', 'h1 标题渲染');
assert(el.children[1].tagName === 'h2' && collectText(el.children[1]) === '标题二', 'h2 标题渲染');

// 2. 粗体/斜体/行内代码
el = md.render('这是**粗体**和*斜体*和`代码`');
const p = el.children[0];
assert(p.tagName === 'p', '段落渲染');
const tags = p.children.map((c) => c.tagName).join(',');
assert(tags.includes('strong') && tags.includes('em') && tags.includes('code'), `行内格式: ${tags}`);
assert(collectText(p) === '这是粗体和斜体和代码', '行内格式文本');
// 3. 代码块 + 复制按钮
el = md.render('```js\nconst x = 1;\nconsole.log(x);\n```');
const codeBlock = el.children[0];
assert(codeBlock.className.includes('code-block'), '代码块容器');
const header = codeBlock.children[0];
assert(header.children[0].textContent === 'js', '代码语言标签');
assert(typeof header.children[1].listeners.click === 'function', '复制按钮已绑定');
const pre = codeBlock.children[1];
assert(pre.children[0].textContent === 'const x = 1;\nconsole.log(x);\n', '代码内容');

// 4. 列表（有序/无序）
el = md.render('- 苹果\n- 香蕉\n- 橙子');
const ul = el.children[0];
assert(ul.tagName === 'ul' && ul.children.length === 3, '无序列表 3 项');
assert(collectText(ul.children[0]) === '苹果', '列表项内容');

el = md.render('1. 第一步\n2. 第二步');
assert(el.children[0].tagName === 'ol' && el.children[0].children.length === 2, '有序列表 2 项');

// 5. 链接（安全 href）
el = md.render('访问 [DeepSeek](https://platform.deepseek.com) 官网');
const link = el.children[0].children.find((c) => c.tagName === 'a');
assert(link && link.href === 'https://platform.deepseek.com', '链接渲染');
assert(link.target === '_blank' && link.rel === 'noopener noreferrer', '链接安全属性');

// 6. XSS 安全：脚本不执行、无 HTML 注入（渲染为纯文本段落）
el = md.render('<script>alert(1)</script>');
const pEl = el.children[0];
// 渲染结果必须是文本节点/文本段落，而不是 script 元素
assert(pEl.tagName === 'p', 'XSS 内容渲染为段落');
const childTags = pEl.children.map((c) => c.tagName).join(',');
assert(!childTags.includes('script'), `无 script 元素注入: ${childTags || '(纯文本)'}`);

// 7. 引用块
el = md.render('> 引用内容');
assert(el.children[0].tagName === 'blockquote', '引用块渲染');
assert(collectText(el.children[0]) === '引用内容', '引用内容');

// 8. 分割线
el = md.render('---');
assert(el.children[0].tagName === 'hr', '分割线渲染');

// 9. 普通段落合并
el = md.render('第一行\n第二行');
assert(el.children.length === 1, '连续行合并为一段');

console.log(`\n结果: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
