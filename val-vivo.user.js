// ==UserScript==
// @name         Panel de Val · En vivo (Sofascore + Playdoit en vivo por código)
// @namespace    val-analisis-partidos
// @version      1.0.1
// @updateURL    https://raw.githubusercontent.com/xXValdiXx/val-futbol/main/val-vivo.user.js
// @downloadURL  https://raw.githubusercontent.com/xXValdiXx/val-futbol/main/val-vivo.user.js
// @description  Para el modo vivo del análisis: en una sola llamada trae minuto, estadísticas, goles/rojas y bet365 en vivo de Sofascore, y TODOS los mercados de Playdoit en vivo con su probabilidad sin margen. Sin abrir Playdoit.
// @match        https://www.sofascore.com/*
// @grant        none
// @sandbox      JavaScript
// @run-at       document-idle
// ==/UserScript==

/* Funciones para Claude (javascript_tool):
   vivoCuotasIniciar(["Local vs Visitante", ...]) / vivoCuotasParte(i) → partido en vivo completo (máx. 10)
   window.valVivo.version */
(function () {
  "use strict";
  if (window.valVivo) return;
  window.valVivo = { version: "1.0.1" };
  const B = "https://sb2frontend-altenar2.biahosted.com/api/widget/";
  const Q = "culture=es-ES&timezoneOffset=360&integration=playdoit2&deviceType=1&numFormat=en-GB&countryCode=MX";
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const limpia = (s) => String(s).replace(/[&=?]/g, " ").replace(/\s+/g, " ").trim();
  const jget = async (u) => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch (e) { return null; } };
  const pd = (ruta) => jget(B + ruta + (ruta.includes("?") ? "&" : "?") + Q);
  const sf = async (ruta) => { const x = await jget("/api/v1/" + ruta); await espera(250); return x; };
  const dec = (f) => { const [a, b] = String(f).split("/").map(Number); return b ? a / b + 1 : NaN; };
  const STOP = new Set(["fc", "cf", "sc", "ac", "afc", "cd", "ud", "sd", "club", "de", "del", "la", "el", "the", "fk", "sk", "if", "bk", "as", "us", "ss", "rc", "cp", "ca", "sv", "vfb", "vfl", "tsg", "1", "04", "05", "fbc", "calcio", "sporting", "atletico", "athletic", "united", "city", "real", "deportivo", "town", "rovers", "county", "wanderers", "albion", "borough", "olympic", "sports", "youth", "academy", "women", "reserves", "ii", "u21", "u23"]);
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const toks = (s) => { const t = norm(s).split(" ").filter((x) => x.length >= 3 && !STOP.has(x)); return t.length ? t : norm(s).split(" ").filter((x) => x.length >= 3); };
  const igual = (a, b) => { const A = toks(a), Bt = toks(b); return A.some((x) => Bt.some((y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))))); };
  const ids = (m) => [...(m.desktopOddIds || []).flat(), ...(m.oddIds || [])];
  const parte = (k) => (i) => { const o = window[k] || {}; if (!o.listo) return "todavía no está listo"; const t = o.texto || "", n = Math.max(1, Math.ceil(t.length / 950)); return "[parte " + (i + 1) + "/" + n + "] " + t.slice(i * 950, (i + 1) * 950); };
  const statPer = (est, per, ...claves) => {
    for (const p of (est && est.statistics) || []) { if (p.period !== per) continue;
      for (const gr of p.groups || []) for (const it of gr.statisticsItems || []) if (claves.includes(it.key)) { const h = Number(it.homeValue ?? it.home), a = Number(it.awayValue ?? it.away); return Number.isFinite(h) && Number.isFinite(a) ? [h, a] : null; } }
    return null;
  };

  // ---------- EN VIVO COMPLETO (v1.0): partido en vivo de Sofascore + todos los mercados de Playdoit en vivo, sin abrir Playdoit ----------
  // vivoCuotasIniciar(["Local vs Visitante"]) / vivoCuotasParte(i). Busca por nombre en los partidos EN VIVO (playIniciar solo ve los que no han empezado).
  window.vivoCuotasParte = parte("__vc");
  window.vivoCuotasIniciar = function (entradas) {
    window.__vc = { listo: false, texto: "" }; window.__vcDatos = {};
    (async () => {
      const L = await pd("GetLiveEvents?sportId=66");
      const S = ((await sf("sport/football/events/live")) || {}).events || [];
      const OU = /^(Más|Menos) de ([\d.]+)$/;
      const KEEP = { 1: 1, 10: 1, 11: 1, 18: 1, 29: 1, 16: 1, 19: 1, 20: 1, 8: 1, 166: 1, 167: 1, 168: 1 };
      const pct = (x) => Math.round(100 * x);
      const secs = [];
      for (const en of [].concat(entradas).slice(0, 10)) {
        const [a, b] = String(en).split(/ vs\.? /i);
        const pe = L && (L.events || []).find((p) => { const [x, y] = String(p.name).split(/ vs\.? /i); return igual(x, a) && (!b || igual(y, b)); });
        const s = S.find((e) => (e.status || {}).type === "inprogress" && igual(e.homeTeam.name, a) && (!b || igual(e.awayTeam.name, b)));
        const out = ["## " + limpia(en)];
        // --- Sofascore: minuto, estadísticas, goles/rojas y bet365 en vivo
        if (s) {
          const st = s.status || {}, t = s.time || {}, now = Date.now() / 1000;
          let min = st.description || "";
          if (st.code === 6 && t.currentPeriodStartTimestamp) min = Math.floor((now - t.currentPeriodStartTimestamp) / 60) + 1 + "'";
          else if (st.code === 7 && t.currentPeriodStartTimestamp) min = 45 + Math.floor((now - t.currentPeriodStartTimestamp) / 60) + 1 + "'";
          else if (st.code === 31) min = "medio tiempo";
          out[0] = "## " + limpia(s.homeTeam.name + " vs " + s.awayTeam.name) + " (" + limpia((s.tournament || {}).name || "") + ") [id " + s.id + "]";
          out.push("- Sofascore: " + min + " · marcador " + s.homeScore.current + "-" + s.awayScore.current
            + (s.homeScore.aggregated != null ? " · global " + s.homeScore.aggregated + "-" + s.awayScore.aggregated : "") + ((s.roundInfo || {}).name ? " · " + limpia(s.roundInfo.name) : ""));
          const est = await sf("event/" + s.id + "/statistics");
          const items = [["xG", "expectedGoals"], ["grandes ocasiones", "bigChanceCreated"], ["tiros", "totalShotsOnGoal"], ["a puerta", "shotsOnGoal"], ["córners", "cornerKicks"], ["rojas", "redCards"]];
          const f = items.map(([n, k]) => { const v = statPer(est, "ALL", k); return v ? n + " " + v[0] + "-" + v[1] : null; }).filter(Boolean);
          let pos = null; for (const p of (est && est.statistics) || []) if (p.period === "ALL") for (const gr of p.groups || []) for (const it of gr.statisticsItems || []) if (it.key === "ballPossession") pos = it.home + "-" + it.away;
          if (pos) f.unshift("posesión " + pos);
          const inc = ((await sf("event/" + s.id + "/incidents")) || {}).incidents || [];
          const hechos = inc.filter((x) => x.incidentType === "goal" || (x.incidentType === "card" && /red/i.test(x.incidentClass || ""))).reverse()
            .map((x) => (x.incidentType === "goal" ? "gol " : "roja ") + (x.isHome ? "local" : "visita") + " " + x.time + "'" + (x.player ? " " + (x.player.shortName || x.player.name) : ""));
          out.push("- Estadísticas (local-visita): " + (f.length ? f.join(" · ") : "s/d") + (hechos.length ? " | " + limpia(hechos.join(" · ")) : ""));
          const so = await sf("event/" + s.id + "/odds/1/all");
          const mk = so && so.markets ? so.markets.filter((m) => m.marketId === 1 && !m.suspended) : [];
          const ft = mk.find((m) => m.isLive) || mk[0];
          if (ft) { const p = ft.choices.map((c) => 1 / dec(c.fractionalValue)), sm = p.reduce((x, y) => x + y, 0); out.push("- bet365 " + (ft.isLive ? "en vivo" : "(cuota previa, sin vivo)") + " sin margen: " + ft.choices.map((c, i) => c.name + " " + pct(p[i] / sm) + " %").join(" · ")); }
          window.__vcDatos[en] = { sofa: s.id };
        } else out.push("- Sofascore: no se encontró en vivo");
        // --- Playdoit en vivo: todos los mercados principales con su probabilidad sin margen
        if (!pe) { out.push("- Playdoit en vivo: no encontrado (puede no ofrecerlo en vivo o tenerlo suspendido)"); secs.push(out.join("\n") + "\n"); continue; }
        const d = await pd("GetEventDetails?eventId=" + pe.id); await espera(200);
        out.push("- Playdoit en vivo " + (pe.liveTime || "") + " · " + (pe.score || []).join("-") + " [Playdoit " + pe.id + "] · cuota decimal (probabilidad sin margen)");
        if (!d) { out.push("- Mercados suspendidos o sin detalle"); secs.push(out.join("\n") + "\n"); continue; }
        const O = {}; (d.odds || []).forEach((o) => (O[o.id] = o));
        const vistos = new Set(); let n = 0;
        for (const m of d.markets || []) {
          const nm = String(m.name || "");
          // 1.0.1: también reconoce "1er tiempo" y "primer tiempo"
          const primera = /(1|primer)(a|ª|er|o|\.)? ?(mit|parte|tiempo)/i.test(nm) && /(total|resultado|final|marcan)/i.test(nm) && !/c[oó]rner|tarjeta|exact/i.test(nm);
          if (!KEEP[m.typeId] && !primera) continue;
          const os = ids(m).map((i) => O[i]).filter((o) => o && o.oddStatus === 0);
          if (!os.length) continue;
          const k = nm + "|" + os.map((o) => o.name).join(); if (vistos.has(k)) continue; vistos.add(k);
          // Más/Menos: se agrupan por línea; lo demás se toma como un solo mercado (2-3 resultados)
          const grupos = {}; for (const o of os) { const x = String(o.name).trim().match(OU); const g = x ? x[2] : "_"; (grupos[g] = grupos[g] || []).push(o); }
          const txt = Object.values(grupos).map((g) => { const sm = g.reduce((x, o) => x + 1 / o.price, 0), ok = g.length >= 2 && g.length <= 3 && m.typeId !== 10; // doble oportunidad: cada opción cubre dos resultados, no se normaliza
            return g.map((o) => limpia(o.name) + " " + Number(o.price).toFixed(2) + (ok ? " (" + pct(1 / o.price / sm) + " %)" : "")).join(" · ") + (ok ? " [margen " + Math.round((sm - 1) * 100) + " %]" : ""); }).join(" | ");
          out.push("- " + limpia(nm) + ": " + txt); n++;
        }
        if (!n) out.push("- Sin mercados abiertos ahora (suspendidos)");
        window.__vcDatos[en] = Object.assign(window.__vcDatos[en] || {}, { playdoit: pe.id });
        secs.push(out.join("\n") + "\n");
      }
      window.__vc = { listo: true, texto: "# En vivo: Sofascore + Playdoit (" + new Date().toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" }) + " CDMX)\n\n" + secs.join("\n") };
    })().catch((e) => { window.__vc = { listo: true, texto: "ERROR: " + e.message }; });
    return "iniciado";
  };
})();
