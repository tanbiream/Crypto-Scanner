/* Crypto Scanner shared rulebook, version v1.
   Used by radar.html AND review.html so tests match what you see live.
   Changing any number here starts a NEW test period: commit it and use the new commit time as the rules start. */
var Rules = (function () {
  var CFG = {
    version: "v1.1.1"
    minUsd24: 50000,
    watchMinUsd24: 250000,
    pullbackMinUsd24: 500000,
    minRec5Usd: 10000,
    relFlag: 3,
    extMove15: 12,
    breakMargin: 0.005,
    watchRelLo: 1.5,
    watchRelHi: 3,
    watchMax15: 2,
    watchMax60: 4,
    watchRange60: 0.06,
    watchNear: 0.015,
    watchMinRec15Usd: 5000,
    warnMove1h: 12,
    warnFromOpen: 30,
    fibA: 0.382,
    fibB: 0.618,
    fibInv: 0.786,
    successPct: 5
  };
  var LABELS = ["Breakout", "Potential pump", "Extended up", "Breakdown", "Potential dump", "Extended down", "Volume up, price flat"];
  var DIR = { "Breakout": 1, "Potential pump": 1, "Extended up": 1, "Breakdown": -1, "Potential dump": -1, "Extended down": -1, "Volume up, price flat": 0 };

  function nameOf(k) {
    var legacy = /ZUSD$/.test(k);
    var n = k.replace(/ZUSD$/, "").replace(/USD$/, "");
    if (legacy && n.length === 4 && n.charAt(0) === "X") n = n.slice(1);
    if (n === "XBT") n = "BTC";
    if (n === "XDG") n = "DOGE";
    return n;
  }
  function ub(arr, x) {
    var lo = 0, hi = arr.length;
    while (lo < hi) { var m = (lo + hi) >> 1; if (arr[m] > x) hi = m; else lo = m + 1; }
    return lo;
  }
  function pxAt(o, target) {
    var i = ub(o.ts, target) - 1;
    if (i < 0) return null;
    return (target - o.ts[i] <= 180) ? o.px[i] : null;
  }
  function prepare(o) {
    var n = o.ts.length, P = new Float64Array(n + 1), M = new Float64Array(n + 1), Q = new Float64Array(n + 1), vmax, i;
    for (i = 1; i < n; i++) {
      var cur = o.vol[i];
      if (Math.floor(o.ts[i] / 86400) !== Math.floor(o.ts[i - 1] / 86400)) vmax = cur;
      var bv = (vmax === undefined) ? o.vol[i - 1] : vmax;
      var d = Math.max(0, cur - bv);
      if (vmax === undefined || cur > vmax) vmax = cur;
      P[i + 1] = P[i] + d * o.px[i];
      Q[i + 1] = Q[i] + d;
      M[i + 1] = M[i] + (o.ts[i] - o.ts[i - 1]) / 60;
    }
    o.P = P; o.M = M; o.Q = Q;
    return o;
  }

  function evaluate(o, i, firstTs) {
    var none = { ok: false };
    var t = o.ts[i], px = o.px[i], usd24 = o.v24[i] * px, j;
    if (t - firstTs < 2700 || !(usd24 >= CFG.minUsd24)) return none;
    var a = ub(o.ts, t - 300), b0 = ub(o.ts, t - 3900);
    var recU = o.P[i + 1] - o.P[a], recM = o.M[i + 1] - o.M[a];
    var baseU = o.P[a] - o.P[b0], baseM = o.M[a] - o.M[b0];
    if (!(baseM >= 30 && recM >= 3)) return none;

    var typical = usd24 / 1440;
    var recR = recM > 0 ? recU / recM : null;
    var baseR = baseM > 0 ? baseU / baseM : null;
    if (baseR !== null) baseR = Math.max(baseR, typical);
    var rel = (recR !== null && baseR !== null && baseR > 0) ? recR / baseR : null;

    var p5 = pxAt(o, t - 300), p15 = pxAt(o, t - 900), p60 = pxAt(o, t - 3600);
    var c5 = p5 ? (px / p5 - 1) * 100 : null;
    var c15 = p15 ? (px / p15 - 1) * 100 : null;
    var c60 = p60 ? (px / p60 - 1) * 100 : null;
    var fromOpen = o.open[i] > 0 ? (px / o.open[i] - 1) * 100 : null;

    var hi = null, lo = null;
    for (j = b0; j < a; j++) { var pj = o.px[j]; if (hi === null || pj > hi) hi = pj; if (lo === null || pj < lo) lo = pj; }

    var label = "", why = "", warn = "";
    if (rel !== null && recU >= CFG.minRec5Usd && c5 !== null && c15 !== null) {
      var rt = rel.toFixed(1) + "x normal volume";
      if (rel >= CFG.relFlag && Math.abs(c15) > CFG.extMove15) { label = c15 > 0 ? "Extended up" : "Extended down"; why = c15.toFixed(1) + "% in 15m on " + rt; }
      else if (hi !== null && px > hi * (1 + CFG.breakMargin) && rel >= CFG.relFlag) { label = "Breakout"; why = ((px / hi - 1) * 100).toFixed(1) + "% above 1h high, " + rt; }
      else if (lo !== null && px < lo * (1 - CFG.breakMargin) && rel >= CFG.relFlag) { label = "Breakdown"; why = ((1 - px / lo) * 100).toFixed(1) + "% below 1h low, " + rt; }
      else if (rel >= CFG.relFlag && c15 >= 1 && c5 > 0) { label = "Potential pump"; why = rt + ", up " + c15.toFixed(1) + "% in 15m"; }
      else if (rel >= CFG.relFlag && c15 <= -1 && c5 < 0) { label = "Potential dump"; why = rt + ", down " + Math.abs(c15).toFixed(1) + "% in 15m"; }
      else if (rel >= CFG.relFlag && Math.abs(c15) < 1 && recU >= 50000) { label = "Volume up, price flat"; why = rt + ", price barely moved"; }
    }
    if (c60 !== null && Math.abs(c60) >= CFG.warnMove1h) warn = "Moved " + c60.toFixed(0) + "% in 1h: do not chase";
    else if (fromOpen !== null && fromOpen >= CFG.warnFromOpen) warn = "Up " + fromOpen.toFixed(0) + "% today: do not chase";

    // Watch tier (before a move)
    var watch = "", watchWhy = "", rel15 = null;
    var a15 = ub(o.ts, t - 900), b60 = ub(o.ts, t - 4500);
    var r15U = o.P[i + 1] - o.P[a15], r15M = o.M[i + 1] - o.M[a15];
    var b60U = o.P[a15] - o.P[b60], b60M = o.M[a15] - o.M[b60];
    if (r15M >= 8 && b60M >= 30) {
      var br = Math.max(b60U / b60M, typical);
      if (br > 0) rel15 = (r15U / r15M) / br;
    }
    if (label === "" && usd24 >= CFG.watchMinUsd24 && rel15 !== null && r15U >= CFG.watchMinRec15Usd &&
        rel15 >= CFG.watchRelLo && rel15 < CFG.watchRelHi && c15 !== null && c60 !== null &&
        Math.abs(c15) < CFG.watchMax15 && Math.abs(c60) < CFG.watchMax60) {
      var h60 = px, l60 = px, s60 = ub(o.ts, t - 3600);
      for (j = s60; j <= i; j++) { var q = o.px[j]; if (q > h60) h60 = q; if (q < l60) l60 = q; }
      var rng = (h60 - l60) / px;
      if (rng <= CFG.watchRange60) {
        var nHi = px >= h60 * (1 - CFG.watchNear), nLo = px <= l60 * (1 + CFG.watchNear);
        var base = rel15.toFixed(1) + "x volume (15m), 1h range " + (rng * 100).toFixed(1) + "%";
        if (nHi && !nLo) { watch = "up"; watchWhy = base + ", pressing the 1h high"; }
        else if (nLo && !nHi) { watch = "down"; watchWhy = base + ", pressing the 1h low"; }
      }
    }

    // Pullback guide for coins that already moved
    var lv = null;
        if ((warn !== "" || label === "Extended up" || label === "Extended down") && usd24 >= CFG.pullbackMinUsd24) {
      var s3 = ub(o.ts, t - 10800), h3 = px, l3 = px;
      for (j = s3; j <= i; j++) { var v = o.px[j]; if (v > h3) h3 = v; if (v < l3) l3 = v; }
      var up = label === "Extended up" || (c60 !== null && c60 >= CFG.warnMove1h) ||
               (fromOpen !== null && fromOpen >= CFG.warnFromOpen && !(c60 !== null && c60 <= -CFG.warnMove1h));
      var high = h3, low = l3;
      if (up && fromOpen !== null && fromOpen >= CFG.warnFromOpen && o.open[i] > 0 && o.open[i] < low) low = o.open[i];
      if (high > low) {
        var range = high - low;
        var retr = up ? (high - px) / range : (px - low) / range;
        var z1 = up ? high - CFG.fibA * range : low + CFG.fibA * range;
        var z2 = up ? high - CFG.fibB * range : low + CFG.fibB * range;
        var inv = up ? high - CFG.fibInv * range : low + CFG.fibInv * range;
        var mid = up ? high - 0.5 * range : low + 0.5 * range;
        var dq = o.Q[i + 1] - o.Q[s3];
        var vwap = dq > 0 ? (o.P[i + 1] - o.P[s3]) / dq : null;
        var status = retr < CFG.fibA ? "waiting" : retr <= CFG.fibB ? "in zone" : retr <= CFG.fibInv ? "deep" : "invalid";
        lv = { up: up, high: high, low: low, z1: z1, z2: z2, mid: mid, inv: inv, vwap: vwap, retr: retr, status: status };
      }
    }
    return { ok: true, t: t, px: px, usd24: usd24, rel: rel, rel15: rel15, recU: recU, c5: c5, c15: c15, c60: c60,
             fromOpen: fromOpen, label: label, why: why, warn: warn, watch: watch, watchWhy: watchWhy, lv: lv };
  }

  return { CFG: CFG, LABELS: LABELS, DIR: DIR, nameOf: nameOf, ub: ub, pxAt: pxAt, prepare: prepare, evaluate: evaluate };
})();
