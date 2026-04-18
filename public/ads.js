(function () {
  const script = document.currentScript;
  const container = document.getElementById('ads') || script?.parentElement || document.body;
  const scriptOrigin = script ? new URL(script.src, window.location.href).origin : window.location.origin;
  const url = `${scriptOrigin}/api/v1/ads?limit=3`;

  if (!container) return;

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function createAdElement(ad) {
    const el = document.createElement('div');
    el.style.cursor = 'pointer';
    el.style.padding = '12px';
    el.style.margin = '8px 0';
    el.style.border = '1px solid #ddd';
    el.style.borderRadius = '8px';
    el.style.background = '#fff';

    el.innerHTML = `
      <strong style="display:block; margin-bottom:6px; font-size:1rem; color:#111;">${escapeHTML(ad.title)}</strong>
      <p style="margin:0; color:#555; font-size:0.95rem; line-height:1.4;">${escapeHTML(ad.description)}</p>
    `;

    el.addEventListener('click', function () {
      fetch(`${scriptOrigin}/api/v1/click`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          adId: ad.id,
          referrer: document.referrer
        })
      }).catch(function () {});

      window.open(ad.link, '_blank');
    });

    return el;
  }

  fetch(url, { mode: 'cors' })
    .then(function (res) {
      if (!res.ok) {
        throw new Error('Network response was not ok');
      }
      return res.json();
    })
    .then(function (ads) {
      if (!Array.isArray(ads)) return;
      ads.forEach(function (ad) {
        container.appendChild(createAdElement(ad));
      });
    })
    .catch(function (error) {
      console.error('ads.js failed to load ads:', error);
    });
})();
