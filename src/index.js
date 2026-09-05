const OFFICIAL = "https://www.boatrace.jp";

const WORKER_VERSION = "6.5.4";
const AI_VERSION = "6.6.12";

const AUTO_MIN_MINUTES = 10;
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

/* =========================================================
   V6.5.4 完全放置オートメーション
   - 自動予想と結果更新を独立実行
   - 結果をD1へ保存して finished=1
   - predictionsへ的中判定を保存
   - D1から自動成績を集計
   - Cron実行状況をD1へ記録
========================================================= */

function jstDateKeyOffset(days = 0) {
  const date =
    new Date(
      Date.now() +
      days * 86400000
    );

  return new Intl.DateTimeFormat(
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
    .format(date)
    .replaceAll("/", "");
}

async function ensureAutomationTables(env) {
  await env.DB
    .prepare(`
      CREATE TABLE IF NOT EXISTS automation_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT,
        finished_at TEXT,
        status TEXT NOT NULL,
        race_date TEXT,
        auto_target_count INTEGER NOT NULL DEFAULT 0,
        auto_analyzed_count INTEGER NOT NULL DEFAULT 0,
        auto_retry_count INTEGER NOT NULL DEFAULT 0,
        result_pending_count INTEGER NOT NULL DEFAULT 0,
        result_checked_count INTEGER NOT NULL DEFAULT 0,
        result_finished_count INTEGER NOT NULL DEFAULT 0,
        error_text TEXT,
        summary_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)
    .run();
}

function compactAutoResult(result) {
  if (!result) {
    return null;
  }

  return {
    hd:
      result.hd ||
      null,

    targetCount:
      Number(
        result.targetCount ||
        0
      ),

    analyzedCount:
      Number(
        result.analyzedCount ||
        0
      ),

    sBetCount:
      Number(
        result.sBetCount ||
        0
      ),

    sPassCount:
      Number(
        result.sPassCount ||
        0
      ),

    learningOnlyCount:
      Number(
        result.learningOnlyCount ||
        0
      ),

    skippedCount:
      Number(
        result.skippedCount ||
        0
      ),

    retryCount:
      Number(
        result.retryCount ||
        0
      ),

    retryReasons:
      Array.isArray(
        result.results
      )
        ? result.results
            .filter(
              item =>
                item.status ===
                "RETRY"
            )
            .slice(
              0,
              10
            )
            .map(
              item => ({
                venue:
                  item.venue ||
                  null,

                rno:
                  item.rno ||
                  null,

                reason:
                  item.reason ||
                  null
              })
            )
        : []
  };
}

function compactResultUpdate(result) {
  if (!result) {
    return null;
  }

  return {
    pending:
      Number(
        result.pending ||
        0
      ),

    due:
      Number(
        result.due ||
        0
      ),

    checked:
      Number(
        result.checked ||
        0
      ),

    finished:
      Number(
        result.finished ||
        0
      ),

    waiting:
      Number(
        result.waiting ||
        0
      ),

    remainingDue:
      Number(
        result.remainingDue ||
        0
      ),

    errors:
      Array.isArray(
        result.results
      )
        ? result.results
            .filter(
              item =>
                item.status ===
                "ERROR"
            )
            .slice(
              0,
              10
            )
            .map(
              item => ({
                venue:
                  item.venue ||
                  null,

                rno:
                  item.rno ||
                  null,

                error:
                  item.error ||
                  null
              })
            )
        : []
  };
}

async function saveAutomationRun(
  env,
  summary
) {
  await ensureAutomationTables(
    env
  );

  const auto =
    summary.auto ||
    {};

  const resultUpdate =
    summary.resultUpdate ||
    {};

  await env.DB
    .prepare(`
      INSERT INTO automation_runs (
        started_at,
        finished_at,
        status,
        race_date,
        auto_target_count,
        auto_analyzed_count,
        auto_retry_count,
        result_pending_count,
        result_checked_count,
        result_finished_count,
        error_text,
        summary_json
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `)
    .bind(
      summary.startedAt ||
      null,

      summary.finishedAt ||
      null,

      summary.status ||
      "UNKNOWN",

      summary.hd ||
      null,

      Number(
        auto.targetCount ||
        0
      ),

      Number(
        auto.analyzedCount ||
        0
      ),

      Number(
        auto.retryCount ||
        0
      ),

      Number(
        resultUpdate.pending ||
        0
      ),

      Number(
        resultUpdate.checked ||
        0
      ),

      Number(
        resultUpdate.finished ||
        0
      ),

      summary.error ||
      null,

      JSON.stringify(
        summary
      )
    )
    .run();

  /* 7日より古い実行ログは削除 */
  await env.DB
    .prepare(`
      DELETE FROM automation_runs
      WHERE created_at < datetime('now', '-7 days')
    `)
    .run();
}

async function listPendingResultRaces(env) {
  const fromDate =
    jstDateKeyOffset(-30);

  const toDate =
    todayJST();

  const result =
    await env.DB
      .prepare(`
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
      `)
      .bind(
        fromDate,
        toDate
      )
      .all();

  return (
    result.results ||
    []
  );
}

async function updatePredictionResult(
  env,
  raceKey,
  raceResult
) {
  const row =
    await env.DB
      .prepare(`
        SELECT
          prediction_json

        FROM predictions

        WHERE race_key = ?

        LIMIT 1
      `)
      .bind(
        raceKey
      )
      .first();

  if (
    !row ||
    !row.prediction_json
  ) {
    return {
      predictionExists:
        false
    };
  }

  const snapshot =
    parseJsonSafe(
      row.prediction_json,
      {}
    ) || {};

  const combination =
    raceResult.combination;

  const main15 =
    Array.isArray(
      snapshot.bets
    )
      ? snapshot.bets
      : [];

  const main6 =
    main15.slice(
      0,
      6
    );

  const holes =
    Array.isArray(
      snapshot.holeBets
    )
      ? snapshot.holeBets
      : [];

  const main6Hit =
    main6.some(
      bet =>
        bet.combination ===
        combination
    );

  const main15Hit =
    main15.some(
      bet =>
        bet.combination ===
        combination
    );

  const holeHit =
    holes.some(
      bet =>
        bet.combination ===
        combination
    );

  const hit =
    main6Hit ||
    main15Hit ||
    holeHit;

  snapshot.result =
    raceResult;

  snapshot.resultCheck = {
    checkedAt:
      new Date()
        .toISOString(),

    combination,

    payout:
      raceResult.payout,

    main6Hit,
    main15Hit,
    holeHit,
    hit
  };

  await env.DB
    .prepare(`
      UPDATE predictions

      SET
        prediction_json = ?,
        updated_at = CURRENT_TIMESTAMP

      WHERE race_key = ?
    `)
    .bind(
      JSON.stringify(
        snapshot
      ),

      raceKey
    )
    .run();

  return {
    predictionExists:
      true,

    main6Hit,
    main15Hit,
    holeHit,
    hit
  };
}

async function makeTodayDeadlineMap(rows) {
  const today =
    todayJST();

  const todayRows =
    rows.filter(
      row =>
        String(
          row.race_date
        ) === today
    );

  if (
    !todayRows.length
  ) {
    return new Map();
  }

  const venuesToCheck = [
    ...new Map(
      todayRows.map(
        row => [
          String(
            row.jcd
          ).padStart(
            2,
            "0"
          ),

          {
            hd:
              today,

            jcd:
              String(
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

  const results =
    await mapChunks(
      venuesToCheck,
      4,
      item =>
        venueData(
          item.hd,
          item.jcd
        )
    );

  const map =
    new Map();

  for (
    const result of results
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
      venue.races || []
    ) {
      map.set(
        makeRaceKey(
          venue.hd,
          venue.jcd,
          race.rno
        ),

        race.deadlineJST ||
        null
      );
    }
  }

  return map;
}

async function runResultUpdates(env) {
  const pending =
    await listPendingResultRaces(
      env
    );

  if (
    !pending.length
  ) {
    return {
      ok:true,
      checkedAt:
        new Date()
          .toISOString(),
      pending:0,
      due:0,
      checked:0,
      finished:0,
      waiting:0,
      remainingDue:0,
      results:[]
    };
  }

  const today =
    todayJST();

  const deadlineMap =
    await makeTodayDeadlineMap(
      pending
    );

  const now =
    Date.now();

  const due = [];
  let waiting = 0;

  for (
    const row of pending
  ) {
    const raceDate =
      String(
        row.race_date
      );

    /* 昨日以前は即チェック */
    if (
      raceDate < today
    ) {
      due.push(
        row
      );
      continue;
    }

    /* 今日分は締切5分後から */
    const deadlineJST =
      deadlineMap.get(
        row.race_key
      );

    if (
      !deadlineJST
    ) {
      waiting++;
      continue;
    }

    const deadlineMs =
      new Date(
        deadlineJST
      ).getTime();

    if (
      !Number.isFinite(
        deadlineMs
      ) ||
      now <
        deadlineMs +
        5 * 60000
    ) {
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

  /*
    新しい未確定レースを優先して最大12R。
    古い取消・不成立レースがあっても
    今日の更新を塞がない。
  */
  for (
    const row of
    due.slice(
      0,
      12
    )
  ) {
    checked++;

    try {
      const raceResult =
        await resultData(
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

      if (
        !raceResult.finished
      ) {
        output.push({
          raceKey:
            row.race_key,

          venue:
            row.venue,

          rno:
            row.rno,

          status:
            "WAIT_RESULT"
        });

        continue;
      }

      await saveLearningRace(
        env,
        {
          race_date:
            String(
              row.race_date
            ),

          jcd:
            String(
              row.jcd
            ).padStart(
              2,
              "0"
            ),

          venue:
            row.venue,

          rno:
            Number(
              row.rno
            ),

          result:
            raceResult,

          finished:
            true
        }
      );

      const predictionCheck =
        await updatePredictionResult(
          env,
          row.race_key,
          raceResult
        );

      finished++;

      output.push({
        raceKey:
          row.race_key,

        venue:
          row.venue,

        rno:
          row.rno,

        status:
          "FINISHED",

        combination:
          raceResult.combination,

        payout:
          raceResult.payout,

        ...predictionCheck
      });

    } catch (error) {
      output.push({
        raceKey:
          row.race_key,

        venue:
          row.venue,

        rno:
          row.rno,

        status:
          "ERROR",

        error:
          error?.message ||
          String(error)
      });
    }
  }

  return {
    ok:true,
    checkedAt:
      new Date()
        .toISOString(),
    pending:
      pending.length,
    due:
      due.length,
    checked,
    finished,
    waiting,
    remainingDue:
      Math.max(
        0,
        due.length -
        checked
      ),
    results:
      output
  };
}


/* =========================================================
   LINE自動通知 V6.5.4
   - 当日の保存済み「🔥 S勝負」を毎回D1から再確認
   - race_keyで重複送信を防止
   - 送信失敗は次回Cronで再試行
   - 先頭12件だけを見る制限を廃止し、通知漏れを防止
========================================================= */

async function ensureLineNotificationTable(env) {
  await env.DB
    .prepare(`
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
    `)
    .run();

  await env.DB
    .prepare(`
      CREATE INDEX IF NOT EXISTS idx_line_notifications_date
      ON line_notifications(race_date)
    `)
    .run();
}

function lineNotificationConfigured(env) {
  return Boolean(
    env.LINE_CHANNEL_ACCESS_TOKEN &&
    env.LINE_USER_ID
  );
}

async function sendLinePush(env, text) {
  if (!lineNotificationConfigured(env)) {
    throw new Error(
      "LINE_CHANNEL_ACCESS_TOKEN または LINE_USER_ID が未設定です"
    );
  }

  const response =
    await fetch(
      "https://api.line.me/v2/bot/message/push",
      {
        method:"POST",
        headers:{
          "content-type":
            "application/json",
          "authorization":
            `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
        },
        body:JSON.stringify({
          to:
            env.LINE_USER_ID,
          messages:[
            {
              type:"text",
              text:String(text || "")
            }
          ],
          notificationDisabled:false
        })
      }
    );

  if (!response.ok) {
    const detail =
      await response.text();

    throw new Error(
      `LINE送信エラー HTTP ${response.status}` +
      (detail
        ? `: ${detail.slice(0, 400)}`
        : "")
    );
  }

  return true;
}

function buildLineSBetMessage(pick) {
  const main =
    Array.isArray(pick.main6)
      ? pick.main6
          .slice(0, 6)
          .map(
            (bet, index) =>
              `${index + 1}. ${bet.combination}` +
              (bet.odds != null
                ? `（${bet.odds}倍）`
                : "")
          )
          .join("\n")
      : "-";

  const holes =
    Array.isArray(pick.holes) &&
    pick.holes.length
      ? pick.holes
          .slice(0, 3)
          .map(
            bet =>
              `${bet.combination}` +
              (bet.odds != null
                ? `（${bet.odds}倍）`
                : "")
          )
          .join(" / ")
      : "なし";

  const share =
    pick.firstShare == null
      ? "-"
      : `${(Number(pick.firstShare) * 100).toFixed(1)}%`;

  const top6 =
    pick.top6Probability == null
      ? "-"
      : `${(Number(pick.top6Probability) * 100).toFixed(1)}%`;

  return `🐰🚤 うさLAB｜競艇AI予想

🔥 S勝負が出ました
${pick.venue} ${pick.rno}R
締切：${pick.deadline || "-"}
信頼度：${pick.stars || "-"}
Sスコア：${pick.stableScore == null ? "-" : Number(pick.stableScore).toFixed(1)}
1着推定力：${share}
上位6点確率：${top6}
戦略：${pick.strategy || "-"}

【本線6点】
${main}

【穴候補】
${holes}

S勝負一覧
https://aged-hill-9a89.kono032424.workers.dev/api/s-picks-view

※的中や利益を保証するものではありません。`;
}

async function saveLineNotificationState(
  env,
  pick,
  status,
  message,
  errorText = null
) {
  await ensureLineNotificationTable(
    env
  );

  await env.DB
    .prepare(`
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
    `)
    .bind(
      pick.raceKey,
      pick.raceDate,
      pick.jcd || null,
      pick.venue || null,
      Number(pick.rno) || null,
      status,
      status === "SENT"
        ? nowJST()
        : null,
      errorText,
      message || null
    )
    .run();
}

async function getLineNotificationState(
  env,
  raceKey
) {
  await ensureLineNotificationTable(
    env
  );

  return await env.DB
    .prepare(`
      SELECT
        race_key,
        status,
        sent_at,
        error_text,
        updated_at
      FROM line_notifications
      WHERE race_key = ?
      LIMIT 1
    `)
    .bind(raceKey)
    .first();
}

async function listLineNotificationStates(
  env,
  raceDate
) {
  await ensureLineNotificationTable(
    env
  );

  const result =
    await env.DB
      .prepare(`
        SELECT
          race_key,
          status,
          sent_at,
          error_text,
          updated_at
        FROM line_notifications
        WHERE race_date = ?
      `)
      .bind(
        raceDate
      )
      .all();

  return new Map(
    (result.results || [])
      .map(
        row => [
          row.race_key,
          row
        ]
      )
  );
}

async function runLineNotifications(
  env,
  raceDate = todayJST()
) {
  await ensureLineNotificationTable(
    env
  );

  if (!lineNotificationConfigured(env)) {
    return {
      ok:false,
      configured:false,
      candidates:0,
      sent:0,
      skipped:0,
      failed:0,
      expired:0,
      results:[],
      error:
        "LINEのシークレットが未設定です"
    };
  }

  /*
    V6.5.4:
    「今回のCronで新しく分析したレース」ではなく、
    D1に保存済みの当日S勝負を毎回すべて確認する。
    これにより、先にD1へ保存されたレースや
    13件目以降のS勝負も通知対象になる。
  */
  const picks =
    await listSBetPredictions(
      env,
      raceDate
    );

  const stateMap =
    await listLineNotificationStates(
      env,
      raceDate
    );

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let expired = 0;
  const results = [];
  const now = Date.now();

  for (
    const pick of picks
  ) {
    const existing =
      stateMap.get(
        pick.raceKey
      );

    if (
      existing?.status === "SENT" ||
      existing?.status === "EXPIRED"
    ) {
      skipped++;
      continue;
    }

    if (pick.deadlineJST) {
      const deadlineMs =
        new Date(
          pick.deadlineJST
        ).getTime();

      if (
        Number.isFinite(deadlineMs) &&
        now >= deadlineMs
      ) {
        const message =
          buildLineSBetMessage(
            pick
          );

        await saveLineNotificationState(
          env,
          pick,
          "EXPIRED",
          message,
          "締切後のため通知しませんでした"
        );

        stateMap.set(
          pick.raceKey,
          {
            race_key:pick.raceKey,
            status:"EXPIRED"
          }
        );

        expired++;
        skipped++;
        results.push({
          raceKey:pick.raceKey,
          venue:pick.venue,
          rno:pick.rno,
          status:"EXPIRED"
        });
        continue;
      }
    }

    const message =
      buildLineSBetMessage(
        pick
      );

    try {
      await sendLinePush(
        env,
        message
      );

      await saveLineNotificationState(
        env,
        pick,
        "SENT",
        message,
        null
      );

      stateMap.set(
        pick.raceKey,
        {
          race_key:pick.raceKey,
          status:"SENT"
        }
      );

      sent++;
      results.push({
        raceKey:pick.raceKey,
        venue:pick.venue,
        rno:pick.rno,
        status:"SENT"
      });

    } catch (error) {
      failed++;

      const errorText =
        error?.message ||
        String(error);

      await saveLineNotificationState(
        env,
        pick,
        "ERROR",
        message,
        errorText
      );

      stateMap.set(
        pick.raceKey,
        {
          race_key:pick.raceKey,
          status:"ERROR",
          error_text:errorText
        }
      );

      results.push({
        raceKey:pick.raceKey,
        venue:pick.venue,
        rno:pick.rno,
        status:"ERROR",
        error:errorText
      });
    }
  }

  return {
    ok:
      failed === 0,
    configured:true,
    candidates:
      picks.length,
    sent,
    skipped,
    failed,
    expired,
    results
  };
}

function compactLineNotification(result) {
  if (!result) {
    return null;
  }

  return {
    configured:
      Boolean(result.configured),
    candidates:
      Number(result.candidates || 0),
    sent:
      Number(result.sent || 0),
    skipped:
      Number(result.skipped || 0),
    failed:
      Number(result.failed || 0),
    expired:
      Number(result.expired || 0),
    errors:
      Array.isArray(result.results)
        ? result.results
            .filter(
              item =>
                item.status === "ERROR"
            )
            .slice(0, 5)
        : []
  };
}

async function runScheduledAutomation(
  env,
  event = null
) {
  const startedAt =
    nowJST();

  const hd =
    todayJST();

  console.log(
    "USA_LAB_CRON_START",
    JSON.stringify({
      workerVersion:
        WORKER_VERSION,
      aiVersion:
        AI_VERSION,
      hd,
      startedAt,
      cron:
        event?.cron ||
        "manual"
    })
  );

  const tasks =
    await Promise.allSettled([
      runAutoWindow(
        env,
        {
          hd
        }
      ),

      runResultUpdates(
        env
      )
    ]);

  const autoTask =
    tasks[0];

  const resultTask =
    tasks[1];

  const auto =
    autoTask.status ===
    "fulfilled"
      ? compactAutoResult(
          autoTask.value
        )
      : null;

  const resultUpdate =
    resultTask.status ===
    "fulfilled"
      ? compactResultUpdate(
          resultTask.value
        )
      : null;

  const errors = [];

  if (
    autoTask.status ===
    "rejected"
  ) {
    errors.push(
      `AUTO: ${autoTask.reason?.message || String(autoTask.reason)}`
    );
  }

  if (
    resultTask.status ===
    "rejected"
  ) {
    errors.push(
      `RESULT: ${resultTask.reason?.message || String(resultTask.reason)}`
    );
  }

  let lineNotify =
    null;

  try {
    lineNotify =
      compactLineNotification(
        await runLineNotifications(
          env,
          hd
        )
      );

  } catch (error) {
    const lineError =
      error?.message ||
      String(error);

    errors.push(
      `LINE: ${lineError}`
    );

    lineNotify = {
      configured:
        lineNotificationConfigured(env),
      candidates:0,
      sent:0,
      skipped:0,
      failed:1,
      errors:[
        {
          error:lineError
        }
      ]
    };
  }

  const finishedAt =
    nowJST();

  const hasWarnings =
    Number(
      auto?.retryCount ||
      0
    ) > 0
    ||
    Number(
      resultUpdate
        ?.errors
        ?.length ||
      0
    ) > 0
    ||
    Number(
      lineNotify
        ?.failed ||
      0
    ) > 0;

  const summary = {
    workerVersion:
      WORKER_VERSION,
    aiVersion:
      AI_VERSION,
    hd,
    startedAt,
    finishedAt,
    status:
      errors.length
        ? "PARTIAL_ERROR"
        : hasWarnings
          ? "WARN"
          : "OK",
    auto,
    resultUpdate,
    lineNotify,
    error:
      errors.length
        ? errors.join(
            " | "
          )
        : null
  };

  try {
    await saveAutomationRun(
      env,
      summary
    );
  } catch (error) {
    console.error(
      "USA_LAB_AUTOMATION_LOG_SAVE_ERROR",
      error?.message ||
      String(error)
    );
  }

  console.log(
    "USA_LAB_CRON_RESULT",
    JSON.stringify(
      summary
    )
  );

  return summary;
}

async function automationStatus(env) {
  await ensureAutomationTables(
    env
  );

  const latest =
    await env.DB
      .prepare(`
        SELECT
          id,
          started_at,
          finished_at,
          status,
          race_date,
          auto_target_count,
          auto_analyzed_count,
          auto_retry_count,
          result_pending_count,
          result_checked_count,
          result_finished_count,
          error_text,
          created_at
        FROM automation_runs
        ORDER BY id DESC
        LIMIT 1
      `)
      .first();

  const recentResult =
    await env.DB
      .prepare(`
        SELECT
          id,
          started_at,
          finished_at,
          status,
          race_date,
          auto_target_count,
          auto_analyzed_count,
          auto_retry_count,
          result_pending_count,
          result_checked_count,
          result_finished_count,
          error_text,
          created_at
        FROM automation_runs
        ORDER BY id DESC
        LIMIT 10
      `)
      .all();

  const pending =
    await env.DB
      .prepare(`
        SELECT COUNT(*) AS count
        FROM learning_races
        WHERE finished = 0
      `)
      .first();

  await ensureLineNotificationTable(
    env
  );

  const lineLatest =
    await env.DB
      .prepare(`
        SELECT
          race_key,
          race_date,
          venue,
          rno,
          status,
          sent_at,
          error_text,
          updated_at
        FROM line_notifications
        ORDER BY updated_at DESC
        LIMIT 1
      `)
      .first();

  const lineToday =
    await env.DB
      .prepare(`
        SELECT
          SUM(CASE WHEN status='SENT' THEN 1 ELSE 0 END) AS sent_count,
          SUM(CASE WHEN status='ERROR' THEN 1 ELSE 0 END) AS error_count
        FROM line_notifications
        WHERE race_date = ?
      `)
      .bind(
        todayJST()
      )
      .first();

  return {
    workerVersion:
      WORKER_VERSION,
    aiVersion:
      AI_VERSION,
    cron:
      "*/5 * * * *",
    autoWindow:
      `${AUTO_MIN_MINUTES}-${AUTO_MAX_MINUTES}min`,
    latest:
      latest ||
      null,
    recent:
      recentResult.results ||
      [],
    pendingLearningRaces:
      Number(
        pending?.count ||
        0
      ),
    lineNotification:{
      configured:
        lineNotificationConfigured(env),
      todaySent:
        Number(
          lineToday?.sent_count ||
          0
        ),
      todayErrors:
        Number(
          lineToday?.error_count ||
          0
        ),
      latest:
        lineLatest ||
        null
    },
    storage:
      await storageStats(
        env
      )
  };
}


/* =========================
   S勝負ダッシュボード
   V6.5.1
========================= */

async function listSBetPredictions(
  env,
  raceDate
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
          prediction_json,
          note_title,
          note_body,
          posted,
          updated_at

        FROM predictions

        WHERE race_date = ?
          AND confidence = 'S'
          AND decision = 'BET'

        ORDER BY
          CASE
            WHEN deadline_jst IS NULL THEN 1
            ELSE 0
          END ASC,
          deadline_jst ASC,
          rno ASC
      `)
      .bind(
        raceDate
      )
      .all();

  return (
    result.results || []
  ).map(
    row => {
      const snapshot =
        parseJsonSafe(
          row.prediction_json,
          {}
        ) || {};

      const main6 =
        Array.isArray(
          snapshot.bets
        )
          ? snapshot.bets
              .slice(0, 6)
              .map(
                bet => ({
                  combination:
                    bet.combination,

                  totalScore:
                    bet.totalScore ?? null,

                  odds:
                    bet.odds ?? null,

                  probability:
                    bet.probability ?? null
                })
              )
          : [];

      const holes =
        Array.isArray(
          snapshot.holeBets
        )
          ? snapshot.holeBets
              .slice(0, 5)
              .map(
                bet => ({
                  combination:
                    bet.combination,

                  odds:
                    bet.odds ?? null,

                  holeScore:
                    bet.holeScore ?? null,

                  tier:
                    bet.tier?.label || null
                })
              )
          : [];

      return {
        raceKey:
          row.race_key,

        raceDate:
          row.race_date,

        jcd:
          row.jcd,

        venue:
          row.venue,

        rno:
          Number(
            row.rno
          ),

        deadline:
          row.deadline,

        deadlineJST:
          row.deadline_jst,

        analyzedAt:
          row.analyzed_at,

        confidence:
          row.confidence,

        decision:
          row.decision,

        stableScore:
          row.stable_score,

        strategy:
          row.strategy,

        stars:
          confidenceStars(
            snapshot
          ),

        firstShare:
          snapshot.sDecision
            ?.metrics
            ?.firstShare ?? null,

        top6Probability:
          snapshot.sDecision
            ?.metrics
            ?.top6Probability ?? null,

        firstGap:
          snapshot.sDecision
            ?.metrics
            ?.firstGap ?? null,

        main6,
        holes,

        result:
          snapshot.result || null,

        resultCheck:
          snapshot.resultCheck || null,

        noteTitle:
          row.note_title || null,

        noteBody:
          row.note_body || null,

        posted:
          Boolean(
            row.posted
          ),

        updatedAt:
          row.updated_at
      };
    }
  );
}


/* =========================================================
   V6.5.4 D1自動成績集計
   - ブラウザlocalStorageではなくD1を正本にする
   - 自動分析したS/A/Bの結果確定レースを集計
   - 本線6点 / 上位15点 / 穴候補 / S勝負 / ★★★★★
========================================================= */

function blankPerformanceBucket() {
  return {
    races:0,
    main6Hits:0,
    main15Hits:0,
    holeHits:0,
    candidateHits:0,
    sBetRaces:0,
    sBetMain6Hits:0,
    sBetCandidateHits:0,
    fiveStarRaces:0,
    fiveStarMain6Hits:0,
    fiveStarCandidateHits:0
  };
}

function performanceRate(
  hits,
  races
) {
  return races > 0
    ? hits / races * 100
    : 0;
}

function finalizePerformanceBucket(
  bucket
) {
  return {
    ...bucket,

    main6HitRate:
      performanceRate(
        bucket.main6Hits,
        bucket.races
      ),

    main15HitRate:
      performanceRate(
        bucket.main15Hits,
        bucket.races
      ),

    holeHitRate:
      performanceRate(
        bucket.holeHits,
        bucket.races
      ),

    candidateHitRate:
      performanceRate(
        bucket.candidateHits,
        bucket.races
      ),

    sBetMain6HitRate:
      performanceRate(
        bucket.sBetMain6Hits,
        bucket.sBetRaces
      ),

    sBetCandidateHitRate:
      performanceRate(
        bucket.sBetCandidateHits,
        bucket.sBetRaces
      ),

    fiveStarMain6HitRate:
      performanceRate(
        bucket.fiveStarMain6Hits,
        bucket.fiveStarRaces
      ),

    fiveStarCandidateHitRate:
      performanceRate(
        bucket.fiveStarCandidateHits,
        bucket.fiveStarRaces
      )
  };
}

function addPerformanceResult(
  bucket,
  snapshot,
  result
) {
  const combination =
    result?.combination ||
    (
      Array.isArray(
        result?.winningLanes
      ) &&
      result.winningLanes.length >= 3
        ? result.winningLanes
            .slice(0, 3)
            .join("-")
        : null
    );

  const main15 =
    Array.isArray(
      snapshot?.bets
    )
      ? snapshot.bets
      : [];

  if (
    !combination ||
    !main15.length
  ) {
    return false;
  }

  const main6 =
    main15.slice(
      0,
      6
    );

  const holes =
    Array.isArray(
      snapshot?.holeBets
    )
      ? snapshot.holeBets
      : [];

  const main6Hit =
    main6.some(
      bet =>
        bet?.combination ===
        combination
    );

  const main15Hit =
    main15.some(
      bet =>
        bet?.combination ===
        combination
    );

  const holeHit =
    holes.some(
      bet =>
        bet?.combination ===
        combination
    );

  const candidateHit =
    main6Hit ||
    holeHit;

  const isSBet =
    snapshot?.confidence === "S" &&
    snapshot?.sDecision?.status === "BET";

  const isFiveStar =
    isSBet &&
    Number(
      snapshot?.sDecision?.score ||
      0
    ) >= 80;

  bucket.races++;

  if (main6Hit) {
    bucket.main6Hits++;
  }

  if (main15Hit) {
    bucket.main15Hits++;
  }

  if (holeHit) {
    bucket.holeHits++;
  }

  if (candidateHit) {
    bucket.candidateHits++;
  }

  if (isSBet) {
    bucket.sBetRaces++;

    if (main6Hit) {
      bucket.sBetMain6Hits++;
    }

    if (candidateHit) {
      bucket.sBetCandidateHits++;
    }
  }

  if (isFiveStar) {
    bucket.fiveStarRaces++;

    if (main6Hit) {
      bucket.fiveStarMain6Hits++;
    }

    if (candidateHit) {
      bucket.fiveStarCandidateHits++;
    }
  }

  return true;
}

async function performanceOverview(env) {
  const result =
    await env.DB
      .prepare(`
        SELECT
          race_key,
          race_date,
          jcd,
          venue,
          rno,
          race_data_json,
          result_json
        FROM learning_races
        WHERE finished = 1
          AND race_data_json IS NOT NULL
          AND result_json IS NOT NULL
        ORDER BY race_date DESC, rno DESC
        LIMIT 5000
      `)
      .all();

  const today =
    todayJST();

  const sevenDayStart =
    jstDateKeyOffset(-6);

  const allBucket =
    blankPerformanceBucket();

  const sevenBucket =
    blankPerformanceBucket();

  const todayBucket =
    blankPerformanceBucket();

  let skipped = 0;

  for (
    const row of
    result.results || []
  ) {
    const snapshot =
      parseJsonSafe(
        row.race_data_json,
        null
      );

    const raceResult =
      parseJsonSafe(
        row.result_json,
        null
      );

    const date =
      String(
        row.race_date ||
        ""
      );

    if (
      !snapshot ||
      !raceResult ||
      !Array.isArray(
        snapshot.bets
      ) ||
      !snapshot.bets.length
    ) {
      skipped++;
      continue;
    }

    const counted =
      addPerformanceResult(
        allBucket,
        snapshot,
        raceResult
      );

    if (!counted) {
      skipped++;
      continue;
    }

    if (
      date >= sevenDayStart &&
      date <= today
    ) {
      addPerformanceResult(
        sevenBucket,
        snapshot,
        raceResult
      );
    }

    if (
      date === today
    ) {
      addPerformanceResult(
        todayBucket,
        snapshot,
        raceResult
      );
    }
  }

  return {
    generatedAt:
      nowJST(),
    todayDate:
      today,
    sevenDayStart,
    today:
      finalizePerformanceBucket(
        todayBucket
      ),
    last7Days:
      finalizePerformanceBucket(
        sevenBucket
      ),
    all:
      finalizePerformanceBucket(
        allBucket
      ),
    skippedWithoutPrediction:
      skipped,
    note:
      "回収率は購入金額データを自動予想に保存していないため集計対象外です"
  };
}

function sPicksDashboardHtml() {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#8d72c7">
<title>うさLAB｜S勝負一覧</title>
<style>
  :root{
    color-scheme:light;
    --bg:#f7f3ff;
    --card:#ffffff;
    --ink:#2f2840;
    --muted:#766f85;
    --line:#e7def5;
    --accent:#8d72c7;
    --accent2:#efe7ff;
    --hot:#f25772;
    --ok:#2d9c6d;
    --warn:#b98224;
  }
  *{box-sizing:border-box}
  body{
    margin:0;
    font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue","Hiragino Sans","Yu Gothic",sans-serif;
    background:linear-gradient(180deg,#f4eeff 0,#fbf9ff 45%,#f7f3ff 100%);
    color:var(--ink);
  }
  .wrap{max-width:760px;margin:0 auto;padding:18px 14px 48px}
  .hero{
    background:rgba(255,255,255,.88);
    border:1px solid var(--line);
    border-radius:24px;
    padding:18px;
    box-shadow:0 8px 30px rgba(71,46,113,.08);
  }
  h1{font-size:24px;margin:0 0 6px}
  .sub{font-size:13px;color:var(--muted);line-height:1.6}
  .controls{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
  input,button{
    appearance:none;
    border-radius:12px;
    border:1px solid var(--line);
    font:inherit;
  }
  input{background:#fff;padding:11px 12px;min-width:0;flex:1}
  button{padding:11px 14px;background:var(--accent);color:#fff;font-weight:700;border-color:var(--accent);cursor:pointer}
  button.secondary{background:#fff;color:var(--accent)}
  .status{margin:14px 2px 0;font-size:13px;color:var(--muted)}
  .summary{display:flex;gap:10px;margin:14px 0;flex-wrap:wrap}
  .pill{background:#fff;border:1px solid var(--line);border-radius:999px;padding:8px 11px;font-size:13px}
  .performance{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}
  .perfCard{background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px;box-shadow:0 6px 18px rgba(71,46,113,.05)}
  .perfCard h3{font-size:14px;margin:0 0 8px}
  .perfBig{font-size:20px;font-weight:900;color:var(--accent)}
  .perfRow{display:flex;justify-content:space-between;gap:8px;margin-top:5px;font-size:12px;color:var(--muted)}
  .perfRow b{color:var(--ink)}
  .perfNote{grid-column:1/-1;font-size:11px;color:var(--muted);padding:0 2px}
  .grid{display:grid;gap:14px}
  .card{
    background:var(--card);
    border:1px solid var(--line);
    border-radius:20px;
    overflow:hidden;
    box-shadow:0 8px 24px rgba(71,46,113,.06);
  }
  .cardHead{padding:15px 16px 12px;background:linear-gradient(135deg,#fff,#faf6ff);border-bottom:1px solid var(--line)}
  .raceLine{display:flex;align-items:center;justify-content:space-between;gap:10px}
  .race{font-size:21px;font-weight:800}
  .badge{font-size:13px;font-weight:800;color:#fff;background:var(--hot);border-radius:999px;padding:7px 10px;white-space:nowrap}
  .meta{margin-top:7px;color:var(--muted);font-size:13px;display:flex;gap:10px;flex-wrap:wrap}
  .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px 16px}
  .metric{background:var(--accent2);border-radius:12px;padding:10px;text-align:center}
  .metric b{display:block;font-size:17px;margin-top:2px}
  .label{font-size:11px;color:var(--muted)}
  .section{padding:4px 16px 14px}
  .section h3{font-size:14px;margin:10px 0 8px}
  .bets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
  .bet{border:1px solid var(--line);border-radius:11px;padding:9px 10px;background:#fff;font-weight:800}
  .bet small{display:block;color:var(--muted);font-weight:500;margin-top:3px}
  .holes{display:flex;gap:7px;flex-wrap:wrap}
  .hole{background:#fff6ed;border:1px solid #f5dcc3;border-radius:999px;padding:7px 9px;font-size:12px}
  .result{margin:0 16px 14px;border-radius:12px;padding:10px 12px;font-weight:700}
  .result.hit{background:#eaf8f1;color:var(--ok)}
  .result.miss{background:#fff1f3;color:#c14d62}
  .actions{display:flex;gap:8px;padding:0 16px 16px}
  .actions button{flex:1;padding:10px 9px;font-size:13px}
  .empty{background:#fff;border:1px dashed var(--line);border-radius:18px;padding:32px 16px;text-align:center;color:var(--muted)}
  .error{color:#b4364c}
  @media(max-width:520px){
    .metrics{grid-template-columns:repeat(3,1fr);padding-left:12px;padding-right:12px}
    .bets{grid-template-columns:1fr 1fr}
    .metric{padding:9px 5px}
    .metric b{font-size:15px}
    .performance{grid-template-columns:1fr}
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <h1>🐰🚤 うさLAB｜S勝負一覧</h1>
    <div class="sub">今日の「🔥 S勝負」だけを自動表示。1分ごとに更新します。予想内容は認証後だけ表示されます。</div>
    <div class="controls">
      <input id="token" type="password" placeholder="D1_WRITE_TOKEN">
      <button id="save">認証して表示</button>
      <button id="refresh" class="secondary">更新</button>
      <button id="lineTest" class="secondary">LINEテスト</button>
    </div>
    <div id="status" class="status">読み込み待ち</div>
  </div>

  <div id="performance" class="performance"></div>
  <div id="summary" class="summary"></div>
  <div id="list" class="grid"></div>
</div>

<script>
(function(){
  var TOKEN_KEY = "usa_lab_d1_token";
  var tokenInput = document.getElementById("token");
  var list = document.getElementById("list");
  var status = document.getElementById("status");
  var summary = document.getElementById("summary");
  var performance = document.getElementById("performance");

  function esc(v){
    return String(v == null ? "" : v)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/\"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

  function pct(v){
    if(v == null || !isFinite(Number(v))) return "-";
    return (Number(v) * 100).toFixed(1) + "%";
  }

  function fmtScore(v){
    if(v == null || !isFinite(Number(v))) return "-";
    return Number(v).toFixed(1);
  }

  function todayKey(){
    var parts = new Intl.DateTimeFormat("ja-JP",{
      timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"
    }).format(new Date()).split("/");
    return parts.join("");
  }

  function copyText(text){
    if(!text) return;
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){
        status.textContent = "コピーしました";
      });
    }
  }

  function rateText(v){
    if(v == null || !isFinite(Number(v))) return "-";
    return Number(v).toFixed(1) + "%";
  }

  function renderPerformance(data){
    if(!data){
      performance.innerHTML = '<div class="perfNote">成績データを取得できませんでした。</div>';
      return;
    }

    var groups = [
      ['今日', data.today],
      ['過去7日', data.last7Days],
      ['全期間', data.all]
    ];

    performance.innerHTML = groups.map(function(item){
      var label = item[0];
      var s = item[1] || {};
      var races = Number(s.races || 0);
      var main6 = Number(s.main6Hits || 0);
      var candidate = Number(s.candidateHits || 0);
      var sRaces = Number(s.sBetRaces || 0);
      var sHits = Number(s.sBetMain6Hits || 0);
      var fiveRaces = Number(s.fiveStarRaces || 0);
      var fiveHits = Number(s.fiveStarMain6Hits || 0);

      return '<div class="perfCard">' +
        '<h3>📊 ' + esc(label) + '</h3>' +
        '<div class="perfBig">' + races + 'R</div>' +
        '<div class="perfRow"><span>本線6点</span><b>' + main6 + '/' + races + '（' + rateText(s.main6HitRate) + '）</b></div>' +
        '<div class="perfRow"><span>本線6点＋穴</span><b>' + candidate + '/' + races + '（' + rateText(s.candidateHitRate) + '）</b></div>' +
        '<div class="perfRow"><span>🔥S勝負 本線6点</span><b>' + sHits + '/' + sRaces + '（' + rateText(s.sBetMain6HitRate) + '）</b></div>' +
        '<div class="perfRow"><span>★★★★★ 本線6点</span><b>' + fiveHits + '/' + fiveRaces + '（' + rateText(s.fiveStarMain6HitRate) + '）</b></div>' +
      '</div>';
    }).join('') +
      '<div class="perfNote">※自動分析→D1保存→結果取得済みのレースだけを集計。回収率は実購入額を保存していないため表示していません。</div>';
  }

  function render(data){
    var picks = data.picks || [];
    summary.innerHTML =
      '<span class="pill">🔥 S勝負 <b>' + picks.length + 'R</b></span>' +
      '<span class="pill">更新 ' + esc(new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})) + '</span>';

    if(!picks.length){
      list.innerHTML = '<div class="empty">現在、今日の🔥 S勝負はありません。</div>';
      return;
    }

    list.innerHTML = picks.map(function(p){
      var main = (p.main6 || []).map(function(b,i){
        return '<div class="bet">' + (i+1) + '. ' + esc(b.combination) +
          '<small>AI ' + esc(fmtScore(b.totalScore)) + ' / ' + esc(b.odds == null ? '-' : b.odds + '倍') + '</small></div>';
      }).join('');

      var holes = (p.holes || []).map(function(b){
        return '<span class="hole">' + esc(b.tier || '穴') + ' ' + esc(b.combination) +
          ' / ' + esc(b.odds == null ? '-' : b.odds + '倍') + '</span>';
      }).join('');

      var result = '';
      if(p.resultCheck){
        var rc = p.resultCheck || {};
        var candidateHit = !!rc.main6Hit || !!rc.holeHit;
        var label = rc.main6Hit
          ? '✅ 本線6点的中'
          : rc.holeHit
            ? '✅ 穴候補的中'
            : rc.main15Hit
              ? '参考：上位15点内'
              : '❌ 本線6点・穴候補外';
        result = '<div class="result ' + (candidateHit ? 'hit' : 'miss') + '">' +
          label + '：' + esc(rc.combination || '-') +
          (rc.payout != null ? ' / ' + esc(rc.payout) + '円' : '') + '</div>';
      }

      var picksText = (p.venue || '') + ' ' + p.rno + 'R\\n' +
        (p.main6 || []).map(function(b){ return b.combination; }).join('\\n');

      return '<article class="card">' +
        '<div class="cardHead">' +
          '<div class="raceLine"><div class="race">' + esc(p.venue) + ' ' + esc(p.rno) + 'R</div>' +
          '<div class="badge">🔥 S勝負 ' + esc(p.stars || '') + '</div></div>' +
          '<div class="meta"><span>締切 ' + esc(p.deadline || '-') + '</span><span>' + esc(p.strategy || '-') + '</span><span>Sスコア ' + esc(fmtScore(p.stableScore)) + '</span></div>' +
        '</div>' +
        '<div class="metrics">' +
          '<div class="metric"><span class="label">1着推定力</span><b>' + esc(pct(p.firstShare)) + '</b></div>' +
          '<div class="metric"><span class="label">上位6点確率</span><b>' + esc(pct(p.top6Probability)) + '</b></div>' +
          '<div class="metric"><span class="label">1着点差</span><b>' + esc(fmtScore(p.firstGap)) + '</b></div>' +
        '</div>' +
        '<div class="section"><h3>本線6点</h3><div class="bets">' + main + '</div></div>' +
        (holes ? '<div class="section"><h3>穴候補</h3><div class="holes">' + holes + '</div></div>' : '') +
        result +
        '<div class="actions">' +
          '<button class="secondary" data-copy-picks="' + esc(picksText) + '">買い目コピー</button>' +
          '<button data-copy-note="' + esc(p.noteBody || '') + '">note文章コピー</button>' +
        '</div>' +
      '</article>';
    }).join('');

    Array.prototype.forEach.call(document.querySelectorAll('[data-copy-picks]'),function(btn){
      btn.addEventListener('click',function(){ copyText(btn.getAttribute('data-copy-picks')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-copy-note]'),function(btn){
      btn.addEventListener('click',function(){ copyText(btn.getAttribute('data-copy-note')); });
    });
  }

  async function load(){
    var token = tokenInput.value.trim() || localStorage.getItem(TOKEN_KEY) || '';
    if(!token){
      status.textContent = 'トークンを入力してください';
      list.innerHTML = '<div class="empty">認証後にS勝負を表示します。</div>';
      return;
    }

    status.textContent = '読み込み中…';

    try{
      var response = await fetch('/api/s-picks?date=' + encodeURIComponent(todayKey()),{
        headers:{'Authorization':'Bearer ' + token},
        cache:'no-store'
      });
      var data = await response.json();
      if(!response.ok || !data.ok){
        throw new Error(data.error || '取得に失敗しました');
      }
      localStorage.setItem(TOKEN_KEY,token);
      status.textContent = '自動更新中・最終取得 ' + new Date().toLocaleTimeString('ja-JP');
      render(data);

      try{
        var statsResponse = await fetch('/api/performance-stats',{
          headers:{'Authorization':'Bearer ' + token},
          cache:'no-store'
        });
        var statsData = await statsResponse.json();
        if(statsResponse.ok && statsData.ok){
          renderPerformance(statsData.performance);
        }else{
          renderPerformance(null);
        }
      }catch(statsError){
        renderPerformance(null);
      }
    }catch(e){
      status.innerHTML = '<span class="error">' + esc(e.message || String(e)) + '</span>';
    }
  }

  async function lineTest(){
    var token = (tokenInput.value || '').trim();
    if(!token){
      status.innerHTML = '<span class="error">D1_WRITE_TOKENを入力してください</span>';
      return;
    }
    status.textContent = 'LINEテスト送信中...';
    try{
      var response = await fetch('/api/line-test',{
        method:'POST',
        headers:{
          'authorization':'Bearer ' + token,
          'content-type':'application/json'
        }
      });
      var data = await response.json();
      if(!response.ok || !data.ok){
        throw new Error(data.error || 'LINEテスト送信に失敗しました');
      }
      localStorage.setItem(TOKEN_KEY,token);
      status.textContent = '✅ LINEテスト通知を送信しました';
    }catch(e){
      status.innerHTML = '<span class="error">' + esc(e.message || String(e)) + '</span>';
    }
  }

  document.getElementById('save').addEventListener('click',load);
  document.getElementById('refresh').addEventListener('click',load);
  document.getElementById('lineTest').addEventListener('click',lineTest);
  tokenInput.value = localStorage.getItem(TOKEN_KEY) || '';
  load();
  setInterval(load,60000);
})();
</script>
</body>
</html>`;
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
            true,

          resultAutomation:
            true,

          automationLogs:
            true,

          sPicksDashboard:
            true,

          lineNotification:
            true,

          lineNotificationConfigured:
            lineNotificationConfigured(env),

          lineNotificationBackfill:
            true,

          d1PerformanceStats:
            true
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


      /* ===== AUTOMATION STATUS ===== */

      if (
        url.pathname ===
        "/api/automation-status"
      ) {
        return json({
          ok:true,

          ...(
            await automationStatus(
              env
            )
          )
        });
      }



      /* ===== V6.5.4 自動成績 API ===== */

      if (
        url.pathname ===
        "/api/performance-stats"
      ) {
        const authError =
          checkPrivateAccess(
            request,
            env
          );

        if (authError) {
          return authError;
        }

        return json({
          ok:true,
          performance:
            await performanceOverview(
              env
            )
        });
      }


      /* ===== S勝負 API ===== */

      if (
        url.pathname ===
        "/api/s-picks"
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

        const raceDate =
          url.searchParams.get(
            "date"
          ) ||
          todayJST();

        if (
          !/^\d{8}$/.test(
            String(
              raceDate
            )
          )
        ) {
          return json(
            {
              ok:false,
              error:
                "dateはYYYYMMDDで指定してください"
            },
            400
          );
        }

        const picks =
          await listSBetPredictions(
            env,
            raceDate
          );

        return json({
          ok:true,
          raceDate,
          count:
            picks.length,
          picks
        });
      }

      /* ===== S勝負 画面 ===== */

      if (
        url.pathname ===
        "/api/s-picks-view"
      ) {
        return new Response(
          sPicksDashboardHtml(),
          {
            status:200,
            headers:{
              "content-type":
                "text/html; charset=utf-8",
              "cache-control":
                "no-store"
            }
          }
        );
      }

      /* ===== LINE テスト通知 ===== */

      if (
        url.pathname ===
        "/api/line-test"
      ) {
        const authError =
          checkPrivateAccess(
            request,
            env
          );

        if (authError) {
          return authError;
        }

        if (
          !lineNotificationConfigured(
            env
          )
        ) {
          return json(
            {
              ok:false,
              configured:false,
              error:
                "LINEのシークレットが未設定です"
            },
            503
          );
        }

        await sendLinePush(
          env,
          `🐰🚤 うさLAB｜競艇AI予想\n\n✅ LINE通知テスト成功\n\nCloudflareからLINEへ正常に通知できています。\n時刻：${nowJST()}`
        );

        return json({
          ok:true,
          configured:true,
          message:
            "LINEテスト通知を送信しました"
        });
      }

      /* ===== LINE S勝負通知を手動実行 ===== */

      if (
        url.pathname ===
        "/api/line-notify-run"
      ) {
        const authError =
          checkPrivateAccess(
            request,
            env
          );

        if (authError) {
          return authError;
        }

        return json({
          ok:true,
          ...(
            await runLineNotifications(
              env,
              todayJST()
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
         RESULT UPDATE
         認証あり・結果更新のみ
      ===================== */

      if (
        url.pathname ===
        "/api/result-update"
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

        return json({
          ok:true,

          ...(
            await runResultUpdates(
              env
            )
          )
        });
      }

      /* =====================
         AUTOMATION RUN
         認証あり・予想＋結果更新
      ===================== */

      if (
        url.pathname ===
        "/api/automation-run"
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

        return json({
          ok:true,

          ...(
            await runScheduledAutomation(
              env,
              null
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
      );    }
  },

  async scheduled(
    event,
    env,
    ctx
  ) {
    ctx.waitUntil(
      runScheduledAutomation(
        env,
        event
      )
    );
  }
};
