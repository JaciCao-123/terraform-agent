"""状态文件管理：从远程状态读取已创建资源列表"""

import base64
import hashlib
import hmac
import json
import os
import urllib.request
from datetime import datetime
from typing import Optional

from app.config import settings
from app.core.terraform_manager import TerraformManager


class StateManager:
    """管理 Terraform 状态文件和资源列表"""

    RESOURCE_TYPE_MAP = TerraformManager.RESOURCE_TYPE_MAP
    TERRAFORM_TO_RESOURCE_TYPE = {}
    for provider_map in RESOURCE_TYPE_MAP.values():
        TERRAFORM_TO_RESOURCE_TYPE.update({v: k for k, v in provider_map.items()})

    def get_resource_list(self, provider: str = "alicloud") -> list[dict]:
        """
        从远程状态获取已创建资源列表。

        Args:
            provider: 云平台 "alicloud" | "azure"
        """
        if provider == "alicloud":
            state = self._fetch_oss_state()
        elif provider == "azure":
            state = self._fetch_azure_state()
        else:
            return []

        if state:
            return self._parse_state_resources(state)

        # 兜底：尝试本地 terraform.tfstate
        local_state = self._read_local_state()
        if local_state:
            return self._parse_state_resources(local_state)

        return []

    def get_resource_detail(self, resource_address: str) -> Optional[dict]:
        """根据资源地址获取详细信息"""
        resources = self.get_resource_list()
        for r in resources:
            if r["address"] == resource_address:
                return r
        return None

    # ── OSS 远程状态读取（阿里云） ──────────────────────

    def _fetch_oss_state(self) -> Optional[dict]:
        """从阿里云 OSS 下载 terraform.tfstate 文件"""
        state_key = f"{settings.oss_state_prefix}terraform.tfstate"
        url = f"https://{settings.oss_bucket}.oss-{settings.alicloud_region}.aliyuncs.com/{state_key}"

        try:
            req = urllib.request.Request(url, method="GET")
            self._sign_oss_request(req, state_key)

            with urllib.request.urlopen(req, timeout=10) as resp:
                data = resp.read().decode("utf-8")
                return json.loads(data)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            print(f"[WARN] OSS 状态文件读取失败 (HTTP {e.code}): {e.reason}")
            return None
        except Exception as e:
            print(f"[WARN] OSS 状态文件读取异常: {e}")
            return None

    def _sign_oss_request(self, req: urllib.request.Request, resource_path: str):
        """为 OSS 请求添加 Authorization 签名头"""
        access_key = settings.alicloud_access_key
        secret_key = settings.alicloud_secret_key

        date_str = datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S GMT")
        req.add_header("Date", date_str)

        resource = f"/{settings.oss_bucket}/{resource_path}"
        string_to_sign = f"GET\n\n\n{date_str}\n{resource}"

        signature = base64.b64encode(
            hmac.new(secret_key.encode(), string_to_sign.encode(), hashlib.sha1).digest()
        ).decode()

        req.add_header("Authorization", f"OSS {access_key}:{signature}")

    # ── Azure Storage Blob 状态读取 ─────────────────────

    def _fetch_azure_state(self) -> Optional[dict]:
        """从 Azure Storage Blob 下载 terraform.tfstate 文件"""
        if not settings.azure_storage_account:
            print("[WARN] Azure Storage Account 未配置")
            return None

        account = settings.azure_storage_account
        container = settings.azure_storage_container
        blob_name = "terraform.tfstate"
        url = f"https://{account}.blob.core.windows.net/{container}/{blob_name}"

        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = resp.read().decode("utf-8")
                return json.loads(data)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            print(f"[WARN] Azure state 读取失败 (HTTP {e.code}): {e.reason}")
            return None
        except Exception as e:
            print(f"[WARN] Azure state 读取异常: {e}")
            return None

    # ── 本地状态文件读取（兜底） ─────────────────────────

    def _read_local_state(self) -> Optional[dict]:
        """读取本地的 terraform.tfstate 文件"""
        state_path = "terraform.tfstate"
        if os.path.exists(state_path):
            try:
                with open(state_path) as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                return None
        return None

    # ── 状态文件解析 ────────────────────────────────────

    def _parse_state_resources(self, state: dict) -> list[dict]:
        """解析 state 文件中的资源列表"""
        resources = []

        # 新版格式: state["resources"]
        try:
            for res in state.get("resources", []):
                res_type = res.get("type", "")
                res_name = res.get("name", "")
                res_address = f"{res_type}.{res_name}"
                if res_type in self.TERRAFORM_TO_RESOURCE_TYPE:
                    values = res.get("instances", [])
                    if values:
                        values = values[0]
                        if "attributes" in values:
                            values = values["attributes"]
                        resources.append(self._make_resource_entry(res_type, res_name, res_address, values, res.get("provider", "")))
        except (KeyError, TypeError, AttributeError):
            pass

        # 新版格式: state["values"]["root_module"]["resources"]
        try:
            root_module = state.get("values", {}).get("root_module", {})
            for res in root_module.get("resources", []):
                res_type = res.get("type", "")
                res_name = res.get("name", "")
                res_address = f"{res_type}.{res_name}"

                if res_type in self.TERRAFORM_TO_RESOURCE_TYPE:
                    values = res.get("values", {}) or {}
                    resources.append(self._make_resource_entry(res_type, res_name, res_address, values, res.get("provider", "")))
        except (KeyError, TypeError, AttributeError):
            pass

        # 处理子模块
        try:
            root_module = state.get("values", {}).get("root_module", {})
            for child in root_module.get("child_modules", []):
                resources.extend(self._parse_module_resources(child, ""))
        except (KeyError, TypeError, AttributeError):
            pass

        # 旧版格式兜底 (0.12-)
        if not resources:
            try:
                for module in state.get("modules", []):
                    for res_name, res_data in module.get("resources", {}).items():
                        res_type = res_data.get("type", "")
                        if res_type in self.TERRAFORM_TO_RESOURCE_TYPE:
                            res_id = res_data.get("primary", {}).get("id", res_name)
                            resources.append({
                                "id": res_id,
                                "type": self.TERRAFORM_TO_RESOURCE_TYPE[res_type],
                                "name": res_name.split(".")[-1] if "." in res_name else res_name,
                                "address": res_name,
                                "display_name": res_id,
                                "provider": res_data.get("provider", ""),
                            })
            except (KeyError, TypeError, AttributeError):
                pass

        # 去重
        seen = set()
        unique = []
        for r in resources:
            if r["address"] not in seen:
                seen.add(r["address"])
                unique.append(r)

        return unique

    def _parse_module_resources(self, module: dict, prefix: str) -> list[dict]:
        """解析单个模块中的资源"""
        result = []
        for res in module.get("resources", []):
            res_type = res.get("type", "")
            res_name = res.get("name", "")
            res_address = res.get("address", f"{res_type}.{res_name}")

            if res_type in self.TERRAFORM_TO_RESOURCE_TYPE:
                values = res.get("values", {}) or {}
                result.append(self._make_resource_entry(res_type, res_name, res_address, values, res.get("provider", "")))
        return result

    def _make_resource_entry(self, res_type: str, res_name: str, res_address: str, values: dict, provider: str) -> dict:
        """统一构建资源条目"""
        resource_id = values.get("id", res_address)
        if res_name in ("this", "main", "default") or res_name == res_type.split("_")[-1]:
            display_name = resource_id
        else:
            display_name = res_name
        return {
            "id": resource_id,
            "type": self.TERRAFORM_TO_RESOURCE_TYPE[res_type],
            "name": res_name,
            "display_name": display_name,
            "address": res_address,
            "provider": provider,
            "_detail": self._extract_resource_detail(res_type, values),
        }

    def _extract_resource_detail(self, res_type: str, values: dict) -> dict:
        """提取资源的核心信息用于前端展示"""
        detail = {}
        # 阿里云资源
        if res_type == "alicloud_instance":
            detail["instance_type"] = values.get("instance_type", "")
            detail["status"] = values.get("status", "")
        elif res_type == "alicloud_db_instance":
            detail["engine"] = values.get("engine", "")
            detail["engine_version"] = values.get("engine_version", "")
        elif res_type == "alicloud_slb":
            detail["address_type"] = values.get("address_type", "")
        elif res_type == "alicloud_oss_bucket":
            detail["storage_class"] = values.get("storage_class", "")
            detail["creation_date"] = values.get("creation_date", "")
        elif res_type == "alicloud_vpc":
            detail["cidr_block"] = values.get("cidr_block", "")
            detail["vpc_name"] = values.get("vpc_name", "")
        elif res_type == "alicloud_kvstore_instance":
            detail["instance_class"] = values.get("instance_class", "")
            detail["engine_version"] = values.get("engine_version", "")
        elif res_type == "alicloud_cs_managed_kubernetes":
            detail["worker_number"] = values.get("worker_number", "")
            detail["cluster_type"] = values.get("cluster_type", "")
        elif res_type == "alicloud_cdn_domain":
            detail["cdn_type"] = values.get("cdn_type", "")
            detail["cname"] = values.get("cname", "")
        elif res_type == "alicloud_nas_file_system":
            detail["file_system_type"] = values.get("file_system_type", "")
            detail["protocol_type"] = values.get("protocol_type", "")
        # Azure 资源
        elif res_type == "azurerm_resource_group":
            detail["location"] = values.get("location", "")
        elif res_type == "azurerm_virtual_network":
            detail["address_space"] = values.get("address_space", [])
        elif res_type == "azurerm_linux_virtual_machine":
            detail["size"] = values.get("size", "")
            detail["admin_username"] = values.get("admin_username", "")
        elif res_type == "azurerm_storage_account":
            detail["account_tier"] = values.get("account_tier", "")
            detail["account_replication_type"] = values.get("account_replication_type", "")
        elif res_type == "azurerm_mssql_database":
            detail["sku_name"] = values.get("sku_name", "")
        elif res_type == "azurerm_kubernetes_cluster":
            detail["node_count"] = values.get("node_count", "")
            detail["dns_prefix"] = values.get("dns_prefix", "")
        elif res_type == "azurerm_redis_cache":
            detail["sku_name"] = values.get("sku_name", "")
            detail["capacity"] = values.get("capacity", "")
        elif res_type == "azurerm_cdn_profile":
            detail["sku"] = values.get("sku", "")
        elif res_type == "azurerm_app_service":
            detail["location"] = values.get("location", "")
        return detail