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
  function render(){
    const r = region.value;
    const c = crop.value;
    const levelKey = data.regions[r].matrix[c];
    const level = data.levels[levelKey];
    const regionName = data.regions[r].name;
    const cropName = data.crops[c].name;
    const note = data.notes[r][c] || '';
    const filters = (data.filters[r] || []).map(x=>`<li>${x}</li>`).join('');
    out.innerHTML = `<h3>${cropName} · ${regionName}</h3>
      <p><span class="badge ${level.cls}">${level.label}</span></p>
      <p>${note}</p>
      <div class="check-grid">
        <div class="card"><h3>Что проверить на участке</h3><ul>${filters}</ul></div>
        <div class="card"><h3>Как читать результат</h3><p>${level.text}</p><p>${data.routes[r]}</p></div>
      </div>`;
  }
  region.addEventListener('change', render);
  crop.addEventListener('change', render);
  render();
});
