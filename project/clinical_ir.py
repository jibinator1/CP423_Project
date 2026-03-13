import argparse
import json
import math
import os
import re
import tempfile
from collections import Counter
from typing import Any

class BM25Retriever:
    def __init__(self, k1=1.5, b=0.75):
        self.k1 = k1
        self.b = b
        self.corpus: list[dict[str, Any]] = []
        self.doc_len: list[int] = []
        self.avgdl: float = 0.0
        self.df: dict[str, int] = {}
        self.idf: dict[str, float] = {}
        self.N: int = 0

    def tokenize(self, text: str) -> list[str]:
        return re.findall(r'\w+', text.lower())

    def fit(self, corpus: list[dict]):
        self.corpus = corpus
        self.N = len(corpus)
        if self.N == 0: return
        
        TotalLen = 0
        for doc in corpus:
            tokens = self.tokenize(doc.get("content", ""))
            self.doc_len.append(len(tokens))
            TotalLen += len(tokens)
            
            frequencies = Counter(tokens)
            for word in frequencies.keys():
                self.df[word] = self.df.get(word, 0) + 1
                
        self.avgdl = TotalLen / self.N
        
        for word, freq in self.df.items():
            self.idf[word] = math.log((self.N - freq + 0.5) / (freq + 0.5) + 1.0)

    def get_scores(self, query: str) -> list[float]:
        scores = [0.0] * self.N
        if self.N == 0: return scores
            
        q_tokens = self.tokenize(query)
        for i, doc in enumerate(self.corpus):
            doc_tokens = self.tokenize(doc.get("content", ""))
            doc_freqs = Counter(doc_tokens)
            score = 0.0
            for token in q_tokens:
                if token not in doc_freqs: continue
                tf = doc_freqs[token]
                num = tf * (self.k1 + 1)
                den = tf + self.k1 * (1 - self.b + self.b * (self.doc_len[i] / self.avgdl))
                score += self.idf.get(token, 0) * (num / den)
            scores[i] = score
        return scores

from dotenv import load_dotenv
from groq import Groq
from supabase import create_client

# Heavy ML imports (torch, pyannote, sentence_transformers) are deferred
# to ClinicalIRSystem.__init__ to let uvicorn bind the port first.


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


class ClinicalIRSystem:
    def __init__(self) -> None:
        print("--- Initializing Clinical IR System (Python) ---")
        
        # Defer heavy imports so uvicorn can bind the port first on cloud
        import torch as _torch
        import soundfile as _sf
        from sentence_transformers import SentenceTransformer
        from pyannote.audio import Pipeline as _Pipeline
        
        # Make these accessible as module-level aliases for the rest of the class
        globals()['sf'] = _sf
        globals()['torch'] = _torch
        globals()['Pipeline'] = _Pipeline
        globals()['SentenceTransformer'] = SentenceTransformer
        
        self.device = _torch.device("cuda" if _torch.cuda.is_available() else "cpu")

        groq_api_key = _required_env("GROQ_API_KEY")
        supabase_url = _required_env("SUPABASE_URL")
        supabase_key = _required_env("SUPABASE_KEY")
        hf_auth_token = os.getenv("HF_AUTH_TOKEN")

        self.groq_client = Groq(api_key=groq_api_key)
        self.supabase = create_client(supabase_url, supabase_key)
        print("--- Loading SentenceTransformer model... ---")
        self.embed_model = SentenceTransformer("all-MiniLM-L6-v2", device=self.device)
        self.hf_auth_token = hf_auth_token
        self.diarization_pipeline = None
        print("--- Clinical IR System initialized. ---")

    def warmup(self) -> None:
        """Warams up the models in the background to avoid timeouts on first request."""
        print("--- Warming up models... ---")
        try:
            self._ensure_diarization_pipeline()
            print("--- Warmup complete: All models loaded. ---")
        except Exception as e:
            print(f"--- Warmup failed: {e} ---")

    def _ensure_diarization_pipeline(self) -> None:
        if self.diarization_pipeline is None:
            self.diarization_pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-community-1", token=self.hf_auth_token
            ).to(self.device)

    def process_audio_file(self, audio_path: str, role_mapping: dict[str, str], patient_name: str = "") -> None:
        self._ensure_diarization_pipeline()
        print(f"Step 1: Reading {audio_path}...")
        data, samplerate = sf.read(audio_path)
        waveform = torch.tensor(data).float()

        if len(waveform.shape) == 1:
            waveform = waveform.unsqueeze(0)
        elif waveform.shape[0] > waveform.shape[1]:
            waveform = waveform.T

        audio_payload = {"waveform": waveform, "sample_rate": samplerate}

        print("Step 2: Identifying speakers (Diarization)...")
        if self.diarization_pipeline is None:
            raise RuntimeError("Diarization pipeline not initialized")
        diar_output = self.diarization_pipeline(audio_payload)
        diar_segments = []
        for turn, speaker in diar_output.exclusive_speaker_diarization:
            diar_segments.append({"start": turn.start, "end": turn.end, "speaker": speaker})

        print("Step 3: Transcribing with Groq Whisper...")
        with open(audio_path, "rb") as file:
            transcription = self.groq_client.audio.transcriptions.create(
                file=(audio_path, file.read()),
                model="whisper-large-v3",
                response_format="verbose_json",
            )

        print("Step 4: Speaker-aware indexing to Supabase...")
        session_id = os.path.basename(audio_path)
        # Note: when uploading audio, you typically know the patient name upfront, 
        # but here we leave it blank for the generic processor unless passed in.
        for w_seg in transcription.segments:
            midpoint = (w_seg["start"] + w_seg["end"]) / 2
            current_speaker = "UNKNOWN"
            for d_seg in diar_segments:
                if d_seg["start"] <= midpoint <= d_seg["end"]:
                    current_speaker = d_seg["speaker"]
                    break

            role = role_mapping.get(current_speaker, "PATIENT") # Default unknown to PATIENT
            text = w_seg["text"].strip()
            self.index_segment(
                content=text,
                speaker_role=role,
                patient_name=patient_name,
                speaker_label=current_speaker,
                session_id=session_id,
                start_time=float(w_seg["start"]),
                end_time=float(w_seg["end"]),
                source="upload",
            )

    def index_segment(
        self,
        content: str,
        speaker_role: str,
        patient_name: str = "",
        speaker_label: str = "",
        session_id: str = "",
        start_time: float = 0.0,
        end_time: float = 0.0,
        source: str = "upload",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        clean_text = content.strip()
        if not clean_text:
            raise ValueError("Cannot index an empty transcript segment.")
        embedding = self.embed_model.encode(clean_text).tolist()
        payload = {
            "content": clean_text,
            "embedding": embedding,
            "speaker_role": speaker_role.strip().upper() or "PATIENT",
            "patient_name": patient_name.strip(),
            "speaker_label": speaker_label.strip(),
            "session_id": session_id,
            "start_time": start_time,
            "end_time": end_time,
            "source": source,
        }
        response = self.supabase.table("clinical_segments").insert(payload).execute()
        records = response.data or []
        return records[0] if records else payload

    def transcribe_audio_bytes(self, audio_bytes: bytes, filename: str = "chunk.wav") -> list[dict[str, Any]]:
        if not audio_bytes:
            raise ValueError("Audio bytes are empty.")

        suffix = os.path.splitext(filename)[1] or ".wav"
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
                tmp_file.write(audio_bytes)
                tmp_path = tmp_file.name

            with open(tmp_path, "rb") as file:
                transcription = self.groq_client.audio.transcriptions.create(
                    file=(filename, file.read()),
                    model="whisper-large-v3",
                    response_format="verbose_json",
                )

            segments = []
            for seg in transcription.segments:
                segments.append(
                    {
                        "start": float(seg["start"]),
                        "end": float(seg["end"]),
                        "text": seg["text"].strip(),
                    }
                )
            return segments
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)
        return [] # Fallback return if something unexpected happens

    def _fetch_segments(
        self, role_filter: str = "ALL", session_id: str | None = None, patient_name: str | None = None
    ) -> list[dict]:
        query = self.supabase.table("clinical_segments").select(
            "id, session_id, patient_name, speaker_label, speaker_role, content, "
            "start_time, end_time, source, embedding"
        )
        if role_filter != "ALL":
            query = query.eq("speaker_role", role_filter)
        if session_id:
            query = query.eq("session_id", session_id)
        if patient_name:
            query = query.eq("patient_name", patient_name)
        response = query.execute()
        return response.data or []

    @staticmethod
    def _cosine_similarity(a: list[float], b: list[float]) -> float:
        if not a or not b or len(a) != len(b):
            return -1.0
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(y * y for y in b))
        if norm_a == 0.0 or norm_b == 0.0:
            return -1.0
        return dot / (norm_a * norm_b)

    def search_segments(
        self, query_text: str, top_k: int = 5, role_filter: str = "ALL",
        session_id: str | None = None, patient_name: str | None = None,
    ) -> list[dict[str, Any]]:
        segments = self._fetch_segments(role_filter=role_filter, session_id=session_id, patient_name=patient_name)
        if not segments:
            return []

        q_embedding = self.embed_model.encode(query_text).tolist()
        
        bm25 = BM25Retriever()
        bm25.fit(segments)
        bm25_scores = bm25.get_scores(query_text)

        scored: list[dict[str, Any]] = []
        for i, seg in enumerate(segments):
            semantic_score = self._cosine_similarity(q_embedding, seg.get("embedding", []))
            b_score = bm25_scores[i]
            
            # Hybrid rank: Combine Semantic (approx -1 to 1) and BM25 linearly.
            hybrid_score = semantic_score + (b_score * 0.1)
            
            scored.append(
                {
                    "id": seg.get("id"),
                    "session_id": seg.get("session_id", ""),
                    "patient_name": seg.get("patient_name", ""),
                    "speaker_label": seg.get("speaker_label", ""),
                    "speaker_role": seg.get("speaker_role"),
                    "content": seg.get("content"),
                    "start_time": seg.get("start_time", 0.0),
                    "end_time": seg.get("end_time", 0.0),
                    "source": seg.get("source", ""),
                    "semantic_score": semantic_score,
                    "bm25_score": b_score,
                    "score": hybrid_score,
                }
            )

        scored.sort(key=lambda x: x["score"], reverse=True)
        # Using a loop instead of a slice to satisfy specific type-checker configurations
        top_results: list[dict[str, Any]] = []
        for i in range(min(top_k, len(scored))):
            top_results.append(scored[i])
        return top_results

    def answer_question(
        self, question: str, top_k: int = 5, role_filter: str = "ALL", session_id: str | None = None, patient_name: str | None = None
    ) -> tuple[str, list[dict[str, Any]]]:
        retrieved = self.search_segments(
            query_text=question, top_k=top_k, role_filter=role_filter, session_id=session_id, patient_name=patient_name
        )
        if not retrieved:
            return "No indexed segments found for this query.", []

        context = "\n".join(
            [
                f"- [Speaker: {seg['speaker_role']}] [Label: {seg.get('speaker_label', '')}] [Time: {seg.get('start_time', 0.0):.2f}-{seg.get('end_time', 0.0):.2f}] (Score={seg['score']:.3f}) {seg['content']}"
                for seg in retrieved
            ]
        )
        prompt = f"""
Answer the question using ONLY the retrieved transcript segments below.
If the answer is not present in the retrieved segments, you MUST say "Not enough evidence in retrieved segments."
Do not use any outside knowledge.
When you provide an answer, you MUST explain your reasoning by citing the specific speaker and timestamp from the segments.

Question:
{question}

Retrieved Segments:
{context}
"""
        completion = self.groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
        )
        return completion.choices[0].message.content, retrieved

    def get_full_transcript(self, session_id: str | None = None, patient_name: str | None = None) -> str:
        print("\n--- Fetching full speaker-separated transcript ---")
        query = (
            self.supabase.table("clinical_segments")
            .select("session_id, speaker_label, speaker_role, content, start_time, end_time, source")
            .order("id", desc=False)
        )
        if session_id:
            query = query.eq("session_id", session_id)
        if patient_name:
            query = query.eq("patient_name", patient_name)
        response = query.execute()

        transcript_text = ""
        records = response.data or []
        for record in records:
            ts = f"{record.get('start_time', 0.0):.2f}s–{record.get('end_time', 0.0):.2f}s"
            label = record.get('speaker_label', '')
            label_str = f" ({label})" if label else ""
            line = f"[{record['speaker_role']}{label_str}] [{ts}]: {record['content']}"
            print(line)
            transcript_text += line + "\n"
        return transcript_text

    def generate_clinical_summary(self, transcript: str) -> str:
        print("\n--- Generating LLM summary ---")
        prompt = f"""
Summarize the following clinical interview.
Focus on patient concerns and clinician observations.
Based on the transcript, also generate a proactive clinical follow-up plan (e.g., tests to order, lifestyle changes, medications) using your medical reasoning.

TRANSCRIPT:
{transcript}

SUMMARY FORMAT:
1. Patient Reported Symptoms:
2. Clinician Observations/Questions:
3. Recommended Follow-up Plan:
"""
        completion = self.groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
        )
        return completion.choices[0].message.content

    def evaluate_retrieval(self, qrels_path: str, top_k: int = 5) -> dict[str, Any]:
        with open(qrels_path, "r", encoding="utf-8") as f:
            qrels = json.load(f)

        if not isinstance(qrels, list):
            raise ValueError("Evaluation file must be a JSON list of query specs.")

        overall = []
        by_role: dict[str, list[dict]] = {}

        for item in qrels:
            query_text = item.get("query", "").strip()
            relevant_contents = set(item.get("relevant_contents", []))
            role_filter = item.get("role_filter", "ALL")

            if not query_text or not relevant_contents:
                continue

            retrieved = self.search_segments(
                query_text=query_text, top_k=top_k, role_filter=role_filter
            )
            retrieved_contents = [r["content"] for r in retrieved]
            hits = sum(1 for c in retrieved_contents if c in relevant_contents)

            precision = hits / top_k if top_k > 0 else 0.0
            recall = hits / len(relevant_contents) if relevant_contents else 0.0

            result = {
                "query": query_text,
                "role_filter": role_filter,
                "precision_at_k": precision,
                "recall_at_k": recall,
                "hits": hits,
            }
            overall.append(result)
            by_role.setdefault(role_filter, []).append(result)

        def avg(values: list[float]) -> float:
            return sum(values) / len(values) if values else 0.0

        overall_summary = {
            "num_queries": len(overall),
            "avg_precision_at_k": avg([r["precision_at_k"] for r in overall]),
            "avg_recall_at_k": avg([r["recall_at_k"] for r in overall]),
        }
        role_summary = {}
        for role, results in by_role.items():
            role_summary[role] = {
                "num_queries": len(results),
                "avg_precision_at_k": avg([r["precision_at_k"] for r in results]),
                "avg_recall_at_k": avg([r["recall_at_k"] for r in results]),
            }

        return {"overall": overall_summary, "by_role": role_summary, "details": overall}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Clinical IR audio pipeline")
    parser.add_argument("--audio-file", default="audio.wav", help="Path to interview audio file")
    parser.add_argument(
        "--ingest",
        action="store_true",
        help="Run diarization + transcription + indexing before summary generation",
    )
    parser.add_argument("--search-query", help="Run semantic retrieval for a query")
    parser.add_argument("--qa-query", help="Answer question grounded in retrieved segments")
    parser.add_argument("--evaluate-file", help="Path to qrels JSON for Precision@K/Recall@K")
    parser.add_argument("--top-k", type=int, default=5, help="Top K for retrieval/evaluation")
    parser.add_argument(
        "--role-filter",
        choices=["ALL", "PATIENT", "CLINICIAN", "OTHER"],
        default="ALL",
        help="Restrict retrieval by speaker role",
    )
    return parser.parse_args()


def main() -> None:
    load_dotenv()
    args = parse_args()
    roles = {"SPEAKER_00": "CLINICIAN", "SPEAKER_01": "PATIENT"}

    bot = ClinicalIRSystem()

    if args.ingest:
        bot.process_audio_file(args.audio_file, roles)

    if args.search_query:
        print(f"\n--- SEARCH RESULTS (top {args.top_k}, role={args.role_filter}) ---")
        results = bot.search_segments(
            query_text=args.search_query, top_k=args.top_k, role_filter=args.role_filter
        )
        if not results:
            print("No segments found.")
            return
        for idx, r in enumerate(results, start=1):
            label = f" ({r.get('speaker_label', '')})" if r.get('speaker_label') else ""
            print(f"{idx}. [{r['speaker_role']}{label}] {r.get('start_time', 0.0):.2f}s–{r.get('end_time', 0.0):.2f}s score={r['score']:.3f} | {r['content']}")
        return

    if args.qa_query:
        print(f"\n--- QA (top {args.top_k}, role={args.role_filter}) ---")
        answer, supporting = bot.answer_question(
            question=args.qa_query, top_k=args.top_k, role_filter=args.role_filter
        )
        print("\nAnswer:\n")
        print(answer)
        print("\nSupporting Segments:\n")
        for idx, seg in enumerate(supporting, start=1):
            print(f"{idx}. [{seg['speaker_role']}] score={seg['score']:.3f} | {seg['content']}")
        return

    if args.evaluate_file:
        print(f"\n--- EVALUATION @K={args.top_k} ---")
        summary = bot.evaluate_retrieval(args.evaluate_file, top_k=args.top_k)
        print(json.dumps(summary, indent=2))
        return

    full_transcript = bot.get_full_transcript()
    if not full_transcript.strip():
        print("No segments found in 'clinical_segments'. Run with --ingest first.")
        return
    summary = bot.generate_clinical_summary(full_transcript)
    print("\n--- CLINICAL SUMMARY ---\n")
    print(summary)


if __name__ == "__main__":
    main()
