import re, csv, pickle, collections, json
lessons,tid=pickle.load(open('lessons.pkl','rb'))
W={'both':1.0,'numerator':0.5,'denominator':0.5}
def w(l): return W.get(l['parity'],1.0)
TT=lambda l: bool(re.match(r'^[ՀՄ]*ՏՏ$',l['faculty_letters']))
tt=[l for l in lessons if TT(l)]
def key(l): return f"{l['source_file']}|{l['group_code_original']}"
# ---- template groups ----
byg=collections.defaultdict(list)
for l in tt: byg[key(l)].append(l)
tg=[]; cur=[]
for k,ls in byg.items():
    f=ls[0]
    labs=[int(l['subgroup_no']) for l in ls if l['lesson_type']=='lab' and l['subgroup_no']]
    prs=[int(l['subgroup_no']) for l in ls if l['lesson_type']=='practical' and l['subgroup_no']]
    day=collections.defaultdict(set)
    for l in ls: day[l['weekday']].add(l['pair'])
    subj={l['subject'] for l in ls if l['subject']}
    tg.append(dict(template_id=k,source_file=f['source_file'],study_form=f['study_form'],year_of_study=f['year_of_study'],
        group_code_original=f['group_code_original'],faculty_letters=f['faculty_letters'],admission_digit=f['admission_digit'],
        specialty_code=f['specialty_code'],students=f['students'],lessons=len(ls),distinct_subjects=len(subj),
        observed_lab_parts=max(labs) if labs else 0,observed_practical_parts=max(prs) if prs else 0,
        days_used=len(day),max_pairs_in_a_day=max(len(v) for v in day.values()),
        weekly_pair_load=round(sum(w(l) for l in ls),1)))
def dump(name,rows):
    with open(f'data/{name}.csv','w',newline='',encoding='utf-8-sig') as f:
        wr=csv.DictWriter(f,fieldnames=list(rows[0])); wr.writeheader(); wr.writerows(rows)
    print(name,len(rows))
dump('template_groups',tg)
# ---- curriculum templates ----
agg=collections.defaultdict(lambda: dict(weight=0.0,sub=set(),teachers=set(),rooms=set(),n=0,per_sub=collections.defaultdict(float)))
meta={}
for l in tt:
    subj=l['subject'] or '(unknown)'
    k=(key(l),subj,l['lesson_type']); a=agg[k]
    a['weight']+=w(l); a['n']+=1
    a['per_sub'][l['subgroup_no'] or '0']+=w(l)
    if l['subgroup_no']: a['sub'].add(l['subgroup_no'])
    a['teachers'].update(t for t in l['teacher_ids'].split(';') if t)
    a['rooms'].update(r for r in l['rooms'].split(';') if r)
    meta[key(l)]=l
rows=[]
for (k,subj,typ),a in sorted(agg.items()):
    m=meta[k]
    per=sorted(a['per_sub'].values()); ppw=round(sum(per)/len(per),2)
    rows.append(dict(template_id=k,study_form=m['study_form'],year_of_study=m['year_of_study'],specialty_code=m['specialty_code'],
        subject=subj,lesson_type=typ,subgroup_count=len(a['sub']) if a['sub'] else 1,
        pairs_per_week_per_subgroup=ppw,implied_semester_hours=round(ppw*32),
        parity_note='part_time_parity_unknown' if m['study_form']=='part_time' else 'weekly=1, alternating=0.5',
        teacher_ids=';'.join(sorted(a['teachers'])),rooms_seen=';'.join(sorted(a['rooms'])),slot_entries=a['n']))
dump('curriculum_templates',rows)
# ---- teachers ----
T=collections.defaultdict(lambda: dict(entries=0,load=0.0,subjects=set(),types=collections.Counter(),groups=set()))
for l in lessons:
    for t in [x for x in l['teacher_ids'].split(';') if x]:
        a=T[t]; a['entries']+=1; a['load']+=w(l); a['types'][l['lesson_type']]+=1
        if l['subject']: a['subjects'].add(l['subject'])
        a['groups'].add(l['group_code_original'])
trows=[dict(teacher_id=t,entries=a['entries'],weekly_pairs_est=round(a['load'],1),distinct_subjects=len(a['subjects']),
            distinct_groups=len(a['groups']),lecture=a['types']['lecture'],practical=a['types']['practical'],lab=a['types']['lab'])
       for t,a in sorted(T.items())]
dump('teachers_pseudonymized',trows)
# ---- subjects ----
S=collections.defaultdict(lambda: dict(groups=set(),types=collections.Counter(),years=set(),specs=set()))
for l in tt:
    if not l['subject']: continue
    a=S[l['subject']]; a['groups'].add(key(l)); a['types'][l['lesson_type']]+=1; a['years'].add(l['year_of_study']); a['specs'].add(l['specialty_code'])
srows=[dict(subject=s,in_templates=len(a['groups']),years=';'.join(map(str,sorted(a['years']))),specialties=';'.join(sorted(a['specs'])),
            lecture=a['types']['lecture'],practical=a['types']['practical'],lab=a['types']['lab']) for s,a in sorted(S.items(),key=lambda x:-len(x[1]['groups']))]
dump('subjects',srows)
# ---- roster -> template mapping ----
groups=list(csv.DictReader(open('data/groups.csv',encoding='utf-8-sig')))
tid_by=collections.defaultdict(list)
for t in tg: tid_by[(t['study_form'],int(t['year_of_study']),t['specialty_code'])].append(t)
byspec=collections.defaultdict(list)
for t in tg: byspec[(t['study_form'],t['specialty_code'])].append(t)
mp=[]
for g in groups:
    if g['program_level']!='bachelor' or g['is_empty']=='1':
        mp.append(dict(group_code=g['group_code'],students=g['students'],match_level='not_applicable',template_ids='',note='master or empty group: no template source'));continue
    form=g['study_form']; yos=int(g['year_of_study']); sp=g['specialty_code']
    c=tid_by.get((form,yos,sp),[])
    if c: lvl='exact'; note=''
    else:
        c=[t for t in byspec.get((form,sp),[]) if abs(int(t['year_of_study'])-yos)<=1]
        if c: lvl='nearest_year_same_specialty'; note='year differs by 1'
        else:
            c=byspec.get((form,sp),[]); lvl='other_year_same_specialty' if c else 'none'; note='' if c else 'no template for this specialty'
    mp.append(dict(group_code=g['group_code'],students=g['students'],year_of_study=yos,study_form=form,specialty_code=sp,match_level=lvl,
                   template_ids=';'.join(t['template_id'] for t in c),note=note))
for r in mp: r.setdefault('year_of_study','');r.setdefault('study_form','');r.setdefault('specialty_code','')
dump('group_template_map',mp)
print("mapping levels:",collections.Counter(r['match_level'] for r in mp))
# ---- config ----
times=[('1',"09:30","10:50"),('2',"11:00","12:20"),('3',"12:50","14:10"),('4',"14:20","15:40"),('5',"15:50","17:10"),('6',"17:20","18:40")]
with open('data/pair_times.csv','w',newline='',encoding='utf-8-sig') as f:
    wr=csv.writer(f); wr.writerow(['pair','label','start','end','kind']); 
    labels=['1-2','3-4','5-6','7-8','9-10','11-12']; kinds=['ordinary']*4+['part_time_ordinary','temporary_extra_only']
    for (p,a,b),lb,k in zip(times,labels,kinds): wr.writerow([p,lb,a,b,k])
json.dump(dict(weeks_per_semester=16,academic_hours_per_pair=2,first_week='numerator',alternation='numerator,denominator,...',
    holidays_shift_parity=False,ordinary_pairs_full_time=4,ordinary_pairs_part_time=5,
    subgroup_target_sizes=dict(lab='13-16',practical='19-23'),hours_to_pairs='pairs_per_week = semester_hours / 32 (16 weeks x 2h)'),
    open('data/calendar_config.json','w'),indent=2,ensure_ascii=False)
