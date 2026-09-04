"""存量资源导入 API：扫描云上资源并导入到 Terraform state"""

import json
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.resource_scanner import get_scanner
from app.core.terraform_manager import TerraformManager

router = APIRouter(prefix="/api/import", tags=["import"])

_terraform_manager: Optional[TerraformManager] = None


def get_terraform_manager() -> TerraformManager:
    global _terraform_manager
    if _terraform_manager is None:
        _terraform_manager = TerraformManager()
    return _terraform_manager


@router.get("/scan")
async def scan_resources(
    provider: str = Query("alicloud", description="云平台"),
    resource_type: str = Query(..., description="资源类型"),
):
    """扫描云上指定类型的存量资源列表"""
    scanner = get_scanner(provider)
    if not scanner:
        raise HTTPException(status_code=400, detail=f"不支持的云平台: {provider}")

    if resource_type and resource_type not in scanner.list_supported_types():
        raise HTTPException(
            status_code=400,
            detail=f"不支持的资源类型: {resource_type}，支持的类型: {scanner.list_supported_types()}",
        )

    try:
        resources = scanner.list_resources(resource_type)
        return {
            "provider": provider,
            "resource_type": resource_type,
            "total": len(resources),
            "resources": resources,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"扫描失败: {str(e)}")


@router.get("/supported-types")
async def get_supported_types(
    provider: str = Query("alicloud", description="云平台"),
):
    """获取指定云平台支持的资源类型列表"""
    scanner = get_scanner(provider)
    if not scanner:
        raise HTTPException(status_code=400, detail=f"不支持的云平台: {provider}")
    return {
        "provider": provider,
        "supported_types": scanner.list_supported_types(),
    }


class ImportRequest(BaseModel):
    provider: str = "alicloud"
    resources: list[dict]


@router.post("/execute")
async def execute_import(req: ImportRequest):
    """批量导入存量资源到 Terraform state，SSE 流式返回进度"""
    if not req.resources:
        raise HTTPException(status_code=400, detail="资源列表不能为空")

    manager = get_terraform_manager()

    async def _stream():
        try:
            async for line in manager.import_resources(
                resources=req.resources,
                provider=req.provider,
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