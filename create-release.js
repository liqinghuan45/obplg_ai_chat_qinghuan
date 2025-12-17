const fs = require('fs');
const path = require('path');

// 创建版本信息文件
const versionInfo = {
    name: "清欢AI聊天",
    version: "1.0.0",
    buildDate: new Date().toISOString(),
    files: [
        "main.js",
        "manifest.json",
        "styles.css",
        "README.md"
    ],
    description: "使用AI编辑器开发的Obsidian AI聊天插件",
    author: "李清欢",
    repository: "https://github.com/liqinghuan45/obplg_ai_chat_qinghuan"
};

fs.writeFileSync('release/version.json', JSON.stringify(versionInfo, null, 2));

console.log('✅ 发布包准备完成！');
console.log('📁 发布目录内容：');
const files = fs.readdirSync('release');
files.forEach(file => {
    const stats = fs.statSync(`release/${file}`);
    if (stats.isFile()) {
        const size = (stats.size / 1024).toFixed(2) + ' KB';
        console.log(`   ${file} - ${size}`);
    }
});

console.log('\n🎉 插件发布包已准备就绪！');
console.log('📦 请手动将 release/ 目录中的文件打包为zip文件进行发布');
console.log('🔗 建议发布文件名: qinghuan-ai-v1.0.0.zip');