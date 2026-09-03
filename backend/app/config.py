"""配置管理：环境变量 > config.yaml > 默认值"""

from pathlib import Path
from pydantic_settings import BaseSettings
from typing import Optional
import yaml
import os

# 项目根目录（backend 的父目录）
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    # LLM 配置
    llm_provider: str = "tongyi"  # "tongyi" | "vllm"
    tongyi_api_key: str = ""
    vllm_endpoint: Optional[str] = None
    vllm_model_name: Optional[str] = None

    # Terraform 配置
    terraform_image: str = "hashicorp/terraform:latest"
    terraform_work_dir: str = "/tmp/terraform-agent"

    # 阿里云配置
    alicloud_access_key: str = ""
    alicloud_secret_key: str = ""
    alicloud_region: str = "cn-hangzhou"

    # OSS 后端配置
    oss_bucket: str = "terraform-agent-state"
    oss_state_prefix: str = "terraform/state/"
    oss_log_prefix: str = "terraform/logs/"

    # Azure 凭据
    arm_client_id: str = ""
    arm_client_secret: str = ""
    arm_subscription_id: str = ""
    arm_tenant_id: str = ""
    arm_location: str = "eastasia"

    # Azure 状态后端
    azure_storage_account: str = ""
    azure_storage_container: str = "tfstate"

    # 后端服务配置
    host: str = "0.0.0.0"
    port: int = 8000

    model_config = {
        "env_file": str(PROJECT_ROOT / ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    @classmethod
    def load_yaml(cls) -> dict:
        """从 YAML 文件加载配置"""
        yaml_path = PROJECT_ROOT / "config.yaml"
        if yaml_path.exists():
            with open(yaml_path) as f:
                return yaml.safe_load(f) or {}
        return {}

    @classmethod
    def create(cls) -> "Settings":
        """创建配置实例，合并 YAML 和环境变量"""
        yaml_cfg = cls.load_yaml()
        # pydantic-settings 会自动读取环境变量和 .env 文件
        settings = cls()
        # 用 YAML 配置覆盖默认值（环境变量优先级更高，不会被覆盖）
        for key, value in yaml_cfg.items():
            key_upper = key.upper()
            # 仅当该 key 未通过环境变量设置时才用 YAML 值
            env_val = os.environ.get(key_upper)
            if env_val is None:
                setattr(settings, key, value)
        return settings


settings = Settings.create()