pipeline {
    agent any

    environment {
        DOCKER_REGISTRY = 'registry.cn-hangzhou.aliyuncs.com'
        DOCKER_NAMESPACE = 'terraform-agent'
        BACKEND_IMAGE = "${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/backend:${BUILD_NUMBER}"
        FRONTEND_IMAGE = "${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/frontend:${BUILD_NUMBER}"
        BACKEND_IMAGE_LATEST = "${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/backend:latest"
        FRONTEND_IMAGE_LATEST = "${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/frontend:latest"
        DEPLOY_SERVER = '47.76.53.232'
        DEPLOY_PATH = '/opt/terraform-agent'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build Backend') {
            steps {
                script {
                    sh """
                        docker build -t ${BACKEND_IMAGE} -t ${BACKEND_IMAGE_LATEST} ./backend
                    """
                }
            }
        }

        stage('Build Frontend') {
            steps {
                script {
                    sh """
                        docker build -t ${FRONTEND_IMAGE} -t ${FRONTEND_IMAGE_LATEST} ./frontend
                    """
                }
            }
        }

        stage('Push Images') {
            steps {
                script {
                    sh """
                        docker push ${BACKEND_IMAGE}
                        docker push ${BACKEND_IMAGE_LATEST}
                        docker push ${FRONTEND_IMAGE}
                        docker push ${FRONTEND_IMAGE_LATEST}
                    """
                }
            }
        }

        stage('Deploy') {
            steps {
                script {
                    sh """
                        ssh -o StrictHostKeyChecking=no root@${DEPLOY_SERVER} << 'SSHEOF'
                            set -e
                            mkdir -p ${DEPLOY_PATH}
                            cd ${DEPLOY_PATH}

                            # 拉取最新镜像
                            docker pull ${BACKEND_IMAGE}
                            docker pull ${FRONTEND_IMAGE}

                            # 更新环境变量
                            cat > .env << 'ENVEOF'
LLM_PROVIDER=\${LLM_PROVIDER:-tongyi}
TONGYI_API_KEY=${TONGYI_API_KEY}
ALICLOUD_ACCESS_KEY=${ALICLOUD_ACCESS_KEY}
ALICLOUD_SECRET_KEY=${ALICLOUD_SECRET_KEY}
ALICLOUD_REGION=${ALICLOUD_REGION:-cn-hangzhou}
OSS_BUCKET=${OSS_BUCKET:-terraform-agent-state}
ENVEOF

                            # 更新 docker-compose.yml
                            cat > docker-compose.yml << 'DCEOF'
version: "3.8"
services:
  backend:
    image: ${BACKEND_IMAGE}
    ports:
      - "8000:8000"
    environment:
      - LLM_PROVIDER=\${LLM_PROVIDER}
      - TONGYI_API_KEY=\${TONGYI_API_KEY}
      - ALICLOUD_ACCESS_KEY=\${ALICLOUD_ACCESS_KEY}
      - ALICLOUD_SECRET_KEY=\${ALICLOUD_SECRET_KEY}
      - ALICLOUD_REGION=\${ALICLOUD_REGION}
      - OSS_BUCKET=\${OSS_BUCKET}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - backend_data:/tmp/terraform-agent
    restart: unless-stopped
    networks:
      - agent-net
  frontend:
    image: ${FRONTEND_IMAGE}
    ports:
      - "3000:80"
    depends_on:
      - backend
    restart: unless-stopped
    networks:
      - agent-net
volumes:
  backend_data:
networks:
  agent-net:
    driver: bridge
DCEOF

                            # 重启服务
                            docker-compose down
                            docker-compose up -d

                            # 清理旧镜像
                            docker image prune -f
SSHEOF
                    """
                }
            }
        }
    }

    post {
        success {
            echo '部署成功！'
            echo "访问地址: http://${DEPLOY_SERVER}:3000"
        }
        failure {
            echo '部署失败，请检查日志'
        }
    }
}