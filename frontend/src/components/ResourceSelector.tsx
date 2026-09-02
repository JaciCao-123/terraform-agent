import React, { useEffect, useState } from 'react'
import { Card, Select, Button, Space, Typography, Spin, Empty, Descriptions, Tag, List, message } from 'antd'
import { PlusCircleOutlined, DeleteOutlined, WarningOutlined, ReloadOutlined, EditOutlined } from '@ant-design/icons'
import { getResourceTypes, getResourceSchema, getResourceInstances } from '../services/api'
import type { OperationType, ResourceType, ResourceSchema, ResourceInstance } from '../types'

const { Title, Text } = Typography

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
    } else if (operationType === 'destroy' && selectedInstance) {
      setLoadingSchema(true)
      try {
        const instance = instances.find((i) => i.address === selectedInstance)
        if (instance) {
          const schema = await getResourceSchema(instance.type)
          onResourceSelected('destroy', instance.type, schema, instance.address, instance.id)
        }
      } catch (err) {
        console.error('加载 Schema 失败:', err)
      } finally {
        setLoadingSchema(false)
      }
    } else if (operationType === 'update' && selectedInstance) {
      setLoadingSchema(true)
      try {
        const instance = instances.find((i) => i.address === selectedInstance)
        if (instance) {
          const schema = await getResourceSchema(instance.type)
          onResourceSelected('update', instance.type, schema, instance.address, instance.id)
        }
      } catch (err) {
        console.error('加载 Schema 失败:', err)
      } finally {
        setLoadingSchema(false)
      }
    }
  }

  // 获取选中的资源实例详情
  const selectedInstanceDetail = instances.find((i) => i.address === selectedInstance)

  if (loading) {
    return (
      <Card>
        <Spin tip="加载资源类型...">
          <div style={{ padding: 24 }}>加载中...</div>
        </Spin>
      </Card>
    )
  }

  return (
    <Card>
      <Title level={5} style={{ marginBottom: 24 }}>
        选择操作类型和资源
      </Title>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 操作类型选择 */}
        <div>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            操作类型
          </Text>
          <Space>
            <Button
              type={operationType === 'create' ? 'primary' : 'default'}
              icon={<PlusCircleOutlined />}
              onClick={() => {
                onOperationTypeChange('create')
                setSelectedType(null)
                setSelectedInstance(null)
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
            >
              修改资源
            </Button>
          </Space>
        </div>

        {/* 创建模式：选择资源类型 */}
        {operationType === 'create' && (
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              资源类型
            </Text>
            <Select
              style={{ width: 320 }}
              placeholder="请选择要创建的资源类型"
              value={selectedType}
              onChange={setSelectedType}
              options={resourceTypes.map((t) => ({
                label: `${t.display_name} (${t.type})`,
                value: t.type,
              }))}
            />
          </div>
        )}

        {/* 销毁模式：先选类型，再选具体资源 */}
        {operationType === 'destroy' && (
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              资源类型
            </Text>
            <Select
              style={{ width: 320 }}
              placeholder="请选择要销毁的资源类型"
              value={selectedType}
              onChange={(val) => {
                setSelectedType(val)
                setSelectedInstance(null)
              }}
              options={resourceTypes.map((t) => ({
                label: `${t.display_name} (${t.type})`,
                value: t.type,
              }))}
            />

            {selectedType && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text strong>
                    已有 {RESOURCE_TYPE_LABELS[selectedType] || selectedType} 资源
                  </Text>
                  <Button
                    type="text"
                    icon={<ReloadOutlined />}
                    loading={loading}
                    onClick={() => {
                      setLoading(true)
                      getResourceInstances()
                        .then((insts) => {
                          setInstances(insts)
                          message.success(`刷新成功，找到 ${insts.filter(i => i.type === selectedType).length} 个实例`)
                        })
                        .catch((err) => {
                          console.error('刷新失败:', err)
                          message.error('刷新失败')
                        })
                        .finally(() => setLoading(false))
                    }}
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
                      placeholder="请选择要销毁的实例"
                      value={selectedInstance}
                      onChange={setSelectedInstance}
                      showSearch
                      options={filtered.map((inst) => ({
                        label: `[${inst.type.toUpperCase()}] ${inst.name}  (${inst.id})`,
                        value: inst.address,
                      }))}
                    />
                  )
                })()}

                {/* 选中资源后的详情卡片 */}
                {selectedInstanceDetail && (
                  <Card
                    size="small"
                    title={
                      <Space>
                        <WarningOutlined style={{ color: '#faad14' }} />
                        <span>即将销毁的资源</span>
                      </Space>
                    }
                    style={{ marginTop: 16, borderColor: '#ffccc7' }}
                  >
                    <Descriptions column={2} size="small">
                      <Descriptions.Item label="资源类型">
                        <Tag color="blue">
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

        {/* 更新模式：先选类型，再选具体资源 */}
        {operationType === 'update' && (
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              资源类型
            </Text>
            <Select
              style={{ width: 320 }}
              placeholder="请选择要修改的资源类型"
              value={selectedType}
              onChange={(val) => {
                setSelectedType(val)
                setSelectedInstance(null)
              }}
              options={resourceTypes.map((t) => ({
                label: `${t.display_name} (${t.type})`,
                value: t.type,
              }))}
            />

            {selectedType && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text strong>
                    已有 {RESOURCE_TYPE_LABELS[selectedType] || selectedType} 资源
                  </Text>
                  <Button
                    type="text"
                    icon={<ReloadOutlined />}
                    loading={loading}
                    onClick={() => {
                      setLoading(true)
                      getResourceInstances()
                        .then((insts) => {
                          setInstances(insts)
                          message.success(`刷新成功，找到 ${insts.filter(i => i.type === selectedType).length} 个实例`)
                        })
                        .catch((err) => {
                          console.error('刷新失败:', err)
                          message.error('刷新失败')
                        })
                        .finally(() => setLoading(false))
                    }}
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
                      placeholder="请选择要修改的实例"
                      value={selectedInstance}
                      onChange={setSelectedInstance}
                      showSearch
                      options={filtered.map((inst) => ({
                        label: `[${inst.type.toUpperCase()}] ${inst.name}  (${inst.id})`,
                        value: inst.address,
                      }))}
                    />
                  )
                })()}

                {/* 选中资源后的详情卡片 */}
                {selectedInstanceDetail && (
                  <Card
                    size="small"
                    title={
                      <Space>
                        <EditOutlined style={{ color: '#1677ff' }} />
                        <span>目标资源</span>
                      </Space>
                    }
                    style={{ marginTop: 16, borderColor: '#bae0ff' }}
                  >
                    <Descriptions column={2} size="small">
                      <Descriptions.Item label="资源类型">
                        <Tag color="blue">
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
            (operationType === 'destroy' && !(selectedType && selectedInstance))
          }
          loading={loadingSchema}
        >
          {operationType === 'destroy' ? '下一步：确认销毁' : '下一步：配置参数'}
        </Button>
      </Space>
    </Card>
  )
}

export default ResourceSelector