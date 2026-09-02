pipeline {
    agent any

    environment {
        GIT_REPO = 'https://github.com/JaciCao-123/terraform-agent.git'
        GIT_BRANCH = 'main'
        DEPLOY_SERVER = '172.21.36.91'
        SSH_KEY = '/var/jenkins_home/.ssh/id_ed25519'
        DEPLOY_PATH = '/opt/terraform-agent'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build & Deploy') {
            steps {
                script {
                    echo "=== 部署到 ${DEPLOY_SERVER} ==="
                    sh """
                        ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no root@${DEPLOY_SERVER} bash -s << 'SCRIPT'
set -euo pipefail

cd ${DEPLOY_PATH}

echo '=== 1. 拉取代码 ==='
if [ -d .git ]; then
    git pull
else
    rm -rf /tmp/tf-agent
    git clone -b ${GIT_BRANCH} ${GIT_REPO} /tmp/tf-agent
    rsync -av --exclude='deploy.sh' --exclude='.env' /tmp/tf-agent/ .
    rm -rf /tmp/tf-agent
fi

echo '=== 2. 构建镜像 ==='
docker compose -f docker-compose.prod.yml build

echo '=== 3. 重启服务 ==='
docker compose -f docker-compose.prod.yml down || true
docker compose -f docker-compose.prod.yml up -d

echo '=== 4. 清理 ==='
docker image prune -f

echo '=== 部署完成 ==='
SCRIPT
                    """
                }
            }
        }
    }

    post {
        success {
            echo "✅ 部署成功 - 前端: http://${DEPLOY_SERVER}:3001"
        }
        failure {
            echo "❌ 部署失败，请检查日志"
        }
    }
}