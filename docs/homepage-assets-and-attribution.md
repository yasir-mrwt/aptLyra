# Homepage assets and attribution

The public footer reads `© 2026 Aptlyra. All rights reserved.` This website-footer copy does not replace the repository's MIT license or third-party asset licenses.

## Code provenance

The inherited PrepTalk code's MIT notice is preserved in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). The maintainer edited the root LICENSE; that edit is committed unchanged. The homepage footer does not replace the retained notices.

## Display typeface

Space Grotesk is self-hosted at `frontend/public/fonts/SpaceGrotesk-variable.ttf`, downloaded unmodified from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/spacegrotesk). Its copyright and SIL Open Font License 1.1 are included alongside it in `SpaceGrotesk-OFL.txt`. The original font is 136,676 bytes; `font-display: swap` preserves immediate readable fallback text. Existing body typography and navbar styling are retained.

## Hero animation

[Video Explainer by Sherjeel Javed](https://lottiefiles.com/free-animation/video-explainer-YUwaiFcnZ4) is distributed under the [Lottie Simple License](https://lottiefiles.com/page/license). The maintainer supplied the exact JSON after the download site blocked automated access. `frontend/public/animations/video-explainer.json` preserves the original bytes. `video-explainer-aptlyra.json` is the generated derivative, and `video-explainer-poster.svg` is its static frame 45. All three retain the same asset license in `animations/LICENSE.txt`; an accessible Animation credits & license link in the footer opens those notices. The website footer does not restrict these asset rights.

Run `node scripts/recolor-hero.mjs` to reproduce the derivative. It changes 125 static paint properties: green shirt/pot accents become logo cyan (`#67E8F9`), green shadows and red call-control accents become logo indigo (`#818CF8`), plant/table outlines use logo pale cyan (`#A5F3FC`), and background details use existing surface tokens. Skin tones, facial/hair details, device neutrals, paths, keyframes and timing are preserved. This is layer-paint editing, not a CSS filter. The supplied file contains no external image resources or expressions; all selected paint properties are editable.

Original SHA-256: `451103da544fbf596e11cbed07119117a6562f683e6e7730a076a2846075e59c`.
Adapted SHA-256: `e40ea28982254ec9818dde99dc46f5f2babff8ecb7b5b22a7634012428181932`.

The only added dependency is `lottie-web@5.13.0` (MIT). Its expression-free light renderer loads asynchronously. Playback loops while visible, supports Space to pause/resume, pauses outside the viewport or in a hidden tab, and is destroyed on navigation. Reduced-motion preference uses the static SVG without fetching the player or animation JSON. A failed player/data request retains that same accessible static illustration. Fixed aspect ratio reserves layout space.

## Controls and accessibility

Actual planner fields and payloads are unchanged. Native selects retain keyboard and platform behavior; border/focus transitions are decorative and disabled for reduced motion. Optional company/date context is grouped in a native details disclosure. Three signed-in practice shortcuts link to planning, question submission, and history (or editorial review only when the current account has verified reviewer access). They do not change roles. Existing Team Access and other navbar guards remain authoritative.

The site currently has a dark theme without a light-theme switch. Light system preference should not hide content or alter control readability. Do not describe this as a tested separate light theme.
