(function () {
  const root = document.getElementById('admin-root');

  function renderLogin(errorText) {
    root.innerHTML = `
      <div class="card">
        <label>Code admin
          <input id="admin-code" type="password" autocomplete="off" />
        </label>
        <button id="login-btn">Se connecter</button>
        <div id="admin-message" class="${errorText ? 'error' : ''}">${errorText || ''}</div>
      </div>
    `;
    document.getElementById('login-btn').addEventListener('click', async () => {
      const code = document.getElementById('admin-code').value;
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.ok) {
        loadDashboard();
      } else {
        renderLogin(data.message || 'Code incorrect.');
      }
    });
  }

  function renderUsageGraph(history) {
    const max = Math.max(1, ...history.map((h) => h.count));
    const bars = history
      .map((h) => {
        const heightPct = Math.round((h.count / max) * 100);
        const shortDate = h.date.slice(5);
        return `
          <div class="bar-col">
            <div class="bar" style="height:${Math.max(heightPct, 2)}%"></div>
            <div class="bar-label">${escapeHtml(shortDate)}</div>
          </div>
        `;
      })
      .join('');
    return `<div class="usage-graph">${bars}</div>`;
  }

  function renderBlockedList(rateLimited, loginBlocked) {
    const rateRows = rateLimited
      .map(
        (r) => `
        <div class="blocked-row" data-type="rate-limit" data-ip="${r.ip}">
          <span>${r.ip} (${r.count} messages)</span>
          <button type="button" class="unblock-btn">Débloquer</button>
        </div>
      `
      )
      .join('') || '<div class="blocked-row"><span>Aucun</span></div>';

    const loginRows = loginBlocked
      .map(
        (l) => `
        <div class="blocked-row" data-type="login" data-ip="${l.ip}">
          <span>${l.ip}</span>
          <button type="button" class="unblock-btn">Débloquer</button>
        </div>
      `
      )
      .join('') || '<div class="blocked-row"><span>Aucun</span></div>';

    return `
      <div class="section-title">Visiteurs limités (messages/heure)</div>
      <div class="blocked-list" id="rate-limited-list">${rateRows}</div>
      <div class="section-title">Connexions admin bloquées</div>
      <div class="blocked-list" id="login-blocked-list">${loginRows}</div>
    `;
  }

  function attachUnblockHandlers(container) {
    container.querySelectorAll('.unblock-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.blocked-row');
        const type = row.getAttribute('data-type');
        const ip = row.getAttribute('data-ip');
        await fetch('/api/admin/unblock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, ip }),
        });
        loadDashboard();
      });
    });
  }

  async function renderDashboard(status) {
    const [historyRes, blockedRes] = await Promise.all([
      fetch('/api/admin/usage-history').then((r) => r.json()),
      fetch('/api/admin/blocked').then((r) => r.json()),
    ]);

    root.innerHTML = `
      <div class="card">
        <div class="toggle-row">
          <span>Mode maintenance</span>
          <input id="maintenance-toggle" type="checkbox" ${status.maintenance ? 'checked' : ''} />
        </div>
        <label>Message de maintenance
          <textarea id="maintenance-message" rows="3">${escapeHtml(status.maintenanceMessage)}</textarea>
        </label>
        <label>Limite de messages / visiteur / heure
          <input id="rate-limit" type="number" min="1" value="${status.maxPerHour}" />
        </label>
        <div>Messages envoyés aujourd'hui : <strong>${status.dailyUsage}</strong> / 14 400</div>
        <div class="section-title">Historique 7 derniers jours (remis à zéro si le service redémarre)</div>
        ${renderUsageGraph(historyRes.history)}
        <label>Message d'accueil (visiteurs)
          <textarea id="welcome-message" rows="2">${escapeHtml(status.welcomeMessage)}</textarea>
        </label>
        <label>Note de ton / personnalité (ajoutée aux instructions d'Igow'Ia)
          <textarea id="personality-note" rows="2">${escapeHtml(status.personalityNote)}</textarea>
        </label>
        <button id="save-btn">Enregistrer</button>
        <button id="logout-btn">Se déconnecter</button>
        <div id="admin-message"></div>
        ${renderBlockedList(blockedRes.rateLimited, blockedRes.loginBlocked)}
      </div>
    `;

    document.getElementById('save-btn').addEventListener('click', async () => {
      const active = document.getElementById('maintenance-toggle').checked;
      const message = document.getElementById('maintenance-message').value;
      const maxPerHour = document.getElementById('rate-limit').value;
      const welcomeMessage = document.getElementById('welcome-message').value;
      const personalityNote = document.getElementById('personality-note').value;

      const [maintRes, rateRes, contentRes] = await Promise.all([
        fetch('/api/admin/maintenance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active, message }),
        }),
        fetch('/api/admin/rate-limit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ maxPerHour }),
        }),
        fetch('/api/admin/content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ welcomeMessage, personalityNote }),
        }),
      ]);

      const msgEl = document.getElementById('admin-message');
      if (maintRes.ok && rateRes.ok && contentRes.ok) {
        msgEl.textContent = 'Réglages enregistrés.';
        msgEl.className = 'success';
      } else {
        msgEl.textContent = "Erreur lors de l'enregistrement.";
        msgEl.className = 'error';
      }
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await fetch('/api/admin/logout', { method: 'POST' });
      renderLogin();
    });

    attachUnblockHandlers(document.getElementById('rate-limited-list').parentElement);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function loadDashboard() {
    const res = await fetch('/api/admin/status');
    if (res.status === 401) {
      renderLogin();
      return;
    }
    const status = await res.json();
    renderDashboard(status);
  }

  loadDashboard();
})();
