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

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|li|td|th)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function officialFetch(path) {
  const r = await fetch(OFFICIAL + path, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; BoatRacingAI/5.4)",
      "accept": "text/html,application/xhtml+xml"
    }
  });

  if (!r.ok) {
    throw new Error(`BOAT RACE取得エラー HTTP ${r.status}`);
  }

  return await r.text();
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

async function venues(hd) {
  const html = await officialFetch(
    `/owpc/pc/race/index?hd=${hd}`
  );

  const found = [
    ...html.matchAll(/[?&]jcd=(\d{2})/g)
  ].map(m => m[1]);

  const ids = [...new Set(found)];

  const names = {
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

  return ids
    .filter(x => names[x])
    .map(jcd => ({
      jcd,
      name: names[jcd]
    }));
}

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
    races
  };
}

async function raceData(hd, jcd, rno) {
  const html = await officialFetch(
    `/owpc/pc/race/racelist?hd=${hd}&jcd=${jcd}&rno=${rno}`
  );

  const text = stripHtml(html);
  const racers = [];

  const regex =
    /(\d{4})\s*\/\s*(A1|A2|B1|B2)\s+(.+?)\s+([^\s/]+\/[^\s/]+)/g;

  let match;

  while ((match = regex.exec(text)) !== null) {
    const registration = match[1];
    const className = match[2];
    const name = match[3].replace(/\s+/g, " ").trim();

    if (!racers.some(r => r.registration === registration)) {
      racers.push({
        lane: racers.length + 1,
        registration,
        class: className,
        name
      });
    }

    if (racers.length === 6) break;
  }

  return {
    hd,
    jcd,
    rno: Number(rno),
    racers
  };
}
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/health") {
        return json({
          ok: true,
          version: "5.4"
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

        if (!jcd || !/^\d{2}$/.test(jcd)) {
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

        if (!jcd || !/^\d{2}$/.test(jcd)) {
          return json({
            ok: false,
            error: "jcdが必要です"
          }, 400);
        }

        if (
          !rno ||
          Number(rno) < 1 ||
          Number(rno) > 12
        ) {
          return json({
            ok: false,
            error: "rnoは1〜12で指定してください"
          }, 400);
        }

        return json({
          ok: true,
          ...(await raceData(hd, jcd, rno))
        });
      }

      return env.ASSETS.fetch(request);

    } catch (e) {
      return json({
        ok: false,
        error: e?.message || String(e)
      }, 502);
    }
  }
};
