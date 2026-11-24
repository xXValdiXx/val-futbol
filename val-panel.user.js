// ==UserScript==
// @name         Panel de Val (Sofascore + Playdoit)
// @namespace    val-analisis-partidos
// @version      1.6.0
// @updateURL    https://raw.githubusercontent.com/xXValdiXx/val-futbol/main/val-panel.user.js
// @downloadURL  https://raw.githubusercontent.com/xXValdiXx/val-futbol/main/val-panel.user.js
// @description  Radar semanal, escáner de momios y soñadora dentro de Sofascore. También deja cargadas las funciones que usa Claude (sofaIniciar, playIniciar, escIniciar, radarIniciar) y los modelos de liga y de copas.
// @match        https://www.sofascore.com/*
// @grant        none
// @sandbox      JavaScript
// @run-at       document-idle
// ==/UserScript==

/* Funciones disponibles en la consola de la página (las usa Claude con javascript_tool):
   sofaIniciar(modo, [equipos]) / sofaParte(i)      → estadísticas para el análisis
   playIniciar(["Local vs Visitante"], dias) / playParte(i) → cuotas de Playdoit
   escIniciar("hoy"|"mañana"|"AAAA-MM-DD", 7, -4) / escParte(i) → escáner de momios
   radarIniciar("AAAA-MM-DD"?, 30) / radarParte(i)  → radar semanal
   alinIniciar([idSofascore o equipo local]) / alinParte(i) → alineaciones, bajas y cambios vs último partido
   cierreIniciar([idSofascore]) / cierreParte(i) → cuotas de cierre de bet365 sin margen (para el CLV)
   vivoIniciar() / vivoParte(i) → partidos en vivo: goles que faltan (xG) contra la cuota de Playdoit
   valRatings.lambdas(local, visita) / valRatings.actualizar() → modelo entrenado por liga (ratings por equipo)
   valCopa.lambdas(idLocal, idVisita, idCopa) / valCopa.actualizar() → modelo de copas (v1.6, ratings comparables entre ligas)
   cuotasRegistrar() / cuotasExportar() → registro horario Playdoit vs bet365 · historicoIniciar(4) → CSV de resultados de ligas
   window.valPanel.version → versión instalada */
(function () {
  "use strict";
  if (window.valPanel) return;
  window.valPanel = { version: "1.6.0" };

  // ===== MODELO ENTRENADO (ratings) =====
  try {
(function () {
  // MODELO ENTRENADO (v1.5): ratings de ataque y defensa por equipo (Dixon-Coles con peso por fecha, vida media ~1.3 años).
  // Entrenado con 4 temporadas de 11 ligas; en la prueba fuera de muestra (5,112 partidos) mejoró al modelo anterior en 1X2, Más de 1.5, Más de 2.5 y ambos anotan.
  const RATINGS0 = {"fecha":"2026-11-02","xi":0.0015,"rho":-0.08,"ligas":{"Argentina":{"mu":-0.1249,"home":0.2385,"mt":2.126,"t":{"Aldosivi":[-0.19,0.28],"Argentinos Juniors":[0.133,-0.261],"Atlético Tucumán":[-0.013,0.133],"Banfield":[-0.02,0.235],"Barracas Central":[-0.064,0.003],"Boca Juniors":[0.344,-0.329],"CA Independiente":[0.09,-0.126],"CA Lanús":[0.07,-0.185],"CA Talleres":[-0.036,-0.014],"Central Córdoba":[-0.071,0.218],"Club Atlético Belgrano":[0.022,-0.102],"Club Atlético Platense":[-0.156,-0.008],"Club Atlético Unión de Santa Fe":[0.195,0.155],"Defensa y Justicia":[0.123,0.138],"Deportivo Riestra":[-0.282,-0.168],"Estudiantes de La Plata":[0.166,-0.002],"Estudiantes de Río Cuarto":[-0.589,0.317],"Gimnasia y Esgrima":[0.058,0.027],"Gimnasia y Esgrima Mendoza":[0.034,0.127],"Huracán":[-0.101,-0.172],"Independiente Rivadavia":[0.208,0.11],"Instituto De Córdoba":[0.146,0.044],"Newell's Old Boys":[-0.129,0.113],"Racing Club":[0.17,0.007],"River Plate":[0.299,-0.194],"Rosario Central":[0.241,-0.222],"San Lorenzo":[-0.23,-0.183],"Sarmiento":[-0.036,0.186],"Tigre":[-0.019,-0.113],"Vélez Sarsfield":[0.211,-0.124]}},"Brasileirão":{"mu":0.0092,"home":0.341,"mt":2.72,"t":{"Athletico":[0.145,-0.073],"Atlético Mineiro":[0.069,-0.085],"Bahia":[0.153,-0.029],"Botafogo":[0.189,-0.049],"Chapecoense":[-0.135,0.412],"Corinthians":[0.009,-0.052],"Coritiba":[-0.016,0.146],"Cruzeiro":[0.192,-0.162],"Flamengo":[0.498,-0.39],"Fluminense":[0.128,-0.169],"Grêmio":[0.009,0.007],"Internacional":[0.03,-0.038],"Mirassol":[0.132,-0.067],"Palmeiras":[0.351,-0.501],"Red Bull Bragantino":[0.041,-0.034],"Remo":[-0.077,0.112],"Santos":[0.141,0.015],"São Paulo":[0.008,-0.115],"Vasco da Gama":[0.112,0.138],"Vitória":[-0.115,0.038]}},"Bundesliga":{"mu":0.2386,"home":0.2095,"mt":3.301,"t":{"1. FC Heidenheim":[-0.123,0.138],"1. FC Köln":[-0.1,0.095],"1. FC Union Berlin":[-0.218,0.04],"1. FSV Mainz 05":[0.069,-0.051],"Bayer 04 Leverkusen":[0.388,-0.16],"Borussia Dortmund":[0.34,-0.36],"Borussia M'gladbach":[0.001,0.096],"Eintracht Frankfurt":[0.226,0.095],"FC Augsburg":[-0.016,0.024],"FC Bayern München":[0.809,-0.328],"FC Schalke 04":[-0.717,-0.345],"FC St. Pauli":[-0.496,-0.063],"Hamburger SV":[-0.188,0.072],"RB Leipzig":[0.327,-0.152],"SC Freiburg":[0.125,-0.016],"SC Paderborn 07":[-0.544,-0.361],"SV 07 Elversberg":[0.344,0.206],"SV Werder Bremen":[0.009,0.035],"TSG Hoffenheim":[0.211,0.111],"VfB Stuttgart":[0.353,-0.086],"VfL Wolfsburg":[-0.034,0.099]}},"Eredivisie":{"mu":0.3123,"home":0.1722,"mt":3.268,"t":{"ADO Den Haag":[-0.171,0.16],"AFC Ajax":[0.361,-0.388],"AZ Alkmaar":[0.223,-0.271],"Almere City FC":[-0.383,0.053],"De Graafschap":[-0.205,0.449],"Excelsior":[0.036,0.112],"FC Den Bosch":[-0.451,0.096],"FC Groningen":[0.122,-0.097],"FC Twente":[0.331,-0.348],"FC Utrecht":[0.196,-0.129],"FC Volendam":[-0.296,0.042],"Feyenoord":[0.489,-0.397],"Fortuna Sittard":[-0.025,-0.038],"Go Ahead Eagles":[0.173,-0.008],"Heracles Almelo":[-0.217,0.231],"NAC Breda":[-0.219,-0.031],"NEC Nijmegen":[0.294,-0.124],"PEC Zwolle":[-0.084,0.087],"PSV Eindhoven":[0.762,-0.327],"RKC Waalwijk":[-0.168,0.102],"Roda JC Kerkrade":[-0.309,0.217],"SC Cambuur":[0.292,0.13],"SC Heerenveen":[0.122,-0.091],"SC Telstar":[0.059,-0.035],"Sparta Rotterdam":[-0.019,-0.005],"Willem II Tilburg":[-0.27,0.267]}},"LaLiga":{"mu":0.0867,"home":0.2886,"mt":2.794,"t":{"Athletic Club":[0.076,-0.199],"Atlético Madrid":[0.352,-0.328],"Celta Vigo":[0.092,-0.089],"Deportivo Alavés":[-0.051,-0.034],"Deportivo de A Coruña":[0.051,-0.058],"Elche":[0.082,0.037],"Espanyol":[-0.084,-0.054],"FC Barcelona":[0.817,-0.281],"Getafe":[-0.343,-0.232],"Girona FC":[0.033,-0.003],"Levante UD":[0.107,0.13],"Mallorca":[-0.097,-0.082],"Málaga CF":[-0.355,0.213],"Osasuna":[-0.029,0.038],"Rayo Vallecano":[-0.091,-0.105],"Real Betis":[0.239,-0.102],"Real Madrid":[0.554,-0.426],"Real Oviedo":[-0.468,0.063],"Real Racing Club":[0.129,0.531],"Real Sociedad":[0.17,0.039],"Sevilla":[0.049,0.064],"Valencia":[-0.09,-0.034],"Villarreal":[0.383,-0.065]}},"Liga MX":{"mu":0.2112,"home":0.2446,"mt":2.987,"t":{"Atlante FC":[-0.239,0.077],"Atlas FC":[0.04,0.178],"Atlético San Luis":[-0.013,0.014],"CD Guadalajara":[0.087,-0.308],"CD Toluca":[0.342,-0.161],"CF Monterrey":[0.247,-0.018],"CF Pachuca":[0.023,-0.073],"Club América":[0.343,-0.179],"Club León":[-0.135,0.03],"Club Necaxa":[-0.156,0.195],"Club Puebla":[-0.153,0.232],"Club Tijuana":[0.135,-0.008],"Cruz Azul":[0.345,-0.102],"FC Juárez":[-0.201,0.28],"Pumas UNAM":[-0.004,-0.037],"Querétaro FC":[-0.181,0.081],"Santos Laguna":[-0.116,0.015],"Tigres UANL":[-0.024,-0.23]}},"Ligue 1":{"mu":0.1748,"home":0.2073,"mt":2.849,"t":{"AJ Auxerre":[-0.03,0.038],"AS Monaco":[0.32,-0.108],"Angers":[-0.328,0.024],"LOSC Lille":[0.133,-0.405],"Le Havre":[-0.175,0.08],"Le Mans":[-0.027,0.222],"Lorient":[-0.035,-0.07],"Metz":[-0.212,0.3],"Nantes":[-0.297,-0.0],"OGC Nice":[0.08,-0.048],"Olympique Lyonnais":[0.279,-0.213],"Olympique de Marseille":[0.418,-0.078],"Paris FC":[0.177,-0.131],"Paris Saint-Germain":[0.598,-0.412],"RC Lens":[0.264,-0.248],"RC Strasbourg":[0.278,-0.012],"Red Star FC":[0.161,0.497],"Rodez AF":[-0.137,-0.085],"Saint-Étienne":[-0.15,0.331],"Stade Brestois":[0.15,0.029],"Stade Rennais":[0.324,0.048],"Toulouse":[0.069,-0.095],"Troyes":[-0.372,0.16]}},"MLS":{"mu":0.3055,"home":0.2384,"mt":3.268,"t":{"Atlanta United":[-0.188,0.067],"Austin FC":[-0.235,0.072],"CF Montréal":[-0.295,0.176],"Charlotte FC":[0.059,-0.135],"Chicago Fire":[0.14,0.058],"Colorado Rapids":[-0.106,0.029],"Columbus Crew":[0.103,-0.092],"DC United":[-0.284,0.178],"FC Cincinnati":[0.119,0.098],"FC Dallas":[0.064,0.015],"Houston Dynamo":[-0.197,-0.152],"Inter Miami CF":[0.436,0.032],"LA Galaxy":[0.049,0.099],"Los Angeles FC":[0.084,-0.255],"Minnesota United":[0.049,0.005],"Nashville SC":[0.103,-0.324],"New England Revolution":[-0.062,0.009],"New York City FC":[-0.07,-0.171],"New York Red Bulls":[-0.094,0.018],"Orlando City SC":[0.17,0.176],"Philadelphia Union":[0.146,-0.133],"Portland Timbers":[0.051,0.093],"Real Salt Lake":[-0.067,-0.037],"San Diego FC":[0.142,0.038],"San Jose Earthquakes":[0.03,0.122],"Seattle Sounders FC":[-0.075,-0.152],"Sporting Kansas City":[-0.153,0.36],"St.Louis City":[0.028,0.055],"Toronto FC":[-0.139,0.068],"Vancouver Whitecaps":[0.226,-0.279]}},"Portugal":{"mu":0.1007,"home":0.168,"mt":2.679,"t":{"AVS - Futebol SAD":[-0.296,0.266],"Académico Viseu FC":[0.263,-0.222],"Benfica":[0.69,-0.485],"CD Nacional":[-0.106,0.056],"CF Estrela Amadora":[-0.084,0.169],"CS Marítimo":[-0.103,0.365],"Casa Pia":[-0.2,0.108],"Estoril Praia":[0.146,0.172],"FC Alverca":[-0.009,0.006],"FC Arouca":[0.144,0.056],"FC Porto":[0.509,-0.668],"Famalicão":[0.082,-0.225],"Gil Vicente":[-0.053,-0.187],"Moreirense":[-0.028,0.037],"Rio Ave":[-0.074,0.195],"Santa Clara":[-0.057,-0.317],"Sporting Braga":[0.358,-0.237],"Sporting CP":[0.769,-0.428],"Tondela":[-0.296,0.127],"Torreense":[-0.585,0.007],"Vitória SC":[0.045,-0.113]}},"Premier":{"mu":0.2345,"home":0.1744,"mt":2.757,"t":{"Arsenal":[0.323,-0.661],"Aston Villa":[0.128,-0.091],"Bournemouth":[0.155,-0.095],"Brentford":[0.173,-0.069],"Brighton & Hove Albion":[0.221,-0.167],"Burnley":[-0.207,0.241],"Chelsea":[0.272,-0.05],"Coventry City":[-0.125,0.122],"Crystal Palace":[-0.067,0.021],"Everton":[-0.137,-0.212],"Fulham":[-0.034,-0.091],"Hull City":[-0.114,-0.217],"Ipswich Town":[-0.082,0.337],"Leeds United":[-0.046,-0.156],"Liverpool FC":[0.312,-0.19],"Manchester City":[0.429,-0.365],"Manchester United":[0.137,-0.057],"Newcastle United":[0.187,-0.002],"Nottingham Forest":[-0.035,-0.103],"Sunderland":[-0.205,-0.063],"Tottenham Hotspur":[0.055,0.036],"West Ham United":[-0.031,0.12],"Wolverhampton":[-0.244,0.143]}},"Saudi":{"mu":0.2425,"home":0.0973,"mt":3.0,"t":{"Abha":[-0.364,0.273],"Al Faisaly":[-0.132,0.185],"Al-Ahli":[0.48,-0.335],"Al-Ettifaq":[0.067,-0.067],"Al-Fateh":[-0.069,0.113],"Al-Fayha":[-0.123,0.03],"Al-Hazem":[-0.14,0.12],"Al-Hilal":[0.695,-0.484],"Al-Ittihad":[0.341,-0.146],"Al-Khaleej":[0.018,0.107],"Al-Kholood":[-0.02,0.218],"Al-Najma SC":[-0.268,0.34],"Al-Nassr":[0.649,-0.355],"Al-Okhdood":[-0.363,0.178],"Al-Qadsiah":[0.536,-0.398],"Al-Riyadh":[-0.208,0.145],"Al-Shabab":[0.191,-0.05],"Al-Taawoun":[-0.032,-0.128],"Damac FC":[-0.262,-0.038],"Diriyah":[-0.371,-0.298],"Neom SC":[0.017,-0.222]}},"Serie A":{"mu":0.17,"home":0.0935,"mt":2.668,"t":{"AC Milan":[0.292,-0.187],"AS Roma":[0.384,-0.35],"Atalanta":[0.294,-0.128],"Bologna":[0.133,-0.112],"Cagliari":[-0.125,0.077],"Como":[0.277,-0.329],"Cremonese":[-0.329,0.115],"Fiorentina":[0.112,0.021],"Frosinone":[0.395,0.167],"Genoa":[-0.115,-0.044],"Hellas Verona":[-0.399,0.15],"Inter":[0.626,-0.293],"Juventus":[0.196,-0.347],"Lazio":[0.173,-0.198],"Lecce":[-0.382,0.101],"Monza":[-0.068,0.361],"Parma":[-0.296,-0.02],"Pisa":[-0.492,0.329],"SSC Napoli":[0.223,-0.305],"Sassuolo":[0.067,0.234],"Torino":[-0.047,0.049],"Udinese":[-0.053,0.096],"Venezia":[-0.395,0.143]}}}};
  const LIGAS = [[17, "Premier"], [8, "LaLiga"], [23, "Serie A"], [35, "Bundesliga"], [34, "Ligue 1"], [11621, "Liga MX"], [242, "MLS"], [37, "Eredivisie"], [238, "Portugal"], [325, "Brasileirão"], [155, "Argentina"], [955, "Saudi"]];
  const STOP = new Set(["fc", "cf", "sc", "ac", "afc", "cd", "ud", "sd", "club", "de", "del", "la", "el", "the", "fk", "sk", "if", "bk", "as", "us", "ss", "rc", "cp", "ca", "sv", "vfb", "vfl", "tsg", "1", "04", "05", "fbc", "calcio", "sporting", "atletico", "athletic", "united", "city", "real", "deportivo", "town", "rovers", "county", "wanderers", "albion", "borough", "olympic", "sports", "youth", "academy", "women", "reserves", "ii", "u21", "u23"]);
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const toks = (s) => { const t = norm(s).split(" ").filter((x) => x.length >= 3 && !STOP.has(x)); return t.length ? t : norm(s).split(" ").filter((x) => x.length >= 3); };
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const sf = async (ruta) => { try { const r = await fetch("/api/v1/" + ruta); await espera(200); return r.ok ? await r.json() : null; } catch (e) { return null; } };
  const get = () => { try { const x = JSON.parse(localStorage.getItem("valPanel.ratings") || "null"); if (x && x.fecha > RATINGS0.fecha) return x; } catch (e) {} return RATINGS0; };
  const buscar = (liga, nombre) => {
    const t = liga.t; if (t[nombre]) return t[nombre];
    const n = norm(nombre); for (const k in t) if (norm(k) === n) return t[k];
    const A = toks(nombre); let mejor = null, nm = 0;
    for (const k in t) { const B = toks(k); const c = A.filter((x) => B.some((y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))))).length; if (c > nm) { nm = c; mejor = t[k]; } }
    return nm ? mejor : null;
  };
  // Goles esperados de un partido de liga: los dos equipos deben estar en la misma liga entrenada
  const MT0 = { "Liga MX": 2.8, MLS: 3.2, Bundesliga: 3.2, Eredivisie: 3.1, Saudi: 2.9, "Ligue 1": 2.8, Premier: 2.75, LaLiga: 2.7, "Serie A": 2.45, "Brasileirão": 2.4, Argentina: 2.1, Portugal: 2.6 };
  const lambdas = (local, visita) => {
    const R = get();
    for (const lig in R.ligas) {
      const L = R.ligas[lig], h = buscar(L, local), a = buscar(L, visita);
      if (!h || !a) continue;
      // Corrección de totales (2-nov): total = raíz(total del modelo × promedio de la liga) × 1.025, misma proporción local/visita
      const lL = Math.exp(L.mu + L.home + h[0] + a[1]), lV = Math.exp(L.mu + a[0] + h[1]), T = lL + lV;
      const f = Math.sqrt((L.mt || MT0[lig] || 2.7) / T) * Math.exp(0.025);
      return { liga: lig, fecha: R.fecha, lL: lL * f, lV: lV * f };
    }
    return null;
  };
  // Re-entrenar en el navegador con las 2 últimas temporadas de cada liga (~6-8 min)
  const ajustar = (partidos, ahora, xi = 0.0015, ridge = 1) => {
    const eq = [...new Set(partidos.flatMap((p) => [p.l, p.v]))], ix = Object.fromEntries(eq.map((t, i) => [t, i])), n = eq.length;
    const P = new Float64Array(2 * n + 2); P[2 * n + 1] = Math.log(1.3);
    const m = new Float64Array(P.length), v = new Float64Array(P.length), b1 = 0.9, b2 = 0.999, lr = 0.03;
    const W = partidos.map((p) => Math.exp(-xi * (ahora - p.t) / 864e5));
    for (let it = 1; it <= 1500; it++) {
      const g = new Float64Array(P.length);
      partidos.forEach((p, k) => {
        const h = ix[p.l], a = ix[p.v], w = W[k];
        const lh = Math.exp(P[2 * n + 1] + P[2 * n] + P[h] + P[n + a]), la = Math.exp(P[2 * n + 1] + P[a] + P[n + h]);
        const rh = w * (p.gl - lh), ra = w * (p.gv - la);
        g[h] += rh; g[a] += ra; g[n + a] += rh; g[n + h] += ra; g[2 * n] += rh; g[2 * n + 1] += rh + ra;
      });
      for (let i = 0; i < 2 * n; i++) g[i] -= 2 * ridge * P[i];
      for (let i = 0; i < P.length; i++) { m[i] = b1 * m[i] + (1 - b1) * g[i]; v[i] = b2 * v[i] + (1 - b2) * g[i] * g[i]; P[i] += lr * (m[i] / (1 - b1 ** it)) / (Math.sqrt(v[i] / (1 - b2 ** it)) + 1e-8); }
    }
    const act = new Set(partidos.filter((p) => ahora - p.t < 200 * 864e5).flatMap((p) => [p.l, p.v]));
    const t = {}; eq.forEach((e, i) => { if (act.has(e)) t[e] = [Math.round(P[i] * 1000) / 1000, Math.round(P[n + i] * 1000) / 1000]; });
    const u = partidos.filter((p) => ahora - p.t < 365 * 864e5), mt = u.length ? Math.round(1000 * u.reduce((s, p) => s + p.gl + p.gv, 0) / u.length) / 1000 : null;
    return { mu: Math.round(P[2 * n + 1] * 1e4) / 1e4, home: Math.round(P[2 * n] * 1e4) / 1e4, mt, t };
  };
  const actualizar = function () {
    window.__rat = { listo: false, paso: "inicio" };
    (async () => {
      const ahora = Date.now(), nuevas = {}, base = get();
      for (const [id, nom] of LIGAS) {
        window.__rat.paso = nom;
        const ss = ((await sf("unique-tournament/" + id + "/seasons")) || {}).seasons || [];
        const partidos = [], vistas = new Set();
        for (const se of ss.slice(0, 2)) {
          const rr = ((await sf("unique-tournament/" + id + "/season/" + se.id + "/rounds")) || {}).rounds || [];
          let evs = [];
          for (const r of rr) {
            const ruta = "unique-tournament/" + id + "/season/" + se.id + "/events/round/" + r.round + (r.slug ? "/slug/" + r.slug : "") + (r.prefix ? "/prefix/" + encodeURIComponent(r.prefix) : "");
            evs = evs.concat(((await sf(ruta)) || {}).events || []);
          }
          if (evs.length < 100) for (let pg = 0; pg < 40; pg++) { // ligas sin jornadas (MLS): partidos de la temporada por páginas
            const d = (await sf("unique-tournament/" + id + "/season/" + se.id + "/events/last/" + pg)) || {};
            evs = evs.concat(d.events || []); if (!d.hasNextPage) break;
          }
          {
            for (const e of evs) {
              if ((e.status || {}).type !== "finished" || vistas.has(e.id)) continue; vistas.add(e.id);
              const g = (x) => (x ? x.normaltime ?? x.current : null), gl = g(e.homeScore), gv = g(e.awayScore);
              if (gl == null || gv == null) continue;
              partidos.push({ l: e.homeTeam.name, v: e.awayTeam.name, gl, gv, t: e.startTimestamp * 1000 });
            }
          }
        }
        if (partidos.length >= 150) nuevas[nom] = ajustar(partidos, ahora);
        else if (base.ligas[nom]) nuevas[nom] = base.ligas[nom];
      }
      const R = { fecha: new Date(ahora).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }), xi: 0.0015, rho: -0.08, ligas: nuevas };
      try { localStorage.setItem("valPanel.ratings", JSON.stringify(R)); } catch (e) {}
      window.__rat = { listo: true, paso: "listo · " + Object.keys(nuevas).length + " ligas" };
    })().catch((e) => { window.__rat = { listo: true, paso: "ERROR: " + e.message }; });
    return "iniciado";
  };
  window.valRatings = { get, lambdas, actualizar, ajustar, fecha: () => get().fecha };
  return "ratings listo";
})();
  } catch (e) { console.error("valPanel ratings.js", e); }

  // ===== MODELO DE COPAS (v1.6) =====
  try {
(function () {
  // MODELO DE COPAS (v1.6, 3-nov-2026): un rating por equipo comparable entre ligas. Dixon-Coles con nivel de ataque y defensa de cada liga,
  // entrenado con Champions, Europa, Conference, Libertadores y Sudamericana + las ligas de esos equipos (3 temporadas, ~53 mil partidos).
  // Prueba fuera de muestra (1,537 partidos de copa): menos de la mitad de discrepancias con la casa que el modelo de promedios. No toca el modelo por liga.
  const CUPS = [[7, "Champions"], [679, "Europa League"], [17015, "Conference"], [384, "Libertadores"], [480, "Sudamericana"]];
  const COPA = Object.fromEntries(CUPS);
  const XI = 0.0015, RHO = -0.08, RIDGE_T = 1, RIDGE_L = 0.3, LR = 0.03;
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  let DB = null;
  const abrir = () => DB ? Promise.resolve(DB) : new Promise((res, rej) => { const r = indexedDB.open("valCopa", 1); r.onupgradeneeded = () => { r.result.createObjectStore("filas", { keyPath: "eid" }); r.result.createObjectStore("hechos"); }; r.onsuccess = () => { DB = r.result; res(DB); }; r.onerror = () => rej(r.error); });
  const tx = (st, modo, fn) => new Promise((res, rej) => { const t = DB.transaction(st, modo); fn(t.objectStore(st)); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  const guardar = (filas) => tx("filas", "readwrite", (s) => { filas.forEach((f) => s.put(f)); });
  const marcar = (k, v = 1) => tx("hechos", "readwrite", (s) => s.put(v, k));
  const hecho = (k) => new Promise((res) => { const r = DB.transaction("hechos").objectStore("hechos").get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); });
  const todas = (st) => new Promise((res) => { const r = DB.transaction(st).objectStore(st).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => res([]); });
  const est = () => (window.__copaUpd = window.__copaUpd || { listo: false, paso: "", llamadas: 0, fallas: 0 });
  const sf = async (ruta) => {
    for (let k = 0; k < 3; k++) {
      try { const r = await fetch("/api/v1/" + ruta); est().llamadas++; await espera(180);
        if (r.ok) return await r.json(); if (r.status === 404) return null; } catch (e) {}
      await espera(2500 * (k + 1));
    }
    est().fallas++; return null;
  };
  const g = (x) => (x ? x.normaltime ?? x.current : null);

  // Descarga incremental: la temporada actual siempre se vuelve a bajar; las anteriores solo si faltan. Si se corta, sigue donde iba.
  async function descargar(T = 3) {
    await abrir();
    const bajar = async (id, nom, tipo, pais) => {
      const ss = ((await sf("unique-tournament/" + id + "/seasons")) || {}).seasons || [];
      for (let si = 0; si < Math.min(T, ss.length); si++) {
        const se = ss[si], clave = tipo + "-" + id + "-" + se.id;
        if (si > 0 && (await hecho(clave))) continue;
        est().paso = (tipo === "copa" ? "copa " : "liga ") + nom + " " + (se.year || se.name);
        const filas = [];
        for (let pg = 0; pg < 60; pg++) {
          const d = (await sf("unique-tournament/" + id + "/season/" + se.id + "/events/last/" + pg)) || {};
          for (const e of d.events || []) {
            if ((e.status || {}).type !== "finished") continue;
            const gl = g(e.homeScore), gv = g(e.awayScore); if (gl == null || gv == null) continue;
            filas.push({ tipo, comp: nom.replace(/ \(\d+\/\d+\)$/, ""), comp_id: id, pais: pais || ((e.tournament || {}).category || {}).name || "", temporada: se.year || se.name, si,
              fecha: new Date(e.startTimestamp * 1000).toISOString().slice(0, 10), ts: e.startTimestamp, eid: e.id, hid: e.homeTeam.id, aid: e.awayTeam.id,
              local: e.homeTeam.name, visita: e.awayTeam.name, gl, gv, ronda: ((e.roundInfo || {}).name || (e.roundInfo || {}).round || ""), p1: "", pX: "", p2: "", pO25: "" });
          }
          if (!d.hasNextPage) break;
        }
        if (filas.length) await guardar(filas);
        await marcar(clave);
      }
    };
    for (const [id, nom] of CUPS) await bajar(id, nom, "copa", "");
    const filas = await todas("filas");
    const equipos = [...new Set(filas.filter((f) => f.tipo === "copa").flatMap((f) => [f.hid, f.aid]))];
    const eqLiga = {}, ligas = {};
    let k = 0;
    for (const t of equipos) {
      est().paso = "ligas de equipos " + (++k) + "/" + equipos.length;
      let v = await hecho("team-" + t);
      if (v === undefined) {
        const d = await sf("team/" + t); const p = d && d.team && d.team.primaryUniqueTournament;
        v = p && !COPA[p.id] ? [p.id, p.name, (p.category || {}).name || ""] : 0;
        await marcar("team-" + t, v);
      }
      if (v) { eqLiga[t] = v[0]; ligas[v[0]] = [v[1], v[2]]; }
    }
    await marcar("eqLiga", eqLiga);
    let j = 0; const nl = Object.keys(ligas).length;
    for (const id in ligas) { j++; await bajar(Number(id), ligas[id][0] + " (" + j + "/" + nl + ")", "liga", ligas[id][1]); }
    return eqLiga;
  }

  // Entrena con todo lo guardado (≈1 min). Liga: exp(mu_liga + local_liga + ataque + defensa rival).
  // Copa: exp(mu_copa + local_copa + ataque + nivel ataque de su liga + defensa rival + nivel defensa de la liga rival).
  function ajustarTodo(filas, eqLiga) {
    const rows0 = filas.filter((r) => r.gl !== "" && r.gv !== "" && r.gl != null && r.gv != null);
    const tIdx = new Map(), lIdx = new Map(), cIdx = new Map(), lPais = {};
    const ti = (t) => { if (!tIdx.has(t)) tIdx.set(t, tIdx.size); return tIdx.get(t); };
    const li = (l) => { const k = l === "" || l == null ? "none" : String(l); if (!lIdx.has(k)) lIdx.set(k, lIdx.size); return lIdx.get(k); };
    const ci = (c) => { if (!cIdx.has(c)) cIdx.set(c, cIdx.size); return cIdx.get(c); };
    for (const r of rows0) if (r.tipo === "liga") lPais[String(r.comp_id)] = r.pais;
    const R = rows0.map((r) => { const cup = r.tipo === "copa";
      return { cup, h: ti(r.hid), a: ti(r.aid), L: cup ? -1 : li(r.comp_id), Lh: li(cup ? eqLiga[r.hid] : r.comp_id), La: li(cup ? eqLiga[r.aid] : r.comp_id), c: cup ? ci(COPA[r.comp_id] || r.comp) : -1, gl: +r.gl, gv: +r.gv, ts: +r.ts, r }; });
    const nT = tIdx.size, nL = lIdx.size, nC = cIdx.size;
    const oA = 0, oD = nT, oMu = 2 * nT, oHo = oMu + nL, oLA = oHo + nL, oLD = oLA + nL, oMc = oLD + nL, oHc = oMc + nC, NP = oHc + nC;
    const P = new Float64Array(NP); for (let i = 0; i < nL; i++) { P[oMu + i] = Math.log(1.3); P[oHo + i] = 0.25; } for (let i = 0; i < nC; i++) { P[oMc + i] = Math.log(1.3); P[oHc + i] = 0.3; }
    const ahora = Date.now() / 1000, m = new Float64Array(NP), v = new Float64Array(NP), gr = new Float64Array(NP), b1 = 0.9, b2 = 0.999;
    const W = R.map((x) => Math.exp(-XI * (ahora - x.ts) / 86400));
    for (let it = 1; it <= 1500; it++) {
      gr.fill(0);
      for (let k = 0; k < R.length; k++) {
        const x = R[k], w = W[k]; let eh, ea;
        if (x.cup) { eh = P[oMc + x.c] + P[oHc + x.c] + P[oA + x.h] + P[oLA + x.Lh] + P[oD + x.a] + P[oLD + x.La]; ea = P[oMc + x.c] + P[oA + x.a] + P[oLA + x.La] + P[oD + x.h] + P[oLD + x.Lh]; }
        else { eh = P[oMu + x.L] + P[oHo + x.L] + P[oA + x.h] + P[oD + x.a]; ea = P[oMu + x.L] + P[oA + x.a] + P[oD + x.h]; }
        const rh = w * (x.gl - Math.exp(eh)), ra = w * (x.gv - Math.exp(ea));
        gr[oA + x.h] += rh; gr[oD + x.a] += rh; gr[oA + x.a] += ra; gr[oD + x.h] += ra;
        if (x.cup) { gr[oLA + x.Lh] += rh; gr[oLD + x.La] += rh; gr[oLA + x.La] += ra; gr[oLD + x.Lh] += ra; gr[oMc + x.c] += rh + ra; gr[oHc + x.c] += rh; }
        else { gr[oMu + x.L] += rh + ra; gr[oHo + x.L] += rh; }
      }
      for (let i = 0; i < 2 * nT; i++) gr[i] -= 2 * RIDGE_T * P[i];
      for (let i = oLA; i < oMc; i++) gr[i] -= 2 * RIDGE_L * P[i];
      for (let i = 0; i < NP; i++) { m[i] = b1 * m[i] + (1 - b1) * gr[i]; v[i] = b2 * v[i] + (1 - b2) * gr[i] * gr[i]; P[i] += LR * (m[i] / (1 - b1 ** it)) / (Math.sqrt(v[i] / (1 - b2 ** it)) + 1e-8); }
    }
    const ultLiga = {}; for (const x of R) if (!x.cup) { ultLiga[x.r.hid] = x.r.comp_id; ultLiga[x.r.aid] = x.r.comp_id; }
    const r3 = (x) => Math.round(x * 1000) / 1000;
    const eq = {}; for (const [t, i] of tIdx) eq[t] = [r3(P[oA + i]), r3(P[oD + i]), lIdx.get(String(eqLiga[t] ?? ultLiga[t] ?? "none")) ?? -1];
    const lKey = [...lIdx.keys()];
    const ligas = lKey.map((k, i) => ({ id: k, pais: lPais[k] || "", A: r3(P[oLA + i]), D: r3(P[oLD + i]) }));
    const copas = {}; [...cIdx.keys()].forEach((c, i) => (copas[c] = { mu: Math.round(P[oMc + i] * 1e4) / 1e4, home: Math.round(P[oHc + i] * 1e4) / 1e4 }));
    return { fecha: new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" }), xi: XI, rho: RHO, partidos: R.length, eq, ligas, copas };
  }
  const get = () => { try { const x = JSON.parse(localStorage.getItem("valPanel.ratingsCopa") || "null"); return x && x.eq ? x : null; } catch (e) { return null; } };
  // Goles esperados de un partido de copa por id de equipo (Sofascore) e id del torneo
  const lambdas = (hid, aid, ut) => {
    const R = get(); if (!R) return null;
    const c = R.copas[COPA[ut]], H = R.eq[hid], A = R.eq[aid]; if (!c || !H || !A) return null;
    const LH = R.ligas[H[2]] || { A: 0, D: 0 }, LA = R.ligas[A[2]] || { A: 0, D: 0 };
    return { copa: COPA[ut], fecha: R.fecha, lL: Math.exp(c.mu + c.home + H[0] + LH.A + A[1] + LA.D), lV: Math.exp(c.mu + A[0] + LA.A + H[1] + LH.D) };
  };
  const entrenar = async () => {
    await abrir();
    est().paso = "entrenando (~1 min)"; await espera(50);
    const eqLiga = (await hecho("eqLiga")) || {};
    const RC = ajustarTodo(await todas("filas"), eqLiga);
    localStorage.setItem("valPanel.ratingsCopa", JSON.stringify(RC));
    return RC;
  };
  const actualizar = function () {
    window.__copaUpd = { listo: false, paso: "inicio", llamadas: 0, fallas: 0 };
    (async () => { await descargar(3); const RC = await entrenar(); window.__copaUpd.listo = true; window.__copaUpd.paso = "listo · ratings al " + RC.fecha + " · " + Object.keys(RC.eq).length + " equipos"; })()
      .catch((e) => { window.__copaUpd.listo = true; window.__copaUpd.paso = "ERROR: " + e.message + " (vuelve a pulsar: sigue donde iba)"; });
    return "iniciado";
  };
  window.valCopa = { get, lambdas, actualizar, entrenar, ids: COPA, uefa: (ut) => [7, 679, 17015].includes(Number(ut)), fecha: () => (get() || {}).fecha || "sin ratings" };
  return "copas listo";
})();
  } catch (e) { console.error("valPanel copas.js", e); }

  // ===== CÓDIGO SOFA (estadísticas) =====
  try {
(function () {
  const PAUSA = 400, N = 10, NF = 5, NC = 5, PARTE = 1000;
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  let llamadas = 0;
  const cacheLiga = {};

  async function api(ruta) {
    llamadas++;
    try {
      const r = await fetch("/api/v1/" + ruta.replace(/^\//, ""));
      await espera(PAUSA);
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }
  const corto = (t) => (t && (t.shortName || t.name)) || "?";
  // v16: marcador a 90' (sin prórroga ni penales); en vivo no hay normaltime y se usa current
  const g = (e, lado) => { const s = e[lado + "Score"] || {}; return s.normaltime ?? s.current; };
  const fin = (e) => (e.status || {}).type === "finished";
  const prom = (v) => { v = v.filter((x) => x != null && !isNaN(x)); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "s/d"; };
  const hora = (ts) => new Date(ts * 1000).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const mes = (ts) => new Date(ts * 1000).toISOString().slice(0, 7);

  async function promLiga(ev) {
    const ut = (ev.tournament || {}).uniqueTournament || {}, se = ev.season || {};
    if (!ut.id || !se.id) return null;
    const k = ut.id + "-" + se.id;
    if (k in cacheLiga) return cacheLiga[k];
    let res = null;
    try {
      const r = await api(`unique-tournament/${ut.id}/season/${se.id}/standings/total`);
      // v16: solo tablas con goles válidos; usar la(s) de más equipos (tabla general, o todos los grupos si son del mismo tamaño).
      // Así no se suman "Anual" + fases + "Promedios" del descenso (Argentina salía 0.81).
      const tablas = ((r && r.standings) || []).filter((st) => (st.rows || []).length &&
        st.rows.every((x) => Number.isFinite(x.scoresFor) && Number.isFinite(x.matches)));
      const maxR = Math.max(0, ...tablas.map((st) => st.rows.length));
      let gf = 0, pj = 0, eq = 0;
      for (const st of tablas.filter((st) => st.rows.length === maxR))
        for (const row of st.rows) { gf += row.scoresFor; pj += row.matches; eq++; }
      if (pj > 0 && eq > 0) res = { prom: (gf / (pj / 2)).toFixed(2), pj: Math.round(pj / eq), temporada: se.name || se.year || "", nombre: ut.name || "" };
    } catch (e) { res = null; }
    cacheLiga[k] = res;
    return res;
  }

  function stat(est, ...claves) {
    claves = claves.map((c) => c.toLowerCase());
    for (const per of (est && est.statistics) || []) {
      if (per.period !== "ALL") continue;
      for (const grp of per.groups || [])
        for (const it of grp.statisticsItems || [])
          if (claves.includes((it.key || "").toLowerCase()) || claves.includes((it.name || "").toLowerCase())) {
            const h = it.homeValue ?? it.home, a = it.awayValue ?? it.away;
            return [h, a];
          }
    }
    return null;
  }

  function linea(e, tid) {
    const local = e.homeTeam.id === tid;
    const gf = local ? g(e, "home") : g(e, "away"), gc = local ? g(e, "away") : g(e, "home");
    if (gf == null || gc == null) return null;
    const res = gf > gc ? "G" : gf < gc ? "P" : "E";
    return { txt: `${res} ${gf}-${gc} ${local ? "vs" : "@"} ${corto(local ? e.awayTeam : e.homeTeam)}`, gf, gc };
  }

  async function ultimos(tid) {
    const r = await api(`team/${tid}/events/last/0`);
    return ((r && r.events) || []).filter(fin).sort((a, b) => b.startTimestamp - a.startTimestamp);
  }

  function forma(nombre, tid, evs, etq) {
    const ls = evs.slice(0, N).map((e) => linea(e, tid)).filter(Boolean);
    if (!ls.length) return `- ${nombre} ${etq}: s/d`;
    return `- ${nombre} ${etq}: ${ls.slice(0, NF).map((l) => l.txt).join(" · ")} | goles prom. (últ. ${ls.length}) ${prom(ls.map((l) => l.gf))} a favor, ${prom(ls.map((l) => l.gc))} en contra`;
  }

  // Liga propia del equipo (la competencia que más se repite en sus últimos partidos, sin contar la del partido)
  function ligaPropia(evs, utPartido) {
    const cuenta = {};
    for (const e of evs) {
      const u = ((e.tournament || {}).uniqueTournament || {}).id;
      if (u && u !== utPartido) cuenta[u] = (cuenta[u] || 0) + 1;
    }
    const top = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a])[0];
    return top ? evs.find((e) => String(((e.tournament || {}).uniqueTournament || {}).id) === top) : null;
  }

  async function corners(tid, evs) {
    // v1.3: de las mismas estadísticas saca también el xG (a favor y en contra)
    const af = [], ec = [], xf = [], xc = [];
    for (const e of evs.slice(0, NC)) {
      const est = await api(`event/${e.id}/statistics`);
      const loc = e.homeTeam.id === tid;
      const x = stat(est, "expectedGoals", "Expected goals");
      if (x) { const h = Number(x[0]), a = Number(x[1]); if (Number.isFinite(h) && Number.isFinite(a)) { xf.push(loc ? h : a); xc.push(loc ? a : h); } }
      const c = stat(est, "cornerKicks", "Corner kicks");
      if (!c) continue;
      const h = Number(c[0]), a = Number(c[1]);
      if (loc) { af.push(h); ec.push(a); } else { af.push(a); ec.push(h); }
    }
    return { af: prom(af), ec: prom(ec), n: af.length, lista: af, xf: xf.length ? (xf.reduce((a, b) => a + b, 0) / xf.length).toFixed(2) : "s/d", xc: xc.length ? (xc.reduce((a, b) => a + b, 0) / xc.length).toFixed(2) : "s/d", nx: xf.length };
  }

  async function resolver(entrada) {
    const m = String(entrada).match(/#id:(\d+)/) || String(entrada).trim().match(/^(\d+)$/);
    if (m) return Number(m[1]);
    const res = await api(`search/all?q=${encodeURIComponent(entrada)}&page=0`);
    const eq = ((res && res.results) || []).find((r) => r.type === "team" && ((r.entity.sport || {}).slug === "football"));
    if (!eq) return null;
    const last = ((await api(`team/${eq.entity.id}/events/last/0`)) || {}).events || [];
    const vivo = last.filter((e) => (e.status || {}).type === "inprogress");
    if (vivo.length) return vivo[vivo.length - 1].id;
    const sig = ((await api(`team/${eq.entity.id}/events/next/0`)) || {}).events || [];
    return sig.length ? sig[0].id : null;
  }

  async function partido(eid, modo) {
    const d = await api(`event/${eid}`);
    if (!d) return `## Partido ${eid}\n- No se pudo leer.\n`;
    const ev = d.event, H = ev.homeTeam, A = ev.awayTeam, tipo = (ev.status || {}).type;
    const out = [`## ${H.name} vs ${A.name} (${(ev.tournament || {}).name || ""} · ${hora(ev.startTimestamp)} CDMX) [id ${eid}]`];
    if (tipo !== "notstarted") {
      const st = ev.status || {}, t = ev.time || {};
      let min = "";
      if (tipo === "inprogress" && t.currentPeriodStartTimestamp)
        min = ` ~${(st.code === 7 ? 45 : 0) + Math.floor((Date.now() / 1000 - t.currentPeriodStartTimestamp) / 60) + 1}'`;
      out.push(`- Estado: ${st.description || ""}${min} | Marcador ${g(ev, "home")}-${g(ev, "away")}`);
    }
    if (modo === "previo") {
      const pl = await promLiga(ev);
      out.push(pl ? `- Liga (temporada actual ${pl.temporada}): ${pl.prom} goles/partido · ~${pl.pj} partidos por equipo` : `- Liga (temporada actual): s/d → usar tabla base`);
      // v1.4: árbitro y sus promedios de tarjetas (todas las competencias que registra Sofascore)
      const rf = ev.referee;
      if (rf && rf.games) out.push(`- Árbitro: ${rf.name} · ${(rf.yellowCards / rf.games).toFixed(2)} amarillas y ${((rf.redCards + (rf.yellowRedCards || 0)) / rf.games).toFixed(2)} rojas por partido (${rf.games} partidos)`);
      else out.push(`- Árbitro: s/d`);
    }
    const utP = ((ev.tournament || {}).uniqueTournament || {}).id;
    const pf = await api(`event/${eid}/pregame-form`);
    if (pf) {
      const ph = pf.homeTeam || {}, pa = pf.awayTeam || {};
      out.push(`- Tabla/forma Sofascore: ${corto(H)} ${ph.position ?? "?"}° (${(ph.form || []).join("")}) · ${corto(A)} ${pa.position ?? "?"}° (${(pa.form || []).join("")})`);
    }
    const tH = await ultimos(H.id), tA = await ultimos(A.id);
    const locH = tH.filter((e) => e.homeTeam.id === H.id), visA = tA.filter((e) => e.awayTeam.id === A.id);
    out.push(forma(corto(H), H.id, tH, "últimos"), forma(corto(A), A.id, tA, "últimos"),
             forma(corto(H), H.id, locH, "de local"), forma(corto(A), A.id, visA, "de visita"));

    // Copas: si el partido no es de la liga propia de algún equipo, dar sus números en su liga
    if (modo === "previo") {
      for (const [T, evs, lado] of [[H, tH, "local"], [A, tA, "visita"]]) {
        const evL = ligaPropia(evs, utP);
        const utL = evL && ((evL.tournament || {}).uniqueTournament || {}).id;
        const cuentaP = evs.filter((e) => ((e.tournament || {}).uniqueTournament || {}).id === utP).length;
        if (!evL || cuentaP > evs.filter((e) => ((e.tournament || {}).uniqueTournament || {}).id === utL).length) continue;
        const pl2 = await promLiga(evL);
        const enLiga = evs.filter((e) => ((e.tournament || {}).uniqueTournament || {}).id === utL);
        const lado2 = enLiga.filter((e) => (lado === "local" ? e.homeTeam.id : e.awayTeam.id) === T.id);
        out.push(`- [Copa] ${corto(T)} en su liga ${pl2 ? pl2.nombre + " (" + pl2.prom + " goles/partido)" : "(prom. s/d)"}:`);
        out.push(forma(corto(T), T.id, lado2, `de ${lado} en su liga`).replace(/^- /, "  - "));
      }
    }

    const rs = (await api(`event/${eid}/team-streaks`)) || {};
    const quien = { home: corto(H), away: corto(A), both: "Ambos" };
    const fmt = (l) => l.map((s) => `${quien[s.team] || s.team}: ${s.name} (${s.value})`).join(" · ");
    if ((rs.general || []).length) out.push(`- Rachas equipos: ${fmt(rs.general)}`);
    if ((rs.head2head || []).length) out.push(`- Rachas H2H: ${fmt(rs.head2head)}`);

    const duel = ((await api(`event/${eid}/h2h`)) || {}).teamDuel;
    if (duel) out.push(`- H2H total: ${corto(H)} ${duel.homeWins} · Empates ${duel.draws} · ${corto(A)} ${duel.awayWins}`);
    if (ev.customId) {
      const h2h = (((await api(`event/${ev.customId}/h2h/events`)) || {}).events || []).filter(fin)
        .sort((a, b) => b.startTimestamp - a.startTimestamp).slice(0, 10);
      if (h2h.length) {
        const tot = h2h.filter((e) => g(e, "home") != null && g(e, "away") != null).map((e) => g(e, "home") + g(e, "away"));
        const ambos = h2h.filter((e) => g(e, "home") > 0 && g(e, "away") > 0).length;
        out.push(`- Últimos ${h2h.length} H2H (a 90'): ${h2h.map((e) => `${mes(e.startTimestamp)} ${corto(e.homeTeam)} ${g(e, "home")}-${g(e, "away")} ${corto(e.awayTeam)}`).join(" · ")}`
          + ` | goles prom. ${prom(tot)}, Over 1.5 ${tot.filter((t) => t >= 2).length}/${tot.length}, Over 2.5 ${tot.filter((t) => t >= 3).length}/${tot.length}, BTTS ${ambos}/${tot.length}`);
      }
    }
    if (modo === "previo") {
      const cH = await corners(H.id, locH), cA = await corners(A.id, visA);
      out.push(`- Córners ${corto(H)} de local (últ. ${cH.n}): ${cH.af} a favor, ${cH.ec} en contra [${cH.lista.join(", ")}]`);
      out.push(`- Córners ${corto(A)} de visita (últ. ${cA.n}): ${cA.af} a favor, ${cA.ec} en contra [${cA.lista.join(", ")}]`);
      out.push(`- xG ${corto(H)} de local (últ. ${cH.nx}): ${cH.xf} a favor, ${cH.xc} en contra · xG ${corto(A)} de visita (últ. ${cA.nx}): ${cA.xf} a favor, ${cA.xc} en contra`);
      // v1.6: en copas, modelo de copas (ratings comparables entre ligas); en liga, modelo entrenado por liga (v1.5)
      const nomCopa = window.valCopa && window.valCopa.ids[utP];
      if (nomCopa) {
        const rc = window.valCopa.lambdas(H.id, A.id, utP);
        out.push(rc ? `- Modelo copa (${nomCopa}, ratings al ${rc.fecha}): goles esperados ${corto(H)} ${rc.lL.toFixed(2)} · ${corto(A)} ${rc.lV.toFixed(2)} → total ${(rc.lL + rc.lV).toFixed(2)}` : `- Modelo copa: s/d (equipo sin datos o falta pulsar "Actualizar modelo de copas") → usar el modelo de promedios`);
      } else {
        const rl = window.valRatings && window.valRatings.lambdas(H.name, A.name);
        out.push(rl ? `- Modelo entrenado (${rl.liga}, ratings al ${rl.fecha}): goles esperados ${corto(H)} ${rl.lL.toFixed(2)} · ${corto(A)} ${rl.lV.toFixed(2)} → total ${(rl.lL + rl.lV).toFixed(2)}` : `- Modelo entrenado: s/d (liga sin ratings o equipo nuevo) → usar el modelo de promedios`);
      }
    }
    if (tipo === "inprogress" || tipo === "finished") {
      const est = await api(`event/${eid}/statistics`);
      const items = [["Posesión", "ballPossession", "Ball possession"], ["xG", "expectedGoals", "Expected goals"],
        ["Grandes ocasiones", "bigChanceCreated", "Big chances"], ["Tiros totales", "totalShotsOnGoal", "Total shots"],
        ["Tiros a puerta", "shotsOnGoal", "Shots on target"], ["Córners", "cornerKicks", "Corner kicks"], ["Tarjetas rojas", "redCards", "Red cards"]];
      const f = items.map(([n, ...c]) => { const v = stat(est, ...c); return v ? `${n} ${v[0]}-${v[1]}` : null; }).filter(Boolean);
      out.push(`- Estadísticas del partido: ${f.length ? f.join(" · ") : "s/d"}`);
    }
    return out.join("\n") + "\n";
  }

  window.sofaIniciar = function (modo, entradas) {
    window.__sofa = { listo: false, texto: "" };
    llamadas = 0;
    (async () => {
      const secs = [];
      for (const en of entradas.slice(0, 20)) {
        try {
          const id = await resolver(en);
          secs.push(id ? await partido(id, modo) : `## ${en}\n- No encontrado en Sofascore.\n`);
        } catch (e) { secs.push(`## ${en}\n- Error: ${e}\n`); }
      }
      window.__sofa = { listo: true, texto: `# Datos Sofascore — modo ${modo} — llamadas: ${llamadas}\n\n` + secs.join("\n") };
    })();
    return "iniciado";
  };
  // v16: leer el texto por partes (javascript_tool corta respuestas largas)
  window.sofaParte = function (i) {
    const t = (window.__sofa || {}).texto || "", n = Math.max(1, Math.ceil(t.length / PARTE));
    if (!(window.__sofa || {}).listo) return "todavía no está listo";
    return `[parte ${i + 1}/${n}]\n` + t.slice(i * PARTE, (i + 1) * PARTE);
  };
  return "sofa listo";
})();
  } catch (e) { console.error("valPanel sofa.js", e); }

  // ===== CÓDIGO PLAYDOIT (cuotas) =====
  try {
(function () {
  const B = "https://sb2frontend-altenar2.biahosted.com/api/widget/";
  const Q = "culture=es-ES&timezoneOffset=360&integration=playdoit2&deviceType=1&numFormat=en-GB&countryCode=MX";
  const PARTE = 1000;
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const limpia = (s) => String(s).replace(/[&=?]/g, " ").replace(/\s+/g, " ").trim();
  const hora = (iso) => new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const get = async (ruta) => { try { const r = await fetch(B + ruta + (ruta.includes("?") ? "&" : "?") + Q); return r.ok ? await r.json() : null; } catch (e) { return null; } };

  // Mercados que usa el skill (typeId de Altenar/Playdoit)
  const MK = { 1: "1X2", 10: "Doble oportunidad", 11: "Empate no válido (en Playdoit: Empate No Acción)", 18: "Total goles", 29: "Ambos anotan",
    19: "Goles local", 20: "Goles visitante", 37: "Ganador y total", 16: "Hándicap asiático",
    166: "Córners totales", 167: "Córners local", 168: "Córners visitante", 139: "Tarjetas totales", 20140: "Gana con PA" };
  // Líneas que interesan por mercado (las demás se omiten para gastar poco)
  const LINEAS = { 18: /de (1\.5|2\.5|3\.5)$/, 19: /de (0\.5|1\.5)$/, 20: /de (0\.5|1\.5)$/, 37: /ás de 1\.5$/,
    166: /de (7\.5|8\.5|9\.5|10\.5|11\.5)$/, 167: /de (3\.5|4\.5|5\.5)$/, 168: /de (3\.5|4\.5|5\.5)$/, 139: /de (2\.5|3\.5|4\.5|5\.5|6\.5)$/ };

  function precios(m, O, tipo) {
    const ids = [...(m.desktopOddIds || []).flat(), ...(m.oddIds || [])];
    const vistos = new Set(); const out = [];
    for (const i of ids) {
      const o = O[i]; if (!o || vistos.has(o.name) || o.oddStatus !== 0) continue;
      if (LINEAS[tipo] && !LINEAS[tipo].test(o.name.trim())) continue;
      vistos.add(o.name); out.push(limpia(o.name) + " " + Number(o.price).toFixed(2));
    }
    return out;
  }

  function lineaAH(ms, O, local) {
    // Hándicap asiático: la línea más pareja (cuotas más cercanas entre sí), local (h) contra visitante (-h)
    const L = {}, V = {}; const loc = norm(local);
    for (const m of ms) for (const i of [...(m.desktopOddIds || []).flat(), ...(m.oddIds || [])]) {
      const o = O[i]; if (!o || o.oddStatus !== 0) continue;
      const x = String(o.name).match(/\(([+-]?[\d.]+)\)\s*$/); if (!x) continue;
      const h = Number(x[1]); (norm(o.name).startsWith(loc) ? L : V)[h] = o.price;
    }
    let mejor = null;
    for (const h of Object.keys(L)) {
      const v = V[-Number(h)]; if (v == null) continue;
      const d = Math.abs(L[h] - v);
      if (!mejor || d < mejor.d) mejor = { d, txt: "Local (" + (Number(h) > 0 ? "+" : "") + Number(h) + ") " + L[h].toFixed(2) + " / Visitante (" + (-Number(h) > 0 ? "+" : "") + (-Number(h)) + ") " + v.toFixed(2) };
    }
    return mejor ? [mejor.txt] : [];
  }

  window.playIniciar = function (entradas, dias = 2) {
    window.__play = { listo: false, texto: "" };
    (async () => {
      const lista = await get("GetEvents?eventCount=0&sportId=66&champIds=0");
      if (!lista) { window.__play = { listo: true, texto: "ERROR: no se pudo leer la lista de partidos de Playdoit" }; return; }
      const champs = Object.fromEntries((lista.champs || []).map((c) => [c.id, c.name]));
      const pa = {}; const O0 = Object.fromEntries((lista.odds || []).map((o) => [o.id, o]));
      for (const m of lista.markets || []) if (m.typeId === 20140) pa[m.id] = m;
      const limite = Date.now() + dias * 86400000;
      const eventos = (lista.events || []).filter((e) => new Date(e.startDate).getTime() < limite);
      const secs = [];
      for (const en of entradas.slice(0, 25)) {
        const partes = String(en).split(/ vs\.? /i).map(norm);
        const ev = eventos.find((e) => partes.every((p) => norm(e.name).includes(p)))
          || eventos.find((e) => norm(e.name).includes(partes[0]));
        if (!ev) { secs.push("## " + limpia(en) + "\n- No encontrado en Playdoit (próximos " + dias + " días)\n"); continue; }
        const d = await get("GetEventDetails?eventId=" + ev.id); await espera(300);
        const out = ["## " + limpia(ev.name) + " (" + limpia(champs[ev.champId] || "") + " · " + hora(ev.startDate) + " CDMX) [Playdoit " + ev.id + "]"];
        if (!d) { out.push("- Sin detalle de mercados"); secs.push(out.join("\n") + "\n"); continue; }
        const O = Object.fromEntries((d.odds || []).map((o) => [o.id, o]));
        const porTipo = {};
        for (const m of d.markets || []) if (MK[m.typeId]) (porTipo[m.typeId] = porTipo[m.typeId] || []).push(m);
        for (const t of [1, 10, 11, 18, 29, 19, 20, 37, 16, 166, 167, 168, 139]) {
          if (!porTipo[t]) continue;
          const ps = t === 16 ? lineaAH(porTipo[t], O, String(ev.name).split(/ vs\.? /i)[0]) : [...new Set(porTipo[t].flatMap((m) => precios(m, O, t)))];
          if (ps.length) out.push("- " + MK[t] + ": " + ps.join(" · "));
        }
        const mPA = (ev.marketIds || []).map((i) => pa[i]).find(Boolean);
        if (mPA) out.push("- Gana con PA: " + mPA.oddIds.map((i) => O0[i]).filter(Boolean).map((o) => limpia(o.name) + " " + o.price.toFixed(2)).join(" · "));
        secs.push(out.join("\n") + "\n");
      }
      window.__play = { listo: true, texto: "# Cuotas Playdoit (decimales)\n\n" + secs.join("\n") };
    })();
    return "iniciado";
  };
  // v16: leer el texto por partes (javascript_tool corta respuestas largas)
  window.playParte = function (i) {
    const t = (window.__play || {}).texto || "", n = Math.max(1, Math.ceil(t.length / PARTE));
    if (!(window.__play || {}).listo) return "todavía no está listo";
    return `[parte ${i + 1}/${n}]\n` + t.slice(i * PARTE, (i + 1) * PARTE);
  };
  return "playdoit listo";
})();
  } catch (e) { console.error("valPanel play.js", e); }

  // ===== ESCÁNER DE MOMIOS =====
  try {
(function () {
  // ESCÁNER DE MOMIOS v3: corre en una pestaña de sofascore.com. Lee Playdoit (Altenar) y bet365 (vía Sofascore).
  const B = "https://sb2frontend-altenar2.biahosted.com/api/widget/";
  const Q = "culture=es-ES&timezoneOffset=360&integration=playdoit2&deviceType=1&numFormat=en-GB&countryCode=MX";
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const limpia = (s) => String(s).replace(/[&=?]/g, " ");
  const jget = async (u) => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch (e) { return null; } };
  const pd = (ruta) => jget(B + ruta + (ruta.includes("?") ? "&" : "?") + Q);
  const sf = async (ruta) => { const x = await jget("/api/v1/" + ruta); await espera(250); return x; };
  const dec = (f) => { const [a, b] = String(f).split("/").map(Number); return b ? a / b + 1 : NaN; };
  const hora = (ms) => new Date(ms).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const fechaMX = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  const STOP = new Set(["fc", "cf", "sc", "ac", "afc", "cd", "ud", "sd", "club", "de", "del", "la", "el", "the", "fk", "sk", "if", "bk", "as", "us", "ss", "rc", "cp", "ca", "sv", "vfb", "vfl", "tsg", "1", "04", "05", "fbc", "calcio", "sporting", "atletico", "athletic", "united", "city", "real", "deportivo", "town", "rovers", "county", "wanderers", "albion", "borough", "olympic", "sports", "youth", "academy", "women", "reserves", "ii", "u21", "u23"]);
  const ALIAS = { psg: "paris saint germain", "man utd": "manchester united", "man city": "manchester city", inter: "internazionale", spurs: "tottenham" };
  const norm0 = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const norm = (s) => { const n = norm0(s); return ALIAS[n] || n; };
  const toks = (s) => { const t = norm(s).split(" ").filter((x) => x.length >= 3 && !STOP.has(x)); return t.length ? t : norm(s).split(" ").filter((x) => x.length >= 3); };
  const igual = (a, b) => { const A = toks(a), Bt = toks(b); return A.some((x) => Bt.some((y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))))); };
  const ids = (m) => [...(m.desktopOddIds || []).flat(), ...(m.oddIds || [])];
  const OU = /^(Más|Menos) de ([\d.]+)$/;

  window.escParte = (i) => { const t = (window.__esc || {}).texto || ""; const n = Math.max(1, Math.ceil(t.length / 950)); return "[parte " + (i + 1) + "/" + n + "] " + t.slice(i * 950, (i + 1) * 950); };

  // Lee líneas Más/Menos de un conjunto de mercados: { "9.5": { o: 1.80, u: 2.00 } }
  function lineas(ms, O) {
    const L = {};
    for (const m of ms) for (const i of ids(m)) {
      const o = O[i]; if (!o || o.oddStatus !== 0) continue;
      const x = String(o.name).trim().match(OU); if (!x) continue;
      const k = x[2]; L[k] = L[k] || {};
      const lado = x[1] === "Más" ? "o" : "u"; if (L[k][lado] == null) L[k][lado] = o.price;
    }
    return L;
  }
  // Errores de escalera: una línea más difícil que paga menos, o Más + Menos que suman menos de 100 %
  let maxC = 2.2; // v1.1: solo errores factibles (la cuota que se apuesta, como máximo esta)
  function escalera(L, etq, out, tag) {
    const ks = Object.keys(L).map(Number).sort((a, b) => a - b);
    for (let i = 0; i < ks.length; i++) {
      const a = L[String(ks[i])];
      if (a.o && a.u && 1 / a.o + 1 / a.u < 0.995) out.push([95, tag + " · " + etq + " " + ks[i] + ": Más @" + a.o + " + Menos @" + a.u + " suman " + Math.round(100 / a.o + 100 / a.u) + "% (menos de 100 %)"]);
      for (let j = i + 1; j < ks.length; j++) {
        const b = L[String(ks[j])];
        if (a.o && b.o && a.o > b.o + 0.01 && a.o <= maxC) out.push([90, tag + " · " + etq + ": Más de " + ks[i] + " @" + a.o + " paga más que Más de " + ks[j] + " @" + b.o]);
        if (a.u && b.u && b.u > a.u + 0.01 && b.u <= maxC) out.push([90, tag + " · " + etq + ": Menos de " + ks[j] + " @" + b.u + " paga más que Menos de " + ks[i] + " @" + a.u]);
      }
    }
  }

  // dia: "hoy" (por defecto), "mañana" o una fecha "AAAA-MM-DD". Revisa ese día completo en hora CDMX (UTC-6).
  window.escIniciar = function (dia = "hoy", umbral = 7, minFacil = -4, minProb = 60, maxCuota = 2.2) {
    maxC = maxCuota;
    window.__esc = { listo: false, paso: "inicio", texto: "" };
    (async () => {
      const dn = norm0(dia);
      const f = dn === "hoy" ? fechaMX(Date.now()) : (dn === "manana" ? fechaMX(Date.now() + 86400000) : String(dia).trim());
      const inicio = Date.parse(f + "T00:00:00-06:00");
      if (isNaN(inicio)) { window.__esc = { listo: true, texto: "ERROR: día no válido (usar hoy, mañana o AAAA-MM-DD)" }; return; }
      const ahora = Math.max(Date.now(), inicio), limite = inicio + 86400000;
      if (ahora >= limite) { window.__esc = { listo: true, texto: "Ese día ya terminó" }; return; }
      // 1) Playdoit: lista de partidos del día con mercados principales
      const L = await pd("GetEvents?eventCount=0&sportId=66&champIds=0");
      if (!L) { window.__esc = { listo: true, texto: "ERROR: no se pudo leer Playdoit" }; return; }
      const O0 = {}, M0 = {}, champs = {};
      L.odds.forEach((o) => (O0[o.id] = o)); L.markets.forEach((m) => (M0[m.id] = m)); (L.champs || []).forEach((c) => (champs[c.id] = c.name));
      const evs = L.events.filter((e) => { const t = new Date(e.startDate).getTime(); return t > ahora && t < limite; });
      const precio = (e, tipo, oddTipo) => { for (const i of e.marketIds) { const m = M0[i]; if (!m || m.typeId !== tipo) continue; for (const j of m.oddIds) { const o = O0[j]; if (o && o.typeId === oddTipo && o.oddStatus === 0) return o.price; } } return null; };
      // 2) Sofascore: partidos del día (para emparejar con bet365)
      window.__esc.paso = "sofascore torneos";
      const sfEvs = [], vistosSf = new Set();
      const st = await sf("sport/football/scheduled-tournaments/" + f + "/page/1");
      const uts = [...new Set(((st && st.scheduled) || []).map((x) => (x.tournament.uniqueTournament || {}).id).filter(Boolean))].slice(0, 100);
      for (const u of uts) {
        const r = await sf("unique-tournament/" + u + "/scheduled-events/" + f);
        for (const e of (r && r.events) || []) if (e.status && e.status.type === "notstarted" && !vistosSf.has(e.id)) { vistosSf.add(e.id); sfEvs.push(e); }
      }
      // 3) Cada partido de Playdoit: errores internos (todos) y comparación con bet365 (los emparejados)
      const internos = [], valor = [], faciles = [];
      let comparados = 0, k = 0;
      for (const e of evs) {
        window.__esc.paso = "partido " + (++k) + "/" + evs.length;
        const t0 = new Date(e.startDate).getTime();
        const [loc, vis] = String(e.name).split(/ vs\.? /i);
        const tag = limpia(e.name) + " (" + limpia(champs[e.champId] || "") + " · " + hora(t0) + ")";
        // 3a) Mercados principales (1X2, doble oportunidad, Empate No Acción, Gana con PA)
        const p1 = precio(e, 1, 1), pX = precio(e, 1, 2), p2 = precio(e, 1, 3);
        const d1X = precio(e, 10, 9), d12 = precio(e, 10, 10), dX2 = precio(e, 10, 11);
        const n1 = precio(e, 11, 1), n2 = precio(e, 11, 3), pa1 = precio(e, 20140, 1), pa2 = precio(e, 20140, 3);
        if (p1 && pX && p2) {
          const s = 1 / p1 + 1 / pX + 1 / p2;
          if (s < 1) internos.push([99, tag + " · 1X2 suma " + (s * 100).toFixed(1) + "% (sin margen o arbitraje): " + p1 + "/" + pX + "/" + p2]);
          const f1 = 1 / p1 / s, fX = 1 / pX / s, f2 = 1 / p2 / s;
          const chk = (cond, c, txt) => cond && c <= maxC && internos.push([99, tag + " · " + txt]);
          chk(d1X && d1X > p1, d1X, "Doble oport. 1X @" + d1X + " paga más que " + limpia(loc) + " gana @" + p1);
          chk(dX2 && dX2 > p2, dX2, "Doble oport. X2 @" + dX2 + " paga más que " + limpia(vis) + " gana @" + p2);
          chk(n1 && n1 > p1, n1, "Empate No Acción " + limpia(loc) + " @" + n1 + " paga más que el 1X2 @" + p1);
          chk(n2 && n2 > p2, n2, "Empate No Acción " + limpia(vis) + " @" + n2 + " paga más que el 1X2 @" + p2);
          chk(pa1 && pa1 > p1 * 1.02, pa1, "Gana con PA " + limpia(loc) + " @" + pa1 + " paga más que el 1X2 @" + p1);
          chk(pa2 && pa2 > p2 * 1.02, pa2, "Gana con PA " + limpia(vis) + " @" + pa2 + " paga más que el 1X2 @" + p2);
          for (const [c, fp, n] of [[d1X, f1 + fX, "1X"], [dX2, fX + f2, "X2"], [d12, f1 + f2, "12"], [n1, f1 / (f1 + f2), "Empate No Acción " + limpia(loc)], [n2, f2 / (f1 + f2), "Empate No Acción " + limpia(vis)]]) {
            const g = c ? c * fp - 1 : -1; if (g * 100 >= umbral + 3 && c <= maxC) internos.push([g * 100, tag + " · " + n + " @" + c + " vs su propio 1X2 (justa " + (1 / fp).toFixed(2) + ") +" + (g * 100).toFixed(0) + "%"]);
          }
        }
        // 3b) Detalle del partido: goles, córners, tarjetas y jugadores
        const d = await pd("GetEventDetails?eventId=" + e.id); await espera(150);
        if (!d) continue;
        const O = {}; (d.odds || []).forEach((o) => (O[o.id] = o));
        const C = {}; (d.childMarkets || []).forEach((m) => (C[m.id] = m));
        const porTipo = {}; for (const m of d.markets || []) (porTipo[m.typeId] = porTipo[m.typeId] || []).push(m);
        const LL = (t) => lineas(porTipo[t] || [], O);
        const goles = LL(18), corT = LL(166), corL = LL(167), corV = LL(168), cor1 = LL(177), tarj = LL(139);
        escalera(goles, "Total de goles", internos, tag);
        escalera(LL(19), "Goles de " + limpia(loc), internos, tag);
        escalera(LL(20), "Goles de " + limpia(vis), internos, tag);
        escalera(corT, "Córners totales", internos, tag);
        escalera(corL, "Córners de " + limpia(loc), internos, tag);
        escalera(corV, "Córners de " + limpia(vis), internos, tag);
        escalera(cor1, "Córners 1ª mitad", internos, tag);
        escalera(tarj, "Tarjetas", internos, tag);
        for (const ln in corT) {
          const tot = corT[ln].o; if (!tot) continue;
          if (tot > maxC) continue;
          if (cor1[ln] && cor1[ln].o && cor1[ln].o < tot - 0.01) internos.push([90, tag + " · Córners: Más de " + ln + " en el partido @" + tot + " paga más que Más de " + ln + " en la 1ª mitad @" + cor1[ln].o]);
          for (const [eq, nm] of [[corL, loc], [corV, vis]]) if (eq[ln] && eq[ln].o && eq[ln].o < tot - 0.01) internos.push([90, tag + " · Córners: Más de " + ln + " del partido @" + tot + " paga más que Más de " + ln + " solo de " + limpia(nm) + " @" + eq[ln].o]);
        }
        // Jugadores: remates a puerta (escalera) y contra su cuota de goleador
        const hijos = (t) => (porTipo[t] || []).flatMap((m) => (m.childMarketIds || []).map((i) => C[i]).filter(Boolean));
        const pid = (m) => (String(m.sv || "").match(/player:(\d+)/) || [])[1];
        const nombre = (m) => limpia(String(m.name).split(" - ").slice(1).join(" - ") || m.name);
        const anota = {};
        for (const h of hijos(21001)) {
          const os = ids(h).map((i) => O[i]).filter((o) => o && o.oddStatus === 0);
          const cual = (os.find((o) => /^cualq/i.test(o.name)) || {}).price, pri = (os.find((o) => /^primer/i.test(o.name)) || {}).price, ult = (os.find((o) => /^[uú]lt/i.test(o.name)) || {}).price;
          if (cual) anota[pid(h)] = cual;
          if (cual && pri && cual > pri + 0.01 && cual <= maxC) internos.push([90, tag + " · Goleador " + nombre(h) + ": en cualquier momento @" + cual + " paga más que primer gol @" + pri]);
          if (cual && ult && cual > ult + 0.01 && cual <= maxC) internos.push([90, tag + " · Goleador " + nombre(h) + ": en cualquier momento @" + cual + " paga más que último gol @" + ult]);
        }
        for (const h of hijos(15734)) {
          const Lj = lineas([h], O);
          escalera(Lj, "Remates a puerta " + nombre(h), internos, tag);
          const r05 = (Lj["0.5"] || {}).o, g = anota[pid(h)];
          if (r05 && g && r05 > g + 0.01 && r05 <= maxC) internos.push([95, tag + " · " + nombre(h) + ": remate a puerta Más de 0.5 @" + r05 + " paga más que anotar @" + g + " (para anotar casi siempre hay que rematar a puerta)"]);
        }
        // 3c) Contra bet365 sin margen (si el partido está en Sofascore)
        const dt = (x) => Math.abs(x.startTimestamp * 1000 - t0);
        const s = sfEvs.find((x) => dt(x) < 3 * 3600000 && igual(loc, x.homeTeam.name) && igual(vis, x.awayTeam.name))
          || sfEvs.find((x) => dt(x) <= 20 * 60000 && (igual(loc, x.homeTeam.name) || igual(vis, x.awayTeam.name)));
        if (!s) continue;
        const so = await sf("event/" + s.id + "/odds/1/all");
        if (!so || !so.markets) continue;
        comparados++;
        const mk = (id) => so.markets.find((m) => m.marketId === id && !m.suspended);
        const justa = (m) => { const p = m.choices.map((c) => 1 / dec(c.fractionalValue)); const s2 = p.reduce((x, y) => x + y, 0); return Object.fromEntries(m.choices.map((c, i) => [c.name, p[i] / s2])); };
        const ref = {};
        const ft = mk(1); if (ft) { const j = justa(ft); ref["1"] = j["1"]; ref["X"] = j["X"]; ref["2"] = j["2"]; }
        // v1.2: si el 1X2 de Playdoit y el de bet365 no se parecen, es otro partido mal emparejado: no comparar
        if (p1 && pX && p2 && ref["1"]) { const s3 = 1 / p1 + 1 / pX + 1 / p2; if (Math.abs(1 / p1 / s3 - ref["1"]) > 0.15 || Math.abs(1 / p2 / s3 - ref["2"]) > 0.15) { comparados--; continue; } }
        const bt = mk(5); if (bt) { const j = justa(bt); ref.Si = j.Yes; ref.No = j.No; }
        const tot = {}; so.markets.filter((m) => m.marketId === 9 && !m.suspended).forEach((m) => (tot[m.choiceGroup] = justa(m)));
        const cor = mk(21), tj = mk(20);
        const cand = [];
        const add = (txt, c, fp) => { if (c && fp && fp > 0.05) cand.push([(c * fp - 1) * 100, txt, c, 1 / fp]); };
        const by = (t, ot) => { for (const m of porTipo[t] || []) for (const i of ids(m)) { const o = O[i]; if (o && o.typeId === ot && o.oddStatus === 0) return o.price; } return null; };
        if (ref["1"]) {
          add(limpia(loc) + " gana", by(1, 1), ref["1"]); add("Empate", by(1, 2), ref.X); add(limpia(vis) + " gana", by(1, 3), ref["2"]);
          add("Doble oport. 1X", by(10, 9), ref["1"] + ref.X); add("Doble oport. X2", by(10, 11), ref.X + ref["2"]); add("Doble oport. 12", by(10, 10), ref["1"] + ref["2"]);
          const q = ref["1"] / (ref["1"] + ref["2"]); add("Empate No Acción " + limpia(loc), by(11, 1), q); add("Empate No Acción " + limpia(vis), by(11, 3), 1 - q);
        }
        if (ref.Si) { add("Ambos anotan Sí", by(29, 74), ref.Si); add("Ambos anotan No", by(29, 76), ref.No); }
        for (const ln in goles) if (tot[ln]) { add("Más de " + ln + " goles", goles[ln].o, tot[ln].Over); add("Menos de " + ln + " goles", goles[ln].u, tot[ln].Under); }
        if (cor) { const ln = String(cor.choiceGroup), j = justa(cor); if (corT[ln]) { add("Córners más de " + ln, corT[ln].o, j.Over); add("Córners menos de " + ln, corT[ln].u, j.Under); } }
        if (tj) { const ln = String(tj.choiceGroup), j = justa(tj); if (tarj[ln]) { add("Tarjetas más de " + ln, tarj[ln].o, j.Over); add("Tarjetas menos de " + ln, tarj[ln].u, j.Under); } }
        const vistos = new Set();
        // Fáciles con buena cuota: probabilidad justa ≥70 %, cuota ≥1.30 y Playdoit cobra poco margen (como mucho 4 % menos que lo justo de bet365; minFacil)
        const vf = new Set();
        const obj = (c, pr) => ({ dia: fechaMX(t0), hora: new Date(t0).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false }), partido: String(e.name).replace(/ vs\. /, " vs "), liga: champs[e.champId] || "", pick: c[1], cuota: c[2], prob: pr, valor: c[0], rot: "", eid: s.id });
        for (const c of cand) { const pr = 1 / c[3]; if (pr >= 0.70 && c[2] >= 1.30 && c[0] >= minFacil && c[0] < 40 && !vf.has(c[1]) && vf.add(c[1])) faciles.push([c[0], tag + " · " + c[1] + " @" + c[2].toFixed(2) + " · probabilidad " + Math.round(pr * 100) + "% (bet365 justa " + c[3].toFixed(2) + ") " + (c[0] >= 0 ? "+" : "") + c[0].toFixed(0) + "%", obj(c, pr * 100)]); }
        for (const c of cand) if (c[0] >= umbral && c[0] < 40 && 100 / c[3] >= minProb && !vistos.has(c[1]) && vistos.add(c[1])) valor.push([c[0], tag + " · " + c[1] + " @" + c[2].toFixed(2) + " (bet365 justa " + c[3].toFixed(2) + ") +" + c[0].toFixed(0) + "%" + (c[0] >= 40 ? " ⚠️ diferencia enorme: confirmar que sea el mismo partido" : c[0] >= 15 ? " ⚠️ posible error" : ""), obj(c, 100 / c[3])]);
      }
      internos.sort((x, y) => y[0] - x[0]); valor.sort((x, y) => y[0] - x[0]); faciles.sort((x, y) => y[0] - x[0]);
      const unicos = [...new Map(internos.map((x) => [x[1], x])).values()];
      const sec = (t, l, n) => "## " + t + " (" + l.length + ")\n" + (l.length ? l.slice(0, n).map((x) => "- " + x[1]).join("\n") : "- Nada") + "\n";
      window.__escDatos = { internos: unicos.map((x) => x[1]), valor: valor.map((x) => x[2]), faciles: faciles.map((x) => x[2]) };
      window.__esc = { listo: true, texto: "# Escáner de momios Playdoit · " + f + " (CDMX) · " + evs.length + " partidos revisados por dentro, " + comparados + " comparados con bet365\n\n"
        + sec("Errores internos de Playdoit factibles (cuota ≤" + maxC + ")", unicos, 20) + "\n" + sec("Playdoit paga más que bet365 sin margen (≥" + umbral + "%, probabilidad ≥" + minProb + " %)", valor, 25)
        + "\n" + sec("Fáciles con buena cuota (probabilidad ≥70 %, cuota ≥1.30, a no más de " + (-minFacil) + " % de lo justo de bet365)", faciles, 15) };
    })().catch((e) => { window.__esc = { listo: true, texto: "ERROR: " + e.message }; });
    return "iniciado";
  };
  return "escaner listo";
})();
  } catch (e) { console.error("valPanel esc.js", e); }

  // ===== RADAR SEMANAL =====
  try {
(function () {
  // RADAR SEMANAL v2: corre en una pestaña de sofascore.com. Estadísticas de Sofascore (tablas local/visita) + cuotas de Playdoit.
  const B = "https://sb2frontend-altenar2.biahosted.com/api/widget/";
  const Q = "culture=es-ES&timezoneOffset=360&integration=playdoit2&deviceType=1&numFormat=en-GB&countryCode=MX";
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const limpia = (s) => String(s).replace(/[&=?]/g, " ");
  const jget = async (u) => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch (e) { return null; } };
  const pd = (ruta) => jget(B + ruta + (ruta.includes("?") ? "&" : "?") + Q);
  const sf = async (ruta) => { const x = await jget("/api/v1/" + ruta); await espera(250); return x; };
  const fechaMX = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  const diaTxt = (ms) => new Date(ms).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", weekday: "short", day: "2-digit", month: "short" });
  const horaTxt = (ms) => new Date(ms).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false });
  const STOP = new Set(["fc", "cf", "sc", "ac", "afc", "cd", "ud", "sd", "club", "de", "del", "la", "el", "the", "fk", "sk", "if", "bk", "as", "us", "ss", "rc", "cp", "ca", "sv", "vfb", "vfl", "tsg", "1", "04", "05", "fbc", "calcio", "sporting", "atletico", "athletic", "united", "city", "real", "deportivo", "town", "rovers", "county", "wanderers", "albion", "borough", "olympic", "sports", "youth", "academy", "women", "reserves", "ii", "u21", "u23"]);
  const ALIAS = { psg: "paris saint germain", "man utd": "manchester united", "man city": "manchester city", inter: "internazionale", spurs: "tottenham" };
  const norm0 = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const norm = (s) => { const n = norm0(s); return ALIAS[n] || n; };
  const toks = (s) => { const t = norm(s).split(" ").filter((x) => x.length >= 3 && !STOP.has(x)); return t.length ? t : norm(s).split(" ").filter((x) => x.length >= 3); };
  const igual = (a, b) => { const A = toks(a), Bt = toks(b); return A.some((x) => Bt.some((y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))))); };
  const ids = (m) => [...(m.desktopOddIds || []).flat(), ...(m.oddIds || [])];

  // [id Sofascore, nombre, goles base, fuerza Opta]. El orden es la prioridad para el tope de partidos por día.
  const COMP = [[7, "Champions", 0, 0], [17, "Premier", 2.75, 1.00], [8, "LaLiga", 2.7, 0.89], [23, "Serie A", 2.45, 0.89], [35, "Bundesliga", 3.2, 0.90],
    [34, "Ligue 1", 2.8, 0.84], [11621, "Liga MX", 2.8, 0.67], [679, "Europa League", 0, 0], [242, "MLS", 3.2, 0.70], [37, "Eredivisie", 3.1, 0.75],
    [238, "Portugal", 2.6, 0.75], [325, "Brasileirão", 2.4, 0.73], [155, "Argentina", 2.1, 0.68], [955, "Saudi", 2.9, 0.65],
    [17015, "Conference", 0, 0], [384, "Libertadores", 0, 0], [480, "Sudamericana", 0, 0]];
  const LIGAS = COMP.filter((c) => c[2] > 0);

  function modelo(prom, gfL, gcL, nL, gfV, gcV, nV, ligaL, ligaV, fL, fV) {
    const enc = (raw, n) => (n / (n + 4)) * raw + (4 / (n + 4)) * 1.0;
    const atkL = enc(gfL / (ligaL * 0.55), nL), defL = enc(gcL / (ligaL * 0.45), nL);
    const atkV = enc(gfV / (ligaV * 0.45), nV), defV = enc(gcV / (ligaV * 0.55), nV);
    const rf = Math.pow(fL / fV, 1.5);
    return desdeLam(atkL * defV * prom * 0.55 * rf, atkV * defL * prom * 0.45 / rf, -0.10, 0.30);
  }
  // v1.5: probabilidades desde goles esperados (el modelo entrenado usa rho −0.08 y sin incertidumbre extra)
  function desdeLam(lL, lV, RHO, SIG) {
    const fact = [1]; for (let i = 1; i <= 10; i++) fact[i] = fact[i - 1] * i;
    const p = (k, l) => Math.exp(-l) * Math.pow(l, k) / fact[k];
    const GX = [-3.75044, -2.366759, -1.154405, 0, 1.154405, 2.366759, 3.75044], GW = [0.000548, 0.030757, 0.240123, 0.457143, 0.240123, 0.030757, 0.000548];
    const M = []; for (let i = 0; i <= 10; i++) M.push(new Array(11).fill(0));
    GX.forEach((z, q) => {
      const k = Math.exp(SIG * z - SIG * SIG / 2), L = lL * k, V = lV * k;
      const tau = (i, j) => (i === 0 && j === 0 ? 1 - L * V * RHO : i === 0 && j === 1 ? 1 + L * RHO : i === 1 && j === 0 ? 1 + V * RHO : i === 1 && j === 1 ? 1 - RHO : 1);
      let sm = 0; const m = []; for (let i = 0; i <= 10; i++) { m.push([]); for (let j = 0; j <= 10; j++) { const v = p(i, L) * p(j, V) * tau(i, j); m[i].push(v); sm += v; } }
      for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) M[i][j] += GW[q] * m[i][j] / sm;
    });
    const t = (f) => { let s = 0; for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) if (f(i, j)) s += M[i][j]; return 100 * s; };
    const r = { lL, lV, "1": t((i, j) => i > j), X: t((i, j) => i === j), "2": t((i, j) => i < j), O15: t((i, j) => i + j >= 2), O25: t((i, j) => i + j >= 3), U35: t((i, j) => i + j <= 3), BTTS: t((i, j) => i > 0 && j > 0) };
    r["1X"] = r["1"] + r.X; r.X2 = r.X + r["2"]; r.DNBL = 100 * r["1"] / (r["1"] + r["2"]); r.DNBV = 100 - r.DNBL;
    return r;
  }

  window.radarParte = (i) => { const t = (window.__radar || {}).texto || ""; const n = Math.max(1, Math.ceil(t.length / 950)); return "[parte " + (i + 1) + "/" + n + "] " + t.slice(i * 950, (i + 1) * 950); };

  // hasta: fecha "AAAA-MM-DD" del último día (por defecto el domingo de esta semana). tope: partidos por día (30).
  window.radarIniciar = function (hasta, tope = 30) {
    window.__radar = { listo: false, paso: "inicio", texto: "" };
    (async () => {
      const hoy = fechaMX(Date.now());
      let fin = hasta;
      if (!fin) { const d = new Date(hoy + "T12:00:00-06:00"); const dow = d.getUTCDay(); fin = fechaMX(d.getTime() + ((7 - dow) % 7) * 86400000); }
      const fechas = []; for (let t = Date.parse(hoy + "T12:00:00-06:00"); fechaMX(t) <= fin; t += 86400000) fechas.push(fechaMX(t));
      const limite = Date.parse(fin + "T00:00:00-06:00") + 86400000, ahora = Date.now();
      // 1) Tablas local/visita de cada liga
      const T = {}, LG = {};
      for (const [id, nom, base, fz] of LIGAS) {
        window.__radar.paso = "tablas " + nom;
        const s = await sf("unique-tournament/" + id + "/seasons"); const se = s && s.seasons && s.seasons[0]; if (!se) continue;
        const tab = async (tipo) => {
          const r = await sf("unique-tournament/" + id + "/season/" + se.id + "/standings/" + tipo);
          const ts = ((r && r.standings) || []).filter((x) => (x.rows || []).length && x.rows.every((w) => Number.isFinite(w.scoresFor) && Number.isFinite(w.matches)));
          const mx = Math.max(0, ...ts.map((x) => x.rows.length)); const filas = {};
          for (const x of ts.filter((x) => x.rows.length === mx)) for (const w of x.rows) filas[w.team.id] = w;
          return Object.values(filas);
        };
        const casa = await tab("home"), fuera = await tab("away");
        let g = 0, pj = 0; for (const w of casa) { g += w.scoresFor + w.scoresAgainst; pj += w.matches; }
        const equipos = Math.max(1, casa.length), pjEq = (pj * 2) / equipos;
        let prom = pj ? g / pj : base; if (prom < 1.8 || prom > 4.0) prom = base; if (pjEq < 10) prom = 0.5 * prom + 0.5 * base;
        LG[id] = { nom, prom, fz, pjEq };
        for (const w of casa) T[w.team.id] = Object.assign(T[w.team.id] || {}, { liga: id, hgf: w.scoresFor, hgc: w.scoresAgainst, hn: w.matches });
        for (const w of fuera) T[w.team.id] = Object.assign(T[w.team.id] || {}, { liga: id, agf: w.scoresFor, agc: w.scoresAgainst, an: w.matches });
      }
      // 2) Partidos de cada día
      const evs = [], vistos = new Set();
      for (const [id, nom] of COMP) for (const f of fechas) {
        window.__radar.paso = "partidos " + nom + " " + f;
        const r = await sf("unique-tournament/" + id + "/scheduled-events/" + f);
        for (const e of (r && r.events) || []) {
          const t = e.startTimestamp * 1000;
          if (vistos.has(e.id) || !e.status || e.status.type !== "notstarted" || t < ahora || t >= limite) continue;
          vistos.add(e.id); evs.push({ e, t, comp: id, compNom: nom, dia: fechaMX(t) });
        }
      }
      const prio = Object.fromEntries(COMP.map((c, i) => [c[0], i]));
      const porDia = {}; for (const x of evs) (porDia[x.dia] = porDia[x.dia] || []).push(x);
      const elegidos = []; for (const d in porDia) elegidos.push(...porDia[d].sort((a, b) => prio[a.comp] - prio[b.comp] || a.t - b.t).slice(0, tope));
      // 3) Cuotas de Playdoit
      window.__radar.paso = "playdoit lista";
      const L = await pd("GetEvents?eventCount=0&sportId=66&champIds=0");
      if (!L) { window.__radar = { listo: true, texto: "ERROR: no se pudo leer Playdoit" }; return; }
      const res = [];
      let k = 0;
      for (const x of elegidos) {
        window.__radar.paso = "partido " + (++k) + "/" + elegidos.length;
        const H = x.e.homeTeam, A = x.e.awayTeam;
        const pe = L.events.find((p) => Math.abs(new Date(p.startDate).getTime() - x.t) <= 3 * 3600000 && (([a, b]) => igual(a, H.name) && igual(b, A.name))(String(p.name).split(/ vs\.? /i)))
          || L.events.find((p) => Math.abs(new Date(p.startDate).getTime() - x.t) <= 20 * 60000 && (([a, b]) => igual(a, H.name) || igual(b, A.name))(String(p.name).split(/ vs\.? /i)));
        if (!pe) continue;
        const d = await pd("GetEventDetails?eventId=" + pe.id); await espera(150);
        if (!d) continue;
        const O = {}; (d.odds || []).forEach((o) => (O[o.id] = o));
        const porTipo = {}; for (const m of d.markets || []) (porTipo[m.typeId] = porTipo[m.typeId] || []).push(m);
        const by = (t, ot) => { for (const m of porTipo[t] || []) for (const i of ids(m)) { const o = O[i]; if (o && o.typeId === ot && o.oddStatus === 0) return o.price; } return null; };
        const tot = {}; for (const m of porTipo[18] || []) for (const i of ids(m)) { const o = O[i]; if (!o || o.oddStatus !== 0) continue; const z = String(o.name).trim().match(/^(Más|Menos) de ([\d.]+)$/); if (!z) continue; tot[z[2]] = tot[z[2]] || {}; const l = z[1] === "Más" ? "o" : "u"; if (tot[z[2]][l] == null) tot[z[2]][l] = o.price; }
        const c1 = by(1, 1), cX = by(1, 2), c2 = by(1, 3);
        const nv = (...c) => { if (c.some((v) => !v)) return null; const s = c.reduce((a, v) => a + 1 / v, 0); return c.map((v) => 100 / v / s); };
        const m1x2 = nv(c1, cX, c2);
        // Modelo (si hay datos de los dos equipos)
        const tL = T[H.id], tV = T[A.id];
        let md = null, tipo = "";
        // v1.6: copas con el modelo de copas; en Champions/Europa/Conference el ganador pesa 10 % modelo (prueba con 955 partidos);
        // en Libertadores/Sudamericana el ganador sigue con el modelo de promedios y los goles van con el modelo de copas
        const nomCopa = window.valCopa && window.valCopa.ids[x.comp];
        const rc = nomCopa && window.valCopa.lambdas(H.id, A.id, x.comp);
        const mc = rc ? desdeLam(rc.lL, rc.lV, -0.08, 0) : null;
        const uefa = !!(nomCopa && window.valCopa.uefa(x.comp));
        const rl = !nomCopa && window.valRatings && window.valRatings.lambdas(H.name, A.name);
        if (rl) { md = desdeLam(rl.lL, rl.lV, -0.08, 0); tipo = " [modelo entrenado]"; }
        else if (tL && tV && tL.hn && tV.an) {
          const lgL = LG[tL.liga], lgV = LG[tV.liga];
          const misma = tL.liga === tV.liga;
          const prom = misma ? lgL.prom : (lgL.prom + lgV.prom) / 2;
          md = modelo(prom, tL.hgf / tL.hn, tL.hgc / tL.hn, tL.hn, tV.agf / tV.an, tV.agc / tV.an, tV.an, lgL.prom, lgV.prom, misma ? 1 : lgL.fz, misma ? 1 : lgV.fz);
          tipo = misma ? "" : " [" + lgL.nom + " " + lgL.fz.toFixed(2) + " vs " + lgV.nom + " " + lgV.fz.toFixed(2) + "]";
        }
        if (mc) tipo += " [modelo copa]";
        const m1 = uefa && mc ? mc : md, w1 = uefa && mc ? 0.1 : 0.3, mG = mc || md;
        const ligaAj = tL ? tL.liga : x.comp;
        const aj = (mk) => {
          if (ligaAj === 35 && mk === "O15") return -10; // 26-oct: 10/16 (63 %) vs 81 % esperado
          if (ligaAj === 35 && (mk === "O25" || mk === "U25" || mk === "U35")) return -5;
          if (ligaAj === 37 && (mk === "1X" || mk === "X2" || mk === "1" || mk === "2")) return -5;
          if (ligaAj === 155 && mk === "O15") return -10;
          return 0;
        };
        const cand = [];
        const add = (txt, mk, pm, cuota, pmer, w = 0.3) => {
          if (!cuota || pmer == null) return;
          const pmod = pm == null ? null : pm + aj(mk);
          if (pmod != null && Math.abs(pmod - pmer) >= 15) return; // discrepancia modelo-mercado
          const fin = pmod == null ? pmer : w * pmod + (1 - w) * pmer; // v1.4: 30 % modelo + 70 % mercado (copas europeas en ganador: 10/90, v1.6)
          cand.push({ txt, fin, cuota, pmod, pmer, ev: fin * cuota / 100 });
        };
        if (m1x2) {
          add(H.shortName || H.name, "1", m1 && m1["1"], c1, m1x2[0], w1);
          add(A.shortName || A.name, "2", m1 && m1["2"], c2, m1x2[2], w1);
          add((H.shortName || H.name) + " o empate", "1X", m1 && m1["1X"], by(10, 9), m1x2[0] + m1x2[1], w1);
          add("Empate o " + (A.shortName || A.name), "X2", m1 && m1.X2, by(10, 11), m1x2[1] + m1x2[2], w1);
          const q = 100 * m1x2[0] / (m1x2[0] + m1x2[2]);
          add("Empate No Acción " + (H.shortName || H.name), "DNB", m1 && m1.DNBL, by(11, 1), q, w1);
          add("Empate No Acción " + (A.shortName || A.name), "DNB", m1 && m1.DNBV, by(11, 3), 100 - q, w1);
        }
        const par = (ln) => (tot[ln] && tot[ln].o && tot[ln].u ? nv(tot[ln].o, tot[ln].u) : null);
        const t15 = par("1.5"), t25 = par("2.5"), t35 = par("3.5");
        if (t15) add("Más de 1.5 goles", "O15", mG && mG.O15, tot["1.5"].o, t15[0]);
        if (t25) { add("Más de 2.5 goles", "O25", mG && mG.O25, tot["2.5"].o, t25[0]); add("Menos de 2.5 goles", "U25", mG && 100 - mG.O25, tot["2.5"].u, t25[1]); }
        if (t35) add("Menos de 3.5 goles", "U35", mG && mG.U35, tot["3.5"].u, t35[1]);
        const bS = by(29, 74), bN = by(29, 76), bt = bS && bN ? nv(bS, bN) : null;
        if (bt) { add("Ambos anotan Sí", "BTTS", mG && mG.BTTS, bS, bt[0]); add("Ambos anotan No", "BTTSN", mG && 100 - mG.BTTS, bN, bt[1]); }
        const ok = cand.filter((c) => c.fin >= 70 && c.cuota >= 1.25 && c.ev >= 0.95).sort((a, b) => b.ev - a.ev); // v1.4: EV de −5 % o mejor
        if (!ok.length) continue;
        res.push({ x, H, A, best: ok[0], otros: ok.slice(1, 3), tipo, sinModelo: !md && !mc, pdName: pe.name });
      }
      // 4) Riesgo de rotación (copa 3 días antes o después) para los mejores candidatos de cada día
      const cache = {};
      const partidosEq = async (tid) => {
        if (cache[tid]) return cache[tid];
        const a = await sf("team/" + tid + "/events/last/0"), b = await sf("team/" + tid + "/events/next/0");
        return (cache[tid] = [...((a && a.events) || []), ...((b && b.events) || [])]);
      };
      const dias = {}; for (const r of res) (dias[r.x.dia] = dias[r.x.dia] || []).push(r);
      for (const d in dias) {
        dias[d].sort((a, b) => b.best.fin - a.best.fin || b.best.ev - a.best.ev);
        for (const r of dias[d].slice(0, 15)) {
          window.__radar.paso = "rotación " + d;
          const otras = [];
          for (const tm of [r.H, r.A]) for (const ev of await partidosEq(tm.id)) {
            const ut = ((ev.tournament || {}).uniqueTournament || {});
            const dt = (ev.startTimestamp * 1000 - r.x.t) / 86400000;
            if (ev.id !== r.x.e.id && Math.abs(dt) <= 3.5 && Math.abs(dt) > 0.2 && ut.id !== r.x.comp) otras.push((tm.shortName || tm.name) + " " + (ut.name || "copa") + " " + diaTxt(ev.startTimestamp * 1000));
          }
          r.rot = otras.length ? " 🔄 " + limpia([...new Set(otras)].join(", ")) : "";
        }
      }
      // 5) Texto
      const linea = (r) => "- " + horaTxt(r.x.t) + " " + limpia(r.H.name + " vs " + r.A.name) + " (" + r.x.compNom + ")" + r.tipo + " · " + limpia(r.best.txt) + " @" + r.best.cuota.toFixed(2)
        + " · prob " + Math.round(r.best.fin) + "%" + (r.best.pmod != null ? " (modelo " + Math.round(r.best.pmod) + " / mercado " + Math.round(r.best.pmer) + ")" : " (solo mercado)")
        + " · valor " + (r.best.fin - 100 / r.best.cuota >= 0 ? "+" : "") + Math.round(r.best.fin - 100 / r.best.cuota) + (r.rot || "");
      let txt = "# Radar semanal " + fechas[0] + " a " + fin + " (CDMX) · " + elegidos.length + " partidos revisados, " + res.length + " con algún pick ≥70 % y cuota ≥1.25\n";
      for (const f of fechas) {
        const lst = dias[f] || [];
        txt += "\n## " + diaTxt(Date.parse(f + "T12:00:00-06:00")) + " · " + ((porDia[f] || []).length) + " partidos, " + lst.length + " candidatos\n" + (lst.length ? lst.slice(0, 15).map(linea).join("\n") : "- Ninguno") + "\n";
      }
      const sinRot = res.filter((r) => r.rot === "").sort((a, b) => b.best.fin - a.best.fin).slice(0, 12);
      txt += "\n## Sin riesgo de rotación (sirven para boletos de varios días)\n" + (sinRot.length ? sinRot.map((r) => linea(r).replace("- ", "- " + diaTxt(r.x.t) + " ")).join("\n") : "- Ninguno") + "\n";
      window.__radarDatos = []; for (const f of fechas) for (const x of (dias[f] || []).slice(0, 15)) window.__radarDatos.push({ dia: f, hora: horaTxt(x.x.t), partido: x.H.name + " vs " + x.A.name, liga: x.x.compNom, pick: x.best.txt, cuota: x.best.cuota, prob: x.best.fin, modelo: x.best.pmod, mercado: x.best.pmer, valor: x.best.fin - 100 / x.best.cuota, rot: (x.rot || "").replace(" 🔄 ", ""), eid: x.x.e.id });
      window.__radar = { listo: true, texto: txt };
    })().catch((e) => { window.__radar = { listo: true, texto: "ERROR: " + e.message }; });
    return "iniciado";
  };
  return "radar listo";
})();
  } catch (e) { console.error("valPanel radar.js", e); }

  // ===== ALINEACIONES Y CIERRE =====
  try {
(function () {
  // ALINEACIONES Y CIERRE (v1.3): corre en sofascore.com.
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const limpia = (s) => String(s).replace(/[&=?]/g, " ");
  const api = async (ruta) => { try { const r = await fetch("/api/v1/" + ruta); await espera(300); return r.ok ? await r.json() : null; } catch (e) { return null; } };
  const hora = (ts) => new Date(ts * 1000).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const parte = (k) => (i) => { const o = window[k] || {}; if (!o.listo) return "todavía no está listo"; const t = o.texto || "", n = Math.max(1, Math.ceil(t.length / 950)); return "[parte " + (i + 1) + "/" + n + "] " + t.slice(i * 950, (i + 1) * 950); };
  window.alinParte = parte("__alin");
  window.cierreParte = parte("__cierre");

  async function resolver(en) {
    const m = String(en).match(/(\d{6,})/);
    if (m) return Number(m[1]);
    const res = await api("search/all?q=" + encodeURIComponent(en) + "&page=0");
    const eq = ((res && res.results) || []).find((r) => r.type === "team" && ((r.entity.sport || {}).slug === "football"));
    if (!eq) return null;
    const sig = ((await api("team/" + eq.entity.id + "/events/next/0")) || {}).events || [];
    return sig.length ? sig[0].id : null;
  }
  const titulares = (lado) => ((lado && lado.players) || []).filter((x) => !x.substitute).map((x) => x.player || {});

  async function equipo(team, ev, lado) {
    const actual = titulares(lado);
    const bajas = ((lado && lado.missingPlayers) || []).map((x) => (x.player ? x.player.shortName || x.player.name : "?") + (x.type === "doubtful" ? " (duda)" : ""));
    const out = { nombre: team.shortName || team.name, bajas, cambios: null, salen: [], entran: [] };
    if (!actual.length) return out;
    const prev = (((await api("team/" + team.id + "/events/last/0")) || {}).events || [])
      .filter((e) => (e.status || {}).type === "finished" && e.startTimestamp < ev.startTimestamp).sort((a, b) => b.startTimestamp - a.startTimestamp)[0];
    if (!prev) return out;
    const lp = await api("event/" + prev.id + "/lineups");
    if (!lp) return out;
    const antes = titulares(prev.homeTeam.id === team.id ? lp.home : lp.away);
    if (!antes.length) return out;
    const idsA = new Set(antes.map((x) => x.id)), idsN = new Set(actual.map((x) => x.id));
    out.salen = antes.filter((x) => !idsN.has(x.id)).map((x) => x.shortName || x.name);
    out.entran = actual.filter((x) => !idsA.has(x.id)).map((x) => x.shortName || x.name);
    out.cambios = out.salen.length;
    out.prev = (prev.tournament || {}).name || "";
    return out;
  }

  // entradas: ids de Sofascore o nombre del equipo local. Máximo 15.
  window.alinIniciar = function (entradas) {
    window.__alin = { listo: false, texto: "" }; window.__alinDatos = [];
    (async () => {
      const secs = [];
      for (const en of [].concat(entradas).slice(0, 15)) {
        const id = await resolver(en);
        if (!id) { secs.push("## " + limpia(en) + "\n- No encontrado\n"); continue; }
        const d = await api("event/" + id); if (!d) { secs.push("## " + id + "\n- No se pudo leer\n"); continue; }
        const ev = d.event, H = ev.homeTeam, A = ev.awayTeam;
        const lu = await api("event/" + id + "/lineups");
        const tit = "## " + limpia(H.name + " vs " + A.name) + " (" + hora(ev.startTimestamp) + " CDMX) [id " + id + "]";
        if (!lu || (!titulares(lu.home).length && !titulares(lu.away).length)) {
          secs.push(tit + "\n- Alineaciones todavía no publicadas (suelen salir ~1 h antes)\n");
          window.__alinDatos.push({ eid: id, partido: H.name + " vs " + A.name, estado: "sin alineación" });
          continue;
        }
        const h = await equipo(H, ev, lu.home), a = await equipo(A, ev, lu.away);
        const linea = (x) => "- " + limpia(x.nombre) + ": " + (x.cambios === null ? "sin comparación" : x.cambios + " cambios vs su último partido" + (x.prev ? " (" + limpia(x.prev) + ")" : "") + (x.salen.length ? " · salen: " + limpia(x.salen.join(", ")) : ""))
          + (x.bajas.length ? " · bajas: " + limpia(x.bajas.join(", ")) : "") + (x.cambios !== null && x.cambios >= 5 ? " ⚠️ rotación fuerte" : "");
        secs.push(tit + " · alineación " + (lu.confirmed ? "CONFIRMADA" : "probable") + "\n" + linea(h) + "\n" + linea(a) + "\n");
        window.__alinDatos.push({ eid: id, partido: H.name + " vs " + A.name, estado: lu.confirmed ? "confirmada" : "probable", local: h, visita: a });
      }
      window.__alin = { listo: true, texto: "# Alineaciones Sofascore\n\n" + secs.join("\n") };
    })().catch((e) => { window.__alin = { listo: true, texto: "ERROR: " + e.message }; });
    return "iniciado";
  };

  // Cuotas de cierre de bet365 (sin margen) para medir el CLV: clv = cuota_playdoit × prob_cierre − 1
  window.cierreIniciar = function (ids) {
    window.__cierre = { listo: false, texto: "" }; window.__cierreDatos = {};
    (async () => {
      const dec = (f) => { const [a, b] = String(f).split("/").map(Number); return b ? a / b + 1 : NaN; };
      const justa = (m) => { const p = m.choices.map((c) => 1 / dec(c.fractionalValue)); const s = p.reduce((x, y) => x + y, 0); return Object.fromEntries(m.choices.map((c, i) => [c.name, Math.round(1000 * p[i] / s) / 10])); };
      const secs = [];
      for (const id of [].concat(ids).slice(0, 30)) {
        const o = await api("event/" + id + "/odds/1/all");
        if (!o || !o.markets) { secs.push("## " + id + "\n- Sin cuotas de cierre\n"); continue; }
        const R = {};
        for (const m of o.markets) {
          const j = justa(m);
          if (m.marketId === 1) { R["1"] = j["1"]; R.X = j.X; R["2"] = j["2"]; R["1X"] = Math.round(10 * (j["1"] + j.X)) / 10; R.X2 = Math.round(10 * (j.X + j["2"])) / 10; R["ENA local"] = Math.round(1000 * j["1"] / (j["1"] + j["2"])) / 10; R["ENA visita"] = Math.round(1000 * j["2"] / (j["1"] + j["2"])) / 10; }
          if (m.marketId === 5) { R["Ambos Sí"] = j.Yes; R["Ambos No"] = j.No; }
          if (m.marketId === 9) { R["Más de " + m.choiceGroup] = j.Over; R["Menos de " + m.choiceGroup] = j.Under; }
          if (m.marketId === 21) { R["Córners más de " + m.choiceGroup] = j.Over; R["Córners menos de " + m.choiceGroup] = j.Under; }
        }
        window.__cierreDatos[id] = R;
        secs.push("## " + id + "\n- " + Object.entries(R).map(([k, v]) => k + " " + v + "%").join(" · ") + "\n");
      }
      window.__cierre = { listo: true, texto: "# Cierre bet365 sin margen (%)\n\n" + secs.join("\n") };
    })().catch((e) => { window.__cierre = { listo: true, texto: "ERROR: " + e.message }; });
    return "iniciado";
  };
  return "alineaciones listo";
})();
  } catch (e) { console.error("valPanel alin.js", e); }

  // ===== EN VIVO, REGISTRO Y DATOS =====
  try {
(function () {
  // EN VIVO, REGISTRO DE CUOTAS E HISTÓRICO (v1.4): corre en sofascore.com.
  const B = "https://sb2frontend-altenar2.biahosted.com/api/widget/";
  const Q = "culture=es-ES&timezoneOffset=360&integration=playdoit2&deviceType=1&numFormat=en-GB&countryCode=MX";
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const limpia = (s) => String(s).replace(/[&=?]/g, " ");
  const jget = async (u) => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch (e) { return null; } };
  const pd = (ruta) => jget(B + ruta + (ruta.includes("?") ? "&" : "?") + Q);
  const sf = async (ruta, pausa = 250) => { const x = await jget("/api/v1/" + ruta); await espera(pausa); return x; };
  const dec = (f) => { const [a, b] = String(f).split("/").map(Number); return b ? a / b + 1 : NaN; };
  const fechaMX = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  const STOP = new Set(["fc", "cf", "sc", "ac", "afc", "cd", "ud", "sd", "club", "de", "del", "la", "el", "the", "fk", "sk", "if", "bk", "as", "us", "ss", "rc", "cp", "ca", "sv", "vfb", "vfl", "tsg", "1", "04", "05", "fbc", "calcio", "sporting", "atletico", "athletic", "united", "city", "real", "deportivo", "town", "rovers", "county", "wanderers", "albion", "borough", "olympic", "sports", "youth", "academy", "women", "reserves", "ii", "u21", "u23"]);
  const ALIAS = { psg: "paris saint germain", "man utd": "manchester united", "man city": "manchester city", inter: "internazionale", spurs: "tottenham" };
  const norm0 = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const norm = (s) => { const n = norm0(s); return ALIAS[n] || n; };
  const toks = (s) => { const t = norm(s).split(" ").filter((x) => x.length >= 3 && !STOP.has(x)); return t.length ? t : norm(s).split(" ").filter((x) => x.length >= 3); };
  const igual = (a, b) => { const A = toks(a), Bt = toks(b); return A.some((x) => Bt.some((y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x))))); };
  const ids = (m) => [...(m.desktopOddIds || []).flat(), ...(m.oddIds || [])];
  const parte = (k) => (i) => { const o = window[k] || {}; if (!o.listo) return "todavía no está listo"; const t = o.texto || "", n = Math.max(1, Math.ceil(t.length / 950)); return "[parte " + (i + 1) + "/" + n + "] " + t.slice(i * 950, (i + 1) * 950); };
  window.vivoParte = parte("__vivo");
  // Ligas top (id Sofascore, nombre); las que tienen goles base > 0 entran al histórico
  const LIGAS = [[17, "Premier"], [8, "LaLiga"], [23, "Serie A"], [35, "Bundesliga"], [34, "Ligue 1"], [11621, "Liga MX"], [242, "MLS"], [37, "Eredivisie"], [238, "Portugal"], [325, "Brasileirão"], [155, "Argentina"], [955, "Saudi"]];
  const COPAS = [[7, "Champions"], [679, "Europa League"], [17015, "Conference"], [384, "Libertadores"], [480, "Sudamericana"]];

  // ---------- EN VIVO: goles que faltan contra la cuota de Playdoit ----------
  // Ritmo de gol = 60 % el xG que lleva el partido por minuto + 40 % el promedio normal (2.7 por partido), con reposición y +20 % después del 75'.
  const poisMenos = (k, l) => { let s = 0, t = Math.exp(-l); for (let i = 0; i < k; i++) { s += t; t *= l / (i + 1); } return s; }; // P(N < k)
  window.vivoIniciar = function (minDif = 7) {
    window.__vivo = { listo: false, texto: "" }; window.__vivoDatos = [];
    (async () => {
      const L = await pd("GetLiveEvents?sportId=66");
      if (!L) { window.__vivo = { listo: true, texto: "ERROR: no se pudo leer Playdoit en vivo" }; return; }
      const O = {}, M = {}; (L.odds || []).forEach((o) => (O[o.id] = o)); (L.markets || []).forEach((m) => (M[m.id] = m));
      const S = (((await sf("sport/football/events/live")) || {}).events || []).filter((e) => (e.status || {}).type === "inprogress");
      const ahora = Date.now() / 1000, filas = [];
      for (const pe of L.events || []) {
        const [loc, vis] = String(pe.name).split(/ vs\.? /i);
        const s = S.find((x) => igual(loc, x.homeTeam.name) && igual(vis, x.awayTeam.name));
        if (!s) continue;
        const st = s.status || {}, t = s.time || {};
        let min = null;
        if (st.code === 6 && t.currentPeriodStartTimestamp) min = Math.floor((ahora - t.currentPeriodStartTimestamp) / 60) + 1;
        else if (st.code === 7 && t.currentPeriodStartTimestamp) min = 45 + Math.floor((ahora - t.currentPeriodStartTimestamp) / 60) + 1;
        else if (st.code === 31) min = 45;
        if (min === null || min < 15 || min > 85) continue;
        const g = (s.homeScore.current || 0) + (s.awayScore.current || 0);
        const est = await sf("event/" + s.id + "/statistics");
        let xg = null, rojas = 0;
        for (const per of (est && est.statistics) || []) if (per.period === "ALL") for (const gr of per.groups || []) for (const it of gr.statisticsItems || []) {
          if (it.key === "expectedGoals") xg = Number(it.homeValue ?? it.home) + Number(it.awayValue ?? it.away);
          if (it.key === "redCards") rojas = Number(it.homeValue ?? it.home) + Number(it.awayValue ?? it.away);
        }
        if (xg === null || !Number.isFinite(xg)) continue;
        // minutos que faltan con reposición (~3 en el 1er tiempo, ~6 en el 2º); después del 75' se marca ~20 % más
        const resto = min <= 45 ? (48 - min) + 51 : Math.max(0, 96 - min), tardio = min >= 75 ? 1.2 : 1;
        const ritmo = 0.6 * (xg / Math.max(min, 15)) + 0.4 * (2.7 / 90), lam = ritmo * resto * tardio;
        // Total de goles en vivo (typeId 18): línea principal con Más (12) y Menos (13)
        for (const mid of pe.marketIds || []) {
          const m = M[mid]; if (!m || m.typeId !== 18) continue;
          const lin = Number(m.sv); if (!Number.isFinite(lin)) continue;
          let co = null, cu = null; for (const i of ids(m)) { const o = O[i]; if (!o || o.oddStatus !== 0) continue; if (o.typeId === 12) co = o.price; if (o.typeId === 13) cu = o.price; }
          if (!co || !cu) continue;
          const k = Math.floor(lin) + 1 - g; if (k <= 0) continue;
          const pMas = 1 - poisMenos(k, lam), pMenos = 1 - pMas;
          const jMas = (1 / co) / (1 / co + 1 / cu), jMenos = 1 - jMas;
          const fila = { eid: s.id, partido: s.homeTeam.name + " vs " + s.awayTeam.name, liga: (s.tournament || {}).name || "", min, marcador: s.homeScore.current + "-" + s.awayScore.current, xg: Math.round(xg * 100) / 100, rojas, linea: lin, cMas: co, cMenos: cu, pMas: Math.round(pMas * 100), pMenos: Math.round(pMenos * 100), jMas: Math.round(jMas * 100), senal: "" };
          if (pMas - jMas >= minDif / 100 && pMas >= 0.55 && co >= 1.4) fila.senal = "Más de " + lin + " @" + co;
          else if (pMenos - jMenos >= minDif / 100 && pMenos >= 0.55 && cu >= 1.4) fila.senal = "Menos de " + lin + " @" + cu;
          if (rojas) fila.senal = fila.senal ? fila.senal + " (ojo: hay roja)" : "";
          filas.push(fila);
        }
      }
      window.__vivoDatos = filas;
      const sen = filas.filter((f) => f.senal);
      window.__vivo = { listo: true, texto: "# En vivo · " + filas.length + " partidos con xG y cuota de Playdoit · " + sen.length + " señales\n" + filas.map((f) => "- " + limpia(f.partido) + " " + f.min + "' " + f.marcador + " · xG " + f.xg + " · Más de " + f.linea + " @" + f.cMas + " (modelo " + f.pMas + " % vs cuota " + f.jMas + " %)" + (f.senal ? " · SEÑAL: " + f.senal : "")).join("\n") };
    })().catch((e) => { window.__vivo = { listo: true, texto: "ERROR: " + e.message }; });
    return "iniciado";
  };

  // ---------- REGISTRO DE CUOTAS (Playdoit vs bet365) en IndexedDB ----------
  const db = () => new Promise((res, rej) => { const r = indexedDB.open("valPanel", 1); r.onupgradeneeded = () => r.result.createObjectStore("cuotas", { autoIncrement: true }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const guardar = async (filas) => { const d = await db(); await new Promise((res, rej) => { const tx = d.transaction("cuotas", "readwrite"); const s = tx.objectStore("cuotas"); filas.forEach((f) => s.add(f)); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); };
  const leerTodo = async () => { const d = await db(); return new Promise((res, rej) => { const r = d.transaction("cuotas").objectStore("cuotas").getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
  window.cuotasContar = async () => { try { const d = await db(); return await new Promise((res) => { const r = d.transaction("cuotas").objectStore("cuotas").count(); r.onsuccess = () => res(r.result); r.onerror = () => res(0); }); } catch (e) { return 0; } };
  window.cuotasRegistrar = async function () {
    const ts = new Date().toISOString(), hoy = fechaMX(Date.now()), man = fechaMX(Date.now() + 86400000);
    const L = await pd("GetEvents?eventCount=0&sportId=66&champIds=0"); if (!L) return "ERROR Playdoit";
    const O = {}, M = {}; L.odds.forEach((o) => (O[o.id] = o)); L.markets.forEach((m) => (M[m.id] = m));
    const precio = (e, tipo, ot) => { for (const i of e.marketIds) { const m = M[i]; if (!m || m.typeId !== tipo) continue; for (const j of m.oddIds) { const o = O[j]; if (o && o.typeId === ot && o.oddStatus === 0) return { p: o.price, sv: m.sv }; } } return null; };
    const filas = [];
    for (const [id, nom] of [...LIGAS, ...COPAS]) for (const f of [hoy, man]) {
      const r = await sf("unique-tournament/" + id + "/scheduled-events/" + f);
      for (const e of (r && r.events) || []) {
        if ((e.status || {}).type !== "notstarted") continue;
        const t0 = e.startTimestamp * 1000; if (t0 - Date.now() > 48 * 3600000) continue;
        const pe = L.events.find((p) => Math.abs(new Date(p.startDate).getTime() - t0) < 3 * 3600000 && (([a, b]) => igual(a, e.homeTeam.name) && igual(b, e.awayTeam.name))(String(p.name).split(/ vs\.? /i)));
        if (!pe) continue;
        const so = await sf("event/" + e.id + "/odds/1/all");
        const mk = (mid) => so && so.markets && so.markets.find((m) => m.marketId === mid && !m.suspended);
        const justa = (m) => { if (!m) return {}; const p = m.choices.map((c) => 1 / dec(c.fractionalValue)); const s = p.reduce((x, y) => x + y, 0); return Object.fromEntries(m.choices.map((c, i) => [c.name, Math.round(1000 * p[i] / s) / 10])); };
        const p1 = precio(pe, 1, 1), pX = precio(pe, 1, 2), p2 = precio(pe, 1, 3), po = precio(pe, 18, 12), pu = precio(pe, 18, 13);
        const lin = po ? String(po.sv) : "";
        const b1 = justa(mk(1)); const btot = so && so.markets ? so.markets.find((m) => m.marketId === 9 && String(m.choiceGroup) === lin && !m.suspended) : null; const bt = justa(btot);
        filas.push({ ts, eid: e.id, liga: nom, partido: e.homeTeam.name + " vs " + e.awayTeam.name, inicio: new Date(t0).toISOString(), horasAntes: Math.round((t0 - Date.now()) / 36e5 * 10) / 10,
          pd1: p1 && p1.p, pdX: pX && pX.p, pd2: p2 && p2.p, linea: lin, pdMas: po && po.p, pdMenos: pu && pu.p, b1: b1["1"], bX: b1.X, b2: b1["2"], bMas: bt.Over, bMenos: bt.Under });
      }
    }
    if (filas.length) await guardar(filas);
    return filas.length;
  };
  const descargar = (nombre, texto) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" })); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); };
  const csv = (filas) => { if (!filas.length) return ""; const cols = Object.keys(filas[0]); const q = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v)); return cols.join(",") + "\n" + filas.map((f) => cols.map((c) => q(f[c])).join(",")).join("\n"); };
  window.cuotasExportar = async () => { const f = await leerTodo(); if (!f.length) return 0; descargar("cuotas-playdoit-bet365-" + fechaMX(Date.now()) + ".csv", csv(f)); return f.length; };

  // ---------- HISTÓRICO DE LIGAS (para entrenar el modelo de goles) ----------
  window.historicoIniciar = function (temporadas = 4) {
    window.__hist = { listo: false, paso: "inicio", n: 0 };
    (async () => {
      const filas = [];
      for (const [id, nom] of LIGAS) {
        const ss = ((await sf("unique-tournament/" + id + "/seasons", 200)) || {}).seasons || [];
        for (const se of ss.slice(0, temporadas)) {
          window.__hist.paso = nom + " " + (se.year || se.name);
          const rr = ((await sf("unique-tournament/" + id + "/season/" + se.id + "/rounds", 200)) || {}).rounds || [];
          const vistas = new Set(), grupos = [];
          for (const r of rr) {
            const ruta = "unique-tournament/" + id + "/season/" + se.id + "/events/round/" + r.round + (r.slug ? "/slug/" + r.slug : "") + (r.prefix ? "/prefix/" + encodeURIComponent(r.prefix) : "");
            grupos.push([r.round, ((await sf(ruta, 200)) || {}).events || []]);
          }
          if (grupos.reduce((a, g) => a + g[1].length, 0) < 100) for (let pg = 0; pg < 40; pg++) { // ligas sin jornadas (MLS): por páginas
            const d = (await sf("unique-tournament/" + id + "/season/" + se.id + "/events/last/" + pg, 200)) || {};
            grupos.push(["", d.events || []]); if (!d.hasNextPage) break;
          }
          for (const [ronda, ev] of grupos) {
            const r = { round: ronda };
            for (const e of ev) {
              if ((e.status || {}).type !== "finished" || vistas.has(e.id)) continue; vistas.add(e.id);
              const g = (x) => (x ? x.normaltime ?? x.current : null);
              filas.push({ liga: nom, temporada: se.year || se.name, fecha: new Date(e.startTimestamp * 1000).toISOString().slice(0, 10), eid: e.id, local: e.homeTeam.name, visita: e.awayTeam.name, gl: g(e.homeScore), gv: g(e.awayScore), ronda: r.round });
            }
            window.__hist.n = filas.length;
          }
        }
      }
      descargar("historico-ligas-" + fechaMX(Date.now()) + ".csv", csv(filas));
      window.__hist = { listo: true, paso: "listo", n: filas.length };
    })().catch((e) => { window.__hist = { listo: true, paso: "ERROR: " + e.message, n: 0 }; });
    return "iniciado";
  };
  return "vivo listo";
})();
  } catch (e) { console.error("valPanel vivo.js", e); }

  // ===== PANEL =====
  try {
(function () {
  // PANEL DE VAL: botón flotante en Sofascore con Radar, Escáner y Soñadora.
  if (window.__valPanelUI) return "panel ya cargado";
  window.__valPanelUI = true;
  const LS = { get(k, d) { try { const v = localStorage.getItem("valPanel." + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem("valPanel." + k, JSON.stringify(v)); } catch (e) {} } };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const diaCorto = (f) => new Date(Date.parse(f + "T12:00:00-06:00")).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", weekday: "short", day: "2-digit" });
  const fechaMX = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  const clave = (p) => p.dia + "|" + p.partido + "|" + p.pick;

  const host = document.createElement("div");
  host.id = "val-panel-host";
  host.style.cssText = "position:fixed;z-index:2147483646;right:16px;bottom:16px;";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
<style>
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  #fab { background:#0f766e; color:#fff; border:0; border-radius:999px; padding:10px 16px; font-size:14px; font-weight:600; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,.25); }
  #panel { position:fixed; right:16px; bottom:64px; width:min(760px, calc(100vw - 32px)); max-height:80vh; display:flex; flex-direction:column; background:#111827; color:#e5e7eb; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,.45); overflow:hidden; font-size:13px; }
  #panel[hidden] { display:none; }
  header { display:flex; align-items:center; gap:4px; padding:8px; background:#0b1220; border-bottom:1px solid #1f2937; }
  header .tab { background:transparent; color:#9ca3af; border:0; padding:6px 10px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; }
  header .tab.on { background:#1f2937; color:#fff; }
  header .sp { flex:1; }
  header #cerrar { background:transparent; border:0; color:#9ca3af; font-size:18px; cursor:pointer; }
  .vista { padding:10px; overflow:auto; }
  .vista[hidden] { display:none; }
  .fila { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:8px; }
  button.acc { background:#0f766e; color:#fff; border:0; border-radius:8px; padding:6px 12px; cursor:pointer; font-weight:600; font-size:13px; }
  button.sec { background:#374151; color:#e5e7eb; border:0; border-radius:8px; padding:6px 10px; cursor:pointer; font-size:12px; }
  button:disabled { opacity:.5; cursor:default; }
  select, input { background:#1f2937; color:#e5e7eb; border:1px solid #374151; border-radius:6px; padding:4px 6px; font-size:12px; }
  .estado { color:#9ca3af; font-size:12px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th { text-align:left; color:#9ca3af; font-weight:600; padding:4px; border-bottom:1px solid #374151; position:sticky; top:0; background:#111827; }
  td { padding:4px; border-bottom:1px solid #1f2937; vertical-align:top; }
  td.n { text-align:right; white-space:nowrap; }
  .pos { color:#34d399; } .neg { color:#f87171; } .rot { color:#fbbf24; font-size:11px; }
  h3 { font-size:13px; margin:10px 0 6px; color:#fff; }
  ul { margin:0; padding-left:18px; } li { margin:3px 0; }
  .total { display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin:8px 0; }
  .total div { background:#1f2937; border-radius:8px; padding:8px; } .total b { display:block; font-size:16px; color:#fff; }
  .aviso { color:#fbbf24; font-size:12px; margin:4px 0; }
  .vacio { color:#6b7280; padding:12px 0; }
</style>
<button id="fab">⚽ Val</button>
<div id="panel" hidden>
  <header>
    <button class="tab on" data-v="radar">📅 Radar</button>
    <button class="tab" data-v="esc">🚨 Escáner</button>
    <button class="tab" data-v="son">🎟️ Soñadora <span id="nsel"></span></button>
    <button class="tab" data-v="vivo">📡 En vivo</button>
    <button class="tab" data-v="datos">🗄️ Datos</button>
    <span class="sp"></span><button id="cerrar" title="Cerrar">×</button>
  </header>
  <div class="vista" id="v-radar">
    <div class="fila">
      <label class="estado">Hasta <input type="date" id="r-hasta"></label>
      <button class="acc" id="r-correr">Correr radar</button>
      <span class="estado" id="r-estado"></span>
    </div>
    <div class="fila">
      <select id="r-dia"><option value="">Todos los días</option></select>
      <select id="r-liga"><option value="">Todas las ligas</option></select>
      <label class="estado"><input type="checkbox" id="r-sinrot"> Sin rotación</label>
      <label class="estado">Prob. mín. <input type="number" id="r-min" value="70" min="50" max="95" style="width:52px"></label>
    </div>
    <div id="r-tabla"></div>
  </div>
  <div class="vista" id="v-esc" hidden>
    <div class="fila">
      <select id="e-dia"><option value="hoy">Hoy</option><option value="mañana">Mañana</option></select>
      <button class="acc" id="e-correr">Escanear momios</button>
      <span class="estado" id="e-estado"></span>
      <label class="estado"><input type="checkbox" id="e-alerta"> 🔔 Alertas cada hora</label>
    </div>
    <div id="e-res"></div>
  </div>
  <div class="vista" id="v-son" hidden>
    <div id="s-res"></div>
  </div>
  <div class="vista" id="v-vivo" hidden>
    <div class="fila">
      <button class="acc" id="v-correr">Revisar en vivo</button>
      <label class="estado"><input type="checkbox" id="v-auto"> 🔔 Vigilar cada 3 min</label>
      <span class="estado" id="v-estado"></span>
    </div>
    <div id="v-res"><div class="vacio">Compara los goles que faltan según el xG del partido contra la cuota de Más/Menos de Playdoit en vivo. Solo partidos que están en Playdoit en vivo, entre el minuto 15 y el 85.</div></div>
  </div>
  <div class="vista" id="v-datos" hidden>
    <h3>📈 Registro de cuotas (Playdoit vs bet365)</h3>
    <div class="fila">
      <label class="estado"><input type="checkbox" id="d-auto"> Guardar cada hora mientras Sofascore esté abierto</label>
      <button class="sec" id="d-ahora">Guardar ahora</button>
      <button class="sec" id="d-export">Exportar CSV</button>
      <span class="estado" id="d-estado"></span>
    </div>
    <div class="estado">Sirve para entrenar el detector de cuotas lentas: con 2-3 semanas de registros se ve cuándo Playdoit tarda en mover sus cuotas. Exporta el archivo y mándamelo.</div>
    <h3>🧠 Modelo entrenado (ligas)</h3>
    <div class="fila">
      <button class="sec" id="d-rat">Actualizar ratings (2 temporadas, ~6-8 min)</button>
      <span class="estado" id="d-rat-estado"></span>
    </div>
    <div class="estado">Re-entrena en tu navegador la fuerza de ataque y defensa de cada equipo con los resultados más recientes. Hazlo cada 2 semanas; el análisis y el radar lo usan solos.</div>
    <h3>🏆 Modelo de copas</h3>
    <div class="fila">
      <button class="sec" id="d-copa">Actualizar modelo de copas (~10 min; la primera vez hasta 1 h)</button>
      <span class="estado" id="d-copa-estado"></span>
    </div>
    <div class="estado">Champions, Europa, Conference, Libertadores y Sudamericana: un rating por equipo que se puede comparar entre ligas. Hazlo cada 2-3 semanas con la pestaña abierta; si se corta o la página se recarga, vuelve a pulsar y sigue donde iba. No toca el modelo de ligas.</div>
    <h3>📚 Histórico de ligas</h3>
    <div class="fila">
      <button class="sec" id="d-hist">Descargar histórico (4 temporadas, ~15 min)</button>
      <span class="estado" id="d-hist-estado"></span>
    </div>
    <div class="estado">Resultados de las 12 ligas top para entrenar el modelo de goles. Deja la pestaña abierta hasta que se descargue el archivo y mándamelo.</div>
  </div>
</div>`;
  const $ = (s) => root.querySelector(s);
  let sel = LS.get("sel", []);
  const guardarSel = () => { LS.set("sel", sel); $("#nsel").textContent = sel.length ? "(" + sel.length + ")" : ""; pintarSon(); };
  const esta = (p) => sel.some((x) => clave(x) === clave(p));
  const alternar = (p) => { sel = esta(p) ? sel.filter((x) => clave(x) !== clave(p)) : [...sel, p]; guardarSel(); };

  $("#fab").onclick = () => { $("#panel").hidden = !$("#panel").hidden; };
  $("#cerrar").onclick = () => { $("#panel").hidden = true; };
  root.querySelectorAll(".tab").forEach((b) => (b.onclick = () => {
    root.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x === b));
    ["radar", "esc", "son", "vivo", "datos"].forEach((v) => ($("#v-" + v).hidden = v !== b.dataset.v));
  }));

  // Tabla genérica de picks con casilla para la soñadora
  function tablaPicks(lista, conDia, conRot) {
    if (!lista.length) return '<div class="vacio">Sin picks con estos filtros.</div>';
    const filas = lista.map((p, i) => `<tr>
      <td><input type="checkbox" data-i="${i}" ${esta(p) ? "checked" : ""}></td>
      ${conDia ? `<td>${esc(diaCorto(p.dia))}</td>` : ""}<td>${esc(p.hora)}</td>
      <td>${esc(p.partido)}<br><span class="estado">${esc(p.liga)}</span>${conRot && p.rot ? `<br><span class="rot">🔄 ${esc(p.rot)}</span>` : ""}</td>
      <td>${esc(p.pick)}</td><td class="n">${Number(p.cuota).toFixed(2)}</td><td class="n">${Math.round(p.prob)}%</td>
      <td class="n ${p.valor >= 0 ? "pos" : "neg"}">${p.valor >= 0 ? "+" : ""}${Math.round(p.valor)}</td></tr>`).join("");
    return `<table><thead><tr><th></th>${conDia ? "<th>Día</th>" : ""}<th>Hora</th><th>Partido</th><th>Pick</th><th>Cuota</th><th>Prob.</th><th>Valor</th></tr></thead><tbody>${filas}</tbody></table>`;
  }
  function conectar(cont, lista) { cont.querySelectorAll("input[type=checkbox][data-i]").forEach((c) => (c.onchange = () => alternar(lista[+c.dataset.i]))); }

  // ---------- Radar ----------
  const domingo = () => { const hoy = fechaMX(Date.now()); const d = new Date(hoy + "T12:00:00-06:00"); return fechaMX(d.getTime() + ((7 - d.getUTCDay()) % 7) * 86400000); };
  $("#r-hasta").value = domingo();
  let radar = LS.get("radar", null);
  function pintarRadar() {
    if (!radar) { $("#r-tabla").innerHTML = '<div class="vacio">Corre el radar para ver los candidatos de la semana.</div>'; return; }
    $("#r-estado").textContent = "Última corrida: " + new Date(radar.ts).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) + " · " + radar.datos.length + " candidatos";
    const dSel = $("#r-dia").value, lSel = $("#r-liga").value;
    const dias = [...new Set(radar.datos.map((p) => p.dia))], ligas = [...new Set(radar.datos.map((p) => p.liga))].sort();
    $("#r-dia").innerHTML = '<option value="">Todos los días</option>' + dias.map((d) => `<option value="${d}" ${d === dSel ? "selected" : ""}>${esc(diaCorto(d))}</option>`).join("");
    $("#r-liga").innerHTML = '<option value="">Todas las ligas</option>' + ligas.map((l) => `<option ${l === lSel ? "selected" : ""}>${esc(l)}</option>`).join("");
    const min = +$("#r-min").value || 0;
    const lista = radar.datos.filter((p) => (!dSel || p.dia === dSel) && (!lSel || p.liga === lSel) && (!$("#r-sinrot").checked || !p.rot) && p.prob >= min)
      .sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : b.prob - a.prob));
    $("#r-tabla").innerHTML = tablaPicks(lista, true, true);
    conectar($("#r-tabla"), lista);
  }
  ["#r-dia", "#r-liga", "#r-sinrot", "#r-min"].forEach((s) => ($(s).onchange = pintarRadar));
  $("#r-correr").onclick = () => {
    if (typeof window.radarIniciar !== "function") { $("#r-estado").textContent = "Error: no cargó el código del radar."; return; }
    $("#r-correr").disabled = true;
    window.radarIniciar($("#r-hasta").value || undefined, 30);
    const t = setInterval(() => {
      const r = window.__radar || {};
      if (!r.listo) { $("#r-estado").textContent = "Corriendo… " + (r.paso || "") + " (tarda 4-7 min)"; return; }
      clearInterval(t); $("#r-correr").disabled = false;
      if (String(r.texto).startsWith("ERROR")) { $("#r-estado").textContent = r.texto; return; }
      radar = { ts: Date.now(), datos: window.__radarDatos || [] }; LS.set("radar", radar); pintarRadar();
    }, 1500);
  };
  pintarRadar();

  // ---------- Escáner ----------
  let escD = LS.get("esc", null);
  function pintarEsc() {
    if (!escD) { $("#e-res").innerHTML = '<div class="vacio">Escanea para ver errores de momio, valor contra bet365 y fáciles con buena cuota.</div>'; return; }
    $("#e-estado").textContent = "Última corrida: " + new Date(escD.ts).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) + " · " + escD.dia;
    const d = escD.datos;
    $("#e-res").innerHTML = `<h3>🚨 Errores de momio factibles (${d.internos.length})</h3>` + (d.internos.length ? "<ul>" + d.internos.slice(0, 20).map((x) => `<li>${esc(x)}</li>`).join("") + "</ul>" : '<div class="vacio">Ninguno.</div>') + '<div class="estado">Playdoit se contradice consigo mismo en una línea con cuota de 2.20 o menos (de las que sí suelen salir).</div>'
      + `<h3>💰 Probables que pagan más que bet365 (${d.valor.length})</h3><div id="e-val"></div><div class="estado">Probabilidad ≥60 % según bet365 y Playdoit paga 7 % o más de lo justo. 15 % o más: posible error. Los de 40 % o más y los partidos cuyo 1X2 no coincide con bet365 se descartan (casi siempre es otro partido mal emparejado).</div>`
      + `<h3>✅ Fáciles con buena cuota (${d.faciles.length})</h3><div id="e-fac"></div><div class="estado">Probabilidad ≥70 % según bet365, cuota ≥1.30 y Playdoit cobrando poco margen. No son errores.</div>`;
    $("#e-val").innerHTML = tablaPicks(d.valor, false, false); conectar($("#e-val"), d.valor);
    $("#e-fac").innerHTML = tablaPicks(d.faciles, false, false); conectar($("#e-fac"), d.faciles);
  }
  $("#e-correr").onclick = () => {
    if (typeof window.escIniciar !== "function") { $("#e-estado").textContent = "Error: no cargó el código del escáner."; return; }
    $("#e-correr").disabled = true;
    const dia = $("#e-dia").value;
    window.escIniciar(dia, 7, -4);
    const t = setInterval(() => {
      const r = window.__esc || {};
      if (!r.listo) { $("#e-estado").textContent = "Escaneando… " + (r.paso || "") + " (tarda 2-4 min)"; return; }
      clearInterval(t); $("#e-correr").disabled = false;
      if (String(r.texto).startsWith("ERROR") || !window.__escDatos) { $("#e-estado").textContent = r.texto; return; }
      escD = { ts: Date.now(), dia, datos: window.__escDatos }; LS.set("esc", escD); pintarEsc();
    }, 1500);
  };
  pintarEsc();

  // ---- v1.4: avisos del navegador
  const avisar = (titulo, cuerpo) => { try { if (window.Notification && Notification.permission === "granted") new Notification(titulo, { body: cuerpo }); } catch (e) {} };
  const pedirPermiso = () => { try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch (e) {} };
  const claveItem = (x) => typeof x === "string" ? x : (x.dia + "|" + x.partido + "|" + x.pick);

  // ---- v1.4: alertas del escáner cada hora
  let tAlerta = null;
  const correrAlerta = () => {
    if (typeof window.escIniciar !== "function" || (window.__esc && window.__esc.listo === false)) return;
    window.escIniciar("hoy", 7, -4);
    const t = setInterval(() => {
      if (!(window.__esc || {}).listo) return; clearInterval(t);
      const d = window.__escDatos; if (!d) return;
      escD = { ts: Date.now(), dia: "hoy", datos: d }; LS.set("esc", escD); pintarEsc();
      const vistos = new Set(LS.get("vistos", []));
      const nuevos = [...d.internos.map((x) => "🚨 " + x), ...d.valor.map((x) => "💰 " + x.partido + ": " + x.pick + " @" + Number(x.cuota).toFixed(2)), ...d.faciles.map((x) => "✅ " + x.partido + ": " + x.pick + " @" + Number(x.cuota).toFixed(2))]
        .filter((x) => !vistos.has(x));
      if (nuevos.length) { avisar("Panel de Val: " + nuevos.length + " nuevo(s) en el escáner", nuevos.slice(0, 3).join("\n")); nuevos.forEach((x) => vistos.add(x)); LS.set("vistos", [...vistos].slice(-500)); }
    }, 2000);
  };
  const ponerAlerta = (on) => { clearInterval(tAlerta); tAlerta = null; LS.set("alerta", on); $("#e-alerta").checked = on; if (on) { pedirPermiso(); tAlerta = setInterval(correrAlerta, 60 * 60000); setTimeout(correrAlerta, 5000); } };
  $("#e-alerta").onchange = () => ponerAlerta($("#e-alerta").checked);
  if (LS.get("alerta", false)) ponerAlerta(true);

  // ---- v1.4: en vivo
  let tVivo = null;
  function pintarVivo() {
    const d = window.__vivoDatos || [];
    $("#v-estado").textContent = "Revisado " + new Date().toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" }) + " · " + d.length + " partidos";
    if (!d.length) { $("#v-res").innerHTML = '<div class="vacio">' + esc((window.__vivo || {}).texto && String(window.__vivo.texto).startsWith("ERROR") ? window.__vivo.texto : "Ahorita no hay partidos en vivo de Playdoit con xG entre el minuto 15 y el 85.") + "</div>"; return; }
    const orden = d.slice().sort((a, b) => (b.senal ? 1 : 0) - (a.senal ? 1 : 0));
    $("#v-res").innerHTML = `<table><thead><tr><th>Min</th><th>Partido</th><th>Marcador</th><th>xG</th><th>Más de</th><th>Modelo</th><th>Cuota</th><th>Señal</th></tr></thead><tbody>` + orden.map((f) => `<tr><td>${f.min}'</td><td>${esc(f.partido)}<br><span class="estado">${esc(f.liga)}</span></td><td>${esc(f.marcador)}</td><td class="n">${f.xg}</td><td class="n">${f.linea} @${f.cMas}<br><span class="estado">Menos @${f.cMenos}</span></td><td class="n">${f.pMas}%</td><td class="n">${f.jMas}%</td><td>${f.senal ? '<b class="pos">' + esc(f.senal) + "</b>" : "—"}</td></tr>`).join("") + `</tbody></table><div class="estado">Modelo = probabilidad de Más de la línea con el ritmo del partido (60 % su xG por minuto + 40 % un partido normal). Señal cuando el modelo supera a la cuota por 7 puntos o más, con 55 % o más y cuota de 1.40 o más. Revisa el partido antes de apostar: una roja o un cambio de ritmo no lo ve el xG.</div>`;
  }
  const correrVivo = (conAviso) => {
    if (typeof window.vivoIniciar !== "function" || (window.__vivo && window.__vivo.listo === false)) return;
    $("#v-correr").disabled = true; $("#v-estado").textContent = "Revisando…";
    window.vivoIniciar();
    const t = setInterval(() => {
      if (!(window.__vivo || {}).listo) return; clearInterval(t); $("#v-correr").disabled = false; pintarVivo();
      if (conAviso) {
        const vistos = new Set(LS.get("vistosVivo", []));
        const nuevas = (window.__vivoDatos || []).filter((f) => f.senal).map((f) => f.partido + " " + f.min + "' " + f.marcador + ": " + f.senal).filter((x) => !vistos.has(x.replace(/ \d+' /, " ")));
        if (nuevas.length) { avisar("Panel de Val: señal en vivo", nuevas.slice(0, 3).join("\n")); nuevas.forEach((x) => vistos.add(x.replace(/ \d+' /, " "))); LS.set("vistosVivo", [...vistos].slice(-200)); }
      }
    }, 1500);
  };
  $("#v-correr").onclick = () => correrVivo(false);
  const ponerVivo = (on) => { clearInterval(tVivo); tVivo = null; LS.set("vivoAuto", on); $("#v-auto").checked = on; if (on) { pedirPermiso(); correrVivo(true); tVivo = setInterval(() => correrVivo(true), 3 * 60000); } };
  $("#v-auto").onchange = () => ponerVivo($("#v-auto").checked);
  if (LS.get("vivoAuto", false)) ponerVivo(true);

  // ---- v1.4: datos (registro de cuotas e histórico)
  let tDatos = null, guardando = false;
  const contar = async () => { if (typeof window.cuotasContar === "function") $("#d-estado").textContent = (await window.cuotasContar()) + " registros guardados"; };
  const guardarCuotas = async () => {
    if (guardando || typeof window.cuotasRegistrar !== "function") return; guardando = true; $("#d-estado").textContent = "Guardando cuotas…";
    try { const n = await window.cuotasRegistrar(); LS.set("datosUlt", Date.now()); $("#d-estado").textContent = (typeof n === "number" ? n + " partidos guardados · " : String(n) + " · "); await contar(); } catch (e) { $("#d-estado").textContent = "Error: " + e.message; }
    guardando = false;
  };
  $("#d-ahora").onclick = guardarCuotas;
  $("#d-export").onclick = async () => { const n = await window.cuotasExportar(); $("#d-estado").textContent = n ? "Exportados " + n + " registros" : "Todavía no hay registros"; };
  const ponerDatos = (on) => { clearInterval(tDatos); tDatos = null; LS.set("datosAuto", on); $("#d-auto").checked = on; if (on) { if (Date.now() - LS.get("datosUlt", 0) > 55 * 60000) setTimeout(guardarCuotas, 8000); tDatos = setInterval(guardarCuotas, 60 * 60000); } };
  $("#d-auto").onchange = () => ponerDatos($("#d-auto").checked);
  if (LS.get("datosAuto", false)) ponerDatos(true);
  contar();
  const ratTxt = () => { if (window.valRatings) $("#d-rat-estado").textContent = "Ratings al " + window.valRatings.fecha(); };
  ratTxt();
  $("#d-rat").onclick = () => {
    if (!window.valRatings) return;
    $("#d-rat").disabled = true; window.valRatings.actualizar();
    const t = setInterval(() => { const h = window.__rat || {}; $("#d-rat-estado").textContent = (h.listo ? "" : "Entrenando… ") + (h.paso || ""); if (h.listo) { clearInterval(t); $("#d-rat").disabled = false; setTimeout(ratTxt, 3000); } }, 2000);
  };
  // ---- v1.6: modelo de copas
  const copaTxt = () => { if (window.valCopa) $("#d-copa-estado").textContent = "Ratings de copa: " + window.valCopa.fecha(); };
  copaTxt();
  $("#d-copa").onclick = () => {
    if (!window.valCopa) { $("#d-copa-estado").textContent = "Error: no cargó el modelo de copas."; return; }
    $("#d-copa").disabled = true; window.valCopa.actualizar();
    const t = setInterval(() => { const h = window.__copaUpd || {}; $("#d-copa-estado").textContent = (h.listo ? "" : "Actualizando… ") + (h.paso || "") + (h.listo ? "" : " · " + (h.llamadas || 0) + " consultas"); if (h.listo) { clearInterval(t); $("#d-copa").disabled = false; } }, 2000);
  };
  $("#d-hist").onclick = () => {
    if (typeof window.historicoIniciar !== "function") return;
    $("#d-hist").disabled = true; window.historicoIniciar(4);
    const t = setInterval(() => { const h = window.__hist || {}; $("#d-hist-estado").textContent = (h.listo ? "Listo: " : "Descargando… ") + (h.paso || "") + " · " + (h.n || 0) + " partidos"; if (h.listo) { clearInterval(t); $("#d-hist").disabled = false; } }, 2000);
  };

  // ---------- Soñadora ----------
  function pintarSon() {
    const c = $("#s-res");
    if (!sel.length) { c.innerHTML = '<div class="vacio">Palomea picks en el Radar o en el Escáner para armar la soñadora.</div>'; return; }
    const orden = sel.slice().sort((a, b) => (a.dia + a.hora < b.dia + b.hora ? -1 : 1));
    const cuota = orden.reduce((a, p) => a * p.cuota, 1), prob = orden.reduce((a, p) => a * p.prob / 100, 1);
    const partidos = orden.map((p) => p.dia + p.partido), repetidos = partidos.length - new Set(partidos).size;
    const conRot = orden.filter((p) => p.rot).length, dias = new Set(orden.map((p) => p.dia)).size;
    c.innerHTML = `<div class="total"><div>Piernas<b>${orden.length}</b></div><div>Cuota combinada<b>${cuota.toFixed(2)}</b></div><div>Prob. de que salgan todas<b>${(prob * 100).toFixed(1)}%</b></div><div>Lo que pide la cuota<b>${(100 / cuota).toFixed(1)}%</b></div></div>`
      + (repetidos ? `<div class="aviso">⚠️ Hay ${repetidos} pierna(s) del mismo partido: no se pueden juntar en un parlay (usa un solo mercado por partido).</div>` : "")
      + (conRot && dias > 1 ? `<div class="aviso">⚠️ ${conRot} pierna(s) con riesgo de rotación en un boleto de varios días.</div>` : "")
      + (prob * 100 > 100 / cuota ? '<div class="estado">✅ La probabilidad combinada supera lo que pide la cuota.</div>' : '<div class="estado">La cuota pide más de lo que da la probabilidad combinada: normal en soñadoras, Playdoit cobra margen en cada pierna.</div>')
      + `<table><thead><tr><th>Día</th><th>Hora</th><th>Partido</th><th>Pick</th><th>Cuota</th><th>Prob.</th><th></th></tr></thead><tbody>`
      + orden.map((p, i) => `<tr><td>${esc(diaCorto(p.dia))}</td><td>${esc(p.hora)}</td><td>${esc(p.partido)}<br><span class="estado">${esc(p.liga)}</span>${p.rot ? `<br><span class="rot">🔄 ${esc(p.rot)}</span>` : ""}</td><td>${esc(p.pick)}</td><td class="n">${Number(p.cuota).toFixed(2)}</td><td class="n">${Math.round(p.prob)}%</td><td><button class="sec" data-q="${i}">✕</button></td></tr>`).join("")
      + `</tbody></table><div class="fila" style="margin-top:10px"><button class="acc" id="s-claude">📋 Copiar para Claude</button><button class="sec" id="s-boleto">Copiar boleto</button><button class="sec" id="s-vaciar">Vaciar</button><button class="sec" id="s-alin">👥 Revisar alineaciones</button><span class="estado" id="s-estado"></span></div><div id="s-alin-res"></div>`;
    c.querySelectorAll("button[data-q]").forEach((b) => (b.onclick = () => { alternar(orden[+b.dataset.q]); pintarRadar(); pintarEsc(); }));
    const copiar = async (txt) => { try { await navigator.clipboard.writeText(txt); $("#s-estado").textContent = "Copiado ✓"; } catch (e) { $("#s-estado").textContent = "No se pudo copiar"; } };
    $("#s-claude").onclick = () => {
      const vistos = []; for (const p of orden) if (!vistos.some((v) => v.dia === p.dia && v.partido === p.partido)) vistos.push(p);
      copiar("/analisis-partidos previo\n" + vistos.map((p, i) => `${i + 1}. ${p.partido} (${p.liga}, ${diaCorto(p.dia)} ${p.hora} CDMX)`).join("\n")
        + "\n\nPicks que estoy considerando: " + orden.map((p) => `${p.partido}: ${p.pick} @${Number(p.cuota).toFixed(2)}`).join("; "));
    };
    $("#s-boleto").onclick = () => copiar(orden.map((p) => `${diaCorto(p.dia)} ${p.hora} · ${p.partido} · ${p.pick} @${Number(p.cuota).toFixed(2)}`).join("\n") + `\nCuota combinada ${cuota.toFixed(2)} · prob. ${(prob * 100).toFixed(1)}%`);
    $("#s-vaciar").onclick = () => { sel = []; guardarSel(); pintarRadar(); pintarEsc(); };
    // v1.3: alineaciones de los partidos de la soñadora (salen ~1 h antes del partido)
    $("#s-alin").onclick = () => {
      const ids = [...new Set(orden.map((p) => p.eid).filter(Boolean))];
      const box = $("#s-alin-res");
      if (!ids.length) { box.innerHTML = '<div class="aviso">Estos picks no traen el id de Sofascore: vuelve a correr el radar o el escáner y palomea de nuevo.</div>'; return; }
      if (typeof window.alinIniciar !== "function") { box.innerHTML = '<div class="aviso">No cargó el código de alineaciones.</div>'; return; }
      $("#s-alin").disabled = true; box.innerHTML = '<div class="estado">Revisando alineaciones…</div>';
      window.alinIniciar(ids);
      const t = setInterval(() => {
        if (!(window.__alin || {}).listo) return;
        clearInterval(t); $("#s-alin").disabled = false;
        const d = window.__alinDatos || [];
        const eq = (x) => x ? `${esc(x.nombre)}: ${x.cambios === null ? "sin comparación" : x.cambios + " cambios"}${x.salen && x.salen.length ? " (salen " + esc(x.salen.join(", ")) + ")" : ""}${x.bajas && x.bajas.length ? " · bajas: " + esc(x.bajas.join(", ")) : ""}` : "";
        const malo = (x) => x && ((x.cambios || 0) >= 5);
        box.innerHTML = d.length ? "<h3>👥 Alineaciones</h3><ul>" + d.map((m) => `<li><b>${esc(m.partido)}</b> · ${esc(m.estado)}${m.local ? `<br>${eq(m.local)}<br>${eq(m.visita)}` : ""}${malo(m.local) || malo(m.visita) ? '<br><span class="rot">⚠️ Rotación fuerte: revisa ese pick antes de apostar</span>' : ""}</li>`).join("") + "</ul>" : `<div class="aviso">${esc((window.__alin || {}).texto || "Sin datos")}</div>`;
      }, 1500);
    };
  }
  guardarSel();
  return "panel listo";
})();
  } catch (e) { console.error("valPanel ui.js", e); }
})();
