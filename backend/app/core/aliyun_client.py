"""阿里云 OpenAPI 客户端：直接从云上拉取资源列表"""

import base64
import hashlib
import hmac
import json
import time
import urllib.parse
import urllib.request
from typing import Optional, Any
from datetime import datetime

from app.config import settings


class AliyunClient:
    """调用阿里云 OpenAPI 获取云上资源"""

    # 各产品的 API 信息
    PRODUCTS = {
        "ecs": {
            "host": "ecs.aliyuncs.com",
            "api_version": "2014-05-26",
            "action": "DescribeInstances",
            "result_key": "Instances.Instance",
            "id_field": "InstanceId",
            "name_field": "InstanceName",
            "detail_fields": {
                "instance_type": "InstanceType",
                "status": "Status",
            },
        },
        "rds": {
            "host": "rds.aliyuncs.com",
            "api_version": "2014-08-15",
            "action": "DescribeDBInstances",
            "result_key": "Items.DBInstance",
            "id_field": "DBInstanceId",
            "name_field": "DBInstanceDescription",
            "detail_fields": {
                "engine": "Engine",
                "engine_version": "EngineVersion",
            },
        },
        "slb": {
            "host": "slb.aliyuncs.com",
            "api_version": "2014-05-15",
            "action": "DescribeLoadBalancers",
            "result_key": "LoadBalancers.LoadBalancer",
            "id_field": "LoadBalancerId",
            "name_field": "LoadBalancerName",
            "detail_fields": {
                "address_type": "AddressType",
            },
        },
    }

    def __init__(self):
        self.access_key = settings.alicloud_access_key
        self.secret_key = settings.alicloud_secret_key
        self.region = settings.alicloud_region

    def list_oss_buckets(self) -> list[dict]:
        """通过 OSS REST API 列出所有 OSS Bucket"""
        date = datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S GMT")
        host = f"oss-{self.region}.aliyuncs.com"

        # OSS 的 GET Bucket (list) 请求
        resource = "/"
        string_to_sign = f"GET\n\n\n{date}\n{resource}"
        signature = base64.b64encode(
            hmac.new(self.secret_key.encode(), string_to_sign.encode(), hashlib.sha1).digest()
        ).decode()

        req = urllib.request.Request(
            f"https://{host}/",
            method="GET",
            headers={
                "Date": date,
                "Authorization": f"OSS {self.access_key}:{signature}",
            },
        )

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                import xml.etree.ElementTree as ET

                body = resp.read().decode()
                root = ET.fromstring(body)
                buckets = []
                for bucket_elem in root.iter("Bucket"):
                    name = bucket_elem.find("Name")
                    loc = bucket_elem.find("Location")
                    create = bucket_elem.find("CreationDate")
                    bucket_name = name.text if name is not None else ""
                    buckets.append({
                        "id": bucket_name,
                        "type": "oss",
                        "name": bucket_name,
                        "address": f"alicloud_oss_bucket.{bucket_name}",
                        "provider": "aliyun",
                        "_detail": {
                            "location": loc.text if loc is not None else "",
                            "creation_date": create.text if create is not None else "",
                        },
                    })
                return buckets
        except Exception as e:
            print(f"[WARN] OSS 列表查询失败: {e}")
            return []

    def get_oss_bucket_config(self, bucket_name: str) -> Optional[dict]:
        """获取单个 OSS Bucket 的详细配置（ACL、存储类型等）"""
        import xml.etree.ElementTree as ET

        # 获取 Bucket ACL
        date = datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S GMT")
        host = f"{bucket_name}.oss-{self.region}.aliyuncs.com"

        # 1. 获取 ACL
        resource = f"/{bucket_name}/?acl"
        string_to_sign = f"GET\n\n\n{date}\n/{bucket_name}/?acl"
        signature = base64.b64encode(
            hmac.new(self.secret_key.encode(), string_to_sign.encode(), hashlib.sha1).digest()
        ).decode()

        acl = "private"
        try:
            req = urllib.request.Request(
                f"https://{host}/?acl",
                method="GET",
                headers={"Date": date, "Authorization": f"OSS {self.access_key}:{signature}"},
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = resp.read().decode()
                root = ET.fromstring(body)
                grant_elem = root.find(".//{http://doc.oss-cn-hangzhou.aliyuncs.com}Grant")
                if grant_elem is not None:
                    acl_text = grant_elem.text or ""
                    if "FULL_CONTROL" in acl_text:
                        # 需要进一步判断，这里简化处理
                        pass
                    # 从 AccessControlList 获取
                    acl_root = root.find("{http://doc.oss-cn-hangzhou.aliyuncs.com}AccessControlList")
                    if acl_root is not None:
                        grant = acl_root.find("{http://doc.oss-cn-hangzhou.aliyuncs.com}Grant")
                        if grant is not None:
                            acl = grant.text or "private"
        except Exception:
            pass

        # 2. 获取 Bucket 信息（存储类型从之前的列表已有）
        return {
            "bucket": bucket_name,
            "acl": acl,
            "storage_class": "Standard",  # 默认值，后续可以从 OSS 更多 API 获取
        }

    def list_ecs_instances(self) -> list[dict]:
        """通过 ECS OpenAPI 列出所有 ECS 实例"""
        return self._call_openapi("ecs")

    def list_rds_instances(self) -> list[dict]:
        """通过 RDS OpenAPI 列出所有 RDS 实例"""
        return self._call_openapi("rds")

    def list_slb_instances(self) -> list[dict]:
        """通过 SLB OpenAPI 列出所有 SLB 实例"""
        return self._call_openapi("slb")

    def list_all(self) -> list[dict]:
        """列出所有支持的云上资源"""
        resources = []
        resources.extend(self.list_oss_buckets())
        resources.extend(self.list_ecs_instances())
        resources.extend(self.list_rds_instances())
        resources.extend(self.list_slb_instances())
        return resources

    def _call_openapi(self, product: str) -> list[dict]:
        """调用阿里云 OpenAPI"""
        info = self.PRODUCTS.get(product)
        if not info:
            return []

        params = self._build_openapi_params(info)
        url = f"https://{info['host']}/?{urllib.parse.urlencode(sorted(params.items()))}"

        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = resp.read().decode()
                return self._parse_openapi_response(body, info)
        except Exception as e:
            print(f"[WARN] {product.upper()} API 查询失败: {e}")
            return []

    def _build_openapi_params(self, info: dict) -> dict[str, str]:
        """构建 OpenAPI 请求参数并签名"""
        params = {
            "Action": info["action"],
            "Format": "JSON",
            "Version": info["api_version"],
            "AccessKeyId": self.access_key,
            "SignatureMethod": "HMAC-SHA1",
            "Timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "SignatureVersion": "1.0",
            "SignatureNonce": str(int(time.time() * 1000)) + str(hash(str(info))),
            "RegionId": self.region,
        }

        # 排序并构建待签名字符串
        sorted_params = sorted(params.items(), key=lambda x: x[0].lower())
        canonicalized = "&".join(
            f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(str(v), safe='')}"
            for k, v in sorted_params
        )

        string_to_sign = f"GET&{urllib.parse.quote('/', safe='')}&{urllib.parse.quote(canonicalized, safe='')}"
        signature = base64.b64encode(
            hmac.new(
                f"{self.secret_key}&".encode(),
                string_to_sign.encode(),
                hashlib.sha1,
            ).digest()
        ).decode()

        params["Signature"] = signature
        return params

    def _parse_openapi_response(self, body: str, info: dict) -> list[dict]:
        """解析 OpenAPI 返回的 JSON"""
        try:
            data = json.loads(body)
            # 按 key 路径查找结果列表
            result = data
            for key in info["result_key"].split("."):
                if isinstance(result, dict):
                    result = result.get(key, [])
                else:
                    return []

            if not isinstance(result, list):
                result = [result]

            resources = []
            for item in result:
                res_id = item.get(info["id_field"], "")
                res_name = item.get(info["name_field"], res_id)
                detail = {}
                for k, v in info.get("detail_fields", {}).items():
                    val = item.get(v)
                    if val:
                        detail[k] = val

                resources.append({
                    "id": res_id,
                    "type": info["action"].replace("Describe", "").replace("s", "").lower(),
                    "name": res_name,
                    "address": res_id,
                    "provider": "aliyun",
                    "_detail": detail,
                })
            return resources
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            print(f"[WARN] 解析 OpenAPI 响应失败: {e}")
            return []