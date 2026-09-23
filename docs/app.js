/* 3D Generation User Study — 靜態前端，結果 POST 到 Google Form。
   每位受試者獨立隨機：抽題、題序、方法擺放位置全部打亂。          */
'use strict';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const LS_KEY  = 'us3d.v1';

const OBJ_QUESTIONS = [
  { key: 'align',   t: 'q_obj_align_t',   h: 'q_obj_align_h' },
  { key: 'quality', t: 'q_obj_quality_t', h: 'q_obj_quality_h' },
];
const SCN_QUESTIONS = [
  { key: 'align',   t: 'q_scn_align_t',   h: 'q_scn_align_h' },
  { key: 'realism', t: 'q_scn_realism_t', h: 'q_scn_realism_h' },
];

/* ── 小工具 ──────────────────────────────────────────────────────── */
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k in n && k !== 'list') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return n;
};
const shuffle = (arr) => {                       // Fisher–Yates，用 crypto 取亂數
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const r = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
    const j = Math.floor(r * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const uid = () => {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};

/* ── 狀態 ────────────────────────────────────────────────────────── */
const S = {
  cfg: null,
  pid: uid(),
  name: '',
  lang: 'en',            // 預設英文，首頁可切換
  startedAt: new Date().toISOString(),
  pages: [],
  idx: 0,
  pageEnteredAt: 0,
  answers: [],
};
const T = (key, vars) => {
  let s = I18N[S.lang][key] ?? key;
  for (const [k, v] of Object.entries(vars || {})) s = s.replaceAll(`{${k}}`, v);
  return s;
};
const promptOf = (c) => (S.lang === 'zh' && c.prompt_zh) ? c.prompt_zh : c.prompt;

/* ── 抽題 ────────────────────────────────────────────────────────── */
function buildPages(cfg) {
  const nObj = Math.min(cfg.sampling.objectPerParticipant, cfg.objects.length);
  const nScn = Math.min(cfg.sampling.scenePerParticipant, cfg.scenes.length);

  const objTrials = shuffle(cfg.objects).slice(0, nObj).map((c) => ({
    kind: 'object', case: c,
    order: shuffle(cfg.methods.object),        // slot A..F 對應到哪個方法
    questions: OBJ_QUESTIONS,
  }));
  const scnTrials = shuffle(cfg.scenes).slice(0, nScn).map((c) => ({
    kind: 'scene', case: c,
    order: shuffle(cfg.methods.scene),
    questions: SCN_QUESTIONS,
  }));
  // 沒有獨立的分段頁，區段說明直接掛在該區段的第一題上
  objTrials[0].section = { t: 'sec_obj_title', b: 'sec_obj_body', n: nObj };
  scnTrials[0].section = { t: 'sec_scn_title', b: 'sec_scn_body', n: nScn };

  return [{ kind: 'intro' }, ...objTrials, ...scnTrials, { kind: 'done' }];
}

/* ── 畫面 ────────────────────────────────────────────────────────── */
const app = () => $('#app');
const isTrial = (p) => p.kind === 'object' || p.kind === 'scene';

function render() {
  const page = S.pages[S.idx];
  const total = S.pages.filter(isTrial).length;
  const done  = S.pages.slice(0, S.idx).filter(isTrial).length;
  $('#progress').style.width = `${(done / Math.max(total, 1)) * 100}%`;
  document.documentElement.lang = S.lang === 'zh' ? 'zh-Hant' : 'en';

  app().replaceChildren(
    page.kind === 'intro'  ? viewIntro()
    : page.kind === 'done' ? viewDone()
    : viewTrial(page)
  );
  document.title = T('dir_title');
  window.scrollTo(0, 0);
  S.pageEnteredAt = performance.now();
}
const next = () => { S.idx += 1; render(); };

/* 首頁：姓名 + 語言。此頁本身雙語呈現。 */
function viewIntro() {
  const mins = S.cfg.sampling.estimatedMinutes ?? 5;

  const err  = el('span', { class: 'err' });
  const body = el('div');

  const nameInput = el('input', {
    type: 'text', id: 'pname', autocomplete: 'name',
    placeholder: T('name_ph'),
    oninput: (e) => { S.name = e.target.value.trim(); err.textContent = ''; },
  });

  const paint = () => {
    nameInput.placeholder = T('name_ph');
    body.replaceChildren(
      el('p', {}, T('welcome_lead', { mins })),
      el('p', {}, T('welcome_body')));
  };

  const langBtns = el('div', { class: 'choices lang' },
    [['zh', 'lang_zh'], ['en', 'lang_en']].map(([code, key]) =>
      el('label', {},
        el('input', {
          type: 'radio', name: 'lang', value: code, checked: S.lang === code,
          onchange: () => { S.lang = code; paint(); langLabel.textContent = T('lang_label');
                            nameLabel.textContent = T('name_label');
                            startBtn.textContent = T('start'); },
        }),
        el('span', {}, I18N[code][key]))));

  const nameLabel = el('label', { class: 'lbl', htmlFor: 'pname' }, T('name_label'));
  const langLabel = el('label', { class: 'lbl' }, T('lang_label'));
  const startBtn  = el('button', { class: 'btn', onclick: () => {
    if (!S.name) { err.textContent = T('need_name'); nameInput.focus(); return; }
    next();
  } }, T('start'));

  paint();
  return el('div', { class: 'card' },
    el('h1', {}, '3D 生成結果比較 — 使用者研究',
      el('br'), el('span', { class: 'sub' }, 'Comparing 3D Generation Results — User Study')),
    el('div', { class: 'field' }, langLabel, langBtns),
    el('div', { class: 'field' }, nameLabel, nameInput),
    el('hr', { class: 'sep' }),
    body,
    el('div', { class: 'actions' }, startBtn, err));
}

function viewTrial(page) {
  const isObj = page.kind === 'object';
  const picked = {};                       // question key -> slot index
  const err = el('span', { class: 'err' });
  const btn = el('button', { class: 'btn', disabled: true }, T('next'));

  const validate = () => {
    const ok = page.questions.every((q) => picked[q.key] != null);
    btn.disabled = !ok;
    if (ok) err.textContent = '';
  };
  btn.addEventListener('click', () => {
    if (btn.disabled) { err.textContent = T('need_all'); return; }
    const rt = Math.round(performance.now() - S.pageEnteredAt);
    for (const q of page.questions) {
      const slot = picked[q.key];
      S.answers.push({
        level: page.kind,
        case_id: page.case.id,
        question: q.key,
        chosen_slot: LETTERS[slot],
        chosen_method: page.order[slot],
        slot_order: page.order.join('|'),   // A|B|C… 分別是哪個方法
        rt_ms: rt,
      });
    }
    next();
  });

  /* 選項網格 */
  const slots = page.order.map((method, i) => {
    const tag = el('span', { class: 'tag' }, LETTERS[i]);
    if (isObj) {
      const src = page.case.images[method];
      return el('div', { class: 'slot' }, tag,
        el('img', { src, alt: `option ${LETTERS[i]}`, loading: 'eager', decoding: 'async' }),
        el('button', { class: 'zoom', type: 'button',
          onclick: () => openLightbox(src) }, T('zoom')));
    }
    const v = el('video', {
      src: page.case.videos[method], poster: page.case.posters[method],
      autoplay: true, muted: true, defaultMuted: true, loop: true,
      playsInline: true, preload: 'auto', controls: false,
      disableRemotePlayback: true,
    });
    v.setAttribute('muted', '');             // 屬性與 property 都要設，Safari 才吃自動播放
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    const kick = () => v.play().catch(() => {});
    v.addEventListener('loadeddata', kick);
    v.addEventListener('canplay', kick);
    queueMicrotask(kick);
    return el('div', { class: 'slot vid' }, tag, v);
  });

  /* 作答列 */
  const qBlocks = page.questions.map((q) => {
    const name = `${page.case.id}__${q.key}`;
    return el('div', { class: 'q' },
      el('h2', {}, T(q.t)),
      el('p', { class: 'hint' }, T(q.h)),
      el('div', { class: 'choices' },
        page.order.map((_, i) => el('label', {},
          el('input', { type: 'radio', name, value: i,
            onchange: () => { picked[q.key] = i; validate(); } }),
          el('span', {}, LETTERS[i])))));
  });

  const total = S.pages.filter((p) => p.kind === page.kind).length;
  const nth   = S.pages.slice(0, S.idx + 1).filter((p) => p.kind === page.kind).length;

  /* 描述區：物件題左邊文字、右邊參考圖 */
  const desc = el('div', { class: 'prompt' },
    el('b', {}, T('lbl_prompt')), promptOf(page.case));
  const head = isObj
    ? el('div', { class: 'head' }, desc,
        el('figure', { class: 'ref' },
          el('img', { src: page.case.ref, alt: T('lbl_ref'), loading: 'eager',
                      onclick: () => openLightbox(page.case.ref) }),
          el('figcaption', {}, T('lbl_ref'))))
    : desc;

  const node = el('div', { class: 'card' },
    page.section && el('div', { class: 'section-note' },
      el('h2', {}, T(page.section.t, { n: page.section.n })),
      el('p', {}, T(page.section.b))),
    el('p', { class: 'meta' },
      T(isObj ? 'counter_obj' : 'counter_scn', { i: nth, n: total })),
    head,
    el('div', { class: `grid ${isObj ? 'obj' : 'scene'}` }, slots),
    qBlocks,
    el('div', { class: 'actions' }, btn, err));

  if (!isObj) {
    // 少數瀏覽器（iOS 低耗電模式）會擋自動播放，任何一次互動就補播
    const resume = () => node.querySelectorAll('video')
      .forEach((v) => v.paused && v.play().catch(() => {}));
    node.addEventListener('pointerdown', resume, { once: true });
    document.addEventListener('visibilitychange', resume);
  }
  preload(S.pages[S.idx + 1]);
  return node;
}

function preload(page) {
  if (!page || !isTrial(page)) return;
  if (page.kind === 'object') new Image().src = page.case.ref;
  for (const m of page.order) {
    new Image().src = page.kind === 'object' ? page.case.images[m] : page.case.posters[m];
  }
}

/* ── 送出 ────────────────────────────────────────────────────────── */
function payload() {
  return {
    pid: `${S.pid} | ${S.name}`,
    meta: JSON.stringify({
      name: S.name,
      lang: S.lang,
      started_at: S.startedAt,
      finished_at: new Date().toISOString(),
      total_ms: Math.round(performance.now()),
      ua: navigator.userAgent,
      screen: `${screen.width}x${screen.height}@${devicePixelRatio}`,
      locale: navigator.language,
    }),
    responses: JSON.stringify(S.answers),
  };
}

function submitToForm() {
  const { action, fields } = S.cfg.form || {};
  if (!action || !fields?.responses) return Promise.resolve('not-configured');

  const data = payload();
  const form = el('form', { action, method: 'POST', target: 'gf-sink' });
  for (const [key, entry] of Object.entries(fields)) {
    if (entry) form.append(el('input', { type: 'hidden', name: entry, value: data[key] ?? '' }));
  }
  document.body.append(form);

  return new Promise((resolve) => {
    const sink = $('#gf-sink');
    const done = () => { clearTimeout(t); sink.removeEventListener('load', done); resolve('sent'); };
    const t = setTimeout(() => { sink.removeEventListener('load', done); resolve('timeout'); }, 8000);
    sink.addEventListener('load', done);
    form.submit();
    form.remove();
  });
}

function viewDone() {
  const data = payload();
  try { localStorage.setItem(`${LS_KEY}.${S.pid}`, JSON.stringify(data)); } catch { /* 無痕模式 */ }

  const status = el('p', { class: 'note' }, T('sending'));
  const box = el('div', { class: 'card' },
    el('h1', {}, T('done_title')),
    el('p', {}, T('done_id'), el('code', { class: 'code' }, S.pid)),
    status,
    el('div', { class: 'actions' },
      el('button', { class: 'btn ghost', onclick: () => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = el('a', { href: URL.createObjectURL(blob), download: `userstudy_${S.pid}.json` });
        document.body.append(a); a.click(); a.remove();
      } }, T('download'))));

  submitToForm().then((r) => {
    status.textContent = r === 'sent' ? T('sent')
      : r === 'not-configured' ? T('not_conf') : T('failed');
    status.className = r === 'sent' ? 'note' : 'note warn';
  });

  return box;
}

/* ── lightbox ────────────────────────────────────────────────────── */
function openLightbox(src) {
  const lb = $('#lightbox');
  $('img', lb).src = src;
  lb.hidden = false;
}
$('#lightbox').addEventListener('click', () => { $('#lightbox').hidden = true; });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('#lightbox').hidden = true;
});

/* ── 啟動 ────────────────────────────────────────────────────────── */
fetch('config.json', { cache: 'no-cache' })
  .then((r) => r.json())
  .then((cfg) => { S.cfg = cfg; S.pages = buildPages(cfg); render(); })
  .catch((e) => {
    app().replaceChildren(el('div', { class: 'card' },
      el('h1', {}, T('load_fail_t')),
      el('p', {}, T('load_fail_b')),
      el('p', { class: 'note' }, String(e))));
  });
