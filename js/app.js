(function () {
  'use strict';

  const map = L.map('map').setView([0.5071, 101.4478], 8); // Pekanbaru, Riau
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  // Layout flex bisa membuat ukuran peta belum final saat Leaflet pertama
  // kali menghitung dimensinya (terutama di HP/rotasi layar) — ini membuat
  // klik/tap salah posisi atau tidak terdaftar. Paksa hitung ulang.
  setTimeout(function () {
    map.invalidateSize();
  }, 200);
  window.addEventListener('resize', function () {
    map.invalidateSize();
  });

  L.circleMarker([WAREHOUSE.lat, WAREHOUSE.lng], {
    radius: 7,
    color: '#c0392b',
    fillColor: '#e74c3c',
    fillOpacity: 1,
    weight: 2,
  })
    .addTo(map)
    .bindPopup(WAREHOUSE.nama);

  const btnLocate = document.getElementById('btn-locate');
  btnLocate.addEventListener('click', function () {
    if (!navigator.geolocation) {
      alert('Perangkat ini tidak mendukung GPS/lokasi.');
      return;
    }
    btnLocate.disabled = true;
    btnLocate.title = 'Mencari lokasi...';
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        map.setView([pos.coords.latitude, pos.coords.longitude], 15);
        btnLocate.disabled = false;
        btnLocate.title = 'Lokasi Saya';
      },
      function () {
        alert('Gagal mengambil lokasi. Pastikan izin lokasi diaktifkan.');
        btnLocate.disabled = false;
        btnLocate.title = 'Lokasi Saya';
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  async function fetchTransportDistanceKm(destLat, destLng) {
    const url =
      'https://router.project-osrm.org/route/v1/driving/' +
      WAREHOUSE.lng + ',' + WAREHOUSE.lat + ';' + destLng + ',' + destLat +
      '?overview=false';
    const res = await fetch(url);
    if (!res.ok) throw new Error('OSRM request failed');
    const data = await res.json();
    if (!data.routes || !data.routes.length) throw new Error('No route found');
    return data.routes[0].distance / 1000; // km
  }

  const state = {
    step: 'draw', // draw | category | confirm | result
    points: [], // [{lat, lng}]
    markers: [],
    polyline: null,
    distanceMeters: 0,
    category: null,
    poleList: [], // [{lat, lng, code, vertexIndex, isEnd, isGardu}]
    poleMarkerLayers: [],
    undoStack: [], // {undo, redo} — riwayat aksi terpadu untuk seluruh alur
    redoStack: [],
  };

  const el = {
    pointCount: document.getElementById('point-count'),
    liveDistance: document.getElementById('live-distance'),
    btnFinishDraw: document.getElementById('btn-finish-draw'),
    btnResetDraw: document.getElementById('btn-reset-draw'),
    gpsFileInput: document.getElementById('gps-file-input'),
    gpsUploadStatus: document.getElementById('gps-upload-status'),
    btnUndo: document.getElementById('btn-undo'),
    btnRedo: document.getElementById('btn-redo'),
    undoRedoGroup: document.getElementById('undo-redo-group'),
    stepDraw: document.getElementById('step-draw'),
    stepCategory: document.getElementById('step-category'),
    stepConfirm: document.getElementById('step-confirm'),
    stepResult: document.getElementById('step-result'),
    categoryDistance: document.getElementById('category-distance'),
    btnBackToDraw: document.getElementById('btn-back-to-draw'),
    confirmCategory: document.getElementById('confirm-category'),
    confirmDistance: document.getElementById('confirm-distance'),
    garduList: document.getElementById('gardu-list'),
    btnConfirmCalc: document.getElementById('btn-confirm-calc'),
    btnRedoPoints: document.getElementById('btn-redo-points'),
    resultCategory: document.getElementById('result-category'),
    resultDistance: document.getElementById('result-distance'),
    resultPoles: document.getElementById('result-poles'),
    resultTransport: document.getElementById('result-transport'),
    tableRingkasanBiaya: document.getElementById('table-ringkasan-biaya'),
    tableMain: document.getElementById('table-main'),
    tableJenisKonstruksi: document.getElementById('table-jenis-konstruksi'),
    tableNonUtama: document.getElementById('table-non-utama'),
    mapPreview: document.getElementById('map-preview'),
    btnExport: document.getElementById('btn-export'),
    btnExportPdf: document.getElementById('btn-export-pdf'),
    btnNew: document.getElementById('btn-new'),
  };

  // Capture peta (termasuk rute & marker yang sedang tergambar) jadi gambar
  // PNG, dipakai untuk pratinjau di panel dan latar export PDF.
  async function captureMapImage() {
    const canvas = await html2canvas(document.getElementById('map'), { useCORS: true, allowTaint: false });
    return canvas.toDataURL('image/png');
  }

  // --- Riwayat aksi terpadu (undo/redo untuk seluruh alur, bukan cuma titik) ---
  function updateUndoRedoButtons() {
    el.btnUndo.disabled = state.undoStack.length === 0;
    el.btnRedo.disabled = state.redoStack.length === 0;
  }

  function doAction(action) {
    action.redo();
    state.undoStack.push(action);
    state.redoStack = [];
    updateUndoRedoButtons();
  }

  function undo() {
    if (!state.undoStack.length) return;
    const action = state.undoStack.pop();
    action.undo();
    state.redoStack.push(action);
    updateUndoRedoButtons();
  }

  function redo() {
    if (!state.redoStack.length) return;
    const action = state.redoStack.pop();
    action.redo();
    state.undoStack.push(action);
    updateUndoRedoButtons();
  }

  function clearHistory() {
    state.undoStack = [];
    state.redoStack = [];
    updateUndoRedoButtons();
  }

  el.btnUndo.addEventListener('click', undo);
  el.btnRedo.addEventListener('click', redo);

  function haversine(a, b) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function bearing(a, b) {
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;
    const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
    const x =
      Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
      Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  // Sudut belokan di titik `curr`: 0deg = lurus, 180deg = balik arah penuh.
  function turnAngle(prev, curr, next) {
    const bIn = bearing(prev, curr);
    const bOut = bearing(curr, next);
    let diff = Math.abs(bOut - bIn);
    if (diff > 180) diff = 360 - diff;
    return diff;
  }

  function classifyPoint(angleDeg, category) {
    const codes = CODE_SET[category];
    if (category === 'JTR_MURNI') {
      return angleDeg <= 15 ? codes.straight : codes.corner;
    }
    if (angleDeg <= 15) return codes.straight;
    if (angleDeg <= 30) return codes.double;
    if (angleDeg <= 60) return codes.tension;
    return codes.corner;
  }

  function formatDistance(m) {
    if (m < 1000) return Math.round(m) + ' m';
    return (m / 1000).toFixed(2) + ' km (' + Math.round(m) + ' m)';
  }

  // Titik pertama (points[0]) = tiang eksisting jaringan PLN (tidak dibangun
  // baru, tapi tetap butuh material sambungan -> kode existing di CODE_SET).
  // Tiap titik yang diklik user (selain titik pertama) selalu jadi tiang baru:
  // titik terakhir -> kode "akhir", titik tengah -> diklasifikasi dari sudut
  // belokannya. Di antara titik yang berjauhan, disisipi tiang lurus (default)
  // tiap `span` meter.
  function buildPoleList(points, span, category) {
    const codes = CODE_SET[category];
    const poles = [];
    for (let i = 1; i < points.length; i++) {
      const segStart = points[i - 1];
      const segEnd = points[i];
      const segLen = haversine(segStart, segEnd);

      let d = span;
      while (d < segLen) {
        const frac = d / segLen;
        poles.push({
          lat: segStart.lat + (segEnd.lat - segStart.lat) * frac,
          lng: segStart.lng + (segEnd.lng - segStart.lng) * frac,
          code: codes.straight,
          vertexIndex: null,
          isEnd: false,
          isGardu: false,
        });
        d += span;
      }

      const isEnd = i === points.length - 1;
      const code = isEnd ? codes.end : classifyPoint(turnAngle(points[i - 1], points[i], points[i + 1]), category);
      poles.push({
        lat: segEnd.lat,
        lng: segEnd.lng,
        code,
        vertexIndex: i,
        isEnd,
        isGardu: false,
      });
    }
    return poles;
  }

  function recomputeDistance() {
    let total = 0;
    for (let i = 1; i < state.points.length; i++) {
      total += haversine(state.points[i - 1], state.points[i]);
    }
    state.distanceMeters = total;
  }

  function redrawPolyline() {
    if (state.polyline) {
      map.removeLayer(state.polyline);
      state.polyline = null;
    }
    if (state.points.length > 1) {
      state.polyline = L.polyline(state.points.map((p) => [p.lat, p.lng]), {
        color: '#0b3d91',
        weight: 4,
      }).addTo(map);
    }
  }

  function updateDrawUI() {
    el.pointCount.textContent = String(state.points.length);
    el.liveDistance.textContent = formatDistance(state.distanceMeters);
    el.btnFinishDraw.disabled = state.points.length < 2;
  }

  const pointIcon = L.divIcon({
    className: 'route-point-icon',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  function setMarkersDraggable(enabled) {
    state.markers.forEach((m) => (enabled ? m.dragging.enable() : m.dragging.disable()));
  }

  // Marker titik rute (biru) berada persis di lokasi yang sama dengan marker
  // tiang (oranye) di titik itu, dan pane marker Leaflet selalu di atas pane
  // overlay tempat circleMarker berada -- jadi marker biru selalu menutupi
  // dan menangkap klik yang seharusnya menuju tiang oranye di bawahnya.
  // Begitu selesai menitik, marker biru tidak lagi interaktif (tidak bisa
  // digeser), jadi sembunyikan saja supaya tiang oranye di titik yang sama
  // langsung terlihat dan bisa diklik. Titik pertama (indeks 0) tetap
  // ditampilkan karena tidak punya tiang oranye pasangannya (dianggap
  // sambungan ke tiang existing).
  function setRouteMarkersHiddenAfterDraw(hidden) {
    state.markers.forEach((m, idx) => {
      if (idx === 0) return;
      const icon = m.getElement();
      if (icon) icon.style.display = hidden ? 'none' : '';
    });
  }

  function addPointMarker(p) {
    const marker = L.marker([p.lat, p.lng], { icon: pointIcon, draggable: true }).addTo(map);
    marker.on('drag', function (ev) {
      const idx = state.markers.indexOf(marker);
      const ll = ev.target.getLatLng();
      state.points[idx] = { lat: ll.lat, lng: ll.lng };
      redrawPolyline();
      recomputeDistance();
      updateDrawUI();
    });
    state.markers.push(marker);
    return marker;
  }

  map.on('click', function (e) {
    if (state.step !== 'draw') return;
    const p = { lat: e.latlng.lat, lng: e.latlng.lng };
    doAction({
      redo: function () {
        state.points.push(p);
        addPointMarker(p);
        redrawPolyline();
        recomputeDistance();
        updateDrawUI();
      },
      undo: function () {
        state.points.pop();
        const marker = state.markers.pop();
        map.removeLayer(marker);
        redrawPolyline();
        recomputeDistance();
        updateDrawUI();
      },
    });
  });

  function clearPoleMarkers() {
    state.poleMarkerLayers.forEach((m) => map.removeLayer(m));
    state.poleMarkerLayers = [];
  }

  function poleMarkerStyle(pole) {
    if (pole.isGardu) {
      return { radius: 8, color: '#ffffff', fillColor: '#8e44ad', fillOpacity: 1, weight: 2 };
    }
    return { radius: 6, color: '#ffffff', fillColor: '#e67e22', fillOpacity: 1, weight: 2 };
  }

  function poleTooltip(pole) {
    if (pole.isGardu) return 'Lokasi Gardu (klik untuk batal) - ' + pole.code;
    if (pole.vertexIndex !== null) return pole.code + ' (klik untuk tandai Gardu)';
    return pole.code;
  }

  // Gardu boleh ditandai di lebih dari 1 titik sekaligus (beberapa lokasi
  // butuh 2+ trafo) — tiap titik independen, tidak saling menghapus.
  function toggleGardu(pole) {
    const wasGardu = pole.isGardu;
    doAction({
      redo: function () {
        pole.isGardu = !wasGardu;
        if (pole.isGardu && !pole.garduKva) pole.garduKva = 100;
        renderPoleMarkers();
      },
      undo: function () {
        pole.isGardu = wasGardu;
        renderPoleMarkers();
      },
    });
  }

  function renderGarduList() {
    const garduPoles = state.poleList.filter((p) => p.isGardu);
    el.garduList.innerHTML = '';
    garduPoles.forEach(function (pole, i) {
      const div = document.createElement('div');
      div.className = 'gardu-item';
      const options = [50, 100, 160]
        .map(function (k) {
          return '<option value="' + k + '"' + (pole.garduKva === k ? ' selected' : '') + '>' + k + ' kVA</option>';
        })
        .join('');
      div.innerHTML =
        '<span class="gardu-item-label">Gardu ' + (i + 1) + '</span>' +
        '<select class="select-kva" data-vertex="' + pole.vertexIndex + '">' + options + '</select>' +
        '<button type="button" class="btn-remove-gardu" data-vertex="' + pole.vertexIndex + '">Hapus</button>';
      el.garduList.appendChild(div);
    });
  }

  el.garduList.addEventListener('change', function (e) {
    if (!e.target.classList.contains('select-kva')) return;
    const vi = Number(e.target.dataset.vertex);
    const pole = state.poleList.find((p) => p.vertexIndex === vi);
    if (pole) pole.garduKva = Number(e.target.value);
  });

  el.garduList.addEventListener('click', function (e) {
    if (!e.target.classList.contains('btn-remove-gardu')) return;
    const vi = Number(e.target.dataset.vertex);
    const pole = state.poleList.find((p) => p.vertexIndex === vi);
    if (pole) toggleGardu(pole);
  });

  function renderPoleMarkers() {
    clearPoleMarkers();
    state.poleMarkerLayers = state.poleList.map(function (pole) {
      const marker = L.circleMarker([pole.lat, pole.lng], poleMarkerStyle(pole)).addTo(map);
      marker.bindTooltip(poleTooltip(pole), { permanent: false, direction: 'top' });
      if (pole.vertexIndex !== null) {
        marker.on('click', function () {
          toggleGardu(pole);
        });
      }
      return marker;
    });
    renderGarduList();
  }

  function resetPoints() {
    state.points = [];
    state.markers.forEach((m) => map.removeLayer(m));
    state.markers = [];
    if (state.polyline) {
      map.removeLayer(state.polyline);
      state.polyline = null;
    }
    state.poleList = [];
    clearPoleMarkers();
    state.distanceMeters = 0;
    updateDrawUI();
  }

  // --- Upload track GPS (KML/KMZ) ---

  function parseKMLText(text) {
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    const coordEls = xml.getElementsByTagName('coordinates');
    let coordsText = '';
    for (let i = 0; i < coordEls.length; i++) {
      const parentTag = coordEls[i].parentNode && coordEls[i].parentNode.tagName;
      if (parentTag === 'LineString') {
        coordsText = coordEls[i].textContent;
        break;
      }
    }
    if (!coordsText && coordEls.length) {
      coordsText = Array.from(coordEls)
        .map((el) => el.textContent)
        .join(' ');
    }
    return coordsText
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((tuple) => {
        const parts = tuple.split(',');
        return { lat: parseFloat(parts[1]), lng: parseFloat(parts[0]) };
      })
      .filter((p) => !isNaN(p.lat) && !isNaN(p.lng));
  }

  async function parseKMZFile(file) {
    const zip = await JSZip.loadAsync(file);
    let kmlEntry = null;
    zip.forEach((relPath, entry) => {
      if (!kmlEntry && relPath.toLowerCase().endsWith('.kml')) kmlEntry = entry;
    });
    if (!kmlEntry) throw new Error('Tidak ada file .kml di dalam KMZ');
    const text = await kmlEntry.async('text');
    return parseKMLText(text);
  }

  // Jarak tegak lurus titik `p` terhadap garis lurus (a-b), dalam meter,
  // pakai proyeksi datar lokal (cukup akurat untuk radius simplifikasi kecil).
  function perpendicularDistanceMeters(p, a, b) {
    const R = 6371000;
    const toXY = (pt) => ({
      x: ((pt.lng - a.lng) * Math.PI * R * Math.cos((a.lat * Math.PI) / 180)) / 180,
      y: ((pt.lat - a.lat) * Math.PI * R) / 180,
    });
    const P = toXY(p);
    const A = { x: 0, y: 0 };
    const B = toXY(b);
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt(P.x * P.x + P.y * P.y);
    const t = Math.max(0, Math.min(1, (P.x * dx + P.y * dy) / lenSq));
    const projX = A.x + t * dx;
    const projY = A.y + t * dy;
    return Math.sqrt((P.x - projX) ** 2 + (P.y - projY) ** 2);
  }

  // Sederhanakan track GPS padat jadi titik-titik belokan penting saja
  // (algoritma Douglas-Peucker), supaya tidak jadi ratusan tiang per meter.
  function simplifyTrack(points, toleranceMeters) {
    if (points.length < 3) return points.slice();
    let maxDist = 0;
    let index = 0;
    const last = points.length - 1;
    for (let i = 1; i < last; i++) {
      const d = perpendicularDistanceMeters(points[i], points[0], points[last]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > toleranceMeters) {
      const left = simplifyTrack(points.slice(0, index + 1), toleranceMeters);
      const right = simplifyTrack(points.slice(index), toleranceMeters);
      return left.slice(0, -1).concat(right);
    }
    return [points[0], points[last]];
  }

  function loadTrackAsRoute(points) {
    const prevPoints = state.points.slice();
    function applyPoints(pts) {
      resetPoints();
      pts.forEach((p) => {
        state.points.push(p);
        addPointMarker(p);
      });
      redrawPolyline();
      recomputeDistance();
      updateDrawUI();
      if (state.polyline) map.fitBounds(state.polyline.getBounds(), { padding: [30, 30] });
    }
    doAction({
      redo: function () {
        applyPoints(points);
      },
      undo: function () {
        applyPoints(prevPoints);
      },
    });
  }

  el.gpsFileInput.addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file) return;
    if (state.step !== 'draw') {
      e.target.value = '';
      return;
    }
    el.gpsUploadStatus.textContent = 'Membaca file...';
    try {
      let rawPoints;
      if (file.name.toLowerCase().endsWith('.kmz')) {
        rawPoints = await parseKMZFile(file);
      } else {
        rawPoints = parseKMLText(await file.text());
      }
      if (rawPoints.length < 2) {
        el.gpsUploadStatus.textContent = 'File tidak berisi track/garis yang valid.';
        return;
      }
      const simplified = simplifyTrack(rawPoints, 8);
      loadTrackAsRoute(simplified);
      el.gpsUploadStatus.textContent =
        'Track dimuat: ' + simplified.length + ' titik (disederhanakan dari ' + rawPoints.length + ' titik asli).';
    } catch (err) {
      el.gpsUploadStatus.textContent = 'Gagal membaca file: ' + err.message;
    } finally {
      e.target.value = '';
    }
  });

  function showStep(step) {
    state.step = step;
    el.stepDraw.hidden = step !== 'draw';
    el.stepCategory.hidden = step !== 'category';
    el.stepConfirm.hidden = step !== 'confirm';
    el.stepResult.hidden = step !== 'result';
  }

  el.btnResetDraw.addEventListener('click', function () {
    resetPoints();
    clearHistory();
  });

  el.btnFinishDraw.addEventListener('click', function () {
    doAction({
      redo: function () {
        setMarkersDraggable(false);
        setRouteMarkersHiddenAfterDraw(true);
        el.categoryDistance.textContent = formatDistance(state.distanceMeters);
        showStep('category');
      },
      undo: function () {
        setMarkersDraggable(true);
        setRouteMarkersHiddenAfterDraw(false);
        showStep('draw');
      },
    });
  });

  el.btnBackToDraw.addEventListener('click', undo);

  document.querySelectorAll('.btn-choice').forEach((btn) => {
    btn.addEventListener('click', function () {
      const category = btn.dataset.category;
      const span = SPAN[category];
      const newPoleList = buildPoleList(state.points, span, category);
      doAction({
        redo: function () {
          state.category = category;
          state.poleList = newPoleList;
          el.confirmCategory.textContent = CATEGORY_LABELS[category];
          el.confirmDistance.textContent = formatDistance(state.distanceMeters);
          renderPoleMarkers();
          showStep('confirm');
        },
        undo: function () {
          clearPoleMarkers();
          state.poleList = [];
          showStep('category');
        },
      });
    });
  });

  el.btnRedoPoints.addEventListener('click', function () {
    resetPoints();
    clearHistory();
    showStep('draw');
  });

  // Gabungkan daftar kode (termasuk gardu yang jadi 2 entri, dan titik
  // existing) jadi ringkasan Pekerjaan Konstruksi (Jasa) + agregat Material
  // Non Utama, lengkap dengan harga dari RAB KR JASA.
  function aggregateCodes(codeList, category) {
    const counts = {};
    codeList.forEach((c) => {
      counts[c] = (counts[c] || 0) + 1;
    });

    let totalJasa = 0;
    let materialDalamKonstruksi = 0;
    const jenisRows = Object.keys(counts)
      .sort()
      .map((code) => {
        const info = CONSTRUCTION_CODES[code];
        const count = counts[code];
        const jasaSubtotal = info.jasaHarga * count;
        const materialSubtotal = (info.materialHarga || 0) * count;
        totalJasa += jasaSubtotal;
        materialDalamKonstruksi += materialSubtotal;
        return {
          code,
          title: info.title,
          count,
          harga: info.jasaHarga,
          subtotal: jasaSubtotal + materialSubtotal,
        };
      });

    const recipe = NON_UTAMA_RECIPE[category] || [];
    let totalNonUtama = materialDalamKonstruksi;
    const materialRows = [];
    recipe.forEach((item) => {
      let qty = 0;
      Object.keys(item.per_code).forEach((code) => {
        qty += (counts[code] || 0) * item.per_code[code];
      });
      if (qty > 0) {
        const subtotal = qty * item.harga;
        totalNonUtama += subtotal;
        materialRows.push({ nama: item.nama, satuan: item.satuan, harga: item.harga, qty, subtotal });
      }
    });

    return { jenisRows, materialRows, totalJasa, totalNonUtama };
  }

  function computeMaterials() {
    const codes = CODE_SET[state.category];
    const codeList = [];
    let totalPoles = 0;
    let garduCount = 0;

    state.poleList.forEach((pole) => {
      if (pole.isGardu) {
        codeList.push(codes.straight, pole.isEnd ? codes.end : codes.straight);
        totalPoles += 2;
        garduCount += 1;
      } else {
        codeList.push(pole.code);
        totalPoles += 1;
      }
    });
    if (codes.existing) {
      codeList.push(codes.existing);
    }

    let totalMaterialUtama = 0;
    const mainRows = MAIN_MATERIALS[state.category].map((item) => {
      const qty = item.qtyFrom === 'poles' ? totalPoles : Math.round(state.distanceMeters);
      const harga = MATERIAL_UTAMA_PRICES[item.nama] || 0;
      const subtotal = qty * harga;
      totalMaterialUtama += subtotal;
      return { nama: item.nama, satuan: item.satuan, qty, harga, subtotal };
    });

    // Bisa ada beberapa gardu dengan kVA berbeda-beda sekaligus -> kelompokkan
    // per kVA supaya masing-masing jadi baris tersendiri di Material Utama.
    let trafoSubtotal = 0;
    if (garduCount > 0) {
      const kvaGroups = {};
      state.poleList
        .filter((p) => p.isGardu)
        .forEach((p) => {
          const kva = p.garduKva || 100;
          kvaGroups[kva] = (kvaGroups[kva] || 0) + 1;
        });
      Object.keys(kvaGroups)
        .sort((a, b) => a - b)
        .forEach((kva) => {
          const qty = kvaGroups[kva];
          const harga = TRAFO_PRICES[kva] || 0;
          const subtotal = harga * qty;
          trafoSubtotal += subtotal;
          totalMaterialUtama += subtotal;
          mainRows.push({
            nama: 'Trafo Distribusi ' + kva + ' kVA',
            satuan: 'Unit',
            qty,
            harga,
            subtotal,
          });
        });
    }

    const { jenisRows, materialRows, totalJasa, totalNonUtama } = aggregateCodes(codeList, state.category);

    const totalAksesorisJasa = totalJasa + totalNonUtama;
    const grandTotal = totalMaterialUtama + totalJasa + totalNonUtama;

    return {
      totalPoles,
      mainRows,
      jenisRows,
      materialRows,
      garduCount,
      trafoSubtotal,
      totalMaterialUtama,
      totalJasa,
      totalNonUtama,
      totalAksesorisJasa,
      grandTotal,
    };
  }

  function formatRupiah(n) {
    return 'Rp ' + Math.round(n).toLocaleString('id-ID');
  }

  function renderTable(tableEl, rows) {
    tableEl.innerHTML =
      '<thead><tr><th>No</th><th>Uraian Material</th><th>Satuan</th><th>Volume</th><th>Harga Satuan</th><th>Jumlah Harga</th></tr></thead>';
    const tbody = document.createElement('tbody');
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + (i + 1) + '</td><td>' + r.nama + '</td><td>' + r.satuan + '</td><td class="num">' + r.qty +
        '</td><td class="num">' + formatRupiah(r.harga) + '</td><td class="num">' + formatRupiah(r.subtotal) + '</td>';
      tbody.appendChild(tr);
    });
    tableEl.appendChild(tbody);
  }

  function renderJenisKonstruksiTable(tableEl, rows) {
    tableEl.innerHTML =
      '<thead><tr><th>Kode</th><th>Nama Konstruksi</th><th>Jumlah Titik</th><th>Harga Satuan</th><th>Jumlah Harga</th></tr></thead>';
    const tbody = document.createElement('tbody');
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + r.code + '</td><td>' + r.title + '</td><td class="num">' + r.count +
        '</td><td class="num">' + formatRupiah(r.harga) + '</td><td class="num">' + formatRupiah(r.subtotal) + '</td>';
      tbody.appendChild(tr);
    });
    tableEl.appendChild(tbody);
  }

  function renderRingkasanBiaya(tableEl, result) {
    const rows = [
      ['Total Material Utama (MDU)', result.totalMaterialUtama],
      ['Total Jasa (Pekerjaan Konstruksi)', result.totalJasa],
      ['Total Material Non Utama (Aksesoris)', result.totalNonUtama],
      ['Total Aksesoris + Jasa', result.totalAksesorisJasa],
      ['GRAND TOTAL', result.grandTotal],
    ];
    tableEl.innerHTML = '<thead><tr><th>Komponen</th><th>Jumlah</th></tr></thead>';
    const tbody = document.createElement('tbody');
    rows.forEach(([label, value]) => {
      const tr = document.createElement('tr');
      if (label === 'GRAND TOTAL') tr.style.fontWeight = 'bold';
      tr.innerHTML = '<td>' + label + '</td><td class="num">' + formatRupiah(value) + '</td>';
      tbody.appendChild(tr);
    });
    if (result.garduCount > 0) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>Termasuk Trafo Gardu</td><td class="num">' + formatRupiah(result.trafoSubtotal) + '</td>';
      tbody.appendChild(tr);
    }
    tableEl.appendChild(tbody);
  }

  let lastResult = null;

  el.btnConfirmCalc.addEventListener('click', function () {
    doAction({
      redo: function () {
        const result = computeMaterials();
        lastResult = result;

        el.resultCategory.textContent = CATEGORY_LABELS[state.category];
        el.resultDistance.textContent = formatDistance(state.distanceMeters);
        el.resultPoles.textContent = result.totalPoles + ' batang';

        renderRingkasanBiaya(el.tableRingkasanBiaya, result);
        renderTable(el.tableMain, result.mainRows);
        renderJenisKonstruksiTable(el.tableJenisKonstruksi, result.jenisRows);
        renderTable(el.tableNonUtama, result.materialRows);

        showStep('result');

        el.mapPreview.removeAttribute('src');
        captureMapImage()
          .then(function (dataUrl) {
            lastResult.mapImage = dataUrl;
            el.mapPreview.src = dataUrl;
          })
          .catch(function () {
            lastResult.mapImage = null;
          });

        el.resultTransport.textContent = 'Menghitung...';
        const dest = state.points[state.points.length - 1];
        fetchTransportDistanceKm(dest.lat, dest.lng)
          .then(function (km) {
            lastResult.transportKm = km;
            el.resultTransport.textContent = km.toFixed(1) + ' km (estimasi rute jalan darat)';
          })
          .catch(function () {
            lastResult.transportKm = null;
            el.resultTransport.textContent = 'Tidak bisa dihitung (cek koneksi internet)';
          });
      },
      undo: function () {
        showStep('confirm');
      },
    });
  });

  el.btnNew.addEventListener('click', function () {
    resetPoints();
    clearHistory();
    state.category = null;
    lastResult = null;
    showStep('draw');
  });

  el.btnExport.addEventListener('click', function () {
    if (!lastResult) return;
    const rows = [['No', 'Uraian', 'Satuan', 'Volume', 'Harga Satuan', 'Jumlah Harga']];
    let no = 1;
    rows.push([
      '',
      'Jarak Transportasi (Gudang → Lokasi)',
      'km',
      lastResult.transportKm != null ? lastResult.transportKm.toFixed(1) : 'n/a',
      '',
      '',
    ]);
    rows.push(['', 'MATERIAL UTAMA', '', '', '', '']);
    lastResult.mainRows.forEach((r) => {
      rows.push([no++, r.nama, r.satuan, r.qty, r.harga, r.subtotal]);
    });
    rows.push(['', 'PEKERJAAN KONSTRUKSI (JASA)', '', '', '', '']);
    lastResult.jenisRows.forEach((r) => {
      rows.push([no++, r.code + ' - ' + r.title, 'Titik', r.count, r.harga, r.subtotal]);
    });
    rows.push(['', 'MATERIAL NON UTAMA', '', '', '', '']);
    lastResult.materialRows.forEach((r) => {
      rows.push([no++, r.nama, r.satuan, r.qty, r.harga, r.subtotal]);
    });

    rows.push(['', '', '', '', '', '']);
    rows.push(['', 'RINGKASAN BIAYA', '', '', '', '']);
    rows.push(['', 'Total Material Utama (MDU)', '', '', '', lastResult.totalMaterialUtama]);
    rows.push(['', 'Total Jasa (Pekerjaan Konstruksi)', '', '', '', lastResult.totalJasa]);
    rows.push(['', 'Total Material Non Utama (Aksesoris)', '', '', '', lastResult.totalNonUtama]);
    rows.push(['', 'Total Aksesoris + Jasa', '', '', '', lastResult.totalAksesorisJasa]);
    rows.push(['', 'GRAND TOTAL', '', '', '', lastResult.grandTotal]);
    if (lastResult.garduCount > 0) {
      rows.push(['', 'Termasuk Trafo Gardu', '', '', '', lastResult.trafoSubtotal]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 45 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estimasi Material');

    const catLabel = CATEGORY_LABELS[state.category].replace(/[^a-z0-9]+/gi, '-');
    const fname = 'estimasi-material-' + catLabel + '-' + Date.now() + '.xlsx';
    XLSX.writeFile(wb, fname);
  });

  // --- Export PDF gaya gambar teknis (peta + tabel material, tanpa harga) ---

  function buildJenisPekerjaanRows(result) {
    const distKm = (state.distanceMeters / 1000).toFixed(3);
    const volumeLabel = { JTM: 'SUTM Murni', JTR_MURNI: 'SUTR Murni', NUMPANG: 'SUTM & SUTR Numpang' }[state.category];
    const rows = [[volumeLabel, distKm, 'KMS']];
    result.mainRows.forEach((r) => {
      if (r.nama.indexOf('Conductor') !== -1 || r.nama.indexOf('Kabel') !== -1) return;
      rows.push([r.nama, String(r.qty), r.satuan]);
    });
    return rows;
  }

  function buildMaterialTerpasangRows(result) {
    return result.jenisRows.map((r) => [r.code, r.title, String(r.count), 'SET']);
  }

  el.btnExportPdf.addEventListener('click', async function () {
    if (!lastResult) return;
    el.btnExportPdf.disabled = true;
    const originalLabel = el.btnExportPdf.textContent;
    el.btnExportPdf.textContent = 'Menyiapkan PDF...';
    try {
      const mapImage = lastResult.mapImage || (await captureMapImage());
      const jsPDFCtor = window.jspdf.jsPDF;
      const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      doc.setFontSize(12);
      doc.text('RENCANA PEKERJAAN PEMBANGUNAN JARINGAN DISTRIBUSI', 10, 12);
      doc.setFontSize(9);
      doc.text('Kategori: ' + CATEGORY_LABELS[state.category], 10, 19);
      doc.text('Jarak Rute: ' + formatDistance(state.distanceMeters), 10, 24);
      doc.text('Jumlah Tiang: ' + lastResult.totalPoles + ' batang', 10, 29);

      doc.autoTable({
        startY: 34,
        head: [['Jenis Pekerjaan', 'Volume', 'Satuan']],
        body: buildJenisPekerjaanRows(lastResult),
        margin: { left: 10, right: 150 },
        styles: { fontSize: 8 },
        headStyles: { fillColor: [11, 61, 145] },
      });

      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 6,
        head: [['Kode', 'Material Terpasang', 'Volume', 'Satuan']],
        body: buildMaterialTerpasangRows(lastResult),
        margin: { left: 10, right: 150 },
        styles: { fontSize: 8 },
        headStyles: { fillColor: [11, 61, 145] },
      });

      if (mapImage) {
        const imgProps = doc.getImageProperties(mapImage);
        const imgW = 138;
        const imgH = Math.min((imgProps.height * imgW) / imgProps.width, 180);
        doc.setDrawColor(150);
        doc.rect(153, 10, imgW, imgH);
        doc.addImage(mapImage, 'PNG', 153, 10, imgW, imgH);
      }

      const catLabel = CATEGORY_LABELS[state.category].replace(/[^a-z0-9]+/gi, '-');
      doc.save('gambar-rencana-' + catLabel + '-' + Date.now() + '.pdf');
    } catch (err) {
      alert('Gagal membuat PDF: ' + err.message);
    } finally {
      el.btnExportPdf.disabled = false;
      el.btnExportPdf.textContent = originalLabel;
    }
  });

  updateDrawUI();
  updateUndoRedoButtons();
})();
