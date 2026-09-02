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
        background: '#0d1117',
        borderRadius: 8,
        padding: 16,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
        fontSize: 13,
        lineHeight: 1.6,
        maxHeight,
        overflow: 'auto',
        minHeight: 120,
        border: '1px solid #21262d',
      }}
    >
      {logs.length === 0 && !loading && (
        <Text style={{ color: '#484f58', fontStyle: 'italic' }}>
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
        let color = '#c9d1d9'
        if (isError) color = '#f85149'
        else if (isWarning) color = '#d29922'
        else if (isSuccess) color = '#3fb950'
        else if (isHeading) color = '#58a6ff'
        else if (isPlanAdd) color = '#3fb950'
        else if (isPlanRemove) color = '#f85149'
        else if (isPlanChange) color = '#d29922'
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
        <div style={{ color: '#58a6ff', marginTop: 4 }}>
          <Spin size="small" style={{ marginRight: 8 }} />
          {loadingText}
        </div>
      )}
    </div>
  )
}

export default TerminalView