import React, { useEffect, useState } from 'react'
import { Card, Form, Input, InputNumber, Select, Button, Typography, message, Spin, Alert, Space } from 'antd'
import { EditOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { generateTf, generateDestroyTf, generateUpdateTf, getResourceConfig } from '../services/api'
import type { OperationType, ResourceSchema } from '../types'

const { Title, Text } = Typography
const { TextArea } = Input
const { Password } = Input

interface Props {
  operationType: OperationType
  schema: ResourceSchema
  resourceType: string | null
  resourceId: string
  targetResourceAddress?: string
  onComplete: (params: Record<string, unknown>, tfContent: string) => void
  onBack: () => void
}

const ConfigDialog: React.FC<Props> = ({ operationType, schema, resourceType, resourceId, targetResourceAddress, onComplete, onBack }) => {
  const [form] = Form.useForm()
  const [generating, setGenerating] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [generatedTf, setGeneratedTf] = useState<string | null>(null)
  const [userDescription, setUserDescription] = useState('')

  // 更新模式：加载当前资源配置回填表单
  useEffect(() => {
    if (operationType === 'update' && resourceType && resourceId) {
      setLoadingConfig(true)
      getResourceConfig(resourceType, resourceId)
        .then((config) => {
          const fieldMap: Record<string, string> = {
            bucket: 'bucket',
            acl: 'acl',
            storage_class: 'storage_class',
          }
          const formValues: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(config)) {
            const fieldName = fieldMap[key] || key
            formValues[fieldName] = value
          }
          form.setFieldsValue(formValues)
          message.info('已加载当前资源配置，修改后重新生成')
        })
        .catch((err) => {
          console.error('加载资源配置失败:', err)
          message.warning('无法加载当前配置，请手动填写')
        })
        .finally(() => setLoadingConfig(false))
    }
  }, [operationType, resourceType, resourceId, form])

  const handleGenerate = async () => {
    try {
      const values = await form.validateFields()
      setGenerating(true)
      const params = values as Record<string, unknown>
      const result = await generateTf({
        resource_type: schema.resource_type,
        params,
        user_description: userDescription || undefined,
      })
      setGeneratedTf(result.tf_content)
      message.success(userDescription ? '结合自然语言描述，配置生成成功！' : 'Terraform 配置生成成功！')
    } catch (err: unknown) {
      if (err instanceof Error) {
        message.error(err.message || '生成失败')
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleUpdateGenerate = async () => {
    try {
      const values = await form.validateFields()
      setGenerating(true)
      const params = values as Record<string, unknown>
      const result = await generateUpdateTf(
        schema.resource_type,
        targetResourceAddress || '',
        params,
        userDescription || undefined,
      )
      setGeneratedTf(result.tf_content)
      message.success(userDescription ? '结合自然语言描述，更新配置已生成' : '更新配置已生成')
    } catch (err: unknown) {
      if (err instanceof Error) {
        message.error(err.message || '生成失败')
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleDestroyGenerate = async () => {
    if (!targetResourceAddress) return
    setGenerating(true)
    try {
      const result = await generateDestroyTf(targetResourceAddress, userDescription || undefined)
      setGeneratedTf(result.tf_content)
      if (!result.tf_content) {
        message.info('使用 terraform state 直接销毁，无需额外配置')
      } else {
        message.success(userDescription ? '结合自然语言描述，销毁配置已生成' : '销毁配置已生成')
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        message.error(err.message || '生成失败')
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleConfirm = () => {
    if (operationType === 'destroy') {
      onComplete({}, generatedTf || '')
    } else if (generatedTf) {
      onComplete(form.getFieldsValue() as Record<string, unknown>, generatedTf)
    }
  }

  const renderFormItem = (param: ResourceSchema['core_params'][0]) => {
    const commonProps = {
      label: param.label,
      name: param.name,
      rules: [
        { required: param.required, message: `请输入${param.label}` },
        ...(param.type === 'number'
          ? [{ type: 'number' as const, min: param.min, max: param.max, message: `取值范围 ${param.min} - ${param.max}` }]
          : []),
        ...(param.pattern
          ? [{ pattern: new RegExp(param.pattern), message: param.description || '格式不正确' }]
          : []),
      ],
      initialValue: param.default,
      tooltip: param.description,
    }

    switch (param.type) {
      case 'select':
        return (
          <Form.Item {...commonProps} key={param.name}>
            <Select
              placeholder={`请选择${param.label}`}
              options={param.options?.map((o) => ({ label: o, value: o }))}
              size="large"
            />
          </Form.Item>
        )
      case 'number':
        return (
          <Form.Item {...commonProps} key={param.name}>
            <InputNumber style={{ width: '100%' }} min={param.min} max={param.max} placeholder={`${param.min} - ${param.max}`} size="large" />
          </Form.Item>
        )
      case 'password':
        return (
          <Form.Item {...commonProps} key={param.name}>
            <Password placeholder={`请输入${param.label}`} size="large" />
          </Form.Item>
        )
      default:
        return (
          <Form.Item {...commonProps} key={param.name}>
            <Input placeholder={`请输入${param.label}`} size="large" />
          </Form.Item>
        )
    }
  }

  return (
    <Card
      style={{
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <Title level={4} style={{ marginBottom: 24 }}>
        {operationType === 'create' ? '配置参数' : operationType === 'update' ? '修改参数' : '确认销毁'} — {schema.display_name}
      </Title>

      {operationType === 'update' && (
        <Alert
          type="info"
          icon={<EditOutlined />}
          message="修改已有资源配置"
          description={`正在修改资源: ${targetResourceAddress || ''}。当前配置已自动加载，修改后重新生成。`}
          showIcon
          style={{ marginBottom: 16, borderRadius: 6 }}
        />
      )}

      {operationType === 'create' || operationType === 'update' ? (
        <>
          <Spin spinning={loadingConfig} tip="加载当前配置...">
            <Form form={form} layout="vertical" style={{ maxWidth: 600 }}>
              {schema.core_params.map(renderFormItem)}
            </Form>
          </Spin>

          {/* 自然语言描述 */}
          <Card
            size="small"
            title={<span style={{ fontSize: 13, fontWeight: 600 }}>📝 自然语言描述（可选）</span>}
            style={{
              marginTop: 16,
              marginBottom: 16,
              background: '#f8fafc',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
            }}
          >
            <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
              除了表单参数外，还可以用自然语言描述更多需求，LLM 会结合两者生成更精准的配置。
            </Text>
            <TextArea
              value={userDescription}
              onChange={(e) => setUserDescription(e.target.value)}
              placeholder="例如：创建一个上海地域的OSS存储桶，存储类型为低频访问，开启版本控制"
              rows={3}
              style={{ fontFamily: 'inherit', borderRadius: 6 }}
            />
          </Card>

          <Space>
            <Button
              type="primary"
              size="large"
              icon={<ThunderboltOutlined />}
              onClick={operationType === 'update' ? handleUpdateGenerate : handleGenerate}
              loading={generating}
              style={{ borderRadius: 8, minWidth: 160 }}
            >
              {operationType === 'update' ? '生成更新配置' : '生成 Terraform 配置'}
            </Button>
          </Space>

          {generatedTf && (
            <Card
              title={<span style={{ fontSize: 13, fontWeight: 600 }}>生成的 Terraform 配置</span>}
              size="small"
              style={{
                marginTop: 24,
                background: '#f8fafc',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
              }}
            >
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
                  background: '#f1f5f9',
                  padding: 12,
                  borderRadius: 6,
                }}
              >
                {generatedTf}
              </pre>
              <Space style={{ marginTop: 16 }}>
                <Button type="primary" size="large" onClick={handleConfirm} style={{ borderRadius: 6, minWidth: 140 }}>
                  确认，下一步 Plan
                </Button>
                <Button onClick={() => setGeneratedTf(null)} style={{ borderRadius: 6 }}>
                  重新生成
                </Button>
              </Space>
            </Card>
          )}
        </>
      ) : (
        <div>
          <Alert
            type="warning"
            message="销毁操作不可逆"
            description="即将销毁选中的资源，此操作无法撤销。请确保已备份重要数据。"
            showIcon
            style={{ marginBottom: 16, borderRadius: 6 }}
          />

          <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14, color: '#374151' }}>
            目标资源
          </Text>
          <Text code style={{ fontSize: 13, padding: '4px 8px', borderRadius: 4 }}>
            {targetResourceAddress || '未选择'}
          </Text>

          {/* 自然语言描述 - 销毁模式 */}
          <Card
            size="small"
            title={<span style={{ fontSize: 13, fontWeight: 600 }}>📝 自然语言描述（可选）</span>}
            style={{
              marginTop: 16,
              marginBottom: 16,
              background: '#fef2f2',
              borderRadius: 8,
              border: '1px solid #fecaca',
            }}
          >
            <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
              你可以用自然语言描述销毁的具体要求，LLM 会结合描述生成更精准的销毁配置。
            </Text>
            <TextArea
              value={userDescription}
              onChange={(e) => setUserDescription(e.target.value)}
              placeholder="例如：销毁时同时删除关联的OSS Bucket ACL配置"
              rows={3}
              style={{ fontFamily: 'inherit', borderRadius: 6 }}
            />
          </Card>

          <Space>
            <Button
              type="primary"
              danger
              size="large"
              icon={<ThunderboltOutlined />}
              onClick={handleDestroyGenerate}
              loading={generating}
              style={{ borderRadius: 8, minWidth: 160 }}
            >
              生成销毁配置
            </Button>
          </Space>

          {generatedTf && (
            <Card
              title={<span style={{ fontSize: 13, fontWeight: 600 }}>生成的 Terraform 配置</span>}
              size="small"
              style={{
                marginTop: 24,
                background: '#fef2f2',
                borderRadius: 8,
                border: '1px solid #fecaca',
              }}
            >
              <pre
                style={{
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  fontSize: 12,
                  maxHeight: 200,
                  overflow: 'auto',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  color: '#1e293b',
                  background: '#f1f5f9',
                  padding: 12,
                  borderRadius: 6,
                }}
              >
                {generatedTf}
              </pre>
              <Space style={{ marginTop: 16 }}>
                <Button type="primary" danger size="large" onClick={handleConfirm} style={{ borderRadius: 6, minWidth: 160 }}>
                  确认销毁，下一步 Plan
                </Button>
                <Button onClick={() => setGeneratedTf(null)} style={{ borderRadius: 6 }}>
                  重新生成
                </Button>
              </Space>
            </Card>
          )}

          {!generatedTf && !generating && (
            <div style={{ marginTop: 24 }}>
              <Card
                size="small"
                style={{
                  marginTop: 16,
                  borderColor: '#bfdbfe',
                  borderRadius: 8,
                  background: '#eff6ff',
                }}
              >
                <Text>
                  资源不在当前 Terraform state 中，将直接使用 <code>-target={targetResourceAddress}</code> 执行 plan-destroy
                </Text>
              </Card>
              <Space style={{ marginTop: 16 }}>
                <Button type="primary" danger size="large" onClick={handleConfirm} style={{ borderRadius: 6, minWidth: 160 }}>
                  确认，下一步 Plan Destroy
                </Button>
              </Space>
            </div>
          )}
        </div>
      )}

      <Button onClick={onBack} style={{ marginTop: 16, borderRadius: 6 }}>
        返回上一步
      </Button>
    </Card>
  )
}

export default ConfigDialog