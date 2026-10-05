// Live coverage workflow. Requests are filtered by the database, so GMC and
// POC queues never expose each other's openings and same-day conflicts cannot
// be accepted even if two people click at once.
(() => {
  const state = { profile: null, requests: [], swaps: [] };
  const byId = id => document.querySelector(id);
  const isAdmin = () => ['ADMIN', 'SUPER_ADMIN'].includes(state.profile?.admin_level);
  const isSuperAdmin = () => state.profile?.admin_level === 'SUPER_ADMIN';
  const text = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const dateLabel = value => new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
  const kind = value => value === 'REVEILLE' ? 'Reveille' : 'Retreat';
  const time = value => String(value || '').slice(0, 5);
  const refreshSession = async () => {
    const { data: { session } } = await window.det607Supabase.auth.getSession();
    if (session && typeof applySession === 'function') await applySession(session);
  };

  function requestCard(request, action) {
    const accepted = request.accepted_by_name ? `<p class="muted"><strong>Coverage:</strong> ${text(request.accepted_by_name)}${request.status === 'APPROVED' ? ' (assigned by an administrator)' : ''}</p>` : '';
    return `<article class="request-card coverage-request-card"><div class="date-pill">${text(kind(request.detail_type))}<small>${text(request.status.replace('_', ' '))}</small></div><div class="card-main"><h3>${text(request.requester_name)} · ${text(dateLabel(request.detail_date))}</h3><p>${text(kind(request.detail_type))} · Report ${text(time(request.report_time))} · Ceremony ${text(time(request.ceremony_time))}</p><p>“${text(request.reason)}”</p>${accepted}</div><div class="card-actions">${action || ''}</div></article>`;
  }

  function renderCoverageRequests() {
    const host = byId('#request-list');
    if (!host) return;
    const currentId = state.profile?.id;
    const mine = state.requests.filter(item => item.requester_id === currentId);
    // Administrators review the complete request picture; their personal
    // cadet classification must never hide GMC or POC requests. Only regular
    // cadets see the narrowed, self-acceptable queue.
    const available = isAdmin()
      ? state.requests.filter(item => item.requester_id !== currentId && item.status === 'OPEN')
      : state.requests.filter(item => item.requester_id !== currentId && item.status === 'OPEN' && item.can_accept);
    const adminQueue = isSuperAdmin() ? state.requests.filter(item => item.status === 'OPEN') : [];
    const section = (title, content, empty) => `<section class="coverage-section"><h3>${title}</h3>${content || `<p class="muted">${empty}</p>`}</section>`;
    const mineHtml = mine.map(item => requestCard(item, item.status === 'OPEN' ? `<button class="secondary" data-coverage-cancel="${item.id}">Cancel request</button>` : '')).join('');
    const availableHtml = available.map(item => requestCard(item, item.can_accept ? `<button class="primary" data-coverage-accept="${item.id}">Accept coverage</button>` : '<span class="tag">Review only</span>')).join('');
    const adminHtml = adminQueue.map(item => requestCard(item, `<button class="secondary" data-coverage-admin="${item.id}">Assign coverage</button>`)).join('');
    const mySwaps = state.swaps.filter(item => item.requester_id === currentId);
    const swapOffers = isAdmin()
      ? state.swaps.filter(item => item.requester_id !== currentId && item.status === 'OPEN')
      : state.swaps.filter(item => item.requester_id !== currentId && item.can_accept);
    const swapCard = (item, action) => `<article class="request-card coverage-request-card"><div class="date-pill">SWAP<small>${text(item.status.replace('_', ' '))}</small></div><div class="card-main"><h3>${text(item.requester_name)} · ${text(dateLabel(item.detail_date))}</h3><p>Offering ${text(kind(item.detail_type))} · ${text(dateLabel(item.detail_date))}. Select one of your own ${text(item.requester_type)} shifts to exchange.</p><p>“${text(item.reason)}”</p></div><div class="card-actions">${action || ''}</div></article>`;
    const mySwapHtml = mySwaps.map(item => swapCard(item, item.status === 'OPEN' ? `<button class="secondary" data-swap-cancel="${item.id}">Cancel swap</button>` : '')).join('');
    const swapOfferHtml = swapOffers.map(item => swapCard(item, item.can_accept ? `<button class="primary" data-swap-accept="${item.id}">Offer a swap</button>` : '<span class="tag">Review only</span>')).join('');
    const coverageHeading = isAdmin() ? 'All open coverage requests' : `Available ${state.profile?.cadet_type || 'cadet'} coverage`;
    const swapHeading = isAdmin() ? 'All open swap requests' : `Available ${state.profile?.cadet_type || 'cadet'} swaps`;
    host.innerHTML = section('My coverage requests', mineHtml, 'You have no coverage requests.') + section(coverageHeading, availableHtml, 'No open coverage requests.') + section('My swap requests', mySwapHtml, 'You have no open swap requests.') + section(swapHeading, swapOfferHtml, 'No open swap requests.') + (isSuperAdmin() ? section('Super Admin placement queue', adminHtml, 'No coverage requests need placement.') : '');
    host.querySelectorAll('[data-coverage-cancel]').forEach(button => button.onclick = () => cancelRequest(button.dataset.coverageCancel));
    host.querySelectorAll('[data-coverage-accept]').forEach(button => button.onclick = () => confirmAccept(button.dataset.coverageAccept));
    host.querySelectorAll('[data-coverage-admin]').forEach(button => button.onclick = () => openAdminAssignment(button.dataset.coverageAdmin));
    host.querySelectorAll('[data-swap-cancel]').forEach(button => button.onclick = () => cancelSwap(button.dataset.swapCancel));
    host.querySelectorAll('[data-swap-accept]').forEach(button => button.onclick = () => openSwapOffer(button.dataset.swapAccept));
  }

  async function loadCoverageRequests(profile = window.det607CurrentProfile) {
    if (!profile || !window.det607Supabase) return;
    state.profile = profile;
    const [coverageResult, swapResult] = await Promise.all([window.det607Supabase.rpc('get_coverage_requests'), window.det607Supabase.rpc('get_swap_requests')]);
    if (coverageResult.error || swapResult.error) { console.error('Requests could not load:', coverageResult.error?.message || swapResult.error?.message); return; }
    state.requests = coverageResult.data || [];
    state.swaps = swapResult.data || [];
    window.det607CoverageRequests = state.requests;
    const badge = byId('#request-count');
    if (badge) badge.textContent = String((isAdmin() ? state.requests.filter(item => item.status === 'OPEN').length : state.requests.filter(item => item.can_accept).length) + state.swaps.filter(item => item.can_accept).length);
    renderCoverageRequests();
  }

  async function openNewRequest() {
    const { data: assignments, error } = await window.det607Supabase.rpc('get_my_coverage_eligible_assignments');
    if (error) return toast(error.message);
    if (!assignments?.length) return toast('You have no current or future assignment that is eligible for a coverage request.');
    const options = assignments.map(item => `<option value="${item.assignment_id}">${text(dateLabel(item.detail_date))} — ${text(kind(item.detail_type))} (${text(time(item.ceremony_time))})</option>`).join('');
    modal(`<p class="eyebrow">COVERAGE REQUEST</p><h2>Request coverage</h2><p class="muted">Only active ${text(state.profile.cadet_type)} cadets without another assignment on that day can accept. Your position remains yours until coverage is accepted or placed by an administrator.</p><div class="form-row"><label>Your assigned flag detail</label><select id="coverage-assignment">${options}</select></div><div class="form-row"><label>Reason</label><textarea id="coverage-reason" rows="4" maxlength="500" placeholder="Briefly explain why coverage is needed." required></textarea></div><div class="modal-actions"><button class="secondary" onclick="close()">Cancel</button><button class="primary" id="save-coverage-request">Post request</button></div>`);
    byId('#save-coverage-request').onclick = async () => {
      const button = byId('#save-coverage-request');
      const reason = byId('#coverage-reason').value.trim();
      if (!reason) return toast('Enter a brief coverage reason.');
      button.disabled = true; button.textContent = 'Posting…';
      const { error: createError } = await window.det607Supabase.rpc('create_coverage_request', { target_assignment_id: byId('#coverage-assignment').value, request_reason: reason });
      if (createError) { button.disabled = false; button.textContent = 'Post request'; return toast(createError.message); }
      close(); await loadCoverageRequests(); toast('Coverage request posted for eligible cadets.');
    };
  }

  async function openSwapRequest() {
    const { data: assignments, error } = await window.det607Supabase.rpc('get_my_swap_eligible_assignments');
    if (error) return toast(error.message);
    if (!assignments?.length) return toast('You have no current or future assignment that is eligible for a swap request.');
    const options = assignments.map(item => `<option value="${item.assignment_id}">${text(dateLabel(item.detail_date))} — ${text(kind(item.detail_type))} (${text(time(item.ceremony_time))})</option>`).join('');
    modal(`<p class="eyebrow">SHIFT SWAP</p><h2>Offer a shift swap</h2><p class="muted">Only active ${text(state.profile.cadet_type)} cadets can see this request. A volunteer must offer one of their own eligible shifts; both assignments exchange at the same time.</p><div class="form-row"><label>Your shift to offer</label><select id="swap-assignment">${options}</select></div><div class="form-row"><label>Reason</label><textarea id="swap-reason" rows="4" maxlength="500" placeholder="Briefly explain why you want to swap." required></textarea></div><div class="modal-actions"><button class="secondary" onclick="close()">Cancel</button><button class="primary" id="save-swap-request">Post swap</button></div>`);
    byId('#save-swap-request').onclick = async () => { const reason = byId('#swap-reason').value.trim(); if (!reason) return toast('Enter a brief swap reason.'); const button = byId('#save-swap-request'); button.disabled=true; button.textContent='Posting…'; const { error: createError } = await window.det607Supabase.rpc('create_swap_request',{target_assignment_id:byId('#swap-assignment').value,request_reason:reason}); if (createError) { button.disabled=false;button.textContent='Post swap';return toast(createError.message); } close(); await loadCoverageRequests(); toast('Swap request posted for eligible cadets.'); };
  }

  async function openSwapOffer(id) { const { data: assignments, error } = await window.det607Supabase.rpc('get_my_swap_offer_assignments',{target_request_id:id}); if(error)return toast(error.message); if(!assignments?.length)return toast('You have no eligible shift available to exchange.'); const options=assignments.map(item=>`<option value="${item.assignment_id}">${text(dateLabel(item.detail_date))} — ${text(kind(item.detail_type))}</option>`).join(''); modal(`<p class="eyebrow">CONFIRM SHIFT SWAP</p><h2>Offer your shift</h2><p>Select the assignment you will exchange. Both rosters update only after confirmation.</p><div class="form-row"><label>Your shift</label><select id="swap-offer-assignment">${options}</select></div><div class="modal-actions"><button class="secondary" onclick="close()">Cancel</button><button class="primary" id="confirm-swap">Confirm swap</button></div>`);byId('#confirm-swap').onclick=async()=>{const button=byId('#confirm-swap');button.disabled=true;button.textContent='Swapping…';const {error:swapError}=await window.det607Supabase.rpc('accept_swap_request',{target_request_id:id,offered_assignment_id:byId('#swap-offer-assignment').value});if(swapError){button.disabled=false;button.textContent='Confirm swap';return toast(swapError.message);}close();await refreshSession();toast('Swap confirmed. Both rosters are updated.');}; }
  async function cancelSwap(id) { const { error } = await window.det607Supabase.rpc('cancel_swap_request',{target_request_id:id}); if(error)return toast(error.message);await loadCoverageRequests();toast('Swap request cancelled.'); }

  async function cancelRequest(id) {
    const { error } = await window.det607Supabase.rpc('cancel_coverage_request', { target_request_id: id });
    if (error) return toast(error.message);
    await loadCoverageRequests(); toast('Coverage request cancelled.');
  }

  function confirmAccept(id) {
    const request = state.requests.find(item => item.id === id);
    if (!request) return;
    modal(`<p class="eyebrow">CONFIRM COVERAGE</p><h2>${text(kind(request.detail_type))} · ${text(dateLabel(request.detail_date))}</h2><p>You will take ${text(request.requester_name)}’s assignment. You cannot accept if you already have any flag detail on this day.</p><div class="modal-actions"><button class="secondary" onclick="close()">Cancel</button><button class="primary" id="confirm-coverage-accept">Accept coverage</button></div>`);
    byId('#confirm-coverage-accept').onclick = async () => {
      const button = byId('#confirm-coverage-accept'); button.disabled = true; button.textContent = 'Accepting…';
      const { error } = await window.det607Supabase.rpc('accept_coverage_request', { target_request_id: id });
      if (error) { button.disabled = false; button.textContent = 'Accept coverage'; return toast(error.message); }
      close(); await refreshSession(); toast('Coverage accepted. The roster is updated.');
    };
  }

  async function openAdminAssignment(id) {
    const request = state.requests.find(item => item.id === id);
    if (!request) return;
    const { data: candidates, error } = await window.det607Supabase.rpc('get_coverage_assignment_candidates', { target_request_id: id });
    if (error) return toast(error.message);
    if (!candidates?.length) return toast('No eligible cadet is available for this coverage request.');
    const options = candidates.map(item => `<option value="${item.id}">${text(item.full_name)} (${item.monthly_shift_count} shift${Number(item.monthly_shift_count) === 1 ? '' : 's'} this month)</option>`).join('');
    modal(`<p class="eyebrow">ADMIN COVERAGE PLACEMENT</p><h2>Assign coverage</h2><p>${text(request.requester_name)} needs a ${text(request.requester_type)} for ${text(kind(request.detail_type))} on ${text(dateLabel(request.detail_date))}. Cadets already scheduled that day are excluded.</p><div class="form-row"><label>Eligible cadet</label><select id="coverage-admin-cadet">${options}</select></div><div class="form-row"><label>Administrator note <span class="muted">(optional)</span></label><textarea id="coverage-admin-note" rows="3" maxlength="500" placeholder="Optional placement note."></textarea></div><div class="modal-actions"><button class="secondary" onclick="close()">Cancel</button><button class="primary" id="save-coverage-admin">Assign coverage</button></div>`);
    byId('#save-coverage-admin').onclick = async () => {
      const button = byId('#save-coverage-admin'); button.disabled = true; button.textContent = 'Assigning…';
      const { error: assignError } = await window.det607Supabase.rpc('admin_assign_coverage_request', { target_request_id: id, target_cadet_id: byId('#coverage-admin-cadet').value, new_admin_note: byId('#coverage-admin-note').value.trim() || null });
      if (assignError) { button.disabled = false; button.textContent = 'Assign coverage'; return toast(assignError.message); }
      close(); await refreshSession(); toast('Coverage assigned and the roster is updated.');
    };
  }

  window.loadCoverageRequests = loadCoverageRequests;
  window.openCoverageRequest = openNewRequest;
  document.addEventListener('det607:profile', event => loadCoverageRequests(event.detail.profile));
  byId('#new-coverage-request')?.addEventListener('click', () => modal(`<p class="eyebrow">REQUEST TYPE</p><h2>Coverage or swap?</h2><p class="muted">Coverage gives your shift to another eligible cadet. A swap exchanges your shift with another eligible cadet’s shift.</p><div class="modal-actions"><button class="secondary" id="choose-coverage">Request coverage</button><button class="primary" id="choose-swap">Offer a swap</button></div>`), { once:false });
  byId('#new-coverage-request')?.addEventListener('click', () => { byId('#choose-coverage').onclick=openNewRequest; byId('#choose-swap').onclick=openSwapRequest; });
  if (window.det607CurrentProfile) loadCoverageRequests(window.det607CurrentProfile);
})();
