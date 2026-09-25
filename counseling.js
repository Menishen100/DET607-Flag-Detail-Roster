// Live counseling workflow. This replaces the old in-memory counseling demo once a user is signed in.
(() => {
  const state = { profile: null, cases: [], assignments: [], loading: false };
  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const isStaff = () => {
    const profile = state.profile;
    return profile && (profile.cadet_type === 'POC' || ['ADMIN', 'SUPER_ADMIN'].includes(profile.admin_level));
  };
  const canReview = () => ['ADMIN', 'SUPER_ADMIN'].includes(state.profile?.admin_level);
  const formatStatus = value => String(value || 'DRAFT').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
  const assignmentLabel = assignment => assignment ? `${assignment.detail_date} · ${assignment.detail_type === 'REVEILLE' ? 'Reveille' : 'Retreat'}` : 'Assignment unavailable';
  const assignmentFor = id => state.assignments.find(item => item.id === id);
  const cadetName = caseItem => assignmentFor(caseItem.assignment_id)?.profiles?.full_name || 'Cadet';
  const counselingEmail = () => ({
    subject: 'DET 607 Counseling Awaiting Your Signature',
    html: `<h2>Counseling awaiting your signature</h2><p>You have a counseling record that requires your attention and signature.</p><p>Please sign in to DET 607 Flag Detail Management to review and sign it.</p><p><a href="https://det607flagdetail.com">Review and sign counseling</a></p><p>This email does not include counseling details to protect your privacy.</p>`
  });
  function showToast(message) { window.toast ? window.toast(message) : alert(message); }
  function openModal(html) { $('#modal-content').innerHTML = html; $('#modal').classList.add('show'); }
  function closeModal() { $('#modal').classList.remove('show'); }

  async function notificationFailure(error, data) {
    if (data?.error) return data.error;
    try {
      const response = error?.context?.clone ? error.context.clone() : error?.context;
      const body = await response?.json?.();
      if (body?.error) return body.error;
    } catch (_) {
      // The provider response may not be JSON; keep the safe fallback below.
    }
    return error?.message || 'Email service did not confirm delivery.';
  }

  async function sendSignatureEmail(caseItem) {
    const message = counselingEmail();
    const { data, error } = await window.det607Supabase.functions.invoke('send-notification', {
      body: {
        recipientId: caseItem.cadet_id,
        subject: message.subject,
        html: message.html,
        eventType: 'COUNSELING_SIGNATURE_REQUEST',
        entityType: 'counseling_case',
        entityId: caseItem.id
      }
    });
    if (error) throw new Error(await notificationFailure(error, data));
    if (!data?.ok) throw new Error(data?.error || 'Email service did not confirm delivery.');
    const { error: sentAtError } = await window.det607Supabase
      .from('counseling_cases')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', caseItem.id);
    if (sentAtError) throw sentAtError;
  }

  async function loadAssignments() {
    const { data, error } = await window.det607Supabase
      .from('assignments')
      .select('id,cadet_id,position,detail_id,profiles!assignments_cadet_id_fkey(full_name),details!assignments_detail_id_fkey(detail_date,detail_type)')
      .is('removed_at', null)
      .order('assigned_at', { ascending: false });
    if (error) throw error;
    state.assignments = (data || []).map(item => ({ ...item, ...item.details }));
  }

  async function loadCases() {
    if (!state.profile || !window.det607Supabase) return;
    state.loading = true;
    renderCases();
    try {
      await loadAssignments();
      const { data, error } = await window.det607Supabase
        .from('counseling_cases')
        .select('id,assignment_id,cadet_id,initiated_by,status,facts,reason,incident_description,expected_standards,corrective_action,drafted_text,sent_at,cadet_explanation,cadet_dispute,acknowledged,signed_name,signed_at,supervisor_remarks,void_reason,created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      state.cases = data || [];
    } catch (error) {
      state.cases = [];
      $('#case-list').innerHTML = `<p class="muted">Counseling records could not load: ${escapeHtml(error.message)}</p>`;
    } finally {
      state.loading = false;
      renderCases();
    }
  }

  function renderCases() {
    const list = $('#case-list');
    if (!list || !state.profile) return;
    const count = $('#case-count');
    if (count) count.textContent = String(state.cases.length);
    const newCase = $('#new-case');
    if (newCase) newCase.hidden = !isStaff();
    if (state.loading) { list.innerHTML = '<p class="muted">Loading counseling records…</p>'; return; }
    if (!state.cases.length) { list.innerHTML = '<p class="muted">No counseling records are available for your account.</p>'; return; }
    list.innerHTML = state.cases.map(item => {
      const assignment = assignmentFor(item.assignment_id);
      const tags = [item.reason, item.cadet_dispute ? 'Disputed' : '', item.signed_at ? 'Cadet signed' : ''].filter(Boolean);
      return `<article class="case-card"><div class="date-pill">CASE<small>${escapeHtml(formatStatus(item.status))}</small></div><div class="card-main"><h3>${escapeHtml(cadetName(item))} · ${escapeHtml(assignmentLabel(assignment))}</h3><p>${escapeHtml(item.facts)}</p><div class="tags">${tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div></div><div class="card-actions"><button class="secondary" data-live-case="${item.id}">Open</button></div></article>`;
    }).join('');
    list.querySelectorAll('[data-live-case]').forEach(button => button.addEventListener('click', () => openCase(button.dataset.liveCase)));
  }

  function newCaseForm() {
    if (!isStaff()) return showToast('Only POCs, admins, and super admins can initiate counseling.');
    const options = state.assignments.map(assignment => `<option value="${assignment.id}">${escapeHtml(assignment.profiles?.full_name || 'Cadet')} — ${escapeHtml(assignmentLabel(assignment))}</option>`).join('');
    if (!options) return showToast('There are no active assignments available for counseling.');
    openModal(`<p class="eyebrow">COUNSELING</p><h2>Initiate counseling</h2><p>Choose an actual flag-detail assignment. Start with objective facts; the cadet will be able to review and sign after you send it.</p><div class="form-row"><label>Assigned cadet and detail</label><select id="counseling-assignment">${options}</select></div><div class="form-row"><label>Reason</label><input id="counseling-reason" placeholder="e.g., Attendance accountability"></div><div class="form-row"><label>Objective facts</label><textarea id="counseling-facts" placeholder="What happened, when, and any follow-up already taken."></textarea></div><div class="form-row"><label>Expected standard</label><textarea id="counseling-standard" placeholder="Expected reporting, attendance, or accountability standard."></textarea></div><div class="form-row"><label>Corrective action</label><textarea id="counseling-action" placeholder="Required corrective action or follow-up."></textarea></div><div class="modal-actions"><button class="secondary" id="save-counseling-draft">Save draft</button><button class="primary" id="send-counseling">Send to cadet</button></div>`);
    $('#save-counseling-draft').onclick = () => saveNewCase(false);
    $('#send-counseling').onclick = () => saveNewCase(true);
  }

  async function saveNewCase(send) {
    const assignment = assignmentFor($('#counseling-assignment').value);
    const facts = $('#counseling-facts').value.trim();
    if (!assignment || !facts) return showToast('Select an assignment and enter objective facts.');
    const payload = {
      assignment_id: assignment.id, cadet_id: assignment.cadet_id, initiated_by: state.profile.id,
      counselor_id: state.profile.id, facts, reason: $('#counseling-reason').value.trim() || null,
      expected_standards: $('#counseling-standard').value.trim() || null,
      corrective_action: $('#counseling-action').value.trim() || null,
      drafted_text: facts, status: send ? 'AWAITING_CADET_SIGNATURE' : 'DRAFT', sent_at: null
    };
    const { data: created, error } = await window.det607Supabase.from('counseling_cases').insert(payload).select().single();
    if (error) return showToast(error.message);
    let deliveryError = null;
    if (send) {
      try {
        await sendSignatureEmail(created);
      } catch (notificationError) {
        deliveryError = notificationError;
      }
    }
    closeModal();
    if (!send) showToast('Counseling draft saved.');
    else if (deliveryError) showToast(`Counseling saved, but email was not sent: ${deliveryError.message}. Open the case and use Resend email after checking the cadet email address.`);
    else showToast('Counseling email sent to the cadet for signature.');
    await loadCases();
  }

  function openCase(id) {
    const item = state.cases.find(caseItem => caseItem.id === id);
    if (!item) return;
    const assignment = assignmentFor(item.assignment_id);
    const isCadet = item.cadet_id === state.profile.id;
    const canSign = isCadet && item.status === 'AWAITING_CADET_SIGNATURE';
    const review = canReview() && ['SIGNED_AWAITING_REVIEW', 'DISPUTED_AWAITING_REVIEW'].includes(item.status);
    const canResend = isStaff() && item.status === 'AWAITING_CADET_SIGNATURE';
    const details = `<p class="eyebrow">${escapeHtml(formatStatus(item.status))}</p><h2>${escapeHtml(cadetName(item))}</h2><p><strong>Assignment:</strong> ${escapeHtml(assignmentLabel(assignment))}</p><p><strong>Reason:</strong> ${escapeHtml(item.reason || 'Not specified')}</p><p><strong>Facts:</strong><br>${escapeHtml(item.facts)}</p><p><strong>Expected standard:</strong><br>${escapeHtml(item.expected_standards || 'Not specified')}</p><p><strong>Corrective action:</strong><br>${escapeHtml(item.corrective_action || 'Not specified')}</p>`;
    if (canSign) {
      openModal(`${details}<div class="form-row"><label>Your explanation</label><textarea id="cadet-explanation" placeholder="Explain what happened and any relevant context."></textarea></div><div class="form-row"><label>Dispute (optional)</label><textarea id="cadet-dispute" placeholder="State any part of the record you dispute."></textarea></div><div class="form-row"><label><input id="cadet-acknowledge" type="checkbox"> I acknowledge I reviewed this counseling record.</label></div><div class="form-row"><label>Type your full name</label><input id="cadet-signed-name" placeholder="Your full name"></div><div class="modal-actions"><button class="primary" id="sign-counseling">Sign and submit</button></div>`);
      $('#sign-counseling').onclick = () => signCase(item.id);
    } else if (review) {
      openModal(`${details}<p><strong>Cadet explanation:</strong><br>${escapeHtml(item.cadet_explanation || 'None submitted')}</p><p><strong>Dispute:</strong><br>${escapeHtml(item.cadet_dispute || 'None')}</p><div class="form-row"><label>Supervisor remarks</label><textarea id="supervisor-remarks" placeholder="Outcome or follow-up."></textarea></div><div class="modal-actions"><button class="secondary" id="void-counseling">Void record</button><button class="primary" id="complete-counseling">Complete review</button></div>`);
      $('#complete-counseling').onclick = () => reviewCase(item.id, 'COMPLETED');
      $('#void-counseling').onclick = () => reviewCase(item.id, 'VOIDED');
    } else {
      openModal(`${details}${item.cadet_explanation ? `<p><strong>Cadet explanation:</strong><br>${escapeHtml(item.cadet_explanation)}</p>` : ''}<div class="modal-actions">${canResend ? '<button class="secondary" id="resend-counseling-email">Resend email</button>' : ''}<button class="secondary" onclick="document.querySelector('#modal').classList.remove('show')">Close</button></div>`);
      const resend = $('#resend-counseling-email');
      if (resend) resend.onclick = async () => {
        resend.disabled = true;
        resend.textContent = 'Sending…';
        try {
          await sendSignatureEmail(item);
          showToast('Counseling email sent to the cadet for signature.');
          closeModal();
          await loadCases();
        } catch (error) {
          resend.disabled = false;
          resend.textContent = 'Resend email';
          showToast(`Counseling email was not sent: ${error.message}`);
        }
      };
    }
  }

  async function signCase(id) {
    const explanation = $('#cadet-explanation').value.trim();
    const dispute = $('#cadet-dispute').value.trim();
    const typedName = $('#cadet-signed-name').value.trim();
    if (!$('#cadet-acknowledge').checked || !explanation || !typedName) return showToast('Explanation, acknowledgment, and typed name are required.');
    const { error } = await window.det607Supabase.rpc('sign_my_counseling', { case_id: id, explanation, dispute: dispute || null, typed_name: typedName });
    if (error) return showToast(error.message);
    closeModal(); showToast('Counseling acknowledgment submitted for supervisor review.'); await loadCases();
  }

  async function reviewCase(id, status) {
    const remarks = $('#supervisor-remarks').value.trim();
    const values = status === 'VOIDED' ? { status, void_reason: remarks || 'Voided by supervisor', reviewed_by: state.profile.id, closed_at: new Date().toISOString() } : { status, supervisor_remarks: remarks || null, reviewed_by: state.profile.id, closed_at: new Date().toISOString() };
    const { error } = await window.det607Supabase.from('counseling_cases').update(values).eq('id', id);
    if (error) return showToast(error.message);
    closeModal(); showToast(status === 'COMPLETED' ? 'Counseling review completed.' : 'Counseling record voided.'); await loadCases();
  }

  document.addEventListener('det607:profile', event => {
    state.profile = event.detail.profile;
    $('#new-case').onclick = newCaseForm;
    window.renderCases = renderCases;
    loadCases();
  });
})();
