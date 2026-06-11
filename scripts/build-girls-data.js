const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const workbookPath = process.argv[2];
const outputPath = path.join(__dirname, '..', 'data', 'girls-score-data.json');

if (!workbookPath) {
  throw new Error('Usage: node scripts/build-girls-data.js <workbook-path>');
}

function formatSeconds(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function detectGirlsValueType(header) {
  if (header.includes('דילגית')) {
    return 'number';
  }

  return 'time_fraction';
}

function normalizeGirlsValue(rawValue, valueType) {
  if (rawValue === '' || rawValue === null || rawValue === undefined) {
    return null;
  }

  if (valueType === 'number') {
    const numericValue = Number(rawValue);

    if (!Number.isFinite(numericValue)) {
      return null;
    }

    return { raw: numericValue, comparable: numericValue, display: String(numericValue) };
  }

  const numericValue = Number(rawValue);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const seconds = Math.round(numericValue * 24 * 60 * 60);
  return { raw: numericValue, comparable: seconds, display: formatSeconds(seconds) };
}

function loadGirlsSheets() {
  const workbook = XLSX.readFile(workbookPath, { cellFormula: true, raw: false });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
    raw: true,
  }).map((row) => row.slice(0, 9));

  const headers = rows[0].map((header) => String(header).trim()).filter(Boolean);
  const bodyRows = rows.slice(1);
  const metrics = headers.slice(1).map((header, index) => {
    const columnIndex = index + 1;
    const valueType = detectGirlsValueType(header);
    const entries = bodyRows
      .map((row) => {
        const normalizedValue = normalizeGirlsValue(row[columnIndex], valueType);

        if (!normalizedValue) {
          return null;
        }

        return {
          score: Number(row[0]),
          ...normalizedValue,
        };
      })
      .filter(Boolean);

    const direction = entries[0].comparable > entries[entries.length - 1].comparable ? 'higher_better' : 'lower_better';

    return {
      key: `metric_${columnIndex}`,
      label: header,
      valueType,
      direction,
      bestDisplay: entries[0].display,
      worstDisplay: entries[entries.length - 1].display,
      entries,
    };
  });

  const displayRows = bodyRows.map((row) => row.slice(0, 9).map((cell, index) => {
    if (index === 0) {
      return String(cell);
    }

    const metric = metrics[index - 1];
    return metric ? (normalizeGirlsValue(cell, metric.valueType)?.display ?? '') : '';
  }));

  return ['ז', 'ח', 'ט', 'י', 'יא', 'יב'].map((name) => ({
    id: `sheet_${name}`,
    name,
    scoreRange: {
      max: Number(bodyRows[0][0]),
      min: Number(bodyRows[bodyRows.length - 1][0]),
    },
    table: {
      headers,
      rows: displayRows,
    },
    metrics,
  }));
}

const data = {
  generatedAt: new Date().toISOString(),
  sourceWorkbook: path.basename(workbookPath),
  sheets: loadGirlsSheets(),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

console.log(`Wrote ${outputPath}`);
