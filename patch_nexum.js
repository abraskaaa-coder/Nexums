const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'nexum.html');
if (!fs.existsSync(file)) { console.error('nexum.html not found in', __dirname); process.exit(1); }
let html = fs.readFileSync(file, 'utf8');

// ── PATCH 1: MOBILE CSS ─────────────────────────────────────────────────────
if (html.includes('.theme-wrap{display:none;}')) {
  console.log('✓ Mobile CSS already patched');
} else {
  const OLD = `/* ── RESPONSIVE ── */
@media(max-width:900px){
  .faq-layout{grid-template-columns:1fr;gap:36px;}
  .faq-a-inner{padding-left:20px;}
  .hero{grid-template-columns:1fr;padding:100px 24px 60px;}
  nav{padding:0 24px;}
  .sec-in{padding:0 24px;}
  .ag{grid-template-columns:1fr 1fr;}
  .how-wrap{grid-template-columns:1fr;}
  .how-steps{border-right:none;border-bottom:1px solid var(--border);}
  .pg2{grid-template-columns:1fr;}
  .reg-grid{grid-template-columns:1fr;}
  .nav-links{display:none;}
}`;
  const NEW = `/* ── MOBILE RESPONSIVE ── */
@media(max-width:900px){
  nav{padding:0 16px;height:56px;}
  .nav-logo{font-size:18px;}
  .nav-logo svg{width:28px;height:28px;}
  .nav-right{gap:8px;}
  .theme-wrap{display:none;}
  .btn-ghost,.btn-accent{padding:7px 14px;font-size:12px;}
  .hero{padding:80px 20px 48px;gap:36px;}
  h1{font-size:clamp(32px,8vw,48px);}
  .hero-desc{font-size:14px;max-width:100%;}
  .hero-btns{gap:8px;}
  .btn-big,.btn-big2{padding:12px 20px;font-size:13px;}
  .hero-nums{gap:24px;margin-top:32px;padding-top:28px;}
  .hn-v{font-size:22px;}
  .chat-mock{max-height:420px;}
  .sec-wrap{padding:64px 0;}
  .sec-in{padding:0 20px;}
  h2{font-size:clamp(26px,6vw,40px);}
  .ag{grid-template-columns:1fr 1fr;gap:10px;}
  .ac{padding:20px 16px;}
  .ac h3{font-size:14px;}
  .ac p{font-size:12px;}
  .hs-title{font-size:14px;}
  .hs-desc{font-size:12px;}
  .pc{padding:22px 18px;}
  .faq-a-inner{padding-left:20px;}
  .faq-q{padding:14px 16px;}
  .faq-q-text{font-size:13.5px;}
  .reg-left{order:2;}
  .form-card{order:1;}
  .fc-body{padding:20px 18px;}
}
@media(max-width:600px){
  nav{padding:0 14px;}
  .nav-links{display:none;}
  .nav-logo{font-size:17px;}
  .nav-logo svg{display:none;}
  .lang-btn{padding:4px 8px;font-size:10.5px;}
  .btn-ghost{padding:6px 10px;font-size:11.5px;}
  .hero{padding:72px 14px 40px;gap:28px;}
  h1{font-size:clamp(28px,9vw,40px);}
  .hero-desc{font-size:13.5px;}
  .btn-big,.btn-big2{padding:11px 16px;font-size:13px;border-radius:10px;}
  .hero-btns{flex-direction:column;}
  .hero-btns .btn-big,.hero-btns .btn-big2{width:100%;}
  .hero-nums{flex-wrap:wrap;gap:18px;}
  .hn-v{font-size:20px;}
  .hn-l{font-size:10px;}
  .chat-mock{max-height:360px;}
  .bub-b,.bub-u{font-size:12px;}
  .bub-opt{font-size:11px;padding:6px 12px;}
  .scale-btn{width:28px;height:28px;font-size:11px;}
  .sec-wrap{padding:48px 0;}
  .sec-in{padding:0 14px;}
  h2{font-size:clamp(24px,7.5vw,34px);}
  .ag{grid-template-columns:1fr;}
  .ac{padding:18px 14px;}
  .how-steps,.how-flow{padding:22px 16px;}
  .hs{gap:12px;}
  .pc{padding:18px 16px;}
  .pc-name{font-size:17px;}
  .faq-stats{flex-direction:column;}
  .faq-stat{border-right:none;border-bottom:1px solid var(--border);}
  .faq-stat:last-child{border-bottom:none;}
  .faq-steps{flex-direction:column;}
  .fsm-arr{transform:rotate(90deg);}
  .ir{grid-template-columns:1fr;}
  .fc-tabs{flex-wrap:wrap;}
  .fc-tab{font-size:12px;padding:11px 8px;}
  footer div{flex-direction:column;gap:6px;text-align:center;}
}`;
  if (html.includes('/* ── RESPONSIVE ── */')) {
    html = html.replace(OLD, NEW);
    console.log('✅ Mobile CSS replaced');
  } else {
    const idx = html.lastIndexOf('</style>');
    if (idx === -1) { console.error('No </style> tag found'); process.exit(1); }
    html = html.slice(0, idx) + '\n' + NEW + '\n' + html.slice(idx);
    console.log('✅ Mobile CSS injected before </style>');
  }
}

// ── PATCH 2: АВТО-ВХІД + DEBUG PANEL ────────────────────────────────────────
if (html.includes('__nexum_debug')) {
  console.log('✓ Auto-login already patched');
} else {
  // 2a. Кнопка
  const OLD_BTN = `onclick="location.href='login.html'">Увійти →</button>`;
  const NEW_BTN = `onclick="goToDashboard()">Увійти →</button>`;
  if (html.includes(OLD_BTN)) {
    html = html.replace(OLD_BTN, NEW_BTN);
    console.log('✅ Login button onclick patched');
  } else {
    console.warn('⚠️  Login button not found — check nexum.html manually');
  }

  // 2b. Inject перед </body>
  const INJECT = `
<script>
// ── NEXUM AUTO-LOGIN DEBUG ──────────────────────────────
var __nexum_debug = true;

function _dbg(msg, color) {
  color = color || '#06d6a0';
  console.log('%c[Nexum] ' + msg, 'color:' + color + ';font-weight:bold;font-size:12px');
  var p = document.getElementById('_nexum_dbg_log');
  if (p) {
    var line = document.createElement('div');
    line.style.cssText = 'padding:2px 0;color:' + color + ';font-size:11px;border-bottom:1px solid #1a2540;';
    line.textContent = new Date().toLocaleTimeString() + ' — ' + msg;
    p.appendChild(line);
    p.scrollTop = p.scrollHeight;
  }
}

function goToDashboard() {
  var remember  = localStorage.getItem('nexum_remember');
  var code      = localStorage.getItem('nexum_remember_code');
  var name      = localStorage.getItem('nexum_remember_name');
  var sessCode  = sessionStorage.getItem('nexum_auth');

  _dbg('goToDashboard() called');
  _dbg('nexum_remember  = ' + remember);
  _dbg('nexum_remember_code = ' + code);
  _dbg('nexum_remember_name = ' + name);
  _dbg('sessionStorage nexum_auth = ' + sessCode);

  if (remember === '1' && code) {
    _dbg('✅ Auto-login: setting session → dashboard.html', '#06d6a0');
    sessionStorage.setItem('nexum_auth', code);
    sessionStorage.setItem('nexum_name', name || code);
    setTimeout(function(){ location.href = 'dashboard.html'; }, 400);
  } else {
    _dbg('⚠️  No saved login — going to login.html', '#f59e0b');
    setTimeout(function(){ location.href = 'login.html'; }, 400);
  }
}

function updateLoginBtn() {
  var btn = document.getElementById('btn-login');
  if (!btn) { _dbg('btn-login not found!', '#f87171'); return; }
  var remember = localStorage.getItem('nexum_remember');
  var code     = localStorage.getItem('nexum_remember_code');
  var name     = localStorage.getItem('nexum_remember_name');
  _dbg('updateLoginBtn: remember=' + remember + ' code=' + code);
  if (remember === '1' && code) {
    var firstName = (name || '').split(' ')[0];
    btn.textContent = firstName ? '\u{1F464} ' + firstName + ' \u2192' : '\u{1FA7A} \u041A\u0430\u0431\u0456\u043D\u0435\u0442 \u2192';
    btn.style.borderColor = 'var(--accent2)';
    btn.style.color       = 'var(--accent2)';
    _dbg('Button updated to: ' + btn.textContent, '#06d6a0');
  } else {
    _dbg('No saved session — button stays as-is', '#5a6e94');
  }
}

// ── DEBUG PANEL ──────────────────────────────────────────
(function buildDebugPanel() {
  var panel = document.createElement('div');
  panel.id  = '_nexum_dbg';
  panel.style.cssText = [
    'position:fixed','bottom:14px','right:14px','z-index:9999',
    'background:#0b0f1c','border:1px solid #1a2540','border-radius:12px',
    'width:300px','font-family:monospace','font-size:11px','color:#dde4f0',
    'box-shadow:0 8px 32px #000a','overflow:hidden'
  ].join(';');

  panel.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#0f1525;border-bottom:1px solid #1a2540;">' +
      '<span style="color:#3b82f6;font-weight:700;font-size:11px;">🔍 Nexum Debug</span>' +
      '<button onclick="document.getElementById(\'_nexum_dbg\').style.display=\'none\'" ' +
        'style="background:transparent;border:none;color:#5a6e94;cursor:pointer;font-size:14px;padding:0 4px;">✕</button>' +
    '</div>' +
    '<div style="padding:8px 12px;background:#05070e;border-bottom:1px solid #1a2540;">' +
      '<div style="color:#5a6e94;font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">localStorage</div>' +
      '<div id="_nexum_dbg_ls" style="display:flex;flex-direction:column;gap:3px;"></div>' +
    '</div>' +
    '<div style="padding:8px 12px;">' +
      '<div style="color:#5a6e94;font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">Log</div>' +
      '<div id="_nexum_dbg_log" style="max-height:120px;overflow-y:auto;"></div>' +
    '</div>';

  document.addEventListener('DOMContentLoaded', function() {
    document.body.appendChild(panel);
    updateLoginBtn();

    // Populate localStorage values
    var ls = document.getElementById('_nexum_dbg_ls');
    var keys = ['nexum_remember','nexum_remember_code','nexum_remember_name','nexum_lang'];
    keys.forEach(function(k) {
      var val = localStorage.getItem(k);
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;gap:8px;padding:2px 0;border-bottom:1px solid #1a254022;';
      row.innerHTML =
        '<span style="color:#5a6e94;font-size:10px;">' + k.replace('nexum_','') + '</span>' +
        '<span style="color:' + (val ? '#06d6a0' : '#f87171') + ';font-size:10px;text-align:right;word-break:break-all;">' +
          (val || 'null') + '</span>';
      ls.appendChild(row);
    });

    _dbg('Page loaded: ' + location.pathname);
  });
})();
<\/script>`;

  // Insert before </body>
  const bodyClose = html.lastIndexOf('</body>');
  if (bodyClose === -1) {
    html += INJECT;
    console.log('✅ Debug+auto-login injected at end');
  } else {
    html = html.slice(0, bodyClose) + INJECT + '\n' + html.slice(bodyClose);
    console.log('✅ Debug+auto-login injected before </body>');
  }
}

fs.writeFileSync(file, html, 'utf8');
console.log('\n✅ nexum.html saved!');
