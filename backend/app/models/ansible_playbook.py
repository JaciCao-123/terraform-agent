"""Ansible Playbook 模型"""

from pydantic import BaseModel
from typing import Optional


class AnsiblePlaybook(BaseModel):
    """Playbook 记录"""
    id: str
    name: str
    playbook_yaml: str
    provider: str  # "alicloud" | "azure"
    resource_type: str
    resource_address: str
    target_host: str  # 目标机器 IP 或主机名
    created_at: str
    updated_at: str