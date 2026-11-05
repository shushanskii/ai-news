# Отчёт: как заставить декларированное исполняться машинно

Два вопроса, заданных владельцем репозитория:

1. **Как обеспечить границы слоёв**, которые обещают `README.md` и `conventions/*.md`, но которые сейчас никто не проверяет?
2. **Как обеспечить CI** — чтобы гейт нельзя было обойти и чтобы тесты вообще начинали когда-нибудь запускаться?

Отчёт исследовательский: сначала источники и замеры, потом варианты и рекомендация. Ничего в код не изменено; все эксперименты откатаны, `git status` на момент написания — чистый, кроме этого файла.

- Репозиторий: `ts-scaffold` @ `dd68bda`, ветка `fix/catalog-advisories` (запушена)
- Дата: 2026-10-14
- Инструменты на момент замеров: fallow 3.10.0, pnpm 11.11.0, Node 24.18.0 (local) / `engines.node: ">=22"`

---

## 0. Исходная точка: замеры, а не догадки

### Что декларировано

| Документ | Утверждение |
|---|---|
| `conventions/redux.md` | направление: `types → schemas → api → actions → reducers → sagas → store → selectors → hooks → components`; «**A saga therefore cannot use a selector**»; «`reducers/` never imports `store/`» |
| `conventions/react.md` | «**Components may not import `reducers/` directly** — state reaches the UI through a hook» |
| `conventions/project.md` | «`api` and `web` never import each other. Both may import `shared`; `shared` imports nothing» |
| `README.md` | «Layers only import leftwards, **and fallow enforces it**» |

### Что проверяется фактически

В `.fallowrc.json` — три зоны, по пакету (`packages/shared/src/**`, `apps/api/src/**`, `apps/web/src/**`). Правил *между слоями внутри пакета* нет ни одного.

Проверено подставными импортами на текущем дереве (fallow 3.10.0, флаг `--boundary-violations`):

| Нарушение | Текущий конфиг | Комментарий |
|---|---|---|
| `components/App` → `#reducers/todos` | **не ловит** | прямо запрещено `react.md` |
| то же, относительным путём `../../reducers/todos` | не ловит | subpath-imports и относительные резолвятся одинаково |
| `sagas` → `#selectors/todos` | **не ловит** | прямо запрещено `redux.md` |
| новый бакет `apps/web/src/utils/**` | никем не замечен | зона не заведёт правил на файл, которого нет в паттернах |
| `web` → `@app/api` | **ловит** (`web → api`) | пакетный граф уже под защитой |
| `web` → `../../../api/src/...` (в обход имени пакета) | не boundary, но **unresolved import → гейт красный** | срабатывает по другой причине, но срабатывает |

**Вывод:** фраза README верна на уровне пакетов и неверна на уровне слоёв. Дыра — только внутри пакета.

### Второй промах: гейт, который не запускается

- `pnpm run audit` = typecheck + Biome + fallow. **`pnpm test` в него не входит.**
- Единственный исполнитель гейта — husky `pre-commit`, обходится `--no-verify`.
- CI нет вообще: ни `.github/`, ни другой.
- За всю историю репозитория 32 существующих теста не были запущены автоматически ни разу.

### Проверка «а работает ли вообще то, что мы чиним» (снимок состояния)

Прогоны без кэша (`turbo run … --force`, иначе `FULL TURBO` и логи лишь воспроизводятся):

| Команда | Результат |
|---|---|
| `pnpm test` | 32 теста / 6 файлов — зелёные (shared 5, api 11, web 16), 1.8s |
| `pnpm run build` | `tsup` → `apps/api/dist/main.js` 3.78 KB; `vite build` → 138 модулей, 320.66 KB (gzip 102.52 KB), 0.6s |
| `pnpm run audit` | typecheck 3/3, Biome 42 файла без замечаний, fallow «No issues found» |
| `pnpm audit --prod` | No known vulnerabilities found |
| `pnpm install --frozen-lockfile` | Already up to date (лок-файл синхронен) |
| `pnpm dedupe --check` | exit 0 |
| `pnpm run audit --force` | **падает** (и вариант `pnpm run audit -- --force` тоже) |

---

## 1. Вопрос A — границы слоёв

### 1.1 Что говорят источники

**Fallow** (уже зависимость репозитория) умеет заметно больше, чем использует конфиг.
Источник: <https://fallow.tools/docs/configuration/boundaries/> и `node_modules/fallow/schema.json`.

- Зоны (`patterns`), правила (`from` / `allow` / `allowTypeOnly`), плюс две секции, которые мы не используем:
  - **`coverage.requireAllFiles`** — репортит файлы, не попавшие ни в одну зону (`boundary-coverage`);
  - **`calls.forbidden`** — запрет вызовов в зоне (`{ from, callee }`, например `console.*` или `child_process.*` в домене).
- Ключевая семантика, из-за которой мы и сидим с дырой (дословно из доков):
  > Files that match no zone are **unrestricted**. … **No rule entry** means the zone is unrestricted.
- Зона = первое совпавшее правило (`first match wins`), поэтому порядок списка значим: тестовая зона идёт первой.
- **Пресеты** `layered` / `hexagonal` / `feature-sliced` / `bulletproof` строят зоны как `{rootDir}/<zone>/**`, где `rootDir` берётся из `tsconfig.json`. Документация прямо пишет, что для монорепо с раздельными `src` пресеты не годятся и даёт образец ручных зон на пакет — то есть наш случай.
- **`autoDiscover`** делает каждую непосредственно дочернюю директорию зоной `parent/child` и проверяет импорты между соседями как кросс-зонные. Но: «The parent rule automatically allows its discovered children», а порождённые правила «keep the original `allow` list exactly» — направление слоёв из `autoDiscover` не появляется.

Альтернативы, которые называют в том же контексте (dependency-cruiser, eslint-plugin-boundaries, import-linter, ArchUnitTS, rev-dep):

| Инструмент | За | Против именно здесь |
|---|---|---|
| **fallow boundaries** | 0 новых зависимостей, уже в гейте, Rust-скорость, есть `coverage`, `calls`, `--format github-annotations`/SARIF | направление слоёв описывается руками в JSON |
| **dependency-cruiser** | зрелый, конфиг на JS, умеет сирот/циклы/«зависимости не тяжелее соседа» | +зависимость, второй gate-тул с пересечением зон ответственности с fallow |
| **eslint-plugin-boundaries** | самая богатая семантика (parent/child/sibling, «не глубже чем на слой») | требует ESLint, а репозиторий сознательно на Biome; правил на импорты в Biome нет |
| **ArchUnitTS / «architecture as tests»** | правило = красный тест, видно в `pnpm test` | исполняется только там, где запущены тесты; тесты сейчас вне гейта (см. вопрос B) |
| **TS project references по слоям** | жёсткость на уровне компилятора | 10+ tsconfig, переусложнение для шаблона, который кто-то будет копировать |

### 1.2 Что я проверил руками, а не взял из доков

Кандидат-конфиг (17 зон / 17 правил, `/tmp/fallow-layers.json`) прогнан на этом дереве:

| Проверка | Результат |
|---|---|
| чистое дерево | `✓ No issues found` — то есть конфиг не требует ни одного изменения в коде |
| `components/App` → `#reducers/todos` | **ловит**: `web-components → web-reducers` |
| то же относительным путём | ловит |
| `sagas` → `#selectors/todos` | **ловит**: `web-sagas → web-selectors` |
| `web` → `@app/api` | ловит: `web-components → api-entry` |
| `@app/shared` из компонентов | резолвится в зону `packages/shared/src/index.ts` (проверено временным запретом — 2 находки), то есть кросс-пакетные правила работают по имени пакета |
| новый бакет `apps/web/src/utils/**` | `Boundary coverage: no matching boundary zone` |

⚠️ **Нюанс, которого нет в документации.** Импорт проверяется только у файлов, достижимых от точки входа: файл-проба `apps/web/src/components/__probe.tsx` с нарушением прошёл гейт молча. Поймал его только `dead-code` как *unused file*. То есть граница под защитой **только при едином гейте**: `boundaries` закрывает достижимый код, `dead-code` — недостижимый. По-отдельности обе проверки оставляют щель.

### 1.3 Варианты

| Вариант | Суть | Цена | Вердикт |
|---|---|---|---|
| **A1** ⭐ | Ручные слоёвые зоны в `.fallowrc.json` + `coverage.requireAllFiles` | один файл, 0 зависимостей, конфиг уже валидирован зелёным | **брать** |
| **A2** | `autoDiscover` вместо ручных зон | меньше строк | только как дополнение (изоляция соседних `components/<X>`); направление слоёв не даёт |
| **A3** | Пресет (`layered` / `bulletproof` / FSD) | 3 строки | отвергнут: требует переименовать бакеты под `src/<zone>/**`, то есть переписать `conventions/*` и все subpath-imports — а это и есть предмет демонстрации шаблона |
| **A4** | A1 + «architecture test» в vitest поверх (в духе ArchUnitTS) | +1 тест | отложить: для правил, которые fallow не выражает (например «сага не зовёт `select()`») |
| **A5** | Ничего не enforcement, убрать из README обещание | правка трёх `*.md` | честнее, чем молчать, но хуже A1: правка A1 дешевле и даёт защиту вместо снятия требования |

**Рекомендация: A1** (+ `coverage.requireAllFiles` обязательно, иначе новый бакет молча выпадает из правил). Дополнительно — тест-ловушка, чтобы следующий, кто «упростит» конфиг до трёх зон, получил красный гейт.

---

## 2. Вопрос B — CI

### 2.1 Что говорят источники

- **pre-commit — не гейт.** Он обходится `--no-verify`; отсюда стандартная связка «CI + required status checks», а хук остаётся быстрой локальной пристрелкой.
- **Официальный гайд Turborepo** — <https://turborepo.dev/docs/guides/ci-vendors/github-actions>: checkout → setup-node с кэшем → install → `turbo run …`. Кэш `.turbo` через `actions/cache` полезен только внутри одного рана; настоящий прирост даёт Remote Cache (OIDC — рекомендуемый путь, либо PAT-секрет).
- **Scope-фильтры** — <https://turborepo.dev/docs/core-concepts/filtering>: `--filter=...[origin/main]` и variants `[main...my-feature]`. Требуют истории git (`fetch-depth`), и дают лишний способ получить ложно-зелёный прогон.
- **pnpm в Actions** — <https://github.com/pnpm/action-setup>: для pnpm ≥ 11 есть младший <https://github.com/pnpm/setup> (`pnpm/setup@v1`) — один шаг ставит pnpm (берёт версию из `packageManager`, у нас `pnpm@11.11.0`) и рантайм (`runtime: node@22`), и кэширует store. Важно: по умолчанию он сам выполняет `pnpm install`, поэтому нужен `install: false`, чтобы `--frozen-lockfile` оставался отдельным явным шагом.
- **Audit в PR-гейте hard-fail делают редко**: транзитивный advisory в dev-зависимости блокирует несвязанный PR. Консенсус — `--audit-level`, отдельный/еженедельный прогон, плюс робот обновлений.
  - Dependabot поддерживает pnpm catalogs с 02.2025: <https://github.blog/changelog/2025-02-04-dependabot-now-supports-pnpm-workspace-catalogs-ga/>
  - Renovate — <https://docs.renovatebot.com/modules/manager/npm/>
  - ⚠️ caveat: <https://github.com/dependabot/dependabot-core/issues/14794> — на pnpm 11 бывают PR, где меняется только лок-файл, а манифест остаётся `catalog:`. Это ровно наша связка (в этом репозитории `pnpm update <pkg>` вообще ничего не двигает, потому что версии — `catalog:`-ссылки), значит автопрапы обязаны проходить тот же гейт, а не мержиться вслепую.
- **Гигиена Actions** (есть почти в каждом чек-листе): `permissions: contents: read` на уровне workflow, `concurrency` + `cancel-in-progress` (<https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency>), `persist-credentials: false`, пин actions, отсутствие секретов в fork-PR.
- **Fallow заточен под CI из коробки:** `--format github-annotations` / `github-summary` / `--ci` (= SARIF + `--fail-on-issues`), `fallow audit --changed-since main` как PR-гейт «только изменённое», `fallow report` для аннотаций. `fallow ci-template` есть, но шаблон только GitLab.
- **Дешёвая страховка, которую мы заслужили вчера:** `pnpm dedupe --check` существует и на текущем лок-файле зелёный — возврат дублей (см. случай с `qs`) станет красным прогоном, а не «ой, снова две версии».
- Справочно по pnpm 11: `allowBuilds` в репозитории уже используется; `minimumReleaseAge` и `strictDepBuilds` сейчас не выставлены (`pnpm config get` → undefined), то есть это опции, а не дефолт.

### 2.2 Варианты

| Вариант | Что | Цена | Когда брать |
|---|---|---|---|
| **B1** ⭐ | Один `ci.yml`, один job, **полный** прогон всегда: install `--frozen-lockfile` → `dedupe --check` → `verify` (typecheck + Biome + fallow + тесты + обе сборки) → advisory non-blocking | ~1.5–2 мин | репо на 3 пакета: тесты 1.8s, билд 0.6s — экономить не на чём |
| **B2** | 3 параллельных job (verify / test / build) + артефакты | 3× install; чище логи | когда time-to-first-signal станет болью |
| **B3** | affected-only (`--filter=...[origin/$BASE]`) + Remote Cache | `fetch-depth`, база, секреты, лишние ложные зелени | десятки пакетов |
| **B4** | Только гейт, без билда | минимум | не советует: `tsc` у нас ничего не эмитит, ошибки сборки видны только билдом |

### 2.3 Сопутствующее, без чего B1 будет врать

1. **`pnpm run verify` = `audit` + `test` + `build`.** Одна команда для хука, CI и README; тогда «the single verification command» перестаёт расходиться с реальностью.
2. **Починить `pnpm run audit --force`.** Проверено: падают и `pnpm run audit --force`, и `pnpm run audit -- --force` — pnpm дописывает флаг в конец цепочки, и его получает `fallow dead-code --fail-on-issues --force` (`unexpected argument`). Из-за этого холодный прогон гейта собирается из трёх команд вручную.
3. **Branch protection** (`main` ← required check `verify`) — единственное, что нельзя закоммитить. Либо включить в UI / `gh api`, либо задокументировать в README как шаг «Making it yours», иначе скопированный шаблон снова стартует без гейта.
4. Опционально: `.github/dependabot.yml` (pnpm, корневой каталог, grouped, без auto-merge) и `fallow --format github-annotations` отдельным шагом, чтобы fallow писал прямо по строкам PR.
5. Совмещённый прогон `pnpm test` локально остаётся обязательным до появления B1 — сейчас он единственный способ узнать, что тесты вообще есть.

---

## 3. План

Два независимых маленьких PR.

**PR 1 — `fix(fallow): enforce the layer direction the conventions already claim`** (вариант A1)
- `.fallowrc.json`: слоёвые зоны для `shared` / `api` / `web` + правила по направлению из `conventions/redux.md`, тестовая зона первой, `coverage.requireAllFiles: true` с `allowUnmatched` на `apps/web/index.html` и конфиги сборщиков;
- пакетный граф (`shared ← api`, `shared ← web`, `api`/`web` не пересекаются) сохраняется как подмножество правил;
- тест-ловушка на «конфиг схлопнули до трёх зон»;
- проверка: `fallow list --boundaries` (все зоны с ненулевым числом файлов) → `pnpm run audit` зелёный → подставы `component→reducer` и `saga→selector` красные.

**PR 2 — `ci(repo): run the gate where it cannot be skipped`** (вариант B1)
- `.github/workflows/ci.yml`: `push` в `main` + `pull_request`, `permissions: contents: read`, `concurrency` + `cancel-in-progress`, `actions/checkout@v5` с `persist-credentials: false`, `pnpm/setup@v1` (`runtime: node@22`, `cache: true`, `install: false`), `pnpm install --frozen-lockfile`, `pnpm dedupe --check`, `pnpm run verify`, advisory-шаг с `continue-on-error`;
- корневые скрипты: `verify` = audit + test + build; фикс проброса флага в `audit`;
- README: привести формулировку гейта в соответствие и добавить шаг про branch protection.

Черновики: `.fallowrc.json` — провалидирован (зелёный на текущем коде, обе подставы ловятся), `ci.yml` — YAML провалидирован, набор шагов соответствует списку выше.

### Открытые решения владельца

1. A1 как рекомендовано, или A4 (правила как тесты) / A5 (снять обещание с README)?
2. B1 как рекомендовано, или B2/B3?
3. Включать ли Dependabot в PR 2, или завести отдельным шагом (с учётом caveat про `catalog:`)?
4. Ветка для PR: продолжение `fix/catalog-advisories` или новая от `main`?

---

## Приложение. Как воспроизвести замеры

```bash
# базовое состояние
pnpm install --frozen-lockfile
pnpm exec turbo run test --force      # 32 теста
pnpm exec turbo run build --force     # tsup + vite
pnpm run audit                        # typecheck + Biome + fallow
pnpm audit --prod
pnpm dedupe --check

# текущий конфиг зон и число файлов в них
./node_modules/.bin/fallow list --boundaries

# проба: компонент импортирует редьюсер (запрещено conventions/react.md)
#   без слоёвых зон — «No issues found», со слоёвыми — web-components → web-reducers
python3 - <<'EOF'
p = 'apps/web/src/components/App/index.tsx'
s = open(p).read()
open(p, 'w').write('import { setLoading } from "#reducers/todos";\n'
                   + s.replace('export function App', 'export const __p = setLoading;\n\nexport function App'))
EOF
./node_modules/.bin/fallow dead-code --boundary-violations   # текущий конфиг
git checkout -- apps/web/src/components/App/index.tsx
```

Замечание по методике: файл-проба, не достижимый от точки входа, проверкой границ **не** проверяется (см. §1.2) — правьте существующий достижимый файл и откатывайте его.

---

## 4. Исполнение

Ветка `feat/enforced-layers` от `8661b11` (`main`), 9 коммитов, не запушена. Все утверждения ниже
получены прогонами на этом дереве; сырые логи прогонов — `/tmp/probes/`, харнесс — `/tmp/probe.py`
(в репозиторий не попадает: харнесс правит рабочие файлы).

| Коммит | Что |
|---|---|
| `76f62c2` | `.fallowrc.json`: 20 зон / 20 правил + `coverage.requireAllFiles` |
| `c8b650a` | тест-ловушка `apps/web/src/architecture/index.test.ts` (10 проверок) |
| `d675e3b` | `calls.forbidden` (`useSelector` / `useDispatch` / `fetch`) + 3 проверки ловушки |
| `0267bdf` | `scripts/gate.mjs` — починен проброс флага; скрипты `audit` / `verify` |
| `d07979b` | `.github/workflows/ci.yml` |
| `329b389` | README, `conventions/core.md`, `conventions/project.md`, skill: гейт = `verify` |
| `f5c96bf` → `0c339bc` | фича `dueDate` + фильтр `overdue`: shared → api → web |

Итог: `pnpm run verify --force` зелёный с холодного кэша; **66 тестов в 7 файлах** (было 32 в 6).

### 4.1 Часть 1 — слои (вариант A1)

Конфиг: по зоне на бакет на пакет (`shared` 3, `api` 4, `web` 9) + `repo-tooling` + три тестовые
зоны первыми; `coverage.requireAllFiles: true` с `allowUnmatched` на конфиги сборщиков и
`apps/web/index.html`. `fallow list --boundaries` — 20 зон, 20 правил, файлов вне зон 0.

**Таблица «правило → подстава → чем поймано».** Все подставы — правка **достижимого** файла
(иначе проверка границ слепая, см. §1.2), прогон `pnpm run audit`, откат. «Поймано» = гейт красный
именно по этому правилу, а не по побочной находке.

| # | Правило (источник) | Подстава | Поймано | Сообщение |
|---|---|---|---|---|
| A01 | «Components may not import `reducers/`» (react.md:17) | `components/App` → `#reducers/todos` | да | `web-components → web-reducers` |
| A02 | то же относительным путём | `../../reducers/todos` | да | то же — subpath и относительный резолвятся одинаково |
| A03 | «A saga therefore cannot use a selector» (redux.md:56) | `sagas` → `#selectors/todos` | да | `web-sagas → web-selectors` |
| A04 | «`reducers/` never imports `store/`» (redux.md:96) | value-импорт | да | `web-reducers → web-store` + 2 цикла |
| A05 | то же, только тип | `import type { RootState }` | да | то же: `allowTypeOnly` не выставлен ни у одного правила |
| A06 | «state reaches the UI through a hook» | `hooks/useTodos` → `#reducers/todos` | да | `web-hooks → web-reducers` |
| A07 | «The UI dispatches intents only» (redux.md:24) | `App` → `#actions/todos` | да | `web-components → web-actions` |
| A08 | компонент не ходит в сеть сам | `TodoList` → `#api/todos` | да | `web-components → web-api` |
| A09–A12 | «Layers only import leftwards» (README:113) | reducer→hook, store→component, `api`→sagas, saga→store | да ×4 | четыре отдельные находки, каждая своим правилом |
| A14, A15 | правила **строже**, чем «просто влево» | hook→`api`, component→store | да ×2 | ловятся, хотя формально направление «влево» |
| B01 | «`api` and `web` never import each other» (project.md:25) | `web` → `@app/api` | да ×2 | TS2307 **и** `web-components → api-entry` |
| B02 | то же в другую сторону | `api` → `@app/web` | да ×2 | TS2307 + fallow `Unresolved imports` |
| B03, B04 | «`shared` imports nothing» | `shared` → `@app/web`, `@app/api` | да | `shared-schemas → api-entry` + 2 цикла |
| B05 | barrel-only: внутрь `shared` через `#`-subpath нельзя | `@app/shared/schemas/todo` | да | TS2307 (не экспортируется из barrel) |
| B06, B07 | обход имени пакета относительным путём | `../../../packages/shared/src/...`, `../../../api/src/...` | да | `web-components → shared-types`, `→ api-services` |
| C01 | тесты не протаскивают пакетный граф | web-тест → `@app/api` | да | `web-test → api-entry` |
| C03 | новый бакет не должен оставаться без правил | `apps/web/src/utils/index.ts` | да | `Boundary coverage: … no matching boundary zone` |
| C02 | тот же файл, но недостижимый | — | да | `Unused files` (dead-code), а не coverage |
| F01, F02 | «state reaches the UI through a hook» | inline `useSelector` / `useDispatch` в компоненте | да (после `d675e3b`) | `` `useSelector` matches forbidden … in zone 'web-components' `` |
| F03–F05 | сеть только в `api/` | `fetch` в компоненте / саге / хуке | да ×3 | `` `fetch` matches forbidden `fetch` in zone 'web-sagas' `` и т.д. |

Контрольные прогоны A13, B08, B10, C04 (легальные рёбра, включая относительный импорт внутри
пакета и легальный импорт в тестовой зоне) — зелёные: конфиг не мешает тому, что правилами
разрешено.

**Про недостижимые файлы (§1.2) — подтверждено, но формулировку надо уточнить.** Проба
`apps/web/src/components/__probe.tsx`, от точки входа недостижима:

- **D01** (с запрещённым импортом): `--boundary-violations` даёт **0 находок по границам**; гейт
  красный только из-за `Unused files`.
- **D02** (тот же файл, **без** нарушений): тоже `Unused files`, тоже красный.

Значит вывод отчёта верен — граница под защитой только при едином гейте (boundaries для
достижимого, dead-code для недостижимого). Но «прошёл гейт молча» в §1.2 верно только про проверку
границ: гейт в целом красный и различить «нарушение» и «просто лишний файл» не может.

**Тест-ловушка** (`apps/web/src/architecture/index.test.ts`, читает `.fallowrc.json` через Vite
`?raw`, 10 проверок) красная на:

- схлопнутом конфиге (`main`, 3 пакетные зоны) — 8 из 10 проверок, первая: `missing zone: web-api`;
- **удалённой одной записи правила** (`from: "web-components"`) — и вот здесь главное: fallow на
  том же дереве отвечает `✓ No issues found` и **с внесённым запрещённым `components → reducers`
  импортом `exit=0`**, то есть нарушение становится невидимым, а ловушка даёт 4 красные проверки,
  включая `zone without a rule entry: web-components`.

Семантика fallow «no rule entry means unrestricted» превращает опечатку в конфиге в молчаливое
отсутствие гейта, и fallow сам этого не замечает никогда. Это и есть обоснование ловушки, а не
дубль проверки.

**Что гейт по-прежнему не выражает.** Шесть правил из конвенций не являются импортами и не
ловятся: сырая строка вместо `ActionTypes` (E04), inline-обработчик в JSX (E05),
`dangerouslySetInnerHTML` (E06), не выключенный thunk (E07), тест без финального
`toMatchSnapshot()` (E08), `select()` в саге (E09). E05–E08 проходят полностью зелёными; E04 и E09
краснеют только из-за артефакта самой пробы (`Unused exports`), к правилу это не относится. Это и
есть A4 из §1.3 — он не сделан и остаётся открытым. Живой прецедент дыры уже лежал в `main`: у
теста «ignores a blank title» в `TodoForm/index.test.tsx` не было финального `toMatchSnapshot()`,
которое `conventions/react.md` требует, — поправлено в `0c339bc`.

### 4.2 Часть 2 — гейт, который нельзя обойти (вариант B1)

- **`scripts/gate.mjs`** — корень бага из §2.3.2: pnpm дописывает флаг в конец цепочки, и его
  получал `fallow dead-code --fail-on-issues --force` (`unexpected argument`). Скрипт раздаёт
  аргументы: флаги уходят только turbo-задачам, `audit` и `verify` собираются по шагам со
  заголовками. Проверено: `pnpm run audit --force` → **exit 0** (в отчёте — падение),
  `pnpm run verify --force` → exit 0.
- **`pnpm run verify`** = types → style → structure → tests → build.
- **`.github/workflows/ci.yml`** — один job `verify` по списку §3 (PR 2): `permissions:
  contents: read`, `concurrency` + `cancel-in-progress`, `persist-credentials: false`, install
  `--frozen-lockfile`, `pnpm dedupe --check`, `pnpm run verify --force`, advisory-шаг с
  `continue-on-error`.
- **`.husky/pre-commit`** → `pnpm run verify`; README («The gate»), `conventions/core.md`,
  `conventions/project.md`, skill — обещание «single verification command» теперь совпадает с
  реальностью, плюс предупреждение «хук — не гейт».

**Проверка ссылок** — каждую открыл `curl -L`, статусы ниже.

| Ссылка | HTTP | Итог |
|---|---|---|
| `github.com/pnpm/setup` | 200 | тег `v1` **существует** (v1.0.0) и содержит `runtime` / `cache` / `install`, то есть `pnpm/setup@v1` из отчёта **рабочий**; актуальный мажор — `v3.1.1`. Взял `@v3`. |
| `github.com/actions/checkout` | 200 | `@v5` существует; актуальный мажор — `v7.0.1`. Взял `@v7`. |
| `fallow.tools/docs/configuration/boundaries/` | 200 | живая |
| `docs.fallow.tools/configuration/boundaries` | 200 | редирект на `fallow.tools/docs/...` — в отчёте это одно и то же, не ошибка |
| `turborepo.dev/docs/guides/ci-vendors/github-actions` | 200 | живая |
| `turborepo.dev/docs/core-concepts/filtering` | 200 | **редирект** на `/docs/crafting-your-repository/running-tasks` — адрес устарел, контент тот же |
| `github.blog/…dependabot…pnpm-workspace-catalogs-ga` | 200 | живая; что dependabot действительно понимает `catalog:`, по посту проверить нельзя — утверждение помечаю непроверенным, а не подтверждённым |
| `docs.renovatebot.com/modules/manager/npm/` | 200 | живая |
| `dependabot-core/issues/14794` | 200 | живая |
| `docs.github.com/…/control-workflow-concurrency` | 200 | живая |

Убрано из списка отчёта: **smoke-тест `/health`** — эндпоинта в `apps/api` нет (`GET /health` →
404). `fallow ci-template` в CI не использован: шаблон GitLab'овский, как в отчёте и написано.

### 4.3 Часть 3 — фича через все слои

Порядок — строго по `conventions/redux.md`, после каждого слоя `pnpm run verify`.

| Слой | Что добавлено | Тесты |
|---|---|---|
| shared | `Todo.dueDate?: string` (ISO-дата), `nullable` в `updateTodoSchema` (отсутствует — оставить, `null` — снять), `todoListQuerySchema` | 9 новых (14) |
| api | `isOverdue` + `list(query)` в сервисе, `now` швом в `createTodosService`/`createApp`, валидация `req.query` | 9 новых (20) |
| web/`api` | `todosApi.list(query)`; query строится вручную, а не `URLSearchParams` | 2 новых (7) |
| actions | `overdue` в `LoadTodosAction`, `dueDate` в `CreateTodoAction` | — (у соседа нет) |
| reducers | `state.filter` + `setFilter` (заменяет, не мержит) | 2 новых (9) |
| sagas | `call(todosApi.list, { overdue })`, `put(setFilter(…))` | — (у соседа нет) |
| selectors | `selectTodosFilter`, тип `TodosFilter` | — (у соседа нет) |
| hooks | `filter` в возвращаемом, `load(filter)`, `create(title, dueDate)` | — (у соседа нет) |
| components | дата-инпут в `TodoForm`, `due …` в `TodoItem`, переключатель в `App` | 4 новых (TodoForm 3, TodoList 3) |

Помимо тестов: `node dist/main.js` + `curl` (`?overdue=true|false`, `?overdue=yes` → 400 с
`fieldErrors.overdue`, `dueDate: "14/10/2026"` → 400), и живой браузер через vite-прокси:
переключатель `show overdue` оставляет одну задачу, подпись меняется на `1 overdue`, кнопка — на
`show all`.

**Гейт из части 1 не воспрепятствовал ни одной правке по конвенциям.** Ни один прогон не стал
красным из-за слоёв. Единственное место, где он сформулировал решение: `selectTodosFilter` нельзя
типизировать типом из `reducers/` (`web-selectors → web-reducers` запрещён по `redux.md:56`),
поэтому `TodosFilter` выводится из `RootState` — `RootState["todos"]["filter"]`. Блокером это не
стало и, на мой взгляд, вышло лучше: единственный источник правды о форме фильтра — форма стора, а
не ещё один экспорт. Но зафиксировать стоит: направление слоёв уже диктует, где живёт тип.

### 4.4 Что из отчёта подтвердилось

- Дыра ровно там, где сказано. На `main` (`8661b11`) в `.fallowrc.json` три пакетные зоны, ни одного
  межслойного правила; A01 и A03 на `main` не ловятся (переснято на `main`, а не на ветке).
- «Фраза README верна на уровне пакетов и неверна на уровне слоёв» — да: `web → @app/api` ловится
  и на `main`.
- 32 теста / 6 файлов (shared 5, api 11, web 16) — совпало дословно; `.github/` на `main` нет;
  `pre-commit` гоняет `audit` без тестов.
- `pnpm run audit --force` падало — починено.
- `pnpm install --frozen-lockfile` → 0, `pnpm dedupe --check` → 0 (переснято на ветке).
- Кандидат-конфиг зелёный на чистом дереве: ни одной правки в коде не потребовалось.
- §1.2 про недостижимые файлы — подтверждено (с уточнением в 4.1).
- Пресеты и `autoDiscover` — подтверждено; не использованы по причинам из §1.3.

### 4.5 Что в отчёте неверно или устарело

1. **`pnpm audit --prod` → «No known vulnerabilities found».** На ветке, где писался отчёт
   (`fix/catalog-advisories` @ `dd68bda`), — да, проверено в отдельном worktree. Но **этой ветки нет
   в `main`**: на `main` и на текущей ветке `pnpm audit --prod` даёт **3 уязвимости, 1 critical**
   (`proxy-addr` 2.0.7 через `express`, GHSA-jqcg-44mw-7w3h) + 2 moderate `qs`. Строка снимка
   описывает ветку, а не `main`, и в таком виде вводит в заблуждение.
2. **`pnpm/setup@v1`** — не «младший», а на два мажора старше (`v3.1.1`). Ошибка не «не
   существует» (тег есть, входы те же), а «устарел».
3. **`actions/checkout@v5`** — существует, но актуальный мажор `v7`.
4. **`turborepo.dev/docs/core-concepts/filtering`** — редирект, канонический адрес другой.
5. **smoke `/health`** — эндпоинта нет.
6. **Заголовок PR 2 `ci(repo): …` не пройдёт коммитлент этого же репозитория**: в
   `.commitlintrc.json` `type-enum` = `feat, fix, chore, docs, refactor, test, style, perf` — типа
   `ci` нет, `ci:` и `ci(repo):` оба отбиты (проверено `pnpm exec commitlint`). Пишется
   `chore(ci):`, чем коммит `d07979b` и стал.
7. Мелочь по методике §Приложения: проба правит файл и откатывает его — верно, но без `--force`
   часть прогонов воспроизводит кэш, и «красный» прогон может оказаться чужим. В харнессе
   typecheck / Biome / fallow поэтому гонялись отдельными командами.

### 4.6 Открытое

1. **Branch protection** — единственное, чего нельзя закоммитить: `main` ← required check `verify`.
   Задокументировано в README («The gate»), включается в UI или `gh api`.
2. **`fix/catalog-advisories` в `main` не влита** — там critical. Отдельное решение владельца,
   вне этой ветки.
3. **`/health`** — добавить или вычеркнуть идею из планов.
4. **A4** — шесть неловимых правил (E04–E09). Дешевле всего Biome-плагинами или архитектурным
   тестом; ни то, ни другое не решено.
5. **Dependabot / `catalog:`** — GA из поста подтвердить нельзя, caveat «меняется только
   лок-файл» не воспроизводили. `.github/dependabot.yml` не заведён.
6. **`allowTypeOnly` не выставлен ни у одного правила**: `import type` через границу красен так же,
   как value-импорт (A05). Консервативно и предсказуемо, но если понадобится «тип через границу
   можно» — это осознанное ослабление, а не баг.
7. **`selectors/` без тестов** были и остались: по правилу «тесты там, где они есть у соседей»
   новый `selectTodosFilter` теста не получил. Логика фильтра живёт в сервисе и покрыта.
