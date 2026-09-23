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

async function loadLiveRoster(profile, email) {
  const { data: details, error: detailError } = await supabaseClient.rpc('get_schedule_roster');
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
  month = first.getMonth(); year = first.getFullYear(); render();
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

async function publishCurrentMonth() {
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  if (!confirm(`Publish the ${new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} schedule? Active cadets will be notified and eligible cadets can claim open slots.`)) return;
  const { data, error } = await supabaseClient.rpc('publish_month_schedule', { target_month: monthKey });
  if (error) return toast(error.message);
  const published = Array.isArray(data) ? data[0] : data;
  let emailed = 0;
  for (const recipientId of published?.recipient_ids || []) {
    const result = await supabaseClient.functions.invoke('send-notification', { body: {
      recipientId, eventType: 'SCHEDULE_PUBLISHED', entityType: 'SCHEDULE', entityId: published.schedule_id,
      subject: 'DET 607 Flag Detail schedule is open',
      html: `<h2>Schedule published</h2><p>The ${new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} flag-detail schedule is now open.</p><p>Sign in to review Reveille and Retreat details and claim an eligible open position.</p>`
    }});
    if (!result.error && !result.data?.error) emailed++;
  }
  const { data: { session } } = await supabaseClient.auth.getSession();
  await applySession(session);
  toast(`Schedule published. ${emailed} active cadet notification${emailed === 1 ? '' : 's'} sent.`);
}

document.querySelector('#publish').onclick = publishCurrentMonth;

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
