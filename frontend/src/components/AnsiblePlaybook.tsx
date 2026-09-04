import React, { useState } from 'react'
import { Card, Input, Button, Typography, message, Space, Alert, Tag, Tooltip } from 'antd'
import { ThunderboltOutlined, SaveOutlined, CodeOutlined, PlayCircleOutlined, CloudServerOutlined } from '@ant-design/icons'
import { generateAnsiblePlaybook, saveAnsiblePlaybook } from '../services/api'
import type { CloudProvider } from '../types'

const { Title, Text } = Typography
const { TextArea } = Input

interface TargetResource {
  host: string
  name: string
  provider: CloudProvider
  resourceType: string
  resourceAddress: string
}

interface Props {
  provider: CloudProvider
  resources: TargetResource[]
  onExecute: (playbookYaml: string, inventoryYaml: string) => void
  onBack: () => void
}

const cardStyle = {
  borderRadius: 14,
  border: '1px solid #e2e8f0',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

const AnsiblePlaybook: React.FC<Props> = ({
  provider,
  resources,
  onExecute,
  onBack,
}) => {
  const [description, setDescription] = useState('')
  const [generating, setGenerating] = useState(false)
  const [playbookYaml, setPlaybookYaml] = useState('')
  const [saving, setSaving] = useState(false)
  const [inventoryYaml, setInventoryYaml] = useState('')
  const [generated, setGenerated] = useState(false)
  const [editMode, setEditMode] = useState(false)

  const buildInventory = (): string => {
    const hosts = resources.map((r) => {
      const host = r.host || ''
      return `    ${r.name}:\n      ansible_host: ${host}`
    })
    return `all:\n  hosts:\n${hosts.join('\n')}\n`
  }

  const handleGenerate = async () => {
    if (!description.trim()) {
      message.warning('请输入配置需求描述')
      return
    }
    setGenerating(true)
    try {
      const result = await generateAnsiblePlaybook(resources[0] as unknown as Record<string, unknown>, description, provider)
      setPlaybookYaml(result.playbook_yaml)
      setInventoryYaml(buildInventory())
      setGenerated(true)
      message.success('Playbook 生成成功！')
    } catch (err: unknown) {
      if (err instanceof Error) message.error(err.message || '生成失败')
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!playbookYaml.trim()) return
    setSaving(true)
    try {
      const first = resources[0]
      const host = (first.host) as string
      await saveAnsiblePlaybook(
        `${first.resourceType}-${resources.length}hosts`,
        playbookYaml,
        provider,
        first.resourceType,
        first.resourceAddress,
        host,
      )
      message.success('Playbook 已保存！')
    } catch (err: unknown) {
      if (err instanceof Error) message.error(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleExecute = () => {
    if (!playbookYaml.trim()) return
    onExecute(playbookYaml, inventoryYaml)
  }

  return (
    <Card style={cardStyle}>
      <Title level={4} style={{ marginBottom: 24, color: '#1e293b', fontSize: 18 }}>
        <ThunderboltOutlined style={{ marginRight: 8, color: '#2563eb' }} />
        Ansible Playbook 配置
      </Title>

      <Alert
        message={
          <div>
            <span>目标主机: <strong>{resources.length} 台</strong></span>
            <div style={{ marginTop: 4 }}>
              {resources.map((r) => (
                <Tag key={r.name} icon={<CloudServerOutlined />} color="blue" style={{ marginTop: 2 }}>
                  {r.host || '无 IP'} ({r.name})
                </Tag>
              ))}
            </div>
          </div>
        }
        type="info"
        showIcon
        style={{ marginBottom: 16, borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe' }}
      />

      {!generated ? (
        <>
          <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13, color: '#64748b' }}>
            描述你的配置需求（将同时对以上 {resources.length} 台主机执行）
          </Text>
          <TextArea
            rows={4}
            placeholder="例如：安装 Nginx 并配置反向代理，开放 80 和 443 端口"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ borderRadius: 8, marginBottom: 16 }}
          />
          <Button
            type="primary"
            icon={<CodeOutlined />}
            onClick={handleGenerate}
            loading={generating}
            size="large"
            style={{ borderRadius: 8, background: 'linear-gradient(135deg, #2563eb, #6366f1)', border: 'none', color: '#fff' }}
          >
            生成 Playbook
          </Button>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text strong style={{ fontSize: 13, color: '#64748b' }}>
              Playbook YAML
            </Text>
            <Button
              size="small"
              onClick={() => setEditMode(!editMode)}
              style={{ borderRadius: 6, fontSize: 12 }}
            >
              {editMode ? '预览' : '编辑'}
            </Button>
          </div>
          {editMode ? (
            <TextArea
              rows={16}
              value={playbookYaml}
              onChange={(e) => setPlaybookYaml(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: 12, borderRadius: 8, marginBottom: 16 }}
            />
          ) : (
            <pre
              style={{
                background: '#0f172a',
                color: '#e2e8f0',
                padding: 16,
                borderRadius: 8,
                fontSize: 12,
                fontFamily: 'monospace',
                overflow: 'auto',
                maxHeight: 400,
                marginBottom: 16,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {playbookYaml}
            </pre>
          )}

          <Space>
            <Tooltip title={`将同时对 ${resources.length} 台主机执行该 Playbook`}>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleExecute}
                size="large"
                style={{ borderRadius: 8, background: 'linear-gradient(135deg, #059669, #10b981)', border: 'none', color: '#fff' }}
              >
                执行 Playbook（{resources.length} 台）
              </Button>
            </Tooltip>
            <Button
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saving}
              size="large"
              style={{ borderRadius: 8 }}
            >
              保存
            </Button>
            <Button onClick={onBack} size="large" style={{ borderRadius: 8 }}>
              重新生成
            </Button>
          </Space>
        </>
      )}
    </Card>
  )
}

export default AnsiblePlaybook