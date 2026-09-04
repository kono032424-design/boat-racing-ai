const OFFICIAL = "https://www.boatrace.jp";

const WORKER_VERSION = "6.4.1";
const AI_VERSION = "6.6.12";

const AUTO_MIN_MINUTES = 25;
const AUTO_MAX_MINUTES = 35;

/* =========================
   共通
========================= */

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8",

        "cache-control":
          "no-store"
      }
    }
  );
}

function getBearerToken(request) {
  const auth =
    request.headers.get(
      "authorization"
    ) || "";

  if (
    auth
      .toLowerCase()
      .startsWith(
        "bearer "
      )
  ) {
    return auth
      .slice(7)
      .trim();
  }

  return "";
}

function checkPrivateAccess(
  request,
  env
) {
  if (
    !env.D1_WRITE_TOKEN
  ) {
    return json(
      {
        ok:false,
        error:
          "D1_WRITE_TOKEN がCloudflareに設定されていません"
      },
      503
    );
  }

  const token =
    getBearerToken(
      request
    );

  if (
    !token ||
    token !==
    env.D1_WRITE_TOKEN
  ) {
    return json(
      {
        ok:false,
        error:
          "認証に失敗しました"
      },
      401
    );
  }

  return null;
}

function decodeHtml(
  text = ""
) {
  return text
    .replace(
      /&nbsp;/gi,
      " "
    )
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /&#39;/gi,
      "'"
    )
    .replace(
      /&yen;/gi,
      "¥"
    )
    .replace(
      /&#165;/gi,
      "¥"
    )
    .replace(
      /&lt;/gi,
      "<"
    )
    .replace(
      /&gt;/gi,
      ">"
    );
}

function stripHtml(
  html = ""
) {
  return decodeHtml(
    html
  )
    .replace(
      /<script[\s\S]*?<\/script>/gi,
      " "
    )
    .replace(
      /<style[\s\S]*?<\/style>/gi,
      " "
    )
    .replace(
      /<br\s*\/?>/gi,
      " "
    )
    .replace(
      /<\/(?:p|div|tr|li|td|th|a|span)>/gi,
      " "
    )
    .replace(
      /<[^>]+>/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

async function officialFetch(
  path
) {
  const response =
    await fetch(
      OFFICIAL + path,
      {
        headers: {
          "user-agent":
            `Mozilla/5.0 (compatible; BoatRacingAI/${WORKER_VERSION})`,

          "accept":
            "text/html,application/xhtml+xml"
        }
      }
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `BOAT RACE取得エラー HTTP ${response.status}`
    );
  }

  return await response.text();
}

function todayJST() {
  return new Intl
    .DateTimeFormat(
      "ja-JP",
      {
        timeZone:
          "Asia/Tokyo",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit"
      }
    )
    .format(
      new Date()
    )
    .replaceAll(
      "/",
      ""
    );
}

function nowJST() {
  return (
    new Intl
      .DateTimeFormat(
        "sv-SE",
        {
          timeZone:
            "Asia/Tokyo",

          year:
            "numeric",

          month:
            "2-digit",

          day:
            "2-digit",

          hour:
            "2-digit",

          minute:
            "2-digit",

          second:
            "2-digit",

          hour12:
            false
        }
      )
      .format(
        new Date()
      )
      .replace(
        " ",
        "T"
      )
    +
    "+09:00"
  );
}

function deadlineIsoJST(
  hd,
  time
) {
  if (
    !/^\d{8}$/.test(
      String(
        hd || ""
      )
    )
  ) {
    return null;
  }

  if (
    !/^\d{1,2}:\d{2}$/.test(
      String(
        time || ""
      )
    )
  ) {
    return null;
  }

  const yyyy =
    hd.slice(
      0,
      4
    );

  const mm =
    hd.slice(
      4,
      6
    );

  const dd =
    hd.slice(
      6,
      8
    );

  const [
    h,
    m
  ] =
    time.split(
      ":"
    );

  return (
    `${yyyy}-${mm}-${dd}` +
    `T${String(h).padStart(2,"0")}` +
    `:${m}:00+09:00`
  );
}

function safeNumber(v) {
  if (
    v === null ||
    v === undefined ||
    v === ""
  ) {
    return null;
  }

  const n =
    Number(v);

  return Number.isFinite(
    n
  )
    ? n
    : null;
}

function value(v) {
  if (
    v === undefined ||
    v === null ||
    v === "-"
  ) {
    return null;
  }

  const n =
    Number(v);

  return Number.isFinite(
    n
  )
    ? n
    : null;
}

function clamp(
  v,
  min,
  max
) {
  return Math.max(
    min,
    Math.min(
      max,
      v
    )
  );
}

function norm(
  v,
  low,
  high
) {
  if (
    high <= low
  ) {
    return .5;
  }

  return clamp(
    (
      v -
      low
    )
    /
    (
      high -
      low
    ),
    0,
    1
  );
}

function clampLimit(
  v,
  fallback = 50
) {
  const n =
    Number(v);

  if (
    !Number.isInteger(
      n
    )
  ) {
    return fallback;
  }

  return Math.min(
    Math.max(
      n,
      1
    ),
    200
  );
}

function makeRaceKey(
  raceDate,
  jcd,
  rno
) {
  return (
    `${String(raceDate)}-` +
    `${String(jcd).padStart(2,"0")}-` +
    `${Number(rno)}`
  );
}

function toJsonText(v) {
  if (
    v === undefined ||
    v === null
  ) {
    return null;
  }

  return typeof v ===
    "string"
    ? v
    : JSON.stringify(v);
}

function parseJsonSafe(
  text,
  fallback = null
) {
  if (
    text === null ||
    text === undefined ||
    text === ""
  ) {
    return fallback;
  }

  if (
    typeof text !==
    "string"
  ) {
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

async function readBody(
  request
) {
  try {
    return await request.json();

  } catch {
    throw new Error(
      "JSON形式のデータを送信してください"
    );
  }
}

/* =========================
   会場
========================= */

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

/* =========================
   開催場一覧
========================= */

async function venues(
  hd
) {
  const html =
    await officialFetch(
      `/owpc/pc/race/index?hd=${hd}`
    );

  const found = [
    ...html.matchAll(
      /[?&]jcd=(\d{2})/g
    )
  ].map(
    match =>
      match[1]
  );

  return [
    ...new Set(found)
  ]
    .filter(
      jcd =>
        VENUE_NAMES[jcd]
    )
    .map(
      jcd => ({
        jcd,
        name:
          VENUE_NAMES[jcd]
      })
    );
}

/* =========================
   締切時刻
========================= */

function parseRaceDeadlines(
  html
) {
  const deadlines =
    new Map();

  const text =
    stripHtml(
      html
    );

  const regex =
    /(?:^|\s)(1[0-2]|[1-9])R\s+([0-2]?\d:[0-5]\d)(?=\s|$)/g;

  let match;

  while (
    (
      match =
        regex.exec(
          text
        )
    ) !== null
  ) {
    const rno =
      Number(
        match[1]
      );

    const time =
      match[2]
        .padStart(
          5,
          "0"
        );

    if (
      !deadlines.has(
        rno
      )
    ) {
      deadlines.set(
        rno,
        time
      );
    }
  }

  if (
    deadlines.size < 12
  ) {
    const rows = [
      ...html.matchAll(
        /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
      )
    ];

    for (
      const rowMatch of rows
    ) {
      const row =
        stripHtml(
          rowMatch[1]
        );

      const m =
        row.match(
          /(?:^|\s)(1[0-2]|[1-9])R\s+([0-2]?\d:[0-5]\d)(?=\s|$)/
        );

      if (!m) {
        continue;
      }

      const rno =
        Number(
          m[1]
        );

      const time =
        m[2]
          .padStart(
            5,
            "0"
          );

      if (
        !deadlines.has(
          rno
        )
      ) {
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
   会場レース一覧
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
    stripHtml(
      html
    );

  const deadlines =
    parseRaceDeadlines(
      html
    );

  const races = [];

  for (
    let rno = 1;
    rno <= 12;
    rno++
  ) {
    const regex =
      new RegExp(
        `(?:^|\\s)${rno}R(?:\\s|$)`,
        "i"
      );

    if (
      regex.test(
        text
      )
      ||
      html.includes(
        `rno=${rno}`
      )
    ) {
      const deadline =
        deadlines.get(
          rno
        ) || null;

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

function parseRacers(
  html
) {
  const text =
    stripHtml(
      html
    );

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
    (
      match =
        regex.exec(
          text
        )
    ) !== null
    &&
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
          .replace(
            /\s+/g,
            " "
          )
          .trim(),

      branchOrigin:
        match[4],

      age:
        value(
          match[5]
        ),

      weight:
        value(
          match[6]
        ),

      fCount:
        value(
          match[7]
        ),

      lCount:
        value(
          match[8]
        ),

      avgST:
        value(
          match[9]
        ),

      national:{
        winRate:
          value(
            match[10]
          ),

        secondRate:
          value(
            match[11]
          ),

        thirdRate:
          value(
            match[12]
          )
      },

      local:{
        winRate:
          value(
            match[13]
          ),

        secondRate:
          value(
            match[14]
          ),

        thirdRate:
          value(
            match[15]
          )
      },

      motor:{
        number:
          value(
            match[16]
          ),

        secondRate:
          value(
            match[17]
          ),

        thirdRate:
          value(
            match[18]
          )
      },

      boat:{
        number:
          value(
            match[19]
          ),

        secondRate:
          value(
            match[20]
          ),

        thirdRate:
          value(
            match[21]
          )
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
      parseRacers(
        html
      )
  };
}

/* =========================
   直前情報
========================= */

function parseBeforeInfo(
  html
) {
  const text =
    stripHtml(
      html
    );

  const racers = [];

  const racerRegex =
    /(?:^|\s)([1-6])\s+(.+?)\s+(\d+(?:\.\d+)?)kg\s+(\d+\.\d{2})\s+(-?\d+\.\d)/g;

  let match;

  while (
    (
      match =
        racerRegex.exec(
          text
        )
    ) !== null
    &&
    racers.length < 6
  ) {
    const lane =
      Number(
        match[1]
      );

    if (
      racers.some(
        racer =>
          racer.lane ===
          lane
      )
    ) {
      continue;
    }

    racers.push({
      lane,

      name:
        match[2]
          .replace(
            /\s+/g,
            " "
          )
          .trim(),

      weight:
        value(
          match[3]
        ),

      exhibitionTime:
        value(
          match[4]
        ),

      tilt:
        value(
          match[5]
        ),

      course:
        null,

      exhibitionST:
        null
    });
  }

  const startIndex =
    text.indexOf(
      "スタート展示"
    );

  const weatherIndex =
    text.indexOf(
      "水面気象情報"
    );

  const startText =
    startIndex >= 0
      ? (
          weatherIndex >
          startIndex
            ? text.slice(
                startIndex,
                weatherIndex
              )
            : text.slice(
                startIndex
              )
        )
      : "";

  const startRegex =
    /(?:^|\s)([1-6])\s+\.([0-9]{2})(?=\s|$)/g;

  const starts = [];

  while (
    (
      match =
        startRegex.exec(
          startText
        )
    ) !== null
    &&
    starts.length < 6
  ) {
    starts.push({
      course:
        Number(
          match[1]
        ),

      exhibitionST:
        Number(
          `0.${match[2]}`
        )
    });
  }

  racers.forEach(
    (
      racer,
      index
    ) => {
      const start =
        starts[index];

      if (!start) {
        return;
      }

      racer.course =
        start.course;

      racer.exhibitionST =
        start.exhibitionST;
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

    weather:{
      temperature:
        temp
          ? Number(
              temp[1]
            )
          : null,

      windSpeed:
        wind
          ? Number(
              wind[1]
            )
          : null,

      waterTemperature:
        water
          ? Number(
              water[1]
            )
          : null,

      waveHeight:
        wave
          ? Number(
              wave[1]
            )
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

    ...parseBeforeInfo(
      html
    )
  };
}

/* =========================
   3連単オッズ
========================= */

function cellText(
  html
) {
  return stripHtml(
    html
  )
    .replace(
      /倍$/g,
      ""
    )
    .trim();
}

function expandTable(
  tableHtml
) {
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
      while (
        pending[col]
      ) {
        row[col] =
          pending[col]
            .value;

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

        if (
          rowspan > 1
        ) {
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

    grid.push(
      row
    );
  }

  return grid;
}

function isBoatNumber(
  v
) {
  return /^[1-6]$/.test(
    String(
      v || ""
    ).trim()
  );
}

function parseOdd(
  v
) {
  const text =
    String(
      v || ""
    )
      .replace(
        /,/g,
        ""
      )
      .trim();

  if (
    !text ||
    text === "-" ||
    text === "欠場"
  ) {
    return null;
  }

  const n =
    Number(
      text
    );

  return Number.isFinite(
    n
  )
    ? n
    : null;
}

function parseOdds(
  html
) {
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
          (
            first -
            1
          ) * 3;

        const second =
          row[base];

        const third =
          row[
            base + 1
          ];

        const odd =
          parseOdd(
            row[
              base + 2
            ]
          );

        if (
          !isBoatNumber(
            second
          )
          ||
          !isBoatNumber(
            third
          )
          ||
          odd === null
        ) {
          continue;
        }

        const secondNum =
          Number(
            second
          );

        const thirdNum =
          Number(
            third
          );

        if (
          first ===
            secondNum
          ||
          first ===
            thirdNum
          ||
          secondNum ===
            thirdNum
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
    parseOdds(
      html
    );

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
   結果
========================= */

function parsePayout(
  text
) {
  if (!text) {
    return null;
  }

  const cleaned =
    decodeHtml(
      text
    )
      .replace(
        /[¥￥円]/g,
        ""
      )
      .replace(
        /,/g,
        ""
      )
      .replace(
        /\s+/g,
        ""
      )
      .trim();

  const match =
    cleaned.match(
      /(\d+)/
    );

  if (!match) {
    return null;
  }

  const n =
    Number(
      match[1]
    );

  return Number.isFinite(
    n
  )
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
    stripHtml(
      text
    ).match(
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
      .filter(
        Boolean
      );

    if (
      !cells.length
    ) {
      continue;
    }

    const rowText =
      cells.join(
        " "
      );

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

    let payout =
      null;

    if (
      combination
    ) {
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
        decodeHtml(
          afterCombo
        ).match(
          /(?:¥|￥)\s*([\d,]+)|([\d,]+)\s*円/
        );

      if (
        yenMatch
      ) {
        payout =
          parsePayout(
            yenMatch[1] ||
            yenMatch[2]
          );
      }

      if (
        payout === null
      ) {
        const index =
          cells.findIndex(
            cell =>
              normalizeCombination(
                cell
              ) ===
              combination
          );

        if (
          index >= 0 &&
          cells[
            index + 1
          ]
        ) {
          payout =
            parsePayout(
              cells[
                index + 1
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
    combination:
      null,

    payout:
      null
  };
}

function parseOrder(
  html
) {
  const text =
    stripHtml(
      html
    );

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

  if (
    first
  ) {
    order.push(
      Number(
        first[1]
      )
    );
  }

  if (
    second
  ) {
    order.push(
      Number(
        second[1]
      )
    );
  }

  if (
    third
  ) {
    order.push(
      Number(
        third[1]
      )
    );
  }

  return order;
}

function parseResult(
  html
) {
  const text =
    stripHtml(
      html
    );

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
      trifecta
        .combination
        .split(
          "-"
        )
        .map(
          Number
        );
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

    ...parseResult(
      html
    )
  };
} /* =========================
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
    ).padStart(
      2,
      "0"
    );

  const rno =
    Number(
      body.rno
    );

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
    !/^\d{2}$/.test(
      jcd
    )
  ) {
    throw new Error(
      "jcd が必要です"
    );
  }

  if (
    !Number.isInteger(
      rno
    ) ||
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
   V6.4.1：
   既存の結果を消さない
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
    ).padStart(
      2,
      "0"
    );

  const rno =
    Number(
      body.rno
    );

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
    !/^\d{2}$/.test(
      jcd
    )
  ) {
    throw new Error(
      "jcd が必要です"
    );
  }

  if (
    !Number.isInteger(
      rno
    ) ||
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

        race_date=
          excluded.race_date,

        jcd=
          excluded.jcd,

        venue=
          excluded.venue,

        rno=
          excluded.rno,

        race_data_json=
          COALESCE(
            excluded.race_data_json,
            learning_races.race_data_json
          ),

        before_data_json=
          COALESCE(
            excluded.before_data_json,
            learning_races.before_data_json
          ),

        odds_data_json=
          COALESCE(
            excluded.odds_data_json,
            learning_races.odds_data_json
          ),

        result_json=
          COALESCE(
            excluded.result_json,
            learning_races.result_json
          ),

        finished=
          MAX(
            learning_races.finished,
            excluded.finished
          ),

        historical_import=
          MAX(
            learning_races.historical_import,
            excluded.historical_import
          ),

        updated_at=
          CURRENT_TIMESTAMP
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
   D1 保存状況
========================= */

async function storageStats(
  env
) {
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

/* =========================
   D1 予想一覧
========================= */

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

        ORDER BY
          race_date DESC,
          rno DESC

        LIMIT ?
      `)
      .bind(
        limit
      )
      .all();

  return (
    result.results ||
    []
  );
}

/* =========================
   D1 学習一覧
========================= */

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

        ORDER BY
          race_date DESC,
          rno DESC

        LIMIT ?
      `)
      .bind(
        limit
      )
      .all();

  return (
    result.results ||
    []
  );
}

/* =========================
   予想が保存済みか確認
========================= */

async function getPredictionByRaceKey(
  env,
  raceKey
) {
  return await env.DB
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
        note_body,
        posted

      FROM predictions

      WHERE race_key = ?

      LIMIT 1
    `)
    .bind(
      raceKey
    )
    .first();
}

/* =========================
   V6.6.12 AI
========================= */

const COMPONENT_NAMES = {
  lane:
    "枠・コース基本力",

  class:
    "級別",

  national:
    "全国勝率",

  local:
    "当地勝率",

  st:
    "平均ST",

  motor:
    "モーター",

  exhibition:
    "展示タイム",

  exhibitionST:
    "展示ST",

  course:
    "展示コース"
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

/* =========================
   直前情報統合
========================= */

function mergeBefore(
  racers,
  beforeData
) {
  return racers.map(
    racer => {
      const live =
        beforeData
          ?.racers
          ?.find(
            item =>
              Number(
                item.lane
              ) ===
              Number(
                racer.lane
              )
          );

      return {
        ...racer,

        before:{
          course:
            live?.course ??
            null,

          exhibitionTime:
            live?.exhibitionTime ??
            null,

          exhibitionST:
            live?.exhibitionST ??
            null,

          tilt:
            live?.tilt ??
            null
        }
      };
    }
  );
}

/* =========================
   基礎点
========================= */

function scoreComponents(
  racer,
  allRacers
) {
  const components = {
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

  components.lane =
    ({
      1:25,
      2:19,
      3:16,
      4:13,
      5:8,
      6:5
    })[
      racer.lane
    ] || 0;

  components.class =
    ({
      A1:15,
      A2:12,
      B1:7,
      B2:3
    })[
      racer.class
    ] || 0;

  const national =
    safeNumber(
      racer.national
        ?.winRate
    );

  if (
    national !== null
  ) {
    components.national =
      Math.min(
        18,
        national * 2.25
      );
  }

  const local =
    safeNumber(
      racer.local
        ?.winRate
    );

  if (
    local !== null
  ) {
    components.local =
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
    components.st =
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
      racer.motor
        ?.secondRate
    );

  if (
    motor !== null
  ) {
    components.motor =
      Math.min(
        10,
        motor / 5
      );
  }

  const exhibitionTimes =
    allRacers
      .map(
        item =>
          safeNumber(
            item.before
              ?.exhibitionTime
          )
      )
      .filter(
        item =>
          item !== null
      );

  const exhibition =
    safeNumber(
      racer.before
        ?.exhibitionTime
    );

  if (
    exhibition !== null &&
    exhibitionTimes.length
  ) {
    const diff =
      exhibition -
      Math.min(
        ...exhibitionTimes
      );

    components.exhibition =
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

  const exhibitionST =
    safeNumber(
      racer.before
        ?.exhibitionST
    );

  if (
    exhibitionST !== null
  ) {
    components.exhibitionST =
      exhibitionST <= .05
        ? 4
        : exhibitionST <= .10
          ? 3
          : exhibitionST <= .15
            ? 2
            : 1;
  }

  const course =
    safeNumber(
      racer.before
        ?.course
    );

  if (
    course === 1
  ) {
    components.course =
      2;

  } else if (
    course !== null &&
    course <= 3
  ) {
    components.course =
      1;
  }

  return components;
}

/* =========================
   学習初期値
========================= */

function blankWeights() {
  return Object.fromEntries(
    Object.keys(
      COMPONENT_NAMES
    ).map(
      key => [
        key,
        1
      ]
    )
  );
}

/* =========================
   D1から学習データ取得
   当日結果は混ぜない
========================= */

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

  if (
    asOfDate
  ) {
    sql +=
      ` AND race_date < ?`;

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

  let statement =
    env.DB.prepare(
      sql
    );

  if (
    binds.length
  ) {
    statement =
      statement.bind(
        ...binds
      );
  }

  const result =
    await statement.all();

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
      item.result
        ?.finished
      &&
      Array.isArray(
        item.racersDetailed
      )
      &&
      item.racersDetailed
        .length === 6
      &&
      Array.isArray(
        item.result
          .winningLanes
      )
      &&
      item.result
        .winningLanes
        .length >= 3
    ) {
      items.push(
        item
      );
    }
  }

  return items;
} /* =========================
   学習重み計算
========================= */

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
    const role of [
      "first",
      "second",
      "third"
    ]
  ) {
    const index =
      role === "first"
        ? 0
        : role === "second"
          ? 1
          : 2;

    const signals =
      Object.fromEntries(
        Object.keys(
          COMPONENT_NAMES
        ).map(
          key => [
            key,
            []
          ]
        )
      );

    for (
      const item of history
    ) {
      const winningLanes =
        item.result
          .winningLanes
          .map(
            Number
          );

      const targetLane =
        winningLanes[
          index
        ];

      const actual =
        item.racersDetailed
          .find(
            racer =>
              Number(
                racer.lane
              ) ===
              targetLane
          );

      if (
        !actual
      ) {
        continue;
      }

      let pool =
        item.racersDetailed;

      if (
        role === "second"
      ) {
        pool =
          pool.filter(
            racer =>
              Number(
                racer.lane
              ) !==
              winningLanes[0]
          );
      }

      if (
        role === "third"
      ) {
        pool =
          pool.filter(
            racer =>
              Number(
                racer.lane
              ) !==
              winningLanes[0]
            &&
              Number(
                racer.lane
              ) !==
              winningLanes[1]
          );
      }

      for (
        const key of
        Object.keys(
          COMPONENT_NAMES
        )
      ) {
        const values =
          pool.map(
            racer =>
              Number(
                racer.components
                  ?.[key] ||
                0
              )
          );

        const average =
          values.length
            ? values.reduce(
                (
                  total,
                  value
                ) =>
                  total +
                  value,
                0
              )
              /
              values.length
            : 0;

        const winnerValue =
          Number(
            actual.components
              ?.[key] ||
            0
          );

        if (
          average > 0
        ) {
          signals[
            key
          ].push(
            (
              winnerValue -
              average
            )
            /
            average
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
      const values =
        signals[key];

      if (
        !values.length
      ) {
        roles[
          role
        ][key] =
          1;

        continue;
      }

      const average =
        values.reduce(
          (
            total,
            value
          ) =>
            total +
            value,
          0
        )
        /
        values.length;

      const rate =
        role === "third"
          ? .45
          : .35;

      const limit =
        role === "third"
          ? .22
          : .18;

      const adjustment =
        clamp(
          average *
          rate,
          -limit,
          limit
        );

      roles[
        role
      ][key] =
        Math.round(
          (
            1 +
            adjustment
          )
          *
          1000
        )
        /
        1000;
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
            roles.first[key]
            +
            roles.second[key]
            +
            roles.third[key]
          )
          /
          3
        )
        *
        1000
      )
      /
      1000;
  }

  return {
    active:true,

    races:
      history.length,

    roles,

    overall
  };
}

/* =========================
   役割別スコア
========================= */

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
        components[
          key
        ] || 0
      )
      *
      Number(
        learned[
          key
        ] || 1
      )
      *
      Number(
        ROLE_WEIGHTS[
          role
        ][key] || 1
      );
  }

  return (
    Math.round(
      score * 10
    )
    /
    10
  );
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
        components[
          key
        ] || 0
      )
      *
      Number(
        weights[
          key
        ] || 1
      );
  }

  return (
    Math.round(
      score * 10
    )
    /
    10
  );
}

/* =========================
   120通り生成
========================= */

function makeAllCombinations() {
  const list = [];

  for (
    let first = 1;
    first <= 6;
    first++
  ) {
    for (
      let second = 1;
      second <= 6;
      second++
    ) {
      if (
        second === first
      ) {
        continue;
      }

      for (
        let third = 1;
        third <= 6;
        third++
      ) {
        if (
          third === first ||
          third === second
        ) {
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

function strength(
  score
) {
  return Math.exp(
    score / 20
  );
}

/* =========================
   1着占有率
========================= */

function firstWinShare(
  lane,
  racers
) {
  const total =
    racers.reduce(
      (
        sum,
        racer
      ) =>
        sum +
        strength(
          racer.firstScore
        ),
      0
    );

  const racer =
    racers.find(
      item =>
        item.lane ===
        lane
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
    )
    /
    total
  );
}

/* =========================
   3着条件付き評価
========================= */

function componentPosition(
  value,
  values
) {
  const numbers =
    values
      .map(
        Number
      )
      .filter(
        Number.isFinite
      );

  if (
    !numbers.length
  ) {
    return .5;
  }

  const min =
    Math.min(
      ...numbers
    );

  const max =
    Math.max(
      ...numbers
    );

  if (
    max === min
  ) {
    return .5;
  }

  return clamp(
    (
      Number(
        value
      )
      -
      min
    )
    /
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
      item =>
        Number(
          item.lane
        ) !==
        Number(
          first
        )
      &&
        Number(
          item.lane
        ) !==
        Number(
          second
        )
    );

  if (
    !remaining.length
  ) {
    return (
      racer.thirdScore
    );
  }

  const components =
    racer.components ||
    {};

  const motor =
    componentPosition(
      components.motor,

      remaining.map(
        item =>
          item.components
            ?.motor || 0
      )
    );

  const exhibition =
    componentPosition(
      components.exhibition,

      remaining.map(
        item =>
          item.components
            ?.exhibition || 0
      )
    );

  const local =
    componentPosition(
      components.local,

      remaining.map(
        item =>
          item.components
            ?.local || 0
      )
    );

  const national =
    componentPosition(
      components.national,

      remaining.map(
        item =>
          item.components
            ?.national || 0
      )
    );

  let bonus =
    motor * 1.6
    +
    exhibition * 1.4
    +
    local * 1.0
    +
    national * .6;

  if (
    Number(
      racer.lane
    ) >= 4
    &&
    (
      motor >= .60
      ||
      exhibition >= .60
    )
  ) {
    bonus += .6;
  }

  return (
    Math.round(
      (
        Number(
          racer.thirdScore ||
          0
        )
        +
        bonus
      )
      *
      10
    )
    /
    10
  );
}

/* =========================
   3連単確率
========================= */

function trifectaProbability(
  first,
  second,
  third,
  racers
) {
  const firstRacer =
    racers.find(
      racer =>
        racer.lane ===
        first
    );

  const secondRacer =
    racers.find(
      racer =>
        racer.lane ===
        second
    );

  const thirdRacer =
    racers.find(
      racer =>
        racer.lane ===
        third
    );

  if (
    !firstRacer ||
    !secondRacer ||
    !thirdRacer
  ) {
    return 0;
  }

  const firstTotal =
    racers.reduce(
      (
        sum,
        racer
      ) =>
        sum +
        strength(
          racer.firstScore
        ),
      0
    );

  const firstProbability =
    strength(
      firstRacer.firstScore
    )
    /
    firstTotal;

  const secondCandidates =
    racers.filter(
      racer =>
        racer.lane !==
        first
    );

  const secondTotal =
    secondCandidates.reduce(
      (
        sum,
        racer
      ) =>
        sum +
        strength(
          racer.secondScore
        ),
      0
    );

  const secondProbability =
    strength(
      secondRacer.secondScore
    )
    /
    secondTotal;

  const thirdCandidates =
    racers.filter(
      racer =>
        racer.lane !==
        first
      &&
        racer.lane !==
        second
    );

  const thirdScores =
    thirdCandidates.map(
      racer => ({
        racer,

        score:
          thirdConditionalScore(
            racer,
            first,
            second,
            racers
          )
      })
    );

  const thirdTotal =
    thirdScores.reduce(
      (
        sum,
        item
      ) =>
        sum +
        strength(
          item.score
        ),
      0
    );

  const actualThird =
    thirdScores.find(
      item =>
        item.racer.lane ===
        third
    );

  const thirdProbability =
    actualThird &&
    thirdTotal
      ? strength(
          actualThird.score
        )
        /
        thirdTotal
      : 0;

  return (
    firstProbability
    *
    secondProbability
    *
    thirdProbability
  );
}

/* =========================
   オッズMAP
========================= */

function makeOddsMap(
  oddsData
) {
  const map = {};

  for (
    const item of
    oddsData?.odds || []
  ) {
    map[
      item.combination
    ] =
      Number(
        item.odds
      );
  }

  return map;
}

/* =========================
   120通り評価
========================= */

function evaluateBets(
  racers,
  oddsData
) {
  const oddsMap =
    makeOddsMap(
      oddsData
    );

  const evaluated = [];

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
        .split(
          "-"
        )
        .map(
          Number
        );

    const odds =
      safeNumber(
        oddsMap[
          combination
        ]
      );

    if (
      odds === null
    ) {
      continue;
    }

    const firstRacer =
      racers.find(
        racer =>
          racer.lane ===
          first
      );

    const secondRacer =
      racers.find(
        racer =>
          racer.lane ===
          second
      );

    const thirdRacer =
      racers.find(
        racer =>
          racer.lane ===
          third
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
        thirdRacer,
        first,
        second,
        racers
      );

    evaluated.push({
      combination,
      first,
      second,
      third,

      firstRole:
        firstRacer.firstScore,

      secondRole:
        secondRacer.secondScore,

      thirdRole,

      probability,

      odds,

      ev:
        probability *
        odds
    });
  }

  if (
    !evaluated.length
  ) {
    return [];
  }

  const maxFirst =
    Math.max(
      ...evaluated.map(
        item =>
          item.firstRole
      ),
      1
    );

  const maxSecond =
    Math.max(
      ...evaluated.map(
        item =>
          item.secondRole
      ),
      1
    );

  const maxThird =
    Math.max(
      ...evaluated.map(
        item =>
          item.thirdRole
      ),
      1
    );

  const maxProbability =
    Math.max(
      ...evaluated.map(
        item =>
          item.probability
      ),
      .000001
    );

  const maxEv =
    Math.max(
      ...evaluated.map(
        item =>
          Math.min(
            item.ev,
            3
          )
      ),
      .000001
    );

  for (
    const item of
    evaluated
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
          firstNorm * .16
          +
          secondNorm * .09
          +
          thirdNorm * .10
          +
          probabilityNorm * .56
          +
          evNorm * .09
        )
        *
        1000
      )
      /
      10;
  }

  return evaluated.sort(
    (
      a,
      b
    ) =>
      b.totalScore -
      a.totalScore
  );
}

/* =========================
   S / A / B判定
========================= */

function getConfidence(
  racers
) {
  const ranked =
    racers
      .slice()
      .sort(
        (
          a,
          b
        ) =>
          b.firstScore -
          a.firstScore
      );

  if (
    ranked.length < 3
  ) {
    return "B";
  }

  const secondGap =
    ranked[0].firstScore -
    ranked[1].firstScore;

  const thirdGap =
    ranked[0].firstScore -
    ranked[2].firstScore;

  if (
    secondGap >= 9
    &&
    thirdGap >= 14
  ) {
    return "S";
  }

  if (
    secondGap >= 4.5
  ) {
    return "A";
  }

  return "B";
}

/* =========================
   2・3着安定度
========================= */

function roleStability(
  racers,
  field
) {
  const sorted =
    racers
      .slice()
      .sort(
        (
          a,
          b
        ) =>
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
      sorted[0][field]
      +
      sorted[1][field]
      +
      sorted[2][field]
    )
    /
    3;

  const bottom =
    (
      sorted[3][field]
      +
      sorted[4][field]
      +
      sorted[5][field]
    )
    /
    3;

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
      )
      /
      top
    )
    *
    220,
    0,
    100
  );
}

/* =========================
   展示データ充足率
========================= */

function beforeCoverage(
  racers
) {
  let available = 0;
  let total = 0;

  for (
    const racer of racers
  ) {
    for (
      const value of [
        racer.before
          ?.exhibitionTime,

        racer.before
          ?.exhibitionST,

        racer.before
          ?.course
      ]
    ) {
      total++;

      if (
        safeNumber(
          value
        ) !== null
      ) {
        available++;
      }
    }
  }

  return total
    ? available /
      total
    : 0;
}

/* =========================
   🔥S勝負 / ⚠️S見送り
========================= */

function makeSDecision(
  confidence,
  racers,
  allBets
) {
  if (
    confidence !== "S"
  ) {
    return {
      status:
        "NONE",

      label:
        `${confidence}評価`,

      score:
        0,

      metrics:
        null,

      reasons:
        []
    };
  }

  const ranked =
    racers
      .slice()
      .sort(
        (
          a,
          b
        ) =>
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
        (
          sum,
          bet
        ) =>
          sum +
          Number(
            bet.probability ||
            0
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
        secondStable /
        100,
        0,
        1
      ) * .10

      +

      clamp(
        thirdStable /
        100,
        0,
        1
      ) * .10

      +

      clamp(
        coverage,
        0,
        1
      ) * .15
    )
    *
    100;

  const score =
    Math.round(
      quality * 10
    )
    /
    10;

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
    score >= 68
    &&
    firstShare >= .30
    &&
    top6Probability >= .18
    &&
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
} /* =========================
   本線選択
========================= */

function selectMainlineBets(
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
        bet =>
          bet.first ===
          top1.lane
      );

  } else if (
    type === "SWAP"
  ) {
    preferred =
      allBets.filter(
        bet =>
          bet.first ===
          top1.lane
          ||
          bet.first ===
          top2.lane
      );

  } else if (
    type === "THIRD_WIDE"
  ) {
    const pool =
      allBets
        .filter(
          bet =>
            bet.first ===
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
          bet =>
            bet.third ===
            lane
        );

      if (
        item
      ) {
        byThird.push(
          item
        );
      }
    }

    const seen =
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
          !seen.has(
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
    const item of
    preferred
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
      selected.push(
        item
      );

      seen.add(
        item.combination
      );
    }
  }

  for (
    const item of
    allBets
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
      selected.push(
        item
      );

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
        )
        ||
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

/* =========================
   穴ランク
========================= */

function holeTier(
  odds
) {
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

/* =========================
   穴狙い
========================= */

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
        (
          bet,
          index
        ) => ({
          ...bet,
          aiRank:index + 1
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
          (
            bet,
            index
          ) => ({
            ...bet,
            aiRank:index + 1
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
          probabilityScore * .25
          +
          evScore * .30
          +
          aiScore * .20
          +
          oddsScore * .15
          +
          rankScore * .10
        )
        *
        1000
      )
      /
      10;

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

    selected.push(
      bet
    );

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
      selected.push(
        bet
      );
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
} /* =========================
   サーバーAI予想生成
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

  const main15 =
    strategy.bets;

  const holeBets =
    selectHoleBets(
      allBets,
      main15
    );

  const sDecision =
    makeSDecision(
      confidence,
      modelRacers,
      allBets
    );

  const allBetRanking =
    allBets.map(
      (
        bet,
        index
      ) => ({
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
      main15.map(
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
    main15,
    holeBets,
    strategy,
    snapshot
  };
}

/* =========================
   note 信頼度
========================= */

function confidenceStars(
  snapshot
) {
  if (
    snapshot.confidence ===
    "S"
  ) {
    if (
      snapshot.sDecision
        ?.status ===
      "BET"
    ) {
      if (
        Number(
          snapshot.sDecision
            ?.score || 0
        ) >= 80
      ) {
        return "★★★★★";
      }

      if (
        Number(
          snapshot.sDecision
            ?.score || 0
        ) >= 70
      ) {
        return "★★★★☆";
      }

      return "★★★☆☆";
    }

    return "★★★☆☆";
  }

  if (
    snapshot.confidence ===
    "A"
  ) {
    return "★★★☆☆";
  }

  return "★★☆☆☆";
}

/* =========================
   note 日付
========================= */

function formatNoteDate(
  hd
) {
  if (
    !/^\d{8}$/.test(
      String(
        hd || ""
      )
    )
  ) {
    return hd;
  }

  return (
    `${Number(hd.slice(4,6))}/` +
    `${Number(hd.slice(6,8))}`
  );
}

/* =========================
   note文章生成
========================= */

function buildNoteArticle(
  snapshot,
  deadline = null
) {
  const stars =
    confidenceStars(
      snapshot
    );

  const status =
    snapshot.confidence === "S"
      ? snapshot.sDecision
          ?.label ||
        "S評価"
      : `${snapshot.confidence}評価`;

  const noteType =
    snapshot.confidence === "S"
    &&
    snapshot.sDecision
      ?.status === "BET"
      ? "paid"
      : snapshot.confidence === "S"
        ? "free"
        : "learning";

  const title =
    `【${formatNoteDate(snapshot.date)} ${snapshot.venue}${snapshot.rno}R】` +
    `うさLAB競艇AI予想｜${status} ${stars}`;

  const main =
    snapshot.bets
      .slice(
        0,
        6
      )
      .map(
        (
          bet,
          index
        ) =>
          `${index + 1}. ${bet.combination}` +
          `｜AI ${bet.totalScore}` +
          `｜オッズ ${bet.odds}倍`
      )
      .join(
        "\n"
      );

  const holes =
    snapshot.holeBets
      ?.length
      ? snapshot.holeBets
          .map(
            (
              bet,
              index
            ) =>
              `${index + 1}. ${bet.combination}` +
              `｜${bet.tier?.label || "穴"}` +
              `｜オッズ ${bet.odds}倍`
          )
          .join(
            "\n"
          )
      : "該当なし";

  const topRacer =
    snapshot.racersDetailed
      ?.slice()
      .sort(
        (a,b) =>
          b.firstScore -
          a.firstScore
      )[0];

  const metrics =
    snapshot.sDecision
      ?.metrics;

  const sDetail =
    snapshot.confidence === "S"
    &&
    metrics
      ? [
          `S安定スコア：${snapshot.sDecision.score}`,
          `1着候補推定力：${(metrics.firstShare * 100).toFixed(1)}%`,
          `上位6点確率：${(metrics.top6Probability * 100).toFixed(1)}%`,
          `1着点差：${metrics.firstGap.toFixed(1)}`,
          `2着安定度：${Math.round(metrics.secondStability)}`,
          `3着安定度：${Math.round(metrics.thirdStability)}`,
          `展示データ：${Math.round(metrics.beforeCoverage * 100)}%`
        ].join(
          "\n"
        )
      : `勝負度：${snapshot.confidence}`;

  const notice =
    snapshot.sDecision
      ?.status === "PASS"
      ? "\n※今回はS評価ですが、勝負基準を満たさないため見送り判定です。\n"
      : "";

  const body =
`🐰 うさLAB｜競艇AI予想

${snapshot.date.slice(0,4)}年${Number(snapshot.date.slice(4,6))}月${Number(snapshot.date.slice(6,8))}日
${snapshot.venue} ${snapshot.rno}R
${deadline ? `締切予定 ${deadline}\n` : ""}
AIバージョン：${AI_VERSION}

━━━━━━━━━━━━━━
■ AI判定
━━━━━━━━━━━━━━

${status}
信頼度：${stars}

${sDetail}

戦略：
${snapshot.strategy?.label || "-"}
${snapshot.strategy?.reason || ""}

1着評価トップ：
${topRacer ? `${topRacer.lane}号艇 ${topRacer.name}` : "-"}

${notice}
━━━━━━━━━━━━━━
■ 本線3連単
━━━━━━━━━━━━━━

${main}

━━━━━━━━━━━━━━
■ 穴狙い
━━━━━━━━━━━━━━

${holes}

━━━━━━━━━━━━━━
■ AI分析について
━━━━━━━━━━━━━━

うさLABでは、
枠・級別・全国成績・当地成績・ST・モーター・展示タイム・展示ST・展示コースなどを数値化し、
過去の結果データを学習しながら1着・2着・3着を役割別に評価しています。

学習対象レース数：
${snapshot.learningRaces}R

※的中や利益を保証するものではありません。
※オッズは変動する場合があります。
※舟券購入はご自身の判断でお願いします。

うさLAB｜競艇AI予想 🐰🚤`;

  return {
    noteType,
    title,
    body,
    stars
  };
}

/* =========================
   1レース分のAIデータ取得
========================= */

async function fetchPredictionData(
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
      ?.racers
      ?.length
  ) {
    throw new Error(
      "選手データを取得できませんでした"
    );
  }

  if (
    beforeResult.status !==
    "fulfilled"
    ||
    !beforeResult.value
      ?.racers
      ?.length
  ) {
    throw new Error(
      "直前情報がまだ不足しています"
    );
  }

  if (
    oddsResult.status !==
    "fulfilled"
    ||
    !oddsResult.value
      ?.odds
      ?.length
  ) {
    throw new Error(
      "3連単オッズがまだ取得できません"
    );
  }

  const race =
    raceResult.value;

  const before =
    beforeResult.value;

  const odds =
    oddsResult.value;

  const racers =
    mergeBefore(
      race.racers,
      before
    );

  const prediction =
    await buildServerPrediction(
      env,
      racers,
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

  return {
    race,
    before,
    odds,
    prediction
  };
}

/* =========================
   AUTO TEST
   保存しない
========================= */

async function autoTestData(
  env,
  hd,
  jcd,
  rno
) {
  const data =
    await fetchPredictionData(
      env,
      hd,
      jcd,
      rno
    );

  let deadline =
    null;

  let deadlineJST =
    null;

  try {
    const venue =
      await venueData(
        hd,
        jcd
      );

    const target =
      venue.races.find(
        race =>
          Number(
            race.rno
          ) ===
          Number(
            rno
          )
      );

    deadline =
      target?.deadline ||
      null;

    deadlineJST =
      target?.deadlineJST ||
      null;

  } catch {}

  const note =
    buildNoteArticle(
      data.prediction
        .snapshot,
      deadline
    );

  return {
    workerVersion:
      WORKER_VERSION,

    aiVersion:
      AI_VERSION,

    hd,
    jcd,

    venue:
      data.race.venue,

    rno:
      Number(rno),

    deadline,
    deadlineJST,

    beforeAvailable:
      true,

    oddsCount:
      data.odds
        .odds
        .length,

    learning:{
      active:
        data.prediction
          .learned
          .active,

      races:
        data.prediction
          .learned
          .races,

      roles:
        data.prediction
          .learned
          .roles
    },

    confidence:
      data.prediction
        .confidence,

    sDecision:
      data.prediction
        .sDecision,

    strategy:
      data.prediction
        .snapshot
        .strategy,

    overallRanking:
      data.prediction
        .overallRanking
        .map(
          (
            racer,
            index
          ) => ({
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
      data.prediction
        .snapshot
        .bets,

    holeBets:
      data.prediction
        .holeBets,

    note:{
      type:
        note.noteType,

      title:
        note.title,

      body:
        note.body
    },

    snapshot:
      data.prediction
        .snapshot
  };
} /* =========================
   学習レース存在確認
========================= */

async function getLearningByRaceKey(
  env,
  raceKey
) {
  return await env.DB
    .prepare(`
      SELECT
        race_key,
        race_date,
        jcd,
        venue,
        rno,
        finished,
        historical_import,
        updated_at

      FROM learning_races

      WHERE race_key = ?

      LIMIT 1
    `)
    .bind(
      raceKey
    )
    .first();
}

/* =========================
   同時取得を抑える
========================= */

async function mapChunks(
  items,
  size,
  fn
) {
  const output = [];

  for (
    let index = 0;
    index < items.length;
    index += size
  ) {
    const chunk =
      items.slice(
        index,
        index + size
      );

    const results =
      await Promise.allSettled(
        chunk.map(
          item =>
            fn(item)
        )
      );

    output.push(
      ...results
    );
  }

  return output;
}

/* =========================
   締切25〜35分前を探す
========================= */

async function findAutoTargets(
  hd,
  atDate = null
) {
  const current =
    atDate instanceof Date
    &&
    !Number.isNaN(
      atDate.getTime()
    )
      ? atDate
      : new Date();

  const currentMs =
    current.getTime();

  const venueList =
    await venues(
      hd
    );

  const venueResults =
    await mapChunks(
      venueList,
      4,
      venue =>
        venueData(
          hd,
          venue.jcd
        )
    );

  const targets = [];

  for (
    const result of
    venueResults
  ) {
    if (
      result.status !==
      "fulfilled"
    ) {
      continue;
    }

    const venue =
      result.value;

    for (
      const race of
      venue.races
    ) {
      if (
        !race.deadlineJST
      ) {
        continue;
      }

      const deadlineMs =
        new Date(
          race.deadlineJST
        ).getTime();

      if (
        !Number.isFinite(
          deadlineMs
        )
      ) {
        continue;
      }

      const minutesUntil =
        (
          deadlineMs -
          currentMs
        )
        /
        60000;

      if (
        minutesUntil >=
          AUTO_MIN_MINUTES
        &&
        minutesUntil <=
          AUTO_MAX_MINUTES
      ) {
        targets.push({
          hd,

          jcd:
            venue.jcd,

          venue:
            venue.venue,

          rno:
            race.rno,

          deadline:
            race.deadline,

          deadlineJST:
            race.deadlineJST,

          minutesUntil:
            Math.round(
              minutesUntil *
              10
            )
            /
            10
        });
      }
    }
  }

  targets.sort(
    (
      a,
      b
    ) =>
      new Date(
        a.deadlineJST
      )
      -
      new Date(
        b.deadlineJST
      )
  );

  return {
    hd,

    checkedAt:
      current.toISOString(),

    range:{
      minMinutes:
        AUTO_MIN_MINUTES,

      maxMinutes:
        AUTO_MAX_MINUTES
    },

    venues:
      venueList.length,

    count:
      targets.length,

    targets
  };
}

/* =========================
   1レース自動分析
   ＋ D1保存
========================= */

async function analyzeAndSaveTarget(
  env,
  target,
  force = false
) {
  const raceKey =
    makeRaceKey(
      target.hd,
      target.jcd,
      target.rno
    );

  /*
    通常は同じレースを
    二重分析しない。
  */

  if (
    !force
  ) {
    const existing =
      await getLearningByRaceKey(
        env,
        raceKey
      );

    if (
      existing
    ) {
      return {
        raceKey,

        venue:
          target.venue,

        rno:
          target.rno,

        deadline:
          target.deadline,

        status:
          "SKIPPED",

        reason:
          "すでに分析済み"
      };
    }
  }

  const data =
    await fetchPredictionData(
      env,
      target.hd,
      target.jcd,
      target.rno
    );

  const snapshot =
    data.prediction
      .snapshot;

  const note =
    buildNoteArticle(
      snapshot,
      target.deadline
    );

  /*
    S/A/Bすべて
    学習候補として保存。

    この時点では結果前なので
    finished=false。
  */

  await saveLearningRace(
    env,
    {
      race_date:
        target.hd,

      jcd:
        target.jcd,

      venue:
        target.venue,

      rno:
        target.rno,

      race:
        snapshot,

      before:
        data.before,

      odds:
        data.odds,

      result:
        null,

      finished:
        false,

      historical_import:
        false
    }
  );

  let predictionSaved =
    false;

  /*
    販売・投稿候補は
    S評価だけ predictions に保存。
  */

  if (
    snapshot.confidence ===
    "S"
  ) {
    await savePrediction(
      env,
      {
        race_date:
          target.hd,

        jcd:
          target.jcd,

        venue:
          target.venue,

        rno:
          target.rno,

        deadline:
          target.deadline,

        deadline_jst:
          target.deadlineJST,

        analyzed_at:
          nowJST(),

        confidence:
          snapshot.confidence,

        decision:
          snapshot.sDecision
            ?.status ||
          null,

        stable_score:
          snapshot.sDecision
            ?.score ??
          null,

        strategy:
          snapshot.strategy
            ?.label ||
          null,

        prediction:
          snapshot,

        note_title:
          note.title,

        note_body:
          note.body,

        posted:
          false
      }
    );

    predictionSaved =
      true;
  }

  return {
    raceKey,

    venue:
      target.venue,

    rno:
      target.rno,

    deadline:
      target.deadline,

    deadlineJST:
      target.deadlineJST,

    minutesUntil:
      target.minutesUntil,

    status:
      "ANALYZED",

    confidence:
      snapshot.confidence,

    decision:
      snapshot.sDecision
        ?.status ||
      "NONE",

    decisionLabel:
      snapshot.sDecision
        ?.label ||
      `${snapshot.confidence}評価`,

    stableScore:
      snapshot.sDecision
        ?.score ||
      0,

    strategy:
      snapshot.strategy
        ?.label ||
      null,

    predictionSaved,

    learningSaved:
      true,

    noteType:
      note.noteType,

    noteTitle:
      snapshot.confidence ===
        "S"
        ? note.title
        : null,

    main6:
      snapshot.bets
        .slice(
          0,
          6
        )
        .map(
          bet =>
            bet.combination
        ),

    holeBets:
      snapshot.holeBets
        .map(
          bet =>
            bet.combination
        )
  };
}

/* =========================
   自動分析ウィンドウ実行
========================= */

async function runAutoWindow(
  env,
  options = {}
) {
  const hd =
    options.hd ||
    todayJST();

  const force =
    Boolean(
      options.force
    );

  let atDate =
    null;

  if (
    options.at
  ) {
    const parsed =
      new Date(
        options.at
      );

    if (
      !Number.isNaN(
        parsed.getTime()
      )
    ) {
      atDate =
        parsed;
    }
  }

  const scan =
    await findAutoTargets(
      hd,
      atDate
    );

  const results = [];

  /*
    公式サイトへの負荷を抑えるため、
    対象レースを1つずつ処理。
  */

  for (
    const target of
    scan.targets
  ) {
    try {
      const result =
        await analyzeAndSaveTarget(
          env,
          target,
          force
        );

      results.push(
        result
      );

    } catch (
      error
    ) {
      results.push({
        raceKey:
          makeRaceKey(
            target.hd,
            target.jcd,
            target.rno
          ),

        venue:
          target.venue,

        rno:
          target.rno,

        deadline:
          target.deadline,

        status:
          "RETRY",

        reason:
          error?.message ||
          String(
            error
          )
      });
    }
  }

  const analyzed =
    results.filter(
      result =>
        result.status ===
        "ANALYZED"
    );

  const sBet =
    analyzed.filter(
      result =>
        result.confidence ===
          "S"
        &&
        result.decision ===
          "BET"
    );

  const sPass =
    analyzed.filter(
      result =>
        result.confidence ===
          "S"
        &&
        result.decision ===
          "PASS"
    );

  return {
    workerVersion:
      WORKER_VERSION,

    aiVersion:
      AI_VERSION,

    hd,

    checkedAt:
      scan.checkedAt,

    targetCount:
      scan.count,

    analyzedCount:
      analyzed.length,

    sBetCount:
      sBet.length,

    sPassCount:
      sPass.length,

    learningOnlyCount:
      analyzed.filter(
        result =>
          result.confidence !==
          "S"
      ).length,

    skippedCount:
      results.filter(
        result =>
          result.status ===
          "SKIPPED"
      ).length,

    retryCount:
      results.filter(
        result =>
          result.status ===
          "RETRY"
      ).length,

    results
  };
}

/* =========================
   URLパラメータ
========================= */

function getRaceParams(
  url
) {
  return {
    hd:
      url.searchParams.get(
        "hd"
      )
      ||
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
    !Number.isInteger(
      rno
    )
    ||
    rno < 1
    ||
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

      /* ===== HEALTH ===== */

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
            true,

          autoAnalysis:
            true,

          noteGeneration:
            true,

          autoWindow:
            `${AUTO_MIN_MINUTES}-${AUTO_MAX_MINUTES}min`,

          cronEnabled:
            false
        });
      }

      /* ===== DB HEALTH ===== */

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

          connected:
            true,

          authConfigured:
            Boolean(
              env.D1_WRITE_TOKEN
            ),

          result
        });
      }

      /* ===== STORAGE ===== */

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
         AUTO TEST
         認証あり・保存なし
      ===================== */

      if (
        url.pathname ===
        "/api/auto-test"
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

        const {
          hd,
          jcd,
          rno
        } =
          getRaceParams(
            url
          );

        const raceError =
          validateRace(
            jcd,
            rno
          );

        if (
          raceError
        ) {
          return raceError;
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
         AUTO SCAN
         認証あり・保存なし
      ===================== */

      if (
        url.pathname ===
        "/api/auto-scan"
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

        const hd =
          url.searchParams.get(
            "hd"
          )
          ||
          todayJST();

        const at =
          url.searchParams.get(
            "at"
          );

        let atDate =
          null;

        if (
          at
        ) {
          const parsed =
            new Date(
              at
            );

          if (
            !Number.isNaN(
              parsed.getTime()
            )
          ) {
            atDate =
              parsed;
          }
        }

        return json({
          ok:true,

          ...(
            await findAutoTargets(
              hd,
              atDate
            )
          )
        });
      }

      /* =====================
         AUTO RUN
         認証あり・D1保存
      ===================== */

      if (
        url.pathname ===
        "/api/auto-run"
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

        const hd =
          url.searchParams.get(
            "hd"
          )
          ||
          todayJST();

        const at =
          url.searchParams.get(
            "at"
          );

        const force =
          url.searchParams.get(
            "force"
          ) === "1";

        return json({
          ok:true,

          ...(
            await runAutoWindow(
              env,
              {
                hd,
                at,
                force
              }
            )
          )
        });
      }

      /* =====================
         PREDICTIONS
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
         LEARNING
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

      /* ===== VENUES ===== */

      if (
        url.pathname ===
        "/api/venues"
      ) {
        const hd =
          url.searchParams.get(
            "hd"
          )
          ||
          todayJST();

        return json({
          ok:true,
          hd,

          venues:
            await venues(
              hd
            )
        });
      }

      /* ===== VENUE ===== */

      if (
        url.pathname ===
        "/api/venue"
      ) {
        const hd =
          url.searchParams.get(
            "hd"
          )
          ||
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

      /* ===== RACE ===== */

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

        const raceError =
          validateRace(
            jcd,
            rno
          );

        if (
          raceError
        ) {
          return raceError;
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

      /* ===== BEFORE ===== */

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

        const raceError =
          validateRace(
            jcd,
            rno
          );

        if (
          raceError
        ) {
          return raceError;
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

      /* ===== ODDS ===== */

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

        const raceError =
          validateRace(
            jcd,
            rno
          );

        if (
          raceError
        ) {
          return raceError;
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

      /* ===== RESULT ===== */

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

        const raceError =
          validateRace(
            jcd,
            rno
          );

        if (
          raceError
        ) {
          return raceError;
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

      /* ===== WEB画面 ===== */

      return env.ASSETS.fetch(
        request
      );

    } catch (
      error
    ) {
      console.error(
        error
      );

      return json(
        {
          ok:false,

          error:
            error?.message ||
            String(
              error
            )
        },
        502
      );
    }
  }
};
