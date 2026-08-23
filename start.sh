#!/bin/bash
echo "启动装修零距离服务器..."
cd "$(dirname "$0")/server"
node server.js
