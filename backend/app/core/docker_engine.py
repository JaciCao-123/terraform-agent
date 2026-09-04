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

    def _build_variables_config(self, provider: str) -> str:
        """生成变量声明配置"""
        if provider == "alicloud":
            return """variable "ALICLOUD_REGION" {
  type    = string
  default = "cn-hangzhou"
}
"""
        elif provider == "azure":
            return """variable "ARM_SUBSCRIPTION_ID" {
  type = string
}
variable "ARM_CLIENT_ID" {
  type = string
}
variable "ARM_CLIENT_SECRET" {
  type = string
}
variable "ARM_TENANT_ID" {
  type = string
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

    async def run_terraform_once(
        self,
        command: list[str],
        provider: str = "alicloud",
        env_vars: Optional[dict[str, str]] = None,
        work_dir: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """
        在 Docker 容器中执行 Terraform 命令（不写入 .tf 文件，仅 init + 执行）。

        用于 import、state 等不需要 .tf 内容的操作。
        """
        if work_dir is None:
            work_dir = tempfile.mkdtemp(prefix="terraform-agent-")

        # 写入 provider 配置和后端配置
        provider_config = self._build_provider_config(provider)
        backend_config = self._build_backend_config(provider)
        variables_config = self._build_variables_config(provider)
        with open(os.path.join(work_dir, "provider.tf"), "w") as f:
            f.write(provider_config)
        with open(os.path.join(work_dir, "backend.tf"), "w") as f:
            f.write(backend_config)
        with open(os.path.join(work_dir, "variables.tf"), "w") as f:
            f.write(variables_config)

        container_env = self._build_env_vars(provider, env_vars)

        # init
        async for line in self._run_container(work_dir, ["init", "-no-color", "-input=false"], container_env):
            yield line

        # 目标命令
        full_cmd = command + ["-no-color", "-input=false"]
        async for line in self._run_container(work_dir, full_cmd, container_env):
            yield line

    async def exec_import_resource(
        self,
        hcl_skeleton: str,
        resource_address: str,
        resource_id: str,
        provider: str = "alicloud",
    ) -> AsyncGenerator[str, None]:
        """
        执行 terraform import，将存量资源导入到 state。

        Args:
            hcl_skeleton: 最小化 HCL 配置骨架
            resource_address: Terraform 资源地址 (e.g. "alicloud_instance.this")
            resource_id: 云平台上的资源 ID
            provider: 云平台
        """
        work_dir = tempfile.mkdtemp(prefix="terraform-agent-import-")

        # 写入 provider 配置、后端配置、变量声明和 HCL 骨架
        provider_config = self._build_provider_config(provider)
        backend_config = self._build_backend_config(provider)
        variables_config = self._build_variables_config(provider)
        with open(os.path.join(work_dir, "provider.tf"), "w") as f:
            f.write(provider_config)
        with open(os.path.join(work_dir, "backend.tf"), "w") as f:
            f.write(backend_config)
        with open(os.path.join(work_dir, "variables.tf"), "w") as f:
            f.write(variables_config)
        with open(os.path.join(work_dir, "main.tf"), "w") as f:
            f.write(hcl_skeleton)

        container_env = self._build_env_vars(provider)

        # init
        async for line in self._run_container(work_dir, ["init", "-no-color", "-input=false"], container_env):
            yield line

        # import
        import_cmd = ["import", f"-input=false", resource_address, resource_id, "-no-color"]
        async for line in self._run_container(work_dir, import_cmd, container_env):
            yield line

    async def exec_show_resource(
        self,
        provider: str = "alicloud",
    ) -> str:
        """
        执行 terraform show 获取资源的完整配置。

        Returns:
            JSON 格式的完整资源配置
        """
        work_dir = tempfile.mkdtemp(prefix="terraform-agent-show-")

        # 写入 provider 配置和后端配置
        provider_config = self._build_provider_config(provider)
        backend_config = self._build_backend_config(provider)
        with open(os.path.join(work_dir, "provider.tf"), "w") as f:
            f.write(provider_config)
        with open(os.path.join(work_dir, "backend.tf"), "w") as f:
            f.write(backend_config)

        container_env = self._build_env_vars(provider)

        loop = asyncio.get_event_loop()

        def _run():
            container: Container = self.client.containers.run(
                image=self.image,
                command=["init", "-no-color", "-input=false"],
                environment=container_env,
                volumes={work_dir: {"bind": "/workspace", "mode": "rw"}},
                working_dir="/workspace",
                detach=True,
                remove=False,
                network_mode="bridge",
            )
            for _ in container.logs(stream=True, follow=True):
                pass
            exit_code = container.wait()["StatusCode"]
            container.remove()
            if exit_code != 0:
                return f""

            # 执行 terraform show -json
            container2: Container = self.client.containers.run(
                image=self.image,
                command=["show", "-no-color", "-json"],
                environment=container_env,
                volumes={work_dir: {"bind": "/workspace", "mode": "rw"}},
                working_dir="/workspace",
                detach=True,
                remove=False,
                network_mode="bridge",
            )
            show_output = []
            for log_line in container2.logs(stream=True, follow=True):
                show_output.append(log_line.decode("utf-8", errors="replace"))
            exit_code2 = container2.wait()["StatusCode"]
            _ = exit_code2  # 在非 0 时容器日志中已有错误信息
            container2.remove()
            return "\n".join(show_output)

        output = await loop.run_in_executor(None, _run)
        return output

    def test_connection(self) -> bool:
        """测试 Docker 连接是否正常"""
        try:
            self.client.ping()
            return True
        except Exception:
            return False