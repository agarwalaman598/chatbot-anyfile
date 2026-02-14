/* ─── AnyFile Chatbot – Frontend ─────────────────────────────────────────── */

const $ = (s) => document.querySelector(s);
const fileInput   = $("#fileInput");
const modelSelect = $("#modelSelect");
const fileInfo    = $("#fileInfo");
const fileName    = $("#fileName");
const fileDetail  = $("#fileDetail");
const statusArea  = $("#statusArea");
const chat        = $("#chat");
const chatEmpty   = $("#chatEmpty");
const queryInput  = $("#queryInput");
const sendBtn     = $("#sendBtn");
const inputForm   = $("#inputForm");
const dropZone    = $("#dropZone");
const dropOverlay = $("#dropOverlay");
const uploadLabel = $("#uploadLabel");

let isUploading = false;

/* ─── Fetch available models on load ─────────────────────────────────────── */
(async function loadModels() {
  try {
    const res = await fetch("/models");
    const data = await res.json();
    const models = data.models || ["llama3", "gemma"];
    modelSelect.innerHTML = models
      .map((m) => `<option value="${m}">${m}</option>`)
      .join("");
  } catch {
    modelSelect.innerHTML =
      '<option value="llama3">llama3</option><option value="gemma">gemma</option>';
  }
})();

/* ─── File selection ─────────────────────────────────────────────────────── */
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  showFileInfo(file);
  startUpload(file);
});

function showFileInfo(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  fileName.textContent = file.name;
  fileDetail.textContent = `Type: ${ext}  •  Size: ${fmtSize(file.size)}`;
  fileInfo.hidden = false;
}

function fmtSize(b) {
  if (b === 0) return "0 B";
  const k = 1024, s = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return (b / Math.pow(k, i)).toFixed(2) + " " + s[i];
}

/* ─── Upload + SSE progress ──────────────────────────────────────────────── */
async function startUpload(file) {
  if (isUploading) return;
  isUploading = true;

  // show indeterminate progress immediately
  statusArea.innerHTML = `
    <div class="progress-stage">
      <div class="spinner-sm"></div>
      <span id="pMsg">Indexing...</span>
    </div>
  `;

  const form = new FormData();
  form.append("file", file);
  form.append("model", modelSelect.value);

  try {
    const res = await fetch("/upload", { method: "POST", body: form });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });

      const parts = buf.split("\n\n");
      buf = parts.pop();

      for (const part of parts) {
        if (!part.startsWith("data: ")) continue;
        let payload;
        try { payload = JSON.parse(part.slice(6)); } catch { continue; }

        if (payload.error) {
          statusArea.innerHTML = `<div class="error-banner">${payload.error}</div>`;
          isUploading = false;
          return;
        }
        if (payload.progress !== undefined) {
          setProgress(payload.progress, payload.message || "");
        }
        if (payload.complete) {
          onUploadComplete();
          isUploading = false;
          return;
        }
      }
    }
  } catch (err) {
    statusArea.innerHTML = `<div class="error-banner">${err.message}</div>`;
  }
  isUploading = false;
}

function setProgress(pct, msg) {
  const msgEl = $("#pMsg");
  if (msgEl) msgEl.textContent = stageLabel(msg);
}

function stageLabel(msg) {
  const m = (msg || "").toLowerCase();
  if (m.includes("upload") || m.includes("saving")) return "Uploading...";
  if (m.includes("extract"))  return "Extracting... " + pctFromMsg(msg);
  if (m.includes("chunk"))    return "Chunking...";
  if (m.includes("embed"))    return "Embedding...";
  if (m.includes("index") || m.includes("vector")) return "Indexing...";
  if (m.includes("complete") || m.includes("success")) return "Done!";
  return msg || "Processing...";
}

function pctFromMsg(msg) {
  const m = msg.match(/(\d+\/\d+)/);
  return m ? `(${m[1]})` : "";
}

function onUploadComplete() {
  setTimeout(() => {
    statusArea.innerHTML =
      '<div class="success-banner">✓ Successfully indexed — start asking questions!</div>';
    queryInput.disabled = false;
    sendBtn.disabled = false;
    queryInput.focus();
  }, 400);
}

/* ─── Chat ───────────────────────────────────────────────────────────────── */
inputForm.addEventListener("submit", (e) => { e.preventDefault(); sendQuery(); });
sendBtn.addEventListener("click", sendQuery);

async function sendQuery() {
  const q = queryInput.value.trim();
  if (!q) return;

  chatEmpty.hidden = true;
  appendMsg("user", q);
  queryInput.value = "";

  const thinkId = appendThinkingMsg();

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, model: modelSelect.value }),
    });
    const data = await res.json();
    removeMsg(thinkId);

    if (res.ok) {
      await typeMessage("bot", data.response);
    } else {
      appendMsg("bot", `Error: ${data.error || "Something went wrong"}`);
    }
  } catch (err) {
    removeMsg(thinkId);
    appendMsg("bot", `Error: ${err.message}`);
  }
}

function appendMsg(cls, text) {
  const id = "m" + Date.now() + Math.random().toString(36).slice(2, 6);
  const d = document.createElement("div");
  d.id = id;
  d.className = "msg " + cls;
  d.textContent = text;
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
  return id;
}

function appendThinkingMsg() {
  const id = "m" + Date.now() + Math.random().toString(36).slice(2, 6);
  const d = document.createElement("div");
  d.id = id;
  d.className = "msg bot thinking";
  d.innerHTML = '<span class="thinking-text">Thinking</span><span class="thinking-dots"><span></span><span></span><span></span></span>';
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
  return id;
}

async function typeMessage(cls, text) {
  const id = "m" + Date.now() + Math.random().toString(36).slice(2, 6);
  const d = document.createElement("div");
  d.id = id;
  d.className = "msg " + cls + " typing";
  d.textContent = "";
  chat.appendChild(d);
  
  const chars = text.split("");
  const delay = 15; // ms per character
  
  for (let i = 0; i < chars.length; i++) {
    d.textContent += chars[i];
    chat.scrollTop = chat.scrollHeight;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  d.classList.remove("typing");
  return id;
}

function removeMsg(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

/* ─── Drag & Drop ────────────────────────────────────────────────────────── */
["dragenter", "dragover", "dragleave", "drop"].forEach((e) =>
  dropZone.addEventListener(e, (ev) => { ev.preventDefault(); ev.stopPropagation(); })
);
["dragenter", "dragover"].forEach((e) =>
  dropZone.addEventListener(e, () => dropOverlay.classList.add("active"))
);
["dragleave", "drop"].forEach((e) =>
  dropZone.addEventListener(e, () => dropOverlay.classList.remove("active"))
);
dropZone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  showFileInfo(file);
  startUpload(file);
});
