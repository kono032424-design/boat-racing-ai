const OFFICIAL = "https://www.boatrace.jp";

const WORKER_VERSION = "6.6.45";
const AI_VERSION = "6.7.6";

const AUTO_MIN_MINUTES = 10;
const AUTO_MAX_MINUTES = 50;
const LINE_FINAL_MAX_MINUTES = 35;
// 0〜100 (%): Worker の MANSHU_NOTIFY_MIN_PERCENT で変更可能。
function manshuThreshold(env) {
  const n = Number(env.MANSHU_NOTIFY_MIN_PERCENT ?? 15);
  return Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 15;
}
function isManshuHigh(pick, env) {
  return Number.isFinite(pick.manshuProbability) &&
    pick.manshuProbability * 100 >= manshuThreshold(env);
}

/*
  LINE月間送信数を節約する運用モード
  - 早期通知OFF
  - S見送り通知OFF
  - S勝負の最終通知だけ送信
  - 日次集計は1日1回のまま
*/
const LINE_EARLY_NOTIFICATIONS_ENABLED = false;
const LINE_PASS_NOTIFICATIONS_ENABLED = true;
const LINE_DAILY_SUMMARY_ENABLED = false;

/*
  V6.6.6 サイトPush通知
  - S勝負の最終通知をWeb Pushでも送信
  - 1日終了時の集計完了もWeb Pushで通知
  - VAPID鍵はD1で自動生成・保存（追加Secret不要）
  - 通知本文に買い目そのものは載せず、タップでS評価一覧を開く
*/
const WEB_PUSH_S_BET_ENABLED = true;
const WEB_PUSH_DAILY_SUMMARY_ENABLED = false;
const WEB_PUSH_FINAL_MAX_MINUTES = 35;
const WEB_PUSH_CONTACT =
  "https://aged-hill-9a89.kono032424.workers.dev/";

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

  /*
    V6.6.3:
    BOAT RACE公式側のリンクで & が &amp; にHTMLエスケープされたり、
    hd=...&jcd=... のように jcd が2番目以降のクエリになる場合でも
    開催場コードを取りこぼさないようにする。

    旧版の /[?&]jcd=/ は、生HTML上で &amp;jcd= になった場合に
    マッチせず、開催場0件 → 自動対象0件になることがあった。
  */
  const decodedHtml =
    decodeHtml(html);

  const found = [
    ...decodedHtml.matchAll(
      /jcd=(\d{2})/gi
    )
  ].map(
    match =>
      match[1]
  );

  const unique = [
    ...new Set(found)
  ]
    .filter(
      jcd =>
        VENUE_NAMES[jcd]
    );

  if (
    unique.length === 0
  ) {
    throw new Error(
      `開催場取得0件: BOAT RACE公式ページのリンク解析に失敗した可能性があります hd=${hd}`
    );
  }

  return unique
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
  ) && n > 0
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

function selectPurposePicks(allBets) {
  const ranked=(allBets||[]).filter(b=>Number.isFinite(b.probability)&&b.probability>0&&Number.isFinite(b.odds)&&b.odds>0);
  const compact=b=>({combination:b.combination,probability:b.probability,odds:b.odds,ev:b.ev,totalScore:b.totalScore});
  const firstChance=new Map();
  for(const b of ranked){const first=String(b.combination).split('-')[0];firstChance.set(first,(firstChance.get(first)||0)+b.probability)}
  const [axis,axisChance]=[...firstChance].sort((a,b)=>b[1]-a[1])[0]||[null,0];
  const axisBets=ranked.filter(b=>String(b.combination).startsWith(axis+'-')).sort((a,b)=>b.probability-a.probability);
  const top3Chance=axisBets.slice(0,3).reduce((sum,b)=>sum+b.probability,0);
  const mainCount=axisChance>=.4&&top3Chance/axisChance>=.45?3:6;
  const hit=(axisChance>=.4?axisBets:ranked.slice().sort((a,b)=>b.probability-a.probability)).slice(0,mainCount);
  const selected=new Set(hit.map(b=>b.combination));
  // 穴は本線と別展開で選ぶ。軸の優位が非常に大きければ候補を見送る。
  const candidates=axisChance>=.75?[]:ranked.filter(b=>!selected.has(b.combination)&&b.odds>=30&&b.probability>=.001&&b.ev>=.6)
    .sort((a,b)=>(b.ev*Math.sqrt(b.probability))-(a.ev*Math.sqrt(a.probability))||b.probability-a.probability);
  const target=Math.min(16,Math.max(4,Math.ceil(candidates.length*.20)));
  const high=[],headCounts=new Map();
  for(const bet of candidates){const first=String(bet.combination).split('-')[0];if((headCounts.get(first)||0)>=Math.ceil(target/2))continue;high.push(bet);headCounts.set(first,(headCounts.get(first)||0)+1);if(high.length>=target)break}
  return {hit:hit.map(compact),balance:ranked.slice(0,6).map(compact),high:high.map(compact)};
}
function savedPurposeView(snapshot) {
  const stored=snapshot.purposePicks;
  const complete=Array.isArray(snapshot.allBetRanking)&&snapshot.allBetRanking.length===120&&snapshot.allBetRanking.every(b=>Number.isFinite(b.probability)&&Number.isFinite(b.odds));
  const derived=complete?selectPurposePicks(snapshot.allBetRanking):null;
  return Object.fromEntries(['hit','balance','high'].map(key=>{
    const original=Array.isArray(stored?.[key]);
    const bets=original?stored[key]:derived?.[key]??null;
    return [key,{source:original?'saved':derived?'derived':'unavailable',bets:bets?.map(b=>({...b,amount:original&&Number.isFinite(snapshot.purposeAllocations?.[key]?.[b.combination])?snapshot.purposeAllocations[key][b.combination]:null}))??null}];
  }));
}

async function listDailyPredictions(env, raceDate) {
  const rows = await env.DB.prepare(`
    SELECT race_key, venue, jcd, rno, deadline, confidence, decision,
      stable_score, prediction_json, analyzed_at
    FROM predictions WHERE race_date = ?
    ORDER BY jcd ASC, rno ASC
  `).bind(raceDate).all();
  return (rows.results || []).map(row => {
    const snapshot = parseJsonSafe(row.prediction_json, {}) || {};
    return {
      raceKey: row.race_key,
      venue: row.venue,
      jcd: row.jcd,
      rno: Number(row.rno),
      deadline: row.deadline,
      confidence: row.confidence,
      decision: row.decision,
      stableScore: row.stable_score,
      manshuProbability: snapshot.manshu?.probability ?? null,
      manshuCombinations: snapshot.manshu?.combinations ?? null,
      analyzedAt: row.analyzed_at,
      purposeModes: savedPurposeView(snapshot),
      main6: (snapshot.bets || []).slice(0, 6).map(bet => bet.combination)
    };
  });
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
   V6.7.0 AI
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

      recentWeighted:false,

      roles,

      overall:
        blankWeights(),

      _history:
        history
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
      let historyIndex = 0;
      historyIndex < history.length;
      historyIndex++
    ) {
      const item =
        history[
          historyIndex
        ];

      /*
        直近50Rは3倍、51〜100Rは2倍、それ以前は1倍。
        最近外れている/効いていない要素が古い成功例に埋もれないよう、
        ロール別学習そのものを直近寄りにする。
      */
      const distanceFromLatest =
        history.length -
        1 -
        historyIndex;

      const recencyCopies =
        distanceFromLatest < 50
          ? 3
          : distanceFromLatest < 100
            ? 2
            : 1;

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
          const signal =
            (
              winnerValue -
              average
            )
            /
            average;

          for (
            let copy = 0;
            copy < recencyCopies;
            copy++
          ) {
            signals[
              key
            ].push(
              signal
            );
          }
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

    recentWeighted:true,

    recent50:
      Math.min(
        history.length,
        50
      ),

    recent100:
      Math.min(
        history.length,
        100
      ),

    roles,

    overall,

    /* buildServerPrediction 内だけで使う。snapshotには保存しない */
    _history:
      history
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


/* =========================================================
   V6.7.1 適応学習 + 精度検証・自動校正
   - 1号艇の過信チェック
   - 会場別 / R別の1着補正
   - 直近100Rの買い目パターン補正
   - S / ★★★★★ の実績キャリブレーション
========================================================= */

function normalizedFieldPosition(
  value,
  values,
  lowerIsBetter = false
) {
  const v =
    safeNumber(
      value
    );

  const list =
    values
      .map(
        safeNumber
      )
      .filter(
        item =>
          item !== null
      );

  if (
    v === null ||
    list.length < 2
  ) {
    return null;
  }

  const min =
    Math.min(
      ...list
    );

  const max =
    Math.max(
      ...list
    );

  if (
    max === min
  ) {
    return .5;
  }

  const p =
    clamp(
      (
        v -
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

  return lowerIsBetter
    ? 1 - p
    : p;
}

function lane1GuardInfo(
  racers
) {
  const lane1 =
    racers.find(
      racer =>
        Number(
          racer.lane
        ) === 1
    );

  if (
    !lane1
  ) {
    return {
      active:false,
      support:.5,
      adjustment:0,
      availableWeight:0,
      details:{}
    };
  }

  const definitions = [
    {
      key:"exhibitionST",
      weight:.30,
      value:
        lane1.before
          ?.exhibitionST,
      values:
        racers.map(
          racer =>
            racer.before
              ?.exhibitionST
        ),
      lower:true
    },
    {
      key:"motor",
      weight:.25,
      value:
        lane1.motor
          ?.secondRate,
      values:
        racers.map(
          racer =>
            racer.motor
              ?.secondRate
        ),
      lower:false
    },
    {
      key:"local",
      weight:.20,
      value:
        lane1.local
          ?.winRate,
      values:
        racers.map(
          racer =>
            racer.local
              ?.winRate
        ),
      lower:false
    },
    {
      key:"exhibitionTime",
      weight:.15,
      value:
        lane1.before
          ?.exhibitionTime,
      values:
        racers.map(
          racer =>
            racer.before
              ?.exhibitionTime
        ),
      lower:true
    },
    {
      key:"avgST",
      weight:.10,
      value:
        lane1.avgST,
      values:
        racers.map(
          racer =>
            racer.avgST
        ),
      lower:true
    }
  ];

  let weighted = 0;
  let availableWeight = 0;
  const details = {};

  for (
    const definition of
    definitions
  ) {
    const position =
      normalizedFieldPosition(
        definition.value,
        definition.values,
        definition.lower
      );

    details[
      definition.key
    ] =
      position;

    if (
      position === null
    ) {
      continue;
    }

    weighted +=
      position *
      definition.weight;

    availableWeight +=
      definition.weight;
  }

  const support =
    availableWeight > 0
      ? weighted /
        availableWeight
      : .5;

  let adjustment = 0;

  /*
    1号艇だから自動的に頭、を抑える。
    直前ST・モーター・当地・展示が弱いほど1着スコアを下げる。
  */
  if (
    availableWeight >= .35
  ) {
    if (
      support < .30
    ) {
      adjustment = -6;

    } else if (
      support < .40
    ) {
      adjustment = -4.5;

    } else if (
      support < .50
    ) {
      adjustment = -2.5;

    } else if (
      support > .82
    ) {
      adjustment = 1;
    }
  }

  const actualCourse =
    safeNumber(
      lane1.before
        ?.course
    );

  if (
    actualCourse !== null &&
    actualCourse !== 1
  ) {
    adjustment -= 3;
  }

  return {
    active:
      availableWeight >= .35,

    support:
      Math.round(
        support * 1000
      ) / 1000,

    adjustment:
      Math.round(
        adjustment * 10
      ) / 10,

    availableWeight:
      Math.round(
        availableWeight * 1000
      ) / 1000,

    details,

    course:
      actualCourse
  };
}

function applyLane1Guard(
  racers
) {
  const info =
    lane1GuardInfo(
      racers
    );

  if (
    !info.adjustment
  ) {
    return info;
  }

  const lane1 =
    racers.find(
      racer =>
        Number(
          racer.lane
        ) === 1
    );

  if (
    lane1
  ) {
    lane1.firstScore =
      Math.round(
        (
          Number(
            lane1.firstScore ||
            0
          )
          +
          info.adjustment
        )
        * 10
      )
      /
      10;
  }

  return info;
}

function historyWinnerLane(
  item
) {
  return Number(
    item?.result
      ?.winningLanes
      ?.[0] ||
    String(
      item?.result
        ?.combination ||
      ""
    ).split("-")[0] ||
    0
  );
}

function historyTopFirstLane(
  item
) {
  const racers =
    Array.isArray(
      item?.racersDetailed
    )
      ? item.racersDetailed
      : [];

  if (
    racers.length
  ) {
    const ranked =
      racers
        .slice()
        .sort(
          (a,b) =>
            Number(
              b.firstScore ||
              0
            )
            -
            Number(
              a.firstScore ||
              0
            )
        );

    if (
      ranked[0]
    ) {
      return Number(
        ranked[0].lane ||
        0
      );
    }
  }

  const firstBet =
    Array.isArray(
      item?.bets
    )
      ? item.bets[0]
      : null;

  return Number(
    String(
      firstBet?.combination ||
      ""
    ).split("-")[0] ||
    0
  );
}

function historyMain6Hit(
  item
) {
  const combination =
    item?.result
      ?.combination ||
    (
      Array.isArray(
        item?.result
          ?.winningLanes
      )
        ? item.result
            .winningLanes
            .slice(0,3)
            .join("-")
        : null
    );

  if (
    !combination
  ) {
    return false;
  }

  return (
    Array.isArray(
      item?.bets
    )
      ? item.bets
          .slice(0,6)
          .some(
            bet =>
              bet?.combination ===
              combination
          )
      : false
  );
}

function historyTop6Expected(
  item
) {
  if (
    !Array.isArray(
      item?.bets
    )
  ) {
    return 0;
  }

  return clamp(
    item.bets
      .slice(0,6)
      .reduce(
        (sum, bet) =>
          sum +
          Number(
            bet?.probability ||
            0
          ),
        0
      ),
    0,
    1
  );
}

function raceBand(
  rno
) {
  const n =
    Number(
      rno ||
      0
    );

  if (
    n <= 4
  ) {
    return "EARLY";
  }

  if (
    n <= 8
  ) {
    return "MIDDLE";
  }

  return "LATE";
}

function smoothedLaneWinRate(
  items,
  lane,
  priorRate,
  priorWeight = 12
) {
  const n =
    items.length;

  if (
    !n
  ) {
    return {
      races:0,
      wins:0,
      rate:priorRate
    };
  }

  const wins =
    items.filter(
      item =>
        historyWinnerLane(
          item
        ) ===
        Number(
          lane
        )
    ).length;

  return {
    races:n,
    wins,
    rate:
      (
        wins +
        priorRate *
        priorWeight
      )
      /
      (
        n +
        priorWeight
      )
  };
}

function calculateVenueRnoFactors(
  history,
  context,
  racers
) {
  const recent =
    history.slice(
      -300
    );

  const factors = {};
  const diagnostics = {};

  for (
    const racer of
    racers
  ) {
    const lane =
      Number(
        racer.lane
      );

    const globalLane =
      smoothedLaneWinRate(
        recent,
        lane,
        1 / 6,
        18
      );

    const baseRate =
      Math.max(
        globalLane.rate,
        .03
      );

    const venueItems =
      recent.filter(
        item =>
          String(
            item.jcd ||
            ""
          ).padStart(2,"0") ===
          String(
            context.jcd ||
            ""
          ).padStart(2,"0")
      );

    const exactItems =
      venueItems.filter(
        item =>
          Number(
            item.rno
          ) ===
          Number(
            context.rno
          )
      );

    const rnoItems =
      recent.filter(
        item =>
          Number(
            item.rno
          ) ===
          Number(
            context.rno
          )
      );

    const band =
      raceBand(
        context.rno
      );

    const bandItems =
      recent.filter(
        item =>
          raceBand(
            item.rno
          ) ===
          band
      );

    const venue =
      smoothedLaneWinRate(
        venueItems,
        lane,
        baseRate,
        10
      );

    const exact =
      smoothedLaneWinRate(
        exactItems,
        lane,
        baseRate,
        14
      );

    const rno =
      smoothedLaneWinRate(
        rnoItems,
        lane,
        baseRate,
        14
      );

    const bandStats =
      smoothedLaneWinRate(
        bandItems,
        lane,
        baseRate,
        16
      );

    const venueWeight =
      Math.min(
        venueItems.length / 24,
        1
      );

    const exactWeight =
      Math.min(
        exactItems.length / 10,
        1
      );

    const rnoWeight =
      Math.min(
        rnoItems.length / 28,
        1
      );

    const bandWeight =
      Math.min(
        bandItems.length / 40,
        1
      );

    const logAdjustment =
      Math.log(
        clamp(
          venue.rate /
          baseRate,
          .65,
          1.35
        )
      ) * .40 * venueWeight
      +
      Math.log(
        clamp(
          exact.rate /
          baseRate,
          .65,
          1.35
        )
      ) * .30 * exactWeight
      +
      Math.log(
        clamp(
          rno.rate /
          baseRate,
          .70,
          1.30
        )
      ) * .18 * rnoWeight
      +
      Math.log(
        clamp(
          bandStats.rate /
          baseRate,
          .75,
          1.25
        )
      ) * .12 * bandWeight;

    const factor =
      clamp(
        Math.exp(
          logAdjustment
        ),
        .84,
        1.16
      );

    factors[lane] =
      Math.round(
        factor * 1000
      ) / 1000;

    diagnostics[lane] = {
      baseRate,
      venue,
      exact,
      rno,
      band:bandStats,
      factor:
        factors[lane]
    };
  }

  return {
    factors,
    diagnostics,
    sample:
      recent.length
  };
}

function applyVenueRnoFactors(
  racers,
  contextLearning
) {
  for (
    const racer of
    racers
  ) {
    const factor =
      Number(
        contextLearning
          ?.factors
          ?.[racer.lane] ||
        1
      );

    /* strength(score)=exp(score/20) なので、20*ln(factor)で確率側に反映 */
    racer.firstScore =
      Math.round(
        (
          Number(
            racer.firstScore ||
            0
          )
          +
          20 *
          Math.log(
            clamp(
              factor,
              .84,
              1.16
            )
          )
        )
        * 10
      )
      /
      10;
  }
}

function calibrationFromItems(
  items,
  minSample = 8
) {
  const n =
    items.length;

  if (
    n < minSample
  ) {
    return {
      sample:n,
      hits:
        items.filter(
          historyMain6Hit
        ).length,
      actual:null,
      expected:null,
      factor:1
    };
  }

  const hits =
    items.filter(
      historyMain6Hit
    ).length;

  const actual =
    hits /
    n;

  const expected =
    items.reduce(
      (sum, item) =>
        sum +
        historyTop6Expected(
          item
        ),
      0
    )
    /
    n;

  const reliability =
    Math.min(
      n / 30,
      1
    );

  const factor =
    clamp(
      1 +
      (
        actual -
        expected
      )
      *
      1.35 *
      reliability,
      .82,
      1.08
    );

  return {
    sample:n,
    hits,
    actual:
      Math.round(
        actual * 1000
      ) / 1000,
    expected:
      Math.round(
        expected * 1000
      ) / 1000,
    factor:
      Math.round(
        factor * 1000
      ) / 1000
  };
}


/* =========================================================
   V6.7.1 精度検証・自動校正
   - 予測確率帯ごとの実測校正
   - Sスコア帯ごとの実測校正
   - 時系列ブロックでのウォークフォワード検証
   - 外れ方（1着 / 2着 / 3着）の分類学習
   - 少数データは縮小して過学習を抑える
========================================================= */

function recencyWeightedCalibrationFromItems(
  items,
  minSample = 10
) {
  const n =
    items.length;

  const plainHits =
    items.filter(
      historyMain6Hit
    ).length;

  if (
    n < minSample
  ) {
    return {
      sample:n,
      hits:plainHits,
      actual:null,
      expected:null,
      gap:null,
      factor:1
    };
  }

  let weightedHits = 0;
  let weightedExpected = 0;
  let weightTotal = 0;

  for (
    let i = 0;
    i < items.length;
    i++
  ) {
    const distance =
      items.length - 1 - i;

    const weight =
      distance < 30
        ? 2.2
        : distance < 70
          ? 1.5
          : 1;

    const hit =
      historyMain6Hit(
        items[i]
      )
        ? 1
        : 0;

    weightedHits +=
      hit * weight;

    weightedExpected +=
      historyTop6Expected(
        items[i]
      ) * weight;

    weightTotal +=
      weight;
  }

  const actual =
    weightTotal
      ? weightedHits /
        weightTotal
      : 0;

  const expected =
    weightTotal
      ? weightedExpected /
        weightTotal
      : 0;

  const gap =
    actual - expected;

  const reliability =
    Math.min(
      n / 36,
      1
    );

  /*
    上振れは控えめ、下振れは強めに反映。
    少数サンプルは reliability で全体平均へ縮小する。
  */
  const sensitivity =
    gap < 0
      ? 1.65
      : .75;

  const factor =
    clamp(
      1 +
      gap *
      sensitivity *
      reliability,
      .80,
      1.06
    );

  return {
    sample:n,
    hits:plainHits,
    actual:
      Math.round(
        actual * 1000
      ) / 1000,
    expected:
      Math.round(
        expected * 1000
      ) / 1000,
    gap:
      Math.round(
        gap * 1000
      ) / 1000,
    factor:
      Math.round(
        factor * 1000
      ) / 1000
  };
}

function probabilityCalibrationBucket(
  expected
) {
  const p =
    Number(
      expected ||
      0
    );

  if (
    p < .18
  ) {
    return "P_LT18";
  }

  if (
    p < .24
  ) {
    return "P_18_23";
  }

  if (
    p < .30
  ) {
    return "P_24_29";
  }

  return "P_30_PLUS";
}

function scoreCalibrationBucket(
  score
) {
  const s =
    Number(
      score ||
      0
    );

  if (
    s < 75
  ) {
    return "S_68_74";
  }

  if (
    s < 80
  ) {
    return "S_75_79";
  }

  if (
    s < 90
  ) {
    return "S_80_89";
  }

  return "S_90_PLUS";
}

function calculateProbabilityCalibration(
  history,
  currentExpected
) {
  const recent =
    history
      .slice(-180)
      .filter(
        item =>
          historyTop6Expected(
            item
          ) > 0
      );

  const bucket =
    probabilityCalibrationBucket(
      currentExpected
    );

  const sameBucket =
    recent.filter(
      item =>
        probabilityCalibrationBucket(
          historyTop6Expected(
            item
          )
        ) ===
        bucket
    );

  const selected =
    sameBucket.length >= 10
      ? sameBucket
      : recent.slice(-100);

  return {
    bucket,
    fallback:
      sameBucket.length < 10,
    ...recencyWeightedCalibrationFromItems(
      selected,
      10
    )
  };
}

function calculateScoreBandCalibrations(
  history
) {
  const recent =
    history
      .slice(-220)
      .filter(
        item =>
          item.confidence === "S"
          &&
          item.sDecision
            ?.status === "BET"
          &&
          Number(
            item.sDecision
              ?.score ||
            0
          ) >= 68
      );

  const buckets = {};

  for (
    const key of [
      "S_68_74",
      "S_75_79",
      "S_80_89",
      "S_90_PLUS"
    ]
  ) {
    const selected =
      recent.filter(
        item =>
          scoreCalibrationBucket(
            item.sDecision
              ?.score ||
            0
          ) === key
      );

    buckets[key] =
      recencyWeightedCalibrationFromItems(
        selected,
        8
      );
  }

  buckets.ALL =
    recencyWeightedCalibrationFromItems(
      recent,
      10
    );

  return buckets;
}

function expectedCalibrationError(
  items
) {
  if (
    !items.length
  ) {
    return null;
  }

  const bins = [
    [0,.18],
    [.18,.24],
    [.24,.30],
    [.30,1.01]
  ];

  let ece = 0;

  for (
    const [low, high] of bins
  ) {
    const bucket =
      items.filter(
        item => {
          const p =
            historyTop6Expected(
              item
            );

          return (
            p >= low
            &&
            p < high
          );
        }
      );

    if (
      !bucket.length
    ) {
      continue;
    }

    const actual =
      bucket.filter(
        historyMain6Hit
      ).length /
      bucket.length;

    const expected =
      bucket.reduce(
        (sum, item) =>
          sum +
          historyTop6Expected(
            item
          ),
        0
      ) /
      bucket.length;

    ece +=
      Math.abs(
        actual - expected
      ) *
      (
        bucket.length /
        items.length
      );
  }

  return (
    Math.round(
      ece * 1000
    ) /
    1000
  );
}

function calculateWalkForwardValidation(
  history
) {
  const recent =
    history
      .slice(-160)
      .filter(
        item =>
          historyTop6Expected(
            item
          ) > 0
      );

  if (
    recent.length < 30
  ) {
    return {
      sample:recent.length,
      blocks:[],
      actual:null,
      expected:null,
      gap:null,
      brier:null,
      ece:null,
      factor:1
    };
  }

  const blockSize = 20;
  const blocks = [];

  for (
    let start = 0;
    start < recent.length;
    start += blockSize
  ) {
    const block =
      recent.slice(
        start,
        start + blockSize
      );

    if (
      block.length < 10
    ) {
      continue;
    }

    const actual =
      block.filter(
        historyMain6Hit
      ).length /
      block.length;

    const expected =
      block.reduce(
        (sum, item) =>
          sum +
          historyTop6Expected(
            item
          ),
        0
      ) /
      block.length;

    blocks.push({
      sample:block.length,
      actual:
        Math.round(
          actual * 1000
        ) / 1000,
      expected:
        Math.round(
          expected * 1000
        ) / 1000,
      gap:
        Math.round(
          (
            actual - expected
          ) * 1000
        ) / 1000
    });
  }

  const validation =
    recent.slice(
      -Math.min(
        recent.length,
        80
      )
    );

  const actual =
    validation.filter(
      historyMain6Hit
    ).length /
    validation.length;

  const expected =
    validation.reduce(
      (sum, item) =>
        sum +
        historyTop6Expected(
          item
        ),
      0
    ) /
    validation.length;

  const gap =
    actual - expected;

  const brier =
    validation.reduce(
      (sum, item) => {
        const p =
          historyTop6Expected(
            item
          );

        const y =
          historyMain6Hit(
            item
          )
            ? 1
            : 0;

        return (
          sum +
          Math.pow(
            y - p,
            2
          )
        );
      },
      0
    ) /
    validation.length;

  const reliability =
    Math.min(
      validation.length / 80,
      1
    );

  const factor =
    clamp(
      1 +
      gap *
      (
        gap < 0
          ? 1.25
          : .50
      ) *
      reliability,
      .86,
      1.04
    );

  return {
    sample:
      validation.length,
    blocks:
      blocks.slice(-5),
    actual:
      Math.round(
        actual * 1000
      ) / 1000,
    expected:
      Math.round(
        expected * 1000
      ) / 1000,
    gap:
      Math.round(
        gap * 1000
      ) / 1000,
    brier:
      Math.round(
        brier * 1000
      ) / 1000,
    ece:
      expectedCalibrationError(
        validation
      ),
    factor:
      Math.round(
        factor * 1000
      ) / 1000
  };
}

function historyMissType(
  item
) {
  if (
    historyMain6Hit(
      item
    )
  ) {
    return "HIT";
  }

  const winning =
    Array.isArray(
      item?.result
        ?.winningLanes
    )
      ? item.result
          .winningLanes
          .slice(0,3)
          .map(Number)
      : String(
          item?.result
            ?.combination ||
          ""
        )
          .split("-")
          .slice(0,3)
          .map(Number);

  if (
    winning.length < 3
    ||
    !winning[0]
  ) {
    return "UNKNOWN";
  }

  const predictedFirst =
    historyTopFirstLane(
      item
    );

  if (
    predictedFirst !==
    winning[0]
  ) {
    return "FIRST";
  }

  const main6 =
    Array.isArray(
      item?.bets
    )
      ? item.bets.slice(0,6)
      : [];

  const secondCandidates =
    new Set(
      main6
        .filter(
          bet =>
            Number(
              String(
                bet?.combination ||
                ""
              ).split("-")[0]
            ) === winning[0]
        )
        .map(
          bet =>
            Number(
              String(
                bet?.combination ||
                ""
              ).split("-")[1]
            )
        )
    );

  if (
    !secondCandidates.has(
      winning[1]
    )
  ) {
    return "SECOND";
  }

  const thirdCandidates =
    new Set(
      main6
        .filter(
          bet => {
            const parts =
              String(
                bet?.combination ||
                ""
              )
                .split("-")
                .map(Number);

            return (
              parts[0] === winning[0]
              &&
              parts[1] === winning[1]
            );
          }
        )
        .map(
          bet =>
            Number(
              String(
                bet?.combination ||
                ""
              ).split("-")[2]
            )
        )
    );

  if (
    !thirdCandidates.has(
      winning[2]
    )
  ) {
    return "THIRD";
  }

  return "COMBINATION";
}

function calculateMissProfile(
  history,
  topLane,
  strategyType
) {
  const recentS =
    history
      .slice(-140)
      .filter(
        item =>
          item.confidence === "S"
          &&
          item.sDecision
            ?.status === "BET"
      );

  const exact =
    recentS.filter(
      item =>
        historyTopFirstLane(
          item
        ) === Number(topLane)
        &&
        item.strategy
          ?.type === strategyType
    );

  const sameLane =
    recentS.filter(
      item =>
        historyTopFirstLane(
          item
        ) === Number(topLane)
    );

  let selected = exact;
  let bucket = "lane+strategy";

  if (
    selected.length < 12
  ) {
    selected =
      sameLane.length >= 12
        ? sameLane
        : recentS;

    bucket =
      sameLane.length >= 12
        ? "firstLane"
        : "allS";
  }

  const counts = {
    HIT:0,
    FIRST:0,
    SECOND:0,
    THIRD:0,
    COMBINATION:0,
    UNKNOWN:0
  };

  for (
    const item of selected
  ) {
    const type =
      historyMissType(
        item
      );

    counts[type] =
      Number(
        counts[type] ||
        0
      ) + 1;
  }

  const n =
    selected.length;

  if (
    n < 12
  ) {
    return {
      bucket,
      sample:n,
      counts,
      firstMissRate:null,
      downstreamMissRate:null,
      factor:1,
      firstRisk:false
    };
  }

  const firstMissRate =
    counts.FIRST / n;

  const downstreamMissRate =
    (
      counts.SECOND +
      counts.THIRD +
      counts.COMBINATION
    ) /
    n;

  const reliability =
    Math.min(
      n / 35,
      1
    );

  const penalty =
    Math.max(
      0,
      firstMissRate - .26
    ) * .22
    +
    Math.max(
      0,
      downstreamMissRate - .28
    ) * .12;

  const factor =
    clamp(
      1 -
      penalty *
      reliability,
      .90,
      1
    );

  return {
    bucket,
    sample:n,
    counts,
    firstMissRate:
      Math.round(
        firstMissRate * 1000
      ) / 1000,
    downstreamMissRate:
      Math.round(
        downstreamMissRate * 1000
      ) / 1000,
    factor:
      Math.round(
        factor * 1000
      ) / 1000,
    firstRisk:
      n >= 20
      &&
      firstMissRate >= .42
  };
}

function calculateRecentPatternCalibration(
  history,
  strategy,
  racers
) {
  const recent =
    history.slice(
      -100
    );

  const topLane =
    racers
      .slice()
      .sort(
        (a,b) =>
          b.firstScore -
          a.firstScore
      )[0]
      ?.lane;

  const strategyType =
    strategy?.type ||
    null;

  const exact =
    recent.filter(
      item =>
        historyTopFirstLane(
          item
        ) ===
        Number(
          topLane
        )
      &&
        item.strategy
          ?.type ===
        strategyType
    );

  const sameStrategy =
    recent.filter(
      item =>
        item.strategy
          ?.type ===
        strategyType
    );

  const sameTopLane =
    recent.filter(
      item =>
        historyTopFirstLane(
          item
        ) ===
        Number(
          topLane
        )
    );

  let selected =
    exact;

  let bucket =
    "lane+strategy";

  if (
    selected.length < 8
  ) {
    selected =
      sameStrategy.length >= 8
        ? sameStrategy
        : sameTopLane.length >= 8
          ? sameTopLane
          : recent;

    bucket =
      sameStrategy.length >= 8
        ? "strategy"
        : sameTopLane.length >= 8
          ? "firstLane"
          : "recent100";
  }

  return {
    bucket,
    topLane:
      Number(
        topLane ||
        0
      ),
    strategyType,
    ...calibrationFromItems(
      selected,
      8
    )
  };
}

function calculateSCalibration(
  history
) {
  const recent =
    history.slice(
      -100
    );

  const sBet =
    recent.filter(
      item =>
        item.confidence ===
          "S"
      &&
        item.sDecision
          ?.status ===
          "BET"
    );

  const fiveStar =
    sBet.filter(
      item =>
        Number(
          item.sDecision
            ?.score ||
          0
        ) >= 80
    );

  return {
    overall:
      calibrationFromItems(
        sBet,
        8
      ),

    fiveStar:
      calibrationFromItems(
        fiveStar,
        8
      )
  };
}

function makeAdaptiveLearning(
  history,
  context,
  racers,
  strategy,
  lane1Guard,
  venueRnoLearning,
  allBets
) {
  const recentPattern =
    calculateRecentPatternCalibration(
      history,
      strategy,
      racers
    );

  const sCalibration =
    calculateSCalibration(
      history
    );

  const topLane =
    racers
      .slice()
      .sort(
        (a,b) =>
          b.firstScore -
          a.firstScore
      )[0]
      ?.lane;

  const currentExpected =
    Array.isArray(
      allBets
    )
      ? allBets
          .slice(0,6)
          .reduce(
            (sum, bet) =>
              sum +
              Number(
                bet?.probability ||
                0
              ),
            0
          )
      : 0;

  const precisionCalibration = {
    probability:
      calculateProbabilityCalibration(
        history,
        currentExpected
      ),

    scoreBands:
      calculateScoreBandCalibrations(
        history
      ),

    walkForward:
      calculateWalkForwardValidation(
        history
      ),

    missProfile:
      calculateMissProfile(
        history,
        Number(
          topLane ||
          0
        ),
        strategy?.type ||
        null
      )
  };

  return {
    historyRaces:
      history.length,

    recentWindow:
      Math.min(
        history.length,
        100
      ),

    lane1Guard,

    venueRno:{
      sample:
        venueRnoLearning
          ?.sample ||
        0,

      topLane:
        Number(
          topLane ||
          0
        ),

      topLaneFactor:
        Number(
          venueRnoLearning
            ?.factors
            ?.[topLane] ||
          1
        ),

      band:
        raceBand(
          context.rno
        )
    },

    recentPattern,

    sCalibration,

    precisionCalibration
  };
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
    const odds = Number(item.odds);
    if (Number.isFinite(odds) && odds > 0) {
      map[item.combination] = odds;
    }
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
      odds === null || odds <= 0
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
  allBets,
  adaptiveLearning = null
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

  const topLane =
    Number(
      ranked[0]
        ?.lane ||
      0
    );

  const firstShare =
    firstWinShare(
      ranked[0].lane,
      racers
    );

  const firstGap =
    ranked[0].firstScore -
    ranked[1].firstScore;

  const rawTop6Probability =
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

  /*
    7〜10位は「押さえ4点」として表示・検証する。
    S判定そのものは従来の上位6点基準を維持し、
    過去成績との比較可能性を壊さない。
  */
  const rawTop10Probability =
    allBets
      .slice(
        0,
        10
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

  const patternFactor =
    Number(
      adaptiveLearning
        ?.recentPattern
        ?.factor ||
      1
    );

  const sOverallFactor =
    Number(
      adaptiveLearning
        ?.sCalibration
        ?.overall
        ?.factor ||
      1
    );

  /*
    まず通常Sスコアを出し、80点以上になりそうな場合は
    過去の★★★★★実績も追加で照合する。
  */
  const provisionalTop6Probability =
    clamp(
      rawTop6Probability *
      patternFactor *
      sOverallFactor,
      0,
      1
    );

  const provisionalQuality =
    (
      norm(
        firstShare,
        .22,
        .42
      ) * .25

      +

      norm(
        provisionalTop6Probability,
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

  const highFactor =
    provisionalQuality >= 80
      ? Number(
          adaptiveLearning
            ?.sCalibration
            ?.fiveStar
            ?.factor ||
          1
        )
      : 1;

  const probabilityCalibration =
    adaptiveLearning
      ?.precisionCalibration
      ?.probability ||
    null;

  const probabilityFactor =
    Number(
      probabilityCalibration
        ?.factor ||
      1
    );

  const scoreBucket =
    scoreCalibrationBucket(
      provisionalQuality
    );

  const scoreBandCalibration =
    adaptiveLearning
      ?.precisionCalibration
      ?.scoreBands
      ?.[scoreBucket]
    ||
    adaptiveLearning
      ?.precisionCalibration
      ?.scoreBands
      ?.ALL
    ||
    null;

  const scoreBandFactor =
    Number(
      scoreBandCalibration
        ?.factor ||
      1
    );

  const walkForwardCalibration =
    adaptiveLearning
      ?.precisionCalibration
      ?.walkForward ||
    null;

  const walkForwardFactor =
    Number(
      walkForwardCalibration
        ?.factor ||
      1
    );

  const missProfile =
    adaptiveLearning
      ?.precisionCalibration
      ?.missProfile ||
    null;

  const missProfileFactor =
    Number(
      missProfile
        ?.factor ||
      1
    );

  const calibrationFactor =
    clamp(
      patternFactor *
      sOverallFactor *
      highFactor *
      probabilityFactor *
      scoreBandFactor *
      walkForwardFactor *
      missProfileFactor,
      .62,
      1.08
    );

  const top6Probability =
    clamp(
      rawTop6Probability *
      calibrationFactor,
      0,
      1
    );

  const top10Probability =
    clamp(
      rawTop10Probability *
      calibrationFactor,
      0,
      1
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

  /*
    直近100Rで予測確率より実績が弱ければSスコアを下げる。
    上振れは小さく、下振れはきちんと効かせる。
  */
  const calibrationScoreAdjustment =
    (
      calibrationFactor -
      1
    )
    *
    35;

  const score =
    Math.round(
      clamp(
        quality +
        calibrationScoreAdjustment,
        0,
        100
      )
      * 10
    )
    /
    10;

  const lane1Guard =
    adaptiveLearning
      ?.lane1Guard ||
    null;

  const lane1Risk =
    topLane === 1
    &&
    lane1Guard
      ?.active
    &&
    Number(
      lane1Guard.support ||
      0
    ) < .42;

  const precisionWarnings = [
    patternFactor < .94,
    probabilityFactor < .94,
    scoreBandFactor < .94,
    walkForwardFactor < .94,
    missProfileFactor < .94,
    Number(
      adaptiveLearning
        ?.venueRno
        ?.topLaneFactor ||
      1
    ) < .94
  ].filter(Boolean).length;

  /*
    複数の独立した検証軸が同時に弱い場合は、
    高スコアでも「見送る力」を優先する。
  */
  const precisionRisk =
    precisionWarnings >= 3
    ||
    (
      precisionWarnings >= 2
      &&
      score < 80
    )
    ||
    Boolean(
      missProfile
        ?.firstRisk
    );

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
      "直近実績補正後、上位6点への確率集中が基準未満"
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
    lane1Risk
  ) {
    reasons.push(
      "1号艇の展示ST・モーター・当地成績などの裏付けが弱い"
    );
  }

  if (
    patternFactor < .94
  ) {
    reasons.push(
      "直近100Rで同型パターンの成績が弱いため自動減点"
    );
  }

  if (
    sOverallFactor < .94 ||
    highFactor < .94
  ) {
    reasons.push(
      "過去のS/★★★★★実績を照合して信頼度を自動補正"
    );
  }

  if (
    probabilityFactor < .94
  ) {
    reasons.push(
      "同じ予測確率帯の実測的中率が弱いため自動校正"
    );
  }

  if (
    scoreBandFactor < .94
  ) {
    reasons.push(
      "同じSスコア帯の実測成績が弱いため自動校正"
    );
  }

  if (
    walkForwardFactor < .94
  ) {
    reasons.push(
      "時系列ウォークフォワード検証で直近精度が弱い"
    );
  }

  if (
    missProfileFactor < .94
    ||
    missProfile?.firstRisk
  ) {
    reasons.push(
      "最近の外れ方を分類した結果、同型パターンの失敗が多い"
    );
  }

  if (
    precisionRisk
  ) {
    reasons.push(
      "複数の精度検証が同時に弱いため高スコアでも見送り"
    );
  }

  if (
    score < 68
  ) {
    reasons.push(
      "補正後の総合安定スコアが基準未満"
    );
  }

  const battle =
    score >= 68
    &&
    firstShare >= .30
    &&
    top6Probability >= .18
    &&
    coverage >= .55
    &&
    !lane1Risk
    &&
    !precisionRisk;

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

      rawTop6Probability,

      top6Probability,

      rawTop10Probability,

      top10Probability,

      calibrationFactor,

      recentPatternFactor:
        patternFactor,

      sCalibrationFactor:
        sOverallFactor,

      fiveStarCalibrationFactor:
        highFactor,

      probabilityCalibrationFactor:
        probabilityFactor,

      scoreBandCalibrationFactor:
        scoreBandFactor,

      scoreCalibrationBucket:
        scoreBucket,

      walkForwardCalibrationFactor:
        walkForwardFactor,

      walkForwardECE:
        walkForwardCalibration
          ?.ece ??
        null,

      missProfileFactor,

      missProfileFirstRate:
        missProfile
          ?.firstMissRate ??
        null,

      precisionWarnings,

      precisionRisk,

      firstGap,

      secondStability:
        secondStable,

      thirdStability:
        thirdStable,

      beforeCoverage:
        coverage,

      lane1Support:
        lane1Guard
          ?.support ??
        null,

      venueRnoFactor:
        adaptiveLearning
          ?.venueRno
          ?.topLaneFactor ??
        1
    },

    reasons:
      battle
        ? [
            "1着候補が優勢",
            "直近100R・確率帯・Sスコア帯の補正後も基準をクリア",
            "展示・会場・R別・ウォークフォワード検証を確認"
          ]
        : reasons
  };
} /* =========================
   本線選択
========================= */

function selectMainlineBets(allBets, racers, confidence) {
  // evaluateBets has already scored and ranked every available 3連単 combination.
  // Never filter by first or second place when selecting the main six or cover four.
  const firstRank = racers.slice().sort((a, b) => b.firstScore - a.firstScore);
  const top1 = firstRank[0];
  const top2 = firstRank[1];
  const share = firstWinShare(top1.lane, racers);
  const top2Share = firstWinShare(top2.lane, racers);
  const gap = top1.firstScore - top2.firstScore;
  const firstSix = new Set(allBets.slice(0, 6).map(bet => bet.first));

  let type = "MIXED";
  let label = "混戦";
  if (share >= .40 && gap >= 12 && firstSix.size <= 2) {
    type = "FAVORITE";
    label = "本命";
  } else if (share < .32 || firstSix.size >= 3) {
    type = "UPSET";
    label = "波乱";
  }

  return {
    type,
    label,
    reason: "取得できた3連単を1・2・3着の評価、確率、オッズから採点し、総合順位で選出",
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

/* 予想日の前30日だけを使用し、艇番による基礎勝率との差を小さく加点する。 */
function racerHistoryName(value) {
  return String(value||'').replace(/[\s\u3000]/g,'').trim();
}

function buildRacerHistoryStats(history,asOfDate) {
  const byId=Object.create(null),byName=Object.create(null);
  const day=String(asOfDate||'');
  const time=Date.UTC(Number(day.slice(0,4)),Number(day.slice(4,6))-1,Number(day.slice(6,8)));
  const cutoff=Number.isFinite(time)?new Date(time-30*86400000).toISOString().slice(0,10).replaceAll('-',''):'00000000';
  const firstBase={1:.50,2:.15,3:.12,4:.10,5:.07,6:.06};
  const topBase={1:.80,2:.55,3:.49,4:.44,5:.39,6:.33};
  const add=(store,key,row,venue,win,top,baseWin,baseTop)=>{
    if(!key)return;
    const value=store[key]||(store[key]={starts:0,wins:0,top3:0,expectedWins:0,expectedTop3:0,venue:{}});
    value.starts++;value.wins+=Number(win);value.top3+=Number(top);
    value.expectedWins+=baseWin;value.expectedTop3+=baseTop;
    if(venue){const part=value.venue[venue]||(value.venue[venue]={starts:0,wins:0,expectedWins:0});
      part.starts++;part.wins+=Number(win);part.expectedWins+=baseWin}
  };
  for(const item of history||[]){
    const date=String(item.date||'');
    if(date>=day||date<cutoff||!item.result?.finished)continue;
    const podium=item.result.winningLanes?.slice(0,3).map(Number);
    if(!podium||podium.length!==3||new Set(podium).size!==3)continue;
    for(const r of item.racersDetailed||[]){
      const lane=Number(r.lane),name=racerHistoryName(r.name),id=String(r.registration||'');
      if(!firstBase[lane]||!name)continue;
      const win=lane===podium[0],top=podium.includes(lane),venue=String(item.jcd||'').padStart(2,'0');
      add(byName,name,r,venue,win,top,firstBase[lane],topBase[lane]);
      if(/^\d{4}$/.test(id))add(byId,id,r,venue,win,top,firstBase[lane],topBase[lane]);
    }
  }
  return {byId,byName};
}

function applyRacerHistoryScores(racers,stats,context) {
  return racers.map(r=>{
    const id=String(r.registration||''),name=racerHistoryName(r.name);
    const byId=stats?.byId?.[id],byName=stats?.byName?.[name];
    const record=byId?.starts>=2?byId:(byName||byId);
    if(!record?.starts)return {...r,historyRaces:0,historyWins:0,historyTop3:0,historyAdjustment:0};
    const n=record.starts;
    const winSignal=(record.wins-record.expectedWins)/(n+8);
    const topSignal=(record.top3-record.expectedTop3)/(n+8);
    const venueRecord=record.venue?.[String(context.jcd||'').padStart(2,'0')];
    const venueSignal=venueRecord?(venueRecord.wins-venueRecord.expectedWins)/(venueRecord.starts+10):0;
    const sampleFactor=Math.min(1,n/5);
    const adjustment=Math.round(Math.max(-6,Math.min(6,(40*winSignal+12*topSignal+12*venueSignal)*sampleFactor))*10)/10;
    return {...r,overallScore:Math.round((r.overallScore+adjustment)*10)/10,
      firstScore:Math.round((r.firstScore+adjustment*1.2)*10)/10,
      secondScore:Math.round((r.secondScore+adjustment*.65)*10)/10,
      thirdScore:Math.round((r.thirdScore+adjustment*.45)*10)/10,
      historyRaces:n,historyWins:record.wins,historyTop3:record.top3,historyAdjustment:adjustment};
  });
}

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

  const historicalStats=buildRacerHistoryStats(learned._history,context.date);
  const modelRacers =
    applyRacerHistoryScores(racers.map(
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
    ),historicalStats,context);

  /*
    ① 1号艇の直前データ裏付けを追加チェック
    ② 会場別・R別（序盤/中盤/終盤を含む）の実績で1着力を微調整
  */
  const lane1Guard =
    applyLane1Guard(
      modelRacers
    );

  const history =
    Array.isArray(
      learned._history
    )
      ? learned._history
      : [];

  const venueRnoLearning =
    calculateVenueRnoFactors(
      history,
      context,
      modelRacers
    );

  applyVenueRnoFactors(
    modelRacers,
    venueRnoLearning
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

  const adaptiveLearning =
    makeAdaptiveLearning(
      history,
      context,
      modelRacers,
      strategy,
      lane1Guard,
      venueRnoLearning,
      main15
    );

  const sDecision =
    makeSDecision(
      confidence,
      modelRacers,
      main15,
      adaptiveLearning
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

  // 100円の3連単払戻が1万円以上となる組み合わせの確率。
  // オッズが120通り揃わない場合は判定を保留する。
  const manshu = {
    probability: allBets.length === 120
      ? Math.min(1, Math.max(0, allBets
          .filter(bet => bet.odds >= 100)
          .reduce((sum, bet) => sum + bet.probability, 0)))
      : null,
    combinations: allBets.filter(bet => bet.odds >= 100).length,
    oddsCoverage: allBets.length,
    cutoffOdds: 100
  };

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

      top2Share:
        strategy.top2Share,

      pairShare:
        strategy.pairShare,

      axisLanes:
        strategy.axisLanes,

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

    adaptiveLearning,

    racersDetailed:
      modelRacers.map(
        racer => ({
          lane:
            racer.lane,

          name:
            racer.name,

          registration:racer.registration,
          class:racer.class,
          historyRaces:racer.historyRaces,
          historyWins:racer.historyWins,
          historyTop3:racer.historyTop3,
          historyAdjustment:racer.historyAdjustment,

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

/* =========================
   上位N点の補正後確率
   - 新規予想は sDecision.metrics.top10Probability を保存
   - 旧予想は bets の確率合計 × calibrationFactor で補完
========================= */

function snapshotTopNProbability(
  snapshot,
  n
) {
  const bets =
    Array.isArray(
      snapshot?.bets
    )
      ? snapshot.bets
      : [];

  if (!bets.length) {
    return null;
  }

  const raw =
    bets
      .slice(
        0,
        Number(n || 0)
      )
      .reduce(
        (
          sum,
          bet
        ) =>
          sum +
          Number(
            bet?.probability ||
            0
          ),
        0
      );

  const factor =
    Number(
      snapshot?.sDecision
        ?.metrics
        ?.calibrationFactor ||
      1
    );

  return clamp(
    raw * factor,
    0,
    1
  );
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

  const cover =
    snapshot.bets
      .slice(
        6,
        10
      )
      .map(
        (
          bet,
          index
        ) =>
          `${index + 7}. ${bet.combination}` +
          `｜AI ${bet.totalScore}` +
          `｜オッズ ${bet.odds}倍`
      )
      .join(
        "\n"
      ) ||
    "該当なし";

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
          `10点内確率：${((metrics.top10Probability ?? snapshotTopNProbability(snapshot, 10) ?? 0) * 100).toFixed(1)}%`,
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

展開判定：${snapshot.strategy?.label || "-"}
本線6点：AI総合順位
${snapshot.strategy?.reason || ""}

1着評価トップ：
${topRacer ? `${topRacer.lane}号艇 ${topRacer.name}` : "-"}

${notice}
━━━━━━━━━━━━━━
■ 本線3連単 6点
━━━━━━━━━━━━━━

${main}

━━━━━━━━━━━━━━
■ 押さえ4点（7〜10位）
━━━━━━━━━━━━━━

${cover}

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
  rno,
  options = {}
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

  const beforeAvailable = beforeResult.status === "fulfilled" &&
    Boolean(beforeResult.value?.racers?.length);

  if (!beforeAvailable && !options.allowBeforeMissing) {
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

  const before = beforeAvailable
    ? beforeResult.value
    : { racers:[], weather:null };

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
    prediction,
    beforeAvailable
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
        race_data_json,
        result_json,
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
   締切10〜50分前を探す
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
    const existing = await env.DB.prepare(
      "SELECT race_key FROM predictions WHERE race_key = ? LIMIT 1"
    ).bind(raceKey).first();

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

  if (target.deadlineJST && Date.now() >= Date.parse(target.deadlineJST)) {
    throw new Error("締切を過ぎたため予想を保存しませんでした");
  }

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

  /* 全評価の予想を購入額0円の観察記録として保存する。 */
  {
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

    noteTitle: note.title,
    manshuProbability: snapshot.manshu?.probability ?? null,

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
   V6.6.0 完全放置オートメーション
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

  const main10 =
    main15.slice(
      0,
      10
    );

  const cover4 =
    main15.slice(
      6,
      10
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

  const main10Hit =
    main10.some(
      bet =>
        bet.combination ===
        combination
    );

  const cover4Hit =
    cover4.some(
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
    main10Hit,
    cover4Hit,
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
    main10Hit,
    cover4Hit,
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
   Web Push通知 V6.6.6
   - iPhone/iPadは「ホーム画面に追加」したWebアプリから通知許可
   - VAPID鍵はD1で自動生成
   - Push本文はService Workerが最新メタ情報を取得して表示
========================================================= */

function bytesToBase64Url(bytes) {
  let binary = "";
  const arr =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes);

  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function textToBase64Url(text) {
  return bytesToBase64Url(
    new TextEncoder().encode(
      String(text || "")
    )
  );
}

function base64UrlToBytes(value) {
  const normalized =
    String(value || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  const padding =
    "=".repeat(
      (4 - normalized.length % 4) % 4
    );

  const binary =
    atob(normalized + padding);

  const out =
    new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }

  return out;
}

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

async function ensureWebPushVapid(env) {
  await ensureWebPushTables(env);

  let row =
    await env.DB.prepare(`
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

  const pair =
    await crypto.subtle.generateKey(
      {
        name:"ECDSA",
        namedCurve:"P-256"
      },
      true,
      ["sign", "verify"]
    );

  const publicJwk =
    await crypto.subtle.exportKey(
      "jwk",
      pair.publicKey
    );

  const privateJwk =
    await crypto.subtle.exportKey(
      "jwk",
      pair.privateKey
    );

  const x =
    base64UrlToBytes(
      publicJwk.x
    );

  const y =
    base64UrlToBytes(
      publicJwk.y
    );

  const rawPublic =
    new Uint8Array(65);

  rawPublic[0] = 4;
  rawPublic.set(x, 1);
  rawPublic.set(y, 33);

  const publicKey =
    bytesToBase64Url(
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
  `)
    .bind(
      JSON.stringify(publicJwk),
      JSON.stringify(privateJwk),
      publicKey
    )
    .run();

  row =
    await env.DB.prepare(`
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
      "Web Push用VAPID鍵の初期化に失敗しました"
    );
  }

  return row;
}

async function buildVapidAuthorization(
  endpoint,
  vapid
) {
  const audience =
    new URL(endpoint).origin;

  const header =
    textToBase64Url(
      JSON.stringify({
        typ:"JWT",
        alg:"ES256"
      })
    );

  const payload =
    textToBase64Url(
      JSON.stringify({
        aud:audience,
        exp:
          Math.floor(Date.now() / 1000) +
          12 * 60 * 60,
        sub:WEB_PUSH_CONTACT
      })
    );

  const unsigned =
    `${header}.${payload}`;

  const privateKey =
    await crypto.subtle.importKey(
      "jwk",
      JSON.parse(vapid.private_jwk),
      {
        name:"ECDSA",
        namedCurve:"P-256"
      },
      false,
      ["sign"]
    );

  const signature =
    await crypto.subtle.sign(
      {
        name:"ECDSA",
        hash:"SHA-256"
      },
      privateKey,
      new TextEncoder().encode(unsigned)
    );

  const jwt =
    `${unsigned}.${bytesToBase64Url(signature)}`;

  return `vapid t=${jwt}, k=${vapid.public_key}`;
}

async function saveWebPushSubscription(
  env,
  subscription
) {
  await ensureWebPushTables(env);

  const endpoint =
    String(
      subscription?.endpoint || ""
    ).trim();

  if (!endpoint.startsWith("https://")) {
    throw new Error(
      "Push購読endpointが不正です"
    );
  }

  const p256dh =
    subscription?.keys?.p256dh ||
    subscription?.p256dh ||
    null;

  const auth =
    subscription?.keys?.auth ||
    subscription?.auth ||
    null;

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
  `)
    .bind(
      endpoint,
      p256dh,
      auth
    )
    .run();

  return true;
}

async function disableWebPushSubscription(
  env,
  endpoint
) {
  await ensureWebPushTables(env);

  await env.DB.prepare(`
    UPDATE web_push_subscriptions
    SET
      enabled=0,
      updated_at=CURRENT_TIMESTAMP
    WHERE endpoint = ?
  `)
    .bind(
      String(endpoint || "")
    )
    .run();
}

async function webPushStatus(env) {
  await ensureWebPushTables(env);

  const count =
    await env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) AS enabled_count
      FROM web_push_subscriptions
    `).first();

  const latest =
    await env.DB.prepare(`
      SELECT
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
      FROM web_push_events
      ORDER BY updated_at DESC
      LIMIT 1
    `).first();

  return {
    total:
      Number(count?.total || 0),
    enabled:
      Number(count?.enabled_count || 0),
    latest:
      latest || null
  };
}

async function sendEmptyWebPush(
  env,
  subscription,
  vapid
) {
  const authorization =
    await buildVapidAuthorization(
      subscription.endpoint,
      vapid
    );

  const response =
    await fetch(
      subscription.endpoint,
      {
        method:"POST",
        headers:{
          "TTL":"120",
          "Urgency":"high",
          "Authorization":authorization
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
    `)
      .bind(
        nowJST(),
        subscription.id
      )
      .run();

    return {
      ok:true,
      status:response.status
    };
  }

  const detail =
    await response.text();

  if (
    response.status === 404 ||
    response.status === 410
  ) {
    await env.DB.prepare(`
      UPDATE web_push_subscriptions
      SET
        enabled=0,
        last_error=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `)
      .bind(
        `HTTP ${response.status}`,
        subscription.id
      )
      .run();
  } else {
    await env.DB.prepare(`
      UPDATE web_push_subscriptions
      SET
        last_error=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `)
      .bind(
        `HTTP ${response.status}: ${String(detail || "").slice(0, 180)}`,
        subscription.id
      )
      .run();
  }

  return {
    ok:false,
    status:response.status,
    error:
      String(detail || "")
        .slice(0, 240)
  };
}

async function sendWebPushEvent(
  env,
  event
) {
  await ensureWebPushTables(env);

  const existing =
    await env.DB.prepare(`
      SELECT
        event_key,
        status
      FROM web_push_events
      WHERE event_key=?
      LIMIT 1
    `)
      .bind(event.eventKey)
      .first();

  if (existing?.status === "SENT") {
    return {
      ok:true,
      status:"ALREADY_SENT",
      sent:0,
      failed:0
    };
  }

  const subscriptionsResult =
    await env.DB.prepare(`
      SELECT
        id,
        endpoint
      FROM web_push_subscriptions
      WHERE enabled=1
      ORDER BY id ASC
    `).all();

  const subscriptions =
    subscriptionsResult.results || [];

  if (!subscriptions.length) {
    return {
      ok:true,
      status:"NO_SUBSCRIBERS",
      sent:0,
      failed:0
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
  `)
    .bind(
      event.eventKey,
      event.eventType,
      event.title,
      event.body,
      event.targetUrl || "/api/s-picks-view"
    )
    .run();

  const vapid =
    await ensureWebPushVapid(env);

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const subscription of subscriptions) {
    try {
      const result =
        await sendEmptyWebPush(
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
        error?.message ||
        String(error)
      );
    }
  }

  const status =
    sent > 0
      ? "SENT"
      : "ERROR";

  await env.DB.prepare(`
    UPDATE web_push_events
    SET
      status=?,
      sent_count=?,
      failed_count=?,
      error_text=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE event_key=?
  `)
    .bind(
      status,
      sent,
      failed,
      errors.length
        ? errors.slice(0, 5).join(" | ")
        : null,
      event.eventKey
    )
    .run();

  return {
    ok:sent > 0,
    status,
    sent,
    failed,
    errors
  };
}

async function runWebPushNotifications(
  env,
  raceDate = todayJST()
) {
  await ensureWebPushTables(env);

  if (!WEB_PUSH_S_BET_ENABLED) {
    return {
      ok:true,
      status:"DISABLED",
      candidates:0,
      sent:0,
      failed:0
    };
  }

  const picks =
    (await listSLinePredictions(
      env,
      raceDate
    ))
      .filter(
        pick =>
          (pick.confidence === "S" && ["BET", "PASS"].includes(pick.decision)) ||
          isManshuHigh(pick, env)
      );

  let candidates = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const now = Date.now();

  for (const pick of picks) {
    let minutesUntil = null;

    if (pick.deadlineJST) {
      const ms =
        new Date(
          pick.deadlineJST
        ).getTime();

      if (Number.isFinite(ms)) {
        minutesUntil =
          (ms - now) / 60000;
      }
    }

    if (
      minutesUntil !== null &&
      (
        minutesUntil <= 0 ||
        minutesUntil > WEB_PUSH_FINAL_MAX_MINUTES
      )
    ) {
      skipped++;
      continue;
    }

    candidates++;

    const score =
      pick.stableScore == null
        ? "-"
        : Number(pick.stableScore).toFixed(1);

    const result =
      await sendWebPushEvent(
        env,
        {
          eventKey:
            pick.confidence === "S" && pick.decision === "BET"
              ? `SBET:${pick.raceKey}`
              : pick.confidence === "S"
                ? `SPASS:${pick.raceKey}`
                : `MANSHU:${pick.raceKey}`,
          eventType:"PICK",
          title:
            `${pick.confidence === "S" ? pick.decision === "PASS" ? "⚠️ S見送り" : "🔥 S勝負" : "💥 万舟高確率"}｜${pick.venue} ${pick.rno}R`,
          body:
            `締切 ${pick.deadline || "-"}｜万舟推定 ${Number.isFinite(pick.manshuProbability) ? (pick.manshuProbability * 100).toFixed(1) + "%" : "-"}｜Sスコア ${score}`,
          targetUrl:
            "/#auto-predictions"
        }
      );

    if (result.status === "SENT") {
      sent += Number(result.sent || 0);
    } else if (result.status === "ERROR") {
      failed += Number(result.failed || 1);
    }
  }

  return {
    ok:failed === 0,
    status:
      failed > 0
        ? "WARN"
        : "OK",
    candidates,
    sent,
    failed,
    skipped
  };
}

async function runWebPushDailySummary(
  env,
  raceDate = todayJST()
) {
  if (!WEB_PUSH_DAILY_SUMMARY_ENABLED) {
    return {
      ok:true,
      status:"DISABLED",
      sent:0
    };
  }

  let official;

  try {
    official =
      await officialDayEndState(
        raceDate
      );
  } catch (error) {
    return {
      ok:false,
      status:"OFFICIAL_CHECK_ERROR",
      sent:0,
      error:
        error?.message ||
        String(error)
    };
  }

  if (!official.ready) {
    return {
      ok:true,
      status:official.status,
      sent:0
    };
  }

  const learningState =
    await learningDayResultState(
      env,
      raceDate
    );

  const pendingFallbackMs =
    official.pendingFallbackAt
      ? new Date(official.pendingFallbackAt).getTime()
      : Number.POSITIVE_INFINITY;

  if (
    learningState.pending > 0 &&
    Date.now() < pendingFallbackMs
  ) {
    return {
      ok:true,
      status:"WAIT_RESULTS",
      sent:0
    };
  }

  if (learningState.finished <= 0) {
    return {
      ok:true,
      status:"NO_AI_RESULTS",
      sent:0
    };
  }

  return await sendWebPushEvent(
    env,
    {
      eventKey:
        `DAILY:${raceDate}`,
      eventType:"DAILY_SUMMARY",
      title:
        "📊 うさLAB｜本日のAI成績",
      body:
        `本日の集計が完了しました。AI分析結果 ${learningState.finished}R｜タップして成績を確認`,
      targetUrl:
        "/api/s-picks-view"
    }
  );
}

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
      title: '🐰🚤 うさLAB｜競艇AI予想',
      body: '新しいAI通知があります。タップして確認してください。',
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

    await self.registration.showNotification(meta.title || '🐰🚤 うさLAB', {
      body: meta.body || '新しい通知があります',
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

function webPushManifest() {
  return {
    name:
      "うさLAB｜競艇AI予想",
    short_name:
      "うさLAB",
    start_url:
      "/api/s-picks-view",
    scope:
      "/api/",
    display:
      "standalone",
    background_color:
      "#f7f3ff",
    theme_color:
      "#8d72c7",
    description:
      "うさLAB 競艇AI予想・S評価一覧"
  };
}

/* =========================================================
   LINE自動通知 V6.5.5
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
                : "（オッズ未取得）")
          )
          .join("\n")
      : "-";

  const cover =
    Array.isArray(pick.cover4) &&
    pick.cover4.length
      ? pick.cover4
          .slice(0, 4)
          .map(
            (bet, index) =>
              `${index + 7}. ${bet.combination}` +
              (bet.odds != null
                ? `（${bet.odds}倍）`
                : "（オッズ未取得）")
          )
          .join("\n")
      : "なし";

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
                : "（オッズ未取得）")
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

  const top10 =
    pick.top10Probability == null
      ? "-"
      : `${(Number(pick.top10Probability) * 100).toFixed(1)}%`;

  return `🐰🚤 うさLAB｜競艇AI予想

🔥 S勝負が出ました
${pick.venue} ${pick.rno}R
締切：${pick.deadline || "-"}
万舟推定確率：${formatManshu(pick)}
信頼度：${pick.stars || "-"}
Sスコア：${pick.stableScore == null ? "-" : Number(pick.stableScore).toFixed(1)}
1着推定力：${share}
上位6点確率：${top6}
10点内確率：${top10}
展開判定：${pick.strategy || "-"}
本線6点：AI総合順位

【本線6点】
${main}

【押さえ4点（7〜10位）】
${cover}

【穴候補】
${holes}

S勝負一覧
https://aged-hill-9a89.kono032424.workers.dev/api/s-picks-view

※的中や利益を保証するものではありません。`;
}

function buildLineSPassMessage(pick) {
  const main =
    Array.isArray(pick.main6) &&
    pick.main6.length
      ? pick.main6
          .slice(0, 6)
          .map(
            (bet, index) =>
              `${index + 1}. ${bet.combination}` +
              (bet.odds != null
                ? `（${bet.odds}倍）`
                : "（オッズ未取得）")
          )
          .join("\n")
      : "-";

  const cover =
    Array.isArray(pick.cover4) &&
    pick.cover4.length
      ? pick.cover4
          .slice(0, 4)
          .map(
            (bet, index) =>
              `${index + 7}. ${bet.combination}` +
              (bet.odds != null
                ? `（${bet.odds}倍）`
                : "（オッズ未取得）")
          )
          .join("\n")
      : "なし";

  const holes =
    Array.isArray(pick.holes) &&
    pick.holes.length
      ? pick.holes
          .slice(0, 5)
          .map(
            bet =>
              `${bet.combination}` +
              (bet.tier
                ? `｜${bet.tier}`
                : "") +
              (bet.odds != null
                ? `｜${bet.odds}倍`
                : "｜オッズ未取得")
          )
          .join("\n")
      : "なし";

  const share =
    pick.firstShare == null
      ? "-"
      : `${(Number(pick.firstShare) * 100).toFixed(1)}%`;

  const top6 =
    pick.top6Probability == null
      ? "-"
      : `${(Number(pick.top6Probability) * 100).toFixed(1)}%`;

  const top10 =
    pick.top10Probability == null
      ? "-"
      : `${(Number(pick.top10Probability) * 100).toFixed(1)}%`;

  const reasons =
    Array.isArray(pick.reasons) &&
    pick.reasons.length
      ? pick.reasons
          .slice(0, 4)
          .map(
            reason =>
              `・${reason}`
          )
          .join("\n")
      : "・S勝負基準に届かなかったため";

  return `🐰🚤 うさLAB｜競艇AI予想

⚠️ S評価・見送り
${pick.venue} ${pick.rno}R
締切：${pick.deadline || "-"}
万舟推定確率：${formatManshu(pick)}
信頼度：${pick.stars || "-"}
Sスコア：${pick.stableScore == null ? "-" : Number(pick.stableScore).toFixed(1)}
1着推定力：${share}
上位6点確率：${top6}
10点内確率：${top10}
展開判定：${pick.strategy || "-"}
本線6点：AI総合順位

【本線6点】
${main}

【押さえ4点（7〜10位）】
${cover}

【穴候補】
${holes}

【見送り理由】
${reasons}

⚠️ AI最終判定は見送りです。買い目は参考用として表示しています。

S勝負・S見送り一覧
https://aged-hill-9a89.kono032424.workers.dev/api/s-picks-view

※的中や利益を保証するものではありません。`;
}

function buildLineEarlyMessage(pick) {
  const share =
    pick.firstShare == null
      ? "-"
      : `${(Number(pick.firstShare) * 100).toFixed(1)}%`;

  const top6 =
    pick.top6Probability == null
      ? "-"
      : `${(Number(pick.top6Probability) * 100).toFixed(1)}%`;

  const top10 =
    pick.top10Probability == null
      ? "-"
      : `${(Number(pick.top10Probability) * 100).toFixed(1)}%`;

  const current =
    pick.decision === "BET"
      ? "🔥 S勝負"
      : "⚠️ S見送り";

  return `🐰🚤 うさLAB｜競艇AI予想

🟡 S判定を早めに検出
${pick.venue} ${pick.rno}R
締切：${pick.deadline || "-"}
現時点判定：${current}
信頼度：${pick.stars || "-"}
Sスコア：${pick.stableScore == null ? "-" : Number(pick.stableScore).toFixed(1)}
1着推定力：${share}
上位6点確率：${top6}
10点内確率：${top10}
展開判定：${pick.strategy || "-"}
本線6点：AI総合順位

締切35分以内になったら最終LINEを送ります。

※オッズ・直前情報の変化により内容が変わる場合があります。`;
}

function formatManshu(pick) {
  return Number.isFinite(pick.manshuProbability)
    ? `${(pick.manshuProbability * 100).toFixed(1)}%（3連単100円あたり払戻1万円以上）`
    : "オッズ未確定";
}
function buildLineManshuMessage(pick, env) {
  const examples = (pick.highOddsBets || []).slice(0, 3)
    .map(bet => `${bet.combination} ${Number(bet.odds).toFixed(1)}倍`)
    .join(" / ");
  return `🐰🚤 うさLAB｜競艇AI予想\n💥 万舟高確率（${manshuThreshold(env)}%以上）\n${pick.venue} ${pick.rno}R　締切 ${pick.deadline || "-"}\n万舟推定確率：${formatManshu(pick)}\n参考組み合わせ：${examples || "-"}\n評価：${pick.confidence}／購入指示ではありません。\n予想一覧：https://aged-hill-9a89.kono032424.workers.dev/\n※予想時点のオッズによる推定であり、的中・払戻を保証しません。`;
}

function lineNotificationKey(
  pick,
  stage
) {
  if (
    stage === "EARLY"
  ) {
    return `EARLY:${pick.raceKey}`;
  }

  if (
    pick.decision === "PASS"
    && pick.confidence === "S"
  ) {
    return `PASS:${pick.raceKey}`;
  }

  if (pick.confidence !== "S") return `MANSHU:${pick.raceKey}`;

  /*
    S勝負はV6.5.4までの送信履歴を
    そのまま引き継ぐためraceKeyを使用。
  */
  return pick.raceKey;
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
      pick.notificationKey ||
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


/* =========================================================
   V6.5.8 締切時刻フォールバック
   - 旧データなどで predictions.deadline が空でも、公式レース一覧から補完
   - 補完できた締切はD1へ書き戻し、次回以降の再取得を減らす
========================================================= */
async function hydratePredictionDeadlines(
  env,
  raceDate,
  rows
) {
  const targets =
    (rows || []).filter(
      row =>
        !row.deadline ||
        !row.deadline_jst
    );

  if (!targets.length) {
    return rows || [];
  }

  const venueCodes =
    [...new Set(
      targets
        .map(row => String(row.jcd || "").padStart(2, "0"))
        .filter(jcd => /^\d{2}$/.test(jcd))
    )];

  const venueMaps =
    new Map();

  for (const jcd of venueCodes) {
    try {
      const data =
        await venueData(
          raceDate,
          jcd
        );

      venueMaps.set(
        jcd,
        new Map(
          (data.races || []).map(
            race => [
              Number(race.rno),
              race
            ]
          )
        )
      );
    } catch (error) {
      // 締切補完に失敗しても一覧・LINE自体は止めない。
    }
  }

  for (const row of targets) {
    const jcd =
      String(row.jcd || "")
        .padStart(2, "0");

    const race =
      venueMaps
        .get(jcd)
        ?.get(Number(row.rno));

    if (!race) {
      continue;
    }

    const deadline =
      row.deadline ||
      race.deadline ||
      null;

    const deadlineJST =
      row.deadline_jst ||
      race.deadlineJST ||
      null;

    row.deadline =
      deadline;

    row.deadline_jst =
      deadlineJST;

    if (
      deadline ||
      deadlineJST
    ) {
      try {
        await env.DB
          .prepare(`
            UPDATE predictions
            SET
              deadline = COALESCE(?, deadline),
              deadline_jst = COALESCE(?, deadline_jst),
              updated_at = CURRENT_TIMESTAMP
            WHERE race_key = ?
          `)
          .bind(
            deadline,
            deadlineJST,
            row.race_key
          )
          .run();
      } catch (error) {
        // 表示には補完値を使えるので、DB書き戻し失敗は致命扱いにしない。
      }
    }
  }

  return rows || [];
}

async function listSLinePredictions(
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
      `)
      .bind(
        raceDate
      )
      .all();

  const rows =
    result.results || [];

  await hydratePredictionDeadlines(
    env,
    raceDate,
    rows
  );

  return rows.map(
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

      const cover4 =
        Array.isArray(
          snapshot.bets
        )
          ? snapshot.bets
              .slice(6, 10)
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
        manshuProbability: snapshot.manshu?.probability ?? null,
        manshuCombinations: snapshot.manshu?.combinations ?? null,
        highOddsBets: (snapshot.allBetRanking || [])
          .filter(bet => Number(bet.odds) >= 100)
          .sort((a, b) => Number(b.probability) - Number(a.probability))
          .slice(0, 3),
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
        top10Probability:
          snapshot.sDecision
            ?.metrics
            ?.top10Probability ??
          snapshotTopNProbability(
            snapshot,
            10
          ),
        firstGap:
          snapshot.sDecision
            ?.metrics
            ?.firstGap ?? null,
        reasons:
          Array.isArray(
            snapshot.sDecision
              ?.reasons
          )
            ? snapshot.sDecision
                .reasons
            : [],
        main6,
        cover4,
        holes,
        updatedAt:
          row.updated_at
      };
    }
  ).filter(pick =>
    (pick.confidence === "S" && ["BET", "PASS"].includes(pick.decision)) ||
    isManshuHigh(pick, env)
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
      earlySent:0,
      sBetSent:0,
      sPassSent:0,
      skipped:0,
      failed:0,
      expired:0,
      results:[],
      error:
        "LINEのシークレットが未設定です"
    };
  }

  /*
    V6.6.5 LINE節約モード:
    - 自動通知はS勝負の最終通知だけ
    - 早期通知は停止
    - S見送り通知は停止
    - 日次集計は別処理で1日1回のみ
    - ダッシュボードにはS見送りも従来どおり残す
  */
  const allPicks =
    await listSLinePredictions(
      env,
      raceDate
    );

  const picks = allPicks.filter(pick =>
    (pick.confidence === "S" &&
      (LINE_PASS_NOTIFICATIONS_ENABLED || pick.decision === "BET")) ||
    isManshuHigh(pick, env)
  );

  const stateMap =
    await listLineNotificationStates(
      env,
      raceDate
    );

  let sent = 0;
  let earlySent = 0;
  let sBetSent = 0;
  let sPassSent = 0;
  let skipped = 0;
  let failed = 0;
  let expired = 0;
  const results = [];
  const now = Date.now();

  for (
    const pick of picks
  ) {
    let minutesUntil =
      null;

    if (pick.deadlineJST) {
      const deadlineMs =
        new Date(
          pick.deadlineJST
        ).getTime();

      if (
        Number.isFinite(
          deadlineMs
        )
      ) {
        minutesUntil =
          (
            deadlineMs -
            now
          )
          /
          60000;
      }
    }

    /*
      締切後は最終通知だけEXPIREDとして記録。
      早め通知の有無は問わない。
    */
    if (
      minutesUntil !== null
      &&
      minutesUntil <= 0
    ) {
      const finalKey =
        lineNotificationKey(
          pick,
          "FINAL"
        );

      const existing =
        stateMap.get(
          finalKey
        );

      if (
        existing?.status !== "SENT"
        &&
        existing?.status !== "EXPIRED"
      ) {
        const message =
          pick.confidence !== "S"
            ? buildLineManshuMessage(pick, env)
            : pick.decision === "PASS"
            ? buildLineSPassMessage(
                pick
              )
            : buildLineSBetMessage(
                pick
              );

        const statePick = {
          ...pick,
          notificationKey:
            finalKey
        };

        await saveLineNotificationState(
          env,
          statePick,
          "EXPIRED",
          message,
          "締切後のため通知しませんでした"
        );

        stateMap.set(
          finalKey,
          {
            race_key:
              finalKey,
            status:
              "EXPIRED"
          }
        );

        expired++;
      }

      skipped++;
      continue;
    }

    /*
      D1に手動保存された未来レースなど、
      50分より前はまだ通知しない。
    */
    if (
      minutesUntil !== null
      &&
      minutesUntil >
        AUTO_MAX_MINUTES
    ) {
      skipped++;
      continue;
    }

    /*
      早期通知OFF時は、締切35分より前ならまだ送らない。
      これで1レースにつきS勝負の最終通知1通だけにする。
    */
    if (
      !LINE_EARLY_NOTIFICATIONS_ENABLED
      &&
      minutesUntil !== null
      &&
      minutesUntil >
        LINE_FINAL_MAX_MINUTES
    ) {
      skipped++;
      continue;
    }

    const stage =
      LINE_EARLY_NOTIFICATIONS_ENABLED
      &&
      minutesUntil !== null
      &&
      minutesUntil >
        LINE_FINAL_MAX_MINUTES
        ? "EARLY"
        : "FINAL";

    const notificationKey =
      lineNotificationKey(
        pick,
        stage
      );

    const existing =
      stateMap.get(
        notificationKey
      );

    if (
      existing?.status === "SENT" ||
      existing?.status === "EXPIRED"
    ) {
      skipped++;
      continue;
    }

    const message =
      stage === "EARLY"
        ? buildLineEarlyMessage(
            pick
          )
        : pick.confidence !== "S"
          ? buildLineManshuMessage(pick, env)
          : pick.decision === "PASS"
          ? buildLineSPassMessage(
              pick
            )
          : buildLineSBetMessage(
              pick
            );

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
          race_key:
            notificationKey,
          status:
            "SENT"
        }
      );

      sent++;

      if (
        stage === "EARLY"
      ) {
        earlySent++;

      } else if (
        pick.decision === "PASS"
      ) {
        sPassSent++;

      } else {
        sBetSent++;
      }

      results.push({
        raceKey:
          pick.raceKey,
        notificationKey,
        venue:
          pick.venue,
        rno:
          pick.rno,
        decision:
          pick.decision,
        stage,
        minutesUntil:
          minutesUntil === null
            ? null
            : Math.round(
                minutesUntil *
                10
              ) / 10,
        status:
          "SENT"
      });

    } catch (error) {
      failed++;

      const errorText =
        error?.message ||
        String(error);

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
          race_key:
            notificationKey,
          status:
            "ERROR",
          error_text:
            errorText
        }
      );

      results.push({
        raceKey:
          pick.raceKey,
        notificationKey,
        venue:
          pick.venue,
        rno:
          pick.rno,
        decision:
          pick.decision,
        stage,
        status:
          "ERROR",
        error:
          errorText
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
    earlySent,
    sBetSent,
    sPassSent,
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
    earlySent:
      Number(result.earlySent || 0),
    sBetSent:
      Number(result.sBetSent || 0),
    sPassSent:
      Number(result.sPassSent || 0),
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

/* =========================================================
   V6.5.9 1日終了時LINE成績まとめ
   - 公式の当日開催場と最終締切を確認
   - 当日のAI学習レース結果がすべて確定してから送信
   - 1日1回だけ送信、失敗時は次回Cronで再試行
   - S勝負 / S見送り / ★★★★★ / 最高的中払戻を集計
========================================================= */

async function ensureDailySummaryTable(env) {
  await env.DB
    .prepare(`
      CREATE TABLE IF NOT EXISTS daily_summary_notifications (
        race_date TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'PENDING',
        sent_at TEXT,
        error_text TEXT,
        message_text TEXT,
        summary_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)
    .run();
}

async function getDailySummaryState(env, raceDate) {
  await ensureDailySummaryTable(env);

  return await env.DB
    .prepare(`
      SELECT
        race_date,
        status,
        sent_at,
        error_text,
        updated_at
      FROM daily_summary_notifications
      WHERE race_date = ?
      LIMIT 1
    `)
    .bind(raceDate)
    .first();
}

async function saveDailySummaryState(
  env,
  raceDate,
  status,
  message,
  summary,
  errorText = null
) {
  await ensureDailySummaryTable(env);

  await env.DB
    .prepare(`
      INSERT INTO daily_summary_notifications (
        race_date,
        status,
        sent_at,
        error_text,
        message_text,
        summary_json,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)

      ON CONFLICT(race_date)
      DO UPDATE SET
        status=excluded.status,
        sent_at=excluded.sent_at,
        error_text=excluded.error_text,
        message_text=excluded.message_text,
        summary_json=excluded.summary_json,
        updated_at=CURRENT_TIMESTAMP
    `)
    .bind(
      raceDate,
      status,
      status === "SENT"
        ? nowJST()
        : null,
      errorText,
      message || null,
      JSON.stringify(summary || null)
    )
    .run();
}

function jstClockHour() {
  return Number(
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:"Asia/Tokyo",
        hour:"2-digit",
        hour12:false
      }
    ).format(new Date())
  );
}

async function officialDayEndState(raceDate) {
  /*
    15時より前は日次集計判定を走らせない。
    通常の全場終了時刻より十分早く、外部取得回数も抑える。
  */
  if (
    raceDate === todayJST() &&
    jstClockHour() < 15
  ) {
    return {
      ready:false,
      status:"TOO_EARLY",
      venues:0,
      races:0,
      latestDeadlineJST:null
    };
  }

  const venueList =
    await venues(raceDate);

  if (!venueList.length) {
    return {
      ready:false,
      status:"NO_VENUES",
      venues:0,
      races:0,
      latestDeadlineJST:null
    };
  }

  const venueResults =
    await mapChunks(
      venueList,
      4,
      item =>
        venueData(
          raceDate,
          item.jcd
        )
    );

  let raceCount = 0;
  let latestDeadlineMs = 0;
  let latestDeadlineJST = null;
  let missingDeadline = 0;
  let venueErrors = 0;

  for (const result of venueResults) {
    if (result.status !== "fulfilled") {
      venueErrors++;
      continue;
    }

    for (const race of result.value?.races || []) {
      raceCount++;

      if (!race.deadlineJST) {
        missingDeadline++;
        continue;
      }

      const ms =
        new Date(race.deadlineJST)
          .getTime();

      if (
        Number.isFinite(ms) &&
        ms > latestDeadlineMs
      ) {
        latestDeadlineMs = ms;
        latestDeadlineJST =
          race.deadlineJST;
      }
    }
  }

  if (
    venueErrors > 0 ||
    !latestDeadlineMs
  ) {
    return {
      ready:false,
      status:"WAIT_OFFICIAL_DATA",
      venues:venueList.length,
      races:raceCount,
      venueErrors,
      missingDeadline,
      latestDeadlineJST
    };
  }

  /*
    最終締切直後ではなく8分待つ。
    通常はD1の未確定結果が0になってから送る。
    取消などで未確定行が残る場合でも、最終締切60分後には
    確定済み分で日次集計を送れるようにする。
  */
  const readyAtMs =
    latestDeadlineMs +
    8 * 60000;

  const pendingFallbackAtMs =
    latestDeadlineMs +
    60 * 60000;

  return {
    ready:
      Date.now() >= readyAtMs,
    status:
      Date.now() >= readyAtMs
        ? "ALL_RACES_ENDED"
        : "WAIT_LAST_RACE",
    venues:venueList.length,
    races:raceCount,
    venueErrors,
    missingDeadline,
    latestDeadlineJST,
    readyAt:
      new Date(readyAtMs)
        .toISOString(),
    pendingFallbackAt:
      new Date(pendingFallbackAtMs)
        .toISOString()
  };
}

async function learningDayResultState(
  env,
  raceDate
) {
  const row =
    await env.DB
      .prepare(`
        SELECT
          COUNT(*) AS total_count,
          SUM(CASE WHEN finished=1 THEN 1 ELSE 0 END) AS finished_count,
          SUM(CASE WHEN finished=0 THEN 1 ELSE 0 END) AS pending_count
        FROM learning_races
        WHERE race_date = ?
          AND historical_import = 0
      `)
      .bind(raceDate)
      .first();

  return {
    total:
      Number(row?.total_count || 0),
    finished:
      Number(row?.finished_count || 0),
    pending:
      Number(row?.pending_count || 0)
  };
}

async function bestCandidateHitForDate(
  env,
  raceDate
) {
  const result =
    await env.DB
      .prepare(`
        SELECT
          race_key,
          venue,
          rno,
          race_data_json,
          result_json
        FROM learning_races
        WHERE race_date = ?
          AND finished = 1
          AND race_data_json IS NOT NULL
          AND result_json IS NOT NULL
      `)
      .bind(raceDate)
      .all();

  let best = null;

  for (const row of result.results || []) {
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

    if (!snapshot || !raceResult) {
      continue;
    }

    const check =
      resultCheckFromStoredResult(
        snapshot,
        raceResult
      );

    if (
      !check ||
      (!check.main10Hit && !check.holeHit)
    ) {
      continue;
    }

    const payout =
      Number(check.payout || 0);

    if (
      !Number.isFinite(payout) ||
      payout <= 0
    ) {
      continue;
    }

    if (!best || payout > best.payout) {
      best = {
        raceKey:row.race_key,
        venue:row.venue,
        rno:Number(row.rno),
        combination:check.combination,
        payout,
        type:
          check.main6Hit
            ? "本線6点"
            : check.cover4Hit
              ? "押さえ4点"
              : "穴候補"
      };
    }
  }

  return best;
}

function formatRateLine(hits, races) {
  const n = Number(races || 0);
  const h = Number(hits || 0);
  const rate =
    n > 0
      ? (h / n * 100).toFixed(1)
      : "0.0";

  return `${h}/${n}（${rate}%）`;
}

function formatJapaneseDateKey(raceDate) {
  const s = String(raceDate || "");

  if (!/^\d{8}$/.test(s)) {
    return s;
  }

  return (
    `${Number(s.slice(0,4))}年` +
    `${Number(s.slice(4,6))}月` +
    `${Number(s.slice(6,8))}日`
  );
}

function buildDailySummaryMessage(
  raceDate,
  official,
  learningState,
  stats,
  bestHit
) {
  const bestText =
    bestHit
      ? `${bestHit.venue} ${bestHit.rno}R\n${bestHit.combination}｜${bestHit.payout.toLocaleString("ja-JP")}円（${bestHit.type}）`
      : "本線10点・穴候補内の的中なし";

  return `🐰🚤 うさLAB｜本日のAI成績
${formatJapaneseDateKey(raceDate)}

🏁 本日の全開催終了
公式開催：${official.venues}場 / ${official.races}R
AI分析結果確定：${learningState.finished}R${learningState.pending > 0 ? `\n未確定・取消等：${learningState.pending}R` : ""}

🔥 S勝負
対象：${stats.sBetRaces}R
本線6点：${formatRateLine(stats.sBetMain6Hits, stats.sBetRaces)}
10点（6＋押さえ4）：${formatRateLine(stats.sBetMain10Hits, stats.sBetRaces)}
10点＋穴：${formatRateLine(stats.sBetMain10PlusHoleHits, stats.sBetRaces)}

⚠️ S見送り
対象：${stats.sPassRaces}R
本線6点：${formatRateLine(stats.sPassMain6Hits, stats.sPassRaces)}
10点（6＋押さえ4）：${formatRateLine(stats.sPassMain10Hits, stats.sPassRaces)}
🎯 穴候補：${formatRateLine(stats.sPassHoleHits, stats.sPassRaces)}
10点＋穴：${formatRateLine(stats.sPassMain10PlusHoleHits, stats.sPassRaces)}

★★★★★
対象：${stats.fiveStarRaces}R
本線6点：${formatRateLine(stats.fiveStarMain6Hits, stats.fiveStarRaces)}
10点（6＋押さえ4）：${formatRateLine(stats.fiveStarMain10Hits, stats.fiveStarRaces)}

🏆 今日の最高的中払戻
${bestText}

📊 全AI分析
本線6点：${formatRateLine(stats.main6Hits, stats.races)}
10点（6＋押さえ4）：${formatRateLine(stats.main10Hits, stats.races)}
10点＋穴：${formatRateLine(stats.main10PlusHoleHits, stats.races)}

※払戻金は100円購入時の公式払戻額です。
※実際の購入金額・利益・収支を示すものではありません。
※AI予想は的中や利益を保証するものではありません。`;
}

async function runDailySummaryNotification(
  env,
  raceDate,
  options = {}
) {
  const force =
    Boolean(options.force);

  if (!lineNotificationConfigured(env)) {
    return {
      ok:true,
      configured:false,
      status:"NOT_CONFIGURED",
      sent:false
    };
  }

  const existing =
    await getDailySummaryState(
      env,
      raceDate
    );

  if (
    existing?.status === "SENT" &&
    !options.resend
  ) {
    return {
      ok:true,
      configured:true,
      status:"ALREADY_SENT",
      sent:false,
      sentAt:existing.sent_at || null
    };
  }

  let official;

  try {
    official =
      await officialDayEndState(
        raceDate
      );
  } catch (error) {
    return {
      ok:false,
      configured:true,
      status:"OFFICIAL_CHECK_ERROR",
      sent:false,
      error:
        error?.message ||
        String(error)
    };
  }

  if (!force && !official.ready) {
    return {
      ok:true,
      configured:true,
      status:official.status,
      sent:false,
      official
    };
  }

  const learningState =
    await learningDayResultState(
      env,
      raceDate
    );

  const pendingFallbackMs =
    official.pendingFallbackAt
      ? new Date(official.pendingFallbackAt).getTime()
      : Number.POSITIVE_INFINITY;

  if (
    !force &&
    learningState.pending > 0 &&
    Date.now() < pendingFallbackMs
  ) {
    return {
      ok:true,
      configured:true,
      status:"WAIT_RESULTS",
      sent:false,
      official,
      learningState
    };
  }

  if (learningState.finished <= 0) {
    return {
      ok:true,
      configured:true,
      status:"NO_AI_RESULTS",
      sent:false,
      official,
      learningState
    };
  }

  const overview =
    await performanceOverview(env);

  const stats =
    overview.today;

  const bestHit =
    await bestCandidateHitForDate(
      env,
      raceDate
    );

  const summary = {
    raceDate,
    official,
    learningState,
    stats,
    bestHit,
    generatedAt:nowJST()
  };

  const message =
    buildDailySummaryMessage(
      raceDate,
      official,
      learningState,
      stats,
      bestHit
    );

  try {
    await sendLinePush(
      env,
      message
    );

    await saveDailySummaryState(
      env,
      raceDate,
      "SENT",
      message,
      summary,
      null
    );

    return {
      ok:true,
      configured:true,
      status:"SENT",
      sent:true,
      summary
    };

  } catch (error) {
    const errorText =
      error?.message ||
      String(error);

    try {
      await saveDailySummaryState(
        env,
        raceDate,
        "ERROR",
        message,
        summary,
        errorText
      );
    } catch {}

    return {
      ok:false,
      configured:true,
      status:"ERROR",
      sent:false,
      error:errorText
    };
  }
}

function compactDailySummary(result) {
  if (!result) {
    return null;
  }

  return {
    configured:
      Boolean(result.configured),
    status:
      result.status || null,
    sent:
      Boolean(result.sent),
    error:
      result.error || null
  };
}

/* 過去30日を順次補完する。進捗は D1 に保存し、5分ごとに最大4Rを処理。 */
function shiftRaceDate(dateKey, days) {
  const key=String(dateKey);
  const date=new Date(Date.UTC(Number(key.slice(0,4)),Number(key.slice(4,6))-1,Number(key.slice(6,8))));
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10).replaceAll('-','');
}

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

async function readHistoricalBackfillState(env) {
  await ensureHistoricalBackfillState(env);
  const yesterday=jstDateKeyOffset(-1);
  let state=await env.DB.prepare('SELECT * FROM historical_results_backfill_state WHERE id=1').first();
  if (!state) {
    await env.DB.prepare(`INSERT INTO historical_results_backfill_state
      (id,cursor_date,last_yesterday) VALUES (1,?,?)`).bind(yesterday,yesterday).run();
    state=await env.DB.prepare('SELECT * FROM historical_results_backfill_state WHERE id=1').first();
  }
  if (state.last_yesterday!==yesterday) {
    state.priority_date=yesterday;
    state.priority_venue_index=0;
    state.priority_next_rno=1;
    state.failure_count=0;
    state.last_yesterday=yesterday;
  }
  return state;
}

async function writeHistoricalBackfillState(env,state) {
  await env.DB.prepare(`UPDATE historical_results_backfill_state SET
    cursor_date=?,venue_index=?,next_rno=?,priority_date=?,
    priority_venue_index=?,priority_next_rno=?,last_yesterday=?,
    failure_count=?,updated_at=CURRENT_TIMESTAMP WHERE id=1`)
    .bind(state.cursor_date,state.venue_index,state.next_rno,
      state.priority_date,state.priority_venue_index,state.priority_next_rno,
      state.last_yesterday,state.failure_count).run();
}

function makeHistoricalSnapshot(race,before,result,context) {
  const racers=mergeBefore(race.racers,before);
  const weights=blankWeights();
  const detailed=racers.map(r=>{
    const components=scoreComponents(r,racers);
    return {lane:r.lane,name:r.name,registration:r.registration,class:r.class,components,
      overallScore:overallScore(components,weights),
      firstScore:roleScore(components,weights,'first'),
      secondScore:roleScore(components,weights,'second'),
      thirdScore:roleScore(components,weights,'third')};
  });
  return {version:WORKER_VERSION,date:context.date,jcd:context.jcd,
    venue:context.venue,rno:context.rno,learningOnly:true,historicalImport:true,
    bets:[],holeBets:[],allBetRanking:[],racersDetailed:detailed,
    result,createdAt:new Date().toISOString()};
}

async function backfillOneRace(env,date,jcd,venue,rno) {
  const existing=await getLearningByRaceKey(env,makeRaceKey(date,jcd,rno));
  const savedSnapshot=parseJsonSafe(existing?.race_data_json,null);
  if (existing?.finished&&savedSnapshot?.racersDetailed?.length===6) return 'EXISTING';
  const savedResult=parseJsonSafe(existing?.result_json,null);
  const raceResult=existing?.finished&&savedResult?.finished
    ?savedResult:await resultData(date,jcd,rno);
  if (!raceResult.finished||!Array.isArray(raceResult.winningLanes)||raceResult.winningLanes.length<3)
    throw new Error('確定結果が取得できません');
  if (existing?.race_data_json&&savedSnapshot?.racersDetailed?.length===6) {
    await saveLearningRace(env,{race_date:date,jcd,venue,rno,result:raceResult,finished:true});
    return 'UPDATED';
  }
  // 結果を先に保存する。選手情報が欠けても確定結果は残す。
  if (!existing?.finished) {
    await saveLearningRace(env,{race_date:date,jcd,venue,rno,result:raceResult,
      finished:true,historical_import:!existing});
  }
  const [race,before]=await Promise.all([raceData(date,jcd,rno),beforeData(date,jcd,rno).catch(()=>({racers:[]}))]);
  if (race.racers?.length!==6) throw new Error('選手情報6艇が取得できません');
  const snapshot=makeHistoricalSnapshot(race,before,raceResult,{date,jcd,venue,rno});
  await saveLearningRace(env,{race_date:date,jcd,venue,rno,race:snapshot,before,
    result:raceResult,finished:true,historical_import:true});
  return existing?.finished?'ENRICHED':'IMPORTED';
}

async function runHistoricalBackfill(env) {
  const state=await readHistoricalBackfillState(env);
  const cutoff=jstDateKeyOffset(-30);
  const priority=Boolean(state.priority_date);
  const date=priority?state.priority_date:state.cursor_date;
  if (!date||date<cutoff) {
    if (!priority&&state.cursor_date) {state.cursor_date=null;await writeHistoricalBackfillState(env,state)}
    return {status:'COMPLETE',date:null,processed:0};
  }
  let venuesForDate;
  try {
    venuesForDate=await venues(date);
  } catch(error) {
    state.failure_count=Number(state.failure_count||0)+1;
    if(state.failure_count<3) {
      await writeHistoricalBackfillState(env,state);
      throw error;
    }
    console.error('USA_LAB_BACKFILL_DATE_SKIP',date,error?.message||String(error));
    state.failure_count=0;
    if(priority)state.priority_date=null;
    else state.cursor_date=shiftRaceDate(date,-1);
    await writeHistoricalBackfillState(env,state);
    return {status:'SKIPPED_DATE',date,processed:0};
  }
  let venueIndex=Number(priority?state.priority_venue_index:state.venue_index)||0;
  let rno=Number(priority?state.priority_next_rno:state.next_rno)||1;
  let processed=0,imported=0,enriched=0,existing=0,updated=0,skipped=0;
  while (venueIndex<venuesForDate.length&&processed<4) {
    const target=venuesForDate[venueIndex];
    let schedule;
    try {
      schedule=await venueData(date,target.jcd);
    } catch(error) {
      state.failure_count=Number(state.failure_count||0)+1;
      if(state.failure_count<3) {
        if(priority) {state.priority_venue_index=venueIndex;state.priority_next_rno=rno}
        else {state.venue_index=venueIndex;state.next_rno=rno}
        await writeHistoricalBackfillState(env,state);
        throw error;
      }
      console.error('USA_LAB_BACKFILL_VENUE_SKIP',date,target.jcd,error?.message||String(error));
      state.failure_count=0;
      skipped++;
      venueIndex++;
      rno=1;
      continue;
    }
    const available=new Set(schedule.races.map(r=>Number(r.rno)));
    while (rno<=12&&processed<4) {
      const current=rno;
      if (!available.has(current)) {rno++;continue}
      try {
        const result=await backfillOneRace(env,date,target.jcd,target.name,current);
        if (result==='IMPORTED') imported++;
        else if (result==='ENRICHED') enriched++;
        else if (result==='UPDATED') updated++;
        else existing++;
        state.failure_count=0;
        rno++;processed++;
      } catch(error) {
        state.failure_count=Number(state.failure_count||0)+1;
        console.error('USA_LAB_BACKFILL_RACE_ERROR',date,target.jcd,current,error?.message||String(error));
        if (state.failure_count>=3) {rno++;processed++;skipped++;state.failure_count=0}
        else {processed=4}
        break;
      }
    }
    if (rno>12) {venueIndex++;rno=1}
  }
  if (venueIndex>=venuesForDate.length) {
    if (priority) {state.priority_date=null;state.priority_venue_index=0;state.priority_next_rno=1}
    else {state.cursor_date=shiftRaceDate(date,-1);state.venue_index=0;state.next_rno=1}
  } else if (priority) {state.priority_venue_index=venueIndex;state.priority_next_rno=rno}
  else {state.venue_index=venueIndex;state.next_rno=rno}
  await writeHistoricalBackfillState(env,state);
  return {status:skipped?'PARTIAL':'RUNNING',date,venue:venuesForDate[Math.min(venueIndex,venuesForDate.length-1)]?.name,
    processed,imported,enriched,updated,existing,skipped,priority,cursorDate:state.cursor_date};
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

  let historicalBackfill=null;
  try {
    historicalBackfill=await runHistoricalBackfill(env);
  } catch (error) {
    errors.push(`BACKFILL: ${error?.message||String(error)}`);
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
      earlySent:0,
      sBetSent:0,
      sPassSent:0,
      skipped:0,
      failed:1,
      errors:[
        {
          error:lineError
        }
      ]
    };
  }

  let dailySummary =
    null;

  try {
    if (
      LINE_DAILY_SUMMARY_ENABLED
    ) {
      dailySummary =
        compactDailySummary(
          await runDailySummaryNotification(
            env,
            hd
          )
        );

      if (
        dailySummary?.status === "ERROR" ||
        dailySummary?.status === "OFFICIAL_CHECK_ERROR"
      ) {
        errors.push(
          `DAILY_SUMMARY: ${dailySummary.error || dailySummary.status}`
        );
      }
    } else {
      dailySummary = {
        configured:
          lineNotificationConfigured(env),
        status:
          "DISABLED",
        sent:false
      };
    }

  } catch (error) {
    const dailyError =
      error?.message ||
      String(error);

    errors.push(
      `DAILY_SUMMARY: ${dailyError}`
    );

    dailySummary = {
      configured:
        lineNotificationConfigured(env),
      status:"ERROR",
      sent:false,
      error:dailyError
    };
  }

  let webPushNotify = null;
  let webPushDaily = null;

  try {
    webPushNotify =
      await runWebPushNotifications(
        env,
        hd
      );
  } catch (error) {
    const pushError =
      error?.message ||
      String(error);

    errors.push(
      `WEB_PUSH: ${pushError}`
    );

    webPushNotify = {
      ok:false,
      status:"ERROR",
      sent:0,
      failed:1,
      error:pushError
    };
  }

  try {
    webPushDaily =
      await runWebPushDailySummary(
        env,
        hd
      );
  } catch (error) {
    const pushDailyError =
      error?.message ||
      String(error);

    errors.push(
      `WEB_PUSH_DAILY: ${pushDailyError}`
    );

    webPushDaily = {
      ok:false,
      status:"ERROR",
      sent:0,
      error:pushDailyError
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
    ) > 0
    ||
    dailySummary?.status === "ERROR"
    ||
    dailySummary?.status === "OFFICIAL_CHECK_ERROR"
    ||
    Number(webPushNotify?.failed || 0) > 0
    ||
    webPushDaily?.status === "ERROR"
    ||
    webPushDaily?.status === "OFFICIAL_CHECK_ERROR";

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
    historicalBackfill,
    lineNotify,
    dailySummary,
    webPushNotify,
    webPushDaily,
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
  await ensureHistoricalBackfillState(env);
  const historicalBackfillState=await env.DB.prepare("SELECT * FROM historical_results_backfill_state WHERE id=1").first();

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
          SUM(CASE WHEN status='SENT' AND race_key LIKE 'EARLY:%' THEN 1 ELSE 0 END) AS early_sent_count,
          SUM(CASE WHEN status='SENT' AND race_key LIKE 'PASS:%' THEN 1 ELSE 0 END) AS pass_sent_count,
          SUM(CASE WHEN status='SENT' AND race_key NOT LIKE 'EARLY:%' AND race_key NOT LIKE 'PASS:%' THEN 1 ELSE 0 END) AS bet_sent_count,
          SUM(CASE WHEN status='ERROR' THEN 1 ELSE 0 END) AS error_count
        FROM line_notifications
        WHERE race_date = ?
      `)
      .bind(
        todayJST()
      )
      .first();

  const dailySummaryState =
    await getDailySummaryState(
      env,
      todayJST()
    );

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
    historicalBackfill: historicalBackfillState,
    pendingLearningRaces:
      Number(
        pending?.count ||
        0
      ),
    lineNotification:{
      configured:
        lineNotificationConfigured(env),
      mode:
        "S_BET_FINAL_ONLY",
      earlyEnabled:
        LINE_EARLY_NOTIFICATIONS_ENABLED,
      passEnabled:
        LINE_PASS_NOTIFICATIONS_ENABLED,
      dailySummaryEnabled:
        LINE_DAILY_SUMMARY_ENABLED,
      todaySent:
        Number(
          lineToday?.sent_count ||
          0
        ),
      todayEarlySent:
        Number(
          lineToday?.early_sent_count ||
          0
        ),
      todaySBetSent:
        Number(
          lineToday?.bet_sent_count ||
          0
        ),
      todaySPassSent:
        Number(
          lineToday?.pass_sent_count ||
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
    webPush:
      await webPushStatus(env),
    dailySummary:{
      status:
        dailySummaryState?.status ||
        null,
      sentAt:
        dailySummaryState?.sent_at ||
        null,
      error:
        dailySummaryState?.error_text ||
        null,
      updatedAt:
        dailySummaryState?.updated_at ||
        null
    },
    storage:
      await storageStats(
        env
      )
  };
}


/* =========================
   S評価ダッシュボード
   V6.5.6
   - 🔥 S勝負 + ⚠️ S見送りを同じ一覧に表示
   - フィルタ切替
   - 見送り本線 / 見送り穴の結果を区別
========================= */

function resultCheckFromStoredResult(
  snapshot,
  raceResult
) {
  if (!raceResult) {
    return null;
  }

  const combination =
    raceResult.combination ||
    (
      Array.isArray(
        raceResult.winningLanes
      ) &&
      raceResult.winningLanes.length >= 3
        ? raceResult.winningLanes
            .slice(0, 3)
            .join("-")
        : null
    );

  if (!combination) {
    return null;
  }

  const main15 =
    Array.isArray(
      snapshot?.bets
    )
      ? snapshot.bets
      : [];

  const main6 =
    main15.slice(
      0,
      6
    );

  const main10 =
    main15.slice(
      0,
      10
    );

  const cover4 =
    main15.slice(
      6,
      10
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

  const main10Hit =
    main10.some(
      bet =>
        bet?.combination ===
        combination
    );

  const cover4Hit =
    cover4.some(
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

  return {
    checkedAt:
      raceResult.checkedAt ||
      null,

    combination,

    payout:
      raceResult.payout ??
      null,

    main6Hit,
    main10Hit,
    cover4Hit,
    main15Hit,
    holeHit,

    hit:
      main10Hit ||
      main15Hit ||
      holeHit
  };
}

async function listSBetPredictions(
  env,
  raceDate,
  includePass = false
) {
  const decisionCondition =
    includePass
      ? "AND p.decision IN ('BET', 'PASS')"
      : "AND p.decision = 'BET'";

  const result =
    await env.DB
      .prepare(`
        SELECT
          p.race_key,
          p.race_date,
          p.jcd,
          p.venue,
          p.rno,
          p.deadline,
          p.deadline_jst,
          p.analyzed_at,
          p.confidence,
          p.decision,
          p.stable_score,
          p.strategy,
          p.prediction_json,
          p.note_title,
          p.note_body,
          p.posted,
          p.updated_at,
          lr.result_json AS learning_result_json,
          lr.finished AS learning_finished

        FROM predictions p

        LEFT JOIN learning_races lr
          ON lr.race_key = p.race_key

        WHERE p.race_date = ?
          AND p.confidence = 'S'
          ${decisionCondition}

        ORDER BY
          CASE
            WHEN p.deadline_jst IS NULL THEN 1
            ELSE 0
          END ASC,
          p.deadline_jst ASC,
          p.rno ASC
      `)
      .bind(
        raceDate
      )
      .all();

  const rows =
    result.results || [];

  await hydratePredictionDeadlines(
    env,
    raceDate,
    rows
  );

  return rows.map(
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

      const cover4 =
        Array.isArray(
          snapshot.bets
        )
          ? snapshot.bets
              .slice(6, 10)
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

      /*
        V6.5.8:
        predictions.prediction_json に resultCheck が無くても、
        learning_races の確定結果をフォールバックとして使う。
        これでS勝負 / S見送り一覧から結果表示が消えない。
      */
      const learningResult =
        parseJsonSafe(
          row.learning_result_json,
          null
        );

      const storedResult =
        snapshot.result ||
        learningResult ||
        null;

      const storedResultCheck =
        snapshot.resultCheck ||
        resultCheckFromStoredResult(
          snapshot,
          storedResult
        );

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
        top10Probability:
          snapshot.sDecision
            ?.metrics
            ?.top10Probability ??
          snapshotTopNProbability(
            snapshot,
            10
          ),

        firstGap:
          snapshot.sDecision
            ?.metrics
            ?.firstGap ?? null,

        reasons:
          Array.isArray(
            snapshot.sDecision
              ?.reasons
          )
            ? snapshot.sDecision
                .reasons
            : [],

        main6,
        cover4,
        holes,

        result:
          storedResult,

        resultCheck:
          storedResultCheck,

        resultSource:
          snapshot.resultCheck
            ? "prediction"
            : storedResultCheck
              ? "learning_races"
              : null,

        resultFinished:
          Boolean(
            row.learning_finished ||
            storedResultCheck
          ),

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
   V6.5.8 D1自動成績集計
   - ブラウザlocalStorageではなくD1を正本にする
   - 自動分析したS/A/Bの結果確定レースを集計
   - 本線6点 / 穴候補 / S勝負 / S見送り / ★★★★★
   - S見送りは本線的中と穴的中を分けて集計
========================================================= */

function blankPerformanceBucket() {
  return {
    races:0,
    // All predicted races are hypothetical purchases. S勝負 is the actionable subset.
    main6Stake:0,
    main6Return:0,
    main10Stake:0,
    main10Return:0,
    sBetMain6Stake:0,
    sBetMain6Return:0,
    sBetMain10Stake:0,
    sBetMain10Return:0,
    missingPayoutRaces:0,
    sBetMissingPayoutRaces:0,
    main6Hits:0,
    main10Hits:0,
    main15Hits:0,
    holeHits:0,
    candidateHits:0,
    main10PlusHoleHits:0,

    sBetRaces:0,
    sBetMain6Hits:0,
    sBetMain10Hits:0,
    sBetHoleHits:0,
    sBetCandidateHits:0,
    sBetMain10PlusHoleHits:0,

    sPassRaces:0,
    sPassMain6Hits:0,
    sPassMain10Hits:0,
    sPassHoleHits:0,
    sPassCandidateHits:0,
    sPassMain10PlusHoleHits:0,

    fiveStarRaces:0,
    fiveStarMain6Hits:0,
    fiveStarMain10Hits:0,
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
    main6Profit:bucket.main6Return - bucket.main6Stake,
    main6RecoveryRate:bucket.main6Stake > 0 ? bucket.main6Return / bucket.main6Stake * 100 : null,
    main10Profit:bucket.main10Return - bucket.main10Stake,
    main10RecoveryRate:bucket.main10Stake > 0 ? bucket.main10Return / bucket.main10Stake * 100 : null,
    sBetMain6Profit:bucket.sBetMain6Return - bucket.sBetMain6Stake,
    sBetMain6RecoveryRate:bucket.sBetMain6Stake > 0 ? bucket.sBetMain6Return / bucket.sBetMain6Stake * 100 : null,
    sBetMain10Profit:bucket.sBetMain10Return - bucket.sBetMain10Stake,
    sBetMain10RecoveryRate:bucket.sBetMain10Stake > 0 ? bucket.sBetMain10Return / bucket.sBetMain10Stake * 100 : null,

    main6HitRate:
      performanceRate(
        bucket.main6Hits,
        bucket.races
      ),

    main10HitRate:
      performanceRate(
        bucket.main10Hits,
        bucket.races
      ),

    main15HitRate:
      performanceRate(
        bucket.main15Hits,
        bucket.races
      ),

    main10PlusHoleHitRate:
      performanceRate(
        bucket.main10PlusHoleHits,
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

    sBetMain10HitRate:
      performanceRate(
        bucket.sBetMain10Hits,
        bucket.sBetRaces
      ),

    sBetHoleHitRate:
      performanceRate(
        bucket.sBetHoleHits,
        bucket.sBetRaces
      ),

    sBetMain10PlusHoleHitRate:
      performanceRate(
        bucket.sBetMain10PlusHoleHits,
        bucket.sBetRaces
      ),

    sBetCandidateHitRate:
      performanceRate(
        bucket.sBetCandidateHits,
        bucket.sBetRaces
      ),

    sPassMain6HitRate:
      performanceRate(
        bucket.sPassMain6Hits,
        bucket.sPassRaces
      ),

    sPassMain10HitRate:
      performanceRate(
        bucket.sPassMain10Hits,
        bucket.sPassRaces
      ),

    sPassHoleHitRate:
      performanceRate(
        bucket.sPassHoleHits,
        bucket.sPassRaces
      ),

    sPassMain10PlusHoleHitRate:
      performanceRate(
        bucket.sPassMain10PlusHoleHits,
        bucket.sPassRaces
      ),

    sPassCandidateHitRate:
      performanceRate(
        bucket.sPassCandidateHits,
        bucket.sPassRaces
      ),

    fiveStarMain6HitRate:
      performanceRate(
        bucket.fiveStarMain6Hits,
        bucket.fiveStarRaces
      ),

    fiveStarMain10HitRate:
      performanceRate(
        bucket.fiveStarMain10Hits,
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

  const main10 =
    main15.slice(
      0,
      10
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

  const main10Hit =
    main10.some(
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

  const main10PlusHoleHit =
    main10Hit ||
    holeHit;

  const isS =
    snapshot?.confidence === "S";

  const decision =
    snapshot?.sDecision?.status ||
    null;

  const isSBet =
    isS &&
    decision === "BET";

  const isSPass =
    isS &&
    decision === "PASS";

  const isFiveStar =
    isSBet &&
    Number(
      snapshot?.sDecision?.score ||
      0
    ) >= 80;

  // Official trifecta payouts are quoted for a 100-yen ticket.
  // Exclude races without a payout from monetary totals, while keeping their hit records.
  const payout = Number(result?.payout ?? result?.payoutPer100);
  if (Number.isFinite(payout) && payout > 0) {
    const stake6 = main6.length * 100;
    const stake10 = main10.length * 100;
    bucket.main6Stake += stake6;
    bucket.main10Stake += stake10;
    if (main6Hit) bucket.main6Return += payout;
    if (main10Hit) bucket.main10Return += payout;
    if (isSBet) {
      bucket.sBetMain6Stake += stake6;
      bucket.sBetMain10Stake += stake10;
      if (main6Hit) bucket.sBetMain6Return += payout;
      if (main10Hit) bucket.sBetMain10Return += payout;
    }
  } else {
    bucket.missingPayoutRaces++;
    if (isSBet) bucket.sBetMissingPayoutRaces++;
  }

  bucket.races++;

  if (main6Hit) {
    bucket.main6Hits++;
  }

  if (main10Hit) {
    bucket.main10Hits++;
  }

  if (main15Hit) {
    bucket.main15Hits++;
  }

  if (main10PlusHoleHit) {
    bucket.main10PlusHoleHits++;
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

    if (main10Hit) {
      bucket.sBetMain10Hits++;
    }

    if (holeHit) {
      bucket.sBetHoleHits++;
    }

    if (main10PlusHoleHit) {
      bucket.sBetMain10PlusHoleHits++;
    }

    if (candidateHit) {
      bucket.sBetCandidateHits++;
    }
  }

  if (isSPass) {
    bucket.sPassRaces++;

    if (main6Hit) {
      bucket.sPassMain6Hits++;
    }

    if (main10Hit) {
      bucket.sPassMain10Hits++;
    }

    if (holeHit) {
      bucket.sPassHoleHits++;
    }

    if (main10PlusHoleHit) {
      bucket.sPassMain10PlusHoleHits++;
    }

    if (candidateHit) {
      bucket.sPassCandidateHits++;
    }
  }

  if (isFiveStar) {
    bucket.fiveStarRaces++;

    if (main6Hit) {
      bucket.fiveStarMain6Hits++;
    }

    if (main10Hit) {
      bucket.fiveStarMain10Hits++;
    }

    if (candidateHit) {
      bucket.fiveStarCandidateHits++;
    }
  }

  return true;
}


async function performanceOverview(env) {
  // 成績の新しい起点。過去の学習データは残し、表示集計のみ除外する。
  const performanceStartDate = "20260927";
  const today =
    todayJST();

  const sevenDayStart =
    [jstDateKeyOffset(-6), performanceStartDate].sort().pop();

  const allBucket =
    blankPerformanceBucket();

  const sevenBucket =
    blankPerformanceBucket();

  const todayBucket =
    blankPerformanceBucket();

  let skipped = 0;
  let offset = 0;
  const pageSize = 500;

  // Page through every finished prediction up to today; a fixed LIMIT
  // silently truncates the 「全期間」 total when the history grows.
  while (true) {
    const result =
      await env.DB
        .prepare(`
          SELECT race_date, race_data_json, result_json
          FROM learning_races
          WHERE finished = 1
            AND race_date >= ?
            AND race_date <= ?
            AND race_data_json IS NOT NULL
            AND result_json IS NOT NULL
          ORDER BY race_date DESC, rno DESC, race_key DESC
          LIMIT ? OFFSET ?
        `)
        .bind(performanceStartDate, today, pageSize, offset)
        .all();

    const rows = result.results || [];

    for (const row of rows) {
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

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return {
    generatedAt:
      nowJST(),
    todayDate:
      today,
    sevenDayStart,
    allPeriodStart:performanceStartDate,
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
      "2026年9月27日から成績を新規集計。以前の結果は含めません。収支は1点100円で予想の買い目を購入した場合の試算です。実購入履歴ではありません。S見送りは購入額・払戻額ともに0円です。"
  };
}

function sPicksDashboardHtml() {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#8d72c7">
<link rel="manifest" href="/api/push-manifest.webmanifest">
<title>うさLAB｜S勝負・S見送り一覧</title>
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
    --warn:#a46b20;
    --pass:#756d87;
    --passbg:#f3f0f8;
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
  .filterBar{display:flex;gap:7px;margin-top:12px;flex-wrap:wrap}
  .filterBtn{background:#fff;color:var(--accent);border-color:var(--line);font-size:13px;padding:9px 12px}
  .filterBtn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
  .status{margin:14px 2px 0;font-size:13px;color:var(--muted)}
  .summary{display:flex;gap:10px;margin:14px 0;flex-wrap:wrap}
  .pill{background:#fff;border:1px solid var(--line);border-radius:999px;padding:8px 11px;font-size:13px}
  .performance{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}
  .perfCard{background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px;box-shadow:0 6px 18px rgba(71,46,113,.05)}
  .perfCard h3{font-size:14px;margin:0 0 8px}
  .perfPeriod{font-size:11px;color:var(--muted);margin:-3px 0 7px}
  .perfBig{font-size:20px;font-weight:900;color:var(--accent)}
  .perfRow{display:flex;justify-content:space-between;gap:8px;margin-top:5px;font-size:12px;color:var(--muted)}
  .perfRow b{color:var(--ink);text-align:right}
  .perfRow.passRow span{color:var(--pass)}
  .perfRow.holeRow span{color:var(--warn)}
  .perfMoney{margin-top:11px;padding:9px;background:#f7f4fc;border-radius:11px;font-size:12px;line-height:1.6}
  .perfMoney strong{display:block;margin-bottom:3px}
  .perfMoney .loss{color:#b4364c}
  .perfMoney .gain{color:#15804c}
  .perfMoney .zero{color:var(--muted)}
  .perfNote{grid-column:1/-1;font-size:11px;color:var(--muted);padding:0 2px}
  .grid{display:grid;gap:14px}
  .card{
    background:var(--card);
    border:1px solid var(--line);
    border-radius:20px;
    overflow:hidden;
    box-shadow:0 8px 24px rgba(71,46,113,.06);
  }
  .card.pass{border-color:#d9d1e5}
  .cardHead{padding:15px 16px 12px;background:linear-gradient(135deg,#fff,#faf6ff);border-bottom:1px solid var(--line)}
  .card.pass .cardHead{background:linear-gradient(135deg,#fff,#f6f3fa)}
  .raceLine{display:flex;align-items:center;justify-content:space-between;gap:10px}
  .race{font-size:21px;font-weight:800}
  .badge{font-size:13px;font-weight:800;color:#fff;background:var(--hot);border-radius:999px;padding:7px 10px;white-space:nowrap}
  .badge.pass{background:var(--pass)}
  .meta{margin-top:7px;color:var(--muted);font-size:13px;display:flex;gap:10px;flex-wrap:wrap}
  .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:12px 16px}
  .metric{background:var(--accent2);border-radius:12px;padding:10px;text-align:center}
  .card.pass .metric{background:var(--passbg)}
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
  .result.holehit{background:#fff7e8;color:#9a6317}
  .result.miss{background:#fff1f3;color:#c14d62}
  .resultMoney{display:block;font-size:12px;font-weight:600;margin-top:5px;line-height:1.55}
  .reasonBox{margin:0 16px 14px;background:#f5f2f9;color:var(--pass);border-radius:12px;padding:9px 11px;font-size:12px;line-height:1.55}
  .actions{display:flex;gap:8px;padding:0 16px 16px}
  .actions button{flex:1;padding:10px 9px;font-size:13px}
  .empty{background:#fff;border:1px dashed var(--line);border-radius:18px;padding:32px 16px;text-align:center;color:var(--muted)}
  .error{color:#b4364c}
  @media(max-width:520px){
    .metrics{grid-template-columns:repeat(2,1fr);padding-left:12px;padding-right:12px}
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
    <h1>🐰🚤 うさLAB｜S評価一覧</h1>
    <div class="sub">今日の「🔥 S勝負」と「⚠️ S見送り」を同じ画面で自動表示。結果確定後は、本線的中・穴的中も区別して表示します。</div>
    <div class="controls">
      <input id="token" type="password" placeholder="D1_WRITE_TOKEN">
      <button id="save">認証して表示</button>
      <button id="refresh" class="secondary">更新</button>
      <button id="lineTest" class="secondary">LINEテスト</button>
      <button id="pushToggle" class="secondary">🔔 サイト通知ON</button>
      <button id="pushTest" class="secondary">通知テスト</button>
    </div>
    <div class="filterBar">
      <button class="filterBtn active" data-filter="ALL">全部</button>
      <button class="filterBtn" data-filter="BET">🔥 S勝負</button>
      <button class="filterBtn" data-filter="PASS">⚠️ S見送り</button>
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
  var currentData = null;
  var currentFilter = "ALL";

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

  function displayDate(key){
    var text = String(key || '');
    if(!/^[0-9]{8}$/.test(text)) return '-';
    return text.slice(0,4) + '/' + Number(text.slice(4,6)) + '/' + Number(text.slice(6,8));
  }

  function yen(v){
    return Math.round(Number(v) || 0).toLocaleString('ja-JP') + '円';
  }

  function profitText(v){
    var n = Number(v) || 0;
    return '<b class="' + (n > 0 ? 'gain' : n < 0 ? 'loss' : 'zero') + '">' +
      (n > 0 ? '+' : n < 0 ? '−' : '') + yen(Math.abs(n)) + '</b>';
  }

  function moneySummary(label, stake, paid, profit, recovery){
    if(Number(stake || 0) <= 0) return '';
    return '<div class="perfMoney"><strong>' + esc(label) + '</strong>' +
      '購入 ' + yen(stake) + ' ／ 払戻 ' + yen(paid) + '<br>' +
      '収支 ' + profitText(profit) + ' ／ 回収率 ' + rateText(recovery) + '</div>';
  }

  function renderPerformance(data){
    if(!data){
      performance.innerHTML = '<div class="perfNote">成績データを取得できませんでした。</div>';
      return;
    }

    var groups = [
      ['今日', data.today, displayDate(data.todayDate)],
      ['過去7日', data.last7Days, displayDate(data.sevenDayStart) + '〜' + displayDate(data.todayDate) + '（今日を含む）'],
      ['全期間', data.all, data.allPeriodStart ? displayDate(data.allPeriodStart) + '〜' + displayDate(data.todayDate) : '集計対象の記録なし']
    ];

    performance.innerHTML = groups.map(function(item){
      var label = item[0];
      var s = item[1] || {};
      var races = Number(s.races || 0);
      var main6 = Number(s.main6Hits || 0);
      var main10 = Number(s.main10Hits || 0);

      var sRaces = Number(s.sBetRaces || 0);
      var sHits6 = Number(s.sBetMain6Hits || 0);
      var sHits10 = Number(s.sBetMain10Hits || 0);

      var passRaces = Number(s.sPassRaces || 0);
      var passMain6 = Number(s.sPassMain6Hits || 0);
      var passMain10 = Number(s.sPassMain10Hits || 0);
      var passHole = Number(s.sPassHoleHits || 0);

      var fiveRaces = Number(s.fiveStarRaces || 0);
      var fiveHits6 = Number(s.fiveStarMain6Hits || 0);
      var fiveHits10 = Number(s.fiveStarMain10Hits || 0);

      return '<div class="perfCard">' +
        '<h3>📊 ' + esc(label) + '</h3>' +
        '<div class="perfPeriod">' + esc(item[2]) + '</div>' +
        '<div class="perfBig">' + races + 'R</div>' +
        '<div class="perfRow"><span>本線6点</span><b>' + main6 + '/' + races + '（' + rateText(s.main6HitRate) + '）</b></div>' +
        '<div class="perfRow"><span>10点（6＋押さえ4）</span><b>' + main10 + '/' + races + '（' + rateText(s.main10HitRate) + '）</b></div>' +
        '<div class="perfRow"><span>🔥S勝負 本線6点</span><b>' + sHits6 + '/' + sRaces + '（' + rateText(s.sBetMain6HitRate) + '）</b></div>' +
        '<div class="perfRow"><span>🔥S勝負 10点</span><b>' + sHits10 + '/' + sRaces + '（' + rateText(s.sBetMain10HitRate) + '）</b></div>' +
        '<div class="perfRow passRow"><span>⚠️S見送り 本線6点</span><b>' + passMain6 + '/' + passRaces + '（' + rateText(s.sPassMain6HitRate) + '）</b></div>' +
        '<div class="perfRow passRow"><span>⚠️S見送り 10点</span><b>' + passMain10 + '/' + passRaces + '（' + rateText(s.sPassMain10HitRate) + '）</b></div>' +
        '<div class="perfRow holeRow"><span>🎯S見送り 穴</span><b>' + passHole + '/' + passRaces + '（' + rateText(s.sPassHoleHitRate) + '）</b></div>' +
        '<div class="perfRow"><span>★★★★★ 本線6点</span><b>' + fiveHits6 + '/' + fiveRaces + '（' + rateText(s.fiveStarMain6HitRate) + '）</b></div>' +
        '<div class="perfRow"><span>★★★★★ 10点</span><b>' + fiveHits10 + '/' + fiveRaces + '（' + rateText(s.fiveStarMain10HitRate) + '）</b></div>' +
        moneySummary('🔥 S勝負 本線6点',s.sBetMain6Stake,s.sBetMain6Return,s.sBetMain6Profit,s.sBetMain6RecoveryRate) +
        moneySummary('🔥 S勝負 10点',s.sBetMain10Stake,s.sBetMain10Return,s.sBetMain10Profit,s.sBetMain10RecoveryRate) +
        moneySummary('全予想 本線6点（見送り含む）',s.main6Stake,s.main6Return,s.main6Profit,s.main6RecoveryRate) +
        moneySummary('全予想 10点（見送り含む）',s.main10Stake,s.main10Return,s.main10Profit,s.main10RecoveryRate) +
        (Number(s.missingPayoutRaces || 0) ? '<div class="perfRow">払戻未取得 ' + Number(s.missingPayoutRaces) + 'Rは収支集計から除外</div>' : '') +
      '</div>';
    }).join('') +
      '<div class="perfNote">※成績は2026/9/27から集計し、それ以前は含みません。過去7日も開始日より前は除外します。収支は保存済み予想を各1点100円で買った場合の試算です（3連単の確定払戻を使用）。実際の購入・払戻履歴ではありません。S見送りは購入0円・収支0円で、的中率のみ参考表示します。全予想の試算には見送りも含みます。</div>';
  }

  function render(data){
    currentData = data || currentData || {picks:[]};

    var allPicks = currentData.picks || [];
    var betCount = allPicks.filter(function(p){ return p.decision === "BET"; }).length;
    var passCount = allPicks.filter(function(p){ return p.decision === "PASS"; }).length;

    var picks = allPicks.filter(function(p){
      return currentFilter === "ALL" || p.decision === currentFilter;
    });

    summary.innerHTML =
      '<span class="pill">全部 <b>' + allPicks.length + 'R</b></span>' +
      '<span class="pill">🔥 S勝負 <b>' + betCount + 'R</b></span>' +
      '<span class="pill">⚠️ S見送り <b>' + passCount + 'R</b></span>' +
      '<span class="pill">更新 ' + esc(new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})) + '</span>';

    if(!picks.length){
      var emptyText = currentFilter === "BET"
        ? "現在、今日の🔥 S勝負はありません。"
        : currentFilter === "PASS"
          ? "現在、今日の⚠️ S見送りはありません。"
          : "現在、今日のS評価レースはありません。";
      list.innerHTML = '<div class="empty">' + emptyText + '</div>';
      return;
    }

    list.innerHTML = picks.map(function(p){
      var isPass = p.decision === "PASS";

      var main = (p.main6 || []).map(function(b,i){
        return '<div class="bet">' + (i+1) + '. ' + esc(b.combination) +
          '<small>AI ' + esc(fmtScore(b.totalScore)) + ' / ' + esc(b.odds == null ? '-' : b.odds + '倍') + '</small></div>';
      }).join('');

      var cover = (p.cover4 || []).map(function(b,i){
        return '<div class="bet">' + (i+7) + '. ' + esc(b.combination) +
          '<small>AI ' + esc(fmtScore(b.totalScore)) + ' / ' + esc(b.odds == null ? '-' : b.odds + '倍') + '</small></div>';
      }).join('');

      var holes = (p.holes || []).map(function(b){
        return '<span class="hole">' + esc(b.tier || '穴') + ' ' + esc(b.combination) +
          ' / ' + esc(b.odds == null ? '-' : b.odds + '倍') + '</span>';
      }).join('');

      var result = '';
      if(p.resultCheck){
        var rc = p.resultCheck || {};

        var label;
        var resultClass;

        if(isPass && rc.main6Hit){
          label = '✅ S見送り 本線6点的中';
          resultClass = 'hit';
        }else if(isPass && rc.cover4Hit){
          label = '✅ S見送り 押さえ4点的中';
          resultClass = 'hit';
        }else if(isPass && rc.holeHit){
          label = '🎯 S見送り 穴的中';
          resultClass = 'holehit';
        }else if(rc.main6Hit){
          label = '✅ 本線6点的中';
          resultClass = 'hit';
        }else if(rc.cover4Hit){
          label = '✅ 押さえ4点的中';
          resultClass = 'hit';
        }else if(rc.holeHit){
          label = '🎯 穴候補的中';
          resultClass = 'holehit';
        }else if(rc.main15Hit){
          label = '参考：上位15点内';
          resultClass = 'miss';
        }else{
          label = '❌ 10点・穴候補外';
          resultClass = 'miss';
        }

        var raceMoney = '';
        if(isPass){
          raceMoney = '<span class="resultMoney">見送り：購入0円・収支0円（的中は参考）</span>';
        }else if(rc.payout != null && Number.isFinite(Number(rc.payout)) && Number(rc.payout) > 0){
          var paid = Number(rc.payout);
          var stake6 = (p.main6 || []).length * 100;
          var stake10 = stake6 + (p.cover4 || []).length * 100;
          var returned6 = rc.main6Hit ? paid : 0;
          var returned10 = (rc.main6Hit || rc.cover4Hit) ? paid : 0;
          raceMoney = '<span class="resultMoney">本線6点：購入' + yen(stake6) + '・払戻' + yen(returned6) + '・収支' + (returned6 - stake6 >= 0 ? '+' : '−') + yen(Math.abs(returned6 - stake6)) +
            '<br>10点：購入' + yen(stake10) + '・払戻' + yen(returned10) + '・収支' + (returned10 - stake10 >= 0 ? '+' : '−') + yen(Math.abs(returned10 - stake10)) + '</span>';
        }else{
          raceMoney = '<span class="resultMoney">払戻未取得のため収支計算対象外</span>';
        }
        result = '<div class="result ' + resultClass + '">' +
          label + '：' + esc(rc.combination || '-') +
          (rc.payout != null ? ' / 払戻 ' + yen(rc.payout) + '（100円あたり）' : '') + raceMoney + '</div>';
      }

      var reasons = '';
      if(isPass && Array.isArray(p.reasons) && p.reasons.length){
        reasons = '<div class="reasonBox"><b>見送り理由</b><br>' +
          p.reasons.slice(0,4).map(function(r){ return '・' + esc(r); }).join('<br>') +
          '</div>';
      }

      var picksText = (p.venue || '') + ' ' + p.rno + 'R\\n' +
        (p.main6 || []).map(function(b){ return b.combination; }).join('\\n') +
        ((p.cover4 || []).length ? '\\n' + (p.cover4 || []).map(function(b){ return b.combination; }).join('\\n') : '');

      var badge = isPass
        ? '<div class="badge pass">⚠️ S見送り ' + esc(p.stars || '') + '</div>'
        : '<div class="badge">🔥 S勝負 ' + esc(p.stars || '') + '</div>';

      return '<article class="card ' + (isPass ? 'pass' : '') + '">' +
        '<div class="cardHead">' +
          '<div class="raceLine"><div class="race">' + esc(p.venue) + ' ' + esc(p.rno) + 'R</div>' +
          badge + '</div>' +
          '<div class="meta"><span>締切 ' + esc(p.deadline || '-') + '</span><span>' + esc(p.strategy || '-') + '</span><span>Sスコア ' + esc(fmtScore(p.stableScore)) + '</span></div>' +
        '</div>' +
        '<div class="metrics">' +
          '<div class="metric"><span class="label">1着推定力</span><b>' + esc(pct(p.firstShare)) + '</b></div>' +
          '<div class="metric"><span class="label">上位6点確率</span><b>' + esc(pct(p.top6Probability)) + '</b></div>' +
          '<div class="metric"><span class="label">10点内確率</span><b>' + esc(pct(p.top10Probability)) + '</b></div>' +
          '<div class="metric"><span class="label">1着点差</span><b>' + esc(fmtScore(p.firstGap)) + '</b></div>' +
        '</div>' +
        '<div class="section"><h3>本線6点</h3><div class="bets">' + main + '</div></div>' +
        (cover ? '<div class="section"><h3>押さえ4点（7〜10位）</h3><div class="bets">' + cover + '</div></div>' : '') +
        (holes ? '<div class="section"><h3>穴候補</h3><div class="holes">' + holes + '</div></div>' : '') +
        reasons +
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
      list.innerHTML = '<div class="empty">認証後にS勝負・S見送りを表示します。</div>';
      return;
    }

    status.textContent = '読み込み中…';

    try{
      var response = await fetch('/api/s-picks?date=' + encodeURIComponent(todayKey()) + '&includePass=1',{
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

  function urlBase64ToUint8Array(base64String){
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g,'+').replace(/_/g,'/');
    var rawData = atob(base64);
    return Uint8Array.from(Array.prototype.map.call(rawData,function(char){ return char.charCodeAt(0); }));
  }

  function pushSupported(){
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  function isStandalone(){
    return window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }

  async function getPushRegistration(){
    return await navigator.serviceWorker.register('/api/push-sw.js',{scope:'/api/'});
  }

  async function refreshPushButton(){
    var btn = document.getElementById('pushToggle');
    if(!btn) return;
    if(!pushSupported()){
      btn.textContent = '通知非対応';
      btn.disabled = true;
      return;
    }
    try{
      var reg = await getPushRegistration();
      var sub = await reg.pushManager.getSubscription();
      btn.textContent = sub ? '🔕 サイト通知OFF' : '🔔 サイト通知ON';
    }catch(e){
      btn.textContent = '🔔 サイト通知ON';
    }
  }

  async function togglePush(){
    var token = (tokenInput.value || '').trim() || localStorage.getItem(TOKEN_KEY) || '';
    if(!token){
      status.innerHTML = '<span class="error">先にD1_WRITE_TOKENで認証してください</span>';
      return;
    }
    if(!pushSupported()){
      status.innerHTML = '<span class="error">この端末・ブラウザはWeb Pushに対応していません</span>';
      return;
    }

    if(/iPhone|iPad|iPod/i.test(navigator.userAgent) && !isStandalone()){
      status.textContent = 'iPhoneは共有→「ホーム画面に追加」→ホーム画面のうさLABから開いて通知ONにしてください';
      return;
    }

    try{
      var reg = await getPushRegistration();
      var current = await reg.pushManager.getSubscription();

      if(current){
        var endpoint = current.endpoint;
        await current.unsubscribe();
        await fetch('/api/push/unsubscribe',{
          method:'POST',
          headers:{'authorization':'Bearer ' + token,'content-type':'application/json'},
          body:JSON.stringify({endpoint:endpoint})
        });
        status.textContent = '🔕 サイト通知をOFFにしました';
        await refreshPushButton();
        return;
      }

      var permission = Notification.permission;
      if(permission !== 'granted'){
        permission = await Notification.requestPermission();
      }
      if(permission !== 'granted'){
        throw new Error('通知が許可されませんでした');
      }

      var keyResponse = await fetch('/api/push/public-key',{cache:'no-store'});
      var keyData = await keyResponse.json();
      if(!keyResponse.ok || !keyData.ok || !keyData.publicKey){
        throw new Error(keyData.error || 'Push公開鍵を取得できませんでした');
      }

      var subscription = await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:urlBase64ToUint8Array(keyData.publicKey)
      });

      var response = await fetch('/api/push/subscribe',{
        method:'POST',
        headers:{'authorization':'Bearer ' + token,'content-type':'application/json'},
        body:JSON.stringify(subscription.toJSON ? subscription.toJSON() : subscription)
      });
      var data = await response.json();
      if(!response.ok || !data.ok){
        throw new Error(data.error || 'Push購読の保存に失敗しました');
      }

      localStorage.setItem(TOKEN_KEY,token);
      status.textContent = '✅ サイト通知をONにしました';
      await refreshPushButton();
    }catch(e){
      status.innerHTML = '<span class="error">' + esc(e.message || String(e)) + '</span>';
    }
  }

  async function pushTest(){
    var token = (tokenInput.value || '').trim() || localStorage.getItem(TOKEN_KEY) || '';
    if(!token){
      status.innerHTML = '<span class="error">先にD1_WRITE_TOKENで認証してください</span>';
      return;
    }
    status.textContent = 'サイト通知テスト送信中...';
    try{
      var response = await fetch('/api/push-test',{
        method:'POST',
        headers:{'authorization':'Bearer ' + token,'content-type':'application/json'}
      });
      var data = await response.json();
      if(!response.ok || !data.ok){
        throw new Error(data.error || 'サイト通知テストに失敗しました');
      }
      if(data.status === 'NO_SUBSCRIBERS'){
        throw new Error('先に「サイト通知ON」を押してください');
      }
      status.textContent = '✅ サイト通知テストを送信しました';
    }catch(e){
      status.innerHTML = '<span class="error">' + esc(e.message || String(e)) + '</span>';
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-filter]'),function(btn){
    btn.addEventListener('click',function(){
      currentFilter = btn.getAttribute('data-filter') || 'ALL';
      Array.prototype.forEach.call(document.querySelectorAll('[data-filter]'),function(other){
        other.classList.toggle('active',other === btn);
      });
      render(currentData || {picks:[]});
    });
  });

  document.getElementById('save').addEventListener('click',load);
  document.getElementById('refresh').addEventListener('click',load);
  document.getElementById('lineTest').addEventListener('click',lineTest);
  document.getElementById('pushToggle').addEventListener('click',togglePush);
  document.getElementById('pushTest').addEventListener('click',pushTest);
  tokenInput.value = localStorage.getItem(TOKEN_KEY) || '';
  refreshPushButton();
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

          sPassDashboard:
            true,

          lineNotification:
            true,

          lineNotificationConfigured:
            lineNotificationConfigured(env),

          lineNotificationBackfill:
            true,

          lineSPassNotification:
            LINE_PASS_NOTIFICATIONS_ENABLED,

          lineEarlyNotification:
            LINE_EARLY_NOTIFICATIONS_ENABLED,

          lineFinalOnly:
            !LINE_EARLY_NOTIFICATIONS_ENABLED,

          lineSendMode:
            "S_BET_FINAL_ONLY",

          lineFinalWindow:
            `0-${LINE_FINAL_MAX_MINUTES}min`,

          d1PerformanceStats:
            true,

          resultDisplayFallback:
            true,

          dailySummaryLineNotification:
            LINE_DAILY_SUMMARY_ENABLED,

          dailySummaryAfterAllRaces:
            true,

          lane1OvertrustGuard:
            true,

          recent100AdaptiveLearning:
            true,

          venueRnoLearning:
            true,

          sPerformanceCalibration:
            true,

          probabilityBandCalibration:
            true,

          scoreBandCalibration:
            true,

          walkForwardValidation:
            true,

          missPatternLearning:
            true,

          precisionAutoCalibration:
            true,

          dynamicMainlineStrategy:
            true,

          dualHeadStrategy:
            true,

          fixedStrategyStricter:
            true,

          venueDiscoveryHtmlEntityFix:
            true,

          autoTargetZeroGuard:
            true,

          holeTierRestored:
            true,

          main6PlusCover4:
            true,

          main10PerformanceStats:
            true,

          lineMonthlyLimitSaver:
            true,

          webPush:
            true,

          webPushAutoVapid:
            true,

          webPushSBet:
            WEB_PUSH_S_BET_ENABLED,

          webPushDailySummary:
            WEB_PUSH_DAILY_SUMMARY_ENABLED
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



      /* ===== V6.5.7 自動成績 API ===== */

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


      /* ===== S評価 API（🔥S勝負 + ⚠️S見送り） ===== */

      /* ===== Web Push PWA / Service Worker ===== */

      if (
        url.pathname ===
        "/api/push-manifest.webmanifest"
      ) {
        return new Response(
          JSON.stringify(
            webPushManifest()
          ),
          {
            status:200,
            headers:{
              "content-type":
                "application/manifest+json; charset=utf-8",
              "cache-control":
                "public, max-age=300"
            }
          }
        );
      }

      if (
        url.pathname ===
        "/api/push-sw.js"
      ) {
        return new Response(
          webPushServiceWorkerJs(),
          {
            status:200,
            headers:{
              "content-type":
                "application/javascript; charset=utf-8",
              "cache-control":
                "no-cache",
              "service-worker-allowed":
                "/api/"
            }
          }
        );
      }

      if (
        url.pathname ===
        "/api/push/public-key"
      ) {
        const vapid =
          await ensureWebPushVapid(env);

        return json({
          ok:true,
          publicKey:
            vapid.public_key
        });
      }

      if (
        url.pathname ===
        "/api/push-latest"
      ) {
        await ensureWebPushTables(env);

        const latestPush =
          await env.DB.prepare(`
            SELECT
              event_key,
              event_type,
              title,
              body,
              target_url,
              updated_at
            FROM web_push_events
            WHERE status='SENT'
            ORDER BY updated_at DESC
            LIMIT 1
          `).first();

        return json({
          ok:true,
          event:
            latestPush
              ? {
                  eventKey:
                    latestPush.event_key,
                  eventType:
                    latestPush.event_type,
                  title:
                    latestPush.title,
                  body:
                    latestPush.body,
                  targetUrl:
                    latestPush.target_url,
                  updatedAt:
                    latestPush.updated_at
                }
              : null
        });
      }

      if (
        url.pathname ===
        "/api/push/subscribe"
      ) {
        const authError =
          checkPrivateAccess(
            request,
            env
          );

        if (authError) {
          return authError;
        }

        if (request.method !== "POST") {
          return json(
            {
              ok:false,
              error:"POSTで送信してください"
            },
            405
          );
        }

        const body =
          await request.json();

        await saveWebPushSubscription(
          env,
          body
        );

        const status =
          await webPushStatus(env);

        return json({
          ok:true,
          subscribed:true,
          enabledSubscriptions:
            status.enabled
        });
      }

      if (
        url.pathname ===
        "/api/push/unsubscribe"
      ) {
        const authError =
          checkPrivateAccess(
            request,
            env
          );

        if (authError) {
          return authError;
        }

        if (request.method !== "POST") {
          return json(
            {
              ok:false,
              error:"POSTで送信してください"
            },
            405
          );
        }

        const body =
          await request.json();

        await disableWebPushSubscription(
          env,
          body?.endpoint
        );

        return json({
          ok:true,
          subscribed:false
        });
      }

      if (
        url.pathname ===
        "/api/push-status"
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
            await webPushStatus(env)
          )
        });
      }

      if (
        url.pathname ===
        "/api/push-test"
      ) {
        const authError =
          checkPrivateAccess(
            request,
            env
          );

        if (authError) {
          return authError;
        }

        const eventKey =
          `TEST:${Date.now()}`;

        const result =
          await sendWebPushEvent(
            env,
            {
              eventKey,
              eventType:"TEST",
              title:
                "✅ うさLAB｜サイト通知テスト",
              body:
                "サイトからのPush通知は正常です。S勝負が出たらここに届きます。",
              targetUrl:
                "/api/s-picks-view"
            }
          );

        return json({
          ok:
            result.status !== "ERROR",
          ...result
        });
      }

      if (
        url.pathname ===
        "/api/push-notify-run"
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
            await runWebPushNotifications(
              env,
              todayJST()
            )
          )
        });
      }

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

        const includePass =
          url.searchParams.get(
            "includePass"
          ) === "1";

        const picks =
          await listSBetPredictions(
            env,
            raceDate,
            includePass
          );

        return json({
          ok:true,
          raceDate,
          count:
            picks.length,
          picks
        });
      }

      /* ===== S評価一覧画面 ===== */

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

      /* ===== V6.5.9 1日終了時LINE集計を手動実行 ===== */

      if (
        url.pathname ===
        "/api/daily-summary-run"
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
            await runDailySummaryNotification(
              env,
              todayJST(),
              {
                force:
                  url.searchParams.get("force") === "1",
                resend:
                  url.searchParams.get("resend") === "1"
              }
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

      // Public read-only overview; purchase amounts and private notes are omitted.
      if (url.pathname === "/api/prediction-preview") {
        const {hd,jcd,rno} = getRaceParams(url);
        const raceError = validateRace(jcd,rno);
        if (raceError) return raceError;
        if (hd !== todayJST()) return json({ok:false,error:"暫定予想は本日のレースだけ表示できます"},400);
        const venue = await venueData(hd,jcd);
        const target = venue.races.find(race=>Number(race.rno)===Number(rno));
        if (!target) return json({ok:false,error:"レースを取得できませんでした"},404);
        if (!target.deadlineJST || Date.now() >= Date.parse(target.deadlineJST)) {
          return json({ok:false,error:"締切後の暫定予想は表示できません。結果タブをご確認ください"},409);
        }
        const existing = await env.DB.prepare(
          "SELECT 1 AS saved FROM predictions WHERE race_key = ? LIMIT 1"
        ).bind(makeRaceKey(hd,jcd,rno)).first();
        if (existing && url.searchParams.get("refresh") !== "1") return json({ok:true,saved:true});
        try {
          const data = await fetchPredictionData(env,hd,jcd,rno,{allowBeforeMissing:true});
          const snapshot = data.prediction.snapshot;
          return json({ok:true,saved:false,preview:{
            jcd,rno:Number(rno),venue:venue.venue,deadline:target.deadline,
            analyzedAt:nowJST(),preliminary:true,recalculated:Boolean(existing),beforeAvailable:data.beforeAvailable,
            oddsCount:data.odds.odds.length,confidence:"暫定",decision:"WAIT",
            manshuProbability:snapshot.manshu?.probability??null,
            purposeModes:savedPurposeView(snapshot)
          }});
        } catch (error) {
          return json({ok:false,error:error?.message||"暫定予想を計算できませんでした"},503);
        }
      }

      if (url.pathname === "/api/today-predictions") {
        const date = url.searchParams.get("date") || todayJST();
        if (!/^\d{8}$/.test(date)) return json({ok:false,error:"dateはYYYYMMDDで指定してください"},400);
        const predictions = await listDailyPredictions(env, date);
        return json({ok:true,date,count:predictions.length,
          manshuThresholdPercent:manshuThreshold(env),predictions});
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

      /* 自動取り込みの進捗。保存された日付・会場・レース番号のみ公開。 */
      if (url.pathname === "/api/backfill-status") {
        await ensureHistoricalBackfillState(env);
        const state=await env.DB.prepare("SELECT cursor_date,venue_index,next_rno,priority_date,priority_venue_index,priority_next_rno,last_yesterday,updated_at FROM historical_results_backfill_state WHERE id=1").first();
        const start=jstDateKeyOffset(-30),end=todayJST();
        const counts=await env.DB.prepare(`SELECT
          COUNT(*) AS results,
          SUM(CASE WHEN race_data_json IS NOT NULL THEN 1 ELSE 0 END) AS learning
          FROM learning_races WHERE race_date>=? AND race_date<?
            AND finished=1 AND result_json IS NOT NULL`)
          .bind(start,end).first();
        return json({ok:true,state:state||null,results:Number(counts?.results||0),
          learning:Number(counts?.learning||0),windowDays:30,perRun:4});
      }

      if (url.pathname === "/api/learned-weights") {
        const hd=String(url.searchParams.get("hd")||todayJST());
        if (!/^\d{8}$/.test(hd)) return json({ok:false,error:"日付形式が不正です"},400);
        const learned=await calculateRoleLearnedWeights(env,hd);
        return json({ok:true,learned:{active:learned.active,races:learned.races,
          roles:learned.roles,overall:learned.overall,
          racerHistory:buildRacerHistoryStats(learned._history,hd)}});
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
