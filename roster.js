// Profile class level is self-managed; the directory itself is restricted to admins.
const classLevels = [100, 150, 200, 250, 300, 400, 500, 600];
const rosterState = { profile: null, rows: [] };
const rosterDirectory = document.querySelector('#roster-directory');
const rosterNav = document.querySelector('#roster-nav');
const roleLabel = role => role.replace('_', ' ');
const profileLabel = profile => `${profile.cadet_type || (profile.role === 'POC' ? 'POC' : 'GMC')}${profile.admin_level && profile.admin_level !== 'NONE' ? ` · ${roleLabel(profile.admin_level)}` : ''}`;
const isDirectoryAdmin = profile => ['SUPER_ADMIN', 'ADMIN'].includes(profile?.admin_level || profile?.role);
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
  const rows = rosterState.rows.filter(row => (!role || row.cadet_type === role || row.admin_level === role) && (!level || String(row.class_level || '') === level) && (!search || `${row.full_name} ${row.email}`.toLowerCase().includes(search)));
  const canEdit = rosterState.profile?.admin_level === 'SUPER_ADMIN';
  rosterDirectory.innerHTML = rows.length ? `<div class="roster-table"><div class="roster-row roster-head"><span>Cadet</span><span>Classification / access</span><span>Class level</span><span>Contact</span><span>Status</span></div>${rows.map(row => `<div class="roster-row"><strong>${row.full_name}</strong><span class="tag">${profileLabel(row)}</span><span>${row.class_level || 'Not set'}</span><span>${row.email}<br>${row.phone || 'No phone'}</span><span class="status ${row.active ? 'attended' : 'no-show'}">${row.active ? 'Active' : 'Inactive'}</span>${canEdit ? `<button class="secondary roster-edit" data-id="${row.id}">Edit</button>` : ''}</div>`).join('')}</div>` : '<p class="muted">No cadets match these filters.</p>';
  document.querySelectorAll('.roster-edit').forEach(button => button.onclick = () => openCadetEditor(rosterState.rows.find(row => row.id === button.dataset.id)));
}
async function loadRosterDirectory() {
  if (!isDirectoryAdmin(rosterState.profile)) return;
  rosterDirectory.innerHTML = '<p class="muted">Loading cadet directory…</p>';
  const { data, error } = await window.det607Supabase.from('profiles').select('id, full_name, email, phone, role, active, class_level, cadet_type, admin_level').order('full_name');
  if (error) { rosterDirectory.innerHTML = `<p class="muted">Roster could not load: ${error.message}</p>`; return; }
  rosterState.rows = data || []; renderRosterDirectory();
}
function openMyProfile() {
  const profile = rosterState.profile;
  const options = classLevels.map(level => `<option value="${level}" ${profile.class_level === level ? 'selected' : ''}>${level}</option>`).join('');
  openRosterModal(`<p class="eyebrow">MY PROFILE</p><h2>${profile.full_name}</h2><p>Choose your current class level. This is saved to your own roster account only.</p><div class="form-row"><label>Cadet classification / access</label><input value="${profileLabel(profile)}" disabled></div><div class="form-row"><label>Class level</label><select id="my-class-level"><option value="">Choose class level</option>${options}</select></div><div class="modal-actions"><button class="secondary" id="cancel-profile-edit">Cancel</button><button class="primary" id="save-class-level">Save class level</button></div>`);
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
function openCadetEditor(cadet) {
  const levels = classLevels.map(level => `<option value="${level}" ${cadet.class_level === level ? 'selected' : ''}>${level}</option>`).join('');
  openRosterModal(`<p class="eyebrow">SUPER ADMIN EDIT</p><h2>${cadet.full_name}</h2><div class="form-row"><label>Name</label><input id="edit-name" value="${cadet.full_name}"></div><div class="form-row"><label>Phone</label><input id="edit-phone" value="${cadet.phone || ''}" placeholder="Phone number"></div><div class="form-row"><label>Cadet classification</label><select id="edit-type"><option value="GMC" ${cadet.cadet_type === 'GMC' ? 'selected' : ''}>GMC</option><option value="POC" ${cadet.cadet_type === 'POC' ? 'selected' : ''}>POC</option></select></div><div class="form-row"><label>Admin access</label><select id="edit-admin"><option value="NONE">None</option><option value="ADMIN" ${cadet.admin_level === 'ADMIN' ? 'selected' : ''}>Admin</option><option value="SUPER_ADMIN" ${cadet.admin_level === 'SUPER_ADMIN' ? 'selected' : ''}>Super Admin</option></select></div><div class="form-row"><label>Class level</label><select id="edit-level"><option value="">Not set</option>${levels}</select></div><div class="form-row"><label><input id="edit-active" type="checkbox" ${cadet.active ? 'checked' : ''}> Active roster account</label></div><div class="modal-actions"><button class="secondary" onclick="close()">Cancel</button><button class="primary" id="save-cadet-edit">Save cadet</button></div>`);
  document.querySelector('#save-cadet-edit').onclick = async () => { const button = document.querySelector('#save-cadet-edit'); button.disabled = true; const { error } = await window.det607Supabase.rpc('update_cadet_profile',{target_id:cadet.id,new_name:document.querySelector('#edit-name').value.trim(),new_phone:document.querySelector('#edit-phone').value.trim(),new_cadet_type:document.querySelector('#edit-type').value,new_class_level:Number(document.querySelector('#edit-level').value)||null,new_admin_level:document.querySelector('#edit-admin').value,new_active:document.querySelector('#edit-active').checked}); button.disabled=false; if(error)return rosterNotice(error.message); document.querySelector('#modal').classList.remove('show'); loadRosterDirectory(); rosterNotice('Cadet details updated.'); };
}
document.querySelector('#manage-profile').addEventListener('click', openMyProfile);
document.querySelector('#roster-search').addEventListener('input', renderRosterDirectory);
document.querySelector('#roster-role-filter').addEventListener('change', renderRosterDirectory);
document.querySelector('#roster-level-filter').addEventListener('change', renderRosterDirectory);
document.addEventListener('det607:profile', event => {
  rosterState.profile = event.detail.profile;
  if (isDirectoryAdmin(rosterState.profile)) { rosterNav.hidden = false; loadRosterDirectory(); }
});
