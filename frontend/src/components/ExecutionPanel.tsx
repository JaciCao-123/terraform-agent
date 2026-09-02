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
    if (msg.log) {
      setApplyLogs((prev) => [...prev, msg.log!])
    }
  }, [])

  const handleApplyError = useCallback(
    (err: Error) => {
      setApplying(false)
      onError(err.message)
    },
    [onError],
  )

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

  const handleFinish = () => {
    onApplyComplete(applyLogs)
  }

  return (
    <Card
      style={{
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <Title level={4} style={{ marginBottom: 24 }}>
        {operationType === 'create' ? '执行 Terraform Apply' : operationType === 'update' ? '执行 Terraform Apply' : '执行 Terraform Destroy'}
      </Title>

      {/* 警告 */}
      {operationType === 'destroy' && (
        <Alert
          type="warning"
          message="销毁操作不可逆，请确认已备份重要数据"
          showIcon
          style={{ marginBottom: 16, borderRadius: 6 }}
        />
      )}

      {/* 执行日志 */}
      <div style={{ marginBottom: 8 }}>
        <strong style={{ fontSize: 13, color: '#374151' }}>
          {operationType === 'destroy' ? 'Terraform Destroy' : 'Terraform Apply'} 执行日志
        </strong>
      </div>
      <TerminalView
        logs={applyLogs}
        loading={applying}
        loadingText={`正在执行 terraform ${operationType}...`}
        placeholder={`点击下方按钮开始执行`}
        maxHeight={450}
      />

      {applyDone && (
        <Alert
          type="success"
          message={`${operationType === 'create' ? 'Create' : operationType === 'update' ? 'Update' : 'Destroy'} 执行完成`}
          showIcon
          style={{ marginTop: 16, borderRadius: 6 }}
        />
      )}

      <Space style={{ marginTop: 16 }}>
        {!applyDone ? (
          <Button
            type="primary"
            size="large"
            onClick={startApply}
            loading={applying}
            style={{ borderRadius: 6, minWidth: 140 }}
          >
            {operationType === 'destroy' ? '开始执行 Destroy' : '开始执行 Apply'}
          </Button>
        ) : (
          <Button
            type="primary"
            size="large"
            onClick={handleFinish}
            style={{ borderRadius: 6, minWidth: 140 }}
          >
            查看结果
          </Button>
        )}
        <Button
          onClick={onBack}
          disabled={applying}
          style={{ borderRadius: 6 }}
        >
          返回上一步
        </Button>
      </Space>
    </Card>
  )
}

export default ExecutionPanel