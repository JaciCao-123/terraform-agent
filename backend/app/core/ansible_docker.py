"""Ansible Docker 执行引擎：管理 ansible-runner 容器的执行"""

import asyncio
import os
import uuid
from typing import AsyncGenerator, Optional

import docker
from docker.models.containers import Container

from app.config import settings


class AnsibleDocker:
    """管理 ansible-runner 容器的创建和执行"""

    def __init__(self):
        self.client = docker.from_env()
        self.image = settings.ansible_container_image
        self.data_dir = settings.ansible_data_dir

    async def run_playbook(
        self,
        playbook_yaml: str,
        inventory_yaml: str,
        ssh_key_path: Optional[str] = None,
        ssh_user: str = "root",
    ) -> AsyncGenerator[str, None]:
        """
        在 ansible-runner 容器中执行 Ansible Playbook。

        Args:
            playbook_yaml: Playbook YAML 内容
            inventory_yaml: Inventory YAML 内容
            ssh_key_path: SSH 私钥路径（宿主机路径）
            ssh_user: SSH 用户名

        Yields:
            容器输出的日志行
        """
        work_dir = f"/tmp/ansible-{uuid.uuid4().hex[:8]}"
        os.makedirs(work_dir, exist_ok=True)

        playbook_path = os.path.join(work_dir, "playbook.yml")
        inventory_path = os.path.join(work_dir, "inventory.yml")

        with open(playbook_path, "w") as f:
            f.write(playbook_yaml)
        with open(inventory_path, "w") as f:
            f.write(inventory_yaml)

        # 构建容器挂载和命令
        volumes = {
            work_dir: {"bind": self.data_dir, "mode": "rw"},
        }

        # 如果配置了 SSH 密钥，挂载到容器
        ssh_key = ssh_key_path or settings.ssh_private_key_path
        ssh_key_container = "/root/.ssh/id_rsa"
        if ssh_key:
            volumes[ssh_key] = {"bind": ssh_key_container, "mode": "ro"}

        cmd = [
            "-i", f"{self.data_dir}/inventory.yml",
            f"{self.data_dir}/playbook.yml",
            "-v",  # verbose
        ]

        env_vars = {
            "ANSIBLE_HOST_KEY_CHECKING": "False",
            "ANSIBLE_SSH_RETRIES": "3",
            "ANSIBLE_TIMEOUT": "30",
        }
        if ssh_key:
            env_vars["ANSIBLE_PRIVATE_KEY_FILE"] = ssh_key_container
        if ssh_user:
            env_vars["ANSIBLE_REMOTE_USER"] = ssh_user

        async for line in self._run_container(
            cmd=cmd,
            env_vars=env_vars,
            volumes=volumes,
        ):
            yield line

    async def _run_container(
        self,
        cmd: list[str],
        env_vars: dict[str, str],
        volumes: dict[str, dict[str, str]],
    ) -> AsyncGenerator[str, None]:
        """在容器中执行命令，实时流式输出日志"""
        loop = asyncio.get_event_loop()

        def _run():
            container: Container = self.client.containers.run(
                image=self.image,
                command=cmd,
                environment=env_vars,
                volumes=volumes,
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
            yield f"\n[ERROR] Ansible playbook 退出码: {exit_code}"

    def test_connection(self) -> bool:
        """测试 Docker 连接是否正常"""
        try:
            self.client.ping()
            return True
        except Exception:
            return False