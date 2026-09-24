// Connect the static interface to the hosted Supabase project.
const authScreen = document.querySelector('#auth-screen');
const appShell = document.querySelector('#app-shell');
const authMessage = document.querySelector('#auth-message');
const authForm = document.querySelector('#sign-in-form');
const supabaseClient = window.DET607_SUPABASE && window.supabase
  ? window.supabase.createClient(window.DET607_SUPABASE.url, window.DET607_SUPABASE.publishableKey)
  : null;
window.det607Supabase = supabaseClient;
const invitationMode = () => {
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.slice(1));
  return hash.get('type') || query.get('type') || (query.has('code') || query.has('invite') ? 'invite' : null);
};
const inviteOnboardingKey = 'det607-invite-onboarding';
const isInviteOnboarding = () => sessionStorage.getItem(inviteOnboardingKey) === '1';

function showSetup(email) {
  authScreen.hidden = false;
  appShell.hidden = true;
  authForm.innerHTML = `<p class="eyebrow">DET 607 INVITATION</p><h2>Create your password</h2><p class="muted">Set a password for ${email}.</p><label>Email<input value="${email}" readonly></label><label>Password<input id="setup-password" type="password" autocomplete="new-password" required minlength="8"></label><label>Confirm password<input id="setup-confirm" type="password" autocomplete="new-password" required minlength="8"></label><button type="submit">Create account</button>`;
  authForm.onsubmit = async event => {
    event.preventDefault();
    const password = document.querySelector('#setup-password').value;
    const confirm = document.querySelector('#setup-confirm').value;
    if (password.length < 8 || password !== confirm) return authStatus('Use matching passwords with at least 8 characters.', 'error');
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) return authStatus(error.message, 'error');
    sessionStorage.setItem(inviteOnboardingKey, '1');
    history.replaceState({}, document.title, location.pathname);
    const { data: { session } } = await supabaseClient.auth.getSession();
    applySession(session);
  };
}

function showOnboarding(profile,email,session){authScreen.hidden=false;appShell.hidden=true;authForm.innerHTML=`<p class="eyebrow">CADET ONBOARDING</p><h2>Complete your profile</h2><p class="muted">Add your roster information before using the flag-detail portal.</p><label>Email<input value="${email}" readonly></label><label>Phone number<input id="onboard-phone" type="tel" required></label><label>Class level<select id="onboard-level" required><option value="">Select level</option>${[100,150,200,250,300,400,500,600].map(x=>`<option value="${x}">${x}</option>`).join('')}</select></label><label>School<select id="onboard-school" required><option value="">Select school</option><option value="FSU">FSU — Fayetteville State University</option><option value="UNCP">UNCP — University of North Carolina at Pembroke</option><option value="MU">MU — Methodist University</option><option value="FTCC">FTCC — Fayetteville Technical Community College</option><option value="CU">CU — Campbell University</option><option value="OTHER">Other</option></select></label><label id="onboard-other-wrap" hidden>Other school name<input id="onboard-other"></label><button class="primary" type="submit">Complete profile</button>`;const school=document.querySelector('#onboard-school');school.onchange=()=>document.querySelector('#onboard-other-wrap').hidden=school.value!=='OTHER';authForm.onsubmit=async e=>{e.preventDefault();const schoolCode=school.value,other=document.querySelector('#onboard-other').value.trim();if(schoolCode==='OTHER'&&!other)return authStatus('Enter your school name.','error');const {error}=await supabaseClient.rpc('update_my_profile_details',{new_phone:document.querySelector('#onboard-phone').value.trim(),new_class_level:Number(document.querySelector('#onboard-level').value),new_flight_name:null,new_school_code:schoolCode,new_other_school_name:other||null});if(error)return authStatus(error.message,'error');const done=await supabaseClient.rpc('complete_my_onboarding');if(done.error)return authStatus(done.error.message,'error');sessionStorage.removeItem(inviteOnboardingKey);await applySession(session)}}

function applyRoleAccess(profile){const staff=['ADMIN','SUPER_ADMIN'].includes(profile?.admin_level),superAdmin=profile?.admin_level==='SUPER_ADMIN';document.querySelector('#publish').hidden=!superAdmin;document.querySelector('#assign-cadet').hidden=!superAdmin;document.querySelector('#block-date').hidden=!staff;document.querySelector('#edit-times')?.parentElement&&(document.querySelector('#edit-times').parentElement.hidden=!staff);document.querySelector('[data-view="attendance"]').hidden=!staff;document.querySelector('[data-view="counseling"]').hidden=!staff;document.querySelector('#record-attendance').hidden=!staff;document.querySelector('#new-case').hidden=!staff;}

function authStatus(message, type = '') {
  authMessage.textContent = message;
  authMessage.className = `auth-message ${type}`;
}
function detailLabel(type) { return type === 'REVEILLE' ? 'Reveille' : 'Retreat'; }

function escapeRosterText(value) {
  return String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

// Replace the demo calendar renderer with a live monthly roster view. Staff can
// see each confirmed cadet and every remaining GMC/POC position at a glance.
function renderCalendar() {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const cells = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => `<div class="day-head">${day}</div>`);
  const selectedMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthDetails = data.details.filter(detail => detail.date.startsWith(selectedMonth));

  for (let day = 1; day <= last.getDate(); day += 1) {
    const date = new Date(year, month, day);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    const iso = `${selectedMonth}-${String(day).padStart(2, '0')}`;
    const details = monthDetails.filter(detail => detail.date === iso);
    const blocked = data.blocked[iso];
    const detailCards = details.map(detail => {
      const remainingGmc = detail.cadets.filter(name => !name).length;
      const pocStatus = detail.poc ? 'POC assigned' : 'POC open';
      const typeClass = detail.type === 'Reveille' ? 'reveille-detail' : 'retreat-detail';
      return `<div class="mini-detail ${typeClass} ${detail.status === 'ready' ? 'ready-card' : ''}" onclick="detailModal('${detail.id}')"><strong>${escapeRosterText(detail.type)} · ${escapeRosterText(detail.time)}</strong><span>${remainingGmc} GMC open · ${pocStatus}</span></div>`;
    }).join('');
    cells.push(`<div class="cal-day ${blocked ? 'blocked-day' : ''}"><div class="cal-date">${day}</div>${blocked ? `<p class="blocked-note">${escapeRosterText(blocked)}</p>` : detailCards || '<p class="blocked-note">No detail</p>'}</div>`);
  }

  document.querySelector('#calendar').innerHTML = cells.join('');
  document.querySelector('#month-title').textContent = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const summary = document.querySelector('#monthly-roster-summary');
  if (!summary) return;
  if (!monthDetails.length) {
    summary.innerHTML = '<p class="muted">No published schedule exists for this month. Select a month and use Publish schedule to create the weekday details.</p>';
    return;
  }
  summary.innerHTML = monthDetails.map(detail => {
    const namedCadets = detail.cadets.filter(Boolean);
    const openGmc = detail.cadets.filter(name => !name).length;
    const cadetText = namedCadets.length ? namedCadets.map(escapeRosterText).join(', ') : 'No GMC cadets assigned';
    const pocText = detail.poc ? escapeRosterText(detail.poc) : 'Open POC lead position';
    const typeClass = detail.type === 'Reveille' ? 'reveille-roster' : 'retreat-roster';
    return `<article class="monthly-roster-card ${typeClass} ${detail.blocked ? 'blocked-roster-card' : ''}"><div><p class="eyebrow">${escapeRosterText(fmtDate(detail.date))} · ${escapeRosterText(detail.type)}</p><h3>Report ${escapeRosterText(detail.report)} · Ceremony ${escapeRosterText(detail.time)}</h3><p><strong>GMC (${namedCadets.length}/3):</strong> ${cadetText}</p><p><strong>POC lead:</strong> ${pocText}</p></div><div class="roster-slot-status">${detail.blocked ? '<span class="tag danger">Blocked</span>' : `<span class="tag ${openGmc || !detail.poc ? 'warn' : ''}">${openGmc} GMC open · ${detail.poc ? 'POC filled' : '1 POC open'}</span>`}<button class="secondary" onclick="detailModal('${detail.id}')">View roster</button></div></article>`;
  }).join('');
}

// Open Details is intentionally a concise sign-up board, not a duplicate roster.
// It contains only active vacancies; the full assignment list belongs on Monthly Schedule.
function renderOpen() {
  const board = document.querySelector('#open-details');
  const vacancies = data.details.filter(detail => !detail.blocked && openPositions(detail));
  if (!vacancies.length) {
    board.innerHTML = '<p class="muted">There are no open positions in the published schedule.</p>';
    return;
  }
  board.innerHTML = vacancies.map(detail => {
    const openGmc = detail.cadets.filter(name => !name).length;
    const openPoc = detail.poc ? 0 : 1;
    const typeClass = detail.type === 'Reveille' ? 'reveille-open' : 'retreat-open';
    return `<article class="detail-card ${typeClass}"><div class="date-pill">${escapeRosterText(fmtDate(detail.date).split(' ')[1])}<small>${escapeRosterText(fmtDate(detail.date).split(' ')[0])} · ${escapeRosterText(detail.type)}</small></div><div class="card-main"><h3>Report ${escapeRosterText(detail.report)} · Ceremony ${escapeRosterText(detail.time)}</h3><p>${openGmc ? `${openGmc} GMC ${openGmc === 1 ? 'slot' : 'slots'} open` : 'GMC slots filled'}${openPoc ? ' · 1 POC lead slot open' : ' · POC lead filled'}</p><div class="tags">${openGmc ? `<span class="tag warn">${openGmc} GMC open</span>` : ''}${openPoc ? '<span class="tag danger">1 POC open</span>' : ''}</div></div><div class="card-actions"><button class="secondary" onclick="detailModal('${detail.id}')">View roster</button><button class="primary" onclick="signup('${detail.id}')">Select shift</button></div></article>`;
  }).join('');
}

window.detailModal = id => {
  const detail = data.details.find(item => String(item.id) === String(id));
  if (!detail) return toast('This flag detail is no longer available.');
  const staff = ['ADMIN', 'SUPER_ADMIN'].includes(window.det607CurrentProfile?.admin_level);
  const roster = detail.cadets.map((name, index) => `<button class="detail-row roster-slot ${name ? '' : 'open-slot'}" ${name || !staff ? 'disabled' : ''} data-position="GMC"><span>${name || `Open GMC position ${index + 1}`}</span></button>`).join('');
  const poc = `<button class="detail-row roster-slot ${detail.poc ? '' : 'open-slot'}" ${detail.poc || !staff ? 'disabled' : ''} data-position="POC"><span>${detail.poc || 'Open POC lead position'}</span></button>`;
  modal(`<p class="eyebrow">${fmtDate(detail.date)} · ${detail.type}</p><h2>${detail.type} flag detail</h2><p>Report ${detail.report}; ceremony ${detail.time}.</p><div class="form-row"><label>GMC roster (${detail.cadets.filter(Boolean).length}/3)</label>${roster}</div><div class="form-row"><label>POC lead</label>${poc}</div><div class="modal-actions">${staff ? '<button class="secondary" id="detail-edit-times">Edit times</button><button class="secondary" id="detail-assign">Assign cadet</button>' : ''}<button class="primary" id="detail-signup">Select shift</button></div>`);
  document.querySelector('#detail-signup').onclick = () => signup(detail.id);
  if (staff) {
    document.querySelector('#detail-assign').onclick = () => openAdminPlacement(detail);
    document.querySelector('#detail-edit-times').onclick = () => openDetailTimeEditor(detail);
    document.querySelectorAll('.open-slot').forEach(slot => slot.onclick = () => openAdminPlacement(detail, slot.dataset.position));
  }
};

async function openAdminPlacement(detail, requestedPosition = null) {
  const { data: cadets, error } = await supabaseClient.from('profiles').select('id,full_name,cadet_type').eq('active', true).order('full_name');
  if (error) return toast(error.message);
  const openGmc = detail.cadets.filter(name => !name).length;
  const openPoc = !detail.poc;
  const gmcs = (cadets || []).filter(cadet => cadet.cadet_type === 'GMC');
  const pocs = (cadets || []).filter(cadet => cadet.cadet_type === 'POC');
  const choices = requestedPosition ? `<option value="${requestedPosition}">${requestedPosition === 'POC' ? 'POC lead position' : 'GMC position'}</option>` : [openGmc ? '<option value="GMC">GMC position</option>' : '', openPoc ? '<option value="POC">POC lead position</option>' : ''].join('');
  if (!choices) return toast('This flag detail is fully staffed.');
  const cadetOptions = type => (type === 'POC' ? pocs : gmcs).map(cadet => `<option value="${cadet.id}">${escapeRosterText(cadet.full_name)}</option>`).join('') || '<option value="">No eligible cadets available</option>';
  const initialPosition = requestedPosition || (openGmc ? 'GMC' : 'POC');
  modal(`<p class="eyebrow">STAFF ASSIGNMENT</p><h2>Assign cadet</h2><p>Only eligible cadets are listed for this position.</p><div class="form-row"><label>Open position</label><select id="staff-position" ${requestedPosition ? 'disabled' : ''}>${choices}</select></div><div class="form-row"><label>Eligible cadet</label><select id="staff-cadet">${cadetOptions(initialPosition)}</select></div><div class="modal-actions"><button class="secondary" id="cancel-staff-assignment">Cancel</button><button class="primary" id="save-staff-assignment">Assign</button></div>`);
  document.querySelector('#cancel-staff-assignment').onclick = close;
  document.querySelector('#staff-position').onchange = event => { document.querySelector('#staff-cadet').innerHTML = cadetOptions(event.target.value); };
  document.querySelector('#save-staff-assignment').onclick = async () => {
    const cadetId = document.querySelector('#staff-cadet').value;
    if (!cadetId) return toast('There is no eligible cadet available for this position.');
    const cadet = cadets.find(item => item.id === cadetId);
    const { error: assignError } = await supabaseClient.rpc('admin_assign_detail', { target_detail_id: detail.id, target_cadet_id: cadetId });
    if (assignError) return toast(assignError.message);
    await supabaseClient.functions.invoke('send-notification', { body: { recipientId: cadetId, eventType: 'ADMIN_ASSIGNMENT', entityType: 'DETAIL', entityId: detail.id, subject: `DET 607 Flag Detail assignment — ${detail.type}`, html: `<p>You were assigned to ${detail.type} on ${fmtDate(detail.date)}. Report at ${detail.report}.</p>` } });
    close(); const { data: { session } } = await supabaseClient.auth.getSession(); await applySession(session); toast(`${cadet.full_name} assigned.`);
  };
}

function openDetailTimeEditor(detail) {
  modal(`<p class="eyebrow">DETAIL TIME UPDATE</p><h2>Update ${detail.type} times</h2><div class="form-row"><label>Report time</label><input id="staff-report-time" type="time" value="${detail.report}"></div><div class="form-row"><label>Ceremony time</label><input id="staff-ceremony-time" type="time" value="${detail.time}"></div><div class="modal-actions"><button class="secondary" id="cancel-detail-times">Cancel</button><button class="primary" id="save-detail-times">Save changes</button></div>`);
  document.querySelector('#cancel-detail-times').onclick = close;
  document.querySelector('#save-detail-times').onclick = async () => {
    const report = document.querySelector('#staff-report-time').value, ceremony = document.querySelector('#staff-ceremony-time').value;
    const { data: recipients, error } = await supabaseClient.rpc('admin_update_detail_times', { target_detail_id: detail.id, new_report_time: report, new_ceremony_time: ceremony });
    if (error) return toast(error.message);
    for (const recipientId of recipients || []) await supabaseClient.functions.invoke('send-notification', { body: { recipientId, eventType: 'DETAIL_TIME_UPDATED', entityType: 'DETAIL', entityId: detail.id, subject: `DET 607 Flag Detail time updated — ${detail.type}`, html: `<p>Your ${detail.type} on ${fmtDate(detail.date)} now reports at ${report}; ceremony is ${ceremony}.</p>` } });
    close(); const { data: { session } } = await supabaseClient.auth.getSession(); await applySession(session); toast('Detail time updated.');
  };
}

async function loadLiveRoster(profile, email) {
  const { data: details, error: detailError } = await supabaseClient.rpc('get_live_schedule_roster');
  if (detailError) throw detailError;
  const mapped = (details || []).map(detail => {
    const assignedCadets = detail.cadet_names || [];
    return {
    id: detail.detail_id, date: detail.detail_date, type: detailLabel(detail.detail_type),
    report: String(detail.report_time).slice(0, 5), time: String(detail.ceremony_time).slice(0, 5),
    cadets: [...assignedCadets, ...Array(Math.max(0, 3 - assignedCadets.length)).fill('')], poc: detail.poc_name || '',
    status: detail.blocked ? 'blocked' : 'open', blocked: detail.blocked, blockedReason: detail.blocked_reason
  }});
  data = { details: mapped, blocked: Object.fromEntries(mapped.filter(d => d.blocked).map(d => [d.date, d.blockedReason || 'Unavailable'])), requests: [], attendance: [], cases: [] };
  const displayName = profile.full_name || 'Cadet';
  const initials = displayName.split(/\s+/).filter(Boolean).map(name => name[0]).join('').slice(0, 2).toUpperCase();
  const classification = profile.cadet_type || (profile.role === 'POC' ? 'POC' : 'GMC');
  const access = profile.admin_level && profile.admin_level !== 'NONE' ? ` · ${profile.admin_level.replace('_', ' ')}` : '';
  const profileRole = `${classification}${access}`;
  document.querySelector('.user-card strong').textContent = displayName;
  document.querySelector('.user-card small').textContent = profileRole;
  document.querySelector('.avatar').textContent = initials || 'CD';
  document.querySelector('#profile-name').textContent = displayName;
  document.querySelector('#profile-email').textContent = email || '';
  document.querySelector('#profile-role').textContent = profileRole;
  window.det607CurrentProfile=profile; applyRoleAccess(profile); document.dispatchEvent(new CustomEvent('det607:profile', { detail: { profile, email } }));
  document.querySelector('#page-title').textContent = `Welcome, ${displayName}.`;
  const first = mapped[0]?.date ? new Date(mapped[0].date + 'T12:00') : new Date();
  month = first.getMonth(); year = first.getFullYear(); render(); syncScheduleMonthPicker();
}

async function applySession(session) {
  if (!session) { authScreen.hidden = false; appShell.hidden = true; return; }
  if (['invite', 'recovery'].includes(invitationMode())) return showSetup(session.user?.email || '');
  authStatus('Checking roster access…');
  const { data: profile, error } = await supabaseClient.rpc('get_my_profile').maybeSingle();
  if (error) {
    authStatus(`Sign-in succeeded, but roster access could not be checked: ${error.message}`, 'error');
    return;
  }
  if (!profile || !profile.active) {
    await supabaseClient.auth.signOut();
    authStatus('This account is not yet on the active DET 607 roster. Ask the roster administrator to create or activate it.', 'error');
    return;
  }
  if (!profile.onboarding_complete && isInviteOnboarding()) return showOnboarding(profile, session.user?.email || '', session);
  try { await loadLiveRoster(profile, session.user?.email); authScreen.hidden = true; appShell.hidden = false; }
  catch (loadError) { authStatus(`Roster access is configured, but the schedule could not load: ${loadError.message}`, 'error'); }
}

authForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabaseClient) return authStatus('The secure connection is unavailable. Refresh and try again.', 'error');
  if (!document.querySelector('#auth-email')) return;
  const button = authForm.querySelector('button'); button.disabled = true; authStatus('Signing in…');
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email: $('#auth-email').value.trim(), password: $('#auth-password').value });
  button.disabled = false;
  if (error) return authStatus(error.message, 'error');
  if (data.session) await applySession(data.session);
});
if (supabaseClient) {
  const inviteCode=new URLSearchParams(location.search).get('code');
  (inviteCode?supabaseClient.auth.exchangeCodeForSession(inviteCode):supabaseClient.auth.getSession()).then(({ data: { session }, error })=>{if(error)return authStatus(error.message,'error');applySession(session)});
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => applySession(session), 0);
  });
} else authStatus('The secure connection is unavailable. Refresh and try again.', 'error');

const profileMenu = document.querySelector('#profile-menu');
const profilePopover = document.querySelector('#profile-popover');
const signOutButton = document.querySelector('#sign-out');
profileMenu?.addEventListener('click', () => {
  const opening = profilePopover.hidden;
  profilePopover.hidden = !opening;
  profileMenu.setAttribute('aria-expanded', String(opening));
});
signOutButton?.addEventListener('click', async () => {
  signOutButton.disabled = true;
  await supabaseClient.auth.signOut();
  profilePopover.hidden = true;
  profileMenu.setAttribute('aria-expanded', 'false');
  authStatus('You have been signed out.', 'success');
  signOutButton.disabled = false;
});

async function sendOwnAssignmentEmail(profile, detail) {
  const role = profile.cadet_type === 'POC' ? 'POC lead' : 'Cadet';
  await supabaseClient.functions.invoke('send-notification', { body: {
    recipientId: profile.id,
    eventType: 'ASSIGNMENT_CONFIRMATION', entityType: 'DETAIL', entityId: detail.id,
    subject: `DET 607 Flag Detail confirmed — ${detail.type} ${fmtDate(detail.date)}`,
    html: `<h2>Flag detail confirmed</h2><p>You are confirmed as the ${role} for <strong>${detail.type}</strong> on ${fmtDate(detail.date)}.</p><p>Report: ${detail.report}. Ceremony: ${detail.time}.</p>`
  }});
}

window.signup = detailId => {
  const profile = window.det607CurrentProfile;
  const detail = data.details.find(item => item.id === detailId);
  if (!profile || !detail) return typeof toast === 'function' && toast('This detail is no longer available. Refresh and try again.');
  const isPoc = profile.cadet_type === 'POC';
  const slotLabel = isPoc ? 'POC lead' : 'Cadet';
  if (isPoc && detail.poc) return toast('The POC lead position for this detail has already been claimed.');
  if (!isPoc && !detail.cadets.some(name => !name)) return toast('All three GMC cadet positions for this detail have been claimed.');
  modal(`<p class="eyebrow">CONFIRM FLAG DETAIL</p><h2>${detail.type} · ${fmtDate(detail.date)}</h2><p>You are claiming the <strong>${slotLabel}</strong> position. Report at ${detail.report}; ceremony at ${detail.time}.</p><p>This is first come, first served. Once confirmed, it becomes part of your schedule.</p><div class="modal-actions"><button class="secondary" onclick="close()">Cancel</button><button class="primary" id="confirm-detail-claim">Yes, confirm this shift</button></div>`);
  document.querySelector('#confirm-detail-claim').onclick = async () => {
    const button = document.querySelector('#confirm-detail-claim');
    button.disabled = true; button.textContent = 'Confirming…';
    const { error } = await supabaseClient.rpc('claim_open_detail', { target_detail_id: detailId });
    if (error) { button.disabled = false; button.textContent = 'Yes, confirm this shift'; return toast(error.message); }
    await sendOwnAssignmentEmail(profile, detail);
    close();
    const { data: { session } } = await supabaseClient.auth.getSession();
    await applySession(session);
    toast('Flag detail confirmed and added to your schedule.');
  };
};

function monthKeyFromSelection(value) {
  return value && /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : null;
}

function scheduleMonthValue() {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function syncScheduleMonthPicker() {
  const picker = document.querySelector('#schedule-month');
  if (picker) picker.value = scheduleMonthValue();
}

function selectScheduleMonth(value) {
  const monthKey = monthKeyFromSelection(value);
  if (!monthKey) return;
  const selected = new Date(`${monthKey}T12:00`);
  year = selected.getFullYear();
  month = selected.getMonth();
  renderCalendar();
  syncScheduleMonthPicker();
}

async function publishSelectedMonth(monthKey) {
  const selected = new Date(`${monthKey}T12:00`);
  const publishLabel = selected.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  if (!confirm(`Publish the ${publishLabel} schedule? Weekday Reveille and Retreat details will be created. Active cadets will be notified and eligible cadets can claim open slots.`)) return;
  const { data, error } = await supabaseClient.rpc('publish_month_schedule', { target_month: monthKey });
  if (error) return toast(error.message);
  const published = Array.isArray(data) ? data[0] : data;
  let emailed = 0;
  for (const recipientId of published?.recipient_ids || []) {
    const result = await supabaseClient.functions.invoke('send-notification', { body: {
      recipientId, eventType: 'SCHEDULE_PUBLISHED', entityType: 'SCHEDULE', entityId: published.schedule_id,
      subject: 'DET 607 Flag Detail schedule is open',
      html: `<h2>Schedule published</h2><p>The ${publishLabel} flag-detail schedule is now open.</p><p>Sign in to review Reveille and Retreat details and claim an eligible open position.</p>`
    }});
    if (!result.error && !result.data?.error) emailed++;
  }
  const { data: { session } } = await supabaseClient.auth.getSession();
  await applySession(session);
  toast(`Schedule published. ${emailed} active cadet notification${emailed === 1 ? '' : 's'} sent.`);
}

function publishCurrentMonth() {
  const current = scheduleMonthValue();
  modal(`<p class="eyebrow">SCHEDULE PUBLICATION</p><h2>Choose a month to publish</h2><p>Publishing creates Reveille and Retreat on every weekday only. Each detail has three GMC slots and one POC lead slot.</p><div class="form-row"><label for="publish-month">Schedule month</label><input id="publish-month" type="month" value="${current}" min="${new Date().toISOString().slice(0, 7)}"></div><div class="modal-actions"><button class="secondary" onclick="close()">Cancel</button><button class="primary" id="confirm-publish-month">Continue</button></div>`);
  document.querySelector('#confirm-publish-month').onclick = () => {
    const monthKey = monthKeyFromSelection(document.querySelector('#publish-month').value);
    if (!monthKey) return toast('Select a schedule month.');
    close();
    selectScheduleMonth(monthKey.slice(0, 7));
    publishSelectedMonth(monthKey);
  };
}

document.querySelector('#publish').onclick = publishCurrentMonth;
document.querySelector('#schedule-month').onchange = event => selectScheduleMonth(event.target.value);
document.querySelector('#previous-month').onclick = () => {
  month -= 1;
  if (month < 0) { month = 11; year -= 1; }
  renderCalendar();
  syncScheduleMonthPicker();
};
document.querySelector('#next-month').onclick = () => {
  month += 1;
  if (month > 11) { month = 0; year += 1; }
  renderCalendar();
  syncScheduleMonthPicker();
};
syncScheduleMonthPicker();

async function openSuperAdminPlacement() {
  const profile = window.det607CurrentProfile;
  if (profile?.admin_level !== 'SUPER_ADMIN') return toast('Only the Super Admin can place cadets into open positions.');
  const openDetails = data.details.filter(detail => !detail.blocked && (detail.cadets.some(name => !name) || !detail.poc));
  if (!openDetails.length) return toast('There are no unfilled positions in the published schedule.');
  const { data: cadets, error } = await supabaseClient.from('profiles').select('id,full_name,cadet_type,active').eq('active', true).order('full_name');
  if (error) return toast(error.message);
  modal(`<p class="eyebrow">SUPER ADMIN PLACEMENT</p><h2>Place cadet in an open position</h2><p>GMC cadets fill GMC slots; POCs fill POC lead slots. The schedule is checked before saving.</p><div class="form-row"><label>Flag detail</label><select id="placement-detail">${openDetails.map(detail => `<option value="${detail.id}">${fmtDate(detail.date)} · ${detail.type} · ${detail.report}</option>`).join('')}</select></div><div class="form-row"><label>Cadet</label><select id="placement-cadet">${(cadets || []).map(cadet => `<option value="${cadet.id}">${cadet.full_name} (${cadet.cadet_type})</option>`).join('')}</select></div><div class="modal-actions"><button class="secondary" onclick="close()">Cancel</button><button class="primary" id="place-cadet">Place cadet</button></div>`);
  document.querySelector('#place-cadet').onclick = async () => {
    const detailId = document.querySelector('#placement-detail').value;
    const cadetId = document.querySelector('#placement-cadet').value;
    const cadet = (cadets || []).find(item => item.id === cadetId);
    const detail = data.details.find(item => item.id === detailId);
    const button = document.querySelector('#place-cadet'); button.disabled = true; button.textContent = 'Placing…';
    const { error: placementError } = await supabaseClient.rpc('super_admin_assign_detail', { target_detail_id: detailId, target_cadet_id: cadetId });
    if (placementError) { button.disabled = false; button.textContent = 'Place cadet'; return toast(placementError.message); }
    await supabaseClient.functions.invoke('send-notification', { body: { recipientId: cadetId, eventType: 'ADMIN_ASSIGNMENT', entityType: 'DETAIL', entityId: detailId, subject: `DET 607 Flag Detail assignment — ${detail.type} ${fmtDate(detail.date)}`, html: `<h2>Flag detail assignment</h2><p>You were placed on <strong>${detail.type}</strong> for ${fmtDate(detail.date)}. Report at ${detail.report}; ceremony at ${detail.time}.</p>` } });
    close(); const { data: { session } } = await supabaseClient.auth.getSession(); await applySession(session); toast(`${cadet?.full_name || 'Cadet'} was placed on the detail.`);
  };
}

document.querySelector('#assign-cadet').onclick = openSuperAdminPlacement;

async function blockScheduleDate() {
  const defaultDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  modal(`<p class="eyebrow">SCHEDULE AVAILABILITY</p><h2>Block a date</h2><p>Both Reveille and Retreat will be removed from sign-up. Any existing assignments are removed from the active roster and affected cadets are notified.</p><div class="form-row"><label>Date</label><input id="block-input" type="date" value="${defaultDate}"></div><div class="form-row"><label>Reason</label><input id="block-reason" placeholder="Holiday, closure, or other reason" required></div><div class="modal-actions"><button class="secondary" onclick="close()">Cancel</button><button class="primary" id="confirm-block-date">Block date</button></div>`);
  document.querySelector('#confirm-block-date').onclick = async () => {
    const date = document.querySelector('#block-input').value;
    const reason = document.querySelector('#block-reason').value.trim();
    if (!date || !reason) return toast('Enter both a date and reason.');
    const button = document.querySelector('#confirm-block-date'); button.disabled = true; button.textContent = 'Blocking…';
    const { data, error } = await supabaseClient.rpc('admin_block_schedule_date', { target_date: date, block_reason: reason });
    if (error) { button.disabled = false; button.textContent = 'Block date'; return toast(error.message); }
    const result = Array.isArray(data) ? data[0] : data;
    for (const recipientId of result?.recipient_ids || []) {
      await supabaseClient.functions.invoke('send-notification', { body: { recipientId, eventType: 'DETAIL_BLOCKED', entityType: 'DATE', entityId: result.event_id, subject: `DET 607 Flag Detail cancelled — ${fmtDate(date)}`, html: `<h2>Flag detail cancelled</h2><p>Your Reveille or Retreat assignment on ${fmtDate(date)} has been removed.</p><p>Reason: ${reason}</p>` } });
    }
    close(); const { data: { session } } = await supabaseClient.auth.getSession(); await applySession(session);
    toast(`Date blocked. ${result?.removed_assignments || 0} assignment${result?.removed_assignments === 1 ? '' : 's'} removed.`);
  };
}

document.querySelector('#block-date').onclick = blockScheduleDate;
