import os
import re
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

MAX_FILE_SIZE_MB = int(os.environ.get("MAX_UPLOAD_SIZE_MB", 50))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

def validate_file_integrity(file_path: str) -> Dict[str, Any]:
    """Validates file existence, size, readability, and magic bytes."""
    if not os.path.exists(file_path):
        raise FileNotFoundError("Uploaded file could not be found on server.")
    
    file_size = os.path.getsize(file_path)
    if file_size == 0:
        raise ValueError("The uploaded file is empty (0 bytes). Please upload a valid document.")
    
    if file_size > MAX_FILE_SIZE_BYTES:
        raise ValueError(f"File size ({file_size / (1024*1024):.1f} MB) exceeds the maximum allowed limit of {MAX_FILE_SIZE_MB} MB.")
    
    ext = os.path.splitext(file_path)[1].lower()
    
    # Check headers / magic bytes
    with open(file_path, "rb") as f:
        header = f.read(1024)
        
    if ext == ".pdf":
        if b"%PDF-" not in header:
            # Some PDFs have garbage bytes before header; look further in first 1KB
            raise ValueError("The uploaded file does not appear to be a valid PDF document (missing PDF signature).")
    elif ext in [".docx", ".doc"]:
        if not header.startswith(b"PK\x03\x04") and not header.startswith(b"\xd0\xcf\x11\xe0"):
            raise ValueError("The uploaded file does not appear to be a valid Word document.")
            
    return {"valid": True, "file_size": file_size, "extension": ext}

def clean_extracted_text(text: str) -> str:
    """Cleans text while preserving headings, paragraphs, and lists."""
    if not text:
        return ""
    
    # Normalize line endings
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    
    # Strip non-printable control characters except standard whitespace
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    
    # Replace non-breaking spaces
    text = text.replace("\xa0", " ")
    
    # Collapse multiple spaces and tabs (not newlines)
    text = re.sub(r'[ \t]+', ' ', text)
    
    # Collapse 3+ consecutive newlines to 2 (preserve paragraph separation)
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    lines = [line.strip() for line in text.split("\n")]
    cleaned = "\n".join(lines).strip()
    return cleaned

def _extract_pdf_pymupdf(file_path: str) -> Dict[str, Any]:
    """Primary PDF extractor: PyMuPDF. Extremely resilient to damaged/truncated streams."""
    import pymupdf
    
    doc = pymupdf.open(file_path)
    page_count = len(doc)
    pages_data = []
    text_parts = []
    
    for idx in range(page_count):
        try:
            page = doc[idx]
            page_text = page.get_text("text") or ""
            clean_page = clean_extracted_text(page_text)
            pages_data.append({
                "page_number": idx + 1,
                "text": clean_page,
                "char_count": len(clean_page)
            })
            if clean_page:
                text_parts.append(clean_page)
        except Exception as pe:
            logger.warning(f"PyMuPDF page {idx + 1} extraction warning: {pe}")
            pages_data.append({
                "page_number": idx + 1,
                "text": "",
                "char_count": 0
            })
            
    doc.close()
    full_text = "\n\n".join(text_parts)
    return {
        "text": full_text,
        "page_count": page_count,
        "pages_data": pages_data
    }

def _extract_pdf_pypdf(file_path: str) -> Dict[str, Any]:
    """Secondary PDF extractor: pypdf with strict=False and per-page isolation."""
    from pypdf import PdfReader
    
    reader = PdfReader(file_path, strict=False)
    page_count = len(reader.pages)
    pages_data = []
    text_parts = []
    
    for idx, page in enumerate(reader.pages):
        page_str = ""
        try:
            page_str = page.extract_text() or ""
        except Exception as pe:
            logger.warning(f"pypdf page {idx + 1} stream warning: {pe}")
            
        clean_page = clean_extracted_text(page_str)
        pages_data.append({
            "page_number": idx + 1,
            "text": clean_page,
            "char_count": len(clean_page)
        })
        if clean_page:
            text_parts.append(clean_page)
            
    full_text = "\n\n".join(text_parts)
    return {
        "text": full_text,
        "page_count": page_count,
        "pages_data": pages_data
    }

def _extract_pdf_salvage(file_path: str) -> Dict[str, Any]:
    """Tertiary salvage extractor: extracts raw textual streams from damaged PDF."""
    text_chunks = []
    with open(file_path, "rb") as f:
        content = f.read().decode("latin-1", errors="ignore")
    
    # Look for literal string text operations in PDF streams: (text) Tj or [(t)(e)(x)(t)] TJ
    tj_matches = re.findall(r'\(([^()]{2,200})\)\s*Tj', content)
    if tj_matches:
        text_chunks.extend(tj_matches)
        
    recovered = clean_extracted_text(" ".join(text_chunks))
    return {
        "text": recovered,
        "page_count": 1,
        "pages_data": [{"page_number": 1, "text": recovered, "char_count": len(recovered)}]
    }

def extract_from_pdf(file_path: str) -> Dict[str, Any]:
    """Resilient multi-engine PDF extraction with fallback mechanisms."""
    errors = []
    
    # 1. Try PyMuPDF
    try:
        res = _extract_pdf_pymupdf(file_path)
        if len(res["text"].strip()) > 0:
            return res
        # If PyMuPDF returned 0 text, check if pypdf gets anything or if it's scanned
        if res["page_count"] > 0:
            return res
    except Exception as e:
        errors.append(f"PyMuPDF: {str(e)}")
        
    # 2. Try pypdf fallback
    try:
        res = _extract_pdf_pypdf(file_path)
        if len(res["text"].strip()) > 0:
            return res
        if res["page_count"] > 0:
            return res
    except Exception as e:
        errors.append(f"pypdf: {str(e)}")
        
    # 3. Try raw stream salvage
    try:
        res = _extract_pdf_salvage(file_path)
        if len(res["text"].strip()) > 20:
            return res
    except Exception as e:
        errors.append(f"Salvage: {str(e)}")
        
    error_summary = "; ".join(errors) if errors else "No readable text stream could be found."
    raise ValueError(f"Unable to process this PDF because the file appears to be corrupted or incomplete. Details: {error_summary}")

def extract_from_docx(file_path: str) -> Dict[str, Any]:
    """Extracts text from Word documents including paragraphs and tables."""
    import docx
    
    text_parts = []
    pages_data = []
    try:
        doc = docx.Document(file_path)
        for idx, p in enumerate(doc.paragraphs):
            if p.text and p.text.strip():
                clean_p = clean_extracted_text(p.text)
                text_parts.append(clean_p)
                
        for table in doc.tables:
            for row in table.rows:
                cells = [c.text.strip() for c in row.cells if c.text.strip()]
                if cells:
                    row_str = " | ".join(cells)
                    text_parts.append(row_str)
                    
        full_text = "\n\n".join(text_parts)
        pages_data.append({
            "page_number": 1,
            "text": full_text,
            "char_count": len(full_text)
        })
        return {
            "text": full_text,
            "page_count": 1,
            "pages_data": pages_data
        }
    except Exception as e:
        raise ValueError(f"Failed to extract text from Word document: {str(e)}")

def extract_from_txt(file_path: str) -> Dict[str, Any]:
    """Extracts text from TXT/MD files with robust multi-encoding detection."""
    encodings = ["utf-8", "utf-8-sig", "latin-1", "cp1252", "utf-16"]
    for enc in encodings:
        try:
            with open(file_path, "r", encoding=enc) as f:
                raw_text = f.read()
            clean_text = clean_extracted_text(raw_text)
            return {
                "text": clean_text,
                "page_count": 1,
                "pages_data": [{"page_number": 1, "text": clean_text, "char_count": len(clean_text)}]
            }
        except UnicodeDecodeError:
            continue
        except Exception as e:
            raise ValueError(f"Failed to read text file: {str(e)}")
            
    raise ValueError("Could not decode text file with supported encodings.")

def extract_document(file_path: str) -> Dict[str, Any]:
    """Master document processing entry point. Validates, extracts, cleans, and analyzes."""
    val = validate_file_integrity(file_path)
    ext = val["extension"]
    
    if ext == ".pdf":
        raw_result = extract_from_pdf(file_path)
    elif ext in [".docx", ".doc"]:
        raw_result = extract_from_docx(file_path)
    elif ext in [".txt", ".md", ".csv", ".json", ".rtf"]:
        raw_result = extract_from_txt(file_path)
    else:
        raw_result = extract_from_txt(file_path)
        
    cleaned_text = clean_extracted_text(raw_result.get("text", ""))
    page_count = max(1, raw_result.get("page_count", 1))
    pages_data = raw_result.get("pages_data", [])
    char_count = len(cleaned_text)
    word_count = len(re.findall(r'\b\w+\b', cleaned_text))
    
    # Scanned PDF / Empty Detection
    is_scanned = False
    status = "ready"
    warning = None
    
    if char_count == 0:
        if page_count > 0 and ext == ".pdf":
            is_scanned = True
            status = "scanned_ocr_required"
            warning = "This PDF appears to contain scanned pages or images. Text extraction requires OCR."
        else:
            status = "empty"
            warning = "The document contains no readable text."
    elif ext == ".pdf" and page_count > 0:
        avg_chars_per_page = char_count / page_count
        if avg_chars_per_page < 30 and page_count > 2:
            is_scanned = True
            status = "scanned_ocr_required"
            warning = f"Very little selectable text extracted ({char_count} chars across {page_count} pages). Some pages may be scanned images."
            
    return {
        "text": cleaned_text,
        "page_count": page_count,
        "pages_data": pages_data,
        "char_count": char_count,
        "word_count": word_count,
        "status": status,
        "is_scanned": is_scanned,
        "warning": warning,
        "file_size": val["file_size"]
    }

# Backward compatibility alias
def extract_text(file_path: str) -> str:
    res = extract_document(file_path)
    return res["text"]
