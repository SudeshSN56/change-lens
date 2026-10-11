"""Music bed and sound effects for the intro, synthesized with numpy/scipy (no samples, nothing licensed).

Writes public/audio/{music,type,click,whoosh,tone}.wav. Seeded, so reruns give identical files.
Run with the project venv:  ..\\.venv\\Scripts\\python.exe gen_audio.py
"""
import re
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

HERE = Path(__file__).resolve().parent
OUT = HERE / "public" / "audio"
SR = 48000
rng = np.random.default_rng(7)
# Key clicks must land on the frames where <Typed> reveals each character, so read its rate from the theme.
CPS = int(re.search(r"export const CPS = (\d+)", (HERE / "src" / "theme.js").read_text(encoding="utf-8")).group(1))


def t_axis(seconds):
    return np.arange(int(seconds * SR)) / SR


def hz(note):
    """MIDI note number -> frequency."""
    return 440.0 * 2 ** ((note - 69) / 12)


def lowpass(x, cutoff, order=2):
    return sosfilt(butter(order, cutoff, "low", fs=SR, output="sos"), x)


def bandpass(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def reverb(x, seconds=2.2, wet=0.28):
    """Convolution with decaying noise: a cheap, smooth room tail."""
    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (SR * seconds / 6.0))
    ir = lowpass(ir, 5000)
    tail = fftconvolve(x, ir)[: len(x)]
    tail *= np.max(np.abs(x)) / (np.max(np.abs(tail)) + 1e-9)
    return (1 - wet) * x + wet * tail


def save(name, x):
    x = np.asarray(x, dtype=np.float64)
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.89  # peak about -1 dBFS; the mix level is set in Intro.jsx
    OUT.mkdir(parents=True, exist_ok=True)
    wavfile.write(OUT / name, SR, (x * 32767).astype(np.int16))
    print(f"{name:11s} {x.shape[0] / SR:5.2f} s")


def music(seconds=60.0, bpm=96):  # longer than the film; Intro.jsx fades it out at the end
    """Soft ambient pad with a sub, a quiet echoing pluck and a faint pulse. Cmaj7 - Am9 - Fmaj7 - G6, two bars each."""
    t = t_axis(seconds)
    beat = 60 / bpm
    chord_len = 8 * beat
    chords = [  # MIDI notes: pad voicing, root for the sub
        ([48, 55, 59, 64, 67], 36),  # Cmaj7
        ([45, 52, 55, 59, 64], 33),  # Am9 (no root doubling up top)
        ([41, 48, 52, 57, 64], 29),  # Fmaj7
        ([43, 50, 55, 59, 64], 31),  # G6
    ]
    left = np.zeros_like(t)
    right = np.zeros_like(t)
    n_chords = int(np.ceil(seconds / chord_len)) + 1
    for k in range(n_chords):
        notes, root = chords[k % len(chords)]
        t0 = k * chord_len
        # raised-cosine window with long overlaps, so chords melt into each other
        w = np.clip((t - t0 + 1.5) / 3.0, 0, 1) * np.clip((t0 + chord_len + 1.5 - t) / 3.0, 0, 1)
        w = np.sin(w * np.pi / 2) ** 2
        if not w.any():
            continue
        for note in notes:
            f = hz(note)
            for cents, gain_l, gain_r in ((-5, 0.6, 0.4), (0, 0.5, 0.5), (5, 0.4, 0.6)):
                fc = f * 2 ** (cents / 1200)
                ph = rng.uniform(0, 2 * np.pi)
                s = np.sin(2 * np.pi * fc * t + ph) + 0.18 * np.sin(4 * np.pi * fc * t + ph)
                left += w * gain_l * s * 0.07
                right += w * gain_r * s * 0.07
        sub = np.sin(2 * np.pi * hz(root) * t) * w * 0.22
        left += sub
        right += sub
    left, right = lowpass(left, 2200), lowpass(right, 2200)

    # pluck: chord tones an octave up on eighth notes, with a dotted-eighth echo
    pluck = np.zeros_like(t)
    step = beat / 2
    for i in range(int(seconds / step)):
        at = i * step
        if at < 2.5:
            continue
        notes, _ = chords[int(at // chord_len) % len(chords)]
        f = hz(notes[[1, 2, 3, 2, 4, 3, 2, 1][i % 8]] + 12)
        n = int(0.9 * SR)
        s0 = int(at * SR)
        env = np.exp(-np.arange(n) / (0.22 * SR))
        seg = np.sin(2 * np.pi * f * np.arange(n) / SR) * env * (0.5 + 0.5 * rng.random())
        e = min(len(t), s0 + n)
        pluck[s0:e] += seg[: e - s0]
    pluck = lowpass(pluck, 3000) * 0.05
    d = int(0.75 * beat * SR)
    echo = np.zeros_like(pluck)
    echo[d:] = pluck[:-d] * 0.35
    left += pluck + echo * 0.6
    right += pluck * 0.8 + echo

    # faint pulse on beats 1 and 3
    pulse = np.zeros_like(t)
    n = int(0.25 * SR)
    tk = np.arange(n) / SR
    kick = np.sin(2 * np.pi * (48 + 40 * np.exp(-tk / 0.03)) * tk) * np.exp(-tk / 0.09)
    for i in range(int(seconds / (2 * beat))):
        at = i * 2 * beat
        if at < 5:
            continue
        s0 = int(at * SR)
        e = min(len(t), s0 + n)
        pulse[s0:e] += kick[: e - s0] * 0.12
    left += pulse
    right += pulse

    stereo = np.stack([reverb(left), reverb(right)], axis=1)
    fade = np.clip(t / 2.0, 0, 1)[:, None] * np.clip((seconds - t) / 3.0, 0, 1)[:, None]
    return stereo * fade


def typing(chars=64):
    """One soft key click every 1/CPS s, the first at t = 0."""
    x = np.zeros(int((chars / CPS + 0.2) * SR))
    n = int(0.03 * SR)
    tk = np.arange(n) / SR
    for k in range(chars):
        s0 = int(round(k / CPS * SR))
        tick = bandpass(rng.standard_normal(n), 1800, 6500) * np.exp(-tk / 0.0018)
        body = np.sin(2 * np.pi * rng.uniform(160, 220) * tk) * np.exp(-tk / 0.006) * 0.6
        x[s0 : s0 + n] += (tick * 0.5 + body) * rng.uniform(0.7, 1.0)
    return x


def click():
    tk = t_axis(0.08)
    return np.sin(2 * np.pi * 2100 * tk) * np.exp(-tk / 0.004) + 0.4 * bandpass(rng.standard_normal(len(tk)), 3000, 9000) * np.exp(-tk / 0.0015)


def whoosh(seconds=0.7, peak=0.3):
    """Noise through a sweeping band, loudest at `peak` s (the cut)."""
    tk = t_axis(seconds)
    noise = rng.standard_normal(len(tk))
    cutoff = 300 + 2600 * np.exp(-(((tk - peak) / 0.16) ** 2))
    a = 1 - np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros_like(noise)
    acc = 0.0
    for i, (v, ai) in enumerate(zip(noise, a)):  # one-pole low-pass with a moving cutoff
        acc += ai * (v - acc)
        y[i] = acc
    y = y - lowpass(y, 180)
    env = np.exp(-(((tk - peak) / 0.14) ** 2))
    return reverb(y * env, seconds=0.8, wet=0.2)


def tone():
    """Soft bell on C5 over G4, for the final logo."""
    tk = t_axis(3.0)
    x = np.zeros_like(tk)
    for f0, gain in ((hz(72), 1.0), (hz(67), 0.45)):
        for ratio, amp, decay in ((1, 1.0, 2.2), (2.0, 0.3, 1.1), (3.0, 0.1, 0.6), (4.07, 0.05, 0.35)):
            x += gain * amp * np.sin(2 * np.pi * f0 * ratio * tk) * np.exp(-tk / decay)
    x *= np.clip(tk / 0.008, 0, 1)
    return reverb(x, seconds=2.5, wet=0.3)


if __name__ == "__main__":
    save("music.wav", music())
    save("type.wav", typing())
    save("click.wav", click())
    save("whoosh.wav", whoosh())
    save("tone.wav", tone())
