"""Ansible 管理器：编排 Ansible Playbook 的生成、修复和执行"""

import json
import os
import time
import uuid
from typing import AsyncGenerator, Optional

from app.config import settings
from app.core.ansible_docker import AnsibleDocker
from app.llm.base import get_llm_provider, BaseLLMProvider
from app.llm.prompt_templates import (
    build_ansible_playbook_prompt,
    build_ansible_fix_prompt,
)
from app.models.ansible_playbook import AnsiblePlaybook
from app.models.ansible_execution import AnsibleExecution


class AnsibleManager:
    """编排 Ansible Playbook 生成、修复和执行全流程"""

    def __init__(self):
        self.docker = AnsibleDocker()
        self._llm: Optional[BaseLLMProvider] = None
        self._playbooks_dir = os.path.join(settings.terraform_work_dir, "ansible", "playbooks")
        self._executions_dir = os.path.join(settings.terraform_work_dir, "ansible", "executions")
        os.makedirs(self._playbooks_dir, exist_ok=True)
        os.makedirs(self._executions_dir, exist_ok=True)

    @property
    def llm(self) -> BaseLLMProvider:
        """懒加载 LLM Provider"""
        if self._llm is None:
            self._llm = get_llm_provider()
        return self._llm

    # ── Playbook 生成 ──

    async def generate_playbook(
        self,
        resource_info: dict,
        user_description: str,
        provider: str = "alicloud",
    ) -> str:
        """调用 LLM 生成 Ansible Playbook YAML

        Args:
            resource_info: 目标资源信息，包含 host、os_type、ssh_user 等
            user_description: 用户自然语言描述
            provider: 云平台

        Returns:
            Playbook YAML 内容
        """
        system_prompt, user_prompt = build_ansible_playbook_prompt(
            resource_info=resource_info,
            user_description=user_description,
            provider=provider,
        )
        playbook_yaml = await self.llm.generate(
            prompt=user_prompt,
            system_prompt=system_prompt,
            temperature=0.1,
        )
        return playbook_yaml.strip()

    # ── Playbook 修复 ──

    async def fix_playbook(self, playbook_yaml: str, error_log: str) -> str:
        """调用 LLM 修复 Playbook"""
        system_prompt, user_prompt = build_ansible_fix_prompt(playbook_yaml, error_log)
        fixed = await self.llm.generate(
            prompt=user_prompt,
            system_prompt=system_prompt,
            temperature=0.2,
        )
        return fixed.strip()

    # ── Playbook 执行 ──

    async def execute_playbook(
        self,
        playbook_yaml: str,
        inventory_yaml: str,
        ssh_key_path: Optional[str] = None,
        ssh_user: str = "root",
    ) -> AsyncGenerator[str, None]:
        """执行 Ansible Playbook"""
        async for line in self.docker.run_playbook(
            playbook_yaml=playbook_yaml,
            inventory_yaml=inventory_yaml,
            ssh_key_path=ssh_key_path,
            ssh_user=ssh_user,
        ):
            yield line

    # ── Playbook 自动修复后执行 ──

    async def execute_with_retry(
        self,
        playbook_yaml: str,
        inventory_yaml: str,
        ssh_key_path: Optional[str] = None,
        ssh_user: str = "root",
        max_retries: int = 2,
    ) -> AsyncGenerator[str, None]:
        """执行 Playbook，失败时自动修复并重试"""
        current_playbook = playbook_yaml

        for attempt in range(max_retries + 1):
            if attempt > 0:
                yield f"\n--- 自动修复尝试 ({attempt}/{max_retries}) ---\n"

            lines = []
            error_detected = False
            async for line in self.execute_playbook(
                playbook_yaml=current_playbook,
                inventory_yaml=inventory_yaml,
                ssh_key_path=ssh_key_path,
                ssh_user=ssh_user,
            ):
                lines.append(line)
                yield line
                if "[ERROR]" in line:
                    error_detected = True

            if not error_detected:
                return

            if attempt < max_retries:
                error_log = "\n".join(lines[-50:])
                yield f"\n[INFO] 检测到错误，正在自动修复 Playbook...\n"
                try:
                    current_playbook = await self.fix_playbook(current_playbook, error_log)
                    yield f"[INFO] Playbook 已修复，重新执行...\n"
                except Exception as e:
                    yield f"[ERROR] 自动修复失败: {e}\n"
                    return

        yield "\n[ERROR] 已达到最大重试次数，请检查 Playbook\n"

    # ── 持久化 ──

    def save_playbook(self, name: str, playbook_yaml: str, provider: str,
                      resource_type: str, resource_address: str, target_host: str) -> AnsiblePlaybook:
        """保存 Playbook 到文件"""
        playbook_id = uuid.uuid4().hex[:12]
        now = time.strftime("%Y-%m-%dT%H:%M:%S")
        record = AnsiblePlaybook(
            id=playbook_id,
            name=name,
            playbook_yaml=playbook_yaml,
            provider=provider,
            resource_type=resource_type,
            resource_address=resource_address,
            target_host=target_host,
            created_at=now,
            updated_at=now,
        )
        file_path = os.path.join(self._playbooks_dir, f"{playbook_id}.json")
        with open(file_path, "w") as f:
            f.write(record.model_dump_json(indent=2))
        return record

    def get_playbook(self, playbook_id: str) -> Optional[AnsiblePlaybook]:
        """获取单个 Playbook 记录"""
        file_path = os.path.join(self._playbooks_dir, f"{playbook_id}.json")
        if not os.path.exists(file_path):
            return None
        with open(file_path) as f:
            return AnsiblePlaybook(**json.load(f))

    def list_playbooks(self) -> list[AnsiblePlaybook]:
        """获取所有 Playbook 记录，按创建时间倒序"""
        playbooks = []
        if not os.path.exists(self._playbooks_dir):
            return playbooks
        for fname in sorted(os.listdir(self._playbooks_dir), reverse=True):
            if fname.endswith(".json"):
                with open(os.path.join(self._playbooks_dir, fname)) as f:
                    playbooks.append(AnsiblePlaybook(**json.load(f)))
        return playbooks

    def save_execution(self, playbook_id: str, playbook_name: str,
                       inventory_yaml: str, status: str,
                       logs: list[str], stats: dict) -> AnsibleExecution:
        """保存执行记录"""
        exec_id = uuid.uuid4().hex[:12]
        now = time.strftime("%Y-%m-%dT%H:%M:%S")
        record = AnsibleExecution(
            id=exec_id,
            playbook_id=playbook_id,
            playbook_name=playbook_name,
            inventory_yaml=inventory_yaml,
            status=status,
            logs=logs,
            stats=stats,
            started_at=now,
            completed_at=now,
        )
        file_path = os.path.join(self._executions_dir, f"{exec_id}.json")
        with open(file_path, "w") as f:
            f.write(record.model_dump_json(indent=2))
        return record

    def build_inventory(self, hosts: list[dict]) -> str:
        """生成 Ansible Inventory YAML

        Args:
            hosts: 主机列表，每项包含 host、name、group 等

        Returns:
            YAML 格式的 inventory
        """
        lines = ["all:"]
        groups: dict[str, list[dict]] = {}
        for host in hosts:
            group = host.get("group", "ungrouped")
            groups.setdefault(group, []).append(host)

        lines.append("  hosts:")
        for host in hosts:
            lines.append(f"    {host['name']}:")
            lines.append(f"      ansible_host: {host['host']}")
            if "port" in host:
                lines.append(f"      ansible_port: {host['port']}")

        lines.append("  children:")
        for group, group_hosts in groups.items():
            lines.append(f"    {group}:")
            lines.append("      hosts:")
            for h in group_hosts:
                lines.append(f"        {h['name']}:")
                lines.append(f"          ansible_host: {h['host']}")

        return "\n".join(lines) + "\n"