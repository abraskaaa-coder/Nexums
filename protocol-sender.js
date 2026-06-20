/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║           NEXUM — PROTOCOL SENDER MODULE                    ║
 * ║  Логіка перевірки каналу доставки та відправки протоколу   ║
 * ║  Підключається в dashboard.html перед закриваючим </script> ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * ПІДКЛЮЧЕННЯ В dashboard.html:
 * ─────────────────────────────
 * 1. Перед </body> додайте:
 *    <script src="protocol-sender.js"></script>
 *
 * 2. Кнопка PDF в renderPatActions() вже викликає exportPatientPDF()
 *    — вона відкриє редактор, де кнопка "Надіслати" буде використовувати
 *    цей модуль через postMessage.
 *
 * ЯК ПРАЦЮЄ:
 * ──────────
 * Лікар натискає "📄 PDF" → відкривається редактор протоколу (pop-up)
 * → Лікар редагує, натискає "📤 Надіслати пацієнту"
 * → Редактор надсилає postMessage до dashboard
 * → Цей модуль перехоплює повідомлення і:
 *     • Якщо channel === 'email' → генерує PDF (html2pdf) → SendGrid
 *     • Якщо channel === 'cabinet' → зберігає в conclusions (Supabase)
 *     • Якщо channel === 'telegram' → надсилає HTML-файл через бот
 *
 * ЗАЛЕЖНОСТІ:
 * ───────────
 * • apiFetch()          — вже є в dashboard.html
 * • doctorCode()        — вже є в dashboard.html
 * • patients (array)    — вже є в dashboard.html
 * • getPatientDeliveryInfo() — вже є в dashboard.html
 * • showToast()         — вже є в dashboard.html
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     1. ГОЛОВНИЙ ОБРОБНИК postMessage від редактора протоколу
     ════════════════════════════════════════════════════════════ */

  window.addEventListener('message', async function (event) {
    if (!event.data || event.data.type !== 'NEXUM_SEND_PROTOCOL') return;

    const { patId, protocolData } = event.data;

    // ── Визначаємо канал доставки ───────────────────────────
    const delivery =
      protocolData.deliveryInfo ||
      (typeof getPatientDeliveryInfo === 'function'
        ? getPatientDeliveryInfo(patients.find(x => String(x.id) === String(patId)) || {})
        : {});

    const channel = (delivery.channel || '').toLowerCase();

    // ── Логуємо для відлагодження ───────────────────────────
    console.log('[ProtocolSender] channel:', channel, '| patId:', patId);

    try {
      if (channel === 'email' && delivery.email) {
        await _sendByEmail(patId, protocolData, delivery, event.source);

      } else if (channel === 'telegram') {
        await _sendByTelegram(patId, protocolData, delivery, event.source);

      } else {
        // За замовчуванням — кабінет пацієнта
        await _sendToCabinet(patId, protocolData, delivery, event.source);
      }

    } catch (err) {
      console.error('[ProtocolSender] Помилка відправки:', err);
      if (typeof showToast === 'function') {
        showToast('Помилка відправки: ' + err.message, 'error');
      }
      _reply(event.source, false, err.message);
    }
  });


  /* ══════════════════════════════════════════════════════════════
     2. КАНАЛ: EMAIL → SendGrid (через /api/patient/send-email-pdf)
     ════════════════════════════════════════════════════════════ */

  async function _sendByEmail(patId, protocolData, delivery, source) {
    const toEmail = delivery.email;
    if (!toEmail) throw new Error('Email не вказано для пацієнта');

    const doctorName =
      sessionStorage.getItem('nexum_name') || (typeof doctorCode === 'function' ? doctorCode() : '');

    // ── Генеруємо PDF через html2pdf.js у браузері ──────────
    const pdfBase64 = await _generatePdfBase64(protocolData);

    const patientName = protocolData.patientInfo?.fullName || '';
    const fileName = 'Nexum_protocol_' + patientName.replace(/\s+/g, '_') + '.pdf';

    if (typeof showToast === 'function') {
      showToast('Надсилаємо PDF на ' + toEmail + '…');
    }

    await apiFetch('/api/patient/send-email-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toEmail,
        pdfBase64,
        pdfFileName:  fileName,
        patientName,
        doctorName,
      }),
    });

    if (typeof showToast === 'function') {
      showToast('✅ PDF протокол надіслано на ' + toEmail);
    }

    // Також зберігаємо запис у висновках (для журналу лікаря)
    await _saveConclusionRecord(patId, protocolData, doctorName);

    _reply(source, true);
  }


  /* ══════════════════════════════════════════════════════════════
     3. КАНАЛ: TELEGRAM → /api/patient/send-telegram-pdf
     ════════════════════════════════════════════════════════════ */

  async function _sendByTelegram(patId, protocolData, delivery, source) {
    const pdfHtml = protocolData.pdfHtml || _buildFallbackHtml(protocolData);
    const patientName = protocolData.patientInfo?.fullName || 'patient';
    const fileName = 'Nexum_protocol_' + patientName.replace(/\s+/g, '_') + '.html';

    if (typeof showToast === 'function') showToast('Надсилаємо у Telegram…');

    await apiFetch('/api/patient/send-telegram-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientId:   patId,
        doctorCode:  typeof doctorCode === 'function' ? doctorCode() : '',
        pdfHtml,
        pdfFileName: fileName,
      }),
    });

    if (typeof showToast === 'function') showToast('✅ Протокол надіслано у Telegram');

    const doctorName = sessionStorage.getItem('nexum_name') ||
      (typeof doctorCode === 'function' ? doctorCode() : '');
    await _saveConclusionRecord(patId, protocolData, doctorName);

    _reply(source, true);
  }


  /* ══════════════════════════════════════════════════════════════
     4. КАНАЛ: КАБІНЕТ ПАЦІЄНТА → /api/patient/protocol
     ════════════════════════════════════════════════════════════ */

  async function _sendToCabinet(patId, protocolData, delivery, source) {
    const p = (typeof patients !== 'undefined' ? patients : [])
      .find(x => String(x.id) === String(patId));

    if (!p) throw new Error('Пацієнт не знайдений у списку');
    if (!p.patientUserId && !p.phone) {
      throw new Error('Пацієнт не зареєстрований у кабінеті — попросіть зареєструватись');
    }

    const doctorName = sessionStorage.getItem('nexum_name') ||
      (typeof doctorCode === 'function' ? doctorCode() : '');
    const sec = protocolData.sections || {};
    const doc = protocolData.doctor || {};

    const payload = {
      doctorCode:    typeof doctorCode === 'function' ? doctorCode() : '',
      doctorName,
      patientId:     patId,
      patientPhone:  p.phone || '',
      patientUserId: p.patientUserId || null,
      deliveryInfo:  delivery,
      createdAt:     new Date().toISOString(),
      editedAt:      protocolData.editedAt,
      sections:      sec,
      patientInfo:   sec.patientInfo ? protocolData.patientInfo : null,
      lifeHistory:   sec.lifeHistory ? protocolData.lifeHistory : null,
      survey:        sec.survey      ? protocolData.survey      : null,
      notes:         sec.notes       ? protocolData.notes       : null,
      recommendations: sec.doctor   ? (doc.recommendations || '') : '',
      finalDiag:     sec.doctor     ? (doc.finalDiag || '')       : '',
      nextVisit:     sec.doctor     ? (doc.nextVisit || '')        : '',
      pdfHtml:       protocolData.pdfHtml    || '',
      pdfFileName:   protocolData.pdfFileName || '',
      urgency:       protocolData.urgency    || '',
      tests:         protocolData.tests      || '',
    };

    if (typeof showToast === 'function') showToast('Зберігаємо протокол у кабінеті…');

    await apiFetch('/api/patient/protocol', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (typeof showToast === 'function') {
      showToast('✅ Протокол збережено в кабінеті пацієнта');
    }

    _reply(source, true);
  }


  /* ══════════════════════════════════════════════════════════════
     5. ДОПОМІЖНА: Генерація PDF Base64 через html2pdf.js
     ════════════════════════════════════════════════════════════ */

  async function _generatePdfBase64(protocolData) {
    // Завантажуємо html2pdf якщо ще не завантажено
    if (!window.html2pdf) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src =
          'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Не вдалось завантажити html2pdf.js'));
        document.head.appendChild(script);
      });
    }

    // Будуємо HTML протоколу
    const htmlContent = protocolData.pdfHtml || _buildFallbackHtml(protocolData);

    // Рендеримо в прихований контейнер
    const container = document.createElement('div');
container.style.cssText =
  'position:absolute;left:-9999px;top:0;width:794px;background:white;';

// Безпечне вставлення через DOMParser замість innerHTML
const parser = new DOMParser();
const doc = parser.parseFromString(htmlContent, 'text/html');
Array.from(doc.body.childNodes).forEach(node =>
  container.appendChild(document.adoptNode(node))
);
document.body.appendChild(container);
    try {
      const pdfBlob = await html2pdf()
        .from(container.querySelector('.page') || container)
        .set({
          margin:     [10, 10, 10, 10],
          filename:   'protocol.pdf',
          image:      { type: 'jpeg', quality: 0.92 },
          html2canvas:{ scale: 2, useCORS: true, logging: false },
          jsPDF:      { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .outputPdf('blob');

      // Blob → Base64
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(pdfBlob);
      });

    } finally {
      document.body.removeChild(container);
    }
  }


  /* ══════════════════════════════════════════════════════════════
     6. ДОПОМІЖНА: Зберегти запис у таблиці conclusions (журнал)
     ════════════════════════════════════════════════════════════ */

  async function _saveConclusionRecord(patId, protocolData, doctorName) {
    try {
      const p = (typeof patients !== 'undefined' ? patients : [])
        .find(x => String(x.id) === String(patId));

      await apiFetch('/api/patient/protocol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorCode:    typeof doctorCode === 'function' ? doctorCode() : '',
          doctorName,
          patientId:     patId,
          patientPhone:  p?.phone || '',
          patientUserId: p?.patientUserId || null,
          deliveryInfo:  protocolData.deliveryInfo || {},
          createdAt:     new Date().toISOString(),
          editedAt:      protocolData.editedAt,
          sections:      protocolData.sections || {},
          patientInfo:   protocolData.patientInfo   || null,
          lifeHistory:   protocolData.lifeHistory   || null,
          survey:        protocolData.survey         || null,
          notes:         protocolData.notes          || '',
          recommendations: (protocolData.doctor?.recommendations) || '',
          finalDiag:     (protocolData.doctor?.finalDiag)          || '',
          nextVisit:     (protocolData.doctor?.nextVisit)           || '',
          pdfHtml:       protocolData.pdfHtml    || '',
          pdfFileName:   protocolData.pdfFileName || '',
          urgency:       protocolData.urgency    || '',
          tests:         protocolData.tests      || '',
        }),
      });
    } catch (e) {
      // Не переривати відправку якщо журнал не записався
      console.warn('[ProtocolSender] Журнал не збережено:', e.message);
    }
  }


  /* ══════════════════════════════════════════════════════════════
     7. ДОПОМІЖНА: Fallback HTML якщо pdfHtml не передано
     ════════════════════════════════════════════════════════════ */

  function _buildFallbackHtml(data) {
    function h(s) {
      return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    const pi  = data.patientInfo  || {};
    const lh  = data.lifeHistory  || {};
    const doc = data.doctor       || {};
    const sv  = data.survey       || {};
    const date = new Date(data.editedAt || Date.now())
      .toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' });

    const row = (label, val) => val
      ? `<tr><td style="font-weight:700;color:#be185d;width:36%;padding:9px 13px;
           border:1px solid #fce7f3;background:#fff7fb;font-size:10.5px;
           text-transform:uppercase;letter-spacing:.05em">${h(label)}</td>
          <td style="padding:9px 13px;border:1px solid #fce7f3;font-size:13px;
           color:#1a0a12">${h(val)}</td></tr>`
      : '';

    const section = (title, body) => body
      ? `<div style="margin-bottom:22px">
          <div style="font-size:11px;font-weight:800;color:#be185d;
            text-transform:uppercase;letter-spacing:.1em;
            border-bottom:2px solid #fbcfe8;padding-bottom:6px;margin-bottom:10px">
            ${h(title)}</div>${body}</div>`
      : '';

    const note = text => text
      ? `<div style="background:#fff7fb;border:1px solid #fbcfe8;border-left:3px solid #ec4899;
            border-radius:8px;padding:13px 16px;white-space:pre-line;font-size:13px;
            color:#1a0a12;line-height:1.65">${h(text)}</div>`
      : '';

    const survRows = (sv.answers || [])
      .filter(qa => qa.answer && qa.answer !== '—')
      .map(qa =>
        `<tr>
          <td style="padding:9px 13px;border:1px solid #fce7f3;background:#fff7fb;
            font-weight:700;font-size:11px;color:#b06080;width:45%;vertical-align:top">
            ${h(qa.question)}</td>
          <td style="padding:9px 13px;border:1px solid #fce7f3;font-size:13px;
            color:#1a0a12;vertical-align:top">${h(qa.answer)}</td>
        </tr>`
      ).join('');

    return `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"/>
<title>Протокол Nexum</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#fff7fb;color:#1a0a12;font-family:Arial,Helvetica,sans-serif;line-height:1.55}
  .page{max-width:820px;margin:28px auto;background:white;border:1px solid #fbcfe8;
    border-radius:18px;overflow:hidden;box-shadow:0 20px 60px rgba(190,24,93,.1)}
  .hdr{padding:30px 38px;background:linear-gradient(135deg,#fce7f3,#ffffff,#fff0f6);
    border-bottom:1.5px solid #fbcfe8;display:flex;justify-content:space-between;gap:20px;
    align-items:flex-start}
  .brand{font-size:11px;font-weight:800;color:#be185d;letter-spacing:.14em;
    text-transform:uppercase;margin-bottom:10px}
  h1{margin:0;font-size:26px;font-weight:700;color:#1a0a12}
  .meta{margin-top:8px;color:#6b2d47;font-size:13px}
  .print-btn{border:0;background:#ec4899;color:white;border-radius:10px;
    padding:11px 18px;font-weight:700;cursor:pointer;font-size:13px;
    flex-shrink:0;height:max-content;white-space:nowrap}
  .content{padding:32px 38px 42px}
  table{width:100%;border-collapse:collapse;border:1px solid #fbcfe8;
    border-radius:12px;overflow:hidden;margin-bottom:4px}
  .sigs{display:flex;justify-content:space-between;gap:24px;margin-top:36px;
    padding-top:14px;border-top:1.5px solid #fbcfe8;color:#6b2d47;font-size:12px}
  .sig-line{display:inline-block;min-width:160px;border-bottom:1px solid #9ca3af}
  @media print{body{background:#fff}.page{margin:0;box-shadow:none;border:0;border-radius:0}
    .print-btn{display:none}@page{size:A4;margin:12mm}}
</style>
</head><body>
<main class="page">
  <header class="hdr">
    <div>
      <div class="brand">Nexum — Медична система</div>
      <h1>Протокол консультації</h1>
      <div class="meta">Лікар: <strong>${h(doc.doctorName || '')}</strong> · ${h(date)}</div>
    </div>
    <button class="print-btn" onclick="window.print()">Зберегти як PDF</button>
  </header>
  <div class="content">
    ${section('Пацієнт',
      `<table>${row('ПІБ', pi.fullName)}${row('Дата народження', pi.birthDate)}
       ${row('Вік', pi.age)}${row('Телефон', pi.phone)}${row('Діагноз', pi.diag)}</table>`
    )}
    ${section('Анамнез',
      `<table>${row('Алергії', lh.allergy)}${row('Хронічні', lh.chronic)}
       ${row('Препарати', lh.meds)}${row('Операції', lh.operations)}</table>`
    )}
    ${survRows ? section(sv.name || 'Опитування',
      `<table>${survRows}</table>`
    ) : ''}
    ${section('Нотатки лікаря',  note(data.notes))}
    ${section('Рекомендації',     note(doc.recommendations))}
    ${section('Наступний прийом', note(doc.nextVisit))}
    ${section('Терміновість',     note(data.urgency))}
    ${section('Призначені обстеження', note(data.tests))}
    <div class="sigs">
      <div>Підпис лікаря:&nbsp;<span class="sig-line">&nbsp;</span></div>
      <div>Дата:&nbsp;<span class="sig-line" style="min-width:80px">&nbsp;</span></div>
    </div>
  </div>
</main>
</body></html>`;
  }


  /* ══════════════════════════════════════════════════════════════
     8. ДОПОМІЖНА: Відповідь назад до pop-up редактора
     ════════════════════════════════════════════════════════════ */

  function _reply(source, ok, error) {
    if (source && !source.closed) {
      source.postMessage(
        { type: 'NEXUM_PROTOCOL_REPLY', ok, error: error || null },
        '*'
      );
    }
  }


  /* ══════════════════════════════════════════════════════════════
     9. ПУБЛІЧНЕ API — для виклику з dashboard.html вручну
     ════════════════════════════════════════════════════════════ */

  window.NexumProtocolSender = {
    /**
     * Відправити протокол вручну (без pop-up редактора).
     * @param {string} patId       — ID пацієнта
     * @param {object} protocolData — дані протоколу
     */
    send: async function (patId, protocolData) {
      const p = (typeof patients !== 'undefined' ? patients : [])
        .find(x => String(x.id) === String(patId));

      const delivery = protocolData.deliveryInfo ||
        (p && typeof getPatientDeliveryInfo === 'function'
          ? getPatientDeliveryInfo(p)
          : {});

      const channel = (delivery.channel || '').toLowerCase();

      if (channel === 'email' && delivery.email) {
        await _sendByEmail(patId, protocolData, delivery, null);
      } else if (channel === 'telegram') {
        await _sendByTelegram(patId, protocolData, delivery, null);
      } else {
        await _sendToCabinet(patId, protocolData, delivery, null);
      }
    },

    /**
     * Перевірити який канал налаштовано для пацієнта.
     * @param {string} patId — ID пацієнта
     * @returns {{ channel: string, target: string, label: string }}
     */
    getDeliveryChannel: function (patId) {
      const p = (typeof patients !== 'undefined' ? patients : [])
        .find(x => String(x.id) === String(patId));
      if (!p) return { channel: '', target: '', label: 'Не визначено' };

      const delivery = typeof getPatientDeliveryInfo === 'function'
        ? getPatientDeliveryInfo(p)
        : {};

      const labels = {
        cabinet:  'Кабінет пацієнта',
        email:    'Електронна пошта',
        telegram: 'Telegram',
      };

      const targets = {
        cabinet:  delivery.phone  || p.phone    || '—',
        email:    delivery.email  || '—',
        telegram: delivery.telegramId || p.telegram || '—',
      };

      return {
        channel: delivery.channel || '',
        target:  targets[delivery.channel] || '—',
        label:   labels[delivery.channel]  || 'Не обрано',
      };
    },
  };

  console.log('[ProtocolSender] ✅ Модуль завантажено');

})();
