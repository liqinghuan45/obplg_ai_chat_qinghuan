const fs = require('fs');
const path = require('path');

// 创建一个简单的zip替代方案 - 创建一个自解压脚本
const files = [
    'release/main.js',
    'release/manifest.json',
    'release/styles.css',
    'release/README.md',
    'release/version.json'
];

console.log('📦 准备发布文件...');

// 验证所有文件存在
for (const file of files) {
    if (!fs.existsSync(file)) {
        console.error(`❌ 文件不存在: ${file}`);
        process.exit(1);
    }
    const stats = fs.statSync(file);
    console.log(`✅ ${file} - ${(stats.size / 1024).toFixed(2)} KB`);
}

console.log('\n🎉 所有文件已准备好上传到GitHub Release！');
console.log('🔗 Release页面: https://github.com/liqinghuan45/obplg_ai_chat_qinghuan/releases/tag/v1.0.0');