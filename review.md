# Ревью `feat/enforced-layers` относительно `main`

Граница: `git diff main...HEAD`, merge-base `8661b11`, HEAD `00e5c61` (10 коммитов, 34 файла, +1510/−91).

## Как это было сделано и чему из этого верить

Три параллельных субагента (`reviewer`), каждый в своём изолированном git-worktree. Два рана из трёх
умерли по таймауту с пустым результатом: у агента `reviewer` нет инструмента исполнения команд, а
дети шли на `qwen3.8-flash-next` с `thinking: xhigh` — конфиг модели называет её «big, slow».

Итог по участкам:

| Участок | Кто делал | Результат |
|---|---|---|
| 1. `packages/shared` + `apps/api` | субагент, частичный выхлоп (12 находок, оборвано) | вошло |
| 2. `apps/web` | субагент, завершён на быстром слое | вошло, но разбор дополнен сверху — отчёт субагента был «багов нет» |
| 3. гейт | **субагент не вернулся ни разу**, участок разобран родителем | вошло |

Все прогоны, на которые есть ссылки, выполнены руками и лежат в `/tmp/review/logs/**`
(индекс — `/tmp/review/EVIDENCE.md`). Базовая точка: `pnpm run verify --force` на HEAD **зелёный** —
typecheck 3 пакетов, Biome 45 файлов, fallow «No issues found», 66 тестов (shared 14 / api 20 / web 32),
обе сборки. Пометка `[PRE-EXISTING]` означает, что то же самое на `main`.

---

## P1 — баги и дыры в гейте

### 1.1 `apps/web/src/sagas/todos/index.ts:54` — локальные мутации не знают про активный серверный фильтр
`addTodo` и `replaceTodo` дописывают/заменяют элемент, не сверяя его с `state.todos.filter`. Под
фильтром «overdue» это даёт список, который врёт и о содержимом, и о счётчике.

Проверено прогоном (`/tmp/review/logs/web/probes/m8-filter-vs-local-mutation.txt`):
```
filter={"overdue":true}
items=[{"id":"1","title":"late","status":"active","dueDate":"2020-01-01"},
       {"id":"2","title":"no deadline","status":"active"}]
new non-overdue todo visible under overdue filter: true
after toggle to done, still listed under overdue filter: true
```
Вторая строка — это `apps/web/src/components/App/index.tsx:33`: счётчик `${todos.length} overdue`
считает и немёртвую задачу без срока. Третья — `replaceTodo` оставляет в списке задачу, переведённую
в `Done`, хотя серверный `?overdue=true` её туда больше не вернёт (`/tmp/review/logs/api-shared/probes/03-status-and-errors.txt:3-4`:
`overdue=true -> ["active-late"]`, `overdue=false -> ["done-late"]`). При следующем `load` элемент
исчезнет сам — то есть UI показывает состояние, которого сервис не отдаёт ни при каком запросе.
`[NEW]` — фильтр появился этой веткой.

### 1.2 `apps/web/src/sagas/` — ни одного теста
В `apps/web/src/sagas/todos/` лежит только `index.ts`. Вся новая ветка — постановка фильтра,
`takeLatest`, ветка ошибки, `setFilter({status, overdue})` — не покрыта ничем. Покрыты только
`api/`, `reducers/`, два компонента и `architecture/`
(`find apps/web/src -name '*.test.ts*'`). Для шаблона, где по `conventions/project.md:51`
примерный домен и есть «собственный тест скаффолда», это провал именно этого диффа: тестуема же
только чистая половина (`reducers/`), а половинка с побочными эффектами — нет. `[NEW]`

### 1.3 `apps/web/src/architecture/index.test.ts:170-182` — тест-ловушка сторожит не все `calls.forbidden`
Проверяются только `web-components`, `web-hooks`, `web-sagas` и отрицательно `web-api`. Записи для
`web-selectors`, `web-reducers`, `web-actions`, `web-store`, `web-entry` (`.fallowrc.json:111-137`)
можно удалить молча.

Проверено: удаление `fetch`-правила только для `web-reducers` → ловушка зелёная
(`/tmp/review/logs/gate/probes/p3-del-fetch-rule-web-reducers-trap.log: exit=0`); удаление правил
сразу пяти зон → ловушка зелёная (`p4-del-most-calls-rules-trap.log: exit=0`). Фallow при этом тоже
зелёный, пока никто не нарушил, — то есть правило исчезает тихо. Это прямо противоречит
`README.md:58` — «hollowing the config out is a red test rather than a quiet loss of coverage».
`[NEW]`

### 1.4 `apps/web/src/architecture/index.test.ts:86-97` — зоны `repo-tooling` и три тестовые зоны не заякорены
`WEB_LAYERS`/`API_LAYERS`/`SHARED_LAYERS` (строки 58-71) не содержат `repo-tooling`, `web-test`,
`api-test`, `shared-test`. Удаление **пары** «зона + правило» для `repo-tooling` проходит ловушку
(`p1-del-zone-AND-rule-repo-tooling-trap.log: exit=0`). Fallow сегодня это ловит, но случайно —
через `requireAllFiles`, потому что `scripts/**` перестаёт попадать в зону
(`p1b-…-fallow.log: exit=1`); правило `from: "repo-tooling", allow: []` при этом уже удалено, и
проверка `it("gives every zone a rule entry")` (строка 92) его не видит, потому что она идёт по
`zones.keys()`. `[NEW]`

### 1.5 `.github/workflows/ci.yml:54` — `pnpm dedupe --check` есть в CI, но нет в `verify`
`scripts/gate.mjs:16-31` знает только `typecheck / biome / fallow / test / build`. Значит
`pre-commit` и `pnpm run verify` могут быть зелёными на лок-файле с дублями, а CI — красный. Ветка
завела второй гейт, не синхронизировав первый; `conventions/core.md:113` и `README.md:79`
при этом обещают «the single verification command» и «CI runs the same gate». `[NEW]`
(`pnpm dedupe --check` на HEAD зелёный — `/tmp/review/logs/gate/02-02-dedupe-check.log: exit=0`, так
что дыра пока не горит.)

### 1.6 `.github/workflows/ci.yml:63-65` — critical-адварорис живёт при зелёном CI
Шаг `pnpm audit --audit-level=high --ignore-registry-errors` с `continue-on-error: true`, и `pnpm
audit` не входит ни в `verify`, ни в `audit`. Прогон шага как его зовёт CI:
`/tmp/review/logs/gate/03-03-ci-audit-step.log` — **27 vulnerabilities, 1 critical, 12 high, exit=1**.
Комментарий в файле («Advisory noise must not block an unrelated pull request») объясняет, почему
шаг не блокирует, но компенсирующего контроля нет ни в одном другом месте. `[PRE-EXISTING]` по
лок-файлу, `[NEW]` по решению не заводить для аудита никакого гейта.

### 1.7 `packages/shared/src/schemas/todo/index.ts:41` — неизвестный ключ в query проглатывается, фильтр молча становится «отдать всё»
`todoListQuerySchema` — обычный `z.object`, то есть strip-поведение по умолчанию.

Проверено поверх HTTP (`/tmp/review/logs/api-shared/probes/02-http.txt`):
```
:6   GET /todos?overdue=1        -> 400
:9   GET /todos?overduee=true    -> 200  (полный список)
:12  GET /todos?overdue[]=true   -> 200  (полный список)
```
Асимметрия: ошибка в **значении** — 400, ошибка в **имени** — 200 без фильтра. Это же противоречит
комментарию в том же диффе, `apps/api/src/routes/todos/index.ts:14-15`: «`?overdue=yes` is a client
bug and answers 400, not "here is everything"». Клиент с опечаткой рендерит полный список как
отфильтрованный и не может отличить это от «совпадений нет». Минимальный фикс — `.strict()`. `[NEW]`
Собственный `apps/web` эту ветку не порождает (`apps/web/src/api/todos/index.ts:16-22` умеет только
`?overdue=true|false` либо пусто), поэтому P1, не P0.

### 1.8 `apps/api/src/app/index.ts:8-14` — у 404, 405, битого JSON и 413 нет JSON-обработчика
Смонтированы только `express.json()` и роутер. Проверено
(`/tmp/review/logs/api-shared/probes/03-status-and-errors.txt:11-15`):
```
GET  /nope        -> 404 ct=text/html
PUT  /todos       -> 404 ct=text/html
POST /todos («{») -> 400 ct=text/html, тело: SyntaxError: Expected property name or '}' …
POST /todos (200k)-> 413 ct=text/html
```
Для сравнения `:12` — `GET /todos/999 -> 404 ct=application/json`: собственный конверт
`{error, formErrors, fieldErrors}` (`apps/api/src/routes/todos/index.ts:9`) существует ровно для пяти
ручных хендлеров внутри роутера. Любой клиент, делающий `response.json()` на не-2xx, падает на
`Unexpected token '<'`, а в 400 наружу уходит внутреннее сообщение парсера express.
`[PRE-EXISTING]` — ветка тронула этот файл, но обработчиков не было и раньше.

### 1.9 `apps/web/src/api/todos/index.ts:32-34` — серверный конверт ошибки выбрасывается
`throw new Error(\`${init?.method ?? "GET"} ${path} failed with ${response.status}\`)` — тело
`{error, fieldErrors}` не читается вообще. Вся аккуратная валидация из 1.7 и `updateTodoSchema`
доходит до пользователя как «POST /api/todos failed with 400». `[NEW]` по строке (метод `send`
переписан этой веткой).

---

## P2 — поведение под вопросом, несогласованности, нарушения conventions

### 2.1 `apps/api/src/services/todos/index.ts:37` — «сегодня» берётся по UTC, а комментарий обещает обратное
`now().toISOString().slice(0, 10)` — календарная дата по UTC. `packages/shared/src/types/todo/index.ts:11-13`
утверждает: «a deadline without a time of day has no timezone to get wrong». Таймзона есть, она одна
на всех и это UTC.

Проверено (`/tmp/review/logs/api-shared/probes/04-timezone.txt`):
```
UTC 2026-03-15T01:00Z (на юге Тихого окена ещё 03-14) :: dueDate=2026-03-14 -> overdue=true
UTC 2026-03-15T23:00Z (в UTC+13 уже 03-16)            :: dueDate=2026-03-15 -> overdue=false
```
То есть для западных смещений срок становится просроченным на сутки раньше, для восточных — на сутки
позже. Тесты это не ловят: фикстура `apps/api/src/routes/todos/index.test.ts:14` ставит `now` ровно
на `T12:00:00Z` — единственную точку, где расхождения нет. `[NEW]`

### 2.2 `apps/api/src/services/todos/index.ts:45` — `list({})` отдаёт наружу живой внутренний массив
Проверено (`02-http.txt:22-24`): `list({}) same reference twice: true`,
`push into handed-out array changes next list length: true`. `readonly Todo[]` — только запрет на
уровне типов. `[NEW]`

### 2.3 `apps/api/src/services/todos/index.ts:75` — `dueDate: null` оставляет own-свойство `dueDate: undefined`
`...(input.dueDate === undefined ? {} : { dueDate: input.dueDate ?? undefined })` — spread умеет
перезаписывать ключ, но не удалять. Проверено (`02-http.txt:20`, `03-status-and-errors.txt:8`):
`after null: own dueDate key=true value=undefined`. По wire безвредно (`JSON.stringify` ключ
выбрасывает), но `create` и `update` производят структурно разные объекты для одного логического
состояния; `exactOptionalPropertyTypes` в `tsconfig.base.json` нет, поэтому typecheck молчит. `[NEW]`

### 2.4 `apps/web/src/components/App/index.tsx:21-23` — на время загрузки гаснет весь экран
`if (loading) return <p>Loading…</p>` размонтирует и форму, и кнопку фильтра, и `<p role="alert">`.
Переключение «show overdue / show all» каждый раз обнуляет UI. `[NEW]` — кнопка и фильтр добавлены
этой веткой.

### 2.5 `apps/api/src/services/todos/index.ts:11` — сервис принимает транспортную форму запроса
`list(query: TodoListQuery)`: `services/` знает про форму HTTP query. Бизнес-правило (`isOverdue`,
строки 32-38) лежит правильно, форма — из транспорта. `conventions/project.md:32` перечисляет бакеты
`app/ routes/ services/`, но владельца валидации query не назначает, поэтому это несогласованность, а
не прямое нарушение. `[NEW]`

### 2.6 `conventions/project.md:29-30` — схемы query не вписываются в описание бакета
Цитата: «`schemas/` (**zod** schemas for request and response bodies, plus the DTOs inferred from
them)». `todoListQuerySchema` — не body. По `conventions/core.md:67` («runtime validation for wire
formats») место выбрано верно и альтернативы нет, но текст правила теперь расходится с фактом.
Фикс — одно слово. `[NEW]`

### 2.7 `packages/shared/src/types/todo/index.ts:15` — `dueDate` защищён только рантайм-зодом
`conventions/core.md:88` — «No string literals as domain values». Дату enum'ом не выразить, но
защита правила тут не работает на обоих концах: `dueDate: "14/10/2026"` проходит typecheck в `Todo`,
`CreateTodo` и `UpdateTodo`. Минимум — brand-тип в `types/todo`, чтобы вывод `z.iso.date()` был
номинальным. `[NEW]`

### 2.8 `apps/api/src/main.ts` — нет ни graceful shutdown, ни `/health`
`GET /health -> 404` (`03-status-and-errors.txt:10`). Ни `SIGTERM`-обработчика, ни health-эндпоинта,
которым можно было бы проверять готовность из CI. Требования в `conventions/*` нет — это операционный
пробел, а не нарушение правила, но smoke-шаг в CI вешать буквально некуда. `[PRE-EXISTING]`

### 2.9 Правила, которые `conventions/*.md` объявляют, а машина не ловит
Проверено батареей подмен (`/tmp/review/logs/web/probes/`, `/tmp/review/logs/gate/probes/`):

| Подмена | Тесты | Biome | fallow |
|---|---|---|---|
| производный селектор без `createSelector` (`redux.md:85`) | зелёные | — | зелёный |
| UI-тест без финального `toMatchSnapshot()` (`react.md:41`) | зелёные | — | зелёный |
| инлайн-стрелка в JSX (`react.md:21`) | красные (снапшот) | **зелёный** | зелёный |
| сырая строка с кастом к enum (`core.md:88`) | зелёные | зелёный | зелёный |
| интент `"delete"` вместо `"todos/delete"` (`redux.md:90`) | зелёные | зелёный | зелёный |
| `setTodos` дополнительно снимает `loading` (`redux.md:78`) | зелёные | зелёный | зелёный |
| `removeTodo` теряет reference stability на no-op (`redux.md:105`) | **красные** | — | — |
| `useSelector` внутри компонента | зелёные | — | **красный** |

Красные ячейки в первых шести строках — это совпадение (неиспользуемый импорт, упавший снапшот), а не
гейт. `react.md:21` при этом сформулирован как запрет, а Biome его не проверяет вовсе. `[PRE-EXISTING]`
по правилам, `[NEW]` по тому, что ветка документирует гейт, не закрыв эти дыры.

### 2.10 `apps/web/src/architecture/index.test.ts` не знает про `fallow-ignore-next-line`
Ловушка читает только конфиг. Один комментарий `// fallow-ignore-next-line boundary-violation`
(`.fallowrc.json` печатает его как подсказку подавления) выключает границу для строки, и ни тест, ни
fallow не краснеют. `[NEW]`

### 2.11 Вызовы вне `fetch`-списка не покрыты нигде
`fetch` в `web-test` и в `repo-tooling` fallow пропускает: `/tmp/review/logs/gate/probes/45-*.log` и
`47-*.log` — оба `✓ No issues found`. Для тестовой зоны это, возможно, намеренно, но в
`conventions/*` это не зафиксировано, а `README.md:116` подаёт `calls.forbidden` как полное
покрытие «правил, которые являются вызовами». `[NEW]`

### 2.12 Слабые утверждения в новых тестах
- `packages/shared/src/schemas/todo/index.test.ts:100` — `toEqual({ overdue: undefined })` проходит и
  на `{}`, и на `{overdue: undefined}`, то есть ровно на том различии, ради которого схема написана
  (`schemas/todo/index.ts:38-40`). Нужно `toStrictEqual({})`. Те же `toEqual` на `:59` и `:92`.
- `apps/api/src/routes/todos/index.test.ts:200` — `expect(cleared.body.dueDate).toBeUndefined()`
  истинно и для снятого срока, и для own-`undefined` из 2.3; через HTTP утечку own-ключа проверить
  нельзя в принципе, нужен юнит-тест сервиса на `Object.keys(updated)`.
`[NEW]`

### 2.13 Третье состояние фильтра недостижимо из UI
`apps/web/src/components/App/index.tsx:17-19` переключает между `{}` и `{overdue: true}`;
`?overdue=false` — единственный случай, когда сервер явно отдаёт «не просроченные», — из интерфейса
невыразим. Проверено, что клиент его умеет (`apps/web/src/api/todos/index.test.ts`), но никто его не
использует. `[NEW]`

### 2.14 Фильтры рассинхронизированы по половине
`status` фильтруется на клиенте (`apps/web/src/sagas/todos/index.ts:38`), `overdue` — на сервере.
`TodoListQuery` и API наружу отдают только `overdue`. Внутри web-слоя согласованно и, судя по
комментариям, намеренно, но этот рассинхрон стоит либо закрыть, либо описать в `conventions/project.md`.
`[NEW]`

---

## Мелочи

1. `scripts/gate.mjs:41-44` — `spawnSync` без `shell` на POSIX, поэтому `node scripts/gate.mjs`
   напрямую падает с `spawnSync turbo ENOENT`: гейт работает, только если его запустили через `pnpm`
   (он дописывает `node_modules/.bin` в `PATH`). Хук и CI так и делают, но об этом ни слова.
2. `scripts/gate.mjs:14` — `--help` проглатывается и гейт идёт как обычно, `exit=0`
   (`/tmp/review/logs/gate/probes/52-gate-flag-help.log`). `--foo` и лишние аргументы корректно
   уезжают в turbo и дают `exit=1`; неизвестный гейт — `exit=2`; опечатка в имени turbo-задачи —
   `exit=1`, ложноположительного зелёного не нашлось.
3. `.github/workflows/ci.yml:29` — нет `timeout-minutes` у джобы; зависший `vite build` держит раннер.
4. `.github/workflows/ci.yml:32,42` — экшены указаны плавающими мажорами без пина по SHA. Проверено:
   `actions/checkout` latest `v7.0.1`, `pnpm/setup` latest `v3.1.1` — мажоры в файле актуальны
   (`/tmp/review/logs/gate/probes/61-ci-action-versions.log`).
5. `.husky/pre-commit` — файл не executable (`-rw-r--r--`), но хук работает: husky v9 вызывает
   `.husky/_/pre-commit`, который его источает. Проверено реальным `git commit --allow-empty` — гейт
   стартовал (`/tmp/review/logs/gate/probes/60-husky-real-commit.log`). Оставить как есть, но и не
   чинить «права» — коммит с `chmod +x` был бы шумом.
6. `report.md` (414 строк) закоммичен в корень шаблона, который по `conventions/project.md:4`
   копируют как основу проекта. Внутренний отчёт переживает копирование и через полгода читается как
   документация.
7. `apps/api/src/routes/todos/index.ts:7-9` — `z.flattenError` наружу отдавает сообщения zod дословно
   (`Invalid ISO date`, `Too small: expected string to have >=1 characters`); для шаблона нормально, но
   это единственное место, где внутренний словарь валидатора виден клиенту.
8. `apps/web/src/components/TodoItem/index.tsx:47` — `due {todo.dueDate}` печатает ISO-дату как есть;
   для интернационализации потом понадобится форматтер, и это единственная точка, где она печатается.

---

## Что проверено и работает — чтобы не чинить

- **Тест-ловушка ловит удаление любого из 16 правил `boundaries.rules`.** Прогнано по всем 16:
  fallow везде зелёный, ловушка везде красная (`/tmp/review/logs/gate/probes/20-*.log`, `21-*.log`).
  Ловит также удаление всей зоны `web-components`, удаление блока `calls.forbidden` для
  `web-components`, расширение `allow` (`web-components` ← `reducers`/`sagas`/`api`), переименование
  всех зон `web-*` → `ui-*` и `requireAllFiles: false`.
- **Fallow ловит запрещённые импорты**: компонент → `#reducers/todos` (`boundary-violations`),
  `web` → `@app/api`, `shared` → `apps/api` — все три красные.
- **`calls.forbidden` работает для прямых вызовов**: `useSelector`, `useDispatch`, `fetch` в
  `components`, `sagas`, `reducers` — все пять проб красные с «Boundary calls».
- **Зоны покрывают всё, что есть**: под `src/` трёх пакетов нет директории, не попавшей в зону;
  расширение `coverage.allowUnmatched` до `apps/web/src/**` **не** отключает границы — проверка с
  подменой и проглотом (`p6-*.log`) всё равно красная.
- `pnpm dedupe --check` зелёный; `pnpm run verify --force` зелёный; `pre-commit` и CI гоняют ровно
  тот же `gate.mjs`, что и человек.
- `takeLatest` для `Load` и отсутствие `finally` в `loadTodos` — верное решение, комментарий
  (`sagas:25-26`) по делу: `finally` на отмене снял бы флаг, который поднял новый запрос.
- `TodosFilter` выведен из `RootState` (`selectors/todos/index.ts:13`) — это единственный способ не
  нарушить `web-selectors ↛ web-reducers`; `selectTodosFilter` правильно оставлен обычным селектором.
- `overdue` считается только на сервере, `TodoItem` дату печатает, а не судит о ней
  (`TodoItem/index.tsx:43-47`) — второго часового пояса в клиенте нет.

---

## Чего в репозитории нет, но без чего заявленный гейт не работает

1. **Branch protection на `main` с обязательным чеком `verify`.** Единственное, что делает
   `.github/workflows/ci.yml` гейтом; в репозиторий не ложится. `README.md:96` об этом говорит, но
   включается оно вручную в UI или `gh api`, и пока не включено.
2. **`.github/dependabot.yml`** — обновлений зависимостей никто не заводит, а `pnpm audit` в гейт не
   входит (см. 1.6).
3. **Тесты саг** (см. 1.2) и **JSON-обработчик ошибок express** (см. 1.8).

---

## Как читать этот отчёт

Находки 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 2.1-2.5, 2.10-2.14 — про данный дифф, чинить по нему.
1.6, 1.8, 2.8, 2.9 — старше ветки; ветка их не создала, но именно она объявила `verify` гейтом, и с
этих пор молчание гейта стало утверждением.
