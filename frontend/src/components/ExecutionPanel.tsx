import React, { useState, useCallback } from 'react'
import { Card, Button, Typography, Alert, Space } from 'antd'
import { executeApply, executeDestroy } from '../services/api'
import TerminalView from './TerminalView'
import type { OperationType, SSEMessage } from '../types'

const { Title } = Typography

interface Props {
  tfContent: string
  operationType: OperationType
  resourceType: string
  targetResourceAddress: string
  onApplyComplete: (logs: string[]) => void
  onError: (error: string) => void
  onBack: () => void
}

const cardStyle = {
  borderRadius: 14,
  border: '1px solid #334155',
  background: 'linear-gradient(135deg, #1e293b 0%, #1a2332 100%)',
}

const ExecutionPanel: React.FC<Props> = ({
  tfContent,
  operationType,
  resourceType,
  targetResourceAddress,
  onApplyComplete,
  onError,
  onBack,
}) => {
  const [applying, setApplying] = useState(false)
  const [applyLogs, setApplyLogs] = useState<string[]>([])
  const [applyDone, setApplyDone] = useState(false)

  const handleMessage = useCallback((msg: SSEMessage) => {
    if (msg.log) setApplyLogs((prev) => [...prev, msg.log!])
  }, [])

  const handleApplyError = useCallback((err: Error) => {
    setApplying(false)
    onError(err.message)
  }, [onError])

  const handleApplyComplete = useCallback(() => {
    setApplying(false)
    setApplyDone(true)
    onApplyComplete(applyLogs)
  }, [applyLogs, onApplyComplete])

  const startApply = useCallback(() => {
    setApplying(true)
    setApplyLogs([])
    setApplyDone(false)
    if (operationType === 'create' || operationType === 'update') {
      executeApply(tfContent, resourceType, '', handleMessage, handleApplyError, handleApplyComplete)
    } else {
      executeDestroy(targetResourceAddress, handleMessage, handleApplyError, handleApplyComplete)
    }
  }, [tfContent, resourceType, operationType, targetResourceAddress, handleMessage, handleApplyError, handleApplyComplete])

  const handleFinish = () => onApplyComplete(applyLogs)

  return (
    <Card style={cardStyle}>
      <Title level={4} style={{ marginBottom: 24, color: '#f1f5f9', fontSize: 18 }}>
        {operationType === 'destroy' ? '执行 Terraform Destroy' : '执行 Terraform Apply'}
      </Title>

      {operationType === 'destroy' && (
        <Alert
          type="warning"
          message={<span style={{ color: '#fbbf24' }}>销毁操作不可逆，请确认已备份重要数据</span>}
          showIcon
          style={{ marginBottom: 16, borderRadius: 8, background: '#1f1313', border: '1px solid #7f1d1d' }}
        />
      )}

      <div style={{ marginBottom: 8 }}>
        <strong style={{ fontSize: 13, color: '#94a3b8' }}>
          {operationType === 'destroy' ? 'Terraform Destroy' : 'Terraform Apply'} 执行日志
        </strong>
      </div>
      <TerminalView
        logs={applyLogs}
        loading={applying}
        loadingText={`正在执行 terraform ${operationType}...`}
        placeholder="点击下方按钮开始执行"
        maxHeight={450}
      />

      {applyDone && (
        <Alert
          type="success"
          message={<span style={{ color: '#86efac' }}>{`${operationType === 'create' ? 'Create' : operationType === 'update' ? 'Update' : 'Destroy'} 执行完成`}</span>}
          showIcon
          style={{ marginTop: 16, borderRadius: 8, background: '#022c22', border: '1px solid #065f46' }}
        />
      )}

      <Space style={{ marginTop: 16 }}>
        {!applyDone ? (
          <Button
            type="primary"
            size="large"
            onClick={startApply}
            loading={applying}
            style={{ borderRadius: 8, minWidth: 140, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none' }}
          >
            {operationType === 'destroy' ? '开始执行 Destroy' : '开始执行 Apply'}
          </Button>
        ) : (
          <Button
            type="primary"
            size="large"
            onClick={handleFinish}
            style={{ borderRadius: 8, minWidth: 140, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none' }}
          >
            查看结果
          </Button>
        )}
        <Button onClick={onBack} disabled={applying} style={{ borderRadius: 8 }}>
          返回上一步
        </Button>
      </Space>
    </Card>
  )
}

export default ExecutionPanel