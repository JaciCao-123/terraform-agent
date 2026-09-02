"""Terraform 管理器：编排整个 Terraform 工作流"""

import json
import os
import time
from typing import AsyncGenerator, Optional

from app.config import settings
from app.core.docker_engine import DockerEngine
from app.llm.base import get_llm_provider
from app.llm.prompt_templates import (
    build_terraform_generation_prompt,
    build_terraform_fix_prompt,
    build_analyze_error_prompt,
)
from app.llm.base import BaseLLMProvider


class TerraformManager:
    """编排 Terraform 配置生成、plan、apply 全流程"""

    # 资源类型到 Terraform 资源名映射
    RESOURCE_TYPE_MAP = {
        "ecs": "alicloud_instance",
        "rds": "alicloud_db_instance",
        "slb": "alicloud_slb",
        "oss": "alicloud_oss_bucket",
        "vpc": "alicloud_vpc",
        "redis": "alicloud_kvstore_instance",
        "ack": "alicloud_cs_managed_kubernetes",
        "cdn": "alicloud_cdn_domain",
        "nas": "alicloud_nas_file_system",
    }

    def __init__(self):
        self.docker = DockerEngine()
        self._llm: Optional[BaseLLMProvider] = None
        self.schemas: dict[str, dict] = {}
        self._latest_fixed_tf: Optional[str] = None  # 存储最近一次自动修复后的代码
        self._load_schemas()

    @property
    def llm(self) -> BaseLLMProvider:
        """懒加载 LLM Provider，避免服务启动时因缺少 API Key 而崩溃"""
        if self._llm is None:
            self._llm = get_llm_provider()
        return self._llm

    def _load_schemas(self):
        """加载所有资源 Schema"""
        schema_dir = os.path.join(os.path.dirname(__file__), "..", "schemas")
        if not os.path.exists(schema_dir):
            return
        for fname in os.listdir(schema_dir):
            if fname.endswith(".json"):
                with open(os.path.join(schema_dir, fname)) as f:
                    schema = json.load(f)
                    self.schemas[schema["resource_type"]] = schema

    def get_resource_types(self) -> list[dict]:
        """获取所有支持的资源类型列表"""
        return [
            {
                "type": k,
                "display_name": v["display_name"],
                "terraform_resource": v["terraform_resource"],
            }
            for k, v in self.schemas.items()
        ]

    def get_resource_schema(self, resource_type: str) -> Optional[dict]:
        """获取指定资源类型的 Schema"""
        return self.schemas.get(resource_type)

    async def generate_tf(self, resource_type: str, params: dict, user_description: Optional[str] = None) -> str:
        """调用 LLM 生成 Terraform 配置文件"""
        schema = self.get_resource_schema(resource_type)
        if not schema:
            raise ValueError(f"不支持的资源类型: {resource_type}")

        system_prompt, user_prompt = build_terraform_generation_prompt(
            resource_type=resource_type,
            resource_display_name=schema["display_name"],
            schema_json=json.dumps(schema, ensure_ascii=False, indent=2),
            params=params,
            action="create",
            user_description=user_description,
        )
        tf_content = await self.llm.generate(
            prompt=user_prompt,
            system_prompt=system_prompt,
            temperature=0.1,
        )
        return tf_content.strip()

    async def generate_destroy_tf(self, resource_address: str, user_description: Optional[str] = None) -> str:
        """生成销毁指定资源的 Terraform 配置"""
        # 从 state 中获取资源类型
        from app.core.state_manager import StateManager
        from app.llm.prompt_templates import build_terraform_generation_prompt

        state_manager = StateManager()
        resources = state_manager.get_resource_list()
        target = None
        for r in resources:
            if r["address"] == resource_address:
                target = r
                break

        if not target:
            # 未找到目标资源，返回空（将通过 -target 执行）
            return ""

        # 生成包含 provider 声明的配置
        resource_type = target["type"]
        tf_resource = self.RESOURCE_TYPE_MAP.get(resource_type, "")
        if not tf_resource:
            return ""

        # 如果有自然语言描述，通过 LLM 生成（可以结合描述处理关联资源）
        if user_description:
            schema = self.get_resource_schema(resource_type)
            if schema:
                system_prompt, user_prompt = build_terraform_generation_prompt(
                    resource_type=resource_type,
                    resource_display_name=schema["display_name"],
                    schema_json=json.dumps(schema, ensure_ascii=False, indent=2),
                    params={},
                    action="destroy",
                    existing_resource_address=resource_address,
                    user_description=user_description,
                )
                tf_content = await self.llm.generate(
                    prompt=user_prompt,
                    system_prompt=system_prompt,
                    temperature=0.1,
                )
                return tf_content.strip()

        # 默认返回空框架
        return f"""resource "{tf_resource}" "{target["name"]}" {{
  # 此资源将被销毁，详情请查看 terraform plan -destroy
}}
"""

    async def generate_update_tf(self, resource_type: str, resource_address: str, params: dict, user_description: Optional[str] = None) -> str:
        """生成更新已有资源的 Terraform 配置"""
        schema = self.get_resource_schema(resource_type)
        if not schema:
            raise ValueError(f"不支持的资源类型: {resource_type}")

        system_prompt, user_prompt = build_terraform_generation_prompt(
            resource_type=resource_type,
            resource_display_name=schema["display_name"],
            schema_json=json.dumps(schema, ensure_ascii=False, indent=2),
            params=params,
            action="update",
            existing_resource_address=resource_address,
            user_description=user_description,
        )
        tf_content = await self.llm.generate(
            prompt=user_prompt,
            system_prompt=system_prompt,
            temperature=0.1,
        )
        return tf_content.strip()

    async def plan(self, tf_content: str, resource_type: str) -> AsyncGenerator[str, None]:
        """执行 terraform plan，失败时自动修复并重试"""
        max_retries = 2
        current_tf = tf_content
        self._latest_fixed_tf = None

        for attempt in range(max_retries + 1):
            if attempt > 0:
                yield f"\n--- 自动修复尝试 ({attempt}/{max_retries}) ---\n"

            lines = []
            error_detected = False
            async for line in self.docker.run_terraform(
                command=["plan"],
                tf_content=current_tf,
            ):
                lines.append(line)
                yield line
                if "[ERROR]" in line:
                    error_detected = True

            if not error_detected:
                if attempt > 0:
                    self._latest_fixed_tf = current_tf
                return  # plan 成功

            if attempt < max_retries:
                error_log = "\n".join(lines)
                yield f"\n[INFO] 检测到错误，正在自动修复...\n"
                try:
                    current_tf = await self.fix_tf(current_tf, error_log)
                    yield f"[INFO] 配置已修复，重新执行 plan...\n"
                except Exception as e:
                    yield f"[ERROR] 自动修复失败: {e}\n"
                    return

        yield "\n[ERROR] 已达到最大重试次数，请检查配置\n"

    async def plan_destroy(self, resource_address: str) -> AsyncGenerator[str, None]:
        """执行 terraform plan -destroy，实时返回输出"""
        async for line in self.docker.run_terraform(
            command=["plan", "-destroy", f"-target={resource_address}"],
            tf_content="",
        ):
            yield line

    async def apply(self, tf_content: str) -> AsyncGenerator[str, None]:
        """执行 terraform apply，实时返回输出"""
        async for line in self.docker.run_terraform(
            command=["apply", "-auto-approve"],
            tf_content=tf_content,
        ):
            yield line

    async def destroy(self, resource_address: str) -> AsyncGenerator[str, None]:
        """执行 terraform destroy，实时返回输出"""
        async for line in self.docker.run_terraform(
            command=["destroy", "-auto-approve", f"-target={resource_address}"],
            tf_content="",
        ):
            yield line

    async def fix_tf(self, tf_content: str, error_log: str) -> str:
        """修复 Terraform 配置（plan/apply 失败时调用）"""
        system_prompt, user_prompt = build_terraform_fix_prompt(tf_content, error_log)
        fixed = await self.llm.generate(
            prompt=user_prompt,
            system_prompt=system_prompt,
            temperature=0.2,
        )
        return fixed.strip()

    async def analyze_error(self, error_log: str, action: str) -> str:
        """分析 Terraform 执行错误"""
        system_prompt, user_prompt = build_analyze_error_prompt(error_log, action)
        analysis = await self.llm.generate(
            prompt=user_prompt,
            system_prompt=system_prompt,
            temperature=0.2,
        )
        return analysis.strip()

    def log_operation(
        self,
        operation_type: str,
        resource_type: str,
        resource_params: dict,
        tf_content: str,
        plan_result: str,
        apply_result: str,
        status: str,
    ):
        """
        记录操作日志到 OSS。

        目前先写本地文件，后续可接入 OSS。
        """
        log_entry = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "operation_type": operation_type,
            "resource_type": resource_type,
            "resource_params": resource_params,
            "tf_content": tf_content,
            "plan_result": plan_result,
            "apply_result": apply_result,
            "status": status,
        }
        log_dir = os.path.join(settings.terraform_work_dir, "logs")
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(
            log_dir,
            f"{time.strftime('%Y%m%d-%H%M%S')}-{operation_type}-{resource_type}.json",
        )
        with open(log_file, "w") as f:
            json.dump(log_entry, f, ensure_ascii=False, indent=2)