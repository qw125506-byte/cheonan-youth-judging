import { useEffect, useRef, useState } from 'react'
import { fmtScore, parseScore } from '../lib/calc'

interface Props {
  value: number | null
  max: number
  allowDecimal: boolean
  disabled?: boolean
  /** 키보드 이동용 격자 이름과 좌표 */
  grid: string
  row: number
  col: number
  onCommit: (v: number | null) => void
  /** Enter 키 이동 방향(기본: 아래) */
  enterAxis?: 'down' | 'right'
  className?: string
  title?: string
}

/**
 * 키보드 이동. down: 아래 칸(없으면 다음 열 첫 행), right: 오른쪽 칸(없으면 다음 행 첫 칸), up: 위 칸.
 */
function moveFocus(grid: string, row: number, col: number, dir: 'down' | 'up' | 'right') {
  const q = (r: number, c: number) =>
    document.querySelector<HTMLInputElement>(`input[data-grid="${grid}"][data-row="${r}"][data-col="${c}"]:not(:disabled)`)
  const next = dir === 'down' ? q(row + 1, col) ?? q(0, col + 1)
    : dir === 'right' ? q(row, col + 1) ?? q(row + 1, 0)
    : q(row - 1, col)
  if (next) { next.focus(); next.select() }
}

/**
 * 점수 입력칸. 입력 중에는 로컬 문자열을 유지하고 Enter·Tab·포커스 이동 시 확정한다.
 * 잘못된 값(문자·음수·배점 초과·허용되지 않은 소수점)은 저장하지 않고 빨간 테두리와 사유를 보여준다.
 */
export default function ScoreInput({ value, max, allowDecimal, disabled, grid, row, col, onCommit, enterAxis = 'down', className = '', title }: Props) {
  const [text, setText] = useState(fmtScore(value))
  const [error, setError] = useState<string | null>(null)
  const focused = useRef(false)

  useEffect(() => { if (!focused.current) { setText(fmtScore(value)); setError(null) } }, [value])

  function commit(): boolean {
    const r = parseScore(text, max, allowDecimal)
    if (!r.ok) { setError(r.error); return false }
    setError(null)
    if (r.value !== value) onCommit(r.value)
    setText(fmtScore(r.value))
    return true
  }

  return (
    <span className="relative inline-block">
      <input
        className={`score num w-14 rounded border px-1.5 py-1 text-right text-[15px] outline-none focus:ring-2 disabled:bg-gray-100 disabled:text-gray-500 ${
          error ? 'border-red-500 bg-red-50 focus:ring-red-300' : value === null ? 'border-amber-300 bg-amber-50/50 focus:ring-navy-200' : 'border-gray-300 bg-white focus:ring-navy-200'
        } ${className}`}
        inputMode={allowDecimal ? 'decimal' : 'numeric'}
        value={text}
        disabled={disabled}
        data-grid={grid}
        data-row={row}
        data-col={col}
        aria-label={title}
        aria-invalid={!!error}
        title={error ?? title ?? `0 ~ ${max}점`}
        placeholder="-"
        onFocus={(e) => { focused.current = true; e.target.select() }}
        onBlur={() => { focused.current = false; commit() }}
        onChange={(e) => { setText(e.target.value); if (error) setError(null) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (commit()) moveFocus(grid, row, col, enterAxis)
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (commit()) moveFocus(grid, row, col, 'down')
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (commit()) moveFocus(grid, row, col, 'up')
          } else if (e.key === 'Escape') {
            setText(fmtScore(value)); setError(null)
          }
        }}
      />
      {error && (
        <span role="alert" className="absolute left-0 top-full z-20 mt-1 w-max max-w-56 rounded bg-red-600 px-2 py-1 text-xs text-white shadow">
          {error}
        </span>
      )}
    </span>
  )
}
