import React, { useState, useCallback } from 'react'
import { Card, Button, Typography, Alert, Space, message } from 'antd'
import { PlayCircleOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { executeAnsiblePlaybook } from '../services/api'
import TerminalView from './TerminalView'
import type { SSEMessage } from '../types'

const { Title, Text } = Typography

interface Props {
  playbookYaml: string
  inventoryYaml: string
  onComplete: () => void
  onBack: () => void
}

const cardStyle = {
  borderRadius: 14,
  border: '1px solid #e2e8f0',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

const AnsibleExecution: React.FC<Props> = ({ playbookYaml, inventoryYaml, onComplete, onBack }) => {
  const [executing, setExecuting] = useState(false)
  const [execLogs, setExecLogs] = useState<string[]>([])
  const [execDone, setExecDone] = useState(false)
  const [execSuccess, setExecSuccess] = useState(true)

  const handleMessage = useCallback((msg: SSEMessage) => {
    if (msg.log) {
      setExecLogs((prev) => [...prev, msg.log!])
    }
  }, [])

  const handleError = useCallback((err: Error) => {
    setExecuting(false)
    setExecSuccess(false)
    message.error(err.message)
  }, [])

  const handleComplete = useCallback(() => {
    setExecuting(false)
    setExecDone(true)
  }, [])

  const startExecute = useCallback(() => {
    setExecuting(true)
    setExecLogs([])
    setExecDone(false)
    setExecSuccess(true)
    executeAnsiblePlaybook(playbookYaml, inventoryYaml, handleMessage, handleError, handleComplete)
  }, [playbookYaml, inventoryYaml, handleMessage, handleError, handleComplete])

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
        loading={executing}
        loadingText="Ansible 执行中..."
        placeholder="点击下方按钮开始执行"
        maxHeight={450}
      />

      {execDone && (
        <Alert
          type={execSuccess ? 'success' : 'error'}
          message={execSuccess ? 'Playbook 执行完成' : '执行过程中出现错误'}
          showIcon
          icon={execSuccess ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
          style={{ marginTop: 16, borderRadius: 8 }}
        />
      )}

      <Space style={{ marginTop: 16 }}>
        {!execDone ? (
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
        ) : (
          <Button
            type="primary"
            size="large"
            onClick={onComplete}
            icon={<CheckCircleOutlined />}
            style={{ borderRadius: 8, minWidth: 140, background: 'linear-gradient(135deg, #2563eb, #6366f1)', border: 'none', color: '#fff' }}
          >
            完成
          </Button>
        )}
        <Button onClick={onBack} disabled={executing} style={{ borderRadius: 8 }}>
          返回
        </Button>
      </Space>
    </Card>
  )
}

export default AnsibleExecution