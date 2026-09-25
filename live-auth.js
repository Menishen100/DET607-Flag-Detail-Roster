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

function applyRoleAccess(profile){const staff=['ADMIN','SUPER_ADMIN'].includes(profile?.admin_level),superAdmin=profile?.admin_level==='SUPER_ADMIN';document.querySelector('#publish').hidden=!superAdmin;document.querySelector('#assign-cadet').hidden=!superAdmin;document.querySelector('#block-date').hidden=!superAdmin;document.querySelector('#edit-times')?.parentElement&&(document.querySelector('#edit-times').parentElement.hidden=!staff);document.querySelector('[data-view="attendance"]').hidden=!staff;document.querySelector('[data-view="counseling"]').hidden=!staff;document.querySelector('#record-attendance').hidden=!staff;document.querySelector('#new-case').hidden=!staff;document.querySelector('#edit-important-contact').hidden=!staff;}

async function loadImportantInformation(){const {data:settings,error}=await supabaseClient.rpc('get_portal_important_information_content');if(error)return;const setting=Array.isArray(settings)?settings[0]:settings;if(!setting)return;[['#important-reveille-title','reveille_title'],['#important-reveille-message','reveille_message'],['#important-retreat-title','retreat_title'],['#important-retreat-message','retreat_message'],['#important-dress-message','dress_message'],['#important-coverage-message','coverage_message'],['#important-missed-message','missed_message'],['#important-note','note_message'],['#important-contact-name','contact_name']].forEach(([selector,key])=>{if(setting[key])document.querySelector(selector).textContent=setting[key];});const email=document.querySelector('#important-contact-email');email.textContent=setting.contact_email;email.href=`mailto:${setting.contact_email}`;const discord=document.querySelector('#important-contact-discord');discord.textContent=setting.contact_discord?` or on Discord (${setting.contact_discord})`:'';}

function openImportantContactEditor(){if(!['ADMIN','SUPER_ADMIN'].includes(window.det607CurrentProfile?.admin_level))return toast('Administrator access is required.');const value=selector=>document.querySelector(selector).textContent,discord=value('#important-contact-discord').replace(/^ or on Discord \(|\)$/g,'');const field=(id,label,contents,area=false,optional=false)=>`<div class="form-row"><label>${label}${optional?' <span class="muted">(optional)</span>':''}</label>${area?`<textarea id="${id}" rows="3">${escapeRosterText(contents)}</textarea>`:`<input id="${id}" value="${escapeRosterText(contents)}">`}</div>`;modal(`<p class="eyebrow">ADMIN SETTINGS</p><h2>Cadet information</h2><p class="muted">This announcement is visible to every cadet throughout the portal.</p>${field('important-reveille-title-input','Reveille heading',value('#important-reveille-title'))}${field('important-reveille-message-input','Reveille instruction',value('#important-reveille-message'),true)}${field('important-retreat-title-input','Retreat heading',value('#important-retreat-title'))}${field('important-retreat-message-input','Retreat instruction',value('#important-retreat-message'),true)}${field('important-dress-message-input','Dress and appearance instruction',value('#important-dress-message'),true)}${field('important-coverage-message-input','Coverage responsibility instruction',value('#important-coverage-message'),true)}${field('important-missed-message-input','Missed-details instruction',value('#important-missed-message'),true)}${field('important-note-input','Schedule exception note',value('#important-note'),true)}<hr>${field('important-contact-name-input','Contact name',value('#important-contact-name'))}<div class="form-row"><label>Contact email</label><input id="important-contact-email-input" type="email" value="${escapeRosterText(value('#important-contact-email'))}"></div>${field('important-contact-discord-input','Discord handle',discord,false,true)}<div class="modal-actions"><button class="secondary" onclick="close()">Cancel</button><button class="primary" id="save-important-contact">Save information</button></div>`);document.querySelector('#save-important-contact').onclick=async()=>{const button=document.querySelector('#save-important-contact');button.disabled=true;button.textContent='Saving…';const input=id=>document.querySelector(`#${id}`).value.trim();const {error}=await supabaseClient.rpc('admin_update_portal_important_information',{new_contact_name:input('important-contact-name-input'),new_contact_email:input('important-contact-email-input'),new_contact_discord:input('important-contact-discord-input')||null,new_reveille_title:input('important-reveille-title-input'),new_reveille_message:input('important-reveille-message-input'),new_retreat_title:input('important-retreat-title-input'),new_retreat_message:input('important-retreat-message-input'),new_dress_message:input('important-dress-message-input'),new_coverage_message:input('important-coverage-message-input'),new_missed_message:input('important-missed-message-input'),new_note_message:input('important-note-input')});if(error){button.disabled=false;button.textContent='Save information';return toast(error.message);}await loadImportantInformation();close();toast('Cadet information updated for all cadets.');};}

function authStatus(message, type = '') {
  authMessage.textContent = message;
  authMessage.className = `auth-message ${type}`;
}
function detailLabel(type) { return type === 'REVEILLE' ? 'Reveille' : 'Retreat'; }

function escapeRosterText(value) {
  return String(value || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function setPortalToday(){const now=new Date();document.querySelector('#today-label').textContent=`${now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})} · DET 607 operations`;}

// Replace the demo calendar renderer with a live monthly roster view. Staff can
// see each confirmed cadet and every remaining GMC/POC position at a glance.
function renderCalendar() {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const cells = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => `<div class="day-head">${day}</div>`);
  const selectedMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const canBlock = window.det607CurrentProfile?.admin_level === 'SUPER_ADMIN';
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
    cells.push(`<div class="cal-day ${iso === todayKey ? 'today' : ''} ${blocked ? 'blocked-day' : ''}"><div class="cal-date">${day}</div>${blocked ? `<p class="blocked-note"><strong>Unavailable</strong><span>${escapeRosterText(blocked)}</span></p>${canBlock ? `<button class="text-button block-calendar-date" onclick="unblockScheduleDate('${iso}')">Unblock date</button>` : ''}` : `${detailCards || '<p class="blocked-note">No detail</p>'}${canBlock ? `<button class="text-button block-calendar-date" onclick="blockScheduleDate('${iso}')">Block date</button>` : ''}`}</div>`);
  }

  document.querySelector('#calendar').innerHTML = cells.join('');
  document.querySelector('#month-title').textContent = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const summary = document.querySelector('#monthly-roster-summary');
  if (!summary) return;
  if (!monthDetails.length) {
    summary.innerHTML = '<p class="muted">No published schedule exists for this month. Select a month and use Publish schedule to create the weekday details.</p>';
    return;
  }
  const renderedBlockedDates = new Set();
  summary.innerHTML = monthDetails.map(detail => {
    if (detail.blocked) {
      if (renderedBlockedDates.has(detail.date)) return '';
      renderedBlockedDates.add(detail.date);
      const unblock = window.det607CurrentProfile?.admin_level === 'SUPER_ADMIN' ? `<button class="secondary" onclick="unblockScheduleDate('${detail.date}')">Unblock date</button>` : '';
      return `<article class="monthly-roster-card blocked-roster-card"><div><p class="eyebrow">${escapeRosterText(fmtDate(detail.date))}</p><h3>Flag detail unavailable</h3><p><strong>Reason:</strong> ${escapeRosterText(detail.blockedReason || 'Unavailable')}</p></div><div class="roster-slot-status"><span class="tag danger">Blocked</span>${unblock}</div></article>`;
    }
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

async function monthlyShiftCounts(detailDate) {
  const targetMonth = `${detailDate.slice(0, 7)}-01`;
  const { data: counts, error } = await supabaseClient.rpc('get_monthly_shift_counts', { target_month: targetMonth });
  if (error) throw error;
  return new Map((counts || []).map(item => [item.cadet_id, Number(item.shift_count) || 0]));
}

async function deliverNotification(payload) {
  const { data: result, error } = await supabaseClient.functions.invoke('send-notification', { body: payload });
  if (error) throw error;
  if (!result?.ok) throw new Error(result?.error || 'Notification could not be sent');
  return result;
}

window.detailModal = async id => {
  const detail = data.details.find(item => String(item.id) === String(id));
  if (!detail) return toast('This flag detail is no longer available.');
  if (detail.blocked) {
    const unblock = window.det607CurrentProfile?.admin_level === 'SUPER_ADMIN' ? `<button class="primary" onclick="unblockScheduleDate('${detail.date}')">Unblock date</button>` : '<button class="secondary" onclick="close()">Close</button>';
    return modal(`<p class="eyebrow">${fmtDate(detail.date)}</p><h2>Flag detail unavailable</h2><p>This date is blocked and cannot be selected by cadets or POCs.</p><div class="form-row"><label>Reason</label><p>${escapeRosterText(detail.blockedReason || 'Unavailable')}</p></div><div class="modal-actions">${unblock}</div>`);
  }
  const staff = ['ADMIN', 'SUPER_ADMIN'].includes(window.det607CurrentProfile?.admin_level);
  const superAdmin = window.det607CurrentProfile?.admin_level === 'SUPER_ADMIN';
  let gmcs = [], pocs = [], shiftCounts = new Map();
  if (staff) {
    const { data: cadets, error } = await supabaseClient.from('profiles').select('id,full_name,cadet_type').eq('active', true).order('full_name');
    if (error) return toast(error.message);
    gmcs = (cadets || []).filter(cadet => cadet.cadet_type === 'GMC');
    pocs = (cadets || []).filter(cadet => cadet.cadet_type === 'POC');
    try { shiftCounts = await monthlyShiftCounts(detail.date); }
    catch (countError) { return toast(`Could not load monthly shift counts: ${countError.message}`); }
  }
  const options = (cadets, label, selectedId = '') => `<option value="">${label}</option>${cadets.map(cadet => `<option value="${cadet.id}" ${cadet.id === selectedId ? 'selected' : ''}>${escapeRosterText(cadet.full_name)} (${shiftCounts.get(cadet.id) || 0})</option>`).join('')}`;
  const roster = detail.cadets.map((name, index) => {
    if (!name) return staff ? `<select class="detail-row roster-slot inline-assignment" data-position="GMC"><option value="">Open GMC position ${index + 1}</option>${options(gmcs, 'Select GMC cadet').replace(/^<option[^>]*>.*?<\/option>/, '')}</select>` : `<div class="detail-row roster-slot open-slot"><span>Open GMC position ${index + 1}</span></div>`;
    if (superAdmin && detail.cadetIds?.[index]) return `<select class="detail-row roster-slot inline-replacement" data-current-cadet-id="${detail.cadetIds[index]}">${options(gmcs, 'Select GMC cadet', detail.cadetIds[index])}</select>`;
    return `<div class="detail-row roster-slot"><span>${escapeRosterText(name)}</span></div>`;
  }).join('');
  const poc = detail.poc ? (superAdmin && detail.pocId ? `<select class="detail-row roster-slot inline-replacement" data-current-cadet-id="${detail.pocId}">${options(pocs, 'Select POC cadet', detail.pocId)}</select>` : `<div class="detail-row roster-slot"><span>${escapeRosterText(detail.poc)}</span></div>`) : staff ? `<select class="detail-row roster-slot inline-assignment" data-position="POC"><option value="">Open POC lead position</option>${options(pocs, 'Select POC cadet').replace(/^<option[^>]*>.*?<\/option>/, '')}</select>` : `<div class="detail-row roster-slot open-slot"><span>Open POC lead position</span></div>`;
  modal(`<p class="eyebrow">${fmtDate(detail.date)} · ${detail.type}</p><h2>${detail.type} flag detail</h2><p>Report ${detail.report}; ceremony ${detail.time}.</p><div class="form-row"><label>GMC roster (${detail.cadets.filter(Boolean).length}/3)</label>${roster}</div><div class="form-row"><label>POC lead</label>${poc}</div><div class="modal-actions">${staff ? '<button class="secondary" id="detail-edit-times">Edit times</button><button class="primary" id="save-staff-assignments" disabled>Assign selected</button>' : '<button class="primary" id="detail-signup">Select shift</button>'}</div>`);
  if (!staff) document.querySelector('#detail-signup').onclick = () => signup(detail.id);
  if (staff) {
    document.querySelector('#detail-edit-times').onclick = () => openDetailTimeEditor(detail);
    const saveButton = document.querySelector('#save-staff-assignments');
    const refreshSaveButton = () => {
      const hasNewAssignment = [...document.querySelectorAll('.inline-assignment')].some(select => select.value);
      const hasReplacement = [...document.querySelectorAll('.inline-replacement')].some(select => select.value && select.value !== select.dataset.currentCadetId);
      saveButton.disabled = !(hasNewAssignment || hasReplacement);
    };
    document.querySelectorAll('.inline-assignment, .inline-replacement').forEach(select => select.onchange = refreshSaveButton);
    saveButton.onclick = async () => {
      const newAssignments = [...document.querySelectorAll('.inline-assignment')].map(select => select.value).filter(Boolean);
      const replacements = [...document.querySelectorAll('.inline-replacement')].map(select => ({ currentCadetId: select.dataset.currentCadetId, replacementId: select.value })).filter(item => item.replacementId && item.replacementId !== item.currentCadetId);
      if (!newAssignments.length && !replacements.length) return;
      saveButton.disabled = true; saveButton.textContent = 'Assigning…';
      let completed = 0;
      try {
        for (const cadetId of newAssignments) {
          const { error: assignError } = await supabaseClient.rpc('admin_assign_detail', { target_detail_id: detail.id, target_cadet_id: cadetId });
          if (assignError) throw assignError;
          completed += 1;
          await deliverNotification({ recipientId: cadetId, eventType: 'ADMIN_ASSIGNMENT', entityType: 'DETAIL', entityId: detail.id, subject: `DET 607 Flag Detail assignment — ${detail.type}`, html: `<h2>DET 607 Flag Detail assignment</h2><p>You were assigned to <strong>${detail.type}</strong> on ${fmtDate(detail.date)}.</p><p>Report at ${detail.report}; ceremony at ${detail.time}.</p>` });
        }
        for (const { currentCadetId, replacementId } of replacements) {
          const { error: replacementError } = await supabaseClient.rpc('super_admin_replace_detail_assignment', { target_detail_id: detail.id, current_cadet_id: currentCadetId, replacement_cadet_id: replacementId });
          if (replacementError) throw replacementError;
          completed += 1;
          await deliverNotification({ recipientId: currentCadetId, eventType: 'ASSIGNMENT_UPDATED', entityType: 'DETAIL', entityId: detail.id, subject: `DET 607 Flag Detail assignment updated — ${detail.type}`, html: `<p>You are no longer assigned to ${detail.type} on ${fmtDate(detail.date)}.</p>` });
          await deliverNotification({ recipientId: replacementId, eventType: 'ADMIN_ASSIGNMENT', entityType: 'DETAIL', entityId: detail.id, subject: `DET 607 Flag Detail assignment — ${detail.type}`, html: `<h2>DET 607 Flag Detail assignment</h2><p>You were assigned to <strong>${detail.type}</strong> on ${fmtDate(detail.date)}.</p><p>Report at ${detail.report}; ceremony at ${detail.time}.</p>` });
        }
      } catch (saveError) {
        toast(`${completed ? `${completed} assignment(s) saved. ` : ''}${saveError.message}`);
      }
      const { data: { session } } = await supabaseClient.auth.getSession();
      await applySession(session);
      await detailModal(detail.id);
      if (completed) toast(`${completed} roster assignment${completed === 1 ? '' : 's'} saved.`);
    };
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
  const rosterRows = Array.isArray(details) && details.length === 1 && Array.isArray(details[0]?.get_live_schedule_roster)
    ? details[0].get_live_schedule_roster
    : (Array.isArray(details?.get_live_schedule_roster) ? details.get_live_schedule_roster : (details || []));
  const mapped = rosterRows.map(detail => {
    const assignedCadets = detail.cadet_names || [];
    const assignedCadetIds = detail.cadet_ids || [];
    return {
    id: detail.detail_id, date: detail.detail_date, type: detailLabel(detail.detail_type),
    report: String(detail.report_time).slice(0, 5), time: String(detail.ceremony_time).slice(0, 5),
    cadets: [...assignedCadets, ...Array(Math.max(0, 3 - assignedCadets.length)).fill('')],
    cadetIds: [...assignedCadetIds, ...Array(Math.max(0, 3 - assignedCadetIds.length)).fill('')],
    poc: detail.poc_name || '', pocId: detail.poc_id || '',
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
  window.det607CurrentProfile=profile; applyRoleAccess(profile); await loadImportantInformation(); document.dispatchEvent(new CustomEvent('det607:profile', { detail: { profile, email } }));
  document.querySelector('#page-title').textContent = `Welcome, ${displayName}.`;
  const first = mapped[0]?.date ? new Date(mapped[0].date + 'T12:00') : new Date();
  month = first.getMonth(); year = first.getFullYear(); render(); setPortalToday(); syncScheduleMonthPicker();
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
document.querySelector('#edit-important-contact')?.addEventListener('click', openImportantContactEditor);
document.querySelector('#important-information-toggle')?.addEventListener('click', () => {
  const content = document.querySelector('#important-information-content');
  const toggle = document.querySelector('#important-information-toggle');
  const opening = content.hidden;
  content.hidden = !opening;
  toggle.setAttribute('aria-expanded', String(opening));
  toggle.querySelector('b').textContent = opening ? 'Hide details ▴' : 'View details ▾';
});
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
  await deliverNotification({
    recipientId: profile.id,
    eventType: 'ASSIGNMENT_CONFIRMATION', entityType: 'DETAIL', entityId: detail.id,
    subject: `DET 607 Flag Detail confirmed — ${detail.type} ${fmtDate(detail.date)}`,
    html: `<h2>Your DET 607 Flag Detail is confirmed</h2><p>You selected and confirmed the <strong>${role}</strong> position for <strong>${detail.type}</strong> on ${fmtDate(detail.date)}.</p><p>Report: ${detail.report}. Ceremony: ${detail.time}.</p>`
  });
}

window.signup = async detailId => {
  const profile = window.det607CurrentProfile;
  const detail = data.details.find(item => item.id === detailId);
  if (!profile || !detail) return typeof toast === 'function' && toast('This detail is no longer available. Refresh and try again.');
  if (detail.blocked) return toast(`This flag detail is unavailable: ${detail.blockedReason || 'Blocked date'}.`);
  const isPoc = profile.cadet_type === 'POC';
  const slotLabel = isPoc ? 'POC lead' : 'Cadet';
  if (isPoc && detail.poc) return toast('The POC lead position for this detail has already been claimed.');
  if (!isPoc && !detail.cadets.some(name => !name)) return toast('All three GMC cadet positions for this detail have been claimed.');
  let currentMonthCount = 0;
  try { currentMonthCount = (await monthlyShiftCounts(detail.date)).get(profile.id) || 0; }
  catch (countError) { return toast(`Could not load your monthly shift count: ${countError.message}`); }
  modal(`<p class="eyebrow">CONFIRM FLAG DETAIL</p><h2>${detail.type} · ${fmtDate(detail.date)}</h2><p>You are claiming the <strong>${slotLabel}</strong> position. Report at ${detail.report}; ceremony at ${detail.time}.</p><p><strong>Your shifts this month: (${currentMonthCount})</strong></p><p>This is first come, first served. Once confirmed, it becomes part of your schedule.</p><div class="modal-actions"><button class="secondary" onclick="close()">Cancel</button><button class="primary" id="confirm-detail-claim">Yes, confirm this shift</button></div>`);
  document.querySelector('#confirm-detail-claim').onclick = async () => {
    const button = document.querySelector('#confirm-detail-claim');
    button.disabled = true; button.textContent = 'Confirming…';
    const { error } = await supabaseClient.rpc('claim_open_detail', { target_detail_id: detailId });
    if (error) { button.disabled = false; button.textContent = 'Yes, confirm this shift'; return toast(error.message); }
    try { await sendOwnAssignmentEmail(profile, detail); }
    catch (notificationError) { toast(`Shift confirmed, but the email could not be sent: ${notificationError.message}`); }
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

async function openScheduleException(){
  if(!['ADMIN','SUPER_ADMIN'].includes(window.det607CurrentProfile?.admin_level))return toast('Administrator access is required.');
  const selectedMonth=scheduleMonthValue(),details=data.details.filter(detail=>detail.date.startsWith(selectedMonth)&&!detail.blocked);
  if(!details.length)return toast('Publish this month first, then select the weekday detail that needs a time exception.');
  modal(`<p class="eyebrow">SCHEDULE EXCEPTION</p><h2>Edit a selected flag-detail date</h2><p>Choose the exact weekday and detail. This changes only that shift; the standard monthly times remain unchanged.</p><div class="form-row"><label>Scheduled detail</label><select id="exception-detail">${details.map(detail=>`<option value="${detail.id}">${fmtDate(detail.date)} · ${detail.type} · report ${detail.report}</option>`).join('')}</select></div><div class="form-row"><label>Report time</label><input id="exception-report" type="time" value="${details[0].report}"></div><div class="form-row"><label>Ceremony time</label><input id="exception-ceremony" type="time" value="${details[0].time}"></div><div class="modal-actions"><button class="secondary" onclick="close()">Cancel</button><button class="primary" id="save-exception">Save exception</button></div>`);
  const picker=document.querySelector('#exception-detail');
  picker.onchange=()=>{const detail=details.find(item=>item.id===picker.value);document.querySelector('#exception-report').value=detail.report;document.querySelector('#exception-ceremony').value=detail.time;};
  document.querySelector('#save-exception').onclick=async()=>{const detail=details.find(item=>item.id===picker.value),report=document.querySelector('#exception-report').value,ceremony=document.querySelector('#exception-ceremony').value;if(!report||!ceremony)return toast('Enter both the report and ceremony times.');const button=document.querySelector('#save-exception');button.disabled=true;button.textContent='Saving…';const {data:recipients,error}=await supabaseClient.rpc('admin_update_detail_times',{target_detail_id:detail.id,new_report_time:report,new_ceremony_time:ceremony});if(error){button.disabled=false;button.textContent='Save exception';return toast(error.message);}for(const recipientId of recipients||[])await deliverNotification({recipientId,eventType:'DETAIL_TIME_UPDATED',entityType:'DETAIL',entityId:detail.id,subject:`DET 607 Flag Detail time updated — ${detail.type}`,html:`<p>Your ${detail.type} on ${fmtDate(detail.date)} now reports at ${report}; ceremony is ${ceremony}.</p>`});close();const {data:{session}}=await supabaseClient.auth.getSession();await applySession(session);toast('Time exception saved.');};
}

document.querySelector('#create-detail').onclick = openScheduleException;

async function blockScheduleDate(initialDate = '') {
  if (window.det607CurrentProfile?.admin_level !== 'SUPER_ADMIN') return toast('Only the Super Admin can block a schedule date.');
  const selectedMonth = scheduleMonthValue(), firstDay = `${selectedMonth}-01`, lastDay = new Date(year, month + 1, 0).getDate();
  const available = data.details.filter(detail => detail.date.startsWith(selectedMonth) && !detail.blocked).map(detail => detail.date);
  const fallback = available.find(date => new Date(`${date}T12:00`) >= new Date(new Date().setHours(0,0,0,0))) || available[0] || `${selectedMonth}-${String(Math.min(1 + ((8 - new Date(`${firstDay}T12:00`).getDay()) % 7), lastDay)).padStart(2, '0')}`;
  modal(`<p class="eyebrow">SCHEDULE AVAILABILITY</p><h2>Block a date</h2><p>Choose a weekday in ${new Date(`${firstDay}T12:00`).toLocaleDateString('en-US',{month:'long',year:'numeric'})}. The reason will be displayed to cadets, and this date cannot be selected for a flag detail.</p><div class="form-row"><label>Date</label><input id="block-input" type="date" min="${firstDay}" max="${selectedMonth}-${String(lastDay).padStart(2, '0')}" value="${initialDate || fallback}"></div><div class="form-row"><label>Reason</label><input id="block-reason" placeholder="Holiday, closure, training event, or other reason" required></div><div class="modal-actions"><button class="secondary" onclick="close()">Cancel</button><button class="primary" id="confirm-block-date">Confirm block</button></div>`);
  document.querySelector('#confirm-block-date').onclick = async () => {
    const date = document.querySelector('#block-input').value;
    const reason = document.querySelector('#block-reason').value.trim();
    if (!date || !reason) return toast('Enter both a date and reason.');
    const button = document.querySelector('#confirm-block-date'); button.disabled = true; button.textContent = 'Blocking…';
    const day = new Date(`${date}T12:00`).getDay();
    if (day === 0 || day === 6) { button.disabled = false; button.textContent = 'Confirm block'; return toast('There is no flag detail on weekends. Select a weekday.'); }
    const { data, error } = await supabaseClient.rpc('super_admin_block_schedule_date', { target_date: date, block_reason: reason });
    if (error) { button.disabled = false; button.textContent = 'Block date'; return toast(error.message); }
    const result = Array.isArray(data) ? data[0] : data;
    for (const recipientId of result?.recipient_ids || []) {
      await supabaseClient.functions.invoke('send-notification', { body: { recipientId, eventType: 'DETAIL_BLOCKED', entityType: 'DATE', entityId: result.event_id, subject: `DET 607 Flag Detail cancelled — ${fmtDate(date)}`, html: `<h2>Flag detail cancelled</h2><p>Your Reveille or Retreat assignment on ${fmtDate(date)} has been removed.</p><p>Reason: ${reason}</p>` } });
    }
    close(); const { data: { session } } = await supabaseClient.auth.getSession(); await applySession(session);
    toast(`Date blocked. ${result?.removed_assignments || 0} assignment${result?.removed_assignments === 1 ? '' : 's'} removed.`);
  };
}

window.unblockScheduleDate = async date => {
  if (window.det607CurrentProfile?.admin_level !== 'SUPER_ADMIN') return toast('Only the Super Admin can unblock a schedule date.');
  if (!confirm(`Unblock ${fmtDate(date)}? Cadets and POCs will be able to select any open positions on this date again.`)) return;
  const { error } = await supabaseClient.rpc('super_admin_unblock_schedule_date', { target_date: date });
  if (error) return toast(error.message);
  close();
  const { data: { session } } = await supabaseClient.auth.getSession();
  await applySession(session);
  toast('Date unblocked. Open positions are available for sign-up again.');
};

document.querySelector('#block-date').onclick = blockScheduleDate;
