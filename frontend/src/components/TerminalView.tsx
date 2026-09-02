import React, { useRef, useEffect } from 'react'
import { Spin, Typography } from 'antd'

const { Text } = Typography

interface Props {
  logs: string[]
  loading?: boolean
  loadingText?: string
  placeholder?: string
  maxHeight?: number
}

const TerminalView: React.FC<Props> = ({
  logs,
  loading = false,
  loadingText = '执行中...',
  placeholder = '等待执行...',
  maxHeight = 400,
}) => {
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div
      style={{
        background: '#1a1a2e',
        borderRadius: 8,
        padding: 16,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
        fontSize: 13,
        lineHeight: 1.6,
        maxHeight,
        overflow: 'auto',
        minHeight: 120,
        border: '1px solid #16213e',
      }}
    >
      {logs.length === 0 && !loading && (
        <Text style={{ color: '#6b7280', fontStyle: 'italic' }}>
          $ {placeholder}
        </Text>
      )}
      {logs.map((line, i) => {
        const isError = line.includes('[ERROR]') || line.includes('Error:')
        const isInfo = line.includes('[INFO]') || line.includes('---')
        const isSuccess = line.includes('Plan:') || line.includes('Apply complete')
        return (
          <div
            key={i}
            style={{
              color: isError ? '#ef4444' : isSuccess ? '#22c55e' : isInfo ? '#60a5fa' : '#e2e8f0',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {line}
          </div>
        )
      })}
      {loading && (
        <div style={{ color: '#60a5fa', marginTop: 4 }}>
          <Spin size="small" style={{ marginRight: 8 }} />
          {loadingText}
        </div>
      )}
    </div>
  )
}

export default TerminalView