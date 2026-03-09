export function parseCoursesCsv(csvText: string) {
  const lines = csvText.split('\n').filter(l => l.trim().length > 0).slice(1);
  const map: Record<string, { school: string, campus: string }> = {};
  
  for (const line of lines) {
    const row: string[] = [];
    let inQuotes = false;
    let current = '';
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current);
    
    if (row.length >= 4) {
      const code = row[0].trim().toUpperCase();
      const school = row[2].trim();
      const campus = row[3].trim();
      map[code] = { school, campus };
    }
  }
  return map;
}