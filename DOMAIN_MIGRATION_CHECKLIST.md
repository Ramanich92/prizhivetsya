# DOMAIN MIGRATION CHECKLIST

Не добавляйте файл `CNAME` с заглушкой. Его нужно создавать только после выбора реального домена.

## После выбора домена

1. Создать `CNAME` с точным доменом, например `example.ru` или `www.example.ru`.
2. Обновить canonical и OG URL во всех HTML-страницах.
3. Обновить `sitemap.xml` и `robots.txt`.
4. Проверить HTTPS и 404.
5. Проверить, какой адрес основной: с `www` или без.
6. После переезда открыть `/version.html`, `/sitemap.xml`, `/robots.txt`, `/privacy.html`, `/terms.html`, `/contacts.html`.

## До выбора домена

Текущие canonical и sitemap оставлены на GitHub Pages-адресе:
`https://ramanich92.github.io/prizhivetsya/`
