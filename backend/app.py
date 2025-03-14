
from flask import Flask, request, jsonify, session  # Flask web framework components
from flask_cors import CORS  # Handle Cross-Origin Resource Sharing
from flask_session import Session  # Server-side session management
from requests_toolbelt import MultipartEncoder
from requests_toolbelt.multipart.encoder import MultipartEncoder
import pytesseract  # OCR library for text extraction
from PIL import Image  # Image processing
import cv2  # OpenCV for computer vision tasks
import numpy as np  # Numerical operations
import hashlib  # Cryptographic hashing
import requests  # HTTP requests for IPFS upload
import fitz  # PyMuPDF for PDF handling
import os  # OS operations
import json  # JSON handling
import re  # Regular expressions
from web3 import Web3  # Ethereum blockchain interaction
from dotenv import load_dotenv  # Environment variables management
import traceback  # Error stack traces
import base64
import io

# Load environment variables from .env file
load_dotenv()

# Initialize Flask application
app = Flask(__name__)
# Configure CORS to allow requests from frontend with credentials
CORS(app, supports_credentials=True, origins=["http://localhost:3000", "http://127.0.0.1:3000"])

# Configure server-side sessions
app.config['SESSION_TYPE'] = 'filesystem'  # Store sessions in filesystem
app.secret_key = os.getenv("FLASK_SECRET_KEY")  # Secret key from environment
Session(app)  # Initialize session management

# Blockchain configuration
ganache_url = os.getenv("GANACHE_URL")  # Local Ethereum node URL
web3 = Web3(Web3.HTTPProvider(ganache_url))  # Connect to blockchain node
contract_address = os.getenv("CONTRACT_ADDRESS")  # Smart contract address
admin_private_key = os.getenv("ADMIN_PRIVATE_KEY")  # Admin account private key
admin_address = os.getenv("ADMIN_ADDRESS")  # Admin account address
PINATA_API_KEY = os.getenv("PINATA_API_KEY")  # IPFS Pinata API key
PINATA_SECRET_KEY = os.getenv("PINATA_SECRET_KEY")  # IPFS Pinata secret key

# Load smart contract ABI (Application Binary Interface)
with open("contract_abi.json", "r") as file:
    abi = json.load(file)
# Create contract instance
contract = web3.eth.contract(address=contract_address, abi=abi)

# Configure Tesseract OCR executable path
pytesseract.pytesseract.tesseract_cmd = os.getenv("TESSERACT_PATH")

# Image processing and text extraction functions
def extract_text_from_image(image):
    """Extract text from image using OCR with preprocessing"""
    # Convert to grayscale for better OCR accuracy
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    # Reduce noise using Gaussian blur
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    # Adaptive thresholding to binarize image
    thresh = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
    # Use Tesseract with page segmentation mode 6 (single uniform block)
    return pytesseract.image_to_string(thresh, config="--psm 6")

def extract_text_from_pdf(pdf_path):
    """Extract text from PDF document"""
    text = ""
    try:
        # Open PDF using PyMuPDF
        with fitz.open(pdf_path) as pdf_document:
            for page in pdf_document:
                # Extract text from each page
                text += page.get_text("text") + "\n"
        return text.strip()
    except Exception as e:
        app.logger.error(f"PDF extraction error: {str(e)}")
        return ""




def extract_certificate_details(text):
    """Extract structured data from certificate text using regex patterns"""
    details = {}
    try:
        # Name extraction (completely removes 'Mr.', 'Ms.', 'Mrs.')
        name_match = re.search(
            r"Certified that\s+(?:Mr\.?|Ms\.?|Mrs\.?)?\s*([\w\s'-]+?)(?=\s+has\s+passed)",
            text, 
            re.IGNORECASE
        )
        
        # Registration number pattern (handles spaces or separators)
        register_number_match = re.search(
            r"Register\s*Number\s*[:\-]?\s*([\w\d-]+)",
            text,
            re.IGNORECASE
        )
        
        # Date pattern (Handles Month-Year format)
        passing_date_match = re.search(
            r"(?:Month\s*&\s*Year\s*of\s*Passing|Date\s*of\s*Passing)\s*[:\-]?\s*([\w-]+)",
            text,
            re.IGNORECASE
        )
        
        # College name pattern (Stops extraction at newline or CGPA section)
        college_match = re.search(
            r"College\s*of\s*Study\s*[:\-]?\s*([\w\s&.,'-]+?)(?=\s*Cumulative|$)",
            text,
            re.IGNORECASE
        )
        
        # CGPA pattern (Handles both integers & decimals)
        cgpa_match = re.search(
            r"Cumulative\s*Grade\s*Point\s*Average\s*\(CGPA\)\s*[:\-]?\s*(\d{1,2}(?:\.\d{1,2})?)",
            text,
            re.IGNORECASE
        )

        # Populate details dictionary with extracted data
        details['name'] = name_match.group(1).strip() if name_match else "Not Found"
        details['register_number'] = register_number_match.group(1).strip() if register_number_match else "Not Found"
        details['passing_date'] = passing_date_match.group(1).strip() if passing_date_match else "Not Found"
        details['college'] = college_match.group(1).strip() if college_match else "Not Found"
        details['cgpa'] = cgpa_match.group(1).strip() if cgpa_match else "Not Found"
        
        # Extra Fix: Remove "Ms" if it still appears at the start of the name
        details['name'] = re.sub(r"^\s*(Ms\.?|Mr\.?|Mrs\.?)\s*", "", details['name'], flags=re.IGNORECASE)

    except Exception as e:
        print(f"Extraction error: {str(e)}")
    
    return details


def generate_metadata_hash(metadata):
    """Generate SHA-256 hash of certificate metadata"""
    # Concatenate all metadata fields
    hash_string = f"{metadata['name']}{metadata['register_number']}{metadata['passing_date']}{metadata['college']}{metadata['cgpa']}"
    # Return hexadecimal digest
    return hashlib.sha256(hash_string.encode()).hexdigest()


@app.route('/api/abi', methods=['GET'])
def get_abi():
    """Serve contract ABI to frontend"""
    try:
        with open("contract_abi.json", "r") as file:
            return jsonify(json.load(file))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/config', methods=['GET'])
def get_config():
    """Serve blockchain configuration to frontend"""
    return jsonify({
        "contractAddress": os.getenv("CONTRACT_ADDRESS"),
        "adminAddress": os.getenv("ADMIN_ADDRESS")
    })


# Flask routes
@app.route('/upload', methods=['POST'])
def upload():
    """Handle certificate file upload and data extraction"""
    try:
        file = request.files.get('certificate')
        if not file:
            return jsonify({"error": "No file selected"}), 400

        # Save temporary file
        temp_path = f"temp_{file.filename}"
        file.save(temp_path)
        
        # Process based on file type
        if file.filename.lower().endswith('.pdf'):
            extracted_text = extract_text_from_pdf(temp_path)
        else:
            # Open image and convert to OpenCV format
            img = Image.open(temp_path)
            img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
            extracted_text = extract_text_from_image(img_cv)
        
        # Clean up temporary file
        os.remove(temp_path)
        
        # Extract details and generate hash
        certificate_details = extract_certificate_details(extracted_text)
        metadata_hash = generate_metadata_hash(certificate_details)
        
        # Store in server-side session
        session['certificateDetails'] = certificate_details
        session['metadataHash'] = metadata_hash
        
        return jsonify({**certificate_details, "metadata_hash": metadata_hash})
    
    except Exception as e:
        traceback.print_exc()  # Print detailed error trace
        return jsonify({"error": str(e)}), 500

@app.route('/api/upload-ipfs', methods=['POST'])
def upload_to_ipfs():
    """Handle IPFS uploads through backend"""
    try:
        data = request.json
        if not data or not data.get('file'):
            return jsonify({"error": "No file data provided"}), 400

        # Decode base64 file
        file_data = data['file'].split(',')[1]
        file_bytes = base64.b64decode(file_data)

        # Create proper multipart form data
        form_data = MultipartEncoder(
            fields={
                'file': ('filename', io.BytesIO(file_bytes), data.get('filetype', 'application/octet-stream'))
            }
        )

        headers = {
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_SECRET_KEY,
            'Content-Type': form_data.content_type  # Required for multipart form-data
        }

        response = requests.post(
            "https://api.pinata.cloud/pinning/pinFileToIPFS",
            data=form_data,
            headers=headers
        )

        if response.status_code != 200:
            return jsonify({"error": f"IPFS upload failed: {response.text}"}), 500

        return jsonify({"cid": response.json().get("IpfsHash")})

    except Exception as e:
        app.logger.error(f"IPFS upload error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/store_on_blockchain', methods=['POST'])
def store_on_blockchain():
    """Verify and store transaction hash in backend"""
    try:
        data = request.json
        tx_hash = data.get("txHash")
        metadata_hash = data.get("metadataHash")
        ipfs_cid = data.get("cid")

        if not tx_hash or not metadata_hash or not ipfs_cid:
            return jsonify({"error": "Missing required fields"}), 400

        # Validate SHA-256 format (bytes32)
        if not re.fullmatch(r'^0x[a-fA-F0-9]{64}$', metadata_hash):
            return jsonify({"error": "Invalid metadata hash format"}), 400

        # Verify transaction exists on blockchain
        receipt = web3.eth.get_transaction_receipt(tx_hash)
        if not receipt:
            return jsonify({"error": "Transaction not found on blockchain"}), 400

        return jsonify({"success": True, "txHash": tx_hash}), 200

    except Exception as e:
        app.logger.error(f"Blockchain storage error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/verify', methods=['POST', 'OPTIONS'])
def verify_certificate():
    """Verify certificate existence on blockchain"""

    # Handle preflight request (CORS)
    if request.method == 'OPTIONS':
        return '', 200  # Respond OK for preflight requests

    try:
        metadata_hash = request.json.get("metadata_hash")

        if not metadata_hash:
            return jsonify({"error": "Metadata hash required"}), 400

        try:
            # Convert hash to bytes32 format
            hash_bytes = bytes.fromhex(metadata_hash.replace("0x", ""))  # Remove 0x prefix if present

            cid = contract.functions.getCertificate(hash_bytes).call()

            if cid and cid.strip():
                return jsonify({
                    "valid": True,
                    "cid": cid,
                    "message": "Certificate verified successfully"
                })
            else:
                return jsonify({"valid": False, "message": "Certificate not found"}), 404
                
        except Exception as e:
            print(f"Contract call failed: {str(e)}")  # Debugging log
            return jsonify({"error": "Blockchain query failed"}), 500

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True)  # Start development server
