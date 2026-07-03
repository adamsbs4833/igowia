(function () {
  const root = document.getElementById('admin-root');

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

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

  function renderDashboard(status) {
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
        <div style="font-size: 0.8rem; color: var(--text-dim);">
          Ce compteur et les limites repartent à zéro si le service redémarre (ex: réveil après
          une pause sur le plan gratuit).
        </div>
        <button id="save-btn">Enregistrer</button>
        <button id="logout-btn">Se déconnecter</button>
        <div id="admin-message"></div>
      </div>
    `;

    document.getElementById('save-btn').addEventListener('click', async () => {
      const active = document.getElementById('maintenance-toggle').checked;
      const message = document.getElementById('maintenance-message').value;
      const maxPerHour = document.getElementById('rate-limit').value;

      const [maintRes, rateRes] = await Promise.all([
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
      ]);

      const msgEl = document.getElementById('admin-message');
      if (maintRes.ok && rateRes.ok) {
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
