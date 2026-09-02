"""Terraform 执行 API：通过 SSE 实时推送执行日志"""

import json
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.terraform_manager import TerraformManager

router = APIRouter(prefix="/api/execute", tags=["execute"])

_tf_manager: Optional[TerraformManager] = None


def get_tf_manager() -> TerraformManager:
    global _tf_manager
    if _tf_manager is None:
        _tf_manager = TerraformManager()
    return _tf_manager


class PlanRequest(BaseModel):
    tf_content: str
    resource_type: str


class ApplyRequest(BaseModel):
    tf_content: str
    resource_type: str
    plan_result: str = ""


class DestroyPlanRequest(BaseModel):
    resource_address: str


class DestroyApplyRequest(BaseModel):
    resource_address: str


async def _stream_generator(async_gen):
    """将异步生成器转换为 SSE 流"""
    try:
        async for line in async_gen:
            yield f"data: {json.dumps({'log': line})}\n\n"
        yield "data: {\"status\": \"completed\"}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'status': 'error', 'error': str(e)})}\n\n"


async def _stream_generator_with_fix(tf_manager, async_gen):
    """将异步生成器转换为 SSE 流，自动修复完成后发送修复后的代码"""
    try:
        async for line in async_gen:
            yield f"data: {json.dumps({'log': line})}\n\n"
        # 如果有自动修复后的代码，发送给前端
        if tf_manager._latest_fixed_tf is not None:
            yield f"data: {json.dumps({{'fixed_tf': tf_manager._latest_fixed_tf}})}\n\n"
        yield "data: {\"status\": \"completed\"}\n\n"
        # 清理
        tf_manager._latest_fixed_tf = None
    except Exception as e:
        yield f"data: {json.dumps({'status': 'error', 'error': str(e)})}\n\n"


@router.post("/plan")
async def execute_plan(req: PlanRequest):
    """执行 terraform plan，SSE 流式返回日志"""
    if not req.tf_content.strip():
        raise HTTPException(status_code=400, detail="Terraform 配置不能为空")

    tf_manager = get_tf_manager()

    return StreamingResponse(
        _stream_generator_with_fix(tf_manager, tf_manager.plan(req.tf_content, req.resource_type)),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/apply")
async def execute_apply(req: ApplyRequest):
    """执行 terraform apply，SSE 流式返回日志"""
    if not req.tf_content.strip():
        raise HTTPException(status_code=400, detail="Terraform 配置不能为空")

    return StreamingResponse(
        _stream_generator(get_tf_manager().apply(req.tf_content)),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/plan-destroy")
async def execute_plan_destroy(req: DestroyPlanRequest):
    """执行 terraform plan -destroy，SSE 流式返回日志"""
    return StreamingResponse(
        _stream_generator(get_tf_manager().plan_destroy(req.resource_address)),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/destroy")
async def execute_destroy(req: DestroyApplyRequest):
    """执行 terraform destroy，SSE 流式返回日志"""
    return StreamingResponse(
        _stream_generator(get_tf_manager().destroy(req.resource_address)),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )