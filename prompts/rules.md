# Lattice

작업 관리 시스템 (AIDLC 기반). 모든 작업은 Step으로 등록하고 Bolt(Sprint)에 배정 후 실행.

## AIDLC 엔티티
- **Plan** = Intent (의도, 전체 로드맵)
- **Phase** = Unit (에픽, 큰 기능 단위)
- **Bolt** = Sprint (시간/일 단위 이터레이션, Board에서 관리)
- **Step** = Task/Story (원자적 작업)

## 규칙
1. **Step 선등록 필수** — `lattice step new` 후 작업. PreToolUse 훅이 강제함.
2. **Bolt 배정 필수** — Step 생성 시 `--bolt <BOLT-ID>` 지정. Board에서 관리하려면 필수.
3. **상태 관리** — 시작: `--status in_progress`, 완료: `--status done`
4. **취소/블록 시 코멘트** — `lattice comment new --step <ID> --body "사유"`
5. **서브에이전트** — Agent() 전에 Step 등록 + in_progress 필수
6. **CLI만 사용** — curl 직접 호출 금지

## 명령어
```
lattice dashboard --cwd .
lattice bolt list --project-id <PROJ-ID>
lattice step new "제목" --phase <ID> --assignee main --bolt <BOLT-ID>
lattice step update <ID> --status in_progress|done|cancelled
lattice step search "키워드"
lattice comment new --step <ID> --body "내용"
```
