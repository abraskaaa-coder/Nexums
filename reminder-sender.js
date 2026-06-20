(function () {
  'use strict';

  const REMINDER_TYPES = {
    1: { icon: '📅', label: 'Нагадування про прийом',  color: '#3B82F6' },
    2: { icon: '💊', label: 'Прийняти ліки',           color: '#EC4899' },
    3: { icon: '📋', label: 'Заповнити опитування',     color: '#8B5CF6' },
    4: { icon: '✉️',  label: 'Повідомлення від лікаря', color: '#06D6A0' },
  };

  window.NexumReminderSender = {

    send: async function (patId, reminderData) {
      const p = _findPatient(patId);
      if (!p) throw new Error('Пацієнт не знайдений');

      const delivery = _getDelivery(p);
      let channel = (delivery.channel || '').toLowerCase();

      // ── FALLBACK: якщо канал не заданий але є telegram ──────
      if (!channel) {
        const tgId = delivery.telegramId || delivery.telegram || p.telegram || '';
        if (tgId) channel = 'telegram';
      }

      console.log('[ReminderSender] channel:', channel, '| patId:', patId);
      console.log('[ReminderSender] telegram:', p.telegram, '| delivery:', delivery);

      // ── Відправляємо за каналом (один виклик API) ────────────
      if (channel === 'email' && delivery.email) {
        await _sendByEmail(p, reminderData, delivery);
      } else if (channel === 'telegram') {
        await _sendByTelegram(p, reminderData, delivery);
      } else {
        // Кабінет або канал невідомий — надсилаємо через сервер
        // Сервер сам знайде telegramId по patientId якщо є
        await _sendToCabinet(p, reminderData, delivery);
      }
    },

    getDeliveryInfo: function (patId) {
      const p = _findPatient(patId);
      if (!p) return { channel: '', target: '—', label: 'Не визначено' };
      const d = _getDelivery(p);
      return {
        channel: d.channel || '',
        target:  _deliveryTarget(d, p),
        label:   _channelLabel(d.channel),
      };
    },
  };

  /* ════════════════════════════════════════════════════
     1. EMAIL
     ════════════════════════════════════════════════════ */
  async function _sendByEmail(p, data, delivery) {
    const toEmail  = delivery.email;
    const typeInfo = REMINDER_TYPES[data.type] || REMINDER_TYPES[4];
    const subject  = typeInfo.icon + ' ' + typeInfo.label + ' — Nexum';
    const htmlBody = _buildReminderEmailHtml(p, data, typeInfo);

    if (typeof showToast === 'function') showToast('Надсилаємо на ' + toEmail + '…');

    const result = await apiFetch('/api/patient/send-reminder-email', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toEmail,
        patientName:  _patName(p),
        doctorName:   data.doctorName || _getDoctorName(),
        subject,
        htmlBody,
        reminderType: typeInfo.label,
        message:      data.message || '',
      }),
    });

    if (typeof showToast === 'function') showToast('✅ Нагадування надіслано на ' + toEmail);
    return result;
  }

  /* ════════════════════════════════════════════════════
     2. TELEGRAM
     ════════════════════════════════════════════════════ */
  async function _sendByTelegram(p, data, delivery) {
    if (typeof showToast === 'function') showToast('Надсилаємо у Telegram…');

    // Шукаємо telegramId з усіх можливих місць
    const telegramId =
      (delivery && (delivery.telegramId || delivery.telegram)) ||
      p.telegram ||
      p.dynamicAnswers?.__deliveryInfo?.telegramId ||
      '';

    console.log('[ReminderSender] telegramId for send:', telegramId);

    const result = await apiFetch('/api/doctor/reminders', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doctorCode:   data.doctorCode || _getDoctorCode(),
        doctorName:   data.doctorName || _getDoctorName(),
        patientId:    p.id,
        patientPhone: p.phone || '',
        telegramId:   telegramId,          // ← передаємо явно
        title:        (REMINDER_TYPES[data.type] || REMINDER_TYPES[4]).label,
        message:      data.message  || '',
        question:     data.question || '',
        priority:     data.type === 1 ? 'high' : 'normal',
        scheduledAt:  data.scheduledAt || null,
      }),
    });

    if (result && result.tgSent) {
      if (typeof showToast === 'function') showToast('✅ Нагадування надіслано у Telegram');
    } else if (result && result.tgError) {
      if (typeof showToast === 'function') showToast('⚠ Збережено, але TG помилка: ' + result.tgError, 'error');
    } else {
      if (typeof showToast === 'function') showToast('✅ Нагадування збережено');
    }

    return result;
  }

  /* ════════════════════════════════════════════════════
     3. КАБІНЕТ / НЕВІДОМИЙ КАНАЛ
     ════════════════════════════════════════════════════ */
  async function _sendToCabinet(p, data, delivery) {
    if (typeof showToast === 'function') showToast('Надсилаємо нагадування…');

    // Навіть для "cabinet" передаємо telegramId — сервер сам вирішить
    const telegramId =
      (delivery && (delivery.telegramId || delivery.telegram)) ||
      p.telegram ||
      p.dynamicAnswers?.__deliveryInfo?.telegramId ||
      '';

    const result = await apiFetch('/api/doctor/reminders', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doctorCode:   data.doctorCode || _getDoctorCode(),
        doctorName:   data.doctorName || _getDoctorName(),
        patientId:    p.id,
        patientPhone: p.phone || '',
        telegramId:   telegramId,          // ← передаємо якщо є
        title:        (REMINDER_TYPES[data.type] || REMINDER_TYPES[4]).label,
        message:      data.message  || '',
        question:     data.question || '',
        priority:     data.type === 1 ? 'high' : 'normal',
        scheduledAt:  data.scheduledAt || null,
      }),
    });

    if (result && result.tgSent) {
      if (typeof showToast === 'function') showToast('✅ Нагадування надіслано у Telegram');
    } else {
      if (typeof showToast === 'function') showToast('✅ Нагадування збережено');
    }

    return result;
  }

  /* ════════════════════════════════════════════════════
     HTML ЛИСТА ДЛЯ EMAIL
     ════════════════════════════════════════════════════ */
  function _buildReminderEmailHtml(p, data, typeInfo) {
    const h = s => String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    const patName    = h(_patName(p));
    const doctorName = h(data.doctorName || _getDoctorName());
    const message    = h(data.message || '');
    const question   = h(data.question || '');
    const color      = typeInfo.color || '#EC4899';
    const icon       = typeInfo.icon  || '🔔';
    const typeLabel  = h(typeInfo.label || 'Нагадування');

    let scheduledStr = '';
    if (data.scheduledAt) {
      try {
        scheduledStr = new Date(data.scheduledAt).toLocaleString('uk-UA', {
          day:'2-digit', month:'long', year:'numeric',
          hour:'2-digit', minute:'2-digit',
        });
      } catch (_) {}
    }

    const dateBlock = (data.type === 1 && scheduledStr) ? `
      <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;
        padding:14px 18px;margin:16px 0;display:flex;align-items:center;gap:12px;">
        <span style="font-size:22px;">📅</span>
        <div>
          <div style="font-size:10px;font-weight:700;color:#3B82F6;
            text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px;">
            Дата та час прийому</div>
          <div style="font-size:15px;font-weight:600;color:#1E3A5F;">${h(scheduledStr)}</div>
        </div>
      </div>` : '';

    const questionBlock = question ? `
      <div style="background:#F0FDF4;border:1px solid #A7F3D0;border-radius:10px;
        padding:14px 18px;margin:16px 0;">
        <div style="font-size:10px;font-weight:700;color:#059669;
          text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">
          Питання від лікаря</div>
        <div style="font-size:13px;color:#1a0a12;margin-bottom:12px;">${question}</div>
        <div style="font-size:10px;color:#9CA3AF;margin-top:8px;">
          Відповідь отримає ваш лікар автоматично</div>
      </div>` : '';

    return `<!DOCTYPE html>
<html lang="uk"><head><meta charset="UTF-8"/>
<title>${typeLabel} — Nexum</title></head>
<body style="margin:0;padding:0;background:#FFF5F7;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"
  style="background:#FFF5F7;min-height:100vh;">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="580" cellpadding="0" cellspacing="0" border="0"
      style="max-width:580px;width:100%;background:#fff;
        border:1.5px solid #FCE7F3;border-radius:18px;overflow:hidden;">
      <tr>
        <td style="background:linear-gradient(135deg,#FFF0F6,#FDF2F8);
          border-bottom:1.5px solid #FCE7F3;padding:28px 36px;">
          <div style="font-size:11px;font-weight:800;color:#EC4899;
            letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px;">
            Nexum · Медична система</div>
          <div style="font-size:26px;margin-bottom:6px;">${icon}</div>
          <div style="font-size:20px;font-weight:700;color:#1F2937;">${typeLabel}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 36px;">
          <p style="font-size:15px;color:#1F2937;margin:0 0 16px;font-weight:600;">
            Вітаємо, ${patName}!</p>
          <div style="background:#FFF8FC;border:1px solid #FCE7F3;
            border-left:3px solid ${color};border-radius:0 10px 10px 0;
            padding:14px 18px;margin-bottom:16px;font-size:14px;
            color:#374151;line-height:1.7;white-space:pre-line;">${message}</div>
          ${dateBlock}${questionBlock}
          <div style="margin-top:24px;padding-top:16px;border-top:1px solid #FCE7F3;
            font-size:13px;color:#6B7280;">
            З повагою,<br/>
            <strong style="color:#1F2937;">${doctorName}</strong><br/>
            <span style="font-size:11px;color:#9CA3AF;">Nexum · Медичний кабінет</span>
          </div>
        </td>
      </tr>
      <tr>
        <td style="background:#FFF5F7;border-top:1px solid #FCE7F3;
          padding:14px 36px;text-align:center;">
          <p style="margin:0;font-size:10px;color:#D1D5DB;">
            Це автоматичне повідомлення від системи Nexum.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
  }

  /* ════════════════════════════════════════════════════
     УТИЛІТИ
     ════════════════════════════════════════════════════ */
  function _findPatient(patId) {
    if (typeof patients === 'undefined') return null;
    return patients.find(x => String(x.id) === String(patId)) || null;
  }

  function _getDelivery(p) {
    if (typeof getPatientDeliveryInfo === 'function') return getPatientDeliveryInfo(p);
    return p.deliveryInfo || p.dynamicAnswers?.__deliveryInfo || {};
  }

  function _patName(p) {
    return [p.lastName, p.firstName].filter(Boolean).join(' ') || 'Пацієнт';
  }

  function _getDoctorName() {
    return sessionStorage.getItem('nexum_name') || _getDoctorCode();
  }

  function _getDoctorCode() {
    return typeof doctorCode === 'function' ? doctorCode() : '';
  }

  function _channelLabel(ch) {
    return { cabinet:'Кабінет пацієнта', email:'Email', telegram:'Telegram' }[ch] || 'Не обрано';
  }

  function _deliveryTarget(d, p) {
    if (d.channel === 'email')    return d.email || '—';
    if (d.channel === 'telegram') return d.telegramId || d.telegram || p.telegram || '—';
    if (d.channel === 'cabinet')  return d.phone || p.phone || '—';
    return '—';
  }

  console.log('[ReminderSender] ✅ Модуль завантажено');

})();
