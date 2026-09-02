import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Card, Button, Typography, Spin, Alert, Space } from 'antd'
import { executeApply, executeDestroy } from '../services/api'
import type { OperationType, SSEMessage } from '../types'

const { Title, Text } = Typography

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
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [applyLogs])

  const handleMessage = useCallback((msg: SSEMessage) => {
    if (msg.log) {
      setApplyLogs((prev) => [...prev, msg.log])
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
  }, [])

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
    <Card>
      <Title level={5} style={{ marginBottom: 24 }}>
        {operationType === 'create' ? '执行 Terraform Apply' : operationType === 'update' ? '执行 Terraform Apply' : '执行 Terraform Destroy'}
      </Title>

      {/* 警告 */}
      {operationType === 'destroy' && (
        <Alert
          type="warning"
          message="销毁操作不可逆，请确认已备份重要数据"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 执行日志 */}
      <Card
        title="Terraform 执行日志"
        size="small"
        style={{ background: '#1e1e1e', color: '#d4d4d4' }}
      >
        <div
          ref={logRef}
          style={{
            fontFamily: 'monospace',
            fontSize: 12,
            maxHeight: 400,
            overflow: 'auto',
            minHeight: 150,
          }}
        >
          {applyLogs.length === 0 && !applying && (
            <Text style={{ color: '#888' }}>
              点击下方按钮开始执行
            </Text>
          )}
          {applyLogs.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
          {applying && (
            <div style={{ color: '#1677ff' }}>
              <Spin size="small" /> 正在执行 terraform {operationType === 'create' || operationType === 'update' ? 'apply' : 'destroy'}...
            </div>
          )}
        </div>
      </Card>

      {applyDone && (
        <Alert
          type="success"
          message={`${operationType === 'create' ? 'Create' : operationType === 'update' ? 'Update' : 'Destroy'} 执行完成`}
          showIcon
          style={{ marginTop: 16 }}
        />
      )}

      <Space style={{ marginTop: 16 }}>
        {!applyDone ? (
          <Button
            type="primary"
            size="large"
            danger={operationType === 'destroy'}
            onClick={startApply}
            loading={applying}
          >
            {applying
              ? `正在${operationType === 'create' ? '创建' : operationType === 'update' ? '更新' : '销毁'}...`
              : operationType === 'create' || operationType === 'update'
                ? '执行 Apply'
                : '执行 Destroy'}
          </Button>
        ) : (
          <Button type="primary" size="large" onClick={handleFinish}>
            查看结果
          </Button>
        )}
        <Button onClick={onBack} disabled={applying}>
          返回上一步
        </Button>
      </Space>
    </Card>
  )
}

export default ExecutionPanel