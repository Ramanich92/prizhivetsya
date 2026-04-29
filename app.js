/* v146: unified UI, personal list exports, culture actions, list-aware calendar, no-assets build */
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
      var addButton = '<button type="button" class="planting-add-btn" data-planting-add data-planting-name="'+escapeTableHtml(item.name)+'" data-planting-category="'+escapeTableHtml(item.category)+'" data-planting-rec="'+escapeTableHtml(item.recommendation)+'" data-planting-place="'+escapeTableHtml(item.place || item.method || '')+'" data-planting-time="'+escapeTableHtml(item.timing || '')+'" data-planting-comment="'+escapeTableHtml(item.note || '')+'">В список</button>';
      var mainRow = '<tr class="culture-main-row" data-culture-main-row>'+ 
        '<td>'+firstCell+'</td>'+ 
        '<td><span class="category-badge">'+escapeTableHtml(item.category)+'</span></td>'+ 
        '<td><span class="rec-badge" data-rec="'+escapeTableHtml(item.recommendation)+'">'+escapeTableHtml(item.recommendation)+'</span></td>'+ 
        '<td><span class="place-badge">'+escapeTableHtml(item.place)+'</span></td>'+ 
        '<td class="timing-cell">'+escapeTableHtml(item.timing || '')+'</td>'+ 
        '<td><div class="planting-note-action"><span>'+escapeTableHtml(item.note)+'</span>'+addButton+'</div></td>'+ 
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



/* v132: plant planner */
(function(){
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  function plural(n,one,few,many){n=Math.abs(Number(n)||0)%100;var n1=n%10;if(n>10&&n<20)return many;if(n1>1&&n1<5)return few;if(n1===1)return one;return many;}
  function opt(v,l){var e=document.createElement('option');e.value=v;e.textContent=l;return e;}
  function setOpts(sel,ph,rows,current){if(!sel)return;sel.innerHTML='';sel.appendChild(opt('',ph));rows.forEach(function(r){sel.appendChild(opt(String(r.value),r.label));});if(current&&Array.prototype.some.call(sel.options,function(o){return o.value===String(current);})){sel.value=String(current);}}
  function debounce(fn,delay){var timer;return function(){var ctx=this,args=arguments;clearTimeout(timer);timer=setTimeout(function(){fn.apply(ctx,args);},delay);};}
  function initPlantPlanner(root){
    var url=root.getAttribute('data-planner-url')||'data/planner-data.json', subject=root.querySelector('[data-planner-subject]'), zone=root.querySelector('[data-planner-zone]'), guide=root.querySelector('[data-planner-guide]'), category=root.querySelector('[data-planner-category]'), where=root.querySelector('[data-planner-where]'), risk=root.querySelector('[data-planner-risk]'), search=root.querySelector('[data-planner-search]'), popular=root.querySelector('[data-planner-popular]'), apply=root.querySelector('[data-planner-apply]'), reset=root.querySelector('[data-planner-reset]'), start=root.querySelector('[data-planner-start]'), results=root.querySelector('[data-planner-results]'), empty=root.querySelector('[data-planner-empty]'), summary=root.querySelector('[data-planner-summary]'), groups=root.querySelector('[data-planner-result-groups]'), limit=root.querySelector('[data-planner-limit]'), count=root.querySelector('[data-planner-record-count]'), state=null;
    function decode(data){var strings=data.strings||[], recs=(data.records||[]).map(function(r){var z=data.zones[r[1]]||{}, s=data.subjects[z.s]||{};return {name:strings[r[0]]||'',zoneIndex:r[1],subjectIndex:z.s,guideTypeIndex:r[2],guideType:(data.guideTypes||[])[r[2]]||'',guideName:(data.guideNames||[])[r[2]]||'',category:strings[r[3]]||'',recommendationIndex:r[4],recommendation:(data.recommendations||[])[r[4]]||'',where:strings[r[5]]||'',time:strings[r[6]]||'',comment:strings[r[7]]||'',popular:!!r[8],culturePage:strings[r[9]]||'',subject:s,zone:z};});return {subjects:data.subjects||[],zones:data.zones||[],guideTypes:data.guideTypes||[],guideNames:data.guideNames||[],recommendations:data.recommendations||[],records:recs,recordCount:data.recordCount||recs.length};}
    function unique(rows,fn){var seen={},out=[];rows.forEach(function(row){var v=fn(row);if(v&&!Object.prototype.hasOwnProperty.call(seen,v)){seen[v]=true;out.push({value:v,label:v});}});return out.sort(function(a,b){return a.label.localeCompare(b.label,'ru');});}
    function currentRows(){if(!state)return[];var rows=state.records.slice();if(subject&&subject.value)rows=rows.filter(function(r){return String(r.subjectIndex)===subject.value;});if(zone&&zone.value)rows=rows.filter(function(r){return String(r.zoneIndex)===zone.value;});if(guide&&guide.value)rows=rows.filter(function(r){return String(r.guideTypeIndex)===guide.value;});return rows;}
    function refreshZones(){var si=subject?subject.value:'';var rows=[];if(si!==''){var s=state.subjects[Number(si)];rows=(s&&s.z?s.z:[]).map(function(zi){var z=state.zones[zi]||{};return {value:zi,label:z.n};});}setOpts(zone,si?'Все зоны региона':'Сначала выберите регион',rows,zone?zone.value:'');refreshFilters();}
    function refreshFilters(){var rows=currentRows();setOpts(guide,'Все разделы',state.guideNames.map(function(n,i){return {value:i,label:n};}),guide?guide.value:'');setOpts(category,'Все категории',unique(rows,function(r){return r.category;}),category?category.value:'');setOpts(where,'Все условия',unique(rows,function(r){return r.where;}),where?where.value:'');setOpts(risk,'Любой уровень риска',state.recommendations.map(function(n,i){return {value:i,label:n};}),risk?risk.value:'');}
    function guidePage(r){return r.zone&&r.zone.p?r.zone.p.replace(/\.html$/,'-'+r.guideType+'.html'):'';}
    function render(){if(!state)return; if(start)start.hidden=true;if(results)results.hidden=true;if(empty)empty.hidden=true;if(limit)limit.hidden=true;var q=(search&&search.value?search.value:'').trim().toLowerCase();var rows=currentRows();if(category&&category.value)rows=rows.filter(function(r){return r.category===category.value;});if(where&&where.value)rows=rows.filter(function(r){return r.where===where.value;});if(risk&&risk.value)rows=rows.filter(function(r){return String(r.recommendationIndex)===risk.value;});if(popular&&popular.checked)rows=rows.filter(function(r){return r.popular;});if(q)rows=rows.filter(function(r){return [r.name,r.category,r.where,r.time,r.comment,r.subject.n,r.zone.n,r.guideName].join(' ').toLowerCase().indexOf(q)!==-1;});rows.sort(function(a,b){if(a.recommendationIndex!==b.recommendationIndex)return a.recommendationIndex-b.recommendationIndex;return a.name.localeCompare(b.name,'ru');});if(!rows.length){if(empty)empty.hidden=false;return;}var total=rows.length, shown=rows.slice(0,120), by={};shown.forEach(function(r){(by[r.recommendation]||(by[r.recommendation]=[])).push(r);});var html=[];state.recommendations.forEach(function(rec){var arr=by[rec]||[];if(!arr.length)return;html.push('<section class="planner-group"><div class="planner-group-head"><h2>'+esc(rec)+'</h2><span>'+arr.length+' '+plural(arr.length,'позиция','позиции','позиций')+'</span></div><div class="planner-result-list">');arr.forEach(function(r){var gp=guidePage(r), culture=r.culturePage?'<a href="'+esc(r.culturePage)+'">'+esc(r.name)+'</a>':esc(r.name);var add='<button type="button" class="planting-add-btn planting-add-btn--planner" data-planting-add data-planting-name="'+esc(r.name)+'" data-planting-category="'+esc(r.category)+'" data-planting-rec="'+esc(r.recommendation)+'" data-planting-place="'+esc(r.where)+'" data-planting-time="'+esc(r.time||'')+'" data-planting-comment="'+esc(r.comment||'')+'" data-planting-source="'+esc(r.subject.n+' · '+r.zone.n+' · '+r.guideName)+'" data-planting-url="'+esc(gp||'planner.html')+'">В список</button>';
          html.push('<article class="planner-result-card"><div><strong>'+culture+'</strong><small>'+esc(r.subject.n)+' · '+esc(r.zone.n)+' · '+esc(r.guideName)+'</small><div class="planner-badges"><span class="planner-badge">'+esc(r.category)+'</span><span class="planner-badge">'+esc(r.where)+'</span></div></div><div><p>'+esc(r.comment||r.time)+'</p><small>'+esc(r.time)+'</small><div class="planner-result-actions">'+(gp?'<a href="'+esc(gp)+'">Открыть справочник зоны</a>':'')+add+'</div></div></article>');});html.push('</div></section>');});if(groups)groups.innerHTML='<div class="planner-groups">'+html.join('')+'</div>';if(summary)summary.textContent='Найдено '+total+' '+plural(total,'позиция','позиции','позиций')+'.';if(total>shown.length&&limit){limit.hidden=false;limit.textContent='Показаны первые '+shown.length+' позиций. Уточните регион, зону или условия для более точного списка.';}if(results)results.hidden=false;document.dispatchEvent(new CustomEvent('prizh:planting-buttons-rendered'));}
    fetch(url).then(function(r){if(!r.ok)throw new Error('planner');return r.json();}).then(function(data){state=decode(data);if(count)count.textContent=String(state.recordCount).replace(/\B(?=(\d{3})+(?!\d))/g,' ');setOpts(subject,'Все регионы',state.subjects.map(function(s,i){return {value:i,label:s.n};}), '');setOpts(zone,'Сначала выберите регион',[], '');refreshFilters();[subject,zone,guide,category,where,risk,popular].forEach(function(el){if(el)el.addEventListener('change',function(){if(el===subject)refreshZones();else refreshFilters();render();});});if(search)search.addEventListener('input',debounce(render,140));if(apply)apply.addEventListener('click',render);if(reset)reset.addEventListener('click',function(){[subject,zone,guide,category,where,risk].forEach(function(el){if(el)el.value='';});if(search)search.value='';if(popular)popular.checked=true;refreshZones();if(start)start.hidden=false;if(results)results.hidden=true;if(empty)empty.hidden=true;});if(start)start.hidden=false;}).catch(function(){if(start){start.hidden=false;var h=start.querySelector('h2'),p=start.querySelector('p');if(h)h.textContent='Подбор временно недоступен';if(p)p.textContent='Не удалось загрузить данные подбора.';}});
  }
  document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('[data-plant-planner]').forEach(initPlantPlanner);});
})();

/* v146: zone work calendar with personal list filter */
(function(){
  var plantingStorageKey = 'prizhivetsya:planting-list:v1';
  function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch];});}
  function norm(v){return String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').replace(/\s+/g,' ').trim();}
  function plural(n,one,few,many){n=Math.abs(Number(n)||0)%100;var n1=n%10;if(n>10&&n<20)return many;if(n1>1&&n1<5)return few;if(n1===1)return one;return many;}
  function opt(v,l){var e=document.createElement('option');e.value=v;e.textContent=l;return e;}
  function setOpts(sel,ph,rows,current){if(!sel)return;sel.innerHTML='';sel.appendChild(opt('',ph));rows.forEach(function(r){sel.appendChild(opt(String(r.value),r.label));});if(current&&Array.prototype.some.call(sel.options,function(o){return o.value===String(current);})){sel.value=String(current);}}
  function readPlanting(){try{var a=JSON.parse(localStorage.getItem(plantingStorageKey)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
  function plantingTokens(items){var seen={}, out=[];items.forEach(function(item){norm(item.name).split(' ').forEach(function(tok){if(tok.length<4)return;if(!Object.prototype.hasOwnProperty.call(seen,tok)){seen[tok]=true;out.push(tok);}});});return out;}
  function workMatchesList(work,tokens){if(!tokens.length)return false;var text=norm(work.text+' '+work.tag);return tokens.some(function(tok){return text.indexOf(tok)!==-1;});}
  function initZoneCalendar(root){var url=root.getAttribute('data-calendar-url')||'data/calendar-data.json', subject=root.querySelector('[data-calendar-subject]'), zone=root.querySelector('[data-calendar-zone]'), month=root.querySelector('[data-calendar-month]'), tag=root.querySelector('[data-calendar-tag]'), onlyList=root.querySelector('[data-calendar-my-list]'), apply=root.querySelector('[data-calendar-apply]'), printBtn=root.querySelector('[data-calendar-print]'), start=root.querySelector('[data-calendar-start]'), result=root.querySelector('[data-calendar-result]'), empty=root.querySelector('[data-calendar-empty]'), title=root.querySelector('[data-calendar-title]'), summary=root.querySelector('[data-calendar-summary]'), personal=root.querySelector('[data-calendar-personal-note]'), season=root.querySelector('[data-calendar-season]'), risk=root.querySelector('[data-calendar-risk]'), basis=root.querySelector('[data-calendar-basis]'), care=root.querySelector('[data-calendar-care]'), monthsWrap=root.querySelector('[data-calendar-months]'), reset=root.querySelector('[data-calendar-reset]'), state=null;
    function rowsForSubject(si){if(si==='')return[];return state.zones.map(function(z,i){return {z:z,i:i};}).filter(function(x){return String(x.z.s)===String(si);}).map(function(x){return {value:x.i,label:x.z.n};});}
    function cal(){if(!state||!zone||zone.value==='')return null;return state.byZone[String(zone.value)]||null;}
    function refreshLists(){var c=cal(), months=[], tags=[];(c&&c.months||[]).forEach(function(m){if(months.indexOf(m.month)===-1)months.push(m.month);(m.works||[]).forEach(function(w){if(tags.indexOf(w.tag)===-1)tags.push(w.tag);});});setOpts(month,'Все месяцы',months.map(function(m){return {value:m,label:m};}),month?month.value:'');setOpts(tag,'Все типы работ',tags.sort(function(a,b){return a.localeCompare(b,'ru');}).map(function(t){return {value:t,label:t};}),tag?tag.value:'');}
    function emptyMessage(heading, text){if(empty){var h=empty.querySelector('h2'), p=empty.querySelector('p');if(h)h.textContent=heading;if(p)p.textContent=text;empty.hidden=false;}}
    function render(){var c=cal();if(start)start.hidden=true;if(result)result.hidden=true;if(empty)empty.hidden=true;if(personal)personal.hidden=true;if(!c){if(start)start.hidden=false;return;}var z=state.zones[Number(c.z)]||{}, s=state.subjects[z.s]||{}, mf=month?month.value:'', tf=tag?tag.value:'', useList=!!(onlyList&&onlyList.checked), items=useList?readPlanting():[], tokens=plantingTokens(items), cards=[], total=0;if(useList&&!tokens.length){emptyMessage('Список посадок пуст', 'Добавьте культуры в «Мой список», затем календарь покажет задачи, связанные с ними.');return;}(c.months||[]).forEach(function(m){if(mf&&m.month!==mf)return;var works=(m.works||[]).filter(function(w){if(tf&&w.tag!==tf)return false;if(useList&&!workMatchesList(w,tokens))return false;return true;});if(!works.length)return;total+=works.length;cards.push('<article class="calendar-month-card"><div class="calendar-month-head"><h3>'+esc(m.month)+'</h3><span>'+works.length+' '+plural(works.length,'задача','задачи','задач')+'</span></div><ul class="calendar-task-list">'+works.map(function(w){return '<li><span class="calendar-task-tag">'+esc(w.tag)+'</span><p>'+esc(w.text)+'</p></li>';}).join('')+'</ul></article>');});if(!cards.length){emptyMessage('Нет задач по выбранным условиям', useList?'В календаре зоны нет задач, совпадающих с текущим списком посадок. Отключите фильтр по списку или выберите другой месяц.':'Попробуйте выбрать другой месяц или тип работ.');return;}if(title)title.textContent=s.n+' — '+z.n;if(summary)summary.textContent=z.sum||'Календарь учитывает сезон, риски зоны и практику посадок для участка.';if(personal&&useList){personal.textContent='Показаны задачи, связанные с вашим списком: '+items.length+' '+plural(items.length,'культура','культуры','культур')+', '+total+' '+plural(total,'задача','задачи','задач')+'.';personal.hidden=false;}if(season)season.textContent=c.season||'';if(risk)risk.textContent=c.risk||'';if(basis)basis.textContent=c.basis||'';if(care)care.textContent=c.care||'';if(monthsWrap)monthsWrap.innerHTML=cards.join('');if(result)result.hidden=false;}
    fetch(url).then(function(r){if(!r.ok)throw new Error('calendar');return r.json();}).then(function(data){state={subjects:data.subjects||[],zones:data.zones||[],calendars:data.calendars||[],byZone:{}};state.calendars.forEach(function(c){state.byZone[String(c.z)]=c;});setOpts(subject,'Выберите регион',state.subjects.map(function(s,i){return {value:i,label:s.n};}), '');setOpts(zone,'Сначала выберите регион',[], '');setOpts(month,'Все месяцы',[], '');setOpts(tag,'Все типы работ',[], '');var q=new URLSearchParams(window.location.search).get('zone');if(q){var zi=state.zones.findIndex(function(z){return z.id===q;});if(zi>=0){subject.value=String(state.zones[zi].s);setOpts(zone,'Выберите зону',rowsForSubject(subject.value),String(zi));refreshLists();render();}}if(subject)subject.addEventListener('change',function(){setOpts(zone,'Выберите зону',rowsForSubject(subject.value),'');if(zone&&zone.options.length>1)zone.value=zone.options[1].value;refreshLists();render();});if(zone)zone.addEventListener('change',function(){refreshLists();render();});if(month)month.addEventListener('change',render);if(tag)tag.addEventListener('change',render);if(onlyList)onlyList.addEventListener('change',render);if(apply)apply.addEventListener('click',render);if(printBtn)printBtn.addEventListener('click',function(){window.print();});if(reset)reset.addEventListener('click',function(){subject.value='';setOpts(zone,'Сначала выберите регион',[],'');setOpts(month,'Все месяцы',[],'');setOpts(tag,'Все типы работ',[],'');if(onlyList)onlyList.checked=false;if(start)start.hidden=false;if(result)result.hidden=true;if(empty)empty.hidden=true;if(personal)personal.hidden=true;});if(!q&&start)start.hidden=false;}).catch(function(){if(start){start.hidden=false;var h=start.querySelector('h2'),p=start.querySelector('p');if(h)h.textContent='Календарь временно недоступен';if(p)p.textContent='Не удалось загрузить данные календаря.';}});
  }
  document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('[data-zone-calendar]').forEach(initZoneCalendar);});
})();


/* v146: local planting list with notes, grouped view and file exports */
(function(){
  var storageKey = 'prizhivetsya:planting-list:v1';
  var recRank = {'Надежно':0,'Надёжно':0,'Рекомендовано':1,'С укрытием / уходом':2,'Рискованно':3,'Проверить по зоне':4};
  function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch];});}
  function norm(v){return String(v||'').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();}
  function rank(v){return Object.prototype.hasOwnProperty.call(recRank, v) ? recRank[v] : 99;}
  function plural(n,one,few,many){n=Math.abs(Number(n)||0)%100;var n1=n%10;if(n>10&&n<20)return many;if(n1>1&&n1<5)return few;if(n1===1)return one;return many;}
  function hash(v){var h=0,s=String(v||'');for(var i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;}return Math.abs(h).toString(36);}
  function rawRead(){try{var a=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
  function write(items){try{localStorage.setItem(storageKey, JSON.stringify(items));return true;}catch(e){return false;}}
  function pageUrl(){var path=window.location.pathname||'';var file=path.split('/').pop()||'index.html';var prefix='';if(path.indexOf('/regions/')!==-1)prefix='regions/';else if(path.indexOf('/cultures/')!==-1)prefix='cultures/';return prefix+file+(window.location.search||'');}
  function cleanTitle(){return (document.title||'приживется.ру').replace(/\s+—\s+приживется\.ру$/i,'').replace(/\s+—\s+где выращивать$/i,'').trim();}
  function keyOf(item){return [norm(item.name),norm(item.sourceTitle),norm(item.sourceUrl),norm(item.recommendation),norm(item.place)].join('|');}
  function read(){var items=rawRead(), changed=false, seen={};items=items.filter(function(item){return item&&item.name;}).map(function(item,idx){if(!item.id){item.id='pl_'+hash(keyOf(item)+'|'+idx);changed=true;}if(!Object.prototype.hasOwnProperty.call(item,'userNote')){item.userNote='';}var id=item.id;if(Object.prototype.hasOwnProperty.call(seen,id)){item.id=id+'_'+idx;changed=true;}seen[item.id]=true;return item;});if(changed)write(items);return items;}
  function payloadFromButton(btn){return {id:'pl_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7),name:btn.getAttribute('data-planting-name')||'',category:btn.getAttribute('data-planting-category')||'',recommendation:btn.getAttribute('data-planting-rec')||'',place:btn.getAttribute('data-planting-place')||'',timing:btn.getAttribute('data-planting-time')||'',comment:btn.getAttribute('data-planting-comment')||'',sourceTitle:btn.getAttribute('data-planting-source')||cleanTitle(),sourceUrl:btn.getAttribute('data-planting-url')||pageUrl(),userNote:'',addedAt:new Date().toISOString()};}
  function buttonKey(btn){return keyOf(payloadFromButton(btn));}
  function updateButtons(){var items=read(), keys={};items.forEach(function(item){keys[keyOf(item)]=true;});Array.prototype.slice.call(document.querySelectorAll('[data-planting-add]')).forEach(function(btn){var added=!!keys[buttonKey(btn)], label=added?'В списке':'В список', pressed=added?'true':'false', hint=added?'Убрать из списка посадок':'Добавить в список посадок';btn.classList.toggle('is-added',added);if(btn.textContent!==label)btn.textContent=label;btn.setAttribute('aria-pressed',pressed);btn.setAttribute('title',hint);btn.setAttribute('aria-label',hint);});}
  function toggleItem(btn){var item=payloadFromButton(btn);if(!item.name)return;var items=read(), k=keyOf(item), next=items.filter(function(x){return keyOf(x)!==k;});if(next.length!==items.length){write(next);updateButtons();document.dispatchEvent(new CustomEvent('prizh:planting-list-updated'));return;}items.unshift(item);write(items);updateButtons();document.dispatchEvent(new CustomEvent('prizh:planting-list-updated'));}
  function line(item,i){var note=item.userNote?'\n   Заметка: '+item.userNote:'';return (i+1)+'. '+item.name+' — '+(item.recommendation||'без оценки')+'; '+(item.place||'условия уточняются')+'; '+(item.timing||'сроки уточняются')+'\n   '+(item.sourceTitle||'Справочник')+'\n   '+(item.comment||'')+note;}
  function textExport(items){return items.map(line).join('\n\n');}
  function csvCell(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"';}
  function csvExport(items){var head=['Культура','Категория','Рекомендация','Где лучше','Сроки','Комментарий','Заметка','Источник','Ссылка'];var rows=items.map(function(item){return [item.name,item.category,item.recommendation,item.place,item.timing,item.comment,item.userNote,item.sourceTitle,item.sourceUrl];});return [head].concat(rows).map(function(row){return row.map(csvCell).join(';');}).join('\n');}
  function download(name, text, type){var blob=new Blob([text],{type:type||'text/plain;charset=utf-8'}), a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);document.body.removeChild(a);},0);}
  function debounce(fn,delay){var timer;return function(){var ctx=this,args=arguments;clearTimeout(timer);timer=setTimeout(function(){fn.apply(ctx,args);},delay);};}
  function copyText(text){if(navigator.clipboard&&navigator.clipboard.writeText){return navigator.clipboard.writeText(text);}return new Promise(function(resolve,reject){var area=document.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.left='-9999px';document.body.appendChild(area);area.select();try{document.execCommand('copy')?resolve():reject(new Error('copy failed'));}catch(e){reject(e);}finally{document.body.removeChild(area);}});}
  function initPage(root){var total=root.querySelector('[data-planting-total]'), search=root.querySelector('[data-planting-filter-search]'), rec=root.querySelector('[data-planting-filter-rec]'), cat=root.querySelector('[data-planting-filter-category]'), empty=root.querySelector('[data-planting-empty]'), results=root.querySelector('[data-planting-results]'), summary=root.querySelector('[data-planting-summary]'), groups=root.querySelector('[data-planting-groups]'), printBtn=root.querySelector('[data-planting-print]'), clearBtn=root.querySelector('[data-planting-clear]'), copyBtn=root.querySelector('[data-planting-copy]'), txtBtn=root.querySelector('[data-planting-download-txt]'), csvBtn=root.querySelector('[data-planting-download-csv]');
    function fillCategories(items){var current=cat?cat.value:'', values=[];items.forEach(function(item){if(item.category&&values.indexOf(item.category)===-1)values.push(item.category);});values.sort(function(a,b){return a.localeCompare(b,'ru');});if(cat){cat.innerHTML='<option value="">Все</option>'+values.map(function(v){return '<option>'+esc(v)+'</option>';}).join('');cat.value=values.indexOf(current)!==-1?current:'';}}
    function filtered(items){var q=norm(search&&search.value), rv=rec&&rec.value, cv=cat&&cat.value;return items.filter(function(item){if(rv&&item.recommendation!==rv)return false;if(cv&&item.category!==cv)return false;if(q&&norm([item.name,item.category,item.recommendation,item.place,item.timing,item.comment,item.userNote,item.sourceTitle].join(' ')).indexOf(q)===-1)return false;return true;}).sort(function(a,b){return (rank(a.recommendation)-rank(b.recommendation))||String(a.category||'').localeCompare(String(b.category||''),'ru')||a.name.localeCompare(b.name,'ru')||String(a.sourceTitle||'').localeCompare(String(b.sourceTitle||''),'ru');});}
    function stats(items){var byCat={}, byRec={};items.forEach(function(item){var c=item.category||'Разное', r=item.recommendation||'Без оценки';byCat[c]=(byCat[c]||0)+1;byRec[r]=(byRec[r]||0)+1;});var catHtml=Object.keys(byCat).sort(function(a,b){return a.localeCompare(b,'ru');}).map(function(k){return '<span><strong>'+byCat[k]+'</strong> '+esc(k)+'</span>';}).join('');var recHtml=Object.keys(byRec).sort(function(a,b){return rank(a)-rank(b)||a.localeCompare(b,'ru');}).map(function(k){return '<span><strong>'+byRec[k]+'</strong> '+esc(k==='Надежно'?'Надёжно':k)+'</span>';}).join('');return '<div class="planting-summary-cards"><div><h3>По категориям</h3>'+catHtml+'</div><div><h3>По рекомендации</h3>'+recHtml+'</div></div>';}
    function card(item){return '<article class="planting-card"><div class="planting-card-main"><h3>'+esc(item.name)+'</h3><div class="planting-card-badges"><span class="rec-badge" data-rec="'+esc(item.recommendation)+'">'+esc(item.recommendation||'Без оценки')+'</span><span class="planner-badge">'+esc(item.category||'Разное')+'</span><span class="planner-badge">'+esc(item.place||'Условия уточняются')+'</span></div><p>'+esc(item.comment||item.timing||'Смотрите исходный справочник для уточнения условий.')+'</p><small>'+esc(item.timing||'Сроки уточняются в справочнике.')+'</small><label class="planting-note-field">Личная заметка<textarea data-planting-note="'+esc(item.id||'')+'" placeholder="Сорт, грядка, количество, задача">'+esc(item.userNote||'')+'</textarea></label></div><div class="planting-card-side"><a href="'+esc(item.sourceUrl||'#')+'">Открыть источник</a><span>'+esc(item.sourceTitle||'Справочник')+'</span><button type="button" class="planting-remove-btn" data-planting-remove="'+esc(item.id||'')+'">Убрать</button></div></article>';}
    function render(){var items=read();fillCategories(items);var list=filtered(items);if(total)total.textContent=String(items.length);if(!items.length){if(empty)empty.hidden=false;if(results)results.hidden=true;return;}if(empty)empty.hidden=true;if(results)results.hidden=false;if(summary)summary.innerHTML='<p>Показано '+list.length+' '+plural(list.length,'позиция','позиции','позиций')+' из '+items.length+'.</p>'+stats(list);var byRec={};list.forEach(function(item){var k=item.recommendation||'Без оценки';(byRec[k]||(byRec[k]=[])).push(item);});var order=['Надёжно','Надежно','Рекомендовано','С укрытием / уходом','Рискованно','Проверить по зоне','Без оценки'], html=[];order.forEach(function(k){var arr=byRec[k]||[];if(!arr.length)return;var byCat={};arr.forEach(function(item){var c=item.category||'Разное';(byCat[c]||(byCat[c]=[])).push(item);});html.push('<section class="planting-group"><div class="planting-group-head"><h2>'+esc(k==='Надежно'?'Надёжно':k)+'</h2><span>'+arr.length+' '+plural(arr.length,'позиция','позиции','позиций')+'</span></div><div class="planting-category-list">');Object.keys(byCat).sort(function(a,b){return a.localeCompare(b,'ru');}).forEach(function(c){html.push('<section class="planting-category-block"><h3>'+esc(c)+'</h3><div class="planting-card-list">'+byCat[c].map(card).join('')+'</div></section>');});html.push('</div></section>');});if(groups)groups.innerHTML=html.join('')||'<section class="planting-empty"><h2>Ничего не найдено</h2><p>Попробуйте изменить поиск или фильтры.</p></section>';}
    var debouncedRender=debounce(render,120);if(search)search.addEventListener('input',debouncedRender);if(rec)rec.addEventListener('change',render);if(cat)cat.addEventListener('change',render);
    if(clearBtn)clearBtn.addEventListener('click',function(){if(!read().length)return;if(confirm('Очистить весь список посадок?')){write([]);render();updateButtons();}});
    if(printBtn)printBtn.addEventListener('click',function(){window.print();});
    if(copyBtn)copyBtn.addEventListener('click',function(){var text=textExport(filtered(read()));if(!text)return;copyText(text).then(function(){copyBtn.textContent='Скопировано';setTimeout(function(){copyBtn.textContent='Скопировать текст';},1600);}).catch(function(){copyBtn.textContent='Не удалось скопировать';setTimeout(function(){copyBtn.textContent='Скопировать текст';},1800);});});
    if(txtBtn)txtBtn.addEventListener('click',function(){var text=textExport(filtered(read()));if(text)download('prizhivetsya-planting-list.txt', text, 'text/plain;charset=utf-8');});
    if(csvBtn)csvBtn.addEventListener('click',function(){var text=csvExport(filtered(read()));if(text)download('prizhivetsya-planting-list.csv', text, 'text/csv;charset=utf-8');});
    root.addEventListener('input',debounce(function(e){var field=e.target.closest('[data-planting-note]');if(!field)return;var id=field.getAttribute('data-planting-note'), items=read(), changed=false;items.forEach(function(item){if(item.id===id){item.userNote=field.value;changed=true;}});if(changed)write(items);},180));
    root.addEventListener('click',function(e){var btn=e.target.closest('[data-planting-remove]');if(!btn)return;var id=btn.getAttribute('data-planting-remove'), items=read().filter(function(item){return item.id!==id;});write(items);render();updateButtons();});
    document.addEventListener('prizh:planting-list-updated',render);render();
  }
  document.addEventListener('click',function(e){var btn=e.target.closest('[data-planting-add]');if(!btn)return;e.preventDefault();toggleItem(btn);});
  document.addEventListener('DOMContentLoaded',function(){updateButtons();Array.prototype.slice.call(document.querySelectorAll('[data-planting-list-page]')).forEach(initPage);});
  document.addEventListener('prizh:planting-buttons-rendered',updateButtons);
})();
