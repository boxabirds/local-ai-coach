"""Priya's letter at three model sizes (Book 1 chapter 2 evidence).

Runs on the machine with Ollama: python3 run.py <ollama url> <models...>
Each model gets the same request and materials, three times, with thinking off.
Prints JSON: for each run the letter and Ollama's own timings, and each model's
memory in use from /api/ps. Standard library only; writes nothing.
"""

import json
import sys
import time
import urllib.request

RUNS = 3
MATERIALS = sys.stdin.read()


def call(url, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url + path, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as resp:
        return json.loads(resp.read())


def main(url, models):
    request = MATERIALS.split("## The request (Priya's words, from chapter 0)")[1].split("##")[0].strip()
    rest = MATERIALS.split("## Extract from the tenancy agreement")[1]
    prompt = f"{request}\n\nHere are the papers.\n\n## Extract from the tenancy agreement{rest}"
    out = []
    for model in models:
        runs = []
        for seed in range(1, RUNS + 1):
            started = time.time()
            r = call(url, "/api/chat", {"model": model, "stream": False, "think": False,
                                        "messages": [{"role": "user", "content": prompt}],
                                        "options": {"seed": seed, "temperature": 0.7}})
            runs.append({
                "seed": seed,
                "letter": r["message"]["content"],
                "wall_s": round(time.time() - started, 2),
                "load_s": round(r.get("load_duration", 0) / 1e9, 2),
                "first_word_s": round((r.get("load_duration", 0) + r.get("prompt_eval_duration", 0)) / 1e9, 2),
                "words_out": len(r["message"]["content"].split()),
                "tokens_out": r.get("eval_count"),
                "tokens_per_s": round(r["eval_count"] / (r["eval_duration"] / 1e9), 1) if r.get("eval_duration") else None,
            })
        loaded = next((m for m in call(url, "/api/ps").get("models", []) if m["name"].startswith(model)), {})
        out.append({"model": model, "memory_gb": round(loaded.get("size", 0) / 1e9, 1),
                    "on_gpu_gb": round(loaded.get("size_vram", 0) / 1e9, 1), "runs": runs})
    print(json.dumps({"prompt": prompt, "results": out}, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
