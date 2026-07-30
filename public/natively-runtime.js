
(function() {
  if (window.__NATIVELY_BRIDGE_ACTIVE__) return;
  window.__NATIVELY_BRIDGE_ACTIVE__ = true;
  console.log(" IDE bridge script injected");
  parent.postMessage({ type: 'iframe:bridge-ready' }, '*');

  function sendUpdate() {
    console.log(' iframe sending', location.href);
    parent.postMessage(
      { type: 'iframe:navigation', url: location.href },
      '*'
    );
  }

  const _push = history.pushState;
  history.pushState = function() {
    _push.apply(this, arguments);
    console.log(' iframe pushState');
    sendUpdate();
  };

  const _replace = history.replaceState;
  history.replaceState = function() {
    _replace.apply(this, arguments);
    console.log(' iframe replaceState');
    sendUpdate();
  };

  window.addEventListener('popstate', sendUpdate);
  window.addEventListener('hashchange', sendUpdate);
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'host:navigateTo' && e.data?.url) {
      console.log('➡ navigating to', e.data.url);
      window.location.href = e.data.url;
    }
  });

  let ignoreError = false;

   // Capture all console errors and send them to parent
  const originalConsoleError = console.error;
  console.error = function(...args) {
    originalConsoleError.apply(console, args);
    if (ignoreError) return;
    parent.postMessage({
      type: 'iframe:console-error',
      message: args.map(arg => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.message + '\n' + arg.stack;
        try { return JSON.stringify(arg); } catch { return String(arg); }
      }).join(' ')
    }, '*');
  };

  // Capture uncaught errors
  window.addEventListener('error', (e) => {
    if (ignoreError) return;
    parent.postMessage({
      type: 'iframe:runtime-error',
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      stack: e.error?.stack
    }, '*');
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (e) => {
    if (ignoreError) return;
    parent.postMessage({
      type: 'iframe:unhandled-rejection',
      message: e.reason?.message || String(e.reason),
      stack: e.reason?.stack
    }, '*');
  });

  // Capture thumbnail after content is ready.
  // Initial load uses 1500ms (already waits for window.load).
  // Re-captures from parent use 3000ms — complex apps need more time to hydrate.
function captureThumbnail(bufferMs = 1500) {
  const doCapture = async () => {
    try {
      ignoreError = true; // Temporarily ignore errors during capture
      const { toBlob } = await import('https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm');

      const width = window.innerWidth || document.documentElement.clientWidth;
      const height = window.innerHeight || document.documentElement.clientHeight;
      const blob = await toBlob(document.documentElement, {
        width: width,
        height: height,
        // Handles the (failed) and 404 images from network log
        imagePlaceholder: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        cacheBust: true,
      });

      if (blob && blob.size < 5 * 1024 * 1024) { // Adhere to 5MB limit
        parent.postMessage({ type: 'iframe:preview-thumbnail', blob }, '*');
      }
    } catch (err) {
      // Log to console for debugging purposes only
      if (typeof err === 'object' && err !== null) {
        console.warn('[Screenshot] Thumbnail capture failed (non-critical):', err.message || String(err));
      }
    } finally {
      ignoreError = false; // Re-enable error reporting after capture
    }
  };

  if (document.readyState === 'complete') {
    setTimeout(doCapture, bufferMs);
  } else {
    window.addEventListener('load', () => setTimeout(doCapture, bufferMs), { once: true });
  }
}
  // Trigger thumbnail capture
  captureThumbnail();

  // Allow parent to request a re-capture.
  // Uses a longer buffer since content may still be hydrating after the iframe reloads.
  window.addEventListener('message', (e) => {
    if (e.source !== parent) return;
    if (e.data?.type === 'request-thumbnail') {
      captureThumbnail(3000);
    }
  });

  // Forward user activity from inside the iframe to the parent so the
  // parent's inactivity timer doesn't fire while the preview is in use.
  // Throttled to one ping per minute to avoid flooding.
  // Keep this event list in sync with ACTIVITY_EVENTS in sandbox-runtime.client.ts.
  let __lastActivityPing = 0;
  ['mousemove', 'click', 'keydown', 'scroll', 'touchstart'].forEach((evt) => {
    document.addEventListener(evt, () => {
      const now = Date.now();
      if (now - __lastActivityPing > 60000) {
        __lastActivityPing = now;
        parent.postMessage({ type: 'iframe:activity' }, '*');
      }
    }, { passive: true });
  });

  // ── Visual Editor: Element Selector ──
  (function initElementSelector() {
    let selectorEnabled = false;
    let selectedEl = null;
    let currentInfo = null;

    // Hover overlay (indigo, follows mouse)
    const hoverOverlay = document.createElement('div');
    hoverOverlay.id = '__ve_hover';
    hoverOverlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #6366f1;border-radius:4px;background:rgba(99,102,241,0.08);display:none;transition:top 0.05s,left 0.05s,width 0.05s,height 0.05s;';
    const hoverLabel = document.createElement('div');
    hoverLabel.style.cssText = 'position:absolute;top:-22px;left:-2px;background:#6366f1;color:#fff;font:600 11px/1 system-ui,sans-serif;padding:2px 6px;border-radius:3px 3px 0 0;white-space:nowrap;';
    hoverOverlay.appendChild(hoverLabel);
    document.documentElement.appendChild(hoverOverlay);

    // Selection overlay (blue dashed, stays on selected element)
    const selectOverlay = document.createElement('div');
    selectOverlay.id = '__ve_select';
    selectOverlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px dashed #3b82f6;border-radius:4px;background:rgba(59,130,246,0.06);display:none;';
    const selectLabel = document.createElement('div');
    selectLabel.style.cssText = 'position:absolute;top:-22px;left:-2px;background:#3b82f6;color:#fff;font:600 11px/1 system-ui,sans-serif;padding:3px 8px;border-radius:4px 4px 0 0;white-space:nowrap;';
    selectOverlay.appendChild(selectLabel);
    document.documentElement.appendChild(selectOverlay);

    // Inline chat bar (appears below selected element)
    const chatBar = document.createElement('div');
    chatBar.id = '__ve_chatbar';
    chatBar.style.cssText = 'position:fixed;z-index:2147483647;display:none;';
    chatBar.innerHTML = '<div style="display:flex;align-items:center;gap:6px;background:#302f3a;border:1px solid #3d3d3d;border-radius:10px;padding:6px 8px 6px 12px;box-shadow:0 4px 20px rgba(0,0,0,0.4);min-width:260px;max-width:400px;">'
      + '<button id="__ve_instant" style="flex-shrink:0;width:24px;height:24px;border-radius:6px;background:transparent;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;" title="Add to prompt (click for instant mode)">'
      + '<svg id="__ve_bolt" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'
      + '</button>'
      + '<input id="__ve_input" type="text" placeholder="Ask agent..." style="flex:1;background:transparent;border:none;outline:none;color:#dde1e8;font:13px/1.4 system-ui,sans-serif;min-width:0;" />'
      + '<button id="__ve_send" style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:#ffffff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;" title="Send">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>'
      + '</button>'
      + '</div>';
    document.documentElement.appendChild(chatBar);

    const chatInput = chatBar.querySelector('#__ve_input');
    const chatSend = chatBar.querySelector('#__ve_send');
    const instantBtn = chatBar.querySelector('#__ve_instant');
    var instantMode = false;
    var boltSvg = chatBar.querySelector('#__ve_bolt');
    instantBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      instantMode = !instantMode;
      boltSvg.setAttribute('stroke', instantMode ? '#facc15' : '#6b7280');
      boltSvg.setAttribute('fill', instantMode ? '#facc15' : 'none');
      instantBtn.title = instantMode ? 'Instant mode (click to add to prompt)' : 'Add to prompt (click for instant mode)';
    });

    function getFiberFromElement(el) {
      const key = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
      return key ? el[key] : null;
    }

    function findOwnerComponent(fiber) {
      let current = fiber;
      while (current) {
        if (current.tag === 0 || current.tag === 1 || current.tag === 11) {
          const name = current.type?.displayName || current.type?.name;
          if (name && name[0] === name[0].toUpperCase()) {
            return current;
          }
        }
        current = current.return;
      }
      return null;
    }

    function getComponentInfo(el) {
      const fiber = getFiberFromElement(el);
      if (!fiber) return { componentName: null, filePath: null, lineNumber: null };
      const owner = findOwnerComponent(fiber);
      if (!owner) return { componentName: null, filePath: null, lineNumber: null };
      const name = owner.type?.displayName || owner.type?.name || null;
      const source = owner._debugSource;
      return {
        componentName: name,
        filePath: source?.fileName || null,
        lineNumber: source?.lineNumber || null,
      };
    }

    function getTextPreview(el) {
      const text = (el.textContent || '').trim();
      return text.length > 60 ? text.slice(0, 60) + '...' : text;
    }

    // Convert any CSS color (oklch, hsl, rgb, etc.) to #hex using canvas
    var _colorCtx = document.createElement('canvas').getContext('2d');
    function resolveColor(val) {
      if (!val || val === 'transparent' || val === 'rgba(0, 0, 0, 0)') return val;
      _colorCtx.fillStyle = '#000000';
      _colorCtx.fillStyle = val;
      return _colorCtx.fillStyle;
    }

    function getTagLabel(el, info) {
      return info.componentName || el.tagName.toLowerCase();
    }

    function positionChatBar(rect) {
      const barWidth = 320;
      let left = rect.left;
      let top = rect.bottom + 6;
      if (left + barWidth > window.innerWidth) left = window.innerWidth - barWidth - 8;
      if (left < 8) left = 8;
      if (top + 50 > window.innerHeight) top = rect.top - 50;
      chatBar.style.left = left + 'px';
      chatBar.style.top = top + 'px';
      chatBar.style.width = barWidth + 'px';
    }

    var originalCssText = '';
    var originalTextContent = '';

    function selectElement(el) {
      selectedEl = el;
      currentInfo = getComponentInfo(el);
      originalCssText = el.style.cssText;
      originalTextContent = el.textContent || '';
      const rect = el.getBoundingClientRect();

      selectOverlay.style.top = rect.top + 'px';
      selectOverlay.style.left = rect.left + 'px';
      selectOverlay.style.width = rect.width + 'px';
      selectOverlay.style.height = rect.height + 'px';
      selectOverlay.style.display = 'block';
      selectLabel.textContent = getTagLabel(el, currentInfo);

      positionChatBar(rect);
      chatBar.style.display = 'block';
      chatInput.value = '';
      chatInput.focus();

      hoverOverlay.style.display = 'none';

      var cs = window.getComputedStyle(el);
      var styles = {
        fontSize: cs.fontSize,
        fontFamily: cs.fontFamily,
        fontStyle: cs.fontStyle,
        fontWeight: cs.fontWeight,
        textAlign: cs.textAlign,
        color: resolveColor(cs.color),
        backgroundColor: resolveColor(cs.backgroundColor),
        marginTop: cs.marginTop,
        marginRight: cs.marginRight,
        marginBottom: cs.marginBottom,
        marginLeft: cs.marginLeft,
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        borderWidth: cs.borderTopWidth,
        borderColor: resolveColor(cs.borderTopColor),
        borderStyle: cs.borderTopStyle,
        borderRadius: cs.borderRadius,
        boxShadow: cs.boxShadow,
        opacity: cs.opacity,
      };

      var href = el.tagName === 'A' ? el.getAttribute('href') : null;

      parent.postMessage({
        type: 'iframe:element-selected',
        componentName: currentInfo.componentName,
        filePath: currentInfo.filePath,
        lineNumber: currentInfo.lineNumber,
        tagName: el.tagName.toLowerCase(),
        textContent: getTextPreview(el),
        href: href,
        styles: styles,
      }, '*');
    }

    function clearSelection() {
      selectedEl = null;
      currentInfo = null;
      selectOverlay.style.display = 'none';
      chatBar.style.display = 'none';
      chatInput.value = '';
    }

    function submitInlineChat() {
      const text = chatInput.value.trim();
      if (!text || !currentInfo) return;
      var cs = selectedEl ? window.getComputedStyle(selectedEl) : null;
      parent.postMessage({
        type: 'iframe:inline-chat-submit',
        instant: instantMode,
        text: text,
        componentName: currentInfo.componentName,
        filePath: currentInfo.filePath,
        lineNumber: currentInfo.lineNumber,
        tagName: selectedEl ? selectedEl.tagName.toLowerCase() : null,
        textContent: selectedEl ? getTextPreview(selectedEl) : null,
        href: selectedEl && selectedEl.tagName === 'A' ? selectedEl.getAttribute('href') : null,
        styles: cs ? {
          fontSize: cs.fontSize,
          fontFamily: cs.fontFamily,
          fontStyle: cs.fontStyle,
          fontWeight: cs.fontWeight,
          textAlign: cs.textAlign,
          color: resolveColor(cs.color),
          backgroundColor: resolveColor(cs.backgroundColor),
          marginTop: cs.marginTop,
          marginRight: cs.marginRight,
          marginBottom: cs.marginBottom,
          marginLeft: cs.marginLeft,
          paddingTop: cs.paddingTop,
          paddingRight: cs.paddingRight,
          paddingBottom: cs.paddingBottom,
          paddingLeft: cs.paddingLeft,
          borderWidth: cs.borderTopWidth,
          borderColor: resolveColor(cs.borderTopColor),
          borderStyle: cs.borderTopStyle,
          borderRadius: cs.borderRadius,
          boxShadow: cs.boxShadow,
          opacity: cs.opacity,
        } : null,
      }, '*');
      chatInput.value = '';
      clearSelection();
    }

    chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitInlineChat();
      }
      if (e.key === 'Escape') {
        clearSelection();
      }
    });
    chatSend.addEventListener('click', (e) => {
      e.stopPropagation();
      submitInlineChat();
    });
    chatBar.addEventListener('click', (e) => { e.stopPropagation(); });
    chatBar.addEventListener('mousedown', (e) => { e.stopPropagation(); });

    let lastHovered = null;

    function onMouseMove(e) {
      if (!selectorEnabled) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === hoverOverlay || hoverOverlay.contains(el) || el === selectOverlay || selectOverlay.contains(el) || el === chatBar || chatBar.contains(el)) return;
      if (selectedEl && el === selectedEl) return;
      if (el === lastHovered) return;
      lastHovered = el;
      const rect = el.getBoundingClientRect();
      hoverOverlay.style.top = rect.top + 'px';
      hoverOverlay.style.left = rect.left + 'px';
      hoverOverlay.style.width = rect.width + 'px';
      hoverOverlay.style.height = rect.height + 'px';
      hoverOverlay.style.display = selectedEl ? 'none' : 'block';
      const info = getComponentInfo(el);
      hoverLabel.textContent = getTagLabel(el, info);
    }

    function onClick(e) {
      if (!selectorEnabled) return;
      if (chatBar.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === hoverOverlay || hoverOverlay.contains(el) || el === selectOverlay || selectOverlay.contains(el)) return;
      selectElement(el);
    }

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);

    function updateOverlayPositions() {
      if (!selectedEl) return;
      const rect = selectedEl.getBoundingClientRect();
      selectOverlay.style.top = rect.top + 'px';
      selectOverlay.style.left = rect.left + 'px';
      selectOverlay.style.width = rect.width + 'px';
      selectOverlay.style.height = rect.height + 'px';
      positionChatBar(rect);
    }
    window.addEventListener('scroll', updateOverlayPositions, true);
    window.addEventListener('resize', updateOverlayPositions);

    window.addEventListener('message', (e) => {
      if (e.source !== parent) return;
      if (e.data?.type === 'host:toggle-element-selector') {
        selectorEnabled = e.data.enabled;
        if (!selectorEnabled) {
          hoverOverlay.style.display = 'none';
          clearSelection();
          lastHovered = null;
        }
        document.body.style.cursor = selectorEnabled ? 'crosshair' : '';
      }
      if (e.data?.type === 'host:apply-styles' && selectedEl) {
        var styles = e.data.styles;
        for (var prop in styles) {
          if (styles.hasOwnProperty(prop)) {
            selectedEl.style[prop] = styles[prop];
          }
        }
        var rect = selectedEl.getBoundingClientRect();
        selectOverlay.style.top = rect.top + 'px';
        selectOverlay.style.left = rect.left + 'px';
        selectOverlay.style.width = rect.width + 'px';
        selectOverlay.style.height = rect.height + 'px';
        positionChatBar(rect);
      }
      if (e.data?.type === 'host:revert-styles' && selectedEl) {
        selectedEl.style.cssText = originalCssText;
        selectedEl.textContent = originalTextContent;
        var rect = selectedEl.getBoundingClientRect();
        selectOverlay.style.top = rect.top + 'px';
        selectOverlay.style.left = rect.left + 'px';
        selectOverlay.style.width = rect.width + 'px';
        selectOverlay.style.height = rect.height + 'px';
        positionChatBar(rect);
      }
      if (e.data?.type === 'host:apply-content' && selectedEl) {
        selectedEl.textContent = e.data.content;
        var rect = selectedEl.getBoundingClientRect();
        selectOverlay.style.top = rect.top + 'px';
        selectOverlay.style.left = rect.left + 'px';
        selectOverlay.style.width = rect.width + 'px';
        selectOverlay.style.height = rect.height + 'px';
        positionChatBar(rect);
      }
    });
  })();
})();
