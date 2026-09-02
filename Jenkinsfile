pipeline {
    agent any

    environment {
        DEPLOY_SERVER = '47.76.53.232'
        DEPLOY_PATH = '/opt/terraform-agent'
        GIT_REPO = 'https://github.com/JaciCao-123/terraform-agent.git'
        GIT_BRANCH = 'main'
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
                    sh """
                        ssh -o StrictHostKeyChecking=no root@${DEPLOY_SERVER} << 'SSHEOF'
                            set -e

                            echo "=== 1. 拉取代码 ==="
                            if [ -d "${DEPLOY_PATH}/.git" ]; then
                                cd ${DEPLOY_PATH} && git pull
                            else
                                git clone -b ${GIT_BRANCH} ${GIT_REPO} ${DEPLOY_PATH}
                                cd ${DEPLOY_PATH}
                            fi

                            echo "=== 2. 配置 Nginx ==="
                            cp deploy/terraform-agent.nginx.conf /etc/nginx/conf.d/terraform-agent.conf
                            nginx -t && nginx -s reload

                            echo "=== 3. 构建镜像 ==="
                            cd ${DEPLOY_PATH}
                            docker compose -f docker-compose.prod.yml build

                            echo "=== 4. 停止旧服务 ==="
                            docker compose -f docker-compose.prod.yml down || true

                            echo "=== 5. 启动新服务 ==="
                            docker compose -f docker-compose.prod.yml up -d

                            echo "=== 6. 清理 ==="
                            docker image prune -f

                            echo "=== ✅ 部署完成 ==="
                            echo "   前端: http://${DEPLOY_SERVER}:3001"
                            echo "   后端: http://${DEPLOY_SERVER}:8002"
SSHEOF
                    """
                }
            }
        }
    }

    post {
        success {
            echo "部署成功！"
            echo "访问地址: http://${DEPLOY_SERVER}:3001"
        }
        failure {
            echo '部署失败，请检查日志'
        }
    }
}