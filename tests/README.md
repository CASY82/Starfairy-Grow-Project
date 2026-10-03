# 콘텐츠 확장 검증

`content.test.js`는 브라우저의 실제 ES 모듈과 GameStore를 실행합니다. 테스트는 localStorage를 초기화하므로 **아래의 격리된 Chromium 컨텍스트**에서 실행하세요. 실제 게임 브라우저 콘솔에서 직접 호출하지 마세요.

```bash
# 터미널 1, product 폴더에서
python3 -m http.server 8765 --bind 127.0.0.1
# 터미널 2: 별도 QA 환경에 Playwright를 설치한 뒤
python3 tests/run_content_tests.py --browser /path/to/chrome --output /tmp/game1-content-qa
```

`--browser` 생략 시 Playwright 기본 Chromium을 사용합니다. Python Playwright 및 브라우저는 개발 도구이며 게임의 런타임 의존성이 아닙니다. Linux에서 Chromium 공유 라이브러리와 한국어 폰트가 필요합니다.

- 도메인: 구버전 저장, 해금, 본편/대여 전투 분리, 6문제 복수 해법, 중복 보상, 유물 효과, 주간 경계, 속도 일관성, 외전·원정대, 기존 소환/성장/방치 흐름.
- UI: 390×844/1280×844, 실제 클릭으로 도전 시작·중단, 이야기 스킵, 배지 장착, 마을 꾸미기·복원, 콘솔 오류 및 누락 자산.
- 시뮬레이션은 고정 난수와 직접 구성한 성장 상태를 사용합니다. 무료 수집/성장에 걸리는 실제 일수나 대규모 통과율 통계는 검증하지 않습니다.
