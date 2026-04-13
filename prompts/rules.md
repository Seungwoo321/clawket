# Lattice

AIDLC 기반 작업 관리 시스템. 모든 작업 이력이 DB에 영구 보존됨.

## 엔티티
- **Plan** = Intent (전체 로드맵)
- **Phase** = Unit (에픽, 큰 기능 단위)
- **Bolt** = Sprint (시간/일 단위 이터레이션, Board에서 관리)
- **Step** = Task/Story (원자적 작업)

## 워크플로우

### 프로젝트 없는 경우
1. `lattice project new "프로젝트명" --cwd "."`

### 플랜 작성
Plan Mode의 plan 파일(~/.claude/plans/)은 사용하지 않는다. 래티스가 플랜의 source of truth이다.

**일반 모드에서 플랜 요청 시:**
1. 코드베이스 분석 후 대화에서 플랜 제안
2. 사용자 승인 후 래티스 CLI로 직접 등록

**플랜 모드에서 플랜 요청 시:**
1. Write가 훅에 의해 차단되므로 plan 파일을 작성하지 않는다
2. 대화 컨텍스트로 플랜 내용을 제안한다
3. 사용자가 ExitPlanMode로 승인하면, 승인된 내용을 래티스 CLI로 등록한다

**래티스 등록 순서:**
1. `lattice plan new --project <PROJ-ID> "플랜 제목"`
2. `lattice phase new --plan <PLAN-ID> "Phase 제목" --goal "목표"`
3. `lattice bolt new --project <PROJ-ID> "Sprint N"`
4. `lattice step new "스텝 제목" --phase <PHASE-ID> --bolt <BOLT-ID> --assignee main`

Step은 반드시 Bolt에 배정 (--bolt 생략 시 활성 볼트에서 자동 추론)

### 작업 진행
1. 작업 시작: `lattice step update <ID> --status in_progress`
2. 작업 완료: `lattice step update <ID> --status done`
3. 취소 시: `lattice step update <ID> --status cancelled` + 코멘트 필수

### 자동 상태 전이
- Step → in_progress 시 상위 Phase/Plan 자동 active
- 모든 Step 완료 시 Phase/Plan 자동 completed
- Bolt는 수동 관리

## 강제 규칙 (훅)
- Step 없이 작업 불가 (PreToolUse 차단)
- Step 생성 시 bolt_id 필수 (API 차단)
- Bolt 생성 시 project_id 필수 (API 차단)
- 삭제 = cancelled + 사유 코멘트 (soft delete)

## 명령어 레퍼런스
```
# 프로젝트
lattice project new "이름" --cwd "."
lattice project list

# 플랜
lattice plan new --project <PROJ-ID> "제목"
lattice plan list

# 페이즈
lattice phase new --plan <PLAN-ID> "제목" --goal "목표"

# 볼트
lattice bolt new --project <PROJ-ID> "Sprint N"
lattice bolt list --project-id <PROJ-ID>
lattice bolt update <BOLT-ID> --status active|completed

# 스텝
lattice step new "제목" --phase <PHASE-ID> --bolt <BOLT-ID> --assignee main
lattice step update <STEP-ID> --status in_progress|done|cancelled
lattice step list --status in_progress

# 대시보드
lattice dashboard --cwd .

# 코멘트
lattice comment new --step <STEP-ID> --body "내용"
```
