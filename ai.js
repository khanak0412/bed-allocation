const geminiChatHistory = [];

function getStoredApiKey() {
  return localStorage.getItem('gemini_api_key') || document.getElementById('gemini-api-key').value.trim() || '';
}

function saveApiKeyFromInput() {
  const key = document.getElementById('gemini-api-key').value.trim();
  localStorage.setItem('gemini_api_key', key);
  document.getElementById('drawer-gemini-key').value = key;
  showToast('Gemini API Key saved!', 'success');
}

function saveKeyFromDrawer() {
  const key = document.getElementById('drawer-gemini-key').value.trim();
  localStorage.setItem('gemini_api_key', key);
  document.getElementById('gemini-api-key').value = key;
  toggleKeySettingsDrawer();
  showToast('Gemini API Key saved for Copilot!', 'success');
}

function toggleKeySettingsDrawer() {
  const drawer = document.getElementById('chat-api-key-drawer');
  drawer.classList.toggle('hidden');
  if (!drawer.classList.contains('hidden')) {
    document.getElementById('drawer-gemini-key').value = getStoredApiKey();
    document.getElementById('drawer-gemini-key').focus();
  }
}

async function runAIAssistant() {
  const mode = document.getElementById('ai-analysis-mode').value;
  const responseBox = document.getElementById('ai-response-box');
  const apiKey = getStoredApiKey();

  responseBox.innerHTML = `
    <div class="flex items-center gap-3 py-10 justify-center text-cyan-600">
      <i data-lucide="loader-2" class="w-6 h-6 animate-spin"></i>
      <span class="font-mono text-xs font-semibold">Analyzing Markovian opportunity costs & discrete state via Gemini...</span>
    </div>`;
  lucide.createIcons();

  const freeBeds = sim.getFreeBedCounts();
  const metrics = sim.calculateMetrics();
  const waitingSummary = sim.waitingQueue.slice(0, 10).map(p => `Pt #${p.id} (L${p.acuity}, wait ${((sim.simTime - p.arrivalTime)).toFixed(1)}m)`).join(', ');

  const contextData = `
CURRENT BENCHMARK SIMULATOR STATE:
- Simulation Time: ${sim.simTime.toFixed(1)} minutes (Event #${sim.eventCount})
- Total Arrivals so far: ${sim.allArrivals.length} / 500
- Free Beds: General=${freeBeds.general}/30, Monitored=${freeBeds.monitored}/10, Critical=${freeBeds.critical}/5
- Active Waiting Queue: ${sim.waitingQueue.length} patients. Top waiting: [${waitingSummary || 'None'}]
- Rejections (>240m wait): ${metrics.nRejected}
- Avoidable Specialized Assignments: ${metrics.avoidableCount}
- Admitted Patients: ${metrics.nAdmitted}
- Current Benchmark Utility Score: ${metrics.totalScore.toFixed(2)} / 100.00
  * Weighted-wait utility (45 pts): ${metrics.ptsWait.toFixed(2)} (Uwait = ${metrics.uWait.toFixed(4)})
  * Critical-wait utility (20 pts): ${metrics.ptsCritical.toFixed(2)} (Ucrit = ${metrics.uCritical.toFixed(4)})
  * Rejection utility (15 pts): ${metrics.ptsReject.toFixed(2)} (Urej = ${metrics.uReject.toFixed(4)})
  * Specialized capacity preservation (15 pts): ${metrics.ptsSpecialized.toFixed(2)} (Uspec = ${metrics.uSpecialized.toFixed(4)})
  * Runtime/Reproducibility (5 pts): 5.00
`;

  let prompt = "";
  if (mode === 'policy_advisory') {
    prompt = `${contextData}\nYou are an expert Healthcare Operations Researcher. Formulate an actionable audit of the online bed allocation policy. Explain if critical and monitored beds should be reserved or if waiting queue pressure mandates a spillover upgrade. Highlight the penalty trade-off between avoidable specialized penalty (15 pts) versus weighted wait penalty (45 pts).`;
  } else if (mode === 'patient_triage') {
    prompt = `${contextData}\nEvaluate the most urgent waiting patients. Recommend whether any Acuity 2 patient should be promoted into a Critical bed, or if Acuity 1 should be held in queue to protect specialized capacity.`;
  } else if (mode === 'transfer_handoff') {
    prompt = `${contextData}\nDraft a structured inter-hospital emergency divert clinical transfer protocol and WhatsApp message for rejected patients reaching the 240-minute cap. Specify receiving hospital coordination and patient safety handoff.`;
  } else {
    prompt = `${contextData}\nAnalyze the mathematical path to achieve 90+ points out of 100 on the judging criteria. Provide parameter tuning for bed reservation thresholds.`;
  }

  try {
    if (!apiKey) throw new Error("No API key configured");

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: {
        parts: [{ text: "You are the chief operations optimization and clinical triage officer for an online discrete-event hospital bed allocation benchmark. Respond in concise, highly structured, professional clinical operations markdown format." }]
      }
    };

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      responseBox.innerHTML = renderSimpleMarkdown(text);
      return;
    }
  } catch (err) {
    console.warn('Serving fallback heuristic advisory:', err);
    const fallbackText = generateBuiltinAdvisory(mode, freeBeds, metrics);
    responseBox.innerHTML = renderSimpleMarkdown(fallbackText);
  }
}

function generateBuiltinAdvisory(mode, freeBeds, metrics) {
  if (mode === 'policy_advisory') {
    return `### 🏥 Policy Audit & Capacity Bottleneck Analysis
- **Current Total Score:** **${metrics.totalScore.toFixed(2)} / 100.00 pts**
- **Critical Bed Safety Buffer:** With **${freeBeds.critical} Critical beds free**, the policy must strictly prohibit Acuity 1 spillover.
- **Avoidable Penalty Tradeoff:** You have **${metrics.avoidableCount} avoidable specialized assignments**. Remember that an avoidable assignment deducts directly from the 15-point specialized preservation utility:
  U_specialized = 1 - (N_avoidable / N_admitted)
- **Queue Assessment:** Weighted wait currently contributes **${metrics.ptsWait.toFixed(2)} / 45 pts**. If queue wait exceeds 60m for Acuity 2, upgrading to Monitored is mandatory to avoid compounding weighted wait degradation.`;
  } else if (mode === 'patient_triage') {
    return `### 🩺 Patient Triage Recommendation
- **Acuity 3 (Weight = 8):** Must never be rejected. Critical wait is weighted heavily (**20 pts** standalone, plus weight 8 in overall wait). Keep 1 critical bed in reserve at all times.
- **Acuity 2 (Weight = 3):** If Monitored beds are 0 and wait exceeds 50 minutes, allocate available Critical beds only when free critical count >= 2.
- **Acuity 1 (Weight = 1):** Never admit into Monitored or Critical if ANY General bed is available (prevents avoidable penalties).`;
  } else if (mode === 'transfer_handoff') {
    return `### 🚨 Inter-Hospital Referral Transfer Protocol
- **Trigger:** Automatic divert triggered at t_wait = 240 min rejection threshold.
- **Designated Primary Divert:** Metro Regional Hospital (4.2 km &bull; ETA 12 min)
- **Secondary Divert:** Apex Super-Specialty Trauma Care (6.8 km &bull; ETA 18 min)
- **Clinical Protocol:** Continuous vitals monitoring during transit, oxygenation protocol for Level 2/3, and WhatsApp family dispatch push.`;
  } else {
    return `### 🎯 Benchmark 100-Point Maximization Strategy
1. **Weighted Wait (45 Pts):** Keep average weighted wait < 35 min by clearing queue in strict order of w_i × wait_i.
2. **Critical Wait (20 Pts):** Ensure 0 critical patients experience > 30 min wait.
3. **Rejection Utility (15 Pts):** Maintain zero timeout rejections (U_reject = 1.0).
4. **Specialized Preservation (15 Pts):** Ensure avoidable count = 0 by enforcing strict condition checking before upgrading.`;
  }
}

function renderSimpleMarkdown(md) {
  return md
    .replace(/### (.*)/g, '<h4 class="font-bold text-cyan-800 text-sm mt-2 mb-1">$1</h4>')
    .replace(/## (.*)/g, '<h3 class="font-bold text-slate-900 text-base mt-2 mb-1">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-900">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="text-cyan-800">$1</em>')
    .replace(/\n\n/g, '<p class="mb-2"></p>')
    .replace(/\n- (.*)/g, '<li class="ml-4 list-disc text-slate-700">$1</li>');
}

function copyAIText() {
  const text = document.getElementById('ai-response-box').innerText;
  copyToClipboard(text);
  showToast('AI Advisory copied to clipboard');
}

function toggleAIChatbot() {
  const win = document.getElementById('ai-chatbot-window');
  const isHidden = win.classList.contains('hidden');
  if (isHidden) {
    win.classList.remove('hidden');
    win.classList.add('flex');
    document.getElementById('ai-chat-input').focus();
  } else {
    win.classList.add('hidden');
    win.classList.remove('flex');
  }
  lucide.createIcons();
}

function clearAIChatHistory() {
  geminiChatHistory.length = 0;
  const container = document.getElementById('ai-chat-messages');
  container.innerHTML = `
    <div class="flex items-start gap-2.5">
      <div class="w-6 h-6 rounded-full bg-cyan-100 border border-cyan-300 text-cyan-700 flex items-center justify-center shrink-0 mt-0.5">
        <i data-lucide="bot" class="w-3.5 h-3.5"></i>
      </div>
      <div class="p-3 bg-white border border-slate-200 rounded-2xl rounded-tl-sm text-slate-700 leading-relaxed text-[11px] shadow-2xs">
        Chat history reset. How can I assist you with bed allocation, policy tradeoffs, or hospital divert routing?
      </div>
    </div>`;
  lucide.createIcons();
}

function appendAIChatMessage(sender, text) {
  const container = document.getElementById('ai-chat-messages');
  const msg = document.createElement('div');

  if (sender === 'user') {
    msg.className = 'flex items-start justify-end gap-2';
    msg.innerHTML = `
      <div class="p-2.5 bg-cyan-600 text-white rounded-2xl rounded-tr-sm text-[11px] leading-relaxed max-w-[85%] shadow-sm">
        ${escapeHtml(text)}
      </div>
      <div class="w-6 h-6 rounded-full bg-cyan-700 text-white flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">
        U
      </div>`;
  } else {
    msg.className = 'flex items-start gap-2.5';
    msg.innerHTML = `
      <div class="w-6 h-6 rounded-full bg-cyan-100 border border-cyan-300 text-cyan-700 flex items-center justify-center shrink-0 mt-0.5">
        <i data-lucide="bot" class="w-3.5 h-3.5"></i>
      </div>
      <div class="p-3 bg-white border border-slate-200 rounded-2xl rounded-tl-sm text-slate-700 leading-relaxed text-[11px] max-w-[88%] shadow-2xs">
        ${renderSimpleMarkdown(text)}
      </div>`;
  }

  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  lucide.createIcons();
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sendQuickPrompt(query) {
  document.getElementById('ai-chat-input').value = query;
  handleAIChatSubmit(new Event('submit'));
}

async function handleAIChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('ai-chat-input');
  const query = input.value.trim();
  if (!query) return;

  appendAIChatMessage('user', query);
  input.value = '';

  const container = document.getElementById('ai-chat-messages');
  const typingIndicator = document.createElement('div');
  typingIndicator.id = 'chat-typing-indicator';
  typingIndicator.className = 'flex items-center gap-2 text-cyan-700 font-mono text-[10px] py-1 font-semibold';
  typingIndicator.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Gemini is reasoning over simulation state...</span>`;
  container.appendChild(typingIndicator);
  container.scrollTop = container.scrollHeight;
  lucide.createIcons();

  const freeBeds = sim.getFreeBedCounts();
  const metrics = sim.calculateMetrics();
  const apiKey = getStoredApiKey();

  const telemetryContext = `[CURRENT DES TELEMETRY]
Sim Time: ${formatTime(sim.simTime)} (${sim.simTime.toFixed(1)} mins, Event #${sim.eventCount})
Arrivals: ${sim.allArrivals.length} / 500
Free Beds: General=${freeBeds.general}/30, Monitored=${freeBeds.monitored}/10, Critical=${freeBeds.critical}/5
Waiting Queue: ${sim.waitingQueue.length}
Rejections (Timeout >240m): ${metrics.nRejected}
Avoidable Specialized Assignments: ${metrics.avoidableCount}
Admitted Patients: ${metrics.nAdmitted}
Score: ${metrics.totalScore.toFixed(2)}/100 (Wait: ${metrics.ptsWait.toFixed(1)}, Crit: ${metrics.ptsCritical.toFixed(1)}, Rej: ${metrics.ptsReject.toFixed(1)}, Spec: ${metrics.ptsSpecialized.toFixed(1)})`;

  geminiChatHistory.push({
    role: "user",
    parts: [{ text: `${telemetryContext}\n\nUser Question: ${query}` }]
  });

  try {
    let aiReply = '';
    if (apiKey) {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const payload = {
        contents: geminiChatHistory,
        systemInstruction: {
          parts: [{ text: "You are Bed Pulse AI Copilot, an expert clinical operations and queue optimization assistant for a discrete event hospital bed allocation benchmark. Give concise, actionable, and mathematically grounded answers in clean markdown. Keep answers under 3-4 bullet points." }]
        }
      };

      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}`);
      const data = await resp.json();
      aiReply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    if (!aiReply) {
      aiReply = generateHeuristicChatReply(query, freeBeds, metrics);
    }

    geminiChatHistory.push({
      role: "model",
      parts: [{ text: aiReply }]
    });

    const ti = document.getElementById('chat-typing-indicator');
    if (ti) ti.remove();
    appendAIChatMessage('bot', aiReply);

  } catch (err) {
    console.warn('Gemini request fallback:', err);
    const ti = document.getElementById('chat-typing-indicator');
    if (ti) ti.remove();
    const fallback = generateHeuristicChatReply(query, freeBeds, metrics);
    geminiChatHistory.push({
      role: "model",
      parts: [{ text: fallback }]
    });
    appendAIChatMessage('bot', fallback);
  }
}

function generateHeuristicChatReply(q, freeBeds, metrics) {
  const lower = q.toLowerCase();
  if (lower.includes('queue') || lower.includes('triage') || lower.includes('wait')) {
    return `**Queue Status Assessment:**
- Active Waiting Queue: **${sim.waitingQueue.length} patients** at t = ${formatTime(sim.simTime)}.
- Current Weighted-Wait Score: **${metrics.ptsWait.toFixed(2)} / 45 pts** (U_wait = ${metrics.uWait.toFixed(4)}).
- Triage Recommendation: Clear patients by urgency index w_i × wait_i. Protect Critical slots unless Level 2 wait approaches 50+ minutes.`;
  } else if (lower.includes('divert') || lower.includes('hospital') || lower.includes('transfer') || lower.includes('route')) {
    return `**Emergency Divert & Regional Routing:**
- Patients Diverted (>240m): **${metrics.nRejected}**
- Primary Referral Hub: **${NEAREST_HOSPITALS[0].name}** (4.2 km, ~12 min transit).
- Secondary Critical Backup: **${NEAREST_HOSPITALS[1].name}** (${NEAREST_HOSPITALS[1].specializedCapacity}).
- Turn-by-turn navigation is accessible in the **Nearest Hospital Divert** tab.`;
  } else if (lower.includes('score') || lower.includes('100') || lower.includes('optimize') || lower.includes('utility')) {
    return `**100-Point Benchmark Optimization Strategy:**
1. **Weighted Wait (45 Pts):** Current = **${metrics.ptsWait.toFixed(2)}**. Keep average weighted queue time under 40 minutes.
2. **Critical Wait (20 Pts):** Current = **${metrics.ptsCritical.toFixed(2)}**. Zero-lag admission for Level 3 is vital.
3. **Rejection (15 Pts):** Rejections = **${metrics.nRejected}**. Prevent arrivals from reaching the 240m hard timeout.
4. **Specialized Cap (15 Pts):** Avoidable count = **${metrics.avoidableCount}**. Never place Level 1 into specialized beds while General beds are free.`;
  } else {
    return `**Bed Pulse Real-time Overview:**
- Active Total Score: **${metrics.totalScore.toFixed(2)} / 100.00 pts**.
- Free Ward Capacities: **${freeBeds.general}** General, **${freeBeds.monitored}** Monitored, and **${freeBeds.critical}** Critical beds.
- All admissions maintain strict non-anticipative online information rules with lognormal stay realizations.`;
  }
}

