"""Azure 存量资源扫描器"""

from app.config import settings
from app.core.resource_scanner import ResourceScanner


class AzureScanner(ResourceScanner):
    """通过 Azure SDK 扫描存量资源"""

    SCANNABLE_TYPES = [
        "resource_group", "virtual_machine", "storage_account",
        "sql_database", "virtual_network", "aks", "redis_cache",
        "cdn_profile", "app_service",
    ]

    def __init__(self):
        self.subscription_id = settings.arm_subscription_id
        self._credential = None

    @property
    def credential(self):
        """懒加载 Azure 凭据"""
        if self._credential is None:
            from azure.identity import ClientSecretCredential
            self._credential = ClientSecretCredential(
                tenant_id=settings.arm_tenant_id,
                client_id=settings.arm_client_id,
                client_secret=settings.arm_client_secret,
            )
        return self._credential

    def list_supported_types(self) -> list[str]:
        return self.SCANNABLE_TYPES

    def list_resources(self, resource_type: str) -> list[dict]:
        """扫描指定类型的存量资源"""
        method = f"_scan_{resource_type}"
        scanner = getattr(self, method, None)
        if not scanner:
            return []
        return scanner()

    # ── 资源组 ──

    def _scan_resource_group(self) -> list[dict]:
        from azure.mgmt.resource import ResourceManagementClient
        client = ResourceManagementClient(self.credential, self.subscription_id)
        result = []
        for rg in client.resource_groups.list():
            result.append({
                "id": rg.name,
                "name": rg.name,
                "type": "resource_group",
                "region": rg.location,
                "status": "Active" if rg.properties.provisioning_state == "Succeeded" else rg.properties.provisioning_state,
            })
        return result

    # ── 虚拟机 ──

    def _scan_virtual_machine(self) -> list[dict]:
        from azure.mgmt.compute import ComputeManagementClient
        client = ComputeManagementClient(self.credential, self.subscription_id)
        result = []
        for vm in client.virtual_machines.list_all():
            result.append({
                "id": vm.id,
                "name": vm.name,
                "type": "virtual_machine",
                "region": vm.location,
                "status": vm.provisioning_state or "",
                "vm_size": vm.hardware_profile.vm_size if vm.hardware_profile else "",
                "os_type": vm.storage_profile.os_disk.os_type if vm.storage_profile and vm.storage_profile.os_disk else "",
                "resource_group": self._extract_rg(vm.id),
            })
        return result

    # ── 存储账户 ──

    def _scan_storage_account(self) -> list[dict]:
        from azure.mgmt.storage import StorageManagementClient
        client = StorageManagementClient(self.credential, self.subscription_id)
        result = []
        for sa in client.storage_accounts.list():
            result.append({
                "id": sa.id,
                "name": sa.name,
                "type": "storage_account",
                "region": sa.location,
                "status": sa.status_of_primary or "",
                "account_tier": sa.sku.tier.value if sa.sku else "",
                "replication_type": sa.sku.name.value if sa.sku else "",
                "resource_group": self._extract_rg(sa.id),
            })
        return result

    # ── SQL 数据库 ──

    def _scan_sql_database(self) -> list[dict]:
        from azure.mgmt.resource import ResourceManagementClient
        client = ResourceManagementClient(self.credential, self.subscription_id)
        # 列出所有 SQL Server 实例
        resources = client.resources.list(filter="resourceType eq 'Microsoft.Sql/servers'")
        result = []
        for server in resources:
            # 不使用扩展的 SQL 管理客户端，简化流程
            result.append({
                "id": server.id,
                "name": server.name,
                "type": "sql_database",
                "region": server.location,
                "resource_group": self._extract_rg(server.id),
            })
        return result

    # ── 虚拟网络 ──

    def _scan_virtual_network(self) -> list[dict]:
        from azure.mgmt.network import NetworkManagementClient
        client = NetworkManagementClient(self.credential, self.subscription_id)
        result = []
        for vnet in client.virtual_networks.list_all():
            result.append({
                "id": vnet.id,
                "name": vnet.name,
                "type": "virtual_network",
                "region": vnet.location,
                "address_space": list(vnet.address_space.address_prefixes) if vnet.address_space else [],
                "resource_group": self._extract_rg(vnet.id),
            })
        return result

    # ── AKS ──

    def _scan_aks(self) -> list[dict]:
        from azure.mgmt.containerservice import ContainerServiceClient
        client = ContainerServiceClient(self.credential, self.subscription_id)
        result = []
        for cluster in client.managed_clusters.list():
            result.append({
                "id": cluster.id,
                "name": cluster.name,
                "type": "aks",
                "region": cluster.location,
                "status": cluster.provisioning_state or "",
                "node_count": cluster.agent_pool_profiles[0].count if cluster.agent_pool_profiles else 0,
                "dns_prefix": cluster.dns_prefix or "",
                "resource_group": self._extract_rg(cluster.id),
            })
        return result

    # ── Redis 缓存 ──

    def _scan_redis_cache(self) -> list[dict]:
        from azure.mgmt.redis import RedisManagementClient
        client = RedisManagementClient(self.credential, self.subscription_id)
        result = []
        for redis in client.redis.list_by_subscription():
            result.append({
                "id": redis.id,
                "name": redis.name,
                "type": "redis_cache",
                "region": redis.location,
                "status": redis.provisioning_state or "",
                "sku_name": redis.sku.name if redis.sku else "",
                "capacity": redis.sku.capacity if redis.sku else 0,
                "resource_group": self._extract_rg(redis.id),
            })
        return result

    # ── CDN Profile ──

    def _scan_cdn_profile(self) -> list[dict]:
        from azure.mgmt.cdn import CdnManagementClient
        client = CdnManagementClient(self.credential, self.subscription_id)
        result = []
        for profile in client.profiles.list():
            result.append({
                "id": profile.id,
                "name": profile.name,
                "type": "cdn_profile",
                "region": profile.location,
                "sku": profile.sku.name.value if profile.sku else "",
                "resource_group": self._extract_rg(profile.id),
            })
        return result

    # ── App Service ──

    def _scan_app_service(self) -> list[dict]:
        from azure.mgmt.web import WebSiteManagementClient
        client = WebSiteManagementClient(self.credential, self.subscription_id)
        result = []
        for app in client.web_apps.list():
            result.append({
                "id": app.id,
                "name": app.name,
                "type": "app_service",
                "region": app.location,
                "kind": app.kind or "",
                "resource_group": self._extract_rg(app.id),
            })
        return result

    # ── 工具方法 ──

    @staticmethod
    def _extract_rg(resource_id: str) -> str:
        """从 Azure 资源 ID 中提取资源组名"""
        if not resource_id:
            return ""
        parts = resource_id.split("/")
        for i, part in enumerate(parts):
            if part.lower() == "resourcegroups" and i + 1 < len(parts):
                return parts[i + 1]
        return ""