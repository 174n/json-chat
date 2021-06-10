import "./main.css";

import { AES } from "crypto-es/lib/aes";
// import tinyEnc from "tiny-enc";
import { EvpKDF } from "crypto-es/lib/evpkdf";
import { Utf8 } from "crypto-es/lib/core";
import { escape } from "html-sloppy-escaper";
import { observe } from "fast-json-patch";
import { identicon } from "minidenticons";

// window.AES = { encrypt: (a, b) => tinyEnc.encrypt(b, a), decrypt: (a, b) => tinyEnc.decrypt(b, a) };
window.year = new Date().getFullYear();

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
const typingEl = document.querySelector("#typing");
const uploadBtnEl = document.querySelector("#upload-btn");

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

(async () => {
  window.timeDiff = 0;
  try {
    const date = Date.now();
    const serverTime = (await (await fetch("https://use.ntpjs.org/v1/time.json")).json()).now * 1000;
    // const serverTime = new Date((await (await fetch("http://worldclockapi.com/api/json/utc/now")).json())?.currentDateTime).getTime();
    window.timeDiff = parseInt((Date.now() + date - serverTime * 2) / 2);
  } catch(err) {}
})();

chatServerEl.value = chatServerEl.value.replace(
  "%servername%",
  location.protocol === "file:" || location.host.match(/^localhost:\d{2,4}$/g)
    ? "https://rundik.ru/json/"
    // ? "http://localhost:3000"
    : `${location.origin}/json`
);

window.uploadFile = () => {
  let metadata;
  return new Promise((resolve, reject) => {
    const fileSelector = document.createElement('input');
    fileSelector.setAttribute('type', 'file');
    fileSelector.click();
  
    const readFile = async e => {
      try {
        const enc = (await AES.encrypt(JSON.stringify({
          url: e.target.result,
          ...metadata
        }), window.chatPass)).toString();

        const hash = EvpKDF(e.target.result).toString();

        const url = `${
          chatServerEl.value.replace(/^(lp|l|p):(\s|)+/g, "").split("/").slice(0, -1).join("/")
        }/${
          EvpKDF(window.chatPass + hash).toString()
        }`;

        await (await fetch(url, {
          method: "PUT",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            file: enc
          })
        }));

        resolve(url);
      } catch (err) {
        reject(err);
      }
    }
  
    const changeFile = () => {
      const file = fileSelector.files[0];
      if (file.size > 100000) {
        alert("Файл не больше 100кб");
        return;
      }
      metadata = { name: file.name, modified: file.lastModified, size: file.size};
      const reader = new FileReader();
      reader.addEventListener('load', readFile);
      reader.readAsDataURL(file);
    }
    fileSelector.addEventListener('change', changeFile);
  });
}

uploadBtnEl.addEventListener("click", async () => {
  let fileUrl;
  try {
    fileUrl = await uploadFile();
  } catch (err) {
    return;
  }
  if (fileUrl) {
    msgInputEl.value = `$[](${fileUrl})`;
    submitMessage();
  }
});

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
window.urlRegex = '(https?:\\/\\/(www\.)?[-a-zа-я0-9@:%._\\+~#=]{1,256}\\.[a-zа-я0-9()]{1,6}\\b([-a-zа-я0-9()@:%_\\+.,;~#?&//=]*))';
window.encfilesCache = {};
const tinymark = str => str
  .replace(/(_[^*_]+)\*([^*_]+_)/g, "$1_*_$2") // Remove interlacing
  .replace(/\*([^*]+)\*/g, "<b>$1</b>") // Bold
  .replace(/_([^_]+)_/g, "<em>$1</em>") // Italic
  .replace(new RegExp(`(?<!\\]\\()${urlRegex}`, "gi"), '<a href="$1" target="_blank">$1</a>') // Link
  .replace(new RegExp(`!\\[([^\\]]{0,255})\\]\\(${urlRegex}\\)`, "gi"), '<a href="$2" target="_blank"><img src="$2" alt="$1"></a>') // Image
  .replace(new RegExp(`\\$\\[([^\\]]{0,255})\\]\\(${urlRegex}\\)`, "gi"), (...args) =>
    encfilesCache[args[2]]
      ? `<img src="${encfilesCache[args[2]].url}">`
      : `<span data-encfile="${args[2]}" class="encfile"></span>`
  ) // Encrypted files
  .replace(/\n/g, "<br />"); // New Line

const loadEncryptedFiles = () => {
  [...document.querySelectorAll("[data-encfile]")].forEach(async el => {
    const url = el.getAttribute("data-encfile");
    let enc;
    try {
      enc = await (await fetch(url)).json();
    } catch (err) {
      el.outerHTML = `<b class="error">${err}</b>`;
      return;
    }
    if (enc && enc.file) {
      const json = encfilesCache[url] || JSON.parse(await AES.decrypt(enc.file, window.chatPass).toString(Utf8));
      if (json.url.match(/^data:image/g)) {
        el.outerHTML = `<img src="${json.url}">`;
        encfilesCache[url] = json;
      } else {
        el.outerHTML = `<b class="error">тип файла пока не поддерживается</b>`;
      }
      scrollToLatest();
    }
  });
}

// tinyAgo
const ago=e=>{let t,n,r=0|(Date.now()-e)/1e3,o={"сек":60,"мин":60,"ч":24};for(t in o)if(n=r%o[t],!(r=0|r/o[t]))return n+" "+t+". назад";return new Date(e).toLocaleString("ru").replace(new RegExp('\\.'+year), '').slice(0, -3)};
const updateTimestamps = (start=0) => [...document.querySelectorAll("[data-date]")].slice(start).forEach(d => d.innerText = ago(parseInt(d.getAttribute("data-date"))));
setInterval(() => updateTimestamps(-3), 1000);
setInterval(() => updateTimestamps(-15), 60000);

window.navestiSuetu=()=>setInterval(()=>{document.querySelector(".icon-bg").innerHTML=Array.from({length:(window.innerHeight+window.innerWidth)/10}).map(()=>identicon(Math.random().toString())).join("\n")},500);

const decryptMessage = async msg => {
  const decr = (await AES.decrypt(msg.data, window.chatPass)).toString(Utf8);
  try {
    return JSON.parse(decr);
  } catch (err) {
    console.error(err);
    return {};
  }
}

const pushMessage = async (encrypted, id) => {
  const {name, date, msg, fingerprint} = await decryptMessage(encrypted);
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
  avatar.onclick = async (e) => {
    // console.log(e.target.parentElement.innerText, await AES.decrypt(messages[id].data, window.chatPass).toString(Utf8));
    messages.splice(id + 2, 1);
    // document.querySelector(`.message:nth-child(${id+1})`).remove();
    // notify();
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
    <div class="date" data-date="${date + timeDiff}"></div>
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
  scrollToLatest();
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
  scrollToLatest();
}

const throttle = (fn, delay) => {
  let lastCalled = 0;
  return (...args) => {
    let now = new Date().getTime();
    if (now - lastCalled < delay) {
      return;
    }
    lastCalled = now;
    return fn(...args);
  }
}

msgInputEl.addEventListener("input", throttle(async () => {
  if (chatLongpollSupported && chatPatchSupported) {
    const typing = messages.filter(m => m && m.typing);
    if (typing && typing[0]) {
      const decrTyping = JSON.parse(await AES.decrypt(typing[0].typing, window.chatPass).toString(Utf8));
      const msg = [...(decrTyping?.filter(t => Date.now() - t.timestamp + timeDiff < 30000) || []), { chatName, timestamp: Date.now() - timeDiff, browserFingerprint}];
      typing[0].typing = await AES.encrypt(JSON.stringify(msg), chatPass).toString();
    } else {
      messages.push({
        typing: await AES.encrypt(JSON.stringify([{ chatName, timestamp: Date.now() - timeDiff, browserFingerprint }]), chatPass).toString()
      });
    }
  }
}, 5000));

const setTypingMessage = async () => {
  let typing = messages.filter(m => m && m.typing);
  if (!typing[0] || !typing[0].typing)
    return;
  const typingPpl = JSON.parse(await AES.decrypt(typing[0].typing, window.chatPass).toString(Utf8))
    ?.filter(t => Date.now() - t.timestamp + timeDiff < 20000 && t.chatName !== chatName && t.browserFingerprint !== browserFingerprint)
    ?.map(t => t.chatName)
    ?.filter((t, i, a) => a.indexOf(t) === i);
  if (typingPpl && typingPpl.length > 0) {
    typingEl.innerText = `${typingPpl.join()} набира${typingPpl.length > 1 ? "ют" : "ет"} сообщение...`;
  } else {
    typingEl.innerText = "";
  }
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
  if (msgs || msgs.length > 0) {
    msgsEl.innerHTML = ""; // TODO: use patches
    msgs.filter(m => m && m.data).forEach(pushMessage);
    scrollToLatest();
    scrollWhenImagesLoaded();
  }
  msgsEl.classList.remove("loading");
  updateTimestamps();
  observeMessages();
}

const scrollToLatest = () => {
  setTimeout(() => {
    msgsEl.scrollTop = msgsEl.scrollHeight;
    updateTimestamps();
  }, 300);
}

const scrollWhenImagesLoaded = async () => {  
  await Promise.all(
    Array.from(document.images)
      .filter(img => !img.complete)
      .map(img => new Promise(resolve => { img.onload = img.onerror = resolve; }))
  );
  scrollToLatest();
}

const loadChat = async (firstTime) => {
  if (chatLongpollSupported && chatPatchSupported && !firstTime) {
    setInterval(setTypingMessage, 5000);
  }
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
      scrollToLatest();
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
  setTimeout(() => loadEncryptedFiles(), 1000);
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
    const url = await AES.decrypt(m.webhook, window.chatPass).toString(Utf8);
    if (url.match(new RegExp(urlRegex, "gi")))
      await fetch(url);
  });
}

msgFormEl.addEventListener("submit", async e => {
  e.preventDefault();
  submitMessage();
});

const submitMessage = async () => {
  if (window.chatAddr) {
    if (msgInputEl.value === "navestiSuetu") {
      navestiSuetu();
      msgInputEl.value = "";
      return;
    }
    const encrypted = {
      data: await AES.encrypt(JSON.stringify({
        name: chatName,
        fingerprint: browserFingerprint,
        date: Date.now() - timeDiff,
        msg: msgInputEl.value
      }), chatPass).toString()
    }
    messages.push(encrypted);
    await pushMessage({
      data: encrypted.data,
      notSent: true
    }, messages.length - 1);
    scrollToLatest();
    scrollWhenImagesLoaded();
    msgInputEl.value = "";
    notify();
  }
}