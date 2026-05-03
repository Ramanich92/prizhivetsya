/* v157: visual polish, assortment tools and no-assets build */
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
      if(!list.length){ suggestions.innerHTML = '<div class="locality-empty">Такой местности нет в базе. Выберите субъект и ближайшую зону вручную.</div>'; return; }
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
    var reliability = root.querySelector('[data-culture-reliability]');
    var count = root.querySelector('[data-culture-count]');
    var cards = Array.prototype.slice.call(root.querySelectorAll('[data-culture-card]'));
    function apply(){
      var q = normalizeText(search && search.value);
      var cat = category && category.value;
      var rel = reliability && reliability.value;
      var visible = 0;
      cards.forEach(function(card){
        var hay = normalizeText((card.getAttribute('data-name') || '') + ' ' + (card.getAttribute('data-category') || '') + ' ' + card.textContent);
        var ok = (!q || hay.indexOf(q) !== -1) && (!cat || card.getAttribute('data-category') === cat) && (!rel || card.textContent.indexOf(rel) !== -1);
        card.classList.toggle('culture-hidden', !ok);
        if(ok) visible += 1;
      });
      if(count) count.textContent = visible + ' ' + pluralRu(visible, 'культура', 'культуры', 'культур');
    }
    var debouncedApply = debounce(apply, 120);
    if(search) search.addEventListener('input', debouncedApply);
    if(category) category.addEventListener('change', apply);
    if(reliability) reliability.addEventListener('change', apply);
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

/* v164: zone work calendar with safe render event */
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
    function notifyCalendarRendered(){try{root.dispatchEvent(new CustomEvent('prizh:calendar-rendered',{bubbles:true}));document.dispatchEvent(new CustomEvent('prizh:calendar-rendered'));}catch(e){}}
    function emptyMessage(heading,text){if(empty){var h=empty.querySelector('h2'),p=empty.querySelector('p');if(h)h.textContent=heading;if(p)p.textContent=text;empty.hidden=false;}notifyCalendarRendered();}
    function render(){var c=cal();if(start)start.hidden=true;if(result)result.hidden=true;if(empty)empty.hidden=true;if(personal)personal.hidden=true;if(!c){if(start)start.hidden=false;notifyCalendarRendered();return;}var z=state.zones[Number(c.z)]||{}, s=state.subjects[z.s]||{}, mf=month?month.value:'', tf=task?task.value:'', useList=!!(onlyList&&onlyList.checked), items=useList?readPlanting():[], tokens=plantingTokens(items), cards=[], total=0;if(useList&&!tokens.length){emptyMessage('Список посадок пуст','Добавьте культуры в «Мой список», затем календарь покажет задачи, связанные с ними.');return;}(c.months||[]).forEach(function(m){if(mf&&m.month!==mf)return;var works=(m.works||[]).filter(function(w){if(tf&&taskType(w)!==tf)return false;if(useList&&!workMatchesList(w,tokens))return false;return true;});if(!works.length)return;total+=works.length;cards.push('<article class="calendar-month-card"><div class="calendar-month-head"><h3>'+esc(m.month)+'</h3><span>'+works.length+' '+plural(works.length,'задача','задачи','задач')+'</span></div><ul class="calendar-task-list">'+works.map(function(w){return '<li><span class="calendar-task-tag">'+esc(taskType(w))+'</span><p>'+esc(w.text)+'</p></li>';}).join('')+'</ul></article>');});if(!cards.length){emptyMessage('Нет задач по выбранным условиям',useList?'В календаре зоны нет задач, совпадающих с текущим списком посадок. Отключите фильтр по списку или выберите другой месяц.':'Попробуйте выбрать другой месяц или тип работ.');return;}if(title)title.textContent=s.n+' — '+z.n;if(summary)summary.textContent=z.sum||'Календарь учитывает сезон, риски зоны и практику посадок для участка.';if(personal&&useList){personal.textContent='Показаны задачи, связанные с вашим списком: '+items.length+' '+plural(items.length,'культура','культуры','культур')+', '+total+' '+plural(total,'задача','задачи','задач')+'.';personal.hidden=false;}if(season)season.textContent=c.season||'';if(risk)risk.textContent=c.risk||'';if(basis)basis.textContent=c.basis||'';if(care)care.textContent=c.care||'';if(monthsWrap)monthsWrap.innerHTML=cards.join('');if(result)result.hidden=false;notifyCalendarRendered();}
    fetch(url).then(function(r){if(!r.ok)throw new Error('calendar');return r.json();}).then(function(data){state={subjects:data.subjects||[],zones:data.zones||[],calendars:data.calendars||[],byZone:{}};state.calendars.forEach(function(c){state.byZone[String(c.z)]=c;});setOpts(subject,'Выберите регион',state.subjects.map(function(s,i){return {value:i,label:s.n};}),'');setOpts(zone,'Сначала выберите регион',[],'');setOpts(month,'Все месяцы',[],'');setOpts(task,'Все типы работ',taskOptions(null),'');var q=new URLSearchParams(window.location.search).get('zone');if(q){var zi=state.zones.findIndex(function(z){return z.id===q;});if(zi>=0){subject.value=String(state.zones[zi].s);setOpts(zone,'Выберите зону',rowsForSubject(subject.value),String(zi));refreshLists();render();}}if(subject)subject.addEventListener('change',function(){setOpts(zone,'Выберите зону',rowsForSubject(subject.value),'');refreshLists();render();});if(zone)zone.addEventListener('change',function(){refreshLists();render();});if(month)month.addEventListener('change',render);if(task)task.addEventListener('change',render);if(onlyList)onlyList.addEventListener('change',render);if(apply)apply.addEventListener('click',render);if(printBtn)printBtn.addEventListener('click',function(){window.print();});if(reset)reset.addEventListener('click',function(){if(subject)subject.value='';setOpts(zone,'Сначала выберите регион',[],'');setOpts(month,'Все месяцы',[],'');setOpts(task,'Все типы работ',taskOptions(null),'');if(onlyList)onlyList.checked=false;if(start)start.hidden=false;if(result)result.hidden=true;if(empty)empty.hidden=true;if(personal)personal.hidden=true;notifyCalendarRendered();});if(!q&&start){start.hidden=false;notifyCalendarRendered();}}).catch(function(){if(start){start.hidden=false;var h=start.querySelector('h2'),p=start.querySelector('p');if(h)h.textContent='Календарь временно недоступен';if(p)p.textContent='Не удалось загрузить данные календаря.';}});
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
  function normalizeItem(item,idx,seen){var changed=false;if(!item.id){item.id='pl_'+hash(keyOf(item)+'|'+idx);changed=true;}if(!Object.prototype.hasOwnProperty.call(item,'userNote')){item.userNote='';changed=true;}if(!item.sitePlace||places.indexOf(item.sitePlace)===-1){item.sitePlace=inferSitePlace(item);item.sitePlaceAuto=true;changed=true;}else if(!Object.prototype.hasOwnProperty.call(item,'sitePlaceAuto')){item.sitePlaceAuto=true;changed=true;}if(!item.status||statuses.indexOf(item.status)===-1){item.status='планирую';changed=true;}var id=item.id;if(Object.prototype.hasOwnProperty.call(seen,id)){item.id=id+'_'+idx;changed=true;}seen[item.id]=true;return changed;}
  function read(){var items=rawRead(),changed=false,seen={};items=items.filter(function(item){return item&&item.name;});items.forEach(function(item,idx){if(normalizeItem(item,idx,seen))changed=true;});if(changed)write(items);return items;}
  function payloadFromButton(btn){var item={id:'pl_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7),name:btn.getAttribute('data-planting-name')||'',category:btn.getAttribute('data-planting-category')||'',recommendation:btn.getAttribute('data-planting-rec')||'',place:btn.getAttribute('data-planting-place')||'',timing:btn.getAttribute('data-planting-time')||'',comment:btn.getAttribute('data-planting-comment')||'',sourceTitle:btn.getAttribute('data-planting-source')||cleanTitle(),sourceUrl:btn.getAttribute('data-planting-url')||pageUrl(),userNote:'',status:'планирую',addedAt:new Date().toISOString()};item.sitePlace=inferSitePlace(item);item.sitePlaceAuto=true;return item;}
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
    function filtered(items){var q=norm(search&&search.value),tokens=q?q.split(' ').filter(function(x){return x.length>1;}):[],rv=rec&&rec.value,cv=cat&&cat.value,pv=placeFilter&&placeFilter.value,sv=statusFilter&&statusFilter.value,quick=root.getAttribute('data-planting-quick-mode')||'';return items.filter(function(item){var hay=norm([item.name,item.category,item.recommendation,item.place,item.sitePlace,item.status,item.timing,item.comment,item.userNote,item.sourceTitle].join(' '));if(quick==='no-place'&&item.sitePlace&&item.sitePlace!=='не указано'&&item.sitePlaceAuto!==true&&!/выбрать|уточн|не указан/.test(hay))return false;if(quick==='attention'&&!/риск|укрыт|уход|проверить|уточн|болезн|замороз|низин|ветер/.test(hay))return false;if(quick==='notes'&&String(item.userNote||'').trim())return false;if(rv&&item.recommendation!==rv)return false;if(cv&&item.category!==cv)return false;if(pv&&item.sitePlace!==pv)return false;if(sv&&item.status!==sv)return false;if(tokens.length&&tokens.every(function(tok){return hay.indexOf(tok)===-1;}))return false;return true;}).sort(function(a,b){return (rank(a.recommendation)-rank(b.recommendation))||String(a.status||'').localeCompare(String(b.status||''),'ru')||String(a.category||'').localeCompare(String(b.category||''),'ru')||a.name.localeCompare(b.name,'ru')||String(a.sourceTitle||'').localeCompare(String(b.sourceTitle||''),'ru');});}
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
    root.addEventListener('change',function(e){var field=e.target.closest('[data-planting-place],[data-planting-status]');if(!field)return;var id=field.getAttribute('data-planting-place')||field.getAttribute('data-planting-status'),items=read(),changed=false;items.forEach(function(item){if(item.id===id){if(field.hasAttribute('data-planting-place')){item.sitePlace=field.value;item.sitePlaceAuto=false;}if(field.hasAttribute('data-planting-status'))item.status=field.value;changed=true;}});if(changed){write(items);render();document.dispatchEvent(new CustomEvent('prizh:planting-list-updated'));}});
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
    var sf=selected(seasonSel), pf=selected(placeSel), stf=selected(statusSel), quick=root.getAttribute('data-season-quick-mode')||'';
    return items.filter(function(i){
      var itemSeason=season(i), itemPlace=i.sitePlace||i.place||'', itemStatus=i.status||'планирую', hay=norm([i.name,i.category,i.recommendation,i.place,i.sitePlace,i.status,i.timing,i.comment,i.userNote,i.sourceTitle].join(' '));
      if(quick==='attention'&&!/риск|укрыт|уход|проверить|уточн|замороз|низин|ветер/.test(hay))return false;
      if(quick==='no-place'&&itemPlace&&itemPlace!=='место не указано'&&i.sitePlaceAuto!==true&&!/выбрать|уточн|не указан/.test(hay))return false;
      if(sf && itemSeason!==sf)return false;
      if(pf && itemPlace!==pf)return false;
      if(stf && itemStatus!==stf)return false;
      return true;
    });
  }
  function renderChecklist(items){
    if(!checklist)return;
    var noPlace=items.filter(function(i){return !(i.sitePlace||i.place)||i.sitePlaceAuto===true;});
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
  if(reset)reset.addEventListener('click',function(){root.setAttribute('data-season-quick-mode','');[seasonSel,placeSel,statusSel].forEach(function(sel){if(sel)sel.value='';});render();});
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
    box.innerHTML='<span class="kicker">Доска статусов</span><h2>Что уже сделано, а что ждёт действия</h2><div class="planting-board-grid">'+statuses.map(function(st){var arr=g[st]||[];return '<article><strong>'+esc(st)+' · '+arr.length+'</strong><p>'+(arr.slice(0,6).map(function(i){return esc(i.name);}).join(', ')||'Нет позиций')+'</p></article>';}).join('')+'</div>';
  }
  function renderPlannerSiteCheck(){
    var root=q('[data-plant-planner]'), box=q('[data-planner-site-check]'); if(!root||!box)return;
    var vals=qa('[data-planner-condition]:checked',root).map(function(i){return i.value;}), has=function(v){return vals.indexOf(v)!==-1;}, cards=[];
    if(!vals.length){box.innerHTML='<span class="kicker">Проверка условий</span><h2>Отметьте особенности участка</h2><p>Здесь появятся предупреждения по сочетаниям условий: вроде глина с низиной, песок с ветром или короткое лето без теплицы.</p>';return;}
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


/* v157: focused user-facing polish without extra assets */
(function(){
  var KEY='prizhivetsya:planting-list:v1';
  function q(s,r){return (r||document).querySelector(s);}
  function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  function norm(v){return String(v||'').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();}
  function readList(){try{var a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
  function season(item){var t=norm([item.timing,item.comment,item.userNote,item.status,item.sourceTitle].join(' '));if(/феврал|март|апрел|май|рассад|посев|высад/.test(t))return 'Весна';if(/июн|июл|август|полив|мульч|сбор|уход/.test(t))return 'Лето';if(/сент|окт|ноябр|укрыт|зим|убор|подготов/.test(t))return 'Осень';if(/декабр|январ/.test(t))return 'Зима';return 'Срок уточнить';}
  function placeOf(i){return i.sitePlace||i.place||'место не указано';}
  function statusOf(i){return i.status||'планирую';}
  function isAttention(i){return !i.sitePlace || /риск|укрыт|уход|проверить/i.test([i.recommendation,i.comment,i.timing].join(' '));}
  function dispatch(el,type){if(el)el.dispatchEvent(new Event(type,{bubbles:true}));}
  function setValue(el,value){if(!el)return;el.value=value;dispatch(el,'change');dispatch(el,'input');}
  function activateButton(btn){qa('[data-season-quick],[data-planting-quick],[data-calendar-view]').forEach(function(b){if(b.parentNode===btn.parentNode)b.classList.remove('is-active');});btn.classList.add('is-active');}

  function setupPlantingQuickFilters(){
    var root=q('[data-planting-list-page]'); if(!root)return;
    var search=q('[data-planting-filter-search]',root), place=q('[data-planting-filter-place]',root), status=q('[data-planting-filter-status]',root), rec=q('[data-planting-filter-rec]',root);
    root.addEventListener('click',function(e){
      var btn=e.target.closest('[data-planting-quick]'); if(!btn)return;
      activateButton(btn);
      var mode=btn.getAttribute('data-planting-quick');
      root.setAttribute('data-planting-quick-mode',mode==='all'?'':mode);
      if(mode==='all'){setValue(search,'');setValue(place,'');setValue(status,'');setValue(rec,'');}
      if(mode==='no-place'){setValue(search,'');setValue(place,'');setValue(status,'');setValue(rec,'');}
      if(mode==='planned'){root.setAttribute('data-planting-quick-mode','');setValue(status,'планирую');setValue(search,'');}
      if(mode==='greenhouse'){root.setAttribute('data-planting-quick-mode','');setValue(place,'теплица');setValue(search,'');}
      if(mode==='attention'){setValue(search,'');setValue(place,'');setValue(status,'');setValue(rec,'');}
    });
  }

  function renderPlantingPlaceBoard(){
    var root=q('[data-planting-list-page]'), board=q('[data-planting-place-board]',root); if(!root||!board)return;
    var items=readList().filter(function(i){return statusOf(i)!=='убрать';});
    if(!items.length){board.innerHTML='';return;}
    var groups={}; items.forEach(function(i){var k=placeOf(i);(groups[k]||(groups[k]=[])).push(i);});
    var keys=Object.keys(groups).sort(function(a,b){return groups[b].length-groups[a].length||a.localeCompare(b,'ru');});
    board.innerHTML='<span class="kicker">По местам посадки</span><h2>Где будет основная нагрузка</h2><div class="planting-place-grid">'+keys.map(function(k){var arr=groups[k];var need=arr.filter(isAttention).length;return '<article><strong>'+esc(k)+' · '+arr.length+'</strong><p>'+esc(arr.slice(0,5).map(function(i){return i.name;}).join(', '))+(arr.length>5?' и ещё '+(arr.length-5):'')+'</p><small>'+need+' требует проверки места, срока или укрытия</small></article>';}).join('')+'</div>';
  }

  function setupSeasonQuickFilters(){
    var root=q('[data-season-plan-page]'); if(!root)return;
    var seasonSel=q('[data-season-filter]',root), placeSel=q('[data-season-place-filter]',root), statusSel=q('[data-season-status-filter]',root), reset=q('[data-season-reset]',root);
    root.addEventListener('click',function(e){
      var btn=e.target.closest('[data-season-quick]'); if(!btn)return;
      activateButton(btn);
      var mode=btn.getAttribute('data-season-quick');
      root.setAttribute('data-season-quick-mode',mode==='all'?'':mode);
      if(mode==='all'){if(reset)reset.click();return;}
      if(mode==='attention'){setValue(statusSel,'');setValue(placeSel,'');setValue(seasonSel,'');}
      if(mode==='no-place'){setValue(statusSel,'');setValue(placeSel,'');setValue(seasonSel,'');}
      if(mode==='greenhouse'){root.setAttribute('data-season-quick-mode','');setValue(placeSel,'теплица');}
      if(mode==='planned'){root.setAttribute('data-season-quick-mode','');setValue(statusSel,'планирую');}
      setTimeout(updateSeasonProgress,120);
    });
  }

  function updateSeasonProgress(){
    var root=q('[data-season-plan-page]'); if(!root)return;
    var target=q('[data-season-progress]',root);
    if(!target){
      var results=q('[data-season-results]',root);
      if(!results)return;
      target=document.createElement('section');
      target.className='season-progress-panel';
      target.setAttribute('data-season-progress','');
      results.insertBefore(target, q('[data-season-summary]',root) || results.firstChild);
    }
    var items=readList().filter(function(i){return statusOf(i)!=='убрать';});
    if(!items.length){target.innerHTML='';return;}
    var filled=0,total=items.length*4;
    items.forEach(function(i){ if(placeOf(i)!=='место не указано')filled++; if(statusOf(i))filled++; if(i.userNote)filled++; if(i.timing||i.comment)filled++; });
    var percent=Math.round((filled/Math.max(total,1))*100);
    var missingPlace=items.filter(function(i){return placeOf(i)==='место не указано';}).length;
    var missingNote=items.filter(function(i){return !i.userNote;}).length;
    var planned=items.filter(function(i){return statusOf(i)==='планирую';}).length;
    var attention=items.filter(isAttention).length;
    target.innerHTML='<div class="season-progress-head"><div><span class="kicker">Готовность плана</span><h2>План готов на '+percent+'%</h2><p>Оценка учитывает место посадки, статус, заметки и сроки. Это не строгий расчёт, а быстрый контроль перед сезоном.</p></div><strong>'+percent+'%</strong></div><div class="season-progress-track" aria-hidden="true"><span style="width:'+percent+'%"></span></div><div class="season-progress-missing"><article><strong>'+missingPlace+'</strong><p>без места посадки</p></article><article><strong>'+missingNote+'</strong><p>без личной заметки</p></article><article><strong>'+planned+'</strong><p>ещё планируются</p></article><article><strong>'+attention+'</strong><p>требуют внимания</p></article></div>';
  }

  function setupCalendarViews(){
    var root=q('[data-zone-calendar]'); if(!root)return;
    var my=q('[data-calendar-my-list]',root), apply=q('[data-calendar-apply]',root);
    root.addEventListener('click',function(e){
      var btn=e.target.closest('[data-calendar-view]'); if(!btn)return;
      activateButton(btn);
      root.classList.remove('calendar-view-all','calendar-view-my-list','calendar-view-nearest');
      var mode=btn.getAttribute('data-calendar-view');
      root.classList.add('calendar-view-'+mode);
      if(mode==='all'&&my)my.checked=false;
      if(mode==='my-list'&&my)my.checked=true;
      if(apply)apply.click();
    });
  }

  function updatePlannerSelectedSummary(){
    var root=q('[data-plant-planner]'), box=q('[data-planner-selected-summary]',root); if(!root||!box)return;
    function label(sel){if(!sel)return'';var o=sel.options[sel.selectedIndex];return o&&sel.value?o.textContent:'';}
    var parts=[];
    ['[data-planner-subject]','[data-planner-zone]','[data-planner-guide]','[data-planner-category]','[data-planner-where]','[data-planner-risk]'].forEach(function(s){var v=label(q(s,root));if(v)parts.push(v);});
    qa('[data-planner-condition]:checked',root).forEach(function(ch){parts.push((ch.parentNode.textContent||ch.value).trim());});
    if(!parts.length){box.innerHTML='<strong>Параметры ещё не выбраны</strong><span>Начните с региона и зоны</span><span>Добавьте условия участка</span><a href="conditions.html">Открыть диагностику условий</a>';return;}
    box.innerHTML='<strong>Сейчас учитывается</strong>'+parts.slice(0,12).map(function(p){return '<span>'+esc(p)+'</span>';}).join('')+'<a href="season-plan.html">После подбора открыть план сезона</a>';
  }

  function injectZoneNextStep(){
    if(location.pathname.indexOf('/regions/')===-1)return;
    var main=q('main'); if(!main || q('[data-zone-next-step]',main))return;
    var isZone=!!q('[data-culture-table], .culture-table-wrap, [data-region-placeholder]',main);
    if(!isZone)return;
    var prefix='../';
    var box=document.createElement('section');
    box.className='zone-next-step-panel';
    box.setAttribute('data-zone-next-step','');
    box.innerHTML='<span class="kicker">Следующий шаг для этой зоны</span><h2>Соберите рекомендации в рабочий план</h2><div class="zone-next-step-grid"><a href="'+prefix+'planner.html"><strong>Открыть подбор</strong><span>уточнить условия участка</span></a><a href="'+prefix+'planting-list.html"><strong>Сохранить культуры</strong><span>место, статус и заметки</span></a><a href="'+prefix+'calendar.html"><strong>Сверить календарь</strong><span>посев, высадка, уход и сбор</span></a><a href="'+prefix+'season-plan.html"><strong>Собрать план</strong><span>печать и список покупок</span></a></div>';
    main.appendChild(box);
  }

  document.addEventListener('DOMContentLoaded',function(){
    setupPlantingQuickFilters();
    setupSeasonQuickFilters();
    setupCalendarViews();
    updatePlannerSelectedSummary();
    renderPlantingPlaceBoard();
    updateSeasonProgress();
    injectZoneNextStep();
    var planner=q('[data-plant-planner]');
    if(planner){planner.addEventListener('change',function(){setTimeout(updatePlannerSelectedSummary,80);});planner.addEventListener('input',function(){setTimeout(updatePlannerSelectedSummary,120);});}
    var planting=q('[data-planting-list-page]');
    if(planting){planting.addEventListener('change',function(){setTimeout(renderPlantingPlaceBoard,120);});planting.addEventListener('input',function(){setTimeout(renderPlantingPlaceBoard,180);});}
    var seasonRoot=q('[data-season-plan-page]');
    if(seasonRoot){seasonRoot.addEventListener('change',function(){setTimeout(updateSeasonProgress,160);});}
    document.addEventListener('prizh:planting-list-updated',function(){setTimeout(function(){renderPlantingPlaceBoard();updateSeasonProgress();},160);});
  });
})();


/* v159: zone starter packs, guide actions and plan readiness helpers */
(function(){
  var KEY='prizhivetsya:planting-list:v1';
  function q(s,r){return (r||document).querySelector(s);}
  function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  function norm(v){return String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[—–-]/g,' ').replace(/\s+/g,' ').trim();}
  function ready(fn){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn);else fn();}
  function readList(){try{var a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
  function textOf(el){return el?el.textContent.replace(/\s+/g,' ').trim():'';}
  function splitNames(text){return String(text||'').split(/[,;]/).map(function(x){return x.replace(/\s+/g,' ').trim();}).filter(Boolean);}
  function unique(arr){var seen={};return arr.filter(function(x){var k=norm(x);if(!k||seen[k])return false;seen[k]=true;return true;});}
  function passportValue(label, root){
    var wanted=norm(label), found='';
    qa('.zone-passport-item',root).some(function(item){
      var s=q('span',item), p=q('p',item);
      if(s && norm(s.textContent).indexOf(wanted)>-1){found=textOf(p);return true;}
      return false;
    });
    return found;
  }
  function zoneMistakes(riskText, soilText, seasonText){
    var all=norm([riskText,soilText,seasonText].join(' ')), out=[];
    if(/замороз|холод/.test(all)) out.push('Высаживать рассаду после первого тёплого дня без временного укрытия.');
    if(/засух|сух|перегрев/.test(all)) out.push('Оставлять грядки без мульчи и редкого, но глубокого полива.');
    if(/песк|супес/.test(all)) out.push('Сажать влаголюбивые культуры без органики и удержания влаги.');
    if(/сыр|влаж|низин|засто/.test(all)) out.push('Сажать косточковые и лаванду в сырое место без дренажа.');
    if(/ветер|сухове/.test(all)) out.push('Не защищать молодые кусты, рассаду и высокие цветы от ветра.');
    if(/кисл/.test(all)) out.push('Выбирать культуры для нейтральной почвы без проверки кислотности.');
    if(!out.length) out.push('Брать поздние сорта без сверки с календарём зоны.');
    return out.slice(0,4);
  }
  function injectZoneStarterPack(){
    var wrap=q('.region-clean-wrap');
    if(!wrap || q('[data-v159-zone-pack]',wrap) || q('[data-culture-table]',wrap)) return;
    if(!q('.zone-passport-card',wrap) || !q('.zone-topic-card',wrap)) return;
    var reliable=splitNames(passportValue('Надёжная основа',wrap));
    var risky=splitNames(passportValue('С осторожностью',wrap));
    var risks=passportValue('Риски',wrap), soil=passportValue('Почвы',wrap), season=passportValue('Сезон',wrap);
    var fallback=['Картофель','Кабачок','Горох','Лук репчатый','Смородина','Жимолость','Бархатцы','Мята','Укроп','Руккола'];
    var starters=unique(reliable.concat(fallback)).slice(0,10);
    var mistakes=zoneMistakes(risks,soil,season);
    var replacements=(risky.length?risky:['капризные культуры']).slice(0,4).map(function(name,idx){
      var a=starters[idx]||starters[0]||'ранние культуры';
      var b=starters[idx+1]||starters[1]||'устойчивые культуры';
      return '<li><strong>'+esc(name)+'</strong>: сначала посадите '+esc(a)+' или '+esc(b)+', а рискованную культуру оставьте для лучшего места участка.</li>';
    }).join('');
    var box=document.createElement('section');
    box.className='clean-table-card zone-v159-pack';
    box.setAttribute('data-v159-zone-pack','');
    box.innerHTML='<div class="clean-table-head"><div><span class="kicker">Рабочий набор зоны</span><h2>Первые культуры, ошибки и замены</h2><p>Блок собирает паспорт зоны в практичный маршрут: что посадить первым, чего избежать и чем заменить рискованные позиции.</p></div><a class="zone-back-link" href="../planner.html">Открыть подбор</a></div><div class="zone-v159-grid"><article><h3>Первые культуры для старта</h3><p>'+esc(starters.join(', '))+'</p><small>Начинайте с надёжной основы зоны, затем добавляйте культуры из справочников.</small></article><article><h3>Частые ошибки зоны</h3><ul>'+mistakes.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul></article><article><h3>Если культура рискованная</h3><ul>'+replacements+'</ul></article></div><div class="zone-v159-actions"><a class="btn primary" href="../planner.html">Подобрать под мой участок</a><a class="btn secondary" href="../planting-list.html">Открыть мой список</a><a class="btn secondary" href="../season-plan.html">Собрать план</a></div>';
    var anchor=q('#zone-profile',wrap) || q('#zone-passport',wrap) || q('.zone-passport-card',wrap);
    if(anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor.nextSibling);
  }
  function setSelectAndFire(sel,value){if(!sel)return;sel.value=value;sel.dispatchEvent(new Event('change',{bubbles:true}));sel.dispatchEvent(new Event('input',{bubbles:true}));}
  function copyText(txt){
    if(navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(txt);
    var ta=document.createElement('textarea');ta.value=txt;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();return Promise.resolve();
  }
  function visibleGuideRows(root){
    return qa('tbody tr',root).filter(function(row){return !row.hidden && row.offsetParent!==null;}).map(function(row){return qa('td',row).map(textOf).filter(Boolean).join(' — ');}).filter(Boolean);
  }
  function injectGuideActionPanel(){
    var root=q('[data-culture-table]');
    if(!root || q('[data-v159-guide-actions]',root)) return;
    var summary=qa('[data-quick-recommendation]',root).map(function(btn){return textOf(btn).replace(/\s+/g,' ');}).filter(Boolean).join(' · ');
    var panel=document.createElement('section');
    panel.className='guide-v159-actions';
    panel.setAttribute('data-v159-guide-actions','');
    panel.innerHTML='<div><span class="kicker">Быстрый выбор</span><h3>Соберите безопасный список из таблицы</h3><p>'+(summary?esc(summary):'Сначала смотрите надёжные и рекомендованные позиции, затем добавляйте варианты с укрытием.')+'</p></div><div class="guide-v159-buttons"><button type="button" data-v159-guide-rec="Надёжно">Только надёжные</button><button type="button" data-v159-guide-rec="Рекомендовано">Рекомендованные</button><button type="button" data-v159-guide-rec="С укрытием / уходом">С укрытием</button><button type="button" data-v159-guide-copy>Скопировать видимые</button></div>';
    var meta=q('.clean-table-meta',root) || q('[data-culture-section]',root);
    root.insertBefore(panel, meta || root.firstChild);
    panel.addEventListener('click',function(e){
      var btn=e.target.closest('[data-v159-guide-rec],[data-v159-guide-copy]'); if(!btn)return;
      if(btn.hasAttribute('data-v159-guide-rec')) setSelectAndFire(q('[data-filter-recommendation]',root), btn.getAttribute('data-v159-guide-rec'));
      if(btn.hasAttribute('data-v159-guide-copy')){var rows=visibleGuideRows(root);copyText(rows.length?rows.join('\n'):'В таблице нет видимых позиций.');btn.textContent='Скопировано';setTimeout(function(){btn.textContent='Скопировать видимые';},1600);}
    });
  }
  function activeItems(){return readList().filter(function(i){return (i.status||'планирую')!=='убрать';});}
  function isAttention(item){return !item.sitePlace || item.sitePlaceAuto===true || /риск|укрыт|уход|провер|замороз|ветер|низин|сыр|сух|дренаж/i.test([item.recommendation,item.comment,item.timing,item.userNote,item.place].join(' '));}
  function injectListQualityPanel(){
    var root=q('[data-planting-list-page]'); if(!root || q('[data-v159-list-quality]',root)) return;
    var items=activeItems(), noPlace=items.filter(function(i){return !i.sitePlace || i.sitePlaceAuto===true;}).length, attention=items.filter(isAttention).length, planned=items.filter(function(i){return (i.status||'планирую')==='планирую';}).length;
    var panel=document.createElement('section');
    panel.className='planting-v159-quality';
    panel.setAttribute('data-v159-list-quality','');
    panel.innerHTML='<div><span class="kicker">Контроль перед планом</span><h2>Что уточнить в списке</h2><p>Чем точнее место, статус и заметка, тем полезнее будет план сезона и печатная версия.</p></div><div class="planting-v159-quality-grid"><button type="button" data-v159-list-quick="no-place"><strong>'+noPlace+'</strong><span>подтвердить место</span></button><button type="button" data-v159-list-quick="attention"><strong>'+attention+'</strong><span>проверить риск</span></button><button type="button" data-v159-list-quick="planned"><strong>'+planned+'</strong><span>ещё планируются</span></button><a href="season-plan.html"><strong>План</strong><span>собрать сезон</span></a></div>';
    var anchor=q('.planting-route-panel',root) || q('.planting-panel',root);
    if(anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    panel.addEventListener('click',function(e){var btn=e.target.closest('[data-v159-list-quick]');if(!btn)return;var mode=btn.getAttribute('data-v159-list-quick');var old=q('[data-planting-quick="'+mode+'"]',root);if(old)old.click();});
  }
  function injectSeasonWeekendPanel(){
    var root=q('[data-season-plan-page]'); if(!root || q('[data-v159-season-focus]',root)) return;
    var items=activeItems(), attention=items.filter(isAttention), noPlace=items.filter(function(i){return !i.sitePlace || i.sitePlaceAuto===true;}), greenhouse=items.filter(function(i){return norm(i.sitePlace).indexOf('теплиц')>-1 || norm(i.place).indexOf('теплиц')>-1;});
    var panel=document.createElement('section');
    panel.className='season-v159-focus';
    panel.setAttribute('data-v159-season-focus','');
    panel.innerHTML='<div><span class="kicker">Перед ближайшим выездом</span><h2>Быстрая проверка плана</h2><p>Откройте только те позиции, где нужно подтвердить место, риск или тепличные работы.</p></div><div class="season-v159-focus-grid"><button type="button" data-v159-season-quick="attention"><strong>'+attention.length+'</strong><span>требуют внимания</span></button><button type="button" data-v159-season-quick="no-place"><strong>'+noPlace.length+'</strong><span>без подтверждённого места</span></button><button type="button" data-v159-season-quick="greenhouse"><strong>'+greenhouse.length+'</strong><span>для теплицы</span></button><a href="calendar.html"><strong>Календарь</strong><span>сверить сроки</span></a></div>';
    var anchor=q('.season-actions',root) || q('.season-hero',root);
    if(anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    panel.addEventListener('click',function(e){var btn=e.target.closest('[data-v159-season-quick]');if(!btn)return;var mode=btn.getAttribute('data-v159-season-quick');var old=q('[data-season-quick="'+mode+'"]',root);if(old)old.click();});
  }
  function refreshDynamicPanels(){injectListQualityPanel();injectSeasonWeekendPanel();}
  ready(function(){injectZoneStarterPack();injectGuideActionPanel();refreshDynamicPanels();document.addEventListener('prizh:planting-list-updated',function(){setTimeout(refreshDynamicPanels,80);});});
})();


/* v160: zone quality and guide-to-list workflow */
(function(){
  var KEY='prizhivetsya:planting-list:v1';
  function q(s,r){return (r||document).querySelector(s);}
  function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function text(el){return (el&&el.textContent||'').replace(/\s+/g,' ').trim();}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  function norm(v){return String(v||'').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();}
  function readList(){try{var a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
  function writeList(items){try{if(items.length)localStorage.setItem(KEY,JSON.stringify(items));else localStorage.removeItem(KEY);return true;}catch(e){return false;}}
  function hash(v){var h=0,s=String(v||'');for(var i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;}return Math.abs(h).toString(36);}
  function keyOf(i){return [norm(i.name),norm(i.sourceTitle),norm(i.sourceUrl),norm(i.recommendation),norm(i.place)].join('|');}
  function inferSitePlace(i){var t=norm([i.place,i.category,i.comment,i.sourceTitle].join(' '));if(t.indexOf('теплиц')>-1)return 'теплица';if(t.indexOf('контейнер')>-1)return 'контейнер';if(/цвет|декор|клумб/.test(t))return 'клумба';if(/сад|ягод|плодов|кустар|дерев/.test(t))return 'сад';return 'грядка';}
  function copyText(txt){if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(txt);var ta=document.createElement('textarea');ta.value=txt;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();return Promise.resolve();}
  function unique(arr){var seen={},out=[];arr.forEach(function(v){v=String(v||'').trim();if(!v)return;var k=norm(v);if(!seen[k]){seen[k]=true;out.push(v);}});return out;}
  function passportValue(label,root){
    var found='';
    qa('.zone-passport-card,.zone-topic-card,.clean-fact-card,.region-card',root).some(function(card){
      var t=text(card);
      if(norm(t).indexOf(norm(label))===-1)return false;
      var strong=text(q('strong',card));
      var p=text(q('p',card));
      found=(p&&norm(p).indexOf(norm(label))===-1)?p:t.replace(label,'').trim();
      if(strong&&norm(strong).indexOf(norm(label))===-1)found=strong;
      return !!found;
    });
    return found;
  }
  function splitNames(v){return unique(String(v||'').split(/[,;·]/).map(function(x){return x.replace(/\s+/g,' ').trim();})).filter(function(x){return x.length>2;});}
  function zoneSignals(root){var all=norm(text(root)), out=[];if(/замороз|холод|коротк/.test(all))out.push('короткий сезон');if(/сух|засух|перегрев/.test(all))out.push('сухость');if(/влаж|сыр|низин|засто/.test(all))out.push('избыток влаги');if(/ветер|сухове/.test(all))out.push('ветер');if(/кисл/.test(all))out.push('кислая почва');if(/глин|суглин/.test(all))out.push('тяжёлая почва');if(/песк|супес/.test(all))out.push('лёгкая почва');return unique(out);}
  function decisionLists(root){
    var reliable=splitNames(passportValue('Надёжная основа',root));
    var risky=splitNames(passportValue('С осторожностью',root));
    var signals=zoneSignals(root);
    var base=unique(reliable.concat(['Картофель','Кабачок','Лук на перо','Редис','Укроп','Руккола','Смородина','Жимолость','Бархатцы','Мята'])).slice(0,10);
    var avoid=[];
    if(signals.indexOf('короткий сезон')>-1)avoid.push('поздние сорта без рассады, теплицы или укрытия');
    if(signals.indexOf('избыток влаги')>-1)avoid.push('лаванду, косточковые и теплолюбивые культуры в сырой низине');
    if(signals.indexOf('сухость')>-1)avoid.push('капусту, зелень и молодые саженцы без мульчи и полива');
    if(signals.indexOf('ветер')>-1)avoid.push('высокие цветы, рассаду и молодые кусты без защиты от ветра');
    if(signals.indexOf('кислая почва')>-1)avoid.push('культуры нейтральной почвы без проверки кислотности');
    if(!avoid.length)avoid.push('рискованные культуры без сверки со справочником зоны');
    var swaps=(risky.length?risky:['рискованные культуры']).slice(0,4).map(function(name,i){return name+' → '+(base[i]||base[0]||'устойчивая культура');});
    return {base:base, avoid:avoid, swaps:swaps, signals:signals};
  }
  function injectZoneDecision(){
    var root=q('.region-clean-wrap'); if(!root || q('[data-v160-zone-decision]',root) || q('[data-culture-table]',root))return;
    if(!q('.zone-passport-card',root) && !q('.zone-topic-card',root))return;
    var d=decisionLists(root), box=document.createElement('section');
    box.className='zone-v160-decision';
    box.setAttribute('data-v160-zone-decision','');
    box.innerHTML='<div class="zone-v160-head"><div><span class="kicker">Качество выбора</span><h2>Лучшие 10, ограничения и замены</h2><p>Сначала берите устойчивую основу зоны, затем добавляйте культуры с уходом только после проверки места.</p></div><a class="btn secondary" href="../planner.html">Проверить условия</a></div><div class="zone-v160-grid"><article><h3>Первые 10 культур зоны</h3><p>'+esc(d.base.join(', '))+'</p></article><article><h3>Не сажать без подготовки</h3><ul>'+d.avoid.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul></article><article><h3>Быстрые замены</h3><ul>'+d.swaps.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul></article><article><h3>Что проверить</h3><p>'+esc((d.signals.length?d.signals:['почву','сроки','влажность','ветер']).join(', '))+'</p></article></div>';
    var anchor=q('[data-v159-zone-pack]',root)||q('.zone-passport-card',root)||q('.zone-topic-card',root);
    if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(box,anchor.nextSibling);
  }
  function rowToItem(row,root){
    var cells=qa('td',row).map(text);
    if(!cells.length)return null;
    var name=cells[0]||'', category=cells[1]||'', rec=cells[2]||'', place=cells[3]||'', time=cells[4]||'', comment=cells.slice(5).join(' ');
    if(!name)return null;
    var source=text(q('.zone-photo-hero__content .kicker',document))||text(q('h1',document))||'Справочник зоны';
    var item={id:'pl_'+Date.now().toString(36)+'_'+hash(name+source+rec+place),name:name,category:category,recommendation:rec,place:place,timing:time,comment:comment,sourceTitle:source,sourceUrl:(location.pathname.split('/').pop()||'index.html'),userNote:'',status:'планирую',addedAt:new Date().toISOString()};
    item.sitePlace=inferSitePlace(item);
    item.sitePlaceAuto=true;
    return item;
  }
  function addVisibleGuideRows(root){
    var rows=qa('tbody tr',root).filter(function(row){return !row.hidden && row.offsetParent!==null;}).slice(0,30), items=readList(), keys={};
    items.forEach(function(i){keys[keyOf(i)]=true;});
    var added=0;
    rows.forEach(function(row){var item=rowToItem(row,root);if(!item)return;var k=keyOf(item);if(keys[k])return;keys[k]=true;items.unshift(item);added++;});
    if(added){writeList(items);document.dispatchEvent(new CustomEvent('prizh:planting-list-updated'));}
    return added;
  }
  function upgradeGuideActions(){
    var root=q('[data-culture-table]'), panel=q('[data-v159-guide-actions]',root);
    if(!root||!panel||q('[data-v160-guide-add]',panel))return;
    var btn=document.createElement('button');
    btn.type='button';btn.setAttribute('data-v160-guide-add','');btn.textContent='Добавить видимые в список';
    var wrap=q('.guide-v159-buttons',panel)||panel;wrap.appendChild(btn);
    btn.addEventListener('click',function(){
      var n=addVisibleGuideRows(root);
      btn.textContent=n?'Добавлено: '+n:'Уже в списке';
      setTimeout(function(){btn.textContent='Добавить видимые в список';},1700);
    });
  }
  function injectPlannerEmptyHint(){
    var root=q('[data-plant-planner]'); if(!root||q('[data-v160-planner-hint]',root))return;
    var empty=q('[data-planner-empty]',root)||q('.planner-empty',root); if(!empty)return;
    var box=document.createElement('div');
    box.className='planner-v160-hint';
    box.setAttribute('data-v160-planner-hint','');
    box.innerHTML='<strong>Если результатов мало</strong><span>Снимите часть условий, проверьте соседнюю зону или начните с культур для сложных участков.</span><a href="conditions.html">Открыть условия участка</a>';
    empty.appendChild(box);
  }
  function ready(fn){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn);else fn();}
  ready(function(){injectZoneDecision();upgradeGuideActions();injectPlannerEmptyHint();});
})();


/* v161: condition-combination quality layer for planner, conditions, list, season plan and calendar */
(function(){
  var KEY='prizhivetsya:planting-list:v1';
  function q(s,r){return (r||document).querySelector(s);}
  function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  function norm(v){return String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').replace(/\s+/g,' ').trim();}
  function ready(fn){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn);else fn();}
  function unique(arr){var seen={},out=[];(arr||[]).forEach(function(v){v=String(v||'').trim();if(!v)return;var k=norm(v);if(!seen[k]){seen[k]=true;out.push(v);}});return out;}
  function readList(){try{var a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
  var conditionLabels={
    clay:'тяжёлая глина',
    sand:'песчаная почва',
    lowland:'низина',
    wind:'открытый ветер',
    shade:'мало солнца',
    wet:'влажное место',
    dry:'сухой участок',
    short:'короткое лето',
    greenhouse:'есть теплица',
    cover:'готовность укрывать'
  };
  var pairRules=[
    {keys:['clay','lowland'],level:'Высокий риск',title:'Глина + низина',summary:'Вода задерживается, почва поздно прогревается, корни чаще страдают от сырости.',first:['поднять гряды','сделать водоотвод','добавить компост и разрыхлитель'],avoid:['косточковые без холма','лаванду без дренажа','поздние теплолюбивые культуры'],swap:['калина','смородина','мята','астильба']},
    {keys:['wet','shade'],level:'Средний риск',title:'Влажность + тень',summary:'Плодовые овощи дают слабый урожай, зато зелень и декоративные многолетники работают надёжнее.',first:['убрать застой воды','оставить проходы для проветривания','выбирать теневыносливые культуры'],avoid:['томат и перец в открытой тени','дыню и арбуз','лаванду в сыром месте'],swap:['хоста','астильба','мята','петрушка']},
    {keys:['sand','dry'],level:'Средний риск',title:'Песок + сухость',summary:'Почва быстро теряет влагу и питание, поэтому без мульчи часть культур резко проседает.',first:['внести органику','замульчировать гряды','наладить редкий глубокий полив'],avoid:['капусту без полива','огурец без мульчи','молодые саженцы без притенения'],swap:['тимьян','шалфей','лук','морковь']},
    {keys:['sand','wind'],level:'Средний риск',title:'Песок + ветер',summary:'Ветер усиливает пересыхание, поэтому грядкам нужны кулисы, мульча и защита молодых растений.',first:['поставить ветрозащиту','мульчировать междурядья','сажать устойчивые кустарники по краю'],avoid:['высокие цветы без опоры','огурец на открытом продуваемом месте','молодые кусты без полива'],swap:['дерен белый','бархатцы','картофель','лук']},
    {keys:['short','wind'],level:'Высокий риск',title:'Короткое лето + ветер',summary:'Рассаде сложнее стартовать, а теплолюбивые культуры требуют защиты и ранних сроков.',first:['выбрать ранние сорта','использовать укрытие','размещать рассаду у тёплой стены или кулис'],avoid:['поздний перец без теплицы','арбуз и дыню без укрытия','высокие культуры без подвязки'],swap:['редис','руккола','картофель ранний','капуста']},
    {keys:['short','shade'],level:'Высокий риск',title:'Короткое лето + тень',summary:'Сумма тепла и света ограничена, поэтому урожайные плодовые овощи лучше переносить в теплицу или на солнце.',first:['освободить самое светлое место','оставить быстрые культуры','использовать рассаду'],avoid:['баклажан','дыню','арбуз','поздний томат в открытом грунте'],swap:['зелень','редис','хоста','жимолость']},
    {keys:['wet','dry'],level:'Проверить участок',title:'Влажно и сухо одновременно',summary:'Такое сочетание часто означает разные зоны участка: низина сырая, гряда или склон пересыхает.',first:['разделить участок на микрозоны','не смешивать культуры в один список','для каждой зоны выбрать свой полив'],avoid:['единый план полива для всего участка','одинаковые грядки для сырого и сухого места'],swap:['калина для влажного места','тимьян для сухого места','мята у воды','шалфей на дренированной гряде']},
    {keys:['clay','dry'],level:'Средний риск',title:'Глина + пересыхание',summary:'После дождя почва тяжёлая, а в жару превращается в плотную корку.',first:['добавить органику','не оставлять почву голой','делать гряды с рыхлым верхним слоем'],avoid:['морковь на сырой плотной гряде','мелкие семена без рыхления','саженцы без мульчи'],swap:['капуста после подготовки','смородина','бархатцы','картофель']},
    {keys:['wet','wind'],level:'Средний риск',title:'Сырость + ветер',summary:'Растения одновременно охлаждаются и дольше остаются влажными, повышается риск болезней.',first:['оставить проветривание без сквозняка','не загущать посадки','укрепить молодые растения'],avoid:['плотные посадки томата','высокие цветы без опоры','теплолюбивые культуры без защиты'],swap:['калина','дерен белый','смородина','астильба']},
    {keys:['greenhouse','shade'],level:'Проверить место',title:'Теплица + тень',summary:'Теплица помогает с теплом, но не заменяет свет: для томата и перца нужна светлая площадка.',first:['проверить часы солнца','не ставить теплицу под деревьями','оставить тень под зелень и декоративные'],avoid:['томаты в затенённой теплице','перец без света','густые посадки'],swap:['зелень в полутени','хоста вне теплицы','огурец в светлой теплице','ранний томат на солнце']}
  ];
  var singleRules={
    clay:{first:['компост','рыхлый верхний слой','поднятые гряды'],avoid:['лаванду без дренажа'],swap:['капуста','смородина','картофель']},
    sand:{first:['мульча','органика','полив'],avoid:['капусту без полива'],swap:['морковь','тимьян','шалфей']},
    lowland:{first:['водоотвод','тёплые гряды','позднее высаживание'],avoid:['абрикос и персик в холодной яме'],swap:['калина','смородина','мята']},
    wind:{first:['кулисы','подвязка','мульча'],avoid:['высокие цветы без опоры'],swap:['дерен белый','бархатцы','картофель']},
    shade:{first:['учёт часов солнца','теневыносливые культуры'],avoid:['арбуз, дыню и баклажан'],swap:['хоста','астильба','зелень']},
    wet:{first:['дренаж','проветривание','поднятые посадки'],avoid:['лаванду и косточковые в сырости'],swap:['мята','калина','астильба']},
    dry:{first:['мульча','полив','притенение молодых посадок'],avoid:['огурец без воды'],swap:['тимьян','шалфей','лук']},
    short:{first:['ранние сорта','рассада','укрытие'],avoid:['поздние теплолюбивые культуры'],swap:['редис','руккола','ранний картофель']},
    greenhouse:{first:['проветривание','полив','контроль перегрева'],avoid:['загущение посадок'],swap:['томат','огурец','перец']},
    cover:{first:['дуги','агроволокно','контроль заморозков'],avoid:['укрывать без проветривания'],swap:['ранний томат','огурец','зелень']}
  };
  function hasAll(vals,keys){return keys.every(function(k){return vals.indexOf(k)>-1;});}
  function inferConditionsFromText(text){
    text=norm(text);var out=[];
    if(/глин|суглин|тяжел/.test(text))out.push('clay');
    if(/песк|супес/.test(text))out.push('sand');
    if(/низин|засто|холодн.*воздух/.test(text))out.push('lowland');
    if(/ветер|сухове|продув/.test(text))out.push('wind');
    if(/тень|полутен|мало солн/.test(text))out.push('shade');
    if(/влаж|сыр|болот|мокр/.test(text))out.push('wet');
    if(/сух|засух|пересых/.test(text))out.push('dry');
    if(/коротк|замороз|север|холодн.*лет/.test(text))out.push('short');
    if(/теплиц|парник/.test(text))out.push('greenhouse');
    if(/укрыт|агроволок|дуг/.test(text))out.push('cover');
    return unique(out);
  }
  function evaluate(vals){
    vals=unique(vals||[]);
    var matched=pairRules.filter(function(r){return hasAll(vals,r.keys);});
    var first=[],avoid=[],swap=[],labels=vals.map(function(v){return conditionLabels[v]||v;});
    matched.forEach(function(r){first=first.concat(r.first);avoid=avoid.concat(r.avoid);swap=swap.concat(r.swap);});
    vals.forEach(function(v){var r=singleRules[v];if(r){first=first.concat(r.first);avoid=avoid.concat(r.avoid);swap=swap.concat(r.swap);}});
    if(!matched.length && vals.length>1){
      matched.push({level:'Умеренно',title:'Сочетание условий',summary:'Критичного конфликта не видно, но место, сроки и полив лучше проверять вместе.'});
    }
    return {
      values:vals,
      labels:labels,
      rules:matched.slice(0,4),
      first:unique(first).slice(0,6),
      avoid:unique(avoid).slice(0,6),
      swap:unique(swap).slice(0,8)
    };
  }
  function panelHtml(data,emptyTitle,emptyText){
    if(!data.values.length){
      return '<div class="condition-v161-empty"><strong>'+esc(emptyTitle)+'</strong><p>'+esc(emptyText)+'</p></div>';
    }
    var rules=data.rules.length?data.rules:[{level:'Базовая проверка',title:data.labels.join(' + '),summary:'Проверьте место, сроки и уход до покупки посадочного материала.'}];
    return '<div class="condition-v161-head"><div><span class="kicker">Качество выбора</span><h2>Проверка сочетаний условий</h2><p>Отмечено: '+esc(data.labels.join(', '))+'. Ниже — что сначала улучшить и какие культуры не брать без подготовки.</p></div><span>'+data.values.length+' '+(data.values.length===1?'условие':'условия')+'</span></div>'+
      '<div class="condition-v161-grid">'+
      '<article><h3>Сочетания</h3>'+rules.map(function(r){return '<div class="condition-v161-rule"><strong>'+esc(r.title)+'</strong><em>'+esc(r.level)+'</em><p>'+esc(r.summary)+'</p></div>';}).join('')+'</article>'+
      '<article><h3>Сначала улучшить</h3><ul>'+data.first.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul></article>'+
      '<article><h3>Не сажать без подготовки</h3><ul>'+data.avoid.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul></article>'+
      '<article><h3>Простые замены</h3><p>'+esc(data.swap.join(', ') || 'зелень, ранние сорта, устойчивые кустарники')+'</p></article>'+
      '</div>';
  }
  function ensurePanel(anchor, cls, attr){
    if(!anchor||!anchor.parentNode)return null;
    var old=q('['+attr+']',anchor.parentNode)||q('['+attr+']',document);
    if(old)return old;
    var box=document.createElement('section');box.className=cls;box.setAttribute(attr,'');
    anchor.parentNode.insertBefore(box, anchor.nextSibling);
    return box;
  }
  function plannerValues(root){return qa('[data-planner-condition]:checked',root).map(function(ch){return ch.value;});}
  function updatePlannerQuality(){
    var root=q('[data-plant-planner]'); if(!root)return;
    var anchor=q('[data-planner-site-check]',root)||q('.planner-condition-fieldset',root);
    var box=ensurePanel(anchor,'condition-v161-panel planner-v161-quality','data-v161-planner-quality'); if(!box)return;
    box.innerHTML=panelHtml(evaluate(plannerValues(root)),'Отметьте условия участка','Панель покажет конфликтные сочетания: вроде глина + низина, тень + влажность или короткое лето + ветер.');
  }
  function updateConditionsQuality(){
    var root=q('[data-condition-guide]'); if(!root)return;
    var anchor=q('[data-condition-result]',root)||q('.condition-picker',root);
    var box=ensurePanel(anchor,'condition-v161-panel conditions-v161-quality','data-v161-conditions-quality'); if(!box)return;
    var vals=qa('.condition-picker input[type="checkbox"]:checked',root).map(function(ch){return ch.value;});
    box.innerHTML=panelHtml(evaluate(vals),'Выберите два-три признака участка','После выбора появится матрица: что улучшить первым, какие культуры заменить и где открыть подбор.');
    var actions=q('.condition-v161-actions',box);
    if(!actions && vals.length){
      var qs=vals.map(function(v){return 'condition='+encodeURIComponent(v);}).join('&');
      var p=document.createElement('p');p.className='condition-v161-actions';p.innerHTML='<a class="btn primary" href="planner.html?'+qs+'">Открыть подбор с проверкой сочетаний</a><a class="btn secondary" href="season-plan.html">Перейти к плану сезона</a>';
      box.appendChild(p);
    }
  }
  function activeItems(){return readList().filter(function(i){return (i.status||'планирую')!=='убрать';});}
  function valuesFromList(){
    var text=activeItems().map(function(i){return [i.name,i.category,i.recommendation,i.place,i.sitePlace,i.timing,i.comment,i.userNote,i.sourceTitle].join(' ');}).join(' ');
    return inferConditionsFromText(text);
  }
  function updateListConditionPanel(){
    var root=q('[data-planting-list-page]'); if(!root)return;
    var anchor=q('[data-v159-list-quality]',root)||q('[data-planting-summary]',root)||q('.planting-panel',root);
    var box=ensurePanel(anchor,'condition-v161-panel list-v161-quality','data-v161-list-quality'); if(!box)return;
    var data=evaluate(valuesFromList());
    var html=panelHtml(data,'Список пока без явных рисков участка','Когда в заметках, местах или рекомендациях появятся тень, низина, ветер, глина, песок или укрытие, здесь будет короткая проверка сочетаний.');
    html+='<p class="condition-v161-note">Подсказка берёт признаки из названий, мест посадки, заметок и рекомендаций в вашем списке.</p>';
    box.innerHTML=html;
  }
  function updateSeasonConditionPanel(){
    var root=q('[data-season-plan-page]'); if(!root)return;
    var anchor=q('[data-v159-season-focus]',root)||q('[data-season-summary]',root)||q('.season-actions',root);
    var box=ensurePanel(anchor,'condition-v161-panel season-v161-quality','data-v161-season-quality'); if(!box)return;
    var data=evaluate(valuesFromList());
    box.innerHTML=panelHtml(data,'План ждёт культур и условий','Добавьте культуры в список и уточните место посадки — план покажет, какие сочетания требуют подготовки.');
  }
  function calendarValues(root){
    var text=[
      q('[data-calendar-summary]',root),
      q('[data-calendar-risk]',root),
      q('[data-calendar-basis]',root),
      q('[data-calendar-care]',root),
      q('[data-calendar-title]',root)
    ].map(function(el){return el?el.textContent:'';}).join(' ');
    var vals=inferConditionsFromText(text);
    var zone=q('[data-calendar-zone]',root);
    if(zone&&zone.selectedIndex>0) vals=unique(vals.concat(inferConditionsFromText(zone.options[zone.selectedIndex].textContent)));
    return vals;
  }
  function updateCalendarConditionPanel(){
    var root=q('[data-zone-calendar]'); if(!root)return;
    var anchor=q('[data-calendar-next]',root)||q('[data-calendar-result]',root)||q('.calendar-panel',root);
    var box=ensurePanel(anchor,'condition-v161-panel calendar-v161-quality','data-v161-calendar-quality'); if(!box)return;
    var data=evaluate(calendarValues(root));
    box.innerHTML=panelHtml(data,'Выберите регион и зону','После выбора зоны календарь покажет, какие риски стоит учитывать вместе со сроками работ.');
  }
  function bind(){
    updatePlannerQuality();updateConditionsQuality();updateListConditionPanel();updateSeasonConditionPanel();updateCalendarConditionPanel();
    var planner=q('[data-plant-planner]'); if(planner) planner.addEventListener('change',function(e){if(e.target&&e.target.matches('[data-planner-condition]'))updatePlannerQuality();});
    var cond=q('[data-condition-guide]'); if(cond) cond.addEventListener('change',function(){setTimeout(updateConditionsQuality,20);});
    var cal=q('[data-zone-calendar]'); if(cal){cal.addEventListener('change',function(){setTimeout(updateCalendarConditionPanel,120);});cal.addEventListener('prizh:calendar-rendered',function(){setTimeout(updateCalendarConditionPanel,40);});}
    document.addEventListener('prizh:calendar-rendered',function(){setTimeout(updateCalendarConditionPanel,40);});
    document.addEventListener('prizh:planting-list-updated',function(){setTimeout(function(){updateListConditionPanel();updateSeasonConditionPanel();},120);});
  }
  ready(bind);
})();

/* v162: culture decision layer — where not to plant, common mistakes and safer swaps */
(function(){
  var KEY='prizhivetsya:planting-list:v1';
  function q(s,r){return (r||document).querySelector(s);}
  function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function ready(fn){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn);else fn();}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  function norm(v){return String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').replace(/\s+/g,' ').trim();}
  function uniq(arr){var seen={},out=[];(arr||[]).forEach(function(v){v=String(v||'').trim();if(!v)return;var k=norm(v);if(!seen[k]){seen[k]=true;out.push(v);}});return out;}
  function copyText(t){if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(t);var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();return Promise.resolve();}
  var exactProfiles={
    'томат':{bad:['холодная открытая гряда без укрытия','сырой угол теплицы без проветривания','низина с поздними заморозками'],mistake:'Высадка в непрогретую почву и загущение теплицы. Даже хороший сорт проседает, если ночью холодно, а воздух стоит влажный.',swap:['ранний детерминантный томат под дуги','фасоль кустовая','кабачок','зелень'],check:['теплица или дуги готовы','есть проветривание','почва прогрелась','полив без застоя у корней']},
    'огурец':{bad:['сухой песок без мульчи и воды','продуваемая гряда','холодная почва в начале сезона'],mistake:'Нерегулярный полив и перепады температуры. Огурец быстро реагирует горечью, остановкой роста и болезнями.',swap:['кабачок','тыква','фасоль кустовая','руккола ранней весной'],check:['есть тёплая гряда','полив продуман заранее','ветер закрыт','посадки не загущены']},
    'картофель':{bad:['застойная низина','тяжёлая мокрая глина без рыхления','участок после паслёновых с накопленными болезнями'],mistake:'Посадка в холодную переувлажнённую почву и отсутствие окучивания. Клубни хуже стартуют и чаще страдают от гнилей.',swap:['свёкла','лук репчатый','морковь','фасоль кустовая'],check:['есть рыхлый слой','семенной материал здоровый','срок не слишком ранний','рядки удобно окучивать']},
    'яблоня':{bad:['морозобойная низина','место с близкой водой','сильный ветер без защиты'],mistake:'Покупка нерайонированного саженца и заглубление корневой шейки. Дерево может долго болеть даже при хорошем уходе.',swap:['жимолость','смородина чёрная','калина','ирга'],check:['сорт районирован','корневая шейка выше уровня почвы','есть опора','место не затапливается']},
    'фасоль кустовая':{bad:['холодная мокрая почва','плотная тень','место после свежего навоза'],mistake:'Слишком ранний посев в холодную землю. Семена могут загнить до всходов.',swap:['горох','редис','лук на перо','кабачок'],check:['почва тёплая','место солнечное','рядки не загущены','есть лёгкая опора при необходимости']},
    'слива':{bad:['низина с возвратными заморозками','сырой участок без дренажа','открытый ветер на цветении'],mistake:'Выбор слабозимостойкого сорта и посадка в место, где весной застаивается холодный воздух.',swap:['алыча зимостойких сортов','вишня районированная','жимолость','смородина'],check:['есть опылитель','место приподнято','сорт подходит зоне','ствол защищён от морозобоин']},
    'лаванда':{bad:['сырая глина','низина с зимним выпреванием','полутень и застой воды'],mistake:'Посадка во влажную питательную почву без дренажа. Лаванда чаще погибает не от бедной земли, а от сырости.',swap:['тимьян','шалфей','котовник','бархатцы'],check:['есть солнце','почва лёгкая и дренированная','нет зимнего застоя воды','укрытие не запирает влагу']},
    'гортензия':{bad:['жаркий сухой край без полива','щелочная почва без подготовки','ветреное место с пересыханием'],mistake:'Недостаток влаги и неправильная кислотность. Куст живёт, но цветение и окраска становятся слабее.',swap:['астильба','хоста','калина','дерен белый'],check:['есть полутень','полив доступен','почва слабокислая','мульча уложена']},
    'мята':{bad:['сухой песок без воды','общая грядка без ограничения корней','глухая тень без проветривания'],mistake:'Посадка без ограничителя. Мята быстро расползается и мешает соседним культурам.',swap:['мелисса','тимьян','шалфей','петрушка'],check:['корни ограничены','место умеренно влажное','есть доступ для срезки','соседи не будут вытеснены']},
    'тимьян':{bad:['сырая тяжёлая почва','низина','жирная грядка с частым поливом'],mistake:'Избыточный уход и влажность. Тимьяну важнее солнце и дренаж, чем богатая почва.',swap:['шалфей','лаванда в тёплой зоне','бархатцы','лук'],check:['солнце большую часть дня','дренаж есть','полив умеренный','зимняя сырость исключена']},
    'шалфей':{bad:['сырая низина','тяжёлая глина без дренажа','глубокая тень'],mistake:'Посадка в холодную влажную почву. Куст хуже зимует и быстро редеет.',swap:['тимьян','мята для влажного места','бархатцы','петрушка'],check:['место тёплое','почва не мокнет зимой','куст не загущён','есть солнце']},
    'хоста':{bad:['жаркое сухое солнце','песок без полива','место с постоянным ветром'],mistake:'Сажают как засухоустойчивое растение, хотя хоста лучше раскрывается во влажной полутени.',swap:['астильба','бадан','мята','папоротники'],check:['полутень есть','почва держит влагу','мульча уложена','листья не обгорают']},
    'астильба':{bad:['сухой солнечный склон','песок без полива','жаркое место у стены'],mistake:'Недооценка потребности во влаге. На сухом месте цветение быстро мельчает.',swap:['хоста','мята','калина','гортензия при поливе'],check:['влажная почва','полутень','мульча','нет пересыхания в июле']},
    'дерен белый':{bad:['совсем сухой песок без полива в первый год','место без пространства для куста','глухая тень, где теряется окраска побегов'],mistake:'Не учитывают размер взрослого куста. Без обрезки дерен быстро становится слишком крупным.',swap:['спирея','калина','смородина','бархатцы для временного заполнения'],check:['есть место для кроны','полив на первый сезон','понятна схема обрезки','куст не закрывает проход']}
  };
  var categoryProfiles={
    'огород и теплица':{bad:['холодная почва','продуваемая гряда','теплица без проветривания'],mistake:'Слишком ранняя высадка и загущение посадок. Для овощей важны не только сроки, но и температура почвы.',swap:['кабачок','фасоль кустовая','зелень','редис'],check:['срок по зоне','полив','проветривание','укрытие на холодные ночи']},
    'овощи и корнеплоды':{bad:['тяжёлая корка после дождя','пересыхающий песок','грядка без севооборота'],mistake:'Не подготовлена почва. Корнеплоды особенно страдают от плотного слоя и резких перепадов влаги.',swap:['лук','редис','свёкла','картофель'],check:['почва рыхлая','влага ровная','нет свежего навоза','рядки удобно пропалывать']},
    'бахчевые и тыквенные':{bad:['короткое холодное лето без укрытия','сырая низина','тень'],mistake:'Ставка на поздние сорта без запаса тепла. Лучше начинать с ранних форм и тёплого места.',swap:['кабачок','тыква ранняя','огурец под укрытием','фасоль кустовая'],check:['самое тёплое место','рассада или укрытие','мульча','защита от холодных ночей']},
    'сад, ягоды и плодовые':{bad:['низина с застоем воды','место с близкой водой','сильный ветер без защиты'],mistake:'Покупка саженца без проверки зимостойкости и места. Ошибка проявляется не сразу, а через несколько сезонов.',swap:['жимолость','смородина','калина','ирга'],check:['районированность','корневая шейка','дренаж','защита от ветра']},
    'зелень и пряные':{bad:['пересушенная грядка','жара без притенения','тяжёлая мокрая почва для средиземноморских трав'],mistake:'Все пряные культуры сажают одинаково. Укроп и мята любят влагу, тимьян и шалфей требуют дренажа.',swap:['укроп','петрушка','руккола','мята или тимьян по влажности'],check:['влага','солнце или полутень','срезка','повторный посев']},
    'цветы и декоративные растения':{bad:['место без учёта солнца','застой воды у корней','ветер для высоких цветоносов'],mistake:'Выбирают по цветению, а не по условиям. Декоративность держится только там, где совпали свет, влага и почва.',swap:['бархатцы','хоста','астильба','дерен белый'],check:['свет','влажность','зимовка','размер взрослого растения']},
    'полезные растения':{bad:['случайный край участка без ухода','место, где растение будет мешать проходу','пересыхание в первый год'],mistake:'Сажают как вспомогательную культуру и забывают про контроль роста, полив и обрезку.',swap:['калина','мята','бархатцы','дерен белый'],check:['роль на участке','контроль роста','полив на старт','совместимость с соседями']}
  };
  function profileFor(name,cat){
    var k=norm(name), c=norm(cat), exact=exactProfiles[k];
    if(exact)return exact;
    var base=categoryProfiles[c]||categoryProfiles['огород и теплица'];
    return base;
  }
  function cultureName(){var h=q('.culture-detail-hero h1')||q('h1');return h?String(h.textContent||'').trim():'';}
  function cultureCategory(){var k=q('.culture-detail-hero .kicker')||q('.culture-card__category')||q('.kicker');return k?String(k.textContent||'').trim():'';}
  function injectCultureDecision(){
    var main=q('.culture-main'); if(!main || !document.body.classList.contains('culture-detail') || q('[data-v162-culture-decision]'))return;
    var name=cultureName(), cat=cultureCategory(), p=profileFor(name,cat);
    if(!name||!p)return;
    var box=document.createElement('section');
    box.className='culture-v162-decision';
    box.setAttribute('data-v162-culture-decision','');
    box.innerHTML='<div class="culture-v162-head"><div><span class="kicker">Практическая проверка</span><h2>Где не сажать и чем заменить</h2><p>Блок помогает быстро решить, стоит ли оставлять культуру в плане или выбрать более спокойную замену для сложного места.</p></div><button type="button" class="button-soft" data-v162-copy-check>Скопировать проверку</button></div>'+ 
      '<div class="culture-v162-grid">'+
      '<article><h3>Где не сажать</h3><ul>'+p.bad.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul></article>'+ 
      '<article><h3>Частая ошибка</h3><p>'+esc(p.mistake)+'</p></article>'+ 
      '<article><h3>Замены в плохих условиях</h3><p>'+esc(p.swap.join(', '))+'</p></article>'+ 
      '<article><h3>Перед покупкой</h3><ul>'+p.check.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul></article>'+ 
      '</div><p class="culture-v162-note">Для точного решения всё равно сверяйте региональную зону: один и тот же сорт может вести себя по-разному в низине, на ветру и в теплице.</p>';
    var anchor=q('.culture-plant-check-card',main)||q('.culture-action-panel',main)||q('.culture-detail-hero',main);
    if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(box,anchor.nextSibling);else main.appendChild(box);
    var btn=q('[data-v162-copy-check]',box);
    if(btn)btn.addEventListener('click',function(){
      var text='Проверка культуры: '+name+'\nГде не сажать: '+p.bad.join('; ')+'\nЧастая ошибка: '+p.mistake+'\nЗамены: '+p.swap.join(', ')+'\nПеред покупкой: '+p.check.join('; ');
      copyText(text).then(function(){btn.textContent='Скопировано';setTimeout(function(){btn.textContent='Скопировать проверку';},1500);});
    });
  }
  var sets={
    shade:{title:'Для тени и влажной полутени',names:['Хоста','Астильба','Мята','Гортензия','Калина','Петрушка','Щавель']},
    dry:{title:'Для сухого солнечного места',names:['Тимьян','Шалфей','Лаванда','Лук репчатый','Морковь','Облепиха','Бархатцы']},
    beginner:{title:'Для первого спокойного сезона',names:['Кабачок','Картофель','Редис','Укроп','Фасоль кустовая','Бархатцы','Руккола','Кинза']},
    risky:{title:'Сначала проверить по зоне',names:['Абрикос','Персик','Черешня','Виноград укрывной','Арбуз','Дыня','Баклажан','Грецкий орех']}
  };
  function countWord(n){n=Math.abs(Number(n)||0)%100;var n1=n%10;if(n>10&&n<20)return 'культур';if(n1===1)return 'культура';if(n1>1&&n1<5)return 'культуры';return 'культур';}
  function injectCultureSituations(){
    var root=q('[data-culture-index]'); if(!root||q('[data-v162-situations]',root))return;
    var box=document.createElement('section');
    box.className='culture-v162-situations';
    box.setAttribute('data-v162-situations','');
    box.innerHTML='<div><span class="kicker">Быстрые подборки</span><h2>Выбрать по ситуации участка</h2><p>Фильтры помогают не искать культуру по названию, а начать с условий: тень, сухость, первый сезон или рискованные посадки.</p></div><div class="culture-v162-situation-buttons"><button type="button" data-v162-set="shade">Тень и влажность</button><button type="button" data-v162-set="dry">Сухое солнце</button><button type="button" data-v162-set="beginner">Первый сезон</button><button type="button" data-v162-set="risky">Проверить по зоне</button><button type="button" data-v162-set="all">Показать все</button></div><p class="culture-v162-set-note" data-v162-set-note></p>';
    var anchor=q('.culture-compare-panel',root)||q('.culture-tools',root)||q('.culture-hero',root);
    if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(box,anchor.nextSibling);
    var cards=qa('[data-culture-card]',root), note=q('[data-v162-set-note]',box), search=q('[data-culture-search]',root), category=q('[data-culture-category]',root), reliability=q('[data-culture-reliability]',root), count=q('[data-culture-count]',root);
    function showAll(){cards.forEach(function(c){c.classList.remove('culture-hidden','culture-v162-hit');});if(search)search.value='';if(category)category.value='';if(reliability)reliability.value='';if(count)count.textContent=cards.length+' '+countWord(cards.length);if(note)note.textContent='Показан полный каталог. Для точности откройте культуру и сверяйте её с зоной.';}
    function applySet(key){
      if(key==='all'){showAll();return;}
      var set=sets[key];if(!set)return;
      var names=set.names.map(norm), visible=0;
      if(search)search.value='';if(category)category.value='';if(reliability)reliability.value='';
      cards.forEach(function(c){var n=norm(c.getAttribute('data-name')||c.textContent);var ok=names.indexOf(n)>-1;c.classList.toggle('culture-hidden',!ok);c.classList.toggle('culture-v162-hit',ok);if(ok)visible++;});
      if(count)count.textContent=visible+' '+countWord(visible);
      if(note)note.textContent=set.title+': показаны '+visible+' '+countWord(visible)+'. Это стартовая подборка, итоговое решение зависит от региона и зоны.';
    }
    box.addEventListener('click',function(e){var b=e.target.closest('[data-v162-set]');if(!b)return;applySet(b.getAttribute('data-v162-set'));});
  }
  ready(function(){injectCultureDecision();injectCultureSituations();});
})();

/* v163: smarter route from saved culture to list, plan and calendar */
(function(){
  var KEY='prizhivetsya:planting-list:v1';
  function q(s,r){return (r||document).querySelector(s);}
  function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function ready(fn){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn);else fn();}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  function norm(v){return String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').replace(/\s+/g,' ').trim();}
  function readList(){try{var a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
  function active(items){return (items||[]).filter(function(i){return (i.status||'планирую')!=='убрать';});}
  function isAutoPlace(i){return !i.sitePlace || i.sitePlaceAuto===true || /выбрать|уточн|не указан/.test(norm([i.sitePlace,i.place,i.comment,i.userNote].join(' ')));}
  function isAttention(i){return isAutoPlace(i) || /риск|укрыт|уход|провер|замороз|ветер|низин|сыр|сух|глин|песок|дренаж/i.test([i.recommendation,i.comment,i.timing,i.userNote,i.place,i.sourceTitle].join(' '));}
  function seasonOf(i){var t=norm([i.timing,i.comment,i.userNote,i.status,i.sourceTitle].join(' '));if(/феврал|март|апрел|май|рассад|посев|высад/.test(t))return 'весна';if(/июн|июл|август|полив|мульч|сбор|уход/.test(t))return 'лето';if(/сент|окт|ноябр|укрыт|зим|убор|подготов/.test(t))return 'осень';if(/декабр|январ/.test(t))return 'зима';return 'срок уточнить';}
  function matchCultureName(name,item){return norm(name) && norm(item&&item.name)===norm(name);}
  function cultureName(){var h=q('.culture-detail-hero h1')||q('h1');return h?String(h.textContent||'').trim():'';}
  function ensureAfter(anchor,cls,attr){if(!anchor||!anchor.parentNode)return null;var old=q('['+attr+']');if(old)return old;var box=document.createElement('section');box.className=cls;box.setAttribute(attr,'');anchor.parentNode.insertBefore(box,anchor.nextSibling);return box;}
  function stepCard(title,text,state){return '<article class="'+(state||'')+'"><strong>'+esc(title)+'</strong><p>'+esc(text)+'</p></article>';}
  function injectCultureRoute(){
    var main=q('.culture-main'); if(!main || !document.body.classList.contains('culture-detail'))return;
    var anchor=q('[data-v162-culture-decision]',main)||q('.culture-action-panel',main)||q('.culture-detail-hero',main);
    var box=ensureAfter(anchor,'culture-v163-route','data-v163-culture-route'); if(!box)return;
    var name=cultureName(), items=readList(), saved=items.some(function(i){return matchCultureName(name,i);});
    box.innerHTML='<div class="culture-v163-head"><div><span class="kicker">После выбора</span><h2>Маршрут культуры в рабочий план</h2><p>'+(saved?'Культура уже есть в личном списке. Осталось подтвердить место, статус и сроки.':'Добавьте культуру в список, затем проверьте её в плане сезона и календаре зоны.')+'</p></div><span class="culture-v163-state">'+(saved?'В списке':'Ещё не добавлена')+'</span></div><div class="culture-v163-steps">'+stepCard('1. Список','Укажите место посадки, статус и личную заметку.',saved?'is-done':'')+stepCard('2. План сезона','Проверьте готовность, карту посадок и список покупок.',saved?'':'is-muted')+stepCard('3. Календарь','Выберите регион и зону, затем включите фильтр по моему списку.',saved?'':'is-muted')+'</div><div class="culture-v163-actions"><a class="btn secondary" href="../planting-list.html">Мой список</a><a class="btn secondary" href="../season-plan.html">План сезона</a><a class="btn secondary" href="../calendar.html">Календарь</a></div>';
  }
  function renderListRoute(){
    var root=q('[data-planting-list-page]'); if(!root)return;
    var anchor=q('[data-v159-list-quality]',root)||q('[data-planting-nearest]',root)||q('.planting-toolbar',root)||q('.planting-hero',root);
    var box=ensureAfter(anchor,'planting-v163-route','data-v163-list-route'); if(!box)return;
    var items=active(readList()), noPlace=items.filter(isAutoPlace), attention=items.filter(isAttention), noNote=items.filter(function(i){return !String(i.userNote||'').trim();}), planned=items.filter(function(i){return (i.status||'планирую')==='планирую';});
    if(!items.length){box.innerHTML='<span class="kicker">Рабочий маршрут</span><h2>Список пока пуст</h2><p>Добавьте культуры из каталога, подбора или справочника зоны — после этого появится проверка незаполненных полей.</p><div class="planting-v163-actions"><a class="btn primary" href="planner.html">Открыть подбор</a><a class="btn secondary" href="cultures/index.html">Каталог культур</a></div>';return;}
    box.innerHTML='<div class="planting-v163-head"><div><span class="kicker">Рабочий маршрут</span><h2>Что заполнить перед планом</h2><p>Список уже сохранён в браузере. Чем точнее место и заметки, тем полезнее печать, карта посадок и календарь.</p></div><a class="btn primary" href="season-plan.html">Открыть план</a></div><div class="planting-v163-grid"><button type="button" data-v163-list-mode="no-place"><strong>'+noPlace.length+'</strong><span>подтвердить место</span></button><button type="button" data-v163-list-mode="attention"><strong>'+attention.length+'</strong><span>проверить риск</span></button><button type="button" data-v163-list-mode="planned"><strong>'+planned.length+'</strong><span>перевести по статусу</span></button><button type="button" data-v163-list-mode="notes"><strong>'+noNote.length+'</strong><span>добавить заметки</span></button></div><p class="planting-v163-note">Быстрые кнопки включают существующие фильтры списка и помогают подготовить данные для плана сезона.</p>';
  }
  function bindListRoute(){
    var root=q('[data-planting-list-page]'); if(!root)return;
    root.addEventListener('click',function(e){var b=e.target.closest('[data-v163-list-mode]');if(!b)return;var mode=b.getAttribute('data-v163-list-mode');var search=q('[data-planting-filter-search]',root),place=q('[data-planting-filter-place]',root),status=q('[data-planting-filter-status]',root),rec=q('[data-planting-filter-rec]',root);if(mode==='notes'){root.setAttribute('data-planting-quick-mode','notes');[search,place,status,rec].forEach(function(el){if(el)el.value='';});if(search)search.dispatchEvent(new Event('input',{bubbles:true}));return;}var old=q('[data-planting-quick="'+mode+'"]',root);if(old)old.click();});
  }
  function renderSeasonRoute(){
    var root=q('[data-season-plan-page]'); if(!root)return;
    var anchor=q('[data-season-checklist]',root)||q('[data-v159-season-focus]',root)||q('[data-season-summary]',root)||q('.season-toolbar',root);
    var box=ensureAfter(anchor,'season-v163-route','data-v163-season-route'); if(!box)return;
    var items=active(readList());
    if(!items.length){box.innerHTML='<span class="kicker">Следующий шаг</span><h2>Добавьте культуры в список</h2><p>План сезона строится из личного списка и появляется сразу после сохранения первых культур.</p>';return;}
    var rows=items.map(function(i){var tasks=[];if(isAutoPlace(i))tasks.push('подтвердить место');if((i.status||'планирую')==='планирую')tasks.push('обновить статус');if(!String(i.userNote||'').trim())tasks.push('добавить заметку');if(isAttention(i))tasks.push('сверить риск');if(!tasks.length)tasks.push('сверить календарь');return {name:i.name||'Культура',place:i.sitePlace||i.place||'место уточнить',season:seasonOf(i),tasks:tasks};});
    rows.sort(function(a,b){return b.tasks.length-a.tasks.length||a.name.localeCompare(b.name,'ru');});
    box.innerHTML='<div class="season-v163-head"><div><span class="kicker">По культурам</span><h2>Что осталось заполнить</h2><p>Панель показывает ближайшее действие по каждой позиции, чтобы план был готов к печати и выезду на участок.</p></div><a class="btn secondary" href="planting-list.html">Редактировать список</a></div><div class="season-v163-list">'+rows.slice(0,8).map(function(r){return '<article><strong>'+esc(r.name)+'</strong><span>'+esc(r.place)+' · '+esc(r.season)+'</span><p>'+esc(r.tasks.slice(0,3).join(', '))+'</p></article>';}).join('')+'</div><div class="season-v163-actions"><a class="btn secondary" href="calendar.html">Сверить календарь</a><a class="btn secondary" href="planting-list.html">Заполнить список</a></div>';
  }
  function renderCalendarRoute(){
    var root=q('[data-zone-calendar]'); if(!root)return;
    var anchor=q('[data-calendar-next]',root)||q('[data-calendar-result]',root)||q('.calendar-panel',root);
    var box=ensureAfter(anchor,'calendar-v163-route','data-v163-calendar-route'); if(!box)return;
    var items=active(readList()), visible=qa('.calendar-task-list li',root).length, only=q('[data-calendar-my-list]',root), zone=q('[data-calendar-zone]',root), zoneReady=zone&&zone.value!=='';
    box.innerHTML='<div><span class="kicker">Связь с планом</span><h2>Календарь по личному списку</h2><p>'+(items.length?'В списке '+items.length+' культур. После выбора зоны включите личный фильтр, чтобы убрать лишние работы.':'Личный список пуст, поэтому календарь показывает только общие работы зоны.')+'</p></div><div class="calendar-v163-grid"><article><strong>'+items.length+'</strong><span>культур в списке</span></article><article><strong>'+(zoneReady?'выбрана':'не выбрана')+'</strong><span>зона календаря</span></article><article><strong>'+visible+'</strong><span>видимых задач</span></article><article><strong>'+(only&&only.checked?'включён':'выключен')+'</strong><span>фильтр списка</span></article></div><div class="calendar-v163-actions"><a class="btn secondary" href="season-plan.html">Открыть план</a><a class="btn secondary" href="planting-list.html">Проверить список</a></div>';
  }
  function refresh(){injectCultureRoute();renderListRoute();renderSeasonRoute();renderCalendarRoute();}
  ready(function(){refresh();bindListRoute();document.addEventListener('prizh:planting-list-updated',function(){setTimeout(refresh,100);});document.addEventListener('prizh:calendar-rendered',function(){setTimeout(refresh,80);});['change','click','input'].forEach(function(ev){document.addEventListener(ev,function(e){if(e.target&&e.target.closest('[data-zone-calendar],[data-season-plan-page],[data-planting-list-page]'))setTimeout(refresh,180);});});});
})();
/* v165: linked season plan, personal calendar layer and route helpers without observers */
(function(){
  var KEY='prizhivetsya:planting-list:v1';
  function q(s,r){return (r||document).querySelector(s);}
  function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function ready(fn){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fn);else fn();}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  function norm(v){return String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').replace(/\s+/g,' ').trim();}
  function readList(){try{var a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
  function writeList(items){try{if(!items.length)localStorage.removeItem(KEY);else localStorage.setItem(KEY,JSON.stringify(items));return true;}catch(e){return false;}}
  function active(items){return (items||[]).filter(function(i){return (i.status||'планирую')!=='убрать';});}
  function plural(n,one,few,many){n=Math.abs(Number(n)||0)%100;var n1=n%10;if(n>10&&n<20)return many;if(n1>1&&n1<5)return few;if(n1===1)return one;return many;}
  function copyText(text){if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(text);var ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);return Promise.resolve();}
  function download(name,text){var blob=new Blob([text],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},800);}
  function notify(box,text){if(!box)return;box.hidden=false;box.textContent=text;setTimeout(function(){box.hidden=true;},2200);}
  function ensureAfter(anchor,cls,attr){if(!anchor||!anchor.parentNode)return null;var old=q('['+attr+']');if(old)return old;var box=document.createElement('section');box.className=cls;box.setAttribute(attr,'');anchor.parentNode.insertBefore(box,anchor.nextSibling);return box;}
  function ensureBefore(anchor,cls,attr){if(!anchor||!anchor.parentNode)return null;var old=q('['+attr+']');if(old)return old;var box=document.createElement('section');box.className=cls;box.setAttribute(attr,'');anchor.parentNode.insertBefore(box,anchor);return box;}
  function placeOf(i){return i.sitePlace||i.place||'место не указано';}
  function isAutoPlace(i){return i.autoPlace===true||i.sitePlaceAuto===true||!i.sitePlace||/выбрать|уточн|не указан/.test(norm([i.sitePlace,i.place,i.comment,i.userNote].join(' ')));}
  function isRisk(i){return /риск|укрыт|уход|провер|замороз|ветер|низин|сыр|сух|глин|песок|дренаж|теплиц/i.test([i.recommendation,i.comment,i.timing,i.userNote,i.place,i.sourceTitle].join(' '));}
  function seasonOf(i){var t=norm([i.name,i.category,i.timing,i.comment,i.userNote,i.status,i.sourceTitle].join(' '));if(/декабр|январ|феврал|зим/.test(t))return 'Зима';if(/сент|окт|ноябр|осен|укрыт|подготов|убор/.test(t))return 'Осень';if(/июн|июл|август|лет|полив|мульч|сбор|уход/.test(t))return 'Лето';if(/март|апрел|май|весн|рассад|посев|высад/.test(t))return 'Весна';return 'Срок уточнить';}
  function windowOf(i){var t=norm([i.name,i.category,i.timing,i.comment,i.userNote,i.sourceTitle].join(' '));if(/март|ранн|рассад|посев|семен|редис|зелень|томат|перец|баклажан/.test(t))return 'март–апрель';if(/апрел|сажен|картоф|лук|капуст|морков|свекл|сад|ягод/.test(t))return 'апрель–май';if(/май|высад|теплиц|огурец|кабачок|тыква|фасол|кукуруз/.test(t))return 'май–июнь';if(/июн|июл|август|лет|полив|мульч|сбор|подвяз/.test(t))return 'лето';if(/сент|окт|ноябр|осен|зим|укрыт|убор|подготов/.test(t))return 'осень';return 'март–апрель';}
  function actionType(i){var t=norm([i.name,i.category,i.timing,i.comment,i.userNote,i.sourceTitle].join(' '));if(/сбор|урожай|убор/.test(t))return 'сбор';if(/зим|осен|укрыт|подготов|побелк|мульч/.test(t))return 'подготовка';if(/высад|сажен|посадк|картоф|лук|чеснок|земляник/.test(t))return 'высадка';if(/рассад|семен|посев|сеять|редис|морков|свекл|укроп|салат/.test(t))return 'посев';return 'уход';}
  function seasonalChecklistText(season){
    var data={
      'Весна':['Проверить семена, рассаду, саженцы и укрытия.','Разметить грядки, теплицу, сад, клумбу и контейнеры.','Сверить ранние посевы и высадку с календарём зоны.','Отложить рискованные культуры до тёплого окна.'],
      'Лето':['Проверить полив, мульчу и проветривание теплицы.','Подвязать высокие культуры и закрыть посадки от ветра.','Отмечать сбор и уход в личных заметках.','Удалять слабые позиции из активного плана.'],
      'Осень':['Собрать урожай и закрыть поздние работы.','Подготовить многолетники, плодовые и ягодники к зиме.','Записать удачные сорта и неудачные места.','Освободить грядки и внести органику там, где это нужно.'],
      'Зима':['Разобрать личный список и оставить нужные культуры.','Проверить семена, посадочный материал и укрывные материалы.','Подобрать замены для рискованных позиций.','Составить список покупок до начала сезона.']
    };
    return season&&data[season]?data[season]:[].concat(data['Весна'],data['Лето'],data['Осень'],data['Зима']);
  }
  function migrateAutoPlace(){
    var items=readList(),changed=false;
    items.forEach(function(i){
      if(i.autoPlace===false&&i.sitePlaceAuto!==false){i.sitePlaceAuto=false;changed=true;}
      if(i.sitePlaceAuto===false&&i.autoPlace!==false){i.autoPlace=false;changed=true;}
      if(i.sitePlaceAuto===true&&i.autoPlace!==true){i.autoPlace=true;changed=true;}
    });
    if(changed)writeList(items);
  }
  function syncManualPlaceChange(){
    var root=q('[data-planting-list-page]'); if(!root)return;
    root.addEventListener('change',function(e){
      var field=e.target.closest('[data-planting-place]'); if(!field)return;
      var id=field.getAttribute('data-planting-place'),items=readList(),changed=false;
      items.forEach(function(i){if(i.id===id){i.sitePlace=field.value;i.sitePlaceAuto=false;i.autoPlace=false;changed=true;}});
      if(changed){writeList(items);document.dispatchEvent(new CustomEvent('prizh:planting-list-updated'));}
    });
  }
  function renderSeasonV165(){
    var root=q('[data-season-plan-page]'); if(!root)return;
    var anchor=q('.season-toolbar',root)||q('.season-actions',root)||q('.season-hero',root);
    var box=ensureAfter(anchor,'season-v165-board','data-v165-season-board'); if(!box)return;
    var all=active(readList()), sel=q('[data-season-filter]',root), chosen=root.getAttribute('data-v165-season-current')||(sel&&sel.value?sel.value:'');
    var shown=chosen?all.filter(function(i){return seasonOf(i)===chosen;}):all;
    var check=seasonalChecklistText(chosen);
    var missing={place:0,note:0,risk:0,calendar:0};
    all.forEach(function(i){if(isAutoPlace(i))missing.place++;if(!String(i.userNote||'').trim())missing.note++;if(isRisk(i))missing.risk++;if(!String(i.timing||i.comment||'').trim())missing.calendar++;});
    var windows=['март–апрель','апрель–май','май–июнь','лето','осень'],byWin={};shown.forEach(function(i){var w=windowOf(i);(byWin[w]||(byWin[w]=[])).push(i);});
    var taskRows=windows.map(function(w){var arr=byWin[w]||[];return '<article><strong>'+esc(w)+' · '+arr.length+'</strong><p>'+(arr.length?esc(arr.slice(0,5).map(function(i){return i.name;}).join(', ')):'Добавьте культуры или смените сезонный фильтр.')+'</p></article>';}).join('');
    box.__seasonText=['План сезона — сезонный чек-лист','', (chosen||'Все сезоны').toUpperCase()].concat(check.map(function(x){return '- '+x;}),['','ЧТО ОСТАЛОСЬ ЗАПОЛНИТЬ','- Подтвердить место: '+missing.place,'- Добавить заметку: '+missing.note,'- Проверить риск: '+missing.risk,'- Сверить сроки: '+missing.calendar,'','ОКНА РАБОТ']).concat(windows.map(function(w){var arr=byWin[w]||[];return w+': '+(arr.map(function(i){return i.name+' — '+actionType(i);}).join('; ')||'нет позиций');})).join('\n');
    box.innerHTML='<div class="season-v165-head"><div><span class="kicker">Сезонный маршрут</span><h2>Чек-листы, окна работ и личные задачи</h2><p>Панель связывает список, план и календарь: видно, что заполнить, что делать по сезонам и какие культуры попадают в ближайшие окна.</p></div><div class="season-v165-actions"><button type="button" class="button-soft" data-v165-season-copy>Скопировать чек-лист</button><button type="button" class="button-soft" data-v165-season-download>Скачать TXT</button><button type="button" class="button-soft" data-v165-season-print>Печать</button></div></div><div class="season-v165-filter" aria-label="Быстрый фильтр по сезону"><button type="button" data-v165-season="">Все сезоны</button><button type="button" data-v165-season="Весна">Весна</button><button type="button" data-v165-season="Лето">Лето</button><button type="button" data-v165-season="Осень">Осень</button><button type="button" data-v165-season="Зима">Зима</button></div><div class="season-v165-grid"><article class="season-v165-check"><h3>'+esc(chosen||'Сезонные чек-листы')+'</h3><ul>'+check.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul></article><article class="season-v165-missing"><h3>Что осталось заполнить</h3><div><span><strong>'+missing.place+'</strong> место</span><span><strong>'+missing.note+'</strong> заметка</span><span><strong>'+missing.risk+'</strong> риск</span><span><strong>'+missing.calendar+'</strong> сроки</span></div><p><a href="planting-list.html">Открыть мой список</a> · <a href="calendar.html">Сверить календарь</a></p></article></div><div class="season-v165-windows"><h3>Группировка задач по окнам</h3><div>'+taskRows+'</div></div><div class="season-v165-personal"><h3>Сезонные задачи из личного списка</h3><div>'+(shown.length?shown.slice(0,12).map(function(i){return '<article><strong>'+esc(i.name)+'</strong><span>'+esc(windowOf(i))+' · '+esc(actionType(i))+' · '+esc(placeOf(i))+'</span><p>'+esc(i.userNote||i.timing||i.comment||'Срок сверяется с календарём выбранной зоны.')+'</p></article>';}).join(''):'<article><strong>Личный список пуст</strong><p>Добавьте культуры из подбора или страниц культур, чтобы увидеть сезонные задачи.</p></article>')+'</div></div><p class="season-v165-note" data-v165-season-note hidden></p>';
  }
  function bindSeasonV165(){
    var root=q('[data-season-plan-page]'); if(!root)return;
    root.addEventListener('click',function(e){
      var seasonBtn=e.target.closest('[data-v165-season]');
      if(seasonBtn){var val=seasonBtn.getAttribute('data-v165-season')||'';root.setAttribute('data-v165-season-current',val);var sel=q('[data-season-filter]',root);if(sel){sel.value=val;sel.dispatchEvent(new Event('change',{bubbles:true}));}renderSeasonV165();return;}
      var box=q('[data-v165-season-board]',root); if(!box)return;
      var note=q('[data-v165-season-note]',box);
      if(e.target.closest('[data-v165-season-copy]'))copyText(box.__seasonText||'').then(function(){notify(note,'Чек-лист скопирован.');});
      if(e.target.closest('[data-v165-season-download]')){download('prizhivetsya-season-checklist.txt',box.__seasonText||'');notify(note,'TXT-файл подготовлен.');}
      if(e.target.closest('[data-v165-season-print]'))window.print();
    });
  }
  function renderPlantingPriority(){
    var root=q('[data-planting-list-page]'); if(!root)return;
    var anchor=q('.planting-panel',root)||q('.planting-hero',root);
    var box=ensureAfter(anchor,'planting-v165-priority','data-v165-planting-priority'); if(!box)return;
    var items=active(readList()), noPlace=items.filter(isAutoPlace), noNote=items.filter(function(i){return !String(i.userNote||'').trim();}), risk=items.filter(isRisk), planned=items.filter(function(i){return (i.status||'планирую')==='планирую';});
    box.innerHTML='<div class="planting-v165-head"><div><span class="kicker">Приоритет списка</span><h2>Что проверить первым</h2><p>Личный список безопаснее вести как рабочий план: сначала место, затем риск, заметка и ближайшие задачи.</p></div><a class="btn primary" href="calendar.html">Открыть ближайшие задачи</a></div><div class="planting-v165-grid"><button type="button" data-v165-list-action="place"><strong>'+noPlace.length+'</strong><span>подтвердить место</span></button><button type="button" data-v165-list-action="risk"><strong>'+risk.length+'</strong><span>проверить риск</span></button><button type="button" data-v165-list-action="note"><strong>'+noNote.length+'</strong><span>добавить заметку</span></button><button type="button" data-v165-list-action="planned"><strong>'+planned.length+'</strong><span>обновить статус</span></button></div><div class="planting-v165-tips"><article><strong>Автоматическое место</strong><p>Если место определено из рекомендации, проверьте его вручную. После ручной смены признак автоматического места снимается.</p></article><article><strong>Без заметок</strong><p>Быстрый фильтр оставляет культуры, где ещё не указаны сорт, номер грядки, количество или действие.</p></article><article><strong>Ближайшие задачи</strong><p>После выбора региона и зоны календарь можно отфильтровать по личному списку.</p></article></div>';
  }
  function bindPlantingPriority(){
    var root=q('[data-planting-list-page]'); if(!root)return;
    root.addEventListener('click',function(e){
      var b=e.target.closest('[data-v165-list-action]'); if(!b)return;
      var mode=b.getAttribute('data-v165-list-action'), quick=(mode==='place'?'no-place':mode==='risk'?'attention':mode==='note'?'notes':mode==='planned'?'planned':'');
      var old=q('[data-planting-quick="'+quick+'"]',root);
      if(old)old.click(); else {root.setAttribute('data-planting-quick-mode',quick);var search=q('[data-planting-filter-search]',root);if(search)search.dispatchEvent(new Event('input',{bubbles:true}));}
    });
  }
  function personalCalendarRows(items){
    var out=[];active(items).forEach(function(i){
      var win=windowOf(i), type=actionType(i), title=i.name||'Культура', place=placeOf(i);
      out.push({window:win,type:type,name:title,place:place,text:title+': '+type+' · '+place+(i.userNote?' · '+i.userNote:(i.timing?' · '+i.timing:''))});
      if(type!=='уход')out.push({window:'лето',type:'уход',name:title,place:place,text:title+': уход, полив, мульча и контроль риска · '+place});
      if(type!=='подготовка')out.push({window:'осень',type:'подготовка',name:title,place:place,text:title+': сбор, санитария и подготовка места к зиме'});
    });
    var order={'март–апрель':0,'апрель–май':1,'май–июнь':2,'лето':3,'осень':4};
    return out.sort(function(a,b){return (order[a.window]-order[b.window])||a.name.localeCompare(b.name,'ru')||a.type.localeCompare(b.type,'ru');});
  }
  function renderCalendarPersonalLayer(){
    var root=q('[data-zone-calendar]'); if(!root)return;
    var anchor=q('[data-calendar-result]',root)||q('.calendar-panel',root);
    var box=ensureAfter(anchor,'calendar-v165-personal','data-v165-calendar-personal'); if(!box)return;
    var items=active(readList()), rows=personalCalendarRows(items), zone=q('[data-calendar-zone]',root), zoneReady=!!(zone&&zone.value);
    var grouped={};rows.forEach(function(r){(grouped[r.window]||(grouped[r.window]=[])).push(r);});
    var windows=['март–апрель','апрель–май','май–июнь','лето','осень'];
    box.__calendarText=['Календарь по личному списку — приживется.ру','', 'Культур: '+items.length, 'Зона: '+(zoneReady?'выбрана':'не выбрана'), ''].concat(rows.map(function(r){return '- '+r.window+' · '+r.type+': '+r.text;})).join('\n');
    box.innerHTML='<div class="calendar-v165-head"><div><span class="kicker">Личный слой</span><h2>Календарь по личному списку</h2><p>'+(items.length?'Сформирован слой по '+items.length+' '+plural(items.length,'культуре','культурам','культурам')+'. Он дополняет календарь зоны и не меняет выбранные фильтры.':'Сохраните культуры в список, чтобы получить личный слой посева, высадки, ухода, сбора и подготовки.')+'</p></div><div class="calendar-v165-actions"><button type="button" class="button-soft" data-v165-calendar-copy>Скопировать личный слой</button><button type="button" class="button-soft" data-v165-calendar-download>Скачать TXT</button></div></div><div class="calendar-v165-status"><span><strong>'+items.length+'</strong> культур</span><span><strong>'+(zoneReady?'да':'нет')+'</strong> зона выбрана</span><span><strong>'+rows.length+'</strong> личных действий</span></div><div class="calendar-v165-grid">'+(items.length?windows.map(function(w){var arr=grouped[w]||[];return '<article><strong>'+esc(w)+' · '+arr.length+'</strong><ul>'+arr.slice(0,6).map(function(r){return '<li><span>'+esc(r.type)+'</span>'+esc(r.name)+' — '+esc(r.place)+'</li>';}).join('')+'</ul></article>';}).join(''):'<article><strong>Личный список пуст</strong><p>Перейдите в подбор или каталог культур и добавьте первые позиции.</p><p><a href="planner.html">Подбор</a> · <a href="planting-list.html">Мой список</a></p></article>')+'</div><p class="calendar-v165-note" data-v165-calendar-note hidden></p>';
  }
  function bindCalendarPersonalLayer(){
    var root=q('[data-zone-calendar]'); if(!root)return;
    root.addEventListener('click',function(e){
      var box=q('[data-v165-calendar-personal]',root); if(!box)return;
      var note=q('[data-v165-calendar-note]',box);
      if(e.target.closest('[data-v165-calendar-copy]'))copyText(box.__calendarText||'').then(function(){notify(note,'Личный календарный слой скопирован.');});
      if(e.target.closest('[data-v165-calendar-download]')){download('prizhivetsya-personal-calendar.txt',box.__calendarText||'');notify(note,'TXT-файл личного слоя подготовлен.');}
    });
  }
  function renderPlannerOverload(){
    var root=q('[data-plant-planner]'); if(!root)return;
    var anchor=q('[data-planner-site-check]',root)||q('.planner-panel',root);
    var box=ensureAfter(anchor,'planner-v165-overload','data-v165-planner-overload'); if(!box)return;
    var vals=qa('[data-planner-condition]:checked',root).map(function(ch){return ch.value;}), has=function(v){return vals.indexOf(v)!==-1;}, cards=[];
    if(has('shade')&&has('wet'))cards.push(['тень + влажность','Снизьте ожидания по плодовым овощам, оставьте проветривание и выбирайте зелень, хосту, астильбу, мяту.']);
    if(has('sand')&&has('dry'))cards.push(['песок + сухость','Сначала мульча, органика и полив, затем культуры с коротким циклом или засухоустойчивые травы.']);
    if(has('sand')&&has('wind'))cards.push(['песок + ветер','Нужны кулисы, мульча и защищённая гряда; теплолюбивые культуры лучше не ставить первыми.']);
    if(has('short'))cards.push(['короткое лето','Уточняйте ранние сорта, рассаду и теплицу; поздние теплолюбивые позиции переносите ниже.']);
    if(has('greenhouse')&&has('shade'))cards.push(['теплица + тень','Теплица не заменяет солнце: томат, перец и баклажан всё равно требуют светлого места.']);
    var empty=!vals.length;
    box.innerHTML='<div class="planner-v165-head"><span class="kicker">Без перегруза</span><h2>Как не перегрузить подбор условиями</h2><p>'+(empty?'Выберите 2–3 самых сильных ограничения. Если отметить всё сразу, список станет слишком узким и часть рабочих вариантов уйдёт ниже.':'Выбрано '+vals.length+' '+plural(vals.length,'условие','условия','условий')+'. Сначала проверьте конфликтные сочетания, затем расширяйте фильтры.')+'</p></div><div class="planner-v165-grid">'+(cards.length?cards.map(function(c){return '<article><strong>'+esc(c[0])+'</strong><p>'+esc(c[1])+'</p></article>';}).join(''):'<article><strong>Пустое состояние</strong><p>Начните с региона и зоны, затем добавьте одно ограничение участка и посмотрите, как меняются группы рекомендаций.</p></article>')+'</div><div class="planner-v165-links"><a href="planting-list.html">Мой список</a><a href="season-plan.html">План сезона</a><a href="conditions.html">Условия участка</a></div>';
  }
  function renderCultureChecklist(){
    var main=q('.culture-main'); if(!main||!document.body.classList.contains('culture-detail'))return;
    var anchor=q('[data-v163-culture-route]',main)||q('.culture-plant-check-card',main)||q('.culture-action-panel',main)||q('.culture-detail-hero',main);
    var box=ensureAfter(anchor,'culture-v165-care','data-v165-care-checklist'); if(!box)return;
    var name=(q('.culture-detail-hero h1',main)||q('h1',main)||{}).textContent||'Культура';
    name=String(name).trim()||'Культура';
    var text=['Мини-чек-лист ухода — '+name,'','СТАРТ','- Проверить регион, зону и место посадки.','- Уточнить срок посева, высадки или покупки саженца.','- Добавить культуру в мой список и указать место.','','ЛЕТО','- Следить за влагой, мульчей, ветром и проветриванием.','- Проверять болезни, вредителей и перегрев теплицы.','','ОСЕНЬ / ПЕРЕД ЗИМОЙ','- Собрать урожай или провести санитарный уход.','- Отметить результат в заметке и подготовить место к зиме.'].join('\n');
    box.__careText=text;
    box.innerHTML='<div class="culture-v165-head"><div><span class="kicker">Уход без лишнего</span><h2>Мини-чек-лист ухода</h2><p>Общий чек-лист помогает быстро связать страницу культуры с личным списком, планом сезона и календарём.</p></div><button type="button" class="button-soft" data-v165-culture-copy>Скопировать чек-лист</button></div><div class="culture-v165-grid"><article><strong>Что сделать на старте</strong><ul><li>Проверить регион, зону и место посадки.</li><li>Уточнить срок посева, высадки или покупки саженца.</li><li>Добавить культуру в «Мой список».</li></ul></article><article><strong>Что проверить летом</strong><ul><li>Влага, мульча, ветер и проветривание.</li><li>Болезни, вредители и перегрев теплицы.</li><li>Статус работ в личном плане.</li></ul></article><article><strong>Что учесть осенью</strong><ul><li>Сбор, санитарный уход и подготовка места.</li><li>Укрытие, если культура или зона требуют защиты.</li><li>Заметка о сорте и результате сезона.</li></ul></article></div><p class="culture-v165-note" data-v165-culture-note hidden></p>';
  }
  function bindCultureChecklist(){
    document.addEventListener('click',function(e){var btn=e.target.closest('[data-v165-culture-copy]');if(!btn)return;var box=btn.closest('[data-v165-care-checklist]'),note=q('[data-v165-culture-note]',box);copyText((box&&box.__careText)||'').then(function(){notify(note,'Чек-лист культуры скопирован.');});});
  }
  function refreshAll(){migrateAutoPlace();renderSeasonV165();renderPlantingPriority();renderCalendarPersonalLayer();renderPlannerOverload();renderCultureChecklist();}
  ready(function(){
    refreshAll();bindSeasonV165();bindPlantingPriority();bindCalendarPersonalLayer();bindCultureChecklist();syncManualPlaceChange();
    var planner=q('[data-plant-planner]'); if(planner){planner.addEventListener('change',function(){setTimeout(renderPlannerOverload,80);});planner.addEventListener('input',function(){setTimeout(renderPlannerOverload,120);});}
    var seasonRoot=q('[data-season-plan-page]'); if(seasonRoot)seasonRoot.addEventListener('change',function(e){if(e.target&&e.target.matches('[data-season-filter]'))seasonRoot.setAttribute('data-v165-season-current',e.target.value||'');setTimeout(renderSeasonV165,120);});
    var planting=q('[data-planting-list-page]'); if(planting){planting.addEventListener('input',function(){setTimeout(renderPlantingPriority,180);});planting.addEventListener('change',function(){setTimeout(renderPlantingPriority,140);});}
    var cal=q('[data-zone-calendar]'); if(cal){cal.addEventListener('change',function(){setTimeout(renderCalendarPersonalLayer,100);});cal.addEventListener('prizh:calendar-rendered',function(){setTimeout(renderCalendarPersonalLayer,60);});}
    document.addEventListener('prizh:calendar-rendered',function(){setTimeout(renderCalendarPersonalLayer,60);});
    document.addEventListener('prizh:planting-list-updated',function(){setTimeout(refreshAll,160);});
  });
})();
