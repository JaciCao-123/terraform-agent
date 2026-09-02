pipeline {
    agent any

    environment {
        GIT_REPO = 'https://github.com/JaciCao-123/terraform-agent.git'
        GIT_BRANCH = 'main'
        DEPLOY_SERVER = '47.76.53.232'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Verify') {
            steps {
                script {
                    echo "=== 代码检查 ==="
                    echo "版本: ${env.GIT_COMMIT}"
                    echo "分支: ${env.BRANCH_NAME}"
                    echo "部署服务器: ${DEPLOY_SERVER}"
                }
            }
        }

        stage('Notify Server') {
            steps {
                script {
                    echo "=== 触发部署 ==="
                    echo "Jenkins 无法直接 SSH 到部署服务器(网络隔离)"
                    echo "部署服务器已配置自动拉取脚本"
                    echo ""
                    echo "如需手动部署，在服务器上执行:"
                    echo "  ssh root@${DEPLOY_SERVER} 'bash /opt/terraform-agent/deploy.sh'"
                    echo ""
                    echo "或等待自动部署 (每 5 分钟检查更新)"
                }
            }
        }
    }

    post {
        success {
            echo "✅ 构建成功 - 代码已推送到 GitHub，等待服务器部署"
        }
        failure {
            echo "❌ 构建失败，请检查日志"
        }
    }
}
