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
export async function getResourceTypes(): Promise<ResourceType[]> {
  const data = await request<{ resource_types: ResourceType[] }>('/resources/types')
  return data.resource_types
}

/** 获取指定资源类型的 Schema */
export async function getResourceSchema(type: string): Promise<ResourceSchema> {
  return request<ResourceSchema>(`/resources/types/${type}/schema`)
}

/** 获取已创建的资源实例列表 */
export async function getResourceInstances(): Promise<ResourceInstance[]> {
  const data = await request<{ instances: ResourceInstance[] }>('/resources/instances')
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
export async function generateDestroyTf(resource_address: string): Promise<GenerateResponse> {
  return request<GenerateResponse>('/llm/generate-destroy', {
    method: 'POST',
    body: JSON.stringify({ resource_address }),
  })
}

/** 调用 LLM 生成更新用的 Terraform 配置 */
export async function generateUpdateTf(
  resource_type: string,
  resource_address: string,
  params: Record<string, unknown>,
): Promise<GenerateResponse> {
  return request<GenerateResponse>('/llm/generate-update', {
    method: 'POST',
    body: JSON.stringify({ resource_type, resource_address, params }),
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
  onComplete: () => void,
): () => void {
  return startSSE('/execute/plan', { tf_content: tfContent, resource_type: resourceType }, onMessage, onError, onComplete)
}

/** 执行 terraform apply（SSE 流） */
export function executeApply(
  tfContent: string,
  resourceType: string,
  planResult: string,
  onMessage: (msg: SSEMessage) => void,
  onError: (err: Error) => void,
  onComplete: () => void,
): () => void {
  return startSSE('/execute/apply', { tf_content: tfContent, resource_type: resourceType, plan_result: planResult }, onMessage, onError, onComplete)
}

/** 执行 terraform plan -destroy（SSE 流） */
export function executePlanDestroy(
  resourceAddress: string,
  onMessage: (msg: SSEMessage) => void,
  onError: (err: Error) => void,
  onComplete: () => void,
): () => void {
  return startSSE('/execute/plan-destroy', { resource_address: resourceAddress }, onMessage, onError, onComplete)
}

/** 执行 terraform destroy（SSE 流） */
export function executeDestroy(
  resourceAddress: string,
  onMessage: (msg: SSEMessage) => void,
  onError: (err: Error) => void,
  onComplete: () => void,
): () => void {
  return startSSE('/execute/destroy', { resource_address: resourceAddress }, onMessage, onError, onComplete)
}

/** SSE 通用函数 */
function startSSE(
  path: string,
  body: Record<string, unknown>,
  onMessage: (msg: SSEMessage) => void,
  onError: (err: Error) => void,
  onComplete: () => void,
): () => void {
  let cancelled = false

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
              onMessage(msg)
              if (msg.status === 'completed') {
                onComplete()
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
      onComplete()
    })
    .catch((err) => {
      if (!cancelled) onError(err)
    })

  return () => {
    cancelled = true
  }
}