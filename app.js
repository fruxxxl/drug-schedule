'use strict';

// ===================== STATE =====================

var STORAGE_KEY = 'drugScheduleConfig';
var HISTORY_KEY = 'drugScheduleHistory';
var PANEL_KEY = 'drugSchedulePanelWidth';
var DAY_MS = 86400000;
var HISTORY_MAX = 60;
var historyDebounce = null;
var lastSnapshot = null;

var defaultConfig = {
  startDate: '',
  duration: 2,
  splitMode: 30,
  orientation: 'landscape',
  customRows: 2,
  meds: []
};

var config = loadConfig();

// ===================== PERSISTENCE =====================

function loadConfig(){
  try{
    var saved = localStorage.getItem(STORAGE_KEY);
    if(saved) return JSON.parse(saved);
  }catch(e){}
  var c = JSON.parse(JSON.stringify(defaultConfig));
  if(!c.startDate){
    var d = new Date();
    d.setDate(d.getDate()+1);
    c.startDate = d.toISOString().slice(0,10);
  }
  return c;
}

function saveConfig(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); }catch(e){}
}

// ===================== HISTORY =====================

function loadHistory(){
  try{
    var saved = localStorage.getItem(HISTORY_KEY);
    if(saved) return JSON.parse(saved);
  }catch(e){}
  return [];
}

function saveHistory(h){
  try{ localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); }catch(e){}
}

function pushHistory(action){
  var snapshot = JSON.stringify(config);
  if(lastSnapshot === snapshot) return;
  lastSnapshot = snapshot;

  var h = loadHistory();
  h.push({
    id: Date.now() + '-' + Math.random().toString(36).slice(2,6),
    timestamp: new Date().toISOString(),
    action: action,
    config: JSON.parse(snapshot)
  });
  if(h.length > HISTORY_MAX) h = h.slice(-HISTORY_MAX);
  saveHistory(h);
  renderHistory();
}

function scheduleHistory(action){
  clearTimeout(historyDebounce);
  historyDebounce = setTimeout(function(){ pushHistory(action); }, 1200);
}

function restoreHistory(id){
  var h = loadHistory();
  var entry = h.find(function(e){ return e.id === id; });
  if(!entry) return;
  config = JSON.parse(JSON.stringify(entry.config));
  saveConfig();
  lastSnapshot = JSON.stringify(config);
  renderForm();
  renderPreview();
  renderHistory();
}

function deleteHistory(id){
  var h = loadHistory().filter(function(e){ return e.id !== id; });
  saveHistory(h);
  renderHistory();
}

function fmtHistoryTime(iso){
  var d = new Date(iso);
  var hh = String(d.getHours()).padStart(2,'0');
  var mm = String(d.getMinutes()).padStart(2,'0');
  return hh + ':' + mm;
}

function renderHistory(){
  var h = loadHistory();
  var container = el('historyList');
  container.innerHTML = '';

  if(h.length === 0){
    container.innerHTML = '<div class="history-empty">История пуста</div>';
    return;
  }

  var currentSnapshot = JSON.stringify(config);
  var reversed = h.slice().reverse();

  reversed.forEach(function(entry){
    var isCurrent = JSON.stringify(entry.config) === currentSnapshot;
    var item = ce('div', 'history-item' + (isCurrent ? ' current' : ''));

    var time = ce('div', 'h-time', fmtHistoryTime(entry.timestamp));
    item.appendChild(time);

    var action = ce('div', 'h-action', escapeHtml(entry.action));
    item.appendChild(action);

    var actions = ce('div', 'h-actions');
    if(!isCurrent){
      var restoreBtn = ce('button', 'btn-icon apply', '\u21BA');
      restoreBtn.title = 'Восстановить';
      restoreBtn.onclick = function(){ restoreHistory(entry.id); };
      actions.appendChild(restoreBtn);
    }
    var delBtn = ce('button', 'btn-icon del', '\u00D7');
    delBtn.title = 'Удалить';
    delBtn.onclick = function(){ deleteHistory(entry.id); };
    actions.appendChild(delBtn);
    item.appendChild(actions);

    container.appendChild(item);
  });
}

// ===================== COMMIT (save + history) =====================

function commit(action, immediate){
  saveConfig();
  renderPreview();
  if(immediate){
    clearTimeout(historyDebounce);
    pushHistory(action);
  } else {
    scheduleHistory(action);
  }
}

// ===================== DOM HELPERS =====================

function el(id){ return document.getElementById(id); }
function ce(tag, cls, html){
  var e = document.createElement(tag);
  if(cls) e.className = cls;
  if(html !== undefined) e.innerHTML = html;
  return e;
}

// ===================== FORM RENDERING =====================

function renderForm(){
  el('startDate').value = config.startDate;
  el('duration').value = config.duration;
  el('splitMode').value = config.splitMode;
  el('orientation').value = config.orientation;
  el('customRows').value = config.customRows;
  renderMedList();
}

function renderMedList(){
  var container = el('medList');
  container.innerHTML = '';

  config.meds.forEach(function(med, idx){
    var row = ce('div', 'med-row');

    var header = ce('div', 'med-header');
    header.appendChild(wrap('Название', 'field', inputEl('text', med.name, function(v){
      config.meds[idx].name = v;
      commit('Изменено: ' + (v || 'лекарство'));
    })));

    var delBtn = ce('button', 'del-btn', '\u00D7');
    delBtn.title = 'Удалить';
    delBtn.onclick = function(){
      var name = config.meds[idx].name || 'лекарство';
      config.meds.splice(idx,1);
      commit('Удалено: ' + name, true);
      renderMedList();
    };
    header.appendChild(delBtn);
    row.appendChild(header);

    var grid = ce('div', 'med-grid');

    grid.appendChild(wrap('Доза', 'field', inputEl('text', med.dose, function(v){
      config.meds[idx].dose = v;
      commit('Изменена доза');
    })));

    grid.appendChild(wrap('Примечание', 'field', inputEl('text', med.note, function(v){
      config.meds[idx].note = v;
      commit('Изменено примечание');
    })));

    var timeSel = ce('select');
    timeSel.innerHTML = '<option value="m">Утро</option><option value="e">Вечер</option>';
    timeSel.value = med.time;
    timeSel.onchange = function(){
      config.meds[idx].time = timeSel.value;
      commit('Изменено время: ' + (config.meds[idx].name || 'лекарство'), true);
      renderMedList();
    };
    grid.appendChild(wrap('Время', 'field', timeSel));

    var typeSel = ce('select');
    typeSel.innerHTML = '<option value="permanent">Постоянно</option><option value="temporary">Временно</option>';
    typeSel.value = med.type;
    typeSel.onchange = function(){
      config.meds[idx].type = typeSel.value;
      commit('Изменён тип: ' + (config.meds[idx].name || 'лекарство'), true);
      renderMedList();
    };
    grid.appendChild(wrap('Тип', 'field', typeSel));
    row.appendChild(grid);

    if(med.type === 'temporary'){
      var datesRow = ce('div', 'med-dates');
      datesRow.appendChild(wrap('С даты', 'field', dateEl(med.from, function(v){
        config.meds[idx].from = v;
        commit('Изменена дата начала', true);
      })));
      datesRow.appendChild(wrap('По дату', 'field', dateEl(med.until, function(v){
        config.meds[idx].until = v;
        commit('Изменена дата окончания', true);
      })));
      row.appendChild(datesRow);
    }

    container.appendChild(row);
  });
}

function wrap(label, cls, child){
  var f = ce('div', cls);
  var l = ce('label', null, label);
  l.appendChild(document.createElement('br'));
  l.appendChild(child);
  f.appendChild(l);
  return f;
}

function inputEl(type, value, onChange){
  var i = ce('input');
  i.type = type;
  i.value = value || '';
  i.addEventListener('input', function(){ onChange(i.value); });
  return i;
}

function dateEl(value, onChange){
  var i = ce('input');
  i.type = 'date';
  i.value = value || '';
  i.addEventListener('input', function(){ onChange(i.value); });
  return i;
}

// ===================== DATE UTILS =====================

function parseDate(s){
  if(!s) return null;
  var parts = s.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
}

function dateToIdx(date, startMs){
  return Math.round((date.getTime() - startMs) / DAY_MS);
}

function addDays(date, n){
  var d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtDate(d){
  var months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

// ===================== TABLE GENERATION =====================

function buildTableHTML(meds, startDate, offset, days, customRows){
  var dn = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  var startMs = startDate.getTime();

  var h = '<colgroup><col style="width:66mm">';
  for(var i=0; i<days; i++) h += '<col>';
  h += '</colgroup>';

  h += '<tr><th class="dh">Лекарство / Доза</th>';
  for(i=0; i<days; i++){
    var d = addDays(startDate, offset+i);
    var we = (i>0 && i%7===6 && i<days-1) ? ' we' : '';
    h += '<th class="dh'+we+'">'+d.getDate()+'<br><span class="dw">'+dn[d.getDay()]+'</span></th>';
  }
  h += '</tr>';

  var morning = meds.filter(function(m){ return m.time==='m'; });
  if(morning.length > 0 || customRows > 0){
    h += '<tr><th class="sh m" colspan="'+(days+1)+'">\u2600 УТРО</th></tr>';
    morning.forEach(function(med){
      h += medRowHTML(med, startMs, offset, days);
    });
    for(i=0; i<customRows; i++){
      h += emptyRowHTML(days, 'm');
    }
  }

  var evening = meds.filter(function(m){ return m.time==='e'; });
  if(evening.length > 0 || customRows > 0){
    h += '<tr><th class="sh e" colspan="'+(days+1)+'">\u263E ВЕЧЕР</th></tr>';
    evening.forEach(function(med){
      h += medRowHTML(med, startMs, offset, days);
    });
    for(i=0; i<customRows; i++){
      h += emptyRowHTML(days, 'e');
    }
  }

  return h;
}

function medRowHTML(med, startMs, offset, days){
  var tag, tagClass;
  if(med.type === 'permanent'){
    tag = 'постоянно'; tagClass = 'p';
  } else {
    var parts = [];
    if(med.from) parts.push('с ' + fmtShort(med.from));
    if(med.until) parts.push('до ' + fmtShort(med.until));
    tag = parts.join(' ') || 'временно';
    tagClass = 't';
  }

  var noteText = med.dose || '';
  if(med.note) noteText = (noteText ? noteText + ' ' : '') + '(' + med.note + ')';

  var h = '<tr class="mr m"><td class="nc">'+escapeHtml(med.name)+' <span class="'+tagClass+'">'+escapeHtml(tag)+'</span><small>'+escapeHtml(noteText)+'</small></td>';

  var fromIdx = med.from ? dateToIdx(parseDate(med.from), startMs) : -Infinity;
  var untilIdx = med.until ? dateToIdx(parseDate(med.until), startMs) : Infinity;

  for(var i=0; i<days; i++){
    var gi = offset + i;
    var active = gi >= fromIdx && gi <= untilIdx;
    var we = (i>0 && i%7===6 && i<days-1) ? ' we' : '';
    if(active){
      h += '<td class="dc'+we+'"><span class="cb"></span></td>';
    } else {
      h += '<td class="dc'+we+'"></td>';
    }
  }
  h += '</tr>';
  return h;
}

function emptyRowHTML(days, timeClass){
  var h = '<tr class="mr '+timeClass+'"><td class="nc">&nbsp;</td>';
  for(var i=0; i<days; i++){
    var we = (i>0 && i%7===6 && i<days-1) ? ' we' : '';
    h += '<td class="dc'+we+'"><span class="cb"></span></td>';
  }
  h += '</tr>';
  return h;
}

function fmtShort(dateStr){
  var d = parseDate(dateStr);
  if(!d) return '';
  var m = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  return d.getDate() + ' ' + m[d.getMonth()];
}

function escapeHtml(s){
  if(!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===================== PREVIEW =====================

function renderPreview(){
  if(!config.startDate){ el('preview').innerHTML = '<p style="color:#fff;padding:20px">Укажите дату начала</p>'; return; }

  var startDate = parseDate(config.startDate);
  var totalDays = config.duration * 30;
  var splitMode = parseInt(config.splitMode);
  var pageSizes = computePageSizes(totalDays, splitMode);

  var pageW = config.orientation === 'landscape' ? 297 : 210;
  var zoom = parseInt(el('zoom').value) / 100;

  var preview = el('preview');
  preview.innerHTML = '';
  var currentOffset = 0;

  pageSizes.forEach(function(days){
    var sheet = ce('div', 'page-sheet');
    sheet.style.width = (pageW * 3.7795 * zoom) + 'px';

    var periodStart = addDays(startDate, currentOffset);
    var periodEnd = addDays(startDate, currentOffset + days - 1);

    var html = '<div class="sheet-title">Таблица приема лекарств</div>';
    html += '<div class="sheet-sub">Отмечайте галочкой каждый прием</div>';
    html += '<div class="month-title">'+fmtDate(periodStart)+' &mdash; '+fmtDate(periodEnd)+'</div>';
    html += '<table>'+buildTableHTML(config.meds, startDate, currentOffset, days, parseInt(config.customRows))+'</table>';

    var hasPerm = config.meds.some(function(m){ return m.type==='permanent'; });
    var hasTemp = config.meds.some(function(m){ return m.type==='temporary'; });
    var legendParts = [];
    if(hasPerm) legendParts.push('<span class="p">постоянно</span> &mdash; пожизненно');
    if(hasTemp) legendParts.push('<span class="t">временно</span> &mdash; курс');
    if(legendParts.length) html += '<p class="legend">'+legendParts.join('&nbsp;&nbsp;')+'</p>';

    sheet.innerHTML = html;
    preview.appendChild(sheet);
    currentOffset += days;
  });
}

function computePageSizes(totalDays, splitMode){
  var sizes = [];
  if(splitMode > 0){
    var offset = 0;
    while(offset < totalDays){
      sizes.push(Math.min(splitMode, totalDays - offset));
      offset += splitMode;
    }
  } else {
    sizes.push(totalDays);
  }
  return sizes;
}

// ===================== PRINT =====================

function buildPagesHTML(meds, startDate, pageSizes, customRows){
  var html = '';
  var currentOffset = 0;
  pageSizes.forEach(function(days){
    var periodStart = addDays(startDate, currentOffset);
    var periodEnd = addDays(startDate, currentOffset + days - 1);
    html += '<div class="print-page">\n';
    html += '<div class="sheet-title">Таблица приема лекарств</div>\n';
    html += '<div class="sheet-sub">Отмечайте галочкой каждый прием</div>\n';
    html += '<div class="month-title">'+fmtDate(periodStart)+' &mdash; '+fmtDate(periodEnd)+'</div>\n';
    html += '<table>'+buildTableHTML(meds, startDate, currentOffset, days, customRows)+'</table>\n';
    var hasPerm = meds.some(function(m){ return m.type==='permanent'; });
    var hasTemp = meds.some(function(m){ return m.type==='temporary'; });
    var lp = [];
    if(hasPerm) lp.push('<span class="p">постоянно</span> &mdash; пожизненно');
    if(hasTemp) lp.push('<span class="t">временно</span> &mdash; курс');
    if(lp.length) html += '<p class="legend">'+lp.join('&nbsp;&nbsp;')+'</p>\n';
    html += '</div>\n';
    currentOffset += days;
  });
  return html;
}

function printSchedule(){
  var printWindow = window.open('', '_blank');
  if(!printWindow){ alert('Разрешите всплывающие окна для печати'); return; }

  var startDate = parseDate(config.startDate);
  var totalDays = config.duration * 30;
  var splitMode = parseInt(config.splitMode);
  var pageSizes = computePageSizes(totalDays, splitMode);
  var daysPerTable = splitMode > 0 ? splitMode : totalDays;

  var pagesHTML = buildPagesHTML(config.meds, startDate, pageSizes, parseInt(config.customRows));

  var html = '<!DOCTYPE html>\n<html lang="ru">\n<head>\n<meta charset="UTF-8">\n';
  html += '<title>Таблица приема лекарств</title>\n<style>\n';
  html += getPrintCSS(config.orientation, daysPerTable);
  html += '</style>\n</head>\n<body>\n' + pagesHTML;
  html += '<script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script>\n';
  html += '</body>\n</html>';

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function getPrintCSS(orientation, daysPerTable){
  var usableW = orientation === 'landscape' ? 287 : 200;
  var nameColW = 66;
  var dateColW = (usableW - nameColW) / daysPerTable;
  var cbSize = Math.min(7, Math.max(3, dateColW * 0.8));

  return ''+
    '@page{size:A4 '+orientation+';margin:5mm}\n'+
    '*{margin:0;padding:0;box-sizing:border-box}\n'+
    'body{font-family:Arial,Helvetica,sans-serif;color:#111}\n'+
    '.print-page{page-break-after:always;padding:4mm}\n'+
    '.print-page:last-child{page-break-after:auto}\n'+
    '.sheet-title{text-align:center;font-size:22pt;font-weight:bold;margin-bottom:1mm}\n'+
    '.sheet-sub{text-align:center;font-size:12pt;color:#555;margin-bottom:3mm}\n'+
    '.month-title{text-align:center;font-size:16pt;font-weight:bold;margin:2mm 0 4mm;color:#333}\n'+
    'table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:3mm}\n'+
    'th,td{border:.5pt solid #999;text-align:center;padding:0;vertical-align:middle}\n'+
    '.nc{text-align:left;padding:2mm 3mm;font-size:18pt;white-space:nowrap;width:'+nameColW+'mm;font-weight:bold;line-height:1.3}\n'+
    '.nc small{font-weight:normal;font-size:12pt;color:#555;display:block}\n'+
    '.dh{background:#e2e2e2;font-size:13pt;font-weight:bold;border-bottom:.7pt solid #444;height:11mm}\n'+
    '.dh .dw{font-weight:normal;font-size:9pt;color:#777}\n'+
    '.sh{font-size:15pt;font-weight:bold;height:10mm;letter-spacing:.5px}\n'+
    '.sh.m{background:#fff3d6;color:#b07000;border-bottom:.7pt solid #e8c070}\n'+
    '.sh.e{background:#dce5f7;color:#2a3a80;border-bottom:.7pt solid #8aa0d0}\n'+
    '.sh.c{background:#f0f0f0;color:#666;border-bottom:.7pt solid #aaa}\n'+
    '.mr{height:11mm}\n'+
    '.mr.m{background:#fffdf7}\n'+
    '.mr.e{background:#f3f6ff}\n'+
    '.dc{border:none}\n'+
    '.dc .cb{display:block;width:'+cbSize+'mm;height:'+cbSize+'mm;border:1pt solid #555;border-radius:1mm;margin:0 auto}\n'+
    '.we{border-right:1.2pt solid #555}\n'+
    '.p{background:#dceedd;color:#2a6a2a;padding:.5mm 2.5mm;border-radius:.5mm;font-weight:normal;font-size:10pt;display:inline-block}\n'+
    '.t{background:#ffe8cc;color:#a06000;padding:.5mm 2.5mm;border-radius:.5mm;font-weight:normal;font-size:10pt;display:inline-block}\n'+
    '.legend{font-size:11pt;color:#555;margin-top:2mm;padding:0 4mm}\n';
}

// ===================== DOWNLOAD STANDALONE HTML =====================

function downloadHTML(){
  var startDate = parseDate(config.startDate);
  var totalDays = config.duration * 30;
  var splitMode = parseInt(config.splitMode);
  var pageSizes = computePageSizes(totalDays, splitMode);
  var daysPerTable = splitMode > 0 ? splitMode : totalDays;

  var pagesHTML = buildPagesHTML(config.meds, startDate, pageSizes, parseInt(config.customRows));
  var html = '<!DOCTYPE html>\n<html lang="ru">\n<head>\n<meta charset="UTF-8">\n';
  html += '<title>Таблица приема лекарств</title>\n<style>\n' + getPrintCSS(config.orientation, daysPerTable) + '</style>\n';
  html += '</head>\n<body>\n' + pagesHTML + '</body>\n</html>';

  var blob = new Blob([html], {type:'text/html;charset=utf-8'});
  var url = URL.createObjectURL(blob);
  var a = ce('a');
  a.href = url;
  a.download = 'medication-schedule.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===================== EXPORT / IMPORT JSON =====================

function exportJSON(){
  var data = {
    exportedAt: new Date().toISOString(),
    current: config,
    history: loadHistory()
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json;charset=utf-8'});
  var url = URL.createObjectURL(blob);
  var a = ce('a');
  a.href = url;
  a.download = 'drug-schedule-backup.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importJSON(file){
  var reader = new FileReader();
  reader.onload = function(e){
    try{
      var data = JSON.parse(e.target.result);
      if(data.current && data.current.meds){
        config = data.current;
        saveConfig();
        renderForm();
        renderPreview();
      }
      if(data.history && Array.isArray(data.history)){
        saveHistory(data.history);
        renderHistory();
      }
      alert('Загружено успешно');
    }catch(err){
      alert('Ошибка чтения файла: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ===================== PANEL RESIZE =====================

function initPanelResize(){
  var panel = el('formPanel');
  var divider = el('panelDivider');

  var savedW = localStorage.getItem(PANEL_KEY);
  if(savedW){
    var w = parseInt(savedW);
    if(w >= 300 && w <= 700) panel.style.width = w + 'px';
  }

  var dragging = false;
  var startX = 0;
  var startW = 0;

  divider.addEventListener('mousedown', function(e){
    dragging = true;
    startX = e.clientX;
    startW = panel.offsetWidth;
    divider.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e){
    if(!dragging) return;
    var delta = e.clientX - startX;
    var newW = Math.max(300, Math.min(700, startW + delta));
    panel.style.width = newW + 'px';
  });

  document.addEventListener('mouseup', function(){
    if(!dragging) return;
    dragging = false;
    divider.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem(PANEL_KEY, panel.offsetWidth);
  });
}

// ===================== EVENTS =====================

function bindEvents(){
  el('startDate').addEventListener('input', function(){
    config.startDate = el('startDate').value;
    commit('Изменена дата начала', true);
  });
  el('duration').addEventListener('change', function(){
    config.duration = parseInt(el('duration').value);
    commit('Изменена длительность', true);
  });
  el('splitMode').addEventListener('change', function(){
    config.splitMode = el('splitMode').value;
    commit('Изменена разбивка', true);
  });
  el('orientation').addEventListener('change', function(){
    config.orientation = el('orientation').value;
    commit('Изменена ориентация', true);
  });
  el('customRows').addEventListener('change', function(){
    config.customRows = parseInt(el('customRows').value);
    commit('Изменено кол-во пустых строк', true);
  });

  el('addMed').onclick = function(){
    config.meds.push({name:'', dose:'', note:'', time:'m', type:'permanent', from:'', until:''});
    commit('Добавлено лекарство', true);
    renderMedList();
  };

  el('printBtn').onclick = printSchedule;
  el('downloadBtn').onclick = downloadHTML;

  el('resetBtn').onclick = function(){
    if(!confirm('Сбросить всё? История также будет очищена.')) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(PANEL_KEY);
    config = loadConfig();
    lastSnapshot = null;
    renderForm();
    renderHistory();
    renderPreview();
  };

  el('zoom').addEventListener('input', renderPreview);

  el('exportBtn').onclick = exportJSON;
  el('importBtn').onclick = function(){ el('importFile').click(); };
  el('importFile').onchange = function(e){
    if(e.target.files[0]) importJSON(e.target.files[0]);
    e.target.value = '';
  };
}

// ===================== INIT =====================

function init(){
  bindEvents();
  initPanelResize();
  renderForm();
  renderHistory();
  saveConfig();
  lastSnapshot = JSON.stringify(config);
  renderPreview();
}

document.addEventListener('DOMContentLoaded', init);
