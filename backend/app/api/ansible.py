"""Ansible API：生成、执行和管理 Ansible Playbook"""

import json
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.ansible_manager import AnsibleManager

router = APIRouter(prefix="/api/ansible", tags=["ansible"])

_ansible_manager: Optional[AnsibleManager] = None


def get_ansible_manager() -> AnsibleManager:
    global _ansible_manager
    if _ansible_manager is None:
        _ansible_manager = AnsibleManager()
    return _ansible_manager


class GeneratePlaybookRequest(BaseModel):
    resource_info: dict
    user_description: str
    provider: str = "alicloud"


class PlaybookResponse(BaseModel):
    playbook_yaml: str


@router.post("/generate", response_model=PlaybookResponse)
async def generate_playbook(req: GeneratePlaybookRequest):
    """调用 LLM 生成 Ansible Playbook"""
    try:
        playbook_yaml = await get_ansible_manager().generate_playbook(
            resource_info=req.resource_info,
            user_description=req.user_description,
            provider=req.provider,
        )
        return PlaybookResponse(playbook_yaml=playbook_yaml)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Playbook 生成失败: {str(e)}")


class ExecutePlaybookRequest(BaseModel):
    playbook_yaml: str
    inventory_yaml: str
    ssh_key_path: Optional[str] = None
    ssh_user: str = "root"


@router.post("/execute")
async def execute_playbook(req: ExecutePlaybookRequest):
    """执行 Ansible Playbook，SSE 流式返回日志"""
    if not req.playbook_yaml.strip():
        raise HTTPException(status_code=400, detail="Playbook 内容不能为空")

    manager = get_ansible_manager()

    async def _stream():
        try:
            async for line in manager.execute_with_retry(
                playbook_yaml=req.playbook_yaml,
                inventory_yaml=req.inventory_yaml,
                ssh_key_path=req.ssh_key_path,
                ssh_user=req.ssh_user,
            ):
                yield f"data: {json.dumps({'log': line})}\n\n"
            yield "data: {\"status\": \"completed\"}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


class FixPlaybookRequest(BaseModel):
    playbook_yaml: str
    error_log: str


@router.post("/fix", response_model=PlaybookResponse)
async def fix_playbook(req: FixPlaybookRequest):
    """修复 Ansible Playbook"""
    try:
        fixed = await get_ansible_manager().fix_playbook(
            req.playbook_yaml, req.error_log
        )
        return PlaybookResponse(playbook_yaml=fixed)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"修复失败: {str(e)}")


class SavePlaybookRequest(BaseModel):
    name: str
    playbook_yaml: str
    provider: str
    resource_type: str
    resource_address: str
    target_host: str


@router.post("/playbooks")
async def save_playbook(req: SavePlaybookRequest):
    """保存 Playbook 记录"""
    try:
        record = get_ansible_manager().save_playbook(
            name=req.name,
            playbook_yaml=req.playbook_yaml,
            provider=req.provider,
            resource_type=req.resource_type,
            resource_address=req.resource_address,
            target_host=req.target_host,
        )
        return {"id": record.id, "name": record.name, "created_at": record.created_at}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")


@router.get("/playbooks")
async def list_playbooks():
    """获取历史 Playbook 列表"""
    playbooks = get_ansible_manager().list_playbooks()
    return {
        "playbooks": [
            {
                "id": p.id,
                "name": p.name,
                "provider": p.provider,
                "resource_type": p.resource_type,
                "resource_address": p.resource_address,
                "target_host": p.target_host,
                "created_at": p.created_at,
            }
            for p in playbooks
        ]
    }


@router.get("/playbooks/{playbook_id}")
async def get_playbook(playbook_id: str):
    """获取单个 Playbook 详情"""
    playbook = get_ansible_manager().get_playbook(playbook_id)
    if not playbook:
        raise HTTPException(status_code=404, detail="Playbook 不存在")
    return {
        "id": playbook.id,
        "name": playbook.name,
        "playbook_yaml": playbook.playbook_yaml,
        "provider": playbook.provider,
        "resource_type": playbook.resource_type,
        "resource_address": playbook.resource_address,
        "target_host": playbook.target_host,
        "created_at": playbook.created_at,
    }


class BuildInventoryRequest(BaseModel):
    hosts: list[dict]


@router.post("/build-inventory")
async def build_inventory(req: BuildInventoryRequest):
    """生成 Ansible Inventory YAML"""
    inventory_yaml = get_ansible_manager().build_inventory(req.hosts)
    return {"inventory_yaml": inventory_yaml}