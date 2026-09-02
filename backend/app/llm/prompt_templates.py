"""Prompt 模板：生成 Terraform 配置文件"""

from typing import Optional


def build_terraform_generation_prompt(
    resource_type: str,
    resource_display_name: str,
    schema_json: str,
    params: dict,
    action: str = "create",
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

    # 资源特定的规则
    resource_rules = {
        "oss": (
            "- OSS bucket 名称只允许小写字母、数字和短横线 (-)，不允许使用下划线 (_)\n"
            "- 使用 alicloud_oss_bucket_acl 资源来设置 acl，不要使用 alicloud_oss_bucket 的 acl 字段（已废弃）\n"
        ),
    }

    extra_rules = resource_rules.get(resource_type, "")

    # 更新操作的特殊规则
    if action == "update":
        extra_rules += (
            f"- 这是一个更新操作，目标资源是 {existing_resource_address}\n"
            "- 生成的 resource 块必须使用与目标资源相同的地址（resource 名称保持不变）\n"
            "- 只包含用户提供的新参数值，其他参数保持原有配置不变\n"
            "- Terraform 会自动计算出变更 diff，不需要额外处理\n"
        )

    # 自然语言描述
    if user_description:
        extra_rules += (
            "- 以下用户使用自然语言描述的需求，请结合表单参数一起理解，生成最符合用户意图的配置\n"
        )

    system_prompt = (
        "你是一个 Terraform 配置生成专家，精通阿里云 (Aliyun) 的 Terraform Provider。\n"
        "你的任务是根据用户提供的资源类型和参数，生成正确的 Terraform HCL 配置代码。\n"
        "要求：\n"
        "1. 只输出纯 HCL 代码，不要包含任何解释、markdown 标记或代码块包围\n"
        "2. 代码必须符合 Terraform 语法，使用阿里云 Provider alicloud\n"
        "3. 只包含 resource 定义，不包含 provider 配置和 backend 配置\n"
        "4. 使用 alicloud_ 前缀的资源类型\n"
        "5. 参数值必须严格使用用户提供的值，不要自行修改或添加默认值\n"
        "6. 不要添加任何注释行\n"
        "7. 表单参数优先于自然语言描述，如果两者冲突以表单参数为准\n"
        f"{extra_rules}"
    )

    if action == "update":
        user_prompt = (
            f"请生成 Terraform 配置代码，用于{action_label}一个已有的 {resource_display_name}。\n\n"
            f"资源类型: {resource_type}\n"
            f"操作: {action_label}\n"
            f"目标资源地址: {existing_resource_address}\n\n"
            f"用户提供的更新参数:\n{params}\n\n"
            f"资源 Schema 定义:\n{schema_json}\n\n"
        )
        if user_description:
            user_prompt += f"用户补充的自然语言描述:\n{user_description}\n\n"
        user_prompt += "请直接输出 HCL 代码。"
    else:
        user_prompt = (
            f"请生成 Terraform 配置代码，用于在阿里云上{action_label}一个 {resource_display_name}。\n\n"
            f"资源类型: {resource_type}\n"
            f"操作: {action_label}\n\n"
            f"用户提供的参数:\n{params}\n\n"
            f"资源 Schema 定义:\n{schema_json}\n\n"
        )
        if user_description:
            user_prompt += f"用户补充的自然语言描述:\n{user_description}\n\n"
        user_prompt += "请直接输出 HCL 代码。"

    return system_prompt, user_prompt


def build_terraform_fix_prompt(
    tf_content: str,
    error_log: str,
) -> tuple[str, str]:
    """
    构建修复 Terraform 代码的 Prompt（当 plan/apply 失败时使用）。
    """
    system_prompt = (
        "你是一个 Terraform 配置修复专家。\n"
        "用户提供的 Terraform 配置在执行时出错，请分析错误并修复代码。\n"
        "只输出修正后的纯 HCL 代码，不要包含任何解释。"
    )
    user_prompt = (
        f"以下 Terraform 配置执行失败：\n\n{tf_content}\n\n"
        f"错误信息：\n{error_log}\n\n"
        f"请修复代码并只输出修正后的 HCL 代码。"
    )
    return system_prompt, user_prompt


def build_analyze_error_prompt(
    error_log: str,
    action: str,
) -> str:
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