import React, { useState, useCallback } from 'react'
import { Layout, Typography, Steps, message, ConfigProvider, theme, Button, Result } from 'antd'
import { CloudServerOutlined, ReloadOutlined } from '@ant-design/icons'
import ResourceSelector from './components/ResourceSelector'
import ConfigDialog from './components/ConfigDialog'
import CodeReview from './components/CodeReview'
import ExecutionPanel from './components/ExecutionPanel'
import TerminalView from './components/TerminalView'
import type { OperationType, ResourceSchema } from './types'

const { Header, Content } = Layout
const { Title } = Typography

type StepStatus = 'wait' | 'process' | 'finish' | 'error'

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0)
  const [stepStatus, setStepStatus] = useState<StepStatus[]>(['process', 'wait', 'wait', 'wait', 'wait'])

  const [operationType, setOperationType] = useState<OperationType>('create')
  const [resourceType, setResourceType] = useState<string | null>(null)
  const [resourceSchema, setResourceSchema] = useState<ResourceSchema | null>(null)
  const [tfContent, setTfContent] = useState('')
  const [resourceParams, setResourceParams] = useState<Record<string, unknown>>({})
  const [executionLogs, setExecutionLogs] = useState<string[]>([])
  const [executionStatus, setExecutionStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [targetResourceAddress, setTargetResourceAddress] = useState<string>('')
  const [targetResourceId, setTargetResourceId] = useState<string>('')

  const updateStep = useCallback((step: number, status: StepStatus) => {
    setStepStatus((prev) => {
      const next = [...prev]
      next[step] = status
      return next
    })
  }, [])

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

  const handlePlanComplete = useCallback(
    (logs: string[], fixedTf?: string) => {
      setExecutionLogs(logs)
      if (fixedTf) setTfContent(fixedTf)
      updateStep(2, 'finish')
      updateStep(3, 'process')
      setCurrentStep(3)
    },
    [updateStep],
  )

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

  const handleError = useCallback(
    (step: number, error: string) => {
      updateStep(step, 'error')
      setExecutionStatus('error')
      message.error(error)
    },
    [updateStep],
  )

  const handleReset = useCallback(() => {
    setCurrentStep(0)
    setStepStatus(['process', 'wait', 'wait', 'wait', 'wait'])
    setOperationType('create')
    setResourceType(null)
    setResourceSchema(null)
    setTfContent('')
    setResourceParams({})
    setExecutionLogs([])
    setExecutionStatus('idle')
    setTargetResourceAddress('')
    setTargetResourceId('')
  }, [])

  const stepItems = [
    { title: '选择资源', status: stepStatus[0] },
    ...(operationType === 'destroy'
      ? [
          { title: '确认销毁', status: stepStatus[1] },
          { title: '审查 Plan', status: stepStatus[2] },
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
  ]

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#2563eb',
          borderRadius: 10,
          colorBgContainer: '#ffffff',
          colorBgElevated: '#ffffff',
          colorBgLayout: '#f8fafc',
          colorText: '#1e293b',
          colorTextSecondary: '#64748b',
          colorBorder: '#e2e8f0',
        },
      }}
    >
      <Layout style={{ minHeight: '100vh', background: '#f8fafc' }}>
        <Header
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            height: 64,
            cursor: 'pointer',
            borderBottom: '1px solid #e2e8f0',
            position: 'sticky',
            top: 0,
            zIndex: 100,
            backdropFilter: 'blur(12px)',
          }}
          onClick={handleReset}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #2563eb, #6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)',
            }}
          >
            <CloudServerOutlined style={{ fontSize: 18, color: '#ffffff' }} />
          </div>
          <div>
            <Title level={4} style={{ margin: 0, color: '#f1f5f9', fontSize: 18, letterSpacing: 0.5, fontWeight: 700 }}>
              Terraform Agent
            </Title>
            <div style={{ fontSize: 11, color: '#93c5fd', marginTop: -2 }}>云资源管理平台</div>
          </div>
        </Header>
        <Content style={{ padding: '24px', maxWidth: 900, margin: '0 auto', width: '100%' }}>
          <div
            style={{
              background: '#ffffff',
              borderRadius: 14,
              padding: '16px 24px',
              marginBottom: 24,
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <Steps
              current={currentStep}
              items={stepItems}
              style={{ gap: 0 }}
            />
          </div>

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
            <div
              style={{
                background: '#ffffff',
                borderRadius: 14,
                padding: 32,
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <Result
                status={executionStatus === 'error' ? 'error' : 'success'}
                title={
                  <span style={{ fontSize: 20, color: '#1e293b' }}>
                    {operationType === 'create' ? '资源创建完成' : operationType === 'update' ? '资源更新完成' : '资源销毁完成'}
                  </span>
                }
                subTitle={
                  <span style={{ color: '#64748b' }}>
                    {executionStatus === 'success' ? 'Terraform 配置已成功执行。' : '执行过程中出现错误，请查看日志。'}
                  </span>
                }
                extra={
                  <Button
                    type="primary"
                    icon={<ReloadOutlined />}
                    onClick={handleReset}
                    size="large"
                    style={{ borderRadius: 8, background: 'linear-gradient(135deg, #2563eb, #6366f1)', border: 'none' }}
                  >
                    重新开始
                  </Button>
                }
              />
              <div style={{ marginTop: 16 }}>
                <div style={{ marginBottom: 8, fontSize: 13, color: '#64748b', fontWeight: 600, letterSpacing: 0.5 }}>
                  执行日志
                </div>
                <TerminalView logs={executionLogs} maxHeight={300} placeholder="暂无日志" />
              </div>
            </div>
          )}
        </Content>
      </Layout>
    </ConfigProvider>
  )
}

export default App