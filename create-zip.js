const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// 检查archiver是否安装，如果没有则使用简单方法
async function createZip() {
    try {
        // 尝试使用archiver
        const archiver = require('archiver');
        const output = fs.createWriteStream('qinghuan-ai-v1.0.0.zip');
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            console.log(`✅ Zip文件创建成功: ${archive.pointer()} bytes`);
        });

        archive.on('error', (err) => {
            throw err;
        });

        archive.pipe(output);

        // 添加文件到zip
        archive.file('release/main.js', { name: 'main.js' });
        archive.file('release/manifest.json', { name: 'manifest.json' });
        archive.file('release/styles.css', { name: 'styles.css' });
        archive.file('release/README.md', { name: 'README.md' });
        archive.file('release/version.json', { name: 'version.json' });

        await archive.finalize();

    } catch (error) {
        console.log('⚠️  archiver模块未安装，使用替代方法');

        // 简单的方法：直接复制文件并提示用户手动打包
        console.log('📦 发布文件已准备在 release/ 目录');
        console.log('🔗 请手动将以下文件打包为zip:');
        console.log('   - main.js');
        console.log('   - manifest.json');
        console.log('   - styles.css');
        console.log('   - README.md');
        console.log('   - version.json');
        console.log('💡 建议使用7-Zip或系统自带的压缩功能');
    }
}

createZip();