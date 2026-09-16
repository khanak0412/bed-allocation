const BASE_HOSPITAL_COORDS = {
  name: 'Jaipur Central Command Hub',
  lat: 26.9124,
  lng: 75.7873
};

const NEAREST_HOSPITALS = [
  {
    id: 'metro-gen',
    name: 'Metro Regional Hospital',
    distanceKm: 4.2,
    etaMin: 12,
    phone: '+911412560111',
    specializedCapacity: '12 Monitored, 4 ICU Beds Free',
    address: 'Sector 5, Jawahar Nagar, Jaipur',
    lat: 26.892,
    lng: 75.824
  },
  {
    id: 'apex-trauma',
    name: 'Apex Super-Specialty Trauma Care',
    distanceKm: 6.8,
    etaMin: 18,
    phone: '+911412751999',
    specializedCapacity: '8 Critical ICU Beds Free',
    address: 'Malviya Nagar Industrial Area, Jaipur',
    lat: 26.852,
    lng: 75.811
  },
  {
    id: 'fortis-med',
    name: 'City North Medical Research Center',
    distanceKm: 9.1,
    etaMin: 22,
    phone: '+911412822000',
    specializedCapacity: '25 General, 7 Monitored Free',
    address: 'Vidhyadhar Nagar, Jaipur',
    lat: 26.960,
    lng: 75.772
  },
  {
    id: 'st-jude',
    name: 'St. Jude Emergency Center',
    distanceKm: 11.5,
    etaMin: 27,
    phone: '+911412993444',
    specializedCapacity: '15 Monitored, 6 Critical Free',
    address: 'Ajmer Road Bypass, Jaipur',
    lat: 26.885,
    lng: 75.720
  }
];

let leafletMapInstance = null;

function getGoogleMapsUrl(destLat, destLng) {
  return `https://www.google.com/maps/dir/?api=1&origin=${BASE_HOSPITAL_COORDS.lat},${BASE_HOSPITAL_COORDS.lng}&destination=${destLat},${destLng}&travelmode=driving`;
}

function initLeafletGoogleMap() {
  if (leafletMapInstance) return;
  const mapEl = document.getElementById('googleMapContainer');
  if (!mapEl) return;

  leafletMapInstance = L.map('googleMapContainer').setView([BASE_HOSPITAL_COORDS.lat, BASE_HOSPITAL_COORDS.lng], 12);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap, &copy; CARTO &bull; Google Maps Protocol',
    maxZoom: 19
  }).addTo(leafletMapInstance);

  const baseIcon = L.divIcon({
    className: 'custom-base-icon',
    html: `<div style="background-color:#4f46e5; width:22px; height:22px; border-radius:50%; border:3px solid #ffffff; box-shadow: 0 4px 10px rgba(79, 70, 229, 0.4);"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });

  L.marker([BASE_HOSPITAL_COORDS.lat, BASE_HOSPITAL_COORDS.lng], { icon: baseIcon })
    .addTo(leafletMapInstance)
    .bindPopup(`
      <div class="text-xs font-sans">
        <b class="text-cyan-700 font-bold">${BASE_HOSPITAL_COORDS.name}</b><br/>
        <span class="text-slate-600">Base Triage Command Center</span><br/>
        <span class="text-slate-500">Capacities: 30 Gen, 10 Mon, 5 Crit</span>
      </div>
    `).openPopup();

  NEAREST_HOSPITALS.forEach(h => {
    const gmapsLink = getGoogleMapsUrl(h.lat, h.lng);

    const hospitalIcon = L.divIcon({
      className: 'custom-hosp-icon',
      html: `<div style="background-color:#059669; width:18px; height:18px; border-radius:50%; border:2px solid #ffffff; box-shadow: 0 2px 8px rgba(5, 150, 105, 0.4);"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });

    const marker = L.marker([h.lat, h.lng], { icon: hospitalIcon }).addTo(leafletMapInstance);

    marker.bindPopup(`
      <div class="text-xs font-sans p-1">
        <b class="text-emerald-700 font-bold text-sm">${h.name}</b><br/>
        <div class="text-slate-600 mt-1">${h.address}</div>
        <div class="mt-1 text-slate-500">Distance: <b>${h.distanceKm} km</b> &bull; Transit: <b>~${h.etaMin} mins</b></div>
        <div class="text-cyan-700 font-mono text-[11px] mt-1 font-semibold">${h.specializedCapacity}</div>
        <a href="${gmapsLink}" target="_blank" class="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-[11px] font-bold no-underline transition shadow-sm">
          <span>Open Google Maps</span> &rarr;
        </a>
      </div>
    `);

    L.polyline([
      [BASE_HOSPITAL_COORDS.lat, BASE_HOSPITAL_COORDS.lng],
      [h.lat, h.lng]
    ], {
      color: '#0891b2',
      weight: 2.5,
      opacity: 0.7,
      dashArray: '5, 8'
    }).addTo(leafletMapInstance);
  });
}

function renderHospitalCards() {
  const container = document.getElementById('hospital-network-cards');
  let html = '';
  NEAREST_HOSPITALS.forEach(h => {
    const gmapsLink = getGoogleMapsUrl(h.lat, h.lng);
    html += `
      <div class="glass-card p-4 rounded-2xl border border-slate-200 hover:border-slate-300 transition flex flex-col justify-between">
        <div>
          <div class="flex items-start justify-between">
            <h4 class="font-bold text-slate-800 text-sm">${h.name}</h4>
            <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-50 text-cyan-700 border border-cyan-200 font-bold">${h.distanceKm} km</span>
          </div>
          <p class="text-xs text-slate-500 mt-1">${h.address}</p>
          <div class="mt-3 p-2.5 bg-slate-50/80 rounded-xl text-xs font-mono space-y-1 border border-slate-200">
            <div class="text-emerald-700 font-bold">${h.specializedCapacity}</div>
            <div class="text-slate-500">Transit ETA: <b class="text-cyan-700">${h.etaMin} mins</b></div>
          </div>
        </div>
        <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-1">
          <span class="text-[11px] font-mono text-slate-500">${h.phone}</span>
          <div class="flex items-center gap-1">
            <a href="${gmapsLink}" target="_blank" title="Open Google Maps Driving Directions" class="px-2 py-1 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border border-cyan-200 rounded-lg text-xs flex items-center gap-1 font-semibold transition">
              <i data-lucide="map-pin" class="w-3 h-3"></i> Route
            </a>
            <button onclick="dispatchManualHospitalReferral('${h.id}')" title="Emergency Referral Dispatch" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs flex items-center gap-1 font-semibold transition">
              <i data-lucide="send" class="w-3 h-3"></i>
            </button>
          </div>
        </div>
      </div>`;
  });
  container.innerHTML = html;
}
