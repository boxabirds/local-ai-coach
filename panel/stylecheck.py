#!/usr/bin/env python3
"""Style check against the Julian Harris profile. Usage: stylecheck.py [--posts|--book] draft.txt
--posts: targets measured on the five newsletter posts (default for articles).
--book: targets measured on the Sam-tested chapters 0 and 1 (default for book chapters)."""
import re,sys,statistics as st
mode='book' if '--book' in sys.argv else 'posts'
args=[a for a in sys.argv[1:] if not a.startswith('--')]
t=open(args[0]).read()
POSTS=dict(ms=13.7,frag=17,one=66,con=1.8,I=1.9,you=1.8,we=0.17,intens=0.73,hedge=0.50,paren=1.1,ell=0.27,caps=0.32,emoji=0.43)
BOOK=dict(ms=13.1,frag=13.5,one=63,con=3.8,I=1.1,you=3.3,we=0.15,intens=0.44,hedge=0.52,paren=0.9,ell=0.18,caps=0.22,emoji=0.26)
G=BOOK if mode=='book' else POSTS
W=len(re.findall(r"[A-Za-z’']+",t))
sents=[len(s.split()) for line in t.split('\n') if line.strip() for s in re.split(r'(?<=[.!?…])\s+',line.strip())]
prose=[n for n in sents if n>=4]
paras=[p for p in re.split(r'\n\s*\n',t) if p.strip()]
pl=[len(re.split(r'(?<=[.!?])\s+',p.strip())) for p in paras]
r=lambda pat,f=re.I:100*len(re.findall(pat,t,f))/W
T={'mean sentence':(st.mean(prose),G['ms']),'fragments %':(100*sum(1 for n in sents if n<4)/len(sents),G['frag']),'1-sentence paras %':(100*sum(1 for x in pl if x==1)/len(pl),G['one']),
 'contractions':(r(r"\b\w+(’|')(t|s|re|ve|ll|d|m)\b"),G['con']),'I':(r(r'\b(I|me|my|mine)\b',0),G['I']),'you':(r(r'\b(you|your)\b'),G['you']),'we':(r(r'\b(we|our)\b'),G['we']),
 'intensifiers':(r(r'\b(absolutely|really|truly|massive(ly)?|astonishing|huge|very|incredibly|super|literally|crazy)\b'),G['intens']),'hedges':(r(r'\b(maybe|perhaps|probably|possibly|might|seems?|I think|roughly|about|a bit|quite)\b'),G['hedge']),
 'parentheses':(r(r'\('),G['paren']),'ellipsis':(r(r'…'),G['ell']),'CAPS':(r(r'\b[A-Z]{4,}\b',0),G['caps']),'emoji':(100*len(re.findall('[\U0001F300-\U0001FAFF]',t))/W,G['emoji']),'dashes':(r(r'—|–'),0)}
print(f"{W} words, targets: {mode}")
for k,(v,g) in T.items(): print(f"{k:22s} {v:6.2f}  target {g:5.2f}  {'ok' if (g==0 and v==0) or (g>0 and 0.5<=v/g<=2) else 'OFF'}")
tells=[r"genuinely",r"worth (noting|naming|knowing|chewing|sitting|reading)",r"it[’']s not .{1,40} it[’']s",r"stops being",r"the unlock",r"load-bearing",r"\bsit with\b",r"that actually matters",r"\bhonestly\b",r"the (part|bit) that",r"quiet win",r"—",r"–",r"\bsharp\b",r"\bis real\b",r"earns its keep",r"says this out loud",r"is doing work",r"rewards closer",r"the quiet one",r"catches .{1,20} off guard",r"refuse to do",r"\bnot a[n]? [^.]{1,40}\. not a[n]? ",r"\bnot a[n]? [^.,]{1,40}, not a[n]? ",r"\bhold (onto|on to|that|this)\b",r"let that .{0,10}hold",r"\b(carries|carry|carrying) (the|this|that|a lot of|most of the) ",r"\bcarry (this|that|it) with\b",r"\bcarries\b"]
hits=[(x,n) for x in tells if (n:=len(re.findall(x,t,re.I)))]
print("avoid-list hits:",hits or "none")
