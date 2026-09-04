"""Ansible 执行记录模型"""

from pydantic import BaseModel
from typing import Optional


class AnsibleExecution(BaseModel):
    """Ansible 执行记录"""
    id: str
    playbook_id: str
    playbook_name: str
    inventory_yaml: str
    status: str  # "running" | "success" | "failed"
    logs: list[str]
    stats: dict  # {"ok": 0, "changed": 0, "unreachable": 0, "failed": 0}
    started_at: str
    completed_at: Optional[str] = None