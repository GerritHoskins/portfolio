// Curated portfolio copy from the approved Orbit design. No network or AI calls.
const GH='https://github.com/GerritHoskins/';
const MAIL='mailto:contact@pixeltronic.dev';
const INTRO=`Hi, I’m Gerrit Hoskins, a frontend and cross-platform mobile engineer working in TypeScript, Vue and Ionic/Capacitor. One public example is my [Microsoft Clarity plugin for Capacitor](${GH}capacitor-clarity-plugin). Ask about my work, or [email me](${MAIL}).`;
const Q={built:'What have you built?',ai:'How do you use AI?',contact:'How can I reach you?',rest:'Show the other projects',stack:'What’s your core stack?',hush:'Tell me about hushpush',conv:'What is the app conversion?',webview:'What is the WebView plugin?'};
const INTRO_NEXT=[Q.built,Q.ai];
const A={
 open:{t:`Two to start with.\n\n[capacitor-clarity-plugin](${GH}capacitor-clarity-plugin): I built a Capacitor plugin that brings Microsoft Clarity to hybrid apps. One typed TypeScript API with Android, iOS and web implementations covers session replay, analytics and consent management.\n\n[charge-portal](${GH}charge-portal) is a personal project with synthetic data. I’m migrating an EV-charging portal to Nuxt and TypeScript one route at a time. Each route can be switched at runtime with instant rollback, and migrated routes get accessibility and performance checks.\n\nThere are four more public repositories if you’d like to see them.`,next:[Q.rest,Q.contact]},
 rest:{t:`Here are the other four.\n\n[cross-platform-app-conversion](${GH}cross-platform-app-conversion) is a proof of concept for moving an Ionic/Capacitor Vue app to another cross-platform stack. An AI executor makes each change, an AI reviewer checks it, and a person accepts it.\n\n[hushpush](${GH}hushpush) is a local CLI that checks screenshots and logs for personal data before a push.\n\n[pixeltronic-webview-browser](${GH}pixeltronic-webview-browser) is a Capacitor plugin that embeds native WebViews inside the app layout.\n\n[screenshot-ai](${GH}screenshot-ai) is a desktop app that captures part of the screen and returns text, code and answers from an AI model.`,next:[Q.hush,Q.contact]},
 ai:{t:`AI is part of how I work, but a person makes the decisions. In practice that means project-aware context for development tools (for example through MCP), custom agent skills, and a person reviewing every change before anything is merged or released.\n\n[cross-platform-app-conversion](${GH}cross-platform-app-conversion) shows this in public. An AI executor handles one small work package, a separate AI reviewer checks it, and a person accepts or rejects each change.`,next:[Q.conv,Q.contact]},
 stack:{t:`Frontend and cross-platform mobile engineering in TypeScript: Vue and React interfaces, Ionic and Capacitor apps with native plugins for iOS and Android, and the Node.js services behind them. I also work on automated tests, CI/CD and release pipelines, and production issue analysis.\n\nTwo public Capacitor plugins show the native side: [capacitor-clarity-plugin](${GH}capacitor-clarity-plugin) and [pixeltronic-webview-browser](${GH}pixeltronic-webview-browser).`,next:[Q.webview,Q.contact]},
 contact:{t:`Email works best: [contact@pixeltronic.dev](${MAIL}). You can also find me on [LinkedIn](https://www.linkedin.com/in/gerrit-hoskins/) and [GitHub](https://github.com/GerritHoskins).`,next:[Q.built,Q.stack]},
 hushpush:{t:`[hushpush](${GH}hushpush) is a local, offline Rust CLI that runs before a Git push. It checks screenshots and logs for personal data, such as email addresses and card numbers, and masks anything it reports. It fails closed, so if it can’t run the check, the push doesn’t go through.`,next:[Q.rest,Q.ai]},
 charge:{t:`[charge-portal](${GH}charge-portal) is a personal project with synthetic data. It moves an EV-charging portal to Nuxt and TypeScript one route at a time. Each route can be switched at runtime with instant rollback, and migrated routes get accessibility and performance checks.`,next:[Q.conv,Q.rest]},
 conversion:{t:`[cross-platform-app-conversion](${GH}cross-platform-app-conversion) is a proof of concept for migrating an app. It translates an Ionic/Capacitor Vue app into another cross-platform stack, one small work package at a time. An AI executor writes each package, a separate AI reviewer checks it, and a person accepts it before it’s committed.`,next:[Q.ai,Q.rest]},
 clarity:{t:`[capacitor-clarity-plugin](${GH}capacitor-clarity-plugin) brings Microsoft Clarity to Capacitor apps. One TypeScript interface covers Android, iOS and web, so hybrid apps get session replay, analytics and consent management.`,next:[Q.webview,Q.rest]},
 webview:{t:`[pixeltronic-webview-browser](${GH}pixeltronic-webview-browser) is a Capacitor plugin for iOS and Android. It embeds native WebViews in the app layout, with navigation controls, custom headers, page events, dynamic resizing and screenshot capture.`,next:[Q.rest,Q.contact]},
 webviewLong:{t:`Yes, that’s mine. Without the tracking parameters, the link is [${GH}pixeltronic-webview-browser](${GH}pixeltronic-webview-browser).\n\nIt’s a Capacitor plugin that embeds native WebViews inside the app layout. One TypeScript API drives both platforms, with Swift on iOS and Java on Android. It handles navigation controls, custom headers, page events, dynamic resizing and screenshot capture.`,next:[Q.rest,Q.contact]},
 screenshot:{t:`[screenshot-ai](${GH}screenshot-ai) is a desktop app built with Electron and TypeScript. You capture part of the screen and get answers, extracted text and insights about any code in it, using OpenAI or Anthropic models.`,next:[Q.ai,Q.rest]},
 fallback:{t:`I don’t have a prewritten answer for that. I can tell you about my public projects, the stack I work in, how I use AI with human review, or how to reach me. For anything else, [email me](${MAIL}).`,next:INTRO_NEXT}
};
function match(q){const s=q.toLowerCase();
 if(/hushpush|pii|personal data|pre-push/.test(s))return'hushpush';
 if(/clarity|analytics|session replay/.test(s))return'clarity';
 if(/charge|nuxt/.test(s))return'charge';
 if(/conversion|react native|convert/.test(s))return'conversion';
 if(/webview|web view|in-app browser/.test(s))return'webview';
 if(/screenshot/.test(s))return'screenshot';
 if(/contact|e-?mail|reach|touch|hire|linkedin/.test(s))return'contact';
 if(/\bai\b|agent|llm|mcp|claude|gpt/.test(s))return'ai';
 if(/other|rest|remaining|more project|else|all project/.test(s))return'rest';
 if(/stack|tech|skill|vue|typescript|capacitor|ionic|node|mobile|frontend|test/.test(s))return'stack';
 if(/project|built|open|github|repo|work/.test(s))return'open';
 return'fallback'}

export { INTRO, INTRO_NEXT, A, match };
