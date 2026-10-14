import { useRef, useState } from 'react'
import { useApp } from '../components/ctx'
import { Button, Card, Notice } from '../components/ui'
import { downloadCsv, downloadJson, downloadXlsx } from '../lib/exporters'
import { logSystem, validateBackup } from '../lib/store'
import { createInitialData } from '../lib/initialData'
import type { AppData } from '../lib/types'

export default function OutputScreen() {
  const { data, results, print, replace, notify } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [judgeId, setJudgeId] = useState('all')
  const ids = judgeId === 'all' ? data.judges.map((j) => j.id) : [judgeId]

  async function restore(file: File) {
    let parsed: unknown
    try { parsed = JSON.parse(await file.text()) } catch { notify('JSON 파일을 읽을 수 없습니다', 'error'); return }
    const err = validateBackup(parsed)
    if (err) { notify(`복원 불가: ${err}`, 'error'); return }
    const d = parsed as AppData
    if (d.dataMode !== data.dataMode) {
      notify(`이 백업은 ${d.dataMode === 'test' ? '연습' : '실제 심사'} 데이터입니다. 현재 모드(${data.dataMode === 'test' ? '연습' : '실제 심사'})에는 복원할 수 없습니다.`, 'error')
      return
    }
    const n = Object.keys(d.evaluations).length
    if (!confirm(`백업 파일(${file.name})로 현재 데이터를 덮어씁니다.\n평가 ${n}건${d.finalized ? ', 확정 상태' : ''}.\n현재 데이터는 사라지므로 먼저 현재 데이터를 백업하는 것을 권장합니다. 계속할까요?`)) return
    replace(logSystem(d, `백업 복원: ${file.name}`))
    notify('백업을 복원했습니다')
  }

  return (
    <div className="space-y-4">
      {!results.allComplete && <Notice kind="warn">평가 입력이 끝나지 않았습니다. 지금 출력하는 집계·결과는 잠정 결과로 표시됩니다.</Notice>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="인쇄 · PDF 저장">
          <p className="mb-3 text-sm text-gray-600">인쇄 창에서 대상 프린터를 <b>‘PDF로 저장’</b>으로 고르면 PDF 파일이 됩니다. 한글은 시스템 글꼴(맑은 고딕)로 출력되어 깨지지 않습니다.</p>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-40 text-sm font-semibold">① 심사위원별 평가표</span>
              <select value={judgeId} onChange={(e) => setJudgeId(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
                <option value="all">위원 6명 전체</option>
                {data.judges.map((j, i) => <option key={j.id} value={j.id}>위원{i + 1} {j.name}</option>)}
              </select>
              <Button variant="primary" onClick={() => print({ kind: 'judgeSheets', judgeIds: ids })}>인쇄</Button>
              <Button onClick={() => print({ kind: 'judgeSheets', judgeIds: ids, blank: true })}>빈 양식 인쇄</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-40 text-sm font-semibold">② 심사결과 종합 집계표</span>
              <Button variant="primary" onClick={() => print({ kind: 'summary' })}>인쇄 (A4 가로)</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-40 text-sm font-semibold">③ 최종 선정 결과표</span>
              <Button variant="primary" onClick={() => print({ kind: 'final' })}>인쇄 (A4 세로)</Button>
            </div>
          </div>
        </Card>

        <Card title="엑셀 · CSV 내려받기">
          <div className="space-y-3">
            <div>
              <Button variant="primary" onClick={() => { downloadXlsx(data); notify('엑셀 파일을 내려받았습니다') }}>④ 엑셀(.xlsx) 내려받기</Button>
              <p className="mt-1 text-xs text-gray-600">시트: 위원별 원본 · 종합집계표 · 최종순위 · 수상자 · 계산검증 · 수정이력. 종합집계표에는 엑셀 수식으로 다시 계산한 값과 ‘일치’ 여부 열이 함께 들어 있습니다.</p>
            </div>
            <div>
              <Button onClick={() => downloadCsv(data)}>종합집계표 CSV 내려받기</Button>
            </div>
          </div>
        </Card>
      </div>

      <Card title="데이터 백업 · 복원">
        <p className="mb-3 text-sm text-gray-600">
          점수는 이 PC·이 브라우저에 자동 저장됩니다. 다른 PC로 옮기거나 만일에 대비하려면 JSON 백업 파일을 내려받아 두세요.
          (여러 PC에서 동시에 입력·공유하는 기능은 서버가 필요하여 이 버전에는 없습니다.)
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => downloadJson(data)}>백업 파일(JSON) 내려받기</Button>
          <Button onClick={() => fileRef.current?.click()}>백업 파일 불러오기</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = '' }} />
          <Button variant="danger" className="ml-auto" onClick={() => {
            const label = data.dataMode === 'test' ? '연습' : '실제 심사'
            if (!confirm(`${label} 데이터의 모든 점수·동점 결정·확정·수정 이력을 지우고 초기 상태로 되돌립니다. 되돌릴 수 없습니다.\n먼저 백업 파일을 내려받았는지 확인하세요.`)) return
            const typed = prompt(`정말 초기화하려면 '초기화'를 입력하세요 (${label} 데이터)`)
            if (typed !== '초기화') { notify('초기화를 취소했습니다'); return }
            replace(createInitialData(data.dataMode))
            notify(`${label} 데이터를 초기화했습니다`)
          }}>전체 초기화</Button>
        </div>
      </Card>
    </div>
  )
}
