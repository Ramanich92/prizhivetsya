/* v75: locality picker + region placeholders only */
(function(){
  function normalizeText(value){
    return String(value || '').toLowerCase().replace(/ё/g,'е').replace(/[—–-]/g,' ').replace(/s+/g,' ').trim();
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
