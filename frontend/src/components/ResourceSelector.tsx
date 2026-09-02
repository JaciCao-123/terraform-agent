import React, { useEffect, useState } from 'react'
import { Card, Select, Button, Space, Typography, Spin, Empty, Descriptions, Tag, message } from 'antd'
import { PlusCircleOutlined, DeleteOutlined, ReloadOutlined, EditOutlined, CloudServerOutlined, DatabaseOutlined, NodeIndexOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { getResourceTypes, getResourceSchema, getResourceInstances } from '../services/api'
import type { OperationType, ResourceType, ResourceSchema, ResourceInstance } from '../types'

const { Title, Text } = Typography

const RESOURCE_ICONS: Record<string, React.ReactNode> = {
  ecs: <CloudServerOutlined style={{ fontSize: 32, color: '#2563eb' }} />,
  rds: <DatabaseOutlined style={{ fontSize: 32, color: '#7c3aed' }} />,
  slb: <NodeIndexOutlined style={{ fontSize: 32, color: '#059669' }} />,
  oss: <FolderOpenOutlined style={{ fontSize: 32, color: '#d97706' }} />,
}

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  ecs: '云服务器 ECS',
  rds: '云数据库 RDS',
  slb: '负载均衡 SLB',
  oss: '对象存储 OSS',
}

interface Props {
  operationType: OperationType
  onOperationTypeChange: (op: OperationType) => void
  onResourceSelected: (op: OperationType, resType: string, schema: ResourceSchema, targetAddress?: string, resourceId?: string) => void
}

const ResourceSelector: React.FC<Props> = ({ operationType, onOperationTypeChange, onResourceSelected }) => {
  const [resourceTypes, setResourceTypes] = useState<ResourceType[]>([])
  const [instances, setInstances] = useState<ResourceInstance[]>([])
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingSchema, setLoadingSchema] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([getResourceTypes(), getResourceInstances()])
      .then(([types, insts]) => {
        setResourceTypes(types)
        setInstances(insts)
      })
      .catch((err) => {
        console.error('加载资源类型失败:', err)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleNext = async () => {
    if (operationType === 'create' && selectedType) {
      setLoadingSchema(true)
      try {
        const schema = await getResourceSchema(selectedType)
        onResourceSelected('create', selectedType, schema)
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
          const schema = await getResourceSchema(instance.type)
          onResourceSelected(operationType, instance.type, schema, instance.address, instance.id)
        }
      } catch (err) {
        console.error('加载 Schema 失败:', err)
      } finally {
        setLoadingSchema(false)
      }
    }
  }

  const refreshInstances = () => {
    setLoading(true)
    getResourceInstances()
      .then((insts) => {
        setInstances(insts)
        message.success(`刷新成功，共 ${insts.length} 个实例`)
      })
      .catch((err) => {
        console.error('刷新失败:', err)
        message.error('刷新失败')
      })
      .finally(() => setLoading(false))
  }

  const selectedInstanceDetail = instances.find((i) => i.address === selectedInstance)

  if (loading) {
    return (
      <Card
        style={{
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: '#6b7280' }}>加载资源类型...</div>
        </div>
      </Card>
    )
  }

  return (
    <Card
      style={{
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <Title level={4} style={{ marginBottom: 24 }}>
        选择操作类型和资源
      </Title>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 操作类型选择 */}
        <div>
          <Text strong style={{ display: 'block', marginBottom: 12, fontSize: 14, color: '#374151' }}>
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
              style={{ borderRadius: 8, minWidth: 120 }}
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
              style={{ borderRadius: 8, minWidth: 120 }}
            >
              修改资源
            </Button>
          </Space>
        </div>

        {/* 创建模式：选择资源类型 */}
        {operationType === 'create' && (
          <div>
            <Text strong style={{ display: 'block', marginBottom: 12, fontSize: 14, color: '#374151' }}>
              资源类型
            </Text>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {resourceTypes.map((t) => (
                <Card
                  key={t.type}
                  hoverable
                  size="small"
                  style={{
                    borderRadius: 10,
                    border: selectedType === t.type ? '2px solid #2563eb' : '1px solid #e2e8f0',
                    background: selectedType === t.type ? '#eff6ff' : '#fff',
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedType(t.type)}
                >
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <div>{RESOURCE_ICONS[t.type]}</div>
                    <div style={{ marginTop: 8, fontWeight: 600, fontSize: 14 }}>
                      {t.display_name}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                      {t.type}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* 销毁/修改模式：先选类型，再选具体资源 */}
        {(operationType === 'destroy' || operationType === 'update') && (
          <div>
            <Text strong style={{ display: 'block', marginBottom: 12, fontSize: 14, color: '#374151' }}>
              资源类型
            </Text>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {resourceTypes.map((t) => (
                <Card
                  key={t.type}
                  hoverable
                  size="small"
                  style={{
                    borderRadius: 10,
                    border: selectedType === t.type ? '2px solid #2563eb' : '1px solid #e2e8f0',
                    background: selectedType === t.type ? '#eff6ff' : '#fff',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setSelectedType(t.type)
                    setSelectedInstance(null)
                  }}
                >
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    <div>{RESOURCE_ICONS[t.type]}</div>
                    <div style={{ marginTop: 8, fontWeight: 600, fontSize: 14 }}>
                      {t.display_name}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                      {t.type}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {selectedType && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text strong style={{ fontSize: 14, color: '#374151' }}>
                    已有 {RESOURCE_TYPE_LABELS[selectedType] || selectedType} 资源
                  </Text>
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={refreshInstances}
                    style={{ borderRadius: 6 }}
                  >
                    刷新
                  </Button>
                </div>
                {(() => {
                  const filtered = instances.filter((i) => i.type === selectedType)
                  return filtered.length === 0 ? (
                    <Empty description="暂无该类型已创建的资源" />
                  ) : (
                    <Select
                      style={{ width: '100%' }}
                      placeholder="请选择要操作的实例"
                      value={selectedInstance}
                      onChange={setSelectedInstance}
                      showSearch
                      size="large"
                      options={filtered.map((inst) => ({
                        label: `[${inst.type.toUpperCase()}] ${inst.name}  (${inst.id})`,
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
                      borderRadius: 8,
                      background: operationType === 'destroy' ? '#fef2f2' : '#eff6ff',
                    }}
                  >
                    <Descriptions column={2} size="small">
                      <Descriptions.Item label="资源类型">
                        <Tag color={operationType === 'destroy' ? 'red' : 'blue'}>
                          {selectedInstanceDetail.type.toUpperCase()}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="资源名称">
                        {selectedInstanceDetail.name}
                      </Descriptions.Item>
                      <Descriptions.Item label="资源 ID">
                        <Text code>{selectedInstanceDetail.id}</Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="Terraform 地址">
                        <Text code style={{ fontSize: 11 }}>
                          {selectedInstanceDetail.address}
                        </Text>
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
          style={{ borderRadius: 8, minWidth: 180 }}
        >
          {operationType === 'destroy' ? '下一步：确认销毁' : operationType === 'update' ? '下一步：修改参数' : '下一步：配置参数'}
        </Button>
      </Space>
    </Card>
  )
}

export default ResourceSelector