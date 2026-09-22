// Profile class level is self-managed; the directory itself is restricted to admins.
const classLevels = [100, 150, 200, 250, 300, 400, 500, 600];
const rosterState = { profile: null, rows: [] };
const rosterDirectory = document.querySelector('#roster-directory');
const rosterNav = document.querySelector('#roster-nav');
const roleLabel = role => role.replace('_', ' ');
const isDirectoryAdmin = profile => ['SUPER_ADMIN', 'ADMIN'].includes(profile?.role);
function rosterNotice(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message; toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3200);
}
function openRosterModal(html) {
  document.querySelector('#modal-content').innerHTML = html;
  document.querySelector('#modal').classList.add('show');
}
function renderRosterDirectory() {
  if (!isDirectoryAdmin(rosterState.profile)) return;
  const search = document.querySelector('#roster-search').value.trim().toLowerCase();
  const role = document.querySelector('#roster-role-filter').value;
  const level = document.querySelector('#roster-level-filter').value;
  const rows = rosterState.rows.filter(row => (!role || row.role === role) && (!level || String(row.class_level || '') === level) && (!search || `${row.full_name} ${row.email}`.toLowerCase().includes(search)));
  rosterDirectory.innerHTML = rows.length ? `<div class="roster-table"><div class="roster-row roster-head"><span>Cadet</span><span>Role</span><span>Class level</span><span>Email</span><span>Status</span></div>${rows.map(row => `<div class="roster-row"><strong>${row.full_name}</strong><span class="tag">${roleLabel(row.role)}</span><span>${row.class_level || 'Not set'}</span><a href="mailto:${row.email}">${row.email}</a><span class="status ${row.active ? 'attended' : 'no-show'}">${row.active ? 'Active' : 'Inactive'}</span></div>`).join('')}</div>` : '<p class="muted">No cadets match these filters.</p>';
}
async function loadRosterDirectory() {
  if (!isDirectoryAdmin(rosterState.profile)) return;
  rosterDirectory.innerHTML = '<p class="muted">Loading cadet directory…</p>';
  const { data, error } = await window.det607Supabase.from('profiles').select('id, full_name, email, role, active, class_level').order('full_name');
  if (error) { rosterDirectory.innerHTML = `<p class="muted">Roster could not load: ${error.message}</p>`; return; }
  rosterState.rows = data || []; renderRosterDirectory();
}
function openMyProfile() {
  const profile = rosterState.profile;
  const options = classLevels.map(level => `<option value="${level}" ${profile.class_level === level ? 'selected' : ''}>${level}</option>`).join('');
  openRosterModal(`<p class="eyebrow">MY PROFILE</p><h2>${profile.full_name}</h2><p>Choose your current class level. This is saved to your own roster account only.</p><div class="form-row"><label>Role</label><input value="${roleLabel(profile.role)}" disabled></div><div class="form-row"><label>Class level</label><select id="my-class-level"><option value="">Choose class level</option>${options}</select></div><div class="modal-actions"><button class="secondary" id="cancel-profile-edit">Cancel</button><button class="primary" id="save-class-level">Save class level</button></div>`);
  document.querySelector('#cancel-profile-edit').onclick = () => document.querySelector('#modal').classList.remove('show');
  document.querySelector('#save-class-level').onclick = saveMyClassLevel;
}
async function saveMyClassLevel() {
  const selected = Number(document.querySelector('#my-class-level').value);
  if (!classLevels.includes(selected)) return rosterNotice('Choose one of the approved class levels.');
  const button = document.querySelector('#save-class-level'); button.disabled = true;
  const { data, error } = await window.det607Supabase.rpc('update_my_class_level', { new_class_level: selected }).maybeSingle();
  button.disabled = false;
  if (error) return rosterNotice(`Class level could not be saved: ${error.message}`);
  rosterState.profile = { ...rosterState.profile, class_level: data.class_level };
  const existing = rosterState.rows.find(row => row.id === rosterState.profile.id);
  if (existing) existing.class_level = data.class_level;
  document.querySelector('#modal').classList.remove('show'); renderRosterDirectory(); rosterNotice(`Class level updated to ${selected}.`);
}
document.querySelector('#manage-profile').addEventListener('click', openMyProfile);
document.querySelector('#roster-search').addEventListener('input', renderRosterDirectory);
document.querySelector('#roster-role-filter').addEventListener('change', renderRosterDirectory);
document.querySelector('#roster-level-filter').addEventListener('change', renderRosterDirectory);
document.addEventListener('det607:profile', event => {
  rosterState.profile = event.detail.profile;
  if (isDirectoryAdmin(rosterState.profile)) { rosterNav.hidden = false; loadRosterDirectory(); }
});
