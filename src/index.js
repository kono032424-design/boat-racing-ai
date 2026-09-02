const OFFICIAL = "https://www.boatrace.jp";

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
        "Mozilla/5.0 (compatible; BoatRacingAI/6.2.1)",
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

  const ids = [...new Set(found)];

  return ids
    .filter(jcd => VENUE_NAMES[jcd])
    .map(jcd => ({
      jcd,
      name: VENUE_NAMES[jcd]
    }));
}

/* =========================
   レース一覧
========================= */

async function venueData(hd, jcd) {
  const html = await officialFetch(
    `/owpc/pc/race/raceindex?hd=${hd}&jcd=${jcd}`
  );

  const text = stripHtml(html);
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
      races.push({
        rno,
        status: "出走情報あり"
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

      while (
        pending[col]
      ) {

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
   V6.2.1 結果取得
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

/*
  結果ページの払戻表を
  <tr>単位で直接解析
*/

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

    const rowHtml =
      rowMatch[1];

    const cells = [
      ...rowHtml.matchAll(
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

    if (
      !cells.length
    ) {
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

    /*
      ¥7,470 / ￥7,470 / 7,470円
      すべて許可
    */

    const payoutMatch =
      decodeHtml(rowText)
        .match(
          /(?:¥|￥)?\s*([\d,]+)\s*円?/
        );

    /*
      最初に「3」が引っかからないよう、
      組番より後ろだけで払戻を検索
    */

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
        decodeHtml(
          afterCombo
        ).match(
          /(?:¥|￥)\s*([\d,]+)|([\d,]+)\s*円/
        );

      if (yenMatch) {

        payout =
          parsePayout(
            yenMatch[1] ||
            yenMatch[2]
          );
      }

      /*
        通貨記号がHTML処理で消えた場合の予備。
        組番の次のセルから金額を探す。
      */

      if (
        payout === null
      ) {

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

/*
  着順表
*/

function parseOrder(html) {

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

  /*
    着順解析に失敗しても
    3連単結果から復元
  */

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

    ...parseResult(
      html
    )
  };
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

      if (
        url.pathname ===
        "/api/health"
      ) {

        return json({
          ok: true,
          version:
            "6.2.1"
        });
      }

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

      /*
        V6.2.1
        結果取得
      */

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
