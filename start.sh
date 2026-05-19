#!/bin/sh

mkdir -p /app/server/data
mkdir -p /app/server/uploads/herbs

if [ -z "$(ls -A /app/server/uploads/herbs/ 2>/dev/null)" ]; then
    echo "检测到上传目录为空，复制初始图片..."
    if [ -d /app/server/init-uploads/herbs/ ]; then
        cp -n /app/server/init-uploads/herbs/* /app/server/uploads/herbs/ 2>/dev/null
        echo "初始图片复制完成"
    fi
else
    echo "上传目录已有文件，跳过初始图片复制"
fi

if [ -d /app/server/init-uploads/ ]; then
    for f in /app/server/init-uploads/video_*.mp4; do
        if [ -f "$f" ]; then
            basename=$(basename "$f")
            if [ ! -f "/app/server/uploads/$basename" ]; then
                cp "$f" "/app/server/uploads/$basename"
                echo "复制视频: $basename"
            fi
        fi
    done
fi

echo "启动服务器..."
exec node server/app.js
