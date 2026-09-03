import React, { useEffect, useState } from 'react'
import { Card, Select, Button, Space, Typography, Spin, Empty, Descriptions, Tag, message } from 'antd'
import { PlusCircleOutlined, DeleteOutlined, ReloadOutlined, EditOutlined, CloudServerOutlined, DatabaseOutlined, NodeIndexOutlined, FolderOpenOutlined, ApartmentOutlined, ThunderboltOutlined, DeploymentUnitOutlined, FileOutlined, CloudOutlined, WindowsOutlined } from '@ant-design/icons'
import { getResourceTypes, getResourceSchema, getResourceInstances } from '../services/api'
import type { OperationType, ResourceType, ResourceSchema, ResourceInstance, CloudProvider } from '../types'

const { Title, Text } = Typography

const CLOUD_PROVIDER_ICONS: Record<string, React.ReactNode> = {
  alicloud: <CloudServerOutlined style={{ fontSize: 24, color: '#ff6a00' }} />,
  azure: <WindowsOutlined style={{ fontSize: 24, color: '#0078d4' }} />,
}

const RESOURCE_ICONS: Record<string, React.ReactNode> = {
  // 阿里云
  ecs: <CloudServerOutlined style={{ fontSize: 28, color: '#2563eb' }} />,
  rds: <DatabaseOutlined style={{ fontSize: 28, color: '#7c3aed' }} />,
  slb: <NodeIndexOutlined style={{ fontSize: 28, color: '#059669' }} />,
  oss: <FolderOpenOutlined style={{ fontSize: 28, color: '#d97706' }} />,
  vpc: <ApartmentOutlined style={{ fontSize: 28, color: '#0891b2' }} />,
  redis: <ThunderboltOutlined style={{ fontSize: 28, color: '#dc2626' }} />,
  ack: <DeploymentUnitOutlined style={{ fontSize: 28, color: '#10b981' }} />,
  cdn: <FileOutlined style={{ fontSize: 28, color: '#8b5cf6' }} />,
  nas: <FolderOpenOutlined style={{ fontSize: 28, color: '#f59e0b' }} />,
  // Azure
  resource_group: <ApartmentOutlined style={{ fontSize: 28, color: '#0078d4' }} />,
  virtual_network: <ApartmentOutlined style={{ fontSize: 28, color: '#5ea6e8' }} />,
  virtual_machine: <CloudOutlined style={{ fontSize: 28, color: '#005a9e' }} />,
  storage_account: <FolderOpenOutlined style={{ fontSize: 28, color: '#25a0ea' }} />,
  sql_database: <DatabaseOutlined style={{ fontSize: 28, color: '#e52025' }} />,
  aks: <DeploymentUnitOutlined style={{ fontSize: 28, color: '#32b530' }} />,
  redis_cache: <ThunderboltOutlined style={{ fontSize: 28, color: '#bc252a' }} />,
  cdn_profile: <CloudOutlined style={{ fontSize: 28, color: '#0078d4' }} />,
  app_service: <FileOutlined style={{ fontSize: 28, color: '#512bd4' }} />,
}

const RESOURCE_CARD_COLORS: Record<string, { bg: string; border: string; selectedBg: string; selectedBorder: string }> = {
  // 阿里云
  ecs: { bg: '#eff6ff', border: '#bfdbfe', selectedBg: '#dbeafe', selectedBorder: '#2563eb' },
  rds: { bg: '#f5f3ff', border: '#ddd6fe', selectedBg: '#ede9fe', selectedBorder: '#7c3aed' },
  slb: { bg: '#ecfdf5', border: '#a7f3d0', selectedBg: '#d1fae5', selectedBorder: '#059669' },
  oss: { bg: '#fffbeb', border: '#fde68a', selectedBg: '#fef3c7', selectedBorder: '#d97706' },
  vpc: { bg: '#ecfeff', border: '#a5f3fc', selectedBg: '#cffafe', selectedBorder: '#0891b2' },
  redis: { bg: '#fef2f2', border: '#fecaca', selectedBg: '#fee2e2', selectedBorder: '#dc2626' },
  ack: { bg: '#f0fdf4', border: '#bbf7d0', selectedBg: '#dcfce7', selectedBorder: '#10b981' },
  cdn: { bg: '#f5f3ff', border: '#ddd6fe', selectedBg: '#ede9fe', selectedBorder: '#8b5cf6' },
  nas: { bg: '#fffbeb', border: '#fde68a', selectedBg: '#fef3c7', selectedBorder: '#f59e0b' },
  // Azure
  resource_group: { bg: '#e6f2ff', border: '#99ccff', selectedBg: '#cce5ff', selectedBorder: '#0078d4' },
  virtual_network: { bg: '#e6f7ff', border: '#91d5ff', selectedBg: '#cce5ff', selectedBorder: '#5ea6e8' },
  virtual_machine: { bg: '#f0f7ff', border: '#b3d9ff', selectedBg: '#cce6ff', selectedBorder: '#005a9e' },
  storage_account: { bg: '#f0f8ff', border: '#91cfff', selectedBg: '#d4eaff', selectedBorder: '#25a0ea' },
  sql_database: { bg: '#fff0f0', border: '#ffcccc', selectedBg: '#ffe0e0', selectedBorder: '#e52025' },
  aks: { bg: '#f2fdf4', border: '#a5e9aa', selectedBg: '#d4f8d8', selectedBorder: '#32b530' },
  redis_cache: { bg: '#fff0f0', border: '#f4cccc', selectedBg: '#fadddd', selectedBorder: '#bc252a' },
  cdn_profile: { bg: '#f0f5ff', border: '#b3ccff', selectedBg: '#d9e6ff', selectedBorder: '#0078d4' },
  app_service: { bg: '#f5f0ff', border: '#cbbfff', selectedBg: '#e6dfff', selectedBorder: '#512bd4' },
}

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  // 阿里云
  ecs: '云服务器 ECS',
  rds: '云数据库 RDS',
  slb: '负载均衡 SLB',
  oss: '对象存储 OSS',
  vpc: '专有网络 VPC',
  redis: '云数据库 Redis',
  ack: '容器服务 ACK',
  cdn: '内容分发 CDN',
  nas: '文件存储 NAS',
  // Azure
  resource_group: '资源组',
  virtual_network: '虚拟网络 VNet',
  virtual_machine: '虚拟机 VM',
  storage_account: '存储账户',
  sql_database: 'SQL Database',
  aks: 'Kubernetes 服务 AKS',
  redis_cache: 'Redis 缓存',
  cdn_profile: 'CDN Profile',
  app_service: '应用服务 App Service',
}

interface Props {
  operationType: OperationType
  onOperationTypeChange: (op: OperationType) => void
  onResourceSelected: (op: OperationType, resType: string, schema: ResourceSchema, provider: CloudProvider, targetAddress?: string, resourceId?: string) => void
}

const ResourceSelector: React.FC<Props> = ({ operationType, onOperationTypeChange, onResourceSelected }) => {
  const [cloudProvider, setCloudProvider] = useState<CloudProvider>('alicloud')
  const [resourceTypes, setResourceTypes] = useState<ResourceType[]>([])
  const [instances, setInstances] = useState<ResourceInstance[]>([])
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingSchema, setLoadingSchema] = useState(false)

  const loadResourceTypes = (provider: CloudProvider) => {
    setLoading(true)
    Promise.all([getResourceTypes(provider), getResourceInstances(provider)])
      .then(([types, insts]) => {
        setResourceTypes(types)
        setInstances(insts)
      })
      .catch((err) => console.error('加载资源类型失败:', err))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadResourceTypes(cloudProvider)
  }, [cloudProvider])

  const handleProviderChange = (provider: CloudProvider) => {
    setCloudProvider(provider)
    setSelectedType(null)
    setSelectedInstance(null)
  }

  const handleNext = async () => {
    if (operationType === 'create' && selectedType) {
      setLoadingSchema(true)
      try {
        const schema = await getResourceSchema(selectedType, cloudProvider)
        onResourceSelected('create', selectedType, schema, cloudProvider)
      } catch (err) {
        console.error('加载 Schema 失败:', err)
      } finally {
        setLoadingSchema(false)
      }
    } else if ((operationType === 'destroy' || operationType === 'update') && selectedInstance) {
      setLoadingSchema(true)
      try {
        const instance = instances.find((i) => i.address === selectedInstance)
        if (instance) {
          const schema = await getResourceSchema(instance.type, cloudProvider)
          onResourceSelected(operationType, instance.type, schema, cloudProvider, instance.address, instance.id)
        }
      } catch (err) {
        console.error('加载 Schema 失败:', err)
      } finally {
        setLoadingSchema(false)
      }
    }
  }

  const refreshInstances = () => {
    loadResourceTypes(cloudProvider)
    message.success(`刷新成功，共 ${instances.length} 个实例`)
  }

  const selectedInstanceDetail = instances.find((i) => i.address === selectedInstance)

  if (loading) {
    return (
      <Card style={{ borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: '#64748b' }}>加载资源类型...</div>
        </div>
      </Card>
    )
  }

  const renderResourceCard = (t: ResourceType) => {
    const colors = RESOURCE_CARD_COLORS[t.type] || { bg: '#f8fafc', border: '#e2e8f0', selectedBg: '#f1f5f9', selectedBorder: '#2563eb' }
    const isSelected = selectedType === t.type
    return (
      <Card
        key={t.type}
        hoverable
        size="small"
        style={{
          borderRadius: 12,
          border: isSelected ? `2px solid ${colors.selectedBorder}` : `1px solid ${colors.border}`,
          background: isSelected ? colors.selectedBg : colors.bg,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onClick={() => {
          setSelectedType(t.type)
          setSelectedInstance(null)
        }}
      >
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <div>{RESOURCE_ICONS[t.type]}</div>
          <div style={{ marginTop: 10, fontWeight: 600, fontSize: 14, color: '#1e293b' }}>
            {t.display_name}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            {t.type}
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card
      style={{
        borderRadius: 14,
        border: '1px solid #e2e8f0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <Title level={4} style={{ marginBottom: 24, color: '#1e293b', fontSize: 18 }}>
        选择云平台、操作类型和资源
      </Title>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 云平台选择 */}
        <div>
          <Text strong style={{ display: 'block', marginBottom: 12, fontSize: 13, color: '#64748b', letterSpacing: 0.5 }}>
            云平台
          </Text>
          <Space size={12}>
            <Button
              type={cloudProvider === 'alicloud' ? 'primary' : 'default'}
              icon={CLOUD_PROVIDER_ICONS.alicloud as React.ReactElement}
              onClick={() => handleProviderChange('alicloud')}
              size="large"
              style={{
                borderRadius: 8,
                minWidth: 140,
                ...(cloudProvider === 'alicloud' && { background: 'linear-gradient(135deg, #ff6a00, #ee0979)', border: 'none', color: '#fff' }),
              }}
            >
              阿里云
            </Button>
            <Button
              type={cloudProvider === 'azure' ? 'primary' : 'default'}
              icon={CLOUD_PROVIDER_ICONS.azure as React.ReactElement}
              onClick={() => handleProviderChange('azure')}
              size="large"
              style={{
                borderRadius: 8,
                minWidth: 140,
                ...(cloudProvider === 'azure' && { background: 'linear-gradient(135deg, #0078d4, #13a0ff)', border: 'none', color: '#fff' }),
              }}
            >
              Azure
            </Button>
          </Space>
        </div>

        {/* 操作类型选择 */}
        <div>
          <Text strong style={{ display: 'block', marginBottom: 12, fontSize: 13, color: '#64748b', letterSpacing: 0.5 }}>
            操作类型
          </Text>
          <Space size={12}>
            <Button
              type={operationType === 'create' ? 'primary' : 'default'}
              icon={<PlusCircleOutlined />}
              onClick={() => {
                onOperationTypeChange('create')
                setSelectedType(null)
                setSelectedInstance(null)
              }}
              size="large"
              style={{
                borderRadius: 8,
                minWidth: 120,
                ...(operationType === 'create' && { background: 'linear-gradient(135deg, #2563eb, #6366f1)', border: 'none', color: '#fff' }),
              }}
            >
              创建资源
            </Button>
            <Button
              type={operationType === 'destroy' ? 'primary' : 'default'}
              icon={<DeleteOutlined />}
              danger={operationType === 'destroy'}
              onClick={() => {
                onOperationTypeChange('destroy')
                setSelectedType(null)
                setSelectedInstance(null)
              }}
              size="large"
              style={{ borderRadius: 8, minWidth: 120 }}
            >
              销毁资源
            </Button>
            <Button
              type={operationType === 'update' ? 'primary' : 'default'}
              icon={<EditOutlined />}
              onClick={() => {
                onOperationTypeChange('update')
                setSelectedType(null)
                setSelectedInstance(null)
              }}
              size="large"
              style={{
                borderRadius: 8,
                minWidth: 120,
                ...(operationType === 'update' && { background: 'linear-gradient(135deg, #2563eb, #6366f1)', border: 'none', color: '#fff' }),
              }}
            >
              修改资源
            </Button>
          </Space>
        </div>

        {/* 创建模式：选择资源类型 */}
        {operationType === 'create' && (
          <div>
            <Text strong style={{ display: 'block', marginBottom: 12, fontSize: 13, color: '#64748b', letterSpacing: 0.5 }}>
              资源类型
            </Text>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {resourceTypes.map(renderResourceCard)}
            </div>
          </div>
        )}

        {/* 销毁/修改模式：选择资源类型 → 选择实例 */}
        {(operationType === 'destroy' || operationType === 'update') && (
          <div>
            <Text strong style={{ display: 'block', marginBottom: 12, fontSize: 13, color: '#64748b', letterSpacing: 0.5 }}>
              资源类型
            </Text>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {resourceTypes.map(renderResourceCard)}
            </div>

            {selectedType && (
              <div style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text strong style={{ fontSize: 13, color: '#64748b', letterSpacing: 0.5 }}>
                    已有 {RESOURCE_TYPE_LABELS[selectedType] || selectedType} 资源
                  </Text>
                  <Button size="small" icon={<ReloadOutlined />} onClick={refreshInstances} style={{ borderRadius: 6, fontSize: 12 }}>
                    刷新
                  </Button>
                </div>
                {(() => {
                  const filtered = instances.filter((i) => i.type === selectedType)
                  return filtered.length === 0 ? (
                    <Empty description={<span style={{ color: '#94a3b8' }}>暂无该类型已创建的资源</span>} />
                  ) : (
                    <Select
                      style={{ width: '100%' }}
                      placeholder="请选择要操作的实例"
                      value={selectedInstance}
                      onChange={setSelectedInstance}
                      showSearch
                      size="large"
                      popupMatchSelectWidth={false}
                      options={filtered.map((inst) => ({
                        label: `[${inst.type.toUpperCase()}] ${inst.display_name || inst.name || inst.id}`,
                        value: inst.address,
                      }))}
                    />
                  )
                })()}

                {selectedInstanceDetail && (
                  <Card
                    size="small"
                    style={{
                      marginTop: 16,
                      borderColor: operationType === 'destroy' ? '#fecaca' : '#bfdbfe',
                      borderRadius: 10,
                      background: operationType === 'destroy' ? '#fef2f2' : '#eff6ff',
                    }}
                  >
                    <Descriptions column={2} size="small" colon={false}>
                      <Descriptions.Item label={<span style={{ color: '#64748b' }}>资源类型</span>}>
                        <Tag color={operationType === 'destroy' ? 'red' : 'blue'}>
                          {selectedInstanceDetail.type.toUpperCase()}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label={<span style={{ color: '#64748b' }}>资源名称</span>}>
                        <span style={{ color: '#1e293b' }}>{selectedInstanceDetail.display_name || selectedInstanceDetail.name || selectedInstanceDetail.id}</span>
                      </Descriptions.Item>
                      <Descriptions.Item label={<span style={{ color: '#64748b' }}>资源 ID</span>}>
                        <span style={{ color: '#1e293b', fontFamily: 'monospace', fontSize: 12 }}>{selectedInstanceDetail.id}</span>
                      </Descriptions.Item>
                      <Descriptions.Item label={<span style={{ color: '#64748b' }}>Terraform 地址</span>}>
                        <span style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 11 }}>{selectedInstanceDetail.address}</span>
                      </Descriptions.Item>
                    </Descriptions>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}

        {/* 下一步按钮 */}
        <Button
          type="primary"
          size="large"
          danger={operationType === 'destroy'}
          onClick={handleNext}
          disabled={
            loadingSchema ||
            (operationType === 'create' && !selectedType) ||
            ((operationType === 'destroy' || operationType === 'update') && !(selectedType && selectedInstance))
          }
          loading={loadingSchema}
          style={{
            borderRadius: 8,
            minWidth: 180,
            ...(operationType !== 'destroy' && { background: 'linear-gradient(135deg, #2563eb, #6366f1)', border: 'none', color: '#fff' }),
          }}
        >
          {operationType === 'destroy' ? '下一步：确认销毁' : operationType === 'update' ? '下一步：修改参数' : '下一步：配置参数'}
        </Button>
      </Space>
    </Card>
  )
}

export default ResourceSelector