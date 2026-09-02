# Terraform 资源管理 Agent — 架构设计文档

## 1. 项目概述

### 1.1 项目目标

构建一个 AI Agent 系统，通过 Web 界面 + LLM 驱动的方式，使用 Terraform 管理阿里云上的基础设施资源。用户通过下拉框选择资源类型和操作，填写参数，由 LLM 生成对应的 Terraform 配置文件，审查后执行创建或销毁。

### 1.2 核心理念

- **AI 辅助，人工确认**：LLM 生成代码，terraform plan 验证，用户确认后执行
- **内部工具优先**：先满足小团队内部使用，不做多租户、计费等商业功能
- **安全第一**：凭据隔离、容器化执行、操作审计全覆盖

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                      浏览器 (React + Ant Design)          │
│  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌───────────┐ │
│  │ 资源选择器 │  │ 参数弹窗  │  │ 代码审查 │  │ 执行面板   │ │
│  │ (下拉框)  │  │ (对话框) │  │ (Plan) │  │ (SSE 日志)│ │
│  └────┬─────┘  └────┬─────┘  └────┬───┘  └─────┬─────┘ │
│       └──────────────┴─────────────┴─────────────┘       │
└──────────────────────────┬──────────────────────────────┘
                           │ REST + SSE
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    后端 (Python FastAPI)                   │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  API 路由层   │  │  Terraform    │  │  LLM 抽象层    │  │
│  │  (REST+SSE)  │  │  管理器       │  │  (Provider)   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘  │
│         │                 │                 │            │
│         ▼                 ▼                 ▼            │
│  ┌──────────┐    ┌──────────────┐   ┌──────────────┐    │
│  │ 日志审计  │    │  Docker 执行  │   │ 通义千问      │    │
│  │ (OSS)    │    │  引擎        │   │ / VLLM       │    │
│  └──────────┘    └──────┬───────┘   └──────────────┘    │
│                         │                                 │
└─────────────────────────┼───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Docker 容器 (临时)                        │
│  ┌──────────────────────────────────────────────────┐   │
│  │  hashicorp/terraform:latest                       │   │
│  │  - .tf 文件 (挂载卷)                               │   │
│  │  - 环境变量: ALICLOUD_ACCESS_KEY / SECRET_KEY     │   │
│  │  - 后端配置: OSS 远程状态后端                       │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    阿里云 (Alibaba Cloud)                  │
│  ┌──────────┬──────────┬──────────┬──────────────────┐  │
│  │ ECS      │  RDS     │  SLB     │  OSS (状态+日志)  │  │
│  └──────────┴──────────┴──────────┴──────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 项目结构（新仓库）

```
terraform-agent/
├── backend/                  # Python FastAPI 后端
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py           # FastAPI 入口, 路由注册
│   │   ├── config.py         # 配置管理 (环境变量 + config.yaml)
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── resources.py  # 资源 CRUD 相关 API
│   │   │   ├── execute.py    # Terraform 执行 API (SSE 流)
│   │   │   └── llm.py        # LLM 生成相关 API
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── terraform_manager.py   # Terraform 执行管理
│   │   │   ├── docker_engine.py       # Docker 容器执行引擎
│   │   │   └── state_manager.py       # 状态文件管理
│   │   ├── llm/
│   │   │   ├── __init__.py
│   │   │   ├── base.py       # LLM Provider 抽象基类
│   │   │   ├── tongyi.py     # 通义千问 Provider
│   │   │   ├── vllm.py       # 本地 VLLM Provider
│   │   │   └── prompt_templates.py  # Prompt 模板
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── ecs.json      # ECS 资源 Schema
│   │   │   ├── rds.json      # RDS 资源 Schema
│   │   │   ├── slb.json      # SLB 资源 Schema
│   │   │   └── oss.json      # OSS 资源 Schema
│   │   └── models/
│   │       ├── __init__.py
│   │       └── operation_log.py  # 操作日志模型
│   ├── logs/                 # 本地日志 (可选)
│   ├── requirements.txt
│   ├── config.yaml           # 配置文件
│   └── Dockerfile
├── frontend/                 # React + Ant Design 前端
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ResourceSelector.tsx   # 资源类型下拉框
│   │   │   ├── ConfigDialog.tsx       # 参数配置弹窗
│   │   │   ├── CodeReview.tsx         # 代码审查 + Plan 展示
│   │   │   ├── ExecutionPanel.tsx     # 执行面板 (SSE 日志)
│   │   │   └── ResultViewer.tsx       # 执行结果展示
│   │   ├── services/
│   │   │   └── api.ts        # 后端 API 调用封装
│   │   └── types/
│   │       └── index.ts      # 类型定义
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml        # 编排后端 + 前端
├── .env.example              # 环境变量模板
└── README.md
```

---

## 4. 核心组件设计

### 4.1 前端组件

#### 资源选择器 (ResourceSelector)

- 第一级选择：操作类型（创建 / 销毁）
- 第二级选择：资源类型（ECS / RDS / SLB / OSS）
- 销毁模式时，自动加载已创建资源列表（从 OSS 远程状态读取）
- 使用 Ant Design 的 `Select` + `Cascader` 组件

#### 参数配置弹窗 (ConfigDialog)

- 根据选中的资源类型，动态渲染表单
- 表单字段来自对应的 JSON Schema（核心必填参数）
- 可选参数通过"展开更多"展示，避免表单过长
- 使用 Ant Design 的 `Form` + `Modal` 组件
- 提交后调用 LLM 生成接口

#### 代码审查 (CodeReview)

- 展示 LLM 生成的 `.tf` 文件内容（语法高亮）
- 展示 `terraform plan` 结果（资源变更摘要，费用预估）
- 确认语义：展示"将创建/销毁：XXX，预估费用：¥YYY/月"
- 提供"重新生成"和"确认执行"两个按钮
- 使用 Ant Design 的 `Card` + Monaco Editor（只读模式）

#### 执行面板 (ExecutionPanel)

- 通过 SSE 接收后端实时推送的执行日志
- 分阶段展示：plan 输出 → 确认 → apply 输出
- 日志支持 ANSI 颜色渲染（Terraform 原生日志风格）
- 执行完成后展示结果摘要（资源 ID、IP、状态等）

#### 结果查看器 (ResultViewer)

- 展示本次执行的操作记录
- 链接到审计日志（OSS 路径或直接查看）
- 提供"再创建一台"、"销毁这台"等快捷操作

### 4.2 后端核心模块

#### 配置管理 (config.py)

```python
# 配置来源优先级: 环境变量 > config.yaml > 默认值
# 关键配置项:

# LLM 配置
LLM_PROVIDER: str          # "tongyi" | "vllm"
TONGYI_API_KEY: str        # 通义千问 API Key
VLLM_ENDPOINT: str         # 本地 VLLM 地址 (可选)
VLLM_MODEL_NAME: str       # 本地 VLLM 模型名 (可选)

# Terraform 配置
TERRAFORM_IMAGE: str       # "hashicorp/terraform:latest"
TERRAFORM_WORK_DIR: str    # 临时工作目录

# 阿里云凭据 (本地测试用 .env, 生产环境用环境变量注入)
ALICLOUD_ACCESS_KEY: str
ALICLOUD_SECRET_KEY: str
ALICLOUD_REGION: str       # "cn-hangzhou"

# OSS 后端配置
OSS_BUCKET: str            # Terraform 状态 + 日志存储
OSS_STATE_PREFIX: str      # "terraform/state/"
OSS_LOG_PREFIX: str        # "terraform/logs/"

# 双环境切换
# 本地: 读取 .env 文件中的凭据
# 生产: 通过 docker-compose 环境变量注入
```

#### Terraform 管理器 (terraform_manager.py)

核心职责：
1. 接收资源类型、参数、操作类型（create/destroy）
2. 调用 LLM 生成 `.tf` 文件内容
3. 将 `.tf` 文件写入临时目录
4. 调用 Docker 引擎执行 `terraform init` + `terraform plan`
5. 返回 plan 结果给前端
6. 用户确认后，执行 `terraform apply` 或 `terraform destroy`
7. 将执行结果写入 OSS 审计日志

```python
class TerraformManager:
    async def generate_tf(self, resource_type: str, params: dict) -> str:
        """调用 LLM 生成 Terraform 配置文件"""
        schema = self.load_schema(resource_type)
        prompt = self.build_prompt(resource_type, schema, params, action="create")
        tf_content = await self.llm.generate(prompt)
        return tf_content

    async def plan(self, tf_content: str, state_backend: dict) -> PlanResult:
        """执行 terraform plan，返回变更摘要"""
        ...

    async def apply(self, tf_content: str, state_backend: dict) -> ApplyResult:
        """执行 terraform apply，流式返回日志"""
        ...

    async def destroy(self, resource_address: str) -> DestroyResult:
        """执行 terraform destroy -target=resource_address"""
        ...
```

#### Docker 执行引擎 (docker_engine.py)

```python
class DockerEngine:
    """管理 Terraform 容器的全生命周期"""

    async def run_terraform(
        self,
        command: str,          # "plan" | "apply" | "destroy"
        tf_files: list[str],   # .tf 文件路径列表
        env_vars: dict,        # 阿里云凭据 + OSS 后端配置
        stream: bool = False   # 是否流式输出
    ) -> AsyncGenerator[str, None]:
        """
        1. 拉取 hashicorp/terraform 镜像
        2. 创建临时容器
        3. 挂载 .tf 文件目录
        4. 注入环境变量 (当前会话凭据)
        5. 按顺序执行: init → plan/apply/destroy
        6. 实时输出日志 (SSE)
        7. 执行完成后销毁容器
        """
        ...
```

#### LLM 抽象层 (llm/base.py)

```python
class BaseLLMProvider(ABC):
    """LLM Provider 抽象基类，支持多后端切换"""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system_prompt: str = "",
        temperature: float = 0.1
    ) -> str:
        ...

# 通义千问 Provider
class TongyiProvider(BaseLLMProvider):
    """调用通义千问 API"""
    async def generate(self, prompt, system_prompt="", temperature=0.1):
        from openai import AsyncOpenAI
        client = AsyncOpenAI(
            api_key=config.TONGYI_API_KEY,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
        )
        response = await client.chat.completions.create(
            model="qwen-plus",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            temperature=temperature
        )
        return response.choices[0].message.content

# 本地 VLLM Provider
class VLLMProvider(BaseLLMProvider):
    """调用本地 VLLM 服务 (兼容 OpenAI API 格式)"""
    async def generate(self, prompt, system_prompt="", temperature=0.1):
        from openai import AsyncOpenAI
        client = AsyncOpenAI(
            api_key="not-needed",  # VLLM 通常不需要 key
            base_url=config.VLLM_ENDPOINT  # e.g. http://localhost:8000/v1
        )
        response = await client.chat.completions.create(
            model=config.VLLM_MODEL_NAME,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            temperature=temperature
        )
        return response.choices[0].message.content

# Provider 工厂
def get_llm_provider() -> BaseLLMProvider:
    if config.LLM_PROVIDER == "vllm" and config.VLLM_ENDPOINT:
        return VLLMProvider()
    return TongyiProvider()
```

### 4.3 资源 Schema 定义

每个资源类型一个 JSON Schema，只覆盖核心必填参数。示例（ECS）：

```json
{
  "resource_type": "ecs",
  "terraform_resource": "alicloud_instance",
  "display_name": "云服务器 ECS",
  "core_params": [
    {
      "name": "instance_name",
      "label": "实例名称",
      "type": "string",
      "required": true,
      "default": "my-instance"
    },
    {
      "name": "instance_type",
      "label": "实例规格",
      "type": "select",
      "required": true,
      "default": "ecs.g6.large",
      "options": ["ecs.g6.large", "ecs.g6.xlarge", "ecs.g6.2xlarge"]
    },
    {
      "name": "image_id",
      "label": "镜像 ID",
      "type": "select",
      "required": true,
      "options": ["aliyun_2_1903_x64_20G_alibase_2024", "centos_7_9_x64_20G_alibase_2024"]
    },
    {
      "name": "system_disk_size",
      "label": "系统盘大小 (GB)",
      "type": "number",
      "required": false,
      "default": 40,
      "min": 20,
      "max": 500
    },
    {
      "name": "internet_charge_type",
      "label": "网络计费方式",
      "type": "select",
      "required": false,
      "default": "PayByTraffic",
      "options": ["PayByTraffic", "PayByBandwidth"]
    }
  ]
}
```

---

## 5. 工作流程

### 5.1 创建资源流程

```
用户选择 "创建" → 选择资源类型 (ECS)
    │
    ▼
弹出参数配置对话框
    │
    ▼
用户填写参数 → 提交
    │
    ▼
后端调用 LLM → 生成 main.tf
    │
    ▼
Docker 容器执行 terraform init
    │
    ▼
Docker 容器执行 terraform plan
    │
    ▼
前端展示 plan 结果 (SSE 实时推送)
    │
    ▼
用户审查 → 确认执行
    │
    ▼
Docker 容器执行 terraform apply
    │
    ▼
前端展示 apply 结果 (SSE 实时推送)
    │
    ▼
操作日志写入 OSS
    │
    ▼
完成
```

### 5.2 销毁资源流程

```
用户选择 "销毁" → 自动加载已有资源列表
    │
    ▼
从下拉框选择要销毁的资源实例
    │
    ▼
后端生成 terraform destroy -target=... 命令
    │
    ▼
Docker 容器执行 terraform plan -destroy
    │
    ▼
前端展示"将销毁以下资源"清单 (SSE 实时推送)
    │
    ▼
用户确认 → 执行 terraform destroy
    │
    ▼
前端展示销毁结果 (SSE 实时推送)
    │
    ▼
操作日志写入 OSS
    │
    ▼
完成
```

---

## 6. 错误处理策略

| 错误场景 | 处理方式 |
|---|---|
| LLM 生成格式错误 (无效 HCL) | 重试 1 次，降低 temperature；重试失败则提示用户"生成失败，请调整参数后重试" |
| Terraform plan 失败 (语法错误) | 将错误日志返回给 LLM，让其分析并修复后重新生成 |
| Terraform apply 失败 (配额不足) | LLM 分析错误原因，给出修复建议（如更换实例规格），提供"重新生成"按钮 |
| Terraform apply 失败 (依赖不存在) | LLM 分析缺失的依赖资源，提示用户先创建依赖资源 |
| Docker 容器执行超时 | 设置 10 分钟超时，超时后自动终止容器并返回超时错误 |
| 网络错误 (API 调用失败) | 自动重试 3 次，指数退避；失败后提示用户检查网络连接 |

---

## 7. 安全设计

### 7.1 凭据管理

```yaml
# 本地开发: .env 文件 (不提交 git)
ALICLOUD_ACCESS_KEY=xxx
ALICLOUD_SECRET_KEY=xxx
ALICLOUD_REGION=cn-hangzhou
TONGYI_API_KEY=xxx

# 生产环境: docker-compose 环境变量注入
# 凭据通过 docker-compose.yml 的 environment 字段传入
# 或使用 Docker Swarm secrets / K8s Secrets
```

### 7.2 Terraform 容器隔离

- 每次操作创建独立临时容器，执行完后销毁
- 凭据通过环境变量注入，不落盘
- .tf 文件通过临时挂载卷传入，容器内无持久化存储
- 容器网络限制：仅允许访问阿里云 API

### 7.3 操作审计

- 每次操作记录完整的 JSON 日志到 OSS
- 日志内容：时间戳、操作类型、资源类型、参数摘要、执行结果、操作人
- 日志不可篡改（OSS 的 WORM 策略可选开启）

---

## 8. 部署方案

### 8.1 本地开发环境

```bash
# 1. 克隆仓库
git clone <new-repo-url>
cd terraform-agent

# 2. 配置凭据
cp .env.example .env
# 编辑 .env 填入阿里云 AccessKey 和通义千问 API Key

# 3. 启动后端
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 4. 启动前端
cd frontend
npm install
npm run dev

# 5. 访问 http://localhost:5173
```

### 8.2 生产环境部署

```yaml
# docker-compose.yml
version: "3.8"

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - LLM_PROVIDER=tongyi
      - TONGYI_API_KEY=${TONGYI_API_KEY}
      - ALICLOUD_ACCESS_KEY=${ALICLOUD_ACCESS_KEY}
      - ALICLOUD_SECRET_KEY=${ALICLOUD_SECRET_KEY}
      - ALICLOUD_REGION=cn-hangzhou
      - OSS_BUCKET=${OSS_BUCKET}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # 用于创建 Terraform 容器
      - ./backend/logs:/app/logs
    restart: always

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend
    restart: always
```

---

## 9. 技术栈总结

| 层 | 技术选型 | 理由 |
|---|---|---|
| 前端框架 | React 18 + TypeScript | 生态成熟，Ant Design 完美匹配表单场景 |
| UI 组件库 | Ant Design 5.x | Select、Form、Modal、Card 开箱即用 |
| 代码编辑器 | Monaco Editor (只读模式) | 语法高亮、HCL 支持 |
| 后端框架 | Python FastAPI | 异步原生、SSE 支持好、和大模型 SDK 无缝衔接 |
| 容器运行时 | Docker SDK for Python | 动态创建 Terraform 执行容器 |
| LLM 默认 | 通义千问 (Qwen) | 阿里云生态理解最好，国内访问稳定 |
| LLM 备选 | 本地 VLLM | 兼容 OpenAI API 格式，接口统一 |
| 远程状态 | 阿里云 OSS | 自带锁机制，和阿里云统一管理 |
| 审计日志 | 阿里云 OSS | 统一存储，无需额外数据库 |
| 部署 | docker-compose | 单机部署足够，简单可靠 |

---

## 10. 后续扩展方向

- **更多资源类型**：按需扩展 Schema 库，覆盖 SLB 监听器、RDS 只读实例、OSS 存储桶策略等
- **资源更新**：当前仅支持创建和销毁，后续可扩展 update 操作（通过 `terraform apply` 的增量变更能力）
- **批量操作**：支持一次性创建多个资源，或批量销毁
- **模板市场**：预置常用场景模板（如"WordPress 全栈部署"），一键生成完整 `.tf` 文件
- **成本预估**：集成阿里云价格计算 API，在 plan 阶段展示费用预估
- **RBAC 权限**：如果扩展到多团队使用，增加操作权限控制