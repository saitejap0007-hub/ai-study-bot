import re
from typing import List, Dict, Any
from backend.database import get_db_connection

DEFAULT_CHUNK_SIZE = 1200
DEFAULT_CHUNK_OVERLAP = 200

def split_text_into_chunks(text: str, page_number: int = 1, chunk_size: int = DEFAULT_CHUNK_SIZE, overlap: int = DEFAULT_CHUNK_OVERLAP) -> List[Dict[str, Any]]:
    """Splits a block of text into context-preserving overlapping chunks."""
    if not text or not text.strip():
        return []
        
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [text.strip()]
        
    chunks = []
    current_chunk = ""
    
    for para in paragraphs:
        if len(current_chunk) + len(para) + 2 <= chunk_size:
            current_chunk = f"{current_chunk}\n\n{para}".strip() if current_chunk else para
        else:
            if current_chunk:
                chunks.append(current_chunk)
                # Take overlap from end of current chunk
                overlap_text = current_chunk[-overlap:] if len(current_chunk) > overlap else current_chunk
                current_chunk = f"{overlap_text}\n\n{para}".strip()
            else:
                # Paragraph itself is larger than chunk_size, split by sentences
                sentences = re.split(r'(?<=[.!?])\s+', para)
                for s in sentences:
                    if len(current_chunk) + len(s) + 1 <= chunk_size:
                        current_chunk = f"{current_chunk} {s}".strip() if current_chunk else s
                    else:
                        if current_chunk:
                            chunks.append(current_chunk)
                            overlap_text = current_chunk[-overlap:] if len(current_chunk) > overlap else current_chunk
                            current_chunk = f"{overlap_text} {s}".strip()
                        else:
                            chunks.append(s[:chunk_size])
                            current_chunk = s[chunk_size - overlap:] if len(s) > chunk_size else ""
                            
    if current_chunk:
        chunks.append(current_chunk)
        
    results = []
    for c in chunks:
        clean_c = c.strip()
        if clean_c:
            results.append({
                "page_number": page_number,
                "content": clean_c,
                "char_count": len(clean_c),
                "token_count_approx": max(1, len(clean_c) // 4)
            })
    return results

def chunk_and_store_document(material_id: int, pages_data: List[Dict[str, Any]], full_text: str = None) -> List[Dict[str, Any]]:
    """Generates chunks from pages_data and stores them in document_chunks table."""
    all_chunks = []
    
    if pages_data and len(pages_data) > 0:
        for p in pages_data:
            p_num = p.get("page_number", 1)
            p_text = p.get("text", "")
            page_chunks = split_text_into_chunks(p_text, page_number=p_num)
            all_chunks.extend(page_chunks)
    elif full_text:
        all_chunks = split_text_into_chunks(full_text, page_number=1)
        
    if not all_chunks and full_text:
        all_chunks.append({
            "page_number": 1,
            "content": full_text[:DEFAULT_CHUNK_SIZE],
            "char_count": len(full_text[:DEFAULT_CHUNK_SIZE]),
            "token_count_approx": max(1, len(full_text[:DEFAULT_CHUNK_SIZE]) // 4)
        })
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Delete old chunks for this material
    cursor.execute("DELETE FROM document_chunks WHERE material_id = ?", (material_id,))
    
    saved_chunks = []
    for idx, c in enumerate(all_chunks):
        cursor.execute(
            """INSERT INTO document_chunks 
            (material_id, chunk_index, page_number, content, char_count, token_count_approx)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (
                material_id,
                idx,
                c["page_number"],
                c["content"],
                c["char_count"],
                c["token_count_approx"]
            )
        )
        chunk_id = cursor.lastrowid
        c_copy = dict(c)
        c_copy["id"] = chunk_id
        c_copy["chunk_index"] = idx
        c_copy["material_id"] = material_id
        saved_chunks.append(c_copy)
        
    # Update materials table chunk_count
    cursor.execute(
        "UPDATE materials SET chunk_count = ? WHERE id = ?",
        (len(saved_chunks), material_id)
    )
    
    conn.commit()
    conn.close()
    return saved_chunks

def get_document_chunks(material_id: int) -> List[Dict[str, Any]]:
    """Retrieves all stored chunks for a material."""
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT * FROM document_chunks WHERE material_id = ? ORDER BY chunk_index ASC",
        (material_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def search_chunks(material_id: int, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """Retrieves top_k most relevant chunks using BM25/keyword scoring."""
    chunks = get_document_chunks(material_id)
    if not chunks:
        return []
        
    words = re.findall(r'\b[A-Za-z0-9]{3,}\b', query.lower())
    if not words:
        return chunks[:top_k]
        
    scored = []
    for c in chunks:
        content_lower = c["content"].lower()
        score = 0
        for w in words:
            # Term frequency in chunk
            count = len(re.findall(r'\b' + re.escape(w) + r'\b', content_lower))
            if count > 0:
                score += (1 + 0.5 * count)
        if score > 0:
            scored.append((score, c))
            
    scored.sort(key=lambda x: x[0], reverse=True)
    if scored:
        return [item[1] for item in scored[:top_k]]
    return chunks[:top_k]

def get_representative_chunks(material_id: int, max_chunks: int = 8) -> List[Dict[str, Any]]:
    """Samples chunks evenly across document for comprehensive coverage."""
    chunks = get_document_chunks(material_id)
    if not chunks or len(chunks) <= max_chunks:
        return chunks
        
    total = len(chunks)
    step = total / max_chunks
    selected_indices = [int(i * step) for i in range(max_chunks)]
    return [chunks[i] for i in selected_indices if i < total]
