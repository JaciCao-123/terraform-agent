import React, { useState, useCallback } from 'react'
import { Card, Button, Typography, Alert, Space, Modal, message } from 'antd'
import { RollbackOutlined, ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, ThunderboltOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { executeApply, executeDestroy, fixTf } from '../services/api'
import TerminalView from './TerminalView'
import type { OperationType, SSEMessage, CloudProvider } from '../types'

const { Title } = Typography

interface Props {
  tfContent: string
  operationType: OperationType
  resourceType: string
  targetResourceAddress: string
  provider: CloudProvider
  onApplyComplete: (logs: string[]) => void
  onError: (error: string) => void
  onBack: () => void
  onRollback: () => void
}

const cardStyle = {
  borderRadius: 14,
  border: '1px solid #e2e8f0',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

const ExecutionPanel: React.FC<Props> = ({
  tfContent,
  operationType,
  resourceType,
  targetResourceAddress,
  provider,
  onApplyComplete,
  onError,
  onBack,
  onRollback,
}) => {
  const [applying, setApplying] = useState(false)
  const [applyLogs, setApplyLogs] = useState<string[]>([])
  const [applyDone, setApplyDone] = useState(false)
  const [applyFailed, setApplyFailed] = useState(false)
  const [fixing, setFixing] = useState(false)
  const [rollingBack, setRollingBack] = useState(false)

  const handleMessage = useCallback((msg: SSEMessage) => {
    if (msg.log) setApplyLogs((prev) => [...prev, msg.log!])
  }, [])

  const handleApplyError = useCallback((err: Error) => {
    setApplying(false)
    setApplyFailed(true)
    onError(err.message)
  }, [onError])

  const handleApplyComplete = useCallback(() => {
    setApplying(false)
    setApplyDone(true)
    setApplyFailed(false)
    onApplyComplete(applyLogs)
  }, [applyLogs, onApplyComplete])

  const startApply = useCallback(() => {
    setApplying(true)
    setApplyLogs([])
    setApplyDone(false)
    setApplyFailed(false)
    if (operationType === 'create' || operationType === 'update') {
      executeApply(tfContent, resourceType, '', handleMessage, handleApplyError, handleApplyComplete, provider)
    } else {
      executeDestroy(targetResourceAddress, handleMessage, handleApplyError, handleApplyComplete, provider)
    }
  }, [tfContent, resourceType, operationType, targetResourceAddress, provider, handleMessage, handleApplyError, handleApplyComplete])

  const handleFixAndRetry = async () => {
    setFixing(true)
    const logs = applyLogs.join('\n')
    try {
      const result = await fixTf(tfContent, logs)
      message.success('LLM 修复完成，正在重新执行...')
      // 重新执行
      setApplyLogs([])
      setApplyDone(false)
      setApplyFailed(false)
      setApplying(true)
      executeApply(result.tf_content, resourceType, '', handleMessage, handleApplyError, handleApplyComplete, provider)
    } catch (err: unknown) {
      message.error('修复失败，请手动修改配置后重试')
    } finally {
      setFixing(false)
    }
  }

  const handleRollback = () => {
    Modal.confirm({
      title: '确认回滚？',
      icon: <ExclamationCircleOutlined />,
      content: '回滚操作将销毁刚创建的资源。此操作不可逆，请确认。',
      okText: '确认回滚',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        setRollingBack(true)
        setApplyLogs((prev) => [...prev, '\n--- 开始回滚：销毁资源 ---\n'])
        // 使用 destroy 回滚
        executeDestroy(
          targetResourceAddress || `${resourceType}.main`,
          (msg) => {
            if (msg.log) setApplyLogs((prev) => [...prev, msg.log!])
          },
          (err) => {
            setRollingBack(false)
            message.error('回滚失败: ' + err.message)
          },
          () => {
            setRollingBack(false)
            setApplyDone(false)
            setApplyFailed(false)
            setApplyLogs((prev) => [...prev, '\n--- 回滚完成 ---\n'])
            message.success('回滚完成，资源已销毁')
            onRollback()
          },
          provider,
        )
      },
    })
  }

  const handleFinish = () => onApplyComplete(applyLogs)

  return (
    <Card style={cardStyle}>
      <Title level={4} style={{ marginBottom: 24, color: '#1e293b', fontSize: 18 }}>
        {operationType === 'destroy' ? '执行 Terraform Destroy' : '执行 Terraform Apply'}
      </Title>

      {operationType === 'destroy' && (
        <Alert
          type="warning"
          message="销毁操作不可逆，请确认已备份重要数据"
          showIcon
          style={{ marginBottom: 16, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca' }}
        />
      )}

      <div style={{ marginBottom: 8 }}>
        <strong style={{ fontSize: 13, color: '#64748b' }}>
          {operationType === 'destroy' ? 'Terraform Destroy' : 'Terraform Apply'} 执行日志
        </strong>
      </div>
      <TerminalView
        logs={applyLogs}
        loading={applying || fixing || rollingBack}
        loadingText={fixing ? 'LLM 正在修复配置...' : rollingBack ? '正在回滚...' : `正在执行 terraform ${operationType}...`}
        placeholder="点击下方按钮开始执行"
        maxHeight={450}
      />

      {/* 执行成功 */}
      {applyDone && !applyFailed && (
        <Alert
          type="success"
          icon={<CheckCircleOutlined />}
          message={`${operationType === 'create' ? '创建' : operationType === 'update' ? '更新' : '销毁'}执行完成`}
          showIcon
          style={{ marginTop: 16, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}
        />
      )}

      {/* 执行失败 */}
      {applyFailed && (
        <Alert
          type="error"
          icon={<CloseCircleOutlined />}
          message="执行失败"
          description="Terraform 执行过程中出现错误，请选择以下操作："
          showIcon
          style={{ marginTop: 16, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca' }}
        />
      )}

      <Space style={{ marginTop: 16 }} wrap>
        {!applyDone && !applyFailed ? (
          <Button
            type="primary"
            size="large"
            onClick={startApply}
            loading={applying}
            icon={<ThunderboltOutlined />}
            style={{ borderRadius: 8, minWidth: 140, background: 'linear-gradient(135deg, #2563eb, #6366f1)', border: 'none', color: '#fff' }}
          >
            {operationType === 'destroy' ? '开始执行 Destroy' : '开始执行 Apply'}
          </Button>
        ) : applyFailed ? (
          <>
            <Button
              type="primary"
              size="large"
              icon={<ReloadOutlined />}
              onClick={handleFixAndRetry}
              loading={fixing}
              style={{ borderRadius: 8, minWidth: 140, background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', color: '#fff' }}
            >
              {fixing ? 'LLM 修复中...' : '修复重试'}
            </Button>
            <Button
              size="large"
              icon={<RollbackOutlined />}
              onClick={handleRollback}
              loading={rollingBack}
              danger
              style={{ borderRadius: 8, minWidth: 120 }}
            >
              回滚
            </Button>
            <Button
              size="large"
              onClick={startApply}
              disabled={applying}
              style={{ borderRadius: 8 }}
            >
              再次尝试
            </Button>
          </>
        ) : (
          <>
            <Button
              type="primary"
              size="large"
              onClick={handleFinish}
              icon={<CheckCircleOutlined />}
              style={{ borderRadius: 8, minWidth: 140, background: 'linear-gradient(135deg, #2563eb, #6366f1)', border: 'none', color: '#fff' }}
            >
              查看结果
            </Button>
            <Button
              size="large"
              icon={<RollbackOutlined />}
              onClick={handleRollback}
              loading={rollingBack}
              danger
              style={{ borderRadius: 8, minWidth: 120 }}
            >
              回滚
            </Button>
          </>
        )}
        <Button onClick={onBack} disabled={applying || fixing || rollingBack} style={{ borderRadius: 8 }}>
          返回上一步
        </Button>
      </Space>
    </Card>
  )
}

export default ExecutionPanel