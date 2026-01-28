document.addEventListener("DOMContentLoaded", () => {

  const dropZone = document.getElementById("dropZone");
  const dropOverlay = document.getElementById("dropOverlay");
  const chat = document.getElementById("chat");
  const statusText = document.getElementById("status");
  const fileNameText = document.getElementById("fileName");
  const fileTypeText = document.getElementById("fileType");
  const fileSizeText = document.getElementById("fileSize");

  function addMessage(text, type) {
    const div = document.createElement("div");
    div.className = `msg ${type}`;
    div.textContent = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
  }

  function typeMessage(element, text) {
    let i = 0;
    element.textContent = "";
    const interval = setInterval(() => {
      element.textContent += text[i];
      i++;
      chat.scrollTop = chat.scrollHeight;
      if (i >= text.length) clearInterval(interval);
    }, 15);
  }

  function handleEnter(e) {
    if (e.key === "Enter") sendQuery();
  }

  window.handleEnter = handleEnter;

  function showSpinner(msg) {
    statusText.innerHTML = `<span class="spinner"></span>${msg}`;
  }

  function updatePreview(file) {
    fileNameText.textContent = "Name: " + file.name;
    fileTypeText.textContent = "Type: " + (file.type || "Unknown");
    fileSizeText.textContent =
      "Size: " + (file.size / 1024).toFixed(2) + " KB";
  }

  function uploadFile() {
    const fileInput = document.getElementById("file");
    if (!fileInput.files.length) {
      statusText.textContent = "Please select a file first";
      return;
    }

    const file = fileInput.files[0];
    updatePreview(file);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("model", document.getElementById("model").value);

    showSpinner("Indexing document...");

    fetch("/upload", {
      method: "POST",
      body: formData
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          statusText.textContent = data.error;
        } else {
          statusText.textContent = "File indexed successfully";
          addMessage("Document ready. Ask me anything about it.", "bot");
        }
      });
  }

  window.uploadFile = uploadFile;

  function sendQuery() {
    const input = document.getElementById("query");
    const text = input.value.trim();
    if (!text) return;

    addMessage(text, "user");
    input.value = "";

    showSpinner("Thinking...");

    fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: text,
        model: document.getElementById("model").value
      })
    })
      .then(res => res.json())
      .then(data => {
        statusText.textContent = "Ready";

        const botBubble = addMessage("", "bot");
        if (data.error) {
          botBubble.textContent = data.error;
        } else {
          typeMessage(botBubble, data.response);
        }
      });
  }

  window.sendQuery = sendQuery;

  // ----------------------
  // DRAG & DROP UPLOAD
  // ----------------------
  ["dragenter", "dragover"].forEach(event => {
    document.addEventListener(event, e => {
      e.preventDefault();
      dropOverlay.classList.add("active");
    });
  });

  document.addEventListener("dragleave", e => {
    if (e.clientX === 0 && e.clientY === 0) {
      dropOverlay.classList.remove("active");
    }
  });

  document.addEventListener("drop", e => {
    e.preventDefault();
    dropOverlay.classList.remove("active");

    const files = e.dataTransfer.files;
    if (!files.length) return;

    const fileInput = document.getElementById("file");
    fileInput.files = files;

    uploadFile();
  });

});
