// Live attendance workflow: self check-in creates a pending record; the
// designated reviewer confirms the final status.
(() => {
  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  let profile = null;
  let rows = [];
  const isAdmin = () => ['ADMIN', 'SUPER_ADMIN'].includes(profile?.admin_level);
  const isPocLead = () => profile?.cadet_type === 'POC' && !isAdmin();
  const displayStatus = value => ({ PENDING: 'Pending confirmation', ATTENDED: 'Attended', LATE: 'Late', NO_SHOW: 'No show', EXCUSED: 'Excused' })[value] || value;
  const detailLabel = row => `${new Date(`${row.detail_date}T12:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${row.detail_type === 'REVEILLE' ? 'Reveille' : 'Retreat'}`;
  const toast = message => window.toast ? window.toast(message) : alert(message);

  function canConfirm(row) {
    return (isPocLead() && row.cadet_type === 'GMC' && row.cadet_id !== profile.id) || (isAdmin() && row.cadet_type === 'POC' && row.cadet_id !== profile.id);
  }
  function render() {
    const list = $('#attendance-list');
    if (!list || !profile) return;
    const heading = document.querySelector('#attendance-description');
    if (heading) heading.textContent = isAdmin() ? 'Confirm POC attendance. Cadets check in first; every final decision is recorded.' : isPocLead() ? 'Confirm GMC attendance for flag details you lead. Your own attendance is confirmed by an administrator.' : 'Check in for your own assigned flag detail. A POC lead will confirm the final attendance record.';
    if (!rows.length) { list.innerHTML = '<p class="muted">No attendance records or review assignments are available.</p>'; return; }
    list.innerHTML = rows.map(row => {
      const own = row.cadet_id === profile.id;
      const canCheckIn = own && row.status === 'PENDING' && !row.self_checked_in_at;
      const action = canConfirm(row) ? `<button class="secondary" data-confirm-attendance="${row.assignment_id}">Confirm</button>` : canCheckIn ? `<button class="primary" data-check-in="${row.assignment_id}">Check in</button>` : '';
      return `<article class="attendance-item"><strong>${escapeHtml(detailLabel(row))}</strong><span>${escapeHtml(row.cadet_name)}<br><small class="muted">${escapeHtml(row.cadet_type)} · ${escapeHtml(row.position === 'POC_LEAD' ? 'POC lead' : 'GMC')}</small></span><span>${row.self_checked_in_at ? `Checked in ${new Date(row.self_checked_in_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'No check-in yet'}</span><span class="status ${String(row.status).toLowerCase().replace('_','-')}">${escapeHtml(displayStatus(row.status))}</span>${action}</article>`;
    }).join('');
    list.querySelectorAll('[data-check-in]').forEach(button => button.onclick = () => checkIn(button.dataset.checkIn));
    list.querySelectorAll('[data-confirm-attendance]').forEach(button => button.onclick = () => confirmAttendance(button.dataset.confirmAttendance));
  }
  async function load() {
    const { data, error } = await window.det607Supabase.rpc('get_my_attendance_roster');
    if (error) { $('#attendance-list').innerHTML = `<p class="muted">Attendance could not load: ${escapeHtml(error.message)}</p>`; return; }
    rows = data || []; render();
  }
  async function checkIn(assignmentId) {
    const { error } = await window.det607Supabase.rpc('check_in_to_my_detail', { target_assignment_id: assignmentId });
    if (error) return toast(error.message);
    toast('Check-in recorded. Your POC lead will confirm attendance.'); await load();
  }
  function confirmAttendance(assignmentId) {
    const row = rows.find(item => item.assignment_id === assignmentId); if (!row) return;
    window.modal(`<p class="eyebrow">ATTENDANCE CONFIRMATION</p><h2>${escapeHtml(row.cadet_name)}</h2><p>${escapeHtml(detailLabel(row))}</p><div class="form-row"><label>Final status</label><select id="final-attendance-status"><option value="ATTENDED">Attended</option><option value="LATE">Late</option><option value="NO_SHOW">No show</option><option value="EXCUSED">Excused</option></select></div><div class="form-row"><label>Reviewer note (optional)</label><textarea id="final-attendance-note" placeholder="Objective attendance note"></textarea></div><div class="modal-actions"><button class="secondary" onclick="close()">Cancel</button><button class="primary" id="save-final-attendance">Confirm attendance</button></div>`);
    $('#save-final-attendance').onclick = async () => {
      const button = $('#save-final-attendance'); button.disabled = true; button.textContent = 'Saving…';
      const { error } = await window.det607Supabase.rpc('confirm_detail_attendance', { target_assignment_id: assignmentId, new_status: $('#final-attendance-status').value, new_note: $('#final-attendance-note').value.trim() || null });
      if (error) { button.disabled = false; button.textContent = 'Confirm attendance'; return toast(error.message); }
      window.close(); toast('Attendance confirmed.'); await load();
    };
  }
  document.addEventListener('det607:profile', event => { profile = event.detail.profile; $('#record-attendance').hidden = true; window.renderAttendance = render; load(); });
})();
