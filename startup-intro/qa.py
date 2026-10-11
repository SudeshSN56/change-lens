"""QA for the rendered intro, read back from the MP4 itself:
- stream check (size, frame rate, duration, audio present),
- out/qa/contact.png: one decoded frame per second (at 0.5 s, 1.5 s, ...), labelled with time and voice line,
- out/qa/audio_sync.png: loudness of the final mix over time with the start of every voice line marked,
- per line, where the voice starts and stops inside its slot, and the gap before the next line.

Run after `npm run render`:  ..\\.venv\\Scripts\\python.exe qa.py [out/startup-intro.mp4]
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.io import wavfile

HERE = Path(__file__).resolve().parent
BIN = HERE / "node_modules" / "@remotion" / "compositor-win32-x64-msvc"  # Remotion ships ffmpeg/ffprobe here
OUT = HERE / "out" / "qa"
FPS = 60


def run(binary, *args):
    return subprocess.run([str(BIN / binary), "-v", "error", *map(str, args)], capture_output=True, check=True).stdout


def pcm(path, rate=8000):
    """Decode any audio/video file to mono float samples (via a temp wav: Remotion's ffmpeg has no raw muxer)."""
    tmp = OUT / "_decoded.wav"
    run("ffmpeg.exe", "-i", path, "-vn", "-ac", "1", "-ar", rate, "-c:a", "pcm_s16le", "-y", tmp)
    sr, x = wavfile.read(tmp)
    tmp.unlink()
    return x.astype(np.float64) / 32768, sr


def line_starts(timings):
    """Start of every voice line plus the film end, in seconds, rounded to frames exactly as Intro.jsx does."""
    lead = round(timings["lead"] * FPS)
    lengths = [round(l["length"] * FPS) for l in timings["lines"]]
    return (lead + np.concatenate([[0], np.cumsum(lengths)])) / FPS


def main():
    mp4 = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "out" / "startup-intro.mp4"
    timings = json.loads((HERE / "timings.json").read_text(encoding="utf-8"))
    cuts = line_starts(timings)
    OUT.mkdir(parents=True, exist_ok=True)

    info = json.loads(run("ffprobe.exe", "-show_entries", "stream=codec_type,width,height,r_frame_rate:format=duration", "-of", "json", mp4))
    video = next(s for s in info["streams"] if s["codec_type"] == "video")
    has_audio = any(s["codec_type"] == "audio" for s in info["streams"])
    duration = float(info["format"]["duration"])
    print(f"stream: {video['width']}x{video['height']} @ {video['r_frame_rate']} fps, {duration:.2f} s, audio: {has_audio}")
    print(f"expected: {cuts[-1]:.2f} s")

    # contact sheet
    for old in OUT.glob("f*.png"):
        old.unlink()
    # one exact seek per shot: Remotion's ffmpeg build has no fps/select filter
    shots = []
    for i, t in enumerate(np.arange(0.5, duration, 1.0)):
        shots.append(OUT / f"f{i:02d}.png")
        run("ffmpeg.exe", "-ss", f"{t:.3f}", "-i", mp4, "-frames:v", "1", "-vf", "scale=480:-1", "-y", shots[-1])
    cols, w, h, pad = 6, 480, 270, 30
    rows = -(-len(shots) // cols)
    sheet = Image.new("RGB", (cols * w, rows * (h + pad)), "#202020")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=20)
    for i, shot in enumerate(shots):
        t = 0.5 + i
        line = int(np.searchsorted(cuts, t, side="right"))  # 0 = the lead before the first word
        x, y = (i % cols) * w, (i // cols) * (h + pad)
        sheet.paste(Image.open(shot), (x, y + pad))
        draw.text((x + 8, y + 4), f"{t:.1f} s  line {line}", fill="#e0e0e0", font=font)
    sheet.save(OUT / "contact.png")
    print(f"contact sheet: {OUT / 'contact.png'} ({len(shots)} frames)")

    # loudness envelope of the mix, 20 ms windows, in dBFS
    x, rate = pcm(mp4)
    win = rate // 50
    n = len(x) // win
    rms = np.sqrt(np.mean(x[: n * win].reshape(n, win) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    W, H = 1800, 360
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    span = max(duration, cuts[-1])
    for level in (-12, -24, -36, -48):
        yy = int(H * (-level / 60))
        d.line([(0, yy), (W, yy)], fill="#eeeeee")
        d.text((4, yy - 16), f"{level} dB", fill="#999999", font=font)
    pts = [(int(i * win / rate / span * W), int(H * min(1, -v / 60))) for i, v in enumerate(db)]
    d.line(pts, fill="#3B6FD8", width=2)
    for k, c in enumerate(cuts[:-1]):
        xx = int(c / span * W)
        d.line([(xx, 0), (xx, H)], fill="#d33", width=1)
        d.text((xx + 4, 4), f"L{k + 1}", fill="#d33", font=font)
    img.save(OUT / "audio_sync.png")
    print(f"audio envelope: {OUT / 'audio_sync.png'}, peak {db.max():.1f} dBFS")

    # voice placement: speech inside each line's slot, and the silence before the next line starts
    for k, line in enumerate(timings["lines"]):
        v, vr = pcm(HERE / "public" / "audio" / line["file"], 16000)
        loud = np.flatnonzero(np.abs(v) > 0.05 * np.abs(v).max())
        on, off = loud[0] / vr, loud[-1] / vr
        slot = cuts[k + 1] - cuts[k]
        print(f"line {k + 1:2d}: speech {on:.2f}-{off:.2f} s of a {slot:.2f} s slot, {slot - off:.2f} s silent before the next line")


if __name__ == "__main__":
    main()
