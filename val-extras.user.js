// ==UserScript==
// @name         Panel de Val · Extras (mercado, bajas, mercados nuevos)
// @namespace    val-analisis-partidos
// @version      1.16.0
// @updateURL    https://raw.githubusercontent.com/xXValdiXx/val-futbol/main/val-extras.user.js
// @downloadURL  https://raw.githubusercontent.com/xXValdiXx/val-futbol/main/val-extras.user.js
// @description  Complemento del Panel de Val: pestaña 📈 Mercado (movimiento de cuotas y Playdoit atrasado), peso de las bajas y cuotas de mercados nuevos. Necesita el Panel de Val 1.6.0 o mayor.
// @match        https://www.sofascore.com/*
// @grant        none
// @sandbox      JavaScript
// @run-at       document-idle
// ==/UserScript==

/* Funciones para Claude (javascript_tool):
   movIniciar([idSofascore]) / movParte(i)   → lectura del mercado: cómo se movieron bet365 y Playdoit desde el primer registro y si Playdoit va atrasado
   bajasIniciar([idSofascore]) / bajasParte(i) → peso de cada baja (minutos, goles, asistencias, rating) y factor sugerido para los goles esperados
   extraIniciar(["Local vs Visitante"]) / extraParte(i) → cuotas de Playdoit de mercados nuevos (anota primero, portería a cero, gana sin recibir gol, 1.ª mitad, mitades)
   jugIniciar([idSofascore]) / jugParte(i) → goles por jugador: probabilidad de anotar (cualquier momento, 2+ y primer gol) contra la cuota de goleador de Playdoit (v1.1)
   estadIniciar() / estadExportar() → descarga de estadísticas por partido (córners, remates a puerta, tiros, xG, medio tiempo) para entrenar los modelos de córners y remates (v1.1)
   cornIniciar([idSofascore]) / cornParte(i) → modelo de córners y remates a puerta por equipo (v1.2): esperados y probabilidad de cada línea
   xgIniciar([idSofascore]) / xgParte(i) → goles esperados del modelo entrenado mezclado con ratings de xG (v1.3; mejor en la prueba)
   lineasIniciar([idSofascore]) / lineasParte(i) → mejor línea: valor esperado de todas las líneas de Playdoit (goles, por equipo, hándicap, ambos anotan, córners, córners 1er tiempo) contra el modelo (v1.4)
   secIniciar("hoy"|"mañana"|"AAAA-MM-DD") / secParte(i) → escáner de mercados secundarios con el modelo en todos los partidos de las 12 ligas; en días futuros marca las líneas tempranas (v1.4)
   ventanaRevisar() → ventana de alineaciones: bajas fuertes confirmadas en partidos de la próxima hora y si Playdoit no ajustó (v1.4)
   golesIniciar() / golesExportar() → descarga de minutos de gol y rojas para el modelo en vivo (v1.4)
   valAnalizar([ids]) / valAnalizarParte(i) → análisis en una llamada: tabla armada por partido (v1.14)
   window.valExtras.version */
(function () {
  "use strict";
  if (window.valExtras) return;
  window.valExtras = { version: "1.16.0" };
  const B = "https://sb2frontend-altenar2.biahosted.com/api/widget/";
  const Q = "culture=es-ES&timezoneOffset=360&integration=playdoit2&deviceType=1&numFormat=en-GB&countryCode=MX";
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const limpia = (s) => String(s).replace(/[&=?]/g, " ").replace(/\s+/g, " ").trim();
  const jget = async (u) => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch (e) { return null; } };
  const pd = (ruta) => jget(B + ruta + (ruta.includes("?") ? "&" : "?") + Q);
  const sf = async (ruta) => { const x = await jget("/api/v1/" + ruta); await espera(250); return x; };
  const dec = (f) => { const [a, b] = String(f).split("/").map(Number); return b ? a / b + 1 : NaN; };
  const hora = (ms) => new Date(ms).toLocaleString("es-MX", { timeZone: "America/Mexico_City", weekday: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const STOP = new Set(["fc", "cf", "sc", "ac", "afc", "cd", "ud", "sd", "club", "de", "del", "la", "el", "the", "fk", "sk", "if", "bk", "as", "us", "ss", "rc", "cp", "ca", "sv", "vfb", "vfl", "tsg", "1", "04", "05", "fbc", "calcio", "sporting", "atletico", "athletic", "united", "city", "real", "deportivo", "town", "rovers", "county", "wanderers", "albion", "borough", "olympic", "sports", "youth", "academy", "women", "reserves", "ii", "u21", "u23"]);
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const toks = (s) => { const t = norm(s).split(" ").filter((x) => x.length >= 3 && !STOP.has(x)); return t.length ? t : norm(s).split(" ").filter((x) => x.length >= 3); };
  const igual = (a, b) => { const A = toks(a), Bt = toks(b); return A.some((x) => Bt.some((y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))))); };
  const ids = (m) => [...(m.desktopOddIds || []).flat(), ...(m.oddIds || [])];
  const parte = (k) => (i) => { const o = window[k] || {}; if (!o.listo) return "todavía no está listo"; const t = o.texto || "", n = Math.max(1, Math.ceil(t.length / 950)); return "[parte " + (i + 1) + "/" + n + "] " + t.slice(i * 950, (i + 1) * 950); };
  const sinMargen = (...c) => { if (c.some((v) => !v)) return null; const s = c.reduce((a, v) => a + 1 / v, 0); return c.map((v) => 100 / v / s); };
  const r1 = (x) => Math.round(x * 10) / 10;

  // ---------- Registro de cuotas guardado por el panel (IndexedDB "valPanel" / "cuotas") ----------
  const leerRegistro = () => new Promise((res) => {
    const r = indexedDB.open("valPanel", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("cuotas", { autoIncrement: true });
    r.onsuccess = () => { try { const q = r.result.transaction("cuotas").objectStore("cuotas").getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); } catch (e) { res([]); } };
    r.onerror = () => res([]);
  });

  // Cuotas de ahora mismo (bet365 sin margen vía Sofascore + Playdoit) para un partido de Sofascore
  let LISTA = null, LISTA_T = 0;
  async function ahora(eid) {
    const d = await sf("event/" + eid); if (!d) return null;
    const e = d.event, t0 = e.startTimestamp * 1000;
    if (!LISTA || Date.now() - LISTA_T > 5 * 60000) { LISTA = await pd("GetEvents?eventCount=0&sportId=66&champIds=0"); LISTA_T = Date.now(); }
    const L = LISTA; const out = { eid, partido: e.homeTeam.name + " vs " + e.awayTeam.name, inicio: t0 };
    const so = await sf("event/" + eid + "/odds/1/all");
    const mk = (mid, g) => so && so.markets && so.markets.find((m) => m.marketId === mid && !m.suspended && (g == null || String(m.choiceGroup) === String(g)));
    const justa = (m) => { if (!m) return {}; const p = m.choices.map((c) => 1 / dec(c.fractionalValue)); const s = p.reduce((x, y) => x + y, 0); return Object.fromEntries(m.choices.map((c, i) => [c.name, 100 * p[i] / s])); };
    const b = justa(mk(1)); out.b1 = b["1"]; out.bX = b.X; out.b2 = b["2"];
    if (L) {
      const O = {}, M = {}; L.odds.forEach((o) => (O[o.id] = o)); L.markets.forEach((m) => (M[m.id] = m));
      const pe = L.events.find((p) => Math.abs(new Date(p.startDate).getTime() - t0) < 3 * 3600000 && (([a, c]) => igual(a, e.homeTeam.name) && igual(c, e.awayTeam.name))(String(p.name).split(/ vs\.? /i)));
      if (pe) {
        const precio = (tipo, ot) => { for (const i of pe.marketIds) { const m = M[i]; if (!m || m.typeId !== tipo) continue; for (const j of m.oddIds) { const o = O[j]; if (o && o.typeId === ot && o.oddStatus === 0) return { p: o.price, sv: m.sv }; } } return null; };
        const a = precio(1, 1), x = precio(1, 2), c = precio(1, 3), mo = precio(18, 12), mu = precio(18, 13);
        out.pd1 = a && a.p; out.pdX = x && x.p; out.pd2 = c && c.p; out.linea = mo ? String(mo.sv) : ""; out.pdMas = mo && mo.p; out.pdMenos = mu && mu.p;
        const bt = justa(mk(9, out.linea)); out.bMas = bt.Over; out.bMenos = bt.Under;
      }
    }
    return out;
  }

  // Lectura de una serie de registros de un partido (más viejo → más nuevo)
  function leer(serie) {
    const a = serie[0], z = serie[serie.length - 1], out = [];
    const sel = [["1", "b1", "pd1", "gana " + (z.partido || "").split(" vs ")[0]], ["X", "bX", "pdX", "empate"], ["2", "b2", "pd2", "gana " + (z.partido || "").split(" vs ")[1]]];
    if (z.linea && a.linea === z.linea) sel.push(["Más", "bMas", "pdMas", "Más de " + z.linea + " goles"], ["Menos", "bMenos", "pdMenos", "Menos de " + z.linea + " goles"]);
    const horas = r1(((z.ts ? Date.parse(z.ts) : Date.now()) - Date.parse(a.ts)) / 36e5);
    let señales = 0;
    for (const [k, bk, pk, txt] of sel) {
      const b0 = a[bk], b1 = z[bk], c0 = a[pk], c1 = z[pk];
      if (b0 == null || b1 == null || !c0 || !c1) continue;
      const mb = b1 - b0, mp = 100 / c1 - 100 / c0; // puntos que se movió bet365 (sin margen) y la implícita de Playdoit
      const ev = (c1 * b1 / 100 - 1) * 100; // cuánto paga Playdoit hoy contra lo justo de bet365
      let lect = "";
      if (Math.abs(mb) >= 3) {
        const dir = mb > 0 ? "sube" : "baja";
        lect = "el mercado " + (mb > 0 ? "le cree más" : "le cree menos") + " (bet365 " + dir + " " + r1(Math.abs(mb)) + " puntos)";
        if (Math.sign(mp) !== Math.sign(mb) || Math.abs(mp) < Math.abs(mb) / 2) lect += " y Playdoit casi no se ha movido" + (mb > 0 && ev >= 0 ? " → PLAYDOIT ATRASADO: tomar ya" : mb < 0 ? " → su cuota ya no vale lo que paga: evitarlo" : "");
      } else if (Math.abs(mp) >= 3) lect = "Playdoit se movió " + r1(Math.abs(mp)) + " puntos y bet365 no: puede ser solo margen de Playdoit";
      if (ev >= 0 && !lect.includes("ATRASADO")) lect += (lect ? "; " : "") + "Playdoit paga " + (ev >= 0 ? "+" : "") + r1(ev) + " % sobre lo justo";
      if (lect.includes("ATRASADO") || ev >= 0) señales++;
      out.push({ k, txt, b0: r1(b0), b1: r1(b1), c0, c1, ev: r1(ev), lect });
    }
    return { horas, regs: serie.length, filas: out, señales };
  }

  // movIniciar(ids): primer registro guardado contra las cuotas de AHORA (las busca en vivo)
  window.movParte = parte("__mov");
  window.movIniciar = function (eids) {
    window.__mov = { listo: false, texto: "" }; window.__movDatos = [];
    (async () => {
      const reg = await leerRegistro(), secs = [];
      for (const eid of [].concat(eids).slice(0, 20)) {
        const serie = reg.filter((r) => String(r.eid) === String(eid)).sort((a, b) => (a.ts < b.ts ? -1 : 1));
        const act = await ahora(eid);
        if (!act) { secs.push("## " + eid + "\n- No se pudo leer el partido\n"); continue; }
        act.ts = new Date().toISOString();
        if (!serie.length) { secs.push("## " + limpia(act.partido) + " [id " + eid + "]\n- Sin registros anteriores (activa \"Guardar cada hora\" en Datos). Cuotas de ahora: bet365 justa 1 " + r1(act.b1 || 0) + " % · X " + r1(act.bX || 0) + " % · 2 " + r1(act.b2 || 0) + " %\n"); continue; }
        const L = leer([...serie, act]);
        window.__movDatos.push({ eid, partido: act.partido, inicio: act.inicio, ...L });
        secs.push("## " + limpia(act.partido) + " (" + hora(act.inicio) + " CDMX) [id " + eid + "] · " + L.regs + " registros en " + L.horas + " h\n" + (L.filas.length ? L.filas.map((f) => "- " + limpia(f.txt) + ": bet365 justa " + f.b0 + " % → " + f.b1 + " % · Playdoit @" + f.c0 + " → @" + f.c1 + " (hoy " + (f.ev >= 0 ? "+" : "") + f.ev + " % contra lo justo)" + (f.lect ? " · " + f.lect : "")).join("\n") : "- Sin cuotas comparables") + "\n");
      }
      window.__mov = { listo: true, texto: "# Lectura del mercado (primer registro → ahora)\nbet365 sin margen = lo que el mercado cree. Si bet365 se mueve 3+ puntos y Playdoit no, Playdoit va atrasado.\n\n" + secs.join("\n") };
    })().catch((e) => { window.__mov = { listo: true, texto: "ERROR: " + e.message }; });
    return "iniciado";
  };

  // ---------- BAJAS: cuánto pesa cada ausente ----------
  // Ataque: (goles + 0.5 × asistencias) ÷ goles del equipo, × 0.5 (el suplente cubre la mitad), duda = mitad. Tope −25 %.
  // Defensa: portero o defensa titular (60 %+ de los minutos) con rating 7.0+: +4 % de goles en contra cada uno (duda = mitad). Tope +12 %.
  window.bajasParte = parte("__bajas");
  window.bajasIniciar = function (eids) {
    window.__bajas = { listo: false, texto: "" }; window.__bajasDatos = {};
    (async () => {
      const secs = [];
      for (const eid of [].concat(eids).slice(0, 15)) {
        const d = await sf("event/" + eid); if (!d) { secs.push("## " + eid + "\n- No se pudo leer\n"); continue; }
        const ev = d.event, ut = ((ev.tournament || {}).uniqueTournament || {}).id, se = (ev.season || {}).id;
        const lu = await sf("event/" + eid + "/lineups");
        const res = { local: null, visita: null };
        const lineas = ["## " + limpia(ev.homeTeam.name + " vs " + ev.awayTeam.name) + " [id " + eid + "]"];
        for (const [lado, T] of [["home", ev.homeTeam], ["away", ev.awayTeam]]) {
          const miss = ((lu && lu[lado] && lu[lado].missingPlayers) || []);
          const te = ut && se ? await sf("team/" + T.id + "/unique-tournament/" + ut + "/season/" + se + "/statistics/overall") : null;
          const golesEq = te && te.statistics ? te.statistics.goalsScored : null, pjEq = te && te.statistics ? te.statistics.matches : null;
          let atk = 0, def = 0; const desc = [];
          for (const x of miss) {
            const p = x.player || {}, w = x.type === "doubtful" ? 0.5 : 1;
            const st = ut && se ? await sf("player/" + p.id + "/unique-tournament/" + ut + "/season/" + se + "/statistics/overall") : null;
            const s = (st && st.statistics) || {};
            const min = s.minutesPlayed || 0, pctMin = pjEq ? Math.round(100 * min / (pjEq * 90)) : null;
            const g = s.goals || 0, a = s.assists || 0, rt = s.rating ? Number(s.rating).toFixed(2) : "s/d";
            const pos = p.position || "";
            let aporte = 0;
            if (golesEq) aporte = Math.min(0.6, (g + 0.5 * a) / Math.max(golesEq, 1));
            atk += w * aporte * 0.5;
            if ((pos === "G" || pos === "D") && pctMin != null && pctMin >= 60 && Number(s.rating) >= 7.0) def += w * 0.04;
            desc.push((p.shortName || p.name || "?") + " (" + (pos || "?") + (w < 1 ? ", duda" : "") + "; " + (pctMin != null ? pctMin + " % de los minutos" : "minutos s/d") + ", " + g + " goles, " + a + " asist., rating " + rt + ")");
          }
          atk = Math.min(atk, 0.25); def = Math.min(def, 0.12);
          const nom = T.shortName || T.name;
          const fAtk = Math.round((1 - atk) * 100) / 100, fDef = Math.round((1 + def) * 100) / 100;
          res[lado === "home" ? "local" : "visita"] = { equipo: nom, fAtk, fDef, n: miss.length };
          lineas.push("- " + limpia(nom) + ": " + (miss.length ? limpia(desc.join(" · ")) : "sin bajas reportadas") + (miss.length ? " → sus goles a favor ×" + fAtk.toFixed(2) + (def ? ", goles que recibe ×" + fDef.toFixed(2) : "") : "") + (golesEq != null ? " (equipo: " + golesEq + " goles en " + pjEq + " partidos)" : " (estadísticas de temporada s/d en esta competencia)"));
        }
        const L = res.local, V = res.visita;
        lineas.push("- Factor para los goles esperados: local ×" + (L.fAtk * V.fDef).toFixed(2) + " · visitante ×" + (V.fAtk * L.fDef).toFixed(2) + (lu && lu.confirmed ? " (alineación confirmada)" : " (bajas reportadas; alineación sin confirmar)"));
        window.__bajasDatos[eid] = { fL: L.fAtk * V.fDef, fV: V.fAtk * L.fDef, local: L, visita: V };
        secs.push(lineas.join("\n") + "\n");
      }
      window.__bajas = { listo: true, texto: "# Peso de las bajas (en prueba)\nAtaque: goles + media asistencia de cada baja sobre los goles del equipo, a la mitad porque juega un suplente (tope −25 %). Defensa: portero o defensa titular con rating 7.0+ suma 4 % a los goles que recibe (tope +12 %). Duda = mitad.\n\n" + secs.join("\n") };
    })().catch((e) => { window.__bajas = { listo: true, texto: "ERROR: " + e.message }; });
    return "iniciado";
  };

  // ---------- MERCADOS NUEVOS de Playdoit (se buscan por nombre del mercado) ----------
  const NUEVOS = [
    [/primer.*(equipo|gol|anot)|anota primero|marca primero/i, "Anota primero"],
    [/porter[ií]a a cero|valla invicta|no recibe gol|clean sheet/i, "Portería a cero"],
    [/gana(r)? (sin recibir|a cero)|victoria a cero|ganar? sin encajar/i, "Gana sin recibir gol"],
    [/(1|primera)[ªa.]? ?(mitad|parte|tiempo).*(total|goles|más|menos)|total.*(1|primera)[ªa.]? ?(mitad|parte|tiempo)/i, "Goles 1.ª mitad"],
    [/gana(r)? (al menos una|alguna|cualquier) (mitad|parte)/i, "Gana al menos una mitad"],
    [/mitad con m[aá]s goles|parte con m[aá]s goles|mitad m[aá]s goleadora/i, "Mitad con más goles"],
    [/(tiros|remates) a puerta/i, "Remates a puerta (equipo)"],
    [/ambos.*(y|&).*(resultado|ganador|1x2|total)|(resultado|ganador|1x2).*(y|&).*ambos/i, "Combinada con ambos anotan"],
    [/(resultado|ganador|1x2|doble oportunidad).*(y|&).*(total|goles|más|menos)/i, "Combinada resultado y goles"],
  ];
  window.extraParte = parte("__extra");
  window.extraIniciar = function (entradas, dias = 2) {
    window.__extra = { listo: false, texto: "" };
    (async () => {
      const lista = await pd("GetEvents?eventCount=0&sportId=66&champIds=0");
      if (!lista) { window.__extra = { listo: true, texto: "ERROR: no se pudo leer Playdoit" }; return; }
      const limite = Date.now() + dias * 86400000, eventos = (lista.events || []).filter((e) => new Date(e.startDate).getTime() < limite);
      const secs = [], tipos = {};
      for (const en of [].concat(entradas).slice(0, 25)) {
        const partes = String(en).split(/ vs\.? /i).map(norm);
        const ev = eventos.find((e) => partes.every((p) => norm(e.name).includes(p))) || eventos.find((e) => norm(e.name).includes(partes[0]));
        if (!ev) { secs.push("## " + limpia(en) + "\n- No encontrado en Playdoit\n"); continue; }
        const d = await pd("GetEventDetails?eventId=" + ev.id); await espera(300);
        const out = ["## " + limpia(ev.name) + " [Playdoit " + ev.id + "]"];
        if (!d) { out.push("- Sin detalle"); secs.push(out.join("\n") + "\n"); continue; }
        const O = {}; (d.odds || []).forEach((o) => (O[o.id] = o));
        const vistos = new Set();
        for (const m of d.markets || []) {
          const nm = String(m.name || ""); const hit = NUEVOS.find(([re]) => re.test(nm)); if (!hit) continue; if (hit[1] === "Goles 1.ª mitad" && /esquina|c[oó]rner|tarjeta|remate|tiros|disparo/i.test(nm)) continue;
          const ps = ids(m).map((i) => O[i]).filter((o) => o && o.oddStatus === 0).map((o) => limpia(o.name) + " " + Number(o.price).toFixed(2));
          const k = nm + ps.join(); if (!ps.length || vistos.has(k)) continue; vistos.add(k);
          tipos[m.typeId] = hit[1] + " (" + nm + ")";
          out.push("- " + hit[1] + " · " + limpia(nm) + ": " + ps.join(" · "));
        }
        if (out.length === 1) out.push("- Playdoit no ofrece estos mercados en este partido");
        secs.push(out.join("\n") + "\n");
      }
      window.__extraTipos = tipos;
      window.__extra = { listo: true, texto: "# Mercados nuevos de Playdoit (decimales)\n\n" + secs.join("\n") };
    })().catch((e) => { window.__extra = { listo: true, texto: "ERROR: " + e.message }; });
    return "iniciado";
  };
  // Para revisar qué mercados trae un partido (nombre y tipo), por si Playdoit los nombra distinto
  window.extraNombres = async function (partido) {
    const lista = await pd("GetEvents?eventCount=0&sportId=66&champIds=0"); if (!lista) return "ERROR";
    const ps = String(partido).split(/ vs\.? /i).map(norm);
    const ev = (lista.events || []).find((e) => ps.every((p) => norm(e.name).includes(p))); if (!ev) return "No encontrado";
    const d = await pd("GetEventDetails?eventId=" + ev.id); if (!d) return "Sin detalle";
    return [...new Map((d.markets || []).map((m) => [m.typeId, m.typeId + ": " + m.name])).values()].join("\n");
  };


  // ---------- GOLES POR JUGADOR (v1.1, en prueba) ----------
  // Parte de los goles del equipo que hace cada jugador cuando está en la cancha: (½ goles + ½ xG) ÷ goles del equipo × (minutos del equipo ÷ sus minutos),
  // encogida hacia un valor por posición con pocos minutos (peso = minutos ÷ (minutos + 400)). Goles esperados del jugador = goles esperados del equipo × parte × minutos esperados ÷ 90.
  const PRIOR = { F: 0.15, M: 0.06, D: 0.025, G: 0 };
  const pois1 = (l) => 1 - Math.exp(-l), pois2 = (l) => 1 - Math.exp(-l) * (1 + l);
  async function lamPartido(ev) {
    const ut = ((ev.tournament || {}).uniqueTournament || {}).id;
    if (window.valFemLigas && FEM_UT[ut]) { const g = window.valFemLigas.lambdas(ev); return g ? { lL: g.lL, lV: g.lV, rho: g.rho, fuente: "modelo femenil (" + g.liga + ")" } : null; }
    if (ev.homeTeam.national && ev.awayTeam.national) { const g = window.valSel && selDe(ev).lambdas(ev); return g ? { lL: g.lL, lV: g.lV, rho: g.rho, fuente: "modelo selecciones" + (esFem(ev) ? " femenil" : "") + (g.neutral ? ", cancha neutral" : "") + (g.alto ? ", altura" : "") } : null; }
    if (window.valCopa && window.valCopa.ids && window.valCopa.ids[ut]) { const r = window.valCopa.lambdas(ev.homeTeam.id, ev.awayTeam.id, ut); if (r) return { lL: r.lL, lV: r.lV, fuente: "modelo copa" }; }
    if (window.valRatings) { const r = window.valRatings.lambdas(ev.homeTeam.name, ev.awayTeam.name); if (r) return { lL: r.lL, lV: r.lV, fuente: "modelo entrenado" }; }
    return null;
  }
  window.jugParte = parte("__jug");
  // eids: ids de Sofascore. lams opcional: { eid: [lL, lV] } para usar los goles esperados ya ajustados del análisis.
  window.jugIniciar = function (eids, lams = {}) {
    window.__jug = { listo: false, texto: "" }; window.__jugDatos = {};
    (async () => {
      const lista = await pd("GetEvents?eventCount=0&sportId=66&champIds=0");
      const secs = [];
      for (const eid of [].concat(eids).slice(0, 10)) {
        const d = await sf("event/" + eid); if (!d) { secs.push("## " + eid + "\n- No se pudo leer\n"); continue; }
        const ev = d.event, ut = ((ev.tournament || {}).uniqueTournament || {}).id, se = (ev.season || {}).id, t0 = ev.startTimestamp * 1000;
        const L = lams[eid] ? { lL: lams[eid][0], lV: lams[eid][1], fuente: "goles esperados del análisis" } : await lamPartido(ev);
        const tit = "## " + limpia(ev.homeTeam.name + " vs " + ev.awayTeam.name) + " (" + hora(t0) + " CDMX) [id " + eid + "]";
        if (!L) { secs.push(tit + "\n- Sin goles esperados del modelo: pasar lams desde el análisis\n"); continue; }
        // cuotas de goleador de Playdoit (mercado 21001, un submercado por jugador)
        let goleadores = [];
        if (lista) {
          const pe = (lista.events || []).find((p) => Math.abs(new Date(p.startDate).getTime() - t0) < 3 * 3600000 && (([a, c]) => igual(a, ev.homeTeam.name) && igual(c, ev.awayTeam.name))(String(p.name).split(/ vs\.? /i)))
            || (lista.events || []).find((p) => Math.abs(new Date(p.startDate).getTime() - t0) <= 20 * 60000 && (([a, c]) => igual(a, ev.homeTeam.name) || igual(c, ev.awayTeam.name))(String(p.name).split(/ vs\.? /i)));
          if (pe) {
            const dd = await pd("GetEventDetails?eventId=" + pe.id); await espera(200);
            if (dd) {
              const O = {}; (dd.odds || []).forEach((o) => (O[o.id] = o)); const C = {}; (dd.childMarkets || []).forEach((m) => (C[m.id] = m));
              for (const m of (dd.markets || []).filter((m) => m.typeId === 21001)) for (const ci of m.childMarketIds || []) {
                const h = C[ci]; if (!h) continue;
                const os = ids(h).map((i) => O[i]).filter((o) => o && o.oddStatus === 0);
                goleadores.push({ nombre: String(h.name).split(" - ").slice(1).join(" - ") || h.name, cual: (os.find((o) => /^cualq/i.test(o.name)) || {}).price, pri: (os.find((o) => /^primer/i.test(o.name)) || {}).price, dos: (os.find((o) => /2|dos/i.test(o.name)) || {}).price });
              }
            }
          }
        }
        const apellido = (n) => { const t = norm(n).split(" ").filter((x) => x.length >= 3); return t[t.length - 1] || norm(n); };
        const buscaPd = (nm) => goleadores.find((g) => norm(g.nombre).split(" ").includes(apellido(nm)));
        const lu = await sf("event/" + eid + "/lineups");
        const out = [tit + " · goles esperados " + L.lL.toFixed(2) + " / " + L.lV.toFixed(2) + " (" + L.fuente + ")" + (lu && lu.confirmed ? " · alineación confirmada" : lu && lu.home && (lu.home.players || []).length ? " · alineación probable" : " · sin alineación: minutos por promedio")];
        const filas = [];
        for (const [lado, T, lamT] of [["home", ev.homeTeam, L.lL], ["away", ev.awayTeam, L.lV]]) {
          const te = await sf("team/" + T.id + "/unique-tournament/" + ut + "/season/" + se + "/statistics/overall");
          const ts = (te && te.statistics) || {}, golesEq = ts.goalsScored || 0, pj = ts.matches || 0;
          const tp = await sf("team/" + T.id + "/unique-tournament/" + ut + "/season/" + se + "/top-players/overall");
          const top = (tp && tp.topPlayers) || {};
          const cand = new Map(); for (const k of ["goals", "expectedGoals"]) for (const x of (top[k] || []).slice(0, 8)) if (x.player) cand.set(x.player.id, x.player);
          const enLu = new Map(); const lado2 = lu && lu[lado]; for (const x of (lado2 && lado2.players) || []) if (x.player) enLu.set(x.player.id, x.substitute ? "banca" : "titular");
          const bajas = new Set(((lado2 && lado2.missingPlayers) || []).map((x) => x.player && x.player.id));
          if (enLu.size) for (const x of (lado2.players || [])) if (x.player && !x.substitute && (x.player.position === "F" || x.player.position === "M")) cand.set(x.player.id, x.player);
          if (!golesEq || !pj || !cand.size) { out.push("- " + limpia(T.shortName || T.name) + ": estadísticas de temporada s/d en esta competencia"); continue; }
          for (const [pid, P] of cand) {
            if (bajas.has(pid)) continue;
            const st = await sf("player/" + pid + "/unique-tournament/" + ut + "/season/" + se + "/statistics/overall");
            const s2 = (st && st.statistics) || {}, mins = s2.minutesPlayed || 0, g = s2.goals || 0, xg = s2.expectedGoals != null ? Number(s2.expectedGoals) : g;
            const pos = P.position || "M", prior = PRIOR[pos] ?? 0.06;
            const bruto = mins > 0 ? ((0.5 * g + 0.5 * xg) / Math.max(golesEq, 1)) * (pj * 90 / mins) : prior;
            const w = mins / (mins + 400), parte = Math.min(0.6, w * bruto + (1 - w) * prior);
            const estado = enLu.get(pid);
            const minEsp = enLu.size ? (estado === "titular" ? 80 : estado === "banca" ? 15 : 0) : Math.min(85, mins / pj);
            if (minEsp <= 0) continue;
            const lam = lamT * parte * minEsp / 90, sum = L.lL + L.lV;
            const pc = pois1(lam), p2 = pois2(lam), pp = (lam / sum) * (1 - Math.exp(-sum)); // primer gol: su parte de los goles del partido × que haya gol
            const q = buscaPd(P.name || P.shortName || "");
            const fila = { eid, jugador: P.name || P.shortName, equipo: T.shortName || T.name, pos, mins, goles: g, xg: Math.round(xg * 100) / 100, parte: Math.round(parte * 1000) / 1000, minEsp: Math.round(minEsp), pCual: Math.round(pc * 100), p2: Math.round(p2 * 100), pPrimero: Math.round(pp * 100), cuota: q && q.cual, cuotaPri: q && q.pri };
            fila.ev = fila.cuota ? Math.round((fila.cuota * pc - 1) * 1000) / 10 : null;
            filas.push(fila);
          }
        }
        filas.sort((a, b) => b.pCual - a.pCual);
        window.__jugDatos[eid] = filas;
        out.push(...filas.slice(0, 12).map((f) => "- " + limpia(f.jugador) + " (" + limpia(f.equipo) + ", " + f.pos + "): anota " + f.pCual + " % · 2+ goles " + f.p2 + " % · primer gol " + f.pPrimero + " % · " + f.goles + " goles y " + f.xg + " xG en " + f.mins + " min · juega ~" + f.minEsp + " min" + (f.cuota ? " · Playdoit @" + f.cuota.toFixed(2) + " (pide " + Math.round(100 / f.cuota) + " %; " + (f.ev >= 0 ? "+" : "") + f.ev + " % de valor)" : " · sin cuota de goleador")));
        secs.push(out.join("\n") + "\n");
      }
      window.__jug = { listo: true, texto: "# Goles por jugador (en prueba)\nAnota = probabilidad de que meta al menos un gol a 90'. Parte de los goles del equipo cuando está en la cancha (½ goles + ½ xG), encogida si jugó poco; minutos esperados por la alineación o su promedio.\n\n" + secs.join("\n") };
    })().catch((e) => { window.__jug = { listo: true, texto: "ERROR: " + e.message }; });
    return "iniciado";
  };

  // ---------- DESCARGA DE ESTADÍSTICAS POR PARTIDO (v1.1) para entrenar córners y remates ----------
  const LIGAS = [[17, "Premier"], [8, "LaLiga"], [23, "Serie A"], [35, "Bundesliga"], [34, "Ligue 1"], [11621, "Liga MX"], [242, "MLS"], [37, "Eredivisie"], [238, "Portugal"], [325, "Brasileirão"], [155, "Argentina"], [955, "Saudi"]];
  let EDB = null;
  const edb = () => EDB ? Promise.resolve(EDB) : new Promise((res, rej) => { const r = indexedDB.open("valExtras", 2); r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains("stats")) db.createObjectStore("stats", { keyPath: "eid" }); if (!db.objectStoreNames.contains("hechos")) db.createObjectStore("hechos"); if (!db.objectStoreNames.contains("goles")) db.createObjectStore("goles", { keyPath: "eid" }); }; r.onsuccess = () => { EDB = r.result; res(EDB); }; r.onerror = () => rej(r.error); });
  const etx = (st, modo, fn) => new Promise((res, rej) => { const t = EDB.transaction(st, modo); fn(t.objectStore(st)); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  const eget = (st, k) => new Promise((res) => { const r = EDB.transaction(st).objectStore(st).get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); });
  const eall = (st) => new Promise((res) => { const r = EDB.transaction(st).objectStore(st).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); });
  const statPer = (est, per, ...claves) => {
    for (const p of (est && est.statistics) || []) { if (p.period !== per) continue;
      for (const gr of p.groups || []) for (const it of gr.statisticsItems || []) if (claves.includes(it.key)) { const h = Number(it.homeValue ?? it.home), a = Number(it.awayValue ?? it.away); return Number.isFinite(h) && Number.isFinite(a) ? [h, a] : null; } }
    return null;
  };
  window.estadIniciar = function (temporadas = 2) {
    window.__estad = { listo: false, paso: "inicio", n: 0, nuevos: 0 };
    (async () => {
      await edb();
      for (const [id, nom] of LIGAS) {
        const ss = ((await sf("unique-tournament/" + id + "/seasons")) || {}).seasons || [];
        for (let si = 0; si < Math.min(temporadas, ss.length); si++) {
          const se = ss[si], clave = id + "-" + se.id;
          if (si > 0 && (await eget("hechos", clave))) continue;
          window.__estad.paso = nom + " " + (se.year || se.name) + " (lista)";
          const evs = [];
          for (let pg = 0; pg < 60; pg++) { const d = (await sf("unique-tournament/" + id + "/season/" + se.id + "/events/last/" + pg)) || {}; evs.push(...(d.events || [])); if (!d.hasNextPage) break; }
          let k = 0;
          for (const e of evs) {
            k++;
            if ((e.status || {}).type !== "finished" || (await eget("stats", e.id))) continue;
            window.__estad.paso = nom + " " + (se.year || se.name) + " · " + k + "/" + evs.length;
            const est = await sf("event/" + e.id + "/statistics");
            const g = (x, k2) => (x ? x[k2] : null);
            const fila = { eid: e.id, liga: nom, temporada: se.year || se.name, fecha: new Date(e.startTimestamp * 1000).toISOString().slice(0, 10), ts: e.startTimestamp, hid: e.homeTeam.id, aid: e.awayTeam.id, local: e.homeTeam.name, visita: e.awayTeam.name,
              gl: g(e.homeScore, "normaltime") ?? g(e.homeScore, "current"), gv: g(e.awayScore, "normaltime") ?? g(e.awayScore, "current"), gl1: g(e.homeScore, "period1"), gv1: g(e.awayScore, "period1") };
            const put = (pre, v) => { fila[pre + "l"] = v ? v[0] : null; fila[pre + "v"] = v ? v[1] : null; };
            put("c", statPer(est, "ALL", "cornerKicks")); put("c1", statPer(est, "1ST", "cornerKicks"));
            put("r", statPer(est, "ALL", "shotsOnGoal")); put("t", statPer(est, "ALL", "totalShotsOnGoal")); put("x", statPer(est, "ALL", "expectedGoals"));
            put("tj", statPer(est, "ALL", "yellowCards"));
            await etx("stats", "readwrite", (s2) => s2.put(fila));
            window.__estad.nuevos++;
          }
          await etx("hechos", "readwrite", (s2) => s2.put(1, clave));
        }
      }
      window.__estad.n = (await eall("stats")).length;
      window.__estad.listo = true; window.__estad.paso = "listo · " + window.__estad.n + " partidos guardados (" + window.__estad.nuevos + " nuevos)";
    })().catch((e) => { window.__estad.listo = true; window.__estad.paso = "ERROR: " + e.message + " (vuelve a pulsar: sigue donde iba)"; });
    return "iniciado";
  };
  window.estadExportar = async function () {
    await edb(); const f = await eall("stats"); if (!f.length) return 0;
    const cols = Object.keys(f[0]); const q = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
    const txt = cols.join(",") + "\n" + f.map((r) => cols.map((c) => q(r[c])).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" })); a.download = "estadisticas-partidos-" + new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }) + ".csv"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return f.length;
  };


  // ---------- MODELO DE CÓRNERS Y REMATES A PUERTA (v1.2) ----------
  // Prueba con 2,958 partidos fuera de muestra (12 ligas): mitad modelo entrenado (ataque/defensa por equipo, como el de goles) + mitad últimos 5
  // (local de local / visitante de visita) le gana a los últimos 5 solos; el total se encoge hacia el promedio de la liga: total = prom^0.6 × total^0.4.
  // Probabilidades de cada línea con binomial negativa (córners k = 15, remates k = 40) porque varían más que un Poisson.
  const LIGA_ID = Object.fromEntries(LIGAS.map(([i, n]) => [i, n]));
  const KNB = { c: 15, r: 40, c1: 200 }, SHR = 0.4; // c1 = córners del 1er tiempo (casi Poisson; prueba con 2,958 partidos: Brier .2431 → .2303)
  const lgam = (x) => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let ser = 1.000000000190015; for (const v of c) ser += v / ++y; return -t + Math.log(2.5066282746310005 * ser / x); };
  const nbPmf = (n, mu, k) => Math.exp(lgam(n + k) - lgam(k) - lgam(n + 1) + k * Math.log(k / (k + mu)) + n * Math.log(mu / (k + mu)));
  const nbMas = (linea, mu, k) => { let s = 0; for (let n = 0; n <= Math.floor(linea); n++) s += nbPmf(n, mu, k); return 1 - s; };
  let CR = null; // { fecha, ligas: { nombre: { c: rat, r: rat, mt: {c, r} } } }
  async function entrenarCR() {
    await edb(); const filas = await eall("stats"); if (!filas.length) return null;
    if (!window.valRatings || !window.valRatings.ajustar) return null;
    const ahora = Date.now(), R = { v: 4, fecha: new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }), n: filas.length, ligas: {} };
    for (const [, nom] of LIGAS) {
      const F = filas.filter((f) => f.liga === nom && f.cl != null && f.rl != null);
      if (F.length < 150) continue;
      const L = { mt: {} };
      const FX = F.filter((f) => f.xl != null && f.xv != null);
      if (FX.length >= 150) { L.x = window.valRatings.ajustar(FX.map((f) => ({ l: f.local, v: f.visita, gl: f.xl, gv: f.xv, t: f.ts * 1000 })), ahora, 0.0015, 1); const u = F.filter((f) => ahora - f.ts * 1000 < 365 * 864e5); L.mt.g = u.reduce((x, f) => x + f.gl + f.gv, 0) / Math.max(u.length, 1); }
      for (const [k, a, b] of [["c", "cl", "cv"], ["r", "rl", "rv"], ["c1", "c1l", "c1v"], ["t", "tl", "tv"]]) {
        const G = F.filter((f) => f[a] != null && f[b] != null); if (G.length < 150) continue;
        L[k] = window.valRatings.ajustar(G.map((f) => ({ l: f.local, v: f.visita, gl: f[a], gv: f[b], t: f.ts * 1000 })), ahora, 0.0015, 1);
        const u = G.filter((f) => ahora - f.ts * 1000 < 365 * 864e5); L.mt[k] = u.reduce((x, f) => x + f[a] + f[b], 0) / Math.max(u.length, 1);
      }
      R.ligas[nom] = L;
    }
    try { localStorage.setItem("valExtras.cr", JSON.stringify(R)); } catch (e) {}
    CR = R; return R;
  }
  const getCR = () => { if (CR) return CR; try { CR = JSON.parse(localStorage.getItem("valExtras.cr") || "null"); } catch (e) {} return CR; };
  const ratEq = (rat, nombre) => { const t = rat.t; if (t[nombre]) return t[nombre]; const n = norm(nombre); for (const k in t) if (norm(k) === n) return t[k]; for (const k in t) if (igual(k, nombre)) return t[k]; return null; };
  window.cornParte = parte("__corn");
  window.cornIniciar = function (eids) {
    window.__corn = { listo: false, texto: "" }; window.__cornDatos = {};
    (async () => {
      await edb(); let R = getCR();
      const filas = await eall("stats");
      if (!R || R.n !== filas.length || R.v !== 4) R = await entrenarCR();
      if (!R) { window.__corn = { listo: true, texto: "Sin estadísticas guardadas: usar \"Descargar estadísticas\" en la pestaña 📈 Mercado" }; return; }
      const ultTs = Math.max(...filas.map((f) => f.ts));
      const secs = [];
      for (const eid of [].concat(eids).slice(0, 20)) {
        const d = await sf("event/" + eid); if (!d) { secs.push("## " + eid + "\n- No se pudo leer\n"); continue; }
        const ev = d.event, ut = ((ev.tournament || {}).uniqueTournament || {}).id, nom = LIGA_ID[ut], H = ev.homeTeam.name, A = ev.awayTeam.name;
        const tit = "## " + limpia(H + " vs " + A) + " [id " + eid + "]";
        const L = nom && R.ligas[nom];
        if (!L) { secs.push(tit + "\n- Modelo de córners y remates: s/d (copa o liga sin datos) → reglas anteriores\n"); continue; }
        const out = [tit + " · " + nom + " · estadísticas al " + new Date(ultTs * 1000).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })];
        const res = {};
        for (const [k, a, b, nm, lt, le] of [["c", "cl", "cv", "Córners", [7.5, 8.5, 9.5, 10.5, 11.5, 12.5], [2.5, 3.5, 4.5, 5.5, 6.5]], ["c1", "c1l", "c1v", "Córners 1er tiempo", [3.5, 4.5, 5.5], [1.5, 2.5]], ["r", "rl", "rv", "Remates a puerta", [6.5, 7.5, 8.5, 9.5, 10.5], [2.5, 3.5, 4.5, 5.5]]]) {
          const rat = L[k]; if (!rat) { out.push("- " + nm + ": s/d"); continue; } const h = ratEq(rat, H), v = ratEq(rat, A);
          const loc = filas.filter((f) => f.liga === nom && f.local === H).sort((x, y) => y.ts - x.ts).slice(0, 5);
          const vis = filas.filter((f) => f.liga === nom && f.visita === A).sort((x, y) => y.ts - x.ts).slice(0, 5);
          if (!h || !v || loc.length < 3 || vis.length < 3) { out.push("- " + nm + ": s/d (equipo sin suficientes partidos)"); continue; }
          const mL = Math.exp(rat.mu + rat.home + h[0] + v[1]), mV = Math.exp(rat.mu + v[0] + h[1]);
          const prom = (arr, c) => arr.reduce((x, f) => x + f[c], 0) / arr.length;
          const bL = (prom(loc, a) + prom(vis, a)) / 2, bV = (prom(loc, b) + prom(vis, b)) / 2;
          let eL = (mL + bL) / 2, eV = (mV + bV) / 2; const T = eL + eV, T2 = Math.pow(L.mt[k], 1 - SHR) * Math.pow(T, SHR); eL *= T2 / T; eV *= T2 / T;
          const K = KNB[k], pct = (x) => Math.round(100 * x);
          res[k] = { local: eL, visita: eV, total: T2 };
          out.push("- " + nm + " esperados: " + limpia(ev.homeTeam.shortName || H) + " " + eL.toFixed(1) + " · " + limpia(ev.awayTeam.shortName || A) + " " + eV.toFixed(1) + " → total " + T2.toFixed(1) + " (la liga promedia " + L.mt[k].toFixed(1) + ")");
          out.push("  - Total Más de: " + lt.map((x) => x + " " + pct(nbMas(x, T2, K)) + " %").join(" · "));
          out.push("  - " + limpia(ev.homeTeam.shortName || H) + " Más de: " + le.map((x) => x + " " + pct(nbMas(x, eL, K)) + " %").join(" · ") + " | " + limpia(ev.awayTeam.shortName || A) + " Más de: " + le.map((x) => x + " " + pct(nbMas(x, eV, K)) + " %").join(" · "));
        }
        window.__cornDatos[eid] = res;
        secs.push(out.join("\n") + "\n");
      }
      window.__corn = { listo: true, texto: "# Modelo de córners y remates a puerta (Menos de = 100 − Más de)\nMitad modelo entrenado por equipo + mitad últimos 5 de local/visita, encogido hacia el promedio de la liga.\n\n" + secs.join("\n") };
    })().catch((e) => { window.__corn = { listo: true, texto: "ERROR: " + e.message }; });
    return "iniciado";
  };


  // ---------- GOLES ESPERADOS CON xG (v1.3) ----------
  // Prueba con 2,914 partidos fuera de muestra: goles esperados = raíz(modelo entrenado de goles × modelo de xG) (los dos sin corregir) y después la
  // corrección de totales de siempre (raíz(total × promedio de la liga) × 1.025). 1X2: 1.0008 → 0.9946 y 1.0145 → 1.0099 en las dos mitades; mejor en 10 de 12 ligas.
  window.xgParte = parte("__xg");
  window.xgIniciar = function (eids) {
    window.__xg = { listo: false, texto: "" }; window.__xgDatos = {};
    (async () => {
      await edb(); let R = getCR(); const filas = await eall("stats");
      if (!R || R.n !== filas.length || R.v !== 4) R = await entrenarCR();
      const RG = window.valRatings && window.valRatings.get && window.valRatings.get();
      const secs = [];
      for (const eid of [].concat(eids).slice(0, 20)) {
        const d = await sf("event/" + eid); if (!d) { secs.push("## " + eid + "\n- No se pudo leer\n"); continue; }
        const ev = d.event, ut = ((ev.tournament || {}).uniqueTournament || {}).id, nom = LIGA_ID[ut], H = ev.homeTeam.name, A = ev.awayTeam.name;
        const tit = "## " + limpia(H + " vs " + A) + " [id " + eid + "]";
        const LX = R && nom && R.ligas[nom], G = RG && nom && RG.ligas && RG.ligas[nom];
        if (!LX || !LX.x || !G) { secs.push(tit + "\n- Modelo entrenado + xG: s/d (copa, liga sin datos o falta \"Descargar estadísticas\") → usar la línea \"Modelo entrenado\"\n"); continue; }
        const gh = ratEq(G, H), ga = ratEq(G, A), xh = ratEq(LX.x, H), xa = ratEq(LX.x, A);
        if (!gh || !ga || !xh || !xa) { secs.push(tit + "\n- Modelo entrenado + xG: s/d (equipo sin datos) → usar la línea \"Modelo entrenado\"\n"); continue; }
        const gL = Math.exp(G.mu + G.home + gh[0] + ga[1]), gV = Math.exp(G.mu + ga[0] + gh[1]);
        const X = LX.x, xL = Math.exp(X.mu + X.home + xh[0] + xa[1]), xV = Math.exp(X.mu + xa[0] + xh[1]);
        let lL = Math.sqrt(gL * xL), lV = Math.sqrt(gV * xV); const T = lL + lV, mt = G.mt || LX.mt.g || T;
        const f = Math.sqrt(mt / T) * Math.exp(0.025); lL *= f; lV *= f;
        window.__xgDatos[eid] = { lL, lV };
        secs.push(tit + "\n- Modelo entrenado + xG (" + nom + "): goles esperados " + limpia(ev.homeTeam.shortName || H) + " " + lL.toFixed(2) + " · " + limpia(ev.awayTeam.shortName || A) + " " + lV.toFixed(2) + " → total " + (lL + lV).toFixed(2) + " (solo goles: " + (gL * Math.sqrt(mt / (gL + gV)) * Math.exp(0.025)).toFixed(2) + " · " + (gV * Math.sqrt(mt / (gL + gV)) * Math.exp(0.025)).toFixed(2) + "; solo xG: " + xL.toFixed(2) + " · " + xV.toFixed(2) + ")\n");
      }
      window.__xg = { listo: true, texto: "# Goles esperados: modelo entrenado mezclado con xG\n\n" + secs.join("\n") };
    })().catch((e) => { window.__xg = { listo: true, texto: "ERROR: " + e.message }; });
    return "iniciado";
  };


  // ---------- MOTOR COMÚN (v1.4): esperados de un partido con todos los modelos ----------
  const espCR = (L, filas, nom, H, A, k, a, b) => {
    const rat = L && L[k]; if (!rat) return null; const h = ratEq(rat, H), v = ratEq(rat, A);
    const loc = filas.filter((f) => f.liga === nom && f.local === H && f[a] != null).sort((x, y) => y.ts - x.ts).slice(0, 5);
    const vis = filas.filter((f) => f.liga === nom && f.visita === A && f[b] != null).sort((x, y) => y.ts - x.ts).slice(0, 5);
    if (!h || !v || loc.length < 3 || vis.length < 3) return null;
    const prom = (arr, c) => arr.reduce((x, f) => x + f[c], 0) / arr.length;
    let eL = (Math.exp(rat.mu + rat.home + h[0] + v[1]) + (prom(loc, a) + prom(vis, a)) / 2) / 2, eV = (Math.exp(rat.mu + v[0] + h[1]) + (prom(loc, b) + prom(vis, b)) / 2) / 2;
    const T = eL + eV, T2 = Math.pow(L.mt[k], 1 - SHR) * Math.pow(T, SHR); return { local: eL * T2 / T, visita: eV * T2 / T, total: T2 };
  };
  // v1.13: córners en Champions/Europa/Conference con los datos de liga de cada equipo (los dos deben ser de las 12 ligas). En prueba.
  const ligaDe = (filas, nm) => { let b = null; for (const f of filas) if ((f.local === nm || f.visita === nm) && (!b || f.ts > b.ts)) b = f; return b && b.liga; };
  const espCRCopa = (R, filas, H, A, k, a, b) => {
    const nH = ligaDe(filas, H), nA = ligaDe(filas, A); if (!nH || !nA) return null;
    const LH = R.ligas[nH], LA = R.ligas[nA], rH = LH && LH[k], rA = LA && LA[k]; if (!rH || !rA) return null;
    const h = ratEq(rH, H), v = ratEq(rA, A); if (!h || !v) return null;
    const ult = (nm, liga) => filas.filter((f) => f.liga === liga && (f.local === nm || f.visita === nm) && f[a] != null && f[b] != null).sort((x, y) => y.ts - x.ts).slice(0, 5);
    const hf = ult(H, nH), af = ult(A, nA); if (hf.length < 3 || af.length < 3) return null;
    const hecho = (arr, nm) => arr.reduce((x, f) => x + (f.local === nm ? f[a] : f[b]), 0) / arr.length, recib = (arr, nm) => arr.reduce((x, f) => x + (f.local === nm ? f[b] : f[a]), 0) / arr.length;
    const mu = (rH.mu + rA.mu) / 2, hm = (rH.home + rA.home) / 2;
    const eL = (Math.exp(mu + hm + h[0] + v[1]) + (hecho(hf, H) + recib(af, A)) / 2) / 2, eV = (Math.exp(mu + v[0] + h[1]) + (hecho(af, A) + recib(hf, H)) / 2) / 2;
    const mt = (LH.mt[k] + LA.mt[k]) / 2, T = eL + eV, T2 = Math.pow(mt, 1 - SHR) * Math.pow(T, SHR); return { local: eL * T2 / T, visita: eV * T2 / T, total: T2 };
  };
  const golesEsp = (ev, R) => {
    const ut = ((ev.tournament || {}).uniqueTournament || {}).id, nom = LIGA_ID[ut], H = ev.homeTeam.name, A = ev.awayTeam.name;
    if (window.valFemLigas && FEM_UT[ut]) { const g = window.valFemLigas.lambdas(ev); return g ? { lL: g.lL, lV: g.lV, rho: g.rho, fuente: "modelo femenil (" + g.liga + ")" } : null; }
    if (ev.homeTeam.national && ev.awayTeam.national) { const g = window.valSel && selDe(ev).lambdas(ev); return g ? { lL: g.lL, lV: g.lV, rho: g.rho, fuente: "modelo selecciones" + (esFem(ev) ? " femenil" : "") + (g.neutral ? ", cancha neutral" : "") + (g.alto ? ", altura" : "") } : null; }
    if (window.valCopa && window.valCopa.ids && window.valCopa.ids[ut]) { const r = window.valCopa.lambdas(ev.homeTeam.id, ev.awayTeam.id, ut); return r ? { lL: r.lL, lV: r.lV, fuente: "modelo copa" } : null; }
    const RG = window.valRatings && window.valRatings.get && window.valRatings.get(), G = RG && nom && RG.ligas && RG.ligas[nom], LX = R && nom && R.ligas[nom];
    if (G) { const gh = ratEq(G, H), ga = ratEq(G, A);
      if (gh && ga) { let lL = Math.exp(G.mu + G.home + gh[0] + ga[1]), lV = Math.exp(G.mu + ga[0] + gh[1]), fuente = "modelo entrenado";
        const xh = LX && LX.x && ratEq(LX.x, H), xa = LX && LX.x && ratEq(LX.x, A);
        if (xh && xa) { lL = Math.sqrt(lL * Math.exp(LX.x.mu + LX.x.home + xh[0] + xa[1])); lV = Math.sqrt(lV * Math.exp(LX.x.mu + xa[0] + xh[1])); fuente = "modelo entrenado + xG"; }
        const f = Math.sqrt((G.mt || lL + lV) / (lL + lV)) * Math.exp(0.025); return { lL: lL * f, lV: lV * f, fuente }; } }
    return null;
  };
  // ---------- MODELO DE SELECCIONES (v1.6): ratings de ataque y defensa por selección ----------
  // Datos: resultados internacionales desde 2012 (github martj42/international_results, se baja en el navegador).
  // Poisson con peso por fecha (xi 0.0005), amistosos peso 1, ridge 0.3, localía solo si no es cancha neutral; totales encogidos (exponente 0.75).
  // Prueba fuera de muestra 2022-2026 (4,637 partidos): 1X2 0.978 (modelo de promedios) → 0.858.
  const SEL_ALIAS = { "turkiye": "turkey", "czechia": "czech republic", "usa": "united states", "korea republic": "south korea", "korea dpr": "north korea", "ir iran": "iran",
    "cote d ivoire": "ivory coast", "cote divoire": "ivory coast", "bosnia and herzegovina": "bosnia and herzegovina", "chinese taipei": "taiwan", "cabo verde": "cape verde",
    "st kitts and nevis": "saint kitts and nevis", "st lucia": "saint lucia", "st vincent and the grenadines": "saint vincent and the grenadines", "st vincent grenadines": "saint vincent and the grenadines",
    "congo dr": "dr congo", "the gambia": "gambia", "kyrgyz republic": "kyrgyzstan", "swaziland": "eswatini", "macedonia": "north macedonia", "fyr macedonia": "north macedonia", "ireland": "republic of ireland",
    "brunei darussalam": "brunei", "timor leste": "east timor", "us virgin islands": "united states virgin islands", "china pr": "china", "united states of america": "united states" };
  const SEL_ALTURA = new Set(["la paz", "el alto", "cochabamba", "sucre", "oruro", "potosi", "quito", "cuenca", "ambato", "bogota", "mexico city", "ciudad de mexico", "mexico", "toluca", "guatemala", "guatemala city", "ciudad de guatemala",
    "addis ababa", "addis abeba", "nairobi", "kigali", "tehran", "teheran", "asmara", "johannesburg", "kabul", "sanaa", "sana a"]);
  const selNorm = (x) => { const n = norm(String(x).replace(/&/g, " and ")).replace(/\s+/g, " ").trim(); return SEL_ALIAS[n] || n; };
  const crearSel = (URL, KEY, XI, RHO, ETQ) => ({ rho: RHO, etq: ETQ,
    get: () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } },
    eq: function (nombre) { const S = this.get(); return S ? S.t[selNorm(nombre)] || null : null; },
    entrenar: function (texto, hoy = Date.now()) {
      const M = [], idx = {}, nom = []; let ult = "";
      const id = (x) => { const k = selNorm(x); if (!(k in idx)) { idx[k] = nom.length; nom.push(k); } return idx[k]; };
      for (const ln of texto.split("\n").slice(1)) { const c = ln.match(/("[^"]*"|[^,]*)(,|$)/g); if (!c || c.length < 9) continue; const v = c.map((x) => x.replace(/,$/, "").replace(/^"|"$/g, ""));
        if (v[0] < "2012-01-01" || Date.parse(v[0]) > hoy || v[3] === "NA" || v[3] === "" || /CONIFA|Island Games|Muratti|Inter Games/.test(v[5])) continue;
        M.push([id(v[1]), id(v[2]), +v[3], +v[4], Math.exp(-XI * (hoy - Date.parse(v[0])) / 864e5), /TRUE/i.test(v[8]) ? 0 : 1, v[0]]); if (v[0] > ult) ult = v[0]; }
      const n = nom.length, at = new Float64Array(n), de = new Float64Array(n), RG = 0.3; let mu = 0.2, home = 0.25;
      for (let it = 0; it < 160; it++) { // un paso de Newton por bloque: nivel, localía, ataques, defensas
        const ga = new Float64Array(n), ha = new Float64Array(n), gd = new Float64Array(n), hd = new Float64Array(n); let gm = 0, hmu = 0, gh = 0, hh = 0;
        for (const [h, a, x, y, w, hm] of M) { const lh = Math.exp(mu + home * hm + at[h] + de[a]), la = Math.exp(mu + at[a] + de[h]);
          gm += w * (x - lh + y - la); hmu += w * (lh + la); gh += w * hm * (x - lh); hh += w * hm * lh;
          ga[h] += w * (x - lh); ha[h] += w * lh; ga[a] += w * (y - la); ha[a] += w * la; gd[a] += w * (x - lh); hd[a] += w * lh; gd[h] += w * (y - la); hd[h] += w * la; }
        const k = it % 4; if (k === 0) mu += gm / hmu; else if (k === 1) home += gh / hh;
        else if (k === 2) for (let i = 0; i < n; i++) at[i] += (ga[i] - 2 * RG * at[i]) / (ha[i] + 2 * RG);
        else for (let i = 0; i < n; i++) de[i] += (gd[i] - 2 * RG * de[i]) / (hd[i] + 2 * RG); }
      let sw = 0, st = 0; for (const [, , x, y, , , f] of M) if (hoy - Date.parse(f) < 365 * 864e5) { sw++; st += x + y; }
      const cnt = new Array(n).fill(0); for (const [h, a] of M) { cnt[h]++; cnt[a]++; }
      const t = {}; for (let i = 0; i < n; i++) t[nom[i]] = [+at[i].toFixed(4), +de[i].toFixed(4), cnt[i]];
      return { fecha: new Date(hoy).toISOString().slice(0, 10), datosHasta: ult, partidos: M.length, mu, home, mt: st / sw, t };
    },
    actualizar: function () {
      window.__sel = { listo: false, paso: "bajando resultados internacionales (" + ETQ + ")…" };
      (async () => {
        const r = await fetch(URL); if (!r.ok) throw new Error("no se pudo bajar el archivo (" + r.status + ")");
        let txt = await r.text();
        // Complemento (v1.8): partidos de selecciones que la base todavía no trae, desde Sofascore, día por día (marcador a 90').
        const hasta = txt.split("\n").reduce((m, l) => (l.slice(0, 10) > m && /^\d{4}-/.test(l) ? l.slice(0, 10) : m), "");
        const extra = []; const fem = ETQ === "femenil";
        for (let t = Date.parse(hasta) + 864e5; t < Date.now() - 864e5; t += 864e5) {
          const dia = new Date(t).toISOString().slice(0, 10); window.__sel.paso = "completando con Sofascore " + dia + "…";
          // el listado general por día da 403; por categoría internacional sí (Europa, África, Asia, Mundo, Norte y Centroamérica, Sudamérica, Oceanía)
          const evs = []; for (const c of [1465, 1466, 1467, 1468, 1469, 1470, 1471]) { const e = await sf("category/" + c + "/scheduled-events/" + dia); evs.push(...((e && e.events) || [])); }
          for (const ev of evs) { if (!ev.homeTeam.national || !ev.awayTeam.national || (ev.status || {}).type !== "finished") continue;
            if ((ev.homeTeam.gender === "F") !== fem) continue; const h = ev.homeScore || {}, a = ev.awayScore || {}, x = h.normaltime ?? h.current, y = a.normaltime ?? a.current; if (x == null || y == null) continue;
            const fecha = new Date(ev.startTimestamp * 1000).toISOString().slice(0, 10); if (fecha <= hasta) continue;
            extra.push([fecha, '"' + ev.homeTeam.name + '"', '"' + ev.awayTeam.name + '"', x, y, '"' + limpia((ev.tournament || {}).name || "Sofascore") + '"', "", "", "FALSE"].join(",")); } }
        if (extra.length) txt += "\n" + [...new Set(extra)].join("\n");
        window.__sel.paso = "entrenando (" + extra.length + " partidos recientes de Sofascore)…"; await espera(50);
        const S = this.entrenar(txt); localStorage.setItem(KEY, JSON.stringify(S));
        window.__sel = { listo: true, paso: ETQ + " listo: " + Object.keys(S.t).length + " selecciones, " + S.partidos + " partidos (resultados hasta " + S.datosHasta + ")" };
      })().catch((e) => { window.__sel = { listo: true, paso: "ERROR: " + e.message }; });
      return "iniciado";
    },
    // goles esperados con corrección de totales, o null
    lambdas: function (ev, S = this.get()) {
      if (!S) return null; const H = S.t[selNorm(ev.homeTeam.name)], A = S.t[selNorm(ev.awayTeam.name)]; if (!H || !A) return null;
      const pc = (o) => norm(((o || {}).country || {}).name || ""), venue = pc(ev.venue), neutral = ev.neutralGround === true || !!(venue && pc(ev.homeTeam) && venue !== pc(ev.homeTeam));
      const lL = Math.exp(S.mu + (neutral ? 0 : S.home) + H[0] + A[1]), lV = Math.exp(S.mu + A[0] + H[1]), T = lL + lV, T2 = Math.pow(T, 0.75) * Math.pow(S.mt, 0.25);
      // Altura (v1.6.1): local en ciudad alta y no neutral → local ×1.22, visitante ×0.69 (estimado 2016-2021 con 151 partidos; prueba 2022-2026, 89 partidos: 1X2 .912 → .905)
      const ciudad = norm(((ev.venue || {}).city || {}).name || ""), alto = !neutral && SEL_ALTURA.has(ciudad);
      return { lL: lL * T2 / T * (alto ? 1.22 : 1), lV: lV * T2 / T * (alto ? 0.69 : 1), rho: RHO, neutral, alto, nL: H[2], nV: A[2], fecha: S.fecha, hasta: S.datosHasta };
    },
  });
  // Varonil: xi 0.0005, rho −0.08. Femenil (v1.7): base martj42/womens-international-results, xi 0.0008, rho +0.05 (en femenil hay menos empates);
  // prueba 2022-2026 (3,098 partidos): 1X2 0.950 (promedios) → 0.753.
  window.valSel = crearSel("https://raw.githubusercontent.com/martj42/international_results/master/results.csv", "valExtras.sel", 0.0005, -0.08, "varonil");
  window.valSelF = crearSel("https://raw.githubusercontent.com/martj42/womens-international-results/master/results.csv", "valExtras.selF", 0.0008, 0.05, "femenil");
  const esFem = (ev) => ev.homeTeam.gender === "F" || ev.awayTeam.gender === "F" || /\bwomen\b|\(w\)|femenil|feminin/i.test((ev.tournament || {}).name || "");
  const selDe = (ev) => (esFem(ev) ? window.valSelF : window.valSel);
  // ---------- LIGAS FEMENILES (v1.8): ratings por equipo con el histórico de Sofascore ----------
  // Liga MX Femenil, NWSL, WSL, Liga F, Frauen-Bundesliga, Première Ligue, Serie A Women y Champions femenil, 3-4 temporadas (~4,200 partidos).
  // Mismo método que las ligas varoniles (xi 0.0015, ridge 1, nivel y localía por liga, totales raíz(T × liga) × e^0.025), rho +0.05.
  // Prueba 2025-2026 (2,676 partidos, re-entrenando cada 30 días): 1X2 0.930 (promedios) → 0.878; mejor en las 8; Más de 2.5 .247 → .237.
  const FEM_UT = { 13593: "Liga MX Femenil", 13592: "Liga MX Femenil", 1690: "NWSL", 1044: "WSL", 1127: "Liga F", 232: "Frauen-Bundesliga", 1139: "Premiere Ligue", 10640: "Serie A Women", 696: "Champions femenil" };
  window.valFemLigas = {
    get: () => { try { return JSON.parse(localStorage.getItem("valExtras.femLigas") || "null"); } catch (e) { return null; } },
    actualizar: function () {
      window.__femL = { listo: false, paso: "bajando ligas femeniles…" };
      (async () => {
        const M = [], hoy = Date.now(), vistos = new Set();
        const NT = { 13593: 4, 13592: 4 };
        for (const [ut, lg] of Object.entries(FEM_UT)) { const s0 = await sf("unique-tournament/" + ut + "/seasons");
          for (const se of ((s0 && s0.seasons) || []).slice(0, NT[ut] || 3)) for (let pg = 0; pg < 20; pg++) {
            const e = await sf("unique-tournament/" + ut + "/season/" + se.id + "/events/last/" + pg); if (!e) break;
            for (const ev of e.events || []) { if ((ev.status || {}).type !== "finished" || vistos.has(ev.id)) continue; vistos.add(ev.id); const h = ev.homeScore || {}, a = ev.awayScore || {};
              const x = h.normaltime ?? h.current, y = a.normaltime ?? a.current; if (x == null || y == null) continue; M.push({ lg, t: ev.startTimestamp * 1000, h: ev.homeTeam.id, a: ev.awayTeam.id, x, y }); }
            window.__femL.paso = lg + " · " + M.length + " partidos"; if (!e.hasNextPage) break; } }
        window.__femL.paso = "entrenando con " + M.length + " partidos…"; await espera(50);
        const LGS = [...new Set(M.map((m) => m.lg))], mu = {}, hm = {}, at = {}, de = {}, xi = 0.0015, RG = 1; for (const g of LGS) { mu[g] = 0.25; hm[g] = 0.15; }
        for (let it = 0; it < 100; it++) { const k = it % 4, G = {}, H = {};
          for (const m of M) { const w = Math.exp(-xi * (hoy - m.t) / 864e5), lh = Math.exp(mu[m.lg] + hm[m.lg] + (at[m.h] || 0) + (de[m.a] || 0)), la = Math.exp(mu[m.lg] + (at[m.a] || 0) + (de[m.h] || 0));
            if (k === 0) { G[m.lg] = (G[m.lg] || 0) + w * (m.x - lh + m.y - la); H[m.lg] = (H[m.lg] || 0) + w * (lh + la); }
            else if (k === 1) { G[m.lg] = (G[m.lg] || 0) + w * (m.x - lh); H[m.lg] = (H[m.lg] || 0) + w * lh; }
            else if (k === 2) { G[m.h] = (G[m.h] || 0) + w * (m.x - lh); H[m.h] = (H[m.h] || 0) + w * lh; G[m.a] = (G[m.a] || 0) + w * (m.y - la); H[m.a] = (H[m.a] || 0) + w * la; }
            else { G[m.a] = (G[m.a] || 0) + w * (m.x - lh); H[m.a] = (H[m.a] || 0) + w * lh; G[m.h] = (G[m.h] || 0) + w * (m.y - la); H[m.h] = (H[m.h] || 0) + w * la; } }
          if (k === 0) for (const g in G) mu[g] += G[g] / H[g]; else if (k === 1) for (const g in G) hm[g] += G[g] / H[g];
          else if (k === 2) for (const i in G) at[i] = (at[i] || 0) + (G[i] - 2 * RG * (at[i] || 0)) / (H[i] + 2 * RG);
          else for (const i in G) de[i] = (de[i] || 0) + (G[i] - 2 * RG * (de[i] || 0)) / (H[i] + 2 * RG); }
        const mt = {}; for (const m of M) if (hoy - m.t < 365 * 864e5) { mt[m.lg] = mt[m.lg] || [0, 0]; mt[m.lg][0] += m.x + m.y; mt[m.lg][1]++; }
        const r4 = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +v.toFixed(4)]));
        localStorage.setItem("valExtras.femLigas", JSON.stringify({ fecha: new Date().toISOString().slice(0, 10), partidos: M.length, mu, hm, mt: Object.fromEntries(Object.entries(mt).map(([k, v]) => [k, v[0] / v[1]])), at: r4(at), de: r4(de) }));
        window.__femL = { listo: true, paso: "listo: " + M.length + " partidos de " + LGS.length + " ligas femeniles" };
      })().catch((e) => { window.__femL = { listo: true, paso: "ERROR: " + e.message }; });
      return "iniciado";
    },
    lambdas: function (ev) {
      const S = this.get(), ut = ((ev.tournament || {}).uniqueTournament || {}).id, lg = FEM_UT[ut]; if (!S || !lg || S.mu[lg] == null) return null;
      const h = ev.homeTeam.id, a = ev.awayTeam.id; if (S.at[h] == null || S.at[a] == null) return null;
      const lL = Math.exp(S.mu[lg] + S.hm[lg] + S.at[h] + S.de[a]), lV = Math.exp(S.mu[lg] + S.at[a] + S.de[h]), T = lL + lV, T2 = Math.sqrt(T * (S.mt[lg] || T)) * Math.exp(0.025);
      return { lL: lL * T2 / T, lV: lV * T2 / T, rho: 0.05, liga: lg, fecha: S.fecha };
    },
  };
  window.selParte = parte("__selp");
  window.selIniciar = function (eids) {
    window.__selp = { listo: false, texto: "" };
    (async () => {
      const out = [];
      if (!window.valSel.get() && !window.valSelF.get() && !window.valFemLigas.get()) { window.__selp = { listo: true, texto: "Sin ratings de selecciones: pulsar \"Actualizar modelo de selecciones\" en 📈 Mercado (o valSel.actualizar())." }; return; }
      for (const eid of [].concat(eids).slice(0, 20)) { const d0 = await sf("event/" + eid); if (!d0) { out.push("## " + eid + "\n- No se pudo leer"); continue; } const ev = d0.event;
        const tit = "## " + limpia(ev.homeTeam.name + " vs " + ev.awayTeam.name) + " [id " + eid + "]";
        const utE = ((ev.tournament || {}).uniqueTournament || {}).id;
        if (FEM_UT[utE]) { const g = window.valFemLigas.lambdas(ev); out.push(tit + "\n- " + (g ? "Modelo femenil (" + g.liga + "; usar modelo_lam(x, y, rho=0.05)): goles esperados " + g.lL.toFixed(2) + " · " + g.lV.toFixed(2) + " (ratings del " + g.fecha + ")" : "Modelo femenil: s/d (" + (window.valFemLigas.get() ? "equipo sin datos" : "sin ratings: correr valFemLigas.actualizar()") + ")")); continue; }
        const MS = selDe(ev); if (!MS.get()) { out.push(tit + "\n- Modelo selecciones (" + MS.etq + "): sin ratings, correr " + (MS === window.valSelF ? "valSelF" : "valSel") + ".actualizar()"); continue; }
        const g = MS.lambdas(ev); if (!g) { out.push(tit + "\n- Modelo selecciones (" + MS.etq + "): s/d (sin ratings de " + [ev.homeTeam.name, ev.awayTeam.name].filter((x) => !MS.eq(x)).map(limpia).join(" y ") + ")"); continue; }
        out.push(tit + "\n- Modelo selecciones (" + MS.etq + (MS.rho > 0 ? "; usar modelo_lam(x, y, rho=0.05)" : "") + "): goles esperados " + g.lL.toFixed(2) + " · " + g.lV.toFixed(2) + " (cancha neutral: " + (g.neutral ? "sí" : "no") + (g.alto ? "; local en altura: ya ajustado" : "") + "; " + g.nL + " y " + g.nV + " partidos en los datos desde 2012; ratings del " + g.fecha + ", resultados hasta " + g.hasta + ")"); }
      window.__selp = { listo: true, texto: "# Modelo de selecciones\n\n" + out.join("\n") + "\n" };
    })().catch((e) => { window.__selp = { listo: true, texto: "ERROR: " + e.message }; });
    return "iniciado";
  };
  const pmf = (k, l) => Math.exp(-l + k * Math.log(l) - lgam(k + 1));
  const matrizDC = (lL, lV, rho = -0.08) => { const m = []; let s = 0; for (let i = 0; i <= 10; i++) { m.push([]); for (let j = 0; j <= 10; j++) { let v = pmf(i, lL) * pmf(j, lV); if (i === 0 && j === 0) v *= 1 - lL * lV * rho; else if (i === 0 && j === 1) v *= 1 + lL * rho; else if (i === 1 && j === 0) v *= 1 + lV * rho; else if (i === 1 && j === 1) v *= 1 - rho; m[i].push(v); s += v; } } for (const r of m) for (let j = 0; j <= 10; j++) r[j] /= s; return m; };
  const P = (m, f) => { let s = 0; for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) if (f(i, j)) s += m[i][j]; return s; };
  const F1 = { Argentina: .42, "Brasileirão": .45, Bundesliga: .44, Eredivisie: .45, LaLiga: .43, "Liga MX": .45, "Ligue 1": .425, MLS: .455, Portugal: .44, Premier: .43, Saudi: .455, "Serie A": .435 };
  const NOM_ES = {"netherlands": "Países Bajos", "greece": "Grecia", "germany": "Alemania", "spain": "España", "england": "Inglaterra", "france": "Francia", "italy": "Italia", "belgium": "Bélgica", "croatia": "Croacia", "switzerland": "Suiza", "denmark": "Dinamarca", "sweden": "Suecia", "norway": "Noruega", "poland": "Polonia", "czechia": "Chequia", "turkiye": "Turquía", "turkey": "Turquía", "scotland": "Escocia", "wales": "Gales", "republic of ireland": "Irlanda", "ireland": "Irlanda", "northern ireland": "Irlanda del Norte", "hungary": "Hungría", "romania": "Rumania", "ukraine": "Ucrania", "slovakia": "Eslovaquia", "slovenia": "Eslovenia", "finland": "Finlandia", "iceland": "Islandia", "cyprus": "Chipre", "latvia": "Letonia", "lithuania": "Lituania", "kazakhstan": "Kazajistán", "belarus": "Bielorrusia", "luxembourg": "Luxemburgo", "north macedonia": "Macedonia del Norte", "bosnia herzegovina": "Bosnia", "bosnia and herzegovina": "Bosnia", "moldova": "Moldavia", "faroe islands": "Islas Feroe", "azerbaijan": "Azerbaiyán", "russia": "Rusia", "brazil": "Brasil", "mexico": "México", "usa": "Estados Unidos", "united states": "Estados Unidos", "canada": "Canadá", "japan": "Japón", "south korea": "Corea del Sur", "korea republic": "Corea del Sur", "morocco": "Marruecos", "egypt": "Egipto", "tunisia": "Túnez", "algeria": "Argelia", "cameroon": "Camerún", "ivory coast": "Costa de Marfil", "cote d ivoire": "Costa de Marfil", "south africa": "Sudáfrica", "saudi arabia": "Arabia Saudita", "iran": "Irán", "ir iran": "Irán", "iraq": "Irak", "jordan": "Jordania", "qatar": "Catar", "united arab emirates": "Emiratos Árabes", "uzbekistan": "Uzbekistán", "new zealand": "Nueva Zelanda", "panama": "Panamá", "curacao": "Curazao", "haiti": "Haití", "trinidad and tobago": "Trinidad y Tobago", "dominican republic": "República Dominicana", "peru": "Perú", "guadeloupe": "Guadalupe", "martinique": "Martinica", "suriname": "Surinam", "bermuda": "Bermudas", "cayman islands": "Islas Caimán", "antigua and barbuda": "Antigua y Barbuda", "st kitts and nevis": "San Cristóbal y Nieves", "belize": "Belice", "grenada": "Granada", "french guiana": "Guayana Francesa", "st lucia": "Santa Lucía", "saint lucia": "Santa Lucía", "north korea": "Corea del Norte", "china pr": "China", "new caledonia": "Nueva Caledonia", "cape verde": "Cabo Verde", "dr congo": "RD Congo", "equatorial guinea": "Guinea Ecuatorial", "sierra leone": "Sierra Leona", "kenya": "Kenia", "ethiopia": "Etiopía", "libya": "Libia", "sudan": "Sudán", "benin": "Benín", "gabon": "Gabón", "lebanon": "Líbano", "syria": "Siria", "bahrain": "Baréin", "oman": "Omán", "kuwait": "Kuwait", "thailand": "Tailandia", "philippines": "Filipinas", "malaysia": "Malasia", "singapore": "Singapur", "vietnam": "Vietnam", "india": "India", "indonesia": "Indonesia", "kyrgyzstan": "Kirguistán", "tajikistan": "Tayikistán", "turkmenistan": "Turkmenistán", "afghanistan": "Afganistán", "palestine": "Palestina"};
  const nomES = (n) => NOM_ES[norm(String(n).replace(/&/g, " and ")).replace(/\s+/g, " ")] || n;
  const igualN = (a, b) => igual(a, b) || igual(a, nomES(b));
  async function pdEvento(ev) {
    if (!LISTA || Date.now() - LISTA_T > 5 * 60000) { LISTA = await pd("GetEvents?eventCount=0&sportId=66&champIds=0"); LISTA_T = Date.now(); }
    if (!LISTA) return null; const t0 = ev.startTimestamp * 1000, sp = (p) => String(p.name).split(/ vs\.? /i);
    const pe = LISTA.events.find((p) => Math.abs(new Date(p.startDate).getTime() - t0) < 3 * 3600000 && igualN(sp(p)[0], ev.homeTeam.name) && igualN(sp(p)[1], ev.awayTeam.name))
      || LISTA.events.find((p) => Math.abs(new Date(p.startDate).getTime() - t0) <= 20 * 60000 && (igualN(sp(p)[0], ev.homeTeam.name) || igualN(sp(p)[1], ev.awayTeam.name)));
    if (!pe) return null; const d = await pd("GetEventDetails?eventId=" + pe.id); await espera(150); return d ? { pe, d } : null;
  }
  // Evalúa TODAS las líneas de Playdoit de un partido. Prob. final = 20 % modelo + 80 % bet365 sin margen (o Playdoit si bet365 no tiene la línea); descarta si difieren 15+ puntos (hándicap: 10).
  // Ajustes activos de la bitácora (los mismos del skill), en probabilidad 0-1; se suman al modelo ANTES de la mezcla.
  const ajusteBit = (nom, fam, txt) => {
    if (fam === "Goles" && txt === "Más de 1.5" && (nom === "Bundesliga" || nom === "Argentina")) return -0.10;
    if (fam === "Goles" && nom === "Bundesliga") return -0.05;
    if ((fam === "Ganador" || fam === "Doble oportunidad" || /^Hándicap/.test(fam)) && nom === "Eredivisie") return -0.05;
    return 0;
  };
  const COPA_UEFA = { 7: 1, 679: 1, 17015: 1 }, COPA_CONMEBOL = { 384: 1, 480: 1 };
  // v1.9: mercado de referencia = bet365 sin margen (de Sofascore) cuando tiene la misma línea; si no, Playdoit sin margen.
  // Prueba 12-nov (6,073 partidos): mezcla 20 % modelo / 80 % mercado; en "quién gana" se descarta desde 10 puntos de diferencia.
  const W_MOD = 0.2;
  const decF = (f) => { const [a, b] = String(f || "").split("/").map(Number); return b ? a / b + 1 : NaN; };
  const potencia = (cs) => { const q = cs.map((c) => 1 / c); if (q.some((x) => !isFinite(x))) return null; let lo = 0.5, hi = 3; for (let i = 0; i < 50; i++) { const k = (lo + hi) / 2; q.reduce((s, x) => s + Math.pow(x, k), 0) > 1 ? (lo = k) : (hi = k); } const k = (lo + hi) / 2; return q.map((x) => Math.pow(x, k)); };
  async function b365(eid) {
    const o = await sf("event/" + eid + "/odds/1/all"); const M = (o && o.markets) || []; const r = { tot: {}, cor: {} };
    const dos = (m, a, b) => { const ca = (m.choices || []).find((c) => c.name === a), cb = (m.choices || []).find((c) => c.name === b); if (!ca || !cb) return null; const x = 1 / decF(ca.fractionalValue), y = 1 / decF(cb.fractionalValue); return isFinite(x + y) ? x / (x + y) : null; };
    for (const m of M) { if (m.isLive) continue;
      if (m.marketId === 1) { const c = ["1", "X", "2"].map((n) => decF(((m.choices || []).find((x) => x.name === n) || {}).fractionalValue)); const p = potencia(c); if (p) r.x12 = p; }
      if (m.marketId === 9 && m.choiceGroup) r.tot[m.choiceGroup] = dos(m, "Over", "Under");
      if (m.marketId === 21 && m.choiceGroup) r.cor[m.choiceGroup] = dos(m, "Over", "Under");
      if (m.marketId === 5) r.btts = dos(m, "Yes", "No"); }
    return r;
  }
  function evaluarLineas(ev, nom, G, CRn, d, B5 = {}) {
    const utE = ((ev.tournament || {}).uniqueTournament || {}).id;
    const O = {}; (d.odds || []).forEach((o) => (O[o.id] = o)); const byT = {}; for (const m of d.markets || []) (byT[m.typeId] = byT[m.typeId] || []).push(m);
    const PCm = d.competitors || [], nomL = (PCm[0] || {}).name || ev.homeTeam.name, nomV = (PCm[1] || {}).name || ev.awayTeam.name; // v1.14.1: nombres como los pone Playdoit (Gales, no Wales)
    const deEq = (s0) => igual(s0, nomL) || igual(s0, ev.homeTeam.name) || igual(s0, nomV) || igual(s0, ev.awayTeam.name);
    const desc = []; // v1.14: líneas descartadas por discrepancia (para la tabla de valAnalizar)
    const m = matrizDC(G.lL, G.lV, G.rho == null ? -0.08 : G.rho), f1 = F1[nom] || 0.44, out = [], Hs = ev.homeTeam.shortName || ev.homeTeam.name, As = ev.awayTeam.shortName || ev.awayTeam.name;
    const ouLines = (t) => { const L = {}; for (const mk of byT[t] || []) for (const i of ids(mk)) { const o = O[i]; if (!o || o.oddStatus !== 0) continue; const x = String(o.name).trim().match(/^(Más|Menos) de ([\d.]+)$/); if (!x || Math.abs(Number(x[2]) % 1 - 0.5) > 0.01) continue; const k = x[2]; L[k] = L[k] || {}; L[k][x[1] === "Más" ? "o" : "u"] = L[k][x[1] === "Más" ? "o" : "u"] || o.price; } return L; };
    const add = (fam, txt, c, pm, cOtro, pmOtro, qx) => {
      if (!c || pm == null) return; pm = Math.min(0.99, Math.max(0.01, pm + ajusteBit(nom, fam, txt))); let q = null, ref = "";
      if (qx != null && isFinite(qx)) { q = qx; ref = "bet365"; } else if (cOtro) { q = (1 / c) / (1 / c + 1 / cOtro); ref = "Playdoit"; }
      if (q != null && Math.abs(pm - q) >= 0.15) { desc.push({ fam, txt, cuota: c, pm: Math.round(pm * 100), pq: Math.round(q * 100) }); return; } const w = COPA_UEFA[utE] || COPA_CONMEBOL[utE] ? 0.3 : W_MOD; const pf = q == null ? pm : w * pm + (1 - w) * q; // copas: goles y ambos anotan 30/70 (sección A)
      out.push({ fam, txt, cuota: c, pm: Math.round(pm * 100), pf: Math.round(pf * 100), pq: q == null ? null : Math.round(q * 100), ev: Math.round((pf * c - 1) * 1000) / 10, ref });
    };
    const fams = [[18, "Goles", (k) => P(m, (i, j) => i + j > k)], [19, "Goles " + Hs, (k) => P(m, (i) => i > k)], [20, "Goles " + As, (k) => P(m, (i, j) => j > k)]];
    for (const [t, fam, fn] of fams) { const L = ouLines(t); for (const k in L) { const pk = fn(Number(k)); const b = t === 18 ? (B5.tot || {})[k] : null; add(fam, "Más de " + k, L[k].o, pk, L[k].u, 1 - pk, b); add(fam, "Menos de " + k, L[k].u, 1 - pk, L[k].o, pk, b == null ? null : 1 - b); } }
    // ambos anotan
    let bS = null, bN = null; for (const mk of byT[29] || []) for (const i of ids(mk)) { const o = O[i]; if (o && o.oddStatus === 0) { if (o.typeId === 74) bS = o.price; if (o.typeId === 76) bN = o.price; } }
    const pb = P(m, (i, j) => i > 0 && j > 0); add("Ambos anotan", "Sí", bS, pb, bN, 1 - pb, B5.btts); add("Ambos anotan", "No", bN, 1 - pb, bS, pb, B5.btts == null ? null : 1 - B5.btts);
    // ganador, doble oportunidad y Empate No Acción (v1.11): bet365 con método de potencia; discrepancia 10 puntos
    if (!COPA_CONMEBOL[utE]) {
      const byTO = (mt, ot) => { for (const mk of byT[mt] || []) for (const i of ids(mk)) { const o = O[i]; if (o && o.typeId === ot && o.oddStatus === 0) return o.price; } return null; };
      const p1 = P(m, (i, j) => i > j), px = P(m, (i, j) => i === j), p2 = Math.max(0, 1 - p1 - px);
      const wG = COPA_UEFA[utE] ? 0.1 : W_MOD;
      const c1 = byTO(1, 1), cX = byTO(1, 2), c2 = byTO(1, 3);
      let Q = B5.x12 || null, refG = "bet365";
      if (!Q && c1 && cX && c2) { Q = potencia([c1, cX, c2]); refG = "Playdoit"; }
      const add2 = (fam, txt, c, pm, q) => { if (!c || pm == null) return; pm = Math.min(0.99, Math.max(0.01, pm + ajusteBit(nom, fam, txt)));
        if (q != null && Math.abs(pm - q) >= 0.10) { desc.push({ fam, txt, cuota: c, pm: Math.round(pm * 100), pq: Math.round(q * 100) }); return; } const pf = q == null ? pm : wG * pm + (1 - wG) * q;
        out.push({ fam, txt, cuota: c, pm: Math.round(pm * 100), pf: Math.round(pf * 100), pq: q == null ? null : Math.round(q * 100), ev: Math.round((pf * c - 1) * 1000) / 10, ref: q == null ? "" : refG }); };
      add2("Ganador", Hs, c1, p1, Q && Q[0]); add2("Ganador", "Empate", cX, px, Q && Q[1]); add2("Ganador", As, c2, p2, Q && Q[2]);
      add2("Doble oportunidad", Hs + " o empate", byTO(10, 9), p1 + px, Q && Q[0] + Q[1]);
      add2("Doble oportunidad", "Empate o " + As, byTO(10, 11), px + p2, Q && Q[1] + Q[2]);
      add2("Doble oportunidad", Hs + " o " + As, byTO(10, 10), p1 + p2, Q && Q[0] + Q[2]);
      add2("Empate No Acción", Hs, byTO(11, 1), p1 / (p1 + p2), Q && Q[0] / (Q[0] + Q[2]));
      add2("Empate No Acción", As, byTO(11, 3), p2 / (p1 + p2), Q && Q[2] / (Q[0] + Q[2]));
    }
    // hándicap asiático (todas las líneas): valor esperado exacto con medias líneas y cuartos
    const ahEV = (h, c, local) => { const one = (hh) => { const w = P(m, (i, j) => (local ? i - j : j - i) + hh > 0), pu = P(m, (i, j) => (local ? i - j : j - i) + hh === 0); return [w, pu]; };
      const parts = Math.abs(h * 4) % 2 === 1 ? [h - 0.25, h + 0.25] : [h]; let e = 0, pw = 0; for (const hh of parts) { const [w, pu] = one(hh); e += (w * c + pu - 1) / parts.length; pw += (w + pu / 2) / parts.length; } return [e, pw]; };
    const AH = {}; const loc = norm(ev.homeTeam.name);
    for (const mk of byT[16] || []) for (const i of ids(mk)) { const o = O[i]; if (!o || o.oddStatus !== 0) continue; const x = String(o.name).match(/\(([+-]?[\d.]+)\)\s*$/); if (!x) continue; const h = Number(x[1]); const nm0 = String(o.name).replace(/\(.*$/, ""); const esL = o.typeId === 1714 ? true : o.typeId === 1715 ? false : (igual(nm0, nomL) || igual(nm0, ev.homeTeam.name) || norm(o.name).startsWith(loc.split(" ")[0])); (esL ? (AH.L = AH.L || {}) : (AH.V = AH.V || {}))[h] = o.price; }
    // Hándicap = "quién gana": en copas europeas 10 % modelo / 90 % mercado; en Libertadores y Sudamericana no se evalúa (el modelo de copas pierde contra el mercado ahí).
    const wAH = COPA_UEFA[utE] ? 0.1 : W_MOD;
    if (!COPA_CONMEBOL[utE]) for (const [lado, nmb] of [["L", Hs], ["V", As]]) for (const hs in (AH[lado] || {})) { const h = Number(hs), c = AH[lado][hs], cO = (AH[lado === "L" ? "V" : "L"] || {})[-h];
      let [e, pw] = ahEV(h, c, lado === "L"); const aj = ajusteBit(nom, "Hándicap " + nmb, ""); if (aj) { pw = Math.max(0.01, pw + aj); e += aj * c; } let q = cO ? (1 / c) / (1 / c + 1 / cO) : null; if (q != null && Math.abs(pw - q) >= 0.10) continue;
      const evF = q == null ? e : wAH * e + (1 - wAH) * (q * c - 1); out.push({ fam: "Hándicap " + nmb, txt: (h > 0 ? "+" : "") + h, cuota: c, pm: Math.round(pw * 100), pf: Math.round((q == null ? pw : wAH * pw + (1 - wAH) * q) * 100), pq: q == null ? null : Math.round(q * 100), ref: q == null ? "" : "Playdoit", ev: Math.round(evF * 1000) / 10 }); }
    // córners totales, por equipo y del 1er tiempo
    const C = CRn || {}; const nC = out.length;
    for (const [t, fam, e, K] of [[166, "Córners", C.c && C.c.total, KNB.c], [167, "Córners " + Hs, C.c && C.c.local, KNB.c], [168, "Córners " + As, C.c && C.c.visita, KNB.c], [177, "Córners 1er tiempo", C.c1 && C.c1.total, KNB.c1]]) {
      if (!e) continue; const L = ouLines(t); for (const k in L) { const pk = nbMas(Number(k), e, K), b = t === 166 ? (B5.cor || {})[k] : null; add(fam, "Más de " + k, L[k].o, pk, L[k].u, 1 - pk, b); add(fam, "Menos de " + k, L[k].u, 1 - pk, L[k].o, pk, b == null ? null : 1 - b); } }
    if (C.copa) for (let i = nC; i < out.length; i++) out[i].prueba = "córners en copa";
    // v1.15: remates totales (todos los tiros) por equipo y del partido; prueba con 6,861 líneas fuera de muestra: Brier .1824 contra .1954 del promedio de liga. Paradas del portero: descartadas (no le ganan al promedio).
    if (C.t) { const nT = out.length; for (const [t, fam, mu] of [[15728, "Remates totales " + Hs, C.t.local], [15729, "Remates totales " + As, C.t.visita], [15738, "Remates totales", C.t.total]]) {
        const L3 = {}; for (const mk of byT[t] || []) for (const i of ids(mk)) { const o = O[i]; if (!o || o.oddStatus !== 0) continue; const x = String(o.name).trim().match(/^(Más|Menos) de ([\d.]+)$/); if (!x) continue; L3[x[2]] = L3[x[2]] || {}; L3[x[2]][x[1] === "Más" ? "o" : "u"] = o.price; }
        for (const k in L3) { const pk = nbMas(Number(k), mu, 30); add(fam, "Más de " + k, L3[k].o, pk, L3[k].u, 1 - pk); add(fam, "Menos de " + k, L3[k].u, 1 - pk, L3[k].o, pk); } }
      for (let i = nT; i < out.length; i++) out[i].prueba = "remates"; }
    // remates a puerta (v1.13, en prueba): solo ligas; referencia = Playdoit sin margen (bet365 no tiene la línea); discrepancia 15
    if (C.r) { const nR = out.length, L2 = {};
      for (const mk of d.markets || []) { const nmk = String(mk.name || ""); if (!/(tiros|remates|disparos) a (puerta|gol)/i.test(nmk) || /(1|primer)(a|ª|er|o|\.)? ?(mitad|parte|tiempo)|suplente|jugador/i.test(nmk)) continue;
        for (const i of ids(mk)) { const o = O[i]; if (!o || o.oddStatus !== 0) continue; const sN = String(o.name), x = sN.match(/(Más|Menos) de ([\d.]+)/); if (!x || Math.abs(Number(x[2]) % 1 - 0.5) > 0.01) continue;
          const pre = (nmk + " " + sN.replace(/(Más|Menos) de.*$/, "")).replace(/(tiros|remates|disparos) a (puerta|gol)|total|equipo/gi, " ");
          const lado = mk.typeId === 15726 ? "L" : mk.typeId === 15727 ? "V" : igual(pre, nomL) || igual(pre, ev.homeTeam.name) || /local/i.test(pre) ? "L" : igual(pre, nomV) || igual(pre, ev.awayTeam.name) || /visit/i.test(pre) ? "V" : "T";
          const key = lado + "|" + x[2]; L2[key] = L2[key] || {}; L2[key][x[1] === "Más" ? "o" : "u"] = o.price; } }
      for (const key in L2) { const [lado, k] = key.split("|"), mu = lado === "L" ? C.r.local : lado === "V" ? C.r.visita : C.r.total; if (!mu) continue;
        const fam = "Remates a puerta" + (lado === "L" ? " " + Hs : lado === "V" ? " " + As : ""), pk = nbMas(Number(k), mu, KNB.r);
        add(fam, "Más de " + k, L2[key].o, pk, L2[key].u, 1 - pk); add(fam, "Menos de " + k, L2[key].u, 1 - pk, L2[key].o, pk); }
      for (let i = nR; i < out.length; i++) out[i].prueba = "remates"; }
    // goles del 1er tiempo (mercados por nombre)
    for (const mk of d.markets || []) { if (!/(1|primer)(a|ª|er|o|\.)? ?(mitad|parte|tiempo)/i.test(String(mk.name || "")) || /c[oó]rner|esquina|tarjeta|tiros|remate|disparo/i.test(String(mk.name || ""))) continue; if (/equipo|local|visitante/i.test(String(mk.name || "")) || deEq(String(mk.name || "").replace(/(1|primer)(a|ª|er|o|\.)? ?(mitad|parte|tiempo)|total|goles|más|menos/gi, " "))) continue;
      const L = {}; for (const i of ids(mk)) { const o = O[i]; if (!o || o.oddStatus !== 0) continue; const x = String(o.name).trim().match(/^(Más|Menos) de ([\d.]+)$/); if (x && Math.abs(Number(x[2]) % 1 - 0.5) < 0.01) { L[x[2]] = L[x[2]] || {}; L[x[2]][x[1] === "Más" ? "o" : "u"] = o.price; } }
      const s1 = (G.lL + G.lV) * f1; for (const k in L) { let pk = 0, t = Math.exp(-s1); for (let n = 0; n <= Math.floor(Number(k)); n++) { pk += t; t *= s1 / (n + 1); } pk = 1 - pk; add("Goles 1er tiempo", "Más de " + k, L[k].o, pk, L[k].u, 1 - pk); add("Goles 1er tiempo", "Menos de " + k, L[k].u, 1 - pk, L[k].o, pk); } }
    // ---------- v1.15: mercados nuevos (en prueba, 50 resultados), Gana con PA y supercuotas ----------
    const nPrev = out.length;
    const oddsDe = (t) => { const r = []; for (const mk of byT[t] || []) for (const i of ids(mk)) { const o = O[i]; if (o && o.oddStatus === 0) r.push(o); } return r; };
    const pois = (l, n) => (l > 0 ? pmf(n, l) : n === 0 ? 1 : 0);
    // varios resultados que suman 1: referencia = Playdoit sin margen (proporcional); discrepancia 10 en tipo ganador, 15 en lo demás
    const addN = (fam, opts, lim = 0.15) => { const ok = opts.filter((x) => x.c && x.pm != null); if (ok.length < 2) return; const sm = ok.reduce((a, x) => a + 1 / x.c, 0);
      for (const x of ok) { const pm = Math.min(0.99, Math.max(0.01, x.pm)), q = (1 / x.c) / sm;
        if (Math.abs(pm - q) >= lim) { desc.push({ fam, txt: x.txt, cuota: x.c, pm: Math.round(pm * 100), pq: Math.round(q * 100) }); continue; }
        const pf = W_MOD * pm + (1 - W_MOD) * q; out.push({ fam, txt: x.txt, cuota: x.c, pm: Math.round(pm * 100), pf: Math.round(pf * 100), pq: Math.round(q * 100), ref: "Playdoit", ev: Math.round((pf * x.c - 1) * 1000) / 10 }); } };
    const sino = (t, fam, p) => { let s = null, n = null; for (const o of oddsDe(t)) { if (o.typeId === 74) s = o.price; if (o.typeId === 76) n = o.price; } add(fam, "Sí", s, p, n, 1 - p); add(fam, "No", n, 1 - p, s, p); };
    // mitades: cada mitad como partido aparte (Poisson con la parte de los goles de esa mitad)
    const mitad = (f) => { const a = G.lL * f, b = G.lV * f, mm = []; for (let i = 0; i <= 8; i++) { mm.push([]); for (let j = 0; j <= 8; j++) mm[i].push(pois(a, i) * pois(b, j)); } return { a, b, m: mm }; };
    const PH = (h, fn) => { let s = 0; for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) if (fn(i, j)) s += h.m[i][j]; return s; };
    const h1 = mitad(f1), h2 = mitad(1 - f1);
    const w1L = PH(h1, (i, j) => i > j), w1X = PH(h1, (i, j) => i === j), w1V = PH(h1, (i, j) => j > i), w2L = PH(h2, (i, j) => i > j), w2V = PH(h2, (i, j) => j > i);
    const o60 = oddsDe(60), c60 = (t) => (o60.find((o) => o.typeId === t) || {}).price;
    addN("1er tiempo: ganador", [{ txt: Hs, c: c60(1), pm: w1L }, { txt: "Empate", c: c60(2), pm: w1X }, { txt: As, c: c60(3), pm: w1V }], 0.10);
    const o63 = oddsDe(63), c63 = (t) => (o63.find((o) => o.typeId === t) || {}).price;
    add("1er tiempo: doble oportunidad", Hs + " o empate", c63(9), w1L + w1X, null, null); add("1er tiempo: doble oportunidad", "Empate o " + As, c63(11), w1X + w1V, null, null);
    sino(75, "1er tiempo: ambos anotan", (1 - Math.exp(-h1.a)) * (1 - Math.exp(-h1.b)));
    sino(95, "2º tiempo: ambos anotan", (1 - Math.exp(-h2.a)) * (1 - Math.exp(-h2.b)));
    { const L2 = {}; for (const o of oddsDe(90)) { const x = String(o.name).match(/^(Más|Menos) de ([\d.]+)$/); if (!x) continue; L2[x[2]] = L2[x[2]] || {}; L2[x[2]][x[1] === "Más" ? "o" : "u"] = o.price; }
      const s2 = h2.a + h2.b; for (const k in L2) { let pk = 0; for (let n = 0; n <= Math.floor(Number(k)); n++) pk += pois(s2, n); add("2º tiempo: goles", "Más de " + k, L2[k].o, 1 - pk, L2[k].u, pk); add("2º tiempo: goles", "Menos de " + k, L2[k].u, pk, L2[k].o, 1 - pk); } }
    sino(50, "Gana alguna mitad: " + Hs, 1 - (1 - w1L) * (1 - w2L)); sino(51, "Gana alguna mitad: " + As, 1 - (1 - w1V) * (1 - w2V));
    sino(56, "Marca en ambos tiempos: " + Hs, (1 - Math.exp(-h1.a)) * (1 - Math.exp(-h2.a))); sino(57, "Marca en ambos tiempos: " + As, (1 - Math.exp(-h1.b)) * (1 - Math.exp(-h2.b)));
    // del marcador: qué equipo marca, hándicap 1X2 (marcador inicial a:b), multigoles
    { const o30 = oddsDe(30), c30 = (t) => (o30.find((o) => o.typeId === t) || {}).price, nadie = o30.find((o) => ![788, 790, 792].includes(o.typeId));
      addN("Qué equipo marca", [{ txt: "Solo " + Hs, c: c30(788), pm: P(m, (i, j) => i > 0 && j === 0) }, { txt: "Ambos", c: c30(792), pm: P(m, (i, j) => i > 0 && j > 0) }, { txt: "Solo " + As, c: c30(790), pm: P(m, (i, j) => j > 0 && i === 0) }, { txt: "Ninguno", c: nadie && nadie.price, pm: m[0][0] }]); }
    { const G14 = {}; for (const o of oddsDe(14)) { const x = String(o.name).match(/\((\d+):(\d+)\)\s*$/); if (!x) continue; const k = x[1] + ":" + x[2]; (G14[k] = G14[k] || {})[o.typeId] = o.price; }
      for (const k in G14) { const [a, b] = k.split(":").map(Number), g = G14[k];
        addN("Hándicap 1X2 (" + k + ")", [{ txt: Hs + " (" + k + ")", c: g[1711], pm: P(m, (i, j) => i + a > j + b) }, { txt: "Empate (" + k + ")", c: g[1712], pm: P(m, (i, j) => i + a === j + b) }, { txt: As + " (" + k + ")", c: g[1713], pm: P(m, (i, j) => j + b > i + a) }], 0.10); } }
    for (const o of oddsDe(548)) { const x = String(o.name).match(/^(\d+)-(\d+)$/); if (!x) continue; const lo = +x[1], hi = +x[2], pm = P(m, (i, j) => i + j >= lo && i + j <= hi), q = Math.min(0.99, 1 / o.price / 1.06);
      if (Math.abs(pm - q) >= 0.15) continue; const pf = W_MOD * pm + (1 - W_MOD) * q; out.push({ fam: "Multigoles", txt: lo + " a " + hi + " goles", cuota: o.price, pm: Math.round(pm * 100), pf: Math.round(pf * 100), pq: Math.round(q * 100), ref: "Playdoit (margen estimado)", ev: Math.round((pf * o.price - 1) * 1000) / 10 }); }
    // córners 1X2 y hándicap de córners (partido y 1er tiempo): cada equipo con binomial negativa
    const dist = (mu, k) => { const r = []; for (let n = 0; n <= 30; n++) r.push(nbPmf(n, mu, k)); return r; };
    const corn = (e, K, t1x2, tah, nombre) => { if (!e) return; const dL = dist(e.local, K), dV = dist(e.visita, K); const Pd = (fn) => { let s = 0; for (let i = 0; i <= 30; i++) for (let j = 0; j <= 30; j++) if (fn(i, j)) s += dL[i] * dV[j]; return s; };
      const o1 = oddsDe(t1x2), c1 = (t) => (o1.find((o) => o.typeId === t) || {}).price;
      addN(nombre + ": quién saca más", [{ txt: Hs, c: c1(1), pm: Pd((i, j) => i > j) }, { txt: "Empate", c: c1(2), pm: Pd((i, j) => i === j) }, { txt: As, c: c1(3), pm: Pd((i, j) => j > i) }], 0.10);
      const AHc = {}; for (const mk of tah) for (const i of ids(mk)) { const o = O[i]; if (!o || o.oddStatus !== 0) continue; const x = String(o.name).match(/\(([+-]?[\d.]+)\)\s*$/); if (!x || Math.abs(Number(x[1]) % 1) !== 0.5) continue; const lado = o.typeId === 1714 ? "L" : "V"; (AHc[lado] = AHc[lado] || {})[Number(x[1])] = o.price; }
      for (const h in AHc.L || {}) { const hn = Number(h), cO = (AHc.V || {})[-hn], pL = Pd((i, j) => i - j + hn > 0); add(nombre + ": hándicap", Hs + " " + (hn > 0 ? "+" : "") + hn, AHc.L[h], pL, cO, 1 - pL); if (cO) add(nombre + ": hándicap", As + " " + (-hn > 0 ? "+" : "") + -hn, cO, 1 - pL, AHc.L[h], pL); } };
    const ahC = (d.markets || []).filter((mk) => /h[aá]ndicap.*(esquina|c[oó]rner)/i.test(mk.name || "") && !/(1|primer)(a|ª|er|o|\.)? ?(mitad|parte|tiempo)/i.test(mk.name || ""));
    const ahC1 = (d.markets || []).filter((mk) => /h[aá]ndicap.*(esquina|c[oó]rner)/i.test(mk.name || "") && /(1|primer)(a|ª|er|o|\.)? ?(mitad|parte|tiempo)/i.test(mk.name || ""));
    corn(C.c, KNB.c, 162, ahC, "Córners"); corn(C.c1, KNB.c1, 173, ahC1, "Córners 1er tiempo");
    for (let i = nPrev; i < out.length; i++) out[i].prueba = out[i].prueba || "mercado nuevo";
    // Gana con PA (pago anticipado si va arriba por 2): P(gana o en algún momento va arriba por 2), goles como proceso de Poisson minuto a minuto
    const m1x2 = (byT[1] || [])[0], pa = m1x2 && (m1x2.offers || []).some((x) => x.type === 0 && x.parameter === 2);
    if (pa) { const paProb = (lA, lB) => { const T = 90, a = lA / T, b = lB / T; let st = new Map([[0, 1]]), hit = 0;
        for (let t = 0; t < T; t++) { const nx = new Map(); for (const [dd, p] of st) { const mv = [[dd + 1, a], [dd - 1, b], [dd, 1 - a - b]]; for (const [d2, q] of mv) { if (d2 >= 2) hit += p * q; else nx.set(d2, (nx.get(d2) || 0) + p * q); } } st = nx; }
        let gana = 0; for (const [dd, p] of st) if (dd > 0) gana += p; return hit + gana; };
      for (const [lado, nmb, c, ok] of [["L", Hs, (oddsDe(1).find((o) => o.typeId === 1) || {}).price, true], ["V", As, (oddsDe(1).find((o) => o.typeId === 3) || {}).price, true]]) {
        const lgO = out.find((l) => l.fam === "Ganador" && l.txt === nmb), lgD = desc.find((l) => l.fam === "Ganador" && l.txt === nmb), lg = lgO || lgD; if (!c || !lg) continue;
        const pPA = lado === "L" ? paProb(G.lL, G.lV) : paProb(G.lV, G.lL), pW = lado === "L" ? P(m, (i, j) => i > j) : P(m, (i, j) => j > i), extra = Math.max(0, pPA - pW);
        const pm = Math.min(0.99, lg.pm / 100 + extra), q = lg.pq == null ? null : Math.min(0.99, lg.pq / 100 + extra), pf = q == null ? pm : W_MOD * pm + (1 - W_MOD) * q;
        if (!lgO) { desc.push({ fam: "Gana con PA", txt: nmb, cuota: c, pm: Math.round(pm * 100), pq: q == null ? null : Math.round(q * 100) }); continue; }
        out.push({ fam: "Gana con PA", txt: nmb, cuota: c, pm: Math.round(pm * 100), pf: Math.round(pf * 100), pq: q == null ? null : Math.round(q * 100), ref: lg.ref, ev: Math.round((pf * c - 1) * 1000) / 10, prueba: "PA" }); } }
    // supercuotas: si la selección mejorada es una línea que ya medimos, se evalúa con la cuota mejorada
    const sup = [];
    for (const bo of d.boosts || []) { const sel = (bo.odds || [])[0], bp = (bo.boostInfo || {}).price; if (!sel || !bp || (bo.odds || []).length !== 1) { if (bp) sup.push({ txt: "combinada mejorada", cuota: bp, antes: bo.price }); continue; }
      const o = O[sel.selectionId]; if (!o) continue; const mkB = [...(d.markets || []), ...(d.childMarkets || [])].find((x) => x.id === sel.marketId) || {};
      const famB = { 1: "Ganador", 10: "Doble oportunidad", 11: "Empate No Acción", 18: "Goles", 19: "Goles " + Hs, 20: "Goles " + As, 29: "Ambos anotan" }[mkB.typeId];
      const l = out.find((x) => !x.prueba && Math.abs(x.cuota - o.price) < 0.005 && (famB ? x.fam === famB : mkB.typeId === 16 && /^Hándicap /.test(x.fam) && !/1X2/.test(x.fam)));
      if (l) out.push(Object.assign({}, l, { fam: "Supercuota: " + l.fam, cuota: bp, antes: o.price, ev: Math.round((l.pf / 100 * bp - 1) * 1000) / 10, prueba: "supercuota" }));
      else sup.push({ txt: String(mkB.name || "") + ": " + String(o.name), cuota: bp, antes: o.price }); }
    out.sup = sup;
    out.desc = desc; return out;
  }
  async function analizarPartido(eid, R, filas) {
    const d0 = await sf("event/" + eid); if (!d0) return null; const ev = d0.event, ut = ((ev.tournament || {}).uniqueTournament || {}).id, nom = LIGA_ID[ut];
    let G = golesEsp(ev, R); if (!G) return { ev, nom, error: "sin goles esperados (liga o copa sin modelo)" };
    const B = (window.__bajasDatos || {})[eid]; if (B && (B.fL !== 1 || B.fV !== 1)) G = { lL: G.lL * B.fL, lV: G.lV * B.fV, fuente: G.fuente + ", con bajas ×" + B.fL.toFixed(2) + " / ×" + B.fV.toFixed(2) };
    const L = R && nom && R.ligas[nom], H0 = ev.homeTeam.name, A0 = ev.awayTeam.name;
    let CRn = {};
    if (L) CRn = { c: espCR(L, filas, nom, H0, A0, "c", "cl", "cv"), c1: espCR(L, filas, nom, H0, A0, "c1", "c1l", "c1v"), r: espCR(L, filas, nom, H0, A0, "r", "rl", "rv"), t: espCR(L, filas, nom, H0, A0, "t", "tl", "tv") };
    else if (R && R.ligas && COPA_UEFA[ut]) CRn = { c: espCRCopa(R, filas, H0, A0, "c", "cl", "cv"), c1: espCRCopa(R, filas, H0, A0, "c1", "c1l", "c1v"), copa: true };
    const P2 = await pdEvento(ev); if (!P2) return { ev, nom, G, error: "no está en Playdoit" };
    const B5 = await b365(eid);
    return { ev, nom, G, CRn, B5, d: P2.d, lineas: evaluarLineas(ev, nom, G, CRn, P2.d, B5) };
  }
  const prepCR = async () => { await edb(); let R = getCR(); const filas = await eall("stats"); if (filas.length && (!R || R.n !== filas.length || R.v !== 4)) R = await entrenarCR(); return { R, filas }; };
  window.lineasParte = parte("__lineas");
  window.lineasIniciar = function (eids) {
    window.__lineas = { listo: false, texto: "" }; window.__lineasDatos = {};
    (async () => {
      const { R, filas } = await prepCR(); const secs = [];
      for (const eid of [].concat(eids).slice(0, 15)) {
        const A = await analizarPartido(eid, R, filas); if (!A) { secs.push("## " + eid + "\n- No se pudo leer\n"); continue; }
        const tit = "## " + limpia(A.ev.homeTeam.name + " vs " + A.ev.awayTeam.name) + " [id " + eid + "]";
        if (A.error) { secs.push(tit + "\n- " + A.error + "\n"); continue; }
        window.__lineasDatos[eid] = A.lineas;
        const porFam = {}; for (const x of A.lineas) (porFam[x.fam] = porFam[x.fam] || []).push(x);
        const filasTxt = Object.entries(porFam).map(([f, arr]) => { arr.sort((a, b) => b.ev - a.ev); const b = arr[0]; return "- " + limpia(f) + (b.prueba ? " (en prueba: no va a parlays)" : "") + ": mejor línea " + limpia(b.txt) + " @" + b.cuota.toFixed(2) + " (modelo " + b.pm + " %, Prob. final " + b.pf + " % con " + (b.ref || "modelo solo") + ", " + (b.ev >= 0 ? "+" : "") + b.ev + " %)" + (arr[1] ? " · siguiente " + limpia(arr[1].txt) + " " + (arr[1].ev >= 0 ? "+" : "") + arr[1].ev + " %" : ""); });
        const B5 = A.B5 || {}, pc = (x) => Math.round(100 * x) + " %";
        const b5t = B5.x12 ? "- bet365 sin margen (método potencia): local " + pc(B5.x12[0]) + " · empate " + pc(B5.x12[1]) + " · visita " + pc(B5.x12[2]) + " | local o empate " + pc(B5.x12[0] + B5.x12[1]) + " · visita o empate " + pc(B5.x12[2] + B5.x12[1]) + " | Empate No Acción local " + pc(B5.x12[0] / (B5.x12[0] + B5.x12[2])) + (B5.btts != null ? " | ambos anotan sí " + pc(B5.btts) : "") + (B5.tot && B5.tot["2.5"] != null ? " | Más de 2.5 " + pc(B5.tot["2.5"]) : "") + (B5.tot && B5.tot["1.5"] != null ? " · Más de 1.5 " + pc(B5.tot["1.5"]) : "") : "- bet365: sin cuotas para este partido (usar Playdoit sin margen)";
        secs.push(tit + " · goles esperados " + A.G.lL.toFixed(2) + " / " + A.G.lV.toFixed(2) + " (" + A.G.fuente + ")\n" + limpia(b5t) + "\n" + filasTxt.join("\n") + "\n");
      }
      window.__lineas = { listo: true, texto: "# Mejor línea por mercado (valor esperado por cada 100 pesos, con Prob. final 20 % modelo + 80 % bet365 sin margen (si no tiene la línea, Playdoit))\n\n" + secs.join("\n") };
    })().catch((e) => { window.__lineas = { listo: true, texto: "ERROR: " + e.message }; });
    return "iniciado";
  };
  // ---------- ESCÁNER DE MERCADOS SECUNDARIOS + LÍNEAS TEMPRANAS (v1.4) ----------
  const COPAS_ID = [[7, "Champions"], [679, "Europa League"], [17015, "Conference"], [384, "Libertadores"], [480, "Sudamericana"]];
  window.secParte = parte("__sec");
  window.secIniciar = function (dia = "hoy", minEV = 4, minPf = 45) {
    window.__sec = { listo: false, paso: "inicio", texto: "" }; window.__secDatos = [];
    (async () => {
      const fx = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
      const dn = norm(dia), f = dn === "hoy" ? fx(Date.now()) : dn === "manana" ? fx(Date.now() + 864e5) : dn === "pasado manana" ? fx(Date.now() + 2 * 864e5) : String(dia).trim();
      const { R, filas } = await prepCR(); const evs = [];
      for (const [id, nom] of [...LIGAS, ...COPAS_ID]) { window.__sec.paso = "partidos " + nom; const r = await sf("unique-tournament/" + id + "/scheduled-events/" + f); for (const e of (r && r.events) || []) if ((e.status || {}).type === "notstarted" && e.startTimestamp * 1000 > Date.now()) evs.push(e); }
      const hits = []; let k = 0;
      for (const e of evs) {
        window.__sec.paso = "partido " + (++k) + "/" + evs.length;
        const A = await analizarPartido(e.id, R, filas); if (!A || A.error) continue;
        const horas = Math.round((e.startTimestamp * 1000 - Date.now()) / 36e5);
        for (const x of A.lineas) if (x.ev >= minEV && x.pf >= minPf && x.cuota <= 3.5) hits.push({ ...x, eid: e.id, partido: e.homeTeam.name + " vs " + e.awayTeam.name, liga: A.nom || (e.tournament || {}).name, inicio: e.startTimestamp * 1000, horas, temprana: horas >= 48 });
      }
      hits.sort((a, b) => b.ev - a.ev); window.__secDatos = hits;
      window.__sec = { listo: true, paso: "listo", texto: "# Escáner de mercados con el modelo · " + f + " · " + evs.length + " partidos · " + hits.length + " líneas con valor esperado de +" + minEV + " % o más\nSin bajas: antes de apostar, pasar el partido por el análisis o revisar alineación. Prob. final = 20 % modelo + 80 % bet365 sin margen, o Playdoit si bet365 no tiene la línea (con ajustes de la bitácora); se descartan las que el modelo y Playdoit difieren 15+ puntos. Revisar contexto (bajas, rotaciones) antes de apostar.\n\n" + (hits.length ? hits.slice(0, 30).map((x) => "- " + hora(x.inicio) + " " + limpia(x.partido) + " (" + limpia(x.liga) + ") · " + limpia(x.fam) + " " + limpia(x.txt) + " @" + x.cuota.toFixed(2) + " · Prob. final " + x.pf + " % (modelo " + x.pm + " %) · " + (x.ev >= 0 ? "+" : "") + x.ev + " %" + (x.temprana ? " · LÍNEA TEMPRANA (faltan " + x.horas + " h)" : "") + " [id " + x.eid + "]").join("\n") : "- Nada con valor claro") };
    })().catch((e) => { window.__sec = { listo: true, paso: "ERROR", texto: "ERROR: " + e.message }; });
    return "iniciado";
  };
  // ---------- VENTANA DE ALINEACIONES (v1.4) ----------
  // Partidos que empiezan en 15-80 min con alineación confirmada: si una baja pesa (goles ×0.90 o menos), compara bet365 y Playdoit ahora.
  const esperarFlag = (k, ms = 120000) => new Promise((res) => { const t0 = Date.now(); const t = setInterval(() => { if ((window[k] || {}).listo || Date.now() - t0 > ms) { clearInterval(t); res(); } }, 1000); });
  window.ventanaRevisar = async function () {
    const vistos = new Set(JSON.parse(localStorage.getItem("valExtras.ventana") || "[]")), alertas = [];
    const evs = []; const fx = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
    for (const [id] of [...LIGAS, ...COPAS_ID]) { const r = await sf("unique-tournament/" + id + "/scheduled-events/" + fx); for (const e of (r && r.events) || []) { const min = (e.startTimestamp * 1000 - Date.now()) / 60000; if (min >= 15 && min <= 80 && !vistos.has(e.id)) evs.push(e); } }
    for (const e of evs) {
      const lu = await sf("event/" + e.id + "/lineups"); if (!lu || !lu.confirmed) continue;
      window.bajasIniciar([e.id]); await esperarFlag("__bajas"); const B = (window.__bajasDatos || {})[e.id]; vistos.add(e.id); if (!B) continue;
      const debil = B.fL <= 0.9 ? "local" : B.fV <= 0.9 ? "visita" : null; if (!debil) continue;
      const act = await ahora(e.id); if (!act || !act.pd1) continue;
      const rival = debil === "local" ? "2" : "1", cuota = rival === "2" ? act.pd2 : act.pd1, justa = rival === "2" ? act.b2 : act.b1;
      const ev = cuota && justa ? Math.round((cuota * justa / 100 - 1) * 1000) / 10 : null;
      const nmD = debil === "local" ? e.homeTeam.name : e.awayTeam.name, nmR = debil === "local" ? e.awayTeam.name : e.homeTeam.name;
      alertas.push({ eid: e.id, partido: e.homeTeam.name + " vs " + e.awayTeam.name, txt: "Baja fuerte confirmada en " + nmD + " (sus goles ×" + (debil === "local" ? B.fL : B.fV).toFixed(2) + "). " + nmR + " gana: bet365 " + Math.round(justa) + " % · Playdoit @" + cuota + (ev != null ? " (" + (ev >= 0 ? "+" : "") + ev + " % contra lo justo" + (ev >= 0 ? " → Playdoit no ha ajustado" : "") + ")" : "") });
    }
    try { localStorage.setItem("valExtras.ventana", JSON.stringify([...vistos].slice(-300))); } catch (e) {}
    window.__ventana = alertas; return alertas;
  };
  // ---------- MINUTOS DE GOL Y ROJAS (v1.4, para el modelo en vivo) ----------
  window.golesIniciar = function () {
    window.__golesDl = { listo: false, paso: "inicio", n: 0 };
    (async () => {
      await edb(); const filas = await eall("stats"), hechos = new Set((await eall("goles")).map((g) => g.eid)); let k = 0;
      for (const f of filas) {
        k++; if (hechos.has(f.eid)) continue; window.__golesDl.paso = k + "/" + filas.length;
        const inc = ((await sf("event/" + f.eid + "/incidents")) || {}).incidents || [];
        const mins = (x) => (x.time || 0) + (x.addedTime && x.addedTime < 900 ? x.addedTime / 100 : 0);
        const g = inc.filter((x) => x.incidentType === "goal").map((x) => (x.isHome ? "L" : "V") + mins(x)).reverse();
        const r = inc.filter((x) => x.incidentType === "card" && /red/i.test(x.incidentClass || "")).map((x) => (x.isHome ? "L" : "V") + mins(x)).reverse();
        await etx("goles", "readwrite", (s2) => s2.put({ eid: f.eid, liga: f.liga, goles: g.join(" "), rojas: r.join(" ") })); window.__golesDl.n++;
      }
      window.__golesDl.listo = true; window.__golesDl.paso = "listo · " + (await eall("goles")).length + " partidos";
    })().catch((e) => { window.__golesDl.listo = true; window.__golesDl.paso = "ERROR: " + e.message + " (vuelve a pulsar: sigue donde iba)"; });
    return "iniciado";
  };
  window.golesExportar = async function () {
    await edb(); const f = await eall("goles"); if (!f.length) return 0;
    const txt = "eid,liga,goles,rojas\n" + f.map((r) => [r.eid, '"' + r.liga + '"', '"' + r.goles + '"', '"' + r.rojas + '"'].join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" })); a.download = "minutos-gol-" + new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }) + ".csv"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return f.length;
  };

  // ---------- MODELO EN VIVO (v1.5): goles que faltan según minuto, marcador y expulsiones ----------
  // Entrenado con 6,179 partidos (minutos de gol y rojas de las 12 ligas, 2 temporadas). Ritmo de gol por tramo del partido,
  // el que va perdiendo ataca más (×1.09-1.12), el que gana baja (×0.92), con uno menos ×0.67 y con uno más ×1.52.
  const VIVO_P = [0.766, 0.846, 0.893, 3.514, 1.035, 0.954, 0.993, 6.985], VIVO_S = [1.123, 1.087, 1, 0.923, 0.925], VIVO_R = [0.672, 1, 1.519];
  const vBK = (s) => (s < 15 ? 0 : s < 30 ? 1 : s < 45 ? 2 : s === 45 ? 3 : s < 61 ? 4 : s < 76 ? 5 : s < 91 ? 6 : 7);
  const vCl = (x, a) => Math.max(-a, Math.min(a, x));
  // lL, lV = goles esperados de TODO el partido antes de empezar; s0 = tramo actual (0-44 1er tiempo, 45 = 45+, 46 = medio tiempo/46', 46-90, 91 = 90+)
  function vivoDist(lL, lV, s0, gl, gv, rojasDif) {
    const K = 10; let D = Array.from({ length: K }, () => new Float64Array(K)); D[0][0] = 1;
    for (let s = s0; s < 92; s++) {
      const f = VIVO_P[vBK(s)] / 92, N = Array.from({ length: K }, () => new Float64Array(K));
      for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) { const p = D[i][j]; if (p < 1e-12) continue;
        const d = vCl(gl + i - gv - j, 2), rL = lL * f * VIVO_S[d + 2] * VIVO_R[vCl(rojasDif, 1) + 1], rV = lV * f * VIVO_S[-d + 2] * VIVO_R[vCl(-rojasDif, 1) + 1];
        const a = 1 - Math.exp(-rL), b = 1 - Math.exp(-rV);
        N[i][j] += p * (1 - a) * (1 - b); if (i + 1 < K) N[i + 1][j] += p * a * (1 - b); if (j + 1 < K) N[i][j + 1] += p * (1 - a) * b; if (i + 1 < K && j + 1 < K) N[i + 1][j + 1] += p * a * b; }
      D = N; }
    // siguiente gol (con el marcador actual fijo hasta que caiga)
    let vivo = 1, sL = 0, sV = 0; const d0 = vCl(gl - gv, 2);
    for (let s = s0; s < 92; s++) { const f = VIVO_P[vBK(s)] / 92, rL = lL * f * VIVO_S[d0 + 2] * VIVO_R[vCl(rojasDif, 1) + 1], rV = lV * f * VIVO_S[-d0 + 2] * VIVO_R[vCl(-rojasDif, 1) + 1], t = rL + rV, q = 1 - Math.exp(-t);
      sL += vivo * q * rL / t; sV += vivo * q * rV / t; vivo *= 1 - q; }
    return { D, sigL: sL, sigV: sV, nadie: vivo };
  }
  window.vivoModelo = vivoDist;
  window.vivoModeloParte = parte("__vm");
  window.vivoModeloIniciar = function (eids) {
    window.__vm = { listo: false, texto: "" };
    (async () => {
      const R = getCR(), secs = [], pc = (x) => Math.round(100 * x) + " %";
      for (const eid of [].concat(eids).slice(0, 10)) {
        const d0 = await sf("event/" + eid); if (!d0) { secs.push("## " + eid + "\n- No se pudo leer\n"); continue; }
        const ev = d0.event, st = ev.status || {}, t = ev.time || {}, now = Date.now() / 1000, tit = "## " + limpia(ev.homeTeam.name + " vs " + ev.awayTeam.name) + " [id " + eid + "]";
        let s0, minTxt;
        const trans = t.currentPeriodStartTimestamp ? Math.floor((now - t.currentPeriodStartTimestamp) / 60) + 1 : null;
        if (st.code === 6 && trans) { s0 = trans > 45 ? 45 : trans - 1; minTxt = trans > 45 ? "45+" + (trans - 45) + "'" : trans + "'"; }
        else if (st.code === 31) { s0 = 46; minTxt = "medio tiempo"; }
        else if (st.code === 7 && trans) { const m = 45 + trans; s0 = m > 90 ? 91 : m; minTxt = m > 90 ? "90+" + (m - 90) + "'" : m + "'"; }
        else if (st.type === "notstarted") { s0 = 0; minTxt = "sin empezar"; }
        else { secs.push(tit + "\n- Estado: " + limpia(st.description || st.type || "?") + " (el modelo en vivo solo cubre los 90 minutos)\n"); continue; }
        let G = golesEsp(ev, R); if (!G) { secs.push(tit + "\n- Sin goles esperados de antes del partido (liga o copa sin modelo): usar las reglas en vivo anteriores\n"); continue; }
        const B = (window.__bajasDatos || {})[eid]; if (B) G = { lL: G.lL * B.fL, lV: G.lV * B.fV, fuente: G.fuente + " con bajas" };
        const gl = (ev.homeScore || {}).current || 0, gv = (ev.awayScore || {}).current || 0;
        const inc = ((await sf("event/" + eid + "/incidents")) || {}).incidents || [];
        let rl = 0, rv = 0; for (const x of inc) if (x.incidentType === "card" && /red/i.test(x.incidentClass || "")) x.isHome ? rl++ : rv++;
        const V = vivoDist(G.lL, G.lV, s0, gl, gv, rv - rl), D = V.D, K = D.length;
        let p1 = 0, px = 0, p2 = 0, ambos = 0, eL = 0, eV = 0; const tot = {};
        for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) { const p = D[i][j], a = gl + i, b = gv + j; if (a > b) p1 += p; else if (a === b) px += p; else p2 += p;
          if (a > 0 && b > 0) ambos += p; eL += p * i; eV += p * j; tot[a + b] = (tot[a + b] || 0) + p; }
        const H = limpia(ev.homeTeam.shortName || ev.homeTeam.name), A = limpia(ev.awayTeam.shortName || ev.awayTeam.name);
        const lineas = []; for (let k = gl + gv + 0.5; k <= gl + gv + 3.5; k++) { let m = 0; for (const n in tot) if (Number(n) > k) m += tot[n]; lineas.push("Más de " + k + " " + pc(m)); }
        secs.push(tit + "\n- " + minTxt + " · marcador " + gl + "-" + gv + (rl || rv ? " · rojas " + rl + "-" + rv : "") + " · goles esperados del partido antes de empezar " + G.lL.toFixed(2) + " / " + G.lV.toFixed(2) + " (" + G.fuente + ")"
          + "\n- Goles que faltan (esperados): " + H + " " + eL.toFixed(2) + " · " + A + " " + eV.toFixed(2)
          + "\n- Resultado final: " + H + " " + pc(p1) + " · empate " + pc(px) + " · " + A + " " + pc(p2) + " | " + H + " o empate " + pc(p1 + px) + " · " + A + " o empate " + pc(p2 + px)
          + "\n- Goles totales al final: " + lineas.join(" · ") + (gl && gv ? "" : " | Ambos anotan " + pc(ambos))
          + "\n- Siguiente gol: " + H + " " + pc(V.sigL) + " · " + A + " " + pc(V.sigV) + " · ya no hay gol " + pc(V.nadie) + "\n");
      }
      window.__vm = { listo: true, texto: "# Modelo en vivo (minuto, marcador y rojas; no ve el dominio del partido: eso va en el ajuste)\n\n" + secs.join("\n") };
    })().catch((e) => { window.__vm = { listo: true, texto: "ERROR: " + e.message }; });
    return "iniciado";
  };

  // ---------- v1.15.1: modelo entrenado del panel sin cruzar ligas ----------
  // valRatings.lambdas del panel busca en todas las ligas con nombre aproximado y puede cruzar equipos (Vitória de Brasil con Vitória SC de Portugal,
  // "Bragantino" con "Braga"). Primero busca una liga donde los DOS equipos estén con nombre exacto; si no hay, usa el del panel.
  (function arreglarLam(n) {
    const VR = window.valRatings;
    if (!VR || !VR.lambdas || !VR.get) { if (n < 90) setTimeout(() => arreglarLam(n + 1), 1000); return; }
    if (VR.__exacto) return; const orig = VR.lambdas;
    VR.lambdas = function (local, visita) {
      try { const R = VR.get();
        for (const lig in R.ligas) { const L = R.ligas[lig], ex = (nm) => L.t[nm] || L.t[Object.keys(L.t).find((k) => norm(k) === norm(nm))];
          const h = ex(local), a = ex(visita); if (!h || !a) continue;
          const lL = Math.exp(L.mu + L.home + h[0] + a[1]), lV = Math.exp(L.mu + a[0] + h[1]), T = lL + lV, f = Math.sqrt((L.mt || 2.7) / T) * Math.exp(0.025);
          return { liga: lig, fecha: R.fecha, lL: lL * f, lV: lV * f }; } } catch (e) {}
      return orig(local, visita); };
    VR.__exacto = true;
  })(0);
  // ---------- ANÁLISIS EN UNA LLAMADA (v1.14) ----------
  // valAnalizar([ids de Sofascore]) / valAnalizarParte(i): corre bajas → modelo + mejor línea (bet365 y Playdoit) → alineaciones (panel) → lectura del mercado,
  // y regresa por partido la tabla ya armada (filas mínimas del skill) + "Otras líneas con valor". Falta solo el contexto y el ajuste de Claude.
  window.valAnalizarParte = parte("__va");
  window.valAnalizar = function (eids) {
    eids = [].concat(eids).slice(0, 20).map(String);
    window.__va = { listo: false, paso: "inicio", texto: "" }; window.__vaDatos = {};
    (async () => {
      const seccion = (k, eid) => { const t = ((window[k] || {}).texto) || ""; const b = t.split(/\n(?=## )/).find((x) => x.includes("[id " + eid + "]") || x.includes("/" + eid)); return b ? b.split("\n").slice(1).filter((l) => l.trim()).map((l) => l.trim()).join("\n") : ""; };
      window.__va.paso = "bajas"; window.bajasIniciar(eids); await esperarFlag("__bajas", 240000);
      const { R, filas } = await prepCR(); const secs = []; let k = 0;
      const pc = (x) => Math.round(100 * x);
      const desde = (pf) => (pf > 3 ? (100 / (pf - 3)).toFixed(2) : "—");
      for (const eid of eids) {
        window.__va.paso = "partido " + (++k) + "/" + eids.length;
        let A = null; try { A = await analizarPartido(eid, R, filas); } catch (e) { A = { error: "ERROR " + e.message }; }
        if (!A) { secs.push("## " + eid + "\n- No se pudo leer\n"); continue; }
        const ev = A.ev; if (!ev) { secs.push("## " + eid + "\n- " + (A.error || "No se pudo leer") + "\n"); continue; }
        const Hs = ev.homeTeam.shortName || ev.homeTeam.name, As = ev.awayTeam.shortName || ev.awayTeam.name;
        const hora = new Date(ev.startTimestamp * 1000).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false });
        const tit = "## " + limpia(ev.homeTeam.name + " vs " + ev.awayTeam.name) + " · " + limpia((ev.tournament || {}).name || "") + ((ev.roundInfo || {}).round ? ", jornada " + ev.roundInfo.round : "") + " · " + hora + " [id " + eid + "]";
        if (A.error || !A.lineas) { secs.push(tit + "\n- " + (A.error || "sin líneas") + (A.G ? " · goles esperados " + A.G.lL.toFixed(2) + " / " + A.G.lV.toFixed(2) + " (" + A.G.fuente + ")" : "") + "\n"); continue; }
        const G = A.G, Ls = A.lineas, D = Ls.desc || [], usadas = new Set(), out = [];
        const m = matrizDC(G.lL, G.lV, G.rho == null ? -0.08 : G.rho), p1 = P(m, (i, j) => i > j), px = P(m, (i, j) => i === j), p2 = 1 - p1 - px;
        out.push(tit);
        out.push("- Goles esperados: " + Hs + " " + G.lL.toFixed(2) + " · " + As + " " + G.lV.toFixed(2) + " → " + (G.lL + G.lV).toFixed(2) + " (" + limpia(G.fuente) + ")");
        const C = A.CRn || {}; if (C.c) out.push("- Córners esperados: " + Hs + " " + C.c.local.toFixed(1) + " · " + As + " " + C.c.visita.toFixed(1) + " → " + C.c.total.toFixed(1) + (C.copa ? " (copa, en prueba)" : "") + (C.r ? " · remates a puerta esperados " + C.r.local.toFixed(1) + " · " + C.r.visita.toFixed(1) : ""));
        out.push("- Resultado según el modelo: " + Hs + " " + pc(p1) + " % · empate " + pc(px) + " % · " + As + " " + pc(p2) + " %" + (A.B5 && A.B5.x12 ? " | bet365 sin margen: " + pc(A.B5.x12[0]) + " · " + pc(A.B5.x12[1]) + " · " + pc(A.B5.x12[2]) + " %" : " | bet365: sin cuota"));
        out.push("Mercado | Pick | Modelo | Mercado sin margen | Prob. final | Cuota (implícita) | Valor esperado | Conviene desde");
        const fila = (nombre, l) => { usadas.add(l); return nombre + " | " + limpia(l.txt) + " | " + l.pm + " | " + (l.pq == null ? "s/d" : l.pq + " " + (l.ref || "")) + " | " + l.pf + " % | " + l.cuota.toFixed(2) + " (" + Math.round(100 / l.cuota) + " %) | " + (l.ev >= 0 ? "+" : "") + l.ev + (l.prueba ? " (en prueba: no va a parlays)" : "") + " | " + desde(l.pf); };
        const falta = (nombre, fam, txts) => { const d = D.find((x) => x.fam === fam && (!txts || txts.includes(x.txt))); return nombre + " | " + (d ? limpia(d.txt) + " | " + d.pm + " | " + d.pq + " | — | " + d.cuota.toFixed(2) + " | Sí* discrepancia de " + Math.abs(d.pm - d.pq) + " puntos: no va como pierna | —" : "— | no lo ofrece Playdoit o sin cuota"); };
        const mejor = (fam, f = () => true) => Ls.filter((l) => l.fam === fam && f(l)).sort((a, b) => b.pf - a.pf || b.ev - a.ev)[0];
        const filaDe = (nombre, fam, f, txts) => { const l = mejor(fam, f); out.push(l ? fila(nombre, l) : falta(nombre, fam, txts)); };
        filaDe("Ganador", "Ganador"); filaDe("Doble oportunidad", "Doble oportunidad"); filaDe("Empate No Acción", "Empate No Acción");
        filaDe("Más/Menos 2.5", "Goles", (l) => /de 2\.5$/.test(l.txt), ["Más de 2.5", "Menos de 2.5"]); filaDe("Ambos anotan", "Ambos anotan");
        filaDe("Más de 1.5", "Goles", (l) => l.txt === "Más de 1.5", ["Más de 1.5"]);
        // gol por equipo: el de más goles esperados; Más de 1.5 si llega a 55 %, si no Más de 0.5
        const eqG = G.lL >= G.lV ? Hs : As, famE = "Goles " + eqG, gE = Ls.filter((l) => l.fam === famE && /^Más de/.test(l.txt));
        const gSel = gE.find((l) => l.txt === "Más de 1.5" && l.pf >= 55) || gE.find((l) => l.txt === "Más de 0.5") || gE.slice().sort((a, b) => b.pf - a.pf)[0];
        if (gSel) { usadas.add(gSel); out.push(fila("Gol por equipo", Object.assign({}, gSel, { txt: eqG + " " + gSel.txt }))); } else out.push("Gol por equipo | — | no lo ofrece Playdoit");
        // v1.16: misma apuesta mejor pagada (doble oportunidad = hándicap +0.5; ganador = hándicap −0.5; Empate No Acción = hándicap 0)
        const eq = []; { const ahDe = (team, h) => Ls.find((l) => l.fam === "Hándicap " + team && Number(l.txt) === h);
          const cmp = (nomA, cA, nomB, cB) => { if (cA && cB && cB > cA * 1.005) eq.push(nomB + " @" + cB.toFixed(2) + " en lugar de " + nomA + " @" + cA.toFixed(2) + " (+" + ((cB / cA - 1) * 100).toFixed(1) + " %)"); else if (cA && cB && cA > cB * 1.005) eq.push(nomA + " @" + cA.toFixed(2) + " en lugar de " + nomB + " @" + cB.toFixed(2) + " (+" + ((cA / cB - 1) * 100).toFixed(1) + " %)"); };
          const pick = (fam, txt) => Ls.find((l) => l.fam === fam && l.txt === txt) || D.find((l) => l.fam === fam && l.txt === txt);
          for (const [team, dcTxt] of [[Hs, Hs + " o empate"], [As, "Empate o " + As]]) { const a = pick("Doble oportunidad", dcTxt), b = ahDe(team, 0.5); cmp(dcTxt, a && a.cuota, "Hándicap " + team + " +0.5", b && b.cuota); }
          for (const team of [Hs, As]) { const a = pick("Ganador", team), b = ahDe(team, -0.5); cmp(team + " gana", a && a.cuota, "Hándicap " + team + " −0.5", b && b.cuota); }
          }
        // v1.15.2: filas fijas de hándicap y remates aunque no dejen valor: la línea con cuota 1.25-2.00 de mayor valor esperado
        const enRango = (l) => l.cuota >= 1.25 && l.cuota <= 2.0, mejorEV = (arr) => arr.filter(enRango).sort((a, b) => b.ev - a.ev)[0];
        const lAH = mejorEV(Ls.filter((l) => /^Hándicap /.test(l.fam) && !/1X2/.test(l.fam)));
        out.push(lAH ? fila("Hándicap", Object.assign({}, lAH, { txt: lAH.fam.replace("Hándicap ", "") + " " + lAH.txt })) : "Hándicap | — | sin línea con cuota 1.25-2.00"); if (lAH) usadas.add(lAH);
        const lRe = mejorEV(Ls.filter((l) => /^Remates (a puerta|totales)/.test(l.fam)));
        out.push(lRe ? fila("Remates", Object.assign({}, lRe, { txt: lRe.fam.replace(/^Remates (a puerta|totales) ?/, (m0, t) => (t === "a puerta" ? "a puerta " : "totales ")) + " " + lRe.txt })) : "Remates | — | sin línea con cuota 1.25-2.00 (solo hay modelo en las 12 ligas)"); if (lRe) usadas.add(lRe);
        // gana y Más de 1.5 (si el favorito tiene 55 %+): modelo = marcador; mercado = probabilidad de ganar de bet365 × (parte de sus victorias con 2+ goles según el modelo)
        const favL = p1 >= p2, pW = favL ? p1 : p2, pJ = P(m, (i, j) => (favL ? i > j : j > i) && i + j >= 2), lw = Ls.find((l) => l.fam === "Ganador" && l.txt === (favL ? Hs : As));
        if (pJ >= 0.55) {
          const O = {}; ((A.d || {}).odds || []).forEach((o) => (O[o.id] = o)); let cJ = null;
          const PCa = (A.d || {}).competitors || [], favNom = ((PCa[favL ? 0 : 1]) || {}).name || (favL ? ev.homeTeam.name : ev.awayTeam.name);
          for (const mk of (A.d || {}).markets || []) { const mn = String(mk.name || ""); if (!/(ganador|resultado|1x2).*(total|goles|más)|(total|goles).*(ganador|resultado)/i.test(mn) || /(1|2|primer|segund)(a|ª|er|o|\.)? ?(mitad|parte|tiempo)|esquina|c[oó]rner|tarjeta/i.test(mn)) continue;
            for (const i of ids(mk)) { const o = O[i]; if (!o || o.oddStatus !== 0) continue; const nm = String(o.name); if (/1\.5/.test(nm) && /m[aá]s/i.test(nm) && (igual(nm.replace(/m[aá]s.*$/i, ""), favNom) || igual(nm.replace(/m[aá]s.*$/i, ""), favL ? ev.homeTeam.name : ev.awayTeam.name))) cJ = o.price; } }
          const qJ = lw && lw.pq != null ? (lw.pq / 100) * (pJ / pW) : null, pf = qJ == null ? pJ : 0.2 * pJ + 0.8 * qJ;
          out.push("Gana y Más de 1.5 | " + (favL ? Hs : As) + " | " + pc(pJ) + " | " + (qJ == null ? "s/d" : pc(qJ) + " (bet365 × modelo)") + " | " + pc(pf) + " % | " + (cJ ? cJ.toFixed(2) + " (" + Math.round(100 / cJ) + " %) | " + ((pf * cJ - 1) * 100 >= 0 ? "+" : "") + Math.round((pf * cJ - 1) * 1000) / 10 : "— | no lo ofrece Playdoit (armar en Crea tu apuesta)") + " | " + desde(pc(pf)));
        } else out.push("Gana y Más de 1.5 | — | nadie llega a 55 % (" + (favL ? Hs : As) + " " + pc(pJ) + " %)");
        const lm35 = Ls.find((l) => l.fam === "Goles" && l.txt === "Menos de 3.5"); if (lm35) out.push(fila("Extra: Menos de 3.5", lm35));
        const lc = Ls.filter((l) => l.fam === "Córners").sort((a, b) => b.ev - a.ev)[0]; if (lc) out.push(fila("Extra: córners", lc));
        const otras = Ls.filter((l) => !usadas.has(l) && l.ev > 0 && l.pf >= 20).sort((a, b) => b.ev - a.ev); // v1.15: sin loterías de menos de 20 %
        if (eq.length) out.push("- Misma apuesta mejor pagada (usar esta si va como pick o pierna): " + eq.join(" · "));
        out.push("- Otras líneas con valor: " + (otras.length ? otras.map((l) => limpia(l.fam + " " + l.txt) + " @" + l.cuota.toFixed(2) + " (" + l.pf + " %, +" + l.ev + (l.prueba ? ", en prueba: no va a parlays" : "") + ")").join(" · ") : "ninguna"));
        // crea tu apuesta (v1.15): las 2 combinaciones del mismo partido que más se ayudan (55 %+); mercado = probabilidad de bet365 de la pierna principal × lo que dice el modelo de la segunda
        { const fl = p1 >= p2, F = fl ? Hs : As, cw = fl ? (i, j) => i > j : (i, j) => j > i, cdc = fl ? (i, j) => i >= j : (i, j) => j >= i, cf2 = fl ? (i) => i >= 2 : (i, j) => j >= 2, crn = fl ? (i, j) => j === 0 : (i) => i === 0;
          const o15 = (i, j) => i + j >= 2, o25 = (i, j) => i + j >= 3, u35 = (i, j) => i + j <= 3, bt = (i, j) => i > 0 && j > 0;
          const lG = (l) => l.fam === "Ganador" && l.txt === F, lD = (l) => l.fam === "Doble oportunidad" && l.txt === (fl ? Hs + " o empate" : "Empate o " + As), lB = (l) => l.fam === "Ambos anotan" && l.txt === "Sí";
          const mk = (txt, a, b, fa) => { const pa = P(m, a), pb = P(m, b), pj = P(m, (i, j) => a(i, j) && b(i, j)), la = Ls.find(fa), qj = la && la.pq != null ? (la.pq / 100) * (pj / pa) : null; return { txt, pj, f: pj / (pa * pb), pf: qj == null ? pj : 0.2 * pj + 0.8 * qj }; };
          const cs = [mk(F + " gana y " + F + " mete 2 o más", cw, cf2, lG), mk(F + " gana y el rival no anota", cw, crn, lG), mk((fl ? Hs + " o empate" : "Empate o " + As) + " y Menos de 3.5", cdc, u35, lD), mk("Más de 1.5 y ambos anotan", o15, bt, lB), mk("Más de 2.5 y ambos anotan", o25, bt, lB)]
            .filter((x) => x.pf >= 0.55 && x.f > 1.02).sort((a, b) => b.f - a.f).slice(0, 2);
          if (cs.length) out.push("- Crea tu apuesta (armar en Playdoit y comparar): " + cs.map((x) => limpia(x.txt) + " (" + pc(x.pf) + " %, conviene desde " + desde(pc(x.pf)) + ")").join(" · ")); }
        if (Ls.sup && Ls.sup.length) out.push("- Supercuotas sin modelo: " + Ls.sup.map((x) => limpia(x.txt) + " @" + Number(x.antes).toFixed(2) + " → @" + Number(x.cuota).toFixed(2)).join(" · "));
        const bd = (window.__bajasDatos || {})[eid]; if (bd) out.push("- Factor de bajas (ya aplicado a los goles esperados): " + Hs + " ×" + bd.fL.toFixed(2) + " · " + As + " ×" + bd.fV.toFixed(2) + " (nombres en Alineaciones)");
        window.__vaDatos[eid] = { partido: ev.homeTeam.name + " vs " + ev.awayTeam.name, hora, G, lineas: Ls };
        secs.push(out.join("\n") + "\n");
      }
      // alineaciones (panel) y lectura del mercado: al final, una sección por partido
      if (window.alinIniciar) { window.__va.paso = "alineaciones"; try { window.alinIniciar(eids); await esperarFlag("__alin", 180000); } catch (e) {} }
      window.__va.paso = "mercado"; try { window.movIniciar(eids); await esperarFlag("__mov", 180000); } catch (e) {}
      const extra = eids.map((eid) => { const a = seccion("__alin", eid), mv = seccion("__mov", eid); return (a || mv) ? "### [id " + eid + "]\n" + (a ? "- Alineaciones: " + a.replace(/\n/g, " | ") + "\n" : "") + (mv ? "- Mercado: " + (/Sin registros anteriores/.test(mv) ? "sin historial de cuotas" : mv.replace(/\n/g, " | ")) + "\n" : "") : ""; }).filter(Boolean);
      window.__va = { listo: true, texto: "# Análisis en una llamada (Extras 1.14) · Prob. final = 20 % modelo + 80 % bet365 sin margen (si no, Playdoit); sin ajuste de contexto: sumarlo y recalcular si lo hay\n\n" + secs.join("\n") + (extra.length ? "\n# Alineaciones y lectura del mercado\n" + extra.join("\n") : "") };
    })().catch((e) => { window.__va = { listo: true, texto: "ERROR: " + e.message }; });
    return "iniciado";
  };
  // ---------- v1.16: escáner de momios + hándicap contra ganador, Empate No Acción y doble oportunidad ----------
  // Mientras corre el escáner del panel se guardan los detalles de Playdoit que ya pide (sin llamadas extra) y al terminar se revisa:
  // hándicap −0.5 = ganador, 0 = Empate No Acción, +0.5 = doble oportunidad (es la misma apuesta). Prueba con 60 partidos (24-nov): el +0.5 paga en promedio 2.9 % más que la doble oportunidad (hasta 7 %) y el ganador 1.8 % más que el −0.5: es margen normal, no error; solo se marca error con 8 %+,
  // y la escalera del hándicap (una línea más fácil no debe pagar más que una más difícil del mismo equipo).
  function revisarAH(det, maxC) {
    const out = [], hora = (s) => new Date(s).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
    for (const d of det) {
      if (!d || !d.markets) continue;
      const O = {}; (d.odds || []).forEach((o) => (O[o.id] = o));
      const byT = {}; for (const m of d.markets) (byT[m.typeId] = byT[m.typeId] || []).push(m);
      const pr = (t, ot) => { for (const m of byT[t] || []) for (const i of ids(m)) { const o = O[i]; if (o && o.typeId === ot && o.oddStatus === 0) return o.price; } return null; };
      const PC = d.competitors || [], nL = limpia((PC[0] || {}).name || "Local"), nV = limpia((PC[1] || {}).name || "Visitante");
      const tag = limpia(d.name || nL + " vs " + nV) + " (" + limpia((d.champ || {}).name || "") + (d.startDate ? " · " + hora(d.startDate) : "") + ")";
      const AH = { L: {}, V: {} };
      for (const m of byT[16] || []) for (const i of ids(m)) { const o = O[i]; if (!o || o.oddStatus !== 0) continue; const x = String(o.name).match(/\(([+-]?[\d.]+)\)\s*$/); if (!x) continue;
        const lado = o.typeId === 1714 ? "L" : o.typeId === 1715 ? "V" : null; if (lado) AH[lado][Number(x[1])] = o.price; }
      const par = (a, na, b, nb) => { if (!a || !b) return; const hi = Math.max(a, b); if (hi > maxC) return; const g = (hi / Math.min(a, b) - 1) * 100;
        if (g >= 8) out.push([90 + Math.min(g, 9), tag + " · " + (a > b ? na + " @" + a + " paga " + g.toFixed(0) + " % más que " + nb + " @" + b : nb + " @" + b + " paga " + g.toFixed(0) + " % más que " + na + " @" + a) + " (es la misma apuesta)"]); };
      par(AH.L[-0.5], "Hándicap " + nL + " −0.5", pr(1, 1), nL + " gana");
      par(AH.V[-0.5], "Hándicap " + nV + " −0.5", pr(1, 3), nV + " gana");
      par(AH.L[0], "Hándicap " + nL + " 0", pr(11, 1), "Empate No Acción " + nL);
      par(AH.V[0], "Hándicap " + nV + " 0", pr(11, 3), "Empate No Acción " + nV);
      par(AH.L[0.5], "Hándicap " + nL + " +0.5", pr(10, 9), nL + " o empate");
      par(AH.V[0.5], "Hándicap " + nV + " +0.5", pr(10, 11), "Empate o " + nV);
      for (const [lado, nm] of [["L", nL], ["V", nV]]) { const hs = Object.keys(AH[lado]).map(Number).sort((a, b) => a - b);
        for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) { const dif = AH[lado][hs[i]], fac = AH[lado][hs[j]];
          if (fac > dif + 0.01 && fac <= maxC) out.push([92, tag + " · Hándicap " + nm + " " + (hs[j] > 0 ? "+" : "") + hs[j] + " @" + fac + " (más fácil) paga más que " + (hs[i] > 0 ? "+" : "") + hs[i] + " @" + dif]); } }
    }
    return [...new Map(out.map((x) => [x[1], x])).values()].sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  }
  (function engancharEsc(n) {
    if (!(window.escIniciar && window.valPanel)) { if (n < 90) setTimeout(() => engancharEsc(n + 1), 1000); return; }
    if (window.escIniciar.__ah) return; const orig = window.escIniciar;
    const nuevo = function (dia = "hoy", umbral = 7, minFacil = -4, minProb = 60, maxCuota = 2.2) {
      const det = new Map(), of = window.fetch;
      window.fetch = async function (u, ...a) { const r = await of.call(this, u, ...a);
        try { const s = String((u && u.url) || u), m = s.match(/GetEventDetails\?eventId=(\d+)/); if (m && r.ok) r.clone().json().then((j) => det.set(m[1], j)).catch(() => {}); } catch (e) {} return r; };
      const res = orig(dia, umbral, minFacil, minProb, maxCuota);
      (async () => {
        const t0 = Date.now(); while (!(window.__esc || {}).listo && Date.now() - t0 < 1800000) await new Promise((r) => setTimeout(r, 150));
        window.fetch = of; const base = window.__esc || {}; window.__esc = { listo: false, paso: "hándicap", texto: base.texto || "" };
        await new Promise((r) => setTimeout(r, 400));
        let txt = base.texto || "";
        try { const ah = revisarAH([...det.values()], maxCuota);
          if (window.__escDatos && window.__escDatos.internos) window.__escDatos.internos.push(...ah.map((x) => "🎯 " + x));
          txt += "\n## Hándicap contra ganador, Empate No Acción y doble oportunidad (" + ah.length + ", de " + det.size + " partidos revisados)\n" + (ah.length ? ah.slice(0, 20).map((x) => "- " + x).join("\n") : "- Nada") + "\n";
        } catch (e) { txt += "\n## Hándicap: ERROR " + e.message + "\n"; }
        window.__esc = { listo: true, texto: txt };
      })().catch(() => { window.fetch = of; });
      return res;
    };
    nuevo.__ah = true; window.escIniciar = nuevo;
  })(0);
  // ---------- RADAR 2.0 (v1.11): reemplaza el radar del panel con la mezcla nueva (20/80, bet365, modelos entrenado/copa/selecciones) ----------
  const RADAR_PRIO = [7, 17, 8, 23, 35, 34, 11621, 679, 242, 37, 238, 325, 155, 955, 17015, 384, 480];
  const RADAR_COMPS = (() => { const M = Object.fromEntries([...LIGAS, ...COPAS_ID].map(([i, n]) => [i, n])); return RADAR_PRIO.filter((i) => M[i]).map((i) => [i, M[i]]); })();
  const RADAR_CACHE = {};
  function radarNuevo(hasta, tope = 30) {
    window.__radar = { listo: false, paso: "inicio", texto: "" }; window.__radarDatos = [];
    (async () => {
      const fMX = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
      const diaTxt = (ms) => new Date(ms).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", weekday: "short", day: "2-digit", month: "short" });
      const horaTxt = (ms) => new Date(ms).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false });
      const hoy = fMX(Date.now());
      let fin = hasta; if (!fin) { const d = new Date(hoy + "T12:00:00-06:00"); fin = fMX(d.getTime() + ((7 - d.getUTCDay()) % 7) * 86400000); }
      const fechas = []; for (let t = Date.parse(hoy + "T12:00:00-06:00"); fMX(t) <= fin; t += 86400000) fechas.push(fMX(t));
      const limite = Date.parse(fin + "T00:00:00-06:00") + 86400000, ahora = Date.now();
      const vistosR = new Set(), porDia = {};
      for (const [id, nomC] of RADAR_COMPS) for (const f of fechas) {
        window.__radar.paso = "partidos " + nomC + " " + f;
        const r = await sf("unique-tournament/" + id + "/scheduled-events/" + f);
        for (const e of (r && r.events) || []) { const t = e.startTimestamp * 1000;
          if (vistosR.has(e.id) || !e.status || e.status.type !== "notstarted" || t < ahora || t >= limite) continue;
          vistosR.add(e.id); const dia = fMX(t); (porDia[dia] = porDia[dia] || []).push({ e, t, compNom: nomC, prio: RADAR_PRIO.indexOf(id), dia }); } }
      const { R, filas } = await prepCR();
      const FAM_OK = new Set(["Ganador", "Doble oportunidad", "Empate No Acción", "Goles", "Ambos anotan"]);
      const LIN_OK = new Set(["Más de 1.5", "Más de 2.5", "Menos de 2.5", "Menos de 3.5"]);
      let k = 0, tot = 0; const res = {};
      for (const d in porDia) { porDia[d].sort((a, b) => a.prio - b.prio || a.t - b.t); porDia[d] = porDia[d].slice(0, tope); tot += porDia[d].length; }
      for (const d of Object.keys(porDia).sort()) { res[d] = [];
        for (const x of porDia[d]) {
          window.__radar.paso = "partido " + (++k) + "/" + tot;
          let A = null; try { A = await analizarPartido(x.e.id, R, filas); } catch (e) {}
          if (!A || A.error || !A.lineas) continue;
          const cands = A.lineas.filter((l) => (FAM_OK.has(l.fam) || /^Hándicap /.test(l.fam)) && !l.prueba && (l.fam !== "Goles" || LIN_OK.has(l.txt)) && l.pf >= 70 && l.cuota >= 1.25 && l.ev >= -5).sort((a, b) => b.ev - a.ev);
          if (!cands.length) continue; const b = cands[0];
          const pick = b.fam === "Goles" ? b.txt + " goles" : b.fam === "Ambos anotan" ? "Ambos anotan " + b.txt : b.fam === "Empate No Acción" ? "Empate No Acción " + b.txt : /^Hándicap /.test(b.fam) ? b.fam + " " + b.txt : b.txt;
          res[d].push({ x, pick, b, rot: "" }); }
        res[d].sort((a, b) => b.b.pf - a.b.pf || b.b.ev - a.b.ev);
        for (const r2 of res[d].slice(0, 15)) { window.__radar.paso = "rotación " + d;
          const otras = [];
          for (const tm of [r2.x.e.homeTeam, r2.x.e.awayTeam]) {
            const key = "rt" + tm.id; let evsT = RADAR_CACHE[key];
            if (!evsT) { const a = await sf("team/" + tm.id + "/events/last/0"), b2 = await sf("team/" + tm.id + "/events/next/0"); evsT = RADAR_CACHE[key] = [...(((a || {}).events) || []), ...(((b2 || {}).events) || [])]; }
            for (const ev2 of evsT) { const ut2 = (ev2.tournament || {}).uniqueTournament || {}; const dt = (ev2.startTimestamp * 1000 - r2.x.t) / 86400000;
              if (ev2.id !== r2.x.e.id && Math.abs(dt) <= 3.5 && Math.abs(dt) > 0.2 && ut2.id !== ((r2.x.e.tournament || {}).uniqueTournament || {}).id) otras.push((tm.shortName || tm.name) + " " + (ut2.name || "copa") + " " + diaTxt(ev2.startTimestamp * 1000)); } }
          r2.rot = otras.length ? [...new Set(otras)].join(", ") : ""; } }
      let txt = "# Radar semanal " + fechas[0] + " a " + fin + " (CDMX) · Prob. = 20 % modelo + 80 % bet365 sin margen (v1.11) · " + tot + " partidos revisados\n";
      for (const f of fechas) { const lst = res[f] || [];
        txt += "\n## " + diaTxt(Date.parse(f + "T12:00:00-06:00")) + " · " + ((porDia[f] || []).length) + " partidos, " + lst.length + " candidatos\n"
          + (lst.length ? lst.slice(0, 15).map((r2) => "- " + horaTxt(r2.x.t) + " " + limpia(r2.x.e.homeTeam.name + " vs " + r2.x.e.awayTeam.name) + " (" + r2.x.compNom + ") · " + limpia(r2.pick) + " @" + r2.b.cuota.toFixed(2) + " · prob " + r2.b.pf + "% (modelo " + r2.b.pm + " / mercado " + (r2.b.pq == null ? "s/d" : r2.b.pq) + (r2.b.ref ? " " + r2.b.ref : "") + ") · valor " + (r2.b.pf - 100 / r2.b.cuota >= 0 ? "+" : "") + Math.round(r2.b.pf - 100 / r2.b.cuota) + (r2.rot ? " 🔄 " + limpia(r2.rot) : "")).join("\n") : "- Ninguno") + "\n";
        for (const r2 of lst.slice(0, 15)) window.__radarDatos.push({ dia: f, hora: horaTxt(r2.x.t), partido: r2.x.e.homeTeam.name + " vs " + r2.x.e.awayTeam.name, liga: r2.x.compNom, pick: r2.pick, cuota: r2.b.cuota, prob: r2.b.pf, modelo: r2.b.pm, mercado: r2.b.pq, valor: Math.round(10 * (r2.b.pf - 100 / r2.b.cuota)) / 10, rot: r2.rot || "", eid: r2.x.e.id }); }
      window.__radar = { listo: true, texto: txt };
    })().catch((e) => { window.__radar = { listo: true, texto: "ERROR: " + e.message }; });
    return "iniciado";
  }
  // ---------- ACTUALIZACIÓN DE MODELOS (v1.12): una sola secuencia, para el botón y para la automática ----------
  window.valActualizarTodo = async function (aviso = () => {}) {
    if (window.__actTodo) return "ya corriendo"; window.__actTodo = true;
    const pasos = [["Ratings", () => window.valRatings && window.valRatings.actualizar(), "__rat", () => !!window.valRatings], ["Copas", () => window.valCopa && window.valCopa.actualizar(), "__copaUpd", () => !!window.valCopa],
      ["Estadísticas", () => window.estadIniciar(2), "__estad", () => true], ["Selecciones", () => window.valSel.actualizar(), "__sel", () => true], ["Selecciones femenil", () => window.valSelF.actualizar(), "__sel", () => true],
      ["Ligas femeniles", () => window.valFemLigas.actualizar(), "__femL", () => true]];
    try {
      for (let k = 0; k < pasos.length; k++) { const [n, fn, flag, hay] = pasos[k]; if (!hay()) { aviso(n + ": falta el Panel de Val"); continue; }
        window[flag] = { listo: false, paso: "" }; try { fn(); } catch (e) { aviso(n + ": ERROR " + e.message); continue; }
        await new Promise((r) => { const q = setInterval(() => { const h = window[flag] || {}; aviso("Paso " + (k + 1) + "/" + pasos.length + " · " + n + " · " + (h.paso || "…")); if (h.listo) { clearInterval(q); r(); } }, 1500); });
        if (n === "Estadísticas") { aviso("Entrenando córners y remates…"); try { await prepCR(); } catch (e) {} } }
      try { localStorage.setItem("valExtras.autoUlt", String(Date.now())); } catch (e) {}
      aviso("Listo " + new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }));
    } finally { window.__actTodo = false; if (window.__pintarMods) window.__pintarMods(); }
    return "listo";
  };
  // Automática: cada 14 días, la primera vez que Sofascore esté abierto en este Chrome (no necesita tareas programadas).
  (function auto() {
    let ult = 0; try { ult = Number(localStorage.getItem("valExtras.autoUlt") || 0); } catch (e) {}
    if (!ult) { try { const s0 = JSON.parse(localStorage.getItem("valExtras.sel") || "null"); ult = s0 && s0.fecha ? Date.parse(s0.fecha + "T12:00:00-06:00") : 0; if (ult) localStorage.setItem("valExtras.autoUlt", String(ult)); } catch (e) {} }
    if (Date.now() - ult < 14 * 864e5) return;
    setTimeout(() => { if (window.__actTodo || !window.valPanel) return; window.__autoEstado = "Actualización automática de modelos en curso…";
      window.valActualizarTodo((t) => { window.__autoEstado = "Automática · " + t; const el = document.getElementById("val-panel-host"); const e2 = el && el.shadowRoot && el.shadowRoot.querySelector("#m-todo-estado"); if (e2) e2.textContent = window.__autoEstado; }); }, 90000);
  })();

  // Cuando el panel cargue, su botón "Correr radar" usa esta versión (la vieja queda en radarIniciarViejo)
  (function enganchar(n) { if (window.radarIniciar && window.valPanel) { if (window.radarIniciar !== radarNuevo) { window.radarIniciarViejo = window.radarIniciar; window.radarIniciar = radarNuevo; } } else if (n < 90) setTimeout(() => enganchar(n + 1), 1000); })(0);

  // ---------- Pestaña 📈 Mercado dentro del panel ----------
  function pestaña() {
    const host = document.getElementById("val-panel-host"); const root = host && host.shadowRoot;
    if (!root || !root.querySelector("header")) return false;
    if (root.querySelector("#v-mov")) return true;
    const st = document.createElement("style");
    st.textContent = ".mv-up{color:#34d399}.mv-dn{color:#f87171}.mv-tag{display:inline-block;background:#064e3b;color:#a7f3d0;border-radius:6px;padding:1px 6px;font-size:11px;font-weight:700}.mv-guia{background:#1f2937;border-radius:8px;padding:8px 10px;margin:8px 0;font-size:12px;color:#d1d5db;line-height:1.5}";
    root.appendChild(st);
    const sp = root.querySelector("header .sp");
    const tab = document.createElement("button"); tab.className = "tab"; tab.dataset.v = "mov"; tab.textContent = "📈 Mercado";
    sp.parentNode.insertBefore(tab, sp);
    const v = document.createElement("div"); v.className = "vista"; v.id = "v-mov"; v.hidden = true;
    v.innerHTML = `<div class="fila"><button class="acc" id="m-ver">Ver movimiento (próximas 48 h)</button><button class="sec" id="m-guardar">Guardar cuotas ahora</button><label class="estado"><input type="checkbox" id="m-solo"> Solo con señal</label><span class="estado" id="m-estado"></span></div>
      <div class="mv-guia"><b>Cómo leerlo:</b> "bet365 justa" = lo que cree el mercado. Si sube, le cree más a ese resultado. <span class="mv-tag">ATRASADO</span> = bet365 se movió y Playdoit no: tómala ya. "Contra lo justo" positivo = Playdoit paga de más. Necesita "Guardar cada hora" activo en 🗄️ Datos.</div>
      <div id="m-res"><div class="vacio">Pulsa "Ver movimiento". Usa lo que ya guardó el registro de cuotas, sin consultar nada nuevo.</div></div>
      <h3>⚽ Goleadores (en prueba)</h3>
      <div class="fila"><input id="m-jug-id" placeholder="id de Sofascore del partido" style="width:190px"><button class="sec" id="m-jug">Calcular goleadores</button><span class="estado" id="m-jug-estado"></span></div>
      <div id="m-jug-res"></div>
      <h3>🔎 Mercados con valor según el modelo (todos los partidos)</h3>
      <div class="fila"><select id="m-sec-dia"><option value="hoy">Hoy</option><option value="mañana">Mañana</option><option value="pasado mañana">Pasado mañana (líneas tempranas)</option></select><button class="sec" id="m-sec">Escanear mercados</button><span class="estado" id="m-sec-estado"></span></div>
      <div id="m-sec-res"></div>
      <div class="estado">Líneas de Playdoit que pagan 4 % o más de lo que valen. Antes de apostar, pásalas por el análisis (bajas y rotaciones).</div>
      <h3>⏰ Ventana de alineaciones</h3>
      <div class="fila"><label class="estado"><input type="checkbox" id="m-ven"> Vigilar cada 10 min (partidos en la próxima hora)</label><button class="sec" id="m-ven-ya">Revisar ahora</button><span class="estado" id="m-ven-estado"></span></div>
      <div id="m-ven-res"></div>
      <h3>🔄 Modelos</h3>
      <div class="fila"><button class="acc" id="m-todo">Actualizar todo</button><span class="estado" id="m-todo-estado"></span></div>
      <div id="m-mods" class="estado"></div>
      <div class="estado">Se actualiza solo cada 14 días, la primera vez que abras Sofascore (tarda ~20 min; no cierres la pestaña mientras dice "en curso"). El botón es por si quieres forzarlo.</div>
      <details><summary class="estado" style="cursor:pointer">Más opciones</summary>
      <div class="fila"><button class="sec" id="m-est">Solo estadísticas</button><button class="sec" id="m-est-exp">Exportar CSV</button><span class="estado" id="m-est-estado"></span></div>
      <div class="fila"><button class="sec" id="m-sel">Solo selecciones y ligas femeniles</button><span class="estado" id="m-sel-estado"></span></div>
      <div class="fila"><button class="sec" id="m-gol">Minutos de gol (solo si te lo pido)</button><button class="sec" id="m-gol-exp">Exportar CSV</button><span class="estado" id="m-gol-estado"></span></div>
      </details>`;
    root.querySelector("#panel").appendChild(v);
    root.querySelectorAll("header .tab").forEach((b) => b.addEventListener("click", () => {
      const mio = b === tab;
      if (mio) { root.querySelectorAll("header .tab").forEach((x) => x.classList.toggle("on", x === tab)); root.querySelectorAll(".vista").forEach((x) => (x.hidden = x !== v)); }
      else v.hidden = true;
    }));
    const $ = (s) => root.querySelector(s);
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const pintar = async () => {
      $("#m-estado").textContent = "Leyendo registro…";
      const reg = await leerRegistro(), ahoraMs = Date.now();
      const porEid = {}; for (const r of reg) { const t = Date.parse(r.inicio); if (t > ahoraMs && t - ahoraMs < 48 * 3600000) (porEid[r.eid] = porEid[r.eid] || []).push(r); }
      let lista = Object.values(porEid).filter((s) => s.length >= 2).map((s) => { s.sort((a, b) => (a.ts < b.ts ? -1 : 1)); return { s, L: leer(s) }; }).sort((a, b) => Date.parse(a.s[0].inicio) - Date.parse(b.s[0].inicio));
      if ($("#m-solo").checked) lista = lista.filter((x) => x.L.señales);
      $("#m-estado").textContent = reg.length + " registros · " + lista.length + " partidos con 2+ registros";
      if (!lista.length) { $("#m-res").innerHTML = '<div class="vacio">Todavía no hay partidos de las próximas 48 h con 2 o más registros. Activa "Guardar cada hora" en 🗄️ Datos y deja Sofascore abierto.</div>'; return; }
      $("#m-res").innerHTML = lista.map(({ s, L }) => `<h3>${esc(s[0].partido)} <span class="estado">· ${esc(s[0].liga)} · ${esc(hora(Date.parse(s[0].inicio)))} · ${L.regs} registros en ${L.horas} h</span></h3>
        <table><thead><tr><th>Mercado</th><th>bet365 justa</th><th>Playdoit</th><th>Contra lo justo</th><th>Lectura</th></tr></thead><tbody>${L.filas.map((f) => {
          const cl = f.b1 - f.b0 >= 1 ? "mv-up" : f.b1 - f.b0 <= -1 ? "mv-dn" : "";
          return `<tr><td>${esc(f.txt)}</td><td class="n ${cl}">${f.b0}% → ${f.b1}%</td><td class="n">@${f.c0} → @${f.c1}</td><td class="n ${f.ev >= 0 ? "pos" : "neg"}">${f.ev >= 0 ? "+" : ""}${f.ev}%</td><td>${f.lect.includes("ATRASADO") ? '<span class="mv-tag">ATRASADO</span> ' : ""}${esc(f.lect.replace(" → PLAYDOIT ATRASADO: tomar ya", ""))}</td></tr>`;
        }).join("")}</tbody></table>`).join("");
    };
    $("#m-ver").onclick = pintar; $("#m-solo").onchange = pintar;
    $("#m-jug").onclick = () => {
      const id = ($("#m-jug-id").value.match(/\d{6,}/) || [])[0] || (location.href.match(/#id:(\d+)/) || [])[1];
      if (!id) { $("#m-jug-estado").textContent = "Pon el id del partido (o abre el partido en Sofascore)"; return; }
      $("#m-jug").disabled = true; $("#m-jug-estado").textContent = "Calculando…"; window.jugIniciar([id]);
      const t2 = setInterval(() => { if (!(window.__jug || {}).listo) return; clearInterval(t2); $("#m-jug").disabled = false; $("#m-jug-estado").textContent = "";
        const f = (window.__jugDatos || {})[id] || [];
        $("#m-jug-res").innerHTML = f.length ? `<table><thead><tr><th>Jugador</th><th>Anota</th><th>2+</th><th>Primer gol</th><th>Min.</th><th>Cuota</th><th>Valor</th></tr></thead><tbody>${f.slice(0, 14).map((x) => `<tr><td>${esc(x.jugador)}<br><span class="estado">${esc(x.equipo)} · ${x.goles} goles, ${x.xg} xG</span></td><td class="n">${x.pCual}%</td><td class="n">${x.p2}%</td><td class="n">${x.pPrimero}%</td><td class="n">${x.minEsp}</td><td class="n">${x.cuota ? "@" + x.cuota.toFixed(2) : "—"}</td><td class="n ${x.ev >= 0 ? "pos" : "neg"}">${x.ev == null ? "—" : (x.ev >= 0 ? "+" : "") + x.ev + "%"}</td></tr>`).join("")}</tbody></table>` : `<div class="aviso">${esc((window.__jug || {}).texto || "Sin datos")}</div>`;
      }, 1500);
    };
    $("#m-est").onclick = () => { $("#m-est").disabled = true; window.estadIniciar(2); const t3 = setInterval(() => { const h = window.__estad || {}; $("#m-est-estado").textContent = (h.listo ? "" : "Descargando… ") + (h.paso || ""); if (h.listo) { clearInterval(t3); $("#m-est").disabled = false; } }, 2000); };
    $("#m-sec").onclick = () => { $("#m-sec").disabled = true; window.secIniciar($("#m-sec-dia").value); const t4 = setInterval(() => { const h = window.__sec || {}; $("#m-sec-estado").textContent = h.listo ? "" : "Escaneando… " + (h.paso || ""); if (!h.listo) return; clearInterval(t4); $("#m-sec").disabled = false;
      const L = window.__secDatos || []; $("#m-sec-res").innerHTML = L.length ? `<table><thead><tr><th>Hora</th><th>Partido</th><th>Mercado</th><th>Cuota</th><th>Prob.</th><th>Valor</th></tr></thead><tbody>${L.slice(0, 30).map((x) => `<tr><td>${esc(hora(x.inicio))}</td><td>${esc(x.partido)}<br><span class="estado">${esc(x.liga)}${x.temprana ? " · línea temprana" : ""}</span></td><td>${esc(x.fam)}: ${esc(x.txt)}</td><td class="n">@${x.cuota.toFixed(2)}</td><td class="n">${x.pf}%</td><td class="n pos">+${x.ev}%</td></tr>`).join("")}</tbody></table>` : `<div class="vacio">${esc(String((window.__sec || {}).texto || "").startsWith("ERROR") ? window.__sec.texto : "Nada con valor claro.")}</div>`; }, 2000); };
    let tVen = null; const correrVen = async (aviso) => { $("#m-ven-estado").textContent = "Revisando…"; const al = await window.ventanaRevisar(); $("#m-ven-estado").textContent = "Revisado " + new Date().toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" });
      if (al.length) { $("#m-ven-res").innerHTML = "<ul>" + al.map((a) => `<li><b>${esc(a.partido)}</b>: ${esc(a.txt)}</li>`).join("") + "</ul>" + $("#m-ven-res").innerHTML; if (aviso) try { if (Notification.permission === "granted") new Notification("Panel de Val: alineación", { body: al.map((a) => a.partido + ": " + a.txt).join("\n").slice(0, 300) }); } catch (e) {} } };
    $("#m-ven-ya").onclick = () => correrVen(false);
    $("#m-ven").onchange = () => { clearInterval(tVen); try { localStorage.setItem("valExtras.venAuto", $("#m-ven").checked ? "1" : ""); } catch (e) {} if ($("#m-ven").checked) { try { Notification.requestPermission(); } catch (e) {} correrVen(true); tVen = setInterval(() => correrVen(true), 10 * 60000); } };
    try { if (localStorage.getItem("valExtras.venAuto")) { $("#m-ven").checked = true; tVen = setInterval(() => correrVen(true), 10 * 60000); } } catch (e) {}
    $("#m-sel").onclick = async () => { $("#m-sel").disabled = true; window.valSel.actualizar(); await new Promise((r) => { const q = setInterval(() => { if ((window.__sel || {}).listo) { clearInterval(q); r(); } }, 1000); }); window.valSelF.actualizar(); await new Promise((r) => { const q = setInterval(() => { if ((window.__sel || {}).listo) { clearInterval(q); r(); } }, 1000); }); window.valFemLigas.actualizar(); const t7 = setInterval(() => { const h = window.__femL || {}; $("#m-sel-estado").textContent = h.paso || ""; if (h.listo) { clearInterval(t7); $("#m-sel").disabled = false; } }, 1500); const t6 = setInterval(() => { const h = window.__sel || {}; $("#m-sel-estado").textContent = h.paso || ""; if (h.listo) { clearInterval(t6); $("#m-sel").disabled = false; } }, 1500); };
    const pintarMods = () => { const f = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }; const j = (k) => { try { return JSON.parse(f(k) || "null"); } catch (e) { return null; } };
      const it = [["Ratings de ligas", !!f("valPanel.ratings")], ["Copas", !!f("valPanel.ratingsCopa")], ["Córners y remates", !!f("valExtras.cr")], ["Selecciones", !!j("valExtras.sel")], ["Selecciones femenil", !!j("valExtras.selF")], ["Ligas femeniles", !!j("valExtras.femLigas")]];
      const fe = (j("valExtras.sel") || {}).fecha; $("#m-mods").innerHTML = it.map(([n, ok]) => (ok ? "✅ " : "⚠️ ") + n).join(" · ") + (fe ? " · actualizado " + fe : ""); };
    pintarMods();
    $("#m-todo").onclick = async () => { $("#m-todo").disabled = true; const E = $("#m-todo-estado"); await window.valActualizarTodo((t) => (E.textContent = t)); $("#m-todo").disabled = false; pintarMods(); };
    window.__pintarMods = pintarMods;
    $("#m-gol").onclick = () => { $("#m-gol").disabled = true; window.golesIniciar(); const t5 = setInterval(() => { const h = window.__golesDl || {}; $("#m-gol-estado").textContent = (h.listo ? "" : "Descargando… ") + (h.paso || ""); if (h.listo) { clearInterval(t5); $("#m-gol").disabled = false; } }, 2000); };
    $("#m-gol-exp").onclick = async () => { const n = await window.golesExportar(); $("#m-gol-estado").textContent = n ? "Exportados " + n + " partidos" : "Todavía no hay datos"; };
    $("#m-est-exp").onclick = async () => { const n = await window.estadExportar(); $("#m-est-estado").textContent = n ? "Exportados " + n + " partidos" : "Todavía no hay datos"; };
    $("#m-guardar").onclick = async () => { if (typeof window.cuotasRegistrar !== "function") { $("#m-estado").textContent = "Falta el Panel de Val 1.6.0"; return; } $("#m-guardar").disabled = true; $("#m-estado").textContent = "Guardando (1-3 min)…"; try { await window.cuotasRegistrar(); } catch (e) {} $("#m-guardar").disabled = false; pintar(); };
    return true;
  }
  let intentos = 0; const t = setInterval(() => { if (pestaña() || ++intentos > 60) clearInterval(t); }, 1000);
})();
