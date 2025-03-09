from flask import Flask, request, jsonify, session
from flask_cors import CORS
from flask_session import Session
import pytesseract
from PIL import Image
import cv2
import numpy as np
import hashlib
import requests
import fitz
import os
import json
import re
from web3 import Web3
from dotenv import load_dotenv
import traceback

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["http://localhost:3000", "http://127.0.0.1:3000"])

# Flask session configuration
app.config['SESSION_TYPE'] = 'filesystem'
app.secret_key = os.getenv("FLASK_SECRET_KEY")
Session(app)

# Blockchain & IPFS Configuration
ganache_url = os.getenv("GANACHE_URL")
web3 = Web3(Web3.HTTPProvider(ganache_url))
contract_address = os.getenv("CONTRACT_ADDRESS")
admin_private_key = os.getenv("ADMIN_PRIVATE_KEY")
admin_address = os.getenv("ADMIN_ADDRESS")
PINATA_API_KEY = os.getenv("PINATA_API_KEY")
PINATA_SECRET_KEY = os.getenv("PINATA_SECRET_KEY")

# Load contract ABI
with open("contract_abi.json", "r") as file:
    abi = json.load(file)
contract = web3.eth.contract(address=contract_address, abi=abi)

# Tesseract OCR Path
pytesseract.pytesseract.tesseract_cmd = os.getenv("TESSERACT_PATH")

print(f"Contract Address: {contract_address}")
print(f"Contract ABI: {json.dumps(abi)}")

# Improved text extraction with better preprocessing
def extract_text_from_image(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
    return pytesseract.image_to_string(thresh, config="--psm 6")

def extract_text_from_pdf(pdf_path):
    text = ""
    try:
        with fitz.open(pdf_path) as pdf_document:
            for page in pdf_document:
                text += page.get_text("text") + "\n"
        return text.strip()
    except Exception as e:
        app.logger.error(f"PDF extraction error: {str(e)}")
        return ""

# Enhanced regex patterns
def extract_certificate_details(text):
    details = {}
    try:
        # Name extraction with improved pattern
        name_match = re.search(
            r"Certified that\s+(?:Mr\.?|Ms\.?|Mrs\.?)?\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,2})",
            text, 
            re.IGNORECASE
        )
        
        # Registration number with strict format
        register_number_match = re.search(
            r"Register\s*Number\s*[:\-]?\s*([A-Z0-9]{8,12})",
            text,
            re.IGNORECASE
        )
        
        # Date parsing with month validation
        passing_date_match = re.search(
            r"(?:Month\s*&\s*Year\s*of\s*Passing|Date\s*of\s*Passing)\s*[:\-]?\s*([A-Z]+-\d{4})",
            text,
            re.IGNORECASE
        )
        
        # College name with boundary checks
        college_match = re.search(
            r"College\s*of\s*Study\s*[:\-]?\s*((?:[A-Z][A-Za-z]+\s*){2,5})(?=\n|$)",
            text,
            re.IGNORECASE
        )
        
        # CGPA with decimal validation
        cgpa_match = re.search(
            r"Cumulative\s*Grade\s*Point\s*Average\s*\(CGPA\)\s*[:\-]?\s*(\d{1}\.\d{2})",
            text,
            re.IGNORECASE
        )

        details['name'] = name_match.group(1).strip() if name_match else "Not Found"
        details['register_number'] = register_number_match.group(1).strip() if register_number_match else "Not Found"
        details['passing_date'] = passing_date_match.group(1).strip() if passing_date_match else "Not Found"
        details['college'] = college_match.group(1).strip() if college_match else "Not Found"
        details['cgpa'] = cgpa_match.group(1).strip() if cgpa_match else "Not Found"
        
    except Exception as e:
        app.logger.error(f"Extraction error: {str(e)}")
    
    return details

def generate_metadata_hash(metadata):
    hash_string = f"{metadata['name']}{metadata['register_number']}{metadata['passing_date']}{metadata['college']}{metadata['cgpa']}"
    return hashlib.sha256(hash_string.encode()).hexdigest()

@app.route('/upload', methods=['POST'])
def upload():
    try:
        file = request.files.get('certificate')
        if not file:
            return jsonify({"error": "No file selected"}), 400

        # Temporary file handling
        temp_path = f"temp_{file.filename}"
        file.save(temp_path)
        
        if file.filename.lower().endswith('.pdf'):
            extracted_text = extract_text_from_pdf(temp_path)
        else:
            img = Image.open(temp_path)
            img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
            extracted_text = extract_text_from_image(img_cv)
        
        os.remove(temp_path)
        
        certificate_details = extract_certificate_details(extracted_text)
        metadata_hash = generate_metadata_hash(certificate_details)
        
        session['certificateDetails'] = certificate_details
        session['metadataHash'] = metadata_hash
        
        return jsonify({**certificate_details, "metadata_hash": metadata_hash})
    
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/upload_to_ipfs', methods=['POST'])
def upload_to_ipfs():
    try:
        file = request.files.get('certificate')
        if not file:
            return jsonify({"error": "No file selected"}), 400
        
        files = {'file': (file.filename, file.stream, file.mimetype)}
        headers = {
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_SECRET_KEY
        }
        
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
    try:
        data = request.json
        metadata_hash = data.get("metadata_hash")
        ipfs_cid = data.get("cid")

        # Validate inputs
        if not metadata_hash or not ipfs_cid:
            return jsonify({"error": "Missing required fields"}), 400

        # Validate metadata hash format (ensure it's a valid SHA-256 hash)
        if not re.fullmatch(r'^[a-fA-F0-9]{64}$', metadata_hash):
            return jsonify({"error": "Invalid metadata hash format"}), 400

        # Validate IPFS CID (simple length check for now)
        if not ipfs_cid or not isinstance(ipfs_cid, str) or len(ipfs_cid) < 46:
            return jsonify({"error": "Invalid IPFS CID"}), 400

        # Convert hash to bytes
        try:
            hash_bytes = bytes.fromhex(metadata_hash)
        except ValueError:
            return jsonify({"error": "Invalid metadata hash format"}), 400

        # Build transaction
        nonce = web3.eth.get_transaction_count(admin_address)
        print(f"Nonce: {nonce}")

        gas_price = web3.eth.gas_price  # Get current gas price from the network
        estimated_gas = contract.functions.storeCertificate(ipfs_cid, hash_bytes).estimate_gas()
        
        txn = contract.functions.storeCertificate(ipfs_cid, hash_bytes).build_transaction({
            'chainId': web3.eth.chain_id,
            'gas': estimated_gas,
            'gasPrice': gas_price,
            'nonce': nonce,
        })

        # Sign and send
        signed_txn = web3.eth.account.sign_transaction(txn, admin_private_key)
        tx_hash = web3.eth.send_raw_transaction(signed_txn.rawTransaction)
        print(f"Transaction hash: {tx_hash.hex()}")  # Log the transaction hash
        receipt = web3.eth.wait_for_transaction_receipt(tx_hash)
        print(f"Receipt: {receipt}")  # Log the full receipt

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
    try:
        metadata_hash = request.json.get("metadata_hash")
        
        if not metadata_hash:
            return jsonify({"error": "Metadata hash required"}), 400

        if not re.fullmatch(r'^[a-fA-F0-9]{64}$', metadata_hash):
            return jsonify({"error": "Invalid hash format"}), 400

        try:
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
    app.run(debug=True)
