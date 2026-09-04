const OFFICIAL = "https://www.boatrace.jp";
const WORKER_VERSION = "6.4.0";
const AI_VERSION = "6.6.12";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function getBearerToken(request) {
  const auth = request.headers.get("authorization") || "";

  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  return "";
}

function checkPrivateAccess(request, env) {
  if (!env.D1_WRITE_TOKEN) {
    return json({
      ok: false,
      error: "D1_WRITE_TOKEN が設定されていません"
    }, 503);
  }

  const token = getBearerToken(request);

  if (!token || token !== env.D1_WRITE_TOKEN) {
    return json({
      ok: false,
      error: "認証に失敗しました"
    }, 401);
  }

  return null;
}

function decodeHtml(text = "") {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&yen;/gi, "¥")
    .replace(/&#165;/gi, "¥")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(html = "") {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:p|div|tr|li|td|th|a|span)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function officialFetch(path) {
  const response = await fetch(OFFICIAL + path, {
    headers: {
      "user-agent":
        `Mozilla/5.0 (compatible; BoatRacingAI/${WORKER_VERSION})`,
      "accept": "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(
      `BOAT RACE取得エラー HTTP ${response.status}`
    );
  }

  return response.text();
}

function todayJST() {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .format(new Date())
    .replaceAll("/", "");
}

function nowJST() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  })
    .format(new Date())
    .replace(" ", "T") + "+09:00";
}

function deadlineIsoJST(hd, time) {
  if (!/^\d{8}$/.test(String(hd || ""))) {
    return null;
  }

  if (!/^\d{1,2}:\d{2}$/.test(String(time || ""))) {
    return null;
  }

  const yyyy = hd.slice(0, 4);
  const mm = hd.slice(4, 6);
  const dd = hd.slice(6, 8);
  const [h, m] = time.split(":");

  return (
    `${yyyy}-${mm}-${dd}` +
    `T${String(h).padStart(2, "0")}:${m}:00+09:00`
  );
}

const VENUE_NAMES = {
  "01":"桐生",
  "02":"戸田",
  "03":"江戸川",
  "04":"平和島",
  "05":"多摩川",
  "06":"浜名湖",
  "07":"蒲郡",
  "08":"常滑",
  "09":"津",
  "10":"三国",
  "11":"びわこ",
  "12":"住之江",
  "13":"尼崎",
  "14":"鳴門",
  "15":"丸亀",
  "16":"児島",
  "17":"宮島",
  "18":"徳山",
  "19":"下関",
  "20":"若松",
  "21":"芦屋",
  "22":"福岡",
  "23":"唐津",
  "24":"大村"
};

const PREF =
  "(?:北海道|青森|岩手|宮城|秋田|山形|福島|" +
  "茨城|栃木|群馬|埼玉|千葉|東京|神奈川|" +
  "新潟|富山|石川|福井|山梨|長野|岐阜|" +
  "静岡|愛知|三重|滋賀|京都|大阪|兵庫|" +
  "奈良|和歌山|鳥取|島根|岡山|広島|山口|" +
  "徳島|香川|愛媛|高知|福岡|佐賀|長崎|" +
  "熊本|大分|宮崎|鹿児島|沖縄)";

function value(v) {
  if (
    v === undefined ||
    v === null ||
    v === "-"
  ) {
    return null;
  }

  const n = Number(v);

  return Number.isFinite(n) ? n : null;
}

function safeNumber(v) {
  if (
    v === null ||
    v === undefined ||
    v === ""
  ) {
    return null;
  }

  const n = Number(v);

  return Number.isFinite(n) ? n : null;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function norm(v, low, high) {
  return high <= low
    ? .5
    : clamp((v - low) / (high - low), 0, 1);
}

function clampLimit(v, fallback = 50) {
  const n = Number(v);

  if (!Number.isInteger(n)) {
    return fallback;
  }

  return Math.min(Math.max(n, 1), 200);
}

function toJsonText(v) {
  if (v === undefined || v === null) {
    return null;
  }

  return typeof v === "string"
    ? v
    : JSON.stringify(v);
}

function parseJsonSafe(text, fallback = null) {
  if (
    text === null ||
    text === undefined ||
    text === ""
  ) {
    return fallback;
  }

  if (typeof text !== "string") {
    return text;
  }

  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function makeRaceKey(raceDate, jcd, rno) {
  return (
    `${String(raceDate)}-` +
    `${String(jcd).padStart(2, "0")}-` +
    `${Number(rno)}`
  );
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    throw new Error(
      "JSON形式のデータを送信してください"
    );
  }
}

/* =========================
   開催場
========================= */

async function venues(hd) {
  const html = await officialFetch(
    `/owpc/pc/race/index?hd=${hd}`
  );

  const found = [
    ...html.matchAll(/[?&]jcd=(\d{2})/g)
  ].map(m => m[1]);

  return [...new Set(found)]
    .filter(jcd => VENUE_NAMES[jcd])
    .map(jcd => ({
      jcd,
      name: VENUE_NAMES[jcd]
    }));
}

/* =========================
   締切予定時刻
========================= */

function parseRaceDeadlines(html) {
  const deadlines = new Map();
  const text = stripHtml(html);

  const re =
    /(?:^|\s)(1[0-2]|[1-9])R\s+([0-2]?\d:[0-5]\d)(?=\s|$)/g;

  let match;

  while ((match = re.exec(text)) !== null) {
    const rno = Number(match[1]);
    const time = match[2].padStart(5, "0");

    if (!deadlines.has(rno)) {
      deadlines.set(rno, time);
    }
  }

  if (deadlines.size < 12) {
    const rows = [
      ...html.matchAll(
        /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
      )
    ];

    for (const rowMatch of rows) {
      const rowText = stripHtml(rowMatch[1]);

      const row = rowText.match(
        /(?:^|\s)(1[0-2]|[1-9])R\s+([0-2]?\d:[0-5]\d)(?=\s|$)/
      );

      if (!row) {
        continue;
      }

      const rno = Number(row[1]);
      const time = row[2].padStart(5, "0");

      if (!deadlines.has(rno)) {
        deadlines.set(rno, time);
      }
    }
  }

  return deadlines;
}

/* =========================
   レース一覧
========================= */

async function venueData(hd, jcd) {
  const html = await officialFetch(
    `/owpc/pc/race/raceindex?hd=${hd}&jcd=${jcd}`
  );

  const text = stripHtml(html);
  const deadlines = parseRaceDeadlines(html);
  const races = [];

  for (let rno = 1; rno <= 12; rno++) {
    const re = new RegExp(
      `(?:^|\\s)${rno}R(?:\\s|$)`,
      "i"
    );

    if (
      re.test(text) ||
      html.includes(`rno=${rno}`)
    ) {
      const deadline =
        deadlines.get(rno) || null;

      races.push({
        rno,
        status: "出走情報あり",
        deadline,
        deadlineJST:
          deadline
            ? deadlineIsoJST(hd, deadline)
            : null
      });
    }
  }

  return {
    hd,
    jcd,
    venue:
      VENUE_NAMES[jcd] || jcd,
    races
  };
}

/* =========================
   選手情報
========================= */

function parseRacers(html) {
  const text = stripHtml(html);
  const racers = [];

  const num =
    "(\\d+(?:\\.\\d+)?|-)";

  const pattern =
    "(\\d{4})\\s*\\/\\s*" +
    "(A1|A2|B1|B2)\\s+" +
    "(.+?)\\s+" +
    `(${PREF}\\/${PREF})\\s+` +
    "(\\d{1,2})歳\\s*\\/\\s*" +
    "(\\d+(?:\\.\\d+)?)kg\\s+" +
    "F(\\d+)\\s+" +
    "L(\\d+)\\s+" +
    num + "\\s+" +
    num + "\\s+" +
    num + "\\s+" +
    num + "\\s+" +
    num + "\\s+" +
    num + "\\s+" +
    num + "\\s+" +
    "(\\d+)\\s+" +
    num + "\\s+" +
    num + "\\s+" +
    "(\\d+)\\s+" +
    num + "\\s+" +
    num;

  const regex =
    new RegExp(pattern, "g");

  let match;

  while (
    (match = regex.exec(text)) !== null &&
    racers.length < 6
  ) {
    racers.push({
      lane: racers.length + 1,
      registration: match[1],
      class: match[2],

      name:
        match[3]
          .replace(/\s+/g, " ")
          .trim(),

      branchOrigin: match[4],
      age: value(match[5]),
      weight: value(match[6]),
      fCount: value(match[7]),
      lCount: value(match[8]),
      avgST: value(match[9]),

      national: {
        winRate: value(match[10]),
        secondRate: value(match[11]),
        thirdRate: value(match[12])
      },

      local: {
        winRate: value(match[13]),
        secondRate: value(match[14]),
        thirdRate: value(match[15])
      },

      motor: {
        number: value(match[16]),
        secondRate: value(match[17]),
        thirdRate: value(match[18])
      },

      boat: {
        number: value(match[19]),
        secondRate: value(match[20]),
        thirdRate: value(match[21])
      }
    });
  }

  return racers;
}

async function raceData(hd, jcd, rno) {
  const html = await officialFetch(
    `/owpc/pc/race/racelist?hd=${hd}&jcd=${jcd}&rno=${rno}`
  );

  return {
    hd,
    jcd,
    venue:
      VENUE_NAMES[jcd] || jcd,
    rno: Number(rno),
    racers: parseRacers(html)
  };
}

/* =========================
   直前情報
========================= */

function parseBeforeInfo(html) {
  const text = stripHtml(html);
  const racers = [];

  const racerRegex =
    /(?:^|\s)([1-6])\s+(.+?)\s+(\d+(?:\.\d+)?)kg\s+(\d+\.\d{2})\s+(-?\d+\.\d)/g;

  let match;

  while (
    (match = racerRegex.exec(text)) !== null &&
    racers.length < 6
  ) {
    const lane =
      Number(match[1]);

    if (
      !racers.some(
        r => r.lane === lane
      )
    ) {
      racers.push({
        lane,

        name:
          match[2]
            .replace(/\s+/g, " ")
            .trim(),

        weight:
          value(match[3]),

        exhibitionTime:
          value(match[4]),

        tilt:
          value(match[5]),

        course:
          null,

        exhibitionST:
          null
      });
    }
  }

  const startIndex =
    text.indexOf("スタート展示");

  const weatherIndex =
    text.indexOf("水面気象情報");

  const startText =
    startIndex >= 0
      ? (
          weatherIndex > startIndex
            ? text.slice(
                startIndex,
                weatherIndex
              )
            : text.slice(startIndex)
        )
      : "";

  const startRegex =
    /(?:^|\s)([1-6])\s+\.([0-9]{2})(?=\s|$)/g;

  const starts = [];

  while (
    (match = startRegex.exec(startText)) !== null &&
    starts.length < 6
  ) {
    starts.push({
      course:
        Number(match[1]),

      exhibitionST:
        Number(
          `0.${match[2]}`
        )
    });
  }

  racers.forEach(
    (racer, index) => {
      const start =
        starts[index];

      if (start) {
        racer.course =
          start.course;

        racer.exhibitionST =
          start.exhibitionST;
      }
    }
  );

  const temp =
    text.match(
      /気温\s*(\d+(?:\.\d+)?)℃/
    );

  const wind =
    text.match(
      /風速\s*(\d+(?:\.\d+)?)m/
    );

  const water =
    text.match(
      /水温\s*(\d+(?:\.\d+)?)℃/
    );

  const wave =
    text.match(
      /波高\s*(\d+(?:\.\d+)?)cm/
    );

  return {
    racers,

    weather: {
      temperature:
        temp
          ? Number(temp[1])
          : null,

      windSpeed:
        wind
          ? Number(wind[1])
          : null,

      waterTemperature:
        water
          ? Number(water[1])
          : null,

      waveHeight:
        wave
          ? Number(wave[1])
          : null
    }
  };
}

async function beforeData(
  hd,
  jcd,
  rno
) {
  const html = await officialFetch(
    `/owpc/pc/race/beforeinfo?hd=${hd}&jcd=${jcd}&rno=${rno}`
  );

  return {
    hd,
    jcd,
    venue:
      VENUE_NAMES[jcd] || jcd,
    rno: Number(rno),
    ...parseBeforeInfo(html)
  };
} /* =========================
   3連単オッズ
========================= */

function cellText(html) {
  return stripHtml(html)
    .replace(/倍$/g, "")
    .trim();
}

function expandTable(tableHtml) {
  const rowMatches = [
    ...tableHtml.matchAll(
      /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
    )
  ];

  const pending = {};
  const grid = [];

  for (const rowMatch of rowMatches) {
    const cells = [
      ...rowMatch[1].matchAll(
        /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi
      )
    ];

    const row = [];
    let col = 0;

    function usePending() {
      while (pending[col]) {
        row[col] =
          pending[col].value;

        pending[col].remaining--;

        if (
          pending[col].remaining <= 0
        ) {
          delete pending[col];
        }

        col++;
      }
    }

    usePending();

    for (const cell of cells) {
      usePending();

      const attrs =
        cell[2] || "";

      const text =
        cellText(cell[3]);

      const rowspanMatch =
        attrs.match(
          /rowspan\s*=\s*["']?(\d+)/i
        );

      const colspanMatch =
        attrs.match(
          /colspan\s*=\s*["']?(\d+)/i
        );

      const rowspan =
        rowspanMatch
          ? Number(rowspanMatch[1])
          : 1;

      const colspan =
        colspanMatch
          ? Number(colspanMatch[1])
          : 1;

      for (
        let i = 0;
        i < colspan;
        i++
      ) {
        row[col] = text;

        if (rowspan > 1) {
          pending[col] = {
            value: text,
            remaining:
              rowspan - 1
          };
        }

        col++;
      }
    }

    usePending();

    grid.push(row);
  }

  return grid;
}

function isBoatNumber(v) {
  return /^[1-6]$/.test(
    String(v || "").trim()
  );
}

function parseOdd(v) {
  const text =
    String(v || "")
      .replace(/,/g, "")
      .trim();

  if (
    !text ||
    text === "-" ||
    text === "欠場"
  ) {
    return null;
  }

  const n =
    Number(text);

  return Number.isFinite(n)
    ? n
    : null;
}

function parseOdds(html) {
  const tables = [
    ...html.matchAll(
      /<table\b[^>]*>([\s\S]*?)<\/table>/gi
    )
  ];

  const map =
    new Map();

  for (const table of tables) {
    const grid =
      expandTable(table[0]);

    for (const row of grid) {
      for (
        let first = 1;
        first <= 6;
        first++
      ) {
        const base =
          (first - 1) * 3;

        const second =
          row[base];

        const third =
          row[base + 1];

        const odd =
          parseOdd(
            row[base + 2]
          );

        if (
          !isBoatNumber(second) ||
          !isBoatNumber(third) ||
          odd === null
        ) {
          continue;
        }

        const secondNum =
          Number(second);

        const thirdNum =
          Number(third);

        if (
          first === secondNum ||
          first === thirdNum ||
          secondNum === thirdNum
        ) {
          continue;
        }

        const combination =
          `${first}-${secondNum}-${thirdNum}`;

        map.set(
          combination,
          {
            combination,
            first,
            second:
              secondNum,
            third:
              thirdNum,
            odds:
              odd
          }
        );
      }
    }
  }

  return [
    ...map.values()
  ];
}

async function oddsData(
  hd,
  jcd,
  rno
) {
  const html =
    await officialFetch(
      `/owpc/pc/race/odds3t?hd=${hd}&jcd=${jcd}&rno=${rno}`
    );

  const odds =
    parseOdds(html);

  return {
    hd,
    jcd,

    venue:
      VENUE_NAMES[jcd] ||
      jcd,

    rno:
      Number(rno),

    type:
      "3連単",

    count:
      odds.length,

    odds
  };
}

/* =========================
   結果取得
========================= */

function parsePayout(text) {
  if (!text) {
    return null;
  }

  const cleaned =
    decodeHtml(text)
      .replace(/[¥￥円]/g, "")
      .replace(/,/g, "")
      .replace(/\s+/g, "")
      .trim();

  const match =
    cleaned.match(
      /(\d+)/
    );

  if (!match) {
    return null;
  }

  const n =
    Number(match[1]);

  return Number.isFinite(n)
    ? n
    : null;
}

function normalizeCombination(text) {
  if (!text) {
    return null;
  }

  const match =
    stripHtml(text)
      .match(
        /([1-6])\s*[-－]\s*([1-6])\s*[-－]\s*([1-6])/
      );

  if (!match) {
    return null;
  }

  return (
    `${match[1]}-` +
    `${match[2]}-` +
    `${match[3]}`
  );
}

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
    ]
      .map(
        cell =>
          stripHtml(cell[1])
      )
      .filter(Boolean);

    if (!cells.length) {
      continue;
    }

    const rowText =
      cells.join(" ");

    if (
      !rowText.includes("3連単")
    ) {
      continue;
    }

    const combination =
      normalizeCombination(
        rowText
      );

    let payout = null;

    if (combination) {
      const comboPosition =
        rowText.indexOf(
          combination
        );

      const afterCombo =
        comboPosition >= 0
          ? rowText.slice(
              comboPosition +
              combination.length
            )
          : rowText;

      const yenMatch =
        decodeHtml(afterCombo)
          .match(
            /(?:¥|￥)\s*([\d,]+)|([\d,]+)\s*円/
          );

      if (yenMatch) {
        payout =
          parsePayout(
            yenMatch[1] ||
            yenMatch[2]
          );
      }

      if (payout === null) {
        const comboCellIndex =
          cells.findIndex(
            cell =>
              normalizeCombination(
                cell
              ) === combination
          );

        if (
          comboCellIndex >= 0 &&
          cells[
            comboCellIndex + 1
          ]
        ) {
          payout =
            parsePayout(
              cells[
                comboCellIndex + 1
              ]
            );
        }
      }
    }

    if (
      combination &&
      payout !== null
    ) {
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

function parseOrder(html) {
  const text =
    stripHtml(html);

  const startInfoIndex =
    text.indexOf(
      "スタート情報"
    );

  const resultSection =
    startInfoIndex >= 0
      ? text.slice(
          0,
          startInfoIndex
        )
      : text;

  const order = [];

  const first =
    resultSection.match(
      /(?:^|\s)(?:１|1)\s+([1-6])\s+\d{4}\s+/
    );

  const second =
    resultSection.match(
      /(?:^|\s)(?:２|2)\s+([1-6])\s+\d{4}\s+/
    );

  const third =
    resultSection.match(
      /(?:^|\s)(?:３|3)\s+([1-6])\s+\d{4}\s+/
    );

  if (first) {
    order.push(
      Number(first[1])
    );
  }

  if (second) {
    order.push(
      Number(second[1])
    );
  }

  if (third) {
    order.push(
      Number(third[1])
    );
  }

  return order;
}

function parseResult(html) {
  const text =
    stripHtml(html);

  const trifecta =
    parseTrifectaResult(html);

  let order =
    parseOrder(html);

  if (
    order.length < 3 &&
    trifecta.combination
  ) {
    order =
      trifecta.combination
        .split("-")
        .map(Number);
  }

  const methodMatch =
    text.match(
      /決まり手\s*(逃げ|差し|まくり差し|まくり|抜き|恵まれ)/
    );

  const finished =
    Boolean(
      trifecta.combination &&
      trifecta.payout !== null
    );

  return {
    finished,

    combination:
      finished
        ? trifecta.combination
        : null,

    payout:
      finished
        ? trifecta.payout
        : null,

    winningLanes:
      finished
        ? order.slice(0, 3)
        : [],

    method:
      methodMatch
        ? methodMatch[1]
        : null
  };
}

async function resultData(
  hd,
  jcd,
  rno
) {
  const html =
    await officialFetch(
      `/owpc/pc/race/raceresult?hd=${hd}&jcd=${jcd}&rno=${rno}`
    );

  return {
    hd,
    jcd,

    venue:
      VENUE_NAMES[jcd] ||
      jcd,

    rno:
      Number(rno),

    ...parseResult(html)
  };
}

/* =========================
   D1 予想保存
========================= */

async function savePrediction(
  env,
  body
) {
  const raceDate =
    String(
      body.race_date ||
      body.hd ||
      ""
    );

  const jcd =
    String(
      body.jcd ||
      ""
    ).padStart(2, "0");

  const rno =
    Number(body.rno);

  if (
    !/^\d{8}$/.test(
      raceDate
    )
  ) {
    throw new Error(
      "race_date または hd が必要です"
    );
  }

  if (
    !/^\d{2}$/.test(jcd)
  ) {
    throw new Error(
      "jcd が必要です"
    );
  }

  if (
    !Number.isInteger(rno) ||
    rno < 1 ||
    rno > 12
  ) {
    throw new Error(
      "rno は1〜12で指定してください"
    );
  }

  const raceKey =
    body.race_key ||
    makeRaceKey(
      raceDate,
      jcd,
      rno
    );

  const venue =
    body.venue ||
    VENUE_NAMES[jcd] ||
    jcd;

  const analyzedAt =
    body.analyzed_at ||
    nowJST();

  const stableScore =
    body.stable_score ===
      undefined ||
    body.stable_score ===
      null
      ? null
      : Number(
          body.stable_score
        );

  const posted =
    body.posted
      ? 1
      : 0;

  await env.DB
    .prepare(`
      INSERT INTO predictions (
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
        note_title,
        note_body,
        posted,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      )
      ON CONFLICT(race_key)
      DO UPDATE SET
        race_date=excluded.race_date,
        jcd=excluded.jcd,
        venue=excluded.venue,
        rno=excluded.rno,
        deadline=excluded.deadline,
        deadline_jst=excluded.deadline_jst,
        analyzed_at=excluded.analyzed_at,
        confidence=excluded.confidence,
        decision=excluded.decision,
        stable_score=excluded.stable_score,
        strategy=excluded.strategy,
        prediction_json=excluded.prediction_json,
        note_title=excluded.note_title,
        note_body=excluded.note_body,
        posted=excluded.posted,
        updated_at=CURRENT_TIMESTAMP
    `)
    .bind(
      raceKey,
      raceDate,
      jcd,
      venue,
      rno,

      body.deadline ||
      null,

      body.deadline_jst ||
      body.deadlineJST ||
      null,

      analyzedAt,

      body.confidence ||
      null,

      body.decision ||
      null,

      Number.isFinite(
        stableScore
      )
        ? stableScore
        : null,

      body.strategy ||
      null,

      toJsonText(
        body.prediction_json ||
        body.prediction ||
        body.snapshot
      ),

      body.note_title ||
      null,

      body.note_body ||
      null,

      posted
    )
    .run();

  return {
    race_key:
      raceKey,

    saved:
      true
  };
}

/* =========================
   D1 学習保存
========================= */

async function saveLearningRace(
  env,
  body
) {
  const raceDate =
    String(
      body.race_date ||
      body.hd ||
      ""
    );

  const jcd =
    String(
      body.jcd ||
      ""
    ).padStart(2, "0");

  const rno =
    Number(body.rno);

  if (
    !/^\d{8}$/.test(
      raceDate
    )
  ) {
    throw new Error(
      "race_date または hd が必要です"
    );
  }

  if (
    !/^\d{2}$/.test(jcd)
  ) {
    throw new Error(
      "jcd が必要です"
    );
  }

  if (
    !Number.isInteger(rno) ||
    rno < 1 ||
    rno > 12
  ) {
    throw new Error(
      "rno は1〜12で指定してください"
    );
  }

  const raceKey =
    body.race_key ||
    makeRaceKey(
      raceDate,
      jcd,
      rno
    );

  const venue =
    body.venue ||
    VENUE_NAMES[jcd] ||
    jcd;

  const finished =
    body.finished
      ? 1
      : 0;

  const historicalImport =
    body.historical_import ||
    body.historicalImport
      ? 1
      : 0;

  await env.DB
    .prepare(`
      INSERT INTO learning_races (
        race_key,
        race_date,
        jcd,
        venue,
        rno,
        race_data_json,
        before_data_json,
        odds_data_json,
        result_json,
        finished,
        historical_import,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      )
      ON CONFLICT(race_key)
      DO UPDATE SET
        race_date=excluded.race_date,
        jcd=excluded.jcd,
        venue=excluded.venue,
        rno=excluded.rno,
        race_data_json=excluded.race_data_json,
        before_data_json=excluded.before_data_json,
        odds_data_json=excluded.odds_data_json,
        result_json=excluded.result_json,
        finished=excluded.finished,
        historical_import=excluded.historical_import,
        updated_at=CURRENT_TIMESTAMP
    `)
    .bind(
      raceKey,
      raceDate,
      jcd,
      venue,
      rno,

      toJsonText(
        body.race_data_json ||
        body.raceData ||
        body.race
      ),

      toJsonText(
        body.before_data_json ||
        body.beforeData ||
        body.before
      ),

      toJsonText(
        body.odds_data_json ||
        body.oddsData ||
        body.odds
      ),

      toJsonText(
        body.result_json ||
        body.resultData ||
        body.result
      ),

      finished,
      historicalImport
    )
    .run();

  return {
    race_key:
      raceKey,

    saved:
      true
  };
}

/* =========================
   D1 読み取り
========================= */

async function storageStats(env) {
  const predictions =
    await env.DB
      .prepare(
        "SELECT COUNT(*) AS count FROM predictions"
      )
      .first();

  const learning =
    await env.DB
      .prepare(
        "SELECT COUNT(*) AS count FROM learning_races"
      )
      .first();

  const finished =
    await env.DB
      .prepare(
        "SELECT COUNT(*) AS count FROM learning_races WHERE finished=1"
      )
      .first();

  return {
    predictions:
      Number(
        predictions?.count ||
        0
      ),

    learningRaces:
      Number(
        learning?.count ||
        0
      ),

    finishedLearningRaces:
      Number(
        finished?.count ||
        0
      )
  };
}

async function listPredictions(
  env,
  limit = 50
) {
  const result =
    await env.DB
      .prepare(`
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
          note_title,
          posted,
          created_at,
          updated_at
        FROM predictions
        ORDER BY race_date DESC,rno DESC
        LIMIT ?
      `)
      .bind(limit)
      .all();

  return (
    result.results ||
    []
  );
}

async function listLearning(
  env,
  limit = 50
) {
  const result =
    await env.DB
      .prepare(`
        SELECT
          race_key,
          race_date,
          jcd,
          venue,
          rno,
          finished,
          historical_import,
          created_at,
          updated_at
        FROM learning_races
        ORDER BY race_date DESC,rno DESC
        LIMIT ?
      `)
      .bind(limit)
      .all();

  return (
    result.results ||
    []
  );
} /* =========================
   V6.6.12 AI
========================= */

const COMPONENT_NAMES = {
  lane:"枠・コース基本力",
  class:"級別",
  national:"全国勝率",
  local:"当地勝率",
  st:"平均ST",
  motor:"モーター",
  exhibition:"展示タイム",
  exhibitionST:"展示ST",
  course:"展示コース"
};

const ROLE_WEIGHTS = {
  first:{
    lane:1.25,
    class:.90,
    national:1.15,
    local:.75,
    st:1.25,
    motor:.70,
    exhibition:.80,
    exhibitionST:.90,
    course:1.15
  },

  second:{
    lane:.75,
    class:.85,
    national:.90,
    local:1.05,
    st:.85,
    motor:1.15,
    exhibition:1.15,
    exhibitionST:1,
    course:.75
  },

  third:{
    lane:.38,
    class:.65,
    national:.78,
    local:1.08,
    st:.68,
    motor:1.32,
    exhibition:1.22,
    exhibitionST:.98,
    course:.46
  }
};

function mergeBefore(
  racers,
  beforeData
) {
  return racers.map(
    racer => {
      const live =
        beforeData?.racers
          ?.find(
            x =>
              Number(x.lane) ===
              Number(racer.lane)
          );

      return {
        ...racer,

        before:{
          course:
            live?.course ?? null,

          exhibitionTime:
            live?.exhibitionTime ?? null,

          exhibitionST:
            live?.exhibitionST ?? null,

          tilt:
            live?.tilt ?? null
        }
      };
    }
  );
}

function scoreComponents(
  racer,
  allRacers
) {
  const c = {
    lane:0,
    class:0,
    national:0,
    local:0,
    st:0,
    motor:0,
    exhibition:0,
    exhibitionST:0,
    course:0
  };

  c.lane =
    ({
      1:25,
      2:19,
      3:16,
      4:13,
      5:8,
      6:5
    })[racer.lane] || 0;

  c.class =
    ({
      A1:15,
      A2:12,
      B1:7,
      B2:3
    })[racer.class] || 0;

  const national =
    safeNumber(
      racer.national?.winRate
    );

  if (
    national !== null
  ) {
    c.national =
      Math.min(
        18,
        national * 2.25
      );
  }

  const local =
    safeNumber(
      racer.local?.winRate
    );

  if (
    local !== null
  ) {
    c.local =
      Math.min(
        10,
        local * 1.25
      );
  }

  const avgST =
    safeNumber(
      racer.avgST
    );

  if (
    avgST !== null
  ) {
    c.st =
      avgST <= .12
        ? 8
        : avgST <= .14
          ? 7
          : avgST <= .16
            ? 5
            : avgST <= .18
              ? 3
              : 1;
  }

  const motor =
    safeNumber(
      racer.motor?.secondRate
    );

  if (
    motor !== null
  ) {
    c.motor =
      Math.min(
        10,
        motor / 5
      );
  }

  const times =
    allRacers
      .map(
        r =>
          safeNumber(
            r.before?.exhibitionTime
          )
      )
      .filter(
        x =>
          x !== null
      );

  const ex =
    safeNumber(
      racer.before?.exhibitionTime
    );

  if (
    ex !== null &&
    times.length
  ) {
    const diff =
      ex -
      Math.min(...times);

    c.exhibition =
      diff <= .01
        ? 8
        : diff <= .03
          ? 7
          : diff <= .05
            ? 5
            : diff <= .08
              ? 3
              : 1;
  }

  const exst =
    safeNumber(
      racer.before?.exhibitionST
    );

  if (
    exst !== null
  ) {
    c.exhibitionST =
      exst <= .05
        ? 4
        : exst <= .10
          ? 3
          : exst <= .15
            ? 2
            : 1;
  }

  const course =
    safeNumber(
      racer.before?.course
    );

  if (
    course === 1
  ) {
    c.course = 2;

  } else if (
    course !== null &&
    course <= 3
  ) {
    c.course = 1;
  }

  return c;
}

function blankWeights() {
  return Object.fromEntries(
    Object.keys(
      COMPONENT_NAMES
    )
    .map(
      k => [k, 1]
    )
  );
}

async function getTrainableHistoryFromD1(
  env,
  asOfDate = null
) {
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
    sql +=
      ` AND race_date < ?`;

    binds.push(
      String(asOfDate)
    );
  }

  sql +=
    ` ORDER BY race_date ASC, race_key ASC`;

  let stmt =
    env.DB.prepare(sql);

  if (
    binds.length
  ) {
    stmt =
      stmt.bind(
        ...binds
      );
  }

  const result =
    await stmt.all();

  const items = [];

  for (
    const row of
    result.results || []
  ) {
    const item =
      parseJsonSafe(
        row.race_data_json,
        {}
      ) || {};

    const separateResult =
      parseJsonSafe(
        row.result_json,
        null
      );

    if (
      !item.result &&
      separateResult
    ) {
      item.result =
        separateResult;
    }

    if (
      !item.date
    ) {
      item.date =
        row.race_date;
    }

    if (
      item.result?.finished &&
      Array.isArray(
        item.racersDetailed
      ) &&
      item.racersDetailed.length === 6 &&
      Array.isArray(
        item.result.winningLanes
      ) &&
      item.result.winningLanes.length >= 3
    ) {
      items.push(item);
    }
  }

  return items;
}

async function calculateRoleLearnedWeights(
  env,
  asOfDate = null
) {
  const history =
    await getTrainableHistoryFromD1(
      env,
      asOfDate
    );

  const roles = {
    first:
      blankWeights(),

    second:
      blankWeights(),

    third:
      blankWeights()
  };

  if (
    history.length < 10
  ) {
    return {
      active:false,
      races:
        history.length,
      roles,
      overall:
        blankWeights()
    };
  }

  for (
    const role of
    [
      "first",
      "second",
      "third"
    ]
  ) {
    const idx =
      role === "first"
        ? 0
        : role === "second"
          ? 1
          : 2;

    const signals =
      Object.fromEntries(
        Object.keys(
          COMPONENT_NAMES
        )
        .map(
          k => [k, []]
        )
      );

    for (
      const item of history
    ) {
      const wins =
        item.result
          .winningLanes
          .map(Number);

      const lane =
        wins[idx];

      const actual =
        item.racersDetailed
          .find(
            r =>
              Number(r.lane) === lane
          );

      if (!actual) {
        continue;
      }

      let pool =
        item.racersDetailed;

      if (
        role === "second"
      ) {
        pool =
          pool.filter(
            r =>
              Number(r.lane) !==
              wins[0]
          );
      }

      if (
        role === "third"
      ) {
        pool =
          pool.filter(
            r =>
              Number(r.lane) !==
              wins[0]
              &&
              Number(r.lane) !==
              wins[1]
          );
      }

      for (
        const key of
        Object.keys(
          COMPONENT_NAMES
        )
      ) {
        const vals =
          pool.map(
            r =>
              Number(
                r.components?.[key] ||
                0
              )
          );

        const avg =
          vals.length
            ? vals.reduce(
                (a,b) =>
                  a + b,
                0
              ) / vals.length
            : 0;

        const win =
          Number(
            actual.components?.[key] ||
            0
          );

        if (
          avg > 0
        ) {
          signals[key].push(
            (win - avg) / avg
          );
        }
      }
    }

    for (
      const key of
      Object.keys(
        COMPONENT_NAMES
      )
    ) {
      const arr =
        signals[key];

      if (
        !arr.length
      ) {
        roles[role][key] = 1;
        continue;
      }

      const avg =
        arr.reduce(
          (a,b) =>
            a + b,
          0
        ) / arr.length;

      const rate =
        role === "third"
          ? .45
          : .35;

      const limit =
        role === "third"
          ? .22
          : .18;

      const adj =
        clamp(
          avg * rate,
          -limit,
          limit
        );

      roles[role][key] =
        Math.round(
          (1 + adj) * 1000
        ) / 1000;
    }
  }

  const overall = {};

  for (
    const key of
    Object.keys(
      COMPONENT_NAMES
    )
  ) {
    overall[key] =
      Math.round(
        (
          (
            roles.first[key] +
            roles.second[key] +
            roles.third[key]
          ) / 3
        ) * 1000
      ) / 1000;
  }

  return {
    active:true,
    races:
      history.length,
    roles,
    overall
  };
}

function roleScore(
  components,
  learned,
  role
) {
  let score = 0;

  for (
    const key of
    Object.keys(
      COMPONENT_NAMES
    )
  ) {
    score +=
      Number(
        components[key] || 0
      )
      *
      Number(
        learned[key] || 1
      )
      *
      Number(
        ROLE_WEIGHTS[role][key] || 1
      );
  }

  return Math.round(
    score * 10
  ) / 10;
}

function overallScore(
  components,
  weights
) {
  let score = 0;

  for (
    const key of
    Object.keys(
      COMPONENT_NAMES
    )
  ) {
    score +=
      Number(
        components[key] || 0
      )
      *
      Number(
        weights[key] || 1
      );
  }

  return Math.round(
    score * 10
  ) / 10;
}

function makeAllCombinations() {
  const list = [];

  for (
    let a = 1;
    a <= 6;
    a++
  ) {
    for (
      let b = 1;
      b <= 6;
      b++
    ) {
      if (
        b === a
      ) {
        continue;
      }

      for (
        let c = 1;
        c <= 6;
        c++
      ) {
        if (
          c !== a &&
          c !== b
        ) {
          list.push(
            `${a}-${b}-${c}`
          );
        }
      }
    }
  }

  return list;
}

function strength(score) {
  return Math.exp(
    score / 20
  );
}

function firstWinShare(
  lane,
  racers
) {
  const total =
    racers.reduce(
      (sum,r) =>
        sum +
        strength(
          r.firstScore
        ),
      0
    );

  const racer =
    racers.find(
      r =>
        r.lane === lane
    );

  if (
    !racer ||
    !total
  ) {
    return 0;
  }

  return (
    strength(
      racer.firstScore
    ) / total
  );
}

function componentPosition(
  value,
  values
) {
  const nums =
    values
      .map(Number)
      .filter(
        Number.isFinite
      );

  if (
    !nums.length
  ) {
    return .5;
  }

  const min =
    Math.min(...nums);

  const max =
    Math.max(...nums);

  if (
    max === min
  ) {
    return .5;
  }

  return clamp(
    (
      Number(value) -
      min
    ) /
    (
      max -
      min
    ),
    0,
    1
  );
}

function thirdConditionalScore(
  racer,
  first,
  second,
  racers
) {
  const remaining =
    racers.filter(
      r =>
        Number(r.lane) !==
        Number(first)
        &&
        Number(r.lane) !==
        Number(second)
    );

  if (
    !remaining.length
  ) {
    return racer.thirdScore;
  }

  const c =
    racer.components || {};

  const motor =
    componentPosition(
      c.motor,
      remaining.map(
        r =>
          r.components?.motor || 0
      )
    );

  const ex =
    componentPosition(
      c.exhibition,
      remaining.map(
        r =>
          r.components?.exhibition || 0
      )
    );

  const local =
    componentPosition(
      c.local,
      remaining.map(
        r =>
          r.components?.local || 0
      )
    );

  const national =
    componentPosition(
      c.national,
      remaining.map(
        r =>
          r.components?.national || 0
      )
    );

  let bonus =
    motor * 1.6 +
    ex * 1.4 +
    local * 1.0 +
    national * .6;

  if (
    Number(racer.lane) >= 4 &&
    (
      motor >= .60 ||
      ex >= .60
    )
  ) {
    bonus += .6;
  }

  return Math.round(
    (
      Number(
        racer.thirdScore || 0
      ) +
      bonus
    ) * 10
  ) / 10;
}

function trifectaProbability(
  first,
  second,
  third,
  racers
) {
  const r1 =
    racers.find(
      r =>
        r.lane === first
    );

  const r2 =
    racers.find(
      r =>
        r.lane === second
    );

  const r3 =
    racers.find(
      r =>
        r.lane === third
    );

  if (
    !r1 ||
    !r2 ||
    !r3
  ) {
    return 0;
  }

  const total1 =
    racers.reduce(
      (sum,r) =>
        sum +
        strength(
          r.firstScore
        ),
      0
    );

  const p1 =
    strength(
      r1.firstScore
    ) / total1;

  const secondCandidates =
    racers.filter(
      r =>
        r.lane !== first
    );

  const total2 =
    secondCandidates.reduce(
      (sum,r) =>
        sum +
        strength(
          r.secondScore
        ),
      0
    );

  const p2 =
    strength(
      r2.secondScore
    ) / total2;

  const thirdCandidates =
    racers.filter(
      r =>
        r.lane !== first &&
        r.lane !== second
    );

  const thirdScores =
    thirdCandidates.map(
      r => ({
        racer:r,
        score:
          thirdConditionalScore(
            r,
            first,
            second,
            racers
          )
      })
    );

  const total3 =
    thirdScores.reduce(
      (sum,x) =>
        sum +
        strength(
          x.score
        ),
      0
    );

  const actual =
    thirdScores.find(
      x =>
        x.racer.lane === third
    );

  const p3 =
    actual &&
    total3
      ? strength(
          actual.score
        ) / total3
      : 0;

  return (
    p1 *
    p2 *
    p3
  );
}

function makeOddsMap(
  oddsData
) {
  const map = {};

  for (
    const item of
    oddsData?.odds || []
  ) {
    map[item.combination] =
      Number(item.odds);
  }

  return map;
}

function evaluateBets(
  racers,
  oddsData
) {
  const oddsMap =
    makeOddsMap(
      oddsData
    );

  const combinations = [];

  for (
    const combination of
    makeAllCombinations()
  ) {
    const [
      first,
      second,
      third
    ] =
      combination
        .split("-")
        .map(Number);

    const odds =
      safeNumber(
        oddsMap[combination]
      );

    if (
      odds === null
    ) {
      continue;
    }

    const r1 =
      racers.find(
        r =>
          r.lane === first
      );

    const r2 =
      racers.find(
        r =>
          r.lane === second
      );

    const r3 =
      racers.find(
        r =>
          r.lane === third
      );

    const probability =
      trifectaProbability(
        first,
        second,
        third,
        racers
      );

    const thirdRole =
      thirdConditionalScore(
        r3,
        first,
        second,
        racers
      );

    combinations.push({
      combination,
      first,
      second,
      third,

      firstRole:
        r1.firstScore,

      secondRole:
        r2.secondScore,

      thirdRole,

      probability,
      odds,

      ev:
        probability * odds
    });
  }

  if (
    !combinations.length
  ) {
    return [];
  }

  const maxFirst =
    Math.max(
      ...combinations.map(
        x =>
          x.firstRole
      ),
      1
    );

  const maxSecond =
    Math.max(
      ...combinations.map(
        x =>
          x.secondRole
      ),
      1
    );

  const maxThird =
    Math.max(
      ...combinations.map(
        x =>
          x.thirdRole
      ),
      1
    );

  const maxProbability =
    Math.max(
      ...combinations.map(
        x =>
          x.probability
      ),
      .000001
    );

  const maxEv =
    Math.max(
      ...combinations.map(
        x =>
          Math.min(
            x.ev,
            3
          )
      ),
      .000001
    );

  for (
    const item of
    combinations
  ) {
    const firstNorm =
      item.firstRole /
      maxFirst;

    const secondNorm =
      item.secondRole /
      maxSecond;

    const thirdNorm =
      item.thirdRole /
      maxThird;

    const probabilityNorm =
      item.probability /
      maxProbability;

    const evNorm =
      Math.log1p(
        Math.min(
          item.ev,
          3
        )
      )
      /
      Math.log1p(
        maxEv
      );

    item.totalScore =
      Math.round(
        (
          firstNorm * .16 +
          secondNorm * .09 +
          thirdNorm * .10 +
          probabilityNorm * .56 +
          evNorm * .09
        ) * 1000
      ) / 10;
  }

  return combinations.sort(
    (a,b) =>
      b.totalScore -
      a.totalScore
  );
}

function getConfidence(
  racers
) {
  const ranked =
    racers
      .slice()
      .sort(
        (a,b) =>
          b.firstScore -
          a.firstScore
      );

  if (
    ranked.length < 3
  ) {
    return "B";
  }

  const gap2 =
    ranked[0].firstScore -
    ranked[1].firstScore;

  const gap3 =
    ranked[0].firstScore -
    ranked[2].firstScore;

  if (
    gap2 >= 9 &&
    gap3 >= 14
  ) {
    return "S";
  }

  if (
    gap2 >= 4.5
  ) {
    return "A";
  }

  return "B";
}

function roleStability(
  racers,
  field
) {
  const sorted =
    racers
      .slice()
      .sort(
        (a,b) =>
          b[field] -
          a[field]
      );

  if (
    sorted.length < 6
  ) {
    return 0;
  }

  const top =
    (
      sorted[0][field] +
      sorted[1][field] +
      sorted[2][field]
    ) / 3;

  const bottom =
    (
      sorted[3][field] +
      sorted[4][field] +
      sorted[5][field]
    ) / 3;

  if (
    top <= 0
  ) {
    return 0;
  }

  return clamp(
    (
      (
        top -
        bottom
      ) / top
    ) * 220,
    0,
    100
  );
}

function beforeCoverage(
  racers
) {
  let available = 0;
  let total = 0;

  for (
    const racer of racers
  ) {
    for (
      const v of [
        racer.before?.exhibitionTime,
        racer.before?.exhibitionST,
        racer.before?.course
      ]
    ) {
      total++;

      if (
        safeNumber(v) !== null
      ) {
        available++;
      }
    }
  }

  return total
    ? available / total
    : 0;
}

function makeSDecision(
  confidence,
  racers,
  allBets
) {
  if (
    confidence !== "S"
  ) {
    return {
      status:"NONE",
      label:
        `${confidence}評価`,
      score:0,
      metrics:null,
      reasons:[]
    };
  }

  const ranked =
    racers
      .slice()
      .sort(
        (a,b) =>
          b.firstScore -
          a.firstScore
      );

  const firstShare =
    firstWinShare(
      ranked[0].lane,
      racers
    );

  const firstGap =
    ranked[0].firstScore -
    ranked[1].firstScore;

  const top6Probability =
    allBets
      .slice(
        0,
        6
      )
      .reduce(
        (sum,bet) =>
          sum +
          Number(
            bet.probability || 0
          ),
        0
      );

  const secondStable =
    roleStability(
      racers,
      "secondScore"
    );

  const thirdStable =
    roleStability(
      racers,
      "thirdScore"
    );

  const coverage =
    beforeCoverage(
      racers
    );

  const quality =
    (
      norm(
        firstShare,
        .22,
        .42
      ) * .25
      +
      norm(
        top6Probability,
        .12,
        .28
      ) * .25
      +
      norm(
        firstGap,
        7,
        16
      ) * .15
      +
      clamp(
        secondStable / 100,
        0,
        1
      ) * .10
      +
      clamp(
        thirdStable / 100,
        0,
        1
      ) * .10
      +
      clamp(
        coverage,
        0,
        1
      ) * .15
    ) * 100;

  const score =
    Math.round(
      quality * 10
    ) / 10;

  const reasons = [];

  if (
    firstShare < .30
  ) {
    reasons.push(
      "1着候補の優位度が弱い"
    );
  }

  if (
    top6Probability < .18
  ) {
    reasons.push(
      "上位6点に確率が集中していない"
    );
  }

  if (
    secondStable < 35
  ) {
    reasons.push(
      "2着候補がばらけている"
    );
  }

  if (
    thirdStable < 30
  ) {
    reasons.push(
      "3着候補がばらけている"
    );
  }

  if (
    coverage < .55
  ) {
    reasons.push(
      "展示データが不足"
    );
  }

  if (
    score < 68
  ) {
    reasons.push(
      "総合安定スコアが基準未満"
    );
  }

  const battle =
    score >= 68 &&
    firstShare >= .30 &&
    top6Probability >= .18 &&
    coverage >= .55;

  return {
    status:
      battle
        ? "BET"
        : "PASS",

    label:
      battle
        ? "🔥 S勝負"
        : "⚠️ S見送り",

    score,

    metrics:{
      firstShare,
      top6Probability,
      firstGap,

      secondStability:
        secondStable,

      thirdStability:
        thirdStable,

      beforeCoverage:
        coverage
    },

    reasons:
      battle
        ? [
            "1着候補が優勢",
            "上位買い目への確率集中を確認",
            "展示データ条件をクリア"
          ]
        : reasons
  };
} function selectMainlineBets(
  allBets,
  racers,
  confidence
) {
  const firstRank =
    racers
      .slice()
      .sort(
        (a,b) =>
          b.firstScore -
          a.firstScore
      );

  const top1 =
    firstRank[0];

  const top2 =
    firstRank[1];

  const share =
    firstWinShare(
      top1.lane,
      racers
    );

  const gap =
    top1.firstScore -
    top2.firstScore;

  const secondStable =
    roleStability(
      racers,
      "secondScore"
    );

  const thirdStable =
    roleStability(
      racers,
      "thirdScore"
    );

  let type =
    "BALANCED";

  let label =
    "バランス型";

  let reason =
    "上位確率を中心に広く拾う";

  if (
    share >= .34 &&
    gap >= 10
  ) {
    type =
      "FIXED";

    label =
      "1着固定型";

    reason =
      `${top1.lane}号艇の1着優位度が高い`;

  } else if (
    secondStable >= 45 &&
    thirdStable < 35
  ) {
    type =
      "THIRD_WIDE";

    label =
      "3着広げ型";

    reason =
      "2着は比較的絞れるが3着が散っている";

  } else if (
    share < .30 ||
    gap < 6
  ) {
    type =
      "SWAP";

    label =
      "1・2着入替型";

    reason =
      "1着候補の差が小さい";
  }

  let preferred = [];

  if (
    type === "FIXED"
  ) {
    preferred =
      allBets.filter(
        b =>
          b.first ===
          top1.lane
      );

  } else if (
    type === "SWAP"
  ) {
    preferred =
      allBets.filter(
        b =>
          b.first ===
          top1.lane
          ||
          b.first ===
          top2.lane
      );

  } else if (
    type === "THIRD_WIDE"
  ) {
    const pool =
      allBets
        .filter(
          b =>
            b.first ===
            top1.lane
        )
        .slice();

    const byThird = [];

    for (
      let lane = 1;
      lane <= 6;
      lane++
    ) {
      const item =
        pool.find(
          b =>
            b.third === lane
        );

      if (item) {
        byThird.push(item);
      }
    }

    const used =
      new Set(
        byThird.map(
          item =>
            item.combination
        )
      );

    preferred = [
      ...byThird,

      ...pool.filter(
        item =>
          !used.has(
            item.combination
          )
      )
    ];

  } else {
    preferred =
      allBets.slice();
  }

  const selected = [];
  const seen =
    new Set();

  for (
    const item of preferred
  ) {
    if (
      selected.length >= 15
    ) {
      break;
    }

    if (
      !seen.has(
        item.combination
      )
    ) {
      selected.push(item);

      seen.add(
        item.combination
      );
    }
  }

  for (
    const item of allBets
  ) {
    if (
      selected.length >= 15
    ) {
      break;
    }

    if (
      !seen.has(
        item.combination
      )
    ) {
      selected.push(item);

      seen.add(
        item.combination
      );
    }
  }

  const top6 =
    selected.slice(
      0,
      6
    );

  const thirds =
    new Set(
      top6.map(
        item =>
          item.third
      )
    );

  if (
    thirds.size < 3
  ) {
    const cutoff =
      top6.length
        ? top6[
            top6.length - 1
          ].totalScore
        : 0;

    for (
      const item of
      selected.slice(6)
    ) {
      if (
        thirds.size >= 3
      ) {
        break;
      }

      if (
        thirds.has(
          item.third
        ) ||
        item.totalScore <
        cutoff * .88
      ) {
        continue;
      }

      top6[
        top6.length - 1
      ] = item;

      thirds.add(
        item.third
      );
    }
  }

  const top6Set =
    new Set(
      top6.map(
        item =>
          item.combination
      )
    );

  const reordered = [
    ...top6,

    ...selected.filter(
      item =>
        !top6Set.has(
          item.combination
        )
    )
  ].slice(
    0,
    15
  );

  return {
    type,
    label,

    reason:
      reason +
      " / 3着候補を残り4艇で再評価",

    firstShare:
      share,

    firstGap:
      gap,

    secondStability:
      secondStable,

    thirdStability:
      thirdStable,

    bets:
      reordered
  };
}

function holeTier(odds) {
  if (
    odds >= 80
  ) {
    return {
      key:"big",
      label:"💥 大穴"
    };
  }

  if (
    odds >= 40
  ) {
    return {
      key:"hole",
      label:"🔥 穴"
    };
  }

  return {
    key:"middle",
    label:"🎯 中穴"
  };
}

function selectHoleBets(
  allBets,
  mainline
) {
  const mainSet =
    new Set(
      mainline.map(
        item =>
          item.combination
      )
    );

  let candidates =
    allBets
      .map(
        (bet,index) => ({
          ...bet,
          aiRank:
            index + 1
        })
      )
      .filter(
        bet =>
          !mainSet.has(
            bet.combination
          )
          &&
          bet.odds >= 20
          &&
          bet.probability >= .003
          &&
          bet.ev >= .60
          &&
          bet.totalScore >= 30
      );

  if (
    candidates.length < 3
  ) {
    candidates =
      allBets
        .map(
          (bet,index) => ({
            ...bet,
            aiRank:
              index + 1
          })
        )
        .filter(
          bet =>
            !mainSet.has(
              bet.combination
            )
            &&
            bet.odds >= 18
            &&
            bet.probability >= .002
            &&
            bet.ev >= .45
            &&
            bet.totalScore >= 27
        );
  }

  for (
    const bet of
    candidates
  ) {
    const probabilityScore =
      norm(
        bet.probability,
        .002,
        .025
      );

    const evScore =
      norm(
        Math.min(
          bet.ev,
          2
        ),
        .45,
        1.5
      );

    const aiScore =
      norm(
        bet.totalScore,
        27,
        80
      );

    const oddsScore =
      norm(
        Math.log(
          Math.max(
            bet.odds,
            1
          )
        ),
        Math.log(18),
        Math.log(120)
      );

    const rankScore =
      1 -
      norm(
        bet.aiRank,
        16,
        80
      );

    bet.holeScore =
      Math.round(
        (
          probabilityScore * .25 +
          evScore * .30 +
          aiScore * .20 +
          oddsScore * .15 +
          rankScore * .10
        ) * 1000
      ) / 10;

    bet.tier =
      holeTier(
        bet.odds
      );
  }

  candidates.sort(
    (a,b) =>
      b.holeScore -
      a.holeScore
  );

  const selected = [];

  const tierCount = {
    middle:0,
    hole:0,
    big:0
  };

  const firstCount = {};

  for (
    const bet of
    candidates
  ) {
    if (
      selected.length >= 5
    ) {
      break;
    }

    if (
      (
        firstCount[
          bet.first
        ] || 0
      ) >= 2
    ) {
      continue;
    }

    if (
      bet.tier.key ===
      "middle"
      &&
      tierCount.middle >= 2
    ) {
      continue;
    }

    if (
      bet.tier.key ===
      "hole"
      &&
      tierCount.hole >= 2
    ) {
      continue;
    }

    if (
      bet.tier.key ===
      "big"
      &&
      tierCount.big >= 1
    ) {
      continue;
    }

    selected.push(bet);

    tierCount[
      bet.tier.key
    ]++;

    firstCount[
      bet.first
    ] =
      (
        firstCount[
          bet.first
        ] || 0
      ) + 1;
  }

  for (
    const bet of
    candidates
  ) {
    if (
      selected.length >= 3
    ) {
      break;
    }

    if (
      !selected.some(
        item =>
          item.combination ===
          bet.combination
      )
    ) {
      selected.push(bet);
    }
  }

  return selected
    .slice(
      0,
      5
    )
    .map(
      bet => ({
        combination:
          bet.combination,

        aiRank:
          bet.aiRank,

        probability:
          bet.probability,

        odds:
          bet.odds,

        ev:
          bet.ev,

        totalScore:
          bet.totalScore,

        holeScore:
          bet.holeScore,

        tier:
          bet.tier,

        first:
          bet.first,

        second:
          bet.second,

        third:
          bet.third
      })
    );
}

/* =========================
   サーバー予想生成
========================= */

async function buildServerPrediction(
  env,
  racers,
  oddsData,
  context
) {
  const learned =
    await calculateRoleLearnedWeights(
      env,
      context.date
    );

  const modelRacers =
    racers.map(
      racer => {
        const components =
          scoreComponents(
            racer,
            racers
          );

        return {
          ...racer,

          components,

          overallScore:
            overallScore(
              components,
              learned.overall
            ),

          firstScore:
            roleScore(
              components,
              learned.roles.first,
              "first"
            ),

          secondScore:
            roleScore(
              components,
              learned.roles.second,
              "second"
            ),

          thirdScore:
            roleScore(
              components,
              learned.roles.third,
              "third"
            )
        };
      }
    );

  const overallRanking =
    modelRacers
      .slice()
      .sort(
        (a,b) =>
          b.overallScore -
          a.overallScore
      );

  const confidence =
    getConfidence(
      modelRacers
    );

  const allBets =
    evaluateBets(
      modelRacers,
      oddsData
    );

  if (
    !allBets.length
  ) {
    throw new Error(
      "3連単オッズを取得できませんでした"
    );
  }

  const strategy =
    selectMainlineBets(
      allBets,
      modelRacers,
      confidence
    );

  const top15 =
    strategy.bets;

  const holeBets =
    selectHoleBets(
      allBets,
      top15
    );

  const sDecision =
    makeSDecision(
      confidence,
      modelRacers,
      allBets
    );

  const allBetRanking =
    allBets.map(
      (bet,index) => ({
        rank:
          index + 1,

        combination:
          bet.combination,

        totalScore:
          bet.totalScore,

        probability:
          bet.probability,

        odds:
          bet.odds,

        ev:
          bet.ev
      })
    );

  const snapshot = {
    id:
      `server-${context.date}-${context.jcd}-${context.rno}-${Date.now()}`,

    version:
      AI_VERSION,

    createdAt:
      new Date()
        .toISOString(),

    date:
      context.date,

    jcd:
      context.jcd,

    venue:
      context.venue,

    rno:
      Number(
        context.rno
      ),

    confidence,

    sDecision,

    strategy:{
      type:
        strategy.type,

      label:
        strategy.label,

      reason:
        strategy.reason,

      firstShare:
        strategy.firstShare,

      firstGap:
        strategy.firstGap,

      secondStability:
        strategy.secondStability,

      thirdStability:
        strategy.thirdStability
    },

    evaluatedCount:
      allBets.length,

    learningRaces:
      learned.races,

    roleLearnedWeights:
      learned.roles,

    racersDetailed:
      modelRacers.map(
        racer => ({
          lane:
            racer.lane,

          name:
            racer.name,

          class:
            racer.class,

          components:{
            ...racer.components
          },

          overallScore:
            racer.overallScore,

          firstScore:
            racer.firstScore,

          secondScore:
            racer.secondScore,

          thirdScore:
            racer.thirdScore
        })
      ),

    bets:
      top15.map(
        bet => ({
          combination:
            bet.combination,

          probability:
            bet.probability,

          odds:
            bet.odds,

          ev:
            bet.ev,

          totalScore:
            bet.totalScore,

          firstRole:
            bet.firstRole,

          secondRole:
            bet.secondRole,

          thirdRole:
            bet.thirdRole
        })
      ),

    holeBets,

    allBetRanking
  };

  return {
    learned,
    modelRacers,
    overallRanking,
    confidence,
    sDecision,
    allBets,
    top15,
    holeBets,
    strategy,
    snapshot
  };
}

/* =========================
   AIテスト
========================= */

async function autoTestData(
  env,
  hd,
  jcd,
  rno
) {
  const [
    raceResult,
    beforeResult,
    oddsResult
  ] =
    await Promise.allSettled([
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

  if (
    raceResult.status !==
    "fulfilled"
    ||
    !raceResult.value
      .racers?.length
  ) {
    throw new Error(
      "選手データを取得できませんでした"
    );
  }

  const race =
    raceResult.value;

  const before =
    beforeResult.status ===
    "fulfilled"
      ? beforeResult.value
      : {
          racers:[]
        };

  const odds =
    oddsResult.status ===
    "fulfilled"
      ? oddsResult.value
      : {
          odds:[]
        };

  if (
    !odds.odds?.length
  ) {
    throw new Error(
      "3連単オッズを取得できませんでした"
    );
  }

  const merged =
    mergeBefore(
      race.racers,
      before
    );

  const prediction =
    await buildServerPrediction(
      env,
      merged,
      odds,
      {
        date:
          hd,

        jcd,

        venue:
          race.venue ||
          VENUE_NAMES[jcd] ||
          jcd,

        rno
      }
    );

  let deadline = null;
  let deadlineJST = null;

  try {
    const venue =
      await venueData(
        hd,
        jcd
      );

    const target =
      venue.races.find(
        item =>
          Number(item.rno) ===
          Number(rno)
      );

    deadline =
      target?.deadline ||
      null;

    deadlineJST =
      target?.deadlineJST ||
      null;

  } catch {}

  return {
    workerVersion:
      WORKER_VERSION,

    aiVersion:
      AI_VERSION,

    hd,
    jcd,

    venue:
      race.venue,

    rno:
      Number(rno),

    deadline,
    deadlineJST,

    beforeAvailable:
      beforeResult.status ===
      "fulfilled"
      &&
      Boolean(
        before.racers?.length
      ),

    oddsCount:
      odds.odds?.length ||
      0,

    learning:{
      active:
        prediction.learned.active,

      races:
        prediction.learned.races,

      roles:
        prediction.learned.roles
    },

    confidence:
      prediction.confidence,

    sDecision:
      prediction.sDecision,

    strategy:
      prediction.snapshot.strategy,

    overallRanking:
      prediction.overallRanking
        .map(
          (racer,index) => ({
            rank:
              index + 1,

            lane:
              racer.lane,

            name:
              racer.name,

            overallScore:
              racer.overallScore,

            firstScore:
              racer.firstScore,

            secondScore:
              racer.secondScore,

            thirdScore:
              racer.thirdScore
          })
        ),

    main15:
      prediction.snapshot.bets,

    holeBets:
      prediction.holeBets,

    snapshot:
      prediction.snapshot
  };
}

/* =========================
   URLパラメータ
========================= */

function getRaceParams(url) {
  return {
    hd:
      url.searchParams.get(
        "hd"
      ) ||
      todayJST(),

    jcd:
      url.searchParams.get(
        "jcd"
      ),

    rno:
      Number(
        url.searchParams.get(
          "rno"
        )
      )
  };
}

function validateRace(
  jcd,
  rno
) {
  if (
    !jcd ||
    !/^\d{2}$/.test(
      jcd
    )
  ) {
    return json(
      {
        ok:false,
        error:
          "jcdが必要です"
      },
      400
    );
  }

  if (
    !Number.isInteger(rno) ||
    rno < 1 ||
    rno > 12
  ) {
    return json(
      {
        ok:false,
        error:
          "rnoは1〜12で指定してください"
      },
      400
    );
  }

  return null;
}

/* =========================
   Worker
========================= */

export default {

  async fetch(
    request,
    env
  ) {
    const url =
      new URL(
        request.url
      );

    try {

      /* ----- health ----- */

      if (
        url.pathname ===
        "/api/health"
      ) {
        return json({
          ok:true,

          version:
            WORKER_VERSION,

          aiVersion:
            AI_VERSION,

          deadlineSupport:
            true,

          d1Support:
            true,

          d1WriteSupport:
            true,

          privateApi:
            true,

          writeAuthConfigured:
            Boolean(
              env.D1_WRITE_TOKEN
            ),

          serverAi:
            true
        });
      }

      /* ----- D1 health ----- */

      if (
        url.pathname ===
        "/api/db-health"
      ) {
        if (
          !env.DB
        ) {
          return json(
            {
              ok:false,
              connected:false,
              error:
                "DB binding が見つかりません"
            },
            500
          );
        }

        const result =
          await env.DB
            .prepare(
              "SELECT 1 AS test"
            )
            .first();

        return json({
          ok:true,
          database:
            "usa-lab-ai",
          connected:true,

          authConfigured:
            Boolean(
              env.D1_WRITE_TOKEN
            ),

          result
        });
      }

      /* ----- 保存件数 ----- */

      if (
        url.pathname ===
        "/api/storage-stats"
      ) {
        return json({
          ok:true,

          ...(
            await storageStats(
              env
            )
          )
        });
      }

      /* =====================
         サーバーAIテスト
      ===================== */

      if (
        url.pathname ===
        "/api/auto-test"
      ) {
        const {
          hd,
          jcd,
          rno
        } =
          getRaceParams(url);

        const error =
          validateRace(
            jcd,
            rno
          );

        if (error) {
          return error;
        }

        return json({
          ok:true,

          ...(
            await autoTestData(
              env,
              hd,
              jcd,
              rno
            )
          )
        });
      }

      /* =====================
         予想D1
      ===================== */

      if (
        url.pathname ===
        "/api/predictions"
      ) {
        const authError =
          checkPrivateAccess(
            request,
            env
          );

        if (
          authError
        ) {
          return authError;
        }

        if (
          request.method ===
          "GET"
        ) {
          return json({
            ok:true,

            predictions:
              await listPredictions(
                env,
                clampLimit(
                  url.searchParams.get(
                    "limit"
                  )
                )
              )
          });
        }

        if (
          request.method ===
          "POST"
        ) {
          const body =
            await readBody(
              request
            );

          return json({
            ok:true,

            ...(
              await savePrediction(
                env,
                body
              )
            )
          });
        }

        return json(
          {
            ok:false,
            error:
              "Method Not Allowed"
          },
          405
        );
      }

      /* =====================
         学習D1
      ===================== */

      if (
        url.pathname ===
        "/api/learning"
      ) {
        const authError =
          checkPrivateAccess(
            request,
            env
          );

        if (
          authError
        ) {
          return authError;
        }

        if (
          request.method ===
          "GET"
        ) {
          return json({
            ok:true,

            learning:
              await listLearning(
                env,
                clampLimit(
                  url.searchParams.get(
                    "limit"
                  )
                )
              )
          });
        }

        if (
          request.method ===
          "POST"
        ) {
          const body =
            await readBody(
              request
            );

          return json({
            ok:true,

            ...(
              await saveLearningRace(
                env,
                body
              )
            )
          });
        }

        return json(
          {
            ok:false,
            error:
              "Method Not Allowed"
          },
          405
        );
      }

      /* =====================
         開催場
      ===================== */

      if (
        url.pathname ===
        "/api/venues"
      ) {
        const hd =
          url.searchParams.get(
            "hd"
          ) ||
          todayJST();

        return json({
          ok:true,
          hd,

          venues:
            await venues(hd)
        });
      }

      /* =====================
         会場レース一覧
      ===================== */

      if (
        url.pathname ===
        "/api/venue"
      ) {
        const hd =
          url.searchParams.get(
            "hd"
          ) ||
          todayJST();

        const jcd =
          url.searchParams.get(
            "jcd"
          );

        if (
          !jcd ||
          !/^\d{2}$/.test(jcd)
        ) {
          return json(
            {
              ok:false,
              error:
                "jcdが必要です"
            },
            400
          );
        }

        return json({
          ok:true,

          ...(
            await venueData(
              hd,
              jcd
            )
          )
        });
      }

      /* =====================
         選手情報
      ===================== */

      if (
        url.pathname ===
        "/api/race"
      ) {
        const {
          hd,
          jcd,
          rno
        } =
          getRaceParams(url);

        const error =
          validateRace(
            jcd,
            rno
          );

        if (error) {
          return error;
        }

        return json({
          ok:true,

          ...(
            await raceData(
              hd,
              jcd,
              rno
            )
          )
        });
      }

      /* =====================
         直前情報
      ===================== */

      if (
        url.pathname ===
        "/api/before"
      ) {
        const {
          hd,
          jcd,
          rno
        } =
          getRaceParams(url);

        const error =
          validateRace(
            jcd,
            rno
          );

        if (error) {
          return error;
        }

        return json({
          ok:true,

          ...(
            await beforeData(
              hd,
              jcd,
              rno
            )
          )
        });
      }

      /* =====================
         3連単オッズ
      ===================== */

      if (
        url.pathname ===
        "/api/odds"
      ) {
        const {
          hd,
          jcd,
          rno
        } =
          getRaceParams(url);

        const error =
          validateRace(
            jcd,
            rno
          );

        if (error) {
          return error;
        }

        return json({
          ok:true,

          ...(
            await oddsData(
              hd,
              jcd,
              rno
            )
          )
        });
      }

      /* =====================
         結果
      ===================== */

      if (
        url.pathname ===
        "/api/result"
      ) {
        const {
          hd,
          jcd,
          rno
        } =
          getRaceParams(url);

        const error =
          validateRace(
            jcd,
            rno
          );

        if (error) {
          return error;
        }

        return json({
          ok:true,

          ...(
            await resultData(
              hd,
              jcd,
              rno
            )
          )
        });
      }

      /* ----- Web画面 ----- */

      return env.ASSETS.fetch(
        request
      );

    } catch (error) {
      console.error(error);

      return json(
        {
          ok:false,

          error:
            error?.message ||
            String(error)
        },
        502
      );
    }
  }
};
