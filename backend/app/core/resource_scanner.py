"""存量资源扫描接口：统一扫描云上已有资源"""

from abc import ABC, abstractmethod
from typing import Optional

from app.config import settings


class ResourceScanner(ABC):
    """存量资源扫描器抽象基类"""

    @abstractmethod
    def list_resources(self, resource_type: str) -> list[dict]:
        """
        扫描指定类型的存量资源列表。

        Returns:
            [{"id": str, "name": str, "type": str, "region": str, ...}]
        """
        ...

    @abstractmethod
    def list_supported_types(self) -> list[str]:
        """返回支持的资源类型列表"""
        ...


def get_scanner(provider: str) -> Optional[ResourceScanner]:
    """根据 provider 获取对应的扫描器实例"""
    if provider == "alicloud":
        from app.core.alicloud_scanner import AlicloudScanner
        return AlicloudScanner()
    elif provider == "azure":
        from app.core.azure_scanner import AzureScanner
        return AzureScanner()
    return None