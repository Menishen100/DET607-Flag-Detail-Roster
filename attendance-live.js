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
  const militaryClock = value => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)).replace(':', '');
  const detailLabel = row => `${new Date(`${row.detail_date}T12:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${row.detail_type === 'REVEILLE' ? 'Reveille' : 'Retreat'}`;
  const toast = message => window.toast ? window.toast(message) : alert(message);
  const isFutureDetail = row => new Date(`${row.detail_date}T12:00`).setHours(0, 0, 0, 0) > new Date().setHours(0, 0, 0, 0);
  const checkInOpensAt = row => new Date(`${row.detail_date}T${String(row.report_time).slice(0, 5)}`).getTime() - (60 * 60 * 1000);
  const checkInIsOpen = row => Date.now() >= checkInOpensAt(row);

  function canConfirm(row) {
    return isAdmin() || (isPocLead() && row.cadet_type === 'GMC' && row.cadet_id !== profile.id);
  }
  function render() {
    const list = $('#attendance-list');
    if (!list || !profile) return;
    const heading = document.querySelector('#attendance-description');
    if (heading) heading.textContent = isAdmin() ? 'Confirm any attendance record, including your own. Cadets can check in first; every final decision is recorded.' : isPocLead() ? 'Confirm GMC attendance for flag details you lead. Your own attendance is confirmed by an administrator.' : 'Check in for your own assigned flag detail. A POC lead will confirm the final attendance record.';
    if (!rows.length) { list.innerHTML = '<p class="muted">No attendance records or review assignments are available.</p>'; return; }
    list.innerHTML = rows.map(row => {
      // `is_own` is determined by the secured roster RPC.  Using it avoids a
      // stale client profile object hiding a cadet's own check-in control.
      // A GMC roster response is restricted to that GMC's own assignments.
      // Keep the button available even while a newly refreshed profile has an
      // older client-side id than the signed-in Supabase session.
      const own = row.is_own === true || row.is_own === 'true' || row.cadet_id === profile.id || (!isAdmin() && !isPocLead());
      // Check-in opens one hour before report time and remains available until
      // the cadet checks in or a reviewer confirms the final attendance.
      const canCheckIn = own && !row.confirmed_at && !row.self_checked_in_at && checkInIsOpen(row);
      const action = canConfirm(row) && !isFutureDetail(row) ? `<button class="secondary" data-confirm-attendance="${row.assignment_id}">Confirm</button>` : canCheckIn ? `<button class="primary" data-check-in="${row.assignment_id}">Check in</button>` : '';
      const checkInNote = row.self_checked_in_at
        ? `Checked in ${militaryClock(row.self_checked_in_at)}`
        : 'No check-in yet';
      const statusLabel = !row.confirmed_at && !row.self_checked_in_at && !checkInIsOpen(row)
        ? `Check-in opens ${militaryClock(checkInOpensAt(row))}`
        : isFutureDetail(row) && !row.confirmed_at
        ? 'Scheduled — not confirmable yet'
        : row.confirmed_at
        ? `Confirmed: ${displayStatus(row.status)}`
        : row.self_checked_in_at ? 'Awaiting confirmation' : 'Not checked in';
      const statusClass = row.self_checked_in_at || row.status !== 'PENDING' ? String(row.status).toLowerCase().replace('_','-') : 'not-checked-in';
      const rosterLabel = row.assignment_position === 'POC_LEAD'
        ? `${row.cadet_type} · POC lead`
        : row.cadet_type;
      return `<article class="attendance-item"><strong>${escapeHtml(detailLabel(row))}</strong><span>${escapeHtml(row.cadet_name)}<br><small class="muted">${escapeHtml(rosterLabel)}</small></span><span>${escapeHtml(checkInNote)}</span><span class="status ${statusClass}">${escapeHtml(statusLabel)}</span>${action}</article>`;
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
