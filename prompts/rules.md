# Lattice

AIDLC 기반 작업 관리 시스템. 모든 작업 이력이 DB에 영구 보존됨.

## 엔티티
- **Plan** = Intent (전체 로드맵). Claude Plan Mode로 작성 → 자동 import됨.
- **Phase** = Unit (에픽, 큰 기능 단위)
- **Bolt** = Sprint (시간/일 단위 이터레이션, Board에서 관리)
- **Step** = Task/Story (원자적 작업)

## 플랜 작성 흐름
1. Claude Plan Mode로 플랜 논의/승인 (사용자와 합의)
2. ExitPlanMode 후 래티스 CLI로 직접 등록:
   - `lattice plan new` → `phase new` → `step new`
   - plan 파일을 Read해서 내용 파악 후 구조화
3. Step은 반드시 Bolt에 배정 (--bolt 생략 시 자동 추론)
4. 작업 시작: `step update --status in_progress`
5. 작업 완료: `step update --status done`
6. 취소 시: `step update --status cancelled` + 코멘트 필수

## 내장 TaskCreate 사용 금지
- Claude 내부 TaskCreate/TaskUpdate는 래티스 Step 없이 사용 불가
- 모든 작업 추적은 래티스로 통일

## 강제 규칙 (훅)
- Step 없이 작업 불가 (PreToolUse 차단)
- Step 생성 시 bolt_id 필수 (API 차단)
- Bolt 생성 시 project_id 필수 (API 차단)
- Phase 완료 시 하위 미완료 스텝 있으면 차단
- 삭제 = cancelled + 사유 코멘트 (soft delete)

## 명령어
```
lattice dashboard --cwd .
lattice bolt new "Sprint N" --project <PROJ-ID>
lattice step new "제목" --phase <ID> --bolt <BOLT-ID> --assignee main
lattice step update <ID> --status in_progress|done|cancelled
lattice comment new --step <ID> --body "사유"
```
