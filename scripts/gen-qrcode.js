/**
 * 生成手机端访问二维码
 * 用法: node scripts/gen-qrcode.js
 * 输出: ../qr-codes/ 目录
 */
'use strict';

const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'qr-codes');

// 需要生成的二维码地址
const TARGETS = [
  {
    file: 'dsh-mobile-github.png',
    url: 'https://xuanyuying.github.io/dsh-mobile/',
    label: 'DSH Mobile (GitHub Pages 正式地址)',
  },
  {
    file: 'dsh-mobile-local.png',
    url: 'http://127.0.0.1:8900/',
    label: 'DSH Mobile (本机预览地址)',
  },
];

async function generateQr(file, url) {
  const outFile = path.join(outDir, file);
  await QRCode.toFile(outFile, url, {
    width: 600,
    margin: 2,
    color: {
      dark: '#0d1117',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'M',
  });
  const size = fs.statSync(outFile).size;
  console.log(`✅ ${file}  (${(size / 1024).toFixed(1)} KB) -> ${url}`);
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  console.log('=== 生成二维码 ===');
  for (const t of TARGETS) {
    await generateQr(t.file, t.url);
  }
  console.log('\n完成，二维码已保存到: ' + outDir);
})();
