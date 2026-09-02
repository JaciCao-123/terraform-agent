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
      ref={logRef}
      style={{
        background: '#1a1a2e',
        borderRadius: 10,
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
        <Text style={{ color: '#64748b', fontStyle: 'italic' }}>
          $ {placeholder}
        </Text>
      )}
      {logs.map((line, i) => {
        const isError = /\[(ERROR|FATAL)\]|Error:|error:|Failed:|failed:/i.test(line)
        const isWarning = /\[WARN\]|Warning:|warning:/i.test(line)
        const isSuccess = /Plan:|Apply complete|Destroy complete|No changes/i.test(line)
        const isHeading = /^---|^===|^\+ |^~ |^- /i.test(line)
        const isPlanAdd = /^  \+/i.test(line) || /^\+ /i.test(line)
        const isPlanRemove = /^- /i.test(line) || /^  -/i.test(line)
        const isPlanChange = /^~ /i.test(line) || /^  ~/i.test(line)
        let color = '#e2e8f0'
        if (isError) color = '#ef4444'
        else if (isWarning) color = '#f59e0b'
        else if (isSuccess) color = '#22c55e'
        else if (isHeading) color = '#60a5fa'
        else if (isPlanAdd) color = '#22c55e'
        else if (isPlanRemove) color = '#ef4444'
        else if (isPlanChange) color = '#f59e0b'
        return (
          <div
            key={i}
            style={{
              color,
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