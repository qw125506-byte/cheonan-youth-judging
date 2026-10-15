import templateDataUrl from '../assets/uigyeolseo-template.hwpx?inline'
import { useApp } from './ctx'
import { Button, Card, Notice } from './ui'
import { buildFill, buildUigyeolHwpx, uigyeolBlockers } from '../lib/hwpx'
import { downloadBlob, fileStamp } from '../lib/exporters'
import { logSystem } from '../lib/store'

function templateBytes(): Uint8Array {
  const b64 = templateDataUrl.slice(templateDataUrl.indexOf(',') + 1)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** 최종 결과보고: 「심사의결서」 원본 한글 양식(.hwpx)에 1~6위·평균·위원 성명을 채워 내려받는다 */
export default function UigyeolCard() {
  const { data, results, update, notify } = useApp()
  const blockers = uigyeolBlockers(results)
  const fill = blockers.length ? null : buildFill(data, results)

  function download() {
    if (!fill) return
    if (!data.chairJudgeId && !confirm('위원장을 선택하지 않아 의결란 성명 칸이 비어 있게 됩니다. 그래도 내려받을까요?')) return
    if (!data.finalized && !confirm('아직 심사결과를 확정하지 않았습니다(「④ 최종 순위·수상」). 확정 전 결과로 내려받을까요?')) return
    const bytes = buildUigyeolHwpx(templateBytes(), fill)
    downloadBlob(new Blob([bytes as BlobPart], { type: 'application/hwp+zip' }), `청년정책공모전_심사의결서_${fileStamp(data)}.hwpx`)
    notify('심사의결서(한글 파일)를 내려받았습니다')
  }

  return (
    <Card title="⑥ 최종 결과보고 — 심사의결서 (한글 .hwpx)">
      <p className="mb-3 text-sm text-gray-600">
        「제안심사위원회 심사의결서」 원본 양식에 심사일시·참석 인원·선정 6건(최우수·우수·장려 줄)·위원 성명을 채운 한글 파일을 만듭니다.
        양식(글꼴·표·밑줄)은 그대로이며 서명란은 비워 둡니다. 제안명이 길면 6줄을 같은 크기로 줄여 항상 1쪽에 맞춥니다. 한글에서 열어 바로 인쇄하세요.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="chair" className="font-semibold">위원장(당일 호선)</label>
        <select id="chair" value={data.chairJudgeId ?? ''} disabled={!!data.finalized}
          onChange={(e) => {
            const id = e.target.value || null
            const name = data.judges.find((j) => j.id === id)?.name ?? '미정'
            update((d) => logSystem({ ...d, chairJudgeId: id }, `위원장 지정: ${name}`))
          }}
          className="rounded border border-gray-300 px-2 py-1.5">
          <option value="">미정</option>
          {data.judges.map((j, i) => <option key={j.id} value={j.id}>위원{i + 1} {j.name}</option>)}
        </select>
        <span className="text-xs text-gray-500">나머지 5명은 위원 칸에 위원 번호 순서로 들어갑니다.</span>
      </div>

      {blockers.length > 0 ? (
        <Notice kind="warn">아직 만들 수 없습니다 — {blockers.join(' / ')}</Notice>
      ) : (
        <div className="mb-3 overflow-x-auto">
          <div className="rounded border border-gray-300 bg-white px-4 py-3 text-sm leading-7">
            <div className="mb-1 text-xs text-gray-500">의결서에 들어갈 선정 내용 미리보기</div>
            {fill!.winners.map((title, i) => (
              <div key={i} className="underline decoration-gray-400 underline-offset-4">
                <span className="font-semibold">{['(최 우 수)', '(우 수)', '(우 수)', '(장 려)', '(장 려)', '(장 려)'][i]}</span> {title}
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            의결: 위원장 {fill!.names[0] ?? '(미정 — 비워 둠)'}{fill!.names.length ? ` / 위원 ${fill!.names.slice(1).join(', ')}` : ''} · 참석 {fill!.attendees}명 · 심사 {fill!.count}건
          </p>
        </div>
      )}
      <Button variant="primary" disabled={blockers.length > 0} onClick={download}>심사의결서 내려받기 (.hwpx)</Button>
    </Card>
  )
}
