# V58 DEPLOY NOTES

## Как накатывать

Это полноценная сборка, а не hotfix. Для чистой проверки лучше заменить содержимое публикуемой папки целиком.

## Удалить из репозитория, если они остались после прошлых релизов

- `V54_DEPLOY_TEST.txt`
- `V55_DEPLOY_TEST.txt`
- `V56_DEPLOY_TEST.txt`
- `V57_DEPLOY_TEST.txt`

В v58 должен открываться только актуальный маркер:

- `/V58_DEPLOY_TEST.txt`

## Контроль после деплоя

- `/data/site-version.json` — `"version": "v58"`
- `/version.html` — заголовок `v58`
- `/deployment-check.html` — проверка заливки v58
- `/purchase.html` — 10 регионов
- `/soil.html` — 10 регионов
- `/calendar.html` — 10 регионов
- `/first-garden.html` — 10 регионов
- `/do-not-buy.html` — 10 регионов
- `/garden-health-check.html` — 10 регионов в селекторе
