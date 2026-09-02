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
    .replace(/&gt;/gi, " ");
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

function cleanName(text = "") {
  return stripHtml(text)
    .replace(/\s+/g, " ")
    .trim();
}

async function officialFetch(path) {
  const response = await fetch(OFFICIAL + path, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; BoatRacingAI/5.5)",
      "accept": "text/html,application/xhtml+xml"
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

async function venueData(hd, jcd) {
  const html = await officialFetch(
    `/owpc/pc/race/raceindex?hd=${hd}&jcd=${jcd}`
  );

  const text = stripHtml(html);
  const races = [];

  for (let rno = 1; rno <= 12; rno++) {
    const raceRegex = new RegExp(
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

function addRacer(
  racers,
  registration,
  className,
  name
) {
  registration = String(registration || "").trim();
  className = String(className || "").trim();
  name = cleanName(name);

  if (!/^\d{4}$/.test(registration)) return;

  if (!/^(A1|A2|B1|B2)$/.test(className)) return;

  if (!name) return;

  if (
    racers.some(
      racer => racer.registration === registration
    )
  ) {
    return;
  }

  racers.push({
    lane: racers.length + 1,
    registration,
    class: className,
    name
  });
}

function parseRacersFromRawHtml(html) {
  const racers = [];

  /*
   * 方法1
   * 「登録番号 / 級別」から次の年齢表示までを
   * 1選手のブロックとして取得。
   */
  const blockRegex =
    /(\d{4})\s*\/\s*(A1|A2|B1|B2)([\s\S]{0,2500}?)(?:\d{1,2})歳\s*\/\s*[\d.]+kg/gi;

  let match;

  while (
    (match = blockRegex.exec(html)) !== null &&
    racers.length < 6
  ) {
    const registration = match[1];
    const className = match[2];
    const block = match[3];

    let name = "";

    /*
     * 方法1-A
     * 選手プロフィールへのリンクから氏名を取得。
     */
    const profilePatterns = [
      new RegExp(
        `<a[^>]+toban=${registration}[^>]*>([\\s\\S]*?)<\\/a>`,
        "i"
      ),
      new RegExp(
        `<a[^>]+racer[^>]*>([\\s\\S]*?)<\\/a>`,
        "i"
      )
    ];

    for (const pattern of profilePatterns) {
      const nameMatch = block.match(pattern);

      if (nameMatch) {
        name = cleanName(nameMatch[1]);

        if (name) break;
      }
    }

    /*
     * 方法1-B
     * リンク構造が変わっていても、
     * テキスト化した選手ブロックから氏名を探す。
     */
    if (!name) {
      const blockText = stripHtml(block);

      /*
       * 氏名の直後に「支部/出身地」が来る構造を利用。
       */
      const locationMatch = blockText.match(
        /(.+?)\s+(北海道|青森|岩手|宮城|秋田|山形|福島|茨城|栃木|群馬|埼玉|千葉|東京|神奈川|新潟|富山|石川|福井|山梨|長野|岐阜|静岡|愛知|三重|滋賀|京都|大阪|兵庫|奈良|和歌山|鳥取|島根|岡山|広島|山口|徳島|香川|愛媛|高知|福岡|佐賀|長崎|熊本|大分|宮崎|鹿児島|沖縄)\/(?:北海道|青森|岩手|宮城|秋田|山形|福島|茨城|栃木|群馬|埼玉|千葉|東京|神奈川|新潟|富山|石川|福井|山梨|長野|岐阜|静岡|愛知|三重|滋賀|京都|大阪|兵庫|奈良|和歌山|鳥取|島根|岡山|広島|山口|徳島|香川|愛媛|高知|福岡|佐賀|長崎|熊本|大分|宮崎|鹿児島|沖縄)/
      );

      if (locationMatch) {
        name = locationMatch[1]
          .replace(/\s+/g, " ")
          .trim();
      }
    }

    addRacer(
      racers,
      registration,
      className,
      name
    );
  }

  return racers;
}

function parseRacersFromText(html) {
  const racers = [];
  const text = stripHtml(html);

  /*
   * 方法2
   * ページ全体をテキスト化して、
   * 4桁登録番号→級別→氏名→支部/出身
   * の並びを探す。
   */
  const prefectures =
    "(?:北海道|青森|岩手|宮城|秋田|山形|福島|茨城|栃木|群馬|埼玉|千葉|東京|神奈川|新潟|富山|石川|福井|山梨|長野|岐阜|静岡|愛知|三重|滋賀|京都|大阪|兵庫|奈良|和歌山|鳥取|島根|岡山|広島|山口|徳島|香川|愛媛|高知|福岡|佐賀|長崎|熊本|大分|宮崎|鹿児島|沖縄)";

  const regex = new RegExp(
    `(\\d{4})\\s*\\/\\s*(A1|A2|B1|B2)\\s+(.+?)\\s+${prefectures}\\/${prefectures}\\s+\\d{1,2}歳`,
    "g"
  );

  let match;

  while (
    (match = regex.exec(text)) !== null &&
    racers.length < 6
  ) {
    addRacer(
      racers,
      match[1],
      match[2],
      match[3]
    );
  }

  return racers;
}

async function raceData(hd, jcd, rno) {
  const html = await officialFetch(
    `/owpc/pc/race/racelist?hd=${hd}&jcd=${jcd}&rno=${rno}`
  );

  let racers = parseRacersFromRawHtml(html);

  if (racers.length < 6) {
    const textRacers = parseRacersFromText(html);

    for (const racer of textRacers) {
      addRacer(
        racers,
        racer.registration,
        racer.class,
        racer.name
      );
    }
  }

  racers = racers
    .slice(0, 6)
    .map((racer, index) => ({
      ...racer,
      lane: index + 1
    }));

  /*
   * 0人の場合だけ原因確認用の一部情報を返す。
   * 本番で取得できればdebugはnull。
   */
  let debug = null;

  if (racers.length === 0) {
    const text = stripHtml(html);

    const registrations = [
      ...text.matchAll(
        /(\d{4})\s*\/\s*(A1|A2|B1|B2)/g
      )
    ]
      .slice(0, 10)
      .map(m => `${m[1]}/${m[2]}`);

    debug = {
      htmlLength: html.length,
      textLength: text.length,
      registrationCandidates: registrations
    };
  }

  return {
    hd,
    jcd,
    venue: VENUE_NAMES[jcd] || jcd,
    rno: Number(rno),
    racers,
    debug
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/health") {
        return json({
          ok: true,
          version: "5.5"
        });
      }

      if (url.pathname === "/api/venues") {
        const hd =
          url.searchParams.get("hd") ||
          todayJST();

        return json({
          ok: true,
          hd,
          venues: await venues(hd)
        });
      }

      if (url.pathname === "/api/venue") {
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
            error: "jcdが必要です"
          }, 400);
        }

        return json({
          ok: true,
          ...(await venueData(hd, jcd))
        });
      }

      if (url.pathname === "/api/race") {
        const hd =
          url.searchParams.get("hd") ||
          todayJST();

        const jcd =
          url.searchParams.get("jcd");

        const rno =
          url.searchParams.get("rno");

        if (
          !jcd ||
          !/^\d{2}$/.test(jcd)
        ) {
          return json({
            ok: false,
            error: "jcdが必要です"
          }, 400);
        }

        const raceNumber = Number(rno);

        if (
          !Number.isInteger(raceNumber) ||
          raceNumber < 1 ||
          raceNumber > 12
        ) {
          return json({
            ok: false,
            error: "rnoは1〜12で指定してください"
          }, 400);
        }

        return json({
          ok: true,
          ...(await raceData(
            hd,
            jcd,
            raceNumber
          ))
        });
      }

      return env.ASSETS.fetch(request);

    } catch (e) {
      return json({
        ok: false,
        error:
          e?.message ||
          String(e)
      }, 502);
    }
  }
};
