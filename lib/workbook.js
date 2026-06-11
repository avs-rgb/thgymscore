const scoreData = require('../data/score-data.json');
const path = require('path');
const XLSX = require('xlsx');
const beepStageShuttles = [7, 8, 8, 9, 9, 10, 10, 11, 11, 11, 12, 12, 13, 13, 13, 14, 14, 15, 15, 16, 16];
const girlsWorkbookPath = path.join('C:', 'Users', 'dell', 'Desktop', 'ציונים בנות.xlsx');

function parseTimeString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(':').map(Number);

  if (parts.some(Number.isNaN)) {
    return null;
  }

  if (parts.length === 2) {
    return (parts[0] * 60) + parts[1];
  }

  if (parts.length === 3) {
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  }

  return null;
}

function parseCompactTime(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const raw = String(Math.round(numericValue)).padStart(3, '0');
  const seconds = Number(raw.slice(-2));
  const minutes = Number(raw.slice(0, -2));

  if (seconds >= 60) {
    return null;
  }

  return (minutes * 60) + seconds;
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

function parseBeepsComparable(value) {
  const numericValue = Number(String(value).replace('-', ''));

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const raw = String(Math.round(numericValue));
  const shuttleIndex = Number(raw.slice(-1));
  const level = Number(raw.slice(0, -1) || '0');

  if (level <= 0) {
    return 0;
  }

  const completedBeforeLevel = beepStageShuttles
    .slice(0, Math.max(0, level - 1))
    .reduce((sum, count) => sum + count, 0);

  return completedBeforeLevel + shuttleIndex;
}

function formatBeepLevelFromComparable(completedShuttles) {
  if (!Number.isFinite(completedShuttles) || completedShuttles <= 0) {
    return '0-0';
  }

  let remaining = Math.floor(completedShuttles);

  for (let index = 0; index < beepStageShuttles.length; index += 1) {
    const stageShuttles = beepStageShuttles[index];

    if (remaining < stageShuttles) {
      return `${index + 1}-${remaining}`;
    }

    remaining -= stageShuttles;
  }

  const lastLevel = beepStageShuttles.length;
  const overflowStage = beepStageShuttles[lastLevel - 1];
  const extraLevels = Math.floor(remaining / overflowStage);
  const shuttleIndex = remaining % overflowStage;
  return `${lastLevel + extraLevels}-${shuttleIndex}`;
}

function formatBeepDisplay(rawValue) {
  const numericValue = Number(String(rawValue).replace('-', ''));

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const raw = String(Math.round(numericValue)).padStart(2, '0');
  return `${raw.slice(0, -1)}-${Number(raw.slice(-1))}`;
}


function parseUserValue(value, valueType) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();

  if (!trimmed) {
    return null;
  }

  if (valueType === 'time_string' || valueType === 'time_compact' || valueType === 'time_fraction') {
    const asColonTime = parseTimeString(trimmed);

    if (asColonTime !== null) {
      return asColonTime;
    }

    const digitsOnly = trimmed.replace(/[^0-9]/g, '');

    if (digitsOnly) {
      return parseCompactTime(Number(digitsOnly));
    }

    return null;
  }

  if (valueType === 'beeps') {
    const numericValue = Number(trimmed.replace('-', ''));
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  const numericValue = Number(trimmed.replace(',', '.'));
  return Number.isFinite(numericValue) ? numericValue : null;
}

function loadSheets() {
  return scoreData.sheets;
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
  const workbook = XLSX.readFile(girlsWorkbookPath, { cellFormula: true, raw: false });
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

function transformComparable(entry, valueType, direction) {
  if (valueType === 'beeps') {
    const totalShuttles = parseBeepsComparable(entry.display);
    return Math.max(0, Math.floor(totalShuttles * 0.8));
  }

  if (direction === 'higher_better') {
    return Math.max(0, Math.floor(entry.comparable * 0.8));
  }

  return Math.max(0, Math.round(entry.comparable * 1.2));
}

function formatComparableForValueType(comparable, valueType) {
  if (valueType === 'beeps') {
    return formatBeepLevelFromComparable(comparable);
  }

  if (valueType === 'time_string' || valueType === 'time_compact' || valueType === 'time_fraction') {
    return formatSeconds(comparable);
  }

  return String(comparable);
}

function transformCellDisplay(cell, metric) {
  if (cell === '' || cell === null || cell === undefined) {
    return '';
  }

  const entry = {
    comparable: metric.valueType === 'beeps'
      ? parseBeepsComparable(cell)
      : (metric.valueType === 'time_string' || metric.valueType === 'time_compact' || metric.valueType === 'time_fraction'
        ? parseTimeString(cell) ?? parseCompactTime(cell)
        : Number(cell)),
    display: cell,
  };

  if (!Number.isFinite(entry.comparable)) {
    return cell;
  }

  const transformedComparable = transformComparable(entry, metric.valueType, metric.direction);
  return formatComparableForValueType(transformedComparable, metric.valueType);
}

function createFemaleSheet(sheet) {
  const metricMap = new Map(sheet.metrics.map((metric) => [metric.key, metric]));

  const metrics = sheet.metrics.map((metric) => ({
    ...metric,
    entries: metric.entries.map((entry) => {
      const comparable = transformComparable(entry, metric.valueType, metric.direction);
      return {
        ...entry,
        raw: metric.valueType === 'beeps' ? comparable : comparable,
        comparable,
        display: metric.valueType === 'beeps'
          ? formatBeepLevelFromComparable(comparable)
          : formatComparableForValueType(comparable, metric.valueType),
      };
    }),
  }));

  const tableRows = sheet.table.rows.map((row) => row.map((cell, index) => {
    if (index === 0) {
      return cell;
    }

    const metric = metricMap.get(`metric_${index}`);
    return metric ? transformCellDisplay(cell, metric) : cell;
  }));

  return {
    ...sheet,
    metrics,
    table: {
      ...sheet.table,
      rows: tableRows,
    },
  };
}

function loadSheetsByGender(gender = 'male') {
  if (gender === 'female') {
    return loadGirlsSheets();
  }

  return loadSheets();
}

function scoreMetric(metric, inputValue) {
  const comparableInput = parseUserValue(inputValue, metric.valueType);

  if (comparableInput === null) {
    return null;
  }

  const match = metric.entries.find((entry) => (
    metric.direction === 'higher_better'
      ? comparableInput >= entry.comparable
      : comparableInput <= entry.comparable
  ));

  if (!match) {
    return {
      input: inputValue,
      comparableInput,
      score: 0,
      matchedValue: '0',
    };
  }

  return {
    input: inputValue,
    comparableInput,
    score: match.score,
    matchedValue: match.display,
  };
}

module.exports = {
  loadSheets,
  loadSheetsByGender,
  scoreMetric,
};
