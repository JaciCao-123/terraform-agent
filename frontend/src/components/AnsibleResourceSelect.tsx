import React, { useEffect, useState } from 'react'
import { Card, Typography, Button, Select, Input, Space, message, Divider, Tag } from 'antd'
import { ThunderboltOutlined, CloudServerOutlined, WindowsOutlined } from '@ant-design/icons'
import { getResourceInstances } from '../services/api'
import type { CloudProvider, ResourceInstance } from '../types'

const { Title, Text } = Typography
const { TextArea } = Input

interface Props {
  onSelect: (resources: Array<{ host: string; name: string; provider: CloudProvider; resourceType: string; resourceAddress: string }>) => void
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
  const [selectedInstances, setSelectedInstances] = useState<string[]>([])
  const [manualHosts, setManualHosts] = useState('')
  const [manualNamePrefix, setManualNamePrefix] = useState('')
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
      if (selectedInstances.length === 0) {
        message.warning('请至少选择一个资源')
        return
      }
      const resources = selectedInstances.map((addr) => {
        const inst = instances.find((i) => i.address === addr)!
        const host = (inst.attributes?.public_ip as string) || (inst.attributes?.private_ip as string) || ''
        return {
          host,
          name: inst.name || `${inst.type}-${addr.split('.').pop()}`,
          provider,
          resourceType: inst.type,
          resourceAddress: addr,
        }
      })
      onSelect(resources)
    } else {
      const lines = manualHosts.trim().split('\n').filter(Boolean)
      if (lines.length === 0) {
        message.warning('请输入至少一个主机 IP')
        return
      }
      const prefix = manualNamePrefix.trim() || 'host'
      const resources = lines.map((line, i) => {
        const ip = line.trim()
        const name = ip.includes(':') ? ip.split(':')[0].trim() : `${prefix}-${i + 1}`
        return {
          host: ip.trim(),
          name,
          provider,
          resourceType: 'manual',
          resourceAddress: `manual.${name}`,
        }
      })
      onSelect(resources)
    }
  }

  const selectedHostsInfo = () => {
    if (selectedInstances.length === 0) return null
    return (
      <div style={{ marginTop: 12, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
        <Text style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>
          已选 {selectedInstances.length} 个目标
        </Text>
        {selectedInstances.map((addr) => {
          const inst = instances.find((i) => i.address === addr)
          if (!inst) return null
          const host = (inst.attributes?.public_ip as string) || (inst.attributes?.private_ip as string) || '无 IP'
          return (
            <div key={addr} style={{ marginTop: 4, fontSize: 12, color: '#166534' }}>
              <code>{host}</code>
              <Tag style={{ marginLeft: 6, fontSize: 10 }}>{inst.type}</Tag>
              <span style={{ color: '#94a3b8', marginLeft: 4, fontSize: 11 }}>{inst.name}</span>
            </div>
          )
        })}
      </div>
    )
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
            选择资源（可多选，来自 Terraform State）
          </Text>
          <Select
            style={{ width: '100%', borderRadius: 8 }}
            mode="multiple"
            placeholder={loading ? '加载中...' : '选择一个或多个已有资源'}
            value={selectedInstances}
            onChange={setSelectedInstances}
            loading={loading}
            options={instances.map((inst) => ({
              label: `${inst.name || inst.type} (${inst.type})${inst.attributes?.public_ip ? ' - ' + inst.attributes.public_ip : ''}${inst.attributes?.private_ip ? ' - ' + inst.attributes.private_ip : ''}`,
              value: inst.address,
            }))}
            maxTagCount={5}
          />
          {selectedHostsInfo()}
        </>
      ) : (
        <>
          <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13, color: '#64748b' }}>
            目标主机 IP（每行一个，支持批量）
          </Text>
          <TextArea
            rows={4}
            placeholder={'47.76.53.232\n47.76.53.233\n192.168.1.10'}
            value={manualHosts}
            onChange={(e) => setManualHosts(e.target.value)}
            style={{ borderRadius: 8, marginBottom: 12, fontFamily: 'monospace' }}
          />
          <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 13, color: '#64748b' }}>
            主机名称前缀（可选，用于标识）
          </Text>
          <Input
            placeholder="例如: web-server，将自动生成为 web-server-1, web-server-2..."
            value={manualNamePrefix}
            onChange={(e) => setManualNamePrefix(e.target.value)}
            style={{ borderRadius: 8 }}
          />
          {manualHosts.trim().split('\n').filter(Boolean).length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
              共 {manualHosts.trim().split('\n').filter(Boolean).length} 台主机
            </div>
          )}
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