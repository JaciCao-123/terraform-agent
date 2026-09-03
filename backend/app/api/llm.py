"""LLM 生成 API：调用 LLM 生成 Terraform 配置文件"""

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.terraform_manager import TerraformManager

router = APIRouter(prefix="/api/llm", tags=["llm"])

_tf_manager: Optional[TerraformManager] = None


def get_tf_manager() -> TerraformManager:
    global _tf_manager
    if _tf_manager is None:
        _tf_manager = TerraformManager()
    return _tf_manager


class GenerateRequest(BaseModel):
    resource_type: str
    params: dict
    provider: str = "alicloud"
    user_description: Optional[str] = None


class GenerateResponse(BaseModel):
    tf_content: str


@router.post("/generate", response_model=GenerateResponse)
async def generate_tf(req: GenerateRequest):
    """调用 LLM 生成 Terraform 配置"""
    try:
        tf_content = await get_tf_manager().generate_tf(req.resource_type, req.params, req.provider, req.user_description)
        return GenerateResponse(tf_content=tf_content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM 生成失败: {str(e)}")


class GenerateDestroyRequest(BaseModel):
    resource_address: str
    provider: str = "alicloud"
    user_description: Optional[str] = None


@router.post("/generate-destroy", response_model=GenerateResponse)
async def generate_destroy_tf(req: GenerateDestroyRequest):
    """生成销毁指定资源的 Terraform 配置"""
    try:
        tf_content = await get_tf_manager().generate_destroy_tf(req.resource_address, req.provider, req.user_description)
        return GenerateResponse(tf_content=tf_content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成失败: {str(e)}")


class GenerateUpdateRequest(BaseModel):
    resource_type: str
    resource_address: str
    params: dict
    provider: str = "alicloud"
    user_description: Optional[str] = None


@router.post("/generate-update", response_model=GenerateResponse)
async def generate_update_tf(req: GenerateUpdateRequest):
    """生成更新已有资源的 Terraform 配置"""
    try:
        tf_content = await get_tf_manager().generate_update_tf(
            req.resource_type, req.resource_address, req.params, req.provider, req.user_description
        )
        return GenerateResponse(tf_content=tf_content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成更新配置失败: {str(e)}")


class FixRequest(BaseModel):
    tf_content: str
    error_log: str


class FixResponse(BaseModel):
    tf_content: str


@router.post("/fix", response_model=FixResponse)
async def fix_tf(req: FixRequest):
    """修复 Terraform 配置"""
    try:
        fixed = await get_tf_manager().fix_tf(req.tf_content, req.error_log)
        return FixResponse(tf_content=fixed)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"修复失败: {str(e)}")


class AnalyzeErrorRequest(BaseModel):
    error_log: str
    action: str


class AnalyzeErrorResponse(BaseModel):
    analysis: str


@router.post("/analyze-error", response_model=AnalyzeErrorResponse)
async def analyze_error(req: AnalyzeErrorRequest):
    """分析 Terraform 执行错误"""
    try:
        analysis = await get_tf_manager().analyze_error(req.error_log, req.action)
        return AnalyzeErrorResponse(analysis=analysis)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析失败: {str(e)}")