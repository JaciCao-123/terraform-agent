import React, { useState, useCallback } from 'react'
import { Layout, Typography, Steps, message } from 'antd'
import { CloudServerOutlined } from '@ant-design/icons'
import ResourceSelector from './components/ResourceSelector'
import ConfigDialog from './components/ConfigDialog'
import CodeReview from './components/CodeReview'
import ExecutionPanel from './components/ExecutionPanel'
import type { OperationType, ResourceSchema, SSEMessage } from './types'

const { Header, Content } = Layout
const { Title } = Typography

type StepStatus = 'wait' | 'process' | 'finish' | 'error'

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0)
  const [stepStatus, setStepStatus] = useState<StepStatus[]>(['process', 'wait', 'wait', 'wait', 'wait'])

  // 操作类型和资源类型
  const [operationType, setOperationType] = useState<OperationType>('create')
  const [resourceType, setResourceType] = useState<string | null>(null)
  const [resourceSchema, setResourceSchema] = useState<ResourceSchema | null>(null)

  // 生成的 Terraform 配置
  const [tfContent, setTfContent] = useState('')
  const [resourceParams, setResourceParams] = useState<Record<string, unknown>>({})

  // 执行日志
  const [executionLogs, setExecutionLogs] = useState<string[]>([])
  const [executionStatus, setExecutionStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')

  // 目标资源（销毁/更新模式）
  const [targetResourceAddress, setTargetResourceAddress] = useState<string>('')
  const [targetResourceId, setTargetResourceId] = useState<string>('')

  const updateStep = useCallback((step: number, status: StepStatus) => {
    setStepStatus((prev) => {
      const next = [...prev]
      next[step] = status
      return next
    })
  }, [])

  // 步骤1: 选择资源类型完成
  const handleResourceSelected = useCallback(
    (op: OperationType, resType: string, schema: ResourceSchema, targetAddress?: string, resourceId?: string) => {
      setOperationType(op)
      setResourceType(resType)
      setResourceSchema(schema)
      setTargetResourceAddress(targetAddress || '')
      setTargetResourceId(resourceId || '')
      updateStep(0, 'finish')
      updateStep(1, 'process')
      setCurrentStep(1)
    },
    [updateStep],
  )

  // 步骤2: 配置参数完成
  const handleConfigComplete = useCallback(
    (params: Record<string, unknown>, tf: string) => {
      setResourceParams(params)
      setTfContent(tf)
      updateStep(1, 'finish')
      updateStep(2, 'process')
      setCurrentStep(2)
    },
    [updateStep],
  )

  // 步骤3: Plan 完成
  const handlePlanComplete = useCallback(
    (logs: string[], fixedTf?: string) => {
      setExecutionLogs(logs)
      if (fixedTf) {
        setTfContent(fixedTf)
      }
      updateStep(2, 'finish')
      updateStep(3, 'process')
      setCurrentStep(3)
    },
    [updateStep],
  )

  // 步骤4: Apply 完成
  const handleApplyComplete = useCallback(
    (logs: string[]) => {
      setExecutionLogs((prev) => [...prev, ...logs])
      updateStep(3, 'finish')
      updateStep(4, 'process')
      setCurrentStep(4)
      setExecutionStatus('success')
      const actionLabel = operationType === 'create' ? '创建' : operationType === 'update' ? '更新' : '销毁'
      message.success(`${actionLabel}完成！`)
    },
    [operationType, updateStep],
  )

  // 错误处理
  const handleError = useCallback(
    (step: number, error: string) => {
      updateStep(step, 'error')
      setExecutionStatus('error')
      message.error(error)
    },
    [updateStep],
  )

  // 重新开始
  const handleReset = useCallback(() => {
    setCurrentStep(0)
    setStepStatus(['process', 'wait', 'wait', 'wait', 'wait'])
    setResourceType(null)
    setResourceSchema(null)
    setTfContent('')
    setResourceParams({})
    setExecutionLogs([])
    setExecutionStatus('idle')
    setTargetResourceAddress('')
  }, [])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          background: '#fff',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid #f0f0f0',
          cursor: 'pointer',
        }}
        onClick={handleReset}
      >
        <CloudServerOutlined style={{ fontSize: 24, color: '#1677ff', marginRight: 12 }} />
        <Title level={4} style={{ margin: 0 }}>
          Terraform Agent - 云资源管理
        </Title>
      </Header>
      <Content style={{ padding: '24px 48px' }}>
        <Steps
          current={currentStep}
          style={{ marginBottom: 32 }}
          items={[
            { title: '选择资源', status: stepStatus[0] },
            ...(operationType === 'destroy'
              ? [
                  { title: '确认销毁', status: stepStatus[1] },
                  { title: '审查 Plan Destroy', status: stepStatus[2] },
                  { title: '执行 Destroy', status: stepStatus[3] },
                ]
              : operationType === 'update'
              ? [
                  { title: '修改参数', status: stepStatus[1] },
                  { title: '审查 Plan', status: stepStatus[2] },
                  { title: '执行 Apply', status: stepStatus[3] },
                ]
              : [
                  { title: '配置参数', status: stepStatus[1] },
                  { title: '审查 Plan', status: stepStatus[2] },
                  { title: '执行 Apply', status: stepStatus[3] },
                ]
            ),
            { title: '查看结果', status: stepStatus[4] },
          ]}
        />

        {currentStep === 0 && (
          <ResourceSelector
            operationType={operationType}
            onOperationTypeChange={setOperationType}
            onResourceSelected={handleResourceSelected}
          />
        )}

        {currentStep === 1 && resourceSchema && (
          <ConfigDialog
            operationType={operationType}
            resourceType={resourceType}
            resourceId={targetResourceId}
            schema={resourceSchema}
            targetResourceAddress={targetResourceAddress}
            onComplete={handleConfigComplete}
            onBack={() => {
              updateStep(0, 'process')
              updateStep(1, 'wait')
              setCurrentStep(0)
            }}
          />
        )}

        {currentStep === 2 && (
          <CodeReview
            tfContent={tfContent}
            operationType={operationType}
            resourceType={resourceType || ''}
            targetResourceAddress={targetResourceAddress}
            onPlanComplete={handlePlanComplete}
            onError={(err) => handleError(2, err)}
            onBack={() => {
              updateStep(1, 'process')
              updateStep(2, 'wait')
              setCurrentStep(1)
            }}
          />
        )}

        {currentStep === 3 && (
          <ExecutionPanel
            tfContent={tfContent}
            operationType={operationType}
            resourceType={resourceType || ''}
            targetResourceAddress={targetResourceAddress}
            onApplyComplete={handleApplyComplete}
            onError={(err) => handleError(3, err)}
            onBack={() => {
              updateStep(2, 'process')
              updateStep(3, 'wait')
              setCurrentStep(2)
            }}
          />
        )}

        {currentStep === 4 && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Title level={3}>
              {operationType === 'create' ? '✅ 资源创建完成' : '✅ 资源销毁完成'}
            </Title>
            <p style={{ color: '#666', marginBottom: 24 }}>
              {operationType === 'create'
                ? 'Terraform 配置已成功执行，资源已创建。'
                : '资源已成功销毁。'}
            </p>
            <div
              style={{
                background: '#1e1e1e',
                color: '#d4d4d4',
                padding: 16,
                borderRadius: 8,
                textAlign: 'left',
                maxHeight: 300,
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: 12,
                marginBottom: 24,
              }}
            >
              {executionLogs.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </div>
        )}
      </Content>
    </Layout>
  )
}

export default App