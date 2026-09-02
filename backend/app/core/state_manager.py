"""状态文件管理：从 OSS 远程状态读取已创建资源列表"""

import base64
import hashlib
import hmac
import json
import os
import tempfile
import urllib.request
from datetime import datetime
from typing import Optional

from app.config import settings
from app.core.terraform_manager import TerraformManager

class StateManager:
    """管理 Terraform 状态文件和资源列表"""

    RESOURCE_TYPE_MAP = TerraformManager.RESOURCE_TYPE_MAP
    TERRAFORM_TO_RESOURCE_TYPE = {v: k for k, v in RESOURCE_TYPE_MAP.items()}

    def get_resource_list(self) -> list[dict]:
        """
        从 OSS 远程状态获取已创建资源列表。

        返回格式:
        [
            {
                "id": "i-xxx",
                "type": "ecs",
                "name": "my-instance",
                "address": "alicloud_instance.my-instance",
                "provider": "provider[\"registry.terraform.io/hashicorp/alicloud\"]"
            },
            ...
        ]
        """
        state = self._fetch_remote_state()
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

    # ── OSS 远程状态读取 ──────────────────────────────────

    def _fetch_remote_state(self) -> Optional[dict]:
        """从 OSS 下载 terraform.tfstate 文件"""
        # OSS 后端默认路径: {prefix}terraform.tfstate（默认 workspace 无子目录）
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
                # 状态文件还不存在（首次使用）
                return None
            print(f"[WARN] OSS 状态文件读取失败 (HTTP {e.code}): {e.reason}")
            return None
        except Exception as e:
            print(f"[WARN] OSS 状态文件读取异常: {e}")
            return None

    def _sign_oss_request(self, req: urllib.request.Request, resource_path: str):
        """为 OSS 请求添加 Authorization 签名头

        OSS 认证方式: Authorization = "OSS " + AccessKeyId + ":" + Signature
        Signature = base64(hmac-sha1(AccessKeySecret, VERB + "\n\n\n" + Date + "\n" + "/" + Bucket + "/" + ObjectKey))
        """
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

    # ── 本地状态文件读取（兜底） ────────────────────────────

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

    # ── 状态文件解析 ──────────────────────────────────────

    def _parse_state_resources(self, state: dict) -> list[dict]:
        """解析 state 文件中的资源列表

        支持 terraform 0.12+ 格式 (values.root_module.resources)
        和新版格式 (resources[])
        和 0.12- 格式 (modules.resources)
        """
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
                        resources.append({
                            "id": values.get("id", res_address),
                            "type": self.TERRAFORM_TO_RESOURCE_TYPE[res_type],
                            "name": res_name,
                            "address": res_address,
                            "provider": res.get("provider", ""),
                            "_detail": self._extract_resource_detail(res_type, values),
                        })
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
                    # 获取资源 ID 和更多信息
                    values = res.get("values", {}) or {}
                    resources.append({
                        "id": values.get("id", res_address),
                        "type": self.TERRAFORM_TO_RESOURCE_TYPE[res_type],
                        "name": res_name,
                        "address": res_address,
                        "provider": res.get("provider", ""),
                        "_detail": self._extract_resource_detail(res_type, values),
                    })
        except (KeyError, TypeError, AttributeError):
            pass

        # 处理子模块 (child_modules)
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
                            resources.append({
                                "id": res_data.get("primary", {}).get("id", res_name),
                                "type": self.TERRAFORM_TO_RESOURCE_TYPE[res_type],
                                "name": res_name.split(".")[-1] if "." in res_name else res_name,
                                "address": res_name,
                                "provider": res_data.get("provider", ""),
                            })
            except (KeyError, TypeError, AttributeError):
                pass

        # 去重（同一个地址只保留一个）
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
                # 获取资源 ID 和更多信息
                values = res.get("values", {}) or {}
                result.append({
                    "id": values.get("id", res_address),
                    "type": self.TERRAFORM_TO_RESOURCE_TYPE[res_type],
                    "name": res_name,
                    "address": res_address,
                    "provider": res.get("provider", ""),
                    # 额外信息用于前端展示
                    "_detail": self._extract_resource_detail(res_type, values),
                })
        return result

    def _extract_resource_detail(self, res_type: str, values: dict) -> dict:
        """提取资源的核心信息用于前端展示"""
        detail = {}
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
        return detail