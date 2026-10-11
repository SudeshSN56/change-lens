"""Voiceover: one clip per line of script.txt -> public/audio/line01.mp3, line02.mp3, ..., and each clip's
duration -> timings.json. The narration is continuous: line i starts PAUSE after line i-1 ends, after a
short LEAD of music on the logo, and the last line holds END_HOLD on the end card. Intro.jsx builds the
scene timing from timings.json.

Engines:
  kokoro (default)  Kokoro-82M, open weights (Apache-2.0), runs locally. Lives in its own venv so its
                    packages never touch the project's .venv:
                      py -3.11 -m venv --system-site-packages .venv-voice
                      .venv-voice\\Scripts\\python.exe -m pip install kokoro==0.9.4 soundfile==0.14.0 transformers==4.51.3
                    Voices: af_heart, af_bella, am_michael, bf_emma, ... (first letter = accent: a US, b UK).
  fish              Fish Audio API (voice = reference_id). Key from FISH_API_KEY in .env, never printed.
                    Needs API credit, which Fish bills separately from the app subscription.

  .venv-voice\\Scripts\\python.exe gen_voice.py --voice af_heart            all lines
  .venv-voice\\Scripts\\python.exe gen_voice.py --voice af_heart --only 1   one line
Without --voice/--engine/--speed, the values saved in timings.json by the last run are used.
"""
import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUDIO = HERE / "public" / "audio"
TIMINGS = HERE / "timings.json"
BIN = HERE / "node_modules" / "@remotion" / "compositor-win32-x64-msvc"  # ffmpeg/ffprobe ship with Remotion
LEAD = 0.5  # seconds of music on the logo before the first word
PAUSE = 0.2  # breath between lines (each clip also keeps ~0.18 s of its own edges), so the voice never stops
END_HOLD = 1.5  # the end card stays still this long after the last word


def api_key():
    env = HERE / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "FISH_API_KEY" and value.strip():
                return value.strip().strip("\"'")
    sys.exit("FISH_API_KEY is missing from startup-intro/.env")


def fish(text, voice, speed, path):
    body = {"text": text, "reference_id": voice, "format": "mp3", "mp3_bitrate": 192, "prosody": {"speed": speed}}
    req = urllib.request.Request(
        "https://api.fish.audio/v1/tts", data=json.dumps(body).encode(), method="POST",
        headers={"Authorization": f"Bearer {api_key()}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            path.write_bytes(resp.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"Fish API error {e.code}: {e.read().decode('utf-8', 'replace')[:300]}")


_pipelines = {}


def kokoro(text, voice, speed, path):
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline

    lang = voice[0]  # a = American English, b = British English
    if lang not in _pipelines:
        _pipelines[lang] = KPipeline(lang_code=lang, repo_id="hexgrad/Kokoro-82M")
    sr = 24000
    audio = np.concatenate([r.audio.numpy() for r in _pipelines[lang](text, voice=voice, speed=speed)])
    # Kokoro pads about 0.3 s before and 0.45 s after the speech; keep 60 ms / 120 ms so the voice starts on
    # the cut and PAUSE is the real gap before the next one.
    loud = np.flatnonzero(np.abs(audio) > 0.02 * np.abs(audio).max())
    audio = audio[max(0, loud[0] - int(0.06 * sr)) : loud[-1] + int(0.12 * sr)]
    # same speech level on every line: -16 dBFS RMS over the voiced samples, peaks kept under -1 dBFS
    voiced = audio[np.abs(audio) > 0.02 * np.abs(audio).max()]
    audio = audio * min(10 ** (-16 / 20) / np.sqrt(np.mean(voiced**2)), 0.89 / np.abs(audio).max())
    wav = path.with_suffix(".wav")
    sf.write(wav, audio, sr)
    subprocess.run([str(BIN / "ffmpeg.exe"), "-v", "error", "-i", str(wav), "-c:a", "libmp3lame", "-b:a", "192k", "-y", str(path)], check=True)
    wav.unlink()


def duration(path):
    out = subprocess.run(
        [str(BIN / "ffprobe.exe"), "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return round(float(out.stdout.strip()), 3)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--engine", choices=["kokoro", "fish"])
    ap.add_argument("--voice", help="kokoro voice name or Fish reference_id")
    ap.add_argument("--speed", type=float, help="speaking rate, 1.0 = normal")
    ap.add_argument("--only", type=int, help="regenerate just this line number (after a full run)")
    args = ap.parse_args()

    lines = [l.strip() for l in (HERE / "script.txt").read_text(encoding="utf-8").splitlines() if l.strip()]
    old = json.loads(TIMINGS.read_text(encoding="utf-8")) if TIMINGS.exists() else {}
    entries = old.get("lines") or []
    if len(entries) != len(lines):
        if args.only:
            sys.exit("--only needs a full run first: timings.json does not match script.txt")
        entries = [None] * len(lines)
    engine = args.engine or old.get("engine") or "kokoro"
    voice = args.voice or old.get("voice")
    speed = args.speed or old.get("speed") or 1.0
    if not voice:
        sys.exit("pass --voice: no voice is saved in timings.json yet")
    AUDIO.mkdir(parents=True, exist_ok=True)

    for i, text in enumerate(lines, 1):
        if args.only and i != args.only:
            continue
        path = AUDIO / f"line{i:02d}.mp3"
        (kokoro if engine == "kokoro" else fish)(text, voice, speed, path)
        d = duration(path)
        gap = END_HOLD if i == len(lines) else PAUSE
        entries[i - 1] = {"file": path.name, "duration": d, "length": round(d + gap, 3)}
        print(f"{path.name}  {d:5.2f} s  {text}")

    total = round(LEAD + sum(e["length"] for e in entries), 3)
    timings = {"engine": engine, "voice": voice, "speed": speed, "lead": LEAD, "lines": entries, "total": total}
    TIMINGS.write_text(json.dumps(timings, indent=2) + "\n", encoding="utf-8")
    print(f"total {total:.2f} s")


if __name__ == "__main__":
    main()
