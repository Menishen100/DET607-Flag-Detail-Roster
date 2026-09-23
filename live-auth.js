// Connect the static interface to the hosted Supabase project.
const authScreen = document.querySelector('#auth-screen');
const appShell = document.querySelector('#app-shell');
const authMessage = document.querySelector('#auth-message');
const authForm = document.querySelector('#sign-in-form');
const supabaseClient = window.DET607_SUPABASE && window.supabase
  ? window.supabase.createClient(window.DET607_SUPABASE.url, window.DET607_SUPABASE.publishableKey)
  : null;
window.det607Supabase = supabaseClient;
const invitationMode=()=>{const query=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.slice(1));return hash.get('type')||query.get('type')||(query.has('code')?'invite':null)};
function showSetup(email){authScreen.hidden=false;appShell.hidden=true;authForm.innerHTML=`<p class="eyebrow">DET 607 INVITATION</p><h2>Create your password</h2><p class="muted">Set a password for ${email}.</p><label>Email<input value="${email}" readonly></label><label>Password<input id="setup-password" type="password" autocomplete="new-password" required minlength="8"></label><label>Confirm password<input id="setup-confirm" type="password" autocomplete="new-password" required minlength="8"></label><button type="submit">Create account</button>`;authForm.onsubmit=async e=>{e.preventDefault();const p=document.querySelector('#setup-password').value,c=document.querySelector('#setup-confirm').value;if(p.length<8||p!==c)return authStatus('Use matching passwords with at least 8 characters.','error');const {error}=await supabaseClient.auth.updateUser({password:p});if(error)return authStatus(error.message,'error');history.replaceState({},document.title,location.pathname);const {data:{session}}=await supabaseClient.auth.getSession();applySession(session)}}

function applyRoleAccess(profile){const staff=['ADMIN','SUPER_ADMIN'].includes(profile?.admin_level);document.querySelector('#publish').hidden=!staff;document.querySelector('#block-date').hidden=!staff;document.querySelector('#edit-times')?.parentElement&&(document.querySelector('#edit-times').parentElement.hidden=!staff);document.querySelector('#assign-cadet').hidden=!staff;document.querySelector('[data-view="attendance"]').hidden=!staff;document.querySelector('[data-view="counseling"]').hidden=!staff;document.querySelector('#record-attendance').hidden=!staff;document.querySelector('#new-case').hidden=!staff;}

function authStatus(message, type = '') {
  authMessage.textContent = message;
  authMessage.className = `auth-message ${type}`;
}
function detailLabel(type) { return type === 'REVEILLE' ? 'Reveille' : 'Retreat'; }

async function loadLiveRoster(profile, email) {
  const [{ data: details, error: detailError }, { data: assignments, error: assignmentError }] = await Promise.all([
    supabaseClient.from('details').select('id,detail_date,detail_type,report_time,ceremony_time,blocked,blocked_reason').order('detail_date'),
    supabaseClient.from('assignments').select('id,detail_id,cadet_id,position,removed_at,profiles!assignments_cadet_id_fkey(full_name)').is('removed_at', null)
  ]);
  if (detailError || assignmentError) throw detailError || assignmentError;
  const mapped = (details || []).map(detail => {
    const roster = (assignments || []).filter(item => item.detail_id === detail.id);
    return {
      id: detail.id, date: detail.detail_date, type: detailLabel(detail.detail_type),
      report: String(detail.report_time).slice(0, 5), time: String(detail.ceremony_time).slice(0, 5),
      cadets: roster.filter(item => item.position === 'CADET').map(item => item.profiles?.full_name || 'Cadet'),
      poc: roster.find(item => item.position === 'POC_LEAD')?.profiles?.full_name || '',
      status: detail.blocked ? 'blocked' : 'open', blocked: detail.blocked, blockedReason: detail.blocked_reason
    };
  });
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
  if(['invite','recovery'].includes(invitationMode()))return showSetup(session.user?.email||'');
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
  // A profile changes from "Pending invite" to "Active" when the cadet first signs in.
  await supabaseClient.rpc('complete_my_onboarding');
  try { await loadLiveRoster(profile, session.user?.email); authScreen.hidden = true; appShell.hidden = false; }
  catch (loadError) { authStatus(`Roster access is configured, but the schedule could not load: ${loadError.message}`, 'error'); }
}

authForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabaseClient) return authStatus('The secure connection is unavailable. Refresh and try again.', 'error');
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

window.signup=async detailId=>{const profile=window.det607CurrentProfile;if(!profile)return authStatus('Your roster profile is still loading.','error');const {error}=await supabaseClient.rpc('claim_open_detail',{target_detail_id:detailId});if(error)return typeof toast==='function'?toast(error.message):authStatus(error.message,'error');const {data:{session}}=await supabaseClient.auth.getSession();await applySession(session);typeof toast==='function'&&toast('Flag detail selected. It is now part of your schedule.');};
