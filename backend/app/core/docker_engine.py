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
        provider: str = "alicloud",
        env_vars: Optional[dict[str, str]] = None,
        work_dir: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """
        在 Docker 容器中执行 Terraform 命令。

        Args:
            command: terraform 子命令参数
            tf_content: .tf 文件内容
            provider: 云平台 "alicloud" | "azure"
            env_vars: 额外环境变量
            work_dir: 工作目录，None 则自动创建

        Yields:
            容器输出的日志行
        """
        if work_dir is None:
            work_dir = tempfile.mkdtemp(prefix="terraform-agent-")

        # 写入 .tf 文件
        tf_file = os.path.join(work_dir, "main.tf")
        with open(tf_file, "w") as f:
            f.write(tf_content)

        # 写入 provider 配置和后端配置
        provider_config = self._build_provider_config(provider)
        backend_config = self._build_backend_config(provider)
        with open(os.path.join(work_dir, "provider.tf"), "w") as f:
            f.write(provider_config)
        with open(os.path.join(work_dir, "backend.tf"), "w") as f:
            f.write(backend_config)

        # 构建环境变量
        container_env = self._build_env_vars(provider, env_vars)

        # 执行 terraform init
        async for line in self._run_container(
            work_dir, ["init", "-no-color", "-input=false"], container_env
        ):
            yield line

        # 执行目标命令
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

            exit_code = container.wait()["StatusCode"]
            container.remove()

            return exit_code, logs

        exit_code, logs = await loop.run_in_executor(None, _run)

        for line in logs:
            yield line

        if exit_code != 0:
            yield f"\n[ERROR] Terraform 命令退出码: {exit_code}"

    def _build_provider_config(self, provider: str) -> str:
        """生成 Terraform provider 配置"""
        if provider == "alicloud":
            return """terraform {
  required_providers {
    alicloud = {
      source  = "hashicorp/alicloud"
      version = "~> 1.285"
    }
  }
}

provider "alicloud" {
  region = var.ALICLOUD_REGION
}
"""
        elif provider == "azure":
            return """terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.ARM_SUBSCRIPTION_ID
  client_id       = var.ARM_CLIENT_ID
  client_secret   = var.ARM_CLIENT_SECRET
  tenant_id       = var.ARM_TENANT_ID
}
"""
        return ""

    def _build_backend_config(self, provider: str) -> str:
        """生成远程后端配置"""
        if provider == "alicloud":
            return f"""terraform {{
  backend "oss" {{
    bucket  = "{settings.oss_bucket}"
    prefix  = "{settings.oss_state_prefix}"
    region  = "{settings.alicloud_region}"
  }}
}}
"""
        elif provider == "azure":
            return f"""terraform {{
  backend "azurerm" {{
    storage_account_name = "{settings.azure_storage_account}"
    container_name       = "{settings.azure_storage_container}"
    key                  = "terraform.tfstate"
  }}
}}
"""
        return ""

    def _build_env_vars(
        self, provider: str = "alicloud",
        extra_vars: Optional[dict[str, str]] = None
    ) -> dict[str, str]:
        """构建容器环境变量"""
        if provider == "alicloud":
            env = {
                "ALICLOUD_ACCESS_KEY": settings.alicloud_access_key,
                "ALICLOUD_SECRET_KEY": settings.alicloud_secret_key,
                "ALICLOUD_REGION": settings.alicloud_region,
                "TF_IN_AUTOMATION": "true",
            }
        elif provider == "azure":
            env = {
                "ARM_CLIENT_ID": settings.arm_client_id,
                "ARM_CLIENT_SECRET": settings.arm_client_secret,
                "ARM_SUBSCRIPTION_ID": settings.arm_subscription_id,
                "ARM_TENANT_ID": settings.arm_tenant_id,
                "ARM_LOCATION": settings.arm_location,
                "TF_IN_AUTOMATION": "true",
            }
        else:
            env = {"TF_IN_AUTOMATION": "true"}

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