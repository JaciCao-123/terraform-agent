/** 云平台类型 */
export type CloudProvider = 'alicloud' | 'azure'

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
  display_name?: string
  address: string
  provider?: string
}

/** 生成 Terraform 配置的请求 */
export interface GenerateRequest {
  resource_type: string
  params: Record<string, unknown>
  provider?: CloudProvider
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
  provider?: CloudProvider
}

/** 销毁操作的请求 */
export interface DestroyRequest {
  resource_address: string
  provider?: CloudProvider
}

/** SSE 消息 */
export interface SSEMessage {
  log?: string
  status?: 'running' | 'completed' | 'error'
  error?: string
  fixed_tf?: string
}

/** 操作类型 */
export type OperationType = 'create' | 'destroy' | 'update'

/** 操作步骤 */
export type StepType = 'select' | 'configure' | 'review' | 'plan' | 'apply' | 'result'

/** ── Ansible 相关类型 ── */

/** Ansible Playbook 记录 */
export interface AnsiblePlaybook {
  id: string
  name: string
  playbook_yaml: string
  provider: CloudProvider
  resource_type: string
  resource_address: string
  target_host: string
  created_at: string
  updated_at: string
}

/** Ansible 执行记录 */
export interface AnsibleExecution {
  id: string
  playbook_id: string
  playbook_name: string
  inventory_yaml: string
  status: 'running' | 'success' | 'failed'
  logs: string[]
  stats: Record<string, number>
  started_at: string
  completed_at?: string
}

/** ── 存量导入相关类型 ── */

/** 扫描到的存量资源 */
export interface ImportResource {
  id: string
  name: string
  type: string
  region: string
  status?: string
  [key: string]: unknown
}

/** 扫描结果 */
export interface ScanResult {
  provider: CloudProvider
  resource_type: string
  total: number
  resources: ImportResource[]
}