import type { AppData, Criterion, Judge, Proposal } from './types'

// 출처: 「2026년 천안시 청년정책 아이디어 공모전 제안심사표(안)」 — 문구·배점 원문 그대로
export const CRITERIA: Criterion[] = [
  { id: 'c1', category: '실시가능성', label: '신규 인력·조직 신설 없이 기존 행정체계 내 운영 가능성', max: 10 },
  { id: 'c2', category: '실시가능성', label: '사업 목표 달성을 위한 실행 구조 및 추진계획의 현실성', max: 10 },
  { id: 'c3', category: '실시가능성', label: '사업 추진 주체와 역할 분담의 명확성', max: 5 },
  { id: 'c4', category: '효율성(경제성)', label: '투입 예산 대비 정책 효과의 적정성', max: 10 },
  { id: 'c5', category: '효율성(경제성)', label: '비용 절감 및 행정 효율성 제고 가능성', max: 10 },
  { id: 'c6', category: '창의성', label: '기존 정책과 차별화된 아이디어의 독창성', max: 15 },
  { id: 'c7', category: '창의성', label: '문제 인식 및 해결 접근 방식의 참신성', max: 10 },
  { id: 'c8', category: '계속성', label: '일회성으로 끝나지 않고 지속 추진 가능한 정책 여부', max: 10 },
  { id: 'c9', category: '계속성', label: '중장기적 정책 또는 제도화 가능성', max: 5 },
  { id: 'c10', category: '적용범위', label: '타시군 청년정책으로의 파급 가능성 정도', max: 15 },
]

// 출처: 「보고요지」 심사위원 명단
export const JUDGES: Judge[] = [
  { id: 'j1', affiliation: '전) 복지문화국장', name: '박재현' },
  { id: 'j2', affiliation: '(사)천안시기업인협의회 상임부회장', name: '윤종환' },
  { id: 'j3', affiliation: '상명대학교 산학협력단장', name: '왕한호' },
  { id: 'j4', affiliation: '백석대학교 교수', name: '최진근' },
  { id: 'j5', affiliation: '청년정책위원회 위원', name: '박정열' },
  { id: 'j6', affiliation: '청년기금운용심의위원회 위원(청년)', name: '이우제' },
]

// 출처: 「보고요지」 심사 목록(분야·검토부서) + 「제안심사표(안)」(제안내용)
export const PROPOSALS: Proposal[] = [
  { no: 1, field: '복지문화', title: '천안 청년 생활도움은행 (시간나눔 천안)', summary: '일상생활에서의 어려움을 서로 돕고 해결할 수 있는 플랫폼 구축', dept: '청년정책과' },
  { no: 2, field: '주거', title: '청년 공간회복 프로젝트 : 비움으로 다시 시작하는 삶', summary: '저장강박 증상을 겪는 청년에게 청소 및 정신건강 상담, 취업 지원 등 제공', dept: '청년정책과' },
  { no: 3, field: '복지문화', title: '야간·교대근무 청년 생활지원 패키지 ‘밤에도 청년이다’', summary: '야간·교대근무 청년 대상 수면 건강, 커뮤니티 활동 등 지원 체계 구축', dept: '청년정책과' },
  { no: 4, field: '복지문화', title: '천안 빵빵데이 연계, 전국 최초 ‘천안 빵믈리에(Bread-melier) 자격시험’ 개최', summary: "천안 빵의 역사 및 품질을 평가하는 자격시험인 '천안 빵믈리에' 개최", dept: '식품안전과' },
  { no: 5, field: '복지문화', title: '행동 데이터 및 스마트 기술(NFC/QR) 기반의 시내버스 만족도 실시간 수집 시스템 구축과 천안시 교통 복지 서비스 향상 방안', summary: "스마트 기술(NFC/QR) 기반의 시내버스 만족도 실시간 수집 시스템 구축과 대학생 중심의 '청년 버스 서포터즈' 창단을 통한 버스 운행 만족도 향상 및 관내 대학생들에게 교통비 인센티브 제공", dept: '대중교통과' },
  { no: 6, field: '복지문화', title: "똑똑똑! 복지의 사각지대에 '맑은 물'을 공급합니다!", summary: '장애인, 한부모가족, 국가유공자 등 수도 원인자부담금 지원대상 확대', dept: '맑은물사업본부' },
  { no: 7, field: '교육', title: '두렵지 않은 첫걸음, 천안 청년 창업 시뮬레이션 및 재무 멘토링 교육', summary: '가상 예산을 활용한 모의 창업 시뮬레이션 및 성장 산업 중심의 재무 분석 교육을 제공하는 실전형 교육 프로그램', dept: '청년정책과' },
  { no: 8, field: '참여권리', title: '천안시 청년 안심 법률·사고 대처 실무 교육 프로그램', summary: '실무 중심의 법률 및 고소 관련 교육 프로그램 정기 운영', dept: '청년정책과' },
  { no: 9, field: '참여권리', title: '천안시 청년정책네트워크 운영 개선 방안', summary: '검증된 중앙부처의 청년참여기구 모델 벤치마킹', dept: '청년정책과' },
  { no: 10, field: '복지문화', title: '원도심 골목상권 활성화 사업 일환 신부동 문화공원 활용을 통한 천안형 코믹행사(코스프레) 개최', summary: '천안형 서브컬쳐 축제', dept: '청년정책과' },
  { no: 11, field: '복지문화', title: '청년 이동권 보장을 통한 청년 유입 활성화 사업 「청년 직행노선 지원 프로젝트」', summary: '천안으로의 직행 교통 노선 확대', dept: '대중교통과' },
  { no: 12, field: '주거', title: '쓰담쓰담 천안', summary: '대학가에서 시작하는 인플루언서 협업형 청년 클린 챌린지', dept: '청소행정과' },
  { no: 13, field: '복지문화', title: '청년 객원단원 프로젝트 (시립예술단과 함께하는 청년 문화예술 성장 플랫폼 구축)', summary: '청년이 천안시립예술단의 객원단원이 되어 역량 및 진로, 경력 개발', dept: '문화예술과' },
  { no: 14, field: '일자리', title: '천안 청년 로컬실증 패스 — 지역 유휴공간을 활용한 청년 창업·창작 아이디어 시장 검증 지원사업', summary: '지역 유휴공간을 활용한 팝업·단기판매 지원', dept: '청년정책과' },
]

/** 선정 등급: 1위 최우수, 2~3위 우수, 4~6위 장려 */
export const AWARD_TIERS = [
  { name: '최우수', count: 1 },
  { name: '우수', count: 2 },
  { name: '장려', count: 3 },
] as const

export function createInitialData(dataMode: 'real' | 'test'): AppData {
  return {
    version: 1,
    dataMode,
    meta: {
      title: '2026년 천안시 청년정책 아이디어 공모전 제안심사',
      date: '2026-10-19',
      place: '천안시청 제2소회의실(7층)',
    },
    judges: JUDGES.map((j) => ({ ...j })),
    proposals: PROPOSALS.map((p) => ({ ...p })),
    criteria: CRITERIA.map((c) => ({ ...c })),
    settings: { allowDecimal: false },
    // 실제 심사 초기 데이터는 모든 점수 미입력
    evaluations: {},
    audit: [],
    tieDecisions: {},
    finalized: null,
  }
}
