/** 资源类型 */
export interface ResourceType {
  type: string
  display_name: string
  terraform_resource: string
}

/** 资源 Schema 参数定义 */
export interface SchemaParam {
  name: string
  label: string
  type: 'string' | 'number' | 'select' | 'password'
  required: boolean
  default?: string | number
  options?: string[]
  min?: number
  max?: number
  pattern?: string
  description?: string
}

/** 资源 Schema */
export interface ResourceSchema {
  resource_type: string
  terraform_resource: string
  display_name: string
  description: string
  core_params: SchemaParam[]
}

/** 已创建的资源实例 */
export interface ResourceInstance {
  id: string
  type: string
  name: string
  address: string
  provider?: string
}

/** 生成 Terraform 配置的请求 */
export interface GenerateRequest {
  resource_type: string
  params: Record<string, unknown>
  user_description?: string
}

/** 生成 Terraform 配置的响应 */
export interface GenerateResponse {
  tf_content: string
}

/** Terraform 执行操作的请求 */
export interface ExecuteRequest {
  tf_content: string
  resource_type: string
  plan_result?: string
}

/** 销毁操作的请求 */
export interface DestroyRequest {
  resource_address: string
}

/** SSE 消息 */
export interface SSEMessage {
  log?: string
  status?: 'running' | 'completed' | 'error'
  error?: string
}

/** 操作类型 */
export type OperationType = 'create' | 'destroy' | 'update'

/** 操作步骤 */
export type StepType = 'select' | 'configure' | 'review' | 'plan' | 'apply' | 'result'