/* Ofertas Firmat: lógica de la app (mapa, filtros, cuentas de comercios y ofertas) */
(function () {
  "use strict";

  var CFG = window.OFERTAS_CONFIG || {};
  var CENTRO = CFG.centro || [-33.459, -61.484];
  var sb = (CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase)
    ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey)
    : null;
  var DEMO = !sb;

  var RUBROS = {
    todo: "Todo", comida: "Comida", super: "Súper y almacén", ropa: "Ropa y calzado",
    tecno: "Tecnología", farmacia: "Farmacia", belleza: "Belleza", hogar: "Hogar y ferretería",
    servicios: "Servicios", otros: "Otros"
  };

  // Comercios de ejemplo para el modo demostración (dx, dy en metros desde el centro)
  var DEMO_DATA = [
    ["Pizzería de ejemplo", "comida", 220, 140, [["30% en pizzas grandes de lunes a jueves", 30, 6]]],
    ["Café de ejemplo", "comida", -310, 260, [["2x1 en café con leche antes de las 10", 50, 2], ["Medialunas a mitad de precio", 50, 9]]],
    ["Almacén de ejemplo", "super", 480, -190, [["25% en lácteos y fiambres", 25, 4]]],
    ["Indumentaria de ejemplo", "ropa", 650, 380, [["40% en toda la temporada pasada", 40, 9]]],
    ["Zapatería de ejemplo", "ropa", -560, -80, [["Segundo par al 35%", 35, 1]]],
    ["Tecnología de ejemplo", "tecno", 90, -610, [["20% en auriculares y cargadores", 20, 15]]],
    ["Farmacia de ejemplo", "farmacia", 340, -20, [["20% en dermocosmética", 20, 7]]],
    ["Peluquería de ejemplo", "belleza", -640, -520, [["25% en corte y barba", 25, 10]]],
    ["Bazar de ejemplo", "hogar", 30, 880, [["Hasta 60% en vajilla y textiles", 60, 5]]],
    ["Heladería de ejemplo", "comida", 520, 720, [["30% en el kilo de helado", 30, 8]]]
  ];

  var st = {
    places: [], cat: "todo", q: "", min: 0, sort: "dist", sel: null, me: null,
    session: null, myBiz: null, editingOffer: null, pickLL: null, picking: false, authMode: "in"
  };
  var $ = function (s) { return document.querySelector(s); };

  // ---------- utilidades ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function offset(ll, dx, dy) { return [ll[0] + dy / 111320, ll[1] + dx / (111320 * Math.cos(ll[0] * Math.PI / 180))]; }
  function distM(a, b) {
    var R = 6371000, r = function (x) { return x * Math.PI / 180; };
    var dLat = r(b[0] - a[0]), dLng = r(b[1] - a[1]);
    var h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.pow(Math.sin(dLng / 2), 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function fmtDist(m) { return m < 1000 ? Math.round(m / 10) * 10 + " m" : (m / 1000).toFixed(1).replace(".", ",") + " km"; }
  function isoIn(d) { var t = new Date(); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); }
  function daysLeft(iso) { return Math.ceil((new Date(iso + "T23:59:59") - Date.now()) / 86400000); }
  function fmtEnd(iso) {
    var n = daysLeft(iso);
    if (n < 0) return "Vencida"; if (n === 0) return "Vence hoy"; if (n === 1) return "Vence mañana";
    if (n <= 6) return "Quedan " + n + " días";
    return "Hasta el " + new Date(iso + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  }
  function best(p) { return p.ofertas.reduce(function (a, o) { return o.descuento > a.descuento ? o : a; }, p.ofertas[0]); }
  function soonest(p) { return p.ofertas.reduce(function (a, o) { return o.vence < a ? o.vence : a; }, "9999"); }
  function ref() { return st.me || CENTRO; }
  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function showMsg(el, text, isErr) { el.textContent = text; el.className = "msg" + (isErr ? " err" : ""); el.hidden = !text; }
  function traducir(err) {
    var m = (err && err.message) || String(err || "");
    if (/Invalid login credentials/i.test(m)) return "Email o contraseña incorrectos.";
    if (/Email not confirmed/i.test(m)) return "Todavía no confirmaste tu email. Revisá tu correo (y la carpeta de spam).";
    if (/already registered/i.test(m)) return "Ese email ya tiene una cuenta. Usá la pestaña Ingresar.";
    if (/Password should be at least/i.test(m)) return "La contraseña tiene que tener al menos 6 caracteres.";
    if (/rate limit|too many/i.test(m)) return "Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "No hay conexión con el servidor. Revisá tu internet.";
    return "Hubo un problema: " + m;
  }
  function safeUrl(u) { return /^https:\/\//i.test(u || "") ? u : ""; }

  // ---------- mapa ----------
  var map = L.map("map", { zoomControl: false }).setView(CENTRO, CFG.zoom || 15);
  L.control.zoom({ position: "topleft" }).addTo(map);
  // Calles: OpenStreetMap (gratis, sin clave); si no carga, se pasa solo al mapa de calles de Esri
  var tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  var tileOk = false, tileErr = 0, usingBackup = false;
  function useBackup() {
    if (usingBackup) return; usingBackup = true;
    map.removeLayer(tiles);
    tiles = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap"
    }).addTo(map);
  }
  tiles.on("tileload", function () { tileOk = true; });
  tiles.on("tileerror", function () { if (!tileOk && ++tileErr >= 3) useBackup(); });
  setTimeout(function () { if (!tileOk) useBackup(); }, 6000);
  // El mapa se mide de nuevo cuando cambia el tamaño de la pantalla (celular girado, panel abierto)
  window.addEventListener("resize", function () { map.invalidateSize(); });
  setTimeout(function () { map.invalidateSize(); }, 300);
  var markers = {}, meMarker = null, pickMarker = null;

  function tagIcon(p) {
    return L.divIcon({ className: "tag-marker", iconSize: [0, 0],
      html: '<span class="t' + (st.sel === p.id ? " sel" : "") + '">-' + best(p).descuento + "%</span>" });
  }

  // ---------- datos ----------
  function loadDemo() {
    st.places = DEMO_DATA.map(function (d, i) {
      var ll = offset(CENTRO, d[2], d[3]);
      return {
        id: "demo" + i, nombre: d[0], rubro: d[1], direccion: "Dirección de ejemplo", telefono: "", horario: "Lun a sáb 9 a 20",
        maps_url: "", lat: ll[0], lng: ll[1],
        ofertas: d[4].map(function (o, j) { return { id: "d" + i + "-" + j, titulo: o[0], descuento: o[1], vence: isoIn(o[2]) }; })
      };
    });
  }
  function loadPlaces() {
    if (DEMO) { loadDemo(); render(); return Promise.resolve(); }
    return sb.from("comercios")
      .select("id,nombre,rubro,direccion,telefono,horario,maps_url,lat,lng,ofertas(id,titulo,descuento,vence,creado)")
      .then(function (r) {
        if (r.error) { toast(traducir(r.error)); return; }
        st.places = (r.data || []).map(function (c) {
          c.ofertas = (c.ofertas || []).filter(function (o) { return daysLeft(o.vence) >= 0; });
          return c;
        }).filter(function (c) { return c.ofertas.length; });
        render();
      });
  }

  function filtered() {
    var q = st.q.trim().toLowerCase(), r = ref();
    return st.places.filter(function (p) {
      if (st.cat !== "todo" && p.rubro !== st.cat) return false;
      if (best(p).descuento < st.min) return false;
      if (!q) return true;
      var txt = (p.nombre + " " + p.direccion + " " + (RUBROS[p.rubro] || "") + " " + p.ofertas.map(function (o) { return o.titulo; }).join(" ")).toLowerCase();
      return txt.indexOf(q) >= 0;
    }).map(function (p) {
      p.dist = distM(r, [p.lat, p.lng]); return p;
    }).sort(function (a, b) {
      if (st.sort === "disc") return best(b).descuento - best(a).descuento;
      if (st.sort === "end") return soonest(a).localeCompare(soonest(b));
      return a.dist - b.dist;
    });
  }

  // ---------- render ----------
  function renderChips() {
    $("#chips").innerHTML = Object.keys(RUBROS).map(function (k) {
      return '<button class="chip" data-cat="' + k + '" aria-pressed="' + (st.cat === k) + '">' + RUBROS[k] + "</button>";
    }).join("");
  }
  function render() {
    var list = filtered(), ids = {};
    list.forEach(function (p) { ids[p.id] = true; });
    Object.keys(markers).forEach(function (id) { if (!ids[id]) { markers[id].remove(); delete markers[id]; } });
    list.forEach(function (p) {
      var m = markers[p.id];
      if (!m) {
        m = L.marker([p.lat, p.lng], { icon: tagIcon(p), title: p.nombre, keyboard: true })
          .addTo(map).on("click", function () { if (!st.picking) select(p.id, false); });
        markers[p.id] = m;
      } else { m.setLatLng([p.lat, p.lng]); m.setIcon(tagIcon(p)); }
      m.setZIndexOffset(st.sel === p.id ? 1000 : best(p).descuento);
    });

    var nOf = list.reduce(function (a, p) { return a + p.ofertas.length; }, 0);
    $("#count").textContent = list.length ? nOf + (nOf === 1 ? " oferta" : " ofertas") + " en " + list.length + (list.length === 1 ? " comercio" : " comercios") : "";
    $("#list").innerHTML = list.length ? list.map(function (p) {
      var b = best(p), n = daysLeft(soonest(p)), extra = p.ofertas.length - 1;
      return '<li class="item' + (st.sel === p.id ? " active" : "") + '" data-id="' + esc(p.id) + '" tabindex="0">' +
        '<div class="badge">-' + b.descuento + "%</div>" +
        "<div><h3>" + esc(p.nombre) + "</h3><p>" + esc(b.titulo) + (extra > 0 ? " · +" + extra + (extra === 1 ? " oferta más" : " ofertas más") : "") + "</p>" +
        '<div class="meta"><span>' + fmtDist(p.dist) + '</span><span class="pill">' + esc(RUBROS[p.rubro] || "Otros") + "</span>" +
        '<span class="pill' + (n <= 2 ? " hot" : "") + '">' + fmtEnd(soonest(p)) + "</span></div></div></li>";
    }).join("") : '<li class="empty">' + (st.places.length
      ? "No hay ofertas con estos filtros.<br>Probá otro rubro o bajá el descuento mínimo."
      : "Todavía no hay ofertas cargadas.<br>¿Tenés un comercio? Tocá <b>Soy comercio</b> y cargá la primera.") + "</li>";
    if (st.sel && !ids[st.sel]) closeDetail();
    var note = $("#mapNote");
    note.hidden = st.places.length > 0;
    note.innerHTML = "<b>Todavía no hay ofertas en el mapa.</b> ¿Tenés un comercio en Firmat? Tocá <b>Soy comercio</b> y cargá la primera.";
  }

  function select(id, fly) {
    var p = st.places.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    st.sel = id; render();
    if (fly !== false) map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
    var dest = p.lat + "," + p.lng;
    var maps = safeUrl(p.maps_url);
    var route = maps || "https://www.google.com/maps/dir/?api=1&destination=" + dest + (st.me ? "&origin=" + st.me.join(",") : "");
    var view = maps || "https://www.google.com/maps/search/?api=1&query=" + dest;
    var tel = (p.telefono || "").replace(/[^\d+]/g, "");
    $("#detail").innerHTML =
      '<div class="dtop"><strong>' + esc(p.nombre) + "</strong><span>" + esc(RUBROS[p.rubro] || "Otros") + " · a " + fmtDist(distM(ref(), [p.lat, p.lng])) + "</span>" +
      '<button class="close" id="dClose" aria-label="Cerrar">×</button></div>' +
      '<div class="dbody"><ul class="offers">' + p.ofertas.slice().sort(function (a, b) { return b.descuento - a.descuento; }).map(function (o) {
        return '<li><span class="badge">-' + o.descuento + "%</span><div>" + esc(o.titulo) + "<small>" + fmtEnd(o.vence) + "</small></div></li>";
      }).join("") + "</ul>" +
      "<dl><dt>Dirección</dt><dd>" + esc(p.direccion) + ", Firmat</dd>" +
      (p.horario ? "<dt>Horario</dt><dd>" + esc(p.horario) + "</dd>" : "") +
      (p.telefono ? "<dt>Teléfono</dt><dd>" + esc(p.telefono) + "</dd>" : "") + "</dl>" +
      '<div class="acts"><a class="btn primary" target="_blank" rel="noopener" href="' + esc(route) + '">Cómo llegar</a>' +
      '<a class="btn ghost" target="_blank" rel="noopener" href="' + esc(view) + '">Ver en Google Maps</a>' +
      (tel ? '<a class="btn ghost" href="tel:' + esc(tel) + '">Llamar</a>' : "") + "</div></div>";
    $("#detail").hidden = false;
    $("#dClose").onclick = closeDetail;
    var li = document.querySelector('.item[data-id="' + id + '"]'); if (li) li.scrollIntoView({ block: "nearest" });
  }
  function closeDetail() { st.sel = null; $("#detail").hidden = true; render(); }

  // ---------- vistas ----------
  function show(view) {
    ["Explore", "Auth", "Reset", "Mine"].forEach(function (v) { $("#view" + v).hidden = v.toLowerCase() !== view; });
    $("#panel").classList.toggle("tall", view !== "explore");
    $("#panel").classList.remove("collapsed");
    if (view !== "mine") { setPicking(false); if (pickMarker) { pickMarker.remove(); pickMarker = null; } }
    if (view === "mine") renderMine();
    closeDetail();
  }
  function updateAcct() {
    $("#acctBtn").textContent = st.session ? "Mi comercio" : "Soy comercio";
  }

  // ---------- cuentas ----------
  function setAuthMode(mode) {
    st.authMode = mode;
    $("#tabIn").setAttribute("aria-selected", mode === "in");
    $("#tabUp").setAttribute("aria-selected", mode === "up");
    $("#authTitle").textContent = mode === "in" ? "Ingresá a tu comercio" : "Registrá tu comercio";
    $("#aSubmit").textContent = mode === "in" ? "Ingresar" : "Crear cuenta";
    $("#aPass").autocomplete = mode === "in" ? "current-password" : "new-password";
    $("#aForgot").hidden = mode !== "in";
    showMsg($("#aMsg"), "");
  }
  $("#tabIn").onclick = function () { setAuthMode("in"); };
  $("#tabUp").onclick = function () { setAuthMode("up"); };
  $("#acctBtn").onclick = function () { show(st.session ? "mine" : "auth"); };
  document.querySelectorAll("[data-go]").forEach(function (b) { b.onclick = function () { show(b.dataset.go); }; });

  $("#authForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = $("#aMsg");
    if (DEMO) { showMsg(msg, "Esto es una demostración: todavía falta conectar la base de datos (Supabase) en config.js.", true); return; }
    var email = $("#aEmail").value.trim(), pass = $("#aPass").value, btn = $("#aSubmit");
    btn.disabled = true; showMsg(msg, "");
    var p = st.authMode === "in"
      ? sb.auth.signInWithPassword({ email: email, password: pass })
      : sb.auth.signUp({ email: email, password: pass, options: { emailRedirectTo: location.origin + location.pathname } });
    p.then(function (r) {
      if (r.error) { showMsg(msg, traducir(r.error), true); return; }
      if (st.authMode === "up" && !r.data.session) {
        showMsg(msg, "¡Listo! Te mandamos un mail a " + email + ". Tocá el enlace para activar la cuenta y después ingresá acá.");
        setTimeout(function () { setAuthMode("in"); showMsg($("#aMsg"), "Cuando actives la cuenta desde el mail, ingresá con tu email y contraseña."); }, 50);
        return;
      }
      $("#aPass").value = "";
    }).catch(function (err) { showMsg(msg, traducir(err), true); })
      .then(function () { btn.disabled = false; });
  });
  $("#aForgot").onclick = function () {
    var email = $("#aEmail").value.trim(), msg = $("#aMsg");
    if (DEMO) { showMsg(msg, "Disponible cuando se conecte la base de datos.", true); return; }
    if (!email) { showMsg(msg, "Escribí tu email arriba y tocá de nuevo «Olvidé mi contraseña».", true); return; }
    sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function (r) {
      showMsg(msg, r.error ? traducir(r.error) : "Te mandamos un mail para crear una contraseña nueva.", !!r.error);
    });
  };
  $("#resetForm").addEventListener("submit", function (e) {
    e.preventDefault();
    sb.auth.updateUser({ password: $("#rPass").value }).then(function (r) {
      if (r.error) { showMsg($("#rMsg"), traducir(r.error), true); return; }
      toast("Contraseña actualizada"); show("mine");
    });
  });
  $("#logout").onclick = function () {
    sb.auth.signOut().then(function () { st.myBiz = null; show("explore"); toast("Sesión cerrada"); });
  };

  // ---------- mi comercio ----------
  function loadMine() {
    if (!st.session) { st.myBiz = null; return Promise.resolve(); }
    return sb.from("comercios").select("*, ofertas(*)").eq("id", st.session.user.id).maybeSingle().then(function (r) {
      if (r.error) { toast(traducir(r.error)); return; }
      st.myBiz = r.data || null;
      if (st.myBiz && !st.pickLL) st.pickLL = [st.myBiz.lat, st.myBiz.lng];
      if (!$("#viewMine").hidden) renderMine();
    });
  }
  function setPickMarker(ll) {
    st.pickLL = ll;
    if (!pickMarker) {
      pickMarker = L.marker(ll, { draggable: true, zIndexOffset: 3000,
        icon: L.divIcon({ className: "", html: '<div class="pick-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 22] }) })
        .addTo(map).on("dragend", function () { var p = pickMarker.getLatLng(); st.pickLL = [p.lat, p.lng]; renderLoc(); });
    } else pickMarker.setLatLng(ll);
    renderLoc();
  }
  function renderLoc() {
    var el = $("#locState");
    el.textContent = st.pickLL ? "Ubicación marcada ✓ (podés arrastrar el pin)" : "Sin ubicación en el mapa";
    el.className = "pill" + (st.pickLL ? " ok" : " hot");
  }
  function renderMine() {
    var b = st.myBiz;
    $("#mineTitle").textContent = b ? b.nombre : "Registrá tu comercio";
    $("#mineEmail").textContent = st.session ? st.session.user.email : "";
    $("#bizFormTitle").textContent = b ? "Datos del comercio" : "Paso 1: datos de tu comercio";
    $("#bizSave").textContent = b ? "Guardar cambios" : "Guardar y seguir";
    $("#bNombre").value = b ? b.nombre : "";
    $("#bRubro").value = b ? b.rubro : "comida";
    $("#bTel").value = b ? b.telefono || "" : "";
    $("#bDir").value = b ? b.direccion : "";
    $("#bHorario").value = b ? b.horario || "" : "";
    $("#bMaps").value = b ? b.maps_url || "" : "";
    showMsg($("#bMsg"), "");
    if (st.pickLL) { setPickMarker(st.pickLL); map.setView(st.pickLL, Math.max(map.getZoom(), 16)); } else renderLoc();
    $("#offersBox").hidden = !b;
    $("#bizForm").style.order = b ? 2 : 0;
    resetOfferForm();
    var ofs = b ? (b.ofertas || []).slice().sort(function (x, y) { return y.vence.localeCompare(x.vence); }) : [];
    $("#myOffers").innerHTML = ofs.length ? ofs.map(function (o) {
      var n = daysLeft(o.vence);
      return '<li><span class="badge">-' + o.descuento + "%</span><div>" + esc(o.titulo) +
        '<div class="meta"><span class="pill' + (n < 0 ? " hot" : n <= 2 ? " hot" : " ok") + '">' + fmtEnd(o.vence) + "</span></div></div>" +
        '<div class="tools"><button class="btn ghost small" data-edit="' + o.id + '">Editar</button>' +
        '<button class="btn danger small" data-del="' + o.id + '">Borrar</button></div></li>';
    }).join("") : '<li class="empty" style="display:block;border:1px dashed var(--line)">Todavía no cargaste ofertas. Usá el formulario de arriba.</li>';
  }

  function setPicking(on) {
    st.picking = on; $("#hint").hidden = !on;
    map.getContainer().style.cursor = on ? "crosshair" : "";
    if (on && window.matchMedia("(max-width:760px)").matches) $("#panel").classList.add("collapsed");
  }
  $("#pickBtn").onclick = function () { setPicking(true); };
  $("#hereBtn").onclick = function () {
    geolocate(function (ll, acc) {
      if (distM(ll, CENTRO) > LEJOS_DE_FIRMAT) { toast("Tu ubicación aparece lejos de Firmat. Marcá el local tocando el mapa."); setPicking(true); return; }
      if (acc > 100) { toast("La ubicación es poco precisa (±" + fmtPrec(acc) + "). Ajustá el pin arrastrándolo hasta la puerta del local."); map.flyTo(ll, 17); setPickMarker(ll); return; }
      setPickMarker(ll); map.flyTo(ll, 18); toast("Ubicación del local marcada (±" + fmtPrec(acc) + "). Podés arrastrar el pin para ajustarla.");
    }, { goal: 20, wait: 12000 });
  };
  map.on("click", function (e) {
    if (!st.picking) return;
    setPickMarker([e.latlng.lat, e.latlng.lng]);
    setPicking(false); $("#panel").classList.remove("collapsed");
    toast("Ubicación marcada. Guardá los datos del comercio.");
  });

  $("#bizForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = $("#bMsg"), maps = $("#bMaps").value.trim();
    if (!st.pickLL) { showMsg(msg, "Falta marcar dónde está el local: tocá «Marcar en el mapa».", true); return; }
    if (maps && !safeUrl(maps)) { showMsg(msg, "El link de Google Maps tiene que empezar con https://", true); return; }
    var row = {
      id: st.session.user.id, nombre: $("#bNombre").value.trim(), rubro: $("#bRubro").value,
      telefono: $("#bTel").value.trim() || null, direccion: $("#bDir").value.trim(),
      horario: $("#bHorario").value.trim() || null, maps_url: maps || null, lat: st.pickLL[0], lng: st.pickLL[1]
    };
    var nuevo = !st.myBiz, btn = $("#bizSave"); btn.disabled = true;
    sb.from("comercios").upsert(row).then(function (r) {
      if (r.error) { showMsg(msg, traducir(r.error), true); return; }
      toast(nuevo ? "Comercio registrado. Ahora cargá tu primera oferta." : "Datos guardados");
      return Promise.all([loadMine(), loadPlaces()]);
    }).then(function () { btn.disabled = false; });
  });

  function resetOfferForm() {
    st.editingOffer = null;
    $("#offerForm").reset();
    $("#oDesc").value = 20; $("#oVence").value = isoIn(7); $("#oVence").min = isoIn(0);
    $("#offerFormTitle").textContent = "Nueva oferta";
    $("#oSave").textContent = "Publicar oferta";
    $("#oCancel").hidden = true;
    showMsg($("#oMsg"), "");
  }
  $("#oCancel").onclick = resetOfferForm;
  $("#offerForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var row = {
      comercio_id: st.session.user.id, titulo: $("#oTitulo").value.trim(),
      descuento: Math.max(1, Math.min(100, parseInt($("#oDesc").value, 10) || 1)), vence: $("#oVence").value
    };
    var editing = st.editingOffer, btn = $("#oSave"); btn.disabled = true;
    var q = editing ? sb.from("ofertas").update(row).eq("id", editing) : sb.from("ofertas").insert(row);
    q.then(function (r) {
      if (r.error) { showMsg($("#oMsg"), traducir(r.error), true); return; }
      toast(editing ? "Oferta actualizada" : "Oferta publicada en el mapa");
      return Promise.all([loadMine(), loadPlaces()]);
    }).then(function () { btn.disabled = false; });
  });
  $("#myOffers").addEventListener("click", function (e) {
    var ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
    if (ed) {
      var o = (st.myBiz.ofertas || []).filter(function (x) { return x.id === ed.dataset.edit; })[0]; if (!o) return;
      st.editingOffer = o.id;
      $("#oTitulo").value = o.titulo; $("#oDesc").value = o.descuento; $("#oVence").value = o.vence; $("#oVence").min = "";
      $("#offerFormTitle").textContent = "Editar oferta"; $("#oSave").textContent = "Guardar cambios"; $("#oCancel").hidden = false;
      $("#offerForm").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (del) {
      if (!del.dataset.sure) { del.dataset.sure = "1"; del.textContent = "¿Seguro?"; return; }
      sb.from("ofertas").delete().eq("id", del.dataset.del).then(function (r) {
        if (r.error) { toast(traducir(r.error)); return; }
        toast("Oferta borrada"); return Promise.all([loadMine(), loadPlaces()]);
      });
    }
  });

  // ---------- ubicación del usuario ----------
  // Escucha el GPS unos segundos y se queda con la lectura más precisa.
  // cb(ll, precisionEnMetros). Sin GPS (computadoras) el navegador adivina por internet y puede errar por kilómetros.
  var LEJOS_DE_FIRMAT = 25000; // metros
  function geolocate(cb, opts) {
    opts = opts || {};
    if (!navigator.geolocation) { toast("Tu navegador no permite compartir la ubicación"); return; }
    var bestPos = null, done = false, goal = opts.goal || 30, wait = opts.wait || 8000;
    toast("Buscando tu ubicación…");
    function finish() {
      if (done) return; done = true;
      navigator.geolocation.clearWatch(id); clearTimeout(timer);
      if (bestPos) cb([bestPos.coords.latitude, bestPos.coords.longitude], Math.round(bestPos.coords.accuracy));
      else toast("No se pudo obtener tu ubicación. Revisá que el GPS esté prendido y que el navegador tenga permiso.");
    }
    var id = navigator.geolocation.watchPosition(function (p) {
      if (!bestPos || p.coords.accuracy < bestPos.coords.accuracy) bestPos = p;
      if (p.coords.accuracy <= goal) finish();
    }, function (err) {
      if (err.code === 1) { done = true; navigator.geolocation.clearWatch(id); clearTimeout(timer);
        toast("Diste que no a la ubicación. Podés activarla desde el candado de la barra de direcciones."); }
      else finish();
    }, { enableHighAccuracy: true, timeout: wait, maximumAge: 0 });
    var timer = setTimeout(finish, wait);
  }
  function fmtPrec(m) { return m < 1000 ? m + " m" : (m / 1000).toFixed(1).replace(".", ",") + " km"; }
  var meCircle = null;
  $("#locate").onclick = function () {
    geolocate(function (ll, acc) {
      var lejos = distM(ll, CENTRO);
      if (lejos > LEJOS_DE_FIRMAT) {
        toast("Tu ubicación aparece a " + fmtDist(lejos) + " de Firmat" + (acc > 1000 ? " (es aproximada: tu equipo no tiene GPS)" : "") + ". Te dejo el mapa en Firmat.");
        return;
      }
      st.me = ll;
      if (meMarker) meMarker.setLatLng(ll);
      else meMarker = L.marker(ll, { interactive: false, zIndexOffset: 2000,
        icon: L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(map);
      if (meCircle) meCircle.setLatLng(ll).setRadius(acc);
      else meCircle = L.circle(ll, { radius: acc, color: "#1f56d1", weight: 1, fillOpacity: 0.08, interactive: false }).addTo(map);
      if (acc > 300) { map.flyToBounds(meCircle.getBounds(), { duration: 0.8, maxZoom: 16 }); toast("Ubicación aproximada (±" + fmtPrec(acc) + "). Con GPS prendido es más exacta."); }
      else { map.flyTo(ll, 17, { duration: 0.8 }); toast("Estás acá (±" + fmtPrec(acc) + ")"); }
      st.sort = "dist"; $("#sort").value = "dist"; render();
    });
  };

  // ---------- filtros ----------
  $("#chips").onclick = function (e) { var b = e.target.closest(".chip"); if (!b) return; st.cat = b.dataset.cat; renderChips(); render(); };
  $("#q").oninput = function (e) { st.q = e.target.value; render(); };
  $("#minDisc").oninput = function (e) { st.min = +e.target.value; $("#minVal").textContent = st.min + "%"; render(); };
  $("#sort").onchange = function (e) { st.sort = e.target.value; render(); };
  $("#list").addEventListener("click", function (e) { var li = e.target.closest(".item"); if (li) select(li.dataset.id); });
  $("#list").addEventListener("keydown", function (e) { if (e.key === "Enter") { var li = e.target.closest(".item"); if (li) select(li.dataset.id); } });
  $("#grip").onclick = function () { $("#panel").classList.toggle("collapsed"); };
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { setPicking(false); closeDetail(); } });
  $("#bRubro").innerHTML = Object.keys(RUBROS).filter(function (k) { return k !== "todo"; })
    .map(function (k) { return '<option value="' + k + '">' + RUBROS[k] + "</option>"; }).join("");

  // ---------- inicio ----------
  renderChips();
  $("#demoBanner").hidden = !DEMO;
  loadPlaces();
  if (sb) {
    sb.auth.onAuthStateChange(function (event, session) {
      var was = !!st.session;
      st.session = session; updateAcct();
      if (event === "PASSWORD_RECOVERY") { show("reset"); return; }
      if (session) {
        loadMine().then(function () {
          if (!was && event === "SIGNED_IN" && !$("#viewAuth").hidden) show("mine");
        });
      } else { st.myBiz = null; st.pickLL = null; }
    });
  }
})();
