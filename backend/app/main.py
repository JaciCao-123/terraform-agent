"""FastAPI 应用入口"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api import resources, llm, execute, ansible


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时检查 Docker 连接
    from app.core.docker_engine import DockerEngine

    docker = DockerEngine()
    if not docker.test_connection():
        print("[WARNING] Docker 连接失败，请确保 Docker 正在运行")
    else:
        print("[INFO] Docker 连接正常")

    print(f"[INFO] LLM Provider: {settings.llm_provider}")
    print(f"[INFO] 阿里云 Region: {settings.alicloud_region}")
    yield
    print("[INFO] 应用关闭")


app = FastAPI(
    title="Terraform Agent API",
    description="AI 驱动的 Terraform 资源管理 Agent",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS 配置（允许前端跨域访问）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://47.76.53.232:3001", "http://172.21.36.91:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(resources.router)
app.include_router(llm.router)
app.include_router(execute.router)
app.include_router(ansible.router)


@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {"status": "ok", "llm_provider": settings.llm_provider}