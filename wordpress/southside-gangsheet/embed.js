(function () {
  var cfg = window.ssgsEmbed || {};
  var minHeight = cfg.minHeight || 900;
  var builderOrigin = cfg.builderOrigin || '';
  var ajaxUrl = cfg.ajaxUrl || '';
  var nonce = cfg.nonce || '';

  function isBuilderOrigin(origin) {
    if (!builderOrigin) return true;
    try {
      return origin === builderOrigin || origin.indexOf(builderOrigin) === 0;
    } catch (e) {
      return false;
    }
  }

  function resizeFrames(event, height) {
    height = Math.max(minHeight, Math.ceil(height) + 24);
    var frames = document.querySelectorAll('iframe.ssgs-embed-frame');
    for (var i = 0; i < frames.length; i++) {
      var frame = frames[i];
      try {
        if (event.source && frame.contentWindow !== event.source) continue;
      } catch (e) {}
      frame.style.height = height + 'px';
    }
  }

  function reply(source, requestId, result) {
    if (!source) return;
    source.postMessage(
      Object.assign(
        {
          source: 'southside-gangsheet',
          type: 'add-to-cart-result',
          requestId: requestId,
        },
        result
      ),
      '*'
    );
  }

  /**
   * The builder iframe is rendered at full content height, so it has no scrollbar
   * of its own — scrolling has to happen on this page. The builder sends the
   * offset of the element it wants shown, measured from the top of its document.
   */
  function scrollToInFrame(event, data) {
    var top = Number(data.top);
    if (!isFinite(top) || top < 0) return;
    var frames = document.querySelectorAll('iframe.ssgs-embed-frame');
    for (var i = 0; i < frames.length; i++) {
      var frame = frames[i];
      try {
        if (event.source && frame.contentWindow !== event.source) continue;
      } catch (e) {}
      var frameTop = frame.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0);
      var target = Math.max(0, frameTop + top - 90);
      try {
        window.scrollTo({ top: target, behavior: 'smooth' });
      } catch (e) {
        window.scrollTo(0, target);
      }
      return;
    }
  }

  function addToCart(event, data) {
    if (!ajaxUrl || !nonce) {
      reply(event.source, data.requestId, {
        ok: false,
        error: 'Store cart bridge is not configured. Re-save the Gang Sheet Builder settings.',
      });
      return;
    }

    var payload = data.payload || {};
    if (!payload.fileUrl) {
      reply(event.source, data.requestId, {
        ok: false,
        error: 'Missing Google Drive file link for this sheet.',
      });
      return;
    }

    var body = new FormData();
    body.append('action', 'ssgs_add_to_cart');
    body.append('nonce', nonce);
    body.append('payload', JSON.stringify(payload));

    fetch(ajaxUrl, {
      method: 'POST',
      credentials: 'same-origin',
      body: body,
    })
      .then(function (res) {
        return res.json().then(function (json) {
          return { res: res, json: json };
        });
      })
      .then(function (_ref) {
        var json = _ref.json;
        if (json && json.success) {
          var cartUrl = json.data && json.data.cartUrl;
          reply(event.source, data.requestId, { ok: true, cartUrl: cartUrl });
          if (cartUrl) {
            window.location.href = cartUrl;
          }
          return;
        }
        var message =
          (json && json.data && json.data.message) ||
          (json && json.message) ||
          'Could not add this sheet to the cart.';
        reply(event.source, data.requestId, { ok: false, error: message });
      })
      .catch(function (err) {
        reply(event.source, data.requestId, {
          ok: false,
          error: (err && err.message) || 'Could not reach the store cart.',
        });
      });
  }

  function onMessage(event) {
    var data = event && event.data;
    if (!data || data.source !== 'southside-gangsheet') return;
    if (!isBuilderOrigin(event.origin)) return;

    if (data.type === 'resize') {
      var height = Number(data.height);
      if (!isFinite(height) || height < 1) return;
      resizeFrames(event, height);
      return;
    }

    if (data.type === 'scroll-to') {
      scrollToInFrame(event, data);
      return;
    }

    if (data.type === 'add-to-cart') {
      addToCart(event, data);
    }
  }

  window.addEventListener('message', onMessage);
})();
