const express = require('express');
const path = require('path');
const { loadSheetsByGender, scoreMetric } = require('./lib/workbook');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function resolveSheets(gender) {
  return loadSheetsByGender(gender === 'female' ? 'female' : 'male');
}

function buildScoreResponse(sheet, values) {
  const results = sheet.metrics.map((metric) => {
    const result = scoreMetric(metric, values?.[metric.key]);

    return {
      key: metric.key,
      label: metric.label,
      result,
    };
  });

  const scoredResults = results.filter((item) => item.result);
  const averageScore = scoredResults.length
    ? Math.floor(scoredResults.reduce((sum, item) => sum + item.result.score, 0) / scoredResults.length)
    : null;

  return {
    sheet: {
      id: sheet.id,
      name: sheet.name,
    },
    results,
    averageScore,
  };
}

app.get('/api/sheets', (request, response) => {
  response.json({
    maleSheets: resolveSheets('male'),
    femaleSheets: resolveSheets('female'),
  });
});

app.post('/api/score', (request, response) => {
  const { sheetId, values, gender } = request.body || {};
  const sheets = resolveSheets(gender);
  const sheet = sheets.find((item) => item.id === sheetId);

  if (!sheet) {
    response.status(404).json({ error: 'Sheet not found' });
    return;
  }

  response.json(buildScoreResponse(sheet, values));
});

app.post('/api/bulk-score', (request, response) => {
  const { sheetId, students, gender } = request.body || {};
  const sheets = resolveSheets(gender);
  const sheet = sheets.find((item) => item.id === sheetId);

  if (!sheet) {
    response.status(404).json({ error: 'Sheet not found' });
    return;
  }

  const normalizedStudents = Array.isArray(students) ? students : [];

  response.json({
    sheet: {
      id: sheet.id,
      name: sheet.name,
    },
    students: normalizedStudents.map((student, index) => ({
      studentName: student?.studentName || `תלמיד ${index + 1}`,
      ...buildScoreResponse(sheet, student?.values || {}),
    })),
  });
});

app.listen(port, () => {
  console.log(`Score site running at http://localhost:${port}`);
});
