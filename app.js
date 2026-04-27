document.addEventListener('input', function(e){
  if(!e.target.matches('[data-filter-input]')) return;
  const q=e.target.value.toLowerCase();
  document.querySelectorAll('[data-filter-item]').forEach(el=>{el.style.display=el.textContent.toLowerCase().includes(q)?'':'none'});
});

document.addEventListener('DOMContentLoaded', function(){
  const root = document.querySelector('[data-site-checker]');
  if(!root) return;
  const dataNode = document.getElementById('site-check-data');
  if(!dataNode) return;
  const data = JSON.parse(dataNode.textContent);
  const region = root.querySelector('[data-check-region]');
  const subregion = root.querySelector('[data-check-subregion]');
  const locality = root.querySelector('[data-check-locality]');
  const crop = root.querySelector('[data-check-crop]');
  const out = root.querySelector('[data-check-result]');
  const factors = Array.from(root.querySelectorAll('[data-factor]'));
  const warmCrops = new Set(['sweet_cherry','apricot','grape','peach']);
  const stoneCrops = new Set(['plum','sour_cherry','sweet_cherry','apricot','peach']);
  const treeCrops = new Set(['apple','pear','plum','sour_cherry','sweet_cherry','apricot','peach']);
  const pollinatorCrops = new Set(['plum','sweet_cherry','honeysuckle','pear']);
  const southRegions = new Set(['krasnodarskiy-kray','rostovskaya-oblast']);
  const coldRegions = new Set(['leningradskaya-oblast','sverdlovskaya-oblast','bashkortostan','respublika-tatarstan']);
  function checked(id){ return root.querySelector('[data-factor="'+id+'"]').checked; }
  function fillSubregions(){
    if(!subregion) return;
    const list = (data.subregions && data.subregions[region.value]) || [];
    subregion.innerHTML = '<option value="base">Без уточнения подзоны</option>' + list.map(z => '<option value="'+z.id+'">'+z.name+'</option>').join('');
  }
  function currentSubzone(){
    if(!subregion || !data.subregions || !data.subregions[region.value]) return null;
    return data.subregions[region.value].find(z => z.id === subregion.value) || null;
  }
  function fillLocalities(){
    if(!locality) return;
    const list = (data.localities && data.localities[region.value]) || [];
    const sub = subregion ? subregion.value : 'base';
    const filtered = sub && sub !== 'base' ? list.filter(x => x.sub === sub) : list;
    locality.innerHTML = '<option value="base">Без местного ориентира</option>' + filtered.map(x => '<option value="'+x.id+'">'+x.name+'</option>').join('');
  }
  function currentLocality(){
    if(!locality || !data.localities || !data.localities[region.value]) return null;
    return data.localities[region.value].find(x => x.id === locality.value) || null;
  }
  function factorImpact(r,c){
    const impacts=[];
    let add=0;
    if(checked('lowland') && (treeCrops.has(c) || warmCrops.has(c))){ add++; impacts.push('низина повышает риск заморозков, сырости и подопревания'); }
    if(checked('under6sun') && (treeCrops.has(c) || warmCrops.has(c) || c==='grape')){ add++; impacts.push('нехватка солнца снижает вызревание, сахар и зимовку побегов'); }
    if(checked('wind') && (warmCrops.has(c) || coldRegions.has(r))){ add++; impacts.push('ветер усиливает зимний стресс и иссушение молодых посадок'); }
    if(checked('wet') && treeCrops.has(c)){ add++; impacts.push('сырость и близкая вода опасны для корней и косточковых культур'); }
    if(checked('noPollinators') && pollinatorCrops.has(c)){ add++; impacts.push('без совместимых опылителей урожай может быть слабым даже при хорошем цветении'); }
    if(checked('noIrrigation') && (southRegions.has(r) || ['blackcurrant','gooseberry','raspberry','honeysuckle'].includes(c))){ add++; impacts.push('без полива южная жара или засуха быстро снижают потенциал посадки'); }
    if(checked('noCare') && (warmCrops.has(c) || stoneCrops.has(c) || c==='grape')){ add++; impacts.push('культура требует формировки, защиты или профилактики болезней'); }
    return {add, impacts};
  }
  function labelForRank(rank){
    if(rank <= 1) return {label:'участок не ухудшает базовый статус', cls:'level-reliable'};
    if(rank === 2) return {label:'можно, но с проверкой сорта и места', cls:'level-suitable'};
    if(rank === 3) return {label:'риск повышен: не брать случайный саженец', cls:'level-risky'};
    if(rank === 4) return {label:'только как опытная посадка', cls:'level-high-risk'};
    return {label:'не делать первой покупкой', cls:'level-not-recommended'};
  }
  function render(){
    const r = region.value;
    const c = crop.value;
    const levelKey = data.regions[r].matrix[c];
    const level = data.levels[levelKey];
    const regionName = data.regions[r].name;
    const cropName = data.crops[c].name;
    const note = data.notes[r][c] || '';
    const baseRank = data.rank[levelKey] || 3;
    const impact = factorImpact(r,c);
    const zone = currentSubzone();
    const place = currentLocality();
    const zoneDelta = zone && zone.modifier && zone.modifier[c] ? zone.modifier[c] : 0;
    const placeDelta = place && place.modifiers && place.modifiers[c] ? place.modifiers[c] : 0;
    const adjustedRank = Math.min(5, Math.max(1, baseRank + zoneDelta + placeDelta + Math.min(2, impact.add)));
    const adjusted = labelForRank(adjustedRank);
    const filters = (data.filters[r] || []).map(x=>'<li>'+x+'</li>').join('');
    const zoneLine = zone ? '<li>подзона: '+zone.summary+' '+(zone.modifier && zone.modifier[c] ? (zone.modifier[c] < 0 ? 'Для этой культуры подзона читает базовую оценку мягче.' : 'Для этой культуры подзона читает базовую оценку строже.') : 'Для этой культуры подзона не меняет базовый уровень, но уточняет условия.')+'</li>' : '';
    const placeLine = place ? '<li>местный ориентир: '+place.profile+' '+(place.modifiers && place.modifiers[c] ? (place.modifiers[c] < 0 ? 'Для этой культуры ориентир читает оценку мягче.' : 'Для этой культуры ориентир читает оценку строже.') : 'Для этой культуры местный ориентир не меняет уровень, но уточняет риски.')+'</li>' : '';
    const impacts = (zoneLine + placeLine + (impact.impacts.length ? impact.impacts.map(x=>'<li>'+x+'</li>').join('') : '<li>отмеченные факторы участка пока не повышают риск для этой пары региона и культуры</li>'));
    out.innerHTML = '<h3>'+cropName+' · '+regionName+'</h3>'+
      '<div class="result-badges"><span class="badge '+level.cls+'">База: '+level.label+'</span><span class="badge '+adjusted.cls+'">С учётом участка: '+adjusted.label+'</span></div>'+
      '<p>'+note+'</p>'+ (zone ? '<p class="data-note"><strong>Подзона:</strong> '+zone.advice+'</p>' : '') + (place ? '<p class="data-note"><strong>Местный ориентир:</strong> '+place.advice+'</p>' : '') +
      '<div class="check-grid">'+
        '<div class="card"><h3>Что изменило оценку</h3><ul>'+impacts+'</ul></div>'+
        '<div class="card"><h3>Региональные фильтры</h3><ul>'+filters+'</ul></div>'+
        '<div class="card"><h3>Как читать результат</h3><p>'+level.text+'</p><p>'+data.routes[r]+'</p></div>'+
        '<div class="card"><h3>Следующий шаг</h3><p><a class="inline-link" href="guides/'+r+'/'+data.crops[c].slug+'.html">Открыть связку регион+культура</a> → <a class="inline-link" href="varieties/regions/'+r+'.html">сорта региона</a> → <a class="inline-link" href="corrections.html">уточнить данные</a>.</p></div>'+
      '</div>';
  }
  region.addEventListener('change', function(){ fillSubregions(); fillLocalities(); render(); });
  if(subregion) subregion.addEventListener('change', function(){ fillLocalities(); render(); });
  if(locality) locality.addEventListener('change', render);
  crop.addEventListener('change', render);
  factors.forEach(f => f.addEventListener('change', render));
  fillSubregions();
  fillLocalities();
  render();
});


document.addEventListener('DOMContentLoaded', function(){
  const root = document.querySelector('[data-garden-planner]');
  if(!root) return;
  const dataNode = document.getElementById('garden-planner-data');
  if(!dataNode) return;
  const data = JSON.parse(dataNode.textContent);
  const region = root.querySelector('[data-planner-region]');
  const scenario = root.querySelector('[data-planner-scenario]');
  const ambition = root.querySelector('[data-planner-ambition]');
  const out = root.querySelector('[data-planner-result]');
  const factors = Array.from(root.querySelectorAll('[data-planner-factor]'));
  const pollinatorCrops = new Set(['plum','sweet_cherry','honeysuckle','pear']);
  const waterSensitive = new Set(['blackcurrant','raspberry','gooseberry','honeysuckle']);
  const wetSensitive = new Set(['apple','pear','plum','sour_cherry','sweet_cherry','apricot','peach']);
  const warmCrops = new Set(['sweet_cherry','apricot','grape','peach']);
  function checked(id){ const el=root.querySelector('[data-planner-factor="'+id+'"]'); return el && el.checked; }
  function cropLink(c){ return '<a href="crops/'+data.crops[c].slug+'.html">'+data.crops[c].name+'</a>'; }
  function baseRank(regionKey, cropKey){
    const levelKey = data.regions[regionKey].matrix[cropKey] || 'suitable';
    return data.rank[levelKey] || 3;
  }
  function penalty(cropKey){
    let p=0, reasons=[];
    if(checked('lowland') && warmCrops.has(cropKey)){ p++; reasons.push('низина делает теплолюбивые культуры строже'); }
    if(checked('wet') && wetSensitive.has(cropKey)){ p++; reasons.push('сырость опасна для деревьев и косточковых'); }
    if(checked('small') && ['apple','pear','plum','sweet_cherry','apricot','peach'].includes(cropKey)){ p++; reasons.push('на маленьком участке важны размер и подвой'); }
    if(checked('noIrrigation') && waterSensitive.has(cropKey)){ p++; reasons.push('без полива ягодники и малина теряют стабильность'); }
    if(checked('noPollinators') && pollinatorCrops.has(cropKey)){ p++; reasons.push('нет места для опылителя'); }
    if(checked('noCare') && ['plum','sour_cherry','sweet_cherry','apricot','grape','peach'].includes(cropKey)){ p++; reasons.push('культура требует защиты, формировки или профилактики'); }
    return {p: Math.min(2,p), reasons};
  }
  function ambitionShift(){
    if(ambition.value === 'safe') return 0;
    if(ambition.value === 'balanced') return -1;
    return -2;
  }
  function scenarioById(id){ return data.scenarios.find(s => s.id === id) || data.scenarios[0]; }
  function pushUnique(arr, value){ if(arr.indexOf(value) === -1) arr.push(value); }
  function render(){
    const r=region.value;
    const sc=scenarioById(scenario.value);
    const start=[], check=[], hold=[];
    const all=[];
    ['best','careful','avoid'].forEach(k => (sc[k]||[]).forEach(c => pushUnique(all,c)));
    Object.keys(data.crops).forEach(c => { if(all.indexOf(c)===-1 && baseRank(r,c)<=2) all.push(c); });
    const reasonMap={};
    all.forEach(c => {
      const base=baseRank(r,c);
      const pen=penalty(c);
      const scenarioPenalty = (sc.avoid||[]).indexOf(c)>=0 ? 2 : ((sc.careful||[]).indexOf(c)>=0 ? 1 : 0);
      let finalRank = Math.max(1, Math.min(5, base + pen.p + scenarioPenalty + ambitionShift()));
      if(ambition.value === 'safe' && warmCrops.has(c) && base>=3) finalRank = Math.max(finalRank,4);
      const reasons=[];
      reasons.push('региональный уровень: '+data.levels[data.regions[r].matrix[c] || 'suitable'].label);
      if(scenarioPenalty===1) reasons.push('сценарий требует проверки');
      if(scenarioPenalty===2) reasons.push('сценарий советует отложить');
      pen.reasons.forEach(x=>reasons.push(x));
      reasonMap[c]=reasons;
      if(finalRank<=2) start.push(c); else if(finalRank===3) check.push(c); else hold.push(c);
    });
    function col(title, arr, cls){
      const items = arr.length ? arr.map(c => '<div class="basket-item">'+cropLink(c)+'<span class="badge '+cls+'">'+data.crops[c].name+'</span></div>').join('') : '<p class="muted">Нет культур в этой корзине для выбранных условий.</p>';
      const reasons = arr.slice(0,4).map(c => '<li><strong>'+data.crops[c].name+':</strong> '+reasonMap[c].join('; ')+'</li>').join('');
      return '<div class="basket-column"><h4>'+title+'</h4><div class="basket-list">'+items+'</div>'+(reasons?'<ul class="reason-list">'+reasons+'</ul>':'')+'</div>';
    }
    out.innerHTML = '<h3>'+data.regions[r].name+' · '+sc.title+'</h3><p>'+sc.summary+'</p>'+
      '<div class="planner-basket">'+
      col('Можно начинать', start, 'level-reliable')+
      col('Только после проверки', check, 'level-risky')+
      col('Не первая покупка', hold, 'level-not-recommended')+
      '</div>'+
      '<div class="scenario-note"><strong>Маршрут:</strong> откройте страницу региона, затем сценарий, культуру и сортовой маршрут. Проверка участка нужна до покупки, а не после посадки.</div>';
  }
  [region,scenario,ambition].forEach(el => el.addEventListener('change', render));
  factors.forEach(el => el.addEventListener('change', render));
  render();
});


document.addEventListener('DOMContentLoaded', function(){
  const root=document.querySelector('[data-spacing-planner]');
  if(!root) return;
  const node=document.getElementById('spacing-data');
  if(!node) return;
  const data=JSON.parse(node.textContent);
  const crop=root.querySelector('[data-spacing-crop]');
  const form=root.querySelector('[data-spacing-form]');
  const count=root.querySelector('[data-spacing-count]');
  const mode=root.querySelector('[data-spacing-mode]');
  const out=root.querySelector('[data-spacing-result]');
  const factors=Array.from(root.querySelectorAll('[data-spacing-factor]'));
  function checked(id){ const el=root.querySelector('[data-spacing-factor="'+id+'"]'); return el && el.checked; }
  function fillForms(){
    const sp=data.spacing[crop.value];
    form.innerHTML=sp.forms.map(f=>'<option value="'+f[0]+'">'+f[1]+'</option>').join('');
  }
  function currentForm(){
    const sp=data.spacing[crop.value];
    return sp.forms.find(f=>f[0]===form.value)||sp.forms[0];
  }
  function render(){
    const c=crop.value, sp=data.spacing[c], f=currentForm();
    const n=Math.max(1, Math.min(50, parseInt(count.value||sp.defaultCount,10)));
    if(String(n)!==count.value) count.value=n;
    const inRow=Number(f[2]), between=Number(f[3]);
    const rowLength = mode.value==='wall' ? (n*inRow + 0.8).toFixed(1) : ((n-1)*inRow + 1.5).toFixed(1);
    const rows = mode.value==='block' ? Math.ceil(Math.sqrt(n)) : 1;
    const cols = mode.value==='block' ? Math.ceil(n/rows) : n;
    const blockWidth = mode.value==='block' ? ((cols-1)*inRow + 1.5).toFixed(1) : rowLength;
    const blockDepth = mode.value==='block' ? ((rows-1)*between + 1.5).toFixed(1) : (mode.value==='wall' ? '1.2–2.0' : between.toFixed(1));
    const area = mode.value==='wall' ? 'полоса примерно '+rowLength+' м × 1.2–2.0 м' : 'примерно '+blockWidth+' м × '+blockDepth+' м';
    const warns=[];
    sp.warnings.forEach(x=>warns.push(x));
    if(checked('small') && ['apple','pear','plum','sweet_cherry','apricot','peach'].includes(c)) warns.push('на маленьком участке обязательно уточнить подвой и итоговую высоту');
    if(checked('wet') && ['apple','pear','plum','sour_cherry','sweet_cherry','apricot','peach'].includes(c)) warns.push('сырость повышает риск корневых проблем и болезней, особенно у косточковых');
    if(checked('shade') && ['grape','sweet_cherry','apricot','peach','pear'].includes(c)) warns.push('тень резко снижает смысл посадки теплолюбивой культуры');
    if(checked('noPollinator') && ['honeysuckle','sweet_cherry','plum','pear'].includes(c)) warns.push('нет места для опылителя — пересмотрите количество и схему');
    if(checked('noIrrigation') && ['blackcurrant','raspberry','honeysuckle','gooseberry','grape'].includes(c)) warns.push('без полива нужна более осторожная схема и мульча');
    if(checked('fence')) warns.push('оставьте доступ для обрезки, сбора и проветривания, не сажайте вплотную к забору');
    const warnHtml=[...new Set(warns)].map(x=>'<li>'+x+'</li>').join('');
    out.innerHTML='<h3>'+data.crops[c].name+': '+n+' шт.</h3>'+
      '<div class="result-badges"><span class="badge level-suitable">форма: '+f[1]+'</span><span class="badge level-reliable">в ряду: '+inRow+' м</span><span class="badge level-reliable">между рядами: '+between+' м</span></div>'+
      '<div class="check-grid"><div class="card"><h3>Сколько места заложить</h3><p><strong>'+area+'</strong></p><p>Длина ряда: около '+rowLength+' м. Для блока: '+cols+' × '+rows+' растений.</p></div>'+
      '<div class="card"><h3>Опыление</h3><p>'+sp.pollinator+'</p></div>'+
      '<div class="card"><h3>Предупреждения</h3><ul>'+warnHtml+'</ul></div>'+
      '<div class="card"><h3>Следующий шаг</h3><p><a class="inline-link" href="crops/'+data.crops[c].slug+'.html">Открыть культуру</a> → <a class="inline-link" href="guides.html">связки регион+культура</a> → <a class="inline-link" href="site-check.html">проверка участка</a>.</p></div></div>';
  }
  crop.addEventListener('change', function(){ fillForms(); render(); });
  form.addEventListener('change', render);
  count.addEventListener('input', render);
  mode.addEventListener('change', render);
  factors.forEach(x=>x.addEventListener('change', render));
  fillForms();
  count.value=data.spacing[crop.value].defaultCount || 2;
  render();
});


document.addEventListener('DOMContentLoaded', function(){
  const root=document.querySelector('[data-season-planner]');
  if(!root) return;
  const node=document.getElementById('season-planner-data');
  if(!node) return;
  const data=JSON.parse(node.textContent);
  const region=root.querySelector('[data-season-region]');
  const crop=root.querySelector('[data-season-crop]');
  const month=root.querySelector('[data-season-month]');
  const out=root.querySelector('[data-season-result]');
  const factors=Array.from(root.querySelectorAll('[data-season-factor]'));
  function checked(id){ const el=root.querySelector('[data-season-factor="'+id+'"]'); return el && el.checked; }
  function seasonKey(m){ const s=(data.months.find(x=>x.id===m)||data.months[0]).season; return s==='весна'?'spring':s==='лето'?'summer':s==='осень'?'autumn':'winter'; }
  function render(){
    const r=region.value, c=crop.value, mId=month.value;
    const m=data.months.find(x=>x.id===mId)||data.months[0];
    const reg=data.regions[r], cr=data.crops[c];
    const levelKey=(reg.matrix&&reg.matrix[c])||'suitable';
    const level=Array.isArray(data.levels[levelKey])?{label:data.levels[levelKey][0],cls:data.levels[levelKey][1],text:data.levels[levelKey][2]}:data.levels[levelKey];
    const g=cr.group, sKey=seasonKey(mId);
    const cropTasks=(data.cropSeason[g]&&data.cropSeason[g][sKey])||[];
    const warnings=[];
    warnings.push(reg.adjust.risk);
    if((mId==='mar'||mId==='apr'||mId==='may')) warnings.push(reg.adjust.early);
    if((mId==='sep'||mId==='oct'||mId==='nov')) warnings.push(reg.adjust.late);
    if(checked('lowland')) warnings.push('низина усиливает заморозки, сырость и задержку прогрева почвы');
    if(checked('wet')) warnings.push('сырость требует осторожности с косточковыми и посадкой в тяжёлую почву');
    if(checked('noIrrigation')) warnings.push('без полива новые посадки, ягодники и южные участки читаются строже');
    if(checked('warmWall')) warnings.push('тёплая стена может помочь вызреванию, но повышает риск раннего старта и ожогов');
    const baseList=m.base.map(x=>'<li>'+x+'</li>').join('');
    const cropList=cropTasks.map(x=>'<li>'+x+'</li>').join('');
    const avoidList=m.avoid.map(x=>'<li>'+x+'</li>').join('');
    const warnList=[...new Set(warnings)].map(x=>'<li>'+x+'</li>').join('');
    const note=(data.notes[r]&&data.notes[r][c])||'';
    out.innerHTML='<h3>'+reg.name+' · '+cr.name+' · '+m.name+'</h3><div class="result-badges"><span class="badge '+level.cls+'">Региональный статус: '+level.label+'</span><span class="badge level-suitable">'+m.window+'</span></div><p>'+note+'</p><div class="check-grid"><div class="card"><h3>Работы месяца</h3><ul>'+baseList+'</ul></div><div class="card"><h3>Для культуры</h3><ul>'+cropList+'</ul></div><div class="card"><h3>Чего избегать</h3><ul>'+avoidList+'</ul></div><div class="card"><h3>Поправки</h3><ul>'+warnList+'</ul></div></div><p class="data-note"><strong>Следующий шаг:</strong> <a class="inline-link" href="calendar/regions/'+r+'.html">календарь региона</a> → <a class="inline-link" href="calendar/crops/'+cr.slug+'.html">календарь культуры</a> → <a class="inline-link" href="guides/'+r+'/'+cr.slug+'.html">связка регион+культура</a>.</p>';
  }
  [region,crop,month].forEach(el=>el.addEventListener('change', render));
  const btn=root.querySelector('[data-season-run]'); if(btn) btn.addEventListener('click', render);
  factors.forEach(el=>el.addEventListener('change', render));
  render();
});

document.addEventListener('DOMContentLoaded',()=>{const r=document.querySelector('[data-nursery-checker]');if(!r)return;const o=r.querySelector('[data-nursery-result]');const names=['named','region','rootstock','roots','bark','label','seller'];function c(k){let e=r.querySelector('[data-nursery="'+k+'"]');return e&&e.checked}function render(){let n=names.filter(c).length;let level=n>=6?'Можно рассматривать к покупке':n>=4?'Только после уточнений':'Не покупать без проверки';o.innerHTML='<div class="card"><div class="nursery-score">'+n+'/7</div><h2>'+level+'</h2><p>Если нет названия сорта, регионального объяснения, подвоя или нормальных корней — покупку лучше отложить.</p></div>'}r.querySelectorAll('input').forEach(e=>e.addEventListener('change',render));render()});

/* v73 locality picker */
(function(){
  function normalizeText(value){
    return String(value || '').toLowerCase().replace(/ё/g,'е').replace(/[—–-]/g,' ').replace(/\s+/g,' ').trim();
  }
  function escapeHtml(value){
    return String(value || '').replace(/[&<>"]/g, function(ch){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]); });
  }
  function getAllSubjects(data){
    return (data.districts || []).flatMap(function(d){
      return (d.subjects || []).map(function(s){ return Object.assign({ federalDistrictId:d.id, federalDistrictName:d.name, federalDistrictShort:d.short }, s); });
    });
  }
  function findDistrict(data, id){ return (data.districts || []).find(function(d){ return d.id === id; }) || null; }
  function findSubject(data, subjectId){
    for(const d of data.districts || []){
      const subject = (d.subjects || []).find(function(s){ return s.id === subjectId; });
      if(subject) return Object.assign({ federalDistrictId:d.id, federalDistrictName:d.name, federalDistrictShort:d.short }, subject);
    }
    return null;
  }
  function findZone(subject, zoneId){ return subject && (subject.zones || []).find(function(z){ return z.id === zoneId; }) || null; }
  function makeLocationUrl(subject, zone, place){
    const params = new URLSearchParams();
    if(subject && subject.federalDistrictId) params.set('district', subject.federalDistrictId);
    if(subject && subject.id) params.set('subject', subject.id);
    if(zone && zone.id) params.set('zone', zone.id);
    if(place) params.set('place', place);
    return 'location-result.html?' + params.toString();
  }
  function buildSearchIndex(data){
    const index = [];
    for(const d of data.districts || []){
      for(const subject of d.subjects || []){
        const s = Object.assign({ federalDistrictId:d.id, federalDistrictName:d.name, federalDistrictShort:d.short }, subject);
        index.push({ type:'subject', title:subject.name, subtitle:d.name, subject:s, zone:(subject.zones || [])[0] || null, place:'', tokens:normalizeText([subject.name,d.name,d.short].join(' ')) });
        for(const zone of subject.zones || []){
          index.push({ type:'zone', title:zone.name + ' · ' + subject.name, subtitle:d.short + ' · зона / подрегион', subject:s, zone:zone, place:'', tokens:normalizeText([zone.name,subject.name,d.name,d.short].join(' ')) });
          for(const place of zone.places || []){
            index.push({ type:'place', title:place, subtitle:subject.name + ' · ' + zone.name, subject:s, zone:zone, place:place, tokens:normalizeText([place,zone.name,subject.name,d.name,d.short].join(' ')) });
          }
        }
      }
    }
    return index;
  }
  async function loadLocationData(url){
    const response = await fetch(url || 'data/location-data.json', { cache:'no-store' });
    if(!response.ok) throw new Error('location data load failed');
    return response.json();
  }

  document.addEventListener('DOMContentLoaded', async function(){
    const root = document.querySelector('[data-locality-picker]');
    if(!root) return;
    const url = root.getAttribute('data-location-data-url') || 'data/location-data.json';
    const search = root.querySelector('[data-lp-search]');
    const suggestions = root.querySelector('[data-lp-suggestions]');
    const popular = root.querySelector('[data-lp-popular]');
    const districtSelect = root.querySelector('[data-lp-district]');
    const subjectSelect = root.querySelector('[data-lp-subject]');
    const zoneSelect = root.querySelector('[data-lp-zone]');
    const choice = root.querySelector('[data-lp-choice]');
    const openSelected = root.querySelector('[data-lp-open-selected]');
    const openManual = root.querySelector('[data-lp-open-manual]');
    let data, index, selected = null;
    try{
      data = await loadLocationData(url);
      index = buildSearchIndex(data);
    }catch(err){
      if(suggestions) suggestions.innerHTML = '<div class="locality-empty">Не удалось загрузить базу местностей. Проверьте файл <strong>data/location-data.json</strong>.</div>';
      return;
    }
    function renderDistricts(){
      districtSelect.innerHTML = (data.districts || []).map(function(d){ return '<option value="'+escapeHtml(d.id)+'">'+escapeHtml(d.name)+'</option>'; }).join('');
    }
    function renderSubjects(){
      const district = findDistrict(data, districtSelect.value) || (data.districts || [])[0];
      subjectSelect.innerHTML = (district.subjects || []).map(function(s){ return '<option value="'+escapeHtml(s.id)+'">'+escapeHtml(s.name)+'</option>'; }).join('');
      renderZones();
    }
    function renderZones(){
      const subject = findSubject(data, subjectSelect.value);
      zoneSelect.innerHTML = ((subject && subject.zones) || []).map(function(z){ return '<option value="'+escapeHtml(z.id)+'">'+escapeHtml(z.name)+'</option>'; }).join('');
      renderChoice();
    }
    function getManualSelection(){
      const subject = findSubject(data, subjectSelect.value);
      const zone = findZone(subject, zoneSelect.value) || ((subject && subject.zones) || [])[0] || null;
      return { subject, zone, place:'' };
    }
    function renderChoice(){
      const current = selected || getManualSelection();
      if(!current.subject){ choice.innerHTML = ''; return; }
      choice.innerHTML = '<strong>'+escapeHtml(current.place || current.subject.name)+'</strong><span>'+escapeHtml(current.subject.federalDistrictName)+' · '+escapeHtml(current.subject.name)+' · '+escapeHtml(current.zone ? current.zone.name : 'зона не выбрана')+'</span>';
    }
    function setManualFromItem(item){
      if(!item || !item.subject) return;
      districtSelect.value = item.subject.federalDistrictId;
      renderSubjects();
      subjectSelect.value = item.subject.id;
      renderZones();
      if(item.zone) zoneSelect.value = item.zone.id;
      selected = item;
      renderChoice();
    }
    function renderSuggestions(list){
      if(!suggestions) return;
      if(!list.length){ suggestions.innerHTML = '<div class="locality-empty">Пока такой местности нет в базе. Выберите субъект и ближайшую зону вручную — потом добавим точный населённый пункт.</div>'; return; }
      suggestions.innerHTML = list.map(function(item, idx){
        return '<button class="locality-suggestion" type="button" data-lp-result="'+idx+'"><strong>'+escapeHtml(item.title)+'</strong><span>'+escapeHtml(item.subtitle)+'</span></button>';
      }).join('');
      suggestions.__currentResults = list;
    }
    function searchItems(query){
      const q = normalizeText(query);
      if(q.length < 2) return [];
      return index.filter(function(item){ return item.tokens.includes(q); }).slice(0, 10);
    }
    function renderPopular(){
      if(!popular) return;
      const names = ['Клин','Ейск','Бийск','Минусинск','Сочи','Казань','Екатеринбург'];
      const items = names.map(function(name){ return index.find(function(item){ return item.type === 'place' && normalizeText(item.title) === normalizeText(name); }); }).filter(Boolean);
      popular.innerHTML = items.map(function(item, idx){ return '<button class="btn" type="button" data-lp-popular-item="'+idx+'">'+escapeHtml(item.title)+'</button>'; }).join('');
      popular.__currentResults = items;
    }
    renderDistricts();
    renderSubjects();
    renderPopular();
    renderChoice();
    search.addEventListener('input', function(){ selected = null; renderSuggestions(searchItems(search.value)); });
    suggestions.addEventListener('click', function(e){
      const btn = e.target.closest('[data-lp-result]');
      if(!btn) return;
      const item = suggestions.__currentResults[Number(btn.getAttribute('data-lp-result'))];
      selected = item;
      search.value = item.title;
      setManualFromItem(item);
      suggestions.innerHTML = '';
    });
    popular.addEventListener('click', function(e){
      const btn = e.target.closest('[data-lp-popular-item]');
      if(!btn) return;
      const item = popular.__currentResults[Number(btn.getAttribute('data-lp-popular-item'))];
      selected = item;
      search.value = item.title;
      setManualFromItem(item);
    });
    districtSelect.addEventListener('change', function(){ selected = null; renderSubjects(); });
    subjectSelect.addEventListener('change', function(){ selected = null; renderZones(); });
    zoneSelect.addEventListener('change', function(){ selected = null; renderChoice(); });
    openSelected.addEventListener('click', function(){
      const item = selected || searchItems(search.value)[0] || getManualSelection();
      if(item && item.subject) window.location.href = makeLocationUrl(item.subject, item.zone, item.place);
    });
    openManual.addEventListener('click', function(){
      const item = selected || getManualSelection();
      if(item && item.subject) window.location.href = makeLocationUrl(item.subject, item.zone, item.place);
    });
  });

  document.addEventListener('DOMContentLoaded', async function(){
    const root = document.querySelector('[data-location-result]');
    if(!root) return;
    const out = root.querySelector('[data-location-result-output]');
    const url = root.getAttribute('data-location-data-url') || 'data/location-data.json';
    try{
      const data = await loadLocationData(url);
      const params = new URLSearchParams(window.location.search);
      let subject = findSubject(data, params.get('subject'));
      if(!subject){
        const firstDistrict = (data.districts || [])[0];
        subject = firstDistrict && firstDistrict.subjects && firstDistrict.subjects[0] ? Object.assign({ federalDistrictId:firstDistrict.id, federalDistrictName:firstDistrict.name, federalDistrictShort:firstDistrict.short }, firstDistrict.subjects[0]) : null;
      }
      const zone = findZone(subject, params.get('zone')) || ((subject && subject.zones) || [])[0] || null;
      const place = params.get('place') || '';
      if(!subject || !zone){
        out.innerHTML = '<div class="warning"><strong>Местность не найдена.</strong><p>Вернитесь на главную и выберите субъект вручную.</p></div>';
        return;
      }
      const title = place || subject.name;
      const existingPage = subject.page ? '<a class="btn" href="'+escapeHtml(subject.page)+'">Открыть старую подробную страницу региона</a>' : '';
      const places = zone.places && zone.places.length ? '<p><strong>Ориентиры:</strong> '+zone.places.map(escapeHtml).join(', ')+'</p>' : '<p><strong>Ориентиры:</strong> будут добавлены позже.</p>';
      out.innerHTML = '<span class="draft-badge">Каркас местности</span>'+
        '<h1>'+escapeHtml(title)+'</h1>'+
        '<p class="lead">Мы уже определили субъект и рабочую садовую зону. Списки культур по уровням пока оставлены пустыми — их можно заполнять постепенно, не меняя логику выбора.</p>'+
        '<div class="location-breadcrumbs"><span>'+escapeHtml(subject.federalDistrictName)+'</span><span>'+escapeHtml(subject.name)+'</span><span>'+escapeHtml(zone.name)+'</span></div>'+
        '<div class="location-meta-grid"><div class="card"><h3>Субъект РФ</h3><p>'+escapeHtml(subject.name)+'</p></div><div class="card"><h3>Зона / подрегион</h3><p>'+escapeHtml(zone.name)+'</p>'+places+'</div><div class="card"><h3>Статус данных</h3><p>'+(subject.status === 'detailed' ? 'Есть старая подробная региональная страница. Новый слой местностей подключён как вход на сайт.' : 'Создан черновой каркас. Культуры, сорта и уточнения будут добавлены позже.')+'</p></div></div>'+
        '<section class="location-result-panel"><h2>Культуры по уровням</h2><div class="culture-level-grid"><div class="culture-level"><h3>Хорошо приживается</h3><p>Будет заполнено.</p></div><div class="culture-level"><h3>Можно</h3><p>Будет заполнено.</p></div><div class="culture-level"><h3>С укрытием / уходом</h3><p>Будет заполнено.</p></div><div class="culture-level"><h3>Рискованно</h3><p>Будет заполнено.</p></div><div class="culture-level"><h3>Не рекомендовано</h3><p>Будет заполнено.</p></div></div></section>'+
        '<div class="btn-row"><a class="btn primary" href="index.html">Выбрать другую местность</a>'+existingPage+'<a class="btn" href="site-check.html">Проверить участок</a></div>'+
        '<p class="data-source-note">Слой v73: '+escapeHtml(data.scope || '')+'</p>';
      document.title = escapeHtml(title) + ' — Приживётся';
    }catch(err){
      out.innerHTML = '<div class="warning"><strong>Не удалось загрузить базу местностей.</strong><p>Проверьте файл data/location-data.json.</p></div>';
    }
  });
})();
