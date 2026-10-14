import { useApp, type PrintDoc } from '../components/ctx'
import { kst } from '../components/ui'
import { categoriesOf, evalKey, fmt2, fmtScore, summarizeEvaluation } from '../lib/calc'

const th = 'border border-black px-1 py-1 font-semibold bg-[#e9eef7]'
const td = 'border border-black px-1 py-1'

function Header({ title, sub }: { title: string; sub?: string }) {
  const { data } = useApp()
  return (
    <div className="mb-3">
      {data.dataMode === 'test' && <div className="mb-1 text-center text-sm font-bold text-orange-600">※ 연습용 테스트 데이터 — 실제 심사결과 아님</div>}
      <h1 className="text-center text-[20px] font-bold tracking-tight">{title}</h1>
      {sub && <div className="mt-1 text-center text-[12px]">{sub}</div>}
    </div>
  )
}

const today = () => new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })

export default function PrintDocs({ doc }: { doc: PrintDoc }) {
  const landscape = doc.kind !== 'final'
  return (
    <div className="text-black" style={{ fontSize: '10.5pt' }}>
      <style>{`@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 9mm 9mm; }`}</style>
      {doc.kind === 'judgeSheets' && doc.judgeIds.map((id) => <JudgeSheet key={id} judgeId={id} blank={doc.blank} />)}
      {doc.kind === 'summary' && <SummarySheet />}
      {doc.kind === 'final' && <FinalSheet />}
    </div>
  )
}

function JudgeSheet({ judgeId, blank }: { judgeId: string; blank?: boolean }) {
  const { data } = useApp()
  const j = data.judges.find((x) => x.id === judgeId)!
  const cats = categoriesOf(data.criteria)
  return (
    <section className="page">
      <Header title="2026 천안시 청년정책 아이디어 공모전 제안 심사표" sub={`심사위원: ${j.affiliation} ${j.name}  ·  심사일: 2026. 10. 19.`} />
      <table className="w-full" style={{ fontSize: '8pt', tableLayout: 'fixed', lineHeight: 1.25 }}>
        <thead>
          <tr>
            <th rowSpan={2} className={th} style={{ width: '3%' }}>연번</th>
            <th rowSpan={2} className={th} style={{ width: '27%' }}>제안명</th>
            {cats.map((c) => <th key={c} colSpan={data.criteria.filter((x) => x.category === c).length} className={th}>{c}</th>)}
            {cats.map((c) => <th key={c} rowSpan={2} className={th} style={{ width: '3.9%', fontSize: '7pt' }}>{c}<br />소계</th>)}
            <th rowSpan={2} className={th} style={{ width: '4.6%' }}>총점<br />(100)</th>
          </tr>
          <tr>{data.criteria.map((c) => <th key={c.id} className={`${th} font-normal`} style={{ fontSize: '6.5pt', width: '4.6%', lineHeight: 1.15 }}>{c.label} ({c.max})</th>)}</tr>
        </thead>
        <tbody>
          {data.proposals.map((p) => {
            const ev = blank ? undefined : data.evaluations[evalKey(judgeId, p.no)]
            const s = summarizeEvaluation(ev, data.criteria)
            return (
              <tr key={p.no} style={{ height: '7.6mm' }}>
                <td className={`${td} text-center`}>{p.no}</td>
                <td className={td}>{p.title}</td>
                {ev?.mode === 'total'
                  ? <td colSpan={data.criteria.length + cats.length} className={`${td} text-center`}>총점 직접입력 (세부점수 없음)</td>
                  : <>
                    {data.criteria.map((c) => <td key={c.id} className={`${td} num text-center`}>{fmtScore(ev?.items[c.id] ?? null)}</td>)}
                    {cats.map((c) => <td key={c} className={`${td} num text-center`}>{fmtScore(s.subtotals[c])}</td>)}
                  </>}
                <td className={`${td} num text-center font-bold`}>{fmtScore(s.total)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-3 text-right text-[12pt]">
        심 사 자 &nbsp;&nbsp; 성 명 : <span className="inline-block w-40 border-b border-black text-center">{j.name}</span> &nbsp;(서명)
      </div>
    </section>
  )
}

function SummarySheet() {
  const { data, results } = useApp()
  const rows = [...results.rows].sort((a, b) => a.no - b.no)
  return (
    <section className="page">
      <Header title="2026 천안시 청년정책 아이디어 공모전 심사결과 종합 집계표"
        sub={`심사일 2026. 10. 19. · 작성 ${today()} · 최고·최저점 각 1개 제외 후 4명 평균${results.allComplete ? '' : ' · ※ 입력 미완료(잠정)'}`} />
      <table className="w-full" style={{ fontSize: '9pt' }}>
        <thead>
          <tr>
            <th className={th}>번호</th>
            <th className={th} style={{ width: '28%' }}>제안명</th>
            {data.judges.map((j, i) => <th key={j.id} className={th}>위원{i + 1}<br />{j.name}</th>)}
            <th className={th}>최고점</th><th className={th}>최저점</th><th className={th}>제외 후<br />합계</th>
            <th className={th}>최종<br />평균</th><th className={th}>순위</th><th className={th}>선정 결과</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const a = r.agg
            return (
              <tr key={r.no}>
                <td className={`${td} text-center`}>{r.no}</td>
                <td className={td}>{r.title}</td>
                {a.scores.map((s, i) => (
                  <td key={i} className={`${td} num text-center`} style={i === a.maxIndex ? { color: '#c00', fontWeight: 700 } : i === a.minIndex ? { color: '#888', textDecoration: 'line-through' } : {}}>
                    {fmtScore(s)}
                  </td>
                ))}
                <td className={`${td} num text-center`}>{fmtScore(a.max)}</td>
                <td className={`${td} num text-center`}>{fmtScore(a.min)}</td>
                <td className={`${td} num text-center`}>{fmtScore(a.trimmedSum)}</td>
                <td className={`${td} num text-center font-bold`}>{fmt2(a.avg)}</td>
                <td className={`${td} num text-center`}>{r.rank === null ? '' : r.decided ? r.position : r.tieSize > 1 ? `공동${r.rank}` : r.rank}</td>
                <td className={`${td} text-center`}>{r.award === '집계 미완료' ? '' : r.award}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2" style={{ fontSize: '8.5pt' }}>※ 빨간 굵은 글씨: 제외된 최고점, 회색 취소선: 제외된 최저점. 평균은 소수 둘째 자리 반올림 표시(순위는 원값 기준).
        {' '}최종 평균이 같으면 ① 실시가능성 합계(위원 6명 소계 합) ② 효율성(경제성) 합계가 높은 순으로 순위를 정하고, 그래도 같으면 공동순위로 두고 수상 등급 경계에 걸치면 위원회가 결정합니다.
        {results.rows.filter((r) => r.brokenBy && r.avgTieSize > 1).map((r) => ` 제안 ${r.no}: ${r.brokenBy}(실시 ${fmtScore(r.tieBreak![0])}, 효율 ${fmtScore(r.tieBreak![1])}).`).join('')}
        {results.tieGroups.filter((g) => g.decision).map((g) => ` 동점(제안 ${g.nos.join('·')})은 위원회 결정: ${g.decision!.reason}.`).join('')}</p>
    </section>
  )
}

function FinalSheet() {
  const { data, results } = useApp()
  const prize: Record<string, string> = { 최우수: '1,000천원', 우수: '500천원', 장려: '200천원' }
  return (
    <section className="page">
      <Header title="2026 천안시 청년정책 아이디어 공모전 최종 선정 결과" sub={`심사일 2026. 10. 19. · 작성 ${today()}`} />
      {!results.allComplete && <p className="mb-2 text-center font-bold text-red-700">※ 전체 평가 입력 전 잠정 결과입니다</p>}
      {results.unresolvedTies.length > 0 && <p className="mb-2 text-center font-bold text-red-700">※ 수상 경계 동점 미결정 — 수상자 미확정</p>}
      <table className="w-full" style={{ fontSize: '10pt', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th className={th} style={{ width: '9%' }}>순위</th><th className={th} style={{ width: '8%' }}>제안<br />번호</th><th className={th}>제안명</th>
            <th className={th} style={{ width: '10%' }}>최종 평균</th><th className={th} style={{ width: '10%' }}>선정 등급</th><th className={th} style={{ width: '12%' }}>시상금</th>
          </tr>
        </thead>
        <tbody>
          {results.rows.map((r) => (
            <tr key={r.no} style={['최우수', '우수', '장려'].includes(r.award) ? { fontWeight: 600 } : {}}>
              <td className={`${td} num text-center`}>{r.position === null ? '' : r.decided ? r.position : r.tieSize > 1 ? `공동 ${r.rank}` : r.rank}</td>
              <td className={`${td} num text-center`}>{r.no}</td>
              <td className={td}>{r.title}</td>
              <td className={`${td} num text-center`}>{fmt2(r.agg.avg)}</td>
              <td className={`${td} text-center`}>{r.award === '집계 미완료' ? '' : r.award}</td>
              <td className={`${td} num text-center`}>{prize[r.award] ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2" style={{ fontSize: '8.5pt' }}>※ 최종 평균이 같으면 ① 실시가능성 합계(위원 6명 소계 합) ② 효율성(경제성) 합계가 높은 순으로 순위를 정하고, 그래도 같으면 공동순위로 두고 수상 등급 경계에 걸치면 위원회가 결정합니다.
        {results.rows.filter((r) => r.brokenBy && r.avgTieSize > 1).map((r) => ` 제안 ${r.no}: ${r.brokenBy}(실시 ${fmtScore(r.tieBreak![0])}, 효율 ${fmtScore(r.tieBreak![1])}).`).join('')}</p>
      {results.tieGroups.some((g) => g.decision) && (
        <div className="mt-3" style={{ fontSize: '9pt' }}>
          <b>동점 처리(위원회 결정)</b>
          {results.tieGroups.filter((g) => g.decision).map((g) => (
            <div key={g.key}>· 제안 {g.nos.join('·')} ({fmt2(g.avg)}점): 위원회 결정 순서 {g.decision!.order.join(' → ')} — {g.decision!.reason}</div>
          ))}
        </div>
      )}
      {data.finalized && <p className="mt-3" style={{ fontSize: '9pt' }}>확정 일시: {kst(data.finalized.at)} · 확정자: {data.finalized.by}</p>}
      <div className="mt-12 text-right text-[12pt]">심사위원장 &nbsp;&nbsp; 성 명 : <span className="inline-block w-40 border-b border-black">&nbsp;</span> &nbsp;(서명)</div>
    </section>
  )
}
