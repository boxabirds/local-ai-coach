"""Priya's letter on a hosted model, as the reference line for the job table.

Same request and papers as run.py, three runs. Reads OPENAI_API_KEY from the
environment and never prints it. Prints JSON: for each run the letter, the model
the service reports, time to the first word, wall time and token usage.
Usage: python3 hosted.py [model] < materials.md
"""

import json
import os
import sys
import time
import urllib.request

RUNS = 3
# The hosted model accepts only its default temperature, so none is sent (the local runs used 0.7).
URL = "https://api.openai.com/v1/chat/completions"
MATERIALS = sys.stdin.read()


def prompt():
    request = MATERIALS.split("## The request (Priya's words, from chapter 0)")[1].split("##")[0].strip()
    rest = MATERIALS.split("## Extract from the tenancy agreement")[1]
    return f"{request}\n\nHere are the papers.\n\n## Extract from the tenancy agreement{rest}"


def one(model, seed, text):
    body = {"model": model, "stream": True, "stream_options": {"include_usage": True}, "seed": seed,
            "messages": [{"role": "user", "content": text}]}
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers={
        "Content-Type": "application/json", "Authorization": "Bearer " + os.environ["OPENAI_API_KEY"]})
    started = time.time()
    first = None
    parts, usage, reported = [], None, None
    with urllib.request.urlopen(req, timeout=300) as resp:
        for raw in resp:
            line = raw.decode().strip()
            if not line.startswith("data: ") or line == "data: [DONE]":
                continue
            chunk = json.loads(line[len("data: "):])
            reported = chunk.get("model", reported)
            usage = chunk.get("usage") or usage
            for choice in chunk.get("choices", []):
                piece = choice.get("delta", {}).get("content")
                if piece:
                    if first is None:
                        first = time.time() - started
                    parts.append(piece)
    letter = "".join(parts)
    return {"seed": seed, "letter": letter, "reported_model": reported, "first_word_s": round(first or 0, 2),
            "wall_s": round(time.time() - started, 2), "words_out": len(letter.split()), "usage": usage}


def main(model):
    text = prompt()
    print(json.dumps({"model": model, "runs": [one(model, seed, text) for seed in range(1, RUNS + 1)]}, indent=1))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "chat-latest")
