/* ============================================================
   NEXUM ONBOARDING TOUR v4 — ВИПРАВЛЕНА ВЕРСІЯ
   Вставте як <script src="nexum_tour.js"></script>
   перед закриваючим </body> у dashboard.html
   ============================================================ */

/* ---------- CSS ---------- */
(function(){
const style = document.createElement('style');
style.textContent = `
#nx-tour-backdrop {
  display:none; position:fixed; inset:56px 0 0 0;
  background:rgba(0,0,0,.48); z-index:8000;
  pointer-events:none;
}
#nx-tour-backdrop.show { display:block; }

#nx-tour-tip {
  display:none; position:fixed; z-index:8100;
  background:#fff; border:1.5px solid #FCE7F3; border-radius:16px;
  padding:0; width:330px;
  box-shadow:0 16px 48px rgba(236,72,153,.22);
  overflow:hidden;
}
#nx-tour-tip.show {
  display:block;
  animation:nxTipIn .22s cubic-bezier(.34,1.2,.64,1);
}
@keyframes nxTipIn {
  from { transform:translateY(8px) scale(.97); opacity:0; }
  to   { transform:none; opacity:1; }
}

/* Arrow — default hidden */
#nx-tour-tip::before {
  content:''; position:absolute; width:0; height:0;
  border:7px solid transparent; pointer-events:none; display:none;
}
#nx-tour-tip.arrow-bottom::before {
  display:block; bottom:100%; left:26px; border-bottom-color:#FCE7F3;
}
#nx-tour-tip.arrow-top::before {
  display:block; top:100%; left:26px; border-top-color:#FCE7F3;
}
#nx-tour-tip.arrow-right::before {
  display:block; right:100%; top:20px; border-right-color:#FCE7F3;
}
#nx-tour-tip.arrow-left::before {
  display:block; left:100%; top:20px; border-left-color:#FCE7F3;
}

/* Progress */
.nx-tip-prog { height:3px; background:#FCE7F3; }
.nx-tip-prog-bar {
  height:100%;
  background:linear-gradient(90deg,#F472B6,#EC4899);
  transition:width .35s ease;
}

/* Section */
.nx-tip-section {
  display:flex; align-items:center; gap:5px;
  font-size:9px; color:#EC4899;
  font-family:'IBM Plex Mono',monospace;
  letter-spacing:.09em; text-transform:uppercase;
  background:#FFF0F7; border-bottom:1px solid #FCE7F3;
  padding:5px 18px;
}

.nx-tip-body { padding:14px 18px 12px; }

.nx-tip-step {
  font-size:9.5px; color:#9CA3AF;
  font-family:'IBM Plex Mono',monospace;
  letter-spacing:.06em; margin-bottom:4px;
}
.nx-tip-title {
  font-size:13.5px; font-weight:700;
  color:#1F2937; margin-bottom:6px;
  font-family:'Syne',sans-serif;
}
.nx-tip-desc {
  font-size:12px; color:#6B7280;
  line-height:1.7; margin-bottom:10px;
}
.nx-tip-hint {
  background:#FFF5F7;
  border-left:3px solid #F9A8D4;
  border-radius:0 8px 8px 0;
  padding:7px 10px;
  font-size:11px; color:#9D6B7F;
  line-height:1.6; margin-bottom:10px;
}
.nx-tip-hint b { color:#EC4899; }

.nx-tip-list {
  margin:0 0 10px; padding:0; list-style:none;
}
.nx-tip-list li {
  font-size:11.5px; color:#374151;
  padding:5px 0; border-bottom:1px solid #FCE7F3;
  line-height:1.5; display:flex; gap:7px; align-items:flex-start;
}
.nx-tip-list li:last-child { border-bottom:none; }
.nx-tip-list li .li-ico { font-size:13px; flex-shrink:0; margin-top:1px; }
.nx-tip-list li .li-txt b { color:#1F2937; }
.nx-tip-list li .li-txt span { color:#9CA3AF; }

.nx-tip-actions {
  display:flex; align-items:center;
  gap:7px; flex-wrap:wrap;
  padding:10px 18px 12px;
  border-top:1px solid #FCE7F3;
  background:#FFFBFD;
}
.nx-tip-next {
  background:linear-gradient(135deg,#F472B6,#EC4899);
  color:#fff; border:none; border-radius:20px;
  padding:7px 16px; font-size:12px;
  font-family:'Inter',sans-serif; font-weight:600;
  cursor:pointer; transition:.15s;
  box-shadow:0 3px 10px rgba(244,114,182,.4);
}
.nx-tip-next:hover { opacity:.87; transform:translateY(-1px); }
.nx-tip-prev {
  background:#FFF5F7; border:1px solid #FCE7F3;
  color:#9CA3AF; border-radius:20px;
  padding:7px 13px; font-size:12px;
  font-family:'Inter',sans-serif; cursor:pointer; transition:.15s;
}
.nx-tip-prev:hover { border-color:#F9A8D4; color:#EC4899; }
.nx-tip-skip {
  margin-left:auto; font-size:10.5px; color:#D1D5DB;
  background:none; border:none; cursor:pointer;
  font-family:'Inter',sans-serif; text-decoration:underline;
}
.nx-tip-skip:hover { color:#9CA3AF; }
.nx-tip-dots {
  display:flex; gap:4px; align-items:center; flex-wrap:wrap; max-width:110px;
}
.nx-tip-dot { width:5px; height:5px; border-radius:50%; background:#FCE7F3; transition:background .2s; flex-shrink:0; }
.nx-tip-dot.on  { background:#EC4899; }
.nx-tip-dot.done { background:#F9A8D4; }

.nx-highlight {
  outline:2.5px solid #EC4899 !important;
  outline-offset:4px !important;
  border-radius:8px;
  position:relative; z-index:8050 !important;
}

/* Welcome */
#nx-welcome {
  display:none; position:fixed; inset:0; z-index:9500;
  background:rgba(236,72,153,.06); backdrop-filter:blur(8px);
  align-items:center; justify-content:center;
}
#nx-welcome.show { display:flex; }
#nx-welcome-box {
  background:#fff; border:1.5px solid #FCE7F3;
  border-radius:24px; padding:36px 32px; max-width:460px; width:90%;
  box-shadow:0 32px 80px rgba(244,114,182,.2); text-align:center;
  animation:nxTipIn .3s cubic-bezier(.34,1.2,.64,1);
}
.nw-emoji { font-size:42px; margin-bottom:12px; }
#nx-welcome-box h2 {
  font-family:'Syne',sans-serif; font-size:21px;
  font-weight:700; color:#1F2937; margin-bottom:8px;
}
#nx-welcome-box p { font-size:13px; color:#6B7280; line-height:1.7; margin-bottom:14px; }
.nw-chips { display:flex; gap:7px; justify-content:center; flex-wrap:wrap; margin-bottom:20px; }
.nw-chip {
  font-size:11.5px; color:#9D6B7F;
  background:#FFF0F7; border:1px solid #FCE7F3;
  border-radius:20px; padding:4px 10px; font-family:'Inter',sans-serif;
}
.nw-btns { display:flex; gap:10px; justify-content:center; }
.nw-start {
  background:linear-gradient(135deg,#F472B6,#EC4899);
  color:#fff; border:none; border-radius:50px; padding:10px 26px;
  font-size:13px; font-family:'Inter',sans-serif; font-weight:600;
  cursor:pointer; transition:.2s; box-shadow:0 4px 16px rgba(244,114,182,.4);
}
.nw-start:hover { opacity:.88; transform:translateY(-1px); }
.nw-later {
  background:#FFF5F7; border:1px solid #FCE7F3; color:#9CA3AF;
  border-radius:50px; padding:10px 20px; font-size:13px;
  font-family:'Inter',sans-serif; cursor:pointer; transition:.15s;
}
.nw-later:hover { border-color:#F9A8D4; color:#EC4899; }

/* Help button */
#nx-help-btn {
  position:fixed; bottom:28px; right:28px; z-index:7000;
  width:44px; height:44px; border-radius:50%;
  background:linear-gradient(135deg,#F472B6,#EC4899);
  color:#fff; border:none; font-size:18px; cursor:pointer;
  box-shadow:0 4px 20px rgba(244,114,182,.5);
  display:flex; align-items:center; justify-content:center;
  transition:.2s; font-family:'Inter',sans-serif; font-weight:700; line-height:1;
}
#nx-help-btn:hover { transform:scale(1.1); opacity:.92; }
#nx-help-btn::after {
  content:'Підказки'; position:absolute; right:52px;
  background:#1F2937; color:#fff; font-size:10px; font-weight:400;
  white-space:nowrap; padding:4px 8px; border-radius:6px; opacity:0;
  transition:opacity .2s; pointer-events:none; font-family:'Inter',sans-serif;
}
#nx-help-btn:hover::after { opacity:1; }
`;
document.head.appendChild(style);
})();

/* ============================================================
   TOUR DATA
   ============================================================ */
var NX_TIPS = [

  /* 0 — НАВІГАЦІЯ */
  {
    anchor:'dpt1', dir:'bottom', tab:1,
    section:'Навігація', icon:'🗂️',
    title:'Головне меню — 5 вкладок',
    desc:'Верхня панель — єдина точка навігації кабінету. Клік на вкладку миттєво переключає розділ.',
    list:[
      ['👥','Пацієнти','база, пошук, деталі картки'],
      ['🛠','Конструктор','редактор анкет і шаблонів'],
      ['🔗','Посилання','генерація посилань для пацієнтів'],
      ['📊','Аналітика','статистика по всій базі'],
      ['🗑','Корзина','видалені елементи — 30 днів зберігання'],
    ],
    hint:'Клавіши: <b>→ Enter</b> — далі &nbsp;|&nbsp; <b>←</b> — назад &nbsp;|&nbsp; <b>Esc</b> — закрити.',
    delay: 0,
  },

  /* 1 — ПОШУК */
  {
    anchor:'patSearch', dir:'bottom', tab:1,
    section:'Пацієнти — Пошук', icon:'🔍',
    title:'Рядок пошуку пацієнта',
    desc:'Почніть вводити — список оновлюється миттєво. Пошук працює по трьох полях одночасно:',
    list:[
      ['🔤','ПІБ','будь-яка частина прізвища, імені або по батькові'],
      ['📞','Телефон','повний номер або його частина'],
      ['🩺','Діагноз','ключове слово з діагнозу або скарги'],
    ],
    hint:'Достатньо <b>2–3 літери</b>. Регістр не важливий.',
    delay: 0,
  },

  /* 2 — КНОПКА ДОДАТИ */
  {
    anchor:'addPatBtnText', dir:'bottom', tab:1,
    section:'Пацієнти — Додавання', icon:'➕',
    title:'Кнопка «Додати пацієнта»',
    desc:'Відкриває повну форму. Обов\'язкові лише прізвище або ім\'я — решту можна заповнити пізніше.',
    list:[
      ['🪪','Основні дані','ПІБ, стать, дата народження, група крові'],
      ['📞','Контакти','телефон і Telegram'],
      ['🩺','Діагноз','причина звернення або діагноз'],
      ['💊','Анамнез','алергії, хронічні хвороби, препарати'],
      ['📝','Нотатки','приватний блок — пацієнт не бачить'],
    ],
    hint:'<b>Швидший спосіб:</b> вкладка «Посилання» → пацієнт заповнює анкету сам → картка створюється автоматично.',
    delay: 0,
  },

  /* 3 — СТАТИСТИКА */
  {
    anchor:'patStats', dir:'bottom', tab:1,
    section:'Пацієнти — Статистика', icon:'📊',
    title:'4 картки статистики',
    desc:'Швидкий огляд бази одним поглядом:',
    list:[
      ['🔵','Всього пацієнтів','загальна кількість у базі'],
      ['🟢','Цього місяця','нові пацієнти за поточний місяць'],
      ['🟡','З алергіями','кількість пацієнтів з вказаними алергіями'],
      ['🟣','Сер. сесій','середня кількість розмов з ботом на пацієнта'],
    ],
    hint:'Дані оновлюються автоматично при кожному завантаженні вкладки.',
    delay: 0,
  },

  /* 4 — СПИСОК ПАЦІЄНТІВ */
  {
    anchor:'patListEl', dir:'bottom', tab:1,
    section:'Пацієнти — Список', icon:'👤',
    title:'Картка пацієнта у списку',
    desc:'Клікніть на картку щоб відкрити повну сторінку пацієнта.',
    list:[
      ['🎨','Аватар','автоматично з ініціалів, унікальний колір'],
      ['📋','Ім\'я + діагноз','головні ідентифікатори'],
      ['📞','Телефон','якщо заповнено'],
      ['💬','Кількість сесій','скільки разів спілкувався з ботом'],
    ],
    hint:'Список сортується за датою додавання — найновіші зверху.',
    delay: 0,
  },

  /* 5 — КОНСТРУКТОР: огляд */
  {
    anchor:'dpt2', dir:'bottom', tab:2,
    section:'Конструктор — Огляд', icon:'🛠️',
    title:'Вкладка «Конструктор»',
    desc:'Тут ви будуєте анкети, які пацієнти заповнюють через посилання. Сторінка поділена на 2 колонки:',
    list:[
      ['◀','Ліворуч','список питань активної анкети + кнопки додавання'],
      ['▶','Праворуч','редактор вибраного питання'],
    ],
    hint:'Всі зміни зберігаються <b>автоматично</b> через 1.5 секунди після редагування.',
    needsTab: 2, delay: 300,
    action: function(){ if(typeof backToList==='function')backToList(); },
  },

  /* 6 — ПЕРЕМИКАЧ ШАБЛОНУ */
  {
    anchor:'surveySelectWrap', dir:'bottom', tab:2,
    section:'Конструктор — Шаблон', icon:'📂',
    title:'Перемикач активного шаблону',
    desc:'Клік відкриває список усіх ваших анкет. Для кожного шаблону:',
    list:[
      ['✓','Обрати','зробити шаблон активним'],
      ['✏️','Перейменувати','змінити назву без втрати питань'],
      ['🗑','Видалити','перемістити до Корзини'],
    ],
    hint:'<b>Активний шаблон</b> = той, на який генеруються посилання.',
    delay: 100,
  },

  /* 7 — СПИСОК ПИТАНЬ */
  {
    anchor:'conItems', dir:'right', tab:2,
    section:'Конструктор — Питання', icon:'❓',
    title:'Список питань анкети',
    desc:'Питання у порядку як їх побачить пацієнт:',
    list:[
      ['🔢','Номер','порядковий номер'],
      ['📝','Текст','скорочений текст питання'],
      ['✏️','Клік','відкриває редактор питання праворуч'],
      ['×','Видалити','прибирає питання'],
    ],
    hint:'Нижче списку — кнопки типів: <b>Так/Ні, Варіанти, Шкала болю, Мульти</b> та широка кнопка <b>Текст</b>.',
    delay: 0,
  },

  /* 8 — РЕДАКТОР */
  {
    anchor:'conEditor', dir:'left', tab:2,
    section:'Конструктор — Редактор', icon:'⚙️',
    title:'Редактор питання',
    desc:'Оберіть питання зі списку — тут з\'являться всі налаштування:',
   list:[
  ['📝','Текст питання','те що побачить пацієнт'],
  ['🔘','Тип відповіді','Так/Ні, Варіанти, Текст або Мульти'],
  ['➕','Варіанти','для типів «Варіанти» та «Мульти»'],
  ['↳','Підпитання','уточнення після відповіді пацієнта'],
],
hint:'Зміни зберігаються <b>автоматично</b> — кнопки «Зберегти» немає.',
    delay: 0,
  },

  /* 9 — ШАБЛОНИ (бібліотека) */
  {
    anchor:'dpt2', dir:'bottom', tab:2,
    section:'Конструктор — Бібліотека', icon:'📋',
    title:'Кнопка «Шаблони» — готові анкети',
    desc:'Готові професійні шаблони за медичними спеціальностями:',
    list:[
      ['❤️','Кардіолог','серцево-судинні скарги та ризики'],
      ['🧠','Невролог','головний біль, судоми, оніміння'],
      ['🌸','Гінеколог','стандартний гінекологічний анамнез'],
      ['🩺','Терапевт','загальний первинний прийом'],
      ['👶','Педіатр + ін.','ще 4 спеціальності'],
    ],
    hint:'Натисніть <b>«+ Додати»</b> — шаблон одразу з\'являється у вашому списку і його можна редагувати. Кнопка <b>«📋 Роздруківка»</b> — друкує чистий бланк анкети.',
    delay: 0,
  },

  /* 10 — ПОСИЛАННЯ: вкладка */
  {
    anchor:'dpt4', dir:'bottom', tab:4,
    section:'Посилання — Огляд', icon:'🔗',
    title:'Вкладка «Посилання»',
    desc:'Унікальні посилання на анкети для пацієнтів. Пацієнт відкриває у браузері, заповнює — відповіді автоматично з\'являються у його картці.',
    list:[
      ['🔗','Унікальний URL','кожне посилання — окремий адрес'],
      ['👤','Прив\'язка','за іменем у журналі'],
      ['📊','Статус','«Очікує» або кількість заповнень'],
      ['♾','Багаторазове','одне посилання можна заповнити кілька разів'],
    ],
    hint:'Посилання можна надіслати у <b>Viber, Telegram, SMS або email</b>.',
    needsTab: 4, delay: 300,
  },

  /* 11 — СТАТИСТИКА ПОСИЛАНЬ */
  {
    anchor:'lpTotal4', dir:'bottom', tab:4,
    section:'Посилання — Статистика', icon:'📊',
    title:'3 лічильники посилань',
    desc:'',
    list:[
      ['🔵','Всього','скільки посилань ви створили'],
      ['🟡','Очікують','пацієнт ще не заповнив'],
      ['🟢','Заповнень','скільки разів посилання було використано'],
    ],
    hint:'Одне посилання може бути заповнено <b>кілька разів</b> — кожне заповнення = нова сесія.',
    delay: 0,
  },

  /* 12 — ФОРМА ПОСИЛАННЯ */
  {
    anchor:'lpPatientName4', dir:'bottom', tab:4,
    section:'Посилання — Форма', icon:'📝',
    title:'Форма нового посилання',
    desc:'Два поля — обидва необов\'язкові:',
    list:[
      ['👤','Ім\'я пацієнта','підпис у журналі, пацієнт вводить своє ім\'я сам'],
      ['📝','Нотатка','ваша приватна позначка (пацієнт не бачить)'],
    ],
    hint:'Після натискання «Створити» посилання <b>автоматично копіюється в буфер обміну</b> — залишається вставити у чат.',
    delay: 0,
  },

  /* 13 — ЖУРНАЛ ПОСИЛАНЬ */
  {
    anchor:'lpList4', dir:'top', tab:4,
    section:'Посилання — Журнал', icon:'📋',
    title:'Журнал посилань',
    desc:'Кожна картка у журналі:',
    list:[
      ['👤','Аватар + ім\'я','для кого посилання'],
      ['🟡🟢','Статус','«Очікує» або «N заповнень»'],
      ['📋','Копіювати','скопіювати URL ще раз'],
      ['🗑','Видалити','переміщує до Корзини'],
    ],
    hint:'Статус оновлюється автоматично після заповнення анкети пацієнтом.',
    delay: 0,
  },

  /* 14 — АНАЛІТИКА */
  {
    anchor:'dpt3', dir:'bottom', tab:3,
    section:'Аналітика — Огляд', icon:'📊',
    title:'Вкладка «Аналітика»',
    desc:'Автоматична статистика по всій базі. Оновлюється щоразу при відкритті вкладки.',
    list:[
      ['🔢','4 показники вгорі','ключові цифри одним поглядом'],
      ['📈','Активність по місяцях','динаміка за поточний рік'],
      ['📅','Пацієнтів на місяць','середнє та тренд'],
      ['🩺','Топ симптомів','найчастіші скарги у вашій базі'],
    ],
    hint:'Ці дані допоможуть зрозуміти <b>сезонність</b> прийому та профіль пацієнтів.',
    needsTab: 3, delay: 300,
    action: function(){ if(typeof renderAnalytics==='function') renderAnalytics(); },
  },

  /* 15 — АНАЛІТИКА СТАТИСТИКА */
  {
    anchor:'analyticsStats', dir:'bottom', tab:3,
    section:'Аналітика — Показники', icon:'🔢',
    title:'4 ключові показники',
    desc:'',
    list:[
      ['🔵','Пацієнтів','загальна кількість у базі'],
      ['🟣','З сесіями','скільки пацієнтів спілкувались з ботом'],
      ['🟡','Всього сесій','загальна кількість заповнених анкет'],
      ['🟢','Сер. час анкети','середній час від першого до останнього повідомлення'],
    ],
    delay: 100,
  },

  /* 16 — КОРЗИНА */
  {
    anchor:'dpt5', dir:'bottom', tab:5,
    section:'Корзина — Огляд', icon:'🗑️',
    title:'Вкладка «Корзина»',
    desc:'Безпечне видалення — нічого не зникає миттєво. Всі видалені елементи зберігаються <b>30 днів</b>.',
    list:[
      ['👥','Пацієнти','видалені картки з усіма даними'],
      ['📋','Шаблони','видалені анкети з питаннями'],
      ['🔗','Посилання','видалені URL для пацієнтів'],
    ],
    hint:'<b>«↩ Відновити»</b> — повертає елемент назад. <b>«✕ Назавжди»</b> — видаляє без можливості відновлення.',
    needsTab: 5, delay: 300,
    action: function(){ if(typeof setTrashTab==='function') setTrashTab('patients'); },
  },

  /* 17 — КОРЗИНА: розділи */
  {
    anchor:'trashTabs', dir:'bottom', tab:5,
    section:'Корзина — Розділи', icon:'🗂️',
    title:'Три розділи корзини',
    desc:'',
    list:[
      ['👥','Пацієнти','видалені картки — всі дані, фото та сесії збережені'],
      ['📋','Шаблони','видалені анкети — питання та налаштування збережені'],
      ['🔗','Посилання','видалені URL — статус та нотатка збережені'],
    ],
    hint:'<b>«Очистити всю корзину»</b> — видаляє все після підтвердження. Дія незворотна.',
    delay: 100,
  },
];

/* ============================================================
   STATE
   ============================================================ */
var _nxStep = 0;
var _nxActive = false;
var _nxPrevEl = null;
var _nxRenderTimer = null;

/* ============================================================
   CORE HELPERS
   ============================================================ */
function _nxIsVisible(el){
  if(!el) return false;
  var rect = el.getBoundingClientRect();
  if(rect.width === 0 && rect.height === 0) return false;
  if(rect.top < 0 || rect.left < 0) return false;
  var style = window.getComputedStyle(el);
  if(style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  return true;
}

function _nxGetEl(id){
  var el = document.getElementById(id);
  if(!el) return null;
  // If element is a span/text node inside a button, get the parent button
  if(el.tagName === 'SPAN' && el.parentElement && !_nxIsVisible(el)){
    return _nxIsVisible(el.parentElement) ? el.parentElement : null;
  }
  return _nxIsVisible(el) ? el : null;
}

/* ============================================================
   POSITION TOOLTIP
   ============================================================ */
function _nxPosition(tip, el){
  var tipEl = document.getElementById('nx-tour-tip');
  var rect = el.getBoundingClientRect();
  var TW = 330, pad = 16;
  var vw = window.innerWidth, vh = window.innerHeight;
  var margin = 12;

  // Estimate tip height
  var TH = tipEl.offsetHeight || 280;

  var top, left, arrowClass;

  if(tip.dir === 'bottom'){
    top = rect.bottom + margin;
    left = rect.left;
    arrowClass = 'arrow-bottom';
    if(top + TH > vh - 20){
      top = rect.top - TH - margin;
      arrowClass = 'arrow-top';
    }
  } else if(tip.dir === 'top'){
    top = rect.top - TH - margin;
    left = rect.left;
    arrowClass = 'arrow-top';
    if(top < 60){
      top = rect.bottom + margin;
      arrowClass = 'arrow-bottom';
    }
  } else if(tip.dir === 'right'){
    top = rect.top;
    left = rect.right + margin;
    arrowClass = 'arrow-right';
    if(left + TW > vw - 12){
      left = rect.left - TW - margin;
      arrowClass = 'arrow-left';
    }
  } else { // left
    top = rect.top;
    left = rect.left - TW - margin;
    arrowClass = 'arrow-left';
    if(left < 12){
      left = rect.right + margin;
      arrowClass = 'arrow-right';
    }
  }

  // Clamp
  top  = Math.max(60, Math.min(top, vh - TH - 12));
  left = Math.max(8,  Math.min(left, vw - TW - 8));

  tipEl.style.top  = top + 'px';
  tipEl.style.left = left + 'px';

  // Remove all arrow classes
  tipEl.classList.remove('arrow-bottom','arrow-top','arrow-right','arrow-left');
  tipEl.classList.add(arrowClass);
}

/* ============================================================
   RENDER STEP
   ============================================================ */
function _nxDoRender(step){
  if(step >= NX_TIPS.length){ _nxEnd(true); return; }

  var tip = NX_TIPS[step];

  // Find element
  var el = _nxGetEl(tip.anchor);
  if(!el){
    // Skip invisible/missing step
    _nxStep++;
    _nxDoRender(_nxStep);
    return;
  }

  // Highlight
  if(_nxPrevEl && _nxPrevEl !== el) _nxPrevEl.classList.remove('nx-highlight');
  el.classList.add('nx-highlight');
  _nxPrevEl = el;

  // Build HTML
  var tipEl = document.getElementById('nx-tour-tip');
  var progress = Math.round(step / (NX_TIPS.length - 1) * 100);

  var dots = NX_TIPS.map(function(_, i){
    var cls = i === step ? ' on' : i < step ? ' done' : '';
    return '<span class="nx-tip-dot' + cls + '"></span>';
  }).join('');

  var listHtml = '';
  if(tip.list && tip.list.length){
    listHtml = '<ul class="nx-tip-list">' +
      tip.list.map(function(item){
        var ico = item[0], label = item[1], note = item[2] || '';
        return '<li><span class="li-ico">' + ico + '</span><span class="li-txt"><b>' + label + '</b>' +
          (note ? '<br><span>' + note + '</span>' : '') + '</span></li>';
      }).join('') +
    '</ul>';
  }

  var hintHtml = tip.hint ? '<div class="nx-tip-hint">' + tip.hint + '</div>' : '';
  var sectionHtml = tip.section
    ? '<div class="nx-tip-section">' + (tip.icon ? tip.icon + ' ' : '') + tip.section + '</div>'
    : '';

  var prevBtn = step > 0
    ? '<button class="nx-tip-prev" id="nx-btn-prev">← Назад</button>'
    : '';

  var nextLabel = step < NX_TIPS.length - 1 ? 'Далі →' : 'Готово ✓';

  tipEl.innerHTML =
    '<div class="nx-tip-prog"><div class="nx-tip-prog-bar" style="width:' + progress + '%"></div></div>' +
    sectionHtml +
    '<div class="nx-tip-body">' +
      '<div class="nx-tip-step">Крок ' + (step + 1) + ' з ' + NX_TIPS.length + '</div>' +
      '<div class="nx-tip-title">' + tip.title + '</div>' +
      '<div class="nx-tip-desc">' + (tip.desc || '') + '</div>' +
      listHtml +
      hintHtml +
    '</div>' +
    '<div class="nx-tip-actions">' +
      '<button class="nx-tip-next" id="nx-btn-next">' + nextLabel + '</button>' +
      prevBtn +
      '<button class="nx-tip-skip" id="nx-btn-skip">Пропустити</button>' +
      '<div class="nx-tip-dots">' + dots + '</div>' +
    '</div>';

  // Show tip first, then position (need offsetHeight)
  tipEl.style.display = 'none';
  tipEl.classList.remove('show');

  requestAnimationFrame(function(){
    tipEl.style.display = '';
    tipEl.classList.add('show');
    // Wait one more frame so offsetHeight is computed
    requestAnimationFrame(function(){
      _nxPosition(tip, el);
    });
  });

  // Bind buttons
  document.getElementById('nx-btn-next').onclick = _nxNext;
  var pb = document.getElementById('nx-btn-prev');
  if(pb) pb.onclick = _nxPrev;
  document.getElementById('nx-btn-skip').onclick = function(){ _nxEnd(false); };
}

function _nxRender(){
  if(!_nxActive) return;
  var step = _nxStep;
  if(step >= NX_TIPS.length){ _nxEnd(true); return; }

  var tip = NX_TIPS[step];

  // Switch tab if needed
  var needsTab = tip.needsTab || tip.tab;
  var tabEl = needsTab ? document.getElementById('dt' + needsTab) : null;
  var tabNeedsSwitch = tabEl && !tabEl.classList.contains('on');

  if(tabNeedsSwitch && typeof switchTab === 'function'){
    switchTab(needsTab);
  }

  // Run tip action
  if(typeof tip.action === 'function'){
    try { tip.action(); } catch(e){}
  }

  // Delay before rendering (wait for tab transition)
  var delay = tip.delay != null ? tip.delay : (tabNeedsSwitch ? 350 : 0);

  clearTimeout(_nxRenderTimer);
  if(delay > 0){
    _nxRenderTimer = setTimeout(function(){
      _nxDoRender(step);
    }, delay);
  } else {
    _nxDoRender(step);
  }
}

function _nxNext(){
  _nxStep++;
  _nxRender();
}
function _nxPrev(){
  if(_nxStep > 0){
    _nxStep--;
    _nxRender();
  }
}

function _nxEnd(finished){
  _nxActive = false;
  clearTimeout(_nxRenderTimer);

  var bd = document.getElementById('nx-tour-backdrop');
  var tipEl = document.getElementById('nx-tour-tip');
  if(bd) bd.classList.remove('show');
  if(tipEl){ tipEl.classList.remove('show'); tipEl.style.display = 'none'; }
  if(_nxPrevEl){ _nxPrevEl.classList.remove('nx-highlight'); _nxPrevEl = null; }

  if(finished){
    localStorage.setItem('nexum_tour_done_v4', '1');
    setTimeout(function(){
      if(typeof showToast === 'function')
        showToast('✓ Тур завершено! Натисніть ? будь-коли щоб переглянути знову.');
    }, 400);
  }
}

/* ============================================================
   PUBLIC ENTRY POINT
   ============================================================ */
function nexumStartTour(){
  _nxStep = 0;
  _nxActive = true;

  var bd = document.getElementById('nx-tour-backdrop');
  if(bd) bd.classList.add('show');

  // Start from patients tab
  if(typeof switchTab === 'function') switchTab(1);
  if(typeof backToList === 'function') backToList();

  setTimeout(_nxRender, 200);
}

/* ============================================================
   WELCOME MODAL
   ============================================================ */
function _nxShowWelcome(){
  // Don't show if already shown
  if(document.getElementById('nx-welcome')) return;

  var box = document.createElement('div');
  box.id = 'nx-welcome';
  box.className = 'show';
  var name = sessionStorage.getItem('nexum_name') || '';
  var firstName = name ? name.split(' ')[0] : '';

  box.innerHTML =
    '<div id="nx-welcome-box">' +
      '<div class="nw-emoji">👋</div>' +
      '<h2>Ласкаво просимо' + (firstName ? ', ' + firstName : '') + '!</h2>' +
      '<p>Детальний тур покаже <b>кожну функцію</b> кабінету лікаря —<br>з поясненням навіщо це потрібно і як використовувати.</p>' +
      '<div class="nw-chips">' +
        '<span class="nw-chip">👥 Пацієнти</span>' +
        '<span class="nw-chip">🛠 Конструктор</span>' +
        '<span class="nw-chip">🔗 Посилання</span>' +
        '<span class="nw-chip">📊 Аналітика</span>' +
        '<span class="nw-chip">🗑 Корзина</span>' +
      '</div>' +
      '<p style="font-size:11px;color:#9CA3AF;margin-bottom:16px;">' +
        'Клавіши: ← → або Enter — переміщення &nbsp;|&nbsp; Esc — закрити' +
      '</p>' +
      '<div class="nw-btns">' +
        '<button class="nw-start" id="nw-start-btn">Почати тур →</button>' +
        '<button class="nw-later" id="nw-later-btn">Пізніше</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(box);

  document.getElementById('nw-start-btn').onclick = function(){
    box.remove();
    nexumStartTour();
  };
  document.getElementById('nw-later-btn').onclick = function(){
    box.remove();
    localStorage.setItem('nexum_tour_done_v4', 'skipped');
  };
}

/* ============================================================
   INJECT HTML
   ============================================================ */
(function(){
  // Backdrop — pointer-events:none so it doesn't block clicks on highlighted elements
  var bd = document.createElement('div');
  bd.id = 'nx-tour-backdrop';
  document.body.appendChild(bd);

  // Tip container
  var tip = document.createElement('div');
  tip.id = 'nx-tour-tip';
  document.body.appendChild(tip);

  // Help button
  var btn = document.createElement('button');
  btn.id = 'nx-help-btn';
  btn.title = 'Показати тур підказок';
  btn.textContent = '?';
  btn.onclick = nexumStartTour;
  document.body.appendChild(btn);
})();

/* ============================================================
   KEYBOARD NAVIGATION
   ============================================================ */
document.addEventListener('keydown', function(e){
  if(!_nxActive) return;
  if(e.key === 'ArrowRight' || e.key === 'Enter'){
    // Don't intercept Enter on input/button elements
    if(e.key === 'Enter' && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    _nxNext();
  }
  if(e.key === 'ArrowLeft') _nxPrev();
  if(e.key === 'Escape') _nxEnd(false);
});

/* ============================================================
   AUTO-START — тільки для нових користувачів
   ============================================================ */
(function(){
  var attempts = 0;
  var checkReady = setInterval(function(){
    attempts++;
    if(attempts > 60){ clearInterval(checkReady); return; } // 30s timeout
    var auth = sessionStorage.getItem('nexum_auth');
    if(!auth) return;
    clearInterval(checkReady);
    // Check if already done (support old v3 key too)
    var done = localStorage.getItem('nexum_tour_done_v4') || localStorage.getItem('nexum_tour_done_v3');
    if(!done){
      setTimeout(_nxShowWelcome, 1600);
    }
  }, 500);
})();
