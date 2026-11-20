/* 체험판 연결 코드.
   서버 없이 열리는 체험판에서, 화면이 서버에 보내는 요청(/api/...)을 브라우저 안의 파이썬(Pyodide)으로 돌린다.
   서버 프로그램(app.py)은 그대로 쓰고, 캠페인 기록은 이 브라우저의 저장소에 둔다. AI 답은 시연 때 받아 둔 것을 보여 준다. */
(function () {
  var PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
  var BUILD = '20261120145403';
  var RESET_KEY = 'kai_demo_reset';
  var AI_PATH = /\/(biz-cert|seal|ideas|ideas\/points|ideas\/review|creative-review)$/;
  /* 파일 올리는 칸마다 넣어 줄 예시 파일: [사이트 안의 파일, 올릴 때 보이는 이름] */
  var SAMPLES = {
    cert: ['samples/biz_cert.png', '사업자등록증_견본_블루핀애드.png'],
    seal: ['samples/seal_adv.png', '날인본_광고주.png'],
    cimg: ['samples/banner.png', '소재_배너.png'],
    sealfinal: ['samples/seal_final.png', '날인본_최종.png'],
    shot: ['samples/placement.png', '게재지면_캡처.png']
  };
  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  var realFetch = window.fetch.bind(window);
  var py = null, boot = null, persistent = false, blobs = {};

  /* ── 안내 화면과 아래 띠 ── */
  var css = document.createElement('style');
  css.textContent =
    '#demo-cover{position:fixed;inset:0;z-index:9999;background:#faf9f5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font-family:"Noto Sans KR",sans-serif;color:#1f1e1d;text-align:center;padding:24px}' +
    '#demo-cover b{font-size:18px}#demo-cover span{font-size:14px;color:#5e5d59}' +
    '#demo-cover i{width:28px;height:28px;border:3px solid #e8e6dc;border-top-color:#c96442;border-radius:50%;animation:demo-spin .9s linear infinite;margin-bottom:6px}' +
    '@keyframes demo-spin{to{transform:rotate(360deg)}}' +
    '#demo-bar{position:fixed;left:0;right:0;bottom:0;z-index:9000;background:#1f1e1d;color:#faf9f5;font:13px/1.5 "Noto Sans KR",sans-serif;padding:8px 16px;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;justify-content:center}' +
    '#demo-bar em{font-style:normal;background:#c96442;color:#fff;border-radius:4px;padding:1px 8px;font-weight:700}' +
    '#demo-bar a,#demo-bar button{color:#faf9f5;background:none;border:1px solid #5e5d59;border-radius:4px;padding:2px 10px;font:inherit;cursor:pointer;text-decoration:none}' +
    '#demo-bar a:hover,#demo-bar button:hover{border-color:#faf9f5}' +
    'body{padding-bottom:52px}.side{min-height:calc(100vh - 42px)!important}' +
    'button.demo-sample{margin:6px 0 0 8px;border:1px dashed #c96442;color:#c96442;background:#fff;border-radius:6px;padding:4px 10px;font:inherit;font-size:13px;cursor:pointer}' +
    'button.demo-sample:hover{background:#f6e6de}';
  document.head.appendChild(css);

  function onBody(fn) { if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn); }
  onBody(function () {
    var cover = document.createElement('div');
    cover.id = 'demo-cover';
    cover.innerHTML = '<i></i><b>체험판을 준비하고 있어요</b><span>서버 없이 브라우저 안에서 실행해요. 처음 열 때는 10~20초쯤 걸려요.</span>';
    document.body.appendChild(cover);
    var bar = document.createElement('div');
    bar.id = 'demo-bar';
    bar.innerHTML = '<em>체험판</em><span>입력한 내용은 이 브라우저에만 저장돼요. AI 결과는 시연 때 받아 둔 답이고, 회사와 서류는 모두 가상이에요.</span>' +
      '<a href="index.html">소개</a><button type="button" id="demo-reset">처음 상태로</button>';
    document.body.appendChild(bar);
    document.getElementById('demo-reset').addEventListener('click', function () {
      if (!confirm('입력한 내용을 지우고 예시 캠페인만 있는 처음 상태로 되돌릴까요?')) return;
      try { localStorage.setItem(RESET_KEY, '1'); } catch (e) {}
      location.href = location.pathname.replace(/[^/]*$/, '') + 'ops.html';
    });
  });
  function uncover(error) {
    onBody(function () {
      var cover = document.getElementById('demo-cover');
      if (!cover) return;
      if (error) cover.innerHTML = '<b>체험판을 불러오지 못했어요</b><span>인터넷 연결을 확인하고 새로고침해 주세요.</span>';
      else cover.remove();
    });
  }

  /* ── 브라우저 안의 파이썬 준비 ── */
  function loadScript(src) {
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = fail;
      document.head.appendChild(s);
    });
  }
  /* 브라우저 저장소와 맞추기. load가 true면 저장소 → 메모리, false면 메모리 → 저장소 */
  function sync(load) {
    if (!persistent) return Promise.resolve();
    return new Promise(function (ok, fail) { py.FS.syncfs(load, function (err) { err ? fail(err) : ok(); }); });
  }
  var ready = (async function () {
    var bundle = realFetch('kai.zip?v=' + BUILD).then(function (r) { return r.arrayBuffer(); });
    await loadScript(PYODIDE + 'pyodide.js');
    py = await loadPyodide({indexURL: PYODIDE});
    await py.loadPackage(['pyyaml', 'pillow', 'markupsafe']);
    py.unpackArchive(await bundle, 'zip', {extractDir: '/kai'});
    py.FS.mkdir('/kai_data');
    try {
      py.FS.mount(py.FS.filesystems.IDBFS, {}, '/kai_data');
      persistent = true;
      await sync(true);
    } catch (e) { persistent = false; }      /* 저장소를 못 쓰는 환경(사생활 보호 창 등)이면 창을 닫을 때까지만 기억한다 */
    py.runPython('import sys; sys.path.insert(0, "/kai")');
    boot = py.pyimport('demo_boot');
    var reset = false;
    try { reset = localStorage.getItem(RESET_KEY) === '1'; localStorage.removeItem(RESET_KEY); } catch (e) {}
    if (boot.seed(reset)) await sync(false);
  })();
  ready.then(function () { uncover(false); }, function (e) { console.error(e); uncover(true); });

  /* ── 요청 처리: 한 번에 하나씩 ── */
  var chain = Promise.resolve();
  function demoFetch(path, init) {
    var job = chain.then(function () { return run(path, init || {}); });
    chain = job.catch(function () {});
    return job;
  }
  async function run(path, init) {
    await ready;
    var method = (init.method || 'GET').toUpperCase(), ctype = '', body = null;
    if (init.body != null) {
      var rq = new Request(location.origin + '/x', {method: 'POST', headers: init.headers, body: init.body});
      ctype = rq.headers.get('content-type') || '';
      body = new Uint8Array(await rq.arrayBuffer());
    }
    await sync(true);                        /* 다른 탭(광고주·운영자 화면)에서 바꾼 것을 먼저 받아 온다 */
    if (method === 'POST' && AI_PATH.test(path)) await new Promise(function (ok) { setTimeout(ok, 1200); });
    var out = boot.handle(method, path, ctype, body);
    if (method !== 'GET') {
      await sync(false);
      Object.keys(blobs).forEach(function (k) { URL.revokeObjectURL(blobs[k]); });
      blobs = {};
    }
    return new Response(out[3], {status: out[0], headers: {'Content-Type': out[1] || 'application/octet-stream', 'X-Disposition': out[2]}});
  }
  window.fetch = function (input, init) {
    var url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin === location.origin && url.pathname.indexOf('/api/') === 0) return demoFetch(url.pathname + url.search, init);
    return realFetch(input, init);
  };

  /* ── 올린 파일과 만든 문서 열기 ── */
  function blobFor(path) {
    if (blobs[path]) return Promise.resolve(blobs[path]);
    return demoFetch(path).then(function (r) { return r.blob(); }).then(function (b) { return (blobs[path] = URL.createObjectURL(b)); });
  }
  function fileName(disposition) {
    var star = /filename\*=UTF-8''([^;]+)/i.exec(disposition || ''), plain = /filename="?([^";]+)"?/i.exec(disposition || '');
    return star ? decodeURIComponent(star[1]) : plain ? plain[1] : '';
  }
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href^="/api/"]');
    if (!a) return;
    ev.preventDefault();
    var tab = a.target === '_blank' ? window.open('', '_blank') : null;   /* 누른 순간에 열어 두어야 팝업으로 막히지 않는다 */
    demoFetch(a.getAttribute('href')).then(function (r) {
      var disposition = r.headers.get('X-Disposition') || '';
      var name = /^attachment/i.test(disposition) ? fileName(disposition) || 'file' : '';   /* 내려받는 문서만 이름이 있다. 그림·PDF는 새 탭에서 연다 */
      return r.blob().then(function (b) {
        var url = URL.createObjectURL(b);
        if (name || !tab) {
          if (tab) tab.close();
          var link = document.createElement('a');
          link.href = url; link.download = name || 'file';
          document.body.appendChild(link); link.click(); link.remove();
        } else tab.location = url;
      });
    });
  }, true);

  /* ── 화면이 그려질 때마다: 그림 주소 바꾸기, 예시 파일 버튼 달기 ── */
  function putSample(id) {
    var s = SAMPLES[id];
    realFetch(s[0] + '?v=' + BUILD).then(function (r) { return r.blob(); }).then(function (b) {
      var input = document.getElementById(id);
      if (!input) return;
      var box = new DataTransfer();
      box.items.add(new File([b], s[1], {type: 'image/png'}));
      input.files = box.files;
      input.dispatchEvent(new Event('change', {bubbles: true}));
    });
  }
  function fix() {
    queued = false;
    document.querySelectorAll('img[src^="/api/"]').forEach(function (img) {
      var path = img.getAttribute('src');
      img.setAttribute('data-demo-src', path);
      img.src = BLANK;
      blobFor(path).then(function (url) { if (img.getAttribute('data-demo-src') === path) img.src = url; });
    });
    /* 실제 스토어 페이지를 읽어야 하는 시연용 캠페인은 체험판에서 뺀다 */
    document.querySelectorAll('[data-new="demo_kakao"]').forEach(function (b) { b.remove(); });
    document.querySelectorAll('input[type=file]').forEach(function (input) {
      if (!SAMPLES[input.id] || input.disabled) return;
      var host = input.closest('label') || input, next = host.nextElementSibling;
      if (next && next.classList.contains('demo-sample')) return;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'demo-sample'; b.textContent = '예시 파일 넣기';
      b.addEventListener('click', function (ev) { ev.stopPropagation(); putSample(input.id); });
      host.insertAdjacentElement('afterend', b);
    });
  }
  var queued = false;
  new MutationObserver(function () { if (!queued) { queued = true; Promise.resolve().then(fix); } })
    .observe(document.documentElement, {childList: true, subtree: true});
})();
