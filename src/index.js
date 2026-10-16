/* CPU負荷軽減版 7.1.1
 * 予想式・過去学習対象・保存済み予想は変更しません。
 * 学習計算: 同一実行環境・同一DB・同一日付で最大60秒再利用。
 * 未保存プレビュー: 最大30秒再利用。保存済み予想と締切判定を優先。
 * 初回処理の無料CPU上限内動作は本番で検証が必要です。
 * ASSETS未設定時は明確な503応答。静的画面ファイル自体はこのコードに含まれません。
 * 元のASSETS/DB/Secrets/Cron設定を保持して反映してください。
 */
var __defProp = Object.defineProperty;
var __name = (target, value2) => __defProp(target, "name", { value: value2, configurable: true });

// src/common.mjs
var OFFICIAL = "https://www.boatrace.jp";
var WORKER_VERSION = "7.1.15-notification-badges";
var AI_VERSION = "6.7.6";
var AUTO_MIN_MINUTES = 0;
var AUTO_MAX_MINUTES = Number.POSITIVE_INFINITY;
var AUTO_BATCH_SIZE = 6;
var LINE_FINAL_MAX_MINUTES = 35;
function manshuThreshold(env) {
  const n = Number(env.MANSHU_NOTIFY_MIN_PERCENT ?? 15);
  return Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 15;
}
__name(manshuThreshold, "manshuThreshold");
function isManshuHigh(pick, env) {
  return Number.isFinite(pick.manshuProbability) && pick.manshuProbability * 100 >= manshuThreshold(env);
}
__name(isManshuHigh, "isManshuHigh");
var LINE_EARLY_NOTIFICATIONS_ENABLED = false;
var WEB_PUSH_S_BET_ENABLED = true;
var WEB_PUSH_FINAL_MAX_MINUTES = 35;
var WEB_PUSH_CONTACT = "https://aged-hill-9a89.kono032424.workers.dev/";
function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, (key, value) => key === "balance" ? undefined : value),
    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    }
  );
}
__name(json, "json");
function getBearerToken(request) {
  const auth = request.headers.get(
    "authorization"
  ) || "";
  if (auth.toLowerCase().startsWith(
    "bearer "
  )) {
    return auth.slice(7).trim();
  }
  return "";
}
__name(getBearerToken, "getBearerToken");
function checkPrivateAccess(request, env) {
  if (!env.D1_WRITE_TOKEN) {
    return json(
      {
        ok: false,
        error: "D1_WRITE_TOKEN \u304CCloudflare\u306B\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093"
      },
      503
    );
  }
  const token = getBearerToken(
    request
  );
  if (!token || token !== env.D1_WRITE_TOKEN) {
    return json(
      {
        ok: false,
        error: "\u8A8D\u8A3C\u306B\u5931\u6557\u3057\u307E\u3057\u305F"
      },
      401
    );
  }
  return null;
}
__name(checkPrivateAccess, "checkPrivateAccess");
function decodeHtml(text = "") {
  return text.replace(
    /&nbsp;/gi,
    " "
  ).replace(
    /&amp;/gi,
    "&"
  ).replace(
    /&quot;/gi,
    '"'
  ).replace(
    /&#39;/gi,
    "'"
  ).replace(
    /&yen;/gi,
    "\xA5"
  ).replace(
    /&#165;/gi,
    "\xA5"
  ).replace(
    /&lt;/gi,
    "<"
  ).replace(
    /&gt;/gi,
    ">"
  );
}
__name(decodeHtml, "decodeHtml");
function stripHtml(html = "") {
  return decodeHtml(
    html
  ).replace(
    /<script[\s\S]*?<\/script>/gi,
    " "
  ).replace(
    /<style[\s\S]*?<\/style>/gi,
    " "
  ).replace(
    /<br\s*\/?>/gi,
    " "
  ).replace(
    /<\/(?:p|div|tr|li|td|th|a|span)>/gi,
    " "
  ).replace(
    /<[^>]+>/g,
    " "
  ).replace(
    /\s+/g,
    " "
  ).trim();
}
__name(stripHtml, "stripHtml");
async function officialFetch(path, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(OFFICIAL + path, {
      signal: controller.signal,
      headers: {
        "user-agent": `Mozilla/5.0 (compatible; BoatRacingAI/${WORKER_VERSION})`,
        accept: "text/html,application/xhtml+xml"
      }
    });
    if (!response.ok) throw new Error(`BOAT RACE\u53D6\u5F97\u30A8\u30E9\u30FC HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    if (error.name === "AbortError") throw new Error("\u516C\u5F0F\u30C7\u30FC\u30BF\u53D6\u5F97\u304C\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F\u3002\u6B21\u56DE\u518D\u8A66\u884C\u3057\u307E\u3059");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
__name(officialFetch, "officialFetch");
var todayJSTFormatter = new Intl.DateTimeFormat(
    "ja-JP",
    {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  );
function todayJST() {
  return todayJSTFormatter.format(
    /* @__PURE__ */ new Date()
  ).replaceAll(
    "/",
    ""
  );
}
__name(todayJST, "todayJST");
var nowJSTFormatter = new Intl.DateTimeFormat(
    "sv-SE",
    {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }
  );
function nowJST() {
  return nowJSTFormatter.format(
    /* @__PURE__ */ new Date()
  ).replace(
    " ",
    "T"
  ) + "+09:00";
}
__name(nowJST, "nowJST");
function deadlineIsoJST(hd, time) {
  if (!/^\d{8}$/.test(
    String(
      hd || ""
    )
  )) {
    return null;
  }
  if (!/^\d{1,2}:\d{2}$/.test(
    String(
      time || ""
    )
  )) {
    return null;
  }
  const yyyy = hd.slice(
    0,
    4
  );
  const mm = hd.slice(
    4,
    6
  );
  const dd = hd.slice(
    6,
    8
  );
  const [
    h,
    m
  ] = time.split(
    ":"
  );
  return `${yyyy}-${mm}-${dd}T${String(h).padStart(2, "0")}:${m}:00+09:00`;
}
__name(deadlineIsoJST, "deadlineIsoJST");
function safeNumber(v) {
  if (v === null || v === void 0 || v === "") {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(
    n
  ) ? n : null;
}
__name(safeNumber, "safeNumber");
function value(v) {
  if (v === void 0 || v === null || v === "-") {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(
    n
  ) ? n : null;
}
__name(value, "value");
function clamp(v, min, max) {
  return Math.max(
    min,
    Math.min(
      max,
      v
    )
  );
}
__name(clamp, "clamp");
function norm(v, low, high) {
  if (high <= low) {
    return 0.5;
  }
  return clamp(
    (v - low) / (high - low),
    0,
    1
  );
}
__name(norm, "norm");
function makeRaceKey(raceDate, jcd, rno) {
  return `${String(raceDate)}-${String(jcd).padStart(2, "0")}-${Number(rno)}`;
}
__name(makeRaceKey, "makeRaceKey");
function toJsonText(v) {
  if (v === void 0 || v === null) {
    return null;
  }
  return typeof v === "string" ? v : JSON.stringify(v);
}
__name(toJsonText, "toJsonText");
function parseJsonSafe(text, fallback = null) {
  if (text === null || text === void 0 || text === "") {
    return fallback;
  }
  if (typeof text !== "string") {
    return text;
  }
  try {
    return JSON.parse(
      text
    );
  } catch {
    return fallback;
  }
}
__name(parseJsonSafe, "parseJsonSafe");
async function readBody(request) {
  try {
    return await request.json();
  } catch {
    throw new Error(
      "JSON\u5F62\u5F0F\u306E\u30C7\u30FC\u30BF\u3092\u9001\u4FE1\u3057\u3066\u304F\u3060\u3055\u3044"
    );
  }
}
__name(readBody, "readBody");
function fixedBetAmounts(bets, unit = 1e3, limit = Infinity) {
  const seen = /* @__PURE__ */ new Set(), picks = [];
  for (const b of Array.isArray(bets) ? bets.slice(0, limit) : []) {
    const c = b?.combination;
    if (typeof c !== "string" || !/^[1-6]-[1-6]-[1-6]$/.test(c) || new Set(c.split("-")).size !== 3 || seen.has(c)) return [];
    seen.add(c);
    picks.push({ ...b, amount: unit });
  }
  return picks;
}
__name(fixedBetAmounts, "fixedBetAmounts");
function sBetBudget(bets) {
  return fixedBetAmounts(bets, 1e3, 6);
}
__name(sBetBudget, "sBetBudget");
function isLineEligible(pick, env) {
  return !pick.preliminary && pick.confidence === "S" && (pick.decision === "BET" || pick.decision === "PASS" && isManshuHigh(pick, env));
}
__name(isLineEligible, "isLineEligible");
function mainSixMetrics(bets) {
  const picks = sBetBudget(bets), base = { count: picks.length, unit: 1e3, stake: picks.length * 1e3, hitProbability: null, estimatedRecoveryRate: null, breakEvenProbability: null };
  if (picks.length !== 6 || picks.some((b) => typeof b.probability !== "number" || !Number.isFinite(b.probability) || b.probability < 0 || b.probability > 1)) return base;
  const hit = picks.reduce((n, b) => n + b.probability, 0);
  if (hit > 1 + 1e-9) return base;
  base.hitProbability = Math.min(1, hit);
  if (picks.some((b) => b.odds == null || b.odds === "" || !Number.isFinite(Number(b.odds)) || Number(b.odds) <= 0)) return base;
  base.estimatedRecoveryRate = picks.reduce((n, b) => n + b.probability * Number(b.odds), 0) / 6 * 100;
  base.breakEvenProbability = picks.filter((b) => Number(b.odds) * 1e3 >= 6e3).reduce((n, b) => n + b.probability, 0);
  return base;
}
__name(mainSixMetrics, "mainSixMetrics");

// src/result-view.mjs
var validCombo = /* @__PURE__ */ __name((value2) => typeof value2 === "string" && /^[1-6]-[1-6]-[1-6]$/.test(value2) && new Set(value2.split("-")).size === 3, "validCombo");
function savedResultView(snapshot, result, env = {}) {
  const winning = String(result?.combination || (Array.isArray(result?.winningLanes) ? result.winningLanes.slice(0, 3).join("-") : ""));
  const finished = result?.finished === true && validCombo(winning);
  const verdict = /* @__PURE__ */ __name((bets, unit = 1e3) => {
    const selections = Array.isArray(bets) ? [...new Set(bets.map((b) => b?.combination).filter(validCombo))] : [];
    const uniqueProbabilities = selections.map(combo => {
      const matches = bets.filter(b => b?.combination === combo);
      const ps = matches.map(b => b.probability);
      return ps.every(p => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1 && p === ps[0]) ? ps[0] : null;
    });
    const probabilitySum = uniqueProbabilities.reduce((sum,p) => sum + (p ?? 0), 0);
    const estimatedHitProbability = selections.length && uniqueProbabilities.every(p => p !== null) && probabilitySum <= 1 + 1e-9 ? Math.min(1, probabilitySum) : null;
    const stake2 = selections.length * unit;
    const returns2 = finished && Number.isFinite(Number(result?.payout ?? result?.payoutPer100)) && Number(result?.payout ?? result?.payoutPer100) > 0 ? selections.includes(winning) ? Number(result?.payout ?? result?.payoutPer100) * unit / 100 : 0 : null;
    return { estimatedHitProbability, unit, stake: stake2, returns: returns2, profit: returns2 == null ? null : returns2 - stake2, selections, winningCombination: finished && selections.includes(winning) ? winning : null, count: selections.length, status: !selections.length ? "unavailable" : !finished ? "pending" : selections.includes(winning) ? "hit" : "miss" };
  }, "verdict");
  const paid = result?.payout ?? result?.payoutPer100;
  const eligible = !snapshot.preliminary && (snapshot.confidence === "S" && snapshot.sDecision?.status === "BET" || isManshuHigh({ manshuProbability: snapshot.manshu?.probability }, env));
  const budgetPicks = eligible ? sBetBudget(snapshot.bets) : [];
  const holePicks = eligible ? fixedBetAmounts(snapshot.holeBets, 1000) : [];
  const allPicks = [...budgetPicks, ...holePicks];
  const stake = allPicks.reduce((sum, b) => sum + b.amount, 0);
  const returns = stake > 0 && finished && paid != null && paid !== "" && Number.isFinite(Number(paid)) && Number(paid) > 0 ? Number(paid) * allPicks.filter((b) => b.combination === winning).reduce((sum, b) => sum + b.amount, 0) / 100 : null;
  const modes = {
    main6: verdict(snapshot.bets?.slice(0, 6)),
    main10: verdict(snapshot.bets?.slice(0, 10)),
    main15: verdict(snapshot.bets?.slice(0, 15)),
    hole: verdict(snapshot.holeBets, 1000),
    hit: verdict(snapshot.purposePicks?.hit),
    high: verdict(snapshot.purposePicks?.high),
    scenario: verdict(snapshot.scenarioAnalysis?.bets),
    scenarioIndependent: verdict(snapshot.scenarioAnalysis?.independent?.bets),
    scenarioLegacy: verdict(snapshot.scenarioAnalysis?.comparison?.legacyBets)
  };
  return {
    scenarioComparisonEligible: snapshot.finalized === true && !snapshot.preliminary && snapshot.scenarioAnalysis?.version === '1.2.0' && snapshot.scenarioAnalysis?.comparison?.selection === 'learned-probability-top6' && [snapshot.createdAt, snapshot.scenarioAnalysis?.generatedAt, snapshot.scenarioAnalysis?.savedAt].every(t => Number.isFinite(Date.parse(t || '')) && Number.isFinite(Date.parse(snapshot.deadlineJST || '')) && Date.parse(t) < Date.parse(snapshot.deadlineJST)),
    independentScenarioEligible: independentScenarioEligible(snapshot),
    independentScenarioModel: snapshot.scenarioAnalysis?.independent ? {version:snapshot.scenarioAnalysis.independent.version, trainingRaces:snapshot.scenarioAnalysis.independent.trainingRaces, active:snapshot.scenarioAnalysis.independent.active, reason:snapshot.scenarioAnalysis.independent.reason} : null,
    scenarioVersion: snapshot.scenarioAnalysis?.version || null,
    scenarioSelection: snapshot.scenarioAnalysis?.comparison?.selection || null,
    main6Metrics: mainSixMetrics(snapshot.bets),
    finished,
    combination: finished ? winning : null,
    payout: finished && paid != null && paid !== "" && Number.isFinite(Number(paid)) && Number(paid) > 0 ? Number(paid) : null,
    budget: { status: !eligible ? "excluded" : budgetPicks.length ? "ready" : "unavailable", picks: allPicks, stake, returns, profit: returns == null ? null : returns - stake },
    preliminary: Boolean(snapshot.preliminary),
    modes,
    baseline: modes.main6,
    scenario: modes.scenario
  };
}
__name(savedResultView, "savedResultView");

// src/scenario.mjs
var SCENARIO_VERSION = "1.2.0";
var bounded = /* @__PURE__ */ __name((v, a = 0, b = 100) => Math.max(a, Math.min(b, v)), "bounded");
var numeric = /* @__PURE__ */ __name((v, a, b) => v !== null && v !== void 0 && v !== "" && Number.isFinite(Number(v)) && Number(v) >= a && Number(v) <= b ? Number(v) : null, "numeric");
var scaled = /* @__PURE__ */ __name((n, a, b) => n === null ? null : bounded((n - a) / (b - a) * 100), "scaled");
var average = /* @__PURE__ */ __name((values) => {
  const x = values.filter((v) => v !== null);
  return x.length ? x.reduce((s, v) => s + v, 0) / x.length : null;
}, "average");
var weighted = /* @__PURE__ */ __name((items) => {
  const a = items.filter(([v]) => v !== null);
  return a.length ? a.reduce((s, [v, w]) => s + v * w, 0) / a.reduce((s, [, w]) => s + w, 0) : 0;
}, "weighted");
var rounded = /* @__PURE__ */ __name((v) => Math.round(v * 10) / 10, "rounded");
var validCombo2 = /* @__PURE__ */ __name((s) => /^[1-6]-[1-6]-[1-6]$/.test(String(s)) && new Set(s.split("-")).size === 3, "validCombo");
// Independent shadow model: empirical strength-rank outcomes, conditioned on winner lane.
// It does not consume main AI probabilities or change published selections.
const scenarioModelCache = new WeakMap();
function scenarioStrengthOrder(racers) {
  const keys = ['lane','class','national','local','st','motor','exhibition','exhibitionST','course'];
  if (!Array.isArray(racers) || racers.length !== 6 || new Set(racers.map(r=>r.lane)).size !== 6 || racers.some(r=>!Number.isInteger(r.lane)||r.lane<1||r.lane>6||keys.some(k=>typeof r.components?.[k] !== 'number'||!Number.isFinite(r.components[k])))) return null;
  return racers.map(r=>({lane:r.lane,score:keys.reduce((n,k)=>n+r.components[k],0)})).sort((a,b)=>b.score-a.score||a.lane-b.lane).map(r=>r.lane);
}
function trainScenarioIndependent(history, asOfDate) {
  const m={version:'scenario-rank-1',asOfDate,races:0,first:[0,0,0,0,0,0],pairs:{},latestDate:null};
  const seen=new Set();
  const prior=history.filter(r=>/^\d{8}$/.test(String(r.date))&&String(r.date)<asOfDate).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-3000);
  for (const r of prior) {
    const key=[r.date,r.jcd,r.rno].join('-');
    const order=scenarioStrengthOrder(r.racersDetailed),w=r.result?.winningLanes?.slice(0,3);
    if (seen.has(key)||!r.result?.finished||!order||!w||w.length!==3||new Set(w).size!==3||w.some(l=>!order.includes(l))) continue;
    seen.add(key);
    const rem=order.filter(l=>l!==w[0]),pair=rem.indexOf(w[1])+'-'+rem.indexOf(w[2]);
    m.first[order.indexOf(w[0])]++;m.pairs[w[0]]??={n:0,counts:{}};
    const group=m.pairs[w[0]];group.n++;group.counts[pair]=(group.counts[pair]||0)+1;
    m.races++;m.latestDate=String(r.date);
  }
  m.active=m.races>=200;
  return m;
}
function emptyScenarioModel(date, reason = '定期学習の準備待ち') {
  return {version:'scenario-rank-1',asOfDate:date,races:0,first:[0,0,0,0,0,0],pairs:{},latestDate:null,active:false,reason};
}
async function getScenarioIndependentModel(env, asOfDate) {
  const cached=scenarioModelCache.get(env.DB);
  if(cached?.date===asOfDate&&cached.expires>Date.now())return cached.model;
  let model=emptyScenarioModel(asOfDate);
  try {
    const row=await env.DB.prepare('SELECT payload FROM scenario_model_state WHERE as_of_date=?').bind(asOfDate).first();
    const state=parseJsonSafe(row?.payload,null),m=state?.model;
    if(m?.version==='scenario-rank-1'&&m.asOfDate===asOfDate&&Number.isInteger(m.races)&&m.races>=0&&m.races<=3000&&Array.isArray(m.first)&&m.first.length===6&&m.first.every(n=>Number.isInteger(n)&&n>=0)&&m.first.reduce((a,b)=>a+b,0)===m.races&&m.pairs&&(!m.latestDate||m.latestDate<asOfDate)) {
      model=m;model.active=m.races>=200;model.reason=model.active?null:'有効な過去データ200件の蓄積待ち';
    }
  } catch { model.reason='学習結果を取得できないため通常予想を継続'; }
  scenarioModelCache.set(env.DB,{date:asOfDate,expires:Date.now()+60000,model});
  return model;
}
async function runScenarioLearningBatch(env) {
  const date=todayJST();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS scenario_model_state(as_of_date TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL)').run();
  const initial={model:emptyScenarioModel(date),scanned:0,cursorDate:date,cursorKey:'',done:false};
  await env.DB.prepare('INSERT INTO scenario_model_state(as_of_date,payload) VALUES(?,?) ON CONFLICT(as_of_date) DO NOTHING').bind(date,JSON.stringify(initial)).run();
  const stored=await env.DB.prepare('SELECT revision,payload FROM scenario_model_state WHERE as_of_date=?').bind(date).first();
  const state=JSON.parse(stored.payload);
  if(state.done)return {races:state.model.races,scanned:state.scanned,complete:true};
  const limit=Math.min(200,3000-state.scanned);
  const rows=(await env.DB.prepare(`SELECT race_key,race_date,jcd,rno,
    CASE WHEN json_valid(race_data_json) THEN json_extract(race_data_json,'$.racersDetailed') END AS racers,
    CASE WHEN json_valid(result_json) THEN result_json WHEN json_valid(race_data_json) THEN json_extract(race_data_json,'$.result') END AS result
    FROM learning_races WHERE finished=1 AND race_date<? AND (race_date<? OR (race_date=? AND race_key<?))
    ORDER BY race_date DESC,race_key DESC LIMIT ?`).bind(date,state.cursorDate,state.cursorDate,state.cursorKey,limit).all()).results||[];
  const batch=rows.map(r=>({date:r.race_date,jcd:r.jcd,rno:r.rno,racersDetailed:parseJsonSafe(r.racers,[]),result:parseJsonSafe(r.result,null)}));
  const part=trainScenarioIndependent(batch,date),m=state.model;
  m.races+=part.races;
  m.first=m.first.map((v,i)=>v+part.first[i]);
  for(const [lane,g] of Object.entries(part.pairs)){
    const dest=m.pairs[lane]??={n:0,counts:{}};dest.n+=g.n;
    for(const [key,n] of Object.entries(g.counts))dest.counts[key]=(dest.counts[key]||0)+n;
  }
  m.latestDate=[m.latestDate,part.latestDate].filter(Boolean).sort().pop()||null;
  m.active=m.races>=200;m.reason=m.active?null:'有効な過去データ200件の蓄積待ち';
  state.scanned+=rows.length;
  if(rows.length){state.cursorDate=rows.at(-1).race_date;state.cursorKey=rows.at(-1).race_key;}
  state.done=rows.length<limit||state.scanned>=3000;
  state.updatedAt=new Date().toISOString();
  const write=await env.DB.prepare('UPDATE scenario_model_state SET payload=?,revision=revision+1 WHERE as_of_date=? AND revision=?').bind(JSON.stringify(state),date,stored.revision).run();
  if(!write.meta?.changes)return {status:'CONCURRENT_UPDATE',races:part.races};
  scenarioModelCache.delete(env.DB);
  return {races:m.races,scanned:state.scanned,complete:state.done,active:m.active};
}
function predictScenarioIndependent(model,racers,allBets,generatedAt) {
  const result={version:model.version,trainingRaces:model.races,trainingBefore:model.asOfDate,latestTrainingDate:model.latestDate,generatedAt,active:false,bets:[],method:'基礎評価の順位と1着艇番を条件に、2・3着の順位組を独立集計（検証用）'};
  const order=scenarioStrengthOrder(racers);
  const universe=new Map((allBets||[]).filter(b=>validCombo(b.combination)&&Number.isFinite(b.odds)&&b.odds>0).map(b=>[b.combination,b]));
  if(!model.active||!order||universe.size!==120){result.reason=model.reason||'学習200件・6艇の評価・120通りのオッズが必要';return result;}
  const predictions=[];
  for(const b of universe.values()){
    const [a,c,d]=b.combination.split('-').map(Number),rem=order.filter(l=>l!==a),g=model.pairs[a]||{n:0,counts:{}},key=rem.indexOf(c)+'-'+rem.indexOf(d);
    // Fixed smoothing, not optimized against evaluation results.
    const p1=(model.first[order.indexOf(a)]+10)/(model.races+60);
    const p23=((g.counts[key]||0)+2)/(g.n+40);
    predictions.push({combination:b.combination,probability:p1*p23,odds:b.odds});
  }
  result.probabilityTotal=predictions.reduce((n,b)=>n+b.probability,0);
  result.bets=predictions.sort((a,b)=>b.probability-a.probability||a.combination.localeCompare(b.combination)).slice(0,6);
  result.active=true;return result;
}
function independentScenarioEligible(snapshot) {
  const a=snapshot.scenarioAnalysis,m=a?.independent;
  const deadline=Date.parse(snapshot.deadlineJST||'');
  return snapshot.finalized===true&&!snapshot.preliminary&&m?.active===true&&m.version==='scenario-rank-1'&&m.trainingBefore===snapshot.date&&m.latestTrainingDate<snapshot.date&&[snapshot.createdAt,a.generatedAt,a.savedAt,m.generatedAt].every(t=>Number.isFinite(Date.parse(t||''))&&Date.parse(t)<deadline)&&a.bets?.length===6&&m.bets?.length===6;
}

function buildScenarioAnalysis(racers, allBets, context = {}) {
  const result = {
    version: SCENARIO_VERSION,
    generatedAt: context.generatedAt || (/* @__PURE__ */ new Date()).toISOString(),
    status: "INSUFFICIENT",
    method: "\u9078\u624B\u30FB\u30E2\u30FC\u30BF\u30FC \u2192 ST\u53C2\u8003\u968A\u5F62 \u2192 1\u30DE\u30FC\u30AF\u306E\u5C55\u958B\u5019\u88DC \u2192 3\u9023\u53586\u70B9",
    scoreMeaning: "\u5C55\u958B\u8A55\u4FA1\u306F\u672A\u691C\u8A3C\u306E\u30EB\u30FC\u30EB\u70B9\u3067\u3059\u3002\u7684\u4E2D\u78BA\u7387\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002",
    dataScope: "\u51FA\u8D70\u8868\u3068\u53D6\u5F97\u6E08\u307F\u5C55\u793A\u3092\u4F7F\u3063\u305F\u7C21\u6613\u5C55\u958B\u4E88\u60F3",
    sourceArticle: "https://www.eurorvvv.org/beginner/kyoteimethod/",
    missing: ["今節の着順・ST履歴", "選手のコース別ST・逃げ率・決まり手率", "モーター使用回数・交換時期", "直線・まわり足タイム", "部品交換・選手コメント", "映像による舟足評価・選手心理"],
    warnings: [],
    inputs: [],
    scenarios: [],
    bets: [],
    manshuCandidates: { status: "INSUFFICIENT", probability: null, bets: [], cutoffOdds: 100, source: "existing-ai", label: "\u5C55\u958B\u4E88\u60F3\u306E\u4E07\u821F\u5019\u88DC\u30FBAI\u63A8\u5B9A\u7684\u4E2D\u78BA\u7387" }
  };
  if (!Array.isArray(racers) || racers.length !== 6 || new Set(racers.map((r) => Number(r.lane))).size !== 6 || racers.some((r) => !Number.isInteger(Number(r.lane)) || r.lane < 1 || r.lane > 6)) {
    result.warnings.push("6\u8247\u306E\u51FA\u8D70\u60C5\u5831\u304C\u63C3\u308F\u306A\u3044\u305F\u3081\u8CB7\u3044\u76EE\u3092\u4F5C\u6210\u3057\u307E\u305B\u3093\u3002");
    return result;
  }
  const courses = racers.map((r) => numeric(r.before?.course, 1, 6));
  const courseKnown = courses.every(Number.isInteger) && new Set(courses).size === 6;
  const startsKnown = courseKnown && racers.every((r) => numeric(r.before?.exhibitionST, 0, 0.4) !== null);
  result.courseSource = courseKnown ? "exhibition" : "lane-assumption";
  if (!courseKnown) result.warnings.push("\u5C55\u793A\u9032\u5165\u306E6\u8247\u5206\u306E\u5BFE\u5FDC\u304C\u672A\u78BA\u8A8D\u3067\u3059\u3002\u67A0\u306A\u308A\u9032\u5165\u3092\u4EEE\u5B9A\u3057\u3066\u3044\u307E\u3059\u3002");
  if (!startsKnown) result.warnings.push("\u5C55\u793AST\u306E6\u8247\u5206\u306E\u5BFE\u5FDC\u304C\u672A\u78BA\u8A8D\u3067\u3059\u3002ST\u53C2\u8003\u5024\u306B\u306F\u5E73\u5747ST\u3060\u3051\u3092\u4F7F\u7528\u3057\u307E\u3059\u3002");
  const inputs = racers.map((r, i) => {
    const avgST = numeric(r.avgST, 0, 0.4), exhibitionST = startsKnown ? numeric(r.before?.exhibitionST, 0, 0.4) : null;
    const course = courseKnown ? courses[i] : Number(r.lane);
    const courseST = courseKnown ? numeric(r.courseStats?.courses?.[course], 0, 0.4) : null;
    const meetingST = r.meeting?.stCount >= 2 ? numeric(r.meeting.avgST,0,0.4) : null;
    const meetingFinish = r.meeting?.finishCount >= 2 ? numeric(r.meeting.avgFinish,1,6) : null;
    const baseST = avgST !== null && exhibitionST !== null ? avgST * 0.7 + exhibitionST * 0.3 : avgST;
    const extra = [[baseST,0.7],[courseST,0.2],[meetingST,0.1]].filter(([v])=>v !== null);
    const st = extra.length ? weighted(extra) : null;
    return { courseST, meetingST, meetingFinish, meeting: r.meeting || null, courseStats: r.courseStats || null, partsChanges: r.before?.partsChanges || null, lane: Number(r.lane), name: String(r.name || ""), course: courseKnown ? courses[i] : Number(r.lane), class: String(r.class || ""), national: numeric(r.national?.winRate, 0, 10), motor: numeric(r.motor?.secondRate, 0, 100), avgST, exhibitionST, st: st === null ? null : Math.round(st * 1e4) / 1e4, exhibitionTime: numeric(r.before?.exhibitionTime, 5, 9), fCount: numeric(r.fCount, 0, 10), secondRate: numeric(r.national?.secondRate, 0, 100), thirdRate: numeric(r.national?.thirdRate, 0, 100) };
  }).sort((a, b) => a.course - b.course);
  const rank = /* @__PURE__ */ __name((field, lower) => inputs.filter((r) => r[field] !== null).sort((a, b) => (lower ? a[field] - b[field] : b[field] - a[field]) || a.lane - b.lane), "rank");
  const startOrder = rank("st", true), exOrder = rank("exhibitionTime", true);
  for (const r of inputs) {
    r.startRank = r.st === null ? null : 1 + inputs.filter((x) => x.st !== null && x.st < r.st).length;
    r.exhibitionRank = r.exhibitionTime === null ? null : 1 + inputs.filter((x) => x.exhibitionTime !== null && x.exhibitionTime < r.exhibitionTime).length;
  }
  result.inputs = inputs;
  result.startOrder = startOrder.map((r) => r.lane);
  result.usedData = { national: inputs.filter((r) => r.national !== null).length, motor: inputs.filter((r) => r.motor !== null).length, avgST: inputs.filter((r) => r.avgST !== null).length, exhibitionTime: exOrder.length, exhibitionST: startsKnown ? 6 : 0, fCount: inputs.filter((r) => r.fCount !== null).length };
  Object.assign(result.usedData, { meetingST: inputs.filter(r=>r.meetingST !== null).length, meetingFinish: inputs.filter(r=>r.meetingFinish !== null).length, courseST: inputs.filter(r=>r.courseST !== null).length, partsChanges: inputs.filter(r=>r.partsChanges?.checked).length });
  result.dataScope = '出走表・展示と、取得できた今節成績・コース別ST・部品交換情報を使用。追加の重みは未検証の参考ルールです。';
  result.missing = ['選手の逃げ率・決まり手率','モーター使用回数・交換時期','直線・まわり足タイム','選手コメント','映像による舟足評価・選手心理'];
  if (result.usedData.meetingST < 6 || result.usedData.meetingFinish < 6) result.missing.unshift('今節成績・ST履歴：未取得または有効2走未満の艇あり');
  if (result.usedData.courseST < 6) result.missing.unshift('コース別ST：未取得・進入未確認の艇あり');
  if (result.usedData.partsChanges < 6) result.missing.push('部品交換：未確認の艇あり');
  result.warnings.push('追加反映：今節着順 '+result.usedData.meetingFinish+'/6艇、今節ST '+result.usedData.meetingST+'/6艇、コース別ST '+result.usedData.courseST+'/6艇、部品交換欄確認 '+result.usedData.partsChanges+'/6艇。');
  if (result.usedData.national < 4 || result.usedData.motor < 4 || result.usedData.avgST < 4) {
    result.warnings.push("\u5168\u56FD\u52DD\u7387\u30FB\u30E2\u30FC\u30BF\u30FC2\u9023\u7387\u30FB\u5E73\u5747ST\u304C\u54044\u8247\u4EE5\u4E0A\u5FC5\u8981\u3067\u3059\u3002");
    return result;
  }
  if (exOrder.length < 6) result.warnings.push(`\u5C55\u793A\u30BF\u30A4\u30E0\u306F${exOrder.length}/6\u8247\u3067\u3059\u3002\u672A\u53D6\u5F97\u8247\u306E\u30BF\u30A4\u30E0\u3092\u88DC\u3063\u3066\u3044\u307E\u305B\u3093\u3002`);
  if (result.usedData.fCount < 6) result.warnings.push("F\u6570\u306E\u672A\u53D6\u5F97\u8247\u306FF0\u3068\u898B\u306A\u3055\u305A\u3001F\u88DC\u6B63\u3092\u884C\u3044\u307E\u305B\u3093\u3002");
  const evidence = /* @__PURE__ */ __name((r) => weighted([[{ A1: 85, A2: 70, B1: 45, B2: 20 }[r.class] ?? null, 0.08], [scaled(r.national, 2, 9), 0.28], [scaled(r.motor, 15, 60), 0.24], [r.st === null ? null : 100 - scaled(r.st, 0.08, 0.25), 0.25], [r.exhibitionTime === null ? null : bounded(100 - (r.exhibitionTime - exOrder[0].exhibitionTime) * 250), 0.15]]) - Math.min(r.fCount ?? 0, 2) * 3, "evidence");
  const second = /* @__PURE__ */ __name((r) => weighted([[scaled(r.secondRate, 0, 80), 0.55], [scaled(r.motor, 15, 60), 0.25], [r.st === null ? null : 100 - scaled(r.st, 0.08, 0.25), 0.2]]), "second");
  const third = /* @__PURE__ */ __name((r) => weighted([[scaled(r.thirdRate, 0, 90), 0.6], [scaled(r.motor, 15, 60), 0.4]]), "third");
  const plans = [];
  for (const r of inputs) {
    if (r.national === null || r.motor === null || r.st === null) continue;
    const inner = inputs.filter((x) => x.course < r.course), innerST = average(inner.map((x) => x.st));
    const advantage = innerST === null ? 0 : bounded((innerST - r.st) * 300, -12, 12);
    const meetingAdjustment = r.meetingFinish === null ? 0 : bounded((3.5-r.meetingFinish)*1.2,-3,3);
    const basic = evidence(r) + meetingAdjustment, reasons = [`${r.lane}\u53F7\u8247\uFF1A\u5168\u56FD\u52DD\u7387 ${r.national.toFixed(2)} / \u30E2\u30FC\u30BF\u30FC2\u9023\u7387 ${r.motor.toFixed(1)}%`, `${r.lane}\u53F7\u8247\uFF1AST\u53C2\u8003 ${r.st.toFixed(3)}\uFF08\u53D6\u5F97${startOrder.length}\u8247\u5185 ${r.startRank}\u4F4D\uFF09`];
    if (r.courseST !== null) reasons.push(`公式コース別平均ST ${r.courseST.toFixed(2)}をST参考値に反映（${r.course}コース）。`);
    if (r.meetingST !== null) reasons.push(`今節ST ${r.meeting.stCount}走平均 ${r.meetingST.toFixed(3)}をST参考値に反映。`);
    if (r.meetingFinish !== null) reasons.push(`今節着順 ${r.meeting.finishCount}走平均 ${r.meetingFinish.toFixed(2)}着、展開評価補正 ${meetingAdjustment >= 0 ? '+' : ''}${meetingAdjustment.toFixed(1)}点（参考）。`);
    if (r.partsChanges?.checked) reasons.push(r.partsChanges.items.length ? `部品交換の記載：${r.partsChanges.items.join('・')}。良化・悪化は未確認のため加減点しません。` : '公式の部品交換欄に記載なし。');
    if (r.exhibitionRank !== null) reasons.push(`\u5C55\u793A\u30BF\u30A4\u30E0 ${r.exhibitionTime.toFixed(2)}\uFF08\u53D6\u5F97${exOrder.length}\u8247\u5185 ${r.exhibitionRank}\u4F4D\uFF09`);
    if (r.fCount > 0) reasons.push(`F${r.fCount}\u3092\u88DC\u52A9\u7684\u306B\u6E1B\u70B9\u3002\u5B9F\u969B\u306E\u30B9\u30BF\u30FC\u30C8\u3092\u65AD\u5B9A\u3059\u308B\u3082\u306E\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002`);
    if (r.course === 1) plans.push({ type: "escape", label: "\u30A4\u30F3\u9003\u3052", head: r.lane, course: r.course, score: rounded(bounded(basic + 12)), reasons: [...reasons, "1\u30B3\u30FC\u30B9\u60F3\u5B9A\u304B\u3089\u5148\u884C\u3057\u3066\u9003\u3052\u308B\u5C55\u958B\u3002"], cautions: ["\u500B\u4EBA\u306E\u9003\u3052\u7387\u30FB\u5DEE\u3055\u308C\u7387\u306F\u672A\u53D6\u5F97\u3067\u3059\u3002"] });
    if (r.course === 2) plans.push({ type: "sashi", label: "\u5DEE\u3057", head: r.lane, course: r.course, score: rounded(bounded(basic + 5 + advantage * 0.3)), reasons: [...reasons, "\u5185\u5074\u306E\u65CB\u56DE\u5F8C\u306B\u5DEE\u3059\u5C55\u958B\u3092\u5019\u88DC\u306B\u3057\u307E\u3059\u3002"], cautions: ["\u65CB\u56DE\u529B\u30FB\u5DEE\u3057\u7387\u306F\u672A\u53D6\u5F97\u3067\u3001\u5DEE\u3057\u6210\u7ACB\u306E\u88CF\u4ED8\u3051\u306F\u9650\u5B9A\u7684\u3067\u3059\u3002"] });
    if (r.course >= 3) {
      if (advantage > 0 || r.exhibitionRank !== null && r.exhibitionRank <= 2) plans.push({ type: "makuri", label: "\u307E\u304F\u308A", head: r.lane, course: r.course, score: rounded(bounded(basic + advantage - (r.course - 3) * 3)), reasons: [...reasons, advantage > 0 ? "\u5185\u5074\u8247\u306E\u5E73\u5747\u3088\u308AST\u53C2\u8003\u5024\u304C\u65E9\u304F\u3001\u5916\u304B\u3089\u653B\u3081\u308B\u5C55\u958B\u3002" : "\u5C55\u793A\u30BF\u30A4\u30E0\u304C\u4E0A\u4F4D\u3067\u3001\u5916\u304B\u3089\u653B\u3081\u308B\u5C55\u958B\u3092\u5019\u88DC\u306B\u3057\u307E\u3059\u3002"], cautions: ["\u5C55\u793A\u30BF\u30A4\u30E0\u3060\u3051\u3067\u51FA\u8DB3\u30FB\u884C\u304D\u8DB3\u3084\u307E\u304F\u308A\u6210\u529F\u306F\u5224\u65AD\u3067\u304D\u307E\u305B\u3093\u3002"] });
      if (r.startRank <= 3) plans.push({ type: "makurisashi", label: "\u307E\u304F\u308A\u5DEE\u3057", head: r.lane, course: r.course, score: rounded(bounded(basic + advantage * 0.4 - 5)), reasons: [...reasons, "ST\u53C2\u8003\u5024\u304C\u4E0A\u4F4D\u3067\u3001\u5185\u5074\u306E\u653B\u9632\u3092\u629C\u3051\u308B\u5C55\u958B\u3092\u5019\u88DC\u306B\u3057\u307E\u3059\u3002"], cautions: ["\u307E\u304F\u308A\u5DEE\u3057\u7387\u30FB\u307E\u308F\u308A\u8DB3\u306E\u5B9F\u6E2C\u5024\u306F\u672A\u53D6\u5F97\u3067\u3059\u3002"] });
    }
  }
  const universe = /* @__PURE__ */ new Map();
  for (const b of allBets || []) {
    if (validCombo2(b.combination) && numeric(b.odds, 0.01, 1e8) !== null && !universe.has(b.combination)) universe.set(b.combination, b);
  }
  const selectedHeads = /* @__PURE__ */ new Set();
  const candidatePlans = [];
  for (const plan of plans.sort((a, b) => b.score - a.score || a.course - b.course || a.type.localeCompare(b.type))) {
    if (selectedHeads.has(plan.head)) continue;
    const candidates = [...universe.values()].filter((b) => Number(b.combination.split("-")[0]) === plan.head).map((b) => {
      const [a, c, d] = b.combination.split("-").map(Number), r2 = inputs.find((r) => r.lane === c), r3 = inputs.find((r) => r.lane === d);
      let routeBonus = 0;
      if (plan.type === "escape" && r2.course <= 3) routeBonus = 4;
      if (plan.type === "sashi" && r2.course === 1) routeBonus = 5;
      if (plan.type === "makuri" && r2.course > plan.course) routeBonus = 5;
      if (plan.type === "makurisashi" && r2.course === 1) routeBonus = 3;
      return { combination: b.combination, probability: typeof b.probability === "number" && Number.isFinite(b.probability) && b.probability >= 0 && b.probability <= 1 ? b.probability : null, odds: Number(b.odds), score: rounded(bounded(plan.score * 0.5 + second(r2) * 0.3 + third(r3) * 0.2 + routeBonus)), scenario: plan.type, head: a };
    }).sort((a, b) => b.score - a.score || a.combination.localeCompare(b.combination));
    if (candidates.length < 2) continue;
    candidatePlans.push({ ...plan, bets: candidates });
    selectedHeads.add(plan.head);
  }
  const legacyPlans = candidatePlans.slice(0, 3).map(p => ({ ...p, bets: p.bets.slice(0, 2) }));
  const legacyBets = legacyPlans.flatMap(p => p.bets);
  const candidates = candidatePlans.flatMap(p => p.bets);
  const fullProbabilities = universe.size === 120 && [...universe.values()].every(b => typeof b.probability === 'number' && Number.isFinite(b.probability) && b.probability >= 0 && b.probability <= 1) && [...universe.values()].reduce((n,b)=>n+b.probability,0) <= 1 + 1e-6;
  const usable = fullProbabilities && candidates.length >= 6;
  result.comparison = { legacyVersion: '1.1.0', legacyBets, selection: usable ? 'learned-probability-top6' : 'legacy-fallback', validation: 'prospective', generatedAt: result.generatedAt };
  if (usable) {
    result.bets = candidates.sort((a,b)=>b.probability-a.probability || b.score-a.score || a.combination.localeCompare(b.combination)).slice(0,6);
    result.scenarios = candidatePlans.map(p=>({...p, bets:result.bets.filter(b=>b.head===p.head)})).filter(p=>p.bets.length);
    result.warnings.push('各展開2点固定を廃止し、展開候補から学習済みAIの組合せ確率が高い順に6点選択。旧方式も同時保存して今後の結果で比較します。改善効果は検証中です。');
  } else {
    result.scenarios = legacyPlans;
    result.bets = legacyBets;
    result.warnings.push('120通りの有効なAI確率が揃わないため旧方式で選択しました。新方式の比較対象から除外します。');
  }
  result.comparison.legacyProbability = fullProbabilities ? legacyBets.reduce((n,b)=>n+b.probability,0) : null;
  result.comparison.selectedProbability = fullProbabilities ? result.bets.reduce((n,b)=>n+b.probability,0) : null;
  result.method = '展開候補を作成 → 学習済みAIの組合せ確率順に6点選択';
  result.status = result.bets.length ? "REFERENCE" : "INSUFFICIENT";
  result.manshuCandidates = scenarioManshuCandidates(result.bets, allBets);
  if (result.bets.length !== 6) result.warnings.push("\u5019\u88DC\u304C6\u70B9\u63C3\u308F\u306A\u3044\u305F\u3081\u540C\u70B9\u6570\u306E\u5B9F\u7E3E\u6BD4\u8F03\u304B\u3089\u9664\u5916\u3057\u307E\u3059\u3002");
  return result;
}
__name(buildScenarioAnalysis, "buildScenarioAnalysis");
function scenarioNoteLines(analysis) {
  if (!analysis) return ["\u5C55\u958B\u4E88\u60F3\u306E\u4FDD\u5B58\u30C7\u30FC\u30BF\u306F\u3042\u308A\u307E\u305B\u3093\u3002"];
  return [
    "\u25A0 \u5C55\u958B\u4E88\u60F3\uFF08\u53C2\u8003\u30FB\u30EB\u30FC\u30EB v" + analysis.version + "\uFF09",
    analysis.scoreMeaning,
    analysis.dataScope,
    ...analysis.scenarios.flatMap((s, i) => [`${i + 1}. ${s.head}\u53F7\u8247 ${s.label} / \u5C55\u958B\u8A55\u4FA1 ${s.score}`, ...s.reasons, ...s.cautions, "\u8CB7\u3044\u76EE\uFF1A" + s.bets.map((b) => b.combination).join(" / ")]),
    ...scenarioManshuNoteLines(analysis.manshuCandidates),
    ...analysis.warnings,
    "\u672A\u53D6\u5F97\uFF1A" + analysis.missing.join("\u3001")
  ];
}
__name(scenarioNoteLines, "scenarioNoteLines");
function scenarioManshuCandidates(selected, allBets) {
  const out = { status: "INSUFFICIENT", probability: null, bets: [], cutoffOdds: 100, source: "existing-ai", label: "\u5C55\u958B\u4E88\u60F3\u306E\u4E07\u821F\u5019\u88DC\u30FBAI\u63A8\u5B9A\u7684\u4E2D\u78BA\u7387" };
  if (!Array.isArray(selected) || !selected.length) return out;
  const seen = /* @__PURE__ */ new Set();
  let missing = false;
  for (const b of selected) {
    if (!b || !validCombo2(b.combination)) {
      missing = true;
      continue;
    }
    if (seen.has(b.combination)) continue;
    seen.add(b.combination);
    const rows = (allBets || []).filter((x) => x?.combination === b.combination);
    if (rows.length !== 1) {
      missing = true;
      continue;
    }
    const source = rows[0], odds = numeric(source.odds, 0.01, 1e8);
    if (odds === null) {
      missing = true;
      continue;
    }
    if (odds < 100) continue;
    const probability = numeric(source.probability, 0, 1);
    if (probability === null) missing = true;
    out.bets.push({ combination: b.combination, odds, probability, scenario: b.scenario });
  }
  const total = out.bets.reduce((sum, b) => sum + (b.probability ?? 0), 0);
  if (missing || total > 1 + 1e-9) {
    out.status = "INCOMPLETE";
    return out;
  }
  out.status = "READY";
  out.probability = Math.min(1, total);
  return out;
}
__name(scenarioManshuCandidates, "scenarioManshuCandidates");
function scenarioManshuNoteLines(data) {
  if (!data) return ["\u5C55\u958B\u4E88\u60F3\u306E\u4E07\u821F\u5019\u88DC\uFF1A\u3053\u306E\u4E88\u60F3\u306B\u306F\u4FDD\u5B58\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002"];
  return [
    "\u25A0 \u5C55\u958B\u4E88\u60F3\u306E\u4E07\u821F\u5019\u88DC\u30FBAI\u63A8\u5B9A\u7684\u4E2D\u78BA\u7387",
    "\u5019\u88DC\u5168\u4F53\u306EAI\u63A8\u5B9A\u7684\u4E2D\u78BA\u7387\uFF1A" + (data.probability == null ? "\u7B97\u51FA\u5F85\u3061" : (data.probability * 100).toFixed(2) + "%"),
    ...data.bets.map((b) => `${b.combination}\uFF0F${b.odds}\u500D\uFF0F\u73FE\u884CAI\u63A8\u5B9A ${b.probability == null ? "\u672A\u53D6\u5F97" : (b.probability * 100).toFixed(2) + "%"}`),
    data.status === "READY" && !data.bets.length ? "100\u500D\u4EE5\u4E0A\u306E\u5C55\u958B\u5019\u88DC\u306F\u3042\u308A\u307E\u305B\u3093\u3002" : "",
    "\u5C55\u958B\u4E88\u60F3\u306E\u9078\u51FA\u8CB7\u3044\u76EE\u306E\u3046\u3061\u3001\u53D6\u5F97\u6642100\u500D\u4EE5\u4E0A\u3060\u3051\u306E\u78BA\u7387\u5408\u8A08\u3067\u3059\u3002\u78BA\u7387\u306F\u73FE\u884CAI\u7531\u6765\u3067\u3001\u5C55\u958B\u8A55\u4FA1\u70B9\u3092\u78BA\u7387\u306B\u5909\u63DB\u3057\u305F\u3082\u306E\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002",
    "\u30EC\u30FC\u30B9\u5168\u4F53\u306E\u4E07\u821F\u78BA\u7387\u30FB\u5229\u76CA\u304C\u51FA\u308B\u78BA\u7387\u3068\u306F\u7570\u306A\u308A\u307E\u3059\u3002\u5B9F\u969B\u306E\u7684\u4E2D\u7387\u3068\u306E\u4E00\u81F4\u306F\u672A\u691C\u8A3C\u3067\u3059\u3002"
  ];
}
__name(scenarioManshuNoteLines, "scenarioManshuNoteLines");

// src/race-lock.mjs
async function withRaceLock(env, key, operation) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS rebuild_race_locks(race_key TEXT PRIMARY KEY,owner TEXT,expires_at INTEGER DEFAULT 0)`).run();
  await env.DB.prepare("INSERT INTO rebuild_race_locks(race_key,expires_at) VALUES(?,0) ON CONFLICT(race_key) DO NOTHING").bind(key).run();
  const owner = crypto.randomUUID();
  const lock = await env.DB.prepare("UPDATE rebuild_race_locks SET owner=?,expires_at=? WHERE race_key=? AND expires_at<=?").bind(owner, Date.now() + 5 * 6e4, key, Date.now()).run();
  if (!lock.meta?.changes) throw Object.assign(Error("\u3053\u306E\u30EC\u30FC\u30B9\u306F\u4FDD\u5B58\u51E6\u7406\u4E2D\u3067\u3059\u3002\u5C11\u3057\u5F85\u3063\u3066\u518D\u53D6\u5F97\u3057\u3066\u304F\u3060\u3055\u3044"), { status: 409 });
  try {
    return await operation();
  } finally {
    await env.DB.prepare("UPDATE rebuild_race_locks SET owner=NULL,expires_at=0 WHERE race_key=? AND owner=?").bind(key, owner).run();
  }
}
__name(withRaceLock, "withRaceLock");

// src/official.mjs
var VENUE_NAMES = {
  "01": "\u6850\u751F",
  "02": "\u6238\u7530",
  "03": "\u6C5F\u6238\u5DDD",
  "04": "\u5E73\u548C\u5CF6",
  "05": "\u591A\u6469\u5DDD",
  "06": "\u6D5C\u540D\u6E56",
  "07": "\u84B2\u90E1",
  "08": "\u5E38\u6ED1",
  "09": "\u6D25",
  "10": "\u4E09\u56FD",
  "11": "\u3073\u308F\u3053",
  "12": "\u4F4F\u4E4B\u6C5F",
  "13": "\u5C3C\u5D0E",
  "14": "\u9CF4\u9580",
  "15": "\u4E38\u4E80",
  "16": "\u5150\u5CF6",
  "17": "\u5BAE\u5CF6",
  "18": "\u5FB3\u5C71",
  "19": "\u4E0B\u95A2",
  "20": "\u82E5\u677E",
  "21": "\u82A6\u5C4B",
  "22": "\u798F\u5CA1",
  "23": "\u5510\u6D25",
  "24": "\u5927\u6751"
};
var PREF = "(?:\u5317\u6D77\u9053|\u9752\u68EE|\u5CA9\u624B|\u5BAE\u57CE|\u79CB\u7530|\u5C71\u5F62|\u798F\u5CF6|\u8328\u57CE|\u6803\u6728|\u7FA4\u99AC|\u57FC\u7389|\u5343\u8449|\u6771\u4EAC|\u795E\u5948\u5DDD|\u65B0\u6F5F|\u5BCC\u5C71|\u77F3\u5DDD|\u798F\u4E95|\u5C71\u68A8|\u9577\u91CE|\u5C90\u961C|\u9759\u5CA1|\u611B\u77E5|\u4E09\u91CD|\u6ECB\u8CC0|\u4EAC\u90FD|\u5927\u962A|\u5175\u5EAB|\u5948\u826F|\u548C\u6B4C\u5C71|\u9CE5\u53D6|\u5CF6\u6839|\u5CA1\u5C71|\u5E83\u5CF6|\u5C71\u53E3|\u5FB3\u5CF6|\u9999\u5DDD|\u611B\u5A9B|\u9AD8\u77E5|\u798F\u5CA1|\u4F50\u8CC0|\u9577\u5D0E|\u718A\u672C|\u5927\u5206|\u5BAE\u5D0E|\u9E7F\u5150\u5CF6|\u6C96\u7E04)";
async function venues(hd) {
  const html = await officialFetch(
    `/owpc/pc/race/index?hd=${hd}`
  );
  const decodedHtml = decodeHtml(html);
  const found = [
    ...decodedHtml.matchAll(
      /jcd=(\d{2})/gi
    )
  ].map(
    (match) => match[1]
  );
  const unique = [
    ...new Set(found)
  ].filter(
    (jcd) => VENUE_NAMES[jcd]
  );
  if (unique.length === 0) {
    throw new Error(
      `\u958B\u50AC\u5834\u53D6\u5F970\u4EF6: BOAT RACE\u516C\u5F0F\u30DA\u30FC\u30B8\u306E\u30EA\u30F3\u30AF\u89E3\u6790\u306B\u5931\u6557\u3057\u305F\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059 hd=${hd}`
    );
  }
  return unique.filter(
    (jcd) => VENUE_NAMES[jcd]
  ).map(
    (jcd) => ({
      jcd,
      name: VENUE_NAMES[jcd]
    })
  );
}
__name(venues, "venues");
function parseRaceDeadlines(html) {
  const deadlines = /* @__PURE__ */ new Map();
  const text = stripHtml(
    html
  );
  const regex = /(?:^|\s)(1[0-2]|[1-9])R\s+([0-2]?\d:[0-5]\d)(?=\s|$)/g;
  let match;
  while ((match = regex.exec(
    text
  )) !== null) {
    const rno = Number(
      match[1]
    );
    const time = match[2].padStart(
      5,
      "0"
    );
    if (!deadlines.has(
      rno
    )) {
      deadlines.set(
        rno,
        time
      );
    }
  }
  if (deadlines.size < 12) {
    const rows = [
      ...html.matchAll(
        /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
      )
    ];
    for (const rowMatch of rows) {
      const row = stripHtml(
        rowMatch[1]
      );
      const m = row.match(
        /(?:^|\s)(1[0-2]|[1-9])R\s+([0-2]?\d:[0-5]\d)(?=\s|$)/
      );
      if (!m) {
        continue;
      }
      const rno = Number(
        m[1]
      );
      const time = m[2].padStart(
        5,
        "0"
      );
      if (!deadlines.has(
        rno
      )) {
        deadlines.set(
          rno,
          time
        );
      }
    }
  }
  return deadlines;
}
__name(parseRaceDeadlines, "parseRaceDeadlines");
async function venueData(hd, jcd) {
  const html = await officialFetch(
    `/owpc/pc/race/raceindex?hd=${hd}&jcd=${jcd}`
  );
  const text = stripHtml(
    html
  );
  const deadlines = parseRaceDeadlines(
    html
  );
  const races = [];
  for (let rno = 1; rno <= 12; rno++) {
    const regex = new RegExp(
      `(?:^|\\s)${rno}R(?:\\s|$)`,
      "i"
    );
    if (regex.test(
      text
    ) || html.includes(
      `rno=${rno}`
    )) {
      const deadline = deadlines.get(
        rno
      ) || null;
      races.push({
        rno,
        status: "\u51FA\u8D70\u60C5\u5831\u3042\u308A",
        deadline,
        deadlineJST: deadline ? deadlineIsoJST(
          hd,
          deadline
        ) : null
      });
    }
  }
  return {
    hd,
    jcd,
    venue: VENUE_NAMES[jcd] || jcd,
    races
  };
}
__name(venueData, "venueData");
// Official supplemental data. Unknown values stay null; no inferred psychology or escape rates.
function supplementalCells(row) {
  return Array.from(row.matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi), m => ({ attrs: m[1], html: m[2], text: stripHtml(m[2]).normalize('NFKC').trim() }));
}
function parseMeetingHistory(html, context = {}) {
  const out = new Map();
  if (!/^\d{8}$/.test(String(context.hd || '')) || !Number.isInteger(Number(context.rno))) return out;
  for (const body of html.matchAll(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/gi)) {
    const registration = body[1].match(/racersearch\/profile\?toban=(\d{4})/);
    const rows = Array.from(body[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi), m => supplementalCells(m[1]));
    if (!registration || rows.length !== 4) continue;
    const raceCells = rows[0].filter(c => !/rowspan\s*=/i.test(c.attrs));
    if (raceCells.length !== rows[1].length || rows[1].length !== rows[2].length || rows[2].length !== rows[3].length) continue;
    const records = [];
    for (let i = 0; i < rows[3].length; i++) {
      const link = rows[3][i].html.match(/href=["']([^"']*\/raceresult\?[^"']+)["']/i);
      if (!link) continue;
      let u; try { u = new URL(decodeHtml(link[1]), OFFICIAL); } catch { continue; }
      const date = u.searchParams.get('hd'), rno = Number(u.searchParams.get('rno'));
      if (!/^\d{8}$/.test(date || '') || rno < 1 || rno > 12 || date > context.hd || date === context.hd && rno >= Number(context.rno)) continue;
      const finishText = rows[3][i].text, rawST = rows[2][i].text;
      if (!finishText) continue;
      const finish = /^[1-6]$/.test(finishText) ? Number(finishText) : null;
      const st = /^(?:0?\.\d{2})$/.test(rawST) ? Number(rawST) : null;
      records.push({ date, rno, course: /^[1-6]$/.test(rows[1][i].text) ? Number(rows[1][i].text) : null, finish, finishText, st, rawST });
    }
    const starts = records.filter(r => r.st !== null), finishes = records.filter(r => r.finish !== null);
    out.set(registration[1], { source: 'official-racelist', records, count: records.length, stCount: starts.length, avgST: starts.length ? starts.reduce((s,r)=>s+r.st,0)/starts.length : null, finishCount: finishes.length, avgFinish: finishes.length ? finishes.reduce((s,r)=>s+r.finish,0)/finishes.length : null });
  }
  return out;
}
function parseCourseStarts(html) {
  const table = Array.from(html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi), m=>m[1]).find(t=>stripHtml(t).includes('コース別平均スタートタイミング'));
  const courses = {};
  if (!table) return courses;
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const c = supplementalCells(row[1]);
    if (c.length !== 2 || !/^[1-6]$/.test(c[0].text)) continue;
    courses[c[0].text] = /^(?:0?\.\d{2})$/.test(c[1].text) ? numeric(c[1].text,0,0.99) : null;
  }
  return courses;
}
function parsePartsChanges(html) {
  const out = new Map();
  if (!stripHtml(html).includes('部品交換')) return out;
  for (const body of html.matchAll(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/gi)) {
    const row = body[1].match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/i);
    if (!row) continue;
    const cells = supplementalCells(row[1]);
    if (cells.length < 8 || !/^[1-6]$/.test(cells[0].text) || !cells[2].html.includes('racersearch/profile') || !/kg/.test(cells[3].text) || !/labelGroup1/.test(cells[7].html)) continue;
    const items = Array.from(cells[7].html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi),m=>stripHtml(m[1]).normalize('NFKC')).filter(Boolean);
    // An empty official field means no listed change, not proof of no maintenance.
    if (items.length || !cells[7].text) out.set(Number(cells[0].text), { source:'official-beforeinfo', checked:true, items });
  }
  return out;
}
async function enrichCourseStarts(env, racers, hd) {
  if (hd !== todayJST()) return racers; // Current profile statistics cannot be used to backfill past predictions.
  await Promise.all(racers.map(async r => {
    if (!/^\d{4}$/.test(String(r.registration))) return;
    const key = 'course-st-v1:' + r.registration;
    const now = Date.now();
    try {
      const row = await env.DB.prepare('SELECT payload_json,expires_at FROM supplemental_cache WHERE cache_key=?').bind(key).first();
      if (row && Number(row.expires_at) > now) { r.courseStats = parseJsonSafe(row.payload_json,null); return; }
      const html = await officialFetch('/owpc/pc/data/racersearch/course?toban=' + r.registration, 6000);
      const courses = parseCourseStarts(html);
      const found = Object.values(courses).some(v=>v !== null);
      const payload = found ? {source:'official-course',fetchedAt:new Date(now).toISOString(),courses} : null;
      r.courseStats = payload;
      await env.DB.prepare('INSERT INTO supplemental_cache(cache_key,payload_json,expires_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload_json=excluded.payload_json,expires_at=excluded.expires_at').bind(key,JSON.stringify(payload),now+(found?6*3600000:300000)).run();
    } catch { r.courseStats = null; }
  }));
  return racers;
}

function parseRacers(html, context = {}) {
  const text = stripHtml(
    html
  );
  const racers = [];
  const num = "(\\d+(?:\\.\\d+)?|-)";
  const pattern = `(\\d{4})\\s*\\/\\s*(A1|A2|B1|B2)\\s+(.+?)\\s+(${PREF}\\/${PREF})\\s+(\\d{1,2})\u6B73\\s*\\/\\s*(\\d+(?:\\.\\d+)?)kg\\s+F(\\d+)\\s+L(\\d+)\\s+` + num + "\\s+" + num + "\\s+" + num + "\\s+" + num + "\\s+" + num + "\\s+" + num + "\\s+" + num + "\\s+(\\d+)\\s+" + num + "\\s+" + num + "\\s+(\\d+)\\s+" + num + "\\s+" + num;
  const regex = new RegExp(
    pattern,
    "g"
  );
  let match;
  while ((match = regex.exec(
    text
  )) !== null && racers.length < 6) {
    racers.push({
      lane: racers.length + 1,
      registration: match[1],
      class: match[2],
      name: match[3].replace(
        /\s+/g,
        " "
      ).trim(),
      branchOrigin: match[4],
      age: value(
        match[5]
      ),
      weight: value(
        match[6]
      ),
      fCount: value(
        match[7]
      ),
      lCount: value(
        match[8]
      ),
      avgST: value(
        match[9]
      ),
      national: {
        winRate: value(
          match[10]
        ),
        secondRate: value(
          match[11]
        ),
        thirdRate: value(
          match[12]
        )
      },
      local: {
        winRate: value(
          match[13]
        ),
        secondRate: value(
          match[14]
        ),
        thirdRate: value(
          match[15]
        )
      },
      motor: {
        number: value(
          match[16]
        ),
        secondRate: value(
          match[17]
        ),
        thirdRate: value(
          match[18]
        )
      },
      boat: {
        number: value(
          match[19]
        ),
        secondRate: value(
          match[20]
        ),
        thirdRate: value(
          match[21]
        )
      }
    });
  }
  const meeting = parseMeetingHistory(html, context);
  for (const r of racers) r.meeting = meeting.get(r.registration) || null;
  return racers;
}
__name(parseRacers, "parseRacers");
async function raceData(hd, jcd, rno) {
  const html = await officialFetch(
    `/owpc/pc/race/racelist?hd=${hd}&jcd=${jcd}&rno=${rno}`
  );
  return {
    hd,
    jcd,
    venue: VENUE_NAMES[jcd] || jcd,
    rno: Number(rno),
    racers: parseRacers(
      html, { hd, rno }
    )
  };
}
__name(raceData, "raceData");
function parseBeforeInfo(html) {
  const text = stripHtml(
    html
  );
  const racers = [];
  // Keep each table body separate so previous-race results cannot spill
  // into another racer's name or lane. Names cannot consume numbers.
  const bodies = Array.from(html.matchAll(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/gi), (m) => stripHtml(m[1]));
  const blocks = bodies.length ? bodies : [text];
  const racerRegex = /(?:^|\s)([1-6])\s+([\p{L}\p{M}々〆ー・\s]+?)\s+(\d+(?:\.\d+)?)\s*kg\s+(\d+\.\d{2}|--?|－)\s+([+-]?\d+\.\d+|--?|－)(?=\s|$)/gu;
  let match;
  for (const block of blocks) {
    racerRegex.lastIndex = 0;
    while ((match = racerRegex.exec(block)) !== null && racers.length < 6) {
      const lane = Number(match[1]);
      if (racers.some((racer) => racer.lane === lane)) continue;
      racers.push({
        lane,
        name: match[2].replace(/\s+/g, " ").trim(),
        weight: value(match[3]),
        exhibitionTime: value(match[4]),
        tilt: value(match[5]),
        course: null,
        exhibitionST: null
      });
    }
  }
  const startIndex = text.indexOf(
    "\u30B9\u30BF\u30FC\u30C8\u5C55\u793A"
  );
  const weatherIndex = text.indexOf(
    "\u6C34\u9762\u6C17\u8C61\u60C5\u5831"
  );
  const startText = startIndex >= 0 ? weatherIndex > startIndex ? text.slice(
    startIndex,
    weatherIndex
  ) : text.slice(
    startIndex
  ) : "";
  // The printed number is the boat number; display order is the course.
  // Keep F/L entries in the order so later boats never shift positions.
  const startRegex = /(?:^|\s)([1-6])\s+((?:F\s*)?(?:0?\.\d{2})|L)(?=\s|$)/gi;
  const starts = new Map();
  let course = 0;
  while ((match = startRegex.exec(startText)) !== null && course < 6) {
    const lane = Number(match[1]);
    if (starts.has(lane)) continue;
    const rawST = match[2].replace(/\s/g, "").toUpperCase();
    starts.set(lane, {
      course: ++course,
      exhibitionST: rawST === "L" ? null : rawST.startsWith("F") ? -Number(rawST.slice(1)) : Number(rawST)
    });
  }
  racers.forEach((racer) => {
    const start = starts.get(racer.lane);
    if (start) Object.assign(racer, start);
  });
  const changes = parsePartsChanges(html);
  for (const r of racers) r.partsChanges = changes.get(r.lane) || null;
  const temp = text.match(
    /気温\s*(\d+(?:\.\d+)?)℃/
  );
  const wind = text.match(
    /風速\s*(\d+(?:\.\d+)?)m/
  );
  const water = text.match(
    /水温\s*(\d+(?:\.\d+)?)℃/
  );
  const wave = text.match(
    /波高\s*(\d+(?:\.\d+)?)cm/
  );
  return {
    racers,
    weather: {
      temperature: temp ? Number(
        temp[1]
      ) : null,
      windSpeed: wind ? Number(
        wind[1]
      ) : null,
      waterTemperature: water ? Number(
        water[1]
      ) : null,
      waveHeight: wave ? Number(
        wave[1]
      ) : null
    }
  };
}
__name(parseBeforeInfo, "parseBeforeInfo");
async function beforeData(hd, jcd, rno) {
  const html = await officialFetch(
    `/owpc/pc/race/beforeinfo?hd=${hd}&jcd=${jcd}&rno=${rno}`
  );
  return {
    hd,
    jcd,
    venue: VENUE_NAMES[jcd] || jcd,
    rno: Number(rno),
    ...parseBeforeInfo(
      html
    )
  };
}
__name(beforeData, "beforeData");
function cellText(html) {
  return stripHtml(
    html
  ).replace(
    /倍$/g,
    ""
  ).trim();
}
__name(cellText, "cellText");
function expandTable(tableHtml) {
  const rowMatches = [
    ...tableHtml.matchAll(
      /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
    )
  ];
  const pending = {};
  const grid = [];
  for (const rowMatch of rowMatches) {
    let usePending = function() {
      while (pending[col]) {
        row[col] = pending[col].value;
        pending[col].remaining--;
        if (pending[col].remaining <= 0) {
          delete pending[col];
        }
        col++;
      }
    };
    __name(usePending, "usePending");
    const cells = [
      ...rowMatch[1].matchAll(
        /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi
      )
    ];
    const row = [];
    let col = 0;
    usePending();
    for (const cell of cells) {
      usePending();
      const attrs = cell[2] || "";
      const text = cellText(
        cell[3]
      );
      const rowspanMatch = attrs.match(
        /rowspan\s*=\s*["']?(\d+)/i
      );
      const colspanMatch = attrs.match(
        /colspan\s*=\s*["']?(\d+)/i
      );
      const rowspan = rowspanMatch ? Number(
        rowspanMatch[1]
      ) : 1;
      const colspan = colspanMatch ? Number(
        colspanMatch[1]
      ) : 1;
      for (let i = 0; i < colspan; i++) {
        row[col] = text;
        if (rowspan > 1) {
          pending[col] = {
            value: text,
            remaining: rowspan - 1
          };
        }
        col++;
      }
    }
    usePending();
    grid.push(
      row
    );
  }
  return grid;
}
__name(expandTable, "expandTable");
function isBoatNumber(v) {
  return /^[1-6]$/.test(
    String(
      v || ""
    ).trim()
  );
}
__name(isBoatNumber, "isBoatNumber");
function parseOdd(v) {
  const text = String(
    v || ""
  ).replace(
    /,/g,
    ""
  ).trim();
  if (!text || text === "-" || text === "\u6B20\u5834") {
    return null;
  }
  const n = Number(
    text
  );
  return Number.isFinite(
    n
  ) && n > 0 ? n : null;
}
__name(parseOdd, "parseOdd");
function parseOdds(html) {
  const tables = [
    ...html.matchAll(
      /<table\b[^>]*>([\s\S]*?)<\/table>/gi
    )
  ];
  const map = /* @__PURE__ */ new Map();
  for (const table of tables) {
    const grid = expandTable(
      table[0]
    );
    for (const row of grid) {
      for (let first = 1; first <= 6; first++) {
        const base = (first - 1) * 3;
        const second = row[base];
        const third = row[base + 1];
        const odd = parseOdd(
          row[base + 2]
        );
        if (!isBoatNumber(
          second
        ) || !isBoatNumber(
          third
        ) || odd === null) {
          continue;
        }
        const secondNum = Number(
          second
        );
        const thirdNum = Number(
          third
        );
        if (first === secondNum || first === thirdNum || secondNum === thirdNum) {
          continue;
        }
        const combination = `${first}-${secondNum}-${thirdNum}`;
        map.set(
          combination,
          {
            combination,
            first,
            second: secondNum,
            third: thirdNum,
            odds: odd
          }
        );
      }
    }
  }
  return [
    ...map.values()
  ];
}
__name(parseOdds, "parseOdds");
async function oddsData(hd, jcd, rno) {
  const html = await officialFetch(
    `/owpc/pc/race/odds3t?hd=${hd}&jcd=${jcd}&rno=${rno}`
  );
  const odds = parseOdds(
    html
  );
  return {
    hd,
    jcd,
    venue: VENUE_NAMES[jcd] || jcd,
    rno: Number(rno),
    type: "3\u9023\u5358",
    count: odds.length,
    odds
  };
}
__name(oddsData, "oddsData");
function parsePayout(text) {
  if (!text) {
    return null;
  }
  const cleaned = decodeHtml(
    text
  ).replace(
    /[¥￥円]/g,
    ""
  ).replace(
    /,/g,
    ""
  ).replace(
    /\s+/g,
    ""
  ).trim();
  const match = cleaned.match(
    /(\d+)/
  );
  if (!match) {
    return null;
  }
  const n = Number(
    match[1]
  );
  return Number.isFinite(
    n
  ) ? n : null;
}
__name(parsePayout, "parsePayout");
function normalizeCombination(text) {
  if (!text) {
    return null;
  }
  const match = stripHtml(
    text
  ).match(
    /([1-6])\s*[-－]\s*([1-6])\s*[-－]\s*([1-6])/
  );
  if (!match) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}
__name(normalizeCombination, "normalizeCombination");
function parseTrifectaResult(html) {
  const rows = [
    ...html.matchAll(
      /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
    )
  ];
  for (const rowMatch of rows) {
    const cells = [
      ...rowMatch[1].matchAll(
        /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi
      )
    ].map(
      (cell) => stripHtml(
        cell[1]
      )
    ).filter(
      Boolean
    );
    if (!cells.length) {
      continue;
    }
    const rowText = cells.join(
      " "
    );
    if (!rowText.includes(
      "3\u9023\u5358"
    )) {
      continue;
    }
    const combination = normalizeCombination(
      rowText
    );
    let payout = null;
    if (combination) {
      const comboPosition = rowText.indexOf(
        combination
      );
      const afterCombo = comboPosition >= 0 ? rowText.slice(
        comboPosition + combination.length
      ) : rowText;
      const yenMatch = decodeHtml(
        afterCombo
      ).match(
        /(?:¥|￥)\s*([\d,]+)|([\d,]+)\s*円/
      );
      if (yenMatch) {
        payout = parsePayout(
          yenMatch[1] || yenMatch[2]
        );
      }
      if (payout === null) {
        const index = cells.findIndex(
          (cell) => normalizeCombination(
            cell
          ) === combination
        );
        if (index >= 0 && cells[index + 1]) {
          payout = parsePayout(
            cells[index + 1]
          );
        }
      }
    }
    if (combination && payout !== null) {
      return {
        combination,
        payout
      };
    }
  }
  return {
    combination: null,
    payout: null
  };
}
__name(parseTrifectaResult, "parseTrifectaResult");
function parseOrder(html) {
  const text = stripHtml(
    html
  );
  const startInfoIndex = text.indexOf(
    "\u30B9\u30BF\u30FC\u30C8\u60C5\u5831"
  );
  const resultSection = startInfoIndex >= 0 ? text.slice(
    0,
    startInfoIndex
  ) : text;
  const order = [];
  const first = resultSection.match(
    /(?:^|\s)(?:１|1)\s+([1-6])\s+\d{4}\s+/
  );
  const second = resultSection.match(
    /(?:^|\s)(?:２|2)\s+([1-6])\s+\d{4}\s+/
  );
  const third = resultSection.match(
    /(?:^|\s)(?:３|3)\s+([1-6])\s+\d{4}\s+/
  );
  if (first) {
    order.push(
      Number(
        first[1]
      )
    );
  }
  if (second) {
    order.push(
      Number(
        second[1]
      )
    );
  }
  if (third) {
    order.push(
      Number(
        third[1]
      )
    );
  }
  return order;
}
__name(parseOrder, "parseOrder");
function parseResult(html) {
  const text = stripHtml(
    html
  );
  const trifecta = parseTrifectaResult(
    html
  );
  let order = parseOrder(
    html
  );
  if (order.length < 3 && trifecta.combination) {
    order = trifecta.combination.split(
      "-"
    ).map(
      Number
    );
  }
  const methodMatch = text.match(
    /決まり手\s*(逃げ|差し|まくり差し|まくり|抜き|恵まれ)/
  );
  const finished = Boolean(
    trifecta.combination && trifecta.payout !== null
  );
  return {
    finished,
    combination: finished ? trifecta.combination : null,
    payout: finished ? trifecta.payout : null,
    winningLanes: finished ? order.slice(
      0,
      3
    ) : [],
    method: methodMatch ? methodMatch[1] : null
  };
}
__name(parseResult, "parseResult");
async function resultData(hd, jcd, rno) {
  const html = await officialFetch(
    `/owpc/pc/race/raceresult?hd=${hd}&jcd=${jcd}&rno=${rno}`
  );
  return {
    hd,
    jcd,
    venue: VENUE_NAMES[jcd] || jcd,
    rno: Number(rno),
    ...parseResult(
      html
    )
  };
}
__name(resultData, "resultData");

// src/purpose.mjs
function selectPurposePicks(allBets) {
  const ranked = (allBets || []).filter((b) => Number.isFinite(b.probability) && b.probability > 0 && Number.isFinite(b.odds) && b.odds > 0);
  const compact = /* @__PURE__ */ __name((b) => ({ combination: b.combination, probability: b.probability, odds: b.odds, ev: b.ev, totalScore: b.totalScore }), "compact");
  const firstChance = /* @__PURE__ */ new Map();
  for (const b of ranked) {
    const first = String(b.combination).split("-")[0];
    firstChance.set(first, (firstChance.get(first) || 0) + b.probability);
  }
  const [axis, axisChance] = [...firstChance].sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const axisBets = ranked.filter((b) => String(b.combination).startsWith(axis + "-")).sort((a, b) => b.probability - a.probability);
  const top3Chance = axisBets.slice(0, 3).reduce((sum, b) => sum + b.probability, 0);
  const mainCount = axisChance >= 0.4 && top3Chance / axisChance >= 0.45 ? 3 : 6;
  const hit = (axisChance >= 0.4 ? axisBets : ranked.slice().sort((a, b) => b.probability - a.probability)).slice(0, mainCount);
  const selected = new Set(hit.map((b) => b.combination));
  const candidates = axisChance >= 0.75 ? [] : ranked.filter((b) => !selected.has(b.combination) && b.odds >= 30 && b.probability >= 1e-3 && b.ev >= 0.6).sort((a, b) => b.ev * Math.sqrt(b.probability) - a.ev * Math.sqrt(a.probability) || b.probability - a.probability);
  const target = Math.min(16, Math.max(4, Math.ceil(candidates.length * 0.2)));
  const high = [], headCounts = /* @__PURE__ */ new Map();
  for (const bet of candidates) {
    const first = String(bet.combination).split("-")[0];
    if ((headCounts.get(first) || 0) >= Math.ceil(target / 2)) continue;
    high.push(bet);
    headCounts.set(first, (headCounts.get(first) || 0) + 1);
    if (high.length >= target) break;
  }
  return { hit: hit.map(compact), high: high.map(compact) };
}
__name(selectPurposePicks, "selectPurposePicks");

// src/model.mjs
var COMPONENT_NAMES = {
  lane: "\u67A0\u30FB\u30B3\u30FC\u30B9\u57FA\u672C\u529B",
  class: "\u7D1A\u5225",
  national: "\u5168\u56FD\u52DD\u7387",
  local: "\u5F53\u5730\u52DD\u7387",
  st: "\u5E73\u5747ST",
  motor: "\u30E2\u30FC\u30BF\u30FC",
  exhibition: "\u5C55\u793A\u30BF\u30A4\u30E0",
  exhibitionST: "\u5C55\u793AST",
  course: "\u5C55\u793A\u30B3\u30FC\u30B9"
};
var ROLE_WEIGHTS = {
  first: {
    lane: 1.25,
    class: 0.9,
    national: 1.15,
    local: 0.75,
    st: 1.25,
    motor: 0.7,
    exhibition: 0.8,
    exhibitionST: 0.9,
    course: 1.15
  },
  second: {
    lane: 0.75,
    class: 0.85,
    national: 0.9,
    local: 1.05,
    st: 0.85,
    motor: 1.15,
    exhibition: 1.15,
    exhibitionST: 1,
    course: 0.75
  },
  third: {
    lane: 0.38,
    class: 0.65,
    national: 0.78,
    local: 1.08,
    st: 0.68,
    motor: 1.32,
    exhibition: 1.22,
    exhibitionST: 0.98,
    course: 0.46
  }
};
function mergeBefore(racers, beforeData2) {
  return racers.map(
    (racer) => {
      const live = beforeData2?.racers?.find(
        (item) => Number(
          item.lane
        ) === Number(
          racer.lane
        )
      );
      return {
        ...racer,
        before: {
          course: live?.course ?? null,
          exhibitionTime: live?.exhibitionTime ?? null,
          exhibitionST: live?.exhibitionST ?? null,
          tilt: live?.tilt ?? null,
          partsChanges: live?.partsChanges ?? null
        }
      };
    }
  );
}
__name(mergeBefore, "mergeBefore");
function scoreComponents(racer, allRacers) {
  const components = {
    lane: 0,
    class: 0,
    national: 0,
    local: 0,
    st: 0,
    motor: 0,
    exhibition: 0,
    exhibitionST: 0,
    course: 0
  };
  components.lane = {
    1: 25,
    2: 19,
    3: 16,
    4: 13,
    5: 8,
    6: 5
  }[racer.lane] || 0;
  components.class = {
    A1: 15,
    A2: 12,
    B1: 7,
    B2: 3
  }[racer.class] || 0;
  const national = safeNumber(
    racer.national?.winRate
  );
  if (national !== null) {
    components.national = Math.min(
      18,
      national * 2.25
    );
  }
  const local = safeNumber(
    racer.local?.winRate
  );
  if (local !== null) {
    components.local = Math.min(
      10,
      local * 1.25
    );
  }
  const avgST = safeNumber(
    racer.avgST
  );
  if (avgST !== null) {
    components.st = avgST <= 0.12 ? 8 : avgST <= 0.14 ? 7 : avgST <= 0.16 ? 5 : avgST <= 0.18 ? 3 : 1;
  }
  const motor = safeNumber(
    racer.motor?.secondRate
  );
  if (motor !== null) {
    components.motor = Math.min(
      10,
      motor / 5
    );
  }
  const exhibitionTimes = allRacers.map(
    (item) => safeNumber(
      item.before?.exhibitionTime
    )
  ).filter(
    (item) => item !== null
  );
  const exhibition = safeNumber(
    racer.before?.exhibitionTime
  );
  if (exhibition !== null && exhibitionTimes.length) {
    const diff = exhibition - Math.min(
      ...exhibitionTimes
    );
    components.exhibition = diff <= 0.01 ? 8 : diff <= 0.03 ? 7 : diff <= 0.05 ? 5 : diff <= 0.08 ? 3 : 1;
  }
  const exhibitionST = safeNumber(
    racer.before?.exhibitionST
  );
  if (exhibitionST !== null) {
    components.exhibitionST = exhibitionST <= 0.05 ? 4 : exhibitionST <= 0.1 ? 3 : exhibitionST <= 0.15 ? 2 : 1;
  }
  const course = safeNumber(
    racer.before?.course
  );
  if (course === 1) {
    components.course = 2;
  } else if (course !== null && course <= 3) {
    components.course = 1;
  }
  return components;
}
__name(scoreComponents, "scoreComponents");
function blankWeights() {
  return Object.fromEntries(
    Object.keys(
      COMPONENT_NAMES
    ).map(
      (key) => [
        key,
        1
      ]
    )
  );
}
__name(blankWeights, "blankWeights");
async function getTrainableHistoryFromD1(env, asOfDate = null) {
  let sql = `
    SELECT
      race_key,
      race_date,
      race_data_json,
      result_json

    FROM learning_races

    WHERE finished = 1
  `;
  const binds = [];
  if (asOfDate) {
    sql += ` AND race_date < ?`;
    binds.push(
      String(
        asOfDate
      )
    );
  }
  sql += `
    ORDER BY
      race_date ASC,
      race_key ASC
  `;
  let statement = env.DB.prepare(
    sql
  );
  if (binds.length) {
    statement = statement.bind(
      ...binds
    );
  }
  const result = await statement.all();
  const items = [];
  for (const row of result.results || []) {
    const item = parseJsonSafe(
      row.race_data_json,
      {}
    ) || {};
    const separateResult = parseJsonSafe(
      row.result_json,
      null
    );
    if (!item.result && separateResult) {
      item.result = separateResult;
    }
    if (!item.date) {
      item.date = row.race_date;
    }
    if (item.result?.finished && Array.isArray(
      item.racersDetailed
    ) && item.racersDetailed.length === 6 && Array.isArray(
      item.result.winningLanes
    ) && item.result.winningLanes.length >= 3) {
      items.push(
        item
      );
    }
  }
  return items;
}
__name(getTrainableHistoryFromD1, "getTrainableHistoryFromD1");
var learningCache = new WeakMap();
async function calculateRoleLearnedWeights(env, asOfDate = null) {
  const key = String(asOfDate || "all");
  const cached = learningCache.get(env.DB);
  if (cached && cached.key === key && cached.expires > Date.now()) return cached.value;
  const value = await computeRoleLearnedWeights(env, asOfDate);
  learningCache.set(env.DB, { key, value, expires: Date.now() + 60000 });
  return value;
}
async function computeRoleLearnedWeights(env, asOfDate = null) {
  const history = await getTrainableHistoryFromD1(
    env,
    asOfDate
  );
  const roles = {
    first: blankWeights(),
    second: blankWeights(),
    third: blankWeights()
  };
  if (history.length < 10) {
    return {
      active: false,
      races: history.length,
      recentWeighted: false,
      roles,
      overall: blankWeights(),
      _history: history
    };
  }
  for (const role of [
    "first",
    "second",
    "third"
  ]) {
    const index = role === "first" ? 0 : role === "second" ? 1 : 2;
    const signals = Object.fromEntries(
      Object.keys(
        COMPONENT_NAMES
      ).map(
        (key) => [
          key,
          { sum: 0, count: 0 }
        ]
      )
    );
    for (let historyIndex = 0; historyIndex < history.length; historyIndex++) {
      const item = history[historyIndex];
      const distanceFromLatest = history.length - 1 - historyIndex;
      const recencyCopies = distanceFromLatest < 50 ? 3 : distanceFromLatest < 100 ? 2 : 1;
      const winningLanes = item.result.winningLanes.map(
        Number
      );
      const targetLane = winningLanes[index];
      const actual = item.racersDetailed.find(
        (racer) => Number(
          racer.lane
        ) === targetLane
      );
      if (!actual) {
        continue;
      }
      let pool = item.racersDetailed;
      if (role === "second") {
        pool = pool.filter(
          (racer) => Number(
            racer.lane
          ) !== winningLanes[0]
        );
      }
      if (role === "third") {
        pool = pool.filter(
          (racer) => Number(
            racer.lane
          ) !== winningLanes[0] && Number(
            racer.lane
          ) !== winningLanes[1]
        );
      }
      for (const key of Object.keys(
        COMPONENT_NAMES
      )) {
        const values = pool.map(
          (racer) => Number(
            racer.components?.[key] || 0
          )
        );
        const average2 = values.length ? values.reduce(
          (total, value2) => total + value2,
          0
        ) / values.length : 0;
        const winnerValue = Number(
          actual.components?.[key] || 0
        );
        if (average2 > 0) {
          const signal = (winnerValue - average2) / average2;
          for (let copy = 0; copy < recencyCopies; copy++) {
            signals[key].sum += signal;
            signals[key].count++;
          }
        }
      }
    }
    for (const key of Object.keys(
      COMPONENT_NAMES
    )) {
      const values = signals[key];
      if (!values.count) {
        roles[role][key] = 1;
        continue;
      }
      const average2 = values.sum / values.count;
      const rate = role === "third" ? 0.45 : 0.35;
      const limit = role === "third" ? 0.22 : 0.18;
      const adjustment = clamp(
        average2 * rate,
        -limit,
        limit
      );
      roles[role][key] = Math.round(
        (1 + adjustment) * 1e3
      ) / 1e3;
    }
  }
  const overall = {};
  for (const key of Object.keys(
    COMPONENT_NAMES
  )) {
    overall[key] = Math.round(
      (roles.first[key] + roles.second[key] + roles.third[key]) / 3 * 1e3
    ) / 1e3;
  }
  return {
    active: true,
    races: history.length,
    recentWeighted: true,
    recent50: Math.min(
      history.length,
      50
    ),
    recent100: Math.min(
      history.length,
      100
    ),
    roles,
    overall,
    /* buildServerPrediction 内だけで使う。snapshotには保存しない */
    _history: history
  };
}
__name(calculateRoleLearnedWeights, "calculateRoleLearnedWeights");
function roleScore(components, learned, role) {
  let score = 0;
  for (const key of Object.keys(
    COMPONENT_NAMES
  )) {
    score += Number(
      components[key] || 0
    ) * Number(
      learned[key] || 1
    ) * Number(
      ROLE_WEIGHTS[role][key] || 1
    );
  }
  return Math.round(
    score * 10
  ) / 10;
}
__name(roleScore, "roleScore");
function overallScore(components, weights) {
  let score = 0;
  for (const key of Object.keys(
    COMPONENT_NAMES
  )) {
    score += Number(
      components[key] || 0
    ) * Number(
      weights[key] || 1
    );
  }
  return Math.round(
    score * 10
  ) / 10;
}
__name(overallScore, "overallScore");
function normalizedFieldPosition(value2, values, lowerIsBetter = false) {
  const v = safeNumber(
    value2
  );
  const list = values.map(
    safeNumber
  ).filter(
    (item) => item !== null
  );
  if (v === null || list.length < 2) {
    return null;
  }
  const min = Math.min(
    ...list
  );
  const max = Math.max(
    ...list
  );
  if (max === min) {
    return 0.5;
  }
  const p = clamp(
    (v - min) / (max - min),
    0,
    1
  );
  return lowerIsBetter ? 1 - p : p;
}
__name(normalizedFieldPosition, "normalizedFieldPosition");
function lane1GuardInfo(racers) {
  const lane1 = racers.find(
    (racer) => Number(
      racer.lane
    ) === 1
  );
  if (!lane1) {
    return {
      active: false,
      support: 0.5,
      adjustment: 0,
      availableWeight: 0,
      details: {}
    };
  }
  const definitions = [
    {
      key: "exhibitionST",
      weight: 0.3,
      value: lane1.before?.exhibitionST,
      values: racers.map(
        (racer) => racer.before?.exhibitionST
      ),
      lower: true
    },
    {
      key: "motor",
      weight: 0.25,
      value: lane1.motor?.secondRate,
      values: racers.map(
        (racer) => racer.motor?.secondRate
      ),
      lower: false
    },
    {
      key: "local",
      weight: 0.2,
      value: lane1.local?.winRate,
      values: racers.map(
        (racer) => racer.local?.winRate
      ),
      lower: false
    },
    {
      key: "exhibitionTime",
      weight: 0.15,
      value: lane1.before?.exhibitionTime,
      values: racers.map(
        (racer) => racer.before?.exhibitionTime
      ),
      lower: true
    },
    {
      key: "avgST",
      weight: 0.1,
      value: lane1.avgST,
      values: racers.map(
        (racer) => racer.avgST
      ),
      lower: true
    }
  ];
  let weighted2 = 0;
  let availableWeight = 0;
  const details = {};
  for (const definition of definitions) {
    const position = normalizedFieldPosition(
      definition.value,
      definition.values,
      definition.lower
    );
    details[definition.key] = position;
    if (position === null) {
      continue;
    }
    weighted2 += position * definition.weight;
    availableWeight += definition.weight;
  }
  const support = availableWeight > 0 ? weighted2 / availableWeight : 0.5;
  let adjustment = 0;
  if (availableWeight >= 0.35) {
    if (support < 0.3) {
      adjustment = -6;
    } else if (support < 0.4) {
      adjustment = -4.5;
    } else if (support < 0.5) {
      adjustment = -2.5;
    } else if (support > 0.82) {
      adjustment = 1;
    }
  }
  const actualCourse = safeNumber(
    lane1.before?.course
  );
  if (actualCourse !== null && actualCourse !== 1) {
    adjustment -= 3;
  }
  return {
    active: availableWeight >= 0.35,
    support: Math.round(
      support * 1e3
    ) / 1e3,
    adjustment: Math.round(
      adjustment * 10
    ) / 10,
    availableWeight: Math.round(
      availableWeight * 1e3
    ) / 1e3,
    details,
    course: actualCourse
  };
}
__name(lane1GuardInfo, "lane1GuardInfo");
function applyLane1Guard(racers) {
  const info = lane1GuardInfo(
    racers
  );
  if (!info.adjustment) {
    return info;
  }
  const lane1 = racers.find(
    (racer) => Number(
      racer.lane
    ) === 1
  );
  if (lane1) {
    lane1.firstScore = Math.round(
      (Number(
        lane1.firstScore || 0
      ) + info.adjustment) * 10
    ) / 10;
  }
  return info;
}
__name(applyLane1Guard, "applyLane1Guard");
function historyWinnerLane(item) {
  return Number(
    item?.result?.winningLanes?.[0] || String(
      item?.result?.combination || ""
    ).split("-")[0] || 0
  );
}
__name(historyWinnerLane, "historyWinnerLane");
function historyTopFirstLane(item) {
  const racers = Array.isArray(
    item?.racersDetailed
  ) ? item.racersDetailed : [];
  if (racers.length) {
    const ranked = racers.slice().sort(
      (a, b) => Number(
        b.firstScore || 0
      ) - Number(
        a.firstScore || 0
      )
    );
    if (ranked[0]) {
      return Number(
        ranked[0].lane || 0
      );
    }
  }
  const firstBet = Array.isArray(
    item?.bets
  ) ? item.bets[0] : null;
  return Number(
    String(
      firstBet?.combination || ""
    ).split("-")[0] || 0
  );
}
__name(historyTopFirstLane, "historyTopFirstLane");
function historyMain6Hit(item) {
  const combination = item?.result?.combination || (Array.isArray(
    item?.result?.winningLanes
  ) ? item.result.winningLanes.slice(0, 3).join("-") : null);
  if (!combination) {
    return false;
  }
  return Array.isArray(
    item?.bets
  ) ? item.bets.slice(0, 6).some(
    (bet) => bet?.combination === combination
  ) : false;
}
__name(historyMain6Hit, "historyMain6Hit");
function historyTop6Expected(item) {
  if (!Array.isArray(
    item?.bets
  )) {
    return 0;
  }
  return clamp(
    item.bets.slice(0, 6).reduce(
      (sum, bet) => sum + Number(
        bet?.probability || 0
      ),
      0
    ),
    0,
    1
  );
}
__name(historyTop6Expected, "historyTop6Expected");
function raceBand(rno) {
  const n = Number(
    rno || 0
  );
  if (n <= 4) {
    return "EARLY";
  }
  if (n <= 8) {
    return "MIDDLE";
  }
  return "LATE";
}
__name(raceBand, "raceBand");
function smoothedLaneWinRate(items, lane, priorRate, priorWeight = 12) {
  const n = items.length;
  if (!n) {
    return {
      races: 0,
      wins: 0,
      rate: priorRate
    };
  }
  const wins = items.filter(
    (item) => historyWinnerLane(
      item
    ) === Number(
      lane
    )
  ).length;
  return {
    races: n,
    wins,
    rate: (wins + priorRate * priorWeight) / (n + priorWeight)
  };
}
__name(smoothedLaneWinRate, "smoothedLaneWinRate");
function calculateVenueRnoFactors(history, context, racers) {
  const recent = history.slice(
    -300
  );
  const factors = {};
  const diagnostics = {};
  for (const racer of racers) {
    const lane = Number(
      racer.lane
    );
    const globalLane = smoothedLaneWinRate(
      recent,
      lane,
      1 / 6,
      18
    );
    const baseRate = Math.max(
      globalLane.rate,
      0.03
    );
    const venueItems = recent.filter(
      (item) => String(
        item.jcd || ""
      ).padStart(2, "0") === String(
        context.jcd || ""
      ).padStart(2, "0")
    );
    const exactItems = venueItems.filter(
      (item) => Number(
        item.rno
      ) === Number(
        context.rno
      )
    );
    const rnoItems = recent.filter(
      (item) => Number(
        item.rno
      ) === Number(
        context.rno
      )
    );
    const band = raceBand(
      context.rno
    );
    const bandItems = recent.filter(
      (item) => raceBand(
        item.rno
      ) === band
    );
    const venue = smoothedLaneWinRate(
      venueItems,
      lane,
      baseRate,
      10
    );
    const exact = smoothedLaneWinRate(
      exactItems,
      lane,
      baseRate,
      14
    );
    const rno = smoothedLaneWinRate(
      rnoItems,
      lane,
      baseRate,
      14
    );
    const bandStats = smoothedLaneWinRate(
      bandItems,
      lane,
      baseRate,
      16
    );
    const venueWeight = Math.min(
      venueItems.length / 24,
      1
    );
    const exactWeight = Math.min(
      exactItems.length / 10,
      1
    );
    const rnoWeight = Math.min(
      rnoItems.length / 28,
      1
    );
    const bandWeight = Math.min(
      bandItems.length / 40,
      1
    );
    const logAdjustment = Math.log(
      clamp(
        venue.rate / baseRate,
        0.65,
        1.35
      )
    ) * 0.4 * venueWeight + Math.log(
      clamp(
        exact.rate / baseRate,
        0.65,
        1.35
      )
    ) * 0.3 * exactWeight + Math.log(
      clamp(
        rno.rate / baseRate,
        0.7,
        1.3
      )
    ) * 0.18 * rnoWeight + Math.log(
      clamp(
        bandStats.rate / baseRate,
        0.75,
        1.25
      )
    ) * 0.12 * bandWeight;
    const factor = clamp(
      Math.exp(
        logAdjustment
      ),
      0.84,
      1.16
    );
    factors[lane] = Math.round(
      factor * 1e3
    ) / 1e3;
    diagnostics[lane] = {
      baseRate,
      venue,
      exact,
      rno,
      band: bandStats,
      factor: factors[lane]
    };
  }
  return {
    factors,
    diagnostics,
    sample: recent.length
  };
}
__name(calculateVenueRnoFactors, "calculateVenueRnoFactors");
function applyVenueRnoFactors(racers, contextLearning) {
  for (const racer of racers) {
    const factor = Number(
      contextLearning?.factors?.[racer.lane] || 1
    );
    racer.firstScore = Math.round(
      (Number(
        racer.firstScore || 0
      ) + 20 * Math.log(
        clamp(
          factor,
          0.84,
          1.16
        )
      )) * 10
    ) / 10;
  }
}
__name(applyVenueRnoFactors, "applyVenueRnoFactors");
function calibrationFromItems(items, minSample = 8) {
  const n = items.length;
  if (n < minSample) {
    return {
      sample: n,
      hits: items.filter(
        historyMain6Hit
      ).length,
      actual: null,
      expected: null,
      factor: 1
    };
  }
  const hits = items.filter(
    historyMain6Hit
  ).length;
  const actual = hits / n;
  const expected = items.reduce(
    (sum, item) => sum + historyTop6Expected(
      item
    ),
    0
  ) / n;
  const reliability = Math.min(
    n / 30,
    1
  );
  const factor = clamp(
    1 + (actual - expected) * 1.35 * reliability,
    0.82,
    1.08
  );
  return {
    sample: n,
    hits,
    actual: Math.round(
      actual * 1e3
    ) / 1e3,
    expected: Math.round(
      expected * 1e3
    ) / 1e3,
    factor: Math.round(
      factor * 1e3
    ) / 1e3
  };
}
__name(calibrationFromItems, "calibrationFromItems");
function recencyWeightedCalibrationFromItems(items, minSample = 10) {
  const n = items.length;
  const plainHits = items.filter(
    historyMain6Hit
  ).length;
  if (n < minSample) {
    return {
      sample: n,
      hits: plainHits,
      actual: null,
      expected: null,
      gap: null,
      factor: 1
    };
  }
  let weightedHits = 0;
  let weightedExpected = 0;
  let weightTotal = 0;
  for (let i = 0; i < items.length; i++) {
    const distance = items.length - 1 - i;
    const weight = distance < 30 ? 2.2 : distance < 70 ? 1.5 : 1;
    const hit = historyMain6Hit(
      items[i]
    ) ? 1 : 0;
    weightedHits += hit * weight;
    weightedExpected += historyTop6Expected(
      items[i]
    ) * weight;
    weightTotal += weight;
  }
  const actual = weightTotal ? weightedHits / weightTotal : 0;
  const expected = weightTotal ? weightedExpected / weightTotal : 0;
  const gap = actual - expected;
  const reliability = Math.min(
    n / 36,
    1
  );
  const sensitivity = gap < 0 ? 1.65 : 0.75;
  const factor = clamp(
    1 + gap * sensitivity * reliability,
    0.8,
    1.06
  );
  return {
    sample: n,
    hits: plainHits,
    actual: Math.round(
      actual * 1e3
    ) / 1e3,
    expected: Math.round(
      expected * 1e3
    ) / 1e3,
    gap: Math.round(
      gap * 1e3
    ) / 1e3,
    factor: Math.round(
      factor * 1e3
    ) / 1e3
  };
}
__name(recencyWeightedCalibrationFromItems, "recencyWeightedCalibrationFromItems");
function probabilityCalibrationBucket(expected) {
  const p = Number(
    expected || 0
  );
  if (p < 0.18) {
    return "P_LT18";
  }
  if (p < 0.24) {
    return "P_18_23";
  }
  if (p < 0.3) {
    return "P_24_29";
  }
  return "P_30_PLUS";
}
__name(probabilityCalibrationBucket, "probabilityCalibrationBucket");
function scoreCalibrationBucket(score) {
  const s = Number(
    score || 0
  );
  if (s < 75) {
    return "S_68_74";
  }
  if (s < 80) {
    return "S_75_79";
  }
  if (s < 90) {
    return "S_80_89";
  }
  return "S_90_PLUS";
}
__name(scoreCalibrationBucket, "scoreCalibrationBucket");
function calculateProbabilityCalibration(history, currentExpected) {
  const recent = history.slice(-180).filter(
    (item) => historyTop6Expected(
      item
    ) > 0
  );
  const bucket2 = probabilityCalibrationBucket(
    currentExpected
  );
  const sameBucket = recent.filter(
    (item) => probabilityCalibrationBucket(
      historyTop6Expected(
        item
      )
    ) === bucket2
  );
  const selected = sameBucket.length >= 10 ? sameBucket : recent.slice(-100);
  return {
    bucket: bucket2,
    fallback: sameBucket.length < 10,
    ...recencyWeightedCalibrationFromItems(
      selected,
      10
    )
  };
}
__name(calculateProbabilityCalibration, "calculateProbabilityCalibration");
function calculateScoreBandCalibrations(history) {
  const recent = history.slice(-220).filter(
    (item) => item.confidence === "S" && item.sDecision?.status === "BET" && Number(
      item.sDecision?.score || 0
    ) >= 68
  );
  const buckets = {};
  for (const key of [
    "S_68_74",
    "S_75_79",
    "S_80_89",
    "S_90_PLUS"
  ]) {
    const selected = recent.filter(
      (item) => scoreCalibrationBucket(
        item.sDecision?.score || 0
      ) === key
    );
    buckets[key] = recencyWeightedCalibrationFromItems(
      selected,
      8
    );
  }
  buckets.ALL = recencyWeightedCalibrationFromItems(
    recent,
    10
  );
  return buckets;
}
__name(calculateScoreBandCalibrations, "calculateScoreBandCalibrations");
function expectedCalibrationError(items) {
  if (!items.length) {
    return null;
  }
  const bins = [
    [0, 0.18],
    [0.18, 0.24],
    [0.24, 0.3],
    [0.3, 1.01]
  ];
  let ece = 0;
  for (const [low, high] of bins) {
    const bucket2 = items.filter(
      (item) => {
        const p = historyTop6Expected(
          item
        );
        return p >= low && p < high;
      }
    );
    if (!bucket2.length) {
      continue;
    }
    const actual = bucket2.filter(
      historyMain6Hit
    ).length / bucket2.length;
    const expected = bucket2.reduce(
      (sum, item) => sum + historyTop6Expected(
        item
      ),
      0
    ) / bucket2.length;
    ece += Math.abs(
      actual - expected
    ) * (bucket2.length / items.length);
  }
  return Math.round(
    ece * 1e3
  ) / 1e3;
}
__name(expectedCalibrationError, "expectedCalibrationError");
function calculateWalkForwardValidation(history) {
  const recent = history.slice(-160).filter(
    (item) => historyTop6Expected(
      item
    ) > 0
  );
  if (recent.length < 30) {
    return {
      sample: recent.length,
      blocks: [],
      actual: null,
      expected: null,
      gap: null,
      brier: null,
      ece: null,
      factor: 1
    };
  }
  const blockSize = 20;
  const blocks = [];
  for (let start = 0; start < recent.length; start += blockSize) {
    const block = recent.slice(
      start,
      start + blockSize
    );
    if (block.length < 10) {
      continue;
    }
    const actual2 = block.filter(
      historyMain6Hit
    ).length / block.length;
    const expected2 = block.reduce(
      (sum, item) => sum + historyTop6Expected(
        item
      ),
      0
    ) / block.length;
    blocks.push({
      sample: block.length,
      actual: Math.round(
        actual2 * 1e3
      ) / 1e3,
      expected: Math.round(
        expected2 * 1e3
      ) / 1e3,
      gap: Math.round(
        (actual2 - expected2) * 1e3
      ) / 1e3
    });
  }
  const validation = recent.slice(
    -Math.min(
      recent.length,
      80
    )
  );
  const actual = validation.filter(
    historyMain6Hit
  ).length / validation.length;
  const expected = validation.reduce(
    (sum, item) => sum + historyTop6Expected(
      item
    ),
    0
  ) / validation.length;
  const gap = actual - expected;
  const brier = validation.reduce(
    (sum, item) => {
      const p = historyTop6Expected(
        item
      );
      const y = historyMain6Hit(
        item
      ) ? 1 : 0;
      return sum + Math.pow(
        y - p,
        2
      );
    },
    0
  ) / validation.length;
  const reliability = Math.min(
    validation.length / 80,
    1
  );
  const factor = clamp(
    1 + gap * (gap < 0 ? 1.25 : 0.5) * reliability,
    0.86,
    1.04
  );
  return {
    sample: validation.length,
    blocks: blocks.slice(-5),
    actual: Math.round(
      actual * 1e3
    ) / 1e3,
    expected: Math.round(
      expected * 1e3
    ) / 1e3,
    gap: Math.round(
      gap * 1e3
    ) / 1e3,
    brier: Math.round(
      brier * 1e3
    ) / 1e3,
    ece: expectedCalibrationError(
      validation
    ),
    factor: Math.round(
      factor * 1e3
    ) / 1e3
  };
}
__name(calculateWalkForwardValidation, "calculateWalkForwardValidation");
function historyMissType(item) {
  if (historyMain6Hit(
    item
  )) {
    return "HIT";
  }
  const winning = Array.isArray(
    item?.result?.winningLanes
  ) ? item.result.winningLanes.slice(0, 3).map(Number) : String(
    item?.result?.combination || ""
  ).split("-").slice(0, 3).map(Number);
  if (winning.length < 3 || !winning[0]) {
    return "UNKNOWN";
  }
  const predictedFirst = historyTopFirstLane(
    item
  );
  if (predictedFirst !== winning[0]) {
    return "FIRST";
  }
  const main6 = Array.isArray(
    item?.bets
  ) ? item.bets.slice(0, 6) : [];
  const secondCandidates = new Set(
    main6.filter(
      (bet) => Number(
        String(
          bet?.combination || ""
        ).split("-")[0]
      ) === winning[0]
    ).map(
      (bet) => Number(
        String(
          bet?.combination || ""
        ).split("-")[1]
      )
    )
  );
  if (!secondCandidates.has(
    winning[1]
  )) {
    return "SECOND";
  }
  const thirdCandidates = new Set(
    main6.filter(
      (bet) => {
        const parts = String(
          bet?.combination || ""
        ).split("-").map(Number);
        return parts[0] === winning[0] && parts[1] === winning[1];
      }
    ).map(
      (bet) => Number(
        String(
          bet?.combination || ""
        ).split("-")[2]
      )
    )
  );
  if (!thirdCandidates.has(
    winning[2]
  )) {
    return "THIRD";
  }
  return "COMBINATION";
}
__name(historyMissType, "historyMissType");
function calculateMissProfile(history, topLane, strategyType) {
  const recentS = history.slice(-140).filter(
    (item) => item.confidence === "S" && item.sDecision?.status === "BET"
  );
  const exact = recentS.filter(
    (item) => historyTopFirstLane(
      item
    ) === Number(topLane) && item.strategy?.type === strategyType
  );
  const sameLane = recentS.filter(
    (item) => historyTopFirstLane(
      item
    ) === Number(topLane)
  );
  let selected = exact;
  let bucket2 = "lane+strategy";
  if (selected.length < 12) {
    selected = sameLane.length >= 12 ? sameLane : recentS;
    bucket2 = sameLane.length >= 12 ? "firstLane" : "allS";
  }
  const counts = {
    HIT: 0,
    FIRST: 0,
    SECOND: 0,
    THIRD: 0,
    COMBINATION: 0,
    UNKNOWN: 0
  };
  for (const item of selected) {
    const type = historyMissType(
      item
    );
    counts[type] = Number(
      counts[type] || 0
    ) + 1;
  }
  const n = selected.length;
  if (n < 12) {
    return {
      bucket: bucket2,
      sample: n,
      counts,
      firstMissRate: null,
      downstreamMissRate: null,
      factor: 1,
      firstRisk: false
    };
  }
  const firstMissRate = counts.FIRST / n;
  const downstreamMissRate = (counts.SECOND + counts.THIRD + counts.COMBINATION) / n;
  const reliability = Math.min(
    n / 35,
    1
  );
  const penalty = Math.max(
    0,
    firstMissRate - 0.26
  ) * 0.22 + Math.max(
    0,
    downstreamMissRate - 0.28
  ) * 0.12;
  const factor = clamp(
    1 - penalty * reliability,
    0.9,
    1
  );
  return {
    bucket: bucket2,
    sample: n,
    counts,
    firstMissRate: Math.round(
      firstMissRate * 1e3
    ) / 1e3,
    downstreamMissRate: Math.round(
      downstreamMissRate * 1e3
    ) / 1e3,
    factor: Math.round(
      factor * 1e3
    ) / 1e3,
    firstRisk: n >= 20 && firstMissRate >= 0.42
  };
}
__name(calculateMissProfile, "calculateMissProfile");
function calculateRecentPatternCalibration(history, strategy, racers) {
  const recent = history.slice(
    -100
  );
  const topLane = racers.slice().sort(
    (a, b) => b.firstScore - a.firstScore
  )[0]?.lane;
  const strategyType = strategy?.type || null;
  const exact = recent.filter(
    (item) => historyTopFirstLane(
      item
    ) === Number(
      topLane
    ) && item.strategy?.type === strategyType
  );
  const sameStrategy = recent.filter(
    (item) => item.strategy?.type === strategyType
  );
  const sameTopLane = recent.filter(
    (item) => historyTopFirstLane(
      item
    ) === Number(
      topLane
    )
  );
  let selected = exact;
  let bucket2 = "lane+strategy";
  if (selected.length < 8) {
    selected = sameStrategy.length >= 8 ? sameStrategy : sameTopLane.length >= 8 ? sameTopLane : recent;
    bucket2 = sameStrategy.length >= 8 ? "strategy" : sameTopLane.length >= 8 ? "firstLane" : "recent100";
  }
  return {
    bucket: bucket2,
    topLane: Number(
      topLane || 0
    ),
    strategyType,
    ...calibrationFromItems(
      selected,
      8
    )
  };
}
__name(calculateRecentPatternCalibration, "calculateRecentPatternCalibration");
function calculateSCalibration(history) {
  const recent = history.slice(
    -100
  );
  const sBet = recent.filter(
    (item) => item.confidence === "S" && item.sDecision?.status === "BET"
  );
  const fiveStar = sBet.filter(
    (item) => Number(
      item.sDecision?.score || 0
    ) >= 80
  );
  return {
    overall: calibrationFromItems(
      sBet,
      8
    ),
    fiveStar: calibrationFromItems(
      fiveStar,
      8
    )
  };
}
__name(calculateSCalibration, "calculateSCalibration");
function makeAdaptiveLearning(history, context, racers, strategy, lane1Guard, venueRnoLearning, allBets) {
  const recentPattern = calculateRecentPatternCalibration(
    history,
    strategy,
    racers
  );
  const sCalibration = calculateSCalibration(
    history
  );
  const topLane = racers.slice().sort(
    (a, b) => b.firstScore - a.firstScore
  )[0]?.lane;
  const currentExpected = Array.isArray(
    allBets
  ) ? allBets.slice(0, 6).reduce(
    (sum, bet) => sum + Number(
      bet?.probability || 0
    ),
    0
  ) : 0;
  const precisionCalibration = {
    probability: calculateProbabilityCalibration(
      history,
      currentExpected
    ),
    scoreBands: calculateScoreBandCalibrations(
      history
    ),
    walkForward: calculateWalkForwardValidation(
      history
    ),
    missProfile: calculateMissProfile(
      history,
      Number(
        topLane || 0
      ),
      strategy?.type || null
    )
  };
  return {
    historyRaces: history.length,
    recentWindow: Math.min(
      history.length,
      100
    ),
    lane1Guard,
    venueRno: {
      sample: venueRnoLearning?.sample || 0,
      topLane: Number(
        topLane || 0
      ),
      topLaneFactor: Number(
        venueRnoLearning?.factors?.[topLane] || 1
      ),
      band: raceBand(
        context.rno
      )
    },
    recentPattern,
    sCalibration,
    precisionCalibration
  };
}
__name(makeAdaptiveLearning, "makeAdaptiveLearning");
function makeAllCombinations() {
  const list = [];
  for (let first = 1; first <= 6; first++) {
    for (let second = 1; second <= 6; second++) {
      if (second === first) {
        continue;
      }
      for (let third = 1; third <= 6; third++) {
        if (third === first || third === second) {
          continue;
        }
        list.push(
          `${first}-${second}-${third}`
        );
      }
    }
  }
  return list;
}
__name(makeAllCombinations, "makeAllCombinations");
function strength(score) {
  return Math.exp(
    score / 20
  );
}
__name(strength, "strength");
function firstWinShare(lane, racers) {
  const total = racers.reduce(
    (sum, racer2) => sum + strength(
      racer2.firstScore
    ),
    0
  );
  const racer = racers.find(
    (item) => item.lane === lane
  );
  if (!racer || !total) {
    return 0;
  }
  return strength(
    racer.firstScore
  ) / total;
}
__name(firstWinShare, "firstWinShare");
function componentPosition(value2, values) {
  const numbers = values.map(
    Number
  ).filter(
    Number.isFinite
  );
  if (!numbers.length) {
    return 0.5;
  }
  const min = Math.min(
    ...numbers
  );
  const max = Math.max(
    ...numbers
  );
  if (max === min) {
    return 0.5;
  }
  return clamp(
    (Number(
      value2
    ) - min) / (max - min),
    0,
    1
  );
}
__name(componentPosition, "componentPosition");
function thirdConditionalScore(racer, first, second, racers) {
  const remaining = racers.filter(
    (item) => Number(
      item.lane
    ) !== Number(
      first
    ) && Number(
      item.lane
    ) !== Number(
      second
    )
  );
  if (!remaining.length) {
    return racer.thirdScore;
  }
  const components = racer.components || {};
  const motor = componentPosition(
    components.motor,
    remaining.map(
      (item) => item.components?.motor || 0
    )
  );
  const exhibition = componentPosition(
    components.exhibition,
    remaining.map(
      (item) => item.components?.exhibition || 0
    )
  );
  const local = componentPosition(
    components.local,
    remaining.map(
      (item) => item.components?.local || 0
    )
  );
  const national = componentPosition(
    components.national,
    remaining.map(
      (item) => item.components?.national || 0
    )
  );
  let bonus = motor * 1.6 + exhibition * 1.4 + local * 1 + national * 0.6;
  if (Number(
    racer.lane
  ) >= 4 && (motor >= 0.6 || exhibition >= 0.6)) {
    bonus += 0.6;
  }
  return Math.round(
    (Number(
      racer.thirdScore || 0
    ) + bonus) * 10
  ) / 10;
}
__name(thirdConditionalScore, "thirdConditionalScore");
function trifectaProbability(first, second, third, racers) {
  const firstRacer = racers.find(
    (racer) => racer.lane === first
  );
  const secondRacer = racers.find(
    (racer) => racer.lane === second
  );
  const thirdRacer = racers.find(
    (racer) => racer.lane === third
  );
  if (!firstRacer || !secondRacer || !thirdRacer) {
    return 0;
  }
  const firstTotal = racers.reduce(
    (sum, racer) => sum + strength(
      racer.firstScore
    ),
    0
  );
  const firstProbability = strength(
    firstRacer.firstScore
  ) / firstTotal;
  const secondCandidates = racers.filter(
    (racer) => racer.lane !== first
  );
  const secondTotal = secondCandidates.reduce(
    (sum, racer) => sum + strength(
      racer.secondScore
    ),
    0
  );
  const secondProbability = strength(
    secondRacer.secondScore
  ) / secondTotal;
  const thirdCandidates = racers.filter(
    (racer) => racer.lane !== first && racer.lane !== second
  );
  const thirdScores = thirdCandidates.map(
    (racer) => ({
      racer,
      score: thirdConditionalScore(
        racer,
        first,
        second,
        racers
      )
    })
  );
  const thirdTotal = thirdScores.reduce(
    (sum, item) => sum + strength(
      item.score
    ),
    0
  );
  const actualThird = thirdScores.find(
    (item) => item.racer.lane === third
  );
  const thirdProbability = actualThird && thirdTotal ? strength(
    actualThird.score
  ) / thirdTotal : 0;
  return firstProbability * secondProbability * thirdProbability;
}
__name(trifectaProbability, "trifectaProbability");
function makeOddsMap(oddsData2) {
  const map = {};
  for (const item of oddsData2?.odds || []) {
    const odds = Number(item.odds);
    if (Number.isFinite(odds) && odds > 0) {
      map[item.combination] = odds;
    }
  }
  return map;
}
__name(makeOddsMap, "makeOddsMap");
function evaluateBets(racers, oddsData2) {
  const oddsMap = makeOddsMap(
    oddsData2
  );
  const evaluated = [];
  const byLane = new Map(racers.map(r => [r.lane, r]));
  const firstTotal = racers.reduce((sum, r) => sum + strength(r.firstScore), 0);
  for (let first = 1; first <= 6; first++) {
    const firstRacer = byLane.get(first);
    if (!firstRacer) continue;
    const firstProbability = strength(firstRacer.firstScore) / firstTotal;
    const secondTotal = racers.filter(r => r.lane !== first)
      .reduce((sum, r) => sum + strength(r.secondScore), 0);
    for (let second = 1; second <= 6; second++) {
      const secondRacer = byLane.get(second);
      if (second === first || !secondRacer) continue;
      const secondProbability = strength(secondRacer.secondScore) / secondTotal;
      const thirds = racers.filter(r => r.lane !== first && r.lane !== second)
        .map(r => {
          const score = thirdConditionalScore(r, first, second, racers);
          return { lane: r.lane, score, value: strength(score) };
        });
      const thirdTotal = thirds.reduce((sum, r) => sum + r.value, 0);
      for (let third = 1; third <= 6; third++) {
        const item = thirds.find(r => r.lane === third);
        if (!item) continue;
        const combination = `${first}-${second}-${third}`;
        const odds = safeNumber(oddsMap[combination]);
        if (odds === null || odds <= 0) continue;
        const probability = firstProbability * secondProbability * (thirdTotal ? item.value / thirdTotal : 0);
        evaluated.push({ combination, first, second, third,
          firstRole: firstRacer.firstScore, secondRole: secondRacer.secondScore,
          thirdRole: item.score, probability, odds, ev: probability * odds });
      }
    }
  }
  if (!evaluated.length) {
    return [];
  }
  const maxFirst = Math.max(
    ...evaluated.map(
      (item) => item.firstRole
    ),
    1
  );
  const maxSecond = Math.max(
    ...evaluated.map(
      (item) => item.secondRole
    ),
    1
  );
  const maxThird = Math.max(
    ...evaluated.map(
      (item) => item.thirdRole
    ),
    1
  );
  const maxProbability = Math.max(
    ...evaluated.map(
      (item) => item.probability
    ),
    1e-6
  );
  const maxEv = Math.max(
    ...evaluated.map(
      (item) => Math.min(
        item.ev,
        3
      )
    ),
    1e-6
  );
  for (const item of evaluated) {
    const firstNorm = item.firstRole / maxFirst;
    const secondNorm = item.secondRole / maxSecond;
    const thirdNorm = item.thirdRole / maxThird;
    const probabilityNorm = item.probability / maxProbability;
    const evNorm = Math.log1p(
      Math.min(
        item.ev,
        3
      )
    ) / Math.log1p(
      maxEv
    );
    item.totalScore = Math.round(
      (firstNorm * 0.16 + secondNorm * 0.09 + thirdNorm * 0.1 + probabilityNorm * 0.56 + evNorm * 0.09) * 1e3
    ) / 10;
  }
  return evaluated.sort(
    (a, b) => b.totalScore - a.totalScore
  );
}
__name(evaluateBets, "evaluateBets");
function getConfidence(racers) {
  const ranked = racers.slice().sort(
    (a, b) => b.firstScore - a.firstScore
  );
  if (ranked.length < 3) {
    return "B";
  }
  const secondGap = ranked[0].firstScore - ranked[1].firstScore;
  const thirdGap = ranked[0].firstScore - ranked[2].firstScore;
  if (secondGap >= 9 && thirdGap >= 14) {
    return "S";
  }
  if (secondGap >= 4.5) {
    return "A";
  }
  return "B";
}
__name(getConfidence, "getConfidence");
function roleStability(racers, field) {
  const sorted = racers.slice().sort(
    (a, b) => b[field] - a[field]
  );
  if (sorted.length < 6) {
    return 0;
  }
  const top = (sorted[0][field] + sorted[1][field] + sorted[2][field]) / 3;
  const bottom = (sorted[3][field] + sorted[4][field] + sorted[5][field]) / 3;
  if (top <= 0) {
    return 0;
  }
  return clamp(
    (top - bottom) / top * 220,
    0,
    100
  );
}
__name(roleStability, "roleStability");
function beforeCoverage(racers) {
  let available = 0;
  let total = 0;
  for (const racer of racers) {
    for (const value2 of [
      racer.before?.exhibitionTime,
      racer.before?.exhibitionST,
      racer.before?.course
    ]) {
      total++;
      if (safeNumber(
        value2
      ) !== null) {
        available++;
      }
    }
  }
  return total ? available / total : 0;
}
__name(beforeCoverage, "beforeCoverage");
function makeSDecision(confidence, racers, allBets, adaptiveLearning = null) {
  if (confidence !== "S") {
    return {
      status: "NONE",
      label: `${confidence}\u8A55\u4FA1`,
      score: 0,
      metrics: null,
      reasons: []
    };
  }
  const ranked = racers.slice().sort(
    (a, b) => b.firstScore - a.firstScore
  );
  const topLane = Number(
    ranked[0]?.lane || 0
  );
  const firstShare = firstWinShare(
    ranked[0].lane,
    racers
  );
  const firstGap = ranked[0].firstScore - ranked[1].firstScore;
  const rawTop6Probability = allBets.slice(
    0,
    6
  ).reduce(
    (sum, bet) => sum + Number(
      bet.probability || 0
    ),
    0
  );
  const rawTop10Probability = allBets.slice(
    0,
    10
  ).reduce(
    (sum, bet) => sum + Number(
      bet.probability || 0
    ),
    0
  );
  const secondStable = roleStability(
    racers,
    "secondScore"
  );
  const thirdStable = roleStability(
    racers,
    "thirdScore"
  );
  const coverage = beforeCoverage(
    racers
  );
  const patternFactor = Number(
    adaptiveLearning?.recentPattern?.factor || 1
  );
  const sOverallFactor = Number(
    adaptiveLearning?.sCalibration?.overall?.factor || 1
  );
  const provisionalTop6Probability = clamp(
    rawTop6Probability * patternFactor * sOverallFactor,
    0,
    1
  );
  const provisionalQuality = (norm(
    firstShare,
    0.22,
    0.42
  ) * 0.25 + norm(
    provisionalTop6Probability,
    0.12,
    0.28
  ) * 0.25 + norm(
    firstGap,
    7,
    16
  ) * 0.15 + clamp(
    secondStable / 100,
    0,
    1
  ) * 0.1 + clamp(
    thirdStable / 100,
    0,
    1
  ) * 0.1 + clamp(
    coverage,
    0,
    1
  ) * 0.15) * 100;
  const highFactor = provisionalQuality >= 80 ? Number(
    adaptiveLearning?.sCalibration?.fiveStar?.factor || 1
  ) : 1;
  const probabilityCalibration = adaptiveLearning?.precisionCalibration?.probability || null;
  const probabilityFactor = Number(
    probabilityCalibration?.factor || 1
  );
  const scoreBucket = scoreCalibrationBucket(
    provisionalQuality
  );
  const scoreBandCalibration = adaptiveLearning?.precisionCalibration?.scoreBands?.[scoreBucket] || adaptiveLearning?.precisionCalibration?.scoreBands?.ALL || null;
  const scoreBandFactor = Number(
    scoreBandCalibration?.factor || 1
  );
  const walkForwardCalibration = adaptiveLearning?.precisionCalibration?.walkForward || null;
  const walkForwardFactor = Number(
    walkForwardCalibration?.factor || 1
  );
  const missProfile = adaptiveLearning?.precisionCalibration?.missProfile || null;
  const missProfileFactor = Number(
    missProfile?.factor || 1
  );
  const calibrationFactor = clamp(
    patternFactor * sOverallFactor * highFactor * probabilityFactor * scoreBandFactor * walkForwardFactor * missProfileFactor,
    0.62,
    1.08
  );
  const top6Probability = clamp(
    rawTop6Probability * calibrationFactor,
    0,
    1
  );
  const top10Probability = clamp(
    rawTop10Probability * calibrationFactor,
    0,
    1
  );
  const quality = (norm(
    firstShare,
    0.22,
    0.42
  ) * 0.25 + norm(
    top6Probability,
    0.12,
    0.28
  ) * 0.25 + norm(
    firstGap,
    7,
    16
  ) * 0.15 + clamp(
    secondStable / 100,
    0,
    1
  ) * 0.1 + clamp(
    thirdStable / 100,
    0,
    1
  ) * 0.1 + clamp(
    coverage,
    0,
    1
  ) * 0.15) * 100;
  const calibrationScoreAdjustment = (calibrationFactor - 1) * 35;
  const score = Math.round(
    clamp(
      quality + calibrationScoreAdjustment,
      0,
      100
    ) * 10
  ) / 10;
  const lane1Guard = adaptiveLearning?.lane1Guard || null;
  const lane1Risk = topLane === 1 && lane1Guard?.active && Number(
    lane1Guard.support || 0
  ) < 0.42;
  const precisionWarnings = [
    patternFactor < 0.94,
    probabilityFactor < 0.94,
    scoreBandFactor < 0.94,
    walkForwardFactor < 0.94,
    missProfileFactor < 0.94,
    Number(
      adaptiveLearning?.venueRno?.topLaneFactor || 1
    ) < 0.94
  ].filter(Boolean).length;
  const precisionRisk = precisionWarnings >= 3 || precisionWarnings >= 2 && score < 80 || Boolean(
    missProfile?.firstRisk
  );
  const reasons = [];
  if (firstShare < 0.3) {
    reasons.push(
      "1\u7740\u5019\u88DC\u306E\u512A\u4F4D\u5EA6\u304C\u5F31\u3044"
    );
  }
  if (top6Probability < 0.18) {
    reasons.push(
      "\u76F4\u8FD1\u5B9F\u7E3E\u88DC\u6B63\u5F8C\u3001\u4E0A\u4F4D6\u70B9\u3078\u306E\u78BA\u7387\u96C6\u4E2D\u304C\u57FA\u6E96\u672A\u6E80"
    );
  }
  if (secondStable < 35) {
    reasons.push(
      "2\u7740\u5019\u88DC\u304C\u3070\u3089\u3051\u3066\u3044\u308B"
    );
  }
  if (thirdStable < 30) {
    reasons.push(
      "3\u7740\u5019\u88DC\u304C\u3070\u3089\u3051\u3066\u3044\u308B"
    );
  }
  if (coverage < 0.55) {
    reasons.push(
      "\u5C55\u793A\u30C7\u30FC\u30BF\u304C\u4E0D\u8DB3"
    );
  }
  if (lane1Risk) {
    reasons.push(
      "1\u53F7\u8247\u306E\u5C55\u793AST\u30FB\u30E2\u30FC\u30BF\u30FC\u30FB\u5F53\u5730\u6210\u7E3E\u306A\u3069\u306E\u88CF\u4ED8\u3051\u304C\u5F31\u3044"
    );
  }
  if (patternFactor < 0.94) {
    reasons.push(
      "\u76F4\u8FD1100R\u3067\u540C\u578B\u30D1\u30BF\u30FC\u30F3\u306E\u6210\u7E3E\u304C\u5F31\u3044\u305F\u3081\u81EA\u52D5\u6E1B\u70B9"
    );
  }
  if (sOverallFactor < 0.94 || highFactor < 0.94) {
    reasons.push(
      "\u904E\u53BB\u306ES/\u2605\u2605\u2605\u2605\u2605\u5B9F\u7E3E\u3092\u7167\u5408\u3057\u3066\u4FE1\u983C\u5EA6\u3092\u81EA\u52D5\u88DC\u6B63"
    );
  }
  if (probabilityFactor < 0.94) {
    reasons.push(
      "\u540C\u3058\u4E88\u6E2C\u78BA\u7387\u5E2F\u306E\u5B9F\u6E2C\u7684\u4E2D\u7387\u304C\u5F31\u3044\u305F\u3081\u81EA\u52D5\u6821\u6B63"
    );
  }
  if (scoreBandFactor < 0.94) {
    reasons.push(
      "\u540C\u3058S\u30B9\u30B3\u30A2\u5E2F\u306E\u5B9F\u6E2C\u6210\u7E3E\u304C\u5F31\u3044\u305F\u3081\u81EA\u52D5\u6821\u6B63"
    );
  }
  if (walkForwardFactor < 0.94) {
    reasons.push(
      "\u6642\u7CFB\u5217\u30A6\u30A9\u30FC\u30AF\u30D5\u30A9\u30EF\u30FC\u30C9\u691C\u8A3C\u3067\u76F4\u8FD1\u7CBE\u5EA6\u304C\u5F31\u3044"
    );
  }
  if (missProfileFactor < 0.94 || missProfile?.firstRisk) {
    reasons.push(
      "\u6700\u8FD1\u306E\u5916\u308C\u65B9\u3092\u5206\u985E\u3057\u305F\u7D50\u679C\u3001\u540C\u578B\u30D1\u30BF\u30FC\u30F3\u306E\u5931\u6557\u304C\u591A\u3044"
    );
  }
  if (precisionRisk) {
    reasons.push(
      "\u8907\u6570\u306E\u7CBE\u5EA6\u691C\u8A3C\u304C\u540C\u6642\u306B\u5F31\u3044\u305F\u3081\u9AD8\u30B9\u30B3\u30A2\u3067\u3082\u898B\u9001\u308A"
    );
  }
  if (score < 68) {
    reasons.push(
      "\u88DC\u6B63\u5F8C\u306E\u7DCF\u5408\u5B89\u5B9A\u30B9\u30B3\u30A2\u304C\u57FA\u6E96\u672A\u6E80"
    );
  }
  const battle = score >= 68 && firstShare >= 0.3 && top6Probability >= 0.18 && coverage >= 0.55 && !lane1Risk && !precisionRisk;
  return {
    status: battle ? "BET" : "PASS",
    label: battle ? "\u{1F525} S\u52DD\u8CA0" : "\u26A0\uFE0F S\u898B\u9001\u308A",
    score,
    metrics: {
      firstShare,
      rawTop6Probability,
      top6Probability,
      rawTop10Probability,
      top10Probability,
      calibrationFactor,
      recentPatternFactor: patternFactor,
      sCalibrationFactor: sOverallFactor,
      fiveStarCalibrationFactor: highFactor,
      probabilityCalibrationFactor: probabilityFactor,
      scoreBandCalibrationFactor: scoreBandFactor,
      scoreCalibrationBucket: scoreBucket,
      walkForwardCalibrationFactor: walkForwardFactor,
      walkForwardECE: walkForwardCalibration?.ece ?? null,
      missProfileFactor,
      missProfileFirstRate: missProfile?.firstMissRate ?? null,
      precisionWarnings,
      precisionRisk,
      firstGap,
      secondStability: secondStable,
      thirdStability: thirdStable,
      beforeCoverage: coverage,
      lane1Support: lane1Guard?.support ?? null,
      venueRnoFactor: adaptiveLearning?.venueRno?.topLaneFactor ?? 1
    },
    reasons: battle ? [
      "1\u7740\u5019\u88DC\u304C\u512A\u52E2",
      "\u76F4\u8FD1100R\u30FB\u78BA\u7387\u5E2F\u30FBS\u30B9\u30B3\u30A2\u5E2F\u306E\u88DC\u6B63\u5F8C\u3082\u57FA\u6E96\u3092\u30AF\u30EA\u30A2",
      "\u5C55\u793A\u30FB\u4F1A\u5834\u30FBR\u5225\u30FB\u30A6\u30A9\u30FC\u30AF\u30D5\u30A9\u30EF\u30FC\u30C9\u691C\u8A3C\u3092\u78BA\u8A8D"
    ] : reasons
  };
}
__name(makeSDecision, "makeSDecision");
function selectMainlineBets(allBets, racers, confidence) {
  const firstRank = racers.slice().sort((a, b) => b.firstScore - a.firstScore);
  const top1 = firstRank[0];
  const top2 = firstRank[1];
  const share = firstWinShare(top1.lane, racers);
  const top2Share = firstWinShare(top2.lane, racers);
  const gap = top1.firstScore - top2.firstScore;
  const firstSix = new Set(allBets.slice(0, 6).map((bet) => bet.first));
  let type = "MIXED";
  let label = "\u6DF7\u6226";
  if (share >= 0.4 && gap >= 12 && firstSix.size <= 2) {
    type = "FAVORITE";
    label = "\u672C\u547D";
  } else if (share < 0.32 || firstSix.size >= 3) {
    type = "UPSET";
    label = "\u6CE2\u4E71";
  }
  return {
    type,
    label,
    reason: "\u53D6\u5F97\u3067\u304D\u305F3\u9023\u5358\u30921\u30FB2\u30FB3\u7740\u306E\u8A55\u4FA1\u3001\u78BA\u7387\u3001\u30AA\u30C3\u30BA\u304B\u3089\u63A1\u70B9\u3057\u3001\u7DCF\u5408\u9806\u4F4D\u3067\u9078\u51FA",
    firstShare: share,
    top2Share,
    pairShare: share + top2Share,
    firstGap: gap,
    axisLanes: [top1.lane, top2.lane],
    secondStability: roleStability(racers, "secondScore"),
    thirdStability: roleStability(racers, "thirdScore"),
    bets: allBets.slice(0, 15)
  };
}
__name(selectMainlineBets, "selectMainlineBets");
function holeTier(odds) {
  if (odds >= 80) {
    return {
      key: "big",
      label: "\u{1F4A5} \u5927\u7A74"
    };
  }
  if (odds >= 40) {
    return {
      key: "hole",
      label: "\u{1F525} \u7A74"
    };
  }
  return {
    key: "middle",
    label: "\u{1F3AF} \u4E2D\u7A74"
  };
}
__name(holeTier, "holeTier");
function selectHoleBets(allBets, mainline) {
  const mainSet = new Set(
    mainline.map(
      (item) => item.combination
    )
  );
  let candidates = allBets.map(
    (bet, index) => ({
      ...bet,
      aiRank: index + 1
    })
  ).filter(
    (bet) => !mainSet.has(
      bet.combination
    ) && bet.odds >= 20 && bet.probability >= 3e-3 && bet.ev >= 0.6 && bet.totalScore >= 30
  );
  if (candidates.length < 3) {
    candidates = allBets.map(
      (bet, index) => ({
        ...bet,
        aiRank: index + 1
      })
    ).filter(
      (bet) => !mainSet.has(
        bet.combination
      ) && bet.odds >= 18 && bet.probability >= 2e-3 && bet.ev >= 0.45 && bet.totalScore >= 27
    );
  }
  for (const bet of candidates) {
    const probabilityScore = norm(
      bet.probability,
      2e-3,
      0.025
    );
    const evScore = norm(
      Math.min(
        bet.ev,
        2
      ),
      0.45,
      1.5
    );
    const aiScore = norm(
      bet.totalScore,
      27,
      80
    );
    const oddsScore = norm(
      Math.log(
        Math.max(
          bet.odds,
          1
        )
      ),
      Math.log(18),
      Math.log(120)
    );
    const rankScore = 1 - norm(
      bet.aiRank,
      16,
      80
    );
    bet.holeScore = Math.round(
      (probabilityScore * 0.25 + evScore * 0.3 + aiScore * 0.2 + oddsScore * 0.15 + rankScore * 0.1) * 1e3
    ) / 10;
    bet.tier = holeTier(
      bet.odds
    );
  }
  candidates.sort(
    (a, b) => b.holeScore - a.holeScore
  );
  const selected = [];
  const tierCount = {
    middle: 0,
    hole: 0,
    big: 0
  };
  const firstCount = {};
  for (const bet of candidates) {
    if (selected.length >= 5) {
      break;
    }
    if ((firstCount[bet.first] || 0) >= 2) {
      continue;
    }
    if (bet.tier.key === "middle" && tierCount.middle >= 2) {
      continue;
    }
    if (bet.tier.key === "hole" && tierCount.hole >= 2) {
      continue;
    }
    if (bet.tier.key === "big" && tierCount.big >= 1) {
      continue;
    }
    selected.push(
      bet
    );
    tierCount[bet.tier.key]++;
    firstCount[bet.first] = (firstCount[bet.first] || 0) + 1;
  }
  for (const bet of candidates) {
    if (selected.length >= 3) {
      break;
    }
    if (!selected.some(
      (item) => item.combination === bet.combination
    )) {
      selected.push(
        bet
      );
    }
  }
  return selected.slice(
    0,
    5
  ).map(
    (bet) => ({
      combination: bet.combination,
      aiRank: bet.aiRank,
      probability: bet.probability,
      odds: bet.odds,
      ev: bet.ev,
      totalScore: bet.totalScore,
      holeScore: bet.holeScore,
      tier: bet.tier,
      first: bet.first,
      second: bet.second,
      third: bet.third
    })
  );
}
__name(selectHoleBets, "selectHoleBets");
function racerHistoryName(value2) {
  return String(value2 || "").replace(/[\s\u3000]/g, "").trim();
}
__name(racerHistoryName, "racerHistoryName");
function buildRacerHistoryStats(history, asOfDate) {
  const byId = /* @__PURE__ */ Object.create(null), byName = /* @__PURE__ */ Object.create(null);
  const day = String(asOfDate || "");
  const time = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)));
  const cutoff = Number.isFinite(time) ? new Date(time - 30 * 864e5).toISOString().slice(0, 10).replaceAll("-", "") : "00000000";
  const firstBase = { 1: 0.5, 2: 0.15, 3: 0.12, 4: 0.1, 5: 0.07, 6: 0.06 };
  const topBase = { 1: 0.8, 2: 0.55, 3: 0.49, 4: 0.44, 5: 0.39, 6: 0.33 };
  const add = /* @__PURE__ */ __name((store, key, row, venue, win, top, baseWin, baseTop) => {
    if (!key) return;
    const value2 = store[key] || (store[key] = { starts: 0, wins: 0, top3: 0, expectedWins: 0, expectedTop3: 0, venue: {} });
    value2.starts++;
    value2.wins += Number(win);
    value2.top3 += Number(top);
    value2.expectedWins += baseWin;
    value2.expectedTop3 += baseTop;
    if (venue) {
      const part = value2.venue[venue] || (value2.venue[venue] = { starts: 0, wins: 0, expectedWins: 0 });
      part.starts++;
      part.wins += Number(win);
      part.expectedWins += baseWin;
    }
  }, "add");
  for (const item of history || []) {
    const date = String(item.date || "");
    if (date >= day || date < cutoff || !item.result?.finished) continue;
    const podium = item.result.winningLanes?.slice(0, 3).map(Number);
    if (!podium || podium.length !== 3 || new Set(podium).size !== 3) continue;
    for (const r of item.racersDetailed || []) {
      const lane = Number(r.lane), name = racerHistoryName(r.name), id = String(r.registration || "");
      if (!firstBase[lane] || !name) continue;
      const win = lane === podium[0], top = podium.includes(lane), venue = String(item.jcd || "").padStart(2, "0");
      add(byName, name, r, venue, win, top, firstBase[lane], topBase[lane]);
      if (/^\d{4}$/.test(id)) add(byId, id, r, venue, win, top, firstBase[lane], topBase[lane]);
    }
  }
  return { byId, byName };
}
__name(buildRacerHistoryStats, "buildRacerHistoryStats");
function applyRacerHistoryScores(racers, stats, context) {
  return racers.map((r) => {
    const id = String(r.registration || ""), name = racerHistoryName(r.name);
    const byId = stats?.byId?.[id], byName = stats?.byName?.[name];
    const record = byId?.starts >= 2 ? byId : byName || byId;
    if (!record?.starts) return { ...r, historyRaces: 0, historyWins: 0, historyTop3: 0, historyAdjustment: 0 };
    const n = record.starts;
    const winSignal = (record.wins - record.expectedWins) / (n + 8);
    const topSignal = (record.top3 - record.expectedTop3) / (n + 8);
    const venueRecord = record.venue?.[String(context.jcd || "").padStart(2, "0")];
    const venueSignal = venueRecord ? (venueRecord.wins - venueRecord.expectedWins) / (venueRecord.starts + 10) : 0;
    const sampleFactor = Math.min(1, n / 5);
    const adjustment = Math.round(Math.max(-6, Math.min(6, (40 * winSignal + 12 * topSignal + 12 * venueSignal) * sampleFactor)) * 10) / 10;
    return {
      ...r,
      overallScore: Math.round((r.overallScore + adjustment) * 10) / 10,
      firstScore: Math.round((r.firstScore + adjustment * 1.2) * 10) / 10,
      secondScore: Math.round((r.secondScore + adjustment * 0.65) * 10) / 10,
      thirdScore: Math.round((r.thirdScore + adjustment * 0.45) * 10) / 10,
      historyRaces: n,
      historyWins: record.wins,
      historyTop3: record.top3,
      historyAdjustment: adjustment
    };
  });
}
__name(applyRacerHistoryScores, "applyRacerHistoryScores");
var racerStatsCache = new WeakMap();
async function buildServerPrediction(env, racers, oddsData2, context) {
  const learned = env.predictionLearning || await calculateRoleLearnedWeights(env, context.date);
  let statsEntry = racerStatsCache.get(learned);
  if (!statsEntry || statsEntry.date !== context.date) {
    statsEntry = { date: context.date, stats: buildRacerHistoryStats(learned._history, context.date) };
    racerStatsCache.set(learned, statsEntry);
  }
  const historicalStats = statsEntry.stats;
  const modelRacers = applyRacerHistoryScores(racers.map(
    (racer) => {
      const components = scoreComponents(
        racer,
        racers
      );
      return {
        ...racer,
        components,
        overallScore: overallScore(
          components,
          learned.overall
        ),
        firstScore: roleScore(
          components,
          learned.roles.first,
          "first"
        ),
        secondScore: roleScore(
          components,
          learned.roles.second,
          "second"
        ),
        thirdScore: roleScore(
          components,
          learned.roles.third,
          "third"
        )
      };
    }
  ), historicalStats, context);
  const lane1Guard = applyLane1Guard(
    modelRacers
  );
  const history = Array.isArray(
    learned._history
  ) ? learned._history : [];
  const venueRnoLearning = calculateVenueRnoFactors(
    history,
    context,
    modelRacers
  );
  applyVenueRnoFactors(
    modelRacers,
    venueRnoLearning
  );
  const overallRanking = modelRacers.slice().sort(
    (a, b) => b.overallScore - a.overallScore
  );
  const confidence = getConfidence(
    modelRacers
  );
  const allBets = evaluateBets(
    modelRacers,
    oddsData2
  );
  if (!allBets.length) {
    throw new Error(
      "3\u9023\u5358\u30AA\u30C3\u30BA\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F"
    );
  }
  const strategy = selectMainlineBets(
    allBets,
    modelRacers,
    confidence
  );
  const main15 = strategy.bets;
  const holeBets = selectHoleBets(
    allBets,
    main15
  );
  const adaptiveLearning = makeAdaptiveLearning(
    history,
    context,
    modelRacers,
    strategy,
    lane1Guard,
    venueRnoLearning,
    main15
  );
  const sDecision = makeSDecision(
    confidence,
    modelRacers,
    main15,
    adaptiveLearning
  );
  const allBetRanking = allBets.map(
    (bet, index) => ({
      rank: index + 1,
      combination: bet.combination,
      totalScore: bet.totalScore,
      probability: bet.probability,
      odds: bet.odds,
      ev: bet.ev
    })
  );
  const manshu = {
    probability: allBets.length === 120 ? Math.min(1, Math.max(0, allBets.filter((bet) => bet.odds >= 100).reduce((sum, bet) => sum + bet.probability, 0))) : null,
    combinations: allBets.filter((bet) => bet.odds >= 100).length,
    oddsCoverage: allBets.length,
    cutoffOdds: 100
  };
  const snapshot = {
    id: `server-${context.date}-${context.jcd}-${context.rno}-${Date.now()}`,
    version: AI_VERSION,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    date: context.date,
    jcd: context.jcd,
    venue: context.venue,
    rno: Number(
      context.rno
    ),
    confidence,
    sDecision,
    strategy: {
      type: strategy.type,
      label: strategy.label,
      reason: strategy.reason,
      firstShare: strategy.firstShare,
      firstGap: strategy.firstGap,
      top2Share: strategy.top2Share,
      pairShare: strategy.pairShare,
      axisLanes: strategy.axisLanes,
      secondStability: strategy.secondStability,
      thirdStability: strategy.thirdStability
    },
    evaluatedCount: allBets.length,
    learningRaces: learned.races,
    roleLearnedWeights: learned.roles,
    adaptiveLearning,
    racersDetailed: modelRacers.map(
      (racer) => ({
        lane: racer.lane,
        name: racer.name,
        registration: racer.registration,
        class: racer.class,
        historyRaces: racer.historyRaces,
        historyWins: racer.historyWins,
        historyTop3: racer.historyTop3,
        historyAdjustment: racer.historyAdjustment,
        components: {
          ...racer.components
        },
        overallScore: racer.overallScore,
        firstScore: racer.firstScore,
        secondScore: racer.secondScore,
        thirdScore: racer.thirdScore
      })
    ),
    bets: main15.map(
      (bet) => ({
        combination: bet.combination,
        probability: bet.probability,
        odds: bet.odds,
        ev: bet.ev,
        totalScore: bet.totalScore,
        firstRole: bet.firstRole,
        secondRole: bet.secondRole,
        thirdRole: bet.thirdRole
      })
    ),
    holeBets,
    allBetRanking,
    purposePicks: selectPurposePicks(allBets),
    manshu
  };
  return {
    learned,
    modelRacers,
    overallRanking,
    confidence,
    sDecision,
    adaptiveLearning,
    allBets,
    main15,
    holeBets,
    strategy,
    snapshot
  };
}
__name(buildServerPrediction, "buildServerPrediction");

// src/notes.mjs
function snapshotTopNProbability(snapshot, n) {
  const bets = Array.isArray(
    snapshot?.bets
  ) ? snapshot.bets : [];
  if (!bets.length) {
    return null;
  }
  const raw = bets.slice(
    0,
    Number(n || 0)
  ).reduce(
    (sum, bet) => sum + Number(
      bet?.probability || 0
    ),
    0
  );
  const factor = Number(
    snapshot?.sDecision?.metrics?.calibrationFactor || 1
  );
  return clamp(
    raw * factor,
    0,
    1
  );
}
__name(snapshotTopNProbability, "snapshotTopNProbability");
function confidenceStars(snapshot) {
  if (snapshot.confidence === "S") {
    if (snapshot.sDecision?.status === "BET") {
      if (Number(
        snapshot.sDecision?.score || 0
      ) >= 80) {
        return "\u2605\u2605\u2605\u2605\u2605";
      }
      if (Number(
        snapshot.sDecision?.score || 0
      ) >= 70) {
        return "\u2605\u2605\u2605\u2605\u2606";
      }
      return "\u2605\u2605\u2605\u2606\u2606";
    }
    return "\u2605\u2605\u2605\u2606\u2606";
  }
  if (snapshot.confidence === "A") {
    return "\u2605\u2605\u2605\u2606\u2606";
  }
  return "\u2605\u2605\u2606\u2606\u2606";
}
__name(confidenceStars, "confidenceStars");
function formatNoteDate(hd) {
  if (!/^\d{8}$/.test(
    String(
      hd || ""
    )
  )) {
    return hd;
  }
  return `${Number(hd.slice(4, 6))}/${Number(hd.slice(6, 8))}`;
}
__name(formatNoteDate, "formatNoteDate");
function buildNoteArticle(snapshot, deadline = null) {
  const stars = confidenceStars(
    snapshot
  );
  const status = snapshot.confidence === "S" ? snapshot.sDecision?.label || "S\u8A55\u4FA1" : `${snapshot.confidence}\u8A55\u4FA1`;
  const noteType = snapshot.confidence === "S" && snapshot.sDecision?.status === "BET" ? "paid" : snapshot.confidence === "S" ? "free" : "learning";
  const title = `\u3010${formatNoteDate(snapshot.date)} ${snapshot.venue}${snapshot.rno}R\u3011${snapshot.preliminary ? "\u3010\u66AB\u5B9A\u3011" : ""}\u3046\u3055LAB\u7AF6\u8247AI\u4E88\u60F3\uFF5C${status} ${stars}`;
  const main = snapshot.bets.slice(
    0,
    6
  ).map(
    (bet, index) => `${index + 1}. ${bet.combination}\uFF5CAI ${bet.totalScore}\uFF5C\u30AA\u30C3\u30BA ${bet.odds}\u500D`
  ).join(
    "\n"
  );
  const cover = snapshot.bets.slice(
    6,
    10
  ).map(
    (bet, index) => `${index + 7}. ${bet.combination}\uFF5CAI ${bet.totalScore}\uFF5C\u30AA\u30C3\u30BA ${bet.odds}\u500D`
  ).join(
    "\n"
  ) || "\u8A72\u5F53\u306A\u3057";
  const holes = snapshot.holeBets?.length ? snapshot.holeBets.map(
    (bet, index) => `${index + 1}. ${bet.combination}\uFF5C${bet.tier?.label || "\u7A74"}\uFF5C\u30AA\u30C3\u30BA ${bet.odds}\u500D`
  ).join(
    "\n"
  ) : "\u8A72\u5F53\u306A\u3057";
  const topRacer = snapshot.racersDetailed?.slice().sort(
    (a, b) => b.firstScore - a.firstScore
  )[0];
  const metrics = snapshot.sDecision?.metrics;
  const sDetail = snapshot.confidence === "S" && metrics ? [
    `S\u5B89\u5B9A\u30B9\u30B3\u30A2\uFF1A${snapshot.sDecision.score}`,
    `1\u7740\u5019\u88DC\u63A8\u5B9A\u529B\uFF1A${(metrics.firstShare * 100).toFixed(1)}%`,
    `\u4E0A\u4F4D6\u70B9\u78BA\u7387\uFF1A${(metrics.top6Probability * 100).toFixed(1)}%`,
    `10\u70B9\u5185\u78BA\u7387\uFF1A${((metrics.top10Probability ?? snapshotTopNProbability(snapshot, 10) ?? 0) * 100).toFixed(1)}%`,
    `1\u7740\u70B9\u5DEE\uFF1A${metrics.firstGap.toFixed(1)}`,
    `2\u7740\u5B89\u5B9A\u5EA6\uFF1A${Math.round(metrics.secondStability)}`,
    `3\u7740\u5B89\u5B9A\u5EA6\uFF1A${Math.round(metrics.thirdStability)}`,
    `\u5C55\u793A\u30C7\u30FC\u30BF\uFF1A${Math.round(metrics.beforeCoverage * 100)}%`
  ].join(
    "\n"
  ) : `\u52DD\u8CA0\u5EA6\uFF1A${snapshot.confidence}`;
  const notice = snapshot.sDecision?.status === "PASS" ? "\n\u203B\u4ECA\u56DE\u306FS\u8A55\u4FA1\u3067\u3059\u304C\u3001\u52DD\u8CA0\u57FA\u6E96\u3092\u6E80\u305F\u3055\u306A\u3044\u305F\u3081\u898B\u9001\u308A\u5224\u5B9A\u3067\u3059\u3002\n" : "";
  const body = `\u{1F430} \u3046\u3055LAB\uFF5C\u7AF6\u8247AI\u4E88\u60F3

${snapshot.date.slice(0, 4)}\u5E74${Number(snapshot.date.slice(4, 6))}\u6708${Number(snapshot.date.slice(6, 8))}\u65E5
${snapshot.venue} ${snapshot.rno}R
${deadline ? `\u7DE0\u5207\u4E88\u5B9A ${deadline}
` : ""}
AI\u30D0\u30FC\u30B8\u30E7\u30F3\uFF1A${snapshot.version || AI_VERSION}
${snapshot.preliminary ? "\u203B\u66AB\u5B9A\u4E88\u60F3\u3067\u3059\u3002\u5C55\u793A\u30FB\u30AA\u30C3\u30BA\u53D6\u5F97\u5F8C\u306B\u66F4\u65B0\u3055\u308C\u307E\u3059\u3002" : ""}

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u25A0 AI\u5224\u5B9A
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

${status}
\u4FE1\u983C\u5EA6\uFF1A${stars}

${sDetail}

\u5C55\u958B\u5224\u5B9A\uFF1A${snapshot.strategy?.label || "-"}
\u672C\u7DDA6\u70B9\uFF1AAI\u7DCF\u5408\u9806\u4F4D
${snapshot.strategy?.reason || ""}

1\u7740\u8A55\u4FA1\u30C8\u30C3\u30D7\uFF1A
${topRacer ? `${topRacer.lane}\u53F7\u8247 ${topRacer.name}` : "-"}

${notice}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u25A0 \u672C\u7DDA3\u9023\u5358 6\u70B9
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

${main}

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u25A0 \u62BC\u3055\u30484\u70B9\uFF087\u301C10\u4F4D\uFF09
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

${cover}

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u25A0 \u7A74\u72D9\u3044
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

${holes}

\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u25A0 AI\u5206\u6790\u306B\u3064\u3044\u3066
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

\u3046\u3055LAB\u3067\u306F\u3001
\u67A0\u30FB\u7D1A\u5225\u30FB\u5168\u56FD\u6210\u7E3E\u30FB\u5F53\u5730\u6210\u7E3E\u30FBST\u30FB\u30E2\u30FC\u30BF\u30FC\u30FB\u5C55\u793A\u30BF\u30A4\u30E0\u30FB\u5C55\u793AST\u30FB\u5C55\u793A\u30B3\u30FC\u30B9\u306A\u3069\u3092\u6570\u5024\u5316\u3057\u3001
\u904E\u53BB\u306E\u7D50\u679C\u30C7\u30FC\u30BF\u3092\u5B66\u7FD2\u3057\u306A\u304C\u30891\u7740\u30FB2\u7740\u30FB3\u7740\u3092\u5F79\u5272\u5225\u306B\u8A55\u4FA1\u3057\u3066\u3044\u307E\u3059\u3002

\u5B66\u7FD2\u5BFE\u8C61\u30EC\u30FC\u30B9\u6570\uFF1A
${snapshot.learningRaces}R

\u203B\u7684\u4E2D\u3084\u5229\u76CA\u3092\u4FDD\u8A3C\u3059\u308B\u3082\u306E\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002
\u203B\u30AA\u30C3\u30BA\u306F\u5909\u52D5\u3059\u308B\u5834\u5408\u304C\u3042\u308A\u307E\u3059\u3002
\u203B\u821F\u5238\u8CFC\u5165\u306F\u3054\u81EA\u8EAB\u306E\u5224\u65AD\u3067\u304A\u9858\u3044\u3057\u307E\u3059\u3002

\u3046\u3055LAB\uFF5C\u7AF6\u8247AI\u4E88\u60F3 \u{1F430}\u{1F6A4}`;
  return {
    noteType,
    title,
    body,
    stars
  };
}
__name(buildNoteArticle, "buildNoteArticle");

// src/storage.mjs
function identity(body) {
  const date = String(body.race_date || body.hd || ""), jcd = String(body.jcd || "").padStart(2, "0"), rno = Number(body.rno);
  if (!/^\d{8}$/.test(date) || Number(jcd) < 1 || Number(jcd) > 24 || !Number.isInteger(rno) || rno < 1 || rno > 12) throw Error("\u4FDD\u5B58\u3059\u308B\u65E5\u4ED8\u30FB\u4F1A\u5834\u30FB\u30EC\u30FC\u30B9\u756A\u53F7\u304C\u4E0D\u6B63\u3067\u3059");
  return { date, jcd, rno, key: makeRaceKey(date, jcd, rno), venue: body.venue || VENUE_NAMES[jcd] || jcd };
}
__name(identity, "identity");
function upsert(env, table, columns, values, updates, where = "") {
  return env.DB.prepare(`INSERT INTO ${table}(${columns.join(",")},updated_at) VALUES(${columns.map(() => "?").join(",")},CURRENT_TIMESTAMP)
    ON CONFLICT(race_key) DO UPDATE SET ${updates.join(",")},updated_at=CURRENT_TIMESTAMP ${where}`).bind(...values);
}
__name(upsert, "upsert");
async function savePrediction(env, body, statementOnly = false) {
  const r = identity(body), columns = ["race_key", "race_date", "jcd", "venue", "rno", "deadline", "deadline_jst", "analyzed_at", "confidence", "decision", "stable_score", "strategy", "prediction_json", "note_title", "note_body", "posted"];
  const values = [r.key, r.date, r.jcd, r.venue, r.rno, body.deadline || null, body.deadline_jst || body.deadlineJST || null, body.analyzed_at || nowJST(), body.confidence || null, body.decision || null, safeNumber(body.stable_score), body.strategy || null, toJsonText(body.prediction_json || body.prediction || body.snapshot), body.note_title || null, body.note_body || null, body.posted ? 1 : 0];
  const updates = columns.filter((c) => !["race_key", "note_title", "note_body", "posted"].includes(c)).map((c) => `${c}=excluded.${c}`);
  updates.push("note_title=COALESCE(excluded.note_title,predictions.note_title)", "note_body=COALESCE(excluded.note_body,predictions.note_body)", "posted=MAX(predictions.posted,excluded.posted)");
  const statement = upsert(env, "predictions", columns, values, updates, `WHERE CASE WHEN json_valid(predictions.prediction_json) THEN COALESCE(json_extract(predictions.prediction_json,'$.finalized'),0)=0 AND COALESCE(json_extract(predictions.prediction_json,'$.result.finished'),0)=0 ELSE 1 END`);
  if (statementOnly) return statement;
  await statement.run();
  return { race_key: r.key, saved: true };
}
__name(savePrediction, "savePrediction");
async function saveLearningRace(env, body, statementOnly = false) {
  const r = identity(body), columns = ["race_key", "race_date", "jcd", "venue", "rno", "race_data_json", "before_data_json", "odds_data_json", "result_json", "finished", "historical_import"];
  const values = [r.key, r.date, r.jcd, r.venue, r.rno, toJsonText(body.race_data_json || body.raceData || body.race), toJsonText(body.before_data_json || body.beforeData || body.before), toJsonText(body.odds_data_json || body.oddsData || body.odds), toJsonText(body.result_json || body.resultData || body.result), body.finished ? 1 : 0, body.historical_import || body.historicalImport ? 1 : 0];
  const updates = ["race_date", "jcd", "venue", "rno"].map((c) => `${c}=excluded.${c}`);
  for (const c of ["race_data_json", "before_data_json", "odds_data_json", "result_json"]) updates.push(`${c}=CASE WHEN learning_races.finished=1 THEN COALESCE(learning_races.${c},excluded.${c}) ELSE COALESCE(excluded.${c},learning_races.${c}) END`);
  updates.push("finished=MAX(learning_races.finished,excluded.finished)", "historical_import=MAX(learning_races.historical_import,excluded.historical_import)");
  const statement = upsert(env, "learning_races", columns, values, updates);
  if (statementOnly) return statement;
  await statement.run();
  return { race_key: r.key, saved: true };
}
__name(saveLearningRace, "saveLearningRace");
async function savePredictionPair(env, predictionBody, learningBody) {
  const a = identity(predictionBody), b = identity(learningBody);
  if (a.key !== b.key) throw Error("\u4E88\u60F3\u3068\u5B66\u7FD2\u30C7\u30FC\u30BF\u306E\u30EC\u30FC\u30B9\u304C\u4E00\u81F4\u3057\u307E\u305B\u3093");
  await env.DB.batch([await savePrediction(env, predictionBody, true), await saveLearningRace(env, learningBody, true)]);
  return { race_key: a.key, predictionSaved: true, learningSaved: true };
}
__name(savePredictionPair, "savePredictionPair");
async function ensurePredictionQueue(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS prediction_queue(race_key TEXT PRIMARY KEY,race_date TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_retry_at INTEGER NOT NULL DEFAULT 0,error_text TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS prediction_run_lock(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT,expires_at INTEGER NOT NULL DEFAULT 0)`),
    env.DB.prepare("INSERT OR IGNORE INTO prediction_run_lock(id) VALUES(1)")
  ]);
}
__name(ensurePredictionQueue, "ensurePredictionQueue");
function predictionRefreshNeeded(snapshot, target, now = Date.now()) {
  const until = Date.parse(target.deadlineJST) - now;
  if (!Number.isFinite(until) || until <= 0) return false;
  if (!snapshot) return true;
  if (snapshot.result?.finished || snapshot.finalized) return false;
  const age = now - Date.parse(snapshot.createdAt || "");
  return until <= 50 * 6e4 ? !Number.isFinite(age) || age >= 4 * 6e4 : Boolean(snapshot.preliminary) && (!Number.isFinite(age) || age >= 15 * 6e4);
}
__name(predictionRefreshNeeded, "predictionRefreshNeeded");
function savedPurposeView(snapshot) {
  const all = snapshot.allBetRanking, complete = Array.isArray(all) && all.length === 120 && all.every((b) => Number.isFinite(b.probability) && Number.isFinite(b.odds));
  const derived = complete ? selectPurposePicks(all) : null;
  return Object.fromEntries(["hit", "high"].map((key) => {
    const original = Array.isArray(snapshot.purposePicks?.[key]);
    const bets = original ? snapshot.purposePicks[key] : derived?.[key];
    return [key, { source: original ? "saved" : derived ? "derived" : "unavailable", bets: bets?.map((b) => ({ ...b, amount: original && Number.isFinite(snapshot.purposeAllocations?.[key]?.[b.combination]) ? snapshot.purposeAllocations[key][b.combination] : null })) ?? null }];
  }));
}
__name(savedPurposeView, "savedPurposeView");
async function notificationReceipts(env, date) {
  const reads = await Promise.allSettled([
    env.DB.prepare("SELECT race_key AS event_key FROM line_notifications WHERE race_date=? AND status='SENT'").bind(date).all(),
    env.DB.prepare("SELECT event_key FROM web_push_events WHERE status='SENT' AND sent_count>0 AND (event_key LIKE ? OR event_key LIKE ? OR event_key LIKE ?)").bind(`SBET:${date}-%`, `SPASS:${date}-%`, `MANSHU:${date}-%`).all()
  ]);
  const sets = reads.map(r => r.status === 'fulfilled' ? new Set((r.value.results || []).map(x => String(x.event_key).replace(/^(EARLY|FINAL|PASS|MANSHU|SBET|SPASS):/, ''))) : null);
  return key => ({line:sets[0] ? sets[0].has(key) : null, push:sets[1] ? sets[1].has(key) : null});
}
async function listDailyPredictions(env, date) {
  const receipts = await notificationReceipts(env, date);
  const rows = (await env.DB.prepare(`SELECT * FROM predictions WHERE race_date=? ORDER BY CASE WHEN deadline_jst IS NULL THEN 1 ELSE 0 END,deadline_jst,jcd,rno`).bind(date).all()).results || [];
  return rows.map((r) => {
    const s = parseJsonSafe(r.prediction_json, {}) || {};
    return { notifications: receipts(r.race_key), raceKey: r.race_key, venue: r.venue, jcd: r.jcd, rno: Number(r.rno), deadline: r.deadline, confidence: r.confidence, preliminary: Boolean(s.preliminary), finalized: Boolean(s.finalized), stars: confidenceStars(s), mainBets: (s.bets || []).slice(0, 6), holes: s.holeBets || [], reasons: s.sDecision?.reasons || [], decision: r.decision, stableScore: r.stable_score, manshuProbability: s.manshu?.probability ?? null, manshuCombinations: s.manshu?.combinations ?? null, analyzedAt: r.analyzed_at, purposeModes: savedPurposeView(s), main6: (s.bets || []).slice(0, 6).map((b) => b.combination) };
  });
}
__name(listDailyPredictions, "listDailyPredictions");

// src/prediction.mjs
async function fetchPredictionData(env, hd, jcd, rno, options = {}) {
  const [
    raceResult,
    beforeResult,
    oddsResult
  ] = await Promise.allSettled([
    raceData(
      hd,
      jcd,
      rno
    ),
    beforeData(
      hd,
      jcd,
      rno
    ),
    oddsData(
      hd,
      jcd,
      rno
    )
  ]);
  if (raceResult.status !== "fulfilled" || (raceResult.value?.racers?.length !== 6 || new Set(raceResult.value.racers.map((r) => r.lane)).size !== 6)) {
    throw new Error(
      "\u9078\u624B\u30C7\u30FC\u30BF\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F"
    );
  }
  const beforeAvailable = beforeResult.status === "fulfilled" && Boolean(beforeResult.value?.racers?.length);
  if (!beforeAvailable && !options.allowBeforeMissing) {
    throw new Error(
      "\u76F4\u524D\u60C5\u5831\u304C\u307E\u3060\u4E0D\u8DB3\u3057\u3066\u3044\u307E\u3059"
    );
  }
  if (oddsResult.status !== "fulfilled" || !oddsResult.value?.odds?.length) {
    throw new Error(
      "3\u9023\u5358\u30AA\u30C3\u30BA\u304C\u307E\u3060\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093"
    );
  }
  const race = raceResult.value;
  const before = beforeAvailable ? beforeResult.value : { racers: [], weather: null };
  const odds = oddsResult.value;
  const racers = mergeBefore(
    race.racers,
    before
  );
  const prediction2 = await buildServerPrediction(
    env,
    racers,
    odds,
    {
      date: hd,
      jcd,
      venue: race.venue || VENUE_NAMES[jcd] || jcd,
      rno
    }
  );
  await enrichCourseStarts(env, prediction2.modelRacers, hd);
  prediction2.snapshot.scenarioAnalysis = buildScenarioAnalysis(
    prediction2.modelRacers,
    prediction2.allBets,
    { generatedAt: prediction2.snapshot.createdAt }
  );
  prediction2.snapshot.scenarioAnalysis.independent = predictScenarioIndependent(
    await getScenarioIndependentModel(env, hd),
    prediction2.modelRacers, prediction2.allBets, prediction2.snapshot.createdAt
  );
  return {
    race,
    before,
    odds,
    prediction: prediction2,
    beforeAvailable
  };
}
__name(fetchPredictionData, "fetchPredictionData");
async function getLearningByRaceKey(env, raceKey) {
  return await env.DB.prepare(`
      SELECT
        race_key,
        race_date,
        jcd,
        venue,
        rno,
        finished,
        historical_import,
        race_data_json,
        result_json,
        updated_at

      FROM learning_races

      WHERE race_key = ?

      LIMIT 1
    `).bind(
    raceKey
  ).first();
}
__name(getLearningByRaceKey, "getLearningByRaceKey");
async function mapChunks(items, size, fn) {
  const output = [];
  for (let index = 0; index < items.length; index += size) {
    const chunk = items.slice(
      index,
      index + size
    );
    const results = await Promise.allSettled(
      chunk.map(
        (item) => fn(item)
      )
    );
    output.push(
      ...results
    );
  }
  return output;
}
__name(mapChunks, "mapChunks");
async function findAutoTargets(hd, atDate = null) {
  const current = atDate instanceof Date && !Number.isNaN(
    atDate.getTime()
  ) ? atDate : /* @__PURE__ */ new Date();
  const currentMs = current.getTime();
  const venueList = await venues(
    hd
  );
  const venueResults = await mapChunks(
    venueList,
    4,
    (venue) => venueData(
      hd,
      venue.jcd
    )
  );
  const targets = [];
  const venueErrors = [];
  let venueIndex = -1;
  for (const result of venueResults) {
    venueIndex++;
    if (result.status !== "fulfilled") {
      venueErrors.push({
        jcd: venueList[venueIndex].jcd,
        venue: venueList[venueIndex].name,
        error: result.reason?.message || String(result.reason)
      });
      continue;
    }
    const venue = result.value;
    for (const race of venue.races) {
      if (!race.deadlineJST) {
        continue;
      }
      const deadlineMs = new Date(
        race.deadlineJST
      ).getTime();
      if (!Number.isFinite(
        deadlineMs
      )) {
        continue;
      }
      const minutesUntil = (deadlineMs - currentMs) / 6e4;
      if (minutesUntil > AUTO_MIN_MINUTES && minutesUntil <= AUTO_MAX_MINUTES) {
        targets.push({
          hd,
          jcd: venue.jcd,
          venue: venue.venue,
          rno: race.rno,
          deadline: race.deadline,
          deadlineJST: race.deadlineJST,
          minutesUntil: Math.round(
            minutesUntil * 10
          ) / 10
        });
      }
    }
  }
  targets.sort(
    (a, b) => new Date(
      a.deadlineJST
    ) - new Date(
      b.deadlineJST
    )
  );
  return {
    hd,
    checkedAt: current.toISOString(),
    range: {
      minMinutes: AUTO_MIN_MINUTES,
      maxMinutes: null
    },
    venues: venueList.length,
    count: targets.length,
    venueErrors,
    targets
  };
}
__name(findAutoTargets, "findAutoTargets");
async function analyzeAndSaveTargetCore(env, target, force = false) {
  const raceKey = makeRaceKey(target.hd, target.jcd, target.rno);
  const deadlineMs = Date.parse(target.deadlineJST);
  if (target.hd !== todayJST() || !Number.isFinite(deadlineMs) || deadlineMs <= Date.now()) {
    return { raceKey, status: "EXPIRED", reason: "\u7DE0\u5207\u6E08\u307F\u30FB\u7DE0\u5207\u4E0D\u660E\u30FB\u5F53\u65E5\u4EE5\u5916\u306E\u305F\u3081\u4FDD\u5B58\u3057\u307E\u305B\u3093" };
  }
  const existing = await env.DB.prepare("SELECT prediction_json FROM predictions WHERE race_key = ?").bind(raceKey).first();
  const stored = parseJsonSafe(existing?.prediction_json, null);
  if (!force && existing && !predictionRefreshNeeded(stored, target)) {
    return { raceKey, venue: target.venue, rno: target.rno, status: "SKIPPED", reason: "\u4FDD\u5B58\u6E08\u307F\uFF08\u66F4\u65B0\u5F85\u3061\uFF09" };
  }
  if (stored?.result?.finished || stored?.finalized) {
    return { raceKey, status: "SKIPPED", reason: "\u78BA\u5B9A\u4E88\u60F3\u30FB\u78BA\u5B9A\u7D50\u679C\u306F\u4E0A\u66F8\u304D\u3057\u307E\u305B\u3093" };
  }
  const data = await fetchPredictionData(env, target.hd, target.jcd, target.rno, { allowBeforeMissing: true });
  const snapshot = data.prediction.snapshot;
  if (Date.now() >= deadlineMs) throw new Error("\u53D6\u5F97\u4E2D\u306B\u7DE0\u5207\u3092\u904E\u304E\u305F\u305F\u3081\u4FDD\u5B58\u3057\u307E\u305B\u3093\u3067\u3057\u305F");
  snapshot.id = `race-${raceKey}`;
  snapshot.deadline = target.deadline;
  snapshot.deadlineJST = target.deadlineJST;
  snapshot.source = "server";
  snapshot.saveMode = "all-races-observation";
  snapshot.betUnit = 0;
  snapshot.holeBetUnit = 0;
  snapshot.preliminary = beforeCoverage(data.prediction.modelRacers) < 0.55 || deadlineMs - Date.now() > 50 * 6e4;
  snapshot.finalized = !snapshot.preliminary && deadlineMs - Date.now() <= 10 * 6e4;
  snapshot.purposeAllocations = Object.fromEntries(Object.entries(snapshot.purposePicks).map(([key, bets]) => [key, Object.fromEntries(bets.map((b) => [b.combination, 0]))]));
  const note = buildNoteArticle(snapshot, target.deadline);
  note.body += "\n\n" + scenarioNoteLines(snapshot.scenarioAnalysis).join("\n");
  if (Date.now() >= deadlineMs) throw new Error("\u4FDD\u5B58\u76F4\u524D\u306B\u7DE0\u5207\u3092\u904E\u304E\u305F\u305F\u3081\u4FDD\u5B58\u3057\u307E\u305B\u3093\u3067\u3057\u305F");
  if (snapshot.scenarioAnalysis) snapshot.scenarioAnalysis.savedAt = nowJST();
  await savePredictionPair(env, {
    race_date: target.hd,
    jcd: target.jcd,
    venue: target.venue,
    rno: target.rno,
    deadline: target.deadline,
    deadline_jst: target.deadlineJST,
    analyzed_at: nowJST(),
    confidence: snapshot.confidence,
    decision: snapshot.sDecision?.status || "NONE",
    stable_score: snapshot.sDecision?.score ?? null,
    strategy: snapshot.strategy?.label,
    prediction: snapshot,
    note_title: note.title,
    note_body: note.body,
    posted: false
  }, {
    race_date: target.hd,
    jcd: target.jcd,
    venue: target.venue,
    rno: target.rno,
    race: snapshot,
    before: data.before,
    odds: data.odds,
    finished: false,
    historical_import: false
  });
  return {
    raceKey,
    venue: target.venue,
    rno: target.rno,
    deadline: target.deadline,
    deadlineJST: target.deadlineJST,
    status: "ANALYZED",
    refreshed: Boolean(existing),
    preliminary: snapshot.preliminary,
    confidence: snapshot.confidence,
    decision: snapshot.sDecision?.status || "NONE",
    decisionLabel: snapshot.sDecision?.label,
    stableScore: snapshot.sDecision?.score || 0,
    predictionSaved: true,
    learningSaved: true,
    manshuProbability: snapshot.manshu?.probability ?? null,
    main6: snapshot.bets.slice(0, 6).map((b) => b.combination)
  };
}
__name(analyzeAndSaveTargetCore, "analyzeAndSaveTargetCore");
async function analyzeAndSaveTarget(env, target, force = false) {
  return withRaceLock(env, makeRaceKey(target.hd, target.jcd, target.rno), () => analyzeAndSaveTargetCore(env, target, force));
}
__name(analyzeAndSaveTarget, "analyzeAndSaveTarget");
async function runAutoWindow(env, options = {}) {
  const hd = options.hd || todayJST();
  if (hd !== todayJST() || options.at) throw new Error("\u81EA\u52D5\u4FDD\u5B58\u306F\u672C\u65E5\u306E\u73FE\u5728\u6642\u523B\u3067\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u904E\u53BB\u6642\u523B\u306E\u691C\u8A3C\u306Fauto-scan\u3092\u4F7F\u7528\u3067\u304D\u307E\u3059");
  await ensurePredictionQueue(env);
  const owner = crypto.randomUUID();
  const lock = await env.DB.prepare(`UPDATE prediction_run_lock SET owner=?, expires_at=?
    WHERE id=1 AND expires_at <= ?`).bind(owner, Date.now() + 15 * 6e4, Date.now()).run();
  if (!lock.meta?.changes) return { hd, status: "RUNNING", targetCount: 0, analyzedCount: 0, results: [] };
  try {
    const scan = await findAutoTargets(hd);
    const rows = (await env.DB.prepare("SELECT race_key, prediction_json FROM predictions WHERE race_date=?").bind(hd).all()).results || [];
    const saved = new Map(rows.map((row) => [row.race_key, parseJsonSafe(row.prediction_json, null)]));
    const queueRows = (await env.DB.prepare("SELECT race_key, next_retry_at FROM prediction_queue WHERE race_date=?").bind(hd).all()).results || [];
    const retryAt = new Map(queueRows.map((row) => [row.race_key, Number(row.next_retry_at)]));
    const pending = scan.targets.filter((target) => {
      const key = makeRaceKey(hd, target.jcd, target.rno);
      return (retryAt.get(key) || 0) <= Date.now() && (options.force || predictionRefreshNeeded(saved.get(key), target));
    });
    const batch = pending.slice(0, AUTO_BATCH_SIZE);
    const runEnv = batch.length ? { ...env, predictionLearning: await calculateRoleLearnedWeights(env, hd) } : env;
    const results = [];
    for (const target of batch) {
      const key = makeRaceKey(hd, target.jcd, target.rno);
      try {
        const result = await analyzeAndSaveTarget(runEnv, target, Boolean(options.force));
        results.push(result);
        await env.DB.prepare(`INSERT INTO prediction_queue(race_key,race_date,status,next_retry_at)
          VALUES(?,?,?,0) ON CONFLICT(race_key) DO UPDATE SET status=excluded.status,
          next_retry_at=0,error_text=NULL,attempts=0,updated_at=CURRENT_TIMESTAMP`).bind(key, hd, result.status).run();
      } catch (error) {
        const reason = error?.message || String(error);
        results.push({ raceKey: key, venue: target.venue, rno: target.rno, deadline: target.deadline, status: "RETRY", reason });
        await env.DB.prepare(`INSERT INTO prediction_queue(race_key,race_date,status,attempts,next_retry_at,error_text)
          VALUES(?,?,'RETRY',1,?,?) ON CONFLICT(race_key) DO UPDATE SET status='RETRY',
          attempts=prediction_queue.attempts+1,next_retry_at=excluded.next_retry_at,
          error_text=excluded.error_text,updated_at=CURRENT_TIMESTAMP`).bind(key, hd, Date.now() + 9 * 6e4, reason).run();
      }
    }
    await env.DB.prepare("DELETE FROM prediction_queue WHERE race_date < ?").bind(jstDateKeyOffset(-7)).run();
    const analyzed = results.filter((r) => r.status === "ANALYZED");
    return {
      workerVersion: WORKER_VERSION,
      aiVersion: AI_VERSION,
      hd,
      checkedAt: scan.checkedAt,
      targetCount: scan.count,
      analyzedCount: analyzed.length,
      sBetCount: analyzed.filter((r) => !r.preliminary && r.confidence === "S" && r.decision === "BET").length,
      sPassCount: analyzed.filter((r) => !r.preliminary && r.confidence === "S" && r.decision === "PASS").length,
      learningOnlyCount: analyzed.filter((r) => r.confidence !== "S").length,
      skippedCount: results.filter((r) => r.status === "SKIPPED").length,
      retryCount: results.filter((r) => r.status === "RETRY").length,
      remainingCount: Math.max(0, pending.length - batch.length),
      venueErrors: scan.venueErrors,
      results
    };
  } finally {
    await env.DB.prepare("UPDATE prediction_run_lock SET owner=NULL,expires_at=0 WHERE id=1 AND owner=?").bind(owner).run();
  }
}
__name(runAutoWindow, "runAutoWindow");
var jstDateKeyOffsetFormatter = new Intl.DateTimeFormat(
    "ja-JP",
    {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  );
function jstDateKeyOffset(days = 0) {
  const date = new Date(
    Date.now() + days * 864e5
  );
  return jstDateKeyOffsetFormatter.format(date).replaceAll("/", "");
}
__name(jstDateKeyOffset, "jstDateKeyOffset");
async function listPendingResultRaces(env) {
  const fromDate = jstDateKeyOffset(-30);
  const toDate = todayJST();
  const result = await env.DB.prepare(`
        SELECT
          race_key,
          race_date,
          jcd,
          venue,
          rno

        FROM learning_races

        WHERE finished = 0
          AND race_date >= ?
          AND race_date <= ?

        ORDER BY
          race_date DESC,
          rno ASC

        LIMIT 120
      `).bind(
    fromDate,
    toDate
  ).all();
  return result.results || [];
}
__name(listPendingResultRaces, "listPendingResultRaces");
async function updatePredictionResult(env, raceKey, raceResult) {
  const row = await env.DB.prepare(`
        SELECT
          prediction_json

        FROM predictions

        WHERE race_key = ?

        LIMIT 1
      `).bind(
    raceKey
  ).first();
  if (!row || !row.prediction_json) {
    return {
      predictionExists: false
    };
  }
  const snapshot = parseJsonSafe(
    row.prediction_json,
    {}
  ) || {};
  const combination = raceResult.combination;
  const main15 = Array.isArray(
    snapshot.bets
  ) ? snapshot.bets : [];
  const main6 = main15.slice(
    0,
    6
  );
  const main10 = main15.slice(
    0,
    10
  );
  const cover4 = main15.slice(
    6,
    10
  );
  const holes = Array.isArray(
    snapshot.holeBets
  ) ? snapshot.holeBets : [];
  const main6Hit = main6.some(
    (bet) => bet.combination === combination
  );
  const main10Hit = main10.some(
    (bet) => bet.combination === combination
  );
  const cover4Hit = cover4.some(
    (bet) => bet.combination === combination
  );
  const main15Hit = main15.some(
    (bet) => bet.combination === combination
  );
  const holeHit = holes.some(
    (bet) => bet.combination === combination
  );
  const hit = main6Hit || main15Hit || holeHit;
  snapshot.result = raceResult;
  snapshot.resultCheck = {
    checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
    combination,
    payout: raceResult.payout,
    main6Hit,
    main10Hit,
    cover4Hit,
    main15Hit,
    holeHit,
    hit
  };
  await env.DB.prepare(`
      UPDATE predictions

      SET
        prediction_json = ?,
        updated_at = CURRENT_TIMESTAMP

      WHERE race_key = ?
    `).bind(
    JSON.stringify(
      snapshot
    ),
    raceKey
  ).run();
  return {
    predictionExists: true,
    main6Hit,
    main10Hit,
    cover4Hit,
    main15Hit,
    holeHit,
    hit
  };
}
__name(updatePredictionResult, "updatePredictionResult");
async function makeTodayDeadlineMap(rows) {
  const today = todayJST();
  const todayRows = rows.filter(
    (row) => String(
      row.race_date
    ) === today
  );
  if (!todayRows.length) {
    return /* @__PURE__ */ new Map();
  }
  const venuesToCheck = [
    ...new Map(
      todayRows.map(
        (row) => [
          String(
            row.jcd
          ).padStart(
            2,
            "0"
          ),
          {
            hd: today,
            jcd: String(
              row.jcd
            ).padStart(
              2,
              "0"
            )
          }
        ]
      )
    ).values()
  ];
  const results = await mapChunks(
    venuesToCheck,
    4,
    (item) => venueData(
      item.hd,
      item.jcd
    )
  );
  const map = /* @__PURE__ */ new Map();
  for (const result of results) {
    if (result.status !== "fulfilled") {
      continue;
    }
    const venue = result.value;
    for (const race of venue.races || []) {
      map.set(
        makeRaceKey(
          venue.hd,
          venue.jcd,
          race.rno
        ),
        race.deadlineJST || null
      );
    }
  }
  return map;
}
__name(makeTodayDeadlineMap, "makeTodayDeadlineMap");
async function runResultUpdates(env) {
  const pending = await listPendingResultRaces(
    env
  );
  if (!pending.length) {
    return {
      ok: true,
      checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
      pending: 0,
      due: 0,
      checked: 0,
      finished: 0,
      waiting: 0,
      remainingDue: 0,
      results: []
    };
  }
  const today = todayJST();
  const deadlineMap = await makeTodayDeadlineMap(
    pending
  );
  const now = Date.now();
  const due = [];
  let waiting = 0;
  for (const row of pending) {
    const raceDate = String(
      row.race_date
    );
    if (raceDate < today) {
      due.push(
        row
      );
      continue;
    }
    const deadlineJST = deadlineMap.get(
      row.race_key
    );
    if (!deadlineJST) {
      waiting++;
      continue;
    }
    const deadlineMs = new Date(
      deadlineJST
    ).getTime();
    if (!Number.isFinite(
      deadlineMs
    ) || now < deadlineMs + 5 * 6e4) {
      waiting++;
      continue;
    }
    due.push(
      row
    );
  }
  const output = [];
  let checked = 0;
  let finished = 0;
  for (const row of due.slice(
    0,
    12
  )) {
    checked++;
    try {
      const raceResult = await resultData(
        String(
          row.race_date
        ),
        String(
          row.jcd
        ).padStart(
          2,
          "0"
        ),
        Number(
          row.rno
        )
      );
      if (!raceResult.finished) {
        output.push({
          raceKey: row.race_key,
          venue: row.venue,
          rno: row.rno,
          status: "WAIT_RESULT"
        });
        continue;
      }
      await saveLearningRace(
        env,
        {
          race_date: String(
            row.race_date
          ),
          jcd: String(
            row.jcd
          ).padStart(
            2,
            "0"
          ),
          venue: row.venue,
          rno: Number(
            row.rno
          ),
          result: raceResult,
          finished: true
        }
      );
      const predictionCheck = await updatePredictionResult(
        env,
        row.race_key,
        raceResult
      );
      finished++;
      output.push({
        raceKey: row.race_key,
        venue: row.venue,
        rno: row.rno,
        status: "FINISHED",
        combination: raceResult.combination,
        payout: raceResult.payout,
        ...predictionCheck
      });
    } catch (error) {
      output.push({
        raceKey: row.race_key,
        venue: row.venue,
        rno: row.rno,
        status: "ERROR",
        error: error?.message || String(error)
      });
    }
  }
  return {
    ok: true,
    checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
    pending: pending.length,
    due: due.length,
    checked,
    finished,
    waiting,
    remainingDue: Math.max(
      0,
      due.length - checked
    ),
    results: output
  };
}
__name(runResultUpdates, "runResultUpdates");

// src/scenario-performance.mjs
var combinations = /* @__PURE__ */ __name((bets) => Array.isArray(bets) ? bets.map((b) => b?.combination) : [], "combinations");
var uniqueSix = /* @__PURE__ */ __name((bets) => bets.length === 6 && new Set(bets).size === 6 && bets.every((b) => /^[1-6]-[1-6]-[1-6]$/.test(b) && new Set(b.split("-")).size === 3), "uniqueSix");
var bucket = /* @__PURE__ */ __name(() => ({ races: 0, hits: 0, stake: 0, returns: 0, profit: 0, hitRate: null, roi: null }), "bucket");
function compareScenarioRows(rows) {
  const out = { version: SCENARIO_VERSION, unit: 1e3, points: 6, cohort: "\u4E21\u65B9\u5F0F\u304C\u7DE0\u5207\u524D\u306B\u4FDD\u5B58\u3055\u308C\u305F\u975E\u66AB\u5B9A\u4E88\u60F3\u30FB\u540C\u4E00\u30EC\u30FC\u30B9\u30FB\u54046\u70B9", baseline: bucket(), scenario: bucket(), excluded: { noScenario: 0, version: 0, preliminary: 0, invalidDeadline: 0, late: 0, points: 0, pending: 0, result: 0 }, races: [] };
  for (const row of rows) {
    const s = parseJsonSafe(row.prediction_json, null), a = s?.scenarioAnalysis;
    if (!a) {
      out.excluded.noScenario++;
      continue;
    }
    if (a.version !== SCENARIO_VERSION) {
      out.excluded.version++;
      continue;
    }
    if (s.preliminary || a.status !== "REFERENCE") {
      out.excluded.preliminary++;
      continue;
    }
    const deadline = Date.parse(row.deadline_jst || s.deadlineJST || ""), at = Date.parse(a.generatedAt || ""), created = Date.parse(s.createdAt || ""), saved = Date.parse(a.savedAt || "");
    if (!Number.isFinite(deadline) || !Number.isFinite(at) || !Number.isFinite(created) || !Number.isFinite(saved)) {
      out.excluded.invalidDeadline++;
      continue;
    }
    if (at >= deadline || created >= deadline || saved >= deadline) {
      out.excluded.late++;
      continue;
    }
    const old = combinations(s.bets?.slice(0, 6)), next = combinations(a.bets);
    if (!uniqueSix(old) || !uniqueSix(next)) {
      out.excluded.points++;
      continue;
    }
    const r = parseJsonSafe(row.result_json, s.result);
    if (!r?.finished) {
      out.excluded.pending++;
      continue;
    }
    const win = String(r.combination || ""), paid = r.payout ?? r.payoutPer100;
    if (!/^[1-6]-[1-6]-[1-6]$/.test(win) || new Set(win.split("-")).size !== 3 || paid == null || paid === "" || !Number.isFinite(Number(paid)) || Number(paid) <= 0) {
      out.excluded.result++;
      continue;
    }
    const hits = { baseline: old.includes(win), scenario: next.includes(win) };
    for (const key of ["baseline", "scenario"]) {
      const b = out[key];
      b.races++;
      b.hits += Number(hits[key]);
      b.stake += 6e3;
      b.returns += hits[key] ? Number(paid) * 10 : 0;
    }
    out.races.push({ raceKey: row.race_key, date: row.race_date, jcd: row.jcd, venue: row.venue, rno: row.rno, combination: win, payout: Number(paid), ...hits });
  }
  for (const b of [out.baseline, out.scenario]) {
    b.profit = b.returns - b.stake;
    b.hitRate = b.races ? b.hits / b.races * 100 : null;
    b.roi = b.stake ? b.returns / b.stake * 100 : null;
  }
  return out;
}
__name(compareScenarioRows, "compareScenarioRows");
async function scenarioPerformance(env, period = "today") {
  if (!["today", "last7Days", "all"].includes(period)) throw Object.assign(Error("\u96C6\u8A08\u671F\u9593\u304C\u4E0D\u6B63\u3067\u3059"), { status: 400 });
  const end = todayJST(), start = period === "today" ? end : period === "last7Days" ? jstDateKeyOffset(-6) : "00000000";
  const comparison = compareScenarioRows([]);
  let cursor = null;
  for (; ; ) {
    const after = cursor ? " AND (p.race_date<? OR (p.race_date=? AND p.race_key<?))" : "";
    const statement = env.DB.prepare(`SELECT p.race_key,p.race_date,p.jcd,p.venue,p.rno,p.deadline_jst,p.prediction_json,l.result_json
      FROM predictions p LEFT JOIN learning_races l ON p.race_key=l.race_key WHERE p.race_date>=? AND p.race_date<=?${after}
      ORDER BY p.race_date DESC,p.race_key DESC LIMIT 500`);
    const args = cursor ? [start, end, cursor.race_date, cursor.race_date, cursor.race_key] : [start, end];
    const page = (await statement.bind(...args).all()).results || [];
    const part = compareScenarioRows(page);
    for (const key of ["baseline", "scenario"]) for (const field of ["races", "hits", "stake", "returns"]) comparison[key][field] += part[key][field];
    for (const key of Object.keys(comparison.excluded)) comparison.excluded[key] += part.excluded[key];
    if (comparison.races.length < 100) comparison.races.push(...part.races.slice(0, 100 - comparison.races.length));
    if (page.length < 500) break;
    cursor = page[page.length - 1];
  }
  for (const b of [comparison.baseline, comparison.scenario]) {
    b.profit = b.returns - b.stake;
    b.hitRate = b.races ? b.hits / b.races * 100 : null;
    b.roi = b.stake ? b.returns / b.stake * 100 : null;
  }
  return { period, start, end, ...comparison };
}
__name(scenarioPerformance, "scenarioPerformance");

// src/performance.mjs
function resultCheckFromStoredResult(snapshot, raceResult) {
  if (!raceResult) {
    return null;
  }
  const combination = raceResult.combination || (Array.isArray(
    raceResult.winningLanes
  ) && raceResult.winningLanes.length >= 3 ? raceResult.winningLanes.slice(0, 3).join("-") : null);
  if (!combination) {
    return null;
  }
  const main15 = Array.isArray(
    snapshot?.bets
  ) ? snapshot.bets : [];
  const main6 = main15.slice(
    0,
    6
  );
  const main10 = main15.slice(
    0,
    10
  );
  const cover4 = main15.slice(
    6,
    10
  );
  const holes = Array.isArray(
    snapshot?.holeBets
  ) ? snapshot.holeBets : [];
  const main6Hit = main6.some(
    (bet) => bet?.combination === combination
  );
  const main10Hit = main10.some(
    (bet) => bet?.combination === combination
  );
  const cover4Hit = cover4.some(
    (bet) => bet?.combination === combination
  );
  const main15Hit = main15.some(
    (bet) => bet?.combination === combination
  );
  const holeHit = holes.some(
    (bet) => bet?.combination === combination
  );
  return {
    checkedAt: raceResult.checkedAt || null,
    combination,
    payout: raceResult.payout ?? null,
    main6Hit,
    main10Hit,
    cover4Hit,
    main15Hit,
    holeHit,
    hit: main10Hit || main15Hit || holeHit
  };
}
__name(resultCheckFromStoredResult, "resultCheckFromStoredResult");
function blankPerformanceBucket() {
  return {
    races: 0,
    // All predicted races are hypothetical purchases. S勝負 is the actionable subset.
    main6Stake: 0,
    main6Return: 0,
    main10Stake: 0,
    main10Return: 0,
    sBetMain6Stake: 0,
    sBetMain6Return: 0,
    sBetMain10Stake: 0,
    sBetMain10Return: 0,
    missingPayoutRaces: 0,
    sBetMissingPayoutRaces: 0,
    sBetBudgetUnavailableRaces: 0,
    main6Hits: 0,
    main10Hits: 0,
    main15Hits: 0,
    holeHits: 0,
    candidateHits: 0,
    main10PlusHoleHits: 0,
    sBetRaces: 0,
    sBetMain6Hits: 0,
    sBetMain10Hits: 0,
    sBetHoleHits: 0,
    sBetCandidateHits: 0,
    sBetMain10PlusHoleHits: 0,
    sPassRaces: 0,
    sPassMain6Hits: 0,
    sPassMain10Hits: 0,
    sPassHoleHits: 0,
    sPassCandidateHits: 0,
    sPassMain10PlusHoleHits: 0,
    fiveStarRaces: 0,
    fiveStarMain6Hits: 0,
    fiveStarMain10Hits: 0,
    fiveStarCandidateHits: 0
  };
}
__name(blankPerformanceBucket, "blankPerformanceBucket");
function performanceRate(hits, races) {
  return races > 0 ? hits / races * 100 : 0;
}
__name(performanceRate, "performanceRate");
function finalizePerformanceBucket(bucket2) {
  return {
    ...bucket2,
    main6Profit: bucket2.main6Return - bucket2.main6Stake,
    main6RecoveryRate: bucket2.main6Stake > 0 ? bucket2.main6Return / bucket2.main6Stake * 100 : null,
    main10Profit: bucket2.main10Return - bucket2.main10Stake,
    main10RecoveryRate: bucket2.main10Stake > 0 ? bucket2.main10Return / bucket2.main10Stake * 100 : null,
    sBetMain6Profit: bucket2.sBetMain6Return - bucket2.sBetMain6Stake,
    sBetMain6RecoveryRate: bucket2.sBetMain6Stake > 0 ? bucket2.sBetMain6Return / bucket2.sBetMain6Stake * 100 : null,
    sBetMain10Profit: bucket2.sBetMain10Return - bucket2.sBetMain10Stake,
    sBetMain10RecoveryRate: bucket2.sBetMain10Stake > 0 ? bucket2.sBetMain10Return / bucket2.sBetMain10Stake * 100 : null,
    main6HitRate: performanceRate(
      bucket2.main6Hits,
      bucket2.races
    ),
    main10HitRate: performanceRate(
      bucket2.main10Hits,
      bucket2.races
    ),
    main15HitRate: performanceRate(
      bucket2.main15Hits,
      bucket2.races
    ),
    main10PlusHoleHitRate: performanceRate(
      bucket2.main10PlusHoleHits,
      bucket2.races
    ),
    holeHitRate: performanceRate(
      bucket2.holeHits,
      bucket2.races
    ),
    candidateHitRate: performanceRate(
      bucket2.candidateHits,
      bucket2.races
    ),
    sBetMain6HitRate: performanceRate(
      bucket2.sBetMain6Hits,
      bucket2.sBetRaces
    ),
    sBetMain10HitRate: performanceRate(
      bucket2.sBetMain10Hits,
      bucket2.sBetRaces
    ),
    sBetHoleHitRate: performanceRate(
      bucket2.sBetHoleHits,
      bucket2.sBetRaces
    ),
    sBetMain10PlusHoleHitRate: performanceRate(
      bucket2.sBetMain10PlusHoleHits,
      bucket2.sBetRaces
    ),
    sBetCandidateHitRate: performanceRate(
      bucket2.sBetCandidateHits,
      bucket2.sBetRaces
    ),
    sPassMain6HitRate: performanceRate(
      bucket2.sPassMain6Hits,
      bucket2.sPassRaces
    ),
    sPassMain10HitRate: performanceRate(
      bucket2.sPassMain10Hits,
      bucket2.sPassRaces
    ),
    sPassHoleHitRate: performanceRate(
      bucket2.sPassHoleHits,
      bucket2.sPassRaces
    ),
    sPassMain10PlusHoleHitRate: performanceRate(
      bucket2.sPassMain10PlusHoleHits,
      bucket2.sPassRaces
    ),
    sPassCandidateHitRate: performanceRate(
      bucket2.sPassCandidateHits,
      bucket2.sPassRaces
    ),
    fiveStarMain6HitRate: performanceRate(
      bucket2.fiveStarMain6Hits,
      bucket2.fiveStarRaces
    ),
    fiveStarMain10HitRate: performanceRate(
      bucket2.fiveStarMain10Hits,
      bucket2.fiveStarRaces
    ),
    fiveStarCandidateHitRate: performanceRate(
      bucket2.fiveStarCandidateHits,
      bucket2.fiveStarRaces
    )
  };
}
__name(finalizePerformanceBucket, "finalizePerformanceBucket");
function addPerformanceResult(bucket2, snapshot, result) {
  const combination = result?.combination || (Array.isArray(
    result?.winningLanes
  ) && result.winningLanes.length >= 3 ? result.winningLanes.slice(0, 3).join("-") : null);
  const main15 = Array.isArray(
    snapshot?.bets
  ) ? snapshot.bets : [];
  if (!combination || !main15.length || snapshot?.preliminary) {
    return false;
  }
  const main6 = main15.slice(
    0,
    6
  );
  const main10 = main15.slice(
    0,
    10
  );
  const holes = Array.isArray(
    snapshot?.holeBets
  ) ? snapshot.holeBets : [];
  const main6Hit = main6.some(
    (bet) => bet?.combination === combination
  );
  const main10Hit = main10.some(
    (bet) => bet?.combination === combination
  );
  const main15Hit = main15.some(
    (bet) => bet?.combination === combination
  );
  const holeHit = holes.some(
    (bet) => bet?.combination === combination
  );
  const candidateHit = main6Hit || holeHit;
  const main10PlusHoleHit = main10Hit || holeHit;
  const isS = snapshot?.confidence === "S";
  const decision = snapshot?.sDecision?.status || null;
  const isSBet = isS && decision === "BET";
  const isSPass = isS && decision === "PASS";
  const isFiveStar = isSBet && Number(
    snapshot?.sDecision?.score || 0
  ) >= 80;
  const payout = Number(result?.payout ?? result?.payoutPer100);
  if (Number.isFinite(payout) && payout > 0) {
    const stake6 = main6.length * 1e3;
    const stake10 = main10.length * 1e3;
    bucket2.main6Stake += stake6;
    bucket2.main10Stake += stake10;
    if (main6Hit) bucket2.main6Return += payout * 10;
    if (main10Hit) bucket2.main10Return += payout * 10;
    if (isSBet) {
      const allocation = sBetBudget(main6);
      if (!allocation.length) bucket2.sBetBudgetUnavailableRaces++;
      bucket2.sBetMain6Stake += allocation.reduce((sum, b) => sum + b.amount, 0);
      bucket2.sBetMain10Stake += stake10;
      if (main6Hit) bucket2.sBetMain6Return += payout * (allocation.find((b) => b.combination === combination)?.amount || 0) / 100;
      if (main10Hit) bucket2.sBetMain10Return += payout * 10;
    }
  } else {
    bucket2.missingPayoutRaces++;
    if (isSBet) bucket2.sBetMissingPayoutRaces++;
  }
  bucket2.races++;
  if (main6Hit) {
    bucket2.main6Hits++;
  }
  if (main10Hit) {
    bucket2.main10Hits++;
  }
  if (main15Hit) {
    bucket2.main15Hits++;
  }
  if (main10PlusHoleHit) {
    bucket2.main10PlusHoleHits++;
  }
  if (holeHit) {
    bucket2.holeHits++;
  }
  if (candidateHit) {
    bucket2.candidateHits++;
  }
  if (isSBet) {
    bucket2.sBetRaces++;
    if (main6Hit) {
      bucket2.sBetMain6Hits++;
    }
    if (main10Hit) {
      bucket2.sBetMain10Hits++;
    }
    if (holeHit) {
      bucket2.sBetHoleHits++;
    }
    if (main10PlusHoleHit) {
      bucket2.sBetMain10PlusHoleHits++;
    }
    if (candidateHit) {
      bucket2.sBetCandidateHits++;
    }
  }
  if (isSPass) {
    bucket2.sPassRaces++;
    if (main6Hit) {
      bucket2.sPassMain6Hits++;
    }
    if (main10Hit) {
      bucket2.sPassMain10Hits++;
    }
    if (holeHit) {
      bucket2.sPassHoleHits++;
    }
    if (main10PlusHoleHit) {
      bucket2.sPassMain10PlusHoleHits++;
    }
    if (candidateHit) {
      bucket2.sPassCandidateHits++;
    }
  }
  if (isFiveStar) {
    bucket2.fiveStarRaces++;
    if (main6Hit) {
      bucket2.fiveStarMain6Hits++;
    }
    if (main10Hit) {
      bucket2.fiveStarMain10Hits++;
    }
    if (candidateHit) {
      bucket2.fiveStarCandidateHits++;
    }
  }
  return true;
}
__name(addPerformanceResult, "addPerformanceResult");
async function performanceOverview(env) {
  const performanceStartDate = "20260927";
  const today = todayJST();
  const sevenDayStart = [jstDateKeyOffset(-6), performanceStartDate].sort().pop();
  const allBucket = blankPerformanceBucket();
  const sevenBucket = blankPerformanceBucket();
  const todayBucket = blankPerformanceBucket();
  let skipped = 0;
  let offset = 0;
  const pageSize = 500;
  while (true) {
    const result = await env.DB.prepare(`
          SELECT race_date, race_data_json, result_json
          FROM learning_races
          WHERE finished = 1
            AND race_date >= ?
            AND race_date <= ?
            AND race_data_json IS NOT NULL
            AND result_json IS NOT NULL
          ORDER BY race_date DESC, rno DESC, race_key DESC
          LIMIT ? OFFSET ?
        `).bind(performanceStartDate, today, pageSize, offset).all();
    const rows = result.results || [];
    for (const row of rows) {
      const snapshot = parseJsonSafe(
        row.race_data_json,
        null
      );
      const raceResult = parseJsonSafe(
        row.result_json,
        null
      );
      const date = String(
        row.race_date || ""
      );
      if (!snapshot || !raceResult || !Array.isArray(
        snapshot.bets
      ) || !snapshot.bets.length) {
        skipped++;
        continue;
      }
      const counted = addPerformanceResult(
        allBucket,
        snapshot,
        raceResult
      );
      if (!counted) {
        skipped++;
        continue;
      }
      if (date >= sevenDayStart && date <= today) {
        addPerformanceResult(
          sevenBucket,
          snapshot,
          raceResult
        );
      }
      if (date === today) {
        addPerformanceResult(
          todayBucket,
          snapshot,
          raceResult
        );
      }
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return {
    generatedAt: nowJST(),
    todayDate: today,
    sevenDayStart,
    allPeriodStart: performanceStartDate,
    today: finalizePerformanceBucket(
      todayBucket
    ),
    last7Days: finalizePerformanceBucket(
      sevenBucket
    ),
    all: finalizePerformanceBucket(
      allBucket
    ),
    skippedWithoutPrediction: skipped,
    note: "2026\u5E749\u670827\u65E5\u304B\u3089\u6210\u7E3E\u3092\u65B0\u898F\u96C6\u8A08\u3002\u4EE5\u524D\u306E\u7D50\u679C\u306F\u542B\u3081\u307E\u305B\u3093\u3002\u672C\u7DDA\u306F1\u70B91,000\u5186\u3001\u7A74\u5019\u88DC\u306F1\u70B91,000\u5186\u306E\u8A66\u7B97\u3067\u3059\u3002\u904E\u53BB\u5206\u3082\u540C\u6761\u4EF6\u3067\u518D\u8A08\u7B97\u3057\u307E\u3059\u3002\u5B9F\u8CFC\u5165\u5C65\u6B74\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002S\u898B\u9001\u308A\u306F\u8CFC\u5165\u984D\u30FB\u6255\u623B\u984D\u3068\u3082\u306B0\u5186\u3067\u3059\u3002"
  };
}
__name(performanceOverview, "performanceOverview");

// src/notifications.mjs
function bytesToBase64Url(bytes) {
  let binary = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(bytesToBase64Url, "bytesToBase64Url");
function textToBase64Url(text) {
  return bytesToBase64Url(
    new TextEncoder().encode(
      String(text || "")
    )
  );
}
__name(textToBase64Url, "textToBase64Url");
function base64UrlToBytes(value2) {
  const normalized = String(value2 || "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat(
    (4 - normalized.length % 4) % 4
  );
  const binary = atob(normalized + padding);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
__name(base64UrlToBytes, "base64UrlToBytes");
async function ensureWebPushTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS web_push_vapid (
      id INTEGER PRIMARY KEY,
      public_jwk TEXT NOT NULL,
      private_jwk TEXT NOT NULL,
      public_key TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS web_push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT,
      auth TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_success_at TEXT,
      last_error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_enabled
    ON web_push_subscriptions(enabled)
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS web_push_events (
      event_key TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      target_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      error_text TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}
__name(ensureWebPushTables, "ensureWebPushTables");
async function ensureWebPushVapid(env) {
  await ensureWebPushTables(env);
  let row = await env.DB.prepare(`
      SELECT
        id,
        public_jwk,
        private_jwk,
        public_key
      FROM web_push_vapid
      WHERE id = 1
      LIMIT 1
    `).first();
  if (row?.public_key && row?.private_jwk) {
    return row;
  }
  const pair = await crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256"
    },
    true,
    ["sign", "verify"]
  );
  const publicJwk = await crypto.subtle.exportKey(
    "jwk",
    pair.publicKey
  );
  const privateJwk = await crypto.subtle.exportKey(
    "jwk",
    pair.privateKey
  );
  const x = base64UrlToBytes(
    publicJwk.x
  );
  const y = base64UrlToBytes(
    publicJwk.y
  );
  const rawPublic = new Uint8Array(65);
  rawPublic[0] = 4;
  rawPublic.set(x, 1);
  rawPublic.set(y, 33);
  const publicKey = bytesToBase64Url(
    rawPublic
  );
  await env.DB.prepare(`
    INSERT OR IGNORE INTO web_push_vapid (
      id,
      public_jwk,
      private_jwk,
      public_key,
      updated_at
    )
    VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    JSON.stringify(publicJwk),
    JSON.stringify(privateJwk),
    publicKey
  ).run();
  row = await env.DB.prepare(`
      SELECT
        id,
        public_jwk,
        private_jwk,
        public_key
      FROM web_push_vapid
      WHERE id = 1
      LIMIT 1
    `).first();
  if (!row?.public_key || !row?.private_jwk) {
    throw new Error(
      "Web Push\u7528VAPID\u9375\u306E\u521D\u671F\u5316\u306B\u5931\u6557\u3057\u307E\u3057\u305F"
    );
  }
  return row;
}
__name(ensureWebPushVapid, "ensureWebPushVapid");
async function buildVapidAuthorization(endpoint, vapid) {
  const audience = new URL(endpoint).origin;
  const header = textToBase64Url(
    JSON.stringify({
      typ: "JWT",
      alg: "ES256"
    })
  );
  const payload = textToBase64Url(
    JSON.stringify({
      aud: audience,
      exp: Math.floor(Date.now() / 1e3) + 12 * 60 * 60,
      sub: WEB_PUSH_CONTACT
    })
  );
  const unsigned = `${header}.${payload}`;
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(vapid.private_jwk),
    {
      name: "ECDSA",
      namedCurve: "P-256"
    },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: "SHA-256"
    },
    privateKey,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${bytesToBase64Url(signature)}`;
  return `vapid t=${jwt}, k=${vapid.public_key}`;
}
__name(buildVapidAuthorization, "buildVapidAuthorization");
async function saveWebPushSubscription(env, subscription) {
  await ensureWebPushTables(env);
  const endpoint = String(
    subscription?.endpoint || ""
  ).trim();
  if (!endpoint.startsWith("https://")) {
    throw new Error(
      "Push\u8CFC\u8AADendpoint\u304C\u4E0D\u6B63\u3067\u3059"
    );
  }
  const p256dh = subscription?.keys?.p256dh || subscription?.p256dh || null;
  const auth = subscription?.keys?.auth || subscription?.auth || null;
  await env.DB.prepare(`
    INSERT INTO web_push_subscriptions (
      endpoint,
      p256dh,
      auth,
      enabled,
      last_error,
      updated_at
    )
    VALUES (?, ?, ?, 1, NULL, CURRENT_TIMESTAMP)

    ON CONFLICT(endpoint)
    DO UPDATE SET
      p256dh=excluded.p256dh,
      auth=excluded.auth,
      enabled=1,
      last_error=NULL,
      updated_at=CURRENT_TIMESTAMP
  `).bind(
    endpoint,
    p256dh,
    auth
  ).run();
  return true;
}
__name(saveWebPushSubscription, "saveWebPushSubscription");
async function disableWebPushSubscription(env, endpoint) {
  await ensureWebPushTables(env);
  await env.DB.prepare(`
    UPDATE web_push_subscriptions
    SET
      enabled=0,
      updated_at=CURRENT_TIMESTAMP
    WHERE endpoint = ?
  `).bind(
    String(endpoint || "")
  ).run();
}
__name(disableWebPushSubscription, "disableWebPushSubscription");
async function sendEmptyWebPush(env, subscription, vapid) {
  const authorization = await buildVapidAuthorization(
    subscription.endpoint,
    vapid
  );
  const response = await fetch(
    subscription.endpoint,
    {
      method: "POST",
      headers: {
        "TTL": "120",
        "Urgency": "high",
        "Authorization": authorization
      }
    }
  );
  if (response.ok) {
    await env.DB.prepare(`
      UPDATE web_push_subscriptions
      SET
        last_success_at=?,
        last_error=NULL,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(
      nowJST(),
      subscription.id
    ).run();
    return {
      ok: true,
      status: response.status
    };
  }
  const detail = await response.text();
  if (response.status === 404 || response.status === 410) {
    await env.DB.prepare(`
      UPDATE web_push_subscriptions
      SET
        enabled=0,
        last_error=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(
      `HTTP ${response.status}`,
      subscription.id
    ).run();
  } else {
    await env.DB.prepare(`
      UPDATE web_push_subscriptions
      SET
        last_error=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(
      `HTTP ${response.status}: ${String(detail || "").slice(0, 180)}`,
      subscription.id
    ).run();
  }
  return {
    ok: false,
    status: response.status,
    error: String(detail || "").slice(0, 240)
  };
}
__name(sendEmptyWebPush, "sendEmptyWebPush");
async function sendWebPushEvent(env, event) {
  await ensureWebPushTables(env);
  const existing = await env.DB.prepare(`
      SELECT
        event_key,
        status
      FROM web_push_events
      WHERE event_key=?
      LIMIT 1
    `).bind(event.eventKey).first();
  if (existing?.status === "SENT") {
    return {
      ok: true,
      status: "ALREADY_SENT",
      sent: 0,
      failed: 0
    };
  }
  const subscriptionsResult = await env.DB.prepare(`
      SELECT
        id,
        endpoint
      FROM web_push_subscriptions
      WHERE enabled=1
      ORDER BY id ASC
    `).all();
  const subscriptions = subscriptionsResult.results || [];
  if (!subscriptions.length) {
    return {
      ok: true,
      status: "NO_SUBSCRIBERS",
      sent: 0,
      failed: 0
    };
  }
  await env.DB.prepare(`
    INSERT INTO web_push_events (
      event_key,
      event_type,
      title,
      body,
      target_url,
      status,
      sent_count,
      failed_count,
      error_text,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, 'PENDING', 0, 0, NULL, CURRENT_TIMESTAMP)

    ON CONFLICT(event_key)
    DO UPDATE SET
      event_type=excluded.event_type,
      title=excluded.title,
      body=excluded.body,
      target_url=excluded.target_url,
      updated_at=CURRENT_TIMESTAMP
  `).bind(
    event.eventKey,
    event.eventType,
    event.title,
    event.body,
    event.targetUrl || "/api/s-picks-view"
  ).run();
  const vapid = await ensureWebPushVapid(env);
  let sent = 0;
  let failed = 0;
  const errors = [];
  for (const subscription of subscriptions) {
    try {
      const result = await sendEmptyWebPush(
        env,
        subscription,
        vapid
      );
      if (result.ok) {
        sent++;
      } else {
        failed++;
        errors.push(
          `HTTP ${result.status}`
        );
      }
    } catch (error) {
      failed++;
      errors.push(
        error?.message || String(error)
      );
    }
  }
  const status = sent > 0 ? "SENT" : "ERROR";
  await env.DB.prepare(`
    UPDATE web_push_events
    SET
      status=?,
      sent_count=?,
      failed_count=?,
      error_text=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE event_key=?
  `).bind(
    status,
    sent,
    failed,
    errors.length ? errors.slice(0, 5).join(" | ") : null,
    event.eventKey
  ).run();
  return {
    ok: sent > 0,
    status,
    sent,
    failed,
    errors
  };
}
__name(sendWebPushEvent, "sendWebPushEvent");
async function runWebPushNotifications(env, raceDate = todayJST()) {
  await ensureWebPushTables(env);
  if (!WEB_PUSH_S_BET_ENABLED) {
    return {
      ok: true,
      status: "DISABLED",
      candidates: 0,
      sent: 0,
      failed: 0
    };
  }
  const picks = (await listSLinePredictions(
    env,
    raceDate
  )).filter(
    (pick) => isLineEligible(pick, env)
  );
  let candidates = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const now = Date.now();
  for (const pick of picks) {
    let minutesUntil = null;
    if (pick.deadlineJST) {
      const ms = new Date(
        pick.deadlineJST
      ).getTime();
      if (Number.isFinite(ms)) {
        minutesUntil = (ms - now) / 6e4;
      }
    }
    if (minutesUntil === null || (minutesUntil <= 0 || minutesUntil > WEB_PUSH_FINAL_MAX_MINUTES)) {
      skipped++;
      continue;
    }
    if (sent + failed >= 4) break;
    candidates++;
    const score = pick.stableScore == null ? "-" : Number(pick.stableScore).toFixed(1);
    const result = await sendWebPushEvent(
      env,
      {
        eventKey: pick.confidence === "S" && pick.decision === "BET" ? `SBET:${pick.raceKey}` : pick.confidence === "S" ? `SPASS:${pick.raceKey}` : `MANSHU:${pick.raceKey}`,
        eventType: "PICK",
        title: `${pick.confidence === "S" ? pick.decision === "PASS" ? "\u26A0\uFE0F S\u898B\u9001\u308A" : "\u{1F525} S\u52DD\u8CA0" : "\u{1F4A5} \u4E07\u821F\u9AD8\u78BA\u7387"}\uFF5C${pick.venue} ${pick.rno}R`,
        body: `\u7DE0\u5207 ${pick.deadline || "-"}\uFF5C\u4E07\u821F\u63A8\u5B9A ${Number.isFinite(pick.manshuProbability) ? (pick.manshuProbability * 100).toFixed(1) + "%" : "-"}\uFF5CS\u30B9\u30B3\u30A2 ${score}`,
        targetUrl: "/#auto-predictions"
      }
    );
    if (result.status === "SENT") {
      sent += Number(result.sent || 0);
    } else if (result.status === "ERROR") {
      failed += Number(result.failed || 1);
    }
  }
  return {
    ok: failed === 0,
    status: failed > 0 ? "WARN" : "OK",
    candidates,
    sent,
    failed,
    skipped
  };
}
__name(runWebPushNotifications, "runWebPushNotifications");
function webPushServiceWorkerJs() {
  return `
self.addEventListener('install', function(event){
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function(event){
  event.waitUntil((async function(){
    var meta = {
      title: '\u{1F430}\u{1F6A4} \u3046\u3055LAB\uFF5C\u7AF6\u8247AI\u4E88\u60F3',
      body: '\u65B0\u3057\u3044AI\u901A\u77E5\u304C\u3042\u308A\u307E\u3059\u3002\u30BF\u30C3\u30D7\u3057\u3066\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002',
      targetUrl: '/api/s-picks-view',
      eventKey: 'usa-lab-latest'
    };

    try{
      var response = await fetch('/api/push-latest', {cache:'no-store'});
      if(response.ok){
        var data = await response.json();
        if(data && data.ok && data.event){
          meta = Object.assign(meta, data.event);
        }
      }
    }catch(e){}

    await self.registration.showNotification(meta.title || '\u{1F430}\u{1F6A4} \u3046\u3055LAB', {
      body: meta.body || '\u65B0\u3057\u3044\u901A\u77E5\u304C\u3042\u308A\u307E\u3059',
      tag: meta.eventKey || 'usa-lab-notification',
      renotify: true,
      data: {
        url: meta.targetUrl || '/api/s-picks-view'
      }
    });
  })());
});

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || '/api/s-picks-view';

  event.waitUntil((async function(){
    var windows = await clients.matchAll({type:'window', includeUncontrolled:true});
    for(var i=0;i<windows.length;i++){
      var client = windows[i];
      if('focus' in client){
        try{
          await client.navigate(target);
        }catch(e){}
        return client.focus();
      }
    }
    if(clients.openWindow){
      return clients.openWindow(target);
    }
  })());
});
`;
}
__name(webPushServiceWorkerJs, "webPushServiceWorkerJs");
function webPushManifest() {
  return {
    name: "\u3046\u3055LAB\uFF5C\u7AF6\u8247AI\u4E88\u60F3",
    short_name: "\u3046\u3055LAB",
    start_url: "/api/s-picks-view",
    scope: "/api/",
    display: "standalone",
    background_color: "#f7f3ff",
    theme_color: "#8d72c7",
    description: "\u3046\u3055LAB \u7AF6\u8247AI\u4E88\u60F3\u30FBS\u8A55\u4FA1\u4E00\u89A7"
  };
}
__name(webPushManifest, "webPushManifest");
async function ensureLineNotificationTable(env) {
  await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS line_notifications (
        race_key TEXT PRIMARY KEY,
        race_date TEXT NOT NULL,
        jcd TEXT,
        venue TEXT,
        rno INTEGER,
        status TEXT NOT NULL DEFAULT 'PENDING',
        sent_at TEXT,
        error_text TEXT,
        message_text TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_line_notifications_date
      ON line_notifications(race_date)
    `).run();
}
__name(ensureLineNotificationTable, "ensureLineNotificationTable");
function lineNotificationConfigured(env) {
  return Boolean(
    env.LINE_CHANNEL_ACCESS_TOKEN && env.LINE_USER_ID
  );
}
__name(lineNotificationConfigured, "lineNotificationConfigured");
async function sendLinePush(env, text) {
  if (!lineNotificationConfigured(env)) {
    throw new Error(
      "LINE_CHANNEL_ACCESS_TOKEN \u307E\u305F\u306F LINE_USER_ID \u304C\u672A\u8A2D\u5B9A\u3067\u3059"
    );
  }
  const response = await fetch(
    "https://api.line.me/v2/bot/message/push",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        to: env.LINE_USER_ID,
        messages: [
          {
            type: "text",
            text: String(text || "")
          }
        ],
        notificationDisabled: false
      })
    }
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `LINE\u9001\u4FE1\u30A8\u30E9\u30FC HTTP ${response.status}` + (detail ? `: ${detail.slice(0, 400)}` : "")
    );
  }
  return true;
}
__name(sendLinePush, "sendLinePush");
function buildLineSBetMessage(pick) {
  const metrics = mainSixMetrics(pick.main6);
  const main = sBetBudget(pick.main6).map((bet, index) => `${index + 1}. ${bet.combination}\uFF1A${bet.amount}\u5186` + (Number(bet.odds) > 0 ? `\uFF08${bet.odds}\u500D\uFF0F\u60F3\u5B9A\u6255\u623B ${Math.round(Number(bet.odds) * bet.amount).toLocaleString("ja-JP")}\u5186\uFF09` : "\uFF08\u30AA\u30C3\u30BA\u672A\u53D6\u5F97\uFF09")).join("\n") || "\u30AA\u30C3\u30BA\u30FB\u8CB7\u3044\u76EE\u304C\u4E0D\u8DB3\u3057\u3066\u3044\u308B\u305F\u3081\u8CC7\u91D1\u914D\u5206\u306F\u7B97\u51FA\u5F85\u3061\u3067\u3059";
  const cover = Array.isArray(pick.cover4) && pick.cover4.length ? pick.cover4.slice(0, 4).map(
    (bet, index) => `${index + 7}. ${bet.combination}` + (bet.odds != null ? `\uFF08${bet.odds}\u500D\uFF09` : "\uFF08\u30AA\u30C3\u30BA\u672A\u53D6\u5F97\uFF09")
  ).join("\n") : "\u306A\u3057";
  const holes = fixedBetAmounts(pick.holes, 1000).map((b) => `${b.combination}\uFF1A1,000\u5186` + (Number(b.odds) > 0 ? `\uFF08${b.odds}\u500D\uFF0F\u60F3\u5B9A\u6255\u623B ${Math.round(Number(b.odds) * b.amount).toLocaleString("ja-JP")}\u5186\uFF09` : "\uFF08\u30AA\u30C3\u30BA\u672A\u53D6\u5F97\uFF09")).join(" / ") || "\u306A\u3057";
  const share = pick.firstShare == null ? "-" : `${(Number(pick.firstShare) * 100).toFixed(1)}%`;
  const top6 = pick.top6Probability == null ? "-" : `${(Number(pick.top6Probability) * 100).toFixed(1)}%`;
  const top10 = pick.top10Probability == null ? "-" : `${(Number(pick.top10Probability) * 100).toFixed(1)}%`;
  return `\u{1F430}\u{1F6A4} \u3046\u3055LAB\uFF5C\u7AF6\u8247AI\u4E88\u60F3

\u{1F525} S\u52DD\u8CA0\u304C\u51FA\u307E\u3057\u305F
${pick.venue} ${pick.rno}R
\u7DE0\u5207\uFF1A${pick.deadline || "-"}
\u4E07\u821F\u63A8\u5B9A\u78BA\u7387\uFF1A${formatManshu(pick)}
\u4FE1\u983C\u5EA6\uFF1A${pick.stars || "-"}
S\u30B9\u30B3\u30A2\uFF1A${pick.stableScore == null ? "-" : Number(pick.stableScore).toFixed(1)}
1\u7740\u63A8\u5B9A\u529B\uFF1A${share}
\u4E0A\u4F4D6\u70B9\u78BA\u7387\uFF1A${top6}
10\u70B9\u5185\u78BA\u7387\uFF1A${top10}
\u5C55\u958B\u5224\u5B9A\uFF1A${pick.strategy || "-"}
\u672C\u7DDA6\u70B9\uFF1AAI\u7DCF\u5408\u9806\u4F4D

\u3010\u672C\u7DDA\u306E\u8A66\u7B97\uFF1A1\u70B91,000\u5186\u30FB\u5408\u8A08${sBetBudget(pick.main6).length * 1e3}\u5186\u3011
${main}
${mainSixMetricsText(metrics)}

\u3010\u53C2\u8003\u30FB\u4E88\u7B97\u306B\u542B\u3081\u306A\u3044\u62BC\u3055\u30484\u70B9\uFF087\u301C10\u4F4D\uFF09\u3011
${cover}

\u3010\u7A74\u5019\u88DC\u306E\u8A66\u7B97\uFF1A1\u70B91,000\u5186\u3011
${holes}

S\u52DD\u8CA0\u4E00\u89A7
https://aged-hill-9a89.kono032424.workers.dev/api/s-picks-view

\u203B\u91D1\u984D\u306F\u8A66\u7B97\u3067\u3059\u3002\u5B9F\u969B\u306E\u821F\u5238\u8CFC\u5165\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u7684\u4E2D\u3084\u5229\u76CA\u3092\u4FDD\u8A3C\u3057\u307E\u305B\u3093\u3002`;
}
__name(buildLineSBetMessage, "buildLineSBetMessage");
function formatManshu(pick) {
  return Number.isFinite(pick.manshuProbability) ? `${(pick.manshuProbability * 100).toFixed(1)}%\uFF083\u9023\u5358100\u5186\u3042\u305F\u308A\u6255\u623B1\u4E07\u5186\u4EE5\u4E0A\uFF09` : "\u30AA\u30C3\u30BA\u672A\u78BA\u5B9A";
}
__name(formatManshu, "formatManshu");
function buildLineManshuMessage(pick, env) {
  const examples = (pick.highOddsBets || []).slice(0, 3).map((bet) => `${bet.combination} ${Number(bet.odds).toFixed(1)}\u500D`).join(" / ");
  return `\u{1F430}\u{1F6A4} \u3046\u3055LAB\uFF5C\u7AF6\u8247AI\u4E88\u60F3
\u{1F4A5} \u4E07\u821F\u9AD8\u78BA\u7387\uFF08${manshuThreshold(env)}%\u4EE5\u4E0A\uFF09
${pick.venue} ${pick.rno}R\u3000\u7DE0\u5207 ${pick.deadline || "-"}
\u4E07\u821F\u63A8\u5B9A\u78BA\u7387\uFF1A${formatManshu(pick)}
\u53C2\u8003\u7D44\u307F\u5408\u308F\u305B\uFF1A${examples || "-"}
\u8A55\u4FA1\uFF1A${pick.confidence}\uFF0F\u8CFC\u5165\u6307\u793A\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002
\u4E88\u60F3\u4E00\u89A7\uFF1Ahttps://aged-hill-9a89.kono032424.workers.dev/
\u203B\u4E88\u60F3\u6642\u70B9\u306E\u30AA\u30C3\u30BA\u306B\u3088\u308B\u63A8\u5B9A\u3067\u3042\u308A\u3001\u7684\u4E2D\u30FB\u6255\u623B\u3092\u4FDD\u8A3C\u3057\u307E\u305B\u3093\u3002`;
}
__name(buildLineManshuMessage, "buildLineManshuMessage");
function lineNotificationKey(pick, stage) {
  return stage === "EARLY" ? `EARLY:${pick.raceKey}` : pick.raceKey;
}
__name(lineNotificationKey, "lineNotificationKey");
function buildLineFinalMessage(pick, env) {
  const allocation = sBetBudget(pick.main6);
  if (pick.confidence === "S" && pick.decision === "BET") return buildLineSBetMessage(pick) + (isManshuHigh(pick, env) ? "\n\u{1F4A5} \u4E07\u821F\u9AD8\u78BA\u7387\u306B\u3082\u8A72\u5F53\uFF08\u901A\u77E5\u306F\u3053\u306E1\u901A\u3067\u3059\uFF09" : "");
  return buildLineManshuMessage(pick, env) + "\n\n\u3010\u672C\u7DDA\u4E0A\u4F4D6\u70B9\u30FB1\u70B91,000\u5186\u306E\u8A66\u7B97\u3011\n" + (allocation.length ? allocation.map((b) => `${b.combination}\uFF1A${b.amount}\u5186` + (Number(b.odds) > 0 ? `\uFF0F\u60F3\u5B9A\u6255\u623B ${Math.round(Number(b.odds) * b.amount).toLocaleString("ja-JP")}\u5186` : "")).join("\n") : "\u8CB7\u3044\u76EE\u4E0D\u8DB3\u306E\u305F\u3081\u8A66\u7B97\u3067\u304D\u307E\u305B\u3093") + "\n" + mainSixMetricsText(mainSixMetrics(pick.main6)) + "\n\u672C\u7DDA\u5408\u8A08 " + allocation.length * 1e3 + "\u5186\u3002\u7A74\u5019\u88DC\u306F\u5225\u90141\u70B91,000\u5186\uFF1A" + (fixedBetAmounts(pick.holes, 1000).map((b) => b.combination + "\uFF1A1,000\u5186").join(" \uFF0F ") || "\u306A\u3057") + "\u3002\u4E07\u821F\u306E\u53C2\u8003\u7D44\u307F\u5408\u308F\u305B\u306F\u8FFD\u52A0\u8CFC\u5165\u984D\u306B\u542B\u3081\u307E\u305B\u3093\u3002" + (pick.decision === "PASS" ? "\n\u26A0\uFE0F AI\u5224\u5B9A\u306FS\u898B\u9001\u308A\u3067\u3059\u3002\u4E07\u821F\u78BA\u7387\u6761\u4EF6\u306B\u3088\u308B\u53C2\u8003\u901A\u77E5\u3067\u3001S\u52DD\u8CA0\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002" : "") + "\n\u91D1\u984D\u306F\u8A66\u7B97\u3067\u3001\u5B9F\u969B\u306E\u821F\u5238\u8CFC\u5165\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002";
}
__name(buildLineFinalMessage, "buildLineFinalMessage");
async function saveLineNotificationState(env, pick, status, message, errorText = null) {
  await ensureLineNotificationTable(
    env
  );
  await env.DB.prepare(`
      INSERT INTO line_notifications (
        race_key,
        race_date,
        jcd,
        venue,
        rno,
        status,
        sent_at,
        error_text,
        message_text,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      )

      ON CONFLICT(race_key)
      DO UPDATE SET
        status=excluded.status,
        sent_at=excluded.sent_at,
        error_text=excluded.error_text,
        message_text=excluded.message_text,
        updated_at=CURRENT_TIMESTAMP
    `).bind(
    pick.notificationKey || pick.raceKey,
    pick.raceDate,
    pick.jcd || null,
    pick.venue || null,
    Number(pick.rno) || null,
    status,
    status === "SENT" ? nowJST() : null,
    errorText,
    message || null
  ).run();
}
__name(saveLineNotificationState, "saveLineNotificationState");
async function listLineNotificationStates(env, raceDate) {
  await ensureLineNotificationTable(
    env
  );
  const result = await env.DB.prepare(`
        SELECT
          race_key,
          status,
          sent_at,
          error_text,
          updated_at
        FROM line_notifications
        WHERE race_date = ?
      `).bind(
    raceDate
  ).all();
  return new Map(
    (result.results || []).map(
      (row) => [
        row.race_key,
        row
      ]
    )
  );
}
__name(listLineNotificationStates, "listLineNotificationStates");
async function hydratePredictionDeadlines(env, raceDate, rows) {
  const targets = (rows || []).filter(
    (row) => !row.deadline || !row.deadline_jst
  );
  if (!targets.length) {
    return rows || [];
  }
  const venueCodes = [...new Set(
    targets.map((row) => String(row.jcd || "").padStart(2, "0")).filter((jcd) => /^\d{2}$/.test(jcd))
  )];
  const venueMaps = /* @__PURE__ */ new Map();
  for (const jcd of venueCodes) {
    try {
      const data = await venueData(
        raceDate,
        jcd
      );
      venueMaps.set(
        jcd,
        new Map(
          (data.races || []).map(
            (race) => [
              Number(race.rno),
              race
            ]
          )
        )
      );
    } catch (error) {
    }
  }
  for (const row of targets) {
    const jcd = String(row.jcd || "").padStart(2, "0");
    const race = venueMaps.get(jcd)?.get(Number(row.rno));
    if (!race) {
      continue;
    }
    const deadline = row.deadline || race.deadline || null;
    const deadlineJST = row.deadline_jst || race.deadlineJST || null;
    row.deadline = deadline;
    row.deadline_jst = deadlineJST;
    if (deadline || deadlineJST) {
      try {
        await env.DB.prepare(`
            UPDATE predictions
            SET
              deadline = COALESCE(?, deadline),
              deadline_jst = COALESCE(?, deadline_jst),
              updated_at = CURRENT_TIMESTAMP
            WHERE race_key = ?
          `).bind(
          deadline,
          deadlineJST,
          row.race_key
        ).run();
      } catch (error) {
      }
    }
  }
  return rows || [];
}
__name(hydratePredictionDeadlines, "hydratePredictionDeadlines");
async function listSLinePredictions(env, raceDate) {
  const result = await env.DB.prepare(`
        SELECT
          race_key,
          race_date,
          jcd,
          venue,
          rno,
          deadline,
          deadline_jst,
          analyzed_at,
          confidence,
          decision,
          stable_score,
          strategy,
          prediction_json,
          updated_at

        FROM predictions

        WHERE race_date = ?
          AND (confidence = 'S' OR json_extract(prediction_json, '$.manshu.probability') IS NOT NULL)

        ORDER BY
          CASE
            WHEN deadline_jst IS NULL THEN 1
            ELSE 0
          END ASC,
          deadline_jst ASC,
          rno ASC
      `).bind(
    raceDate
  ).all();
  const rows = result.results || [];
  await hydratePredictionDeadlines(
    env,
    raceDate,
    rows
  );
  return rows.map(
    (row) => {
      const snapshot = parseJsonSafe(
        row.prediction_json,
        {}
      ) || {};
      const main6 = Array.isArray(
        snapshot.bets
      ) ? snapshot.bets.slice(0, 6).map(
        (bet) => ({
          combination: bet.combination,
          totalScore: bet.totalScore ?? null,
          odds: bet.odds ?? null,
          probability: bet.probability ?? null
        })
      ) : [];
      const cover4 = Array.isArray(
        snapshot.bets
      ) ? snapshot.bets.slice(6, 10).map(
        (bet) => ({
          combination: bet.combination,
          totalScore: bet.totalScore ?? null,
          odds: bet.odds ?? null,
          probability: bet.probability ?? null
        })
      ) : [];
      const holes = Array.isArray(
        snapshot.holeBets
      ) ? snapshot.holeBets.slice(0, 5).map(
        (bet) => ({
          combination: bet.combination,
          odds: bet.odds ?? null,
          holeScore: bet.holeScore ?? null,
          tier: bet.tier?.label || null
        })
      ) : [];
      return {
        preliminary: Boolean(snapshot.preliminary),
        raceKey: row.race_key,
        raceDate: row.race_date,
        jcd: row.jcd,
        venue: row.venue,
        rno: Number(
          row.rno
        ),
        deadline: row.deadline,
        deadlineJST: row.deadline_jst,
        analyzedAt: row.analyzed_at,
        confidence: row.confidence,
        manshuProbability: snapshot.manshu?.probability ?? null,
        manshuCombinations: snapshot.manshu?.combinations ?? null,
        highOddsBets: (snapshot.allBetRanking || []).filter((bet) => Number(bet.odds) >= 100).sort((a, b) => Number(b.probability) - Number(a.probability)).slice(0, 3),
        decision: row.decision,
        stableScore: row.stable_score,
        strategy: row.strategy,
        stars: confidenceStars(
          snapshot
        ),
        firstShare: snapshot.sDecision?.metrics?.firstShare ?? null,
        top6Probability: snapshot.sDecision?.metrics?.top6Probability ?? null,
        top10Probability: snapshot.sDecision?.metrics?.top10Probability ?? snapshotTopNProbability(
          snapshot,
          10
        ),
        firstGap: snapshot.sDecision?.metrics?.firstGap ?? null,
        reasons: Array.isArray(
          snapshot.sDecision?.reasons
        ) ? snapshot.sDecision.reasons : [],
        main6,
        cover4,
        holes,
        updatedAt: row.updated_at
      };
    }
  ).filter((pick) => !pick.preliminary && (pick.confidence === "S" && ["BET", "PASS"].includes(pick.decision) || isManshuHigh(pick, env)));
}
__name(listSLinePredictions, "listSLinePredictions");
async function runLineNotifications(env, raceDate = todayJST()) {
  await ensureLineNotificationTable(
    env
  );
  if (!lineNotificationConfigured(env)) {
    return {
      ok: false,
      configured: false,
      candidates: 0,
      sent: 0,
      earlySent: 0,
      sBetSent: 0,
      sPassSent: 0,
      skipped: 0,
      failed: 0,
      expired: 0,
      results: [],
      error: "LINE\u306E\u30B7\u30FC\u30AF\u30EC\u30C3\u30C8\u304C\u672A\u8A2D\u5B9A\u3067\u3059"
    };
  }
  const allPicks = await listSLinePredictions(
    env,
    raceDate
  );
  const picks = allPicks.filter((pick) => isLineEligible(pick, env));
  const stateMap = await listLineNotificationStates(
    env,
    raceDate
  );
  let sent = 0;
  let earlySent = 0;
  let sBetSent = 0;
  let sPassSent = 0;
  let manshuSent = 0;
  let skipped = 0;
  let failed = 0;
  let expired = 0;
  const results = [];
  const now = Date.now();
  for (const pick of picks) {
    let minutesUntil = null;
    if (pick.deadlineJST) {
      const deadlineMs = new Date(
        pick.deadlineJST
      ).getTime();
      if (Number.isFinite(
        deadlineMs
      )) {
        minutesUntil = (deadlineMs - now) / 6e4;
      }
    }
    if (minutesUntil === null) {
      skipped++;
      continue;
    }
    if (sent + failed >= 4) break;
    if (minutesUntil !== null && minutesUntil <= 0) {
      const finalKey = lineNotificationKey(
        pick,
        "FINAL"
      );
      const existing2 = stateMap.get(
        finalKey
      );
      if (existing2?.status !== "SENT" && existing2?.status !== "EXPIRED") {
        const message2 = buildLineFinalMessage(pick, env);
        const statePick2 = {
          ...pick,
          notificationKey: finalKey
        };
        await saveLineNotificationState(
          env,
          statePick2,
          "EXPIRED",
          message2,
          "\u7DE0\u5207\u5F8C\u306E\u305F\u3081\u901A\u77E5\u3057\u307E\u305B\u3093\u3067\u3057\u305F"
        );
        stateMap.set(
          finalKey,
          {
            race_key: finalKey,
            status: "EXPIRED"
          }
        );
        expired++;
      }
      skipped++;
      continue;
    }
    if (minutesUntil !== null && minutesUntil > AUTO_MAX_MINUTES) {
      skipped++;
      continue;
    }
    if (!LINE_EARLY_NOTIFICATIONS_ENABLED && minutesUntil !== null && minutesUntil > LINE_FINAL_MAX_MINUTES) {
      skipped++;
      continue;
    }
    const stage = LINE_EARLY_NOTIFICATIONS_ENABLED && minutesUntil !== null && minutesUntil > LINE_FINAL_MAX_MINUTES ? "EARLY" : "FINAL";
    const notificationKey = lineNotificationKey(
      pick,
      stage
    );
    const existing = stateMap.get(
      notificationKey
    );
    if ([notificationKey, `PASS:${pick.raceKey}`, `MANSHU:${pick.raceKey}`].some((key) => stateMap.get(key)?.status === "SENT") || existing?.status === "EXPIRED") {
      skipped++;
      continue;
    }
    const message = buildLineFinalMessage(pick, env);
    const statePick = {
      ...pick,
      notificationKey
    };
    try {
      await sendLinePush(
        env,
        message
      );
      await saveLineNotificationState(
        env,
        statePick,
        "SENT",
        message,
        null
      );
      stateMap.set(
        notificationKey,
        {
          race_key: notificationKey,
          status: "SENT"
        }
      );
      sent++;
      if (stage === "EARLY") {
        earlySent++;
      } else if (!(pick.confidence === "S" && pick.decision === "BET")) {
        manshuSent++;
      } else {
        sBetSent++;
      }
      results.push({
        raceKey: pick.raceKey,
        notificationKey,
        venue: pick.venue,
        rno: pick.rno,
        decision: pick.decision,
        stage,
        minutesUntil: minutesUntil === null ? null : Math.round(
          minutesUntil * 10
        ) / 10,
        status: "SENT"
      });
    } catch (error) {
      failed++;
      const errorText = error?.message || String(error);
      await saveLineNotificationState(
        env,
        statePick,
        "ERROR",
        message,
        errorText
      );
      stateMap.set(
        notificationKey,
        {
          race_key: notificationKey,
          status: "ERROR",
          error_text: errorText
        }
      );
      results.push({
        raceKey: pick.raceKey,
        notificationKey,
        venue: pick.venue,
        rno: pick.rno,
        decision: pick.decision,
        stage,
        status: "ERROR",
        error: errorText
      });
    }
  }
  return {
    ok: failed === 0,
    configured: true,
    candidates: picks.length,
    sent,
    earlySent,
    sBetSent,
    sPassSent,
    manshuSent,
    skipped,
    failed,
    expired,
    results
  };
}
__name(runLineNotifications, "runLineNotifications");
function mainSixMetricsText(m) {
  return `\u3010\u672C\u7DDA6\u70B9\u306EAI\u63A8\u5B9A\u3011
\u7684\u4E2D\u78BA\u7387\uFF1A${m.hitProbability == null ? "\u7B97\u51FA\u5F85\u3061" : (m.hitProbability * 100).toFixed(1) + "%"}
\u63A8\u5B9A\u56DE\u53CE\u7387\uFF1A${m.estimatedRecoveryRate == null ? "\u7B97\u51FA\u5F85\u3061" : m.estimatedRecoveryRate.toFixed(1) + "%"}
6,000\u5186\u4EE5\u4E0A\u3092\u56DE\u53CE\u3059\u308B\u78BA\u7387\uFF1A${m.breakEvenProbability == null ? "\u7B97\u51FA\u5F85\u3061" : (m.breakEvenProbability * 100).toFixed(1) + "%"}
\u203B\u7A74\u306F\u542B\u307F\u307E\u305B\u3093\u3002\u4FDD\u5B58\u30AA\u30C3\u30BA\u3068AI\u78BA\u7387\u306B\u3088\u308B\u8A66\u7B97\u3067\u3001\u5B9F\u7E3E\u5024\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002`;
}
__name(mainSixMetricsText, "mainSixMetricsText");

// src/backfill.mjs
function shiftRaceDate(dateKey, days) {
  const key = String(dateKey);
  const date = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8))));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}
__name(shiftRaceDate, "shiftRaceDate");
async function ensureHistoricalBackfillState(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS historical_results_backfill_state (
    id INTEGER PRIMARY KEY CHECK(id=1),
    cursor_date TEXT,
    venue_index INTEGER NOT NULL DEFAULT 0,
    next_rno INTEGER NOT NULL DEFAULT 1,
    priority_date TEXT,
    priority_venue_index INTEGER NOT NULL DEFAULT 0,
    priority_next_rno INTEGER NOT NULL DEFAULT 1,
    last_yesterday TEXT,
    failure_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
}
__name(ensureHistoricalBackfillState, "ensureHistoricalBackfillState");
async function readHistoricalBackfillState(env) {
  await ensureHistoricalBackfillState(env);
  const yesterday = jstDateKeyOffset(-1);
  let state = await env.DB.prepare("SELECT * FROM historical_results_backfill_state WHERE id=1").first();
  if (!state) {
    await env.DB.prepare(`INSERT INTO historical_results_backfill_state
      (id,cursor_date,last_yesterday) VALUES (1,?,?)`).bind(yesterday, yesterday).run();
    state = await env.DB.prepare("SELECT * FROM historical_results_backfill_state WHERE id=1").first();
  }
  if (state.last_yesterday !== yesterday) {
    state.priority_date = yesterday;
    state.priority_venue_index = 0;
    state.priority_next_rno = 1;
    state.failure_count = 0;
    state.last_yesterday = yesterday;
  }
  return state;
}
__name(readHistoricalBackfillState, "readHistoricalBackfillState");
async function writeHistoricalBackfillState(env, state) {
  await env.DB.prepare(`UPDATE historical_results_backfill_state SET
    cursor_date=?,venue_index=?,next_rno=?,priority_date=?,
    priority_venue_index=?,priority_next_rno=?,last_yesterday=?,
    failure_count=?,updated_at=CURRENT_TIMESTAMP WHERE id=1`).bind(
    state.cursor_date,
    state.venue_index,
    state.next_rno,
    state.priority_date,
    state.priority_venue_index,
    state.priority_next_rno,
    state.last_yesterday,
    state.failure_count
  ).run();
}
__name(writeHistoricalBackfillState, "writeHistoricalBackfillState");
function makeHistoricalSnapshot(race, before, result, context) {
  const racers = mergeBefore(race.racers, before);
  const weights = blankWeights();
  const detailed = racers.map((r) => {
    const components = scoreComponents(r, racers);
    return {
      lane: r.lane,
      name: r.name,
      registration: r.registration,
      class: r.class,
      components,
      overallScore: overallScore(components, weights),
      firstScore: roleScore(components, weights, "first"),
      secondScore: roleScore(components, weights, "second"),
      thirdScore: roleScore(components, weights, "third")
    };
  });
  return {
    version: WORKER_VERSION,
    date: context.date,
    jcd: context.jcd,
    venue: context.venue,
    rno: context.rno,
    learningOnly: true,
    historicalImport: true,
    bets: [],
    holeBets: [],
    allBetRanking: [],
    racersDetailed: detailed,
    result,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
__name(makeHistoricalSnapshot, "makeHistoricalSnapshot");
async function backfillOneRace(env, date, jcd, venue, rno) {
  const existing = await getLearningByRaceKey(env, makeRaceKey(date, jcd, rno));
  const savedSnapshot = parseJsonSafe(existing?.race_data_json, null);
  if (existing?.finished && savedSnapshot?.racersDetailed?.length === 6) return "EXISTING";
  const savedResult = parseJsonSafe(existing?.result_json, null);
  const raceResult = existing?.finished && savedResult?.finished ? savedResult : await resultData(date, jcd, rno);
  if (!raceResult.finished || !Array.isArray(raceResult.winningLanes) || raceResult.winningLanes.length < 3)
    throw new Error("\u78BA\u5B9A\u7D50\u679C\u304C\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093");
  if (existing?.race_data_json && savedSnapshot?.racersDetailed?.length === 6) {
    await saveLearningRace(env, { race_date: date, jcd, venue, rno, result: raceResult, finished: true });
    return "UPDATED";
  }
  if (!existing?.finished) {
    await saveLearningRace(env, {
      race_date: date,
      jcd,
      venue,
      rno,
      result: raceResult,
      finished: true,
      historical_import: !existing
    });
  }
  const [race, before] = await Promise.all([raceData(date, jcd, rno), beforeData(date, jcd, rno).catch(() => ({ racers: [] }))]);
  if (race.racers?.length !== 6) throw new Error("\u9078\u624B\u60C5\u58316\u8247\u304C\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093");
  const snapshot = makeHistoricalSnapshot(race, before, raceResult, { date, jcd, venue, rno });
  await saveLearningRace(env, {
    race_date: date,
    jcd,
    venue,
    rno,
    race: snapshot,
    before,
    result: raceResult,
    finished: true,
    historical_import: true
  });
  return existing?.finished ? "ENRICHED" : "IMPORTED";
}
__name(backfillOneRace, "backfillOneRace");
async function runHistoricalBackfill(env) {
  const state = await readHistoricalBackfillState(env);
  const cutoff = jstDateKeyOffset(-30);
  const priority = Boolean(state.priority_date);
  const date = priority ? state.priority_date : state.cursor_date;
  if (!date || date < cutoff) {
    if (!priority && state.cursor_date) {
      state.cursor_date = null;
      await writeHistoricalBackfillState(env, state);
    }
    return { status: "COMPLETE", date: null, processed: 0 };
  }
  let venuesForDate;
  try {
    venuesForDate = await venues(date);
  } catch (error) {
    state.failure_count = Number(state.failure_count || 0) + 1;
    if (state.failure_count < 3) {
      await writeHistoricalBackfillState(env, state);
      throw error;
    }
    console.error("USA_LAB_BACKFILL_DATE_SKIP", date, error?.message || String(error));
    state.failure_count = 0;
    if (priority) state.priority_date = null;
    else state.cursor_date = shiftRaceDate(date, -1);
    await writeHistoricalBackfillState(env, state);
    return { status: "SKIPPED_DATE", date, processed: 0 };
  }
  let venueIndex = Number(priority ? state.priority_venue_index : state.venue_index) || 0;
  let rno = Number(priority ? state.priority_next_rno : state.next_rno) || 1;
  let processed = 0, imported = 0, enriched = 0, existing = 0, updated = 0, skipped = 0;
  while (venueIndex < venuesForDate.length && processed < 4) {
    const target = venuesForDate[venueIndex];
    let schedule;
    try {
      schedule = await venueData(date, target.jcd);
    } catch (error) {
      state.failure_count = Number(state.failure_count || 0) + 1;
      if (state.failure_count < 3) {
        if (priority) {
          state.priority_venue_index = venueIndex;
          state.priority_next_rno = rno;
        } else {
          state.venue_index = venueIndex;
          state.next_rno = rno;
        }
        await writeHistoricalBackfillState(env, state);
        throw error;
      }
      console.error("USA_LAB_BACKFILL_VENUE_SKIP", date, target.jcd, error?.message || String(error));
      state.failure_count = 0;
      skipped++;
      venueIndex++;
      rno = 1;
      continue;
    }
    const available = new Set(schedule.races.map((r) => Number(r.rno)));
    while (rno <= 12 && processed < 4) {
      const current = rno;
      if (!available.has(current)) {
        rno++;
        continue;
      }
      try {
        const result = await backfillOneRace(env, date, target.jcd, target.name, current);
        if (result === "IMPORTED") imported++;
        else if (result === "ENRICHED") enriched++;
        else if (result === "UPDATED") updated++;
        else existing++;
        state.failure_count = 0;
        rno++;
        processed++;
      } catch (error) {
        state.failure_count = Number(state.failure_count || 0) + 1;
        console.error("USA_LAB_BACKFILL_RACE_ERROR", date, target.jcd, current, error?.message || String(error));
        if (state.failure_count >= 3) {
          rno++;
          processed++;
          skipped++;
          state.failure_count = 0;
        } else {
          processed = 4;
        }
        break;
      }
    }
    if (rno > 12) {
      venueIndex++;
      rno = 1;
    }
  }
  if (venueIndex >= venuesForDate.length) {
    if (priority) {
      state.priority_date = null;
      state.priority_venue_index = 0;
      state.priority_next_rno = 1;
    } else {
      state.cursor_date = shiftRaceDate(date, -1);
      state.venue_index = 0;
      state.next_rno = 1;
    }
  } else if (priority) {
    state.priority_venue_index = venueIndex;
    state.priority_next_rno = rno;
  } else {
    state.venue_index = venueIndex;
    state.next_rno = rno;
  }
  await writeHistoricalBackfillState(env, state);
  return {
    status: skipped ? "PARTIAL" : "RUNNING",
    date,
    venue: venuesForDate[Math.min(venueIndex, venuesForDate.length - 1)]?.name,
    processed,
    imported,
    enriched,
    updated,
    existing,
    skipped,
    priority,
    cursorDate: state.cursor_date
  };
}
__name(runHistoricalBackfill, "runHistoricalBackfill");

// src/database.mjs
var initialized = /* @__PURE__ */ new WeakMap();
async function initializeDatabase(env) {
  if (!env.DB) throw new Error("Cloudflare\u306ED1 binding\u300CDB\u300D\u304C\u3042\u308A\u307E\u305B\u3093");
  if (!initialized.has(env.DB)) initialized.set(env.DB, (async () => {
    await env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS predictions(race_key TEXT PRIMARY KEY,race_date TEXT NOT NULL,jcd TEXT,venue TEXT,rno INTEGER,deadline TEXT,deadline_jst TEXT,analyzed_at TEXT,confidence TEXT,decision TEXT,stable_score REAL,strategy TEXT,prediction_json TEXT,note_title TEXT,note_body TEXT,posted INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS learning_races(race_key TEXT PRIMARY KEY,race_date TEXT NOT NULL,jcd TEXT,venue TEXT,rno INTEGER,race_data_json TEXT,before_data_json TEXT,odds_data_json TEXT,result_json TEXT,finished INTEGER DEFAULT 0,historical_import INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS supplemental_cache(cache_key TEXT PRIMARY KEY,payload_json TEXT,expires_at INTEGER NOT NULL)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS rebuild_jobs(job TEXT PRIMARY KEY,owner TEXT,expires_at INTEGER DEFAULT 0,started_at TEXT,finished_at TEXT,status TEXT,summary_json TEXT)`),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS predictions_date_idx ON predictions(race_date)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS learning_date_idx ON learning_races(race_date,finished)")
    ]);
  })().catch((error) => {
    initialized.delete(env.DB);
    throw error;
  }));
  await initialized.get(env.DB);
}
__name(initializeDatabase, "initializeDatabase");

// src/jobs.mjs
var cronJobs = { "*/5 * * * *": "predictions", "1-59/5 * * * *": "results", "2-59/5 * * * *": "learning", "3-59/5 * * * *": "notifications" };
var handlers = {
  predictions: runAutoWindow,
  results: runResultUpdates,
  learning: runHistoricalBackfill,
  scenarioLearning: runScenarioLearningBatch,
  notifications: /* @__PURE__ */ __name(async (env) => {
    const results = await Promise.allSettled([runLineNotifications(env), runWebPushNotifications(env)]);
    return Object.fromEntries(results.map((r, i) => [["line", "push"][i], r.status === "fulfilled" ? r.value : { error: String(r.reason?.message || r.reason) }]));
  }, "notifications")
};
async function runJob(env, job) {
  if (!handlers[job]) throw new Error("\u4E0D\u660E\u306A\u51E6\u7406\u3067\u3059");
  await initializeDatabase(env);
  const owner = crypto.randomUUID(), now = Date.now();
  await env.DB.prepare("INSERT INTO rebuild_jobs(job,expires_at) VALUES(?,0) ON CONFLICT(job) DO NOTHING").bind(job).run();
  const lock = await env.DB.prepare(`UPDATE rebuild_jobs SET owner=?,expires_at=?,started_at=?,status='RUNNING' WHERE job=? AND expires_at<=?`).bind(owner, now + 15 * 6e4, new Date(now).toISOString(), job, now).run();
  if (!lock.meta?.changes) return { status: "RUNNING", job };
  try {
    const summary = await handlers[job](env);
    const partial = Boolean(summary?.retryCount || summary?.venueErrors?.length || summary?.line?.error || summary?.push?.error);
    const status = partial ? "PARTIAL" : "DONE";
    await env.DB.prepare(`UPDATE rebuild_jobs SET expires_at=0,owner=NULL,finished_at=?,status=?,summary_json=? WHERE job=? AND owner=?`).bind((/* @__PURE__ */ new Date()).toISOString(), status, JSON.stringify(summary), job, owner).run();
    return { status, job, summary };
  } catch (error) {
    await env.DB.prepare(`UPDATE rebuild_jobs SET expires_at=0,owner=NULL,finished_at=?,status='ERROR',summary_json=? WHERE job=? AND owner=?`).bind((/* @__PURE__ */ new Date()).toISOString(), JSON.stringify({ error: error?.message || String(error) }), job, owner).run();
    throw error;
  }
}
__name(runJob, "runJob");

var savedRacesPage = "<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>保存済みレース｜うさLAB</title><style>\n*{box-sizing:border-box}body{margin:0;background:#f5f6fb;color:#273044;font:16px/1.6 system-ui,sans-serif}main{max-width:900px;margin:auto;padding:20px 16px 60px}a{color:#354f85}h1{font-size:27px;margin:16px 0 4px}p{margin:6px 0 16px}.muted,small{color:#657087}small{display:block}.controls{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}input,select,button{font:inherit;border:1px solid #d6ddeb;background:white;border-radius:12px;padding:10px;min-height:46px;max-width:100%;color:inherit}button{cursor:pointer;background:#354f85;color:white}button:disabled{opacity:.5}.stats{display:flex;gap:8px;flex-wrap:wrap}.stats span{background:#e8eef9;padding:8px 12px;border-radius:10px}article{background:white;border:1px solid #e0e5ef;border-radius:18px;padding:18px;margin:14px 0;box-shadow:0 3px 10px #23365005}.top{display:flex;justify-content:space-between;gap:10px}h2{font-size:22px;margin:0}.time{text-align:right;font-weight:700;white-space:nowrap}.tags{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0}.tag{padding:3px 10px;border-radius:8px;font-size:14px;background:#eaf0fb}.warn{background:#fff1db;color:#88520a}.good{background:#e5f4eb;color:#246443}.bets{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}.bet{background:#f2f5fa;border-radius:9px;padding:9px;text-align:center;font-weight:bold;font-size:20px}summary{cursor:pointer;padding:10px 0;font-weight:600}#message{min-height:26px;margin-top:12px}label{display:flex;flex-direction:column;gap:3px;font-size:14px}.controls button{align-self:end}details p{margin:8px 0}#list{margin-top:16px}button:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #849bdf;outline-offset:3px}\n.mode{border-top:1px solid #e0e5ef;padding:16px 0;overflow-wrap:anywhere}.amounts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;font-size:14px;margin:12px 0}.winner{color:#246443;font-weight:700}#totals{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:0 20px}.probrow{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid #edf0f5}.probrow b{white-space:nowrap}</style></head><body><main><a href=\"/\">← うさLABへ戻る</a><h1>保存済みレース</h1><p class=\"muted\">保存された予想と結果を、日付ごとに確認できます。</p><div class=\"controls\"><label>日付<input id=\"date\" type=\"date\"></label><label>会場<select id=\"venue\"><option value=\"\">すべての会場</option></select></label><label>表示<select id=\"filter\"><option value=\"all\">すべて</option><option value=\"upcoming\">締切前</option><option value=\"final\">確定予想</option><option value=\"preliminary\">暫定予想</option><option value=\"bet\">S勝負</option><option value=\"hit\">的中したレース</option><option value=\"pending\">結果待ち</option></select></label><label>買い目の種類<select id=\"mode\"><option value=\"\">すべての種類</option><option value=\"main6\">本線6点</option><option value=\"hole\">穴候補</option><option value=\"scenario\">展開予想</option><option value=\"hit\">的中特化型</option><option value=\"high\">一撃重視型</option></select></label><button id=\"refresh\">更新</button></div><div id=\"stats\" class=\"stats\"></div><div id=\"message\" role=\"status\" aria-live=\"polite\"></div><article><details><summary>実際の的中率・種類ごとの日別成績を見る</summary><p class=\"muted\">選択日・会場の確定予想のみ集計します。暫定予想と結果待ちは除外。各種類は別々の試算で、種類間の重複は合算しません。</p><div id=\"totals\"></div></details></article><section id=\"list\" aria-label=\"保存済みレース一覧\"></section><p class=\"muted\">保存済みのレースのみ表示します。保存件数は開催レース総数ではありません。払戻は穴候補・その他ともに各1,000円の試算です。実購入の収支ではありません。保存のない種類は後から予想を作り直しません。</p></main><script>\nconst $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));\nconst jst=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}),clock=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'});let rows=[],serial=0;\nconst money=v=>v==null?'未取得':Number(v).toLocaleString('ja-JP')+'円';\nconst time=v=>v&&Number.isFinite(Date.parse(v))?clock.format(new Date(v)):'―';\nconst upcoming=r=>Number.isFinite(Date.parse(r.deadlineJST))&&Date.parse(r.deadlineJST)>Date.now();\n$('date').value=jst.format(new Date());\nconst modes=[['main6','本線6点'],['hole','穴候補'],['scenario','展開予想'],['hit','的中特化型'],['high','一撃重視型']];\nconst statusLabel=s=>({hit:'的中',miss:'不的中',pending:'結果待ち',unavailable:'保存なし'}[s]||'保存なし');\nconst percent=p=>typeof p==='number'&&Number.isFinite(p)?(p*100).toFixed(1)+'%':'未算出';\nfunction probabilityComparison(o){const available=modes.map(([key,label])=>({key,label,m:o.modes?.[key]})).filter(x=>x.m?.count>0).sort((a,b)=>(b.m.estimatedHitProbability??-1)-(a.m.estimatedHitProbability??-1));const known=available.filter(x=>typeof x.m.estimatedHitProbability==='number');const top=known[0]?.m.estimatedHitProbability;const leaders=known.filter(x=>Math.abs(x.m.estimatedHitProbability-top)<1e-9);return '<div class=\"mode\"><strong>今回の推定的中確率を比較</strong><p>'+(known.length>=2?'算出できた種類で最高：'+leaders.map(x=>x.label).join('・')+' '+percent(top):'比較できる確率が不足しています')+'</p>'+available.map(x=>'<div class=\"probrow\"><span>'+x.label+'<small>'+x.m.count+'点 ／ '+money(x.m.stake)+'</small></span><b>'+percent(x.m.estimatedHitProbability)+'</b></div>').join('')+'<small>保存時のAI確率を、重複を除いた買い目ごとに合計。展開予想も既存AIの確率を使用します。点数・対象が異なる比較です。予測値と実際の的中率の一致は未検証です。</small></div>';}\nfunction modeCard(key,label,o){const m=o.modes?.[key];if(!m||m.status==='unavailable')return '<div class=\"mode\"><strong>'+label+'</strong><small>この種類の買い目は保存されていません</small></div>';\nreturn '<div class=\"mode\"><div class=\"top\"><strong>'+label+'</strong><span class=\"tag '+(m.status==='hit'?'good':'')+'\">'+statusLabel(m.status)+'</span></div><small>'+m.count+'点・各'+money(m.unit)+'の試算</small><p>推定的中確率 <strong>'+percent(m.estimatedHitProbability)+'</strong></p>'+(m.winningCombination?'<p class=\"winner\">的中買い目 '+esc(m.winningCombination)+'</p>':'')+'<div class=\"amounts\"><span>購入額<br><b>'+money(m.stake)+'</b></span><span>払戻額<br><b>'+money(m.returns)+'</b></span><span>収支<br><b>'+money(m.profit)+'</b></span></div><details><summary>買い目を見る</summary><div class=\"bets\">'+m.selections.map(x=>'<div class=\"bet '+(x===m.winningCombination?'good':'')+'\">'+esc(x)+'</div>').join('')+'</div></details></div>';\n}\nfunction scenarioTrial(source){const pairs=source.filter(r=>r.finalized&&!r.preliminary&&r.outcome.scenarioComparisonEligible===true&&r.outcome.scenarioVersion==='1.2.0'&&r.outcome.scenarioSelection==='learned-probability-top6'&&['scenario','scenarioLegacy'].every(k=>{const m=r.outcome.modes?.[k];return m?.count===6&&['hit','miss'].includes(m.status)&&m.returns!=null}));const n=pairs.length;return '<div class=\"mode\"><strong>展開予想：新旧の同条件比較</strong><p>締切前に両方式を保存・各6点・結果と払戻取得済み '+n+'レース</p>'+[['scenario','新方式'],['scenarioLegacy','旧方式（各展開2点）']].map(([k,l])=>{const hits=pairs.filter(r=>r.outcome.modes[k].status==='hit').length,ret=pairs.reduce((s,r)=>s+r.outcome.modes[k].returns,0);return '<p>'+l+'：'+hits+'/'+n+'的中 ／ 的中率 '+(n?(hits/n*100).toFixed(1)+'%':'―')+' ／ 回収率 '+(n?(ret/(n*6000)*100).toFixed(1)+'%':'―')+'</p>'}).join('')+'<small>同じレース・同じ6,000円で比較。過去の予想を書き換えず、新規保存分から検証します。件数だけで改善を断定しません。</small></div>';}\nfunction independentTrial(source){const pairs=source.filter(r=>r.outcome.independentScenarioEligible===true&&['scenario','scenarioIndependent'].every(k=>{const m=r.outcome.modes?.[k];return m?.count===6&&['hit','miss'].includes(m.status)&&m.returns!=null}));return '<div class=\"mode\"><strong>展開専用学習：同じ6点で比較（検証中）</strong><p>対象 '+pairs.length+'レース</p>'+[['scenario','現在の展開予想'],['scenarioIndependent','独立学習']].map(([k,l])=>{const n=pairs.length,h=pairs.filter(r=>r.outcome.modes[k].status==='hit').length,ret=pairs.reduce((s,r)=>s+r.outcome.modes[k].returns,0);return '<p>'+l+'：'+h+'/'+n+'的中 ／ 的中率 '+(n?(h/n*100).toFixed(1)+'%':'―')+' ／ 回収率 '+(n?(ret/(n*6000)*100).toFixed(1)+'%':'―')+'</p>'}).join('')+'<small>独立学習は検証用です。前日以前の最大3,000件から評価順位・1着艇番別の着順を学習。展示や進入の因果を学ぶモデルではありません。実際に表示する予想は自動で切り替えません。</small></div>';}\nfunction summaries(source){return modes.map(([key,label])=>{const eligible=source.filter(r=>r.finalized&&!r.preliminary).map(r=>r.outcome.modes?.[key]).filter(m=>m&&['hit','miss'].includes(m.status));const settled=eligible.filter(m=>m.returns!=null&&m.profit!=null);const wins=eligible.filter(m=>m.status==='hit').length;const stake=settled.reduce((n,m)=>n+m.stake,0),ret=settled.reduce((n,m)=>n+m.returns,0);return '<div class=\"mode\"><strong>'+label+'</strong><p>的中 '+wins+' / '+eligible.length+'レース'+(eligible.length?'（'+(wins/eligible.length*100).toFixed(1)+'%）':'')+'</p><small>'+ (eligible.length<30?'参考値：結果確認済み30レース未満。':'')+'種類によって対象レース・点数が異なります。</small><small>払戻取得済み '+settled.length+'レースの試算</small><p>購入 '+money(stake)+' ／ 払戻 '+money(ret)+'<br>収支 '+money(ret-stake)+' ／ 回収率 '+(stake?(ret/stake*100).toFixed(1)+'%':'―')+'</p></div>'}).join('');}\nfunction render(){const f=$('filter').value,v=$('venue').value,k=$('mode').value;const source=rows.filter(r=>!v||r.jcd===v);const shown=source.filter(r=>(!k||r.outcome.modes?.[k]?.count>0)&&(f==='all'||f==='upcoming'&&upcoming(r)||f==='final'&&r.finalized||f==='preliminary'&&r.preliminary||f==='bet'&&r.decision==='BET'||f==='hit'&&(k?r.outcome.modes?.[k]?.status==='hit':modes.some(([key])=>r.outcome.modes?.[key]?.status==='hit'))||f==='pending'&&!r.outcome.finished));\nshown.sort((a,b)=>Number(upcoming(b))-Number(upcoming(a))||String(a.deadlineJST||'z').localeCompare(String(b.deadlineJST||'z'))||a.rno-b.rno);\n$('stats').innerHTML='<span>保存 '+rows.length+'件</span><span>確定 '+rows.filter(r=>r.finalized).length+'件</span><span>暫定 '+rows.filter(r=>r.preliminary).length+'件</span><span>表示 '+shown.length+'件</span>';\n$('totals').innerHTML=independentTrial(source)+scenarioTrial(source)+summaries(source);\n$('list').innerHTML=shown.length?shown.map(r=>{const o=r.outcome;return '<article><div class=\"top\"><h2>'+esc(r.venue)+' '+esc(r.rno)+'R</h2><div class=\"time\">締切 '+esc(r.deadline||'―')+'<small>'+(upcoming(r)?'締切前':'締切済み／時刻未確認')+'</small></div></div><div class=\"tags\"><span class=\"tag '+(r.preliminary?'warn':'')+'\">'+(r.preliminary?'暫定予想':r.finalized?'確定予想':'予想更新中')+'</span><span class=\"tag\">'+(r.decision==='BET'?'S勝負':r.decision==='PASS'?'S見送り':'保存済み')+'</span></div><small>分析 '+esc(time(r.analyzedAt))+'（日本時間）</small>'+(o.finished?'<p>結果 <strong>'+esc(o.combination)+'</strong> ／ 3連単100円払戻 '+esc(money(o.payout))+'</p>':'<p>結果待ち</p>')+(o.scenarioVersion?'<small>展開予想 v'+esc(o.scenarioVersion)+'</small>':'')+(o.independentScenarioModel?'<small>展開専用学習 '+esc(o.independentScenarioModel.trainingRaces)+'件 ／ '+(o.independentScenarioModel.active?'検証用6点を保存':'データ不足')+'</small>':'')+(o.modes?.scenarioIndependent?.count?'<details><summary>検証用：独立学習の買い目と結果</summary>'+modeCard('scenarioIndependent','展開専用学習（検証用）',o)+'</details>':'')+(r.notifications?.line?'<span class=\"tag good\">LINE通知済み</span>':'')+(r.notifications?.push?'<span class=\"tag good\">Web Push通知済み</span>':'')+probabilityComparison(o)+modes.filter(([key])=>!k||k===key).map(([key,label])=>modeCard(key,label,o)).join('')+(o.modes?.scenarioLegacy?.count?'<details><summary>検証用：旧展開予想の結果</summary>'+modeCard('scenarioLegacy','旧展開予想',o)+'</details>':'')+'</article>'}).join(''):'<article>'+(rows.length?'条件に合う保存済みレースはありません。':'この日付の保存済み予想はありません。')+'</article>';\n}\nasync function load(){const n=++serial,day=$('date').value;if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(day))return;$('refresh').disabled=true;$('message').textContent='保存済みレースを読み込み中…';rows=[];render();try{const response=await fetch('/api/saved-races?hd='+day.replaceAll('-',''),{cache:'no-store'});const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'読み込みに失敗しました');if(n!==serial)return;rows=data.races;const selected=$('venue').value;const venues=[...new Map(rows.map(r=>[r.jcd,r.venue])).entries()];$('venue').innerHTML='<option value=\"\">すべての会場</option>'+venues.map(([id,name])=>'<option value=\"'+esc(id)+'\">'+esc(name)+'</option>').join('');if(venues.some(([id])=>id===selected))$('venue').value=selected;render();$('message').textContent='更新 '+clock.format(new Date())+'（日本時間）';}catch(e){if(n===serial){$('list').innerHTML='';$('message').textContent='読み込めませんでした。「更新」で再試行してください。';}}finally{if(n===serial)$('refresh').disabled=false;}}\n$('refresh').onclick=load;$('date').onchange=load;$('venue').onchange=render;$('filter').onchange=render;$('mode').onchange=render;load();\n</script></body></html>\n";

// src/index.mjs
var reply = json;
var publicPaths = /* @__PURE__ */ new Set(["/api/saved-races", "/api/health", "/api/venues", "/api/venue", "/api/race", "/api/before", "/api/odds", "/api/result", "/api/today-predictions", "/api/prediction", "/api/learned-weights", "/api/push/public-key", "/api/push-latest", "/api/push-sw.js", "/api/push-manifest.webmanifest"]);
var parameterDateFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" });
function parameters(url) {
  const hd = url.searchParams.get("hd") || url.searchParams.get("date") || todayJST();
  const jcd = String(url.searchParams.get("jcd") || "").padStart(2, "0");
  const rno = Number(url.searchParams.get("rno"));
  const date = /* @__PURE__ */ new Date(`${hd.slice(0, 4)}-${hd.slice(4, 6)}-${hd.slice(6, 8)}T00:00:00+09:00`);
  if (!/^\d{8}$/.test(hd) || !Number.isFinite(date.getTime()) || parameterDateFormatter.format(date).replaceAll("-", "") !== hd) throw Object.assign(Error("\u65E5\u4ED8\u304C\u4E0D\u6B63\u3067\u3059"), { status: 400 });
  return { hd, jcd, rno };
}
__name(parameters, "parameters");
function raceParameters(url, venueOnly = false) {
  const p = parameters(url);
  if (!/^\d{2}$/.test(p.jcd) || Number(p.jcd) < 1 || Number(p.jcd) > 24 || !venueOnly && (!Number.isInteger(p.rno) || p.rno < 1 || p.rno > 12)) throw Object.assign(Error("\u4F1A\u5834\u30FB\u30EC\u30FC\u30B9\u756A\u53F7\u304C\u4E0D\u6B63\u3067\u3059"), { status: 400 });
  return p;
}
__name(raceParameters, "raceParameters");
var previewCache = new WeakMap();
async function prediction(env, url, request) {
  if (request.method === "POST") {
    const auth = checkPrivateAccess(request, env);
    if (auth) return auth;
  }
  const { hd, jcd, rno } = raceParameters(url), key = makeRaceKey(hd, jcd, rno);
  const row = await env.DB.prepare("SELECT prediction_json,deadline,deadline_jst,note_body FROM predictions WHERE race_key=?").bind(key).first();
  if (row) {
    const snapshot2 = parseJsonSafe(row.prediction_json, null);
    if (snapshot2) return reply({ ok: true, saved: true, snapshot: snapshot2, main6Metrics: mainSixMetrics(snapshot2.bets), stars: confidenceStars(snapshot2), purposeModes: savedPurposeView(snapshot2), deadline: row.deadline, deadlineJST: row.deadline_jst, noteBody: row.note_body });
  }
  if (hd !== todayJST()) return reply({ ok: false, error: "\u3053\u306E\u30EC\u30FC\u30B9\u306E\u4FDD\u5B58\u6E08\u307F\u4E88\u60F3\u306F\u3042\u308A\u307E\u305B\u3093" }, 404);
  const venue = await venueData(hd, jcd), target = venue.races.find((r) => Number(r.rno) === rno);
  if (!target || !target.deadlineJST || !Number.isFinite(Date.parse(target.deadlineJST)) || Date.parse(target.deadlineJST) <= Date.now()) return reply({ ok: false, error: "\u7DE0\u5207\u6E08\u307F\u3001\u307E\u305F\u306F\u7DE0\u5207\u3092\u78BA\u8A8D\u3067\u304D\u307E\u305B\u3093\u3002\u7D50\u679C\u3092\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044" }, 409);
  if (request.method === "POST") {
    const auth = checkPrivateAccess(request, env);
    if (auth) return auth;
    await analyzeAndSaveTarget(env, { ...target, hd, jcd, rno, venue: venue.venue });
    return prediction(env, url, new Request(request.url));
  }
  let previews = previewCache.get(env.DB);
  if (!previews) { previews = new Map(); previewCache.set(env.DB, previews); }
  const cached = previews.get(key);
  if (cached && cached.expires > Date.now()) return reply(cached.payload);
  const data = await fetchPredictionData(env, hd, jcd, rno, { allowBeforeMissing: true });
  const snapshot = data.prediction.snapshot;
  Object.assign(snapshot, { deadline: target.deadline, deadlineJST: target.deadlineJST, preliminary: true, source: "server-preview" });
  const payload = { ok: true, saved: false, snapshot, main6Metrics: mainSixMetrics(snapshot.bets), stars: confidenceStars(snapshot), purposeModes: savedPurposeView(snapshot), deadline: target.deadline, deadlineJST: target.deadlineJST, noteBody: buildNoteArticle(snapshot, target.deadline).body + "\n\n" + scenarioNoteLines(snapshot.scenarioAnalysis).join("\n") };
  for (const [cacheKey, item] of previews) if (item.expires <= Date.now()) previews.delete(cacheKey);
  if (previews.size >= 24) previews.delete(previews.keys().next().value);
  previews.set(key, { payload, expires: Math.min(Date.now() + 30000, Date.parse(target.deadlineJST)) });
  return reply(payload);
}
__name(prediction, "prediction");
function withoutBalanceApp(source) {
  // Remove only the balance entries in the deployed UI's label dictionaries.
  return source.replace(/,\s*balance\s*:\s*(['"])[^'"\r\n]*バランス[^'"\r\n]*\1/g, "").replace("const modes=o?.modes||{main6:o?.baseline,scenario:o?.scenario};", "const modes=Object.fromEntries(Object.entries(o?.modes||{main6:o?.baseline,scenario:o?.scenario}).filter(([key])=>!['scenarioIndependent','scenarioLegacy'].includes(key))); ");
}
async function serveAppWithoutBalance(request, env) {
  const headers = new Headers(request.headers);
  headers.delete("if-none-match");
  headers.delete("if-modified-since");
  const response = await env.ASSETS.fetch(new Request(request, { headers }));
  if (!response.ok) return response;
  const body = withoutBalanceApp(await response.text());
  const outgoing = new Headers(response.headers);
  for (const name of ["etag", "last-modified", "content-length", "content-encoding"]) outgoing.delete(name);
  outgoing.set("cache-control", "no-store");
  return new Response(body, { status: response.status, headers: outgoing });
}
async function fetchHandler(request, env) {
  const url = new URL(request.url), path = url.pathname;
  try {
    if (path === "/saved" || path === "/saved/") return new Response(savedRacesPage, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    if (path === "/api/s-picks-view") return Response.redirect(url.origin + "/?view=predictions&filter=s", 302);
    if (!path.startsWith("/api/")) {
      if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
        return reply({ ok: false, code: "ASSETS_BINDING_MISSING", error: "画面用ファイルのASSETS設定がありません。静的ファイルを含む元のプロジェクトから再デプロイしてください。" }, 503);
      }
      if (path === "/app.js") return await serveAppWithoutBalance(request, env);
      return await env.ASSETS.fetch(request);
    }
    if (!publicPaths.has(path)) {
      const auth = checkPrivateAccess(request, env);
      if (auth) return auth;
    }
    if (path === "/api/health") return reply({ ok: true, version: WORKER_VERSION, aiVersion: AI_VERSION, authConfigured: Boolean(env.D1_WRITE_TOKEN), lineConfigured: lineNotificationConfigured(env) });
    if (path === "/api/push-sw.js") return new Response(webPushServiceWorkerJs(), { headers: { "content-type": "application/javascript", "service-worker-allowed": "/" } });
    if (path === "/api/push-manifest.webmanifest") return new Response(JSON.stringify(webPushManifest()), { headers: { "content-type": "application/manifest+json" } });
    if (!["GET", "POST"].includes(request.method)) return reply({ ok: false, error: "Method Not Allowed" }, 405);
    const writePaths = ["/api/prediction", "/api/jobs/run", "/api/push/subscribe", "/api/push/unsubscribe"];
    if (request.method === "POST" && !writePaths.includes(path)) return reply({ ok: false, error: "\u3053\u306EAPI\u306FGET\u306E\u307F\u3067\u3059" }, 405);
    if (["/api/jobs/run", "/api/push/subscribe", "/api/push/unsubscribe"].includes(path) && request.method !== "POST") return reply({ ok: false, error: "POST\u3067\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044" }, 405);
    if (path === "/api/venues") {
      const { hd } = parameters(url);
      return reply({ ok: true, hd, venues: await venues(hd) });
    }
    if (path === "/api/venue") {
      const { hd, jcd } = raceParameters(url, true);
      return reply({ ok: true, ...await venueData(hd, jcd) });
    }
    if (["/api/race", "/api/before", "/api/odds", "/api/result"].includes(path)) {
      const { hd, jcd, rno } = raceParameters(url);
      const fn = { "/api/race": raceData, "/api/before": beforeData, "/api/odds": oddsData, "/api/result": resultData }[path];
      return reply({ ok: true, ...await fn(hd, jcd, rno) });
    }
    await initializeDatabase(env);
    if (path === "/api/prediction" || path === "/api/prediction-detail") return await prediction(env, url, request);
    if (path === "/api/saved-races") {
      const { hd } = parameters(url);
      const receipts = await notificationReceipts(env, hd);
      const rows = (await env.DB.prepare("SELECT p.*,l.result_json FROM predictions p LEFT JOIN learning_races l ON p.race_key=l.race_key WHERE p.race_date=? ORDER BY p.deadline_jst,p.jcd,p.rno").bind(hd).all()).results || [];
      return reply({ ok: true, date: hd, races: rows.map(r => {
        const s = parseJsonSafe(r.prediction_json, {}) || {};
        const result = parseJsonSafe(r.result_json, null) || s.result;
        return { notifications: receipts(r.race_key), venue: r.venue, jcd: String(r.jcd), rno: Number(r.rno), deadline: r.deadline, deadlineJST: r.deadline_jst, analyzedAt: r.analyzed_at, preliminary: Boolean(s.preliminary), finalized: Boolean(s.finalized), decision: r.decision, main6: (s.bets || []).slice(0,6).map(b => b.combination), holes: (s.holeBets || []).map(b => b.combination), outcome: savedResultView(s, result, env) };
      }) });
    }
    if (path === "/api/today-predictions") {
      const { hd } = parameters(url);
      const predictions = await listDailyPredictions(env, hd);
      return reply({ ok: true, date: hd, count: predictions.length, predictions });
    }
    if (path === "/api/learned-weights") {
      const { hd } = parameters(url);
      const learned = await calculateRoleLearnedWeights(env, hd);
      return reply({ ok: true, learned: { active: learned.active, races: learned.races, roles: learned.roles, overall: learned.overall, racerHistory: buildRacerHistoryStats(learned._history, hd) } });
    }
    if (path === "/api/scenario-performance") return reply({ ok: true, comparison: await scenarioPerformance(env, url.searchParams.get("period") || "today") });
    if (path === "/api/performance-stats") return reply({ ok: true, performance: await performanceOverview(env) });
    if (path === "/api/results") {
      const { hd } = parameters(url);
      const receipts = await notificationReceipts(env, hd);
      const rows = await env.DB.prepare("SELECT p.race_key,p.venue,p.jcd,p.rno,p.confidence,p.decision,p.prediction_json,l.result_json FROM predictions p LEFT JOIN learning_races l ON p.race_key=l.race_key WHERE p.race_date=? ORDER BY p.jcd,p.rno").bind(hd).all();
      return reply({ ok: true, date: hd, results: (rows.results || []).map((r) => {
        const p = parseJsonSafe(r.prediction_json, {}), result = parseJsonSafe(r.result_json, p.result);
        return { notifications: receipts(r.race_key), raceKey: r.race_key, venue: r.venue, jcd: r.jcd, rno: r.rno, confidence: r.confidence, decision: r.decision, outcome: savedResultView(p, result, env), result: result?.finished ? resultCheckFromStoredResult(p, result) : null };
      }) });
    }
    if (path === "/api/jobs") return reply({ ok: true, jobs: (await env.DB.prepare("SELECT job,started_at,finished_at,status,summary_json FROM rebuild_jobs ORDER BY job").all()).results || [] });
    if (path === "/api/jobs/run") {
      const body = await readBody(request);
      return reply({ ok: true, ...await runJob(env, body.job) });
    }
    if (path === "/api/push/public-key") {
      const vapid = await ensureWebPushVapid(env);
      return reply({ ok: true, publicKey: vapid.public_key });
    }
    if (path === "/api/push/subscribe") {
      await saveWebPushSubscription(env, await readBody(request));
      return reply({ ok: true, subscribed: true });
    }
    if (path === "/api/push/unsubscribe") {
      const body = await readBody(request);
      await disableWebPushSubscription(env, body.endpoint);
      return reply({ ok: true });
    }
    if (path === "/api/push-latest") {
      await ensureWebPushTables(env);
      const e = await env.DB.prepare("SELECT * FROM web_push_events WHERE status='SENT' ORDER BY updated_at DESC LIMIT 1").first();
      return reply({ ok: true, event: e ? { eventKey: e.event_key, title: e.title, body: e.body, targetUrl: e.target_url, updatedAt: e.updated_at } : null });
    }
    return reply({ ok: false, error: "API\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" }, 404);
  } catch (error) {
    console.error("USA_REBUILD", path, error);
    return reply({ ok: false, error: error?.message || String(error) }, error.status || 502);
  }
}
__name(fetchHandler, "fetchHandler");
var index_default = { fetch: fetchHandler, scheduled(event, env, ctx) {
  const job = cronJobs[event.cron];
  if (job) ctx.waitUntil(runJob(env, job));
  if (job === "learning") ctx.waitUntil(runJob(env, "scenarioLearning"));
} };
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
