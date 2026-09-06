FROM python:3.12-slim

WORKDIR /app

# 安装编译工具（cryptography 等依赖需要 Rust 编译）
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    rustc \
    cargo \
    && rm -rf /var/lib/apt/lists/*

# 升级 pip
RUN pip install --no-cache-dir --upgrade pip

# 安装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码
COPY . .

# 暴露端口
EXPOSE 8000

# 启动
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]