# Required motion identity

The shipped motion derives from the exact Higgsfield MP4 specified in the approved workflow:

https://d3u0tzju9qaucj.cloudfront.net/234da064-93ed-416b-92bf-1844ab071271/597fe905-d0ab-4bc6-bbc2-a892b95a0bcb.mp4

Downloaded on 2026-10-07. Original: 5,743,748 bytes, 1280×720, 24 fps, approximately 5.04 seconds. SHA-256: `61f164dce95b5e39e9f9a53f3fa9e2876d1f14eef1e886609ede4ea42f37aec9`.

The complete motion sequence was transcoded to H.264 MP4 at 720×406, CRF 27, 24 fps, with fast-start metadata and no audio. The approximately 2 kb/s source audio stream is omitted in the decorative, muted identity presentation. No new imagery was generated or substituted. A still at one second serves as the poster. The hero displays the wide frame in a centered crop, with explicit play/pause. The video starts paused for every visitor, including reduced-motion users.

Reproduction, given the downloaded original and FFmpeg:

```sh
ffmpeg -i identity-original.mp4 -vf 'scale=720:-2' -c:v libx264 -crf 27 -preset medium -an -movflags +faststart web/public/media/identity.mp4
ffmpeg -ss 1 -i web/public/media/identity.mp4 -frames:v 1 -q:v 3 web/public/media/identity-poster.jpg
```

| Delivered asset | SHA-256 |
| --- | --- |
| `web/public/media/identity.mp4` | `6c97a9b33d636bef889f49697ab442412d2ced0dcf9f0a44a53095047cef3084` |
| `web/public/media/identity-poster.jpg` | `5ac4016a3ccd02776df484250960a920d0dfd6b325ba40a4fb28056e969f1a6d` |

The same bytes are exported under `dist/media/` and inventoried in the deployment manifest. The large original and FFmpeg installation remain scratch inputs and are not submitted. Keeping the full motion locally avoids reliance on the supplied CDN object's expiration and keeps the entire submission under its byte budget.
