# Import required libraries
from flask import Flask, request, jsonify, session  # Flask web framework components
from flask_cors import CORS  # Handle Cross-Origin Resource Sharing
from flask_session import Session  # Server-side session management
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
        # Name extraction pattern (handles titles like Mr/Ms)
        name_match = re.search(
            r"Certified that\s+(?:Mr\.?|Ms\.?|Mrs\.?)?\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,2})",
            text, 
            re.IGNORECASE
        )
        
        # Registration number pattern (alphanumeric 8-12 characters)
        register_number_match = re.search(
            r"Register\s*Number\s*[:\-]?\s*([A-Z0-9]{8,12})",
            text,
            re.IGNORECASE
        )
        
        # Date pattern (Month-Year format)
        passing_date_match = re.search(
            r"(?:Month\s*&\s*Year\s*of\s*Passing|Date\s*of\s*Passing)\s*[:\-]?\s*([A-Z]+-\d{4})",
            text,
            re.IGNORECASE
        )
        
        # College name pattern (2-5 capitalized words)
        college_match = re.search(
            r"College\s*of\s*Study\s*[:\-]?\s*((?:[A-Z][A-Za-z]+\s*){2,5})(?=\n|$)",
            text,
            re.IGNORECASE
        )
        
        # CGPA pattern (decimal format X.XX)
        cgpa_match = re.search(
            r"Cumulative\s*Grade\s*Point\s*Average\s*\(CGPA\)\s*[:\-]?\s*(\d{1}\.\d{2})",
            text,
            re.IGNORECASE
        )

        # Populate details dictionary with matches
        details['name'] = name_match.group(1).strip() if name_match else "Not Found"
        details['register_number'] = register_number_match.group(1).strip() if register_number_match else "Not Found"
        details['passing_date'] = passing_date_match.group(1).strip() if passing_date_match else "Not Found"
        details['college'] = college_match.group(1).strip() if college_match else "Not Found"
        details['cgpa'] = cgpa_match.group(1).strip() if cgpa_match else "Not Found"
        
    except Exception as e:
        app.logger.error(f"Extraction error: {str(e)}")
    
    return details

def generate_metadata_hash(metadata):
    """Generate SHA-256 hash of certificate metadata"""
    # Concatenate all metadata fields
    hash_string = f"{metadata['name']}{metadata['register_number']}{metadata['passing_date']}{metadata['college']}{metadata['cgpa']}"
    # Return hexadecimal digest
    return hashlib.sha256(hash_string.encode()).hexdigest()

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

@app.route('/upload_to_ipfs', methods=['POST'])
def upload_to_ipfs():
    """Upload certificate file to IPFS via Pinata"""
    try:
        file = request.files.get('certificate')
        if not file:
            return jsonify({"error": "No file selected"}), 400
        
        # Prepare request for Pinata API
        files = {'file': (file.filename, file.stream, file.mimetype)}
        headers = {
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_SECRET_KEY
        }
        
        # Send to IPFS
        response = requests.post(
            "https://api.pinata.cloud/pinning/pinFileToIPFS",
            files=files,
            headers=headers
        )
        
        return jsonify(response.json()) if response.status_code == 200 else jsonify({"error": "IPFS upload failed"}), 500
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/store_on_blockchain', methods=['POST'])
def store_on_blockchain():
    """Store certificate metadata in blockchain"""
    try:
        data = request.json
        metadata_hash = data.get("metadata_hash")
        ipfs_cid = data.get("cid")

        # Input validation
        if not metadata_hash or not ipfs_cid:
            return jsonify({"error": "Missing required fields"}), 400

        # Validate SHA-256 hash format
        if not re.fullmatch(r'^[a-fA-F0-9]{64}$', metadata_hash):
            return jsonify({"error": "Invalid metadata hash format"}), 400

        # Validate IPFS CID length
        if not ipfs_cid or not isinstance(ipfs_cid, str) or len(ipfs_cid) < 46:
            return jsonify({"error": "Invalid IPFS CID"}), 400

        try:
            # Convert hex string to bytes for blockchain
            hash_bytes = bytes.fromhex(metadata_hash)
        except ValueError:
            return jsonify({"error": "Invalid metadata hash format"}), 400

        # Blockchain transaction setup
        nonce = web3.eth.get_transaction_count(admin_address)
        gas_price = web3.eth.gas_price  # Current network gas price
        estimated_gas = contract.functions.storeCertificate(ipfs_cid, hash_bytes).estimate_gas()
        
        # Build transaction
        txn = contract.functions.storeCertificate(ipfs_cid, hash_bytes).build_transaction({
            'chainId': web3.eth.chain_id,  # Network ID
            'gas': estimated_gas,  # Estimated gas limit
            'gasPrice': gas_price,  # Gas price in wei
            'nonce': nonce,  # Transaction sequence number
        })

        # Sign and send transaction
        signed_txn = web3.eth.account.sign_transaction(txn, admin_private_key)
        tx_hash = web3.eth.send_raw_transaction(signed_txn.rawTransaction)
        # Wait for transaction confirmation
        receipt = web3.eth.wait_for_transaction_receipt(tx_hash)

        if receipt.status == 1:
            return jsonify({
                "message": "Stored on blockchain successfully",
                "tx_hash": tx_hash.hex(),
                "block_number": receipt.blockNumber
            })
        else:
            return jsonify({
                "error": "Transaction failed",
                "tx_hash": tx_hash.hex(),
                "receipt": receipt
            }), 500

    except Exception as e:
        app.logger.error(f"Error in store_on_blockchain: {str(e)}")
        return jsonify({"error": f"Failed to store on blockchain: {str(e)}"}), 500

@app.route('/verify', methods=['POST'])
def verify_certificate():
    """Verify certificate existence on blockchain"""
    try:
        metadata_hash = request.json.get("metadata_hash")
        
        if not metadata_hash:
            return jsonify({"error": "Metadata hash required"}), 400

        # Validate hash format
        if not re.fullmatch(r'^[a-fA-F0-9]{64}$', metadata_hash):
            return jsonify({"error": "Invalid hash format"}), 400

        try:
            # Convert to bytes and query blockchain
            hash_bytes = bytes.fromhex(metadata_hash)
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
            app.logger.error(f"Contract call failed: {str(e)}")
            return jsonify({"error": "Blockchain query failed"}), 500

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)  # Start development server
