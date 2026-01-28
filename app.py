import os
from flask import Flask, render_template, request, jsonify
from pypdf import PdfReader
import docx
import pandas as pd

from langchain.llms import Ollama
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.vectorstores import FAISS
from langchain.embeddings import OllamaEmbeddings




# -----------------------
# CONFIG
# -----------------------
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(
    __name__,
    template_folder="frontend/templates",
    static_folder="frontend/static"
)
vectorstore = None


# -----------------------
# FILE TEXT EXTRACTOR
# -----------------------
def extract_text(filepath):
    ext = filepath.split(".")[-1].lower()
    text = ""

    try:
        if ext == "pdf":
            reader = PdfReader(filepath)
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"

        elif ext == "docx":
            doc = docx.Document(filepath)
            for p in doc.paragraphs:
                text += p.text + "\n"

        elif ext == "xlsx":
            df = pd.read_excel(filepath)
            text = df.to_string()

    except Exception as e:
        print("Extraction error:", e)

    return text.strip()


# -----------------------
# VECTOR STORE BUILDER
# -----------------------
def create_vector_store(text, model_name):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50
    )

    chunks = splitter.split_text(text)

    embeddings = OllamaEmbeddings(model=model_name)
    vectorstore = FAISS.from_texts(chunks, embedding=embeddings)

    return vectorstore


# -----------------------
# ROUTES
# -----------------------
@app.route("/")
def home():
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload_file():
    global vectorstore

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    model = request.form.get("model", "llama3")

    filepath = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(filepath)

    text = extract_text(filepath)

    if not text:
        return jsonify({"error": "Could not extract text from file"}), 400

    vectorstore = create_vector_store(text, model)

    return jsonify({"message": "File processed and indexed successfully!"})


@app.route("/chat", methods=["POST"])
def chat():
    global vectorstore

    if vectorstore is None:
        return jsonify({"error": "Upload a file first"}), 400

    data = request.get_json()
    query = data.get("query")
    model = data.get("model", "llama3")

    docs = vectorstore.similarity_search(query, k=3)
    context = "\n".join([d.page_content for d in docs])

    llm = Ollama(model=model)

    prompt = f"""
You are a document-based assistant.
Answer ONLY using the context below.

Context:
{context}

Question:
{query}
"""

    answer = llm.invoke(prompt)

    return jsonify({"response": answer})


# -----------------------
# MAIN
# -----------------------
if __name__ == "__main__":
    app.run(debug=True)
