"""操作日志模型"""

from pydantic import BaseModel
from typing import Optional


class OperationLog(BaseModel):
    """操作日志记录"""
    timestamp: str
    operation_type: str  # "create" | "destroy"
    resource_type: str  # "ecs" | "rds" | "slb" | "oss"
    resource_params: dict
    tf_content: str
    plan_result: str
    apply_result: str
    status: str  # "success" | "failed" | "cancelled"
    error_message: Optional[str] = None