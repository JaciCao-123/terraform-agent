import React, { useState, useCallback } from 'react'
import { Layout, Typography, Steps, message, ConfigProvider, theme, Button, Result } from 'antd'
import { CloudServerOutlined, ReloadOutlined, ImportOutlined, ThunderboltOutlined } from '@ant-design/icons'
import ResourceSelector from './components/ResourceSelector'
import ConfigDialog from './components/ConfigDialog'
import CodeReview from './components/CodeReview'
import ExecutionPanel from './components/ExecutionPanel'
import TerminalView from './components/TerminalView'
import AnsiblePlaybook from './components/AnsiblePlaybook'
import AnsibleExecution from './components/AnsibleExecution'
import AnsibleResourceSelect from './components/AnsibleResourceSelect'
import ResourceImportDialog from './components/ResourceImportDialog'
import type { OperationType, ResourceSchema, CloudProvider } from './types'

const { Header, Content } = Layout

type StepStatus = 'wait' | 'process' | 'finish' | 'error'

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0)
  const [stepStatus, setStepStatus] = useState<StepStatus[]>(['process', 'wait', 'wait', 'wait', 'wait'])

  const [cloudProvider, setCloudProvider] = useState<CloudProvider>('alicloud')
  const [operationType, setOperationType] = useState<OperationType>('create')
  const [resourceType, setResourceType] = useState<string | null>(null)
  const [resourceSchema, setResourceSchema] = useState<ResourceSchema | null>(null)
  const [tfContent, setTfContent] = useState('')
  const [resourceParams, setResourceParams] = useState<Record<string, unknown>>({})
  const [executionLogs, setExecutionLogs] = useState<string[]>([])
  const [executionStatus, setExecutionStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [targetResourceAddress, setTargetResourceAddress] = useState<string>('')
  const [targetResourceId, setTargetResourceId] = useState<string>('')

  // Ansible 流程状态
  const [showAnsible, setShowAnsible] = useState(false)
  const [ansibleStep, setAnsibleStep] = useState<'playbook' | 'execute'>('playbook')
  const [ansiblePlaybookYaml, setAnsiblePlaybookYaml] = useState('')
  const [ansibleInventoryYaml, setAnsibleInventoryYaml] = useState('')
  const [resourceInfo, setResourceInfo] = useState<Record<string, unknown>>({})

  // 存量导入对话框
  const [importDialogOpen, setImportDialogOpen] = useState(false)

  // Ansible 独立入口
  const [showAnsibleStandalone, setShowAnsibleStandalone] = useState(false)
  const [ansibleStandaloneStep, setAnsibleStandaloneStep] = useState<'select' | 'playbook' | 'execute'>('select')
  const [ansibleStandaloneInfo, setAnsibleStandaloneInfo] = useState<Record<string, unknown>>({})

  const updateStep = useCallback((step: number, status: StepStatus) => {
    setStepStatus((prev) => {
      const next = [...prev]
      next[step] = status
      return next
    })
  }, [])

  const handleResourceSelected = useCallback(
    (
      op: OperationType,
      resType: string,
      schema: ResourceSchema,
      provider: CloudProvider,
      targetAddress?: string,
      resourceId?: string,
    ) => {
      setCloudProvider(provider)
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
    setCloudProvider('alicloud')
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
        ]),
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
            background: '#1e293b',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            height: 56,
            lineHeight: '56px',
            cursor: 'pointer',
            position: 'sticky',
            top: 0,
            zIndex: 100,
            boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
          }}
          onClick={handleReset}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #2563eb, #6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 10,
              flexShrink: 0,
            }}
          >
            <CloudServerOutlined style={{ fontSize: 16, color: '#ffffff' }} />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 700, lineHeight: 1.3, whiteSpace: 'nowrap' }}>
              Terraform Agent
            </div>
            <div style={{ fontSize: 10, color: '#93c5fd', lineHeight: 1.2 }}>多云资源管理平台</div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <Button
              type="text"
              icon={<ThunderboltOutlined />}
              onClick={() => {
                setShowAnsibleStandalone(true)
                setAnsibleStandaloneStep('select')
              }}
              style={{ color: '#93c5fd', fontSize: 13 }}
            >
              Playbook
            </Button>
          </div>
        </Header>
        <Content style={{ padding: '16px 12px 24px 12px', maxWidth: 800, margin: '0 auto', width: '100%' }}>
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
            <Steps current={currentStep} items={stepItems} style={{ gap: 0 }} />
          </div>

          {currentStep === 0 && (
            <>
              <ResourceSelector
                operationType={operationType}
                onOperationTypeChange={setOperationType}
                onResourceSelected={handleResourceSelected}
              />
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <Button
                  type="dashed"
                  icon={<ImportOutlined />}
                  onClick={() => setImportDialogOpen(true)}
                  size="large"
                  style={{ borderRadius: 8, borderColor: '#2563eb', color: '#2563eb' }}
                >
                  导入存量资源
                </Button>
              </div>
            </>
          )}

          {currentStep === 1 && resourceSchema && (
            <ConfigDialog
              operationType={operationType}
              resourceType={resourceType}
              resourceId={targetResourceId}
              provider={cloudProvider}
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
              provider={cloudProvider}
              resourceType={resourceType || ''}
              targetResourceAddress={targetResourceAddress}
              onPlanComplete={handlePlanComplete}
              onError={(err: string) => handleError(2, err)}
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
              provider={cloudProvider}
              resourceType={resourceType || ''}
              targetResourceAddress={targetResourceAddress}
              onApplyComplete={handleApplyComplete}
              onError={(err: string) => handleError(3, err)}
              onBack={() => {
                updateStep(2, 'process')
                updateStep(3, 'wait')
                setCurrentStep(2)
              }}
            />
          )}

          {currentStep === 4 && !showAnsible && (
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
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    {executionStatus === 'success' && (operationType === 'create' || operationType === 'update') && (
                      <Button
                        type="primary"
                        icon={<ThunderboltOutlined />}
                        onClick={() => {
                          setResourceInfo({
                            name: resourceType || 'target',
                            host: '',
                            public_ip: '',
                          })
                          setShowAnsible(true)
                          setAnsibleStep('playbook')
                        }}
                        size="large"
                        style={{ borderRadius: 8, background: 'linear-gradient(135deg, #059669, #10b981)', border: 'none', color: '#fff' }}
                      >
                        使用 Ansible 配置
                      </Button>
                    )}
                    <Button
                      type="primary"
                      icon={<ReloadOutlined />}
                      onClick={handleReset}
                      size="large"
                      style={{ borderRadius: 8, background: 'linear-gradient(135deg, #2563eb, #6366f1)', border: 'none', color: '#fff' }}
                    >
                      重新开始
                    </Button>
                  </div>
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

          {/* Ansible Playbook 流程 */}
          {showAnsible && ansibleStep === 'playbook' && (
            <AnsiblePlaybook
              provider={cloudProvider}
              resourceInfo={resourceInfo}
              resourceType={resourceType || ''}
              resourceAddress={targetResourceAddress}
              resourceName={resourceType || ''}
              onExecute={(playbookYaml, inventoryYaml) => {
                setAnsiblePlaybookYaml(playbookYaml)
                setAnsibleInventoryYaml(inventoryYaml)
                setAnsibleStep('execute')
              }}
              onBack={() => setShowAnsible(false)}
            />
          )}

          {showAnsible && ansibleStep === 'execute' && (
            <AnsibleExecution
              playbookYaml={ansiblePlaybookYaml}
              inventoryYaml={ansibleInventoryYaml}
              onComplete={() => {
                setShowAnsible(false)
                message.success('Ansible 配置完成！')
              }}
              onBack={() => setAnsibleStep('playbook')}
            />
          )}

          {/* 存量资源导入对话框 */}
          <ResourceImportDialog
            open={importDialogOpen}
            onClose={() => setImportDialogOpen(false)}
          />

          {/* Ansible 独立入口 */}
          {showAnsibleStandalone && (
            <>
              {ansibleStandaloneStep === 'select' && (
                <AnsibleResourceSelect
                  onSelect={(info) => {
                    setAnsibleStandaloneInfo(info as unknown as Record<string, unknown>)
                    setAnsibleStandaloneStep('playbook')
                  }}
                  onBack={() => {
                    setShowAnsibleStandalone(false)
                    setAnsibleStandaloneStep('select')
                  }}
                />
              )}
              {ansibleStandaloneStep === 'playbook' && (
                <AnsiblePlaybook
                  provider={ansibleStandaloneInfo.provider as CloudProvider}
                  resourceInfo={ansibleStandaloneInfo}
                  resourceType={ansibleStandaloneInfo.resourceType as string}
                  resourceAddress={ansibleStandaloneInfo.resourceAddress as string}
                  resourceName={ansibleStandaloneInfo.name as string}
                  onExecute={(playbookYaml, inventoryYaml) => {
                    setAnsiblePlaybookYaml(playbookYaml)
                    setAnsibleInventoryYaml(inventoryYaml)
                    setAnsibleStandaloneStep('execute')
                  }}
                  onBack={() => setAnsibleStandaloneStep('select')}
                />
              )}
              {ansibleStandaloneStep === 'execute' && (
                <AnsibleExecution
                  playbookYaml={ansiblePlaybookYaml}
                  inventoryYaml={ansibleInventoryYaml}
                  onComplete={() => {
                    setShowAnsibleStandalone(false)
                    setAnsibleStandaloneStep('select')
                    message.success('Ansible 配置完成！')
                  }}
                  onBack={() => setAnsibleStandaloneStep('playbook')}
                />
              )}
            </>
          )}
        </Content>
      </Layout>
    </ConfigProvider>
  )
}

export default App