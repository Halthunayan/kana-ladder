# -*- coding: utf-8 -*-
"""Read and write the content files in the exact style each is stored in, so a
content edit produces a diff of the lines that changed and nothing else."""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def R(*p): return os.path.join(ROOT, *p)

# path -> json.dumps keyword arguments that reproduce the stored file byte for byte
STYLE = {
    ('deck', 'deck_full.json'):     dict(ensure_ascii=False, separators=(',', ':')),
    ('deck', 'examples.json'):      dict(ensure_ascii=False, separators=(',', ':')),
    ('deck', 'pairs.json'):         dict(ensure_ascii=False, indent=1),
    ('sentences', 'sent_full.json'): dict(ensure_ascii=False),
    ('conj', 'anchors.json'):       dict(ensure_ascii=False, indent=1),
    ('conj', 'forms.json'):         dict(ensure_ascii=False, separators=(',', ':')),
    ('scenes', 'scenes.json'):      dict(ensure_ascii=False, indent=1),
}

def load(*p):
    return json.load(open(R(*p), encoding='utf-8'))

def save(obj, *p):
    kw = STYLE[tuple(p)]
    with open(R(*p), 'w', encoding='utf-8') as f:
        f.write(json.dumps(obj, **kw))

def deck(): return load('deck', 'deck_full.json')
def sents(): return load('sentences', 'sent_full.json')
def forms(): return load('conj', 'forms.json')
def anchors(): return load('conj', 'anchors.json')
def examples(): return load('deck', 'examples.json')
def scenes(): return load('scenes', 'scenes.json')
