# Chatbot Anyfile

A simple web-based chatbot application that allows users to upload files and interact with a chatbot interface. Built with Python (Flask) for the backend and a modern JavaScript/CSS frontend.

## Features
- Upload files and interact with a chatbot
- Clean, responsive frontend UI
- File uploads stored securely in the `uploads/` directory
- Easy to run locally

## Project Structure
```
chatbot-anyfile/
│
├── app.py                  # Flask backend application
├── frontend/
│   ├── static/
│   │   ├── css/
│   │   │   └── style.css   # Frontend styles
│   │   └── js/
│   │       └── app.js      # Frontend JavaScript
│   └── templates/
│       └── index.html      # Main HTML template
├── uploads/                # Uploaded files (auto-created)
└── .gitignore              # Git ignore rules
```

## Getting Started

### Prerequisites
- Python 3.8+
- pip

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/agarwalaman598/chatbot-anyfile.git
   cd chatbot-anyfile
   ```
2. (Optional) Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Running the App
1. Start the Flask server:
   ```bash
   python app.py
   ```
2. Open your browser and go to `http://localhost:5000`

### Frontend
- Static assets are in `frontend/static/`
- Main HTML template is in `frontend/templates/`

## Usage
- Upload a file using the web interface
- Interact with the chatbot as needed

## License
This project is licensed under the MIT License.

## Author
- [Aman Agarwal](https://github.com/agarwalaman598)
