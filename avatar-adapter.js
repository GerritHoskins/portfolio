// Keep the existing widget responsible for consent, keys, media and teardown.
// Its public methods and named HTML parts form the integration boundary. It has
// no transcript event, so observe those parts; never read its private controller.
// The widget server allows the public site's origin, not loopback. Our local
// preview serves this one public asset; it never proxies keys or session APIs.
const WIDGET_URL = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)
  ? '/__preview/avatar.js' : 'https://avatar.pixeltronic.dev/widget/avatar.js';
const part = (root, name) => root?.querySelector(`[part~="${name}"]`);
export class AvatarAdapter {
  constructor(element, onSnapshot, onFocusInput) {
    this.element = element;
    this.onSnapshot = onSnapshot;
    this.onFocusInput = onFocusInput;
    this.session = 0;
    this.previous = 'off';
    this.ready = false;
    this.onState = () => this.read();
    this.onFocus = event => {
      if (event.target === part(this.root, 'input')) this.onFocusInput();
    };
  }

  async load() {
    if (this.ready) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      if (!customElements.get('pixeltronic-avatar')) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.type = 'module';
          script.src = WIDGET_URL;
          const timer = setTimeout(() => done(new Error('The guide took too long to load.')), 12000);
          const done = error => {
            clearTimeout(timer);
            script.onload = script.onerror = null;
            if (error) { script.remove(); reject(error); } else resolve();
          };
          script.onload = () => done();
          script.onerror = () => done(new Error('The guide could not be loaded.'));
          document.head.append(script);
        });
      }
      const element = this.element;
      this.root = element.shadowRoot;
      const methods = ['start', 'stop', 'ask'];
      const required = ['transcript', 'mic', 'interrupt', 'end-session', 'dialog', 'panel'];
      if (methods.some(name => typeof element[name] !== 'function') || required.some(name => !part(this.root, name))) {
        element.stop?.();
        throw new Error('The guide is temporarily incompatible. Prewritten answers still work.');
      }
      // The widget's decorative countdown halo predates its part API. Hide just
      // that decoration; the native countdown warning is mirrored as text below.
      const style = document.createElement('style');
      style.textContent = '#halo{display:none!important}.stage img{object-position:50% 28%}.dialog header>.mono{display:none}.dialog header{justify-content:flex-end}';
      this.root.append(style);
      this.observer = new MutationObserver(() => this.read());
      this.observer.observe(this.root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'data-text'] });
      element.addEventListener('statechange', this.onState);
      this.root.addEventListener('focusin', this.onFocus);
      this.ready = true;
      this.read();
    })().finally(() => { this.loading = null; });
    return this.loading;
  }

  read() {
    if (!this.ready) return;
    const state = this.element.state;
    if (state === 'connecting' && this.previous !== 'connecting') this.session++;
    const messages = [...part(this.root, 'transcript').children].flatMap(node => {
      const role = node.part.contains('message-user') ? 'user' : node.part.contains('message-avatar') ? 'avatar' : null;
      return role ? [{ role, text: node.textContent }] : [];
    });
    const notice = ['notice-error', 'notice'].map(name => part(this.root, name)).filter(node => node && !node.hidden).map(node => node.textContent.trim()).filter(Boolean).join(' ');
    const mic = part(this.root, 'mic');
    // Hidden native panels retain their last button attributes. Gate them by
    // session state as well, so closing consent cannot leave a false mic action.
    const canRecord = ['ready', 'textOnly', 'ending', 'speaking', 'transcribing', 'recording'].includes(state) && !mic.disabled;
    this.onSnapshot({ state, session: this.session, messages, notice, canAsk: Boolean(this.element.canAsk), canRecord, dialogOpen: !part(this.root, 'dialog').hidden });
    this.previous = state;
  }

  async start() {
    await this.load();
    if (['ended', 'lost'].includes(this.element.state)) this.element.stop();
    this.element.start();
    this.read();
  }
  ask(text) { return this.ready && this.element.canAsk && this.element.ask(text) === true; }
  activate(name) {
    const button = part(this.root, name);
    if (!button || button.disabled || button.hidden) return false;
    button.click();
    return true;
  }
  voice() { return this.activate(this.element.state === 'recording' ? 'send-recording' : 'mic'); }
  interrupt() { return this.activate('interrupt'); }
  stop() { if (this.ready) this.element.stop(); }
  dispose() {
    this.stop();
    this.observer?.disconnect();
    this.element.removeEventListener('statechange', this.onState);
    this.root?.removeEventListener('focusin', this.onFocus);
  }
}
