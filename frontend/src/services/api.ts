/**
 * 后端 API 调用封装
 */

import type {
  ResourceType,
  ResourceSchema,
  ResourceInstance,
  GenerateRequest,
  GenerateResponse,
  SSEMessage,
  CloudProvider,
  ScanResult,
} from '../types'

const API_BASE = '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `请求失败: ${res.status}`)
  }
  return res.json()
}

/** 获取支持的资源类型列表 */
export async function getResourceTypes(provider?: CloudProvider): Promise<ResourceType[]> {
  const params = provider ? `?provider=${provider}` : ''
  const data = await request<{ resource_types: ResourceType[] }>(`/resources/types${params}`)
  return data.resource_types
}

/** 获取指定资源类型的 Schema */
export async function getResourceSchema(type: string, provider?: CloudProvider): Promise<ResourceSchema> {
  const params = provider ? `?provider=${provider}` : ''
  return request<ResourceSchema>(`/resources/types/${type}/schema${params}`)
}

/** 获取已创建的资源实例列表 */
export async function getResourceInstances(provider?: CloudProvider): Promise<ResourceInstance[]> {
  const params = provider ? `?provider=${provider}` : ''
  const data = await request<{ instances: ResourceInstance[] }>(`/resources/instances${params}`)
  return data.instances
}

/** 调用 LLM 生成 Terraform 配置 */
export async function generateTf(req: GenerateRequest): Promise<GenerateResponse> {
  return request<GenerateResponse>('/llm/generate', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

/** 调用 LLM 生成销毁用的 Terraform 配置 */
export async function generateDestroyTf(resource_address: string, provider?: CloudProvider, user_description?: string): Promise<GenerateResponse> {
  return request<GenerateResponse>('/llm/generate-destroy', {
    method: 'POST',
    body: JSON.stringify({ resource_address, provider, user_description }),
  })
}

/** 调用 LLM 生成更新用的 Terraform 配置 */
export async function generateUpdateTf(
  resource_type: string,
  resource_address: string,
  params: Record<string, unknown>,
  provider?: CloudProvider,
  user_description?: string,
): Promise<GenerateResponse> {
  return request<GenerateResponse>('/llm/generate-update', {
    method: 'POST',
    body: JSON.stringify({ resource_type, resource_address, params, provider, user_description }),
  })
}

/** 获取已有资源的当前配置（用于回填表单） */
export async function getResourceConfig(
  resource_type: string,
  resource_id: string,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/resources/instances/${resource_type}/${resource_id}/config`)
}

/** 调用 LLM 修复 Terraform 配置 */
export async function fixTf(tfContent: string, errorLog: string): Promise<GenerateResponse> {
  return request<GenerateResponse>('/llm/fix', {
    method: 'POST',
    body: JSON.stringify({ tf_content: tfContent, error_log: errorLog }),
  })
}

/** 调用 LLM 分析错误 */
export async function analyzeError(errorLog: string, action: string): Promise<string> {
  const data = await request<{ analysis: string }>('/llm/analyze-error', {
    method: 'POST',
    body: JSON.stringify({ error_log: errorLog, action }),
  })
  return data.analysis
}

/** 执行 terraform plan（SSE 流） */
export function executePlan(
  tfContent: string,
  resourceType: string,
  onMessage: (msg: SSEMessage) => void,
  onError: (err: Error) => void,
  onComplete: (fixedTf?: string) => void,
  provider?: CloudProvider,
): () => void {
  return startSSE('/execute/plan', { tf_content: tfContent, resource_type: resourceType, provider }, onMessage, onError, onComplete)
}

/** 执行 terraform apply（SSE 流） */
export function executeApply(
  tfContent: string,
  resourceType: string,
  planResult: string,
  onMessage: (msg: SSEMessage) => void,
  onError: (err: Error) => void,
  onComplete: () => void,
  provider?: CloudProvider,
): () => void {
  return startSSE('/execute/apply', { tf_content: tfContent, resource_type: resourceType, plan_result: planResult, provider }, onMessage, onError, onComplete)
}

/** 执行 terraform plan -destroy（SSE 流） */
export function executePlanDestroy(
  resourceAddress: string,
  onMessage: (msg: SSEMessage) => void,
  onError: (err: Error) => void,
  onComplete: () => void,
  provider?: CloudProvider,
): () => void {
  return startSSE('/execute/plan-destroy', { resource_address: resourceAddress, provider }, onMessage, onError, onComplete)
}

/** 执行 terraform destroy（SSE 流） */
export function executeDestroy(
  resourceAddress: string,
  onMessage: (msg: SSEMessage) => void,
  onError: (err: Error) => void,
  onComplete: () => void,
  provider?: CloudProvider,
): () => void {
  return startSSE('/execute/destroy', { resource_address: resourceAddress, provider }, onMessage, onError, onComplete)
}

/** SSE 通用函数 */
function startSSE(
  path: string,
  body: Record<string, unknown>,
  onMessage: (msg: SSEMessage) => void,
  onError: (err: Error) => void,
  onComplete: (fixedTf?: string) => void,
): () => void {
  let cancelled = false
  let fixedTf: string | undefined

  fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`SSE 请求失败: ${response.status}`)
      }
      const reader = response.body?.getReader()
      if (!reader) throw new Error('响应体不可读')

      const decoder = new TextDecoder()
      let buffer = ''

      while (!cancelled) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const msg = JSON.parse(line.slice(6)) as SSEMessage
              if (msg.fixed_tf) {
                fixedTf = msg.fixed_tf
              }
              onMessage(msg)
              if (msg.status === 'completed') {
                onComplete(fixedTf)
                return
              }
              if (msg.status === 'error') {
                onError(new Error(msg.error || '执行出错'))
                return
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
      onComplete(fixedTf)
    })
    .catch((err) => {
      if (!cancelled) onError(err)
    })

  return () => {
    cancelled = true
  }
}

/** ── Ansible API ── */

/** 调用 LLM 生成 Ansible Playbook */
export async function generateAnsiblePlaybook(
  resourceInfo: Record<string, unknown>,
  userDescription: string,
  provider: CloudProvider = 'alicloud',
): Promise<{ playbook_yaml: string }> {
  return request('/ansible/generate', {
    method: 'POST',
    body: JSON.stringify({ resource_info: resourceInfo, user_description: userDescription, provider }),
  })
}

/** 执行 Ansible Playbook（SSE 流） */
export function executeAnsiblePlaybook(
  playbookYaml: string,
  inventoryYaml: string,
  onMessage: (msg: SSEMessage) => void,
  onError: (err: Error) => void,
  onComplete: () => void,
): () => void {
  return startSSE('/ansible/execute', { playbook_yaml: playbookYaml, inventory_yaml: inventoryYaml }, onMessage, onError, onComplete)
}

/** 保存 Ansible Playbook 记录 */
export async function saveAnsiblePlaybook(
  name: string,
  playbookYaml: string,
  provider: CloudProvider,
  resourceType: string,
  resourceAddress: string,
  targetHost: string,
): Promise<{ id: string }> {
  return request('/ansible/playbooks', {
    method: 'POST',
    body: JSON.stringify({ name, playbook_yaml: playbookYaml, provider, resource_type: resourceType, resource_address: resourceAddress, target_host: targetHost }),
  })
}

/** 获取历史 Playbook 列表 */
export async function listAnsiblePlaybooks(): Promise<{ playbooks: Array<{ id: string; name: string; provider: string; resource_type: string; target_host: string; created_at: string }> }> {
  return request('/ansible/playbooks')
}

/** 获取单个 Playbook 详情 */
export async function getAnsiblePlaybook(id: string): Promise<{ playbook_yaml: string }> {
  return request(`/ansible/playbooks/${id}`)
}

/** 生成 Ansible Inventory */
export async function buildAnsibleInventory(hosts: Array<Record<string, unknown>>): Promise<{ inventory_yaml: string }> {
  return request('/ansible/build-inventory', {
    method: 'POST',
    body: JSON.stringify({ hosts }),
  })
}

/** ── 存量资源导入 API ── */

/** 扫描存量资源列表 */
export async function scanImportResources(provider: CloudProvider, resourceType: string): Promise<ScanResult> {
  return request(`/import/scan?provider=${provider}&resource_type=${resourceType}`)
}

/** 获取支持的扫描资源类型 */
export async function getImportSupportedTypes(provider: CloudProvider): Promise<{ supported_types: string[] }> {
  return request(`/import/supported-types?provider=${provider}`)
}

/** 执行批量导入（SSE 流） */
export function executeImportResources(
  provider: CloudProvider,
  resources: Array<Record<string, unknown>>,
  onMessage: (msg: SSEMessage) => void,
  onError: (err: Error) => void,
  onComplete: () => void,
): () => void {
  return startSSE('/import/execute', { provider, resources }, onMessage, onError, onComplete)
}