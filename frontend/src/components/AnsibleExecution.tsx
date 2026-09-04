import React, { useState, useCallback } from 'react'
import { Card, Button, Typography, Alert, Space, message, Modal } from 'antd'
import { PlayCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, RollbackOutlined, ReloadOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { executeAnsiblePlaybook, fixTf } from '../services/api'
import TerminalView from './TerminalView'
import type { SSEMessage } from '../types'

const { Title, Text } = Typography

interface Props {
  playbookYaml: string
  inventoryYaml: string
  onComplete: () => void
  onBack: () => void
  onRollback: () => void
}

const cardStyle = {
  borderRadius: 14,
  border: '1px solid #e2e8f0',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

const AnsibleExecution: React.FC<Props> = ({ playbookYaml, inventoryYaml, onComplete, onBack, onRollback }) => {
  const [executing, setExecuting] = useState(false)
  const [execLogs, setExecLogs] = useState<string[]>([])
  const [execDone, setExecDone] = useState(false)
  const [execFailed, setExecFailed] = useState(false)
  const [execSuccess, setExecSuccess] = useState(false)
  const [fixing, setFixing] = useState(false)

  const handleMessage = useCallback((msg: SSEMessage) => {
    if (msg.log) {
      setExecLogs((prev) => [...prev, msg.log!])
    }
  }, [])

  const handleError = useCallback((err: Error) => {
    setExecuting(false)
    setExecFailed(true)
    message.error(err.message)
  }, [])

  const handleComplete = useCallback(() => {
    // 根据日志判断是否成功
    const hasError = execLogs.some(line => 
      line.includes('FAILED') || 
      line.includes('UNREACHABLE') || 
      line.includes('fatal:') ||
      line.includes('ERROR')
    )
    setExecuting(false)
    setExecDone(true)
    if (hasError) {
      setExecFailed(true)
      setExecSuccess(false)
    } else {
      setExecFailed(false)
      setExecSuccess(true)
    }
  }, [execLogs])

  const handleFixAndRetry = async () => {
    setFixing(true)
    const logs = execLogs.join('\n')
    try {
      const result = await fixTf(playbookYaml, logs)
      // 这里 playbookYaml 是固定的，修复后重新启动执行
      message.success('LLM 修复完成，正在重新执行...')
      setExecLogs([])
      setExecDone(false)
      setExecFailed(false)
      setExecuting(true)
      executeAnsiblePlaybook(result.tf_content, inventoryYaml, handleMessage, handleError, handleComplete)
    } catch (err: unknown) {
      message.error('修复失败，请手动修改配置后重试')
    } finally {
      setFixing(false)
    }
  }

  const startExecute = useCallback(() => {
    setExecuting(true)
    setExecLogs([])
    setExecDone(false)
    setExecFailed(false)
    setExecSuccess(false)
    executeAnsiblePlaybook(playbookYaml, inventoryYaml, handleMessage, handleError, handleComplete)
  }, [playbookYaml, inventoryYaml, handleMessage, handleError, handleComplete])

  const handleRollback = () => {
    Modal.confirm({
      title: '确认回滚？',
      icon: <ExclamationCircleOutlined />,
      content: '回滚操作将终止当前 Ansible 执行，并返回到 Playbook 编辑界面。此操作不撤销目标机器上已执行的变更。',
      okText: '确认回滚',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        onRollback()
      },
    })
  }

  return (
    <Card style={cardStyle}>
      <Title level={4} style={{ marginBottom: 24, color: '#1e293b', fontSize: 18 }}>
        <PlayCircleOutlined style={{ marginRight: 8, color: '#059669' }} />
        执行 Ansible Playbook
      </Title>

      <Alert
        message="Playbook 将通过 ansible-runner 容器在目标机器上执行，请确保 SSH 连接正常。"
        type="info"
        showIcon
        style={{ marginBottom: 16, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}
      />

      <div style={{ marginBottom: 8 }}>
        <Text strong style={{ fontSize: 13, color: '#64748b' }}>
          执行日志
        </Text>
      </div>
      <TerminalView
        logs={execLogs}
        loading={executing || fixing}
        loadingText={fixing ? 'LLM 正在修复 Playbook...' : 'Ansible 执行中...'}
        placeholder="点击下方按钮开始执行"
        maxHeight={450}
      />

      {/* 执行成功 */}
      {execDone && !execFailed && (
        <Alert
          type="success"
          icon={<CheckCircleOutlined />}
          message="Playbook 执行完成"
          showIcon
          style={{ marginTop: 16, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}
        />
      )}

      {/* 执行失败 */}
      {execFailed && (
        <Alert
          type="error"
          icon={<CloseCircleOutlined />}
          message="执行失败"
          description="Ansible 执行过程中出现错误，请选择以下操作："
          showIcon
          style={{ marginTop: 16, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca' }}
        />
      )}

      <Space style={{ marginTop: 16 }} wrap>
        {!execDone && !execFailed ? (
          <Button
            type="primary"
            size="large"
            onClick={startExecute}
            loading={executing}
            icon={<PlayCircleOutlined />}
            style={{ borderRadius: 8, minWidth: 140, background: 'linear-gradient(135deg, #059669, #10b981)', border: 'none', color: '#fff' }}
          >
            开始执行
          </Button>
        ) : execFailed ? (
          <>
            <Button
              type="primary"
              size="large"
              icon={<ReloadOutlined />}
              onClick={handleFixAndRetry}
              loading={fixing}
              style={{ borderRadius: 8, minWidth: 140, background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', color: '#fff' }}
            >
              {fixing ? '修复中...' : '修复重试'}
            </Button>
            <Button
              size="large"
              icon={<RollbackOutlined />}
              onClick={handleRollback}
              danger
              style={{ borderRadius: 8, minWidth: 120 }}
            >
              回滚
            </Button>
            <Button
              size="large"
              onClick={startExecute}
              disabled={executing}
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
              onClick={onComplete}
              icon={<CheckCircleOutlined />}
              style={{ borderRadius: 8, minWidth: 140, background: 'linear-gradient(135deg, #2563eb, #6366f1)', border: 'none', color: '#fff' }}
            >
              完成
            </Button>
          </>
        )}
        <Button onClick={onBack} disabled={executing || fixing} style={{ borderRadius: 8 }}>
          返回
        </Button>
      </Space>
    </Card>
  )
}

export default AnsibleExecution