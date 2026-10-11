// Missing/ambiguous photos are never credited as faithful matches.
export function measure(rows, stage) {
  let displayed = 0, faithful = 0, close = 0, unjudgeable = 0, top1 = 0, top3 = 0, covered = 0;
  for (const row of rows) {
    const products = row[stage].slice(0, 3);
    const grades = products.map(p => row.grades.find(g => g.productUrl === p.productUrl));
    const matches = grades.map(g => g?.grade === 3 && g.uncertain === false);
    displayed += products.length;
    faithful += matches.filter(Boolean).length;
    close += grades.filter(g => g && g.grade >= 2 && !g.uncertain).length;
    unjudgeable += grades.filter(g => !g || g.grade === null || g.uncertain).length;
    top1 += Number(matches[0] === true);
    top3 += Number(matches.some(Boolean));
    covered += Number(products.length > 0);
  }
  return { targets: rows.length, displayed, faithful, close, unjudgeable, faithfulPrecision: displayed ? faithful / displayed : null, faithfulPerAvailableSlot: rows.length ? faithful / (rows.length * 3) : null, top1, top3, covered };
}
