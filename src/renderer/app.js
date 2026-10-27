/* global L, api */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// ---------- common helpers ----------

const ORIENTATION_CSS = {
  2: 'scaleX(-1)', 3: 'rotate(180deg)', 4: 'scaleY(-1)', 5: 'rotate(90deg) scaleX(-1)',
  6: 'rotate(90deg)', 7: 'rotate(270deg) scaleX(-1)', 8: 'rotate(270deg)',
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtLocal(local) {
  return local ? local.replace('T', ' ') : '없음';
}

function fmtSize(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fmtGps(gps) {
  if (!gps) return '없음';
  const alt = gps.alt !== null ? `, ${gps.alt.toFixed(1)} m` : '';
  return `${gps.lat.toFixed(6)}, ${gps.lon.toFixed(6)}${alt}`;
}

function fillInfo(dl, meta) {
  const rows = [
    ['파일', meta.name],
    ['형식', `${meta.typeLabel} · ${fmtSize(meta.size)}${meta.width ? ` · ${meta.width}×${meta.height}` : ''}`],
    ['촬영 일시', fmtLocal(meta.taken) + (meta.offset ? ` (${meta.offset})` : '')],
    ['수정 일시', fmtLocal(meta.modified)],
    ['파일 수정 시각', fmtLocal(meta.fileModified)],
    ['카메라', meta.camera || '없음'],
    ['렌즈', meta.lens || '없음'],
    ['GPS', fmtGps(meta.gps)],
  ];
  dl.innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
}

function showResult(el, res, onReload) {
  el.hidden = false;
  if (!res.ok) {
    el.className = 'result error';
    el.textContent = res.error;
    return;
  }
  el.className = 'result';
  const warnings = res.data.warnings.length
    ? `<ul>${res.data.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '';
  const folderLabel = api.platform === 'darwin' ? 'Finder에서 보기' : '탐색기에서 보기';
  el.innerHTML = `<div>저장했습니다.</div><div class="path">${esc(res.data.output)}</div>${warnings}
    <div class="actions"><button type="button" class="small" data-act="folder">${folderLabel}</button>
    <button type="button" class="small" data-act="reload">저장된 파일 불러오기</button></div>`;
  el.querySelector('[data-act=folder]').onclick = () => api.showInFolder(res.data.output);
  el.querySelector('[data-act=reload]').onclick = () => onReload(res.data.output);
}

// A drop zone that accepts one photo by drag-and-drop or click.
function dropZone(el, onFile, title) {
  el.addEventListener('click', async () => {
    const res = await api.pickFile(title);
    if (res.ok && res.data) onFile(res.data);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
  });
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('over');
    const f = e.dataTransfer.files[0];
    if (f) onFile(api.pathForFile(f));
  });
}

async function loadInto(el, file) {
  const msg = el.querySelector('.drop-msg');
  const img = el.querySelector('.drop-img');
  el.classList.add('busy');
  msg.className = 'drop-msg';
  msg.textContent = '';
  const res = await api.read(file);
  el.classList.remove('busy');
  if (!res.ok) {
    el.classList.remove('loaded');
    img.removeAttribute('src');
    msg.className = 'drop-msg error';
    msg.textContent = res.error;
    return null;
  }
  const meta = res.data;
  el.classList.add('loaded');
  img.style.transform = '';
  if (meta.preview) {
    img.src = meta.preview.src;
    if (meta.preview.applyOrientation) img.style.transform = ORIENTATION_CSS[meta.orientation] || '';
  } else {
    img.removeAttribute('src');
    msg.textContent = `미리보기를 만들 수 없습니다${meta.previewError ? `: ${meta.previewError}` : ''}`;
  }
  return meta;
}

// Prevent dropping a file anywhere else from navigating the window.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

// ---------- tabs ----------

$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach((t) => {
      t.classList.toggle('active', t === tab);
      t.setAttribute('aria-selected', String(t === tab));
    });
    $('#tab-edit').hidden = tab.dataset.tab !== 'edit';
    $('#tab-copy').hidden = tab.dataset.tab !== 'copy';
    if (tab.dataset.tab === 'edit' && map) map.invalidateSize();
  });
});

// ---------- edit tab ----------

const OFFSETS = (() => {
  const list = [];
  for (let h = -12; h <= 14; h++) list.push(h * 60);
  list.push(-570, -210, 210, 270, 330, 345, 390, 525, 570, 630, 765, 825);
  return [...new Set(list)].sort((a, b) => a - b).map((m) => {
    const abs = Math.abs(m);
    return `${m < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  });
})();
$('#offset').innerHTML = OFFSETS.map((o) => `<option value="${o}">UTC${o}</option>`).join('');

const edit = {
  meta: null,
  overrides: new Map(), // tag -> value typed in the advanced table
  excluded: new Set(),  // tags unchecked in the advanced table
  plan: [],
};
let map = null;
let marker = null;

function gpsMode() {
  return $('input[name=gpsmode]:checked').value;
}

function setGpsMode(mode) {
  $(`input[name=gpsmode][value=${mode}]`).checked = true;
  $('.gps-inputs').classList.toggle('disabled', mode !== 'set');
  refreshPlan();
}

function ensureMap() {
  if (map) return;
  map = L.map('map', { worldCopyJump: true }).setView([37.5665, 126.978], 3);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  map.on('click', (e) => {
    const lon = ((e.latlng.lng + 540) % 360) - 180;
    $('#lat').value = e.latlng.lat.toFixed(6);
    $('#lon').value = lon.toFixed(6);
    setGpsMode('set');
    placeMarker(e.latlng.lat, lon, false);
  });
}

function placeMarker(lat, lon, pan) {
  ensureMap();
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    if (marker) { marker.remove(); marker = null; }
    return;
  }
  if (!marker) {
    marker = L.circleMarker([lat, lon], { radius: 8, color: '#ffffff', weight: 2, fillColor: '#2f6f5e', fillOpacity: 1 }).addTo(map);
  } else {
    marker.setLatLng([lat, lon]);
  }
  if (pan) map.setView([lat, lon], Math.max(map.getZoom(), 13));
}

function onCoordInput() {
  // Accept "lat, lon" pasted into either field.
  const both = ($('#lat').value + ' ' + $('#lon').value).match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
  if (both && ($('#lat').value.includes(',') || $('#lon').value.includes(','))) {
    $('#lat').value = both[1];
    $('#lon').value = both[2];
  }
  if (gpsMode() !== 'set') setGpsMode('set');
  placeMarker(parseFloat($('#lat').value), parseFloat($('#lon').value), true);
}
['#lat', '#lon'].forEach((s) => $(s).addEventListener('change', onCoordInput));
$('#alt').addEventListener('change', () => { if (gpsMode() !== 'set') setGpsMode('set'); });
$$('input[name=gpsmode]').forEach((r) => r.addEventListener('change', () => setGpsMode(gpsMode())));

function currentValue(tag) {
  const tags = edit.meta.tags;
  return tags[tag] !== undefined ? String(tags[tag]) : '';
}

async function refreshPlan() {
  if (!edit.meta) return;
  const mode = gpsMode();
  const res = await api.planDates({
    type: edit.meta.type,
    taken: $('#taken').value || null,
    modified: $('#modified').value || null,
    offset: $('#offset').value,
    gpsPresent: mode === 'set' || (mode === 'keep' && Boolean(edit.meta.gps)),
    xmpGps: edit.meta.hasXmpGps,
    fileTimes: $('#filetimes').checked,
  });
  if (!res.ok) {
    $('#plan').innerHTML = `<tr><td>${esc(res.error)}</td></tr>`;
    return;
  }
  edit.plan = res.data;
  const active = edit.plan.filter((p) => !edit.excluded.has(p.tag)).length;
  $('#plan-count').textContent = `(${active}개)`;
  $('#plan').innerHTML = '<tr><th></th><th>구분</th><th>항목</th><th>태그</th><th>현재 값</th><th>새 값</th></tr>'
    + edit.plan.map((p) => {
      const on = !edit.excluded.has(p.tag);
      const val = edit.overrides.has(p.tag) ? edit.overrides.get(p.tag) : p.value;
      return `<tr class="${on ? '' : 'off'}" data-tag="${esc(p.tag)}">
        <td><input type="checkbox" ${on ? 'checked' : ''}></td>
        <td class="grp">${esc(p.group)}</td><td>${esc(p.label)}</td>
        <td class="tag">${esc(p.tag)}</td><td class="val">${esc(currentValue(p.tag)) || '<span class="cur">없음</span>'}</td>
        <td><input type="text" class="${edit.overrides.has(p.tag) ? 'edited' : ''}" value="${esc(val)}" placeholder="(삭제)"></td></tr>`;
    }).join('');
}

$('#plan').addEventListener('change', (e) => {
  const tr = e.target.closest('tr[data-tag]');
  if (!tr) return;
  const tag = tr.dataset.tag;
  if (e.target.type === 'checkbox') {
    if (e.target.checked) edit.excluded.delete(tag); else edit.excluded.add(tag);
    tr.classList.toggle('off', !e.target.checked);
    $('#plan-count').textContent = `(${edit.plan.filter((p) => !edit.excluded.has(p.tag)).length}개)`;
  } else {
    edit.overrides.set(tag, e.target.value.trim());
    e.target.classList.add('edited');
  }
});

['#taken', '#modified', '#filetimes'].forEach((s) => $(s).addEventListener('change', refreshPlan));
$('#offset').addEventListener('change', refreshPlan);
$('#same-as-taken').addEventListener('click', () => {
  $('#modified').value = $('#taken').value;
  refreshPlan();
});

async function loadEdit(file) {
  const meta = await loadInto($('#edit-drop'), file);
  if (!meta) {
    edit.meta = null;
    $('#edit-info').innerHTML = '';
    $('#edit-alltags').innerHTML = '';
    $('#edit-result').hidden = true;
    $('#edit-form').setAttribute('aria-disabled', 'true');
    $('#save').disabled = true;
    return;
  }
  edit.meta = meta;
  edit.overrides.clear();
  edit.excluded.clear();
  $('#edit-result').hidden = true;
  $('#edit-form').setAttribute('aria-disabled', 'false');
  $('#save').disabled = false;
  fillInfo($('#edit-info'), meta);

  $('#edit-alltags').innerHTML = '<tr><th>태그</th><th>값</th></tr>' + Object.entries(meta.tags)
    .map(([k, v]) => `<tr><td class="tag">${esc(k)}</td><td class="val">${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`).join('');

  const fallback = meta.fileModified || null;
  $('#taken').value = meta.taken || fallback || '';
  $('#modified').value = meta.modified || fallback || '';
  $('#taken-cur').textContent = meta.taken ? `현재 ${fmtLocal(meta.taken)}` : '현재 값 없음 (파일 수정 시각으로 채움)';
  $('#modified-cur').textContent = meta.modified ? `현재 ${fmtLocal(meta.modified)}` : '현재 값 없음';
  let offset = meta.offset;
  if (!offset || !OFFSETS.includes(offset)) {
    const res = await api.localOffset($('#taken').value || null);
    offset = res.ok ? res.data : '+00:00';
  }
  $('#offset').value = offset;
  $('#offset-cur').textContent = meta.offset ? `현재 UTC${meta.offset}` : '현재 값 없음 (이 컴퓨터 시간대로 채움)';

  $('#gps-cur').textContent = `현재 ${fmtGps(meta.gps)}`;
  $('#lat').value = meta.gps ? meta.gps.lat.toFixed(6) : '';
  $('#lon').value = meta.gps ? meta.gps.lon.toFixed(6) : '';
  $('#alt').value = meta.gps && meta.gps.alt !== null ? meta.gps.alt.toFixed(1) : '';
  setGpsMode('keep');
  ensureMap();
  map.invalidateSize();
  if (meta.gps) placeMarker(meta.gps.lat, meta.gps.lon, true);
  else { placeMarker(NaN, NaN); map.setView([37.5665, 126.978], 3); }
}

dropZone($('#edit-drop'), loadEdit, '편집할 사진 선택');

$('#save').addEventListener('click', async () => {
  if (!edit.meta) return;
  const btn = $('#save');
  btn.disabled = true;
  btn.textContent = '저장 중…';
  try {
    await refreshPlan();
    const dates = edit.plan
      .filter((p) => !edit.excluded.has(p.tag))
      .map((p) => ({ tag: p.tag, value: edit.overrides.has(p.tag) ? edit.overrides.get(p.tag) : p.value }));
    const mode = gpsMode();
    const gps = { mode, lat: $('#lat').value, lon: $('#lon').value, alt: $('#alt').value, xmp: edit.meta.hasXmpGps };
    const res = await api.saveEdits({ file: edit.meta.file, dates, gps });
    showResult($('#edit-result'), res, loadEdit);
  } finally {
    btn.disabled = false;
    btn.textContent = '새 파일로 저장';
  }
});

// ---------- copy tab ----------

const copy = { src: null, dst: null };

function updateCopyButton() {
  $('#copy').disabled = !(copy.src && copy.dst);
}

async function loadSide(side, file) {
  const meta = await loadInto($(`#${side}-drop`), file);
  copy[side] = meta;
  if (meta) fillInfo($(`#${side}-info`), meta);
  else $(`#${side}-info`).innerHTML = '';
  $('#copy-result').hidden = true;
  updateCopyButton();
}

dropZone($('#src-drop'), (f) => loadSide('src', f), '원본 사진 선택');
dropZone($('#dst-drop'), (f) => loadSide('dst', f), '대상 사진 선택');

$('#swap').addEventListener('click', async () => {
  const { src, dst } = copy;
  await Promise.all([
    dst ? loadSide('src', dst.file) : Promise.resolve(),
    src ? loadSide('dst', src.file) : Promise.resolve(),
  ]);
  if (!dst) resetSide('src');
  if (!src) resetSide('dst');
});

function resetSide(side) {
  copy[side] = null;
  const el = $(`#${side}-drop`);
  el.classList.remove('loaded');
  el.querySelector('.drop-img').removeAttribute('src');
  el.querySelector('.drop-msg').textContent = '';
  $(`#${side}-info`).innerHTML = '';
  updateCopyButton();
}

function syncGroups() {
  $('#groups').classList.toggle('disabled', $('input[name=copymode]:checked').value !== 'groups');
}
$$('input[name=copymode]').forEach((r) => r.addEventListener('change', syncGroups));
syncGroups();

$('#copy').addEventListener('click', async () => {
  const btn = $('#copy');
  btn.disabled = true;
  btn.textContent = '복제 중…';
  try {
    const res = await api.copyExif({
      source: copy.src.file,
      target: copy.dst.file,
      mode: $('input[name=copymode]:checked').value,
      groups: $$('#groups input:checked').map((c) => c.value),
      replace: $('#replace').checked,
      fileTimes: $('#copy-filetimes').checked,
    });
    showResult($('#copy-result'), res, (f) => loadSide('dst', f));
  } finally {
    btn.textContent = '복제해서 새 파일로 저장';
    updateCopyButton();
  }
});
