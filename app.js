
function siteCheck(){
  const risks=[...document.querySelectorAll('input[name="risk"]:checked')].map(i=>i.value);
  const out=document.getElementById('site-result');
  if(!out) return;
  if(!risks.length){out.textContent='Отметьте условия участка — здесь появится краткая подсказка.';return;}
  let msg='Повышенная осторожность: ' + risks.join(', ') + '. ';
  if(risks.includes('низина')||risks.includes('ветер')||risks.includes('вода')) msg += 'Черешню, абрикос и виноград лучше считать рискованными.';
  else msg += 'Можно смотреть базовые культуры и аккуратно проверять рискованные варианты.';
  out.textContent=msg;
}
document.addEventListener('change',e=>{ if(e.target && e.target.name==='risk') siteCheck(); });
