const scoreData = require('../data/score-data.json');

const beepStageShuttles = [7, 8, 8, 9, 9, 10, 10, 11, 11, 11, 12, 12, 13, 13, 13, 14, 14, 15, 15, 16, 16];

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
    return scoreData.sheets.map(createFemaleSheet);
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
