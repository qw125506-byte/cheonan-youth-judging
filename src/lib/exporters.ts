import * as XLSX from 'xlsx'
import type { AppData } from './types'
import { categoriesOf, computeResults, evalKey, fmt2, summarizeEvaluation, verifyResults } from './calc'

type Cell = string | number | null | { f: string; v?: number | string; t?: 'n' | 's' }

function sheet(rows: Cell[][], widths: number[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) => (c !== null && typeof c === 'object' ? null : c))))
  rows.forEach((r, ri) => r.forEach((c, ci) => {
    if (c !== null && typeof c === 'object') {
      const addr = XLSX.utils.encode_cell({ r: ri, c: ci })
      ws[addr] = { t: c.t ?? 'n', f: c.f, v: c.v }
    }
  }))
  ws['!cols'] = widths.map((w) => ({ wch: w }))
  return ws
}

const col = (i: number) => XLSX.utils.encode_col(i)
const kst = (iso: string) => (iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '')

export function fileStamp(data: AppData) {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
  return data.dataMode === 'test' ? `[연습데이터]_${stamp}` : stamp
}

export function buildWorkbook(data: AppData): XLSX.WorkBook {
  const res = computeResults(data)
  const cats = categoriesOf(data.criteria)
  const wb = XLSX.utils.book_new()
  const testNote = data.dataMode === 'test' ? ' ※ 연습용 테스트 데이터 — 실제 심사결과 아님' : ''

  // 1) 위원별 원본 평가
  {
    const head: Cell[] = ['심사위원', '소속', '제안번호', '제안명', '입력방식',
      ...data.criteria.map((c) => `${c.category}: ${c.label} (${c.max})`),
      ...cats.map((c) => `${c} 소계`), '총점', '세부합계 검산', '최종 수정']
    const rows: Cell[][] = [[`위원별 원본 평가 데이터${testNote}`], head]
    for (const j of data.judges) for (const p of data.proposals) {
      const ev = data.evaluations[evalKey(j.id, p.no)]
      const s = summarizeEvaluation(ev, data.criteria)
      const r = rows.length + 1
      const itemStart = 5
      const itemEnd = itemStart + data.criteria.length - 1
      rows.push([
        j.name, j.affiliation, p.no, p.title,
        !ev ? '미입력' : ev.mode === 'total' ? '총점 직접입력(세부점수 없음)' : s.complete ? '세부항목' : `세부항목(${s.enteredItems}/${data.criteria.length} 입력)`,
        ...data.criteria.map((c) => (ev?.mode === 'detail' ? ev.items[c.id] ?? null : null)),
        ...cats.map((c) => s.subtotals[c]),
        s.total,
        ev?.mode === 'detail' && s.complete ? { f: `SUM(${col(itemStart)}${r}:${col(itemEnd)}${r})`, v: s.total! } : null,
        ev ? kst(ev.updatedAt) : '',
      ])
    }
    XLSX.utils.book_append_sheet(wb, sheet(rows, [9, 26, 8, 40, 16, ...data.criteria.map(() => 10), ...cats.map(() => 10), 8, 10, 20]), '위원별 원본')
  }

  // 2) 종합 집계표 (엑셀 수식으로 같은 계산을 다시 하여 일치 여부 표시)
  {
    const n = data.judges.length
    const head: Cell[] = ['제안번호', '제안명', ...data.judges.map((j, i) => `위원${i + 1} ${j.name}`),
      '최고점(제외)', '최저점(제외)', '제외 후 합계', '최종 평균(원값)', '최종 평균(표시)', '순위', '선정 결과', '엑셀 수식 재계산', '일치']
    const rows: Cell[][] = [[`심사결과 종합 집계표${testNote}`], head]
    const sorted = [...res.rows].sort((a, b) => a.no - b.no)
    for (const row of sorted) {
      const a = row.agg
      const r = rows.length + 1
      const rng = `${col(2)}${r}:${col(2 + n - 1)}${r}`
      const avgCol = col(2 + n + 3)
      rows.push([
        row.no, row.title, ...a.scores,
        a.max, a.min, a.trimmedSum, a.avg, a.avg === null ? '' : fmt2(a.avg),
        row.rank === null ? '' : row.tieSize > 1 ? `공동 ${row.rank}` : row.rank,
        row.award,
        a.complete ? { f: `(SUM(${rng})-MAX(${rng})-MIN(${rng}))/${n - 2}`, v: a.avg! } : '미완료',
        a.complete ? { f: `IF(ABS(${col(2 + n + 7)}${r}-${avgCol}${r})<0.000001,"일치","불일치")`, v: '일치', t: 's' } : '',
      ])
    }
    XLSX.utils.book_append_sheet(wb, sheet(rows, [8, 44, ...data.judges.map(() => 11), 11, 11, 11, 14, 12, 8, 14, 16, 8]), '종합집계표')
  }

  // 3) 최종 순위표
  {
    const rows: Cell[][] = [[`최종 순위표${testNote}`], ['정렬순위', '공동순위', '제안번호', '제안명', '검토부서', '최종 평균', '선정 등급', '동점 처리']]
    for (const row of res.rows) {
      const p = data.proposals.find((x) => x.no === row.no)!
      rows.push([row.position, row.rank === null ? '' : row.tieSize > 1 ? `공동 ${row.rank}위` : `${row.rank}위`,
        row.no, row.title, p.dept, row.agg.avg === null ? '' : fmt2(row.agg.avg), row.award,
        row.decided ? '위원회 결정' : row.needsDecision ? '결정 필요' : row.tieSize > 1 ? '동점(등급 영향 없음)' : ''])
    }
    XLSX.utils.book_append_sheet(wb, sheet(rows, [9, 10, 9, 60, 14, 10, 14, 18]), '최종순위')
  }

  // 4) 수상자 목록
  {
    const rows: Cell[][] = [[`수상자 목록${testNote}`], ['선정 등급', '순위', '제안번호', '제안명', '최종 평균', '검토부서']]
    for (const row of res.rows.filter((x) => ['최우수', '우수', '장려'].includes(x.award))) {
      const p = data.proposals.find((x) => x.no === row.no)!
      rows.push([row.award, row.position, row.no, row.title, fmt2(row.agg.avg), p.dept])
    }
    if (!res.allComplete) rows.push(['※ 전체 평가 입력 전 — 잠정 결과'])
    if (res.unresolvedTies.length) rows.push(['※ 수상 경계 동점 미결정 — 수상자 미확정'])
    if (data.finalized) rows.push([`확정 일시: ${kst(data.finalized.at)} / 확정자: ${data.finalized.by}`])
    XLSX.utils.book_append_sheet(wb, sheet(rows, [10, 8, 9, 60, 10, 14]), '수상자')
  }

  // 5) 계산 검증표
  {
    const rows: Cell[][] = [[`계산 검증표 (독립 재계산 대조)${testNote}`], ['제안번호', '점검 항목', '결과', '내용']]
    for (const v of verifyResults(data, res)) for (const c of v.checks) rows.push([v.no, c.name, c.ok ? '통과' : '오류', c.detail])
    for (const g of res.tieGroups) rows.push(['동점', `제안 ${g.nos.join('·')}`, g.crossesBoundary ? (g.decision ? '위원회 결정' : '결정 필요') : '등급 영향 없음',
      g.decision ? `순서 ${g.decision.order.join('→')} / 사유: ${g.decision.reason}` : `평균 ${fmt2(g.avg)}`])
    XLSX.utils.book_append_sheet(wb, sheet(rows, [9, 28, 12, 50]), '계산검증')
  }

  // 6) 수정 이력
  {
    const rows: Cell[][] = [['수정 이력'], ['일시', '심사위원', '제안번호', '항목', '변경 전', '변경 후', '비고']]
    for (const e of data.audit) {
      const j = data.judges.find((x) => x.id === e.judgeId)
      const c = data.criteria.find((x) => x.id === e.field)
      rows.push([kst(e.at), j?.name ?? '', e.proposalNo || '', c ? `${c.category}: ${c.label}` : e.field === 'total' ? '총점' : '시스템',
        e.before === null ? '(미입력)' : e.before, e.after === null ? '(미입력)' : e.after, e.note ?? ''])
    }
    XLSX.utils.book_append_sheet(wb, sheet(rows, [20, 9, 9, 40, 12, 12, 30]), '수정이력')
  }
  return wb
}

export function downloadXlsx(data: AppData) {
  XLSX.writeFile(buildWorkbook(data), `청년정책공모전_심사결과_${fileStamp(data)}.xlsx`)
}

function csvEscape(v: unknown) {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(data: AppData) {
  const res = computeResults(data)
  const head = ['제안번호', '제안명', ...data.judges.map((j, i) => `위원${i + 1} ${j.name}`), '최고점', '최저점', '제외 후 합계', '최종 평균', '순위', '선정 결과']
  const lines = [head]
  for (const row of [...res.rows].sort((a, b) => a.no - b.no)) {
    const a = row.agg
    lines.push([String(row.no), row.title, ...a.scores.map((s) => (s === null ? '' : String(s))),
      a.max?.toString() ?? '', a.min?.toString() ?? '', a.trimmedSum?.toString() ?? '', fmt2(a.avg),
      row.rank === null ? '' : row.tieSize > 1 ? `공동 ${row.rank}` : String(row.rank), row.award])
  }
  const csv = '﻿' + lines.map((l) => l.map(csvEscape).join(',')).join('\r\n')
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `청년정책공모전_종합집계표_${fileStamp(data)}.csv`)
}

export function downloadJson(data: AppData) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `청년정책공모전_심사데이터백업_${fileStamp(data)}.json`)
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
