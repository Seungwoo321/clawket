# Lattice

작업 관리 시스템. 모든 작업은 Step으로 등록 후 실행.

## 규칙
1. **Step 선등록 필수** — `lattice step new` 후 작업. PreToolUse 훅이 강제함.
2. **상태 관리** — 시작: `--status in_progress`, 완료: `--status done`
3. **취소/블록 시 코멘트** — `lattice comment new --step <ID> --body "사유"`
4. **서브에이전트** — Agent() 전에 Step 등록 + in_progress 필수
5. **CLI만 사용** — curl 직접 호출 금지

## 명령어
```
lattice dashboard --cwd .
lattice step new "제목" --phase <ID> --assignee main
lattice step update <ID> --status in_progress|done|cancelled
lattice step search "키워드"
lattice comment new --step <ID> --body "내용"
```
