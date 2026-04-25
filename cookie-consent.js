(function(){
  if (localStorage.getItem('prizhivetsya_cookie_ok') === 'yes') return;
  const bar = document.createElement('div');
  bar.className = 'cookieBar';
  bar.innerHTML = '<div><b>Cookies и аналитика</b><p>До публичного запуска аналитика отключена. После подключения счётчиков пользователь должен видеть такое уведомление.</p></div><div class="cookieActions"><a class="btn ghost" href="legal/privacy.html">Политика</a><button class="btn" type="button">Понятно</button></div>';
  document.body.appendChild(bar);
  bar.querySelector('button').addEventListener('click', function(){
    localStorage.setItem('prizhivetsya_cookie_ok','yes');
    bar.remove();
  });
})();
