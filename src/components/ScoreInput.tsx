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
 * 점수 입력칸. 숫자를 누르는 즉시 자동 저장된다. Esc는 이 칸에 들어오기 전 값으로 되돌린다.
 * 잘못된 값(문자·음수·배점 초과·허용되지 않은 소수점)은 저장하지 않고 빨간 테두리와 사유를 보여준다.
 */
export default function ScoreInput({ value, max, allowDecimal, disabled, grid, row, col, onCommit, enterAxis = 'down', className = '', title }: Props) {
  const [text, setText] = useState(fmtScore(value))
  const [error, setError] = useState<string | null>(null)
  const focused = useRef(false)
  /** 포커스 시점의 값(Esc로 되돌리기용) */
  const atFocus = useRef<number | null>(value)
  /** 마지막으로 저장한 값(같은 값 반복 저장 방지) */
  const saved = useRef<number | null>(value)

  useEffect(() => {
    saved.current = value
    if (!focused.current) { setText(fmtScore(value)); setError(null) }
  }, [value])

  function save(v: number | null) {
    if (v !== saved.current) { saved.current = v; onCommit(v) }
  }

  /**
   * 입력하는 즉시 저장한다. 올바른 값이면 그 값을, 잘못된 값(문자·배점 초과 등)이면
   * 앞서 저장된 일부 숫자가 남지 않도록 미입력(null)으로 저장하고 오류를 표시한다.
   * 소수점 입력 중간("7.")은 아직 판단하지 않는다.
   */
  function onType(t: string) {
    setText(t)
    const r = parseScore(t, max, allowDecimal)
    if (r.ok) { setError(null); save(r.value); return }
    if (allowDecimal && /^\d+\.$/.test(t.trim())) { setError(null); return }
    setError(r.error)
    save(null)
  }

  function commit(): boolean {
    const r = parseScore(text, max, allowDecimal)
    if (!r.ok) { setError(r.error); save(null); return false }
    setError(null)
    save(r.value)
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
        onFocus={(e) => { focused.current = true; atFocus.current = value; e.target.select() }}
        onBlur={() => { focused.current = false; commit() }}
        onChange={(e) => onType(e.target.value)}
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
            setText(fmtScore(atFocus.current)); setError(null); save(atFocus.current)
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
