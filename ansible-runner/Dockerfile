FROM python:3.12-slim

# 安装编译工具和 SSH 客户端
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    rustc \
    cargo \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# 升级 pip
RUN pip install --no-cache-dir --upgrade pip

# 安装 Ansible
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

WORKDIR /ansible

ENTRYPOINT ["ansible-playbook"]