const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID   = process.env.CHAT_ID;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ── Supabase config ────────────────────────────────────────────
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('[Supabase] Project_URL або Service_Role_Key не задано в env!');
}

// ── Supabase REST helper ───────────────────────────────────────
function supabaseFetch(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(SUPABASE_URL);
const data = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };
if (data) headers['Content-Length'] = data.length;

    const req = https.request({
      hostname: urlObj.hostname,
      path: '/rest/v1/' + endpoint,
      method,
      headers,
    }, res => {
    const chunks = [];
res.on('data', c => chunks.push(c));
res.on('end', () => {
  try {
    const text = Buffer.concat(chunks).toString('utf8');
    resolve({ status: res.statusCode, body: JSON.parse(text) });
  } catch { resolve({ status: res.statusCode, body: '' }); }
});
    });
    req.on('error', reject);
if (data) req.write(data);
    req.end();
  });
}

// ── Rate limiting для /api/login ───────────────────────────────
const loginAttempts = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const attempts = (loginAttempts.get(ip) || []).filter(t => now - t < 15 * 60 * 1000);
  if (attempts.length >= 10) return false;
  attempts.push(now);
  loginAttempts.set(ip, attempts);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of loginAttempts.entries()) {
    const fresh = times.filter(t => now - t < 15 * 60 * 1000);
    if (!fresh.length) loginAttempts.delete(ip);
    else loginAttempts.set(ip, fresh);
  }
}, 30 * 60 * 1000);
async function writeLog(doctorCode, doctorName, action, details = '') {
  try {
    await supabaseFetch('POST', 'login_logs', {
      doctor_code: (doctorCode || '').toUpperCase(),
      doctor_name: doctorName || '',
      ip:          '',
      status:      action,
      action:      action,
      details:     details,
      created_at:  new Date().toISOString(),
    });
  } catch (e) {
    console.error('[writeLog]', e.message);
  }
}
// ── Auth ───────────────────────────────────────────────────────
async function getDoctor(code) {
  const c = (code || '').trim().toUpperCase();
  try {
    const r = await supabaseFetch('GET',
      `registered_doctors?code=eq.${encodeURIComponent(c)}&limit=1`);
    if (r.status !== 200 || !Array.isArray(r.body) || !r.body.length) return null;
    return r.body[0];
  } catch(e) { console.error('[getDoctor]', e.message); return null; }
}

// ── Patients ───────────────────────────────────────────────────
async function getPatientsByDoctorCode(doctorCode) {
  const dc = doctorCode.toUpperCase();
  const r = await supabaseFetch('GET',
   `patients?doctor_code=eq.${encodeURIComponent(dc)}&order=created_at.desc`);
  if (r.status !== 200) throw new Error('Failed to load patients: ' + r.status);

  return (Array.isArray(r.body) ? r.body : []).map(p => {
    let lastName  = p.last_name  || p.lastName  || '';
    let firstName = p.first_name || p.firstName || '';
    if (!lastName && !firstName && p.name) {
      const parts = p.name.trim().split(/\s+/);
      lastName  = parts[0] || '';
      firstName = parts[1] || '';
    }

    const chatSessions = Array.isArray(p.chat_sessions)
      ? p.chat_sessions.map(s => ({
          ...s,
          chatHistory: s.chatHistory || s.messages || [],
        }))
      : [];

    return {
      ...p,
      id:             'sb_' + p.id,
      lastName,
      firstName,
      middleName:     p.middle_name  || p.middleName  || '',
      birthDate:      p.birth_date   || p.birthDate   || '',
      diag:           p.diag        || p.diagnosis     || '',
      notes:          p.notes       || '',
      phone:          p.phone       || '',
      telegram:       p.telegram    || '',
      gender:         p.gender      || '',
      allergy:        Array.isArray(p.allergy)   ? p.allergy   : [],
      chronic:        Array.isArray(p.chronic)   ? p.chronic   : [],
      meds:           Array.isArray(p.meds)      ? p.meds      : [],
      photos:         Array.isArray(p.photos)    ? p.photos    : [],
      dynamicAnswers: p.dynamic_answers || p.dynamicAnswers || {},
deliveryInfo:
  p.dynamic_answers?.__deliveryInfo ||
  [...chatSessions].reverse().find(s => s.deliveryInfo?.channel)?.deliveryInfo ||
  {},
surveyKey:      p.survey_key     || p.surveyKey      || '',
      operations:     p.operations     || '',
      family:         p.family         || '',
      smoking:        p.smoking        || '',
      activity:       p.activity       || '',
      surveyResults:  Array.isArray(p.survey_results) ? p.survey_results : [],
      chatSessions,
      createdAt:      p.createdAt || p.created_at || '',
    };
  });
}

async function savePatientRecord(doctorCode, patientData) {
  const dc = doctorCode.toUpperCase();
  const now = new Date().toISOString();

  const rawId = patientData.id
    ? String(patientData.id).replace('sb_', '')
    : null;
  const isValidUuid = rawId && (/^[0-9a-f-]{36}$/i.test(rawId) || /^\d+$/.test(rawId));
const deliveryInfo =
  patientData.deliveryInfo ||
  patientData.dynamicAnswers?.__deliveryInfo ||
  {};

const dynamicAnswers = {
  ...(patientData.dynamicAnswers || {}),
  __deliveryInfo: deliveryInfo,
};
  const record = {
    doctor_code:     dc,
    last_name:       patientData.lastName    || '',
    first_name:      patientData.firstName   || '',
    middle_name:     patientData.middleName  || '',
    gender:          patientData.gender      || '',
    birth_date:      patientData.birthDate   || null,
    phone:           patientData.phone       || '',
    telegram:        patientData.telegram    || '',
    diag:            patientData.diag        || '',
    notes:           patientData.notes       || '',
    operations:      patientData.operations  || '',
    family:          patientData.family      || '',
    smoking:         patientData.smoking     || '',
    activity:        patientData.activity    || '',
    allergy:         Array.isArray(patientData.allergy)  ? patientData.allergy  : [],
    chronic:         Array.isArray(patientData.chronic)  ? patientData.chronic  : [],
    meds:            Array.isArray(patientData.meds)     ? patientData.meds     : [],
    dynamic_answers: dynamicAnswers,
    survey_key:      patientData.surveyKey   || '',
    updated_at:      now,
  };

  if (isValidUuid) {
    const r = await supabaseFetch('PATCH', `patients?id=eq.${rawId}`, record);
    if (r.status !== 200 && r.status !== 204) {
      throw new Error('Update failed: ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 200));
    }
    return 'sb_' + rawId;
  } else {
    record.created_at = now;
    const r = await supabaseFetch('POST', 'patients', record);
    if (r.status !== 201 && r.status !== 200) {
      throw new Error('Create failed: ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 200));
    }
    const created = Array.isArray(r.body) ? r.body[0] : r.body;
    return 'sb_' + created?.id;
  }
}

async function deletePatientRecord(patientId) {
  const rawId = String(patientId).replace('sb_', '');
  if (!rawId || (!/^[0-9a-f-]{36}$/i.test(rawId) && !/^\d+$/.test(rawId))) throw new Error('Invalid patient id: ' + rawId);
  const r = await supabaseFetch('DELETE', `patients?id=eq.${rawId}`);
  if (r.status !== 200 && r.status !== 204) throw new Error('Delete failed: ' + r.status);
}

// ── Surveys ────────────────────────────────────────────────────
async function getSurveys(doctorCode) {
  const dc = doctorCode.toUpperCase();
  const r = await supabaseFetch('GET',
    `surveys?doctor_code=eq.${encodeURIComponent(dc)}&limit=1`);
  if (r.status !== 200 || !Array.isArray(r.body) || !r.body.length)
    return { surveys: {}, fsId: null, deletedKeys: [] };

  const row = r.body[0];
  const data = row.surveys_data || {};

  // ── Видаляємо \uFFFD з текстів питань (вже пошкоджені дані) ──
  Object.values(data).forEach(s => {
    if (Array.isArray(s.questions)) {
      s.questions.forEach(q => {
        if (q.text) q.text = q.text.replace(/\uFFFD/g, '');
      });
    }
  });

  return { surveys: data, fsId: row.id, deletedKeys: row.deleted_keys || [] };
}
async function saveSurveys(doctorCode, surveys, fsId) {
  const dc = doctorCode.toUpperCase();
  const now = new Date().toISOString();

  // Мінімальне очищення — тільки справді небезпечні символи
  function cleanTexts(obj) {
    if (typeof obj === 'string') {
      return obj
        .replace(/\uFFFD/g, '')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .replace(/[\uD800-\uDFFF]/g, '');
    }
    if (Array.isArray(obj)) return obj.map(cleanTexts);
    if (obj && typeof obj === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(obj)) out[k] = cleanTexts(v);
      return out;
    }
    return obj;
  }

  const record = {
    doctor_code: dc,
    surveys_data: cleanTexts(surveys),
    updated_at: now,
  };

  const check = await supabaseFetch('GET',
    `surveys?doctor_code=eq.${encodeURIComponent(dc)}&limit=1`);
  if (check.status === 200 && Array.isArray(check.body) && check.body.length) {
    const existId = check.body[0].id;
    await supabaseFetch('PATCH', `surveys?id=eq.${existId}`, record);
    return existId;
  }

  const r = await supabaseFetch('POST', 'surveys', record);
  if (r.status !== 201 && r.status !== 200)
    throw new Error('Surveys create failed: ' + r.status);
  const created = Array.isArray(r.body) ? r.body[0] : r.body;
  return created?.id;
}

// ── Links ──────────────────────────────────────────────────────
async function getLinkById(linkId) {
  const r = await supabaseFetch('GET', `links?id=eq.${encodeURIComponent(linkId)}&limit=1`);
  if (r.status !== 200 || !Array.isArray(r.body) || !r.body.length) return null;
  const row = r.body[0];
  return {
    id: row.id,
    doctorCode: row.doctor_code,
    surveyKey: row.survey_key,
    surveyName: row.survey_name,
    surveyQCount: row.survey_q_count,
    patientName: row.patient_name,
    note: row.note,
    url: row.url,
    status: row.status,
    createdAt: row.created_at,
   filledAt:  row.filled_at,
    fillCount: row.fill_count || 0,
  };
}

async function getLinksByDoctor(doctorCode) {
  const dc = doctorCode.toUpperCase();
  const r = await supabaseFetch('GET',
    `links?doctor_code=eq.${encodeURIComponent(dc)}&order=created_at.desc`);
  if (r.status !== 200) return [];
  return (Array.isArray(r.body) ? r.body : []).map(row => ({
    id: row.id,
    doctorCode: row.doctor_code,
    surveyKey: row.survey_key,
    surveyName: row.survey_name,
    surveyQCount: row.survey_q_count,
    patientName: row.patient_name,
    note: row.note,
    url: row.url,
    status: row.status,
    createdAt: row.created_at,
   filledAt:  row.filled_at,
    fillCount: row.fill_count || 0,
  }));
}

async function saveLink(link) {
  const record = {
    id: link.id,
    doctor_code: (link.doctorCode || '').toUpperCase(),
    survey_key: link.surveyKey || '',
    survey_name: link.surveyName || '',
    survey_q_count: link.surveyQCount || 0,
    patient_name: link.patientName || '',
    note: link.note || '',
    url: link.url || '',
    status: link.status || 'pending',
    created_at: link.createdAt || new Date().toISOString(),
    filled_at: link.filledAt || null,
  };
  const r = await supabaseFetch('POST', 'links', record);
  if (r.status !== 201 && r.status !== 200) throw new Error('Save link failed: ' + r.status);
  return link.id;
}

async function deleteLinkById(linkId) {
  const r = await supabaseFetch('DELETE', `links?id=eq.${encodeURIComponent(linkId)}`);
  if (r.status !== 200 && r.status !== 204) throw new Error('Delete link failed: ' + r.status);
}

async function markLinkFilled(linkId) {
  // Використовуємо прямий HTTP запит до RPC з правильним URL
  return new Promise((resolve, reject) => {
    const urlObj = new URL(SUPABASE_URL);
    const body = JSON.stringify({ link_id: linkId });
    const req = https.request({
      hostname: urlObj.hostname,
      path: '/rest/v1/rpc/increment_link_fill',
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
    res.on('end', () => {
  if (res.statusCode !== 200 && res.statusCode !== 204) {
    console.error('[markLinkFilled] RPC failed:', res.statusCode, d);

    supabaseFetch('GET', `links?id=eq.${encodeURIComponent(linkId)}&select=fill_count&limit=1`)
      .then(cur => {
        const count = (cur.status === 200 && Array.isArray(cur.body) && cur.body.length)
          ? (cur.body[0].fill_count || 0) : 0;
        return supabaseFetch('PATCH', `links?id=eq.${encodeURIComponent(linkId)}`, {
          status: 'filled',
          filled_at: new Date().toISOString(),
          fill_count: count + 1,
        });
      })
      .then(() => resolve())
      .catch(reject);

    return;
  }

  resolve();
});
    });
    req.on('error', e => {
      console.error('[markLinkFilled] request error:', e.message);
      reject(e);
    });
    req.write(body);
    req.end();
  });
}
// ── Groq AI ────────────────────────────────────────────────────
async function callGroqAPI(payload) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set in environment');
  const groqBody = {
    model: payload.model || 'llama-3.3-70b-versatile',
    max_tokens: payload.max_tokens || 1200,
    temperature: 0.3,
    messages: [
      { role: 'system', content: payload.system || '' },
      ...(payload.messages || []),
    ],
  };
  const body = JSON.stringify(groqBody);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.groq.com', path: '/openai/v1/chat/completions', method: 'POST', timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          if (parsed.choices?.[0]?.message?.content) {
            resolve({ status: res.statusCode, body: { content: [{ type: 'text', text: parsed.choices[0].message.content }] } });
          } else { resolve({ status: res.statusCode, body: parsed }); }
        } catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Groq API timeout (30s)')); });
    req.on('error', e => reject(e));
    req.write(body); req.end();
  });
}
async function callGeminiAPI(payload) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
  const model = payload.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const messages = payload.messages || [];
  const systemPrompt = payload.system || '';
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  const body = JSON.stringify({
    system_instruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: payload.max_tokens || 1200,
    }
  });
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) {
            resolve({ status: res.statusCode, body: { content: [{ type: 'text', text }] } });
          } else {
            resolve({ status: res.statusCode, body: parsed });
          }
        } catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Gemini timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
async function callAI(payload) {
  if (process.env.GEMINI_API_KEY) {
    try { return await callGeminiAPI(payload); }
    catch(e) { console.warn('[AI] Gemini failed, fallback to Groq:', e.message); }
  }
  return callGroqAPI(payload);
}
// ── SendGrid email ─────────────────────────────────────────────
async function sendProtocolByEmail(toEmail, htmlContent, fileName, doctorName, patientInfo) {
  const SENDGRID_KEY  = process.env.SENDGRID_API_KEY;
  const SENDGRID_FROM = process.env.SENDGRID_FROM || 'noreply@nexum.app';

  if (!SENDGRID_KEY) {
    console.warn('[email] SENDGRID_API_KEY not set — skip');
    return;
  }

  const patientName = patientInfo?.fullName || 'Пацієнт';
  const date = new Date().toLocaleDateString('uk-UA',
    { day: '2-digit', month: 'long', year: 'numeric' });

  const emailBody = {
    personalizations: [{
      to: [{ email: toEmail }],
      subject: `📋 Протокол консультації — ${patientName} — ${date}`,
    }],
    from: {
      email: SENDGRID_FROM,
      name:  doctorName || 'Nexum',
    },
    content: [
      {
        type: 'text/plain',
        value: `Протокол консультації для ${patientName} від ${date}.\nДодаток: ${fileName || 'protocol.html'}`,
      },
      {
        type: 'text/html',
        value: `<p>Протокол консультації для <b>${patientName}</b> від ${date}.</p>
                <p>Файл протоколу додається нижче.</p>`,
      },
    ],
    attachments: [
      {
        content:     Buffer.from(htmlContent, 'utf8').toString('base64'),
        filename:    fileName || 'protocol.html',
        type:        'text/html',
        disposition: 'attachment',
      },
    ],
  };

  const body = JSON.stringify(emailBody);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.sendgrid.com',
      path:     '/v3/mail/send',
      method:   'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SENDGRID_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        // SendGrid повертає 202 при успіху (без body)
        if (res.statusCode === 202) {
          console.log('[email] Sent to:', toEmail);
          resolve();
        } else {
          console.error('[email] SendGrid error:', res.statusCode, d);
          reject(new Error('SendGrid: ' + res.statusCode + ' ' + d));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
// ── Telegram bot ───────────────────────────────────────────────
function tgCall(method, data) {
  return new Promise((res, rej) => {
    if (!BOT_TOKEN) { rej(new Error('No BOT_TOKEN')); return; }
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/${method}`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try{res(JSON.parse(d));}catch{res({ok:false});} }); });
    req.on('error', rej); req.write(body); req.end();
  });
}
const send = (chat_id, text) => tgCall('sendMessage', { chat_id, text, parse_mode: 'HTML' });
const isAdmin = id => String(id) === String(CHAT_ID);

async function handleUpdate(u) {
  const msg = u.message;
  const cb  = u.callback_query;

  // ── Обробка натискання кнопок Так/Ні ──
  if (cb) {
    const cid  = String(cb.message.chat.id);
    const data = cb.data || '';

    if (data.startsWith('rem_yes_') || data.startsWith('rem_no_')) {
      const remId = data.replace('rem_yes_', '').replace('rem_no_', '');
      const isYes = data.startsWith('rem_yes_');
      const reply = isYes ? 'Так ✅' : 'Ні ❌';

      try {
        // Зберігаємо відповідь в БД
        await supabaseFetch('PATCH',
          `patient_reminders?id=eq.${encodeURIComponent(remId)}`, {
            patient_reply: reply,
            replied_at:    new Date().toISOString(),
          });

        // Підтверджуємо кнопку (прибираємо "годинник")
        await tgCall('answerCallbackQuery', {
          callback_query_id: cb.id,
          text: `Відповідь "${reply}" збережена ✓`,
        });

        // Прибираємо кнопки з повідомлення
        await tgCall('editMessageReplyMarkup', {
          chat_id:    cid,
          message_id: cb.message.message_id,
          reply_markup: { inline_keyboard: [] },
        });

        // Надсилаємо підтвердження пацієнту
        await send(cid,
          `✅ Дякуємо! Ваша відповідь <b>"${reply}"</b> збережена.\nЛікар побачить її у картці пацієнта.`
        );

      } catch(e) {
        console.error('[callback rem]', e.message);
        await tgCall('answerCallbackQuery', {
          callback_query_id: cb.id,
          text: 'Помилка збереження. Спробуйте ще раз.',
        }).catch(() => {});
      }
    }
    return;
  }

  // ── Звичайні повідомлення ──
  if (!msg?.text) return;
  const cid = String(msg.chat.id);
  const txt = msg.text.trim();

  if (txt === '/start') {
    await send(cid,
      `👋 Вітаємо в <b>Nexum</b>!\n\n` +
      `Ваш Telegram ID: <code>${cid}</code>\n\n` +
      `📋 Скопіюйте цей номер і передайте лікарю — він введе його у вашій картці для отримання нагадувань.`
    );
    return;
  }

  if (!isAdmin(cid)) {
    if (txt.startsWith('/')) await send(cid, '⚠️ Невідома команда.');
    return;
  }
  if (txt.startsWith('/')) await send(cid, '✅ Nexum бот активний.');
}
let lastId = 0;
async function poll() {
  if (!BOT_TOKEN) return;
  try {
 const r = await tgCall('getUpdates', { offset: lastId + 1, timeout: 25, allowed_updates: ['message', 'callback_query'] });
    if (r.ok && r.result?.length) {
      for (const u of r.result) { lastId = u.update_id; await handleUpdate(u).catch(e => console.error('bot:', e.message)); }
    }
  } catch(e) { console.error('poll:', e.message); }
  setTimeout(poll, 1000);
}

// ── Static file serving ────────────────────────────────────────
const mime = {
  '.html': 'text/html;charset=utf-8', '.css': 'text/css;charset=utf-8',
  '.js': 'application/javascript;charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.json': 'application/json',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};
const cachePolicy = {
  '.html': 'no-cache', '.css': 'public, max-age=604800', '.js': 'public, max-age=604800',
  '.png': 'public, max-age=31536000', '.jpg': 'public, max-age=31536000',
  '.webp': 'public, max-age=31536000', '.svg': 'public, max-age=31536000',
  '.ico': 'public, max-age=31536000', '.woff': 'public, max-age=31536000', '.woff2': 'public, max-age=31536000',
};

function serveStatic(fp, res, req) {
  fs.stat(fp, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h2 style="padding:40px;color:#fff;background:#05070e">404 <a href="/" style="color:#3b82f6">Home</a></h2>');
      return;
    }
    const ext = path.extname(fp).toLowerCase();
    const etag = `"${stat.mtimeMs.toString(16)}-${stat.size.toString(16)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { 'Cache-Control': cachePolicy[ext] || 'no-cache', 'ETag': etag });
      res.end(); return;
    }
    fs.readFile(fp, (err, data) => {
      if (err) { res.writeHead(500); res.end(); return; }
      let output = data;
      const headers = {
  'Content-Type': mime[ext] || 'text/plain',
  'Cache-Control': cachePolicy[ext] || 'no-cache',
  'ETag': etag,
};
if (ext === '.html') {
  headers['Content-Security-Policy'] =
    "default-src 'self'; " +
    "font-src https://fonts.gstatic.com https://fonts.googleapis.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
    "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://www.clarity.ms; " +
    "img-src 'self' data: blob: https:; " +
    "connect-src 'self' https://generativelanguage.googleapis.com https://api.groq.com; " +
    "frame-ancestors 'none'";
}
res.writeHead(200, headers);
      res.end(output);
    });
  });
}

function jsonRes(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch(e) { reject(e); }
    });
  });
}
async function getDoctorProfile(doctorCode) {
  const dc = doctorCode.toUpperCase();
  const r = await supabaseFetch('GET',
    `doctor_profiles?doctor_code=eq.${encodeURIComponent(dc)}&limit=1`);
  if (r.status !== 200 || !Array.isArray(r.body) || !r.body.length) return null;
  return r.body[0];
}

async function saveDoctorProfile(doctorCode, data) {
  const dc = doctorCode.toUpperCase();
  const record = {
    doctor_code:  dc,
    last_name:    data.lastName    || '',
    first_name:   data.firstName   || '',
    specialty:    data.specialtyCustom || data.specialty || '',
    city:         data.city        || '',
    clinic:       data.clinic      || '',
    photo_base64: data.photoBase64 || '',
    updated_at:   new Date().toISOString(),
  };
  const check = await supabaseFetch('GET',
    `doctor_profiles?doctor_code=eq.${encodeURIComponent(dc)}&limit=1`);
  if (check.status === 200 && Array.isArray(check.body) && check.body.length) {
    await supabaseFetch('PATCH',
      `doctor_profiles?doctor_code=eq.${encodeURIComponent(dc)}`, record);
  } else {
    await supabaseFetch('POST', 'doctor_profiles', record);
  }
  return true;
}
// ── Supabase Storage upload ────────────────────────────────────
function uploadToStorage(filePath, fileBuffer, mimeType) {
  return new Promise((resolve) => {
    const urlObj = new URL(SUPABASE_URL);
    const storagePath = `/storage/v1/object/patient-photos/${filePath}`;

    const req = https.request({
      hostname: urlObj.hostname,
      path: storagePath,
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': mimeType,
        'Content-Length': fileBuffer.length,
        'x-upsert': 'true',
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve({ ok: true });
        } else {
          resolve({ ok: false, error: `${res.statusCode}: ${d}` });
        }
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.write(fileBuffer);
    req.end();
  });
}
// ── HTTP Server ────────────────────────────────────────────────
http.createServer(async (req, res) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
res.setHeader('X-Content-Type-Options', 'nosniff');
res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const pn = req.url.split('?')[0].split('#')[0];
  const qs = Object.fromEntries(new URL('http://x' + req.url).searchParams);

  // ─────────────────────────────────────────────────────────────
  // GET /survey/:token  →  serve survey.html  ← FIXED: moved INSIDE the server handler
  // ─────────────────────────────────────────────────────────────
  if (req.method === 'GET' && /^\/survey\/[^/]+$/.test(pn)) {
    const fp = path.join(__dirname, 'survey.html');
    serveStatic(fp, res, req);
    return;
  }

  // GET /health
  if (req.method === 'GET' && pn === '/health') {
    jsonRes(res, 200, { status: 'ok', project: 'Nexum', db: 'supabase' });
    return;
  }

  // GET /api/surveys
  if (req.method === 'GET' && pn === '/api/surveys') {
    try {
      if (!qs.doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
      jsonRes(res, 200, await getSurveys(qs.doctorCode));
    } catch(e) { console.error('[GET /api/surveys]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // POST /api/surveys
  if (req.method === 'POST' && pn === '/api/surveys') {
    try {
      const body = await readBody(req);
      const { doctorCode, surveys, fsId } = body;
      if (!doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
      if (!surveys || typeof surveys !== 'object') return jsonRes(res, 400, { error: 'surveys required' });
      const newFsId = await saveSurveys(doctorCode, surveys, fsId || null);
      jsonRes(res, 200, { success: true, fsId: newFsId });
    } catch(e) { console.error('[POST /api/surveys]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // GET /api/dashboard/patients
 if (req.method === 'GET' && pn === '/api/dashboard/patients') {
    try {
      if (!qs.doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
      const patients = await getPatientsByDoctorCode(qs.doctorCode);
      jsonRes(res, 200, patients);
      writeLog(qs.doctorCode, '', 'view_patients', `Відкрив список (${patients.length} пацієнтів)`);
    } catch(e) { console.error('[GET patients]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // POST /api/dashboard/patients
  if (req.method === 'POST' && pn === '/api/dashboard/patients') {
    try {
      const body = await readBody(req);
      const { doctorCode, ...fields } = body;
      if (!doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
      const patient = body.patient || fields;
      const savedId = await savePatientRecord(doctorCode, patient);
jsonRes(res, 200, { success: true, id: savedId });
const patientName = `${patient.lastName || ''} ${patient.firstName || ''}`.trim();
writeLog(doctorCode, '', 'save_patient', `Збережено: ${patientName || savedId}`);
    } catch(e) { console.error('[POST patients]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // PUT /api/dashboard/patients/:id
  if (req.method === 'PUT' && pn.startsWith('/api/dashboard/patients/')) {
    try {
      const patientId = decodeURIComponent(pn.replace('/api/dashboard/patients/', ''));
      const body = await readBody(req);
      const { doctorCode, ...patientData } = body;
      if (!doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
      const id = await savePatientRecord(doctorCode, { id: patientId, ...patientData });
      jsonRes(res, 200, { success: true, id });
      const patientName = `${patientData.lastName || ''} ${patientData.firstName || ''}`.trim();
      writeLog(doctorCode, '', 'edit_patient', `Редагував: ${patientName || patientId}`);
    } catch(e) { console.error('[PUT patients]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // DELETE /api/dashboard/patients/:id
  if (req.method === 'DELETE' && pn.startsWith('/api/dashboard/patients/')) {
    try {
      const patientId = decodeURIComponent(pn.replace('/api/dashboard/patients/', ''));
     await deletePatientRecord(patientId);
jsonRes(res, 200, { success: true });
writeLog(qs.doctorCode || 'unknown', '', 'delete_patient', `Видалено ID: ${patientId}`);
    } catch(e) { console.error('[DELETE patients]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // GET /api/links
  if (req.method === 'GET' && pn === '/api/links') {
    try {
      if (!qs.doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
      jsonRes(res, 200, await getLinksByDoctor(qs.doctorCode));
    } catch(e) { console.error('[GET /api/links]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // POST /api/links
  if (req.method === 'POST' && pn === '/api/links') {
    try {
      const link = await readBody(req);
      if (!link.id || !link.doctorCode) return jsonRes(res, 400, { error: 'id and doctorCode required' });
      await saveLink(link);
      jsonRes(res, 200, { ok: true });
    } catch(e) { console.error('[POST /api/links]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // DELETE /api/links/:id
  if (req.method === 'DELETE' && pn.startsWith('/api/links/')) {
    try {
      const linkId = decodeURIComponent(pn.replace('/api/links/', ''));
      await deleteLinkById(linkId);
      jsonRes(res, 200, { ok: true });
    } catch(e) { console.error('[DELETE /api/links]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // GET /api/survey/:token  (JSON metadata — питання для пацієнта)
  if (req.method === 'GET' && pn.startsWith('/api/survey/') && !pn.endsWith('/submit')) {
    try {
      const token = decodeURIComponent(pn.replace('/api/survey/', ''));
      const link = await getLinkById(token);
      if (!link) return jsonRes(res, 404, { status: 'deleted' });

      // Беремо питання конструктора лікаря
      const { surveys } = await getSurveys(link.doctorCode);
      const survey = surveys[link.surveyKey] || null;

      jsonRes(res, 200, {
        status: 'active',
        surveyKey: link.surveyKey,
        surveyName: link.surveyName,
        patientName: link.patientName || '',
        note: link.note || '',
        questions: survey ? (survey.questions || []) : [],
        doctorCode: link.doctorCode,
      });
    } catch(e) { console.error('[GET /api/survey]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // POST /api/survey/:token/submit
  if (req.method === 'POST' && pn.endsWith('/submit') && pn.startsWith('/api/survey/')) {
    try {
      const token = decodeURIComponent(pn.replace('/api/survey/', '').replace('/submit', ''));
      const payload = await readBody(req);
      const link = await getLinkById(token);
      if (!link) return jsonRes(res, 404, { error: 'Link not found' });

      // Будуємо chatHistory з масиву answers
      const chatHistory = (payload.answers || []).flatMap(a => [
        { role: 'assistant', content: String(a.text || '') },
        { role: 'user', content: String(a.value || '') },
      ]);

     const deliveryInfo = {
  channel: payload.deliveryChannel || payload.meta?.deliveryChannel || '',
  email: payload.deliveryEmail || payload.meta?.deliveryEmail || '',
  phone: payload.deliveryCabinetPhone || payload.meta?.deliveryCabinetPhone || payload.phone || '',
  telegramId: payload.telegramId || '',
};

const session = {
  id: token + '_' + Date.now(),
  linkId: token,
  createdAt: payload.startedAt || new Date().toISOString(),
  completedAt: payload.completedAt || new Date().toISOString(),
  chatHistory,
  photos: payload.photos || [],
  summary: '',
  meta: payload.meta || {},
  deliveryInfo,
};

      // Шукаємо пацієнта за телефоном у цього лікаря
      const dc = link.doctorCode.toUpperCase();
      const phone = payload.phone || '';
      let existingPatient = null;

      if (phone) {
        const r = await supabaseFetch('GET',
          `patients?doctor_code=eq.${encodeURIComponent(dc)}&phone=eq.${encodeURIComponent(phone)}&limit=1`);
        if (r.status === 200 && Array.isArray(r.body) && r.body.length) {
          existingPatient = r.body[0];
        }
      }

     if (existingPatient) {
        const sessions = Array.isArray(existingPatient.chat_sessions)
          ? existingPatient.chat_sessions : [];
        sessions.push(session);

        const currentDynamicAnswers = existingPatient.dynamic_answers || {};

const updateData = {
  chat_sessions: sessions,
  dynamic_answers: {
    ...currentDynamicAnswers,
    __deliveryInfo: deliveryInfo,
  },
  updated_at: new Date().toISOString(),
};

if (deliveryInfo.telegramId && /^\d{5,12}$/.test(String(deliveryInfo.telegramId))) {
  updateData.telegram = String(deliveryInfo.telegramId);
}
        await supabaseFetch('PATCH', `patients?id=eq.${existingPatient.id}`, updateData);
    // ЗНАЙТИ і замінити весь блок else { // Новий пацієнт
} else {
  const now = new Date().toISOString();
  await supabaseFetch('POST', 'patients', {
    doctor_code:     dc,
    telegram:        payload.telegramId || '',
    last_name:       payload.lastName   || '',
    first_name:      payload.firstName  || '',
    phone:           phone,
    survey_key:      link.surveyKey     || '',
    chat_sessions:   [session],
    allergy:         [],
    chronic:         [],
    meds:            [],
    photos:          payload.photos     || [],
    dynamic_answers: {
  __deliveryInfo: deliveryInfo,
},
    created_at:      now,
    updated_at:      now,
  });
}

      // Позначаємо посилання як заповнене
      await markLinkFilled(token);

     // ── Надсилаємо підтвердження пацієнту в Telegram ──
const tgId = deliveryInfo.telegramId;
if (tgId && BOT_TOKEN && /^\d{5,12}$/.test(String(tgId))) {
  tgCall('sendMessage', {
    chat_id: String(tgId),
    text: `✅ <b>Дякуємо за заповнення анкети!</b>\n\nВашу анкету отримано та передано лікарю. Він ознайомиться з відповідями перед прийомом.\n\n📋 Якщо виникнуть питання — лікар зв'яжеться з вами.`,
    parse_mode: 'HTML',
  }).catch(e => console.error('[survey submit] TG send error:', e.message));
}

jsonRes(res, 200, { ok: true });
    } catch(e) { console.error('[POST /api/survey/submit]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }
// POST /api/ai-followup
if (req.method === 'POST' && pn === '/api/ai-followup') {
  try {
    const { question, answer, lang } = await readBody(req);
    if (!question) return jsonRes(res, 400, { error: 'question required' });

    const isUk = (lang || 'uk') === 'uk';

    // ── Блок "тупих" питань — якщо питання вже збирає дані списком,
    //    уточнення не потрібне
    const SKIP_PATTERNS = [
      /алерг/i, /allerg/i,
      /хронічн/i, /chronic/i,
      /операц/i, /operation/i, /surgeri/i,
      /препарат|ліки|таблетки/i, /medication|medicine|pills/i,
      /куріт|палит/i, /smok/i,
      /алкогол/i, /alcohol/i,
      /вагіт/i, /pregnan/i,
      /группа крові|група крові/i, /blood type/i,
      /зріст|вага/i, /height|weight/i,
      /прізвище|ім'я|по батьков/i, /first name|last name/i,
      /дата народж/i, /date of birth|birthday/i,
      /телефон|email|пошта/i, /phone|email/i,
    ];

    const shouldSkip = SKIP_PATTERNS.some(rx => rx.test(question));
    if (shouldSkip) {
      return jsonRes(res, 200, { followUp: '' });
    }

    // ── Додатковий guard через Groq: якщо відповідь не "yes-like" — не питати
    const YES_LIKE = /^(так|да|yes|yep|є|є|маю|мав|була|бул|звісно|звичайно|підтверд)/i;
    if (!YES_LIKE.test((answer || '').trim())) {
      return jsonRes(res, 200, { followUp: '' });
    }

    const result = await callAI({
  model: 'gemini-2.0-flash',
      max_tokens: 120,
      system: isUk
        ? `Ти медичний асистент у чат-боті для збору анамнезу.
Пацієнт відповів ствердно на клінічне питання лікаря.
Твоє завдання: задати ОДНЕ коротке уточнювальне питання лише якщо воно дасть НОВУ клінічну інформацію (наприклад: локалізація, тривалість, характер болю, провокуючі фактори).
Якщо питання лікаря вже є вичерпним (збирає список — алергії, ліки, операції тощо) — поверни порожній рядок.
Питання — природне, розмовне, українською.
Відповідай ТІЛЬКИ текстом питання або порожнім рядком. Без лапок, без пояснень.`
        : `You are a medical assistant in a patient intake chatbot.
The patient answered positively to a clinical question.
Your task: ask ONE short follow-up question ONLY if it would provide NEW clinical detail (location, duration, character of pain, triggers, etc.).
If the doctor's question already collects list-type data (allergies, meds, surgeries, etc.) — return an empty string.
Natural, conversational, in English.
Reply with ONLY the question text or an empty string. No quotes, no explanations.`,
      messages: [
        {
          role: 'user',
          content: isUk
            ? `Питання лікаря: "${question}"\nВідповідь пацієнта: "${answer}"\n\nЯке уточнювальне питання? (або порожній рядок якщо не потрібне)`
            : `Doctor's question: "${question}"\nPatient's answer: "${answer}"\n\nFollow-up question? (or empty string if not needed)`,
        },
      ],
    });

    const raw = result?.body?.content?.[0]?.text?.trim() || '';
    // Якщо модель повернула щось схоже на "порожній рядок" — фільтруємо
    const followUp = /^(порожн|empty|немає|no follow|не потр|-|\.)/i.test(raw) ? '' : raw;

    jsonRes(res, 200, { followUp });
  } catch (e) {
    console.error('[POST /api/ai-followup]', e.message);
    jsonRes(res, 500, { error: e.message });
  }
  return;
}
  // POST /api/correct-typos
if (req.method === 'POST' && pn === '/api/correct-typos') {
  let originalText = '';
  try {
    const body = await readBody(req);
    originalText = body.text || '';

    if (!originalText.trim()) {
      return jsonRes(res, 200, { corrected: originalText });
    }

   const result = await callAI({
  model: 'gemini-2.0-flash',
      max_tokens: 200,
      system: `Ти медичний коректор. Виправляй орфографічні помилки в повідомленнях пацієнтів українською мовою.
Правила:
- Виправляй лише орфографічні помилки, не змінюй зміст
- Якщо помилок немає — поверни текст без змін
- Відповідай ТІЛЬКИ виправленим текстом, без пояснень, без лапок
- Приклад: "жввіт болит" → "живіт болить"
- Приклад: "добрк,нрродженням" → "добре, народженням"
- Приклад: "так" → "так"`,
      messages: [{ role: 'user', content: originalText }]
    });

    const corrected = (result?.body?.content?.[0]?.text || originalText).trim();
    jsonRes(res, 200, { corrected });
  } catch(e) {
    console.error('[POST /api/correct-typos]', e.message);
    jsonRes(res, 200, { corrected: originalText });
  }
  return;
}
  // GET /api/profile
if (req.method === 'GET' && pn === '/api/profile') {
  try {
    if (!qs.doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
    const prof = await getDoctorProfile(qs.doctorCode);
    jsonRes(res, 200, prof || {});
  } catch(e) { jsonRes(res, 500, { error: e.message }); }
  return;
}

// POST /api/profile
if (req.method === 'POST' && pn === '/api/profile') {
  try {
    const body = await readBody(req);
    if (!body.doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
    await saveDoctorProfile(body.doctorCode, body);
    jsonRes(res, 200, { ok: true });
  } catch(e) { jsonRes(res, 500, { error: e.message }); }
  return;
}
  // POST /api/dashboard/remind
  if (req.method === 'POST' && pn === '/api/dashboard/remind') {
    try { await readBody(req); jsonRes(res, 200, { success: true }); }
    catch(e) { jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // POST /api/login
  if (req.method === 'POST' && pn === '/api/patient/register') {
    try {
      const { name, phone, password } = await readBody(req);
      if (!name || !phone || !password)
        return jsonRes(res, 400, { ok: false, error: 'missing_fields' });
      if (password.length < 6)
        return jsonRes(res, 400, { ok: false, error: 'weak_password' });

      const phoneClean = String(phone).replace(/\s/g, '');

      const check = await supabaseFetch('GET',
        `patient_accounts?phone=eq.${encodeURIComponent(phoneClean)}&limit=1`);
      if (check.status === 200 && Array.isArray(check.body) && check.body.length > 0)
        return jsonRes(res, 409, { ok: false, error: 'phone_exists' });

      const hash = crypto.createHash('sha256').update(password + 'nexum_salt').digest('hex');

      const r = await supabaseFetch('POST', 'patient_accounts', {
        name:          name.trim(),
        phone:         phoneClean,
        password_hash: hash,
        created_at:    new Date().toISOString(),
      });

      if (r.status !== 201 && r.status !== 200)
        throw new Error('DB insert failed: ' + r.status);

      const created = Array.isArray(r.body) ? r.body[0] : r.body;
      jsonRes(res, 200, { ok: true, patient_id: created?.id, name: created?.name });
    } catch(e) {
      console.error('[POST /api/patient/register]', e.message);
      jsonRes(res, 500, { ok: false, error: 'server_error' });
    }
    return;
  }

  if (req.method === 'POST' && pn === '/api/patient/login') {
    try {
      const { phone, password } = await readBody(req);
      if (!phone || !password)
        return jsonRes(res, 400, { ok: false, error: 'missing_fields' });

      const phoneClean = String(phone).replace(/\s/g, '');
      const hash = crypto.createHash('sha256').update(password + 'nexum_salt').digest('hex');

      const r = await supabaseFetch('GET',
        `patient_accounts?phone=eq.${encodeURIComponent(phoneClean)}&limit=1`);

      if (r.status !== 200 || !Array.isArray(r.body) || !r.body.length)
        return jsonRes(res, 401, { ok: false, error: 'invalid_credentials' });

      const patient = r.body[0];
      if (patient.password_hash !== hash)
        return jsonRes(res, 401, { ok: false, error: 'invalid_credentials' });

      jsonRes(res, 200, {
        ok:         true,
        patient_id: patient.id,
        name:       patient.name  || '',
        phone:      patient.phone || '',
      });
    } catch(e) {
      console.error('[POST /api/patient/login]', e.message);
      jsonRes(res, 500, { ok: false, error: 'server_error' });
    }
    return;
  }

  if (req.method === 'GET' && pn === '/api/patient/surveys') {
    try {
      const { patient_id } = qs;
      if (!patient_id) return jsonRes(res, 400, { ok: false });

      const accR = await supabaseFetch('GET',
        `patient_accounts?id=eq.${encodeURIComponent(patient_id)}&limit=1`);
      if (accR.status !== 200 || !Array.isArray(accR.body) || !accR.body.length)
        return jsonRes(res, 404, { ok: false, surveys: [] });

      const phone = accR.body[0].phone;

      const ptsR = await supabaseFetch('GET',
        `patients?phone=eq.${encodeURIComponent(phone)}&select=chat_sessions,doctor_code`);
      if (ptsR.status !== 200) return jsonRes(res, 200, { ok: true, surveys: [] });

      const surveys = [];
      for (const pt of (Array.isArray(ptsR.body) ? ptsR.body : [])) {
        const sessions = Array.isArray(pt.chat_sessions) ? pt.chat_sessions : [];
        for (const s of sessions) {
          const docR = await supabaseFetch('GET',
            `registered_doctors?code=eq.${encodeURIComponent(pt.doctor_code)}&select=name&limit=1`);
          const doctorName = (docR.status === 200 && Array.isArray(docR.body) && docR.body.length)
            ? docR.body[0].name : pt.doctor_code;

          const chatHistory = Array.isArray(s.chatHistory) ? s.chatHistory : [];
          const answers = {};
          for (let i = 0; i < chatHistory.length - 1; i++) {
            if (chatHistory[i].role === 'assistant' && chatHistory[i + 1].role === 'user') {
              const q = (chatHistory[i].content || '').trim();
              const a = (chatHistory[i + 1].content || '').trim();
              if (q && a) answers[q] = a;
            }
          }

          surveys.push({
            id:          s.id || '',
            survey_name: s.meta?.surveyName || 'Опитування',
            doctor_name: doctorName,
            answers,
            created_at:  s.createdAt || s.completedAt || '',
          });
        }
      }

      surveys.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      jsonRes(res, 200, { ok: true, surveys });
    } catch(e) {
      console.error('[GET /api/patient/surveys]', e.message);
      jsonRes(res, 500, { ok: false, surveys: [] });
    }
    return;
  }

  if (req.method === 'GET' && pn === '/api/patient/conclusions') {
    try {
      const { patient_id } = qs;
      if (!patient_id) return jsonRes(res, 400, { ok: false });

      // Знаходимо phone пацієнта
      const accR = await supabaseFetch('GET',
        `patient_accounts?id=eq.${encodeURIComponent(patient_id)}&limit=1`);
      if (accR.status !== 200 || !Array.isArray(accR.body) || !accR.body.length)
        return jsonRes(res, 200, { ok: true, conclusions: [] });

      const patientAuth = accR.body[0];

      // Шукаємо по patient_user_id АБО phone
      const r = await supabaseFetch('GET',
        `conclusions?or=(patient_user_id.eq.${patientAuth.id},patient_phone.eq.${encodeURIComponent(patientAuth.phone)})&order=created_at.desc`);

      if (r.status !== 200) return jsonRes(res, 200, { ok: true, conclusions: [] });

      const conclusions = (Array.isArray(r.body) ? r.body : []).map(c => ({
  id:           c.id,
  doctor_name:  c.doctor_name,
  text:         c.text,
  protocol_json: (() => {
    if (!c.protocol_json) return null;
    if (typeof c.protocol_json === 'object') return c.protocol_json;
    try { return JSON.parse(c.protocol_json); }
    catch { return null; }
  })(),
  type:         c.type || 'conclusion',
  created_at:   c.created_at,
}));


      jsonRes(res, 200, { ok: true, conclusions });
    } catch(e) {
      console.error('[GET /api/patient/conclusions]', e.message);
      jsonRes(res, 500, { ok: false, conclusions: [] });
    }
    return;
  }
if (req.method === 'POST' && pn === '/api/patient/protocol') {
    try {
     const {
  doctorCode, doctorName, patientId, patientPhone, patientUserId,
  createdAt, editedAt, sections, patientInfo, lifeHistory, survey,
  notes, recommendations, nextVisit, finalDiag,
  pdfHtml, pdfFileName,
  urgency,
  tests,
  deliveryInfo,
} = await readBody(req);

      if (!doctorCode || !patientId)
        return jsonRes(res, 400, { error: 'Missing required fields' });

      const phoneNorm = (p) => (p ? String(p).replace(/\s/g, '') : '');
      const patientPhoneClean = phoneNorm(patientPhone);

      let patientRow = null;

      if (patientUserId) {
        const r = await supabaseFetch('GET',
         `patient_accounts?id=eq.${encodeURIComponent(patientUserId)}&limit=1`);
        if (r.status === 200 && Array.isArray(r.body) && r.body.length)
          patientRow = r.body[0];
      }

      if (!patientRow && patientPhoneClean) {
        const r = await supabaseFetch('GET',
          `patient_accounts?phone=eq.${encodeURIComponent(patientPhoneClean)}&limit=1`);
        if (r.status === 200 && Array.isArray(r.body) && r.body.length)
          patientRow = r.body[0];
      }

      const lhLine = (val) => {
        if (val == null || val === '') return '';
        if (Array.isArray(val)) return val.filter(Boolean).join(', ');
        return String(val);
      };

      const safeCreated = createdAt || new Date().toISOString();

      let text = `📋 Протокол від лікаря: ${doctorName}\n`;
      text += `📅 Дата: ${new Date(safeCreated).toLocaleDateString('uk-UA', {
        day: '2-digit', month: 'long', year: 'numeric'
      })}\n\n`;

      if (patientInfo) {
        text += `👤 ПАЦІЄНТ\n`;
        if (patientInfo.fullName)  text += `ПІБ: ${patientInfo.fullName}\n`;
        if (patientInfo.birthDate) text += `Дата народження: ${patientInfo.birthDate}\n`;
        if (patientInfo.phone)     text += `Телефон: ${patientInfo.phone}\n`;
        if (patientInfo.diag)      text += `Діагноз: ${patientInfo.diag}\n`;
        text += '\n';
      }
      if (lifeHistory) {
        text += `📋 АНАМНЕЗ\n`;
        const al = lhLine(lifeHistory.allergy);
        const cr = lhLine(lifeHistory.chronic);
        const md = lhLine(lifeHistory.meds);
        if (al)  text += `Алергії: ${al}\n`;
        if (cr)  text += `Хронічні: ${cr}\n`;
        if (md)  text += `Препарати: ${md}\n`;
        if (lifeHistory.operations)       text += `Операції: ${lifeHistory.operations}\n`;
        text += '\n';
      }
      if (finalDiag)       text += `🩺 УТОЧНЕНИЙ ДІАГНОЗ\n${finalDiag}\n\n`;
      if (survey?.answers?.length) {
        text += `💬 ОПИТУВАННЯ: ${survey.name || ''}\n`;
        survey.answers.forEach(qa => { text += `${qa.question}: ${qa.answer}\n`; });
        text += '\n';
      }
      if (notes)           text += `📝 НОТАТКИ ЛІКАРЯ\n${notes}\n\n`;
      if (recommendations) text += `🩺 РЕКОМЕНДАЦІЇ\n${recommendations}\n\n`;
      if (nextVisit)       text += `📅 НАСТУПНИЙ ПРИЙОМ: ${nextVisit}\n`;

      const r = await supabaseFetch('POST', 'conclusions', {
        doctor_code:     doctorCode,
        doctor_name:     doctorName,
        patient_id:      patientId,
        patient_user_id: patientRow?.id || null,
        patient_phone:   patientPhoneClean || patientRow?.phone || null,
        text:            text.trim(),
       protocol_json: {
  sections, patientInfo, lifeHistory, survey, notes,
  deliveryInfo: deliveryInfo || {},
  recommendations: recommendations || '',
  nextVisit: nextVisit || '',
  finalDiag: finalDiag || '',
  doctorName,
  createdAt: safeCreated,
  editedAt: editedAt || null,
  pdfHtml: pdfHtml || '',
  pdfFileName: pdfFileName || '',
  urgency: urgency || '',      // ← ДОДАТИ
  tests: tests || '',          // ← ДОДАТИ
},
        created_at:      safeCreated,
        type:            'protocol',
      });

      if (r.status !== 201 && r.status !== 200)
        throw new Error('DB insert failed: ' + r.status);

      const saved = Array.isArray(r.body) ? r.body[0] : r.body;
     writeLog(doctorCode, doctorName, 'save_protocol', `Протокол для: ${patientInfo?.fullName || patientId}`);

      jsonRes(res, 200, { ok: true, id: saved?.id });
    } catch(e) {
      console.error('[POST /api/patient/protocol]', e.message);
      jsonRes(res, 500, { error: e.message });
    }
    return;
  }
  if (req.method === 'POST' && pn === '/api/patient/conclusion') {
    try {
      const { patient_id, doctor_code, doctor_name, text } = await readBody(req);
      if (!patient_id || !text)
        return jsonRes(res, 400, { ok: false, error: 'patient_id and text required' });

      const r = await supabaseFetch('POST', 'patient_conclusions', {
        patient_id,
        doctor_code: (doctor_code || '').toUpperCase(),
        doctor_name: doctor_name || '',
        text,
        created_at: new Date().toISOString(),
      });

      if (r.status !== 201 && r.status !== 200)
        throw new Error('DB insert failed: ' + r.status);

      const created = Array.isArray(r.body) ? r.body[0] : r.body;
      jsonRes(res, 200, { ok: true, id: created?.id });
    } catch(e) {
      console.error('[POST /api/patient/conclusion]', e.message);
      jsonRes(res, 500, { ok: false });
    }
  return;
  }

  // GET /api/admin/patient-accounts
  if (req.method === 'GET' && pn === '/api/admin/patient-accounts') {
const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) { res.writeHead(500); res.end('Server misconfigured'); return; }    if (qs.secret !== ADMIN_SECRET)
      return jsonRes(res, 403, { error: 'Forbidden' });
    try {
      const r = await supabaseFetch('GET',
        'patient_accounts?order=created_at.desc&select=id,name,phone,created_at');
      jsonRes(res, 200, Array.isArray(r.body) ? r.body : []);
    } catch(e) {
      console.error('[GET /api/admin/patient-accounts]', e.message);
      jsonRes(res, 500, { error: e.message });
    }
    return;
  }

  // DELETE /api/admin/patient-accounts/:id
  if (req.method === 'DELETE' && pn.startsWith('/api/admin/patient-accounts/')) {
const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) { res.writeHead(500); res.end('Server misconfigured'); return; }    if (qs.secret !== ADMIN_SECRET)
      return jsonRes(res, 403, { error: 'Forbidden' });
    try {
      const id = decodeURIComponent(pn.replace('/api/admin/patient-accounts/', ''));
      const r = await supabaseFetch('DELETE', `patient_accounts?id=eq.${id}`);
      if (r.status !== 200 && r.status !== 204)
        throw new Error('Delete failed: ' + r.status);
      jsonRes(res, 200, { ok: true });
    } catch(e) {
      console.error('[DELETE /api/admin/patient-accounts]', e.message);
      jsonRes(res, 500, { error: e.message });
    }
    return;
  }

  // GET /api/admin/login-logs
  if (req.method === 'GET' && pn === '/api/admin/login-logs') {
const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) { res.writeHead(500); res.end('Server misconfigured'); return; }    if (qs.secret !== ADMIN_SECRET)
      return jsonRes(res, 403, { error: 'Forbidden' });
    try {
      const limit = Math.min(parseInt(qs.limit || '500', 10), 2000);
      const r = await supabaseFetch('GET',
        `login_logs?order=created_at.desc&limit=${limit}`);
      if (r.status !== 200) throw new Error('DB error: ' + r.status);
      jsonRes(res, 200, Array.isArray(r.body) ? r.body : []);
    } catch(e) {
      console.error('[GET /api/admin/login-logs]', e.message);
      jsonRes(res, 500, { error: e.message });
    }
    return;
  }
// POST /api/moderator/login
if (req.method === 'POST' && pn === '/api/moderator/login') {
  try {
    const { code, password } = await readBody(req);
    const c = (code || '').trim().toUpperCase();

    if (!c) return jsonRes(res, 400, { ok: false, error: 'missing_code' });

    const r = await supabaseFetch('GET',
      `moderators?code=eq.${encodeURIComponent(c)}&limit=1`);

    if (r.status !== 200 || !Array.isArray(r.body) || !r.body.length)
      return jsonRes(res, 401, { ok: false });

    const mod = r.body[0];

if (!crypto.timingSafeEqual(
  Buffer.from(mod.password || ''),
  Buffer.from((password || '').trim())
))
  return jsonRes(res, 401, { ok: false });

    return jsonRes(res, 200, {
      ok:    true,
      code:  mod.code,
      name:  mod.name,
      level: mod.level,
secret: process.env.ADMIN_SECRET || '',
    });
  } catch(e) {
    console.error('[POST /api/moderator/login]', e.message);
    return jsonRes(res, 500, { ok: false });
  }
}
// GET /api/moderators  — список (тільки superadmin)
if (req.method === 'GET' && pn === '/api/moderators') {
const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) { res.writeHead(500); res.end('Server misconfigured'); return; }  if (qs.secret !== ADMIN_SECRET)
    return jsonRes(res, 403, { error: 'Forbidden' });
  try {
    const r = await supabaseFetch('GET',
      'moderators?order=created_at.asc&select=id,code,name,level,created_at');
    jsonRes(res, 200, Array.isArray(r.body) ? r.body : []);
  } catch(e) {
    jsonRes(res, 500, { error: e.message });
  }
  return;
}

// POST /api/moderators  — створити
if (req.method === 'POST' && pn === '/api/moderators') {
const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) { res.writeHead(500); res.end('Server misconfigured'); return; }  try {
    const body = await readBody(req);
    if (body.secret !== ADMIN_SECRET)
      return jsonRes(res, 403, { error: 'Forbidden' });

    const { code, name, password, level } = body;
    if (!code || !name || !password)
      return jsonRes(res, 400, { error: 'code, name, password required' });

    const c = code.trim().toUpperCase();

    // Перевірка унікальності
    const check = await supabaseFetch('GET',
      `moderators?code=eq.${encodeURIComponent(c)}&limit=1`);
    if (check.status === 200 && Array.isArray(check.body) && check.body.length)
      return jsonRes(res, 409, { error: 'code_exists' });

    const r = await supabaseFetch('POST', 'moderators', {
      code:       c,
      name:       name.trim(),
      password:   password.trim(),
      level:      level || 'viewer',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (r.status !== 201 && r.status !== 200)
      throw new Error('DB insert failed: ' + r.status);

    const created = Array.isArray(r.body) ? r.body[0] : r.body;
    jsonRes(res, 200, { ok: true, id: created?.id });
  } catch(e) {
    console.error('[POST /api/moderators]', e.message);
    jsonRes(res, 500, { error: e.message });
  }
  return;
}

// DELETE /api/moderators/:id
if (req.method === 'DELETE' && pn.startsWith('/api/moderators/')) {
const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) { res.writeHead(500); res.end('Server misconfigured'); return; }  if (qs.secret !== ADMIN_SECRET)
    return jsonRes(res, 403, { error: 'Forbidden' });
  try {
    const modId = decodeURIComponent(pn.replace('/api/moderators/', ''));
    const r = await supabaseFetch('DELETE',
      `moderators?id=eq.${modId}`);
    if (r.status !== 200 && r.status !== 204)
      throw new Error('Delete failed: ' + r.status);
    jsonRes(res, 200, { ok: true });
  } catch(e) {
    jsonRes(res, 500, { error: e.message });
  }
  return;
}
if (req.method === 'POST' && pn === '/api/login') {
    try {
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
               || req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(ip)) {
        return jsonRes(res, 429, { ok: false, error: 'Забагато спроб. Спробуйте через 15 хвилин.' });
      }
      const { code, password } = await readBody(req);
      const doc = await getDoctor(code || '');
if (doc && crypto.timingSafeEqual(
  Buffer.from(doc.password || ''),
  Buffer.from(password || '')
)) {
  writeLog(doc.code, doc.name || '', 'login', 'Успішний вхід');
        jsonRes(res, 200, {
          ok: true,
          name:      doc.name      || '',
          specialty: doc.specialty || '',
          clinic:    doc.hospital  || doc.clinic || '',
          code:      doc.code,
        });
      } else {
        writeLog(code || '', '', 'login_failed', 'Невірний код або пароль');
        jsonRes(res, 401, { ok: false });
      }
    } catch(e) { jsonRes(res, 400, { error: 'bad json' }); }
    return;
  }
  // POST /api/patient/reminder-reply
if (req.method === 'POST' && pn === '/api/patient/reminder-reply') {
  try {
    const { reminder_id, reply } = await readBody(req);
    if (!reminder_id || !reply) return jsonRes(res, 400, { error: 'missing fields' });
    const r = await supabaseFetch('PATCH',
      `patient_reminders?id=eq.${encodeURIComponent(reminder_id)}`, {
        patient_reply: reply,
        replied_at: new Date().toISOString(),
      });
    if (r.status !== 200 && r.status !== 204)
      throw new Error('Update failed: ' + r.status);
    jsonRes(res, 200, { ok: true });
  } catch(e) {
    console.error('[POST /api/patient/reminder-reply]', e.message);
    jsonRes(res, 500, { error: e.message });
  }
  return;
}
// POST /api/patient/send-telegram-pdf
  // GET /api/patient/reminders
if (req.method === 'GET' && pn === '/api/patient/reminders') {
  try {
    const { patient_id } = qs;
    if (!patient_id) return jsonRes(res, 400, { ok: false });

    // Знаходимо phone пацієнта
    const accR = await supabaseFetch('GET',
      `patient_accounts?id=eq.${encodeURIComponent(patient_id)}&limit=1`);
    if (accR.status !== 200 || !Array.isArray(accR.body) || !accR.body.length)
      return jsonRes(res, 200, { reminders: [] });

    const phone = accR.body[0].phone;

    // Шукаємо нагадування по patient_id або phone
    const r = await supabaseFetch('GET',
      `patient_reminders?or=(patient_user_id.eq.${patient_id},patient_phone.eq.${encodeURIComponent(phone)})&order=created_at.desc`);

    if (r.status !== 200) return jsonRes(res, 200, { reminders: [] });

    jsonRes(res, 200, {
      reminders: Array.isArray(r.body) ? r.body : []
    });
  } catch(e) {
    console.error('[GET /api/patient/reminders]', e.message);
    jsonRes(res, 500, { reminders: [] });
  }
  return;
}

// POST /api/doctor/reminders  — лікар надсилає нагадування
if (req.method === 'POST' && pn === '/api/doctor/reminders') {
  try {
    const {
      doctorCode: dc, doctorName, patientId, patientPhone,
      title, message, question, priority, scheduledAt
    } = await readBody(req);

    if (!dc || !message) return jsonRes(res, 400, { error: 'doctorCode and message required' });

    let patientUserId = null;
    let telegramId    = null;
    const phoneClean  = (patientPhone || '').replace(/\s/g, '');

    // Шукаємо telegram в таблиці patients по patientId
telegramId = null;
if (telegramId && telegramId.startsWith('@')) telegramId = null;

// Якщо немає — шукаємо в базі
if (!telegramId && patientId) {
  const rawId = String(patientId).replace('sb_', '');
  const patR = await supabaseFetch('GET',
  `patients?id=eq.${encodeURIComponent(rawId)}&select=telegram,telegram_id,dynamic_answers&limit=1`);
if (patR.status === 200 && Array.isArray(patR.body) && patR.body.length) {
  const row = patR.body[0];
  telegramId = row.telegram_id  // ← числовий ID з окремої колонки
    || row.dynamic_answers?.__deliveryInfo?.telegramId
    || (row.telegram && /^\d+$/.test(String(row.telegram)) ? row.telegram : null);
    if (telegramId && telegramId.startsWith('@')) telegramId = null;
  }
}
console.log('[reminders] telegramId:', telegramId);

    // Якщо не знайшли — шукаємо по phone
    if (!telegramId && phoneClean) {
      const lookup = await supabaseFetch('GET',
        `patients?phone=eq.${encodeURIComponent(phoneClean)}&select=telegram,dynamic_answers&limit=1`);
      if (lookup.status === 200 && Array.isArray(lookup.body) && lookup.body.length) {
        const row = lookup.body[0];
        telegramId = row.telegram
          || row.dynamic_answers?.__deliveryInfo?.telegramId
          || null;
      }
    }

    // Резолвимо patient_user_id
    if (phoneClean) {
      const lookup = await supabaseFetch('GET',
        `patient_accounts?phone=eq.${encodeURIComponent(phoneClean)}&select=id&limit=1`);
      if (lookup.status === 200 && Array.isArray(lookup.body) && lookup.body.length)
        patientUserId = lookup.body[0].id;
    }

    // Зберігаємо нагадування в БД
    const r = await supabaseFetch('POST', 'patient_reminders', {
      doctor_code:     (dc || '').toUpperCase(),
      doctor_name:     doctorName || '',
      patient_id:      patientId  || null,
      patient_user_id: patientUserId,
      patient_phone:   phoneClean || null,
      title:           title    || 'Нагадування',
      message:         message,
      question:        question || '',
      priority:        priority || 'normal',
      scheduled_at:    scheduledAt || null,
      created_at:      new Date().toISOString(),
    });

    if (r.status !== 201 && r.status !== 200)
      throw new Error('DB insert failed: ' + r.status);

    const saved = Array.isArray(r.body) ? r.body[0] : r.body;

    // Надсилаємо в Telegram
    let tgSent  = false;
    let tgError = null;

    if (telegramId && BOT_TOKEN) {
      try {
        let tgText = `🔔 <b>Нагадування від лікаря</b>\n`;
        tgText += `👨‍⚕️ ${doctorName || 'Ваш лікар'}\n\n`;
        tgText += `${message}`;

        if (scheduledAt) {
          const dt = new Date(scheduledAt);
          const dateStr = dt.toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' });
          const timeStr = dt.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
          tgText += `\n\n🕐 Час прийому: ${dateStr} о ${timeStr}`;
        }

        if (question && question.trim()) {
          tgText += `\n\n❓ <b>${question}</b>`;
        }

        // Якщо є питання — надсилаємо з кнопками Так/Ні
        if (question && question.trim() && saved?.id) {
          await tgCall('sendMessage', {
            chat_id:    telegramId,
            text:       tgText,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                { text: '✅ Так', callback_data: `rem_yes_${saved.id}` },
                { text: '❌ Ні',  callback_data: `rem_no_${saved.id}`  },
              ]]
            }
          });
        } else {
          await send(telegramId, tgText);
        }

        tgSent = true;
        console.log('[reminders] TG sent to:', telegramId);
      } catch(tgErr) {
        tgError = tgErr.message;
        console.error('[reminders] TG error:', tgErr.message);
      }
    } else if (!telegramId) {
      tgError = 'Telegram ID не збережено для цього пацієнта';
    } else if (!BOT_TOKEN) {
      tgError = 'BOT_TOKEN не налаштовано на сервері';
    }

    writeLog(dc, doctorName || '', 'send_reminder',
      `Нагадування для: ${patientPhone || patientId}. TG: ${tgSent ? 'ok' : tgError}`);

    jsonRes(res, 200, { ok: true, id: saved?.id, tgSent, tgError: tgError || null });
  } catch(e) {
    console.error('[POST /api/doctor/reminders]', e.message);
    jsonRes(res, 500, { error: e.message });
  }
  return;
}
  if (req.method === 'GET' && pn === '/api/doctor/reminder-replies') {
  try {
    const { doctorCode: dc, patientId } = qs;
    if (!dc) return jsonRes(res, 400, { error: 'doctorCode required' });
 
    const dcUpper = dc.toUpperCase();
    let endpoint = `patient_reminders?doctor_code=eq.${encodeURIComponent(dcUpper)}&order=created_at.desc&limit=200`;
 
    if (patientId) {
      const rawId = String(patientId).replace('sb_', '');
      endpoint += `&patient_id=eq.${encodeURIComponent('sb_' + rawId)}`;
      // Supabase зберігає з префіксом sb_ або без — пробуємо обидва варіанти
    }
 
    const r = await supabaseFetch('GET', endpoint);
    if (r.status !== 200) throw new Error('DB error: ' + r.status);
 
    const rows = Array.isArray(r.body) ? r.body : [];
 
    // Якщо patientId передано — ще раз фільтруємо на стороні сервера
    // (бо patient_id може зберігатись по-різному)
    const rawPatId = patientId ? String(patientId).replace('sb_', '') : null;
    const filtered = rawPatId
      ? rows.filter(r =>
          String(r.patient_id || '').replace('sb_', '') === rawPatId
        )
      : rows;
 
    jsonRes(res, 200, filtered.map(r => ({
      id:            r.id,
      doctorCode:    r.doctor_code,
      doctorName:    r.doctor_name,
      patientId:     r.patient_id,
      patientPhone:  r.patient_phone,
      title:         r.title,
      message:       r.message,
      question:      r.question || '',
      patientReply:  r.patient_reply || null,   // "Так ✅" або "Ні ❌"
      repliedAt:     r.replied_at    || null,
      scheduledAt:   r.scheduled_at  || null,
      createdAt:     r.created_at,
      priority:      r.priority || 'normal',
    })));
  } catch(e) {
    console.error('[GET /api/doctor/reminder-replies]', e.message);
    jsonRes(res, 500, { error: e.message });
  }
  return;
}
  // GET /api/patient/assignments
if (req.method === 'GET' && pn === '/api/patient/assignments') {
  try {
    const { patient_id } = qs;
    if (!patient_id) return jsonRes(res, 400, { ok: false });
    const r = await supabaseFetch('GET',
      `survey_assignments?patient_id=eq.${encodeURIComponent(patient_id)}&order=created_at.desc`);
    if (r.status !== 200) return jsonRes(res, 200, { assignments: [] });
    jsonRes(res, 200, { assignments: Array.isArray(r.body) ? r.body : [] });
  } catch(e) {
    console.error('[GET /api/patient/assignments]', e.message);
    jsonRes(res, 500, { assignments: [] });
  }
  return;
}

// POST /api/admin/assignments
if (req.method === 'POST' && pn === '/api/admin/assignments') {
  try {
    const body = await readBody(req);
    const { patient_id, patient_phone, doctor_name, title,
        link1_label, link1_url,
        link2_label, link2_url,
        link3_label, link3_url } = body;

    // Шукаємо patient_id за телефоном якщо переданий phone
    let resolvedPatientId = patient_id || null;
    if (!resolvedPatientId && patient_phone) {
      const phoneClean = String(patient_phone).replace(/\s/g, '');
      const lookup = await supabaseFetch('GET',
        `patient_accounts?phone=eq.${encodeURIComponent(phoneClean)}&select=id&limit=1`);
      if (lookup.status === 200 && Array.isArray(lookup.body) && lookup.body.length) {
        resolvedPatientId = lookup.body[0].id;
      }
    }
    if (!resolvedPatientId) return jsonRes(res, 404, { ok: false, error: 'Пацієнта з таким телефоном не знайдено' });
    if (!link1_url) return jsonRes(res, 400, { ok: false, error: 'link1_url required' });

    const r = await supabaseFetch('POST', 'survey_assignments', {
      patient_id: resolvedPatientId,
      doctor_name: doctor_name || '',
      title: title || 'Призначені опитування',
      link1_label: link1_label || '', link1_url: link1_url || '',
      link2_label: link2_label || '', link2_url: link2_url || '',
      link3_label: link3_label || '', link3_url: link3_url || '',
      created_at: new Date().toISOString(),
    });
    if (r.status !== 201 && r.status !== 200)
      throw new Error('DB insert failed: ' + r.status);
    jsonRes(res, 200, { ok: true });
  } catch(e) {
    console.error('[POST /api/admin/assignments]', e.message);
    jsonRes(res, 500, { ok: false, error: e.message });
  }
  return;
}
if (req.method === 'POST' && pn === '/api/patient/send-telegram-pdf') {
  try {
    const body = await readBody(req);
    const { patientId, doctorCode: dc, pdfHtml, pdfFileName } = body;

    if (!patientId || !pdfHtml)
      return jsonRes(res, 400, { error: 'patientId and pdfHtml required' });

   // Беремо telegram з БД
const rawId = String(patientId).replace('sb_', '');
const r = await supabaseFetch('GET',
  `patients?id=eq.${encodeURIComponent(rawId)}&select=telegram,dynamic_answers,last_name,first_name&limit=1`
);

if (r.status !== 200 || !Array.isArray(r.body) || !r.body.length)
  return jsonRes(res, 404, { error: 'Пацієнт не знайдений' });

const row = r.body[0];
const tgId = row.telegram || row.dynamic_answers?.__deliveryInfo?.telegramId;

if (!tgId)
  return jsonRes(res, 400, { error: 'Telegram ID не збережено для цього пацієнта' });
;

    if (!BOT_TOKEN)
      return jsonRes(res, 500, { error: 'BOT_TOKEN не налаштовано' });

    // Генеруємо PDF через html-pdf або puppeteer
    // Оскільки на сервері може не бути puppeteer — використовуємо простіший підхід:
    // надсилаємо HTML як .html файл або текстове повідомлення з посиланням.
    // Для справжнього PDF — встанови: npm install puppeteer-core @sparticuz/chromium

    // ── Варіант А: надсилаємо HTML-файл (відкривається в браузері як PDF-ready сторінка)
    const htmlBuffer = Buffer.from(pdfHtml, 'utf8');
    const fileName = pdfFileName || 'protocol.html';

    // Формуємо multipart/form-data вручну
    const boundary = '----NexumBoundary' + Date.now();
    const caption = '📋 Протокол консультації від вашого лікаря.\nВідкрийте файл у браузері та збережіть як PDF (Ctrl+P → Зберегти як PDF).';

    const parts = [];
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${tgId}\r\n`
      )
    );
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`
      )
    );
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${fileName}"\r\nContent-Type: text/html\r\n\r\n`
      )
    );
    parts.push(htmlBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const multipartBody = Buffer.concat(parts);

    const tgResult = await new Promise((resolve, reject) => {
      const req2 = https.request({
        hostname: 'api.telegram.org',
        path: `/bot${BOT_TOKEN}/sendDocument`,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': multipartBody.length,
        },
      }, res2 => {
        let d = '';
        res2.on('data', c => d += c);
        res2.on('end', () => {
          try { resolve(JSON.parse(d)); }
          catch { resolve({ ok: false, description: 'parse error' }); }
        });
      });
      req2.on('error', reject);
      req2.write(multipartBody);
      req2.end();
    });

    if (!tgResult.ok)
      return jsonRes(res, 500, {
        error: tgResult.description || 'Telegram sendDocument failed'
      });

    jsonRes(res, 200, { ok: true });
  } catch(e) {
    console.error('[POST /api/patient/send-telegram-pdf]', e.message);
    jsonRes(res, 500, { error: e.message });
  }
  return;
}
  // POST /api/photos/:patientId
if (req.method === 'POST' && pn.startsWith('/api/photos/')) {
  const rawId = decodeURIComponent(pn.replace('/api/photos/', ''));
  if (!rawId) { jsonRes(res, 400, { error: 'patientId required' }); return; }

  try {
    const chunks = [];
    req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', async () => {
      try {
        const body = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
        if (!boundaryMatch) {
          jsonRes(res, 400, { error: 'No boundary' }); return;
        }

        const boundary = boundaryMatch[1];
        const boundaryBuf = Buffer.from('\r\n--' + boundary);
        const uploads = [];

        // Розбираємо multipart вручну
        let start = body.indexOf('--' + boundary);
        while (start !== -1) {
          const headerEnd = body.indexOf('\r\n\r\n', start);
          if (headerEnd === -1) break;

          const headerSection = body.slice(start, headerEnd).toString('utf8');
          const filenameMatch = headerSection.match(/filename="([^"]+)"/);
          const mimeMatch = headerSection.match(/Content-Type:\s*([^\r\n]+)/);

          if (!filenameMatch) {
            const next = body.indexOf('\r\n--' + boundary, headerEnd);
            start = next === -1 ? -1 : next + 2;
            continue;
          }

          const filename = filenameMatch[1];
          const mimeType = mimeMatch ? mimeMatch[1].trim() : 'image/jpeg';
          const ext = filename.split('.').pop() || 'jpg';

          const dataStart = headerEnd + 4;
          const dataEnd = body.indexOf(boundaryBuf, dataStart);
          if (dataEnd === -1) break;

          const fileData = body.slice(dataStart, dataEnd);

          // Унікальне ім'я файлу в Storage
          const storagePath = `${rawId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

          // Завантажуємо в Supabase Storage через REST API
          const uploadResult = await uploadToStorage(storagePath, fileData, mimeType);

          if (uploadResult.ok) {
            const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/patient-photos/${storagePath}`;
            uploads.push({
              url: publicUrl,
              filename: filename,
              date: new Date().toLocaleDateString('uk-UA'),
              path: storagePath,
            });
          } else {
  console.error('[photos] Storage upload failed:', uploadResult.error);
  jsonRes(res, 500, { error: 'Storage: ' + uploadResult.error }); 
  return;
}

          const next = body.indexOf('\r\n--' + boundary, dataEnd);
          start = next === -1 ? -1 : next + 2;
        }

        if (!uploads.length) {
          jsonRes(res, 500, { error: 'Upload to storage failed' }); return;
        }

        // Зберігаємо URL в колонку photos пацієнта
        const r = await supabaseFetch('GET',
          `patients?id=eq.${encodeURIComponent(rawId)}&select=photos&limit=1`);
        if (r.status !== 200 || !Array.isArray(r.body) || !r.body.length) {
          jsonRes(res, 404, { error: 'Patient not found' }); return;
        }

        const existing = Array.isArray(r.body[0].photos) ? r.body[0].photos : [];
        const merged = [...existing, ...uploads];

        await supabaseFetch('PATCH', `patients?id=eq.${encodeURIComponent(rawId)}`, {
          photos: merged,
          updated_at: new Date().toISOString(),
        });

        jsonRes(res, 200, { ok: true, uploaded: uploads });
      } catch(e) {
        console.error('[POST /api/photos] inner:', e.message);
        jsonRes(res, 500, { error: e.message });
      }
    });
  } catch(e) {
    console.error('[POST /api/photos] outer:', e.message);
    jsonRes(res, 500, { error: e.message });
  }
  return;
}
  // DELETE /api/photos/:patientId
if (req.method === 'DELETE' && pn.startsWith('/api/photos/')) {
  try {
    const rawId = decodeURIComponent(pn.replace('/api/photos/', ''));
    if (!rawId) { jsonRes(res, 400, { error: 'patientId required' }); return; }

    const body = await readBody(req);
    const { path: storagePath } = body;
    if (!storagePath) { jsonRes(res, 400, { error: 'path required' }); return; }

    // Видаляємо з Supabase Storage
    const urlObj = new URL(SUPABASE_URL);
    await new Promise((resolve, reject) => {
      const req2 = https.request({
        hostname: urlObj.hostname,
        path: `/storage/v1/object/patient-photos/${storagePath}`,
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }, res2 => {
        let d = '';
        res2.on('data', c => d += c);
        res2.on('end', () => resolve());
      });
      req2.on('error', reject);
      req2.end();
    });

    // Оновлюємо список фото у пацієнта
    const r = await supabaseFetch('GET',
      `patients?id=eq.${encodeURIComponent(rawId)}&select=photos&limit=1`);
    if (r.status !== 200 || !Array.isArray(r.body) || !r.body.length) {
      jsonRes(res, 404, { error: 'Patient not found' }); return;
    }

    const existing = Array.isArray(r.body[0].photos) ? r.body[0].photos : [];
    const filtered = existing.filter(p => {
      const p_path = typeof p === 'string' ? p : (p.path || p.url || '');
      return !p_path.includes(storagePath);
    });

    await supabaseFetch('PATCH', `patients?id=eq.${encodeURIComponent(rawId)}`, {
      photos: filtered,
      updated_at: new Date().toISOString(),
    });

    jsonRes(res, 200, { ok: true });
  } catch(e) {
    console.error('[DELETE /api/photos]', e.message);
    jsonRes(res, 500, { error: e.message });
  }
  return;
}
// POST /api/export/docx
if (req.method === 'POST' && pn === '/api/export/docx') {
  let rawBody = '';
  req.on('data', c => rawBody += c);
  await new Promise(r => req.on('end', r));

  try {
    const payload = JSON.parse(rawBody);
    const tmpFile = require('os').tmpdir() + '/nexum_' + Date.now() + '.docx';
    payload.outputPath = tmpFile;

    const scriptPath = path.join(__dirname, 'generate_patient_docx.js');
    const { spawn } = require('child_process');

    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
      let stderr = '';
      child.stderr.on('data', c => stderr += c);
      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(stderr || 'DOCX failed'));
      });
    });

    const fileBuffer = fs.readFileSync(tmpFile);
    fs.unlinkSync(tmpFile);

    const patName = [payload.patient?.lastName, payload.patient?.firstName]
      .filter(Boolean).join('_') || 'patient';
    const date = new Date().toLocaleDateString('uk-UA').replace(/\./g, '-');

    const safePatName = patName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\-]/g, '_');

    const displayName = `Nexum_${patName}_${date}.docx`;

    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="Nexum_${safePatName}_${date}.docx"; filename*=UTF-8''${encodeURIComponent(displayName)}`,
      'Content-Length': fileBuffer.length,
    });
    res.end(fileBuffer); // ← ЦЕЙ РЯДОК БУВ ВІДСУТНІЙ
  } catch(e) {
    console.error('[DOCX export]', e.message);
    jsonRes(res, 500, 'DOCX error: ' + e.message);
  }
  return;
}
  // POST /api/patient/send-email-pdf
if (req.method === 'POST' && pn === '/api/patient/send-email-pdf') {
  try {
    const body = await readBody(req);
    const { toEmail, pdfBase64, pdfFileName, patientName, doctorName } = body;

    if (!toEmail || !toEmail.includes('@'))
      return jsonRes(res, 400, { error: 'Невірний email' });
    if (!pdfBase64)
      return jsonRes(res, 400, { error: 'pdfBase64 обов\'язковий' });

    const SENDGRID_KEY  = process.env.SENDGRID_API_KEY;
    const SENDGRID_FROM = process.env.SENDGRID_FROM || 'noreply@nexum.app';

    if (!SENDGRID_KEY)
      return jsonRes(res, 500, { error: 'SENDGRID_API_KEY not set' });

    const date = new Date().toLocaleDateString('uk-UA',
      { day: '2-digit', month: 'long', year: 'numeric' });

    const emailBody = JSON.stringify({
      personalizations: [{
        to: [{ email: toEmail }],
        subject: `📋 Протокол консультації — ${patientName || 'Пацієнт'} — ${date}`,
      }],
      from: { email: SENDGRID_FROM, name: doctorName || 'Nexum' },
      content: [
        { type: 'text/plain', value: `Протокол консультації для ${patientName || 'Пацієнт'} від ${date}.` },
        { type: 'text/html',  value: `<p>Протокол консультації для <b>${patientName || 'Пацієнт'}</b> від ${date}.</p><p>PDF-файл додається нижче.</p>` },
      ],
      attachments: [{
        content:     pdfBase64,
        filename:    pdfFileName || 'protocol.pdf',
        type:        'application/pdf',
        disposition: 'attachment',
      }],
    });

    const result = await new Promise((resolve, reject) => {
      const r = https.request({
        hostname: 'api.sendgrid.com',
        path:     '/v3/mail/send',
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Authorization':  `Bearer ${SENDGRID_KEY}`,
          'Content-Length': Buffer.byteLength(emailBody),
        },
      }, res2 => {
        let d = '';
        res2.on('data', c => d += c);
        res2.on('end', () => resolve({ status: res2.statusCode, body: d }));
      });
      r.on('error', reject);
      r.write(emailBody);
      r.end();
    });

    if (result.status === 202) {
      console.log('[send-email-pdf] Sent to:', toEmail);
      jsonRes(res, 200, { ok: true, sentTo: toEmail });
    } else {
      console.error('[send-email-pdf] SendGrid error:', result.status, result.body);
      jsonRes(res, 500, { error: 'SendGrid: ' + result.status });
    }
  } catch(e) {
    console.error('[POST /api/patient/send-email-pdf]', e.message);
    jsonRes(res, 500, { error: e.message });
  }
  return;
}
  /* ══════════════════════════════════════════════════════════════
   NEXUM — ENDPOINT: POST /api/patient/
   Вставити в server.js поряд з /api/patient/send-email-pdf
   ══════════════════════════════════════════════════════════════

   ЗАЛЕЖНОСТІ (вже є у вашому server.js):
   ────────────────────────────────────────
   • @sendgrid/mail     → const sgMail = require('@sendgrid/mail')
   • process.env.SENDGRID_API_KEY
   • process.env.SENDGRID_FROM_EMAIL  (або замінити на свій)

   ВИКОРИСТАННЯ:
   ─────────────
   reminder-sender.js (клієнт) викликає цей endpoint коли
   канал доставки пацієнта = 'email'.
*/

// ── Налаштування SendGrid (вже має бути у server.js) ────────────
// const sgMail = require('@sendgrid/mail');
// sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// ── ENDPOINT ────────────────────────────────────────────────────
if (req.method === 'POST' && pn === '/api/patient/send-reminder-email') {
  try {
    const body = await readBody(req);
    const {
      toEmail, patientName, doctorName,
      subject, htmlBody, reminderType, message,
    } = body;

    if (!toEmail || !toEmail.includes('@'))
      return jsonRes(res, 400, { error: 'Невірний email' });
    if (!htmlBody)
      return jsonRes(res, 400, { error: 'htmlBody обов\'язковий' });

    const SENDGRID_KEY  = process.env.SENDGRID_API_KEY;
    const SENDGRID_FROM = process.env.SENDGRID_FROM || 'noreply@nexum.app';

    if (!SENDGRID_KEY)
      return jsonRes(res, 500, { error: 'SENDGRID_API_KEY not set' });

    const emailBody = JSON.stringify({
      personalizations: [{ to: [{ email: toEmail }], subject: subject || '🔔 Нагадування від лікаря — Nexum' }],
      from: { email: SENDGRID_FROM, name: 'Nexum · Медична система' },
      content: [
        { type: 'text/plain', value: message || '' },
        { type: 'text/html',  value: htmlBody },
      ],
    });

    const result = await new Promise((resolve, reject) => {
      const r = https.request({
        hostname: 'api.sendgrid.com',
        path: '/v3/mail/send',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SENDGRID_KEY}`,
          'Content-Length': Buffer.byteLength(emailBody),
        },
      }, res2 => {
        let d = '';
        res2.on('data', c => d += c);
        res2.on('end', () => resolve({ status: res2.statusCode, body: d }));
      });
      r.on('error', reject);
      r.write(emailBody);
      r.end();
    });

    if (result.status === 202) {
      console.log('[send-reminder-email] Sent to:', toEmail);
      jsonRes(res, 200, { ok: true, sentTo: toEmail });
    } else {
      console.error('[send-reminder-email] SendGrid error:', result.status, result.body);
      jsonRes(res, 500, { error: 'SendGrid: ' + result.status });
    }
  } catch(e) {
    console.error('[POST /api/patient/send-reminder-email]', e.message);
    jsonRes(res, 500, { error: e.message });
  }
  return;
}
  // POST /api/track  — аналітика відвідувань
if (req.method === 'POST' && pn === '/api/track') {
  try {
    const body = await readBody(req);
    await supabaseFetch('POST', 'visits', {
      page:     body.page     || '/',
      referrer: body.referrer || '',
      device:   body.device   || 'desktop',
      visited_at: new Date().toISOString(),
    });
    jsonRes(res, 200, { ok: true });
  } catch(e) { jsonRes(res, 200, { ok: false }); }
  return;
}

// GET /api/analytics  — статистика
if (req.method === 'GET' && pn === '/api/analytics') {
const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) { res.writeHead(500); res.end('Server misconfigured'); return; }  if (qs.secret !== ADMIN_SECRET)
    return jsonRes(res, 403, { error: 'Forbidden' });
  try {
    const [total, today, devices, pages] = await Promise.all([
      supabaseFetch('GET', 'visits?select=id'),
      supabaseFetch('GET', `visits?select=id&visited_at=gte.${new Date(Date.now()-86400000).toISOString()}`),
      supabaseFetch('GET', 'visits?select=device'),
      supabaseFetch('GET', 'visits?select=page'),
    ]);

    const countBy = (arr, key) => arr.reduce((acc, r) => {
      acc[r[key]] = (acc[r[key]] || 0) + 1; return acc;
    }, {});

    const totalArr  = Array.isArray(total.body)   ? total.body   : [];
    const todayArr  = Array.isArray(today.body)   ? today.body   : [];
    const devArr    = Array.isArray(devices.body) ? devices.body : [];
    const pagesArr  = Array.isArray(pages.body)   ? pages.body   : [];

    jsonRes(res, 200, {
      total:   totalArr.length,
      today:   todayArr.length,
      devices: countBy(devArr, 'device'),
      pages:   countBy(pagesArr, 'page'),
    });
  } catch(e) { jsonRes(res, 500, { error: e.message }); }
  return;
}
  // POST /api/notify
  if (req.method === 'POST' && pn === '/api/notify') {
    try {
      const { message } = await readBody(req);
      if (!BOT_TOKEN || !CHAT_ID) return jsonRes(res, 500, { error: 'bot not configured' });
      await send(CHAT_ID, message);
      jsonRes(res, 200, { ok: true });
    } catch(e) { jsonRes(res, 500, { error: e.message }); }
    return;
  }

  // GET /api/patient/chatlog
  if (req.method === 'GET' && pn === '/api/patient/chatlog') {
    try {
      const { doctorCode, phone, email, name } = qs;
      if (!doctorCode) return jsonRes(res, 400, { error: 'doctorCode required' });
      if (!phone && !email && !name) return jsonRes(res, 400, { error: 'phone, email or name required' });

      const dc = doctorCode.toUpperCase();
      let endpoint = `patients?doctor_code=eq.${encodeURIComponent(dc)}`;
      if (phone) endpoint += `&phone=eq.${encodeURIComponent(phone)}`;
      else if (email) endpoint += `&email=eq.${encodeURIComponent(email)}`;

      const r = await supabaseFetch('GET', endpoint);
      if (r.status !== 200) throw new Error('chatlog query failed: ' + r.status);

      let pts = Array.isArray(r.body) ? r.body : [];

      if (name && !phone && !email) {
        const normName = name.toLowerCase().trim().replace(/\s+/g, ' ');
        pts = pts.filter(p => {
          const dn = [p.last_name, p.first_name].filter(Boolean).join(' ').toLowerCase();
          return dn.includes(normName) || normName.includes(dn.split(' ')[0]);
        });
      }

      const result = pts.flatMap(p => {
        const sessions = Array.isArray(p.chat_sessions) ? p.chat_sessions : [];
        return sessions.map(s => ({
          id:          s.id || '',
          createdAt:   s.createdAt || '',
          summary:     s.summary || '',
          chatHistory: (Array.isArray(s.chatHistory) ? s.chatHistory : []).filter(m =>
            m.content !== 'Почни опитування' && m.content !== 'Start the survey'
          ),
        }));
      });

      jsonRes(res, 200, result);
    } catch(e) { console.error('[chatlog]', e.message); jsonRes(res, 500, { error: e.message }); }
    return;
  }
// ТИМЧАСОВА ДІАГНОСТИКА
  if (req.method === 'GET' && pn === '/debug-tg') {
    try {
      const r = await supabaseFetch('GET',
        'patients?order=created_at.desc&limit=20&select=id,last_name,first_name,telegram,dynamic_answers');
      const patients = Array.isArray(r.body) ? r.body : [];
      const result = patients.map(p => ({
        name: [p.last_name, p.first_name].filter(Boolean).join(' ') || '—',
        telegram_col: p.telegram || '—',
        delivery_tgId: p.dynamic_answers?.__deliveryInfo?.telegramId || '—',
        channel: p.dynamic_answers?.__deliveryInfo?.channel || '—',
        has_numeric_id:
          /^\d{5,12}$/.test(String(p.telegram || '')) ||
          /^\d{5,12}$/.test(String(p.dynamic_answers?.__deliveryInfo?.telegramId || '')),
      }));
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify(result, null, 2));
    } catch(e) {
      res.writeHead(500); res.end(e.message);
    }
    return;
  }
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BLOG ADMIN API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// POST /api/blog/admin-login
if (req.method === 'POST' && pn === '/api/blog/admin-login') {
  try {
    const { username, password } = await readBody(req);
    if (!username || !password) return jsonRes(res, 400, { ok: false, error: 'missing fields' });

    const r = await supabaseFetch('GET',
      `blog_admins?username=eq.${encodeURIComponent(username.trim())}&limit=1`);

    if (r.status !== 200 || !Array.isArray(r.body) || !r.body.length)
      return jsonRes(res, 401, { ok: false });

    const admin = r.body[0];

    // Перевірка пароля (timingSafeEqual захищає від timing-атак)
    const storedPass = Buffer.from(admin.password || '');
    const inputPass  = Buffer.from((password || '').trim());
    if (storedPass.length !== inputPass.length ||
        !crypto.timingSafeEqual(storedPass, inputPass))
      return jsonRes(res, 401, { ok: false });

    return jsonRes(res, 200, {
      ok:     true,
      name:   admin.name,
      secret: process.env.ADMIN_SECRET || '',
    });
  } catch(e) {
    console.error('[POST /api/blog/admin-login]', e.message);
    return jsonRes(res, 500, { ok: false });
  }
}

// GET /api/blog/articles  — публічний (потрібен для сайту)
if (req.method === 'GET' && pn === '/api/blog/articles') {
  try {
    const r = await supabaseFetch('GET', 'blog_articles?order=created_at.desc');
    if (r.status !== 200) throw new Error('DB error: ' + r.status);

    const articles = (Array.isArray(r.body) ? r.body : []).map(row => ({
      id:            row.id,
      cat:           row.cat,
      catLabel:      row.cat_label    || { uk: '', en: '' },
      catClass:      row.cat_class    || '',
      icon:          row.icon         || '📝',
      coverBg:       row.cover_bg     || '',
      featured:      row.featured     || false,
      featuredSide:  row.featured_side || false,
      title:         row.title        || { uk: '', en: '' },
      excerpt:       row.excerpt      || { uk: '', en: '' },
      author:        row.author       || { uk: 'Команда Nexum', en: 'Nexum Team' },
      authorInitial: row.author_initial || 'N',
      date:          row.date_label   || { uk: '', en: '' },
      readTime:      row.read_time    || { uk: '', en: '' },
      body:          row.body         || { uk: '', en: '' },
      createdAt:     row.created_at,
    }));

    jsonRes(res, 200, articles);
  } catch(e) {
    console.error('[GET /api/blog/articles]', e.message);
    jsonRes(res, 500, { error: e.message });
  }
  return;
}

// POST /api/blog/articles  — створити статтю
if (req.method === 'POST' && pn === '/api/blog/articles') {
  try {
    const art = await readBody(req);
    const ADMIN_SECRET = process.env.ADMIN_SECRET;
    if (ADMIN_SECRET && art.adminSecret !== ADMIN_SECRET)
      return jsonRes(res, 403, { error: 'Forbidden' });

    const now = new Date().toISOString();
    const r = await supabaseFetch('POST', 'blog_articles', {
      cat:           art.cat          || 'product',
      cat_label:     art.catLabel     || {},
      cat_class:     art.catClass     || '',
      icon:          art.icon         || '📝',
      cover_bg:      art.coverBg      || '',
      featured:      art.featured     || false,
      featured_side: art.featuredSide || false,
      title:         art.title        || { uk: '', en: '' },
      excerpt:       art.excerpt      || { uk: '', en: '' },
      author:        art.author       || { uk: 'Команда Nexum', en: 'Nexum Team' },
      author_initial: art.authorInitial || 'N',
      date_label:    art.date         || { uk: '', en: '' },
      read_time:     art.readTime     || { uk: '', en: '' },
      body:          art.body         || { uk: '', en: '' },
      created_at:    now,
      updated_at:    now,
    });

    if (r.status !== 201 && r.status !== 200)
      throw new Error('Create failed: ' + r.status);

    const created = Array.isArray(r.body) ? r.body[0] : r.body;
    jsonRes(res, 200, { ok: true, id: created?.id });
  } catch(e) {
    console.error('[POST /api/blog/articles]', e.message);
    jsonRes(res, 500, { error: e.message });
  }
  return;
}

// PUT /api/blog/articles/:id  — оновити статтю
if (req.method === 'PUT' && pn.startsWith('/api/blog/articles/')) {
  try {
    const artId = decodeURIComponent(pn.replace('/api/blog/articles/', ''));
    const art = await readBody(req);
    const ADMIN_SECRET = process.env.ADMIN_SECRET;
    if (ADMIN_SECRET && art.adminSecret !== ADMIN_SECRET)
      return jsonRes(res, 403, { error: 'Forbidden' });

    const r = await supabaseFetch('PATCH', `blog_articles?id=eq.${artId}`, {
      cat:           art.cat          || 'product',
      cat_label:     art.catLabel     || {},
      cat_class:     art.catClass     || '',
      icon:          art.icon         || '📝',
      cover_bg:      art.coverBg      || '',
      featured:      art.featured     || false,
      featured_side: art.featuredSide || false,
      title:         art.title        || { uk: '', en: '' },
      excerpt:       art.excerpt      || { uk: '', en: '' },
      author:        art.author       || { uk: 'Команда Nexum', en: 'Nexum Team' },
      author_initial: art.authorInitial || 'N',
      date_label:    art.date         || { uk: '', en: '' },
      read_time:     art.readTime     || { uk: '', en: '' },
      body:          art.body         || { uk: '', en: '' },
      updated_at:    new Date().toISOString(),
    });

    if (r.status !== 200 && r.status !== 204)
      throw new Error('Update failed: ' + r.status);

    jsonRes(res, 200, { ok: true });
  } catch(e) {
    console.error('[PUT /api/blog/articles]', e.message);
    jsonRes(res, 500, { error: e.message });
  }
  return;
}

// DELETE /api/blog/articles/:id  — видалити статтю
if (req.method === 'DELETE' && pn.startsWith('/api/blog/articles/')) {
  try {
    const artId = decodeURIComponent(pn.replace('/api/blog/articles/', ''));
    const ADMIN_SECRET = process.env.ADMIN_SECRET;
    // Перевіряємо secret у query string (?secret=...)
    if (ADMIN_SECRET && qs.secret !== ADMIN_SECRET)
      return jsonRes(res, 403, { error: 'Forbidden' });

    const r = await supabaseFetch('DELETE', `blog_articles?id=eq.${artId}`);
    if (r.status !== 200 && r.status !== 204)
      throw new Error('Delete failed: ' + r.status);

    jsonRes(res, 200, { ok: true });
  } catch(e) {
    console.error('[DELETE /api/blog/articles]', e.message);
    jsonRes(res, 500, { error: e.message });
  }
  return;
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// END BLOG ADMIN API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ── Static files fallback ──────────────────────────────────
  const ROUTES = {
    '/': 'nexum.html', '/nexum.html': 'nexum.html',
    '/login': 'login.html', '/login.html': 'login.html',
    '/dashboard': 'dashboard.html', '/dashboard.html': 'dashboard.html',
    '/survey': 'survey.html', '/survey.html': 'survey.html',
  };

  const file = ROUTES[pn] || pn.replace(/^\//, '');
  const fp = path.join(__dirname, file);
  if (!fp.startsWith(path.join(__dirname))) {
  res.writeHead(403); res.end('Forbidden'); return;
}
  fs.stat(fp, (err, stat) => {
    if (!err && stat.isFile()) serveStatic(fp, res, req);
    else serveStatic(fp + '.html', res, req);
  });

}).listen(PORT, () => {
  console.log(`Nexum site :${PORT}`);
  console.log(`Supabase: ${SUPABASE_URL || 'NOT SET'}`);
  if (GROQ_API_KEY) console.log('Groq AI ready');
  else console.warn('GROQ_API_KEY not set');
});

if (BOT_TOKEN && CHAT_ID) { poll(); console.log('Bot polling started'); }
else console.warn('Bot disabled');
