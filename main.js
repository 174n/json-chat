import "./main.css";

import { AES } from "crypto-es/lib/aes";
import { EvpKDF } from "crypto-es/lib/evpkdf";
import { Utf8 } from "crypto-es/lib/core";
import { escape } from "html-sloppy-escaper";
import { observe } from "fast-json-patch";

document.body.setAttribute("style", "");

const overlayEl = document.querySelector("#overlay");
const chatNameEl = document.querySelector("#chat-name");
const chatPasswordEl = document.querySelector("#chat-password");
const chatServerEl = document.querySelector("#chat-server");
const msgsEl = document.querySelector("#msgs");
const msgInputEl = document.querySelector("#msg-input");
const passwordFormEl = document.querySelector("#password-form");
const msgFormEl = document.querySelector("#msg-form");
const loadingBarEl = document.querySelector("#loading-bar");

window.throwErrorAndReload = msg => {
  if (!window.errorAccured) {
    window.errorAccured = true;
    if (!window.leaving) {
      alert(msg);
    }
    location.reload();
  }
}

window.onbeforeunload = () => {
  window.leaving = true;
};

chatServerEl.value = chatServerEl.value.replace(
  "%servername%",
  location.protocol === "file:" || location.host.match(/^localhost:\d{2,4}$/g)
    ? "http://localhost:3000"
    : `${location.origin}/json`
);

const getHash = str => {
  let hash = 0, i, chr;
  if (str.length === 0) return hash;
  for (i = 0; i < str.length; i++) {
    chr   = str.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(32);
}

window.browserFingerprint = getHash([
    navigator.userAgent,
    [screen.height, screen.width, screen.colorDepth].join('x'),
    new Date().getTimezoneOffset(),
    !!window.sessionStorage,
    !!window.localStorage,
    Object.keys(navigator.plugins).map(k => {
        return [
            navigator.plugins[k].name,
            navigator.plugins[k].description,
            Object.keys(navigator.plugins[k]).map(kk => [
              navigator.plugins[k][kk].type,
              navigator.plugins[k][kk].suffixes
            ].join('~')).join(',')
        ].join("::");
    }).join(';')
  ].join('###')).toString();

// Identicon
const e="d4145a 8e78ff ff7300 fbb03b ed1e79 019244 ed1c23 2e3192 fc7d7b fecc00 3aa17e 4f00bc 09c9be 662d8c 00a8c5 1353ae".split(" ");window.identicon=function(t){const n=t.split("").map((e=>e.charCodeAt(0))).reduce(((e,t)=>16777619*((e^t)>>>0)),2166136261);return`<svg viewBox="-1.5 -1.5 8 8" xmlns="http://www.w3.org/2000/svg" fill="#${e[n/16777619%e.length]||""}">${t?[...Array(25).keys()].map((e=>n%(16-e%15)<4?`<rect x="${e>14?7-~~(e/5):~~(e/5)}" y="${e%5}" width="1" height="1"/>`:"")).join(""):[]}</svg>`};const identiconSvg=globalThis.customElements?.define("identicon-svg",class extends HTMLElement{constructor(){super()}connectedCallback(){this.identiconSvg()}attributeChangedCallback(){this.identiconSvg()}static get observedAttributes(){return["username"]}identiconSvg(){this.innerHTML=identicon(this.getAttribute("username"))}});

// https://github.com/TinyLibraries/tiny-mark
const tinymark = str => {
  return str
    .replace(/(_[^*_]+)\*([^*_]+_)/g, "$1_*_$2") // Remove interlacing
    .replace(/\*([^*]+)\*/g, "<b>$1</b>") // Bold
    .replace(/_([^_]+)_/g, "<em>$1</em>") // Italic
    .replace(/!\[([^\]]{0,255})\]\((https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*))\)/g, '<img src="$2" alt="$1">') // Image
    .replace(/\n/g, "<br />"); // New Line
};

window.navestiSuetu=()=>setInterval(()=>{document.querySelector(".icon-bg").innerHTML=Array.from({length:(window.innerHeight+window.innerWidth)/10}).map(()=>identicon(Math.random().toString())).join("\n")},500);

// const checkIfUsed = () => {
//   window.addEventListener("click", () => {
//     window.chatUsed = true;
//   });
//   window.addEventListener("keyup", () => {
//     window.chatUsed = true;
//   });
//   window.addEventListener("scroll", () => {
//     window.chatUsed = true;
//   });

//   setInterval(() => {
//     if (window.chatUsed) {
//       window.chatUsed = false;
//     } else if (msgInputEl.value === "") {
//       location.reload();
//     }
//   }, 2 * 60 * 1000);
// }

const parseDate = timestamp => {
  const date = new Date(timestamp);
  const currentDate = new Date();
  return currentDate.toLocaleString("ru").slice(0, 10) === date.toLocaleString("ru").slice(0, 10)
    ? date.toLocaleTimeString("ru") : date.toLocaleString("ru");
}

const decryptMessage = msg =>
  JSON.parse(AES.decrypt(msg.data, window.chatPass).toString(Utf8));

const pushMessage = (encrypted, id) => {
  const {name, date, msg, fingerprint} = decryptMessage(encrypted);
  if (!name || !date || !msg || !fingerprint) {
    throwErrorAndReload("Message parsing error");
    return;
  }

  const message = document.createElement("div");
  const msgInner = document.createElement("div");
  const avatar = document.createElement("div");
  message.classList.add("message");
  avatar.classList.add("avatar");
  msgInner.classList.add("msg");
  avatar.onclick = () => {
    messages.splice(id, 1);
  }

  avatar.innerHTML = `${identicon(fingerprint)}`
  if (fingerprint === browserFingerprint) {
    msgInner.classList.add("mine");
  }
  if (encrypted.notSent) {
    msgInner.classList.add("not-sent");
  }
  if (name === chatName) {
    message.classList.add("same-name");
  }
  msgInner.innerHTML = `
    <div class="title-line">
      <div class="name">${escape(name)}</div>
      <div class="fingerprint">[${fingerprint.slice(0, 10)}]</div>
    </div>
    <div class="text">${tinymark(escape(msg))}</div>
    <div class="date">${parseDate(date)}</div>
  `;
  message.append(avatar);
  message.append(msgInner);
  msgsEl.append(message);
}

const sendUpdates = async data => {
  try {
    const res = await (await fetch(window.chatAddr + (chatPatchSupported ? "?patch=true" : ""), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(chatPatchSupported ? data : messages)
    })).json();
    if (res.error) {
      throwErrorAndReload(res.error);
    }
  } catch (err) {
    return throwErrorAndReload(err);
  }
  [...document.querySelectorAll(".not-sent")].forEach(el => el.classList.remove("not-sent"));
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

window.createChat = async pass => { // Not accesible in gui
  return await (await fetch(`${chatServerEl.value.replace(/^(lp|l|p):(\s|)+/g, "").split("/").slice(0, -1).join("/")}/${
    EvpKDF(pass || chatPasswordEl.value, chatServerEl.value.split("/").slice(-1).join("/")).toString()
  }`, {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: "[]"
  }));
}

window.onresize = () => {
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

window.observeMessages = () => {
  window.messagesObserver = observe(window.messages, async patches => {
    await sendUpdates(patches);
  });
}

window.setLongpollMessages = msgs => {
  messagesObserver.unobserve();
  msgsEl.classList.add("loading");
  window.messages = msgs;
  msgsEl.innerHTML = ""; // TODO: use patches
  messages.filter(m => m && m.data).forEach(pushMessage);
  msgsEl.classList.remove("loading");
  msgsEl.scrollTop = msgsEl.scrollHeight;
  observeMessages();
}

const loadChat = async (firstTime) => {
  if (chatLongpollSupported && !firstTime) {
    try {
      const res = await fetch(window.chatAddr + "?longpoll=true");
      if (res.status === 200) {
        setLongpollMessages(await res.json());
      } else if (res.status !== 204) {
        throwErrorAndReload("Error loading messages with longpoll");
      }
      loadChat();
    } catch (err) {
      throwErrorAndReload(err);
    }
  } else {
    loadingBarEl.classList.toggle("toggle");
    loadingBarEl.classList.toggle("toggle");
    loadingBarEl.classList.toggle("full");
    msgsEl.classList.add("loading");
    setTimeout(async () => {
      msgsEl.innerHTML = "";
      try {
        window.messages = (await (await fetch(window.chatAddr)).json());
      } catch (err) {
        throwErrorAndReload(err);
      }
      if (!messages || !(messages instanceof Array)) {
        throwErrorAndReload("Messages not loaded");
      }
      messages.filter(m => m && m.data).forEach(pushMessage);
      msgsEl.classList.remove("loading");
      msgsEl.scrollTop = msgsEl.scrollHeight;
      if (firstTime) {
        observeMessages();
      }
    }, 300);
    if (!chatLongpollSupported) {
      setTimeout(loadChat, 15000)
    }
  }
  if (chatLongpollSupported && firstTime) {
    loadingBarEl.remove();
    loadChat();
  }
};

passwordFormEl.addEventListener("submit", e => {
  e.preventDefault();
  window.chatPass = chatPasswordEl.value;
  window.chatName = chatNameEl.value;
  window.chatLongpollSupported = !!chatServerEl.value.match(/^(p|)l(p|):/g);
  window.chatPatchSupported = !!chatServerEl.value.match(/^(l|)p(l|):/g);
  chatServerEl.value = chatServerEl.value.replace(/^(lp|l|p):(\s|)+/g, "");
  window.chatAddr = `${chatServerEl.value.split("/").slice(0, -1).join("/")}/${
    EvpKDF(chatPasswordEl.value, chatServerEl.value.split("/").slice(-1).join("/")).toString()
  }`;
  overlayEl.classList.add("hidden");
  chatPasswordEl.value = "";
  chatNameEl.value = "";

  loadChat(true);
  // checkIfUsed();
});

msgFormEl.addEventListener("submit", async e => {
  e.preventDefault();
  if (window.chatAddr) {
    const encrypted = {
      data: AES.encrypt(JSON.stringify({
        name: chatName,
        fingerprint: browserFingerprint,
        date: new Date().getTime(),
        msg: msgInputEl.value
      }), chatPass).toString()
    }
    messages.push(encrypted);
    pushMessage({
      data: encrypted.data,
      notSent: true
    });
    msgsEl.scrollTop = msgsEl.scrollHeight;
    msgInputEl.value = "";
  }
});