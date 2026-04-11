## Lattice 작업 규칙

1. **스텝 선등록 필수**: 모든 작업은 `lattice step new`로 먼저 등록한 후 실행. 사후 등록 금지.
2. **상태 관리**: 작업 시작 시 `lattice step update <ID> --status in_progress`, 완료 시 `--status done`
3. **assignee 필수**: 스텝 생성 시 반드시 assignee 지정
4. **서브에이전트 순서**: Agent() 호출 코드를 작성하기 **전에** 반드시:
   - `lattice step new --assignee <agent-name>` 실행
   - `lattice step update <ID> --status in_progress` 실행
   - 그 다음에 Agent() 호출
5. **CLI 사용**: curl 직접 호출 금지, `lattice` CLI만 사용

Commands: lattice step new --phase <ID> --assignee <name> "<title>" | lattice step update <ID> --status <s>
