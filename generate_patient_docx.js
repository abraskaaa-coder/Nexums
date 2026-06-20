/**
 * Nexum — генератор DOCX по даних пацієнта
 * Читає JSON з stdin, записує .docx у файл (шлях у args[0])
 * 
 * Формат вхідних даних: { patient, sessions, surveyName, surveyRows, doctorName }
 */

const fs   = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageNumber, Header, Footer,
} = require('docx');

// ── helpers ───────────────────────────────────────────────────────────────────
const safe = s => String(s == null ? '' : s)
  .replace(/[\uFFFD\uFFFE\uFFFF]/g, '')
  .replace(/\uD800-\uDFFF/g, '')
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  .trim();

const PINK   = 'EC4899';
const LTPINK = 'FCE7F3';
const GRAY   = '6B7280';
const BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'FCE7F3' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

// Table full-width A4 with 2cm margins: 11906 - 2*1134 = 9638 DXA
const TW = 9638;

function heading(text, level = 1) {
  return new Paragraph({
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    spacing: { before: level === 1 ? 280 : 200, after: 120 },
    children: [new TextRun({ text: safe(text), color: level === 1 ? PINK : '374151', bold: true, size: level === 1 ? 26 : 22, font: 'Arial' })],
  });
}

function cell(text, w, opts = {}) {
  return new TableCell({
    borders: BORDERS,
    width: { size: w, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 140, right: 140 },
    shading: opts.header ? { fill: LTPINK, type: ShadingType.CLEAR } : { fill: 'FFFFFF', type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.TOP,
    children: [new Paragraph({
      children: [new TextRun({
        text: safe(text),
        size: opts.header ? 18 : 20,
        bold: opts.header || opts.bold || false,
        color: opts.header ? '374151' : '1F2937',
        font: 'Arial',
      })],
      spacing: { before: 40, after: 40 },
    })],
  });
}

function twoColTable(rows) {
  const L = Math.round(TW * 0.35), R = TW - L;
  return new Table({
    width: { size: TW, type: WidthType.DXA },
    columnWidths: [L, R],
    rows: rows.map(([label, value]) =>
      new TableRow({
        children: [
          cell(label, L, { header: true }),
          cell(value, R),
        ],
      })
    ),
  });
}

function qaTable(pairs) {
  const L = Math.round(TW * 0.42), R = TW - L;
  return new Table({
    width: { size: TW, type: WidthType.DXA },
    columnWidths: [L, R],
    rows: [
      new TableRow({
        children: [
          cell('Питання', L, { header: true, bold: true }),
          cell('Відповідь пацієнта', R, { header: true, bold: true }),
        ],
      }),
      ...pairs.map(({ q, a }) =>
        new TableRow({
          children: [
            cell(q, L, { bold: true }),
            cell(a || '—', R),
          ],
        })
      ),
    ],
  });
}

function spacer(before = 160) {
  return new Paragraph({ spacing: { before, after: 0 }, children: [] });
}

function divider() {
  return new Paragraph({
    spacing: { before: 180, after: 180 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LTPINK, space: 1 } },
    children: [],
  });
}

// ── main ─────────────────────────────────────────────────────────────────────
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => raw += chunk);
process.stdin.on('end', async () => {
  let data;
  try { data = JSON.parse(raw); } catch (e) { process.stderr.write('JSON parse error: ' + e.message); process.exit(1); }

  const { patient: p, sessions, surveyName, surveyRows, doctorName, outputPath } = data;
  const out = outputPath || process.argv[2] || '/tmp/nexum_patient.docx';

  const name     = [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ') || '—';
  const today    = new Date().toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' });
  const dobFormatted = p.birthDate
    ? new Date(p.birthDate).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  function age(dob) {
    if (!dob) return '';
    const d = new Date(dob), n = new Date();
    let a = n.getFullYear() - d.getFullYear();
    if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--;
    return a + ' р.';
  }

  // ── Build sections ─────────────────────────────────────────────────────────
  const children = [];

  // Title
  children.push(
    new Paragraph({
      spacing: { before: 0, after: 160 },
      children: [
        new TextRun({ text: 'Nexum ', font: 'Arial', size: 32, bold: true, color: PINK }),
        new TextRun({ text: '· Медична картка пацієнта', font: 'Arial', size: 28, bold: false, color: GRAY }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 240 },
      children: [
        new TextRun({ text: `Лікар: ${safe(doctorName)}   ·   Дата: ${today}`, font: 'Arial', size: 18, color: GRAY }),
      ],
    }),
    divider(),
  );

  // Інформація про пацієнта
  children.push(heading('Інформація про пацієнта'));
  children.push(
    twoColTable([
      ['ПІБ',               name],
      ['Дата народження',   dobFormatted + (p.birthDate ? `  (${age(p.birthDate)})` : '')],
      ['Телефон',           p.phone  || '—'],
      ['Telegram',          p.telegram || '—'],
      ['Група крові',       p.bloodType || '—'],
      ['Діагноз',           p.diag || '—'],
    ])
  );
  children.push(spacer());

  // Анамнез життя
  const allergyStr  = Array.isArray(p.allergy)  && p.allergy.length  ? p.allergy.join(', ')  : '—';
  const chronicStr  = Array.isArray(p.chronic)  && p.chronic.length  ? p.chronic.join(', ')  : '—';
  const medsStr     = Array.isArray(p.meds)     && p.meds.length     ? p.meds.join(', ')     : '—';

  children.push(heading('Анамнез життя'));
  children.push(
    twoColTable([
      ['Алергії',                 allergyStr],
      ['Хронічні захворювання',   chronicStr],
      ['Препарати',               medsStr],
      ['Операції / госпіталізації', p.operations || '—'],
      ['Спадковість',             p.family || '—'],
      ['Паління / алкоголь',      p.smoking || '—'],
      ['Фізична активність',      p.activity || '—'],
    ])
  );
  children.push(spacer());

  // Нотатки лікаря
  if (p.notes) {
    children.push(heading('Нотатки лікаря'));
    children.push(
      new Paragraph({
        spacing: { before: 80, after: 200 },
        children: [new TextRun({ text: safe(p.notes), font: 'Arial', size: 20, color: '374151' })],
      })
    );
  }

  // Відповіді опитування
  if (Array.isArray(surveyRows) && surveyRows.length) {
    children.push(heading(`Відповіді: ${safe(surveyName || 'Опитування')}`));
    children.push(qaTable(surveyRows));
    children.push(spacer());
  }

  // Лог розмов (сесії)
  if (Array.isArray(sessions) && sessions.length) {
    children.push(divider());
    children.push(heading(`Лог розмов з ботом (${sessions.length} сесій)`));

    sessions.forEach((s, si) => {
      const dateStr = s.createdAt
        ? new Date(s.createdAt).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';
      children.push(
        new Paragraph({
          spacing: { before: 240, after: 80 },
          children: [
            new TextRun({ text: `Сесія ${si + 1}`, font: 'Arial', size: 22, bold: true, color: PINK }),
            new TextRun({ text: `  ·  ${dateStr}`, font: 'Arial', size: 18, color: GRAY }),
          ],
        })
      );

      const history = Array.isArray(s.chatHistory) ? s.chatHistory : [];
      // Збираємо пари питання → відповідь
      const pairs = [];
      for (let i = 0; i < history.length - 1; i++) {
        const m = history[i];
        if (m.role !== 'assistant') continue;
        if (/ЗАВЕРШЕНО|COMPLETE|SURVEY_DONE/i.test(m.content || '')) continue;
        const answerMsg = history[i + 1];
        if (answerMsg && answerMsg.role === 'user') {
          pairs.push({ q: m.content || '', a: answerMsg.content || '' });
        }
      }
      if (pairs.length) {
        children.push(qaTable(pairs));
      } else {
        children.push(new Paragraph({
          children: [new TextRun({ text: 'Повідомлень немає', font: 'Arial', size: 18, color: GRAY, italics: true })],
          spacing: { before: 60, after: 60 },
        }));
      }

      // Summary якщо є
      if (s.summary) {
        children.push(spacer(120));
        children.push(
          new Paragraph({
            spacing: { before: 80, after: 40 },
            children: [new TextRun({ text: 'AI Summary', font: 'Arial', size: 18, bold: true, color: PINK })],
          }),
          new Paragraph({
            spacing: { before: 0, after: 160 },
            children: [new TextRun({ text: safe(s.summary), font: 'Arial', size: 18, color: GRAY, italics: true })],
          })
        );
      }
    });
  }

  // Підпис
  children.push(divider());
  children.push(
    new Paragraph({
      spacing: { before: 280, after: 80 },
      children: [new TextRun({ text: 'Підпис лікаря: ______________________________', font: 'Arial', size: 20, color: GRAY })],
    }),
    new Paragraph({
      spacing: { before: 80, after: 0 },
      children: [new TextRun({ text: 'Дата: __________________', font: 'Arial', size: 20, color: GRAY })],
    })
  );

  // ── Build document ─────────────────────────────────────────────────────────
  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 20 } } },
      paragraphStyles: [
        {
          id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 26, bold: true, font: 'Arial', color: PINK },
          paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 22, bold: true, font: 'Arial', color: '374151' },
          paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 },
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }, // ~2cm
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            spacing: { before: 0, after: 80 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LTPINK, space: 1 } },
            children: [
              new TextRun({ text: 'Nexum', font: 'Arial', size: 20, bold: true, color: PINK }),
              new TextRun({ text: `  ·  ${safe(name)}  ·  ${today}`, font: 'Arial', size: 18, color: GRAY }),
            ],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            spacing: { before: 80, after: 0 },
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: LTPINK, space: 1 } },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
  children: [
    'Nexum — медична інформаційна система  ·  Сторінка ',
    PageNumber.CURRENT,
  ],
  font: 'Arial', size: 16, color: GRAY,
}),
            ],
          })],
        }),
      },
      children,
    }],
  });

  try {
    const buf = await Packer.toBuffer(doc);
    fs.writeFileSync(out, buf);
    process.stdout.write(JSON.stringify({ ok: true, path: out }));
  } catch (e) {
    process.stderr.write('DOCX write error: ' + e.message);
    process.exit(1);
  }
});
