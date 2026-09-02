#!/bin/bash
# Terraform Agent 部署脚本
# 用法: ./deploy.sh <server_ip> <env_file>
# 示例: ./deploy.sh 47.76.53.232 .env.production

set -euo pipefail

SERVER_IP="${1:-47.76.53.232}"
ENV_FILE="${2:-.env}"
DEPLOY_PATH="/opt/terraform-agent"
SSH_USER="root"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ 环境变量文件 $ENV_FILE 不存在"
    echo "用法: $0 <server_ip> <env_file>"
    exit 1
fi

echo "=== 1. 构建 Docker 镜像 ==="
docker compose build

echo "=== 2. 保存镜像 ==="
docker save terraform-agent-backend terraform-agent-frontend | gzip > /tmp/terraform-agent-images.tar.gz

echo "=== 3. 传输到服务器 ==="
scp -o StrictHostKeyChecking=no /tmp/terraform-agent-images.tar.gz ${SSH_USER}@${SERVER_IP}:${DEPLOY_PATH}/images.tar.gz
scp -o StrictHostKeyChecking=no docker-compose.yml ${SSH_USER}@${SERVER_IP}:${DEPLOY_PATH}/docker-compose.yml
scp -o StrictHostKeyChecking=no ${ENV_FILE} ${SSH_USER}@${SERVER_IP}:${DEPLOY_PATH}/.env

echo "=== 4. 在服务器上部署 ==="
ssh -o StrictHostKeyChecking=no ${SSH_USER}@${SERVER_IP} << 'SSHEOF'
    set -e
    cd /opt/terraform-agent

    # 加载镜像
    docker load < images.tar.gz

    # 停止旧服务
    docker compose down || true

    # 启动新服务
    docker compose up -d

    # 清理
    rm -f images.tar.gz
    docker image prune -f

    echo "✅ 部署完成！"
    echo "   前端: http://$(hostname -I | awk '{print $1}'):3000"
    echo "   后端: http://$(hostname -I | awk '{print $1}'):8000"
SSHEOF

echo "=== 部署成功 ==="