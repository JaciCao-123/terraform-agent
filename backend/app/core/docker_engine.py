"""Docker 容器执行引擎：管理 Terraform 容器的全生命周期"""

import asyncio
import os
import tempfile
from typing import AsyncGenerator, Optional

import docker
from docker.models.containers import Container

from app.config import settings


class DockerEngine:
    """管理 Terraform 容器的创建、执行和销毁"""

    def __init__(self):
        self.client = docker.from_env()
        self.image = settings.terraform_image

    async def run_terraform(
        self,
        command: list[str],
        tf_content: str,
        env_vars: Optional[dict[str, str]] = None,
        work_dir: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """
        在 Docker 容器中执行 Terraform 命令。

        Args:
            command: terraform 子命令参数，如 ["plan", "-no-color"]
            tf_content: .tf 文件内容
            env_vars: 额外环境变量（阿里云凭据等）
            work_dir: 工作目录，None 则自动创建临时目录

        Yields:
            容器输出的日志行
        """
        if work_dir is None:
            work_dir = tempfile.mkdtemp(prefix="terraform-agent-")

        # 写入 .tf 文件
        tf_file = os.path.join(work_dir, "main.tf")
        with open(tf_file, "w") as f:
            f.write(tf_content)

        # 写入后端配置
        backend_config = self._build_backend_config()
        backend_file = os.path.join(work_dir, "backend.tf")
        with open(backend_file, "w") as f:
            f.write(backend_config)

        # 构建环境变量
        container_env = self._build_env_vars(env_vars)

        # 执行 terraform init
        async for line in self._run_container(
            work_dir, ["init", "-no-color", "-input=false"], container_env
        ):
            yield line

        # 执行目标命令 (plan / apply / destroy)
        full_cmd = command + ["-no-color", "-input=false"]
        async for line in self._run_container(work_dir, full_cmd, container_env):
            yield line

    async def _run_container(
        self,
        work_dir: str,
        cmd: list[str],
        env_vars: dict[str, str],
    ) -> AsyncGenerator[str, None]:
        """在容器中执行命令，实时流式输出日志"""

        loop = asyncio.get_event_loop()

        def _run():
            container: Container = self.client.containers.run(
                image=self.image,
                command=cmd,
                environment=env_vars,
                volumes={work_dir: {"bind": "/workspace", "mode": "rw"}},
                working_dir="/workspace",
                detach=True,
                remove=False,
                network_mode="bridge",
            )

            logs = []
            for log_line in container.logs(stream=True, follow=True):
                line = log_line.decode("utf-8", errors="replace").rstrip()
                logs.append(line)

            # 等待容器完成
            exit_code = container.wait()["StatusCode"]
            container.remove()

            return exit_code, logs

        exit_code, logs = await loop.run_in_executor(None, _run)

        for line in logs:
            yield line

        if exit_code != 0:
            yield f"\n[ERROR] Terraform 命令退出码: {exit_code}"

    def _build_backend_config(self) -> str:
        """生成 OSS 远程后端配置"""
        return f"""terraform {{
  backend "oss" {{
    bucket  = "{settings.oss_bucket}"
    prefix  = "{settings.oss_state_prefix}"
    region  = "{settings.alicloud_region}"
  }}
}}
"""

    def _build_env_vars(
        self, extra_vars: Optional[dict[str, str]] = None
    ) -> dict[str, str]:
        """构建容器环境变量"""
        env = {
            "ALICLOUD_ACCESS_KEY": settings.alicloud_access_key,
            "ALICLOUD_SECRET_KEY": settings.alicloud_secret_key,
            "ALICLOUD_REGION": settings.alicloud_region,
            "TF_IN_AUTOMATION": "true",
        }
        if extra_vars:
            env.update(extra_vars)
        return env

    def test_connection(self) -> bool:
        """测试 Docker 连接是否正常"""
        try:
            self.client.ping()
            return True
        except Exception:
            return False