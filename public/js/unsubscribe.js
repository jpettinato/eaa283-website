// Unsubscribe page — removes an email from the mailing list.
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('unsub-form');
  const msg = document.getElementById('unsub-msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('unsub-email').value.trim();
    if (!email) return;
    try {
      await api('/api/unsubscribe', { method: 'POST', body: { email } });
      msg.style.color = '#0E7C66';
      msg.textContent = "You've been removed from our mailing list.";
      form.reset();
    } catch (err) {
      msg.style.color = '#c0392b';
      msg.textContent = err.message;
    }
  });
});
