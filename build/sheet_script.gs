/**
 * 貼進 Google 試算表的 Apps Script，把表單收到的 JSON 自動展開成兩張表：
 *
 *   明細 Detail  一位受試者一列，一題一欄，格子裡是他選的方法
 *   總分 Totals  各方法的得票數與勝率，object / scene 分開算
 *
 * 安裝：試算表 -> 擴充功能 -> Apps Script -> 貼上這整份 -> 儲存
 *       -> 上方函式選單選 setUp -> 執行（會要求授權，按「允許」）
 * 之後每收到一份新回覆就自動重算；也可以從選單「User Study -> 立即重算」手動跑。
 */

var DETAIL = '明細 Detail';
var TOTALS = '總分 Totals';

var LABELS = {
  ours: 'Ours', blenderag: 'BlenderRAG', viga: 'VIGA',
  cb_one_shot: '3DCodeBench-1shot', cb_harness: '3DCodeBench-harness',
  infinigen: 'Infinigen',
  Ours: 'Ours', VIGA: 'VIGA', ClaudeOpus: 'ClaudeOpus',
  Code2World: 'Code2World', Infinigen: 'Infinigen'
};
var QLABEL = { align: '符合描述', quality: '3D品質', realism: '場景真實感' };

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('User Study')
    .addItem('立即重算', 'rebuild')
    .addItem('診斷', 'diagnose')
    .addToUi();
}

/** 找不出資料時跑這個，執行記錄會印出它到底看到什麼。 */
function diagnose() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('試算表: %s', ss.getName());
  ss.getSheets().forEach(function (sh) {
    Logger.log('  分頁 "%s"  %s 列 x %s 欄', sh.getName(), sh.getLastRow(), sh.getLastColumn());
  });
  var src = sourceSheet_(ss);
  Logger.log('判定來源分頁: "%s"', src.getName());
  var v = src.getDataRange().getValues();
  Logger.log('讀到 %s 列', v.length);
  if (v.length < 2) { Logger.log('!! 少於 2 列，沒有資料可處理'); return; }
  Logger.log('標題列: %s', JSON.stringify(v[0]));
  for (var r = 1; r < Math.min(v.length, 3); r++) {
    Logger.log('--- 第 %s 列 ---', r + 1);
    for (var c = 0; c < v[r].length; c++) {
      var t = String(v[r][c] == null ? '' : v[r][c]);
      Logger.log('  欄 %s  長度=%s  開頭=%s', c + 1, t.length,
                 JSON.stringify(t.slice(0, 60)));
    }
    Logger.log('  findResponses_ -> %s',
               findResponses_(v[r]) ? '找到 (' + findResponses_(v[r]).length + ' 字)' : '!! 沒找到');
    Logger.log('  findMeta_      -> %s', findMeta_(v[r]) ? '找到' : '沒找到');
  }
}

/** 執行這個安裝自動重算的觸發器（只需跑一次）。 */
function setUp() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'rebuild') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('rebuild').forSpreadsheet(ss).onFormSubmit().create();
  rebuild();
  SpreadsheetApp.getUi().alert('安裝完成，之後每收到一份回覆就會自動重算。');
}

/** 找出表單回覆那張工作表（不是我們自己產生的兩張）。 */
function sourceSheet_(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (name === DETAIL || name === TOTALS) continue;
    if (sheets[i].getLastRow() >= 1) return sheets[i];
  }
  return sheets[0];
}

/** 從一列裡找出 responses 那一格。只要含 chosen_method 就算，並切掉前後雜訊。 */
function findResponses_(row) {
  for (var i = 0; i < row.length; i++) {
    var v = String(row[i] == null ? '' : row[i]);
    if (v.indexOf('chosen_method') < 0) continue;
    var a = v.indexOf('['), b = v.lastIndexOf(']');
    if (a >= 0 && b > a) return v.slice(a, b + 1);
  }
  return null;
}

/** meta 那一格：含 started_at 或 lang 的 JSON 物件。 */
function findMeta_(row) {
  for (var i = 0; i < row.length; i++) {
    var v = String(row[i] == null ? '' : row[i]);
    if (v.indexOf('chosen_method') >= 0) continue;      // 那是 responses
    if (v.indexOf('started_at') < 0 && v.indexOf('"lang"') < 0) continue;
    var a = v.indexOf('{'), b = v.lastIndexOf('}');
    if (a >= 0 && b > a) return v.slice(a, b + 1);
  }
  return null;
}

function label_(m) { return LABELS[m] || m; }

function rebuild() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = sourceSheet_(ss);
  var values = src.getDataRange().getValues();
  Logger.log('來源分頁 "%s"，讀到 %s 列', src.getName(), values.length);
  if (values.length < 2) {
    Logger.log('沒有資料列，結束。');
    return;
  }

  var people = [];                        // 每位受試者一筆
  var cols = { object: [], scene: [] };   // 題目欄位的出現順序
  var seenCol = {};

  for (var r = 1; r < values.length; r++) {
    var raw = findResponses_(values[r]);
    if (!raw) continue;
    var answers;
    try { answers = JSON.parse(raw); } catch (e) { continue; }
    if (!answers.length) continue;

    var meta = {};
    var mraw = findMeta_(values[r]);
    if (mraw) { try { meta = JSON.parse(mraw); } catch (e) {} }

    var picks = {}, totalMs = 0, seenCase = {};
    for (var a = 0; a < answers.length; a++) {
      var x = answers[a];
      var key = x.level + ' ' + x.case_id + ' ' + x.question;
      picks[key] = x;
      if (!seenCol[key]) {
        seenCol[key] = true;
        cols[x.level].push({ key: key, case_id: x.case_id, question: x.question });
      }
      if (!seenCase[x.level + x.case_id]) {
        seenCase[x.level + x.case_id] = true;
        totalMs += x.rt_ms || 0;
      }
    }
    people.push({
      time: values[r][0],
      name: meta.name || String(values[r][1] || ''),
      lang: meta.lang || '',
      mins: totalMs / 60000,
      picks: picks,
      answers: answers
    });
  }
  Logger.log('解析出 %s 位受試者，%s 個物件欄 + %s 個場景欄',
             people.length, cols.object.length, cols.scene.length);
  if (!people.length) {
    Logger.log('!! 每一列都找不到 responses JSON —— 執行「診斷」看各欄內容。');
    return;
  }

  writeDetail_(ss, people, cols);
  writeTotals_(ss, people);
  Logger.log('完成：已更新「%s」與「%s」', DETAIL, TOTALS);
}

function writeDetail_(ss, people, cols) {
  var sh = ss.getSheetByName(DETAIL) || ss.insertSheet(DETAIL);
  sh.clear();
  sh.setConditionalFormatRules([]);

  var all = cols.object.concat(cols.scene);
  var head1 = ['', '', '', ''], head2 = ['時間', '姓名', '語言', '費時(分)'];
  for (var i = 0; i < all.length; i++) {
    head1.push((all[i].key.indexOf('object') === 0 ? '物件 ' : '場景 ') + all[i].case_id);
    head2.push(QLABEL[all[i].question] || all[i].question);
  }
  var rows = [head1, head2];

  for (var p = 0; p < people.length; p++) {
    var row = [people[p].time, people[p].name, people[p].lang,
               Math.round(people[p].mins * 10) / 10];
    for (var i = 0; i < all.length; i++) {
      var pick = people[p].picks[all[i].key];
      row.push(pick ? label_(pick.chosen_method) + ' (' + pick.chosen_slot + ')' : '');
    }
    rows.push(row);
  }

  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.getRange(1, 1, 2, rows[0].length).setFontWeight('bold')
    .setBackground('#e8f0fa').setHorizontalAlignment('center');
  sh.setFrozenRows(2);
  sh.setFrozenColumns(2);

  // 把 Ours 的格子標綠，方便一眼掃過去
  if (rows.length > 2 && all.length) {
    var body = sh.getRange(3, 5, rows.length - 2, all.length);
    var rule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextStartsWith('Ours').setBackground('#d7efdc').setRanges([body]).build();
    sh.setConditionalFormatRules([rule]);
  }
  sh.autoResizeColumns(1, Math.min(rows[0].length, 60));
}

function writeTotals_(ss, people) {
  var sh = ss.getSheetByName(TOTALS) || ss.insertSheet(TOTALS);
  sh.clear();

  var rows = [['受試者人數', people.length], []];
  var pctRows = [];

  ['object', 'scene'].forEach(function (level) {
    var wins = {}, shown = {}, byQ = {}, slots = {}, n = 0;
    people.forEach(function (p) {
      p.answers.forEach(function (x) {
        if (x.level !== level) return;
        n++;
        var m = label_(x.chosen_method);
        wins[m] = (wins[m] || 0) + 1;
        byQ[x.question] = byQ[x.question] || {};
        byQ[x.question][m] = (byQ[x.question][m] || 0) + 1;
        slots[x.chosen_slot] = (slots[x.chosen_slot] || 0) + 1;
        String(x.slot_order).split('|').forEach(function (s) {
          var t = label_(s);
          shown[t] = (shown[t] || 0) + 1;
        });
      });
    });
    if (!n) return;

    var methods = Object.keys(shown).sort(function (a, b) {
      return (wins[b] || 0) / shown[b] - (wins[a] || 0) / shown[a];
    });
    var qs = Object.keys(byQ);
    var nSlots = Object.keys(slots).length;

    rows.push([level === 'object' ? 'OBJECT' : 'SCENE',
               '共 ' + n + ' 次判斷 / ' + methods.length + ' 個方法 / 隨機基準 ' +
               Math.round(1000 / methods.length) / 10 + '%']);

    var head = ['方法'];
    qs.forEach(function (q) { head.push(QLABEL[q] || q); });
    head.push('總得票', '出現次數', '勝率');
    rows.push(head);

    methods.forEach(function (m) {
      var row = [m];
      qs.forEach(function (q) { row.push((byQ[q] && byQ[q][m]) || 0); });
      row.push(wins[m] || 0, shown[m], (wins[m] || 0) / shown[m]);
      pctRows.push({ r: rows.length, c: row.length });
      rows.push(row);
    });

    var bias = ['位置偏誤'];
    Object.keys(slots).sort().forEach(function (s) {
      bias.push(s + '=' + Math.round(slots[s] / n * 1000) / 10 + '%');
    });
    rows.push([], bias);
    rows.push(['理想上每格都接近 ' + Math.round(1000 / nSlots) / 10 +
               '%，嚴重偏斜代表隨機化有問題']);
    rows.push([]);
  });

  var width = 1;
  rows.forEach(function (r) { width = Math.max(width, r.length); });
  rows.forEach(function (r) { while (r.length < width) r.push(''); });

  sh.getRange(1, 1, rows.length, width).setValues(rows);
  for (var i = 0; i < rows.length; i++) {
    var first = String(rows[i][0]);
    if (first === 'OBJECT' || first === 'SCENE') {
      sh.getRange(i + 1, 1, 1, width).setFontWeight('bold')
        .setBackground('#2b6cb0').setFontColor('#ffffff');
    } else if (first === '方法') {
      sh.getRange(i + 1, 1, 1, width).setFontWeight('bold').setBackground('#e8f0fa');
    }
  }
  pctRows.forEach(function (p) { sh.getRange(p.r, p.c).setNumberFormat('0.0%'); });
  sh.getRange(1, 1, 1, 2).setFontWeight('bold');
  sh.autoResizeColumns(1, width);
}
