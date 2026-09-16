const sim = new DiscreteEventSimulator(20260911);
let occupancyChart = null;
let chartHistory = { labels: [], general: [], monitored: [], critical: [] };
let currentDispatchText = '';

function formatTime(minutes) {
  const totalSeconds = Math.floor(minutes * 60);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}.${String(secs).padStart(2, '0')}`;
}

function togglePlay() {
  if (sim.isRunning) {
    sim.isRunning = false;
    clearInterval(sim.timer);
    document.getElementById('btn-play-text').textContent = 'Resume';
    document.getElementById('btn-play-icon').setAttribute('data-lucide', 'play');
  } else {
    sim.isRunning = true;
    document.getElementById('btn-play-text').textContent = 'Pause';
    document.getElementById('btn-play-icon').setAttribute('data-lucide', 'pause');
    runLoop();
  }
  lucide.createIcons();
}

function runLoop() {
  if (!sim.isRunning) return;
  const delay = Math.max(10, Math.floor(250 / sim.speedMultiplier));
  sim.timer = setTimeout(() => {
    const hasNext = sim.step();
    updateSimulationUI();
    if (hasNext && sim.isRunning) {
      runLoop();
    } else {
      sim.isRunning = false;
      document.getElementById('btn-play-text').textContent = 'Start';
      document.getElementById('btn-play-icon').setAttribute('data-lucide', 'play');
      lucide.createIcons();
    }
  }, delay);
}

function stepSimulation() {
  if (sim.isRunning) {
    sim.isRunning = false;
    clearInterval(sim.timer);
    document.getElementById('btn-play-text').textContent = 'Resume';
  }
  sim.step();
  updateSimulationUI();
  lucide.createIcons();
}

function setSimSpeed(speed) {
  sim.speedMultiplier = speed;
  document.querySelectorAll('.speed-btn').forEach(b => {
    if (parseInt(b.getAttribute('data-speed')) === speed) {
      b.className = 'speed-btn px-2 py-1 text-xs rounded-md font-mono text-cyan-800 font-bold bg-cyan-100/70 border border-cyan-300';
    } else {
      b.className = 'speed-btn px-2 py-1 text-xs rounded-md font-mono text-slate-500 hover:text-slate-900';
    }
  });
}

function runFastSimulation() {
  if (sim.isRunning) {
    sim.isRunning = false;
    clearInterval(sim.timer);
  }
  showToast('Executing 500 arrivals with seed 20260911...');
  const startTime = performance.now();
  let steps = 0;
  while (sim.step() && steps < 50000) steps++;
  const elapsedMs = (performance.now() - startTime).toFixed(1);
  updateSimulationUI();
  showToast(`Simulation completed in ${elapsedMs}ms! Score: ${document.getElementById('metric-total-score').textContent}/100`, 'success');
  document.getElementById('btn-play-text').textContent = 'Finished';
  document.getElementById('btn-play-icon').setAttribute('data-lucide', 'check');
  lucide.createIcons();
}

function resetSimulation() {
  if (sim.isRunning) {
    sim.isRunning = false;
    clearInterval(sim.timer);
  }
  sim.reset(20260911);
  chartHistory = { labels: [], general: [], monitored: [], critical: [] };
  if (occupancyChart) {
    occupancyChart.data.labels = [];
    occupancyChart.data.datasets.forEach(d => d.data = []);
    occupancyChart.update();
  }
  document.getElementById('event-log-container').innerHTML = '<div class="text-slate-400 italic">Simulator reset to t=0.0m with seed 20260911.</div>';
  document.getElementById('diverted-list-body').innerHTML = `
    <tr>
      <td colspan="6" class="py-8 text-center text-slate-400 font-sans text-xs">
        No patients have been rejected or diverted yet. (System maintains &lt; 240m wait).
      </td>
    </tr>`;
  document.getElementById('diverted-counter').textContent = '0 Patients Diverted';
  document.getElementById('btn-play-text').textContent = 'Start';
  document.getElementById('btn-play-icon').setAttribute('data-lucide', 'play');
  updateSimulationUI();
  lucide.createIcons();
  showToast('Simulator reset to seed 20260911');
}

function updateSimulationUI() {
  document.getElementById('display-sim-time').textContent = formatTime(sim.simTime);
  document.getElementById('display-event-step').textContent = `Evt #${sim.eventCount}`;
  document.getElementById('metric-processed-arrivals').textContent = sim.allArrivals.length;

  const freeBeds = sim.getFreeBedCounts();
  const activeOccupancy = (30 - freeBeds.general) + (10 - freeBeds.monitored) + (5 - freeBeds.critical);
  document.getElementById('metric-active-occupancy').textContent = activeOccupancy;
  document.getElementById('metric-queue-length').textContent = sim.waitingQueue.length;
  document.getElementById('queue-badge-count').textContent = `${sim.waitingQueue.length} waiting`;

  document.getElementById('label-crit-count').textContent = `${5 - freeBeds.critical}/5 Occupied`;
  document.getElementById('label-mon-count').textContent = `${10 - freeBeds.monitored}/10 Occupied`;
  document.getElementById('label-gen-count').textContent = `${30 - freeBeds.general}/30 Occupied`;

  document.getElementById('ai-ctx-queue').textContent = sim.waitingQueue.length;
  document.getElementById('ai-ctx-beds').textContent = `${freeBeds.general} / ${freeBeds.monitored} / ${freeBeds.critical}`;
  document.getElementById('ai-ctx-avoidable').textContent = sim.avoidableSpecializedCount;
  document.getElementById('ai-ctx-rejections').textContent = sim.rejectedPatients.length;

  const m = sim.calculateMetrics();
  document.getElementById('metric-total-score').textContent = m.totalScore.toFixed(2);
  document.getElementById('metric-pts-wait').textContent = m.ptsWait.toFixed(2);
  document.getElementById('metric-u-wait').textContent = m.uWait.toFixed(4);
  document.getElementById('bar-pts-wait').style.width = `${(m.ptsWait / 45) * 100}%`;

  document.getElementById('metric-pts-critical').textContent = m.ptsCritical.toFixed(2);
  document.getElementById('metric-u-critical').textContent = m.uCritical.toFixed(4);
  document.getElementById('bar-pts-critical').style.width = `${(m.ptsCritical / 20) * 100}%`;

  document.getElementById('metric-pts-reject').textContent = m.ptsReject.toFixed(2);
  document.getElementById('metric-u-reject').textContent = m.uReject.toFixed(4);
  document.getElementById('metric-rejected-count').textContent = m.nRejected;
  document.getElementById('bar-pts-reject').style.width = `${(m.ptsReject / 15) * 100}%`;

  document.getElementById('metric-pts-specialized').textContent = m.ptsSpecialized.toFixed(2);
  document.getElementById('metric-u-specialized').textContent = m.uSpecialized.toFixed(4);
  document.getElementById('bar-pts-specialized').style.width = `${(m.ptsSpecialized / 15) * 100}%`;

  renderQueueUI();
  renderWardUI();

  if (sim.eventCount % 4 === 0 || sim.eventsQueue.length === 0) {
    updateOccupancyChart(30 - freeBeds.general, 10 - freeBeds.monitored, 5 - freeBeds.critical);
  }
}

function renderQueueUI() {
  const container = document.getElementById('queue-container');
  if (sim.waitingQueue.length === 0) {
    container.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
        <i data-lucide="inbox" class="w-8 h-8 stroke-1 mb-2"></i>
        <p class="text-xs">Queue is clear. No waiting patients.</p>
      </div>`;
    return;
  }

  let html = '';
  sim.waitingQueue.slice(0, 30).forEach((p) => {
    const curWait = Math.min(sim.simTime - p.arrivalTime, BENCHMARK.MAX_WAIT_CAP);
    const urgency = sim.policy.computePriorityScore(p, sim.simTime);
    const acuityColor = p.acuity === 3 ? 'border-rose-300 bg-rose-50/70 text-rose-800' :
                       (p.acuity === 2 ? 'border-amber-300 bg-amber-50/70 text-amber-800' : 'border-emerald-300 bg-emerald-50/70 text-emerald-800');
    const badgeBg = p.acuity === 3 ? 'bg-rose-600 text-white' : (p.acuity === 2 ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white');

    html += `
      <div class="glass-card p-2.5 rounded-xl border ${acuityColor} flex items-center justify-between text-xs shadow-2xs">
        <div class="flex items-center gap-2">
          <span class="w-5 h-5 rounded-full ${badgeBg} font-mono font-bold flex items-center justify-center text-[10px] shadow-2xs">${p.acuity}</span>
          <div>
            <div class="font-bold text-slate-800 font-mono flex items-center gap-1.5">
              #${p.id} <span class="text-[10px] font-normal text-slate-500">Level ${p.acuity}</span>
            </div>
            <div class="text-[10px] text-slate-400">Arrived: ${formatTime(p.arrivalTime)}</div>
          </div>
        </div>
        <div class="text-right">
          <div class="font-mono font-bold ${curWait > 180 ? 'text-rose-600' : (curWait > 60 ? 'text-amber-600' : 'text-slate-700')}">
            ${curWait.toFixed(1)}m
          </div>
          <div class="text-[10px] text-slate-400 font-mono">Prio: ${urgency.toFixed(0)}</div>
        </div>
      </div>`;
  });

  if (sim.waitingQueue.length > 30) {
    html += `<div class="text-center text-[11px] text-slate-500 py-1 font-mono">+${sim.waitingQueue.length - 30} more in queue</div>`;
  }
  container.innerHTML = html;
}

function renderWardUI() {
  const critContainer = document.getElementById('ward-critical-grid');
  let critHtml = '';
  sim.beds.critical.forEach((p, idx) => {
    if (p) {
      const elapsed = sim.simTime - p.admissionTime;
      const progress = Math.min(100, (elapsed / p.realizedStay) * 100);
      critHtml += `
        <div class="p-2.5 rounded-xl border border-rose-200 bg-rose-50/80 text-xs flex flex-col justify-between h-24 shadow-2xs">
          <div class="flex justify-between items-start">
            <span class="font-mono text-[10px] font-bold text-rose-700">CRIT-0${idx + 1}</span>
            <span class="px-1.5 py-0.2 rounded bg-rose-600 text-white font-mono text-[9px] font-bold">L${p.acuity}</span>
          </div>
          <div>
            <div class="font-bold text-slate-800 font-mono text-xs truncate">Pt #${p.id}</div>
            <div class="text-[10px] text-slate-500 font-mono">${elapsed.toFixed(0)}m / ${p.realizedStay.toFixed(0)}m</div>
          </div>
          <div class="w-full bg-rose-200 h-1 rounded-full overflow-hidden">
            <div class="bg-rose-600 h-full" style="width: ${progress}%"></div>
          </div>
        </div>`;
    } else {
      critHtml += `
        <div class="p-2.5 rounded-xl border border-dashed border-slate-300 bg-white/50 text-xs flex flex-col justify-between h-24 text-slate-400">
          <span class="font-mono text-[10px]">CRIT-0${idx + 1}</span>
          <span class="text-center font-bold text-slate-400 text-xs">AVAILABLE</span>
          <span class="text-[9px] text-center font-mono">ICU Ready</span>
        </div>`;
    }
  });
  critContainer.innerHTML = critHtml;

  const monContainer = document.getElementById('ward-monitored-grid');
  let monHtml = '';
  sim.beds.monitored.forEach((p, idx) => {
    if (p) {
      const elapsed = sim.simTime - p.admissionTime;
      const progress = Math.min(100, (elapsed / p.realizedStay) * 100);
      monHtml += `
        <div class="p-2.5 rounded-xl border border-amber-200 bg-amber-50/80 text-xs flex flex-col justify-between h-24 shadow-2xs">
          <div class="flex justify-between items-start">
            <span class="font-mono text-[10px] font-bold text-amber-700">MON-${String(idx + 1).padStart(2, '0')}</span>
            <span class="px-1.5 py-0.2 rounded bg-amber-500 text-white font-mono text-[9px] font-bold">L${p.acuity}</span>
          </div>
          <div>
            <div class="font-bold text-slate-800 font-mono text-xs truncate">Pt #${p.id}</div>
            <div class="text-[10px] text-slate-500 font-mono">${elapsed.toFixed(0)}m / ${p.realizedStay.toFixed(0)}m</div>
          </div>
          <div class="w-full bg-amber-200 h-1 rounded-full overflow-hidden">
            <div class="bg-amber-500 h-full" style="width: ${progress}%"></div>
          </div>
        </div>`;
    } else {
      monHtml += `
        <div class="p-2.5 rounded-xl border border-dashed border-slate-300 bg-white/50 text-xs flex flex-col justify-between h-24 text-slate-400">
          <span class="font-mono text-[10px]">MON-${String(idx + 1).padStart(2, '0')}</span>
          <span class="text-center font-bold text-slate-400 text-xs">AVAILABLE</span>
          <span class="text-[9px] text-center font-mono">Telemetry</span>
        </div>`;
    }
  });
  monContainer.innerHTML = monHtml;

  const genContainer = document.getElementById('ward-general-grid');
  let genHtml = '';
  sim.beds.general.forEach((p, idx) => {
    if (p) {
      genHtml += `
        <div class="p-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 text-center h-16 flex flex-col justify-between shadow-2xs" title="Patient #${p.id} (L${p.acuity})">
          <span class="text-[9px] font-mono text-emerald-700 font-bold">G-${String(idx + 1).padStart(2, '0')}</span>
          <span class="text-xs font-bold font-mono text-slate-800 truncate">#${p.id}</span>
          <span class="text-[8px] text-slate-500 font-mono">L${p.acuity}</span>
        </div>`;
    } else {
      genHtml += `
        <div class="p-1.5 rounded-lg border border-dashed border-slate-300 bg-white/50 text-center h-16 flex flex-col justify-between text-slate-400">
          <span class="text-[9px] font-mono">G-${String(idx + 1).padStart(2, '0')}</span>
          <span class="text-[10px] font-semibold text-slate-400">FREE</span>
          <span class="text-[8px] font-mono">&mdash;</span>
        </div>`;
    }
  });
  genContainer.innerHTML = genHtml;
}

function logEvent(message, type = 'info') {
  const logBox = document.getElementById('event-log-container');
  const timeTag = `<span class="text-slate-400">[${formatTime(sim.simTime)}]</span>`;
  let colorClass = 'text-slate-700';
  if (type === 'arrival') colorClass = 'text-cyan-700 font-medium';
  if (type === 'admit') colorClass = 'text-emerald-700 font-medium';
  if (type === 'departure') colorClass = 'text-blue-700';
  if (type === 'reject') colorClass = 'text-rose-600 font-bold';

  const entry = document.createElement('div');
  entry.className = 'py-0.5 border-b border-slate-200/60 leading-snug';
  entry.innerHTML = `${timeTag} <span class="${colorClass}">${message}</span>`;
  logBox.appendChild(entry);
  logBox.scrollTop = logBox.scrollHeight;
}

function clearEventLogUI() {
  document.getElementById('event-log-container').innerHTML = '<div class="text-slate-400 italic">Event log cleared.</div>';
}

function addDivertedPatientToUI(p) {
  const tbody = document.getElementById('diverted-list-body');
  if (sim.rejectedPatients.length === 1) {
    tbody.innerHTML = '';
  }
  document.getElementById('diverted-counter').textContent = `${sim.rejectedPatients.length} Patients Diverted`;

  const hosp = p.divertedTo || NEAREST_HOSPITALS[0];
  const gmapsLink = getGoogleMapsUrl(hosp.lat, hosp.lng);

  const row = document.createElement('tr');
  row.className = 'hover:bg-slate-50 transition';
  row.innerHTML = `
    <td class="py-2.5 px-3 font-bold text-slate-800">#${p.id}</td>
    <td class="py-2.5 px-3">
      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${p.acuity === 3 ? 'bg-rose-600 text-white' : (p.acuity === 2 ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white')}">
        Level ${p.acuity}
      </span>
    </td>
    <td class="py-2.5 px-3 text-rose-600 font-bold">${p.wait.toFixed(1)} min</td>
    <td class="py-2.5 px-3 text-cyan-700 font-semibold">${hosp.name}</td>
    <td class="py-2.5 px-3 text-slate-500">${hosp.distanceKm} km &bull; ${hosp.etaMin}m transit</td>
    <td class="py-2.5 px-3 text-right">
      <div class="inline-flex items-center gap-1.5">
        <a href="${gmapsLink}" target="_blank" class="px-2 py-1 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border border-cyan-200 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition" title="Open Turn-by-Turn Route">
          <i data-lucide="map-pin" class="w-3 h-3"></i> Route
        </a>
        <button onclick="prepareWhatsAppModal(${p.id})" class="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition">
          <i data-lucide="message-circle" class="w-3.5 h-3.5"></i> WhatsApp
        </button>
      </div>
    </td>`;
  tbody.prepend(row);
  lucide.createIcons();
}

function initOccupancyChart() {
  const ctx = document.getElementById('chart-occupancy').getContext('2d');
  occupancyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'General Occupied (Max 30)',
          data: [],
          borderColor: '#059669',
          backgroundColor: 'rgba(5, 150, 105, 0.08)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 0
        },
        {
          label: 'Monitored Occupied (Max 10)',
          data: [],
          borderColor: '#d97706',
          backgroundColor: 'rgba(217, 119, 6, 0.08)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 0
        },
        {
          label: 'Critical Occupied (Max 5)',
          data: [],
          borderColor: '#e11d48',
          backgroundColor: 'rgba(225, 29, 72, 0.08)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          grid: { color: 'rgba(0, 0, 0, 0.04)' },
          ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } }
        },
        y: {
          max: 35,
          min: 0,
          grid: { color: 'rgba(0, 0, 0, 0.04)' },
          ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function updateOccupancyChart(genOcc, monOcc, critOcc) {
  if (!occupancyChart) return;
  const timeLabel = formatTime(sim.simTime);
  chartHistory.labels.push(timeLabel);
  chartHistory.general.push(genOcc);
  chartHistory.monitored.push(monOcc);
  chartHistory.critical.push(critOcc);

  if (chartHistory.labels.length > 60) {
    chartHistory.labels.shift();
    chartHistory.general.shift();
    chartHistory.monitored.shift();
    chartHistory.critical.shift();
  }

  occupancyChart.data.labels = chartHistory.labels;
  occupancyChart.data.datasets[0].data = chartHistory.general;
  occupancyChart.data.datasets[1].data = chartHistory.monitored;
  occupancyChart.data.datasets[2].data = chartHistory.critical;
  occupancyChart.update();
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.getElementById(tabId).classList.remove('hidden');

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active', 'text-cyan-800', 'bg-cyan-100/60', 'border', 'border-cyan-300', 'shadow-xs');
    btn.classList.add('text-slate-600');
  });

  const activeBtn = document.getElementById(`tab-btn-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.add('active', 'text-cyan-800', 'bg-cyan-100/60', 'border', 'border-cyan-300', 'shadow-xs');
    activeBtn.classList.remove('text-slate-600');
  }

  if (tabId === 'tab-ward') {
    renderWardUI();
  } else if (tabId === 'tab-hospitals') {
    setTimeout(() => {
      initLeafletGoogleMap();
      if (leafletMapInstance) {
        leafletMapInstance.invalidateSize();
      }
    }, 150);
  }
  lucide.createIcons();
}

function prepareWhatsAppModal(patientId) {
  const patient = sim.rejectedPatients.find(p => p.id === patientId) || sim.allArrivals.find(p => p.id === patientId);
  if (!patient) return;

  const hosp = patient.divertedTo || NEAREST_HOSPITALS[0];
  const gmapsLink = getGoogleMapsUrl(hosp.lat, hosp.lng);
  const acuityNames = { 1: 'Level 1 (General)', 2: 'Level 2 (Monitored/Telemetry)', 3: 'Level 3 (Critical ICU)' };

  const message = `🚨 *EMERGENCY MEDICAL TRANSFER DISPATCH* 🚨
--------------------------------------
*Patient ID:* #${patient.id}
*Acuity Triage:* ${acuityNames[patient.acuity]}
*Arrival Time:* ${formatTime(patient.arrivalTime)}
*Wait Duration:* ${patient.wait.toFixed(1)} mins (240m Timeout Divert)

*DISPATCH DESTINATION:*
🏥 *Receiving Hospital:* ${hosp.name}
📍 *Address:* ${hosp.address}
🚗 *Distance / ETA:* ${hosp.distanceKm} km (~${hosp.etaMin} min transit)
🩺 *Reserved Capacity:* ${hosp.specializedCapacity}
🗺️ *Live Google Maps Navigation Route:*
${gmapsLink}

*Protocol Authorization:*
Online Hospital Bed Allocation Benchmark Engine (Jaipur Command)
Contact Ambulance Control: ${hosp.phone}
--------------------------------------
Please prepare triage resuscitation bay immediately.`;

  document.getElementById('wa-message-body').value = message;
  currentDispatchText = message;
  document.getElementById('whatsapp-modal').classList.remove('hidden');
  lucide.createIcons();
}

function dispatchManualHospitalReferral(hospId) {
  const hosp = NEAREST_HOSPITALS.find(h => h.id === hospId);
  if (!hosp) return;

  const gmapsLink = getGoogleMapsUrl(hosp.lat, hosp.lng);
  const message = `🏥 *EMERGENCY HOSPITAL CAPACITY QUERY & DIVERSION*
Hospital: ${hosp.name}
Active Capacity Status: ${hosp.specializedCapacity}
Google Maps Location: ${gmapsLink}
Jaipur Command Hub is requesting emergency intake for critical overflow patients.`;

  document.getElementById('wa-message-body').value = message;
  currentDispatchText = message;
  document.getElementById('whatsapp-modal').classList.remove('hidden');
  lucide.createIcons();
}

function closeWhatsAppModal() {
  document.getElementById('whatsapp-modal').classList.add('hidden');
}

function openExternalWhatsApp() {
  const phoneInput = document.getElementById('wa-phone-number').value.replace(/[^0-9]/g, '');
  const message = encodeURIComponent(document.getElementById('wa-message-body').value);
  const url = `https://wa.me/${phoneInput}?text=${message}`;
  window.open(url, '_blank');
  closeWhatsAppModal();
  showToast('WhatsApp referral link opened!', 'success');
}

function downloadEventLogCSV() {
  let csv = "PatientID,Acuity,ArrivalTime,WaitTimeMinutes,Status,AssignedBedType,BedIndex,RealizedStayMinutes,DepartureTime\n";
  sim.allArrivals.forEach(p => {
    const stay = p.realizedStay ? p.realizedStay.toFixed(2) : "";
    const dep = p.departureTime ? p.departureTime.toFixed(2) : "";
    csv += `${p.id},${p.acuity},${p.arrivalTime.toFixed(2)},${p.wait.toFixed(2)},${p.status},${p.assignedBedType || ""},${p.bedIndex !== -1 ? p.bedIndex + 1 : ""},${stay},${dep}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hospital_allocation_log_seed_${sim.seed}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV Decision Log exported!');
}

let pythonSourceCached = "";

async function loadPythonSource() {
  try {
    const resp = await fetch('scripts/online_bed_allocation_policy.py');
    if (!resp.ok) throw new Error("Could not fetch python script directly");
    pythonSourceCached = await resp.text();
  } catch (err) {
    console.warn("Falling back to embedded python template.");
  }
  document.getElementById('python-source-container').textContent = pythonSourceCached || "# Python script file: scripts/online_bed_allocation_policy.py";
}

function copyPythonCode() {
  copyToClipboard(pythonSourceCached || document.getElementById('python-source-container').textContent);
  showToast('Python evaluation code copied!');
}

function downloadPythonFile() {
  const code = pythonSourceCached || document.getElementById('python-source-container').textContent;
  const blob = new Blob([code], { type: 'text/x-python' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'online_bed_allocation_policy.py';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Downloaded online_bed_allocation_policy.py');
}

function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text);
  } else {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const borderCol = type === 'success' ? 'border-emerald-300 bg-white text-emerald-800' : 'border-cyan-300 bg-white text-cyan-800';
  toast.className = `p-3.5 rounded-2xl border ${borderCol} shadow-xl text-xs font-mono backdrop-blur-md flex items-center gap-2 transform transition-all duration-300 pointer-events-auto`;
  toast.innerHTML = `<i data-lucide="info" class="w-4 h-4"></i> <span>${message}</span>`;
  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

window.onload = function () {
  const savedKey = localStorage.getItem('gemini_api_key');
  if (savedKey) {
    document.getElementById('gemini-api-key').value = savedKey;
    document.getElementById('drawer-gemini-key').value = savedKey;
  }
  initOccupancyChart();
  renderHospitalCards();
  loadPythonSource();
  updateSimulationUI();
  lucide.createIcons();
};
