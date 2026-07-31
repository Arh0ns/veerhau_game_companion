# Veerhau's Companion

Веб-приложение для структурированной хроники World of Darkness: сущности, универсальные связи, доски расследования, таймлайн, поиск и граф. Данные хранятся на сервере в SQLite, браузер хранит только cookie сессии.

## Стек

- backend: Python 3.14, FastAPI, Pydantic, SQLite;
- frontend: TypeScript, Vite, нативный DOM и SVG;
- публичный доступ: бесплатный SSH-туннель Serveo;
- авторизация: один общий пароль из `.env`.

GitHub Pages больше не используется: статический хостинг не может предоставить общую SQLite-базу и серверную авторизацию.

## Запуск

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start_public_site.ps1
```

Скрипт:

1. создаёт `.venv`, если его ещё нет;
2. устанавливает недостающие Python- и npm-зависимости;
3. собирает frontend через Vite;
4. запускает FastAPI на `http://127.0.0.1:8787`;
5. открывает Serveo-туннель;
6. выводит и автоматически копирует публичный URL в буфер обмена.

Пароль хранится в `.env` как `CHRONICLE_PASSWORD`. Публичный URL временный и может измениться после перезапуска.

## Статус И Остановка

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\status_public_site.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\stop_public_site.ps1
```

## Выпуск Новой Версии

1. Изменить Python или TypeScript-код.
2. Запустить проверки:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
Set-Location frontend
npm.cmd test
npm.cmd run build
Set-Location ..
```

3. Перезапустить сайт:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\stop_public_site.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start_public_site.ps1
```

4. Отправить игрокам новый URL, если Serveo выдал другой адрес. Скрипт уже положит его в буфер обмена.

## Архитектура

Приложение является модульным монолитом. Backend разделён на `domain`, `application`, `ports`, `infrastructure` и `presentation`. Frontend разделён на доменные политики, состояние, API-шлюзы, контроллеры и специализированные интерактивные сцены.

Подробные диаграммы находятся в [docs/architecture.md](docs/architecture.md).

## Справка По Файлам

### Корень

- `.env` — локальный пароль и другие переменные окружения; не публикуется в Git.
- `.gitignore` — исключает секреты, кэши, логи, `.venv`, зависимости и результаты Vite-сборки.
- `app.py` — совместимая точка запуска FastAPI и режим `--init-only`.
- `requirements.txt` — диапазоны версий Python-зависимостей.
- `start_public_site.ps1` — сборка, запуск backend, Serveo и копирование URL.
- `status_public_site.ps1` — URL, PID процессов и проверка готовности.
- `stop_public_site.ps1` — остановка backend и туннеля текущего запуска.
- `README.md` — запуск, обновление и карта проекта.

### Backend: `chronicle/`

- `config.py` — чтение окружения и пути к базе/frontend.
- `main.py` — создание и запуск Uvicorn.
- `domain/models.py` — отдельные доменные модели сущностей, досок, узлов и связей.
- `domain/policies.py` — контекстные типы объектов и названия связей.
- `application/services.py` — сценарии сессии, CRUD, досок, связей и запросов хроники.
- `ports/repositories.py` — интерфейсы репозиториев и Unit of Work.
- `infrastructure/mappers.py` — преобразование доменных объектов в legacy JSON и обратно.
- `infrastructure/migrations.py` — последовательные, идемпотентные миграции SQLite.
- `infrastructure/sqlite.py` — SQLite-адаптеры репозиториев.
- `presentation/api.py` — FastAPI `/api/v1`, временный compatibility-router и раздача Vite-сборки.

### Frontend: `frontend/`

- `package.json` и `package-lock.json` — npm-команды и зафиксированные зависимости.
- `tsconfig.json` — строгая конфигурация TypeScript.
- `index.html` — Vite-точка входа.
- `src/main.ts` — запуск `AppController`.
- `src/styles.css` — общая gothic/noir-тема и адаптивные стили.
- `src/domain/types.ts` — API-типы, ссылки на сущности, доски и раскладка графа.
- `src/domain/registry.ts` — поля форм и возможности типов сущностей.
- `src/domain/board-geometry.ts` — чистая геометрия карточек и связей доски.
- `src/domain/graph-projection.ts` — обход графа по глубине цепочки.
- `src/domain/graph-visuals.ts` — размеры и фигуры узлов для двух режимов графа.
- `src/application/store.ts` — централизованное состояние приложения.
- `src/application/interaction-state.ts` — state machine жестов доски.
- `src/infrastructure/gateway.ts` — узкие HTTP-шлюзы к `/api/v1`.
- `src/presentation/app-controller.ts` — layout, маршруты, навигация, таймлайн и поиск.
- `src/presentation/entity-controller.ts` — типовой CRUD, карточки, формы и связи.
- `src/presentation/board-controller.ts` — доски расследования и их команды.
- `src/presentation/graph-controller.ts` — режимы, фильтры, поиск и инспекторы графа.
- `src/presentation/svg-graph-scene.ts` — pan, zoom, drag и физика SVG-графа.
- `src/presentation/forms.ts` — рендеринг и сбор данных форм.
- `src/presentation/modal.ts` — модальные окна и уведомления.
- `src/ui/dom.ts` — безопасное экранирование и небольшие DOM-утилиты.
- `src/**/*.test.ts` — модульные тесты чистой логики.

### Данные И Логи

- `data/chronicle.db` — рабочая SQLite-база; не удалять при обновлении.
- `data/backups/` — локальные резервные копии перед миграциями.
- `logs/public-site-state.json` — PID, URL и состояние текущего запуска.
- `logs/*.log` — вывод backend и Serveo; их можно удалить при остановленном сайте.

### Тесты

- `tests/test_mappers.py` — round-trip всех доменных типов и legacy-полей.
- `tests/test_api.py` — авторизация, CRUD, доски и универсальные связи.
- `tests/test_migrations.py` — миграция копии рабочей базы без потери записей.

## Режимы Графа

- **Настраиваемый** — крупные круги, узловая точка, глубина цепочки, статусы, индивидуальные цвета и размеры.
- **Obsidian** — все узлы компактными фигурами, подписи и поиск. ЛКМ открывает краткую карточку, ПКМ открывает меню перехода на полную страницу.

В обоих режимах притягиваются только реально связанные узлы. Перенесённый узел закрепляется на новом месте.
