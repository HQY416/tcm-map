#!/bin/sh

mkdir -p /app/server/data
mkdir -p /app/server/uploads/herbs

if [ -d /app/server/init-uploads/herbs/ ]; then
    for f in /app/server/init-uploads/herbs/*; do
        if [ -f "$f" ]; then
            basename=$(basename "$f")
            if [ ! -f "/app/server/uploads/herbs/$basename" ]; then
                cp "$f" "/app/server/uploads/herbs/$basename"
                echo "复制图片: $basename"
            fi
        fi
    done
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
