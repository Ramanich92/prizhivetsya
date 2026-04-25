
(function(){
  const siteData = window.SITE_DATA;
  if(!siteData){ console.warn('SITE_DATA missing'); return; }
  function esc(s){return String(s ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function levelBadge(level){const l=siteData.levels[level]||{label:level};return `<span class="badge ${esc(level)}">${esc(l.label)}</span>`}
  function cropCard(c, prefix=''){
    const vars=(c.varieties&&c.varieties.length)?c.varieties.slice(0,8).map(v=>`<span class="pill">${esc(v)}</span>`).join(''):'<span class="pill">сорта не показываем</span>';
    const risks=(c.risks||[]).slice(0,5).map(r=>`<li>${esc(r)}</li>`).join('');
    return `<article class="card crop" data-level="${esc(c.level)}" data-search="${esc((c.name+' '+c.summary+' '+(c.varieties||[]).join(' ')).toLowerCase())}">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:start"><h3>${esc(c.name)}</h3>${levelBadge(c.level)}</div>
      <p class="muted">${esc(c.summary)}</p><div class="varieties">${vars}</div>
      <b>Главные риски</b><ul class="risklist">${risks}</ul>
      <p><b>Совет:</b> ${esc(c.advice)}</p>
      <a class="btn ghost" href="${prefix}crops/${esc(c.slug)}.html">Подробнее</a>
    </article>`;
  }
  function renderStats(){document.querySelectorAll('[data-stats]').forEach(stats=>{let counts={};siteData.crops.forEach(c=>counts[c.level]=(counts[c.level]||0)+1);stats.innerHTML=Object.entries(siteData.levels).map(([k,l])=>`<div class="stat"><b>${counts[k]||0}</b><span>${esc(l.label)}</span></div>`).join('')})}
  function renderCrops(){document.querySelectorAll('[data-crops-grid]').forEach(grid=>{const prefix=grid.dataset.prefix||'';grid.innerHTML=siteData.crops.map(c=>cropCard(c,prefix)).join('')});}
  function renderTable(){document.querySelectorAll('[data-crops-table]').forEach(table=>{table.innerHTML='<div class="tableWrap"><table class="table"><thead><tr><th>Культура</th><th>Оценка</th><th>Коротко</th></tr></thead><tbody>'+siteData.crops.map(c=>`<tr data-level="${esc(c.level)}"><td><b>${esc(c.name)}</b></td><td>${levelBadge(c.level)}</td><td>${esc(c.summary)}</td></tr>`).join('')+'</tbody></table></div>'});}
  function renderQuestions(){document.querySelectorAll('[data-questions]').forEach(qs=>{qs.innerHTML=siteData.siteQuestions.map(q=>`<label class="question"><input type="checkbox" data-risk-question data-risk-text="${esc(q.riskImpact)}"><span><b>${esc(q.question)}</b><br><small class="muted">${esc(q.riskImpact)}</small></span></label>`).join('')});}

  function renderVerified(){document.querySelectorAll('[data-verified-table]').forEach(el=>{const rows=(window.VERIFIED_VARIETIES?.items||[]).map(v=>{const url=v.pageUrl||('varieties/'+v.slug+'.html');return `<tr class="verifiedRow" data-search="${esc((v.crop+' '+v.variety+' '+v.status+' '+v.recommendation+' '+v.facts.join(' ')).toLowerCase())}"><td><a class="varietyLink" href="${esc(url)}"><b>${esc(v.variety)}</b></a><br><span class="small muted">${esc(v.crop)}</span></td><td><span class="checkBadge">${esc(v.status)}</span><br><span class="small muted">${esc(v.sourceType||'primary')}</span></td><td>${esc(v.recommendation)}</td><td><ul class="auditFacts">${v.facts.slice(0,4).map(f=>`<li>${esc(f)}</li>`).join('')}</ul></td><td><a class="sourceLink" href="${esc(v.sourceUrl)}" target="_blank" rel="noopener">источник</a></td></tr>`}).join('');el.innerHTML='<div class="tableWrap"><table class="table"><thead><tr><th>Сорт</th><th>Статус</th><th>Решение</th><th>Факты</th><th>Источник</th></tr></thead><tbody>'+rows+'</tbody></table></div>'})}
  function renderVarieties(){document.querySelectorAll('[data-varieties-table]').forEach(el=>{const pageMap=new Map((window.VERIFIED_VARIETIES?.items||[]).map(v=>[v.crop+'|'+v.variety, v.pageUrl]));const rows=(siteData.varietyCandidates||[]).map(v=>{const url=pageMap.get(v.crop+'|'+v.variety);const name=url?`<a class="varietyLink" href="${esc(url)}"><b>${esc(v.variety)}</b></a>`:`<b>${esc(v.variety)}</b>`;return `<tr class="varietyRow" data-search="${esc((v.crop+' '+v.variety+' '+v.source).toLowerCase())}" data-level="${esc(v.level)}"><td>${name}</td><td>${esc(v.crop)}</td><td>${levelBadge(v.level)}</td><td>${esc(v.status)}</td><td class="muted">${esc(v.source)}</td></tr>`}).join('');el.innerHTML='<div class="tableWrap"><table class="table"><thead><tr><th>Сорт</th><th>Культура</th><th>Базовая оценка культуры</th><th>Статус</th><th>Источник для проверки</th></tr></thead><tbody>'+rows+'</tbody></table></div>'})}
  function applyFilters(){const active=document.querySelector('.chip.active')?.dataset.level||'all';const query=(document.querySelector('[data-search-crops]')?.value||'').toLowerCase().trim();document.querySelectorAll('.crop').forEach(el=>{const okLevel=active==='all'||el.dataset.level===active;const okSearch=!query||el.dataset.search.includes(query);el.classList.toggle('hidden',!(okLevel&&okSearch));});document.querySelectorAll('[data-crops-table] tbody tr').forEach(el=>{el.style.display=active==='all'||el.dataset.level===active?'':'none'});const verifiedQ=(document.querySelector('[data-search-verified]')?.value||'').toLowerCase().trim();document.querySelectorAll('.verifiedRow').forEach(el=>{el.classList.toggle('hidden', verifiedQ && !el.dataset.search.includes(verifiedQ));});const vq=(document.querySelector('[data-search-varieties]')?.value||'').toLowerCase().trim();document.querySelectorAll('.varietyRow').forEach(el=>{el.classList.toggle('hidden', vq && !el.dataset.search.includes(vq));});}
  function setup(){document.querySelectorAll('.chip').forEach(chip=>chip.addEventListener('click',()=>{document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));chip.classList.add('active');applyFilters()}));document.querySelector('[data-search-crops]')?.addEventListener('input',applyFilters);document.querySelector('[data-search-varieties]')?.addEventListener('input',applyFilters);document.querySelector('[data-search-verified]')?.addEventListener('input',applyFilters);document.addEventListener('change',e=>{if(e.target.matches('[data-risk-question]')){const arr=[...document.querySelectorAll('[data-risk-question]:checked')].map(i=>i.dataset.riskText);const box=document.querySelector('[data-risk-result]');if(box)box.innerHTML=arr.length?`<div class="warn"><b>Риск участка повышен:</b><ul>${arr.map(s=>`<li>${esc(s)}</li>`).join('')}</ul><p>Черешню, абрикос и виноград лучше считать более рискованными.</p></div>`:`<div class="ok">Отметьте условия участка — здесь появится корректировка риска.</div>`}});document.querySelectorAll('[data-lead-form]').forEach(form=>form.addEventListener('submit',async e=>{
    e.preventDefault();
    const cfg=window.PRIZHIVETSYA_CONFIG||{};
    const fd=new FormData(form);
    const payload={
      createdAt:new Date().toISOString(),
      sourcePage:location.pathname.split('/').pop()||'index.html',
      region:fd.get('region')||cfg.DEFAULT_REGION||'Московская область',
      location:fd.get('location')||fd.get('place')||'',
      crops:fd.get('crops')||fd.get('message')||'',
      contacts:fd.get('contacts')||fd.get('email')||'',
      budget:fd.get('budget')||'',
      siteConditions:[...form.querySelectorAll('input[type="checkbox"]:checked')].filter(i=>i.name!=='consent').map(i=>i.value||i.name).join(', '),
      consent:Boolean(form.querySelector('[name="consent"]')?.checked)
    };
    if(form.querySelector('[name="consent"]')&&!payload.consent){alert('Перед отправкой нужно согласие с условиями и обработкой данных.');return;}
    function formatLead(p){return `Заявка на план сада\n\nДата: ${p.createdAt}\nРегион: ${p.region}\nНаселённый пункт: ${p.location}\nЧто хочет посадить: ${p.crops}\nУсловия участка: ${p.siteConditions}\nБюджет/формат: ${p.budget}\nКонтакты: ${p.contacts}\nИсточник: ${p.sourcePage}\n`;}
    if((cfg.FORM_MODE||'local')==='tally'&&cfg.TALLY_FORM_URL){location.href=cfg.TALLY_FORM_URL;return;}
    if((cfg.FORM_MODE||'local')==='formspree'&&cfg.FORMSPREE_ENDPOINT){
      try{const res=await fetch(cfg.FORMSPREE_ENDPOINT,{method:'POST',body:fd,headers:{'Accept':'application/json'}}); if(res.ok){location.href='thank-you.html';return;} alert('Форма не отправилась. Проверьте endpoint Formspree.');}catch(err){alert('Не удалось отправить форму: '+err.message);} return;
    }
    const mailto=`mailto:${cfg.OWNER_EMAIL||''}?subject=${encodeURIComponent('Заявка на план сада — Приживётся?')}&body=${encodeURIComponent(formatLead(payload))}`;
    if((cfg.FORM_MODE||'local')==='mailto'){location.href=mailto;return;}
    const leads=JSON.parse(localStorage.getItem('prizhivetsya_leads')||'[]'); leads.push(payload); localStorage.setItem('prizhivetsya_leads',JSON.stringify(leads));
    const box=form.querySelector('[data-form-result]')||document.querySelector('[data-form-result]');
    if(box){box.innerHTML=`<div class="ok"><b>Заявка сохранена локально.</b><p>Для теста она лежит в браузере. Можно <a href="${mailto}">отправить её письмом</a> или открыть <a href="leads.html">локальные заявки</a>.</p></div>`;} else {alert('Заявка сохранена локально. Откройте leads.html.');}
    form.reset();
  }));
  function renderLocalLeads(){const el=document.querySelector('[data-local-leads]');if(!el)return;const leads=JSON.parse(localStorage.getItem('prizhivetsya_leads')||'[]');if(!leads.length){el.innerHTML='<div class="notice">Пока нет локальных заявок. Оставьте тестовую заявку через форму.</div>';return;}el.innerHTML='<div class="tableWrap"><table class="table"><thead><tr><th>Дата</th><th>Место</th><th>Что посадить</th><th>Контакты</th><th>Страница</th></tr></thead><tbody>'+leads.map(l=>`<tr><td>${esc(l.createdAt)}</td><td>${esc(l.location||l.region)}</td><td>${esc(l.crops)}</td><td>${esc(l.contacts)}</td><td>${esc(l.sourcePage)}</td></tr>`).join('')+'</tbody></table></div>';}
  document.querySelector('[data-export-leads]')?.addEventListener('click',()=>{const leads=JSON.parse(localStorage.getItem('prizhivetsya_leads')||'[]');const cols=['createdAt','region','location','crops','siteConditions','budget','contacts','sourcePage'];const csv=[cols.join(';')].concat(leads.map(l=>cols.map(c=>'"'+String(l[c]||'').replaceAll('"','""')+'"').join(';'))).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='prizhivetsya-leads.csv';a.click();URL.revokeObjectURL(a.href);});
  document.querySelector('[data-clear-leads]')?.addEventListener('click',()=>{if(confirm('Удалить локальные заявки из браузера?')){localStorage.removeItem('prizhivetsya_leads');location.reload();}});
  renderLocalLeads();}
  renderStats();renderCrops();renderTable();renderQuestions();renderVarieties();renderVerified();setup();applyFilters();
})();
