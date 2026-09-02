import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Card, Button, Typography, Spin, Alert, Space } from 'antd'
import { executePlan, executePlanDestroy } from '../services/api'
import type { OperationType, SSEMessage } from '../types'

const { Title, Text } = Typography

interface Props {
  tfContent: string
  operationType: OperationType
  resourceType: string
  targetResourceAddress: string
  onPlanComplete: (logs: string[]) => void
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
  const logRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [planLogs])

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

  const handlePlanComplete = useCallback(() => {
    setPlanning(false)
    setPlanDone(true)
  }, [])

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
    <Card>
      <Title level={5} style={{ marginBottom: 24 }}>
        审查 Terraform Plan
      </Title>

      {/* Terraform 代码预览 */}
      <Card
        title="生成的 Terraform 配置"
        size="small"
        style={{ marginBottom: 16, background: '#f6f8fa' }}
      >
        <pre
          style={{
            fontFamily: 'monospace',
            fontSize: 12,
            maxHeight: 200,
            overflow: 'auto',
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {tfContent || '# 销毁模式：使用已有资源状态'}
        </pre>
      </Card>

      {/* Plan 日志 */}
      <Card
        title="Terraform Plan 输出"
        size="small"
        style={{ background: '#1e1e1e', color: '#d4d4d4' }}
      >
        <div
          ref={logRef}
          style={{
            fontFamily: 'monospace',
            fontSize: 12,
            maxHeight: 300,
            overflow: 'auto',
            minHeight: 100,
          }}
        >
          {planLogs.length === 0 && !planning && (
            <Text style={{ color: '#888' }}>
              点击下方"执行 Plan"查看资源变更预览
            </Text>
          )}
          {planLogs.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
          {planning && (
            <div style={{ color: '#1677ff' }}>
              <Spin size="small" /> 正在执行 terraform plan...
            </div>
          )}
        </div>
      </Card>

      {planDone && (
        <Alert
          type="success"
          message="Plan 执行完成，请确认后执行 Apply"
          showIcon
          style={{ marginTop: 16 }}
        />
      )}

      <Space style={{ marginTop: 16 }}>
        {!planDone ? (
          <Button type="primary" size="large" onClick={startPlan} loading={planning}>
            执行 Plan
          </Button>
        ) : (
          <Button type="primary" size="large" onClick={handleConfirm}>
            确认，下一步 Apply
          </Button>
        )}
        <Button onClick={onBack} disabled={planning}>
          返回上一步
        </Button>
      </Space>
    </Card>
  )
}

export default CodeReview