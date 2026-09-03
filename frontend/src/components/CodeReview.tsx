import React, { useState, useCallback } from 'react'
import { Card, Button, Typography, Alert, Space, Tag, Tooltip, Input } from 'antd'
import { EditOutlined, EyeOutlined, SaveOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { executePlan, executePlanDestroy } from '../services/api'
import TerminalView from './TerminalView'
import type { OperationType, SSEMessage, CloudProvider } from '../types'

const { Title, Text } = Typography
const { TextArea } = Input

interface Props {
  tfContent: string
  operationType: OperationType
  resourceType: string
  targetResourceAddress: string
  provider: CloudProvider
  onPlanComplete: (logs: string[], finalTf?: string) => void
  onError: (error: string) => void
  onBack: () => void
}

const cardStyle = {
  borderRadius: 14,
  border: '1px solid #e2e8f0',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

const CodeReview: React.FC<Props> = ({
  tfContent,
  operationType,
  resourceType,
  targetResourceAddress,
  provider,
  onPlanComplete,
  onError,
  onBack,
}) => {
  const [editableContent, setEditableContent] = useState(tfContent)
  const [isEditing, setIsEditing] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [planLogs, setPlanLogs] = useState<string[]>([])
  const [planDone, setPlanDone] = useState(false)

  // 当 tfContent prop 变化时同步（如自动修复后）
  React.useEffect(() => {
    if (!hasUnsavedChanges) {
      setEditableContent(tfContent)
    }
  }, [tfContent, hasUnsavedChanges])

  const handleMessage = useCallback((msg: SSEMessage) => {
    if (msg.log) setPlanLogs((prev) => [...prev, msg.log!])
  }, [])

  const handlePlanError = useCallback((err: Error) => {
    setPlanning(false)
    onError(err.message)
  }, [onError])

  const handlePlanComplete = useCallback((fixedTf?: string) => {
    setPlanLogs((prevLogs) => {
      setPlanning(false)
      setPlanDone(true)
      // 如果有自动修复的代码，更新编辑区
      if (fixedTf) {
        setEditableContent(fixedTf)
        setHasUnsavedChanges(false)
      }
      onPlanComplete(prevLogs, fixedTf || editableContent)
      return prevLogs
    })
  }, [onPlanComplete, editableContent])

  const startPlan = useCallback(() => {
    setPlanning(true)
    setPlanLogs([])
    setPlanDone(false)
    if (operationType === 'create' || operationType === 'update') {
      executePlan(editableContent, resourceType, handleMessage, handlePlanError, handlePlanComplete, provider)
    } else {
      executePlanDestroy(targetResourceAddress, handleMessage, handlePlanError, handlePlanComplete, provider)
    }
  }, [editableContent, resourceType, operationType, targetResourceAddress, provider, handleMessage, handlePlanError, handlePlanComplete])

  const handleConfirm = () => onPlanComplete(planLogs, editableContent)

  const handleEditToggle = () => {
    if (isEditing) {
      // 保存编辑
      setHasUnsavedChanges(false)
    }
    setIsEditing(!isEditing)
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditableContent(e.target.value)
    setHasUnsavedChanges(true)
  }

  return (
    <Card style={cardStyle}>
      <Title level={4} style={{ marginBottom: 24, color: '#1e293b', fontSize: 18 }}>
        {operationType === 'destroy' ? '审查 Terraform Destroy Plan' : '审查 Terraform Plan'}
      </Title>

      {/* 代码编辑区 */}
      <Card
        title={
          <Space>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Terraform 配置</span>
            {hasUnsavedChanges && <Tag color="orange" style={{ fontSize: 10, lineHeight: '16px' }}>未保存</Tag>}
          </Space>
        }
        extra={
          <Space size={4}>
            {isEditing ? (
              <Tooltip title="保存修改">
                <Button
                  size="small"
                  icon={<SaveOutlined />}
                  onClick={handleEditToggle}
                  type="primary"
                  style={{ borderRadius: 6, fontSize: 12 }}
                >
                  保存
                </Button>
              </Tooltip>
            ) : (
              <Tooltip title="编辑 Terraform 代码">
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={handleEditToggle}
                  style={{ borderRadius: 6, fontSize: 12 }}
                >
                  编辑
                </Button>
              </Tooltip>
            )}
            {isEditing && (
              <Tooltip title="取消编辑">
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => {
                    setEditableContent(tfContent)
                    setHasUnsavedChanges(false)
                    setIsEditing(false)
                  }}
                  style={{ borderRadius: 6, fontSize: 12 }}
                >
                  取消
                </Button>
              </Tooltip>
            )}
          </Space>
        }
        size="small"
        style={{ marginBottom: 16, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc' }}
      >
        {isEditing ? (
          <TextArea
            value={editableContent}
            onChange={handleTextChange}
            rows={12}
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 12,
              lineHeight: 1.6,
              background: '#1e293b',
              color: '#e2e8f0',
              border: '1px solid #334155',
              borderRadius: 6,
              padding: 12,
            }}
          />
        ) : (
          <pre
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 12,
              maxHeight: 300,
              overflow: 'auto',
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              color: '#1e293b',
              background: hasUnsavedChanges ? '#fef3c7' : '#f1f5f9',
              padding: 12,
              borderRadius: 6,
              border: hasUnsavedChanges ? '1px solid #f59e0b' : '1px solid #e2e8f0',
            }}
          >
            {editableContent || '# 销毁模式：使用已有资源状态'}
          </pre>
        )}
      </Card>

      {/* Plan 日志 */}
      <div style={{ marginBottom: 8 }}>
        <Text strong style={{ fontSize: 13, color: '#64748b' }}>
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
          style={{ marginTop: 16, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}
        />
      )}

      {hasUnsavedChanges && (
        <Alert
          type="warning"
          message="代码有未保存的修改，请先保存后再执行 Plan"
          showIcon
          style={{ marginTop: 16, borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a' }}
        />
      )}

      <Space style={{ marginTop: 16 }}>
        {!planDone ? (
          <Button
            type="primary"
            size="large"
            onClick={startPlan}
            loading={planning}
            icon={<ThunderboltOutlined />}
            disabled={isEditing}
            style={{ borderRadius: 8, minWidth: 140, background: 'linear-gradient(135deg, #2563eb, #6366f1)', border: 'none', color: '#fff' }}
          >
            执行 Plan
          </Button>
        ) : (
          <Button
            type="primary"
            size="large"
            onClick={handleConfirm}
            style={{ borderRadius: 8, minWidth: 140, background: 'linear-gradient(135deg, #2563eb, #6366f1)', border: 'none', color: '#fff' }}
          >
            确认，下一步
          </Button>
        )}
        <Button onClick={onBack} disabled={planning || isEditing} style={{ borderRadius: 8 }}>
          返回上一步
        </Button>
      </Space>
    </Card>
  )
}

export default CodeReview