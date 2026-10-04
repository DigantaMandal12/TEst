/**
 * Campus Equipment Lending & Exchange - Client Application Logic
 * High-performance, lightweight, accessible DOM operations
 * Phase 6 Production Standard
 */

document.addEventListener('DOMContentLoaded', () => {
  initClientFiltering();
  initDateConstraints();
  initChatAssistant();
  initFormLoadingStates();
  initFlashAutoDismiss();
});

/**
 * Fast client-side equipment catalogue filtering
 */
function initClientFiltering() {
  const searchInput = document.getElementById('liveSearchInput');
  const cards = document.querySelectorAll('.equipment-card');
  const emptyState = document.getElementById('clientEmptyState');

  if (!searchInput || cards.length === 0) return;

  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    let visibleCount = 0;

    cards.forEach(card => {
      const title = card.getAttribute('data-title') || '';
      const category = card.getAttribute('data-category') || '';
      const specs = card.getAttribute('data-specs') || '';

      const matches = !term || 
        title.toLowerCase().includes(term) || 
        category.toLowerCase().includes(term) || 
        specs.toLowerCase().includes(term);

      if (matches) {
        card.style.display = 'flex';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    if (emptyState) {
      emptyState.style.display = visibleCount === 0 ? 'block' : 'none';
    }
  });
}

/**
 * Date selector restrictions (Sunday closure alert & min date today)
 */
function initDateConstraints() {
  const dateInput = document.getElementById('pickupDate');
  const dateWarning = document.getElementById('sundayWarning');

  if (!dateInput) return;

  const today = new Date().toISOString().split('T')[0];
  if (!dateInput.getAttribute('min')) {
    dateInput.setAttribute('min', today);
  }

  dateInput.addEventListener('change', () => {
    const selected = new Date(dateInput.value);
    // Sunday is day 0
    if (selected.getDay() === 0) {
      if (dateWarning) {
        dateWarning.style.display = 'block';
        dateWarning.setAttribute('role', 'alert');
      }
      dateInput.setCustomValidity('Campus pickup locations are closed on Sundays.');
    } else {
      if (dateWarning) {
        dateWarning.style.display = 'none';
      }
      dateInput.setCustomValidity('');
    }
  });
}

/**
 * AI Hardware Assistant asynchronous chat with animated typing indicator & retry
 */
function initChatAssistant() {
  const chatForm = document.getElementById('chatAssistantForm');
  const chatInput = document.getElementById('chatAssistantInput');
  const chatMessages = document.getElementById('chatMessagesContainer');

  if (!chatForm || !chatInput || !chatMessages) return;

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;

    // Append user message
    appendChatMessage('user', message);
    chatInput.value = '';

    // Animated typing placeholder
    const typingId = appendTypingIndicator();

    try {
      const response = await fetch('/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      const data = await response.json();
      removeElement(typingId);
      appendChatMessage('assistant', data.reply || 'Here to help with your campus equipment requests.');
    } catch (err) {
      removeElement(typingId);
      appendChatMessage('assistant', 'Hardware assistant is currently offline or unreachable. Please consult lab store hours directly.');
    }
  });

  function appendChatMessage(sender, text) {
    const div = document.createElement('div');
    div.className = `chat-message-bubble ${sender === 'user' ? 'user-msg' : 'bot-msg'}`;
    div.setAttribute('role', 'article');
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function appendTypingIndicator() {
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    id && (div.id = id);
    div.className = 'chat-message-bubble bot-msg';
    div.innerHTML = `
      <div class="typing-dots" aria-label="Assistant is thinking">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    `;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return id;
  }

  function removeElement(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }
}

/**
 * Prevents double-submission on forms and adds visual loading feedback
 */
function initFormLoadingStates() {
  const forms = document.querySelectorAll('form');
  forms.forEach(form => {
    form.addEventListener('submit', () => {
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn && !submitBtn.classList.contains('no-spin')) {
        // Only set loading if form is valid
        if (form.checkValidity && !form.checkValidity()) return;
        submitBtn.classList.add('loading');
        // Prevent accidental multiple submissions
        setTimeout(() => {
          submitBtn.setAttribute('disabled', 'true');
        }, 50);
      }
    });
  });
}

/**
 * Auto-dismiss flash notifications after 5 seconds
 */
function initFlashAutoDismiss() {
  const alerts = document.querySelectorAll('.alert-banner');
  alerts.forEach(alert => {
    setTimeout(() => {
      alert.style.transition = 'opacity 300ms ease, transform 300ms ease';
      alert.style.opacity = '0';
      alert.style.transform = 'translateY(-4px)';
      setTimeout(() => alert.remove(), 350);
    }, 5000);
  });
}
