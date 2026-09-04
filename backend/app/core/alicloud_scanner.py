"""阿里云存量资源扫描器"""

from typing import Optional

from app.config import settings
from app.core.resource_scanner import ResourceScanner


class AlicloudScanner(ResourceScanner):
    """通过阿里云 OpenAPI 扫描存量资源"""

    SCANNABLE_TYPES = [
        "ecs", "rds", "slb", "oss", "vpc", "redis", "ack", "cdn", "nas",
    ]

    def __init__(self):
        self.access_key = settings.alicloud_access_key
        self.secret_key = settings.alicloud_secret_key
        self.region = settings.alicloud_region
        self._client = None

    @property
    def client(self):
        """懒加载阿里云 SDK 客户端"""
        if self._client is None:
            from aliyunsdkcore.client import AcsClient
            self._client = AcsClient(self.access_key, self.secret_key, self.region)
        return self._client

    def list_supported_types(self) -> list[str]:
        return self.SCANNABLE_TYPES

    def list_resources(self, resource_type: str) -> list[dict]:
        """扫描指定类型的存量资源"""
        method = f"_scan_{resource_type}"
        scanner = getattr(self, method, None)
        if not scanner:
            return []
        return scanner()

    # ── ECS 实例 ──

    def _scan_ecs(self) -> list[dict]:
        from aliyunsdkecs.request.v20140526 import DescribeInstancesRequest
        req = DescribeInstancesRequest.DescribeInstancesRequest()
        req.set_PageSize(100)
        return self._do_request(req, "Instances", "Instance", self._parse_ecs)

    def _parse_ecs(self, item: dict) -> dict:
        return {
            "id": item.get("InstanceId", ""),
            "name": item.get("InstanceName", item.get("InstanceId", "")),
            "type": "ecs",
            "region": self.region,
            "status": item.get("Status", ""),
            "instance_type": item.get("InstanceType", ""),
            "public_ip": item.get("PublicIpAddress", {}).get("IpAddress", [""])[0],
            "private_ip": item.get("VpcAttributes", {}).get("PrivateIpAddress", {}).get("IpAddress", [""])[0],
            "os_name": item.get("OSName", ""),
            "image_id": item.get("ImageId", ""),
            "created_at": item.get("CreationTime", ""),
        }

    # ── RDS 实例 ──

    def _scan_rds(self) -> list[dict]:
        from aliyunsdkrds.request.v20140815 import DescribeDBInstancesRequest
        req = DescribeDBInstancesRequest.DescribeDBInstancesRequest()
        req.set_PageSize(100)
        return self._do_request(req, "Items", "DBInstance", self._parse_rds)

    def _parse_rds(self, item: dict) -> dict:
        return {
            "id": item.get("DBInstanceId", ""),
            "name": item.get("DBInstanceDescription", item.get("DBInstanceId", "")),
            "type": "rds",
            "region": item.get("RegionId", ""),
            "status": item.get("DBInstanceStatus", ""),
            "engine": item.get("Engine", ""),
            "engine_version": item.get("EngineVersion", ""),
            "instance_type": item.get("DBInstanceClass", ""),
            "created_at": item.get("CreationTime", ""),
        }

    # ── SLB 负载均衡 ──

    def _scan_slb(self) -> list[dict]:
        from aliyunsdkslb.request.v20140515 import DescribeLoadBalancersRequest
        req = DescribeLoadBalancersRequest.DescribeLoadBalancersRequest()
        req.set_PageSize(100)
        return self._do_request(req, "LoadBalancers", "LoadBalancer", self._parse_slb)

    def _parse_slb(self, item: dict) -> dict:
        return {
            "id": item.get("LoadBalancerId", ""),
            "name": item.get("LoadBalancerName", item.get("LoadBalancerId", "")),
            "type": "slb",
            "region": item.get("RegionId", ""),
            "status": item.get("LoadBalancerStatus", ""),
            "address": item.get("Address", ""),
            "address_type": item.get("AddressType", ""),
            "created_at": item.get("CreateTime", ""),
        }

    # ── OSS Bucket ──

    def _scan_oss(self) -> list[dict]:
        import json
        from aliyunsdkcore.request import CommonRequest
        req = CommonRequest()
        req.set_accept_format("json")
        req.set_domain(f"oss-{self.region}.aliyuncs.com")
        req.set_method("GET")
        req.set_version("2019-05-17")
        req.set_action_name("ListBuckets")
        req.set_protocol_type("https")
        resp = self._do_common_request(req, "Buckets")
        if not resp:
            return []
        buckets = resp.get("Bucket", []) if isinstance(resp, dict) else []
        return [self._parse_oss(b) for b in buckets]

    def _parse_oss(self, item: dict) -> dict:
        return {
            "id": item.get("Name", ""),
            "name": item.get("Name", ""),
            "type": "oss",
            "region": item.get("Region", ""),
            "storage_class": item.get("StorageClass", ""),
            "created_at": item.get("CreationDate", ""),
        }

    # ── VPC ──

    def _scan_vpc(self) -> list[dict]:
        from aliyunsdkvpc.request.v20160428 import DescribeVpcsRequest
        req = DescribeVpcsRequest.DescribeVpcsRequest()
        req.set_PageSize(100)
        return self._do_request(req, "Vpcs", "Vpc", self._parse_vpc)

    def _parse_vpc(self, item: dict) -> dict:
        return {
            "id": item.get("VpcId", ""),
            "name": item.get("VpcName", item.get("VpcId", "")),
            "type": "vpc",
            "region": item.get("RegionId", ""),
            "status": item.get("Status", ""),
            "cidr_block": item.get("CidrBlock", ""),
            "created_at": item.get("CreationTime", ""),
        }

    # ── Redis ──

    def _scan_redis(self) -> list[dict]:
        from aliyunsdkredis.request.v20150101 import DescribeInstancesRequest
        req = DescribeInstancesRequest.DescribeInstancesRequest()
        req.set_PageSize(100)
        return self._do_request(req, "Instances", "KVStoreInstance", self._parse_redis)

    def _parse_redis(self, item: dict) -> dict:
        return {
            "id": item.get("InstanceId", ""),
            "name": item.get("InstanceName", item.get("InstanceId", "")),
            "type": "redis",
            "region": item.get("RegionId", ""),
            "status": item.get("InstanceStatus", ""),
            "instance_class": item.get("InstanceClass", ""),
            "engine_version": item.get("EngineVersion", ""),
            "created_at": item.get("CreateTime", ""),
        }

    # ── ACK 集群 ──

    def _scan_ack(self) -> list[dict]:
        from aliyunsdkcore.request import CommonRequest
        req = CommonRequest()
        req.set_accept_format("json")
        req.set_domain("cs.aliyuncs.com")
        req.set_method("GET")
        req.set_version("2015-12-15")
        req.set_action_name("DescribeClustersV1")
        req.set_protocol_type("https")
        resp = self._do_common_request(req, "clusters")
        if not resp:
            return []
        return [self._parse_ack(c) for c in resp]

    def _parse_ack(self, item: dict) -> dict:
        return {
            "id": item.get("cluster_id", ""),
            "name": item.get("name", item.get("cluster_id", "")),
            "type": "ack",
            "region": item.get("region_id", ""),
            "status": item.get("state", ""),
            "cluster_type": item.get("cluster_type", ""),
            "worker_number": item.get("size", 0),
            "created_at": item.get("created", ""),
        }

    # ── CDN ──

    def _scan_cdn(self) -> list[dict]:
        from aliyunsdkcdn.request.v20180510 import DescribeUserDomainsRequest
        req = DescribeUserDomainsRequest.DescribeUserDomainsRequest()
        req.set_PageSize(100)
        return self._do_request(req, "Domains", "PageData", self._parse_cdn)

    def _parse_cdn(self, item: dict) -> dict:
        return {
            "id": item.get("DomainName", ""),
            "name": item.get("DomainName", ""),
            "type": "cdn",
            "region": item.get("RegionId", ""),
            "status": item.get("DomainStatus", ""),
            "cdn_type": item.get("CdnType", ""),
            "created_at": item.get("CreateTime", ""),
        }

    # ── NAS ──

    def _scan_nas(self) -> list[dict]:
        from aliyunsdknas.request.v20170626 import DescribeFileSystemsRequest
        req = DescribeFileSystemsRequest.DescribeFileSystemsRequest()
        req.set_PageSize(100)
        return self._do_request(req, "FileSystems", "FileSystem", self._parse_nas)

    def _parse_nas(self, item: dict) -> dict:
        return {
            "id": item.get("FileSystemId", ""),
            "name": item.get("FileSystemId", ""),
            "type": "nas",
            "region": item.get("RegionId", ""),
            "status": item.get("Status", ""),
            "storage_type": item.get("StorageType", ""),
            "protocol_type": item.get("ProtocolType", ""),
            "created_at": item.get("CreateTime", ""),
        }

    # ── 通用请求封装 ──

    def _do_request(self, req, list_key: str, item_key: str, parser) -> list[dict]:
        """执行阿里云 SDK 请求并解析结果"""
        try:
            import json
            body = self.client.do_action_with_exception(req)
            data = json.loads(body)
            items = data.get(list_key, {})
            if isinstance(items, dict):
                items = items.get(item_key, [])
            if not isinstance(items, list):
                items = [items]
            return [parser(item) for item in items if item]
        except Exception as e:
            print(f"[WARN] 阿里云资源扫描失败 ({list_key}): {e}")
            return []

    def _do_common_request(self, req, data_key: str) -> Optional[list | dict]:
        """执行 CommonRequest 并返回指定字段"""
        try:
            import json
            body = self.client.do_action_with_exception(req)
            data = json.loads(body)
            return data.get(data_key, [])
        except Exception as e:
            print(f"[WARN] 阿里云资源扫描请求失败: {e}")
            return None