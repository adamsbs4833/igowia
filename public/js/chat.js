(function () {
  const root = document.getElementById('chat-root');
  root.innerHTML = `
    <div id="chat-header-row">
      <button id="clear-chat-btn" type="button">Effacer la conversation</button>
    </div>
    <div id="messages"></div>
    <form id="chat-form">
      <input id="chat-input" type="text" placeholder="Écris un message à Igow'Ia..." autocomplete="off" />
      <button type="submit">Envoyer</button>
    </form>
  `;

  const messagesEl = document.getElementById('messages');
  const formEl = document.getElementById('chat-form');
  const inputEl = document.getElementById('chat-input');
  const clearBtn = document.getElementById('clear-chat-btn');

  const SUGGESTIONS = [
    'Comment créer un bot Discord ?',
    'Comment configurer les rôles sur mon serveur Discord ?',
    "Explique-moi les intents de l'API Discord",
    'Donne-moi une astuce productivité au hasard',
  ];

  let history = [];
  let requestInFlight = false;
  let welcomeMessage = '';

  function renderWelcomeScreen() {
    messagesEl.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.id = 'welcome-screen';

    const p = document.createElement('p');
    p.textContent = welcomeMessage;
    wrapper.appendChild(p);

    const suggestionsEl = document.createElement('div');
    suggestionsEl.id = 'suggestions';
    SUGGESTIONS.forEach((text) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'suggestion-btn';
      btn.textContent = text;
      btn.addEventListener('click', () => {
        inputEl.value = text;
        formEl.requestSubmit();
      });
      suggestionsEl.appendChild(btn);
    });
    wrapper.appendChild(suggestionsEl);

    messagesEl.appendChild(wrapper);
  }

  function clearWelcomeScreenIfPresent() {
    const existing = document.getElementById('welcome-screen');
    if (existing) existing.remove();
  }

  function addUserMessage(content) {
    const el = document.createElement('div');
    el.className = 'msg user';
    el.textContent = content;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function addErrorMessage(content) {
    const el = document.createElement('div');
    el.className = 'msg error';
    el.textContent = content;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function addBotMessageShell() {
    const wrapper = document.createElement('div');
    wrapper.className = 'msg-wrapper bot';

    const bubble = document.createElement('div');
    bubble.className = 'msg bot';
    wrapper.appendChild(bubble);

    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return { wrapper, bubble };
  }

  function addCopyButton(wrapper, rawText) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'Copier';
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(rawText).then(() => {
        btn.textContent = 'Copié !';
        setTimeout(() => {
          btn.textContent = 'Copier';
        }, 1500);
      });
    });
    wrapper.appendChild(btn);
  }

  function typeWriterReveal(bubble, rawText, onDone) {
    let i = 0;
    const chunkSize = 3;
    function step() {
      i += chunkSize;
      bubble.textContent = rawText.slice(0, i);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      if (i < rawText.length) {
        setTimeout(step, 12);
      } else {
        onDone();
      }
    }
    step();
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
    formEl.querySelector('button[type="submit"]').disabled = !enabled;
  }

  function resetConversation() {
    history = [];
    renderWelcomeScreen();
  }

  clearBtn.addEventListener('click', resetConversation);

  fetch('/api/config')
    .then((res) => res.json())
    .then((data) => {
      welcomeMessage = data.welcomeMessage || '';
      renderWelcomeScreen();
    })
    .catch(() => {
      welcomeMessage = '';
      renderWelcomeScreen();
    });

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (requestInFlight) return;

    const text = inputEl.value.trim();
    if (!text) return;

    clearWelcomeScreenIfPresent();
    addUserMessage(text);
    if (window.igowiaSounds) window.igowiaSounds.playSend();
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
        addErrorMessage(data.message);
        setInputEnabled(false);
        return;
      }

      if (data.error) {
        addErrorMessage(data.message || 'Une erreur est survenue.');
        return;
      }

      if (window.igowiaSounds) window.igowiaSounds.playReceive();
      const { wrapper, bubble } = addBotMessageShell();
      typeWriterReveal(bubble, data.reply, () => {
        bubble.innerHTML = window.igowiaRenderMarkdown
          ? window.igowiaRenderMarkdown(data.reply)
          : bubble.textContent;
        addCopyButton(wrapper, data.reply);
      });
      history.push({ role: 'assistant', content: data.reply });
    } catch (err) {
      typingEl.remove();
      addErrorMessage("Impossible de contacter Igow'Ia. Vérifie ta connexion.");
    } finally {
      requestInFlight = false;
    }
  });
})();
