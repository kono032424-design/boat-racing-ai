const OFFICIAL = "https://www.boatrace.jp";
const WORKER_VERSION = "6.3.2";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
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
      "accept":
        "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(
      `BOAT RACE取得エラー HTTP ${response.status}`
    );
  }

  return await response.text();
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
    `T${String(h).padStart(2, "0")}` +
    `:${m}:00+09:00`
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

  return Number.isFinite(n)
    ? n
    : null;
}

function clampLimit(v, fallback = 50) {
  const n = Number(v);

  if (!Number.isInteger(n)) {
    return fallback;
  }

  return Math.min(
    Math.max(n, 1),
    200
  );
}

function toJsonText(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function makeRaceKey(
  raceDate,
  jcd,
  rno
) {
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
  const html =
    await officialFetch(
      `/owpc/pc/race/index?hd=${hd}`
    );

  const found = [
    ...html.matchAll(
      /[?&]jcd=(\d{2})/g
    )
  ].map(m => m[1]);

  const ids =
    [...new Set(found)];

  return ids
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
  const deadlines =
    new Map();

  const text =
    stripHtml(html);

  const textRegex =
    /(?:^|\s)(1[0-2]|[1-9])R\s+([0-2]?\d:[0-5]\d)(?=\s|$)/g;

  let match;

  while (
    (match = textRegex.exec(text))
      !== null
  ) {
    const rno =
      Number(match[1]);

    const time =
      match[2].padStart(5, "0");

    if (!deadlines.has(rno)) {
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
      const rowText =
        stripHtml(rowMatch[1]);

      const row =
        rowText.match(
          /(?:^|\s)(1[0-2]|[1-9])R\s+([0-2]?\d:[0-5]\d)(?=\s|$)/
        );

      if (!row) {
        continue;
      }

      const rno =
        Number(row[1]);

      const time =
        row[2].padStart(5, "0");

      if (!deadlines.has(rno)) {
        deadlines.set(
          rno,
          time
        );
      }
    }
  }

  return deadlines;
}

/* =========================
   レース一覧
========================= */

async function venueData(
  hd,
  jcd
) {
  const html =
    await officialFetch(
      `/owpc/pc/race/raceindex?hd=${hd}&jcd=${jcd}`
    );

  const text =
    stripHtml(html);

  const deadlines =
    parseRaceDeadlines(html);

  const races = [];

  for (
    let rno = 1;
    rno <= 12;
    rno++
  ) {
    const re =
      new RegExp(
        `(?:^|\\s)${rno}R(?:\\s|$)`,
        "i"
      );

    if (
      re.test(text) ||
      html.includes(`rno=${rno}`)
    ) {
      const deadline =
        deadlines.get(rno) ||
        null;

      races.push({
        rno,
        status:
          "出走情報あり",
        deadline,
        deadlineJST:
          deadline
            ? deadlineIsoJST(
                hd,
                deadline
              )
            : null
      });
    }
  }

  return {
    hd,
    jcd,
    venue:
      VENUE_NAMES[jcd] ||
      jcd,
    races
  };
}

/* =========================
   選手情報
========================= */

function parseRacers(html) {
  const text =
    stripHtml(html);

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
    new RegExp(
      pattern,
      "g"
    );

  let match;

  while (
    (match = regex.exec(text))
      !== null &&
    racers.length < 6
  ) {
    racers.push({
      lane:
        racers.length + 1,

      registration:
        match[1],

      class:
        match[2],

      name:
        match[3]
          .replace(/\s+/g, " ")
          .trim(),

      branchOrigin:
        match[4],

      age:
        value(match[5]),

      weight:
        value(match[6]),

      fCount:
        value(match[7]),

      lCount:
        value(match[8]),

      avgST:
        value(match[9]),

      national: {
        winRate:
          value(match[10]),

        secondRate:
          value(match[11]),

        thirdRate:
          value(match[12])
      },

      local: {
        winRate:
          value(match[13]),

        secondRate:
          value(match[14]),

        thirdRate:
          value(match[15])
      },

      motor: {
        number:
          value(match[16]),

        secondRate:
          value(match[17]),

        thirdRate:
          value(match[18])
      },

      boat: {
        number:
          value(match[19]),

        secondRate:
          value(match[20]),

        thirdRate:
          value(match[21])
      }
    });
  }

  return racers;
}

async function raceData(
  hd,
  jcd,
  rno
) {
  const html =
    await officialFetch(
      `/owpc/pc/race/racelist?hd=${hd}&jcd=${jcd}&rno=${rno}`
    );

  return {
    hd,
    jcd,

    venue:
      VENUE_NAMES[jcd] ||
      jcd,

    rno:
      Number(rno),

    racers:
      parseRacers(html)
  };
}

/* =========================
   直前情報
========================= */

function parseBeforeInfo(html) {
  const text =
    stripHtml(html);

  const racers = [];

  const racerRegex =
    /(?:^|\s)([1-6])\s+(.+?)\s+(\d+(?:\.\d+)?)kg\s+(\d+\.\d{2})\s+(-?\d+\.\d)/g;

  let match;

  while (
    (match = racerRegex.exec(text))
      !== null &&
    racers.length < 6
  ) {
    const lane =
      Number(match[1]);

    if (
      !racers.some(
        r =>
          r.lane === lane
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
    text.indexOf(
      "スタート展示"
    );

  const weatherIndex =
    text.indexOf(
      "水面気象情報"
    );

  let startText = "";

  if (startIndex >= 0) {
    startText =
      weatherIndex > startIndex
        ? text.slice(
            startIndex,
            weatherIndex
          )
        : text.slice(
            startIndex
          );
  }

  const startRegex =
    /(?:^|\s)([1-6])\s+\.([0-9]{2})(?=\s|$)/g;

  const starts = [];

  while (
    (match =
      startRegex.exec(startText))
      !== null &&
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
  const html =
    await officialFetch(
      `/owpc/pc/race/beforeinfo?hd=${hd}&jcd=${jcd}&rno=${rno}`
    );

  return {
    hd,
    jcd,

    venue:
      VENUE_NAMES[jcd] ||
      jcd,

    rno:
      Number(rno),

    ...parseBeforeInfo(html)
  };
}

/* =========================
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

  for (
    const rowMatch of
    rowMatches
  ) {
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

        pending[col]
          .remaining--;

        if (
          pending[col]
            .remaining <= 0
        ) {
          delete pending[col];
        }

        col++;
      }
    }

    usePending();

    for (
      const cell of cells
    ) {
      usePending();

      const attrs =
        cell[2] || "";

      const text =
        cellText(
          cell[3]
        );

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
          ? Number(
              rowspanMatch[1]
            )
          : 1;

      const colspan =
        colspanMatch
          ? Number(
              colspanMatch[1]
            )
          : 1;

      for (
        let i = 0;
        i < colspan;
        i++
      ) {
        row[col] =
          text;

        if (rowspan > 1) {
          pending[col] = {
            value:
              text,

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
    String(v || "")
      .trim()
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

  for (
    const table of tables
  ) {
    const grid =
      expandTable(
        table[0]
      );

    for (
      const row of grid
    ) {
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

function normalizeCombination(
  text
) {
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

function parseTrifectaResult(
  html
) {
  const rows = [
    ...html.matchAll(
      /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
    )
  ];

  for (
    const rowMatch of rows
  ) {
    const cells = [
      ...rowMatch[1].matchAll(
        /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi
      )
    ]
      .map(
        cell =>
          stripHtml(
            cell[1]
          )
      )
      .filter(Boolean);

    if (!cells.length) {
      continue;
    }

    const rowText =
      cells.join(" ");

    if (
      !rowText.includes(
        "3連単"
      )
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

      if (
        payout === null
      ) {
        const comboCellIndex =
          cells.findIndex(
            cell =>
              normalizeCombination(
                cell
              ) ===
              combination
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
    parseTrifectaResult(
      html
    );

  let order =
    parseOrder(
      html
    );

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
        ? order.slice(
            0,
            3
          )
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
    !/^\d{8}$/.test(raceDate)
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
        race_date = excluded.race_date,
        jcd = excluded.jcd,
        venue = excluded.venue,
        rno = excluded.rno,
        deadline = excluded.deadline,
        deadline_jst = excluded.deadline_jst,
        analyzed_at = excluded.analyzed_at,
        confidence = excluded.confidence,
        decision = excluded.decision,
        stable_score = excluded.stable_score,
        strategy = excluded.strategy,
        prediction_json = excluded.prediction_json,
        note_title = excluded.note_title,
        note_body = excluded.note_body,
        posted = excluded.posted,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(
      raceKey,
      raceDate,
      jcd,
      venue,
      rno,
      body.deadline || null,
      body.deadline_jst ||
        body.deadlineJST ||
        null,
      analyzedAt,
      body.confidence || null,
      body.decision || null,
      Number.isFinite(stableScore)
        ? stableScore
        : null,
      body.strategy || null,
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
    !/^\d{8}$/.test(raceDate)
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
        race_date = excluded.race_date,
        jcd = excluded.jcd,
        venue = excluded.venue,
        rno = excluded.rno,
        race_data_json = excluded.race_data_json,
        before_data_json = excluded.before_data_json,
        odds_data_json = excluded.odds_data_json,
        result_json = excluded.result_json,
        finished = excluded.finished,
        historical_import = excluded.historical_import,
        updated_at = CURRENT_TIMESTAMP
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
      .prepare(`
        SELECT COUNT(*) AS count
        FROM learning_races
        WHERE finished = 1
      `)
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
        ORDER BY race_date DESC, rno DESC
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
        ORDER BY race_date DESC, rno DESC
        LIMIT ?
      `)
      .bind(limit)
      .all();

  return (
    result.results ||
    []
  );
}

/* =========================
   パラメータ
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
        ok: false,
        error:
          "jcdが必要です"
      },
      400
    );
  }

  if (
    !Number.isInteger(
      rno
    ) ||
    rno < 1 ||
    rno > 12
  ) {
    return json(
      {
        ok: false,
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

      /* =====================
         HEALTH
      ===================== */

      if (
        url.pathname ===
        "/api/health"
      ) {
        return json({
          ok: true,
          version:
            WORKER_VERSION,
          deadlineSupport:
            true,
          d1Support:
            true,
          d1WriteSupport:
            true
        });
      }

      /* =====================
         D1 CONNECTION
      ===================== */

      if (
        url.pathname ===
        "/api/db-health"
      ) {
        if (!env.DB) {
          return json(
            {
              ok: false,
              connected:
                false,
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
          ok: true,
          database:
            "usa-lab-ai",
          connected:
            true,
          result
        });
      }

      /* =====================
         D1 COUNTS
      ===================== */

      if (
        url.pathname ===
        "/api/storage-stats"
      ) {
        return json({
          ok: true,
          ...(
            await storageStats(
              env
            )
          )
        });
      }

      /* =====================
         PREDICTIONS
      ===================== */

      if (
        url.pathname ===
        "/api/predictions" &&
        request.method === "GET"
      ) {
        const limit =
          clampLimit(
            url.searchParams.get(
              "limit"
            )
          );

        return json({
          ok: true,
          predictions:
            await listPredictions(
              env,
              limit
            )
        });
      }

      if (
        url.pathname ===
        "/api/predictions" &&
        request.method === "POST"
      ) {
        const body =
          await readBody(
            request
          );

        const result =
          await savePrediction(
            env,
            body
          );

        return json({
          ok: true,
          ...result
        });
      }

      /* =====================
         LEARNING
      ===================== */

      if (
        url.pathname ===
        "/api/learning" &&
        request.method === "GET"
      ) {
        const limit =
          clampLimit(
            url.searchParams.get(
              "limit"
            )
          );

        return json({
          ok: true,
          learning:
            await listLearning(
              env,
              limit
            )
        });
      }

      if (
        url.pathname ===
        "/api/learning" &&
        request.method === "POST"
      ) {
        const body =
          await readBody(
            request
          );

        const result =
          await saveLearningRace(
            env,
            body
          );

        return json({
          ok: true,
          ...result
        });
      }

      /* =====================
         VENUES
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
          ok: true,
          hd,
          venues:
            await venues(
              hd
            )
        });
      }

      /* =====================
         VENUE
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
          !/^\d{2}$/.test(
            jcd
          )
        ) {
          return json(
            {
              ok: false,
              error:
                "jcdが必要です"
            },
            400
          );
        }

        return json({
          ok: true,
          ...(
            await venueData(
              hd,
              jcd
            )
          )
        });
      }

      /* =====================
         RACERS
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
          getRaceParams(
            url
          );

        const error =
          validateRace(
            jcd,
            rno
          );

        if (error) {
          return error;
        }

        return json({
          ok: true,
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
         BEFORE
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
          getRaceParams(
            url
          );

        const error =
          validateRace(
            jcd,
            rno
          );

        if (error) {
          return error;
        }

        return json({
          ok: true,
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
         ODDS
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
          getRaceParams(
            url
          );

        const error =
          validateRace(
            jcd,
            rno
          );

        if (error) {
          return error;
        }

        return json({
          ok: true,
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
         RESULT
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
          getRaceParams(
            url
          );

        const error =
          validateRace(
            jcd,
            rno
          );

        if (error) {
          return error;
        }

        return json({
          ok: true,
          ...(
            await resultData(
              hd,
              jcd,
              rno
            )
          )
        });
      }

      return env.ASSETS.fetch(
        request
      );

    } catch (error) {
      return json(
        {
          ok: false,
          error:
            error?.message ||
            String(error)
        },
        502
      );
    }
  }
};
