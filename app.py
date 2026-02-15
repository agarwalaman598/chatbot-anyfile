import os
import json
import threading
import queue
from flask import Flask, render_template, request, jsonify, Response, stream_with_context
from flask_cors import CORS
from pypdf import PdfReader
import docx
import pandas as pd
from werkzeug.utils import secure_filename

from langchain_community.llms import Ollama
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import OllamaEmbeddings

# ── Config ────────────────────────────────────────────────────────────────────
UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {"pdf", "docx", "xlsx"}
MAX_FILE_SIZE = 50 * 1024 * 1024
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 100

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(
    __name__,
    template_folder="frontend/templates",
    static_folder="frontend/static",
)
CORS(app)
app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_SIZE

vectorstore = None
_embeddings_cache = {}
_llm_cache = {}

# ── Helpers ───────────────────────────────────────────────────────────────────
def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def get_embeddings(model):
    # IMPROVEMENT: Always use a dedicated embedding model.
    # We ignore the 'model' parameter (which is the chat model, e.g., llama3)
    # because chat models make poor embeddings.
    if "nomic-embed-text" not in _embeddings_cache:
        _embeddings_cache["nomic-embed-text"] = OllamaEmbeddings(model="nomic-embed-text")
    return _embeddings_cache["nomic-embed-text"]

def get_llm(model):
    if model not in _llm_cache:
        _llm_cache[model] = Ollama(model=model)
    return _llm_cache[model]

# ── Text Extraction ──────────────────────────────────────────────────────────
def extract_text(filepath, emit):
    ext = filepath.rsplit(".", 1)[-1].lower()
    parts = []

    if ext == "pdf":
        reader = PdfReader(filepath)
        total = len(reader.pages)
        for i, page in enumerate(reader.pages):
            t = page.extract_text()
            if t:
                parts.append(t)
            emit(10 + int((i + 1) / total * 30), f"Extracting page {i+1}/{total}")

    elif ext == "docx":
        emit(15, "Parsing DOCX...")
        doc = docx.Document(filepath)
        for p in doc.paragraphs:
            parts.append(p.text)
        emit(40, "Text extracted")

    elif ext == "xlsx":
        emit(15, "Parsing Excel...")
        df = pd.read_excel(filepath)
        parts.append(df.to_string())
        emit(40, "Text extracted")
    else:
        raise ValueError(f"Unsupported type: {ext}")

    return "\n".join(parts).strip()

# ── Vector Store ─────────────────────────────────────────────────────────────
def build_vectorstore(text, model, emit):
    emit(45, "Chunking text...")
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP
    )
    chunks = splitter.split_text(text)
    if not chunks:
        raise ValueError("No text chunks produced")

    emit(55, f"Embedding {len(chunks)} chunks...")
    
    # This will now use nomic-embed-text regardless of the user's chat model choice
    emb = get_embeddings(model)

    emit(70, "Building vector index...")
    vs = FAISS.from_texts(chunks, embedding=emb)
    emit(95, "Indexing complete")
    return vs

# ── Routes ───────────────────────────────────────────────────────────────────
@app.route("/")
def home():
    return render_template("index.html")

@app.route("/models")
def list_models():
    """Auto-detect available Ollama models."""
    try:
        import subprocess
        out = subprocess.run(["ollama", "list"], capture_output=True, text=True, timeout=5)
        names = []
        for line in out.stdout.strip().splitlines()[1:]:
            n = line.split()[0]
            # Filter out the embedding model from the chat dropdown if you want
            if n and "nomic" not in n and n not in names:
                names.append(n)
        return jsonify({"models": names or ["llama3", "gemma:2b"]})
    except Exception:
        return jsonify({"models": ["llama3", "gemma:2b"]})

@app.route("/upload", methods=["POST"])
def upload_file():
    global vectorstore

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "No file selected"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "Unsupported file type. Upload PDF, DOCX, or XLSX."}), 400

    model = request.form.get("model", "llama3")
    filename = secure_filename(file.filename)
    filepath = os.path.abspath(os.path.join(UPLOAD_FOLDER, filename))

    file.save(filepath)

    q = queue.Queue()
    SENTINEL = object()

    def emit(progress=None, message="", complete=False, error=None):
        d = {}
        if progress is not None: d["progress"] = progress
        if message: d["message"] = message
        if complete: 
            d["complete"] = True
            d["filename"] = filename
        if error: d["error"] = error
        q.put(d)

    def worker():
        global vectorstore
        try:
            emit(10, "Extracting text...")
            text = extract_text(filepath, emit)
            if not text or len(text) < 10:
                emit(error="Could not extract text — file may be empty.")
                return
            vectorstore = build_vectorstore(text, model, emit)
            emit(100, "Successfully indexed! You can now ask questions.", complete=True)
        except Exception as e:
            emit(error=str(e))
        finally:
            q.put(SENTINEL)

    threading.Thread(target=worker, daemon=True).start()

    def stream():
        while True:
            item = q.get()
            if item is SENTINEL: break
            yield f"data: {json.dumps(item)}\n\n"

    resp = Response(stream_with_context(stream()), mimetype="text/event-stream")
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["X-Accel-Buffering"] = "no"
    return resp

@app.route("/chat", methods=["POST"])
def chat():
    global vectorstore
    if vectorstore is None:
        return jsonify({"error": "Upload a file first"}), 400

    data = request.get_json()
    if not data or not data.get("query", "").strip():
        return jsonify({"error": "Empty question"}), 400

    query = data["query"].strip()
    model = data.get("model", "llama3")

    # Similarity search will now work much better due to nomic-embed-text
    docs = vectorstore.similarity_search(query, k=3)
    context = "\n\n".join(d.page_content for d in docs)

    llm = get_llm(model)
    prompt = (
        "You are a helpful document assistant. "
        "Answer ONLY from the context below. Be concise.\n\n"
        f"Context:\n{context}\n\nQuestion: {query}"
    )
    return jsonify({"response": llm.invoke(prompt)})

if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)
