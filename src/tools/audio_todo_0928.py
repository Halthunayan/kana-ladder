# -*- coding: utf-8 -*-
"""Write src/AUDIO_TODO.json: every audio clip the 28 Sep 2026 content revision
invalidates, keyed exactly as audio/v1 sprites key them (sj:, se:, fj:, we:,
wj:, p:). Compares the working tree with the committed revision (git HEAD).

    python3 src/tools/audio_todo_0928.py [base-revision]
"""
import json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cdata
from spoken import spoken_en

REPO = os.path.dirname(cdata.ROOT)


def at(rev, path):
    return json.loads(subprocess.check_output(['git', '-C', REPO, 'show', '%s:src/%s' % (rev, path)]))


def main():
    rev = sys.argv[1] if len(sys.argv) > 1 else 'HEAD'
    od, nd = at(rev, 'deck/deck_full.json'), cdata.deck()
    os_, ns = at(rev, 'sentences/sent_full.json'), cdata.sents()
    of, nf = at(rev, 'conj/forms.json'), cdata.forms()
    O = {x['id']: x for x in os_}
    sj, se = [], []
    for x in ns:
        o = O.get(x['id'])
        if o is None or o['kana'] != x['kana']: sj.append('sj:' + x['id'])
        if o is None or o['en'] != x['en']: se.append('se:' + x['id'])
    fj, fj_retire = [], []
    for wid, row in nf.items():
        orow = of.get(wid)
        if orow == row: continue
        fj += ['fj:%s:%d' % (wid, k) for k in range(len(row) // 3)]
        if orow and len(orow) > len(row):
            fj_retire += ['fj:%s:%d' % (wid, k) for k in range(len(row) // 3, len(orow) // 3)]
    OD = {c['id']: c for c in od}
    wj = ['wj:' + c['id'] for c in nd if OD[c['id']]['kana'] != c['kana']]
    we_text = ['we:' + c['id'] for c in nd if spoken_en(c['en']) != OD[c['id']]['en']]
    out = {
        'generated_by': 'src/tools/audio_todo_0928.py against ' + rev,
        'key_format': 'as in audio/v1 sprite indexes: sj:<sentence id> (Japanese), se:<sentence id> (English), '
                      'fj:<word id>:<form index in the forms row>, we:<word id>, wj:<word id>, p:<prompt>',
        'sj': sj,
        'se': se,
        'fj': fj,
        'fj_retire': fj_retire,
        'fj_note': ('Every row listed changed (te became tekudasai, adjectives lost the plain past and gained '
                    'politeneg, non-volitional verbs lost potential or tai, suru compounds gained a space), so '
                    'form indexes moved: render each listed key from the current forms.json row, and drop the '
                    'fj_retire keys, which no longer exist.'),
        'wj': wj,
        'we': 'ALL: every we: clip is re-rendered from spoken_en(en) (src/tools/spoken.py, the "sy" field the '
              'build emits), by the audio engineer. we_text_changed lists the cards whose spoken text differs '
              'from the text the current clip was rendered from.',
        'we_text_changed': we_text,
        'anchors': 'No anchor clips exist: a conjugation anchor plays the fj: clip whose kana matches it, and '
                   'every anchor kana is present in its word\'s forms row (g019 to g030 as tekudasai, '
                   'g031 to g038 as politepast or politeneg).',
        'p': ('New car prompts are needed for the renamed forms once the engine names their labels: the '
              'tekudasai form (for example p:f-please form) and, if the engine labels politeneg as '
              '"polite negative", the existing p:f-polite negative serves. p:f-te-form, p:f-past and '
              'p:f-negative are no longer reached by verb or adjective rows.'),
        'counts': {'sj': len(sj), 'se': len(se), 'fj': len(fj), 'fj_retire': len(fj_retire), 'wj': len(wj),
                   'we_text_changed': len(we_text), 'we_total': len(nd)},
    }
    p = os.path.join(cdata.ROOT, 'AUDIO_TODO.json')
    open(p, 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
    print(out['counts'])


if __name__ == '__main__':
    main()
