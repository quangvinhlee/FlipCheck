# FlipCheck demo production

A roughly 110-second, 1920×1080 product film: real app interaction footage,
animated opening and architecture sequence, cursor highlights, photo gallery,
Australian English synthetic narration, captions and a quiet original score.

## Build

Run from the repository root with the app running at `http://127.0.0.1:3030`.
Requires existing real listings, Python with Pillow and NumPy, Node dependencies,
`uv`, FFmpeg, ffprobe, and Playwright Chromium/video support.

```sh
python3 scripts/demo/voice.py
npx playwright install ffmpeg
node scripts/demo/capture.cjs
python3 scripts/demo/render.py
python3 scripts/demo/finish.py
```

`CHROMIUM_PATH` and `DEMO_URL` can override local browser and app paths.
`SCENES=nearby,evidence node scripts/demo/capture.cjs` records only those scenes.
The capture selectors target the real camera listings present during this build;
adapt them if the workspace changes. The script does not seed data.

Generated files are in ignored `artifacts/demo/`:

- `flipcheck-demo.mp4`: upload-ready H.264/AAC, 1080p, 24 fps, burned captions
  plus an embedded English subtitle track.
- `flipcheck-demo.srt`: separate timed captions.
- `index.html`: local playback page; `poster.jpg`: thumbnail.
- `narration.wav`, `score.wav`, individual clips and source speech for editing.

For browser playback, serve the output directory:

```sh
python3 -m http.server 8040 --bind 127.0.0.1 --directory artifacts/demo
```

## Editorial and privacy boundaries

The public narration is in `storyboard.json`. `voice.py` sends that text to
Microsoft Edge's online TTS service through `edge-tts`, using
`en-AU-WilliamNeural`. It does not send app records or credentials. The score is
synthesised locally from simple tones and contains no third-party music sample.

Capture blocks all non-GET API requests, so it cannot save search changes,
change listing decisions, or launch paid discovery jobs. It uses previously
fetched real listings and shows the app's actual missing-evidence states.
Coordinates are blurred during recording. No shell, environment file, tokens,
or account console is recorded. Seller photos retain their owners' rights.

First-user feedback is paraphrased, with no invented quotation, payment,
measured time saving, or completed user trial. Repair/parts valuation is labelled
as future work. The video is generated locally; upload the MP4 to your preferred
video host if you prefer an embedded player. A copy of the finished MP4, captions,
and poster is checked into `docs/demo/` and linked from the submission.
