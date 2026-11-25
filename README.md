# Tojo Remix Studio
## v0.1.0 — separation milestone
Static browser experiment. Select an audio file, run a real MDX model locally and audition/export the two stems. No upload of the selected audio is implemented, no API key. Model/runtime assets are fetched externally; CDN module and Hugging Face availability are required on first use. No Eurobeat arrangement, BPM change or generative music yet.

### Run
GitHub Settings → Pages → Deploy from a branch → main / (root) → Save. Open the published HTTPS URL in Safari or Chrome. Start with a 15-second clip; choose the clip start where singing is present. First model download about 67 MB. Keep tab in foreground. Use WASM if WebGPU fails. The runtime is not validated on iPhone yet; long tracks can exceed browser memory. Browser preview via local HTTP/HTTPS server is also possible, but file:// is not supported.

### Implementation
- web-audio-separation 0.3.1 via esm.sh, ONNX Runtime Web 1.29.0 dependency.
- UVR-MDX-NET-Voc_FT and Kim_Vocal_2, both vocal-primary according to upstream registry documentation. Manual swap provided in case output order differs.
- Native Web Audio API and PCM16 WAV clip/export. No vocal effects; separation and format conversion can introduce artifacts.
- Upstream: https://github.com/incidentist/web-audio-separation (MIT code). Model-weight licensing and remix rights require separate review before commercial use.
- Diagnostic log reports actual errors; indeterminate progress rather than simulated percent.

### Acceptance test
1. Open hosted app on iPhone Safari and import a song.
2. Choose 15 s with a sung passage. Separate; check two audibly distinct outputs.
3. Export both WAV files and verify playback in Files.
4. Repeat with WASM if automatic provider fails. Copy diagnostics if error.
5. Only after validated separation, implement music analysis and Eurobeat arrangement.

No browser end-to-end test performed yet. CDN integration and stem order must be verified on target device.