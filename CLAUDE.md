# Studio M — 작업 안내

Windows용 영상 편집기(Electron + React + TypeScript + Vite, 상태 관리 zustand). 지금은 **사전 제작(S1~S6) 기능**을 단계별로 붙이는 중입니다.

- 먼저 읽기: [docs/HANDOFF.md](docs/HANDOFF.md) — 진행 현황, 코드 위치, 다음 할 일
- 확정 설계: [docs/preproduction-design.md](docs/preproduction-design.md) — 설계를 바꿀 때는 사용자에게 확인받고 이 문서도 함께 고칠 것
- 편집기 기능 결정: [docs/editor-feature-decisions.md](docs/editor-feature-decisions.md)

## 규칙
- 화면 문구·커밋 메시지는 한국어
- `main`에 push + `package.json` 버전 변경 = 자동 릴리스(사용자 PC 자동 업데이트). 작업은 기능 브랜치에서, main 반영·버전 올리기는 사용자 확인 후
- 요금이 나가는 AI 생성은 실행 전 예상 금액 표시·확인, 예산 한도 넘으면 멈춤
- API 키 값은 렌더러로 보내지 않음, 작업 폴더 밖 경로는 건드리지 않음
- 확인: `npm run build`(타입 검사 포함) 후 `node_modules\electron\dist\electron.exe .`로 실행해 화면 확인
