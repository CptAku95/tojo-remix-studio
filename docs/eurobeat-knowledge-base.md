# TOJO Eurobeat production knowledge base v1.0
Research snapshot: 2026-11-26. Scope: Japanese/Italian high-energy Super Eurobeat-style remixes, not all Eurodisco. This is an engineering specification, not an assertion that all producers use identical rules.

## Non-negotiable project constraints
- Original instrumental remains the foundation and the original vocal remains aligned with it. Retain original harmonic and melodic identity; transform rhythm and timbre, never silently substitute an unrelated instrumental.
- Existing 30 s stem pair is the regression fixture; don't require repeated source separation.
- iPhone/Working Copy, CPU/WASM first, no subscription or remote audio upload; preserve three-card interface.
- Use editable and deterministic musical decisions. Keep existing mode as A/B reference.
- All sample assets must be original, user-provided with permission, or explicitly redistributable. Do not copy samples from tutorials or commercial recordings.

## Evidence and interpretation
S1 IWOLI/Mirai Studio Kanade, remix instrument breakdown: https://miraistudiokanade.com/howtoeurobeat01/
S2 IWOLI, brass sound design: https://miraistudiokanade.com/howtoeurobeat02/
S3 IWOLI, original melody to riff: https://miraistudiokanade.com/howtoeurobeat03/
S4 IWOLI, rhythmic adaptation continuation: https://miraistudiokanade.com/howtoeurobeat04/
S5 Hiy, instrument roles: https://masyaexample.hatenablog.com/entry/2023/03/22/004056
S6 Hiy, section structure: https://masyaexample.hatenablog.com/entry/2023/03/23/012500
S7 Hiy, drum programming: https://masyaexample.hatenablog.com/entry/2023/04/07/002209
S8 Hiy, riff construction: https://masyaexample.hatenablog.com/entry/2023/06/06/182352
S9 Odyssey Eurobeat, production resources and free PG-8X presets: https://odysseyeurobeat.com/pages/production
S10 Bratt Sinclaire, producer course index (not a transcript or verified listening analysis): https://www.brattsinclaire.com/how-i-made-it/
S11 DJ Command edition tutorial description: https://www.youtube.com/watch?v=IBYfBEaWz0Y
S12 David Dima edition tutorial description: https://www.youtube.com/watch?v=01q0Th2C4Bk
S13 SONAA general genre guide, secondary source: https://sonaa.ca/en/styles/disco/eurobeat/
S14 ONNX graph creation: https://onnx.ai/onnx/intro/python.html
S15 PyTorch export: https://docs.pytorch.org/docs/stable/onnx
S16 Web inference: https://onnxruntime.ai/docs/tutorials/web/build-web-app.html
S17 Community discussion on layering (anecdotal): https://www.reddit.com/r/eurobeat/comments/1kyquxu/
S18 Sakutoku arrangement and mix guide: https://sakutoku.jp/composition/eurobeat/
Read text and video descriptions, not audio/video playback. The numeric values below are TOJO proposed starting points, not measured commercial presets or literal transcriptions.

## A. Musical clock and source mapping
- 4/4 and 16-step bar grid; start at 155-160 BPM for racing, with variants slower/faster. Detect tempo octave errors and downbeat phase independently; permit manual corrections. Do not equate onset with bar one.
- Preserve sync by using common source-time mapping for stems: sourceTime = offset + outputTime * originalToTargetRatio; retain phrase pickup and avoid cutting consonants. Chord/time arrays must reference same offset.
- Current analysis gives rough chords and two Basic Pitch note lists. Bass/upper pitch grouping is not actual instrument identification. Confidence and coverage matter; repeated notes or bass harmonics may masquerade as lead.
- Separate sustained harmonic content from transients; retain original as dry/processed parallel layer. Current HPSS is approximate; do not claim it isolates drums. Prefer real bass/drum stems later if supported.

## B. Rhythm and sound library
Based on S1, S5, S7, S11-13. Each role gets its own gain, mute/solo, and deterministic event list. Proposed default MIDI-like steps (zero indexed):
- Kick: 0,4,8,12. Short punchy body plus click; synth sweep roughly 140 to 48 Hz, 100-160 ms decay, slight saturation; avoid long EDM sub tail.
- Snare/clap: 4,12; combine bright noise transient, short tuned body around 180-220 Hz, clap bursts; small gated room tail. Rare ghost/rim at 7 or 15, never replace core backbeat.
- Open hat: 2,6,10,14. Metallic oscillator/noise high-pass; choke with closed hat. Closed hat: other sixteenths, varying velocity, no accidental overlap with open. Add tambourine/rim only for higher energy.
- Bass: FM transient (sine carrier/modulator ratio 1:2 or 1:1, modulation index decays quickly) and filtered saw body, alternate root/octave in short 16ths. Use detected bass pitch class for each cell; choose stable overlapping note, reject weak isolated detections, fill brief gaps from last reliable note or chord root. Don't double octave harmonics blindly. Gate 55-80% of step; release 15-35 ms. Sidechain after kick with 60-100 ms recovery. Sub and bass centered.
- Upbeat: short bright chord/pluck at 2,6,10,14, high-pass 180 Hz, quieter than hook; add occasional syncopated 16th stabs. Distinct role from hat.
- Piano: bright digital attack/chord stab, chorus/verse accent; high-pass. Pad/string: gentle attack, sustained inversions, high-pass 180-250 Hz; keep background.
- Racing guitar: optional crunchy power fifths/palm-muted rhythm; approximate via bandlimited oscillators and saturation, not falsely claim real guitar. Use only if source/style warrants. Bell: alternate answer motif, especially melodic/melancholic style.
- FX: crash/impact at phrase starts; tom/snare fills on final beat of 4/8-bar phrases; occasional orchestral hit, rising sweep and short break before chorus or riff. No continuous random FX.

## C. Sabi / hook generator
S3, S4, S8 demonstrate rhythmic adaptation, call/response, layered lead, and phrase development. The following is TOJO's original proposed algorithm:
1. Collect upper-register note candidates and onset strengths; reject unstable short detections and likely octave harmonics of low notes. Extract monophonic contour by continuity, duration, confidence, and chord fit, not simply highest pitch.
2. Choose a 2-4-bar identifiable motif from original instrumental or vocal chorus (vocal notes for analysis only). Rank by recurrence, interval distinctiveness and coverage; use manually selected source interval if automatic confidence low.
3. Map to target beat grid, quantize gently to 8ths/16ths (including dotted 8ths). Preserve key pitches, interval contour, phrase accents. Do not replace source chord progression by genre cliché.
4. Develop into 8-bar hook: 4 bars motif A, 4 bars A' with a small ending variation; alternate lead and answer. Use silence/rests. If the original fragment is shorter, do not invent nonexistent sections.
5. Brass: centered bright voice plus two detuned side saw layers (roughly ±6-12 cents), optional octave, filtered envelope attack 3-12 ms, decay 80-180 ms, release 25-70 ms. Pitch scoop 20-70 cents on a few phrase accents, not every note. Add lower chord-tone harmony to selected sustained notes only; avoid parallel dissonance and dense sixteenth chords.
6. Contrasting answer: bell/pluck or guitar in spaces, never compete with vocal. Occasional brief 32nd run using chord tones at phrase end. Expose motif preview and editable note events.
7. Make hook recognizably derived from source; if confidence low, preserve original motif without synthesized lead or request manual edit instead of inventing a fixed arpeggio.

## D. Arrangement policy
S6 suggests recurring 8/16-bar phrases. Apply to full songs only after section inference; do not treat volume alone as verse/chorus. Provisional defaults:
- intro 8 bars: original motif teaser, filtered bass/beat, sweep toward hook.
- sabi 8 bars: full drum/bass, upfront instrumental hook, answer voice, stabs, short fills.
- A-melo 8-16 bars: vocal focus, restrained lead, bass and upbeat, light pad; no continuous lead doubling.
- B-melo 8 bars: tension, rising pad/arpeggio, chord stabs, transition fill.
- vocal chorus 8-16 bars: full bass/beat, wider harmony, brief synth responses between phrases; keep vocal clear.
- sabi reprise 8 bars: memorable hook returns with modest variation.
- bridge/solo/outro: optional, based on actual source or explicitly enabled extended arrangement. No mandatory key change.
Section inference: beat-synchronous chroma similarity + vocal activity + repeated phrase matching + onset/energy novelty. Label confidence; permit manual bar labels. For 30 s test, use 4/8-bar blocks and vocal activity without pretending to infer entire song.

## E. Mix and rendering
Proposed engineering defaults informed by S13 and S18, to be adjusted by listening:
- Use separate role buses, not one global instrumental gain. Apply gain before limiting; do not normalize each layer independently.
- Original instrumental: HPSS dry/wet adjustable; soften low band only when replacing bass. Avoid hollowing harmony; sidechain gently (2-4 dB) on kick if desired.
- Kick/bass mono; brass wide but verify mono compatibility. Vocal high-pass around 70-100 Hz if needed, gentle compressor 2:1-3:1, short plate 0.5-1 s, optional low-level tempo delay. Avoid artificial doubling if original already processed.
- Brass high-pass ~150 Hz, reduce harshness near 2-5 kHz if needed; short room/plate, restrained dotted/eighth delay; pads duck under vocal. Apply sidechain to bass/pad, not vocal.
- Peak guard/limiter; target peak <= -1 dBFS as first conservative digital test; do not claim true-peak or LUFS without implementing measurements. Keep stereo output and no NaN/clipping.
- Add output solo for original processed bed, new drums, new bass, new hook, other layers, vocal, complete mix. Export note event JSON/MIDI for debugging later.

## F. Implementation sequence and gates
1. Event scheduler (beat, bar, role, note, duration, velocity, source provenance); build role buses and preset schema. Preserve old generator as comparison. Unit-test time mapping and deterministic patterns.
2. Rebuild sound palette: FM bass, punchy drums, upbeat, brass, bell/pad; audition 8-bar instrumental demo with actual source chord/bass. No new AI needed. Test on iPhone.
3. Extract motif and use original melody as sabi. Compare source motif, new hook solo, and final mix; manual note correction when uncertain.
4. Add section-specific orchestration and actual repeated-phrase analysis; make short sample work before whole track.
5. Improve source separation (bass/drums/other) only if HPSS leaves masking or artifacts; benchmark local model memory and CPU. Model manager should validate file signatures and reuse WASM, no new unnecessary downloads.
6. Mixing/FX, full-track chunking, persistence, export. A/B evaluate at matched loudness.
Acceptance: user recognizes original song; a clearly audible memorable riff exists; no old/new drum conflict or dissonant added notes; tempo alignment through end; vocal remains intelligible; no clipping; iPhone does not reload. User listening verdict is primary, numeric tests secondary.

## G. Own ONNX model
ONNX is a serialized computation graph, not a training method. S14-16 show graph construction/export and browser inference. A hand-built graph can encode deterministic operations but is not a trained neural network. For actual ML, define architecture, train weights on appropriate data, export, check graph, compare outputs against training runtime and test CPU/WASM. Do not present random weights as useful AI.
Proposed first real model: Tojo Arranger, predicts section roles and instrument density or rhythmic pattern ID from beat-synchronous features (chroma, onset strength, bass activity, vocal activity, phrase similarity, note contour). Tiny MLP/temporal CNN, target under 1 MB as an engineering goal, not guaranteed. Outputs probabilities and pattern choices; rule engine validates harmony and handles rendering. Dataset: self-authored MIDI/patterns and permitted stems, split by song to avoid leakage; synthetic examples can bootstrap but require human listening and real validation. Export opset compatible with ORT 1.22, CPU, validate in Python and Working Copy. Only pursue once rule-based benchmark works; no training conducted yet.
A full audio-to-audio style-transfer model would need substantially more paired/legal data, compute, and architecture work; browser inference feasibility unknown. Not appropriate as immediate milestone.
