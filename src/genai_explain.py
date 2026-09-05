import json
import urllib.request
import urllib.error
from src.config import Config

class GenAIExplainer:
    """GenAI LLM Assistant for probabilistic record linkage explanations."""
    
    @staticmethod
    def explain_candidate_pair(record1: dict, record2: dict, score: float, sims: dict) -> dict:
        gemini_key = Config.GEMINI_API_KEY
        openai_key = Config.OPENAI_API_KEY
        
        # 1. Try Gemini API if key is present
        if gemini_key:
            explanation = GenAIExplainer._call_gemini_api(record1, record2, score, sims, gemini_key)
            if explanation:
                return {
                    "source": "Gemini 1.5 Flash API",
                    "explanation": explanation,
                    "confidence_grade": GenAIExplainer._get_confidence_grade(score)
                }
                
        # 2. Try OpenAI API if key is present
        if openai_key:
            explanation = GenAIExplainer._call_openai_api(record1, record2, score, sims, openai_key)
            if explanation:
                return {
                    "source": "OpenAI GPT API",
                    "explanation": explanation,
                    "confidence_grade": GenAIExplainer._get_confidence_grade(score)
                }

        # 3. Fallback: Pure-python GenAI Heuristic Engine (zero-dependency, always works)
        explanation = GenAIExplainer._generate_heuristic_explanation(record1, record2, score, sims)
        return {
            "source": "ShieldHealth GenAI Clinical Logic Engine",
            "explanation": explanation,
            "confidence_grade": GenAIExplainer._get_confidence_grade(score)
        }

    @staticmethod
    def _get_confidence_grade(score: float) -> str:
        if score >= 0.85:
            return "HIGH CONFIDENCE (Auto-Merge Eligible)"
        elif score >= 0.70:
            return "MODERATE CONFIDENCE (Strong Match Candidate)"
        elif score >= 0.50:
            return "LOW-MODERATE CONFIDENCE (Ambiguous Match - Review Needed)"
        else:
            return "VERY LOW CONFIDENCE (Likely Distinct Children)"

    @staticmethod
    def _call_gemini_api(r1, r2, score, sims, api_key):
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
            prompt = (
                f"You are a public health record linkage AI assistant. Analyze this pair of child records:\n"
                f"Child A: {r1.get('first_name')} {r1.get('last_name')}, DOB: {r1.get('dob')}, Sex: {r1.get('sex')}, Mother: {r1.get('mother_name')}, Phone: {r1.get('phone')}, Cluster: {r1.get('cluster_id')}\n"
                f"Child B: {r2.get('first_name')} {r2.get('last_name')}, DOB: {r2.get('dob')}, Sex: {r2.get('sex')}, Mother: {r2.get('mother_name')}, Phone: {r2.get('phone')}, Cluster: {r2.get('cluster_id')}\n"
                f"Fellegi-Sunter Match Score: {score*100:.1f}%. Field similarities: {json.dumps(sims)}\n"
                f"Provide a concise 2-sentence clinical recommendation on whether these two records belong to the same child or distinct siblings."
            )
            data = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode("utf-8")
            req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=5) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                return res_data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except Exception:
            return None

    @staticmethod
    def _call_openai_api(r1, r2, score, sims, api_key):
        try:
            url = "https://api.openai.com/v1/chat/completions"
            prompt = (
                f"Analyze child record pair linkage (Score: {score*100:.1f}%):\n"
                f"Record A: {r1.get('first_name')} {r1.get('last_name')}, DOB: {r1.get('dob')}\n"
                f"Record B: {r2.get('first_name')} {r2.get('last_name')}, DOB: {r2.get('dob')}\n"
                f"Provide a 2-sentence review recommendation."
            )
            data = json.dumps({
                "model": "gpt-3.5-turbo",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 100
            }).encode("utf-8")
            req = urllib.request.Request(url, data=data, headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            })
            with urllib.request.urlopen(req, timeout=5) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                return res_data["choices"][0]["message"]["content"].strip()
        except Exception:
            return None

    @staticmethod
    def _generate_heuristic_explanation(r1, r2, score, sims) -> str:
        factors = []
        
        # Name analysis
        fn_sim = sims.get("first_name", 0)
        ln_sim = sims.get("last_name", 0)
        if fn_sim >= 0.85 and ln_sim >= 0.85:
            factors.append("Very high name similarity (likely phonetic misspelling or minor alias)")
        elif fn_sim >= 0.80:
            factors.append("Matching first name with variation in surname spelling")
        elif fn_sim < 0.60:
            factors.append("Mismatching first names (check for twin/sibling relationship)")

        # DOB analysis
        dob_score = sims.get("dob", 0)
        if dob_score == 1.0:
            factors.append("Exact match on Date of Birth")
        elif dob_score > 0.7:
            factors.append("Close Date of Birth (birth dates within a few weeks)")
        else:
            factors.append("Significant birth date offset (>30 days)")

        # Contact & Household
        if sims.get("phone") == 1.0:
            factors.append("Matching guardian contact phone number")
        if sims.get("household") == 1.0:
            factors.append("Registered in the same household unit")

        # Gender
        if sims.get("sex") == -1.0:
            factors.append("⚠️ Differing genders recorded (High probability of separate sibling records)")

        summary_reco = "Merge recommended if immunization cards match." if score >= 0.70 else "Verify physical health record before merging."
        return f"AI Analysis ({score*100:.1f}% Match): " + "; ".join(factors) + f". {summary_reco}"
