/* Приживётся? — analytics placeholder.
   До домена файл ничего не отправляет. После запуска:
   1) замените METRIKA_ID в config.js;
   2) включите analyticsEnabled: true;
   3) проверьте cookie/ПДн-документы.
*/
(function () {
  const cfg = window.PRIZHIVETSYA_CONFIG || {};
  if (!cfg.analyticsEnabled || !cfg.metrikaId) return;
  if (localStorage.getItem('prizhivetsya_cookie_ok') !== 'yes') return;
  // Здесь можно вставить код Яндекс Метрики или другого счётчика.
  console.log('Analytics would be loaded:', cfg.metrikaId);
})();
