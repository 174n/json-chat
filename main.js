import "./main.css";

import { AES } from "crypto-es/lib/aes";
import { EvpKDF } from "crypto-es/lib/evpkdf";
import { Utf8 } from "crypto-es/lib/core";
import { escape } from "html-sloppy-escaper";
import { observe } from "fast-json-patch";
import { identicon } from "minidenticons";

window.AES = AES;

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

// https://github.com/TinyLibraries/tiny-mark
window.urlRegex = '(https?:\\/\\/(www\.)?[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-zA-Z0-9()]{1,6}\\b([-a-zA-Z0-9()@:%_\\+.~#?&//=]*))';
const tinymark = str => str
  .replace(/(_[^*_]+)\*([^*_]+_)/g, "$1_*_$2") // Remove interlacing
  .replace(/\*([^*]+)\*/g, "<b>$1</b>") // Bold
  .replace(/_([^_]+)_/g, "<em>$1</em>") // Italic
  .replace(new RegExp(`(?<!\\]\\()${urlRegex}`, "g"), '<a href="$1" target="_blank">$1</a>') // Link
  .replace(new RegExp(`!\\[([^\\]]{0,255})\\]\\(${urlRegex}\\)`, "g"), '<img src="$2" alt="$1">') // Image
  .replace(/\n/g, "<br />"); // New Line

// tinyAgo
const ago=e=>{let t,n,r=0|(Date.now()-e)/1e3,o={"сек":60,"мин":60,"ч":24};for(t in o)if(n=r%o[t],!(r=0|r/o[t]))return n+" "+t+". назад";return new Date(e).toLocaleString("ru")};
const updateTimestamps = (start=0) => [...document.querySelectorAll("[data-date]")].slice(start).forEach(d => d.innerText = ago(parseInt(d.getAttribute("data-date"))));
setInterval(() => updateTimestamps(-3), 1000);
setInterval(updateTimestamps, 60000);

window.navestiSuetu=()=>setInterval(()=>{document.querySelector(".icon-bg").innerHTML=Array.from({length:(window.innerHeight+window.innerWidth)/10}).map(()=>identicon(Math.random().toString())).join("\n")},500);

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
    notify();
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
    <div class="date" data-date="${date}"></div>
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
  scrollWhenImagesLoaded();
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
  scrollWhenImagesLoaded();
  updateTimestamps();
  observeMessages();
}

const scrollWhenImagesLoaded = () => {  
  Promise.all(
    Array.from(document.images)
      .filter(img => !img.complete)
      .map(img => new Promise(resolve => { img.onload = img.onerror = resolve; }))
  ).then(() => {
    msgsEl.scrollTop = msgsEl.scrollHeight;
  });
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
      scrollWhenImagesLoaded()
      msgsEl.scrollTop = msgsEl.scrollHeight;
      if (firstTime) {
        observeMessages();
      }
      updateTimestamps();
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
});

window.notify = () => {
  window.messages.filter(m => m && m.webhook).forEach(async m => {
    const url = AES.decrypt(m.webhook, window.chatPass).toString(Utf8);
    if (url.match(new RegExp(urlRegex, "g")))
      await fetch(url);
  });
}

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
    scrollWhenImagesLoaded();
    msgInputEl.value = "";
    notify();
  }
});