/* Futures scoreboard rules, version f1 (frozen at commit time).
   Changing any number here starts a NEW test period. */
var FRules = (function () {
  var CFG = { version: "f1", quietSec: 300, minTrades1h: 10, leanScore: 60, leanGap: 25,
              extMult: 3, extPenalty: 10, riskMinPct: 0.15, riskMaxPct: 3 };

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
  function tfState(c, px) {
    var e9 = ema(c, 9), e20 = ema(c, 20);
    if (e9 === null || e20 === null) return null;
    var e50 = ema(c, 50), s = 0;
    if (px > e20 && e9 > e20) s = 1; else if (px < e20 && e9 < e20) s = -1;
    return { s: s, e9: e9, e20: e20, e50: e50 };
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

  function score(o, i) {
    var t = o.ts[i], px = o.px[i], tr = trades1h(o, i);
    var out = { ok: false, trades: tr, px: px, t: t };
    if (tr < CFG.minTrades1h) { out.reason = "thin (" + tr + " trades seen in 1h)"; return out; }
    if (!(o.tt[i] > 0) || (t - o.tt[i]) > CFG.quietSec) { out.reason = "quiet (no trade in the last 5 minutes)"; return out; }
    var c5 = closesFor(o, i, 5, 60), c15 = closesFor(o, i, 15, 40), c60 = closesFor(o, i, 60, 30);
    var s5 = tfState(c5, px), s15 = tfState(c15, px), s60 = tfState(c60, px);
    if (!s5 || c5.length < 35) { out.reason = "warming up (needs about 3 hours of history)"; return out; }

    var rets = [], k, ss = 0;
    for (k = 1; k < c5.length; k++) rets.push((c5[k] / c5[k - 1] - 1) * 100);
    rets.forEach(function (x) { ss += x * x; });
    var sigma5 = Math.sqrt(ss / rets.length);
    if (!(sigma5 > 0)) { out.reason = "flat price (no movement)"; return out; }

    var rsiVal = rsi(c5, 14), mac = macdHist(c5);
    var p60 = pxAt(o, i, t - 3600), ch60 = p60 ? (px / p60 - 1) * 100 : null;
    var sig1h = sigma5 * Math.sqrt(12);
    var extUp = ch60 !== null && ch60 > CFG.extMult * sig1h;
    var extDn = ch60 !== null && ch60 < -CFG.extMult * sig1h;

    var n5 = c5.length, last = c5.slice(n5 - 12), prior = c5.slice(n5 - 24, n5 - 12);
    var mxL = Math.max.apply(null, last), mnL = Math.min.apply(null, last);
    var mxP = Math.max.apply(null, prior), mnP = Math.min.apply(null, prior);
    var hh = mxL > mxP, hl = mnL > mnP, lh = mxL < mxP, ll = mnL < mnP;

    function side(dir) {
      var why = [], trend = 0, mtf = 0, mom = 0, st = 0, pen = 0, s = s5.s * dir;
      if (s === 1) {
        var e50ok = s5.e50 !== null && (dir === 1 ? s5.e20 > s5.e50 : s5.e20 < s5.e50);
        trend = e50ok ? 30 : 22;
        why.push("5m trend " + (dir === 1 ? "up" : "down") + (e50ok ? " (EMA 9/20/50 aligned)" : ""));
      } else if (s === 0) { trend = 8; why.push("5m trend mixed"); }
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
      var ext = dir === 1 ? extUp : extDn;
      if (ext) { pen = CFG.extPenalty; why.push("already moved " + ch60.toFixed(2) + "% in 1h (over " + CFG.extMult + "x normal): chasing risk"); }
      return { score: Math.round(Math.max(0, Math.min(100, trend + mtf + mom + st - pen))), why: why, ext: ext };
    }
    var L = side(1), S = side(-1), bias = "none";
    if (L.score >= CFG.leanScore && L.score - S.score >= CFG.leanGap) bias = "long";
    else if (S.score >= CFG.leanScore && S.score - L.score >= CFG.leanGap) bias = "short";

    var lv = null;
    if (bias !== "none") {
      var dir = bias === "long" ? 1 : -1, sd = dir === 1 ? L : S;
      if (!sd.ext) {
        var inv = dir === 1 ? mnL : mxL, risk = Math.abs(px - inv) / px * 100;
        if (risk >= CFG.riskMinPct && risk <= CFG.riskMaxPct && ((dir === 1 && inv < px) || (dir === -1 && inv > px))) {
          var r1 = px * risk / 100;
          lv = { inv: inv, riskPct: risk, t1: px + dir * r1, t2: px + dir * 2 * r1, t3: px + dir * 3 * r1, pull: s5.e20 };
        }
      }
    }
    return { ok: true, trades: tr, px: px, t: t, long: L, short: S, bias: bias, lv: lv,
             m5: s5.s, m15: s15 ? s15.s : null, m60: s60 ? s60.s : null, rsi: rsiVal, ch60: ch60 };
  }
  return { CFG: CFG, score: score };
})();
