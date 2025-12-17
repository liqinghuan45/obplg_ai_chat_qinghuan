@echo off
echo 正在创建发布包...

cd release
powershell -Command "Compress-Archive -Path '*' -DestinationPath '../qinghuan-ai-v1.0.0.zip' -Force"

echo ✅ 发布包已创建: qinghuan-ai-v1.0.0.zip
pause