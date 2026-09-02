import React, { useEffect, useState } from 'react'
import { Card, Form, Input, InputNumber, Select, Button, Typography, message, Spin, Alert } from 'antd'
import { EditOutlined } from '@ant-design/icons'
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

  // 更新模式：加载当前资源配置回填表单
  useEffect(() => {
    if (operationType === 'update' && resourceType && resourceId) {
      setLoadingConfig(true)
      getResourceConfig(resourceType, resourceId)
        .then((config) => {
          // 将后端返回的配置字段映射到表单字段名
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
      })

      setGeneratedTf(result.tf_content)
      message.success('Terraform 配置生成成功！')
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
      )

      setGeneratedTf(result.tf_content)
      message.success('更新配置已生成')
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
      const result = await generateDestroyTf(targetResourceAddress)
      setGeneratedTf(result.tf_content)
      if (!result.tf_content) {
        message.info('使用 terraform state 直接销毁，无需要生成额外配置')
      } else {
        message.success('销毁配置已生成')
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
      // 销毁模式：即使生成的 tf 为空也继续（使用 -target 直接销毁）
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
          ? [
              {
                type: 'number' as const,
                min: param.min,
                max: param.max,
                message: `取值范围 ${param.min} - ${param.max}`,
              },
            ]
          : []),
        ...(param.pattern
          ? [
              {
                pattern: new RegExp(param.pattern),
                message: param.description || '格式不正确',
              },
            ]
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
            />
          </Form.Item>
        )
      case 'number':
        return (
          <Form.Item {...commonProps} key={param.name}>
            <InputNumber
              style={{ width: '100%' }}
              min={param.min}
              max={param.max}
              placeholder={`${param.min} - ${param.max}`}
            />
          </Form.Item>
        )
      case 'password':
        return (
          <Form.Item {...commonProps} key={param.name}>
            <Password placeholder={`请输入${param.label}`} />
          </Form.Item>
        )
      default:
        return (
          <Form.Item {...commonProps} key={param.name}>
            <Input placeholder={`请输入${param.label}`} />
          </Form.Item>
        )
    }
  }

  return (
    <Card>
      <Title level={5} style={{ marginBottom: 24 }}>
        {operationType === 'create' ? '配置参数' : operationType === 'update' ? '修改参数' : '确认销毁'} — {schema.display_name}
      </Title>

      {/* 更新模式提示 */}
      {operationType === 'update' && (
        <Alert
          type="info"
          icon={<EditOutlined />}
          message="修改已有资源配置"
          description={`正在修改资源: ${targetResourceAddress || ''}。当前配置已自动加载，修改后生成新的 Terraform 配置。`}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {operationType === 'create' || operationType === 'update' ? (
        <>
          <Spin spinning={loadingConfig} tip="加载当前配置...">
            <Form form={form} layout="vertical" style={{ maxWidth: 600 }}>
              {schema.core_params.map(renderFormItem)}
            </Form>
          </Spin>

          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            <Button
              type="primary"
              size="large"
              onClick={operationType === 'update' ? handleUpdateGenerate : handleGenerate}
              loading={generating}
            >
              {generating ? <Spin /> : null}
              {operationType === 'update' ? '生成更新配置' : '生成 Terraform 配置'}
            </Button>
          </div>

          {generatedTf && (
            <Card
              title="生成的 Terraform 配置"
              size="small"
              style={{ marginTop: 24, background: '#f6f8fa' }}
            >
              <TextArea
                value={generatedTf}
                rows={10}
                readOnly
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
              <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                <Button type="primary" onClick={handleConfirm}>
                  确认，下一步 Plan
                </Button>
                <Button onClick={() => setGeneratedTf(null)}>重新生成</Button>
              </div>
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
            style={{ marginBottom: 16 }}
          />

          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            目标资源
          </Text>
          <Text code style={{ fontSize: 13 }}>
            {targetResourceAddress || '未选择'}
          </Text>

          <div style={{ marginTop: 24 }}>
            <Button
              type="primary"
              danger
              size="large"
              onClick={handleDestroyGenerate}
              loading={generating}
            >
              生成销毁配置
            </Button>
          </div>

          {generatedTf && (
            <Card
              title="生成的 Terraform 配置"
              size="small"
              style={{ marginTop: 24, background: '#f6f8fa' }}
            >
              <TextArea
                value={generatedTf}
                rows={5}
                readOnly
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
              <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                <Button type="primary" danger onClick={handleConfirm}>
                  确认销毁，下一步 Plan Destroy
                </Button>
                <Button onClick={() => setGeneratedTf(null)}>重新生成</Button>
              </div>
            </Card>
          )}

          {!generatedTf && !generating && (
            <div style={{ marginTop: 24 }}>
              <Card
                size="small"
                style={{ marginTop: 16, borderColor: '#bae0ff' }}
              >
                资源不在当前 Terraform state 中，将直接使用 <code>-target={targetResourceAddress}</code> 执行 plan-destroy
              </Card>
              <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                <Button type="primary" danger onClick={handleConfirm}>
                  确认，下一步 Plan Destroy
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Button onClick={onBack} style={{ marginTop: 16 }}>
        返回上一步
      </Button>
    </Card>
  )
}

export default ConfigDialog