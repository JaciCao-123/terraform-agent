"""资源管理 API：获取资源类型列表、已创建资源列表等"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.terraform_manager import TerraformManager
from app.core.state_manager import StateManager
from app.core.aliyun_client import AliyunClient

router = APIRouter(prefix="/api/resources", tags=["resources"])

_tf_manager: Optional[TerraformManager] = None
_state_manager: Optional[StateManager] = None
_aliyun_client: Optional[AliyunClient] = None


def get_tf_manager() -> TerraformManager:
    global _tf_manager
    if _tf_manager is None:
        _tf_manager = TerraformManager()
    return _tf_manager


def get_state_manager() -> StateManager:
    global _state_manager
    if _state_manager is None:
        _state_manager = StateManager()
    return _state_manager


def get_aliyun_client() -> AliyunClient:
    global _aliyun_client
    if _aliyun_client is None:
        _aliyun_client = AliyunClient()
    return _aliyun_client


class ResourceTypeList(BaseModel):
    resource_types: list[dict]


@router.get("/types", response_model=ResourceTypeList)
async def get_resource_types(provider: str = Query("alicloud", description="云平台: alicloud | azure")):
    """获取指定云平台的资源类型列表"""
    return ResourceTypeList(resource_types=get_tf_manager().get_resource_types(provider))


@router.get("/types/{resource_type}/schema")
async def get_resource_schema(
    resource_type: str,
    provider: str = Query("alicloud", description="云平台: alicloud | azure"),
):
    """获取指定资源类型的参数 Schema"""
    schema = get_tf_manager().get_resource_schema(resource_type, provider)
    if not schema:
        raise HTTPException(status_code=404, detail=f"不支持的资源类型: {resource_type} (provider: {provider})")
    return schema


@router.get("/instances")
async def get_resource_instances(provider: str = Query("alicloud", description="云平台: alicloud | azure")):
    """获取 Terraform 管理的资源实例列表"""
    state_manager = get_state_manager()
    instances = state_manager.get_resource_list(provider)
    return {"instances": instances}


@router.get("/instances/{resource_type}/{resource_id}/config")
async def get_resource_config(resource_type: str, resource_id: str):
    """获取指定资源的当前配置（用于回填表单）"""
    client = get_aliyun_client()
    if resource_type == "oss":
        config = client.get_oss_bucket_config(resource_id)
        if config:
            return config
    raise HTTPException(status_code=404, detail=f"未找到资源配置: {resource_type}/{resource_id}")