(function () {
  var minHeight = (window.ssgsEmbed && window.ssgsEmbed.minHeight) || 900;

  function onMessage(event) {
    var data = event && event.data;
    if (!data || data.source !== 'southside-gangsheet' || data.type !== 'resize') return;
    var height = Number(data.height);
    if (!isFinite(height) || height < 1) return;
    height = Math.max(minHeight, Math.ceil(height) + 24);
    var frames = document.querySelectorAll('iframe.ssgs-embed-frame');
    for (var i = 0; i < frames.length; i++) {
      var frame = frames[i];
      try {
        if (event.source && frame.contentWindow !== event.source) continue;
      } catch (e) {
        // cross-origin compare can throw in some browsers; resize all embeds
      }
      frame.style.height = height + 'px';
    }
  }

  window.addEventListener('message', onMessage);
})();
