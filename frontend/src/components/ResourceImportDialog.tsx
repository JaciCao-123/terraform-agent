import React, { useState, useCallback } from 'react'
import { Modal, Button, Typography, Space, Select, Table, message, Tag, Alert, Progress } from 'antd'
import { CloudServerOutlined, WindowsOutlined, SearchOutlined, ImportOutlined, ReloadOutlined } from '@ant-design/icons'
import { scanImportResources, executeImportResources } from '../services/api'
import TerminalView from './TerminalView'
import type { CloudProvider, ImportResource, SSEMessage } from '../types'

const { Text } = Typography

interface Props {
  open: boolean
  onClose: () => void
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

const ResourceImportDialog: React.FC<Props> = ({ open, onClose }) => {
  const [provider, setProvider] = useState<CloudProvider>('alicloud')
  const [resourceType, setResourceType] = useState<string | null>(null)
  const [resources, setResources] = useState<ImportResource[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [scanning, setScanning] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importLogs, setImportLogs] = useState<string[]>([])
  const [importDone, setImportDone] = useState(false)
  const [importProgress, setImportProgress] = useState(0)

  const handleScan = async () => {
    if (!resourceType) {
      message.warning('请选择资源类型')
      return
    }
    setScanning(true)
    setResources([])
    setSelectedIds([])
    setImportDone(false)
    setImportLogs([])
    try {
      const result = await scanImportResources(provider, resourceType)
      setResources(result.resources)
      message.success(`扫描完成，共发现 ${result.total} 个资源`)
    } catch (err: unknown) {
      if (err instanceof Error) message.error(err.message || '扫描失败')
    } finally {
      setScanning(false)
    }
  }

  const handleImport = useCallback(() => {
    if (selectedIds.length === 0) {
      message.warning('请选择要导入的资源')
      return
    }
    setImporting(true)
    setImportLogs([])
    setImportDone(false)
    setImportProgress(0)

    const selectedResources = resources.filter((r) => selectedIds.includes(r.id))

    executeImportResources(
      provider,
      selectedResources,
      (msg: SSEMessage) => {
        if (msg.log) {
          setImportLogs((prev) => [...prev, msg.log!])
        }
      },
      (err: Error) => {
        setImporting(false)
        message.error(err.message)
      },
      () => {
        setImporting(false)
        setImportDone(true)
        setImportProgress(100)
        message.success('批量导入完成！')
      },
    )
  }, [provider, resources, selectedIds])

  const columns = [
    {
      title: '资源名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <span style={{ fontWeight: 500, color: '#1e293b' }}>{name}</span>,
    },
    {
      title: '资源 ID',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => <code style={{ fontSize: 11, color: '#64748b' }}>{id}</code>,
    },
    {
      title: '区域',
      dataIndex: 'region',
      key: 'region',
      render: (region: string) => <Tag color="blue">{region}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'Running' || status === 'Active' ? 'green' : 'default'}>{status || '-'}</Tag>
      ),
    },
  ]

  return (
    <Modal
      title={
        <span style={{ fontSize: 16, fontWeight: 600 }}>
          <ImportOutlined style={{ marginRight: 8, color: '#2563eb' }} />
          导入存量资源
        </span>
      }
      open={open}
      onCancel={onClose}
      width={800}
      footer={null}
      destroyOnClose
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {/* 云平台和资源类型选择 */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 12, color: '#64748b' }}>
              云平台
            </Text>
            <Space>
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
          </div>
          <div style={{ flex: 2 }}>
            <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 12, color: '#64748b' }}>
              资源类型
            </Text>
            <Select
              style={{ width: '100%' }}
              placeholder="选择要扫描的资源类型"
              value={resourceType}
              onChange={(val) => {
                setResourceType(val)
                setResources([])
                setSelectedIds([])
              }}
              size="middle"
              options={Object.entries(RESOURCE_TYPE_LABELS).map(([key, label]) => ({
                label,
                value: key,
              }))}
            />
          </div>
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleScan}
            loading={scanning}
            size="middle"
            style={{ borderRadius: 8, marginBottom: 0 }}
          >
            扫描
          </Button>
        </div>

        {/* 资源列表 */}
        {resources.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text strong style={{ fontSize: 13, color: '#64748b' }}>
                共发现 {resources.length} 个资源
              </Text>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={handleScan}
                style={{ borderRadius: 6 }}
              >
                刷新
              </Button>
            </div>
            <Table
              rowKey="id"
              columns={columns}
              dataSource={resources}
              size="small"
              pagination={false}
              scroll={{ y: 300 }}
              rowSelection={{
                selectedRowKeys: selectedIds,
                onChange: (keys) => setSelectedIds(keys as string[]),
              }}
              style={{ borderRadius: 8 }}
            />
          </>
        )}

        {/* 导入日志 */}
        {importLogs.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong style={{ fontSize: 13, color: '#64748b' }}>
                导入进度
              </Text>
              {importing && <Progress percent={importProgress} size="small" style={{ width: 200 }} />}
            </div>
            <TerminalView logs={importLogs} maxHeight={200} placeholder="" />
          </div>
        )}

        {/* 导入结果 */}
        {importDone && (
          <Alert
            type="success"
            message="导入完成！资源已进入 Terraform 状态管理"
            showIcon
            style={{ borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}
          />
        )}

        {/* 操作按钮 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose} style={{ borderRadius: 8 }}>
            关闭
          </Button>
          <Button
            type="primary"
            icon={<ImportOutlined />}
            onClick={handleImport}
            loading={importing}
            disabled={selectedIds.length === 0}
            size="large"
            style={{ borderRadius: 8, minWidth: 120, background: 'linear-gradient(135deg, #2563eb, #6366f1)', border: 'none', color: '#fff' }}
          >
            导入选中的资源 ({selectedIds.length})
          </Button>
        </div>
      </Space>
    </Modal>
  )
}

export default ResourceImportDialog