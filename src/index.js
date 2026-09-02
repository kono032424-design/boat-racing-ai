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
        "Mozilla/5.0 (compatible; BoatRacingAI/5.8)",
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

function numberOrNull(v) {
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

async function venues(hd) {
  const html = await officialFetch(
    `/owpc/pc/race/index?hd=${hd}`
  );

  const found = [
    ...html.matchAll(
      /[?&]jcd=(\d{2})/g
    )
  ].map(m => m[1]);

  const ids = [
    ...new Set(found)
  ];

  return ids
    .filter(jcd => VENUE_NAMES[jcd])
    .map(jcd => ({
      jcd,
      name: VENUE_NAMES[jcd]
    }));
}

async function venueData(hd, jcd) {
  const html = await officialFetch(
    `/owpc/pc/race/raceindex?hd=${hd}&jcd=${jcd}`
  );

  const text = stripHtml(html);
  const races = [];

  for (let rno = 1; rno <= 12; rno++) {
    const raceRegex =
      new RegExp(
        `(?:^|\\s)${rno}R(?:\\s|$)`,
        "i"
      );

    if (
      raceRegex.test(text) ||
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
        numberOrNull(match[5]),

      weight:
        numberOrNull(match[6]),

      fCount:
        numberOrNull(match[7]),

      lCount:
        numberOrNull(match[8]),

      avgST:
        numberOrNull(match[9]),

      national: {
        winRate:
          numberOrNull(match[10]),
        secondRate:
          numberOrNull(match[11]),
        thirdRate:
          numberOrNull(match[12])
      },

      local: {
        winRate:
          numberOrNull(match[13]),
        secondRate:
          numberOrNull(match[14]),
        thirdRate:
          numberOrNull(match[15])
      },

      motor: {
        number:
          numberOrNull(match[16]),
        secondRate:
          numberOrNull(match[17]),
        thirdRate:
          numberOrNull(match[18])
      },

      boat: {
        number:
          numberOrNull(match[19]),
        secondRate:
          numberOrNull(match[20]),
        thirdRate:
          numberOrNull(match[21])
      }
    });
  }

  return racers;
}

function parseBeforeInfo(html) {
  const text = stripHtml(html);

  const racers = [];

  /*
   直前情報：
   艇番 → 選手名 → 体重 → 展示タイム → チルト
  */
  const exhibitionRegex =
    /(?:^|\s)([1-6])\s+(.+?)\s+(\d+(?:\.\d+)?)kg\s+(\d+\.\d{2})\s+(-?\d+\.\d)/g;

  let match;

  while (
    (match = exhibitionRegex.exec(text)) !== null &&
    racers.length < 6
  ) {
    const lane = Number(match[1]);

    if (
      !racers.some(r => r.lane === lane)
    ) {
      racers.push({
        lane,
        name:
          match[2]
            .replace(/\s+/g, " ")
            .trim(),
        weight:
          numberOrNull(match[3]),
        exhibitionTime:
          numberOrNull(match[4]),
        tilt:
          numberOrNull(match[5]),
        exhibitionST: null,
        course: lane
      });
    }
  }

  /*
   スタート展示
   「コース 1 .03」「2 .06」などを取得
  */
  const startPart =
    text.split("スタート展示")[1] || "";

  const stRegex =
    /(?:^|\s)([1-6])\s+\.?(\d{2})(?=\s|$)/g;

  const sts = [];

  while (
    (match = stRegex.exec(startPart)) !== null &&
    sts.length < 6
  ) {
    sts.push({
      course: Number(match[1]),
      st: Number(`0.${match[2]}`)
    });
  }

  for (let i = 0; i < racers.length; i++) {
    if (sts[i]) {
      racers[i].course =
        sts[i].course;

      racers[i].exhibitionST =
        sts[i].st;
    }
  }

  let weather = {};

  const temperature =
    text.match(/気温\s*(\d+(?:\.\d+)?)℃/);

  const wind =
    text.match(/風速\s*(\d+(?:\.\d+)?)m/);

  const water =
    text.match(/水温\s*(\d+(?:\.\d+)?)℃/);

  const wave =
    text.match(/波高\s*(\d+(?:\.\d+)?)cm/);

  weather = {
    temperature:
      temperature
        ? Number(temperature[1])
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
  };

  return {
    racers,
    weather
  };
}

async function raceData(
  hd,
  jcd,
  rno
) {
  const raceHtml =
    await officialFetch(
      `/owpc/pc/race/racelist?hd=${hd}&jcd=${jcd}&rno=${rno}`
    );

  const racers =
    parseRacers(raceHtml);

  let before = {
    racers: [],
    weather: {}
  };

  try {
    const beforeHtml =
      await officialFetch(
        `/owpc/pc/race/beforeinfo?hd=${hd}&jcd=${jcd}&rno=${rno}`
      );

    before =
      parseBeforeInfo(beforeHtml);

  } catch (e) {
    /*
      直前情報がまだ出ていない場合も
      基本出走データは返す
    */
  }

  const merged =
    racers.map(racer => {
      const live =
        before.racers.find(
          x =>
            x.lane ===
            racer.lane
        );

      return {
        ...racer,

        before: live
          ? {
              course:
                live.course,

              exhibitionTime:
                live.exhibitionTime,

              exhibitionST:
                live.exhibitionST,

              tilt:
                live.tilt
            }
          : {
              course: null,
              exhibitionTime: null,
              exhibitionST: null,
              tilt: null
            }
      };
    });

  return {
    hd,
    jcd,
    venue:
      VENUE_NAMES[jcd] ||
      jcd,

    rno:
      Number(rno),

    racers:
      merged,

    weather:
      before.weather
  };
}

export default {
  async fetch(request, env) {
    const url =
      new URL(request.url);

    try {

      if (
        url.pathname ===
        "/api/health"
      ) {
        return json({
          ok: true,
          version: "5.8"
        });
      }

      if (
        url.pathname ===
        "/api/venues"
      ) {
        const hd =
          url.searchParams.get("hd") ||
          todayJST();

        return json({
          ok: true,
          hd,
          venues:
            await venues(hd)
        });
      }

      if (
        url.pathname ===
        "/api/venue"
      ) {
        const hd =
          url.searchParams.get("hd") ||
          todayJST();

        const jcd =
          url.searchParams.get("jcd");

        if (
          !jcd ||
          !/^\d{2}$/.test(jcd)
        ) {
          return json({
            ok: false,
            error:
              "jcdが必要です"
          }, 400);
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
        const hd =
          url.searchParams.get("hd") ||
          todayJST();

        const jcd =
          url.searchParams.get("jcd");

        const rno =
          Number(
            url.searchParams.get(
              "rno"
            )
          );

        if (
          !jcd ||
          !/^\d{2}$/.test(jcd)
        ) {
          return json({
            ok: false,
            error:
              "jcdが必要です"
          }, 400);
        }

        if (
          !Number.isInteger(rno) ||
          rno < 1 ||
          rno > 12
        ) {
          return json({
            ok: false,
            error:
              "rnoは1〜12で指定してください"
          }, 400);
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

      return env.ASSETS.fetch(
        request
      );

    } catch (error) {
      return json({
        ok: false,
        error:
          error?.message ||
          String(error)
      }, 502);
    }
  }
};
