import React, { useEffect, useState } from 'react'
import { Card, Typography, Button, Select, Input, Space, message, Divider } from 'antd'
import { ThunderboltOutlined, CloudServerOutlined, LinkOutlined, WindowsOutlined } from '@ant-design/icons'
import { getResourceInstances } from '../services/api'
import type { CloudProvider, ResourceInstance } from '../types'

const { Title, Text } = Typography

interface Props {
  onSelect: (info: { host: string; name: string; provider: CloudProvider; resourceType: string; resourceAddress: string }) => void
  onBack: () => void
}

const cardStyle = {
  borderRadius: 14,
  border: '1px solid #e2e8f0',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

const AnsibleResourceSelect: React.FC<Props> = ({ onSelect, onBack }) => {
  const [provider, setProvider] = useState<CloudProvider>('alicloud')
  const [instances, setInstances] = useState<ResourceInstance[]>([])
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null)
  const [manualHost, setManualHost] = useState('')
  const [manualName, setManualName] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'instance' | 'manual'>('instance')

  useEffect(() => {
    loadInstances()
  }, [provider])

  const loadInstances = async () => {
    setLoading(true)
    try {
      const result = await getResourceInstances(provider)
      setInstances(result)
    } catch {
      setInstances([])
    } finally {
      setLoading(false)
    }
  }

  const handleContinue = () => {
    if (mode === 'instance') {
      if (!selectedInstance) {
        message.warning('请选择一个已有资源')
        return
      }
      const inst = instances.find((i) => i.address === selectedInstance)
      if (!inst) return
      const host = inst.attributes?.public_ip || inst.attributes?.private_ip || ''
      onSelect({
        host: host as string,
        name: inst.name || inst.type || 'target',
        provider,
        resourceType: inst.type,
        resourceAddress: inst.address,
      })
    } else {
      if (!manualHost.trim()) {
        message.warning('请输入目标主机 IP')
        return
      }
      if (!manualName.trim()) {
        message.warning('请输入资源名称')
        return
      }
      onSelect({
        host: manualHost.trim(),
        name: manualName.trim(),
        provider,
        resourceType: 'manual',
        resourceAddress: `manual.${manualName.trim()}`,
      })
    }
  }

  return (
    <Card style={cardStyle}>
      <Title level={4} style={{ marginBottom: 24, color: '#1e293b', fontSize: 18 }}>
        <ThunderboltOutlined style={{ marginRight: 8, color: '#059669' }} />
        选择目标资源
      </Title>

      <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13, color: '#64748b' }}>
        云平台
      </Text>
      <Space style={{ marginBottom: 20 }}>
        <Button
          type={provider === 'alicloud' ? 'primary' : 'default'}
          icon={<CloudServerOutlined />}
          onClick={() => setProvider('alicloud')}
          style={{ borderRadius: 8 }}
        >
          阿里云
        </Button>
        <Button
          type={provider === 'azure' ? 'primary' : 'default'}
          icon={<WindowsOutlined />}
          onClick={() => setProvider('azure')}
          style={{ borderRadius: 8 }}
        >
          Azure
        </Button>
      </Space>

      <Divider style={{ margin: '12px 0' }} />

      <Space style={{ marginBottom: 16 }}>
        <Button
          size="small"
          type={mode === 'instance' ? 'primary' : 'default'}
          onClick={() => setMode('instance')}
          style={{ borderRadius: 6 }}
        >
          从已有资源选择
        </Button>
        <Button
          size="small"
          type={mode === 'manual' ? 'primary' : 'default'}
          onClick={() => setMode('manual')}
          style={{ borderRadius: 6 }}
        >
          手动输入主机
        </Button>
      </Space>

      {mode === 'instance' ? (
        <>
          <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13, color: '#64748b' }}>
            选择资源（来自 Terraform State）
          </Text>
          <Select
            style={{ width: '100%', borderRadius: 8 }}
            placeholder={loading ? '加载中...' : '选择一个已有资源'}
            value={selectedInstance}
            onChange={setSelectedInstance}
            loading={loading}
            options={instances.map((inst) => ({
              label: `${inst.name || inst.type} (${inst.type})${inst.attributes?.public_ip ? ' - ' + inst.attributes.public_ip : ''}${inst.attributes?.private_ip ? ' - ' + inst.attributes.private_ip : ''}`,
              value: inst.address,
            }))}
          />
          {selectedInstance && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
              {(() => {
                const inst = instances.find((i) => i.address === selectedInstance)
                if (!inst) return null
                const host = (inst.attributes?.public_ip as string) || (inst.attributes?.private_ip as string) || '无 IP'
                return (
                  <Text style={{ fontSize: 12, color: '#166534' }}>
                    目标主机: <code>{host as string}</code> | 类型: <span style={{ background: '#e0f2fe', padding: '0 6px', borderRadius: 4, fontSize: 11 }}>{inst.type}</span>
                  </Text>
                )
              })()}
            </div>
          )}
        </>
      ) : (
        <>
          <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13, color: '#64748b' }}>
            目标主机 IP
          </Text>
          <Input
            placeholder="例如: 47.76.53.232"
            value={manualHost}
            onChange={(e) => setManualHost(e.target.value)}
            prefix={<LinkOutlined />}
            style={{ borderRadius: 8, marginBottom: 12 }}
          />
          <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13, color: '#64748b' }}>
            资源名称（标识用）
          </Text>
          <Input
            placeholder="例如: my-ecs-server"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            style={{ borderRadius: 8 }}
          />
        </>
      )}

      <Divider style={{ margin: '16px 0' }} />

      <Space>
        <Button
          type="primary"
          size="large"
          onClick={handleContinue}
          icon={<ThunderboltOutlined />}
          style={{ borderRadius: 8, background: 'linear-gradient(135deg, #059669, #10b981)', border: 'none', color: '#fff' }}
        >
          继续
        </Button>
        <Button onClick={onBack} size="large" style={{ borderRadius: 8 }}>
          返回
        </Button>
      </Space>
    </Card>
  )
}

export default AnsibleResourceSelect