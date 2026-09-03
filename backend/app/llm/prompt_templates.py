"""Prompt 模板：生成 Terraform 配置文件"""

from typing import Optional


# Few-shot 示例：按 provider 分组
FEW_SHOT_EXAMPLES = {
    "alicloud": {
        "oss": """## 示例：创建 OSS Bucket

resource "alicloud_oss_bucket" "this" {
  bucket        = "my-app-data-store"
  storage_class = "Standard"
}

resource "alicloud_oss_bucket_acl" "this" {
  bucket = alicloud_oss_bucket.this.id
  acl    = "private"
}

output "bucket_name" {
  value = alicloud_oss_bucket.this.bucket
}

output "bucket_endpoint" {
  value = alicloud_oss_bucket.this.extranet_endpoint
}""",
        "ecs": """## 示例：创建 ECS 实例

resource "alicloud_instance" "this" {
  instance_name              = "web-server-01"
  instance_type              = "ecs.g6.large"
  image_id                   = "aliyun_2_1903_x64_20G_alibase_2024"
  system_disk_size           = 40
  internet_charge_type       = "PayByTraffic"
  internet_max_bandwidth_out = 5
  password                   = "MyPass123!"
  count                      = 1
}

output "ecs_public_ip" {
  value = alicloud_instance.this.public_ip
}""",
        "rds": """## 示例：创建 RDS 数据库

resource "alicloud_db_instance" "this" {
  instance_name        = "my-app-database"
  engine               = "MySQL"
  engine_version       = "8.0"
  instance_type        = "rds.mysql.t3.small"
  db_instance_storage  = 20
  account_name         = "db_user"
  account_password     = "SecurePass1!"
}

output "rds_connection_string" {
  value = alicloud_db_instance.this.connection_string
}""",
        "slb": """## 示例：创建负载均衡 SLB

resource "alicloud_slb_load_balancer" "this" {
  load_balancer_name   = "my-app-slb"
  address_type         = "internet"
  load_balancer_spec   = "slb.s1.small"
  bandwidth            = 5
}

output "slb_address" {
  value = alicloud_slb_load_balancer.this.address
}""",
        "vpc": """## 示例：创建专有网络 VPC

resource "alicloud_vpc" "this" {
  vpc_name   = "my-vpc"
  cidr_block = "172.16.0.0/12"
}

output "vpc_id" {
  value = alicloud_vpc.this.id
}""",
        "redis": """## 示例：创建 Redis 实例

resource "alicloud_kvstore_instance" "this" {
  instance_name  = "my-redis-cache"
  instance_class = "redis.master.small.default"
  engine_version = "5.0"
  instance_type  = "Redis"
}

output "redis_connection_domain" {
  value = alicloud_kvstore_instance.this.connection_domain
}""",
        "ack": """## 示例：创建 ACK 集群

resource "alicloud_cs_managed_kubernetes" "this" {
  name                 = "my-ack-cluster"
  worker_number        = 2
  worker_instance_type = "ecs.g7.xlarge"
  worker_vswitch_ids   = ["vsw-xxx"]
}""",
        "cdn": """## 示例：创建 CDN 加速域名

resource "alicloud_cdn_domain" "this" {
  domain_name = "cdn.example.com"
  cdn_type    = "web"
  sources     = "origin.example.com"
  source_type = "domain"
}

output "cdn_cname" {
  value = alicloud_cdn_domain.this.cname
}""",
        "nas": """## 示例：创建文件存储 NAS

resource "alicloud_nas_file_system" "this" {
  file_system_type = "standard"
  storage_type     = "Performance"
  protocol_type    = "NFS"
}

output "nas_id" {
  value = alicloud_nas_file_system.this.id
}""",
    },
    "azure": {
        "resource_group": """## 示例：创建资源组

resource "azurerm_resource_group" "this" {
  name     = "my-resource-group"
  location = "eastasia"
}

output "rg_id" {
  value = azurerm_resource_group.this.id
}""",
        "virtual_network": """## 示例：创建虚拟网络

resource "azurerm_virtual_network" "this" {
  name                = "my-vnet"
  resource_group_name = "my-resource-group"
  location            = "eastasia"
  address_space       = ["10.0.0.0/16"]
}

output "vnet_id" {
  value = azurerm_virtual_network.this.id
}""",
        "virtual_machine": """## 示例：创建虚拟机

resource "azurerm_linux_virtual_machine" "this" {
  name                = "my-vm"
  resource_group_name = "my-resource-group"
  location            = "eastasia"
  size                = "Standard_B2s"
  admin_username      = "azureuser"
  admin_password      = "MyP@ssw0rd123!"

  network_interface_ids = [azurerm_network_interface.this.id]

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts"
    version   = "latest"
  }
}""",
        "storage_account": """## 示例：创建存储账户

resource "azurerm_storage_account" "this" {
  name                     = "mystorageaccount"
  resource_group_name      = "my-resource-group"
  location                 = "eastasia"
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

output "storage_primary_endpoint" {
  value = azurerm_storage_account.this.primary_blob_endpoint
}""",
        "sql_database": """## 示例：创建 SQL 数据库

resource "azurerm_mssql_database" "this" {
  name         = "my-database"
  server_name  = "my-sql-server"
  resource_group_name = "my-resource-group"
  sku_name     = "S0"
}

output "db_id" {
  value = azurerm_mssql_database.this.id
}""",
        "aks": """## 示例：创建 AKS 集群

resource "azurerm_kubernetes_cluster" "this" {
  name                = "my-aks-cluster"
  resource_group_name = "my-resource-group"
  location            = "eastasia"
  dns_prefix          = "myaks"

  default_node_pool {
    name       = "default"
    node_count = 2
    vm_size    = "Standard_D2s_v3"
  }

  identity {
    type = "SystemAssigned"
  }
}

output "aks_kube_config" {
  value = azurerm_kubernetes_cluster.this.kube_config_raw
  sensitive = true
}""",
        "redis_cache": """## 示例：创建 Redis 缓存

resource "azurerm_redis_cache" "this" {
  name                = "my-redis-cache"
  resource_group_name = "my-resource-group"
  location            = "eastasia"
  capacity            = 1
  family              = "C"
  sku_name            = "Standard"
}

output "redis_hostname" {
  value = azurerm_redis_cache.this.hostname
}""",
        "cdn_profile": """## 示例：创建 CDN Profile

resource "azurerm_cdn_profile" "this" {
  name                = "my-cdn-profile"
  resource_group_name = "my-resource-group"
  location            = "eastasia"
  sku                 = "Standard_Microsoft"
}

output "cdn_profile_id" {
  value = azurerm_cdn_profile.this.id
}""",
        "app_service": """## 示例：创建 App Service

resource "azurerm_app_service" "this" {
  name                = "my-app-service"
  resource_group_name = "my-resource-group"
  location            = "eastasia"
  app_service_plan_id = azurerm_app_service_plan.this.id
}

output "app_service_default_site_hostname" {
  value = azurerm_app_service.this.default_site_hostname
}""",
    },
}

# 销毁操作的 few-shot 示例
DESTROY_EXAMPLES = {
    "alicloud": {
        "oss": """## 示例：销毁 OSS Bucket（同时删除关联的 ACL）

resource "alicloud_oss_bucket_acl" "this" {
  bucket = "my-app-data-store"
  acl    = "private"
}

resource "alicloud_oss_bucket" "this" {
  bucket = "my-app-data-store"
}
""",
        "ecs": """## 示例：销毁 ECS 实例

resource "alicloud_instance" "this" {
  instance_name = "web-server-01"
  instance_type = "ecs.g6.large"
  image_id      = "aliyun_2_1903_x64_20G_alibase_2024"
}
""",
    },
    "azure": {
        "resource_group": """## 示例：销毁资源组

resource "azurerm_resource_group" "this" {
  name = "my-resource-group"
}
""",
        "virtual_machine": """## 示例：销毁虚拟机

resource "azurerm_linux_virtual_machine" "this" {
  name = "my-vm"
}
""",
    },
}


def build_terraform_generation_prompt(
    resource_type: str,
    resource_display_name: str,
    schema_json: str,
    params: dict,
    action: str = "create",
    provider: str = "alicloud",
    existing_resource_address: str = "",
    user_description: Optional[str] = None,
) -> tuple[str, str]:
    """
    构建生成 Terraform 代码的 Prompt。
    返回 (system_prompt, user_prompt)
    """

    action_label = {
        "create": "创建",
        "update": "更新",
        "destroy": "销毁",
    }.get(action, action)

    provider_name = "阿里云" if provider == "alicloud" else "Azure"

    # 资源特定的规则
    resource_rules = {}
    if provider == "alicloud":
        resource_rules["oss"] = (
            "- OSS bucket 名称只允许小写字母、数字和短横线 (-)，不允许使用下划线 (_)\n"
            "- 使用 alicloud_oss_bucket_acl 资源来设置 acl，不要使用 alicloud_oss_bucket 的 acl 字段（已废弃）\n"
        )

    # 通用规则
    common_rules = (
        "- 严禁在 resource 块中使用 region/location 参数！region 由 provider 级别配置，不要在资源中指定\n"
        "- 只使用下方 Schema 中列出的 terraform_resource 类型，严禁自行编造不存在的资源类型\n"
        "- 每个资源块只使用该资源类型实际支持的参数，不要添加任何不存在的参数\n"
        f"- 使用 {provider_name} 的 Terraform Provider，资源类型以 {'alicloud_' if provider == 'alicloud' else 'azurerm_'} 为前缀\n"
    )

    extra_rules = common_rules + resource_rules.get(resource_type, "")

    if action == "update":
        extra_rules += (
            f"- 这是一个更新操作，目标资源是 {existing_resource_address}\n"
            "- 生成的 resource 块必须使用与目标资源相同的地址（resource 名称保持不变）\n"
            "- 只包含用户提供的新参数值，其他参数保持原有配置不变\n"
            "- Terraform 会自动计算出变更 diff，不需要额外处理\n"
        )

    if user_description:
        extra_rules += (
            "- 以下用户使用自然语言描述的需求，请结合表单参数一起理解，生成最符合用户意图的配置\n"
        )

    system_prompt = (
        f"你是一个 Terraform 配置生成专家，精通 {provider_name} 的 Terraform Provider。\n"
        f"你的任务是根据用户提供的资源类型和参数，生成正确的 Terraform HCL 配置代码。\n"
        "要求：\n"
        "1. 只输出纯 HCL 代码，不要包含任何解释、markdown 标记或代码块包围\n"
        "2. 代码必须符合 Terraform 语法\n"
        "3. 只包含 resource 定义和必要的 output 输出，不包含 provider 配置和 backend 配置\n"
        f"4. 使用 {'alicloud_' if provider == 'alicloud' else 'azurerm_'} 前缀的资源类型\n"
        "5. 参数值必须严格使用用户提供的值，不要自行修改或添加默认值\n"
        "6. 不要添加任何注释行\n"
        "7. 如果需要输出重要属性，可以添加 output 块\n"
        "8. 表单参数优先于自然语言描述，如果两者冲突以表单参数为准\n"
        f"{extra_rules}"
    )

    if action == "update":
        user_prompt = (
            f"请生成 Terraform 配置代码，用于{action_label}一个已有的 {resource_display_name}。\n\n"
            f"云平台: {provider_name}\n"
            f"资源类型: {resource_type}\n"
            f"操作: {action_label}\n"
            f"目标资源地址: {existing_resource_address}\n\n"
            f"用户提供的更新参数:\n{params}\n\n"
            f"资源 Schema 定义:\n{schema_json}\n\n"
        )
    else:
        user_prompt = (
            f"请生成 Terraform 配置代码，用于在{provider_name}上{action_label}一个 {resource_display_name}。\n\n"
            f"云平台: {provider_name}\n"
            f"资源类型: {resource_type}\n"
            f"操作: {action_label}\n\n"
            f"用户提供的参数:\n{params}\n\n"
            f"资源 Schema 定义:\n{schema_json}\n\n"
        )

    if user_description:
        user_prompt += f"用户补充的自然语言描述:\n{user_description}\n\n"

    # 添加 few-shot 示例
    if action == "destroy":
        examples = DESTROY_EXAMPLES.get(provider, {})
        example = examples.get(resource_type, FEW_SHOT_EXAMPLES.get(provider, {}).get(resource_type))
    else:
        example = FEW_SHOT_EXAMPLES.get(provider, {}).get(resource_type)

    if example:
        user_prompt += f"请参考以下示例格式（注意示例中的参数值是示意，请使用用户提供的实际参数值）：\n{example}\n\n"

    user_prompt += "请直接输出 HCL 代码。"
    return system_prompt, user_prompt


def build_terraform_fix_prompt(
    tf_content: str,
    error_log: str,
) -> tuple[str, str]:
    """构建修复 Terraform 代码的 Prompt"""
    system_prompt = (
        "你是一个 Terraform 配置修复专家。\n"
        "用户提供的 Terraform 配置在执行时出错，请分析错误并修复代码。\n"
        "只输出修正后的纯 HCL 代码，不要包含任何解释。\n"
        "重要规则：\n"
        "- 严禁在 resource 块中使用 region/location 参数！region 由 provider 级别配置\n"
        "- 只使用真实存在的资源类型，严禁编造不存在的资源类型\n"
        "- 每个资源块只使用该资源实际支持的参数，不要添加不存在的参数\n"
    )
    user_prompt = (
        f"以下 Terraform 配置执行出错：\n\n{tf_content}\n\n"
        f"错误信息：\n\n{error_log}\n\n"
        "请修复代码。"
    )
    return system_prompt, user_prompt


def build_analyze_error_prompt(
    error_log: str,
    action: str,
) -> tuple[str, str]:
    """构建分析 Terraform 执行错误的 Prompt"""
    system_prompt = (
        "你是一个 Terraform 错误分析专家。\n"
        "分析以下 Terraform 执行错误，给出：\n"
        "1. 错误原因（一句话概括）\n"
        "2. 修复建议（具体可操作）\n"
        "3. 是否需要重新生成配置\n"
        "用简洁的 JSON 格式输出。"
    )
    user_prompt = (
        f"Terraform {action} 执行失败，错误信息如下：\n\n{error_log}\n\n"
        f"请分析原因并给出修复建议。"
    )
    return system_prompt, user_prompt