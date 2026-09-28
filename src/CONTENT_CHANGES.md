# Content changes, 28 Sep 2026 (council content half)

Base: commit debe6e2. Engine files (app.core.js, scenes.js, speaking.js, body.html, style.css) untouched.

Invariants kept (checked against HEAD): deck ids and array order unchanged, no deck word added; 1,484 existing sentences keep id and position, 50 appended; anchors keep ids; the 12 existing scenes keep ids; the 91 words he has met keep their ord; stage and tier unchanged; every ord unique.

Pipeline (each script is idempotent, run from the repo root):
`src/tools/content_0928.py`, `forms_0928.py`, `link_sentences.py`, `reorder_0928.py`, `link_sentences.py` again (its containment rule reads ord), `examples_0928.py`, then `audio_todo_0928.py`. Shared modules: `cdata.py` (writes each JSON file byte for byte in its stored style), `spoken.py`, `romaji_rules.py`.

## Schema additions (for the engine)

| Field | Where | Meaning |
|---|---|---|
| `sy` | deck card, emitted by build.py (not stored) | spoken English, present only when it differs from `en`. 633 cards. Sentences and anchors: none differ, so none carry it |
| `sq` | deck card, emitted by build.py | spoken English collides with another card's (case and punctuation ignored): never ask English to Japanese by voice. 75 cards in 36 groups |
| `needs` | deck, c0252 c0253 c0254 c0601 c0602 c0603 | verb ids, any one of which unlocks the pattern card |
| `rec` | deck, 8 cards | staff-only phrase, recognition only: c1783 kashikomarimashita, c0641 irasshaimase, c0872 omatase shimashita, c0991 shoushou omachi kudasai, c1784 gozaimasu, c1758 mei (staff counter), c0312 itterasshai, c0314 okaerinasai |
| `pk` | sentence, 1 to 33 | survival pack order; every pack sentence also has `say:1` |
| `pairs.json` | src/deck, emitted as `<script type="application/json" id="pairs-data">` | `[{id:"pp001", p:[particle id, particle id], s:[sentence id, sentence id]}]`, 30 pairs |
| form names | conj/forms.json | see K |

## A. Spoken English (his item, #1)
- `src/tools/spoken.py` `spoken_en(en)`: drops `(...)` and `[...]` (but `(not)` becomes `not`), `~` and the fullwidth tilde, trailing register notes (`, polite`, `, said by staff`, `, used by staff`, `, everyday`, `, the long formal one...`, `, a step less formal`, `, the one word casual version`); `a / b / c` becomes `a, b or c`; `;` becomes `,`; commas inside numbers kept. Hand fixes in `OVERRIDE` (looks like, judging by appearance; possessive, of; o'clock; I want to; let's; and, with; towards, to).
- build.py imports it, emits `sy` and `sq`, and refuses any `sy` containing `~ ( ) [ ] / ;`. The audio renderer should import the same function.

## B. Sentence links (#5) and C. pattern cards
- New linker `src/tools/link_sentences.py` (the legacy one plus fixes). 554 old sentences changed `w`; gap maps recomputed for all of them (105 `g` actually differ).
- sumu (c0576) removed from every sumimasen sentence (28 links before, 5 genuine now). wa removed from s480, s481, nE036. ima living room (c0923) now in 0 sentences (11 before; "now" is c0061). kaze wind (c0538) only in the 2 wind sentences; cold sentences link c0729. Double ni: 251 before, 1 now (nB024, where both occur). ni (two) kept in 11 sentences where it is a number.
- Verb forms recognised: -mashou, -masen ka, -tai, -takunai, -nai, -nakatta, -nakereba, -naide, -nakute, te, te mo, plain past, -tara, -ba, potential (+ masen, ru, nai); ikemasen after te wa / nai to / nakereba / nakute is not iku. Number and counter fusions (gohyaku, shichinin, nibansen, juuissai, nihai), honorific o- nouns (onamae, omizu, osara, ohashi), o + stem + kudasai (omachi kudasai), suru-compound nouns, nan as nani, kamo shiremasen. 121 old sentences gained a verb link.
- Homophone and inflection clashes resolved by the sentence's English (with hint words per sense), then particle over noun, then a default sense; a phrase card matched exactly beats a verb matched by inflection (sumimasen, wakarimasen, hayaku, chikaku).
- C: pattern cards linked wherever used (before, then after): masen ka 1 to 20, mashou 1 to 27, tai desu 1 to 39, ga arimasu 39 to 51, ga imasu 13, temo ii desu ka 1 to 31 (mo, ii, ii desu, desu, ka swallowed; c0241 mo never credited), nakereba narimasen 1 to 23, koto ga dekimasu 13 to 14.
- Guards: the "deck word a sentence uses" guard now calls the linker's own recognition (`guard_unlinked`), which knows all the forms above; it would have rejected 97 of the old sentences. New guard `guard_twins`: two same-romaji cards in one `w` only if the sound occurs twice (fused numbers count). The inflected-adjective guard accepts a token that is itself a linked card (hayaku) or a linked homophone twin (atsui).

## D. Pattern cards (#7)
`needs`: masen ka c0252 [iku, taberu, nomu, miru]; mashou c0253 [iku, taberu, nomu, kaeru]; tai desu c0254 [iku, taberu, nomu, kau, miru]; temo ii desu ka c0601 [miru, taberu, toru, tsukau]; nakereba narimasen c0602 [iku, kaeru, kau]; koto ga dekimasu c0603 [taberu, kau, hanasu, tsukau]. Guard: every `needs` id is a verb.

## E. Introduction order (#3)
`src/tools/reorder_0928.py`, simulation saved in `src/tools/reorder_0928_sim.json`. Unmet words re-sequenced greedily by trip lines made sayable (say/pack/"you" lines weight 3, "them" lines 1.5, others 0.1), a verb in every 3 slots, at most 1 number/counter/calendar word per 3, 25 essentials pinned every third slot (all inside the first 64 slots), scene words needed to open every scene inside the first 159 slots, second meanings (ima living room, hashi bridge, kaeru change, kiru cut, kaze wind, shita tongue, atsui weather) moved past the trip window (slot 744+), same-romaji words at least 30 slots apart (closest: iru, 107). The unmet words reuse the ord values they held.

Simulation from his save (91 words met), before = old order, same new content:

| At 30 Nov | 3/day, 53 intake days: before | after | 3/day at 78% of days: before | after |
|---|---|---|---|---|
| words met | 250 | 250 | 214 | 214 |
| verbs met | 28 | 49 | 25 | 42 |
| say lines fully sayable (of 225) | 102 | 123 | 75 | 107 |
| scene "you" lines sayable (of 60) | 31 | 47 | 25 | 41 |
| scenes rehearsable (of 17) | 5 | 17 | 1 | 7 |
| essentials missed (of 25) | 18 | 0 | 23 | 0 |
| pack phrases sayable (of 33) | 18 | 24 | 14 | 23 |

Scene open day at 3/day: before 16 to 341; after 23 to 53 (all 17 by day 53, 20 Nov).

## F. Content errors (#15)
nC001 "No thanks, I don't need this one." (refusal; no longer the example for kore or ii desu); c0330 ii desu gloss adds "no thanks (declining)"; nS050 "Thank you for your custom." and links arigatou gozaimashita c0315; c0665 yonde kudasai "please call / please read it", example nA033 takushii o yonde kudasai; c0218 mou "now; already; (not) any more"; nB014 "Is this all right?"; c0876 okanjou example now contains okanjou; nH021 asa sanpo o shimasu; nJ011 dochiraka erande kudasai (Please choose either one); s247 ashita, eki de aimashou (Let's meet...); namae example s037 style (now nF003, no kimi); s364 ore to watashi; s473 nakunarimashita (passed away); anchor g022 shinde to yonde kudasai (yobu, bu to nde) and g025 oyoide to isoide kudasai (isogu, gu to ide); nS005 juugonichi made desu (Until the 15th.); nS030 ryoushuusho o kudasai (A formal receipt, please.), so it no longer duplicates nA011.

## G. Staff-only phrases (#16): `rec:1` on the 8 cards listed above.

## H. Particle minimal pairs (#8)
`src/deck/pairs.json`, 30 pairs: 22 from the existing nC series plus 8 travel pairs using 13 new sentences nQ001 to nQ013 (de/ni koko ni tomete kudasai, kara/made airport bus, ka/ne tooi desu, de/ga genkin, ga/mo ocha, e/made eki, o/ga dare yobimashita ka, wa/ga kore takai). Guard: ids resolve, p are particle cards, token lists differ in exactly one token and that token pair is the pair's particles, English differs.

## I. Survival pack (#17)
33 sentences with `pk` 1 to 33 and `say:1`: nA114, nA112, nA113, nA116, nA122, nE004 (for c0345), nA001 (for c0346), nA004 (for c0031), nA124, nA009, nP001, nH162, nS008, nA067, nA069, nA071, nP002, nP003, s408, nS039, nA028, nA029, nP004, nA034, nA098, nG005, nA129, nA094, nA089, nA096, nA092, nG018, nP005. New: nP001 menzei dekimasu ka, nP002 mirin ya osake wa haitte imasu ka, nP003 haraaru desu ka, nP004 suika ni chaaji shitai desu, nP005 kuweeto kara kimashita. Guard: pk contiguous and unique, all say:1.

## J. Scenes (#18)
New sc13 Suica and the ticket gate (11 lines), sc14 Lost bag at the police box (10), sc15 Ordering with dietary needs (11), sc16 Convenience store lunch (11), sc17 Small talk (10). 32 new line sentences nT001 to nT032 (say:1 on his 14). sc05 now carries the three real staff questions (atatamemasu ka, pointo kaado wa omochi desu ka, fukuro wa goriyou desu ka) with replies; nB059 and nB030 left it to stay within 11 lines. Suica lines drop the watermelon link (suika) by override.

## K. Conjugation (#7, #47) and form-name changes
- Verbs: form `te` renamed `tekudasai`: kana te + ください, romaji te + " kudasai" (matte kudasai). 238 verbs carry it; 47 non-agentive verbs carry no request form (aru, dekiru, furu, shinu, kowareru, komaru ...).
- Adjectives: `past` (plain) removed; `neg` renamed `politeneg` and made polite (takakunai desu, shizuka ja arimasen); `politepast` and adjective `te` unchanged. Row is now politepast, politeneg, te.
- Non-volitional verbs: potential removed from 19 (shiru, odoroku, shinu, okoru, komaru, shinpai suru, nareru, kizuku, nayamu, nureru, hotto suru, mayou, yogoreru, makeru, oosugiru, shippai suru, chirakaru, kogeru, kusaru), tai removed from 12 (owaru, okoru, shinpai suru, nayamu, hotto suru, mayou, yogoreru, makeru, oosugiru, shippai suru, kogeru, kusaru). Build guard reads `NON_VOLITIONAL` and `NO_TEKUDASAI` from forms_0928.py.
- Suru compounds spaced everywhere (22 rows, 11 deck romaji: benkyou suru, souji suru ...).
- Anchors g019 to g030 are te kudasai phrases (form `tekudasai`, formEn "please form"); g031 to g038 are politepast or politeneg with polite kana.
- build.py `_NAMES` = masu, mashita, masen, masendeshita, potential, tekudasai, tai, politepast, politeneg, te; row length 9 to 21; verb rows may only carry verb names, adjective rows adjective names. 2,530 forms became 2,298.
- Engine labels to follow: `tekudasai` (was `te` "te-form" for verbs), `politeneg` (was `neg` "negative"), `past` no longer exists.

## L. Examples (#46)
`src/tools/examples_0928.py`: 201 of the first 400 words by ord re-pointed to the most readable sentence containing them (fewest later words, then fewest grammar patterns, then trip lines, then shorter); 222 examples differ from HEAD in all. Pinned c0665 to nA033. New written examples where a te-form-only sentence no longer passes the containment test: uru, tobu, yaku, seikou suru, shippai suru, kansha suru; plus ore and shinu (their sentences were rewritten).

## M. Romaji and English style (#54)
n' before a vowel or y: kin'youbi, ten'in, fudousan'ya (deck and 8 sentences); onegai shimasu spaced (c0482 and its example); hour counter joined (nH001, nH002, nH007, nH092); yen apart (s442 hyaku en); isshoni joined (5 sentences, 2 examples); sore kara spaced (s502); suru compounds spaced. Five example glosses lost their em dashes. Guards: apostrophe rule and spacing rules over deck, sentences, examples, anchors and forms; no em or en dash in any English field (deck en and sayE, sentence en, example en, anchor en, baseEn, formEn, use, rule, scene title and en).

## N. Guards
The two `_K.check_sentence(...)` asserts (written example, bound-counter say form) now test `[0] == 'OK'`. New: a written example must contain its word. Meta description now "A 1,812-word Japanese vocabulary trainer on the FSRS spaced repetition schedule."

## Tests
content_round5.js and scenes.js were updated to the new schema (tekudasai and politeneg known, tai rows at least 225, 17 scenes). round0928.js covers every council item and the audit fixes and runs in CI.

## O. Audit fixes (independent audit council, 28 Sep)
- c0218 mou: "now; already; one more; (not) any more" (the "one more" sense was missing). c0050 sayR "hyaku en desu" (yen apart).
- spoken.py OVERRIDE: iru "to be, for people and animals", aru "to be, for things", ni "two, the number" (they were identical to aru and futatsu once the notes were dropped).
- English word clips (we:) are drawn with a closing full stop (voice.py en_word): without it the voice swallowed final stops ("hot" heard as "huh", "light" as "lie"). All 1,812 we: clips redrawn and checked by transcription; redraws kept only when read back right (AUDIO_REPAIRED).
- Two sentence cards (nS025, nS045) reset once on load of a schema 6 save.
- Romaji joins for number plus counter in 12 sentences were tried and reverted: the linker reads "sanjuu do" as two cards and "sanjuudo" as none, which would have cut links.
