# Приживётся — v58

Полная сборка после v57 без отдельного hotfix-пакета. Цель v58 — привести релиз к одному состоянию: один архив, один deploy-маркер, актуальные служебные страницы и повторная проверка видимого 10-регионного слоя.

## Что изменено

- `version.html` обновлён до v58.
- `deployment-check.html` обновлён до v58.
- Добавлен `V58_DEPLOY_TEST.txt`.
- Старые deploy-маркеры V54–V57 удалены из архива v58.
- Повторно проверены страницы, где раньше всплывал старый слой на 8 регионов:
  - `purchase.html`
  - `soil.html`
  - `calendar.html`
  - `first-garden.html`
  - `do-not-buy.html`
  - `garden-health-check.html`
- Контакты и юридические страницы оставлены без выдуманных реквизитов; перед доменом нужно подставить реальные данные.
- Добавлены `V58_DEPLOY_NOTES.md` и `DOMAIN_MIGRATION_CHECKLIST.md`.

## Контроль после деплоя

- `/V58_DEPLOY_TEST.txt`
- `/data/site-version.json`
- `/version.html`
- `/deployment-check.html`
- `/purchase.html`
- `/soil.html`
- `/calendar.html`
- `/first-garden.html`
- `/do-not-buy.html`
- `/garden-health-check.html`

## Важно для чистого наката

Если в репозитории остались `V54_DEPLOY_TEST.txt`, `V55_DEPLOY_TEST.txt`, `V56_DEPLOY_TEST.txt` или `V57_DEPLOY_TEST.txt`, удалите их отдельным commit/deletion. В архив v58 они не входят.
