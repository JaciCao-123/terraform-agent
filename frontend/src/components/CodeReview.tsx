import React, { useState, useCallback } from 'react'
import { Card, Button, Typography, Alert, Space } from 'antd'
import { executePlan, executePlanDestroy } from '../services/api'
import TerminalView from './TerminalView'
import type { OperationType, SSEMessage } from '../types'

const { Title, Text } = Typography

interface Props {
  tfContent: string
  operationType: OperationType
  resourceType: string
  targetResourceAddress: string
  onPlanComplete: (logs: string[], fixedTf?: string) => void
  onError: (error: string) => void
  onBack: () => void
}

const CodeReview: React.FC<Props> = ({
  tfContent,
  operationType,
  resourceType,
  targetResourceAddress,
  onPlanComplete,
  onError,
  onBack,
}) => {
  const [planning, setPlanning] = useState(false)
  const [planLogs, setPlanLogs] = useState<string[]>([])
  const [planDone, setPlanDone] = useState(false)

  const handleMessage = useCallback((msg: SSEMessage) => {
    if (msg.log) {
      setPlanLogs((prev) => [...prev, msg.log!])
    }
  }, [])

  const handlePlanError = useCallback(
    (err: Error) => {
      setPlanning(false)
      onError(err.message)
    },
    [onError],
  )

  const handlePlanComplete = useCallback((fixedTf?: string) => {
    // Use a functional updater to get the latest planLogs
    setPlanLogs((prevLogs) => {
      setPlanning(false)
      setPlanDone(true)
      onPlanComplete(prevLogs, fixedTf)
      return prevLogs
    })
  }, [onPlanComplete])

  const startPlan = useCallback(() => {
    setPlanning(true)
    setPlanLogs([])
    setPlanDone(false)

    if (operationType === 'create' || operationType === 'update') {
      executePlan(tfContent, resourceType, handleMessage, handlePlanError, handlePlanComplete)
    } else {
      executePlanDestroy(targetResourceAddress, handleMessage, handlePlanError, handlePlanComplete)
    }
  }, [tfContent, resourceType, operationType, targetResourceAddress, handleMessage, handlePlanError, handlePlanComplete])

  const handleConfirm = () => {
    onPlanComplete(planLogs)
  }

  return (
    <Card
      style={{
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <Title level={4} style={{ marginBottom: 24 }}>
        {operationType === 'destroy' ? '审查 Terraform Destroy Plan' : '审查 Terraform Plan'}
      </Title>

      {/* Terraform 代码预览 */}
      <Card
        title={<span style={{ fontSize: 13, fontWeight: 600 }}>生成的 Terraform 配置</span>}
        size="small"
        style={{
          marginBottom: 16,
          background: '#f8fafc',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
        }}
      >
        <pre
          style={{
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 12,
            maxHeight: 200,
            overflow: 'auto',
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            color: '#1e293b',
          }}
        >
          {tfContent || '# 销毁模式：使用已有资源状态'}
        </pre>
      </Card>

      {/* Plan 日志 */}
      <div style={{ marginBottom: 8 }}>
        <Text strong style={{ fontSize: 13, color: '#374151' }}>
          Terraform Plan 输出
        </Text>
      </div>
      <TerminalView
        logs={planLogs}
        loading={planning}
        loadingText="正在执行 terraform plan..."
        placeholder="点击下方按钮执行 Plan"
      />

      {planDone && (
        <Alert
          type="success"
          message="Plan 执行完成，请确认后继续"
          showIcon
          style={{ marginTop: 16, borderRadius: 6 }}
        />
      )}

      <Space style={{ marginTop: 16 }}>
        {!planDone ? (
          <Button
            type="primary"
            size="large"
            onClick={startPlan}
            loading={planning}
            style={{ borderRadius: 6, minWidth: 140 }}
          >
            执行 Plan
          </Button>
        ) : (
          <Button
            type="primary"
            size="large"
            onClick={handleConfirm}
            style={{ borderRadius: 6, minWidth: 140 }}
          >
            确认，下一步
          </Button>
        )}
        <Button
          onClick={onBack}
          disabled={planning}
          style={{ borderRadius: 6 }}
        >
          返回上一步
        </Button>
      </Space>
    </Card>
  )
}

export default CodeReview