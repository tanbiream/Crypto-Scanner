/* Futures scoreboard rules, version f2 (frozen at commit time).
   Changing any number here starts a NEW test period. */
var FRules = (function () {
  var CFG = {
    version: "f2", quietSec: 300, minTrades1h: 10, leanScore: 60, leanGap: 25,
    extMult: 3, pen1h: 10, pen3h: 10, pen24h: 5,
    minGapSigma: 0.25, structTolSigma: 0.25,
    costPct: 0.5, minRiskMult: 2, riskMaxPct: 4, atrMult: 2.5
  };

  function ema(a, n) {
    if (a.length < n) return null;
    var k = 2 / (n + 1), e = 0, i;
    for (i = 0; i < n; i++) e += a[i];
    e /= n;
    for (i = n; i < a.length; i++) e = a[i] * k + e * (1 - k);
    return e;
  }
  function emaSeries(a, n) {
    var out = new Array(a.length).fill(null);
    if (a.length < n) return out;
    var k = 2 / (n + 1), e = 0, i;
    for (i = 0; i < n; i++) e += a[i];
    e /= n; out[n - 1] = e;
    for (i = n; i < a.length; i++) { e = a[i] * k + e * (1 - k); out[i] = e; }
    return out;
  }
  function rsi(a, n) {
    if (a.length < n + 1) return null;
    var g = 0, l = 0, i, d;
    for (i = 1; i <= n; i++) { d = a[i] - a[i - 1]; if (d >= 0) g += d; else l -= d; }
    g /= n; l /= n;
    for (i = n + 1; i < a.length; i++) {
      d = a[i] - a[i - 1];
      g = (g * (n - 1) + (d > 0 ? d : 0)) / n;
      l = (l * (n - 1) + (d < 0 ? -d : 0)) / n;
    }
    if (g === 0 && l === 0) return null;
    return l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  function macdHist(a) {
    if (a.length < 35) return null;
    var e12 = emaSeries(a, 12), e26 = emaSeries(a, 26), macd = [], i;
    for (i = 25; i < a.length; i++) macd.push(e12[i] - e26[i]);
    var sig = emaSeries(macd, 9), n = macd.length;
    if (sig[n - 1] === null || sig[n - 2] === null) return null;
    return { h: macd[n - 1] - sig[n - 1], hPrev: macd[n - 2] - sig[n - 2] };
  }
  function closesFor(o, i, tf, maxBars) {
    var step = tf * 60, out = [], j;
    for (j = i; j >= 0 && out.length < maxBars; j--) { if (o.ts[j] % step === 0) out.push(o.px[j]); }
    out.reverse();
    if (o.ts[i] % step !== 0) out.push(o.px[i]);
    return out;
  }
  function robustSigma(rets) {
    var a = rets.map(Math.abs).sort(function (x, y) { return x - y; });
    if (!a.length) return 0;
    var med = a[Math.floor(a.length / 2)];
    if (med > 0) return med * 1.4826;
    var s = 0; a.forEach(function (v) { s += v; });
    return 1.25 * s / a.length;
  }
  function tfState(c, px, sigmaPct) {
    var e9 = ema(c, 9), e20 = ema(c, 20);
    if (e9 === null || e20 === null) return null;
    var e50 = ema(c, 50), s = 0;
    var size = sigmaPct > 0 ? Math.abs((e9 - e20) / px * 100) / sigmaPct : 0;
    if (px > e20 && e9 > e20 && size >= CFG.minGapSigma) s = 1;
    else if (px < e20 && e9 < e20 && size >= CFG.minGapSigma) s = -1;
    return { s: s, e9: e9, e20: e20, e50: e50, size: size };
  }
  function trades1h(o, i) {
    var t = o.ts[i], seen = {}, n = 0, j;
    for (j = i; j >= 0 && o.ts[j] >= t - 3600; j--) { var x = o.tt[j]; if (x > 0 && !seen[x]) { seen[x] = 1; n++; } }
    return n;
  }
  function pxAt(o, i, target) {
    for (var j = i; j >= 0; j--) { if (o.ts[j] <= target) return (target - o.ts[j] <= 180) ? o.px[j] : null; }
    return null;
  }
  function sgn(x) { return (x >= 0 ? "+" : "") + x.toFixed(2); }

  function score(o, i) {
    var t = o.ts[i], px = o.px[i], tr = trades1h(o, i);
    var out = { ok: false, trades: tr, px: px, t: t };
    if (tr < CFG.minTrades1h) { out.reason = "thin (" + tr + " trades seen in 1h)"; return out; }
    if (!(o.tt[i] > 0) || (t - o.tt[i]) > CFG.quietSec) { out.reason = "quiet (no trade in the last 5 minutes)"; return out; }
    var c5 = closesFor(o, i, 5, 60), c15 = closesFor(o, i, 15, 40), c60 = closesFor(o, i, 60, 30);
    if (c5.length < 35) { out.reason = "warming up (needs about 3 hours of history)"; return out; }

    var rets = [], k;
    for (k = 1; k < c5.length; k++) rets.push((c5[k] / c5[k - 1] - 1) * 100);
    var sigma5 = robustSigma(rets);
    if (!(sigma5 > 0)) { out.reason = "flat price (no movement)"; return out; }
    var s5 = tfState(c5, px, sigma5), s15 = tfState(c15, px, sigma5 * Math.sqrt(3)), s60 = tfState(c60, px, sigma5 * Math.sqrt(12));
    if (!s5) { out.reason = "warming up (needs about 3 hours of history)"; return out; }

    var rsiVal = rsi(c5, 14), mac = macdHist(c5);
    var p60 = pxAt(o, i, t - 3600), p3 = pxAt(o, i, t - 10800);
    var ch60 = p60 ? (px / p60 - 1) * 100 : null, ch3 = p3 ? (px / p3 - 1) * 100 : null;
    var span = t - o.ts[0], ch24 = null, mins24 = span / 60;
    if (span >= 72000) ch24 = (px / o.px[0] - 1) * 100;
    function extOf(ch, mins) {
      if (ch === null) return 0;
      var th = CFG.extMult * sigma5 * Math.sqrt(mins / 5);
      return ch > th ? 1 : ch < -th ? -1 : 0;
    }
    var e1 = extOf(ch60, 60), e3 = extOf(ch3, 180), e24 = extOf(ch24, mins24);

    var n5 = c5.length, last = c5.slice(n5 - 12), prior = c5.slice(n5 - 24, n5 - 12);
    var mxL = Math.max.apply(null, last), mnL = Math.min.apply(null, last);
    var mxP = Math.max.apply(null, prior), mnP = Math.min.apply(null, prior);
    var tol = CFG.structTolSigma * sigma5 / 100 * px;
    var hh = mxL > mxP + tol, hl = mnL > mnP + tol, lh = mxL < mxP - tol, ll = mnL < mnP - tol;

    function side(dir) {
      var why = [], trend = 0, mtf = 0, mom = 0, st = 0, pen = 0, s = s5.s * dir;
      if (s === 1) {
        var sz = s5.size, base = sz >= 1.5 ? 24 : sz >= 0.75 ? 20 : sz >= 0.4 ? 15 : 10;
        var e50ok = s5.e50 !== null && (dir === 1 ? s5.e20 > s5.e50 : s5.e20 < s5.e50);
        trend = Math.min(30, base + (e50ok ? 6 : 0));
        why.push("5m trend " + (dir === 1 ? "up" : "down") + " (strength " + sz.toFixed(1) + (e50ok ? ", EMA 9/20/50 aligned" : "") + ")");
      } else if (s === 0) { trend = 6; why.push("5m trend too small or mixed"); }
      else { trend = 0; why.push("5m trend against"); }
      var cnt = 0, names = [];
      [[s5, "5m"], [s15, "15m"], [s60, "1h"]].forEach(function (p) { if (p[0] && p[0].s * dir === 1) { cnt++; names.push(p[1]); } });
      mtf = cnt === 3 ? 25 : cnt === 2 ? 15 : cnt === 1 ? 6 : 0;
      why.push(cnt + " of 3 timeframes agree" + (names.length ? " (" + names.join(", ") + ")" : ""));
      var mp = 0, mc = 0;
      if (rsiVal !== null) { var x = dir === 1 ? rsiVal : 100 - rsiVal; mp = x < 45 ? 0 : x < 50 ? 5 : x < 60 ? 15 : x < 70 ? 20 : 12; }
      if (mac) { var h = mac.h * dir, hp = mac.hPrev * dir; if (h > 0) { mc = 3; if (h > hp) mc = 5; } }
      mom = mp + mc;
      why.push("RSI " + (rsiVal === null ? "n/a" : rsiVal.toFixed(0)) + (mac ? ", MACD " + (mac.h * dir > 0 ? "supportive" : "against") : ""));
      var good = dir === 1 ? (hh && hl) : (ll && lh), half = dir === 1 ? (hh || hl) : (ll || lh);
      st = good ? 20 : half ? 10 : 0;
      if (good) why.push(dir === 1 ? "higher highs and higher lows (2h)" : "lower highs and lower lows (2h)");
      if (e1 === dir) { pen += CFG.pen1h; why.push("already moved " + sgn(ch60) + "% in 1h (over 3x normal): chasing risk"); }
      if (e3 === dir) { pen += CFG.pen3h; why.push("already moved " + sgn(ch3) + "% in 3h (over 3x normal): chasing risk"); }
      if (e24 === dir) { pen += CFG.pen24h; why.push("already moved " + sgn(ch24) + "% over the loaded history: chasing risk"); }
      return { score: Math.round(Math.max(0, Math.min(100, trend + mtf + mom + st - pen))), why: why, pen: pen };
    }
    var L = side(1), S = side(-1), bias = "none";
    if (L.score >= CFG.leanScore && L.score - S.score >= CFG.leanGap) bias = "long";
    else if (S.score >= CFG.leanScore && S.score - L.score >= CFG.leanGap) bias = "short";

    var lv = null, lvNote = "";
    if (bias !== "none") {
      var dir = bias === "long" ? 1 : -1, sd = dir === 1 ? L : S;
      if (sd.pen > 0) lvNote = "no levels: move already extended (chasing risk)";
      else {
        var m = Math.min(14, c5.length - 1), atr = 0;
        for (k = c5.length - m; k < c5.length; k++) atr += Math.abs(c5[k] - c5[k - 1]);
        atr /= m;
        var swing = dir === 1 ? mnL : mxL, atrInv = px - dir * CFG.atrMult * atr;
        var inv = dir === 1 ? Math.min(swing, atrInv) : Math.max(swing, atrInv);
        var risk = Math.abs(px - inv) / px * 100, minRisk = CFG.minRiskMult * CFG.costPct;
        if (risk < minRisk) lvNote = "no levels: stop only " + risk.toFixed(2) + "% away, under " + minRisk.toFixed(1) + "% (2x assumed " + CFG.costPct + "% cost)";
        else if (risk > CFG.riskMaxPct) lvNote = "no levels: stop " + risk.toFixed(2) + "% away, too wide";
        else {
          var r1 = px * risk / 100;
          lv = { inv: inv, riskPct: risk, t1: px + dir * r1, t2: px + dir * 2 * r1, t3: px + dir * 3 * r1, pull: s5.e20 };
        }
      }
    }
    return { ok: true, trades: tr, px: px, t: t, long: L, short: S, bias: bias, lv: lv, lvNote: lvNote,
             m5: s5.s, m15: s15 ? s15.s : null, m60: s60 ? s60.s : null, rsi: rsiVal, ch60: ch60, ch3: ch3 };
  }
  return { CFG: CFG, score: score };
})();
