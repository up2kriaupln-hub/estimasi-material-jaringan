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
    garduStatus: document.getElementById('gardu-status'),
    garduKvaRow: document.getElementById('gardu-kva-row'),
    garduKva: document.getElementById('gardu-kva'),
    btnHapusGardu: document.getElementById('btn-hapus-gardu'),
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
    btnExport: document.getElementById('btn-export'),
    btnNew: document.getElementById('btn-new'),
  };

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

  function toggleGardu(pole) {
    const prevGarduPole = state.poleList.find((p) => p.isGardu);
    const wasGardu = pole.isGardu;
    doAction({
      redo: function () {
        state.poleList.forEach((p) => (p.isGardu = false));
        pole.isGardu = !wasGardu;
        if (pole.isGardu && !pole.garduKva) pole.garduKva = 100;
        renderPoleMarkers();
      },
      undo: function () {
        state.poleList.forEach((p) => (p.isGardu = false));
        if (prevGarduPole) prevGarduPole.isGardu = true;
        renderPoleMarkers();
      },
    });
  }

  function updateGarduStatusUI() {
    const garduPole = state.poleList.find((p) => p.isGardu);
    el.garduStatus.hidden = !garduPole;
    el.garduKvaRow.hidden = !garduPole;
    el.btnHapusGardu.hidden = !garduPole;
    if (garduPole) el.garduKva.value = String(garduPole.garduKva || 100);
  }

  el.garduKva.addEventListener('change', function () {
    const garduPole = state.poleList.find((p) => p.isGardu);
    if (garduPole) garduPole.garduKva = Number(el.garduKva.value);
  });

  el.btnHapusGardu.addEventListener('click', function () {
    const garduPole = state.poleList.find((p) => p.isGardu);
    if (garduPole) toggleGardu(garduPole);
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
    updateGarduStatusUI();
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

    let trafoSubtotal = 0;
    if (garduCount > 0) {
      const garduPole = state.poleList.find((p) => p.isGardu);
      const kva = (garduPole && garduPole.garduKva) || 100;
      const harga = TRAFO_PRICES[kva] || 0;
      trafoSubtotal = harga * garduCount;
      totalMaterialUtama += trafoSubtotal;
      mainRows.push({
        nama: 'Trafo Distribusi ' + kva + ' kVA',
        satuan: 'Unit',
        qty: garduCount,
        harga,
        subtotal: trafoSubtotal,
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

  updateDrawUI();
  updateUndoRedoButtons();
})();
