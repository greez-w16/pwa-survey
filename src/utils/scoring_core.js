// Standalone scoring core extracted for reuse in other projects.
// Pure functions: no React, no external imports required.

export function calculatePointsForLink(response, severity) {
  if (!response || response === 'NA') return null;
  const res = String(response).toUpperCase().trim();
  const isC = (/^([A-Z]+_)?(C|FC|FULL|COMPLIANT)$/.test(res) && !res.includes('NON')) ||
              (res.includes('COMPLIANT') && !res.includes('NON') && !res.includes('PARTIAL'));
  if (isC) return 80; // C = 80 pts

  const isPC = /^([A-Z]+_)?(PC|PARTIAL|SUBSTANTIAL)$/.test(res) || res.includes('PARTIAL');
  if (isPC) {
    let s = parseInt(severity, 10);
    if (Number.isNaN(s)) s = 1;
    return 75 - (s - 1) * 10; // 1:75, 2:65, 3:55, 4:45
  }

  const isNC = /^([A-Z]+_)?(NC|NON|NON_COMPLIANT|NON-COMPLIANT|NOT_MET|FAIL)$/.test(res) ||
               res.includes('NON') || res.includes('FAIL');
  if (isNC) {
    let s = parseInt(severity, 10);
    if (Number.isNaN(s)) s = 1;
    return 35 - (s - 1) * 10; // 1:35, 2:25, 3:15, 4:5
  }

  return null; // NA or unknown
}

// criteriaMap: { code -> { id, response, isRoot, links, severity, isCritical } }
export function computeGraphScores(criteriaMap) {
  const globalScores = {};
  const resolving = new Set();

  const computeCriterion = (code) => {
    if (globalScores[code]) return globalScores[code];
    const c = criteriaMap[code];
    if (!c) {
      return {
        points: null,
        response: 'NA',
        rawResponse: 'NA',
        normalizedValue: 'NA',
        isRoot: false,
        isDraft: true,
        criticalFail: false,
        isScored: false,
        isCritical: false,
        draftAvg: null,
        countScoredLinks: 0,
        rootSources: []
      };
    }
    if (resolving.has(code)) {
      console.warn('Circular dependency involving', code);
      return {
        points: null,
        response: 'NA',
        rawResponse: c.response,
        normalizedValue: 'NA',
        isRoot: c.isRoot || false,
        isDraft: true,
        criticalFail: false,
        isScored: false,
        isCritical: !!c.isCritical,
        draftAvg: null,
        countScoredLinks: 0,
        rootSources: []
      };
    }
    resolving.add(code);

    const { response, isRoot, links, severity, isCritical } = c;
    const rootSources = [];
    let points = null;
    let isScored = false;
    let isDraft = false;
    let criticalFail = false;
    let calcResponse = response;
    let sumLinked = 0;
    let countLinked = 0;

    if (response === 'NA' && !isRoot) {
      const res = {
        points: null,
        response: 'NA',
        rawResponse: response,
        normalizedValue: 'NA',
        isRoot: !!isRoot,
        isDraft: false,
        criticalFail: false,
        isScored: false,
        isCritical: !!isCritical,
        draftAvg: null,
        countScoredLinks: 0,
        rootSources: []
      };
      globalScores[code] = res;
      resolving.delete(code);
      return res;
    }

    const resForVeto = String(response ?? '').toUpperCase().trim();
    if (isCritical && (/^([A-Z]+_)?(PC|PARTIAL|SUBSTANTIAL)$/.test(resForVeto) || resForVeto.includes('PARTIAL'))) {
      calcResponse = 'NC';
    }
    const calcStr = String(calcResponse ?? '').toUpperCase().trim();
    if (isCritical && (/^([A-Z]+_)?(NC|NON|NON_COMPLIANT|NON-COMPLIANT|NOT_MET|FAIL)$/.test(calcStr) ||
        calcStr.includes('NON') || calcStr.includes('FAIL'))) {
      criticalFail = true;
    }

    if (links && links.length > 0) {
      let ncPcCount = 0;
      let anyChildCriticalFail = false;
      for (const linkCode of links) {
        const childRes = computeCriterion(linkCode);
        rootSources.push({
          code: linkCode,
          points: childRes.points,
          response: childRes.response,
          isScored: childRes.isScored,
          isCritical: childRes.isCritical
        });
        if (childRes.criticalFail || (childRes.isCritical && String(childRes.response).toUpperCase().includes('NC'))) {
          anyChildCriticalFail = true;
        }
        if (childRes.isDraft || !childRes.isScored) {
          isDraft = true;
        }
        if (childRes.isScored && childRes.points !== null) {
          countLinked++;
          sumLinked += childRes.points;
          const lRes = String(childRes.response ?? '').toUpperCase();
          const isC = (/^([A-Z]+_)?(C|FC|FULL|COMPLIANT)$/.test(lRes) && !lRes.includes('NON')) ||
                      (lRes.includes('COMPLIANT') && !lRes.includes('NON') && !lRes.includes('PARTIAL'));
          if (!isC) ncPcCount++;
        }
      }
      if (isRoot) isScored = !isDraft;
      if (countLinked > 0) {
        let finalPoints = sumLinked / countLinked;
        if (countLinked > 1 && ncPcCount > countLinked / 2) {
          const cThr = calculatePointsForLink('C', severity) ?? 80;
          const pcThr = calculatePointsForLink('PC', severity) ?? 55;
          if (ncPcCount > countLinked * 0.75) finalPoints = Math.min(finalPoints, pcThr - 1);
          else finalPoints = Math.min(finalPoints, cThr - 1);
        }
        if (!isDraft) points = finalPoints;
      }
      if (anyChildCriticalFail) {
        criticalFail = true;
        points = 0;
        isScored = true;
        isDraft = false;
      }
    } else {
      const p = calculatePointsForLink(calcResponse, severity);
      if (p !== null) {
        points = p;
        isScored = true;
      }
    }

    let displayRes = isScored ? calcResponse : 'NA';
    if (isScored && (isRoot || criticalFail)) {
      const cThr = calculatePointsForLink('C', severity);
      const pcThr = calculatePointsForLink('PC', severity);
      if (criticalFail) displayRes = 'NC';
      else if (isRoot && isDraft) displayRes = 'Pending';
      else if (points >= cThr) displayRes = 'C';
      else if (points >= pcThr) displayRes = 'PC';
      else displayRes = 'NC';
    } else if (isScored) {
      const d = String(displayRes ?? '').toUpperCase();
      if ((/^([A-Z]+_)?(C|FC|FULL|COMPLIANT)$/.test(d) && !d.includes('NON')) ||
          (d.includes('COMPLIANT') && !d.includes('NON') && !d.includes('PARTIAL'))) displayRes = 'C';
      else if (/^([A-Z]+_)?(PC|PARTIAL|SUBSTANTIAL)$/.test(d) || d.includes('PARTIAL')) displayRes = 'PC';
      else if (/^([A-Z]+_)?(NC|NON|NON_COMPLIANT|NON-COMPLIANT|NOT_MET|FAIL)$/.test(d) || d.includes('NON') || d.includes('FAIL')) displayRes = 'NC';
    }

    const result = {
      points: isScored && points !== null ? points : null,
      response: displayRes,
      rawResponse: response,
      normalizedValue: displayRes,
      isRoot: !!isRoot,
      isDraft,
      criticalFail,
      isScored,
      isCritical: !!isCritical,
      draftAvg: countLinked > 0 ? sumLinked / countLinked : null,
      countScoredLinks: countLinked,
      rootSources
    };

    globalScores[code] = result;
    resolving.delete(code);
    return result;
  };

  Object.keys(criteriaMap || {}).forEach(code => computeCriterion(code));
  return globalScores;
}

export function calculateSectionScore(standards) {
  if (!Array.isArray(standards) || standards.length === 0) {
    return { percent: 0, totalScore: 0, maxScore: 0, criticalFail: false };
  }
  let total = 0, max = 0, criticalFail = false;
  let percentSum = 0;
  let validCount = 0;
  for (const s of standards) {
    if (!s) continue;
    total += s.totalScore || 0;
    max   += s.maxScore || 0;
    if (s.percent !== undefined && s.percent !== null && !isNaN(s.percent)) {
      percentSum += s.percent;
      validCount += 1;
    }
    if (s.criticalFail) criticalFail = true;
  }
  let percent = validCount === 0 ? 0 : percentSum / validCount;
  if (criticalFail) { percent = 0; total = 0; }
  return { percent: parseFloat(percent.toFixed(2)), totalScore: total, maxScore: max, criticalFail };
}

export function calculateOverallScore(sections) {
  return calculateSectionScore(sections);
}
