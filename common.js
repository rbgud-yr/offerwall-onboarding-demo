/* 광고주 화면과 운영자 화면이 함께 쓰는 도구 */
var $ = function (id) { return document.getElementById(id); };
var fmt = function (n) { return Math.round(n).toLocaleString('ko-KR'); };
/* 안내용 금액은 만원 단위로 짧게: 1200000 → 120만원 */
var manwon = function (n) { return n % 10000 ? fmt(n) + '원' : fmt(n / 10000) + '만원'; };
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }

/* 서버에 부탁하기. 연결이 안 되면 화면이 멈추지 않도록 실패 안내를 대신 돌려준다 */
function api(path, body, isFile) {
  var opt = body === undefined ? {} : isFile ? {method: 'POST', body: body}
    : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)};
  return fetch(path, opt).then(function (r) { return r.json(); }).catch(function () {
    return {ok: false, status: 'failed', reason: '서버에 연결하지 못했어요.', fields: {},
            errors: {_form: {what: '서버에 연결하지 못했어요.', how: '입력한 내용은 그대로 있어요. 잠시 후 다시 시도해 주세요.'}}};
  });
}
function fileBody(file, extra) {
  var d = new FormData(); d.append('file', file);
  Object.keys(extra || {}).forEach(function (k) { d.append(k, extra[k]); });
  return d;
}

/* 입력칸. p: 어느 묶음의 값인지, f: {k, label, hint, ph, type, area, span, ai} */
function input(p, f, value, errors, aiKeys) {
  var e = (errors || {})[f.k], ai = (aiKeys || {})[f.k], id = p + '_' + f.k;
  var attrs = ' id="' + id + '" data-p="' + p + '" data-k="' + f.k + '" placeholder="' + esc(f.ph || '') + '" autocomplete="off"';
  return '<div class="f' + (e ? ' bad' : '') + (ai ? ' ai' : '') + (f.span ? ' span' : '') + '"><label for="' + id + '">' + f.label +
    (f.hint ? '<small>' + f.hint + '</small>' : '') + (ai ? '<span class="tag ai">AI가 읽음</span>' : '') + '</label>' +
    (f.area ? '<textarea' + attrs + '>' + esc(value) + '</textarea>'
            : '<input type="' + (f.type || 'text') + '"' + attrs + ' value="' + esc(value) + '"' + (f.min ? ' min="' + f.min + '"' : '') + '>') +
    (f.after || '') + (e ? '<p class="e">' + esc(e.what) + ' ' + esc(e.how) + '</p>' : '') + '</div>';
}
function radios(p, k, legend, opts, value, errors) {
  var e = (errors || {})[k];
  return '<fieldset class="f span' + (e ? ' bad' : '') + '"><legend>' + legend + '</legend><div class="opts">' + opts.map(function (o) {
    var on = value === o[0];
    return '<label class="optc' + (on ? ' on' : '') + '"><input type="radio" name="' + p + '_' + k + '" data-p="' + p + '" data-k="' + k + '" value="' + o[0] + '"' + (on ? ' checked' : '') + '><span><b>' + o[1] + '</b>' + (o[2] ? '<small>' + o[2] + '</small>' : '') + '</span></label>';
  }).join('') + '</div>' + (e ? '<p class="e">' + esc(e.what) + ' ' + esc(e.how) + '</p>' : '') + '</fieldset>';
}
/* 목록에서 하나 고르는 칸. opts: 보여줄 이름 목록 */
function select(p, f, opts, value, errors) {
  var e = (errors || {})[f.k], id = p + '_' + f.k;
  return '<div class="f' + (e ? ' bad' : '') + (f.span ? ' span' : '') + '"><label for="' + id + '">' + f.label + '</label>' +
    '<select id="' + id + '" data-p="' + p + '" data-k="' + f.k + '"><option value="">선택해 주세요</option>' + opts.map(function (o) {
      return '<option value="' + esc(o) + '"' + (value === o ? ' selected' : '') + '>' + esc(o) + '</option>';
    }).join('') + '</select>' + (e ? '<p class="e">' + esc(e.what) + ' ' + esc(e.how) + '</p>' : '') + '</div>';
}
function check(p, k, text, on) {
  return '<label class="later"><input type="checkbox" data-p="' + p + '" data-k="' + k + '"' + (on ? ' checked' : '') + '> ' + text + '</label>';
}
function errNote(errors) {
  var keys = Object.keys(errors || {});
  if (!keys.length) return '';
  var f = errors._form;
  return '<div class="note bad"><p>' + (f ? esc(f.what) + ' ' + esc(f.why || '') + ' ' + esc(f.how || '')
    : '확인이 필요한 칸이 있어요. 빨간 칸을 고친 뒤 다시 제출해 주세요.') + '</p></div>';
}
function kv(rows) {
  return '<table class="kv">' + rows.filter(Boolean).map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('') + '</table>';
}

/* 금액 표. 계산은 서버가 rules.yaml로 한 결과를 그대로 보여준다 */
function amountRows(a, feeRate) {
  if (!a || a.status !== 'ok') return '<tr><td colspan="2" class="h">' + (a && a.messages && a.messages[0] ? esc(a.messages[0].what) + ' ' + esc(a.messages[0].how) : '상품과 예산을 입력하면 계산돼요.') + '</td></tr>';
  var r = '<tr><td>광고 단가 (' + esc(a.product) + ')</td><td class="num">' + fmt(a.unit_price) + '원</td></tr>' +
    '<tr><td>예산</td><td class="num">' + fmt(a.supply) + '원</td></tr>' +
    '<tr><td>예상 물량</td><td class="num">약 ' + fmt(a.count) + '건</td></tr>';
  if (a.fee) r += '<tr><td>대행 수수료 (' + Math.round(feeRate * 100) + '%)</td><td class="num">-' + fmt(a.fee) + '원</td></tr><tr><td></td><td class="num">' + fmt(a.net) + '원</td></tr>';
  return r + '<tr class="total"><td>총 입금액 (VAT 포함)</td><td class="num">' + fmt(a.deposit) + '원</td></tr>';
}

/* 협의 내용 입력칸 (광고주는 확정 전, 운영자는 언제든 사용).
   products: 서버가 rules.yaml로 만든 상품 목록 (상품, 완료 기준, 단가, 최소 집행). 상품을 고를 때 단가가 함께 보인다 */
function termsFields(t, errors, products) {
  var ag = t.actor === 'agency';
  return radios('terms', 'actor', '신청 주체', [['direct', '광고주 직접', '앱을 운영하는 회사예요'], ['agency', '대행사', '광고주를 대신해 진행해요']], t.actor, errors) +
    input('terms', {k: 'company', label: ag ? '대행사 이름' : '회사 이름'}, t.company, errors) +
    (ag ? input('terms', {k: 'advertiser', label: '광고주(앱 운영사) 이름'}, t.advertiser, errors) : '') +
    input('terms', {k: 'app', label: '앱 이름'}, t.app, errors) +
    radios('terms', 'product', '캠페인 상품', (products || []).map(function (p) {
      return [p.product, esc(p.product + ' · ' + p.done_when), '단가 <b class="price">' + fmt(p.unit_price) + '원</b> · 최소 ' + fmt(p.min_count) + '건']; }), t.product, errors) +
    input('terms', {k: 'budget', label: '예산 (원)', ph: '예: 2000000', hint: '비워 두면 최소 집행 금액이 들어가요'}, t.budget == null ? '' : t.budget, errors) +
    (ag ? radios('terms', 'fee', '대행 수수료가 있나요?', [['yes', '있어요', '예산에서 수수료를 빼고 입금해요'], ['no', '없어요', '예산 전액을 입금해요']], t.fee, errors) : '');
}
var AUTH_LABEL = {api_key: 'API 키', ip_whitelist: 'IP 허용 목록'};
var OS_LABEL = {aos: 'Android', ios: 'iOS'};

/* 제출된 연동 정보, 소재 정보를 표로 */
function testRows(c) {
  var t = c.test, cpi = c.terms.product === 'CPI';
  if (!t) return null;
  var rows = cpi ? [t.aos && ['Android', esc(t.aos) + '<br><span class="h">' + esc(t.aos_url) + '</span>'], t.ios && ['iOS', esc(t.ios) + '<br><span class="h">' + esc(t.ios_url) + '</span>']]
    : [['연동 방식', t.integ === 'mmp' ? 'MMP · ' + esc(t.mmp) : '서버 연동 · ' + (AUTH_LABEL[t.auth] || '')],
       [t.integ === 'mmp' ? '최종 클릭 링크' : '랜딩 URL', t.later_link ? '<span class="tag todo">나중에 올릴게요</span>'
         : t.link_mode === 'one' ? 'OS 공통 (링크 하나)<br><span class="h">' + esc(t.one_link) + '</span>'
         : Object.keys(OS_LABEL).filter(function (o) { return t[o + '_link']; }).map(function (o) { return OS_LABEL[o] + '<br><span class="h">' + esc(t[o + '_link']) + '</span>'; }).join('<br>') || esc(t.link)],
       t.link_mode === 'one' && ['노출 OS', (c.os || []).map(function (o) { return OS_LABEL[o]; }).join(', ')],
       t.auth === 'ip_whitelist' && ['서버 IP', esc(t.server_ip)]];
  return rows.concat([['테스트 담당', esc(t.tname) + ' · ' + esc(t.tphone)], ['제출 시각', esc(t.submitted_at)]]);
}
function creativeRows(c) {
  var r = c.creative, cpi = c.terms.product === 'CPI';
  if (!r) return null;
  var file = c.files.filter(function (f) { return f.id === r.image_file_id; })[0];
  var os = c.os || [];
  return [['소재 이미지', r.later_image ? '<span class="tag todo">나중에 올릴게요</span>' : file ? '<a href="/api/cases/' + c.id + '/files/' + file.id + '" target="_blank" rel="noopener">' + esc(file.name) + '</a>' : '-'],
    ['캠페인 이름', esc(r.cname)], ['소개 · 참여방법', esc(r.cdesc).replace(/\n/g, '<br>')], ['유의사항', esc(r.ccaution).replace(/\n/g, '<br>')],
    ['노출 OS', os.map(function (o) { return OS_LABEL[o]; }).join(', ') || '<span class="h">테스트 정보를 내면 정해져요</span>'],
    ['오픈 일정', esc(r.opendate)], ['데일리캡', r.daily_cap ? '하루 ' + fmt(r.daily_cap) + '건' : '설정 안 함'], r.extra && ['추가 요청', esc(r.extra)], ['제출 시각', esc(r.submitted_at)]];
}
