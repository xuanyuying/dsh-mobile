# DSH Mobile - DeepSeek 手机端（PWA 网页版）

手机浏览器直接使用的 DeepSeek 客户端：随时对话、实时查看余额。支持"添加到主屏幕"变成类原生 App。

## ✨ 功能

- 💬 **多轮对话**：流式输出，支持 DeepSeek Chat / Reasoner 双模型
- 📝 **Markdown 渲染**：代码块（带复制按钮）、标题、列表、引用、链接、行内格式
- 🛑 **停止生成**：回复中点击按钮即可停止
- 📋 **消息操作**：复制任意消息、重试失败回复
- 💰 **余额实时显示**：顶部余额徽章，30 秒自动刷新，点击手动刷新
- 🔒 **API Key 本地保存**：仅存于浏览器 localStorage，不经过任何服务器
- 📱 **PWA 体验**：可安装到手机主屏幕，离线可用
- 🧠 **会话历史**：自动保存在本机浏览器
- 📶 **在线状态提示**：顶部圆点显示网络状态
- ⌨️ **输入框自适应**：自动增高，支持多行输入

## 🚀 部署（GitHub Pages）

### 方式一：GitHub Actions 自动部署（推荐）

1. 将本项目推到 GitHub 仓库（如 `dsh-mobile`）
2. 仓库 Settings → Pages → Source 选择 **GitHub Actions**
3. 推送代码后自动触发 `.github/workflows/deploy.yml` 部署
4. 访问 `https://<用户名>.github.io/dsh-mobile/`

### 方式二：本地预览

```powershell
python -m http.server 8900
# 浏览器打开 http://127.0.0.1:8900
```

## 🔑 使用

1. 打开网页，点击右上角 **⚙️**
2. 填入你的 DeepSeek API Key（获取：platform.deepseek.com → API Keys）
3. 开始对话；顶部实时显示余额

> ⚠️ API Key 仅保存在你自己的浏览器中，请勿在公共设备上使用。

## 📁 项目结构

```
dsh-mobile/
├── index.html            # 主页面
├── manifest.webmanifest  # PWA 清单
├── sw.js                 # Service Worker（离线缓存）
├── css/style.css         # 移动端样式
├── js/
│   ├── api.js            # DeepSeek API 调用（对话/余额）
│   ├── md.js             # 轻量 Markdown 渲染（XSS 安全）
│   ├── balance.js        # 余额显示模块
│   ├── storage.js        # 本地存储（API Key/历史）
│   └── app.js            # 主应用逻辑
├── icons/                # PWA 图标
├── qr-codes/             # 手机访问二维码
├── scripts/gen-qrcode.js # 二维码生成脚本
├── test-mobile.js        # 核心逻辑测试（14 项）
├── test-md.js            # Markdown 渲染测试（20 项）
├── test-app.js           # 应用集成测试（12 项）
└── .github/workflows/deploy.yml  # 自动部署
```

## 🧪 测试

```powershell
node test-mobile.js   # 14 项断言：存储/流式/余额/错误
node test-md.js       # 20 项断言：Markdown 渲染与 XSS 安全
node test-app.js      # 12 项断言：聊天全流程集成
```

## 🔒 安全说明

- 无后端：所有请求由浏览器直接发往 `api.deepseek.com`（官方已允许 CORS）
- API Key 不离开你的设备，不写入代码或仓库
- 项目无任何个人 API Key / 个人信息
