/* v155: workflow tools, plan map, shopping list and calendar exports, no-assets build */
(function(){
  function normalizeText(value){
    return String(value || '').toLowerCase().replace(/ё/g,'е').replace(/[—–-]/g,' ').replace(/\s+/g,' ').trim();
  }
  function escapeHtml(value){
    return String(value || '').replace(/[&<>"]/g, function(ch){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]); });
  }
  function debounce(fn, delay){
    var timer;
    return function(){
      var ctx = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function(){ fn.apply(ctx, args); }, delay);
    };
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
    if(!subject || !subject.id) return 'index.html';
    const params = new URLSearchParams();
    if(zone && zone.id) params.set('zone', zone.id);
    if(place) params.set('place', place);
    const base = subject.page || ('regions/' + subject.id + '.html');
    const qs = params.toString();
    return base + (qs ? '?' + qs : '');
  }
  function buildSearchIndex(data){
    const index = [];
    for(const d of data.districts || []){
      for(const subject of d.subjects || []){
        const s = Object.assign({ federalDistrictId:d.id, federalDistrictName:d.name, federalDistrictShort:d.short }, subject);
        index.push({ type:'subject', title:subject.name, subtitle:d.name, subject:s, zone:(subject.zones || [])[0] || null, place:'', tokens:normalizeText([subject.name,d.name,d.short].join(' ')) });
        const indexedPlaces = new Set();
        for(const zone of subject.zones || []){
          index.push({ type:'zone', title:zone.name + ' · ' + subject.name, subtitle:d.short + ' · зона / подрегион', subject:s, zone:zone, place:'', tokens:normalizeText([zone.name,subject.name,d.name,d.short].join(' ')) });
          for(const place of zone.places || []){
            indexedPlaces.add(normalizeText(place));
            index.push({ type:'place', title:place, subtitle:subject.name + ' · ' + zone.name, subject:s, zone:zone, place:place, tokens:normalizeText([place,zone.name,subject.name,d.name,d.short].join(' ')) });
          }
        }
        for(const place of subject.searchPlaces || []){
          const key = normalizeText(place);
          if(indexedPlaces.has(key)) continue;
          indexedPlaces.add(key);
          index.push({ type:'place', title:place, subtitle:subject.name + ' · населённый пункт', subject:s, zone:null, place:place, tokens:normalizeText([place,subject.name,d.name,d.short].join(' ')) });
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
    if(!search || !districtSelect || !subjectSelect || !zoneSelect || !choice) return;

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
      choice.innerHTML = '<div><strong>'+escapeHtml(current.place || current.subject.name)+'</strong><span>'+escapeHtml(current.subject.federalDistrictName)+' · '+escapeHtml(current.subject.name)+' · '+escapeHtml(current.zone ? current.zone.name : 'зона не выбрана')+'</span></div>';
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
      if(!list.length){ suggestions.innerHTML = '<div class="locality-empty">Пока такой местности нет в базе. Выберите субъект и ближайшую зону вручную.</div>'; return; }
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
    search.addEventListener('input', debounce(function(){ selected = null; renderSuggestions(searchItems(search.value)); }, 120));
    if(suggestions){
      suggestions.addEventListener('click', function(e){
        const btn = e.target.closest('[data-lp-result]');
        if(!btn) return;
        const item = suggestions.__currentResults[Number(btn.getAttribute('data-lp-result'))];
        selected = item;
        search.value = item.title;
        setManualFromItem(item);
        suggestions.innerHTML = '';
      });
    }
    if(popular){
      popular.addEventListener('click', function(e){
        const btn = e.target.closest('[data-lp-popular-item]');
        if(!btn) return;
        const item = popular.__currentResults[Number(btn.getAttribute('data-lp-popular-item'))];
        selected = item;
        search.value = item.title;
        setManualFromItem(item);
      });
    }
    districtSelect.addEventListener('change', function(){ selected = null; renderSubjects(); });
    subjectSelect.addEventListener('change', function(){ selected = null; renderZones(); });
    zoneSelect.addEventListener('change', function(){ selected = null; renderChoice(); });
    if(openSelected){
      openSelected.addEventListener('click', function(){
        const item = selected || searchItems(search.value)[0] || getManualSelection();
        if(item && item.subject) window.location.href = makeLocationUrl(item.subject, item.zone, item.place);
      });
    }
    if(openManual){
      openManual.addEventListener('click', function(){
        const item = selected || getManualSelection();
        if(item && item.subject) window.location.href = makeLocationUrl(item.subject, item.zone, item.place);
      });
    }
  });

  document.addEventListener('DOMContentLoaded', async function(){
    const root = document.querySelector('[data-region-placeholder]');
    if(!root) return;
    const note = root.querySelector('[data-region-selected-note]');
    if(!note) return;
    const params = new URLSearchParams(window.location.search);
    const zoneId = params.get('zone');
    const place = params.get('place') || '';
    if(!zoneId && !place) return;
    try{
      const data = await loadLocationData(root.getAttribute('data-location-data-url') || '../data/location-data.json');
      const subject = findSubject(data, root.getAttribute('data-subject-id'));
      const zone = findZone(subject, zoneId);
      note.hidden = false;
      note.innerHTML = '<strong>Вы выбрали:</strong> '+escapeHtml(place || (subject ? subject.name : 'регион'))+(zone ? '<span>'+escapeHtml(zone.name)+'</span>' : '');
    }catch(err){}
  });

  function pluralRu(n, one, few, many){
    n = Math.abs(Number(n) || 0) % 100;
    var n1 = n % 10;
    if(n > 10 && n < 20) return many;
    if(n1 === 1) return one;
    if(n1 >= 2 && n1 <= 4) return few;
    return many;
  }
  function initCultureIndex(){
    var root = document.querySelector('[data-culture-index]');
    if(!root) return;
    var search = root.querySelector('[data-culture-search]');
    var category = root.querySelector('[data-culture-category]');
    var count = root.querySelector('[data-culture-count]');
    var cards = Array.prototype.slice.call(root.querySelectorAll('[data-culture-card]'));
    function apply(){
      var q = normalizeText(search && search.value);
      var cat = category && category.value;
      var visible = 0;
      cards.forEach(function(card){
        var hay = normalizeText((card.getAttribute('data-name') || '') + ' ' + (card.getAttribute('data-category') || '') + ' ' + card.textContent);
        var ok = (!q || hay.indexOf(q) !== -1) && (!cat || card.getAttribute('data-category') === cat);
        card.classList.toggle('culture-hidden', !ok);
        if(ok) visible += 1;
      });
      if(count) count.textContent = visible + ' ' + pluralRu(visible, 'культура', 'культуры', 'культур');
    }
    var debouncedApply = debounce(apply, 120);
    if(search) search.addEventListener('input', debouncedApply);
    if(category) category.addEventListener('change', apply);
    apply();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCultureIndex);
  else initCultureIndex();

})();


(function(){
  function normalizeTableText(str){
    return String(str || '').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
  }
  function escapeTableHtml(str){
    return String(str || '').replace(/[&<>"']/g, function(ch){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch];
    });
  }
  function debounce(fn, delay){
    var timer;
    return function(){
      var ctx = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function(){ fn.apply(ctx, args); }, delay);
    };
  }
  var recommendationRank = {'Надежно':0,'Надёжно':0,'Рекомендовано':1,'С укрытием / уходом':2,'Рискованно':3};
  function recommendationOrder(value){
    return Object.prototype.hasOwnProperty.call(recommendationRank, value) ? recommendationRank[value] : 99;
  }
  var monthRank = {'февраль':1,'март':2,'апрель':3,'май':4,'июнь':5,'июль':6,'август':7,'сентябрь':8,'октябрь':9,'ноябрь':10};
  function timingRank(text){
    var s = normalizeTableText(text);
    var best = 99;
    Object.keys(monthRank).forEach(function(month){
      if(s.indexOf(month) !== -1) best = Math.min(best, monthRank[month]);
    });
    return best;
  }
  function isPopularCulture(item){
    return item && (item.popular === true || item.section === 'Популярное');
  }
  function renderCultureTable(root){
    var jsonNode = root.querySelector('[data-culture-json]');
    var singleBody = root.querySelector('[data-culture-body]');
    var sectionBodies = Array.prototype.slice.call(root.querySelectorAll('[data-culture-section-body]'));
    if(!jsonNode || (!singleBody && !sectionBodies.length)) return;
    var items = [];
    try{ items = JSON.parse(jsonNode.textContent || '[]'); }catch(err){ items = []; }

    var search = root.querySelector('[data-filter-search]');
    var rec = root.querySelector('[data-filter-recommendation]');
    var cat = root.querySelector('[data-filter-category]');
    var method = root.querySelector('[data-filter-method]');
    var count = root.querySelector('[data-culture-count]');
    var empty = root.querySelector('[data-culture-empty]');
    var chips = Array.prototype.slice.call(root.querySelectorAll('[data-quick-recommendation]'));
    var itemLabel = root.getAttribute('data-item-label') || 'позиций';

    function pluralizePosition(n){
      var last = n % 10;
      var lastTwo = n % 100;
      if(last === 1 && lastTwo !== 11) return 'позиция';
      if(last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'позиции';
      return 'позиций';
    }
    function formatShown(current, total){
      return 'Показано ' + current + ' ' + pluralizePosition(current) + ' из ' + total;
    }

    function uniqueValues(key){
      var values = [];
      items.forEach(function(item){
        if(item[key] && values.indexOf(item[key]) === -1) values.push(item[key]);
      });
      return values.sort(function(a,b){ return a.localeCompare(b, 'ru'); });
    }
    function fillSelect(select, label, key){
      if(!select) return;
      select.innerHTML = '<option value="">'+label+'</option>' + uniqueValues(key).map(function(value){
        return '<option value="'+escapeTableHtml(value)+'">'+escapeTableHtml(value)+'</option>';
      }).join('');
    }
    function refreshQuickChips(){
      if(!chips.length) return;
      var stats = {};
      items.forEach(function(item){
        var key = item.recommendation || '';
        if(!key) return;
        stats[key] = (stats[key] || 0) + 1;
      });
      chips.forEach(function(chip){
        var value = chip.getAttribute('data-quick-recommendation') || '';
        var n = stats[value] || 0;
        var strong = chip.querySelector('strong');
        if(strong) strong.textContent = n;
        chip.hidden = n === 0;
      });
    }
    function updateQuickState(){
      var current = rec ? rec.value : '';
      chips.forEach(function(chip){
        chip.classList.toggle('is-active', chip.getAttribute('data-quick-recommendation') === current && current !== '');
      });
    }
    function getList(){
      var list = items.slice();
      var query = normalizeTableText(search && search.value);
      var recommendation = (rec && rec.value) || '';
      var category = (cat && cat.value) || '';
      var methodValue = (method && method.value) || '';

      if(query){
        list = list.filter(function(item){
          var varietyText = (item.varieties || []).map(function(variety){
            return [variety.name, variety.type, variety.recommendation, variety.place, variety.timing, variety.note].join(' ');
          }).join(' ');
          return [item.name, item.category, item.note, item.place, item.method, item.timing, item.section, varietyText].some(function(value){
            return normalizeTableText(value).indexOf(query) !== -1;
          });
        });
      }
      if(recommendation) list = list.filter(function(item){ return item.recommendation === recommendation; });
      if(category) list = list.filter(function(item){ return item.category === category; });
      if(methodValue) list = list.filter(function(item){ return item.method === methodValue; });
      list.sort(function(a,b){
        var diff = recommendationOrder(a.recommendation) - recommendationOrder(b.recommendation);
        return diff || a.name.localeCompare(b.name, 'ru');
      });
      return list;
    }
    function normalizeNoteValue(value){
      return String(value || '').replace(/\s+/g, ' ').trim().replace(/[ .;:!?]+$/g, '').toLowerCase();
    }
    function buildVarietyNote(variety){
      var typeText = String(variety.type || '').trim();
      var lead = typeText ? (typeText.charAt(0).toUpperCase() + typeText.slice(1)) : 'Сортовой ориентир для условий зоны';
      if(!/[.!?]$/.test(lead)) lead += '.';
      var parts = [lead];
      if(variety.recommendation === 'С укрытием / уходом') parts.push('Нужны укрытие или более внимательный уход.');
      else if(variety.recommendation === 'Рискованно') parts.push('Результат сильнее зависит от погоды и ухода.');
      else if(variety.recommendation === 'Рекомендовано') parts.push('Лучше показывает себя при обычном стабильном уходе.');
      return parts.join(' ');
    }
    function stripPlaceEcho(note){
      return String(note || '')
        .replace(/\s*Подходит для:\s*[^.!?]+[.!?]?/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }
    function varietyDisplayNote(parentNote, variety){
      var parentNorm = normalizeNoteValue(parentNote);
      var note = stripPlaceEcho(variety.note);
      if(!note) return buildVarietyNote(variety);
      var varietyNorm = normalizeNoteValue(note);
      if(parentNorm && varietyNorm.indexOf(parentNorm) === 0) return buildVarietyNote(variety);
      return note;
    }
    function varietyMatchesQuery(variety, query){
      if(!query) return false;
      return normalizeTableText([variety.name, variety.type, variety.recommendation, variety.place, variety.timing, variety.note].join(' ')).indexOf(query) !== -1;
    }
    function itemHasVarietyMatch(item, query){
      return !!(query && (item.varieties || []).some(function(variety){ return varietyMatchesQuery(variety, query); }));
    }
    function varietyLineHtml(variety, groupId, parentNote, expanded, query){
      var isMatch = varietyMatchesQuery(variety, query);
      return '<tr class="culture-variety-line'+(isMatch ? ' is-search-match' : '')+'" data-variety-group="'+groupId+'"'+(expanded ? '' : ' hidden')+'>'+ 
        '<td data-label="Культура"><span class="culture-variety-name"><b>↳ '+escapeTableHtml(variety.name || '')+'</b><small>'+escapeTableHtml(variety.type || 'сорт / гибрид')+'</small></span></td>'+ 
        '<td data-label="Категория"><span class="category-badge">'+escapeTableHtml(variety.type || 'сорт / гибрид')+'</span></td>'+ 
        '<td data-label="Рекомендация"><span class="rec-badge" data-rec="'+escapeTableHtml(variety.recommendation || '')+'">'+escapeTableHtml(variety.recommendation || '')+'</span></td>'+ 
        '<td data-label="Где лучше"><span class="place-badge">'+escapeTableHtml(variety.place || '')+'</span></td>'+ 
        '<td data-label="Сроки" class="timing-cell">'+escapeTableHtml(variety.timing || '')+'</td>'+ 
        '<td data-label="Комментарий">'+escapeTableHtml(varietyDisplayNote(parentNote, variety))+'</td>'+ 
      '</tr>';
    }
    function varietyCountLabel(count){
      if(!count) return 'варианты';
      var last = count % 10;
      var lastTwo = count % 100;
      var word = (last === 1 && lastTwo !== 11) ? 'вариант' : ((last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) ? 'варианта' : 'вариантов');
      return count + ' ' + word;
    }
    function rowHtml(item, index, scope, query){
      var hasVarieties = item.varieties && item.varieties.length;
      var rowId = 'culture-varieties-' + (scope || 'all') + '-' + index;
      var openBySearch = hasVarieties && itemHasVarietyMatch(item, query);
      var firstCell = hasVarieties
        ? '<button type="button" class="culture-toggle" data-culture-toggle="'+rowId+'" aria-expanded="'+(openBySearch ? 'true' : 'false')+'">'+
            '<span><strong>'+escapeTableHtml(item.name)+'</strong><small>'+escapeTableHtml(item.group || '')+'</small></span>'+ 
            '<em>'+varietyCountLabel(item.varieties.length)+'</em>'+ 
          '</button>'
        : '<span class="culture-name"><strong>'+escapeTableHtml(item.name)+'</strong><small>'+escapeTableHtml(item.group || '')+'</small></span>';
      var addButton = '<button type="button" class="planting-add-btn" data-planting-add data-planting-name="'+escapeTableHtml(item.name)+'" data-planting-category="'+escapeTableHtml(item.category)+'" data-planting-rec="'+escapeTableHtml(item.recommendation)+'" data-planting-place="'+escapeTableHtml(item.place || item.method || '')+'" data-planting-time="'+escapeTableHtml(item.timing || '')+'" data-planting-comment="'+escapeTableHtml(item.note || '')+'">В список</button>';
      var mainRow = '<tr class="culture-main-row" data-culture-main-row>'+ 
        '<td data-label="Культура">'+firstCell+'</td>'+ 
        '<td data-label="Категория"><span class="category-badge">'+escapeTableHtml(item.category)+'</span></td>'+ 
        '<td data-label="Рекомендация"><span class="rec-badge" data-rec="'+escapeTableHtml(item.recommendation)+'">'+escapeTableHtml(item.recommendation)+'</span></td>'+ 
        '<td data-label="Где лучше"><span class="place-badge">'+escapeTableHtml(item.place)+'</span></td>'+ 
        '<td data-label="Сроки" class="timing-cell">'+escapeTableHtml(item.timing || '')+'</td>'+ 
        '<td data-label="Комментарий"><div class="planting-note-action"><span>'+escapeTableHtml(item.note)+'</span>'+addButton+'</div></td>'+ 
      '</tr>';
      if(!hasVarieties) return mainRow;
      return mainRow + item.varieties.map(function(variety){
        return varietyLineHtml(variety, rowId, item.note, openBySearch, query);
      }).join('');
    }
    function bindVarietyToggles(container){
      Array.prototype.slice.call(container.querySelectorAll('[data-culture-toggle]')).forEach(function(button){
        button.addEventListener('click', function(){
          var id = button.getAttribute('data-culture-toggle');
          var rows = id ? Array.prototype.slice.call(container.querySelectorAll('[data-variety-group="'+id+'"]')) : [];
          if(!rows.length) return;
          var open = button.getAttribute('aria-expanded') === 'true';
          button.setAttribute('aria-expanded', open ? 'false' : 'true');
          rows.forEach(function(row){ row.hidden = open; });
        });
      });
    }
    function sectionList(list, key){
      if(key === 'popular') return list.filter(isPopularCulture);
      if(key === 'additional') return list.filter(function(item){ return !isPopularCulture(item); });
      return list;
    }
    function render(){
      var list = getList();
      var query = normalizeTableText(search && search.value);
      if(sectionBodies.length){
        var totalShown = 0;
        sectionBodies.forEach(function(body){
          var key = body.getAttribute('data-culture-section-body') || 'all';
          var rows = sectionList(list, key);
          var totalRows = sectionList(items, key).length;
          var wrap = body.closest('[data-culture-section]');
          body.innerHTML = rows.map(function(item, index){ return rowHtml(item, index, key, query); }).join('');
          bindVarietyToggles(body);
          totalShown += rows.length;
          var sectionCounter = root.querySelector('[data-culture-section-count="'+key+'"]');
          if(sectionCounter) sectionCounter.textContent = formatShown(rows.length, totalRows);
          if(wrap) wrap.hidden = rows.length === 0;
        });
        if(count) count.textContent = formatShown(totalShown, items.length);
        if(empty) empty.hidden = totalShown !== 0;
      }else if(singleBody){
        singleBody.innerHTML = list.map(function(item, index){ return rowHtml(item, index, 'all', query); }).join('');
        bindVarietyToggles(singleBody);
        if(count) count.textContent = formatShown(list.length, items.length);
        if(empty) empty.hidden = list.length !== 0;
      }
      updateQuickState();
      document.dispatchEvent(new CustomEvent('prizh:planting-buttons-rendered'));
    }

    fillSelect(cat, 'Все', 'category');
    fillSelect(method, 'Все', 'method');
    refreshQuickChips();

    var debouncedRender = debounce(render, 120);
    [search, rec, cat, method].forEach(function(control){
      if(!control) return;
      control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', control.tagName === 'INPUT' ? debouncedRender : render);
    });
    chips.forEach(function(chip){
      chip.addEventListener('click', function(){
        var value = chip.getAttribute('data-quick-recommendation');
        if(!rec) return;
        rec.value = rec.value === value ? '' : value;
        render();
      });
    });
    render();
  }
  document.addEventListener('DOMContentLoaded', function(){
    document.querySelectorAll('[data-culture-table]').forEach(renderCultureTable);
  });
})();

/* v130: fallback when image assets are added later or absent in no-assets builds */
(function(){
  function markMissingImage(img){
    img.classList.add('is-missing');
    img.setAttribute('aria-hidden','true');
    var box = img.closest && img.closest('.region-photo-hero,.zone-photo-hero,.brand,.footer-brand');
    if(box) box.classList.add('image-missing');
  }
  function scanMissingImages(){
    Array.prototype.slice.call(document.querySelectorAll('img')).forEach(function(img){
      if(img.complete && img.naturalWidth === 0) markMissingImage(img);
      img.addEventListener('error', function(){ markMissingImage(img); }, {once:true});
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scanMissingImages);
  else scanMissingImages();
})();



/* v149: plant planner with site-condition scoring */
(function(){
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  function norm(v){return String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').replace(/\s+/g,' ').trim();}
  function plural(n,one,few,many){n=Math.abs(Number(n)||0)%100;var n1=n%10;if(n>10&&n<20)return many;if(n1>1&&n1<5)return few;if(n1===1)return one;return many;}
  function opt(v,l){var e=document.createElement('option');e.value=v;e.textContent=l;return e;}
  function setOpts(sel,ph,rows,current){if(!sel)return;sel.innerHTML='';sel.appendChild(opt('',ph));rows.forEach(function(r){sel.appendChild(opt(String(r.value),r.label));});if(current&&Array.prototype.some.call(sel.options,function(o){return o.value===String(current);})){sel.value=String(current);}}
  function debounce(fn,delay){var timer;return function(){var ctx=this,args=arguments;clearTimeout(timer);timer=setTimeout(function(){fn.apply(ctx,args);},delay);};}
  var tierNames=['Подходит хорошо','Можно с уходом','Только при условиях','Лучше заменить'];
  var tierKeys=['good','care','conditions','replace'];
  function includesAny(text,words){for(var i=0;i<words.length;i++){if(text.indexOf(words[i])!==-1)return true;}return false;}
  function initPlantPlanner(root){
    var url=root.getAttribute('data-planner-url')||'data/planner-data.json', subject=root.querySelector('[data-planner-subject]'), zone=root.querySelector('[data-planner-zone]'), guide=root.querySelector('[data-planner-guide]'), category=root.querySelector('[data-planner-category]'), where=root.querySelector('[data-planner-where]'), risk=root.querySelector('[data-planner-risk]'), search=root.querySelector('[data-planner-search]'), popular=root.querySelector('[data-planner-popular]'), apply=root.querySelector('[data-planner-apply]'), reset=root.querySelector('[data-planner-reset]'), start=root.querySelector('[data-planner-start]'), results=root.querySelector('[data-planner-results]'), empty=root.querySelector('[data-planner-empty]'), summary=root.querySelector('[data-planner-summary]'), groups=root.querySelector('[data-planner-result-groups]'), limit=root.querySelector('[data-planner-limit]'), count=root.querySelector('[data-planner-record-count]'), conditions=Array.prototype.slice.call(root.querySelectorAll('[data-planner-condition]')), state=null;
    function decode(data){var strings=data.strings||[], recs=(data.records||[]).map(function(r){var z=data.zones[r[1]]||{}, s=data.subjects[z.s]||{};return {name:strings[r[0]]||'',zoneIndex:r[1],subjectIndex:z.s,guideTypeIndex:r[2],guideType:(data.guideTypes||[])[r[2]]||'',guideName:(data.guideNames||[])[r[2]]||'',category:strings[r[3]]||'',recommendationIndex:r[4],recommendation:(data.recommendations||[])[r[4]]||'',where:strings[r[5]]||'',time:strings[r[6]]||'',comment:strings[r[7]]||'',popular:!!r[8],culturePage:strings[r[9]]||'',subject:s,zone:z};});return {subjects:data.subjects||[],zones:data.zones||[],guideTypes:data.guideTypes||[],guideNames:data.guideNames||[],recommendations:data.recommendations||[],records:recs,recordCount:data.recordCount||recs.length};}
    function unique(rows,fn){var seen={},out=[];rows.forEach(function(row){var v=fn(row);if(v&&!Object.prototype.hasOwnProperty.call(seen,v)){seen[v]=true;out.push({value:v,label:v});}});return out.sort(function(a,b){return a.label.localeCompare(b.label,'ru');});}
    function currentRows(){if(!state)return[];var rows=state.records.slice();if(subject&&subject.value)rows=rows.filter(function(r){return String(r.subjectIndex)===subject.value;});if(zone&&zone.value)rows=rows.filter(function(r){return String(r.zoneIndex)===zone.value;});if(guide&&guide.value)rows=rows.filter(function(r){return String(r.guideTypeIndex)===guide.value;});return rows;}
    function refreshZones(){var si=subject?subject.value:'';var rows=[];if(si!==''){var s=state.subjects[Number(si)];rows=(s&&s.z?s.z:[]).map(function(zi){var z=state.zones[zi]||{};return {value:zi,label:z.n};});}setOpts(zone,si?'Все зоны региона':'Сначала выберите регион',rows,zone?zone.value:'');refreshFilters();}
    function refreshFilters(){var rows=currentRows();setOpts(guide,'Все разделы',state.guideNames.map(function(n,i){return {value:i,label:n};}),guide?guide.value:'');setOpts(category,'Все категории',unique(rows,function(r){return r.category;}),category?category.value:'');setOpts(where,'Все условия',unique(rows,function(r){return r.where;}),where?where.value:'');setOpts(risk,'Любой уровень риска',state.recommendations.map(function(n,i){return {value:i,label:n};}),risk?risk.value:'');}
    function guidePage(r){return r.zone&&r.zone.p?r.zone.p.replace(/\.html$/,'-'+r.guideType+'.html'):'';}
    function selectedConditions(){return conditions.filter(function(ch){return ch.checked;}).map(function(ch){return ch.value;});}
    function rowText(r){return norm([r.name,r.category,r.where,r.time,r.comment,r.subject&&r.subject.n,r.zone&&r.zone.n,r.guideName].join(' '));}
    function scoreRow(r,conds){
      var score=Number(r.recommendationIndex); if(!isFinite(score)) score=3;
      var text=rowText(r), reasons=[];
      conds.forEach(function(c){
        if(c==='greenhouse'){
          if(includesAny(text,['теплиц','укрыт','рассад','томат','огурец','перец','баклажан','дын','арбуз'])){score=Math.max(0,score-1);reasons.push('лучше в теплице');}
        }else if(c==='cover'){
          if(includesAny(text,['укрыт','теплиц','защит','холод','замороз','виноград','персик','абрикос'])){score=Math.max(0,score-1);reasons.push('укрытие снижает риск');}
        }else if(c==='short'){
          if(includesAny(text,['ранн','рассад','корот','север','быстр','зелень','редис','картофель','лук'])){reasons.push('подходит для короткого лета');}
          else {score+=1;reasons.push('лучше ранний сорт');}
        }else if(c==='lowland'){
          if(includesAny(text,['дренаж','застой','сыр','косточк','лаванда','виноград','абрикос','черешн'])){score+=1;reasons.push('не любит застой воды');}
          else reasons.push('лучше на гряде');
        }else if(c==='wet'){
          if(includesAny(text,['сух','засух','лаванда','тимьян','виноград','абрикос','черешн'])){score+=1;reasons.push('не любит постоянную сырость');}
          else if(includesAny(text,['смород','мята','клюк','голубик','капуст'])) reasons.push('терпит влажное место');
          else reasons.push('нужен дренаж');
        }else if(c==='clay'){
          if(includesAny(text,['дренаж','рыхл','песк','лаванда','голубик','абрикос','персик'])){score+=1;reasons.push('лучше на гряде или в контейнере');}
          else reasons.push('помогут компост и мульча');
        }else if(c==='sand'){
          if(includesAny(text,['полив','влаг','капуст','огурец','смород','малина'])){score+=1;reasons.push('нужны полив и мульча');}
          else reasons.push('подходит рыхлая почва');
        }else if(c==='wind'){
          if(includesAny(text,['теплолюб','высок','виноград','перец','баклажан','томат','огурец','арбуз','дын'])){score+=1;reasons.push('нужно защищённое место');}
          else reasons.push('защита от ветра полезна');
        }else if(c==='shade'){
          if(includesAny(text,['томат','перец','баклажан','арбуз','дын','виноград','лаванда','подсолнечник'])){score+=1;reasons.push('нужно больше солнца');}
          else if(includesAny(text,['зелень','щавель','ревень','мята','смород','жимолость'])) reasons.push('подходит для полутени');
          else reasons.push('лучше рассеянный свет');
        }else if(c==='dry'){
          if(includesAny(text,['влаг','полив','огурец','капуст','голубик','клюк','малина'])){score+=1;reasons.push('нужен стабильный полив');}
          else reasons.push('подходит для сухого участка');
        }
      });
      score=Math.max(0,Math.min(3,score));
      if(!reasons.length){
        if(score===0) reasons.push('стабильная рекомендация для выбранной зоны');
        else if(score===1) reasons.push('важны место, сорт и обычный уход');
        else if(score===2) reasons.push('нужны дополнительные условия');
        else reasons.push('лучше подобрать замену');
      }
      return {tier:score,reasons:reasons.filter(function(v,i,a){return a.indexOf(v)===i;}).slice(0,3)};
    }
    function render(){
      if(!state)return; if(start)start.hidden=true;if(results)results.hidden=true;if(empty)empty.hidden=true;if(limit)limit.hidden=true;
      var q=norm(search&&search.value), rows=currentRows(), conds=selectedConditions();
      if(category&&category.value)rows=rows.filter(function(r){return r.category===category.value;});
      if(where&&where.value)rows=rows.filter(function(r){return r.where===where.value;});
      if(risk&&risk.value)rows=rows.filter(function(r){return String(r.recommendationIndex)===risk.value;});
      if(popular&&popular.checked)rows=rows.filter(function(r){return r.popular;});
      if(q)rows=rows.filter(function(r){return rowText(r).indexOf(q)!==-1;});
      rows=rows.map(function(r){var sc=scoreRow(r,conds);var copy={};for(var k in r){copy[k]=r[k];}copy.tier=sc.tier;copy.reasons=sc.reasons;return copy;});
      rows.sort(function(a,b){return (a.tier-b.tier)||(a.recommendationIndex-b.recommendationIndex)||a.name.localeCompare(b.name,'ru');});
      if(!rows.length){if(empty)empty.hidden=false;return;}
      var total=rows.length, shown=rows.slice(0,140), by={};shown.forEach(function(r){(by[r.tier]||(by[r.tier]=[])).push(r);});
      var html=[];tierNames.forEach(function(name,tier){var arr=by[tier]||[];if(!arr.length)return;html.push('<section class="planner-group" data-tier="'+tierKeys[tier]+'"><div class="planner-group-head"><h2>'+esc(name)+'</h2><span>'+arr.length+' '+plural(arr.length,'позиция','позиции','позиций')+'</span></div><div class="planner-result-list">');arr.forEach(function(r){var gp=guidePage(r), culture=r.culturePage?'<a href="'+esc(r.culturePage)+'">'+esc(r.name)+'</a>':esc(r.name);var add='<button type="button" class="planting-add-btn planting-add-btn--planner" data-planting-add data-planting-name="'+esc(r.name)+'" data-planting-category="'+esc(r.category)+'" data-planting-rec="'+esc(r.recommendation)+'" data-planting-place="'+esc(r.where)+'" data-planting-time="'+esc(r.time||'')+'" data-planting-comment="'+esc(r.comment||'')+'" data-planting-source="'+esc(r.subject.n+' · '+r.zone.n+' · '+r.guideName)+'" data-planting-url="'+esc(gp||'planner.html')+'">В список</button>';var reason='<div class="planner-reason">'+r.reasons.map(function(x){return '<span>'+esc(x)+'</span>';}).join('')+'</div>';html.push('<article class="planner-result-card"><div><strong>'+culture+'</strong><small>'+esc(r.subject.n)+' · '+esc(r.zone.n)+' · '+esc(r.guideName)+'</small><div class="planner-badges"><span class="planner-badge">'+esc(r.category)+'</span><span class="planner-badge">'+esc(r.where)+'</span><span class="rec-badge" data-rec="'+esc(r.recommendation)+'">'+esc(r.recommendation)+'</span></div></div><div><p>'+esc(r.comment||r.time)+'</p><small>'+esc(r.time)+'</small>'+reason+'<div class="planner-result-actions">'+(gp?'<a href="'+esc(gp)+'">Открыть справочник зоны</a>':'')+add+'</div></div></article>');});html.push('</div></section>');});
      if(groups)groups.innerHTML='<div class="planner-groups">'+html.join('')+'</div>';
      if(summary)summary.textContent='Найдено '+total+' '+plural(total,'позиция','позиции','позиций')+(conds.length?' с учётом условий участка.':'.');
      if(total>shown.length&&limit){limit.hidden=false;limit.textContent='Показаны первые '+shown.length+' позиций. Уточните регион, зону или условия для более точного списка.';}
      if(results)results.hidden=false;document.dispatchEvent(new CustomEvent('prizh:planting-buttons-rendered'));
    }
    fetch(url).then(function(r){if(!r.ok)throw new Error('planner');return r.json();}).then(function(data){state=decode(data);if(count)count.textContent=String(state.recordCount).replace(/\B(?=(\d{3})+(?!\d))/g,' ');setOpts(subject,'Все регионы',state.subjects.map(function(s,i){return {value:i,label:s.n};}), '');setOpts(zone,'Сначала выберите регион',[], '');refreshFilters();[subject,zone,guide,category,where,risk,popular].forEach(function(el){if(el)el.addEventListener('change',function(){if(el===subject)refreshZones();else refreshFilters();render();});});conditions.forEach(function(ch){ch.addEventListener('change',render);});if(search)search.addEventListener('input',debounce(render,160));if(apply)apply.addEventListener('click',render);if(reset)reset.addEventListener('click',function(){[subject,zone,guide,category,where,risk].forEach(function(el){if(el)el.value='';});conditions.forEach(function(ch){ch.checked=false;});if(search)search.value='';if(popular)popular.checked=true;refreshZones();if(start)start.hidden=false;if(results)results.hidden=true;if(empty)empty.hidden=true;});if(start)start.hidden=false;}).catch(function(){if(start){start.hidden=false;var h=start.querySelector('h2'),p=start.querySelector('p');if(h)h.textContent='Подбор временно недоступен';if(p)p.textContent='Не удалось загрузить данные подбора.';}});
  }
  document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('[data-plant-planner]').forEach(initPlantPlanner);});
})();

/* v148: zone work calendar with personal list and task filters */
(function(){
  var plantingStorageKey='prizhivetsya:planting-list:v1';
  var taskOrder=['посев','рассада','высадка','уход','сбор','подготовка к зиме'];
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  function norm(v){return String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').replace(/\s+/g,' ').trim();}
  function plural(n,one,few,many){n=Math.abs(Number(n)||0)%100;var n1=n%10;if(n>10&&n<20)return many;if(n1>1&&n1<5)return few;if(n1===1)return one;return many;}
  function opt(v,l){var e=document.createElement('option');e.value=v;e.textContent=l;return e;}
  function setOpts(sel,ph,rows,current){if(!sel)return;sel.innerHTML='';sel.appendChild(opt('',ph));rows.forEach(function(r){sel.appendChild(opt(String(r.value),r.label));});if(current&&Array.prototype.some.call(sel.options,function(o){return o.value===String(current);})){sel.value=String(current);}}
  function readPlanting(){try{var a=JSON.parse(localStorage.getItem(plantingStorageKey)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
  function plantingTokens(items){var seen={},out=[];items.forEach(function(item){norm([item.name,item.category,item.place,item.comment,item.sourceTitle].join(' ')).split(' ').forEach(function(tok){if(tok.length<4)return;if(!Object.prototype.hasOwnProperty.call(seen,tok)){seen[tok]=true;out.push(tok);}});});return out;}
  function workMatchesList(work,tokens){if(!tokens.length)return false;var text=norm((work.text||'')+' '+(work.tag||''));return tokens.some(function(tok){return text.indexOf(tok)!==-1;});}
  function taskType(work){var text=norm((work.tag||'')+' '+(work.text||''));if(text.indexOf('рассад')!==-1)return 'рассада';if(/сбор|урожай|собира|снимайт|плодонош/.test(text))return 'сбор';if(/зим|осен|мульч|укрыв|укрыт|побелк|листопад|подготовк|мороз/.test(text))return 'подготовка к зиме';if(/высаж|пересаж|посадк|саженц/.test(text))return 'высадка';if(/сеять|сейте|посев|посейт|сев\b|семен/.test(text))return 'посев';return 'уход';}
  function initZoneCalendar(root){
    var url=root.getAttribute('data-calendar-url')||'data/calendar-data.json', subject=root.querySelector('[data-calendar-subject]'), zone=root.querySelector('[data-calendar-zone]'), month=root.querySelector('[data-calendar-month]'), task=root.querySelector('[data-calendar-task-type]')||root.querySelector('[data-calendar-tag]'), onlyList=root.querySelector('[data-calendar-my-list]'), apply=root.querySelector('[data-calendar-apply]'), printBtn=root.querySelector('[data-calendar-print]'), start=root.querySelector('[data-calendar-start]'), result=root.querySelector('[data-calendar-result]'), empty=root.querySelector('[data-calendar-empty]'), title=root.querySelector('[data-calendar-title]'), summary=root.querySelector('[data-calendar-summary]'), personal=root.querySelector('[data-calendar-personal-note]'), season=root.querySelector('[data-calendar-season]'), risk=root.querySelector('[data-calendar-risk]'), basis=root.querySelector('[data-calendar-basis]'), care=root.querySelector('[data-calendar-care]'), monthsWrap=root.querySelector('[data-calendar-months]'), reset=root.querySelector('[data-calendar-reset]'), state=null;
    function rowsForSubject(si){if(si==='')return[];return state.zones.map(function(z,i){return {z:z,i:i};}).filter(function(x){return String(x.z.s)===String(si);}).map(function(x){return {value:x.i,label:x.z.n};});}
    function cal(){if(!state||!zone||zone.value==='')return null;return state.byZone[String(zone.value)]||null;}
    function taskOptions(c){var present={};(c&&c.months||[]).forEach(function(m){(m.works||[]).forEach(function(w){present[taskType(w)]=true;});});return taskOrder.filter(function(t){return !c||present[t];}).map(function(t){return {value:t,label:t.charAt(0).toUpperCase()+t.slice(1)};});}
    function refreshLists(){var c=cal(), months=[];(c&&c.months||[]).forEach(function(m){if(months.indexOf(m.month)===-1)months.push(m.month);});setOpts(month,'Все месяцы',months.map(function(m){return {value:m,label:m};}),month?month.value:'');setOpts(task,'Все типы работ',taskOptions(c),task?task.value:'');}
    function emptyMessage(heading,text){if(empty){var h=empty.querySelector('h2'),p=empty.querySelector('p');if(h)h.textContent=heading;if(p)p.textContent=text;empty.hidden=false;}}
    function render(){var c=cal();if(start)start.hidden=true;if(result)result.hidden=true;if(empty)empty.hidden=true;if(personal)personal.hidden=true;if(!c){if(start)start.hidden=false;return;}var z=state.zones[Number(c.z)]||{}, s=state.subjects[z.s]||{}, mf=month?month.value:'', tf=task?task.value:'', useList=!!(onlyList&&onlyList.checked), items=useList?readPlanting():[], tokens=plantingTokens(items), cards=[], total=0;if(useList&&!tokens.length){emptyMessage('Список посадок пуст','Добавьте культуры в «Мой список», затем календарь покажет задачи, связанные с ними.');return;}(c.months||[]).forEach(function(m){if(mf&&m.month!==mf)return;var works=(m.works||[]).filter(function(w){if(tf&&taskType(w)!==tf)return false;if(useList&&!workMatchesList(w,tokens))return false;return true;});if(!works.length)return;total+=works.length;cards.push('<article class="calendar-month-card"><div class="calendar-month-head"><h3>'+esc(m.month)+'</h3><span>'+works.length+' '+plural(works.length,'задача','задачи','задач')+'</span></div><ul class="calendar-task-list">'+works.map(function(w){return '<li><span class="calendar-task-tag">'+esc(taskType(w))+'</span><p>'+esc(w.text)+'</p></li>';}).join('')+'</ul></article>');});if(!cards.length){emptyMessage('Нет задач по выбранным условиям',useList?'В календаре зоны нет задач, совпадающих с текущим списком посадок. Отключите фильтр по списку или выберите другой месяц.':'Попробуйте выбрать другой месяц или тип работ.');return;}if(title)title.textContent=s.n+' — '+z.n;if(summary)summary.textContent=z.sum||'Календарь учитывает сезон, риски зоны и практику посадок для участка.';if(personal&&useList){personal.textContent='Показаны задачи, связанные с вашим списком: '+items.length+' '+plural(items.length,'культура','культуры','культур')+', '+total+' '+plural(total,'задача','задачи','задач')+'.';personal.hidden=false;}if(season)season.textContent=c.season||'';if(risk)risk.textContent=c.risk||'';if(basis)basis.textContent=c.basis||'';if(care)care.textContent=c.care||'';if(monthsWrap)monthsWrap.innerHTML=cards.join('');if(result)result.hidden=false;}
    fetch(url).then(function(r){if(!r.ok)throw new Error('calendar');return r.json();}).then(function(data){state={subjects:data.subjects||[],zones:data.zones||[],calendars:data.calendars||[],byZone:{}};state.calendars.forEach(function(c){state.byZone[String(c.z)]=c;});setOpts(subject,'Выберите регион',state.subjects.map(function(s,i){return {value:i,label:s.n};}),'');setOpts(zone,'Сначала выберите регион',[],'');setOpts(month,'Все месяцы',[],'');setOpts(task,'Все типы работ',taskOptions(null),'');var q=new URLSearchParams(window.location.search).get('zone');if(q){var zi=state.zones.findIndex(function(z){return z.id===q;});if(zi>=0){subject.value=String(state.zones[zi].s);setOpts(zone,'Выберите зону',rowsForSubject(subject.value),String(zi));refreshLists();render();}}if(subject)subject.addEventListener('change',function(){setOpts(zone,'Выберите зону',rowsForSubject(subject.value),'');refreshLists();render();});if(zone)zone.addEventListener('change',function(){refreshLists();render();});if(month)month.addEventListener('change',render);if(task)task.addEventListener('change',render);if(onlyList)onlyList.addEventListener('change',render);if(apply)apply.addEventListener('click',render);if(printBtn)printBtn.addEventListener('click',function(){window.print();});if(reset)reset.addEventListener('click',function(){if(subject)subject.value='';setOpts(zone,'Сначала выберите регион',[],'');setOpts(month,'Все месяцы',[],'');setOpts(task,'Все типы работ',taskOptions(null),'');if(onlyList)onlyList.checked=false;if(start)start.hidden=false;if(result)result.hidden=true;if(empty)empty.hidden=true;if(personal)personal.hidden=true;});if(!q&&start)start.hidden=false;}).catch(function(){if(start){start.hidden=false;var h=start.querySelector('h2'),p=start.querySelector('p');if(h)h.textContent='Календарь временно недоступен';if(p)p.textContent='Не удалось загрузить данные календаря.';}});
  }
  document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('[data-zone-calendar]').forEach(initZoneCalendar);});
})();

/* v149: local planting list with notes, place, status and file exports */
(function(){
  var storageKey='prizhivetsya:planting-list:v1';
  var recRank={'Надежно':0,'Надёжно':0,'Рекомендовано':1,'С укрытием / уходом':2,'Рискованно':3,'Проверить по зоне':4};
  var places=['грядка','теплица','сад','клумба','контейнер'];
  var statuses=['планирую','куплено','посеяно','высажено','убрать'];
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  function norm(v){return String(v||'').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();}
  function rank(v){return Object.prototype.hasOwnProperty.call(recRank,v)?recRank[v]:99;}
  function plural(n,one,few,many){n=Math.abs(Number(n)||0)%100;var n1=n%10;if(n>10&&n<20)return many;if(n1>1&&n1<5)return few;if(n1===1)return one;return many;}
  function hash(v){var h=0,s=String(v||'');for(var i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;}return Math.abs(h).toString(36);}
  function rawRead(){try{var a=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
  function write(items){try{if(!Array.isArray(items)||!items.length){localStorage.removeItem(storageKey);return true;}localStorage.setItem(storageKey,JSON.stringify(items));return true;}catch(e){return false;}}
  function pageUrl(){var path=window.location.pathname||'',file=path.split('/').pop()||'index.html',prefix='';if(path.indexOf('/regions/')!==-1)prefix='regions/';else if(path.indexOf('/cultures/')!==-1)prefix='cultures/';return prefix+file+(window.location.search||'');}
  function cleanTitle(){return (document.title||'приживется.ру').replace(/\s+—\s+приживется\.ру$/i,'').replace(/\s+—\s+где выращивать$/i,'').trim();}
  function inferSitePlace(item){var text=norm([item.place,item.category,item.comment,item.sourceTitle].join(' '));if(text.indexOf('теплиц')!==-1)return 'теплица';if(text.indexOf('контейнер')!==-1)return 'контейнер';if(text.indexOf('цвет')!==-1||text.indexOf('декор')!==-1||text.indexOf('клумб')!==-1)return 'клумба';if(text.indexOf('сад')!==-1||text.indexOf('ягод')!==-1||text.indexOf('плодов')!==-1||text.indexOf('дерев')!==-1)return 'сад';return 'грядка';}
  function keyOf(item){return [norm(item.name),norm(item.sourceTitle),norm(item.sourceUrl),norm(item.recommendation),norm(item.place)].join('|');}
  function normalizeItem(item,idx,seen){var changed=false;if(!item.id){item.id='pl_'+hash(keyOf(item)+'|'+idx);changed=true;}if(!Object.prototype.hasOwnProperty.call(item,'userNote')){item.userNote='';changed=true;}if(!item.sitePlace||places.indexOf(item.sitePlace)===-1){item.sitePlace=inferSitePlace(item);changed=true;}if(!item.status||statuses.indexOf(item.status)===-1){item.status='планирую';changed=true;}var id=item.id;if(Object.prototype.hasOwnProperty.call(seen,id)){item.id=id+'_'+idx;changed=true;}seen[item.id]=true;return changed;}
  function read(){var items=rawRead(),changed=false,seen={};items=items.filter(function(item){return item&&item.name;});items.forEach(function(item,idx){if(normalizeItem(item,idx,seen))changed=true;});if(changed)write(items);return items;}
  function payloadFromButton(btn){var item={id:'pl_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7),name:btn.getAttribute('data-planting-name')||'',category:btn.getAttribute('data-planting-category')||'',recommendation:btn.getAttribute('data-planting-rec')||'',place:btn.getAttribute('data-planting-place')||'',timing:btn.getAttribute('data-planting-time')||'',comment:btn.getAttribute('data-planting-comment')||'',sourceTitle:btn.getAttribute('data-planting-source')||cleanTitle(),sourceUrl:btn.getAttribute('data-planting-url')||pageUrl(),userNote:'',status:'планирую',addedAt:new Date().toISOString()};item.sitePlace=inferSitePlace(item);return item;}
  function buttonKey(btn){return keyOf(payloadFromButton(btn));}
  function updateButtons(){var items=read(),keys={};items.forEach(function(item){keys[keyOf(item)]=true;});Array.prototype.slice.call(document.querySelectorAll('[data-planting-add]')).forEach(function(btn){var added=!!keys[buttonKey(btn)],label=added?'В списке':'В список',pressed=added?'true':'false',hint=added?'Убрать из списка посадок':'Добавить в список посадок';btn.classList.toggle('is-added',added);if(btn.textContent!==label)btn.textContent=label;btn.setAttribute('aria-pressed',pressed);btn.setAttribute('title',hint);btn.setAttribute('aria-label',hint);});}
  function toggleItem(btn){var item=payloadFromButton(btn);if(!item.name)return;var items=read(),k=keyOf(item),next=items.filter(function(x){return keyOf(x)!==k;});if(next.length!==items.length){write(next);updateButtons();document.dispatchEvent(new CustomEvent('prizh:planting-list-updated'));return;}items.unshift(item);write(items);updateButtons();document.dispatchEvent(new CustomEvent('prizh:planting-list-updated'));}
  function line(item,i){var note=item.userNote?'\n   Заметка: '+item.userNote:'';return (i+1)+'. '+item.name+' — '+(item.recommendation||'без оценки')+'; место: '+(item.sitePlace||'грядка')+'; статус: '+(item.status||'планирую')+'; '+(item.place||'условия уточняются')+'; '+(item.timing||'сроки уточняются')+'\n   '+(item.sourceTitle||'Справочник')+'\n   '+(item.comment||'')+note;}
  function textExport(items){return items.map(line).join('\n\n');}
  function csvCell(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"';}
  function csvExport(items){var head=['Культура','Категория','Рекомендация','Место посадки','Статус','Где лучше','Сроки','Комментарий','Заметка','Источник','Ссылка'];var rows=items.map(function(item){return [item.name,item.category,item.recommendation,item.sitePlace,item.status,item.place,item.timing,item.comment,item.userNote,item.sourceTitle,item.sourceUrl];});return [head].concat(rows).map(function(row){return row.map(csvCell).join(';');}).join('\n');}
  function download(name,text,type){var blob=new Blob([text],{type:type||'text/plain;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);document.body.removeChild(a);},0);}
  function debounce(fn,delay){var timer;return function(){var ctx=this,args=arguments;clearTimeout(timer);timer=setTimeout(function(){fn.apply(ctx,args);},delay);};}
  function copyText(text){if(navigator.clipboard&&navigator.clipboard.writeText){return navigator.clipboard.writeText(text);}return new Promise(function(resolve,reject){var area=document.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.left='-9999px';document.body.appendChild(area);area.select();try{document.execCommand('copy')?resolve():reject(new Error('copy failed'));}catch(e){reject(e);}finally{document.body.removeChild(area);}});}
  function optionHtml(values,current){return values.map(function(v){return '<option value="'+esc(v)+'"'+(v===current?' selected':'')+'>'+esc(v)+'</option>';}).join('');}
  function initPage(root){var total=root.querySelector('[data-planting-total]'),search=root.querySelector('[data-planting-filter-search]'),rec=root.querySelector('[data-planting-filter-rec]'),cat=root.querySelector('[data-planting-filter-category]'),placeFilter=root.querySelector('[data-planting-filter-place]'),statusFilter=root.querySelector('[data-planting-filter-status]'),empty=root.querySelector('[data-planting-empty]'),results=root.querySelector('[data-planting-results]'),summary=root.querySelector('[data-planting-summary]'),groups=root.querySelector('[data-planting-groups]'),printBtn=root.querySelector('[data-planting-print]'),clearBtn=root.querySelector('[data-planting-clear]'),copyBtn=root.querySelector('[data-planting-copy]'),txtBtn=root.querySelector('[data-planting-download-txt]'),csvBtn=root.querySelector('[data-planting-download-csv]');
    function fillCategories(items){var current=cat?cat.value:'',values=[];items.forEach(function(item){if(item.category&&values.indexOf(item.category)===-1)values.push(item.category);});values.sort(function(a,b){return a.localeCompare(b,'ru');});if(cat){cat.innerHTML='<option value="">Все</option>'+values.map(function(v){return '<option>'+esc(v)+'</option>';}).join('');cat.value=values.indexOf(current)!==-1?current:'';}}
    function filtered(items){var q=norm(search&&search.value),rv=rec&&rec.value,cv=cat&&cat.value,pv=placeFilter&&placeFilter.value,sv=statusFilter&&statusFilter.value;return items.filter(function(item){if(rv&&item.recommendation!==rv)return false;if(cv&&item.category!==cv)return false;if(pv&&item.sitePlace!==pv)return false;if(sv&&item.status!==sv)return false;if(q&&norm([item.name,item.category,item.recommendation,item.place,item.sitePlace,item.status,item.timing,item.comment,item.userNote,item.sourceTitle].join(' ')).indexOf(q)===-1)return false;return true;}).sort(function(a,b){return (rank(a.recommendation)-rank(b.recommendation))||String(a.status||'').localeCompare(String(b.status||''),'ru')||String(a.category||'').localeCompare(String(b.category||''),'ru')||a.name.localeCompare(b.name,'ru')||String(a.sourceTitle||'').localeCompare(String(b.sourceTitle||''),'ru');});}
    function stats(items){var byCat={},byRec={},byPlace={},byStatus={};items.forEach(function(item){var c=item.category||'Разное',r=item.recommendation||'Без оценки',p=item.sitePlace||'грядка',s=item.status||'планирую';byCat[c]=(byCat[c]||0)+1;byRec[r]=(byRec[r]||0)+1;byPlace[p]=(byPlace[p]||0)+1;byStatus[s]=(byStatus[s]||0)+1;});function pills(obj,sorter){return Object.keys(obj).sort(sorter||function(a,b){return a.localeCompare(b,'ru');}).map(function(k){return '<span><strong>'+obj[k]+'</strong> '+esc(k==='Надежно'?'Надёжно':k)+'</span>';}).join('');}return '<div class="planting-summary-cards"><div><h3>По категориям</h3>'+pills(byCat)+'</div><div><h3>По рекомендации</h3>'+pills(byRec,function(a,b){return rank(a)-rank(b)||a.localeCompare(b,'ru');})+'</div><div><h3>По месту</h3>'+pills(byPlace)+'</div><div><h3>По статусу</h3>'+pills(byStatus)+'</div></div>';}
    function card(item){return '<article class="planting-card"><div class="planting-card-main"><h3>'+esc(item.name)+'</h3><div class="planting-card-badges"><span class="rec-badge" data-rec="'+esc(item.recommendation)+'">'+esc(item.recommendation||'Без оценки')+'</span><span class="planner-badge">'+esc(item.category||'Разное')+'</span><span class="planner-badge planting-site-badge">'+esc(item.sitePlace||'грядка')+'</span><span class="planner-badge planting-status-badge">'+esc(item.status||'планирую')+'</span><span class="planner-badge">'+esc(item.place||'Условия уточняются')+'</span></div><p>'+esc(item.comment||item.timing||'Смотрите исходный справочник для уточнения условий.')+'</p><small>'+esc(item.timing||'Сроки уточняются в справочнике.')+'</small><div class="planting-card-controls"><label>Место посадки<select data-planting-place="'+esc(item.id||'')+'">'+optionHtml(places,item.sitePlace||'грядка')+'</select></label><label>Статус<select data-planting-status="'+esc(item.id||'')+'">'+optionHtml(statuses,item.status||'планирую')+'</select></label></div><label class="planting-note-field">Личная заметка<textarea data-planting-note="'+esc(item.id||'')+'" placeholder="Сорт, грядка, количество, задача">'+esc(item.userNote||'')+'</textarea></label></div><div class="planting-card-side"><a href="'+esc(item.sourceUrl||'#')+'">Открыть источник</a><span>'+esc(item.sourceTitle||'Справочник')+'</span><button type="button" class="planting-remove-btn" data-planting-remove="'+esc(item.id||'')+'">Убрать</button></div></article>';}
    function render(){var items=read();fillCategories(items);var list=filtered(items);if(total)total.textContent=String(items.length);if(!items.length){if(summary)summary.innerHTML='';if(groups)groups.innerHTML='';if(empty)empty.hidden=false;if(results)results.hidden=true;return;}if(empty)empty.hidden=true;if(results)results.hidden=false;if(summary)summary.innerHTML='<p>Показано '+list.length+' '+plural(list.length,'позиция','позиции','позиций')+' из '+items.length+'.</p>'+stats(list);var byRec={};list.forEach(function(item){var k=item.recommendation||'Без оценки';(byRec[k]||(byRec[k]=[])).push(item);});var order=['Надёжно','Надежно','Рекомендовано','С укрытием / уходом','Рискованно','Проверить по зоне','Без оценки'],html=[];order.forEach(function(k){var arr=byRec[k]||[];if(!arr.length)return;var byCat={};arr.forEach(function(item){var c=item.category||'Разное';(byCat[c]||(byCat[c]=[])).push(item);});html.push('<section class="planting-group"><div class="planting-group-head"><h2>'+esc(k==='Надежно'?'Надёжно':k)+'</h2><span>'+arr.length+' '+plural(arr.length,'позиция','позиции','позиций')+'</span></div><div class="planting-category-list">');Object.keys(byCat).sort(function(a,b){return a.localeCompare(b,'ru');}).forEach(function(c){html.push('<section class="planting-category-block"><h3>'+esc(c)+'</h3><div class="planting-card-list">'+byCat[c].map(card).join('')+'</div></section>');});html.push('</div></section>');});if(groups)groups.innerHTML=html.join('')||'<section class="planting-empty"><h2>Ничего не найдено</h2><p>Попробуйте изменить поиск или фильтры.</p></section>';}
    var debouncedRender=debounce(render,140);[search].forEach(function(el){if(el)el.addEventListener('input',debouncedRender);});[rec,cat,placeFilter,statusFilter].forEach(function(el){if(el)el.addEventListener('change',render);});
    if(clearBtn)clearBtn.addEventListener('click',function(){if(!read().length)return;if(confirm('Очистить весь список посадок?')){write([]);if(search)search.value='';if(rec)rec.value='';if(cat)cat.value='';if(placeFilter)placeFilter.value='';if(statusFilter)statusFilter.value='';render();updateButtons();document.dispatchEvent(new CustomEvent('prizh:planting-list-updated'));}});
    if(printBtn)printBtn.addEventListener('click',function(){window.print();});
    if(copyBtn)copyBtn.addEventListener('click',function(){var text=textExport(filtered(read()));if(!text)return;copyText(text).then(function(){copyBtn.textContent='Скопировано';setTimeout(function(){copyBtn.textContent='Скопировать текст';},1600);}).catch(function(){copyBtn.textContent='Не удалось скопировать';setTimeout(function(){copyBtn.textContent='Скопировать текст';},1800);});});
    if(txtBtn)txtBtn.addEventListener('click',function(){var text=textExport(filtered(read()));if(text)download('prizhivetsya-planting-list.txt',text,'text/plain;charset=utf-8');});
    if(csvBtn)csvBtn.addEventListener('click',function(){var text=csvExport(filtered(read()));if(text)download('prizhivetsya-planting-list.csv',text,'text/csv;charset=utf-8');});
    root.addEventListener('input',debounce(function(e){var field=e.target.closest('[data-planting-note]');if(!field)return;var id=field.getAttribute('data-planting-note'),items=read(),changed=false;items.forEach(function(item){if(item.id===id){item.userNote=field.value;changed=true;}});if(changed)write(items);},180));
    root.addEventListener('change',function(e){var field=e.target.closest('[data-planting-place],[data-planting-status]');if(!field)return;var id=field.getAttribute('data-planting-place')||field.getAttribute('data-planting-status'),items=read(),changed=false;items.forEach(function(item){if(item.id===id){if(field.hasAttribute('data-planting-place'))item.sitePlace=field.value;if(field.hasAttribute('data-planting-status'))item.status=field.value;changed=true;}});if(changed){write(items);render();document.dispatchEvent(new CustomEvent('prizh:planting-list-updated'));}});
    root.addEventListener('click',function(e){var btn=e.target.closest('[data-planting-remove]');if(!btn)return;e.preventDefault();var id=btn.getAttribute('data-planting-remove'),all=read(),target=null;all.forEach(function(item){if(item.id===id)target=item;});var targetKey=target?keyOf(target):'';var items=all.filter(function(item){return item.id!==id&&(!targetKey||keyOf(item)!==targetKey);});write(items);render();updateButtons();document.dispatchEvent(new CustomEvent('prizh:planting-list-updated'));});
    document.addEventListener('prizh:planting-list-updated',render);render();
  }
  document.addEventListener('click',function(e){var btn=e.target.closest('[data-planting-add]');if(!btn)return;e.preventDefault();toggleItem(btn);});
  document.addEventListener('DOMContentLoaded',function(){updateButtons();Array.prototype.slice.call(document.querySelectorAll('[data-planting-list-page]')).forEach(initPage);});
  document.addEventListener('prizh:planting-buttons-rendered',updateButtons);
})();


/* v150: smart-route enhancements without global re-render handlers */
(function(){
  function q(sel,root){return (root||document).querySelector(sel);}
  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function norm(v){return String(v||'').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();}
  function setSelectByText(sel, needle){if(!sel||!needle)return false;var n=norm(needle), hit=null;qa('option',sel).some(function(o){if(norm(o.textContent).indexOf(n)!==-1){hit=o;return true;}return false;});if(hit){sel.value=hit.value;sel.dispatchEvent(new Event('change',{bubbles:true}));return true;}return false;}
  function clickApply(root){var btn=q('[data-planner-apply]',root);if(btn)btn.click();}
  function setupPlanner(){var root=q('[data-plant-planner]');if(!root)return;var search=q('[data-planner-search]',root), risk=q('[data-planner-risk]',root), category=q('[data-planner-category]',root), popular=q('[data-planner-popular]',root), add=q('[data-planner-add-good]',root);qa('[data-planner-preset]',root).forEach(function(btn){btn.addEventListener('click',function(){var was=btn.classList.contains('is-active');qa('[data-planner-preset]',root).forEach(function(b){b.classList.remove('is-active');b.setAttribute('aria-pressed','false');});if(was){if(search){search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));}clickApply(root);return;}btn.classList.add('is-active');btn.setAttribute('aria-pressed','true');var p=btn.getAttribute('data-planner-preset');if(search)search.value='';if(category)category.value='';if(risk)risk.value='';if(popular)popular.checked=true;if(p==='newbie'){setSelectByText(risk,'Рекомендовано')||setSelectByText(risk,'Надёжно');if(search)search.value='ранн';}
else if(p==='no-greenhouse'){if(search)search.value='открытый грунт';}
else if(p==='small'){if(search)search.value='контейнер';}
else if(p==='low-care'){setSelectByText(risk,'Надёжно');}
else if(p==='decor'){setSelectByText(category,'Цвет')||setSelectByText(category,'Декор');}
else if(p==='edible'){if(search)search.value='овощи ягоды плодовые';}
if(search)search.dispatchEvent(new Event('input',{bubbles:true}));clickApply(root);});});if(add){add.addEventListener('click',function(){var buttons=qa('.planner-group[data-tier="good"] [data-planting-add],.planner-group[data-tier="care"] [data-planting-add]',root).filter(function(b){return !b.classList.contains('is-added');}).slice(0,30);buttons.forEach(function(b){b.click();});add.textContent=buttons.length?'Добавлено: '+buttons.length:'Уже в списке';setTimeout(function(){add.textContent='Добавить подходящие в мой список';},1600);});}}
  function readList(){try{var a=JSON.parse(localStorage.getItem('prizhivetsya:planting-list:v1')||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
  function season(item){var t=norm([item.timing,item.comment,item.userNote,item.status].join(' '));if(/март|апрел|май|весн|рассад|посев/.test(t))return 'весна';if(/июн|июл|август|лет|полив|сбор/.test(t))return 'лето';if(/сент|окт|ноябр|осен|зим|укрыт/.test(t))return 'осень';if(/декабр|январ|феврал/.test(t))return 'зима';return 'срок уточнить';}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  function renderPlantingNearest(){var root=q('[data-planting-list-page]'), box=q('[data-planting-nearest]');if(!root||!box)return;var items=readList().filter(function(i){return (i.status||'планирую')!=='убрать';}).slice(0,6);if(!items.length){box.hidden=true;box.innerHTML='';return;}box.hidden=false;box.innerHTML='<div class="planting-nearest-head"><div><span class="kicker">Ближайший план</span><h2>Что держать под рукой</h2></div><a href="calendar.html">Сверить календарь</a></div><div class="planting-nearest-grid">'+items.map(function(i){return '<article><strong>'+esc(i.name)+'</strong><span>'+esc(season(i))+' · '+esc(i.sitePlace||'грядка')+' · '+esc(i.status||'планирую')+'</span><p>'+esc(i.timing||i.comment||'Уточните срок в справочнике зоны.')+'</p></article>';}).join('')+'</div>';}
  function setupPlantingNearest(){var root=q('[data-planting-list-page]');if(!root)return;renderPlantingNearest();document.addEventListener('prizh:planting-list-updated',function(){setTimeout(renderPlantingNearest,80);});root.addEventListener('input',function(){setTimeout(renderPlantingNearest,220);});root.addEventListener('change',function(){setTimeout(renderPlantingNearest,120);});}
  function renderCalendarNext(){var box=q('[data-calendar-next]'), root=q('[data-zone-calendar]');if(!box||!root)return;var tasks=qa('.calendar-month-card',root).reduce(function(out,card){var month=(q('.calendar-month-head h3',card)||{}).textContent||'';qa('.calendar-task-list li',card).forEach(function(li){out.push({month:month,type:(q('.calendar-task-tag',li)||{}).textContent||'',text:(q('p',li)||{}).textContent||''});});return out;},[]).slice(0,6);if(!tasks.length){box.hidden=true;box.innerHTML='';return;}box.hidden=false;box.innerHTML='<div class="calendar-next-head"><div><span class="kicker">Ближайшие работы</span><h2>С чего начать в выбранной зоне</h2></div><a href="planting-list.html">Открыть мой список</a></div><div class="calendar-next-grid">'+tasks.map(function(t){return '<article><strong>'+esc(t.month)+'</strong><span>'+esc(t.type)+'</span><p>'+esc(t.text)+'</p></article>';}).join('')+'</div>';}
  function setupCalendarNext(){var root=q('[data-zone-calendar]');if(!root)return;['click','change'].forEach(function(ev){root.addEventListener(ev,function(){setTimeout(renderCalendarNext,180);});});setTimeout(renderCalendarNext,500);}
  document.addEventListener('DOMContentLoaded',function(){setupPlanner();setupPlantingNearest();setupCalendarNext();});
})();

/* v152: season plan, conditions guide and culture comparison */
(function(){
 var KEY='prizhivetsya:planting-list:v1';
 function q(s,r){return (r||document).querySelector(s)} function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]})}
 function read(){try{var a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a:[]}catch(e){return []}}
 function plural(n,one,few,many){n=Math.abs(Number(n)||0)%100;var n1=n%10;if(n>10&&n<20)return many;if(n1>1&&n1<5)return few;if(n1===1)return one;return many}
 function norm(v){return String(v||'').toLowerCase().replace(/ё/g,'е')}
 function season(item){var t=norm([item.timing,item.comment,item.userNote,item.status,item.sourceTitle].join(' '));if(/феврал|март|апрел|май|рассад|посев|высад/.test(t))return 'Весна';if(/июн|июл|август|полив|мульч|сбор|уход/.test(t))return 'Лето';if(/сент|окт|ноябр|укрыт|зим|убор|подготов/.test(t))return 'Осень';if(/декабр|январ/.test(t))return 'Зима';return 'Срок уточнить'}
 function countBy(items,fn){var o={};items.forEach(function(x){var k=fn(x)||'не указано';o[k]=(o[k]||0)+1});return o}
 function chips(obj){return Object.keys(obj).sort(function(a,b){return obj[b]-obj[a]||a.localeCompare(b,'ru')}).map(function(k){return '<span><strong>'+obj[k]+'</strong> '+esc(k)+'</span>'}).join('')}
 function textPlan(items){var lines=['План сезона — приживется.ру',''];items.forEach(function(i,idx){lines.push((idx+1)+'. '+(i.name||'Культура'));lines.push('   Категория: '+(i.category||''));lines.push('   Рекомендация: '+(i.recommendation||''));lines.push('   Место: '+(i.sitePlace||i.place||'не указано'));lines.push('   Статус: '+(i.status||'планирую'));lines.push('   Сроки: '+(i.timing||'уточнить в календаре'));if(i.userNote)lines.push('   Заметка: '+i.userNote);lines.push('')});return lines.join('\n')}
 function copyText(t){if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(t);var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();return Promise.resolve()}
 function initSeasonPlan(){
  var root=q('[data-season-plan-page]');
  if(!root)return;
  var total=q('[data-season-total]',root),
      empty=q('[data-season-empty]',root),
      results=q('[data-season-results]',root),
      summary=q('[data-season-summary]',root),
      focus=q('[data-season-focus]',root),
      checklist=q('[data-season-checklist]',root),
      groups=q('[data-season-groups]',root),
      filterEmpty=q('[data-season-filter-empty]',root),
      copy=q('[data-season-copy]',root),
      print=q('[data-season-print]',root),
      seasonSel=q('[data-season-filter]',root),
      placeSel=q('[data-season-place-filter]',root),
      statusSel=q('[data-season-status-filter]',root),
      reset=q('[data-season-reset]',root);
  var currentItems=[];
  function uniqueVals(items,fn){
    var seen={},out=[];
    items.forEach(function(item){
      var v=fn(item);
      if(!v)return;
      v=String(v);
      if(!seen[v]){seen[v]=true;out.push(v);}
    });
    return out.sort(function(a,b){return a.localeCompare(b,'ru');});
  }
  function fillSelect(sel,placeholder,vals){
    if(!sel)return;
    var old=sel.value;
    sel.innerHTML='<option value="">'+esc(placeholder)+'</option>'+vals.map(function(v){return '<option value="'+esc(v)+'">'+esc(v)+'</option>';}).join('');
    if(old && vals.indexOf(old)!==-1)sel.value=old;
  }
  function selected(sel){return sel?sel.value:'';}
  function applyFilters(items){
    var sf=selected(seasonSel), pf=selected(placeSel), stf=selected(statusSel);
    return items.filter(function(i){
      var itemSeason=season(i), itemPlace=i.sitePlace||i.place||'', itemStatus=i.status||'планирую';
      if(sf && itemSeason!==sf)return false;
      if(pf && itemPlace!==pf)return false;
      if(stf && itemStatus!==stf)return false;
      return true;
    });
  }
  function renderChecklist(items){
    if(!checklist)return;
    var noPlace=items.filter(function(i){return !(i.sitePlace||i.place);});
    var risky=items.filter(function(i){return /риск|укрыт|уход/i.test(i.recommendation||'');});
    var greenhouse=items.filter(function(i){return /теплиц/i.test([i.sitePlace,i.place,i.where,i.comment,i.timing].join(' '));});
    var activeStatuses=countBy(items,function(i){return i.status||'планирую'});
    function card(title,count,text,good){
      return '<article class="'+(good?'is-good':'')+'"><strong>'+esc(title)+'</strong><b>'+count+'</b><p>'+esc(text)+'</p></article>';
    }
    checklist.innerHTML='<span class="kicker">Готовность плана</span><h2>Что проверить перед поездкой на участок</h2><div class="season-checklist-grid">'+
      card('Место не указано',noPlace.length,noPlace.length?'Уточните грядку, теплицу, сад, клумбу или контейнер.':'У всех позиций есть место посадки.',!noPlace.length)+
      card('Требуют внимания',risky.length,risky.length?'Сверьте укрытие, микроклимат, полив и сроки.':'В плане нет явных рискованных позиций.',!risky.length)+
      card('Тепличные позиции',greenhouse.length,greenhouse.length?'Проверьте проветривание, подвязку и график полива.':'Теплица не перегружена по сохранённым данным.',greenhouse.length===0)+
      card('Статусы',Object.keys(activeStatuses).length,'Обновляйте статусы после закупки, посева и высадки.',Object.keys(activeStatuses).length>1)+
    '</div>';
  }
  function render(){
    var items=read();
    var activeAll=items.filter(function(i){return (i.status||'планирую')!=='убрать'});
    if(total)total.textContent=activeAll.length;
    fillSelect(seasonSel,'Все сезоны',uniqueVals(activeAll,function(i){return season(i);}));
    fillSelect(placeSel,'Все места',uniqueVals(activeAll,function(i){return i.sitePlace||i.place||'';}));
    fillSelect(statusSel,'Все статусы',uniqueVals(activeAll,function(i){return i.status||'планирую';}));
    if(!activeAll.length){
      currentItems=[];
      if(empty)empty.hidden=false;
      if(results)results.hidden=true;
      return;
    }
    if(empty)empty.hidden=true;
    if(results)results.hidden=false;
    var active=applyFilters(activeAll);
    currentItems=active;
    var byPlace=countBy(active,function(i){return i.sitePlace||i.place||'место не указано'}),
        byStatus=countBy(active,function(i){return i.status||'планирую'}),
        bySeason=countBy(active,season),
        risky=active.filter(function(i){return /риск|укрыт|уход/i.test(i.recommendation||'');});
    if(summary)summary.innerHTML='<article><strong>'+active.length+'</strong><span>'+plural(active.length,'культура','культуры','культур')+'</span><p>'+(active.length===activeAll.length?'Показан весь активный план.':'Показана часть плана по выбранным фильтрам.')+'</p></article><article><strong>'+Object.keys(byPlace).length+'</strong><span>места посадки</span><p>'+chips(byPlace)+'</p></article><article><strong>'+Object.keys(byStatus).length+'</strong><span>статусы</span><p>'+chips(byStatus)+'</p></article><article><strong>'+risky.length+'</strong><span>требуют внимания</span><p>Проверьте укрытие, теплицу, полив и микроклимат.</p></article>';
    if(focus)focus.innerHTML='<article><h2>Ближайшие действия</h2><p>'+(active.length?'Начните с культур со статусом «планирую» и тех, где не указано место посадки.':'По текущим фильтрам позиций нет.')+'</p></article><article><h2>Что проверить по календарю</h2><p>'+(active.length?chips(bySeason):'Сбросьте фильтры или добавьте культуры в список.')+'</p></article><article><h2>Где нужна осторожность</h2><p>'+(risky.slice(0,5).map(function(i){return esc(i.name)}).join(', ')||'Явных рискованных позиций нет.')+'</p></article>';
    renderChecklist(activeAll);
    if(filterEmpty)filterEmpty.hidden=!!active.length;
    var order=['Весна','Лето','Осень','Зима','Срок уточнить'],buckets={};
    active.forEach(function(i){var s=season(i);(buckets[s]||(buckets[s]=[])).push(i)});
    if(groups)groups.innerHTML=order.filter(function(k){return buckets[k]&&buckets[k].length}).map(function(k){return '<section class="season-group"><div class="season-group-head"><h2>'+esc(k)+'</h2><span>'+buckets[k].length+' '+plural(buckets[k].length,'позиция','позиции','позиций')+'</span></div><div class="season-card-list">'+buckets[k].map(function(i){return '<article class="season-card"><h3>'+esc(i.name)+'</h3><p>'+esc(i.comment||i.timing||'Срок уточняется в календаре зоны.')+'</p><small>'+esc(i.category||'')+' · '+esc(i.recommendation||'')+' · '+esc(i.sitePlace||i.place||'место не указано')+' · '+esc(i.status||'планирую')+'</small>'+(i.userNote?'<small>Заметка: '+esc(i.userNote)+'</small>':'')+'</article>'}).join('')+'</div></section>'}).join('');
  }
  [seasonSel,placeSel,statusSel].forEach(function(sel){if(sel)sel.addEventListener('change',render);});
  if(reset)reset.addEventListener('click',function(){[seasonSel,placeSel,statusSel].forEach(function(sel){if(sel)sel.value='';});render();});
  if(copy)copy.addEventListener('click',function(){copyText(textPlan(currentItems)).then(function(){copy.textContent='Скопировано';setTimeout(function(){copy.textContent='Скопировать план'},1400)})});
  if(print)print.addEventListener('click',function(){window.print()});
  document.addEventListener('prizh:planting-list-updated',render);
  render();
} var conditionTexts={clay:['Глина требует воздуха и дренажа. Начните с высоких гряд, компоста и культур, которые терпят плотную почву после подготовки.','Капуста, смородина, мята, астильба, флоксы.'],sand:['Песок быстро высыхает. Нужны органика, мульча и регулярный полив, особенно для капусты и молодых плодовых.','Морковь, лук, тимьян, шалфей, картофель при поливе.'],lowland:['В низине холоднее и влажнее. Лучше поднятые гряды, дренаж и культуры, которым не страшна сырость.','Смородина, калина, мята, дербенник, сибирские ирисы.'],wind:['Ветер сушит и охлаждает. Нужны кулисы, сетка, подвязка и мульча.','Лук, картофель, смородина, дерен, спирея.'],shade:['В тени меньше урожай плодовых овощей. Ставку лучше делать на зелень, ягодники при рассеянном свете и декоративные многолетники.','Укроп, петрушка, щавель, ревень, хоста, астильба.'],wet:['Влажное место требует дренажа и проветривания. Не сажайте культуры, которые выпревают у корневой шейки.','Калина, смородина, мята, дербенник, влаголюбивые ирисы.'],dry:['Сухой участок просит мульчи, капельного полива и засухоустойчивых культур.','Тимьян, шалфей, лаванда в тёплой зоне, лук, облепиха.'],short:['Короткое лето требует ранних сортов, рассады и теплицы для теплолюбивых культур.','Редис, зелень, ранний картофель, жимолость, томат через рассаду.'],greenhouse:['Теплица расширяет выбор, но требует проветривания и контроля влажности.','Томат, перец, баклажан, огурец, базилик.'],cover:['Готовность укрывать снижает риск для винограда, теплолюбивых плодовых и капризных многолетников.','Виноград укрывной, розы, часть косточковых и теплолюбивые овощи.']};
 function initConditions(){var root=q('[data-condition-guide]');if(!root)return;var out=q('[data-condition-result]',root);function render(){var vals=qa('input[type="checkbox"]:checked',root).map(function(i){return i.value});if(!vals.length){out.innerHTML='<div class="condition-result-card"><strong>Выберите условия участка</strong><p>После выбора появится короткая сводка и ссылка в подбор с отмеченными условиями.</p></div>';return}var qs=vals.map(function(v){return 'condition='+encodeURIComponent(v)}).join('&');out.innerHTML='<div class="condition-result-card"><strong>Сводка по участку</strong><ul>'+vals.map(function(v){var t=conditionTexts[v]||['Условие нужно проверить в подборе.',''];return '<li><b>'+esc((q('input[value="'+v+'"]',root).parentNode.textContent||'').trim())+':</b> '+esc(t[0])+' <em>'+esc(t[1])+'</em></li>'}).join('')+'</ul><p><a class="btn primary" href="planner.html?'+qs+'">Открыть подбор с этими условиями</a></p></div>'}root.addEventListener('change',render);render()}
 function initPlannerParams(){var root=q('[data-plant-planner]');if(!root)return;var params=new URLSearchParams(location.search),vals=params.getAll('condition');if(!vals.length)return;setTimeout(function(){vals.forEach(function(v){var cb=q('[data-planner-condition][value="'+v.replace(/[^a-z-]/g,'')+'"]',root);if(cb)cb.checked=true});var apply=q('[data-planner-apply]',root);if(apply)apply.click()},450)}
 function initCultureCompare(){var root=q('[data-culture-compare]');if(!root)return;var cards=qa('[data-culture-card]').map(function(a){return {name:a.getAttribute('data-name')||a.textContent.trim(),cat:a.getAttribute('data-category')||'',href:a.getAttribute('href')||'',desc:(q('p',a)||{}).textContent||'',stat:(q('small',a)||{}).textContent||''}});var selects=qa('[data-compare-select]',root),result=q('[data-compare-result]',root);selects.forEach(function(sel){cards.forEach(function(c,i){var o=document.createElement('option');o.value=String(i);o.textContent=c.name;sel.appendChild(o)});sel.addEventListener('change',render)});function render(){var chosen=selects.map(function(s){return s.value}).filter(function(v,i,a){return v!==''&&a.indexOf(v)===i}).map(function(v){return cards[Number(v)]});if(!chosen.length){result.innerHTML='<p>Выберите культуры для сравнения.</p>';return}result.innerHTML='<table class="culture-compare-table"><thead><tr><th>Культура</th><th>Категория</th><th>Описание</th><th>Охват по зонам</th></tr></thead><tbody>'+chosen.map(function(c){return '<tr><td><a href="'+esc(c.href)+'">'+esc(c.name)+'</a></td><td>'+esc(c.cat)+'</td><td>'+esc(c.desc)+'</td><td>'+esc(c.stat)+'</td></tr>'}).join('')+'</tbody></table>'}render()}
 document.addEventListener('DOMContentLoaded',function(){initSeasonPlan();initConditions();initPlannerParams();initCultureCompare()})
})();

/* v155: plan map, shopping list, planner warnings and calendar export */
(function(){
  var KEY='prizhivetsya:planting-list:v1';
  function q(s,r){return (r||document).querySelector(s);}
  function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  function norm(v){return String(v||'').toLowerCase().replace(/ё/g,'е');}
  function readList(){try{var a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
  function active(items){return items.filter(function(i){return (i.status||'планирую')!=='убрать';});}
  function season(item){var t=norm([item.timing,item.comment,item.userNote,item.sourceTitle].join(' '));if(/феврал|март|апрел|май|рассад|посев|высад/.test(t))return 'Весна';if(/июн|июл|август|полив|мульч|сбор|уход/.test(t))return 'Лето';if(/сент|окт|ноябр|укрыт|зим|убор|подготов/.test(t))return 'Осень';if(/декабр|январ/.test(t))return 'Зима';return 'Срок уточнить';}
  function by(items,fn){var o={};items.forEach(function(i){var k=fn(i)||'не указано';(o[k]||(o[k]=[])).push(i);});return o;}
  function plural(n,one,few,many){n=Math.abs(Number(n)||0)%100;var n1=n%10;if(n>10&&n<20)return many;if(n1>1&&n1<5)return few;if(n1===1)return one;return many;}
  function placeOf(i){return i.sitePlace||i.place||'место не указано';}
  function material(i){var t=norm([i.name,i.category,i.place,i.comment,i.timing].join(' '));if(/яблон|груш|слив|вишн|череш|абрикос|персик|орех|фундук|виноград|смород|крыжов|малина|жимол|голубик|облепих|калина|ирга|сажен/.test(t))return 'саженцы';if(/картоф|лук|чеснок|клубник|земляник/.test(t))return 'посадочный материал';if(/цвет|декор|лаванд|гортенз|роза|хоста|астильб|флокс|монард|ирис/.test(t))return 'семена или рассада';return 'семена или рассада';}
  function copyText(t){if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(t);var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();return Promise.resolve();}
  function download(name,text){var blob=new Blob([text],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},800);}
  function filteredPlanItems(root,items){
    var sf=(q('[data-season-filter]',root)||{}).value||'', pf=(q('[data-season-place-filter]',root)||{}).value||'', stf=(q('[data-season-status-filter]',root)||{}).value||'';
    return items.filter(function(i){if(sf&&season(i)!==sf)return false;if(pf&&placeOf(i)!==pf)return false;if(stf&&(i.status||'планирую')!==stf)return false;return true;});
  }
  function renderSeasonTools(){
    var root=q('[data-season-plan-page]'); if(!root)return;
    var map=q('[data-season-map]',root), shop=q('[data-season-shopping]',root), warn=q('[data-season-warnings]',root);
    var items=filteredPlanItems(root,active(readList()));
    if(!items.length){[map,shop,warn].forEach(function(x){if(x)x.innerHTML='';});return;}
    if(warn){
      var noPlace=items.filter(function(i){return !i.sitePlace&&!i.place;}), noNote=items.filter(function(i){return !i.userNote;}), risky=items.filter(function(i){return /риск|укрыт|уход/i.test(i.recommendation||'');}), toRemove=readList().filter(function(i){return (i.status||'')==='убрать';});
      warn.innerHTML='<span class="kicker">Проверка плана</span><h2>Слабые места перед закупкой</h2><div class="season-warning-grid">'+
      '<article class="'+(noPlace.length?'is-alert':'is-good')+'"><strong>'+noPlace.length+' '+plural(noPlace.length,'позиция','позиции','позиций')+'</strong><p>'+(noPlace.length?'Не указано место посадки. Распределите их по грядке, теплице, саду, клумбе или контейнеру.':'У показанных культур указано место посадки.')+'</p></article>'+
      '<article class="'+(risky.length?'is-alert':'is-good')+'"><strong>'+risky.length+' '+plural(risky.length,'риск','риска','рисков')+'</strong><p>'+(risky.length?'Проверьте укрытие, микроклимат, полив и сроки для осторожных рекомендаций.':'В текущем виде нет явных рискованных позиций.')+'</p></article>'+
      '<article><strong>'+noNote.length+' без заметки</strong><p>Заметки помогают не забыть сорт, количество, номер грядки и покупку.</p></article>'+
      '<article><strong>'+toRemove.length+' к удалению</strong><p>'+(toRemove.length?'Очистите позиции со статусом «убрать», чтобы они не мешали планированию.':'В списке нет позиций со статусом «убрать».')+'</p></article></div>';
    }
    if(map){
      var groups=by(items,placeOf), names=Object.keys(groups).sort(function(a,b){return groups[b].length-groups[a].length||a.localeCompare(b,'ru');});
      map.innerHTML='<span class="kicker">Карта посадок</span><h2>План по местам участка</h2><div class="season-map-grid">'+names.map(function(k){var arr=groups[k];return '<article><strong>'+esc(k)+' · '+arr.length+'</strong><p>'+arr.slice(0,5).map(function(i){return esc(i.name);}).join(', ')+(arr.length>5?' и ещё '+(arr.length-5):'')+'</p><ul class="season-map-list">'+arr.slice(0,4).map(function(i){return '<li>'+esc(i.name)+' — '+esc(i.status||'планирую')+'</li>';}).join('')+'</ul></article>';}).join('')+'</div>';
    }
    if(shop){
      var buy=items.filter(function(i){var st=i.status||'планирую';return st==='планирую'||st==='';});
      var groups2=by(buy,material), text=['Список покупок — приживется.ру',''];Object.keys(groups2).forEach(function(k){text.push(k.toUpperCase());groups2[k].forEach(function(i){text.push('- '+(i.name||'Культура')+' — '+placeOf(i)+(i.userNote?' · '+i.userNote:''));});text.push('');});
      shop.__shoppingText=text.join('\n');
      shop.innerHTML='<span class="kicker">Закупки</span><h2>Что подготовить до посадок</h2><p>Список строится из позиций со статусом «планирую». Когда семена, рассада или саженцы куплены, смените статус в «Моём списке».</p><div class="season-shopping-grid">'+(Object.keys(groups2).length?Object.keys(groups2).map(function(k){var arr=groups2[k];return '<article><strong>'+esc(k)+' · '+arr.length+'</strong><p>'+arr.slice(0,7).map(function(i){return esc(i.name);}).join(', ')+'</p></article>';}).join(''):'<article class="is-good"><strong>Закупок нет</strong><p>Все показанные позиции уже переведены дальше по статусу.</p></article>')+'</div><div class="season-shopping-actions"><button class="button-soft" type="button" data-season-copy-shopping>Скопировать покупки</button><button class="button-soft" type="button" data-season-download-shopping>Скачать TXT</button></div>';
    }
  }
  function renderPlantingBoard(){
    var root=q('[data-planting-list-page]'), box=q('[data-planting-board]'); if(!root||!box)return;
    var items=readList(); if(!items.length){box.innerHTML='';return;}
    var statuses=['планирую','куплено','посеяно','высажено','убрать'];
    var g=by(items,function(i){return i.status||'планирую';});
    box.innerHTML='<span class="kicker">Доска статусов</span><h2>Что уже сделано, а что ждёт действия</h2><div class="planting-board-grid">'+statuses.map(function(st){var arr=g[st]||[];return '<article><strong>'+esc(st)+' · '+arr.length+'</strong><p>'+(arr.slice(0,6).map(function(i){return esc(i.name);}).join(', ')||'Пока нет позиций')+'</p></article>';}).join('')+'</div>';
  }
  function renderPlannerSiteCheck(){
    var root=q('[data-plant-planner]'), box=q('[data-planner-site-check]'); if(!root||!box)return;
    var vals=qa('[data-planner-condition]:checked',root).map(function(i){return i.value;}), has=function(v){return vals.indexOf(v)!==-1;}, cards=[];
    if(!vals.length){box.innerHTML='<span class="kicker">Проверка условий</span><h2>Отметьте особенности участка</h2><p>Здесь появятся предупреждения по сочетаниям условий: например глина с низиной, песок с ветром или короткое лето без теплицы.</p>';return;}
    if((has('clay')&&has('wet'))||(has('clay')&&has('lowland')))cards.push(['Глина + влажность','Нужны поднятые гряды, компост, дренаж и культуры, которые не выпревают у корневой шейки.']);
    if((has('sand')&&has('wind'))||(has('sand')&&has('dry')))cards.push(['Песок + ветер','Закладывайте мульчу, капельный полив, кулисы и выбирайте засухоустойчивые культуры.']);
    if(has('shade')&&has('wet'))cards.push(['Тень + сырость','Снижайте загущение, оставляйте проветривание и не ставьте теплолюбивые овощи в главный план.']);
    if(has('short')&&!has('greenhouse'))cards.push(['Короткое лето без теплицы','Ставку лучше делать на ранние сорта, рассаду, зелень, капусту, картофель и устойчивые ягодники.']);
    if(has('wind')&&!has('cover'))cards.push(['Ветер без укрытия','Понадобятся кулисы, подвязка, мульча и более осторожный выбор плодовых и высоких культур.']);
    if(!cards.length)cards.push(['Условия выбраны','Подбор учтёт отмеченные факторы и покажет причины: теплица, укрытие, дренаж, гряда или замена.']);
    box.innerHTML='<span class="kicker">Проверка условий</span><h2>На что обратить внимание до выбора культуры</h2><div class="planner-site-check-grid">'+cards.map(function(c,i){return '<article class="'+(i?'':'is-alert')+'"><strong>'+esc(c[0])+'</strong><p>'+esc(c[1])+'</p></article>';}).join('')+'</div>';
  }
  function visibleCalendarTasks(){
    var root=q('[data-zone-calendar]'); if(!root)return [];
    return qa('.calendar-month-card',root).reduce(function(out,card){var m=(q('.calendar-month-head h3',card)||{}).textContent||'';qa('.calendar-task-list li',card).forEach(function(li){out.push({month:m,type:(q('.calendar-task-tag',li)||{}).textContent||'',text:(q('p',li)||{}).textContent||''});});return out;},[]);
  }
  function calendarText(){var rows=visibleCalendarTasks(), lines=['Календарь работ — приживется.ру',''];rows.forEach(function(t){lines.push('- '+t.month+' · '+t.type+': '+t.text);});if(!rows.length)lines.push('Нет видимых задач. Сначала выберите регион, зону и нажмите «Показать календарь».');return lines.join('\n');}
  function setupCalendarExport(){
    var root=q('[data-zone-calendar]'); if(!root)return;
    var copy=q('[data-calendar-copy-visible]',root), dl=q('[data-calendar-download-visible]',root), note=q('[data-calendar-export-note]',root);
    function notify(text){if(note){note.hidden=false;note.innerHTML='<p><strong>'+esc(text)+'</strong></p>';setTimeout(function(){note.hidden=true;},2200);}}
    if(copy)copy.addEventListener('click',function(){copyText(calendarText()).then(function(){notify('Задачи календаря скопированы.');});});
    if(dl)dl.addEventListener('click',function(){download('prizhivetsya-calendar-tasks.txt',calendarText());notify('TXT-файл с задачами подготовлен.');});
  }
  document.addEventListener('DOMContentLoaded',function(){
    renderSeasonTools();renderPlantingBoard();renderPlannerSiteCheck();setupCalendarExport();
    document.addEventListener('prizh:planting-list-updated',function(){setTimeout(function(){renderSeasonTools();renderPlantingBoard();},120);});
    var seasonRoot=q('[data-season-plan-page]'); if(seasonRoot)seasonRoot.addEventListener('change',function(){setTimeout(renderSeasonTools,80);});
    var plantingRoot=q('[data-planting-list-page]'); if(plantingRoot){plantingRoot.addEventListener('input',function(){setTimeout(renderPlantingBoard,180);});plantingRoot.addEventListener('change',function(){setTimeout(renderPlantingBoard,120);});}
    var planner=q('[data-plant-planner]'); if(planner)planner.addEventListener('change',function(e){if(e.target&&e.target.matches('[data-planner-condition]'))renderPlannerSiteCheck();});
    document.addEventListener('click',function(e){var shop=q('[data-season-shopping]');if(!shop)return;if(e.target.matches('[data-season-copy-shopping]')){copyText(shop.__shoppingText||'').then(function(){e.target.textContent='Скопировано';setTimeout(function(){e.target.textContent='Скопировать покупки';},1300);});}if(e.target.matches('[data-season-download-shopping]'))download('prizhivetsya-shopping-list.txt',shop.__shoppingText||'');});
  });
})();
