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
        '<div class="card"><h3>Следующий шаг</h3><p><a class="inline-link" href="regions/'+r+'.html">Открыть регион</a> → <a class="inline-link" href="crops/'+data.crops[c].slug+'.html">культура</a> → <a class="inline-link" href="varieties/regions/'+r+'.html">сорта региона</a>.</p></div>'+
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
