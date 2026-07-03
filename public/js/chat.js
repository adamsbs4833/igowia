(function () {
  const root = document.getElementById('chat-root');
  root.innerHTML = `
    <div id="messages"></div>
    <form id="chat-form">
      <input id="chat-input" type="text" placeholder="Écris un message à Igow'Ia..." autocomplete="off" />
      <button type="submit">Envoyer</button>
    </form>
  `;

  const messagesEl = document.getElementById('messages');
  const formEl = document.getElementById('chat-form');
  const inputEl = document.getElementById('chat-input');

  const history = [];
  let requestInFlight = false;

  function addMessage(role, content) {
    const el = document.createElement('div');
    el.className = `msg ${role}`;
    el.textContent = content;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function setInputEnabled(enabled) {
    inputEl.disabled = !enabled;
    formEl.querySelector('button').disabled = !enabled;
  }

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (requestInFlight) return;

    const text = inputEl.value.trim();
    if (!text) return;

    addMessage('user', text);
    history.push({ role: 'user', content: text });
    inputEl.value = '';

    const typingEl = showTyping();
    requestInFlight = true;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history }),
      });
      const data = await res.json();
      typingEl.remove();

      if (data.error === 'maintenance') {
        addMessage('error', data.message);
        setInputEnabled(false);
        return;
      }

      if (data.error) {
        addMessage('error', data.message || "Une erreur est survenue.");
        return;
      }

      addMessage('bot', data.reply);
      history.push({ role: 'assistant', content: data.reply });
    } catch (err) {
      typingEl.remove();
      addMessage('error', "Impossible de contacter Igow'Ia. Vérifie ta connexion.");
    } finally {
      requestInFlight = false;
    }
  });
})();
