# Veerhau's Companion

Локальный MVP для ведения хроники настольной ролевой кампании в gothic/noir-стиле.

## Текущая домашняя публикация

Сейчас production-схема для быстрого бесплатного внешнего доступа такая:

```text
этот локальный проект
  -> python app.py на http://127.0.0.1:8787
  -> SSH reverse tunnel через Serveo
  -> публичная HTTPS-ссылка
```

Код и база лежат на этом компьютере. GitHub Pages не участвует в сохранении данных; GitHub может быть только местом, куда вы пушите код.

Запустить сайт и получить внешнюю ссылку:

```powershell
.\start_public_site.ps1
```

Посмотреть текущую ссылку, пароль и PID процессов:

```powershell
.\status_public_site.ps1
```

Остановить сайт и туннель:

```powershell
.\stop_public_site.ps1
```

Как выпускать новую версию:

1. Внести изменения в файлы проекта.
2. Проверить локально:

```powershell
python -m py_compile app.py wsgi.py pythonanywhere_wsgi.example.py
node --check static/app.js
```

3. Перезапустить публикацию:

```powershell
.\stop_public_site.ps1
.\start_public_site.ps1
```

После перезапуска Serveo обычно выдаёт новую публичную ссылку. Её нужно отправить игрокам заново. Данные хроники при этом сохраняются в `data/chronicle.db`.

## GitHub Pages demo

В репозитории есть статический `index.html` для GitHub Pages. Он запускает демо-режим без Python-сервера.

Пароль демо: `veerhau`.

Важно: GitHub Pages-демо сохраняет изменения только в `localStorage` браузера конкретного посетителя. Это удобно для показа интерфейса, но не является общей базой данных для игроков.

## Домашний Docker + публичная ссылка

Можно запустить приложение на своём компьютере в Docker и отдать игрокам временную HTTPS-ссылку через Cloudflare Quick Tunnel. Роутер настраивать не нужно.

1. Создайте локальный `.env` из примера:

```powershell
Copy-Item .env.example .env
```

2. В `.env` задайте пароль:

```text
CHRONICLE_PASSWORD=your-strong-password
```

3. Запустите приложение локально:

```powershell
docker compose up --build
```

Локальный адрес:

```text
http://127.0.0.1:8787
```

4. Чтобы получить публичную ссылку, запустите приложение вместе с туннелем:

```powershell
docker compose --profile tunnel up --build
```

В логах сервиса `tunnel` появится URL вида:

```text
https://something.trycloudflare.com
```

Эту ссылку можно отправить игрокам. Компьютер, Docker и tunnel-контейнер должны оставаться включёнными, пока игроки пользуются сайтом. Quick Tunnel-ссылка временная и может измениться после перезапуска. Для постоянного домена нужен named Cloudflare Tunnel или обычный серверный хостинг.

Данные Docker-версии хранятся в volume `chronicle-data`, а внутри контейнера база лежит в `/data/chronicle.db`.

## Домашняя публичная ссылка без Docker

Если Docker Desktop не запускается из-за виртуализации, можно открыть сайт наружу без контейнеров: локальный Python-сервер + Cloudflare Quick Tunnel.

```powershell
.\run_public_tunnel.ps1
```

Скрипт:

- скачает `cloudflared.exe` в `tools/bin`, если его ещё нет;
- создаст `.env` и сгенерирует пароль, если пароль не задан;
- запустит приложение на `http://127.0.0.1:8787`;
- запустит туннель и покажет публичный URL вида `https://something.trycloudflare.com`.

Окно PowerShell нужно держать открытым, пока игроки пользуются сайтом. Чтобы остановить сайт и туннель, нажмите Enter в этом окне.

Данные no-Docker-версии хранятся локально в `data/chronicle.db`.

## Бесплатный хостинг на PythonAnywhere

PythonAnywhere Free подходит для полноценной версии MVP: приложение работает как WSGI web app, а общая SQLite-база хранится в `data/chronicle.db` в файловом хранилище аккаунта.

1. Создайте аккаунт на PythonAnywhere.
2. Откройте **Consoles → Bash**.
3. Склонируйте репозиторий:

```bash
git clone https://github.com/YOUR_USERNAME/veerhau_game_companion.git
```

4. Откройте **Web → Add a new web app**.
5. Выберите домен `YOUR_USERNAME.pythonanywhere.com`.
6. Выберите **Manual configuration** и актуальную версию Python 3.
7. В настройках web app откройте WSGI configuration file.
8. Замените содержимое на пример из `pythonanywhere_wsgi.example.py`, поменяв:
   - `YOUR_USERNAME`;
   - `CHRONICLE_PASSWORD`.
9. В разделе **Static files** можно добавить:
   - URL: `/static/`
   - Directory: `/home/YOUR_USERNAME/veerhau_game_companion/static`
10. Нажмите **Reload**.

После этого приложение будет доступно по адресу:

```text
https://YOUR_USERNAME.pythonanywhere.com
```

Если `CHRONICLE_PASSWORD` не задан, используется пароль `veerhau`, но для реальной игры его лучше сразу заменить в WSGI-файле PythonAnywhere.

Бэкап данных: скачайте файл `data/chronicle.db` из Files-раздела PythonAnywhere.

## Полноценный хостинг на Render

Для общей кампании, где все игроки видят и меняют одни и те же данные, используйте backend-деплой. Проект подготовлен для Render через `render.yaml`.

1. Запушьте репозиторий в GitHub.
2. В Render выберите **New → Blueprint** и подключите этот репозиторий.
3. Render прочитает `render.yaml` и создаст web service `veerhau-companion`.
4. При создании задайте secret env `CHRONICLE_PASSWORD`.
5. Убедитесь, что persistent disk `chronicle-data` смонтирован в `/var/data`.
6. После деплоя откройте выданный Render URL.

Данные production-версии сохраняются в SQLite-файле `/var/data/chronicle.db` на persistent disk. Без persistent disk база будет теряться при рестартах и деплоях.

Локально приложение по-прежнему запускается как раньше. Для production Render задаёт:

```text
CHRONICLE_HOST=0.0.0.0
CHRONICLE_DATA_DIR=/var/data
PORT=<Render задаёт автоматически>
```

## Запуск

```powershell
$env:CHRONICLE_PASSWORD="your-password"
python app.py
```

Если переменная `CHRONICLE_PASSWORD` не задана, используется пароль `veerhau`.

В этой рабочей папке также есть готовые launch-скрипты:

```powershell
.\run_app.ps1
```

или:

```cmd
run_app.cmd
```

После запуска открой:

```text
http://127.0.0.1:8787
```

Данные сохраняются в SQLite-файл `data/chronicle.db`. В браузере хранится только cookie сессии.

## Что есть в MVP

- общий пароль без email-регистрации, OAuth, аккаунтов и ролей;
- серверное хранение данных в SQLite;
- кампания, персонажи, фракции, локации, события, факты, улики, сюжетные линии, теории, мемуары;
- начальные игровые персонажи: Джулия, Дитрих, Рей, Гаррет;
- универсальные связи между любыми объектами;
- раздел “Котерия” для персонажей игроков и их мемуаров;
- именованные Obsidian-like canvas-доски расследования с ручным добавлением карточек, группами и предложениями связанных объектов;
- граф связей, таймлайн и глобальный поиск.
