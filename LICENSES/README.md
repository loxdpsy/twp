# Licences of the parts of Atlas Translation

This folder holds the licence texts for the third-party parts that Atlas Translation uses. The notes and credits for each
part are in [NOTICE.md](../NOTICE.md). The project itself is licensed under MPL-2.0 ([LICENSE](../LICENSE)).

| Part | Licence | Text |
| --- | --- | --- |
| Atlas Translation, the extension and the Atlas Helper; the original TWP code | MPL-2.0 | [LICENSE](../LICENSE) |
| pdf.js 4.10.38 (`lib/pdfjs/`) | Apache-2.0 | [Apache-2.0.txt](Apache-2.0.txt) |
| sherpa-onnx runtime (k2-fsa), read-aloud engine | Apache-2.0 | [Apache-2.0.txt](Apache-2.0.txt) |
| Kokoro v1.1 voice (hexgrad) | Apache-2.0 | [Apache-2.0.txt](Apache-2.0.txt) |
| Kitten nano 0.2 voice (KittenML) | Apache-2.0 | [Apache-2.0.txt](Apache-2.0.txt) |
| Piper voice Sam (rhasspy/piper-voices) | Apache-2.0 | [Apache-2.0.txt](Apache-2.0.txt) |
| PP-OCRv4 text recognition models (PaddleOCR), packaged by RapidOCR | Apache-2.0 | [Apache-2.0.txt](Apache-2.0.txt) |
| espeak-ng phoneme data (`espeak-ng-data/` inside the Piper and Kokoro archives) | GPL-3.0 | [GPL-3.0.txt](GPL-3.0.txt) |
| Piper voice Joe | CC0 1.0 | [CC0-1.0.txt](CC0-1.0.txt) |
| Piper voice Cori (en_GB) | CC BY 4.0 | [CC-BY-4.0.txt](CC-BY-4.0.txt) |
| Piper voice John | Public domain (LibriVox recordings) | none needed; credit in NOTICE.md |
| Supertonic 3 voice (Supertone Inc.) | BigScience Open RAIL-M (use restrictions) | [OpenRAIL-M.txt](OpenRAIL-M.txt) |
| Supertonic 3 sample code | MIT | [MIT.txt](MIT.txt) |
| Mozilla root certificates (`webpki-roots` crate, used by the helper for HTTPS) | CDLA-Permissive-2.0 | [CDLA-Permissive-2.0.txt](CDLA-Permissive-2.0.txt) |
| Rust crates of the Atlas Helper | MIT, Apache-2.0 and the other licences on the allowlist in `tools/atlas-updater/deny.toml` | checked in CI by the Licences workflow; the crates' own licence files |

## Notes on the GPL-3.0 phoneme data

The phoneme data comes from espeak-ng. It is inside the voice archives that the helper downloads from the k2-fsa
sherpa-onnx release. The helper does not change that data. The source of espeak-ng is at
https://github.com/espeak-ng/espeak-ng. This is a plain summary of the licence, not legal advice.
