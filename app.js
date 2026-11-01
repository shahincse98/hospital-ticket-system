// CAREFLOW HOSPITAL QUEUE & TOKEN SYSTEM
// Data definitions, state handling & voice engine

// 1. Initial Hospital Departments & Counter configuration
const DEPARTMENTS = [
  { id: 'gen', code: 'GEN', name: 'General Medicine', bn: 'সাধারণ মেডিসিন', icon: '🩺', room: 'Room 101' },
  { id: 'cardio', code: 'CARD', name: 'Cardiology', bn: 'হৃদরোগ বিভাগ', icon: '❤️', room: 'Room 203' },
  { id: 'pedia', code: 'PED', name: 'Pediatrics / Child', bn: 'শিশু বিভাগ', icon: '👶', room: 'Room 105' },
  { id: 'ortho', code: 'ORTH', name: 'Orthopedics & Spine', bn: 'হাড় ও জোড়া বিভাগ', icon: '🦴', room: 'Room 302' },
  { id: 'gynae', code: 'GYN', name: 'Gynecology & Obs', bn: 'স্ত্রী ও প্রসূতি বিভাগ', icon: '🤰', room: 'Room 208' },
  { id: 'dental', code: 'DENT', name: 'Dental Care', bn: 'দন্ত চিকিৎসা বিভাগ', icon: '🦷', room: 'Room 109' }
];

// App State
let appData = {
  tokens: [],
  counters: DEPARTMENTS.map(d => ({
    deptId: d.id,
    deptName: d.name,
    room: d.room,
    currentPatient: null,
    history: []
  })),
  lastTokenCount: {
    GEN: 0,
    CARD: 0,
    PED: 0,
    ORTH: 0,
    GYN: 0,
    DENT: 0
  },
  audioEnabled: true,
  latestAnnouncement: null
};

// LocalStorage Persistence
const STORAGE_KEY = 'careflow_hospital_db';
function loadSavedData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      appData = { ...appData, ...parsed };
    } catch (e) {
      console.error('Failed to parse localStorage data', e);
    }
  } else {
    // Seed initial demo data for immediate testing
    seedDemoData();
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  // Broadcast update to other tabs if any
  if (window.BroadcastChannel) {
    const channel = new BroadcastChannel('hospital_queue_sync');
    channel.postMessage({ type: 'DATA_UPDATED' });
  }
}

// Seed helper
function seedDemoData() {
  const samplePatients = [
    { name: 'Abdul Karim', age: 48, gender: 'Male', deptId: 'gen', isEmergency: false },
    { name: 'Fatema Begum', age: 62, gender: 'Female', deptId: 'cardio', isEmergency: true },
    { name: 'Tahmid Khan', age: 6, gender: 'Male', deptId: 'pedia', isEmergency: false },
    { name: 'Nasrin Akhter', age: 34, gender: 'Female', deptId: 'gynae', isEmergency: false },
    { name: 'Sujon Mia', age: 29, gender: 'Male', deptId: 'ortho', isEmergency: false }
  ];

  samplePatients.forEach(p => {
    generateTokenInternal(p.name, p.age, p.gender, '01711223344', p.deptId, p.isEmergency);
  });
}

// 2. Audio & Speech Synthesis
function playDing() {
  if (!appData.audioEnabled) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.65);
  } catch (err) {
    console.warn('AudioContext not allowed without prior user interaction.', err);
  }
}

function announceToken(tokenNo, roomName) {
  if (!appData.audioEnabled) return;
  playDing();

  if ('speechSynthesis' in window) {
    setTimeout(() => {
      window.speechSynthesis.cancel(); // Cancel any existing speech
      const text = `Token number ${tokenNo.replace('-', ' ')}, please proceed to ${roomName}`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }, 450);
  }
}

// 3. Token Generation Logic
function generateTokenInternal(name, age, gender, phone, deptId, isEmergency) {
  const dept = DEPARTMENTS.find(d => d.id === deptId) || DEPARTMENTS[0];
  appData.lastTokenCount[dept.code] = (appData.lastTokenCount[dept.code] || 0) + 1;
  const countStr = String(appData.lastTokenCount[dept.code]).padStart(3, '0');
  const tokenNo = `${dept.code}-${countStr}`;

  const tokenObj = {
    id: 'tok_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    tokenNo: tokenNo,
    patientName: name,
    patientAge: age,
    patientGender: gender,
    patientPhone: phone || 'N/A',
    deptId: dept.id,
    deptName: dept.name,
    room: dept.room,
    isEmergency: isEmergency,
    status: 'waiting', // waiting, consulting, completed, skipped
    createdAt: new Date().toISOString()
  };

  // Emergency or Senior Citizen gets prioritized in queue order
  if (isEmergency) {
    // Find index of last emergency token in waiting queue for this department
    const lastEmgIndex = appData.tokens.filter(t => t.deptId === deptId && t.status === 'waiting' && t.isEmergency).length;
    appData.tokens.splice(lastEmgIndex, 0, tokenObj);
  } else {
    appData.tokens.push(tokenObj);
  }

  saveData();
  return tokenObj;
}

// 4. DOM Initialization & View Management
document.addEventListener('DOMContentLoaded', () => {
  loadSavedData();
  initNavigation();
  initKioskView();
  initDoctorConsole();
  initDisplayView();
  initLiveClock();
  initAudioToggle();

  // Listen to cross-tab updates
  if (window.BroadcastChannel) {
    const channel = new BroadcastChannel('hospital_queue_sync');
    channel.onmessage = (msg) => {
      if (msg.data.type === 'DATA_UPDATED') {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          appData = JSON.parse(saved);
          renderAllViews();
        }
      }
    };
  }
});

// View Navigation
function initNavigation() {
  const navTabs = document.querySelectorAll('.nav-tab');
  const appViews = document.querySelectorAll('.app-view');

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetView = tab.getAttribute('data-view');
      navTabs.forEach(t => t.classList.remove('active'));
      appViews.forEach(v => v.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(`view-` + targetView).classList.add('active');
      renderAllViews();
    });
  });
}

// Live Clock
function initLiveClock() {
  function update() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
    const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const clockEl = document.getElementById('liveClock');
    const tvClockEl = document.getElementById('tvClock');
    const tvDateEl = document.getElementById('tvDate');

    if (clockEl) clockEl.textContent = timeStr;
    if (tvClockEl) tvClockEl.textContent = timeStr;
    if (tvDateEl) tvDateEl.textContent = dateStr;
  }
  update();
  setInterval(update, 1000);
}

// Audio Toggle
function initAudioToggle() {
  const btn = document.getElementById('soundToggle');
  btn.addEventListener('click', () => {
    appData.audioEnabled = !appData.audioEnabled;
    if (appData.audioEnabled) {
      btn.classList.remove('muted');
      btn.querySelector('.sound-label').textContent = 'Audio Alert On';
      playDing();
    } else {
      btn.classList.add('muted');
      btn.querySelector('.sound-label').textContent = 'Audio Muted';
    }
  });
}

// 5. KIOSK VIEW INITIALIZATION
function initKioskView() {
  const grid = document.getElementById('departmentGrid');
  grid.innerHTML = DEPARTMENTS.map((dept, idx) => `
    <label class="dept-card-radio">
      <input type="radio" name="selectedDept" value="${dept.id}" ${idx === 0 ? 'checked' : ''} required>
      <div class="dept-radio-inner">
        <span class="dept-icon">${dept.icon}</span>
        <span class="dept-name">${dept.name}</span>
        <span class="dept-bn">${dept.bn}</span>
      </div>
      
    </label>
  `).join('');

  // Form Submission
  const form = document.getElementById('tokenForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('patientName').value.trim();
    const age = document.getElementById('patientAge').value;
    const gender = document.getElementById('patientGender').value;
    const phone = document.getElementById('patientPhone').value.trim();
    const deptId = document.querySelector('input[name="selectedDept"]:checked').value;
    const isEmergency = document.getElementById('isEmergency').checked;

    if (!name || !age) return;

    const token = generateTokenInternal(name, age, gender, phone, deptId, isEmergency);
    displayTicketSlip(token);
    renderAllViews();
    form.reset();
    document.querySelector('input[name="selectedDept"]').checked = true;
  });

  document.getElementById('btnDismissTicket').addEventListener('click', () => {
    document.getElementById('latestTicketBox').classList.add('hidden');
  });

  renderDeptStats();
}

function displayTicketSlip(token) {
  const box = document.getElementById('latestTicketBox');
  document.getElementById('slipTokenNo').textContent = token.tokenNo;
  document.getElementById('slipDept').textContent = token.deptName;
  document.getElementById('slipName').textContent = token.patientName;
  document.getElementById('slipAgeSex').textContent = `${token.patientAge} yrs / ${token.patientGender}`;
  document.getElementById('slipRoom').textContent = token.room;
  document.getElementById('slipTime').textContent = new Date(token.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Calculate how many waiting ahead
  const aheadCount = appData.tokens.filter(t => t.deptId === token.deptId && t.status === 'waiting' && t.id !== token.id).length;
  document.getElementById('slipAhead').textContent = `${aheadCount} patients ahead`;

  box.classList.remove('hidden');
}

function renderDeptStats() {
  const container = document.getElementById('deptStatsList');
  if (!container) return;

  container.innerHTML = DEPARTMENTS.map(dept => {
    const waiting = appData.tokens.filter(t => t.deptId === dept.id && t.status === 'waiting').length;
    const served = appData.tokens.filter(t => t.deptId === dept.id && t.status === 'completed').length;
    return `
      <div class="dept-stat-row">
        <span class="dept-stat-name">${dept.icon} ${dept.name}</span>
        <div class="dept-stat-badges">
          <span class="stat-pill pill-waiting">⏳ ${waiting} Waiting</span>
          <span class="stat-pill pill-served">✅ ${served} Done</span>
        </div>
      </div>
    `;
  }).join('');
}

// 6. DOCTOR CONSOLE INITIALIZATION
function initDoctorConsole() {
  const select = document.getElementById('doctorCounterSelect');
  select.innerHTML = DEPARTMENTS.map(d => `
    <option value="${d.id}">${d.name} (${d.room})</option>
  `).join('');

  select.addEventListener('change', () => {
    renderDoctorConsole();
  });

  // Action Buttons
  document.getElementById('btnCallNext').addEventListener('click', () => {
    const deptId = select.value;
    callNextPatient(deptId);
  });

  document.getElementById('btnRecall').addEventListener('click', () => {
    const deptId = select.value;
    const counter = appData.counters.find(c => c.deptId === deptId);
    if (counter && counter.currentPatient) {
      announceToken(counter.currentPatient.tokenNo, counter.room);
    }
  });

  document.getElementById('btnComplete').addEventListener('click', () => {
    const deptId = select.value;
    finishConsultation(deptId, 'completed');
  });

  document.getElementById('btnSkip').addEventListener('click', () => {
    const deptId = select.value;
    finishConsultation(deptId, 'skipped');
  });

  renderDoctorConsole();
}

function callNextPatient(deptId) {
  // Find next waiting patient for this department
  const nextIndex = appData.tokens.findIndex(t => t.deptId === deptId && t.status === 'waiting');
  if (nextIndex === -1) {
    alert('No more patients currently waiting in this department queue!');
    return;
  }

  const patient = appData.tokens[nextIndex];
  patient.status = 'consulting';

  const counter = appData.counters.find(c => c.deptId === deptId);
  if (counter) {
    // If someone was currently in, mark completed
    if (counter.currentPatient) {
      counter.currentPatient.status = 'completed';
    }
    counter.currentPatient = patient;
  }

  appData.latestAnnouncement = {
    tokenNo: patient.tokenNo,
    room: counter.room,
    deptName: patient.deptName,
    patientName: patient.patientName
  };

  saveData();
  renderAllViews();
  announceToken(patient.tokenNo, counter.room);
}

function finishConsultation(deptId, finalStatus) {
  const counter = appData.counters.find(c => c.deptId === deptId);
  if (counter && counter.currentPatient) {
    counter.currentPatient.status = finalStatus;
    counter.history.push(counter.currentPatient);
    counter.currentPatient = null;
    saveData();
    renderAllViews();
  }
}

function renderDoctorConsole() {
  const select = document.getElementById('doctorCounterSelect');
  if (!select) return;
  const deptId = select.value;
  const dept = DEPARTMENTS.find(d => d.id === deptId);
  const counter = appData.counters.find(c => c.deptId === deptId);

  document.getElementById('activeDeptName').textContent = dept.name;

  const waitingList = appData.tokens.filter(t => t.deptId === deptId && t.status === 'waiting');
  const servedCount = appData.tokens.filter(t => t.deptId === deptId && t.status === 'completed').length;

  document.getElementById('activeDeptWaiting').textContent = waitingList.length;
  document.getElementById('activeDeptServed').textContent = servedCount;
  document.getElementById('doctorQueueCount').textContent = `${waitingList.length} Patients`;

  // Render Active Patient Card
  const currentContent = document.getElementById('currentPatientContent');
  const btnRecall = document.getElementById('btnRecall');
  const btnSkip = document.getElementById('btnSkip');
  const btnComplete = document.getElementById('btnComplete');
  const statusPill = document.getElementById('currentStatusPill');

  if (counter && counter.currentPatient) {
    const cp = counter.currentPatient;
    statusPill.textContent = 'In Consultation';
    statusPill.style.background = 'rgba(2, 132, 199, 0.2)';
    statusPill.style.color = '#38bdf8';
    statusPill.style.borderColor = 'rgba(2, 132, 199, 0.4)';

    currentContent.className = 'patient-consult-active';
    currentContent.innerHTML = `
      <div class="active-token-hero">${cp.tokenNo}</div>
      <div class="active-patient-name">${cp.patientName}</div>
      <div class="active-patient-meta">
        ${cp.patientAge} Years • ${cp.patientGender} • Phone: ${cp.patientPhone}
        ${cp.isEmergency ? '<br><span class="emergency-tag" style="margin-top:0.4rem;display:inline-block">🚨 Emergency Priority Case</span>' : ''}
      </div>
    `;

    btnRecall.disabled = false;
    btnSkip.disabled = false;
    btnComplete.disabled = false;
  } else {
    statusPill.textContent = 'Waiting for Patient';
    statusPill.style.background = 'rgba(16, 185, 129, 0.2)';
    statusPill.style.color = '#34d399';
    statusPill.style.borderColor = 'rgba(16, 185, 129, 0.4)';

    currentContent.className = 'patient-consult-empty';
    currentContent.innerHTML = `
      <div class="empty-graphic">🩺</div>
      <h4>No Patient In Consultation</h4>
      <p>Click "Call Next Patient" to summon the first person in queue.</p>
    `;

    btnRecall.disabled = true;
    btnSkip.disabled = true;
    btnComplete.disabled = true;
  }

  // Render Queue Table
  const tbody = document.getElementById('doctorQueueTableBody');
  if (waitingList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:2rem;">No pending patients in queue.</td></tr>`;
  } else {
    tbody.innerHTML = waitingList.map(t => `
      <tr>
        <td><span class="token-tag">${t.tokenNo}</span></td>
        <td><strong>${t.patientName}</strong></td>
        <td>${t.patientAge} / ${t.patientGender}</td>
        <td>${t.isEmergency ? '<span class="emergency-tag">🚨 Priority</span>' : '<span style="color:#94a3b8">Regular</span>'}</td>
        <td>${new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
        <td>
          <button class="btn-secondary" style="padding:0.35rem 0.75rem;font-size:0.8rem;" onclick="callDirectToken('${t.id}')">
            Call Direct
          </button>
        </td>
      </tr>
    `).join('');
  }
}

window.callDirectToken = function (tokenId) {
  const patient = appData.tokens.find(t => t.id === tokenId);
  if (!patient) return;

  const select = document.getElementById('doctorCounterSelect');
  select.value = patient.deptId;

  patient.status = 'consulting';
  const counter = appData.counters.find(c => c.deptId === patient.deptId);
  if (counter) {
    if (counter.currentPatient) counter.currentPatient.status = 'completed';
    counter.currentPatient = patient;
  }

  appData.latestAnnouncement = {
    tokenNo: patient.tokenNo,
    room: counter.room,
    deptName: patient.deptName,
    patientName: patient.patientName
  };

  saveData();
  renderAllViews();
  announceToken(patient.tokenNo, counter.room);
};

// 7. WAITING HALL DISPLAY INITIALIZATION
function initDisplayView() {
  renderDisplayView();
}

function renderDisplayView() {
  // Spotlight
  const banner = document.getElementById('spotlightBanner');
  if (appData.latestAnnouncement) {
    document.getElementById('spotlightToken').textContent = appData.latestAnnouncement.tokenNo;
    document.getElementById('spotlightRoom').textContent = appData.latestAnnouncement.room;
    document.getElementById('spotlightDept').textContent = appData.latestAnnouncement.deptName;
    document.getElementById('spotlightPatient').textContent = `Patient: ${appData.latestAnnouncement.patientName}`;
  } else {
    document.getElementById('spotlightToken').textContent = '--';
    document.getElementById('spotlightRoom').textContent = 'Counters Active';
    document.getElementById('spotlightDept').textContent = 'Ready to serve';
    document.getElementById('spotlightPatient').textContent = 'Please wait for your call';
  }

  // Counters Grid
  const grid = document.getElementById('countersGrid');
  grid.innerHTML = appData.counters.map(c => {
    const isLatest = appData.latestAnnouncement && appData.latestAnnouncement.tokenNo === (c.currentPatient && c.currentPatient.tokenNo);
    return `
      <div class="counter-tv-card ${isLatest ? 'active-calling' : ''}">
        <div class="counter-tv-header">
          <span class="counter-tv-room">${c.room}</span>
          <span class="counter-tv-dept">${c.deptName}</span>
        </div>
        <div class="counter-tv-token">${c.currentPatient ? c.currentPatient.tokenNo : '---'}</div>
        <div class="counter-tv-patient">
          ${c.currentPatient ? c.currentPatient.patientName : 'Desk Available'}
        </div>
      </div>
    `;
  }).join('');

  // Ticker for upcoming waiting patients
  const tickerItems = document.getElementById('tickerItems');
  const upcoming = appData.tokens.filter(t => t.status === 'waiting').slice(0, 10);
  if (upcoming.length === 0) {
    tickerItems.innerHTML = `<span style="color:var(--text-secondary);font-size:0.85rem;">All queues are currently clear.</span>`;
  } else {
    tickerItems.innerHTML = upcoming.map(u => `
      <div class="ticker-item">
        <strong>${u.tokenNo}</strong>
        <span>(${u.deptName.split(' ')[0]})</span>
        ${u.isEmergency ? '🚨' : ''}
      </div>
    `).join('');
  }
}

// 8. General View Refresher
function renderAllViews() {
  renderDeptStats();
  renderDoctorConsole();
  renderDisplayView();
}
