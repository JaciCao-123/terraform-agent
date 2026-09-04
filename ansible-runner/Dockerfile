FROM python:3.12-slim

# 安装 SSH 客户端（Ansible 通过 SSH 连接目标机器）
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# 安装 Ansible
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

WORKDIR /ansible

ENTRYPOINT ["ansible-playbook"]