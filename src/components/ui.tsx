import type { ReactNode } from 'react'

export function Card({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-gray-200 bg-white shadow-sm ${className}`}>
      {(title || right) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2.5">
          {title && <h2 className="text-[15px] font-bold text-navy-800">{title}</h2>}
          <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

const BTN = {
  primary: 'bg-navy-700 text-white hover:bg-navy-800 disabled:bg-gray-300',
  secondary: 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 disabled:text-gray-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-300',
}

export function Button({ variant = 'secondary', className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN }) {
  return <button {...p} className={`rounded px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed ${BTN[variant]} ${className}`} />
}

const AWARD_STYLE: Record<string, string> = {
  최우수: 'bg-navy-700 text-white',
  우수: 'bg-navy-100 text-navy-800',
  장려: 'bg-sky-50 text-sky-800 border border-sky-200',
  미선정: 'text-gray-500',
  '동점 확인 필요': 'bg-amber-100 text-amber-900 border border-amber-300 font-bold',
  '집계 미완료': 'text-gray-400',
}

export function AwardBadge({ award, provisional }: { award: string; provisional?: boolean }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ${AWARD_STYLE[award] ?? ''}`}>
      {award}{provisional && ['최우수', '우수', '장려'].includes(award) ? '(잠정)' : ''}
    </span>
  )
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  const s = {
    info: 'border-navy-200 bg-navy-50 text-navy-900',
    warn: 'border-amber-300 bg-amber-50 text-amber-900',
    error: 'border-red-300 bg-red-50 text-red-800',
    ok: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  }[kind]
  return <div className={`rounded border px-3 py-2 text-sm ${s}`}>{children}</div>
}

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onMouseDown={onClose}>
      <div className={`mt-10 w-full rounded-lg bg-white shadow-xl ${wide ? 'max-w-4xl' : 'max-w-xl'}`} onMouseDown={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
        <div className="flex items-center border-b px-4 py-3">
          <h3 className="font-bold text-navy-800">{title}</h3>
          <button className="ml-auto rounded px-2 text-xl leading-none text-gray-500 hover:bg-gray-100" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export const kst = (iso: string) => (iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '')
