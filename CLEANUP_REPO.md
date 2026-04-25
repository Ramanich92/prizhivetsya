# Очистка репозитория GitHub

Загрузка через GitHub → Upload files перезаписывает файлы с одинаковыми именами, но НЕ удаляет старые лишние файлы.

Самый чистый способ:

1. Установить GitHub Desktop или git.
2. Клонировать репозиторий ramanich92/prizhivetsya.
3. Удалить все файлы из папки репозитория, кроме скрытой папки .git.
4. Скопировать сюда содержимое пакета prizhivetsya_public_v11_clean.
5. Commit + Push.

Файлы, которые в v11 удалены из публичного пакета:
- deploy.html
- domain-ready.html
- forms-setup.html
- launch-dashboard.html
- leads.html
- next.html
- quality-report.html
- GITHUB_UPLOAD_INSTRUCTION.txt
- netlify.toml
- scripts/
- forms/
