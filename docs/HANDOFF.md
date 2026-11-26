# 작업 인계 — 사전 제작 기능 개발 현황

> 새 세션·다른 PC에서 이어서 작업할 때 이 문서부터 읽으세요.
> 설계: [preproduction-design.md](preproduction-design.md) · 편집기 기능 결정: [editor-feature-decisions.md](editor-feature-decisions.md)
> 참고 도구(TB Drama) 전체 분석 원본: `docs/private/TB_Drama_기능분석.md` — 개인 작품 이름이 있어 **이 PC에만 보관**(.gitignore, GitHub에 없음)

- 브랜치: `feature/preproduction-foundation` (main에는 아직 합치지 않음 — main push + 버전 변경 시 자동 릴리스됨)
- 마지막 갱신: 2026-11-26

## 1. 진행 현황

| 단계 | 내용 | 상태 |
|---|---|---|
| **A. 기반** | 홈 「제작」 메뉴, 단편/시리즈/라이브러리 폴더, 작품·화(EPxx) 데이터, 6단계 진행판, 설정 › AI 연동(키 암호화 저장·연결 테스트·모델·단가표·예산) | ✅ 완료 |
| **B. S1 스토리 개발** | 텍스트 AI 공통 호출(ChatGPT 구독 Codex / OpenAI API / Gemini), S1 화면(기획 → 로그라인 → 줄거리 → 구성 → 연출, AI 3안·자유 대화·단계 확정), 입력 자료, 스토리 확정(story.json·버전), 시리즈 이전 화 요약·복선 연결 | ✅ 완료 (ChatGPT 구독으로 기획 단계 검증) |
| C. S2 제작 바이블 | AI 추출 → 요소별 승인, 캐릭터(외형 고정 문구·연기 톤·목소리·표정/포즈 시트), 중요 의상·소품, 장소, 시리즈 바이블(상태·연결고리·변경 이력), 공용 라이브러리 | ⏳ 다음 |
| D. S3 대본·씬·컷 | 씬 → 컷(3~15초) → 샷(2~3초), 연속성 장치 4종, 촬영 기법 라이브러리 | ⏳ |
| E. S4 프롬프트 + 통합 검수 | 일괄 프롬프트 생성, 4영역 검수, 수정안 수락 | ⏳ |
| F. S5 생성 | Gemini 이미지·Veo·Omni·TTS(타입캐스트·Gemini) 호출, 예산·버전, 끝 프레임 추출, 생성 후 검수 | ⏳ |
| G. S6 넘기기 | .smproj 러프컷 자동 조립, 바뀐 컷만 교체, 업로드 정보, 제작 기록 zip | ⏳ |
| 편집기 기능 | editor-feature-decisions.md의 45개 | ⏳ (사전 제작 이후 또는 병행) |

### 검증 상태
- 타입 검사·빌드 통과, 개발 빌드 실행 확인(제작 목록, 새 작품 창, 작품 화면, S1 화면, 설정 카드)
- ChatGPT 구독(Codex) S1 흐름 확인(2026-11-26) — 기획 단계에서 AI 3안 → 「이 안으로」 → 자유 대화 수정안 「적용」 → 단계 확정 → 다음 단계 이동, session.json 저장까지 정상. 호출당 약 20~30초. 로그라인 이후 단계·스토리 최종 확정은 아직 화면으로 끝까지 안 해 봄
- 키 저장·Gemini/OpenAI/Vertex 연결 테스트는 실제 키로 확인하지 않음

## 2. 코드 위치

| 파일 | 역할 |
|---|---|
| `src/core/production.ts` | 작품 모델: 단편/시리즈, 단계(S1~S6) 정의·상태, 화면비, 폴더 이름 |
| `src/core/ai.ts` | AI 설정 타입·기본값(텍스트 AI, ChatGPT 방식, 모델, 단가표), LLM 요청/응답 타입, JSON 추출 |
| `src/core/story.ts` | S1 타입(StoryDraft·StorySession·StoryDoc), 단계 정의, AI 지시문(buildSystemPrompt), 답변 정리(normalizeStep) |
| `electron/production.ts` | 작품 폴더 생성·목록·메타 수정·단계 파일 읽기/쓰기·휴지통, 시리즈 문맥·arc.json, 입력 파일 가져오기 |
| `electron/ai.ts` | 키 safeStorage 암호화 저장(화면에는 저장 여부만), 연결 테스트, Vertex 토큰 |
| `electron/codex.ts` | Codex CLI 상태·로그인·`codex exec` 호출(읽기 전용, 빈 임시 폴더) |
| `electron/llm.ts` | 텍스트 AI 공통 호출 `llmChat` — 모든 단계가 이것만 씀 |
| `electron/main.ts` / `preload.ts` / `src/api.ts` | IPC(`prod:*`, `ai:*`, `llm:chat`, `codex:*`)와 브라우저 미리보기용 대체 구현 |
| `src/components/Productions.tsx` | 제작 목록, 새 작품 창, 작품 화면(단계 진행판, 시리즈 화 목록) |
| `src/components/StoryStage.tsx` | S1 화면 |
| `src/components/AiSettings.tsx` | 설정 › AI 연동·단계별 모델·비용 |

### 작품 폴더 (작업 폴더 = 설정의 저장 위치)
```
Studio M/
├─ 라이브러리/캐릭터·소품·장소·목소리
├─ 단편/<제목>/production.json, 01_story … 06_edit
└─ 시리즈/<제목>/series.json, series_bible/, story_arc/arc.json, EP01/episode.json + 01_story … 06_edit
```
S1 파일: `01_story/session.json`(대화·초안), `story.json`(확정본), `story-vN.json`(버전), `inputs/`(가져온 텍스트 파일)

## 3. 다음 할 일 (C단계부터)
1. **S2 제작 바이블** — `story.json`의 인물·씬·장소를 읽어 텍스트 AI로 바이블 초안 추출 → 요소별 승인 화면 → `02_bible/bible.json`. 시리즈는 `series_bible/`과 상태(고정/변경/추가/퇴장)·연결고리·변경 이력. 공용 `라이브러리/`에서 불러오기·저장. 기준 시트 이미지는 F단계 생성과 연결(우선 「이미지 올리기」 자리)
2. S3 → S4 → S5 → S6 순서
3. S1 로그라인~연출·「스토리 확정」까지 화면으로 끝까지 한 번 진행해 보기

## 4. 작업 원칙
- 화면 문구는 한국어. 요금이 나가는 생성은 실행 전에 금액을 보여 주고 확인받기(예산 한도 넘으면 멈춤)
- API 키 값은 렌더러로 보내지 않음(메인 프로세스에서만 복호화)
- 작업 폴더 밖 경로는 건드리지 않음(`assertInWorkspace`)
- 단계 산출물은 파일(JSON)로 남겨 이후 자동화(S2~S6 자동 실행)에 쓰기
- 기능 단위로 커밋, `main`에 바로 push하지 않음

## 5. 개발 환경 메모 (Windows)
- Node.js LTS(v26) + `npm install`. 새 npm은 설치 스크립트를 막으므로 `package.json`의 `allowScripts`(electron·esbuild·ffmpeg-static)가 필요
- Node 26에서 electron 압축 해제가 중간에 멈추면: `%LOCALAPPDATA%\electron\Cache\…\electron-v33.4.11-win32-x64.zip`을 `node_modules/electron/dist`에 직접 풀고 `node_modules/electron/path.txt`에 `electron.exe` 기록
- 빌드: `npm run build` / 실행: `node_modules\electron\dist\electron.exe .`
- ChatGPT 구독 연동: `npm i -g @openai/codex` → `codex login`(ChatGPT 계정). 앱은 `%APPDATA%\npm\codex.cmd`를 찾아 실행
- 개발 빌드는 설치된 Studio M과 같은 설정(`%APPDATA%\Studio M`)과 작업 폴더를 씀
