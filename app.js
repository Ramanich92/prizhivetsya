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
    const adjustedRank = Math.min(5, baseRank + Math.min(2, impact.add));
    const adjusted = labelForRank(adjustedRank);
    const filters = (data.filters[r] || []).map(x=>'<li>'+x+'</li>').join('');
    const impacts = impact.impacts.length ? impact.impacts.map(x=>'<li>'+x+'</li>').join('') : '<li>отмеченные факторы пока не повышают риск для этой пары региона и культуры</li>';
    out.innerHTML = '<h3>'+cropName+' · '+regionName+'</h3>'+
      '<div class="result-badges"><span class="badge '+level.cls+'">База: '+level.label+'</span><span class="badge '+adjusted.cls+'">С учётом участка: '+adjusted.label+'</span></div>'+
      '<p>'+note+'</p>'+
      '<div class="check-grid">'+
        '<div class="card"><h3>Что изменило оценку</h3><ul>'+impacts+'</ul></div>'+
        '<div class="card"><h3>Региональные фильтры</h3><ul>'+filters+'</ul></div>'+
        '<div class="card"><h3>Как читать результат</h3><p>'+level.text+'</p><p>'+data.routes[r]+'</p></div>'+
        '<div class="card"><h3>Следующий шаг</h3><p><a class="inline-link" href="regions/'+r+'.html">Открыть регион</a> → <a class="inline-link" href="crops/'+data.crops[c].slug+'.html">культура</a> → <a class="inline-link" href="varieties/regions/'+r+'.html">сорта региона</a>.</p></div>'+
      '</div>';
  }
  region.addEventListener('change', render);
  crop.addEventListener('change', render);
  factors.forEach(f => f.addEventListener('change', render));
  render();
});
