/* v126: Yaroslavl pages cleaned from internal hint chips and helper copy */
(function(){
  function normalizeText(value){
    return String(value || '').toLowerCase().replace(/ё/g,'е').replace(/[—–-]/g,' ').replace(/\s+/g,' ').trim();
  }
  function escapeHtml(value){
    return String(value || '').replace(/[&<>"]/g, function(ch){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]); });
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
    search.addEventListener('input', function(){ selected = null; renderSuggestions(searchItems(search.value)); });
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
        '<td><span class="culture-variety-name"><b>↳ '+escapeTableHtml(variety.name || '')+'</b><small>'+escapeTableHtml(variety.type || 'сорт / гибрид')+'</small></span></td>'+ 
        '<td><span class="category-badge">'+escapeTableHtml(variety.type || 'сорт / гибрид')+'</span></td>'+ 
        '<td><span class="rec-badge" data-rec="'+escapeTableHtml(variety.recommendation || '')+'">'+escapeTableHtml(variety.recommendation || '')+'</span></td>'+ 
        '<td><span class="place-badge">'+escapeTableHtml(variety.place || '')+'</span></td>'+ 
        '<td class="timing-cell">'+escapeTableHtml(variety.timing || '')+'</td>'+ 
        '<td>'+escapeTableHtml(varietyDisplayNote(parentNote, variety))+'</td>'+ 
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
      var mainRow = '<tr class="culture-main-row" data-culture-main-row>'+ 
        '<td>'+firstCell+'</td>'+ 
        '<td><span class="category-badge">'+escapeTableHtml(item.category)+'</span></td>'+ 
        '<td><span class="rec-badge" data-rec="'+escapeTableHtml(item.recommendation)+'">'+escapeTableHtml(item.recommendation)+'</span></td>'+ 
        '<td><span class="place-badge">'+escapeTableHtml(item.place)+'</span></td>'+ 
        '<td class="timing-cell">'+escapeTableHtml(item.timing || '')+'</td>'+ 
        '<td>'+escapeTableHtml(item.note)+'</td>'+ 
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
    }

    fillSelect(cat, 'Все', 'category');
    fillSelect(method, 'Все', 'method');
    refreshQuickChips();

    [search, rec, cat, method].forEach(function(control){
      if(!control) return;
      control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', render);
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
