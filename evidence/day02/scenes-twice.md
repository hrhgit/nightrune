# Same seed, same picture

`npm run scenes` run twice on main at a1f6641 (8 scenes x 3 viewports), each into its own folder; SHA-1 of every PNG compared with `diff`. Result: 24 of 24 identical. Run by hand on 2026-11-18; not part of CI (needs a browser).

```
6e5ae6768c72a462eaeb61cdc9cd0a8a8b549496  ./desktop/bolt-flying.png
207007085936932ae69a75ce1a5792a62220ef1f  ./desktop/full-lines.png
e322442a06a00a21a08e04313b6ed5759f5fd3b7  ./desktop/low-hp.png
82f4923696dbd9906e08ac492939828ddb8ab8c8  ./desktop/opening.png
0429f22bc1e116517930ab78484e1128a811767a  ./desktop/parry-block.png
678126bf9a57a03c1b04b30cdf9c2b042cdd4f92  ./desktop/partial-block.png
aec8e3463c3c36929304733a3dd356078d8f01fb  ./desktop/placing.png
0157f3bf1b41589a91b7b98d66d818de63596d73  ./desktop/trade-hits.png
f4c32ed646c5bd169095e496cad9851e9dd031df  ./phone-reduced-motion/bolt-flying.png
9fc8878606407c1985d99f968d71a1b5b56e7fa2  ./phone-reduced-motion/full-lines.png
d1e2cd5c4b3b1bfaa0728c3e551df478a437e436  ./phone-reduced-motion/low-hp.png
527c2f46c1bdf200acc964a7e79ed9c5ec8efb69  ./phone-reduced-motion/opening.png
6b49ec3d11142faa6b3f5f0042ab0c3263ea36f5  ./phone-reduced-motion/parry-block.png
c21e4ce0c78bef48a5513e1ff84de3470e8e5431  ./phone-reduced-motion/partial-block.png
cdf483cc2c9550dace2864bd875c05a624420c52  ./phone-reduced-motion/placing.png
2971835d557b27f0a8f15da26eebbbb5bf8c6a7a  ./phone-reduced-motion/trade-hits.png
e221978f9b4669452dfafa55ca5818a008e54122  ./phone/bolt-flying.png
bb1a515eeccadb5ec51a2042e1ca87c6b26af433  ./phone/full-lines.png
40b587e4d982b79f4e414336006c0d9240e9d2c2  ./phone/low-hp.png
ae426a4f4ef1ef055b935b8dd88e036a270676ed  ./phone/opening.png
6303abb15d7bc458f907397d32450fdca51a515b  ./phone/parry-block.png
937aa62bf37b072a4de26945302f1815b84f0f8f  ./phone/partial-block.png
04daa865457b80ea253b932ce332d47c756c83b0  ./phone/placing.png
b05dbcf317e4a621f07b646ec6281067ab3c3319  ./phone/trade-hits.png
```
